from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rate_limit import check_rate_limit
from app.schemas import (
    EmailLookupRequest,
    EmailLookupResponse,
    LoginRequest,
    LoginResponse,
    MagicLinkConsumeRequest,
    MagicLinkRequest,
    UserOut,
    user_out,
)
from app.security import authenticate_user, create_access_token, get_current_user
from app.services.magic_link_service import MagicLinkError
from app.services import magic_link_service

router = APIRouter()


def _login_id(body: LoginRequest) -> str:
    return (body.email or body.username or "").strip()


@router.post("/lookup", response_model=EmailLookupResponse)
def lookup_email(
    request: Request,
    body: EmailLookupRequest,
    db: Annotated[Session, Depends(get_db)],
):
    check_rate_limit(request)
    try:
        data = magic_link_service.lookup_email(db, body.email)
    except MagicLinkError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    return EmailLookupResponse(**data)


@router.post("/login", response_model=LoginResponse)
def login_json(
    request: Request,
    body: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
):
    check_rate_limit(request)
    login_id = _login_id(body)
    if not login_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")
    user = authenticate_user(db, login_id, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user.username)
    return LoginResponse(access_token=token, user=user_out(user))


@router.post("/token", response_model=LoginResponse)
def login_form(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    """OAuth2 password form — admin only; username field accepts email."""
    check_rate_limit(request)
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user.username)
    return LoginResponse(access_token=token, user=user_out(user))


@router.post("/magic-link")
def request_magic_link(
    request: Request,
    body: MagicLinkRequest,
    db: Annotated[Session, Depends(get_db)],
):
    check_rate_limit(request)
    try:
        return magic_link_service.request_magic_link(db, body.email)
    except MagicLinkError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None


@router.post("/magic-link/consume", response_model=LoginResponse)
def consume_magic_link(
    request: Request,
    body: MagicLinkConsumeRequest,
    db: Annotated[Session, Depends(get_db)],
):
    check_rate_limit(request)
    try:
        return magic_link_service.consume_magic_link(db, body.token)
    except MagicLinkError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user_out(user)
