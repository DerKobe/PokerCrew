// The single poker session: lobby -> tournament -> results.
import { randomUUID, randomInt } from 'node:crypto';
import { HandEngine } from './engine.js';
import { MAX_SEATS, defaultConfig, sanitizeConfig, levelAt } from '../shared/config.js';
import { isGadget } from '../shared/gadgets.js';
import { UserError } from './errors.js';

const DELAY = {
  street: 900, // pause before the next street is dealt
  runout: 1800, // all-in runout between streets
  showdown: 6500, // show the result until the next hand
  uncontested: 3200,
  rabbitWindow: 5000, // how long the Rabbit Cam can be requested
  rabbitShow: 5000, // how long the Rabbit Cam cards stay on the table
  revealTimeout: 20_000, // all-in runout: reveal automatically if nobody clicks
  dramatic: 7500, // pause after a dramatic river before the showdown
  away: 1200, // away players act automatically
  disconnected: 12000,
  lobbyLeave: 90_000, // free a lobby seat after a disconnect
};

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
    this.rabbit = null;
    this.pendingReveal = null;
  }

  // ---------- Connections ----------

  connect(socket) {
    let token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length < 10 || token.length > 64) token = randomUUID();
    this.clients.set(socket.id, { socket, token, voice: { joined: false, muted: false, video: false } });
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
          if (!(err instanceof UserError)) console.error(err);
          const code = err instanceof UserError ? err.code : 'generic';
          socket.emit('toast', { kind: 'error', key: `err.${code}`, p: err.params || {} });
        }
      });

    on('sit', (d) => this.sit(token, d?.seat, d?.name, d?.gadget));
    on('gadget', (id) => this.setGadget(token, id));
    on('gadget-play', () => this.playGadget(socket, token));
    on('stand', () => this.stand(token));
    on('config', (d) => this.setConfig(token, d));
    on('seats', (n) => this.setSeats(n));
    on('table', (d) => this.setTable(d));
    on('start', () => this.start(token));
    on('action', (d) => this.action(token, d?.type, d?.amount));
    on('back', () => this.setAway(token, false));
    on('pause', () => this.togglePause(token));
    on('abort', () => this.abort(token));
    on('newTournament', () => this.newTournament(token));
    on('chat', (text) => this.chat(token, text));
    on('rabbit', () => this.rabbitCam(token));
    on('reveal', () => this.revealBoard(token));
    on('fidget', (d) => this.fidget(socket, token, d));
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
    if (seat == null) throw new UserError('seatedOnly');
    return seat;
  }

  // ---------- Lobby ----------

  // Late registration: while nobody has busted yet, spectators may take a free seat in a
  // running tournament. They start with the regular stack and are dealt in from the next hand.
  lateRegOpen() {
    return this.phase === 'running' && !this.seats.some((s) => s?.eliminated) && this.#freeSeats() > 0;
  }

  #freeSeats() {
    return this.seats.slice(0, this.config.seats).filter((s) => !s).length;
  }

  sit(token, seat, name, gadget) {
    const late = this.phase === 'running';
    if (late && this.seatOfToken(token) != null) throw new UserError('tournamentRunning');
    if (late && !this.lateRegOpen()) throw new UserError('lateRegClosed');
    if (!late && this.phase !== 'lobby') throw new UserError('tournamentRunning');
    seat = Number(seat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.config.seats) throw new UserError('invalidSeat');
    name = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) throw new UserError('nameRequired');
    const current = this.seats[seat];
    if (current && current.token !== token) throw new UserError('seatTaken');
    if (this.seats.some((s, i) => s && i !== seat && s.token !== token && s.name.toLowerCase() === name.toLowerCase()))
      throw new UserError('nameTaken');
    const old = this.seatOfToken(token);
    const prevGadget = old != null ? this.seats[old].gadget : null;
    if (old != null) this.seats[old] = null;
    this.seats[seat] = {
      token,
      name,
      gadget: isGadget(gadget) ? gadget : prevGadget,
      stack: late ? this.config.startingStack : 0,
      connected: true,
      away: false,
      eliminated: false,
      place: null,
    };
    this.#addLog(late ? 'lateJoin' : 'sit', { name, seat, stack: this.config.startingStack }, late ? 'system' : 'info');
    this.broadcast();
  }

  stand(token) {
    if (this.phase !== 'lobby') throw new UserError('cannotStand');
    const seat = this.seatOfToken(token);
    if (seat == null) return;
    this.#addLog('stand', { name: this.seats[seat].name });
    this.seats[seat] = null;
    this.broadcast();
  }

  // The gadget can only be chosen in the lobby – it stays fixed during the tournament
  setGadget(token, id) {
    if (this.phase !== 'lobby') throw new UserError('gadgetLocked');
    const seat = this.#requireSeat(token);
    if (!isGadget(id)) throw new UserError('unknownGadget');
    this.seats[seat].gadget = id;
    this.broadcast();
  }

  setConfig(token, data) {
    if (this.phase !== 'lobby') throw new UserError('configLocked');
    this.#requireSeat(token);
    const next = sanitizeConfig(data, this.config);
    this.#fitSeats(next);
    this.config = next;
    this.broadcast();
  }

  // The seat count may be changed by anyone in the lobby, also before taking a seat
  setSeats(n) {
    if (this.phase !== 'lobby') throw new UserError('configLocked');
    const next = sanitizeConfig({ seats: n }, this.config);
    this.#fitSeats(next);
    this.config = next;
    this.broadcast();
  }

  // The table itself (tournament name printed on the felt, felt colour, rim material) is
  // open to everyone in the lobby as well
  setTable(d) {
    if (this.phase !== 'lobby') throw new UserError('configLocked');
    if (!d || typeof d !== 'object') return;
    const pick = {};
    for (const k of ['title', 'felt', 'rim']) if (k in d) pick[k] = d[k];
    const next = sanitizeConfig(pick, this.config);
    if (next.title === this.config.title && next.felt === this.config.felt && next.rim === this.config.rim) return;
    this.config = next;
    this.broadcast();
  }

  // Never fewer seats than players already sitting; players on removed seats move to free ones
  #fitSeats(next) {
    next.seats = Math.max(next.seats, this.seats.filter(Boolean).length);
    for (let i = next.seats; i < MAX_SEATS; i++) {
      if (!this.seats[i]) continue;
      const free = this.seats.findIndex((s, j) => !s && j < next.seats);
      this.seats[free] = this.seats[i];
      this.seats[i] = null;
    }
  }

  start(token) {
    if (this.phase !== 'lobby') return;
    this.#requireSeat(token);
    const seated = this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (seated.length < 2) throw new UserError('needTwo');
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
    this.#addLog('started', { n: seated.length, stack: this.config.startingStack, sb: l.sb, bb: l.bb }, 'system');
    this.#startHand(true);
  }

  // ---------- Tournament ----------

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
      this.#addLog('level', { level: idx + 1, sb: l.sb, bb: l.bb, ante: l.ante }, 'level');
      this.io.emit('levelUp', { level: idx + 1, ...l });
      this.broadcast();
    }
  }

  #alive() {
    return this.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i >= 0);
  }

  #startHand(first = false) {
    this.stepDeadline = 0;
    this.rabbit = null;
    this.pendingReveal = null;
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
    if (!this.hand || this.hand.phase !== 'betting') throw new UserError('noAction');
    if (this.hand.toAct !== seat) throw new UserError('notYourTurn');
    this.seats[seat].away = false;
    this.#doAction(seat, type, amount);
  }

  #doAction(seat, type, amount) {
    const ev = this.hand.act(seat, type, amount);
    this.#logAction(seat, ev);
    this.#afterChange();
  }

  #logAction(seat, ev) {
    if (!['fold', 'check', 'call', 'bet', 'raise'].includes(ev.type)) return;
    this.#addLog(ev.type, { name: this.seats[seat].name, amount: ev.amount, allIn: !!ev.allIn }, 'action');
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
      if (h.runout && h.board.length < 5) {
        // All-in runout with cards face up: next street only on click (or after a timeout)
        const next = h.board.length === 0 ? 'flop' : h.board.length === 3 ? 'turn' : 'river';
        this.pendingReveal = { handId: h.handId, next, until: Date.now() + this.delay.revealTimeout };
        this.#step(this.delay.revealTimeout, () => this.#revealNext(null));
      } else {
        const d = h.runout ? (h.dramaticRiver ? this.delay.dramatic : this.delay.runout) : this.delay.street;
        this.#step(d, () => this.#advanceHand());
      }
    } else if (h.phase === 'complete') {
      this.#handComplete();
      return;
    }
    this.broadcast();
  }

  #advanceHand() {
    const h = this.hand;
    h.advance();
    if (h.phase === 'complete') this.#handComplete();
    else this.#afterChange();
  }

  revealBoard(token) {
    const seat = this.#requireSeat(token);
    this.#revealNext(seat);
  }

  #revealNext(seat) {
    const pr = this.pendingReveal;
    const h = this.hand;
    if (!pr || !h || h.handId !== pr.handId || h.phase !== 'roundComplete') return;
    this.pendingReveal = null;
    if (seat != null) this.#addLog('reveal', { name: this.seats[seat].name, street: pr.next }, 'system');
    // Does only the river decide the winner? -> reveal it dramatically
    if (pr.next === 'river') h.dramaticRiver = h.riverDecides();
    this.#advanceHand();
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
      console.error('Error in game flow:', err);
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
        this.#addLog('away', { name: s.name }, 'system');
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
      const names = pot.winners.map((s) => this.seats[s].name);
      const which = r.pots.length > 1 ? (pot === r.pots[0] ? 'main' : 'side') : 'only';
      this.#addLog('win', { names, pot: which, amount: pot.amount, hand: pot.hand }, 'win');
    }
    // Rabbit Cam: if the hand ends before the river, players may briefly request the remaining cards
    if (r.uncontested && h.board.length < 5) {
      this.rabbit = { handId: h.handId, until: Date.now() + this.delay.rabbitWindow, cards: null, by: null };
      this.#step(this.delay.rabbitWindow, () => this.#afterHand());
    } else {
      this.rabbit = null;
      this.#step(r.uncontested ? this.delay.uncontested : this.delay.showdown, () => this.#afterHand());
    }
    this.broadcast();
  }

  rabbitCam(token) {
    const seat = this.#requireSeat(token);
    const rb = this.rabbit;
    if (!rb || rb.cards || !this.hand || this.hand.handId !== rb.handId || Date.now() > rb.until) return;
    rb.cards = this.hand.rabbitCards();
    rb.by = this.seats[seat].name;
    this.#addLog('rabbit', { name: rb.by, cards: rb.cards }, 'system');
    this.#step(this.delay.rabbitShow, () => this.#afterHand());
    this.broadcast();
  }

  #afterHand() {
    const h = this.hand;
    const alive = this.#alive();
    const busted = alive.filter((i) => this.seats[i].stack <= 0);
    if (busted.length) {
      // Whoever started the hand with fewer chips finishes in the lower place
      busted.sort((a, b) => h.player(a).startStack - h.player(b).startStack);
      let place = alive.length;
      for (const i of busted) {
        const s = this.seats[i];
        s.eliminated = true;
        s.place = place--;
        this.results.push({ seat: i, name: s.name, place: s.place });
        this.#addLog('bust', { name: s.name, place: s.place }, 'bust');
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
      this.#addLog('champion', { name: w.name }, 'win');
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
      this.#addLog('pause', { name, afterHand: !!this.hand && this.hand.phase !== 'complete' }, 'system');
    } else {
      this.paused = false;
      this.pausedTotal += Date.now() - this.pausedAt;
      this.#addLog('resume', { name }, 'system');
      if (!this.hand) this.#startHand();
    }
    this.broadcast();
  }

  abort(token) {
    const seat = this.#requireSeat(token);
    if (this.phase === 'lobby') return;
    const name = this.seats[seat].name;
    this.#resetTournament();
    this.#addLog('aborted', { name }, 'system');
    this.broadcast();
  }

  newTournament(token) {
    if (this.phase !== 'finished') return;
    this.#resetTournament();
    this.#addLog('newTournament', {}, 'system');
    this.broadcast();
  }

  chat(token, text) {
    text = String(text ?? '').trim().slice(0, 200);
    if (!text) return;
    const seat = this.seatOfToken(token);
    this.#addLog('chat', { name: seat != null ? this.seats[seat].name : null, text }, 'chat');
    this.broadcast();
  }

  // Log entries are keys + parameters; each client renders them in its own language
  #addLog(key, p = {}, kind = 'info') {
    this.log.push({ t: Date.now(), key, p, kind, id: (this.logId = (this.logId || 0) + 1) });
    if (this.log.length > 80) this.log.shift();
  }

  // ---------- Chip riffle (purely cosmetic, just relayed) ----------

  fidget(socket, token, d) {
    const seat = this.seatOfToken(token);
    if (seat == null || !d || !['start', 'progress', 'auto', 'sort'].includes(d.type)) return;
    // simple rate limit against flooding
    const c = this.clients.get(socket.id);
    const now = Date.now();
    if (!c.fidget || now - c.fidget.t > 1000) c.fidget = { t: now, n: 0 };
    if (++c.fidget.n > 40) return;
    const num = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
    socket.broadcast.emit('fidget', {
      seat,
      type: d.type,
      pile: Math.round(num(d.pile, 0, 100)),
      seed: Math.round(num(d.seed, 0, 2 ** 31)),
      p: num(d.p, 0, 1),
      dur: num(d.dur, 0.1, 3),
    });
  }

  // Click on your own gadget: play the animation for everyone else
  playGadget(socket, token) {
    const seat = this.seatOfToken(token);
    if (seat == null || !this.seats[seat].gadget) return;
    const c = this.clients.get(socket.id);
    const now = Date.now();
    if (c.gadgetAt && now - c.gadgetAt < 400) return;
    c.gadgetAt = now;
    socket.broadcast.emit('gadget', { seat, seed: randomInt(2 ** 31) });
  }

  // ---------- Voice signaling (WebRTC mesh) ----------

  voiceJoin(socket, d) {
    const c = this.clients.get(socket.id);
    if (!c) return;
    c.voice = { joined: true, muted: !!d?.muted, video: !!d?.video };
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
    if (d && 'video' in d) c.voice.video = !!d.video;
    this.broadcast();
  }

  // ---------- State for clients ----------

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
      lateReg: this.lateRegOpen(),
      seats: this.seats.slice(0, this.config.seats).map((s, i) =>
        s
          ? {
              seat: i,
              name: s.name,
              gadget: s.gadget || null,
              stack: hv?.players[i] ? hv.players[i].stack : s.stack,
              connected: s.connected,
              away: s.away,
              eliminated: s.eliminated,
              place: s.place,
            }
          : null,
      ),
      hand: hv,
      reveal:
        this.pendingReveal && this.hand?.handId === this.pendingReveal.handId
          ? { next: this.pendingReveal.next, remaining: Math.max(0, this.pendingReveal.until - now) }
          : null,
      drama: !!this.hand?.dramaticRiver,
      rabbit:
        this.rabbit && this.hand && this.rabbit.handId === this.hand.handId
          ? { open: !this.rabbit.cards && now < this.rabbit.until, remaining: Math.max(0, this.rabbit.until - now), cards: this.rabbit.cards, by: this.rabbit.by }
          : null,
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
        .map(([id, c]) => ({ id, name: nameOf(c.token), seat: this.seatOfToken(c.token), muted: c.voice.muted, video: c.voice.video, self: id === socketId })),
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
