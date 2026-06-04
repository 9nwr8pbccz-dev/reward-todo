#!/bin/bash
cd ~/Desktop/reward-todo
cp data/*.json .data-backup/ 2>/dev/null
git add .data-backup/ data/ 2>/dev/null
git commit -m "auto backup $(date '+%m-%d %H:%M')" 2>/dev/null
git push 2>/dev/null
