// Service worker: right-click "Add to Danki" on any selected text.
const store = chrome.storage.session ?? chrome.storage.local;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "danki-add",
    title: 'Add "%s" to Danki',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "danki-add" || !info.selectionText) return;
  await store.set({ pendingFront: info.selectionText.trim().slice(0, 500) });
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup isn't allowed from every context — flag it so the user
    // knows to click the toolbar icon; the popup reads pendingFront.
    await chrome.action.setBadgeText({ text: "•" });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
  }
  // Network proxy for the content script: page CSP (connect-src) can't
  // block the service worker, so all API/translate traffic goes through here.
  if (msg?.type === "fetch") {
    (async () => {
      try {
        const r = await fetch(msg.url, msg.init);
        reply({ ok: r.ok, status: r.status, text: await r.text() });
      } catch (e) {
        reply({ error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
});
