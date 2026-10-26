'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { CricketGame, parseMessage } = require('./src/game');
const { TwitchBridge } = require('./src/twitch');

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
let game = createGame();
let ballTimer = null;
let nextTimer = null;
const sockets = new Set();
let twitchStatus = 'Starting…';

function createGame() {
  return new CricketGame({
    voteWindowMs: Number(process.env.VOTE_WINDOW_MS) || 15000,
    target: Number(process.env.TARGET) || 36,
    maxOvers: Number(process.env.MAX_OVERS) || 3
  });
}

function state() {
  return { ...game.getState(), twitchStatus };
}

function broadcast(type = 'state', extra = {}) {
  const data = JSON.stringify({ type, state: state(), ...extra });
  for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(data);
}

function scheduleBall() {
  clearTimeout(ballTimer);
  if (game.status !== 'voting') return;
  ballTimer = setTimeout(resolveBall, game.voteWindowMs);
  ballTimer.unref();
}

function resolveBall() {
  const result = game.resolveBall();
  if (!result) return;
  broadcast('ball', { result });
  twitch.announce(`${result.commentary} Score: ${game.score}/${game.wickets} (${game.getState().overs})`);
  if (game.status === 'resolved') {
    nextTimer = setTimeout(() => {
      game.openNextBall();
      broadcast();
      scheduleBall();
    }, 3200);
    nextTimer.unref();
  } else {
    twitch.announce(game.status === 'won' ? `CHASE COMPLETE! Chat wins by ${10 - game.wickets} wickets!` : `Innings over. Chat finishes ${game.score}/${game.wickets}.`);
  }
}

function receiveMessage(user, message) {
  const shot = parseMessage(message);
  if (shot && game.vote(user, shot)) broadcast('vote');
}

function receiveEvent(type, payload) {
  const result = game.applyEvent(type, payload);
  if (result.applied) {
    broadcast('event', { event: type, eventResult: result });
    if (type === 'channelPointRedeem') twitch.announce(game.commentary);
  }
  return result;
}

const twitch = new TwitchBridge({
  onMessage: receiveMessage,
  onEvent: receiveEvent,
  onStatus: message => { twitchStatus = message; console.log(`[Twitch] ${message}`); broadcast(); }
});

const routes = { '/': 'mock.html', '/mock': 'mock.html', '/overlay': 'overlay.html' };
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100_000) request.destroy();
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, state());
    if (request.method === 'POST' && url.pathname === '/api/message') {
      const body = await readBody(request);
      receiveMessage(body.user, body.message);
      return json(response, 200, { ok: true, state: state() });
    }
    if (request.method === 'POST' && url.pathname === '/api/event') {
      const body = await readBody(request);
      return json(response, 200, { ok: true, result: receiveEvent(body.type, body) });
    }
    if (request.method === 'POST' && url.pathname === '/api/reset') {
      clearTimeout(ballTimer); clearTimeout(nextTimer);
      game = createGame();
      broadcast('reset'); scheduleBall();
      return json(response, 200, { ok: true, state: state() });
    }
    const filename = routes[url.pathname] || (url.pathname.startsWith('/public/') ? url.pathname.slice(8) : null);
    if (!filename || filename.includes('..')) { response.writeHead(404); return response.end('Not found'); }
    const filePath = path.join(publicDir, filename);
    const data = await fs.promises.readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    return response.end(data);
  } catch (error) {
    console.error(error);
    return json(response, 400, { ok: false, error: error.message });
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', socket => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: 'state', state: state() }));
  socket.on('close', () => sockets.delete(socket));
});

server.listen(PORT, () => {
  console.log(`Chat Cricket Captain: http://localhost:${PORT}/mock`);
  scheduleBall();
  twitch.start().catch(error => { twitchStatus = `Twitch unavailable: ${error.message}`; console.error(twitchStatus); broadcast(); });
});

async function shutdown() {
  clearTimeout(ballTimer); clearTimeout(nextTimer);
  await twitch.stop().catch(() => {});
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { server, receiveMessage, receiveEvent };
