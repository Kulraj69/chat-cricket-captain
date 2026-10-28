'use strict';

const tmi = require('tmi.js');
const WebSocket = require('ws');

function cleanToken(value = '') {
  return value.replace(/^oauth:/, '');
}

class TwitchBridge {
  constructor({ onMessage, onEvent, onStatus = () => {}, env = process.env,
    socketFactory = url => new WebSocket(url), setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.env = env;
    this.onMessage = onMessage;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.channel = this.env.TWITCH_CHANNEL;
    this.chat = null;
    this.eventSocket = null;
    this.intentionalClose = false;
    this.abortController = new AbortController();
    this.socketFactory = socketFactory;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.eventConnections = new Map();
    this.reconnectTimer = null;
  }

  get chatConfigured() {
    return Boolean(this.channel && this.env.TWITCH_BOT_USERNAME && this.env.TWITCH_OAUTH_TOKEN);
  }

  get eventSubConfigured() {
    return Boolean(this.env.TWITCH_CLIENT_ID && this.env.TWITCH_USER_OAUTH_TOKEN && this.channel);
  }

  async start() {
    if (this.intentionalClose) return false;
    if (!this.chatConfigured) {
      this.onStatus('Mock mode: Twitch chat credentials not set');
      return false;
    }
    this.chat = new tmi.Client({
      options: { debug: false },
      identity: {
        username: this.env.TWITCH_BOT_USERNAME,
        password: this.env.TWITCH_OAUTH_TOKEN
      },
      channels: [this.channel]
    });
    // tmi's queued reconnect calls this method even after disconnect().
    const connectChat = this.chat.connect.bind(this.chat);
    this.chat.connect = () => this.intentionalClose ? Promise.resolve() : connectChat();
    this.chat.on('message', (_channel, tags, message, self) => {
      if (!self && !this.intentionalClose) this.onMessage(tags['display-name'] || tags.username || 'chatter', message);
    });
    this.chat.on('cheer', (_channel, tags) => {
      if (this.intentionalClose) return;
      this.onEvent('cheer', { user: tags['display-name'], bits: Number(tags.bits || 0) });
    });
    this.chat.on('raided', (_channel, username, viewers) => {
      if (this.intentionalClose) return;
      this.onEvent('raid', { user: username, viewers: Number(viewers || 0) });
    });
    await this.chat.connect();
    if (this.intentionalClose) {
      await this.stopChat();
      return false;
    }
    this.onStatus(`Connected to #${this.channel}`);
    if (this.eventSubConfigured) this.connectEventSub();
    return true;
  }

  async announce(text) {
    if (this.intentionalClose || !this.chat || !text) return;
    try { await this.chat.say(this.channel, text); } catch (error) {
      if (!this.intentionalClose) this.onStatus('Chat announce failed; check connection and bot permissions');
    }
  }

  async stopChat() {
    if (!this.chat) return;
    this.chat.reconnect = false;
    if (this.chat.readyState?.() === 'CLOSED') return;
    await this.chat.disconnect();
  }

  async helix(path, options = {}) {
    this.abortController.signal.throwIfAborted();
    const response = await fetch(`https://api.twitch.tv/helix${path}`, {
      ...options,
      signal: this.abortController.signal,
      headers: {
        'Client-Id': this.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${cleanToken(this.env.TWITCH_USER_OAUTH_TOKEN)}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`Helix request failed (${response.status})`);
    return response.json();
  }

  async userId(login) {
    const body = await this.helix(`/users?login=${encodeURIComponent(login)}`);
    if (!body.data?.[0]) throw new Error(`Twitch user not found: ${login}`);
    return body.data[0].id;
  }

  retireEventSocket(socket) {
    const state = this.eventConnections.get(socket);
    if (!state) return;
    this.clearTimer(state.timer);
    this.eventConnections.delete(socket);
    // Connecting sockets cannot complete a graceful WebSocket close.
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    else socket.close();
  }

  retryEventSub() {
    if (this.intentionalClose || this.reconnectTimer !== null) return;
    for (const socket of this.eventConnections.keys()) this.retireEventSocket(socket);
    this.eventSocket = null;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connectEventSub();
    }, 3000);
    this.reconnectTimer?.unref?.();
  }

  connectEventSub(url = 'wss://eventsub.wss.twitch.tv/ws', previous = null) {
    if (this.intentionalClose || (!previous && this.eventConnections.size)) return;
    let socket;
    try { socket = this.socketFactory(url); } catch (error) {
      this.onStatus('EventSub connection error');
      this.retryEventSub();
      return;
    }
    const setup = previous ? this.eventConnections.get(previous).setup : { socket: null, sessionId: null };
    const state = { welcomed: false, timeout: 10000, timer: null, replacing: false, setup };
    this.eventConnections.set(socket, state);
    if (!previous) this.eventSocket = socket;
    const active = () => !this.intentionalClose && this.eventConnections.has(socket);
    const arm = () => {
      this.clearTimer(state.timer);
      state.timer = this.setTimer(() => {
        if (active()) {
          this.onStatus('EventSub timed out; reconnecting');
          this.retryEventSub();
        }
      }, state.timeout);
      state.timer?.unref?.();
    };
    arm(); // Also bounds a connection that never receives its welcome.
    socket.on('message', async raw => {
      if (!active()) return;
      try {
        const packet = JSON.parse(raw.toString());
        const kind = packet.metadata?.message_type;
        if (kind === 'session_welcome' && !state.welcomed) {
          const session = packet.payload.session;
          if (typeof session.id !== 'string' || !session.id) throw new Error('Missing session');
          const seconds = session.keepalive_timeout_seconds;
          if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new Error('Invalid keepalive');
          state.welcomed = true;
          state.timeout = seconds * 1000;
          this.eventSocket = socket;
          setup.socket = socket;
          setup.sessionId = session.id;
          arm();
          if (previous) this.retireEventSocket(previous);
          else await this.subscribeEventSub(() => setup.sessionId,
            () => !this.intentionalClose && this.eventConnections.has(setup.socket));
        } else if (kind === 'session_reconnect' && state.welcomed && !state.replacing) {
          const reconnectUrl = packet.payload.session.reconnect_url;
          const parsed = new URL(reconnectUrl);
          if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv' || parsed.username || parsed.password || parsed.port) throw new Error('Invalid reconnect URL');
          state.replacing = true;
          state.timeout = 30000;
          arm();
          this.connectEventSub(reconnectUrl, socket);
        } else if ((kind === 'notification' || kind === 'session_keepalive') && state.welcomed) {
          arm();
          if (kind === 'notification') this.routeNotification(packet.payload);
        } else if (kind === 'revocation') {
          this.onStatus('EventSub subscription revoked; check authorization and reconnect');
        }
      } catch (error) {
        if (active()) this.onStatus('EventSub message failed; check connection and permissions');
      }
    });
    socket.on('error', () => { if (active()) this.onStatus('EventSub connection error'); });
    socket.on('close', () => { if (active()) this.retryEventSub(); });
  }

  async subscribeEventSub(sessionId, isCurrent = () => true) {
    if (this.intentionalClose || !isCurrent()) return;
    try {
      const broadcasterId = this.env.TWITCH_BROADCASTER_ID || await this.userId(this.channel);
      const moderatorId = this.env.TWITCH_MODERATOR_ID || broadcasterId;
      const subscriptions = [
        ['channel.channel_points_custom_reward_redemption.add', '1', { broadcaster_user_id: broadcasterId }],
        ['channel.cheer', '1', { broadcaster_user_id: broadcasterId }],
        ['channel.raid', '1', { to_broadcaster_user_id: broadcasterId }],
        ['channel.follow', '2', { broadcaster_user_id: broadcasterId, moderator_user_id: moderatorId }]
      ];
      for (const [type, version, condition] of subscriptions) {
        if (this.intentionalClose || !isCurrent()) return;
        await this.helix('/eventsub/subscriptions', {
          method: 'POST',
          body: JSON.stringify({ type, version, condition, transport: { method: 'websocket', session_id: typeof sessionId === 'function' ? sessionId() : sessionId } })
        });
      }
      if (!this.intentionalClose && isCurrent()) this.onStatus('EventSub connected (redemptions, cheers, raids, follows)');
    } catch (error) {
      if (!this.intentionalClose && isCurrent()) this.onStatus('EventSub setup failed; check user token and scopes');
    }
  }

  routeNotification(payload) {
    if (this.intentionalClose) return;
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
    this.abortController.abort();
    this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const socket of this.eventConnections.keys()) this.retireEventSocket(socket);
    this.eventSocket = null;
    await this.stopChat();
  }
}

module.exports = { TwitchBridge };
