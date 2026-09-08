const IMAP_BRIDGE_URL = "http://127.0.0.1:5000/api/otp";

let activeList = [];
let isMonitoring = false;
let monitorInterval = null;
let savedPasswordVal = "";

const inputCount = document.getElementById("input-count");
const btnGenerate = document.getElementById("btn-generate");
const btnStop = document.getElementById("btn-stop");
const btnInjectEmail = document.getElementById("btn-inject-email");
const btnInjectOtp = document.getElementById("btn-inject-otp");
const btnGrabUsername = document.getElementById("btn-grab-username");
const btnCreateIg = document.getElementById("btn-create-ig");
const emailListBody = document.getElementById("email-list-body");
const monitorStatus = document.getElementById("monitor-status");

const savedEmailsBox = document.getElementById("saved-emails-box");
const savedCountEl = document.getElementById("saved-count");
const btnImportSaved = document.getElementById("btn-import-saved");
const btnCopySaved = document.getElementById("btn-copy-saved");
const btnDeleteSaved = document.getElementById("btn-delete-saved");

const savedUsernamesBox = document.getElementById("saved-usernames-box");
const savedUsernamesCountEl = document.getElementById("saved-usernames-count");
const btnCopyUsernames = document.getElementById("btn-copy-usernames");
const btnDeleteUsernames = document.getElementById("btn-delete-usernames");

const btnTogglePanel = document.getElementById("btn-toggle-panel");

const inputPassword = document.getElementById("input-password");
const btnEditPassword = document.getElementById("btn-edit-password");
const btnSavePassword = document.getElementById("btn-save-password");

if (btnTogglePanel) {
  btnTogglePanel.onclick = async () => {
    const currentWin = await chrome.windows.getCurrent();
    if (currentWin?.id) {
      await chrome.sidePanel.open({ windowId: currentWin.id });
      window.close();
    }
  };
}

// Membaca daftar akun dari file akun.txt di folder ekstensi
async function loadAccountsFile() {
  try {
    const res = await fetch(chrome.runtime.getURL("akun.txt"));
    if (!res.ok) throw new Error("Gagal memuat akun.txt");
    const text = await res.text();
    const accounts = [];
    const lines = text.split("\n");

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const fullEmail = parts[0].trim();
        const appPassword = parts.slice(1).join("").trim();

        if (fullEmail.includes("@")) {
          const atIndex = fullEmail.lastIndexOf("@");
          const username = fullEmail.substring(0, atIndex);
          const domain = fullEmail.substring(atIndex + 1);

          accounts.push({
            mainEmail: fullEmail,
            username: username,
            domain: domain,
            appPassword: appPassword
          });
        }
      }
    }
    return accounts;
  } catch (e) {
    console.error("Error membaca akun.txt:", e);
    return [];
  }
}

function renderTable() {
  if (activeList.length === 0) {
    emailListBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #777; padding: 20px;">Belum ada email yang di-generate.</td></tr>`;
    return;
  }

  emailListBody.innerHTML = "";
  activeList.forEach((item, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="email-col">${item.email}</td>
      <td class="otp-col" id="otp-${index}">${item.otp ? item.otp : '<span style="color: #777; font-weight: normal; font-size: 11px;">Menunggu...</span>'}</td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn-save" data-index="${index}">Simpan</button>
          <button class="btn-copy" data-email="${item.email}">Copy</button>
        </div>
      </td>
    `;
    emailListBody.appendChild(tr);
  });

  document.querySelectorAll(".btn-save").forEach((btn) => {
    btn.onclick = (e) => {
      const idx = e.currentTarget.getAttribute("data-index");
      saveSingleEmail(activeList[idx].email, e.currentTarget);
    };
  });

  document.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.onclick = async (e) => {
      const targetBtn = e.currentTarget;
      const email = targetBtn.getAttribute("data-email");
      if (!email) return;

      await navigator.clipboard.writeText(email).catch(() => {});
      targetBtn.innerText = "OK!";
      setTimeout(() => {
        targetBtn.innerText = "Copy";
      }, 1000);
    };
  });
}

function loadSavedPassword() {
  chrome.storage.local.get(["saved_user_password"], (result) => {
    savedPasswordVal = result.saved_user_password || "";
    if (inputPassword) {
      inputPassword.value = savedPasswordVal;
      inputPassword.readOnly = true;
    }
  });
}

if (btnEditPassword && btnSavePassword && inputPassword) {
  btnEditPassword.onclick = () => {
    inputPassword.readOnly = false;
    inputPassword.focus();
    btnEditPassword.style.display = "none";
    btnSavePassword.style.display = "inline-block";
  };

  btnSavePassword.onclick = () => {
    savedPasswordVal = inputPassword.value;
    chrome.storage.local.set({ saved_user_password: savedPasswordVal }, () => {
      inputPassword.readOnly = true;
      btnSavePassword.style.display = "none";
      btnEditPassword.style.display = "inline-block";
    });
  };
}

// Injeksi Form Email & Sandi Pada Tab
function injectEmailContent(emailVal, passwordVal) {
  const setNativeValue = (element, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const targetEl = 
    document.querySelector('input[name="email"]') ||
    document.querySelector('input[autocomplete*="username webauthn"]') ||
    document.querySelector('input[type="email"]') ||
    document.querySelector('input[aria-label="Email" i]') ||
    document.querySelector('input[inputmode="email"]') ||
    document.querySelector('input[autocomplete*="username" i]') ||
    document.querySelector('input[aria-label="Mobile Number"]') ||
    document.querySelector('input[aria-label*="Mobile" i]') ||
    document.querySelector('input[type="tel"]') ||
    document.querySelector('input[name="reg_email__"]');

  let injected = false;
  if (targetEl) {
    targetEl.focus();
    setNativeValue(targetEl, emailVal);
    injected = true;
  }

  const passwordEl = 
    document.querySelector('input[name="password"]') ||
    document.querySelector('input[type="password"]');

  if (passwordEl && passwordVal) {
    passwordEl.focus();
    setNativeValue(passwordEl, passwordVal);

    const loginBtn = 
      document.querySelector('div[role="button"][aria-label="Log in"]') ||
      document.querySelector('button[type="submit"]');

    if (loginBtn) {
      loginBtn.click();
    }
  }

  return injected;
}

// Injeksi Form OTP Pada Tab
function injectOtpContent(otpVal) {
  const setNativeValue = (element, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const targetEl = 
    document.querySelector('input[autocomplete="one-time-code"]') ||
    document.querySelector('input[aria-label="Confirmation code"]') ||
    document.querySelector('input[aria-label*="Confirmation" i]') ||
    document.querySelector('input[aria-label*="kode" i]') ||
    document.querySelector('input[inputmode="numeric"]') ||
    document.querySelector('input[maxlength="6"]');

  if (targetEl) {
    targetEl.focus();
    setNativeValue(targetEl, otpVal);
    return true;
  }
  return false;
}

// Injeksi Penuh Pendaftaran Akun Instagram (Formulir Lengkap)
async function fillCreateIgFormContent(emailVal, passwordVal) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  const fn = [
    "Emma", "Olivia", "Sophia", "Ava", "Isabella", "Mia", "Harper", "Evelyn", "Emily", "Ella",
    "Elizabeth", "Camila", "Luna", "Sofia", "Avery", "Mila", "Aria", "Scarlett", "Chloe", "Layla",
    "Riley", "Grace", "Lily", "Paisley", "Audrey"
  ];
  const ln = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
    "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin"
  ];
  const m = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const s = (t) => new Promise((res) => setTimeout(res, t));

  const f = (e) => {
    if (!e) return;
    let t = e;
    for (let i = 0; i < 3 && t; i++) {
      const k = Object.keys(t).find(
        (x) => x.startsWith("__reactProps$") || x.startsWith("__reactEventHandlers$")
      );
      if (k && t[k]?.onClick) {
        try {
          t[k].onClick({ preventDefault: () => {}, stopPropagation: () => {}, target: e, currentTarget: t });
        } catch (err) {}
      }
      ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((ev) => {
        try {
          t.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, composed: true, view: window }));
        } catch (err) {}
      });
      t = t.parentElement;
    }
    try {
      e.click();
    } catch (err) {}
  };

  const fill = (el, val) => {
    if (!el) return;
    try {
      el.focus();
      if (typeof el.select === "function") el.select();
      try {
        document.execCommand("selectAll", false, null);
      } catch (err) {}
      let ok = false;
      try {
        ok = document.execCommand("insertText", false, val);
      } catch (err) {}
      if (!ok || el.value !== val) {
        const proto = Object.getPrototypeOf(el);
        const st =
          Object.getOwnPropertyDescriptor(proto, "value")?.set ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (st) {
          st.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    } catch (err) {}
  };

  const fName = r(fn);
  const lName = r(ln);
  const fullName = `${fName} ${lName}`;
  const rndNum = Math.floor(10000 + Math.random() * 90000);
  const rndHex = Math.random().toString(36).substring(2, 5);
  const usr = `${fName.toLowerCase()}_${lName.toLowerCase()}_${rndHex}${rndNum}`;

  const inps = Array.from(document.querySelectorAll("input")).filter((i) => {
    const t = (i.type || "text").toLowerCase();
    return !["hidden", "submit", "button", "checkbox", "radio"].includes(t);
  });

  const elPw = inps.find((i) => i.type === "password") || inps[1];
  const elUn =
    inps.find(
      (i) =>
        i.type === "search" ||
        /username/i.test(i.name || i.placeholder || i.getAttribute("aria-label") || "")
    ) || inps[inps.length - 1];
  const rem = inps.filter((i) => i !== elPw && i !== elUn);
  const elEm =
    rem.find((i) =>
      /mobile|email|phone/i.test(i.name || i.placeholder || i.getAttribute("aria-label") || "")
    ) ||
    rem[0] ||
    inps[0];
  const elNm = rem.find((i) => i !== elEm) || rem[1] || inps[2];

  fill(elEm, emailVal);
  if (passwordVal) {
    fill(elPw, passwordVal);
  }
  fill(elNm, fullName);
  fill(elUn, usr);

  const getBox = (name) => {
    const byAria = document.querySelector(`[aria-label="Select ${name}" i], [aria-label="${name}" i]`);
    if (byAria) return byAria;
    const leaf = Array.from(document.querySelectorAll("div, span")).find(
      (e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === name.toLowerCase()
    );
    return leaf ? leaf.closest('[role="combobox"], [role="button"]') || leaf.parentElement : null;
  };

  const bMo = getBox("month");
  const bDay = getBox("day") || bMo?.nextElementSibling;
  const bYr = getBox("year") || bDay?.nextElementSibling || bMo?.parentElement?.children[2];

  if (bMo) {
    f(bMo);
    await s(250);
    const tMo = r(m);
    const optsMo = Array.from(
      document.querySelectorAll(
        '[role="option"], [role="listbox"] div, [role="listbox"] span, [role="menu"] div, li, div, span'
      )
    );
    const optMo = optsMo.find(
      (e) =>
        e.children.length === 0 &&
        e.offsetParent !== null &&
        (e.textContent.trim().toLowerCase() === tMo.toLowerCase() ||
          e.textContent.trim().toLowerCase() === tMo.slice(0, 3).toLowerCase())
    );
    optMo ? f(optMo) : f(bMo);
    await s(200);
  }

  if (bDay) {
    f(bDay);
    await s(250);
    const rDay = String(Math.floor(1 + Math.random() * 28));
    const optsDay = Array.from(
      document.querySelectorAll(
        '[role="option"], [role="listbox"] div, [role="listbox"] span, [role="menu"] div, li, div, span'
      )
    );
    const dayMatches = optsDay.filter(
      (e) =>
        e.children.length === 0 &&
        e.offsetParent !== null &&
        /^(?:[1-9]|[12]\d|28)$/.test(e.textContent.trim())
    );
    const optDay = dayMatches.find((e) => e.textContent.trim() === rDay) || dayMatches[0];
    optDay ? f(optDay) : f(bDay);
    await s(200);
  }

  if (bYr) {
    f(bYr);
    await s(250);
    const rYr = String(Math.floor(1995 + Math.random() * 8));
    const optsYr = Array.from(
      document.querySelectorAll(
        '[role="option"], [role="listbox"] div, [role="listbox"] span, [role="menu"] div, li, div, span'
      )
    );
    const yrMatches = optsYr.filter(
      (e) =>
        e.children.length === 0 &&
        e.offsetParent !== null &&
        /^(?:199\d|200[0-5])$/.test(e.textContent.trim())
    );
    const optYr = yrMatches.find((e) => e.textContent.trim() === rYr) || yrMatches[0];
    optYr ? f(optYr) : f(bYr);
    await s(200);
  }

  return { email: emailVal, fullName, username: usr };
}

// Ekstraksi Username Instagram Pada Tab DOM
function extractUsernameContent() {
  const anchor = [...document.querySelectorAll('a[href^="/"]')].find((a) =>
    a.querySelector('img[alt*="profile picture" i], img[alt*="foto profil" i]')
  );
  if (anchor) {
    const href = anchor.getAttribute("href");
    if (href) {
      return href.replaceAll("/", "").trim();
    }
  }
  return null;
}

// Eksekusi Batch Injeksi Email dan Sandi ke Semua Tab
btnInjectEmail.onclick = async () => {
  if (activeList.length === 0) {
    alert("Belum ada email yang di-generate atau di-import.");
    return;
  }

  const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
  let targetTabs = currentWindowTabs.filter(
    (t) =>
      t.id &&
      t.url &&
      (t.url.includes("meta.") || t.url.includes("instagram.com") || t.url.includes("facebook.com")) &&
      !t.url.startsWith("chrome://") &&
      !t.url.startsWith("edge://")
  );

  if (targetTabs.length === 0) {
    targetTabs = currentWindowTabs.filter(
      (t) => t.id && t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))
    );
  }

  if (targetTabs.length === 0) {
    alert("Tidak ditemukan tab target pendaftaran pada jendela browser ini.");
    return;
  }

  const storage = await chrome.storage.local.get(["tabEmailMap"]);
  let tabEmailMap = storage.tabEmailMap || {};

  let injectedCount = 0;
  const executionPromises = [];

  for (let i = 0; i < targetTabs.length; i++) {
    if (i >= activeList.length) break;

    const tab = targetTabs[i];
    const targetEmail = activeList[i].email;
    tabEmailMap[tab.id] = targetEmail;

    const p = chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: injectEmailContent,
        args: [targetEmail, savedPasswordVal]
      })
      .then((results) => {
        if (results?.[0]?.result) injectedCount++;
      })
      .catch((err) => console.warn(`Gagal inject ke Tab ${tab.id}:`, err));

    executionPromises.push(p);
  }

  await Promise.all(executionPromises);
  await chrome.storage.local.set({ tabEmailMap });

  monitorStatus.innerText = `Selesai: ${injectedCount} tab diisi email & sandi.`;
  monitorStatus.style.color = "#42b72a";
};

// Eksekusi Tombol CREATE IG (Formulir Penuh)
if (btnCreateIg) {
  btnCreateIg.onclick = async () => {
    if (activeList.length === 0) {
      alert("Belum ada email yang di-generate atau di-import.");
      return;
    }

    const storage = await chrome.storage.local.get(["saved_user_password", "tabEmailMap"]);
    const currentPass = storage.saved_user_password || savedPasswordVal || "";

    const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
    let targetTabs = currentWindowTabs.filter(
      (t) =>
        t.id &&
        t.url &&
        (t.url.includes("meta.") || t.url.includes("instagram.com") || t.url.includes("facebook.com")) &&
        !t.url.startsWith("chrome://") &&
        !t.url.startsWith("edge://")
    );

    if (targetTabs.length === 0) {
      targetTabs = currentWindowTabs.filter(
        (t) => t.id && t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))
      );
    }

    if (targetTabs.length === 0) {
      alert("Tidak ditemukan tab target pendaftaran pada jendela browser ini.");
      return;
    }

    let tabEmailMap = storage.tabEmailMap || {};
    let createdCount = 0;
    const executionPromises = [];

    for (let i = 0; i < targetTabs.length; i++) {
      if (i >= activeList.length) break;

      const tab = targetTabs[i];
      const targetEmail = activeList[i].email;
      tabEmailMap[tab.id] = targetEmail;

      const p = chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: fillCreateIgFormContent,
          args: [targetEmail, currentPass]
        })
        .then((results) => {
          if (results?.[0]?.result) createdCount++;
        })
        .catch((err) => console.warn(`Gagal Create IG di Tab ${tab.id}:`, err));

      executionPromises.push(p);
    }

    await Promise.all(executionPromises);
    await chrome.storage.local.set({ tabEmailMap });

    monitorStatus.innerText = `Selesai: ${createdCount} tab form IG terisi.`;
    monitorStatus.style.color = "#42b72a";
  };
}

// Eksekusi Batch Injeksi OTP ke Semua Tab Sesuai Mapping
btnInjectOtp.onclick = async () => {
  if (activeList.length === 0) {
    alert("Belum ada email di daftar pantauan.");
    return;
  }

  const emailOtpMap = {};
  activeList.forEach((item) => {
    if (item.email && item.otp) {
      emailOtpMap[item.email.toLowerCase()] = item.otp;
    }
  });

  const storage = await chrome.storage.local.get(["tabEmailMap"]);
  const tabEmailMap = storage.tabEmailMap || {};
  const tabIds = Object.keys(tabEmailMap);

  let injectedCount = 0;
  const executionPromises = [];

  if (tabIds.length > 0) {
    for (const tabIdStr of tabIds) {
      const tabId = parseInt(tabIdStr, 10);
      const mappedEmail = tabEmailMap[tabId];
      const otpCode = mappedEmail ? emailOtpMap[mappedEmail.toLowerCase()] : null;

      if (otpCode) {
        const p = chrome.scripting
          .executeScript({
            target: { tabId: tabId },
            func: injectOtpContent,
            args: [otpCode]
          })
          .then((results) => {
            if (results?.[0]?.result) injectedCount++;
          })
          .catch((err) => console.warn(`Gagal inject OTP ke Tab ${tabId}:`, err));

        executionPromises.push(p);
      }
    }
  } else {
    const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
    const targetTabs = currentWindowTabs.filter((t) => t.id && t.url && t.url.startsWith("http"));

    for (let i = 0; i < targetTabs.length && i < activeList.length; i++) {
      const otpCode = activeList[i].otp;
      if (otpCode) {
        const tab = targetTabs[i];
        const p = chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: injectOtpContent,
            args: [otpCode]
          })
          .then((results) => {
            if (results?.[0]?.result) injectedCount++;
          })
          .catch(() => {});

        executionPromises.push(p);
      }
    }
  }

  await Promise.all(executionPromises);
  monitorStatus.innerText = `Selesai: ${injectedCount} tab diisi OTP.`;
  monitorStatus.style.color = "#42b72a";
};

// Eksekusi Grab Username Instagram + Email Mapping ke Penampungan
if (btnGrabUsername) {
  btnGrabUsername.onclick = async () => {
    const storage = await chrome.storage.local.get(["tabEmailMap", "saved_ig_usernames"]);
    const tabEmailMap = storage.tabEmailMap || {};
    let savedUsernames = storage.saved_ig_usernames || [];

    const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
    let targetTabs = currentWindowTabs.filter(
      (t) =>
        t.id &&
        t.url &&
        (t.url.includes("instagram.com") || t.url.includes("meta.") || t.url.includes("facebook.com")) &&
        !t.url.startsWith("chrome://") &&
        !t.url.startsWith("edge://")
    );

    if (targetTabs.length === 0) {
      targetTabs = currentWindowTabs.filter(
        (t) => t.id && t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))
      );
    }

    if (targetTabs.length === 0) {
      alert("Tidak ditemukan tab target pada jendela browser ini.");
      return;
    }

    let grabbedCount = 0;
    const executionPromises = [];

    for (const tab of targetTabs) {
      const mappedEmail = tabEmailMap[tab.id] || "tanpa_email";

      const p = chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: extractUsernameContent
        })
        .then((results) => {
          const username = results?.[0]?.result;
          if (username) {
            const entry = `${username} ${mappedEmail}`;
            if (!savedUsernames.includes(entry)) {
              savedUsernames.push(entry);
            }
            grabbedCount++;
          }
        })
        .catch((err) => console.warn(`Gagal grab username dari Tab ${tab.id}:`, err));

      executionPromises.push(p);
    }

    await Promise.all(executionPromises);
    await chrome.storage.local.set({ saved_ig_usernames: savedUsernames });
    loadSavedUsernames();

    monitorStatus.innerText = `Selesai: ${grabbedCount} username ditarik.`;
    monitorStatus.style.color = "#42b72a";
  };
}

// Polling OTP via IMAP Bridge Batch (Serempak dalam 1 permintaan)
async function pollEmails() {
  if (!isMonitoring || activeList.length === 0) return;

  // Kelompokkan target berdasarkan akun utama (biasanya 1 akun Gmail utama)
  const groups = {};
  activeList.forEach((item, index) => {
    const key = `${item.mainEmail}:::${item.appPassword}`;
    if (!groups[key]) {
      groups[key] = {
        mainEmail: item.mainEmail,
        appPassword: item.appPassword,
        items: []
      };
    }
    groups[key].items.push({
      email: item.email,
      index: index
    });
  });

  for (const key in groups) {
    if (!isMonitoring) break;
    const group = groups[key];

    try {
      const res = await fetch("http://127.0.0.1:5000/api/otp/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          main: group.mainEmail,
          pass: group.appPassword,
          targets: group.items.map((it) => it.email)
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.results) {
          group.items.forEach((it) => {
            const target = activeList[it.index];
            const found = data.results[it.email.toLowerCase()];
            if (found && found.otp) {
              if (!target.otp || found.msg_id !== target.lastMessageId) {
                target.otp = found.otp;
                target.lastMessageId = found.msg_id;

                const cell = document.getElementById(`otp-${it.index}`);
                if (cell) {
                  cell.innerHTML = `${found.otp} <span style="font-size: 10px; color: #1877f2; font-weight: normal;">(Baru)</span>`;
                }
              }
            }
          });
        }
      }
    } catch (e) {}
  }
}

function startMonitoring() {
  isMonitoring = true;
  btnStop.style.display = "inline-block";
  btnGenerate.disabled = true;
  monitorStatus.innerText = "Memantau...";
  monitorStatus.style.color = "#42b72a";

  pollEmails();
  monitorInterval = setInterval(pollEmails, 3000);
}

function stopMonitoring() {
  isMonitoring = false;
  clearInterval(monitorInterval);
  btnStop.style.display = "none";
  btnGenerate.disabled = false;
  monitorStatus.innerText = "Dihentikan";
  monitorStatus.style.color = "#fa3e3e";
}

function loadSavedEmails() {
  chrome.storage.local.get(["saved_temp_emails"], (result) => {
    const list = result.saved_temp_emails || [];
    if (savedEmailsBox) savedEmailsBox.value = list.join("\n");
    if (savedCountEl) savedCountEl.innerText = list.length;
  });
}

function loadSavedUsernames() {
  chrome.storage.local.get(["saved_ig_usernames"], (result) => {
    const list = result.saved_ig_usernames || [];
    if (savedUsernamesBox) savedUsernamesBox.value = list.join("\n");
    if (savedUsernamesCountEl) savedUsernamesCountEl.innerText = list.length;
  });
}

function saveSingleEmail(email, buttonEl) {
  chrome.storage.local.get(["saved_temp_emails"], (result) => {
    const list = result.saved_temp_emails || [];
    if (!list.includes(email)) {
      list.push(email);
      chrome.storage.local.set({ saved_temp_emails: list }, () => {
        loadSavedEmails();
        if (buttonEl) {
          buttonEl.innerText = "Tersimpan";
          buttonEl.style.background = "#42b72a";
          setTimeout(() => {
            buttonEl.innerText = "Simpan";
            buttonEl.style.background = "#2e89ff";
          }, 1200);
        }
      });
    } else if (buttonEl) {
      buttonEl.innerText = "Sudah Ada";
      setTimeout(() => (buttonEl.innerText = "Simpan"), 1000);
    }
  });
}

// Generator Gmail Sub-Addressing Unik dan Anti-Duplikat
btnGenerate.onclick = async () => {
  const count = parseInt(inputCount.value, 10);
  if (isNaN(count) || count <= 0) return;

  const accounts = await loadAccountsFile();
  if (accounts.length === 0) {
    alert("File akun.txt kosong atau belum diisi dengan benar.");
    return;
  }

  const storage = await chrome.storage.local.get(["used_sub_emails"]);
  const usedEmails = new Set(storage.used_sub_emails || []);

  stopMonitoring();
  activeList = [];

  for (let i = 0; i < count; i++) {
    const acc = accounts[Math.floor(Math.random() * accounts.length)];

    let currentNumber = 1;
    let candidateEmail = `${acc.username}+${currentNumber}@${acc.domain}`;

    while (usedEmails.has(candidateEmail)) {
      currentNumber++;
      candidateEmail = `${acc.username}+${currentNumber}@${acc.domain}`;
    }

    usedEmails.add(candidateEmail);

    activeList.push({
      email: candidateEmail,
      mainEmail: acc.mainEmail,
      appPassword: acc.appPassword,
      otp: null,
      lastMessageId: null,
      isInitialized: false
    });
  }

  await chrome.storage.local.set({ used_sub_emails: Array.from(usedEmails) });

  renderTable();
  startMonitoring();
};

btnStop.onclick = () => {
  stopMonitoring();
};

btnImportSaved.onclick = async () => {
  const textContent = savedEmailsBox.value;
  const emails = textContent
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));

  if (emails.length === 0) {
    alert("Kotak penampungan tidak memiliki email yang valid.");
    return;
  }

  const accounts = await loadAccountsFile();

  stopMonitoring();
  activeList = emails.map((email) => {
    const atIndex = email.lastIndexOf("@");
    const domain = email.substring(atIndex + 1);
    const userPart = email.substring(0, atIndex);
    const baseUsername = userPart.split("+")[0];

    const matched =
      accounts.find(
        (a) => a.username.toLowerCase() === baseUsername.toLowerCase() && a.domain.toLowerCase() === domain.toLowerCase()
      ) || accounts[0] || {};

    return {
      email: email,
      mainEmail: matched.mainEmail || email,
      appPassword: matched.appPassword || "",
      otp: null,
      lastMessageId: null,
      isInitialized: false
    };
  });

  renderTable();
  startMonitoring();
};

btnCopySaved.onclick = async () => {
  const content = savedEmailsBox.value.trim();
  if (!content) return;
  await navigator.clipboard.writeText(content).catch(() => {});
  const originalText = btnCopySaved.innerText;
  btnCopySaved.innerText = "Tersalin!";
  setTimeout(() => {
    btnCopySaved.innerText = originalText;
  }, 1200);
};

btnDeleteSaved.onclick = () => {
  if (confirm("Hapus semua email di penampungan?")) {
    chrome.storage.local.set({ saved_temp_emails: [] }, () => {
      loadSavedEmails();
    });
  }
};

if (savedEmailsBox) {
  savedEmailsBox.onchange = () => {
    const lines = savedEmailsBox.value
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    chrome.storage.local.set({ saved_temp_emails: lines }, () => {
      if (savedCountEl) savedCountEl.innerText = lines.length;
    });
  };
}

if (btnCopyUsernames) {
  btnCopyUsernames.onclick = async () => {
    const content = savedUsernamesBox.value.trim();
    if (!content) return;
    await navigator.clipboard.writeText(content).catch(() => {});
    const originalText = btnCopyUsernames.innerText;
    btnCopyUsernames.innerText = "Tersalin!";
    setTimeout(() => {
      btnCopyUsernames.innerText = originalText;
    }, 1200);
  };
}

if (btnDeleteUsernames) {
  btnDeleteUsernames.onclick = () => {
    if (confirm("Hapus semua daftar username + email tersimpan?")) {
      chrome.storage.local.set({ saved_ig_usernames: [] }, () => {
        loadSavedUsernames();
      });
    }
  };
}

if (savedUsernamesBox) {
  savedUsernamesBox.onchange = () => {
    const lines = savedUsernamesBox.value
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    chrome.storage.local.set({ saved_ig_usernames: lines }, () => {
      if (savedUsernamesCountEl) savedUsernamesCountEl.innerText = lines.length;
    });
  };
}

document.addEventListener("DOMContentLoaded", () => {
  loadSavedEmails();
  loadSavedUsernames();
  loadSavedPassword();
});