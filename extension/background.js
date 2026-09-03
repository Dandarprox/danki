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
