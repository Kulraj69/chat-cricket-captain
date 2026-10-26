'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createApp } = require('../server');

async function start(t, options = {}) {
  const app = createApp({ env: { MOCK_MODE: '1', VOTE_WINDOW_MS: '60000' }, ...options });
  const address = await app.start(0);
  t.after(() => app.stop());
  const base = `http://127.0.0.1:${address.port}`;
  async function post(path, body = {}, headers = {}) {
    const response = await fetch(base + path, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  return { app, base, post };
}

test('HTTP commands update both WebSocket viewers and reconnect supplies the current match', async t => {
  const { base, post } = await start(t);
  const socket = new WebSocket(base.replace('http', 'ws') + '/ws');
  const viewer = new WebSocket(base.replace('http', 'ws') + '/ws');
  const initial = await Promise.all([once(socket, 'message'), once(viewer, 'message')]);
  assert.ok(initial.every(([raw]) => JSON.parse(raw).state.mode === 'mock'));
  const updates = Promise.all([once(socket, 'message'), once(viewer, 'message')]);
  const vote = await post('/api/message', { user: 'Tester', message: '!six' });
  assert.equal(vote.body.ok, true);
  for (const [raw] of await updates) {
    const packet = JSON.parse(raw);
    assert.equal(packet.type, 'vote');
    assert.equal(packet.state.tally.six, 1);
    assert.equal(packet.state.mvp[0].votes, 1);
  }
  const replacement = await post('/api/message', { user: 'tester', message: '!drive' });
  assert.equal(replacement.body.state.totalVotes, 1);
  assert.equal(replacement.body.state.tally.six, 0);
  await post('/api/event', { type: 'cheer', user: 'mock_booster' });
  socket.close(); viewer.close();
  const reconnected = new WebSocket(base.replace('http', 'ws') + '/ws');
  const [raw] = await once(reconnected, 'message');
  const state = JSON.parse(raw).state;
  assert.equal(state.freeHitNext, true);
  assert.equal(state.tally.drive, 1);
  assert.equal(state.lastEvent.type, 'freeHit');
  assert.equal((await post('/api/reset')).body.state.totalVotes, 0);
  reconnected.close();
});

test('all local UI assets load without a build step and private files are not served', async t => {
  const { base } = await start(t);
  for (const [path, type] of [
    ['/', 'text/html'], ['/mock', 'text/html'], ['/overlay', 'text/html'],
    ['/public/mock.css', 'text/css'], ['/public/overlay.css', 'text/css'],
    ['/public/mock.js', 'text/javascript'], ['/public/overlay.js', 'text/javascript'], ['/public/shared.js', 'text/javascript']
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.ok((await response.text()).length > 0);
  }
  for (const path of ['/.env', '/server.js', '/public/../server.js', '/public/missing.js']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

test('invalid requests leave the match intact and errors never echo input', async t => {
  const { base, post } = await start(t);
  for (const body of [[], null, 'invalid']) assert.equal((await post('/api/message', body)).status, 400);
  const invalid = await fetch(base + '/api/message', { method: 'POST', body: '{test-only-marker' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes('test-only-marker'), false);
  assert.equal((await post('/api/message', { user: 'a', message: '!six' }, { origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post('/api/event', { type: 'cheer', user: {} })).status, 400);
  assert.equal((await post('/api/message', { user: 'a', message: '!noise' })).body.ok, false);
  assert.equal((await post('/api/event', { type: 'unrecognized' })).body.ok, false);
  assert.equal((await post('/api/unknown')).status, 404);
  const oversized = await post('/api/message', { message: 'x'.repeat(9000) });
  assert.equal(oversized.status, 400);
  assert.equal((await (await fetch(base + '/api/state')).json()).totalVotes, 0);
});

test('showcase endpoint is explicitly scripted and manual reset unlocks voting', async t => {
  const { post } = await start(t);
  const demo = await post('/api/demo');
  assert.equal(demo.body.state.demo.scripted, true);
  assert.equal(demo.body.state.target, 16);
  assert.equal((await post('/api/message', { user: 'tester', message: '!six' })).body.ok, false);
  assert.equal((await post('/api/event', { type: 'cheer' })).body.ok, false);
  const reset = await post('/api/reset');
  assert.equal(reset.body.state.demo, null);
  assert.equal(reset.body.state.target, 36);
  assert.equal(reset.body.state.ballLimit, 18);
  assert.equal((await post('/api/message', { user: 'tester', message: '!six' })).body.ok, true);
});

test('MOCK_MODE prevents Twitch startup even when credentials are configured', async t => {
  let starts = 0;
  const fixtureEnv = { TWITCH_CHANNEL: 'test_channel', TWITCH_BOT_USERNAME: 'test_bot', TWITCH_OAUTH_TOKEN: 'test-only-placeholder', VOTE_WINDOW_MS: '60000' };
  const bridgeFactory = () => ({ start: async () => { starts++; }, stop: async () => {}, announce: async () => {} });
  const mock = await start(t, { env: { ...fixtureEnv, MOCK_MODE: '1' }, bridgeFactory });
  assert.equal(starts, 0);
  assert.equal((await mock.post('/api/demo')).body.ok, true);
  const live = await start(t, { env: fixtureEnv, bridgeFactory });
  assert.equal(starts, 1);
  assert.equal((await live.post('/api/demo')).status, 409);
  const state = await (await fetch(live.base + '/api/state')).text();
  assert.equal(state.includes('test-only-placeholder'), false);
});

test('Twitch startup failures provide a safe status and leave local controls usable', async t => {
  const { base, post } = await start(t, {
    env: { TWITCH_CHANNEL: 'test_channel', TWITCH_BOT_USERNAME: 'test_bot', TWITCH_OAUTH_TOKEN: 'test-only-placeholder' },
    bridgeFactory: () => ({
      start: async () => { throw new Error('private-upstream-test-marker'); },
      stop: async () => {}, announce: async () => {}
    })
  });
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.twitchStatus, 'Twitch unavailable. Check credentials and network');
  assert.equal(JSON.stringify(state).includes('private-upstream-test-marker'), false);
  assert.equal((await post('/api/message', { user: 'tester', message: '!six' })).body.ok, true);
});
