'use strict';

// Authored rehearsal fixtures, never a claim of live Twitch traffic or random luck.
// Rolls still pass through CricketGame's normal outcome matrix and scoring logic.
const SHOWCASE_BALLS = [
  { shot: 'six', roll: 0.6, cue: 'The raid starts a Super Over. Chat chooses a big swing.' },
  { shot: 'pull', roll: 0.99, review: true, cue: 'A wicket falls. Watch the DRS reward reverse the decision.' },
  { shot: 'six', roll: 0.99, freeHit: true, cue: 'A simulated cheer arms a Free Hit. This wicket cannot count.' },
  { shot: 'drive', roll: 0.4, cue: 'Chat finds the boundary and shares the credit.' },
  { shot: 'defend', roll: 0.1, cue: 'A dot ball leaves everything riding on the final delivery.' },
  { shot: 'six', roll: 0.6, cue: 'Six needed from one ball. One collective call to win it.' }
];

function showcaseRng() {
  const rolls = SHOWCASE_BALLS.flatMap(ball => [
    0, 0.99, ball.roll, 0, // winning shot, full toss, outcome, commentary
    ...(ball.review ? [0.1, 0] : []) // successful DRS, commentary
  ]);
  let index = 0;
  return () => {
    if (index >= rolls.length) throw new Error('Showcase random fixture exhausted');
    return rolls[index++];
  };
}

module.exports = { SHOWCASE_BALLS, showcaseRng };
