// One-shot generator: extracts the word tuples from the bun seed scripts
// and emits a seeds.sql for `wrangler d1 execute --file`.
// Usage: bun server/emit-seeds-sql.ts > seeds.sql
import { randomUUIDv7 } from "bun";

const esc = (s: string) => s.replace(/'/g, "''");

async function extract(path: string): Promise<{ deck: string; words: [string, string][] }> {
  const text = await Bun.file(path).text();
  const deck = text.match(/const DECK_NAME = "([^"]+)"/)?.[1];
  if (!deck) throw new Error(`No DECK_NAME in ${path}`);
  const words: [string, string][] = [];
  // Tuples are machine-uniform: ["front", "back"],
  const re = /^\s*\["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\],?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    words.push([JSON.parse(`"${m[1]}"`), JSON.parse(`"${m[2]}"`)]);
  }
  if (words.length === 0) throw new Error(`No words in ${path}`);
  return { deck, words };
}

const now = Math.floor(Date.now() / 1000);
for (const path of ["server/seed-german-spanish.ts", "server/seed-french-500.ts"]) {
  const { deck, words } = await extract(path);
  const deckId = randomUUIDv7();
  console.log(`INSERT INTO decks(id,name,created_at) VALUES('${deckId}','${esc(deck)}',${now});`);
  for (const [front, back] of words) {
    console.log(
      `INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) VALUES('${randomUUIDv7()}','${deckId}','${esc(front)}','${esc(back)}',0,2.5,0,0,0,${now},${now});`
    );
  }
}
