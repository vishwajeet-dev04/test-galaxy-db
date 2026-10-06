from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


ROOT = Path(__file__).resolve().parent.parent.parent

_PLACEHOLDER_SECRET = "galaxy-dev-secret-change-in-production-2026"


def _find_quota_tracker(files_dir: Path) -> Path:
    """Return the most recently modified Galaxy Quota Tracker Excel file.

    Looks for any file matching 'Galaxy Quota Tracker*.xlsx' so uploading a
    new version with a different date in the filename works automatically.
    Falls back to the legacy fixed name if no match is found.
    """
    candidates = sorted(
        files_dir.glob("Galaxy Quota Tracker*.xlsx"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if candidates:
        return candidates[0]
    return files_dir / "Galaxy Quota Tracker.xlsx"


class Settings(BaseSettings):
    app_name: str = "Galaxy Sales Performance Tracker"
    secret_key: str = Field(default="")
    access_token_expire_minutes: int = 150
    algorithm: str = "HS256"
    database_url: str = f"sqlite:///{ROOT / 'backend' / 'galaxy.db'}"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://20.219.14.83",
        "http://20.219.14.83:8081",
    ]
    root: Path = ROOT
    files_dir: Path = ROOT / "files"
    data_dir: Path = ROOT / "backend" / "data"
    quota_json: Path = ROOT / "backend" / "data" / "quota_data.json"
    pipeline_path: Path = ROOT / "files" / "Opportunity Pipeline Q1.xlsx"
    sales_team_path: Path = ROOT / "files" / "Sales Team - S1, S2 , CB, GB, South.xlsx"
    default_password: str = "Galaxy@123!"
    galaxy_docs: bool = False

    # Vtiger CRM integration
    vtiger_url: str = ""
    vtiger_username: str = ""
    vtiger_access_key: str = ""

    model_config = {"env_file": str(ROOT / "backend" / ".env"), "env_file_encoding": "utf-8", "extra": "ignore"}

    @field_validator("secret_key")
    @classmethod
    def _require_secret_key(cls, value: str) -> str:
        key = (value or "").strip()
        if not key or key == _PLACEHOLDER_SECRET:
            raise ValueError(
                "SECRET_KEY must be set in backend/.env to a unique value "
                "(not the example placeholder)"
            )
        return key

    @property
    def excel_path(self) -> Path:
        """Dynamically resolved: picks the latest-modified Quota Tracker file."""
        return _find_quota_tracker(self.files_dir)


settings = Settings()
