"""Scope quota JSON so each login only sees associated people / accounts / metrics.

Also reapplies actuals when a date range is requested so Overview / RTM / BU
cards match the selected window — quotas stay as Finance uploaded them.
"""

from __future__ import annotations

import copy
import json
import re
from datetime import date, datetime
from typing import Any

from app.config import settings
from app.models import User
from app.security import can_see_all

import sys

_scripts = str(settings.root / "scripts")
if _scripts not in sys.path:
    sys.path.insert(0, _scripts)
import assignment_history  # noqa: E402

RTM_DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"]
BU_CARD_ORDER = ["DCG", "CSN", "PS", "CSG", "Cloud"]
LEADER_ROLES = {"leader", "tl", "avp", "bu_head"}
LEADER_TYPES = {"TL", "AVP", "BU Head", "BU Head / TL", "Topline", "Bottomline", "Other"}


def _at_risk_threshold() -> float:
    path = settings.root / "config" / "quota_rules.json"
    try:
        rules = json.loads(path.read_text(encoding="utf-8"))
        return float((rules.get("status_thresholds") or {}).get("at_risk", 30))
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return 30.0


def _norm(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"\s+", " ", name.lower().replace("–", "-").replace("—", "-")).strip()


def _names_match(a: str | None, b: str | None) -> bool:
    """Strict identity match. First-name-only / substring matches leaked org-wide data."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    pa, pb = na.split(), nb.split()
    if len(pa) >= 2 and len(pb) >= 2 and pa[0] == pb[0] and pa[-1] == pb[-1]:
        return True
    return False


def _load_leader_roster() -> list[dict[str, Any]]:
    path = settings.root / "config" / "leader_roster.json"
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [row for row in raw if isinstance(row, dict) and row.get("name")]


def _load_pipeline_aliases() -> dict[str, str]:
    path = settings.root / "config" / "pipeline_aliases.json"
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if k and not str(k).startswith("_") and v}


def _leader_deal_names(leader_name: str, aliases: dict[str, str]) -> set[str]:
    """Roster name plus canonical Led-By (Ishwari Santosh Kadam → Ishwari Kadam)."""
    if not leader_name:
        return set()
    canon = aliases.get(leader_name, leader_name)
    names = {leader_name, canon}
    for raw, mapped in aliases.items():
        if mapped == canon or mapped == leader_name or raw == leader_name:
            names.add(raw)
            names.add(mapped)
    return names


def _deals_for_leader(leader_name: str, deals: list[dict], aliases: dict[str, str]) -> list[dict]:
    keys = _leader_deal_names(leader_name, aliases)
    canon = aliases.get(leader_name, leader_name)
    out: list[dict] = []
    seen: set[str] = set()
    for d in deals:
        emp = d.get("employee") or ""
        if not emp:
            continue
        if emp not in keys and not _names_match(emp, leader_name) and not _names_match(emp, canon):
            continue
        oid = str(d.get("opportunity_number") or "")
        token = oid if oid else str(id(d))
        if token in seen:
            continue
        seen.add(token)
        out.append(d)
    return out


def _leader_scope_divs(leader_name: str, row: dict[str, Any] | None = None) -> set[str]:
    """RTM codes for Team Roster. Prefer rollup_divisions (Ajay is DCG BU, team is South)."""
    for r in _load_leader_roster():
        if not _names_match(r.get("name"), leader_name):
            continue
        divs = r.get("rollup_divisions") or r.get("fallback_divisions") or []
        return {str(d) for d in divs if d}
    div = (row or {}).get("division")
    return {str(div)} if div else set()


def _team_member_rows(leader_name: str, individuals: list[dict] | None) -> list[dict]:
    """As-of-today ICs in the leader's rollup RTMs. Leader themselves is omitted."""
    divs = _leader_scope_divs(leader_name)
    rows: list[dict] = []
    for ic in individuals or []:
        name = ic.get("name") or ""
        if not name or _names_match(name, leader_name):
            continue
        if (ic.get("division") or "") not in divs:
            continue
        pipe = ic.get("pipeline") or {}
        h1 = ic.get("h1") or {}
        closed = pipe.get("closed_deals") or []
        rows.append(
            {
                "name": name,
                "division": ic.get("division"),
                "persona": ic.get("persona"),
                "h1_actuals": h1.get("actuals"),
                "h1_quota": h1.get("quota"),
                "h1_attainment_pct": h1.get("attainment_pct"),
                "pipeline_topline_cr": pipe.get("total_revenue_cr") or pipe.get("topline_cr") or 0,
                "pipeline_bottomline_cr": pipe.get("total_bottomline_cr") or pipe.get("bottomline_cr") or 0,
                "deal_count": pipe.get("deal_count") or len(closed),
            }
        )
    rows.sort(key=lambda x: float(x.get("h1_actuals") or 0), reverse=True)
    return rows


def _att(actuals: float, quota: float) -> float | None:
    if quota:
        return round(actuals / quota * 100, 2)
    return None


def _status_flag(att: float | None) -> str:
    if att is None:
        return "unknown"
    if att >= 50:
        return "on_track"
    if att >= 30:
        return "at_risk"
    return "critical"


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()
    if not text:
        return None
    text = text[:10]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _quarter_from_date(d: date) -> str:
    m = d.month
    if m in (4, 5, 6):
        return "q1"
    if m in (7, 8, 9):
        return "q2"
    if m in (10, 11, 12):
        return "q3"
    return "q4"


def _deal_quarter(deal: dict[str, Any]) -> str:
    q = str(deal.get("quarter") or "").lower()
    if q in {"q1", "q2", "q3", "q4"}:
        return q
    parsed = _parse_date(deal.get("close_date"))
    return _quarter_from_date(parsed) if parsed else ""


def _deal_ic_cr(deal: dict[str, Any]) -> float:
    # Prefer exact INR: summing per-deal 4-dp Cr drifts from the Excel Amount total.
    inr = deal.get("amount_inr")
    if inr is not None:
        return float(inr) / 1e7
    return float(deal.get("amount_cr") or deal.get("topline_cr") or 0)


def _collect_deals(data: dict[str, Any]) -> list[dict[str, Any]]:
    pipe = data.get("pipeline") or {}
    if isinstance(pipe, dict):
        all_deals = pipe.get("all_deals")
        if isinstance(all_deals, list) and all_deals:
            return all_deals
    deals: list[dict[str, Any]] = []
    for ic in data.get("individuals") or []:
        deals.extend((ic.get("pipeline") or {}).get("closed_deals") or [])
    if deals:
        return deals
    for acct in data.get("accounts") or []:
        deals.extend(acct.get("deals") or [])
    return deals


def _filter_deals_by_names(deals: list[dict], allowed: set[str]) -> list[dict]:
    out = []
    for d in deals:
        emp = d.get("employee") or d.get("pipeline_led_by")
        if emp in allowed or any(_names_match(emp, a) for a in allowed):
            out.append(d)
    return out


def _filter_deals_by_date(deals: list[dict], start: date | None, end: date | None) -> list[dict]:
    if start is None and end is None:
        return deals
    out = []
    for d in deals:
        parsed = _parse_date(d.get("close_date"))
        if parsed is None:
            out.append(d)
            continue
        if start and parsed < start:
            continue
        if end and parsed > end:
            continue
        out.append(d)
    return out


def _rebuild_pipeline_for_ic(ic: dict[str, Any], ic_deals: list[dict]) -> None:
    total_rev = sum(float(d.get("topline_inr") or 0) for d in ic_deals)
    total_bl = sum(float(d.get("bottomline_inr") or 0) for d in ic_deals)
    accounts: dict[str, dict] = {}
    for d in ic_deals:
        acct = d.get("account") or "Unknown"
        a = accounts.setdefault(
            acct,
            {"account": acct, "deal_count": 0, "topline_inr": 0.0, "bottomline_inr": 0.0, "deals": []},
        )
        a["deal_count"] += 1
        a["topline_inr"] += float(d.get("topline_inr") or 0)
        a["bottomline_inr"] += float(d.get("bottomline_inr") or 0)
        a["deals"].append(d)
    closed_accounts = sorted(accounts.values(), key=lambda x: x["topline_inr"], reverse=True)
    for a in closed_accounts:
        a["topline_cr"] = round(a["topline_inr"] / 1e7, 4)
        a["bottomline_cr"] = round(a["bottomline_inr"] / 1e7, 4)
        a["revenue_inr"] = a["topline_inr"]
        a["revenue_cr"] = a["topline_cr"]

    by_q = {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0}
    deals_q = {"q1": 0, "q2": 0, "q3": 0, "q4": 0}
    for d in ic_deals:
        q = _deal_quarter(d)
        if q in by_q:
            by_q[q] += _deal_ic_cr(d)
            deals_q[q] += 1

    def _set_period(key: str, actuals: float, deal_count: int | None = None) -> None:
        period = dict(ic.get(key) or {})
        quota = float(period.get("quota") or 0)
        period["actuals"] = round(actuals, 4)
        period["attainment_pct"] = _att(actuals, quota)
        if deal_count is not None:
            period["deals"] = deal_count
        ic[key] = period

    h1 = by_q["q1"] + by_q["q2"]
    h2 = by_q["q3"] + by_q["q4"]
    _set_period("q1", by_q["q1"], deals_q["q1"])
    _set_period("q2", by_q["q2"], deals_q["q2"])
    _set_period("q3", by_q["q3"], deals_q["q3"])
    _set_period("q4", by_q["q4"], deals_q["q4"])
    _set_period("h1", h1, deals_q["q1"] + deals_q["q2"])
    _set_period("h2", h2, deals_q["q3"] + deals_q["q4"])
    _set_period("annual", h1 + h2, sum(deals_q.values()))

    ic["h1_attainment_pct"] = (ic.get("h1") or {}).get("attainment_pct")
    ic["closed_deals"] = len(ic_deals)
    ic["pipeline_deals"] = ic_deals
    ic["deals"] = {
        **(ic.get("deals") or {}),
        "total": deals_q["q1"] + deals_q["q2"],
        "q1": deals_q["q1"],
        "q2": deals_q["q2"],
    }
    ic["pipeline"] = {
        "deal_count": len(ic_deals),
        "deal_count_total": len(ic_deals),
        "account_count": len(accounts),
        "total_revenue_inr": round(total_rev, 2),
        "total_revenue_cr": round(total_rev / 1e7, 4),
        "total_bottomline_inr": round(total_bl, 2),
        "total_bottomline_cr": round(total_bl / 1e7, 4),
        "total_quota_credit_inr": round(sum(float(d.get("quota_credit_inr") or 0) for d in ic_deals), 2),
        "total_quota_credit_cr": round(sum(float(d.get("quota_credit_cr") or 0) for d in ic_deals), 4),
        "closed_accounts": closed_accounts,
        "closed_deals": ic_deals,
    }


def _rebuild_rtm(individuals: list[dict], deals: list[dict] | None = None) -> list[dict]:
    div_data: dict[str, dict] = {}
    for ic in individuals:
        div = ic.get("division") or ""
        if div not in RTM_DIVISIONS:
            continue
        d = div_data.setdefault(
            div,
            {p: {"actuals": 0.0, "quota": 0.0, "deals": 0} for p in ("q1", "q2", "h1", "h2", "annual", "q3", "q4")},
        )
        if ic.get("counts_for_rtm") is False:
            continue
        for p in ("q1", "q2", "q3", "q4", "h1", "h2", "annual"):
            d[p]["quota"] += float((ic.get(p) or {}).get("quota") or 0)
        if not deals:
            for p in ("q1", "q2", "q3", "q4", "h1", "h2", "annual"):
                d[p]["actuals"] += float((ic.get(p) or {}).get("actuals") or 0)
            d["h1"]["deals"] += int((ic.get("deals") or {}).get("total") or (ic.get("h1") or {}).get("deals") or 0)

    if deals:
        for deal in deals:
            if not _is_rtm_deal(deal):
                continue
            div = deal.get("rtm_division") or ""
            q = _deal_quarter(deal)
            d = div_data.setdefault(
                div,
                {p: {"actuals": 0.0, "quota": 0.0, "deals": 0} for p in ("q1", "q2", "h1", "h2", "annual", "q3", "q4")},
            )
            if q in ("q1", "q2", "q3", "q4"):
                d[q]["actuals"] += _deal_ic_cr(deal)
                d[q]["deals"] += 1
        for d in div_data.values():
            d["h1"]["actuals"] = d["q1"]["actuals"] + d["q2"]["actuals"]
            d["h2"]["actuals"] = d["q3"]["actuals"] + d["q4"]["actuals"]
            d["annual"]["actuals"] = d["h1"]["actuals"] + d["h2"]["actuals"]
            d["h1"]["deals"] = d["q1"]["deals"] + d["q2"]["deals"]

    result = []
    for div in RTM_DIVISIONS:
        d = div_data.get(div)
        if not d:
            continue
        h1_q, h1_a = d["h1"]["quota"], d["h1"]["actuals"]
        result.append({
            "division": div,
            "q1": {"quota": round(d["q1"]["quota"], 4), "actuals": round(d["q1"]["actuals"], 4), "attainment_pct": _att(d["q1"]["actuals"], d["q1"]["quota"])},
            "q2": {"quota": round(d["q2"]["quota"], 4), "actuals": round(d["q2"]["actuals"], 4), "attainment_pct": _att(d["q2"]["actuals"], d["q2"]["quota"])},
            "q3": {"quota": round(d["q3"]["quota"], 4), "actuals": round(d["q3"]["actuals"], 4), "attainment_pct": _att(d["q3"]["actuals"], d["q3"]["quota"])},
            "q4": {"quota": round(d["q4"]["quota"], 4), "actuals": round(d["q4"]["actuals"], 4), "attainment_pct": _att(d["q4"]["actuals"], d["q4"]["quota"])},
            "h1": {"quota": round(h1_q, 4), "actuals": round(h1_a, 4), "attainment_pct": _att(h1_a, h1_q)},
            "h2": {"quota": round(d["h2"]["quota"], 4), "actuals": round(d["h2"]["actuals"], 4), "attainment_pct": _att(d["h2"]["actuals"], d["h2"]["quota"])},
            "annual": {"quota": round(d["annual"]["quota"], 4), "actuals": round(d["annual"]["actuals"], 4), "attainment_pct": _att(d["annual"]["actuals"], d["annual"]["quota"])},
            "closed_deals": d["h1"]["deals"],
            "status": _status_flag(_att(h1_a, h1_q)),
            "employee_count": sum(1 for ic in individuals if ic.get("division") == div),
        })
    return result


def _is_rtm_deal(deal: dict[str, Any]) -> bool:
    # counts_for_rtm is stamped by build_quota_data: False for deals led by a BU Head/AVP,
    # whose own deals never count toward RTM/BU/header IC actuals.
    return (deal.get("rtm_division") or "") in RTM_DIVISIONS and deal.get("counts_for_rtm") is not False


def _rebuild_bu(deals: list[dict], original: list[dict] | None) -> list[dict]:
    # BU actuals are RTM-team achievement only: BU quotas are set per RTM, so deals led by
    # non-RTM people (DCG/Cloud heads, Self) would inflate attainment with no matching quota.
    by_bu: dict[str, dict[str, float]] = {}
    deal_counts: dict[str, dict[str, int]] = {}
    for d in deals:
        if not _is_rtm_deal(d):
            continue
        bu = d.get("bu") or "Other"
        q = _deal_quarter(d)
        cr = _deal_ic_cr(d)
        by_bu.setdefault(bu, {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0})
        if q in by_bu[bu]:
            by_bu[bu][q] += cr
        deal_counts.setdefault(bu, {})
        deal_counts[bu][q] = deal_counts[bu].get(q, 0) + 1

    orig_map = {b.get("bu"): b for b in (original or []) if b.get("bu")}
    names = list(dict.fromkeys([*orig_map.keys(), *by_bu.keys()]))
    names.sort(key=lambda b: BU_CARD_ORDER.index(b) if b in BU_CARD_ORDER else 99)

    result = []
    for bu in names:
        src = orig_map.get(bu) or {"bu": bu, "service": bu, "q1": {}, "q2": {}, "h1": {}, "h2": {}, "annual": {}}
        d = by_bu.get(bu, {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0})
        bd = deal_counts.get(bu, {})
        q1_a, q2_a = d.get("q1", 0), d.get("q2", 0)
        q3_a, q4_a = d.get("q3", 0), d.get("q4", 0)
        h1_a = q1_a + q2_a
        h2_a = q3_a + q4_a
        periods = {
            "q1": (q1_a, bd.get("q1", 0)),
            "q2": (q2_a, bd.get("q2", 0)),
            "q3": (q3_a, bd.get("q3", 0)),
            "q4": (q4_a, bd.get("q4", 0)),
            "h1": (h1_a, bd.get("q1", 0) + bd.get("q2", 0)),
            "h2": (h2_a, bd.get("q3", 0) + bd.get("q4", 0)),
            "annual": (h1_a + h2_a, sum(bd.values())),
        }
        row = {"bu": bu, "service": src.get("service") or bu}
        for key, (actuals, n_deals) in periods.items():
            quota = float((src.get(key) or {}).get("quota") or 0)
            row[key] = {
                "quota": quota,
                "actuals": round(actuals, 4),
                "attainment_pct": _att(actuals, quota),
                "deals": n_deals,
            }
        result.append(row)
    return result


def _rebuild_period_metrics(rtm: list[dict], deals: list[dict]) -> dict[str, Any]:
    def _gt(period: str) -> tuple[float, float]:
        q = sum(float((d.get(period) or {}).get("quota") or 0) for d in rtm)
        a = sum(float((d.get(period) or {}).get("actuals") or 0) for d in rtm)
        return q, a

    def _closed(period_key: str) -> int:
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
            for d in deals
            if _deal_quarter(d) in quarters and _is_rtm_deal(d)
        )

    def _snap(period_key: str, show_att: bool = True) -> dict:
        q, a = _gt(period_key)
        return {
            "ic_quota": round(q, 4),
            "ic_actuals": round(a, 4),
            "ic_attainment_pct": _att(a, q) if show_att and a else None,
            "closed_deals": _closed(period_key),
            "show_attainment": show_att and a > 0,
            "stly_actuals_cr": None,
        }

    q2_a = _gt("q2")[1]
    h2_a = _gt("h2")[1]
    ann_a = _gt("annual")[1]
    return {
        "q1": _snap("q1"),
        "q2": _snap("q2", show_att=q2_a > 0),
        "h1": _snap("h1"),
        "q3": {**_snap("q3", show_att=False), "estimated": True},
        "q4": {**_snap("q4", show_att=False), "estimated": True},
        "h2": _snap("h2", show_att=h2_a > 0),
        "annual": _snap("annual", show_att=ann_a > 0),
    }


def _header_pipeline_cr(deals: list[dict]) -> float:
    # "IC Actuals Including Others": every deal with a Led By (RTM + DCG/Cloud + Self);
    # must match build_quota_data.build_pipeline_summary.
    counted = [d for d in deals if d.get("employee")]
    return round(sum(float(d.get("topline_cr") or 0) for d in counted), 2)


def _rebuild_kpis(data: dict[str, Any], individuals: list[dict], rtm: list[dict], deals: list[dict], bu: list[dict]) -> dict[str, Any]:
    kpis = copy.deepcopy(data.get("kpis") or {})
    h1_q = sum(float((d.get("h1") or {}).get("quota") or 0) for d in rtm)
    h1_a = sum(float((d.get("h1") or {}).get("actuals") or 0) for d in rtm)
    q1_q = sum(float((d.get("q1") or {}).get("quota") or 0) for d in rtm)
    q1_a = sum(float((d.get("q1") or {}).get("actuals") or 0) for d in rtm)
    ann_q = sum(float((d.get("annual") or {}).get("quota") or 0) for d in rtm)
    pipe_cr = _header_pipeline_cr(deals)
    rtm_ics = [e for e in individuals if (e.get("division") or "") in RTM_DIVISIONS]
    kpis.update({
        "h1_quota_cr": round(h1_q, 2),
        "h1_actuals_cr": round(h1_a, 2),
        "h1_attainment_pct": _att(h1_a, h1_q) or 0,
        "annual_quota_cr": round(ann_q, 2) if ann_q else kpis.get("annual_quota_cr"),
        "ic_h1_quota_cr": round(h1_q, 2),
        "ic_h1_actuals_cr": round(h1_a, 2),
        "ic_h1_attainment_pct": _att(h1_a, h1_q) or 0,
        "ic_q1_quota_cr": round(q1_q, 2),
        "ic_q1_actuals_cr": round(q1_a, 2),
        "ic_q1_attainment_pct": _att(q1_a, q1_q) or 0,
        "total_employees": len(rtm_ics),
        "total_divisions": len(rtm),
        "total_bus": len(bu),
        "total_deals_h1": sum(int(d.get("closed_deals") or 0) for d in rtm),
        "pipeline_deals": len(deals),
        "pipeline_revenue_cr": pipe_cr,
        "header_pipeline_cr": pipe_cr,
        "header_closed_opps": len(deals),
        "header_ic_actuals": round(h1_a, 2),
        "header_h1_attainment_pct": _att(h1_a, h1_q),
    })
    return kpis


def _rebuild_accounts_brands(
    deals: list[dict],
    key_field: str,
    ic_h1_quota_cr: float,
    pipe_tl_cr: float,
    pipe_bl_cr: float,
) -> list[dict]:
    grouped: dict[str, dict[str, Any]] = {}
    for d in deals:
        key = (d.get(key_field) or "Unknown").strip() or "Unknown"
        a = grouped.setdefault(
            key,
            {
                "deal_count": 0,
                "revenue_inr": 0.0,
                "bottomline_inr": 0.0,
                "quota_credit_inr": 0.0,
                "_employees": set(),
                "_rtm": set(),
                "_accounts": {},
                "_by_bu": {},
                "deals": [],
            },
        )
        a["deal_count"] += 1
        a["revenue_inr"] += float(d.get("topline_inr") or 0)
        a["bottomline_inr"] += float(d.get("bottomline_inr") or 0)
        a["quota_credit_inr"] += float(d.get("quota_credit_inr") or 0)
        if d.get("employee"):
            a["_employees"].add(d["employee"])
        if d.get("rtm_division"):
            a["_rtm"].add(d["rtm_division"])
        if key_field != "account" and d.get("account"):
            acct = d["account"]
            a["_accounts"][acct] = a["_accounts"].get(acct, 0.0) + float(d.get("topline_inr") or 0)
        bu = d.get("bu") or "Other"
        b = a["_by_bu"].setdefault(bu, {"bu": bu, "deal_count": 0, "revenue_inr": 0.0, "bottomline_inr": 0.0})
        b["deal_count"] += 1
        b["revenue_inr"] += float(d.get("topline_inr") or 0)
        b["bottomline_inr"] += float(d.get("bottomline_inr") or 0)
        a["deals"].append(d)

    ic_q_inr = float(ic_h1_quota_cr or 0) * 1e7
    out = []
    for key, a in grouped.items():
        rev = a["revenue_inr"]
        bl = a["bottomline_inr"]
        qc = a["quota_credit_inr"]
        gp = round(bl / rev * 100, 2) if rev else 0.0
        by_bu = [
            {
                "bu": v["bu"],
                "deal_count": v["deal_count"],
                "revenue_inr": round(v["revenue_inr"], 2),
                "revenue_cr": round(v["revenue_inr"] / 1e7, 4),
                "bottomline_inr": round(v["bottomline_inr"], 2),
                "bottomline_cr": round(v["bottomline_inr"] / 1e7, 4),
            }
            for v in sorted(a["_by_bu"].values(), key=lambda x: x["revenue_inr"], reverse=True)
        ]
        row: dict[str, Any] = {
            key_field: key,
            "deal_count": a["deal_count"],
            "revenue_inr": round(rev, 2),
            "revenue_cr": round(rev / 1e7, 4),
            "bottomline_inr": round(bl, 2),
            "bottomline_cr": round(bl / 1e7, 4),
            "quota_credit_inr": round(qc, 2),
            "quota_credit_cr": round(qc / 1e7, 4),
            "gp_pct": gp,
            "pct_of_ic_h1_quota": round(rev / ic_q_inr * 100, 2) if ic_q_inr else None,
            "pct_of_pipeline_topline": round((rev / 1e7) / pipe_tl_cr * 100, 2) if pipe_tl_cr else None,
            "pct_of_pipeline_bottomline": round((bl / 1e7) / pipe_bl_cr * 100, 2) if pipe_bl_cr else None,
            "employees": sorted(a["_employees"]),
            "employee_count": len(a["_employees"]),
            "rtm_divisions": sorted(a["_rtm"]),
            "primary_bu": by_bu[0]["bu"] if by_bu else None,
            "by_bu": by_bu,
            "deals": sorted(a["deals"], key=lambda x: float(x.get("amount_inr") or x.get("topline_inr") or 0), reverse=True),
        }
        if key_field == "brand":
            row["top_accounts"] = [
                {"account": n, "revenue_inr": round(v, 2), "revenue_cr": round(v / 1e7, 4)}
                for n, v in sorted(a["_accounts"].items(), key=lambda x: x[1], reverse=True)[:8]
            ]
        out.append(row)
    out.sort(key=lambda r: r.get("revenue_inr") or 0, reverse=True)
    return out


def _rebuild_rtm_by_bu(
    deals: list[dict],
    original: dict[str, list] | None,
    only_divisions: set[str] | None = None,
) -> dict[str, list]:
    """Per-BU RTM rows. ``only_divisions`` is the RTMs of people already on this view.

    None keeps every RTM (full-org build). A scoped login passes their team's RTMs so
    a leader does not see other teams' zero rows or annual quotas.
    """
    orig = original or {}
    quota_lookup: dict[tuple[str, str], dict] = {}
    for bu, rows in orig.items():
        for r in rows or []:
            div = r.get("division") or r.get("name")
            if div:
                quota_lookup[(bu, div)] = r

    grouped: dict[str, dict[str, dict[str, float]]] = {}
    for d in deals:
        if not _is_rtm_deal(d):
            continue
        bu = d.get("bu") or "Other"
        div = d["rtm_division"]
        q = _deal_quarter(d)
        cr = _deal_ic_cr(d)
        cell = grouped.setdefault(bu, {}).setdefault(div, {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0})
        if q in cell:
            cell[q] += cr

    out: dict[str, list] = {}
    bus = list(dict.fromkeys([*orig.keys(), *grouped.keys()]))
    for bu in bus:
        divs = list(dict.fromkeys(
            [*(r.get("division") or r.get("name") for r in orig.get(bu) or []
               if (r.get("division") or r.get("name")) in RTM_DIVISIONS),
             *grouped.get(bu, {}).keys()]
        ))
        if only_divisions is not None:
            # Keep the leader's own RTM even when this BU has no deals for them.
            divs = [d for d in RTM_DIVISIONS if d in only_divisions]
        rows = []
        for div in divs:
            src = quota_lookup.get((bu, div)) or {}
            act = grouped.get(bu, {}).get(div, {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0})
            q1, q2, q3, q4 = act["q1"], act["q2"], act["q3"], act["q4"]
            h1, h2 = q1 + q2, q3 + q4
            row = {
                "name": div,
                "division": div,
                "bu": bu,
            }
            periods = {
                "q1": q1, "q2": q2, "q3": q3, "q4": q4,
                "h1": h1, "h2": h2, "annual": h1 + h2,
            }
            for key, actuals in periods.items():
                src_period = src.get(key) if isinstance(src.get(key), dict) else {}
                quota_raw = (src_period or {}).get("quota")
                quota = float(quota_raw or 0)
                row[key] = {
                    "quota": quota_raw,
                    "actuals": round(actuals, 4),
                    "attainment_pct": _att(actuals, quota) if quota else None,
                }
            rows.append(row)
        out[bu] = rows
    return out


def _rebuild_leaders(
    original: list[dict] | None,
    deals: list[dict],
    individuals: list[dict] | None = None,
) -> list[dict]:
    """Refresh personal Led-By actuals; Team Roster is as-of-today ICs in rollup_divisions."""
    aliases = _load_pipeline_aliases()
    out = []
    for leader in original or []:
        row = copy.deepcopy(leader)
        name = row.get("name") or ""
        ldeals = _deals_for_leader(name, deals, aliases)
        members = _team_member_rows(name, individuals)
        by_q = {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0}
        tl = bl = qc = 0.0
        for d in ldeals:
            q = _deal_quarter(d)
            cr = float(d.get("topline_cr") or 0)
            if q in by_q:
                by_q[q] += cr
            tl += float(d.get("topline_inr") or 0)
            bl += float(d.get("bottomline_inr") or 0)
            qc += float(d.get("quota_credit_inr") or 0)
        tl_cr = round(tl / 1e7, 4)
        bl_cr = round(bl / 1e7, 4)
        h1 = by_q["q1"] + by_q["q2"]
        h2 = by_q["q3"] + by_q["q4"]

        def _set(period: str, actuals: float) -> None:
            prev = dict(row.get(period) or {})
            quota = float(prev.get("quota") or 0)
            prev["actuals"] = round(actuals, 4)
            prev["quota"] = quota
            prev["attainment_pct"] = _att(actuals, quota)
            row[period] = prev

        _set("q1", by_q["q1"])
        _set("q2", by_q["q2"])
        _set("q3", by_q["q3"])
        _set("q4", by_q["q4"])
        _set("h1", h1)
        _set("h2", h2)
        _set("annual", h1 + h2)
        gp = round(bl / tl * 100, 2) if tl else 0.0
        row["team_size"] = len(members)
        row["team_members"] = members
        row["pipeline"] = {
            **(row.get("pipeline") or {}),
            "deal_count": len(ldeals),
            "topline_cr": tl_cr,
            "bottomline_cr": bl_cr,
            "quota_credit_cr": round(qc / 1e7, 4),
            "gp_pct": gp,
            "total_revenue_cr": tl_cr,
            "total_bottomline_cr": bl_cr,
        }
        row["top_deals"] = sorted(
            ldeals, key=lambda x: float(x.get("topline_inr") or 0), reverse=True
        )[:10]
        row["status"] = _status_flag(_att(h1, float((row.get("h1") or {}).get("quota") or 0)))
        out.append(row)
    return out


def _rebuild_top_and_risk(individuals: list[dict]) -> tuple[dict, list]:
    rtm_ics = [
        ic
        for ic in individuals
        if (ic.get("division") or "") in RTM_DIVISIONS
        and (ic.get("persona") or "IC") not in LEADER_TYPES
    ]
    with_att = [ic for ic in rtm_ics if (ic.get("h1") or {}).get("attainment_pct") is not None]
    by_pct = sorted(with_att, key=lambda x: (x.get("h1") or {}).get("attainment_pct") or 0, reverse=True)[:5]
    by_val = sorted(rtm_ics, key=lambda x: (x.get("h1") or {}).get("actuals") or 0, reverse=True)[:5]

    def _row(ic: dict) -> dict:
        h1 = ic.get("h1") or {}
        return {
            "name": ic.get("name"),
            "division": ic.get("division"),
            "h1_actuals": h1.get("actuals"),
            "h1_quota": h1.get("quota"),
            "h1_attainment_pct": h1.get("attainment_pct") or 0,
        }

    at_risk_threshold = _at_risk_threshold()
    at_risk = [
        _row(ic)
        for ic in rtm_ics
        if ((ic.get("h1") or {}).get("attainment_pct") or 0) < at_risk_threshold
        and ((ic.get("h1") or {}).get("quota") or 0) > 0
    ]
    at_risk.sort(key=lambda r: r["h1_attainment_pct"])
    return {
        "by_attainment_pct": [_row(ic) for ic in by_pct],
        "by_value_closed": [_row(ic) for ic in by_val],
    }, at_risk


def _stamp_as_of_today(data: dict[str, Any]) -> dict[str, Any]:
    today = assignment_history.as_of_today()
    assign_by_name: dict[str, list] = {}
    for ic in data.get("individuals") or []:
        assigns = assignment_history.ensure_assignments(ic) if (ic.get("assignments") or ic.get("division")) else []
        if assigns:
            ic["assignments"] = assigns
            ic["division"] = assignment_history.current_division(assigns, today) or ic.get("division")
            if ic.get("name"):
                assign_by_name[ic["name"]] = assigns
    for deal in _collect_deals(data):
        name = deal.get("employee") or deal.get("pipeline_led_by") or ""
        assigns = assign_by_name.get(name) or []
        if assigns:
            deal["rtm_division"] = assignment_history.division_on(
                assigns, deal.get("close_date"), fallback=deal.get("rtm_division") or ""
            )
    return data


def _apply_deals_to_view(data: dict[str, Any], deals: list[dict]) -> dict[str, Any]:
    """Recompute IC actuals + org cards from a (scoped / date-filtered) deal list. Quotas unchanged."""
    today = assignment_history.as_of_today()
    assign_by_name: dict[str, list] = {}
    for ic in data.get("individuals") or []:
        assigns = assignment_history.ensure_assignments(ic) if (ic.get("assignments") or ic.get("division")) else []
        if ic.get("name") and assigns:
            assign_by_name[ic["name"]] = assigns
    for d in deals:
        name = d.get("employee") or d.get("pipeline_led_by") or ""
        assigns = assign_by_name.get(name) or []
        if assigns:
            d["rtm_division"] = assignment_history.division_on(
                assigns, d.get("close_date"), fallback=d.get("rtm_division") or ""
            )

    by_name: dict[str, list] = {}
    for d in deals:
        by_name.setdefault(d.get("employee") or "", []).append(d)

    individuals = []
    for ic in data.get("individuals") or []:
        row = copy.deepcopy(ic)
        assigns = assign_by_name.get(row.get("name"), [])
        if assigns:
            row["assignments"] = assigns
            row["division"] = assignment_history.current_division(assigns, today) or row.get("division")
        _rebuild_pipeline_for_ic(row, by_name.get(row.get("name"), []))
        individuals.append(row)

    rtm = _rebuild_rtm(individuals, deals)
    bu = _rebuild_bu(deals, data.get("bu_level"))
    period_metrics = _rebuild_period_metrics(rtm, deals)
    kpis = _rebuild_kpis(data, individuals, rtm, deals, bu)
    top, at_risk = _rebuild_top_and_risk(individuals)

    grand = {}
    for period in ("q1", "q2", "h1", "h2", "annual"):
        q = sum(float((d.get(period) or {}).get("quota") or 0) for d in rtm)
        a = sum(float((d.get(period) or {}).get("actuals") or 0) for d in rtm)
        grand[period] = {"quota": round(q, 4), "actuals": round(a, 4), "attainment_pct": _att(a, q)}
    grand["header_ic_actuals"] = grand.get("h1", {}).get("actuals")
    grand["header_h1_attainment_pct"] = grand.get("h1", {}).get("attainment_pct")
    grand["header_pipeline_cr"] = kpis.get("header_pipeline_cr")
    grand["header_closed_opps"] = kpis.get("header_closed_opps")

    pipe = copy.deepcopy(data.get("pipeline") or {}) if isinstance(data.get("pipeline"), dict) else {}
    pipe_cr = kpis.get("header_pipeline_cr") or 0
    if pipe:
        pipe["all_deals"] = deals
        pipe["total_deals"] = len(deals)
        pipe["total_revenue_cr"] = pipe_cr
        pipe["unique_accounts"] = len({d.get("account") for d in deals if d.get("account")})
        pipe["unique_employees"] = len({d.get("employee") for d in deals if d.get("employee")})
        if isinstance(pipe.get("summary"), dict):
            pipe["summary"]["total_deals"] = len(deals)
            pipe["summary"]["total_revenue_cr"] = pipe_cr

    data["individuals"] = individuals
    data["rtm_divisions"] = rtm
    data["division_aggregates"] = rtm
    data["bu_level"] = bu
    data["period_metrics"] = period_metrics
    data["kpis"] = kpis
    data["grand_total"] = grand
    data["pipeline"] = pipe or data.get("pipeline")
    ic_h1_q = float(grand.get("h1", {}).get("quota") or 0)
    pipe_bl = round(sum(float(d.get("bottomline_inr") or 0) for d in deals) / 1e7, 4)
    data["accounts"] = _rebuild_accounts_brands(deals, "account", ic_h1_q, pipe_cr, pipe_bl)
    data["brands"] = _rebuild_accounts_brands(deals, "brand", ic_h1_q, pipe_cr, pipe_bl)
    orig_rtm_by_bu = data.get("rtm_by_bu") if isinstance(data.get("rtm_by_bu"), dict) else {}
    # People on this view decide which RTM rows appear. Admin/CEO still have all six.
    view_rtms = {
        ic.get("division")
        for ic in individuals
        if ic.get("division") in RTM_DIVISIONS
    }
    data["rtm_by_bu"] = _rebuild_rtm_by_bu(deals, orig_rtm_by_bu, view_rtms)
    data["leaders_dashboard"] = _rebuild_leaders(
        data.get("leaders_dashboard") or [], deals, individuals
    )
    data["top_attainers"] = top
    data["at_risk_ics"] = at_risk
    return data


def _allowed_names_for_user(data: dict[str, Any], user: User) -> set[str] | None:
    """Return None = all; otherwise set of employee display names in scope."""
    if can_see_all(user):
        return None

    emp = user.employee_name or user.full_name
    individuals = data.get("individuals") or []
    leaders = data.get("leaders_dashboard") or []
    roster = _load_leader_roster()
    role = (user.role or "user").lower()

    self_names = {p["name"] for p in individuals if _names_match(p.get("name"), emp)}
    for leader in leaders:
        if _names_match(leader.get("name"), emp):
            self_names.add(leader["name"])
    if not self_names and emp:
        self_names.add(emp)

    is_leader = (
        role in LEADER_ROLES
        or any(_names_match(l.get("name"), emp) for l in leaders)
        or any(_names_match(r.get("name"), emp) for r in roster)
    )
    if not is_leader:
        return self_names

    # A TL who has people reporting to them sees that team only, not the whole RTM.
    # TLs with no reports keep the division scope below (Sana, Ramakrishna).
    if role == "tl":
        reports = {
            ic["name"]
            for ic in individuals
            if ic.get("name")
            and any(_names_match(ic.get("team_lead"), n) for n in self_names)
        }
        if reports:
            return _drop_leaders_for_tl(
                set(self_names) | reports, self_names, individuals, leaders, roster
            )

    allowed = set(self_names)
    my_divs: set[str] = set()

    for leader in leaders:
        if any(_names_match(leader.get("name"), n) for n in self_names):
            allowed.add(leader["name"])
            if leader.get("division"):
                my_divs.add(leader["division"])
            for m in leader.get("team_members") or []:
                if m.get("name"):
                    allowed.add(m["name"])

    for row in roster:
        if any(_names_match(row.get("name"), n) for n in self_names):
            for div in row.get("rollup_divisions") or row.get("fallback_divisions") or []:
                if div:
                    my_divs.add(div)
            if row.get("division"):
                my_divs.add(row["division"])

    for ic in individuals:
        if ic.get("name") in allowed and ic.get("division"):
            my_divs.add(ic["division"])
        manager = ic.get("team_lead") or ""
        if manager and any(_names_match(manager, n) for n in self_names):
            allowed.add(ic["name"])

    if my_divs:
        for ic in individuals:
            if ic.get("division") in my_divs:
                allowed.add(ic["name"])

    if role == "tl":
        allowed = _drop_leaders_for_tl(allowed, self_names, individuals, leaders, roster)

    return allowed or self_names


def _drop_leaders_for_tl(
    allowed: set[str],
    self_names: set[str],
    individuals: list[dict[str, Any]],
    leaders: list[dict[str, Any]],
    roster: list[dict[str, Any]],
) -> set[str]:
    """A TL sees their RTM team only, never the people above them.

    Division expansion pulls in the division's BU Head / AVP (``counts_for_rtm`` False
    at build time) and leaders; their deals would otherwise leak into the TL's
    Including Others, deal lists and Employees page. The TL's own name is always kept.
    """
    above = {p["name"] for p in individuals if p.get("counts_for_rtm") is False}
    leader_names = [l.get("name") for l in leaders] + [r.get("name") for r in roster]
    return {
        name
        for name in allowed
        if name in self_names
        or (name not in above and not any(_names_match(name, ln) for ln in leader_names))
    }


def apply_date_filter(data: dict[str, Any], start: date | None, end: date | None) -> dict[str, Any]:
    if start is None and end is None:
        return data
    deals = _filter_deals_by_date(_collect_deals(data), start, end)
    scoped = _apply_deals_to_view(data, deals)
    meta = dict(scoped.get("meta") or {})
    meta["date_from"] = start.isoformat() if start else None
    meta["date_to"] = end.isoformat() if end else None
    scoped["meta"] = meta
    return scoped


def scope_quota_data(data: dict[str, Any], user: User) -> dict[str, Any]:
    data = _stamp_as_of_today(copy.deepcopy(data))
    allowed = _allowed_names_for_user(data, user)
    if allowed is None:
        scoped = copy.deepcopy(data)
        scoped["_scope"] = {"mode": "all", "role": user.role}
        return scoped

    scoped = copy.deepcopy(data)
    individuals = [
        copy.deepcopy(e)
        for e in (data.get("individuals") or [])
        if e.get("name") in allowed or any(_names_match(e.get("name"), a) for a in allowed)
    ]
    seen: set[str] = set()
    uniq = []
    for e in individuals:
        if e["name"] in seen:
            continue
        seen.add(e["name"])
        uniq.append(e)
    individuals = uniq

    leaders = [
        copy.deepcopy(l)
        for l in (data.get("leaders_dashboard") or [])
        if l.get("name") in allowed or any(_names_match(l.get("name"), a) for a in allowed)
    ]
    for l in leaders:
        l["team_members"] = [
            m
            for m in (l.get("team_members") or [])
            if m.get("name") in allowed or any(_names_match(m.get("name"), a) for a in allowed)
        ]

    scoped["individuals"] = individuals
    scoped["leaders_dashboard"] = leaders
    scoped["teams"] = [
        t
        for t in (data.get("teams") or [])
        if any(_names_match(t.get("team_lead"), a) for a in allowed)
    ]

    deals = _filter_deals_by_names(_collect_deals(data), allowed)
    scoped = _apply_deals_to_view(scoped, deals)
    scoped["_scope"] = {
        "mode": "filtered",
        "role": user.role,
        "employee_name": user.employee_name,
        "allowed_count": len(allowed),
        "visible_people": [e.get("name") for e in individuals],
    }
    return scoped
