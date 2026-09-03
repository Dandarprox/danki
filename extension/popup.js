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

async function loadDecks(s) {
  const sel = $("deck");
  sel.innerHTML = "";
  try {
    const r = await api("/api/decks", s);
    if (r.status === 401) throw new Error("bad token");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const decks = (await r.json()).filter((d) => d.children === 0);
    if (!decks.length) throw new Error("no lists yet — create one in Danki first");
    for (const d of decks) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.name;
      sel.appendChild(o);
    }
    if (s.defaultDeck && decks.some((d) => d.id === s.defaultDeck)) sel.value = s.defaultDeck;
  } catch (e) {
    const o = document.createElement("option");
    o.textContent = "Couldn't load lists (" + e.message + ")";
    sel.appendChild(o);
    throw e;
  }
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

  try {
    await loadDecks(s);
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
      await loadDecks(s);
      status("Lists reloaded ✓", "ok");
    } catch (e) {
      status("Lists failed: " + e.message, "err");
    }
  };

  const save = async () => {
    const f = $("front").value.trim();
    const b = $("back").value.trim();
    if (!f || !b) return status("Front and back required.", "err");
    if (!$("deck").value) return status("Pick a list first.", "err");
    $("save").disabled = true;
    try {
      const r = await api(`/api/decks/${$("deck").value}/cards`, s, {
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
