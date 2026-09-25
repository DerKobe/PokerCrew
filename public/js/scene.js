// Szene, Tisch, Licht, Kamera.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  TABLE, FELT_W, FELT_D, BOARD_Z, feltTexture, feltBumpTexture, woodTexture, leatherBumpTexture,
  carpetTexture, dealerButtonTexture, setMaxAnisotropy,
} from './textures.js';
import { updateTweens } from './tween.js';

export const SEATS = 5;
// Winkel der Anzeigepositionen (0 = unten/eigener Platz, im Uhrzeigersinn)
const SEAT_ANGLES = [0, 80, 146, 214, 280].map((d) => (d * Math.PI) / 180);
const SEAT_ANGLES_PORTRAIT = [0, 58, 152, 208, 302].map((d) => (d * Math.PI) / 180);

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

// Hochformat: Tisch um 90° gedreht, Längsachse zeigt zum eigenen Platz
let portrait = false;
export const isPortrait = () => portrait;

// Punkt auf dem Filzrand in Richtung (dx, dz) + Normale – in Tisch-Koordinaten
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

// Dasselbe in Weltkoordinaten (Tischgruppe ist im Hochformat um +90° um Y gedreht:
// lokal (x, z) -> Welt (z, -x))
function worldStadiumPoint(dx, dz) {
  if (!portrait) return stadiumPoint(dx, dz);
  const { p, n } = stadiumPoint(-dz, dx);
  return { p: new THREE.Vector3(p.z, 0, -p.x), n: new THREE.Vector3(n.z, 0, -n.x) };
}

// Punkt so weit zur Tischmitte schieben, dass er mindestens `margin` Abstand zur Filzkante hat
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

// me: eigener Platz (angehobene Karten direkt an der Bande). Zuschauer sehen Platz 0 im
// normalen Layout, damit flach liegende Karten nicht über die Bande ragen.
export function seatAnchors(pos, me = pos === 0) {
  const ang = (portrait ? SEAT_ANGLES_PORTRAIT : SEAT_ANGLES)[pos];
  const { p, n } = worldStadiumPoint(-Math.sin(ang), Math.cos(ang));
  const right = new THREE.Vector3(n.z, 0, -n.x); // rechts aus Sicht des Spielers
  const raw = (inset, side = 0, y = 0) => p.clone().addScaledVector(n, -inset).addScaledVector(right, side).setY(y);
  // An den Tischrundungen würde ein seitlicher Versatz sonst auf die Holzkante wandern
  const at = (inset, side, y, margin) => clampToFelt(raw(inset, side, y), margin);
  const yaw = Math.atan2(n.x, n.z);
  return {
    yaw,
    normal: n,
    right,
    edge: p,
    cards: me ? raw(0.3, 0) : at(1.4, 0, 0, 0.8), // eigener Platz: Unterkante der Karten
    stack: me ? raw(0.95, portrait ? 1.8 : 2.1) : at(1.0, 1.75, 0, 1.0),
    bet: me ? raw(2.9, 0) : at(3.0, 0.2, 0, 1.2),
    button: me ? raw(1.2, portrait ? -1.7 : -1.9) : at(1.9, -1.45, 0, 0.55),
    plate: me ? raw(-0.95, 0, 0.6) : raw(-0.75, 0, 0.6),
    ring: me ? raw(0.95, 0, 0.012) : at(1.4, 0, 0.012, 0.8),
  };
}

// Tischfeste Punkte (Board, Pot, Deck) sind in Tisch-Koordinaten definiert und drehen im
// Hochformat mit dem Tisch mit – wie an einem echten Tisch, den man von der Stirnseite sieht.
export const tableYaw = () => (portrait ? Math.PI / 2 : 0);
export function tableToWorld(x, y, z) {
  return portrait ? new THREE.Vector3(z, y, -x) : new THREE.Vector3(x, y, z);
}
export const BOARD_POS = (i) => tableToWorld((i - 2) * 1.14, 0.02, BOARD_Z);
export const POT_POS = () => tableToWorld(0, 0, -1.4);
export const DECK_POS = () => tableToWorld(0, 0.9, -2.2);

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
    this.mouse = new THREE.Vector2();
    this.smoothMouse = new THREE.Vector2();
    this.idle = true;

    this.#lights();
    this.#table();
    this.#room();

    this.dealerButton = this.#dealerButton();
    this.turnRing = this.#turnRing();

    this.onFrame = [];
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
    this.resize();
    this.timer = new THREE.Timer();
    renderer.setAnimationLoop(() => this.#frame());
  }

  #lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xfff3e0, 0x1a0f0a, 0.35));
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
    // weiches Fülllicht von der Spielerseite
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
    fill.position.set(-4, 10, 16);
    s.add(fill);
    // Randlicht von hinten für die Bande
    const rim = new THREE.DirectionalLight(0xffc98a, 0.5);
    rim.position.set(6, 6, -14);
    s.add(rim);
  }

  #table() {
    const { a, r, race, rail } = TABLE;
    const g = new THREE.Group();
    this.table = g;

    // Filz
    const feltGeo = new THREE.ShapeGeometry(stadiumShape(a, r), 48);
    const pos = feltGeo.attributes.position;
    const uv = feltGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + FELT_W / 2) / FELT_W, (pos.getY(i) + FELT_D / 2) / FELT_D);
    feltGeo.rotateX(-Math.PI / 2);
    this.feltMat = new THREE.MeshStandardMaterial({
      map: feltTexture(),
      bumpMap: feltBumpTexture(),
      bumpScale: 0.6,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.4,
    });
    const felt = new THREE.Mesh(feltGeo, this.feltMat);
    felt.receiveShadow = true;
    g.add(felt);

    // Holz-Racetrack
    const wood = woodTexture();
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
    const raceM = new THREE.Mesh(raceGeo, woodMat);
    raceM.position.y = -0.02;
    raceM.receiveShadow = true;
    raceM.castShadow = true;
    g.add(raceM);

    // Messing-Einlage an der Filzkante
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

    // Gepolsterte Lederbande
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

    // Ziernaht auf der Bande
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

    // Zarge unter der Bande
    const apronGeo = new THREE.ExtrudeGeometry(stadiumShape(a, outer - 0.12), { depth: 1.1, bevelEnabled: false, curveSegments: 64 });
    apronGeo.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshPhysicalMaterial({ map: wood, color: 0x5a3b2c, roughness: 0.45, clearcoat: 0.6 }));
    apron.position.y = -1.2;
    g.add(apron);

    // Tischfuß
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
    // weicher, goldener Lichtkranz als Canvas-Textur
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
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const wantPortrait = aspect < 0.85;
    if (wantPortrait !== portrait) {
      portrait = wantPortrait;
      this.table.rotation.y = tableYaw();
      this.onLayout?.();
    }
    // Sichtbarer Bereich (Tisch + Namensschilder) muss hineinpassen
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

  #frame() {
    this.timer.update();
    const t = this.timer.getElapsed();
    updateTweens();
    // Beim Chip-Riffle soll die Kamera nicht mit der Maus mitschwenken
    if (!this.freezeParallax) this.smoothMouse.lerp(this.mouse, 0.04);
    // Kamera: leicht geneigte Draufsicht, dezenter Parallax, im Leerlauf sanftes Schweben
    const elev = this.elevation;
    const d = this.baseDist;
    const sway = this.idle ? Math.sin(t * 0.15) * 0.12 : 0;
    const yawOff = this.smoothMouse.x * 0.05 + sway;
    const pitchOff = this.smoothMouse.y * 0.025;
    const e = elev + pitchOff;
    if (this.debugCam) {
      // nur für Entwicklung (?debug): feste Kamera für Nahaufnahmen
      this.camera.position.copy(this.debugCam.pos);
      this.camera.lookAt(this.debugCam.target);
    } else {
      this.camera.position.set(
        this.target.x + Math.sin(yawOff) * Math.cos(e) * d,
        this.target.y + Math.sin(e) * d,
        this.target.z + Math.cos(yawOff) * Math.cos(e) * d,
      );
      this.camera.lookAt(this.target);
    }

    if (this.turnRing.visible) {
      this.turnRing.material.opacity = 0.6 + Math.sin(t * 4) * 0.25;
    }
    for (const fn of this.onFrame) fn(t);
    this.renderer.render(this.scene, this.camera);
  }

  project(v3, out = new THREE.Vector3()) {
    out.copy(v3).project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return { x: ((out.x + 1) / 2) * w, y: ((1 - out.y) / 2) * h, visible: out.z < 1 };
  }
}
