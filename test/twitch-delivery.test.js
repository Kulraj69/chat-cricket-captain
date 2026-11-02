'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TwitchBridge } = require('../src/twitch');
const { CricketGame } = require('../src/game');
const { fakeClock } = require('../test-support/clock');

function fixture(t, onEvent) {
  const clock = fakeClock(), sockets = [], events = [], statuses = [];
  const bridge = new TwitchBridge({ env: {}, now: clock.now,
    onEvent: (...args) => { events.push(args); onEvent?.(...args); },
    onStatus: value => statuses.push(value),
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    socketFactory: () => {
      const socket = new EventEmitter();
      socket.close = socket.terminate = () => socket.emit('close');
      socket.packet = (kind, payload, id) => socket.emit('message', Buffer.from(JSON.stringify({
        metadata: { message_type: kind, message_id: id }, payload
      })));
      sockets.push(socket);
      return socket;
    }
  });
  bridge.subscribeEventSub = async () => {};
  const welcome = socket => socket.packet('session_welcome', { session: { id: 'fixture', keepalive_timeout_seconds: 600 } });
  bridge.connectEventSub(); welcome(sockets[0]);
  t.after(() => bridge.stop());
  const notify = (id, socket = sockets.at(-1), payload = { subscription: { type: 'channel.cheer' }, event: { user_name: 'fixture', bits: 1 } }) => socket.packet('notification', payload, id);
  return { bridge, clock, sockets, events, statuses, notify, welcome };
}

test('repeated notification cannot re-arm a consumed Free Hit', t => {
  const game = new CricketGame({ target: 999, rng: () => 0 });
  const f = fixture(t, (type, data) => game.applyEvent(type, data));
  f.notify('cheer-1');
  game.resolveBall(); game.openNextBall();
  f.notify('cheer-1');
  assert.equal(f.events.length, 1);
  assert.equal(game.getState().freeHitNext, false);
  f.notify('cheer-2');
  assert.equal(f.events.length, 2, 'distinct message from same user still applies');
});

test('duplicate identity survives server-directed handoff and fresh reconnect', t => {
  const f = fixture(t);
  f.notify('same');
  f.sockets[0].packet('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?fixture' } });
  f.welcome(f.sockets[1]); f.notify('same');
  f.sockets[1].close(); f.clock.advance(3000);
  f.welcome(f.sockets[2]); f.notify('same');
  assert.equal(f.events.length, 1);
  f.notify('new'); assert.equal(f.events.length, 2);
});

test('malformed notification IDs do not reach the game', t => {
  const f = fixture(t);
  for (const id of [undefined, null, '', ' ', 1, {}, [], 'x'.repeat(257)]) f.notify(id);
  assert.equal(f.events.length, 0);
  f.notify('valid'); assert.equal(f.events.length, 1);
  assert.ok(f.statuses.length > 0);
});

test('duplicate packets still maintain transport keepalive', t => {
  const f = fixture(t);
  f.notify('same');
  f.clock.advance(590000); f.notify('same'); f.clock.advance(20000);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.events.length, 1);
  assert.equal(f.bridge.eventConnections.size, 1);
});

test('identity expires ten minutes after first delivery, not after a duplicate', t => {
  const f = fixture(t);
  f.notify('same');
  f.clock.advance(590000); f.notify('same');
  assert.equal(f.events.length, 1);
  f.clock.advance(10000); f.notify('same');
  assert.equal(f.events.length, 2);
});

test('notification cache evicts oldest IDs at its explicit capacity', t => {
  const f = fixture(t);
  for (let i = 0; i < 4097; i += 1) f.notify(`id-${i}`);
  assert.equal(f.bridge.notificationIds.size, 4096);
  f.notify('id-4096'); assert.equal(f.events.length, 4097);
  f.notify('id-0'); assert.equal(f.events.length, 4098, 'evicted IDs are no longer protected');
});

test('record identity before callback so a throwing callback cannot replay effects', t => {
  const f = fixture(t, () => { throw new Error('fixture-private-diagnostic'); });
  f.notify('same'); f.notify('same');
  assert.equal(f.events.length, 1);
  assert.equal(f.statuses.join(' ').includes('fixture-private-diagnostic'), false);
});

test('stop releases retained IDs and late packets cannot change game', async t => {
  const f = fixture(t);
  f.notify('same'); await f.bridge.stop(); f.notify('new');
  assert.equal(f.events.length, 1);
  assert.equal(f.bridge.notificationIds.size, 0);
  assert.equal(f.clock.pending, 0);
});
