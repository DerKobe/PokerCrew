// Trophies (achievements): small 3D objects next to a player's cards, earned at showdowns and kept
// for the rest of the tournament. Hovering one shows what it stands for. The server decides who
// gets what (server/trophies.js); this module only builds, places and presents them.
import * as THREE from 'three';
import { createCard } from './cards.js';
import { seatAnchors } from './scene.js';
import { glassMaterial } from './gadgets.js';
import { tween, ease } from './tween.js';
import { sfx } from './sound.js';
import { t } from './i18n.js';
import { engravedPlateTexture } from './textures.js';

const SCALE = 1.45; // larger than life so they are recognisable from the table view
const GROWTH = 0.15; // each further trophy of the same kind makes it this much bigger ...
const MAX_GROWTH = 1.6; // ... up to this factor; the tooltip shows the exact count
const SLOT = 0.78; // room one trophy takes in the row (at base size)
const ICONS = { sevenDeuce: '🃏', tequila: '🥃', crackedAces: '💔', riverRat: '🐀' };

const gold = () => new THREE.MeshPhysicalMaterial({ color: 0xd9b25a, metalness: 1, roughness: 0.25, clearcoat: 0.6, envMapIntensity: 1.6 });

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function miniCard(code, scale = 0.24) {
  const c = createCard(code);
  c.userData.setFace(code);
  c.scale.setScalar(scale);
  return c;
}

// --- models (local +z points to the player, y up, footprint about 0.35) ---

// Empty tequila shot glass turned upside down, lime wedge next to it
function tequilaModel() {
  const g = new THREE.Group();
  const prof = [
    [0, 0], [0.1, 0], [0.104, 0.01], [0.124, 0.27], [0.118, 0.275], [0.1, 0.06], [0, 0.055],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = mesh(new THREE.LatheGeometry(prof, 32), glassMaterial({ opacity: 0.14, edge: 0.85 }), false);
  glass.renderOrder = 5;
  glass.rotation.x = Math.PI; // upside down: the thick base is on top
  glass.position.y = 0.275;
  g.add(glass);
  const rind = new THREE.MeshStandardMaterial({ color: 0x3f8f24, roughness: 0.5 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0xc8e87a, roughness: 0.6, emissive: 0x1a2a05 });
  const lime = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 24, 1, false, 0, Math.PI), [rind, flesh, flesh]);
  lime.rotation.set(Math.PI / 2, 0, 0.4);
  lime.position.set(0.02, 0.038, 0.17);
  g.add(lime);
  return g;
}

// Seven and deuce as engraved silver plates on a golden base, leaning back so everyone can read
// them. The 2 stands a little in front of the 7, so the fanned plates never cut into each other.
const silver = (extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color: 0xc4cad3, metalness: 1, roughness: 0.22, clearcoat: 0.6, envMapIntensity: 2.1, ...extra });

function sevenDeuceModel() {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(0.34, 0.04, 0.2), gold());
  base.position.y = 0.02;
  g.add(base);
  const W = 0.2;
  const H = 0.28;
  const T = 0.012;
  const lean = new THREE.Group(); // the plates' plane, tilted back around the base's top edge
  lean.position.set(0, 0.04, 0.02);
  lean.rotation.x = -0.75;
  g.add(lean);
  const edge = silver();
  [['7', 'h', -0.045, 0.16, -T * 0.8], ['2', 'c', 0.045, -0.16, T * 0.8]].forEach(([rank, suit, x, fan, z]) => {
    const { map, bump } = engravedPlateTexture(rank, suit);
    const face = silver({ map, bumpMap: bump, bumpScale: 1.2 });
    const plate = mesh(new THREE.BoxGeometry(W, H, T), [edge, edge, edge, edge, face, edge]);
    // rotate around the plate's bottom centre (fanned like a hand of cards)
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z);
    pivot.rotation.z = fan;
    plate.position.y = H / 2;
    pivot.add(plate);
    lean.add(pivot);
  });
  return g;
}

// Two aces on black velvet – the top one cracked in two
function crackedAcesModel() {
  const g = new THREE.Group();
  const velvet = mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0x141016, roughness: 0.95 }));
  velvet.position.y = 0.02;
  g.add(velvet);
  const a1 = miniCard('As');
  a1.rotation.set(-Math.PI / 2, 0, 0.35);
  a1.position.set(-0.02, 0.046, 0);
  g.add(a1);
  const a2 = miniCard('Ah');
  a2.rotation.set(-Math.PI / 2 + 0.05, 0, -0.45);
  a2.position.set(0.03, 0.058, 0.01);
  g.add(a2);
  // jagged crack across the top ace
  const pts = [[-0.1, -0.13], [-0.03, -0.06], [-0.06, 0], [0.02, 0.05], [-0.01, 0.1], [0.07, 0.16]];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.004)), false, 'catmullrom', 0.05);
  const crack = mesh(new THREE.TubeGeometry(curve, 40, 0.006, 5), new THREE.MeshBasicMaterial({ color: 0x120a08 }), false);
  crack.scale.setScalar(1 / 0.24);
  a2.add(crack);
  return g;
}

// A little grey rat sitting on a golden coin
function riverRatModel() {
  const g = new THREE.Group();
  const coin = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 36), gold());
  coin.position.y = 0.015;
  g.add(coin);
  const fur = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.85 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe6a0a8, roughness: 0.6 });
  const rat = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.08, 20, 14), fur);
  body.scale.set(1, 0.85, 1.45);
  body.position.y = 0.085;
  rat.add(body);
  const head = mesh(new THREE.ConeGeometry(0.052, 0.13, 18), fur);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.11, 0.155);
  rat.add(head);
  const nose = mesh(new THREE.SphereGeometry(0.014, 10, 8), pink);
  nose.position.set(0, 0.11, 0.222);
  rat.add(nose);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 16), pink);
    ear.rotation.set(Math.PI / 2 - 0.3, 0, s * 0.4);
    ear.position.set(s * 0.042, 0.158, 0.11);
    rat.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 }), false);
    eye.position.set(s * 0.028, 0.13, 0.17);
    rat.add(eye);
  }
  const tail = new THREE.CatmullRomCurve3(
    [[0, 0.07, -0.1], [0.03, 0.04, -0.17], [0.1, 0.035, -0.2], [0.15, 0.04, -0.13], [0.13, 0.05, -0.06]].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  rat.add(mesh(new THREE.TubeGeometry(tail, 30, 0.009, 6), pink));
  rat.rotation.y = 0.5;
  g.add(rat);
  return g;
}

const MODELS = { tequila: tequilaModel, sevenDeuce: sevenDeuceModel, crackedAces: crackedAcesModel, riverRat: riverRatModel };

// --- manager ---

export class Trophies {
  constructor({ stage, view }) {
    this.stage = stage;
    this.view = view;
    this.slots = new Map(); // `${seat}:${kind}` -> { seat, kind, obj, hit, count }
    this.known = new Set(); // ids of the trophies in the last state (seat:name:kind:hand:index)
    this.pending = [];
    this.state = null;
    this.first = true;
    this.visible = true; // personal setting
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.tip = document.createElement('div');
    this.tip.id = 'trophy-tip';
    this.tip.className = 'hidden';
    document.body.appendChild(this.tip);
    const el = stage.renderer.domElement;
    this.el = el;
    el.addEventListener('pointermove', (e) => this.#hover(e));
    el.addEventListener('pointerleave', () => this.#hideTip());
    stage.onFrame.push(() => this.#frame());
  }

  update(state) {
    this.state = state;
    const n = state.seats.length;
    const relayout = state.mySeat !== this.mySeat || n !== this.n;
    this.mySeat = state.mySeat;
    this.n = n;
    // a new tournament (or a player gone) clears the shelf
    for (const [key, slot] of this.slots) {
      const seat = state.seats[slot.seat];
      if (!seat || !seat.trophies.some((x) => x.kind === slot.kind)) this.#removeSlot(key);
    }
    const ids = new Set();
    state.seats.forEach((seat, i) => {
      (seat?.trophies || []).forEach((tr, k) => {
        const id = `${i}:${seat.name}:${tr.kind}:${tr.hand}:${k}`;
        ids.add(id);
        if (this.known.has(id)) return;
        if (this.first) this.#add(i, tr.kind, false);
        else this.pending.push({ seat: i, kind: tr.kind, hand: tr.hand });
      });
    });
    // only what is in the current state counts (a new tournament starts at hand #1 again)
    this.known = ids;
    this.pending = this.pending.filter((p) => state.seats[p.seat]?.trophies?.length);
    this.first = false;
    if (relayout) this.relayout();
  }

  relayout() {
    for (const seat of new Set([...this.slots.values()].map((sl) => sl.seat))) this.#placeSeat(seat);
  }

  // Computed from the state directly: the table view applies seat changes asynchronously
  #anchors(seat) {
    const pos = (seat - (this.mySeat ?? 0) + this.n) % this.n;
    return seatAnchors(pos, this.mySeat != null && seat === this.mySeat, this.n);
  }

  #slotIndex(seat, kind) {
    // order on the shelf: order in which the kinds were first earned
    const list = this.state?.seats[seat]?.trophies || [];
    const kinds = [...new Set(list.map((x) => x.kind))];
    return Math.max(0, kinds.indexOf(kind));
  }

  // One trophy per kind; every further one of the same kind makes it a bit bigger
  #scaleFor(count) {
    return SCALE * Math.min(MAX_GROWTH, 1 + GROWTH * (count - 1));
  }

  // Lay out a seat's row: bigger trophies take more room, so the offsets add up
  #placeSeat(seat) {
    const A = this.#anchors(seat);
    const row = [...this.slots.values()].filter((sl) => sl.seat === seat).sort((a, b) => this.#slotIndex(seat, a.kind) - this.#slotIndex(seat, b.kind));
    let offset = 0;
    for (const sl of row) {
      const width = SLOT * (this.#scaleFor(sl.count) / SCALE);
      sl.obj.position.copy(A.trophy(offset + (width - SLOT) / 2));
      sl.obj.rotation.y = A.yaw - 0.2;
      if (!sl.obj.userData.popping) sl.obj.scale.setScalar(this.#scaleFor(sl.count));
      offset += width;
    }
  }

  #add(seat, kind, animate) {
    const key = `${seat}:${kind}`;
    let slot = this.slots.get(key);
    const from = slot ? this.#scaleFor(slot.count) : 0.01;
    if (!slot) {
      const obj = MODELS[kind]();
      // invisible, generous hit area for hovering
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.4, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      hit.position.y = 0.2;
      obj.add(hit);
      obj.visible = this.visible;
      slot = { seat, kind, obj, hit, count: 0 };
      hit.userData.slot = slot;
      this.slots.set(key, slot);
      this.stage.scene.add(obj);
    }
    slot.count++;
    this.#placeSeat(seat);
    if (!animate || !this.visible) return;
    // pop in (or grow) with a little golden sparkle and a chime
    const obj = slot.obj;
    const to = this.#scaleFor(slot.count);
    obj.userData.popping = true;
    obj.scale.setScalar(from);
    tween({
      duration: 650,
      easing: ease.outBack,
      update: (k) => obj.scale.setScalar(Math.max(0.01, from + (to - from) * k)),
      done: () => (obj.userData.popping = false),
    });
    this.#sparkle(obj.position);
    sfx.trophy();
  }

  #removeSlot(key) {
    const slot = this.slots.get(key);
    this.stage.scene.remove(slot.obj);
    slot.obj.traverse((o) => o.isMesh && o.geometry.dispose());
    this.slots.delete(key);
  }

  #sparkle(at) {
    const tex = sparkleTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffd76a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.35;
      const from = at.clone().setY(0.15);
      const to = at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.35 + Math.random() * 0.45, Math.sin(a) * r));
      s.position.copy(from);
      s.scale.setScalar(0.12);
      this.stage.scene.add(s);
      tween({
        duration: 700 + Math.random() * 400,
        easing: ease.outCubic,
        update: (k) => {
          s.position.lerpVectors(from, to, k);
          s.material.opacity = 1 - k;
          s.scale.setScalar(0.05 + 0.12 * (1 - k));
        },
        done: () => this.stage.scene.remove(s),
      });
    }
  }

  // New trophies appear once the table has finished showing the hand – no spoiler for the river
  #frame() {
    if (!this.pending.length) return;
    const v = this.view;
    this.pending = this.pending.filter((p) => {
      const waiting = v.handId === p.hand && !v.resultsShown;
      if (waiting) return true;
      this.#add(p.seat, p.kind, !document.hidden);
      return false;
    });
  }

  // Show / hide all trophies – a personal setting
  setVisible(on) {
    this.visible = on;
    for (const sl of this.slots.values()) sl.obj.visible = on;
    if (!on) this.#hideTip();
  }

  #hover(e) {
    if (!this.visible) return;
    const now = performance.now();
    if (now - (this.lastHover || 0) < 50) return;
    this.lastHover = now;
    const hits = [...this.slots.values()].map((sl) => sl.hit);
    if (!hits.length) return this.#hideTip();
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const hit = this.raycaster.intersectObjects(hits, false)[0];
    if (!hit) return this.#hideTip();
    const slot = hit.object.userData.slot;
    const seat = this.state?.seats[slot.seat];
    const hands = (seat?.trophies || []).filter((x) => x.kind === slot.kind).map((x) => `#${x.hand}`);
    const count = hands.length;
    this.tip.innerHTML = `<b>${ICONS[slot.kind]} ${esc(t(`trophy.${slot.kind}.name`))}${count > 1 ? ` ×${count}` : ''}</b>
      <span>${esc(t(`trophy.${slot.kind}.desc`))}</span>
      <small>${esc(seat?.name || '')} · ${esc(t('trophy.hands', { list: hands.join(', ') }))}</small>`;
    this.tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    this.tip.classList.remove('hidden');
    this.stage.setCursor('trophy', 'help');
  }

  #hideTip() {
    this.tip.classList.add('hidden');
    this.stage.setCursor('trophy', '');
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let sparkleTex = null;
function sparkleTexture() {
  if (sparkleTex) return sparkleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,230,150,0.8)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sparkleTex = new THREE.CanvasTexture(c);
  sparkleTex.colorSpace = THREE.SRGBColorSpace;
  return sparkleTex;
}
