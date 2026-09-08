from __future__ import annotations

from typing import Dict, Optional

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


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    role: str
    password: str = Field(min_length=8)
    employee_name: Optional[str] = None


class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    employee_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class AdminUserList(BaseModel):
    items: list[UserOut]
    total: int
    page: int
    page_size: int


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UploadResult(BaseModel):
    ok: bool
    message: str
    regenerated: bool = False
    files: Dict[str, str] = {}
