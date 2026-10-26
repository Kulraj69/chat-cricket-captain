# Chat Cricket Captain — judging and submission plan

Source of criteria and submission requirements: [RULES.md](RULES.md), the repository's summary of the Devpost rules. This plan does not predict placement, audience growth, or engagement. Stage 2 criteria are equally weighted; Innovation/Idea is the first tie-breaker.

## Judging criteria → concrete improvements

| Criterion | Concrete improvement | Reviewable evidence / acceptance check | Priority |
|---|---|---|---|
| Stage 1: fits the Twitch streamer/community theme | Keep chat's collective shot selection, individual credit, and raid/cheer/DRS consequences central. Explicitly distinguish mock events from Twitch traffic. | Two browser windows share the same match; a changed vote replaces the earlier choice. Live Twitch footage still required. | P0 |
| Stage 1: uses OpenAI Codex | Preserve the original build thread and append this gpt-6-astra session's actual work. Explain the human brief → Codex implementation → tests loop. | `SESSIONS.md`, source changes, test output, and a real Codex thread shown in the submission video. Unknown IDs/token usage stay unknown. | P0 |
| Innovation / Idea | Create a one-click, rehearsed last-ball chase: raid opens a Super Over, chat scores a six, DRS overturns a wicket, a Free Hit saves the next ball, and a final six completes the chase. | Deterministic mock showcase uses the same vote, outcome, event, scoring, and MVP engine as normal play. Both screens label the scripted fixture and simulated users. No fabricated score or audience metrics. | P0 |
| Potential Impact | Make participation understandable without cricket knowledge: “runs needed / balls left,” concise shot advice, visible commands, per-viewer credit, and an instant replay/reset path for stream breaks. | A judge can launch locally with no account, watch the showcase, reset, and cast their own vote. Every accepted/rejected action gets feedback. | P0 |
| Technical implementation, including Codex use | Separate match scheduling from HTTP startup; test the full showcase, timer cancellation, DRS recovery, event guards, API validation, WebSocket delivery, and Twitch payload routing without credentials. Avoid publishing raw upstream errors. | `npm test`; importable server; deterministic controller tests and real local HTTP/WebSocket integration tests. Live OAuth/EventSub end-to-end validation remains a release task. | P0 |
| Design: easy to use, fun to watch | Build a broadcast layout with a transparent stage, large chase equation, vote countdown, retained winning tally, recent-ball strip, distinct wicket/boundary/review reveals, persistent match result, and useful empty/disconnected states. Use local fonts and reduced-motion support. | Inspect at OBS's 1920×1080 and a smaller browser size. Final-ball animation remains visible before the end card; reconnect reconstructs the current match. | P0 |

## Implementation sequence

1. Add the deterministic showcase and a timer-owning match controller. Repair DRS resumption, raid/reset behavior, and ended-match event handling. Expose derived chase/history state, never invented metrics.
2. Rebuild the overlay and control room around a readable live chase, honest mock labels, one-click playback, and clear vote/event feedback. Keep assets local and the OBS canvas transparent.
3. Add meaningful engine/controller/HTTP/WebSocket/Twitch routing tests; run the complete suite. Review the frontend in a browser if available.
4. Rewrite README onboarding and add `DEMO.md` with a proposed recording script, real-Twitch proof requirements, and Codex evidence. Append the actual session work to `SESSIONS.md`.

## Submission gates and remaining release work

| Requirement from RULES.md | Concrete action / evidence | State at planning time |
|---|---|---|
| Newly built during the submission period; eligible entrant/team | Keep the dated build session and source history; entrant verifies age, location, team eligibility, and build dates against official rules. | Original session is recorded; entrant verification remains. |
| Interactive experience connects to Twitch | Preserve IRC commands/announcements and EventSub event mapping; document exact configuration. Record a real Twitch chat message changing the overlay. | Adapter exists; no live credentials available in this session. Mock footage does not satisfy this proof. |
| Installs and runs consistently, as shown in video | Node 20+, lockfile, `npm install`, `npm start`, no build step or required external fonts; repeatable mock showcase. | Baseline `npm test` passes; improvements must pass too. |
| Repo URL with all source and run instructions | Publish/share the actual repository URL; if private, share with `testing@devpost.com`. Keep setup, OBS, troubleshooting, and test instructions in README. | Publication/sharing is an entrant task. |
| Text description includes features and how Codex was used | README explains the experience and identifies concrete Codex-built components and test-driven fixes. | Documentation upgrade planned. |
| Codex session ID | Use the recorded original build ID; append this session ID only if actually available. | Original ID is in `SESSIONS.md`; do not guess this session's ID. |
| Public YouTube video under three minutes showing working Twitch integration AND Codex construction | Follow `DEMO.md`; capture actual Twitch input, OBS output, and actual Codex thread/test evidence. Check final runtime and public visibility. | Recording and upload remain; no live-Twitch claim from this session. |
| No copyrighted music / third-party trademarks in submitted creative material | Use the app's own CSS artwork and silent capture or original narration; review final footage and assets against official rules. | No new external creative assets planned; final footage review remains. |
| Free for judges through end of judging | Keep local mock mode credential-free, without metered APIs; maintain shared source/access through judging. | Local path exists; continued publication/access is an entrant task. |
| English materials | Use English-first UI/docs, with optional Hinglish commentary understandable in context. | Preserve and clarify. |
| Submit on time | Per local rules summary: Nov 2, 2:00 PM PT / Nov 3, 3:30 AM IST. Recheck official rules before submission. | Entrant must submit; this session does not submit anything. |

## Evidence discipline

Game scores, vote totals, and MVP credit come from engine state. Showcase timings, target, named simulated voters, and random rolls are authored fixtures, explicitly labeled as such. Test counts may be reported only from an actual run. Do not use speculative finalist odds from brainstorming as evidence. Do not claim Twitch, OBS, YouTube, or Devpost validation that has not happened.

## Implemented and verified

The P0 improvements are now reviewable in the working tree. This completes the local implementation work; the live recording and submission gates above still require the entrant.

| Improvement | Concrete evidence |
|---|---|
| Last-ball wow moment | `src/showcase.js` and `src/match.js`; `test/match.test.js` plays and replays the entire fixture, checks the final-ball equation, DRS, Free Hit, final score, and individual credit. Reset tests interrupt different points in the rehearsal and verify that no old timers leak into manual play. |
| OBS overlay polish | `public/overlay.*` and `public/shared.js`; fixed fallback-font overflow so the title cannot obscure mock labels. Actual browser capture in `docs/showcase.png`. Chrome checks cover transparent background, delivery-before-victory timing, reload reconstruction, mobile controls, and smaller overlay size. Actual OBS capture remains unverified. |
| Reliable participation | `test/game.test.js`, `test/presentation.test.js`, and `test/server.test.js` cover vote replacement, retained winning tally, configuration validation, ended-match guards, DRS recovery, rejected actions, synchronized viewers, and reconnect state. `MOCK_MODE=1` prevents Twitch startup; the example environment defaults to this rehearsal mode. |
| Codex usage story | `README.md` explains the human brief, engine/controller implementation, DRS regression, browser-discovered typography fix, and verification loop. `SESSIONS.md` records this session's actual work and thread ID without guessing token usage. |
| README/demo clarity | `README.md` now starts with the judge's local path and a labeled screenshot; `DEMO.md` provides fixture beats, a proposed video budget, and the live-Twitch/OBS/Codex evidence still needed. |
| Validation | `npm test` passes locally. `npm run test:browser` uses installed Chrome and no Twitch credentials. No live Twitch, actual OBS capture, public upload, engagement measurement, or contest result is claimed. |

Remaining priorities: capture a real Twitch vote and bot announcement with the overlay, record the actual Codex build evidence, verify installation from the published checkout, then complete the public video and Devpost submission requirements. The local improvements do not replace those proof requirements.
