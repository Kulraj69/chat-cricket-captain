'use strict';

const tmi = require('tmi.js');
const WebSocket = require('ws');

function cleanToken(value = '') {
  return value.replace(/^oauth:/, '');
}

class TwitchBridge {
  constructor({ onMessage, onEvent, onStatus = () => {} }) {
    this.onMessage = onMessage;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.channel = process.env.TWITCH_CHANNEL;
    this.chat = null;
    this.eventSocket = null;
    this.intentionalClose = false;
  }

  get chatConfigured() {
    return Boolean(this.channel && process.env.TWITCH_BOT_USERNAME && process.env.TWITCH_OAUTH_TOKEN);
  }

  get eventSubConfigured() {
    return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_USER_OAUTH_TOKEN && this.channel);
  }

  async start() {
    if (!this.chatConfigured) {
      this.onStatus('Mock mode: Twitch chat credentials not set');
      return false;
    }
    this.chat = new tmi.Client({
      options: { debug: false },
      identity: {
        username: process.env.TWITCH_BOT_USERNAME,
        password: process.env.TWITCH_OAUTH_TOKEN
      },
      channels: [this.channel]
    });
    this.chat.on('message', (_channel, tags, message, self) => {
      if (!self) this.onMessage(tags['display-name'] || tags.username || 'chatter', message);
    });
    this.chat.on('cheer', (_channel, tags) => {
      this.onEvent('cheer', { user: tags['display-name'], bits: Number(tags.bits || 0) });
    });
    this.chat.on('raided', (_channel, username, viewers) => {
      this.onEvent('raid', { user: username, viewers: Number(viewers || 0) });
    });
    await this.chat.connect();
    this.onStatus(`Connected to #${this.channel}`);
    if (this.eventSubConfigured) this.connectEventSub();
    return true;
  }

  async announce(text) {
    if (!this.chat || !text) return;
    try { await this.chat.say(this.channel, text); } catch (error) { this.onStatus(`Chat announce failed: ${error.message}`); }
  }

  async helix(path, options = {}) {
    const response = await fetch(`https://api.twitch.tv/helix${path}`, {
      ...options,
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${cleanToken(process.env.TWITCH_USER_OAUTH_TOKEN)}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`Helix ${response.status}: ${await response.text()}`);
    return response.json();
  }

  async userId(login) {
    const body = await this.helix(`/users?login=${encodeURIComponent(login)}`);
    if (!body.data?.[0]) throw new Error(`Twitch user not found: ${login}`);
    return body.data[0].id;
  }

  connectEventSub(url = 'wss://eventsub.wss.twitch.tv/ws') {
    this.eventSocket = new WebSocket(url);
    this.eventSocket.on('message', async raw => {
      try {
        const packet = JSON.parse(raw.toString());
        const kind = packet.metadata?.message_type;
        if (kind === 'session_welcome') await this.subscribeEventSub(packet.payload.session.id);
        if (kind === 'session_reconnect') {
          this.eventSocket.removeAllListeners('close');
          this.eventSocket.close();
          this.connectEventSub(packet.payload.session.reconnect_url);
        }
        if (kind === 'notification') this.routeNotification(packet.payload);
      } catch (error) {
        this.onStatus(`EventSub message error: ${error.message}`);
      }
    });
    this.eventSocket.on('error', error => this.onStatus(`EventSub error: ${error.message}`));
    this.eventSocket.on('close', () => {
      if (!this.intentionalClose) setTimeout(() => this.connectEventSub(), 3000).unref();
    });
  }

  async subscribeEventSub(sessionId) {
    try {
      const broadcasterId = process.env.TWITCH_BROADCASTER_ID || await this.userId(this.channel);
      const moderatorId = process.env.TWITCH_MODERATOR_ID || broadcasterId;
      const subscriptions = [
        ['channel.channel_points_custom_reward_redemption.add', '1', { broadcaster_user_id: broadcasterId }],
        ['channel.cheer', '1', { broadcaster_user_id: broadcasterId }],
        ['channel.raid', '1', { to_broadcaster_user_id: broadcasterId }],
        ['channel.follow', '2', { broadcaster_user_id: broadcasterId, moderator_user_id: moderatorId }]
      ];
      for (const [type, version, condition] of subscriptions) {
        await this.helix('/eventsub/subscriptions', {
          method: 'POST',
          body: JSON.stringify({ type, version, condition, transport: { method: 'websocket', session_id: sessionId } })
        });
      }
      this.onStatus('EventSub connected (redemptions, cheers, raids, follows)');
    } catch (error) {
      this.onStatus(`EventSub setup failed: ${error.message}`);
    }
  }

  routeNotification(payload) {
    const type = payload.subscription?.type;
    const event = payload.event || {};
    if (type === 'channel.channel_points_custom_reward_redemption.add') {
      this.onEvent('channelPointRedeem', { user: event.user_name, title: event.reward?.title });
    } else if (type === 'channel.cheer') {
      this.onEvent('cheer', { user: event.user_name, bits: event.bits });
    } else if (type === 'channel.raid') {
      this.onEvent('raid', { user: event.from_broadcaster_user_name, viewers: event.viewers });
    }
  }

  async stop() {
    this.intentionalClose = true;
    if (this.eventSocket) this.eventSocket.close();
    if (this.chat) await this.chat.disconnect();
  }
}

module.exports = { TwitchBridge };
