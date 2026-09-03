# Danki — Design Spec (2026-09-02)

Single-user Anki-like spaced repetition webapp. Beautiful, simple.

## Decisions
- Cards: basic front/back + reversed flag (generates 2 study directions)
- Study: Anki 4-buttons (Again/Hard/Good/Easy) with SM-2
- Scope v1: decks CRUD, cards CRUD, study queue, light/dark warm minimal. No auth, no import/export, no stats page.

## Architecture
Bun single-port: `Bun.serve :3000` serves `/api/*` + `client/dist` static.
SQLite via `bun:sqlite` at `data/danki.db`, WAL mode, raw SQL.
Frontend React+Vite+Tailwind v4, class dark mode, warm paper tokens.

## Schema
decks(id TEXT PK, name TEXT, created_at INT)
cards(id TEXT PK, deck_id FK, front TEXT, back TEXT, is_reversed INT 0/1, ease REAL 2.5, interval INT 0, reps INT 0, lapses INT 0, due INT, created_at INT)
reviews(id TEXT PK, card_id FK, grade 1-4, prev_interval, next_interval, created_at INT)

## SRS (SM-2 simplified)
- Again(1): lapses++, interval=0 (10min in-session → due now+600s, reps reset-ish), ease=max(1.3,ease-0.2)
- Hard(3): interval=max(1, floor(prev*1.2)), ease=max(1.3,ease-0.15)
- Good(4): interval = reps==0?1 : reps==1?6 : round(prev*ease), ease unchanged
- Easy(5→ mapped 4th btn): interval=round(prev*ease*1.3)+1 min 4d-ish for new, ease+=0.15
Grades from UI: again=1, hard=3, good=4, easy=5.

## API
GET/POST /api/decks | PATCH/DELETE /api/decks/:id
GET /api/decks/:id (with counts: total,new,due)
GET/POST /api/decks/:id/cards | PATCH/DELETE /api/cards/:id
GET /api/study/queue?deckId=&limit=50 → ordered new→due, expands reversed into 2 sides
POST /api/study/review {cardId, side, grade} → applies SM-2, logs review
GET /api/stats/overview → totals, due today, streak

## UI
Screens: Decks grid / Deck detail (table+add modal) / Study (flip card, interval preview).
Components: ThemeToggle, DeckCard, AddDeck, CardEditor, StudyCard, GradeButtons.
Dark mode via `documentElement.classList`.
