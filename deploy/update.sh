#!/usr/bin/env bash
# Pull the latest S-Chat code and restart (data is kept in ./data)
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
/etc/cron.daily/s-chat-apk 2>/dev/null || true
echo "S-Chat updated."
