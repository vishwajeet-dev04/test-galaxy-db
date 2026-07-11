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

    class Config:
        from_attributes = True


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
