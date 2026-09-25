// UI translations (German / English). The server only sends keys + parameters (log entries,
// errors), so every client renders them in its own language.
import { evaluateBest, rankValue } from '/shared/cards.js';

export const LANGS = ['de', 'en'];
const LOCALE = { de: 'de-DE', en: 'en-US' };

let lang = detect();
const listeners = [];

function detect() {
  try {
    const saved = localStorage.getItem('pc.lang');
    if (LANGS.includes(saved)) return saved;
  } catch {}
  for (const l of navigator.languages || [navigator.language || '']) {
    const base = String(l).slice(0, 2).toLowerCase();
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

export const getLang = () => lang;

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  try {
    localStorage.setItem('pc.lang', l);
  } catch {}
  document.documentElement.lang = l;
  applyStatic();
  for (const fn of listeners) fn(l);
}

export const onLangChange = (fn) => listeners.push(fn);

// ------------------------------------------------------------ Formatting

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString(LOCALE[lang]);

export const clock = (ts) => new Date(ts).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' });

export function fmtMin(m) {
  m = Math.round(m);
  const [min, hr] = lang === 'de' ? ['Min.', 'Std.'] : ['min', 'h'];
  if (m < 60) return `${m} ${min}`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} ${hr} ${r} ${min}` : `${h} ${hr}`;
}

const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${s}`;
};

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const cardLabel = (c) => `${c[0] === 'T' ? '10' : c[0]}${SUIT[c[1]]}`;

// ------------------------------------------------------------ Hand names

const RANK = {
  de: {
    one: { 2: 'Zwei', 3: 'Drei', 4: 'Vier', 5: 'Fünf', 6: 'Sechs', 7: 'Sieben', 8: 'Acht', 9: 'Neun', 10: 'Zehn', 11: 'Bube', 12: 'Dame', 13: 'König', 14: 'Ass' },
    many: { 2: 'Zweien', 3: 'Dreien', 4: 'Vieren', 5: 'Fünfen', 6: 'Sechsen', 7: 'Siebenen', 8: 'Achten', 9: 'Neunen', 10: 'Zehnen', 11: 'Buben', 12: 'Damen', 13: 'Könige', 14: 'Asse' },
  },
  en: {
    one: { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' },
    many: { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' },
  },
};

// { cat, tb } from the evaluator -> "Full House, Kings over Sevens"
export function describeHand(hand) {
  if (!hand) return '';
  const { cat, tb } = hand;
  const N = RANK[lang].one;
  const P = RANK[lang].many;
  if (lang === 'de') {
    switch (cat) {
      case 8: return tb[0] === 14 ? 'Royal Flush' : `Straight Flush bis ${N[tb[0]]}`;
      case 7: return `Vierling, ${P[tb[0]]}`;
      case 6: return `Full House, ${P[tb[0]]} über ${P[tb[1]]}`;
      case 5: return `Flush, ${N[tb[0]]} hoch`;
      case 4: return `Straße bis ${N[tb[0]]}`;
      case 3: return `Drilling, ${P[tb[0]]}`;
      case 2: return `Zwei Paare, ${P[tb[0]]} und ${P[tb[1]]}`;
      case 1: return `Paar, ${P[tb[0]]}`;
      default: return `${N[tb[0]]} hoch`;
    }
  }
  switch (cat) {
    case 8: return tb[0] === 14 ? 'Royal Flush' : `Straight Flush, ${N[tb[0]]} high`;
    case 7: return `Four of a Kind, ${P[tb[0]]}`;
    case 6: return `Full House, ${P[tb[0]]} over ${P[tb[1]]}`;
    case 5: return `Flush, ${N[tb[0]]} high`;
    case 4: return `Straight, ${N[tb[0]]} high`;
    case 3: return `Three of a Kind, ${P[tb[0]]}`;
    case 2: return `Two Pair, ${P[tb[0]]} and ${P[tb[1]]}`;
    case 1: return `Pair of ${P[tb[0]]}`;
    default: return `${N[tb[0]]} high`;
  }
}

// Own hand strength: best hand once the flop is out, otherwise the starting hand
export function describeHole(cards, board) {
  if (board.length >= 3) return describeHand(evaluateBest([...cards, ...board]));
  const [a, b] = cards.map(rankValue).sort((x, y) => y - x);
  if (a === b) return lang === 'de' ? `Pocket Pair, ${RANK.de.many[a]}` : `Pocket ${RANK.en.many[a]}`;
  const suited = cards[0][1] === cards[1][1];
  return `${RANK[lang].one[a]}–${RANK[lang].one[b]}${suited ? ' suited' : ''}`;
}

// ------------------------------------------------------------ Dictionaries

const ai = (p) => (p.allIn ? ' (All-in)' : '');

const DICT = {
  de: {
    lang: { label: 'Sprache' },
    splash: {
      tagline: "No-Limit Texas Hold'em mit deinen Freunden – inklusive Voicechat.",
      enter: 'An den Tisch',
      fine: 'Beim Betreten wirst du automatisch mit dem Voicechat verbunden. Dein Browser fragt nach dem Mikrofon – stummschalten kannst du jederzeit (Taste <kbd>M</kbd>).',
    },
    offline: 'Verbindung verloren – verbinde neu…',
    away: {
      text: 'Du wurdest als <b>abwesend</b> markiert – es wird automatisch gecheckt oder gepasst.',
      back: 'Ich bin zurück',
    },
    top: {
      invite: 'Link kopieren',
      linkCopied: 'Link kopiert – schick ihn deinen Freunden!',
      pause: 'Pause',
      resume: 'Fortsetzen',
      sfx: 'Soundeffekte',
      fix: 'Tisch fixieren (keine Kamerabewegung)',
      unfix: 'Tisch wieder bewegen lassen',
      menu: 'Menü',
      abort: 'Turnier abbrechen',
      abortConfirm: 'Turnier wirklich für alle abbrechen?',
      fullscreen: 'Vollbild',
      lobby: 'Lobby',
      players: (p) => `${p.n}/${p.max} Spieler`,
      paused: 'PAUSE',
    },
    voice: {
      title: 'Voice',
      cam: 'Kamera an/aus',
      deafen: 'Alle stummschalten (Lautsprecher)',
      off: 'Voice aus',
      muted: 'Stumm',
      micOn: 'Mikro an',
      micTitle: 'Mikrofon an/aus (Taste M)',
      you: '(du)',
      noMic: 'Kein Mikro',
      micHttps: 'Mikrofon braucht HTTPS',
      micDenied: 'Mikrofon-Zugriff verweigert',
      micMissing: 'Kein Mikrofon gefunden',
      camDenied: 'Kamera-Zugriff verweigert',
      camMissing: 'Keine Kamera gefunden',
    },
    spectator: 'Zuschauer',
    lobby: {
      title: 'Neues Turnier',
      sub: "Gib deinen Namen ein, wähle einen Platz – los geht's, sobald mindestens zwei sitzen.",
      name: 'Dein Name',
      namePh: 'z. B. Alex',
      gadget: 'Dein Gadget',
      gadgetHint: '– liegt neben dir am Tisch, Klick darauf für eine Animation',
      struct: 'Turnierstruktur',
      tournamentName: 'Turniername (steht auf dem Tisch)',
      stack: 'Startchips',
      levelMin: 'Level-Dauer (Min.)',
      actionSec: 'Zeit pro Zug (Sek.)',
      blinds: 'Blindstruktur',
      colLevel: 'Level',
      colSb: 'Small Blind',
      colBb: 'Big Blind',
      colAnte: 'Ante',
      colStart: 'Beginn',
      addLevel: '+ Level',
      reset: 'Standard',
      removeLevel: 'Level entfernen',
      readonly: 'Nur Spieler am Tisch können die Struktur ändern.',
      start: 'Turnier starten',
      standUp: 'Aufstehen',
      offline: 'offline',
      free: 'Freier Platz',
      switch: 'Wechseln',
      sit: 'Hinsetzen',
      hide: 'Ausblenden ▴',
      edit: 'Bearbeiten ▾',
      show: 'Anzeigen ▾',
      sum1: (p) => `<b>${fmt(p.stack)} Startchips</b> · ${p.min}-Min.-Level${p.preset ? ` (${p.preset})` : ''} · ${p.sec} s pro Zug`,
      sum2: (p) => `${p.levels} Level · Blinds ${fmt(p.sb1)}/${fmt(p.bb1)} → ${fmt(p.sb2)}/${fmt(p.bb2)}`,
      estimate: (p) => `Voraussichtliche Dauer mit ${p.n} Spielern: <b>ca. ${fmtMin(p.min)}</b> · Start mit ${p.bbs} Big Blinds`,
      needMore: (p) => `${p.n} von ${p.max} Plätzen belegt – mindestens 2 nötig`,
      seats: 'Plätze am Tisch',
      ready: (p) => `${p.n} Spieler bereit${p.spec ? ` · ${p.spec} Zuschauer` : ''}`,
      nameFirst: 'Bitte zuerst deinen Namen eingeben.',
    },
    preset: { turbo: 'Turbo', standard: 'Standard', relaxed: 'Gemütlich', mins: (p) => `~${p.m} Min` },
    join: {
      cta: (p) => `Einsteigen · ${p.free} ${p.free === 1 ? 'Platz' : 'Plätze'} frei`,
      title: 'Nachträglich einsteigen',
      sub: (p) => `Das Turnier läuft schon, aber noch ist niemand ausgeschieden. Du startest mit ${fmt(p.stack)} Chips und bekommst ab der nächsten Hand Karten.`,
      seat: 'Platz',
      go: (p) => `Platz ${p.n} nehmen`,
      cancel: 'Abbrechen',
    },
    gadget: { cigar: 'Zigarre', vape: 'Vape', cocktail: 'Cocktail', whiskey: 'Whiskey' },
    plate: {
      sit: (p) => `Platz ${p.n} · Hinsetzen`,
      place: (p) => `Platz ${p.n}`,
      away: 'abwesend',
      offline: 'offline',
      folded: 'Gepasst',
    },
    pot: { pot: 'Pot', main: 'Main', side: 'Side' },
    act: {
      fold: 'Passen',
      check: 'Checken',
      call: 'Mitgehen',
      tequila: 'Tequila!',
      callAllIn: (p) => `All-in callen (${fmt(p.amount)})`,
      bet: 'Setzen',
      raiseTo: 'Erhöhen auf',
      yourTurn: '♠ Du bist dran!',
      sb: (p) => `Small Blind ${fmt(p.amount)}`,
      bbl: (p) => `Big Blind ${fmt(p.amount)}`,
      checked: 'Check',
      called: (p) => `Call ${fmt(p.amount)}`,
      betted: (p) => `Bet ${fmt(p.amount)}`,
      raised: (p) => `Raise ${fmt(p.amount)}`,
      allIn: (p) => `All-in ${fmt(p.amount)}`,
    },
    reveal: { flop: 'Flop aufdecken', turn: 'Turn aufdecken', river: 'River aufdecken' },
    banner: {
      wins: 'gewinnt',
      split: 'teilen',
      main: 'Main Pot',
      side: (p) => `Side Pot ${p.n}`,
      pot: 'Pot',
    },
    results: {
      wins: (p) => `${p.name} gewinnt!`,
      duration: (p) => `Turnierdauer ${fmtMin(p.min)} · Level ${p.level}`,
      again: 'Neues Turnier',
    },
    tip: {
      fidget: 'Tipp: Spiel mit deinen Chips – klick auf deinen Stack oder halt ihn gedrückt und zieh.',
      gadget: 'Tipp: Klick auf dein Gadget neben dir am Tisch.',
    },
    log: {
      title: 'Verlauf',
      placeholder: 'Nachricht…',
      send: 'Senden',
      sit: (p) => `${p.name} nimmt Platz ${p.seat + 1}.`,
      stand: (p) => `${p.name} steht auf.`,
      started: (p) => `Turnier gestartet! ${p.n} Spieler, je ${fmt(p.stack)} Chips. Blinds ${fmt(p.sb)}/${fmt(p.bb)}.`,
      level: (p) => `Level ${p.level}: Blinds steigen auf ${fmt(p.sb)}/${fmt(p.bb)}${p.ante ? ` (Ante ${fmt(p.ante)})` : ''} – ab der nächsten Hand.`,
      fold: (p) => `${p.name} passt.`,
      check: (p) => `${p.name} checkt.`,
      call: (p) => `${p.name} geht mit (${fmt(p.amount)})${ai(p)}.`,
      bet: (p) => `${p.name} setzt ${fmt(p.amount)}${ai(p)}.`,
      raise: (p) => `${p.name} erhöht auf ${fmt(p.amount)}${ai(p)}.`,
      reveal: (p) => `${p.name} deckt ${{ flop: 'den Flop', turn: 'den Turn', river: 'den River' }[p.street]} auf.`,
      away: (p) => `${p.name} ist abwesend – es wird automatisch gecheckt/gepasst.`,
      win: (p) => {
        const pot = { main: 'den Hauptpot', side: 'einen Sidepot', only: 'den Pot' }[p.pot];
        const verb = p.names.length > 1 ? 'teilen sich' : 'gewinnt';
        return `${p.names.join(' & ')} ${verb} ${pot} (${fmt(p.amount)})${p.hand ? ` mit ${describeHand(p.hand)}` : ''}.`;
      },
      rabbit: (p) => `🐇 ${p.name} will die Rabbit Cam sehen: ${p.cards.map(cardLabel).join(' ')}`,
      bust: (p) => `${p.name} scheidet auf Platz ${p.place} aus.`,
      champion: (p) => `🏆 ${p.name} gewinnt das Turnier!`,
      pause: (p) => `${p.name} pausiert das Turnier${p.afterHand ? ' (nach dieser Hand)' : ''}.`,
      resume: (p) => `${p.name} setzt das Turnier fort.`,
      aborted: (p) => `${p.name} hat das Turnier abgebrochen.`,
      newTournament: 'Neues Turnier – bitte Platz nehmen!',
      lateJoin: (p) => `${p.name} steigt nachträglich auf Platz ${p.seat + 1} ein (${fmt(p.stack)} Chips).`,
      chat: (p) => `${p.name ?? 'Zuschauer'}: ${p.text}`,
    },
    err: {
      generic: 'Das hat nicht geklappt.',
      tournamentRunning: 'Das Turnier läuft bereits.',
      lateRegClosed: 'Einsteigen ist nicht mehr möglich – jemand ist schon ausgeschieden oder alle Plätze sind belegt.',
      invalidSeat: 'Ungültiger Platz',
      nameRequired: 'Bitte gib einen Namen ein.',
      seatTaken: 'Der Platz ist schon belegt.',
      nameTaken: 'Der Name ist schon vergeben.',
      cannotStand: 'Während des Turniers kannst du nicht aufstehen.',
      configLocked: 'Die Struktur kann nur vor dem Turnier geändert werden.',
      seatedOnly: 'Nur Spieler am Tisch können das.',
      gadgetLocked: 'Das Gadget kannst du erst beim nächsten Turnier wechseln.',
      unknownGadget: 'Unbekanntes Gadget',
      needTwo: 'Mindestens zwei Spieler müssen Platz nehmen.',
      noAction: 'Gerade keine Aktion möglich.',
      notYourTurn: 'Du bist nicht am Zug.',
      cannotCheck: 'Check nicht möglich',
      nothingToCall: 'Nichts zu callen',
      cannotRaise: 'Erhöhen nicht möglich',
      invalidAmount: 'Ungültiger Betrag',
      minAmount: (p) => `Mindestens ${fmt(p.min)}`,
      unknownAction: 'Unbekannte Aktion',
    },
  },

  en: {
    lang: { label: 'Language' },
    splash: {
      tagline: "No-Limit Texas Hold'em with your friends – voice chat included.",
      enter: 'Take a seat',
      fine: 'You join the voice chat automatically when you enter. Your browser will ask for the microphone – you can mute yourself any time (key <kbd>M</kbd>).',
    },
    offline: 'Connection lost – reconnecting…',
    away: {
      text: 'You were marked as <b>away</b> – you will check or fold automatically.',
      back: "I'm back",
    },
    top: {
      invite: 'Copy link',
      linkCopied: 'Link copied – send it to your friends!',
      pause: 'Pause',
      resume: 'Resume',
      sfx: 'Sound effects',
      fix: 'Fix the table (no camera movement)',
      unfix: 'Let the table move again',
      menu: 'Menu',
      abort: 'Abort tournament',
      abortConfirm: 'Really abort the tournament for everyone?',
      fullscreen: 'Fullscreen',
      lobby: 'Lobby',
      players: (p) => `${p.n}/${p.max} players`,
      paused: 'PAUSED',
    },
    voice: {
      title: 'Voice',
      cam: 'Camera on/off',
      deafen: 'Mute everyone (speaker)',
      off: 'Voice off',
      muted: 'Muted',
      micOn: 'Mic on',
      micTitle: 'Microphone on/off (key M)',
      you: '(you)',
      noMic: 'No mic',
      micHttps: 'Microphone needs HTTPS',
      micDenied: 'Microphone access denied',
      micMissing: 'No microphone found',
      camDenied: 'Camera access denied',
      camMissing: 'No camera found',
    },
    spectator: 'Spectator',
    lobby: {
      title: 'New tournament',
      sub: 'Enter your name, pick a seat – we start as soon as at least two players are seated.',
      name: 'Your name',
      namePh: 'e.g. Alex',
      gadget: 'Your gadget',
      gadgetHint: '– sits next to you at the table, click it for an animation',
      struct: 'Tournament structure',
      tournamentName: 'Tournament name (printed on the table)',
      stack: 'Starting chips',
      levelMin: 'Level length (min)',
      actionSec: 'Time per move (sec)',
      blinds: 'Blind structure',
      colLevel: 'Level',
      colSb: 'Small blind',
      colBb: 'Big blind',
      colAnte: 'Ante',
      colStart: 'Starts',
      addLevel: '+ Level',
      reset: 'Default',
      removeLevel: 'Remove level',
      readonly: 'Only seated players can change the structure.',
      start: 'Start tournament',
      standUp: 'Stand up',
      offline: 'offline',
      free: 'Free seat',
      switch: 'Switch',
      sit: 'Sit down',
      hide: 'Hide ▴',
      edit: 'Edit ▾',
      show: 'Show ▾',
      sum1: (p) => `<b>${fmt(p.stack)} starting chips</b> · ${p.min}-min levels${p.preset ? ` (${p.preset})` : ''} · ${p.sec} s per move`,
      sum2: (p) => `${p.levels} levels · Blinds ${fmt(p.sb1)}/${fmt(p.bb1)} → ${fmt(p.sb2)}/${fmt(p.bb2)}`,
      estimate: (p) => `Expected duration with ${p.n} players: <b>about ${fmtMin(p.min)}</b> · Starting with ${p.bbs} big blinds`,
      needMore: (p) => `${p.n} of ${p.max} seats taken – at least 2 needed`,
      seats: 'Seats at the table',
      ready: (p) => `${p.n} players ready${p.spec ? ` · ${p.spec} spectator${p.spec > 1 ? 's' : ''}` : ''}`,
      nameFirst: 'Please enter your name first.',
    },
    preset: { turbo: 'Turbo', standard: 'Standard', relaxed: 'Relaxed', mins: (p) => `~${p.m} min` },
    join: {
      cta: (p) => `Join the tournament · ${p.free} ${p.free === 1 ? 'seat' : 'seats'} free`,
      title: 'Join late',
      sub: (p) => `The tournament is already running, but nobody has been eliminated yet. You start with ${fmt(p.stack)} chips and are dealt in from the next hand.`,
      seat: 'Seat',
      go: (p) => `Take seat ${p.n}`,
      cancel: 'Cancel',
    },
    gadget: { cigar: 'Cigar', vape: 'Vape', cocktail: 'Cocktail', whiskey: 'Whiskey' },
    plate: {
      sit: (p) => `Seat ${p.n} · Sit down`,
      place: (p) => `${ordinal(p.n)} place`,
      away: 'away',
      offline: 'offline',
      folded: 'Folded',
    },
    pot: { pot: 'Pot', main: 'Main', side: 'Side' },
    act: {
      fold: 'Fold',
      check: 'Check',
      call: 'Call',
      tequila: 'Tequila!',
      callAllIn: (p) => `Call the all-in (${fmt(p.amount)})`,
      bet: 'Bet',
      raiseTo: 'Raise to',
      yourTurn: '♠ Your turn!',
      sb: (p) => `Small Blind ${fmt(p.amount)}`,
      bbl: (p) => `Big Blind ${fmt(p.amount)}`,
      checked: 'Check',
      called: (p) => `Call ${fmt(p.amount)}`,
      betted: (p) => `Bet ${fmt(p.amount)}`,
      raised: (p) => `Raise ${fmt(p.amount)}`,
      allIn: (p) => `All-in ${fmt(p.amount)}`,
    },
    reveal: { flop: 'Reveal the flop', turn: 'Reveal the turn', river: 'Reveal the river' },
    banner: {
      wins: 'wins',
      split: 'split',
      main: 'the main pot',
      side: (p) => `side pot ${p.n}`,
      pot: 'the pot',
    },
    results: {
      wins: (p) => `${p.name} wins!`,
      duration: (p) => `Tournament length ${fmtMin(p.min)} · Level ${p.level}`,
      again: 'New tournament',
    },
    tip: {
      fidget: 'Tip: play with your chips – click your stack, or press and drag it.',
      gadget: 'Tip: click your gadget next to you at the table.',
    },
    log: {
      title: 'Log',
      placeholder: 'Message…',
      send: 'Send',
      sit: (p) => `${p.name} takes seat ${p.seat + 1}.`,
      stand: (p) => `${p.name} stands up.`,
      started: (p) => `Tournament started! ${p.n} players, ${fmt(p.stack)} chips each. Blinds ${fmt(p.sb)}/${fmt(p.bb)}.`,
      level: (p) => `Level ${p.level}: blinds go up to ${fmt(p.sb)}/${fmt(p.bb)}${p.ante ? ` (ante ${fmt(p.ante)})` : ''} from the next hand.`,
      fold: (p) => `${p.name} folds.`,
      check: (p) => `${p.name} checks.`,
      call: (p) => `${p.name} calls ${fmt(p.amount)}${ai(p)}.`,
      bet: (p) => `${p.name} bets ${fmt(p.amount)}${ai(p)}.`,
      raise: (p) => `${p.name} raises to ${fmt(p.amount)}${ai(p)}.`,
      reveal: (p) => `${p.name} reveals the ${p.street}.`,
      away: (p) => `${p.name} is away – checking/folding automatically.`,
      win: (p) => {
        const pot = { main: 'the main pot', side: 'a side pot', only: 'the pot' }[p.pot];
        const verb = p.names.length > 1 ? 'split' : 'wins';
        return `${p.names.join(' & ')} ${verb} ${pot} (${fmt(p.amount)})${p.hand ? ` with ${describeHand(p.hand)}` : ''}.`;
      },
      rabbit: (p) => `🐇 ${p.name} wants to see the Rabbit Cam: ${p.cards.map(cardLabel).join(' ')}`,
      bust: (p) => `${p.name} is out in ${ordinal(p.place)} place.`,
      champion: (p) => `🏆 ${p.name} wins the tournament!`,
      pause: (p) => `${p.name} pauses the tournament${p.afterHand ? ' (after this hand)' : ''}.`,
      resume: (p) => `${p.name} resumes the tournament.`,
      aborted: (p) => `${p.name} aborted the tournament.`,
      newTournament: 'New tournament – take your seats!',
      lateJoin: (p) => `${p.name} joins late in seat ${p.seat + 1} (${fmt(p.stack)} chips).`,
      chat: (p) => `${p.name ?? 'Spectator'}: ${p.text}`,
    },
    err: {
      generic: "That didn't work.",
      tournamentRunning: 'The tournament is already running.',
      lateRegClosed: 'You can no longer join – someone has been eliminated already or all seats are taken.',
      invalidSeat: 'Invalid seat',
      nameRequired: 'Please enter a name.',
      seatTaken: 'That seat is already taken.',
      nameTaken: 'That name is already taken.',
      cannotStand: "You can't stand up during the tournament.",
      configLocked: 'The structure can only be changed before the tournament.',
      seatedOnly: 'Only seated players can do that.',
      gadgetLocked: 'You can switch your gadget at the next tournament.',
      unknownGadget: 'Unknown gadget',
      needTwo: 'At least two players need to be seated.',
      noAction: 'No action possible right now.',
      notYourTurn: "It's not your turn.",
      cannotCheck: "You can't check",
      nothingToCall: 'Nothing to call',
      cannotRaise: "You can't raise",
      invalidAmount: 'Invalid amount',
      minAmount: (p) => `At least ${fmt(p.min)}`,
      unknownAction: 'Unknown action',
    },
  },
};

function lookup(dict, key) {
  let v = dict;
  for (const k of key.split('.')) {
    v = v?.[k];
    if (v === undefined) return undefined;
  }
  return v;
}

export function t(key, p = {}) {
  const v = lookup(DICT[lang], key) ?? lookup(DICT.en, key);
  if (v === undefined) return key;
  return typeof v === 'function' ? v(p) : v;
}

// Static markup: data-i18n (text), data-i18n-html, data-i18n-title, data-i18n-ph (placeholder)
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  root.querySelectorAll('.lang-pick').forEach(renderPicker);
}

// Language picker: small DE | EN switch, can be placed anywhere (splash, top bar)
export function langPicker() {
  return `<div class="lang-pick" role="group">${LANGS.map((l) => `<button type="button" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>`;
}

function renderPicker(el) {
  el.setAttribute('aria-label', t('lang.label'));
  el.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === lang);
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('.lang-pick button[data-lang]');
  if (!b) return;
  e.stopPropagation();
  setLang(b.dataset.lang);
});

document.documentElement.lang = lang;
applyStatic();
