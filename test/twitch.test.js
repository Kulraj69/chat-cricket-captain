'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TwitchBridge } = require('../src/twitch');

test('EventSub payloads map to the same commands used in mock mode', () => {
  const events = [];
  const bridge = new TwitchBridge({ env: {}, onMessage: () => {}, onEvent: (type, payload) => events.push({ type, payload }) });
  bridge.routeNotification({ subscription: { type: 'channel.channel_points_custom_reward_redemption.add' }, event: { user_name: 'Reviewer', reward: { title: 'DRS' } } });
  bridge.routeNotification({ subscription: { type: 'channel.cheer' }, event: { user_name: 'Booster', bits: 1 } });
  bridge.routeNotification({ subscription: { type: 'channel.raid' }, event: { from_broadcaster_user_name: 'Raider', viewers: 1 } });
  bridge.routeNotification({ subscription: { type: 'channel.follow' }, event: {} });
  assert.deepEqual(events, [
    { type: 'channelPointRedeem', payload: { user: 'Reviewer', title: 'DRS' } },
    { type: 'cheer', payload: { user: 'Booster', bits: 1 } },
    { type: 'raid', payload: { user: 'Raider', viewers: 1 } }
  ]);
});

test('EventSub subscriptions contain the required conditions and WebSocket session', async () => {
  const requests = [];
  const bridge = new TwitchBridge({ env: { TWITCH_BROADCASTER_ID: 'broadcaster-fixture', TWITCH_MODERATOR_ID: 'moderator-fixture' } });
  bridge.helix = async (path, options) => requests.push({ path, body: JSON.parse(options.body) });
  await bridge.subscribeEventSub('session-fixture');
  assert.deepEqual(requests.map(request => [request.body.type, request.body.condition]), [
    ['channel.channel_points_custom_reward_redemption.add', { broadcaster_user_id: 'broadcaster-fixture' }],
    ['channel.cheer', { broadcaster_user_id: 'broadcaster-fixture' }],
    ['channel.raid', { to_broadcaster_user_id: 'broadcaster-fixture' }],
    ['channel.follow', { broadcaster_user_id: 'broadcaster-fixture', moderator_user_id: 'moderator-fixture' }]
  ]);
  assert.ok(requests.every(request => request.path === '/eventsub/subscriptions' && request.body.transport.session_id === 'session-fixture'));
});

test('Twitch errors report useful status without forwarding upstream error text', async () => {
  const statuses = [];
  const bridge = new TwitchBridge({ env: {}, onStatus: status => statuses.push(status) });
  assert.equal(await bridge.start(), false);
  const fail = async () => { throw new Error('private-upstream-test-marker'); };
  bridge.chat = { say: fail };
  await bridge.announce('Test announcement');
  bridge.helix = fail;
  await bridge.subscribeEventSub('session-fixture');
  assert.ok(statuses.some(status => status.includes('Chat announce failed')));
  assert.ok(statuses.some(status => status.includes('EventSub setup failed')));
  assert.equal(statuses.join(' ').includes('private-upstream-test-marker'), false);
});
