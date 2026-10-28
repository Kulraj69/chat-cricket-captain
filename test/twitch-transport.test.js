'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TwitchBridge } = require('../src/twitch');

test('stop rejects in-flight fetch without reporting expected cancellation', async t => {
  let started = false;
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    started = true;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const statuses = [];
  const bridge = new TwitchBridge({ env: {}, onStatus: s => statuses.push(s) });
  const pending = bridge.subscribeEventSub('local-session');
  assert.equal(started, true);
  await bridge.stop();
  await pending;
  assert.deepEqual(statuses, []);
});

test('retired subscription loop cannot create more requests or connected status', async () => {
  const statuses = [], requests = [];
  const bridge = new TwitchBridge({ env: { TWITCH_BROADCASTER_ID: 'local' }, onStatus: s => statuses.push(s) });
  let resolve, current = true;
  bridge.helix = (...args) => { requests.push(args); return new Promise(done => { resolve = done; }); };
  const pending = bridge.subscribeEventSub('retired', () => current);
  current = false;
  resolve({});
  await pending;
  assert.equal(requests.length, 1);
  assert.deepEqual(statuses, []);
  await bridge.stop();
});

test('real localhost WebSocket handoff closes both transports on stop', async t => {
  const { WebSocket, WebSocketServer } = require('ws');
  const { once } = require('node:events');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const peers = [], calls = [], events = [];
  const bridge = new TwitchBridge({ env: {}, onEvent: (...args) => events.push(args),
    socketFactory: () => new WebSocket(`ws://127.0.0.1:${server.address().port}`) });
  bridge.subscribeEventSub = async id => calls.push(typeof id === 'function' ? id() : id);
  t.after(async () => {
    await bridge.stop();
    for (const peer of server.clients) peer.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  const until = async predicate => {
    for (let i = 0; i < 200; i += 1) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('local WebSocket condition timed out');
  };
  const packet = (peer, kind, payload) => peer.send(JSON.stringify({ metadata: { message_type: kind }, payload }));
  server.on('connection', peer => peers.push(peer));
  bridge.connectEventSub();
  await until(() => peers.length === 1);
  packet(peers[0], 'session_welcome', { session: { id: 'local-first', keepalive_timeout_seconds: 10 } });
  await until(() => calls.length === 1);
  packet(peers[0], 'session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?local-fixture' } });
  await until(() => peers.length === 2);
  assert.equal(peers[0].readyState, WebSocket.OPEN);
  packet(peers[0], 'notification', { subscription: { type: 'channel.cheer' }, event: { bits: 1 } });
  await until(() => events.length === 1);
  packet(peers[1], 'session_welcome', { session: { id: 'local-transfer', keepalive_timeout_seconds: 10 } });
  await until(() => peers[0].readyState === WebSocket.CLOSED);
  assert.deepEqual(calls, ['local-first']);
  await bridge.stop();
  await until(() => peers[1].readyState === WebSocket.CLOSED);
});
