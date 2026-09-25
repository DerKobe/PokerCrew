# ♠ PokerCrew

Self-hosted **No-Limit Texas Hold'em tournaments** for up to 5 friends: a poker table rendered in **three.js** with built-in **voice and video chat**. There is a single table, and anyone with the URL can join without an account. The UI is available in English and German.

## Run locally

Requires Node.js ≥ 20.

```bash
npm install
npm start
```

Then open <http://localhost:3000>. To try it on your own, seat some test bots from a second terminal:

```bash
node scripts/bots.js 3
```

Options: `--start` starts the tournament automatically, `--shove` makes the bots go all-in whenever they can, and `--fun` makes them play with their gadgets.

Run the tests with:

```bash
npm test
```

> Browsers only allow microphone access over **HTTPS** (or on `localhost`), so put a TLS-terminating reverse proxy in front of the app when you host it. `deploy/` contains a Docker Compose + Caddy setup for this.
