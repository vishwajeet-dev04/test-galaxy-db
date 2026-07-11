"""Scope quota JSON so each user only sees associated people / accounts / metrics."""

from __future__ import annotations

import copy
import re
from typing import Any

from app.models import User
from app.security import can_see_all


def _norm(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"\s+", " ", name.lower().replace("–", "-").replace("—", "-")).strip()


def _names_match(a: str | None, b: str | None) -> bool:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # first+last loose match
    pa, pb = na.split(), nb.split()
    if len(pa) >= 1 and len(pb) >= 1 and pa[0] == pb[0]:
        if len(pa) == 1 or len(pb) == 1:
            return True
        if pa[-1] == pb[-1]:
            return True
    return na in nb or nb in na


def _allowed_names_for_user(data: dict[str, Any], user: User) -> set[str] | None:
    """Return None = all; otherwise set of employee display names in scope."""
    if can_see_all(user):
        return None

    emp = user.employee_name or user.full_name
    allowed: set[str] = set()

    # Self match against individuals + leaders
    for person in data.get("individuals") or []:
        if _names_match(person.get("name"), emp):
            allowed.add(person["name"])
    for leader in data.get("leaders_dashboard") or []:
        if _names_match(leader.get("name"), emp):
            allowed.add(leader["name"])
            for m in leader.get("team_members") or []:
                if m.get("name"):
                    allowed.add(m["name"])

    if not allowed and emp:
        allowed.add(emp)
    return allowed


def _filter_accounts(accounts: list[dict], allowed: set[str]) -> list[dict]:
    out = []
    for acct in accounts:
        emps = acct.get("employees") or []
        if any(any(_names_match(e, a) for a in allowed) for e in emps):
            scoped = copy.deepcopy(acct)
            scoped["deals"] = [
                d
                for d in (acct.get("deals") or [])
                if any(_names_match(d.get("employee"), a) for a in allowed)
                or any(_names_match(d.get("pipeline_led_by"), a) for a in allowed)
            ]
            # If deals filtered empty but account matched, keep original deals for that account
            if not scoped["deals"]:
                scoped["deals"] = copy.deepcopy(acct.get("deals") or [])
            out.append(scoped)
    return out


def _recompute_kpis(data: dict[str, Any], individuals: list[dict]) -> dict[str, Any]:
    kpis = copy.deepcopy(data.get("kpis") or {})
    h1_q = sum((e.get("h1") or {}).get("quota") or 0 for e in individuals)
    h1_a = sum((e.get("h1") or {}).get("actuals") or 0 for e in individuals)
    q1_q = sum((e.get("q1") or {}).get("quota") or 0 for e in individuals)
    q1_a = sum((e.get("q1") or {}).get("actuals") or 0 for e in individuals)
    kpis["ic_h1_quota_cr"] = round(h1_q, 2)
    kpis["ic_h1_actuals_cr"] = round(h1_a, 2)
    kpis["ic_h1_attainment_pct"] = round(h1_a / h1_q * 100, 2) if h1_q else 0
    kpis["ic_q1_quota_cr"] = round(q1_q, 2)
    kpis["ic_q1_actuals_cr"] = round(q1_a, 2)
    kpis["ic_q1_attainment_pct"] = round(q1_a / q1_q * 100, 2) if q1_q else 0
    kpis["total_employees"] = len(individuals)

    deals = sum((e.get("pipeline") or {}).get("deal_count") or 0 for e in individuals)
    rev = sum((e.get("pipeline") or {}).get("total_revenue_cr") or 0 for e in individuals)
    accts = set()
    for e in individuals:
        for a in (e.get("pipeline") or {}).get("closed_accounts") or []:
            if a.get("account"):
                accts.add(a["account"])
    kpis["pipeline_deals"] = deals
    kpis["pipeline_revenue_cr"] = round(rev, 2)
    kpis["pipeline_accounts"] = len(accts)
    return kpis


def scope_quota_data(data: dict[str, Any], user: User) -> dict[str, Any]:
    allowed = _allowed_names_for_user(data, user)
    if allowed is None:
        scoped = copy.deepcopy(data)
        scoped["_scope"] = {"mode": "all", "role": user.role}
        return scoped

    scoped = copy.deepcopy(data)
    individuals = [
        e for e in (data.get("individuals") or []) if e.get("name") in allowed or any(_names_match(e.get("name"), a) for a in allowed)
    ]
    # Deduplicate by name
    seen = set()
    uniq = []
    for e in individuals:
        if e["name"] in seen:
            continue
        seen.add(e["name"])
        uniq.append(copy.deepcopy(e))
    individuals = uniq

    leaders = [
        copy.deepcopy(l)
        for l in (data.get("leaders_dashboard") or [])
        if any(_names_match(l.get("name"), a) for a in allowed)
    ]
    # Trim leader team_members to allowed set for nested visibility
    for l in leaders:
        l["team_members"] = [
            m for m in (l.get("team_members") or []) if m.get("name") in allowed or any(_names_match(m.get("name"), a) for a in allowed)
        ]

    accounts = _filter_accounts(data.get("accounts") or [], allowed)

    divisions = {e.get("division") for e in individuals if e.get("division")}
    rtm_divisions = [
        d for d in (data.get("rtm_divisions") or []) if d.get("division") in divisions
    ]
    division_aggregates = [
        d for d in (data.get("division_aggregates") or []) if d.get("division") in divisions
    ]

    # Pipeline rollup from scoped individuals
    total_rev = sum((e.get("pipeline") or {}).get("total_revenue_cr") or 0 for e in individuals)
    total_bl = sum((e.get("pipeline") or {}).get("total_bottomline_cr") or 0 for e in individuals)
    total_credit = sum((e.get("pipeline") or {}).get("total_quota_credit_cr") or 0 for e in individuals)
    total_deals = sum((e.get("pipeline") or {}).get("deal_count") or 0 for e in individuals)
    pipe = copy.deepcopy(data.get("pipeline") or {}) if data.get("pipeline") else {}
    if pipe:
        pipe["total_revenue_cr"] = round(total_rev, 2)
        pipe["total_bottomline_cr"] = round(total_bl, 2)
        pipe["total_quota_credit_cr"] = round(total_credit, 2)
        pipe["total_deals"] = total_deals
        pipe["unique_accounts"] = len(accounts)
        pipe["unique_employees"] = len(individuals)

    at_risk = [
        r
        for r in (data.get("at_risk_ics") or [])
        if any(_names_match(r.get("name"), a) for a in allowed)
    ]
    top = data.get("top_attainers") or {}
    top_scoped = {
        "by_attainment_pct": [
            t for t in (top.get("by_attainment_pct") or []) if any(_names_match(t.get("name"), a) for a in allowed)
        ],
        "by_value_closed": [
            t for t in (top.get("by_value_closed") or []) if any(_names_match(t.get("name"), a) for a in allowed)
        ],
    }

    scoped["individuals"] = individuals
    scoped["leaders_dashboard"] = leaders
    scoped["accounts"] = accounts
    scoped["rtm_divisions"] = rtm_divisions
    scoped["division_aggregates"] = division_aggregates
    scoped["pipeline"] = pipe or None
    scoped["kpis"] = _recompute_kpis(data, individuals)
    scoped["at_risk_ics"] = at_risk
    scoped["top_attainers"] = top_scoped
    scoped["teams"] = [
        t
        for t in (data.get("teams") or [])
        if any(_names_match(t.get("team_lead"), a) for a in allowed)
    ]
    scoped["_scope"] = {
        "mode": "filtered",
        "role": user.role,
        "employee_name": user.employee_name,
        "allowed_count": len(allowed),
    }
    return scoped
