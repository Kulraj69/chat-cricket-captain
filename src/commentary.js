'use strict';

const LINES = {
  0: [
    '{shot} meets {delivery}, but no run. Pressure cooker is officially on!',
    'Dot ball! {delivery} wins that mini battle. Arre, koi nahi.',
    'Straight to the fielder. Chat wanted spice; the bowler served discipline.'
  ],
  1: [
    'Quick single from the {shot}. Smart cricket, boss.',
    'They scamper one! Chat rotates the strike like pros.',
    'One run. Not glamorous, but scoreboard says shukriya.'
  ],
  2: [
    'Into the gap for two! Running between the wickets: full paisa vasool.',
    'Two more—{shot} does the job against the {delivery}.',
    'Easy double. Chat has found a gap the size of Mumbai traffic.'
  ],
  4: [
    'FOUR! That {shot} was sweeter than cutting chai!',
    'Threaded through the field—char run, beautiful scenes!',
    'Boundary! {delivery} punished and chat is absolutely cooking.'
  ],
  6: [
    'SIX! Into the virtual stands—kya shot hai!',
    'Maximum! The {shot} has left the building. Chat, take a bow.',
    'Chhakka! That ball needs a boarding pass.'
  ],
  W: [
    'OUT! The {delivery} outfoxes the {shot}. Pin-drop silence... briefly.',
    'Wicket! Chat swung for glory and found heartbreak. DRS, anyone?',
    'Gone! The stumps are doing bhangra and the batter is walking back.'
  ],
  FREE_HIT: [
    'Free Hit saves the day! Wicket cancelled—bowler ka plan flop.',
    'Would have been out, but the Free Hit says: not today, dost!'
  ],
  DRS_YES: [
    'DRS magic! Decision overturned. Not out—chat had the receipts!',
    'UltraEdge says bach gaya! The wicket is erased.'
  ],
  DRS_NO: [
    'Umpire’s call. DRS lost and the finger stays up.',
    'Review unsuccessful. Technology bhi bowler ke side today.'
  ]
};

function pick(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function commentaryFor(result, rng = Math.random) {
  let key = result.freeHitSaved ? 'FREE_HIT' : result.outcome;
  const template = pick(LINES[key] || LINES[0], rng);
  return template
    .replaceAll('{shot}', result.shot || 'shot')
    .replaceAll('{delivery}', result.delivery || 'delivery');
}

function drsCommentary(success, rng = Math.random) {
  return pick(LINES[success ? 'DRS_YES' : 'DRS_NO'], rng);
}

module.exports = { commentaryFor, drsCommentary };
