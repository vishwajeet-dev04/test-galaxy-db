#!/usr/bin/env python3
"""
Vtiger → Galaxy Dashboard Sync
================================
Fetches Closed Won opportunities from Vtiger CRM for the current FY,
writes them to SQLite (crm_deals), then regenerates quota_data.json.

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
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

# Public hostname/IP of this CRM VM. Calling that URL from Galaxy on the same box
# hairpins through Azure and times out. Apache on :80 is the real CRM.
_PUBLIC_CRM_HOSTS = frozenset({
    "20.219.14.83",
    "crmgoaplpoc.centralindia.cloudapp.azure.com",
})
_ON_CRM_VM = Path("/home/crmuser/galaxy_db").is_dir()


def resolve_vtiger_target(url: str) -> tuple[str, str | None]:
    """Return (connect_url, Host header).

    On the CRM VM, connect to Apache on loopback. The public hostname hairpins
    through Azure. Apache is name-based, so keep the original Host header.
    """
    raw = (url or "").strip().rstrip("/")
    if not raw:
        return raw, None
    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    host = (parsed.hostname or "").lower()
    if not _ON_CRM_VM:
        return raw, None
    if host in _PUBLIC_CRM_HOSTS or host in {"127.0.0.1", "localhost"}:
        header = parsed.hostname or "20.219.14.83"
        if header.lower() in {"127.0.0.1", "localhost"}:
            header = "20.219.14.83"
        print(f"[vtiger] Using http://127.0.0.1 Host={header}")
        return "http://127.0.0.1", header
    return raw, None


def resolve_vtiger_url(url: str) -> str:
    return resolve_vtiger_target(url)[0]


# ----------------------------------------------------------------- FY config

def _fy_start_year(today: date | None = None) -> int:
    today = today or date.today()
    return today.year if today.month >= 4 else today.year - 1


def _fy_label(year: int) -> str:
    return f"FY {str(year)[2:]}-{str(year + 1)[2:]}"


def fy_quarter_windows(today: date | None = None) -> dict[str, tuple[date, date]]:
    year = _fy_start_year(today)
    return {
        "q1": (date(year, 4, 1), date(year, 6, 30)),
        "q2": (date(year, 7, 1), date(year, 9, 30)),
        "q3": (date(year, 10, 1), date(year, 12, 31)),
        "q4": (date(year + 1, 1, 1), date(year + 1, 3, 31)),
        "h1": (date(year, 4, 1), date(year, 9, 30)),
        "h2": (date(year, 10, 1), date(year + 1, 3, 31)),
    }


FY = _fy_label(_fy_start_year())
QUARTERS = fy_quarter_windows()

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


def sync(
    vtiger_url: str,
    username: str,
    access_key: str,
    quarters: list[str] = None,
    run_parse: bool = True,
    sales_stage: str = "Closed Won",
    job_id: str | None = None,
) -> dict[str, int]:
    """
    Full sync: Vtiger → SQLite crm_deals → quota_data.json

    Returns a dict of {quarter: deal_count}.
    """
    from vtiger_client import VtigerSession  # type: ignore
    import deal_store  # type: ignore

    base_url, host_header = resolve_vtiger_target(vtiger_url)

    if quarters is None:
        quarters = ["q1", "q2", "q3", "q4"]

    counts: dict[str, int] = {}

    with VtigerSession(base_url, username, access_key, host_header=host_header) as vtiger:
        for q in quarters:
            if job_id:
                job = deal_store.get_job(job_id)
                if not job or job.get("status") != "running":
                    raise RuntimeError("Sync interrupted")
            if q not in QUARTERS:
                print(f"  [!] Unknown quarter '{q}' — skip")
                continue

            start, end = QUARTERS[q]
            print(f"\n[sync] Fetching {q.upper()} ({start} to {end}) ...")

            records = vtiger.fetch_potentials(start, end, sales_stage=sales_stage)
            vtiger.resolve_references(records)
            rows = vtiger.to_pipeline_rows(records)
            stored = deal_store.replace_quarter(q, rows)
            counts[q] = stored
            print(f"  Stored {stored} deals in SQLite for {q.upper()}")

    if run_parse:
        print("\n[sync] Building quota_data.json from SQLite deals + config ...")
        sys.path.insert(0, str(ROOT / "scripts"))
        try:
            import build_quota_data  # type: ignore
            build_quota_data.build()
            print("[sync] quota_data.json regenerated successfully")
        except Exception as exc:
            print(f"[sync] Build error: {exc}")
            raise

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Vtiger CRM → Galaxy Dashboard")
    parser.add_argument("--url",       help="Vtiger base URL")
    parser.add_argument("--username",  help="Vtiger username")
    parser.add_argument("--accesskey", help="Vtiger API access key")
    parser.add_argument(
        "--quarter",
        default="all",
        choices=["q1", "q2", "q3", "q4", "h1", "h2", "all"],
        help="Which quarter(s) to sync (default: all = Q1–Q4)",
    )
    parser.add_argument("--no-parse", action="store_true", help="Skip running parse_excel after sync")
    parser.add_argument("--all-stages", action="store_true", help="Fetch all deal stages, not just Closed Won")
    args = parser.parse_args()

    # Resolve credentials: CLI > env/file
    env = load_env_credentials()
    url        = resolve_vtiger_url(args.url or env.get("VTIGER_URL") or "")
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

    import deal_store  # type: ignore

    job_id = deal_store.try_start_job(quarters)
    if not job_id:
        print("[ERROR] A sync is already in progress")
        sys.exit(1)

    try:
        counts = sync(
            vtiger_url=url,
            username=username,
            access_key=access_key,
            quarters=quarters,
            run_parse=not args.no_parse,
            sales_stage=sales_stage,
            job_id=job_id,
        )
        deal_store.finish_job(
            job_id,
            result={
                "quarters": quarters,
                "deal_counts": counts,
                "total_deals": sum(counts.values()),
            },
        )
    except Exception as exc:
        deal_store.finish_job(job_id, error="Sync failed")
        print(f"[ERROR] {exc}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print("  Sync complete:")
    for q, n in counts.items():
        print(f"    {q.upper()}: {n} deals written")
    if not args.no_parse:
        print("  quota_data.json: regenerated")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
