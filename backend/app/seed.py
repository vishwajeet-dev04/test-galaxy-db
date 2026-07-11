from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.security import hash_password


def make_username(full_name: str) -> str:
    """first name + first letter of last name, lowercase letters only."""
    cleaned = re.sub(r"\(.*?\)", "", full_name).strip()
    parts = [p for p in re.split(r"\s+", cleaned) if p]
    if not parts:
        return "user"
    first = "".join(c for c in parts[0].lower() if c.isalpha())
    last = "".join(c for c in parts[-1].lower() if c.isalpha()) if len(parts) > 1 else ""
    last_initial = last[0] if last else ""
    return f"{first}{last_initial}"


# Special / privileged accounts
PRIVILEGED = [
    {
        "username": "sanjayp",
        "email": "sanjay@goapl.com",
        "full_name": "Sanjay",
        "role": "ceo",
        "employee_name": None,
    },
    {
        "username": "dilips",
        "email": "dilips@goapl.com",
        "full_name": "Dilip S",
        "role": "admin",
        "employee_name": None,
    },
    {
        "username": "asifb",
        "email": "asifb@goapl.com",
        "full_name": "Asif B",
        "role": "admin",
        "employee_name": None,
    },
    {
        "username": "dharashinib",
        "email": "dharashinib@goapl.com",
        "full_name": "Dharashini B",
        "role": "admin",
        "employee_name": None,
    },
    {
        "username": "praveens",
        "email": "praveens@goapl.com",
        "full_name": "Praveen S",
        "role": "admin",
        "employee_name": None,
    },
]


def _upsert(
    db: Session,
    *,
    username: str,
    email: str,
    full_name: str,
    role: str,
    employee_name: str | None,
    password: str,
) -> None:
    user = db.query(User).filter(User.username == username).first()
    if user:
        user.email = email
        user.full_name = full_name
        user.role = role
        user.employee_name = employee_name
        user.is_active = True
        user.hashed_password = hash_password(password)
        return
    db.add(
        User(
            username=username,
            email=email,
            full_name=full_name,
            role=role,
            employee_name=employee_name,
            hashed_password=hash_password(password),
            is_active=True,
        )
    )


def seed_users(db: Session) -> None:
    password = settings.default_password

    for row in PRIVILEGED:
        _upsert(db, password=password, **row)

    # Roster from quota JSON when available
    names: set[str] = set()
    if settings.quota_json.exists():
        import json

        data = json.loads(settings.quota_json.read_text())
        for emp in data.get("individuals") or []:
            n = (emp.get("name") or "").strip()
            if n and not n.startswith("TBH") and n not in ("Total", "Total Opportunity"):
                names.add(n)
        for leader in data.get("leaders_dashboard") or []:
            n = (leader.get("name") or "").strip()
            if n:
                names.add(n)

    used_usernames = {r["username"] for r in PRIVILEGED}
    for name in sorted(names):
        username = make_username(name)
        if not username or username in used_usernames:
            # collision: append more of last name
            parts = [p for p in re.split(r"\s+", name) if p]
            last = "".join(c for c in parts[-1].lower() if c.isalpha()) if len(parts) > 1 else "x"
            username = make_username(name) + last[1:3]
            while username in used_usernames:
                username += "x"
        used_usernames.add(username)
        email = f"{username}@goapl.com"
        _upsert(
            db,
            username=username,
            email=email,
            full_name=name,
            role="user",
            employee_name=name,
            password=password,
        )

    db.commit()
