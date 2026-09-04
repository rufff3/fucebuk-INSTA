chrome.commands.onCommand.addListener(async (command) => {
  if (command === "run-automation") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes("facebook.com")) {
      processAutomation(tab.id);
    }
  }
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "RUN_AUTOMATION") {
    processAutomation(req.tabId).then(sendResponse);
    return true;
  }
});

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

async function getRandomPhoto() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("photos", "readonly");
    const store = tx.objectStore("photos");
    const getAllKeysReq = store.getAllKeys();

    getAllKeysReq.onsuccess = () => {
      const keys = getAllKeysReq.result;
      if (!keys || keys.length === 0) {
        resolve(null);
        return;
      }
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      const getReq = store.get(randomKey);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    getAllKeysReq.onerror = () => resolve(null);
  });
}

async function getRandomCoverPhoto() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("cover_photos", "readonly");
    const store = tx.objectStore("cover_photos");
    const getAllKeysReq = store.getAllKeys();

    getAllKeysReq.onsuccess = () => {
      const keys = getAllKeysReq.result;
      if (!keys || keys.length === 0) {
        resolve(null);
        return;
      }
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      const getReq = store.get(randomKey);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    getAllKeysReq.onerror = () => resolve(null);
  });
}

function applyLinkDirection(template, link) {
  if (!template) return (link || "").trim();
  if (!link) return template.trim();

  const cleanTemplate = template.trim();
  const cleanLink = link.trim();
  const downPattern = /(👇|⬇️|⬇|🔻|↓)/gu;

  if (downPattern.test(cleanTemplate)) {
    return cleanTemplate + "\n" + cleanLink;
  }
  return cleanTemplate + " " + cleanLink;
}

async function processAutomation(tabId) {
  const data = await chrome.storage.local.get(["bioTemplate", "captionTemplate", "linksBio", "linksProfile", "linksPost"]);
  
  let linksBio = data.linksBio || [];
  let linksProfile = data.linksProfile || [];
  let linksPost = data.linksPost || [];

  const currentBioLink = linksBio.length > 0 ? linksBio.shift() : "";
  const currentProfileLink = linksProfile.length > 0 ? linksProfile.shift() : "";
  const currentPostLink = linksPost.length > 0 ? linksPost.shift() : "";

  await chrome.storage.local.set({
    linksBio: linksBio,
    linksProfile: linksProfile,
    linksPost: linksPost
  });

  let finalBio = "";
  if (data.bioTemplate || currentBioLink) {
    finalBio = currentBioLink ? applyLinkDirection(data.bioTemplate || "", currentBioLink) : (data.bioTemplate || "").trim();
  }

  let finalCaption = "";
  if (data.captionTemplate || currentProfileLink) {
    finalCaption = currentProfileLink ? applyLinkDirection(data.captionTemplate || "", currentProfileLink) : (data.captionTemplate || "").trim();
  }

  const randomPhoto = await getRandomPhoto();
  const randomCoverPhoto = await getRandomCoverPhoto();

  if (!finalBio && !finalCaption && !currentPostLink && !randomPhoto && !randomCoverPhoto) {
    return { success: false, msg: "❌ Tidak ada data yang dapat diproses." };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: runFbAutomation,
      args: [finalBio, finalCaption, currentPostLink, randomPhoto, randomCoverPhoto]
    });
    return { success: true, msg: "✅ Eksekusi selesai diproses." };
  } catch (err) {
    return { success: false, msg: "❌ Error: " + err.message };
  }
}

async function runFbAutomation(bioText, captionText, postLink, photoObj, coverPhotoObj) {
  function notify(text, status = "process") {
    let el = document.getElementById("fb-auto-toast-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "fb-auto-toast-hud";
      el.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 2147483647;
        background: rgba(26, 26, 26, 0.95);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        padding: 10px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
        border: 1px solid #444;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(el);
    }

    if (status === "process") {
      el.style.borderColor = "#2196F3";
    } else if (status === "success") {
      el.style.borderColor = "#4CAF50";
      el.style.background = "rgba(20, 40, 20, 0.95)";
      setTimeout(() => { if (el) el.remove(); }, 4000);
    } else if (status === "error") {
      el.style.borderColor = "#F44336";
      el.style.background = "rgba(45, 20, 20, 0.95)";
      setTimeout(() => { if (el) el.remove(); }, 6000);
    }

    el.innerText = text;
  }

  function getTokens() {
    let f = '', j = '', c = '', r = '', col = '', sec = '';
    let html = document.documentElement.innerHTML;
    try { f = require("DTSGInitialData").token; } catch (e) {}
    if (!f) {
      let m = html.match(/"token":"(.*?)"/);
      if (m) f = m[1];
    }
    if (f) {
      let s = 0;
      for (let i = 0; i < f.length; i++) s += f.charCodeAt(i);
      j = '2' + s;
    }
    let mc = document.cookie.match(/c_user=(\d+)/);
    if (mc) c = mc[1];
    if (!c) c = window.__user || window.Env?.user_id || "";
    let mr = html.match(/"server_revision":(\d+)/);
    if (mr) r = mr[1];
    let mCol = html.match(/(YXBwX2NvbGxlY3Rpb24[a-zA-Z0-9_=-]+)/);
    if (mCol) col = mCol[1];
    let mSec = html.match(/(YXBwX3NlY3Rpb24[a-zA-Z0-9_=-]+)/);
    if (mSec) sec = mSec[1];
    if (!sec && c) {
      try { sec = btoa("app_section:" + c + ":2327158227"); } catch (e) {}
    }
    return { f, j, c, r, col, sec };
  }

  function b64toFile(b64Data, filename, contentType) {
    const byteCharacters = atob(b64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType || "image/jpeg" });
    return new File([blob], filename || "photo.jpg", { type: contentType || "image/jpeg" });
  }

  async function updateBioAction(t, txt) {
    let p = new URLSearchParams();
    p.append("av", t.c);
    p.append("__user", t.c);
    p.append("__a", "1");
    p.append("__req", "2v");
    p.append("fb_dtsg", t.f);
    p.append("jazoest", t.j);
    p.append("fb_api_caller_class", "RelayModern");
    p.append("fb_api_req_friendly_name", "ProfileCometBioFieldSaveMutation");
    p.append("doc_id", "27541422265493104");
    if (t.r) p.append("__rev", t.r);
    let variables = {
      "collectionToken": t.col || "",
      "input": {
        "bio": txt,
        "profile_field_section_type": "DIRECTORY_BIO",
        "actor_id": t.c,
        "client_mutation_id": "2"
      },
      "scale": 1,
      "sectionToken": t.sec || ""
    };
    p.append("variables", JSON.stringify(variables));
    let r = await fetch("/api/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    let tx = await r.text();
    return !(tx.includes('"errors":') || tx.includes("errorSummary"));
  }

  async function uploadAndSetPhotoAction(t, file, caption) {
    let pUrl = new URLSearchParams();
    pUrl.append("photo_source", "57");
    pUrl.append("profile_id", t.c);
    pUrl.append("av", t.c);
    pUrl.append("__user", t.c);
    pUrl.append("__a", "1");
    if (t.r) pUrl.append("__rev", t.r);

    let fd = new FormData();
    fd.append("photo_source", "57");
    fd.append("profile_id", t.c);
    fd.append("av", t.c);
    fd.append("__user", t.c);
    fd.append("__a", "1");
    fd.append("fb_dtsg", t.f);
    fd.append("jazoest", t.j);
    fd.append("file", file);

    let resUpload = await fetch("/profile/picture/upload/?" + pUrl.toString(), {
      method: "POST",
      body: fd
    });
    let txUpload = await resUpload.text();
    let photoId = "";
    try {
      let clean = txUpload.replace(/^[^{]*/, "");
      let sJs = JSON.parse(clean);
      photoId = sJs.fbid || sJs.photo_id || sJs.id || (sJs.payload && (sJs.payload.fbid || sJs.payload.photo_id || sJs.payload.id));
    } catch (e) {}
    if (!photoId) {
      let match = txUpload.match(/"fbid"\s*:\s*"(\d+)"/i) || txUpload.match(/"photo_id"\s*:\s*"(\d+)"/i);
      if (match) photoId = match[1];
    }
    if (!photoId) {
      console.log("FB Raw Upload Response:", txUpload);
      return { success: false, msg: "Gagal mengekstrak ID Foto." };
    }

    let p = new URLSearchParams();
    p.append("av", t.c);
    p.append("__user", t.c);
    p.append("__a", "1");
    p.append("__req", "1g");
    p.append("fb_dtsg", t.f);
    p.append("jazoest", t.j);
    p.append("fb_api_caller_class", "RelayModern");
    p.append("fb_api_req_friendly_name", "ProfileCometProfilePictureSetMutation");
    p.append("doc_id", "26996880216606251");
    if (t.r) p.append("__rev", t.r);

    let variables = {
      "input": {
        "attribution_id_v2": "ProfileCometCollectionRoot.react,comet.profile.collection.friends,via_cold_start,1782150997824,913943,,,",
        "caption": caption,
        "existing_photo_id": photoId,
        "expiration_time": null,
        "profile_id": t.c,
        "profile_pic_method": "EXISTING",
        "profile_pic_source": "TIMELINE",
        "scaled_crop_rect": { "height": 1, "width": 1, "x": 0, "y": 0 },
        "skip_cropping": true,
        "actor_id": t.c,
        "client_mutation_id": "1"
      },
      "isPage": false,
      "isProfile": true,
      "scale": 1,
      "__relay_internal__pv__ProfileGeminiIsCoinFlipEnabledrelayprovider": false
    };
    p.append("variables", JSON.stringify(variables));

    let resCommit = await fetch("/api/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    let txCommit = await resCommit.text();
    if (txCommit.includes('"errors":') || txCommit.includes("errorSummary")) {
      return { success: false, msg: "Mutasi foto ditolak." };
    }
    return { success: true };
  }

  async function uploadAndSetCoverPhotoAction(t, file) {
    let pUrl = new URLSearchParams();
    pUrl.append("photo_source", "57");
    pUrl.append("profile_id", t.c);
    pUrl.append("av", t.c);
    pUrl.append("__user", t.c);
    pUrl.append("__a", "1");
    if (t.r) pUrl.append("__rev", t.r);

    let fd = new FormData();
    fd.append("photo_source", "57");
    fd.append("profile_id", t.c);
    fd.append("av", t.c);
    fd.append("__user", t.c);
    fd.append("__a", "1");
    fd.append("fb_dtsg", t.f);
    fd.append("jazoest", t.j);
    fd.append("file", file);

    let resUpload = await fetch("/profile/picture/upload/?" + pUrl.toString(), {
      method: "POST",
      body: fd
    });
    let txUpload = await resUpload.text();
    let photoId = "";
    try {
      let clean = txUpload.replace(/^[^{]*/, "");
      let sJs = JSON.parse(clean);
      photoId = sJs.fbid || sJs.photo_id || sJs.id || (sJs.payload && (sJs.payload.fbid || sJs.payload.photo_id || sJs.payload.id));
    } catch (e) {}
    if (!photoId) {
      let match = txUpload.match(/"fbid"\s*:\s*"(\d+)"/i) || txUpload.match(/"photo_id"\s*:\s*"(\d+)"/i);
      if (match) photoId = match[1];
    }
    if (!photoId) {
      console.log("FB Raw Upload Response:", txUpload);
      return { success: false, msg: "Gagal mengekstrak ID Sampul." };
    }

    let p = new URLSearchParams();
    p.append("av", t.c);
    p.append("__user", t.c);
    p.append("__a", "1");
    p.append("__req", "1s");
    p.append("fb_dtsg", t.f);
    p.append("jazoest", t.j);
    p.append("fb_api_caller_class", "RelayModern");
    p.append("fb_api_req_friendly_name", "ProfileCometCoverPhotoUpdateMutation");
    p.append("doc_id", "26648951184714383");
    if (t.r) p.append("__rev", t.r);

    let variables = {
      "input": {
        "attribution_id_v2": "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,unexpected," + Date.now() + ",492221,190055527696468,,;CometHomeRoot.react,comet.home,via_cold_start," + Date.now() + ",313799,4748854339,,",
        "cover_photo_id": photoId,
        "focus": { "x": 0.5, "y": 0.2724248650750692 },
        "target_user_id": t.c,
        "actor_id": t.c,
        "client_mutation_id": "1"
      },
      "scale": 1,
      "contextualProfileContext": null
    };
    p.append("variables", JSON.stringify(variables));
    let resCommit = await fetch("/api/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    let txCommit = await resCommit.text();
    if (txCommit.includes('"errors":') || txCommit.includes("errorSummary")) {
      return { success: false, msg: "Mutasi foto sampul ditolak." };
    }
    return { success: true };
  }
  async function createPostAction(t, txt) {
    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    let p = new URLSearchParams();
    p.append("av", t.c);
    p.append("__user", t.c);
    p.append("__a", "1");
    p.append("__req", "88");
    p.append("__hs", window.__hs || "20631.HYP:comet_pkg.2.1...0");
    p.append("dpr", window.devicePixelRatio || "1");
    p.append("__ccg", "EXCELLENT");
    p.append("fb_dtsg", t.f);
    p.append("jazoest", t.j);
    p.append("__spin_r", window.__spin_r || t.r || "1042247318");
    p.append("__spin_b", "trunk");
    p.append("__spin_t", window.__spin_t || Math.floor(Date.now() / 1000).toString());
    p.append("fb_api_caller_class", "RelayModern");
    p.append("fb_api_req_friendly_name", "ComposerStoryCreateMutation");
    p.append("server_timestamps", "true");
    p.append("doc_id", "36513691741608485");
    p.append("__rev", window.__rev || t.r || "1042247318");
    p.append("__s", window.__s || "u6qiuf:z3mkil:cbrls7");
    p.append("__hsi", window.__hsi || "7655760226953730459");
    p.append("__dyn", window.__dyn || "7AzHK4HwBgC265Q2m3mbG2KnFw9uu2i5U4e0yqyUdEc88EW3K1uwJxS1Az8bo6u3y4o27w7nCxS320LE36xOfw9q224obEvy8465o-cBwfi12wOKdwGwFyFE-1-y85S5o9kbxSEtwi831wnEaoC9xy48aU8od8-UqwsUkxe2GewGwsoqBwNwKxm5oe8aUavxK3W2i");
    p.append("__csr", window.__csr || "j4KYynAGy6milAh4Fu9AAyLibrJzGBAAGm8DAneih49AjB-hkjah5GqubLBBuEGl4Qip54fAbplOeGKi2myembey4Dh2Ay94Siqp5F4V8yaWVZHy8K5yolIGCAiyQ28EOEjWqze9zEbpGxGu2TxyV-5Gaa85CbjQdDggAx0wogNAgC6ea-V48yEhBhA9ga8G2fyoJ0HG266-9yi7goHgUVQ5Odd1fBzVobkewAwGwzBl5xW13zVuh55IC-cpi8ex5ohgdy4KhzbGNa4DUOUC9yS8813F6QcUyqfwADyEryyzE7qES14qF28hwQwso5AGwYxu5qzRBwg84Gi2ut28nwKxaA1qwjUHwPwSxN6K1ywKx68e2i0gO1jw23E1CnxmdwmF60J42-2G3-0g64y0a6u2-EClw3W9E1080V23qWgFofo0cD8-C3a");
    p.append("__comet_req", "15");
    let variables = {
      "input": {
        "composer_entry_point": "inline_composer",
        "composer_source_surface": "newsfeed",
        "composer_type": "feed",
        "idempotence_token": uuid + "_FEED",
        "source": "WWW",
        "audience": { "privacy": { "allow": [], "base_state": "EVERYONE", "deny": [], "tag_expansion_state": "UNSPECIFIED" } },
        "message": { "ranges": [], "text": txt },
        "inline_activities": [],
        "text_format_preset_id": "0",
        "publishing_flow": { "supported_flows": ["ASYNC_SILENT", "ASYNC_NOTIF", "FALLBACK"] },
        "reels_remix": { "is_original_audio_reusable": true, "remix_status": "ENABLED" },
        "post_publish_story_data": { "reshare_post_as_sticker": "DISABLED" },
        "logging": { "composer_session_id": uuid },
        "navigation_data": { "attribution_id_v2": "CometHomeRoot.react,comet.home,via_cold_start," + Date.now() + ",262476,4748854339,," },
        "tracking": [null],
        "event_share_metadata": { "surface": "newsfeed" },
        "actor_id": t.c,
        "client_mutation_id": "1"
      },
      "feedLocation": "NEWSFEED",
      "feedbackSource": 1,
      "focusCommentID": null,
      "gridMediaWidth": null,
      "groupID": null,
      "scale": 1,
      "privacySelectorRenderLocation": "COMET_STREAM",
      "checkPhotosToReelsUpsellEligibility": true,
      "referringStoryRenderLocation": null,
      "renderLocation": "homepage_stream",
      "useDefaultActor": false,
      "inviteShortLinkKey": null,
      "isFeed": true,
      "isFundraiser": false,
      "isFunFactPost": false,
      "isGroup": false,
      "isEvent": false,
      "isTimeline": false,
      "isSocialLearning": false,
      "isPageNewsFeed": false,
      "isProfileReviews": false,
      "isWorkSharedDraft": false,
      "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": true,
      "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": true,
      "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": true,
      "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": true,
      "__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider": "AUTO_TRANSLATE",
      "__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider": false,
      "__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider": false,
      "__relay_internal__pv__IsWorkUserrelayprovider": false,
      "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": false,
      "__relay_internal__pv__CometUFISingleLineUFIrelayprovider": true,
      "__relay_internal__pv__CometFeedStory_enable_reactor_facepilerelayprovider": false,
      "__relay_internal__pv__CometFeedStory_enable_social_bubblesrelayprovider": false,
      "__relay_internal__pv__CometFeedStory_enable_post_permalink_white_space_clickrelayprovider": false,
      "__relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider": false,
      "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": true,
      "__relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider": true,
      "__relay_internal__pv__CometFeedShareMedia_shouldPrefetchShareImagerelayprovider": false,
      "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": false,
      "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": false,
      "__relay_internal__pv__IsMergQAPollsrelayprovider": false,
      "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": true,
      "__relay_internal__pv__relay_provider_comet_ufi_ssr_seo_deferrelayprovider": true,
      "__relay_internal__pv__ReelsIFUCard_reelsIFULikeCountrelayprovider": false,
      "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": true,
      "__relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider": 206,
      "__relay_internal__pv__ShouldEnableBakedInTextStoriesrelayprovider": false,
      "__relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider": true,
      "__relay_internal__pv__groups_comet_use_glvrelayprovider": false,
      "__relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider": true,
      "__relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider": true,
      "__relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider": false
    };
    let urlMatch = txt.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      let extractedUrl = urlMatch[0];
      txt = txt.replace(extractedUrl, "").replace(/\s+/g, " ").trim();
      if (!txt) txt = " ";
      variables.input.message.text = txt;
      variables.input.attachments = [{ "link": { "external": { "url": extractedUrl } } }];
    }
    p.append("variables", JSON.stringify(variables));
    let r = await fetch("/api/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    let tx = await r.text();
    return !(tx.includes('"errors":') || tx.includes("errorSummary"));
  }
  notify("⏳ Mengambil token & sesi Facebook...", "process");
  const tokens = getTokens();
  if (!tokens.f || !tokens.c) {
    notify("❌ Gagal: Token FB DTSG atau UID tidak ditemukan.", "error");
    return;
  }
  let results = [];
  if (bioText && bioText.trim()) {
    notify("⏳ Memperbarui bio...", "process");
    let okBio = await updateBioAction(tokens, bioText.trim());
    results.push(okBio ? "Bio: Berhasil" : "Bio: Gagal");
  }
  if (coverPhotoObj && coverPhotoObj.data) {
    notify("⏳ Mengunggah foto sampul...", "process");
    const fileCover = b64toFile(coverPhotoObj.data, coverPhotoObj.name || "cover.jpg", coverPhotoObj.type || "image/jpeg");
    let resCover = await uploadAndSetCoverPhotoAction(tokens, fileCover);
    results.push(resCover.success ? "Foto Sampul: Berhasil" : ("Foto Sampul: " + (resCover.msg || "Gagal")));
  }
  if (photoObj && photoObj.data) {
    notify("⏳ Mengunggah foto profil...", "process");
    const file = b64toFile(photoObj.data, photoObj.name || "profile.jpg", photoObj.type || "image/jpeg");
    let resPhoto = await uploadAndSetPhotoAction(tokens, file, captionText || "");
    results.push(resPhoto.success ? "Foto Profil: Berhasil" : ("Foto Profil: " + (resPhoto.msg || "Gagal")));
  }
  if (postLink && postLink.trim()) {
    notify("⏳ Membuat postingan...", "process");
    let okPost = await createPostAction(tokens, postLink.trim());
    results.push(okPost ? "Post: Berhasil" : "Post: Gagal");
  }
  const hasFailure = results.some(r => r.includes("Gagal") || r.includes("ditolak"));
  if (hasFailure) {
    notify("⚠️ " + results.join(" | "), "error");
  } else {
    notify("✅ Selesai! Semua data berhasil diperbarui.", "success");
  }
}