'use strict';

const { commentaryFor, drsCommentary } = require('./commentary');

const SHOTS = ['drive', 'pull', 'sweep', 'defend', 'six'];
const DELIVERIES = ['yorker', 'bouncer', 'spinner', 'slower', 'full toss'];

// Values are cumulative-independent weights in outcome order: 0, 1, 2, 4, 6, W.
const OUTCOMES = ['0', '1', '2', '4', '6', 'W'];
const MATRIX = {
  drive: {
    yorker: [34, 22, 9, 18, 3, 14], bouncer: [20, 25, 11, 25, 7, 12],
    spinner: [17, 24, 15, 27, 8, 9], slower: [16, 21, 12, 29, 12, 10],
    'full toss': [8, 15, 10, 35, 24, 8]
  },
  pull: {
    yorker: [42, 17, 5, 10, 5, 21], bouncer: [13, 16, 9, 26, 22, 14],
    spinner: [24, 20, 12, 20, 10, 14], slower: [19, 20, 10, 25, 14, 12],
    'full toss': [10, 14, 8, 29, 29, 10]
  },
  sweep: {
    yorker: [35, 18, 7, 14, 7, 19], bouncer: [40, 15, 5, 11, 7, 22],
    spinner: [11, 20, 13, 30, 15, 11], slower: [16, 21, 11, 26, 14, 12],
    'full toss': [13, 16, 8, 28, 23, 12]
  },
  defend: {
    yorker: [49, 33, 7, 3, 0, 8], bouncer: [52, 27, 7, 4, 1, 9],
    spinner: [41, 37, 10, 5, 0, 7], slower: [45, 35, 9, 4, 0, 7],
    'full toss': [32, 39, 13, 9, 1, 6]
  },
  six: {
    yorker: [30, 8, 3, 11, 25, 23], bouncer: [21, 8, 3, 13, 34, 21],
    spinner: [18, 8, 4, 15, 36, 19], slower: [17, 9, 4, 16, 35, 19],
    'full toss': [9, 7, 3, 14, 51, 16]
  }
};

function parseMessage(message) {
  if (typeof message !== 'string') return null;
  const match = message.trim().toLowerCase().match(/^!(drive|pull|sweep|defend|six)(?:\s|$)/);
  return match ? match[1] : null;
}

function weightedOutcome(weights, rng) {
  let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return OUTCOMES[i];
  }
  return OUTCOMES.at(-1);
}

function positiveInteger(value, fallback, name, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > max) {
    throw new RangeError(`${name} must be a positive integer within its supported range`);
  }
  return number;
}

class CricketGame {
  constructor(options = {}) {
    this.rng = options.rng || Math.random;
    this.voteWindowMs = positiveInteger(options.voteWindowMs, 15000, 'VOTE_WINDOW_MS', 2147483647);
    this.target = positiveInteger(options.target, 36, 'TARGET');
    this.maxOvers = positiveInteger(options.maxOvers, 3, 'MAX_OVERS', Math.floor(Number.MAX_SAFE_INTEGER / 6));
    this.initialMaxOvers = this.maxOvers;
    this.maxWickets = positiveInteger(options.maxWickets, 10, 'maxWickets');
    this.now = options.now || Date.now;
    this.reset();
  }

  reset() {
    this.maxOvers = this.initialMaxOvers;
    this.score = 0;
    this.wickets = 0;
    this.balls = 0;
    this.ballLimit = this.maxOvers * 6;
    this.status = 'voting';
    this.votes = new Map();
    this.stats = new Map();
    this.history = [];
    this.lastResult = null;
    this.lastWicket = null;
    this.commentary = 'New chase, fresh pitch. Chat, choose your shot!';
    this.freeHitNext = false;
    this.drsUsed = false;
    this.superOver = false;
    this.openedAt = this.now();
    return this.getState();
  }

  vote(user, input) {
    const shot = SHOTS.includes(input) ? input : parseMessage(input);
    const name = String(user || '').trim().toLowerCase();
    if (this.status !== 'voting' || !name || !shot) return false;
    const isFirstVoteThisBall = !this.votes.has(name);
    this.votes.set(name, shot);
    const stat = this.stats.get(name) || { user: String(user).trim(), votes: 0, runs: 0, winningVotes: 0 };
    if (isFirstVoteThisBall) stat.votes += 1;
    stat.user = String(user).trim();
    this.stats.set(name, stat);
    return true;
  }

  tally() {
    const tally = Object.fromEntries(SHOTS.map(shot => [shot, 0]));
    for (const shot of this.votes.values()) tally[shot] += 1;
    return tally;
  }

  winningShot() {
    const tally = this.tally();
    const max = Math.max(...Object.values(tally));
    if (max === 0) return 'defend';
    const tied = SHOTS.filter(shot => tally[shot] === max);
    return tied[Math.min(tied.length - 1, Math.floor(this.rng() * tied.length))];
  }

  resolveBall() {
    if (this.status !== 'voting') return null;
    const shot = this.winningShot();
    const delivery = DELIVERIES[Math.min(DELIVERIES.length - 1, Math.floor(this.rng() * DELIVERIES.length))];
    let outcome = weightedOutcome(MATRIX[shot][delivery], this.rng);
    const wasFreeHit = this.freeHitNext;
    const freeHitSaved = wasFreeHit && outcome === 'W';
    if (freeHitSaved) outcome = '0';
    this.freeHitNext = false;

    const runs = outcome === 'W' ? 0 : Number(outcome);
    this.score += runs;
    if (outcome === 'W') this.wickets += 1;
    this.balls += 1;
    for (const [name, votedShot] of this.votes) {
      if (votedShot === shot) {
        const stat = this.stats.get(name);
        stat.runs += runs;
        stat.winningVotes += 1;
      }
    }

    const result = {
      ball: this.balls, shot, delivery, outcome, runs, wasFreeHit, freeHitSaved,
      tally: this.tally(), score: this.score, wickets: this.wickets
    };
    result.commentary = commentaryFor(result, this.rng);
    this.lastResult = result;
    if (outcome === 'W') this.lastWicket = result;
    this.history.push(result);
    this.commentary = result.commentary;
    this.votes = new Map();

    if (this.score >= this.target) this.status = 'won';
    else if (this.wickets >= this.maxWickets || this.balls >= this.ballLimit) this.status = 'lost';
    else this.status = 'resolved';
    return result;
  }

  openNextBall() {
    if (this.status !== 'resolved') return false;
    this.status = 'voting';
    this.openedAt = this.now();
    return true;
  }

  applyEvent(type, payload = {}) {
    if (type === 'channelPointRedeem') {
      if (String(payload.title || '').trim().toUpperCase() !== 'DRS') {
        return { applied: false, reason: 'Only the DRS reward changes this match' };
      }
      return this.applyDRS();
    }
    if (this.status === 'won' || this.status === 'lost') {
      return { applied: false, reason: 'Innings over. Reset to play again' };
    }
    if (type === 'cheer' || type === 'bits') {
      if (this.freeHitNext) return { applied: false, reason: 'Free Hit already armed' };
      this.freeHitNext = true;
      this.commentary = `Free Hit armed${payload.user ? ` by ${payload.user}` : ''}! Next ball cannot be a wicket.`;
      return { applied: true, type: 'freeHit' };
    }
    if (type === 'raid') {
      if (this.superOver) return { applied: false, reason: 'Super Over already active' };
      this.superOver = true;
      this.ballLimit = this.balls + 6;
      this.maxOvers = Math.ceil(this.ballLimit / 6);
      this.commentary = 'RAID! The incoming squad triggers Super Over mode—six balls of chaos!';
      return { applied: true, type: 'superOver' };
    }
    return { applied: false, reason: 'Unknown event' };
  }

  applyDRS() {
    if (this.status === 'won') return { applied: false, reason: 'Chase already won' };
    if (this.drsUsed || !this.lastWicket || this.lastWicket.overturned) {
      return { applied: false, reason: this.drsUsed ? 'DRS already used' : 'No wicket to review' };
    }
    this.drsUsed = true;
    const success = this.rng() < 0.5;
    if (success) {
      this.wickets = Math.max(0, this.wickets - 1);
      this.lastWicket.outcome = '0';
      this.lastWicket.overturned = true;
      this.lastWicket.wickets = Math.max(0, this.lastWicket.wickets - 1);
      if (this.status === 'lost' && this.balls < this.ballLimit) this.status = 'resolved';
    }
    this.commentary = drsCommentary(success, this.rng);
    return { applied: true, success };
  }

  getState() {
    const tally = this.tally();
    const mvp = [...this.stats.values()]
      .sort((a, b) => b.runs - a.runs || b.winningVotes - a.winningVotes || b.votes - a.votes)
      .slice(0, 5);
    return {
      score: this.score, wickets: this.wickets, balls: this.balls,
      overs: `${Math.floor(this.balls / 6)}.${this.balls % 6}`,
      target: this.target, maxOvers: this.maxOvers, ballLimit: this.ballLimit, status: this.status,
      runsNeeded: Math.max(0, this.target - this.score),
      ballsRemaining: Math.max(0, this.ballLimit - this.balls),
      wicketsRemaining: Math.max(0, this.maxWickets - this.wickets),
      canReview: !this.drsUsed && Boolean(this.lastWicket && !this.lastWicket.overturned) && this.status !== 'won',
      recentBalls: this.history.slice(-6).map(result => ({
        ball: result.ball, outcome: result.outcome, overturned: Boolean(result.overturned),
        freeHitSaved: result.freeHitSaved, shot: result.shot, delivery: result.delivery
      })),
      voteWindowMs: this.voteWindowMs, openedAt: this.openedAt,
      tally, totalVotes: Object.values(tally).reduce((a, b) => a + b, 0),
      lastResult: this.lastResult, commentary: this.commentary,
      freeHitNext: this.freeHitNext, drsUsed: this.drsUsed,
      superOver: this.superOver, mvp
    };
  }
}

module.exports = { CricketGame, parseMessage, weightedOutcome, SHOTS, DELIVERIES, MATRIX };
