// Die eine Poker-Sitzung: Lobby -> Turnier -> Ergebnis.
import { randomUUID, randomInt } from 'node:crypto';
import { HandEngine } from './engine.js';
import { MAX_SEATS, defaultConfig, sanitizeConfig, levelAt } from '../shared/config.js';

const DELAY = {
  street: 900, // Pause bevor die nächste Straße kommt
  runout: 1800, // All-in-Runout zwischen den Straßen
  showdown: 6500, // Ergebnis anzeigen bis zur nächsten Hand
  uncontested: 3200,
  away: 1200, // abwesende Spieler handeln automatisch
  disconnected: 12000,
  lobbyLeave: 90_000, // Sitz in der Lobby freigeben, wenn getrennt
};

const fmt = (n) => Number(n || 0).toLocaleString('de-DE');

export class Session {
  constructor(io, { log = console.log, delays = {} } = {}) {
    this.io = io;
    this.logFn = log;
    this.delay = { ...DELAY, ...delays };
    this.clients = new Map(); // socketId -> { socket, token, voice: {joined, muted} }
    this.config = defaultConfig();
    this.#resetTournament();
    this.levelTicker = setInterval(() => this.#tickLevel(), 1000);
    this.levelTicker.unref?.();
  }

  #resetTournament() {
    clearTimeout(this.actionTimer);
    clearTimeout(this.stepTimer);
    this.phase = 'lobby';
    this.seats = Array.from({ length: MAX_SEATS }, () => null);
    this.hand = null;
    this.handCount = 0;
    this.buttonSeat = null;
    this.startedAt = 0;
    this.pausedTotal = 0;
    this.pausedAt = 0;
    this.paused = false;
    this.lastLevel = 0;
    this.results = [];
    this.log = [];
    this.actionDeadline = 0;
    this.stepDeadline = 0;
  }

  // ---------- Verbindungen ----------

  connect(socket) {
    let token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length < 10 || token.length > 64) token = randomUUID();
    this.clients.set(socket.id, { socket, token, voice: { joined: false, muted: false } });
    const seat = this.seatOfToken(token);
    if (seat != null) {
      this.seats[seat].connected = true;
      clearTimeout(this.seats[seat].leaveTimer);
    }
    socket.emit('welcome', { token, id: socket.id, iceServers: iceServers() });

    const on = (ev, fn) =>
      socket.on(ev, (...args) => {
        try {
          fn(...args);
        } catch (err) {
          socket.emit('toast', { kind: 'error', text: err.message || String(err) });
        }
      });

    on('sit', (d) => this.sit(token, d?.seat, d?.name));
    on('stand', () => this.stand(token));
    on('config', (d) => this.setConfig(token, d));
    on('start', () => this.start(token));
    on('action', (d) => this.action(token, d?.type, d?.amount));
    on('back', () => this.setAway(token, false));
    on('pause', () => this.togglePause(token));
    on('abort', () => this.abort(token));
    on('newTournament', () => this.newTournament(token));
    on('chat', (text) => this.chat(token, text));
    on('voice-join', (d) => this.voiceJoin(socket, d));
    on('voice-signal', (d) => this.voiceSignal(socket, d));
    on('voice-mute', (d) => this.voiceMute(socket, d));
    on('disconnect', () => this.disconnect(socket));
    this.broadcast();
  }

  disconnect(socket) {
    const c = this.clients.get(socket.id);
    this.clients.delete(socket.id);
    if (c?.voice.joined) this.io.emit('voice-left', { id: socket.id });
    if (!c) return;
    const seat = this.seatOfToken(c.token);
    if (seat != null && !this.#tokenConnected(c.token)) {
      const s = this.seats[seat];
      s.connected = false;
      if (this.phase === 'lobby') {
        s.leaveTimer = setTimeout(() => {
          if (this.phase === 'lobby' && this.seats[seat] === s && !s.connected) {
            this.seats[seat] = null;
            this.broadcast();
          }
        }, this.delay.lobbyLeave);
      } else if (this.hand && this.hand.toAct === seat) {
        this.#armActionTimer();
      }
    }
    this.broadcast();
  }

  #tokenConnected(token) {
    for (const c of this.clients.values()) if (c.token === token) return true;
    return false;
  }

  seatOfToken(token) {
    const i = this.seats.findIndex((s) => s && s.token === token);
    return i < 0 ? null : i;
  }

  #requireSeat(token) {
    const seat = this.seatOfToken(token);
    if (seat == null) throw new Error('Nur Spieler am Tisch können das.');
    return seat;
  }

  // ---------- Lobby ----------

  sit(token, seat, name) {
    if (this.phase !== 'lobby') throw new Error('Das Turnier läuft bereits.');
    seat = Number(seat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) throw new Error('Ungültiger Platz');
    name = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) throw new Error('Bitte gib einen Namen ein.');
    const current = this.seats[seat];
    if (current && current.token !== token) throw new Error('Der Platz ist schon belegt.');
    if (this.seats.some((s, i) => s && i !== seat && s.token !== token && s.name.toLowerCase() === name.toLowerCase()))
      throw new Error('Der Name ist schon vergeben.');
    const old = this.seatOfToken(token);
    if (old != null) this.seats[old] = null;
    this.seats[seat] = { token, name, stack: 0, connected: true, away: false, eliminated: false, place: null };
    this.#addLog(`${name} nimmt Platz ${seat + 1}.`);
    this.broadcast();
  }

  stand(token) {
    if (this.phase !== 'lobby') throw new Error('Während des Turniers kannst du nicht aufstehen.');
    const seat = this.seatOfToken(token);
    if (seat == null) return;
    this.#addLog(`${this.seats[seat].name} steht auf.`);
    this.seats[seat] = null;
    this.broadcast();
  }

  setConfig(token, data) {
    if (this.phase !== 'lobby') throw new Error('Die Struktur kann nur vor dem Turnier geändert werden.');
    this.#requireSeat(token);
    this.config = sanitizeConfig(data, this.config);
    this.broadcast();
  }

  start(token) {
    if (this.phase !== 'lobby') return;
    this.#requireSeat(token);
    const seated = this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (seated.length < 2) throw new Error('Mindestens zwei Spieler müssen Platz nehmen.');
    for (const i of seated) {
      const s = this.seats[i];
      clearTimeout(s.leaveTimer);
      Object.assign(s, { stack: this.config.startingStack, eliminated: false, place: null, away: false });
    }
    this.phase = 'running';
    this.startedAt = Date.now();
    this.pausedTotal = 0;
    this.paused = false;
    this.lastLevel = 0;
    this.buttonSeat = seated[randomInt(seated.length)];
    this.handCount = 0;
    const l = levelAt(this.config, 0);
    this.#addLog(`Turnier gestartet! ${seated.length} Spieler, je ${fmt(this.config.startingStack)} Chips. Blinds ${fmt(l.sb)}/${fmt(l.bb)}.`, 'system');
    this.#startHand(true);
  }

  // ---------- Turnier ----------

  levelElapsed(now = Date.now()) {
    if (this.phase !== 'running' && this.phase !== 'finished') return 0;
    const end = this.phase === 'finished' ? this.finishedAt : now;
    return end - this.startedAt - this.pausedTotal - (this.paused ? end - this.pausedAt : 0);
  }

  levelIndex(now) {
    return Math.floor(this.levelElapsed(now) / (this.config.levelMinutes * 60_000));
  }

  #tickLevel() {
    if (this.phase !== 'running' || this.paused) return;
    const idx = this.levelIndex();
    if (idx !== this.lastLevel) {
      this.lastLevel = idx;
      const l = levelAt(this.config, idx);
      this.#addLog(`Level ${idx + 1}: Blinds steigen auf ${fmt(l.sb)}/${fmt(l.bb)}${l.ante ? ` (Ante ${fmt(l.ante)})` : ''} – ab der nächsten Hand.`, 'level');
      this.io.emit('levelUp', { level: idx + 1, ...l });
      this.broadcast();
    }
  }

  #alive() {
    return this.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i >= 0);
  }

  #startHand(first = false) {
    this.stepDeadline = 0;
    if (this.phase !== 'running') return;
    if (this.paused) {
      this.hand = null;
      this.broadcast();
      return;
    }
    const alive = this.#alive();
    if (!first) {
      const after = alive.filter((i) => i > this.buttonSeat);
      this.buttonSeat = after.length ? after[0] : alive[0];
    }
    const lvl = levelAt(this.config, this.levelIndex());
    this.handCount++;
    this.hand = new HandEngine({
      players: alive.map((seat) => ({ seat, stack: this.seats[seat].stack })),
      buttonSeat: this.buttonSeat,
      sb: lvl.sb,
      bb: lvl.bb,
      ante: lvl.ante,
      handId: this.handCount,
    });
    this.#afterChange();
  }

  action(token, type, amount) {
    const seat = this.#requireSeat(token);
    if (!this.hand || this.hand.phase !== 'betting') throw new Error('Gerade keine Aktion möglich.');
    if (this.hand.toAct !== seat) throw new Error('Du bist nicht am Zug.');
    this.seats[seat].away = false;
    this.#doAction(seat, type, amount);
  }

  #doAction(seat, type, amount) {
    const ev = this.hand.act(seat, type, amount);
    this.#logAction(seat, ev);
    this.#afterChange();
  }

  #logAction(seat, ev) {
    const n = this.seats[seat].name;
    const ai = ev.allIn ? ' (All-in)' : '';
    let text = null;
    switch (ev.type) {
      case 'fold': text = `${n} passt.`; break;
      case 'check': text = `${n} checkt.`; break;
      case 'call': text = `${n} geht mit (${fmt(ev.amount)})${ai}.`; break;
      case 'bet': text = `${n} setzt ${fmt(ev.amount)}${ai}.`; break;
      case 'raise': text = `${n} erhöht auf ${fmt(ev.amount)}${ai}.`; break;
    }
    if (text) this.#addLog(text, 'action');
  }

  #afterChange() {
    clearTimeout(this.actionTimer);
    clearTimeout(this.stepTimer);
    this.actionDeadline = 0;
    const h = this.hand;
    if (!h) return this.broadcast();
    if (h.phase === 'betting') {
      this.#armActionTimer();
    } else if (h.phase === 'roundComplete') {
      const d = h.runout ? this.delay.runout : this.delay.street;
      this.#step(d, () => {
        h.advance();
        if (h.phase === 'complete') this.#handComplete();
        else this.#afterChange();
      });
    } else if (h.phase === 'complete') {
      this.#handComplete();
      return;
    }
    this.broadcast();
  }

  #step(ms, fn) {
    clearTimeout(this.stepTimer);
    this.stepDeadline = Date.now() + ms;
    this.stepTimer = setTimeout(() => this.#safe(fn), ms);
  }

  #safe(fn) {
    try {
      fn();
    } catch (err) {
      console.error('Fehler im Spielablauf:', err);
      this.broadcast();
    }
  }

  #armActionTimer() {
    clearTimeout(this.actionTimer);
    const h = this.hand;
    if (!h || h.phase !== 'betting') return;
    const seat = h.toAct;
    const s = this.seats[seat];
    let ms = this.config.actionSeconds * 1000;
    if (s.away) ms = this.delay.away;
    else if (!s.connected) ms = Math.min(ms, this.delay.disconnected);
    this.actionDeadline = Date.now() + ms;
    this.actionTimer = setTimeout(() => this.#safe(() => {
      if (this.hand !== h || h.toAct !== seat || h.phase !== 'betting') return;
      const legal = h.legalActions(seat);
      if (!s.away) {
        s.away = true;
        this.#addLog(`${s.name} ist abwesend – es wird automatisch gecheckt/gepasst.`, 'system');
      }
      this.#doAction(seat, legal.canCheck ? 'check' : 'fold');
    }), ms);
  }

  #handComplete() {
    clearTimeout(this.actionTimer);
    const h = this.hand;
    for (const p of h.players) this.seats[p.seat].stack = p.stack;
    const r = h.results;
    for (const pot of r.pots) {
      const names = pot.winners.map((s) => this.seats[s].name).join(' & ');
      const verb = pot.winners.length > 1 ? 'teilen sich' : 'gewinnt';
      const potName = r.pots.length > 1 ? (pot === r.pots[0] ? 'den Hauptpot' : 'einen Sidepot') : 'den Pot';
      this.#addLog(`${names} ${verb} ${potName} (${fmt(pot.amount)})${pot.handName ? ` mit ${pot.handName}` : ''}.`, 'win');
    }
    this.#step(r.uncontested ? this.delay.uncontested : this.delay.showdown, () => this.#afterHand());
    this.broadcast();
  }

  #afterHand() {
    const h = this.hand;
    const alive = this.#alive();
    const busted = alive.filter((i) => this.seats[i].stack <= 0);
    if (busted.length) {
      // Wer mit weniger Chips in die Hand ging, scheidet schlechter platziert aus
      busted.sort((a, b) => h.player(a).startStack - h.player(b).startStack);
      let place = alive.length;
      for (const i of busted) {
        const s = this.seats[i];
        s.eliminated = true;
        s.place = place--;
        this.results.push({ seat: i, name: s.name, place: s.place });
        this.#addLog(`${s.name} scheidet auf Platz ${s.place} aus.`, 'bust');
      }
    }
    const left = this.#alive();
    if (left.length <= 1) {
      const w = this.seats[left[0]];
      w.place = 1;
      this.results.push({ seat: left[0], name: w.name, place: 1 });
      this.results.sort((a, b) => a.place - b.place);
      this.phase = 'finished';
      this.finishedAt = Date.now();
      this.hand = null;
      this.#addLog(`🏆 ${w.name} gewinnt das Turnier!`, 'win');
      this.broadcast();
      return;
    }
    this.#startHand();
  }

  setAway(token, away) {
    const seat = this.seatOfToken(token);
    if (seat == null) return;
    this.seats[seat].away = away;
    if (this.hand?.toAct === seat) this.#armActionTimer();
    this.broadcast();
  }

  togglePause(token) {
    const seat = this.#requireSeat(token);
    if (this.phase !== 'running') return;
    const name = this.seats[seat].name;
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = Date.now();
      this.#addLog(`${name} pausiert das Turnier${this.hand && this.hand.phase !== 'complete' ? ' (nach dieser Hand)' : ''}.`, 'system');
    } else {
      this.paused = false;
      this.pausedTotal += Date.now() - this.pausedAt;
      this.#addLog(`${name} setzt das Turnier fort.`, 'system');
      if (!this.hand) this.#startHand();
    }
    this.broadcast();
  }

  abort(token) {
    const seat = this.#requireSeat(token);
    if (this.phase === 'lobby') return;
    const name = this.seats[seat].name;
    this.#resetTournament();
    this.#addLog(`${name} hat das Turnier abgebrochen.`, 'system');
    this.broadcast();
  }

  newTournament(token) {
    if (this.phase !== 'finished') return;
    this.#resetTournament();
    this.#addLog('Neues Turnier – bitte Platz nehmen!', 'system');
    this.broadcast();
  }

  chat(token, text) {
    text = String(text ?? '').trim().slice(0, 200);
    if (!text) return;
    const seat = this.seatOfToken(token);
    const name = seat != null ? this.seats[seat].name : 'Zuschauer';
    this.#addLog(`${name}: ${text}`, 'chat');
    this.broadcast();
  }

  #addLog(text, kind = 'info') {
    this.log.push({ t: Date.now(), text, kind, id: (this.logId = (this.logId || 0) + 1) });
    if (this.log.length > 80) this.log.shift();
  }

  // ---------- Voice-Signaling (WebRTC Mesh) ----------

  voiceJoin(socket, d) {
    const c = this.clients.get(socket.id);
    if (!c) return;
    c.voice = { joined: true, muted: !!d?.muted };
    const peers = [...this.clients.entries()].filter(([id, o]) => id !== socket.id && o.voice.joined).map(([id]) => id);
    socket.emit('voice-peers', { peers });
    this.broadcast();
  }

  voiceSignal(socket, d) {
    const target = this.clients.get(d?.to);
    if (!target) return;
    target.socket.emit('voice-signal', { from: socket.id, description: d.description, candidate: d.candidate });
  }

  voiceMute(socket, d) {
    const c = this.clients.get(socket.id);
    if (!c) return;
    c.voice.muted = !!d?.muted;
    this.broadcast();
  }

  // ---------- Zustand an Clients ----------

  view(token, socketId) {
    const mySeat = this.seatOfToken(token);
    const now = Date.now();
    const lvlIdx = this.levelIndex(now);
    const levelMs = this.config.levelMinutes * 60_000;
    const hv = this.hand ? this.hand.view(mySeat) : null;
    const nameOf = (tok) => {
      const i = this.seatOfToken(tok);
      return i == null ? null : this.seats[i].name;
    };
    return {
      phase: this.phase,
      config: this.config,
      mySeat,
      paused: this.paused,
      seats: this.seats.map((s, i) =>
        s
          ? {
              seat: i,
              name: s.name,
              stack: hv?.players[i] ? hv.players[i].stack : s.stack,
              connected: s.connected,
              away: s.away,
              eliminated: s.eliminated,
              place: s.place,
            }
          : null,
      ),
      hand: hv,
      turnRemaining: this.actionDeadline ? Math.max(0, this.actionDeadline - now) : 0,
      turnTotal: this.hand?.toAct != null ? this.config.actionSeconds * 1000 : 0,
      level: {
        index: lvlIdx,
        ...levelAt(this.config, lvlIdx),
        next: levelAt(this.config, lvlIdx + 1),
        remaining: this.phase === 'running' ? levelMs - (this.levelElapsed(now) % levelMs) : levelMs,
        elapsed: this.levelElapsed(now),
      },
      results: this.results,
      log: this.log.slice(-40),
      voice: [...this.clients.entries()]
        .filter(([, c]) => c.voice.joined)
        .map(([id, c]) => ({ id, name: nameOf(c.token), seat: this.seatOfToken(c.token), muted: c.voice.muted, self: id === socketId })),
      spectators: [...this.clients.values()].filter((c) => this.seatOfToken(c.token) == null).length,
    };
  }

  broadcast() {
    for (const [id, c] of this.clients) c.socket.emit('state', this.view(c.token, id));
  }

  close() {
    clearInterval(this.levelTicker);
    clearTimeout(this.actionTimer);
    clearTimeout(this.stepTimer);
  }
}

function iceServers() {
  const list = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',') }];
  if (process.env.TURN_URL) {
    list.push({
      urls: process.env.TURN_URL.split(','),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_PASSWORD || '',
    });
  }
  return list;
}
