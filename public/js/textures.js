// Procedurally generated canvas textures for the table, chips and cards.
import * as THREE from 'three';

const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const SANS = 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

let maxAniso = 8;
export function setMaxAnisotropy(n) {
  maxAniso = n;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

// Deterministic randomness
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function addNoise(ctx, w, h, amount, seed = 7, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += mono ? n : (r() - 0.5) * amount;
    d[i + 2] += mono ? n : (r() - 0.5) * amount;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- Suit symbols

export function suitPath(ctx, suit, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  switch (suit) {
    case 'h':
      ctx.moveTo(0, 0.46);
      ctx.bezierCurveTo(-0.12, 0.3, -0.5, 0.08, -0.5, -0.17);
      ctx.bezierCurveTo(-0.5, -0.42, -0.19, -0.52, 0, -0.26);
      ctx.bezierCurveTo(0.19, -0.52, 0.5, -0.42, 0.5, -0.17);
      ctx.bezierCurveTo(0.5, 0.08, 0.12, 0.3, 0, 0.46);
      break;
    case 'd':
      ctx.moveTo(0, -0.52);
      ctx.quadraticCurveTo(0.2, -0.24, 0.4, 0);
      ctx.quadraticCurveTo(0.2, 0.24, 0, 0.52);
      ctx.quadraticCurveTo(-0.2, 0.24, -0.4, 0);
      ctx.quadraticCurveTo(-0.2, -0.24, 0, -0.52);
      break;
    case 's':
      ctx.moveTo(0, -0.52);
      ctx.bezierCurveTo(0.12, -0.34, 0.5, -0.14, 0.5, 0.1);
      ctx.bezierCurveTo(0.5, 0.36, 0.2, 0.44, 0.05, 0.26);
      ctx.quadraticCurveTo(0.08, 0.42, 0.22, 0.52);
      ctx.lineTo(-0.22, 0.52);
      ctx.quadraticCurveTo(-0.08, 0.42, -0.05, 0.26);
      ctx.bezierCurveTo(-0.2, 0.44, -0.5, 0.36, -0.5, 0.1);
      ctx.bezierCurveTo(-0.5, -0.14, -0.12, -0.34, 0, -0.52);
      break;
    case 'c': {
      const lobe = (cx, cy) => {
        ctx.moveTo(cx + 0.235, cy);
        ctx.arc(cx, cy, 0.235, 0, Math.PI * 2);
      };
      lobe(0, -0.24);
      lobe(-0.26, 0.08);
      lobe(0.26, 0.08);
      ctx.moveTo(-0.12, -0.05);
      ctx.lineTo(0.12, -0.05);
      ctx.lineTo(0.12, 0.14);
      ctx.lineTo(-0.12, 0.14);
      ctx.closePath();
      ctx.moveTo(0.05, 0.12);
      ctx.quadraticCurveTo(0.08, 0.42, 0.22, 0.52);
      ctx.lineTo(-0.22, 0.52);
      ctx.quadraticCurveTo(-0.08, 0.42, -0.05, 0.12);
      ctx.closePath();
      break;
    }
  }
  ctx.restore();
}

export function drawSuit(ctx, suit, x, y, s, color, flip = false) {
  ctx.save();
  if (flip) {
    ctx.translate(x, y);
    ctx.rotate(Math.PI);
    x = 0;
    y = 0;
  }
  suitPath(ctx, suit, x, y, s);
  ctx.fillStyle = color;
  ctx.fill('nonzero');
  ctx.restore();
}

// ---------------------------------------------------------------- Table

export const TABLE = {
  a: 5.0, // half length of the straight section
  r: 4.2, // radius of the rounded ends (felt)
  race: 0.6, // wooden racetrack
  rail: 1.25, // padded rail
};
export const FELT_W = 2 * (TABLE.a + TABLE.r);
export const FELT_D = 2 * TABLE.r;

function stadiumPath(ctx, cx, cy, a, r) {
  ctx.beginPath();
  ctx.moveTo(cx - a, cy - r);
  ctx.lineTo(cx + a, cy - r);
  ctx.arc(cx + a, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - a, cy + r);
  ctx.arc(cx - a, cy, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
}

// The print is fixed to the table: in portrait it rotates with the table (like board and pot).
// `title` is the tournament name printed between the board and your own seat.
export const FELT_COLORS = { green: '#0f6b43', red: '#6c1219', blue: '#123f6e' };
export function feltTexture(title = 'PokerCrew', felt = 'green') {
  const color = FELT_COLORS[felt] || FELT_COLORS.green;
  const W = 2048;
  const H = Math.round((W * FELT_D) / FELT_W);
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const k = W / FELT_W; // pixels per unit
  const cx = W / 2;
  const cy = H / 2;

  const base = new THREE.Color(color);
  const light = base.clone().offsetHSL(0, 0.02, 0.07).getStyle();
  const dark = base.clone().offsetHSL(0, -0.05, -0.12).getStyle();
  const g = ctx.createRadialGradient(cx, cy * 0.95, H * 0.05, cx, cy, W * 0.55);
  g.addColorStop(0, light);
  g.addColorStop(0.55, base.getStyle());
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Betting line (follows the table shape, so local)
  ctx.save();
  stadiumPath(ctx, cx, cy, TABLE.a * k, (TABLE.r - 1.95) * k);
  ctx.strokeStyle = 'rgba(236, 214, 150, 0.30)';
  ctx.lineWidth = 3;
  ctx.stroke();
  stadiumPath(ctx, cx, cy, TABLE.a * k, (TABLE.r - 2.05) * k);
  ctx.strokeStyle = 'rgba(236, 214, 150, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // From here on in table coordinates (1 = one table unit)
  ctx.save();
  ctx.setTransform(k, 0, 0, k, cx, cy);

  // Card slots for the board
  ctx.strokeStyle = 'rgba(236, 214, 150, 0.16)';
  ctx.lineWidth = 2.5 / k;
  for (let i = 0; i < 5; i++) {
    roundRect(ctx, (i - 2) * 1.14 - 0.54, BOARD_Z - 0.74, 1.08, 1.48, 0.1);
    ctx.stroke();
  }

  // Tournament name between the board and your own seat, framed by suit symbols.
  // Long names get a smaller font so name + suits stay within the width of the board.
  ctx.save();
  ctx.translate(0, 1.12);
  ctx.scale(1 / k, 1 / k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 0.5 * k;
  ctx.font = `italic 700 ${size}px ${SERIF}`;
  const maxW = 5.2 * k;
  const w0 = ctx.measureText(title).width;
  if (w0 > maxW) {
    size = Math.max(0.24 * k, (size * maxW) / w0);
    ctx.font = `italic 700 ${size}px ${SERIF}`;
  }
  const tw = ctx.measureText(title).width;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillText(title, 3, 4);
  ctx.fillStyle = 'rgba(240, 222, 170, 0.26)';
  ctx.fillText(title, 0, 0);
  const sz = Math.min(0.26 * k, size * 0.55);
  ['s', 'h'].forEach((su, i) => drawSuit(ctx, su, -tw / 2 - sz * 1.15 - i * sz * 1.3, 0, sz, 'rgba(240, 222, 170, 0.2)'));
  ['d', 'c'].forEach((su, i) => drawSuit(ctx, su, tw / 2 + sz * 1.15 + i * sz * 1.3, 0, sz, 'rgba(240, 222, 170, 0.2)'));
  ctx.restore();

  // Lettering above the pot
  ctx.save();
  ctx.translate(0, -(TABLE.r - 1.95) - 0.26);
  ctx.scale(1 / k, 1 / k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${0.17 * k}px ${SANS}`;
  ctx.letterSpacing = `${0.07 * k}px`;
  ctx.fillStyle = 'rgba(240, 222, 170, 0.22)';
  ctx.fillText("NO LIMIT TEXAS HOLD'EM", 0, 0);
  ctx.restore();
  ctx.restore();

  addNoise(ctx, W, H, 14, 3);
  return toTexture(c);
}
export const BOARD_Z = -0.25;

export function feltBumpTexture() {
  const c = canvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);
  addNoise(ctx, 512, 512, 90, 11);
  // fine fibres
  const r = rng(5);
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 2500; i++) {
    ctx.strokeStyle = r() > 0.5 ? '#fff' : '#000';
    ctx.beginPath();
    const x = r() * 512;
    const y = r() * 512;
    const a = r() * Math.PI;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
    ctx.stroke();
  }
  return toTexture(c, { srgb: false, repeat: [9, 4] });
}

export function woodTexture() {
  const W = 1024;
  const H = 1024;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const r = rng(42);
  ctx.fillStyle = '#5b2a14';
  ctx.fillRect(0, 0, W, H);
  // Grain: many slightly wavy lines
  for (let i = 0; i < 260; i++) {
    const y0 = r() * H;
    const amp = 4 + r() * 18;
    const freq = 0.002 + r() * 0.006;
    const phase = r() * 10;
    const dark = r() > 0.45;
    ctx.strokeStyle = dark ? `rgba(40, 14, 4, ${0.08 + r() * 0.25})` : `rgba(160, 82, 40, ${0.05 + r() * 0.16})`;
    ctx.lineWidth = 0.6 + r() * 3.2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase * 2) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Gloss gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,190,120,0.06)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.06)');
  g.addColorStop(1, 'rgba(255,190,120,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  addNoise(ctx, W, H, 10, 9);
  return toTexture(c, { repeat: [0.12, 0.12] });
}

// Tileable value noise (lattice wraps with `period`), summed over octaves
function tileNoise(seed, period) {
  const r = rng(seed);
  const grid = new Float32Array(period * period).map(() => r());
  const at = (x, y) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

// Polished marble for the rim: 'dark' = black with pale veins, 'light' = white with grey veins.
// Veins follow a sine pattern bent by fractal noise; both are periodic, so the texture tiles.
const marbleCache = {};
export function marbleTexture(kind) {
  if (marbleCache[kind]) return marbleCache[kind];
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const octaves = [4, 8, 16, 32, 64].map((p, i) => ({ n: tileNoise(101 + i * 17, p), w: 0.5 ** i }));
  const fbm = (u, v) => octaves.reduce((sum, o) => sum + o.n(u, v) * o.w, 0) / 1.9375;
  const dark = kind === 'dark';
  const base = dark ? [24, 25, 28] : [233, 230, 224];
  const cloud = dark ? [48, 46, 50] : [206, 204, 200];
  const veinCol = dark ? [214, 204, 186] : [122, 122, 128];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const n = fbm(u, v);
      const m = fbm(v + 0.37, u + 0.61); // second field: where veins are strong or fade out
      // vein families at different angles and scales (integer coefficients keep it tileable)
      const vein = (a, b, warp) => 1 - Math.abs(Math.sin(Math.PI * 2 * (a * u + b * v) + n * warp));
      const fine = vein(3, 1, 11) ** 18 * (0.35 + m * 0.9) + vein(1, -4, 14) ** 30 * 0.5 + vein(5, 3, 17) ** 40 * 0.35;
      const broad = vein(2, 1, 8) ** 4 * 0.22 * m;
      const k = Math.min(1, fine + broad);
      const cl = Math.min(1, Math.max(0, (n - 0.3) * 1.5));
      const i = (y * S + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const bg = base[ch] + (cloud[ch] - base[ch]) * cl;
        img.data[i + ch] = bg + (veinCol[ch] - bg) * k;
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  addNoise(ctx, S, S, 6, 5);
  return (marbleCache[kind] = toTexture(c, { repeat: [0.13, 0.13] }));
}

export function leatherBumpTexture() {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, S, S);
  const r = rng(77);
  // Leather grain: many small irregular cells
  for (let i = 0; i < 2600; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 2 + r() * 6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  addNoise(ctx, S, S, 40, 13);
  return toTexture(c, { srgb: false, repeat: [0.9, 0.9] });
}

export function carpetTexture() {
  const S = 1024;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a0c10';
  ctx.fillRect(0, 0, S, S);
  const step = S / 4;
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * step + step / 2;
      const y = j * step + step / 2;
      ctx.strokeStyle = 'rgba(200, 150, 70, 0.22)';
      ctx.beginPath();
      ctx.moveTo(x, y - step * 0.38);
      ctx.lineTo(x + step * 0.38, y);
      ctx.lineTo(x, y + step * 0.38);
      ctx.lineTo(x - step * 0.38, y);
      ctx.closePath();
      ctx.stroke();
      const suit = 'shdc'[(i + j) % 4];
      drawSuit(ctx, suit, x, y, step * 0.26, 'rgba(200, 150, 70, 0.18)');
      ctx.fillStyle = 'rgba(120, 20, 30, 0.35)';
      ctx.beginPath();
      ctx.arc(i * step, j * step, step * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  addNoise(ctx, S, S, 26, 21, false);
  return toTexture(c, { repeat: [6, 6] });
}

// ---------------------------------------------------------------- Chips

export const DENOMS = [
  { value: 100000, color: '#d4467e', accent: '#fff4c2', ink: '#8a1d4a', label: '100K' },
  { value: 25000, color: '#1f5fbf', accent: '#ffd34d', ink: '#123a78', label: '25K' },
  { value: 5000, color: '#e06d1b', accent: '#ffffff', ink: '#8d3d06', label: '5K' },
  { value: 1000, color: '#e7c11f', accent: '#1b1b1b', ink: '#6e5600', label: '1K' },
  { value: 500, color: '#6b2fa3', accent: '#ffffff', ink: '#431a6b', label: '500' },
  { value: 100, color: '#1c1c1f', accent: '#f2f2f2', ink: '#1c1c1f', label: '100' },
  { value: 25, color: '#1f8a3c', accent: '#ffffff', ink: '#135a26', label: '25' },
  { value: 5, color: '#c0262d', accent: '#ffffff', ink: '#7c1216', label: '5' },
  { value: 1, color: '#efefea', accent: '#2356b0', ink: '#2356b0', label: '1' },
];

export function chipTopTexture(d) {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const m = S / 2;
  ctx.fillStyle = d.color;
  ctx.fillRect(0, 0, S, S);

  // Edge inserts (8)
  ctx.fillStyle = d.accent;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(m, m, m, a - 0.17, a + 0.17);
    ctx.arc(m, m, m * 0.8, a + 0.17, a - 0.17, true);
    ctx.closePath();
    ctx.fill();
  }
  // Ring
  ctx.strokeStyle = d.accent;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(m, m, m * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // small diamonds between the inserts
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    ctx.save();
    ctx.translate(m + Math.cos(a) * m * 0.87, m + Math.sin(a) * m * 0.87);
    ctx.rotate(a);
    ctx.fillStyle = d.accent;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  // Inlay
  const g = ctx.createRadialGradient(m, m * 0.9, 4, m, m, m * 0.6);
  g.addColorStop(0, '#fffdf6');
  g.addColorStop(1, '#e9e2cf');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(m, m, m * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(m, m, m * 0.52, 0, Math.PI * 2);
  ctx.stroke();
  // Value
  ctx.fillStyle = d.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = d.label.length >= 4 ? 44 : d.label.length === 3 ? 50 : 62;
  ctx.font = `800 ${size}px ${SANS}`;
  ctx.fillText(d.label, m, m + 3);
  ctx.font = `700 13px ${SANS}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText('POKERCREW', m, m - 36);
  ctx.globalAlpha = 1;
  addNoise(ctx, S, S, 8, 4);
  return toTexture(c);
}

export function chipSideTexture(d) {
  const W = 512;
  const H = 32;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = d.color;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = d.accent;
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * W + W / 16;
    ctx.fillRect(x - W * 0.027, 0, W * 0.054, H);
  }
  // Darken the top/bottom edge (bevel)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.18, 'rgba(0,0,0,0)');
  g.addColorStop(0.82, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return toTexture(c);
}

// ---------------------------------------------------------------- Cards

export const CARD_W = 400;
export const CARD_H = 560;
const RED = '#d71f38';
const BLACK = '#1b1c22';
export const suitColor = (s) => (s === 'h' || s === 'd' ? RED : BLACK);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PIPS = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

const RANK_LABEL = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

// Court card figures (upper half; mirrored like real court cards)
const courtArt = {};
export function preloadCardArt() {
  const load = (r) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        courtArt[r] = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `/img/court-${r.toLowerCase()}.jpg`;
    });
  return Promise.all(['K', 'Q', 'J'].map(load));
}

const INDEX_FONT_LETTER = '"Roboto Slab", Rockwell, "Courier New", serif';
const INDEX_FONT_NUMBER = 'Inter, "Helvetica Neue", Arial, sans-serif';
const FRAME_COLOR = '#2f8fc6';

// Jumbo index layout (like Copag/Modiano poker cards): large indices in all four corners,
// thin blue frame in the middle with small pips or the court figure.
export function cardFaceCanvas(card) {
  const [r, s] = card;
  const c = canvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d');
  const W = CARD_W;
  const H = CARD_H;
  const col = suitColor(s);
  const label = RANK_LABEL[r] || r;

  ctx.fillStyle = '#fdfdfb';
  ctx.fillRect(0, 0, W, H);

  // Corner index: rank on top, suit below; the bottom one is the same rotated by 180°
  const corner = (cx) => {
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const letter = /[AKQJ]/.test(label);
    ctx.font = letter ? `700 104px ${INDEX_FONT_LETTER}` : `500 108px ${INDEX_FONT_NUMBER}`;
    ctx.save();
    ctx.translate(cx, 100);
    if (label.length > 1) ctx.scale(0.6, 1);
    ctx.fillText(label, 0, 0);
    ctx.restore();
    drawSuit(ctx, s, cx, 152, 66, col);
  };
  for (const flip of [false, true]) {
    ctx.save();
    if (flip) {
      ctx.translate(W, H);
      ctx.rotate(Math.PI);
    }
    corner(47);
    corner(W - 47);
    ctx.restore();
  }

  // Centre frame
  const fx = 92;
  const fy = 108;
  const fw = W - 184;
  const fh = H - 216;
  const art = courtArt[r];
  if (art) {
    // upper half + lower half rotated by 180°
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    const half = fh / 2;
    const scale = Math.max(fw / art.width, half / art.height);
    const dw = art.width * scale;
    const dh = art.height * scale;
    const drawHalf = () => ctx.drawImage(art, fx + (fw - dw) / 2, fy + half - dh, dw, dh);
    drawHalf();
    ctx.translate(fx + fw / 2, fy + half);
    ctx.rotate(Math.PI);
    ctx.translate(-(fx + fw / 2), -(fy + half));
    drawHalf();
    ctx.restore();
    // divider between the halves
    ctx.strokeStyle = 'rgba(20, 20, 30, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx, fy + fh / 2);
    ctx.lineTo(fx + fw, fy + fh / 2);
    ctx.stroke();
    // small suit symbols inside the frame (with a white halo for readability)
    const smallPip = (x, y, flip) => {
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      drawSuit(ctx, s, x, y, 34, col, flip);
      ctx.restore();
    };
    smallPip(fx + 22, fy + 26, false);
    smallPip(fx + fw - 22, fy + fh - 26, true);
  } else if (!PIPS[label] && r !== 'A') {
    // fallback without image: large letter
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 150px ${INDEX_FONT_LETTER}`;
    ctx.fillText(r, W / 2, H / 2);
  }

  if (PIPS[label]) {
    const box = { x: fx + fw * 0.2, y: fy + fh * 0.13, w: fw * 0.6, h: fh * 0.74 };
    for (const [px, py] of PIPS[label]) {
      drawSuit(ctx, s, box.x + px * box.w, box.y + py * box.h, 50, col, py > 0.5);
    }
  } else if (r === 'A') {
    drawSuit(ctx, s, W / 2, H / 2, 56, col);
  }

  ctx.strokeStyle = FRAME_COLOR;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(fx, fy, fw, fh);

  addNoise(ctx, W, H, 4, card.charCodeAt(0) * 7 + card.charCodeAt(1));
  return c;
}

const faceCache = new Map();
export function cardFaceTexture(card) {
  if (!faceCache.has(card)) faceCache.set(card, toTexture(cardFaceCanvas(card)));
  return faceCache.get(card);
}

let backTex = null;
export function cardBackTexture() {
  if (backTex) return backTex;
  const W = CARD_W;
  const H = CARD_H;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fbf8f0';
  ctx.fillRect(0, 0, W, H);
  const m = 22;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#8e1026');
  g.addColorStop(1, '#5a0717');
  ctx.fillStyle = g;
  roundRect(ctx, m, m, W - 2 * m, H - 2 * m, 18);
  ctx.fill();
  // Diamond lattice
  ctx.save();
  roundRect(ctx, m + 10, m + 10, W - 2 * m - 20, H - 2 * m - 20, 12);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 214, 140, 0.35)';
  ctx.lineWidth = 2;
  for (let i = -H; i < W + H; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#e6c46a';
  ctx.lineWidth = 4;
  roundRect(ctx, m + 10, m + 10, W - 2 * m - 20, H - 2 * m - 20, 12);
  ctx.stroke();
  // Medallion
  ctx.fillStyle = '#6d0a1c';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 108, 108, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#e6c46a';
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 94, 94, 0, 0, Math.PI * 2);
  ctx.stroke();
  const suits = ['s', 'h', 'c', 'd'];
  suits.forEach((s, i) => {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    drawSuit(ctx, s, W / 2 + Math.cos(a) * 52, H / 2 + Math.sin(a) * 52, 46, '#e6c46a');
  });
  ctx.font = `700 34px ${SERIF}`;
  ctx.fillStyle = '#e6c46a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PC', W / 2, H / 2 + 2);
  addNoise(ctx, W, H, 8, 99);
  backTex = toTexture(c);
  return backTex;
}

export function dealerButtonTexture() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S * 0.4, 10, S / 2, S / 2, S * 0.6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#dcd8cc');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1b1b1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 46px ${SANS}`;
  ctx.fillText('DEALER', S / 2, S / 2 + 2);
  drawSuit(ctx, 's', S / 2, S / 2 - 58, 34, '#1b1b1b');
  drawSuit(ctx, 'h', S / 2, S / 2 + 60, 34, RED);
  return toTexture(c);
}

export { roundRect };
