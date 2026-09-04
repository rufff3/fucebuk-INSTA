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
  const db = await openDB();
  const tx = db.transaction("photos", "readonly");
  const store = tx.objectStore("photos");
  const countReq = store.count();
  countReq.onsuccess = () => {
    photoCounter.innerText = `${countReq.result} Foto`;
  };
}

async function updateCoverPhotoCount() {
  const db = await openDB();
  const tx = db.transaction("cover_photos", "readonly");
  const store = tx.objectStore("cover_photos");
  const countReq = store.count();
  countReq.onsuccess = () => {
    coverCounter.innerText = `${countReq.result} Foto`;
  };
}

function parseLines(textarea) {
  return textarea.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

function updateAllLinkCounts() {
  countBioLink.innerText = `${parseLines(linksBio).length}`;
  countProfileLink.innerText = `${parseLines(linksProfile).length}`;
  countPostLink.innerText = `${parseLines(linksPost).length}`;
}

chrome.storage.local.get(["bioTemplate", "captionTemplate", "linksBio", "linksProfile", "linksPost"], (data) => {
  if (data.bioTemplate) bioText.value = data.bioTemplate;
  if (data.captionTemplate) captionText.value = data.captionTemplate;
  if (data.linksBio && Array.isArray(data.linksBio)) linksBio.value = data.linksBio.join("\n");
  if (data.linksProfile && Array.isArray(data.linksProfile)) linksProfile.value = data.linksProfile.join("\n");
  if (data.linksPost && Array.isArray(data.linksPost)) linksPost.value = data.linksPost.join("\n");

  updateAllLinkCounts();
  updatePhotoCount();
  updateCoverPhotoCount();
});

[linksBio, linksProfile, linksPost].forEach(el => el.addEventListener("input", updateAllLinkCounts));

photoFolder.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
  if (files.length === 0) return;

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
  chrome.storage.local.set({
    bioTemplate: bioText.value,
    captionTemplate: captionText.value,
    linksBio: parseLines(linksBio),
    linksProfile: parseLines(linksProfile),
    linksPost: parseLines(linksPost)
  }, () => {
    updateAllLinkCounts();
    const originalText = btnSave.innerText;
    btnSave.innerText = "✅ Tersimpan!";
    setTimeout(() => { btnSave.innerText = originalText; }, 1500);
  });
});

btnExecute.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.includes("facebook.com")) return;

  chrome.runtime.sendMessage({ action: "RUN_AUTOMATION", tabId: tab.id }, (res) => {
    if (res && res.success) {
      setTimeout(() => {
        chrome.storage.local.get(["linksBio", "linksProfile", "linksPost"], (d) => {
          if (d.linksBio) linksBio.value = d.linksBio.join("\n");
          if (d.linksProfile) linksProfile.value = d.linksProfile.join("\n");
          if (d.linksPost) linksPost.value = d.linksPost.join("\n");
          updateAllLinkCounts();
        });
      }, 1000);
    }
  });
});