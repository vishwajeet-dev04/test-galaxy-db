from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import threading
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.quota_template import parse_t1_workbook
from app.schemas import AdminUserCreate, AdminUserList, AdminUserUpdate, UploadResult, UserOut, user_out
from app.security import require_admin
from app.seed import seed_users
from app.services.user_service import UserServiceError
from app.services import user_service

router = APIRouter()
_log = logging.getLogger("galaxy.admin")


def _user_error(request: Request, actor: User, exc: UserServiceError) -> HTTPException:
    _log.warning(
        "user_admin_failed ts=%s user_id=%s method=%s path=%s detail=%s",
        datetime.utcnow().isoformat(),
        actor.id,
        request.method,
        request.url.path,
        exc.message,
    )
    return HTTPException(status_code=exc.status_code, detail=exc.message)

def _scripts_path() -> str:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    return scripts


def _assignment_history():
    _scripts_path()
    import assignment_history  # type: ignore

    return assignment_history

IC_QUOTAS_PATH = settings.root / "config" / "ic_quotas.json"
QUOTA_RULES_PATH = settings.root / "config" / "quota_rules.json"
RTM_DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"]


class AssignmentRow(BaseModel):
    division: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None


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
    assignments: Optional[list[AssignmentRow]] = None
    transfer_start: Optional[str] = None
    rtm_correction: bool = False


class QuotaAccountOp(BaseModel):
    # Piggyback login CRUD on PUT /quotas — Chrome blocks /directory, /logins, /users.
    op: str
    id: Optional[int] = None
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    employee_name: Optional[str] = None
    is_active: Optional[bool] = None


class QuotaSaveRequest(BaseModel):
    people: Optional[list[IcQuotaPerson]] = None
    bu_annual_quotas: Optional[dict[str, dict[str, float]]] = None
    account: Optional[QuotaAccountOp] = None
    sync: Optional[bool] = None


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


def _reject_if_syncing() -> None:
    _scripts_path()
    import deal_store  # type: ignore

    if deal_store.has_running_job():
        raise HTTPException(status_code=409, detail="A Vtiger sync is running. Wait until it finishes.")


def _run_parse() -> None:
    _scripts_path()
    import build_quota_data  # type: ignore
    build_quota_data.build(output_path=settings.quota_json)


def _deal_counts() -> dict[str, int]:
    _scripts_path()
    import deal_store  # type: ignore
    return deal_store.counts_by_quarter()


def _sync_status_payload(job_id: Optional[str] = None) -> dict[str, Any]:
    _scripts_path()
    import deal_store  # type: ignore

    try:
        deals = _deal_counts()
    except Exception:
        _log.exception("vtiger_sync_deal_counts_failed")
        deals = None

    job = deal_store.get_job(job_id) if job_id else deal_store.get_latest_job()
    payload: dict[str, Any] = {
        "configured": bool(settings.vtiger_url and settings.vtiger_access_key),
        "deals": deals,
        "job_id": None,
        "status": None,
        "running": False,
        "last_run": None,
        "last_result": None,
        "last_error": None,
        "quarters": [],
    }
    if job:
        payload.update(job)
    return payload


def _start_vtiger_sync(quarter: str = "all") -> dict[str, Any]:
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

    _scripts_path()
    import deal_store  # type: ignore

    job_id = deal_store.try_start_job(quarters)
    if not job_id:
        raise HTTPException(status_code=409, detail="A sync is already in progress")

    thread = threading.Thread(
        target=_run_vtiger_sync,
        args=(job_id, quarters),
        daemon=True,
        name=f"vtiger-sync-{job_id[:8]}",
    )
    try:
        thread.start()
    except Exception:
        _log.exception("vtiger_sync_thread_start_failed job_id=%s", job_id)
        deal_store.finish_job(job_id, error="Sync failed")
        raise HTTPException(status_code=500, detail="Could not start sync") from None

    return {
        "ok": True,
        "job_id": job_id,
        "quarters": quarters,
        "message": f"Vtiger sync started for {quarter.upper()}",
    }


@router.get("/status")
@router.get("/uploads/status")
def admin_status(user: Annotated[User, Depends(require_admin)]):
    ic = {k: v for k, v in _load_json(IC_QUOTAS_PATH).items() if not str(k).startswith("_")}
    rtm = sum(1 for v in ic.values() if isinstance(v, dict) and v.get("division") in RTM_DIVISIONS)
    try:
        deals = _deal_counts()
    except Exception:
        _log.exception("admin_status_deal_counts_failed")
        deals = {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0}
    payload = _sync_status_payload()
    payload.update({
        "deals": deals,
        "quota_count": len(ic),
        "rtm_count": rtm,
        "quota_json": {
            "exists": settings.quota_json.exists(),
        },
        "source": "sqlite+config",
    })
    return payload


@router.get("/quotas")
def get_quotas(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    ap: Optional[int] = Query(None, ge=1),
    aps: int = Query(100, ge=1, le=100),
    aq: Optional[str] = Query(None),
):
    ah = _assignment_history()
    raw = _load_json(IC_QUOTAS_PATH)
    people = []
    today = ah.as_of_today()
    for name, cfg in raw.items():
        if name.startswith("_") or not isinstance(cfg, dict):
            continue
        assignments = ah.ensure_assignments(cfg)
        people.append({
            "name": name,
            "division": ah.current_division(assignments, today) or (cfg.get("division") or ""),
            "type": cfg.get("type") or "IC",
            "reporting_manager": cfg.get("reporting_manager") or None,
            "q1_quota": cfg.get("q1_quota") or 0,
            "q2_quota": cfg.get("q2_quota") or 0,
            "q3_quota": cfg.get("q3_quota") or 0,
            "q4_quota": cfg.get("q4_quota") or 0,
            "h1_quota": cfg.get("h1_quota"),
            "h2_quota": cfg.get("h2_quota") if cfg.get("h2_quota") is not None else 0,
            "annual_quota": cfg.get("annual_quota"),
            "assignments": assignments,
        })
    people.sort(key=lambda p: (p["division"] or "zzz", p["name"]))
    rules = _load_json(QUOTA_RULES_PATH)
    bu = {k: v for k, v in (rules.get("bu_annual_quotas") or {}).items() if not str(k).startswith("_")}
    out: dict[str, Any] = {"people": people, "bu_annual_quotas": bu}
    # Always attach logins on this GET — Chrome already allows /api/admin/quotas.
    # A second URL (/users, /logins, /directory) returns HTML 403 in their browser.
    page = ap or 1
    try:
        items, total = user_service.list_users(db, page=page, page_size=aps, q=aq)
        out["accounts"] = {
            "items": [user_out(u) for u in items],
            "total": total,
            "page": page,
            "page_size": aps,
        }
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    out["crm"] = _sync_status_payload()
    return out


def _apply_quota_account(request: Request, op: QuotaAccountOp, user: User, db: Session) -> dict[str, Any]:
    kind = (op.op or "").strip().lower()
    if kind == "create":
        body = AdminUserCreate(
            username=op.username or "",
            email=op.email or "",
            full_name=op.full_name or "",
            role=op.role or "user",
            password=op.password or "",
            employee_name=op.employee_name,
        )
        created = _create_user_impl(request, body, user, db)
        return {"ok": True, "account": created}
    if kind == "update":
        if op.id is None:
            raise HTTPException(status_code=400, detail="User id is required")
        body = AdminUserUpdate(
            email=op.email,
            full_name=op.full_name,
            role=op.role,
            employee_name=op.employee_name,
            is_active=op.is_active,
            password=op.password,
        )
        updated = _update_user_impl(request, op.id, body, user, db)
        return {"ok": True, "account": updated}
    if kind == "delete":
        if op.id is None:
            raise HTTPException(status_code=400, detail="User id is required")
        _delete_user_impl(request, op.id, user, db)
        return {"ok": True, "deleted_id": op.id}
    raise HTTPException(status_code=400, detail="Unknown account operation")


@router.put("/quotas")
def save_quotas(
    request: Request,
    body: QuotaSaveRequest,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.sync and not body.people and body.account is None:
        return _start_vtiger_sync("all")
    if body.account is not None and not body.people:
        return _apply_quota_account(request, body.account, user, db)
    if not body.people:
        raise HTTPException(status_code=400, detail="At least one IC quota row is required")
    _reject_if_syncing()

    ah = _assignment_history()
    today = ah.as_of_today()
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
        requested = ah.normalize_division(p.division)
        base = ah.ensure_assignments(existing) if existing else []
        if not base:
            client_rows = [r.model_dump() for r in (p.assignments or [])]
            base = ah.ensure_assignments({"division": requested, "assignments": client_rows})
        current = ah.current_division(base, today)
        try:
            if requested and current and requested != current:
                if p.rtm_correction:
                    assignments = ah.correct_current_division(base, requested, today)
                else:
                    start = ah.parse_date(p.transfer_start)
                    if start is None:
                        raise ah.AssignmentError(
                            f"Say when {name} joined {requested}"
                        )
                    assignments = ah.apply_transfer(base, requested, start)
            elif p.assignments:
                assignments = ah.serialize_assignments([r.model_dump() for r in p.assignments])
                if not assignments:
                    assignments = base
                ah.validate_assignments(assignments)
            else:
                assignments = base
                ah.validate_assignments(assignments)
        except ah.AssignmentError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        as_of = ah.current_division(assignments, today) or requested
        # H1 / H2 / Annual are Finance-owned. Never derive them from Q1–Q4.
        h1 = float(p.h1_quota) if p.h1_quota is not None else 0.0
        h2 = float(p.h2_quota) if p.h2_quota is not None else 0.0
        annual = float(p.annual_quota) if p.annual_quota is not None else 0.0
        out[name] = {
            **kept,
            "division": as_of,
            "type": (p.type or "IC").strip() or "IC",
            "reporting_manager": (p.reporting_manager or "").strip() or None,
            "q1_quota": round(float(p.q1_quota or 0), 4),
            "q2_quota": round(float(p.q2_quota or 0), 4),
            "q3_quota": round(float(p.q3_quota or 0), 4),
            "q4_quota": round(float(p.q4_quota or 0), 4),
            "h1_quota": round(h1, 4),
            "h2_quota": round(h2, 4),
            "annual_quota": round(annual, 4),
            "assignments": assignments,
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
    except Exception:
        _log.exception("quota_save_rebuild_failed")
        raise HTTPException(status_code=500, detail="Quotas saved but dashboard rebuild failed") from None

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
    max_bytes = 5 * 1024 * 1024
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Template is too large (max 5 MB)")
    try:
        rows = parse_t1_workbook(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        _log.exception("t1_import_parse_failed")
        raise HTTPException(status_code=400, detail="Could not read workbook") from None

    ah = _assignment_history()
    today = ah.as_of_today()
    prev = _load_json(IC_QUOTAS_PATH)
    if not isinstance(prev, dict):
        prev = {}
    people: list[IcQuotaPerson] = []
    for row in rows:
        person = IcQuotaPerson(**row)
        existing = prev.get(person.name) if isinstance(prev.get(person.name), dict) else {}
        current = ah.current_division(ah.ensure_assignments(existing), today) if existing else ""
        requested = ah.normalize_division(person.division)
        if existing and requested and current and requested != current:
            person.transfer_start = today.isoformat()
        people.append(person)
    body = QuotaSaveRequest(people=people)
    result = save_quotas(body, user, db)
    result["message"] = f"Imported {result['count']} people from {file.filename} and rebuilt dashboard"
    return result


@router.post("/reparse", response_model=UploadResult)
def reparse(user: Annotated[User, Depends(require_admin)], db: Annotated[Session, Depends(get_db)]):
    _reject_if_syncing()
    try:
        _run_parse()
    except Exception:
        _log.exception("reparse_failed")
        raise HTTPException(status_code=500, detail="Rebuild failed") from None
    seed_users(db)
    return UploadResult(ok=True, message="Dashboard data regenerated from SQLite deals + quotas", regenerated=True)


def _public_sync_error(exc: BaseException) -> str:
    text = str(exc).lower()
    if isinstance(exc, TimeoutError) or "timed out" in text or "timeout" in text:
        return "Vtiger CRM timed out"
    if isinstance(exc, urllib.error.URLError) or "urlopen" in text:
        return "Could not reach Vtiger CRM"
    if "not configured" in text or "credentials" in text:
        return "Vtiger credentials not configured"
    if "refusing to replace" in text or "0 deals" in text:
        return "CRM returned no deals for a quarter that already has data"
    return "Sync failed"


def _run_vtiger_sync(job_id: str, quarters: list[str]) -> None:
    _scripts_path()
    import deal_store  # type: ignore

    try:
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
            job_id=job_id,
        )

        from app.database import SessionLocal  # type: ignore

        db = SessionLocal()
        try:
            seed_users(db)
        finally:
            db.close()

        deal_store.finish_job(
            job_id,
            result={
                "quarters": quarters,
                "deal_counts": counts,
                "total_deals": sum(counts.values()),
            },
        )
    except Exception as exc:
        _log.exception("vtiger_sync_failed job_id=%s", job_id)
        try:
            deal_store.finish_job(job_id, error=_public_sync_error(exc))
        except Exception:
            _log.exception("vtiger_sync_finish_failed job_id=%s", job_id)


@router.get("/vtiger-sync/status")
def vtiger_sync_status(
    user: Annotated[User, Depends(require_admin)],
    job_id: Optional[str] = Query(None),
):
    return _sync_status_payload(job_id)


@router.post("/vtiger-sync")
def vtiger_sync_trigger(
    user: Annotated[User, Depends(require_admin)],
    quarter: str = "all",
):
    return _start_vtiger_sync(quarter)


def _list_users_impl(
    request: Request,
    user: User,
    db: Session,
    page: int,
    page_size: int,
    q: Optional[str],
):
    try:
        items, total = user_service.list_users(db, page=page, page_size=page_size, q=q)
        return AdminUserList(
            items=[user_out(u) for u in items],
            total=total,
            page=page,
            page_size=page_size,
        )
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    except Exception:
        _log.exception(
            "user_list_failed ts=%s user_id=%s path=%s",
            datetime.utcnow().isoformat(),
            user.id,
            request.url.path,
        )
        raise HTTPException(status_code=500, detail="Could not load users") from None


@router.get("/directory", response_model=AdminUserList)
def list_directory(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
):
    return _list_users_impl(request, user, db, page, page_size, q)


@router.get("/logins", response_model=AdminUserList, include_in_schema=False)
def list_logins(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
):
    return _list_users_impl(request, user, db, page, page_size, q)


@router.get("/users", response_model=AdminUserList, include_in_schema=False)
def list_users(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
):
    return _list_users_impl(request, user, db, page, page_size, q)


def _create_user_impl(request: Request, body: AdminUserCreate, user: User, db: Session):
    try:
        created = user_service.create_user(
            db,
            actor=user,
            username=body.username,
            email=body.email,
            full_name=body.full_name,
            role=body.role,
            password=body.password,
            employee_name=body.employee_name,
        )
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    return user_out(created)


@router.post("/directory", response_model=UserOut)
def create_directory_login(
    request: Request,
    body: AdminUserCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _create_user_impl(request, body, user, db)


@router.post("/logins", response_model=UserOut, include_in_schema=False)
def create_login(
    request: Request,
    body: AdminUserCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _create_user_impl(request, body, user, db)


@router.post("/users", response_model=UserOut, include_in_schema=False)
def create_user(
    request: Request,
    body: AdminUserCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _create_user_impl(request, body, user, db)


def _update_user_impl(request: Request, user_id: int, body: AdminUserUpdate, user: User, db: Session):
    try:
        updated = user_service.update_user(
            db,
            actor=user,
            user_id=user_id,
            email=body.email,
            full_name=body.full_name,
            role=body.role,
            employee_name=body.employee_name,
            is_active=body.is_active,
            password=body.password,
        )
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    return user_out(updated)


@router.patch("/directory/{user_id}", response_model=UserOut)
def update_directory_login(
    request: Request,
    user_id: int,
    body: AdminUserUpdate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _update_user_impl(request, user_id, body, user, db)


@router.patch("/logins/{user_id}", response_model=UserOut, include_in_schema=False)
def update_login(
    request: Request,
    user_id: int,
    body: AdminUserUpdate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _update_user_impl(request, user_id, body, user, db)


@router.patch("/users/{user_id}", response_model=UserOut, include_in_schema=False)
def update_user(
    request: Request,
    user_id: int,
    body: AdminUserUpdate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _update_user_impl(request, user_id, body, user, db)


def _delete_user_impl(request: Request, user_id: int, user: User, db: Session):
    try:
        user_service.delete_user(db, actor=user, user_id=user_id)
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    return {"ok": True}


@router.delete("/directory/{user_id}")
def delete_directory_login(
    request: Request,
    user_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _delete_user_impl(request, user_id, user, db)


@router.delete("/logins/{user_id}", include_in_schema=False)
def delete_login(
    request: Request,
    user_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _delete_user_impl(request, user_id, user, db)


@router.delete("/users/{user_id}", include_in_schema=False)
def delete_user(
    request: Request,
    user_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _delete_user_impl(request, user_id, user, db)
