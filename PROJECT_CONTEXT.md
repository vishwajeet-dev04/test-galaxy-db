# Galaxy Performance Tracker — Project Context

**Last updated:** 2026-10-27  
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
| Frontend | React 19, Vite 6, TypeScript, Tailwind 4, Recharts, lucide-react. **No React Router** — views switch on `drill.view` in `App.tsx`. PWA via `vite-plugin-pwa` (app shell only, `/api` never cached; installable only on HTTPS or localhost). |
| Backend | FastAPI, Pydantic Settings, SQLAlchemy 2, python-jose (JWT HS256, **150 min** access, no refresh token yet), bcrypt |
| Users DB | SQLAlchemy. SQLite locally (`backend/galaxy.db`). Postgres on the Azure VM when `DATABASE_URL` is set. |
| Deals DB | **Always** stdlib sqlite3 via `scripts/deal_store.py` (`backend/galaxy.db` table `crm_deals`). Not Postgres. `GALAXY_DEALS_DB` overrides the path (Docker uses `/app/var/galaxy.db`). |
| Docker | Optional. `docker-compose.yml`: `db` (Postgres 16) + `backend` (Gunicorn, 1 worker) + `web` (nginx SPA + `/api` proxy). See §12b. |
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
│   │   ├── services/           # Business logic (user_service, roster_service, docs_service, …)
│   │   ├── repositories/        # DB / JSON access (user_repo, roster_repo = ic_quotas.json)
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
├── docker/
│   ├── backend-entrypoint.sh   # Seeds config volume, first rebuild, exec gunicorn
│   └── nginx.conf              # web container: SPA, /api → backend:8000, deny /data/
├── backend/Dockerfile          # Context = repo root
├── dashboard/Dockerfile        # node build → nginx
├── docker-compose.yml
├── .env.docker.example         # Copy to .env (Postgres + WEB_PORT). .env is gitignored
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
- Admin RTM change asks when they joined. **They moved** sends `transfer_start` and calls `apply_transfer`. **The old team was wrong** sends `rtm_correction: true` and calls `correct_current_division`, which relabels only the row that covers today (otherwise the latest open row). Dates and closed rows stay. T1 import still dates an RTM difference as a transfer today.
- **Editable past history (2026-10-13):** Admin can rewrite a person's whole history (past teams included) with `{ history: { name, assignments } }` → `roster_service.replace_history` → `assignment_history.validate_history`. Rules: at least one row, every row has a team, dates must parse (no silent "unknown"), end ≥ start, no overlap, **at most one ongoing row**. `division` is reset to the row covering today; quotas are not touched. The rebuild re-tags every deal by close date.

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
| GET | `/api/help/manual` | user | Download `files/docs/Galaxy_Performance_Tracker_User_Manual_1.1.pdf` (any logged-in role). File name lives only in `docs_service.MANUAL_FILENAME`; the Help page reads it from `Content-Disposition`. |
| GET | `/api/admin/status` | admin | Deal counts + quota file exists + latest sync job. Alias kept; Chrome can 403 paths containing `status`. UI uses `GET /quotas` instead. |
| GET | `/api/admin/uploads/status` | admin | Alias of `/status` |
| GET | `/api/admin/quotas` | admin | Roster + `bu_annual_quotas` + `accounts` (login list, up to 100) + `crm` (deal counts + latest sync job). Chrome is not asked for `/users`/`/logins`/`/directory`/`status`. |
| PUT | `/api/admin/quotas` | admin | Full-replace `ic_quotas.json` when `people` is sent. `{ account: { op: create\|update\|delete } }` does login CRUD. `{ sync: true }` starts a full-FY Vtiger job (same as POST `/vtiger-sync`). An RTM change is either `transfer_start` (they moved) or `rtm_correction` (the old team was wrong). `{ history: { name, assignments[] } }` (no `people`) replaces one person's full RTM history (400 invalid rows, 404 unknown name; returns `division` + `assignments`). Then rebuild + `seed_users`. **409** if a sync job is running (roster save and history). |
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
  1. **IC Actuals** — RTM ICs and TLs, topline for everyone (Hrushikesh on topline since 2026-09-25). Since 2026-09-28 BU Heads/AVPs (`RTM_HEAD_TYPES` in `build_quota_data.py`) are excluded, deals and quota alike, via the `counts_for_rtm` flag stamped on individuals and deals; `scoping._is_rtm_deal` reads the same flag. (The RTMs and Business Units **pages** add BU Heads back on top, frontend only, since 2026-10-12; this header number does not.)
  2. **Including Others** — all Closed Won Amount (IC Actuals + DCG/Cloud heads + Self). Hrushikesh included since 2026-09-28 (`build_pipeline_summary` / `scoping._header_pipeline_cr` must stay in sync).
  3. **BU donut** — Amount by category from **RTM-team IC/TL deals only** (including Hrushikesh/GeoX; BU Heads' own deals out). Equals IC Actuals in total.
- **Multipliers** apply to deal `quota_credit` only, never IC actuals.
- **RTM codes:** `S1`, `S2`, `CB`, `GB`, `South`, `DataCentre`, `GeoX`. `Geo X` normalizes to `GeoX`. `DataCentre` is Ajay Patodia’s RTM (distinct from BU `DCG`); his login also sees South via `rollup_divisions`.
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

Only people in `ic_quotas.json` whose **as-of-today** `division` is S1/S2/CB/GB/South/DataCentre/GeoX roll into RTM **quota** totals.

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

- Module: `scripts/assignment_history.py` — `covers`, `current_division`, `division_on`, `apply_transfer`, `validate_assignments`, `validate_history` (Admin full rewrite; one ongoing row).
- Admin UI: effective date when RTM changes; expandable history row is an editor (`components/AssignmentHistoryEditor.tsx`): add/remove teams, start/end dates, inline errors, Save history / Cancel. Locked while that person has an unsaved RTM change or is not saved yet. Saving patches only that row in the roster state, so unsaved quota edits on other rows survive.
- Backend: `services/roster_service.py` (history replace, sync check, `rebuild_dashboard`) + `repositories/roster_repo.py` (atomic JSON read/write). `routers/admin.py` delegates its old `_load_json` / `_atomic_write_json` / `_run_parse` to them.
- Employees detail: Current RTM + history table.
- Team lists: as-of today. Deal RTM: close date.

---

## 11. Dashboard pages and JSON keys

`build_quota_data.py` must keep emitting shapes in `dashboard/src/types.ts`.

| Page | JSON | Notes |
|---|---|---|
| Overview | `kpis`, `period_metrics`, `rtm_divisions`, `top_attainers`, `at_risk_ics`, `pipeline.summary` | Period cards: Q1, Q2, H1 / Q3, Q4, H2 in a 1/2/3-column grid; the Annual card is full width below on every screen size. |
| RTMs | `rtm_divisions` / `division_aggregates` + `pipeline.all_deals` | S1 → S2 → CB → GB → South → DataCentre → GeoX. Cards and the RTM table **include BU Heads** (deals + quota, see the row below). Card closed-deal count follows H1/H2 from `all_deals`. Status flag is recomputed from the combined H1 attainment (`statusFor`, same 30/50 thresholds as `_status_flag`). |
| Business Units | `bu_level`, `rtm_by_bu` + `pipeline.all_deals` | Annual from Admin; H1/Q1 derived from IC mix. **Actuals = RTM-team deals only** (`rtm_division` in the seven RTMs). Deals led by non-RTM people (Jitesh/Cloud, Self) are left out. In the API the BU total = RTM total = header IC actuals (BU Heads out); filter lives in `build_quota_data.compute_actuals_by_cat_div` + `build_bu_level` and `scoping._rebuild_bu` / `_rebuild_rtm_by_bu` (`_is_rtm_deal`). The page then adds BU Head deals on top (see below). Clicking a card opens `BUDetailView` (lazy, `drill.bu`): Total Value card (= the BU card) + Total Deals card with per-RTM **deal-count chips** (`LegendPill`, fixed colour per RTM; clicking one filters the deals table, again clears it; built from the API-scoped deals, so non-admins only see their own RTM), a "{BU} — RTM by Division" distribution table (Q1, Q2, H1, Q3, Q4, H2, Annual Quota, Annual Actuals, Total row; always full year, from counted deals via `rtmQuarterBreakdown` + `rtm_by_bu` annual quota), and a deals table (team + BU Head deals) with search, RTM filter, sort and 25-row paging. In the deals table the Opportunity name opens that deal's **Account** page and the Brand cell opens the **Brand** page (`drill.deal` = opportunity number; `useDealHighlight` scrolls to that `DealRow` under "Closed deals" and highlights it ~3 s, reduced-motion aware). Account/Brand keys use the same `"Unknown"` / `"Other"` fallbacks as `build_accounts` / `build_brands` (all 474 local deals resolve). Led by is plain text. Period buttons share `DashboardContext.period`. |
| BU Heads on RTM/BU pages | `pipeline.all_deals` + `individuals` | Client 2026-10-12: BU Heads' values go **into** the team figures on the RTMs and Business Units pages only. `utils/deals.ts`: `rtmTeamTotal` = API row + BU Head deals (`counts_for_rtm === false`, by `rtm_division`) + BU Head period quota (individuals with `counts_for_rtm === false`, as-of-today `division`); `buTeamTotal` = `bu_level` + BU Head deals by `bu`, quota unchanged (BU quotas are per BU/RTM from Admin). **Header IC Actuals, Overview, Employees team headers, Leaderboard and the backend stay excluding BU Heads**, so they still match the client Excel; the RTM card therefore no longer equals the Employees team header (by choice). H1 local: S1 62.44, South 23.51, GeoX 6.11 / quota 15.0, GB 8.22; header stays 158.78. TL/user scopes contain no heads, so nothing is added for them. |
| Accounts / Brands | nested `deals`, `by_bu`, `gp_pct` | |
| Leaders | `leaders_dashboard` | Header + top deals = personal Led-By (alias match). Team Roster = as-of-today ICs in `leader_roster.json` `rollup_divisions` (Ishwari → S1, Ajay → DataCentre + South). `team_size` is member count. No leader is selected on load: the purple banner shows all-leaders totals (Leaders, H1 Actuals = header IC Actuals, Topline, Team Bottomline). Clicking a card switches the banner to that leader (Team, personal H1 Actuals, Topline, Bottomline) and opens the detail below; **Clear** in the banner or clicking the same card again resets it. |
| Employees | `individuals` + `pipeline.closed_deals` + `assignments` + `rtm_divisions` | Grouped by as-of-today division. ICs **and TLs** listed (TL badge); AVP / BU Head / Topline / Bottomline hidden (Leaders page). Team header totals = the RTM card for that division (not a re-sum of the list). Plus a **Self** group (`NON_RTM_GROUPS` in `EmployeesView.tsx`) shown after the RTMs with a "Not an RTM" badge. It shows everyone with `division: "Self"` whatever their persona (today Yusufali Petiwala, Topline), and its totals are the sum of its members. Self is **not** an RTM: not in `rtm_divisions`, RTM cards or header IC actuals. The period buttons drive actuals **and** closed accounts/deals (column, group header counts, "With Closed Deals", account search, detail panel) via `utils/deals.pipelineForPeriod` on `pipeline.closed_deals` by `quarter`. |
| Leaderboard | `individuals` period attainment | |
| Help | none (static) | Sidebar for **every** role. Download user manual via `GET /api/help/manual`. FAQ is static copy from the manual 1.1 PDF §6 (`content/helpFaq.ts`), with screen names corrected to the app. |
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

### 12b. Run with Docker (local or VM)

The Docker stack does not replace the dev flow above (8080 + Vite) or the systemd deploy (§16). It is a third way to run the same code.

```powershell
cd c:\Projects\Galaxy\Temp_Galaxy\galaxy_db
copy .env.docker.example .env      # set POSTGRES_PASSWORD; never commit .env
# backend/.env must exist with SECRET_KEY (+ VTIGER_* for Sync). Its DATABASE_URL is ignored in Docker.
docker compose up -d --build
# → http://localhost:8088   (WEB_PORT); log in, then Admin → Sync to fill deals
docker compose logs -f backend
docker compose down                # keeps volumes; add -v only to wipe all data
```

| Service | What runs | Notes |
|---|---|---|
| `db` | `postgres:16-alpine` | Users DB. Healthcheck `pg_isready`; backend waits for it. |
| `backend` | Gunicorn + UvicornWorker, **1 worker**, `--timeout 600` | One worker because the login limiter and the sync thread are in-process and SQLite/JSON are written in place. `DATABASE_URL` is set by compose as `postgresql+psycopg2://…@db` (explicit driver: SQLAlchemy ≥ 2.1 maps bare `postgresql://` to psycopg 3, which is not installed). |
| `web` | nginx 1.27 with `dashboard/dist` | `/api/` → `backend:8000`, `X-Forwarded-For` **overwritten** with `$remote_addr` (the limiter trusts the first XFF value), `/data/` denied, SPA fallback, `index.html` no-cache, `/assets/` immutable. |

Volumes (named, survive `down` and rebuilds):

| Volume | Mount | Back up? |
|---|---|---|
| `pgdata` | Postgres data | **Yes** — users and password hashes |
| `deals` | `/app/var` (`galaxy.db` + `-wal`/`-shm`) | **Yes** — `crm_deals`, `crm_sync_jobs`. Directory mount because SQLite WAL needs sibling files. |
| `config` | `/app/config` | **Yes** — Admin-edited `ic_quotas.json`, `quota_rules.json`. Directory mount because `os.replace` fails on single-file bind mounts. |
| `quota_data` | `/app/backend/data` | No — regenerated by Sync / Rebuild |

Entrypoint (`docker/backend-entrypoint.sh`) on every start: copies the **code-owned** config (`pipeline_aliases`, `leader_roster`, `dept_to_rtm`, `extracted_v1`) from the image so git changes land; copies `ic_quotas.json` / `quota_rules.json` **only if missing** so Admin edits survive redeploys. To ship a roster change from git into Docker, edit it in Admin (or `docker compose cp` the file into the volume). If `quota_data.json` is missing it runs one `build_quota_data.build()`; a failure is logged and startup continues.

`files/` is baked into the image (read-only archives, T1 template, manual PDF). Images never contain `.env`, `*.db`, or `quota_data.json` (`.dockerignore`).

Backups (from the repo folder):

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > users_$(date +%F).sql
docker compose cp backend:/app/var/galaxy.db deals_$(date +%F).db
docker compose cp backend:/app/config/ic_quotas.json ic_quotas_$(date +%F).json
docker compose cp backend:/app/config/quota_rules.json quota_rules_$(date +%F).json
```

---

## 13. Known issues

Update this list when you fix or add defects. Ordered by severity.

### Product / ops (open by design of this handover)

1. **T1 import full-replaces the roster.** Names missing from the sheet (and their history) are deleted. An RTM mismatch is treated as a transfer dated **today** (cannot distinguish a data correction from a move).
2. **After a transfer, RTM attainment mixes two clocks.** Quotas = as-of-today members; actuals = deal close-date RTM. A Sep S1→GB move leaves Q1 deals on S1 but removes that IC’s quota from S1. Employees groups people by today; each person row shows their **full** IC actuals, while the team header uses the RTM card (close-date RTM), so after a transfer the rows under a team need not add up to its header.
3. **Production is HTTP-only** (Galaxy Nginx **8081**; Apache **80** is Vtiger). Login and JWT in cleartext. TLS is an ops change, not in this code drop. It also blocks the PWA: browsers only register the service worker / offer "Install" on HTTPS (or localhost). Open Galaxy at `:8081` only — HTML 403s are Apache, not FastAPI.
4. **Leaders header is personal Led-By, not a team rollup of actuals.** Top deals stay that person’s Closed Won. **Team Roster** is as-of-today ICs in `rollup_divisions` (Ajay → DataCentre + South; `bu` stays DCG). Cloud/CSN heads may have an empty roster because those codes are not RTM divisions. Date-filter `_rebuild_leaders` alias-matches Led By (Ishwari Santosh Kadam → Ishwari Kadam). Leaders with no own deals (currently Dipti Karpe, Vineet Gadia, Rocky Braganza, all with 0 Led-By deals in Vtiger) show a "no Closed Won deals of their own" banner on the detail page and "No own deals" on the card instead of bare zeros (client decision 2026-09-28: keep personal figures).

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
14. Q3/Q4 Overview cards show when RTM actuals > 0 (same `show_attainment` rule as Q2/H2). Individual Q3/Q4 quotas may still be half of H2 (`estimated` on IC period objects).
15. STLY / SAM / TAM still have no source data.
16. **`requirements.txt` is unpinned** (`sqlalchemy>=2.0.0` etc.). SQLAlchemy 2.1 changed the default Postgres driver to psycopg 3; a fresh non-Docker install with `DATABASE_URL=postgresql://…` would fail with `No module named 'psycopg'`. Use `postgresql+psycopg2://…` in any new `.env`, or pin versions.

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
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access JWT lifetime (default **150** = 2.5 h, client decision 2026-09-30). An explicit value in the server `.env` overrides the default. |
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

### Switching the VM to Docker (not done yet)

The live server still runs systemd + host Nginx + host Postgres 10. Docker is ready for it but the switch is an ops decision. Checklist:

1. **OS:** Ubuntu 18.04 is EOL; current Docker Engine / Compose v2 packages do not support it. Upgrade the VM (or a new 22.04/24.04 VM) first, or pin an older Docker release.
2. **Prepare:** `git pull` the deploy branch into `/home/crmuser/galaxy_db`; create `.env` from `.env.docker.example` (strong `POSTGRES_PASSWORD`); keep `backend/.env` (`SECRET_KEY`, `VTIGER_*`). Set `WEB_PORT` to the port Galaxy is served on today (Nginx **8081**; Apache on 80 is Vtiger — do not take 80).
3. **Users:** `pg_dump` the host DB (`sudo -u postgres pg_dump galaxy_db > users.sql`), `docker compose up -d db`, then `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < users.sql`.
4. **Deals + roster:** `docker compose up -d --build backend` once (creates volumes), then `docker compose stop backend`, `docker compose cp backend/galaxy.db backend:/app/var/galaxy.db`, `docker compose cp config/ic_quotas.json backend:/app/config/ic_quotas.json`, same for `quota_rules.json`. `docker cp` writes files as root, so hand them to the app user: `docker compose run --rm --no-deps --user root --entrypoint chown backend -R galaxy:galaxy /app/var /app/config`. Start backend; the entrypoint will not overwrite them.
5. **Cut over:** `sudo systemctl stop galaxy-backend` and disable the Galaxy Nginx site (free the port), then `docker compose up -d --build`. Check `/api/health`, log in, run Admin → Sync.
6. **Redeploy later:** `git pull && docker compose up -d --build`.
7. **Rollback:** `docker compose down` (volumes kept), re-enable the Nginx site, `sudo systemctl start galaxy-backend`. Host Postgres and `backend/galaxy.db` are untouched by steps 3–4, so they are still the pre-switch data.

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

### 2026-10-27 — DataCentre RTM for Ajay Patodia

- Client: create RTM under Data Centre for Ajay; his numbers must not appear under South; do not touch BU DCG; Ajay login keeps South access.
- New RTM code `DataCentre` (after South in order). Ajay `ic_quotas` + assignment → `DataCentre` (BU Head, quotas 0). `leader_roster`: `division` DataCentre, `bu` DCG unchanged, `rollup_divisions` / `fallback_divisions` = DataCentre + South.
- Registered in `RTM_DIVISIONS` / frontend order lists; `bu_annual_quotas` and build defaults get `DataCentre: 0` (no South reallocation).
- After deploy: Rebuild dashboard; if Docker config volume already seeded, copy updated roster JSON into the volume (or Admin correction).

### 2026-10-16 — Overview Q3/Q4 "No data yet" with real deals

- Cause: `build_period_metrics` and `scoping._rebuild_period_metrics` hardcoded `show_att=False` for Q3/Q4 (from when those quarters had no deals). Overview treats that as `quotaOnly` → "No data yet". `build_grand_total` and the scoping grand loop also omitted q3/q4, so even after flipping the flag the admin payload had zero IC totals for those cards.
- Fix: include q3/q4 in grand totals; set `show_attainment` from actuals > 0 (same as Q2/H2). No frontend change.
- After deploy: **Admin → Rebuild dashboard** so `quota_data.json` regenerates.

### 2026-10-15 — Blank page on Help after deploy

- Cause: Help and BU detail are `React.lazy` chunks. A tab (or a browser holding an old `index.html` from the pre-Docker Nginx) asks for chunk names the new image no longer has → 404 → the rejected import unmounted the whole tree (no error boundary) → empty page.
- `utils/chunkReload.ts`: `vite:preloadError` listener reloads once (30 s guard in `sessionStorage`, so a really missing chunk cannot loop).
- `components/ErrorBoundary.tsx`: root boundary in `main.tsx` (full-screen card) and a page boundary around the view area in `App.tsx` (`resetKey` = drill state, so navigating clears it without remounting healthy pages). Chunk errors show "Galaxy has been updated — Reload"; other crashes show Reload + Try again and log `ui_crash` with the view.
- Immediate workaround for users still on an old copy: Ctrl+Shift+R.

### 2026-10-14 — User manual 1.1

- Replaced `files/docs/Galaxy_Sales_Performance_User_Manual_v5.pdf` with `Galaxy_Performance_Tracker_User_Manual_1.1.pdf` (7.1 MB; cover page still says "Version: 1.0"). `docs_service.MANUAL_FILENAME` updated; `HelpView` no longer hard-codes the name (reads `Content-Disposition`).
- `helpFaq.ts` synced to manual §6: new Qs on ₹0.00 Bottomline, RTM move, session expiry (2.5 h), hidden Leaders page; reworded three-totals, BU vs RTM, annual ≠ H1+H2. The PDF mentions a "Forgot Password" link and an "Admin → Aliases" screen that do not exist — FAQ points to Admin / Admin → Users instead.
- `backend/Dockerfile` strips CR from the entrypoint: a Windows working copy had turned it CRLF and the container crash-looped with `exec … no such file or directory`.
- Docker: `files/` is baked into the backend image, so a manual change needs `docker compose up -d --build`.

### 2026-10-13 — PWA (installable app)

- `vite-plugin-pwa` (`registerType: "prompt"`). Workbox precaches the app shell only; `/api/` and `/data/` are excluded from caching and navigation fallback because API data is role-scoped and changes on every Sync. Google Fonts and `/avatars/` are runtime-cached.
- Manifest and `<meta name="theme-color">` read `--color-galaxy-navy` / `--color-galaxy-surface` from `src/index.css` in `vite.config.ts` (no duplicated hex).
- Icons in `dashboard/public/` (`pwa-*.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`) generated from the red "G" mark, source `dashboard/pwa-icon-source.png`. Regenerate: `npx @vite-pwa/assets-generator --preset minimal-2023 <copy of source in public/>`.
- `components/PwaStatus.tsx` (mounted in `main.tsx`, outside the auth gate): "new version" toast with Reload (checks hourly) and an offline banner (`hooks/useOnlineStatus.ts`).
- `docker/nginx.conf`: `/sw.js` and `/manifest.webmanifest` served `no-cache`, `=404` instead of the SPA fallback.
- Verified: build OK; Docker `web` on :8088 serves sw.js / manifest with the right MIME + `no-cache`. Browser install check not completed. **Production needs HTTPS before phones can install it** (known issue 3).

### 2026-10-13 — Docker (compose: db + backend + web)

- Added `backend/Dockerfile`, `dashboard/Dockerfile`, `docker/nginx.conf`, `docker/backend-entrypoint.sh`, `docker-compose.yml`, `.dockerignore`, `.env.docker.example`, `.gitattributes` (`*.sh` LF). Root `.env` gitignored.
- `scripts/deal_store.py`: `GALAXY_DEALS_DB` env overrides the deals SQLite path; default unchanged (`backend/galaxy.db`).
- Found while verifying: SQLAlchemy 2.1 maps bare `postgresql://` to psycopg 3 → compose uses `postgresql+psycopg2://` (known issue 16).
- Verified locally (Docker Desktop): all three containers healthy; `/api/health` 200 via `:8088`; SPA + deep-link fallback 200; `/data/` 403; 58 users seeded into Postgres; config volume seeded; first-start rebuild wrote `quota_data.json`; 11th failed login → 429 even with a different spoofed `X-Forwarded-For` per request.
- Not changed: dev flow (8080 + Vite), systemd deploy. VM switch checklist in §16.

### 2026-10-13 — BU detail: RTM chips and deal popup

- Client: remove the "{BU} by RTM" table; show RTM deal counts on the Total Deals card like the donut legend pills (count only, no %); Led by no longer clickable; Opportunity opens the deal.
- `components/LegendPill.tsx` extracted from `DonutChart` (now shared; focus ring, `aria-pressed`, `motion-reduce`).
- **Popup replaced by links (same day, client):** a deal popup was built first, then removed at the client's request. Opportunity → Account page, Brand → Brand page, with the deal scrolled to and highlighted (`DrillState.deal`, `hooks/useDealHighlight.ts`, `DealRow` `highlighted` + `data-deal`). The "All accounts" / "All brands" back buttons clear `deal` because `onDrill` with a `view` replaces the whole drill.
- Verified on local data: DCG H1 chips S1 15, S2 14, CB 12, South 43, GeoX 2 = 86 (= card). No backend change; scoping is the existing `scope_quota_data`. Deploy: copy the new `dashboard/dist`.

### 2026-10-13 — RTM distribution back on the BU page; editable past history

- Client asked for the old "RTM by Division" distribution (removed with the BU detail page) and for Admin to map a person's **past** teams, not only forward transfers.
- **BU detail:** distribution table added between the RTM table and the deals table (see §11). Uses the same counted deals as the cards (team + BU Heads).
- **History editor:** see §5.3 / §10.3. New op on the existing `PUT /api/admin/quotas` (Chrome blocks new admin paths). Verified on a temp roster copy: a 2-row history (GB until 2026-06-30, CB from 2026-07-01) re-tagged Jay Rushi's Q1 deals to GB and Q2 deals to CB; overlap, two ongoing rows, end before start, bad date, blank team and empty list → 400; unknown name → 404. Real roster untouched.
- **"Taking lots of time" (same day):** measured: a history save is ~1 s server-side (rebuild 0.3 s, `seed_users` 0.07 s, dashboard reload 0.28 s). It *looked* slow because the confirmation is in the page banner far above the roster and the Save button greys out after saving. The editor now shows an inline "Saved. Dashboard rebuilt" note, the button reads **Saved**, and an amber warning appears when every team has an end date on or before today (no current team). The editor no longer remounts on save (draft resyncs from props) so the note survives.
- Deploy: backend (`app/services/roster_service.py`, `app/repositories/roster_repo.py`, `app/routers/admin.py`, `scripts/assignment_history.py`) + new `dashboard/dist`.

### 2026-10-12 — Employees period, BU Head line, BU detail page

- Client review: (1) Employees closed accounts did not follow the period; (2) BU Heads' own deals should show on RTM/BU cards; (3) a BU page with RTM breakup and every deal.
- **Employees:** closed accounts, deal counts, the "With Closed Deals" filter, account search and the detail panel now follow the Q1…Annual buttons (`pipelineForPeriod`). Before, only the actuals column changed.
- **BU Head line:** client chose to keep card totals as they are and show BU Head deals on a separate line with "Total incl. BU Head". The 2026-09-28 exclusion (`counts_for_rtm`) is **not** reverted: header IC Actuals, RTM and BU totals are unchanged. Local data, H1: S1 + Ishwari Kadam 6.27, South + Ajay Patodia 10.19, GeoX + Sanjeev Kohli 2.24, GB + Yogesh Bhatia 0.05. RTM cards' closed-deal count now follows H1/H2.
- **BU detail page:** new lazy `views/BUDetailView.tsx` replaces the inline "RTM by Division" table. Verified locally: every BU Total Value equals its card, and the RTM table sums to the card (CSN/CSG differ only at the 4th decimal).
- Frontend only, no backend or JSON change; uses `pipeline.all_deals`, `quarter`, `counts_for_rtm` already in the API. Shared rules in `dashboard/src/utils/deals.ts`; `components/BuHeadNote.tsx`; `PerformanceCard` gained an optional `footnote`.
- **Layout fix (same day):** `PerformanceCard` is a Tailwind `@container`; the amount sizes by the card's own width (`text-2xl @3xs:text-3xl @2xs:text-4xl`) so it never spills out of a narrow cell, and cards fill their grid row (`h-full`, footnote pinned to the bottom). RTM grid is at most **3 per row** (`sm:2 xl:3`); BU cards are equal height with the BU Head line at the bottom; the Overview Annual card fills both rows on 2xl. Employees team tables and the RTM table scroll sideways on phones;   team headers show amount + % instead of the bar below `sm`. No number changes.
- **Client changed the BU Head choice (same day):** no separate BU Head section; their deals **and** quota are added into the team figures on the RTMs and Business Units pages (cards, tables, BU detail). Header IC Actuals, Overview and Employees unchanged (client: cards only). `BuHeadNote.tsx` and the BU detail "Show BU Head deals" toggle / BU Head column were removed; logic is `rtmTeamTotal` / `buTeamTotal` in `utils/deals.ts`. Backend `counts_for_rtm` exclusion is **not** reverted. Verified H1: every card equals its team + BU Head deal sum (CSN/CSG differ only at the 4th decimal).
- **Leaders banner + Annual card (same day):** the Leaders banner follows the clicked leader with a Clear button (`ui.btnOnDark`), nothing selected by default. Overview Annual card moved from the narrow 4th column (curved 3px left border, empty space) to a full-width card below Q1–H2, same style as the others.
- **Overview blank space (same day):** `PerformanceCard` no longer forces a min height on "No data yet" cards (the Q3/Q4/H2 row is short; next to a full card the grid still stretches them). New `wide` prop: the Annual card lays out in three columns from `@2xl` (amount · trend + deals · attainment progress bar, no elapsed marker per client) and stacks on phones.
- Deploy: copy the new `dashboard/dist` only.

### 2026-10-07 — Reporting lines written on the roster

Office Chrome blocks the Admin save (HTML block page), so `reporting_manager` was set in `ic_quotas.json` instead of through the roster screen. The client can still change a row later from Admin.

- **CB:** Anupam Deshmukh and Meeta Sharma → Jimesh Shah. Everyone else in CB, including Jimesh Shah and Darshana Patil, → Vineet Gadia. Vineet → Sanjay Patodia. Darshana stays on the 1 Apr 2026 move from S1 to CB.
- **Cloud:** Jitesh Rajput → Sanjay Patodia.
- **GB:** every member → Yogesh Bhatia. Yogesh → Anoop Paidunghat.
- **GeoX:** every member → Sanjeev Kohli. Sanjeev → Sanjay Patodia.
- **S1:** Chirag Palande, Raj Matondkar, Richa Tiwari → Prashant Ddugu. Prashant, Pratik Kadam, Riya Bhatt, Tasneem K → Ishwari Kadam. Ishwari → Sanjay Patodia.
- **S2:** every member → Dipti Karpe. Dipti → Sanjay Patodia.
- **South:** every member → Ramakrishna Koparapu. Ramakrishna → Ajay Patodia. Ajay → Sanjay Patodia.
- Yusufali Petiwala (Self) stays blank. Atharva Karpe is stored in CB, so he reports to Vineet.

### 2026-10-07 — Roster asks when they joined a new RTM

- Changing RTM/BU no longer shows only an effective date. The row asks **When did they join {team}?** Nothing is pre-selected, so Save cannot invent today's date.
- **They moved** still calls `apply_transfer`: the previous row ends the day before, and deals follow the close date.
- **The old team was wrong** sends `rtm_correction` and `correct_current_division` relabels only the assignment that covers today (or the latest open row). Start and end dates stay, and closed past rows stay. This is the in-place fix used for a bad label such as Ajay's DCG.
- T1 import is unchanged: an RTM difference on import is still a transfer dated today.

### 2026-10-06 — Team Lead reporting line (Prashant, Jimesh)

- **Roster:** `reporting_manager` was already on `ic_quotas.json` and copied to `individual.team_lead` at build. Other managers are unchanged. Set only: Prashant Ddugu → Ishwari Kadam; Chirag Palande, Raj Matondkar, Richa Tiwari → Prashant Ddugu; Jimesh Shah → Vineet Gadia; Meeta Sharma → Jimesh Shah (she was Vineet). Anupam Deshmukh already reports to Jimesh. Tasneem K, Riya Bhatt and Pratik stay blank, so they stay direct S1 rows.
- **TL login:** in `_allowed_names_for_user`, a `tl` who has at least one person with `team_lead` matching them sees only self plus those people, then `_drop_leaders_for_tl`. The rest of the RTM is not added. A TL with nobody reporting to them still gets today's division scope (Sana, Ramakrishna). Ishwari (leader) still sees all of S1. Prashant: himself, Chirag, Raj, Richa. Jimesh: himself, Anupam, Meeta. Every existing screen uses this scope.
- **Employees:** inside a division, a person whose `team_lead` is another visible row is nested under them. The closed row is the sum of those people (actuals, quota, attainment) for the selected period, not the TL's own numbers. Division headers stay the RTM card totals. Quota Roster has a Reports to dropdown (roster names); search still filters the table only.
- Production: pull, rebuild (`python scripts/build_quota_data.py`), restart the backend, deploy `dashboard/dist`.

### 2026-10-06 — Leader BU table is their RTM only; Ajay Patodia is South

- **BU "RTM by Division":** `_rebuild_rtm_by_bu` used to copy every RTM from the full-org template, so a scoped login (Ishwari, S1) saw S2/CB/South/GB/GeoX as ₹0.00 rows plus those teams' annual quotas. It now keeps only RTM divisions of the people already on the view. The leader's own row still shows when that BU is ₹0 for them. Admin and CEO still have all six because their people list does. BU cards are unchanged (company BU quota on the card).
- **Ajay Patodia (superseded 2026-10-27):** corrected in place to `South`; later moved to RTM `DataCentre` (see 2026-10-27 session log). BU DCG unchanged; South kept in `rollup_divisions`.
- Production: pull, rebuild (`python scripts/build_quota_data.py`), restart the backend. No frontend change.

### 2026-09-30 — Session length 2.5 h + auto sign-out on expiry

- **Token lifetime:** `access_token_expire_minutes` default 30 → **150** (client asked for 2.5 hours; users were signed out mid-work). Still no refresh token: after 150 minutes the user must sign in again. Refresh tokens (hashed, server-side) remain the proper follow-up per the rules.
- **Auto sign-out:** previously only `useQuotaData` logged out on a JWT 401, and page switches reuse loaded data, so an expired session left the dashboard on screen until the next date change. Now `AuthContext` reads the JWT `exp` and signs out at that moment (plus a check on window focus / tab visibility for laptops that slept). `apiFetch` fires `galaxy:session-expired` for any call that sent a token and got a JSON 401 (a login 401 is a wrong password, not an expiry); the two blob downloads (Help manual, Admin template) call `notifySessionExpired` themselves. The login page shows "Your session expired. Please sign in again." Manual Sign out shows no notice.
- **Login page:** show/hide password toggle (eye button) on the password field.
- Production: set `ACCESS_TOKEN_EXPIRE_MINUTES=150` in the server `backend/.env` if that file sets it (it overrides the code default), pull, restart `galaxy-backend`, deploy the new `dashboard/dist`.

### 2026-09-28 — Friday work restored + small Cr decimals + Leaders "no own deals"

- **Restore:** 8 working files had gone back to pre-Friday versions on disk (likely an editor/checkpoint restore). They were restored from commit `d0201f4` (pushed to Bitbucket; it holds all 2026-09-25 work): `BUSINESS_SUMMARY.md`, `PROJECT_CONTEXT.md`, `scoping.py`, `build_quota_data.py`, `ic_quotas.json`, `pipeline_aliases.json`, `EmployeesView.tsx`, `AdminUploadsView.tsx`. The reverted copies are backed up under `%TEMP%\galaxy_backup_20260928`.
- **Cr decimals:** `formatCr` / `formatCrDisplay` share a `crNumber` helper. A non-zero value that would show `0.00` widens to up to 4 decimals (Jitesh ₹0.0015 Cr topline / ₹0.0008 Cr BL). The `QuotaVsActualChart` tooltip now uses `formatCr`.
- **Leaders no own deals:** Dipti Karpe showed zeros because Vtiger has no deals led by her (all 474 deals checked; the 12 "Karpe" deals are Atharva Karpe, CB). Same for Vineet Gadia and Rocky Braganza. The tiles stay personal, as the client chose. `LeadersView` shows an info banner, "No deals led by {name} in this period" in Top Team Deals, and "No own deals" on the card when `pipeline.deal_count === 0`.
- **Including Others includes Hrushikesh:** the header "IC Actuals Including Others" used to drop Hrushikesh's deals, left over from when he was on bottomline. Since he moved to topline (2026-09-25), that made the tile smaller than IC Actuals + non-RTM sellers. `build_pipeline_summary` and `scoping._header_pipeline_cr` now count every deal with a Led By. This Year: **174.73 → 178.60** = IC Actuals 167.33 + DCG 10.19 + Self 1.08 + Cloud 0.0015. The pipeline deal count and pipeline bottomline also include his deals now; Accounts/Brands share % use the new total. Self (Yusufali) was already counted.
- **Roster titles:** the roster `type` (shown as `persona` under each name) no longer uses the old Excel measure labels "Topline"/"Bottomline". Ajay Patodia, Sanjeev Kohli, Ishwari Kadam and Jitesh Rajput are now **BU Head** (like Yogesh Bhatia); Yusufali Petiwala is **Self**. The Admin Type dropdown offers `IC, TL, AVP, BU Head, BU Head / TL, Self, Other`. Backend `LEADER_TYPES` still accept Topline/Bottomline for old data. Label-only: no numbers change, and existing logins keep their role (roster seeding is insert-only).
- **Dipti Karpe and Vineet Gadia on the quota roster:** they were only in `leader_roster.json`, so the RTM Employee Breakdown (which lists `ic_quotas.json` people) had no S2/CB head. Added both as **BU Head**, all quotas 0, reporting to Sanjay Patodia (per "Sales Team - FY 26-27" sheet): Dipti in S2, Vineet in CB. Dipti's name is now single-spaced everywhere: roster key, `leader_roster.json`, and `pipeline_aliases.json` now maps the CRM spelling `"Dipti  Karpe"` → `"Dipti Karpe"` (alias lookup is exact; `_names_match` already ignored whitespace). S2/CB actuals and quotas unchanged; header Employees 48 → 50; leader Team Rosters still omit the leader.
- **Avatars:** `getAvatarUrl` (`dashboard/src/utils/avatars.ts`) no longer falls back to a unique first-name match. That fallback gave Ajay Jajodia (CB) Ajay Patodia's photo; he was the only person relying on it, and now shows initials. Name variants belong in `ALIASES`.
- **BU Heads out of RTM actuals:** the Employees page S1 group showed 62.44 Cr but its visible rows summed to 56.18 (client Excel: ₹56,17,59,911.15). The gap was Ishwari Kadam's own deals: RTM totals counted BU Heads, while the Employees page hides them. Now a roster Type in `RTM_HEAD_TYPES` (`AVP`, `BU Head`, `BU Head / TL`, legacy `Topline`/`Bottomline`) sets `counts_for_rtm: false`, and those people's deals **and quota** are skipped in RTM, BU, period closed counts, the BU quota mix, top attainers and at-risk (build and scoping). They keep personal actuals (Leaders page, own drill-down) and still count in Including Others. The RTM Employee Breakdown shows "Not counted in RTM total" on those rows. `_deal_ic_cr` now sums `amount_inr` / 1e7 (exact) instead of 4-dp `amount_cr`, and scoping BU rebuilds use it. This Year H1: S1 62.44 → **56.176** (matches the CSV to the rupee), GeoX 6.11 → **3.87** with quota 15.0 → **7.5** (Sanjeev's 7.5 quota removed), GB 16.46 → **16.41**; header IC Actuals 167.33 → **158.78**, H1 quota 547.5 → **540.0**, attainment 30.6% → **29.4%**; BU total = 158.78; Including Others 178.60 unchanged. Q1 only: IC 98.53, Including Others 117.51.
- **Leaders banner "H1 Actuals":** now `kpis.header_ic_actuals` (same as the header IC Actuals tile, already scoped per login) instead of `header_pipeline_cr` (Including Others). Admin sees 158.78, Ishwari's login 56.18 (was 178.60 / 62.44).
- **Role-based views:** the Leaders menu item, the Leaders view (a restored `sessionStorage` view falls back to Overview) and the header "IC Actuals Including Others" card are hidden for roles `user` and `tl` via `AuthContext.canSeeLeaders`. Their scopes contain no BU Heads/leaders, so Including Others would just repeat IC Actuals. Leader, admin and CEO unchanged.
- **TL data scope excludes BU Heads/leaders:** `scoping._allowed_names_for_user` still expands a `tl` login to their division(s), then `_drop_leaders_for_tl` removes anyone with `counts_for_rtm == False` and anyone in `leaders_dashboard` / `leader_roster.json` (own name always kept). Applies to every TL. Result on This Year: `prashantd` 9 to 8 people (Ishwari removed), `sanab` 15 to 14 (Yogesh Bhatia removed), `ramakrishnak` unchanged at 5. IC Actuals are unchanged (56.18 / 16.41 / 13.32) and Including Others now equals IC Actuals for each.
- Production: copy the new `dashboard/dist`, `scripts/build_quota_data.py` and `backend/app/scoping.py`, rebuild, restart Gunicorn. Add Dipti (S2) and Vineet (CB) as BU Head rows in Admin > Quota Roster on `:8081`, and apply the `leader_roster.json` / `pipeline_aliases.json` name fix there. Change the five roster Types in Admin > Quota Roster on `:8081` (or copy `config/ic_quotas.json` only if production has no roster edits of its own). Commit soon so the working tree matches the repo.

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
- Roster now = as-of-today ICs whose division is in `leader_roster.json` `rollup_divisions` (Ishwari → S1, Ajay → DataCentre + South). Leader themselves omitted. `team_size` is that count. Header actuals / top deals stay personal Led-By.
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
