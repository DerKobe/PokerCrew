// Achievements: small trophies that stand next to a player's cards for the rest of the
// tournament. Only judged at a showdown, where everybody has seen the cards.
import { evaluateBest, rankValue } from '../shared/cards.js';

export const TROPHIES = ['sevenDeuce', 'tequila', 'crackedAces', 'riverRat'];

// Returns [{ seat, kind }] for a completed hand
export function trophiesFor(h) {
  const r = h.results;
  if (!r || r.uncontested) return [];
  const out = [];
  const shown = Object.keys(r.hands).map(Number);
  const ranks = (seat) => h.player(seat).cards.map(rankValue).sort((a, b) => a - b).join('-');
  for (const seat of shown) {
    const won = (r.winnings[seat] || 0) > 0;
    // Won with the worst starting hand in poker
    if (won && ranks(seat) === '2-7') out.push({ seat, kind: 'sevenDeuce' });
    // Lost a showdown with pocket aces (folding does not count – folded hands are not shown)
    if (!won && ranks(seat) === '14-14') out.push({ seat, kind: 'crackedAces' });
    // All-in with the whole stack really at risk (nothing came back as an uncalled bet) and
    // still in the tournament afterwards
    const p = h.player(seat);
    if (p.allIn && p.stack > 0 && p.stack === (r.winnings[seat] || 0)) out.push({ seat, kind: 'tequila' });
  }
  // River Rat: behind on the turn, the river turns it around against the turn leader
  if (h.board.length === 5 && shown.length >= 2) {
    const turn = h.board.slice(0, 4);
    const scores = new Map(shown.map((seat) => [seat, evaluateBest([...h.player(seat).cards, ...turn]).score]));
    const best = Math.max(...scores.values());
    const turnLeaders = shown.filter((seat) => scores.get(seat) === best);
    const riverWinners = r.pots[0].winners;
    if (turnLeaders.some((seat) => !riverWinners.includes(seat))) {
      for (const seat of riverWinners) if (!turnLeaders.includes(seat)) out.push({ seat, kind: 'riverRat' });
    }
  }
  return out;
}
