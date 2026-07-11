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

```bash
# 1. Python deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pip install pandas openpyxl   # if not already

# 2. Generate dashboard JSON (first time / offline)
python3 scripts/parse_excel.py

# 3. API server (seeds users on startup)
chmod +x scripts/run_api.sh
./scripts/run_api.sh
# → http://127.0.0.1:8000  (docs at /docs)

# 4. Frontend (separate terminal)
cd dashboard
npm install
npm run dev
# → http://localhost:5173
```

Sign in with e.g. `sanjayp` / `Galaxy@123!` or `richat` / `Galaxy@123!`.

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
