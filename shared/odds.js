// Win odds and outs for a heads-up all-in, shown while the board is run out.
// Uses a fast evaluator for 5-7 cards that produces exactly the same scores as evaluateBest
// (shared/cards.js), which would be far too slow for thousands of runouts.
import { createDeck, rankValue } from './cards.js';

const SUIT_INDEX = { s: 0, h: 1, d: 2, c: 3 };

function score(cat, tb) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (tb[i] || 0);
  return s;
}

// Highest card of a straight in a rank bit mask (bit r = rank r present), 0 if none
function straightHigh(mask) {
  for (let hi = 14; hi >= 6; hi--) {
    const run = 0b11111 << (hi - 4);
    if ((mask & run) === run) return hi;
  }
  // wheel: A-2-3-4-5
  const wheel = (1 << 14) | 0b111100;
  return (mask & wheel) === wheel ? 5 : 0;
}

// Score of the best five cards out of 5-7 cards given as [rank, suit] pairs
export function fastScore(cards) {
  const counts = new Array(15).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let mask = 0;
  for (const [r, s] of cards) {
    counts[r]++;
    mask |= 1 << r;
    suitMasks[s] |= 1 << r;
    suitCounts[s]++;
  }
  const flushSuit = suitCounts.findIndex((n) => n >= 5);
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMasks[flushSuit]);
    if (sf) return score(8, [sf]);
  }
  const quads = [];
  const trips = [];
  const pairs = [];
  const singles = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }
  const kickers = (exclude, n) => {
    const out = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (counts[r] && !exclude.includes(r)) out.push(r);
    return out;
  };
  if (quads.length) return score(7, [quads[0], ...kickers([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = Math.max(trips[1] || 0, pairs[0] || 0);
    return score(6, [trips[0], pair]);
  }
  if (flushSuit >= 0) {
    const ranks = [];
    for (let r = 14; r >= 2 && ranks.length < 5; r--) if (suitMasks[flushSuit] & (1 << r)) ranks.push(r);
    return score(5, ranks);
  }
  const st = straightHigh(mask);
  if (st) return score(4, [st]);
  if (trips.length) return score(3, [trips[0], ...kickers([trips[0]], 2)]);
  if (pairs.length >= 2) return score(2, [pairs[0], pairs[1], ...kickers([pairs[0], pairs[1]], 1)]);
  if (pairs.length) return score(1, [pairs[0], ...kickers([pairs[0]], 3)]);
  return score(0, kickers([], 5));
}

const parse = (c) => [rankValue(c), SUIT_INDEX[c[1]]];

// Deterministic pseudo random numbers, so every computation of the same spot gives the same result
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 30000; // preflop: sampled runouts (exact enumeration would be 1.7M boards)

/**
 * Heads-up odds for two known hands and a board of 0-4 cards.
 * Returns { win: [a, b], tie, outs } – probabilities 0..1. `outs` (only with a flop or turn
 * on the board): { index, count } for the hand that is currently behind, i.e. how many of the
 * unseen cards put it ahead with the next card; null if nobody is behind.
 */
export function headsUpOdds(handA, handB, board) {
  const a = handA.map(parse);
  const b = handB.map(parse);
  const known = board.map(parse);
  const used = new Set([...handA, ...handB, ...board]);
  const rest = createDeck().filter((c) => !used.has(c)).map(parse);
  const need = 5 - board.length;
  let winA = 0;
  let winB = 0;
  let ties = 0;
  let total = 0;
  const run = (extra) => {
    const full = known.concat(extra);
    const sa = fastScore(a.concat(full));
    const sb = fastScore(b.concat(full));
    if (sa > sb) winA++;
    else if (sb > sa) winB++;
    else ties++;
    total++;
  };
  if (need === 0) run([]);
  else if (need <= 2) {
    // flop or turn: every possible runout
    for (let i = 0; i < rest.length; i++) {
      if (need === 1) run([rest[i]]);
      else for (let j = i + 1; j < rest.length; j++) run([rest[i], rest[j]]);
    }
  } else {
    const rand = mulberry32(seedOf([...handA, ...handB, ...board]));
    const deck = rest.slice();
    for (let n = 0; n < SAMPLES; n++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rand() * (deck.length - i));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      run(deck.slice(0, need));
    }
  }
  let outs = null;
  if (board.length >= 3 && board.length < 5) {
    const sa = fastScore(a.concat(known));
    const sb = fastScore(b.concat(known));
    if (sa !== sb) {
      const behind = sa < sb ? 0 : 1;
      const [mine, theirs] = behind === 0 ? [a, b] : [b, a];
      let count = 0;
      for (const c of rest) {
        const full = known.concat([c]);
        if (fastScore(mine.concat(full)) > fastScore(theirs.concat(full))) count++;
      }
      outs = { index: behind, count };
    }
  }
  return { win: [winA / total, winB / total], tie: ties / total, outs };
}

function seedOf(cards) {
  let h = 2166136261;
  for (const ch of cards.join('')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
