import { db, uid, nowSec } from "./db";
import { CATALOG } from "./catalog";

// Consolidates flat seed decks into nested categories, preserving review
// progress: cards already studied are MOVED (SRS state untouched), only
// genuinely new words are inserted. Idempotent — safe to re-run.
// Old flat decks are deleted once empty. Personal decks are never touched.
const now = nowSec();
let moved = 0;
let inserted = 0;

for (const cat of CATALOG) {
  const catRow = db
    .query("SELECT id FROM decks WHERE name=? AND parent_id IS NULL")
    .get(cat.name) as { id: string } | null;
  const catId = catRow?.id ?? uid();
  if (!catRow)
    db.query("INSERT INTO decks(id,name,parent_id,created_at) VALUES(?,?,?,?)").run(catId, cat.name, null, now);

  const oldRow = db
    .query("SELECT id FROM decks WHERE name=? AND parent_id IS NULL")
    .get(cat.oldDeck) as { id: string } | null;

  for (const deck of cat.decks) {
    const row = db
      .query("SELECT id FROM decks WHERE name=? AND parent_id=?")
      .get(deck.name, catId) as { id: string } | null;
    const deckId = row?.id ?? uid();
    if (!row)
      db.query("INSERT INTO decks(id,name,parent_id,created_at) VALUES(?,?,?,?)").run(deckId, deck.name, catId, now);

    for (const [front, back] of deck.words) {
      const there = db
        .query("SELECT id FROM cards WHERE front=? AND deck_id=?")
        .get(front, deckId) as { id: string } | null;
      if (there) continue;
      if (oldRow) {
        const mine = db
          .query("SELECT id FROM cards WHERE front=? AND deck_id=?")
          .get(front, oldRow.id) as { id: string } | null;
        if (mine) {
          db.query("UPDATE cards SET deck_id=? WHERE id=?").run(deckId, mine.id);
          moved++;
          continue;
        }
      }
      db.query(
        "INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
      ).run(uid(), deckId, front, back, 0, 2.5, 0, 0, 0, now, now);
      inserted++;
    }
  }

  if (oldRow) {
    const left = (db.query("SELECT COUNT(*) c FROM cards WHERE deck_id=?").get(oldRow.id) as { c: number }).c;
    if (left === 0) {
      db.query("DELETE FROM decks WHERE id=?").run(oldRow.id);
      console.log(`Removed emptied flat deck "${cat.oldDeck}".`);
    } else {
      console.log(`"${cat.oldDeck}" still has ${left} unmapped cards — left in place.`);
    }
  }
}

console.log(`Done: moved ${moved} studied cards (progress kept), inserted ${inserted} new words.`);
