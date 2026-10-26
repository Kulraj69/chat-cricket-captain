'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CricketGame } = require('../src/game');
const { countdown, voteDisplay, resultPresentation } = require('../public/shared');

test('the overlay retains the actual winning tally during a reveal and clears it for the next vote', () => {
  const game = new CricketGame({ rng: () => 0 });
  game.vote('first', '!six'); game.vote('second', '!six'); game.vote('third', '!pull');
  assert.equal(voteDisplay(game.getState()).locked, false);
  game.resolveBall();
  const display = voteDisplay(game.getState());
  assert.equal(display.total, 3);
  assert.equal(display.winner, 'six');
  assert.equal(display.tally.six, 2);
  assert.equal(display.locked, true);
  game.openNextBall();
  assert.equal(voteDisplay(game.getState()).total, 0);
  assert.equal(voteDisplay(game.getState()).winner, null);
});

test('countdown clamps clock skew and late snapshots and stops outside voting', () => {
  const state = { status: 'voting', openedAt: 1000, voteWindowMs: 15000 };
  assert.deepEqual(countdown(state, 0), { seconds: 15, fraction: 1 });
  assert.equal(countdown(state, 15001).seconds, 1);
  assert.deepEqual(countdown(state, 17000), { seconds: 0, fraction: 0 });
  assert.deepEqual(countdown({ ...state, status: 'won' }, 1000), { seconds: 0, fraction: 0 });
});

test('result labels distinguish wickets, reviews, and Free Hit saves from ordinary runs', () => {
  const result = { shot: 'six', delivery: 'full toss', outcome: 'W' };
  assert.equal(resultPresentation(result).title, 'WICKET');
  assert.equal(resultPresentation({ ...result, outcome: '6' }).tone, 'boundary');
  assert.equal(resultPresentation({ ...result, outcome: '0', freeHitSaved: true }).title, 'SAVED');
  assert.equal(resultPresentation({ ...result, outcome: '0', overturned: true }).title, 'NOT OUT');
  assert.equal(resultPresentation({ ...result, outcome: '0' }).title, 'DOT BALL');
});
