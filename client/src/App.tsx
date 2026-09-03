import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Card, type Deck, type StudyItem } from "./lib/api";

type View =
  | { name: "home" }
  | { name: "deck"; id: string }
  | { name: "study"; deckIds?: string[]; title?: string };

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

const GRADE_NAMES: Record<number, string> = { 1: "Again", 3: "Hard", 4: "Good", 5: "Easy" };

// client-side mirror of server SM-2 previews
function previews(c: StudyItem) {  const { ease, interval_days, reps } = c;
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
            onStudy={(deckIds, title) => setView({ name: "study", deckIds, title })}
            onChanged={refresh}
            onError={setToast}
          />
        ) : view.name === "deck" ? (
          <DeckDetail
            id={view.id}
            decks={decks}
            onBack={() => { setView({ name: "home" }); refresh(); }}
            onStudy={(deckIds, title) => setView({ name: "study", deckIds, title })}
            onChanged={refresh}
            onError={setToast}
          />
        ) : (
          <Study
            deckIds={view.deckIds}
            title={view.title}
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
        danki · spaced repetition, minus the clutter · study: <Kbd>Space</Kbd> flip · <Kbd>1–4</Kbd> grade · <Kbd>E</Kbd> instant Easy · <Kbd>←</Kbd><Kbd>→</Kbd> revisit & correct · add cards: <Kbd>Enter</Kbd> save
      </footer>
    </div>
  );
}

function DuePills({ d }: { d: Deck }) {
  return (
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
  );
}

function Home({ decks, overview, onOpen, onStudy, onChanged, onError }: {
  decks: Deck[]; overview: { total: number; due: number; streak: number };
  onOpen: (id: string) => void; onStudy: (ids: string[], title: string) => void;
  onChanged: () => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"list" | "category">("list");
  const [parent, setParent] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const byId = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const childrenOf = useCallback((pid: string | null) => decks.filter((d) => d.parent_id === pid), [decks]);
  const categories = useMemo(() => decks.filter((d) => d.children > 0), [decks]);
  const topLeaves = useMemo(() => decks.filter((d) => !d.parent_id && d.children === 0), [decks]);

  // drop selection for decks that no longer exist
  useEffect(() => {
    setSelected((s) => s.filter((id) => byId.has(id)));
  }, [byId]);

  const selDue = selected.reduce((n, id) => n + (byId.get(id)?.due ?? 0), 0);
  const toggleList = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleCat = (catId: string) => {
    const leaves = childrenOf(catId).map((l) => l.id);
    setSelected((s) =>
      leaves.every((id) => s.includes(id))
        ? s.filter((id) => !leaves.includes(id))
        : [...new Set([...s, ...leaves])]
    );
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await api.createDeck(name.trim(), kind === "list" ? parent || null : null);
      setName(""); setParent("");
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
            onClick={() => onStudy([], "All decks")}
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

      <form onSubmit={create} className="mt-6">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "category" ? "New category — e.g. Français" : "New list — e.g. Verbes"}
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
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
          <div className="flex rounded-xl border border-stone-200 dark:border-white/10 overflow-hidden" role="tablist" aria-label="Kind">
            {(["list", "category"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 font-semibold capitalize ${kind === k ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500"}`}
              >
                {k === "list" ? "📝 List" : "🗂️ Category"}
              </button>
            ))}
          </div>
          {kind === "list" && categories.length > 0 && (
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              aria-label="Parent category"
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 text-stone-600 dark:text-stone-300 outline-none"
            >
              <option value="">Top level</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>in {c.name}</option>
              ))}
            </select>
          )}
        </div>
      </form>

      {/* categories with their lists */}
      {categories.map((c) => {
        const leaves = childrenOf(c.id);
        const allSel = leaves.length > 0 && leaves.every((l) => selected.includes(l.id));
        const someSel = leaves.some((l) => selected.includes(l.id));
        const isOpen = closed[c.id] !== true;
        return (
          <div key={c.id} className="card-paper rounded-2xl mt-4 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <input
                type="checkbox"
                checked={allSel}
                ref={(el) => { if (el) el.indeterminate = someSel && !allSel; }}
                onChange={() => toggleCat(c.id)}
                aria-label={`Select all lists in ${c.name}`}
                className="w-4 h-4 accent-stone-900 shrink-0"
              />
              <button
                onClick={() => setClosed((m) => ({ ...m, [c.id]: isOpen ? true : false }))}
                className="flex-1 flex items-center gap-2 text-left min-w-0"
                aria-expanded={isOpen}
              >
                <span className="text-stone-400 text-sm w-4">{isOpen ? "▾" : "▸"}</span>
                <span className="font-extrabold text-lg tracking-tight truncate">🗂️ {c.name}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.due > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"}`}>
                  {c.due} due
                </span>
                <span className="text-xs text-stone-400 font-medium hidden sm:inline">{c.total} cards · {leaves.length} lists</span>
              </button>
              <button
                onClick={() => onStudy(leaves.map((l) => l.id), c.name)}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-stone-900 text-white dark:bg-white dark:text-stone-900"
              >
                Study →
              </button>
            </div>
            {isOpen && (
              <div className="border-t border-stone-200/70 dark:border-white/10 divide-y divide-stone-100 dark:divide-white/5">
                {leaves.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-white/5 group">
                    <input
                      type="checkbox"
                      checked={selected.includes(l.id)}
                      onChange={() => toggleList(l.id)}
                      aria-label={`Select ${l.name}`}
                      className="w-4 h-4 accent-stone-900 shrink-0"
                    />
                    <button onClick={() => onOpen(l.id)} className="flex-1 text-left min-w-0">
                      <span className="font-semibold truncate block">{l.name}</span>
                      <span className="text-xs text-stone-400">{l.due} due · {l.total} cards{l.isNew > 0 ? ` · ${l.isNew} new` : ""}</span>
                    </button>
                    {l.due > 0 && (
                      <button
                        onClick={() => onStudy([l.id], l.name)}
                        className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border border-stone-200 dark:border-white/15 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      >
                        Study →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* top-level standalone lists */}
      {topLeaves.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {topLeaves.map((d) => (
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
                    onClick={(e) => { e.stopPropagation(); onStudy([d.id], d.name); }}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-stone-900 text-white dark:bg-white dark:text-stone-900 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    aria-label={`Study ${d.name} now`}
                  >
                    Study →
                  </button>
                )}
              </div>
              <DuePills d={d} />
            </div>
          ))}
        </div>
      )}
      {decks.length === 0 && (
        <div className="text-center mt-8 card-paper rounded-2xl p-6">
          <div className="text-3xl">🗂️</div>
          <p className="font-semibold mt-2">No decks yet</p>
          <p className="text-stone-500 text-sm mt-1">Create one above, open it, then smash out your first 5 cards with <Kbd>Enter</Kbd> to save each one.</p>
        </div>
      )}

      {/* floating study-selected bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-2xl text-sm font-semibold animate-toast">
          <span>{selected.length} list{selected.length === 1 ? "" : "s"} · {selDue} due</span>
          <button
            onClick={() => onStudy(selected, selected.length === 1 ? (byId.get(selected[0])?.name ?? "Selected") : `${selected.length} lists`)}
            className="px-4 py-1.5 rounded-xl bg-white text-stone-900 dark:bg-stone-900 dark:text-white font-bold"
          >
            Study →
          </button>
          <button onClick={() => setSelected([])} className="opacity-70 hover:opacity-100 px-1" aria-label="Clear selection">✕</button>
        </div>
      )}
    </div>
  );
}

function DeckDetail({ id, decks, onBack, onStudy, onChanged, onError }: {
  id: string; decks: Deck[]; onBack: () => void;
  onStudy: (ids: string[], title: string) => void; onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [deckName, setDeckName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
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
      setParentId(deckRes.parent_id ?? null);
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

  const parentName = decks.find((d) => d.id === parentId)?.name;
  const categoryOpts = decks.filter((d) => d.children > 0 && d.id !== id);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">
        ← All decks{parentName ? ` / ${parentName}` : ""}
      </button>
      <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">{deckName}</h2>
          <p className="text-sm text-stone-500">{cards.length} cards • {due} due</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={parentId ?? ""}
            onChange={async (e) => {
              try {
                await api.moveDeck(id, e.target.value || null);
                load(); onChanged();
              } catch (err: any) {
                onError(err.message);
              }
            }}
            aria-label="Move to category"
            title="Move to category"
            className="px-3 py-2.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 text-sm outline-none max-w-[160px]"
          >
            <option value="">📁 Top level</option>
            {categoryOpts.map((c) => (
              <option key={c.id} value={c.id}>📁 {c.name}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!confirm(`Delete deck "${deckName}" and all its cards?`)) return;
              try {
                await api.deleteDeck(id);
                onBack();
              } catch (err: any) {
                onError(err.message);
              }
            }}
            className="px-4 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            Delete
          </button>
          <button
            onClick={() => onStudy([id], deckName)}
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

function Study({ deckIds, title, onDone, onError }: {
  deckIds?: string[]; title?: string; onDone: () => void; onError: (m: string) => void;
}) {
  const [allDue, setAllDue] = useState<StudyItem[] | null>(null);
  const [queue, setQueue] = useState<StudyItem[]>([]);
  const [started, setStarted] = useState(false);
  const [direction, setDirection] = useState<"forward" | "reverse" | "mixed">("forward");
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    api.queue(undefined, 1000, deckIds?.length ? deckIds : undefined, direction).then((q) => {
      setAllDue(q); setLoaded(true);
    }).catch((e) => { onError(e.message); setLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckIds?.join(","), direction]);

  const start = (n: number) => {
    if (!allDue) return;
    setQueue(allDue.slice(0, n));
    setIdx(0); setDone(0); setShow(false);
    setStarted(true);
  };
  const remaining = allDue ? allDue.length - queue.length : 0;
  const more = () => {
    if (!allDue) return;
    const batch = allDue.slice(queue.length, queue.length + Math.max(queue.length, 25));
    setQueue((q) => [...q, ...batch]);
  };

  const cur = queue[idx];
  const [history, setHistory] = useState<{ item: StudyItem; grade: number }[]>([]);
  const [viewing, setViewing] = useState<number | null>(null); // history index under correction, null = live card
  const shown = viewing != null ? history[viewing].item : cur;
  const pv = useMemo(() => (shown ? previews(shown) : null), [shown]);
  const busyRef = useRef(false);
  // swipe-to-grade (mobile): drag state + touch origin + tap-vs-swipe guard
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const buzz = (ms = 12) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };

  const grade = async (g: number) => {
    if (!cur || busyRef.current) return;
    busyRef.current = true;
    try {
      await api.review(cur.id, cur.side, g);
      setHistory((h) => [...h, { item: cur, grade: g }]);
      buzz();
    } catch (e: any) {
      onError(e.message);
    }
    setDone((d) => d + 1);
    setShow(false);
    // tiny delay for flip reset, then allow next grade
    setTimeout(() => {
      setIdx((i) => i + 1);
      busyRef.current = false;
    }, 120);
  };

  const goBack = () => {
    if (history.length === 0) return;
    setViewing((v) => (v == null ? history.length - 1 : Math.max(0, v - 1)));
    setShow(true);
  };
  const goForward = () => {
    if (viewing == null) return;
    if (viewing >= history.length - 1) {
      setViewing(null);
      setShow(false);
    } else setViewing(viewing + 1);
  };
  const correct = async (g: number) => {
    if (viewing == null || busyRef.current) return;
    const h = history[viewing];
    busyRef.current = true;
    try {
      await api.regrade(h.item.id, h.item.side, g);
      setHistory((prev) => prev.map((x, i) => (i === viewing ? { ...x, grade: g } : x)));
      onError(`Corrected to ${GRADE_NAMES[g]} ✓`);
      buzz();
    } catch (e: any) {
      onError(e.message);
    } finally {
      busyRef.current = false;
    }
    setViewing(null);
    setShow(false);
  };

  // Swipe mapping: hidden card → swipe right = instant Easy;
  // revealed (or correction) → ← Again, → Good, ↑ Easy, ↓ Hard.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchOrigin.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchOrigin.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchOrigin.current.x;
    const dy = t.clientY - touchOrigin.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) swipedRef.current = true;
    setDrag({ dx, dy });
  };
  const onTouchEnd = () => {
    const o = touchOrigin.current;
    const d = drag;
    touchOrigin.current = null;
    setDrag(null);
    if (!o || !d) return;
    const TH = 90;
    if (Math.max(Math.abs(d.dx), Math.abs(d.dy)) < TH) return;
    const pick = viewing != null ? correct : grade;
    if (viewing == null && !show) {
      if (d.dx > 0 && Math.abs(d.dx) >= Math.abs(d.dy)) grade(5);
      return;
    }
    if (Math.abs(d.dx) >= Math.abs(d.dy)) pick(d.dx > 0 ? 4 : 1);
    else pick(d.dy < 0 ? 5 : 3);
  };
  // Active swipe zone (color-coded like the grade buttons).
  const hiddenMode = viewing == null && !show;
  const dragOn = !!drag && Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) > 12;
  const activeZone =
    dragOn && drag
      ? hiddenMode
        ? drag.dx > 0 && Math.abs(drag.dx) >= Math.abs(drag.dy)
          ? "easy"
          : null
        : Math.abs(drag.dx) >= Math.abs(drag.dy)
          ? drag.dx > 0
            ? "good"
            : "again"
          : drag.dy < 0
            ? "easy"
            : "hard"
      : null;

  // keyboard: space flip, 1-4 grade, E = instant Easy,
  // ArrowLeft/Right = step through graded cards to correct them
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!cur && viewing == null) return;
      if (e.code === "Space") { e.preventDefault(); setShow((s) => !s); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); goForward(); return; }
      if (e.key === "e" || e.key === "E") {
        if (viewing != null) correct(5);
        else if (!show) grade(5);
        return;
      }
      const pick = viewing != null ? correct : grade;
      if (show || viewing != null) {
        if (e.key === "1") pick(1);
        if (e.key === "2") pick(3);
        if (e.key === "3") pick(4);
        if (e.key === "4") pick(5);
      }
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
  if (!started)
    return (
      <div className="card-paper rounded-3xl p-8 text-center animate-fade-up">
        <button onClick={onDone} className="block text-sm text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">← Back</button>
        <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold mt-2">
          {(allDue?.length ?? 0) === 0 ? "Nothing due" : `${allDue!.length} due`}
        </p>
        <h2 className="text-2xl font-extrabold mt-2 tracking-tight">
          {(allDue?.length ?? 0) === 0 ? "All caught up 🎉" : "How many today?"}
        </h2>
        {title && (allDue?.length ?? 0) > 0 && (
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mt-1">{title}</p>
        )}
        {(allDue?.length ?? 0) > 0 && (
          <>
            <p className="text-stone-500 text-sm mt-1">Pick a direction and a session size — you can always continue after.</p>
            <div className="flex justify-center gap-1.5 mt-4 p-1 rounded-2xl bg-stone-100 dark:bg-white/10 w-fit mx-auto" role="tablist" aria-label="Direction">
              {(
                [
                  ["forward", "→ Forward", "Front → back"],
                  ["mixed", "⇄ Mixed", "Random side per card"],
                  ["reverse", "← Reverse", "Back → front"],
                ] as const
              ).map(([d, label, hint]) => (
                <button
                  key={d}
                  role="tab"
                  aria-selected={direction === d}
                  title={hint}
                  onClick={() => setDirection(d)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    direction === d
                      ? "bg-white dark:bg-stone-900 shadow text-stone-900 dark:text-white"
                      : "text-stone-500 hover:text-stone-900 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">
              {direction === "forward" && "Classic: question → answer."}
              {direction === "mixed" && "Each card randomly flips — recall both ways."}
              {direction === "reverse" && "Hard mode: answer → question. Production, not recognition."}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {[10, 25, 50, 100, 200]
                .filter((n) => n < allDue!.length)
                .map((n) => (
                  <button
                    key={n}
                    onClick={() => start(n)}
                    className="px-5 py-2.5 rounded-2xl border border-stone-200 dark:border-white/15 font-bold hover:bg-stone-900 hover:text-white dark:hover:bg-white dark:hover:text-stone-900 transition-colors"
                  >
                    {n}
                  </button>
                ))}
              <button
                onClick={() => start(allDue!.length)}
                className="px-5 py-2.5 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-bold hover:opacity-90"
              >
                All {allDue!.length} →
              </button>
            </div>
          </>
        )}
      </div>
    );
  if (!cur) {
    const nextBatch = Math.min(remaining, Math.max(queue.length, 25));
    return (
      <div className="card-paper rounded-3xl p-10 text-center animate-fade-up">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-extrabold mt-3 tracking-tight">Session complete</h2>
        <p className="text-stone-500 text-sm mt-1">You reviewed {done} card{done === 1 ? "" : "s"}. Nice work — consistency is the whole game.</p>
        <div className="mt-4 inline-flex items-center gap-3 text-xs font-semibold text-stone-500">
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">+{done} reviews</span>
          <span className="px-2.5 py-1 rounded-full bg-stone-100 dark:bg-white/10">🔥 streak updated</span>
        </div>
        <div className="mt-5 flex justify-center gap-2 flex-wrap">
          {remaining > 0 && (
            <button onClick={more} className="px-6 py-3 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-semibold hover:opacity-90">
              Continue +{nextBatch} ({remaining} left) →
            </button>
          )}
          <button onClick={onDone} className="px-6 py-3 rounded-2xl border border-stone-200 dark:border-white/15 font-semibold hover:bg-stone-50 dark:hover:bg-white/5">
            Back to decks
          </button>
        </div>
      </div>
    );
  }

  const pct = Math.round((done / Math.max(1, queue.length)) * 100);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <button onClick={onDone} className="hover:text-stone-900 dark:hover:text-white px-2 py-1 rounded-lg" aria-label="End session">✕ End</button>
        <span className="flex items-center gap-2">
          <span className="font-semibold">
            {viewing != null ? `Reviewing ${viewing + 1}/${history.length}` : `${done + 1} / ${queue.length}`}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-white/10 text-xs font-semibold">{title ?? shown.deck_name}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${shown.side === "reverse" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "bg-stone-100 text-stone-500 dark:bg-white/10"}`}>
            {shown.side === "reverse" ? "⇄ Reverse" : "→ Forward"}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-200 dark:bg-white/10 mt-2 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full bg-stone-900 dark:bg-white rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
        <button
          onClick={goBack}
          disabled={history.length === 0 || viewing === 0}
          className="px-3 py-1.5 rounded-lg font-semibold hover:bg-stone-100 dark:hover:bg-white/10 disabled:opacity-30"
          title="Go back to a graded card to correct it"
        >
          ← Prev
        </button>
        <span className="font-medium">
          {viewing != null ? (
            <>You said <b>{GRADE_NAMES[history[viewing].grade]}</b> — pick to correct</>
          ) : (
            <>← → to revisit graded cards</>
          )}
        </span>
        <button
          onClick={goForward}
          disabled={viewing == null}
          className="px-3 py-1.5 rounded-lg font-semibold hover:bg-stone-100 dark:hover:bg-white/10 disabled:opacity-30"
          title="Forward to the live card"
        >
          Next →
        </button>
      </div>

      <div
        className="[perspective:1200px] mt-4 relative select-none study-swipe"
        style={
          drag
            ? { transform: `translate(${drag.dx * 0.55}px, ${drag.dy * 0.35}px) rotate(${drag.dx * 0.04}deg)` }
            : { transition: "transform .2s ease" }
        }
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {dragOn && (
          <div className="absolute inset-0 z-10 pointer-events-none">
            {!(viewing == null && !show) && (
              <>
                <SwipeZone id="again" active={activeZone} label="← Again" sub={pv?.again} pos="left-2 top-1/2 -translate-y-1/2" cls="bg-red-500 text-white" />
                <SwipeZone id="good" active={activeZone} label="Good →" sub={pv?.good} pos="right-2 top-1/2 -translate-y-1/2" cls="bg-stone-900 text-white dark:bg-white dark:text-stone-900" />
                <SwipeZone id="hard" active={activeZone} label="↓ Hard" sub={pv?.hard} pos="bottom-2 left-1/2 -translate-x-1/2" cls="bg-stone-400 text-white dark:bg-stone-500 dark:text-white" />
              </>
            )}
            <SwipeZone
              id="easy"
              active={activeZone}
              label={viewing == null && !show ? "Easy →" : "↑ Easy"}
              sub={pv?.easy}
              pos={viewing == null && !show ? "right-2 top-1/2 -translate-y-1/2" : "top-2 left-1/2 -translate-x-1/2"}
              cls="bg-emerald-500 text-white"
            />
          </div>
        )}
        <button
          onClick={() => {
            if (swipedRef.current) {
              swipedRef.current = false;
              return;
            }
            setShow((s) => !s);
          }}
          className={`flip-inner relative w-full min-h-[320px] rounded-3xl ${show ? "flipped" : ""}`}
          aria-label={show ? "Hide answer" : "Show answer"}
        >
          <div className="flip-face card-paper absolute inset-0 rounded-3xl p-8 grid place-items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Question</p>
              <p className="text-4xl font-extrabold tracking-tight mt-3 whitespace-pre-wrap">{shown.q}</p>
              <p className="text-sm text-stone-400 mt-4">Tap or press Space to reveal</p>
            </div>
          </div>
          <div className="flip-face flip-back card-paper absolute inset-0 rounded-3xl p-8 grid place-items-center border-t-4 !border-t-emerald-400">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Answer</p>
              <p className="text-3xl font-bold mt-3 whitespace-pre-wrap">{shown.a}</p>
            </div>
          </div>
        </button>
      </div>

      {!show && viewing == null ? (
        <div>
          <button
            onClick={() => setShow(true)}
            className="w-full mt-4 py-4 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-semibold text-lg"
          >
            Show answer <span className="opacity-50 text-sm font-normal">(Space)</span>
          </button>
          <button
            onClick={() => grade(5)}
            className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
            title="You know it cold — mark Easy without revealing"
          >
            Know it cold? Easy → <Kbd>E</Kbd>
          </button>
        </div>
      ) : (
        <div>
          {viewing != null && (
            <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-300 mt-4 mb-2">
              Correction mode — this overwrites your {GRADE_NAMES[history[viewing].grade]} grade
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pb-[env(safe-area-inset-bottom)]">
            <GradeBtn label="Again" sub={pv!.again} kbd="1" cls="btn-grade-again" onClick={() => (viewing != null ? correct(1) : grade(1))} />
            <GradeBtn label="Hard" sub={pv!.hard} kbd="2" cls="btn-grade-hard" onClick={() => (viewing != null ? correct(3) : grade(3))} />
            <GradeBtn label="Good" sub={pv!.good} kbd="3" cls="btn-grade-good" onClick={() => (viewing != null ? correct(4) : grade(4))} />
            <GradeBtn label="Easy" sub={pv!.easy} kbd="4" cls="btn-grade-easy" onClick={() => (viewing != null ? correct(5) : grade(5))} />
          </div>
          <p className="md:hidden text-center text-xs text-stone-400 mt-3">
            tap = flip · swipe ← Again · → Good · ↑ Easy · ↓ Hard
          </p>
        </div>
      )}
      {!show && viewing == null && (
        <p className="md:hidden text-center text-xs text-stone-400 mt-3">
          tap = flip · swipe → = Easy
        </p>
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

function SwipeZone({ id, active, label, sub, pos, cls }: {
  id: string; active: string | null; label: string; sub?: string;
  pos: string; cls: string;
}) {
  const on = active === id;
  return (
    <span
      className={`absolute ${pos} px-3 py-1.5 rounded-2xl font-extrabold text-sm shadow-lg transition-all ${cls} ${
        on ? "opacity-100 scale-110" : "opacity-35 scale-95"
      }`}
    >
      {label}
      {sub && <span className="font-normal opacity-80"> · {sub}</span>}
    </span>
  );
}

function GradeBtn({ label, sub, kbd, cls, onClick }: {
  label: string; sub: string; kbd: string; cls: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`${cls} rounded-2xl py-4 sm:py-3 font-semibold transition-transform active:scale-95 text-lg sm:text-base`}>
      <div>{label}</div>
      <div className="text-xs opacity-70 font-normal">{sub} • {kbd}</div>
    </button>
  );
}
