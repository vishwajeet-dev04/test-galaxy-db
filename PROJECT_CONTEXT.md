# Galaxy Performance Tracker — Project Context

**Last updated:** 2026-08-20  
**Branch:** `feature/vtiger`  
**Purpose of this file:** Hand-off document for the next coding session. Read this first. Do not re-derive architecture from scratch.

---

## 1. What this project is

Galaxy Office Automation (client) needs a **role-based sales performance dashboard** for FY 26-27.

Finance used to:

1. Export Closed Won deals from **Vtiger CRM** into Excel.
2. Maintain a **Galaxy Quota Tracker** workbook with quotas, actuals, and formulas.
3. Upload those Excels into this app so `parse_excel.py` could emit `quota_data.json` for the React dashboard.

That manual pipeline is what we are replacing.

**Goal now:** actuals, deals, accounts, brands, employees, and leaders come **directly from Vtiger into SQLite**. Quota *targets* are edited in **Admin → Quota roster** (`config/ic_quotas.json`). No Excel is required at runtime. Leftover files under `files/` are archives only.

The dashboard is **Galaxy Sales Intelligence — Individual Contributor's Performance Tracker FY 26-27**.

---

## 2. Current architecture

```
Vtiger CRM (on-prem / Azure)
        │  REST v1  (Closed Won Potentials)
        ▼
scripts/vtiger_client.py     auth + paginated VQL + ID→name resolution
scripts/vtiger_sync.py       writes SQLite table crm_deals (backend/galaxy.db)
        │
        ▼
scripts/build_quota_data.py  ← source of truth for dashboard JSON
        │  + config/ic_quotas.json     (quota targets — Admin editor)
        │  + config/quota_rules.json   (multipliers, GP, BU annual quotas)
        │  + config/pipeline_aliases.json
        │  + config/leader_roster.json
        ▼
dashboard/public/data/quota_data.json
        │
        ▼
FastAPI backend  (auth, role scoping, Vtiger sync, quota editor)
        │
        ▼
React + Vite dashboard  (localhost:5173 → proxies /api to :8080)
```

### Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite, `dashboard/` |
| Backend | FastAPI + SQLAlchemy, SQLite locally (`backend/galaxy.db`), Postgres on Render |
| ETL | Python (`pandas`, `openpyxl`) in `scripts/` |
| CRM | Vtiger REST v1, VQL, MySQL-style `LIMIT offset, count` pagination (100 rows/page) |

### Roles

| Role | Who | Access |
|---|---|---|
| CEO | `sanjayp` | Everything except Admin |
| Admin | `dilips`, `asifb`, `dharashinib`, `praveens` | Everything + Admin (Vtiger sync, quota editor, IC transfers, T1 import) |
| Leader / TL | Seeded from T3 / roster type (AVP, BU Head, TL, Sanjeev Kohli, …) | Own team / rollup division only |
| Employee (IC) | `{firstname}{last_initial}` e.g. `richat` | Own numbers only — Overview / RTM / BU are scoped, not org-wide |

Default seeded password: `Galaxy@123!` (documented in README; change in production).

---

## 3. What is automated vs still manual

| Data | Source | Manual? |
|---|---|---|
| Closed Won deals | Vtiger API → SQLite `crm_deals` | **No** — Admin → **Sync from Vtiger** |
| IC actuals (Q1/Q2/H1/…) | Computed from deal Amount (DevSpec formula) | **No** |
| RTM / Grand Total actuals | Sum of RTM IC actuals | **No** |
| Accounts, Brands, Employees, Leaders, deal lists | SQLite deals | **No** |
| Multipliers (PS 2X, CSN 1.3X, DCG backup/storage 1.2X) | `config/quota_rules.json` | Edit JSON or leave as-is |
| Attainment % | `actuals ÷ quota × 100` | **No** |
| FY + timeline week | Calculated from today (Indian FY starts 1 Apr) | **No** |
| **IC quota targets** (Q1/Q2/H1/H2/Annual, roster, RTM) | Admin quota roster → `config/ic_quotas.json` | **Yes — edit in Admin twice a year.** Not in CRM. |
| **BU annual quotas** | Admin BU table → `config/quota_rules.json` `bu_annual_quotas` | Edit in Admin |
| Name aliases | `config/pipeline_aliases.json` | Edit JSON when names differ |
| Leader roster | `config/leader_roster.json` | Edit JSON when BU heads change |

Excel uploads (Quota Tracker, Sales Team, Pipeline) are **removed from the product**. `files/*.xlsx` may still exist on disk as leftovers; the live pipeline does not read them except a **one-time migrate** into SQLite if `crm_deals` is empty.

---

## 4. Data flow in detail

### 4.1 Vtiger sync

Triggered from **Admin · Data Management** or CLI:

```
python scripts/vtiger_sync.py --quarter h1
```

Credentials (never commit the real `.env`):

```
backend/.env
  VTIGER_URL=...
  VTIGER_USERNAME=admin
  VTIGER_ACCESS_KEY=<Vtiger My Preferences → Access Key, not web password>
```

API notes (already solved — do not “fix” pagination back to `OFFSET`):

- Auth: challenge token + MD5(token + access key).
- VQL does **not** support `OFFSET`. Use `LIMIT offset, count`.
- Page size 100.
- `Division` does **not** exist in Vtiger. It is derived at build time from `ic_quotas.json` (name → division).

Vtiger field map (confirmed 2026-08-14 via `vtiger_discover.py`):

| Pipeline column | Vtiger field |
|---|---|
| Opportunity Led By | `cf_825` (free text — join key) |
| Category | `cf_715` |
| Sub Category | `cf_765` |
| Brand | `cf_713` |
| Amount / Topline | `amount` |
| Estimated Bottomline | `cf_731` |
| Actual Bottomline - | `cf_781` |
| Deal Status | `cf_805` |
| Deal Category | `cf_902` |
| OPF No. | `cf_707` |
| Organization Name | `related_to` resolved to account name |
| Assigned To | `assigned_user_id` resolved to user name |
| Sales Stage | `sales_stage` (we filter Closed Won) |
| Expected Close Date | `closingdate` (quarter assignment) |

FY 26-27 quarters:

| Key | Dates |
|---|---|
| Q1 | 2026-04-01 → 2026-06-30 |
| Q2 | 2026-07-01 → 2026-09-30 |
| Q3 | 2026-10-01 → 2026-12-31 |
| Q4 | 2027-01-01 → 2027-03-31 |

After storing rows in SQLite `crm_deals` (replacing that quarter), sync calls `build_quota_data.build()`.

### 4.2 Quota editor (manual, twice a year)

Admin → **Quota roster**. Backend:

1. `GET /api/admin/quotas` / `PUT /api/admin/quotas` read/write `config/ic_quotas.json`.
2. Optional BU annual quotas write `config/quota_rules.json` → `bu_annual_quotas`.
3. `build_quota_data.build()` regenerates the dashboard JSON.

**Demo seed (2026-08-18):** IC quotas were preloaded from `files/Galaxy Quota Tracker - 14072026.xlsx` via `scripts/extract_quotas.py` so Admin is not empty. After that, Admin edits are the source of truth. Re-running extract overwrites Admin edits — do not run it during a live demo unless you intend to reset.

`scripts/extract_quotas.py` is the one-time / emergency Tracker import. It is **not** on the live Admin path.

### 4.3 Dashboard JSON

**Do not use `parse_excel.py` as the primary builder anymore.** It is the legacy Excel-tracker parser (kept as fallback if `build_quota_data` import fails).

`scripts/build_quota_data.py` is the current builder. It writes `dashboard/public/data/quota_data.json` atomically (temp file + `os.replace`) so the API never reads a half-written JSON.

Backend `app/scoping.py` reads the top-level `kpis` object from that JSON (do not recompute KPIs from individuals in scoping).

---

## 5. Calculation rules (DevSpec v2) — this is the contract with finance

Units: **₹ Crore** = INR / 10,000,000 (`_cr()`).

### IC actuals (what the Overview / RTM / Employees cards use)

```
IC Q1 Actuals = SUMIF(Pipeline Q1, Led By = name, Amount) / 1e7
IC Q2 Actuals = SUMIF(Pipeline Q2, Led By = name, Amount) / 1e7
H1 Actuals    = Q1 + Q2
```

**GeoX exception:** for **Hrushikesh Bagade** only, use `Actual Bottomline -` (fallback `Estimated Bottomline`), **not** Amount.

Only people in `ic_quotas.json` whose `division` is one of **S1, S2, CB, GB, South, GeoX** roll into RTM / Grand Total IC actuals.

### Division / company totals

```
Division actuals = SUM(IC actuals in that division)
Grand Total      = SUM(RTM divisions)
Attainment %     = actuals / quota × 100
```

Status flags (`config/quota_rules.json`):

- ≥ 50% → On Track
- ≥ 30% → At Risk
- else → Critical

### Deal-level quota credit (Accounts / Brands / deal rows — not IC actuals)

IC actuals stay **raw Amount**. Multipliers apply to **quota_credit** on each deal:

| Rule | Multiplier |
|---|---|
| PS, included sub-categories (managed services, SOC, cloud services, automation, deployment, …) | 2.0× |
| PS excluded (residency, Day-2, T&M, 3rd-party AMC, …) | 1.0× |
| CSN (Cyber Security & Networking) | 1.3× |
| DCG Backup & Recovery / Storage | 1.2× |
| Everything else | 1.0× |

GP % per deal = `bottomline / amount × 100`.  
Hrushikesh GP 5% / 3% exclusion rule is configured but current data has overall GP above the floor, so no deals are excluded.

### Category → BU

```
Data Centre                 → DCG
Cyber Security & Networking → CSN
Professional Services       → PS
CSG (EndPoint)              → CSG
Cloud                       → Cloud
```

### Header KPIs — two different revenue numbers on purpose

| Header label | Meaning |
|---|---|
| **IC Actuals** (`header_ic_actuals`) | Sum of **RTM IC** actuals (DevSpec formula, GeoX = bottomline). |
| **IC Actuals Including Others** (`pipeline_revenue_cr`) | All pipeline Amount **except Hrushikesh** (historical: he is GeoX reference / excluded from pipeline topline). |
| **Closed Opps** | All Closed Won rows from synced pipeline files (Q1+Q2+…). |

Do not “fix” these to be the same number. Finance’s raw Vtiger report is **all staff, all categories, Amount**. Dashboard IC actuals are **RTM ICs only**.

---

## 6. Verified numbers (audit 2026-08-18)

Independent recompute from **SQLite `crm_deals`** (not Excel) + `config/ic_quotas.json` against `quota_data.json`. **0 IC mismatches, 0 RTM mismatches.**

| Check | Independent | Dashboard | Match |
|---|---|---|---|
| Q1 / Q2 / total deals | 377 / 97 / **474** | same | yes |
| Q1 Amount all deals | **₹117.51 Cr** | Vtiger report 117.51 | yes |
| Q2 Amount all deals | ₹61.08 Cr | — | yes |
| Q1 **RTM IC** actuals | 103.7169 Cr | `grand_total.q1` / KPI 103.72 | yes |
| Q2 **RTM IC** actuals | 60.2601 Cr | 60.2601 | yes |
| H1 **RTM IC** actuals | 163.977 Cr | header **163.98** | yes |
| H1 IC quota | 547.5 Cr | 547.5 | yes |
| H1 attainment | 163.977 / 547.5 | **29.95%** | yes |
| Pipeline excl. Hrushikesh | 174.7302 Cr | `header_pipeline_cr` 174.73 | yes |
| Hrushikesh | 56 deals, 3.87 Cr topline, 0.52 Cr bottomline | GeoX IC uses bottomline | yes |
| Per-IC actuals vs JSON | 37 RTM ICs | **0 mismatches** | yes |
| Overview closed deals | Q1 334, Q2 91, H1 425 (RTM) | `period_metrics` after 18 Aug fix | yes |

**Why Q1 is 103.72 on the dashboard but 117.51 in Vtiger:**  
117.51 is every Closed Won deal. 103.72 is RTM ICs only, Amount in Cr, with Hrushikesh on bottomline. That gap is **correct per DevSpec**, not a bug.

**Three revenue numbers on the UI (do not “fix”):**

| UI | Value | Formula |
|---|---|---|
| Header **IC Actuals** | 163.98 Cr | RTM IC actuals (GeoX = bottomline) |
| Header **Including Others** | 174.73 Cr | All Amount except Hrushikesh |
| BU donut / BU card sum | 178.59 Cr | All Amount by category **including** Hrushikesh CSG topline |

Unmapped pipeline name (tiny): `Rima Ingle` — 2 Q2 deals, ₹0.005 Cr. Add an alias + quota row if finance wants her counted.

---

## 7. Config files (`config/`)

Edit these instead of hardcoding Python.

| File | Role |
|---|---|
| `ic_quotas.json` | IC roster + Q1/Q2/H1/H2/Annual quotas. Edited in Admin. Keys are **canonical names**. |
| `pipeline_aliases.json` | Vtiger/Excel “Led By” → canonical Tracker name. |
| `quota_rules.json` | Multipliers, PS include/exclude lists, GP exclusion, status thresholds. |
| `leader_roster.json` | BU heads for Leaders page (`rollup_divisions`, `scope_depts`). |
| `dept_to_rtm.json` | Sales Team Dept → RTM code (legacy mapping; builder uses `ic_quotas` division). |

Important aliases already in place: Tasneem Khatri → Tasneem K, Riya Roshyara → Riya Bhatt, Prashant Dudugu → Prashant Ddugu, Ayushman Singh → Ayushaman, Arpit/Varsha → TBH (…), etc.

---

## 8. Key source files

| Path | What it does |
|---|---|
| `scripts/deal_store.py` | SQLite `crm_deals` — replace quarter, load, one-time Excel migrate |
| `scripts/vtiger_client.py` | REST client, pagination, reference resolve, row mapping |
| `scripts/vtiger_sync.py` | Fetch → SQLite → `build_quota_data.build()` |
| `scripts/vtiger_discover.py` | One-off: list modules/fields (already run) |
| `scripts/build_quota_data.py` | **Current JSON builder** (reads SQLite + config) |
| `scripts/extract_quotas.py` | Emergency Tracker V1 → `ic_quotas.json` (not used by Admin) |
| `scripts/quota_rules.py` | Loads `quota_rules.json`; multiplier helpers |
| `scripts/parse_excel.py` | **Legacy** Tracker-based parser. Do not use for the live dashboard. |
| `backend/app/routers/admin.py` | `POST /api/admin/vtiger-sync`, `GET/PUT /api/admin/quotas`, rebuild |
| `backend/app/scoping.py` | Role visibility; KPIs from JSON `kpis` |
| `backend/app/config.py` | Paths + Vtiger env |
| `dashboard/src/views/AdminUploadsView.tsx` | Sync UI + quota / BU editor |
| `dashboard/src/views/*.tsx` | Overview, RTMs, BU, Accounts, Brands, Leaders, Employees, Leaderboard |
| `dashboard/public/data/quota_data.json` | Generated artifact (large). Rebuild, don’t hand-edit. |

Finance spec (not in repo): `Galaxy_Quota_Tracker_DevSpec_v2` (docx/pdf from finance). Formulas in this file come from that spec.

---

## 9. How to run locally (Windows)

```powershell
# Backend
cd c:\Projects\Galaxy\Temp_Galaxy\galaxy_db
.\.venv\Scripts\Activate.ps1   # or backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
.\scripts\run_backend.ps1
# → http://127.0.0.1:8080/docs

# Frontend (second terminal)
cd dashboard
npm install
npm run dev
# → http://localhost:5173   (proxies /api → :8080)
```

Frontend **requires** backend on port **8080**.

Rebuild JSON without a full CRM sync (uses SQLite `crm_deals` + config):

```powershell
python scripts\build_quota_data.py
```

Sync from CRM then rebuild:

```powershell
python scripts\vtiger_sync.py --quarter h1
```

Emergency import of an old Quota Tracker Excel (not the live path):

```powershell
python scripts\extract_quotas.py
python scripts\build_quota_data.py
```

---

## 10. Dashboard pages and JSON keys they need

`build_quota_data.py` must keep emitting the shapes the React views expect (`dashboard/src/types.ts`):

| Page | JSON | Notes |
|---|---|---|
| Overview | `kpis`, `period_metrics`, `rtm_divisions`, `top_attainers`, `at_risk_ics`, `pipeline.summary` | Period dropdown Q1/Q2/H1/… |
| RTMs | `rtm_divisions` / `division_aggregates` | Order S1 → S2 → CB → GB → South (GeoX extra) |
| Business Units | `bu_level` (`bu`, `service`, **period quota + actuals + attainment**) | H1/H2 toggle. Annual BU quotas from Admin are split using the IC mix. |
| Accounts | `accounts` with `by_bu`, `employees`, `rtm_divisions`, `deals`, `gp_pct` | |
| Brands | `brands` with same nested fields + `top_accounts` | |
| Leaders | `leaders_dashboard` with `pipeline`, `team_members`, `top_deals` (incl. `crm`, `gp_pct`) | Roster-driven |
| Employees | `individuals` with nested `pipeline.closed_deals` | Grouped by division |
| Leaderboard | `individuals` period attainment | Q3/Q4 estimated until H2 data exists |
| Admin | live API, not JSON | Sync + quota editor |

If a page goes blank, the usual cause is a **missing nested field**, not empty CRM data.

---

## 11. Known caveats / remaining gaps

1. **Cloud annual quotas identical to CSG** in Admin (`bu_annual_quotas`). Likely a DevSpec copy-paste. Confirm with finance before the client treats them as independent targets.
2. **BU H1/Q1 quotas are derived, not in the Tracker.** Tracker V5–V9 only fill **annual**. Builder splits annual using IC H1/Annual and Q1/H1 shares so BU cards can show quota and %. If finance later supplies true H1 BU quotas, store them and stop deriving.
3. **Tracker H1 ≠ Q1+Q2 for several ICs** (Riya Bhatt 59 vs 58, Prashant Ddugu 60.5 vs 60.75, …). Seeded from Tracker as-is. **Admin Save and the builder now keep H1/H2/Annual independent** — editing Q1–Q4 does not rewrite them.
4. **Blank Tracker annual (0)** for TBH rows, Hrushikesh, Sanjeev Kohli, etc. Builder now treats `0` as a real value (not missing). Header annual quota follows the uploaded Annual column, not H1+H2. Spec Grand Total was 1250. Constant `COMPANY_ANNUAL_QUOTA_CR = 1250` is unused for the header.
5. **Division is derived from `ic_quotas`**, not from CRM. Unmapped names (Rima Ingle) drop out of RTM.
6. **`grand_total.header_closed_opps` = 425** (RTM IC deals) vs **`kpis.header_closed_opps` = 474** (all Closed Won). Header uses KPIs. Overview period cards use RTM counts (Q1 334 / Q2 91 / H1 425).
7. **Hrushikesh** is in GeoX IC actuals (bottomline) but **excluded** from header pipeline topline. BU actuals **include** his CSG Amount. Three numbers by design.
8. **Q3/Q4** have no deals yet. Period objects flagged `"estimated": true`.
9. **Leaders page** title is Bottomline, but the hero **H1 Actuals** tile uses `kpis.header_pipeline_cr` (174.73 topline excl. Hrushikesh), not team bottomline.
10. **STLY / SAM / TAM** still blocked — no source data.
11. **Do not commit** `backend/.env`, `backend/galaxy.db`, or `users_export.json` if it contains secrets. Default JWT `secret_key` is a dev placeholder.
12. `parse_excel.py` and `files/*.xlsx` are leftover. Live path: `deal_store` + `build_quota_data.py`.
13. Status thresholds 50/30 are in `quota_rules.json` **and** hardcoded in `build_quota_data._status_flag` — keep them in sync.

---

## 12. Decisions already made — do not undo without asking

- Pipeline data is **Vtiger → SQLite**. No Excel for actuals.
- Quota targets are edited in **Admin** (or imported from Finance T1 Excel), stored in `ic_quotas.json`. H1/H2/Annual are independent of Q1–Q4.
- IC transfers between RTMs are **Admin-only** (change the RTM dropdown and Save).
- IC actuals = **Topline Amount**, not bottomline, except GeoX/Hrushikesh.
- IC actuals **do not** include multipliers; multipliers are deal quota-credit only.
- Names join on **canonical alias**, not raw Vtiger string.
- Atomic write for `quota_data.json`.
- Admin sync is a FastAPI `BackgroundTasks` job; UI polls `/api/admin/vtiger-sync/status`.

---

## 13. How to continue in the next session

Typical next work, in likely order:

1. Confirm **Cloud vs CSG annual quotas** with finance.
2. Confirm whether finance wants **true H1 BU quotas** or is OK with the derived split.
3. Alias / roster entry for **Rima Ingle** if she should count.
4. Leaders hero **H1 Actuals** tile: switch to bottomline if product wants that page to stay bottomline-only.
5. Expand role hierarchy so Leaders/TLs can transfer ICs later (currently Admin only).
6. Keep `PROJECT_CONTEXT.md` updated when architecture or numbers change.

When debugging “dashboard ≠ Vtiger report”, recompute from SQLite with the DevSpec formulas in §5 before changing code. Raw Vtiger Amount ≠ IC Actuals by design.

---

## 14. Session log — 2026-08-18 (demo prep + full audit)

### What shipped

- **Port 8080:** Vite proxy, README, `scripts/run_api.sh`, `scripts/run_backend.ps1`, this file. Frontend **requires** backend on 8080.
- **Quota roster seeded** from `files/Galaxy Quota Tracker - 14072026.xlsx` via `extract_quotas.py` (40 people, 37 RTM ICs). Admin can edit after that. Do **not** re-run extract during a live demo (overwrites edits).
- **Excel uploads removed** from Admin. Live actuals = Vtiger → SQLite. Live quotas = Admin → `ic_quotas.json`.
- **BU quotas on cards:** previously `bu_level.h1.quota` was always `null` (only `annual` filled) so Business Units showed `—` and 0%. Builder now splits Admin annual quotas using the IC mix. Example H1: DCG 369.11 Cr / 28%, PS 12.71 Cr / 84%, CSN 90.44 Cr / 37%.
- **Overview Q1/Q2 closed deals** were 0 (bug in `_snap`). Now Q1 334, Q2 91, H1 425, Annual 425 (RTM IC deals only).
- **Closed Opps tooltip** no longer labels 474 as “IC Total”.
- CORS: added `http://127.0.0.1:4173`.

### How to edit / add quotas (demo)

1. Login Admin (`asifb` / `Galaxy@123!`) → sidebar **Admin**.
2. Edit IC rows. **H1, H2 and Annual are independent** (amber cells) — Q1–Q4 do not rewrite them. Change **RTM** to transfer an IC, then Save.
3. **Add person** / trash to remove.
4. BU annual grid is saved with the same **Save quotas & refresh**.
5. That PUT writes config JSON and runs `build_quota_data.build()`.

### Audit result

Core IC/RTM math is **accurate**. Backend `/api/health` returns ok. Remaining gaps are listed in §11 (Cloud=CSG, derived BU H1, Tracker H1 quirks, three revenue bases).

Do **not** flatten header IC actuals, “Including Others”, and BU donut into one number.

---

## 15. Session log — 2026-08-20 (Finance review)

Finance items implemented:

1. **H1/H2/Annual stay as uploaded.** Admin UI, Save API, and `build_quota_data.py` no longer auto-sum from Q1–Q4. Amber cells in Admin mark the Finance-fixed columns. Q3/Q4 quota columns added.
2. **Persona login scoping.** ICs see only themselves; Overview / RTM / BU / header KPIs recompute from their deals. Name matching is exact (no first-name leak). Leaders/TLs see their rollup division. Banner: “Showing your login data only”.
3. **Admin RTM dropdown** is only S1, S2, CB, GB, South, GeoX.
4. **IC transfer** is Admin-only: change RTM on the roster and Save.
5. **Date range filter** in the header (dual calendar + presets, IST). `/api/quota?from=&to=` recomputes actuals from Closed Won close dates; quotas stay put. Default = This Year (FY).
6. **BU card order:** DCG, CSN, PS, CSG, Cloud.
7. **Sanjeev Kohli** (and other TL/AVP/BU Head/Topline personas) hidden from Employees. Seeded as `leader`.
8. **T1 Excel import** — Admin can download `files/Galaxy_Data_Templates.xlsx` and import the T1 roster sheet. Does not auto-apply the sample numbers.

Key files: `backend/app/scoping.py`, `backend/app/quota_template.py`, `backend/app/routers/admin.py`, `backend/app/routers/data.py`, `backend/app/seed.py`, `scripts/build_quota_data.py`, `dashboard/src/components/DateRangeFilter.tsx`, `dashboard/src/views/AdminUploadsView.tsx`.

