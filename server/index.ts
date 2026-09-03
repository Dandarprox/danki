import { db, uid, nowSec, startOfTodaySec } from "./db";
import { gradeCard, type Grade } from "./srs";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIST = new URL("../client/dist/", import.meta.url).pathname;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

function deckCounts(deckId: string) {
  const today = startOfTodaySec();
  const total =
    db.query("SELECT COUNT(*) c FROM cards WHERE deck_id=?").get(deckId) as any;
  const due = db
    .query("SELECT COUNT(*) c FROM cards WHERE deck_id=? AND due<=?")
    .get(deckId, nowSec()) as any;
  const fresh = db
    .query("SELECT COUNT(*) c FROM cards WHERE deck_id=? AND reps=0")
    .get(deckId) as any;
  return { total: total.c, due: due.c, isNew: fresh.c, today };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // ---- API ----
    if (pathname === "/api/health") return json({ ok: true });

    if (pathname === "/api/stats/overview") {
      const total = (db.query("SELECT COUNT(*) c FROM cards").get() as any).c;
      const decks = (db.query("SELECT COUNT(*) c FROM decks").get() as any).c;
      const due = (
        db.query("SELECT COUNT(*) c FROM cards WHERE due<=?").get(nowSec()) as any
      ).c;
      // streak: distinct review days trailing back from today
      const days = (
        db.query(
          "SELECT DISTINCT CAST(created_at/86400 AS INT) d FROM reviews ORDER BY d DESC LIMIT 60"
        ) as any
      ).all() as { d: number }[];
      const todayDay = Math.floor(Date.now() / 86400000);
      let streak = 0;
      const set = new Set(days.map((r) => r.d));
      for (let d = todayDay; ; d--) {
        if (set.has(d)) streak++;
        else if (d === todayDay) continue; // allow today missing
        else break;
      }
      return json({ total, decks, due, streak });
    }

    if (pathname === "/api/decks" && req.method === "GET") {
      const decks = db.query("SELECT * FROM decks ORDER BY created_at DESC").all() as any[];
      return json(decks.map((d) => ({ ...d, ...deckCounts(d.id) })));
    }
    if (pathname === "/api/decks" && req.method === "POST") {
      const { name } = await body<{ name: string }>(req);
      if (!name?.trim()) return json({ error: "Name required" }, 400);
      const id = uid();
      db.query("INSERT INTO decks(id,name,created_at) VALUES(?,?,?)").run(id, name.trim(), nowSec());
      return json({ id, name: name.trim() }, 201);
    }

    const deckMatch = pathname.match(/^\/api\/decks\/([^/]+)(\/cards)?$/);
    if (deckMatch) {
      const [, id, cardsSuffix] = deckMatch;
      const deck = db.query("SELECT * FROM decks WHERE id=?").get(id) as any;
      if (!deck) return json({ error: "Deck not found" }, 404);

      if (!cardsSuffix && req.method === "GET")
        return json({ ...deck, ...deckCounts(id) });
      if (!cardsSuffix && req.method === "PATCH") {
        const { name } = await body<{ name: string }>(req);
        db.query("UPDATE decks SET name=? WHERE id=?").run(name.trim(), id);
        return json({ ok: true });
      }
      if (!cardsSuffix && req.method === "DELETE") {
        db.query("DELETE FROM decks WHERE id=?").run(id);
        return json({ ok: true });
      }
      if (cardsSuffix === "/cards" && req.method === "GET") {
        const cards = db
          .query("SELECT * FROM cards WHERE deck_id=? ORDER BY created_at DESC")
          .all(id);
        return json(cards);
      }
      if (cardsSuffix === "/cards" && req.method === "POST") {
        const { front, back, is_reversed } = await body<{
          front: string; back: string; is_reversed?: boolean;
        }>(req);
        if (!front?.trim() || !back?.trim())
          return json({ error: "Front and back required" }, 400);
        const cid = uid();
        const now = nowSec();
        db.query(
          "INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
        ).run(cid, id, front.trim(), back.trim(), is_reversed ? 1 : 0, 2.5, 0, 0, 0, now, now);
        return json({ id: cid }, 201);
      }
    }

    const cardMatch = pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (cardMatch && (req.method === "PATCH" || req.method === "DELETE")) {
      const [, id] = cardMatch;
      if (req.method === "DELETE") {
        db.query("DELETE FROM cards WHERE id=?").run(id);
        return json({ ok: true });
      }
      const { front, back, is_reversed } = await body<any>(req);
      db.query("UPDATE cards SET front=?, back=?, is_reversed=? WHERE id=?").run(
        front, back, is_reversed ? 1 : 0, id
      );
      return json({ ok: true });
    }

    if (pathname === "/api/study/queue" && req.method === "GET") {
      const deckId = url.searchParams.get("deckId");
      const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
      const now = nowSec();
      const where = deckId ? "WHERE c.deck_id=?" : "";
      const params: any[] = deckId ? [deckId, now, limit] : [now, limit];
      // new cards first, then most overdue
      const rows = db
        .query(
          `SELECT c.*, d.name deck_name FROM cards c JOIN decks d ON d.id=c.deck_id
           ${where ? where + " AND" : "WHERE"} c.due<=? ORDER BY c.reps ASC, c.due ASC LIMIT ?`
        )
        .all(...params) as any[];
      // expand reversed cards into two study items
      const items: any[] = [];
      for (const c of rows) {
        items.push({ ...c, side: "forward", q: c.front, a: c.back });
        if (c.is_reversed)
          items.push({ ...c, side: "reverse", q: c.back, a: c.front });
      }
      return json(items.slice(0, limit));
    }

    if (pathname === "/api/study/review" && req.method === "POST") {
      const { cardId, side, grade } = await body<{
        cardId: string; side: string; grade: Grade;
      }>(req);
      if (![1, 3, 4, 5].includes(grade)) return json({ error: "Bad grade" }, 400);
      const card = db.query("SELECT * FROM cards WHERE id=?").get(cardId) as any;
      if (!card) return json({ error: "Card not found" }, 404);
      const r = gradeCard(
        { ease: card.ease, interval_days: card.interval_days, reps: card.reps, lapses: card.lapses },
        grade
      );
      const due = nowSec() + r.dueInSec;
      db.query(
        "UPDATE cards SET ease=?, interval_days=?, reps=?, lapses=?, due=? WHERE id=?"
      ).run(r.ease, r.interval_days, r.reps, r.lapses, due, cardId);
      db.query(
        "INSERT INTO reviews(id,card_id,side,grade,prev_interval,next_interval,created_at) VALUES(?,?,?,?,?,?,?)"
      ).run(uid(), cardId, side ?? "forward", grade, card.interval_days, r.nextIntervalDays, nowSec());
      return json({ ok: true, due, nextIntervalDays: r.nextIntervalDays });
    }

    // ---- Static (prod) ----
    if (!pathname.startsWith("/api/")) {
      try {
        const file = Bun.file(CLIENT_DIST + (pathname === "/" ? "index.html" : pathname.slice(1)));
        if (await file.exists()) return new Response(file);
        return new Response(Bun.file(CLIENT_DIST + "index.html"));
      } catch {
        // dev: vite serves client separately
        return json({ hint: "Run client dev server (vite client). API ok." });
      }
    }
    return json({ error: "Not found" }, 404);
  },
});

console.log(`danki up → http://localhost:${server.port}`);
