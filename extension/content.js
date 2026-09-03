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
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    .icon {
      position: fixed; width: 34px; height: 34px; border-radius: 50%;
      background: #1c1917; color: #fff; border: 2px solid #fff;
      box-shadow: 0 4px 14px rgba(0,0,0,.35); cursor: pointer;
      display: grid; place-items: center; font-size: 17px; font-weight: 800;
      pointer-events: auto; padding: 0;
    }
    .icon:hover { transform: scale(1.1); }
    .panel {
      position: fixed; width: 300px; background: #fff; color: #1c1917;
      border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
      padding: 12px; pointer-events: auto;
    }
    .panel h3 { margin: 0 0 8px; font-size: 14px; display: flex; align-items: center; gap: 7px; }
    .panel h3 .logo { width: 20px; height: 20px; border-radius: 6px; background: #1c1917;
      color: #fff; display: inline-grid; place-items: center; font-size: 12px; }
    .panel label { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .08em; opacity: .55; margin: 8px 0 3px; }
    .panel textarea, .panel select {
      width: 100%; padding: 7px 9px; font-size: 14px; color: #1c1917;
      border: 1px solid #d6d3d1; border-radius: 9px; background: #fff; outline: none;
    }
    .panel textarea { resize: vertical; min-height: 38px; }
    .panel textarea:focus, .panel select:focus { border-color: #1c1917; }
    .panel .row { display: flex; gap: 8px; margin-top: 10px; }
    .panel button { flex: 1; padding: 9px; border: 0; border-radius: 10px; font-size: 14px;
      font-weight: 700; cursor: pointer; background: #1c1917; color: #fff; }
    .panel button:disabled { opacity: .45; cursor: default; }
    .panel button.ghost { background: transparent; border: 1px solid #d6d3d1; color: #1c1917; flex: 0 0 auto; }
    .panel .check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-top: 8px; }
    .panel .check label { margin: 0; text-transform: none; letter-spacing: 0; font-size: 13px; opacity: 1; font-weight: 400; }
    .panel .status { margin-top: 8px; font-size: 13px; min-height: 18px; }
    .panel .status.ok { color: #059669; } .panel .status.err { color: #dc2626; }
    .panel .warn { background: #fef3c7; color: #92400e; border-radius: 9px; padding: 7px 9px;
      font-size: 12px; margin-bottom: 4px; }
    .panel .warn button { background: none; border: none; padding: 0; color: inherit;
      font-size: 12px; text-decoration: underline; cursor: pointer; }
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
    const w = el === "icon" ? 34 : 300;
    const h = el === "icon" ? 34 : 340;
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
    const p = place("icon", info.rect.left + info.rect.width / 2 - 17, above ? info.rect.top - 42 : info.rect.bottom + 8);
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
    const below = window.innerHeight - rect.bottom > 360;
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
      <label>List</label><select id="dk-deck"><option>Loading…</option></select>
      <div class="check"><input type="checkbox" id="dk-rev" /><label for="dk-rev">Study both directions ⇄</label></div>
      <div class="row"><button id="dk-save">Save card</button><button id="dk-x" class="ghost">✕</button></div>
      <div class="status" id="dk-status"></div>`;
    slot.appendChild(panel);
    const q = (id) => panel.querySelector(id);
    q("#dk-front").value = text;
    q("#dk-x").onclick = hide;
    const optBtn = q("#dk-opt");
    if (optBtn) optBtn.onclick = () => chrome.runtime.sendMessage({ type: "openOptions" });

    // lists, grouped by category
    try {
      const r = await bgFetch(s.apiBase.replace(/\/$/, "") + "/api/decks", {
        headers: s.token ? { "x-api-token": s.token } : {},
      });
      if (r.status === 401) throw new Error("bad token");
      const decks = await r.json();
      const byId = new Map(decks.map((d) => [d.id, d]));
      const leaves = decks.filter((d) => d.children === 0);
      const sel = q("#dk-deck");
      sel.innerHTML = "";
      const groups = new Map(); // category name -> leaves
      for (const l of leaves) {
        const cat = l.parent_id ? byId.get(l.parent_id)?.name ?? "Other" : "Top level";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(l);
      }
      for (const [cat, ls] of groups) {
        const g = document.createElement("optgroup");
        g.label = cat;
        for (const l of ls) {
          const o = document.createElement("option");
          o.value = l.id;
          o.textContent = `${l.name} (${l.due} due)`;
          g.appendChild(o);
        }
        sel.appendChild(g);
      }
      if (s.defaultDeck && leaves.some((l) => l.id === s.defaultDeck)) sel.value = s.defaultDeck;
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
      try {
        const r = await bgFetch(s.apiBase.replace(/\/$/, "") + `/api/decks/${q("#dk-deck").value}/cards`, {
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
