#!/usr/bin/env python3
"""Parse Galaxy Quota Tracker Excel into structured JSON for the dashboard."""

import json
import re
import sys
from pathlib import Path

import pandas as pd

from quota_rules import (
    apply_hrushikesh_exclusions,
    compute_gp_pct,
    get_deal_multiplier,
    parse_crm_status,
)

ROOT = Path(__file__).resolve().parent.parent
EXCEL_PATH = ROOT / "files" / "Galaxy Quota Tracker - 14072026.xlsx"
PIPELINE_PATH = ROOT / "files" / "Opportunity Pipeline Q1.xlsx"  # legacy alias kept for imports
PIPELINE_Q1_PATH = ROOT / "files" / "Opportunity Pipeline Q1.xlsx"
PIPELINE_Q2_PATH = ROOT / "files" / "Opportunity Pipeline Q2.xlsx"
BUSINESS_PLAN_PATH = ROOT / "files" / "Business Plan Final Ver 1.6.xlsx"
SALES_TEAM_PATH = ROOT / "files" / "Sales Team - S1, S2 , CB, GB, South.xlsx"
EMPLOYEE_MAPPING_PATH = ROOT / "data" / "Employee_Mapping.csv"
TARGET_QUOTA_PATH = ROOT / "data" / "Target_Quota.csv"
OUTPUT_PATH = ROOT / "dashboard" / "public" / "data" / "quota_data.json"

RTM_DIVISIONS = {"S1", "S2", "CB", "GB", "South"}

PIPELINE_ALIASES = {
    "Vidula Chawan": "Vidula Chavan",
    "Sankeerth Bhargav": "Sankeerth",
    "Shubhangi Srinivasan": "Shubhangi",
    "Ayushman Singh": "Ayushaman",
    "Arpit Srivastava": "TBH (Arpit)",
    "Varsha Ray": "TBH (Varsha)",
    "Riya Bhatt": "Riya Khemraj Roshyara",
    "Riya Roshyara": "Riya Khemraj Roshyara",
    "Hrushikesh Bagade": "Hrushikesh Bagade",
    "Jitesh Rajput": "Jitesh Rajput",
    "Prashant Dudugu": "Prashant Ramchandra Dudugu - Team Lead",
    "Prashant Ddugu": "Prashant Ramchandra Dudugu - Team Lead",
    "Tasneem K": "Tasneem  Khatri",
    "Ishwari Kadam": "Ishwari Santosh Kadam",
    "Pratik Kadam": "Pratik Vilas Kadam",
}

DEPT_TO_RTM = {
    "Stratgic 1": "S1",
    "AVP - Stratgic 1": "S1",
    "Stratgic 2": "S2",
    "AVP - Stratgic 2": "S2",
    "Commercial Business": "CB",
    "BU - Commercial Business": "CB",
    "Commercial Business- Team Lead": "CB",
    "Growth Busniss": "GB",
    "BU - Growth Business": "GB",
    "Growth Busniss - Team Lead": "GB",
    "South sales": "South",
    "South sales- Team Lead": "South",
    "Geo Expansion": "GeoX",
    "BU - Geo Expansion": "GeoX",
}

CAT_TO_BU = {
    "Data Centre": "DCG",
    "Cyber Security & Networking": "CSN",
    "CSG (EndPoint)": "CSG",
    "Professional Services": "PS",
    "Cloud": "Cloud",
    "AI": "AI",
}


def to_num(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, str):
        val = val.strip()
        if val in ("", "-", "—", "nan"):
            return None
        try:
            return float(val.replace(",", ""))
        except ValueError:
            return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def to_pct(val):
    n = to_num(val)
    if n is None:
        return None
    return round(n * 100, 2) if abs(n) <= 1.5 else round(n, 2)


def clean_str(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    return s if s else None


def normalize_division(div):
    if not div:
        return None
    return div.strip()


def load_sales_team_mapping():
    """Build employee mapping from Sales Team Excel (preferred source)."""
    if not SALES_TEAM_PATH.exists():
        return {}
    df = pd.read_excel(SALES_TEAM_PATH, sheet_name="Sheet2", header=1)
    mapping = {}
    for _, row in df.iterrows():
        name = clean_str(row.get("Employee Name"))
        if not name or name == "Employee Name":
            continue
        dept = clean_str(row.get("Dept"))
        status = clean_str(row.get("Status"))
        manager = clean_str(row.get("Roporting Manager"))
        rtm = DEPT_TO_RTM.get(dept)
        persona = "TL" if "team lead" in name.lower() or "lead" in (dept or "").lower() else "IC"
        if dept and "BU" in dept:
            persona = "BU HEAD" if "HEAD" in dept else persona
        mapping[name] = {
            "rtm_division": rtm,
            "persona": persona,
            "bu": dept,
            "team_lead": manager,
            "active": (status or "Active").lower() == "active",
        }
        # Short-name aliases for pipeline matching
        parts = name.split()
        if len(parts) >= 2:
            short = f"{parts[0]} {parts[-1]}"
            if short not in mapping:
                mapping[short] = mapping[name]
    return mapping


def load_employee_mapping():
    if SALES_TEAM_PATH.exists():
        return load_sales_team_mapping()
    if not EMPLOYEE_MAPPING_PATH.exists():
        return {}
    df = pd.read_csv(EMPLOYEE_MAPPING_PATH)
    mapping = {}
    for _, row in df.iterrows():
        name = clean_str(row.get("Employee Name"))
        if not name:
            continue
        mapping[name] = {
            "rtm_division": normalize_division(clean_str(row.get("RTM Division"))),
            "persona": clean_str(row.get("Persona")) or "IC",
            "bu": clean_str(row.get("BU")),
            "team_lead": clean_str(row.get("Team Lead")),
            "active": str(row.get("Active", "Yes")).strip().lower() in ("yes", "y", "1", "true"),
        }
    return mapping


def load_target_quota():
    if not TARGET_QUOTA_PATH.exists():
        return {}
    df = pd.read_csv(TARGET_QUOTA_PATH)
    targets = {}
    for _, row in df.iterrows():
        period = clean_str(row.get("Period"))
        if not period:
            continue
        key = period.lower()
        targets[key] = {
            "bu_quota": to_num(row.get("BU Actuals Quota (Cr)")),
            "ic_quota": to_num(row.get("IC Quota (Cr)")),
            "pipeline_target": to_num(row.get("Pipeline Target (Cr)")),
        }
    return targets


def parse_rtm_subtotals(xl, bp_quotas):
    df = pd.read_excel(xl, sheet_name="V1 · Individual", header=1)
    q1q, q1a = "Q1 Quota\n(₹ Cr)", "Q1 Actuals\n(₹ Cr)"
    h1q, h1a = "H1 Quota\n(₹ Cr)", "H1 Actuals\n(₹ Cr)"
    q2q, q2a = "Q2 Quota\n(₹ Cr)", "Q2 Actuals\n(₹ Cr)"
    h2q, h2a = "H2 Quota\n(₹ Cr)", "H2 Actuals\n(₹ Cr)"
    annq, anna = "Annual Quota\n(₹ Cr)", "Annual  Annual Actuals\n(₹ Cr)"
    if anna not in df.columns:
        anna = "Annual Actuals\n(₹ Cr)"

    records = []
    for _, row in df.iterrows():
        name = clean_str(row.get("Employee Name"))
        if not name or "IC Subtotal" not in name:
            continue
        division = name.replace("IC Subtotal — ", "").strip()
        if division not in RTM_DIVISIONS:
            continue

        bp_q = bp_quotas.get(division, {})

        def period_metrics(quota_col, actuals_col, att_col=None):
            quota = to_num(row.get(quota_col))
            actuals = to_num(row.get(actuals_col))
            att = to_pct(row.get(att_col)) if att_col else None
            if att is None and quota and actuals is not None:
                att = round(actuals / quota * 100, 2)
            return {"quota": quota, "actuals": actuals, "attainment_pct": att}

        h2_act = to_num(row.get(h2a)) or 0
        q3_a = round(h2_act / 2, 2)
        q4_a = round(h2_act / 2, 2)
        q3_q = bp_q.get("q3")
        q4_q = bp_q.get("q4")

        records.append(
            {
                "division": division,
                "q1": period_metrics(q1q, q1a, "Attainment %\n(Q1)"),
                "q2": period_metrics(q2q, q2a, "Attainment %\n(Q2)"),
                "h1": period_metrics(h1q, h1a, "Attainment %\n(H1)"),
                "q3": {"quota": q3_q, "actuals": q3_a, "attainment_pct": round(q3_a / q3_q * 100, 2) if q3_q else 0},
                "q4": {"quota": q4_q, "actuals": q4_a, "attainment_pct": round(q4_a / q4_q * 100, 2) if q4_q else 0},
                "h2": period_metrics(h2q, h2a, "Attainment %\n(H2)"),
                "annual": period_metrics(annq, anna, "Attainment %\n(Annual)"),
            }
        )
    return sorted(records, key=lambda x: x["h1"]["actuals"] or 0, reverse=True)


def parse_grand_total(xl):
    """Read Quota/Actuals for Q1, Q2, H1, and Annual directly from specific
    cells in V1 · Individual row 65 (GRAND TOTAL — All IC).

    Cell mapping confirmed against Excel file:
      Q1  Quota=F65, Actuals=G66
      Q2  Quota=I65, Actuals=J66
      H1  Quota=L65, Actuals=M66
      Annual Quota=R65, Actuals=S66

    H2 Quota is pulled from O65. H2 Actuals is derived from Annual - H1.
    """
    import openpyxl
    path = xl if isinstance(xl, str) else xl._io
    wb = openpyxl.load_workbook(path, data_only=True)
    if "V1 \u00b7 Individual" not in wb.sheetnames:
        return None
    ws = wb["V1 \u00b7 Individual"]

    def _num(val):
        try:
            return round(float(val), 2) if val is not None else None
        except (TypeError, ValueError):
            return None

    def _pm(quota, actuals):
        q = _num(quota)
        a = _num(actuals)
        att = round(a / q * 100, 2) if q and a is not None else None
        return {"quota": q, "actuals": a, "attainment_pct": att}

    q1  = _pm(ws["F65"].value, ws["G66"].value)
    q2  = _pm(ws["I65"].value, ws["J66"].value)
    h1  = _pm(ws["L65"].value, ws["M66"].value)
    ann = _pm(ws["R65"].value, ws["S66"].value)

    # Header bar stats: M65 = IC H1 Actuals (used as Pipeline), U65 = Closed Opps count
    header_pipeline_cr  = _num(ws["M65"].value)
    header_closed_opps  = ws["U65"].value
    header_ic_actuals   = _num(ws["M66"].value)
    try:
        header_closed_opps = int(header_closed_opps) if header_closed_opps is not None else 0
    except (TypeError, ValueError):
        header_closed_opps = 0

    # H2 Quota explicit from O65, H2 Actuals derived from Annual - H1
    h2_quota   = _num(ws["O65"].value)
    h2_actuals = round((ann["actuals"] or 0) - (h1["actuals"] or 0), 2) if ann["actuals"] is not None and h1["actuals"] is not None else None
    h2_att     = round(h2_actuals / h2_quota * 100, 2) if h2_quota and h2_actuals else None
    h2 = {"quota": h2_quota, "actuals": h2_actuals, "attainment_pct": h2_att}

    return {
        "q1": q1, "q2": q2, "h1": h1, "h2": h2, "annual": ann,
        "header_pipeline_cr": header_pipeline_cr,
        "header_closed_opps": header_closed_opps,
        "header_ic_actuals": header_ic_actuals,
    }



def parse_v3_closed_deals(xl):
    """Read closed-deal counts from specific cells in V3 · RTM Division level.
    Row 12, columns F / M / W / AK correspond to Q1 / Q2 / H1 / Annual.
    Uses openpyxl (data_only=True) so formula results are read directly.
    """
    import openpyxl
    path = xl if isinstance(xl, str) else xl._io
    wb = openpyxl.load_workbook(path, data_only=True)
    if "V3 \u00b7 RTM Division level" not in wb.sheetnames:
        return {"q1": 0, "q2": 0, "h1": 0, "annual": 0}
    ws = wb["V3 \u00b7 RTM Division level"]
    def _int(val):
        try:
            return int(val) if val is not None else 0
        except (TypeError, ValueError):
            return 0
    return {
        "q1":     _int(ws["F12"].value),
        "q2":     _int(ws["M12"].value),
        "h1":     _int(ws["W12"].value),
        "annual": _int(ws["AK12"].value),
    }


def apply_employee_mapping(individuals, mapping):
    def find_mapping(name):
        if name in mapping:
            return mapping[name]
        name_lower = name.lower()
        for k, v in mapping.items():
            if k.lower() == name_lower:
                return v
        # First + last name match
        parts = name.split()
        if len(parts) >= 2:
            for k, v in mapping.items():
                kp = k.split()
                if len(kp) >= 2 and kp[0].lower() == parts[0].lower() and kp[-1].lower() == parts[-1].lower():
                    return v
        return None

    for emp in individuals:
        m = find_mapping(emp["name"])
        if not m:
            continue
        if m.get("rtm_division"):
            emp["division"] = m["rtm_division"]
        if m.get("persona"):
            emp["persona"] = m["persona"]
        emp["bu"] = m.get("bu")
        emp["team_lead"] = m.get("team_lead")
        emp["active"] = m.get("active", True)


def parse_individual(xl):
    df = pd.read_excel(xl, sheet_name="V1 · Individual", header=1)
    records = []
    current_division = None

    for _, row in df.iterrows():
        name = clean_str(row.get("Employee Name"))
        if not name:
            continue

        if "Division" in name and name.strip().endswith("Division"):
            current_division = name.replace("Division", "").strip()
            continue
        if "Subtotal" in name:
            continue

        division = normalize_division(clean_str(row.get("Division"))) or current_division
        persona = clean_str(row.get("Type / Notes")) or "Unknown"

        records.append(
            {
                "id": clean_str(row.get("#")),
                "name": name,
                "division": division,
                "fy": clean_str(row.get("FY")),
                "persona": persona,
                "q1": {
                    "quota": to_num(row.get("Q1 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("Q1 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment %\n(Q1)")),
                },
                "q2": {
                    "quota": to_num(row.get("Q2 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("Q2 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment %\n(Q2)")),
                },
                "h1": {
                    "quota": to_num(row.get("H1 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("H1 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment %\n(H1)")),
                },
                "h2": {
                    "quota": to_num(row.get("H2 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("H2 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment %\n(H2)")),
                },
                "annual": {
                    "quota": to_num(row.get("Annual Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("Annual Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment %\n(Annual)")),
                },
                "deals": {
                    "total": to_num(row.get("# Deals\n(Total)")),
                    "led_by_count": to_num(row.get("Led-By Deals\n(count)")),
                    "led_by_rev": to_num(row.get("Led-By Rev\n(₹ Cr)")),
                    "contributed_count": to_num(row.get("Contributed\nDeals (count)")),
                    "contributed_rev": to_num(row.get("Contributed\nRev (₹ Cr)")),
                },
                "closed_deals": to_num(row.get("# Deals\n(Total)")),
                "rank_division": clean_str(row.get("Rank\n(Div.)")),
                "bu": None,
                "team_lead": None,
                "active": True,
            }
        )
    return records


def parse_leaders(xl):
    import openpyxl
    path = xl if isinstance(xl, str) else xl._io
    try:
        wb = openpyxl.load_workbook(path, data_only=True)
    except Exception:
        return []
        
    sheet = "V2 · Leadership"
    if "V2 · Leadership " in wb.sheetnames:
        sheet = "V2 · Leadership "
    elif "V2 · Leaders" in wb.sheetnames:
        sheet = "V2 · Leaders"
        
    if sheet not in wb.sheetnames:
        return []
        
    ws = wb[sheet]
    leaders = {}
    
    # Table 1: Bottomline (Rows 3-10)
    for r in range(3, 11):
        name = clean_str(ws.cell(row=r, column=2).value)
        if not name:
            continue
        role = clean_str(ws.cell(row=r, column=5).value)
        bl_val = to_num(ws.cell(row=r, column=19).value) # Col S
        leaders[name] = {
            "name": name,
            "role": role,
            "bottomline_cr": bl_val if bl_val is not None else 0,
            "topline_cr": 0
        }
        
    # Table 2: Topline (Rows 15-22)
    for r in range(15, 23):
        name = clean_str(ws.cell(row=r, column=2).value)
        if not name or name not in leaders:
            continue
        tl_val = to_num(ws.cell(row=r, column=19).value) # Col S
        leaders[name]["topline_cr"] = tl_val if tl_val is not None else 0
        
    return list(leaders.values())


def parse_business_plan_quotas():
    quotas = {}
    if not BUSINESS_PLAN_PATH.exists():
        return quotas

    xl = pd.ExcelFile(BUSINESS_PLAN_PATH)
    divisions = ["S1 ", "S2 ", "CB ", "GB ", "South ", "GeoX "]

    for div in divisions:
        if div in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=div)
            rev_row = None
            for i, row in df.iterrows():
                if any("Revenue Goal" in str(cell) for cell in row):
                    rev_row = row
                    break

            if rev_row is not None:
                vals = [val for val in rev_row.values if pd.notna(val) and isinstance(val, (int, float))]
                if len(vals) >= 5:
                    ann, q1, q2, q3, q4 = vals[-5:]
                    clean_div = div.strip()
                    quotas[clean_div] = {
                        "annual": float(ann),
                        "q1": float(q1),
                        "q2": float(q2),
                        "q3": float(q3),
                        "q4": float(q4),
                        "h1": float(q1) + float(q2),
                        "h2": float(q3) + float(q4),
                    }
    return quotas


def parse_team_quota(xl):
    if "V2 · Team Quota" not in xl.sheet_names:
        return []
    df = pd.read_excel(xl, sheet_name="V2 · Team Quota", header=2)
    records = []
    for _, row in df.iterrows():
        name = clean_str(row.get("Team Lead Name"))
        if not name:
            continue
        records.append(
            {
                "team_lead": name,
                "division": normalize_division(clean_str(row.get("Division"))),
                "h1": {
                    "quota": to_num(row.get("H1 Team\nQuota (₹ Cr)")),
                    "actuals": to_num(row.get("H1 Team\nActuals (₹ Cr)")),
                    "vs_company_target": to_pct(row.get("H1 vs Co.\nTarget")),
                    "flag": clean_str(row.get("H1 Flag")),
                },
                "annual": {
                    "quota": to_num(row.get("Annual Team\nQuota (₹ Cr)")),
                    "actuals": to_num(row.get("Annual Team\nActuals (₹ Cr)")),
                    "vs_company_target": to_pct(row.get("Annual vs Co.\nTarget")),
                    "flag": clean_str(row.get("Annual Flag")),
                },
                "deals": to_num(row.get("# Deals\n(Team)")),
                "notes": clean_str(row.get("TL Notes")),
            }
        )
    return records


def parse_bu_level(xl):
    if "V4 · BU Level" in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name="V4 · BU Level", header=3)
        records = []
        for _, row in df.iterrows():
            service = clean_str(row.get("Service"))
            bu = clean_str(row.get("BU"))
            if not service or not bu or service.startswith("TOTAL") or bu == "—":
                continue
            records.append(
                {
                    "service": service,
                    "bu": bu,
                    "h1": {
                        "quota": to_num(row.get("Quota")),
                        "actuals": to_num(row.get("Actuals")),
                        "attainment_pct": to_pct(row.get("Att%")),
                        "deals": to_num(row.get("Count")),
                    },
                    "annual": {
                        "quota": to_num(row.get("Quota.2")),
                        "actuals": to_num(row.get("Actuals.2")),
                        "attainment_pct": to_pct(row.get("Att%.2")),
                        "deals": to_num(row.get("Count.1")),
                    },
                }
            )
        return records

    bu_sheets = [
        ("V5 · DCG", "DCG", "Data Centre"),
        ("V6 · CSN", "CSN", "Cyber Security & Networking"),
        ("V7 · PS", "PS", "Professional Services"),
        ("V8 · CSG", "CSG", "CSG (EndPoint)"),
        ("V9 · Cloud", "Cloud", "Cloud"),
    ]
    records = []
    for sheet, bu, service in bu_sheets:
        if sheet not in xl.sheet_names:
            continue
        df = pd.read_excel(xl, sheet_name=sheet, header=1)
        total_rows = df[df["RTM Name"].astype(str).str.contains("RTM Total", case=False, na=False)]
        if total_rows.empty:
            continue
        row = total_rows.iloc[0]
        annq = to_num(row.get("Annual Quota\n(₹ Cr)"))
        anna = to_num(row.get("Annual Actuals\n(₹ Cr)"))
        
        # User requested using Q9 and R9 directly for H1 quota and actuals, rather than fallback math
        h1q = annq
        h1a = anna
        records.append(
            {
                "service": service,
                "bu": bu,
                "q1": {
                    "quota": to_num(row.get("Q1 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("Q1 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment\n %\n(Q1)")),
                },
                "q2": {
                    "quota": to_num(row.get("Q2 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("Q2 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment \n%\n(Q2)")),
                },
                "h1": {
                    "quota": h1q,
                    "actuals": h1a,
                    "attainment_pct": round(h1a / h1q * 100, 2) if h1q else to_pct(row.get("Attainment %\n(H1)")),
                    "deals": to_num(row.get("# Deals\n(Total)")),
                },
                "h2": {
                    "quota": to_num(row.get("H2 Quota\n(₹ Cr)")),
                    "actuals": to_num(row.get("H2 Actuals\n(₹ Cr)")),
                    "attainment_pct": to_pct(row.get("Attainment %\n(H2)")),
                },
                "annual": {
                    "quota": annq,
                    "actuals": anna,
                    "attainment_pct": to_pct(row.get("Attainment %\n(Annual)")),
                    "deals": to_num(row.get("# Deals\n(Total)")),
                },
            }
        )
    return records


def parse_rtm_bu_sheet(xl, sheet_name, bu_code):
    df = pd.read_excel(xl, sheet_name=sheet_name, header=1)
    records = []
    for _, row in df.iterrows():
        name = clean_str(row.get("RTM Name"))
        if not name:
            continue
        q1_q = to_num(row.get("Q1 Quota\n(₹ Cr)"))
        q1_a = to_num(row.get("Q1 Actuals\n(₹ Cr)"))
        q1_att = to_pct(row.get("Attainment\n %\n(Q1)"))
        
        h1_q = to_num(row.get("H1 Quota\n(₹ Cr)"))
        h1_a = to_num(row.get("H1 Actuals\n(₹ Cr)"))
        h1_att = to_pct(row.get("Attainment %\n(H1)"))
        
        ann_q = to_num(row.get("Annual Quota\n(₹ Cr)"))
        ann_a = to_num(row.get("Annual Actuals\n(₹ Cr)"))
        ann_att = to_pct(row.get("Attainment %\n(Annual)"))

        q2_q = to_num(row.get("Q2 Quota\n(₹ Cr)"))
        q2_a = to_num(row.get("Q2 Actuals\n(₹ Cr)"))
        q2_att = to_pct(row.get("Attainment \n%\n(Q2)"))
        if q2_att is None and q2_q and q2_a is not None:
            q2_att = round(q2_a / q2_q * 100, 2)
        
        h2_q = round((ann_q or 0) - (h1_q or 0), 2)
        h2_a = round((ann_a or 0) - (h1_a or 0), 2)
        h2_att = round(h2_a / h2_q * 100, 2) if h2_q else 0
        
        q3_q = round(h2_q / 2, 2)
        q3_a = round(h2_a / 2, 2)
        q3_att = round(q3_a / q3_q * 100, 2) if q3_q else 0
        q4_q, q4_a, q4_att = q3_q, q3_a, q3_att

        records.append(
            {
                "name": name,
                "division": normalize_division(clean_str(row.get("Division"))),
                "bu": bu_code,
                "fy": clean_str(row.get("FY")),
                "q1": {"quota": q1_q, "actuals": q1_a, "attainment_pct": q1_att},
                "q2": {"quota": q2_q, "actuals": q2_a, "attainment_pct": q2_att},
                "h1": {"quota": h1_q, "actuals": h1_a, "attainment_pct": h1_att},
                "q3": {"quota": q3_q, "actuals": q3_a, "attainment_pct": q3_att},
                "q4": {"quota": q4_q, "actuals": q4_a, "attainment_pct": q4_att},
                "h2": {"quota": h2_q, "actuals": h2_a, "attainment_pct": h2_att},
                "annual": {"quota": ann_q, "actuals": ann_a, "attainment_pct": ann_att},
            }
        )
    return records


def parse_division_summary(xl):
    df = pd.read_excel(xl, sheet_name="V3 · RTM Division level", header=None)
    records = []
    current_level = None

    for i in range(3, len(df)):
        name = clean_str(df.iloc[i, 0])
        if not name:
            continue
        if name.startswith("("):
            current_level = name.strip()
            continue
        if "TOTAL" in name.upper() or "Grand" in name:
            continue

        division = normalize_division(clean_str(df.iloc[i, 1]))

        def period(col_base):
            return {
                "quota": to_num(df.iloc[i, col_base]),
                "actuals": to_num(df.iloc[i, col_base + 1]),
                "attainment_pct": to_pct(df.iloc[i, col_base + 2]),
            }

        records.append(
            {
                "name": name.strip(),
                "division": division,
                "level": current_level,
                "q1_revenue": period(2),
                "q2_revenue": period(8),
                "h1_revenue": period(14),
                "h1_deals": to_num(df.iloc[i, 20]),
                "h2_revenue": period(21),
                "h2_deals": to_num(df.iloc[i, 27]),
                "annual_revenue": period(28),
                "annual_deals": to_num(df.iloc[i, 34]),
            }
        )
    return records


def aggregate_by_division(individuals):
    divisions = {}
    for emp in individuals:
        div = emp["division"] or "Unknown"
        if div not in divisions:
            divisions[div] = {
                "division": div,
                "employee_count": 0,
                "h1_quota": 0,
                "h1_actuals": 0,
                "annual_quota": 0,
                "annual_actuals": 0,
                "personas": {},
            }
        d = divisions[div]
        d["employee_count"] += 1
        d["h1_quota"] += emp["h1"]["quota"] or 0
        d["h1_actuals"] += emp["h1"]["actuals"] or 0
        d["annual_quota"] += emp["annual"]["quota"] or 0
        d["annual_actuals"] += emp["annual"]["actuals"] or 0

        p = emp["persona"]
        if p not in d["personas"]:
            d["personas"][p] = {"count": 0, "h1_actuals": 0, "h1_quota": 0}
        d["personas"][p]["count"] += 1
        d["personas"][p]["h1_actuals"] += emp["h1"]["actuals"] or 0
        d["personas"][p]["h1_quota"] += emp["h1"]["quota"] or 0

    result = []
    for div, d in divisions.items():
        h1_att = (d["h1_actuals"] / d["h1_quota"] * 100) if d["h1_quota"] else 0
        ann_att = (d["annual_actuals"] / d["annual_quota"] * 100) if d["annual_quota"] else 0
        result.append(
            {
                **d,
                "h1_attainment_pct": round(h1_att, 2),
                "annual_attainment_pct": round(ann_att, 2),
            }
        )
    return sorted(result, key=lambda x: x["h1_actuals"], reverse=True)


def aggregate_by_persona(individuals):
    personas = {}
    for emp in individuals:
        p = emp["persona"]
        if p not in personas:
            personas[p] = {
                "persona": p,
                "count": 0,
                "h1_quota": 0,
                "h1_actuals": 0,
                "annual_quota": 0,
                "annual_actuals": 0,
            }
        personas[p]["count"] += 1
        personas[p]["h1_quota"] += emp["h1"]["quota"] or 0
        personas[p]["h1_actuals"] += emp["h1"]["actuals"] or 0
        personas[p]["annual_quota"] += emp["annual"]["quota"] or 0
        personas[p]["annual_actuals"] += emp["annual"]["actuals"] or 0

    result = []
    for p, data in personas.items():
        h1_att = (data["h1_actuals"] / data["h1_quota"] * 100) if data["h1_quota"] else 0
        result.append({**data, "h1_attainment_pct": round(h1_att, 2)})
    return sorted(result, key=lambda x: x["h1_actuals"], reverse=True)


def parse_inr_amount(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    try:
        return float(str(val).replace(",", "").replace('"', "").strip())
    except ValueError:
        return 0.0


def resolve_pipeline_name(pipeline_name, known_names):
    name = pipeline_name.strip()
    if name in PIPELINE_ALIASES:
        return PIPELINE_ALIASES[name]
    if name in known_names:
        return name
    first = name.split()[0].lower() if name.split() else ""
    candidates = [n for n in known_names if n.split()[0].lower() == first]
    if len(candidates) == 1:
        return candidates[0]
    if len(name.split()) > 1:
        last_prefix = name.split()[-1].lower()[:4]
        candidates = [n for n in known_names if n.split()[-1].lower().startswith(last_prefix[:3])]
        if len(candidates) == 1:
            return candidates[0]
    return name


def _read_single_pipeline_df(path):
    """Read one pipeline file (xlsx or csv) and normalise column names."""
    if not path.exists():
        return None
    if path.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(path, sheet_name=0)
    else:
        df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [re.sub(r'^[\s\ufeff"\t]+', "", str(c)).strip('"').strip() for c in df.columns]
    return df


def read_pipeline_df():
    """Read and combine Opportunity Pipeline Q1 and Q2 files.

    The combined DataFrame is used for ALL pipeline statistics including the
    header bar 'Pipeline' (total Amount) and 'Closed Deals' (total row count).
    """
    dfs = []
    for path in (PIPELINE_Q1_PATH, PIPELINE_Q2_PATH):
        df = _read_single_pipeline_df(path)
        if df is not None:
            dfs.append(df)
    if not dfs:
        return None
    # Concatenate; mismatched columns are filled with NaN
    return pd.concat(dfs, ignore_index=True)


def build_deal_record(row, employee, employee_mapping, individuals):
    category = clean_str(row.get("Category")) or "Unknown"
    bu = CAT_TO_BU.get(category, category)
    sub_category = clean_str(row.get("Sub Category"))
    amount_inr = parse_inr_amount(row.get("Amount"))
    bottomline_inr = parse_inr_amount(row.get("Actual Bottomline -")) or parse_inr_amount(
        row.get("Estimated Bottomline")
    )
    multiplier, multiplier_reason = get_deal_multiplier(bu, sub_category, category)
    quota_credit_inr = 0 if amount_inr <= 0 else round(amount_inr * multiplier, 2)
    gp_pct = compute_gp_pct(amount_inr, bottomline_inr)
    crm = parse_crm_status(clean_str(row.get("Deal Status")), clean_str(row.get("Sales Stage")))

    pipeline_div = clean_str(row.get("Division"))
    rtm_div = None
    if employee in employee_mapping:
        rtm_div = employee_mapping[employee].get("rtm_division")
    if not rtm_div:
        for emp in individuals:
            if emp["name"] == employee:
                rtm_div = emp.get("division")
                break
    if not rtm_div and pipeline_div:
        div_map = {"Geo X": "GeoX", "AVP - S1": "S1", "TL - CB": "CB"}
        rtm_div = div_map.get(pipeline_div, pipeline_div)

    return {
        "opportunity_number": clean_str(row.get("Opportunity Number")),
        "account": clean_str(row.get("Organization Name")),
        "opportunity_name": clean_str(row.get("Opportunity Name")),
        "topline_inr": round(amount_inr, 2),
        "topline_cr": round(amount_inr / 1e7, 4),
        "amount_inr": round(amount_inr, 2),
        "amount_cr": round(amount_inr / 1e7, 4),
        "bottomline_inr": round(bottomline_inr, 2),
        "bottomline_cr": round(bottomline_inr / 1e7, 4),
        "gp_pct": gp_pct,
        "multiplier": multiplier,
        "multiplier_reason": multiplier_reason,
        "quota_credit_inr": quota_credit_inr,
        "quota_credit_cr": round(quota_credit_inr / 1e7, 4),
        "excluded_from_achievement": False,
        "exclusion_reason": None,
        "crm": crm,
        "category": category,
        "bu": bu,
        "sub_category": sub_category,
        "brand": clean_str(row.get("Brand")),
        "close_date": clean_str(row.get("Expected Close Date")),
        "deal_category": clean_str(row.get("Deal Category")),
        "assigned_to": clean_str(row.get("Assigned To")),
        "supported_by": clean_str(row.get("Supported By")),
        "employee": employee,
        "pipeline_led_by": clean_str(row.get("Opportunity Led By")),
        "rtm_division": rtm_div,
        "opf_no": clean_str(row.get("OPF No.")),
        "deal_status_raw": clean_str(row.get("Deal Status")),
    }


def is_pipeline_excluded_employee(name):
    """Hrushikesh is reference-only — visible but excluded from pipeline totals."""
    if not name:
        return False
    n = re.sub(r"\s+", " ", str(name).strip().lower())
    return "hrushikesh" in n


def parse_pipeline(individuals, teams, employee_mapping=None):
    df = read_pipeline_df()
    if df is None:
        return None

    employee_mapping = employee_mapping or {}
    known_names = {e["name"] for e in individuals if e["name"] not in ("Total", "Total Opportunity")}
    known_names |= {t["team_lead"] for t in teams if t.get("team_lead")}
    known_names |= set(employee_mapping.keys())

    deals_by_employee = {}
    all_deals = []
    by_bu = {}
    by_category = {}
    by_rtm = {}

    for _, row in df.iterrows():
        stage = clean_str(row.get("Sales Stage"))
        if stage and "closed" not in stage.lower():
            continue

        led_by = clean_str(row.get("Opportunity Led By"))
        if not led_by:
            continue

        employee = resolve_pipeline_name(led_by, known_names)
        deal = build_deal_record(row, employee, employee_mapping, individuals)
        exclude_totals = is_pipeline_excluded_employee(employee) or is_pipeline_excluded_employee(led_by)
        deal["exclude_from_pipeline_totals"] = exclude_totals

        all_deals.append(deal)
        deals_by_employee.setdefault(employee, []).append(deal)

        if exclude_totals:
            continue

        by_bu.setdefault(bu := deal["bu"], {"deal_count": 0, "revenue_inr": 0, "bottomline_inr": 0, "quota_credit_inr": 0, "accounts": set()})
        by_bu[bu]["deal_count"] += 1
        by_bu[bu]["revenue_inr"] += deal["amount_inr"]
        by_bu[bu]["bottomline_inr"] += deal["bottomline_inr"]
        by_bu[bu]["quota_credit_inr"] += deal["quota_credit_inr"] if not deal["excluded_from_achievement"] else 0
        if deal["account"]:
            by_bu[bu]["accounts"].add(deal["account"])

        by_category.setdefault(deal["category"], {"deal_count": 0, "revenue_inr": 0, "bottomline_inr": 0})
        by_category[deal["category"]]["deal_count"] += 1
        by_category[deal["category"]]["revenue_inr"] += deal["amount_inr"]
        by_category[deal["category"]]["bottomline_inr"] += deal["bottomline_inr"]

        rtm_div = deal.get("rtm_division")
        if rtm_div and rtm_div in RTM_DIVISIONS:
            by_rtm.setdefault(rtm_div, {"deal_count": 0, "revenue_inr": 0, "bottomline_inr": 0, "quota_credit_inr": 0, "accounts": set()})
            by_rtm[rtm_div]["deal_count"] += 1
            by_rtm[rtm_div]["revenue_inr"] += deal["amount_inr"]
            by_rtm[rtm_div]["bottomline_inr"] += deal["bottomline_inr"]
            by_rtm[rtm_div]["quota_credit_inr"] += deal["quota_credit_inr"] if not deal["excluded_from_achievement"] else 0
            if deal["account"]:
                by_rtm[rtm_div]["accounts"].add(deal["account"])

    all_deals = apply_hrushikesh_exclusions(all_deals)

    # Rebuild employee buckets after exclusions
    deals_by_employee = {}
    for d in all_deals:
        deals_by_employee.setdefault(d["employee"], []).append(d)

    def build_employee_pipeline(deals):
        accounts_map = {}
        for d in deals:
            if d.get("excluded_from_achievement"):
                continue
            acct = d["account"] or "Unknown"
            if acct not in accounts_map:
                accounts_map[acct] = {
                    "account": acct,
                    "deal_count": 0,
                    "revenue_inr": 0,
                    "revenue_cr": 0,
                    "bottomline_inr": 0,
                    "bottomline_cr": 0,
                    "quota_credit_inr": 0,
                    "quota_credit_cr": 0,
                    "deals": [],
                }
            accounts_map[acct]["deal_count"] += 1
            accounts_map[acct]["revenue_inr"] += d["amount_inr"]
            accounts_map[acct]["revenue_cr"] = round(accounts_map[acct]["revenue_inr"] / 1e7, 4)
            accounts_map[acct]["bottomline_inr"] += d["bottomline_inr"]
            accounts_map[acct]["bottomline_cr"] = round(accounts_map[acct]["bottomline_inr"] / 1e7, 4)
            accounts_map[acct]["quota_credit_inr"] += d["quota_credit_inr"]
            accounts_map[acct]["quota_credit_cr"] = round(accounts_map[acct]["quota_credit_inr"] / 1e7, 4)
            accounts_map[acct]["deals"].append(d)

        counted = [d for d in deals if not d.get("excluded_from_achievement")]
        total_inr = sum(d["amount_inr"] for d in counted)
        total_bl = sum(d["bottomline_inr"] for d in counted)
        total_credit = sum(d["quota_credit_inr"] for d in counted)
        closed_accounts = sorted(accounts_map.values(), key=lambda x: x["revenue_inr"], reverse=True)
        return {
            "deal_count": len(counted),
            "deal_count_total": len(deals),
            "account_count": len(closed_accounts),
            "total_revenue_inr": round(total_inr, 2),
            "total_revenue_cr": round(total_inr / 1e7, 4),
            "total_bottomline_inr": round(total_bl, 2),
            "total_bottomline_cr": round(total_bl / 1e7, 4),
            "total_quota_credit_inr": round(total_credit, 2),
            "total_quota_credit_cr": round(total_credit / 1e7, 4),
            "closed_accounts": closed_accounts,
            "closed_deals": sorted(deals, key=lambda x: x["amount_inr"], reverse=True),
        }

    employee_pipeline = {emp: build_employee_pipeline(deals) for emp, deals in deals_by_employee.items()}

    counted_deals = [
        d
        for d in all_deals
        if not d.get("excluded_from_achievement") and not d.get("exclude_from_pipeline_totals")
    ]
    total_inr = sum(d["amount_inr"] for d in counted_deals)
    total_bl = sum(d["bottomline_inr"] for d in counted_deals)
    total_credit = sum(d["quota_credit_inr"] for d in counted_deals)
    unique_accounts = len({d["account"] for d in counted_deals if d["account"]})
    unique_employees = len({d["employee"] for d in counted_deals})

    pipeline_summary = {
        "source": "Opportunity Pipeline Q1 + Q2",
        "period": "H1 FY 25-26",
        "total_deals": len(counted_deals),
        "total_deals_raw": len(all_deals),
        "total_revenue_inr": round(total_inr, 2),
        "total_revenue_cr": round(total_inr / 1e7, 2),
        "total_bottomline_inr": round(total_bl, 2),
        "total_bottomline_cr": round(total_bl / 1e7, 2),
        "total_quota_credit_inr": round(total_credit, 2),
        "total_quota_credit_cr": round(total_credit / 1e7, 2),
        "unique_accounts": unique_accounts,
        "unique_employees": unique_employees,
        "multiplier_rules": {
            "PS": "2X (primary focus areas)",
            "CSN": "1.3X",
            "DCG_Backup_Storage": "1.2X",
        },
        "by_bu": [
            {
                "bu": bu,
                "deal_count": v["deal_count"],
                "revenue_inr": round(v["revenue_inr"], 2),
                "revenue_cr": round(v["revenue_inr"] / 1e7, 2),
                "bottomline_inr": round(v["bottomline_inr"], 2),
                "bottomline_cr": round(v["bottomline_inr"] / 1e7, 2),
                "quota_credit_inr": round(v["quota_credit_inr"], 2),
                "quota_credit_cr": round(v["quota_credit_inr"] / 1e7, 2),
                "account_count": len(v["accounts"]),
            }
            for bu, v in sorted(by_bu.items(), key=lambda x: x[1]["revenue_inr"], reverse=True)
        ],
        "by_category": [
            {
                "category": cat,
                "deal_count": v["deal_count"],
                "revenue_inr": round(v["revenue_inr"], 2),
                "revenue_cr": round(v["revenue_inr"] / 1e7, 2),
                "bottomline_inr": round(v["bottomline_inr"], 2),
                "bottomline_cr": round(v["bottomline_inr"] / 1e7, 2),
            }
            for cat, v in sorted(by_category.items(), key=lambda x: x[1]["revenue_inr"], reverse=True)
        ],
        "by_rtm": [
            {
                "division": div,
                "deal_count": v["deal_count"],
                "revenue_inr": round(v["revenue_inr"], 2),
                "revenue_cr": round(v["revenue_inr"] / 1e7, 2),
                "bottomline_inr": round(v["bottomline_inr"], 2),
                "bottomline_cr": round(v["bottomline_inr"] / 1e7, 2),
                "quota_credit_inr": round(v["quota_credit_inr"], 2),
                "quota_credit_cr": round(v["quota_credit_inr"] / 1e7, 2),
                "account_count": len(v["accounts"]),
            }
            for div, v in sorted(by_rtm.items(), key=lambda x: x[1]["revenue_inr"], reverse=True)
        ],
    }

    return {"summary": pipeline_summary, "by_employee": employee_pipeline, "all_deals": all_deals}


def build_org_accounts(all_deals, ic_h1_quota_cr=None, pipeline_topline_cr=None, pipeline_bottomline_cr=None):
    """Org-wide account rollup from closed-won deals (excludes achievement + pipeline exclusions)."""
    accounts_map = {}
    for d in all_deals:
        if d.get("excluded_from_achievement") or d.get("exclude_from_pipeline_totals"):
            continue
        acct = d.get("account") or "Unknown"
        if acct not in accounts_map:
            accounts_map[acct] = {
                "account": acct,
                "deal_count": 0,
                "revenue_inr": 0.0,
                "revenue_cr": 0.0,
                "bottomline_inr": 0.0,
                "bottomline_cr": 0.0,
                "quota_credit_inr": 0.0,
                "quota_credit_cr": 0.0,
                "employees": set(),
                "rtm_divisions": set(),
                "bus": {},
                "deals": [],
            }
        row = accounts_map[acct]
        row["deal_count"] += 1
        row["revenue_inr"] += d.get("amount_inr") or 0
        row["bottomline_inr"] += d.get("bottomline_inr") or 0
        row["quota_credit_inr"] += d.get("quota_credit_inr") or 0
        if d.get("employee"):
            row["employees"].add(d["employee"])
        rtm = d.get("rtm_division")
        if rtm:
            row["rtm_divisions"].add(rtm)
        bu = d.get("bu") or "Other"
        if bu not in row["bus"]:
            row["bus"][bu] = {
                "bu": bu,
                "deal_count": 0,
                "revenue_inr": 0.0,
                "revenue_cr": 0.0,
                "bottomline_inr": 0.0,
                "bottomline_cr": 0.0,
            }
        row["bus"][bu]["deal_count"] += 1
        row["bus"][bu]["revenue_inr"] += d.get("amount_inr") or 0
        row["bus"][bu]["bottomline_inr"] += d.get("bottomline_inr") or 0
        row["deals"].append(d)

    ic_quota = float(ic_h1_quota_cr or 0)
    pipe_tl = float(pipeline_topline_cr or 0)
    pipe_bl = float(pipeline_bottomline_cr or 0)

    accounts = []
    for row in accounts_map.values():
        rev = row["revenue_inr"]
        bl = row["bottomline_inr"]
        credit = row["quota_credit_inr"]
        rev_cr = round(rev / 1e7, 4)
        bl_cr = round(bl / 1e7, 4)
        credit_cr = round(credit / 1e7, 4)
        gp_pct = round(bl / rev * 100, 2) if rev else 0.0
        by_bu = []
        for bu_row in row["bus"].values():
            by_bu.append(
                {
                    "bu": bu_row["bu"],
                    "deal_count": bu_row["deal_count"],
                    "revenue_inr": round(bu_row["revenue_inr"], 2),
                    "revenue_cr": round(bu_row["revenue_inr"] / 1e7, 4),
                    "bottomline_inr": round(bu_row["bottomline_inr"], 2),
                    "bottomline_cr": round(bu_row["bottomline_inr"] / 1e7, 4),
                }
            )
        by_bu.sort(key=lambda x: x["revenue_inr"], reverse=True)
        primary_bu = by_bu[0]["bu"] if by_bu else None
        accounts.append(
            {
                "account": row["account"],
                "deal_count": row["deal_count"],
                "revenue_inr": round(rev, 2),
                "revenue_cr": rev_cr,
                "bottomline_inr": round(bl, 2),
                "bottomline_cr": bl_cr,
                "quota_credit_inr": round(credit, 2),
                "quota_credit_cr": credit_cr,
                "gp_pct": gp_pct,
                "pct_of_ic_h1_quota": round(rev_cr / ic_quota * 100, 3) if ic_quota else None,
                "pct_of_pipeline_topline": round(rev_cr / pipe_tl * 100, 2) if pipe_tl else None,
                "pct_of_pipeline_bottomline": round(bl_cr / pipe_bl * 100, 2) if pipe_bl else None,
                "employees": sorted(row["employees"]),
                "employee_count": len(row["employees"]),
                "rtm_divisions": sorted(row["rtm_divisions"]),
                "primary_bu": primary_bu,
                "by_bu": by_bu,
                "deals": sorted(row["deals"], key=lambda x: x.get("amount_inr") or 0, reverse=True),
            }
        )

    accounts.sort(key=lambda x: x["revenue_inr"], reverse=True)
    return accounts


def build_org_brands(all_deals, ic_h1_quota_cr=None, pipeline_topline_cr=None, pipeline_bottomline_cr=None):
    """Org-wide brand rollup from closed-won deals (Brand column in Opportunity Pipeline)."""
    brands_map = {}
    for d in all_deals:
        if d.get("excluded_from_achievement") or d.get("exclude_from_pipeline_totals"):
            continue
        brand = (d.get("brand") or "Others").strip() or "Others"
        if brand not in brands_map:
            brands_map[brand] = {
                "brand": brand,
                "deal_count": 0,
                "revenue_inr": 0.0,
                "bottomline_inr": 0.0,
                "quota_credit_inr": 0.0,
                "employees": set(),
                "accounts": set(),
                "rtm_divisions": set(),
                "bus": {},
                "deals": [],
            }
        row = brands_map[brand]
        row["deal_count"] += 1
        row["revenue_inr"] += d.get("amount_inr") or 0
        row["bottomline_inr"] += d.get("bottomline_inr") or 0
        row["quota_credit_inr"] += d.get("quota_credit_inr") or 0
        if d.get("employee"):
            row["employees"].add(d["employee"])
        if d.get("account"):
            row["accounts"].add(d["account"])
        rtm = d.get("rtm_division")
        if rtm:
            row["rtm_divisions"].add(rtm)
        bu = d.get("bu") or "Other"
        if bu not in row["bus"]:
            row["bus"][bu] = {
                "bu": bu,
                "deal_count": 0,
                "revenue_inr": 0.0,
                "bottomline_inr": 0.0,
            }
        row["bus"][bu]["deal_count"] += 1
        row["bus"][bu]["revenue_inr"] += d.get("amount_inr") or 0
        row["bus"][bu]["bottomline_inr"] += d.get("bottomline_inr") or 0
        row["deals"].append(d)

    ic_quota = float(ic_h1_quota_cr or 0)
    pipe_tl = float(pipeline_topline_cr or 0)
    pipe_bl = float(pipeline_bottomline_cr or 0)

    brands = []
    for row in brands_map.values():
        rev = row["revenue_inr"]
        bl = row["bottomline_inr"]
        credit = row["quota_credit_inr"]
        rev_cr = round(rev / 1e7, 4)
        bl_cr = round(bl / 1e7, 4)
        credit_cr = round(credit / 1e7, 4)
        gp_pct = round(bl / rev * 100, 2) if rev else 0.0
        by_bu = []
        for bu_row in row["bus"].values():
            by_bu.append(
                {
                    "bu": bu_row["bu"],
                    "deal_count": bu_row["deal_count"],
                    "revenue_inr": round(bu_row["revenue_inr"], 2),
                    "revenue_cr": round(bu_row["revenue_inr"] / 1e7, 4),
                    "bottomline_inr": round(bu_row["bottomline_inr"], 2),
                    "bottomline_cr": round(bu_row["bottomline_inr"] / 1e7, 4),
                }
            )
        by_bu.sort(key=lambda x: x["revenue_inr"], reverse=True)
        primary_bu = by_bu[0]["bu"] if by_bu else None
        # Top accounts for this brand by deal topline
        acct_rev = {}
        for d in row["deals"]:
            a = d.get("account") or "Unknown"
            acct_rev[a] = acct_rev.get(a, 0) + (d.get("amount_inr") or 0)
        top_accounts = [
            {"account": a, "revenue_cr": round(v / 1e7, 4)}
            for a, v in sorted(acct_rev.items(), key=lambda x: x[1], reverse=True)[:8]
        ]
        brands.append(
            {
                "brand": row["brand"],
                "deal_count": row["deal_count"],
                "revenue_inr": round(rev, 2),
                "revenue_cr": rev_cr,
                "bottomline_inr": round(bl, 2),
                "bottomline_cr": bl_cr,
                "quota_credit_inr": round(credit, 2),
                "quota_credit_cr": credit_cr,
                "gp_pct": gp_pct,
                "pct_of_ic_h1_quota": round(rev_cr / ic_quota * 100, 3) if ic_quota else None,
                "pct_of_pipeline_topline": round(rev_cr / pipe_tl * 100, 2) if pipe_tl else None,
                "pct_of_pipeline_bottomline": round(bl_cr / pipe_bl * 100, 2) if pipe_bl else None,
                "employees": sorted(row["employees"]),
                "employee_count": len(row["employees"]),
                "account_count": len(row["accounts"]),
                "rtm_divisions": sorted(row["rtm_divisions"]),
                "primary_bu": primary_bu,
                "by_bu": by_bu,
                "top_accounts": top_accounts,
                "deals": sorted(row["deals"], key=lambda x: x.get("amount_inr") or 0, reverse=True),
            }
        )

    brands.sort(key=lambda x: x["revenue_inr"], reverse=True)
    return brands


def attach_pipeline_to_individuals(individuals, pipeline):
    if not pipeline:
        empty = {
            "deal_count": 0,
            "account_count": 0,
            "total_revenue_inr": 0,
            "total_revenue_cr": 0,
            "closed_accounts": [],
            "closed_deals": [],
        }
        for emp in individuals:
            emp["pipeline"] = empty
        return

    by_employee = pipeline["by_employee"]
    empty = {
        "deal_count": 0,
        "account_count": 0,
        "total_revenue_inr": 0,
        "total_revenue_cr": 0,
        "closed_accounts": [],
        "closed_deals": [],
    }
    for emp in individuals:
        emp["pipeline"] = by_employee.get(emp["name"], empty)
        # Fuzzy match for Hrushikesh name variants
        matched = emp["pipeline"] if emp["pipeline"].get("deal_count") else None
        if not matched or matched is empty:
            for key, val in by_employee.items():
                if is_pipeline_excluded_employee(key) and is_pipeline_excluded_employee(emp["name"]):
                    emp["pipeline"] = val
                    break
        emp["reference_only"] = is_pipeline_excluded_employee(emp["name"])
        emp["exclude_from_pipeline_totals"] = emp["reference_only"]


def enrich_bu_with_pipeline(bu_level, pipeline):
    if not pipeline:
        return bu_level
    bu_map = {b["bu"]: b for b in pipeline["summary"]["by_bu"]}
    for bu in bu_level:
        p = bu_map.get(bu["bu"], {})
        bu["pipeline"] = {
            "deal_count": p.get("deal_count", 0),
            "revenue_cr": p.get("revenue_cr", 0),
            "account_count": p.get("account_count", 0),
        }
    return bu_level


def sum_period(rtm_subtotals, period_key):
    quota = sum(d[period_key]["quota"] or 0 for d in rtm_subtotals)
    actuals = sum(d[period_key]["actuals"] or 0 for d in rtm_subtotals)
    att = round(actuals / quota * 100, 2) if quota else 0
    return {"quota": round(quota, 2), "actuals": round(actuals, 2), "attainment_pct": att}


def sum_bu_period(bu_level, period_key):
    quota = sum((b.get(period_key) or {}).get("quota") or 0 for b in bu_level)
    actuals = sum((b.get(period_key) or {}).get("actuals") or 0 for b in bu_level)
    att = round(actuals / quota * 100, 2) if quota else 0
    return {"quota": round(quota, 2), "actuals": round(actuals, 2), "attainment_pct": att}


def build_period_metrics(bu_level, rtm_subtotals, pipeline, target_quota, grand_total, closed_deals_by_period=None):
    if closed_deals_by_period is None:
        closed_deals_by_period = {}
    pipeline_cr = pipeline["summary"]["total_revenue_cr"] if pipeline else 0
    pipeline_deals = pipeline["summary"]["total_deals"] if pipeline else 0

    def pack(period_key, ic_metrics, bu_metrics=None, include_pipeline=False, show_attainment=True):
        t = target_quota.get(period_key, {})
        bu = bu_metrics or sum_bu_period(bu_level, period_key)
        bu_quota = bu["quota"] or t.get("bu_quota") or 0
        bu_actuals = bu["actuals"] or 0
        has_ic_actuals = (ic_metrics.get("actuals") or 0) > 0
        # Per-period closed deals from V3; fall back to pipeline total for periods
        # that don't have a specific cell (Q3/Q4/H2).
        period_deals = closed_deals_by_period.get(period_key, pipeline_deals if include_pipeline else 0)
        return {
            "bu_quota": round(bu_quota, 2),
            "bu_actuals": round(bu_actuals, 2),
            "bu_attainment_pct": round(bu_actuals / bu_quota * 100, 2) if bu_quota and show_attainment else None,
            "ic_quota": round(ic_metrics["quota"] or 0, 2),
            "ic_actuals": round(ic_metrics["actuals"] or 0, 2),
            "ic_attainment_pct": ic_metrics["attainment_pct"] if show_attainment and has_ic_actuals else None,
            "pipeline_value_cr": pipeline_cr if include_pipeline else 0,
            "closed_deals": period_deals,
            "show_attainment": show_attainment and has_ic_actuals,
            "stly_actuals_cr": None,
            "stly_attainment_pct": None,
        }

    ic_q1 = grand_total["q1"] if grand_total else sum_period(rtm_subtotals, "q1")
    ic_q2 = grand_total["q2"] if grand_total else sum_period(rtm_subtotals, "q2")
    ic_h1 = grand_total["h1"] if grand_total else sum_period(rtm_subtotals, "h1")
    ic_h2 = grand_total["h2"] if grand_total else sum_period(rtm_subtotals, "h2")
    
    # Q3 and Q4 aren't in the tracker, so we still fallback to RTM subtotals (which read them from Business Plan)
    ic_q3 = sum_period(rtm_subtotals, "q3")
    ic_q4 = sum_period(rtm_subtotals, "q4")

    if grand_total:
        ic_annual = grand_total["annual"]
    else:
        ic_annual = {
            "quota": round((ic_h1.get("quota") or 0) + (ic_h2.get("quota") or 0), 2),
            "actuals": round((ic_h1.get("actuals") or 0) + (ic_h2.get("actuals") or 0), 2),
            "attainment_pct": 0,
        }
        if ic_annual["quota"]:
            ic_annual["attainment_pct"] = round(ic_annual["actuals"] / ic_annual["quota"] * 100, 2)

    return {
        "q1": pack("q1", ic_q1, include_pipeline=True, show_attainment=True),
        "q2": pack("q2", ic_q2, show_attainment=(ic_q2.get("actuals") or 0) > 0),
        "h1": pack("h1", ic_h1, include_pipeline=True, show_attainment=True),
        "q3": pack("q3", ic_q3, show_attainment=(ic_q3["actuals"] or 0) > 0),
        "q4": pack("q4", ic_q4, show_attainment=(ic_q4["actuals"] or 0) > 0),
        "h2": pack("h2", ic_h2, show_attainment=(ic_h2.get("actuals") or 0) > 0),
        "annual": pack("annual", ic_annual, show_attainment=(ic_annual["actuals"] or 0) > 0),
    }


def build_at_risk_ics(individuals, threshold=25):
    at_risk = []
    for emp in individuals:
        if emp["name"] in ("Total", "Total Opportunity"):
            continue
        if emp.get("division") not in RTM_DIVISIONS:
            continue
        persona = (emp.get("persona") or "").upper()
        if persona not in ("IC", "UNKNOWN", ""):
            continue
        att = emp["h1"].get("attainment_pct") or 0
        if att < threshold:
            at_risk.append(
                {
                    "name": emp["name"],
                    "division": emp.get("division"),
                    "h1_actuals": emp["h1"].get("actuals"),
                    "h1_quota": emp["h1"].get("quota"),
                    "h1_attainment_pct": att,
                }
            )
    return sorted(at_risk, key=lambda x: x["h1_attainment_pct"] or 0)


def build_top_attainers(individuals, limit=5):
    eligible = [
        e
        for e in individuals
        if (e["h1"].get("quota") or 0) > 0
        and e.get("division") in RTM_DIVISIONS
        and e["name"] not in ("Total", "Total Opportunity")
    ]
    by_pct = sorted(eligible, key=lambda e: e["h1"].get("attainment_pct") or 0, reverse=True)[:limit]
    by_value = sorted(eligible, key=lambda e: e["h1"].get("actuals") or 0, reverse=True)[:limit]
    return {
        "by_attainment_pct": [
            {
                "name": e["name"],
                "division": e.get("division"),
                "h1_actuals": e["h1"].get("actuals"),
                "h1_quota": e["h1"].get("quota"),
                "h1_attainment_pct": e["h1"].get("attainment_pct"),
            }
            for e in by_pct
        ],
        "by_value_closed": [
            {
                "name": e["name"],
                "division": e.get("division"),
                "h1_actuals": e["h1"].get("actuals"),
                "h1_quota": e["h1"].get("quota"),
                "h1_attainment_pct": e["h1"].get("attainment_pct"),
            }
            for e in by_value
        ],
    }


def names_match(a, b):
    if not a or not b:
        return False
    a = re.sub(r"\s+", " ", str(a).strip().lower())
    b = re.sub(r"\s+", " ", str(b).strip().lower())
    if a == b or a in b or b in a:
        return True
    ap, bp = a.split(), b.split()
    if ap and bp and ap[0] == bp[0] and ap[-1] == bp[-1]:
        return True
    return False


def find_individual_by_name(individuals, name):
    for emp in individuals:
        if names_match(emp["name"], name):
            return emp
    return None


LEADER_ROSTER = [
    {
        "initial": "AP",
        "name": "Ajay Patodia",
        "dept": "DCG BU HEAD",
        "division": "DCG",
        "bu": "DCG",
        "scope_depts": ["DCG BU HEAD", "South sales", "South sales- Team Lead"],
        "fallback_divisions": ["South"],
        "rollup_divisions": ["South"],
    },
    {
        "initial": "DK",
        "name": "Dipti  Karpe",
        "dept": "AVP - Stratgic 2",
        "division": "S2",
        "bu": "S2",
        "scope_depts": ["AVP - Stratgic 2", "Stratgic 2"],
        "fallback_divisions": ["S2"],
        "rollup_divisions": ["S2"],
    },
    {
        "initial": "IK",
        "name": "Ishwari Santosh Kadam",
        "dept": "AVP - Stratgic 1",
        "division": "S1",
        "bu": "S1",
        "scope_depts": ["AVP - Stratgic 1", "Stratgic 1"],
        "fallback_divisions": ["S1"],
        "rollup_divisions": ["S1"],
    },
    {
        "initial": "VG",
        "name": "Vineet Gadia",
        "dept": "BU - Commercial Business",
        "division": "CB",
        "bu": "CB",
        "scope_depts": ["BU - Commercial Business", "Commercial Business", "Commercial Business- Team Lead"],
        "fallback_divisions": ["CB"],
        "rollup_divisions": ["CB"],
    },
    {
        "initial": "SK",
        "name": "Sanjeev Kohli",
        "dept": "BU - Geo Expansion",
        "division": "GeoX",
        "bu": "GeoX",
        "scope_depts": ["BU - Geo Expansion", "Geo Expansion"],
        "fallback_divisions": ["GeoX", "Geo X"],
        "rollup_divisions": ["GeoX", "Geo X"],
    },
    {
        "initial": "YB",
        "name": "Yogesh Bhatia",
        "dept": "BU - Growth Busniss",
        "division": "GB",
        "bu": "GB",
        "scope_depts": ["BU - Growth Busniss", "BU - Growth Business", "Growth Busniss", "Growth Busniss - Team Lead"],
        "fallback_divisions": ["GB"],
        "rollup_divisions": ["GB"],
    },
    {
        "initial": "JI",
        "name": "Jitesh Rajput",
        "dept": "BU - Cloud ",
        "division": "Cloud",
        "bu": "Cloud",
        "scope_depts": ["BU - Cloud ", "BU - Cloud"],
        "fallback_divisions": ["Cloud"],
        "rollup_divisions": ["Cloud"],
    },
    {
        "initial": "RY",
        "name": "Rocky Braganza",
        "dept": "CSN ",
        "division": "CSN",
        "bu": "CSN",
        "scope_depts": ["CSN ", "CSN"],
        "fallback_divisions": ["CSN"],
        "rollup_divisions": ["CSN"],
    },
]


def collect_hierarchy_team(leader_name, sales_df):
    team = set()
    frontier = {leader_name}
    rows = list(sales_df.iterrows())
    while frontier:
        next_frontier = set()
        for _, row in rows:
            emp = clean_str(row.get("Employee Name"))
            if not emp or emp == "Employee Name" or emp == leader_name or emp in team:
                continue
            mgr = clean_str(row.get("Roporting Manager")) or ""
            for f in frontier:
                if names_match(mgr, f) or names_match(mgr, leader_name):
                    team.add(emp)
                    next_frontier.add(emp)
                    break
        frontier = next_frontier
    return team


def load_sales_team_df():
    if not SALES_TEAM_PATH.exists():
        return pd.DataFrame()
    df = pd.read_excel(SALES_TEAM_PATH, sheet_name="Sheet2", header=1)
    return df.dropna(subset=["Employee Name"])


def aggregate_period(members, period_key):
    quota = sum((m.get(period_key, {}).get("quota") or 0) for m in members)
    actuals = sum((m.get(period_key, {}).get("actuals") or 0) for m in members)
    att = round(actuals / quota * 100, 2) if quota else 0
    return {"quota": round(quota, 2), "actuals": round(actuals, 2), "attainment_pct": att}


def build_leaders_dashboard(individuals, pipeline, v2_leaders):
    sales_df = load_sales_team_df()
    all_deals = pipeline["all_deals"] if pipeline else []
    v2_map = {clean_str(l.get("name")): l for l in v2_leaders if l.get("name")}

    results = []
    for cfg in LEADER_ROSTER:
        leader_name = cfg["name"]
        hierarchy_names = collect_hierarchy_team(leader_name, sales_df) if not sales_df.empty else set()

        dept_names = set()
        if not sales_df.empty:
            for _, row in sales_df.iterrows():
                emp = clean_str(row.get("Employee Name"))
                dept = clean_str(row.get("Dept"))
                if emp and emp != leader_name and dept in cfg.get("scope_depts", []):
                    dept_names.add(emp)

        # Match individuals by name, division fallback
        matched = {}
        rollup_divs = cfg.get("rollup_divisions", cfg.get("fallback_divisions", []))
        for emp in individuals:
            if emp["name"] in ("Total", "Total Opportunity"):
                continue
            if names_match(emp["name"], leader_name):
                continue
            div = emp.get("division") or ""
            in_rollup = div in rollup_divs
            in_hierarchy = any(names_match(emp["name"], hn) for hn in hierarchy_names)
            in_dept = any(names_match(emp["name"], dn) for dn in dept_names)
            if in_rollup or in_hierarchy or in_dept:
                matched[emp["name"]] = emp

        members = list(matched.values())
        member_names = set(matched.keys())

        # Pipeline rollup for team
        team_deals = [
            d
            for d in all_deals
            if any(names_match(d.get("employee", ""), mn) for mn in member_names)
            and not d.get("excluded_from_achievement")
        ]
        if leader_name == "Ishwari Santosh Kadam":
            print(f"Ishwari members: {member_names}")
            print(f"Ishwari team_deals length: {len(team_deals)}")
            print(f"Sample deal employees: {[d.get('employee') for d in all_deals[:5]]}")
        topline_inr = sum(d.get("amount_inr", 0) for d in team_deals)
        bottomline_inr = sum(d.get("bottomline_inr", 0) for d in team_deals)
        quota_credit_inr = sum(d.get("quota_credit_inr", 0) for d in team_deals)
        gp_pct = round(bottomline_inr / topline_inr * 100, 2) if topline_inr else 0

        h1 = aggregate_period(members, "h1")
        q1 = aggregate_period(members, "q1")
        q2 = aggregate_period(members, "q2")

        v2 = v2_map.get(leader_name) or next(
            (v2_map[k] for k in v2_map if names_match(k, leader_name)), None
        )

        member_summaries = sorted(
            [
                {
                    "name": m["name"],
                    "division": m.get("division"),
                    "persona": m.get("persona"),
                    "h1_actuals": m["h1"].get("actuals"),
                    "h1_quota": m["h1"].get("quota"),
                    "h1_attainment_pct": m["h1"].get("attainment_pct"),
                    "pipeline_topline_cr": m.get("pipeline", {}).get("total_revenue_cr", 0),
                    "pipeline_bottomline_cr": m.get("pipeline", {}).get("total_bottomline_cr", 0),
                    "deal_count": m.get("pipeline", {}).get("deal_count", 0),
                }
                for m in members
            ],
            key=lambda x: x["h1_actuals"] or 0,
            reverse=True,
        )

        att = h1["attainment_pct"]
        results.append(
            {
                "initial": cfg["initial"],
                "name": leader_name,
                "dept": cfg["dept"],
                "division": cfg["division"],
                "bu": cfg["bu"],
                "role": v2.get("role") if v2 else cfg["dept"],
                "reports_to": "Sanjay Patodia",
                "team_size": len(members),
                "status": status_flag(att),
                "q1": q1,
                "q2": q2,
                "h1": h1,
                "pipeline": {
                    "deal_count": len(team_deals),
                    "topline_cr": v2.get("topline_cr", 0) if v2 else round(topline_inr / 1e7, 2),
                    "bottomline_cr": v2.get("bottomline_cr", 0) if v2 else round(bottomline_inr / 1e7, 2),
                    "quota_credit_cr": round(quota_credit_inr / 1e7, 2),
                    "gp_pct": gp_pct,
                },
                "team_members": member_summaries,
                "top_deals": sorted(
                    [
                        {
                            "opportunity_number": d.get("opportunity_number"),
                            "account": d.get("account"),
                            "opportunity_name": d.get("opportunity_name"),
                            "employee": d.get("employee"),
                            "topline_cr": d.get("amount_cr"),
                            "bottomline_cr": d.get("bottomline_cr"),
                            "gp_pct": d.get("gp_pct"),
                            "bu": d.get("bu"),
                            "close_date": d.get("close_date"),
                            "crm": d.get("crm"),
                        }
                        for d in team_deals
                    ],
                    key=lambda x: x.get("topline_cr") or 0,
                    reverse=True,
                )[:8],
            }
        )

    return sorted(results, key=lambda x: x["h1"]["actuals"] or 0, reverse=True)


def status_flag(attainment_pct):
    """≥50% On Track, 30–50% At Risk, 0–30% Critical."""
    if attainment_pct is None:
        return "grey"
    if attainment_pct >= 50:
        return "green"
    if attainment_pct >= 30:
        return "amber"
    return "red"


def main():
    if not EXCEL_PATH.exists():
        print(f"Excel file not found: {EXCEL_PATH}", file=sys.stderr)
        sys.exit(1)

    xl = pd.ExcelFile(EXCEL_PATH)
    employee_mapping = load_employee_mapping()
    target_quota = load_target_quota()
    individuals = parse_individual(xl)
    apply_employee_mapping(individuals, employee_mapping)
    leaders = parse_leaders(xl)
    teams = parse_team_quota(xl)
    bu_level = parse_bu_level(xl)
    division_summary = parse_division_summary(xl)
    bp_quotas = parse_business_plan_quotas()
    rtm_subtotals = parse_rtm_subtotals(xl, bp_quotas)

    rtm_by_bu = {
        "DCG": parse_rtm_bu_sheet(xl, "V5 · DCG", "DCG"),
        "CSN": parse_rtm_bu_sheet(xl, "V6 · CSN", "CSN"),
        "PS": parse_rtm_bu_sheet(xl, "V7 · PS", "PS"),
        "CSG": parse_rtm_bu_sheet(xl, "V8 · CSG", "CSG"),
        "Cloud": parse_rtm_bu_sheet(xl, "V9 · Cloud", "Cloud") if "V9 · Cloud" in xl.sheet_names else [],
    }

    pipeline = parse_pipeline(individuals, teams, employee_mapping)
    attach_pipeline_to_individuals(individuals, pipeline)
    bu_level = enrich_bu_with_pipeline(bu_level, pipeline)

    rtm_individuals = [
        e for e in individuals if e.get("division") in RTM_DIVISIONS and e["name"] not in ("Total", "Total Opportunity")
    ]

    annual_quota = sum(b["annual"]["quota"] or 0 for b in bu_level)
    
    grand_total = parse_grand_total(xl)
    v3_closed_deals = parse_v3_closed_deals(xl)

    ic_h1 = grand_total["h1"] if grand_total else sum_period(rtm_subtotals, "h1")
    ic_q1 = grand_total["q1"] if grand_total else sum_period(rtm_subtotals, "q1")
    
    h1_quota = ic_h1["quota"] or 0
    h1_actuals = ic_h1["actuals"] or 0
    period_metrics = build_period_metrics(bu_level, rtm_subtotals, pipeline, target_quota, grand_total, closed_deals_by_period=v3_closed_deals)

    rtm_order = ["S1", "S2", "CB", "GB", "South"]
    rtm_divisions = []
    for div_name in rtm_order:
        d = next((x for x in rtm_subtotals if x["division"] == div_name), None)
        if not d:
            continue
        emp_count = sum(1 for e in rtm_individuals if e.get("division") == d["division"])
        
        closed_deals = 0
        if pipeline and "by_rtm" in pipeline["summary"]:
            pipe_rtm = next((r for r in pipeline["summary"]["by_rtm"] if r["division"] == div_name), None)
            if pipe_rtm:
                closed_deals = pipe_rtm["deal_count"]
                
        rtm_divisions.append(
            {
                **d,
                "employee_count": emp_count,
                "status": status_flag(d["h1"]["attainment_pct"]),
                "closed_deals": closed_deals,
            }
        )

    leaders_dashboard = build_leaders_dashboard(individuals, pipeline, leaders)

    accounts = []
    brands = []
    if pipeline:
        accounts = build_org_accounts(
            pipeline["all_deals"],
            ic_h1_quota_cr=ic_h1["quota"],
            pipeline_topline_cr=pipeline["summary"]["total_revenue_cr"],
            pipeline_bottomline_cr=pipeline["summary"]["total_bottomline_cr"],
        )
        brands = build_org_brands(
            pipeline["all_deals"],
            ic_h1_quota_cr=ic_h1["quota"],
            pipeline_topline_cr=pipeline["summary"]["total_revenue_cr"],
            pipeline_bottomline_cr=pipeline["summary"]["total_bottomline_cr"],
        )

    output = {
        "meta": {
            "source": EXCEL_PATH.name,
            "generated_at": pd.Timestamp.now().isoformat(),
            "fy": individuals[0]["fy"] if individuals else "FY 25-26",
            "currency": "₹ Cr",
            "pipeline_period": pipeline["summary"]["period"] if pipeline else None,
            "timeline_week": 3,
        },
        "kpis": {
            "h1_quota_cr": round(h1_quota, 2),
            "h1_actuals_cr": round(h1_actuals, 2),
            "h1_attainment_pct": round(h1_actuals / h1_quota * 100, 2) if h1_quota else 0,
            "annual_quota_cr": round(annual_quota, 2),
            "ic_h1_quota_cr": ic_h1["quota"],
            "ic_h1_actuals_cr": ic_h1["actuals"],
            "ic_h1_attainment_pct": ic_h1["attainment_pct"],
            "ic_q1_quota_cr": ic_q1["quota"],
            "ic_q1_actuals_cr": ic_q1["actuals"],
            "ic_q1_attainment_pct": ic_q1["attainment_pct"],
            "total_employees": len(rtm_individuals),
            "total_divisions": len(RTM_DIVISIONS),
            "total_bus": len(bu_level),
            "total_deals_h1": sum(b["h1"]["deals"] or 0 for b in bu_level),
            "header_pipeline_cr": grand_total["header_pipeline_cr"] if grand_total else None,
            "header_closed_opps": grand_total["header_closed_opps"] if grand_total else 0,
            "header_ic_actuals": grand_total["header_ic_actuals"] if grand_total else None,
            **(
                {
                    "pipeline_deals": pipeline["summary"]["total_deals"],
                    "pipeline_revenue_cr": pipeline["summary"]["total_revenue_cr"],
                    "pipeline_accounts": pipeline["summary"]["unique_accounts"],
                }
                if pipeline
                else {}
            ),
        },
        "period_metrics": period_metrics,
        "rtm_divisions": rtm_divisions,
        "at_risk_ics": build_at_risk_ics(rtm_individuals),
        "top_attainers": build_top_attainers(rtm_individuals),
        "leaders_dashboard": leaders_dashboard,
        "individuals": individuals,
        "leaders": leaders,
        "teams": teams,
        "bu_level": bu_level,
        "division_aggregates": aggregate_by_division(rtm_individuals),
        "persona_aggregates": aggregate_by_persona(rtm_individuals),
        "division_summary": division_summary,
        "rtm_by_bu": rtm_by_bu,
        "pipeline": pipeline["summary"] if pipeline else None,
        "accounts": accounts,
        "brands": brands,
        "target_quota": target_quota,
        "employee_mapping_count": len(employee_mapping),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote {OUTPUT_PATH}")
    print(f"  Individuals: {len(individuals)}")
    print(f"  BUs: {len(bu_level)}")
    print(f"  Divisions: {len(output['division_aggregates'])}")
    if pipeline:
        print(f"  Pipeline deals: {pipeline['summary']['total_deals']} (Rs. {pipeline['summary']['total_revenue_cr']} Cr)")
        print(f"  Accounts: {len(accounts)}")
        print(f"  Brands: {len(brands)}")


if __name__ == "__main__":
    main()
