from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.scoping import scope_quota_data
from app.security import get_current_user

router = APIRouter()


def _load_quota() -> dict[str, Any]:
    if not settings.quota_json.exists():
        raise HTTPException(status_code=503, detail="Quota data not generated yet. Ask an admin to upload files.")
    return json.loads(settings.quota_json.read_text())


@router.get("/quota")
def get_quota(user: Annotated[User, Depends(get_current_user)]):
    data = _load_quota()
    return scope_quota_data(data, user)


@router.get("/users/me/scope")
def my_scope(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    return {
        "username": user.username,
        "role": user.role,
        "employee_name": user.employee_name,
        "can_upload": user.role == "admin",
        "sees_all": user.role in ("admin", "ceo"),
    }
