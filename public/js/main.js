import { Stage } from './scene.js';
import { TableView } from './table-view.js';
import { Hud } from './hud.js';
import { Voice } from './voice.js';
import { audioContext, sfx } from './sound.js';
import { preloadCardArt } from './textures.js';
import { ChipFidget } from './fidget.js';
import { Gadgets } from './gadgets.js';
import { Trophies } from './trophies.js';
import { t } from './i18n.js';
import { setCardBack } from './cards.js';

// Entering needs a click so the browser allows audio playback and microphone access.
// The handler is registered right away; the rest may still wait for the scene to load.
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

// Load fonts before canvas textures are drawn
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

const socket = io({
  auth: (cb) => cb({ token: localStorage.getItem('pc.token') }),
  transports: ['websocket', 'polling'],
});
const send = (ev, data) => socket.emit(ev, data);
const hud = new Hud({ stage, view, send, voice: null });
const fidget = new ChipFidget({ stage, view, send, socket });
const gadgets = new Gadgets({ stage, send, socket });
const trophies = new Trophies({ stage, view });
stage.onLayout = () => {
  view.relayout();
  gadgets.relayout();
  trophies.relayout();
};
// Developer aid: ?debug in the URL exposes the scene, table view, gadgets and sounds in the console
// (e.g. __sfx.fanfare() or __sfx.sadTrombone() to listen to a sound)
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __stage: stage, __view: view, __gadgets: gadgets, __trophies: trophies, __sfx: sfx });
let iceServers = null;
let voice = null;

socket.on('welcome', (w) => {
  localStorage.setItem('pc.token', w.token);
  iceServers = w.iceServers;
  voice?.setIceServers(iceServers);
});
socket.on('state', (s) => {
  stage.setLook(s.config);
  setCardBack(s.config.cardBack);
  view.update(s);
  gadgets.update(s);
  fidget.update(s);
  trophies.update(s);
  hud.update(s);
  stage.idle = s.phase !== 'running';
});
socket.on('toast', (m) => hud.toast(m.key ? t(m.key, m.p) : m.text, m.kind));
socket.on('disconnect', () => document.body.classList.add('disconnected'));
socket.on('connect', () => document.body.classList.remove('disconnected'));

const ctx = await entered;
voice = new Voice(socket, ctx);
if (iceServers) voice.setIceServers(iceServers);
hud.setVoice(voice);
await voice.start();
