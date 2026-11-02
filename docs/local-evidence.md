# Local evidence

Live Twitch, OBS and original Codex conversations remain unverified. Test credentials, injected clocks and authored RNG are not live audience evidence. All media listed below is local and supplementary, not uploaded or a complete contest video.

## October30 recovery
The interrupted presentation and fixed IRC/EventSub source-selection work is now covered together. Terminal/reset/review guidance, no-vote/tie captions and rendered per-voter credit have real localhost browser checks. A no-voter win uses a neutral result title and default-shot commentary; commentary retains its RNG draw so subsequent authored outcomes do not shift. Partial EventSub setup can leave some powers available; there is no automatic IRC fallback or global pause.

Final execution results and source hashes live in `/workspace/devpost/hermes-reports/evidence/A4-recovery-final/verification.json`; check that file rather than assuming every later edit passed. Supplementary video: `demo/recovery-final/chat-cricket-mock.mp4`, with reproduction in `demo/recovery-final/script.md`. The manual edge cases use an injected clock/RNG and are separate from the wall-clock showcase recording. Two supplementary reviews found and prompted fixes; the required cheap+ runner is absent and full entry remains blocked. No live integration or publication proof is implied.

## Historical passes
The following counts apply to their dated source snapshots, not every later change.

- October28 afternoon: 37 tests, Chrome smoke and seven recording/manual-browser groups. Video: `demo/chat-cricket-mock.mp4`, 64.56 seconds; reproduction `demo/script.md`.
- October28 boundary: fresh-source install, 44 tests, Chrome smoke and seven recording/manual-browser groups. Video: `demo/boundary/chat-cricket-mock.mp4`, 64.40 seconds; reproduction `demo/boundary/script.md`.
- October28 handoff: fresh-source install, 59 tests, Chrome smoke, seven recording/manual-browser groups and zero reported npm advisories. Video: `demo/handoff/chat-cricket-mock.mp4`, 64.56 seconds; reproduction `demo/handoff/script.md`.
- October29 delivery: fresh-source install, 68 tests, Chrome smoke, seven recording groups and zero reported npm advisories. Video: `demo/event-delivery/chat-cricket-mock.mp4`, 64.96 seconds; reproduction `demo/event-delivery/script.md`. Includes duplicate-ID tests across an HTTP match reset and localhost WebSocket handoff, not live Twitch delivery.

An audit is not a security guarantee. Historical media files are local workspace artifacts and may not be included in a source-only checkout. `npm install`, `MOCK_MODE=1 npm start`, then `/mock` reproduce the gameplay without downloading them.
