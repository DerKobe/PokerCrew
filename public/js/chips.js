// Chip stacks built from real cylinders with edge inserts.
import * as THREE from 'three';
import { DENOMS, chipTopTexture, chipSideTexture, rng } from './textures.js';

export const CHIP_R = 0.25;
export const CHIP_H = 0.07;
const COL_MAX = 18;

let geo = null;
const mats = new Map();

function chipGeometry() {
  if (!geo) {
    geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 48, 1);
  }
  return geo;
}

function chipMaterials(d) {
  if (!mats.has(d.value)) {
    const top = new THREE.MeshPhysicalMaterial({
      map: chipTopTexture(d),
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
    });
    const side = new THREE.MeshPhysicalMaterial({
      map: chipSideTexture(d),
      roughness: 0.5,
      clearcoat: 0.2,
      clearcoatRoughness: 0.5,
    });
    mats.set(d.value, [side, top, top]);
  }
  return mats.get(d.value);
}

// Break an amount down into chips.
// pretty: like a real player stack – several colours instead of just a few big chips.
export function breakdown(amount, maxChips = 80, pretty = false) {
  const out = [];
  let rest = Math.max(0, Math.floor(amount));
  const minDenom = pretty ? (DENOMS.find((d) => d.value <= amount / 40) || DENOMS[DENOMS.length - 1]).value : 0;
  for (const d of DENOMS) {
    if (d.value > rest) continue;
    let n = Math.floor(rest / d.value);
    if (pretty && d.value > minDenom && n >= 2) n = Math.max(1, Math.floor(n * 0.6));
    if (n > 0) {
      out.push({ d, n });
      rest -= n * d.value;
    }
  }
  let total = out.reduce((s, x) => s + x.n, 0);
  // Limit: drop surplus small chips (visual only)
  while (total > maxChips && out.length) {
    const last = out[out.length - 1];
    last.n -= 1;
    if (last.n <= 0) out.pop();
    total--;
  }
  return out;
}

/**
 * Builds a group of chip columns.
 * @param {number} amount
 * @param {{seed?:number, layout?:'row'|'cluster', maxChips?:number}} opts
 */
export function buildStack(amount, { seed = 1, layout = 'row', perRow = 5, maxChips = 80, pretty = false } = {}) {
  const group = new THREE.Group();
  group.userData.amount = amount;
  if (amount <= 0) return group;
  const parts = breakdown(amount, maxChips, pretty);
  const columns = [];
  for (const { d, n } of parts) {
    let left = n;
    while (left > 0) {
      const h = Math.min(COL_MAX, left);
      columns.push({ d, h });
      left -= h;
    }
  }
  const r = rng(seed * 9973 + Math.round(amount));
  const spacing = CHIP_R * 2.12;
  const positions = columnPositions(columns.length, spacing, layout, perRow);
  const g = chipGeometry();
  // Remember the columns (piles) – the chip riffle works on them (see fidget.js)
  const piles = [];
  columns.forEach((col, ci) => {
    const [px, pz] = positions[ci];
    const m = chipMaterials(col.d);
    const pile = { x: px, z: pz, chips: [], mixed: false };
    for (let i = 0; i < col.h; i++) {
      const chip = new THREE.Mesh(g, m);
      chip.position.set(px + (r() - 0.5) * 0.025, CHIP_H / 2 + i * CHIP_H, pz + (r() - 0.5) * 0.025);
      chip.rotation.y = r() * Math.PI * 2;
      chip.castShadow = true;
      chip.receiveShadow = true;
      chip.userData.pile = ci;
      pile.chips.push(chip);
      group.add(chip);
    }
    piles.push(pile);
  });
  group.userData.piles = piles;
  group.userData.build = { amount, opts: { seed, layout, perRow, maxChips, pretty } };
  return group;
}

function columnPositions(n, s, layout, perRow = 5) {
  const pos = [];
  if (layout === 'cluster') {
    // Honeycomb around the centre
    const rings = [[0, 0]];
    for (let ring = 1; rings.length < n; ring++) {
      for (let k = 0; k < 6 * ring && rings.length < n + 6; k++) {
        const a = (k / (6 * ring)) * Math.PI * 2 + ring * 0.3;
        rings.push([Math.cos(a) * s * ring, Math.sin(a) * s * ring]);
      }
    }
    return rings.slice(0, n);
  }
  // Row(s) – at most perRow per row, further rows staggered behind
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const idx = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    pos.push([(idx - (inRow - 1) / 2) * s + (row % 2) * s * 0.5, -row * s * 0.95]);
  }
  return pos;
}

export function disposeGroup(group) {
  group.parent?.remove(group);
}
