from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


ROOT = Path(__file__).resolve().parent.parent.parent


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
    secret_key: str = "galaxy-dev-secret-change-in-production-2026"
    access_token_expire_minutes: int = 60 * 12
    algorithm: str = "HS256"
    database_url: str = f"sqlite:///{ROOT / 'backend' / 'galaxy.db'}"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    root: Path = ROOT
    files_dir: Path = ROOT / "files"
    data_dir: Path = ROOT / "dashboard" / "public" / "data"
    quota_json: Path = ROOT / "dashboard" / "public" / "data" / "quota_data.json"
    pipeline_path: Path = ROOT / "files" / "Opportunity Pipeline Q1.xlsx"
    sales_team_path: Path = ROOT / "files" / "Sales Team - S1, S2 , CB, GB, South.xlsx"
    default_password: str = "Galaxy@123!"

    # Vtiger CRM integration
    vtiger_url: str = ""
    vtiger_username: str = ""
    vtiger_access_key: str = ""

    model_config = {"env_file": str(ROOT / "backend" / ".env"), "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def excel_path(self) -> Path:
        """Dynamically resolved: picks the latest-modified Quota Tracker file."""
        return _find_quota_tracker(self.files_dir)


settings = Settings()
