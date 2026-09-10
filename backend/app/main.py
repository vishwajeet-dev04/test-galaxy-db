"""Galaxy Sales Performance Tracker — FastAPI backend."""

from __future__ import annotations

import logging
import shutil
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.rate_limit import check_rate_limit  # noqa: E402
from app.seed import seed_users  # noqa: E402
from app.routers import admin, auth, data  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
_log = logging.getLogger("galaxy")

_OLD_PUBLIC_QUOTA = settings.root / "dashboard" / "public" / "data" / "quota_data.json"

docs = "/docs" if settings.galaxy_docs else None
redoc = "/redoc" if settings.galaxy_docs else None
openapi = "/openapi.json" if settings.galaxy_docs else None

app = FastAPI(
    title="Galaxy Sales Performance Tracker API",
    version="1.0.0",
    docs_url=docs,
    redoc_url=redoc,
    openapi_url=openapi,
)

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


def _migrate_quota_json() -> None:
    """Move generated JSON off the Vite public tree so Nginx cannot serve it."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    if not settings.quota_json.exists() and _OLD_PUBLIC_QUOTA.exists():
        shutil.copy2(_OLD_PUBLIC_QUOTA, settings.quota_json)
        _log.info("Migrated quota_data.json to %s", settings.quota_json)
    if _OLD_PUBLIC_QUOTA.exists():
        try:
            _OLD_PUBLIC_QUOTA.unlink()
            _log.info("Removed public quota_data.json")
        except OSError:
            _log.exception("Could not delete public quota_data.json")


@app.on_event("startup")
def on_startup() -> None:
    settings.files_dir.mkdir(parents=True, exist_ok=True)
    _migrate_quota_json()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()


@app.get("/api/health")
def health(request: Request):
    check_rate_limit(request)
    return {"status": "ok", "app": "galaxy-performance-tracker"}
