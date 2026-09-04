function sortFacebookCookies(cookieStr) {
  const priorityOrder = ["datr", "wd", "dpr", "sb", "c_user", "fr", "xs"];
  const cookiePairs = cookieStr.split(";").map(item => item.trim()).filter(Boolean);
  const cookieMap = new Map();

  for (const pair of cookiePairs) {
    const splitIndex = pair.indexOf("=");
    if (splitIndex !== -1) {
      const key = pair.slice(0, splitIndex).trim();
      const val = pair.slice(splitIndex + 1).trim();
      cookieMap.set(key, val);
    }
  }

  const sortedList = [];
  for (const key of priorityOrder) {
    if (cookieMap.has(key)) {
      sortedList.push(`${key}=${cookieMap.get(key)}`);
      cookieMap.delete(key);
    }
  }

  for (const [key, val] of cookieMap.entries()) {
    sortedList.push(`${key}=${val}`);
  }

  return sortedList.join("; ");
}

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0 || !details.requestHeaders) return;

    for (const header of details.requestHeaders) {
      if (header.name.toLowerCase() === "cookie" && header.value) {
        if (header.value.includes("c_user=")) {
          const formattedCookie = sortFacebookCookies(header.value);
          const dataToStore = {
            [`tab_${details.tabId}`]: formattedCookie
          };

          const uidMatch = header.value.match(/c_user=(\d+)/);
          if (uidMatch && uidMatch[1]) {
            dataToStore[`cookie_${uidMatch[1]}`] = formattedCookie;
          }

          chrome.storage.local.set(dataToStore);
        }
        break;
      }
    }
  },
  { urls: ["*://*.facebook.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_TAB_COOKIE") {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId === null) {
      sendResponse("");
      return;
    }

    const tabKey = `tab_${tabId}`;
    const uidKey = request.uid ? `cookie_${request.uid}` : null;
    const searchKeys = uidKey ? [tabKey, uidKey] : [tabKey];

    chrome.storage.local.get(searchKeys, (res) => {
      const cookie = res[tabKey] || (uidKey ? res[uidKey] : "") || "";
      sendResponse(cookie);
    });

    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tab_${tabId}`);
});