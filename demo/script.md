# Local recording — October 28

File: chat-cricket-mock.mp4
Measured: 64.56 seconds; H.264, 1920×1144; silent.

This is a real wall-clock recording of the running local product, not a storyboard or fabricated response. A permanent caption says: “Scripted mock - simulated voters and events - no live Twitch or OBS”. The game's own mock labels remain visible. The authored fixture controls voters, events and random rolls; the engine computes the score.

Sequence:
1. Start in the control room and click Play the showcase.
2. Open the actual overlay. Watch the opening six and fixture voters' credit.
3. Watch the wicket, DRS reversal, and Free Hit save.
4. Watch six needed from the last ball, then the delivery reveal before CHAT WINS.
5. Hold the result/MVP card.

Reproduce from the repository with `python demo/record-local.py`, using installed Playwright Python and Chromium. It launches/stops its own mock-only local server with an allowlisted credential-free environment; no install or paid service is needed in this environment. Manual vote replacement is tested after recording, separately from the authored fixture. Evidence: checks.json and manual-state.json.

Encode:
`ffmpeg -i demo/chat-cricket-mock.webm -vf "pad=iw:ih+64:0:64:black,drawtext=text='Scripted mock - simulated voters and events - no live Twitch or OBS':fontcolor=white:fontsize=26:x=(w-tw)/2:y=20" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart -an demo/chat-cricket-mock.mp4`

Not a complete submission video. Still needs approved real Twitch input/announcement, actual OBS capture, authentic Codex build evidence and human review. No upload performed. Do not narrate the simulated participants as a real audience or the authored rolls as natural outcomes.
