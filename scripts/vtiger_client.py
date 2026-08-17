"""
Vtiger CRM API Client for Galaxy Performance Tracker
=====================================================
Handles authentication, paginated queries, and reference resolution
for the Potentials (Opportunities) module.

Field mapping (confirmed via vtiger_discover.py on 2026-08-14):
    cf_825  → Opportunity Led By   (free-text rep name — primary match key)
    cf_715  → Category             (Data Centre / CSG (EndPoint) / etc.)
    amount  → Amount / Topline     (₹, numeric)
    cf_731  → Estimated Bottomline (₹, numeric)
    cf_781  → Actual Bottomline -  (₹, numeric)
    cf_713  → Brand
    cf_765  → Sub Category
    cf_805  → Deal Status
    cf_902  → Deal Category        (Green / Amber / Red)
    cf_707  → OPF No.
    cf_801  → Deal ID
    cf_785  → Supported By
    cf_787  → Identifier
    potential_no  → Opportunity Number
    potentialname → Opportunity Name
    related_to    → Organization Name  (reference ID → resolved to name)
    contact_id    → Contact Name       (reference ID → resolved to name)
    assigned_user_id → Assigned To     (reference ID → resolved to name)
    sales_stage   → Sales Stage
    closingdate   → Expected Close Date
    leadsource    → Lead Source
    probability   → Probability
    createdtime   → Created Time

NOTE: "Division" (col Z) does NOT exist in Vtiger.
      It is derived from the employee mapping (Sales Team Excel / Employee_Mapping.csv).
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from typing import Any


VTIGER_FIELDS = [
    "potential_no",
    "potentialname",
    "related_to",
    "contact_id",
    "assigned_user_id",
    "cf_825",   # Opportunity Led By
    "cf_715",   # Category
    "cf_765",   # Sub Category
    "cf_713",   # Brand
    "sales_stage",
    "amount",
    "cf_731",   # Estimated Bottomline
    "cf_781",   # Actual Bottomline
    "closingdate",
    "cf_902",   # Deal Category
    "probability",
    "cf_707",   # OPF No.
    "cf_801",   # Deal ID
    "cf_805",   # Deal Status
    "cf_807",   # Deal Expiry Date
    "cf_785",   # Supported By
    "cf_787",   # Identifier
    "leadsource",
    "createdtime",
    "description",
]

PIPELINE_COL_MAP = {
    "Created Time":          "createdtime",
    "Opportunity Number":    "potential_no",
    "Organization Name":     "_account_name",   # resolved
    "Contact Name":          "_contact_name",    # resolved
    "Opportunity Name":      "potentialname",
    "Opportunity Led By":    "cf_825",
    "Assigned To":           "_assigned_name",   # resolved
    "Lead Source":           "leadsource",
    "Identifier":            "cf_787",
    "Supported By":          "cf_785",
    "Category":              "cf_715",
    "Sub Category":          "cf_765",
    "Brand":                 "cf_713",
    "Sales Stage":           "sales_stage",
    "Amount":                "amount",
    "Estimated Bottomline":  "cf_731",
    "Actual Bottomline -":   "cf_781",
    "Expected Close Date":   "closingdate",
    "Deal Category":         "cf_902",
    "Probability":           "probability",
    "OPF No.":               "cf_707",
    "Deal ID":               "cf_801",
    "Deal Status":           "cf_805",
    "Deal Expiry Date":      "cf_807",
    "Description":           "description",
}


class VtigerSession:
    """Authenticated Vtiger REST API session."""

    PAGE_SIZE = 100

    def __init__(self, base_url: str, username: str, access_key: str, timeout: int = 20):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.access_key = access_key
        self.timeout = timeout
        self.session_name: str | None = None
        self._account_cache: dict[str, str] = {}
        self._contact_cache: dict[str, str] = {}
        self._user_cache: dict[str, str] = {}

    # ------------------------------------------------------------------ auth

    def login(self) -> None:
        """Authenticate and obtain a session token."""
        data = self._get({"operation": "getchallenge", "username": self.username})
        token = data["result"]["token"]
        key_md5 = hashlib.md5((token + self.access_key).encode()).hexdigest()
        result = self._post({
            "operation": "login",
            "username": self.username,
            "accessKey": key_md5,
        })
        self.session_name = result["result"]["sessionName"]
        print(f"[vtiger] Authenticated as '{self.username}' — session {self.session_name}")

    def logout(self) -> None:
        if self.session_name:
            try:
                self._get({"operation": "logout", "sessionName": self.session_name})
            except Exception:
                pass
            self.session_name = None

    # --------------------------------------------------------- raw HTTP helpers

    def _get(self, params: dict) -> dict:
        url = f"{self.base_url}/webservice.php?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=self.timeout) as r:
            data = json.loads(r.read())
        if not data.get("success"):
            err = data.get("error", {})
            raise RuntimeError(f"Vtiger API error: {err.get('message', data)}")
        return data

    def _post(self, params: dict) -> dict:
        body = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(f"{self.base_url}/webservice.php", data=body, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = json.loads(r.read())
        if not data.get("success"):
            err = data.get("error", {})
            raise RuntimeError(f"Vtiger API error: {err.get('message', data)}")
        return data

    # --------------------------------------------------------- query helpers

    def _query(self, sql: str) -> list[dict]:
        """Run a VQL query and return results."""
        return self._get({
            "operation": "query",
            "sessionName": self.session_name,
            "query": sql,
        })["result"]

    def _query_all(self, base_sql: str) -> list[dict]:
        """Paginate through all results of a VQL query (Vtiger caps at 100/page).
        
        Vtiger VQL uses MySQL-style LIMIT syntax: LIMIT offset, count
        """
        results: list[dict] = []
        offset = 0
        while True:
            sql = f"{base_sql.rstrip(';')} LIMIT {offset},{self.PAGE_SIZE};"
            page = self._query(sql)
            results.extend(page)
            if len(page) < self.PAGE_SIZE:
                break
            offset += self.PAGE_SIZE
            time.sleep(0.1)  # be polite to the server
        return results

    # ------------------------------------------------ reference resolution

    def load_accounts(self) -> None:
        """Pre-load all accounts into cache {id → accountname}."""
        print("[vtiger] Loading accounts...")
        rows = self._query_all("SELECT id, accountname FROM Accounts")
        self._account_cache = {r["id"]: r.get("accountname", "") for r in rows}
        print(f"[vtiger]   Loaded {len(self._account_cache)} accounts")

    def load_contacts(self) -> None:
        """Pre-load all contacts into cache {id → full name}."""
        print("[vtiger] Loading contacts...")
        rows = self._query_all("SELECT id, firstname, lastname FROM Contacts")
        self._contact_cache = {
            r["id"]: f"{r.get('firstname', '')} {r.get('lastname', '')}".strip()
            for r in rows
        }
        print(f"[vtiger]   Loaded {len(self._contact_cache)} contacts")

    def load_users(self) -> None:
        """Pre-load all users into cache {id → full name}."""
        print("[vtiger] Loading users...")
        rows = self._query("SELECT id, first_name, last_name, user_name FROM Users LIMIT 200;")
        for r in rows:
            uid = r["id"]
            full = f"{r.get('first_name', '')} {r.get('last_name', '')}".strip()
            self._user_cache[uid] = full or r.get("user_name", uid)
        print(f"[vtiger]   Loaded {len(self._user_cache)} users")

    def resolve_account(self, ref_id: str) -> str:
        return self._account_cache.get(ref_id, ref_id)

    def resolve_contact(self, ref_id: str) -> str:
        return self._contact_cache.get(ref_id, ref_id)

    def resolve_user(self, ref_id: str) -> str:
        return self._user_cache.get(ref_id, ref_id)

    # ----------------------------------------- fetch opportunities

    def fetch_potentials(
        self,
        start_date: date | str,
        end_date: date | str,
        sales_stage: str = "Closed Won",
    ) -> list[dict]:
        """
        Fetch Potentials filtered by closing date range and sales stage.

        Args:
            start_date: Start date (inclusive), e.g. date(2026, 4, 1)
            end_date:   End date (inclusive), e.g. date(2026, 6, 30)
            sales_stage: Default "Closed Won". Pass "" to fetch all stages.
        """
        s = str(start_date)
        e = str(end_date)

        fields = ", ".join(VTIGER_FIELDS)
        where_parts = [f"closingdate >= '{s}'", f"closingdate <= '{e}'"]
        if sales_stage:
            where_parts.append(f"sales_stage='{sales_stage}'")
        where = " AND ".join(where_parts)

        sql = f"SELECT {fields} FROM Potentials WHERE {where}"
        print(f"[vtiger] Fetching Potentials: {s} to {e} ({sales_stage or 'all stages'}) ...")
        records = self._query_all(sql)
        print(f"[vtiger]   Retrieved {len(records)} records")
        return records

    # ----------------------------------------- convert to pipeline format

    def to_pipeline_rows(self, records: list[dict]) -> list[dict]:
        """
        Convert raw Vtiger Potentials records to the pipeline DataFrame row format
        that parse_excel.py expects (matching column names from the Excel pipeline files).
        """
        rows = []
        for r in records:
            row: dict[str, Any] = {}

            # Resolve references
            row["_account_name"] = self.resolve_account(r.get("related_to", ""))
            row["_contact_name"] = self.resolve_contact(r.get("contact_id", ""))
            row["_assigned_name"] = self.resolve_user(r.get("assigned_user_id", ""))

            # Direct field copy
            for col, field in PIPELINE_COL_MAP.items():
                if field.startswith("_"):
                    row[col] = row.get(field, "")
                else:
                    val = r.get(field, "")
                    # Numeric fields — keep as float; empty/None → 0
                    if field in ("amount", "cf_731", "cf_781"):
                        try:
                            val = float(val) if val not in (None, "", "-") else 0.0
                        except (TypeError, ValueError):
                            val = 0.0
                    # Probability
                    elif field == "probability":
                        try:
                            val = int(float(val)) if val not in (None, "", "-") else 0
                        except (TypeError, ValueError):
                            val = 0
                    elif val is None:
                        val = ""
                    row[col] = val

            rows.append(row)

        return rows

    def __enter__(self):
        self.login()
        return self

    def __exit__(self, *_):
        self.logout()
