#!/bin/bash
DIR="/Users/lujinhui/Desktop/reward-todo"
LOG="$DIR/logs/autoheal.log"
URL=$(cat "$DIR/public/tunnel-url.txt" 2>/dev/null)
mkdir -p "$DIR/logs"
D=$(date '+%m-%d %H:%M')

if [ -z "$URL" ]; then
  echo "[$D] 无URL → 重启" >> "$LOG"
  cd "$DIR" && npx pm2 restart reward-tunnel 2>/dev/null
else
  HTTP=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 "$URL/" 2>/dev/null)
  if [ "$HTTP" = "200" ]; then
    echo "[$D] ✅ 200" >> "$LOG"
  else
    echo "[$D] ❌ $HTTP → 重启" >> "$LOG"
    cd "$DIR" && npx pm2 restart reward-tunnel 2>/dev/null
  fi
fi
