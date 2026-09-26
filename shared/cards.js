// Cards as strings: rank + suit, e.g. "As", "Td", "7h", "2c".
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export const rankValue = (card) => RANKS.indexOf(card[0]) + 2;
export const suitOf = (card) => card[1];

export function createDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

// Evaluates exactly 5 cards. Higher score = better hand.
export function evaluate5(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  // Groups by count, then by rank, descending
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let straightHigh = 0;
  if (counts.size === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // A-2-3-4-5
  }

  let cat;
  let tb;
  if (straightHigh && flush) { cat = 8; tb = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = 7; tb = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; tb = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = 5; tb = vals; }
  else if (straightHigh) { cat = 4; tb = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = 3; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2) { cat = 1; tb = groups.map((g) => g[0]); }
  else { cat = 0; tb = vals; }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 16 + (tb[i] || 0);
  return { score, cat, tb };
}

function combos(arr, k, start = 0, cur = [], out = []) {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = start; i <= arr.length - (k - cur.length); i++) {
    cur.push(arr[i]);
    combos(arr, k, i + 1, cur, out);
    cur.pop();
  }
  return out;
}

// Best 5-card hand out of 5-7 cards. Returns { score, cat, tb, cards }; the client names it.
export function evaluateBest(cards) {
  let best = null;
  for (const five of combos(cards, 5)) {
    const e = evaluate5(five);
    if (!best || e.score > best.score) best = { ...e, cards: five };
  }
  return best;
}

// Your part in a showdown with a complete board: 'win' (the only best hand), 'split' (sharing
// the best hand), 'lose' (still in, but beaten) or 'watch' (folded, not in the hand, or the
// other hands are not known). players: { seat: { cards, folded } } as in the hand view.
export function showdownRole(players, board, seat) {
  const mine = players[seat];
  if (!mine?.cards || mine.folded) return 'watch';
  const scores = Object.entries(players)
    .filter(([, p]) => !p.folded && p.cards?.every(Boolean))
    .map(([s, p]) => ({ seat: Number(s), score: evaluateBest([...p.cards, ...board]).score }));
  const my = scores.find((x) => x.seat === Number(seat))?.score;
  if (scores.length < 2 || my == null) return 'watch';
  const best = Math.max(...scores.map((x) => x.score));
  if (my < best) return 'lose';
  return scores.filter((x) => x.score === best).length === 1 ? 'win' : 'split';
}
