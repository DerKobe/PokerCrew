import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBest, evaluate5 } from '../shared/cards.js';
import { HandEngine } from '../server/engine.js';

const score = (s) => evaluateBest(s.split(' ')).score;

test('Hand ranking order', () => {
  const hands = [
    'As Ks Qs Js Ts',   // Royal
    '9h 8h 7h 6h 5h',   // SF
    'Ac Ad Ah As 2c',   // Quads
    'Kc Kd Kh 2s 2c',   // FH
    'Ah 9h 7h 4h 2h',   // Flush
    '5c 4d 3h 2s Ac',   // Wheel
    'Qc Qd Qh 9s 2c',   // Trips
    'Jc Jd 4h 4s 2c',   // Two pair
    'Tc Td 8h 4s 2c',   // Pair
    'Ac Qd 8h 4s 2c',   // High
  ].map(score);
  for (let i = 1; i < hands.length; i++) assert.ok(hands[i - 1] > hands[i], `Index ${i}`);
  assert.ok(score('6c 5d 4h 3s 2c') > score('5c 4d 3h 2s Ac'), 'six-high > wheel');
  const royal = evaluateBest('As Ks Qs Js Ts 2c 3d'.split(' '));
  assert.equal(royal.cat, 8);
  assert.equal(royal.tb[0], 14);
  assert.equal(evaluate5('Kc Kd Kh 2s 2c'.split(' ')).cat, 6);
  const twoPair = evaluateBest('Kc Kd 7h 7s 2c 2d 9h'.split(' '));
  assert.equal(twoPair.cat, 2);
  assert.deepEqual(twoPair.tb.slice(0, 3), [13, 7, 9]);
  assert.equal(score('Ac Ad Kh Qs Jc'), score('Ah As Kd Qc Jd'));
});

// Deck helper: cards are drawn from the end (pop). Dealing order:
// round 1 from left of the button, round 2 from left of the button, then burn+flop, burn+turn, burn+river.
function stackedDeck(order) {
  const rest = [];
  const used = new Set(order);
  for (const s of 'shdc') for (const r of '23456789TJQKA') if (!used.has(r + s)) rest.push(r + s);
  return [...rest, ...order.slice().reverse()];
}

test('Heads-up: the button is the SB and acts first preflop, last postflop', () => {
  const h = new HandEngine({ players: [{ seat: 0, stack: 1000 }, { seat: 3, stack: 1000 }], buttonSeat: 3, sb: 10, bb: 20 });
  assert.equal(h.sbSeat, 3);
  assert.equal(h.bbSeat, 0);
  assert.equal(h.toAct, 3);
  h.act(3, 'call');
  assert.equal(h.toAct, 0, 'BB hat Option');
  h.act(0, 'check');
  assert.equal(h.phase, 'roundComplete');
  h.advance();
  assert.equal(h.board.length, 3);
  assert.equal(h.toAct, 0, 'postflop the BB starts (left of the button)');
});

test('3 players: UTG first, min-raise, reopening', () => {
  const h = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 10, bb: 20 });
  assert.equal(h.sbSeat, 1);
  assert.equal(h.bbSeat, 2);
  assert.equal(h.toAct, 0);
  assert.throws(() => h.act(0, 'raise', 30), (e) => e.code === 'minAmount' && e.params.min === 40);
  h.act(0, 'raise', 60); // raise by 40
  assert.equal(h.legalActions(1).minTo, 100);
  h.act(1, 'fold');
  h.act(2, 'call');
  assert.equal(h.phase, 'roundComplete');
  assert.equal(h.potTotal, 130);
});

test('An incomplete all-in raise does not reopen the raising', () => {
  const h = new HandEngine({
    players: [{ seat: 0, stack: 1000 }, { seat: 1, stack: 1000 }, { seat: 2, stack: 130 }],
    buttonSeat: 2, sb: 10, bb: 20,
  });
  // Button=2, SB=0, BB=1. First to act preflop: seat 2
  assert.equal(h.toAct, 2);
  h.act(2, 'call');
  h.act(0, 'raise', 100); // raise by 80
  h.act(1, 'call');
  h.act(2, 'allin'); // to 130 = only +30 (< 80)
  const l0 = h.legalActions(0);
  assert.equal(l0.canRaise, false, 'seat 0 may not raise again');
  assert.equal(l0.toCall, 30);
  h.act(0, 'call');
  assert.equal(h.legalActions(1).canRaise, false);
  h.act(1, 'call');
  assert.equal(h.phase, 'roundComplete');
  assert.equal(h.potTotal, 390);
});

test('Side pots and showdown distribution', () => {
  // Seat0 (button) 100, seat1 (SB) 300, seat2 (BB) 1000
  // Cards: round 1 from the SB: s1, s2, s0; round 2: s1, s2, s0
  const deck = stackedDeck([
    'Kc', 'Qc', 'Ac', // round 1: s1, s2, s0
    'Kd', 'Qd', 'Ad', // round 2
    '2s', '7h', '8s', '3d', // Burn + Flop
    '4s', 'Jc', // Burn + Turn
    '5s', '9c', // Burn + River
  ]);
  const h = new HandEngine({
    players: [{ seat: 0, stack: 100 }, { seat: 1, stack: 300 }, { seat: 2, stack: 1000 }],
    buttonSeat: 0, sb: 10, bb: 20, deck,
  });
  h.act(0, 'allin');
  h.act(1, 'allin');
  h.act(2, 'call');
  assert.equal(h.phase, 'roundComplete');
  assert.equal(h.runout, true);
  while (h.phase !== 'complete') h.advance();
  const r = h.results;
  assert.equal(r.pots.length, 2);
  assert.deepEqual(r.pots[0], { ...r.pots[0], amount: 300, winners: [0] });
  assert.deepEqual(r.pots[1], { ...r.pots[1], amount: 400, winners: [1] });
  assert.equal(h.player(0).stack, 300);
  assert.equal(h.player(1).stack, 400);
  assert.equal(h.player(2).stack, 700);
  const total = h.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(total, 1400);
});

test('An uncalled bet is returned, a fold wins the pot', () => {
  const h = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 10, bb: 20 });
  h.act(0, 'raise', 500);
  h.act(1, 'fold');
  h.act(2, 'fold');
  assert.equal(h.phase, 'complete');
  assert.equal(h.player(0).stack, 1030);
  assert.equal(h.player(1).stack, 990);
  assert.equal(h.player(2).stack, 980);
});

test('The odd chip of a split pot goes to the first player left of the button', () => {
  const deck = stackedDeck([
    'Ah', '2c', 'Kh', // round 1: s1(SB), s2(BB), s0(button)
    'Ad', '3c', 'Kd',
    '4c', 'Qs', 'Qh', 'Qd', // Flop
    '5c', 'Qc',
    '6c', 'Js',
  ]);
  // Board: Qs Qh Qd Qc Js – quads on the board, the kicker decides (A > K > J) -> s1 (A) wins alone
  const h = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 5, bb: 10, ante: 1, deck });
  h.act(0, 'call');
  h.act(1, 'call');
  h.act(2, 'check');
  for (let i = 0; i < 3; i++) {
    h.advance();
    h.act(1, 'check'); h.act(2, 'check'); h.act(0, 'check');
  }
  h.advance();
  assert.equal(h.results.pots[0].winners.join(), '1');

  // Real split: the board is the best hand for everyone
  const deck2 = stackedDeck([
    '2h', '3h', '4d',
    '2d', '3d', '4h',
    '5c', 'As', 'Ks', 'Qs', '6c', 'Js', '7c', 'Ts',
  ]);
  const h2 = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 5, bb: 10, ante: 1, deck: deck2 });
  h2.act(0, 'call'); h2.act(1, 'call'); h2.act(2, 'check');
  // Pot = 3 antes + 30 = 33 -> 11 per player
  for (let i = 0; i < 3; i++) { h2.advance(); h2.act(1, 'check'); h2.act(2, 'check'); h2.act(0, 'check'); }
  h2.advance();
  assert.equal(h2.results.pots[0].winners.length, 3);
  assert.deepEqual(h2.results.pots[0].shares, { 1: 11, 2: 11, 0: 11 });

  // Odd chip: pot 25 is split between seat 0 (button) and seat 2 -> seat 2 (left of the button) gets 13
  const deck3 = stackedDeck(['2h', '3h', '4h', '2d', '3d', '4d', '5c', 'As', 'Ks', 'Qs', '6c', 'Js', '7c', 'Ts']);
  const h3 = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 5, bb: 10, deck: deck3 });
  h3.act(0, 'call'); h3.act(1, 'fold'); h3.act(2, 'check');
  for (let i = 0; i < 3; i++) { h3.advance(); h3.act(2, 'check'); h3.act(0, 'check'); }
  h3.advance();
  assert.deepEqual(h3.results.pots[0].shares, { 2: 13, 0: 12 });
});

test('Fuzz: chips are conserved, hands always end', () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  for (let iter = 0; iter < 3000; iter++) {
    const n = 2 + rnd(4);
    const seats = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, n);
    const players = seats.map((seat) => ({ seat, stack: 1 + rnd(3000) }));
    const total = players.reduce((s, p) => s + p.stack, 0);
    const h = new HandEngine({ players, buttonSeat: seats[rnd(n)], sb: 10 + rnd(20), bb: 40, ante: rnd(3) * 5 });
    let guard = 0;
    while (h.phase !== 'complete') {
      assert.ok(guard++ < 500, 'endless loop');
      if (h.phase === 'roundComplete') { h.advance(); continue; }
      const l = h.legalActions(h.toAct);
      assert.ok(l, 'legalActions for toAct');
      const r = rnd(10);
      if (r < 2) h.act(h.toAct, 'fold');
      else if (r < 5 && l.canRaise) h.act(h.toAct, 'raise', l.minTo + rnd(Math.max(1, l.maxTo - l.minTo + 1)));
      else if (r < 6) h.act(h.toAct, 'allin');
      else h.act(h.toAct, l.canCheck ? 'check' : 'call');
      const inPlay = h.players.reduce((s, p) => s + p.stack + p.committed, 0);
      if (h.phase !== 'complete') assert.equal(inPlay, total);
    }
    const after = h.players.reduce((s, p) => s + p.stack, 0);
    assert.equal(after, total);
    assert.ok(h.players.every((p) => p.stack >= 0));
  }
});

test('Rabbit Cam shows exactly the cards that would have come', () => {
  for (const foldAfter of ['preflop', 'flop', 'turn']) {
    const deck = stackedDeck(['2h', '3h', '4h', '2d', '3d', '4d', '5c', 'As', 'Ks', 'Qs', '6c', 'Js', '7c', 'Ts']);
    const h = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 5, bb: 10, deck });
    // Reference: the same hand checked down to the river
    const ref = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 1000 })), buttonSeat: 0, sb: 5, bb: 10, deck });
    ref.act(0, 'call'); ref.act(1, 'call'); ref.act(2, 'check');
    for (let i = 0; i < 3; i++) { ref.advance(); ref.act(1, 'check'); ref.act(2, 'check'); ref.act(0, 'check'); }
    const fullBoard = ref.board;

    if (foldAfter === 'preflop') {
      h.act(0, 'fold'); h.act(1, 'fold');
    } else {
      h.act(0, 'call'); h.act(1, 'call'); h.act(2, 'check');
      h.advance();
      if (foldAfter === 'turn') { h.act(1, 'check'); h.act(2, 'check'); h.act(0, 'check'); h.advance(); }
      h.act(1, 'raise', 100); h.act(2, 'fold'); h.act(0, 'fold');
    }
    assert.equal(h.phase, 'complete');
    const rabbit = h.rabbitCards();
    assert.deepEqual([...h.board, ...rabbit], fullBoard, foldAfter);
    assert.deepEqual(h.rabbitCards(), rabbit, 'deterministic, deck unchanged');
  }
});

test('River decides: only when the winner depends on the river', () => {
  // Heads-up all-in preflop. Deck order: round 1 (SB=button, BB), round 2, then burn+flop, burn+turn, burn+river
  const run = (order) => {
    const h = new HandEngine({ players: [{ seat: 0, stack: 1000 }, { seat: 1, stack: 1000 }], buttonSeat: 0, sb: 10, bb: 20, deck: stackedDeck(order) });
    h.act(0, 'allin'); h.act(1, 'call');
    h.advance(); h.advance(); // Flop, Turn
    return h;
  };
  // Seat 1: flush draw against seat 0 with top pair -> the river decides
  const draw = run(['As', '9h', 'Kd', '8h', '2c', 'Ah', '4h', '7c', '3d', 'Jc', '5s', 'Qs']);
  assert.equal(draw.board.length, 4);
  assert.equal(draw.riverDecides(), true);
  // Seat 0 has quads, seat 1 is drawing dead -> no drama
  const dead = run(['As', '2h', 'Ad', '3h', '4c', 'Ah', 'Ac', '7c', '5d', '8d', '5s', 'Qs']);
  assert.equal(dead.riverDecides(), false);
});
