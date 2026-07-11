#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend
