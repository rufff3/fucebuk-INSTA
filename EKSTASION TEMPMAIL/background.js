chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "open_side_panel",
      title: "Buka di Side Panel",
      contexts: ["action"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "open_side_panel" && tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});