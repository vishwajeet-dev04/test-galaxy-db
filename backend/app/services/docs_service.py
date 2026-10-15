"""Resolve Help documents on disk. No HTTP types here."""

from __future__ import annotations

from pathlib import Path

from app.config import settings

MANUAL_FILENAME = "Galaxy_Performance_Tracker_User_Manual_1.1.pdf"


class DocsServiceError(Exception):
    def __init__(self, message: str, status_code: int = 404) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def user_manual_path() -> Path:
    path = settings.files_dir / "docs" / MANUAL_FILENAME
    if not path.is_file():
        raise DocsServiceError("User manual is not available")
    return path
