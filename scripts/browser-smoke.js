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
    await until('document.getElementById("connection")?.textContent === "● SCOREBOARD CONNECTED"');
    await until('(async () => { const state = await (await fetch("/api/state")).json(); return state.status === "voting" && !state.demo; })()');
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
    // Synthetic clock/RNG, real controller, localhost packets and browser DOM.
    await cdp('Page.navigate', { url: base + '/mock' });
    // Wait for the socket to actually connect before driving the control room.
    // The reset button is enabled in the static HTML, so checking `!disabled` alone
    // can pass while the page is still offline and the button is briefly disabled.
    await until('document.getElementById("connection")?.textContent === "● SCOREBOARD CONNECTED"');
    await until('document.getElementById("reset") && !document.getElementById("reset").disabled');
    const overlay = 'document.querySelector("iframe").contentDocument';
    let manualCalls = 0;
    async function manual(options, votes = []) {
      manualCalls += 1;
      app.match.gameOptions = { ...app.match.gameOptions, ...options };
      const previous = app.match.game;
      const beforeDisabled = await evaluate('document.getElementById("reset").disabled');
      await evaluate('(() => { window.__rc = 0; document.getElementById("reset").addEventListener("click", () => { window.__rc += 1; }); return true; })()');
      await evaluate('document.getElementById("reset").click()');
      for (let i = 0; i < 100 && app.match.game === previous; i += 1) await pause(50);
      if (app.match.game === previous) {
        const diag = await evaluate('({disabled: document.getElementById("reset").disabled, rc: window.__rc, feedback: document.getElementById("feedback").textContent})');
        console.error(`manual call ${manualCalls} reset no-op: beforeDisabled=${beforeDisabled} after=${JSON.stringify(diag)}`);
      }
      assert.notEqual(app.match.game, previous, 'reset must finish before advancing the fake clock');
      await until('!document.getElementById("send").disabled');
      for (const [user, shot] of votes) assert.ok(app.match.receiveMessage(user, shot).accepted);
      clock.advance(app.match.game.voteWindowMs);
      await until('document.getElementById("send").disabled');
    }
    await manual({ maxOvers: 1, maxWickets: 10, target: 100, rng: () => 0 });
    await until(`${overlay}.getElementById('voteLabel').textContent === 'NO VOTES · !DEFEND'`);
    assert.equal(await evaluate(`${overlay}.getElementById('ballStatus').textContent`), 'NO VOTES. DEFAULT DEFEND.');
    await manual({ rng: () => 0.7 }, [['a', '!drive'], ['b', '!six']]);
    await until(`${overlay}.getElementById('voteLabel').textContent.startsWith('TIE ·')`);
    assert.match(await evaluate(`${overlay}.getElementById('voteNote').textContent`), /Random/);
    await manual({ target: 1 }, [['a', '!six'], ['b', '!six']]);
    await until('document.getElementById("cue").textContent.includes("Innings over")');
    for (const id of ['raid', 'cheer', 'send']) assert.equal(await evaluate(`document.getElementById('${id}').disabled`), true);
    assert.equal(await evaluate(`${overlay}.getElementById('voteHeading').textContent`), 'FINAL TALLY');
    assert.equal(await evaluate(`${overlay}.getElementById('raidLabel').textContent`), 'INNINGS OVER');
    assert.match(await evaluate(`${overlay}.getElementById('footerNote').textContent`), /Reset/);
    assert.equal(app.match.game.score, 6);
    assert.deepEqual(app.match.game.getState().mvp.map(p => p.runs), [6, 6]);
    assert.deepEqual(await evaluate(`Array.from(${overlay}.querySelectorAll('#mvp .credit'), el => el.textContent)`), ['6', '6']);
    assert.match(await evaluate(`${overlay}.getElementById('endMvp').textContent`), /6 credited runs/);
    assert.match(await evaluate(`${overlay}.body.textContent`), /Each winning voter gets full run credit. Team runs count once./);
    await manual({ target: 1, rng: () => 0.7 });
    await until(`${overlay}.getElementById('endTitle').textContent === 'CHASE COMPLETE'`);
    assert.equal(app.match.game.status, 'won');
    assert.match(await evaluate(`${overlay}.getElementById('commentary').textContent`), /No votes arrived/);
    assert.equal(await evaluate(`${overlay}.getElementById('endMvp').textContent`), 'No voter credit this innings. Play again from the control room.');
    await manual({ target: 100, maxWickets: 1, rng: () => 0.999 }, [['a', '!six']]);
    await until('document.getElementById("cue").textContent.includes("Redeem DRS")');
    assert.equal(app.match.game.status, 'lost');
    assert.equal(await evaluate('document.getElementById("drs").disabled'), false);
    assert.equal(await evaluate(`${overlay}.getElementById('chaseLabel').textContent`), 'INNINGS OVER');
    app.match.game.rng = () => 0;
    await evaluate('document.getElementById("drs").click()');
    await until('document.getElementById("drsHint").textContent === "REVIEW USED"');
    clock.advance(app.match.revealMs);
    await until('!document.getElementById("send").disabled');
    assert.equal(await evaluate(`${overlay}.getElementById('voteHeading').textContent`), 'MAKE THE CALL');
    assert.match(await evaluate('document.getElementById("cue").textContent'), /Send a shot/);
    // Exhaust remaining balls without votes. There can be no additional DRS.
    for (let i = 0; i < 5; i += 1) clock.advance(app.match.game.voteWindowMs + app.match.revealMs);
    await until('document.getElementById("cue").textContent.includes("Innings over")');
    assert.equal(app.match.game.status, 'lost');
    assert.equal(app.match.game.getState().ballsRemaining, 0);
    assert.equal(await evaluate('document.getElementById("drs").disabled'), true);
    assert.match(await evaluate(`${overlay}.getElementById('mvp').textContent`), /a/);
    await manual({ maxWickets: 10, rng: () => 0 });
    for (let i = 0; i < 5; i += 1) clock.advance(app.match.revealMs + app.match.game.voteWindowMs);
    await until('document.getElementById("cue").textContent.includes("Innings over")');
    assert.doesNotMatch(await evaluate(`${overlay}.getElementById('mvp').textContent`), /Vote for a shot/);
    assert.equal(await evaluate(`${overlay}.getElementById('endKicker').textContent`), 'INNINGS COMPLETE');
    console.log('Presentation DOM cases passed: no votes, tie, rendered full credit, manual win, no-voter win, all-out loss, DRS resume, exhausted loss, no-voter loss.');
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
