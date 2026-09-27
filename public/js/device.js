// Phones are played in portrait only: the table layout for landscape needs a large screen.
// A phone is a touch device whose shorter screen side is small (tablets start at ~600 px).
export const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 520;

// The physical orientation of the device – not the shape of the viewport, which also gets wide
// while the on-screen keyboard is open
export function deviceLandscape() {
  const type = screen.orientation?.type;
  if (type) return type.startsWith('landscape');
  if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
  return window.innerWidth > window.innerHeight;
}

// Browsers only allow locking the orientation in fullscreen (Android); elsewhere this fails quietly
export function lockPortrait() {
  if (!isPhone()) return;
  screen.orientation?.lock?.('portrait').catch(() => {});
}
