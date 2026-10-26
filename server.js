'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const { MatchController } = require('./src/match');
const { TwitchBridge } = require('./src/twitch');

const publicDir = path.join(__dirname, 'public');
const routes = { '/': 'mock.html', '/mock': 'mock.html', '/overlay': 'overlay.html' };
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 8192) throw new Error('Request too large');
  }
  const body = JSON.parse(raw || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected an object');
  return body;
}

function createApp({ env = process.env, bridgeFactory, matchOptions = {} } = {}) {
  const sockets = new Set();
  const liveConfigured = env.MOCK_MODE !== '1' && Boolean(env.TWITCH_CHANNEL && env.TWITCH_BOT_USERNAME && env.TWITCH_OAUTH_TOKEN);
  let twitchStatus = liveConfigured ? 'Connecting to Twitch' : 'Mock mode · simulated events';
  const state = () => ({ ...match.getState(), twitchStatus, mode: liveConfigured ? 'twitch' : 'mock' });
  function broadcast(packet = { type: 'state' }) {
    const data = JSON.stringify({ ...packet, state: state() });
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }
  const match = new MatchController({
    gameOptions: { voteWindowMs: env.VOTE_WINDOW_MS, target: env.TARGET, maxOvers: env.MAX_OVERS },
    ...matchOptions,
    onUpdate: broadcast,
    announce: text => { void twitch.announce(text); }
  });
  const twitch = (bridgeFactory || (callbacks => new TwitchBridge({ ...callbacks, env })))({
    onMessage: (user, message) => match.receiveMessage(user, message),
    onEvent: (type, payload) => match.receiveEvent(type, payload),
    onStatus: message => { twitchStatus = message; broadcast(); }
  });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, state());
      if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
        // The control room is a local operator surface, not a public Twitch extension.
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) {
          return json(response, 403, { ok: false, error: 'Use the control room on this server' });
        }
        const body = await readBody(request);
        if (url.pathname === '/api/message') {
          const result = match.receiveMessage(body.user, body.message);
          return json(response, 200, { ok: result.accepted, result, state: state() });
        }
        if (url.pathname === '/api/event') {
          if (body.user !== undefined && (typeof body.user !== 'string' || body.user.length > 25)) {
            return json(response, 400, { ok: false, error: 'Invalid event username' });
          }
          const result = match.receiveEvent(body.type, body);
          return json(response, 200, { ok: result.applied, result, state: state() });
        }
        if (url.pathname === '/api/reset' || url.pathname === '/api/demo') {
          if (url.pathname === '/api/demo' && liveConfigured) {
            return json(response, 409, { ok: false, error: 'Showcase requires mock mode. Start with MOCK_MODE=1' });
          }
          match.reset(url.pathname === '/api/demo');
          return json(response, 200, { ok: true, state: state() });
        }
        return json(response, 404, { ok: false, error: 'Unknown action' });
      }
      if (request.method !== 'GET') return json(response, 405, { ok: false, error: 'Method not allowed' });
      const filename = routes[url.pathname] || (/^\/public\/[a-zA-Z0-9_-]+\.(css|js)$/.test(url.pathname) ? url.pathname.slice(8) : null);
      if (!filename) return json(response, 404, { ok: false, error: 'Not found' });
      let data;
      try { data = await fs.promises.readFile(path.join(publicDir, filename)); }
      catch { return json(response, 404, { ok: false, error: 'Not found' }); }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filename)], 'Cache-Control': 'no-store' });
      response.end(data);
    } catch {
      // Never echo request contents, tokens, or upstream error bodies.
      json(response, 400, { ok: false, error: 'Invalid request: send a JSON object within 8 KB' });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.send(JSON.stringify({ type: 'state', state: state() }));
    socket.on('close', () => sockets.delete(socket));
  });

  return {
    server, match,
    async start(port = Number(env.PORT) || 3000, host = env.HOST || '127.0.0.1') {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
      });
      match.start();
      if (liveConfigured) void twitch.start().catch(() => {
        twitchStatus = 'Twitch unavailable. Check credentials and network'; broadcast();
      });
      return server.address();
    },
    async stop() {
      match.stop();
      for (const socket of sockets) socket.terminate();
      wss.close();
      await twitch.stop().catch(() => {});
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  };
}

if (require.main === module) {
  const app = createApp();
  app.start().then(address => {
    console.log(`Chat Cricket Captain: http://localhost:${address.port}/mock`);
  }).catch(() => { console.error('Could not start server. Check HOST and PORT'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.stop(); });
}

module.exports = { createApp };
