#!/usr/bin/env node
'use strict';
// Starts the game against the streamer's real Twitch channel using saved tokens (never prints them).
// Optional env: TWITCH_CHANNEL (default: the authorised account), PORT (default 3000), PUBLIC_READONLY=1 + HOST=0.0.0.0 to expose only the overlay.
const { spawn } = require('node:child_process');
const path = require('node:path');
const auth = require('./twitch-auth');
(async () => {
  let t = auth.load(); let v = await auth.validate(t.access_token);
  if (!v) { t = await auth.refresh(); v = await auth.validate(t.access_token); }
  if (!v) throw new Error('Twitch token invalid; run: node scripts/twitch-auth.js start');
  const need = ['chat:read', 'chat:edit'];
  if (need.some(s => !v.scopes.includes(s))) throw new Error('Token lacks chat scopes; re-run start');
  const env = { ...process.env, MOCK_MODE: '0',
    TWITCH_CHANNEL: process.env.TWITCH_CHANNEL || v.login, TWITCH_BOT_USERNAME: v.login,
    TWITCH_OAUTH_TOKEN: `oauth:${t.access_token}`, TWITCH_CLIENT_ID: auth.read('twitch_client_id.txt'),
    TWITCH_USER_OAUTH_TOKEN: t.access_token, TWITCH_BROADCASTER_ID: v.user_id };
  console.log(`Starting live: channel #${env.TWITCH_CHANNEL} as ${v.login}; overlay http://127.0.0.1:${env.PORT || 3000}/overlay`);
  // Tokens last ~4h; refresh restarts are manual for a short test.
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'inherit' });
  child.on('exit', c => process.exit(c ?? 0));
})().catch(e => { console.error(e.message); process.exit(1); });
