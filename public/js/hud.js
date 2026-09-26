// HTML interface on top of the 3D scene.
import * as THREE from 'three';
import { MAX_SEATS, POT_POS, BELOW_BOARD, tableToWorld, isPortrait } from './scene.js';
import { MIN_SEATS, DEFAULT_TITLE, TITLE_MAX, FELTS, RIMS, CARD_BACKS } from '/shared/config.js';
import { cardBackPreview } from './textures.js';
import { PRESETS, defaultConfig, estimateMinutes, levelAt } from '/shared/config.js';
import { GADGETS, isGadget } from '/shared/gadgets.js';
import { sfx } from './sound.js';
import { t, fmt, fmtMin, clock, describeHand, describeHole, langPicker, applyStatic, onLangChange, getLang } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const SUITS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const ICON = {
  mic: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>',
  micOff:
    '<svg viewBox="0 0 24 24"><path d="M19 11a7 7 0 0 1-1.2 3.93l-1.46-1.46A5 5 0 0 0 17 11h2Zm-4-.17L9 4.83V5a3 3 0 0 1 6 0v5.83ZM4.27 3 3 4.27l6 6V11a3 3 0 0 0 4.52 2.6l1.46 1.46A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08a6.9 6.9 0 0 0 3.02-1.14L19.73 21 21 19.73 4.27 3Z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3Zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23Z"/></svg>',
  speakerOff:
    '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63Zm2.5 0a6.9 6.9 0 0 1-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12ZM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A7 7 0 0 1 14 18.7v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3ZM12 4 9.91 6.09 12 8.18V4Z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z"/></svg>',
  camOff:
    '<svg viewBox="0 0 24 24"><path d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.82L21 17.18V6.5ZM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2Z"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24"><path d="M20 18.69 7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01A6 6 0 0 0 6 11v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03ZM12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-7.32V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09a5.8 5.8 0 0 0-1.53.53L18 14.68Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H5.17L4 17.17V4Zm0-2a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2Z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z"/></svg>',
};

// Tequila shot for calling an all-in: shot glass with golden tequila and an orange slice on the rim
const TEQUILA_SHOT = `<svg class="shot" viewBox="0 0 34 40" aria-hidden="true">
  <defs><linearGradient id="tequila" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#e59a12"/></linearGradient></defs>
  <g transform="rotate(-25 23.5 11.5)">
    <circle cx="23.5" cy="11.5" r="7" fill="#f57c00"/>
    <circle cx="23.5" cy="11.5" r="5.7" fill="#ffb74d"/>
    <g stroke="#fff3e0" stroke-width="0.8" opacity="0.9">
      <line x1="23.5" y1="6" x2="23.5" y2="17"/><line x1="18" y1="11.5" x2="29" y2="11.5"/>
      <line x1="19.6" y1="7.6" x2="27.4" y2="15.4"/><line x1="27.4" y1="7.6" x2="19.6" y2="15.4"/>
    </g>
    <circle cx="23.5" cy="11.5" r="1.1" fill="#fff3e0"/>
  </g>
  <path d="M8 12H24L21.8 38H10.2Z" fill="rgba(255,255,255,0.16)"/>
  <path d="M8.5 17.5H23.5L22.2 33H9.8Z" fill="url(#tequila)"/>
  <ellipse cx="16" cy="17.5" rx="7.5" ry="1.1" fill="#fff4b8"/>
  <path d="M9.8 33H22.2L21.8 38H10.2Z" fill="rgba(255,255,255,0.6)"/>
  <path d="M8 12H24L21.8 38H10.2Z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M10.4 14.5L11.6 30.5" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>
  <path d="M22.2 12.6L23.5 11.5" stroke="#b35400" stroke-width="1" stroke-linecap="round"/>
</svg>`;

const gadgetIcon = (id) => {
  const g = GADGETS.find((x) => x.id === id);
  return g ? ` <span class="sg" title="${t(`gadget.${g.id}`)}">${g.icon}</span>` : '';
};

export class Hud {
  constructor({ stage, view, send, voice }) {
    this.stage = stage;
    this.view = view;
    this.send = send;
    this.voice = voice;
    this.state = null;
    this.stateAt = 0;
    this.actionKey = null;
    this.autoCheckFold = false;
    this.autoHand = null;
    this.lastLog = 0;
    this.lastResultKey = null;
    this.lastTurnKey = null;
    this.name = localStorage.getItem('pc.name') || '';
    this.gadget = localStorage.getItem('pc.gadget');
    if (!isGadget(this.gadget)) this.gadget = null;
    this.#build();
    onLangChange(() => this.#relocalize());
    stage.onFrame.push(() => this.#frame());
    setInterval(() => this.#tick(), 250);
  }

  setVoice(voice) {
    this.voice = voice;
    voice.onChange = () => this.#renderVoice();
    this.#renderVoice();
  }

  // ------------------------------------------------------------ Setup

  #build() {
    // Nameplates
    const plates = $('#plates');
    this.plates = [];
    for (let i = 0; i < MAX_SEATS; i++) {
      const el = document.createElement('div');
      el.className = 'plate empty';
      el.innerHTML = `
        <div class="avatar"><svg class="timer" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20"/></svg><span class="ini"></span><span class="speak"></span></div>
        <div class="meta"><div class="name"><span class="nm"></span><i class="mic"></i></div><div class="stack"></div></div>
        <div class="tag"></div>
        <div class="act"></div>
        <button class="sit">${esc(t('plate.sit', { n: i + 1 }))}</button>`;
      el.querySelector('.sit').addEventListener('click', () => (this.state?.phase === 'running' ? this.#openJoin(i) : this.#sitAt(i)));
      el.querySelector('.avatar').addEventListener('click', () => {
        if (el.classList.contains('has-video')) el.classList.toggle('zoom');
      });
      plates.appendChild(el);
      const bet = document.createElement('div');
      bet.className = 'betlabel';
      plates.appendChild(bet);
      this.plates.push({ el, bet, seat: i });
    }
    this.potLabel = document.createElement('div');
    this.potLabel.className = 'potlabel';
    plates.appendChild(this.potLabel);
    this.rabbitLabel = document.createElement('div');
    this.rabbitLabel.className = 'rabbitlabel hidden';
    plates.appendChild(this.rabbitLabel);
    $('#reveal button').onclick = () => {
      this.send('reveal');
      $('#reveal').classList.add('hidden');
    };
    $('#rabbit button').onclick = () => {
      this.send('rabbit');
      $('#rabbit').classList.add('hidden');
    };
    $('#showcards').onclick = (e) => {
      const b = e.target.closest('[data-show]');
      if (!b) return;
      this.send('show', b.dataset.show === 'both' ? 'both' : Number(b.dataset.show));
      $('#showcards').classList.add('hidden');
    };

    // Top bar
    $('#topbar').innerHTML = `
      <div class="brand"><span class="logo">♠</span> PokerCrew</div>
      <div class="levelinfo"></div>
      <div class="tools">
        ${langPicker()}
        <button class="icon" id="btn-invite" data-i18n-title="top.invite">${ICON.link}</button>
        <button class="icon" id="btn-pause">${ICON.pause}</button>
        <button class="icon" id="btn-fix">${ICON.pin}</button>
        <button class="icon" id="btn-sfx" data-i18n-title="top.sfx">${ICON.bell}</button>
        <button class="icon" id="btn-menu" data-i18n-title="top.menu">${ICON.menu}</button>
        <div class="menu hidden" id="menu">
          <button id="btn-fix-menu" class="mobile-only"></button>
          <button id="btn-abort" data-i18n="top.abort"></button>
          <button id="btn-full" data-i18n="top.fullscreen"></button>
        </div>
      </div>`;
    $('#btn-invite').onclick = () => {
      navigator.clipboard?.writeText(location.origin).then(
        () => this.toast(t('top.linkCopied')),
        () => this.toast(location.origin),
      );
    };
    $('#btn-pause').onclick = () => this.send('pause');
    // Fixed table: stops all camera movement (default follows the OS "reduce motion" setting)
    const saved = localStorage.getItem('pc.fixed');
    this.stage.fixed = saved != null ? saved === '1' : matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.stage.motionK = this.stage.fixed ? 0 : 1;
    this.#renderFix();
    $('#btn-fix').onclick = $('#btn-fix-menu').onclick = () => {
      this.stage.fixed = !this.stage.fixed;
      localStorage.setItem('pc.fixed', this.stage.fixed ? '1' : '0');
      this.#renderFix();
    };
    sfx.enabled = localStorage.getItem('pc.sfx') !== '0';
    const sfxBtn = $('#btn-sfx');
    const renderSfx = () => {
      sfxBtn.innerHTML = sfx.enabled ? ICON.bell : ICON.bellOff;
      sfxBtn.classList.toggle('off', !sfx.enabled);
    };
    renderSfx();
    sfxBtn.onclick = () => {
      sfx.enabled = !sfx.enabled;
      localStorage.setItem('pc.sfx', sfx.enabled ? '1' : '0');
      renderSfx();
    };
    $('#btn-menu').onclick = (e) => {
      e.stopPropagation();
      $('#menu').classList.toggle('hidden');
    };
    document.addEventListener('click', () => $('#menu').classList.add('hidden'));
    $('#btn-abort').onclick = () => {
      if (confirm(t('top.abortConfirm'))) this.send('abort');
    };
    $('#btn-full').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    };

    // Voice
    $('#voice').innerHTML = `
      <div class="vhead">
        <button class="mic-btn" id="btn-mic"></button>
        <button class="icon" id="btn-cam" data-i18n-title="voice.cam"></button>
        <button class="icon" id="btn-deaf" data-i18n-title="voice.deafen"></button>
        <div class="vtitle" data-i18n="voice.title"></div>
      </div>
      <ul class="vlist"></ul>`;
    $('#btn-mic').onclick = () => this.voice && this.voice.hasMic && this.voice.setMuted(!this.voice.muted);
    $('#btn-deaf').onclick = () => this.voice && this.voice.setDeafened(!this.voice.deafened);
    $('#btn-cam').onclick = async () => {
      if (!this.voice) return;
      await this.voice.setVideo(!this.voice.videoOn);
      if (!this.voice.videoOn && this.voice.camError) this.toast(t(`voice.${this.voice.camError}`), 'error');
    };
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'm' || e.key === 'M') this.voice?.hasMic && this.voice.setMuted(!this.voice.muted);
    });

    // Log & Chat
    $('#log').innerHTML = `
      <button class="log-toggle" id="log-toggle">${ICON.chat}<span data-i18n="log.title"></span><b class="badge hidden">0</b></button>
      <div class="log-body"><ul class="log-list"></ul>
      <form class="chat"><input maxlength="200" data-i18n-ph="log.placeholder" autocomplete="off"><button data-i18n="log.send"></button></form></div>`;
    const logEl = $('#log');
    // On phones the feed would cover the table: closed by default, and closed again whenever the
    // window becomes phone-sized (e.g. rotating a tablet); the saved desktop preference is kept.
    const phone = window.matchMedia('(max-width: 800px)');
    if (localStorage.getItem('pc.logOpen') !== '0' && !phone.matches) logEl.classList.add('open');
    phone.addEventListener('change', () => {
      if (phone.matches) logEl.classList.remove('open');
    });
    // ... and a tap anywhere else puts it away again
    document.addEventListener('pointerdown', (e) => {
      if (phone.matches && !logEl.contains(e.target)) logEl.classList.remove('open');
    });
    $('#log-toggle').onclick = () => {
      logEl.classList.toggle('open');
      localStorage.setItem('pc.logOpen', logEl.classList.contains('open') ? '1' : '0');
      this.unread = 0;
      this.#renderBadge();
    };
    $('#log .chat').onsubmit = (e) => {
      e.preventDefault();
      const inp = $('#log .chat input');
      if (inp.value.trim()) this.send('chat', inp.value);
      inp.value = '';
    };
    this.unread = 0;

    // Actions
    this.actions = $('#actions');
    window.addEventListener('keydown', (e) => this.#hotkeys(e));

    // Lobby + late registration
    this.#buildLobby();
    this.#buildJoin();
    applyStatic();
  }

  #renderFix() {
    const b = $('#btn-fix');
    b.classList.toggle('on', this.stage.fixed);
    b.setAttribute('aria-pressed', String(this.stage.fixed));
    b.title = t(this.stage.fixed ? 'top.unfix' : 'top.fix');
    // on phones the button lives in the ⋮ menu to keep the top bar short
    $('#btn-fix-menu').textContent = `📌 ${t(this.stage.fixed ? 'top.unfix' : 'top.fix')}`;
  }

  // Language switched: rebuild generated markup and re-render everything from the last state
  #relocalize() {
    this.#renderFix();
    this.#buildLobby();
    this.#buildJoin();
    for (const p of this.plates) p.el.querySelector('.sit').textContent = t('plate.sit', { n: p.seat + 1 });
    this.actionKey = null;
    this.lastLog = 0;
    this.resultsRendered = false;
    this.relocalizing = true;
    if (this.state) this.update(this.state);
    this.relocalizing = false;
    this.#renderVoice();
  }

  // ------------------------------------------------------------ Lobby

  #buildLobby() {
    const el = $('#lobby');
    el.innerHTML = `
      <div class="lobby-card">
        <h1>${t('lobby.title')}</h1>
        <p class="sub">${t('lobby.sub')}</p>
        <div class="row name-row">
          <label>${t('lobby.name')}<input id="in-name" maxlength="16" placeholder="${esc(t('lobby.namePh'))}" autocomplete="nickname"></label>
        </div>
        <div class="seats-head">
          <span class="lbl">${t('lobby.seats')}</span>
          <div class="seat-count" role="radiogroup" aria-label="${esc(t('lobby.seats'))}">${Array.from(
            { length: MAX_SEATS - MIN_SEATS + 1 },
            (_, i) => `<button type="button" role="radio" data-n="${i + MIN_SEATS}">${i + MIN_SEATS}</button>`,
          ).join('')}</div>
        </div>
        <div class="seatgrid"></div>
        <label class="bots-row"><input type="checkbox" id="in-bots"> <span>🤖 ${t('lobby.bots')}</span> <em>${t('lobby.botsHint')}</em></label>
        <div class="gadget-row">
          <span class="lbl">${t('lobby.gadget')} <em>${t('lobby.gadgetHint')}</em></span>
          <div class="gadget-opts">${GADGETS.map((g) => `<button class="gadget-opt" data-g="${g.id}"><span class="gi">${g.icon}</span><span>${t(`gadget.${g.id}`)}</span></button>`).join('')}</div>
        </div>
        <div class="struct">
          <div class="struct-head">
            <h2>${t('lobby.struct')}</h2>
          </div>
          <div class="row struct-summary">
            <div class="struct-sum"></div>
            <button class="ghost" id="btn-struct" aria-expanded="false"></button>
          </div>
          <div class="struct-editor hidden">
            <h3>${t('lobby.table')}</h3>
            <div class="row title-row">
              <label>${t('lobby.tournamentName')}<input id="in-title" maxlength="${TITLE_MAX}" placeholder="${DEFAULT_TITLE}" autocomplete="off"></label>
            </div>
            <div class="row look-row">
              <div class="look"><span class="lbl">${t('lobby.felt')}</span><div class="look-opts" data-k="felt">${FELTS.map(
                (f) => `<button type="button" data-v="${f}"><i class="sw sw-${f}"></i>${t(`look.${f}`)}</button>`,
              ).join('')}</div></div>
              <div class="look"><span class="lbl">${t('lobby.rim')}</span><div class="look-opts" data-k="rim">${RIMS.map(
                (r) => `<button type="button" data-v="${r}"><i class="sw sw-${r}"></i>${t(`look.${r}`)}</button>`,
              ).join('')}</div></div>
              <div class="look"><span class="lbl">${t('lobby.cardBack')}</span><div class="look-opts backs" data-k="cardBack">${CARD_BACKS.map(
                (b) => `<button type="button" data-v="${b}" title="${esc(t(`back.${b}`))}" aria-label="${esc(t(`back.${b}`))}"><img src="${cardBackPreview(b)}" alt=""></button>`,
              ).join('')}</div></div>
            </div>
            <h3>${t('lobby.game')}</h3>
            <div class="presets"></div>
            <div class="row three">
              <label>${t('lobby.stack')}<input id="in-stack" type="number" min="100" step="100"></label>
              <label>${t('lobby.levelMin')}<input id="in-level" type="number" min="1" max="120"></label>
              <label>${t('lobby.actionSec')}<input id="in-action" type="number" min="10" max="300"></label>
            </div>
            <h3>${t('lobby.blinds')}</h3>
            <div class="blinds-wrap">
              <table class="blinds"><thead><tr><th>${t('lobby.colLevel')}</th><th>${t('lobby.colSb')}</th><th>${t('lobby.colBb')}</th><th>${t('lobby.colAnte')}</th><th>${t('lobby.colStart')}</th><th></th></tr></thead><tbody></tbody></table>
            </div>
            <div class="row struct-foot">
              <button class="ghost" id="btn-addlvl">${t('lobby.addLevel')}</button>
              <button class="ghost" id="btn-reset">${t('lobby.reset')}</button>
            </div>
          </div>
          <div class="estimate"></div>
          <p class="hint readonly-hint">${t('lobby.readonly')}</p>
        </div>
        <div class="lobby-foot">
          <div class="who"></div>
          <button class="primary" id="btn-start">${t('lobby.start')}</button>
        </div>
      </div>`;
    const nameIn = $('#in-name');
    nameIn.value = this.name;
    nameIn.addEventListener('input', () => {
      this.name = nameIn.value;
      localStorage.setItem('pc.name', this.name);
    });
    nameIn.addEventListener('change', () => {
      const mine = this.state?.mySeat;
      if (mine != null && this.name.trim()) this.send('sit', { seat: mine, name: this.name, gadget: this.gadget });
    });
    el.querySelectorAll('.gadget-opt').forEach((b) => {
      b.onclick = () => {
        this.gadget = b.dataset.g;
        localStorage.setItem('pc.gadget', this.gadget);
        if (this.state?.mySeat != null) this.send('gadget', this.gadget);
        if (this.state) this.#renderLobby(this.state);
      };
    });
    $('.presets', el).innerHTML = PRESETS.map((p) => `<button class="chip-btn" data-p="${p.id}">${t(`preset.${p.id}`)} (${t('preset.mins', { m: p.minutes })})</button>`).join('');
    el.querySelectorAll('.presets button').forEach((b) => {
      b.onclick = () => {
        const p = PRESETS.find((x) => x.id === b.dataset.p);
        this.send('config', { levelMinutes: p.levelMinutes });
      };
    });
    const sendNum = (id, key) => {
      $(id).addEventListener('change', (e) => this.send('config', { [key]: Number(e.target.value) }));
    };
    sendNum('#in-stack', 'startingStack');
    sendNum('#in-level', 'levelMinutes');
    sendNum('#in-action', 'actionSeconds');
    $('#btn-addlvl').onclick = () => {
      const lv = this.state.config.levels;
      const next = levelAt({ levels: lv }, lv.length);
      this.send('config', { levels: [...lv, next] });
    };
    // "Default" resets the structure only – not the table size or the tournament name
    $('#btn-reset').onclick = () => {
      const { startingStack, levelMinutes, actionSeconds, levels } = defaultConfig();
      this.send('config', { startingStack, levelMinutes, actionSeconds, levels });
    };
    // The table (name, felt, rim): anyone in the lobby may change it; the name is sent while
    // typing (debounced)
    const titleIn = $('#in-title');
    const sendTitle = () => {
      clearTimeout(this.titleT);
      this.send('table', { title: titleIn.value });
    };
    el.querySelectorAll('.look-opts button').forEach((b) => {
      b.onclick = () => this.send('table', { [b.parentElement.dataset.k]: b.dataset.v });
    });
    titleIn.addEventListener('input', () => {
      clearTimeout(this.titleT);
      this.titleT = setTimeout(sendTitle, 400);
    });
    titleIn.addEventListener('change', sendTitle);
    $('#btn-start').onclick = () => this.send('start');
    $('#in-bots').onchange = (e) => this.send('config', { bots: e.target.checked });
    // Seat count: a direct choice (not +/-), so two people picking the same number do not fight;
    // open to everyone in the lobby, also before taking a seat
    el.querySelectorAll('.seat-count button').forEach((b) => {
      b.onclick = () => this.send('seats', Number(b.dataset.n));
    });
    // Tournament and blind structure are collapsed by default
    this.structOpen ??= false;
    $('#btn-struct').onclick = () => {
      this.structOpen = !this.structOpen;
      if (this.state) this.#renderLobby(this.state);
    };
    $('.blinds tbody', el).addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const levels = [...el.querySelectorAll('.blinds tbody tr')].map((row) => ({
        sb: Number(row.querySelector('[data-k=sb]').value),
        bb: Number(row.querySelector('[data-k=bb]').value),
        ante: Number(row.querySelector('[data-k=ante]').value),
      }));
      this.send('config', { levels });
    });
    $('.blinds tbody', el).addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-del]');
      if (!btn) return;
      const levels = this.state.config.levels.filter((_, i) => i !== Number(btn.dataset.del));
      if (levels.length) this.send('config', { levels });
    });
  }

  // ------------------------------------------------------------ Late registration

  #buildJoin() {
    let el = $('#join');
    if (!el) {
      el = document.createElement('div');
      el.id = 'join';
      el.className = 'hidden';
      document.body.appendChild(el);
      const cta = document.createElement('button');
      cta.id = 'join-cta';
      cta.className = 'primary hidden';
      cta.onclick = () => this.#openJoin(null);
      document.body.appendChild(cta);
    }
    el.innerHTML = `
      <div class="lobby-card join-card">
        <h1>${t('join.title')}</h1>
        <p class="sub join-sub"></p>
        <div class="row name-row">
          <label>${t('lobby.name')}<input id="join-name" maxlength="16" placeholder="${esc(t('lobby.namePh'))}" autocomplete="nickname"></label>
        </div>
        <div class="gadget-row">
          <span class="lbl">${t('lobby.gadget')} <em>${t('lobby.gadgetHint')}</em></span>
          <div class="gadget-opts">${GADGETS.map((g) => `<button class="gadget-opt" data-g="${g.id}"><span class="gi">${g.icon}</span><span>${t(`gadget.${g.id}`)}</span></button>`).join('')}</div>
        </div>
        <div class="gadget-row">
          <span class="lbl">${t('join.seat')}</span>
          <div class="join-seats"></div>
        </div>
        <div class="lobby-foot">
          <button class="ghost" id="join-cancel">${t('join.cancel')}</button>
          <button class="primary" id="join-go"></button>
        </div>
      </div>`;
    const nameIn = $('#join-name');
    nameIn.value = this.name;
    nameIn.addEventListener('input', () => {
      this.name = nameIn.value;
      localStorage.setItem('pc.name', this.name);
      const lobbyName = $('#in-name');
      if (lobbyName) lobbyName.value = this.name;
    });
    el.querySelectorAll('.gadget-opt').forEach((b) => {
      b.onclick = () => {
        this.gadget = b.dataset.g;
        localStorage.setItem('pc.gadget', this.gadget);
        if (this.state) this.#renderJoin(this.state);
      };
    });
    $('#join-cancel').onclick = () => {
      this.joinOpen = false;
      if (this.state) this.#renderJoin(this.state);
    };
    $('#join-go').onclick = () => this.joinSeat != null && this.#sitAt(this.joinSeat, nameIn);
    el.onclick = (e) => {
      if (e.target === el) $('#join-cancel').click();
    };
  }

  #openJoin(seat) {
    this.joinOpen = true;
    this.joinSeat = seat;
    if (this.state) this.#renderJoin(this.state);
    const inp = $('#join-name');
    if (!inp.value.trim()) inp.focus();
  }

  #renderJoin(s) {
    const open = !!s.lateReg && s.mySeat == null && s.phase === 'running';
    const free = s.seats.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
    const cta = $('#join-cta');
    cta.classList.toggle('hidden', !open || this.joinOpen);
    if (open) cta.textContent = `🪑 ${t('join.cta', { free: free.length })}`;
    if (!open) this.joinOpen = false;
    const el = $('#join');
    el.classList.toggle('hidden', !this.joinOpen);
    if (!this.joinOpen) return;
    if (!free.includes(this.joinSeat)) this.joinSeat = free[0] ?? null;
    $('.join-sub', el).textContent = t('join.sub', { stack: s.config.startingStack });
    $('.join-seats', el).innerHTML = free
      .map((i) => `<button class="chip-btn ${i === this.joinSeat ? 'active' : ''}" data-seat="${i}">${i + 1}</button>`)
      .join('');
    el.querySelectorAll('.join-seats button').forEach((b) => {
      b.onclick = () => {
        this.joinSeat = Number(b.dataset.seat);
        this.#renderJoin(this.state);
      };
    });
    el.querySelectorAll('.gadget-opt').forEach((b) => b.classList.toggle('active', b.dataset.g === this.gadget));
    const go = $('#join-go');
    go.textContent = this.joinSeat != null ? t('join.go', { n: this.joinSeat + 1 }) : t('join.title');
    go.disabled = this.joinSeat == null;
  }

  #sitAt(seat, nameInput = $('#in-name')) {
    const name = (this.name || '').trim();
    if (!name) {
      nameInput.focus();
      this.toast(t('lobby.nameFirst'), 'error');
      return;
    }
    this.send('sit', { seat, name, gadget: this.gadget });
  }

  #renderLobby(s) {
    const el = $('#lobby');
    const show = s.phase === 'lobby';
    el.classList.toggle('hidden', !show);
    document.body.classList.toggle('in-lobby', show);
    if (!show) return;
    const seated = s.seats.filter(Boolean).length;
    const canEdit = s.mySeat != null;
    el.classList.toggle('readonly', !canEdit);

    // Seats: count choice + grid (at most 5 per row, rows evenly filled)
    const count = s.seats.length;
    el.querySelectorAll('.seat-count button').forEach((b) => {
      const n = Number(b.dataset.n);
      b.classList.toggle('active', n === count);
      b.setAttribute('aria-checked', String(n === count));
      b.disabled = n < seated;
    });
    $('.seatgrid', el).style.setProperty('--cols', count <= 5 ? count : Math.ceil(count / 2));
    $('.seatgrid', el).innerHTML = s.seats
      .map((seat, i) => {
        const mine = s.mySeat === i;
        if (seat)
          return `<div class="seat taken ${mine ? 'mine' : ''} ${seat.connected ? '' : 'offline'}"><span class="no">${i + 1}</span><span class="sn">${esc(seat.name)}${gadgetIcon(seat.gadget)}</span>${
            mine ? `<button class="ghost small" data-stand>${t('lobby.standUp')}</button>` : seat.connected ? '' : `<em>${t('lobby.offline')}</em>`
          }</div>`;
        return `<button class="seat free" data-seat="${i}"><span class="no">${i + 1}</span><span class="sn">${s.config.bots ? `🤖 ${t('lobby.botSeat')}` : t('lobby.free')}</span><span class="cta">${t(s.mySeat != null ? 'lobby.switch' : 'lobby.sit')}</span></button>`;
      })
      .join('');
    el.querySelectorAll('[data-seat]').forEach((b) => (b.onclick = () => this.#sitAt(Number(b.dataset.seat))));
    el.querySelector('[data-stand]')?.addEventListener('click', () => this.send('stand'));

    // Gadget: the server's value wins once you are seated
    const myGadget = s.mySeat != null ? s.seats[s.mySeat].gadget : this.gadget;
    el.querySelectorAll('.gadget-opt').forEach((b) => b.classList.toggle('active', b.dataset.g === myGadget));

    // Structure
    const c = s.config;
    const setVal = (id, v) => {
      const inp = $(id);
      if (document.activeElement !== inp) inp.value = v;
      inp.disabled = !canEdit;
    };
    const titleIn = $('#in-title');
    if (document.activeElement !== titleIn) titleIn.value = c.title;
    el.querySelectorAll('.look-opts button').forEach((b) => b.classList.toggle('active', c[b.parentElement.dataset.k] === b.dataset.v));
    setVal('#in-stack', c.startingStack);
    setVal('#in-level', c.levelMinutes);
    setVal('#in-action', c.actionSeconds);
    el.querySelectorAll('.presets button').forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.p);
      b.classList.toggle('active', p.levelMinutes === c.levelMinutes);
      b.disabled = !canEdit;
    });
    const tbody = $('.blinds tbody', el);
    if (!tbody.contains(document.activeElement)) {
      tbody.innerHTML = c.levels
        .map(
          (l, i) => `<tr><td>${i + 1}</td>
          <td><input type="number" min="1" data-k="sb" value="${l.sb}" ${canEdit ? '' : 'disabled'}></td>
          <td><input type="number" min="1" data-k="bb" value="${l.bb}" ${canEdit ? '' : 'disabled'}></td>
          <td><input type="number" min="0" data-k="ante" value="${l.ante}" ${canEdit ? '' : 'disabled'}></td>
          <td class="t">${fmtMin(i * c.levelMinutes)}</td>
          <td>${canEdit && c.levels.length > 1 ? `<button class="del" data-del="${i}" title="${t('lobby.removeLevel')}">×</button>` : ''}</td></tr>`,
        )
        .join('');
    }
    $('.struct-editor', el).classList.toggle('hidden', !this.structOpen);
    const toggle = $('#btn-struct');
    toggle.textContent = t(this.structOpen ? 'lobby.hide' : canEdit ? 'lobby.edit' : 'lobby.show');
    toggle.setAttribute('aria-expanded', String(this.structOpen));
    const first = c.levels[0];
    const last = c.levels[c.levels.length - 1];
    const preset = PRESETS.find((p) => p.levelMinutes === c.levelMinutes);
    $('.struct-sum', el).innerHTML =
      `<div>${t('lobby.sum0', { title: esc(c.title), felt: t(`look.${c.felt}`), rim: t(`look.${c.rim}`), back: t(`back.${c.cardBack}`) })}</div>` +
      `<div>${t('lobby.sum1', { stack: c.startingStack, min: c.levelMinutes, sec: c.actionSeconds, preset: preset && t(`preset.${preset.id}`) })}</div>` +
      `<div>${t('lobby.sum2', { levels: c.levels.length, sb1: first.sb, bb1: first.bb, sb2: last.sb, bb2: last.bb })}</div>`;
    $('#btn-addlvl').disabled = !canEdit;
    $('#btn-reset').disabled = !canEdit;
    const n = Math.max(2, c.bots ? count : seated);
    const est = estimateMinutes(c, n);
    const bbs = Math.round(c.startingStack / c.levels[0].bb);
    $('.estimate', el).innerHTML = t('lobby.estimate', { n, min: est, bbs });
    const bots = c.bots ? count - seated : 0;
    const botsIn = $('#in-bots');
    botsIn.checked = !!c.bots;
    botsIn.disabled = !canEdit;
    $('.who', el).textContent =
      seated + bots < 2 || seated < 1
        ? t('lobby.needMore', { n: seated, max: count })
        : t('lobby.ready', { n: seated, spec: s.spectators }) + (bots ? ` · ${t('lobby.plusBots', { n: bots })}` : '');
    const startBtn = $('#btn-start');
    startBtn.disabled = !(canEdit && seated + bots >= 2);
  }

  // ------------------------------------------------------------ Update

  update(s) {
    const prev = this.state;
    // One-time hints about the chip riffle and the gadget once you are seated
    if (s.phase === 'running' && s.mySeat != null && !localStorage.getItem('pc.fidgetHint')) {
      localStorage.setItem('pc.fidgetHint', '1');
      setTimeout(() => this.toast(t('tip.fidget')), 4000);
    }
    if (s.phase === 'running' && s.mySeat != null && s.seats[s.mySeat]?.gadget && !localStorage.getItem('pc.gadgetHint')) {
      localStorage.setItem('pc.gadgetHint', '1');
      setTimeout(() => this.toast(t('tip.gadget')), 12000);
    }
    // Somebody knocked over my chips: tell me how to clean up
    const mine = s.mySeat != null ? s.toppled?.[s.mySeat] : null;
    if (prev && mine && mine.seed !== prev.toppled?.[s.mySeat]?.seed) this.toast(t('tip.toppled', { by: mine.by }));
    this.state = s;
    this.stateAt = performance.now();
    document.body.dataset.phase = s.phase;
    this.#renderLobby(s);
    this.#renderTop(s);
    this.#renderPlates(s);
    this.#renderActions(s, prev);
    this.#renderLog(s);
    this.#renderVoice();
    this.#syncVideos();
    this.#renderResults(s);
    this.#renderBanner(s);
    this.#renderRabbit(s);
    this.#renderShowCards(s);
    this.#renderReveal(s);
    this.#renderAway(s);
    this.#renderJoin(s);
  }

  #renderTop(s) {
    const info = $('#topbar .levelinfo');
    $('#btn-pause').classList.toggle('hidden', s.phase !== 'running' || s.mySeat == null);
    $('#btn-pause').innerHTML = s.paused ? ICON.play : ICON.pause;
    $('#btn-pause').title = t(s.paused ? 'top.resume' : 'top.pause');
    $('#btn-abort').disabled = s.phase === 'lobby' || s.mySeat == null;
    if (s.phase === 'lobby') {
      info.innerHTML = `<span class="lv">${t('top.lobby')}</span><span class="muted">${t('top.players', { n: s.seats.filter(Boolean).length, max: s.seats.length })}</span>`;
      return;
    }
    const l = s.level;
    const ante = l.ante ? ` <span class="muted">Ante ${fmt(l.ante)}</span>` : '';
    info.innerHTML = `
      <span class="lv">Level ${l.index + 1}</span>
      <span class="blinds-now">${fmt(l.sb)} / ${fmt(l.bb)}${ante}</span>
      ${s.phase === 'running' ? `<span class="next"><span class="clock" data-clock>${mmss(l.remaining)}</span> <span class="muted">→ ${fmt(l.next.sb)}/${fmt(l.next.bb)}</span></span>` : ''}
      ${s.paused ? `<span class="paused">${t('top.paused')}</span>` : ''}
      ${s.hand ? `<span class="muted hand-no">Hand #${s.hand.id}</span>` : ''}`;
  }

  #renderPlates(s) {
    const h = s.hand;
    const lobby = s.phase === 'lobby';
    // Free seats offer "sit down": in the lobby, and for spectators while late registration is open
    const canSit = lobby || (s.lateReg && s.mySeat == null);
    for (const p of this.plates) {
      const seat = s.seats[p.seat];
      const el = p.el;
      const exists = p.seat < s.seats.length;
      el.classList.toggle('empty', !seat);
      el.classList.toggle('can-sit', exists && !seat && canSit);
      el.classList.toggle('hidden', !exists || (!seat && !canSit));
      p.bet.classList.add('hidden');
      if (!seat) continue;
      const hp = h?.players[p.seat];
      el.classList.toggle('me', s.mySeat === p.seat);
      el.classList.toggle('folded', !!hp?.folded);
      el.classList.toggle('out', seat.eliminated);
      el.classList.toggle('offline', !seat.connected);
      el.classList.toggle('turn', h?.toAct === p.seat && h.phase === 'betting');
      el.classList.toggle('winner', !!h?.results?.winnings[p.seat]);
      $('.ini', el).textContent = initials(seat.name);
      $('.nm', el).textContent = seat.name;
      const stack = lobby ? s.config.startingStack : seat.stack;
      $('.stack', el).innerHTML = seat.eliminated
        ? esc(t('plate.place', { n: seat.place }))
        : hp?.allIn
          ? '<span class="allin">ALL-IN</span>'
          : fmt(stack);
      const tags = [];
      if (h && !seat.eliminated) {
        if (h.buttonSeat === p.seat) tags.push('<b class="t-d">D</b>');
        if (h.sbSeat === p.seat) tags.push('<b>SB</b>');
        if (h.bbSeat === p.seat) tags.push('<b>BB</b>');
      }
      if (seat.bot) tags.push(`<b class="t-bot" title="${esc(t(`profile.${seat.bot}.desc`))}">🤖 ${esc(t(`profile.${seat.bot}.name`))}</b>`);
      if (seat.away) tags.push(`<b class="t-away">${t('plate.away')}</b>`);
      if (!seat.connected) tags.push(`<b class="t-away">${t('plate.offline')}</b>`);
      $('.tag', el).innerHTML = tags.join('');
      const la = hp?.lastAction;
      const act = $('.act', el);
      const winAmt = h?.results?.winnings[p.seat];
      let actText = '';
      if (winAmt) {
        const hand = h.results.hands?.[p.seat];
        actText = `+${fmt(winAmt)}${hand ? ` · ${describeHand(hand)}` : ''}`;
      } else if (h?.results?.hands?.[p.seat]) actText = describeHand(h.results.hands[p.seat]);
      else if (la && !hp.folded) actText = actionLabel(la);
      else if (hp?.folded) actText = t('plate.folded');
      act.textContent = actText;
      act.className = `act ${winAmt ? 'win' : la ? `a-${la.type}` : ''} ${actText ? 'show' : ''}`;
      // Mic status
      const v = s.voice.find((x) => x.seat === p.seat);
      const mic = $('.mic', el);
      mic.innerHTML = v ? (v.muted ? ICON.micOff : '') : '';
      mic.className = `mic ${v?.muted ? 'muted' : ''}`;
      // Bet label
      if (hp?.bet > 0) {
        p.bet.textContent = fmt(hp.bet);
        p.bet.classList.remove('hidden');
      }
    }
    const pot = h && !h.results ? h.potTotal : 0;
    this.potLabel.classList.toggle('hidden', !pot);
    if (pot) {
      const side = h.pots.length > 1 ? `<small>${h.pots.map((x, i) => `${t(i ? 'pot.side' : 'pot.main')} ${fmt(x.amount)}`).join(' · ')}</small>` : '';
      this.potLabel.innerHTML = `<span>${t('pot.pot')}</span> ${fmt(pot)}${side}`;
    }
  }

  // Keep the HTML elements positioned every frame
  #frame() {
    if (!this.state) return;
    const v = new THREE.Vector3();
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Hand strength: on the bottom edge of your own cards, only after they were dealt and turned up
    const strength = $('#strength');
    const st = this.strength;
    const showStrength = !!st && this.view.ownCardsUp === st.hand && this.state.mySeat != null;
    strength.classList.toggle('hidden', !showStrength);
    if (showStrength) {
      const pt = this.stage.project(this.view.anchors(this.state.mySeat).cards, v);
      strength.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
    }
    for (const p of this.plates) {
      if (p.el.classList.contains('hidden')) continue;
      const A = this.view.anchors(p.seat);
      const pt = this.stage.project(A.plate, v);
      const x = Math.min(W - 90, Math.max(90, pt.x));
      const y = Math.min(H - 40, Math.max(70, pt.y));
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (!p.bet.classList.contains('hidden')) {
        // Own bet label next to the chips so it does not cover your own cards
        const at = this.view.isMe(p.seat) ? A.bet.clone().addScaledVector(A.right, 0.95) : A.bet.clone().addScaledVector(A.normal, 0.55);
        const b = this.stage.project(at, v);
        p.bet.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
      }
      // Speaking indicator
      const vs = this.state.voice.find((x) => x.seat === p.seat);
      let level = 0;
      if (vs && this.voice) level = this.voice.levels.get(vs.self ? 'self' : vs.id) || 0;
      p.el.style.setProperty('--speak', level > 0.08 ? Math.min(1, level * 1.6).toFixed(2) : '0');
    }
    if (!this.rabbitLabel.classList.contains('hidden')) {
      const b = this.stage.project(BELOW_BOARD(), v);
      this.rabbitLabel.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
    }
    if (!this.potLabel.classList.contains('hidden')) {
      // above the pot chips (in portrait the pot sits above the board)
      const off = isPortrait() ? new THREE.Vector3(0, 0, -0.9) : tableToWorld(0, 0, -1.05);
      const b = this.stage.project(POT_POS().add(off), v);
      this.potLabel.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
    }
  }

  #tick() {
    const s = this.state;
    if (!s) return;
    const elapsed = performance.now() - this.stateAt;
    const clock = $('[data-clock]');
    if (clock && !s.paused) clock.textContent = mmss(s.level.remaining - elapsed);
    // Turn timer
    const h = s.hand;
    for (const p of this.plates) {
      const c = p.el.querySelector('.timer circle');
      if (h && h.toAct === p.seat && s.turnRemaining > 0) {
        const frac = Math.max(0, (s.turnRemaining - elapsed) / Math.max(s.turnTotal, s.turnRemaining));
        c.style.strokeDashoffset = String(126 * (1 - frac));
        p.el.classList.toggle('hurry', frac < 0.25);
      } else {
        c.style.strokeDashoffset = '126';
        p.el.classList.remove('hurry');
      }
    }
    const revealBar = $('#reveal:not(.hidden) .bar');
    if (revealBar) revealBar.style.transform = `scaleX(${Math.max(0, (this.revealDeadline - performance.now()) / 20000)})`;
    const rabbitBar = $('#rabbit:not(.hidden) .bar');
    if (rabbitBar) {
      const left = this.rabbitDeadline - performance.now();
      rabbitBar.style.transform = `scaleX(${Math.max(0, left / 5000)})`;
      if (left <= 0) $('#rabbit').classList.add('hidden');
    }
    const showBar = $('#showcards:not(.hidden) .bar');
    if (showBar) {
      const left = this.showDeadline - performance.now();
      showBar.style.transform = `scaleX(${Math.max(0, left / this.showTotal)})`;
      if (left <= 0) $('#showcards').classList.add('hidden');
    }
    const bar = $('#actions .timebar i');
    if (bar && h?.legal) {
      const frac = Math.max(0, (s.turnRemaining - elapsed) / Math.max(1, s.turnTotal));
      bar.style.transform = `scaleX(${frac})`;
      bar.parentElement.classList.toggle('hurry', frac < 0.25);
    }
    // Voice levels in the list
    if (this.voice) {
      document.querySelectorAll('#voice li[data-id]').forEach((li) => {
        const lvl = this.voice.levels.get(li.dataset.self ? 'self' : li.dataset.id) || 0;
        li.style.setProperty('--lvl', lvl > 0.06 ? Math.min(1, lvl * 1.5).toFixed(2) : '0');
      });
    }
  }

  // ------------------------------------------------------------ Actions

  #renderActions(s, prev) {
    const h = s.hand;
    const el = this.actions;
    const me = s.mySeat;
    const hp = h && me != null ? h.players[me] : null;
    // Hand strength: shown and positioned in #frame once your cards lie face up
    const text = hp?.cards && !hp.folded ? describeHole(hp.cards, h.board) : '';
    this.strength = text ? { text, hand: h.id } : null;
    if (text) $('#strength').textContent = text;

    if (h?.id !== this.autoHand) {
      this.autoHand = h?.id;
      this.autoCheckFold = false;
    }

    const legal = h?.legal;
    const key = legal ? `${h.id}:${h.street}:${h.toAct}:${h.currentBet}` : hp && !hp.folded && !hp.allIn && h.phase === 'betting' ? `wait:${h.id}:${this.autoCheckFold}` : null;
    if (key === this.actionKey) return;
    this.actionKey = key;

    if (!legal) {
      if (hp && !hp.folded && !hp.allIn && h.phase === 'betting') {
        el.className = 'waiting';
        el.innerHTML = `<label class="pre"><input type="checkbox" ${this.autoCheckFold ? 'checked' : ''}> Check / Fold</label>`;
        el.querySelector('input').onchange = (e) => {
          this.autoCheckFold = e.target.checked;
          this.actionKey = null;
        };
      } else {
        el.className = 'hidden';
        el.innerHTML = '';
      }
      return;
    }

    // My turn
    if (this.autoCheckFold) {
      this.autoCheckFold = false;
      this.send('action', { type: legal.canCheck ? 'check' : 'fold' });
      return;
    }
    const turnKey = `${h.id}:${h.street}:${h.currentBet}`;
    if (turnKey !== this.lastTurnKey) {
      this.lastTurnKey = turnKey;
      sfx.turn();
      if (document.hidden) flashTitle(t('act.yourTurn'));
    }

    const potNow = h.potTotal + Object.values(h.players).reduce((a, p) => a + p.bet, 0);
    const callAll = legal.toCall >= hp.stack;
    // Do I have to call another player's all-in? -> Tequila!
    const facingAllIn = Object.entries(h.players).some(([seat, p]) => Number(seat) !== me && !p.folded && p.allIn && p.bet > hp.bet);
    el.className = 'mine';
    const presets = [
      ['Min', legal.minTo],
      ['½ Pot', potBet(0.5)],
      ['¾ Pot', potBet(0.75)],
      ['Pot', potBet(1)],
      ['All-in', legal.maxTo],
    ];
    function potBet(f) {
      const to = legal.currentBet + f * (potNow + legal.toCall);
      return Math.round(Math.max(legal.minTo, Math.min(legal.maxTo, to)));
    }
    const step = Math.max(1, h.sb);
    el.innerHTML = `
      <div class="timebar"><i></i></div>
      ${
        legal.canRaise && legal.minTo < legal.maxTo
          ? `<div class="raise-box">
        <div class="presets">${presets.map(([l, v]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <div class="slider-row">
          <input type="range" min="${legal.minTo}" max="${legal.maxTo}" step="${step}" value="${legal.minTo}">
          <input type="number" min="${legal.minTo}" max="${legal.maxTo}" value="${legal.minTo}">
        </div></div>`
          : ''
      }
      <div class="btns">
        ${legal.canCall ? `<button class="fold" data-a="fold">${t('act.fold')} <kbd>F</kbd></button>` : ''}
        ${
          legal.canCheck
            ? `<button class="call" data-a="check">${t('act.check')} <kbd>C</kbd></button>`
            : `<button class="call${facingAllIn ? ' vs-allin' : ''}" data-a="call"${facingAllIn ? ` title="${esc(t('act.callAllIn', { amount: legal.toCall }))}"` : ''}>${facingAllIn ? TEQUILA_SHOT : ''}${facingAllIn ? t('act.tequila') : callAll ? 'All-in' : t('act.call')} ${fmt(legal.toCall)} <kbd>C</kbd></button>`
        }
        ${
          legal.canRaise
            ? legal.minTo < legal.maxTo
              ? `<button class="raise" data-a="raise">${t(legal.isBet ? 'act.bet' : 'act.raiseTo')} <b class="rv">${fmt(legal.minTo)}</b> <kbd>R</kbd></button>`
              : `<button class="raise" data-a="allin">All-in ${fmt(legal.maxTo)} <kbd>R</kbd></button>`
            : ''
        }
      </div>`;
    const range = el.querySelector('input[type=range]');
    const num = el.querySelector('input[type=number]');
    const rv = el.querySelector('.rv');
    const setAmt = (v) => {
      v = Math.round(Number(v));
      if (!Number.isFinite(v)) return;
      const clamped = Math.max(legal.minTo, Math.min(legal.maxTo, v));
      if (range) range.value = clamped;
      if (num && document.activeElement !== num) num.value = clamped;
      this.raiseTo = clamped;
      if (rv) rv.textContent = clamped >= legal.maxTo ? `${fmt(clamped)} (All-in)` : fmt(clamped);
    };
    this.raiseTo = legal.minTo;
    range?.addEventListener('input', () => setAmt(range.value));
    num?.addEventListener('input', () => setAmt(num.value));
    num?.addEventListener('change', () => (num.value = this.raiseTo));
    el.querySelectorAll('.presets button').forEach((b) => (b.onclick = () => setAmt(b.dataset.v)));
    el.querySelectorAll('.btns button').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'raise') this.send('action', { type: this.raiseTo >= legal.maxTo ? 'allin' : 'raise', amount: this.raiseTo });
        else this.send('action', { type: a });
        el.className = 'hidden';
      };
    });
  }

  #hotkeys(e) {
    if (e.target.matches('input:not([type=range]), textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.state?.hand?.legal || this.actions.className !== 'mine') return;
    const k = e.key.toLowerCase();
    const click = (sel) => this.actions.querySelector(sel)?.click();
    if (k === 'f') click('[data-a=fold]');
    else if (k === 'c') click('[data-a=check], [data-a=call]');
    else if (k === 'r') click('[data-a=raise], [data-a=allin]');
  }

  #renderAway(s) {
    const me = s.mySeat != null ? s.seats[s.mySeat] : null;
    const el = $('#away');
    const away = !!me?.away && s.phase === 'running' && !me.eliminated;
    el.classList.toggle('hidden', !away);
    if (away && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.querySelector('button').onclick = () => this.send('back');
    }
  }

  // ------------------------------------------------------------ Log & Voice

  #renderLog(s) {
    const list = $('#log .log-list');
    const newest = s.log[s.log.length - 1]?.id || 0;
    if (newest === this.lastLog) return;
    const initial = this.lastLog === 0;
    const fresh = s.log.filter((e) => e.id > this.lastLog);
    this.lastLog = newest;
    list.innerHTML = s.log.map((e) => `<li class="k-${e.kind}"><time>${clock(e.t)}</time>${esc(t(`log.${e.key}`, e.p))}</li>`).join('');
    list.scrollTop = list.scrollHeight;
    if (!initial && !$('#log').classList.contains('open')) {
      this.unread += fresh.filter((e) => e.kind === 'chat').length;
      this.#renderBadge();
    }
    if (!initial) for (const e of fresh) if (e.kind === 'level') this.toast(t(`log.${e.key}`, e.p), 'level');
  }

  #renderBadge() {
    const b = $('#log .badge');
    b.textContent = String(this.unread);
    b.classList.toggle('hidden', !this.unread);
  }

  #renderVoice() {
    const v = this.voice;
    const micBtn = $('#btn-mic');
    const deaf = $('#btn-deaf');
    if (!v) {
      micBtn.innerHTML = `${ICON.micOff}<span>${t('voice.off')}</span>`;
      micBtn.className = 'mic-btn off';
      return;
    }
    if (!v.hasMic) {
      micBtn.innerHTML = `${ICON.micOff}<span>${esc(t(v.micError ? `voice.${v.micError}` : 'voice.noMic'))}</span>`;
      micBtn.className = 'mic-btn off';
    } else {
      micBtn.innerHTML = `${v.muted ? ICON.micOff : ICON.mic}<span>${t(v.muted ? 'voice.muted' : 'voice.micOn')}</span>`;
      micBtn.className = `mic-btn ${v.muted ? 'off' : 'on'}`;
      micBtn.title = t('voice.micTitle');
    }
    deaf.innerHTML = v.deafened ? ICON.speakerOff : ICON.speaker;
    deaf.classList.toggle('off', v.deafened);
    const cam = $('#btn-cam');
    cam.innerHTML = v.videoOn ? ICON.cam : ICON.camOff;
    cam.classList.toggle('off', !v.videoOn);
    cam.classList.toggle('on', v.videoOn);
    this.#syncVideos();
    const s = this.state;
    if (!s) return;
    const list = $('#voice .vlist');
    list.innerHTML = s.voice
      .map((p) => {
        const name = p.name || t('spectator');
        const st = p.self ? 'connected' : v.peerState(p.id);
        return `<li data-id="${p.id}" ${p.self ? 'data-self="1"' : ''} class="${p.muted ? 'muted' : ''} st-${st}">
          <span class="dot"></span><span class="vn">${esc(name)}${p.self ? ` ${t('voice.you')}` : ''}</span>
          ${p.video ? `<span class="vm cam">${ICON.cam}</span>` : ''}<span class="vm">${p.muted ? ICON.micOff : ICON.mic}</span></li>`;
      })
      .join('');
  }

  // Live video in the round nameplate avatar (the camera is opt-in)
  #syncVideos() {
    const s = this.state;
    const v = this.voice;
    for (const p of this.plates) {
      const avatar = p.el.querySelector('.avatar');
      const entry = s && v ? s.voice.find((x) => x.seat === p.seat && x.video && (x.self || s.seats[p.seat])) : null;
      const video = entry ? v.videoFor(entry.self ? 'self' : entry.id) : null;
      const current = avatar.querySelector('video');
      if (current && current !== video) {
        current.remove();
        v?.mediaRoot.appendChild(current);
      }
      if (video && current !== video) {
        avatar.prepend(video);
        video.play().catch(() => {});
      }
      if (video) video.classList.toggle('mirror', !!entry.self);
      p.el.classList.toggle('has-video', !!video);
      if (!video) p.el.classList.remove('zoom');
    }
  }

  // ------------------------------------------------------------ Results

  // All-in runout: reveal the next street on click (bar = automatic reveal)
  #renderReveal(s) {
    const rv = s.reveal;
    const show = !!rv && s.mySeat != null;
    const el = $('#reveal');
    el.classList.toggle('hidden', !show);
    if (!show) return;
    $('.rv-label', el).textContent = t(`reveal.${rv.next}`);
    this.revealDeadline = performance.now() + rv.remaining;
  }

  // Rabbit Cam: offer it for 5 seconds, then label the requested cards
  #renderRabbit(s) {
    const rb = s.rabbit;
    const offer = !!rb?.open && s.mySeat != null;
    const el = $('#rabbit');
    if (offer && el.classList.contains('hidden')) el.classList.remove('hidden');
    if (!offer) el.classList.add('hidden');
    if (offer) this.rabbitDeadline = performance.now() + rb.remaining;
    const show = !!rb?.cards;
    this.rabbitLabel.classList.toggle('hidden', !show);
    if (show) this.rabbitLabel.textContent = `🐇 Rabbit Cam · ${rb.by}`;
  }

  // Won because everybody else folded: offer to show the left card, the right card or both
  #renderShowCards(s) {
    const o = s.showOffer;
    const cards = s.mySeat != null ? s.hand?.players?.[s.mySeat]?.cards : null;
    const offer = !!o && o.seat === s.mySeat && !o.done && o.remaining > 0 && !!cards?.[0] && !!cards?.[1];
    const el = $('#showcards');
    el.classList.toggle('hidden', !offer);
    if (!offer) return;
    this.showDeadline = performance.now() + o.remaining;
    this.showTotal = o.total;
    const key = `${s.hand.id}:${getLang()}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const mini = (c) => `<span class="mini ${'hd'.includes(c[1]) ? 'red' : ''}">${c[0] === 'T' ? '10' : c[0]}${SUITS[c[1]]}</span>`;
    el.innerHTML = `<div class="sc-title">${t('show.title')}</div>
      <div class="sc-opts">
        <button data-show="0">${mini(cards[0])}</button>
        <button data-show="1">${mini(cards[1])}</button>
        <button data-show="both" class="both">${mini(cards[0])}${mini(cards[1])}<em>${t('show.both')}</em></button>
      </div><i class="bar"></i>`;
  }

  #renderBanner(s) {
    const h = s.hand;
    const el = $('#banner');
    if (!h?.results) {
      el.classList.remove('show');
      return;
    }
    const key = `${h.id}`;
    if (key === this.lastResultKey) return;
    this.lastResultKey = key;
    const r = h.results;
    const lines = r.pots.map((pot, i) => {
      const names = pot.winners.map((x) => esc(s.seats[x]?.name)).join(' & ');
      const label = r.pots.length > 1 ? (i === 0 ? t('banner.main') : t('banner.side', { n: i })) : t('banner.pot');
      return `<div class="line"><b>${names}</b> ${t(pot.winners.length > 1 ? 'banner.split' : 'banner.wins')} ${label} <span class="amt">${fmt(pot.amount)}</span>${
        pot.hand ? `<div class="hn">${esc(describeHand(pot.hand))}</div>` : ''
      }</div>`;
    });
    el.innerHTML = lines.join('');
    const delay = r.uncontested ? 500 : 1300;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => {
      el.classList.add('show');
      this.bannerT = setTimeout(() => el.classList.remove('show'), r.uncontested ? 2200 : 4600);
    }, delay);
  }

  #renderResults(s) {
    const el = $('#results');
    const show = s.phase === 'finished';
    el.classList.toggle('hidden', !show);
    if (!show) {
      this.resultsRendered = false;
      return;
    }
    if (this.resultsRendered) return;
    this.resultsRendered = true;
    const medal = ['🥇', '🥈', '🥉'];
    const mins = Math.round(s.level.elapsed / 60000);
    el.innerHTML = `
      <div class="results-card">
        <div class="trophy">🏆</div>
        <h1>${esc(t('results.wins', { name: s.results[0]?.name }))}</h1>
        <p class="sub">${t('results.duration', { min: mins, level: s.level.index + 1 })}</p>
        <ol>${s.results.map((r) => `<li><span class="pl">${medal[r.place - 1] || `${r.place}.`}</span><span>${esc(r.name)}</span></li>`).join('')}</ol>
        <button class="primary" id="btn-new">${t('results.again')}</button>
      </div>`;
    $('#btn-new').onclick = () => this.send('newTournament');
    if (!this.relocalizing) sfx.win();
  }

  toast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    $('#toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, kind === 'error' ? 3500 : 4500);
  }
}

// ------------------------------------------------------------ Helpers

function actionLabel(la) {
  const p = { amount: la.amount };
  if (la.allIn && ['call', 'bet', 'raise'].includes(la.type)) return t('act.allIn', p);
  switch (la.type) {
    case 'sb': return t('act.sb', p);
    case 'bb': return t('act.bbl', p);
    case 'check': return t('act.checked');
    case 'call': return t('act.called', p);
    case 'bet': return t('act.betted', p);
    case 'raise': return t('act.raised', p);
    case 'fold': return t('plate.folded');
    default: return '';
  }
}

let flashTimer = null;
function flashTitle(msg) {
  const orig = 'PokerCrew';
  clearInterval(flashTimer);
  let on = false;
  flashTimer = setInterval(() => {
    document.title = (on = !on) ? msg : orig;
  }, 900);
  const stop = () => {
    clearInterval(flashTimer);
    document.title = orig;
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
}
