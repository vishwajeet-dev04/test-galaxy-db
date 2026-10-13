"""Roster (IC quota) rules that are not plain quota saves. No HTTP types here."""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.repositories import roster_repo
from app.seed import seed_users

logger = logging.getLogger("galaxy.roster")


class RosterServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _scripts_on_path() -> None:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)


def assignment_history():
    _scripts_on_path()
    import assignment_history as ah  # type: ignore

    return ah


def is_syncing() -> bool:
    _scripts_on_path()
    import deal_store  # type: ignore

    return bool(deal_store.has_running_job())


def rebuild_dashboard() -> None:
    """Regenerate quota_data.json from SQLite deals + roster. Raises on failure."""
    _scripts_on_path()
    import build_quota_data  # type: ignore

    build_quota_data.build(output_path=settings.quota_json)


def replace_history(
    db: Session,
    name: str,
    rows: list[dict[str, Any]],
    actor_id: int,
) -> dict[str, Any]:
    """Overwrite one person's full RTM history (past and current rows).

    Deals are re-tagged on the rebuild because `rtm_division` is the row covering
    each close date. Quotas stay as they are: quota follows as-of-today membership.
    """
    if is_syncing():
        raise RosterServiceError("A Vtiger sync is running. Wait until it finishes.", 409)

    ah = assignment_history()
    clean_name = " ".join((name or "").split())
    roster = roster_repo.load_roster()
    person = roster.get(clean_name)
    if not clean_name or clean_name.startswith("_") or not isinstance(person, dict):
        raise RosterServiceError(f"{clean_name or 'Person'} is not on the roster", 404)

    try:
        assignments = ah.validate_history(rows)
    except ah.AssignmentError as exc:
        raise RosterServiceError(str(exc), 400) from exc

    before = ah.ensure_assignments(person)
    today = ah.as_of_today()
    roster[clean_name] = {
        **person,
        "division": ah.current_division(assignments, today) or person.get("division", ""),
        "assignments": assignments,
    }
    roster_repo.save_roster(roster)
    logger.info(
        "%s history_replaced user_id=%s person=%s before=%s after=%s",
        datetime.now(timezone.utc).isoformat(),
        actor_id,
        clean_name,
        before,
        assignments,
    )

    try:
        rebuild_dashboard()
    except Exception:
        logger.exception("history_rebuild_failed user_id=%s person=%s", actor_id, clean_name)
        raise RosterServiceError("History saved but dashboard rebuild failed", 500) from None

    seed_users(db)
    return {
        "ok": True,
        "message": f"Saved team history for {clean_name} and rebuilt dashboard",
        "name": clean_name,
        "division": roster[clean_name]["division"],
        "assignments": assignments,
    }
