(function () {
  if (!window.location.hostname.includes("facebook.com")) return;

  function createHUD() {
    const existing = document.getElementById("floating-cookie-hud");
    if (existing) return existing;

    const hud = document.createElement("div");
    hud.id = "floating-cookie-hud";
    hud.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      background: #f1f3f5;
      border: 1px solid #ced4da;
      border-radius: 8px;
      padding: 8px 12px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      width: 300px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 5px;
    `;

    hud.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; font-weight: 700; color: #495057;">Cookie Akun:</span>
        <span id="copyFeedback" style="font-size: 10px; color: #00875a; font-weight: 600; display: none;">Tersalin!</span>
      </div>
      <input type="text" id="cookieOutput" readonly style="
        width: 100%;
        background: #ffffff;
        border: 1px solid #ced4da;
        border-radius: 4px;
        padding: 5px 8px;
        font-size: 11px;
        font-family: monospace;
        color: #212529;
        box-sizing: border-box;
        cursor: pointer;
      " title="Klik untuk menyalin" />
    `;

    document.body.appendChild(hud);

    const input = hud.querySelector("#cookieOutput");
    const badge = hud.querySelector("#copyFeedback");

    input.addEventListener("click", () => {
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        badge.style.display = "inline";
        setTimeout(() => {
          badge.style.display = "none";
        }, 1500);
      });
    });

    return hud;
  }

  function getDOMUserId() {
    const html = document.documentElement.innerHTML;
    const match = html.match(/"USER_ID"\s*:\s*"(\d+)"/) ||
                  html.match(/"actorID"\s*:\s*"(\d+)"/) ||
                  html.match(/"ACCOUNT_ID"\s*:\s*"(\d+)"/);
    return match ? match[1] : "";
  }

  const hud = createHUD();
  const inputEl = hud.querySelector("#cookieOutput");
  let fetchTriggered = false;

  const checkInterval = setInterval(() => {
    const pageUid = getDOMUserId();

    chrome.runtime.sendMessage({ action: "GET_TAB_COOKIE", uid: pageUid }, (response) => {
      if (chrome.runtime.lastError) return;

      if (response && response.includes("c_user=")) {
        inputEl.value = response;
        clearInterval(checkInterval);
      } else if (!fetchTriggered) {
        fetchTriggered = true;
        fetch(window.location.href, { method: "HEAD", cache: "no-store" }).catch(() => {});
      }
    });
  }, 1000);
})();