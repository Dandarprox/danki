// Danki Clipper — floating capture bubble.
// Select text → 団 icon pops near the selection → click → inline editor
// (front/back, category-grouped lists, reversed) → save straight to Danki.
// All UI lives in a shadow root so host-page CSS can't leak in or out.
(() => {
  if (window.__dankiClipper) return;
  window.__dankiClipper = true;

  const DEFAULTS = {
    apiBase: "https://danki.dlsusp.workers.dev",
    token: "",
    defaultDeck: "",
    srcLang: "de",
    tgtLang: "es",
    autoTranslate: true,
  };
  const MAX_LEN = 300;

  const host = document.createElement("div");
  host.id = "danki-clipper-root";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    @keyframes dk-pop { from { opacity: 0; transform: translateY(6px) scale(.97); } }
    @media (prefers-reduced-motion: reduce) { .icon, .panel { animation: none !important; } }
    .icon {
      position: fixed; width: 36px; height: 36px; border-radius: 50%;
      background: #1c1917; color: #FAF7F2; border: 2px solid #FAF7F2;
      box-shadow: 0 4px 16px rgba(0,0,0,.4); cursor: pointer;
      display: grid; place-items: center; font-size: 18px; font-weight: 800;
      pointer-events: auto; padding: 0; animation: dk-pop .18s ease;
      transition: transform .12s ease;
    }
    .icon:hover { transform: scale(1.12); }
    .panel {
      position: fixed; width: 312px; background: #FAF7F2; color: #1c1917;
      border: 1px solid rgba(28,25,23,.1); border-radius: 18px;
      box-shadow: 0 16px 48px rgba(0,0,0,.32);
      padding: 14px; pointer-events: auto; animation: dk-pop .2s ease;
    }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1c1917; color: #f5f5f4; border-color: rgba(255,255,255,.12); }
    }
    .panel h3 { margin: 0 0 4px; font-size: 15px; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; }
    .panel h3 .logo { width: 22px; height: 22px; border-radius: 7px; background: #1c1917;
      color: #FAF7F2; display: inline-grid; place-items: center; font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      .panel h3 .logo { background: #FAF7F2; color: #1c1917; }
    }
    .panel label { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .1em; opacity: .5; margin: 10px 0 4px; }
    .panel textarea {
      width: 100%; padding: 8px 10px; font-size: 14px; color: inherit;
      border: 1.5px solid #e7e5e4; border-radius: 11px; background: #fff; outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    @media (prefers-color-scheme: dark) {
      .panel textarea { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.16); }
    }
    .panel textarea { resize: vertical; min-height: 38px; }
    .panel textarea:focus { border-color: #1c1917; box-shadow: 0 0 0 3px rgba(28,25,23,.08); }
    @media (prefers-color-scheme: dark) {
      .panel textarea:focus { border-color: #FAF7F2; box-shadow: 0 0 0 3px rgba(250,247,242,.12); }
    }
    .panel .row { display: flex; gap: 8px; margin-top: 12px; }
    .panel button#dk-save { flex: 1; padding: 10px; border: 0; border-radius: 12px; font-size: 14px;
      font-weight: 700; cursor: pointer; background: #1c1917; color: #FAF7F2; }
    .panel button#dk-save:hover { opacity: .9; }
    @media (prefers-color-scheme: dark) {
      .panel button#dk-save { background: #FAF7F2; color: #1c1917; }
    }
    .panel button#dk-save:disabled { opacity: .45; cursor: default; }
    .panel button.ghost { background: transparent; border: 1.5px solid #e7e5e4; color: inherit;
      border-radius: 12px; padding: 10px 12px; font-size: 14px; cursor: pointer; flex: 0 0 auto; }
    .panel .check { display: flex; align-items: center; gap: 7px; font-size: 13px; margin-top: 10px; }
    .panel .check input { width: 16px; height: 16px; accent-color: #1c1917; }
    .panel .check label { margin: 0; text-transform: none; letter-spacing: 0; font-size: 13px; opacity: 1; font-weight: 400; }
    .panel .status { margin-top: 8px; font-size: 13px; font-weight: 600; min-height: 18px; }
    .panel .status.ok { color: #059669; } .panel .status.err { color: #dc2626; }
    .panel .warn { background: #fef3c7; color: #92400e; border-radius: 10px; padding: 7px 9px;
      font-size: 12px; margin-bottom: 4px; }
    .panel .warn button { background: none; border: none; padding: 0; color: inherit;
      font-size: 12px; text-decoration: underline; cursor: pointer; }
    /* searchable list picker */
    .lp { position: relative; }
    .lp-display {
      width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      font-size: 14px; color: inherit; background: #fff; border: 1.5px solid #e7e5e4;
      border-radius: 11px; cursor: pointer; text-align: left;
    }
    @media (prefers-color-scheme: dark) {
      .lp-display { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.16); }
    }
    .lp-display .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .lp-display .n { font-size: 11px; font-weight: 700; opacity: .55; flex-shrink: 0; }
    .lp-display .c { opacity: .45; flex-shrink: 0; font-size: 12px; }
    .lp-drop {
      position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 2;
      background: #fff; color: #1c1917; border: 1px solid rgba(28,25,23,.12); border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,.25); overflow: hidden;
    }
    @media (prefers-color-scheme: dark) {
      .lp-drop { background: #292524; color: #f5f5f4; border-color: rgba(255,255,255,.14); }
    }
    .lp-drop input {
      width: 100%; border: 0; border-bottom: 1px solid rgba(28,25,23,.1); padding: 9px 11px;
      font-size: 14px; outline: none; background: transparent; color: inherit;
    }
    .lp-list { max-height: 190px; overflow-y: auto; padding: 4px; }
    .lp-group { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em;
      opacity: .45; padding: 7px 9px 2px; }
    .lp-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px;
      border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 13px;
      cursor: pointer; text-align: left; }
    .lp-item .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lp-item .n { font-size: 11px; opacity: .55; flex-shrink: 0; }
    .lp-item.sel, .lp-item:hover { background: rgba(28,25,23,.07); }
    @media (prefers-color-scheme: dark) {
      .lp-item.sel, .lp-item:hover { background: rgba(255,255,255,.1); }
    }
    .lp-empty { padding: 10px; font-size: 13px; opacity: .55; text-align: center; }
  </style><div id="slot"></div>`;
  document.documentElement.appendChild(host);
  const slot = shadow.getElementById("slot");

  const settings = async () => ({ ...DEFAULTS, ...((await chrome.storage.sync.get(DEFAULTS)) ?? {}) });
  const hide = () => { slot.innerHTML = ""; };
  const inUI = (e) => host.contains(e.target);

  // All network goes through the service worker (page CSP can't block it).
  const bgFetch = (url, init) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "fetch", url, init }, (res) => {
        if (chrome.runtime.lastError || !res || res.error) {
          const err = new Error(res?.error ?? chrome.runtime.lastError?.message ?? "request failed");
          resolve({ ok: false, status: 0, text: async () => { throw err; }, json: async () => { throw err; } });
        } else {
          resolve({ ok: res.ok, status: res.status, text: async () => res.text, json: async () => JSON.parse(res.text) });
        }
      });
    });

  function place(el, x, y) {
    const w = el === "icon" ? 36 : 312;
    const h = el === "icon" ? 36 : 440;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    return { x, y };
  }

  function selectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    if (inUI({ target: sel.anchorNode })) return null;
    const text = sel.toString().trim().slice(0, MAX_LEN);
    if (!text) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text, rect };
  }

  function showIcon() {
    const info = selectionInfo();
    if (!info) return hide();
    const above = info.rect.top >= 52;
    const p = place("icon", info.rect.left + info.rect.width / 2 - 18, above ? info.rect.top - 44 : info.rect.bottom + 8);
    slot.innerHTML = "";
    const b = document.createElement("button");
    b.className = "icon";
    b.textContent = "団";
    b.title = "Add to Danki";
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      showEditor(info.text, info.rect);
    });
    slot.appendChild(b);
  }

  async function showEditor(text, rect) {
    const s = await settings();
    const below = window.innerHeight - rect.bottom > 460;
    const p = place("panel", rect.left, below ? rect.bottom + 8 : rect.top - 348);
    slot.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.left = p.x + "px";
    panel.style.top = p.y + "px";
    panel.innerHTML = `
      <h3><span class="logo">団</span> Add to Danki</h3>
      ${s.token ? "" : `<div class="warn">No API token yet — <button id="dk-opt">open settings</button></div>`}
      <label>Front</label><textarea id="dk-front" rows="2"></textarea>
      <label>Back <span id="dk-auto" style="font-weight:400;text-transform:none"></span></label>
      <textarea id="dk-back" rows="2"></textarea>
      <label>List</label><div id="dk-deck"></div>
      <div class="check"><input type="checkbox" id="dk-rev" /><label for="dk-rev">Study both directions ⇄</label></div>
      <div class="row"><button id="dk-save">Save card</button><button id="dk-x" class="ghost">✕</button></div>
      <div class="status" id="dk-status"></div>`;
    slot.appendChild(panel);
    const q = (id) => panel.querySelector(id);
    q("#dk-front").value = text;
    q("#dk-x").onclick = hide;
    const optBtn = q("#dk-opt");
    if (optBtn) optBtn.onclick = () => chrome.runtime.sendMessage({ type: "openOptions" });

    // Searchable list picker. Returns { get, set } for the selected deck id.
    const buildPicker = (mount, groups, initialId) => {
      mount.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "lp";
      const flat = [];
      for (const [cat, ls] of groups) for (const l of ls) flat.push({ ...l, cat });
      const state = { id: initialId && flat.some((l) => l.id === initialId) ? initialId : flat[0]?.id ?? "", open: false, hi: 0 };
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
      drop.append(search, list);
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
      const render = () => {
        const qy = search.value.trim().toLowerCase();
        list.innerHTML = "";
        let items = [];
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
            b.onclick = (e) => {
              e.stopPropagation();
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
        return items;
      };
      const highlight = (items) => {
        const all = items ?? [...list.querySelectorAll(".lp-item")];
        all.forEach((b, i) => b.classList.toggle("sel", i === state.hi));
        all[state.hi]?.scrollIntoView({ block: "nearest" });
      };
      let items = [];
      const open = () => {
        state.open = true;
        drop.hidden = false;
        search.value = "";
        items = render();
        search.focus();
      };
      const close = () => {
        state.open = false;
        drop.hidden = true;
      };
      display.onclick = (e) => {
        e.stopPropagation();
        state.open ? close() : open();
      };
      search.addEventListener("click", (e) => e.stopPropagation());
      search.addEventListener("input", () => {
        items = render();
      });
      search.addEventListener("keydown", (e) => {
        e.stopPropagation(); // panel-level Esc must not fire while filtering
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const all = [...list.querySelectorAll(".lp-item")];
          if (!all.length) return;
          state.hi = (state.hi + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length;
          highlight(all);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const all = [...list.querySelectorAll(".lp-item")];
          if (all[state.hi]) all[state.hi].click();
        } else if (e.key === "Escape") {
          close();
          display.focus();
        }
      });
      paint();
      return { get: () => state.id, set: (id) => { state.id = id; paint(); } };
    };

    // lists, grouped by category
    let picker = null;
    try {
      const r = await bgFetch(s.apiBase.replace(/\/$/, "") + "/api/decks", {
        headers: s.token ? { "x-api-token": s.token } : {},
      });
      if (r.status === 401) throw new Error("bad token");
      const decks = await r.json();
      const byId = new Map(decks.map((d) => [d.id, d]));
      const leaves = decks.filter((d) => d.children === 0);
      if (!leaves.length) throw new Error("no lists yet — create one in Danki first");
      const groups = new Map(); // category name -> leaves
      for (const l of leaves) {
        const cat = l.parent_id ? byId.get(l.parent_id)?.name ?? "Other" : "Top level";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(l);
      }
      picker = buildPicker(q("#dk-deck"), groups, s.defaultDeck);
    } catch (e) {
      q("#dk-status").textContent = "Lists failed: " + e.message;
      q("#dk-status").className = "status err";
    }

    // auto-translate
    const setBack = async () => {
      const f = q("#dk-front").value.trim();
      if (!s.autoTranslate || !f || q("#dk-back").value.trim()) return;
      q("#dk-auto").textContent = "· translating…";
      try {
        const r = await bgFetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(f)}&langpair=${s.srcLang}|${s.tgtLang}`
        );
        const t = (await r.json())?.responseData?.translatedText?.trim();
        if (t && t.toLowerCase() !== f.toLowerCase()) q("#dk-back").value = t;
      } catch {
      } finally {
        q("#dk-auto").textContent = "";
      }
    };
    q("#dk-front").addEventListener("change", setBack);
    setBack();

    q("#dk-save").onclick = async () => {
      const f = q("#dk-front").value.trim();
      const b = q("#dk-back").value.trim();
      const st = q("#dk-status");
      if (!f || !b) {
        st.textContent = "Front and back required.";
        st.className = "status err";
        return;
      }
      q("#dk-save").disabled = true;
      const deckId = picker?.get();
      if (!deckId) {
        st.textContent = "Pick a list first.";
        st.className = "status err";
        q("#dk-save").disabled = false;
        return;
      }
      try {
        const r = await bgFetch(s.apiBase.replace(/\/$/, "") + `/api/decks/${deckId}/cards`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(s.token ? { "x-api-token": s.token } : {}),
          },
          body: JSON.stringify({ front: f, back: b, is_reversed: q("#dk-rev").checked }),
        });
        if (r.status === 401) throw new Error("bad token — check settings");
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "HTTP " + r.status);
        st.textContent = "Saved ✓";
        st.className = "status ok";
        window.getSelection()?.removeAllRanges();
        setTimeout(hide, 1100);
      } catch (e) {
        st.textContent = "Save failed: " + e.message;
        st.className = "status err";
        q("#dk-save").disabled = false;
      }
    };
  }

  let debounce = 0;
  const maybeShow = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (slot.querySelector(".panel")) return; // editor open — leave it
      showIcon();
    }, 180);
  };
  document.addEventListener("mouseup", (e) => {
    if (inUI(e)) return;
    maybeShow();
  });
  document.addEventListener("keyup", (e) => {
    if (inUI(e)) return;
    if (e.key === "Shift" || e.key.startsWith("Arrow")) maybeShow();
  });
  document.addEventListener("mousedown", (e) => {
    if (!inUI(e)) hide();
  });
  document.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
})();
