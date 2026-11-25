"""Admin-owned auto-sync schedule (config/crm_sync_schedule.json)."""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.config import settings
from app.repositories import roster_repo
from app.services import vtiger_sync_service

_log = logging.getLogger("galaxy.sync_schedule")

SCHEDULE_PATH = settings.root / "config" / "crm_sync_schedule.json"
IST = ZoneInfo("Asia/Kolkata")

DEFAULT_SCHEDULE: dict[str, Any] = {
    "enabled": False,
    "interval_unit": "days",
    "interval_value": 1,
    "run_hour_ist": 2,
    "last_auto_started_at": None,
}


class SyncScheduleError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _scripts_on_path() -> None:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)


def _normalize(raw: Any) -> dict[str, Any]:
    data = dict(DEFAULT_SCHEDULE)
    if isinstance(raw, dict):
        if "enabled" in raw:
            data["enabled"] = bool(raw["enabled"])
        unit = str(raw.get("interval_unit") or data["interval_unit"]).lower()
        if unit in ("days", "weeks"):
            data["interval_unit"] = unit
        try:
            val = int(raw.get("interval_value", data["interval_value"]))
            data["interval_value"] = val
        except (TypeError, ValueError):
            pass
        try:
            hour = int(raw.get("run_hour_ist", data["run_hour_ist"]))
            if 0 <= hour <= 23:
                data["run_hour_ist"] = hour
        except (TypeError, ValueError):
            pass
        last = raw.get("last_auto_started_at")
        data["last_auto_started_at"] = last if isinstance(last, str) and last.strip() else None
    return data


def _validate_for_save(body: dict[str, Any]) -> dict[str, Any]:
    enabled = bool(body.get("enabled", False))
    unit = str(body.get("interval_unit") or "days").lower().strip()
    if unit not in ("days", "weeks"):
        raise SyncScheduleError("interval_unit must be 'days' or 'weeks'")
    try:
        value = int(body.get("interval_value"))
    except (TypeError, ValueError) as exc:
        raise SyncScheduleError("interval_value must be an integer") from exc
    if unit == "days" and not (1 <= value <= 30):
        raise SyncScheduleError("interval_value for days must be 1–30")
    if unit == "weeks" and not (1 <= value <= 12):
        raise SyncScheduleError("interval_value for weeks must be 1–12")
    # run_hour_ist is fixed at 02:00 IST in v1 (Admin cannot change it yet).
    existing = get_schedule_raw()
    return {
        "enabled": enabled,
        "interval_unit": unit,
        "interval_value": value,
        "run_hour_ist": 2,
        "last_auto_started_at": existing.get("last_auto_started_at"),
    }


def get_schedule_raw() -> dict[str, Any]:
    return _normalize(roster_repo.read_json(SCHEDULE_PATH))


def get_schedule() -> dict[str, Any]:
    """Public schedule + computed next_run (UTC ISO) for Admin UI."""
    schedule = get_schedule_raw()
    next_run = compute_next_run(schedule)
    public = {
        "enabled": schedule["enabled"],
        "interval_unit": schedule["interval_unit"],
        "interval_value": schedule["interval_value"],
        "run_hour_ist": schedule["run_hour_ist"],
        "next_run": next_run.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if next_run else None,
    }
    return public


def save_schedule(body: dict[str, Any]) -> dict[str, Any]:
    cleaned = _validate_for_save(body)
    roster_repo.write_json_atomic(SCHEDULE_PATH, cleaned)
    _log.info(
        "sync_schedule_saved enabled=%s unit=%s value=%s",
        cleaned["enabled"],
        cleaned["interval_unit"],
        cleaned["interval_value"],
    )
    return get_schedule()


def _parse_utc(iso: str | None) -> datetime | None:
    if not iso:
        return None
    text = iso.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _interval_delta(schedule: dict[str, Any]) -> timedelta:
    value = int(schedule["interval_value"])
    if schedule["interval_unit"] == "weeks":
        return timedelta(weeks=value)
    return timedelta(days=value)


def _next_ist_hour_on_or_after(when_utc: datetime, hour_ist: int) -> datetime:
    """Next Asia/Kolkata wall-clock `hour_ist:00` that is >= when_utc."""
    local = when_utc.astimezone(IST)
    candidate = local.replace(hour=hour_ist, minute=0, second=0, microsecond=0)
    if candidate < local:
        candidate = candidate + timedelta(days=1)
    return candidate.astimezone(timezone.utc)


def compute_next_run(schedule: dict[str, Any] | None = None, now: datetime | None = None) -> datetime | None:
    """
    After last auto-start (or last successful sync, or now), add the interval,
    then snap to the next 02:00 IST on or after that instant.
    Returns None when disabled.
    """
    sched = schedule or get_schedule_raw()
    if not sched.get("enabled"):
        return None

    now_utc = now or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    _scripts_on_path()
    import deal_store  # type: ignore

    anchor = _parse_utc(sched.get("last_auto_started_at"))
    if anchor is None:
        anchor = _parse_utc(deal_store.last_successful_finished_at())
    if anchor is None:
        anchor = now_utc

    after = anchor + _interval_delta(sched)
    hour = int(sched.get("run_hour_ist") or 2)
    return _next_ist_hour_on_or_after(after, hour)


def _mark_auto_started() -> None:
    data = get_schedule_raw()
    data["last_auto_started_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    roster_repo.write_json_atomic(SCHEDULE_PATH, data)


def maybe_run_due(now: datetime | None = None) -> dict[str, Any] | None:
    """If auto-sync is due and idle, start a full-FY job. Safe to call from a ticker."""
    sched = get_schedule_raw()
    if not sched.get("enabled"):
        return None
    if not vtiger_sync_service.vtiger_configured():
        return None

    _scripts_on_path()
    import deal_store  # type: ignore

    if deal_store.has_running_job():
        return None

    next_run = compute_next_run(sched, now=now)
    if next_run is None:
        return None

    now_utc = now or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    if now_utc < next_run:
        return None

    started = vtiger_sync_service.try_start_full_fy_sync()
    if not started:
        return None

    try:
        _mark_auto_started()
    except Exception:
        _log.exception("auto_sync_mark_started_failed job_id=%s", started.get("job_id"))

    _log.info(
        "auto_sync_started job_id=%s next_was=%s",
        started.get("job_id"),
        next_run.isoformat(),
    )
    return started
