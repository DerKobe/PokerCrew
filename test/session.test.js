import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Session } from '../server/session.js';

class FakeSocket extends EventEmitter {
  constructor(id, token) {
    super();
    this.id = id;
    this.handshake = { auth: { token } };
    this.received = [];
    this.lastState = null;
    this.broadcasted = [];
    this.broadcast = { emit: (ev, data) => this.broadcasted.push([ev, data]) };
  }
  emit(ev, data) {
    if (ev === 'state') this.lastState = data;
    this.received.push([ev, data]);
    return true;
  }
  send(ev, data) {
    this.listeners(ev).forEach((fn) => fn(data));
  }
}

const fakeIo = { emit() {} };

test('A full tournament with 5 players ends with a winner', async () => {
  const s = new Session(fakeIo, {
    delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, revealTimeout: 1, dramatic: 1, away: 1, disconnected: 1 },
  });
  s.config.startingStack = 1000;
  s.config.levels = [{ sb: 50, bb: 100, ante: 0 }];
  const socks = [0, 1, 2, 3, 4].map((i) => new FakeSocket(`sock${i}`, `token-player-${i}`));
  const spectator = new FakeSocket('spec', 'token-spectator-x');
  for (const so of [...socks, spectator]) s.connect(so);
  socks.forEach((so, i) => so.send('sit', { seat: i, name: `P${i}` }));
  assert.equal(s.seats.filter(Boolean).length, 5);

  // A spectator may not start
  spectator.send('start');
  assert.equal(s.phase, 'lobby');
  socks[0].send('start');
  assert.equal(s.phase, 'running');

  // A spectator sees no hole cards, a player sees their own
  const st = spectator.lastState;
  assert.ok(Object.values(st.hand.players).every((p) => p.cards === null));
  const me = socks[0].lastState;
  assert.equal(me.hand.players[0].cards.length, 2);
  assert.equal(me.hand.players[1].cards, null);

  let guard = 0;
  while (s.phase === 'running' && guard++ < 20000) {
    const h = s.hand;
    if (h && h.phase === 'betting') {
      const seat = h.toAct;
      const l = h.legalActions(seat);
      const r = Math.random();
      const sock = socks[seat];
      if (r < 0.15) sock.send('action', { type: 'fold' });
      else if (r < 0.45 && l.canRaise) sock.send('action', { type: 'allin' });
      else sock.send('action', { type: l.canCheck ? 'check' : 'call' });
    } else {
      await new Promise((r) => setTimeout(r, 3));
    }
  }
  assert.equal(s.phase, 'finished');
  assert.equal(s.results.length, 5);
  assert.deepEqual(s.results.map((r) => r.place), [1, 2, 3, 4, 5]);
  const total = s.seats.filter(Boolean).reduce((a, x) => a + x.stack, 0);
  assert.equal(total, 5000);
  s.close();
});

test('Timeout: automatic check/fold, player is marked away', async () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, revealTimeout: 1, dramatic: 1, away: 1, disconnected: 1 } });
  const a = new FakeSocket('a', 'token-timeout-a');
  const b = new FakeSocket('b', 'token-timeout-b');
  s.connect(a);
  s.connect(b);
  a.send('sit', { seat: 1, name: 'A' });
  b.send('sit', { seat: 3, name: 'B' });
  s.config.actionSeconds = 0.005; // set directly, bypasses validation (min. 10 s)
  a.send('start');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(s.phase, 'running');
  assert.ok(s.handCount > 3, `several hands played (${s.handCount})`);
  assert.ok(s.log.some((e) => e.key === 'fold' || e.key === 'check'));
  assert.ok(s.seats[1].away && s.seats[3].away);
  // Coming back clears the away state
  a.send('back');
  assert.equal(s.seats[1].away, false);
  const total = s.seats[1].stack + s.seats[3].stack + (s.hand ? s.hand.players.reduce((x, p) => x + p.committed, 0) : 0);
  assert.ok(total > 0);
  s.close();
});

test('Rabbit Cam: 5-second window after a hand ends early', async () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 80, rabbitShow: 80 } });
  const socks = [new FakeSocket('ra', 'token-rabbit-a'), new FakeSocket('rb', 'token-rabbit-b'), new FakeSocket('rs', 'token-rabbit-spec')];
  socks.forEach((so) => s.connect(so));
  socks[0].send('sit', { seat: 0, name: 'A' });
  socks[1].send('sit', { seat: 2, name: 'B' });
  socks[0].send('start');
  const bySeat = { 0: socks[0], 2: socks[1] };

  // Hand 1: fold right away -> window open
  bySeat[s.hand.toAct].send('action', { type: 'fold' });
  assert.equal(socks[0].lastState.rabbit.open, true);
  assert.equal(socks[0].lastState.rabbit.cards, null);
  socks[2].send('rabbit'); // spectators may not
  assert.equal(s.rabbit.cards, null);
  socks[1].send('rabbit');
  assert.equal(s.rabbit.cards.length, 5, 'Preflop-Fold: komplettes Board');
  assert.equal(socks[0].lastState.rabbit.by, 'B');
  assert.deepEqual(socks[2].lastState.rabbit.cards, s.rabbit.cards, 'spectators see the cards');
  assert.ok(s.log.some((e) => e.key === 'rabbit' && e.p.cards.length > 0));
  const hand1 = s.handCount;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(s.handCount, hand1 + 1, 'play continues after the display');
  assert.equal(socks[0].lastState.rabbit, null);

  // Hand 2: no click -> play continues normally after the window
  bySeat[s.hand.toAct].send('action', { type: 'fold' });
  assert.equal(s.rabbit.cards, null);
  await new Promise((r) => setTimeout(r, 130));
  assert.equal(s.handCount, hand1 + 2);
  socks[0].send('rabbit'); // too late / new hand -> nothing happens
  assert.equal(s.rabbit, null);
  s.close();
});

test('All-in runout: the board is only revealed on click, fallback after a timeout', async () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 5000, uncontested: 1, rabbitWindow: 1, revealTimeout: 200, dramatic: 1 } });
  const socks = [new FakeSocket('va', 'token-reveal-a'), new FakeSocket('vb', 'token-reveal-b'), new FakeSocket('vs', 'token-reveal-spec')];
  socks.forEach((so) => s.connect(so));
  socks[0].send('sit', { seat: 1, name: 'A' });
  socks[1].send('sit', { seat: 3, name: 'B' });
  socks[0].send('start');
  const bySeat = { 1: socks[0], 3: socks[1] };
  bySeat[s.hand.toAct].send('action', { type: 'allin' });
  bySeat[s.hand.toAct].send('action', { type: 'call' });
  assert.equal(s.hand.runout, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.hand.board.length, 0, 'nothing revealed automatically');
  assert.equal(socks[2].lastState.reveal.next, 'flop');
  socks[2].send('reveal'); // spectators may not
  assert.equal(s.hand.board.length, 0);
  socks[0].send('reveal');
  assert.equal(s.hand.board.length, 3);
  assert.equal(socks[0].lastState.reveal.next, 'turn');
  assert.ok(s.log.some((e) => e.key === 'reveal' && e.p.name === 'A' && e.p.street === 'flop'));
  socks[1].send('reveal');
  assert.equal(s.hand.board.length, 4);
  assert.equal(socks[0].lastState.reveal.next, 'river');
  // nobody clicks -> the fallback reveals the river
  await new Promise((r) => setTimeout(r, 260));
  assert.equal(s.hand.board.length, 5);
  assert.equal(typeof socks[0].lastState.drama, 'boolean');
  assert.equal(socks[0].lastState.reveal, null);
  s.close();
});

test('Gadgets: chosen in the lobby, locked during the tournament', () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, away: 1 } });
  const a = new FakeSocket('ga', 'token-gadget-a');
  const b = new FakeSocket('gb', 'token-gadget-b');
  s.connect(a);
  s.connect(b);
  a.send('sit', { seat: 0, name: 'A', gadget: 'whiskey' });
  b.send('sit', { seat: 2, name: 'B', gadget: 'nonsense' });
  assert.equal(a.lastState.seats[0].gadget, 'whiskey');
  assert.equal(a.lastState.seats[2].gadget, null);
  // Switching in the lobby; changing the name keeps the gadget
  b.send('gadget', 'vape');
  b.send('sit', { seat: 2, name: 'Bea' });
  assert.equal(s.seats[2].gadget, 'vape');
  b.send('sit', { seat: 3, name: 'Bea' });
  assert.equal(s.seats[3].gadget, 'vape');

  // A click is relayed to the others (rate-limited)
  a.send('gadget-play');
  a.send('gadget-play');
  assert.equal(a.broadcasted.filter(([ev]) => ev === 'gadget').length, 1);
  assert.equal(a.broadcasted[0][1].seat, 0);

  a.send('start');
  assert.equal(s.phase, 'running');
  b.send('gadget', 'cigar');
  assert.equal(s.seats[3].gadget, 'vape');
  assert.ok(b.received.some(([ev, d]) => ev === 'toast' && d.key === 'err.gadgetLocked'));
  s.close();
});

test('Seat count: configurable 2-10, never below the seated players', () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, away: 1 } });
  const socks = [0, 1, 2].map((i) => new FakeSocket(`c${i}`, `token-count-${i}`));
  for (const so of socks) s.connect(so);
  // anyone in the lobby may pick the seat count, the rest of the structure needs a seat
  socks[0].send('seats', 10);
  assert.equal(socks[0].lastState.seats.length, 10);
  socks[0].send('config', { startingStack: 500 });
  assert.equal(s.config.startingStack, 10000, 'spectators cannot change the structure');
  socks[0].send('sit', { seat: 0, name: 'A' });
  socks[1].send('sit', { seat: 9, name: 'B' });
  socks[2].send('sit', { seat: 7, name: 'C' });
  // shrinking moves B and C onto free seats instead of dropping them
  socks[1].send('seats', 2);
  assert.equal(s.config.seats, 3, 'not below the 3 seated players');
  assert.deepEqual(socks[0].lastState.seats.map((x) => x?.name).sort(), ['A', 'B', 'C']);
  socks[0].send('config', { seats: 99 });
  assert.equal(s.config.seats, 10);
  socks[1].send('sit', { seat: 10, name: 'B' });
  assert.ok(socks[1].received.some(([ev, d]) => ev === 'toast' && d.key === 'err.invalidSeat'));
  socks[0].send('start');
  socks[0].send('seats', 4);
  s.close();
  assert.equal(s.config.seats, 10, 'locked once the tournament runs');
});

test('Late registration: free seat while nobody has busted, dealt in from the next hand', async () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, revealTimeout: 1, dramatic: 1, away: 1 } });
  const socks = [0, 1, 2].map((i) => new FakeSocket(`l${i}`, `token-late-${i}`));
  for (const so of socks) s.connect(so);
  socks[0].send('sit', { seat: 0, name: 'A' });
  socks[1].send('sit', { seat: 1, name: 'B' });
  socks[0].send('start');
  assert.equal(s.phase, 'running');
  assert.equal(socks[2].lastState.lateReg, true);
  const hand = s.hand.handId;
  socks[2].send('sit', { seat: 3, name: 'Late', gadget: 'vape' });
  assert.equal(s.seats[3].stack, s.config.startingStack);
  assert.equal(s.seats[3].gadget, 'vape');
  assert.ok(!s.hand.players.some((p) => p.seat === 3), 'not in the running hand');
  assert.ok(s.log.some((e) => e.key === 'lateJoin' && e.p.name === 'Late'));
  // seated players cannot switch seats mid-tournament
  socks[2].send('sit', { seat: 4, name: 'Late' });
  assert.equal(s.seats[4], null);
  // next hand deals the late player in
  socks[s.hand.toAct].send('action', { type: 'fold' });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(s.hand.handId > hand);
  assert.ok(s.hand.players.some((p) => p.seat === 3), 'dealt in');
  // once somebody busts, late registration closes
  s.seats[1].eliminated = true;
  assert.equal(s.lateRegOpen(), false);
  const d = new FakeSocket('l9', 'token-late-9');
  s.connect(d);
  d.send('sit', { seat: 2, name: 'Too late' });
  assert.equal(s.seats[2], null);
  assert.ok(d.received.some(([ev, x]) => ev === 'toast' && x.key === 'err.lateRegClosed'));
  s.close();
});

test('Table look (name, felt, rim): editable by everyone in the lobby, sanitized, locked while running', () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, away: 1 } });
  const [a, b, spec] = [0, 1, 2].map((i) => new FakeSocket(`t${i}`, `token-title-${i}`));
  for (const so of [a, b, spec]) s.connect(so);
  assert.equal(spec.lastState.config.title, 'PokerCrew');
  spec.send('table', { title: '  Friday   Night\tPoker  ' });
  assert.equal(a.lastState.config.title, 'Friday Night Poker');
  spec.send('table', { title: 'x'.repeat(60) });
  assert.equal(s.config.title.length, 28);
  spec.send('table', { title: '   ' });
  assert.equal(s.config.title, 'PokerCrew', 'empty falls back to the default');
  assert.equal(s.config.felt, 'green');
  assert.equal(s.config.rim, 'wood');
  spec.send('table', { felt: 'red', rim: 'marbleDark' });
  assert.equal(a.lastState.config.felt, 'red');
  assert.equal(a.lastState.config.rim, 'marbleDark');
  spec.send('table', { felt: 'purple', rim: 'gold', startingStack: 5 });
  assert.equal(s.config.felt, 'red', 'unknown values are ignored');
  assert.equal(s.config.rim, 'marbleDark');
  assert.equal(s.config.startingStack, 10000, 'the table event cannot touch the structure');
  a.send('sit', { seat: 0, name: 'A' });
  b.send('sit', { seat: 1, name: 'B' });
  a.send('start');
  spec.send('table', { title: 'Too late', felt: 'blue' });
  s.close();
  assert.equal(s.config.title, 'PokerCrew');
  assert.equal(s.config.felt, 'red');
  assert.ok(spec.received.some(([ev, d]) => ev === 'toast' && d.key === 'err.configLocked'));
});
