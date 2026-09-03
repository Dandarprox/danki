import { db, uid, nowSec } from "./db";

// NOTE: superseded by server/catalog.ts (topic structure) — kept as source
// material parsed by server/build-catalog.ts. Use server/seed-catalog.ts.

// 100 basic German words (front) with Spanish meanings (back).
// Nouns include their article (der/die/das) — essential in German.
const WORDS: Array<[string, string]> = [
  // Saludos / cortesía
  ["Hallo", "hola"],
  ["Guten Morgen", "buenos días"],
  ["Guten Abend", "buenas noches (saludo)"],
  ["Gute Nacht", "buenas noches (despedida)"],
  ["Tschüss", "adiós / chao"],
  ["Bitte", "por favor / de nada"],
  ["Danke", "gracias"],
  ["Ja", "sí"],
  ["Nein", "no"],
  ["Entschuldigung", "perdón / disculpa"],
  // Familia / personas
  ["der Mann", "el hombre"],
  ["die Frau", "la mujer"],
  ["das Kind", "el niño / la niña"],
  ["der Freund", "el amigo"],
  ["die Familie", "la familia"],
  ["der Vater", "el padre"],
  ["die Mutter", "la madre"],
  ["der Bruder", "el hermano"],
  ["die Schwester", "la hermana"],
  ["das Baby", "el bebé"],
  // Sustantivos comunes
  ["das Haus", "la casa"],
  ["die Wohnung", "el apartamento / el piso"],
  ["die Tür", "la puerta"],
  ["das Fenster", "la ventana"],
  ["der Tisch", "la mesa"],
  ["der Stuhl", "la silla"],
  ["das Bett", "la cama"],
  ["das Buch", "el libro"],
  ["die Schule", "la escuela"],
  ["die Arbeit", "el trabajo"],
  ["das Auto", "el coche / el auto"],
  ["der Zug", "el tren"],
  ["das Flugzeug", "el avión"],
  ["die Straße", "la calle"],
  ["die Stadt", "la ciudad"],
  ["das Dorf", "el pueblo"],
  ["das Land", "el país"],
  ["die Welt", "el mundo"],
  ["die Zeit", "el tiempo"],
  ["der Tag", "el día"],
  // Comida / bebida
  ["das Brot", "el pan"],
  ["das Wasser", "el agua"],
  ["die Milch", "la leche"],
  ["der Kaffee", "el café"],
  ["der Tee", "el té"],
  ["das Bier", "la cerveza"],
  ["der Apfel", "la manzana"],
  ["die Kartoffel", "la patata / la papa"],
  ["das Fleisch", "la carne"],
  ["der Fisch", "el pescado"],
  ["das Ei", "el huevo"],
  ["der Käse", "el queso"],
  ["der Zucker", "el azúcar"],
  ["das Salz", "la sal"],
  ["das Frühstück", "el desayuno"],
  // Cuerpo
  ["der Kopf", "la cabeza"],
  ["das Auge", "el ojo"],
  ["die Hand", "la mano"],
  ["der Fuß", "el pie"],
  ["das Herz", "el corazón"],
  ["der Mund", "la boca"],
  ["die Nase", "la nariz"],
  ["die Haare", "el pelo"],
  // Naturaleza / animales
  ["die Sonne", "el sol"],
  ["der Mond", "la luna"],
  ["der Stern", "la estrella"],
  ["der Himmel", "el cielo"],
  ["der Baum", "el árbol"],
  ["die Blume", "la flor"],
  ["das Tier", "el animal"],
  ["der Hund", "el perro"],
  ["die Katze", "el gato"],
  ["der Vogel", "el pájaro"],
  // Verbos
  ["sein", "ser / estar"],
  ["haben", "tener"],
  ["gehen", "ir (a pie)"],
  ["kommen", "venir"],
  ["essen", "comer"],
  ["trinken", "beber"],
  ["schlafen", "dormir"],
  ["sprechen", "hablar"],
  ["lernen", "aprender"],
  ["arbeiten", "trabajar"],
  ["wohnen", "vivir (residir)"],
  ["lieben", "amar / querer"],
  ["machen", "hacer"],
  ["sehen", "ver"],
  ["lesen", "leer"],
  // Adjetivos / números / misc
  ["gut", "bueno / bien"],
  ["schlecht", "malo / mal"],
  ["groß", "grande"],
  ["klein", "pequeño"],
  ["neu", "nuevo"],
  ["alt", "viejo / antiguo"],
  ["eins", "uno"],
  ["zwei", "dos"],
  ["drei", "tres"],
  ["zehn", "diez"],
  ["hundert", "cien"],
  ["viel", "mucho"],
];

const DECK_NAME = "Alemán básico";

if (WORDS.length !== 100) {
  throw new Error(`Expected 100 words, got ${WORDS.length}`);
}

const existing = db
  .query("SELECT id FROM decks WHERE name=?")
  .get(DECK_NAME) as { id: string } | null;

if (existing) {
  const count = (
    db
      .query("SELECT COUNT(*) c FROM cards WHERE deck_id=?")
      .get(existing.id) as { c: number }
  ).c;
  console.log(`Deck "${DECK_NAME}" already exists with ${count} cards — nothing to do.`);
  process.exit(0);
}

const deckId = uid();
const now = nowSec();
db.query("INSERT INTO decks(id,name,created_at) VALUES(?,?,?)").run(
  deckId,
  DECK_NAME,
  now
);

const insert = db.query(
  "INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
);
const tx = db.transaction(() => {
  for (const [front, back] of WORDS) {
    insert.run(uid(), deckId, front, back, 0, 2.5, 0, 0, 0, now, now);
  }
});
tx();

console.log(`Seeded deck "${DECK_NAME}" with ${WORDS.length} cards.`);
