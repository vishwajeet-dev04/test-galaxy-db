from __future__ import annotations

import json
import time
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.scoping import apply_date_filter, scope_quota_data
from app.security import get_current_user
from app.services import docs_service

router = APIRouter()


def _load_quota() -> dict[str, Any]:
    if not settings.quota_json.exists():
        raise HTTPException(status_code=503, detail="Quota data not generated yet. Ask an admin to upload files.")
    for attempt in range(3):
        try:
            return json.loads(settings.quota_json.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            if attempt == 2:
                raise HTTPException(status_code=503, detail="Quota data is being updated, please retry in a moment.")
            time.sleep(0.3)


@router.get("/quota")
def get_quota(
    user: Annotated[User, Depends(get_current_user)],
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
):
    data = _load_quota()
    scoped = scope_quota_data(data, user)
    return apply_date_filter(scoped, date_from, date_to)


@router.get("/users/me/scope")
def my_scope(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    return {
        "username": user.username,
        "role": user.role,
        "employee_name": user.employee_name,
        "can_upload": user.role == "admin",
        "sees_all": user.role in ("admin", "ceo"),
    }


@router.get("/help/manual")
def download_user_manual(_user: Annotated[User, Depends(get_current_user)]):
    try:
        path = docs_service.user_manual_path()
    except docs_service.DocsServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=docs_service.MANUAL_FILENAME,
    )
