"""Extract IC roster + quotas from the Quota Tracker Excel into config/ic_quotas.json.

The output keys use CANONICAL names (after applying pipeline_aliases.json) so they
match the 'Opportunity Led By' values from Vtiger — enabling a direct name join.

Run this script whenever the Quota Tracker is updated to refresh quotas.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

import openpyxl

# Rows / names to skip — headers, subtotals, separators
SKIP_PATTERNS = re.compile(
    r"(employee name|ic subtotal|subtotal|division|fy 25|fy 26|^-+$)",
    re.IGNORECASE,
)
RTM_DIVISIONS = {"S1", "S2", "CB", "GB", "South", "GeoX"}
# Non-RTM division fixes for known heads/AVPs
DIVISION_FIXES = {
    "Yogesh Bhatia": "GB",
    "Jitesh Rajput": "Cloud",
    "Darshana Patil": "S1",     # reports into S1 / Others
    "Jimesh Shah": "CB",
    "Ishwari Kadam": "S1",
    "Ajay Patodia": "DCG",
    "Yusufali Petiwala": "DCG",
    "Sanjeev Kohli": "GeoX",
}


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    s = re.sub(r"[,\s\u20b9]", "", str(v))
    try:
        return round(float(s), 4)
    except ValueError:
        return None


def run():
    # Load aliases so we can canonicalize tracker names
    aliases_path = ROOT / "config" / "pipeline_aliases.json"
    aliases: dict[str, str] = {}
    if aliases_path.exists():
        raw = json.loads(aliases_path.read_text(encoding="utf-8"))
        aliases = {k: v for k, v in raw.items() if not k.startswith("_")}

    def canonical(name: str) -> str:
        n = re.sub(r"\s+", " ", name).strip()
        return aliases.get(n, n)

    candidates = sorted(
        (ROOT / "files").glob("Galaxy Quota Tracker*.xlsx"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    tracker = candidates[0] if candidates else None
    if not tracker:
        print("ERROR: No Quota Tracker found in files/")
        sys.exit(1)
    print(f"Reading: {tracker.name}")

    wb = openpyxl.load_workbook(tracker, data_only=True)
    ws = wb["V1 \u00b7 Individual"]

    raw_rows = []
    for r in range(2, ws.max_row + 1):
        raw_name = ws.cell(r, 2).value
        if not raw_name:
            continue
        raw_name = re.sub(r"\s+", " ", str(raw_name)).strip()
        if SKIP_PATTERNS.search(raw_name):
            continue
        # Skip if it looks like a subtotal/total row (contains "—" or "Total")
        if "\u2014" in raw_name or "Total" in raw_name or "total" in raw_name:
            continue

        division = re.sub(r"\s+", " ", str(ws.cell(r, 3).value or "")).strip()
        row_type = re.sub(r"\s+", " ", str(ws.cell(r, 5).value or "")).strip()

        raw_rows.append({
            "raw_name": raw_name,
            "canon": canonical(raw_name),
            "division": division,
            "type": row_type,
            "q1_quota":    _num(ws.cell(r, 6).value),
            "q2_quota":    _num(ws.cell(r, 9).value),
            "h1_quota":    _num(ws.cell(r, 12).value),
            "h2_quota":    _num(ws.cell(r, 15).value),
            "annual_quota": _num(ws.cell(r, 18).value),
        })

    # Save raw extraction for debugging
    out = ROOT / "config" / "extracted_v1.json"
    out.write_text(json.dumps(raw_rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Extracted {len(raw_rows)} rows -> {out}")

    # Build ic_quotas.json using CANONICAL name as key
    ic_quotas = {}
    for row in raw_rows:
        name = row["canon"]
        div = row["division"] or DIVISION_FIXES.get(row["raw_name"], DIVISION_FIXES.get(name, ""))
        q1 = row["q1_quota"] or 0.0
        q2 = row["q2_quota"] or 0.0
        h2 = row["h2_quota"] or 0.0
        h1 = row["h1_quota"] if row["h1_quota"] is not None else round(q1 + q2, 4)
        annual = row["annual_quota"] if row["annual_quota"] is not None else round((h1 or 0) + h2, 4)
        ic_quotas[name] = {
            "_tracker_name": row["raw_name"],
            "division": div,
            "type": row["type"] or "IC",
            "q1_quota":    q1,
            "q2_quota":    q2,
            "h1_quota":    h1 or 0.0,
            "h2_quota":    h2,
            "annual_quota": annual or 0.0,
        }

    q_out = ROOT / "config" / "ic_quotas.json"
    q_out.write_text(json.dumps(ic_quotas, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote ic_quotas.json with {len(ic_quotas)} canonical entries -> {q_out}")
    print(f"  RTM ICs: {sum(1 for v in ic_quotas.values() if v.get('division') in RTM_DIVISIONS)}")
    print(f"  Others:  {sum(1 for v in ic_quotas.values() if v.get('division') not in RTM_DIVISIONS)}")

if __name__ == "__main__":
    run()

