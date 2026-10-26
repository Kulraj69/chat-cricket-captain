'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MatchController } = require('../src/match');

function harness(options = {}) {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const packets = [];
  const announcements = [];
  const match = new MatchController({
    gameOptions: { voteWindowMs: 100, rng: () => 0 }, revealMs: 40, demoVoteWindowMs: 100,
    ...options, now: () => now,
    setTimer: (callback, delay) => { timers.set(++id, { at: now + delay, callback }); return id; },
    clearTimer: timer => timers.delete(timer),
    onUpdate: packet => packets.push(structuredClone(packet)),
    announce: message => announcements.push(message)
  });
  function advance(milliseconds) {
    const end = now + milliseconds;
    let steps = 0;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      assert.ok(++steps < 1000, 'timers must not loop indefinitely');
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return { match, advance, packets, announcements, timers };
}

test('showcase earns its last-ball win through the engine, then replays identically', () => {
  const { match, advance, packets, announcements, timers } = harness();
  function play() {
    match.reset(true);
    assert.equal(match.getState().superOver, true);
    assert.equal(match.receiveMessage('visitor', '!six').accepted, false);
    assert.equal(match.receiveEvent('cheer').applied, false);
    for (let ball = 1; ball <= 6; ball++) {
      advance(100);
      assert.equal(match.getState().balls, ball);
      if (ball < 6) advance(40);
      if (ball === 5) {
        assert.equal(match.getState().runsNeeded, 6);
        assert.equal(match.getState().ballsRemaining, 1);
      }
    }
    const state = match.getState();
    assert.equal(state.status, 'won');
    assert.equal(state.score, 16);
    assert.equal(state.wickets, 0);
    assert.equal(state.drsUsed, true);
    assert.equal(state.demo.active, false);
    assert.equal(state.demo.scripted, true);
    assert.deepEqual(state.recentBalls.map(ball => ball.outcome), ['6', '0', '0', '4', '0', '6']);
    assert.equal(state.recentBalls[1].overturned, true);
    assert.equal(state.recentBalls[2].freeHitSaved, true);
    assert.deepEqual(state.mvp.map(player => [player.user, player.votes, player.runs]), [
      ['demo_asha', 6, 16], ['demo_lee', 6, 16], ['demo_noor', 6, 16], ['demo_sam', 6, 0]
    ]);
    assert.equal(timers.size, 0);
    return state.recentBalls;
  }
  const first = play();
  assert.deepEqual(packets.filter(packet => packet.type === 'ball').map(packet => packet.result.outcome), ['6', 'W', '0', '4', '0', '6']);
  assert.deepEqual(play(), first);
  assert.deepEqual(announcements, [], 'scripted activity must never be announced to Twitch');
});

test('reset cancels queued showcase votes, events, and review; restores manual configuration', () => {
  for (const elapsed of [1, 20, 110, 240, 400, 800]) {
    const { match, advance, timers } = harness({ gameOptions: { target: 42, maxOvers: 4, voteWindowMs: 1000, rng: () => 0 } });
    match.reset(true);
    advance(elapsed);
    match.reset();
    advance(999);
    const state = match.getState();
    assert.equal(state.demo, null);
    assert.equal(state.balls, 0);
    assert.equal(state.totalVotes, 0);
    assert.equal(state.lastEvent, null);
    assert.equal(state.target, 42);
    assert.equal(state.ballLimit, 24);
    assert.equal(state.freeHitNext, false);
    assert.equal(state.superOver, false);
    assert.equal(timers.size, 1);
    assert.equal(match.receiveMessage('real_tester', '!pull').accepted, true);
    advance(1);
    assert.equal(match.getState().balls, 1);
  }
});

test('successful DRS resumes an all-out match exactly once', () => {
  const rolls = [0, 0, 0.99, 0, 0.1, 0];
  const { match, advance, timers, announcements } = harness({ gameOptions: {
    maxWickets: 1, voteWindowMs: 100, rng: () => rolls.shift() ?? 0
  } });
  match.start();
  match.receiveMessage('reviewer', '!defend');
  advance(100);
  assert.equal(match.getState().status, 'lost');
  assert.equal(timers.size, 0);
  assert.equal(match.receiveEvent('channelPointRedeem', { title: 'DRS' }).success, true);
  assert.equal(match.getState().status, 'resolved');
  assert.equal(match.receiveEvent('channelPointRedeem', { title: 'DRS' }).applied, false);
  assert.equal(timers.size, 1);
  advance(40);
  assert.equal(match.getState().status, 'voting');
  assert.equal(match.getState().openedAt, 140);
  advance(100);
  assert.equal(match.getState().balls, 2);
  assert.ok(announcements.some(message => message.includes('Not out')));
});

test('start is idempotent and stop cancels every pending match timer', () => {
  const { match, advance, timers, packets } = harness();
  match.start(); match.start();
  assert.equal(timers.size, 1);
  advance(100);
  assert.equal(match.getState().balls, 1);
  assert.equal(match.receiveMessage('late', '!six').accepted, false);
  match.stop();
  const count = packets.length;
  advance(10000);
  assert.equal(packets.length, count);
  assert.equal(timers.size, 0);
});

test('invalid chat input never creates a voter; valid replacement counts once', () => {
  const { match } = harness();
  for (const [user, message] of [[null, '!six'], [' ', '!six'], ['x'.repeat(26), '!six'], ['name', '!sixpack'], ['name', {}], ['name', '!six ' + 'a'.repeat(500)]]) {
    assert.equal(match.receiveMessage(user, message).accepted, false);
  }
  assert.equal(match.getState().mvp.length, 0);
  assert.equal(match.receiveMessage(' Captain ', '!drive').accepted, true);
  assert.equal(match.receiveMessage('CAPTAIN', '!six').accepted, true);
  assert.equal(match.getState().totalVotes, 1);
  assert.equal(match.getState().tally.six, 1);
  assert.equal(match.getState().mvp[0].votes, 1);
});
