# ♠ PokerCrew

Selbst gehostetes **No-Limit Texas Hold'em Turnier** für bis zu 5 Freunde – mit einem in **three.js** gerenderten Pokertisch und eingebautem **Voicechat**.

- **Eine Sitzung, ein Tisch:** Wer die URL kennt, ist dabei. Kein Login, keine Accounts.
- **3D-Tisch:** Filz mit Einsatzlinie, lackierte Holz-Racetrack, Messingeinlage, gepolsterte Lederbande mit Ziernaht. Chips mit Randeinlagen und Wertaufdruck, Karten mit echten Pip-Layouts, animiertes Austeilen, Flop/Turn/River, Chips in den Pot und zum Gewinner, leuchtende Gewinnerkarten.
- **Voicechat:** Jeder wird beim Betreten automatisch verbunden (WebRTC, Peer-to-Peer). Mikro jederzeit stummschaltbar (Button oder Taste **M**), Lautsprecher stummschaltbar, Sprechanzeige am Platz.
- **Turniere:** 5 Plätze, Namen bei jedem Turnier neu. Startchips, Level-Dauer, Zeit pro Zug und kompletter Blindverlauf (inkl. Ante) sind vor jedem Turnier konfigurierbar. Standard ist auf **ca. 1 Stunde mit 5 Spielern** ausgelegt.
- **Regeln:** No-Limit Hold'em nach Standardregeln – Heads-up-Blinds, Min-Raise, unvollständige All-in-Raises öffnen das Setzen nicht wieder, Side-Pots, Split-Pots (ungerader Chip links vom Button), zurückgegebene Uncalled Bets, All-in-Runout mit offenen Karten.
- **Komfort:** Zug-Timer (danach automatisch Check/Fold und „abwesend"), Check/Fold-Vorauswahl, Pot-Buttons (½, ¾, Pot, All-in), Tastenkürzel (F/C/R), Pause, Handstärke-Anzeige, Verlauf mit Chat, Wiederverbinden nach Reload, Hoch- und Querformat auf dem Handy.

## Standard-Struktur (≈ 60 Minuten mit 5 Spielern)

10.000 Startchips (100 Big Blinds), 10-Minuten-Level:

| Level | Blinds | | Level | Blinds |
|---|---|---|---|---|
| 1 | 50 / 100 | | 7 | 1.000 / 2.000 |
| 2 | 100 / 200 | | 8 | 1.500 / 3.000 |
| 3 | 150 / 300 | | 9 | 2.000 / 4.000 |
| 4 | 250 / 500 | | 10 | 3.000 / 6.000 |
| 5 | 400 / 800 | | 11 | 5.000 / 10.000 |
| 6 | 600 / 1.200 | | 12 | 10.000 / 20.000 |

Nach ~60 Minuten (Level 7) liegen nur noch ~25 Big Blinds pro Kopf im Spiel – ab da endet ein Turnier erfahrungsgemäß schnell. Presets in der Lobby: *Turbo* (7-Min-Level, ~40 Min.), *Standard* (10 Min.), *Gemütlich* (15 Min., ~90 Min.). Nach dem letzten Level steigen die Blinds automatisch weiter um 50 % pro Level.

## Lokal starten

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm start
```

Dann <http://localhost:3000> öffnen. Zum Alleine-Ausprobieren kannst du Test-Bots an den Tisch setzen (in einem zweiten Terminal):

```bash
node scripts/bots.js 3
```

Mit `--shove` gehen die Bots All-in, sobald sie erhöhen dürfen – praktisch, um All-in-Situationen zu testen.

Tests (Handbewertung, Side-Pots, Min-Raise-Regeln, Fuzz-Test über 3.000 Zufallshände, komplettes Turnier):

```bash
npm test
```

> **Wichtig:** Browser geben das Mikrofon nur über **HTTPS** (oder `localhost`) frei. Für das Spielen übers Internet deshalb immer die HTTPS-Variante unten verwenden.

## Hosting – Empfehlung

Die App ist sehr genügsam: Das Spiel selbst ist winzig, und der Voicechat läuft direkt zwischen den Browsern (Peer-to-Peer), nicht über den Server. **Die kleinste Instanz reicht** (512 MB RAM genügen).

| Anbieter | Instanz | Kosten (ca.) | Bemerkung |
|---|---|---|---|
| **AWS Lightsail** | kleinster Linux-Plan mit IPv4, Region Frankfurt | ~5 $/Monat | **Empfehlung, wenn es AWS sein soll.** Festpreis inkl. Traffic und statischer IP, sehr einfache Oberfläche. |
| Hetzner Cloud | kleinste Shared-vCPU-Instanz | ~4–5 €/Monat | Günstigste solide Option, deutsches Rechenzentrum, mehr RAM fürs Geld. |
| AWS EC2 | t4g.nano / t4g.micro | ~3–6 $/Monat + ~3,60 $ für die öffentliche IPv4 + Speicher | Lohnt sich nur, wenn du die Instanz zwischen Spielabenden **stoppst** (dann zahlst du fast nur den Speicher). Mehr Konfigurationsaufwand. |

Die Preise sind grobe Richtwerte – bitte vor dem Buchen aktuell prüfen.

**Mein Rat:** Für einen dauerhaft erreichbaren Pokerabend-Server ist **Lightsail (Frankfurt, ~5 $/Monat)** der einfachste Weg bei AWS. Wenn der Anbieter egal ist, ist Hetzner etwas günstiger.

## Deployment auf AWS Lightsail (Schritt für Schritt)

1. **Instanz anlegen:** Lightsail-Konsole → *Create instance* → Region **Frankfurt** → *Linux/Unix* → *OS Only* → **Ubuntu 24.04 LTS** → kleinsten Plan mit IPv4 wählen → *Create instance*.
2. **Statische IP:** Tab *Networking* → *Create static IP* → an die Instanz hängen.
3. **Firewall:** Im selben Tab bei *IPv4 Firewall* eine Regel für **HTTPS (TCP 443)** hinzufügen (SSH 22 und HTTP 80 sind schon offen).
4. **Code hochladen** (von deinem Rechner aus, den SSH-Key bekommst du unter *Account → SSH keys*):

   ```bash
   rsync -av --exclude node_modules --exclude .git -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" ./ ubuntu@DEINE_IP:~/pokercrew/
   ```

   (Alternativ: Projekt in ein privates Git-Repo pushen und auf dem Server `git clone`.)
5. **Einrichten und starten** (auf dem Server, z. B. über den Browser-SSH-Button in Lightsail):

   ```bash
   cd ~/pokercrew && sudo bash deploy/setup.sh
   ```

   Das Skript installiert Docker, legt bei kleinen Instanzen Swap an, baut die App und startet sie hinter **Caddy**, das automatisch ein kostenloses HTTPS-Zertifikat holt.
6. **Fertig:** Das Skript zeigt die Adresse an, z. B. `https://3-120-45-67.sslip.io`. Diesen Link schickst du deinen Freunden.

### Eigene Domain (optional)

Ohne Domain funktioniert alles über `<IP>.sslip.io` (ein kostenloser DNS-Dienst, der die IP im Namen auflöst). Sollte das HTTPS-Zertifikat dafür einmal nicht ausgestellt werden, einfach eine eigene (Sub-)Domain nehmen. Mit eigener Domain: einen **A-Record** (z. B. `poker.meinedomain.de`) auf die statische IP setzen und dann

```bash
sudo bash deploy/setup.sh poker.meinedomain.de
```

### Voice verbindet bei einem Freund nicht? → TURN-Server

In seltenen Fällen (Firmennetz, manche Mobilfunknetze) können zwei Browser keine direkte Verbindung aufbauen. Dann hilft ein eigener TURN-Server, der das Audio weiterleitet:

```bash
sudo bash deploy/setup.sh --turn            # bzw. --turn poker.meinedomain.de
```

Zusätzlich in der Lightsail-Firewall öffnen: **UDP + TCP 3478** und **UDP 49160–49200**.

### Aktualisieren

Neuen Code wie in Schritt 4 hochladen, dann auf dem Server:

```bash
cd ~/pokercrew/deploy && sudo docker compose up -d --build
```

> Ein Neustart des Servers beendet ein laufendes Turnier (der Spielstand liegt im Arbeitsspeicher). Also nicht mitten im Pokerabend aktualisieren.

### Ohne Docker (Alternative)

Node.js ≥ 20 installieren, `npm ci --omit=dev`, `PORT=3000 node server/index.js` (z. B. als systemd-Dienst) und einen Reverse-Proxy mit HTTPS davor (Caddy, nginx + certbot). WebSockets müssen durchgereicht werden.

## Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port der App |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `STUN_URLS` | Google-STUN | Kommagetrennte STUN-Server für WebRTC |
| `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` | – | Optionaler TURN-Server (setzt `setup.sh --turn` automatisch) |

## Bedienung

- **Betreten:** Link öffnen → „An den Tisch" (dabei fragt der Browser nach dem Mikrofon).
- **Lobby:** Namen eingeben, Platz wählen. Jeder Spieler am Tisch kann die Struktur anpassen und das Turnier starten (ab 2 Spielern). Wer später kommt, schaut zu und ist trotzdem im Voicechat.
- **Am Zug:** Passen **F**, Checken/Mitgehen **C**, Setzen/Erhöhen **R** (Betrag per Slider, Eingabefeld oder Pot-Buttons). Mikro an/aus: **M**.
- **Menü (⋮):** Turnier abbrechen, Vollbild. **⏸** pausiert nach der laufenden Hand (Level-Uhr steht still).
- Wer die Seite neu lädt, landet wieder auf seinem Platz (Erkennung über den Browser-Speicher).

## Projektstruktur

```
server/     Express + Socket.IO, Turniersteuerung (session.js), Hand-Engine (engine.js)
shared/     Von Server und Browser genutzt: Karten/Handbewertung, Turnierstruktur
public/     three.js-Client: Szene, Tisch, Chips, Karten, Animationen, Oberfläche, Voice
deploy/     Docker Compose + Caddy (HTTPS) + optionaler TURN-Server, setup.sh
scripts/    Test-Bots
test/       node:test-Tests
```
