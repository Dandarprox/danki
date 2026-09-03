// One-shot builder: splits the flat seed files into topic decks, merges the
// new lists from words-new.ts, and writes server/catalog.ts (committed).
// Usage: bun server/build-catalog.ts
// Verifies every expected count and fails loudly on mismatch.
import {
  NEW_FR_SPORTS, NEW_FR_SENTIMENTS, NEW_FR_PROFESSIONS,
  NEW_DE_KLEIDUNG, NEW_DE_FARBEN, NEW_DE_SPORT, NEW_DE_BERUFE, NEW_DE_GEFUEHLE,
} from "./words-new";

type Word = [string, string];

async function sections(path: string): Promise<{ header: string; words: Word[] }[]> {
  const text = await Bun.file(path).text();
  const out: { header: string; words: Word[] }[] = [];
  let current: { header: string; words: Word[] } | null = null;
  const tuple = /^\s*\["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\],?\s*$/;
  for (const line of text.split("\n")) {
    const h = line.match(/^\s*\/\/\s*(.+?)\s*$/);
    if (h) {
      // skip the file-level lead comment (mentions the deck, not a topic)
      if (/deck|words|front|nouns|artículo|articulo/i.test(h[1]) && out.length === 0 && !/\(\d+\)|cortesía|cortes|familia|sustantivos|comida|cuerpo|naturaleza|verbos|adjetivos|saludos|ropa|colores|ciudad|trabajo/i.test(h[1])) {
        continue;
      }
      current = { header: h[1], words: [] };
      out.push(current);
      continue;
    }
    const m = line.match(tuple);
    if (m && current) current.words.push([JSON.parse(`"${m[1]}"`), JSON.parse(`"${m[2]}"`)]);
  }
  return out.filter((s) => s.words.length > 0);
}

const fr = await sections("server/seed-french-500.ts");
const de = await sections("server/seed-german-spanish.ts");

const find = (secs: typeof fr, key: string) => {
  const s = secs.find((x) => x.header.toLowerCase().includes(key.toLowerCase()));
  if (!s) throw new Error(`Section "${key}" not found`);
  return s.words;
};

// French splits (positional, verified by assertions below)
const frNature = find(fr, "naturaleza");
const frColors = find(fr, "colores");

interface DeckSpec { name: string; words: Word[]; expect: number }
interface CatSpec { name: string; oldDeck: string; decks: DeckSpec[] }

const catalog: CatSpec[] = [
  {
    name: "Français",
    oldDeck: "Francés básico-intermedio",
    decks: [
      { name: "Salutations", words: find(fr, "saludos"), expect: 20 },
      { name: "Famille", words: find(fr, "familia"), expect: 30 },
      { name: "Maison", words: find(fr, "casa"), expect: 40 },
      { name: "Nourriture", words: find(fr, "comida"), expect: 50 },
      { name: "Corps et santé", words: find(fr, "cuerpo"), expect: 30 },
      { name: "Nature et météo", words: frNature.slice(0, 23), expect: 23 },
      { name: "Animaux", words: frNature.slice(23), expect: 17 },
      { name: "Vêtements", words: find(fr, "ropa"), expect: 25 },
      { name: "Couleurs et nombres", words: frColors.slice(0, 26), expect: 26 },
      { name: "Temps et calendrier", words: frColors.slice(26), expect: 38 },
      { name: "Ville et voyages", words: find(fr, "ciudad"), expect: 45 },
      { name: "Travail et école", words: find(fr, "trabajo"), expect: 35 },
      { name: "Verbes", words: find(fr, "verbos"), expect: 70 },
      { name: "Adjectifs", words: find(fr, "adjetivos"), expect: 51 },
      { name: "Sports et loisirs", words: NEW_FR_SPORTS, expect: 30 },
      { name: "Sentiments", words: NEW_FR_SENTIMENTS, expect: 25 },
      { name: "Professions", words: NEW_FR_PROFESSIONS, expect: 25 },
    ],
  },
  {
    name: "Alemán",
    oldDeck: "Alemán básico",
    decks: [
      { name: "Begrüßung", words: find(de, "saludos"), expect: 10 },
      { name: "Familie", words: find(de, "familia"), expect: 10 },
      { name: "Alltag", words: find(de, "sustantivos"), expect: 20 },
      { name: "Essen", words: find(de, "comida"), expect: 15 },
      { name: "Körper", words: find(de, "cuerpo"), expect: 8 },
      { name: "Natur", words: find(de, "naturaleza"), expect: 10 },
      { name: "Verben", words: find(de, "verbos"), expect: 15 },
      { name: "Adjektive", words: find(de, "adjetivos"), expect: 12 },
      { name: "Kleidung", words: NEW_DE_KLEIDUNG, expect: 20 },
      { name: "Farben & Zahlen", words: NEW_DE_FARBEN, expect: 20 },
      { name: "Sport & Freizeit", words: NEW_DE_SPORT, expect: 20 },
      { name: "Berufe", words: NEW_DE_BERUFE, expect: 15 },
      { name: "Gefühle", words: NEW_DE_GEFUEHLE, expect: 15 },
    ],
  },
];

// Validate: counts, no duplicate fronts within a deck or across the catalog.
const seen = new Map<string, string>();
for (const cat of catalog) {
  for (const d of cat.decks) {
    if (d.words.length !== d.expect)
      throw new Error(`${cat.name}/${d.name}: expected ${d.expect}, got ${d.words.length}`);
    for (const [front] of d.words) {
      const key = front.toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate front "${front}" in ${cat.name}/${d.name} and ${seen.get(key)}`);
      seen.set(key, `${cat.name}/${d.name}`);
    }
  }
}
const total = catalog.reduce((n, c) => n + c.decks.reduce((m, d) => m + d.words.length, 0), 0);
if (total !== 770) throw new Error(`Expected 770 total words, got ${total}`);

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
let ts = `// AUTO-GENERATED by bun server/build-catalog.ts — do not edit by hand.\n`;
ts += `// 2 categories, 30 topic decks, 770 words (FR 580 + DE 190).\n`;
ts += `export interface TopicDeck { name: string; words: [string, string][] }\n`;
ts += `export interface Category { name: string; oldDeck: string; decks: TopicDeck[] }\n`;
ts += `export const CATALOG: Category[] = [\n`;
for (const cat of catalog) {
  ts += `  {\n    name: ${JSON.stringify(cat.name)},\n    oldDeck: ${JSON.stringify(cat.oldDeck)},\n    decks: [\n`;
  for (const d of cat.decks) {
    ts += `      { name: ${JSON.stringify(d.name)}, words: [\n`;
    for (const [f, b] of d.words) ts += `        [${JSON.stringify(f)}, ${JSON.stringify(b)}],\n`;
    ts += `      ] },\n`;
  }
  ts += `    ],\n  },\n`;
}
ts += `];\n`;

await Bun.write("server/catalog.ts", ts);
console.log(`catalog.ts written: ${catalog.length} categories, ${total} words, no duplicates.`);
console.log(`FR nature split: ${frNature.length} | FR colors split: ${frColors.length}`);
