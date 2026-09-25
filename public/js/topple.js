// Knocked-over chip stacks: a joke between friends. Clicking another player's stack makes its
// columns tip over and the chips slide out like dominoes; the owner can tidy them up again.
// The mess is derived from a seed, so every client shows exactly the same pile.
import * as THREE from 'three';
import { CHIP_R, CHIP_H } from './chips.js';
import { rng } from './textures.js';
import { ease } from './tween.js';
import { sfx } from './sound.js';

const UP = new THREE.Vector3(0, 1, 0);
const TIP_ANGLE = 1.35; // how far a column rotates as one piece before the chips separate
const TIP_TIME = 0.32;
const SLIDE_TIME = 0.5;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function remember(chip) {
  chip.userData.home ??= { p: chip.position.clone(), q: chip.quaternion.clone() };
  return chip.userData.home;
}

// Final resting pose of every chip (group-local). The stack group's -z points to the table centre,
// so the columns fall roughly inwards, each with its own spread.
function messPlan(group, seed) {
  const r = rng(seed);
  const piles = group.userData.piles || [];
  const base = (r() - 0.5) * 0.8;
  return piles.map((pile, pi) => {
    const a = base + (r() - 0.5) * 1.4;
    const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const n = pile.chips.length;
    const step = Math.min(0.2, 2.4 / Math.max(1, n)) * (0.9 + r() * 0.3);
    const origin = new THREE.Vector3(pile.x, 0, pile.z);
    const chips = pile.chips.map((chip, j) => {
      // fanned out like a spread deck; the further out, the more it scatters sideways
      let along = CHIP_R * 0.5 + j * step + r() * 0.06;
      let side = (r() - 0.5) * (0.1 + along * 0.35);
      let tilt = 0.05 + r() * 0.45;
      // the top chips roll away and end up lying flat
      if (j >= n - 3 && r() < 0.8) {
        along += 0.3 + r() * 0.7;
        side += (r() - 0.5) * 0.8;
        tilt = r() * 0.08;
      }
      const pos = origin.clone().addScaledVector(dir, along).addScaledVector(perp, side);
      pos.y = CHIP_H / 2 + Math.sin(tilt) * CHIP_R * 0.9 + j * 0.002;
      const lean = new THREE.Vector3().copy(perp).applyAxisAngle(UP, (r() - 0.5) * 1.2);
      const q = new THREE.Quaternion()
        .setFromAxisAngle(lean, tilt)
        .multiply(new THREE.Quaternion().setFromAxisAngle(UP, r() * Math.PI * 2));
      return { chip, pos, q };
    });
    return { dir, perp, origin, delay: pi * 0.05 + r() * 0.06, chips };
  });
}

// Pose of a chip while its whole column tips over as one piece around the column's front edge
function tipped(home, plan, angle) {
  const pivot = plan.origin.clone().addScaledVector(plan.dir, CHIP_R);
  const axis = _v.crossVectors(UP, plan.dir).normalize();
  _q.setFromAxisAngle(axis, angle);
  const p = home.p.clone().sub(pivot).applyQuaternion(_q).add(pivot);
  return { p, q: _q.clone().multiply(home.q) };
}

export class Fall {
  constructor(group, seed, { instant = false, volume = 1 } = {}) {
    this.plan = messPlan(group, seed);
    this.t = 0;
    this.volume = volume;
    this.sounded = 0;
    for (const pile of this.plan) {
      for (const c of pile.chips) {
        c.home = remember(c.chip);
        c.from = tipped(c.home, pile, TIP_ANGLE);
      }
    }
    this.end = Math.max(0, ...this.plan.map((p) => p.delay + TIP_TIME + SLIDE_TIME + p.chips.length * 0.012));
    if (instant) this.finish();
  }

  finish() {
    for (const pile of this.plan) {
      for (const c of pile.chips) {
        c.chip.position.copy(c.pos);
        c.chip.quaternion.copy(c.q);
      }
    }
    this.done = true;
  }

  update(dt) {
    this.t += dt;
    let landing = 0;
    for (const pile of this.plan) {
      const t = this.t - pile.delay;
      if (t <= 0) continue;
      pile.chips.forEach((c, j) => {
        if (t < TIP_TIME) {
          // the column tips as one piece, accelerating like a falling body
          const k = (t / TIP_TIME) ** 2;
          const pose = tipped(c.home, pile, TIP_ANGLE * k);
          c.chip.position.copy(pose.p);
          c.chip.quaternion.copy(pose.q);
          return;
        }
        const u = Math.min(1, (t - TIP_TIME - j * 0.012) / SLIDE_TIME);
        if (u <= 0) return;
        if (!c.landed && u >= 1) {
          c.landed = true;
          landing++;
        }
        const k = ease.outCubic(u);
        c.chip.position.lerpVectors(c.from.p, c.pos, k);
        c.chip.position.y += Math.sin(Math.PI * u) * 0.05;
        c.chip.quaternion.slerpQuaternions(c.from.q, c.q, k);
      });
    }
    // clatter: a few clicks per frame at most, plus one burst when the first columns hit the felt
    if (landing) for (let i = 0; i < Math.min(3, landing); i++) sfx.tick(this.volume * 0.8);
    if (!this.sounded && this.t > TIP_TIME) {
      this.sounded = 1;
      sfx.chips(8 * this.volume);
    }
    if (this.t >= this.end) this.finish();
    return this.done;
  }
}

// The owner stacks everything back: every chip hops to where it came from
export class Tidy {
  constructor(group, { instant = false, volume = 1 } = {}) {
    this.t = 0;
    this.volume = volume;
    const piles = group.userData.piles || [];
    this.chips = [];
    piles.forEach((pile, pi) =>
      pile.chips.forEach((chip, j) => {
        const home = chip.userData.home;
        if (!home) return;
        this.chips.push({ chip, home, fromP: chip.position.clone(), fromQ: chip.quaternion.clone(), delay: pi * 0.06 + j * 0.02 });
      }),
    );
    this.end = Math.max(0, ...this.chips.map((c) => c.delay + 0.45));
    if (instant) this.finish();
  }

  finish() {
    for (const c of this.chips) {
      c.chip.position.copy(c.home.p);
      c.chip.quaternion.copy(c.home.q);
      delete c.chip.userData.home; // riffling may move the chips again before the next topple
    }
    this.done = true;
  }

  update(dt) {
    this.t += dt;
    let placed = 0;
    for (const c of this.chips) {
      const u = Math.min(1, Math.max(0, (this.t - c.delay) / 0.45));
      if (u <= 0) continue;
      if (u >= 1 && !c.placed) {
        c.placed = true;
        placed++;
      }
      const k = ease.inOutCubic(u);
      c.chip.position.lerpVectors(c.fromP, c.home.p, k);
      c.chip.position.y += Math.sin(Math.PI * u) * 0.3;
      c.chip.quaternion.slerpQuaternions(c.fromQ, c.home.q, k);
    }
    if (placed) sfx.tick(this.volume * 0.7);
    if (this.t >= this.end) this.finish();
    return this.done;
  }
}
