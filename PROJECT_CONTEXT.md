# Galaxy Performance Tracker — Project Context

**Last updated:** 2026-09-25  
**Branch:** `feature/vtiger`  
**Purpose:** Hand-off document. Read this first. Do not re-derive architecture from scratch.

**Keep this file updated after every major change** (schema, routes, roster rules, calculation contract, ports, known issues). If you change behavior, update the matching section in the same PR/session.

---

## 1. What this project is

Galaxy Office Automation needs a **role-based sales performance dashboard** for FY 26-27.

**Live path:** Closed Won deals come from **Vtiger → SQLite**. Quota *targets* are edited in **Admin → Quota roster** (`config/ic_quotas.json`). No Excel is required at runtime. Leftover files under `files/` are archives only.

The dashboard is **Galaxy Sales Intelligence — Individual Contributor's Performance Tracker FY 26-27**.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 6, TypeScript, Tailwind 4, Recharts, lucide-react. **No React Router** — views switch on `drill.view` in `App.tsx`. |
| Backend | FastAPI, Pydantic Settings, SQLAlchemy 2, python-jose (JWT HS256, **30 min** access), bcrypt |
| Users DB | SQLAlchemy. SQLite locally (`backend/galaxy.db`). Postgres on the Azure VM when `DATABASE_URL` is set. |
| Deals DB | **Always** stdlib sqlite3 via `scripts/deal_store.py` (`backend/galaxy.db` table `crm_deals`). Not Postgres. |
| ETL | Python (`pandas`, `openpyxl`) in `scripts/` |
| CRM | Vtiger REST v1, VQL, MySQL-style `LIMIT offset, count` (100 rows/page). Do **not** switch pagination back to `OFFSET`. |
| Auth | JWT Bearer. Default demo password `Galaxy@123!` (change in production). |
| Local ports | Backend **8080**, frontend **5173** (Vite proxies `/api` → `127.0.0.1:8080`). If 5173 is busy, Vite may use 5174. |
| Production | Nginx port **8081** → static `dashboard/dist`; `location ^~ /api/` → Gunicorn **8000** on localhost. Apache on **80** is Vtiger CRM — do not stop it or put Galaxy there. HTTP only today. |

---

## 3. Folder structure

App root is `galaxy_db/` (workspace wrapper is `Temp_Galaxy/`).

```
galaxy_db/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, startup seed
│   │   ├── config.py            # Paths + env (JWT, Vtiger, DATABASE_URL)
│   │   ├── models.py            # SQLAlchemy User + SeedExclusion
│   │   ├── database.py          # Engine / session
│   │   ├── security.py         # JWT, bcrypt, require_admin, can_see_all
│   │   ├── schemas.py
│   │   ├── seed.py              # Privileged + roster users (insert-only; never resets hashes)
│   │   ├── rate_limit.py        # In-process limiter for login/token/health
│   │   ├── scoping.py          # Role scope + date-range actuals rebuild
│   │   ├── quota_template.py     # T1 Excel parse
│   │   ├── services/           # Business logic (user_service, docs_service, …)
│   │   ├── repositories/        # DB access (user_repo)
│   │   └── routers/
│   │       ├── admin.py         # Sync, quotas, T1 import, users
│   │       ├── auth.py          # Login
│   │       └── data.py          # GET /api/quota
│   ├── add_user.py              # CLI fallback; Admin → Users is the live path
│   ├── requirements.txt
│   ├── galaxy.db               # SQLite: users (local) + crm_deals + crm_sync_jobs (always)
│   ├── data/quota_data.json    # Generated artifact — not served by Nginx
│   └── .env                    # Never commit
├── dashboard/
│   ├── src/
│   │   ├── App.tsx              # View switcher (no router)
│   │   ├── views/              # Overview, RTMs, BU, Accounts, Brands,
│   │   │                      # Leaders, Employees, Leaderboard, Help, Admin, Login
│   │   ├── content/           # Static Help FAQ copy
│   │   ├── components/        # Sidebar, DateRangeFilter, charts, …
│   │   ├── context/            # AuthContext, DashboardContext
│   │   ├── hooks/useQuotaData.ts
│   │   ├── utils/fiscal.ts    # FY calendar (IST, 1 Apr)
│   │   └── types.ts
│   └── vite.config.ts          # Proxy /api → :8080
├── scripts/
│   ├── assignment_history.py  # RTM history: as-of-today, division_on, apply_transfer
│   ├── build_quota_data.py     # Current JSON builder
│   ├── deal_store.py           # crm_deals + crm_sync_jobs SQLite
│   ├── vtiger_client.py
│   ├── vtiger_sync.py
│   ├── vtiger_discover.py     # One-off field discovery (already run)
│   ├── quota_rules.py
│   ├── extract_quotas.py      # Emergency Tracker → ic_quotas (not live Admin)
│   ├── parse_excel.py         # Legacy — do not use for live dashboard
│   └── run_backend.ps1        # uvicorn --port 8080 --app-dir backend
├── config/
│   ├── ic_quotas.json          # Roster + quotas + assignments[] (Admin)
│   ├── quota_rules.json        # Multipliers, GP, status thresholds, bu_annual_quotas
│   ├── pipeline_aliases.json
│   ├── leader_roster.json
│   └── dept_to_rtm.json        # Legacy; builder uses ic_quotas division
├── files/                      # Excel archives + docs/ user manual PDF
└── PROJECT_CONTEXT.md         # ← You are here
```

Unused UI leftovers (not wired in `App.tsx`): `TeamsView.tsx`, `PersonasView.tsx`.  
`IMPLEMENTATION_CHECKLIST.md` is stale (29 Jun) — trust this file instead.

---

## 4. Current architecture

```
Vtiger CRM (Closed Won Potentials)
        │  REST v1
        ▼
scripts/vtiger_client.py     auth + paginated VQL + account-name resolve
scripts/vtiger_sync.py       writes SQLite crm_deals (backend/galaxy.db)
        │
        ▼
scripts/build_quota_data.py  ← source of truth for dashboard JSON
        │  + config/ic_quotas.json     (quotas + RTM assignment history)
        │  + config/quota_rules.json
        │  + config/pipeline_aliases.json
        │  + config/leader_roster.json
        │  + scripts/assignment_history.py
        ▼
backend/data/quota_data.json   # not in Vite public/; JWT-only via API
        │
        ▼
FastAPI  GET /api/quota
        │  scoping.py: role filter + as-of-today RTM stamp
        │  + date filter reapplies actuals (quotas unchanged)
        ▼
React + Vite  (localhost:5173 → /api → :8080)
```

### What is automated vs still manual

| Data | Source | Manual? |
|---|---|---|
| Closed Won deals | Vtiger API → SQLite `crm_deals` | **No** — Admin → Sync from Vtiger |
| IC actuals | Deal Amount (DevSpec); GeoX/Hrushikesh = bottomline | **No** |
| RTM actuals | Deals tagged `rtm_division` from assignment-on-close-date | **No** |
| RTM quotas | Sum of as-of-today members' quotas | **No** |
| Accounts, Brands, Employees, deal lists | SQLite deals | **No** |
| Multipliers | `config/quota_rules.json` | Edit JSON |
| **IC quota targets** | Admin roster → `ic_quotas.json` | **Yes** (twice a year + transfers) |
| **RTM assignment history** | Same JSON `assignments[]` | Admin transfer or T1 import |
| **BU annual quotas** | Admin → `quota_rules.json` `bu_annual_quotas` | Edit in Admin |
| Name aliases | `pipeline_aliases.json` | Edit JSON |
| Leader roster | `leader_roster.json` | Edit JSON when BU heads change |

---

## 5. DB schema

Two stores share the **same file** locally (`backend/galaxy.db`) but **different APIs**. Production: users may be Postgres; **deals stay SQLite**.

### 5.1 Users — SQLAlchemy `users`

Created on startup (`Base.metadata.create_all`). Local SQLite or Postgres via `DATABASE_URL`.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `username` | VARCHAR(64) unique | IC pattern `{firstname}{last_initial}` e.g. `richat` |
| `email` | VARCHAR(255) unique | |
| `full_name` | VARCHAR(255) | |
| `hashed_password` | VARCHAR(255) | bcrypt |
| `role` | VARCHAR(32) | `ceo` / `admin` / `leader` / `tl` / `user` |
| `employee_name` | VARCHAR(255) nullable | Join key to IC / leader display name |
| `is_active` | BOOLEAN | |
| `created_at` | DATETIME | UTC |

`seed_exclusions` (same users DB): `username` PK. Written on Admin delete; cleared on Admin create.

Privileged seed (`backend/app/seed.py` `PRIVILEGED`): CEO `sanjayp`; admins `dilips`, `asifb`, `dharashinib`, `praveens`, `anoopp`. New roster ICs/leaders are **inserted** if missing (default password). Existing logins keep their password, role, and profile (Admin Users is source of truth). Privileged rows still sync role/email but **never** reset the password hash or force `is_active` (Admin deactivate survives rebuild). Admin **cannot delete** privileged usernames (deactivate instead). Deleted roster logins are stored in `seed_exclusions`; seed skips those usernames until Admin **create** removes the exclusion.

### 5.2 Deals — sqlite3 `crm_deals`

Always this table, even when users are in Postgres. Payload is a JSON blob of pipeline columns (not normalized fields).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `quarter` | TEXT NOT NULL | `q1` / `q2` / `q3` / `q4` |
| `opportunity_number` | TEXT NOT NULL | Unique with quarter; synthetic `anon-…` if missing |
| `payload` | TEXT NOT NULL | JSON: Led By, Amount, Category, Brand, close date, … |
| `synced_at` | TEXT NOT NULL | ISO UTC |

Index: `idx_crm_deals_quarter`. Sync **replaces** all rows for that quarter. WAL + 30s busy timeout.

### 5.2b Sync jobs — sqlite3 `crm_sync_jobs`

Shared by all Gunicorn workers (not process memory).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID `job_id` |
| `status` | TEXT | `running` / `done` / `error` |
| `quarters` | TEXT | JSON list e.g. `["q1","q2"]` |
| `started_at` | TEXT | ISO UTC |
| `finished_at` | TEXT | ISO UTC when done/error |
| `last_error` | TEXT | Safe UI message only (no stack / CRM internals) |
| `result` | TEXT | JSON `{ quarters, deal_counts, total_deals }` |

`try_start_job` uses `BEGIN IMMEDIATE`. GET status also calls `reclaim_stale_jobs()` (same 45-minute rule). `finish_job` only updates a row that is still `running`. `replace_quarter` refuses to DELETE if existing count > 0 and incoming rows == 0. CLI `vtiger_sync.py` uses the same job lock. FY windows are derived from 1 Apr of the current Indian FY (not hardcoded 2026–2027).

Payload keys (pipeline shape): Opportunity Number, Organization Name, Opportunity Led By, Category, Sub Category, Brand, Amount, Estimated Bottomline, Actual Bottomline -, Expected Close Date, Deal Status, OPF No., Division (usually empty in CRM — derived at build), plus `_quarter` on load.

### 5.3 Quota roster — `config/ic_quotas.json` (not SQL)

Same person / same login. `division` is **as-of-today IST** RTM.

```json
"Jimesh": {
  "division": "GB",
  "type": "IC",
  "reporting_manager": null,
  "q1_quota": 0, "q2_quota": 0, "q3_quota": 0, "q4_quota": 0,
  "h1_quota": 0, "h2_quota": 0, "annual_quota": 0,
  "assignments": [
    { "division": "S1", "start_date": null, "end_date": "2026-09-08" },
    { "division": "GB", "start_date": "2026-09-09", "end_date": null }
  ]
}
```

- Null `start_date` = unknown (do not invent join dates).
- Null `end_date` = Ongoing.
- GET synthesizes `{division, start: null, end: null}` if history is missing; first Save writes it.
- Transfer closes the previous row at `start_date - 1 day`. Same-day start replaces that day's division. Overlap → `AssignmentError` (HTTP 400).

---

## 6. API routes

All JSON. JWT: `Authorization: Bearer <token>` except login and health.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | `{ status, app }` |
| POST | `/api/auth/login` | none | JSON `{ username, password }` → `{ access_token, user }` |
| POST | `/api/auth/token` | none | OAuth2 form (Swagger) |
| GET | `/api/auth/me` | user | Current user |
| GET | `/api/quota?from=&to=` | user | Scoped dashboard JSON. Dates recompute **actuals** only. Default UI = This Year (FY). |
| GET | `/api/users/me/scope` | user | `{ username, role, employee_name, can_upload, sees_all }` |
| GET | `/api/help/manual` | user | Download `files/docs/Galaxy_Sales_Performance_User_Manual_v5.pdf` (any logged-in role) |
| GET | `/api/admin/status` | admin | Deal counts + quota file exists + latest sync job. Alias kept; Chrome can 403 paths containing `status`. UI uses `GET /quotas` instead. |
| GET | `/api/admin/uploads/status` | admin | Alias of `/status` |
| GET | `/api/admin/quotas` | admin | Roster + `bu_annual_quotas` + `accounts` (login list, up to 100) + `crm` (deal counts + latest sync job). Chrome is not asked for `/users`/`/logins`/`/directory`/`status`. |
| PUT | `/api/admin/quotas` | admin | Full-replace `ic_quotas.json` when `people` is sent. `{ account: { op: create\|update\|delete } }` does login CRUD. `{ sync: true }` starts a full-FY Vtiger job (same as POST `/vtiger-sync`). RTM change requires `transfer_start`. Then rebuild + `seed_users`. **409** if a sync job is running (roster save only). |
| GET | `/api/admin/templates/data` | admin | Download `files/Galaxy_Data_Templates.xlsx` |
| POST | `/api/admin/quotas/import` | admin | T1 sheet → roster. Missing names are **dropped**. RTM diff → transfer dated today. |
| POST | `/api/admin/reparse` | admin | Rebuild JSON from SQLite + config. **409** if a sync job is running. |
| POST | `/api/admin/vtiger-sync?quarter=all` | admin | Starts a SQLite-backed job (daemon thread) then rebuild. Default `all` = Q1–Q4. Scripts may pass `q1`/`q2`/`q3`/`q4`/`h1`/`h2`. Returns `{ ok, job_id, quarters }`. 409 if already running. |
| GET | `/api/admin/vtiger-sync/status?job_id=` | admin | `{ job_id, status, running, last_run, last_result, last_error, deals, configured }`. Omit `job_id` for latest. |
| GET | `/api/admin/directory?page=&page_size=&q=` | admin | Paginated logins `{ items, total, page, page_size }` (aliases `/logins` and `/users`) |
| POST | `/api/admin/directory` | admin | Create login (password required, bcrypt cost 12) |
| PATCH | `/api/admin/directory/{id}` | admin | Update name/email/role/`employee_name`/`is_active`; optional password |
| DELETE | `/api/admin/directory/{id}` | admin | Hard-delete login. Cannot delete self, last active admin, or privileged seed usernames. |

Login, token, and health are rate-limited in-process (per worker). OpenAPI `/docs` is off unless `GALAXY_DOCS=1`.

CEO (`sanjayp`) sees all quota data but **not** Admin APIs (`require_admin` is role `admin` only).

---

## 7. Conventions

- **Units:** ₹ Crore = INR / 10,000,000. Never mix Cr and INR in the same field without both keys (`*_cr` / `*_inr`).
- **Cr display:** `formatCr` / `formatCrDisplay` (`dashboard/src/utils/format.ts`) show 2 decimals. A non-zero amount that would round to `0.00` widens to up to 4 decimals (e.g. ₹15,000 → ₹0.0015 Cr) to match the API's 4-dp precision. Real zeros stay ₹0.00 Cr. Always use these helpers, never `toFixed(2) + " Cr"`.
- **Fiscal year:** Indian FY, 1 Apr → 31 Mar. Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. Header date filter default = This Year. Dates in **IST**.
- **Canonical names:** Vtiger “Opportunity Led By” → `pipeline_aliases.json` → key in `ic_quotas.json`. Join on alias, not raw CRM string.
- **H1 / H2 / Annual are independent of Q1–Q4.** Finance-owned. Save and builder must not auto-sum them.
- **Three header revenue numbers on purpose** — do not flatten:
  1. **IC Actuals** — RTM ICs, topline for everyone (Hrushikesh on topline since 2026-09-25).
  2. **Including Others** — all Amount except Hrushikesh.
  3. **BU donut** — Amount by category from **RTM-team deals only** (including Hrushikesh/GeoX). Since 2026-09-25 it equals IC Actuals in total.
- **Multipliers** apply to deal `quota_credit` only, never IC actuals.
- **RTM codes:** only `S1`, `S2`, `CB`, `GB`, `South`, `GeoX`. `Geo X` normalizes to `GeoX`.
- **BU order:** DCG, CSN, PS, CSG, Cloud.
- **Membership vs deals:** team/leader **lists** = as-of-**today IST** (not date-range `to` — FY end is 31 Mar). Deal `rtm_division` = assignment covering **close_date**; missing close date → as-of-today.
- **Atomic JSON writes:** temp file + `os.replace` for `quota_data.json` and Admin config.
- **Build once, scope at read:** `build_quota_data.py` emits full org JSON; `scoping.py` deep-copies, stamps today, filters names, rebuilds actuals for `from`/`to`.
- **IC usernames:** `make_username` = first name + last initial, letters only.
- **Do not invent join dates.** Existing people get null start until a real transfer.
- **VQL pagination:** `LIMIT offset, count` only.
- **No tests yet** (no pytest / Vitest). New roster/history logic is unguarded.
- **Secrets:** never commit `backend/.env`, `galaxy.db`, or live keys. Put them only in server `.env`.

---

## 8. Roles

| Role | Who | Access |
|---|---|---|
| CEO | `sanjayp` | Everything except Admin APIs |
| Admin | `dilips`, `asifb`, `dharashinib`, `praveens`, `anoopp` | Everything + Admin |
| Leader / TL | Seeded from roster type (AVP, BU Head, TL, …) | Own team / `rollup_divisions` |
| Employee (IC) | `{firstname}{last_initial}` | Own numbers only |

Default seeded password: `Galaxy@123!`.

---

## 9. Calculation rules (DevSpec v2) — contract with finance

### IC actuals (Overview / RTM / Employees)

```
IC Q1 Actuals = SUMIF(Pipeline Q1, Led By = name, Amount) / 1e7
IC Q2 Actuals = SUMIF(Pipeline Q2, Led By = name, Amount) / 1e7
H1 Actuals    = Q1 + Q2
```

**No GeoX exception (removed 2026-09-25, client decision):** Hrushikesh Bagade is measured on **Amount (topline)** like every other IC, in both `build_quota_data._deal_ic_cr` / `compute_actuals_by_name` and `scoping._deal_ic_cr`. His deals are still left out of the pipeline header totals (`build_pipeline_summary`, reference-only). That is a separate rule and was not changed.

**Bottomline (all screens):** bottomline = SUM(`Actual Bottomline -`, Vtiger `cf_781`) only. `Estimated Bottomline` (`cf_731`) is **never** used, not even as a fallback; a deal with no Actual Bottomline counts as 0 (GP 0%). Single source: `build_quota_data._actual_bottomline`, which feeds deal `bottomline_inr`/`bottomline_cr`, Leaders Bottomline, Accounts/Brands BL, pipeline BL and GP%. Client decision 2026-09-25.

Only people in `ic_quotas.json` whose **as-of-today** `division` is S1/S2/CB/GB/South/GeoX roll into RTM **quota** totals.

RTM **actuals** sum deals whose `rtm_division` matches (assignment on close date). After a mid-year transfer those two bases diverge — see Known issues.

### Status flags (`quota_rules.json` `status_thresholds`)

- ≥ 50% → On Track
- ≥ 30% → At Risk
- else → Critical

Overview **Needs Attention** list currently uses **< 25%** H1 attainment (`scoping._rebuild_top_and_risk`) — **out of sync** with 30%.

### Deal-level quota credit (Accounts / Brands / deal rows — not IC actuals)

| Rule | Multiplier |
|---|---|
| PS, included sub-categories | 2.0× |
| PS excluded (residency, Day-2, T&M, 3rd-party AMC, …) | 1.0× |
| CSN | 1.3× |
| DCG Backup & Recovery / Storage | 1.2× |
| Everything else | 1.0× |

GP % = `bottomline / amount × 100`. Hrushikesh GP 5%/3% exclusion is configured; current data is above the floor.

### Category → BU

```
Data Centre                 → DCG
Cyber Security & Networking → CSN
Professional Services       → PS
CSG (EndPoint)              → CSG
Cloud                       → Cloud
```

---

## 10. Data flow details

### 10.1 Vtiger sync

```
python scripts/vtiger_sync.py
python scripts/vtiger_sync.py --quarter q1   # scripts only; Admin always uses all
```

Admin **Sync** is one button: `PUT /api/admin/quotas` with `{ "sync": true }` (Q1–Q4 Closed Won). Alias: `POST /api/admin/vtiger-sync?quarter=all`. It writes a `crm_sync_jobs` row **before** returning, then runs `vtiger_sync` on a **daemon thread**. The UI polls `GET /api/admin/quotas` (`crm` object) until **that** job is `done` or `error` — Chrome HTML-403s any path with `status` in it. Do not treat another worker’s idle memory as complete. API/CLI still accept `?quarter=` / `--quarter` for scripts.

On the CRM VM (`/home/crmuser/galaxy_db`), the client connects to `http://127.0.0.1` and sends `Host` of the public CRM name so Apache’s vhost still matches. Calling the public URL from the same box hairpins through Azure. Client: 180s timeout, 5 retries on network/timeout. Fetch Closed Won potentials first; `retrieve` **accounts only** (Accounts page needs names). Skip contacts and Assigned-To users — quota uses Organization Led By (`cf_825`) on the Potential. Unresolved accounts are counted, not printed per ID. Logout permission-denied is ignored. VQL pagination stays `LIMIT offset, count` (100/page).

`migrate_from_excel_if_empty` is **off** unless `GALAXY_MIGRATE_EXCEL=1`. Leftover Pipeline xlsx under `files/` is archive-only.

Credentials in `backend/.env` only: `VTIGER_URL`, `VTIGER_USERNAME`, `VTIGER_ACCESS_KEY` (My Preferences → Access Key, not web password).

Vtiger field map (confirmed 2026-08-14):

| Pipeline column | Vtiger field |
|---|---|
| Opportunity Led By | `cf_825` |
| Category | `cf_715` |
| Sub Category | `cf_765` |
| Brand | `cf_713` |
| Amount / Topline | `amount` |
| Estimated Bottomline | `cf_731` |
| Actual Bottomline - | `cf_781` |
| Deal Status | `cf_805` |
| Deal Category | `cf_902` |
| OPF No. | `cf_707` |
| Organization Name | `related_to` resolved |
| Assigned To | `assigned_user_id` resolved |
| Sales Stage | `sales_stage` = Closed Won |
| Expected Close Date | `closingdate` |

FY 26-27: Q1 2026-04-01→06-30, Q2 07-01→09-30, Q3 10-01→12-31, Q4 2027-01-01→03-31.

`Division` does **not** exist in Vtiger. Derived from assignment history (close date) / as-of-today.

### 10.2 Quota editor

1. `GET/PUT /api/admin/quotas` read/write `ic_quotas.json`.
2. Optional BU annual quotas → `quota_rules.json` `bu_annual_quotas`.
3. `build_quota_data.build()` regenerates `quota_data.json`.
4. `seed_users` runs after save (inserts missing roster logins; does **not** reset passwords).

`scripts/extract_quotas.py` is emergency Tracker import. Re-running it overwrites Admin edits.

### 10.3 Assignment history (shipped 2026-09-08)

- Module: `scripts/assignment_history.py` — `covers`, `current_division`, `division_on`, `apply_transfer`, `validate_assignments`.
- Admin UI: effective date when RTM changes; expandable history; no silent overwrite.
- Employees detail: Current RTM + history table.
- Team lists: as-of today. Deal RTM: close date.

---

## 11. Dashboard pages and JSON keys

`build_quota_data.py` must keep emitting shapes in `dashboard/src/types.ts`.

| Page | JSON | Notes |
|---|---|---|
| Overview | `kpis`, `period_metrics`, `rtm_divisions`, `top_attainers`, `at_risk_ics`, `pipeline.summary` | |
| RTMs | `rtm_divisions` / `division_aggregates` | S1 → S2 → CB → GB → South (GeoX extra) |
| Business Units | `bu_level`, `rtm_by_bu` | Annual from Admin; H1/Q1 derived from IC mix. **Actuals = RTM-team deals only** (`rtm_division` in the six RTMs). Deals led by non-RTM people (Ajay/DCG, Jitesh/Cloud, Self) are left out, so the BU total = RTM total = header IC actuals. Filter lives in `build_quota_data.compute_actuals_by_cat_div` + `build_bu_level` and `scoping._rebuild_bu` / `_rebuild_rtm_by_bu` (`_is_rtm_deal`). |
| Accounts / Brands | nested `deals`, `by_bu`, `gp_pct` | |
| Leaders | `leaders_dashboard` | Header + top deals = personal Led-By (alias match). Team Roster = as-of-today ICs in `leader_roster.json` `rollup_divisions` (Ishwari → S1, Ajay → South). `team_size` is member count. |
| Employees | `individuals` + `pipeline.closed_deals` + `assignments` + `rtm_divisions` | Grouped by as-of-today division. ICs **and TLs** listed (TL badge); AVP / BU Head / Topline / Bottomline hidden (Leaders page). Team header totals = the RTM card for that division (not a re-sum of the list). Plus a **Self** group (`NON_RTM_GROUPS` in `EmployeesView.tsx`) shown after the RTMs with a "Not an RTM" badge. It shows everyone with `division: "Self"` whatever their persona (today Yusufali Petiwala, Topline), and its totals are the sum of its members. Self is **not** an RTM: not in `rtm_divisions`, RTM cards or header IC actuals. |
| Leaderboard | `individuals` period attainment | |
| Help | none (static) | Sidebar for **every** role. Download user manual via `GET /api/help/manual`. FAQ is static copy from the v5 PDF. |
| Admin | live API | Sync + roster + T1 + **Users** (add/edit role & password) |

Blank page is usually a **missing nested field**, not empty CRM data.

---

## 12. How to run locally (Windows)

Frontend **requires** backend on port **8080** (`vite.config.ts` and `scripts/run_backend.ps1`). Do not start uvicorn on 8000 locally.

```powershell
# Backend
cd c:\Projects\Galaxy\Temp_Galaxy\galaxy_db
.\.venv\Scripts\Activate.ps1   # or backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
.\scripts\run_backend.ps1
# → http://127.0.0.1:8080/api/health
# OpenAPI /docs only if GALAXY_DOCS=1 in backend/.env

# Frontend (second terminal)
cd dashboard
npm install
npm run dev
# → http://localhost:5173   (proxies /api → :8080)
```

Corporate machines: use `python -m uvicorn` (AppControl may block `uvicorn.exe`). `--app-dir backend` with `PYTHONPATH` pointing at `backend/` (the ps1 script does this).

Rebuild without CRM sync:

```powershell
python scripts\build_quota_data.py
```

Sync then rebuild:

```powershell
python scripts\vtiger_sync.py
```

---

## 13. Known issues

Update this list when you fix or add defects. Ordered by severity.

### Product / ops (open by design of this handover)

1. **T1 import full-replaces the roster.** Names missing from the sheet (and their history) are deleted. An RTM mismatch is treated as a transfer dated **today** (cannot distinguish a data correction from a move).
2. **After a transfer, RTM attainment mixes two clocks.** Quotas = as-of-today members; actuals = deal close-date RTM. A Sep S1→GB move leaves Q1 deals on S1 but removes that IC’s quota from S1. Employees groups people by today; each person row shows their **full** IC actuals, while the team header uses the RTM card (close-date RTM), so after a transfer the rows under a team need not add up to its header.
3. **Production is HTTP-only** (Galaxy Nginx **8081**; Apache **80** is Vtiger). Login and JWT in cleartext. TLS is an ops change, not in this code drop. Open Galaxy at `:8081` only — HTML 403s are Apache, not FastAPI.
4. **Leaders header is personal Led-By, not a team rollup of actuals.** Top deals stay that person’s Closed Won. **Team Roster** is as-of-today ICs in `rollup_divisions` (not `division` when that is a BU, e.g. Ajay/DCG). Cloud/CSN heads may have an empty roster because those codes are not RTM divisions. Date-filter `_rebuild_leaders` alias-matches Led By (Ishwari Santosh Kadam → Ishwari Kadam). Leaders with no own deals (currently Dipti Karpe, Vineet Gadia, Rocky Braganza, all with 0 Led-By deals in Vtiger) show a "no Closed Won deals of their own" banner on the detail page and "No own deals" on the card instead of bare zeros (client decision 2026-09-28: keep personal figures).

### P1

5. **Cloud and CSN heads** use `rollup_divisions` `Cloud`/`CSN`, which are not RTM codes — they often fall back to self-only scope.
6. **Do not store production secrets in this markdown.** JWT, Postgres password, and Vtiger keys belong in server `.env` only.

### P2

7. **`current_division`** can apply a future open assignment if no row covers today (`assignment_history.py`).
8. **Date filter keeps deals with no `close_date`.** Those deals then get as-of-today RTM and jump teams on transfer day.
9. **Users in Postgres, deals always SQLite** — two databases in production.
10. **Cloud annual quotas identical to CSG** in `bu_annual_quotas` — confirm with finance.
11. **BU H1/Q1 quotas are derived** from annual × IC mix, not uploaded.
12. **No automated tests** for assignment overlap, future transfer, T1 merge, or DevSpec math.
13. Unmapped name **Rima Ingle** (tiny Amount) drops out of RTM unless aliased.
14. Q3/Q4 have no deals; period objects `"estimated": true`.
15. STLY / SAM / TAM still have no source data.

**Fixed in code (2026-09-10 handover):** public `quota_data.json` moved to `backend/data/` (API-only); JWT requires `SECRET_KEY` and expires in 30 minutes; login rate-limited; at-risk list uses `quota_rules.json` 30%; date filter rebuilds Accounts/Brands `by_bu`/`gp`/`rtm_by_bu` and Leaders personal actuals; seed no longer reactivates deactivated privileged users; deleted roster logins stay gone via `seed_exclusions`; empty CRM fetch cannot wipe a non-empty quarter; stale sync jobs reclaim on GET status.

**Fixed in code (2026-09-10 403 logout):** dashboard signs out only on JSON **401**. HTML block pages keep the session. Admin Users list/create/update/delete use `GET`/`PUT /api/admin/quotas` (same URL Chrome already allows). `/directory`, `/logins`, and `/users` remain as aliases for API clients. API fetches retry once on HTML.

If an **old** `dashboard/dist` is still on the server, Nginx may still serve leftover `dist/data/quota_data.json` until the next frontend deploy. Deny `/data/` in Nginx until then.

---

## 14. Decisions already made — do not undo without asking

- Pipeline data is **Vtiger → SQLite**. No Excel for actuals.
- Quota targets are edited in **Admin** (or T1 import), stored in `ic_quotas.json`. H1/H2/Annual independent of Q1–Q4.
- **RTM-only** assignment history on the same person (no extra Department field, no extra SQL table).
- Team lists = as-of-today IST. Deal RTM = assignment covering close_date.
- IC transfers between RTMs are **Admin-only**.
- IC actuals = **Topline Amount**, except GeoX/Hrushikesh = bottomline.
- IC actuals **do not** include multipliers.
- Names join on **canonical alias**.
- Atomic write for `quota_data.json`.
- Admin sync: SQLite `crm_sync_jobs` + daemon thread; UI polls **that** `job_id`. Production Gunicorn should use `--timeout 600` (or similar) so a stuck thread cannot wedge a worker forever; stale `running` jobs (>45 min) can be superseded.
- Do **not** flatten the three header revenue numbers.
- Do **not** switch VQL pagination back to `OFFSET`.

---

## 15. Verified numbers (audit 2026-08-18)

Independent recompute from SQLite + `ic_quotas.json`. **0 IC mismatches, 0 RTM mismatches** *before* assignment-history actuals split. Re-audit RTM cards after the first real mid-year transfer.

| Check | Independent | Dashboard | Match |
|---|---|---|---|
| Q1 / Q2 / total deals | 377 / 97 / **474** | same | yes |
| Q1 Amount all deals | **₹117.51 Cr** | Vtiger 117.51 | yes |
| Q1 **RTM IC** actuals | 103.7169 Cr | 103.72 | yes |
| H1 **RTM IC** actuals | 163.977 Cr | header **163.98** | yes |
| H1 IC quota | 547.5 Cr | 547.5 | yes |
| Pipeline excl. Hrushikesh | 174.7302 Cr | 174.73 | yes |

**Why Q1 is 103.72 on the dashboard but 117.51 in Vtiger:** 117.51 is every Closed Won deal. 103.72 is RTM ICs only, Amount in Cr, Hrushikesh on bottomline. Correct per DevSpec.

---

## 16. Production server

| Property | Value |
|---|---|
| IP | `20.219.14.83` |
| OS | Ubuntu 18.04 LTS (Azure VM) |
| SSH | `crmuser` |
| Web | Nginx **port 80** |
| App | Gunicorn + Uvicorn **port 8000** (internal). Prefer `--timeout 600` so a long Vtiger sync thread is not SIGTERM’d at the default 30s. |
| Users DB | PostgreSQL 10 (`galaxy_db`) |
| Deals DB | SQLite `backend/galaxy.db` `crm_deals` on the VM |
| App root | `/home/crmuser/galaxy_db` |
| Frontend | `/home/crmuser/galaxy_db/dashboard/dist` |
| systemd | `galaxy-backend.service` |

Server env file: `/home/crmuser/galaxy_db/backend/.env`  
Nginx: `/etc/nginx/sites-available/galaxy` — static dist, `/api/` → `127.0.0.1:8000`. Until the next frontend deploy, add `location /data/ { deny all; }` so an old `dist/data/quota_data.json` is not world-readable.

**Chrome device mode:** emulating a phone (Pixel / Android User-Agent) against `:8081` can return a ~35 KB HTML **403**, even in Incognito. Test as desktop (turn off the device toolbar, Ctrl+Shift+M). That is not Apache port 80 and not a missing `/logins` route.

Required env (values **only** on the server, never in git):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres users DB (URL-encode `@` `%40`, `!` `%21`) |
| `SECRET_KEY` | JWT signing — **required**. Backend will not start if missing or still the example placeholder. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access JWT lifetime (default **30**) |
| `CORS_ORIGINS` | JSON array of frontend origins |
| `GALAXY_DOCS` | Set `1` only to expose `/docs` and OpenAPI |
| `VTIGER_URL` | CRM base URL |
| `VTIGER_USERNAME` | CRM user |
| `VTIGER_ACCESS_KEY` | Vtiger My Preferences access key |
| `GALAXY_MIGRATE_EXCEL` | Optional. Set `1` only to import leftover Pipeline xlsx into an empty `crm_deals` |

```bash
ssh crmuser@20.219.14.83
sudo systemctl status galaxy-backend nginx postgresql | grep -E "●|Active:"
```

---

## 17. Git workflow

| Branch | Purpose |
|---|---|
| `main` | Stable base |
| `login_feature` | Older deploy branch |
| `feature/vtiger` | **Current** — deployed on server |

Standard deploy: push `feature/vtiger`, on server `git fetch && git reset --hard origin/feature/vtiger`, `sudo systemctl restart galaxy-backend`. Frontend: `npm run build` then `scp -r dist` to the server `dashboard/` folder.

---

## 18. Adding users

**Primary:** Admin → **Users** (admins only). Create/update/delete logins, role, employee name, password. Seed will not overwrite those hashes. Privileged seed accounts cannot be deleted (deactivate instead). Deleted roster ICs stay gone: username is written to `seed_exclusions` and skipped on the next seed until Admin create removes it.

**CLI fallback:** `backend/add_user.py` (same bcrypt hashing).

New ICs who appear on the quota roster get a login on next `seed_users` with the default password `Galaxy@123!` only if that username does not already exist.

```bash
sudo -u postgres psql -d galaxy_db -c \
  "SELECT username, full_name, role, is_active FROM users ORDER BY role, username;"
```

---

## 19. How to continue

1. Production is still HTTP — put TLS on Nginx when ops is ready.
2. Confirm Cloud vs CSG annual quotas with finance.
3. Decide how RTM cards should behave after a mid-year transfer (time-weighted quota vs current membership).
4. Alias **Rima Ingle** if she should count.
5. Tests for `assignment_history.py` (overlap, future start, T1 merge).
6. After frontend deploy, confirm `GET /data/quota_data.json` is 404 (or Nginx `deny`).
7. **Update this file** in the same session as any of the above.

When debugging “dashboard ≠ Vtiger report”, recompute from SQLite with §9 before changing code. Raw Vtiger Amount ≠ IC Actuals by design.

---

## 20. Session log

### 2026-09-28 — Friday work restored + small Cr decimals + Leaders "no own deals"

- **Restore:** 8 working files had gone back to pre-Friday versions on disk (likely an editor/checkpoint restore). They were restored from commit `d0201f4` (pushed to Bitbucket; it holds all 2026-09-25 work): `BUSINESS_SUMMARY.md`, `PROJECT_CONTEXT.md`, `scoping.py`, `build_quota_data.py`, `ic_quotas.json`, `pipeline_aliases.json`, `EmployeesView.tsx`, `AdminUploadsView.tsx`. The reverted copies are backed up under `%TEMP%\galaxy_backup_20260928`.
- **Cr decimals:** `formatCr` / `formatCrDisplay` share a `crNumber` helper. A non-zero value that would show `0.00` widens to up to 4 decimals (Jitesh ₹0.0015 Cr topline / ₹0.0008 Cr BL). The `QuotaVsActualChart` tooltip now uses `formatCr`.
- **Leaders no own deals:** Dipti Karpe showed zeros because Vtiger has no deals led by her (all 474 deals checked; the 12 "Karpe" deals are Atharva Karpe, CB). Same for Vineet Gadia and Rocky Braganza. The tiles stay personal, as the client chose. `LeadersView` shows an info banner, "No deals led by {name} in this period" in Top Team Deals, and "No own deals" on the card when `pipeline.deal_count === 0`.
- Production: copy the new `dashboard/dist`. Commit soon so the working tree matches the repo.

### 2026-09-25 — BU page counts RTM teams only

- The BU cards, the "RTM by Division" tables and the Overview BU donut used to sum every Closed Won deal in the category, which brought in DCG (Ajay 9.69 + 0.50), Cloud (Jitesh 0.0015) and Self (Yusufali 0.50 CSN + 0.58 CSG) rows, 11.27 Cr in total. They now count only deals whose close-date RTM is S1/S2/CB/GB/South/GeoX.
- "This Year" annual BU actuals: DCG 103.51 → **93.82**, CSN 33.20 → **32.70**, PS 10.68 → **10.18**, CSG 28.31 → **27.74**, Cloud 2.89 (unchanged). BU sum 178.60 → **167.33**, which equals the RTM sum and header IC actuals. The pipeline header "IC actuals including others" (174.73) is unchanged.
- Production: copy `scripts/build_quota_data.py` + `backend/app/scoping.py`, rebuild, then restart Gunicorn.

### 2026-09-25 — Employees page: Self section (not an RTM)

- Added a "Self" group to Employees for roster `division: "Self"` (only Yusufali Petiwala: Topline, 13 deals / 9 accounts, H1 1.08 Cr, quota n/a). The Topline persona hide is bypassed for Self only. The group has a "Not an RTM" badge, member-sum totals, and a Division filter option. Frontend only; `rtm_divisions` is still the six RTMs and the RTM group totals are unchanged (checked in the browser). Production: copy the new `dashboard/dist`.

### 2026-09-25 — Hrushikesh measured on topline (GeoX bottomline exception removed)

- Client: Hrushikesh's Q/H1/Annual cards must show **topline**, not bottomline. Removed the hardcoded `"hrushikesh"` branch from `build_quota_data.compute_actuals_by_name`, `build_quota_data._deal_ic_cr` (GeoX team sum) and `scoping._deal_ic_cr` (date-filter path; the `employee_name` arg was dropped). Removed the unused `GEOX_IC` constant.
- API "This Year": Hrushikesh Q1 0.29 → **3.81** (152.5%), Q2 0.02 → **0.06** (1.1%), H1 0.31 → **3.87** (51.6% of 7.5). GeoX team H1 2.56 → **6.11**. Header IC actuals 163.78 → **167.33**. Pipeline header unchanged (174.73 / BL 5.73) because his deals stay reference-only there.
- Production: copy `scripts/build_quota_data.py` and `backend/app/scoping.py`, rebuild, then restart Gunicorn.

### 2026-09-25 — Bottomline = Actual Bottomline only

- Client: bottomline must be the **total of Actual Bottomline** for the person. Removed the `or Estimated Bottomline` fallback from `build_quota_data.py`. Both the Hrushikesh IC actual and the deal `bottomline_inr` now go through `_actual_bottomline(row)`. Scoping needed no change because it only re-sums deal `bottomline_inr`/`bottomline_cr`.
- Rebuild (474 deals): Hrushikesh Q1 0.4935 → **0.2938**, Q2 0.0231 → **0.0207**, H1 0.5166 → **0.3145** (matches the Excel Actual Bottomline sum). GeoX RTM H1 2.7594 → 2.5573. Header IC actuals 163.98 → 163.78. Pipeline bottomline 14.17 → **5.73 Cr**; 111 of 474 deals now show BL 0 (no Actual Bottomline in Vtiger yet). Leaders BL: Ishwari 0.44 → 0.0207, Ajay 0.6549 → 0.5509, Sanjeev 0.022 → 0.002, Yogesh Bhatia 0.0025 → 0.
- The date-filtered API shows Hrushikesh 0.3143 because it re-sums per-deal `bottomline_cr` (rounded to 4 dp). That rounding already applied to all date-filtered actuals.
- `scripts/parse_excel.py` (legacy, not on the live path) still has the old fallback.
- Production: copy `scripts/build_quota_data.py`, then rebuild (Admin → Reparse or `python scripts/build_quota_data.py`).

### 2026-09-25 — Client: Sales Team rows 48-56 under GB

- Client (Mitashree) confirmed: row 48 **Jitesh Rajput** heads PS + Cloud, no RTM (stays `division: Cloud`, Leaders card only). Rows 49-52 (Ashish Singh, Pushkaraj Sohoni, Ayushman Singh, Shubhangi Srinivasan) report directly to Sanjay Patodia and **count under GB**. ISR rows 53-56 (Sana Bhatkar TL + Bhumi, Rizwana, Suvesh) already GB.
- Only gap was **Pushkaraj Sohoni** → added to `ic_quotas.json` as GB, `IC, Cyber security`, quota 0, `reporting_manager: Sanjay Patodia`. 0 Closed Won in CRM today. Seed login `pushkarajs` (role `user`, own-only scope).
- Rebuild: 49 individuals; GB = 13 people, GB annual quota unchanged at 86.4 Cr. Jitesh Leaders card unchanged (3 deals).
- Not changed: `leader_roster.json` still lists Rocky Braganza (CSN) and Yogesh Bhatia (GB head); neither is on the new Sales Team sheet. Client portal closes 30 Sep — deploy roster to `:8081` before then.
- Admin later saved Pushkaraj with `annual_quota: 2.0` (H1/H2 still 0) → GB annual quota 88.4 Cr.
- Tally (all 60 active logins via `/api/quota`, This Year dates): every IC/TL/leader row matches Admin exactly (quota, actuals, deal count); RTM quota = sum of members; RTM H1 actuals sum = header 163.98 Cr.
- Login `ishitag` (Ishita Gutt) had no `employee_name` → empty view. Client confirmed it is **Dipti Karpe's** login: set `employee_name: Dipti Karpe`, role `leader` (same scope as `diptik`, 7 S2 people). Local users DB only — repeat in Admin → Users on `:8081`.
- Full-name logins `ayushmans`, `shubhangis`, `sankeerthb` saw an empty view: login scoping (`_allowed_names_for_user` / `_names_match`) does **not** use `pipeline_aliases.json`, and roster keys were the old tracker names `Ayushaman` / `Shubhangi` / `Sankeerth`. Fixed by **renaming those 3 roster keys to the Vtiger Led-By names** (`Ayushman Singh`, `Shubhangi Srinivasan`, `Sankeerth Bhargav`) — quotas, type and `assignments` kept — and removing their 3 aliases. This overrides the 09-21 "canonical keys not renamed" choice for these three only (user decision). Duplicate short logins `ayushaman`, `shubhangi`, `sankeerth` **deactivated** (not deleted). Re-tally: 4 / 16 / 6 deals visible on the full-name logins; RTM and header totals unchanged; only `rockyb` empty (CSN is not an RTM — known).
- Added the last 2 Sales Team rows missing from the roster: **Yogesh Awate** (AI BU Head, `IC, AI`) and **Akshat Jhariya** (GCC, `IC, GCC`), both **GB**, quota 0, `reporting_manager: Anoop Paidunghat` (same GB rule the client gave for CSN/Cloud). No CRM deals yet. Seed logins `yogesha`, `akshatj` (role `user`, own-only). Rebuild: 51 individuals, GB = 15 people; GB quota/actuals and header 163.98 unchanged. Every Sales Team row is now on the roster except Anoop/Sanjay (admin/CEO logins) and Dipti/Vineet (Leaders page + logins, no IC row).
- **Employees page:** team header totals disagreed with RTM cards for S1/CB/GB/GeoX (re-summed only `persona === "IC"`, so `IC, Cloud` etc. were listed but not added; TLs/Topline hidden; GeoX Hrushikesh special-case was dead code because Topline is hidden). `EmployeesView.tsx` now takes each team header from `rtm_divisions[division][period]` and lists TLs with a TL badge (`ui.pill`). Verified in browser (admin, H1): S1 62.44/307.35, S2 51.26/141.25, CB 17.74/33.00, GB 16.46/28.90, South 13.32/22.00, GeoX 2.76/15.00 — identical to RTMs page; Prashant, Jimesh, Sana, Ramakrishna shown as TL. Needs a new `dashboard/dist` on deploy.
- Production `:8081` needs the same `ic_quotas.json` + `pipeline_aliases.json` edits and the same Admin → Users changes (ishitag mapping, 3 deactivations) on next deploy.

### 2026-09-21 — Sales Team FY 26-27 roster update

- Client `Sales Team - FY 26-27.xlsx` + `Closed Potentials- sales tracker 21sep.csv` (474 Closed Won) archived under `files/`.
- **Kept** all existing `ic_quotas.json` people (GB / TBH / Yusufali / Darshana, etc.). **Added** at quota 0: Ramakrishna Koparapu (South TL), Ketan Dalmia (S2), Asmit Joshi / Ajay Jajodia / Meeta Sharma / Anupam Deshmukh (CB), Ipshita Banerjee / Samarth Kakade (GeoX).
- Aliases: Shaikh Khader→Shaik Khadhar, Sagar T R→Sagar TR, Sana Bhatkar→Sana Rashid Bhatkar, Rima Ingle→Rima Kamalakar Ingle, plus spacing variants. Canonical roster keys **not** renamed.
- `dept_to_rtm.json` labels for Strategic 1/2, DCG - South Sale, GEO Expansion, Commmercial Business. Ajay `scope_depts` includes `DCG - South Sale`.
- Rebuild: 48 individuals; Closed Potentials Led By → roster coverage 100%; Ajay H1 ~₹10.19 Cr / 31 deals + South roster includes Ramakrishna; Ishwari ~₹6.27 Cr / 4 deals. Live actuals still Vtiger→SQLite (CSV not imported).

### 2026-09-16 — Leaders Team Roster

- `team_members` was hardcoded `[]` in `build_quota_data.py` and `_rebuild_leaders`, so Admin and leader logins both showed an empty Team Roster. The “N cumulative team members” badge was deal count.
- Roster now = as-of-today ICs whose division is in `leader_roster.json` `rollup_divisions` (Ishwari → S1, Ajay → South). Leader themselves omitted. `team_size` is that count. Header actuals / top deals stay personal Led-By.
- Empty RTM (Cloud/CSN heads) shows “No team members in this leader’s RTM”.

### 2026-09-16 — Leaders alias match (Ishwari)

- UI always sends This Year dates, so `apply_date_filter` always runs `_rebuild_leaders`. Exact-key lookup on `leaders_dashboard.name` dropped Ishwari’s deals (roster **Ishwari Santosh Kadam**, CRM **Ishwari Kadam**).
- Rebuild now loads `config/pipeline_aliases.json` and collects deals by roster name, canonical alias, or `_names_match`. Deduped by opportunity number.
- Verified vs Employees: H1 ~₹6.27 Cr, 4 deals (Godrej nutanix / rental / Lenovo AMC / Hyper-V AMC). Ajay Patodia still 31 deals. Quota math / RTM / Overview unchanged.

### 2026-09-15 — Help: user manual + FAQ

- Sidebar **Help** (all roles, before Admin). Download `GET /api/help/manual` → `files/docs/Galaxy_Sales_Performance_User_Manual_v5.pdf`. FAQ accordion is static from manual §6.
- PDF is JWT-only (not in `dashboard/public/`). Existing views and Admin APIs unchanged.

### 2026-09-10 — Chrome device mode HTML 403

- DevTools device toolbar (Pixel 9 UA) against `:8081` returns ~35 KB `text/html` 403 (`Connection: Close`). Desktop UA gets nginx JSON. Incognito does not help while the toolbar is on. Turn it off with Ctrl+Shift+M.

### 2026-09-10 — HTML block pages on :8081

- Curl and a clean browser to `:8081` get nginx JSON. Chrome can still get ~25 KB HTML on `/api/admin/users` while `/api/admin/quotas` and `/status` succeed.
- HTML 401 on `/api/auth/me` was signing people out on first load. Logout now requires JSON 401.
- UI lists and mutates logins via `GET`/`PUT /api/admin/quotas` (`accounts` / `account`). `/directory`, `/logins`, and `/users` stay as aliases for API clients; Chrome can intercept those paths with HTML 403 even in Guest.

### 2026-09-10 — Logout only on JWT 401

- Apache on port 80 can answer `/api/*` with HTML 403. That is not a Galaxy JWT failure.
- `useQuotaData` and boot `GET /api/auth/me` clear the session **only** on 401. HTML 403 stays signed in and shows a stay-on-8081 message.
- Login 429 shows “too many requests”. Admin Users/Uploads parse JSON safely and never dump HTML into banners.

### 2026-09-10 — Users list on GET /quotas

- Chrome (including Guest / a new browser) still returned HTML 403 on `/api/admin/users`, `/logins`, and `/directory` while `GET /api/admin/quotas` was 200 JSON.
- Admin Users no longer fires a second URL. The Users table is `accounts` on the quotas GET. Create / edit / delete send `{ account: { op } }` on `PUT /api/admin/quotas`.
- After deploy: `sudo systemctl restart galaxy-backend`, then hard-refresh `:8081`. Network tab should show `quotas` only — no `users` / `logins` / `directory`.

### 2026-09-10 — Vtiger sync timeout + status 403

- Admin showed “Vtiger CRM timed out” then “Could not reach Vtiger CRM”. Galaxy on the VM must use `http://127.0.0.1` **with** `Host` of the public CRM name (Apache vhost). Public hostname hairpins; loopback without Host gets Apache 403.
- Chrome HTML-403s any path containing `status` (`/vtiger-sync/status` and `/api/admin/status`, 35 KB). UI starts sync with `PUT /api/admin/quotas` `{ sync: true }` and polls `GET /api/admin/quotas` (`crm` job payload). Timeout 180s, 5 retries.

### 2026-09-10 — Handover bugfix + security

- Status chips map `on_track` / `at_risk` / `critical` / `unknown`. Leaderboard and Employees Q3/Q4 use real period objects. Overview donuts use `q3`/`q4` on RTM and BU payloads. At-risk list uses `quota_rules.json` 30%.
- Date filter rebuilds Accounts/Brands (`gp_pct`, `by_bu`, quota credit) and `rtm_by_bu`. Leaders actuals rebuild from the filtered deal list (personal Led-By). Team Roster rebuilds from as-of-today ICs in `rollup_divisions`.
- `quota_data.json` lives at `backend/data/quota_data.json`. Startup copies then deletes any leftover `dashboard/public/data/` copy. Frontend stays on `GET /api/quota` only.
- Auth: `SECRET_KEY` required (no placeholder). Access JWT 30 minutes. Rate-limit login/token/health. CORS includes 5174. `/docs` off unless `GALAXY_DOCS=1`. Boot calls `GET /api/auth/me`.
- Seed no longer forces privileged `is_active`. Deleted usernames go to `seed_exclusions`.
- Sync: reclaim stale jobs on GET; refuse empty replace of a non-empty quarter; CLI uses the same job lock; 409 on Save/Rebuild while running; FY windows from 1 Apr.
- Admin: safe 500s (no `str(exc)`); gate Admin view; refetch banner keeps last good data; disable Save/Rebuild while syncing.

### 2026-09-10 — One Sync button (full FY)

- Admin Sync has no quarter dropdown. One button posts `quarter=all` (Q1–Q4 Closed Won). API/CLI still accept a quarter for scripts; default is `all`.
- CRM resolve is accounts only. Contact/user retrieves were permission noise and not used for quota. Misses are one summary line. Logout permission-denied is quiet and never fails the job.

### 2026-09-10 — Q1 sync UX (Vite reload)

- Q1-only sync was succeeding (377 stored) but Vite reloaded on `quota_data.json` write, dumping Admin to Overview.
- Vite `server.watch` ignores `public/data/**`. `drill.view` persists in sessionStorage. Sync complete text lists per-quarter stored counts plus FY database totals.

### 2026-09-10 — Admin user delete

- `DELETE /api/admin/users/{id}` hard-deletes a login. Guards: not self, not last active admin, not `PRIVILEGED` seed usernames (deactivate those).
- Admin → Users: Delete + confirm. Roster-named users warned they may return after seed.
- Success vs error banners split; Active/Inactive badge; Escape closes the form.

### 2026-09-10 — Vtiger sync reliability

- Shared `crm_sync_jobs` in SQLite (WAL, 30s busy timeout) so Gunicorn workers share status; POST returns `job_id` before the work starts.
- Daemon thread instead of FastAPI `BackgroundTasks`; errors stored as safe UI strings; no re-raise.
- CRM client: 180s timeout, 5 retries; on the CRM VM uses `http://127.0.0.1`; fetch deals first and retrieve only referenced IDs.
- Admin UI polls that `job_id` until `done`/`error` (no false complete from another worker).
- Excel auto-migrate disabled unless `GALAXY_MIGRATE_EXCEL=1`.

### 2026-09-08 — Admin user management

- Admin → Users: list/create/update logins, role, employee name, password (`GET`/`PUT /api/admin/quotas`; `/directory` aliases remain).
- Layers: `user_service` + `user_repo`. Last-admin and self-lockout guards. bcrypt cost 12.
- `seed.py` never overwrites password hashes; roster is insert-only so Admin role edits survive quota save.

### 2026-09-08 — Quota Roster RTM history + full code review

- RTM assignment history on the same person in `ic_quotas.json` (`assignments[]`).
- New `scripts/assignment_history.py`. Admin Save requires `transfer_start` on RTM change. Employee profile shows history.
- Builder + `scoping.py`: lists as-of today; deal `rtm_division` from close date.
- T1 import preserves history for names on the sheet; still **full-replaces** omitted names.
- Code review: P0 password reset, public `quota_data.json`, secrets-in-markdown still open. New P1: T1 wipe + RTM quota/actuals time-base split.

### 2026-08-20 — Finance review

H1/H2/Annual independent; persona login scoping; Admin RTM dropdown; date range filter; BU card order; T1 import; Sanjeev Kohli hidden from Employees.

### 2026-08-18 — Demo prep + audit

Port 8080; quota roster seeded from Tracker Excel; Excel uploads removed from Admin; BU quotas on cards; Overview closed-deal counts; CORS 4173. Core IC/RTM math audited.
