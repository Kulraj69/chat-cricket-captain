# Chat Cricket Captain — local draft, not submitted

Chat votes for one batter. Each ball turns a shared decision into a score on a local browser overlay. A one-click rehearsal makes the rules easy to try without Twitch credentials.

## Try it
Run `npm install`, then `MOCK_MODE=1 npm start`. Open `/mock`, play the showcase, and watch the final-ball chase. Reset and cast a manual vote; another window receives the same state. All rehearsal names and Twitch events are simulated and labelled.

## Built with Codex
Codex helped implement the engine, controller, overlay and regression tests. Existing session records are in SESSIONS.md; confirm them against the original conversations before submitting. This later Hermes verification pass is not a Codex session. Runtime commentary is templated, not an LLM.

## Challenges and limits
The controller must resume play after a successful all-out review and discard old timers on reset. Local regression tests cover those paths. This pass also prevents a pending EventSub reconnect from reopening a bridge after shutdown. The browser smoke test covers the scripted chase, mobile controls, literal user names and final reveal.

Real Twitch chat, EventSub and OBS capture still need end-to-end evidence. Browser mock tests do not prove them. No audience or engagement measurements exist. A public YouTube demo under three minutes, with real Twitch footage and genuine Codex build evidence, remains required by the local rules summary.

## Unfilled submission fields
Repository URL: confirm publishing/sharing permission and exact URL.
YouTube URL: unknown.
Codex session ID: select and verify an existing SESSIONS.md record; do not fabricate one.
Entrant: Kulraj as an individual, subject to final eligibility review.

Do not submit this draft until the live proof, links, eligibility and exact payload have been reviewed and approved.
