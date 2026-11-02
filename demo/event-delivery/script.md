# Actual local showcase — October 29 event-delivery pass

File: chat-cricket-mock.mp4. 64.96 seconds, H.264, 1920×1144, silent. Full decode passed. This is a wall-clock recording of the real local game, with authored voters, events and random rolls. The permanent caption says SCRIPTED MOCK / simulated voters / no live Twitch or OBS. It does not demonstrate EventSub deduplication, real Twitch, OBS, or a Codex conversation.

Actions: open /mock, Play the showcase, switch to /overlay. Watch opening six, DRS reversal, Free Hit, six needed from the last ball, then the final delivery and win. The recorder reads state and waits; it never injects scores. Separate post-recording browser checks verify one user's replacement vote across two windows. All seven checks passed in checks.json.

Reproduction from Node20+ and installed Python Playwright/Chromium:
1. npm install
2. CRICKET_SOURCE=/absolute/source CRICKET_DEMO_OUT=/absolute/new/output python demo/record-local.py
3. Encode WebM using ffmpeg with the permanent mock caption; retain that disclosure.

Exact fresh-copy, install, browser, encode and decode commands: /workspace/devpost/hermes-reports/A4-verify-delivery.py. Outputs and fingerprints: /workspace/devpost/hermes-reports/evidence/A4-event-delivery/verification.json. No .env or credentials are copied.

Automated static review found no clipping at native resolution. Small secondary text, pale central caption, credit/tie wording and completed-state prompts remain visual polish opportunities; no human video sign-off has occurred. Keep this supplementary clip local. Final contest media still requires genuine Twitch interaction and authenticated Codex evidence.
