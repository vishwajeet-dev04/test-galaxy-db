from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    app_name: str = "Galaxy Performance Tracker"
    secret_key: str = "galaxy-dev-secret-change-in-production-2026"
    access_token_expire_minutes: int = 60 * 12
    algorithm: str = "HS256"
    database_url: str = f"sqlite:///{ROOT / 'backend' / 'galaxy.db'}"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
    root: Path = ROOT
    files_dir: Path = ROOT / "files"
    data_dir: Path = ROOT / "dashboard" / "public" / "data"
    quota_json: Path = ROOT / "dashboard" / "public" / "data" / "quota_data.json"
    excel_path: Path = ROOT / "files" / "Galaxy Quota Tracker - 14072026.xlsx"
    pipeline_path: Path = ROOT / "files" / "Opportunity Pipeline Q1.xlsx"
    sales_team_path: Path = ROOT / "files" / "Sales Team - S1, S2 , CB, GB, South.xlsx"
    default_password: str = "Galaxy@123!"


settings = Settings()
