"""Record actual wall-clock showcase and verify separate manual voting. No Twitch."""
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get('CRICKET_SOURCE', Path(__file__).resolve().parents[1]))
OUT = Path(os.environ.get('CRICKET_DEMO_OUT', ROOT / 'demo'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:41734'
ENV = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/home/box/.hermes/cache/scratch',
       'TMPDIR': '/home/box/.hermes/cache/scratch', 'MOCK_MODE': '1',
       'PORT': '41734', 'HOST': '127.0.0.1', 'VOTE_WINDOW_MS': '60000'}
checks = []
with (OUT / 'server.log').open('w') as log:
    server = subprocess.Popen(['npm', 'start'], cwd=ROOT, env=ENV,
        stdout=log, stderr=log, start_new_session=True)
    try:
        for _ in range(80):
            try:
                with urllib.request.urlopen(BASE + '/api/state', timeout=1) as response:
                    assert json.load(response)['mode'] == 'mock'
                break
            except OSError:
                time.sleep(.25)
        else:
            raise RuntimeError('Local server did not start')
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, env=ENV)
            context = browser.new_context(viewport={'width': 1920, 'height': 1080},
                record_video_dir=str(OUT / 'raw'), record_video_size={'width': 1920, 'height': 1080})
            blocked, errors, sockets = [], [], []
            def local_only(route):
                if route.request.url.startswith(BASE + '/'):
                    route.continue_()
                else:
                    blocked.append(route.request.url)
                    route.abort()
            context.route('**/*', local_only)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('websocket', lambda socket: sockets.append(socket.url))
            page.goto(BASE + '/mock')
            page.locator('#demo:not([disabled])').wait_for()
            page.wait_for_timeout(3000)
            page.locator('#demo').click()
            page.locator('#voteState').filter(has_text='SCRIPTED PLAYBACK').wait_for()
            page.goto(BASE + '/overlay')
            page.locator('#mode').filter(has_text='SCRIPTED').wait_for()
            page.locator('#runs').filter(has_text=re.compile('^6$')).wait_for(timeout=15000)
            checks.append({'check': 'opening six from real engine', 'pass': True})
            page.locator('#momentTitle').filter(has_text=re.compile('^NOT OUT$')).wait_for(timeout=15000)
            checks.append({'check': 'DRS reversal displayed', 'pass': True})
            page.screenshot(path=str(OUT / 'review.png'))
            page.locator('#recentBalls').filter(has_text='FH').wait_for(timeout=15000)
            checks.append({'check': 'Free Hit saved delivery', 'pass': True})
            page.locator('#remaining').filter(has_text=re.compile('^1$')).wait_for(timeout=30000)
            assert page.locator('#needed').inner_text() == '6'
            page.screenshot(path=str(OUT / 'last-ball.png'))
            checks.append({'check': 'six needed from last ball', 'pass': True})
            page.locator('#runs').filter(has_text=re.compile('^16$')).wait_for(timeout=15000)
            assert page.locator('#end').is_hidden()
            page.locator('#end').wait_for(state='visible')
            assert page.locator('#endTitle').inner_text() == 'CHAT WINS!'
            assert page.locator('#recentBalls .ball-chip').count() == 6
            assert 'demo_' in page.locator('#mvp').inner_text()
            checks.append({'check': 'final delivery before win; six balls and fixture MVP credit', 'pass': True})
            page.screenshot(path=str(OUT / 'win.png'))
            page.wait_for_timeout(5000)
            video = page.video
            context.close()
            video.save_as(str(OUT / 'chat-cricket-mock.webm'))

            manual = browser.new_context(viewport={'width': 1440, 'height': 1000})
            manual.route('**/*', local_only)
            page = manual.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE + '/mock')
            page.locator('#reset').click()
            page.locator('#send:not([disabled])').wait_for()
            second = manual.new_page()
            second.goto(BASE + '/overlay')
            page.locator('#user').fill('local_tester')
            page.locator('#message').fill('!drive')
            page.locator('#send').click()
            second.locator('#voteCount').filter(has_text=re.compile('^1 VOTE$')).wait_for()
            page.locator('#message').fill('!six')
            page.locator('#send').click()
            page.locator('#feedback').filter(has_text='accepted').wait_for()
            # Read the real server state after the UI action; no injected outcomes.
            with urllib.request.urlopen(BASE + '/api/state') as response:
                state = json.load(response)
            (OUT / 'manual-state.json').write_text(json.dumps(state, indent=2))
            assert second.locator('#voteCount').inner_text() == '1 VOTE'
            assert state['totalVotes'] == 1 and state['tally']['drive'] == 0 and state['tally']['six'] == 1
            checks.append({'check': 'same user replacement keeps one vote; second browser sees it', 'pass': True})
            manual.close()
            browser.close()
            assert not blocked and not errors, {'blocked': blocked, 'errors': errors}
            assert sockets and all(url.startswith('ws://127.0.0.1:41734/') for url in sockets)
            checks.append({'check': 'no external page requests or browser errors; local WebSocket', 'pass': True})
        (OUT / 'checks.json').write_text(json.dumps(checks, indent=2))
        print(json.dumps(checks, indent=2))
    finally:
        os.killpg(server.pid, signal.SIGTERM)
        server.wait(timeout=10)
