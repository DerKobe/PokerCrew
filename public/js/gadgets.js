// Gadgets: small accessories next to each seat (purely cosmetic). Clicking your own gadget
// plays an animation that everyone at the table sees and (more quietly) hears.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gadgetAnchor, MAX_SEATS } from './scene.js';
import { rng } from './textures.js';
import { tween, ease } from './tween.js';
import { sfx } from './sound.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const REMOTE_VOLUME = 0.45;
const GADGET_SCALE = 1.2; // a bit larger than true to scale so it is recognisable from the table view

// Render order of the transparent parts: ice -> liquid -> glass -> smoke
const ORDER = { ice: 2, liquid: 3, glass: 5, smoke: 6 };

// ------------------------------------------------------------ Textures (created once)

const texCache = new Map();
function canvasTex(key, w, h, draw, { srgb = true, repeat = false } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// Soft, irregular smoke puff
function smokeTex(i) {
  return canvasTex(`smoke${i}`, 128, 128, (g, w, h) => {
    const r = rng(17 + i * 101);
    for (let k = 0; k < 9; k++) {
      const a = r() * TAU;
      const d = r() * 26;
      const x = w / 2 + Math.cos(a) * d;
      const y = h / 2 + Math.sin(a) * d;
      const rad = 18 + r() * 26;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(255,255,255,0.45)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
    // Make sure the edge fades out
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
  });
}

const tobaccoTex = () =>
  canvasTex('tobacco', 256, 256, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#6b4526';
    g.fillRect(0, 0, w, h);
    // Wrapper leaf: veins wound diagonally around the cigar
    for (let i = 0; i < 90; i++) {
      const x = r() * w;
      g.strokeStyle = r() < 0.5 ? `rgba(40,22,10,${0.15 + r() * 0.25})` : `rgba(150,105,60,${0.1 + r() * 0.2})`;
      g.lineWidth = 0.6 + r() * 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 30, h * 0.3, x - 20, h * 0.7, x + 40, h);
      g.stroke();
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '30,15,5' : '140,95,55'},${r() * 0.18})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // Wrapping seam
    g.strokeStyle = 'rgba(30,15,6,0.5)';
    g.lineWidth = 1.5;
    for (let k = -1; k < 3; k++) {
      g.beginPath();
      g.moveTo(0, k * 90);
      g.lineTo(w, k * 90 + 110);
      g.stroke();
    }
  });

const bandTex = () =>
  canvasTex('cigarband', 256, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#6e0f14');
    grad.addColorStop(0.5, '#a3161f');
    grad.addColorStop(1, '#6e0f14');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9b25a';
    g.fillRect(0, 4, w, 5);
    g.fillRect(0, h - 9, w, 5);
    g.font = '700 26px "Playfair Display", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) {
      g.fillStyle = '#f3d98a';
      g.fillText('PC', w * (0.25 + i * 0.5), h / 2 + 1);
      g.beginPath();
      g.arc(w * (0.5 + i * 0.5) - w * 0.001, h / 2, 5, 0, TAU);
      g.fill();
    }
  });

const ashTex = () =>
  canvasTex('ash', 128, 128, (g, w, h) => {
    const r = rng(29);
    g.fillStyle = '#8c8781';
    g.fillRect(0, 0, w, h);
    // Ash rings along the length
    for (let y = 0; y < h; y += 3 + r() * 6) {
      g.fillStyle = `rgba(${r() < 0.5 ? '60,58,55' : '200,196,190'},${0.2 + r() * 0.35})`;
      g.fillRect(0, y, w, 1 + r() * 2);
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '40,38,36' : '230,226,220'},${r() * 0.35})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
    }
  });

// Glowing tip: dark ash with glowing cracks (as an emissive map)
const emberTex = () =>
  canvasTex('ember', 128, 128, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,120,30,0.9)');
    grad.addColorStop(0.7, 'rgba(255,70,10,0.5)');
    grad.addColorStop(1, 'rgba(255,60,0,0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 2 + r() * 6, 0, TAU);
      g.fill();
    }
  });

const ashBedTex = () =>
  canvasTex('ashbed', 128, 128, (g, w, h) => {
    const r = rng(53);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * w * 0.42;
      g.fillStyle = `rgba(${r() < 0.6 ? '150,146,140' : '70,68,64'},${0.3 + r() * 0.5})`;
      g.fillRect(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1 + r() * 3, 1 + r() * 2);
    }
  });

const screenTex = () =>
  canvasTex('vapescreen', 128, 72, (g, w, h) => {
    g.fillStyle = '#02040a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7fe8ff';
    g.font = '700 30px Inter, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('80W', 10, 30);
    g.font = '500 13px Inter, sans-serif';
    g.fillStyle = '#ff6ad5';
    g.fillText('0.15Ω', 10, 58);
    g.strokeStyle = '#7fe8ff';
    g.lineWidth = 2;
    g.strokeRect(84, 44, 32, 16);
    g.fillStyle = '#7fe8ff';
    g.fillRect(87, 47, 22, 10);
  });

const orangeTex = () =>
  canvasTex('orangeslice', 128, 128, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#f08a12';
    g.beginPath();
    g.arc(c, c, 62, 0, TAU);
    g.fill();
    g.fillStyle = '#fff1d0';
    g.beginPath();
    g.arc(c, c, 54, 0, TAU);
    g.fill();
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * TAU + 0.05;
      const a1 = ((i + 1) / 10) * TAU - 0.05;
      g.fillStyle = i % 2 ? '#ffae2b' : '#ffa01c';
      g.beginPath();
      g.moveTo(c + Math.cos((a0 + a1) / 2) * 5, c + Math.sin((a0 + a1) / 2) * 5);
      g.arc(c, c, 50, a0, a1);
      g.closePath();
      g.fill();
    }
  });

const umbrellaTex = () =>
  canvasTex('umbrella', 256, 64, (g, w, h) => {
    const cols = ['#ff4f8b', '#ffd23f', '#3fd7ff', '#8cff5a'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, h - 6, w, 6);
  });

// ------------------------------------------------------------ Materials

// Glass: barely visible face-on, more visible towards the edges (Fresnel)
function glassMaterial({ color = 0xffffff, opacity = 0.1, edge = 0.7, flat = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity,
    envMapIntensity: 2.6,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    side: THREE.DoubleSide,
    depthWrite: false,
    flatShading: flat,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.edgeAlpha = { value: edge };
    sh.fragmentShader =
      'uniform float edgeAlpha;\n' +
      sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);
        gl_FragColor.a = mix(opacity, edgeAlpha, fres);`,
      );
  };
  m.customProgramCacheKey = () => 'glass-fresnel';
  return m;
}

const liquidMaterial = (color, opacity = 0.86, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
    ...extra,
  });

const metal = (color, roughness = 0.3) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.5 });

function mesh(geo, mat, { shadow = true, order = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (order) m.renderOrder = order;
  return m;
}

// ------------------------------------------------------------ Smoke / vapour

class Puffs {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.live = [];
    this.pool = [];
  }

  spawn({ pos, vel, size = 0.1, grow = 0.6, life = 3, alpha = 0.3, color = 0xffffff, drag = 0.6, lift = 0.05 }) {
    if (this.live.length > 320) return;
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(Math.floor(Math.random() * 3)), transparent: true, depthWrite: false, opacity: 0 }));
      s.renderOrder = ORDER.smoke;
    }
    s.material.color.set(color);
    s.material.rotation = Math.random() * TAU;
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.group.add(s);
    this.live.push({ s, vel: vel.clone(), size, grow, life, alpha, drag, lift, age: 0, spin: (Math.random() - 0.5) * 0.8, ph: Math.random() * TAU });
  }

  update(dt, t) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.group.remove(p.s);
        this.pool.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y += p.lift * dt;
      // slight turbulence
      p.vel.x += Math.sin(t * 1.3 + p.ph) * 0.05 * dt;
      p.vel.z += Math.cos(t * 1.1 + p.ph * 1.7) * 0.05 * dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size + p.grow * ease.outCubic(k));
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = p.alpha * Math.min(1, k / 0.12) * (1 - k) ** 1.6;
    }
  }

  clear() {
    for (const p of this.live) {
      this.group.remove(p.s);
      this.pool.push(p.s);
    }
    this.live = [];
  }
}

// ------------------------------------------------------------ Gadgets

class Gadget {
  constructor(fx, hitRadius, hitHeight) {
    this.fx = fx;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // scaled when it appears
    this.group.add(this.body);
    this.at = Infinity; // seconds since the last click
    this.acc = 0;
    this.idleAcc = 0;
    // invisible click target
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(hitRadius, hitRadius, hitHeight, 16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    hit.position.y = hitHeight / 2;
    this.hit = hit;
    this.group.add(hit);
  }

  // Emit at a fixed rate independent of the frame rate
  emit(rate, dt, key, fn) {
    this[key] += rate * dt;
    while (this[key] >= 1) {
      this[key] -= 1;
      fn();
    }
  }

  worldPos(obj, out = new THREE.Vector3()) {
    return obj.getWorldPosition(out);
  }

  dispose() {
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) m.dispose();
    });
  }
}

// Cigar in an ashtray: the ember glows up, then thick smoke rises
class Cigar extends Gadget {
  constructor(fx) {
    super(fx, 0.44, 0.35);
    const b = this.body;
    const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x0e0f11, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
    const tray = [
      [0, 0], [0.33, 0], [0.36, 0.025], [0.375, 0.1], [0.355, 0.118], [0.3, 0.118], [0.265, 0.07], [0.2, 0.048], [0, 0.046],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(mesh(new THREE.LatheGeometry(tray, 56), ceramic));
    const rim = mesh(new THREE.TorusGeometry(0.328, 0.007, 8, 72), metal(0xd4a84a, 0.25), { shadow: false });
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.119;
    b.add(rim);
    const ash = mesh(
      new THREE.CircleGeometry(0.2, 32),
      new THREE.MeshStandardMaterial({ map: ashBedTex(), transparent: true, roughness: 1, depthWrite: false }),
      { shadow: false },
    );
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 0.048;
    b.add(ash);

    // Cigar built along +y, then laid down
    const L = 0.68;
    const R = 0.052;
    const ashLen = 0.09;
    const stick = new THREE.Group();
    const tob = [
      [0, ashLen], [R, ashLen], [R, L - 0.07], [R * 0.9, L - 0.025], [R * 0.55, L - 0.004], [0, L],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const tobMat = new THREE.MeshStandardMaterial({ map: tobaccoTex(), roughness: 0.78, bumpMap: tobaccoTex(), bumpScale: 0.6 });
    stick.add(mesh(new THREE.LatheGeometry(tob, 28), tobMat));
    const ashM = mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.9, ashLen, 24), new THREE.MeshStandardMaterial({ map: ashTex(), roughness: 1 }));
    ashM.position.y = ashLen / 2;
    stick.add(ashM);
    this.ember = new THREE.MeshStandardMaterial({ color: 0x1a0600, emissive: 0xff4a10, emissiveIntensity: 1, roughness: 1 });
    const ring = mesh(new THREE.CylinderGeometry(R * 1.01, R * 0.99, 0.02, 28, 1, true), this.ember, { shadow: false });
    ring.position.y = ashLen;
    stick.add(ring);
    this.tip = new THREE.MeshStandardMaterial({ color: 0x3a3632, emissive: 0xff5a18, emissiveMap: emberTex(), emissiveIntensity: 0.3, roughness: 1 });
    const cap = mesh(new THREE.CircleGeometry(R * 0.9, 24), this.tip, { shadow: false });
    cap.rotation.x = Math.PI / 2;
    cap.position.y = -0.001;
    stick.add(cap);
    const band = mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.075, 28, 1, true), new THREE.MeshStandardMaterial({ map: bandTex(), roughness: 0.4, metalness: 0.2 }));
    band.position.y = L * 0.78;
    stick.add(band);
    stick.rotation.z = -Math.PI / 2; // +y -> +x
    const cig = new THREE.Group();
    cig.add(stick);
    cig.position.set(-0.12, 0.112, -0.02);
    cig.rotation.set(0, 0.32, -0.04);
    b.add(cig);
    this.emitter = new THREE.Object3D();
    this.emitter.position.set(0, 0.02, 0);
    stick.add(this.emitter);

    this.light = new THREE.PointLight(0xff7a2a, 0, 1.6, 2);
    this.light.position.set(0, 0.06, 0);
    stick.add(this.light);
  }

  play(seed, vol) {
    // clicking again: keep glowing instead of starting over
    this.at = this.at < 3 ? Math.min(this.at, 0.45) : 0;
    this.r = rng(seed);
    sfx.cigar(vol);
  }

  update(dt, t) {
    this.at += dt;
    const at = this.at;
    const g = at < 0.45 ? ease.outCubic(at / 0.45) : at < 1.4 ? 1 : Math.max(0, 1 - (at - 1.4) / 1.8);
    const flicker = 0.82 + 0.18 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1);
    const idle = 0.55 + 0.3 * Math.sin(t * 1.3) * Math.sin(t * 0.47);
    this.ember.emissiveIntensity = idle + 9 * g * flicker;
    this.ember.emissive.setRGB(1, 0.29 + 0.35 * g * flicker, 0.06 + 0.1 * g);
    this.tip.emissiveIntensity = 0.25 + 3.2 * g * flicker;
    this.light.intensity = 0.04 + 1.1 * g * flicker;
    const pos = this.worldPos(this.emitter, _v);
    // thin wisp while idle
    this.emit(2.6, dt, 'idleAcc', () =>
      this.fx.spawn({
        pos,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.2 + Math.random() * 0.06, (Math.random() - 0.5) * 0.03),
        size: 0.05,
        grow: 0.35,
        life: 4,
        alpha: 0.16,
        color: 0xd6d9de,
        drag: 0.1,
        lift: 0.02,
      }),
    );
    if (at > 0.3 && at < 3.1) {
      const rate = at < 1.6 ? 16 : 16 * (1 - (at - 1.6) / 1.5);
      this.emit(rate, dt, 'acc', () =>
        this.fx.spawn({
          pos,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.22 + Math.random() * 0.22, (Math.random() - 0.5) * 0.3),
          size: 0.12,
          grow: 1.0 + Math.random() * 0.7,
          life: 3.2 + Math.random() * 1.6,
          alpha: 0.6,
          color: 0xe4e6ea,
          drag: 0.45,
          lift: 0.08,
        }),
      );
    }
  }
}

// Vape: LEDs cycle through the rainbow, colourful vapour clouds
class Vape extends Gadget {
  constructor(fx) {
    super(fx, 0.26, 0.8);
    const b = this.body;
    const gun = new THREE.MeshPhysicalMaterial({ color: 0x2a2d33, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const W = 0.28;
    const H = 0.42;
    const D = 0.15;
    const body = mesh(new RoundedBoxGeometry(W, H, D, 4, 0.04), gun);
    body.position.y = H / 2;
    b.add(body);
    // Display + fire button on the front (facing the player)
    const screen = mesh(new THREE.PlaneGeometry(0.15, 0.084), new THREE.MeshBasicMaterial({ map: screenTex(), toneMapped: false }), { shadow: false });
    screen.position.set(0, 0.29, D / 2 + 0.001);
    b.add(screen);
    const fire = mesh(new RoundedBoxGeometry(0.1, 0.05, 0.02, 2, 0.008), metal(0x9aa3ad, 0.2));
    fire.position.set(0, 0.14, D / 2);
    b.add(fire);

    // RGB light strips all around
    this.leds = [];
    const led = (geo, x, y, z, ry, off) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const o = mesh(geo, m, { shadow: false });
      o.position.set(x, y, z);
      o.rotation.y = ry;
      b.add(o);
      this.leds.push({ m, off });
    };
    const strip = new THREE.BoxGeometry(0.016, 0.34, 0.012);
    led(strip, -W / 2 + 0.03, H / 2, D / 2 - 0.002, 0, 0);
    led(strip.clone(), W / 2 - 0.03, H / 2, D / 2 - 0.002, 0, 0.5);
    led(strip.clone(), -W / 2 + 0.03, H / 2, -D / 2 + 0.002, 0, 0.25);
    led(strip.clone(), W / 2 - 0.03, H / 2, -D / 2 + 0.002, 0, 0.75);
    const side = new THREE.PlaneGeometry(0.08, 0.3);
    led(side, W / 2 + 0.001, H / 2, 0, Math.PI / 2, 0.33);
    led(side.clone(), -W / 2 - 0.001, H / 2, 0, -Math.PI / 2, 0.66);

    // Atomizer on top
    const base = mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.035, 32), metal(0xb8c0c8, 0.22));
    base.position.y = H + 0.017;
    b.add(base);
    const ringGeo = new THREE.TorusGeometry(0.079, 0.006, 8, 48);
    led(ringGeo, 0, H + 0.004, 0, 0, 0.1);
    this.leds[this.leds.length - 1].ring = true;
    b.children[b.children.length - 1].rotation.x = Math.PI / 2;
    const tankY = H + 0.035;
    const liquid = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.1, 32), liquidMaterial(0x9b5cff, 0.75, { emissive: 0x2a0a55 }), { order: ORDER.liquid });
    liquid.position.y = tankY + 0.05;
    b.add(liquid);
    const chimney = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12), metal(0xc8cdd2, 0.25));
    chimney.position.y = tankY + 0.08;
    b.add(chimney);
    const tank = mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.16, 36, 1, true), glassMaterial({ opacity: 0.12, edge: 0.75 }), { shadow: false, order: ORDER.glass });
    tank.position.y = tankY + 0.08;
    b.add(tank);
    const top = mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.035, 32), metal(0xb8c0c8, 0.22));
    top.position.y = tankY + 0.177;
    b.add(top);
    const drip = mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.07, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xd0206a, roughness: 0.15, clearcoat: 1, envMapIntensity: 1.4 }),
    );
    drip.position.y = tankY + 0.23;
    b.add(drip);
    this.emitter = new THREE.Object3D();
    this.emitter.position.y = tankY + 0.27;
    b.add(this.emitter);

    this.light = new THREE.PointLight(0xffffff, 0, 1.8, 2);
    this.light.position.set(0, 0.25, 0);
    b.add(this.light);
    this.hue = Math.random();
    this.vHue = Math.random();
    this.color = new THREE.Color();
  }

  play(seed, vol) {
    this.at = this.at < 2.6 ? Math.min(this.at, 0.2) : 0;
    this.r = rng(seed);
    sfx.vape(vol);
  }

  update(dt, t) {
    this.at += dt;
    const at = this.at;
    const g = at < 0.15 ? at / 0.15 : at < 2.6 ? 1 : Math.max(0, 1 - (at - 2.6) / 0.9);
    this.hue = (this.hue + dt * (0.035 + 1.3 * g)) % 1;
    // The vapour changes colour more slowly than the LEDs, otherwise it all mixes into pastel grey
    this.vHue = (this.vHue + dt * 0.3) % 1;
    const bright = 0.28 + 0.12 * Math.sin(t * 1.8) + 0.72 * g;
    for (const l of this.leds) {
      l.m.color.setHSL((this.hue + l.off) % 1, 1, 0.5).multiplyScalar(bright * (l.ring ? 1.3 : 1));
    }
    this.light.color.setHSL(this.hue, 1, 0.55);
    this.light.intensity = 0.03 + 1.4 * g;
    if (at > 0.12 && at < 2.4) {
      const pos = this.worldPos(this.emitter, _v);
      const rate = at < 0.4 ? 40 : 20;
      this.emit(rate, dt, 'acc', () =>
        this.fx.spawn({
          pos,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.22 + Math.random() * 0.25, (Math.random() - 0.5) * 0.9),
          size: 0.16,
          grow: 1.1 + Math.random() * 0.8,
          life: 3 + Math.random() * 1.6,
          alpha: 0.7,
          color: this.color.setHSL((this.vHue + Math.random() * 0.06) % 1, 1, 0.52).getHex(),
          drag: 1.1,
          lift: 0.09,
        }),
      );
    }
  }
}

// Swirling like at a bar: the base circles and the glass leans into the motion
class Swirl {
  constructor(radius, tilt, speed) {
    this.radius = radius;
    this.tilt = tilt;
    this.speed = speed;
    this.amp = 0;
    this.phase = 0;
    this.dir = new THREE.Vector3();
    this.axis = new THREE.Vector3();
  }

  update(dt, active, obj) {
    this.amp += ((active ? 1 : 0) - this.amp) * Math.min(1, dt * 3.2);
    if (this.amp < 0.001) {
      this.amp = 0;
      obj.position.set(0, 0, 0);
      obj.quaternion.identity();
      return;
    }
    this.phase += dt * TAU * this.speed;
    const r = this.radius * this.amp;
    obj.position.set(Math.cos(this.phase) * r, 0, Math.sin(this.phase) * r);
    this.dir.set(-Math.sin(this.phase), 0, Math.cos(this.phase));
    this.axis.crossVectors(UP, this.dir).normalize();
    obj.quaternion.setFromAxisAngle(this.axis, this.tilt * this.amp);
  }

  // Tilt of the liquid surface relative to the glass (lags behind the motion)
  slosh(surface, glass, amount) {
    const lag = this.phase - 1.1;
    this.dir.set(-Math.sin(lag), 0, Math.cos(lag));
    this.axis.crossVectors(UP, this.dir).normalize();
    _q.setFromAxisAngle(this.axis, -amount * this.amp);
    surface.quaternion.copy(glass.quaternion).invert().multiply(_q);
  }
}

// Fancy cocktail: martini glass with a sunrise gradient, orange slice, cherry and umbrella
class Cocktail extends Gadget {
  constructor(fx) {
    super(fx, 0.34, 0.62);
    const glass = new THREE.Group();
    this.glass = glass;
    this.body.add(glass);
    const prof = [
      [0, 0], [0.17, 0], [0.172, 0.01], [0.04, 0.024], [0.02, 0.05], [0.017, 0.28], [0.028, 0.3], [0.295, 0.565], [0.3, 0.57],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    glass.add(mesh(new THREE.LatheGeometry(prof, 48), glassMaterial({ opacity: 0.1, edge: 0.8 }), { shadow: false, order: ORDER.glass }));
    const rim = mesh(new THREE.TorusGeometry(0.297, 0.004, 6, 64), glassMaterial({ opacity: 0.5, edge: 0.9 }), { shadow: false, order: ORDER.glass });
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.568;
    glass.add(rim);

    // Liquid: cone with a gradient from grenadine red to orange
    const level = 0.5;
    const rTop = 0.028 + ((level - 0.3) / 0.265) * 0.267 - 0.008;
    const liqGeo = new THREE.LatheGeometry(
      [[0, 0.305], [0.026, 0.305], [rTop, level], [0, level]].map(([x, y]) => new THREE.Vector2(x, y)),
      40,
    );
    const pos = liqGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(0xc2102a);
    const hi = new THREE.Color(0xffa21f);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.lerpColors(lo, hi, THREE.MathUtils.smoothstep(pos.getY(i), 0.36, 0.5));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    liqGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const liq = mesh(liqGeo, liquidMaterial(0xffffff, 0.9, { vertexColors: true, emissive: 0x3a0800 }), { order: ORDER.liquid });
    glass.add(liq);
    this.surface = new THREE.Group();
    this.surface.position.y = level + 0.001;
    const surf = mesh(new THREE.CircleGeometry(rTop * 0.94, 40), liquidMaterial(0xffb347, 0.92, { emissive: 0x552200 }), { shadow: false, order: ORDER.liquid });
    surf.rotation.x = -Math.PI / 2;
    this.surface.add(surf);
    glass.add(this.surface);

    // Orange slice on the rim
    const sliceMat = new THREE.MeshStandardMaterial({ map: orangeTex(), roughness: 0.5 });
    const rind = new THREE.MeshStandardMaterial({ color: 0xf08a12, roughness: 0.55 });
    const slice = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 36), [rind, sliceMat, sliceMat]);
    // The slice stands upright on the rim (axis tangential to the rim)
    slice.rotation.order = 'YXZ';
    slice.rotation.set(Math.PI / 2, 0.5, 0);
    slice.position.set(Math.cos(-0.5) * 0.29, 0.6, Math.sin(-0.5) * 0.29);
    glass.add(slice);

    // Cherry on a pick
    const pick = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.36, 6), metal(0xd4a84a, 0.3));
    pick.position.set(-0.05, 0.52, 0.06);
    pick.rotation.set(0.35, 0, 0.5);
    glass.add(pick);
    const cherry = mesh(new THREE.SphereGeometry(0.04, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0x8a0012, roughness: 0.18, clearcoat: 1, envMapIntensity: 1.5 }));
    cherry.position.set(0.03, 0.515, 0.03);
    glass.add(cherry);

    // Cocktail umbrella
    const umb = new THREE.Group();
    const canopy = mesh(
      new THREE.ConeGeometry(0.13, 0.055, 8, 1, true),
      new THREE.MeshStandardMaterial({ map: umbrellaTex(), roughness: 0.8, side: THREE.DoubleSide }),
    );
    canopy.position.y = 0.28;
    umb.add(canopy);
    const shaft = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.7 }));
    shaft.position.y = 0.16;
    umb.add(shaft);
    umb.position.set(0.08, 0.4, -0.1);
    umb.rotation.set(-0.35, 0, -0.45);
    this.canopy = canopy;
    glass.add(umb);

    this.swirl = new Swirl(0.05, 0.12, 1.25);
  }

  play(seed, vol) {
    this.at = this.at < 2.6 ? Math.min(this.at, 0.3) : 0;
    sfx.slosh(vol);
  }

  update(dt) {
    this.at += dt;
    this.swirl.update(dt, this.at < 2.6, this.glass);
    this.swirl.slosh(this.surface, this.glass, 0.1);
    this.canopy.rotation.y += dt * this.swirl.amp * 7;
  }
}

// Whiskey on the rocks: crystal tumbler, ice cubes clink when swirled
class Whiskey extends Gadget {
  constructor(fx) {
    super(fx, 0.33, 0.55);
    const glass = new THREE.Group();
    this.glass = glass;
    this.body.add(glass);
    const prof = [
      [0, 0], [0.25, 0], [0.265, 0.015], [0.282, 0.5], [0.27, 0.506], [0.257, 0.49], [0.244, 0.11], [0.2, 0.092], [0, 0.09],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    // few segments + flat shading = cut crystal
    glass.add(mesh(new THREE.LatheGeometry(prof, 12), glassMaterial({ color: 0xf4f8ff, opacity: 0.12, edge: 0.75, flat: true }), { shadow: false, order: ORDER.glass }));
    const liq = mesh(
      new THREE.CylinderGeometry(0.226, 0.215, 0.16, 36),
      liquidMaterial(0x8a3f0a, 0.88, { emissive: 0x2a0c00, roughness: 0.08 }),
      { order: ORDER.liquid },
    );
    liq.position.y = 0.093 + 0.08;
    glass.add(liq);

    this.ice = new THREE.Group();
    this.ice.position.y = 0.25;
    const iceMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf6ff,
      roughness: 0.12,
      transparent: true,
      opacity: 0.6,
      clearcoat: 1,
      envMapIntensity: 2.2,
      emissive: 0x2a3a46,
    });
    this.cubes = [];
    for (let i = 0; i < 3; i++) {
      const s = 0.135 - i * 0.008;
      const cube = mesh(new RoundedBoxGeometry(s, s, s, 3, 0.028), iceMat.clone(), { shadow: false, order: ORDER.ice });
      const a = (i / 3) * TAU + 0.4;
      cube.userData.home = new THREE.Vector3(Math.cos(a) * 0.085, (i - 1) * 0.012, Math.sin(a) * 0.085);
      cube.userData.rot = new THREE.Euler(0.3 + i * 0.7, i * 1.3, 0.2 + i * 0.4);
      cube.userData.ph = i * 2.1;
      cube.position.copy(cube.userData.home);
      cube.rotation.copy(cube.userData.rot);
      this.ice.add(cube);
      this.cubes.push(cube);
    }
    glass.add(this.ice);
    this.swirl = new Swirl(0.035, 0.08, 1.5);
    this.clinks = [];
  }

  play(seed, vol) {
    this.at = this.at < 2.4 ? Math.min(this.at, 0.3) : 0;
    const r = rng(seed);
    // Clink sequence: dense at first, then sparser and quieter
    this.clinks = [];
    let t = 0.06;
    for (let i = 0; i < 9 && t < 2.3; i++) {
      this.clinks.push({ t: this.at + t, v: vol * (1 - i * 0.08), kind: r() < 0.55 ? 'glass' : 'ice', pitch: 0.85 + r() * 0.35 });
      t += 0.09 + r() * 0.26 + i * 0.02;
    }
  }

  update(dt, t) {
    this.at += dt;
    this.swirl.update(dt, this.at < 2.4, this.glass);
    const amp = this.swirl.amp;
    // The ice circles in the glass and wobbles
    this.ice.rotation.y += dt * amp * 5.5;
    for (const c of this.cubes) {
      const { home, rot, ph } = c.userData;
      c.position.set(home.x * (1 + amp * 0.25), home.y + Math.sin(t * 9 + ph) * 0.012 * amp, home.z * (1 + amp * 0.25));
      c.rotation.set(rot.x + Math.sin(t * 7 + ph) * 0.25 * amp, rot.y, rot.z + Math.cos(t * 6 + ph) * 0.25 * amp);
    }
    while (this.clinks.length && this.at >= this.clinks[0].t) {
      const k = this.clinks.shift();
      sfx.clink(k.v, k.kind, k.pitch);
    }
  }
}

const KINDS = { cigar: Cigar, vape: Vape, cocktail: Cocktail, whiskey: Whiskey };

// ------------------------------------------------------------ Management + input

export class Gadgets {
  constructor({ stage, send, socket }) {
    this.stage = stage;
    this.send = send;
    this.items = Array.from({ length: MAX_SEATS }, () => null);
    this.n = 5;
    this.mySeat = undefined;
    this.fx = new Puffs(stage.scene);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.lastPlay = 0;
    this.lastHover = 0;
    this.first = true;
    const el = stage.renderer.domElement;
    this.el = el;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.#pick(e)) return;
      e.preventDefault();
      this.#playMine();
    });
    el.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (e.buttons || now - this.lastHover < 60) return;
      this.lastHover = now;
      const want = this.#pick(e) ? 'pointer' : '';
      if (want || el.style.cursor === 'pointer') el.style.cursor = want;
    });
    socket.on('gadget', (d) => {
      if (document.hidden || d?.seat === this.mySeat) return;
      this.items[d.seat]?.play(d.seed, REMOTE_VOLUME);
    });
    this.lastT = performance.now();
    stage.onFrame.push((t) => this.#frame(t));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.fx.clear();
    });
  }

  update(state) {
    const relayout = state.mySeat !== this.mySeat || state.seats.length !== this.n;
    this.mySeat = state.mySeat;
    this.n = state.seats.length;
    this.items.forEach((_, i) => {
      const s = state.seats[i];
      const kind = (s && KINDS[s.gadget] && s.gadget) || null;
      const cur = this.items[i];
      if ((cur?.kind ?? null) === kind) return;
      if (cur) {
        this.stage.scene.remove(cur.group);
        cur.dispose();
        this.items[i] = null;
      }
      if (!kind) return;
      const g = new KINDS[kind](this.fx);
      g.kind = kind;
      this.items[i] = g;
      this.#place(i);
      this.stage.scene.add(g.group);
      // pop in briefly
      if (!this.first) {
        g.body.scale.setScalar(0.01);
        tween({ duration: 450, easing: ease.outBack, update: (k) => g.body.scale.setScalar(Math.max(0.01, k)) });
      }
    });
    this.first = false;
    if (relayout) this.relayout();
  }

  relayout() {
    for (let i = 0; i < MAX_SEATS; i++) if (this.items[i]) this.#place(i);
  }

  #place(i) {
    const me = this.mySeat != null && this.mySeat === i;
    const pos = (i - (this.mySeat ?? 0) + this.n) % this.n;
    const a = gadgetAnchor(pos, me ? 2.45 : 1.9, this.n);
    const g = this.items[i].group;
    g.scale.setScalar(GADGET_SCALE);
    g.position.copy(a.pos);
    g.rotation.y = a.yaw;
  }

  #pick(e) {
    const g = this.mySeat != null ? this.items[this.mySeat] : null;
    if (!g) return false;
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    return this.raycaster.intersectObject(g.hit, false).length > 0;
  }

  #playMine() {
    const now = performance.now();
    if (now - this.lastPlay < 450) return;
    this.lastPlay = now;
    this.items[this.mySeat]?.play(Math.floor(Math.random() * 2 ** 31), 1);
    this.send('gadget-play');
  }

  #frame(t) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    for (const g of this.items) g?.update(dt, t);
    this.fx.update(dt, t);
  }
}
