// Bot players: a fixed roster of names with a playing style ("profile"), plus the decision logic.
// Bots estimate their chance to win with a quick Monte Carlo simulation against the remaining
// opponents and then act according to their profile's thresholds.
import { createDeck, evaluateBest } from '../shared/cards.js';
import { randomInt } from 'node:crypto';

// enter: minimum relative strength to play a hand (1 = average hand against this many opponents)
// raise: relative strength to bet/raise for value
// loose: how much worse than the pot odds a call may be
// bluff: chance to bet/raise with a weak hand
// trap:  chance to slow-play a monster (check/call instead of raising)
// size:  bet size as a share of the pot
// push:  relative strength to shove when short-stacked (<= 10 big blinds)
// fear:  how much a big bet (share of the own stack) lowers the estimated chances – big bets
//        usually mean strong hands, so the equity against random cards is too optimistic
export const PROFILES = {
  rock: { enter: 1.3, raise: 1.65, loose: 0, bluff: 0.02, trap: 0.1, size: 0.6, push: 1.45, fear: 0.75 },
  station: { enter: 0.8, raise: 1.95, loose: 0.16, bluff: 0.03, trap: 0.2, size: 0.5, push: 1.1, fear: 0.5 },
  tag: { enter: 1.12, raise: 1.35, loose: 0.02, bluff: 0.12, trap: 0.15, size: 0.7, push: 1.15, fear: 0.6 },
  lag: { enter: 0.92, raise: 1.25, loose: 0.06, bluff: 0.22, trap: 0.1, size: 0.8, push: 1.0, fear: 0.5 },
  maniac: { enter: 0.62, raise: 1.05, loose: 0.1, bluff: 0.35, trap: 0.05, size: 1.0, push: 0.8, fear: 0.35 },
  trapper: { enter: 1.05, raise: 1.5, loose: 0.04, bluff: 0.08, trap: 0.65, size: 0.65, push: 1.2, fear: 0.55 },
};

export const ROSTER = [
  { name: 'Rocky Rhodes', profile: 'rock' },
  { name: 'Iron Ingrid', profile: 'rock' },
  { name: 'Steady Eddie', profile: 'rock' },
  { name: 'Sticky Pete', profile: 'station' },
  { name: 'Curious Callie', profile: 'station' },
  { name: 'Mr. Why-Not', profile: 'station' },
  { name: 'The Professor', profile: 'tag' },
  { name: 'Sharky Shaw', profile: 'tag' },
  { name: 'Clara Calculus', profile: 'tag' },
  { name: 'Ruby Raise', profile: 'lag' },
  { name: 'Hotshot Hank', profile: 'lag' },
  { name: 'Lucky Luciana', profile: 'lag' },
  { name: 'Maxi Mania', profile: 'maniac' },
  { name: 'Blaze', profile: 'maniac' },
  { name: 'Crazy Carl', profile: 'maniac' },
  { name: 'Silent Sam', profile: 'trapper' },
  { name: 'Velvet Viper', profile: 'trapper' },
  { name: 'Sly Sylvia', profile: 'trapper' },
];

// n random roster entries whose names are not taken yet
export function pickBots(n, takenNames = []) {
  const taken = new Set(takenNames.map((x) => x.toLowerCase()));
  const pool = ROSTER.filter((b) => !taken.has(b.name.toLowerCase()));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}

// Chance to win (ties count half) against `opponents` random hands, by simulation
export function equity(hole, board, opponents, iterations = 220) {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board]);
  const rest = createDeck().filter((c) => !known.has(c));
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    // partial Fisher-Yates: only shuffle the cards we need
    const need = opponents * 2 + (5 - board.length);
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const full = [...board, ...rest.slice(opponents * 2, need)];
    const mine = evaluateBest([...hole, ...full]).score;
    let best = 0;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const s = evaluateBest([rest[o * 2], rest[o * 2 + 1], ...full]).score;
      if (s > best) best = s;
    }
    if (mine > best) score += 1;
    else if (mine === best) {
      for (let o = 0; o < opponents; o++) if (evaluateBest([rest[o * 2], rest[o * 2 + 1], ...full]).score === mine) ties++;
      score += 1 / (ties + 1);
    }
  }
  return score / iterations;
}

// The bot's move for the current decision in hand `h`: { type, amount? }
export function decide(h, seat, profile, rand = Math.random) {
  const P = PROFILES[profile] || PROFILES.tag;
  const me = h.player(seat);
  const legal = h.legalActions(seat);
  const opponents = h.players.filter((p) => p.seat !== seat && !p.folded).length;
  const e = equity(me.cards, h.board, opponents);
  const rel = e * (opponents + 1); // 1 = an average hand against this field
  const pot = h.potTotal + h.players.reduce((sum, p) => sum + p.bet, 0);
  const toCall = legal.toCall || 0;
  const odds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const preflop = h.board.length === 0;
  const bb = h.bb;
  const check = () => ({ type: 'check' });
  const foldOrCheck = () => (legal.canCheck ? check() : { type: 'fold' });
  // Bet/raise by a share of the pot. Bluffs are only made while they stay cheap (at most about
  // a third of the stack) – otherwise the bot gives up the bluff (returns null).
  const raiseTo = (share, bluff = false) => {
    const target = Math.round(legal.currentBet + toCall + share * (pot + toCall));
    const amount = Math.max(legal.minTo, Math.min(legal.maxTo, target));
    if (bluff && amount - me.bet > me.stack * 0.35) return null;
    // (almost) the whole stack anyway -> just shove
    if (amount >= legal.maxTo * 0.9) return { type: 'allin' };
    return { type: 'raise', amount };
  };

  // Short stack: push or fold
  if (me.stack + me.bet <= 10 * bb) {
    if (rel >= P.push * (0.9 + rand() * 0.2)) return legal.canRaise ? { type: 'allin' } : { type: 'call' };
    return toCall <= bb / 2 && legal.canCall ? { type: 'call' } : foldOrCheck();
  }

  // Preflop: too weak to play at all
  if (preflop && rel < P.enter && !(legal.canCheck && toCall === 0)) {
    if (legal.canRaise && rand() < P.bluff * 0.5) return raiseTo(P.size, true) || foldOrCheck();
    return foldOrCheck();
  }

  const monster = rel >= P.raise * 1.35;
  const strong = rel >= P.raise;
  const slowplay = monster && !preflop && h.board.length < 5 && rand() < P.trap;

  if (legal.canCheck) {
    // value bet: full size only with a really strong hand
    if (legal.canRaise && strong && !slowplay) return raiseTo(P.size * (monster ? 1 : 0.55) * (0.8 + rand() * 0.4));
    if (legal.canRaise && rand() < P.bluff) return raiseTo(P.size * (0.6 + rand() * 0.3), true) || check();
    return check();
  }
  // facing a bet: the more of the stack it costs, the more cautious (see `fear`)
  const pressure = Math.min(1, toCall / Math.max(1, me.stack));
  const eAdj = e * (1 - P.fear * pressure);
  const relAdj = eAdj * (opponents + 1);
  // re-raise wars need a clearly better hand than an opening raise
  const escalated = legal.currentBet >= (preflop ? 4 * bb : pot * 0.5);
  const raiseBar = P.raise * (escalated ? 1.35 : 1) * (1 + pressure);
  if (legal.canRaise && relAdj >= raiseBar && !slowplay && rand() < 0.85) return raiseTo(P.size * (relAdj >= raiseBar * 1.35 ? 1.2 : 0.7) * (0.9 + rand() * 0.3));
  if (eAdj + P.loose >= odds) return { type: 'call' };
  if (legal.canRaise && !escalated && toCall <= pot * 0.35 && rand() < P.bluff * 0.6) return raiseTo(P.size, true) || { type: 'fold' };
  return { type: 'fold' };
}
