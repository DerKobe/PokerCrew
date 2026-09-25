// HTML-Oberfläche über der 3D-Szene.
import * as THREE from 'three';
import { SEATS, POT_POS, tableToWorld, isPortrait } from './scene.js';
import { PRESETS, defaultConfig, estimateMinutes, levelAt } from '/shared/config.js';
import { evaluateBest, rankValue } from '/shared/cards.js';
import { sfx } from './sound.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('de-DE');
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
  link: '<svg viewBox="0 0 24 24"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z"/></svg>',
};

// Tequila-Shot fürs Callen gegen ein All-in: Shotglas mit goldgelbem Tequila und Orangenscheibe am Rand
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
    this.#build();
    stage.onFrame.push(() => this.#frame());
    setInterval(() => this.#tick(), 250);
  }

  setVoice(voice) {
    this.voice = voice;
    voice.onChange = () => this.#renderVoice();
    this.#renderVoice();
  }

  // ------------------------------------------------------------ Aufbau

  #build() {
    // Namensschilder
    const plates = $('#plates');
    this.plates = [];
    for (let i = 0; i < SEATS; i++) {
      const el = document.createElement('div');
      el.className = 'plate empty';
      el.innerHTML = `
        <div class="avatar"><svg class="timer" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20"/></svg><span class="ini"></span><span class="speak"></span></div>
        <div class="meta"><div class="name"><span class="nm"></span><i class="mic"></i></div><div class="stack"></div></div>
        <div class="tag"></div>
        <div class="act"></div>
        <button class="sit">Platz ${i + 1} · Hinsetzen</button>`;
      el.querySelector('.sit').addEventListener('click', () => this.#sitAt(i));
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

    // Topbar
    $('#topbar').innerHTML = `
      <div class="brand"><span class="logo">♠</span> PokerCrew</div>
      <div class="levelinfo"></div>
      <div class="tools">
        <button class="icon" id="btn-invite" title="Link kopieren">${ICON.link}</button>
        <button class="icon" id="btn-pause" title="Pause">${ICON.pause}</button>
        <button class="icon" id="btn-sfx" title="Soundeffekte">${ICON.bell}</button>
        <button class="icon" id="btn-menu" title="Menü">${ICON.menu}</button>
        <div class="menu hidden" id="menu">
          <button id="btn-abort">Turnier abbrechen</button>
          <button id="btn-full">Vollbild</button>
        </div>
      </div>`;
    $('#btn-invite').onclick = () => {
      navigator.clipboard?.writeText(location.origin).then(
        () => this.toast('Link kopiert – schick ihn deinen Freunden!'),
        () => this.toast(location.origin),
      );
    };
    $('#btn-pause').onclick = () => this.send('pause');
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
      if (confirm('Turnier wirklich für alle abbrechen?')) this.send('abort');
    };
    $('#btn-full').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    };

    // Voice
    $('#voice').innerHTML = `
      <div class="vhead">
        <button class="mic-btn" id="btn-mic"></button>
        <button class="icon" id="btn-cam" title="Kamera an/aus"></button>
        <button class="icon" id="btn-deaf" title="Alle stummschalten (Lautsprecher)"></button>
        <div class="vtitle">Voice</div>
      </div>
      <ul class="vlist"></ul>`;
    $('#btn-mic').onclick = () => this.voice && this.voice.hasMic && this.voice.setMuted(!this.voice.muted);
    $('#btn-deaf').onclick = () => this.voice && this.voice.setDeafened(!this.voice.deafened);
    $('#btn-cam').onclick = async () => {
      if (!this.voice) return;
      await this.voice.setVideo(!this.voice.videoOn);
      if (!this.voice.videoOn && this.voice.camError) this.toast(this.voice.camError, 'error');
    };
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'm' || e.key === 'M') this.voice?.hasMic && this.voice.setMuted(!this.voice.muted);
    });

    // Log & Chat
    $('#log').innerHTML = `
      <button class="log-toggle" id="log-toggle">${ICON.chat}<span>Verlauf</span><b class="badge hidden">0</b></button>
      <div class="log-body"><ul class="log-list"></ul>
      <form class="chat"><input maxlength="200" placeholder="Nachricht…" autocomplete="off"><button>Senden</button></form></div>`;
    const logEl = $('#log');
    if (localStorage.getItem('pc.logOpen') !== '0' && window.innerWidth > 800) logEl.classList.add('open');
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

    // Aktionen
    this.actions = $('#actions');
    window.addEventListener('keydown', (e) => this.#hotkeys(e));

    // Lobby
    this.#buildLobby();
  }

  // ------------------------------------------------------------ Lobby

  #buildLobby() {
    const el = $('#lobby');
    el.innerHTML = `
      <div class="lobby-card">
        <h1>Neues Turnier</h1>
        <p class="sub">Wähle einen Platz, gib deinen Namen ein – los geht's, sobald mindestens zwei sitzen.</p>
        <div class="row name-row">
          <label>Dein Name<input id="in-name" maxlength="16" placeholder="z. B. Alex" autocomplete="nickname"></label>
        </div>
        <div class="seatgrid"></div>
        <div class="struct">
          <div class="struct-head">
            <h2>Turnierstruktur</h2>
            <div class="presets"></div>
          </div>
          <div class="row three">
            <label>Startchips<input id="in-stack" type="number" min="100" step="100"></label>
            <label>Level-Dauer (Min.)<input id="in-level" type="number" min="1" max="120"></label>
            <label>Zeit pro Zug (Sek.)<input id="in-action" type="number" min="10" max="300"></label>
          </div>
          <div class="row struct-summary">
            <div class="blind-summary"></div>
            <button class="ghost" id="btn-blinds" aria-expanded="false"></button>
          </div>
          <div class="blinds-editor hidden">
            <div class="blinds-wrap">
              <table class="blinds"><thead><tr><th>Level</th><th>Small Blind</th><th>Big Blind</th><th>Ante</th><th>Beginn</th><th></th></tr></thead><tbody></tbody></table>
            </div>
            <div class="row struct-foot">
              <button class="ghost" id="btn-addlvl">+ Level</button>
              <button class="ghost" id="btn-reset">Standard</button>
            </div>
          </div>
          <div class="estimate"></div>
          <p class="hint readonly-hint">Nur Spieler am Tisch können die Struktur ändern.</p>
        </div>
        <div class="lobby-foot">
          <div class="who"></div>
          <button class="primary" id="btn-start">Turnier starten</button>
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
      if (mine != null && this.name.trim()) this.send('sit', { seat: mine, name: this.name });
    });
    $('.presets', el).innerHTML = PRESETS.map((p) => `<button class="chip-btn" data-p="${p.id}">${p.label}</button>`).join('');
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
    $('#btn-reset').onclick = () => this.send('config', defaultConfig());
    $('#btn-start').onclick = () => this.send('start');
    // Blindstruktur ist standardmäßig eingeklappt
    this.blindsOpen = false;
    $('#btn-blinds').onclick = () => {
      this.blindsOpen = !this.blindsOpen;
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

  #sitAt(seat) {
    const name = (this.name || '').trim();
    if (!name) {
      $('#lobby').classList.remove('hidden');
      $('#in-name').focus();
      this.toast('Bitte zuerst deinen Namen eingeben.', 'error');
      return;
    }
    this.send('sit', { seat, name });
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

    // Sitze
    $('.seatgrid', el).innerHTML = s.seats
      .map((seat, i) => {
        const mine = s.mySeat === i;
        if (seat)
          return `<div class="seat taken ${mine ? 'mine' : ''} ${seat.connected ? '' : 'offline'}"><span class="no">${i + 1}</span><span class="sn">${esc(seat.name)}</span>${
            mine ? '<button class="ghost small" data-stand>Aufstehen</button>' : seat.connected ? '' : '<em>offline</em>'
          }</div>`;
        return `<button class="seat free" data-seat="${i}"><span class="no">${i + 1}</span><span class="sn">Freier Platz</span><span class="cta">${s.mySeat != null ? 'Wechseln' : 'Hinsetzen'}</span></button>`;
      })
      .join('');
    el.querySelectorAll('[data-seat]').forEach((b) => (b.onclick = () => this.#sitAt(Number(b.dataset.seat))));
    el.querySelector('[data-stand]')?.addEventListener('click', () => this.send('stand'));

    // Struktur
    const c = s.config;
    const setVal = (id, v) => {
      const inp = $(id);
      if (document.activeElement !== inp) inp.value = v;
      inp.disabled = !canEdit;
    };
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
          <td>${canEdit && c.levels.length > 1 ? `<button class="del" data-del="${i}" title="Level entfernen">×</button>` : ''}</td></tr>`,
        )
        .join('');
    }
    $('.blinds-editor', el).classList.toggle('hidden', !this.blindsOpen);
    const toggle = $('#btn-blinds');
    toggle.textContent = this.blindsOpen ? 'Blindstruktur ausblenden ▴' : canEdit ? 'Blindstruktur bearbeiten ▾' : 'Blindstruktur anzeigen ▾';
    toggle.setAttribute('aria-expanded', String(this.blindsOpen));
    const first = c.levels[0];
    const last = c.levels[c.levels.length - 1];
    $('.blind-summary', el).innerHTML = `<b>${c.levels.length} Level</b> à ${c.levelMinutes} Min. · Blinds ${fmt(first.sb)}/${fmt(first.bb)} → ${fmt(last.sb)}/${fmt(last.bb)}`;
    $('#btn-addlvl').disabled = !canEdit;
    $('#btn-reset').disabled = !canEdit;
    const n = Math.max(2, seated);
    const est = estimateMinutes(c, n);
    const bbs = Math.round(c.startingStack / c.levels[0].bb);
    $('.estimate', el).innerHTML = `Voraussichtliche Dauer mit ${n} Spielern: <b>ca. ${fmtMin(est)}</b> · Start mit ${bbs} Big Blinds`;
    $('.who', el).textContent =
      seated < 2 ? `${seated} von 5 Plätzen belegt – mindestens 2 nötig` : `${seated} Spieler bereit${s.spectators ? ` · ${s.spectators} Zuschauer` : ''}`;
    const startBtn = $('#btn-start');
    startBtn.disabled = !(canEdit && seated >= 2);
  }

  // ------------------------------------------------------------ Update

  update(s) {
    const prev = this.state;
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
    this.#renderAway(s);
  }

  #renderTop(s) {
    const info = $('#topbar .levelinfo');
    $('#btn-pause').classList.toggle('hidden', s.phase !== 'running' || s.mySeat == null);
    $('#btn-pause').innerHTML = s.paused ? ICON.play : ICON.pause;
    $('#btn-pause').title = s.paused ? 'Fortsetzen' : 'Pause';
    $('#btn-abort').disabled = s.phase === 'lobby' || s.mySeat == null;
    if (s.phase === 'lobby') {
      info.innerHTML = `<span class="lv">Lobby</span><span class="muted">${s.seats.filter(Boolean).length}/5 Spieler</span>`;
      return;
    }
    const l = s.level;
    const ante = l.ante ? ` <span class="muted">Ante ${fmt(l.ante)}</span>` : '';
    info.innerHTML = `
      <span class="lv">Level ${l.index + 1}</span>
      <span class="blinds-now">${fmt(l.sb)} / ${fmt(l.bb)}${ante}</span>
      ${s.phase === 'running' ? `<span class="next"><span class="clock" data-clock>${mmss(l.remaining)}</span> <span class="muted">→ ${fmt(l.next.sb)}/${fmt(l.next.bb)}</span></span>` : ''}
      ${s.paused ? '<span class="paused">PAUSE</span>' : ''}
      ${s.hand ? `<span class="muted hand-no">Hand #${s.hand.id}</span>` : ''}`;
  }

  #renderPlates(s) {
    const h = s.hand;
    const lobby = s.phase === 'lobby';
    for (const p of this.plates) {
      const seat = s.seats[p.seat];
      const el = p.el;
      el.classList.toggle('empty', !seat);
      el.classList.toggle('can-sit', !seat && lobby);
      el.classList.toggle('hidden', !seat && !lobby);
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
        ? `Platz ${seat.place}`
        : hp?.allIn
          ? '<span class="allin">ALL-IN</span>'
          : fmt(stack);
      const tags = [];
      if (h && !seat.eliminated) {
        if (h.buttonSeat === p.seat) tags.push('<b class="t-d">D</b>');
        if (h.sbSeat === p.seat) tags.push('<b>SB</b>');
        if (h.bbSeat === p.seat) tags.push('<b>BB</b>');
      }
      if (seat.away) tags.push('<b class="t-away">abwesend</b>');
      if (!seat.connected) tags.push('<b class="t-away">offline</b>');
      $('.tag', el).innerHTML = tags.join('');
      const la = hp?.lastAction;
      const act = $('.act', el);
      const winAmt = h?.results?.winnings[p.seat];
      let actText = '';
      if (winAmt) {
        const hand = h.results.hands?.[p.seat]?.name;
        actText = `+${fmt(winAmt)}${hand ? ` · ${hand}` : ''}`;
      } else if (h?.results?.hands?.[p.seat]) actText = h.results.hands[p.seat].name;
      else if (la && !hp.folded) actText = actionLabel(la);
      else if (hp?.folded) actText = 'Gepasst';
      act.textContent = actText;
      act.className = `act ${winAmt ? 'win' : la ? `a-${la.type}` : ''} ${actText ? 'show' : ''}`;
      // Mikro-Status
      const v = s.voice.find((x) => x.seat === p.seat);
      const mic = $('.mic', el);
      mic.innerHTML = v ? (v.muted ? ICON.micOff : '') : '';
      mic.className = `mic ${v?.muted ? 'muted' : ''}`;
      // Einsatz-Label
      if (hp?.bet > 0) {
        p.bet.textContent = fmt(hp.bet);
        p.bet.classList.remove('hidden');
      }
    }
    const pot = h && !h.results ? h.potTotal : 0;
    this.potLabel.classList.toggle('hidden', !pot);
    if (pot) {
      const side = h.pots.length > 1 ? `<small>${h.pots.map((x, i) => `${i ? 'Side' : 'Main'} ${fmt(x.amount)}`).join(' · ')}</small>` : '';
      this.potLabel.innerHTML = `<span>Pot</span> ${fmt(pot)}${side}`;
    }
  }

  // Position der HTML-Elemente jede Frame nachführen
  #frame() {
    if (!this.state) return;
    const v = new THREE.Vector3();
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const p of this.plates) {
      if (p.el.classList.contains('hidden')) continue;
      const A = this.view.anchors(p.seat);
      const pt = this.stage.project(A.plate, v);
      const x = Math.min(W - 90, Math.max(90, pt.x));
      const y = Math.min(H - 40, Math.max(70, pt.y));
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (!p.bet.classList.contains('hidden')) {
        // Eigenes Einsatz-Label neben die Chips, damit es nicht über den eigenen Karten liegt
        const at = this.view.isMe(p.seat) ? A.bet.clone().addScaledVector(A.right, 0.95) : A.bet.clone().addScaledVector(A.normal, 0.55);
        const b = this.stage.project(at, v);
        p.bet.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
      }
      // Sprechanzeige
      const vs = this.state.voice.find((x) => x.seat === p.seat);
      let level = 0;
      if (vs && this.voice) level = this.voice.levels.get(vs.self ? 'self' : vs.id) || 0;
      p.el.style.setProperty('--speak', level > 0.08 ? Math.min(1, level * 1.6).toFixed(2) : '0');
    }
    if (!this.potLabel.classList.contains('hidden')) {
      // Querformat: über den Pot-Chips; Hochformat: darunter, damit es nicht ins Board ragt
      const off = isPortrait() ? new THREE.Vector3(-0.35, 0, 0.95) : tableToWorld(0, 0, -1.05);
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
    // Zug-Timer
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
    const bar = $('#actions .timebar i');
    if (bar && h?.legal) {
      const frac = Math.max(0, (s.turnRemaining - elapsed) / Math.max(1, s.turnTotal));
      bar.style.transform = `scaleX(${frac})`;
      bar.parentElement.classList.toggle('hurry', frac < 0.25);
    }
    // Voice-Pegel in der Liste
    if (this.voice) {
      document.querySelectorAll('#voice li[data-id]').forEach((li) => {
        const lvl = this.voice.levels.get(li.dataset.self ? 'self' : li.dataset.id) || 0;
        li.style.setProperty('--lvl', lvl > 0.06 ? Math.min(1, lvl * 1.5).toFixed(2) : '0');
      });
    }
  }

  // ------------------------------------------------------------ Aktionen

  #renderActions(s, prev) {
    const h = s.hand;
    const el = this.actions;
    const me = s.mySeat;
    const hp = h && me != null ? h.players[me] : null;
    // Handstärke
    const strength = $('#strength');
    if (hp?.cards && !hp.folded) {
      strength.textContent = describeHole(hp.cards, h.board);
      strength.classList.remove('hidden');
    } else strength.classList.add('hidden');

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

    // Ich bin dran
    if (this.autoCheckFold) {
      this.autoCheckFold = false;
      this.send('action', { type: legal.canCheck ? 'check' : 'fold' });
      return;
    }
    const turnKey = `${h.id}:${h.street}:${h.currentBet}`;
    if (turnKey !== this.lastTurnKey) {
      this.lastTurnKey = turnKey;
      sfx.turn();
      if (document.hidden) flashTitle('♠ Du bist dran!');
    }

    const potNow = h.potTotal + Object.values(h.players).reduce((a, p) => a + p.bet, 0);
    const callAll = legal.toCall >= hp.stack;
    // Muss ich das All-in eines anderen Spielers bezahlen? -> Tequila!
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
        ${legal.canCall ? '<button class="fold" data-a="fold">Passen <kbd>F</kbd></button>' : ''}
        ${
          legal.canCheck
            ? '<button class="call" data-a="check">Checken <kbd>C</kbd></button>'
            : `<button class="call${facingAllIn ? ' vs-allin' : ''}" data-a="call"${facingAllIn ? ` title="All-in callen (${fmt(legal.toCall)})"` : ''}>${facingAllIn ? TEQUILA_SHOT : ''}${facingAllIn ? 'Tequila!' : callAll ? 'All-in' : 'Mitgehen'} ${fmt(legal.toCall)} <kbd>C</kbd></button>`
        }
        ${
          legal.canRaise
            ? legal.minTo < legal.maxTo
              ? `<button class="raise" data-a="raise">${legal.isBet ? 'Setzen' : 'Erhöhen auf'} <b class="rv">${fmt(legal.minTo)}</b> <kbd>R</kbd></button>`
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
    list.innerHTML = s.log
      .map((e) => `<li class="k-${e.kind}"><time>${new Date(e.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</time>${esc(e.text)}</li>`)
      .join('');
    list.scrollTop = list.scrollHeight;
    if (!$('#log').classList.contains('open')) {
      this.unread += fresh.filter((e) => e.kind === 'chat').length;
      this.#renderBadge();
    }
    if (!initial) for (const e of fresh) if (e.kind === 'level') this.toast(e.text, 'level');
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
      micBtn.innerHTML = `${ICON.micOff}<span>Voice aus</span>`;
      micBtn.className = 'mic-btn off';
      return;
    }
    if (!v.hasMic) {
      micBtn.innerHTML = `${ICON.micOff}<span>${esc(v.micError || 'Kein Mikro')}</span>`;
      micBtn.className = 'mic-btn off';
    } else {
      micBtn.innerHTML = `${v.muted ? ICON.micOff : ICON.mic}<span>${v.muted ? 'Stumm' : 'Mikro an'}</span>`;
      micBtn.className = `mic-btn ${v.muted ? 'off' : 'on'}`;
      micBtn.title = 'Mikrofon an/aus (Taste M)';
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
        const name = p.name || 'Zuschauer';
        const st = p.self ? 'connected' : v.peerState(p.id);
        return `<li data-id="${p.id}" ${p.self ? 'data-self="1"' : ''} class="${p.muted ? 'muted' : ''} st-${st}">
          <span class="dot"></span><span class="vn">${esc(name)}${p.self ? ' (du)' : ''}</span>
          ${p.video ? `<span class="vm cam">${ICON.cam}</span>` : ''}<span class="vm">${p.muted ? ICON.micOff : ICON.mic}</span></li>`;
      })
      .join('');
  }

  // Live-Video im runden Avatar des Namensschilds (Kamera ist opt-in)
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

  // ------------------------------------------------------------ Ergebnisse

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
      const label = r.pots.length > 1 ? (i === 0 ? 'Main Pot' : `Side Pot ${i}`) : 'Pot';
      return `<div class="line"><b>${names}</b> ${pot.winners.length > 1 ? 'teilen' : 'gewinnt'} ${label} <span class="amt">${fmt(pot.amount)}</span>${
        pot.handName ? `<div class="hn">${esc(pot.handName)}</div>` : ''
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
        <h1>${esc(s.results[0]?.name)} gewinnt!</h1>
        <p class="sub">Turnierdauer ${fmtMin(mins)} · Level ${s.level.index + 1}</p>
        <ol>${s.results.map((r) => `<li><span class="pl">${medal[r.place - 1] || `${r.place}.`}</span><span>${esc(r.name)}</span></li>`).join('')}</ol>
        <button class="primary" id="btn-new">Neues Turnier</button>
      </div>`;
    $('#btn-new').onclick = () => this.send('newTournament');
    sfx.win();
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

// ------------------------------------------------------------ Hilfen

function fmtMin(m) {
  m = Math.round(m);
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
}

function actionLabel(la) {
  switch (la.type) {
    case 'sb':
      return `Small Blind ${fmt(la.amount)}`;
    case 'bb':
      return `Big Blind ${fmt(la.amount)}`;
    case 'check':
      return 'Check';
    case 'call':
      return la.allIn ? `All-in ${fmt(la.amount)}` : `Call ${fmt(la.amount)}`;
    case 'bet':
      return la.allIn ? `All-in ${fmt(la.amount)}` : `Bet ${fmt(la.amount)}`;
    case 'raise':
      return la.allIn ? `All-in ${fmt(la.amount)}` : `Raise ${fmt(la.amount)}`;
    case 'fold':
      return 'Gepasst';
    default:
      return '';
  }
}

const RN = { 14: 'Ass', 13: 'König', 12: 'Dame', 11: 'Bube', 10: 'Zehn', 9: 'Neun', 8: 'Acht', 7: 'Sieben', 6: 'Sechs', 5: 'Fünf', 4: 'Vier', 3: 'Drei', 2: 'Zwei' };
const RP = { 14: 'Asse', 13: 'Könige', 12: 'Damen', 11: 'Buben', 10: 'Zehnen', 9: 'Neunen', 8: 'Achten', 7: 'Siebenen', 6: 'Sechsen', 5: 'Fünfen', 4: 'Vieren', 3: 'Dreien', 2: 'Zweien' };

function describeHole(cards, board) {
  if (board.length >= 3) return evaluateBest([...cards, ...board]).name;
  const [a, b] = cards.map(rankValue).sort((x, y) => y - x);
  if (a === b) return `Pocket Pair, ${RP[a]}`;
  const suited = cards[0][1] === cards[1][1];
  return `${RN[a]}–${RN[b]}${suited ? ' suited' : ''}`;
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
