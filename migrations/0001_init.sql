CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  is_reversed INTEGER NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  side TEXT NOT NULL DEFAULT 'forward',
  grade INTEGER NOT NULL,
  prev_interval INTEGER NOT NULL,
  prev_ease REAL NOT NULL DEFAULT 2.5,
  prev_reps INTEGER NOT NULL DEFAULT 0,
  prev_lapses INTEGER NOT NULL DEFAULT 0,
  next_interval INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_cards_deck_due ON cards(deck_id, due);
CREATE INDEX idx_reviews_created ON reviews(created_at);
