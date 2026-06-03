#!/bin/bash
DIR="$HOME/Desktop/reward-todo/server"
BACKUP_DIR="$DIR/backups"
LOG="$DIR/logs/backup.log"
DATA_DIR="$DIR/data"

# Backup data files
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
for f in "$DATA_DIR"/*.json; do
  [ -f "$f" ] && cp "$f" "$BACKUP_DIR/$(basename "$f" .json)_$TIMESTAMP.json"
done

# Keep only last 48 backups (2 days worth)
ls -t "$BACKUP_DIR"/*.json 2>/dev/null | tail -n +49 | xargs rm -f 2>/dev/null

echo "[$(date '+%m-%d %H:%M')] 备份完成 ($(ls "$BACKUP_DIR"/*.json 2>/dev/null | wc -l) 个文件)" >> "$LOG"

# Also run autoheal
bash "$DIR/autoheal.sh"
