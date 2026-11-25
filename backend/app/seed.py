from __future__ import annotations

import re
import secrets

from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.security import hash_password
from app.repositories import user_repo

LEADER_TYPES = {"TL", "AVP", "BU HEAD", "BU HEAD / TL", "TOPLINE", "BOTTOMLINE"}
LEADER_ROSTER_PATH = settings.root / "config" / "leader_roster.json"


def _leader_roster_names() -> set[str]:
    if not LEADER_ROSTER_PATH.exists():
        return set()
    import json

    try:
        rows = json.loads(LEADER_ROSTER_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    names: set[str] = set()
    for row in rows:
        if isinstance(row, dict) and row.get("name"):
            names.add(row["name"].strip().lower())
    return names


def _role_for(name: str, ic_type: str, leader_names: set[str]) -> str:
    t = (ic_type or "IC").strip().upper()
    if t == "TL":
        return "tl"
    if t in LEADER_TYPES or name.strip().lower() in leader_names:
        return "leader"
    return "user"


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
    {
        "username": "anoopp",
        "email": "anoopp@goapl.com",
        "full_name": "Anoop P",
        "role": "admin",
        "employee_name": "Anoop P",
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
    sync_profile: bool = False,
) -> None:
    """Create missing logins. Never overwrite an existing password hash.

    Privileged accounts (`sync_profile=True`) keep role/email/name in
    sync with PRIVILEGED but do not force is_active. Roster rows are insert-only.
    Sign-in id is email: `username` column is always set to the normalized email.
    """
    email_n = (email or "").strip().lower()
    login_id = email_n or (username or "").strip().lower()
    user = db.query(User).filter(User.email == email_n).first() if email_n else None
    if user is None and username:
        # Legacy short usernames (pre email-as-username)
        user = db.query(User).filter(User.username == username.strip().lower()).first()
    if user:
        if sync_profile:
            user.email = email_n
            user.full_name = full_name
            user.role = role
            user.employee_name = employee_name
        if email_n and user.username != email_n:
            clash = db.query(User).filter(User.username == email_n, User.id != user.id).first()
            if clash is None:
                user.username = email_n
        return
    db.add(
        User(
            username=login_id,
            email=email_n,
            full_name=full_name,
            role=role,
            employee_name=employee_name,
            hashed_password=hash_password(password),
            is_active=True,
        )
    )


def migrate_usernames_to_email(db: Session) -> int:
    """One-shot: set username = email wherever they differ (email is sign-in id)."""
    updated = 0
    for user in db.query(User).all():
        email_n = (user.email or "").strip().lower()
        if not email_n or "@" not in email_n:
            continue
        if user.username == email_n:
            continue
        clash = db.query(User).filter(User.username == email_n, User.id != user.id).first()
        if clash is not None:
            continue
        user.username = email_n
        updated += 1
    if updated:
        db.commit()
    return updated


def seed_users(db: Session) -> None:
    admin_password = settings.default_password

    for row in PRIVILEGED:
        # Admins get the default password; CEO is magic-link only → unusable hash on insert
        pwd = admin_password if row["role"] == "admin" else secrets.token_urlsafe(32)
        _upsert(db, password=pwd, sync_profile=True, **row)

    # Roster from quota JSON when available
    names: dict[str, str] = {}
    if settings.quota_json.exists():
        import json

        data = json.loads(settings.quota_json.read_text())
        for emp in data.get("individuals") or []:
            n = (emp.get("name") or "").strip()
            if n and not n.startswith("TBH") and n not in ("Total", "Total Opportunity"):
                names[n] = emp.get("persona") or "IC"
        for leader in data.get("leaders_dashboard") or []:
            n = (leader.get("name") or "").strip()
            if n:
                names.setdefault(n, "BU Head")

    leader_names = _leader_roster_names()
    used_local = {r["username"] for r in PRIVILEGED}
    used_emails = {(r["email"] or "").strip().lower() for r in PRIVILEGED}
    blocked = {n.lower() for n in user_repo.seed_exclusion_usernames(db)}
    for name in sorted(names):
        local = make_username(name)
        if not local or local in used_local:
            # collision: append more of last name
            parts = [p for p in re.split(r"\s+", name) if p]
            last = "".join(c for c in parts[-1].lower() if c.isalpha()) if len(parts) > 1 else "x"
            local = make_username(name) + last[1:3]
            while local in used_local:
                local += "x"
        used_local.add(local)
        email = f"{local}@goapl.com"
        if local.lower() in blocked or email in blocked or email in used_emails:
            continue
        used_emails.add(email)
        role = _role_for(name, names[name], leader_names)
        _upsert(
            db,
            username=local,
            email=email,
            full_name=name,
            role=role,
            employee_name=name,
            # Non-admins: unusable hash (magic-link sign-in)
            password=secrets.token_urlsafe(32),
        )

    db.commit()
    migrate_usernames_to_email(db)
