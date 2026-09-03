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
  const now = nowSec();
  // Rollups include all descendant decks (a deck with children is a category).
  const total = db
    .query(
      `WITH RECURSIVE sub(id) AS (
         SELECT ? UNION SELECT d.id FROM decks d JOIN sub s ON d.parent_id = s.id
       ) SELECT COUNT(*) c FROM cards WHERE deck_id IN sub`
    )
    .get(deckId) as any;
  const due = db
    .query(
      `WITH RECURSIVE sub(id) AS (
         SELECT ? UNION SELECT d.id FROM decks d JOIN sub s ON d.parent_id = s.id
       ) SELECT COUNT(*) c FROM cards WHERE deck_id IN sub AND due<=?`
    )
    .get(deckId, now) as any;
  const fresh = db
    .query(
      `WITH RECURSIVE sub(id) AS (
         SELECT ? UNION SELECT d.id FROM decks d JOIN sub s ON d.parent_id = s.id
       ) SELECT COUNT(*) c FROM cards WHERE deck_id IN sub AND reps=0`
    )
    .get(deckId) as any;
  const children = db
    .query("SELECT COUNT(*) c FROM decks WHERE parent_id=?")
    .get(deckId) as any;
  return { total: total.c, due: due.c, isNew: fresh.c, today, children: children.c };
}

// All descendant deck ids (for category study + cycle guard).
function descendants(deckId: string): string[] {
  const rows = db
    .query(
      `WITH RECURSIVE sub(id) AS (
         SELECT ? UNION SELECT d.id FROM decks d JOIN sub s ON d.parent_id = s.id
       ) SELECT id FROM sub WHERE id != ?`
    )
    .all(deckId, deckId) as { id: string }[];
  return rows.map((r) => r.id);
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
      const { name, parent_id } = await body<{ name: string; parent_id?: string | null }>(req);
      if (!name?.trim()) return json({ error: "Name required" }, 400);
      if (parent_id) {
        const p = db.query("SELECT id FROM decks WHERE id=?").get(parent_id) as any;
        if (!p) return json({ error: "Parent deck not found" }, 404);
      }
      const id = uid();
      db.query("INSERT INTO decks(id,name,parent_id,created_at) VALUES(?,?,?,?)").run(
        id,
        name.trim(),
        parent_id ?? null,
        nowSec()
      );
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
        const { name, parent_id } = await body<{ name?: string; parent_id?: string | null }>(req);
        if (name !== undefined) {
          if (!name.trim()) return json({ error: "Name required" }, 400);
          db.query("UPDATE decks SET name=? WHERE id=?").run(name.trim(), id);
        }
        if (parent_id !== undefined) {
          if (parent_id === id) return json({ error: "A deck can't be its own parent" }, 400);
          if (parent_id) {
            const p = db.query("SELECT id FROM decks WHERE id=?").get(parent_id) as any;
            if (!p) return json({ error: "Parent deck not found" }, 404);
            if (descendants(id).includes(parent_id))
              return json({ error: "Can't move a deck inside its own child" }, 400);
          }
          db.query("UPDATE decks SET parent_id=? WHERE id=?").run(parent_id, id);
        }
        return json({ ok: true });
      }
      if (!cardsSuffix && req.method === "DELETE") {
        const kids = db.query("SELECT COUNT(*) c FROM decks WHERE parent_id=?").get(id) as any;
        if (kids.c > 0)
          return json({ error: "Move or delete the lists inside first" }, 400);
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
      // deckIds: explicit multi-select (individual lists and/or categories —
      // categories expand to all descendant lists server-side).
      const deckIds = (url.searchParams.get("deckIds") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 50));
      const now = nowSec();
      let scope = "";
      let params: any[] = [now, limit];
      const wanted = [...deckIds, ...(deckId ? [deckId] : [])];
      if (wanted.length > 0) {
        const expanded = new Set<string>();
        for (const id of wanted) {
          expanded.add(id);
          for (const d of descendants(id)) expanded.add(d);
        }
        const list = [...expanded];
        scope = `AND c.deck_id IN (${list.map(() => "?").join(",")})`;
        params = [...list, now, limit];
      }
      // new cards first, then most overdue
      const rows = db
        .query(
          `SELECT c.*, d.name deck_name FROM cards c JOIN decks d ON d.id=c.deck_id
           WHERE c.due<=? ${scope} ORDER BY c.reps ASC, c.due ASC LIMIT ?`
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
        "INSERT INTO reviews(id,card_id,side,grade,prev_interval,prev_ease,prev_reps,prev_lapses,next_interval,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
      ).run(uid(), cardId, side ?? "forward", grade, card.interval_days, card.ease, card.reps, card.lapses, r.nextIntervalDays, nowSec());
      return json({ ok: true, due, nextIntervalDays: r.nextIntervalDays });
    }

    if (pathname === "/api/study/regrade" && req.method === "POST") {
      // Correct the latest grade for a card side: recompute SM-2 from the
      // pre-grade snapshot (no compounding) and fix the review row in place.
      const { cardId, side, grade } = await body<{
        cardId: string; side: string; grade: Grade;
      }>(req);
      if (![1, 3, 4, 5].includes(grade)) return json({ error: "Bad grade" }, 400);
      const last = db
        .query(
          "SELECT * FROM reviews WHERE card_id=? AND side=? ORDER BY created_at DESC, rowid DESC LIMIT 1"
        )
        .get(cardId, side ?? "forward") as any;
      if (!last) return json({ error: "No review to correct" }, 404);
      const base = {
        ease: last.prev_ease ?? 2.5,
        interval_days: last.prev_interval ?? 0,
        reps: last.prev_reps ?? 0,
        lapses: last.prev_lapses ?? 0,
      };
      const r = gradeCard(base, grade);
      const due = nowSec() + r.dueInSec;
      db.query(
        "UPDATE cards SET ease=?, interval_days=?, reps=?, lapses=?, due=? WHERE id=?"
      ).run(r.ease, r.interval_days, r.reps, r.lapses, due, cardId);
      db.query("UPDATE reviews SET grade=?, next_interval=? WHERE id=?").run(
        grade,
        r.nextIntervalDays,
        last.id
      );
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
