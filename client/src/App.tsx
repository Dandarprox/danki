import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Card, type Deck, type StudyItem } from "./lib/api";

type View = { name: "home" } | { name: "deck"; id: string } | { name: "study"; deckId?: string };

function useTheme() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("danki-theme", next ? "dark" : "light");
    } catch {}
  };
  return { dark, toggle };
}

// client-side mirror of server SM-2 previews
function previews(c: StudyItem) {
  const { ease, interval_days, reps } = c;
  const good =
    reps === 0 ? 1 : reps === 1 ? 6 : Math.max(1, Math.round(interval_days * ease));
  const hard = reps === 0 ? 1 : Math.max(1, Math.floor(interval_days * 1.2));
  const easy = reps === 0 ? 4 : Math.round(Math.max(4, interval_days * ease * 1.3));
  const fmt = (d: number) =>
    d <= 0 ? "10m" : d < 30 ? `${d}d` : `${Math.round((d / 30) * 10) / 10}mo`;
  return { again: "10m", hard: fmt(hard), good: fmt(good), easy: fmt(easy) };
}

export default function App() {
  const { dark, toggle } = useTheme();
  const [view, setView] = useState<View>({ name: "home" });
  const [decks, setDecks] = useState<Deck[]>([]);
  const [overview, setOverview] = useState({ total: 0, decks: 0, due: 0, streak: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([api.decks(), api.overview()]);
      setDecks(d);
      setOverview(o);
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 backdrop-blur bg-[#FAF7F2]/80 dark:bg-[#0C0A09]/80 border-b border-stone-200/70 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <button
            onClick={() => { setView({ name: "home" }); refresh(); }}
            className="flex items-center gap-2 font-extrabold tracking-tight text-lg"
            aria-label="Go home"
          >
            <span className="w-7 h-7 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 grid place-items-center text-sm">団</span>
            danki
          </button>
          <div className="flex items-center gap-2 text-sm">
            {overview.due > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-semibold" title={`${overview.due} cards due`}>
                {overview.due} due
              </span>
            )}
            {overview.streak > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 font-semibold" title={`${overview.streak} day streak`}>
                🔥 {overview.streak}
              </span>
            )}
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-full border border-stone-200 dark:border-white/15 grid place-items-center hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 pb-20">
        {loading ? (
          <div className="space-y-3" aria-label="Loading">
            <div className="card-paper rounded-3xl p-7">
              <div className="skeleton h-4 w-24 rounded-full mx-auto" />
              <div className="skeleton h-8 w-56 rounded-xl mx-auto mt-3" />
              <div className="skeleton h-11 w-44 rounded-2xl mx-auto mt-5" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="card-paper rounded-2xl p-5"><div className="skeleton h-5 w-2/3 rounded-lg" /><div className="skeleton h-4 w-1/3 rounded-full mt-3" /></div>
              <div className="card-paper rounded-2xl p-5"><div className="skeleton h-5 w-1/2 rounded-lg" /><div className="skeleton h-4 w-1/4 rounded-full mt-3" /></div>
            </div>
          </div>
        ) : view.name === "home" ? (
          <Home
            decks={decks}
            overview={overview}
            onOpen={(id) => setView({ name: "deck", id })}
            onStudy={(deckId) => setView({ name: "study", deckId })}
            onChanged={refresh}
            onError={setToast}
          />
        ) : view.name === "deck" ? (
          <DeckDetail
            id={view.id}
            onBack={() => { setView({ name: "home" }); refresh(); }}
            onStudy={() => setView({ name: "study", deckId: view.id })}
            onError={setToast}
          />
        ) : (
          <Study
            deckId={view.deckId}
            onDone={() => { setView({ name: "home" }); refresh(); }}
            onError={setToast}
          />
        )}
      </main>

      {toast && (
        <div role="alert" className="animate-toast fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-sm shadow-xl">
          {toast}
        </div>
      )}

      <footer className="max-w-3xl mx-auto px-5 pb-8 text-center text-xs text-stone-400 dark:text-stone-500">
        danki · spaced repetition, minus the clutter · study: <Kbd>Space</Kbd> flip · <Kbd>1–4</Kbd> grade · add cards: <Kbd>Enter</Kbd> save
      </footer>
    </div>
  );
}

function Home({ decks, overview, onOpen, onStudy, onChanged, onError }: {
  decks: Deck[]; overview: { total: number; due: number; streak: number };
  onOpen: (id: string) => void; onStudy: (deckId?: string) => void;
  onChanged: () => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await api.createDeck(name.trim());
      setName("");
      onChanged();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className={`card-paper rounded-3xl p-7 text-center ${overview.due > 0 ? "ring-1 ring-amber-200 dark:ring-amber-500/20" : ""}`}>
        <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">
          {overview.total === 0
            ? "Welcome to danki"
            : overview.due === 0
              ? "All caught up ✓"
              : `${overview.due} due · ${overview.total} total`}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight mt-2">
          {overview.total === 0
            ? "Learn anything, forever."
            : overview.due === 0
              ? "Take a breath. 🌱"
              : "Ready when you are."}
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-1 text-sm">
          Small sessions beat cramming. Flip, grade honestly, move on.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => onStudy(undefined)}
            disabled={overview.total === 0}
            className="px-6 py-3 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {overview.total === 0 ? "Add cards to start" : `Study all decks${overview.due > 0 ? ` (${overview.due})` : ""} →`}
          </button>
        </div>
        {overview.total > 0 && (
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-stone-400 font-medium">
            <span>{decks.length} deck{decks.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{overview.total} cards</span>
            {overview.streak > 0 && (<><span>·</span><span>🔥 {overview.streak}-day streak</span></>)}
          </div>
        )}
      </div>

      <form onSubmit={create} className="mt-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New deck — e.g. Japanese N5"
          aria-label="New deck name"
          maxLength={80}
          className="flex-1 px-4 py-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 outline-none focus:ring-2 ring-stone-900/10 placeholder:text-stone-400"
        />
        <button
          type="submit"
          disabled={adding || !name.trim()}
          className="px-5 py-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 font-semibold hover:bg-stone-50 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
        >
          {adding ? "…" : "Add"}
        </button>
      </form>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {decks.map((d) => (
          <div
            key={d.id}
            onClick={() => onOpen(d.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(d.id); }}
            role="button"
            tabIndex={0}
            className="deck-card card-paper rounded-2xl p-5 text-left cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold text-lg leading-tight truncate">{d.name}</div>
              {d.due > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStudy(d.id); }}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-stone-900 text-white dark:bg-white dark:text-stone-900 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                  aria-label={`Study ${d.name} now`}
                >
                  Study →
                </button>
              )}
            </div>
            <div className="mt-2 flex gap-2 text-xs font-semibold flex-wrap">
              <span className={`px-2 py-1 rounded-full ${d.due > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"}`}>
                {d.due} due
              </span>
              <span className="px-2 py-1 rounded-full bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
                {d.total} cards
              </span>
              {d.isNew > 0 && (
                <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  {d.isNew} new
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {decks.length === 0 && (
        <div className="text-center mt-8 card-paper rounded-2xl p-6">
          <div className="text-3xl">🗂️</div>
          <p className="font-semibold mt-2">No decks yet</p>
          <p className="text-stone-500 text-sm mt-1">Create one above, open it, then smash out your first 5 cards with <Kbd>Enter</Kbd> to save each one.</p>
        </div>
      )}
    </div>
  );
}

function DeckDetail({ id, onBack, onStudy, onError }: {
  id: string; onBack: () => void; onStudy: () => void; onError: (m: string) => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [deckName, setDeckName] = useState("");
  const [due, setDue] = useState(0);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [reversed, setReversed] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
  }, [cards, query]);

  // autofocus front on open for rapid entry
  useEffect(() => {
    frontRef.current?.focus();
  }, []);

  // `n` jumps to the add form, `/` to search, when not typing
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if ((e.key === "n" || e.key === "N") && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        frontRef.current?.focus();
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const load = useCallback(async () => {
    try {
      const [deckRes, cardRes] = await Promise.all([
        fetch(`/api/decks/${id}`).then((r) => r.json()),
        api.deckCards(id),
      ]);
      setDeckName(deckRes.name);
      setDue(deckRes.due);
      setCards(cardRes);
    } catch (e: any) {
      onError(e.message);
    }
  }, [id, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!front.trim() || !back.trim()) {
      // jump to whichever side is empty
      (!front.trim() ? frontRef : backRef).current?.focus();
      return;
    }
    try {
      if (editing) {
        await fetch(`/api/cards/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ front: front.trim(), back: back.trim(), is_reversed: reversed }),
        });
        setEditing(null);
      } else {
        await api.createCard(id, front.trim(), back.trim(), reversed);
        setAddedCount((c) => c + 1);
      }
      // keep `reversed` sticky for batches — only clear text, refocus front
      setFront(""); setBack("");
      load();
      requestAnimationFrame(() => frontRef.current?.focus());
    } catch (e: any) {
      onError(e.message);
    }
  };

  // Fast entry: Enter = save & next, Shift+Enter = newline, Cmd/Ctrl+Enter = save, Esc = cancel edit
  const fastKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (editing) {
        setEditing(null); setFront(""); setBack("");
        frontRef.current?.focus();
      } else (e.target as HTMLElement).blur();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">← All decks</button>
      <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">{deckName}</h2>
          <p className="text-sm text-stone-500">{cards.length} cards • {due} due</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!confirm(`Delete deck "${deckName}" and all its cards?`)) return;
              await api.deleteDeck(id);
              onBack();
            }}
            className="px-4 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            Delete
          </button>
          <button
            onClick={onStudy}
            className="px-5 py-2.5 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-semibold text-sm"
          >
            Study → {due > 0 ? `(${due})` : ""}
          </button>
        </div>
      </div>

      <form onSubmit={add} className="card-paper rounded-2xl p-4 mt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
            {editing ? "Edit card" : "New card"}
          </p>
          {addedCount > 0 && !editing && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
              +{addedCount} added ✓
            </span>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-2 mt-2">
          <textarea
            ref={frontRef}
            value={front} onChange={(e) => setFront(e.target.value)}
            onKeyDown={fastKeys}
            placeholder="Front — e.g. 猫"
            rows={2}
            className="px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 outline-none text-lg focus:ring-2 ring-stone-900/10"
          />
          <textarea
            ref={backRef}
            value={back} onChange={(e) => setBack(e.target.value)}
            onKeyDown={fastKeys}
            placeholder="Back — e.g. cat"
            rows={2}
            className="px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 outline-none text-lg focus:ring-2 ring-stone-900/10"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-stone-500">
            <input type="checkbox" checked={reversed} onChange={(e) => setReversed(e.target.checked)} className="w-4 h-4 accent-stone-900" />
            Reversed ⇄
          </label>
          <span className="text-xs text-stone-400 hidden md:block">
            <Kbd>Enter</Kbd> save · <Kbd>⇧↵</Kbd> newline · <Kbd>N</Kbd> focus · <Kbd>Esc</Kbd> cancel
          </span>
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={() => { setEditing(null); setFront(""); setBack(""); frontRef.current?.focus(); }} className="px-4 py-2 rounded-xl text-sm hover:bg-stone-100 dark:hover:bg-white/10">
                Cancel <Kbd>esc</Kbd>
              </button>
            )}
            <button type="submit" className="px-5 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-sm font-semibold">
              {editing ? "Save ⏎" : "Add ⏎"}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-4 flex items-center gap-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${cards.length} cards…  ( / )`}
          aria-label="Search cards"
          className="flex-1 px-4 py-2.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 outline-none text-sm placeholder:text-stone-400 focus:ring-2 ring-stone-900/10"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-sm px-3 py-2 rounded-xl hover:bg-stone-100 dark:hover:bg-white/10" aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {filtered.map((c) => (
          <div key={c.id} className="card-paper rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-up">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Front</div>
              <div className="font-semibold truncate">{c.front}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-1.5">Back</div>
              <div className="text-sm text-stone-500 truncate">{c.back}</div>
            </div>
            {c.is_reversed ? <span title="Reversed — studied both ways" className="text-stone-400">⇄</span> : null}
            <span className={`text-xs font-semibold px-2 py-1 rounded-full hidden sm:block ${c.due * 1000 <= Date.now() ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300"}`}>
              {c.reps === 0 ? "new" : c.due * 1000 <= Date.now() ? "due" : `${c.interval_days}d`}
            </span>
            <button
              onClick={() => { setEditing(c); setFront(c.front); setBack(c.back); setReversed(!!c.is_reversed); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="text-sm px-3 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-white/10"
            >
              Edit
            </button>
            <button
              onClick={async () => { await api.deleteCard(c.id); load(); }}
              className="text-sm px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              ✕
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-stone-400 py-6">
            {query ? `No cards match “${query}”.` : "No cards yet — add your first one above with Enter."}
          </p>
        )}
      </div>
    </div>
  );
}

function Study({ deckId, onDone, onError }: {
  deckId?: string; onDone: () => void; onError: (m: string) => void;
}) {
  const [queue, setQueue] = useState<StudyItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.queue(deckId).then((q) => {
      setQueue(q); setLoaded(true);
    }).catch((e) => { onError(e.message); setLoaded(true); });
  }, [deckId, onError]);

  const cur = queue[idx];
  const pv = useMemo(() => (cur ? previews(cur) : null), [cur]);

  const grade = async (g: number) => {
    if (!cur) return;
    try {
      await api.review(cur.id, cur.side, g);
    } catch (e: any) {
      onError(e.message);
    }
    setDone((d) => d + 1);
    setShow(false);
    // tiny delay for flip reset
    setTimeout(() => setIdx((i) => i + 1), 120);
  };

  // keyboard: space flip, 1-4 grade
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!cur) return;
      if (e.code === "Space") { e.preventDefault(); setShow((s) => !s); }
      if (show && e.key === "1") grade(1);
      if (show && e.key === "2") grade(3);
      if (show && e.key === "3") grade(4);
      if (show && e.key === "4") grade(5);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!loaded) return (
    <div className="space-y-3" aria-label="Preparing session">
      <div className="skeleton h-2 rounded-full" />
      <div className="card-paper rounded-3xl min-h-[320px] grid place-items-center">
        <p className="text-stone-400 text-sm">Preparing session…</p>
      </div>
    </div>
  );
  if (!cur)
    return (
      <div className="card-paper rounded-3xl p-10 text-center animate-fade-up">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-extrabold mt-3 tracking-tight">Session complete</h2>
        <p className="text-stone-500 text-sm mt-1">You reviewed {done} card{done === 1 ? "" : "s"}. Nice work — consistency is the whole game.</p>
        <div className="mt-4 inline-flex items-center gap-3 text-xs font-semibold text-stone-500">
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">+{done} reviews</span>
          <span className="px-2.5 py-1 rounded-full bg-stone-100 dark:bg-white/10">🔥 streak updated</span>
        </div>
        <div>
          <button onClick={onDone} className="mt-5 px-6 py-3 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-semibold hover:opacity-90">
            Back to decks
          </button>
        </div>
      </div>
    );

  const pct = Math.round((done / Math.max(1, queue.length)) * 100);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <button onClick={onDone} className="hover:text-stone-900 dark:hover:text-white px-2 py-1 rounded-lg" aria-label="End session">✕ End</button>
        <span className="flex items-center gap-2">
          <span className="font-semibold">{done + 1} / {queue.length}</span>
          <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-white/10 text-xs font-semibold">{cur.deck_name}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cur.side === "reverse" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "bg-stone-100 text-stone-500 dark:bg-white/10"}`}>
            {cur.side === "reverse" ? "⇄ Reverse" : "→ Forward"}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-200 dark:bg-white/10 mt-2 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full bg-stone-900 dark:bg-white rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="[perspective:1200px] mt-6">
        <button
          onClick={() => setShow((s) => !s)}
          className={`flip-inner relative w-full min-h-[320px] rounded-3xl ${show ? "flipped" : ""}`}
        >
          <div className="flip-face card-paper absolute inset-0 rounded-3xl p-8 grid place-items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Question</p>
              <p className="text-4xl font-extrabold tracking-tight mt-3 whitespace-pre-wrap">{cur.q}</p>
              <p className="text-sm text-stone-400 mt-4">Tap or press Space to reveal</p>
            </div>
          </div>
          <div className="flip-face flip-back card-paper absolute inset-0 rounded-3xl p-8 grid place-items-center border-t-4 !border-t-emerald-400">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Answer</p>
              <p className="text-3xl font-bold mt-3 whitespace-pre-wrap">{cur.a}</p>
            </div>
          </div>
        </button>
      </div>

      {!show ? (
        <button
          onClick={() => setShow(true)}
          className="w-full mt-4 py-4 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-semibold text-lg"
        >
          Show answer <span className="opacity-50 text-sm font-normal">(Space)</span>
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2 mt-4">
          <GradeBtn label="Again" sub={pv!.again} kbd="1" cls="btn-grade-again" onClick={() => grade(1)} />
          <GradeBtn label="Hard" sub={pv!.hard} kbd="2" cls="btn-grade-hard" onClick={() => grade(3)} />
          <GradeBtn label="Good" sub={pv!.good} kbd="3" cls="btn-grade-good" onClick={() => grade(4)} />
          <GradeBtn label="Easy" sub={pv!.easy} kbd="4" cls="btn-grade-easy" onClick={() => grade(5)} />
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-white/10 border border-stone-200 dark:border-white/10 font-sans font-semibold">
      {children}
    </kbd>
  );
}

function GradeBtn({ label, sub, kbd, cls, onClick }: {
  label: string; sub: string; kbd: string; cls: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`${cls} rounded-2xl py-3 font-semibold transition-transform active:scale-95`}>
      <div>{label}</div>
      <div className="text-xs opacity-70 font-normal">{sub} • {kbd}</div>
    </button>
  );
}
