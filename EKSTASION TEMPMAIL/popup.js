const DOMAINS = ["cuontol.my.id", "rufff3.my.id"];
const API_BASE = "https://rufff3.my.id/api/emails/";

let activeList = [];
let isMonitoring = false;
let monitorInterval = null;

const inputCount = document.getElementById("input-count");
const btnGenerate = document.getElementById("btn-generate");
const btnStop = document.getElementById("btn-stop");
const btnInjectEmail = document.getElementById("btn-inject-email");
const btnInjectOtp = document.getElementById("btn-inject-otp");
const emailListBody = document.getElementById("email-list-body");
const monitorStatus = document.getElementById("monitor-status");
const savedEmailsBox = document.getElementById("saved-emails-box");
const savedCountEl = document.getElementById("saved-count");
const btnImportSaved = document.getElementById("btn-import-saved");
const btnCopySaved = document.getElementById("btn-copy-saved");
const btnDeleteSaved = document.getElementById("btn-delete-saved");
const btnTogglePanel = document.getElementById("btn-toggle-panel");

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

function generateRandomEmail() {
  const user = getRandomString(Math.floor(Math.random() * 4) + 7);
  const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  return `${user}@${domain}`;
}

function extractOTP(item) {
  const content = `${item.subject || ""} ${item.body_text || ""} ${item.body_html || ""}`;

  const metaMatch = content.match(/Confirmation code\s*(\d{6,8})/i);
  if (metaMatch) return metaMatch[1];

  const htmlBlockMatch = content.match(/letter-spacing:\s*2px;[^>]*>\s*(\d{6,8})\s*</i);
  if (htmlBlockMatch) return htmlBlockMatch[1];

  const digitMatch = content.match(/\b\d{6}\b/);
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

// Injeksi Form Email Pada Tab (Mendukung Selector Email 1 & 2)
function injectEmailContent(emailVal) {
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
    // Email 1 (aria-label="Email" atau type="email")
    document.querySelector('input[type="email"]') ||
    document.querySelector('input[aria-label="Email" i]') ||
    // Email 2 (inputmode="email" atau autocomplete="username")
    document.querySelector('input[inputmode="email"]') ||
    document.querySelector('input[autocomplete="username"]') ||
    // Fallback varian mobile/tel
    document.querySelector('input[aria-label="Mobile Number"]') ||
    document.querySelector('input[aria-label*="Mobile" i]') ||
    document.querySelector('input[type="tel"]') ||
    document.querySelector('input[name="reg_email__"]');

  if (targetEl) {
    targetEl.focus();
    setNativeValue(targetEl, emailVal);
    return true;
  }
  return false;
}

// Injeksi Form OTP Pada Tab (Mendukung Selector OTP 1 & 2)
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
    // OTP 2 (autocomplete="one-time-code" atau maxlength="6")
    document.querySelector('input[autocomplete="one-time-code"]') ||
    // OTP 1 (Confirmation code)
    document.querySelector('input[aria-label="Confirmation code"]') ||
    document.querySelector('input[aria-label*="Confirmation" i]') ||
    document.querySelector('input[aria-label*="kode" i]') ||
    // Fallback umum input kode numeric
    document.querySelector('input[inputmode="numeric"]') ||
    document.querySelector('input[maxlength="6"]');

  if (targetEl) {
    targetEl.focus();
    setNativeValue(targetEl, otpVal);
    return true;
  }
  return false;
}

// Eksekusi Batch Injeksi Email ke Semua Tab
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
      args: [targetEmail]
    }).then(results => {
      if (results?.[0]?.result) injectedCount++;
    }).catch(err => console.warn(`Gagal inject ke Tab ${tab.id}:`, err));

    executionPromises.push(p);
  }

  await Promise.all(executionPromises);
  await chrome.storage.local.set({ tabEmailMap });

  monitorStatus.innerText = `Selesai: ${injectedCount} tab diisi email.`;
  monitorStatus.style.color = "#42b72a";
};

// Eksekusi Batch Injeksi OTP ke Semua Tab Sesuai Mapping
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
    // Fallback: Distribusi OTP berurutan ke tab jika belum ada histori pemetaan
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

async function pollEmails() {
  if (!isMonitoring || activeList.length === 0) return;

  for (let i = 0; i < activeList.length; i++) {
    if (!isMonitoring) break;
    const target = activeList[i];

    try {
      const res = await fetch(`${API_BASE}${encodeURIComponent(target.email)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const latestMessage = data[0];
          const latestId = Number(latestMessage.id) || 0;

          if (!target.isInitialized) {
            target.lastMessageId = latestId;
            target.isInitialized = true;
            continue;
          }

          if (latestId > (target.lastMessageId || 0)) {
            const newOtp = extractOTP(latestMessage);
            if (newOtp) {
              target.otp = newOtp;
              target.lastMessageId = latestId;

              const cell = document.getElementById(`otp-${i}`);
              if (cell) {
                cell.innerHTML = `${newOtp} <span style="font-size: 10px; color: #1877f2; font-weight: normal;">(Baru)</span>`;
              }
            }
          }
        } else {
          if (!target.isInitialized) {
            target.lastMessageId = 0;
            target.isInitialized = true;
          }
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
  monitorInterval = setInterval(pollEmails, 3500);
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
    savedEmailsBox.value = list.join("\n");
    savedCountEl.innerText = list.length;
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

btnGenerate.onclick = () => {
  const count = parseInt(inputCount.value, 10);
  if (isNaN(count) || count <= 0) return;

  stopMonitoring();
  activeList = [];

  for (let i = 0; i < count; i++) {
    activeList.push({
      email: generateRandomEmail(),
      otp: null,
      lastMessageId: 0,
      isInitialized: true
    });
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
  activeList = emails.map((email) => ({
    email: email,
    otp: null,
    lastMessageId: null,
    isInitialized: false
  }));

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

savedEmailsBox.onchange = () => {
  const lines = savedEmailsBox.value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  chrome.storage.local.set({ saved_temp_emails: lines }, () => {
    savedCountEl.innerText = lines.length;
  });
};

document.addEventListener("DOMContentLoaded", () => {
  loadSavedEmails();
});