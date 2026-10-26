'use strict';
const $ = id => document.getElementById(id);
let current;
let online = false;
let busy = false;
$('overlayUrl').textContent = `${location.origin}/overlay`;

function feedback(text, error = false) {
  $('feedback').textContent = text;
  $('feedback').classList.toggle('error', error);
  const item = document.createElement('li'); item.textContent = text; $('feed').prepend(item);
  while ($('feed').children.length > 30) $('feed').lastChild.remove();
}

function controls() {
  const locked = !online || busy || Boolean(current?.demo);
  const voting = current?.status === 'voting';
  for (const el of [$('user'), $('message'), $('send'), ...$('shots').querySelectorAll('button')]) el.disabled = locked || !voting;
  const ended = !current || ['won', 'lost'].includes(current.status);
  $('raid').disabled = locked || ended || current?.superOver;
  $('cheer').disabled = locked || ended || current?.freeHitNext;
  $('drs').disabled = locked || !current?.canReview;
  $('reset').disabled = !online || busy;
  $('demo').disabled = !online || busy || current?.mode === 'twitch';
}

async function post(url, body, success) {
  if (busy) return;
  busy = true; controls();
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const packet = await response.json();
    if (packet.state) render(packet.state);
    if (!response.ok || !packet.ok) feedback(packet.result?.reason || packet.error || 'Action was not accepted', true);
    else feedback(success);
  } catch { feedback('Could not reach the server. Reconnect, then try again.', true); }
  finally { busy = false; controls(); }
}

function send(shot) {
  if (shot) $('message').value = `!${shot}`;
  return post('/api/message', { user: $('user').value, message: $('message').value }, `${$('user').value}: ${$('message').value} — accepted. Your latest valid shot counts.`);
}
for (const shot of CricketUI.SHOTS) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = `!${shot.name}`;
  button.title = shot.hint; button.addEventListener('click', () => send(shot.name)); $('shots').append(button);
}
$('voteForm').addEventListener('submit', event => { event.preventDefault(); send(); });
$('demo').addEventListener('click', () => post('/api/demo', {}, 'Scripted mock showcase started. All voters and events in this rehearsal are simulated.'));
$('reset').addEventListener('click', () => post('/api/reset', {}, 'Fresh manual match. Send a shot command to join.'));
$('raid').addEventListener('click', () => post('/api/event', { type: 'raid', user: 'mock_raider' }, 'Simulated raid accepted. Six balls remain.'));
$('cheer').addEventListener('click', () => post('/api/event', { type: 'cheer', user: 'mock_cheerer' }, 'Simulated cheer accepted. Free Hit armed.'));
$('drs').addEventListener('click', () => post('/api/event', { type: 'channelPointRedeem', title: 'DRS', user: 'mock_reviewer' }, 'Simulated DRS reward accepted. The commentary shows the decision.'));

function render(state) {
  current = state;
  $('score').textContent = `${state.score}/${state.wickets}`;
  $('chase').textContent = `${state.runsNeeded} runs from ${state.ballsRemaining} balls`;
  $('status').textContent = `${state.status.toUpperCase()} · ${state.totalVotes} current votes · ${state.twitchStatus}`;
  $('voteState').textContent = state.demo ? 'SCRIPTED PLAYBACK' : state.status === 'voting' ? 'VOTING OPEN' : 'VOTING CLOSED';
  $('demo').textContent = state.demo ? '↻ Replay the showcase' : '▶ Play the showcase';
  $('cue').textContent = state.demo?.cue || (state.mode === 'twitch' ? 'Twitch configured. Use MOCK_MODE=1 to rehearse the scripted showcase.' : 'Manual play is open between deliveries. Send a shot, then watch it play out.');
  $('drsHint').textContent = state.drsUsed ? 'Review used' : state.canReview ? 'Wicket ready to review' : 'Wait for a wicket';
  $('mode').textContent = state.demo ? 'SCRIPTED MOCK SHOWCASE' : state.mode === 'mock' ? 'MOCK CONTROL ROOM' : 'TWITCH CONTROL ROOM';
  controls();
}
CricketUI.connect(packet => {
  render(packet.state);
  if (packet.type === 'ball') feedback(`Ball ${packet.result.ball}: ${CricketUI.resultPresentation(packet.result).title} · ${packet.state.score}/${packet.state.wickets}`);
  if (packet.type === 'event') feedback(packet.state.commentary);
}, connected => {
  online = connected; $('connection').textContent = connected ? '● SCOREBOARD CONNECTED' : '● RECONNECTING';
  $('connection').classList.toggle('offline', !connected); controls();
});
