# Live Twitch test runbook

Secrets live in `/workspace/devpost/secrets/` (mode 600): `twitch_client_id.txt`, optional `twitch_client_secret.txt`, `twitch_tokens.json` (written by the auth script).

1. Register an app at https://dev.twitch.tv/console/apps (name e.g. `chat-cricket-captain-kulraj`, OAuth Redirect URL `http://localhost:3000`, Category `Chat Bot`, Client Type **Public**). Save the Client ID.
2. `node scripts/twitch-auth.js start` -> open the printed URL as the streamer account, click Authorize. Tokens are saved; `check` prints login/scopes only.
3. Run live: `node scripts/run-live.js` (channel = authorised account unless `TWITCH_CHANNEL` set). Overlay: `http://127.0.0.1:3000/overlay`.
4. From a browser logged in to Twitch, open `https://www.twitch.tv/popout/<channel>/chat` and type `!drive`, `!six` etc. Bot announcements appear in the same chat.
5. Capture: `scripts/record-overlay.sh 90` (headless Chrome + ffmpeg), plus a screen capture of the Twitch chat popout.
6. Access tokens last ~4 h: `node scripts/twitch-auth.js refresh`, then restart run-live.
Public overlay only (for OBS elsewhere): `PUBLIC_READONLY=1 HOST=0.0.0.0 node scripts/run-live.js` behind a tunnel; exposes only /overlay.
