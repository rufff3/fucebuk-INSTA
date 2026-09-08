const SERVER_URL = "http://localhost:9999/request-login";

function parseAndSortCookies(str) {
  const result = [];
  if (!str) return result;

  const sanitized = str.replace(/[\r\n]+/g, ";");
  const rawPairs = sanitized.split(";");
  const cookieMap = new Map();

  for (const raw of rawPairs) {
    const item = raw.trim();
    if (!item) continue;

    const eqIdx = item.indexOf("=");
    if (eqIdx === -1) continue;

    const name = item.slice(0, eqIdx).trim();
    let val = item.slice(eqIdx + 1).trim();

    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }

    if (name) {
      cookieMap.set(name, val);
    }
  }

  const priorityOrder = [
    "datr",
    "mid",
    "ig_did",
    "csrftoken",
    "ds_user_id",
    "sessionid",
    "ps_n",
    "ps_l",
    "rur",
    "wd"
  ];

  for (const key of priorityOrder) {
    for (const [name, val] of cookieMap.entries()) {
      if (name.toLowerCase() === key) {
        result.push({ name, value: val });
        cookieMap.delete(name);
        break;
      }
    }
  }

  for (const [name, val] of cookieMap.entries()) {
    result.push({ name, value: val });
  }

  return result;
}

async function injeksiCookies(cookieString, platform) {
  if (!cookieString) return;

  const isIG = platform === "instagram";
  const targetUrl = isIG ? "https://www.instagram.com/" : "https://www.facebook.com/";
  const targetDomain = isIG ? ".instagram.com" : ".facebook.com";

  const cookiesList = parseAndSortCookies(cookieString);

  for (const c of cookiesList) {
    const lowerName = c.name.toLowerCase();
    const isHttpOnly = [
      "mid", "sessionid", "ds_user_id", "datr", "ig_did", 
      "ps_l", "ps_n", "rur", "xs", "c_user", "sb", "fr"
    ].includes(lowerName);

    let sameSiteVal = "no_restriction";
    if (lowerName === "wd" || lowerName === "ps_l") {
      sameSiteVal = "lax";
    }

    const expirationDate = Math.floor(Date.now() / 1000) + 31536000;

    try {
      await chrome.cookies.set({
        url: targetUrl,
        domain: targetDomain,
        name: c.name,
        value: c.value,
        path: "/",
        secure: true,
        httpOnly: isHttpOnly,
        sameSite: sameSiteVal,
        expirationDate: expirationDate
      });
    } catch (err) {
      try {
        await chrome.cookies.set({
          url: targetUrl,
          name: c.name,
          value: c.value,
          path: "/",
          secure: true,
          httpOnly: isHttpOnly
        });
      } catch (e2) {}
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const targetTabId = tab.id;

  try {
    const response = await fetch(SERVER_URL);
    const serverData = await response.json();

    if (serverData.status === "success") {
      const isIG = serverData.platform === "instagram";
      const targetUrl = isIG ? "https://www.instagram.com/" : "https://www.facebook.com/";

      const domainFilter = isIG ? "instagram.com" : "facebook.com";
      const oldCookies = await chrome.cookies.getAll({ domain: domainFilter });
      for (const c of oldCookies) {
        await chrome.cookies.remove({
          url: (c.secure ? "https://" : "http://") + c.domain.replace(/^\./, "") + c.path,
          name: c.name
        });
      }

      const dataSimpan = {
        [`tab_${targetTabId}`]: {
          platform: serverData.platform,
          uid: serverData.uid || "",
          password: serverData.password || "",
          cookies: serverData.cookies || ""
        }
      };
      await chrome.storage.session.set(dataSimpan);

      if (serverData.cookies) {
        await injeksiCookies(serverData.cookies, serverData.platform);
      }

      await new Promise((r) => setTimeout(r, 200));
      chrome.tabs.update(targetTabId, { url: targetUrl });
    } else {
      chrome.tabs.update(targetTabId, { url: "https://www.facebook.com/" });
    }
  } catch (err) {
    chrome.tabs.update(targetTabId, { url: "https://www.facebook.com/" });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab_${tabId}`);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const keyTab = `tab_${tabId}`;
    const result = await chrome.storage.session.get(keyTab);
    const akun = result[keyTab];

    if (!akun) return;

    if (akun.platform === "instagram" && tab.url.includes("instagram.com")) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: autoLoginInstagram,
        args: [akun.uid, akun.password]
      });
    } else if (akun.platform === "facebook" && tab.url.includes("facebook.com")) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: autoLoginFacebook,
        args: [akun.uid, akun.password]
      });
    }
  }
});

function autoLoginFacebook(uid, password) {
  let timer = setInterval(() => {
    const inputUser = document.querySelector('input[name="email"]');
    const inputPass = document.querySelector('input[name="pass"]');
    
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const submitBtn = buttons.find(el => {
      const label = (el.getAttribute("aria-label") || el.innerText || "").trim().toLowerCase();
      return label === "log in" || label === "masuk";
    });

    if (inputUser && inputPass) {
      clearInterval(timer);

      if (uid && password) {
        inputUser.value = uid;
        inputUser.dispatchEvent(new Event("input", { bubbles: true }));

        inputPass.value = password;
        inputPass.dispatchEvent(new Event("input", { bubbles: true }));

        setTimeout(() => {
          if (submitBtn) submitBtn.click();
        }, 400);
      }
    }
  }, 200);

  setTimeout(() => clearInterval(timer), 8000);
}

function autoLoginInstagram(uid, password) {
  let timer = setInterval(() => {
    const inputUser = document.querySelector('input[name="email"]');
    const inputPass = document.querySelector('input[name="pass"]');
    
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const submitBtn = buttons.find(el => {
      const label = (el.getAttribute("aria-label") || el.innerText || "").trim().toLowerCase();
      return label === "log in" || label === "masuk";
    });

    if (inputUser && inputPass) {
      clearInterval(timer);

      if (uid && password) {
        inputUser.value = uid;
        inputUser.dispatchEvent(new Event("input", { bubbles: true }));

        inputPass.value = password;
        inputPass.dispatchEvent(new Event("input", { bubbles: true }));

        setTimeout(() => {
          if (submitBtn) submitBtn.click();
        }, 400);
      }
    }
  }, 200);

  setTimeout(() => clearInterval(timer), 8000);
}