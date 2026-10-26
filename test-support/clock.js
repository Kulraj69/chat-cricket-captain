'use strict';

function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(callback, delay) { const key = ++id; timers.set(key, { callback, at: now + delay }); return key; },
    clearTimer(key) { timers.delete(key); },
    advance(ms) {
      const end = now + ms;
      let steps = 0;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        if (++steps > 10000) throw new Error('Timer loop');
        timers.delete(next[0]); now = next[1].at; next[1].callback();
      }
      now = end;
    },
    get pending() { return timers.size; }
  };
}
module.exports = { fakeClock };
