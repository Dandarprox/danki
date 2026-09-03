# 団 Danki Clipper — companion browser extension

Select a word on any page → right-click **Add to Danki** (or click the toolbar
icon) → back side auto-translated → saved straight into your deployed Danki
as a new card. Manifest V3, no dependencies, Chrome-first (Firefox-compatible).

## Install (unpacked, 1 min)

1. Open `chrome://extensions` → enable **Developer mode** (top-right).
2. **Load unpacked** → select this `extension/` folder.
3. Pin *Danki Clipper* to the toolbar (puzzle icon → pin).

## Configure (1 min)

1. Right-click the toolbar icon → **Options** (or open from the popup's
   *open settings* link).
2. **Danki URL** is prefilled with production. For local dev use
   `http://localhost:3000`.
3. Paste your **API token** (same string as the worker's `API_TOKEN` secret —
   stored only in this browser, never sent anywhere except your Danki).
4. Pick from/to languages + default list, hit **Test connection** → Save.

## Use

**Floating bubble (fastest):** select any word → a 団 icon pops next to the
selection → click it → inline editor opens right there: front prefilled, back
auto-translated, destination list grouped by category (`Français / Verbes`),
optional ⇄ reversed → **Save card**. `Esc` or click-away dismisses.

**Fallbacks:** select → right-click → *Add to Danki*, or click the toolbar
icon (it pulls the live tab selection itself).

Back side auto-fills via the free MyMemory API (editable, works offline as
manual entry if rate-limited). `⌘/Ctrl+Enter` saves, popup stays open for
the next word.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest (contextMenus, storage, activeTab, scripting, content script) |
| `content.js` | Floating bubble + inline editor (shadow DOM, style-isolated) |
| `background.js` | Context-menu entry, stash selection, network proxy, opens options |
| `popup.html/js` | Toolbar-popup form, translate, save |
| `options.html/js` | URL, token, languages, default list, connection test |

## Notes

- Chrome shows an *"read and change all your data"* warning on install —
  that's the content script needed for the floating bubble (standard for
  clippers). It only reads the text you select.
- All editor network traffic is proxied through the service worker, so
  strict sites (GitHub, X, banks with `connect-src` CSPs) can't block saves.

## Privacy

Needs `activeTab` + `scripting` only to read the selection you explicitly act
on — no browsing history, no always-on content scripts. The token lives in
`chrome.storage.sync` alongside your other browser-synced extension data.
