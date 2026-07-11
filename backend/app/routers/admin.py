from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import UploadResult
from app.security import require_admin
from app.seed import seed_users

router = APIRouter()

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
