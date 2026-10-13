"""RTM assignment history for the IC quota roster.

Keeps dated team (RTM) assignments on the same person record so Admin
transfers close the previous row instead of overwriting it.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))


class AssignmentError(ValueError):
    """Invalid assignment history (overlap, dates, or same-team transfer)."""


def as_of_today() -> date:
    return datetime.now(IST).date()


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text or text.lower() in ("none", "ongoing", "—", "-"):
        return None
    text = text[:10]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def iso_or_none(value: date | None) -> str | None:
    return value.isoformat() if value else None


def normalize_division(div: Any) -> str:
    d = " ".join(str(div or "").split())
    if d in ("Geo X", "GeoX"):
        return "GeoX"
    return d


def _row(division: str, start: str | None, end: str | None) -> dict[str, Any]:
    return {
        "division": normalize_division(division),
        "start_date": start or None,
        "end_date": end or None,
    }


def serialize_assignments(assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for a in assignments or []:
        if not isinstance(a, dict):
            continue
        div = normalize_division(a.get("division"))
        if not div:
            continue
        start = parse_date(a.get("start_date"))
        end = parse_date(a.get("end_date"))
        out.append(_row(div, iso_or_none(start), iso_or_none(end)))
    return out


def ensure_assignments(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return stored assignments, or one open row from `division` (null dates)."""
    cfg = cfg if isinstance(cfg, dict) else {}
    raw = cfg.get("assignments")
    if isinstance(raw, list) and raw:
        rows = serialize_assignments(raw)
        if rows:
            return rows
    div = normalize_division(cfg.get("division"))
    if not div:
        return []
    return [_row(div, None, None)]


def covers(assignment: dict[str, Any], on: date) -> bool:
    start = parse_date(assignment.get("start_date"))
    end = parse_date(assignment.get("end_date"))
    if start and on < start:
        return False
    if end and on > end:
        return False
    return True


def _start_sort_key(assignment: dict[str, Any]) -> date:
    return parse_date(assignment.get("start_date")) or date.min


def assignment_on(assignments: list[dict[str, Any]], on: date) -> dict[str, Any] | None:
    covering = [a for a in assignments if covers(a, on)]
    if not covering:
        return None
    covering.sort(key=_start_sort_key)
    return covering[-1]


def current_division(assignments: list[dict[str, Any]], today: date | None = None) -> str:
    today = today or as_of_today()
    row = assignment_on(assignments, today)
    if row:
        return normalize_division(row.get("division"))
    if assignments:
        open_rows = [a for a in assignments if not parse_date(a.get("end_date"))]
        if open_rows:
            open_rows.sort(key=_start_sort_key)
            return normalize_division(open_rows[-1].get("division"))
    return ""


def division_on(
    assignments: list[dict[str, Any]],
    close_date: Any,
    *,
    fallback: str = "",
    today: date | None = None,
) -> str:
    """RTM covering a deal close date. Missing close date → as-of-today, not a guessed history date."""
    today = today or as_of_today()
    parsed = parse_date(close_date)
    if parsed is None:
        return current_division(assignments, today) or normalize_division(fallback)
    row = assignment_on(assignments, parsed)
    if row:
        return normalize_division(row.get("division")) or normalize_division(fallback)
    return current_division(assignments, today) or normalize_division(fallback)


def _interval(assignment: dict[str, Any]) -> tuple[date, date]:
    start = parse_date(assignment.get("start_date")) or date.min
    end = parse_date(assignment.get("end_date")) or date.max
    return start, end


def validate_assignments(assignments: list[dict[str, Any]]) -> None:
    rows = serialize_assignments(assignments)
    if not rows:
        raise AssignmentError("At least one RTM assignment is required")
    for a in rows:
        start = parse_date(a.get("start_date"))
        end = parse_date(a.get("end_date"))
        if start and end and end < start:
            raise AssignmentError(
                f"End date {end.isoformat()} is before start date {start.isoformat()} for {a.get('division')}"
            )
        if not a.get("division"):
            raise AssignmentError("Each assignment needs an RTM")

    for i, a in enumerate(rows):
        a_start, a_end = _interval(a)
        for b in rows[i + 1 :]:
            b_start, b_end = _interval(b)
            if a_start <= b_end and b_start <= a_end:
                raise AssignmentError(
                    "Assignments overlap — an employee cannot have two active RTMs on the same date"
                )


def validate_history(assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Full history written by Admin: the base rules plus at most one ongoing (no end date) row.

    Returns the serialized rows sorted by start date. Unlike `serialize_assignments`, a blank team
    or an unreadable date is an error here — silently turning it into "unknown" would re-tag deals.
    """
    for raw in assignments or []:
        if not isinstance(raw, dict) or not normalize_division(raw.get("division")):
            raise AssignmentError("Each row needs a team")
        for key in ("start_date", "end_date"):
            value = raw.get(key)
            if value not in (None, "") and parse_date(value) is None:
                raise AssignmentError(f"Unreadable date: {value}")
    rows = serialize_assignments(assignments)
    open_rows = [row for row in rows if not parse_date(row.get("end_date"))]
    if len(open_rows) > 1:
        raise AssignmentError("Only one team can be ongoing — give the earlier team an end date")
    validate_assignments(rows)
    rows.sort(key=_start_sort_key)
    return rows


def correct_current_division(
    existing: list[dict[str, Any]],
    new_division: str,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Relabel the team that covers today. Dates and every other row stay.

    Used when the stored RTM was wrong, not when the person moved.
    """
    new_division = normalize_division(new_division)
    if not new_division:
        raise AssignmentError("New RTM is required")
    today = today or as_of_today()
    rows = serialize_assignments(existing)
    if not rows:
        raise AssignmentError("No team assignment to correct")

    target = assignment_on(rows, today)
    if target is None:
        open_rows = [row for row in rows if not parse_date(row.get("end_date"))]
        if not open_rows:
            raise AssignmentError("No open team to correct")
        open_rows.sort(key=_start_sort_key)
        target = open_rows[-1]
    if normalize_division(target.get("division")) == new_division:
        raise AssignmentError(f"Already assigned to {new_division}")

    target["division"] = new_division
    validate_assignments(rows)
    return rows


def apply_transfer(
    existing: list[dict[str, Any]],
    new_division: str,
    start: date | str,
) -> list[dict[str, Any]]:
    """Close the assignment covering start-1 day and open a new RTM from `start`."""
    new_division = normalize_division(new_division)
    if not new_division:
        raise AssignmentError("New RTM is required")
    start_d = parse_date(start)
    if start_d is None:
        raise AssignmentError("A valid effective start date is required")

    rows = serialize_assignments(existing)
    covering_start = assignment_on(rows, start_d)
    if covering_start and normalize_division(covering_start.get("division")) == new_division:
        raise AssignmentError(f"Already assigned to {new_division} on {start_d.isoformat()}")

    covering_start_start = parse_date(covering_start.get("start_date")) if covering_start else None
    if covering_start and covering_start_start == start_d:
        covering_start["division"] = new_division
        validate_assignments(rows)
        return rows

    prev_end = start_d - timedelta(days=1)
    to_close = assignment_on(rows, prev_end) or covering_start
    if to_close:
        close_start = parse_date(to_close.get("start_date"))
        if close_start and prev_end < close_start:
            raise AssignmentError(
                f"Effective date {start_d.isoformat()} is before the current assignment start"
            )
        to_close["end_date"] = prev_end.isoformat()

    rows.append(_row(new_division, start_d.isoformat(), None))
    rows.sort(key=_start_sort_key)
    validate_assignments(rows)
    return rows
