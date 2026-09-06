const DOMAINS = ["cuontol.my.id", "rufff3.my.id"];
const API_BASE = "https://rufff3.my.id/api/emails/";

let activeList = [];
let isMonitoring = false;
let monitorInterval = null;

const inputCount = document.getElementById("input-count");
const btnGenerate = document.getElementById("btn-generate");
const btnStop = document.getElementById("btn-stop");
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

          // Inisialisasi awal khusus akun import agar riwayat pesan lama diabaikan
          if (!target.isInitialized) {
            target.lastMessageId = latestId;
            target.isInitialized = true;
            continue;
          }

          // Proses OTP hanya jika ada pesan dengan ID lebih baru daripada baseline/terakhir
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
          // Jika kotak masuk kosong saat pertama kali dicek
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
      isInitialized: true // Email acak baru langsung memproses email masuk pertama
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
    isInitialized: false // Menandai agar email lama dilewati dan hanya menunggu pesan baru
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