// Cloudflare Worker entry: same REST API as server/index.ts, backed by D1.
// Serves /api/* — static frontend comes from [assets] (client/dist).
import { gradeCard, type Grade } from "../server/srs";

interface D1Stmt {
  bind(...args: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1 {
  prepare(query: string): D1Stmt;
}
interface Env {
  DB: D1;
  API_TOKEN?: string;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const uid = () => crypto.randomUUID();
const startOfTodaySec = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

const json = (data: unknown, status = 200, extra?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-api-token",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      ...extra,
    },
  });

async function deckCounts(DB: D1, deckId: string) {
  const now = nowSec();
  const sub = `WITH RECURSIVE sub(id) AS (
     SELECT ? UNION SELECT d.id FROM decks d JOIN sub s ON d.parent_id = s.id
   )`;
  const total = await DB.prepare(
    `${sub} SELECT COUNT(*) c FROM cards WHERE deck_id IN sub`
  ).bind(deckId).first<{ c: number }>();
  const due = await DB.prepare(
    `${sub} SELECT COUNT(*) c FROM cards WHERE deck_id IN sub AND due<=?`
  ).bind(deckId, now).first<{ c: number }>();
  const fresh = await DB.prepare(
    `${sub} SELECT COUNT(*) c FROM cards WHERE deck_id IN sub AND reps=0`
  ).bind(deckId).first<{ c: number }>();
  const children = await DB.prepare("SELECT COUNT(*) c FROM decks WHERE parent_id=?")
    .bind(deckId).first<{ c: number }>();
  return {
    total: total?.c ?? 0,
    due: due?.c ?? 0,
    isNew: fresh?.c ?? 0,
    today: startOfTodaySec(),
    children: children?.c ?? 0,
  };
}

async function descendants(DB: D1, deckId: string): Promise<string[]> {
  const rows = await DB.prepare(
    `WITH RECURSIVE sub(id) AS (
       SELECT ? UNION SELECT d.id FROM decks d JOIN sub s ON d.parent_id = s.id
     ) SELECT id FROM sub WHERE id != ?`
  ).bind(deckId, deckId).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const DB = env.DB;

    // Browser extensions call cross-origin — answer preflights openly
    // (actual auth still enforced below via x-api-token).
    if (req.method === "OPTIONS") return json({ ok: true });

    // Optional shared-secret auth for public deployments.
    // Set API_TOKEN secret on the worker + VITE_API_TOKEN at build time.
    if (env.API_TOKEN && pathname.startsWith("/api/") && pathname !== "/api/health") {
      if (req.headers.get("x-api-token") !== env.API_TOKEN)
        return json({ error: "Unauthorized" }, 401);
    }

    if (pathname === "/api/health") return json({ ok: true });

    if (pathname === "/api/stats/overview") {
      const total = await DB.prepare("SELECT COUNT(*) c FROM cards").first<{ c: number }>();
      const decks = await DB.prepare("SELECT COUNT(*) c FROM decks").first<{ c: number }>();
      const due = await DB.prepare("SELECT COUNT(*) c FROM cards WHERE due<=?")
        .bind(nowSec()).first<{ c: number }>();
      const days = await DB.prepare(
        "SELECT DISTINCT CAST(created_at/86400 AS INT) d FROM reviews ORDER BY d DESC LIMIT 60"
      ).all<{ d: number }>();
      const todayDay = Math.floor(Date.now() / 86400000);
      let streak = 0;
      const set = new Set(days.results.map((r) => r.d));
      for (let d = todayDay; ; d--) {
        if (set.has(d)) streak++;
        else if (d === todayDay) continue;
        else break;
      }
      return json({ total: total?.c ?? 0, decks: decks?.c ?? 0, due: due?.c ?? 0, streak });
    }

    if (pathname === "/api/decks" && req.method === "GET") {
      const decks = await DB.prepare("SELECT * FROM decks ORDER BY created_at DESC").all();
      const out = [];
      for (const d of decks.results as { id: string }[])
        out.push({ ...d, ...(await deckCounts(DB, d.id)) });
      return json(out);
    }
    if (pathname === "/api/decks" && req.method === "POST") {
      const { name, parent_id } = (await req.json().catch(() => ({}))) as {
        name?: string; parent_id?: string | null;
      };
      if (!name?.trim()) return json({ error: "Name required" }, 400);
      if (parent_id) {
        const p = await DB.prepare("SELECT id FROM decks WHERE id=?").bind(parent_id).first();
        if (!p) return json({ error: "Parent deck not found" }, 404);
      }
      const id = uid();
      await DB.prepare("INSERT INTO decks(id,name,parent_id,created_at) VALUES(?,?,?,?)")
        .bind(id, name.trim(), parent_id ?? null, nowSec()).run();
      return json({ id, name: name.trim() }, 201);
    }

    const deckMatch = pathname.match(/^\/api\/decks\/([^/]+)(\/cards)?$/);
    if (deckMatch) {
      const [, id, cardsSuffix] = deckMatch;
      const deck = await DB.prepare("SELECT * FROM decks WHERE id=?").bind(id).first();
      if (!deck) return json({ error: "Deck not found" }, 404);

      if (!cardsSuffix && req.method === "GET")
        return json({ ...deck, ...(await deckCounts(DB, id)) });
      if (!cardsSuffix && req.method === "PATCH") {
        const { name, parent_id } = (await req.json().catch(() => ({}))) as {
          name?: string; parent_id?: string | null;
        };
        if (name !== undefined) {
          if (!name.trim()) return json({ error: "Name required" }, 400);
          await DB.prepare("UPDATE decks SET name=? WHERE id=?").bind(name.trim(), id).run();
        }
        if (parent_id !== undefined) {
          if (parent_id === id) return json({ error: "A deck can't be its own parent" }, 400);
          if (parent_id) {
            const p = await DB.prepare("SELECT id FROM decks WHERE id=?").bind(parent_id).first();
            if (!p) return json({ error: "Parent deck not found" }, 404);
            if ((await descendants(DB, id)).includes(parent_id))
              return json({ error: "Can't move a deck inside its own child" }, 400);
          }
          await DB.prepare("UPDATE decks SET parent_id=? WHERE id=?").bind(parent_id, id).run();
        }
        return json({ ok: true });
      }
      if (!cardsSuffix && req.method === "DELETE") {
        const kids = await DB.prepare("SELECT COUNT(*) c FROM decks WHERE parent_id=?")
          .bind(id).first<{ c: number }>();
        if ((kids?.c ?? 0) > 0)
          return json({ error: "Move or delete the lists inside first" }, 400);
        await DB.prepare("DELETE FROM decks WHERE id=?").bind(id).run();
        return json({ ok: true });
      }
      if (cardsSuffix === "/cards" && req.method === "GET") {
        const cards = await DB.prepare(
          "SELECT * FROM cards WHERE deck_id=? ORDER BY created_at DESC"
        ).bind(id).all();
        return json(cards.results);
      }
      if (cardsSuffix === "/cards" && req.method === "POST") {
        const { front, back, is_reversed } = (await req.json().catch(() => ({}))) as {
          front?: string; back?: string; is_reversed?: boolean;
        };
        if (!front?.trim() || !back?.trim())
          return json({ error: "Front and back required" }, 400);
        const cid = uid();
        const now = nowSec();
        await DB.prepare(
          "INSERT INTO cards(id,deck_id,front,back,is_reversed,ease,interval_days,reps,lapses,due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(cid, id, front.trim(), back.trim(), is_reversed ? 1 : 0, 2.5, 0, 0, 0, now, now).run();
        return json({ id: cid }, 201);
      }
    }

    const cardMatch = pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (cardMatch && (req.method === "PATCH" || req.method === "DELETE")) {
      const [, id] = cardMatch;
      if (req.method === "DELETE") {
        await DB.prepare("DELETE FROM cards WHERE id=?").bind(id).run();
        return json({ ok: true });
      }
      const { front, back, is_reversed } = (await req.json().catch(() => ({}))) as {
        front?: string; back?: string; is_reversed?: boolean;
      };
      await DB.prepare("UPDATE cards SET front=?, back=?, is_reversed=? WHERE id=?")
        .bind(front, back, is_reversed ? 1 : 0, id).run();
      return json({ ok: true });
    }

    if (pathname === "/api/study/queue" && req.method === "GET") {
      const deckId = url.searchParams.get("deckId");
      const deckIds = (url.searchParams.get("deckIds") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 50));
      const now = nowSec();
      const wanted = [...deckIds, ...(deckId ? [deckId] : [])];
      let scope = "";
      const scopeParams: unknown[] = [];
      if (wanted.length > 0) {
        const expanded = new Set<string>();
        for (const wid of wanted) {
          expanded.add(wid);
          for (const d of await descendants(DB, wid)) expanded.add(d);
        }
        const list = [...expanded];
        scope = `AND c.deck_id IN (${list.map(() => "?").join(",")})`;
        scopeParams.push(...list);
      }
      const rows = (
        await DB.prepare(
          `SELECT c.*, d.name deck_name FROM cards c JOIN decks d ON d.id=c.deck_id
           WHERE c.due<=? ${scope} ORDER BY c.reps ASC, c.due ASC LIMIT ?`
        ).bind(now, ...scopeParams, limit).all()
      ).results;
      const items: Record<string, unknown>[] = [];
      for (const c of rows as ({ is_reversed: number; front: string; back: string } & Record<string, unknown>)[]) {
        items.push({ ...c, side: "forward", q: c.front, a: c.back });
        if (c.is_reversed) items.push({ ...c, side: "reverse", q: c.back, a: c.front });
      }
      return json(items.slice(0, limit));
    }

    if (pathname === "/api/study/review" && req.method === "POST") {
      const { cardId, side, grade } = (await req.json().catch(() => ({}))) as {
        cardId?: string; side?: string; grade?: Grade;
      };
      if (![1, 3, 4, 5].includes(grade as number)) return json({ error: "Bad grade" }, 400);
      const card = await DB.prepare("SELECT * FROM cards WHERE id=?").bind(cardId).first<{
        ease: number; interval_days: number; reps: number; lapses: number;
      }>();
      if (!card) return json({ error: "Card not found" }, 404);
      const r = gradeCard(
        { ease: card.ease, interval_days: card.interval_days, reps: card.reps, lapses: card.lapses },
        grade as Grade
      );
      const due = nowSec() + r.dueInSec;
      await DB.prepare("UPDATE cards SET ease=?, interval_days=?, reps=?, lapses=?, due=? WHERE id=?")
        .bind(r.ease, r.interval_days, r.reps, r.lapses, due, cardId).run();
      await DB.prepare(
        "INSERT INTO reviews(id,card_id,side,grade,prev_interval,prev_ease,prev_reps,prev_lapses,next_interval,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
      ).bind(uid(), cardId, side ?? "forward", grade, card.interval_days, card.ease, card.reps, card.lapses, r.nextIntervalDays, nowSec()).run();
      return json({ ok: true, due, nextIntervalDays: r.nextIntervalDays });
    }

    if (pathname === "/api/study/regrade" && req.method === "POST") {
      const { cardId, side, grade } = (await req.json().catch(() => ({}))) as {
        cardId?: string; side?: string; grade?: Grade;
      };
      if (![1, 3, 4, 5].includes(grade as number)) return json({ error: "Bad grade" }, 400);
      const last = await DB.prepare(
        "SELECT * FROM reviews WHERE card_id=? AND side=? ORDER BY created_at DESC, rowid DESC LIMIT 1"
      ).bind(cardId, side ?? "forward").first<{
        id: string;
        prev_interval: number; prev_ease: number; prev_reps: number; prev_lapses: number;
      }>();
      if (!last) return json({ error: "No review to correct" }, 404);
      const r = gradeCard(
        {
          ease: last.prev_ease ?? 2.5,
          interval_days: last.prev_interval ?? 0,
          reps: last.prev_reps ?? 0,
          lapses: last.prev_lapses ?? 0,
        },
        grade as Grade
      );
      const due = nowSec() + r.dueInSec;
      await DB.prepare("UPDATE cards SET ease=?, interval_days=?, reps=?, lapses=?, due=? WHERE id=?")
        .bind(r.ease, r.interval_days, r.reps, r.lapses, due, cardId).run();
      await DB.prepare("UPDATE reviews SET grade=?, next_interval=? WHERE id=?")
        .bind(grade, r.nextIntervalDays, last.id).run();
      return json({ ok: true, due, nextIntervalDays: r.nextIntervalDays });
    }

    return json({ error: "Not found" }, 404);
  },
};
