// Synthesized sound effects via WebAudio – no audio files needed.
let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioContext() {
  return ensure();
}

function noise(t, dur, { type = 'bandpass', freq = 3000, q = 1, gain = 0.5, attack = 0.002, sweepTo = null } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.05);
}

function tone(t, freq, dur, { type = 'sine', gain = 0.2, attack = 0.01 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Sustained noise (hiss, slosh): fade in, hold, fade out
function swell(t, dur, { type = 'bandpass', freq = 2000, sweepTo = null, q = 0.7, gain = 0.1, attack = 0.2, release = 0.4 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  muted: false,
  enabled: true,
  get ok() {
    return this.enabled && !this.muted && ensure();
  },
  chips(n = 3) {
    if (!this.ok) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.035 + Math.random() * 0.05);
      noise(t, 0.05 + Math.random() * 0.03, { freq: 3800 + Math.random() * 2500, q: 4, gain: 0.35 });
      noise(t, 0.03, { freq: 1600, q: 2, gain: 0.12 });
    }
  },
  // A single chip dropping onto the others while riffling
  tick(vol = 1) {
    if (!this.enabled || !ensure()) return;
    const t = ctx.currentTime;
    noise(t, 0.02 + Math.random() * 0.014, { freq: 3600 + Math.random() * 2800, q: 6, gain: 0.3 * vol });
    noise(t, 0.012, { type: 'highpass', freq: 6500, q: 0.7, gain: 0.07 * vol });
  },
  // Heartbeat (two dull thumps) for the dramatic river
  heartbeat() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    tone(t, 62, 0.16, { gain: 0.55, attack: 0.008 });
    noise(t, 0.06, { type: 'lowpass', freq: 180, gain: 0.35 });
    tone(t + 0.2, 54, 0.2, { gain: 0.42, attack: 0.008 });
    noise(t + 0.2, 0.06, { type: 'lowpass', freq: 160, gain: 0.28 });
  },
  // Accent when the deciding river is revealed
  sting() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    noise(t, 0.35, { type: 'highpass', freq: 1800, sweepTo: 9000, q: 0.5, gain: 0.16, attack: 0.05 });
    [392, 523.25, 659.25, 783.99].forEach((f) => tone(t + 0.02, f, 1.1, { type: 'triangle', gain: 0.07, attack: 0.03 }));
    tone(t, 98, 0.5, { gain: 0.3, attack: 0.005 });
  },
  // ---- Gadgets ----
  // Drawing on the cigar: soft inhale + crackling ember
  cigar(vol = 1) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    swell(t, 1.3, { type: 'lowpass', freq: 380, sweepTo: 1100, gain: 0.1 * vol, attack: 0.45, release: 0.5 });
    for (let i = 0; i < 18; i++) {
      noise(t + 0.15 + Math.random() * 1.2, 0.01 + Math.random() * 0.01, { freq: 1500 + Math.random() * 3000, q: 3, gain: (0.05 + Math.random() * 0.1) * vol });
    }
  },
  // Vape: click on the fire button, then the hiss of the coil
  vape(vol = 1) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    tone(t, 1900, 0.025, { type: 'square', gain: 0.03 * vol, attack: 0.001 });
    noise(t, 0.012, { type: 'highpass', freq: 3000, gain: 0.12 * vol });
    swell(t + 0.05, 2.1, { freq: 2200, sweepTo: 3600, q: 0.8, gain: 0.09 * vol, attack: 0.25, release: 0.6 });
    for (let i = 0; i < 26; i++) {
      noise(t + 0.1 + Math.random() * 1.8, 0.008, { freq: 4000 + Math.random() * 3000, q: 4, gain: (0.03 + Math.random() * 0.05) * vol });
    }
  },
  // Swirling the cocktail: liquid sloshing around
  slosh(vol = 1) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      swell(t + i * 0.7, 0.75, { freq: 520 + i * 60, sweepTo: 900, q: 1.2, gain: (0.13 - i * 0.03) * vol, attack: 0.3, release: 0.4 });
    }
    tone(t + 0.02, 3100, 0.5, { gain: 0.025 * vol, attack: 0.001 });
    tone(t + 0.02, 4650, 0.3, { gain: 0.012 * vol, attack: 0.001 });
  },
  // Ice cubes: bright against the glass, duller against each other
  clink(vol = 1, kind = 'glass', pitch = 1) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    if (kind === 'glass') {
      const base = 2600 * pitch;
      [1, 1.47, 2.09, 2.76].forEach((m, i) =>
        tone(t, base * m, 0.22 / (1 + i * 0.6), { gain: (0.07 / (1 + i * 0.7)) * vol, attack: 0.0015 }),
      );
      noise(t, 0.012, { type: 'highpass', freq: 5000, gain: 0.1 * vol });
    } else {
      const base = 1350 * pitch;
      [1, 1.73, 2.61].forEach((m, i) => tone(t, base * m, 0.05, { gain: (0.06 / (1 + i)) * vol, attack: 0.001 }));
      noise(t, 0.03, { freq: 2600 * pitch, q: 2.5, gain: 0.22 * vol });
    }
  },
  card() {
    if (!this.ok) return;
    noise(ctx.currentTime, 0.13, { type: 'highpass', freq: 2500, sweepTo: 7000, q: 0.6, gain: 0.22, attack: 0.02 });
  },
  flip() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    noise(t, 0.06, { type: 'bandpass', freq: 2200, q: 1.5, gain: 0.3 });
    noise(t + 0.05, 0.05, { type: 'bandpass', freq: 1400, q: 2, gain: 0.25 });
  },
  check() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    tone(t, 140, 0.09, { gain: 0.35, attack: 0.002 });
    noise(t, 0.04, { type: 'lowpass', freq: 900, gain: 0.3 });
    tone(t + 0.12, 130, 0.09, { gain: 0.3, attack: 0.002 });
    noise(t + 0.12, 0.04, { type: 'lowpass', freq: 900, gain: 0.25 });
  },
  turn() {
    if (!this.enabled || !ensure()) return;
    const t = ctx.currentTime;
    tone(t, 880, 0.35, { gain: 0.14 });
    tone(t + 0.12, 1318.5, 0.5, { gain: 0.12 });
  },
  win() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.08, f, 0.45, { type: 'triangle', gain: 0.08 }));
  },
  alert() {
    if (!this.enabled || !ensure()) return;
    const t = ctx.currentTime;
    tone(t, 660, 0.12, { type: 'square', gain: 0.05 });
    tone(t + 0.15, 660, 0.12, { type: 'square', gain: 0.05 });
  },
};
