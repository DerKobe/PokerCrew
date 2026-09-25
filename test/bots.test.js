import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandEngine } from '../server/engine.js';
import { decide, equity, pickBots, PROFILES, ROSTER } from '../server/bots.js';

test('Roster: unique names that fit the name field, every profile exists', () => {
  const names = ROSTER.map((b) => b.name);
  assert.equal(new Set(names).size, names.length);
  for (const b of ROSTER) {
    assert.ok(b.name.length <= 16, b.name);
    assert.ok(PROFILES[b.profile], b.profile);
  }
  const picked = pickBots(5, ['Blaze']);
  assert.equal(picked.length, 5);
  assert.ok(!picked.some((b) => b.name === 'Blaze'), 'taken names are skipped');
  assert.equal(pickBots(99).length, ROSTER.length);
});

test('Equity: aces beat a random hand most of the time, 7-2 rarely', () => {
  assert.ok(equity(['As', 'Ad'], [], 1, 600) > 0.75);
  assert.ok(equity(['7c', '2d'], [], 1, 600) < 0.42);
  assert.equal(equity(['7c', '2d'], [], 0), 1);
});

test('Bots only make legal moves and every hand ends (all profiles)', () => {
  const profiles = Object.keys(PROFILES);
  for (let n = 0; n < 50; n++) {
    const count = 2 + (n % 5);
    const players = Array.from({ length: count }, (_, i) => ({ seat: i, stack: 200 + Math.floor(Math.random() * 3000) }));
    const h = new HandEngine({ players, buttonSeat: n % count, sb: 10, bb: 20 });
    const total = players.reduce((a, p) => a + p.stack, 0);
    let guard = 0;
    while (h.phase !== 'complete') {
      assert.ok(guard++ < 300, 'endless hand');
      if (h.phase !== 'betting') {
        h.advance();
        continue;
      }
      const seat = h.toAct;
      const move = decide(h, seat, profiles[seat % profiles.length]);
      h.act(seat, move.type, move.amount); // throws on an illegal move
    }
    assert.equal(h.players.reduce((a, p) => a + p.stack, 0), total);
  }
});

test('Profiles play differently: a rock folds 7-2 to a raise, a strong hand gets raised', () => {
  const setup = (cards) => {
    // seat 1 (button/SB heads-up would act first) -> use 3 players: button 0, SB 1, BB 2; UTG = button acts first
    const h = new HandEngine({ players: [0, 1, 2].map((seat) => ({ seat, stack: 5000 })), buttonSeat: 0, sb: 25, bb: 50 });
    h.player(1).cards = cards;
    h.act(0, 'raise', 200); // button raises
    return h;
  };
  let rockFolds = 0;
  let sharkRaises = 0;
  for (let i = 0; i < 20; i++) {
    if (decide(setup(['7c', '2d']), 1, 'rock').type === 'fold') rockFolds++;
    if (['raise', 'allin'].includes(decide(setup(['As', 'Ad']), 1, 'tag').type)) sharkRaises++;
  }
  assert.ok(rockFolds >= 18, `rock folded ${rockFolds}/20`);
  assert.ok(sharkRaises >= 12, `shark raised aces ${sharkRaises}/20`);
});
