from __future__ import annotations

import shutil
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import UploadResult
from app.security import require_admin
from app.seed import seed_users

router = APIRouter()

# Tracks the state of the most recent Vtiger sync
_sync_state: dict = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "last_error": None,
}

UPLOAD_KEYS = {
    "quota_tracker": ("excel", settings.excel_path),
    "opportunity_pipeline": ("pipeline", settings.pipeline_path),
    "sales_team": ("sales_team", settings.sales_team_path),
}


def _run_parse() -> None:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    import parse_excel  # type: ignore

    parse_excel.main(
        excel_path=settings.excel_path,
        pipeline_path=settings.pipeline_path,
        sales_team_path=settings.sales_team_path,
        output_path=settings.quota_json,
    )


@router.get("/uploads/status")
def upload_status(user: Annotated[User, Depends(require_admin)]):
    return {
        "files": {
            key: {
                "path": str(path),
                "exists": path.exists(),
                "size": path.stat().st_size if path.exists() else 0,
            }
            for key, (_, path) in UPLOAD_KEYS.items()
        },
        "quota_json": {
            "path": str(settings.quota_json),
            "exists": settings.quota_json.exists(),
        },
    }


@router.post("/uploads", response_model=UploadResult)
async def upload_files(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    quota_tracker: Optional[UploadFile] = File(None),
    opportunity_pipeline: Optional[UploadFile] = File(None),
    sales_team: Optional[UploadFile] = File(None),
):
    saved: dict[str, str] = {}
    mapping = {
        "quota_tracker": quota_tracker,
        "opportunity_pipeline": opportunity_pipeline,
        "sales_team": sales_team,
    }
    if not any(mapping.values()):
        raise HTTPException(status_code=400, detail="Upload at least one file")

    settings.files_dir.mkdir(parents=True, exist_ok=True)

    for key, upload in mapping.items():
        if upload is None:
            continue
        _, dest = UPLOAD_KEYS[key]
        suffix = Path(upload.filename or dest.name).suffix.lower()
        if suffix not in (".xlsx", ".xls"):
            raise HTTPException(status_code=400, detail=f"{key} must be an Excel file (.xlsx)")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as f:
            shutil.copyfileobj(upload.file, f)
        saved[key] = str(dest)

    try:
        _run_parse()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc

    # Refresh user roster from new JSON
    seed_users(db)

    return UploadResult(
        ok=True,
        message="Files saved and dashboard data regenerated",
        regenerated=True,
        files=saved,
    )


@router.post("/reparse", response_model=UploadResult)
def reparse(user: Annotated[User, Depends(require_admin)], db: Annotated[Session, Depends(get_db)]):
    try:
        _run_parse()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc
    seed_users(db)
    return UploadResult(ok=True, message="Dashboard data regenerated", regenerated=True)


# ─── Vtiger Sync ──────────────────────────────────────────────────────────────

def _run_vtiger_sync(quarters: list[str], db_session_factory) -> None:
    """Background task: fetch from Vtiger, write Excel files, reparse."""
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

        # Re-seed users after reparse
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
    """Return the current state of Vtiger sync."""
    return {
        "configured": bool(settings.vtiger_url and settings.vtiger_access_key),
        "vtiger_url": settings.vtiger_url or None,
        **_sync_state,
    }


@router.post("/vtiger-sync")
async def vtiger_sync_trigger(
    user: Annotated[User, Depends(require_admin)],
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    quarter: str = "h1",
):
    """
    Trigger a Vtiger CRM sync in the background.

    quarter: q1 | q2 | q3 | q4 | h1 | h2 | all  (default: h1)
    """
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
