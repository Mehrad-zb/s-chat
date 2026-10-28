#!/usr/bin/env bash
# Runs from cron every 10 minutes: if GitHub has new S-Chat code, pull it and rebuild.
cd "$(dirname "$0")/.." || exit 1
git fetch -q origin main || exit 0
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
echo "$(date) updating to $(git rev-parse --short origin/main)"
git reset -q --hard origin/main
docker compose up -d --build
docker image prune -f >/dev/null
/etc/cron.daily/s-chat-apk 2>/dev/null || true
