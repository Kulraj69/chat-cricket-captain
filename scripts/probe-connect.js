'use strict';
// Diagnostic: does /mock reach "SCOREBOARD CONNECTED" after a mid-test navigation?
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createApp } = require('../server');
const pause = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-chrome-'));
  const app = createApp({ env: { MOCK_MODE: '1' } });
  let chrome, socket;
  try {
    const address = await app.start(0);
    const base = `http://127.0.0.1:${address.port}`;
    chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 100 && !port; i += 1) {
      try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
      catch { await pause(50); }
    }
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base + '/mock')}`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.once('open', res); socket.once('error', rej); });
    let id = 0; const pending = new Map();
    socket.on('message', raw => { const p = JSON.parse(raw.toString()); if (p.id && pending.has(p.id)) { const { resolve } = pending.get(p.id); pending.delete(p.id); resolve(p.result); } });
    const cdp = (method, params = {}) => new Promise(res => { const k = ++id; pending.set(k, { resolve: res }); socket.send(JSON.stringify({ id: k, method, params })); });
    const ev = async e => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await pause(1500);
    console.log('first load:', await ev('({conn: document.getElementById("connection")?.textContent, resetDisabled: document.getElementById("reset")?.disabled})'));
    // now navigate away and back, mimicking the test
    await cdp('Page.navigate', { url: base + '/overlay' });
    await pause(1200);
    await cdp('Page.navigate', { url: base + '/mock' });
    for (let t = 0; t < 12; t += 1) {
      const s = await ev('({conn: document.getElementById("connection")?.textContent, resetDisabled: document.getElementById("reset")?.disabled, href: location.pathname})');
      console.log(`t+${t * 400}ms`, s);
      await pause(400);
    }
    await cdp('Runtime.evaluate', { expression: '(function(){window.__rc=0;var b=document.getElementById("reset");b.addEventListener("click",function(){window.__rc+=1;});b.click();return 1;})()' });
    await pause(1200);
    console.log('after click:', await ev('({rc: window.__rc, disabled: document.getElementById("reset").disabled, feedback: document.getElementById("feedback").textContent})'));
  } finally {
    socket?.terminate();
    if (chrome && chrome.exitCode === null) { chrome.kill(); await pause(500); }
    await app.stop();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });