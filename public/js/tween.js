// Minimal tween manager (updated from the render loop).
const active = new Set();

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outQuint: (t) => 1 - (1 - t) ** 5,
};

let speed = 1;
export function setSpeed(s) {
  speed = s;
}

export function tween({ duration = 300, delay = 0, easing = ease.inOutCubic, update, done } = {}) {
  return new Promise((resolve) => {
    const t = { start: performance.now() + delay * speed, duration: Math.max(1, duration * speed), easing, update, done, resolve };
    active.add(t);
    if (speed === 0) finish(t);
  });
}

function finish(t) {
  active.delete(t);
  t.update?.(1, 1);
  t.done?.();
  t.resolve();
}

export function updateTweens(now = performance.now()) {
  for (const t of active) {
    if (now < t.start) continue;
    const raw = Math.min(1, (now - t.start) / t.duration);
    if (raw >= 1) finish(t);
    else t.update?.(t.easing(raw), raw);
  }
}

export function finishAllTweens() {
  for (const t of [...active]) finish(t);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed));
