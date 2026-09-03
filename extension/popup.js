const $ = (id) => document.getElementById(id);
const store = chrome.storage.session ?? chrome.storage.local;

const DEFAULTS = {
  apiBase: "https://danki.dlsusp.workers.dev",
  token: "",
  defaultDeck: "",
  srcLang: "de",
  tgtLang: "es",
  autoTranslate: true,
};

async function settings() {
  return { ...DEFAULTS, ...((await chrome.storage.sync.get(DEFAULTS)) ?? {}) };
}

function api(path, s, init = {}) {
  return fetch(s.apiBase.replace(/\/$/, "") + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(s.token ? { "x-api-token": s.token } : {}),
      ...(init.headers ?? {}),
    },
  });
}

function status(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = cls;
}

async function currentTabSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return "";
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim().slice(0, 500) ?? "",
    });
    return res?.result ?? "";
  } catch {
    return ""; // chrome:// pages, PDFs, no permission — popup still works manually
  }
}

// Searchable list picker with inline list creation.
// opts: { categories: [{id,name}], onCreate: async (name, parentId) => leaf }.
function buildPicker(mount, groups, initialId, opts = {}) {
  mount.innerHTML = "";
  const flat = [];
  for (const [cat, ls] of groups) for (const l of ls) flat.push({ ...l, cat });
  const state = { id: initialId && flat.some((l) => l.id === initialId) ? initialId : flat[0]?.id ?? "", open: false, hi: 0, creating: false };
  const wrap = document.createElement("div");
  wrap.className = "lp";
  const display = document.createElement("button");
  display.type = "button";
  display.className = "lp-display";
  const drop = document.createElement("div");
  drop.className = "lp-drop";
  drop.hidden = true;
  const search = document.createElement("input");
  search.placeholder = "Search lists…";
  search.setAttribute("aria-label", "Search lists");
  const list = document.createElement("div");
  list.className = "lp-list";
  const foot = document.createElement("div");
  foot.className = "lp-new";
  drop.append(search, list, foot);
  wrap.append(display, drop);
  mount.append(wrap);

  const paint = () => {
    const cur = flat.find((l) => l.id === state.id);
    display.innerHTML = "";
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = cur ? `${cur.cat} / ${cur.name}` : "Pick a list…";
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = cur ? `${cur.due} due` : "";
    const c = document.createElement("span");
    c.className = "c";
    c.textContent = "▾";
    display.append(t, n, c);
  };
  const highlight = (all) => {
    all.forEach((b, i) => b.classList.toggle("sel", i === state.hi));
    all[state.hi]?.scrollIntoView({ block: "nearest" });
  };
  const render = () => {
    const qy = search.value.trim().toLowerCase();
    list.innerHTML = "";
    const items = [];
    for (const [cat, ls] of groups) {
      const hit = ls.filter(
        (l) => !qy || l.name.toLowerCase().includes(qy) || cat.toLowerCase().includes(qy)
      );
      if (!hit.length) continue;
      const g = document.createElement("div");
      g.className = "lp-group";
      g.textContent = cat;
      list.append(g);
      for (const l of hit) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lp-item" + (l.id === state.id ? " sel" : "");
        b.dataset.id = l.id;
        const t = document.createElement("span");
        t.className = "t";
        t.textContent = l.name;
        const n = document.createElement("span");
        n.className = "n";
        n.textContent = `${l.due} due`;
        b.append(t, n);
        b.onclick = () => {
          state.id = l.id;
          close();
          paint();
        };
        list.append(b);
        items.push(b);
      }
    }
    if (!items.length) {
      const e = document.createElement("div");
      e.className = "lp-empty";
      e.textContent = "No matches";
      list.append(e);
    }
    state.hi = Math.max(0, items.findIndex((b) => b.dataset.id === state.id));
    highlight(items);
  };
  const renderFoot = () => {
    foot.innerHTML = "";
    if (!opts.onCreate) return;
    if (!state.creating) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lp-newbtn";
      b.textContent = "＋ New list…";
      b.onclick = () => {
        state.creating = true;
        renderFoot();
        foot.querySelector("input")?.focus();
      };
      foot.append(b);
      return;
    }
    const form = document.createElement("div");
    form.className = "lp-form";
    const nameInput = document.createElement("input");
    nameInput.placeholder = "New list name…";
    nameInput.setAttribute("aria-label", "New list name");
    nameInput.maxLength = 80;
    const catSel = document.createElement("select");
    catSel.setAttribute("aria-label", "Category");
    const top = document.createElement("option");
    top.value = "";
    top.textContent = "Top level";
    catSel.append(top);
    for (const c of opts.categories ?? []) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      catSel.append(o);
    }
    const row = document.createElement("div");
    row.className = "row";
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = "Create";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = "✕";
    row.append(go, cancel);
    const err = document.createElement("div");
    err.className = "lp-err";
    form.append(nameInput, catSel, row, err);
    foot.append(form);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go.click();
      } else if (e.key === "Escape") {
        state.creating = false;
        renderFoot();
        search.focus();
      }
    });
    cancel.onclick = () => {
      state.creating = false;
      renderFoot();
      search.focus();
    };
    go.onclick = async () => {
      const nm = nameInput.value.trim();
      if (!nm) {
        err.textContent = "Give it a name.";
        return;
      }
      go.disabled = true;
      try {
        const leaf = await opts.onCreate(nm, catSel.value || null);
        const catName =
          (opts.categories ?? []).find((c) => c.id === leaf.parent_id)?.name ?? "Top level";
        if (!groups.has(catName)) groups.set(catName, []);
        groups.get(catName).push(leaf);
        flat.push({ ...leaf, cat: catName });
        state.id = leaf.id;
        state.creating = false;
        paint();
        render();
        renderFoot();
      } catch (ex) {
        err.textContent = ex.message;
        go.disabled = false;
      }
    };
  };
  const open = () => {
    state.open = true;
    drop.hidden = false;
    search.value = "";
    render();
    renderFoot();
    search.focus();
  };
  const close = () => {
    state.open = false;
    drop.hidden = true;
  };
  display.onclick = () => (state.open ? close() : open());
  document.addEventListener("click", (e) => {
    if (state.open && !wrap.contains(e.target)) close();
  });
  search.addEventListener("input", render);
  search.addEventListener("keydown", (e) => {
    const all = [...list.querySelectorAll(".lp-item")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!all.length) return;
      state.hi = (state.hi + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length;
      highlight(all);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (all[state.hi]) all[state.hi].click();
    } else if (e.key === "Escape") {
      close();
      display.focus();
    }
  });
  paint();
  return { get: () => state.id, set: (id) => { state.id = id; paint(); } };
}

async function loadDecks(s, onCreate) {
  const mount = $("deck");
  mount.innerHTML = "";
  const r = await api("/api/decks", s);
  if (r.status === 401) throw new Error("bad token");
  if (!r.ok) throw new Error("HTTP " + r.status);
  const decks = await r.json();
  const byId = new Map(decks.map((d) => [d.id, d]));
  const leaves = decks.filter((d) => d.children === 0);
  const categories = decks.filter((d) => d.children > 0).map((d) => ({ id: d.id, name: d.name }));
  const groups = new Map();
  for (const l of leaves) {
    const cat = l.parent_id ? byId.get(l.parent_id)?.name ?? "Other" : "Top level";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(l);
  }
  return buildPicker(mount, groups, s.defaultDeck, { categories, onCreate });
}

async function translate(text, s) {
  if (!s.autoTranslate || !text || $("back").value.trim()) return;
  $("auto").textContent = "· translating…";
  try {
    const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${s.srcLang}|${s.tgtLang}`;
    const r = await fetch(u);
    const j = await r.json();
    const t = j?.responseData?.translatedText?.trim();
    if (t && t.toUpperCase() !== "QUERY LENGTH LIMIT EXCEEDED" && t.toLowerCase() !== text.toLowerCase()) {
      $("back").value = t;
    }
  } catch {
    /* offline / rate-limited — user types it manually */
  } finally {
    $("auto").textContent = "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const s = await settings();
  await chrome.action.setBadgeText({ text: "" }).catch(() => {});
  $("notoken").hidden = !!s.token;
  $("open").href = s.apiBase.replace(/\/$/, "") + "/";
  $("open").onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: s.apiBase.replace(/\/$/, "") + "/" });
  };

  const createDeck = async (name, parentId) => {
    const r = await api("/api/decks", s, {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "HTTP " + r.status);
    const { id } = await r.json();
    return { id, name, parent_id: parentId, due: 0, total: 0, isNew: 0 };
  };
  let picker = null;
  try {
    picker = await loadDecks(s, createDeck);
  } catch (e) {
    status("Lists failed: " + e.message, "err");
  }

  // front: right-click stash wins, else live tab selection
  let front = "";
  try {
    front = (await store.get("pendingFront"))?.pendingFront ?? "";
    if (front) await store.remove("pendingFront");
  } catch {}
  if (!front) front = await currentTabSelection();
  if (front) {
    $("front").value = front;
    translate(front, s);
  } else {
    $("front").focus();
  }

  $("front").addEventListener("change", () => translate($("front").value.trim(), s));
  $("reload").onclick = async () => {
    status("");
    try {
      picker = await loadDecks(s, createDeck);
      status("Lists reloaded ✓", "ok");
    } catch (e) {
      status("Lists failed: " + e.message, "err");
    }
  };

  const save = async () => {
    const f = $("front").value.trim();
    const b = $("back").value.trim();
    if (!f || !b) return status("Front and back required.", "err");
    if (!picker?.get()) return status("Pick a list first.", "err");
    $("save").disabled = true;
    try {
      const r = await api(`/api/decks/${picker.get()}/cards`, s, {
        method: "POST",
        body: JSON.stringify({ front: f, back: b, is_reversed: $("reversed").checked }),
      });
      if (r.status === 401) throw new Error("bad token — check settings");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "HTTP " + r.status);
      status("Saved ✓ — select the next one", "ok");
      $("front").value = "";
      $("back").value = "";
      $("front").focus();
    } catch (e) {
      status("Save failed: " + e.message, "err");
    } finally {
      $("save").disabled = false;
    }
  };
  $("save").onclick = save;
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
  });
});
