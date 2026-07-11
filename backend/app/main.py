"""Galaxy Performance Tracker — FastAPI backend."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.seed import seed_users  # noqa: E402
from app.routers import admin, auth, data  # noqa: E402

app = FastAPI(title="Galaxy Performance Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(data.router, prefix="/api", tags=["data"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.on_event("startup")
def on_startup() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.files_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "galaxy-performance-tracker"}
