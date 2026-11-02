# Chat Cricket Captain — local draft, not submitted

Chat votes for one batter. Each ball turns a shared decision into a score on a local browser overlay. A one-click rehearsal makes the rules easy to try without Twitch credentials.

## Try it
Run `npm install`, then `MOCK_MODE=1 npm start`. Open `/mock`, play the showcase, and watch the final-ball chase. Reset and cast a manual vote; another window receives the same state. All rehearsal names and Twitch events are simulated and labelled.

## Built with Codex
Codex helped implement the engine, controller, overlay and regression tests. Existing session records are in SESSIONS.md; confirm them against the original conversations before submitting. This later Hermes verification pass is not a Codex session. Runtime commentary is templated, not an LLM.

## Challenges and limits
The controller must resume play after a successful all-out review and discard old timers on reset. Local regression tests cover those paths. This pass also prevents a pending EventSub reconnect from reopening a bridge after shutdown. The browser smoke test covers the scripted chase, mobile controls, literal user names and final reveal.

A later local pass caught names being corrupted when a UTF-8 character crossed request chunks. The parser now joins bytes before decoding. Actions require JSON, and HTTP/WebSocket browser Origins receive the same validation. That pass left the suite at 44 tests at the time; it has since grown to 89. The Chrome smoke check passes. Earlier 64.40-second and 64.56-second scripted rehearsals are kept in `demo/boundary/` and `demo/handoff/`; neither is uploaded or live Twitch evidence. The local server is not an authenticated public service.

Real Twitch chat, EventSub and OBS capture still need end-to-end evidence. Browser mock tests do not prove them. No audience or engagement measurements exist. A public YouTube demo under three minutes, with real Twitch footage and genuine Codex build evidence, remains required by the local rules summary.

Current local state (verified 2026-11-02): `npm test` passes 89 tests and `npm run test:browser` passes against installed Chrome. Shutdown and EventSub handoff/silent-connection recovery are tested locally, including a real localhost WebSocket pair. No claim of live Twitch reliability follows from that. The latest labelled supplementary footage is `demo/recovery-final/chat-cricket-mock.mp4`, 69.52 seconds, permanently captioned scripted-mock/no-live-Twitch-or-OBS. Copy-ready proposed form text is in `/workspace/devpost/hermes-reports/submit-ready/chat-cricket-captain.md`.

## Unfilled submission fields
Repository URL: confirm publishing/sharing permission and exact URL.
YouTube URL: unknown.
Codex session ID: 01a17995-b816-76d3-9463-0d48a4971357 (recorded in SESSIONS.md; original transcript, build attribution and chronology unverified in this handoff). A second recorded ID is 01a17a59-df83-7c10-b75d-8fd86d376777; not a substitute for reviewing the actual conversation. Do not enter either as verified until that check is complete.
Entrant: Kulraj as an individual, subject to final eligibility review.

Do not submit this draft until the live proof, links, eligibility and exact payload have been reviewed and approved.
