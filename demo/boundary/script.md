# Actual local rehearsal — boundary continuation

File: chat-cricket-mock.mp4. ffprobe duration 64.400000 seconds; H.264 1920x1144, silent. Full decode passed. All frames retain a permanent banner: SCRIPTED MOCK - simulated voters - no live Twitch or OBS.

Recorded the real wall-clock authored showcase, not a mocked HTTP response or injected score: open control room, click Play the showcase, open overlay, opening six, DRS reversal, Free Hit, last-ball equation, winning delivery before result/MVP. Inputs and RNG are the product's explicitly scripted fixture. Separate unrecorded manual checks verify same-user vote replacement across browser windows.

Reproduce with Python Playwright, installed Chromium and ffmpeg:
CRICKET_SOURCE=/home/box/.hermes/cache/scratch/a4-local-boundary CRICKET_DEMO_OUT=/workspace/devpost/twitchcon/demo/boundary python /workspace/devpost/twitchcon/demo/record-local.py

CRICKET_SOURCE can instead point at a local source checkout with dependencies installed using README npm install. The recorder uses npm start with a clean forced-mock environment, allows only its local browser requests, asserts actual DOM states, and stops its server afterward. Choose a new output directory to preserve earlier footage.

Encode the resulting chat-cricket-mock.webm with ffmpeg libx264, yuv420p, CRF 23, faststart, no audio, a 64-pixel black pad above the video, and the exact permanent banner above. encode.log, decode.log and probe.log are actual tool output; checks.json has seven passing groups. This supplementary video is not the required public Twitch/Codex submission video. Not uploaded or human visually reviewed.

Exact encoding command (run in the selected output directory; -y replaces that output file):
```sh
ffmpeg -y -i chat-cricket-mock.webm -vf "pad=iw:ih+64:0:64:black,drawtext=text='SCRIPTED MOCK - simulated voters - no live Twitch or OBS':fontcolor=white:fontsize=26:x=(w-tw)/2:y=20" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart -an chat-cricket-mock.mp4
ffmpeg -v error -i chat-cricket-mock.mp4 -f null -
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of json chat-cricket-mock.mp4
```
Final machine-readable verification command/exit records: verification.json. An empty decoder log by itself is not proof of success.
