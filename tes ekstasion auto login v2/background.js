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

      // Ekstraksi UID jika serverData.uid kosong tetapi ada di dalam c_user / ds_user_id cookies
      let extractedUid = (serverData.uid || "").trim();
      if (!extractedUid && serverData.cookies) {
        const matchFB = serverData.cookies.match(/c_user=["']?([0-9]+)["']?/i);
        const matchIG = serverData.cookies.match(/ds_user_id=["']?([0-9]+)["']?/i);
        if (matchFB) {
          extractedUid = matchFB[1];
        } else if (matchIG) {
          extractedUid = matchIG[1];
        }
      }

      const dataSimpan = {
        [`tab_${targetTabId}`]: {
          platform: serverData.platform,
          uid: extractedUid,
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
      // Fallback ekstraksi UID langsung dari cookie aktif jika di storage belum tercatat
      let activeUid = akun.uid;
      if (!activeUid) {
        const isIG = akun.platform === "instagram";
        const targetUrl = isIG ? "https://www.instagram.com/" : "https://www.facebook.com/";
        const cookieName = isIG ? "ds_user_id" : "c_user";
        try {
          const c = await chrome.cookies.get({ url: targetUrl, name: cookieName });
          if (c && c.value) {
            activeUid = c.value;
            akun.uid = activeUid;
            await chrome.storage.session.set({ [keyTab]: akun });
          }
        } catch (e) {}
      }

      // Injeksi badge UID melayang di layar
      if (activeUid) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: tampilkanFloatingUid,
          args: [activeUid]
        });
      }

      if (akun.platform === "instagram" && tab.url.includes("instagram.com")) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: autoLoginInstagram,
          args: [activeUid || akun.uid, akun.password]
        });
      } else if (akun.platform === "facebook" && tab.url.includes("facebook.com")) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: autoLoginFacebook,
          args: [activeUid || akun.uid, akun.password]
        });
      }
    } catch (err) {}
  }
});

// Komponen UID melayang interaktif (klik untuk salin UID saja)
function tampilkanFloatingUid(uid) {
  if (!uid) return;

  function initBadge() {
    let badge = document.getElementById("__floating_uid_badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "__floating_uid_badge";
      Object.assign(badge.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "2147483647",
        backgroundColor: "rgba(15, 23, 42, 0.9)",
        color: "#38bdf8",
        border: "1px solid #0284c7",
        padding: "8px 14px",
        borderRadius: "8px",
        fontFamily: "monospace, sans-serif",
        fontSize: "13px",
        fontWeight: "bold",
        boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.2s ease"
      });

      badge.addEventListener("mouseenter", () => {
        badge.style.transform = "scale(1.05)";
      });
      badge.addEventListener("mouseleave", () => {
        badge.style.transform = "scale(1)";
      });

      badge.addEventListener("click", () => {
        const textToCopy = badge.getAttribute("data-uid") || "";
        if (!textToCopy) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            beriFeedbackSalin(badge, textToCopy);
          }).catch(() => {
            fallbackSalin(badge, textToCopy);
          });
        } else {
          fallbackSalin(badge, textToCopy);
        }
      });

      document.body.appendChild(badge);
    }

    badge.setAttribute("data-uid", uid);
    badge.innerText = `UID: ${uid}`;
  }

  function beriFeedbackSalin(badge, textToCopy) {
    badge.innerText = "UID Tersalin!";
    badge.style.backgroundColor = "rgba(16, 185, 129, 0.95)";
    badge.style.color = "#ffffff";
    setTimeout(() => {
      badge.innerText = `UID: ${textToCopy}`;
      badge.style.backgroundColor = "rgba(15, 23, 42, 0.9)";
      badge.style.color = "#38bdf8";
    }, 1200);
  }

  function fallbackSalin(badge, textToCopy) {
    const tempInput = document.createElement("input");
    tempInput.value = textToCopy;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand("copy");
      beriFeedbackSalin(badge, textToCopy);
    } catch (e) {}
    document.body.removeChild(tempInput);
  }

  if (document.body) {
    initBadge();
  } else {
    document.addEventListener("DOMContentLoaded", initBadge);
  }
}

function autoLoginFacebook(uid, password) {
  if (window.__fbLoginTimer) {
    clearInterval(window.__fbLoginTimer);
  }

  // Daftar multi-bahasa resmi Facebook untuk tombol Continue
  const FB_CONTINUE_LABELS = [
    "continue", "lanjutkan", "lanjut", "teruskan", "sambung", "terusake", "lanjutake",
    "teraskeun", "lanjutkeun", "magpatuloy", "ituloy", "padayon", "ipadayon",
    "tiếp tục", "ดำเนินการต่อ", "ทำต่อ", "ဆက်လုပ်မည်", "ရှေ့ဆက်ရန်", "ဆက်လက်လုပ်ဆောင်ရန်",
    "បន្ត", "ສືບຕໍ່", "ດຳເນີນການຕໍ່", "继续", "繼續", "次へ", "続行", "続ける", "계속", "계속하기",
    "continuar", "continuer", "weiter", "fortfahren", "continua", "doorgaan", "verder",
    "продолжить", "продовжити", "працягнуць", "kontynuuj", "dalej", "pokračovat",
    "pokračovať", "tovább", "folytatás", "continuă", "продължаване", "напред",
    "настави", "nastavi", "nadaljuj", "продолжи", "vazhdo", "συνέχεια",
    "devam et", "devam", "davam et", "жалғастыру", "davom etish", "улантуу",
    "идома додан", "dowam et", "үргэлжлүүлэх", "გაგრძელება", "շարունակել",
    "متابعة", "استمرار", "המשך", "ادامه", "دوام ورکړئ", "berdewam bike", "بەردەوام بە",
    "جاری رکھیں", "जारी रखें", "চালিয়ে যান", "ਜਾਰੀ ਰੱਖੋ", "جاری رکھو",
    "ચાલુ રાખો", "सुरू ठेवा", "தொடரவும்", "కొనసాగించు", "ಮುಂದುವರಿಸಿ", "തുടരുക",
    "ଜାରି ରଖନ୍ତୁ", "অব্যাহত ৰাখক", "जारी राख्नुहोस्", "ඉදිරියට යන්න",
    "fortsätt", "fortsæt", "fortsett", "hald fram", "jatka", "áfram", "halda áfram",
    "halt fram", "jätka", "turpināt", "tęsti", "jarraitu", "lean ar aghaidh",
    "parhau", "lean air adhart", "kenderc'hel", "cuntinuà", "kompli", "weider",
    "trochgean", "daŭrigi", "perge", "endelea", "ቀጥል", "ቀጽል", "sii wad",
    "ci gaba", "tẹ̀síwájú", "gaa n'ihu", "qhubeka", "gaan voort", "tohizo",
    "komeza", "enderera mberi", "jokku", "kontine", "toa so", "ku'ejevy",
    "qatipay", "kontinye", "haere tonu", "hoʻomau", "faaauau", "hoko atu",
    "tomana", "ܐܫܬܘܬܦ", "ⴽⵎⵎⵍ", "ᑲᔪᓯᓗᑎᑦ", "ᎠᏏᏉ"
  ];

  // Daftar multi-bahasa resmi Facebook untuk tombol Login
  const FB_LOGIN_LABELS = [
    "log in", "login", "masuk", "log masuk", "mlebu", "asup", "mag-log in", "mag log in",
    "sulod", "đăng nhập", "เข้าสู่ระบบ", "လော့ဂ်အင်ဝင်ရန်", "အကောင့်ဝင်ရန်", "လော့ဂ်အင်",
    "ចូល", "ເຂົ້າສູ່ລະບົບ", "登录", "登入", "ログイン", "로그인",
    "iniciar sesión", "entrar", "iniciar sessão", "se connecter", "connexion",
    "anmelden", "accedi", "aanmelden", "inloggen", "войти", "вход",
    "увійти", "увайсці", "zaloguj się", "zaloguj", "přihlásit se", "prihlásiť sa",
    "bejelentkezés", "conectează-te", "autentificare", "влизане",
    "пријавите се", "пријави се", "prijavite se", "prijavi se", "prijava",
    "најави се", "hyr", "identifikohu", "σύνδεση", "giriş yap", "daxil ol",
    "кіру", "kirish", "кирүү", "ворид шудан", "girmek", "нэвтрэх",
    "შესვლა", "մուտք գործել", "تسجيل الدخول", "התחבר", "התחברות", "ورود",
    "ننوتل", "têkeve", "چوونەژوورەوە", "لاگ ان کریں", "लॉग इन करें",
    "লগ ইন করুন", "ਲੌਗ ਇਨ ਕਰੋ", "لاگ ان کرو", "લૉગ ઇન કરો", "लॉग इन करा",
    "உள்நுழையவும்", "లాగిన్ చేయండి", "ಲಾಗ್ ಇನ್ ಮಾಡಿ", "ലോഗിൻ ചെയ്യുക",
    "ଲଗ୍ ଇନ୍ କରନ୍ତୁ", "লগ ইন কৰক", "लग इन गर्नुहोस्", "පිවිසෙන්න",
    "logga in", "log på", "log ind", "logg inn", "kirjaudu sisään", "skrá inn",
    "rita inn", "logi sisse", "pieslēgties", "ienākt", "prisijungti",
    "inicia la sessió", "hasi saioa", "logáil isteach", "mewngofnodi",
    "clàraich a-steach", "kevreañ", "cunnettà si", "idħol", "alogen",
    "ynlogge", "ensaluti", "inire", "ingia", "ግባ", "እቶ", "gal",
    "shiga", "wọlé", "banye", "ngena", "meld aan", "hiditra", "injira",
    "pinda", "naat", "dugg", "kɔ mu", "eike", "yaykuy", "konekte",
    "takiuru", "ʻeʻe", "saini i totonu", "hū ki loto", "curu",
    "ܥܘܠ", "ⴽⵛⵎ", "ᐃᓯᕐᓗᑎᑦ", "ᎭᏴᎦ"
  ];

  const FB_CONTINUE_SET = new Set(FB_CONTINUE_LABELS);
  const FB_LOGIN_SET = new Set(FB_LOGIN_LABELS);

  // Pengaturan limit klik per akun
  if (window.__fbContinueUid !== uid) {
    window.__fbContinueUid = uid;
    window.__fbContinueClicked = false;
  }

  // Listener input: me-reset batas 1x jika data dihapus dan dimasukkan kembali
  if (!window.__fbInputResetHandler) {
    window.__fbInputResetHandler = true;
    let dataHadBeenCleared = false;

    document.addEventListener("input", (e) => {
      const target = e.target;
      if (!target || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) return;

      const val = (target.value || "").trim();
      if (val === "") {
        dataHadBeenCleared = true;
      } else {
        if (dataHadBeenCleared || window.__fbContinueClicked) {
          window.__fbContinueClicked = false;
          dataHadBeenCleared = false;
        }
      }
    }, true);
  }

  // Penangkal: Memeriksa apakah halaman aktif berada di dalam daftar blacklist (Captcha, 2FA, Verifikasi Manusia/Profil)
  function isIgnoredContinuePage() {
    const text = (document.body ? (document.body.innerText || "") : "").toLowerCase();

    // Halaman 1: Captcha & Verifikasi Manusia / Profil (Bahasa Inggris & Bahasa Indonesia)
    const isCaptchaPage = 
      text.includes("confirm you're human") ||
      text.includes("confirm you’re human") ||
      text.includes("confirm that you're human") ||
      text.includes("confirm that you’re human") ||
      text.includes("konfirmasikan bahwa anda manusia") ||
      text.includes("konfirmasi bahwa anda manusia") ||
      text.includes("konfirmasikan bahwa anda adalah manusia") ||
      text.includes("konfirmasi bahwa anda adalah manusia") ||
      text.includes("menggunakan profil anda") ||
      text.includes("to use your profile") ||
      text.includes("perlu waktu sekitar 30 detik") ||
      text.includes("takes about 30 seconds") ||
      text.includes("enter the text from the image") ||
      text.includes("masukkan teks dari gambar") ||
      text.includes("hear this code") ||
      text.includes("dengarkan kode ini");

    // Halaman 2: 2FA Authentication App (Bahasa Inggris & Bahasa Indonesia)
    const is2FAPage = 
      text.includes("go to your authentication app") ||
      text.includes("buka aplikasi autentikasi anda") ||
      text.includes("two-factor authentication") ||
      text.includes("autentikasi dua faktor") ||
      text.includes("enter the 6-digit code") ||
      text.includes("masukkan kode 6 digit") ||
      text.includes("google authenticator") ||
      text.includes("duo mobile");

    return isCaptchaPage || is2FAPage;
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

  function matchesContinueAria(ariaVal) {
    if (!ariaVal) return false;
    const norm = ariaVal.trim().toLowerCase();
    if (FB_CONTINUE_SET.has(norm)) return true;
    return FB_CONTINUE_LABELS.some((kw) => norm.startsWith(kw + " "));
  }

  function findContinueButton() {
    // Abaikan total jika berada di halaman blacklist
    if (isIgnoredContinuePage()) return null;

    const roleBtns = Array.from(document.querySelectorAll('div[role="button"][tabindex="0"][aria-label]'));
    const btn = roleBtns.find((el) => isVisible(el) && matchesContinueAria(el.getAttribute("aria-label")));
    if (btn) return btn;

    const ariaElements = Array.from(document.querySelectorAll("[aria-label]"));
    const ariaMatch = ariaElements.find((el) => isVisible(el) && matchesContinueAria(el.getAttribute("aria-label")));
    if (ariaMatch) {
      return ariaMatch.closest('div[role="button"]') || ariaMatch;
    }

    const candidates = Array.from(document.querySelectorAll('div[role="button"], button, span'));
    for (const el of candidates) {
      const text = (el.innerText || "").trim().toLowerCase();
      if (FB_CONTINUE_SET.has(text)) {
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
      if (FB_LOGIN_SET.has(text)) return true;
      return FB_LOGIN_LABELS.some((kw) => kw.length >= 4 && text.includes(kw));
    });
  }

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

    // Skenario B: Tombol Continue / Lanjutkan (Hanya 1x per akun, diabaikan total pada semua halaman blacklist)
    if (!window.__fbContinueClicked && !isIgnoredContinuePage()) {
      const continueBtn = findContinueButton();
      const isBtnDisabled = continueBtn && (continueBtn.disabled || continueBtn.getAttribute("aria-disabled") === "true");
      if (continueBtn && !isBtnDisabled && !visiblePass) {
        window.__fbContinueClicked = true;
        triggerClick(continueBtn);
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