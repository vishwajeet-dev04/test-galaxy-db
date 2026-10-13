#!/bin/sh
# Prepare the runtime volumes, then hand off to gunicorn (CMD).
set -eu

DEFAULTS=/app/config.defaults
CONFIG=/app/config

# Code-owned config: refreshed from the image on every start so git changes reach the container.
for f in pipeline_aliases.json leader_roster.json dept_to_rtm.json extracted_v1.json; do
  if [ -f "$DEFAULTS/$f" ]; then
    cp "$DEFAULTS/$f" "$CONFIG/$f"
  fi
done

# Admin-owned config: seeded once, never overwritten, so roster / quota edits survive redeploys.
for f in ic_quotas.json quota_rules.json; do
  if [ ! -f "$CONFIG/$f" ] && [ -f "$DEFAULTS/$f" ]; then
    cp "$DEFAULTS/$f" "$CONFIG/$f"
    echo "[entrypoint] seeded $CONFIG/$f from image defaults"
  fi
done

# First start: build the dashboard JSON so the app is not stuck on "Quota data not generated yet".
# A failure is logged and startup continues; Admin -> Sync / Rebuild fixes it later.
if [ ! -f /app/backend/data/quota_data.json ]; then
  echo "[entrypoint] quota_data.json missing - running a first rebuild"
  if ! (cd /app/scripts && python -c "import build_quota_data; build_quota_data.build()"); then
    echo "[entrypoint] WARNING: first rebuild failed; run Admin -> Sync from Vtiger" >&2
  fi
fi

exec "$@"
