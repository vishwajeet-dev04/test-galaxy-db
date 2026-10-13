"""SQLite store for Closed Won deals synced from Vtiger.

Replaces the Opportunity Pipeline Q1–Q4 Excel middle step.
Scripts and the FastAPI admin router both use this module (stdlib sqlite3 only).
"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
# Docker points this at a mounted directory: SQLite keeps -wal/-shm next to the file,
# so a single-file bind mount is not enough.
DB_PATH = Path(os.environ.get("GALAXY_DEALS_DB") or ROOT / "backend" / "galaxy.db")

# Running jobs older than this are treated as dead (worker recycle / crash).
_STALE_JOB_MINUTES = 45

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
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS crm_sync_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            quarters TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            last_error TEXT,
            result TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_crm_sync_jobs_status ON crm_sync_jobs(status, started_at)"
    )
    conn.commit()
    return conn


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _job_row(row: sqlite3.Row) -> dict[str, Any]:
    result = None
    if row["result"]:
        try:
            result = json.loads(row["result"])
        except json.JSONDecodeError:
            result = None
    quarters: list[str] = []
    if row["quarters"]:
        try:
            quarters = json.loads(row["quarters"])
        except json.JSONDecodeError:
            quarters = []
    status = row["status"]
    return {
        "job_id": row["id"],
        "status": status,
        "running": status == "running",
        "quarters": quarters,
        "last_run": row["finished_at"] or row["started_at"],
        "last_result": result,
        "last_error": row["last_error"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }


def reclaim_stale_jobs() -> int:
    """Mark running jobs older than 45 minutes as interrupted. Returns how many were reclaimed."""
    now = datetime.utcnow()
    now_iso = now.isoformat()
    conn = _connect()
    reclaimed = 0
    try:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            "SELECT id, started_at FROM crm_sync_jobs WHERE status = 'running'"
        ).fetchall()
        for row in rows:
            started = _parse_iso(row["started_at"])
            stale = started is not None and (now - started) > timedelta(minutes=_STALE_JOB_MINUTES)
            if not stale:
                continue
            conn.execute(
                """
                UPDATE crm_sync_jobs
                SET status = 'error', last_error = ?, finished_at = ?
                WHERE id = ?
                """,
                ("Sync interrupted", now_iso, row["id"]),
            )
            reclaimed += 1
        conn.commit()
        return reclaimed
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def try_start_job(quarters: list[str]) -> str | None:
    """Insert a running job if none is active. Returns job_id or None if busy."""
    reclaim_stale_jobs()
    job_id = str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat()
    conn = _connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT id FROM crm_sync_jobs WHERE status = 'running' LIMIT 1"
        ).fetchone()
        if row:
            conn.rollback()
            return None
        conn.execute(
            """
            INSERT INTO crm_sync_jobs (id, status, quarters, started_at, finished_at, last_error, result)
            VALUES (?, 'running', ?, ?, NULL, NULL, NULL)
            """,
            (job_id, json.dumps(list(quarters)), now_iso),
        )
        conn.commit()
        return job_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def finish_job(
    job_id: str,
    *,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    now = datetime.utcnow().isoformat()
    status = "error" if error else "done"
    conn = _connect()
    try:
        conn.execute(
            """
            UPDATE crm_sync_jobs
            SET status = ?, finished_at = ?, last_error = ?, result = ?
            WHERE id = ? AND status = 'running'
            """,
            (
                status,
                now,
                error,
                json.dumps(result, ensure_ascii=False, default=str) if result is not None else None,
                job_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_job(job_id: str) -> dict[str, Any] | None:
    reclaim_stale_jobs()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, status, quarters, started_at, finished_at, last_error, result FROM crm_sync_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        return _job_row(row) if row else None
    finally:
        conn.close()


def get_latest_job() -> dict[str, Any] | None:
    reclaim_stale_jobs()
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT id, status, quarters, started_at, finished_at, last_error, result
            FROM crm_sync_jobs
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        return _job_row(row) if row else None
    finally:
        conn.close()


def _opp_key(row: dict[str, Any], index: int) -> str:
    raw = str(row.get("Opportunity Number") or "").strip()
    if raw and raw not in ("-", "None"):
        return raw
    led = str(row.get("Opportunity Led By") or "")
    name = str(row.get("Opportunity Name") or "")
    amt = str(row.get("Amount") or "")
    return f"anon-{index}-{led}-{name}-{amt}"[:180]


def has_running_job() -> bool:
    reclaim_stale_jobs()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id FROM crm_sync_jobs WHERE status = 'running' LIMIT 1"
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def replace_quarter(quarter: str, rows: list[dict[str, Any]]) -> int:
    """Replace all deals for a quarter. Returns the number of rows stored."""
    q = quarter.lower()
    now = datetime.utcnow().isoformat()
    conn = _connect()
    try:
        existing = conn.execute(
            "SELECT COUNT(*) AS n FROM crm_deals WHERE quarter = ?", (q,)
        ).fetchone()
        existing_n = int(existing["n"] if existing else 0)
        if existing_n > 0 and len(rows) == 0:
            raise RuntimeError(
                f"Refusing to replace {q.upper()} with 0 deals ({existing_n} already stored)"
            )
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
    """Optional one-time import of leftover Pipeline Q*.xlsx files.

    Live actuals come from Vtiger. This runs only when GALAXY_MIGRATE_EXCEL=1
    and crm_deals is empty. Returns number of rows imported (0 otherwise).
    """
    flag = os.environ.get("GALAXY_MIGRATE_EXCEL", "").strip().lower()
    if flag not in ("1", "true", "yes"):
        return 0
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
