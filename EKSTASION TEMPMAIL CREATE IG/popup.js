// Konfigurasi Web Provider Sesuai API
const PROVIDERS = {
  user_web: {
    name: "Server Utama",
    domains: ["cuontol.my.id", "rufff3.my.id"]
  },
  mnx_family: {
    name: "MNX Family Mailer",
    domains: [
      "fleshbit.net", "burnbit.net", "ingrich.com",
      "mxdus.com", "ijobns.com", "mnx-family.com", "pmheating.com",
      "happy-talking.org", "sprytny.edu.pl", "mentalnozdravlje.edu.rs",
      "yiqiconsult.com", "pagonpae.com", "joggingplouguerneau.org",
      "grbto.net", "shakarianlawgroup.com", "sullivanplastic.com", "wifespictures.com",
      "gwenbd94.com", "nativepillars.com"
    ]
  },
  orify_mail: {
    name: "OrifyMail",
    domains: [
      "antdev.org", "epmtyfl.me", "sptech.io.vn", "stackfl.site", "taifsoft.com"
    ]
  },
  instant_temp: {
    name: "Instant Temp Email",
    domains: ["fpklm.com"]
  }
};

const PROVIDER_KEYS = ["user_web", "mnx_family", "orify_mail", "instant_temp"];

let activeList = [];
let isMonitoring = false;
let monitorInterval = null;
let savedPasswordVal = "";

const selectProvider = document.getElementById("select-provider");
const inputCount = document.getElementById("input-count");
const btnGenerate = document.getElementById("btn-generate");
const btnStop = document.getElementById("btn-stop");
const btnInjectEmail = document.getElementById("btn-inject-email");
const btnInjectOtp = document.getElementById("btn-inject-otp");
const btnGrabUsername = document.getElementById("btn-grab-username");
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

function getRandomString(length = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function detectProvider(domain) {
  const cleanDomain = (domain || "").toLowerCase().trim();
  for (const key of PROVIDER_KEYS) {
    if (PROVIDERS[key].domains.includes(cleanDomain)) {
      return key;
    }
  }
  return "user_web";
}

async function createInstantTempEmailWithRetry(retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let res = await fetch("https://instanttempemail.com/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" }
      });

      if (!res.ok) {
        res = await fetch("https://instanttempemail.com/api/create", {
          headers: { "Accept": "application/json" }
        });
      }

      if (res.ok) {
        const data = await res.json();
        if (data && data.address && data.token) {
          return {
            address: data.address,
            token: data.token
          };
        }
      }
    } catch (err) {
      console.warn(`Upaya pembuatan email ke-${attempt + 1} gagal:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}

async function generateSingleEmail(providerMode) {
  let targetKey = providerMode;
  if (targetKey === "random" || !PROVIDERS[targetKey]) {
    targetKey = PROVIDER_KEYS[Math.floor(Math.random() * PROVIDER_KEYS.length)];
  }

  if (targetKey === "instant_temp") {
    const createdData = await createInstantTempEmailWithRetry();
    if (createdData) {
      const storageRes = await chrome.storage.local.get(["email_tokens"]);
      const tokens = storageRes.email_tokens || {};
      tokens[createdData.address.toLowerCase()] = createdData.token;
      await chrome.storage.local.set({ email_tokens: tokens });

      return {
        email: createdData.address,
        token: createdData.token,
        providerKey: "instant_temp"
      };
    }
    return null;
  }

  const provider = PROVIDERS[targetKey];
  const user = getRandomString(Math.floor(Math.random() * 4) + 7);
  const domain = provider.domains[Math.floor(Math.random() * provider.domains.length)];

  return {
    email: `${user}@${domain}`,
    token: null,
    providerKey: targetKey
  };
}

function extractOTP(item) {
  if (!item) return null;
  const content = `${item.subject || ""} ${item.body_text || ""} ${item.body_html || ""} ${item.html || ""} ${item.htmlContent || ""} ${item.textContent || ""} ${item.body || ""} ${item.text || ""} ${item.message || ""}`;

  const metaMatch = content.match(/Confirmation code[\s\S]*?(\d{6,8})/i);
  if (metaMatch) return metaMatch[1];

  const htmlBlockMatch = content.match(/letter-spacing:\s*2px;[^>]*>\s*(\d{6,8})\s*</i);
  if (htmlBlockMatch) return htmlBlockMatch[1];

  const plainText = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const cleanMetaMatch = plainText.match(/Confirmation code\s*(\d{6,8})/i);
  if (cleanMetaMatch) return cleanMetaMatch[1];

  const digitMatch = plainText.match(/\b\d{6}\b/);
  return digitMatch ? digitMatch[0] : null;
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
    document.querySelector('input[type="email"]') ||
    document.querySelector('input[aria-label="Email" i]') ||
    document.querySelector('input[inputmode="email"]') ||
    document.querySelector('input[autocomplete="username"]') ||
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

btnInjectEmail.onclick = async () => {
  if (activeList.length === 0) {
    alert("Belum ada email yang di-generate atau di-import.");
    return;
  }

  const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
  let targetTabs = currentWindowTabs.filter(t => 
    t.id && t.url && 
    (t.url.includes("meta.") || t.url.includes("instagram.com") || t.url.includes("facebook.com")) && 
    !t.url.startsWith("chrome://") && !t.url.startsWith("edge://")
  );

  if (targetTabs.length === 0) {
    targetTabs = currentWindowTabs.filter(t => t.id && t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")));
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

    const p = chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectEmailContent,
      args: [targetEmail, savedPasswordVal]
    }).then(results => {
      if (results?.[0]?.result) injectedCount++;
    }).catch(err => console.warn(`Gagal inject ke Tab ${tab.id}:`, err));

    executionPromises.push(p);
  }

  await Promise.all(executionPromises);
  await chrome.storage.local.set({ tabEmailMap });

  monitorStatus.innerText = `Selesai: ${injectedCount} tab diisi email & sandi.`;
  monitorStatus.style.color = "#42b72a";
};

btnInjectOtp.onclick = async () => {
  if (activeList.length === 0) {
    alert("Belum ada email di daftar pantauan.");
    return;
  }

  const emailOtpMap = {};
  activeList.forEach(item => {
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
        const p = chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: injectOtpContent,
          args: [otpCode]
        }).then(results => {
          if (results?.[0]?.result) injectedCount++;
        }).catch(err => console.warn(`Gagal inject OTP ke Tab ${tabId}:`, err));

        executionPromises.push(p);
      }
    }
  } else {
    const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
    const targetTabs = currentWindowTabs.filter(t => t.id && t.url && t.url.startsWith("http"));

    for (let i = 0; i < targetTabs.length && i < activeList.length; i++) {
      const otpCode = activeList[i].otp;
      if (otpCode) {
        const tab = targetTabs[i];
        const p = chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectOtpContent,
          args: [otpCode]
        }).then(results => {
          if (results?.[0]?.result) injectedCount++;
        }).catch(() => {});

        executionPromises.push(p);
      }
    }
  }

  await Promise.all(executionPromises);
  monitorStatus.innerText = `Selesai: ${injectedCount} tab diisi OTP.`;
  monitorStatus.style.color = "#42b72a";
};

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
      targetTabs = currentWindowTabs.filter((t) => t.id && t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")));
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

async function pollTargetMessages(target) {
  const email = target.email;
  const domain = email.split("@")[1] || "";
  const providerKey = target.providerKey || detectProvider(domain);

  // Web 1: Server Utama RufFF3
  if (providerKey === "user_web") {
    try {
      const res = await fetch(`https://rufff3.my.id/api/emails/${encodeURIComponent(email)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[0];
        const latestId = Number(latest.id) || 0;
        if (!target.isInitialized) {
          target.lastMessageId = latestId;
          target.isInitialized = true;
          return null;
        }
        if (latestId > (target.lastMessageId || 0)) {
          const otpFound = extractOTP(latest);
          if (otpFound) {
            target.lastMessageId = latestId;
            return otpFound;
          }
        }
      } else if (!target.isInitialized) {
        target.lastMessageId = 0;
        target.isInitialized = true;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Web 2: MNX Family Mailer
  if (providerKey === "mnx_family") {
    try {
      const res = await fetch(`https://mailer.mnx-family.com/pesan?email=${encodeURIComponent(email)}`);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.status && json.data) {
        const messages = Array.isArray(json.data) ? json.data : Object.values(json.data);
        if (messages.length > 0) {
          const latest = messages[0];
          const latestId = Number(latest.uid) || Number(latest.msgno) || Number(latest.udate) || 1;
          if (latestId > (target.lastMessageId || 0)) {
            const otpFound = extractOTP(latest);
            if (otpFound) {
              target.lastMessageId = latestId;
              return otpFound;
            }
          }
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Web 3: OrifyMail
  if (providerKey === "orify_mail") {
    try {
      const res = await fetch(`https://orifymail.com/api/email/${encodeURIComponent(email)}`);
      if (!res.ok) return null;
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        const latest = list[0];
        const latestId = latest.id;
        if (latestId !== target.lastMessageId) {
          try {
            const detailRes = await fetch(`https://orifymail.com/api/inbox/${encodeURIComponent(latestId)}`);
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              const otpFound = extractOTP(detailData);
              if (otpFound) {
                target.lastMessageId = latestId;
                return otpFound;
              }
            }
          } catch (e) {}
          const fallbackOtp = extractOTP(latest);
          if (fallbackOtp) {
            target.lastMessageId = latestId;
            return fallbackOtp;
          }
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Web 4: Instant Temp Email (instanttempemail.com)
  if (providerKey === "instant_temp") {
    let token = target.token;
    if (!token) {
      const storage = await chrome.storage.local.get(["email_tokens"]);
      token = (storage.email_tokens || {})[email.toLowerCase()];
      if (token) target.token = token;
    }
    if (!token) return null;

    try {
      const res = await fetch(`https://instanttempemail.com/api/inbox/${encodeURIComponent(token)}`, {
        headers: { "Accept": "application/json" }
      });

      if (res.status === 429) {
        monitorStatus.innerText = "Rate limited oleh server tempmail...";
        monitorStatus.style.color = "#fa3e3e";
        return null;
      }

      if (!res.ok) return null;
      const data = await res.json();

      let messages = [];
      if (Array.isArray(data)) {
        messages = data;
      } else if (data && typeof data === "object") {
        messages = data.emails || data.messages || data.data || data.inbox || [];
        if (!Array.isArray(messages)) {
          messages = Object.values(messages);
        }
      }

      if (messages.length > 0) {
        const latest = messages[0];
        const latestId = latest.id;
        if (!latestId) return null;

        if (!target.isInitialized) {
          target.lastMessageId = latestId;
          target.isInitialized = true;
          return null;
        }

        if (latestId !== target.lastMessageId) {
          let otpFound = extractOTP(latest);

          if (!otpFound) {
            try {
              const readRes = await fetch(`https://instanttempemail.com/api/inbox/${encodeURIComponent(token)}/read/${encodeURIComponent(latestId)}`, {
                headers: { "Accept": "application/json" }
              });
              if (readRes.ok) {
                const readData = await readRes.json();
                otpFound = extractOTP(readData);
              }
            } catch (e) {}
          }

          if (otpFound) {
            target.lastMessageId = latestId;
            return otpFound;
          }
        }
      } else if (!target.isInitialized) {
        target.lastMessageId = 0;
        target.isInitialized = true;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  return null;
}

async function pollEmails() {
  if (!isMonitoring || activeList.length === 0) return;

  for (let i = 0; i < activeList.length; i++) {
    if (!isMonitoring) break;
    const target = activeList[i];
    if (target.otp) continue;

    try {
      const newOtp = await pollTargetMessages(target);
      if (newOtp) {
        target.otp = newOtp;
        const cell = document.getElementById(`otp-${i}`);
        if (cell) {
          cell.innerHTML = `${newOtp} <span style="font-size: 10px; color: #1877f2; font-weight: normal;">(Baru)</span>`;
        }
      }
    } catch (e) {
      console.warn(`Polling error untuk ${target.email}:`, e);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function startMonitoring() {
  isMonitoring = true;
  btnStop.style.display = "inline-block";
  btnGenerate.disabled = true;
  monitorStatus.innerText = "Memantau...";
  monitorStatus.style.color = "#42b72a";

  pollEmails();
  monitorInterval = setInterval(pollEmails, 5000);
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

btnGenerate.onclick = async () => {
  const count = parseInt(inputCount.value, 10);
  if (isNaN(count) || count <= 0) return;

  const selectedProvider = selectProvider ? selectProvider.value : "user_web";

  stopMonitoring();
  activeList = [];
  btnGenerate.disabled = true;

  let attempts = 0;
  const maxAttempts = count * 3;

  while (activeList.length < count && attempts < maxAttempts) {
    attempts++;
    monitorStatus.innerText = `Membuat email (${activeList.length}/${count})...`;
    monitorStatus.style.color = "#b0b3b8";

    const item = await generateSingleEmail(selectedProvider);
    if (item && item.email) {
      activeList.push({
        email: item.email,
        token: item.token || null,
        providerKey: item.providerKey,
        otp: null,
        lastMessageId: 0,
        isInitialized: false
      });
      renderTable();
    }

    if (selectedProvider === "instant_temp" && activeList.length < count) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  if (activeList.length === 0) {
    monitorStatus.innerText = "Gagal membuat email. Server limit.";
    monitorStatus.style.color = "#fa3e3e";
    btnGenerate.disabled = false;
    return;
  }

  renderTable();
  startMonitoring();
};

btnStop.onclick = () => {
  stopMonitoring();
};

btnImportSaved.onclick = () => {
  const textContent = savedEmailsBox.value;
  const emails = textContent
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));

  if (emails.length === 0) {
    alert("Kotak penampungan tidak memiliki email yang valid.");
    return;
  }

  stopMonitoring();

  chrome.storage.local.get(["email_tokens"], (storageRes) => {
    const tokens = storageRes.email_tokens || {};
    activeList = emails.map((email) => {
      const domain = email.split("@")[1] || "";
      return {
        email: email,
        token: tokens[email.toLowerCase()] || null,
        providerKey: detectProvider(domain),
        otp: null,
        lastMessageId: 0,
        isInitialized: false
      };
    });

    renderTable();
    startMonitoring();
  });
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