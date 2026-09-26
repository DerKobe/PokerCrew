// Personal settings of this player, remembered in this browser (the settings panel in the ⋮ menu).
// gadgets / trophies only change what you see and hear; noTopple is also sent to the server,
// which then refuses to let anyone knock your chip stack over.
const KEYS = { gadgets: 'pc.showGadgets', trophies: 'pc.showTrophies', noTopple: 'pc.noTopple' };
const DEFAULTS = { gadgets: true, trophies: true, noTopple: false };
const listeners = [];

function read(key) {
  try {
    const v = localStorage.getItem(KEYS[key]);
    return v == null ? DEFAULTS[key] : v === '1';
  } catch {
    return DEFAULTS[key];
  }
}

export const prefs = Object.fromEntries(Object.keys(KEYS).map((k) => [k, read(k)]));

export function setPref(key, value) {
  prefs[key] = !!value;
  try {
    localStorage.setItem(KEYS[key], value ? '1' : '0');
  } catch {}
  for (const fn of listeners) fn(key, prefs[key]);
}

export const onPrefChange = (fn) => listeners.push(fn);
