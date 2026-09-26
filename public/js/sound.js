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

// Brass-like note: two slightly detuned sawtooth waves through a low-pass filter.
// wah: the filter opens and closes like a plunger mute; wobble: the mute keeps flapping;
// bend: the pitch sags by that many Hz towards the end; vibrato: pitch vibrato depth in Hz.
function brass(t, freq, dur, { gain = 0.1, bright = 2600, attack = 0.03, vibrato = 0, wah = false, wobble = 0, bend = 0, swellTo = 0 } = {}) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = wah ? 5 : 1;
  const g = ctx.createGain();
  const oscs = [-7, 7].map((detune) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.linearRampToValueAtTime(freq - bend, t + dur);
    o.detune.value = detune;
    o.connect(f);
    return o;
  });
  if (wah) {
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(1500, t + Math.min(0.2, dur * 0.45));
    f.frequency.exponentialRampToValueAtTime(420, t + dur);
  } else {
    f.frequency.setValueAtTime(bright * 0.3, t);
    f.frequency.linearRampToValueAtTime(bright, t + attack + 0.05);
    f.frequency.exponentialRampToValueAtTime(bright * 0.55, t + dur);
  }
  const lfo = (rate, depth, target, delay) => {
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(depth, t + delay);
    l.connect(lg);
    for (const x of target) lg.connect(x);
    l.start(t);
    l.stop(t + dur + 0.05);
  };
  if (vibrato) lfo(5.5, vibrato, oscs.map((o) => o.frequency), 0.35);
  if (wobble) lfo(4.5, wobble, [f.frequency], 0.25);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  if (swellTo) g.gain.linearRampToValueAtTime(swellTo, t + dur * 0.75);
  else g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  f.connect(g).connect(master);
  for (const o of oscs) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// A coin landing: a few inharmonic metallic partials plus a click, placed left or right
// (pan -1..1)
function coin(t, pan, pitch = 1, gain = 0.12) {
  const out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (out.pan) out.pan.value = pan;
  out.connect(master);
  [2093, 3150, 4710, 6280].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * pitch;
    const g = ctx.createGain();
    const dur = 0.9 - i * 0.18;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain / (i + 1), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 5000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + 0.06);
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
  // Dramatic river won: triumphant brass fanfare (ta-ta-ta-taaaa) with a cymbal
  fanfare() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    [0, 0.13, 0.26].forEach((d) => brass(t + d, 392, 0.12, { gain: 0.1, attack: 0.015 }));
    const hit = t + 0.42;
    [261.63, 523.25, 659.25, 783.99].forEach((f, i) => brass(hit, f, 1.6, { gain: i ? 0.07 : 0.06, vibrato: 3.5 }));
    tone(hit, 1046.5, 1.4, { type: 'triangle', gain: 0.05, attack: 0.05 });
    noise(hit, 1.2, { type: 'highpass', freq: 5000, sweepTo: 9000, q: 0.4, gain: 0.12, attack: 0.01 });
    tone(hit, 98, 0.5, { gain: 0.3, attack: 0.005 });
  },
  // Dramatic river lost: the sad trombone – "wah wah waaaAAh"
  sadTrombone() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    brass(t, 293.66, 0.42, { gain: 0.11, wah: true });
    brass(t + 0.48, 277.18, 0.42, { gain: 0.11, wah: true });
    // the last one gets louder, flaps its mute and sags in pitch
    brass(t + 0.96, 261.63, 1.7, { gain: 0.09, swellTo: 0.14, wah: true, wobble: 700, vibrato: 4, bend: 9 });
  },
  // Dramatic river ends in a split pot: one coin to the left, one to the right, then an open
  // chord that neither triumphs nor mourns
  splitPot() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    coin(t, -0.85, 1);
    coin(t + 0.16, 0.85, 1.06);
    const c = t + 0.42;
    // Csus2 over G: bright, but unresolved
    [196, 261.63, 293.66, 392].forEach((f, i) => tone(c + i * 0.05, f, 1.5, { type: 'triangle', gain: 0.06, attack: 0.04 }));
    tone(c + 0.25, 587.33, 1.1, { type: 'sine', gain: 0.035, attack: 0.08 });
  },
  // Trophy earned: short rising chime with a sparkle on top
  trophy() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone(t + i * 0.07, f, 0.5, { type: 'triangle', gain: 0.07 }));
    noise(t + 0.25, 0.4, { type: 'highpass', freq: 6000, sweepTo: 11000, q: 0.5, gain: 0.05, attack: 0.05 });
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
