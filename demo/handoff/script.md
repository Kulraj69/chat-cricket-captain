# Actual local rehearsal — October 28 handoff

File: chat-cricket-mock.mp4. ffprobe: 64.56 seconds, H.264, 1920×1144, silent. Full ffmpeg decode exit0. This records the actual running game at wall-clock speed; voters, events and random rolls are authored fixtures. No Twitch, OBS or Codex conversation is shown. Permanent top caption states SCRIPTED MOCK / simulated voters / no live Twitch or OBS. No voiceover, external assets or invented live evidence.

Recorded actions: open /mock, click Play the showcase, navigate to /overlay, watch the six-ball chase through its opening six, DRS reversal, Free Hit, six-needed final ball and winning delivery/MVP. The recording script reads scores and waits; it never injects match outcomes. Manual same-user vote replacement is tested afterward in two browser windows but is not part of this video.

Reproduce from a fresh source copy with Node20+ and Python Playwright/Chromium installed:
1. npm install
2. CRICKET_SOURCE=/absolute/fresh/source CRICKET_DEMO_OUT=/absolute/new/output python demo/record-local.py
3. Encode the resulting WebM with the exact ffmpeg command in /workspace/devpost/hermes-reports/A4-handoff-verification.json. Retain permanent disclosure. Verify ffprobe duration and run ffmpeg -v error -i OUTPUT.mp4 -f null -.

Verification runner: /workspace/devpost/hermes-reports/A4-verify-handoff.py. It copies allowlisted source, never .env/.git, then follows README install/start/test steps. checks.json contains seven passing browser groups. probe.json has actual media details; encode.log/decode.log preserve results. Source fingerprints are in manifest.json.

A human still needs to review the video visually. Final submission requires separate genuine Twitch operation and verified Codex build evidence; use DEMO.md for that plan. No upload authorized or performed here.
