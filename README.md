# 団 danki — simple beautiful spaced repetition

A minimal Anki-like webapp for fast card entry and calm study sessions.
**Bun + React + SQLite**, single-port server, SM-2 scheduling, light/dark warm-minimal UI.

![stack](https://img.shields.io/badge/bun-%23000000.svg?style=flat&logo=bun)
![react](https://img.shields.io/badge/react-19-61DAFB?style=flat&logo=react)
![sqlite](https://img.shields.io/badge/sqlite-WAL-003B57?style=flat&logo=sqlite)
![tailwind](https://img.shields.io/badge/tailwind-v4-38BDF8?style=flat&logo=tailwindcss)

## ✨ Features

- 📚 **Decks + cards** — create decks, add front/back cards, optional **reversed (⇄)** study both ways
- 🧠 **SM-2 reviews** — Again / Hard / Good / Easy with interval previews (`10m · 1d · 6d…`)
- ⚡ **Rapid entry** — `Enter` saves & next, `⇧↵` newline, `N` focuses form, `/` searches, `Esc` cancels, sticky ⇄ toggle, autofocus-everything
- 🔍 **Deck search** — filter cards instantly, due/new badges per card
- 📊 **Study sessions** — flip card, progress bar, forward/reverse badges, keyboard (`Space`, `1–4`), completion summary
- 🔥 **Streak + due counts** — header pills, hero stats
- 🌙 **Dark mode** — warm paper light + OLED-friendly dark, persisted + respects OS
- 🗄️ **SQLite** — single `data/danki.db` (WAL), zero-config, single user local

## 🚀 Quickstart

```bash
bun install
bun run dev        # API :3000 + client :5173 (concurrently)
```

Or run pieces separately:

```bash
bun run server:dev   # Bun --hot server/index.ts → :3000
bun run client:dev   # Vite → :5173 (proxies /api → :3000)
```

Production (single port — server serves `client/dist`):

```bash
bun run build
bun start            # → http://localhost:3000
```

Tests (SM-2 unit):

```bash
bun test
```

## 🌱 Starter decks

```bash
bun server/seed-german-spanish.ts   # Alemán básico — 100 DE→ES words
bun server/seed-french-500.ts       # Francés básico-intermedio — 500 FR→ES words
```

Both are idempotent (they skip if the deck already exists).

## ⌨️ Shortcuts

| Where | Keys |
|---|---|
| Add card | `Enter` save · `⇧↵` newline · `⌘/Ctrl+Enter` save · `N` focus form · `Esc` cancel |
| Search cards | `/` focus |
| Study | `Space` flip · `1` Again · `2` Hard · `3` Good · `4` Easy · `E` instant Easy (no reveal — for cards you know cold) · `←`/`→` revisit graded cards and correct the grade |
| Mobile (touch) | tap = flip · hidden card: swipe `→` = Easy · revealed: swipe `←` Again · `→` Good · `↑` Easy · `↓` Hard · haptic tick on grade |

## 🧠 How scheduling works

Simplified SM-2 in `server/srs.ts` (mirrored client-side for previews):

- **Again (1):** 10-min relearn, ease −0.2 (min 1.3), lapses++
- **Hard (3):** `max(1, prev × 1.2)`, ease −0.15
- **Good (4):** new → `1d`, 2nd → `6d`, then `round(prev × ease)`
- **Easy (5):** new → `4d`, then `prev × ease × 1.3`, ease +0.15 (max 3.0)

Queue: new cards first, then most overdue (`due <= now`), reversed cards expand into forward + reverse items.

## 🗂️ Project layout

```
server/
  index.ts    # Bun.serve — REST /api/* + static client/dist
  db.ts       # bun:sqlite init, schema, WAL
  srs.ts      # SM-2 gradeCard() + previews (+ .test.ts)
client/
  index.html  # fonts, favicon, theme bootstrap
  src/
    App.tsx       # Decks / DeckDetail / Study screens
    lib/api.ts    # typed fetch wrapper
    index.css     # Tailwind v4 theme, flip, shimmer, kbd
data/           # danki.db (gitignored)
docs/superpowers/specs/  # design spec
```

API: `GET/POST /api/decks`, `GET/PATCH/DELETE /api/decks/:id`, `GET/POST /api/decks/:id/cards`, `PATCH/DELETE /api/cards/:id`, `GET /api/study/queue`, `POST /api/study/review`, `GET /api/stats/overview`, `GET /api/health`.

## ☁️ Cloudflare hosting (free, always-on, no Mac needed)

Architecture: **one Worker** serves the API + the React build (Static Assets),
data lives in **D1** (Cloudflare's SQLite — same SQL, same SM-2 code in
`server/srs.ts`, shared verbatim). All within the free tier.

```
worker/api.ts      # Worker entry — same REST API as server/index.ts, via D1
migrations/        # D1 schema (incl. regrade snapshot columns)
seeds.sql          # generated starter decks — bun run seeds:sql
wrangler.toml      # worker + assets + D1 binding
```

### Deploy steps (one-time, ~5 min)

```bash
# 1. log in (browser) and create the database
node_modules/.bin/wrangler login
node_modules/.bin/wrangler d1 create danki
# → paste the returned database_id into wrangler.toml

# 2. migrate + seed + protect (recommended: shared-secret auth)
node_modules/.bin/wrangler d1 migrations apply danki --remote
bun run seeds:sql
node_modules/.bin/wrangler d1 execute danki --remote --file=seeds.sql
node_modules/.bin/wrangler secret put API_TOKEN   # any random string

# 3. build the frontend with the same token baked in, then deploy
VITE_API_TOKEN=<same-string> bun run build
node_modules/.bin/wrangler deploy
# → https://danki.<your-subdomain>.workers.dev
```

How auth works: if `API_TOKEN` is set on the worker, every `/api/*` route
(except health) requires the `x-api-token` header; the frontend sends it when
built with `VITE_API_TOKEN`. Leave both unset for local/dev use. Shortcuts:

```bash
bun run cf:dev       # local worker + local D1 (no account needed)
bun run cf:deploy    # build + deploy
bun run cf:migrate   # remote migrations
bun run cf:seed      # remote seeds
bun run cf:secret    # set remote API_TOKEN
bun run seeds:sql    # regenerate seeds.sql from server/seed-*.ts
```

### Cheaper alternative: share from this Mac (temporary)

```bash
brew install cloudflared
bun run build && bun start          # serve API + client on :3000
cloudflared tunnel --url http://localhost:3000
# → https://<random>.trycloudflare.com
```

Free and instant, but the URL dies with the process and your machine must stay
on. Good for demos, not for daily use.

## 🛣️ Roadmap

- [ ] CSV / Anki `.apkg` import-export
- [ ] Bulk add (paste `front | back` lines)
- [ ] Retention heatmap + per-deck stats
- [ ] Multi-user + sync
- [ ] PWA offline

## 📄 License

MIT — do what you want, learn everything. 団
