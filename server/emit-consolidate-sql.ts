// One-shot SQL for databases that already have the flat seed decks WITH
// review progress (e.g. production D1): moves studied cards into the new
// topic decks (SRS state untouched), inserts only new words, and removes
// emptied flat decks. Deterministic IDs → safe to run, inspect, re-run.
// Usage: bun server/emit-consolidate-sql.ts > consolidate.sql
//        wrangler d1 execute danki --remote --file=consolidate.sql
import { CATALOG } from "./catalog";

const esc = (s: string) => s.replace(/'/g, "''");
const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const now = Math.floor(Date.now() / 1000);

for (const cat of CATALOG) {
  const catId = `cat-${slug(cat.name)}`;
  const oldSel = `(SELECT id FROM decks WHERE name='${esc(cat.oldDeck)}' AND parent_id IS NULL)`;
  console.log(
    `INSERT OR IGNORE INTO decks(id,name,parent_id,created_at) VALUES('${catId}','${esc(cat.name)}',NULL,${now});`
  );
  for (const deck of cat.decks) {
    const deckId = `${slug(cat.name).slice(0, 2)}-${slug(deck.name)}`;
    console.log(
      `INSERT OR IGNORE INTO decks(id,name,parent_id,created_at) VALUES('${deckId}','${esc(deck.name)}','${catId}',${now});`
    );
    for (const [front, back] of deck.words) {
      const f = esc(front);
      console.log(
        `UPDATE cards SET deck_id='${deckId}' WHERE front='${f}' AND deck_id=${oldSel};`
      );
      console.log(
        `INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) SELECT hex(randomblob(16)),'${deckId}','${f}','${esc(back)}',0,2.5,0,0,0,${now},${now} WHERE NOT EXISTS (SELECT 1 FROM cards WHERE front='${f}' AND deck_id='${deckId}');`
      );
    }
  }
  console.log(
    `DELETE FROM decks WHERE name='${esc(cat.oldDeck)}' AND parent_id IS NULL AND NOT EXISTS (SELECT 1 FROM cards WHERE deck_id=decks.id);`
  );
}
