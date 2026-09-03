const $ = (id) => document.getElementById(id);
const LANGS = { de: "German", fr: "French", en: "English", es: "Spanish", it: "Italian", pt: "Portuguese" };
const DEFAULTS = {
  apiBase: "https://danki.dlsusp.workers.dev",
  token: "",
  defaultDeck: "",
  srcLang: "de",
  tgtLang: "es",
  autoTranslate: true,
};

function status(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = cls;
}

async function current() {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "") || DEFAULTS.apiBase;
  return { apiBase, token: $("token").value };
}

async function loadDecks(intoDefault) {
  const { apiBase, token } = await current();
  const sel = $("defaultDeck");
  const keep = intoDefault ? sel.value : ($("defaultDeck").dataset.keep ?? "");
  try {
    const r = await fetch(apiBase + "/api/decks", {
      headers: token ? { "x-api-token": token } : {},
    });
    if (r.status === 401) throw new Error("bad token (401)");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const decks = (await r.json()).filter((d) => d.children === 0);
    sel.innerHTML = '<option value="">— first list —</option>';
    for (const d of decks) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = (d.parent_id ? "↳ " : "") + d.name;
      sel.appendChild(o);
    }
    if (keep && decks.some((d) => d.id === keep)) sel.value = keep;
    return true;
  } catch (e) {
    status("Couldn't load lists: " + e.message, "err");
    return false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const s = { ...DEFAULTS, ...((await chrome.storage.sync.get(DEFAULTS)) ?? {}) };
  $("apiBase").value = s.apiBase;
  $("token").value = s.token;
  $("autoTranslate").checked = s.autoTranslate;
  for (const [code, name] of Object.entries(LANGS)) {
    for (const id of ["srcLang", "tgtLang"]) {
      const o = document.createElement("option");
      o.value = code;
      o.textContent = name;
      $(id).appendChild(o);
    }
  }
  $("srcLang").value = s.srcLang;
  $("tgtLang").value = s.tgtLang;
  $("defaultDeck").dataset.keep = s.defaultDeck;
  await loadDecks(true);

  $("eye").onclick = () => {
    const t = $("token");
    const show = t.type === "password";
    t.type = show ? "text" : "password";
    $("eye").textContent = show ? "🙈" : "👁️";
  };

  $("save").onclick = async () => {
    await chrome.storage.sync.set({
      apiBase: $("apiBase").value.trim().replace(/\/$/, "") || DEFAULTS.apiBase,
      token: $("token").value,
      defaultDeck: $("defaultDeck").value,
      srcLang: $("srcLang").value,
      tgtLang: $("tgtLang").value,
      autoTranslate: $("autoTranslate").checked,
    });
    status("Saved ✓", "ok");
  };

  $("test").onclick = async () => {
    status("Pinging…");
    const { apiBase, token } = await current();
    try {
      const h = await fetch(apiBase + "/api/health");
      if (!h.ok) throw new Error("no server at " + apiBase);
      const d = await fetch(apiBase + "/api/decks", {
        headers: token ? { "x-api-token": token } : {},
      });
      if (d.status === 401) return status("Server reachable, but token rejected (401).", "err");
      const decks = await d.json();
      status(`Connected ✓ — ${decks.length} deck(s), auth OK.`, "ok");
      await loadDecks(false);
    } catch (e) {
      status("Failed: " + e.message, "err");
    }
  };
});
