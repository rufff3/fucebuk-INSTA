document.addEventListener('DOMContentLoaded', async () => {
  const inputSandi = document.getElementById('input-sandi');
  const btnSetSandi = document.getElementById('btn-set-sandi');
  const btnResetSandi = document.getElementById('btn-reset-sandi');
  const inputCookies = document.getElementById('input-cookies');
  const btnGenerate = document.getElementById('btn-generate');
  const outputSukses = document.getElementById('output-sukses');
  const outputDobel = document.getElementById('output-dobel');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const panelStatus = document.getElementById('panel-status');
  
  const badgeSukses = document.getElementById('badge-sukses');
  const badgeDobel = document.getElementById('badge-dobel');

  let sandiTerkunci = "";

  function tampilkanStatus(pesan, tipe) {
    panelStatus.innerText = pesan;
    panelStatus.className = "";
    if (tipe === "ok") panelStatus.classList.add('status-ok');
    if (tipe === "warn") panelStatus.classList.add('status-warn');
    panelStatus.style.display = "block";
    
    setTimeout(() => {
      panelStatus.style.display = "none";
    }, 4000);
  }

  const cache = await chrome.storage.local.get("sandi_tetap");
  if (cache.sandi_tetap) {
    sandiTerkunci = cache.sandi_tetap;
    inputSandi.value = sandiTerkunci;
    inputSandi.disabled = true;
    btnSetSandi.style.display = "none";
    btnResetSandi.style.display = "inline-block";
  }

  btnSetSandi.addEventListener('click', async () => {
    const txt = inputSandi.value.strip();
    if (!txt) {
      tampilkanStatus("Isi kata sandi terlebih dahulu!", "warn");
      return;
    }
    sandiTerkunci = txt;
    await chrome.storage.local.set({ "sandi_tetap": sandiTerkunci });
    
    inputSandi.disabled = true;
    btnSetSandi.style.display = "none";
    btnResetSandi.style.display = "inline-block";
    tampilkanStatus("Kata sandi berhasil disimpan dan dikunci permanen!", "ok");
  });

  btnResetSandi.addEventListener('click', async () => {
    await chrome.storage.local.remove("sandi_tetap");
    sandiTerkunci = "";
    inputSandi.value = "";
    inputSandi.disabled = false;
    btnSetSandi.style.display = "inline-block";
    btnResetSandi.style.display = "none";
    tampilkanStatus("Kata sandi berhasil di-reset. Silakan masukkan sandi baru.", "warn");
  });

  // LOGIKA UTAMA: PENCARIAN UID (Mendukung c_user untuk FB & ds_user_id untuk IG)
  btnGenerate.addEventListener('click', () => {
    if (!sandiTerkunci) {
      tampilkanStatus("Gagal! Atur dan klik 'SET SANDI' terlebih dahulu!", "warn");
      return;
    }

    const rawCookies = inputCookies.value;
    if (!rawCookies.strip()) {
      tampilkanStatus("Masukkan copian cookies mentah di dalam kotak!", "warn");
      return;
    }

    const barisList = rawCookies.split("\n");
    
    let listSukses = [];
    let listDobel = [];
    let setUidsTerproses = new Set();

    barisList.forEach(baris => {
      let line = baris.strip();
      if (!line) return;

      // Deteksi UID Facebook (c_user=...) ATAU Instagram (ds_user_id=...)
      const matchFb = line.match(/c_user=(\d+)/);
      const matchIg = line.match(/ds_user_id=(\d+)/);

      const matchUid = matchFb || matchIg;

      if (matchUid) {
        const uid = matchUid[1];

        if (setUidsTerproses.has(uid)) {
          listDobel.push(`[DOBEL UID: ${uid}] | ${line}`);
        } else {
          setUidsTerproses.add(uid);
          listSukses.push(`${uid}|${sandiTerkunci}|${line}`);
        }
      }
    });

    outputSukses.value = listSukses.join("\n");
    outputDobel.value = listDobel.join("\n");

    badgeSukses.innerText = `${listSukses.length} Akun`;
    badgeDobel.innerText = `${listDobel.length} Akun`;

    if (listSukses.length > 0) {
      tampilkanStatus(`Sukses memproses! ${listSukses.length} Akun Berhasil, ${listDobel.length} Dobel dibuang.`, "ok");
    } else {
      tampilkanStatus("Proses selesai, tidak ada UID (c_user / ds_user_id) yang valid ditemukan.", "warn");
    }
  });

  btnCopyAll.addEventListener('click', () => {
    const isiOutput = outputSukses.value;
    if (!isiOutput.strip()) {
      tampilkanStatus("Tidak ada hasil data yang bisa dicopy!", "warn");
      return;
    }

    navigator.clipboard.writeText(isiOutput).then(() => {
      btnCopyAll.innerText = "COPIED!";
      btnCopyAll.style.backgroundColor = "#42b72a";
      tampilkanStatus("Seluruh hasil sukses berhasil disalin ke clipboard!", "ok");
      
      setTimeout(() => {
        btnCopyAll.innerText = "COPY SEMUA HASIL";
        btnCopyAll.style.backgroundColor = "#1877f2";
      }, 2000);
    });
  });
});

String.prototype.strip = function() {
  return this.trim();
};