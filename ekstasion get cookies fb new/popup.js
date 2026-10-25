document.addEventListener('DOMContentLoaded', () => {
    const btnGet = document.getElementById('btn-get');
    const btnCopy = document.getElementById('btn-copy');
    const btnDelete = document.getElementById('btn-delete');
    const cookieArea = document.getElementById('cookie-area');
    const totalText = document.getElementById('total-text');
    
    const modal = document.getElementById('modal');
    const btnBatal = document.getElementById('btn-batal');
    const btnYa = document.getElementById('btn-ya');

    let dbSessions = [];
    const REQUIRED_KEYS = ['datr', 'sb', 'm_pixel_ratio', 'wd', 'c_user', 'xs', 'fr'];

    chrome.storage.local.get(['dbSessions'], (res) => {
        if (res.dbSessions) dbSessions = res.dbSessions;
        renderUI();
    });

    const saveData = () => {
        chrome.storage.local.set({ dbSessions });
    };

    const renderUI = () => {
        totalText.innerText = `Total Akun: ${dbSessions.length}`;
        cookieArea.value = dbSessions.join('\n');
    };

    btnGet.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes("facebook.com")) {
                btnGet.innerText = "Buka Facebook Dulu!";
                setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
                return;
            }

            chrome.cookies.getAll({ domain: ".facebook.com" }, (cookies) => {
                if (cookies.length === 0) {
                    btnGet.innerText = "Cookie Kosong!";
                    setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
                    return;
                }

                const cUserCookie = cookies.find(c => c.name === 'c_user');
                if (!cUserCookie || !cUserCookie.value) {
                    btnGet.innerText = "c_user Tidak Ada!";
                    setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
                    return;
                }

                const isDuplicate = dbSessions.some(session => {
                    const match = session.match(/(?:^|;\s*)c_user=([^;]+)/);
                    return match && match[1] === cUserCookie.value;
                });

                if (isDuplicate) {
                    btnGet.innerText = "Akun Sudah Ada!";
                    setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
                    return;
                }

                const accountCookies = [];
                REQUIRED_KEYS.forEach(key => {
                    const found = cookies.find(c => c.name === key);
                    if (found) {
                        accountCookies.push(`${found.name}=${found.value}`);
                    }
                });

                if (accountCookies.length === 0) {
                    btnGet.innerText = "Data Tidak Cocok!";
                    setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
                    return;
                }

                const cookieString = accountCookies.join('; ');

                dbSessions.push(cookieString);
                saveData();
                renderUI();
                btnGet.innerText = "Tersimpan!";
                setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
            });
        } catch (e) {
            btnGet.innerText = "Error Sistem!";
            setTimeout(() => btnGet.innerText = "get cookies fb", 2000);
        }
    });

    btnCopy.addEventListener('click', () => {
        if (!cookieArea.value) return;
        
        cookieArea.removeAttribute('readonly');
        cookieArea.select();
        navigator.clipboard.writeText(cookieArea.value);
        cookieArea.setAttribute('readonly', 'true');
        
        window.getSelection().removeAllRanges();
        
        btnCopy.innerText = "copied!";
        setTimeout(() => btnCopy.innerText = "copy", 2000);
    });

    btnDelete.addEventListener('click', () => {
        if (dbSessions.length === 0) return;
        modal.style.display = 'flex';
    });

    btnBatal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    btnYa.addEventListener('click', () => {
        dbSessions = [];
        saveData();
        renderUI();
        modal.style.display = 'none';
        
        btnDelete.innerText = "terhapus!";
        setTimeout(() => btnDelete.innerText = "delete", 2000);
    });
});