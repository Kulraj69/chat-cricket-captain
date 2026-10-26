/* Shared presentation rules: also exercised by node:test. No external assets. */
(function (root) {
  'use strict';
  const SHOTS = [
    { name: 'drive', hint: 'Balanced attack' },
    { name: 'pull', hint: 'Take on the bounce' },
    { name: 'sweep', hint: 'Challenge the spin' },
    { name: 'defend', hint: 'Lower risk, fewer runs' },
    { name: 'six', hint: 'Big reward, big risk' }
  ];

  function voteDisplay(state) {
    const locked = state.status !== 'voting' && Boolean(state.lastResult);
    const tally = locked ? state.lastResult.tally : state.tally;
    const total = Object.values(tally).reduce((sum, n) => sum + n, 0);
    return { tally, total, locked, winner: locked ? state.lastResult.shot : null };
  }

  function countdown(state, now) {
    if (state.status !== 'voting') return { seconds: 0, fraction: 0 };
    const remaining = Math.max(0, Math.min(state.voteWindowMs, state.openedAt + state.voteWindowMs - now));
    return { seconds: Math.ceil(remaining / 1000), fraction: remaining / state.voteWindowMs };
  }

  function resultPresentation(result) {
    if (result.overturned) return { title: 'NOT OUT', detail: 'DRS overturned the wicket', tone: 'review' };
    if (result.freeHitSaved) return { title: 'SAVED', detail: 'Free Hit protected the wicket', tone: 'review' };
    const labels = { W: 'WICKET', 0: 'DOT BALL', 1: 'SINGLE', 2: 'TWO RUNS', 4: 'FOUR', 6: 'SIX!' };
    return { title: labels[result.outcome], detail: `${result.shot.toUpperCase()} vs ${result.delivery.toUpperCase()}`,
      tone: result.outcome === 'W' ? 'wicket' : Number(result.outcome) >= 4 ? 'boundary' : 'normal' };
  }

  function connect(onPacket, onConnection) {
    let socket;
    let retry;
    function open() {
      onConnection(false);
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      socket.onopen = () => onConnection(true);
      socket.onmessage = event => {
        try { const packet = JSON.parse(event.data); if (packet.state) onPacket(packet); }
        catch { onConnection(false); }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => { onConnection(false); retry = setTimeout(open, 1200); };
    }
    open();
    window.addEventListener('pagehide', () => { clearTimeout(retry); socket.onclose = null; socket.close(); }, { once: true });
  }

  const api = { SHOTS, voteDisplay, countdown, resultPresentation, connect };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CricketUI = api;
})(typeof window === 'undefined' ? globalThis : window);
