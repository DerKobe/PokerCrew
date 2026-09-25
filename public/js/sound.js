// Synthetische Soundeffekte über WebAudio – keine Audiodateien nötig.
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
  // Einzelner Chip, der beim Riffeln auf den anderen fällt
  tick(vol = 1) {
    if (!this.enabled || !ensure()) return;
    const t = ctx.currentTime;
    noise(t, 0.02 + Math.random() * 0.014, { freq: 3600 + Math.random() * 2800, q: 6, gain: 0.3 * vol });
    noise(t, 0.012, { type: 'highpass', freq: 6500, q: 0.7, gain: 0.07 * vol });
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
