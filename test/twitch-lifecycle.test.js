'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TwitchBridge } = require('../src/twitch');
const { fakeClock } = require('../test-support/clock');

function fixture() {
  const clock = fakeClock(), sockets = [], events = [], statuses = [], subscriptions = [];
  const bridge = new TwitchBridge({
    env: {}, onEvent: (...args) => events.push(args), onStatus: status => statuses.push(status),
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    socketFactory: url => {
      const socket = new EventEmitter();
      socket.url = url; socket.closed = false;
      socket.close = socket.terminate = () => { socket.closed = true; socket.emit('close'); };
      socket.packet = (kind, payload = {}) => socket.emit('message', Buffer.from(JSON.stringify({ metadata: { message_type: kind }, payload })));
      sockets.push(socket);
      return socket;
    }
  });
  bridge.subscribeEventSub = async id => subscriptions.push(typeof id === 'function' ? id() : id);
  const welcome = (socket, id) => socket.packet('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } });
  return { clock, sockets, events, statuses, subscriptions, bridge, welcome };
}

test('server handoff retains old events until welcome and inherits subscriptions', async () => {
  const f = fixture();
  f.bridge.connectEventSub();
  f.welcome(f.sockets[0], 'original');
  f.sockets[0].packet('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?opaque=fixture' } });
  assert.equal(f.sockets[0].closed, false);
  assert.equal(f.sockets[1].url, 'wss://eventsub.wss.twitch.tv/ws?opaque=fixture');
  f.sockets[0].packet('notification', { subscription: { type: 'channel.cheer' }, event: { bits: 1 } });
  assert.equal(f.events.length, 1);
  f.welcome(f.sockets[1], 'transferred');
  assert.equal(f.sockets[0].closed, true);
  assert.deepEqual(f.subscriptions, ['original']);
  f.sockets[0].packet('notification', { subscription: { type: 'channel.cheer' }, event: {} });
  assert.equal(f.events.length, 1, 'retired callbacks ignored');
  await f.bridge.stop();
  assert.equal(f.clock.pending, 0);
});

test('silent socket expires; keepalive resets deadline; reconnect subscribes fresh', async () => {
  const f = fixture();
  f.bridge.connectEventSub(); f.welcome(f.sockets[0], 'original');
  f.clock.advance(9000);
  f.sockets[0].packet('session_keepalive');
  f.clock.advance(9000);
  assert.equal(f.sockets[0].closed, false);
  f.clock.advance(1001);
  assert.equal(f.sockets[0].closed, true);
  f.clock.advance(3000);
  assert.equal(f.sockets.length, 2);
  f.welcome(f.sockets[1], 'fresh');
  assert.deepEqual(f.subscriptions, ['original', 'fresh']);
  await f.bridge.stop();
  assert.equal(f.clock.pending, 0);
});

test('stop during handoff closes both sockets and suppresses late errors and retry', async () => {
  const f = fixture();
  f.bridge.connectEventSub(); f.welcome(f.sockets[0], 'original');
  f.sockets[0].packet('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?fixture' } });
  await f.bridge.stop();
  const before = f.statuses.length;
  for (const socket of f.sockets) socket.emit('error', new Error('private-upstream-test-marker'));
  f.clock.advance(60000);
  assert.ok(f.sockets.every(socket => socket.closed));
  assert.equal(f.sockets.length, 2);
  assert.equal(f.statuses.length, before);
  assert.equal(f.clock.pending, 0);
});

test('revocation surfaces a bounded operator warning without upstream values', async () => {
  const f = fixture();
  f.bridge.connectEventSub(); f.welcome(f.sockets[0], 'original');
  f.sockets[0].packet('revocation', { subscription: { type: 'private-upstream-test-marker', status: 'private-upstream-test-marker' } });
  assert.match(f.statuses.at(-1), /revoked/i);
  assert.equal(f.statuses.join(' ').includes('private-upstream-test-marker'), false);
  await f.bridge.stop();
});

test('failed replacement makes one fresh retry and retires both transports', async () => {
  const f = fixture();
  f.bridge.connectEventSub(); f.welcome(f.sockets[0], 'original');
  f.sockets[0].packet('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?fixture' } });
  f.sockets[1].close();
  f.sockets[0].emit('close');
  f.clock.advance(3000);
  assert.equal(f.sockets.length, 3);
  assert.equal(f.sockets[0].closed, true);
  await f.bridge.stop();
  assert.equal(f.clock.pending, 0);
});
