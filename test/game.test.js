'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CricketGame, parseMessage } = require('../src/game');

function sequence(values, fallback = 0) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

test('one vote per user is tallied and the last valid vote counts', () => {
  const game = new CricketGame({ rng: () => 0 });
  assert.equal(game.vote('Alice', '!drive'), true);
  assert.equal(game.vote('Alice', '!six'), true);
  assert.equal(game.vote('Bob', 'pull'), true);
  assert.deepEqual(game.tally(), { drive: 0, pull: 1, sweep: 0, defend: 0, six: 1 });
  assert.equal(game.getState().mvp.find(player => player.user === 'Alice').votes, 1);
});

test('a seeded RNG produces identical ball outcomes', () => {
  const play = () => {
    const game = new CricketGame({ rng: sequence([0.4, 0.7, 0.21, 0.6]) });
    game.vote('a', '!drive');
    game.vote('b', '!drive');
    return game.resolveBall();
  };
  assert.deepEqual(play(), play());
});

test('wickets, overs, and a failed chase end correctly', () => {
  const game = new CricketGame({ target: 999, maxOvers: 1, maxWickets: 10, rng: () => 0 });
  for (let ball = 0; ball < 6; ball += 1) {
    game.vote(`user${ball}`, '!defend');
    game.resolveBall();
    if (ball < 5) game.openNextBall();
  }
  assert.equal(game.balls, 6);
  assert.equal(game.getState().overs, '1.0');
  assert.equal(game.status, 'lost');

  const wickets = new CricketGame({ target: 999, maxWickets: 2, rng: () => 0.99 });
  wickets.vote('a', '!six'); wickets.resolveBall(); wickets.openNextBall();
  wickets.vote('a', '!six'); wickets.resolveBall();
  assert.equal(wickets.wickets, 2);
  assert.equal(wickets.status, 'lost');
});

test('reaching the chase target wins immediately', () => {
  // single tied-shot selection, full toss, six, commentary
  const game = new CricketGame({ target: 6, rng: sequence([0, 0.99, 0.6, 0]) });
  game.vote('finisher', '!six');
  const result = game.resolveBall();
  assert.equal(result.outcome, '6');
  assert.equal(game.status, 'won');
  assert.equal(game.getState().mvp[0].runs, 6);
});

test('DRS can overturn only the last wicket and only once', () => {
  const game = new CricketGame({ target: 99, maxWickets: 1, rng: sequence([0, 0, 0.99, 0, 0.1, 0]) });
  game.vote('alice', '!defend');
  game.resolveBall();
  assert.equal(game.wickets, 1);
  assert.equal(game.status, 'lost');
  const review = game.applyEvent('channelPointRedeem', { title: 'DRS' });
  assert.deepEqual(review, { applied: true, success: true });
  assert.equal(game.wickets, 0);
  assert.equal(game.status, 'resolved');
  assert.equal(game.applyEvent('channelPointRedeem', { title: 'DRS' }).applied, false);
});

test('a free hit consumes itself and prevents a wicket', () => {
  const game = new CricketGame({ target: 99, rng: () => 0.99 });
  game.applyEvent('cheer', { user: 'BitsBoss' });
  game.vote('alice', '!six');
  const result = game.resolveBall();
  assert.equal(result.freeHitSaved, true);
  assert.equal(result.outcome, '0');
  assert.equal(game.wickets, 0);
  assert.equal(game.freeHitNext, false);
});

test('a raid enables a six-ball Super Over', () => {
  const game = new CricketGame({ maxOvers: 3 });
  const event = game.applyEvent('raid', { viewers: 50 });
  assert.equal(event.applied, true);
  assert.equal(game.superOver, true);
  assert.equal(game.maxOvers, 1);
});

test('a mid-over raid leaves exactly six deliveries', () => {
  const game = new CricketGame({ target: 999, maxOvers: 3, rng: () => 0 });
  for (let i = 0; i < 2; i += 1) {
    game.resolveBall();
    game.openNextBall();
  }
  game.applyEvent('raid', { viewers: 12 });
  assert.equal(game.ballLimit, 8);
  for (let i = 0; i < 6; i += 1) {
    game.resolveBall();
    if (i < 5) game.openNextBall();
  }
  assert.equal(game.balls, 8);
  assert.equal(game.status, 'lost');
});

test('message parser accepts commands case-insensitively and rejects noise', () => {
  assert.equal(parseMessage(' !DRIVE '), 'drive');
  assert.equal(parseMessage('!sweep please'), 'sweep');
  assert.equal(parseMessage('hello !six'), null);
  assert.equal(parseMessage('!leave'), null);
  assert.equal(parseMessage('!sixpack'), null);
  assert.equal(parseMessage(null), null);
});

test('invalid timing and chase settings fail before a match can start', () => {
  for (const key of ['voteWindowMs', 'target', 'maxOvers', 'maxWickets']) {
    for (const value of [-1, 0, 1.5, Infinity, NaN, 'invalid']) {
      assert.throws(() => new CricketGame({ [key]: value }), RangeError);
    }
  }
  assert.throws(() => new CricketGame({ voteWindowMs: 2147483648 }), RangeError);
  assert.equal(new CricketGame({ target: '42' }).target, 42);
  assert.equal(new CricketGame({ voteWindowMs: '' }).voteWindowMs, 15000);
});

test('raid and Free Hit are idempotent while active; reset restores the original chase', () => {
  const game = new CricketGame({ rng: () => 0, maxOvers: 3 });
  game.applyEvent('raid');
  game.resolveBall(); game.openNextBall();
  assert.equal(game.applyEvent('raid').applied, false);
  assert.equal(game.ballLimit, 6);
  assert.equal(game.applyEvent('cheer').applied, true);
  assert.equal(game.applyEvent('bits').applied, false);
  game.reset();
  assert.equal(game.ballLimit, 18);
  assert.equal(game.maxOvers, 3);
  assert.equal(game.freeHitNext, false);
  assert.equal(game.superOver, false);
  assert.deepEqual(game.getState().recentBalls, []);
});

test('reviews update visible history but never grant an extra delivery after the limit', () => {
  const game = new CricketGame({ rng: () => 0, maxOvers: 1 });
  assert.equal(game.applyEvent('channelPointRedeem', { title: 'DRS' }).applied, false);
  assert.equal(game.drsUsed, false);
  for (let i = 0; i < 5; i++) { game.resolveBall(); game.openNextBall(); }
  game.rng = () => 0.99;
  game.resolveBall();
  assert.equal(game.getState().canReview, true);
  assert.equal(game.applyEvent('channelPointRedeem', {}).applied, false);
  game.rng = () => 0;
  game.applyEvent('channelPointRedeem', { title: ' drs ' });
  const state = game.getState();
  assert.equal(state.status, 'lost');
  assert.equal(state.ballsRemaining, 0);
  assert.equal(state.runsNeeded, 36);
  assert.equal(state.wickets, 0);
  assert.equal(state.canReview, false);
  assert.equal(state.recentBalls.at(-1).overturned, true);
  assert.equal(state.lastResult.outcome, '0');
  assert.equal(game.openNextBall(), false);
});

test('a failed review is consumed and ordinary events cannot mutate an ended match', () => {
  const game = new CricketGame({ maxWickets: 1, rng: () => 0.99 });
  game.resolveBall();
  assert.deepEqual(game.applyDRS(), { applied: true, success: false });
  assert.equal(game.wickets, 1);
  assert.equal(game.drsUsed, true);
  const state = structuredClone(game.getState());
  for (const type of ['cheer', 'bits', 'raid']) assert.equal(game.applyEvent(type).applied, false);
  assert.deepEqual(game.getState(), state);
});

test('raid is idempotent and reset restores the original innings length', () => {
  const game = new CricketGame({ maxOvers: 3, rng: () => 0 });
  game.applyEvent('raid'); game.resolveBall(); game.openNextBall();
  assert.equal(game.applyEvent('raid').applied, false);
  assert.equal(game.ballLimit, 6);
  game.reset();
  assert.equal(game.maxOvers, 3);
  assert.equal(game.ballLimit, 18);
  assert.equal(game.superOver, false);
});

test('completed innings reject new powers and an unrelated redemption cannot spend DRS', () => {
  const game = new CricketGame({ target: 6, rng: sequence([0, 0.99, 0.6, 0]) });
  assert.equal(game.applyEvent('channelPointRedeem', {}).applied, false);
  assert.equal(game.applyEvent('channelPointRedeem', { title: 'Other reward' }).applied, false);
  assert.equal(game.drsUsed, false);
  game.vote('captain', '!six'); game.resolveBall();
  assert.equal(game.applyEvent('raid').applied, false);
  assert.equal(game.applyEvent('cheer').applied, false);
  assert.equal(game.applyDRS().applied, false);
  assert.equal(game.freeHitNext, false);
  assert.equal(game.ballLimit, 18);
});

test('a final-ball DRS updates history but does not grant another delivery', () => {
  const game = new CricketGame({ maxOvers: 1, target: 999, rng: () => 0.99 });
  for (let i = 0; i < 6; i += 1) { game.vote('a', '!six'); game.resolveBall(); game.openNextBall(); }
  game.rng = () => 0;
  assert.equal(game.applyDRS().success, true);
  assert.equal(game.status, 'lost');
  assert.equal(game.balls, 6);
  assert.equal(game.getState().recentBalls.at(-1).overturned, true);
  assert.equal(game.getState().recentBalls.at(-1).outcome, '0');
  assert.equal(game.getState().ballsRemaining, 0);
});

test('unsuccessful DRS consumes the review and preserves the wicket', () => {
  const game = new CricketGame({ rng: () => 0.99 });
  game.vote('a', '!six'); game.resolveBall();
  assert.equal(game.applyDRS().success, false);
  assert.equal(game.wickets, 1);
  assert.equal(game.getState().canReview, false);
  assert.equal(game.getState().recentBalls[0].outcome, 'W');
});

test('derived chase values and MVP credit reflect actual votes and scores', () => {
  const game = new CricketGame({ target: 4, rng: sequence([0, 0.99, 0.6, 0]) });
  game.vote('Alice', '!defend'); game.vote('ALICE', '!six'); game.vote('Bob', '!six'); game.vote('Sam', '!pull');
  game.resolveBall();
  const state = game.getState();
  assert.equal(state.runsNeeded, 0, 'overshooting target cannot show negative runs needed');
  assert.equal(state.ballsRemaining, 17);
  assert.equal(state.mvp.find(p => p.user === 'ALICE').votes, 1);
  assert.equal(state.mvp.find(p => p.user === 'ALICE').runs, 6);
  assert.equal(state.mvp.find(p => p.user === 'Bob').runs, 6);
  assert.equal(state.mvp.find(p => p.user === 'Sam').runs, 0);
  assert.equal(state.score, 6, 'personal credit does not multiply team runs');
});
