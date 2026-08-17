#!/usr/bin/env python3
"""
Vtiger → Galaxy Dashboard Sync
================================
Fetches Closed Won opportunities from Vtiger CRM for the current FY,
writes them as Pipeline Excel files (Q1 / Q2), then re-runs the parser
to regenerate quota_data.json.

Usage (standalone):
    python scripts/vtiger_sync.py

Usage (with explicit credentials):
    python scripts/vtiger_sync.py \
        --url http://crmgoaplpoc.centralindia.cloudapp.azure.com \
        --username admin \
        --accesskey YOUR_KEY \
        --quarter all          # all | q1 | q2 | h1 | h2

Credentials are read from (in priority order):
    1. Command-line args
    2. Environment variables: VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY
    3. backend/.env file
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))


# ----------------------------------------------------------------- FY config

FY = "FY 26-27"

QUARTERS = {
    "q1": (date(2026, 4, 1),  date(2026, 6, 30)),
    "q2": (date(2026, 7, 1),  date(2026, 9, 30)),
    "q3": (date(2026, 10, 1), date(2026, 12, 31)),
    "q4": (date(2027, 1, 1),  date(2027, 3, 31)),
    "h1": (date(2026, 4, 1),  date(2026, 9, 30)),
    "h2": (date(2026, 10, 1), date(2027, 3, 31)),
}

PIPELINE_FILES = {
    "q1": ROOT / "files" / "Opportunity Pipeline Q1.xlsx",
    "q2": ROOT / "files" / "Opportunity Pipeline Q2.xlsx",
    "q3": ROOT / "files" / "Opportunity Pipeline Q3.xlsx",
    "q4": ROOT / "files" / "Opportunity Pipeline Q4.xlsx",
}


def load_env_credentials() -> dict[str, str]:
    """Read VTIGER_* from backend/.env or environment."""
    creds: dict[str, str] = {}

    # Try .env file first
    env_file = ROOT / "backend" / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key in ("VTIGER_URL", "VTIGER_USERNAME", "VTIGER_ACCESS_KEY"):
                creds[key] = val

    # Environment variables override .env
    for key in ("VTIGER_URL", "VTIGER_USERNAME", "VTIGER_ACCESS_KEY"):
        if os.environ.get(key):
            creds[key] = os.environ[key]

    return creds


def rows_to_excel(rows: list[dict], path: Path, quarter: str) -> None:
    """Write pipeline rows to an Excel file matching the existing format."""
    try:
        import openpyxl
    except ImportError:
        print("  [!] openpyxl not installed — install with: pip install openpyxl")
        raise

    # Column order must match the existing pipeline Excel/CSV format
    COLUMNS = [
        "Created Time",
        "Opportunity Number",
        "Organization Name",
        "Contact Name",
        "Opportunity Name",
        "Opportunity Led By",
        "Assigned To",
        "Lead Source",
        "Identifier",
        "Supported By",
        "Category",
        "Sub Category",
        "Brand",
        "Sales Stage",
        "Amount",
        "Estimated Bottomline",
        "Actual Bottomline -",
        "Expected Close Date",
        "Deal Category",
        "Probability",
        "OPF No.",
        "Deal ID",
        "Deal Status",
        "Deal Expiry Date",
        "Description",
    ]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Opportunity Pipeline {quarter.upper()}"
    ws.append(COLUMNS)

    for row in rows:
        ws.append([row.get(col, "") for col in COLUMNS])

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    print(f"  Wrote {len(rows)} rows to {path}")


def sync(
    vtiger_url: str,
    username: str,
    access_key: str,
    quarters: list[str] = None,
    run_parse: bool = True,
    sales_stage: str = "Closed Won",
) -> dict[str, int]:
    """
    Full sync: Vtiger → Excel files → quota_data.json

    Returns a dict of {quarter: deal_count}.
    """
    from vtiger_client import VtigerSession  # type: ignore

    if quarters is None:
        quarters = ["q1", "q2"]

    counts: dict[str, int] = {}

    with VtigerSession(vtiger_url, username, access_key) as vtiger:
        # Pre-load all reference lookups (accounts, contacts, users)
        vtiger.load_accounts()
        vtiger.load_contacts()
        vtiger.load_users()

        for q in quarters:
            if q not in QUARTERS:
                print(f"  [!] Unknown quarter '{q}' — skip")
                continue

            start, end = QUARTERS[q]
            print(f"\n[sync] Fetching {q.upper()} ({start} to {end}) ...")

            records = vtiger.fetch_potentials(start, end, sales_stage=sales_stage)
            rows = vtiger.to_pipeline_rows(records)
            counts[q] = len(rows)

            if q in PIPELINE_FILES:
                rows_to_excel(rows, PIPELINE_FILES[q], q)
            else:
                print(f"  [!] No output path configured for {q} — skipping write")

    # Re-run the Excel → JSON parser
    if run_parse:
        print("\n[sync] Running parse_excel to regenerate quota_data.json ...")
        sys.path.insert(0, str(ROOT / "scripts"))
        import parse_excel  # type: ignore

        try:
            parse_excel.main()
            print("[sync] quota_data.json regenerated successfully")
        except Exception as exc:
            print(f"[sync] Parser error: {exc}")
            raise

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Vtiger CRM → Galaxy Dashboard")
    parser.add_argument("--url",       help="Vtiger base URL")
    parser.add_argument("--username",  help="Vtiger username")
    parser.add_argument("--accesskey", help="Vtiger API access key")
    parser.add_argument(
        "--quarter",
        default="h1",
        choices=["q1", "q2", "q3", "q4", "h1", "h2", "all"],
        help="Which quarter(s) to sync (default: h1 = Q1+Q2)",
    )
    parser.add_argument("--no-parse", action="store_true", help="Skip running parse_excel after sync")
    parser.add_argument("--all-stages", action="store_true", help="Fetch all deal stages, not just Closed Won")
    args = parser.parse_args()

    # Resolve credentials: CLI > env/file
    env = load_env_credentials()
    url        = args.url       or env.get("VTIGER_URL")
    username   = args.username  or env.get("VTIGER_USERNAME")
    access_key = args.accesskey or env.get("VTIGER_ACCESS_KEY")

    if not all([url, username, access_key]):
        missing = [k for k, v in [("URL", url), ("username", username), ("access key", access_key)] if not v]
        print(f"[ERROR] Missing Vtiger credentials: {', '.join(missing)}")
        print("  Set VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY in backend/.env")
        print("  or pass --url --username --accesskey on the command line")
        sys.exit(1)

    # Determine which quarters to sync
    if args.quarter == "all":
        quarters = ["q1", "q2", "q3", "q4"]
    elif args.quarter == "h1":
        quarters = ["q1", "q2"]
    elif args.quarter == "h2":
        quarters = ["q3", "q4"]
    else:
        quarters = [args.quarter]

    sales_stage = "" if args.all_stages else "Closed Won"

    print(f"\n{'='*60}")
    print(f"  Galaxy Vtiger Sync — {FY}")
    print(f"  Quarters : {', '.join(q.upper() for q in quarters)}")
    print(f"  Filter   : {sales_stage or 'All stages'}")
    print(f"  Server   : {url}")
    print(f"{'='*60}\n")

    counts = sync(
        vtiger_url=url,
        username=username,
        access_key=access_key,
        quarters=quarters,
        run_parse=not args.no_parse,
        sales_stage=sales_stage,
    )

    print(f"\n{'='*60}")
    print("  Sync complete:")
    for q, n in counts.items():
        print(f"    {q.upper()}: {n} deals written")
    if not args.no_parse:
        print("  quota_data.json: regenerated")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
