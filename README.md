# Galaxy Performance Tracker

Role-based sales performance dashboard for Galaxy Office Automation — quota, pipeline, accounts, and team attainment.

## Architecture

```
galaxy/
  backend/          FastAPI + SQLite (auth, scoped data API, admin uploads)
  dashboard/        React + Vite UI (unchanged analytics UX)
  scripts/          Excel → JSON parser
  files/            Source Excel workbooks
  data/             Mapping / target CSVs
```

## Roles

| Role | Usernames | Access |
|------|-----------|--------|
| **CEO** | `sanjayp` (`sanjay@goapl.com`) | Everything (no file uploads) |
| **Admin** | `dilips`, `asifb`, `dharashinib`, `praveens` | Everything + file uploads |
| **User** | `{firstname}{last_initial}` e.g. `richat` | Own / team numbers, accounts, employees only |

Default password for all accounts: `Galaxy@123!`

## Quick Start

### macOS / Linux

```bash
# 1. Python deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# 2. Generate dashboard JSON (first time / after new Excel files)
python3 scripts/parse_excel.py

# 3. API server — seeds users automatically on startup
chmod +x scripts/run_api.sh
./scripts/run_api.sh
# → http://127.0.0.1:8000  (interactive docs at /docs)

# 4. Frontend — in a separate terminal
cd dashboard
npm install
npm run dev
# → http://localhost:5173
```

### Windows (PowerShell)

```powershell
# 1. Python deps
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# 2. Generate dashboard JSON (first time / after new Excel files)
python scripts\parse_excel.py

# 3. API server — seeds users automatically on startup
.\scripts\run_backend.ps1
# → http://127.0.0.1:8000  (interactive docs at /docs)

# 4. Frontend — in a separate terminal
cd dashboard
npm install
npm run dev
# → http://localhost:5173
```

> **Note:** `npm run dev` proxies all `/api/*` requests to `http://127.0.0.1:8000`.
> The frontend **requires the backend to be running** on port 8000 — login and
> data will fail without it.

### Default login credentials

All seeded accounts share the same initial password: **`Galaxy@123!`**

| Username | Role | Notes |
|----------|------|-------|
| `sanjayp` | CEO | Full read access, no file uploads |
| `asifb` | Admin | Full access + Admin Uploads tab |
| `dilips` | Admin | Full access + Admin Uploads tab |
| `dharashinib` | Admin | Full access + Admin Uploads tab |
| `praveens` | Admin | Full access + Admin Uploads tab |
| `richat` (example) | User | Scoped to own data |

Employee accounts are generated automatically from the quota workbook on first startup.

## Admin uploads

Admins open **Admin Uploads** in the sidebar and upload:

1. Galaxy Quota Tracker (`.xlsx`)
2. Opportunity Pipeline (`.xlsx`)
3. Sales Team (`.xlsx`)

Same sheet/column format as the files under `files/`. On upload the API re-runs the parser, refreshes `quota_data.json`, and re-seeds employee logins. The open dashboard reloads scoped data.

## API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/login` | — | `{ username, password }` → JWT + user |
| `GET /api/auth/me` | Bearer | Current user |
| `GET /api/quota` | Bearer | Scoped quota JSON |
| `POST /api/admin/uploads` | Admin | Multipart file upload + reparse |
| `POST /api/admin/reparse` | Admin | Reparse existing files |

## Data scoping

- **CEO / Admin** — full org JSON (same as before)
- **Leader** — self + `team_members`, related accounts/deals, filtered KPIs
- **IC** — self only + accounts they closed

Dashboard views and charts are unchanged; they simply render the scoped payload.

## Tech stack

- React 19 + TypeScript + Vite + Tailwind 4 + Recharts
- FastAPI + SQLAlchemy + SQLite + JWT
- Python/pandas Excel pipeline
