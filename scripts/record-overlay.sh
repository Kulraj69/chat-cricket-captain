#!/usr/bin/env bash
# Records the live overlay on a virtual display (no OBS needed): scripts/record-overlay.sh [seconds] [out.mp4]
# Overlay is transparent, so a dark backdrop is injected for the capture. Requires the server on :3000.
set -euo pipefail
SECS="${1:-60}"; OUT="${2:-/workspace/devpost/twitchcon/docs/live-overlay.mp4}"
URL="${OVERLAY_URL:-http://127.0.0.1:3000/overlay}"
xvfb-run -a -s "-screen 0 1280x720x24" bash -c '
  google-chrome --no-sandbox --user-data-dir=$(mktemp -d) --window-size=1280,720 --window-position=0,0 --kiosk "'"$URL"'" >/dev/null 2>&1 &
  sleep 6
  ffmpeg -loglevel error -y -f x11grab -video_size 1280x720 -framerate 30 -i "$DISPLAY" -t '"$SECS"' -c:v libx264 -pix_fmt yuv420p -preset veryfast "'"$OUT"'"
  pkill -f "user-data-dir=/tmp" || true'
