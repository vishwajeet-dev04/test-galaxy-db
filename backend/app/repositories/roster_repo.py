"""JSON file access for the IC roster (config/ic_quotas.json) and quota rules."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from app.config import settings

IC_QUOTAS_PATH = settings.root / "config" / "ic_quotas.json"
QUOTA_RULES_PATH = settings.root / "config" / "quota_rules.json"


def read_json(path: Path) -> Any:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: Any) -> None:
    """Write via temp file + rename so a crash never leaves a half-written roster."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load_roster() -> dict[str, Any]:
    data = read_json(IC_QUOTAS_PATH)
    return data if isinstance(data, dict) else {}


def save_roster(data: dict[str, Any]) -> None:
    write_json_atomic(IC_QUOTAS_PATH, data)
