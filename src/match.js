'use strict';

const { CricketGame, parseMessage } = require('./game');
const { SHOWCASE_BALLS, showcaseRng } = require('./showcase');

class MatchController {
  constructor({ gameOptions = {}, revealMs = 3200, demoVoteWindowMs = 6000,
    now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
    onUpdate = () => {}, announce = () => {} } = {}) {
    Object.assign(this, { gameOptions, revealMs, demoVoteWindowMs, now, setTimer, clearTimer, onUpdate, announce });
    this.timers = new Set();
    this.ballTimer = null;
    this.nextTimer = null;
    this.demo = null;
    this.lastEvent = null;
    this.eventId = 0;
    this.game = this.createGame();
  }

  createGame(options = {}) {
    return new CricketGame({ ...this.gameOptions, now: this.now, ...options });
  }

  getState() {
    return { ...this.game.getState(), demo: this.demo ? { ...this.demo } : null,
      lastEvent: this.lastEvent, serverNow: this.now() };
  }

  emit(type = 'state', extra = {}) {
    this.onUpdate({ type, state: this.getState(), ...extra });
  }

  later(callback, delay) {
    const timer = this.setTimer(() => { this.timers.delete(timer); callback(); }, delay);
    timer?.unref?.();
    this.timers.add(timer);
    return timer;
  }

  stop() {
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers.clear();
    this.ballTimer = null;
    this.nextTimer = null;
  }

  start() { this.scheduleBall(); }

  reset(showcase = false) {
    this.stop();
    this.demo = showcase ? { active: true, scripted: true, cue: SHOWCASE_BALLS[0].cue } : null;
    this.lastEvent = null;
    this.game = this.createGame(showcase ? {
      rng: showcaseRng(), target: 16, maxOvers: 1, voteWindowMs: this.demoVoteWindowMs
    } : {});
    this.emit('reset');
    if (showcase) this.applyEvent('raid', { user: 'demo_raiders' });
    this.scheduleBall();
  }

  scheduleBall() {
    if (this.game.status !== 'voting' || this.ballTimer !== null) return;
    if (this.demo?.active) this.queueShowcaseVotes();
    this.ballTimer = this.later(() => {
      this.ballTimer = null;
      this.resolveBall();
    }, this.game.voteWindowMs);
  }

  queueShowcaseVotes() {
    const scene = SHOWCASE_BALLS[this.game.balls];
    this.demo.cue = scene.cue;
    this.emit();
    if (scene.freeHit) {
      this.later(() => this.applyEvent('cheer', { user: 'demo_booster' }), this.game.voteWindowMs * 0.08);
    }
    const votes = [
      ['demo_asha', 'defend'], ['demo_lee', scene.shot],
      ['demo_noor', scene.shot], ['demo_asha', scene.shot], ['demo_sam', 'sweep']
    ];
    votes.forEach(([user, shot], i) => this.later(() => {
      this.game.vote(user, shot);
      this.emit('vote');
    }, this.game.voteWindowMs * (0.15 + i * 0.13)));
  }

  resolveBall() {
    const result = this.game.resolveBall();
    if (!result) return;
    if (this.demo?.active && SHOWCASE_BALLS[result.ball - 1].review) {
      this.later(() => this.applyEvent('channelPointRedeem', { title: 'DRS', user: 'demo_reviewer' }), this.revealMs * 0.5);
    }
    if (this.demo && ['won', 'lost'].includes(this.game.status)) {
      this.demo.active = false;
      this.demo.cue = 'Showcase complete. Reset to cast your own votes, or replay the rehearsal.';
    }
    this.emit('ball', { result });
    if (!this.demo) this.announce(`${result.commentary} Score: ${this.game.score}/${this.game.wickets} (${this.game.getState().overs})`);
    this.scheduleNext();
    if (!this.demo && ['won', 'lost'].includes(this.game.status)) {
      this.announce(this.game.status === 'won'
        ? `CHASE COMPLETE! Chat wins with ${this.game.getState().wicketsRemaining} wickets left!`
        : `Innings over. Chat finishes ${this.game.score}/${this.game.wickets}.`);
    }
  }

  scheduleNext() {
    if (this.game.status !== 'resolved' || this.nextTimer !== null) return;
    this.nextTimer = this.later(() => {
      this.nextTimer = null;
      if (!this.game.openNextBall()) return;
      this.emit();
      this.scheduleBall();
    }, this.revealMs);
  }

  receiveMessage(user, message) {
    if (this.demo) return { accepted: false, reason: 'Reset to manual play before sending votes' };
    if (typeof user !== 'string' || !user.trim() || user.trim().length > 25 ||
        typeof message !== 'string' || message.length > 500 || !parseMessage(message)) {
      return { accepted: false, reason: 'Use a name (up to 25 characters) and a valid shot command' };
    }
    const accepted = this.game.vote(user, message);
    if (accepted) this.emit('vote');
    return accepted ? { accepted: true } : { accepted: false, reason: 'Voting is closed. Wait for the next ball' };
  }

  receiveEvent(type, payload = {}) {
    if (this.demo) return { applied: false, reason: 'Reset to manual play before sending events' };
    return this.applyEvent(type, payload);
  }

  applyEvent(type, payload) {
    const result = this.game.applyEvent(type, payload);
    if (result.applied) {
      this.lastEvent = { id: ++this.eventId, type, ...result, commentary: this.game.commentary };
      this.emit('event', { event: type, eventResult: result });
      if (!this.demo && type === 'channelPointRedeem') this.announce(this.game.commentary);
      // A successful review can revive an all-out innings with no next-ball timer.
      this.scheduleNext();
    }
    return result;
  }
}

module.exports = { MatchController };
