# Chat Cricket Captain

Chat Cricket Captain turns a Twitch community into one chaotic cricket batter. Every ball opens a 15-second poll; viewers vote with `!drive`, `!pull`, `!sweep`, `!defend`, or `!six`, then a delivery and outcome play out live on an OBS-ready overlay. The crowd chases 36 from three overs by default.

Channel interactions matter too: a **DRS** channel-point reward has one 50/50 chance to overturn the latest wicket, a cheer arms a Free Hit for the next ball, and a raid turns the innings into a six-ball Super Over. Voters earn the runs scored by their winning call and climb the MVP table.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open [http://localhost:3000/mock](http://localhost:3000/mock) for the mock chat/control room and [http://localhost:3000/overlay](http://localhost:3000/overlay) for the broadcast overlay. The game works fully in mock mode with no Twitch credentials. Use the control room to send votes, redemptions, cheers, and raids.

Run the test suite with:

```bash
npm test
```

Configuration is read from the environment. Copy `.env.example` as a reference (Node does not load `.env` automatically; export the values in your shell or use your preferred environment loader). `VOTE_WINDOW_MS`, `TARGET`, `MAX_OVERS`, and `PORT` are optional.

## OBS setup

1. Start the server and add a **Browser** source in OBS.
2. Set its URL to `http://localhost:3000/overlay`.
3. Set width to **1920**, height to **1080**, and FPS to 60.
4. Enable “Shutdown source when not visible” only if reconnecting the browser source is acceptable. The overlay background is transparent.

For a remote setup, serve the app behind HTTPS; its WebSocket automatically switches to `wss://`.

## Twitch credentials

Chat activates only when all of these are set:

- `TWITCH_CHANNEL`: channel login, without `#`.
- `TWITCH_BOT_USERNAME`: the account sending result announcements.
- `TWITCH_OAUTH_TOKEN`: that bot account’s user OAuth token, conventionally prefixed with `oauth:`. It needs `chat:read` and `chat:edit`.

EventSub is optional and activates when `TWITCH_CLIENT_ID` and `TWITCH_USER_OAUTH_TOKEN` are also present. The latter must be a **user access token** for the broadcaster—not an app token—with these exact scopes:

- `channel:read:redemptions` for the custom reward named **DRS**
- `bits:read` for cheers
- `moderator:read:followers` for the follow subscription

Raids do not require an additional scope. The app discovers the broadcaster ID from `TWITCH_CHANNEL`; `TWITCH_BROADCASTER_ID` may be provided to skip that lookup. `TWITCH_MODERATOR_ID` defaults to the broadcaster and can be set to the authenticated moderator’s ID.

Create an application in the [Twitch Developer Console](https://dev.twitch.tv/console), use its Client ID, and create the user tokens through Twitch OAuth. The EventSub WebSocket does not require a public callback URL. Never commit tokens—`.env` is ignored.

The bot listens to IRC chat through `tmi.js` and announces each delivery. EventSub maps reward redemptions, cheers, and raids to the game. IRC cheer/raid events remain as a fallback; duplicate cheers from both transports only arm a single next-ball Free Hit.

## How it works

`src/game.js` is a timer-free game engine with injectable randomness, a shot-versus-delivery outcome matrix, vote replacement, chase rules, individual stats, and Twitch event effects. `server.js` owns the vote timers and broadcasts snapshots over WebSocket. `src/commentary.js` produces deterministic English-first, Hinglish-flavored lines. `src/twitch.js` contains the optional IRC and EventSub adapters.

## Built with Codex

This project was built with OpenAI Codex from the initial product brief. Codex designed the deterministic engine and probability matrix, implemented the server, Twitch/EventSub adapter and animated overlay, wrote the tests and documentation, and ran the complete install/test loop. The mock console was included so judges can reproduce every integration-driven mechanic without access to the creator’s channel.

## License

MIT © 2026 Kulraj Singh Sabharwal. See [LICENSE](LICENSE).
