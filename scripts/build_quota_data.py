#!/usr/bin/env python3
"""
build_quota_data.py — Vtiger-Direct Dashboard Builder
======================================================
Generates quota_data.json from:
  1. SQLite crm_deals (synced from Vtiger — no Pipeline Excel)
  2. config/ic_quotas.json   — IC roster + quota targets (Admin editor)
  3. config/quota_rules.json — multipliers, category annual quotas
  4. config/pipeline_aliases.json — name normalization

NO Excel files required at runtime.

DevSpec v2 formula implementations:
  IC Q1 Actuals  = SUMIF(Pipeline Q1, "Led By" = name, Amount col O) / 1e7
  IC Q2 Actuals  = SUMIF(Pipeline Q2, "Led By" = name, Amount col O) / 1e7
  GeoX exception = use "Actual Bottomline -" col instead of Amount
  H1 Actuals     = Q1 + Q2
  Division total = SUM(IC actuals per division)
  Category/Div   = SUMIFS(Amount, Category=cat, Division=div)
"""
from __future__ import annotations

import json
import math
import os
import re
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

PIPELINE_Q1_PATH = ROOT / "files" / "Opportunity Pipeline Q1.xlsx"
PIPELINE_Q2_PATH = ROOT / "files" / "Opportunity Pipeline Q2.xlsx"
PIPELINE_Q3_PATH = ROOT / "files" / "Opportunity Pipeline Q3.xlsx"
PIPELINE_Q4_PATH = ROOT / "files" / "Opportunity Pipeline Q4.xlsx"
OUTPUT_PATH = ROOT / "dashboard" / "public" / "data" / "quota_data.json"
IC_QUOTAS_PATH = ROOT / "config" / "ic_quotas.json"
QUOTA_RULES_PATH = ROOT / "config" / "quota_rules.json"
ALIASES_PATH = ROOT / "config" / "pipeline_aliases.json"
LEADER_ROSTER_PATH = ROOT / "config" / "leader_roster.json"

RTM_DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"]
BU_CARD_ORDER = ["DCG", "CSN", "PS", "CSG", "Cloud"]

COMPANY_ANNUAL_QUOTA_CR = 1250.0

_DEFAULT_CATEGORY_ANNUAL_QUOTAS: dict[str, dict[str, float]] = {
    "DCG":   {"S1": 455, "S2": 225, "CB": 40,  "GB": 11, "South": 14, "GeoX": 10},
    "CSN":   {"S1": 90,  "S2": 30,  "CB": 24,  "GB": 20, "South": 1,  "GeoX": 20},
    "PS":    {"S1": 2,   "S2": 3,   "CB": 10,  "GB": 5,  "South": 1,  "GeoX": 5},
    "CSG":   {"S1": 37,  "S2": 42,  "CB": 30,  "GB": 0,  "South": 18, "GeoX": 8},
    "Cloud": {"S1": 37,  "S2": 42,  "CB": 30,  "GB": 0,  "South": 18, "GeoX": 8},
}

# Pipeline Category → BU (used for deal records)
CAT_TO_BU: dict[str, str] = {
    "Data Centre":                 "DCG",
    "Cyber Security & Networking": "CSN",
    "Professional Services":       "PS",
    "CSG (EndPoint)":              "CSG",
    "CSG (Endpoint)":              "CSG",
    "Cloud":                       "Cloud",
}

# ── helpers ──────────────────────────────────────────────────────────────────

def _clean(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def _num(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)) and not math.isnan(v):
        return float(v)
    s = re.sub(r"[,\s₹]", "", str(v))
    try:
        return float(s)
    except ValueError:
        return 0.0


def _cr(inr: float) -> float:
    return round(inr / 1e7, 4)


def _att(actuals: float, quota: float) -> float | None:
    if quota and actuals is not None:
        return round(actuals / quota * 100, 2)
    return None


def _period(actuals, quota):
    a = actuals or 0.0
    q = quota or 0.0
    return {"quota": round(q, 4), "actuals": round(a, 4), "attainment_pct": _att(a, q)}


def _explicit_quota(cfg: dict, key: str, fallback: float = 0.0) -> float:
    """Read a Finance-uploaded quota. 0 is a real value; only None/missing falls back.

    H1/H2/Annual are independent of Q1–Q4. Never infer H1 from Q1+Q2 here.
    """
    if key not in cfg or cfg.get(key) is None:
        return float(fallback or 0)
    try:
        return float(cfg[key])
    except (TypeError, ValueError):
        return float(fallback or 0)


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _category_annual_quotas() -> dict[str, dict[str, float]]:
    rules = _load_json(QUOTA_RULES_PATH)
    raw = rules.get("bu_annual_quotas") or {}
    out: dict[str, dict[str, float]] = {}
    for bu, divs in raw.items():
        if bu.startswith("_") or not isinstance(divs, dict):
            continue
        out[bu] = {k: float(v) for k, v in divs.items() if not str(k).startswith("_")}
    return out or {k: dict(v) for k, v in _DEFAULT_CATEGORY_ANNUAL_QUOTAS.items()}


def _ic_period_shares() -> dict[str, float]:
    """Q1/H1 mix from the IC roster.

    Tracker V5–V9 only fill annual BU quotas (H1/Q1 columns are blank).
    Split each BU annual target with the same mix as IC quotas so the H1/H2
    toggle on the Business Units page has a real quota and attainment %.
    """
    ic_quotas = _load_json(IC_QUOTAS_PATH)
    q1 = h1 = annual = 0.0
    for name, cfg in ic_quotas.items():
        if str(name).startswith("_") or not isinstance(cfg, dict):
            continue
        if cfg.get("division") not in RTM_DIVISIONS:
            continue
        q1 += float(cfg.get("q1_quota") or 0)
        h1 += float(cfg.get("h1_quota") or 0)
        annual += float(cfg.get("annual_quota") or 0)
    if not h1:
        h1 = q1
    if not annual:
        annual = h1
    return {
        "q1_of_h1": (q1 / h1) if h1 else 0.5,
        "h1_of_annual": (h1 / annual) if annual else 0.5,
    }


def _split_annual_quota(ann_q: float, shares: dict[str, float]) -> dict[str, float]:
    ann_q = float(ann_q or 0)
    h1_q = round(ann_q * shares["h1_of_annual"], 4)
    h2_q = round(ann_q - h1_q, 4)
    q1_q = round(h1_q * shares["q1_of_h1"], 4)
    q2_q = round(h1_q - q1_q, 4)
    return {"q1": q1_q, "q2": q2_q, "h1": h1_q, "h2": h2_q, "annual": round(ann_q, 4)}


def _load_aliases() -> dict[str, str]:
    data = _load_json(ALIASES_PATH)
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _canonical(name: str, aliases: dict[str, str]) -> str:
    n = _clean(name)
    return aliases.get(n, n)


# ── pipeline loading ──────────────────────────────────────────────────────────

def load_all_pipeline(aliases: dict[str, str], name_to_div: dict[str, str] | None = None) -> pd.DataFrame:
    """Load Q1–Q4 deals from SQLite (migrates leftover Excel once if the table is empty)."""
    import deal_store  # type: ignore

    migrated = deal_store.migrate_from_excel_if_empty()
    if migrated:
        print(f"[build]   Migrated {migrated} deals from leftover Pipeline Excel into SQLite")

    rows = deal_store.load_all_rows()
    if not rows:
        print("[build]   No deals in SQLite — run Vtiger sync")
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df.columns = [_clean(c) for c in df.columns]
    if "_quarter" not in df.columns:
        df["_quarter"] = ""
    df["_canonical_led_by"] = df.get("Opportunity Led By", pd.Series(dtype=str)).apply(
        lambda x: _canonical(_clean(x), aliases)
    )
    if name_to_div:
        df["Division"] = df["_canonical_led_by"].apply(lambda n: name_to_div.get(n, ""))
        df["Division"] = df["Division"].apply(
            lambda x: "GeoX" if _clean(x) in ("GeoX", "Geo X") else _clean(x)
        )
    return df


# ── IC actuals computation (DevSpec v2 formula) ───────────────────────────────

GEOX_IC = "Hrushikesh Bagade"


def compute_actuals_by_name(df: pd.DataFrame) -> dict[str, dict[str, dict]]:
    """
    Per DevSpec v2:
      IC Q1 Actuals = SUMIF(Pipeline Q1 col F, name, col O) / 1e7
      IC Q2 Actuals = SUMIF(Pipeline Q2 col F, name, col O) / 1e7
      GeoX exception: use 'Actual Bottomline -' instead of Amount
    Returns: {name → {q1: {amount_inr, deals}, q2: ..., q3: ..., q4: ...}}
    """
    if df.empty:
        return {}

    result: dict[str, dict] = {}

    for quarter in ("q1", "q2", "q3", "q4"):
        qdf = df[df["_quarter"] == quarter]
        for _, row in qdf.iterrows():
            name = _clean(row.get("_canonical_led_by", "") or "")
            if not name:
                continue
            is_geox = "hrushikesh" in name.lower()
            if is_geox:
                amt = _num(row.get("Actual Bottomline -")) or _num(row.get("Estimated Bottomline"))
            else:
                amt = _num(row.get("Amount"))

            entry = result.setdefault(name, {})
            q = entry.setdefault(quarter, {"amount_inr": 0.0, "deals": 0})
            q["amount_inr"] += amt
            q["deals"] += 1

    return result


def compute_actuals_by_cat_div(df: pd.DataFrame) -> dict[str, dict[str, dict]]:
    """
    Per DevSpec v2 V5–V9:
      SUMIFS(Amount, Category=cat, Division=div) per quarter
    Returns: {(bu, division, quarter) → amount_cr}
    """
    if df.empty or "Division" not in df.columns:
        return {}

    result: dict[tuple, float] = {}
    for _, row in df.iterrows():
        cat = _clean(row.get("Category", "") or "")
        bu = CAT_TO_BU.get(cat)
        if not bu:
            continue
        div = _clean(row.get("Division", "") or "")
        if not div:
            continue
        quarter = row.get("_quarter", "")
        amt = _num(row.get("Amount"))
        key = (bu, div, quarter)
        result[key] = result.get(key, 0.0) + amt

    return {k: round(v / 1e7, 4) for k, v in result.items()}


# ── IC roster + metrics ───────────────────────────────────────────────────────

def build_individuals(
    ic_quotas: dict,
    actuals_by_name: dict,
) -> list[dict]:
    """
    Build per-IC metric objects.
    Quotas come from ic_quotas.json (config).
    Actuals come from Pipeline (Vtiger).
    """
    individuals = []
    for name, cfg in ic_quotas.items():
        if name.startswith("_"):
            continue
        division = _clean(cfg.get("division", ""))
        ic_type = _clean(cfg.get("type", "IC"))

        pa = actuals_by_name.get(name, {})

        q1_act = _cr(pa.get("q1", {}).get("amount_inr", 0))
        q2_act = _cr(pa.get("q2", {}).get("amount_inr", 0))
        q3_act = _cr(pa.get("q3", {}).get("amount_inr", 0))
        q4_act = _cr(pa.get("q4", {}).get("amount_inr", 0))
        h1_act = round(q1_act + q2_act, 4)
        h2_act = round(q3_act + q4_act, 4)
        ann_act = round(h1_act + h2_act, 4)

        q1_q = _explicit_quota(cfg, "q1_quota")
        q2_q = _explicit_quota(cfg, "q2_quota")
        q3_q = _explicit_quota(cfg, "q3_quota")
        q4_q = _explicit_quota(cfg, "q4_quota")
        # Finance: H1/H2/Annual are fixed independently of Q1–Q4
        h1_q = _explicit_quota(cfg, "h1_quota")
        h2_q = _explicit_quota(cfg, "h2_quota")
        ann_q = _explicit_quota(cfg, "annual_quota")

        q1_deals  = pa.get("q1", {}).get("deals", 0)
        q2_deals  = pa.get("q2", {}).get("deals", 0)
        h1_deals  = q1_deals + q2_deals

        individuals.append({
            "name": name,
            "division": division,
            "fy": "FY 26-27",
            "persona": ic_type,
            "bu": None,
            "team_lead": _clean(cfg.get("reporting_manager") or "") or None,
            "active": True,
            "q1": _period(q1_act, q1_q),
            "q2": _period(q2_act, q2_q),
            "h1": _period(h1_act, h1_q),
            "q3": {**_period(q3_act, q3_q), "estimated": True},
            "q4": {**_period(q4_act, q4_q), "estimated": True},
            "h2": _period(h2_act, h2_q),
            "annual": _period(ann_act, ann_q),
            "deals": {
                "total": h1_deals,
                "q1": q1_deals,
                "q2": q2_deals,
            },
            "closed_deals": h1_deals,
            "rank_division": None,
            "pipeline_deals": [],
            "h1_attainment_pct": _att(h1_act, h1_q),
        })

    return individuals


# ── RTM division subtotals ────────────────────────────────────────────────────

def build_rtm_divisions(individuals: list[dict], cat_div_actuals: dict) -> list[dict]:
    """Aggregate per-IC actuals into division subtotals."""
    div_data: dict[str, dict] = {}

    for ic in individuals:
        div = ic.get("division", "")
        if not div or div not in RTM_DIVISIONS:
            continue
        d = div_data.setdefault(div, {p: {"actuals": 0.0, "quota": 0.0, "deals": 0} for p in ("q1", "q2", "h1", "h2", "annual", "q3", "q4")})
        for p in ("q1", "q2", "h1", "h2", "annual"):
            d[p]["actuals"] += (ic[p].get("actuals") or 0)
            d[p]["quota"] += (ic[p].get("quota") or 0)
        d["h1"]["deals"] += ic["deals"].get("total", 0)

    result = []
    for div in RTM_DIVISIONS:
        d = div_data.get(div)
        if not d:
            continue
        h1_q = d["h1"]["quota"]
        h1_a = d["h1"]["actuals"]
        q1_q = d["q1"]["quota"]
        q1_a = d["q1"]["actuals"]
        q2_q = d["q2"]["quota"]
        q2_a = d["q2"]["actuals"]
        h2_q = d["h2"]["quota"]
        h2_a = d["h2"]["actuals"]
        ann_q = d["annual"]["quota"]
        ann_a = d["annual"]["actuals"]

        result.append({
            "division": div,
            "h1": {"quota": round(h1_q,4), "actuals": round(h1_a,4), "attainment_pct": _att(h1_a, h1_q)},
            "q1": {"quota": round(q1_q,4), "actuals": round(q1_a,4), "attainment_pct": _att(q1_a, q1_q)},
            "q2": {"quota": round(q2_q,4), "actuals": round(q2_a,4), "attainment_pct": _att(q2_a, q2_q)},
            "h2": {"quota": round(h2_q,4), "actuals": round(h2_a,4), "attainment_pct": _att(h2_a, h2_q)},
            "annual": {"quota": round(ann_q,4), "actuals": round(ann_a,4), "attainment_pct": _att(ann_a, ann_q)},
            "closed_deals": d["h1"]["deals"],
            "status": _status_flag(_att(h1_a, h1_q)),
            "employee_count": sum(1 for ic in individuals if ic.get("division") == div),
        })

    return result


def _status_flag(att: float | None) -> str:
    if att is None:
        return "unknown"
    if att >= 50:
        return "on_track"
    if att >= 30:
        return "at_risk"
    return "critical"


# ── BU level ─────────────────────────────────────────────────────────────────

def build_bu_level(cat_div_actuals: dict, deals: list[dict] | None = None) -> list[dict]:
    """Build BU-level actuals. Includes 'service' field (= BU name) required by BUView."""
    bu_data: dict[str, dict] = {}
    for (bu, div, quarter), cr in cat_div_actuals.items():
        d = bu_data.setdefault(bu, {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0})
        d[quarter] = d.get(quarter, 0.0) + cr

    # Count deals per BU per quarter
    bu_deals: dict[str, dict[str, int]] = {}
    for d in (deals or []):
        bu = d.get("bu") or "Other"
        q = d.get("quarter") or "q1"
        bu_deals.setdefault(bu, {})[q] = bu_deals.get(bu, {}).get(q, 0) + 1

    BU_SERVICE_NAMES = {
        "DCG": "Data Centre Group", "CSN": "Cyber Security & Networking",
        "PS": "Professional Services", "CSG": "CSG (EndPoint)", "Cloud": "Cloud Services",
    }

    cat_quotas = _category_annual_quotas()
    shares = _ic_period_shares()
    result = []
    seen = list(dict.fromkeys([*bu_data.keys(), *cat_quotas.keys()]))
    for bu in seen:
        d = bu_data.get(bu, {})
        q1_a = d.get("q1", 0)
        q2_a = d.get("q2", 0)
        h1_a = round(q1_a + q2_a, 4)
        h2_a = round(d.get("q3", 0) + d.get("q4", 0), 4)
        ann_a = round(h1_a + h2_a, 4)
        div_quotas = cat_quotas.get(bu, {})
        pq = _split_annual_quota(sum(div_quotas.values()) if div_quotas else 0, shares)
        bd = bu_deals.get(bu, {})
        h1_deals = bd.get("q1", 0) + bd.get("q2", 0)
        h2_deals = bd.get("q3", 0) + bd.get("q4", 0)
        result.append({
            "bu": bu,
            "service": BU_SERVICE_NAMES.get(bu, bu),
            "q1": {**_period(q1_a, pq["q1"]), "deals": bd.get("q1", 0)},
            "q2": {**_period(q2_a, pq["q2"]), "deals": bd.get("q2", 0)},
            "h1": {**_period(h1_a, pq["h1"]), "deals": h1_deals},
            "h2": {**_period(h2_a, pq["h2"]), "deals": h2_deals},
            "annual": {**_period(ann_a, pq["annual"]), "deals": h1_deals + h2_deals},
        })

    result.sort(
        key=lambda b: BU_CARD_ORDER.index(b["bu"]) if b["bu"] in BU_CARD_ORDER else 99
    )
    return result


# ── Grand total + period metrics ──────────────────────────────────────────────

def build_grand_total(rtm_divisions: list[dict]) -> dict:
    """Sum all RTM division subtotals."""
    result = {}
    for period in ("q1", "q2", "h1", "h2", "annual"):
        total_quota = sum((d.get(period) or {}).get("quota") or 0 for d in rtm_divisions)
        total_actuals = sum((d.get(period) or {}).get("actuals") or 0 for d in rtm_divisions)
        att = _att(total_actuals, total_quota)
        result[period] = {
            "quota": round(total_quota, 4),
            "actuals": round(total_actuals, 4),
            "attainment_pct": att,
        }
    result["header_ic_actuals"] = result["h1"]["actuals"]
    result["header_h1_attainment_pct"] = result["h1"]["attainment_pct"]
    result["header_pipeline_cr"] = None
    result["header_closed_opps"] = sum(d.get("closed_deals", 0) for d in rtm_divisions)
    return result


def build_period_metrics(
    grand_total: dict,
    rtm_divisions: list[dict],
    pipeline_summary: dict | None,
    all_deals: list[dict],
) -> dict:
    """Build period_metrics structure for Overview cards."""

    def _closed_for(period_key: str) -> int:
        quarters = {
            "q1": {"q1"},
            "q2": {"q2"},
            "q3": {"q3"},
            "q4": {"q4"},
            "h1": {"q1", "q2"},
            "h2": {"q3", "q4"},
            "annual": {"q1", "q2", "q3", "q4"},
        }.get(period_key, set())
        return sum(
            1
            for d in all_deals
            if (d.get("quarter") or "") in quarters
            and (d.get("rtm_division") or "") in RTM_DIVISIONS
        )

    def _snap(period_key: str, show_att: bool = True) -> dict:
        gt = grand_total.get(period_key, {})
        q = gt.get("quota") or 0
        a = gt.get("actuals") or 0
        return {
            "ic_quota": round(q, 4),
            "ic_actuals": round(a, 4),
            "ic_attainment_pct": _att(a, q) if show_att and a else None,
            "closed_deals": _closed_for(period_key),
            "show_attainment": show_att and a > 0,
            "stly_actuals_cr": None,
        }

    return {
        "q1": _snap("q1"),
        "q2": _snap("q2", show_att=(grand_total.get("q2", {}).get("actuals") or 0) > 0),
        "h1": _snap("h1"),
        "q3": {**_snap("q3", show_att=False), "estimated": True},
        "q4": {**_snap("q4", show_att=False), "estimated": True},
        "h2": _snap("h2", show_att=(grand_total.get("h2", {}).get("actuals") or 0) > 0),
        "annual": _snap("annual", show_att=(grand_total.get("annual", {}).get("actuals") or 0) > 0),
    }


# ── Pipeline deals (accounts, brands, employees) ──────────────────────────────

def _parse_crm_status(deal_status: str, sales_stage: str) -> dict:
    """Compute CRM status indicators (booked/billed/received) from deal fields."""
    status = (deal_status or "").strip().lower()
    stage = (sales_stage or "").strip().lower()
    booked = "closed" in stage or "booked" in status
    billed: bool | str = "none"
    received: bool | str = "none"
    if "partially received" in status or "partial received" in status:
        received = "partial"; billed = "full"; booked = True
    elif "received" in status:
        received = "full"; billed = "full"; booked = True
    elif "partially billed" in status or "partial billed" in status:
        billed = "partial"; booked = True
    elif "billed" in status:
        billed = "full"; booked = True
    elif booked:
        billed = "partial"
    return {"booked": booked, "billed": billed, "received": received}


def build_deal_records(df: pd.DataFrame, individuals: list[dict]) -> list[dict]:
    """Convert pipeline DataFrame rows to structured deal records."""
    if df.empty:
        return []

    rules = _load_json(QUOTA_RULES_PATH)
    ps_included = {s.lower() for s in rules.get("ps_included_subcategories", [])}
    ps_excluded = {s.lower() for s in rules.get("ps_excluded_subcategories", [])}
    multipliers_cfg = rules.get("multipliers", {})
    dcg_backup = {s.lower() for s in rules.get("dcg_backup_storage_subcategories", [])}

    ic_div_map = {ic["name"]: ic.get("division") for ic in individuals}

    deals = []
    for _, row in df.iterrows():
        name = _clean(row.get("_canonical_led_by", "") or "")
        cat = _clean(row.get("Category", "") or "")
        sub_cat = _clean(row.get("Sub Category", "") or "")
        bu = CAT_TO_BU.get(cat, cat)
        amount_inr = _num(row.get("Amount"))
        bl_inr = _num(row.get("Actual Bottomline -")) or _num(row.get("Estimated Bottomline"))
        div = _clean(row.get("Division", "") or "") or ic_div_map.get(name, "")

        # Multiplier logic
        multiplier = 1.0
        reason = "1x"
        if bu == "PS":
            sc_lower = sub_cat.lower()
            if sc_lower in ps_included:
                multiplier = float(multipliers_cfg.get("PS", 2.0))
                reason = f"{multiplier}x PS"
        elif bu == "CSN":
            multiplier = float(multipliers_cfg.get("CSN", 1.3))
            reason = f"{multiplier}x CSN"
        elif bu == "DCG":
            if sub_cat.lower() in dcg_backup:
                multiplier = float(multipliers_cfg.get("DCG_backup_storage", 1.2))
                reason = f"{multiplier}x DCG backup/storage"

        quota_credit_inr = amount_inr * multiplier
        gp_pct = round(bl_inr / amount_inr * 100, 2) if amount_inr else 0.0
        crm = _parse_crm_status(
            _clean(row.get("Deal Status", "") or ""),
            _clean(row.get("Sales Stage", "") or "")
        )

        deals.append({
            "opportunity_number": _clean(row.get("Opportunity Number", "") or ""),
            "account": _clean(row.get("Organization Name", "") or ""),
            "opportunity_name": _clean(row.get("Opportunity Name", "") or ""),
            "topline_inr": round(amount_inr, 2),
            "topline_cr": _cr(amount_inr),
            "amount_inr": round(amount_inr, 2),
            "amount_cr": _cr(amount_inr),
            "bottomline_inr": round(bl_inr, 2),
            "bottomline_cr": _cr(bl_inr),
            "gp_pct": gp_pct,
            "multiplier": multiplier,
            "multiplier_reason": reason,
            "quota_credit_inr": round(quota_credit_inr, 2),
            "quota_credit_cr": _cr(quota_credit_inr),
            "category": cat,
            "bu": bu,
            "sub_category": sub_cat,
            "brand": _clean(row.get("Brand", "") or ""),
            "close_date": _clean(row.get("Expected Close Date", "") or ""),
            "deal_category": _clean(row.get("Deal Category", "") or ""),
            "employee": name,
            "pipeline_led_by": name,
            "assigned_to": _clean(row.get("Assigned To", "") or ""),
            "rtm_division": div,
            "quarter": row.get("_quarter", ""),
            "opf_no": _clean(row.get("OPF No.", "") or ""),
            "crm": crm,
            "deal_status_raw": _clean(row.get("Deal Status", "") or ""),
            "excluded_from_achievement": False,
            "exclusion_reason": None,
        })

    return deals


def build_pipeline_summary(deals: list[dict]) -> dict:
    """High-level pipeline summary for header."""
    counted = [d for d in deals if d["employee"] and "hrushikesh" not in d["employee"].lower()]
    total_rev = sum(d["topline_inr"] for d in counted)
    total_bl = sum(d["bottomline_inr"] for d in counted)
    accounts = {d["account"] for d in counted if d["account"]}
    return {
        "total_deals": len(counted),
        "total_deals_all": len(deals),
        "total_revenue_inr": round(total_rev, 2),
        "total_revenue_cr": round(_cr(total_rev), 2),
        "total_bottomline_inr": round(total_bl, 2),
        "total_bottomline_cr": round(_cr(total_bl), 2),
        "unique_accounts": len(accounts),
        "source": "Vtiger CRM — direct sync",
    }


def build_accounts(deals: list[dict], ic_h1_quota_cr: float = 0, pipeline_topline_cr: float = 0, pipeline_bottomline_cr: float = 0) -> list[dict]:
    """Org-level account rollup matching the AccountRecord type expected by AccountsView."""
    acct_map: dict[str, dict] = {}
    for d in deals:
        acct = d["account"] or "Unknown"
        a = acct_map.setdefault(acct, {
            "account": acct, "deal_count": 0, "revenue_inr": 0.0, "bottomline_inr": 0.0,
            "quota_credit_inr": 0.0, "_employees": set(), "_rtm_divs": set(), "_by_bu": {}, "deals": [],
        })
        a["deal_count"] += 1
        a["revenue_inr"] += d["topline_inr"]
        a["bottomline_inr"] += d["bottomline_inr"]
        a["quota_credit_inr"] += d["quota_credit_inr"]
        if d["employee"]:
            a["_employees"].add(d["employee"])
        if d["rtm_division"]:
            a["_rtm_divs"].add(d["rtm_division"])
        bu = d["bu"] or "Other"
        b = a["_by_bu"].setdefault(bu, {"bu": bu, "deal_count": 0, "revenue_inr": 0.0, "bottomline_inr": 0.0})
        b["deal_count"] += 1
        b["revenue_inr"] += d["topline_inr"]
        b["bottomline_inr"] += d["bottomline_inr"]
        a["deals"].append(d)

    result = []
    ic_q = float(ic_h1_quota_cr) * 1e7 if ic_h1_quota_cr else 0
    for a in acct_map.values():
        rev = a["revenue_inr"]
        bl = a["bottomline_inr"]
        qc = a["quota_credit_inr"]
        gp = round(bl / rev * 100, 2) if rev else 0.0
        by_bu = [
            {"bu": v["bu"], "deal_count": v["deal_count"],
             "revenue_inr": round(v["revenue_inr"], 2), "revenue_cr": _cr(v["revenue_inr"]),
             "bottomline_inr": round(v["bottomline_inr"], 2), "bottomline_cr": _cr(v["bottomline_inr"])}
            for v in sorted(a["_by_bu"].values(), key=lambda x: x["revenue_inr"], reverse=True)
        ]
        employees = sorted(a["_employees"])
        rtm_divs = sorted(a["_rtm_divs"])
        result.append({
            "account": a["account"],
            "deal_count": a["deal_count"],
            "revenue_inr": round(rev, 2),
            "revenue_cr": _cr(rev),
            "bottomline_inr": round(bl, 2),
            "bottomline_cr": _cr(bl),
            "quota_credit_inr": round(qc, 2),
            "quota_credit_cr": _cr(qc),
            "gp_pct": gp,
            "pct_of_ic_h1_quota": round(rev / ic_q * 100, 2) if ic_q else None,
            "pct_of_pipeline_topline": round(_cr(rev) / pipeline_topline_cr * 100, 2) if pipeline_topline_cr else None,
            "pct_of_pipeline_bottomline": round(_cr(bl) / pipeline_bottomline_cr * 100, 2) if pipeline_bottomline_cr else None,
            "employees": employees,
            "employee_count": len(employees),
            "rtm_divisions": rtm_divs,
            "primary_bu": by_bu[0]["bu"] if by_bu else None,
            "by_bu": by_bu,
            "deals": sorted(a["deals"], key=lambda x: x["amount_inr"], reverse=True),
        })
    return sorted(result, key=lambda x: x["revenue_inr"], reverse=True)


def build_brands(deals: list[dict], ic_h1_quota_cr: float = 0, pipeline_topline_cr: float = 0, pipeline_bottomline_cr: float = 0) -> list[dict]:
    """Brand rollup matching the BrandRecord type expected by BrandsView."""
    brand_map: dict[str, dict] = {}
    for d in deals:
        brand = d["brand"] or "Other"
        b = brand_map.setdefault(brand, {
            "brand": brand, "deal_count": 0, "revenue_inr": 0.0, "bottomline_inr": 0.0,
            "quota_credit_inr": 0.0, "_employees": set(), "_rtm_divs": set(), "_accounts": set(),
            "top_accounts": {}, "_by_bu": {}, "_deals_list": [],
        })
        b["deal_count"] += 1
        b["revenue_inr"] += d["topline_inr"]
        b["bottomline_inr"] += d["bottomline_inr"]
        b["quota_credit_inr"] += d["quota_credit_inr"]
        if d["employee"]:
            b["_employees"].add(d["employee"])
        if d["rtm_division"]:
            b["_rtm_divs"].add(d["rtm_division"])
        if d["account"]:
            b["_accounts"].add(d["account"])
            ta = b["top_accounts"].setdefault(d["account"], {"account": d["account"], "revenue_cr": 0.0})
            ta["revenue_cr"] += _cr(d["topline_inr"])
        bu_key = d["bu"] or "Other"
        bub = b["_by_bu"].setdefault(bu_key, {"bu": bu_key, "deal_count": 0, "revenue_inr": 0.0, "bottomline_inr": 0.0})
        bub["deal_count"] += 1
        bub["revenue_inr"] += d["topline_inr"]
        bub["bottomline_inr"] += d["bottomline_inr"]
        b["_deals_list"].append(d)

    result = []
    ic_q = float(ic_h1_quota_cr) * 1e7 if ic_h1_quota_cr else 0
    for b in brand_map.values():
        rev = b["revenue_inr"]
        bl = b["bottomline_inr"]
        qc = b["quota_credit_inr"]
        gp = round(bl / rev * 100, 2) if rev else 0.0
        top_accounts = sorted(b["top_accounts"].values(), key=lambda x: x["revenue_cr"], reverse=True)[:5]
        by_bu_list = [
            {"bu": v["bu"], "deal_count": v["deal_count"],
             "revenue_inr": round(v["revenue_inr"], 2), "revenue_cr": _cr(v["revenue_inr"]),
             "bottomline_inr": round(v["bottomline_inr"], 2), "bottomline_cr": _cr(v["bottomline_inr"])}
            for v in sorted(b["_by_bu"].values(), key=lambda x: x["revenue_inr"], reverse=True)
        ]
        result.append({
            "brand": b["brand"],
            "deal_count": b["deal_count"],
            "revenue_inr": round(rev, 2),
            "revenue_cr": _cr(rev),
            "bottomline_inr": round(bl, 2),
            "bottomline_cr": _cr(bl),
            "quota_credit_inr": round(qc, 2),
            "quota_credit_cr": _cr(qc),
            "gp_pct": gp,
            "pct_of_ic_h1_quota": round(rev / ic_q * 100, 2) if ic_q else None,
            "pct_of_pipeline_topline": round(_cr(rev) / pipeline_topline_cr * 100, 2) if pipeline_topline_cr else None,
            "pct_of_pipeline_bottomline": round(_cr(bl) / pipeline_bottomline_cr * 100, 2) if pipeline_bottomline_cr else None,
            "employees": sorted(b["_employees"]),
            "employee_count": len(b["_employees"]),
            "account_count": len(b["_accounts"]),
            "rtm_divisions": sorted(b["_rtm_divs"]),
            "primary_bu": by_bu_list[0]["bu"] if by_bu_list else None,
            "by_bu": by_bu_list,
            "top_accounts": top_accounts,
            "deals": sorted(b.get("_deals_list", []), key=lambda x: x["amount_inr"], reverse=True),
        })
    return sorted(result, key=lambda x: x["revenue_inr"], reverse=True)


def build_leaders_dashboard(deals: list[dict]) -> list[dict]:
    """Build leaders_dashboard matching LeaderDashboardRecord type."""
    leader_roster = _load_json(LEADER_ROSTER_PATH)
    if not leader_roster:
        return []

    aliases = _load_aliases()

    # Aggregate by leader name
    by_name: dict[str, dict] = {}
    by_name_deals: dict[str, list] = {}
    for d in deals:
        name = d["employee"]
        e = by_name.setdefault(name, {"topline_inr": 0.0, "bottomline_inr": 0.0, "quota_credit_inr": 0.0, "deal_count": 0})
        e["topline_inr"] += d["topline_inr"]
        e["bottomline_inr"] += d["bottomline_inr"]
        e["quota_credit_inr"] += d["quota_credit_inr"]
        e["deal_count"] += 1
        by_name_deals.setdefault(name, []).append(d)

    result = []
    for leader in leader_roster:
        name = leader.get("name", "")
        if not name or name.startswith("_"):
            continue
        canon = aliases.get(name, name)
        ld = by_name.get(canon) or by_name.get(name) or {"topline_inr": 0.0, "bottomline_inr": 0.0, "quota_credit_inr": 0.0, "deal_count": 0}
        ldeals = by_name_deals.get(canon) or by_name_deals.get(name) or []

        tl_cr = _cr(ld["topline_inr"])
        bl_cr = _cr(ld["bottomline_inr"])
        qc_cr = _cr(ld["quota_credit_inr"])
        gp = round(ld["bottomline_inr"] / ld["topline_inr"] * 100, 2) if ld["topline_inr"] else 0.0
        dc = ld["deal_count"]

        # Build team_members from scope_depts if available
        scope_divs = leader.get("rollup_divisions", [leader.get("division", "")])

        # Top deals — must include all fields used by LeaderDetail (opportunity_number, employee, crm, gp_pct)
        top_deals = []
        for d in sorted(ldeals, key=lambda x: x.get("topline_inr", 0), reverse=True)[:10]:
            top_deals.append({
                "opportunity_number": d.get("opportunity_number", f"deal-{len(top_deals)}"),
                "opportunity_name": d.get("opportunity_name", ""),
                "account": d.get("account", ""),
                "employee": d.get("employee", ""),
                "topline_cr": d.get("topline_cr", 0),
                "topline_inr": d.get("topline_inr", 0),
                "bottomline_cr": d.get("bottomline_cr", 0),
                "bottomline_inr": d.get("bottomline_inr", 0),
                "bu": d.get("bu", ""),
                "close_date": d.get("close_date", ""),
                "gp_pct": d.get("gp_pct", 0),
                "crm": d.get("crm", {}),
                "quota_credit_cr": d.get("quota_credit_cr", 0),
                "multiplier": d.get("multiplier", 1.0),
                "category": d.get("category", ""),
                "sub_category": d.get("sub_category", ""),
                "brand": d.get("brand", ""),
                "rtm_division": d.get("rtm_division", ""),
                "excluded_from_achievement": False,
            })

        result.append({
            "name": name,
            "initial": leader.get("initial", name[:2].upper()),
            "dept": leader.get("dept", leader.get("division", "")),
            "division": leader.get("division", ""),
            "bu": leader.get("bu", ""),
            "role": "Head",
            "reports_to": "CEO",
            "team_size": dc,
            "status": _status_flag(None),
            "q1": {"quota": 0, "actuals": tl_cr, "attainment_pct": None},
            "q2": {"quota": 0, "actuals": 0.0, "attainment_pct": None},
            "h1": {"quota": 0, "actuals": tl_cr, "attainment_pct": None},
            "h2": {"actuals": 0.0, "quota": 0, "attainment_pct": None},
            "annual": {"actuals": tl_cr, "quota": 0, "attainment_pct": None},
            "pipeline": {
                "deal_count": dc,
                "topline_cr": tl_cr,
                "bottomline_cr": bl_cr,
                "quota_credit_cr": qc_cr,
                "gp_pct": gp,
                "total_revenue_cr": tl_cr,
                "total_bottomline_cr": bl_cr,
            },
            "team_members": [],
            "top_deals": top_deals,
        })
    return result


def build_rtm_by_bu(cat_div_actuals: dict) -> dict[str, list]:
    """Build rtm_by_bu for the BUView detail drill-down.

    Each row needs a 'name' field (BUView uses r.name) and period actuals.
    """
    cat_quotas = _category_annual_quotas()
    shares = _ic_period_shares()
    rtm_by_bu: dict[str, list] = {}
    for (bu, div, quarter), cr in cat_div_actuals.items():
        rows = rtm_by_bu.setdefault(bu, [])
        existing = next((r for r in rows if r["division"] == div), None)
        if not existing:
            existing = {
                "name": div,        # BUView accesses r.name
                "division": div,
                "bu": bu,
                "q1": {"actuals": 0, "quota": None}, "q2": {"actuals": 0, "quota": None},
                "h1": {"actuals": 0, "quota": None}, "h2": {"actuals": 0, "quota": None},
                "q3": {"actuals": 0, "quota": None}, "q4": {"actuals": 0, "quota": None},
                "annual": {"actuals": 0, "quota": cat_quotas.get(bu, {}).get(div)},
            }
            rows.append(existing)
        if quarter in ("q1", "q2", "h1", "h2", "q3", "q4"):
            existing[quarter]["actuals"] = round((existing[quarter].get("actuals") or 0) + cr, 4)
    for bu, rows in rtm_by_bu.items():
        for r in rows:
            r["h1"]["actuals"] = round((r["q1"]["actuals"] or 0) + (r["q2"]["actuals"] or 0), 4)
            r["h2"]["actuals"] = round((r["q3"]["actuals"] or 0) + (r["q4"]["actuals"] or 0), 4)
            r["annual"]["actuals"] = round(r["h1"]["actuals"] + r["h2"]["actuals"], 4)
            pq = _split_annual_quota(cat_quotas.get(bu, {}).get(r["division"]) or 0, shares)
            for period in ("q1", "q2", "h1", "h2", "annual"):
                r[period]["quota"] = pq[period]
                r[period]["attainment_pct"] = _att(r[period].get("actuals") or 0, pq[period])
    return rtm_by_bu


def attach_deals_to_individuals(individuals: list[dict], deals: list[dict]) -> None:
    """Attach deal records to each IC for the Employees page.

    Builds the EmployeePipeline structure expected by EmployeesView:
      pipeline.deal_count, pipeline.account_count, pipeline.closed_accounts, pipeline.closed_deals
    """
    by_name: dict[str, list] = {}
    for d in deals:
        by_name.setdefault(d["employee"], []).append(d)

    for ic in individuals:
        ic_deals = sorted(by_name.get(ic["name"], []), key=lambda x: x["amount_inr"], reverse=True)
        ic["pipeline_deals"] = ic_deals
        ic["closed_deals"] = len(ic_deals)

        # Build EmployeePipeline structure
        total_rev_inr = sum(d["topline_inr"] for d in ic_deals)
        total_bl_inr = sum(d["bottomline_inr"] for d in ic_deals)
        accounts: dict[str, dict] = {}
        for d in ic_deals:
            acct = d["account"] or "Unknown"
            a = accounts.setdefault(acct, {"account": acct, "deal_count": 0, "topline_inr": 0.0, "bottomline_inr": 0.0, "deals": []})
            a["deal_count"] += 1
            a["topline_inr"] += d["topline_inr"]
            a["bottomline_inr"] += d["bottomline_inr"]
            a["deals"].append(d)
        closed_accounts = sorted(accounts.values(), key=lambda x: x["topline_inr"], reverse=True)
        for a in closed_accounts:
            a["topline_cr"] = _cr(a["topline_inr"])
            a["bottomline_cr"] = _cr(a["bottomline_inr"])

        ic["pipeline"] = {
            "deal_count": len(ic_deals),
            "deal_count_total": len(ic_deals),
            "account_count": len(accounts),
            "total_revenue_inr": round(total_rev_inr, 2),
            "total_revenue_cr": _cr(total_rev_inr),
            "total_bottomline_inr": round(total_bl_inr, 2),
            "total_bottomline_cr": _cr(total_bl_inr),
            "total_quota_credit_inr": round(sum(d["quota_credit_inr"] for d in ic_deals), 2),
            "total_quota_credit_cr": _cr(sum(d["quota_credit_inr"] for d in ic_deals)),
            "closed_accounts": closed_accounts,
            "closed_deals": ic_deals,
        }


def build_top_attainers(individuals: list[dict]) -> dict:
    rtm_ics = [ic for ic in individuals if ic.get("division") in RTM_DIVISIONS]
    by_pct = sorted(
        [ic for ic in rtm_ics if ic["h1"].get("attainment_pct") is not None],
        key=lambda x: x["h1"]["attainment_pct"],
        reverse=True,
    )[:5]
    by_val = sorted(
        [ic for ic in rtm_ics if (ic["h1"].get("actuals") or 0) > 0],
        key=lambda x: x["h1"].get("actuals", 0),
        reverse=True,
    )[:5]
    return {
        "by_attainment_pct": [{"name": ic["name"], "division": ic["division"], "h1_attainment_pct": ic["h1"].get("attainment_pct"), "h1_actuals": ic["h1"].get("actuals")} for ic in by_pct],
        "by_value_closed": [{"name": ic["name"], "division": ic["division"], "h1_actuals": ic["h1"].get("actuals"), "h1_attainment_pct": ic["h1"].get("attainment_pct")} for ic in by_val],
    }


def build_at_risk(individuals: list[dict]) -> list[dict]:
    rtm_ics = [ic for ic in individuals if ic.get("division") in RTM_DIVISIONS]
    rules = _load_json(QUOTA_RULES_PATH)
    at_risk_threshold = rules.get("status_thresholds", {}).get("at_risk", 30)
    return [
        {
            "name": ic["name"],
            "division": ic["division"],
            "h1_attainment_pct": ic["h1"].get("attainment_pct"),
            "h1_actuals": ic["h1"].get("actuals"),
            "h1_quota": ic["h1"].get("quota"),
        }
        for ic in rtm_ics
        if (ic["h1"].get("attainment_pct") or 0) < at_risk_threshold
    ]


def _current_fy() -> str:
    today = date.today()
    year = today.year if today.month >= 4 else today.year - 1
    return f"FY {str(year)[2:]}-{str(year+1)[2:]}"


def _fy_week() -> int:
    today = date.today()
    year = today.year if today.month >= 4 else today.year - 1
    fy_start = date(year, 4, 1)
    return (today - fy_start).days // 7 + 1


# ── main build function ───────────────────────────────────────────────────────

def build(output_path: Path = OUTPUT_PATH) -> dict:
    """Build quota_data.json from Vtiger pipeline + config files."""
    print("[build] Loading config files...")
    ic_quotas = _load_json(IC_QUOTAS_PATH)
    aliases = _load_aliases()

    if not ic_quotas:
        raise FileNotFoundError(f"ic_quotas.json not found at {IC_QUOTAS_PATH}. Run scripts/extract_quotas.py first.")

    # Build name→division lookup for Division column fallback (legacy pipeline files)
    name_to_div = {
        name: _clean(cfg.get("division", ""))
        for name, cfg in ic_quotas.items()
        if not name.startswith("_") and cfg.get("division")
    }

    print("[build] Loading deals from SQLite...")
    full_df = load_all_pipeline(aliases, name_to_div=name_to_div)
    total_deals = len(full_df) if not full_df.empty else 0
    print(f"[build]   Loaded {total_deals} total deals across all quarters")

    print("[build] Computing actuals by IC name...")
    actuals_by_name = compute_actuals_by_name(full_df)

    print("[build] Computing category/division actuals...")
    cat_div_actuals = compute_actuals_by_cat_div(full_df)

    print("[build] Building IC metrics...")
    individuals = build_individuals(ic_quotas, actuals_by_name)

    print("[build] Building RTM division subtotals...")
    rtm_divisions = build_rtm_divisions(individuals, cat_div_actuals)

    print("[build] Building deal records...")
    deals = build_deal_records(full_df, individuals)
    attach_deals_to_individuals(individuals, deals)

    print("[build] Building BU level metrics...")
    bu_level = build_bu_level(cat_div_actuals, deals=deals)

    grand_total = build_grand_total(rtm_divisions)

    pipeline_summary = build_pipeline_summary(deals)
    period_metrics = build_period_metrics(grand_total, rtm_divisions, pipeline_summary, deals)

    rtm_ics = [ic for ic in individuals if ic.get("division") in RTM_DIVISIONS]
    h1_quota_cr = grand_total.get("h1", {}).get("quota") or 0
    pl_tl = pipeline_summary["total_revenue_cr"] if pipeline_summary else 0
    pl_bl = pipeline_summary["total_bottomline_cr"] if pipeline_summary else 0
    accounts = build_accounts(deals, ic_h1_quota_cr=h1_quota_cr, pipeline_topline_cr=pl_tl, pipeline_bottomline_cr=pl_bl)
    brands = build_brands(deals, ic_h1_quota_cr=h1_quota_cr, pipeline_topline_cr=pl_tl, pipeline_bottomline_cr=pl_bl)
    leaders_dashboard = build_leaders_dashboard(deals)
    rtm_by_bu = build_rtm_by_bu(cat_div_actuals)
    top_attainers = build_top_attainers(individuals)
    at_risk_ics = build_at_risk(individuals)

    h1_gt = grand_total.get("h1", {})
    q1_gt = grand_total.get("q1", {})
    ann_gt = grand_total.get("annual", {})

    kpis = {
        "h1_quota_cr": round(h1_gt.get("quota") or 0, 2),
        "h1_actuals_cr": round(h1_gt.get("actuals") or 0, 2),
        "h1_attainment_pct": h1_gt.get("attainment_pct") or 0,
        "annual_quota_cr": round(ann_gt.get("quota") or COMPANY_ANNUAL_QUOTA_CR, 2),
        "ic_h1_quota_cr": round(h1_gt.get("quota") or 0, 2),
        "ic_h1_actuals_cr": round(h1_gt.get("actuals") or 0, 2),
        "ic_h1_attainment_pct": h1_gt.get("attainment_pct") or 0,
        "ic_q1_quota_cr": round(q1_gt.get("quota") or 0, 2),
        "ic_q1_actuals_cr": round(q1_gt.get("actuals") or 0, 2),
        "ic_q1_attainment_pct": q1_gt.get("attainment_pct") or 0,
        "total_employees": len(rtm_ics),
        "total_divisions": len(rtm_divisions),
        "total_bus": len(bu_level),
        "total_deals_h1": sum(d.get("closed_deals", 0) for d in rtm_divisions),
        "pipeline_deals": len(deals),
        "pipeline_revenue_cr": round(pipeline_summary["total_revenue_cr"], 2) if pipeline_summary else 0,
        "pipeline_accounts": len(accounts),
        "header_pipeline_cr": round(pipeline_summary["total_revenue_cr"], 2) if pipeline_summary else None,
        "header_closed_opps": total_deals,
        "header_ic_actuals": round(h1_gt.get("actuals") or 0, 2),
        "header_h1_attainment_pct": h1_gt.get("attainment_pct"),
    }

    output = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "fy": _current_fy(),
            "timeline_week": _fy_week(),
            "source": "vtiger_sqlite",
            "pipeline_files": {
                "q1": True,
                "q2": True,
                "q3": True,
                "q4": True,
            },
        },
        "kpis": kpis,
        "grand_total": grand_total,
        "period_metrics": period_metrics,
        "rtm_divisions": rtm_divisions,
        "division_aggregates": rtm_divisions,
        "individuals": individuals,
        "bu_level": bu_level,
        "pipeline": {
            "summary": pipeline_summary,
            "all_deals": deals,
            "by_bu": {},
            "by_rtm": {},
            "by_category": {},
            "total_revenue_cr": round(pipeline_summary["total_revenue_cr"], 2) if pipeline_summary else 0,
            "total_bottomline_cr": round(pipeline_summary["total_bottomline_cr"], 2) if pipeline_summary else 0,
            "total_deals": len(deals),
            "unique_accounts": len(accounts),
            "source": "Vtiger CRM — direct sync",
        },
        "accounts": accounts,
        "brands": brands,
        "top_attainers": top_attainers,
        "at_risk_ics": at_risk_ics,
        "leaders": [],
        "leaders_dashboard": leaders_dashboard,
        "rtm_by_bu": rtm_by_bu,
        "teams": [],
        "target_quota": None,
        "employee_mapping_count": len(ic_quotas),
        "total_employees": len(rtm_ics),
        "total_divisions": len(rtm_divisions),
        "total_bus": len(bu_level),
        "header_ic_actuals": kpis["header_ic_actuals"],
        "header_h1_attainment_pct": kpis["header_h1_attainment_pct"],
        "header_pipeline_cr": kpis["header_pipeline_cr"],
        "header_closed_opps": total_deals,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=output_path.parent, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, output_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    print(f"[build] Wrote {output_path}")
    print(f"[build]   Individuals: {len(individuals)}")
    print(f"[build]   RTM Divisions: {len(rtm_divisions)}")
    print(f"[build]   BUs: {len(bu_level)}")
    print(f"[build]   Pipeline deals: {len(deals)} (Rs. {pipeline_summary['total_revenue_cr']} Cr)")
    print(f"[build]   Accounts: {len(accounts)}")
    print(f"[build]   Brands: {len(brands)}")

    return output


def main():
    build()


if __name__ == "__main__":
    main()
