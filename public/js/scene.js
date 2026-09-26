// Scene, table, lights, camera.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  TABLE, FELT_W, FELT_D, BOARD_Z, feltTexture, feltBumpTexture, woodTexture, leatherBumpTexture,
  carpetTexture, dealerButtonTexture, setMaxAnisotropy, marbleTexture,
} from './textures.js';
import { updateTweens, tween, ease } from './tween.js';
import { MAX_SEATS } from '/shared/config.js';
import { CARD_W, CARD_H } from './cards.js';
import { CHIP_R } from './chips.js';

export { MAX_SEATS };

function stadiumShape(a, r, holeOf = null) {
  const s = new THREE.Shape();
  s.moveTo(-a, -r);
  s.lineTo(a, -r);
  s.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-a, r);
  s.absarc(-a, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  if (holeOf) {
    const h = new THREE.Path();
    const [ha, hr] = holeOf;
    h.moveTo(-ha, -hr);
    h.absarc(-ha, 0, hr, (Math.PI * 3) / 2, Math.PI / 2, true);
    h.lineTo(ha, hr);
    h.absarc(ha, 0, hr, Math.PI / 2, -Math.PI / 2, true);
    h.lineTo(-ha, -hr);
    s.holes.push(h);
  }
  return s;
}

// Portrait: table rotated by 90°, its long axis points towards your own seat
let portrait = false;
export const isPortrait = () => portrait;

// Point on the felt edge in direction (dx, dz) + normal – in table coordinates
function stadiumPoint(dx, dz, r = TABLE.r) {
  const a = TABLE.a;
  let lo = 0;
  let hi = a + r + 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    const x = dx * t;
    const z = dz * t;
    const cx = Math.max(-a, Math.min(a, x));
    const d = Math.hypot(x - cx, z);
    if (d < r) lo = t;
    else hi = t;
  }
  const x = dx * lo;
  const z = dz * lo;
  const cx = Math.max(-a, Math.min(a, x));
  const n = new THREE.Vector2(x - cx, z).normalize();
  return { p: new THREE.Vector3(x, 0, z), n: new THREE.Vector3(n.x, 0, n.y) };
}

// Push a point towards the table centre until it is at least `margin` away from the felt edge
function clampToFelt(v, margin) {
  let x = portrait ? -v.z : v.x;
  let z = portrait ? v.x : v.z;
  const cx = Math.max(-TABLE.a, Math.min(TABLE.a, x));
  const dist = Math.hypot(x - cx, z);
  const max = TABLE.r - margin;
  if (dist > max) {
    x = cx + ((x - cx) * max) / dist;
    z = (z * max) / dist;
  }
  return portrait ? new THREE.Vector3(z, v.y, -x) : new THREE.Vector3(x, v.y, z);
}

// Seats are spread evenly along the felt edge. Display position 0 (your own seat, or seat 0
// for spectators) is at the bottom centre of the screen; the others follow clockwise.
function seatPoint(pos, count) {
  const R = TABLE.r;
  const L = 4 * TABLE.a + 2 * Math.PI * R;
  // landscape: middle of the bottom long side; portrait: apex of the (rotated) left end
  const start = portrait ? TABLE.a + (Math.PI / 2) * R : 0;
  const q = perimeterAt(start + (pos * L) / count, R);
  return { p: tableToWorld(q.x, 0, q.z), n: tableToWorld(q.nx, 0, q.nz) };
}

// Bets of a seat opposite the board would land on the pot: move them to the player's right
function clearOfPot(v, right) {
  const pot = POT_POS();
  if (Math.hypot(v.x - pot.x, v.z - pot.z) < 1.25) v.addScaledVector(right, 1.5);
  return v;
}

// me: own seat (raised cards right at the rail). Spectators see seat 0 in the normal
// layout so cards lying flat do not stick out over the rail.
export function seatAnchors(pos, me = pos === 0, count = 5) {
  const { p, n } = seatPoint(pos, count);
  const right = new THREE.Vector3(n.z, 0, -n.x); // right from the player's point of view
  const raw = (inset, side = 0, y = 0) => p.clone().addScaledVector(n, -inset).addScaledVector(right, side).setY(y);
  // At the rounded ends a sideways offset would otherwise drift onto the wooden edge
  const at = (inset, side, y, margin) => clampToFelt(raw(inset, side, y), margin);
  const yaw = Math.atan2(n.x, n.z);
  return {
    yaw,
    normal: n,
    right,
    edge: p,
    cards: me ? raw(0.3, 0) : at(1.4, 0, 0, 0.8), // own seat: bottom edge of the cards
    stack: me ? raw(0.95, portrait ? 1.8 : 2.1) : at(1.0, 1.75, 0, 1.0),
    bet: me ? raw(portrait ? 3.4 : 2.9, 0) : clearOfBoard(clearOfPot(at(3.0, 0.2, 0, 1.2), right), n),
    button: me ? raw(1.2, portrait ? -1.7 : -1.9) : at(1.9, -1.45, 0, 0.55),
    plate: me ? raw(-0.95, 0, 0.6) : raw(-0.75, 0, 0.6),
    ring: me ? raw(portrait ? 1.35 : 0.95, 0, 0.012) : at(1.4, 0, 0.012, 0.8),
    // others: the gadget stands on the felt right next to the cards (yours sits on the rail in
    // front of you, see gadgetAnchor), the trophies follow in a row further left, past the
    // gadget; `offset` = distance along the row. In portrait your seat is at the narrow end of the
    // table, so your row moves further in (and stays on the felt)
    gadget: me ? null : at(0.75, -1.2, 0, 0.45),
    trophy: (offset) =>
      me ? (portrait ? at(2.0, -2.3 - offset, 0, 0.5) : raw(0.5, -2.15 - offset)) : at(0.75, -2.0 - offset, 0, 0.45),
  };
}

// Perimeter parameter (arc length from the middle of the bottom long side, counter-clockwise
// seen from above = to the left from seat 0's point of view) on a stadium curve with radius R.
function perimeterParam(x, z, R) {
  const a = TABLE.a;
  if (x < -a) {
    let phi = Math.atan2(z, x + a);
    if (phi < 0) phi += Math.PI * 2;
    return a + (phi - Math.PI / 2) * R;
  }
  if (x > a) return 3 * a + Math.PI * R + (Math.atan2(z, x - a) + Math.PI / 2) * R;
  return z > 0 ? -x : a + Math.PI * R + (x + a);
}

function perimeterAt(s, R) {
  const a = TABLE.a;
  const L = 4 * a + 2 * Math.PI * R;
  s = ((s % L) + L) % L;
  const arc = (cx, phi) => ({ x: cx + R * Math.cos(phi), z: R * Math.sin(phi), nx: Math.cos(phi), nz: Math.sin(phi) });
  if (s < a) return { x: -s, z: R, nx: 0, nz: 1 };
  s -= a;
  if (s < Math.PI * R) return arc(-a, Math.PI / 2 + s / R);
  s -= Math.PI * R;
  if (s < 2 * a) return { x: -a + s, z: -R, nx: 0, nz: -1 };
  s -= 2 * a;
  if (s < Math.PI * R) return arc(a, -Math.PI / 2 + s / R);
  s -= Math.PI * R;
  return { x: a - s, z: R, nx: 0, nz: 1 };
}

// Spot for your own gadget: on the wooden racetrack, `along` units left of your seat
export function gadgetAnchor(pos, along, count = 5) {
  const { p: w } = seatPoint(pos, count);
  const p = portrait ? { x: -w.z, z: w.x } : w; // back to table coordinates
  const R = TABLE.r + 0.2;
  const q = perimeterAt(perimeterParam(p.x, p.z, R) + along, R);
  const n = tableToWorld(q.nx, 0, q.nz);
  return { pos: tableToWorld(q.x, 0.065, q.z), yaw: Math.atan2(n.x, n.z) };
}

// Table-fixed points (board, pot, deck) are defined in table coordinates and rotate with the
// table in portrait – like a real table seen from its short end.

export const tableYaw = () => (portrait ? Math.PI / 2 : 0);
export function tableToWorld(x, y, z) {
  return portrait ? new THREE.Vector3(z, y, -x) : new THREE.Vector3(x, y, z);
}
export const DECK_POS = () => tableToWorld(0, 0.9, -2.2);

// Portrait (phones): a row of five cards would run sideways along the rotated table and stay
// tiny. Instead the board is a 3 + 2 grid of large upright cards, the pot sits above it and
// your own hole cards are larger too.
export const PORTRAIT_BOARD = { scale: 1.5, dx: 1.6, dz: 1.11, cz: -0.35 };
const PB = PORTRAIT_BOARD;
const PB_HALF_W = PB.dx + (CARD_W * PB.scale) / 2;
const PB_HALF_D = PB.dz + (CARD_H * PB.scale) / 2;
export const boardScale = () => (portrait ? PB.scale : 1);
export const ownCardScale = () => (portrait ? 1.7 : 1.05);
export function BOARD_POS(i) {
  if (!portrait) return tableToWorld((i - 2) * 1.14, 0.02, BOARD_Z);
  const flop = i < 3;
  return new THREE.Vector3((flop ? i - 1 : i - 3.5) * PB.dx, 0.02, PB.cz + (flop ? -PB.dz : PB.dz));
}
export const BOARD_CENTER = () => (portrait ? new THREE.Vector3(0, 0.02, PB.cz) : BOARD_POS(2));
// Spot right below the board (e.g. for a label)
export const BELOW_BOARD = () => (portrait ? new THREE.Vector3(0, 0, PB.cz + PB_HALF_D + 0.4) : BOARD_POS(2).add(tableToWorld(0, 0, 1.05)));
export const POT_POS = () => (portrait ? new THREE.Vector3(0, 0, PB.cz - PB_HALF_D - 0.75) : tableToWorld(0, 0, -1.4));

// Portrait: move a bet that would land on the board outwards (towards its player) until it is clear
function clearOfBoard(v, n) {
  if (!portrait) return v;
  const margin = CHIP_R + 0.12;
  for (let i = 0; i < 40; i++) {
    const inside = Math.abs(v.x) < PB_HALF_W + margin && Math.abs(v.z - PB.cz) < PB_HALF_D + margin;
    if (!inside) break;
    v.addScaledVector(n, 0.1);
  }
  return v;
}

export class Stage {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x050608, 26, 60);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.target = new THREE.Vector3(0, 0, 0.7);
    this.idle = true;
    this.feltTitle = 'PokerCrew';
    this.feltColor = 'green';
    this.rimKind = 'wood'; // material of the ring around the felt (this.rim is the rim light)
    // the OS "reduce motion" setting turns off the idle sway and the dramatic river zoom
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reserveBottom = 0; // px kept free for the action panel (see setReserveBottom)

    this.#lights();
    this.#table();
    this.#room();

    this.dealerButton = this.#dealerButton();
    this.turnRing = this.#turnRing();

    this.onFrame = [];
    // Mobile browsers (iOS Safari in particular) sometimes fire 'resize' before the new viewport
    // size can be read, e.g. on rotation or when the toolbars collapse. A ResizeObserver reports
    // the size the container actually ends up with, so the canvas never keeps a stale size.
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(container);
    this.resize();
    this.timer = new THREE.Timer();
    renderer.setAnimationLoop(() => this.#frame());
  }

  #lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xfff3e0, 0x1a0f0a, 0.35);
    s.add(this.hemi);
    const spot = new THREE.SpotLight(0xffecd2, 520, 0, 0.62, 0.55, 1.6);
    spot.position.set(0, 21, 2);
    spot.target.position.set(0, 0, 0.3);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.00015;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 8;
    spot.shadow.camera.far = 30;
    spot.shadow.radius = 3;
    s.add(spot, spot.target);
    this.spot = spot;
    // soft fill light from the player's side
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
    this.fill = fill;
    fill.position.set(-4, 10, 16);
    s.add(fill);
    // rim light from behind for the rail
    const rim = new THREE.DirectionalLight(0xffc98a, 0.5);
    this.rim = rim;
    rim.position.set(6, 6, -14);
    s.add(rim);
  }

  // Several features want a mouse cursor over their objects (chips, gadgets); each sets its own
  // wish and the first non-empty one wins, so they never clear each other's cursor
  setCursor(source, value) {
    this.cursors ??= {};
    this.cursors[source] = value;
    this.renderer.domElement.style.cursor = Object.values(this.cursors).find(Boolean) || '';
  }

  #printFelt() {
    const old = this.feltMat.map;
    this.feltMat.map = feltTexture(this.feltTitle, this.feltColor, portrait ? PORTRAIT_BOARD : null);
    old?.dispose();
  }

  // Table look from the tournament config: name + colour on the felt, material of the rim
  setLook({ title, felt, rim }) {
    if ((title && title !== this.feltTitle) || (felt && felt !== this.feltColor)) {
      this.feltTitle = title || this.feltTitle;
      this.feltColor = felt || this.feltColor;
      this.#printFelt();
    }
    if (rim && rim !== this.rimKind) {
      this.rimKind = rim;
      const m = this.rimMat;
      if (rim === 'wood') {
        m.map = this.woodTex;
        m.roughness = 0.32;
        m.clearcoatRoughness = 0.12;
        m.envMapIntensity = 1.1;
      } else {
        // polished stone: smoother and more reflective than lacquered wood
        m.map = marbleTexture(rim === 'marbleDark' ? 'dark' : 'light');
        m.roughness = 0.18;
        m.clearcoatRoughness = 0.04;
        m.envMapIntensity = rim === 'marbleDark' ? 1.5 : 0.9;
      }
    }
  }

  #table() {
    const { a, r, race, rail } = TABLE;
    const g = new THREE.Group();
    this.table = g;

    // Felt
    const feltGeo = new THREE.ShapeGeometry(stadiumShape(a, r), 48);
    const pos = feltGeo.attributes.position;
    const uv = feltGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + FELT_W / 2) / FELT_W, (pos.getY(i) + FELT_D / 2) / FELT_D);
    feltGeo.rotateX(-Math.PI / 2);
    this.feltMat = new THREE.MeshStandardMaterial({
      map: feltTexture(this.feltTitle, this.feltColor),
      bumpMap: feltBumpTexture(),
      bumpScale: 0.6,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.4,
    });
    const felt = new THREE.Mesh(feltGeo, this.feltMat);
    felt.receiveShadow = true;
    g.add(felt);

    // Rim around the felt (racetrack): wood by default, marble selectable in the lobby
    const wood = woodTexture();
    this.woodTex = wood;
    const woodMat = new THREE.MeshPhysicalMaterial({
      map: wood,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.1,
    });
    const raceGeo = new THREE.ExtrudeGeometry(stadiumShape(a, r + race + 0.2, [a, r + 0.01]), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 3,
      curveSegments: 64,
    });
    raceGeo.rotateX(-Math.PI / 2);
    this.rimMat = woodMat;
    const raceM = new THREE.Mesh(raceGeo, woodMat);
    raceM.position.y = -0.02;
    raceM.receiveShadow = true;
    raceM.castShadow = true;
    g.add(raceM);

    // Brass inlay at the felt edge
    const brassGeo = new THREE.ExtrudeGeometry(stadiumShape(a, r + 0.06, [a, r + 0.012]), {
      depth: 0.02,
      bevelEnabled: false,
      curveSegments: 64,
    });
    brassGeo.rotateX(-Math.PI / 2);
    const brass = new THREE.Mesh(
      brassGeo,
      new THREE.MeshStandardMaterial({ color: 0xd4a84a, metalness: 1, roughness: 0.28, envMapIntensity: 1.6 }),
    );
    brass.position.y = 0.055;
    g.add(brass);

    // Padded leather rail
    const bev = 0.34;
    const inner = r + race;
    const outer = r + race + rail;
    const railGeo = new THREE.ExtrudeGeometry(stadiumShape(a, outer - bev, [a, inner + bev]), {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.24,
      bevelSize: bev,
      bevelSegments: 10,
      curveSegments: 72,
    });
    railGeo.rotateX(-Math.PI / 2);
    const leatherBump = leatherBumpTexture();
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0x16100d,
      roughness: 0.55,
      bumpMap: leatherBump,
      bumpScale: 1.4,
      clearcoat: 0.5,
      clearcoatRoughness: 0.28,
      sheen: 0.15,
      sheenColor: new THREE.Color(0x4a2f22),
      sheenRoughness: 0.7,
    });
    const railM = new THREE.Mesh(railGeo, railMat);
    railM.position.y = 0.06;
    railM.castShadow = true;
    railM.receiveShadow = true;
    g.add(railM);

    // Decorative seam on the rail
    const seamPts = [];
    const seamR = inner + rail * 0.5;
    const seg = 180;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      seamPts.push(stadiumPoint(Math.cos(t * Math.PI * 2), Math.sin(t * Math.PI * 2), seamR).p);
    }
    const seamCurve = new THREE.CatmullRomCurve3(seamPts, true);
    const seam = new THREE.Mesh(
      new THREE.TubeGeometry(seamCurve, 400, 0.012, 6, true),
      new THREE.MeshStandardMaterial({ color: 0xb58a4c, roughness: 0.6, metalness: 0.2 }),
    );
    seam.position.y = 0.06 + 0.18 + 0.24 + 0.004;
    g.add(seam);

    // Apron below the rail
    const apronGeo = new THREE.ExtrudeGeometry(stadiumShape(a, outer - 0.12), { depth: 1.1, bevelEnabled: false, curveSegments: 64 });
    apronGeo.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshPhysicalMaterial({ map: wood, color: 0x5a3b2c, roughness: 0.45, clearcoat: 0.6 }));
    apron.position.y = -1.2;
    g.add(apron);

    // Table base
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.2, 3.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.6 }),
    );
    foot.position.y = -2.7;
    g.add(foot);

    this.scene.add(g);
  }

  #room() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(60, 64),
      new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 1, color: 0x9a8a88 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4.3;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  #dealerButton() {
    const tex = dealerButtonTexture();
    const side = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.4 });
    const top = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.6 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 48), [side, top, side]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.set(0, 0.05, 0);
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  #turnRing() {
    // soft golden halo as a canvas texture
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 126);
    g.addColorStop(0, 'rgba(255, 210, 110, 0)');
    g.addColorStop(0.55, 'rgba(255, 210, 110, 0.05)');
    g.addColorStop(0.8, 'rgba(255, 214, 120, 0.9)');
    g.addColorStop(0.86, 'rgba(255, 236, 180, 1)');
    g.addColorStop(0.93, 'rgba(255, 200, 90, 0.35)');
    g.addColorStop(1, 'rgba(255, 200, 90, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(2.6, 2.6);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.renderOrder = 1;
    this.scene.add(m);
    return m;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === this.size?.w && h === this.size?.h) return;
    this.size = { w, h };
    // false: only the drawing buffer is resized; the canvas always fills the container via CSS
    this.renderer.setSize(w, h, false);
    const wantPortrait = w / h < 0.85;
    if (wantPortrait !== portrait) {
      portrait = wantPortrait;
      this.table.rotation.y = tableYaw();
      this.#printFelt();
      this.onLayout?.();
    }
    this.#fit(w, h, 0);
    // Landscape: the action panel sits at the bottom centre, right under your own name plate.
    // If the plate would reach into that reserved strip, the table is drawn in a shorter area
    // at the top of the screen (only as much shorter as needed).
    const limit = h - this.reserveBottom;
    if (!portrait && this.reserveBottom > 0) {
      let inset = 0;
      for (let i = 0; i < 4; i++) {
        this.#restPose();
        const y = this.project(seatAnchors(0, true).plate).y + 28; // bottom edge of the plate
        if (y <= limit) break;
        inset = Math.min(h * 0.4, inset + ((y - limit) * (h - inset)) / y + 1);
        this.#fit(w, h, inset);
      }
    }
  }

  // Keep a strip of `px` at the bottom of the screen free for the action panel (landscape)
  setReserveBottom(px) {
    if (px === this.reserveBottom) return;
    this.reserveBottom = px;
    this.size = null;
    this.resize();
  }

  // Camera distance so that table + name plates fit into the top `h - inset` pixels
  #fit(w, h, inset) {
    const vh = h - inset;
    const aspect = w / vh;
    this.camera.aspect = aspect;
    if (inset > 0) this.camera.setViewOffset(w, vh, 0, 0, w, h);
    else this.camera.clearViewOffset();
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const needW = portrait ? 14.2 : 21.5;
    const needH = portrait ? 19.5 : 14.5;
    const distW = needW / 2 / (Math.tan(fovV / 2) * aspect);
    const distH = needH / 2 / Math.tan(fovV / 2);
    this.baseDist = Math.max(distW, distH);
    this.elevation = THREE.MathUtils.degToRad(portrait ? 62 : 52);
    this.target.set(0, 0, portrait ? 1.6 : 0.7);
    this.scene.fog.near = this.baseDist * 1.25;
    this.scene.fog.far = this.baseDist * 2.6;
    this.camera.updateProjectionMatrix();
  }

  // The camera pose without any motion (used to measure the layout)
  #restPose() {
    const e = this.elevation;
    this.camera.position.set(this.target.x, this.target.y + Math.sin(e) * this.baseDist, this.target.z + Math.cos(e) * this.baseDist);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  #frame() {
    this.timer.update();
    const t = this.timer.getElapsed();
    updateTweens();
    // Camera: fixed, slightly tilted top view – it does not follow the mouse. It only moves for
    // the dramatic river (closer and lower towards a point) and sways gently while idle.
    const motion = this.reducedMotion.matches ? 0 : 1;
    const f = ease.inOutCubic(this.focusK || 0) * motion;
    const e = this.elevation - f * 0.13;
    const d = this.baseDist * (1 - f * 0.42);
    const target = this.focusK ? this.target.clone().lerp(this.focusPoint, f) : this.target;
    const yawOff = this.idle ? Math.sin(t * 0.15) * 0.12 * motion : 0;
    if (this.debugCam) {
      // development only (?debug): fixed camera for close-ups
      this.camera.position.copy(this.debugCam.pos);
      this.camera.lookAt(this.debugCam.target);
    } else {
      this.camera.position.set(
        target.x + Math.sin(yawOff) * Math.cos(e) * d,
        target.y + Math.sin(e) * d,
        target.z + Math.cos(yawOff) * Math.cos(e) * d,
      );
      this.camera.lookAt(target);
    }

    if (this.turnRing.visible) {
      this.turnRing.material.opacity = 0.6 + Math.sin(t * 4) * 0.25;
    }
    for (const fn of this.onFrame) fn(t);
    this.renderer.render(this.scene, this.camera);
  }

  // Dramatic moment: camera on one point, ambient light dimmed
  drama(on, point) {
    if (point) this.focusPoint = point.clone();
    if (!this.focusPoint) return Promise.resolve();
    const from = this.focusK || 0;
    const to = on ? 1 : 0;
    document.body.classList.toggle('drama', on);
    return tween({
      duration: on ? 1100 : 900,
      easing: ease.linear,
      update: (k) => {
        this.focusK = from + (to - from) * k;
        const light = 1 - 0.7 * ease.inOutCubic(this.focusK);
        this.hemi.intensity = 0.35 * light;
        this.fill.intensity = 0.55 * light;
        this.rim.intensity = 0.5 * light;
      },
    });
  }

  project(v3, out = new THREE.Vector3()) {
    out.copy(v3).project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return { x: ((out.x + 1) / 2) * w, y: ((1 - out.y) / 2) * h, visible: out.z < 1 };
  }
}
