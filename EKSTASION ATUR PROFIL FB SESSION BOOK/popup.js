const bioText = document.getElementById("bioText");
const captionText = document.getElementById("captionText");

const linksBio = document.getElementById("linksBio");
const linksProfile = document.getElementById("linksProfile");
const linksPost = document.getElementById("linksPost");

const countBioLink = document.getElementById("countBioLink");
const countProfileLink = document.getElementById("countProfileLink");
const countPostLink = document.getElementById("countPostLink");
const photoCounter = document.getElementById("photoCounter");
const coverCounter = document.getElementById("coverCounter");

const photoFolder = document.getElementById("photoFolder");
const btnClearPhotos = document.getElementById("btnClearPhotos");
const coverFolder = document.getElementById("coverFolder");
const btnClearCoverPhotos = document.getElementById("btnClearCoverPhotos");

const btnSave = document.getElementById("btnSave");
const btnExecute = document.getElementById("btnExecute");

let autoSaveTimeout = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("FBAutomationDB", 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("cover_photos")) {
        db.createObjectStore("cover_photos", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updatePhotoCount() {
  try {
    const db = await openDB();
    const tx = db.transaction("photos", "readonly");
    const store = tx.objectStore("photos");
    const countReq = store.count();
    countReq.onsuccess = () => {
      photoCounter.innerText = `${countReq.result} Foto`;
    };
  } catch (err) {
    console.error("Gagal membaca total foto profil:", err);
  }
}

async function updateCoverPhotoCount() {
  try {
    const db = await openDB();
    const tx = db.transaction("cover_photos", "readonly");
    const store = tx.objectStore("cover_photos");
    const countReq = store.count();
    countReq.onsuccess = () => {
      coverCounter.innerText = `${countReq.result} Foto`;
    };
  } catch (err) {
    console.error("Gagal membaca total foto sampul:", err);
  }
}

function parseLines(textarea) {
  return textarea.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

function updateAllLinkCounts() {
  countBioLink.innerText = `${parseLines(linksBio).length}`;
  countProfileLink.innerText = `${parseLines(linksProfile).length}`;
  countPostLink.innerText = `${parseLines(linksPost).length}`;
}

function saveData(showIndicator = false) {
  const payload = {
    bioTemplate: bioText.value,
    captionTemplate: captionText.value,
    linksBio: parseLines(linksBio),
    linksProfile: parseLines(linksProfile),
    linksPost: parseLines(linksPost)
  };

  chrome.storage.local.set(payload, () => {
    updateAllLinkCounts();
    if (showIndicator && btnSave) {
      const originalText = "💾 Simpan Data";
      btnSave.innerText = "✅ Tersimpan!";
      setTimeout(() => { btnSave.innerText = originalText; }, 1200);
    }
  });
}

function triggerAutoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    saveData(false);
  }, 250);
}

function loadSavedData() {
  chrome.storage.local.get(["bioTemplate", "captionTemplate", "linksBio", "linksProfile", "linksPost"], (data) => {
    if (typeof data.bioTemplate === "string") bioText.value = data.bioTemplate;
    if (typeof data.captionTemplate === "string") captionText.value = data.captionTemplate;
    if (Array.isArray(data.linksBio)) linksBio.value = data.linksBio.join("\n");
    if (Array.isArray(data.linksProfile)) linksProfile.value = data.linksProfile.join("\n");
    if (Array.isArray(data.linksPost)) linksPost.value = data.linksPost.join("\n");

    updateAllLinkCounts();
    updatePhotoCount();
    updateCoverPhotoCount();
  });
}

[bioText, captionText].forEach(el => {
  el.addEventListener("input", triggerAutoSave);
});

[linksBio, linksProfile, linksPost].forEach(el => {
  el.addEventListener("input", () => {
    updateAllLinkCounts();
    triggerAutoSave();
  });
});

photoFolder.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
  if (files.length === 0) return;

  photoCounter.innerText = "⏳ Menyimpan...";
  const photoItems = [];
  for (const file of files) {
    const base64 = await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result.split(",")[1]);
      reader.readAsDataURL(file);
    });
    photoItems.push({
      name: file.name,
      type: file.type || "image/jpeg",
      data: base64
    });
  }

  const db = await openDB();
  const tx = db.transaction("photos", "readwrite");
  const store = tx.objectStore("photos");
  for (const item of photoItems) {
    store.add(item);
  }

  tx.oncomplete = () => {
    updatePhotoCount();
  };
});

coverFolder.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
  if (files.length === 0) return;

  coverCounter.innerText = "⏳ Menyimpan...";
  const photoItems = [];
  for (const file of files) {
    const base64 = await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result.split(",")[1]);
      reader.readAsDataURL(file);
    });
    photoItems.push({
      name: file.name,
      type: file.type || "image/jpeg",
      data: base64
    });
  }

  const db = await openDB();
  const tx = db.transaction("cover_photos", "readwrite");
  const store = tx.objectStore("cover_photos");
  for (const item of photoItems) {
    store.add(item);
  }

  tx.oncomplete = () => {
    updateCoverPhotoCount();
  };
});

btnClearPhotos.addEventListener("click", async () => {
  const db = await openDB();
  const tx = db.transaction("photos", "readwrite");
  tx.objectStore("photos").clear();
  tx.oncomplete = () => {
    updatePhotoCount();
  };
});

btnClearCoverPhotos.addEventListener("click", async () => {
  const db = await openDB();
  const tx = db.transaction("cover_photos", "readwrite");
  tx.objectStore("cover_photos").clear();
  tx.oncomplete = () => {
    updateCoverPhotoCount();
  };
});

btnSave.addEventListener("click", () => {
  saveData(true);
});

btnExecute.addEventListener("click", () => {
  btnExecute.disabled = true;
  const originalText = btnExecute.innerText;
  btnExecute.innerText = "⏳ Memproses Semua Tab...";

  saveData(false);

  chrome.runtime.sendMessage({ action: "RUN_AUTOMATION" }, (res) => {
    btnExecute.disabled = false;
    btnExecute.innerText = originalText;

    if (res && res.success) {
      setTimeout(() => {
        chrome.storage.local.get(["linksBio", "linksProfile", "linksPost"], (d) => {
          if (Array.isArray(d.linksBio)) linksBio.value = d.linksBio.join("\n");
          if (Array.isArray(d.linksProfile)) linksProfile.value = d.linksProfile.join("\n");
          if (Array.isArray(d.linksPost)) linksPost.value = d.linksPost.join("\n");
          updateAllLinkCounts();
        });
      }, 800);
    } else if (res && !res.success) {
      alert(res.msg || "Gagal memproses tab.");
    }
  });
});

loadSavedData();