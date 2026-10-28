#!/usr/bin/env node
'use strict';
// Twitch Device Code Grant helper. Needs only a client ID (public client, no secret).
// Usage: node scripts/twitch-auth.js start   -> prints the activation URL + code, then polls and saves tokens
//        node scripts/twitch-auth.js refresh -> refreshes saved tokens
//        node scripts/twitch-auth.js check   -> validates saved tokens (prints login/scopes/expiry, never the token)
// Secrets dir (mode 600 files): SECRETS_DIR or /workspace/devpost/secrets
//   twitch_client_id.txt  (required)   twitch_client_secret.txt (optional)   twitch_tokens.json (written here)
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.SECRETS_DIR || '/workspace/devpost/secrets';
const SCOPES = 'chat:read chat:edit channel:read:redemptions bits:read moderator:read:followers';
const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return ''; } };
const clientId = read('twitch_client_id.txt');
const tokenFile = path.join(dir, 'twitch_tokens.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function save(t) { fs.writeFileSync(tokenFile, JSON.stringify({ ...t, saved_at: Date.now() }), { mode: 0o600 }); fs.chmodSync(tokenFile, 0o600); }
const load = () => JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
async function post(url, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function validate(access) {
  const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${access}` } });
  return r.ok ? r.json() : null;
}
async function refresh() {
  const t = load();
  const params = { client_id: clientId, grant_type: 'refresh_token', refresh_token: t.refresh_token };
  const secret = read('twitch_client_secret.txt'); if (secret) params.client_secret = secret;
  const { status, body } = await post('https://id.twitch.tv/oauth2/token', params);
  if (status !== 200) throw new Error(`refresh failed (${status}): ${body.message || 'unknown'}. Re-run "start".`);
  save(body); return body;
}
async function start() {
  const d = await post('https://id.twitch.tv/oauth2/device', { client_id: clientId, scopes: SCOPES });
  if (d.status !== 200) throw new Error(`device request failed (${d.status}): ${d.body.message || ''}`);
  console.log(`ACTIVATE_URL=${d.body.verification_uri}\nUSER_CODE=${d.body.user_code}\nExpires in ${d.body.expires_in}s. Open the URL logged in as the streamer account and click Authorize.`);
  const end = Date.now() + d.body.expires_in * 1000;
  while (Date.now() < end) {
    await sleep((d.body.interval || 5) * 1000);
    const { status, body } = await post('https://id.twitch.tv/oauth2/token', {
      client_id: clientId, scopes: SCOPES, device_code: d.body.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    if (status === 200) { save(body); console.log('AUTHORIZED. Tokens saved (mode 600).'); return check(); }
    if (body.message !== 'authorization_pending') throw new Error(`token poll failed (${status}): ${body.message}`);
  }
  throw new Error('Code expired; run start again.');
}
async function check() {
  let t = load(); let v = await validate(t.access_token);
  if (!v) { t = await refresh(); v = await validate(t.access_token); }
  if (!v) throw new Error('token invalid');
  console.log(JSON.stringify({ login: v.login, user_id: v.user_id, expires_in: v.expires_in, scopes: v.scopes }));
  return v;
}
module.exports = { refresh, validate, load, read };
if (require.main === module) {
  if (!clientId) { console.error(`Missing ${dir}/twitch_client_id.txt`); process.exit(2); }
  const cmd = process.argv[2];
  ({ start, refresh: async () => { await refresh(); return check(); }, check }[cmd] || (async () => { console.error('usage: start|refresh|check'); process.exit(2); }))()
    .catch(e => { console.error(e.message); process.exit(1); });
}
