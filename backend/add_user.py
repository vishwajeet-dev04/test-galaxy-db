"""
Run this script on the server to add a user with a custom password.

Usage (from the backend/ folder with venv active):
    python add_user.py

You will be prompted for the user details.
"""
from __future__ import annotations

import sys

# ── Make sure 'app' package is importable ──────────────────────────────────────
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def add_user(
    username: str,
    email: str,
    full_name: str,
    role: str,
    password: str,
    employee_name: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            confirm = input(
                f"User '{username}' already exists. Update password/role? (y/n): "
            ).strip().lower()
            if confirm != "y":
                print("Aborted.")
                return
            existing.email = email
            existing.full_name = full_name
            existing.role = role
            existing.hashed_password = hash_password(password)
            existing.employee_name = employee_name
            existing.is_active = True
            db.commit()
            print(f"✅ User '{username}' updated successfully.")
        else:
            user = User(
                username=username,
                email=email,
                full_name=full_name,
                role=role,
                hashed_password=hash_password(password),
                employee_name=employee_name,
                is_active=True,
            )
            db.add(user)
            db.commit()
            print(f"✅ User '{username}' created successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    print("=== Galaxy – Add User ===\n")

    username   = input("Username       : ").strip()
    email      = input("Email          : ").strip()
    full_name  = input("Full Name      : ").strip()
    print("Role options   : user | tl | leader | admin | ceo")
    role       = input("Role           : ").strip() or "user"
    emp_name   = input("Employee Name  : (leave blank if not a sales person): ").strip() or None
    password   = input("Password       : ").strip()

    if not username or not password:
        print("❌ Username and password are required.")
        sys.exit(1)

    add_user(
        username=username,
        email=email,
        full_name=full_name,
        role=role,
        password=password,
        employee_name=emp_name,
    )
