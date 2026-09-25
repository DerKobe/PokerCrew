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

test('Komplettes Turnier mit 5 Spielern endet mit einem Sieger', async () => {
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

  // Zuschauer darf nicht starten
  spectator.send('start');
  assert.equal(s.phase, 'lobby');
  socks[0].send('start');
  assert.equal(s.phase, 'running');

  // Zuschauer sieht keine Hole Cards, Spieler sieht die eigenen
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
  const total = s.seats.reduce((a, x) => a + x.stack, 0);
  assert.equal(total, 5000);
  s.close();
});

test('Zeitüberschreitung: automatisch checken/passen, Spieler wird abwesend', async () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 1, revealTimeout: 1, dramatic: 1, away: 1, disconnected: 1 } });
  const a = new FakeSocket('a', 'token-timeout-a');
  const b = new FakeSocket('b', 'token-timeout-b');
  s.connect(a);
  s.connect(b);
  a.send('sit', { seat: 1, name: 'A' });
  b.send('sit', { seat: 3, name: 'B' });
  s.config.actionSeconds = 0.005; // direkt gesetzt, umgeht die Validierung (min. 10 s)
  a.send('start');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(s.phase, 'running');
  assert.ok(s.handCount > 3, `mehrere Hände gespielt (${s.handCount})`);
  assert.ok(s.log.some((e) => e.text.includes('passt')));
  assert.ok(s.seats[1].away && s.seats[3].away);
  // Zurückmelden hebt Abwesenheit auf
  a.send('back');
  assert.equal(s.seats[1].away, false);
  const total = s.seats[1].stack + s.seats[3].stack + (s.hand ? s.hand.players.reduce((x, p) => x + p.committed, 0) : 0);
  assert.ok(total > 0);
  s.close();
});

test('Rabbit Cam: 5-Sekunden-Fenster nach vorzeitigem Handende', async () => {
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, rabbitWindow: 80, rabbitShow: 80 } });
  const socks = [new FakeSocket('ra', 'token-rabbit-a'), new FakeSocket('rb', 'token-rabbit-b'), new FakeSocket('rs', 'token-rabbit-spec')];
  socks.forEach((so) => s.connect(so));
  socks[0].send('sit', { seat: 0, name: 'A' });
  socks[1].send('sit', { seat: 2, name: 'B' });
  socks[0].send('start');
  const bySeat = { 0: socks[0], 2: socks[1] };

  // Hand 1: sofort passen -> Fenster offen
  bySeat[s.hand.toAct].send('action', { type: 'fold' });
  assert.equal(socks[0].lastState.rabbit.open, true);
  assert.equal(socks[0].lastState.rabbit.cards, null);
  socks[2].send('rabbit'); // Zuschauer darf nicht
  assert.equal(s.rabbit.cards, null);
  socks[1].send('rabbit');
  assert.equal(s.rabbit.cards.length, 5, 'Preflop-Fold: komplettes Board');
  assert.equal(socks[0].lastState.rabbit.by, 'B');
  assert.deepEqual(socks[2].lastState.rabbit.cards, s.rabbit.cards, 'Zuschauer sehen die Karten');
  assert.ok(s.log.some((e) => e.text.includes('Rabbit Cam')));
  const hand1 = s.handCount;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(s.handCount, hand1 + 1, 'nach der Anzeige geht es weiter');
  assert.equal(socks[0].lastState.rabbit, null);

  // Hand 2: ohne Klick -> nach dem Fenster normal weiter
  bySeat[s.hand.toAct].send('action', { type: 'fold' });
  assert.equal(s.rabbit.cards, null);
  await new Promise((r) => setTimeout(r, 130));
  assert.equal(s.handCount, hand1 + 2);
  socks[0].send('rabbit'); // zu spät / neue Hand -> nichts passiert
  assert.equal(s.rabbit, null);
  s.close();
});

test('All-in-Runout: Board wird erst auf Klick aufgedeckt, Fallback nach Timeout', async () => {
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
  assert.equal(s.hand.board.length, 0, 'nichts automatisch aufgedeckt');
  assert.equal(socks[2].lastState.reveal.next, 'flop');
  socks[2].send('reveal'); // Zuschauer darf nicht
  assert.equal(s.hand.board.length, 0);
  socks[0].send('reveal');
  assert.equal(s.hand.board.length, 3);
  assert.equal(socks[0].lastState.reveal.next, 'turn');
  assert.ok(s.log.some((e) => e.text === 'A deckt den Flop auf.'));
  socks[1].send('reveal');
  assert.equal(s.hand.board.length, 4);
  assert.equal(socks[0].lastState.reveal.next, 'river');
  // niemand klickt -> Fallback deckt den River auf
  await new Promise((r) => setTimeout(r, 260));
  assert.equal(s.hand.board.length, 5);
  assert.equal(typeof socks[0].lastState.drama, 'boolean');
  assert.equal(socks[0].lastState.reveal, null);
  s.close();
});
