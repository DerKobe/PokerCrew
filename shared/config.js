// Gemeinsame Turnier-Konfiguration (wird von Server und Browser importiert).

export const MAX_SEATS = 5;

// Standardstruktur: 5 Spieler x 10.000 Chips, 10-Minuten-Level.
// Faustregel: Ein Turnier endet grob, wenn der Big Blind ~1/30 aller Chips erreicht.
// Bei 50.000 Chips im Spiel ist das Level 7 (1.000/2.000) nach ~60 Minuten.
export const DEFAULT_LEVELS = [
  { sb: 50, bb: 100, ante: 0 },
  { sb: 100, bb: 200, ante: 0 },
  { sb: 150, bb: 300, ante: 0 },
  { sb: 250, bb: 500, ante: 0 },
  { sb: 400, bb: 800, ante: 0 },
  { sb: 600, bb: 1200, ante: 0 },
  { sb: 1000, bb: 2000, ante: 0 },
  { sb: 1500, bb: 3000, ante: 0 },
  { sb: 2000, bb: 4000, ante: 0 },
  { sb: 3000, bb: 6000, ante: 0 },
  { sb: 5000, bb: 10000, ante: 0 },
  { sb: 10000, bb: 20000, ante: 0 },
];

export const PRESETS = [
  { id: 'turbo', label: 'Turbo (~40 Min)', levelMinutes: 7 },
  { id: 'standard', label: 'Standard (~60 Min)', levelMinutes: 10 },
  { id: 'relaxed', label: 'Gemütlich (~90 Min)', levelMinutes: 15 },
];

export function defaultConfig() {
  return {
    startingStack: 10000,
    levelMinutes: 10,
    actionSeconds: 30,
    levels: DEFAULT_LEVELS.map((l) => ({ ...l })),
  };
}

function int(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeConfig(input, base = defaultConfig()) {
  const c = { ...base, levels: base.levels.map((l) => ({ ...l })) };
  if (!input || typeof input !== 'object') return c;
  if ('startingStack' in input) c.startingStack = int(input.startingStack, 100, 10_000_000, c.startingStack);
  if ('levelMinutes' in input) c.levelMinutes = int(input.levelMinutes, 1, 120, c.levelMinutes);
  if ('actionSeconds' in input) c.actionSeconds = int(input.actionSeconds, 10, 300, c.actionSeconds);
  if (Array.isArray(input.levels) && input.levels.length > 0) {
    c.levels = input.levels.slice(0, 40).map((l, i) => {
      const prev = c.levels[i] || c.levels[c.levels.length - 1];
      const sb = int(l?.sb, 1, 100_000_000, prev.sb);
      const bb = int(l?.bb, sb, 100_000_000, Math.max(sb, prev.bb));
      const ante = int(l?.ante, 0, 100_000_000, 0);
      return { sb, bb, ante };
    });
  }
  return c;
}

function roundNice(x) {
  if (x < 10) return Math.max(1, Math.round(x));
  const mag = 10 ** Math.floor(Math.log10(x));
  const step = mag / 2;
  return Math.round(x / step) * step;
}

// Level i (0-basiert); nach dem Ende der Liste steigen die Blinds automatisch um 50 % pro Level.
export function levelAt(config, i) {
  const levels = config.levels;
  if (i < levels.length) return levels[i];
  const last = levels[levels.length - 1];
  const f = 1.5 ** (i - levels.length + 1);
  const bb = roundNice(last.bb * f);
  return { sb: roundNice((last.sb / last.bb) * bb), bb, ante: last.ante ? roundNice(last.ante * f) : 0 };
}

// Grobe Schätzung der Turnierdauer in Minuten.
export function estimateMinutes(config, players = MAX_SEATS) {
  const total = config.startingStack * Math.max(2, players);
  for (let i = 0; i < 200; i++) {
    const l = levelAt(config, i);
    const effBB = l.bb + l.sb * 0.5 + l.ante * players * 0.5;
    if (total / effBB <= 30) return Math.max(config.levelMinutes, i * config.levelMinutes);
  }
  return 200 * config.levelMinutes;
}
