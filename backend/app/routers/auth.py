from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rate_limit import check_rate_limit
from app.schemas import LoginRequest, LoginResponse, UserOut
from app.security import authenticate_user, create_access_token, get_current_user

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login_json(
    request: Request,
    body: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
):
    check_rate_limit(request)
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_access_token(user.username)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/token", response_model=LoginResponse)
def login_form(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    check_rate_limit(request)
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_access_token(user.username)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(get_current_user)]):
    return UserOut.model_validate(user)
