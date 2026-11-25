"""Passwordless magic-link login for non-admin users."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from sqlalchemy.orm import Session

from app.config import settings
from app.models import MagicLoginToken
from app.repositories import user_repo
from app.schemas import LoginResponse, user_out
from app.security import create_access_token
from app.services import email_service

_log = logging.getLogger("galaxy.magic_link")


class MagicLinkError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _norm_email(value: str) -> str:
    return (value or "").strip().lower()


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _public_base() -> str:
    return (settings.galaxy_public_url or "http://localhost:5173").rstrip("/")


def lookup_email(db: Session, email: str) -> dict[str, Any]:
    email_n = _norm_email(email)
    if not email_n or "@" not in email_n:
        raise MagicLinkError("Enter a valid email address")
    user = user_repo.get_by_email(db, email_n)
    if user is None or not user.is_active:
        raise MagicLinkError("No account for this email", status_code=404)
    return {
        "email": user.email,
        "role": user.role,
        "requires_password": user.role == "admin",
        "full_name": user.full_name,
    }


def request_magic_link(db: Session, email: str) -> dict[str, str]:
    email_n = _norm_email(email)
    if not email_n or "@" not in email_n:
        raise MagicLinkError("Enter a valid email address")

    user = user_repo.get_by_email(db, email_n)
    if user is None or not user.is_active:
        raise MagicLinkError("No account for this email", status_code=404)
    if user.role == "admin":
        raise MagicLinkError("Admins sign in with email and password", status_code=400)

    # Invalidate unused prior tokens for this user
    now = datetime.utcnow()
    db.query(MagicLoginToken).filter(
        MagicLoginToken.user_id == user.id,
        MagicLoginToken.used_at.is_(None),
    ).update({"used_at": now}, synchronize_session=False)

    raw = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw)
    expires = now + timedelta(minutes=max(1, int(settings.magic_link_ttl_minutes or 15)))
    db.add(
        MagicLoginToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires,
            used_at=None,
            created_at=now,
        )
    )
    db.commit()

    link = f"{_public_base()}/?{urlencode({'magic_token': raw})}"
    body = (
        f"Hello {user.full_name},\n\n"
        f"Use this link to sign in to Galaxy Sales Performance Tracker.\n"
        f"It expires in {int(settings.magic_link_ttl_minutes or 15)} minutes and can be used once.\n\n"
        f"{link}\n\n"
        f"If you did not request this, you can ignore this email.\n"
    )
    try:
        email_service.send_email(
            to=user.email,
            subject="Your Galaxy sign-in link",
            body_text=body,
        )
    except Exception as exc:
        _log.exception("magic_link_email_failed user_id=%s", user.id)
        raise MagicLinkError("Could not send sign-in email. Try again later.", status_code=503) from exc

    _log.info("magic_link_sent user_id=%s email=%s", user.id, user.email)
    return {
        "ok": "true",
        "message": "Check your email for a sign-in link.",
    }


def consume_magic_link(db: Session, token: str) -> LoginResponse:
    raw = (token or "").strip()
    if not raw:
        raise MagicLinkError("Sign-in link is missing or invalid", status_code=400)

    token_hash = _hash_token(raw)
    row = (
        db.query(MagicLoginToken)
        .filter(MagicLoginToken.token_hash == token_hash)
        .first()
    )
    if row is None:
        raise MagicLinkError("Sign-in link is invalid or has already been used", status_code=400)
    if row.used_at is not None:
        raise MagicLinkError("Sign-in link has already been used", status_code=400)
    if row.expires_at < datetime.utcnow():
        raise MagicLinkError("Sign-in link has expired. Request a new one.", status_code=400)

    user = user_repo.get_by_id(db, row.user_id)
    if user is None or not user.is_active:
        raise MagicLinkError("No account for this email", status_code=404)
    if user.role == "admin":
        raise MagicLinkError("Admins sign in with email and password", status_code=400)

    row.used_at = datetime.utcnow()
    db.commit()

    access = create_access_token(user.username)
    _log.info("magic_link_consumed user_id=%s", user.id)
    return LoginResponse(access_token=access, user=user_out(user))
