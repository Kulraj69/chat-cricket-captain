'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CricketGame } = require('../src/game');
const { voteCopy, matchPrompts } = require('../public/shared');

function resolved(votes) {
  const game = new CricketGame({ rng: () => 0.7 });
  votes.forEach((shot, i) => game.vote(`viewer${i}`, shot));
  game.resolveBall();
  return game.getState();
}

test('zero votes do not claim chat selected the default shot', () => {
  const text = voteCopy(resolved([]));
  assert.equal(text.label, 'NO VOTES · !DEFEND');
  assert.match(text.note, /default/i);
});

test('tied vote announces random selection, with full per-voter credit', () => {
  const state = resolved(['six', 'drive']);
  const text = voteCopy(state);
  assert.match(text.label, /^TIE · !/);
  assert.match(text.note, /random/i);
  assert.doesNotMatch(text.note, /share|split/i);
});

test('clear winning vote credits each winner, not a split of team runs', () => {
  const state = resolved(['six', 'six', 'drive']);
  assert.match(voteCopy(state).note, /Most votes/);
  assert.equal(state.score, 6);
  assert.deepEqual(state.mvp.slice(0, 2).map(p => p.runs), [6, 6]);
});

test('manual win and exhausted loss stop inviting votes or powers', () => {
  for (const status of ['won', 'lost']) {
    const text = matchPrompts({ status, mode: 'mock', canReview: false });
    assert.match(text.cue, /Reset to manual play/);
    assert.equal(text.raid, 'INNINGS OVER');
    assert.equal(text.cheer, 'INNINGS OVER');
    assert.equal(text.drs, 'NO REVIEW AVAILABLE');
    assert.equal(text.chase, status === 'won' ? 'CHASE COMPLETE' : 'INNINGS OVER');
  }
});

test('reviewable all-out loss offers review without promising another ball', () => {
  const text = matchPrompts({ status: 'lost', mode: 'mock', canReview: true });
  assert.match(text.cue, /Redeem DRS/);
  assert.match(text.cue, /Reset to manual play/);
  assert.equal(text.drs, 'WICKET AVAILABLE TO REVIEW');
});

test('terminal showcase and Twitch cues retain mode-specific guidance', () => {
  assert.match(matchPrompts({ status: 'won', demo: { cue: 'stale vote cue' } }).cue, /Replay|replay/);
  assert.doesNotMatch(matchPrompts({ status: 'lost', mode: 'twitch' }).cue, /Send a shot/);
  assert.match(matchPrompts({ status: 'voting', mode: 'twitch' }).cue, /MOCK_MODE=1/);
});

test('resolved and resumed states have appropriate action prompts', () => {
  assert.match(matchPrompts({ status: 'resolved', mode: 'mock' }).cue, /next voting window/i);
  const text = matchPrompts({ status: 'voting', mode: 'mock' });
  assert.match(text.cue, /Send a shot/);
  assert.equal(text.raid, 'Trigger a Super Over');
  assert.equal(text.cheer, 'Protect the next wicket');
});
