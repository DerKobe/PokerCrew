// No-Limit Texas Hold'em – eine einzelne Hand.
// Server-autoritativ; der Controller (session.js) steuert Timing über advance().
import { createDeck, evaluateBest } from '../shared/cards.js';
import { MAX_SEATS } from '../shared/config.js';
import { randomInt } from 'node:crypto';

export function shuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const STREETS = ['preflop', 'flop', 'turn', 'river'];

export class HandEngine {
  /**
   * @param {{players:{seat:number,stack:number}[], buttonSeat:number, sb:number, bb:number, ante?:number, deck?:string[], handId?:number}} o
   */
  constructor({ players, buttonSeat, sb, bb, ante = 0, deck, handId = 1 }) {
    if (players.length < 2) throw new Error('Mindestens zwei Spieler nötig');
    this.handId = handId;
    this.sb = sb;
    this.bb = bb;
    this.ante = ante;
    this.players = players
      .map((p) => ({
        seat: p.seat,
        stack: p.stack,
        startStack: p.stack,
        bet: 0,
        committed: 0,
        folded: false,
        allIn: false,
        canRaise: true,
        cards: [],
        lastAction: null,
      }))
      .sort((a, b) => a.seat - b.seat);
    this.buttonSeat = buttonSeat;
    this.deck = deck ? deck.slice() : shuffle(createDeck());
    this.board = [];
    this.street = 'preflop';
    this.phase = 'betting'; // betting | roundComplete | complete
    this.pending = new Set();
    this.currentBet = 0;
    this.minRaise = bb;
    this.toAct = null;
    this.revealed = new Set();
    this.results = null;
    this.pots = [];
    this.events = [];
    this.#start();
  }

  player(seat) {
    return this.players.find((p) => p.seat === seat);
  }

  get active() {
    return this.players.filter((p) => !p.folded);
  }

  // Nächster Sitz im Uhrzeigersinn nach `seat`, der `filter` erfüllt.
  nextSeat(seat, filter = () => true) {
    const after = this.players.filter((p) => p.seat > seat);
    const before = this.players.filter((p) => p.seat <= seat);
    const p = [...after, ...before].find(filter);
    return p ? p.seat : null;
  }

  #put(p, amount) {
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    p.committed += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  #start() {
    const n = this.players.length;
    if (!this.player(this.buttonSeat)) this.buttonSeat = this.players[0].seat;
    if (n === 2) {
      this.sbSeat = this.buttonSeat;
      this.bbSeat = this.nextSeat(this.buttonSeat);
    } else {
      this.sbSeat = this.nextSeat(this.buttonSeat);
      this.bbSeat = this.nextSeat(this.sbSeat);
    }

    if (this.ante > 0) {
      for (const p of this.players) {
        const a = Math.min(this.ante, p.stack);
        p.stack -= a;
        p.committed += a;
        if (p.stack === 0) p.allIn = true;
      }
    }
    const sbP = this.player(this.sbSeat);
    const bbP = this.player(this.bbSeat);
    if (!sbP.allIn) this.#put(sbP, this.sb);
    if (!bbP.allIn) this.#put(bbP, this.bb);
    sbP.lastAction = { type: 'sb', amount: sbP.bet };
    bbP.lastAction = { type: 'bb', amount: bbP.bet };
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    // Karten austeilen, beginnend links vom Button
    for (let r = 0; r < 2; r++) {
      let seat = this.buttonSeat;
      for (let i = 0; i < n; i++) {
        seat = this.nextSeat(seat);
        this.player(seat).cards.push(this.deck.pop());
      }
    }

    for (const p of this.players) if (!p.allIn) this.pending.add(p.seat);
    this.#resolveNext(this.bbSeat);
  }

  legalActions(seat) {
    const p = this.player(seat);
    if (!p || this.phase !== 'betting' || this.toAct !== seat) return null;
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const othersCanAct = this.players.some((o) => o !== p && !o.folded && !o.allIn);
    const maxTo = p.bet + p.stack;
    const canRaise = p.canRaise && p.stack > toCall && othersCanAct;
    let minTo = this.currentBet === 0 ? Math.min(this.bb, maxTo) : this.currentBet + this.minRaise;
    minTo = Math.min(minTo, maxTo);
    return {
      toCall,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise,
      isBet: this.currentBet === 0,
      minTo,
      maxTo,
      currentBet: this.currentBet,
    };
  }

  /**
   * @param {number} seat
   * @param {'fold'|'check'|'call'|'raise'|'allin'} type
   * @param {number} [amount] Gesamteinsatz in dieser Setzrunde bei raise
   */
  act(seat, type, amount) {
    const legal = this.legalActions(seat);
    if (!legal) throw new Error('Du bist nicht am Zug');
    const p = this.player(seat);

    if (type === 'allin') {
      const to = p.bet + p.stack;
      if (to <= this.currentBet || !legal.canRaise) type = legal.canCall ? 'call' : 'check';
      else { type = 'raise'; amount = to; }
    }

    let event;
    switch (type) {
      case 'fold':
        p.folded = true;
        event = { type: 'fold' };
        break;
      case 'check':
        if (!legal.canCheck) throw new Error('Check nicht möglich');
        event = { type: 'check' };
        break;
      case 'call': {
        if (!legal.canCall) throw new Error('Nichts zu callen');
        this.#put(p, legal.toCall);
        event = { type: 'call', amount: p.bet };
        break;
      }
      case 'raise': {
        if (!legal.canRaise) throw new Error('Erhöhen nicht möglich');
        amount = Math.floor(Number(amount));
        if (!Number.isFinite(amount)) throw new Error('Ungültiger Betrag');
        if (amount > legal.maxTo) amount = legal.maxTo;
        if (amount < legal.minTo) throw new Error(`Mindestens ${legal.minTo}`);
        const raiseSize = amount - this.currentBet;
        const wasBet = this.currentBet === 0;
        this.#put(p, amount - p.bet);
        if (raiseSize >= this.minRaise) {
          this.minRaise = raiseSize;
          for (const o of this.players) if (o !== p) o.canRaise = true;
        }
        this.currentBet = amount;
        for (const o of this.players) if (o !== p && !o.folded && !o.allIn) this.pending.add(o.seat);
        event = { type: wasBet ? 'bet' : 'raise', amount };
        break;
      }
      default:
        throw new Error('Unbekannte Aktion');
    }
    if (p.allIn && type !== 'fold') event.allIn = true;
    p.canRaise = false;
    p.lastAction = event;
    this.pending.delete(seat);
    this.events.push({ seat, ...event });
    this.#resolveNext(seat);
    return event;
  }

  #resolveNext(fromSeat) {
    const active = this.active;
    if (active.length === 1) return this.#finishUncontested();
    for (const s of [...this.pending]) {
      const p = this.player(s);
      if (p.folded || p.allIn) this.pending.delete(s);
    }
    const able = active.filter((p) => !p.allIn);
    if (able.length === 0) this.pending.clear();
    else if (able.length === 1) {
      const maxOther = Math.max(0, ...active.filter((p) => p !== able[0]).map((p) => p.bet));
      if (able[0].bet >= maxOther) this.pending.clear();
    }
    if (this.pending.size === 0) return this.#endRound();
    this.toAct = this.nextSeat(fromSeat, (p) => this.pending.has(p.seat));
  }

  #returnUncalled() {
    const sorted = [...this.players].sort((a, b) => b.bet - a.bet);
    const top = sorted[0];
    const second = sorted[1] ? sorted[1].bet : 0;
    if (top.bet > second) {
      const diff = top.bet - second;
      top.bet -= diff;
      top.committed -= diff;
      top.stack += diff;
      if (top.stack > 0) top.allIn = false;
      this.events.push({ seat: top.seat, type: 'return', amount: diff });
    }
  }

  #collect() {
    for (const p of this.players) p.bet = 0;
    this.pots = this.computePots();
  }

  #endRound() {
    this.toAct = null;
    this.#returnUncalled();
    this.#collect();
    this.phase = 'roundComplete';
    const active = this.active;
    const able = active.filter((p) => !p.allIn);
    this.runout = able.length < 2;
    // Bei All-in ohne weitere Setzmöglichkeit werden die Karten offen gelegt.
    if (this.runout) for (const p of active) this.revealed.add(p.seat);
  }

  /** Nächste Straße austeilen bzw. Showdown. Liefert true, wenn sich etwas geändert hat. */
  advance() {
    if (this.phase !== 'roundComplete') return false;
    if (this.street === 'river') {
      this.#showdown();
      return true;
    }
    this.deck.pop(); // Burn
    const next = STREETS[STREETS.indexOf(this.street) + 1];
    const count = next === 'flop' ? 3 : 1;
    for (let i = 0; i < count; i++) this.board.push(this.deck.pop());
    this.street = next;
    this.currentBet = 0;
    this.minRaise = this.bb;
    for (const p of this.players) {
      p.bet = 0;
      p.canRaise = true;
      if (!p.folded && !p.allIn) p.lastAction = null;
    }
    const able = this.active.filter((p) => !p.allIn);
    if (able.length >= 2) {
      this.phase = 'betting';
      for (const p of able) this.pending.add(p.seat);
      this.toAct = this.nextSeat(this.buttonSeat, (p) => this.pending.has(p.seat));
    } else {
      this.phase = 'roundComplete';
    }
    return true;
  }

  // Hängt der Ausgang nur noch vom River ab? (Board mit 4 Karten, alle Hände offen)
  // Es werden alle ungesehenen Karten als möglicher River durchgespielt.
  riverDecides() {
    if (this.board.length !== 4) return false;
    const active = this.active;
    if (active.length < 2) return false;
    const pots = this.computePots();
    let first = null;
    for (const river of this.deck) {
      const board = [...this.board, river];
      const score = Object.fromEntries(active.map((p) => [p.seat, evaluateBest([...p.cards, ...board]).score]));
      const sig = pots
        .map((pot) => {
          const best = Math.max(...pot.eligible.map((s) => score[s]));
          return pot.eligible.filter((s) => score[s] === best).join(',');
        })
        .join('|');
      if (first === null) first = sig;
      else if (sig !== first) return true;
    }
    return false;
  }

  // Rabbit Cam: die Board-Karten, die gekommen wären (inkl. Burn-Cards), ohne das Deck zu verändern
  rabbitCards() {
    const deck = this.deck.slice();
    const out = [];
    let n = this.board.length;
    while (n < 5) {
      deck.pop(); // Burn
      const count = n === 0 ? 3 : 1;
      for (let i = 0; i < count; i++) out.push(deck.pop());
      n += count;
    }
    return out;
  }

  computePots() {
    const levels = [...new Set(this.active.filter((p) => p.committed > 0).map((p) => p.committed))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const p of this.players) amount += Math.max(0, Math.min(p.committed, lvl) - prev);
      const eligible = this.active.filter((p) => p.committed >= lvl).map((p) => p.seat);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    }
    let leftover = 0;
    for (const p of this.players) leftover += Math.max(0, p.committed - prev);
    if (leftover > 0) {
      if (pots.length) pots[pots.length - 1].amount += leftover;
      else pots.push({ amount: leftover, eligible: this.active.map((p) => p.seat) });
    }
    // Pots mit identischen Berechtigten zusammenfassen (z. B. nur ein Berechtigter)
    const merged = [];
    for (const pot of pots) {
      const last = merged[merged.length - 1];
      if (last && last.eligible.join() === pot.eligible.join()) last.amount += pot.amount;
      else merged.push({ ...pot });
    }
    return merged;
  }

  get potTotal() {
    return this.players.reduce((s, p) => s + p.committed - p.bet, 0);
  }

  #orderFromButton(seats) {
    const key = (s) => (s - this.buttonSeat - 1 + MAX_SEATS * 2) % MAX_SEATS;
    return [...seats].sort((a, b) => key(a) - key(b));
  }

  #finishUncontested() {
    this.toAct = null;
    this.pending.clear();
    this.#returnUncalled();
    const winner = this.active[0];
    const total = this.players.reduce((s, p) => s + p.committed, 0);
    for (const p of this.players) p.bet = 0;
    winner.stack += total;
    this.pots = [];
    this.results = {
      uncontested: true,
      pots: [{ amount: total, winners: [winner.seat], shares: { [winner.seat]: total }, handName: null }],
      winnings: { [winner.seat]: total },
      hands: {},
    };
    this.phase = 'complete';
  }

  #showdown() {
    this.street = 'showdown';
    this.toAct = null;
    const active = this.active;
    for (const p of active) this.revealed.add(p.seat);
    const hands = {};
    for (const p of active) {
      const e = evaluateBest([...p.cards, ...this.board]);
      hands[p.seat] = { score: e.score, name: e.name, cards: e.cards, cat: e.cat };
    }
    const pots = this.computePots();
    const winnings = {};
    const potResults = [];
    for (const pot of pots) {
      const best = Math.max(...pot.eligible.map((s) => hands[s].score));
      const winners = this.#orderFromButton(pot.eligible.filter((s) => hands[s].score === best));
      const share = Math.floor(pot.amount / winners.length);
      let rest = pot.amount - share * winners.length;
      const shares = {};
      for (const s of winners) {
        const amt = share + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
        shares[s] = amt;
        winnings[s] = (winnings[s] || 0) + amt;
        this.player(s).stack += amt;
      }
      potResults.push({ amount: pot.amount, winners, shares, handName: hands[winners[0]].name, eligible: pot.eligible });
    }
    this.pots = [];
    this.results = { uncontested: false, pots: potResults, winnings, hands };
    this.phase = 'complete';
  }

  // Öffentliche Sicht für einen Betrachter (seat = eigener Platz oder null)
  view(viewerSeat) {
    const players = {};
    for (const p of this.players) {
      const show = p.seat === viewerSeat || this.revealed.has(p.seat);
      players[p.seat] = {
        bet: p.bet,
        committed: p.committed,
        stack: p.stack,
        folded: p.folded,
        allIn: p.allIn,
        lastAction: p.lastAction,
        cards: show ? p.cards : null,
        hasCards: !p.folded,
      };
    }
    return {
      id: this.handId,
      street: this.street,
      phase: this.phase,
      board: this.board,
      pots: this.pots,
      potTotal: this.potTotal,
      buttonSeat: this.buttonSeat,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
      sb: this.sb,
      bb: this.bb,
      ante: this.ante,
      currentBet: this.currentBet,
      toAct: this.toAct,
      players,
      legal: viewerSeat != null ? this.legalActions(viewerSeat) : null,
      results: this.results
        ? {
            uncontested: this.results.uncontested,
            pots: this.results.pots,
            winnings: this.results.winnings,
            hands: Object.fromEntries(Object.entries(this.results.hands).map(([s, h]) => [s, { name: h.name, cards: h.cards }])),
          }
        : null,
    };
  }
}
