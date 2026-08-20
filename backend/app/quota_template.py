"""Parse Finance Galaxy_Data_Templates.xlsx (T1 IC Quota Roster)."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from openpyxl import load_workbook

HEADER_ALIASES = {
    "canonical name": "name",
    "canonical_name": "name",
    "employee initial": "initial",
    "division": "division",
    "reporting manager": "reporting_manager",
    "role type": "type",
    "quota type": "quota_type",
    "q1 quota cr": "q1_quota",
    "q2 quota cr": "q2_quota",
    "h1 quota cr": "h1_quota",
    "q3 quota cr": "q3_quota",
    "q4 quota cr": "q4_quota",
    "h2 quota cr": "h2_quota",
    "annual quota cr": "annual_quota",
    "bl h1 quota cr": "bl_h1_quota",
    "bl annual quota cr": "bl_annual_quota",
    "notes": "notes",
}

RTM_DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"]


def _norm_header(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").lower().split())


def _num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("₹", "")
    if not text or text in ("—", "-", "NA", "n/a"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_t1_workbook(content: bytes) -> list[dict[str, Any]]:
    """Return roster rows from the T1 sheet (or the first sheet with a canonical-name header)."""
    wb = load_workbook(BytesIO(content), data_only=True, read_only=False)
    sheet = None
    for name in wb.sheetnames:
        if name.lower().startswith("t1") or "quota roster" in name.lower():
            sheet = wb[name]
            break
    if sheet is None:
        sheet = wb[wb.sheetnames[0]]

    header_row = None
    colmap: dict[int, str] = {}
    for r in range(1, min(sheet.max_row or 1, 20) + 1):
        found: dict[int, str] = {}
        for c in range(1, min(sheet.max_column or 1, 24) + 1):
            key = HEADER_ALIASES.get(_norm_header(sheet.cell(r, c).value))
            if key:
                found[c] = key
        if "name" in found.values() and "division" in found.values():
            header_row = r
            colmap = found
            break
    if header_row is None:
        raise ValueError(
            "Could not find the T1 header row. Expected columns like "
            "'canonical name', 'division', 'H1 quota cr'."
        )

    people: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in range(header_row + 1, (sheet.max_row or header_row) + 1):
        raw: dict[str, Any] = {}
        for c, key in colmap.items():
            raw[key] = sheet.cell(r, c).value
        name = " ".join(str(raw.get("name") or "").split())
        if not name or name.lower().startswith("canonical"):
            continue
        if name in seen:
            continue
        seen.add(name)
        division = str(raw.get("division") or "").strip()
        if division not in RTM_DIVISIONS:
            # Keep the row but only accept known RTMs; blank if unknown
            division = division if division in RTM_DIVISIONS else (division or "")
        role = str(raw.get("type") or "IC").strip() or "IC"
        people.append({
            "name": name,
            "division": division,
            "type": role,
            "reporting_manager": " ".join(str(raw.get("reporting_manager") or "").split()) or None,
            "q1_quota": _num(raw.get("q1_quota")) or 0,
            "q2_quota": _num(raw.get("q2_quota")) or 0,
            "q3_quota": _num(raw.get("q3_quota")) or 0,
            "q4_quota": _num(raw.get("q4_quota")) or 0,
            "h1_quota": _num(raw.get("h1_quota")),
            "h2_quota": _num(raw.get("h2_quota")) or 0,
            "annual_quota": _num(raw.get("annual_quota")),
        })
    wb.close()
    if not people:
        raise ValueError("T1 sheet has a header but no roster rows")
    return people
