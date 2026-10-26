'use strict';
const $ = id => document.getElementById(id);
const { SHOTS, voteDisplay, countdown, resultPresentation } = CricketUI;
let current;
let connected = false;
let offset = 0;
let revealTimer;
let hideTimer;
let revealing = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
for (const shot of SHOTS) {
  const row = element('div', 'vote'); row.id = `v-${shot.name}`;
  const label = element('div', 'vote-row');
  label.append(element('b', '', `!${shot.name}`));
  const count = element('span', '', '0'); count.id = `n-${shot.name}`; label.append(count);
  const track = element('div', 'track'); const fill = element('div', 'fill'); fill.id = `b-${shot.name}`; track.append(fill);
  row.append(label, element('small', '', shot.hint), track); $('votes').append(row);
}

function resize() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('canvas').style.transform = `scale(${scale})`;
  $('canvas').style.left = `${(innerWidth - 1920 * scale) / 2}px`;
  $('canvas').style.top = `${(innerHeight - 1080 * scale) / 2}px`;
}
window.addEventListener('resize', resize); resize();

function drawClock() {
  if (!current) return;
  const clock = countdown(current, Date.now() + offset);
  $('timer').textContent = connected ? (current.status === 'voting' ? `${clock.seconds}s` : 'LOCKED') : '—';
  $('clockFill').style.width = `${connected ? clock.fraction * 100 : 0}%`;
  $('timer').parentElement.classList.toggle('urgent', current.status === 'voting' && clock.seconds <= 3);
}

function drawEnd() {
  const ended = current && ['won', 'lost'].includes(current.status);
  $('end').hidden = !ended || revealing;
  if (!ended) return;
  $('endKicker').textContent = current.demo ? 'SCRIPTED MOCK SHOWCASE · COMPLETE' : 'THE COMMUNITY HAS SPOKEN';
  $('endTitle').textContent = current.status === 'won' ? 'CHAT WINS!' : 'INNINGS OVER';
  $('endDetail').textContent = `${current.score}/${current.wickets} after ${current.overs} overs · Target ${current.target}`;
  $('endMvp').textContent = current.mvp.length ? `MVP · ${current.mvp[0].user} · ${current.mvp[0].runs} credited runs` : 'Every chase starts with a call. Play again from the control room.';
}

function render(state) {
  current = state; offset = state.serverNow - Date.now();
  for (const [id, value] of Object.entries({ runs: state.score, wickets: state.wickets, overs: state.overs,
    target: state.target, needed: state.runsNeeded, remaining: state.ballsRemaining, commentary: state.commentary })) $(id).textContent = value;
  $('mode').textContent = state.demo ? 'SCRIPTED MOCK SHOWCASE · SIMULATED VOTERS & EVENTS' : state.mode === 'mock' ? 'MOCK MATCH · SIMULATED CHAT & EVENTS' : `TWITCH · ${state.twitchStatus}`;
  $('chaseLabel').textContent = state.status === 'won' ? 'CHASE COMPLETE' : state.ballsRemaining === 1 ? 'LAST BALL. MAKE IT COUNT.' : 'THE CHASE';
  $('chaseProgress').style.width = `${Math.min(100, state.score / state.target * 100)}%`;
  const votes = voteDisplay(state);
  $('voteCount').textContent = `${votes.total} VOTE${votes.total === 1 ? '' : 'S'}`;
  $('voteLabel').textContent = votes.locked ? `CHAT CHOSE !${votes.winner.toUpperCase()}` : 'VOTE IN CHAT';
  $('voteNote').textContent = votes.locked ? 'Final tally for the delivery. Winners share its runs.' : 'One vote each. Change your mind anytime.';
  for (const shot of SHOTS) {
    $(`n-${shot.name}`).textContent = votes.tally[shot.name];
    $(`b-${shot.name}`).style.width = `${votes.total ? votes.tally[shot.name] / votes.total * 100 : 0}%`;
    $(`v-${shot.name}`).classList.toggle('winner', votes.winner === shot.name);
  }
  $('ballNumber').textContent = state.status === 'voting' ? `BALL ${state.balls + 1} · ${state.superOver ? 'SUPER OVER' : 'COMMUNITY CHASE'}` : `BALL ${state.balls} · CALL LOCKED`;
  $('ballStatus').textContent = state.status === 'voting' ? (state.freeHitNext ? 'FREE HIT. SWING FREELY.' : state.ballsRemaining === 1 ? 'ONE BALL. ONE CALL.' : 'YOUR CHAT. YOUR SHOT.') : 'CHAT CALLED IT.';
  $('raidPower').classList.toggle('active', state.superOver);
  $('raidLabel').textContent = state.superOver ? `SUPER OVER · ${state.ballsRemaining} balls left` : 'Trigger a Super Over';
  $('freePower').classList.toggle('active', state.freeHitNext);
  $('freeLabel').textContent = state.freeHitNext ? 'FREE HIT ARMED' : state.lastResult?.freeHitSaved ? 'WICKET SAVED' : 'Protect the next wicket';
  $('drsPower').classList.toggle('review', state.drsUsed);
  $('drsLabel').textContent = state.drsUsed ? 'REVIEW USED' : state.canReview ? 'WICKET AVAILABLE TO REVIEW' : 'Review a wicket';
  const recent = state.recentBalls.map(ball => {
    const presentation = resultPresentation(ball);
    const chip = element('span', `ball-chip ${presentation.tone}`, ball.overturned ? 'DRS' : ball.freeHitSaved ? 'FH' : ball.outcome);
    chip.title = `Ball ${ball.ball}: ${presentation.title}. ${presentation.detail}`;
    return chip;
  });
  while (recent.length < 6) recent.push(element('span', 'ball-chip empty', '·'));
  $('recentBalls').replaceChildren(...recent);
  $('mvp').replaceChildren(...(state.mvp.length ? state.mvp.map((player, i) => {
    const row = element('li', 'person');
    row.append(element('span', 'rank', String(i + 1)), element('span', 'name', player.user), element('span', 'credit', String(player.runs)));
    return row;
  }) : [element('li', 'mvp-empty', 'Your name belongs here. Vote for a shot to join the chase.')]));
  drawClock(); drawEnd();
}

function clearReveal() {
  clearTimeout(revealTimer); clearTimeout(hideTimer); revealing = false;
  $('moment').classList.remove('show'); $('ball').classList.remove('go'); $('bat').classList.remove('hit');
}

function showMoment(presentation, withBall = false) {
  clearReveal(); revealing = true;
  $('end').hidden = true;
  if (withBall) {
    void $('ball').offsetWidth; $('ball').classList.add('go'); $('bat').classList.add('hit');
  }
  revealTimer = setTimeout(() => {
    $('momentTitle').textContent = presentation.title;
    $('momentDetail').textContent = presentation.detail;
    $('moment').dataset.tone = presentation.tone;
    $('moment').dataset.size = presentation.title.length > 10 ? 'long' : 'short';
    void $('moment').offsetWidth; $('moment').classList.add('show');
  }, withBall ? 800 : 0);
  hideTimer = setTimeout(() => { revealing = false; $('moment').classList.remove('show'); drawEnd(); }, withBall ? 3000 : 2400);
}

CricketUI.connect(packet => {
  if (packet.type === 'reset') clearReveal();
  if (packet.type === 'ball') showMoment(resultPresentation(packet.result), true);
  if (packet.type === 'event' && packet.event === 'channelPointRedeem') {
    showMoment({ title: packet.eventResult.success ? 'NOT OUT' : 'UMPIRE’S CALL', detail: 'DRS REVIEW · ' + (packet.eventResult.success ? 'DECISION OVERTURNED' : 'DECISION STANDS'), tone: 'review' });
  }
  if (packet.type === 'event' && packet.event === 'raid') showMoment({ title: 'SUPER OVER', detail: 'A RAID CHANGES THE CHASE · SIX BALLS LEFT', tone: 'boundary' });
  render(packet.state);
}, online => {
  connected = online;
  $('connection').textContent = online ? '● SCOREBOARD CONNECTED' : '● RECONNECTING · SCORE MAY BE STALE';
  $('connection').classList.toggle('offline', !online); drawClock();
});
setInterval(drawClock, 200);
