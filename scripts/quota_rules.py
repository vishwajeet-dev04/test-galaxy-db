"""Quota multiplier, CRM status, and GP exclusion rules.

All configurable values are loaded from config/quota_rules.json so Finance
can adjust multipliers and thresholds without touching Python code.
"""
from __future__ import annotations

import json
from pathlib import Path

# ── Load config ────────────────────────────────────────────────────────────────
_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "quota_rules.json"


def _load_rules() -> dict:
    if _CONFIG_PATH.exists():
        with _CONFIG_PATH.open(encoding="utf-8") as f:
            raw = json.load(f)
        raw.pop("_comment", None)
        return raw
    return {}


_RULES = _load_rules()

# ── Multiplier values ──────────────────────────────────────────────────────────
_MUL = _RULES.get("multipliers", {})
PS_MULTIPLIER               = float(_MUL.get("PS",                 2.0))
CSN_MULTIPLIER              = float(_MUL.get("CSN",                1.3))
DCG_BACKUP_STORAGE_MULTIPLIER = float(_MUL.get("DCG_backup_storage", 1.2))

# ── PS sub-category lists ──────────────────────────────────────────────────────
PS_INCLUDED_SUBCATS: set[str] = {
    s.lower() for s in _RULES.get("ps_included_subcategories", [
        "managed services", "managed services - remote", "managed services - hybrid",
        "soc services", "cloud services", "automation & tools", "deployment services",
    ])
}
PS_EXCLUDED_SUBCATS: set[str] = {
    s.lower() for s in _RULES.get("ps_excluded_subcategories", [
        "residency services",
        "multi-vendor support (3rd party amc)",
        "day-2 services (onsite support) with product/ solution sale",
        "day-2 services (onsite support) without  product/ solution sale",
        "time & material services",
    ])
}
DCG_QUALIFIED_SUBCATS: set[str] = {
    s.lower() for s in _RULES.get("dcg_backup_storage_subcategories", ["backup & recovery", "storage"])
}

# ── GP exclusion ───────────────────────────────────────────────────────────────
_GP = _RULES.get("gp_exclusion", {})
HRUSHIKESH_BAGADE = _GP.get("employee", "Hrushikesh Bagade")
GP_MIN_OVERALL_PCT = float(_GP.get("min_overall_pct", 5.0))
GP_DEAL_EXCLUDE_PCT = float(_GP.get("exclude_deal_pct", 3.0))

# ── Status thresholds ──────────────────────────────────────────────────────────
_ST = _RULES.get("status_thresholds", {})
STATUS_ON_TRACK = float(_ST.get("on_track", 50))
STATUS_AT_RISK  = float(_ST.get("at_risk", 30))


# ── Rule functions ─────────────────────────────────────────────────────────────

def normalize_subcat(sub_category: str | None) -> str:
    return (sub_category or "").strip().lower()


def get_deal_multiplier(bu: str, sub_category: str | None, category: str | None = None):
    """Return (multiplier, reason_string)."""
    sub = normalize_subcat(sub_category)
    cat = (category or "").lower()

    if bu == "PS" or "professional services" in cat:
        if sub in PS_EXCLUDED_SUBCATS:
            return 1.0, "PS secondary focus — no multiplier"
        if sub in PS_INCLUDED_SUBCATS or "managed" in sub:
            return PS_MULTIPLIER, f"PS {PS_MULTIPLIER}X"
        if "soc" in sub or "cloud service" in sub or "automation" in sub:
            return PS_MULTIPLIER, f"PS {PS_MULTIPLIER}X"
        return 1.0, "PS — no qualifying multiplier"

    if bu == "CSN" or "cyber security" in cat:
        return CSN_MULTIPLIER, f"CSN {CSN_MULTIPLIER}X"

    if bu == "DCG" or "data centre" in cat:
        if sub in DCG_QUALIFIED_SUBCATS or "backup" in sub or sub == "storage":
            return DCG_BACKUP_STORAGE_MULTIPLIER, f"DCG Backup/Storage {DCG_BACKUP_STORAGE_MULTIPLIER}X"
        return 1.0, "DCG — standard rate"

    return 1.0, "Standard 1X"


def parse_crm_status(deal_status: str | None, sales_stage: str | None) -> dict:
    """
    CRM lifecycle indicators:
    A. Booked  B. Billed / Partially Billed  C. Received / Partially Received
    """
    status = (deal_status or "-").strip().lower()
    stage = (sales_stage or "").strip().lower()

    booked = "closed" in stage or "booked" in status
    billed = "none"
    received = "none"

    if "partially received" in status or "partial received" in status:
        received = "partial"
        billed = "full"
        booked = True
    elif "received" in status:
        received = "full"
        billed = "full"
        booked = True
    elif "partially billed" in status or "partial billed" in status:
        billed = "partial"
        booked = True
    elif "billed" in status:
        billed = "full"
        booked = True
    elif status == "approved":
        booked = True
        billed = "partial"
    elif booked:
        billed = "none"
        received = "none"

    return {"booked": booked, "billed": billed, "received": received}


def compute_gp_pct(amount_inr: float, bottomline_inr: float) -> float:
    if not amount_inr or amount_inr <= 0:
        return 0.0
    return round(bottomline_inr / amount_inr * 100, 2)


def apply_hrushikesh_exclusions(deals: list) -> list:
    """If Hrushikesh's overall GP < GP_MIN_OVERALL_PCT, exclude deals
    with individual GP < GP_DEAL_EXCLUDE_PCT from achievement."""
    hr_name = HRUSHIKESH_BAGADE.lower()
    hr_indices = [
        i for i, d in enumerate(deals)
        if hr_name in (d.get("employee") or "").lower()
        or hr_name in (d.get("pipeline_led_by") or "").lower()
    ]
    if not hr_indices:
        return deals

    hr_deals = [deals[i] for i in hr_indices]
    total_amt = sum(d.get("amount_inr", 0) for d in hr_deals)
    total_bl = sum(d.get("bottomline_inr", 0) for d in hr_deals)
    overall_gp = compute_gp_pct(total_amt, total_bl)
    apply_rule = overall_gp < GP_MIN_OVERALL_PCT

    for i in hr_indices:
        d = deals[i]
        gp = compute_gp_pct(d.get("amount_inr", 0), d.get("bottomline_inr", 0))
        d["gp_pct"] = gp
        if apply_rule and gp < GP_DEAL_EXCLUDE_PCT:
            d["excluded_from_achievement"] = True
            d["exclusion_reason"] = (
                f"GP {gp}% < {GP_DEAL_EXCLUDE_PCT}% "
                f"(overall business GP {overall_gp}% < {GP_MIN_OVERALL_PCT}%)"
            )
            d["quota_credit_inr"] = 0
            d["quota_credit_cr"] = 0
        else:
            d["excluded_from_achievement"] = False
            d["exclusion_reason"] = None

    return deals
