"""SQLite store for Closed Won deals synced from Vtiger.

Replaces the Opportunity Pipeline Q1–Q4 Excel middle step.
Scripts and the FastAPI admin router both use this module (stdlib sqlite3 only).
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "backend" / "galaxy.db"

PIPELINE_COLUMNS = [
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
    "Division",
]


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS crm_deals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quarter TEXT NOT NULL,
            opportunity_number TEXT NOT NULL DEFAULT '',
            payload TEXT NOT NULL,
            synced_at TEXT NOT NULL,
            UNIQUE(quarter, opportunity_number)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_crm_deals_quarter ON crm_deals(quarter)"
    )
    conn.commit()
    return conn


def _opp_key(row: dict[str, Any], index: int) -> str:
    raw = str(row.get("Opportunity Number") or "").strip()
    if raw and raw not in ("-", "None"):
        return raw
    led = str(row.get("Opportunity Led By") or "")
    name = str(row.get("Opportunity Name") or "")
    amt = str(row.get("Amount") or "")
    return f"anon-{index}-{led}-{name}-{amt}"[:180]


def replace_quarter(quarter: str, rows: list[dict[str, Any]]) -> int:
    """Replace all deals for a quarter. Returns the number of rows stored."""
    q = quarter.lower()
    now = datetime.utcnow().isoformat()
    conn = _connect()
    try:
        conn.execute("DELETE FROM crm_deals WHERE quarter = ?", (q,))
        for i, row in enumerate(rows):
            payload = {col: row.get(col, "") for col in PIPELINE_COLUMNS}
            key = _opp_key(row, i)
            payload["Opportunity Number"] = payload.get("Opportunity Number") or key
            conn.execute(
                "INSERT INTO crm_deals (quarter, opportunity_number, payload, synced_at) VALUES (?, ?, ?, ?)",
                (q, key, json.dumps(payload, ensure_ascii=False, default=str), now),
            )
        conn.commit()
        return len(rows)
    finally:
        conn.close()


def load_all_rows() -> list[dict[str, Any]]:
    """Return pipeline-shaped dicts with `_quarter` set (q1/q2/q3/q4)."""
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT quarter, payload FROM crm_deals ORDER BY quarter, id"
        )
        out: list[dict[str, Any]] = []
        for rec in cur.fetchall():
            try:
                payload = json.loads(rec["payload"])
            except json.JSONDecodeError:
                continue
            payload["_quarter"] = rec["quarter"]
            out.append(payload)
        return out
    finally:
        conn.close()


def counts_by_quarter() -> dict[str, int]:
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT quarter, COUNT(*) AS n FROM crm_deals GROUP BY quarter"
        )
        counts = {row["quarter"]: int(row["n"]) for row in cur.fetchall()}
        for q in ("q1", "q2", "q3", "q4"):
            counts.setdefault(q, 0)
        counts["total"] = sum(counts[q] for q in ("q1", "q2", "q3", "q4"))
        return counts
    finally:
        conn.close()


def total_count() -> int:
    conn = _connect()
    try:
        row = conn.execute("SELECT COUNT(*) AS n FROM crm_deals").fetchone()
        return int(row["n"] if row else 0)
    finally:
        conn.close()


def migrate_from_excel_if_empty() -> int:
    """One-time import of existing Pipeline Q*.xlsx files if the table is empty.

    Lets the dashboard keep working after the switch without an immediate CRM sync.
    Returns number of rows imported (0 if DB already had deals or no files).
    """
    if total_count() > 0:
        return 0

    try:
        import pandas as pd
    except ImportError:
        return 0

    imported = 0
    for q in ("q1", "q2", "q3", "q4"):
        path = ROOT / "files" / f"Opportunity Pipeline {q.upper()}.xlsx"
        if not path.exists():
            continue
        try:
            df = pd.read_excel(path)
        except Exception as exc:
            print(f"[deal_store] Could not read {path.name}: {exc}")
            continue
        if df.empty:
            continue
        df.columns = [str(c).strip() for c in df.columns]
        rows = df.where(df.notna(), "").to_dict(orient="records")
        imported += replace_quarter(q, rows)
        print(f"[deal_store] Migrated {len(rows)} rows from {path.name} -> SQLite ({q})")
    return imported
