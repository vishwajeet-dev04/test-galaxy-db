from __future__ import annotations

import json
import time
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
    for attempt in range(3):
        try:
            return json.loads(settings.quota_json.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            if attempt == 2:
                raise HTTPException(status_code=503, detail="Quota data is being updated, please retry in a moment.")
            time.sleep(0.3)


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
