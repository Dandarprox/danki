// Fresh-install SQL: categories + topic decks + all words.
// Usage: bun server/emit-seeds-sql.ts > seeds.sql
import { randomUUIDv7 } from "bun";
import { CATALOG } from "./catalog";

const esc = (s: string) => s.replace(/'/g, "''");
const now = Math.floor(Date.now() / 1000);

for (const cat of CATALOG) {
  const catId = randomUUIDv7();
  console.log(`INSERT INTO decks(id,name,parent_id,created_at) VALUES('${catId}','${esc(cat.name)}',NULL,${now});`);
  for (const deck of cat.decks) {
    const deckId = randomUUIDv7();
    console.log(
      `INSERT INTO decks(id,name,parent_id,created_at) VALUES('${deckId}','${esc(deck.name)}','${catId}',${now});`
    );
    for (const [front, back] of deck.words) {
      console.log(
        `INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) VALUES('${randomUUIDv7()}','${deckId}','${esc(front)}','${esc(back)}',0,2.5,0,0,0,${now},${now});`
      );
    }
  }
}
