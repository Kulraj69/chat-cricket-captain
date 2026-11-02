# Local recovery showcase

Actual wall-clock capture of the running local Node app, using its authored six-ball showcase. Voters, events and random rolls are scripted; real engine computes outcomes. Silent, 69.52 seconds. Not live Twitch, OBS capture, Codex footage or a complete submission video. No upload performed.

Run from twitchcon after `npm install`:

`CRICKET_SOURCE="$PWD" CRICKET_DEMO_OUT="$PWD/demo/recovery-final" python demo/record-local.py`

Requires Python Playwright/installed Chromium, Node20+, ffmpeg and ffprobe. Recorder starts credential-free MOCK_MODE=1 npm start on localhost41734; ensure that port is free. Uses real timers; do not substitute screenshots for footage. Recorder overwrites outputs in its selected directory; choose another directory to retain a version.

Sequence: control room and Play the showcase; overlay opening six; DRS reversal; Free Hit; six needed on last ball; final delivery then result/MVP. Separate unrecorded manual checks verify vote replacement and second-browser state. Extra browser-smoke cases use synthetic clock/RNG and are not the wall-clock footage.

Full fresh-source install/test/browser/audit/record/encode/decode recipe:
`python /workspace/devpost/hermes-reports/A4-verify-recovery.py`
That local harness applies a permanent 64px black header reading SCRIPTED MOCK - simulated voters - no live Twitch or OBS. It creates an allowlisted fresh source copy, uses a credential-free environment and saves source hashes and exact commands in /workspace/devpost/hermes-reports/evidence/A4-recovery-final/verification.json. The harness references this machine's installed Chromium; use README's CHROME_BIN option for the standalone browser smoke on another machine.

Final checks:89 tests, nine presentation DOM cases, seven recorder groups, full decode. Final frame screenshot reviewed for readable uncropped mock disclosure; still inspection is not a motion-quality review. Live/entrant/Codex/public-media gates remain.
