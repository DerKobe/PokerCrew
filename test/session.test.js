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
    delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, away: 1, disconnected: 1 },
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
  const s = new Session(fakeIo, { delays: { street: 1, runout: 1, showdown: 1, uncontested: 1, away: 1, disconnected: 1 } });
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
