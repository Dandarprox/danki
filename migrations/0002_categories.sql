ALTER TABLE decks ADD COLUMN parent_id TEXT REFERENCES decks(id);
