'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const tmi = require('tmi.js');
const { TwitchBridge } = require('../src/twitch');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const events = [], statuses = [], requests = [];
  const bridge = new TwitchBridge({
    env: { TWITCH_BROADCASTER_ID: 'local-broadcaster' },
    onEvent: (...args) => events.push(args),
    onStatus: status => statuses.push(status)
  });
  bridge.helix = async (...args) => { requests.push(args); return {}; };
  return { bridge, events, statuses, requests };
}

test('stopped bridge ignores late events, announcements and subscription setup', async () => {
  const { bridge, events, statuses, requests } = fixture();
  const announcements = [];
  bridge.chat = { disconnect: async () => {}, say: async (...args) => announcements.push(args) };
  await bridge.stop();
  bridge.routeNotification({ subscription: { type: 'channel.cheer' }, event: { bits: 1 } });
  await bridge.subscribeEventSub('local-session');
  await bridge.announce('not sent');
  assert.deepEqual({ events, statuses, requests, announcements }, { events: [], statuses: [], requests: [], announcements: [] });
});

test('stop during broadcaster lookup prevents all queued subscription writes', async () => {
  const { bridge, statuses, requests } = fixture();
  delete bridge.env.TWITCH_BROADCASTER_ID;
  const lookup = deferred();
  bridge.userId = () => lookup.promise;
  const subscribing = bridge.subscribeEventSub('local-session');
  await bridge.stop();
  lookup.resolve('local-broadcaster');
  await subscribing;
  assert.equal(requests.length, 0);
  assert.deepEqual(statuses, []);
});

test('stop during first subscription prevents later writes and success status', async () => {
  const { bridge, statuses, requests } = fixture();
  const first = deferred();
  bridge.helix = (...args) => { requests.push(args); return first.promise; };
  const subscribing = bridge.subscribeEventSub('local-session');
  assert.equal(requests.length, 1);
  await bridge.stop();
  first.resolve({});
  await subscribing;
  assert.equal(requests.length, 1);
  assert.deepEqual(statuses, []);
});

test('stop aborts pending Helix transport and prevents later fetches', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests.push(options);
    return { ok: true, json: async () => ({ data: [] }) };
  });
  const bridge = new TwitchBridge({ env: {} });
  await bridge.helix('/users');
  assert.ok(requests[0].signal instanceof AbortSignal);
  assert.equal(requests[0].signal.aborted, false);
  await bridge.stop();
  assert.equal(requests[0].signal.aborted, true);
  await assert.rejects(bridge.helix('/users'));
  assert.equal(requests.length, 1);
});

test('stop during chat connection closes late connection and ignores queued IRC callbacks', async t => {
  const connected = deferred();
  const chat = new EventEmitter();
  let disconnects = 0;
  chat.connect = () => connected.promise;
  chat.disconnect = async () => { disconnects += 1; };
  t.mock.method(tmi, 'Client', function () { return chat; });
  const received = [], statuses = [];
  const bridge = new TwitchBridge({
    // Only configuration-presence fixtures; the fake client cannot connect.
    env: { TWITCH_CHANNEL: 'local', TWITCH_BOT_USERNAME: 'local', TWITCH_OAUTH_TOKEN: 'not-a-credential' },
    onEvent: (...args) => received.push(args), onMessage: (...args) => received.push(args),
    onStatus: status => statuses.push(status)
  });
  const starting = bridge.start();
  await bridge.stop();
  connected.resolve();
  assert.equal(await starting, false);
  chat.emit('message', '#local', { username: 'local' }, '!six', false);
  chat.emit('cheer', '#local', { bits: '1' });
  chat.emit('raided', '#local', 'local', 1);
  assert.deepEqual(received, []);
  assert.deepEqual(statuses, []);
  assert.equal(disconnects, 2);
  assert.equal(await bridge.start(), false, 'stopped bridge is terminal');
});
