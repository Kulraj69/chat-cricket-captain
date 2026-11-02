'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const { createApp } = require('../server');

async function start(t, extraEnv = {}) {
  const app = createApp({ env: { MOCK_MODE: '1', VOTE_WINDOW_MS: '60000', ...extraEnv } });
  const address = await app.start(0);
  t.after(() => app.stop());
  return { app, base: `http://127.0.0.1:${address.port}` };
}

async function vote(base, headers = {}) {
  return fetch(base + '/api/message', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ user: 'fixture', message: '!six' })
  });
}

function socketResult(base, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws', origin === undefined ? {} : { origin });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('Handshake timeout')); }, 2000);
    socket.on('error', () => {});
    socket.once('message', raw => {
      clearTimeout(timer); socket.close(); resolve({ status: 101, state: JSON.parse(raw).state });
    });
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer); response.resume(); socket.terminate(); resolve({ status: response.statusCode });
    });
  });
}

test('actions require the exact JSON media type before changing the match', async t => {
  const { app, base } = await start(t);
  for (const type of ['text/plain', 'application/jsonp', 'application/json-invalid', 'application/x-www-form-urlencoded']) {
    const response = await vote(base, { 'content-type': type });
    assert.equal(response.status, 415, type);
    assert.equal(app.match.getState().totalVotes, 0);
  }
  const accepted = await vote(base, { 'content-type': 'Application/JSON; charset=utf-8', origin: base });
  assert.equal(accepted.status, 200);
  assert.equal(app.match.getState().totalVotes, 1);
});

test('malformed and cross-origin browser action requests are forbidden', async t => {
  const { app, base } = await start(t);
  for (const origin of ['null', 'invalid', 'https://unrelated.example', base + '/path', base + '?x=1', base.replace('http:', 'ftp:'), base.replace('http://', 'http://user@')]) {
    assert.equal((await vote(base, { origin })).status, 403, origin);
    assert.equal(app.match.getState().totalVotes, 0);
  }
  assert.equal((await vote(base)).status, 200, 'no-Origin local CLI remains supported');
});

test('WebSockets reject foreign origins but support local browsers and CLI viewers', async t => {
  const { base } = await start(t);
  for (const origin of ['https://unrelated.example', 'null', base + '/path']) {
    assert.equal((await socketResult(base, origin)).status, 403, origin);
  }
  for (const origin of [base, undefined]) {
    const result = await socketResult(base, origin);
    assert.equal(result.status, 101);
    assert.equal(result.state.mode, 'mock');
  }
});

test('a split UTF-8 event username is preserved rather than corrupted', async t => {
  const { app, base } = await start(t);
  const user = 'कुलराज';
  const payload = Buffer.from(JSON.stringify({ type: 'cheer', user }));
  const split = payload.indexOf(Buffer.from(user)) + 1;
  const result = await new Promise((resolve, reject) => {
    const request = http.request(base + '/api/event', {
      method: 'POST', headers: { 'content-type': 'application/json' }
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    request.on('error', reject);
    request.write(payload.subarray(0, split));
    setTimeout(() => request.end(payload.subarray(split)), 20);
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(app.match.getState().commentary, `Free Hit armed by ${user}! Next ball cannot be a wicket.`);
});

test('invalid UTF-8 and actual byte overflow cannot mutate state', async t => {
  const { app, base } = await start(t);
  const malformed = Buffer.concat([Buffer.from('{"type":"cheer","user":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]);
  const empty = JSON.stringify({ type: 'cheer', user: 'é', padding: '' });
  const exact = JSON.stringify({ type: 'cheer', user: 'é', padding: 'x'.repeat(8192 - Buffer.byteLength(empty)) });
  for (const body of [malformed, exact + ' ']) {
    const response = await fetch(base + '/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(response.status, 400);
    assert.equal(app.match.getState().freeHitNext, false);
  }
  assert.equal(Buffer.byteLength(exact), 8192);
  const response = await fetch(base + '/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: exact });
  assert.equal(response.status, 200);
  assert.equal(app.match.getState().freeHitNext, true);
});

test('same-host HTTPS proxy origins work without trusting forwarded headers', async t => {
  const { base } = await start(t);
  const secureOrigin = base.replace('http:', 'https:');
  assert.equal((await vote(base, { origin: secureOrigin })).status, 200);
  assert.equal((await socketResult(base, secureOrigin)).status, 101);
  assert.equal((await vote(base, { origin: 'https://foreign.example', 'x-forwarded-host': 'foreign.example' })).status, 403);
});

test('read-only mode keeps local overlay sockets but forbids browser cross-origin sockets and actions', async t => {
  const { app, base } = await start(t, { PUBLIC_READONLY: '1' });
  assert.equal((await socketResult(base, base)).status, 101);
  assert.equal((await socketResult(base, undefined)).status, 101);
  assert.equal((await socketResult(base, 'https://foreign.example')).status, 403);
  for (const path of ['/api/message', '/api/event', '/api/reset', '/api/demo']) {
    const response = await fetch(base + path, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403, path);
  }
  assert.equal(app.match.getState().totalVotes, 0);
});

