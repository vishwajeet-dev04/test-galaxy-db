"""Start and run Vtiger sync jobs (shared by Admin API and auto-sync ticker)."""

from __future__ import annotations

import logging
import sys
import threading
import urllib.error
from typing import Any

from app.config import settings
from app.seed import seed_users

_log = logging.getLogger("galaxy.vtiger_sync")

QUARTER_MAP = {
    "q1": ["q1"],
    "q2": ["q2"],
    "q3": ["q3"],
    "q4": ["q4"],
    "h1": ["q1", "q2"],
    "h2": ["q3", "q4"],
    "all": ["q1", "q2", "q3", "q4"],
}


class VtigerSyncError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _scripts_on_path() -> None:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)


def vtiger_configured() -> bool:
    return bool(settings.vtiger_url and settings.vtiger_access_key)


def public_sync_error(exc: BaseException) -> str:
    text = str(exc).lower()
    if "cancelled" in text or "interrupted" in text:
        return "Cancelled by admin"
    if isinstance(exc, TimeoutError) or "timed out" in text or "timeout" in text:
        return "Vtiger CRM timed out"
    if isinstance(exc, urllib.error.URLError) or "urlopen" in text:
        return "Could not reach Vtiger CRM"
    if "not configured" in text or "credentials" in text:
        return "Vtiger credentials not configured"
    if "refusing to replace" in text or "0 deals" in text:
        return "CRM returned no deals for a quarter that already has data"
    return "Sync failed"


def run_vtiger_sync(job_id: str, quarters: list[str]) -> None:
    _scripts_on_path()
    import deal_store  # type: ignore

    try:
        from vtiger_sync import sync as vtiger_sync  # type: ignore

        if not vtiger_configured():
            raise ValueError(
                "Vtiger credentials not configured. "
                "Set VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY in backend/.env"
            )

        counts = vtiger_sync(
            vtiger_url=settings.vtiger_url,
            username=settings.vtiger_username,
            access_key=settings.vtiger_access_key,
            quarters=quarters,
            run_parse=True,
            job_id=job_id,
        )

        from app.database import SessionLocal  # type: ignore

        db = SessionLocal()
        try:
            seed_users(db)
        finally:
            db.close()

        deal_store.finish_job(
            job_id,
            result={
                "quarters": quarters,
                "deal_counts": counts,
                "total_deals": sum(counts.values()),
            },
        )
    except Exception as exc:
        _log.exception("vtiger_sync_failed job_id=%s", job_id)
        try:
            deal_store.finish_job(job_id, error=public_sync_error(exc))
        except Exception:
            _log.exception("vtiger_sync_finish_failed job_id=%s", job_id)


def start_vtiger_sync(quarter: str = "all") -> dict[str, Any]:
    """Create a job row and start the daemon worker. Raises VtigerSyncError on failure."""
    if not vtiger_configured():
        raise VtigerSyncError(
            "Vtiger credentials not configured. Set VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY in backend/.env",
            status_code=503,
        )

    quarters = QUARTER_MAP.get(quarter)
    if not quarters:
        raise VtigerSyncError(f"Invalid quarter '{quarter}'", status_code=400)

    _scripts_on_path()
    import deal_store  # type: ignore

    job_id = deal_store.try_start_job(quarters)
    if not job_id:
        raise VtigerSyncError("A sync is already in progress", status_code=409)

    thread = threading.Thread(
        target=run_vtiger_sync,
        args=(job_id, quarters),
        daemon=True,
        name=f"vtiger-sync-{job_id[:8]}",
    )
    try:
        thread.start()
    except Exception as exc:
        _log.exception("vtiger_sync_thread_start_failed job_id=%s", job_id)
        deal_store.finish_job(job_id, error="Sync failed")
        raise VtigerSyncError("Could not start sync", status_code=500) from exc

    return {
        "ok": True,
        "job_id": job_id,
        "quarters": quarters,
        "message": f"Vtiger sync started for {quarter.upper()}",
    }


def try_start_full_fy_sync() -> dict[str, Any] | None:
    """Start full-FY sync without raising. Returns payload or None if skipped/busy."""
    if not vtiger_configured():
        return None
    try:
        return start_vtiger_sync("all")
    except VtigerSyncError as exc:
        if exc.status_code == 409:
            return None
        _log.warning("auto_sync_start_failed detail=%s", exc.message)
        return None


def cancel_vtiger_sync(job_id: str | None = None) -> dict[str, Any]:
    """Cancel the running sync job (Admin Cancel). Raises VtigerSyncError if none running."""
    _scripts_on_path()
    import deal_store  # type: ignore

    cancelled = deal_store.cancel_running_job(job_id)
    if not cancelled:
        raise VtigerSyncError("No sync is currently running", status_code=409)
    _log.info("vtiger_sync_cancelled job_id=%s", cancelled)
    return {"ok": True, "job_id": cancelled, "message": "Sync cancelled"}
