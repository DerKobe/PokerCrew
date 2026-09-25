import { Stage } from './scene.js';
import { TableView } from './table-view.js';
import { Hud } from './hud.js';
import { Voice } from './voice.js';
import { audioContext } from './sound.js';
import { preloadCardArt } from './textures.js';
import { ChipFidget } from './fidget.js';
import { Gadgets } from './gadgets.js';

// Beitreten: Klick ist nötig, damit der Browser Audio abspielen und das Mikro freigeben darf.
// Der Handler wird sofort registriert; der Rest wartet ggf. auf das Laden der Szene.
let resolveEnter;
const entered = new Promise((r) => (resolveEnter = r));
const splash = document.getElementById('splash');
document.getElementById('btn-enter').addEventListener(
  'click',
  () => {
    splash.classList.add('leaving');
    setTimeout(() => splash.remove(), 600);
    resolveEnter(audioContext());
  },
  { once: true },
);

// Schriften laden, bevor Canvas-Texturen gezeichnet werden
try {
  await Promise.race([
    Promise.all([
      document.fonts.load('700 40px "Playfair Display"'),
      document.fonts.load('italic 700 40px "Playfair Display"'),
      document.fonts.load('800 40px Inter'),
      document.fonts.load('700 40px Inter'),
      document.fonts.load('500 40px Inter'),
      document.fonts.load('700 40px "Roboto Slab"'),
      preloadCardArt(),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
} catch {}

const stage = new Stage(document.getElementById('stage'));
const view = new TableView(stage);
// Entwickler-Hilfe: ?debug in der URL macht Szene und Tischansicht in der Konsole verfügbar

const socket = io({
  auth: (cb) => cb({ token: localStorage.getItem('pc.token') }),
  transports: ['websocket', 'polling'],
});
const send = (ev, data) => socket.emit(ev, data);
const hud = new Hud({ stage, view, send, voice: null });
new ChipFidget({ stage, view, send, socket });
const gadgets = new Gadgets({ stage, send, socket });
stage.onLayout = () => {
  view.relayout();
  gadgets.relayout();
};
// Entwickler-Hilfe: ?debug in der URL macht Szene und Tischansicht in der Konsole verfügbar
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __stage: stage, __view: view, __gadgets: gadgets });
let iceServers = null;
let voice = null;

socket.on('welcome', (w) => {
  localStorage.setItem('pc.token', w.token);
  iceServers = w.iceServers;
  voice?.setIceServers(iceServers);
});
socket.on('state', (s) => {
  view.update(s);
  gadgets.update(s);
  hud.update(s);
  stage.idle = s.phase !== 'running';
});
socket.on('toast', (t) => hud.toast(t.text, t.kind));
socket.on('disconnect', () => document.body.classList.add('disconnected'));
socket.on('connect', () => document.body.classList.remove('disconnected'));

const ctx = await entered;
voice = new Voice(socket, ctx);
if (iceServers) voice.setIceServers(iceServers);
hud.setVoice(voice);
await voice.start();
