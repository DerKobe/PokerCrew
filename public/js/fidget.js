// Chip-Riffle: mit dem eigenen Stack spielen wie am echten Tisch (rein kosmetisch).
// Zwei Säulen werden zu einer gestreiften Säule ineinandergeriffelt; eine schon gemischte
// Säule wird geteilt und wieder zusammengeriffelt. Andere Spieler sehen und hören es (leiser).
import * as THREE from 'three';
import { CHIP_H, buildStack } from './chips.js';
import { rng } from './textures.js';
import { ease } from './tween.js';
import { sfx } from './sound.js';

const D = 0.53; // Säulenabstand ≈ Chip-Durchmesser + Luft
const MAX_MERGE = 24; // größere Säulen werden geteilt statt mit der Nachbarsäule gemischt
const GATHER = 0.2; // Anteil: Hälften nebeneinander legen
const MAX_TILT = 0.32;
const DRAG_PX = 130; // Mausweg (px) für einen kompletten Riffle
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Der Riffle passiert direkt an der Endposition der Säule. Die beiden Hälften liegen links und
// rechts davon – in der Richtung, in der am meisten Platz zu den anderen Säulen ist.
function riffleAxis(piles, home, exclude) {
  const others = piles.filter((p) => !exclude.includes(p));
  let best = null;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    const perp = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const slots = [home.clone().addScaledVector(perp, -D / 2), home.clone().addScaledVector(perp, D / 2)];
    const score = Math.min(9, ...others.flatMap((o) => slots.map((s) => dist2d(s, o))));
    if (!best || score > best.score + 1e-6) best = { perp, score };
  }
  return best.perp;
}

export class Riffle {
  constructor(group, pileIndex, seed, volume = 1) {
    this.group = group;
    this.volume = volume;
    this.p = 0;
    this.done = false;
    this.landedCount = 0;
    const piles = group.userData.piles || [];
    const P = piles[pileIndex];
    if (!P || P.chips.length === 0) {
      this.invalid = true;
      return;
    }
    const r = rng(seed);
    // Partner: Nachbarsäule mit der ähnlichsten Höhe (deterministisch, bei allen Clients gleich)
    const cands = [pileIndex + 1, pileIndex - 1].filter((i) => piles[i]?.chips.length);
    cands.sort((x, y) => Math.abs(piles[x].chips.length - P.chips.length) - Math.abs(piles[y].chips.length - P.chips.length));
    const N = piles[cands[0]];
    this.split = P.mixed || !N || !N.chips.length || P.chips.length + N.chips.length > MAX_MERGE;
    if (this.split && P.chips.length < 2) {
      this.invalid = true;
      return;
    }
    this.piles = piles;
    this.P = P;
    this.N = this.split ? null : N;
    const home = new THREE.Vector3(P.x, 0, P.z);
    this.home = home;
    if (this.split) {
      const k = Math.ceil(P.chips.length / 2);
      this.a = P.chips.slice(0, k);
      this.b = P.chips.slice(k);
    } else {
      this.a = P.chips.slice();
      this.b = N.chips.slice();
    }
    this.c = home;
    this.perp = riffleAxis(piles, home, this.N ? [P, this.N] : [P]);

    // Startlage jedes Chips merken
    for (const chip of [...this.a, ...this.b]) {
      chip.userData.start = chip.position.clone();
      if (chip.userData.spin == null) chip.userData.spin = chip.rotation.y;
    }

    // Mischreihenfolge von unten nach oben: abwechselnd, gelegentlich zwei aus derselben Hälfte
    const order = [];
    let ia = 0;
    let ib = 0;
    // Die Hälften werden anteilig verteilt, damit auch ungleiche Hälften schön gestreift werden;
    // ein wenig Zufall sorgt für gelegentliche Doppel wie beim echten Riffle.
    const na = this.a.length;
    const nb = this.b.length;
    const bias = (r() - 0.5) * 0.5;
    while (ia < na || ib < nb) {
      const fa = (ia + 0.5 + bias + (r() - 0.5) * 0.6) / na;
      const fb = (ib + 0.5 + (r() - 0.5) * 0.6) / nb;
      const fromA = ib >= nb || (ia < na && fa <= fb);
      if (fromA) order.push({ chip: this.a[ia], half: 'a', idx: ia++ });
      else order.push({ chip: this.b[ib], half: 'b', idx: ib++ });
    }
    const n = order.length;
    this.order = order.map((o, j) => ({
      ...o,
      j,
      t: 0.05 + 0.85 * (n > 1 ? j / (n - 1) : 0),
      landed: false,
      jx: (r() - 0.5) * 0.025,
      jz: (r() - 0.5) * 0.025,
    }));
  }

  // Fortschritt 0..1 setzen (nur vorwärts) und alle Chips positionieren
  setProgress(p) {
    if (this.invalid || this.done) return;
    p = Math.max(this.p, Math.min(1, p));
    this.p = p;
    const g = ease.inOutCubic(Math.min(1, p / GATHER));
    const m = p <= GATHER ? 0 : Math.min(1, (p - GATHER) / (1 - GATHER));

    // Wo stehen die beiden Hälften gerade? Beim Riffeln rücken sie zusammen.
    const approach = (D / 2 - 0.2) * ease.outCubic(Math.min(1, m * 1.5));
    const aSlot = this.c.clone().addScaledVector(this.perp, -(D / 2 - approach));
    const bSlot = this.c.clone().addScaledVector(this.perp, D / 2 - approach);
    const tilt = Math.sin(m * Math.PI) * MAX_TILT;
    const target = this.c;

    // Wie viele Chips jeder Hälfte sind schon gefallen?
    const dropped = { a: 0, b: 0 };
    for (const o of this.order) if (m >= o.t + 0.05) dropped[o.half]++;

    for (const o of this.order) {
      const chip = o.chip;
      const slot = o.half === 'a' ? aSlot : bSlot;
      // Lage in der eigenen Hälfte (rutscht nach, wenn untere Chips wegfallen)
      const inHalfY = CHIP_H / 2 + (o.idx - (m > 0 ? dropped[o.half] : 0)) * CHIP_H;
      const halfPos = new THREE.Vector3(slot.x, Math.max(CHIP_H / 2, inHalfY), slot.z);
      if (m === 0) {
        // Phase 1: nebeneinanderlegen (abgehobene Hälfte im Bogen)
        const start = chip.userData.start;
        chip.position.lerpVectors(start, halfPos, g);
        if (this.split && o.half === 'b') chip.position.y += Math.sin(g * Math.PI) * 0.35;
      } else {
        const u = Math.max(0, Math.min(1, (m - o.t) / 0.05));
        const finalPos = new THREE.Vector3(target.x + o.jx, CHIP_H / 2 + o.j * CHIP_H, target.z + o.jz);
        chip.position.lerpVectors(halfPos, finalPos, ease.outCubic(u));
        if (u >= 1 && !o.landed) {
          o.landed = true;
          sfx.tick(this.volume * (0.7 + Math.random() * 0.3));
        }
        if (o.landed) chip.position.set(target.x + o.jx, CHIP_H / 2 + o.j * CHIP_H, target.z + o.jz);
      }
      // Innenkanten der Hälften anheben; gefallene Chips liegen flach
      const inHalf = !o.landed;
      const toCenter = o.half === 'a' ? this.perp : this.perp.clone().negate();
      const axis = new THREE.Vector3().crossVectors(toCenter, UP).normalize();
      _qs.setFromAxisAngle(UP, chip.userData.spin);
      _q.setFromAxisAngle(axis, inHalf ? tilt : 0);
      chip.quaternion.copy(_q).multiply(_qs);
    }

    if (p >= 1) this.#commit();
  }

  // Säulen-Buchhaltung aktualisieren: eine gemischte Säule an der alten Stelle
  #commit() {
    this.done = true;
    this.P.chips = this.order.map((o) => o.chip);
    this.P.mixed = true;
    if (this.N) this.piles.splice(this.piles.indexOf(this.N), 1);
    this.piles.forEach((pile, i) => pile.chips.forEach((c) => (c.userData.pile = i)));
    for (const o of this.order) {
      _qs.setFromAxisAngle(UP, o.chip.userData.spin);
      o.chip.quaternion.copy(_qs);
    }
  }
}

// Alle Chips eines Stacks zurück in ihre ursprünglichen Säulen (nach Wert) – animiert.
// Rückgabe: Promise-freie Animation über onFrame; liefert false, wenn nichts zu sortieren ist.
export class Sort {
  constructor(group, volume = 1) {
    this.done = false;
    const b = group.userData.build;
    if (!b || !(group.userData.piles || []).some((p) => p.mixed)) {
      this.invalid = true;
      return;
    }
    // Referenz-Layout exakt wie beim ursprünglichen Aufbau
    const ref = buildStack(b.amount, b.opts);
    const pool = new Map(); // Material (= Wert) -> vorhandene Chips, von unten nach oben
    for (const chip of group.children) {
      if (!pool.has(chip.material)) pool.set(chip.material, []);
      pool.get(chip.material).push(chip);
    }
    for (const list of pool.values()) list.sort((x, y) => x.position.y - y.position.y);
    this.moves = [];
    const piles = [];
    ref.userData.piles.forEach((rp, i) => {
      const pile = { x: rp.x, z: rp.z, chips: [], mixed: false };
      for (const target of rp.chips) {
        const chip = pool.get(target.material)?.shift();
        if (!chip) continue;
        chip.userData.pile = i;
        chip.userData.spin = target.rotation.y;
        pile.chips.push(chip);
        this.moves.push({ chip, from: chip.position.clone(), fromQ: chip.quaternion.clone(), to: target.position.clone(), toQ: target.quaternion.clone(), delay: Math.random() * 0.25 });
      }
      piles.push(pile);
    });
    group.userData.piles = piles;
    this.t = 0;
    this.volume = volume;
    for (let i = 0; i < 5; i++) setTimeout(() => sfx.tick(volume * 0.8), 80 + i * 70 + Math.random() * 40);
  }

  update(dt) {
    if (this.invalid || this.done) return;
    this.t += dt;
    let finished = true;
    for (const m of this.moves) {
      const u = Math.max(0, Math.min(1, (this.t - m.delay) / 0.45));
      if (u < 1) finished = false;
      const k = ease.inOutCubic(u);
      m.chip.position.lerpVectors(m.from, m.to, k);
      m.chip.position.y += Math.sin(u * Math.PI) * 0.25;
      m.chip.quaternion.slerpQuaternions(m.fromQ, m.toQ, k);
    }
    if (finished) this.done = true;
  }

  finish() {
    this.t = 99;
    this.update(0);
  }
}

// Eingabe (eigener Stack) + Wiedergabe (Stacks der anderen)
export class ChipFidget {
  constructor({ stage, view, send, socket }) {
    this.stage = stage;
    this.view = view;
    this.send = send;
    this.active = new Map(); // seat -> { riffle, group, auto, targetP }
    this.drag = null;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.lastSent = 0;
    this.lastHover = 0;
    const el = stage.renderer.domElement;
    this.el = el;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.#down(e));
    el.addEventListener('contextmenu', (e) => {
      if (this.#pick(e)) e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => this.#move(e));
    el.addEventListener('pointerup', (e) => this.#up(e));
    el.addEventListener('pointercancel', (e) => this.#up(e));
    socket.on('fidget', (d) => this.#remote(d));
    this.lastT = performance.now();
    stage.onFrame.push(() => this.#frame());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) for (const seat of [...this.active.keys()]) this.#finish(seat);
    });
  }

  #myStack() {
    const seat = this.view.mySeat;
    if (seat == null) return null;
    return this.view.seats[seat]?.stack || null;
  }

  #pick(e) {
    const group = this.#myStack();
    if (!group) return null;
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const hit = this.raycaster.intersectObjects(group.children, false)[0];
    return hit ? { group, pile: hit.object.userData.pile } : null;
  }

  #start(seat, group, pile, seed, volume) {
    this.#finish(seat);
    const riffle = new Riffle(group, pile, seed, volume);
    if (riffle.invalid) return null;
    const entry = { riffle, group, auto: null, targetP: null };
    this.active.set(seat, entry);
    return entry;
  }

  #finish(seat) {
    const e = this.active.get(seat);
    if (!e) return;
    if (e.sort) e.sort.finish();
    else e.riffle.setProgress(1);
    this.active.delete(seat);
  }

  #sort(seat, group, volume) {
    this.#finish(seat);
    const sort = new Sort(group, volume);
    if (sort.invalid) return false;
    this.active.set(seat, { sort, group });
    return true;
  }

  #down(e) {
    if (e.button === 2) {
      // Rechtsklick auf den eigenen Stack: gemischte Säulen wieder nach Wert sortieren
      const hit = this.#pick(e);
      if (hit && this.#sort(this.view.mySeat, hit.group, 1)) this.send('fidget', { type: 'sort' });
      return;
    }
    if (e.button !== 0) return;
    const hit = this.#pick(e);
    if (!hit) return;
    const seed = Math.floor(Math.random() * 1e9);
    const entry = this.#start(this.view.mySeat, hit.group, hit.pile, seed, 1);
    if (!entry) return;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {}
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, entry };
    this.stage.freezeParallax = true;
    this.el.style.cursor = 'grabbing';
    this.send('fidget', { type: 'start', pile: hit.pile, seed });
  }

  #move(e) {
    if (this.drag) {
      const d = Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.moved += d;
      const r = this.drag.entry.riffle;
      r.setProgress(r.p + d / DRAG_PX);
      const now = performance.now();
      if (now - this.lastSent > 60) {
        this.lastSent = now;
        this.send('fidget', { type: 'progress', p: r.p });
      }
      return;
    }
    // Hover: Hand-Cursor über dem eigenen Stack
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    this.el.style.cursor = this.#pick(e) ? 'grab' : '';
  }

  #up() {
    if (!this.drag) return;
    const { entry, moved, t } = this.drag;
    this.drag = null;
    this.stage.freezeParallax = false;
    this.el.style.cursor = 'grab';
    const r = entry.riffle;
    if (r.done) return;
    // Kurzer Klick: schneller automatischer Riffle; sonst Rest zügig abschließen
    const dur = moved < 8 && performance.now() - t < 400 ? 0.8 : 0.35;
    entry.auto = (1 - r.p) / dur;
    this.send('fidget', { type: 'auto', p: r.p, dur });
  }

  #remote(d) {
    const seat = d?.seat;
    if (seat == null || seat === this.view.mySeat || document.hidden) return;
    const group = this.view.seats[seat]?.stack;
    if (!group) return;
    if (d.type === 'start') {
      this.#start(seat, group, d.pile, d.seed, 0.35);
      return;
    }
    if (d.type === 'sort') {
      this.#sort(seat, group, 0.35);
      return;
    }
    const e = this.active.get(seat);
    if (!e || !e.riffle || e.group !== group) return;
    if (d.type === 'progress') e.targetP = d.p;
    else if (d.type === 'auto') {
      e.targetP = null;
      e.riffle.setProgress(d.p);
      e.auto = (1 - e.riffle.p) / Math.max(0.1, d.dur);
    }
  }

  #frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    for (const [seat, e] of this.active) {
      // Stack wurde inzwischen neu aufgebaut (Betrag geändert) -> verwerfen
      if (this.view.seats[seat]?.stack !== e.group) {
        this.active.delete(seat);
        continue;
      }
      if (e.sort) {
        e.sort.update(dt);
        if (e.sort.done) this.active.delete(seat);
        continue;
      }
      const r = e.riffle;
      if (e.auto) r.setProgress(r.p + e.auto * dt);
      else if (e.targetP != null) r.setProgress(r.p + (e.targetP - r.p) * Math.min(1, dt * 12));
      if (r.done) this.active.delete(seat);
    }
  }
}
