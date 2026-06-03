#!/bin/bash
# 自动续期隧道 - 断了自动重连，保持永久在线
# 用法: bash keepalive.sh

PORT=3456
SLEEP_TIME=3000  # 50分钟重启一次

while true; do
  echo "[$(date '+%H:%M:%S')] 启动隧道..."

  # 杀掉旧连接
  kill $(pgrep -f "ssh.*pinggy") 2>/dev/null

  # 启动新隧道
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
      -R 0:localhost:$PORT -p 443 a.pinggy.io 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"run.pinggy-free.link"* ]]; then
      echo "========================================="
      echo "  🌐 当前公网地址："
      echo "  $line"
      echo "========================================="
    fi
  done &

  SSH_PID=$!

  # 等待 50 分钟
  sleep $SLEEP_TIME

  # 杀掉当前连接，准备重连
  kill $SSH_PID 2>/dev/null
  echo "[$(date '+%H:%M:%S')] 隧道即将刷新..."
  sleep 5
done
