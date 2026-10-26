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
