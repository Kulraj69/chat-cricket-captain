'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { commentaryFor } = require('../src/commentary');
const { CricketGame } = require('../src/game');

for (const outcome of [0, 1, 2, 4, 6, 'W']) {
  test(`no-vote commentary explains default for ${outcome} without crediting chat`, () => {
    for (const roll of [0, 0.5, 0.99]) {
      let calls = 0;
      const text = commentaryFor({ outcome, shot: 'defend', delivery: 'spinner', tally: { defend: 0 } }, () => { calls++; return roll; });
      assert.match(text, /^No votes arrived\. Default defend:/);
      assert.doesNotMatch(text, /chat/i);
      assert.equal(calls, 1, 'keep the authored RNG sequence unchanged');
    }
  });
}

test('no-voter win and Free Hit preserve honest commentary', () => {
  const game = new CricketGame({ target: 1, rng: () => 0.7 });
  game.resolveBall();
  assert.equal(game.status, 'won');
  assert.match(game.getState().commentary, /No votes arrived/);
  assert.doesNotMatch(game.getState().commentary, /chat/i);
  assert.match(commentaryFor({ outcome: 0, freeHitSaved: true, tally: { defend: 0 } }), /Free Hit saved the wicket/);
});

test('voted deliveries keep existing commentary', () => {
  assert.equal(commentaryFor({ outcome: 1, tally: { defend: 1 } }, () => 0.5), 'They scamper one! Chat rotates the strike like pros.');
});
