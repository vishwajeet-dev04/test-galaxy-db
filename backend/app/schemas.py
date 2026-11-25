from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    employee_name: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


def user_out(user: Any) -> UserOut:
    return UserOut(
        id=int(user.id),
        username=str(user.username),
        email=str(user.email or ""),
        full_name=str(user.full_name or ""),
        role=str(user.role or "user"),
        employee_name=user.employee_name,
        is_active=bool(getattr(user, "is_active", True)),
    )


class AdminUserCreate(BaseModel):
    # username optional — server sets username = email
    username: Optional[str] = Field(default=None, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    role: str
    # Required only when role is admin (enforced in user_service)
    password: Optional[str] = None
    employee_name: Optional[str] = None


class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    employee_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class AdminUserList(BaseModel):
    items: List[UserOut]
    total: int
    page: int
    page_size: int


class LoginRequest(BaseModel):
    # Prefer email; username kept for backward-compatible form clients
    email: Optional[str] = None
    username: Optional[str] = None
    password: str = Field(min_length=1)


class EmailLookupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class EmailLookupResponse(BaseModel):
    email: str
    role: str
    requires_password: bool
    full_name: str


class MagicLinkRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class MagicLinkConsumeRequest(BaseModel):
    token: str = Field(min_length=8, max_length=512)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UploadResult(BaseModel):
    ok: bool
    message: str
    regenerated: bool = False
    files: Dict[str, str] = {}
