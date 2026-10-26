# Recording plan — Chat Cricket Captain

This is a proposed recording script, not a claim that a video has been recorded. The local rules summary requires a public YouTube video **under three minutes**, showing the app **working on Twitch** and **how it was built with Codex**. Record the final material in English and check the official rules before submitting.

## Rehearse locally now

Run `npm install`, then `MOCK_MODE=1 npm start`. Open `/mock` and click **Play the showcase**. Use `/overlay` for a clean capture. The fixture chases 16 in six deliveries through the real engine:

| Ball / action | Expected visible result |
|---|---|
| Simulated raid | Super Over active; six balls remain. |
| Ball 1: `!six` | Six runs; named `demo_` voters receive run credit. |
| Ball 2: `!pull`, then DRS | Wicket, then “NOT OUT”; wicket count returns to zero and the history chip reads DRS. |
| Simulated cheer, ball 3: `!six` | Free Hit saves a would-be wicket; history chip reads FH. |
| Ball 4: `!drive` | Four; team score reaches ten. |
| Ball 5: `!defend` | Dot; six needed from the last ball. |
| Ball 6: `!six` | Winning six; reveal appears before the result card, with team score and actual MVP credit. |

These are authored fixture outcomes, not live viewers or natural random-game results. Both pages label the rehearsal. Do not crop those labels away or narrate it as a real Twitch audience. Reset restores normal randomness and the configured match settings. Keep the manual chat segment separate from scripted playback.

## Proposed video structure

The timings below are an editing budget, not measured footage. Aim to finish within this budget and verify the actual exported runtime.

| Time budget | Capture | Suggested narration / purpose |
|---|---|---|
| 0:00–0:15 | Last-ball chase and winning overlay, visibly labeled if using the rehearsal | “What if the entire chat had to make one call to win? This is Chat Cricket Captain.” Hook the viewer with the collective decision and outcome. |
| 0:15–0:45 | **Actual Twitch channel/chat and the overlay together** | Send a real `!drive`, then replace it with `!six` using the same user. Show the tally changing without gaining another vote; show a second real account only if available. Let a delivery resolve and capture the bot’s result announcement. |
| 0:45–1:25 | Selected showcase moments, retaining “scripted mock” labels | “This credential-free rehearsal uses the same engine to show a raid, a review, and a Free Hit.” Show the wicket reversal, protected delivery, last-ball equation, and MVP credit. Explain that DRS normally has 50/50 odds. |
| 1:25–2:10 | Actual Codex conversation and relevant source/test output | Show the original brief and real thread ID, then this session’s judging plan. Explain the concrete bug: DRS could overturn an all-out wicket but no timer resumed play. Show the controller fix and passing regression test. Show `npm test` output from an actual run. |
| 2:10–2:40 | Fresh local launch, control-room preview, and OBS Browser Source setup | Show the simple judge path: install, start, play showcase; reset for manual voting. Mention no runtime AI/API cost, local fonts/assets, and credential-free testing. End with the actual repository URL once published. |

## Live Twitch proof still needed

No live credentials were available for this session. Before recording the real-chat section:

1. Configure the bot and broadcaster tokens privately using the README instructions. Keep credential entry and `.env` off camera.
2. Start without forced mock mode. Confirm the app reports a Twitch chat connection; show an actual Twitch message affecting `/overlay`.
3. Capture the resulting bot announcement in the actual channel. Only describe live EventSub redemptions/cheers/raids as verified if you have actually triggered and observed them; otherwise explain that those demonstrations are simulated fixtures.
4. Add the overlay to OBS at 1920×1080 over your stream scene and capture it working. The Chrome checks from this session do not establish OBS/Twitch end-to-end proof.
5. Record the actual Codex conversation/build evidence. Use the recorded IDs in `SESSIONS.md`; do not recreate a conversation or invent usage statistics.

## Final submission check

- Publish the source repository and verify the exact README commands on a fresh checkout. If private, share with `testing@devpost.com` as described in `RULES.md`.
- Keep the app free and accessible for judges through judging. The local mock path needs no channel or paid API account.
- Include features, the concrete Codex contribution, and the real build session ID in the Devpost text.
- Upload the final video to YouTube as public, verify its measured runtime is below three minutes, and test the submitted link.
- Use original narration or silent capture; do not add unlicensed music/assets. Review the final creative material against the rules’ trademark restriction.
- Review entrant eligibility, build dates, and the official submission deadline. This session has not submitted or published anything.
