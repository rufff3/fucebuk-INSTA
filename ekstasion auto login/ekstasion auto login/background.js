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

    try {
      if (akun.platform === "instagram" && tab.url.includes("instagram.com")) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: autoLoginInstagram,
          args: [akun.uid, akun.password]
        });
      } else if (akun.platform === "facebook" && tab.url.includes("facebook.com")) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: autoLoginFacebook,
          args: [akun.uid, akun.password]
        });
      }
    } catch (err) {}
  }
});

function autoLoginFacebook(uid, password) {
  if (window.__fbLoginTimer) {
    clearInterval(window.__fbLoginTimer);
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function triggerClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    };

    try { el.dispatchEvent(new PointerEvent("pointerdown", opts)); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent("mousedown", opts)); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent("pointerup", opts)); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent("mouseup", opts)); } catch (e) {}
    if (typeof el.click === "function") {
      el.click();
    } else {
      try { el.dispatchEvent(new MouseEvent("click", opts)); } catch (e) {}
    }
  }

  function fillInput(el, val) {
    if (!el || !val) return;
    el.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findContinueButton() {
    let btn = document.querySelector(
      'div[role="button"][tabindex="0"][aria-label*="Continue" i], div[role="button"][tabindex="0"][aria-label*="Lanjutkan" i]'
    );
    if (btn && isVisible(btn)) return btn;

    const ariaMatch = document.querySelector(
      '[aria-label*="Continue" i], [aria-label*="Lanjutkan" i]'
    );
    if (ariaMatch && isVisible(ariaMatch)) {
      return ariaMatch.closest('div[role="button"]') || ariaMatch;
    }

    const candidates = Array.from(document.querySelectorAll('div[role="button"], button, span'));
    for (const el of candidates) {
      const text = (el.innerText || "").trim().toLowerCase();
      if (text === "continue" || text === "lanjutkan") {
        const target = el.closest('div[role="button"][tabindex="0"]') || el.closest('div[role="button"]') || el.closest('button') || el;
        if (isVisible(target)) return target;
      }
    }
    return null;
  }

  function findSubmitButton() {
    const candidates = Array.from(document.querySelectorAll('div[role="button"], button, input[type="submit"]'));
    return candidates.find((el) => {
      if (!isVisible(el)) return false;
      const text = (el.getAttribute("aria-label") || el.innerText || el.value || "").trim().toLowerCase();
      return text === "log in" || text === "masuk" || text.includes("log in") || text.includes("masuk");
    });
  }

  let continueClicked = false;

  window.__fbLoginTimer = setInterval(() => {
    const passInputs = Array.from(document.querySelectorAll('input[type="password"], input[name="pass"]'));
    const visiblePass = passInputs.find(isVisible);

    const userInputs = Array.from(document.querySelectorAll('input[name="email"], input[type="text"]'));
    const visibleUser = userInputs.find((el) => isVisible(el) && (el.name === "email" || el.id === "email"));

    // Skenario A: Modal sandi muncul setelah terpental (Hanya input sandi yang terlihat di layar)
    if (visiblePass && !visibleUser) {
      clearInterval(window.__fbLoginTimer);
      window.__fbLoginTimer = null;

      if (password) {
        fillInput(visiblePass, password);
        setTimeout(() => {
          const submitBtn = findSubmitButton();
          if (submitBtn) {
            triggerClick(submitBtn);
          } else {
            visiblePass.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          }
        }, 400);
      }
      return;
    }

    // Skenario B: Terpental ke halaman profil dengan tombol Continue aktif
    if (!continueClicked) {
      const continueBtn = findContinueButton();
      if (continueBtn && !visiblePass) {
        continueClicked = true;
        triggerClick(continueBtn);
        setTimeout(() => {
          continueClicked = false;
        }, 3000);
        return;
      }
    }

    // Skenario C: Form login biasa (Email dan Sandi dua-duanya terlihat di layar)
    if (visibleUser && visiblePass) {
      clearInterval(window.__fbLoginTimer);
      window.__fbLoginTimer = null;

      if (uid && password) {
        fillInput(visibleUser, uid);
        fillInput(visiblePass, password);
        setTimeout(() => {
          const submitBtn = findSubmitButton();
          if (submitBtn) triggerClick(submitBtn);
        }, 400);
      }
      return;
    }
  }, 200);

  setTimeout(() => {
    if (window.__fbLoginTimer) {
      clearInterval(window.__fbLoginTimer);
      window.__fbLoginTimer = null;
    }
  }, 20000);
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