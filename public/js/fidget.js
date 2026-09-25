// Chip riffle: play with your own stack like at a real table (purely cosmetic).
// Two columns are riffled into one striped column; an already mixed column is split and
// riffled back together. Other players see and hear it (quieter).
import * as THREE from 'three';
import { CHIP_H, buildStack } from './chips.js';
import { rng } from './textures.js';
import { ease } from './tween.js';
import { sfx } from './sound.js';
import { Fall, Tidy } from './topple.js';

const D = 0.53; // column spacing ≈ chip diameter + gap
const MAX_MERGE = 24; // larger columns are split instead of mixed with the neighbour
const GATHER = 0.2; // share of the progress: placing the halves side by side
const MAX_TILT = 0.32;
const DRAG_PX = 130; // mouse distance (px) for a full riffle
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The riffle happens right at the column's final position. The two halves lie left and right
// of it – in the direction with the most room to the other columns.
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
    // Partner: neighbouring column with the most similar height (deterministic, same on all clients)
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

    // Remember each chip's starting position
    for (const chip of [...this.a, ...this.b]) {
      chip.userData.start = chip.position.clone();
      if (chip.userData.spin == null) chip.userData.spin = chip.rotation.y;
    }

    // Mixing order from bottom to top: alternating, occasionally two from the same half
    const order = [];
    let ia = 0;
    let ib = 0;
    // The halves are interleaved proportionally so uneven halves still end up nicely striped;
    // a little randomness adds the occasional double like in a real riffle.
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

  // Set progress 0..1 (forward only) and position all chips
  setProgress(p) {
    if (this.invalid || this.done) return;
    p = Math.max(this.p, Math.min(1, p));
    this.p = p;
    const g = ease.inOutCubic(Math.min(1, p / GATHER));
    const m = p <= GATHER ? 0 : Math.min(1, (p - GATHER) / (1 - GATHER));

    // Where are the two halves right now? They move together while riffling.
    const approach = (D / 2 - 0.2) * ease.outCubic(Math.min(1, m * 1.5));
    const aSlot = this.c.clone().addScaledVector(this.perp, -(D / 2 - approach));
    const bSlot = this.c.clone().addScaledVector(this.perp, D / 2 - approach);
    const tilt = Math.sin(m * Math.PI) * MAX_TILT;
    const target = this.c;

    // How many chips of each half have dropped already?
    const dropped = { a: 0, b: 0 };
    for (const o of this.order) if (m >= o.t + 0.05) dropped[o.half]++;

    for (const o of this.order) {
      const chip = o.chip;
      const slot = o.half === 'a' ? aSlot : bSlot;
      // Position within its own half (slides down as lower chips drop away)
      const inHalfY = CHIP_H / 2 + (o.idx - (m > 0 ? dropped[o.half] : 0)) * CHIP_H;
      const halfPos = new THREE.Vector3(slot.x, Math.max(CHIP_H / 2, inHalfY), slot.z);
      if (m === 0) {
        // Phase 1: place side by side (the lifted half moves in an arc)
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
      // Lift the inner edges of the halves; dropped chips lie flat
      const inHalf = !o.landed;
      const toCenter = o.half === 'a' ? this.perp : this.perp.clone().negate();
      const axis = new THREE.Vector3().crossVectors(toCenter, UP).normalize();
      _qs.setFromAxisAngle(UP, chip.userData.spin);
      _q.setFromAxisAngle(axis, inHalf ? tilt : 0);
      chip.quaternion.copy(_q).multiply(_qs);
    }

    if (p >= 1) this.#commit();
  }

  // Update the column bookkeeping: one mixed column at the old spot
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

// Moves all chips of a stack back into their original columns (by value) – animated.
// Driven by update() from the frame loop; `invalid` is set when there is nothing to sort.
export class Sort {
  constructor(group, volume = 1) {
    this.done = false;
    const b = group.userData.build;
    if (!b || !(group.userData.piles || []).some((p) => p.mixed)) {
      this.invalid = true;
      return;
    }
    // Reference layout exactly like the original build
    const ref = buildStack(b.amount, b.opts);
    const pool = new Map(); // material (= value) -> existing chips, bottom to top
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

// Input (own stack) + playback (other players' stacks)
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
    this.toppled = {}; // seat -> { seed, by } from the server
    this.seenSeed = {}; // seat -> seed whose fall was already shown (a rebuilt stack then snaps)
    this.falls = new Map(); // stack group -> Fall | Tidy animation
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

  // Server state: which stacks are knocked over. On the first state, existing messes snap into place.
  update(state) {
    this.toppled = state.toppled || {};
    if (!this.synced) {
      this.synced = true;
      for (const [seat, t] of Object.entries(this.toppled)) this.seenSeed[seat] = t.seed;
    }
  }

  #isToppled(seat) {
    return seat != null && !!this.toppled[seat];
  }

  // Another player's stack under the mouse (for knocking it over)
  #pickOther(e) {
    const me = this.view.mySeat;
    const groups = this.view.seats.map((s, seat) => (seat !== me && s.stack ? s.stack : null)).filter(Boolean);
    if (!groups.length) return null;
    this.#ray(e);
    const hit = this.raycaster.intersectObjects(groups, true)[0];
    if (!hit) return null;
    const seat = this.view.seats.findIndex((s) => s.stack === hit.object.parent);
    return seat >= 0 ? seat : null;
  }

  #ray(e) {
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
  }

  #myStack() {
    const seat = this.view.mySeat;
    if (seat == null) return null;
    return this.view.seats[seat]?.stack || null;
  }

  #pick(e) {
    const group = this.#myStack();
    if (!group) return null;
    this.#ray(e);
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
    const mine = this.#isToppled(this.view.mySeat);
    if (e.button === 2) {
      // Right-click on your own stack: sort mixed columns back by value
      const hit = this.#pick(e);
      if (hit && !mine && this.#sort(this.view.mySeat, hit.group, 1)) this.send('fidget', { type: 'sort' });
      return;
    }
    if (e.button !== 0) return;
    const hit = this.#pick(e);
    if (!hit) {
      // Someone else's stack: knock it over (once; the owner has to tidy it up)
      const seat = this.#pickOther(e);
      if (seat != null && !this.#isToppled(seat)) {
        e.preventDefault();
        this.send('topple', { seat });
      }
      return;
    }
    if (mine) {
      // Your own messy pile: stack it up again
      e.preventDefault();
      this.send('tidy');
      return;
    }
    const seed = Math.floor(Math.random() * 1e9);
    const entry = this.#start(this.view.mySeat, hit.group, hit.pile, seed, 1);
    if (!entry) return;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {}
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, entry };
    this.stage.freezeParallax = true;
    this.stage.setCursor('chips', 'grabbing');
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
    // Hover: hand cursor over your own stack
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    let want = '';
    if (this.#pick(e)) want = this.#isToppled(this.view.mySeat) ? 'pointer' : 'grab';
    else {
      const seat = this.#pickOther(e);
      if (seat != null && !this.#isToppled(seat)) want = 'pointer';
    }
    this.stage.setCursor('chips', want);
  }

  #up() {
    if (!this.drag) return;
    const { entry, moved, t } = this.drag;
    this.drag = null;
    this.stage.freezeParallax = false;
    this.stage.setCursor('chips', 'grab');
    const r = entry.riffle;
    if (r.done) return;
    // Short click: quick automatic riffle; otherwise finish the rest briskly
    const dur = moved < 8 && performance.now() - t < 400 ? 0.8 : 0.35;
    entry.auto = (1 - r.p) / dur;
    this.send('fidget', { type: 'auto', p: r.p, dur });
  }

  #remote(d) {
    const seat = d?.seat;
    if (seat == null || seat === this.view.mySeat || document.hidden || this.#isToppled(seat)) return;
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

  // Bring every stack in line with the server: fall over, stay a mess (also after the stack was
  // rebuilt because its amount changed) or get tidied up
  #syncTopple(dt) {
    this.view.seats.forEach((s, seat) => {
      const g = s.stack;
      if (!g) return;
      const want = this.toppled[seat]?.seed ?? null;
      const has = g.userData.toppled ?? null;
      if (want === has) return;
      const volume = seat === this.view.mySeat ? 1 : 0.6;
      this.#finish(seat); // a running riffle ends first
      this.falls.get(g)?.finish();
      if (want != null) {
        const instant = document.hidden || this.seenSeed[seat] === want;
        this.falls.set(g, new Fall(g, want, { instant, volume }));
        this.seenSeed[seat] = want;
      } else {
        this.falls.set(g, new Tidy(g, { instant: document.hidden, volume }));
      }
      g.userData.toppled = want;
    });
    for (const [g, a] of this.falls) {
      if (!g.parent || a.done || a.update(dt)) this.falls.delete(g);
    }
  }

  #frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.#syncTopple(dt);
    for (const [seat, e] of this.active) {
      // The stack was rebuilt in the meantime (amount changed) -> discard
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
