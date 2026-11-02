'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const tmi = require('tmi.js');
const { TwitchBridge } = require('../src/twitch');
const { CricketGame } = require('../src/game');

async function fixture(t, extra = {}) {
  const chat = new EventEmitter();
  chat.connect = chat.disconnect = async () => {};
  t.mock.method(tmi, 'Client', function () { return chat; });
  const env = { TWITCH_CHANNEL: 'local', TWITCH_BOT_USERNAME: 'local',
    TWITCH_OAUTH_TOKEN: 'not-a-credential', ...extra };
  const game = new CricketGame({ target: 999, rng: () => 0 });
  const events = [], messages = [];
  const bridge = new TwitchBridge({ env,
    onMessage: (...args) => messages.push(args),
    onEvent: (type, data) => { events.push(type); game.applyEvent(type, data); }
  });
  // No sockets or HTTP requests; exercise real registered IRC callbacks.
  bridge.connectEventSub = () => {};
  t.after(() => bridge.stop());
  await bridge.start();
  const irc = type => type === 'cheer'
    ? chat.emit('cheer', '#local', { bits: '1' })
    : chat.emit('raided', '#local', 'fixture', 1);
  const eventSub = type => bridge.routeNotification({
    subscription: { type: `channel.${type}` }, event: { bits: 1, viewers: 1 }
  });
  return { bridge, env, game, events, messages, chat, irc, eventSub };
}
const dual = { TWITCH_CLIENT_ID: 'fixture', TWITCH_USER_OAUTH_TOKEN: 'not-a-credential' };

for (const first of ['irc', 'eventSub']) {
  test(`dual configured: ${first} arriving first cannot double cheer after consumption`, async t => {
    const f = await fixture(t, dual);
    f[first]('cheer');
    if (first === 'irc') assert.equal(f.game.freeHitNext, false);
    else { f.game.resolveBall(); f.game.openNextBall(); }
    f[first === 'irc' ? 'eventSub' : 'irc']('cheer');
    assert.deepEqual(f.events, ['cheer']);
    assert.equal(f.game.freeHitNext, first === 'irc');
  });
}

test('dual configured: delayed IRC raid cannot affect a reset innings', async t => {
  const f = await fixture(t, dual);
  f.eventSub('raid');
  f.game.reset();
  f.irc('raid');
  assert.equal(f.game.superOver, false);
  assert.deepEqual(f.events, ['raid']);
});

test('IRC-only and partial EventSub configuration preserve cheer and raid', async t => {
  for (const extra of [{}, { TWITCH_CLIENT_ID: 'fixture' }, { TWITCH_USER_OAUTH_TOKEN: 'not-a-credential' }]) {
    const f = await fixture(t, extra);
    f.irc('cheer'); f.irc('raid');
    assert.deepEqual(f.events, ['cheer', 'raid']);
    assert.equal(f.game.freeHitNext, true);
    assert.equal(f.game.superOver, true);
    await f.bridge.stop();
  }
});

test('fixed source does not change with env mutation; chat votes still work', async t => {
  const f = await fixture(t, dual);
  delete f.env.TWITCH_USER_OAUTH_TOKEN;
  f.irc('cheer'); f.irc('raid');
  f.chat.emit('message', '#local', { username: 'fixture' }, '!six', false);
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.messages, [['fixture', '!six']]);
  await f.bridge.stop();
  f.irc('cheer'); f.eventSub('raid');
  assert.deepEqual(f.events, []);
});

test('partial EventSub setup retains earlier powers without IRC fallback', async t => {
  const f = await fixture(t, { ...dual, TWITCH_BROADCASTER_ID: 'fixture' });
  const attempted = [], statuses = [];
  f.bridge.onStatus = status => statuses.push(status);
  f.bridge.helix = async (_path, options) => {
    const type = JSON.parse(options.body).type;
    attempted.push(type);
    if (type === 'channel.raid') throw new Error('local simulated failure');
    return { data: [] };
  };
  await f.bridge.subscribeEventSub('local-session');
  assert.deepEqual(attempted, ['channel.channel_points_custom_reward_redemption.add', 'channel.cheer', 'channel.raid']);
  assert.match(statuses.at(-1), /setup failed/);
  f.irc('cheer'); f.irc('raid');
  assert.deepEqual(f.events, []);
  f.eventSub('cheer');
  assert.deepEqual(f.events, ['cheer']);
  assert.equal(f.game.freeHitNext, true);
});
