'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const tmi = require('tmi.js');
const { TwitchBridge, isAnonymous } = require('../src/twitch');

function setup(t, env) {
  const chat = new EventEmitter();
  let options; const said = [];
  chat.connect = chat.disconnect = async () => {};
  chat.say = async (...a) => { said.push(a); };
  t.mock.method(tmi, 'Client', function (o) { options = o; return chat; });
  const messages = [], statuses = [];
  const bridge = new TwitchBridge({ env, onMessage: (...a) => messages.push(a), onEvent: () => {}, onStatus: s => statuses.push(s) });
  bridge.connectEventSub = () => { throw new Error('EventSub must not start'); };
  t.after(() => bridge.stop());
  return { bridge, chat, said, messages, statuses, options: () => options };
}

test('isAnonymous: channel without token, or TWITCH_ANON=1', () => {
  assert.equal(isAnonymous({ TWITCH_CHANNEL: 'c' }), true);
  assert.equal(isAnonymous({ TWITCH_CHANNEL: 'c', TWITCH_OAUTH_TOKEN: 'x', TWITCH_BOT_USERNAME: 'b' }), false);
  assert.equal(isAnonymous({ TWITCH_CHANNEL: 'c', TWITCH_OAUTH_TOKEN: 'x', TWITCH_ANON: '1' }), true);
  assert.equal(isAnonymous({}), false);
});

test('anonymous mode joins with no identity, reads votes, never posts or uses EventSub', async t => {
  const f = setup(t, { TWITCH_CHANNEL: 'somechan', TWITCH_CLIENT_ID: 'x', TWITCH_USER_OAUTH_TOKEN: 'y' });
  assert.equal(await f.bridge.start(), true);
  assert.equal(f.options().identity, undefined);
  assert.deepEqual(f.options().channels, ['somechan']);
  f.chat.emit('message', '#somechan', { 'display-name': 'Viewer' }, '!bat', false);
  assert.deepEqual(f.messages, [['Viewer', '!bat']]);
  await f.bridge.announce('hello');
  assert.deepEqual(f.said, []);
  assert.match(f.statuses.at(-1), /read-only anonymous/);
});

test('authenticated mode still sends identity and can post', async t => {
  const f = setup(t, { TWITCH_CHANNEL: 'c', TWITCH_BOT_USERNAME: 'b', TWITCH_OAUTH_TOKEN: 'not-a-credential' });
  await f.bridge.start();
  assert.equal(f.options().identity.username, 'b');
  await f.bridge.announce('hi');
  assert.equal(f.said.length, 1);
});
