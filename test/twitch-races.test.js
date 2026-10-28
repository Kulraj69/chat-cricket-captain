'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const tmi = require('tmi.js');
const { TwitchBridge } = require('../src/twitch');
const { fakeClock } = require('../test-support/clock');

test('actual tmi queued reconnect cannot call transport after shutdown', async t => {
  const callbacks = [];
  let connections = 0;
  t.mock.method(globalThis, 'setTimeout', callback => { callbacks.push(callback); return 1; });
  t.mock.method(tmi.Client.prototype, 'connect', async function () { connections += 1; });
  const bridge = new TwitchBridge({ env: { TWITCH_CHANNEL: 'local', TWITCH_BOT_USERNAME: 'local', TWITCH_OAUTH_TOKEN: 'not-a-credential' } });
  await bridge.start();
  bridge.chat.log = { info() {}, error() {}, warn() {} };
  bridge.chat._onClose();
  assert.equal(callbacks.length, 1);
  await assert.doesNotReject(bridge.stop());
  callbacks[0]();
  await Promise.resolve();
  assert.equal(connections, 1, 'only initial fake connection');
});

test('in-flight setup continues unfinished subscriptions on transferred session', async () => {
  const clock = fakeClock(), sockets = [], requests = [];
  const bridge = new TwitchBridge({ env: { TWITCH_BROADCASTER_ID: 'local' },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    socketFactory: () => {
      const socket = new EventEmitter();
      socket.close = () => socket.emit('close');
      socket.packet = (kind, payload) => socket.emit('message', Buffer.from(JSON.stringify({ metadata: { message_type: kind }, payload })));
      sockets.push(socket); return socket;
    }
  });
  let release;
  const first = new Promise(resolve => { release = resolve; });
  bridge.helix = async (_path, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) await first;
    return {};
  };
  bridge.connectEventSub();
  sockets[0].packet('session_welcome', { session: { id: 'old', keepalive_timeout_seconds: 10 } });
  await Promise.resolve();
  assert.equal(requests.length, 1);
  sockets[0].packet('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?local' } });
  sockets[1].packet('session_welcome', { session: { id: 'new', keepalive_timeout_seconds: 10 } });
  release();
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map(r => r.transport.session_id), ['old', 'new', 'new', 'new']);
  assert.equal(new Set(requests.map(r => r.type)).size, 4);
  await bridge.stop();
  assert.equal(clock.pending, 0);
});
