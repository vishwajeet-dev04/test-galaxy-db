from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.quota_template import parse_t1_workbook
from app.schemas import UploadResult
from app.security import require_admin
from app.seed import seed_users

router = APIRouter()

_sync_state: dict = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "last_error": None,
}

IC_QUOTAS_PATH = settings.root / "config" / "ic_quotas.json"
QUOTA_RULES_PATH = settings.root / "config" / "quota_rules.json"
RTM_DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"]


class IcQuotaPerson(BaseModel):
    name: str = Field(min_length=1)
    division: str = ""
    type: str = "IC"
    reporting_manager: Optional[str] = None
    q1_quota: Optional[float] = 0
    q2_quota: Optional[float] = 0
    q3_quota: Optional[float] = 0
    q4_quota: Optional[float] = 0
    h1_quota: Optional[float] = None
    h2_quota: Optional[float] = 0
    annual_quota: Optional[float] = None


class QuotaSaveRequest(BaseModel):
    people: list[IcQuotaPerson]
    bu_annual_quotas: Optional[dict[str, dict[str, float]]] = None


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _run_parse() -> None:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    import build_quota_data  # type: ignore
    build_quota_data.build(output_path=settings.quota_json)


def _deal_counts() -> dict[str, int]:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    import deal_store  # type: ignore
    return deal_store.counts_by_quarter()


@router.get("/status")
@router.get("/uploads/status")
def admin_status(user: Annotated[User, Depends(require_admin)]):
    ic = {k: v for k, v in _load_json(IC_QUOTAS_PATH).items() if not str(k).startswith("_")}
    rtm = sum(1 for v in ic.values() if isinstance(v, dict) and v.get("division") in RTM_DIVISIONS)
    try:
        deals = _deal_counts()
    except Exception:
        deals = {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0}
    return {
        "deals": deals,
        "quota_count": len(ic),
        "rtm_count": rtm,
        "quota_json": {
            "path": str(settings.quota_json),
            "exists": settings.quota_json.exists(),
        },
        "source": "sqlite+config",
    }


@router.get("/quotas")
def get_quotas(user: Annotated[User, Depends(require_admin)]):
    raw = _load_json(IC_QUOTAS_PATH)
    people = []
    for name, cfg in raw.items():
        if name.startswith("_") or not isinstance(cfg, dict):
            continue
        people.append({
            "name": name,
            "division": cfg.get("division") or "",
            "type": cfg.get("type") or "IC",
            "reporting_manager": cfg.get("reporting_manager") or None,
            "q1_quota": cfg.get("q1_quota") or 0,
            "q2_quota": cfg.get("q2_quota") or 0,
            "q3_quota": cfg.get("q3_quota") or 0,
            "q4_quota": cfg.get("q4_quota") or 0,
            "h1_quota": cfg.get("h1_quota"),
            "h2_quota": cfg.get("h2_quota") if cfg.get("h2_quota") is not None else 0,
            "annual_quota": cfg.get("annual_quota"),
        })
    people.sort(key=lambda p: (p["division"] or "zzz", p["name"]))
    rules = _load_json(QUOTA_RULES_PATH)
    bu = {k: v for k, v in (rules.get("bu_annual_quotas") or {}).items() if not str(k).startswith("_")}
    return {"people": people, "bu_annual_quotas": bu}


@router.put("/quotas")
def save_quotas(
    body: QuotaSaveRequest,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    if not body.people:
        raise HTTPException(status_code=400, detail="At least one IC quota row is required")

    seen: set[str] = set()
    prev = _load_json(IC_QUOTAS_PATH)
    if not isinstance(prev, dict):
        prev = {}
    out: dict[str, Any] = {}
    for p in body.people:
        name = " ".join(p.name.split())
        if not name:
            continue
        if name in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate name: {name}")
        seen.add(name)
        existing = prev.get(name) if isinstance(prev.get(name), dict) else {}
        kept = {k: v for k, v in existing.items() if str(k).startswith("_")}
        # H1 / H2 / Annual are Finance-owned. Never derive them from Q1–Q4.
        h1 = float(p.h1_quota) if p.h1_quota is not None else 0.0
        h2 = float(p.h2_quota) if p.h2_quota is not None else 0.0
        annual = float(p.annual_quota) if p.annual_quota is not None else 0.0
        out[name] = {
            **kept,
            "division": p.division.strip(),
            "type": (p.type or "IC").strip() or "IC",
            "reporting_manager": (p.reporting_manager or "").strip() or None,
            "q1_quota": round(float(p.q1_quota or 0), 4),
            "q2_quota": round(float(p.q2_quota or 0), 4),
            "q3_quota": round(float(p.q3_quota or 0), 4),
            "q4_quota": round(float(p.q4_quota or 0), 4),
            "h1_quota": round(h1, 4),
            "h2_quota": round(h2, 4),
            "annual_quota": round(annual, 4),
        }

    _atomic_write_json(IC_QUOTAS_PATH, out)

    if body.bu_annual_quotas is not None:
        rules = _load_json(QUOTA_RULES_PATH)
        if not isinstance(rules, dict):
            rules = {}
        existing = rules.get("bu_annual_quotas") or {}
        comment = existing.get("_comment") if isinstance(existing, dict) else None
        cleaned: dict[str, Any] = {}
        if comment:
            cleaned["_comment"] = comment
        for bu, divs in body.bu_annual_quotas.items():
            if not bu or bu.startswith("_"):
                continue
            cleaned[bu] = {k: float(v) for k, v in (divs or {}).items() if not str(k).startswith("_")}
        rules["bu_annual_quotas"] = cleaned
        _atomic_write_json(QUOTA_RULES_PATH, rules)

    try:
        _run_parse()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Quotas saved but dashboard rebuild failed: {exc}") from exc

    seed_users(db)
    return {"ok": True, "message": f"Saved {len(out)} people and rebuilt dashboard", "count": len(out)}


@router.get("/templates/data")
def download_data_template(user: Annotated[User, Depends(require_admin)]):
    path = settings.files_dir / "Galaxy_Data_Templates.xlsx"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Galaxy_Data_Templates.xlsx is not in the files folder")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Galaxy_Data_Templates.xlsx",
    )


@router.post("/quotas/import")
def import_t1_template(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
):
    name = (file.filename or "").lower()
    if not name.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload the Finance .xlsx template (T1 sheet)")
    content = file.file.read()
    try:
        rows = parse_t1_workbook(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read workbook: {exc}") from exc

    body = QuotaSaveRequest(people=[IcQuotaPerson(**row) for row in rows])
    result = save_quotas(body, user, db)
    result["message"] = f"Imported {result['count']} people from {file.filename} and rebuilt dashboard"
    return result


@router.post("/reparse", response_model=UploadResult)
def reparse(user: Annotated[User, Depends(require_admin)], db: Annotated[Session, Depends(get_db)]):
    try:
        _run_parse()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Rebuild failed: {exc}") from exc
    seed_users(db)
    return UploadResult(ok=True, message="Dashboard data regenerated from SQLite deals + quotas", regenerated=True)


def _run_vtiger_sync(quarters: list[str], db_session_factory) -> None:
    _sync_state["running"] = True
    _sync_state["last_error"] = None
    try:
        scripts_dir = str(settings.root / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)

        from vtiger_sync import sync as vtiger_sync  # type: ignore

        if not settings.vtiger_url or not settings.vtiger_access_key:
            raise ValueError(
                "Vtiger credentials not configured. "
                "Set VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY in backend/.env"
            )

        counts = vtiger_sync(
            vtiger_url=settings.vtiger_url,
            username=settings.vtiger_username,
            access_key=settings.vtiger_access_key,
            quarters=quarters,
            run_parse=True,
        )

        from app.database import SessionLocal  # type: ignore
        db = SessionLocal()
        try:
            seed_users(db)
        finally:
            db.close()

        _sync_state["last_result"] = {
            "quarters": quarters,
            "deal_counts": counts,
            "total_deals": sum(counts.values()),
        }
    except Exception as exc:  # noqa: BLE001
        _sync_state["last_error"] = str(exc)
        raise
    finally:
        _sync_state["running"] = False
        _sync_state["last_run"] = datetime.utcnow().isoformat()


@router.get("/vtiger-sync/status")
def vtiger_sync_status(user: Annotated[User, Depends(require_admin)]):
    try:
        deals = _deal_counts()
    except Exception:
        deals = None
    return {
        "configured": bool(settings.vtiger_url and settings.vtiger_access_key),
        "vtiger_url": settings.vtiger_url or None,
        "deals": deals,
        **_sync_state,
    }


@router.post("/vtiger-sync")
async def vtiger_sync_trigger(
    user: Annotated[User, Depends(require_admin)],
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    quarter: str = "h1",
):
    if _sync_state["running"]:
        raise HTTPException(status_code=409, detail="A sync is already in progress")

    if not settings.vtiger_url or not settings.vtiger_access_key:
        raise HTTPException(
            status_code=503,
            detail="Vtiger credentials not configured. Set VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY in backend/.env",
        )

    quarter_map = {
        "q1": ["q1"], "q2": ["q2"], "q3": ["q3"], "q4": ["q4"],
        "h1": ["q1", "q2"], "h2": ["q3", "q4"],
        "all": ["q1", "q2", "q3", "q4"],
    }
    quarters = quarter_map.get(quarter)
    if not quarters:
        raise HTTPException(status_code=400, detail=f"Invalid quarter '{quarter}'")

    background_tasks.add_task(_run_vtiger_sync, quarters, None)

    return {
        "ok": True,
        "message": f"Vtiger sync started for {quarter.upper()}",
        "quarters": quarters,
    }
