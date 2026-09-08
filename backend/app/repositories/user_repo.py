"""SQLAlchemy access for the users table."""

from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import User


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()


def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def count_active_admins(db: Session) -> int:
    return (
        db.query(User)
        .filter(User.role == "admin", User.is_active.is_(True))
        .count()
    )


def list_users(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: str | None,
) -> tuple[list[User], int]:
    query = db.query(User)
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                User.username.ilike(like),
                User.full_name.ilike(like),
                User.email.ilike(like),
                User.employee_name.ilike(like),
            )
        )
    total = query.count()
    items = (
        query.order_by(User.role.asc(), User.username.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, int(total)


def add(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def save(db: Session, user: User) -> User:
    db.commit()
    db.refresh(user)
    return user
