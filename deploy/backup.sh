#!/usr/bin/env bash
# Make a backup archive of all S-Chat data (database + uploaded files)
set -euo pipefail
cd "$(dirname "$0")/.."
TS=$(date +%Y%m%d-%H%M)
docker compose exec -T app node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/s-chat.db');d.exec('PRAGMA wal_checkpoint(TRUNCATE)');"
tar -czf "s-chat-backup-$TS.tar.gz" data .env
echo "Backup written: $(pwd)/s-chat-backup-$TS.tar.gz"
