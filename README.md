# Galaxy Performance Tracker

Interactive management dashboard for Galaxy Office Automation — quota attainment, pipeline, and sales performance.

## Features

- **Executive Overview** — KPI cards, BU performance, division breakdown, persona radar, top performers
- **Sales Divisions** — Drill-down by sales unit (S1, S2, CB, GB, South, GeoX, etc.)
- **Business Units** — DCG, CSN, CSG, PS, Cloud, AI with RTM division breakdown
- **Personas** — IC, TL, Specialist, Generalist, and other role types
- **Employees** — Searchable table with Q1/H1/Annual metrics and individual detail cards
- **Team Quotas** — Team Lead aggregate quotas vs company targets
- **Leaderboard** — Ranked performance with sortable metrics

## Quick Start

```bash
# 1. Parse Excel data (re-run when the workbook is updated)
python3 scripts/parse_excel.py

# 2. Start the dashboard
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Netlify

The app must be built from the `dashboard/` folder. Output goes to `dashboard/dist/`.

### Option A — Connect Git repo (recommended)

A `netlify.toml` at the repo root is already configured:

| Setting | Value |
|---------|-------|
| Base directory | `dashboard` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` (relative to base → `dashboard/dist`) |

Push to GitHub/GitLab and connect the repo in Netlify. It will pick up `netlify.toml` automatically.

### Option B — Manual deploy

```bash
cd dashboard
npm ci
npm run build
npx netlify-cli deploy --prod --dir=dist
```

### Common 404 causes

1. **Wrong publish directory** — Do not publish the repo root. Publish `dashboard/dist` only.
2. **Build not run** — Drag-and-drop the repo root without building gives 404 (no `index.html` at root).
3. **Missing data file** — Ensure `dashboard/public/data/quota_data.json` exists before build (run `python3 scripts/parse_excel.py` locally, then commit or regenerate in CI).

### Refresh data before deploy

```bash
source .venv/bin/activate
python3 scripts/parse_excel.py
cd dashboard && npm run build
```

## Data Refresh

When you update `Galaxy_Quota_Tracker v4 - Review document.xlsx` or `Opportunity Pipeline 1Apr to 21Jun.csv`:

```bash
source .venv/bin/activate
python3 scripts/parse_excel.py
```

Then refresh the browser — no rebuild needed in dev mode.

## Tech Stack

- React 19 + TypeScript + Vite
- Recharts for analytics visualizations
- Tailwind CSS 4 for styling
- Python/pandas for Excel parsing
