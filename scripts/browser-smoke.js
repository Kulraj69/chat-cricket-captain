'use strict';

// Optional real-browser check. Uses an installed Chrome and the existing ws dependency.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createApp } = require('../server');
const { fakeClock } = require('../test-support/clock');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cricket-chrome-'));
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'cricket-browser-check-'));
  const clock = fakeClock();
  const app = createApp({ env: { MOCK_MODE: '1' }, matchOptions: { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer } });
  let chrome;
  let socket;
  try {
    const address = await app.start(0);
    let launchError;
    chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
    chrome.on('error', () => { launchError = true; });
    let port;
    for (let i = 0; i < 100 && !port; i += 1) {
      if (launchError) throw new Error('Chrome not found. Set CHROME_BIN to an installed Chrome executable');
      try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
      catch { await pause(50); }
    }
    assert.ok(port, 'Chrome must expose its local debugging endpoint');
    const base = `http://127.0.0.1:${address.port}`;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base + '/mock')}`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    let id = 0;
    const pending = new Map();
    const errors = [];
    socket.on('message', raw => {
      const packet = JSON.parse(raw.toString());
      if (packet.method === 'Runtime.exceptionThrown') errors.push(packet.params.exceptionDetails.text);
      if (packet.id && pending.has(packet.id)) {
        const { resolve, reject } = pending.get(packet.id); pending.delete(packet.id);
        if (packet.error) reject(new Error(packet.error.message)); else resolve(packet.result);
      }
    });
    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
    }
    async function evaluate(expression) {
      const value = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!value.exceptionDetails, 'browser evaluation should succeed');
      return value.result.value;
    }
    async function until(expression) {
      for (let i = 0; i < 100; i += 1) { if (await evaluate(expression)) return; await pause(50); }
      assert.fail(`Browser condition timed out: ${expression}`);
    }
    async function screenshot(name) {
      await pause(400); // Let bar transitions and the current reveal settle before capture.
      const capture = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.writeFile(path.join(output, name + '.png'), Buffer.from(capture.data, 'base64'));
    }
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await until('document.getElementById("demo") && !document.getElementById("demo").disabled');
    await evaluate('document.getElementById("demo").click()');
    await until('document.getElementById("voteState").textContent === "SCRIPTED PLAYBACK"');
    clock.advance(4200);
    await until('document.querySelector("iframe").contentDocument.getElementById("voteCount").textContent === "4 VOTES"');
    await screenshot('control-room');
    // Confirm that user names remain literal text, even when they contain HTML syntax.
    await evaluate('document.getElementById("reset").click()');
    await until('!document.getElementById("send").disabled');
    await evaluate('document.getElementById("user").value = "<img src=x>"; document.getElementById("send").click()');
    await until('document.getElementById("feedback").textContent.includes("accepted")');
    assert.equal(await evaluate('document.querySelector("iframe").contentDocument.querySelector("#mvp .name").textContent'), '<img src=x>');
    assert.equal(await evaluate('document.querySelector("iframe").contentDocument.querySelectorAll("#mvp img").length'), 0);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'control room must fit a mobile viewport');
    await screenshot('control-room-mobile');
    await cdp('Page.navigate', { url: base + '/overlay' });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await until('document.getElementById("connection")?.textContent === "● SCOREBOARD CONNECTED"');
    app.match.reset(true);
    clock.advance(4200);
    await until('document.getElementById("voteCount").textContent === "4 VOTES"');
    await screenshot('overlay-voting');
    const bounds = await evaluate('Array.from(document.querySelectorAll(".scoreboard,.vote-panel,.right-rail,.ticker")).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}})');
    assert.ok(bounds.every(r => r.left >= 0 && r.top >= 0 && r.right <= 1920 && r.bottom <= 1080), 'broadcast panels must stay inside the canvas');
    clock.advance(11000); // second-ball wicket, before the automatic review
    await until('document.getElementById("wickets").textContent === "1"');
    clock.advance(1600);
    await until('document.getElementById("momentTitle").textContent === "NOT OUT"');
    await screenshot('overlay-review');
    clock.advance(29200); // final vote window
    await until('document.getElementById("remaining").textContent === "1"');
    await screenshot('overlay-last-ball');
    clock.advance(6000);
    await until('document.getElementById("runs").textContent === "16"');
    assert.equal(await evaluate('document.getElementById("end").hidden'), true, 'final delivery must be visible before victory card');
    await until('!document.getElementById("end").hidden');
    assert.equal(await evaluate('document.getElementById("endTitle").textContent'), 'CHAT WINS!');
    await screenshot('overlay-win');
    await cdp('Page.reload');
    await until('document.getElementById("endTitle")?.textContent === "CHAT WINS!"');
    assert.equal(await evaluate('document.querySelectorAll("#recentBalls .ball-chip").length'), 6);
    assert.equal(await evaluate('getComputedStyle(document.body).backgroundColor'), 'rgba(0, 0, 0, 0)');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await screenshot('overlay-720p');
    assert.deepEqual(errors, [], 'no uncaught browser exceptions');
    console.log(`Browser smoke check passed. Screenshots: ${output}`);
  } finally {
    socket?.terminate();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill(); await Promise.race([exited, pause(3000)]);
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
    }
    await app.stop();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
