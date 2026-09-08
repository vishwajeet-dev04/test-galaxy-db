"""Admin user create/update rules. No HTTP types here."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import User
from app.repositories import user_repo
from app.security import hash_password

logger = logging.getLogger("galaxy.users")

ALLOWED_ROLES = frozenset({"user", "tl", "leader", "admin", "ceo"})
USERNAME_RE = re.compile(r"^[a-z][a-z0-9._-]{1,62}$")
MIN_PASSWORD_LEN = 8


class UserServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _log_fail(actor_id: int, action: str, reason: str) -> None:
    logger.warning(
        "%s user_id=%s action=%s reason=%s",
        datetime.now(timezone.utc).isoformat(),
        actor_id,
        action,
        reason,
    )


def _norm_username(value: str) -> str:
    return (value or "").strip().lower()


def _norm_email(value: str) -> str:
    return (value or "").strip().lower()


def _norm_name(value: str) -> str:
    return " ".join((value or "").split())


def _validate_role(role: str) -> str:
    r = (role or "").strip().lower()
    if r not in ALLOWED_ROLES:
        raise UserServiceError(f"Role must be one of: {', '.join(sorted(ALLOWED_ROLES))}")
    return r


def _validate_password(password: str) -> str:
    if len(password) < MIN_PASSWORD_LEN:
        raise UserServiceError(f"Password must be at least {MIN_PASSWORD_LEN} characters")
    return password


def _email_taken(db: Session, email: str, *, exclude_id: int | None = None) -> bool:
    found = user_repo.get_by_email(db, email)
    if found is None:
        return False
    return exclude_id is None or found.id != exclude_id


def list_users(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: str | None,
) -> tuple[list[User], int]:
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    return user_repo.list_users(db, page=page, page_size=page_size, q=q)


def create_user(
    db: Session,
    *,
    actor: User,
    username: str,
    email: str,
    full_name: str,
    role: str,
    password: str,
    employee_name: str | None,
) -> User:
    username = _norm_username(username)
    email = _norm_email(email)
    full_name = _norm_name(full_name)
    emp = _norm_name(employee_name) or None if employee_name else None
    role = _validate_role(role)
    _validate_password(password)

    if not USERNAME_RE.match(username):
        _log_fail(actor.id, "create", "invalid_username")
        raise UserServiceError("Username must start with a letter and use only lowercase letters, digits, . _ -")
    if not email or "@" not in email:
        raise UserServiceError("A valid email is required")
    if not full_name:
        raise UserServiceError("Full name is required")
    if user_repo.get_by_username(db, username):
        _log_fail(actor.id, "create", "username_taken")
        raise UserServiceError("That username is already in use", 409)
    if _email_taken(db, email):
        _log_fail(actor.id, "create", "email_taken")
        raise UserServiceError("That email is already in use", 409)

    user = User(
        username=username,
        email=email,
        full_name=full_name,
        role=role,
        employee_name=emp,
        hashed_password=hash_password(password),
        is_active=True,
    )
    return user_repo.add(db, user)


def update_user(
    db: Session,
    *,
    actor: User,
    user_id: int,
    email: str | None = None,
    full_name: str | None = None,
    role: str | None = None,
    employee_name: str | None = None,
    is_active: bool | None = None,
    password: str | None = None,
) -> User:
    user = user_repo.get_by_id(db, user_id)
    if user is None:
        _log_fail(actor.id, "update", "not_found")
        raise UserServiceError("User not found", 404)

    new_role = _validate_role(role) if role is not None else user.role
    new_active = user.is_active if is_active is None else bool(is_active)
    is_self = user.id == actor.id
    was_admin = user.role == "admin" and user.is_active
    remains_admin = new_role == "admin" and new_active

    if is_self and (new_role != "admin" or not new_active):
        _log_fail(actor.id, "update", "self_lockout")
        raise UserServiceError("You cannot demote or deactivate your own account")

    if was_admin and not remains_admin and user_repo.count_active_admins(db) <= 1:
        _log_fail(actor.id, "update", "last_admin")
        raise UserServiceError("Cannot demote or deactivate the last remaining admin")

    if email is not None:
        email_n = _norm_email(email)
        if not email_n or "@" not in email_n:
            raise UserServiceError("A valid email is required")
        if _email_taken(db, email_n, exclude_id=user.id):
            _log_fail(actor.id, "update", "email_taken")
            raise UserServiceError("That email is already in use", 409)
        user.email = email_n

    if full_name is not None:
        name = _norm_name(full_name)
        if not name:
            raise UserServiceError("Full name is required")
        user.full_name = name

    if role is not None:
        user.role = new_role

    if employee_name is not None:
        user.employee_name = _norm_name(employee_name) or None

    if is_active is not None:
        user.is_active = new_active

    if password is not None and password.strip() != "":
        user.hashed_password = hash_password(_validate_password(password))

    return user_repo.save(db, user)
