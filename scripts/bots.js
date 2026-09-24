// Test-Bots: setzen sich an freie Plätze und spielen zufällig mit.
// Aufruf: node scripts/bots.js [anzahl=2] [url=http://localhost:3000] [--start] [--shove]
// --shove: Bots gehen All-in, sobald sie erhöhen dürfen (zum Testen von All-in-Situationen)
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a)) || 2);
const url = args.find((a) => a.startsWith('http')) || 'http://localhost:3000';
const autoStart = args.includes('--start');
const shove = args.includes('--shove');
const NAMES = ['Botty', 'Chipper', 'River Rat', 'Tilt', 'Nuts'];

for (let i = 0; i < count; i++) {
  const name = NAMES[i % NAMES.length];
  const socket = io(url, { auth: { token: `bot-token-${name}-${i}-xxxxxxxx` }, transports: ['websocket'] });
  let timer = null;
  let latest = null;
  socket.on('toast', (t) => console.log(`[${name}] ${t.text}`));
  socket.on('state', (s) => {
    latest = s;
    if (s.phase === 'lobby' && s.mySeat == null) {
      const free = s.seats.findIndex((x) => !x);
      if (free >= 0) socket.emit('sit', { seat: free, name });
      return;
    }
    if (s.phase === 'lobby' && autoStart && i === count - 1 && s.seats.filter(Boolean).length >= 2) {
      setTimeout(() => socket.emit('start'), 1500);
    }
    const h = s.hand;
    const l = h?.legal;
    if (!l) return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const l = latest.hand?.legal;
      if (!l) return;
      const r = Math.random();
      if (shove && l.canRaise) socket.emit('action', { type: 'allin' });
      else if (l.canCall && r < 0.18) socket.emit('action', { type: 'fold' });
      else if (l.canRaise && r > 0.8) {
        const amt = Math.min(l.maxTo, l.minTo + Math.floor(Math.random() * l.minTo));
        socket.emit('action', { type: 'raise', amount: amt });
      } else socket.emit('action', { type: l.canCheck ? 'check' : 'call' });
    }, 900 + Math.random() * 1600);
  });
}
console.log(`${count} Bots verbunden mit ${url}`);
