# Galaxy Performance Tracker — Implementation Checklist

Last updated: 2026-06-29

## Data mapping

| Item | Status | Notes |
|------|--------|-------|
| Tab 1 — Target Quota file | ✅ Done | `data/Target_Quota.csv` template created |
| Tab 2 — Employee Mapping file | ✅ Done | `data/Employee_Mapping.csv` template created |
| Pipeline workbook — Actuals | ✅ Done | `Opportunity Pipeline 1Apr to 21Jun.csv` |
| Galaxy Quota Tracker — quota/actuals | ✅ Done | `Galaxy_Quota_Tracker v4 - Review document.xlsx` |
| Parser reads all 3 sources | ✅ Done | `scripts/parse_excel.py` |
| Division quota from IC Subtotals | ✅ Done | S1, S2, CB, GB, South from V1 subtotal rows |
| Remove "Unknown" division | ✅ Done | Filtered in parser + UI |
| IC actuals from RTM subtotals | ✅ Done | Sum of IC Subtotal rows only |
| H1 actuals from tracker column | ✅ Done | Uses H1 Actuals from subtotals |
| Pipeline mapped to RTM via employee file | ✅ Done | Division from Employee_Mapping.csv |
| STLY comparison data | ⏳ Blocked | No STLY source file — UI shows placeholder |
| SAM/TAM by BU / rep / overall | ⏳ Blocked | No SAM/TAM data provided yet |
| Weekly timeline data | ⏳ Partial | UI dropdown; granular weekly data not in source |

## Page 1 — Overview

| Item | Status | Notes |
|------|--------|-------|
| BU / IC / Pipeline values aligned (Q1, H1) | ✅ Done | Single period selector drives all cards |
| Q1 separate performance card | ✅ Done | Actual / Quota / % / deals |
| H1 separate performance card | ✅ Done | Actual / Quota / % / deals |
| Timeline dropdown (weekly/monthly/qtrly/annual) | ✅ Done | Header control (label context) |
| Needs attention — IC at risk | ✅ Done | ICs below 25% attainment |
| Pipeline by RTM chart | ✅ Done | Replaces Division Mix |
| Pipeline by BU chart | ✅ Done | |
| Top 5 attainers by % | ✅ Done | |
| Top 5 by value closed | ✅ Done | |
| Tooltips on charts | ✅ Done | Enhanced Recharts tooltips |
| Mobile responsive layout | ✅ Done | Collapsible sidebar, responsive grids |

## Page 2 — Divisions

| Item | Status | Notes |
|------|--------|-------|
| RTM division data only | ✅ Done | S1, S2, CB, GB, South |
| Division table | ✅ Done | |
| Status flag column (green/amber/red) | ✅ Done | ≥50% / ≥25% / <25% |
| H1 attainment ranked chart | ✅ Done | Horizontal bars |
| RTM level cards (like BU cards) | ✅ Done | |
| Personas column cleaned | ✅ Done | Removed from division table |

## Page 3 — Business Units

| Item | Status | Notes |
|------|--------|-------|
| No changes requested | ✅ Done | Existing BU view retained |

## Page 4 — Personas

| Item | Status | Notes |
|------|--------|-------|
| Page removed from navigation | ✅ Done | |

## Page 5 — Employees

| Item | Status | Notes |
|------|--------|-------|
| Pipeline Rev → H1 Actuals label | ✅ Done | Period selector switches column |
| Q1, Q2, H1 Quota columns | ✅ Done | Based on period radio |
| Period radio (Q1/Q2/H1/H2/Annual) | ✅ Done | |
| Grouped by division | ✅ Done | Existing |
| Closed accounts | ✅ Done | Existing |

## Page 6 — Teams

| Item | Status | Notes |
|------|--------|-------|
| Page removed from navigation | ✅ Done | |

## Page 7 — Leaderboard

| Item | Status | Notes |
|------|--------|-------|
| Q1 Attainment % | ✅ Done | |
| Q2 Attainment % | ✅ Done | |
| H1 Attainment % | ✅ Done | |
| Q3 Attainment % | ⏳ Partial | Uses Q2 proxy until Q3 columns in tracker |
| Q4 Attainment % | ⏳ Partial | Uses H2 proxy until Q4 columns in tracker |
| H2 Attainment % | ✅ Done | |
| Annual Attainment % | ✅ Done | |
| H1 Actuals sort | ✅ Done | |
| Q1 Actuals sort | ✅ Done | |

## Praveen's feedback

| Item | Status | Notes |
|------|--------|-------|
| Mobile phone alignment | ✅ Done | Responsive sidebar + grids |
| Timeline dropdown | ✅ Done | Weekly / Monthly / Quarterly / Annual |
| STLY comparison | ⏳ Blocked | Awaiting prior-year data file |
| Role-based access (CEO, TL, IC, BU) | ⏳ Partial | Demo role dropdown in header; no auth backend |
| On-prem hosting + 2FA | ⏳ Blocked | Requires customer infra (AD/LDAP/OAuth) |
| SAM/TAM data | ⏳ Blocked | Awaiting data from customer |

## Dashboard change requests (Jul 2026)

| Item | Status | Notes |
|------|--------|-------|
| Overview period filters Q1–Annual | ✅ Done | Dropdown includes Q3, Q4, H2, Annual |
| Total Employees KPI on Overview | ✅ Done | Top summary section |
| Remove Aligned Metrics | ✅ Done | |
| Rename Pipeline Analysis → Closed Opportunity Analysis | ✅ Done | |
| Divisions → RTM rename | ✅ Done | Nav, title, table, filters |
| RTM card order S1→S2→CB→GB→South | ✅ Done | |
| RTM cards match Q1 performance card | ✅ Done | Actual/Quota, %, trend |
| Remove H1 Attainment by Division chart | ✅ Done | |
| Status ≥50 / 30–50 / 0–30 | ✅ Done | On Track / At Risk / Critical |
| Leaders bottomline-only | ✅ Done | Topline removed from UI |
| Leaders header – Bottomline | ✅ Done | Team ICs removed |
| Remove Leaders team chart | ✅ Done | |
| Hrushikesh on Employees (reference only) | ✅ Done | Excluded from pipeline totals (379→326 deals) |


| Item | Status | Notes |
|------|--------|-------|
| Bottomline on each deal | ✅ Done | Topline (navy) + Bottomline (green) color scheme |
| CRM status indicators (Booked/Billed/Received) | ✅ Done | Color balls A/B/C per deal; grey when pending |
| PS revenue 2X multiplier | ✅ Done | Primary focus sub-categories |
| CSN revenue 1.3X multiplier | ✅ Done | |
| DCG Backup/Storage 1.2X multiplier | ✅ Done | |
| PS secondary focus excluded | ✅ Done | Residency, Day-2, T&M etc. at 1X |
| Hrushikesh GP 5% / 3% exclusion rule | ✅ Done | Overall GP 7.6% — all deals count |
| Data refresh — Quota Tracker 08072026 | ✅ Done | IC H1 actuals now ₹105.39 Cr |
| Data refresh — Pipeline Q1 xlsx | ✅ Done | 379 deals, ₹122.55 Cr topline |
| Data refresh — Sales Team mapping | ✅ Done | From Sales Team Excel |


| Item | Status | Notes |
|------|--------|-------|
| Netlify config | ✅ Done | `netlify.toml` |
| SPA redirects | ✅ Done | `_redirects` |
