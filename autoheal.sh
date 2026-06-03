#!/bin/bash
DIR="$HOME/Desktop/reward-todo/server"
LOG="$DIR/logs/autoheal.log"

check_url() {
  local url=$1 name=$2
  if [ -z "$url" ] || [ "$url" = "等待重连..." ] || [ "$url" = "连接中..." ]; then return 1; fi
  local http=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url/" 2>/dev/null)
  if [ "$http" = "200" ]; then
    echo "[$(date '+%m-%d %H:%M')] $name $url → 200 ✅" >> "$LOG"
    return 0
  else
    echo "[$(date '+%m-%d %H:%M')] $name $url → $http ❌" >> "$LOG"
    return 1
  fi
}

# Check pinggy
PURL=$(cat "$DIR/public/tunnel-url.txt" 2>/dev/null)
check_url "$PURL" "Pinggy" || {
  pkill -f "ssh.*pinggy" 2>/dev/null
  cd "$DIR" && npx pm2 restart reward-tunnel 2>/dev/null
}

# Check serveo
SURL=$(cat "$DIR/public/tunnel-url-serveo.txt" 2>/dev/null)
check_url "$SURL" "Serveo" || {
  # restart serveo if needed
  pgrep -f "ssh.*serveo" >/dev/null || ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3456 serveo.net 2>&1 &
}
