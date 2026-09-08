# Galaxy Performance Tracker — Project Context

**Last updated:** 2026-09-08  
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
| Backend | FastAPI, Pydantic Settings, SQLAlchemy 2, python-jose (JWT HS256, 12h), bcrypt |
| Users DB | SQLAlchemy. SQLite locally (`backend/galaxy.db`). Postgres on the Azure VM when `DATABASE_URL` is set. |
| Deals DB | **Always** stdlib sqlite3 via `scripts/deal_store.py` (`backend/galaxy.db` table `crm_deals`). Not Postgres. |
| ETL | Python (`pandas`, `openpyxl`) in `scripts/` |
| CRM | Vtiger REST v1, VQL, MySQL-style `LIMIT offset, count` (100 rows/page). Do **not** switch pagination back to `OFFSET`. |
| Auth | JWT Bearer. Default demo password `Galaxy@123!` (change in production). |
| Local ports | Backend **8080**, frontend **5173** (Vite proxies `/api` → `127.0.0.1:8080`). If 5173 is busy, Vite may use 5174. |
| Production | Nginx port **80** → static `dashboard/dist`; `/api/` → Gunicorn/Uvicorn **8000** on the VM. HTTP only today. |

---

## 3. Folder structure

App root is `galaxy_db/` (workspace wrapper is `Temp_Galaxy/`).

```
galaxy_db/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, startup seed
│   │   ├── config.py            # Paths + env (JWT, Vtiger, DATABASE_URL)
│   │   ├── models.py            # SQLAlchemy User
│   │   ├── database.py          # Engine / session
│   │   ├── security.py         # JWT, bcrypt, require_admin, can_see_all
│   │   ├── schemas.py
│   │   ├── seed.py              # Privileged + roster users (insert-only; never resets hashes)
│   │   ├── scoping.py          # Role scope + date-range actuals rebuild
│   │   ├── quota_template.py     # T1 Excel parse
│   │   ├── services/           # Business logic (user_service, …)
│   │   ├── repositories/        # DB access (user_repo)
│   │   └── routers/
│   │       ├── admin.py         # Sync, quotas, T1 import, users
│   │       ├── auth.py          # Login
│   │       └── data.py          # GET /api/quota
│   ├── add_user.py              # CLI fallback; Admin → Users is the live path
│   ├── requirements.txt
│   ├── galaxy.db               # SQLite: users (local) + crm_deals (always)
│   └── .env                    # Never commit
├── dashboard/
│   ├── src/
│   │   ├── App.tsx              # View switcher (no router)
│   │   ├── views/              # Overview, RTMs, BU, Accounts, Brands,
│   │   │                      # Leaders, Employees, Leaderboard, Admin, Login
│   │   ├── components/        # Sidebar, DateRangeFilter, charts, …
│   │   ├── context/            # AuthContext, DashboardContext
│   │   ├── hooks/useQuotaData.ts
│   │   ├── utils/fiscal.ts    # FY calendar (IST, 1 Apr)
│   │   └── types.ts
│   ├── public/data/quota_data.json   # Generated artifact — do not hand-edit
│   └── vite.config.ts          # Proxy /api → :8080
├── scripts/
│   ├── assignment_history.py  # RTM history: as-of-today, division_on, apply_transfer
│   ├── build_quota_data.py     # Current JSON builder
│   ├── deal_store.py           # crm_deals SQLite
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
├── files/                      # Excel archives (not live path)
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
scripts/vtiger_client.py     auth + paginated VQL + ID→name resolution
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
dashboard/public/data/quota_data.json
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

Privileged seed (`backend/app/seed.py` `PRIVILEGED`): CEO `sanjayp`; admins `dilips`, `asifb`, `dharashinib`, `praveens`, `anoopp`. New roster ICs/leaders are **inserted** if missing (default password). Existing logins keep their password, role, and profile (Admin Users is source of truth). Privileged rows still sync role/email/`is_active` but **never** reset the password hash.

### 5.2 Deals — sqlite3 `crm_deals`

Always this table, even when users are in Postgres. Payload is a JSON blob of pipeline columns (not normalized fields).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `quarter` | TEXT NOT NULL | `q1` / `q2` / `q3` / `q4` |
| `opportunity_number` | TEXT NOT NULL | Unique with quarter; synthetic `anon-…` if missing |
| `payload` | TEXT NOT NULL | JSON: Led By, Amount, Category, Brand, close date, … |
| `synced_at` | TEXT NOT NULL | ISO UTC |

Index: `idx_crm_deals_quarter`. Sync **replaces** all rows for that quarter.

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
| GET | `/api/admin/status` | admin | Deal counts + quota file exists |
| GET | `/api/admin/uploads/status` | admin | Alias of `/status` |
| GET | `/api/admin/quotas` | admin | Roster + synthesized `assignments` |
| PUT | `/api/admin/quotas` | admin | Full-replace `ic_quotas.json`. RTM change requires `transfer_start`. Then rebuild + `seed_users`. |
| GET | `/api/admin/templates/data` | admin | Download `files/Galaxy_Data_Templates.xlsx` |
| POST | `/api/admin/quotas/import` | admin | T1 sheet → roster. Missing names are **dropped**. RTM diff → transfer dated today. |
| POST | `/api/admin/reparse` | admin | Rebuild JSON from SQLite + config |
| POST | `/api/admin/vtiger-sync?quarter=h1` | admin | Background sync then rebuild |
| GET | `/api/admin/vtiger-sync/status` | admin | `{ running, last_run, last_result, last_error, deals }` — **process-local memory** |
| GET | `/api/admin/users?page=&page_size=&q=` | admin | Paginated logins `{ items, total, page, page_size }` |
| POST | `/api/admin/users` | admin | Create login (password required, bcrypt cost 12) |
| PATCH | `/api/admin/users/{id}` | admin | Update name/email/role/`employee_name`/`is_active`; optional password |

CEO (`sanjayp`) sees all quota data but **not** Admin APIs (`require_admin` is role `admin` only).

---

## 7. Conventions

- **Units:** ₹ Crore = INR / 10,000,000. Never mix Cr and INR in the same field without both keys (`*_cr` / `*_inr`).
- **Fiscal year:** Indian FY, 1 Apr → 31 Mar. Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. Header date filter default = This Year. Dates in **IST**.
- **Canonical names:** Vtiger “Opportunity Led By” → `pipeline_aliases.json` → key in `ic_quotas.json`. Join on alias, not raw CRM string.
- **H1 / H2 / Annual are independent of Q1–Q4.** Finance-owned. Save and builder must not auto-sum them.
- **Three header revenue numbers on purpose** — do not flatten:
  1. **IC Actuals** — RTM ICs (GeoX/Hrushikesh = bottomline).
  2. **Including Others** — all Amount except Hrushikesh.
  3. **BU donut** — all Amount by category **including** Hrushikesh CSG topline.
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

**GeoX exception:** **Hrushikesh Bagade** only — use `Actual Bottomline -` (fallback Estimated Bottomline), **not** Amount.

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
python scripts/vtiger_sync.py --quarter h1
```

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
| Business Units | `bu_level` | Annual from Admin; H1/Q1 derived from IC mix |
| Accounts / Brands | nested `deals`, `by_bu`, `gp_pct` | |
| Leaders | `leaders_dashboard` | Personal Led-By deals; `team_members` is `[]`; **not** rebuilt on date filter |
| Employees | `individuals` + `pipeline.closed_deals` + `assignments` | Grouped by as-of-today division |
| Leaderboard | `individuals` period attainment | |
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
# → http://127.0.0.1:8080/docs

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
python scripts\vtiger_sync.py --quarter h1
```

---

## 13. Known issues

Update this list when you fix or add defects. Ordered by severity.

### P0

1. **`quota_data.json` is a public static file.** Vite copies `public/` into `dist`. Nginx serves it on port 80. `/data/quota_data.json` skips JWT and exposes roster + assignment history. Serve via API only, or deny that path in Nginx.
2. **Do not store production secrets in this markdown.** JWT, Postgres password, and Vtiger keys belong in server `.env` only. Rotate anything that was previously committed here.

### P1

3. **T1 import full-replaces the roster.** Names missing from the sheet (and their history) are deleted. An RTM mismatch is treated as a transfer dated **today** (cannot distinguish a data correction from a move).
4. **After a transfer, RTM attainment mixes two clocks.** Quotas = as-of-today members; actuals = deal close-date RTM. A Sep S1→GB move leaves Q1 deals on S1 but removes that IC’s quota from S1. Employees groups by today and still sums the person’s **full** IC actuals — Employees GB ≠ RTM GB cards.
5. **Production is HTTP-only** (Nginx 80). Login and JWT in cleartext.
6. **Leaders page is personal deals, not a team rollup.** `team_members` is always `[]`. Date filter does not rebuild `leaders_dashboard`.
7. **JWT `secret_key` fallback** in `config.py` is a public placeholder if `SECRET_KEY` is missing.
8. **Cloud and CSN heads** use `rollup_divisions` `Cloud`/`CSN`, which are not RTM codes — they often fall back to self-only scope.

### P2

10. **`current_division`** can apply a future open assignment if no row covers today (`assignment_history.py`).
11. **Date filter keeps deals with no `close_date`.** Those deals then get as-of-today RTM and jump teams on transfer day.
12. **At-risk: API list uses 25%; flags/rules use 30%.**
13. **Vtiger `_sync_state` is process-local** — Gunicorn workers do not share it.
14. **Users in Postgres, deals always SQLite** — two databases in production.
15. **Cloud annual quotas identical to CSG** in `bu_annual_quotas` — confirm with finance.
16. **BU H1/Q1 quotas are derived** from annual × IC mix, not uploaded.
17. **No automated tests** for assignment overlap, future transfer, T1 merge, or DevSpec math.
18. Unmapped name **Rima Ingle** (tiny Amount) drops out of RTM unless aliased.
19. Q3/Q4 have no deals; period objects `"estimated": true`.
20. STLY / SAM / TAM still have no source data.

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
- Admin sync is `BackgroundTasks`; UI polls `/api/admin/vtiger-sync/status`.
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
| App | Gunicorn + Uvicorn **port 8000** (internal) |
| Users DB | PostgreSQL 10 (`galaxy_db`) |
| Deals DB | SQLite `backend/galaxy.db` `crm_deals` on the VM |
| App root | `/home/crmuser/galaxy_db` |
| Frontend | `/home/crmuser/galaxy_db/dashboard/dist` |
| systemd | `galaxy-backend.service` |

Server env file: `/home/crmuser/galaxy_db/backend/.env`  
Nginx: `/etc/nginx/sites-available/galaxy` — static dist, `/api/` → `127.0.0.1:8000`.

Required env (values **only** on the server, never in git):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres users DB (URL-encode `@` `%40`, `!` `%21`) |
| `SECRET_KEY` | JWT signing — must not be the source default |
| `CORS_ORIGINS` | JSON array of frontend origins |
| `VTIGER_URL` | CRM base URL |
| `VTIGER_USERNAME` | CRM user |
| `VTIGER_ACCESS_KEY` | Vtiger My Preferences access key |

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

**Primary:** Admin → **Users** (admins only). Create/update role, employee name, password. Seed will not overwrite those hashes.

**CLI fallback:** `backend/add_user.py` (same bcrypt hashing).

New ICs who appear on the quota roster get a login on next `seed_users` with the default password `Galaxy@123!` only if that username does not already exist.

```bash
sudo -u postgres psql -d galaxy_db -c \
  "SELECT username, full_name, role, is_active FROM users ORDER BY role, username;"
```

---

## 19. How to continue

1. Remaining P0s: public `quota_data.json`, secrets hygiene; production is still HTTP.
2. Confirm Cloud vs CSG annual quotas with finance.
3. Decide how RTM cards should behave after a mid-year transfer (time-weighted quota vs current membership).
4. Alias **Rima Ingle** if she should count.
5. Tests for `assignment_history.py` (overlap, future start, T1 merge).
6. **Update this file** in the same session as any of the above.

When debugging “dashboard ≠ Vtiger report”, recompute from SQLite with §9 before changing code. Raw Vtiger Amount ≠ IC Actuals by design.

---

## 20. Session log

### 2026-09-08 — Admin user management

- Admin → Users: list/create/update logins, role, employee name, password (`GET/POST/PATCH /api/admin/users`).
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
