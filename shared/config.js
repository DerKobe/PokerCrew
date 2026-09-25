// Shared tournament configuration (imported by the server and the browser).

export const MAX_SEATS = 10;
export const MIN_SEATS = 2;
export const DEFAULT_SEATS = 5;
export const DEFAULT_TITLE = 'PokerCrew';
export const TITLE_MAX = 28;
// Table look: felt colour and material of the ring around the felt
export const FELTS = ['green', 'red', 'blue'];
export const RIMS = ['wood', 'marbleDark', 'marbleLight'];
export const CARD_BACKS = ['red', 'blue', 'green', 'black', 'purple', 'ivory'];

// Default structure: 5 seats, 10,000 chips each, 10-minute levels.
// Rule of thumb: a tournament roughly ends once the big blind reaches ~1/30 of all chips.
// With 50,000 chips in play that is level 7 (1,000/2,000) after ~60 minutes.
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

// Presets for the level length; `minutes` is the rough tournament length with 5 players
export const PRESETS = [
  { id: 'turbo', minutes: 40, levelMinutes: 7 },
  { id: 'standard', minutes: 60, levelMinutes: 10 },
  { id: 'relaxed', minutes: 90, levelMinutes: 15 },
];

export function defaultConfig() {
  return {
    title: DEFAULT_TITLE,
    felt: FELTS[0],
    rim: RIMS[0],
    cardBack: CARD_BACKS[0],
    bots: false, // fill empty seats with bot players when the tournament starts
    seats: DEFAULT_SEATS,
    startingStack: 10000,
    levelMinutes: 10,
    actionSeconds: 300,
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
  if ('title' in input) c.title = String(input.title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || DEFAULT_TITLE;
  if ('bots' in input) c.bots = !!input.bots;
  if (FELTS.includes(input.felt)) c.felt = input.felt;
  if (RIMS.includes(input.rim)) c.rim = input.rim;
  if (CARD_BACKS.includes(input.cardBack)) c.cardBack = input.cardBack;
  if ('seats' in input) c.seats = int(input.seats, MIN_SEATS, MAX_SEATS, c.seats);
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

// Level i (0-based); after the end of the list the blinds rise automatically by 50 % per level.
export function levelAt(config, i) {
  const levels = config.levels;
  if (i < levels.length) return levels[i];
  const last = levels[levels.length - 1];
  const f = 1.5 ** (i - levels.length + 1);
  const bb = roundNice(last.bb * f);
  return { sb: roundNice((last.sb / last.bb) * bb), bb, ante: last.ante ? roundNice(last.ante * f) : 0 };
}

// Rough estimate of the tournament length in minutes.
export function estimateMinutes(config, players = config.seats || DEFAULT_SEATS) {
  const total = config.startingStack * Math.max(2, players);
  for (let i = 0; i < 200; i++) {
    const l = levelAt(config, i);
    const effBB = l.bb + l.sb * 0.5 + l.ante * players * 0.5;
    if (total / effBB <= 30) return Math.max(config.levelMinutes, i * config.levelMinutes);
  }
  return 200 * config.levelMinutes;
}
