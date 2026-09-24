// Karten als Strings: Rang + Farbe, z. B. "As", "Td", "7h", "2c".
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export const rankValue = (card) => RANKS.indexOf(card[0]) + 2;
export const suitOf = (card) => card[1];

const RANK_NAME = { 2: 'Zwei', 3: 'Drei', 4: 'Vier', 5: 'Fünf', 6: 'Sechs', 7: 'Sieben', 8: 'Acht', 9: 'Neun', 10: 'Zehn', 11: 'Bube', 12: 'Dame', 13: 'König', 14: 'Ass' };
const RANK_PLURAL = { 2: 'Zweien', 3: 'Dreien', 4: 'Vieren', 5: 'Fünfen', 6: 'Sechsen', 7: 'Siebenen', 8: 'Achten', 9: 'Neunen', 10: 'Zehnen', 11: 'Buben', 12: 'Damen', 13: 'Könige', 14: 'Asse' };

export const CATEGORY_NAMES = ['Höchste Karte', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];

export function createDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

// Bewertet genau 5 Karten. Höherer Score = bessere Hand.
export function evaluate5(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  // Gruppen nach Anzahl, dann Rang absteigend
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

// Beste 5-Karten-Hand aus 5-7 Karten.
export function evaluateBest(cards) {
  let best = null;
  for (const five of combos(cards, 5)) {
    const e = evaluate5(five);
    if (!best || e.score > best.score) best = { ...e, cards: five };
  }
  best.name = describe(best);
  return best;
}

export function describe({ cat, tb }) {
  const P = RANK_PLURAL;
  const N = RANK_NAME;
  switch (cat) {
    case 8: return tb[0] === 14 ? 'Royal Flush' : `Straight Flush bis ${tb[0] === 14 ? 'zum Ass' : N[tb[0]]}`;
    case 7: return `Vierling, ${P[tb[0]]}`;
    case 6: return `Full House, ${P[tb[0]]} über ${P[tb[1]]}`;
    case 5: return `Flush, ${N[tb[0]]} hoch`;
    case 4: return `Straße bis ${N[tb[0]]}`;
    case 3: return `Drilling, ${P[tb[0]]}`;
    case 2: return `Zwei Paare, ${P[tb[0]]} und ${P[tb[1]]}`;
    case 1: return `Paar, ${P[tb[0]]}`;
    default: return `${N[tb[0]]} hoch`;
  }
}
