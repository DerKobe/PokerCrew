// Übersetzt Spielzustände in animierte 3D-Objekte.
import * as THREE from 'three';
import { createCard, cardQuat, CARD_H } from './cards.js';
import { buildStack } from './chips.js';
import { seatAnchors, BOARD_POS, POT_POS, DECK_POS, SEATS, tableYaw, tableToWorld } from './scene.js';
import { tween, ease, wait, setSpeed, finishAllTweens } from './tween.js';
import { sfx } from './sound.js';

const _q = new THREE.Quaternion();

export class TableView {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.mySeat = undefined;
    this.seats = Array.from({ length: SEATS }, () => ({ cards: [], stack: null, stackAmt: -1, bet: null, betAmt: 0, lastAction: null }));
    this.board = [];
    this.pot = null;
    this.potAmt = 0;
    this.handId = null;
    this.street = null;
    this.resultsShown = false;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.first = true;
    // Im Hintergrund (Tab nicht sichtbar) laufen keine Frames – Animationen sofort abschließen
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) finishAllTweens();
    });
  }

  // ---------- Geometrie ----------

  displayPos(seat) {
    return (seat - (this.mySeat ?? 0) + SEATS) % SEATS;
  }

  anchors(seat) {
    return seatAnchors(this.displayPos(seat), this.isMe(seat));
  }

  isMe(seat) {
    return this.mySeat != null && seat === this.mySeat;
  }

  holeTarget(seat, i, faceUp, revealed = false) {
    const A = this.anchors(seat);
    const me = this.isMe(seat);
    if (me) {
      // Wie echte, angehobene Karten: Unterkante liegt auf dem Filz, die Karte ist
      // um diese Kante zur Kamera hin gekippt (dreht sich also nicht in den Tisch).
      const scale = 1.05; // nur etwas größer als das Board (1.0), passend zu den anderen Karten
      const tilt = faceUp ? 0.62 : 0;
      const h = CARD_H * scale;
      const inward = A.normal.clone().negate();
      const up = inward.clone().multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0));
      const faceNormal = A.normal.clone().multiplyScalar(Math.sin(tilt)).add(new THREE.Vector3(0, Math.cos(tilt), 0));
      const pos = A.cards
        .clone()
        .setY(0.035)
        .addScaledVector(A.right, (i - 0.5) * 0.78)
        .addScaledVector(up, h / 2)
        .addScaledVector(faceNormal, i * 0.03);
      return { pos, quat: cardQuat(A.yaw - (i - 0.5) * 0.08, faceUp, tilt), scale };
    }
    if (revealed) {
      // Offen gelegte Karten zeigen zum Betrachter, damit sie lesbar sind
      const toward = A.cards.clone().addScaledVector(A.normal, -0.45);
      return {
        pos: toward.addScaledVector(new THREE.Vector3(1, 0, 0), (i - 0.5) * 0.98).setY(0.03 + i * 0.035),
        quat: cardQuat(-(i - 0.5) * 0.05, true),
        scale: 0.95,
      };
    }
    return {
      pos: A.cards.clone().addScaledVector(A.right, (i - 0.5) * 0.55).setY(0.03 + i * 0.035),
      quat: cardQuat(A.yaw - (i - 0.5) * 0.14, faceUp),
      scale: 0.85,
    };
  }

  // ---------- Öffentliche API ----------

  // Nach Wechsel Hoch-/Querformat alles neu aufbauen
  relayout() {
    if (!this.lastState) return;
    this.queue = this.queue.then(() => {
      finishAllTweens();
      this.#clearAll();
      this.first = true;
    });
    this.update(this.lastState);
  }

  update(state) {
    this.lastState = state;
    this.pending++;
    this.queue = this.queue
      .then(() => this.#apply(state))
      .catch((e) => console.error(e))
      .finally(() => this.pending--);
  }

  async #apply(state) {
    const perspective = state.mySeat;
    const instant = this.first || perspective !== this.mySeat || this.pending > 2 || document.hidden;
    if (perspective !== this.mySeat) {
      this.mySeat = perspective;
      this.#clearAll();
    }
    this.first = false;
    setSpeed(instant ? 0 : 1);
    sfx.muted = instant;
    try {
      const h = state.hand;
      if (!h) {
        if (this.handId != null || this.board.length) await this.#collectCards();
        this.handId = null;
        this.#clearBets();
        this.#setPot(0);
        this.stage.dealerButton.visible = false;
        this.stage.turnRing.visible = false;
        this.#syncStacks(state);
        return;
      }
      if (h.id !== this.handId) await this.#newHand(state);
      await this.#syncFolds(h);
      await this.#syncBets(state);
      await this.#syncBoard(h);
      await this.#syncReveals(h);
      if (h.results && !this.resultsShown) await this.#showResults(state);
      this.#syncStacks(state);
      this.#syncTurn(h);
      this.#syncActionSounds(h);
    } finally {
      setSpeed(1);
      sfx.muted = false;
    }
  }

  // ---------- Hände ----------

  async #newHand(state) {
    const h = state.hand;
    await this.#collectCards();
    this.#clearBets();
    this.#setPot(0);
    this.handId = h.id;
    this.street = h.street;
    this.resultsShown = false;
    for (const s of this.seats) s.lastAction = null;

    await this.#moveButton(h.buttonSeat);
    this.#syncStacks(state);

    // Reihenfolge: links vom Button beginnend
    const inHand = Object.keys(h.players).map(Number).sort((a, b) => a - b);
    const after = inHand.filter((s) => s > h.buttonSeat);
    const order = [...after, ...inHand.filter((s) => s <= h.buttonSeat)];
    const jobs = [];
    let k = 0;
    for (let round = 0; round < 2; round++) {
      for (const seat of order) {
        const card = createCard(null);
        card.position.copy(DECK_POS()).setY(DECK_POS().y + k * 0.03);
        card.quaternion.copy(cardQuat(tableYaw(), false));
        card.scale.setScalar(0.85);
        this.scene.add(card);
        this.seats[seat].cards[round] = card;
        const t = this.holeTarget(seat, round, false);
        const delay = k * 110;
        jobs.push(this.#fly(card, t.pos, t.quat, t.scale, { delay, duration: 420, arc: 0.6 }));
        setTimeout(() => sfx.card(), delay);
        k++;
      }
    }
    await Promise.all(jobs);
    // eigene Karten aufdecken
    if (this.mySeat != null && h.players[this.mySeat]?.cards) {
      const mine = h.players[this.mySeat].cards;
      await Promise.all(
        this.seats[this.mySeat].cards.map((card, i) => {
          card.userData.setFace(mine[i]);
          const t = this.holeTarget(this.mySeat, i, true);
          return this.#fly(card, t.pos, t.quat, t.scale, { duration: 380, arc: 0.35, delay: i * 90 });
        }),
      );
    }
  }

  async #syncFolds(h) {
    const jobs = [];
    for (let seat = 0; seat < SEATS; seat++) {
      const s = this.seats[seat];
      const p = h.players[seat];
      if (s.cards.length && (!p || p.folded)) {
        const cards = s.cards;
        s.cards = [];
        sfx.card();
        cards.forEach((card, i) => {
          this.muckHeight = ((this.muckHeight || 0) + 1) % 12;
          const to = POT_POS().add(tableToWorld((Math.random() - 0.5) * 0.8, 0.03 + this.muckHeight * 0.03, -0.4 + Math.random() * 0.3));
          jobs.push(
            this.#fly(card, to, cardQuat(tableYaw() + Math.random() * 2, false), 0.8, { duration: 360, delay: i * 60, arc: 0.3 }).then(() =>
              this.#fadeOut(card, 250),
            ),
          );
        });
      }
    }
    await Promise.all(jobs);
  }

  async #syncBets(state) {
    const h = state.hand;
    // Einsätze, die auf 0 fallen, wandern in den Pot
    const collect = [];
    for (let seat = 0; seat < SEATS; seat++) {
      const s = this.seats[seat];
      const bet = h.players[seat]?.bet || 0;
      if (s.bet && s.betAmt > 0 && bet === 0) collect.push(seat);
    }
    if (collect.length) {
      sfx.chips(collect.length + 2);
      await Promise.all(
        collect.map((seat) => {
          const s = this.seats[seat];
          const g = s.bet;
          s.bet = null;
          s.betAmt = 0;
          const from = g.position.clone();
          return tween({
            duration: 420,
            easing: ease.inOutCubic,
            update: (k) => {
              g.position.lerpVectors(from, POT_POS(), k);
              g.position.y = Math.sin(k * Math.PI) * 0.4;
            },
          }).then(() => this.scene.remove(g));
        }),
      );
    }
    this.street = h.street;
    // Pot
    const potTarget = this.resultsShown ? 0 : h.potTotal;
    this.#setPot(potTarget);
    // Neue/geänderte Einsätze
    const jobs = [];
    for (let seat = 0; seat < SEATS; seat++) {
      const s = this.seats[seat];
      const bet = h.players[seat]?.bet || 0;
      if (bet === s.betAmt) continue;
      const increased = bet > s.betAmt;
      if (s.bet) this.scene.remove(s.bet);
      s.bet = null;
      s.betAmt = bet;
      if (bet <= 0) continue;
      const A = this.anchors(seat);
      const g = buildStack(bet, { seed: seat + 11, layout: 'cluster', maxChips: 40 });
      g.rotation.y = A.yaw;
      s.bet = g;
      this.scene.add(g);
      if (increased) {
        g.position.copy(A.stack);
        sfx.chips(3);
        jobs.push(
          tween({
            duration: 380,
            easing: ease.outCubic,
            update: (k) => {
              g.position.lerpVectors(A.stack, A.bet, k);
              g.position.y = Math.sin(k * Math.PI) * 0.35;
            },
          }),
        );
      } else g.position.copy(A.bet);
    }
    await Promise.all(jobs);
  }

  async #syncBoard(h) {
    const jobs = [];
    const start = this.board.length;
    for (let i = start; i < h.board.length; i++) {
      const card = createCard(h.board[i]);
      card.position.copy(DECK_POS());
      card.quaternion.copy(cardQuat(tableYaw(), false));
      this.scene.add(card);
      this.board.push(card);
      const delay = (i - start) * 170;
      const slot = BOARD_POS(i);
      jobs.push(
        this.#fly(card, slot.clone().setY(0.02), cardQuat(tableYaw(), false), 1, { duration: 380, delay, arc: 0.5 }).then(() => {
          sfx.flip();
          return this.#fly(card, slot, cardQuat(tableYaw(), true), 1, { duration: 320, arc: 0.55 });
        }),
      );
      setTimeout(() => sfx.card(), delay);
    }
    await Promise.all(jobs);
  }

  async #syncReveals(h) {
    const jobs = [];
    for (let seat = 0; seat < SEATS; seat++) {
      if (this.isMe(seat)) continue;
      const s = this.seats[seat];
      const cards = h.players[seat]?.cards;
      if (!cards || !s.cards.length || s.cards[0].userData.code) continue;
      s.cards.forEach((card, i) => {
        card.userData.setFace(cards[i]);
        const t = this.holeTarget(seat, i, true, true);
        jobs.push(this.#fly(card, t.pos, t.quat, t.scale, { duration: 480, delay: i * 80, arc: 0.6 }));
      });
      sfx.flip();
    }
    await Promise.all(jobs);
  }

  async #showResults(state) {
    const h = state.hand;
    const r = h.results;
    this.resultsShown = true;
    this.stage.turnRing.visible = false;
    // Gewinnerkarten hervorheben
    if (!r.uncontested && r.pots.length) {
      const mainWinners = r.pots[0].winners;
      const best = new Set(mainWinners.flatMap((s) => r.hands[s]?.cards || []));
      const all = [...this.board, ...this.seats.flatMap((s) => s.cards)];
      for (const c of all) {
        if (!c.userData.code) continue;
        const win = best.has(c.userData.code);
        c.userData.setHighlight(win ? 'win' : 'dim');
        if (win) {
          const from = c.position.y;
          tween({ duration: 300, update: (k) => (c.position.y = from + k * 0.08) });
        }
      }
      await wait(1100);
    }
    // Pot zu den Gewinnern schieben
    if (this.pot) {
      this.scene.remove(this.pot);
      this.pot = null;
    }
    this.potAmt = 0;
    const jobs = [];
    Object.entries(r.winnings).forEach(([seatStr, amount], i) => {
      const seat = Number(seatStr);
      const A = this.anchors(seat);
      const g = buildStack(amount, { seed: 77 + seat, layout: 'row', maxChips: 70 });
      const potPos = POT_POS();
      g.position.copy(potPos);
      g.rotation.y = tableYaw();
      this.scene.add(g);
      jobs.push(
        tween({
          duration: 700,
          delay: 150 + i * 200,
          easing: ease.inOutCubic,
          update: (k) => {
            g.position.lerpVectors(potPos, A.stack, k);
            g.position.y = Math.sin(k * Math.PI) * 0.6;
          },
        }).then(() => this.scene.remove(g)),
      );
    });
    sfx.win();
    setTimeout(() => sfx.chips(8), 500);
    await Promise.all(jobs);
    // Stacks sofort mit Gewinn aktualisieren
    this.#syncStacks(state, true);
  }

  // ---------- Chips ----------

  #syncStacks(state, force = false) {
    for (let seat = 0; seat < SEATS; seat++) {
      const info = state.seats[seat];
      const s = this.seats[seat];
      let amount = 0;
      if (info && !info.eliminated) {
        amount = state.phase === 'lobby' ? state.config.startingStack : info.stack;
        // Solange die Pot-Animation noch aussteht, alten Stack zeigen
        if (!force && state.hand?.results && !this.resultsShown && state.hand.results.winnings[seat]) {
          amount -= state.hand.results.winnings[seat];
        }
      }
      if (amount === s.stackAmt) continue;
      if (s.stack) this.scene.remove(s.stack);
      s.stack = null;
      s.stackAmt = amount;
      if (amount <= 0) continue;
      const A = this.anchors(seat);
      // Mitspieler: kompakter Stack (3 Säulen pro Reihe), damit er nicht unter die Karten ragt
      const g = buildStack(amount, { seed: seat + 1, layout: 'row', perRow: this.isMe(seat) ? 5 : 3, maxChips: 90, pretty: true });
      g.position.copy(A.stack);
      g.rotation.y = A.yaw;
      this.scene.add(g);
      s.stack = g;
    }
  }

  #setPot(amount) {
    if (amount === this.potAmt) return;
    if (this.pot) this.scene.remove(this.pot);
    this.pot = null;
    this.potAmt = amount;
    if (amount <= 0) return;
    const g = buildStack(amount, { seed: 5, layout: 'row', maxChips: 80 });
    g.position.copy(POT_POS());
    g.rotation.y = tableYaw();
    this.scene.add(g);
    this.pot = g;
  }

  #clearBets() {
    for (const s of this.seats) {
      if (s.bet) this.scene.remove(s.bet);
      s.bet = null;
      s.betAmt = 0;
    }
  }

  // ---------- Button & Zugmarkierung ----------

  async #moveButton(seat) {
    const b = this.stage.dealerButton;
    const A = this.anchors(seat);
    const to = A.button.clone().setY(0.05);
    if (!b.visible) {
      b.visible = true;
      b.position.copy(to);
      return;
    }
    const from = b.position.clone();
    await tween({
      duration: 520,
      easing: ease.inOutCubic,
      update: (k) => {
        b.position.lerpVectors(from, to, k);
        b.position.y = 0.05 + Math.sin(k * Math.PI) * 0.5;
      },
    });
  }

  #syncTurn(h) {
    const ring = this.stage.turnRing;
    if (h.toAct == null || h.phase !== 'betting') {
      ring.visible = false;
      return;
    }
    const A = this.anchors(h.toAct);
    ring.position.copy(A.ring);
    ring.rotation.y = A.yaw;
    const me = this.isMe(h.toAct);
    ring.scale.set(me ? 1.2 : 1.1, 1, me ? 0.95 : 0.9);
    ring.visible = true;
  }

  #syncActionSounds(h) {
    for (let seat = 0; seat < SEATS; seat++) {
      const la = h.players[seat]?.lastAction;
      const s = this.seats[seat];
      const key = la ? `${la.type}:${la.amount || 0}` : null;
      if (key !== s.lastAction) {
        if (la?.type === 'check') sfx.check();
        s.lastAction = key;
      }
    }
  }

  // ---------- Karten-Helfer ----------

  #fly(obj, toPos, toQuat, toScale = 1, { duration = 400, delay = 0, arc = 0.5 } = {}) {
    let fromPos;
    let fromQ;
    let fromS;
    return tween({
      duration,
      delay,
      easing: ease.outCubic,
      update: (k) => {
        if (!fromPos) {
          fromPos = obj.position.clone();
          fromQ = obj.quaternion.clone();
          fromS = obj.scale.x;
        }
        obj.position.lerpVectors(fromPos, toPos, k);
        obj.position.y += Math.sin(k * Math.PI) * arc;
        obj.quaternion.slerpQuaternions(fromQ, toQuat, k);
        obj.scale.setScalar(fromS + (toScale - fromS) * k);
      },
    });
  }

  #fadeOut(card, duration) {
    const mats = [];
    card.traverse((o) => {
      if (o.isMesh) {
        const clone = (m) => {
          const c = m.clone();
          c.transparent = true;
          mats.push(c);
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
      }
    });
    return tween({
      duration,
      update: (k) => mats.forEach((m) => (m.opacity = 1 - k)),
    }).then(() => this.scene.remove(card));
  }

  async #collectCards() {
    const cards = [...this.board, ...this.seats.flatMap((s) => s.cards)];
    this.board = [];
    for (const s of this.seats) s.cards = [];
    if (!cards.length) return;
    sfx.card();
    await Promise.all(
      cards.map((c, i) =>
        this.#fly(c, DECK_POS().setY(0.1 + i * 0.03), _q.copy(cardQuat(tableYaw(), false)).clone(), 0.8, { duration: 380, delay: i * 25, arc: 0.4 }).then(() =>
          this.#fadeOut(c, 180),
        ),
      ),
    );
  }

  #clearAll() {
    for (const c of [...this.board, ...this.seats.flatMap((s) => s.cards)]) this.scene.remove(c);
    this.board = [];
    for (const s of this.seats) {
      if (s.stack) this.scene.remove(s.stack);
      if (s.bet) this.scene.remove(s.bet);
      Object.assign(s, { cards: [], stack: null, stackAmt: -1, bet: null, betAmt: 0, lastAction: null });
    }
    if (this.pot) this.scene.remove(this.pot);
    this.pot = null;
    this.potAmt = 0;
    this.handId = null;
    this.stage.dealerButton.visible = false;
  }
}
