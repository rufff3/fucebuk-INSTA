document.addEventListener('DOMContentLoaded', async () => {
  const inputSandi = document.getElementById('input-sandi');
  const btnSetSandi = document.getElementById('btn-set-sandi');
  const btnResetSandi = document.getElementById('btn-reset-sandi');
  const badgeLockStatus = document.getElementById('badge-lock-status');
  const inputCookies = document.getElementById('input-cookies');
  const btnGenerate = document.getElementById('btn-generate');
  const outputSukses = document.getElementById('output-sukses');
  const outputDobel = document.getElementById('output-dobel');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const panelStatus = document.getElementById('panel-status');

  const valSukses = document.getElementById('val-sukses');
  const valDobel = document.getElementById('val-dobel');
  const valFixed = document.getElementById('val-fixed');

  let sandiTerkunci = "";

  function tampilkanStatus(pesan, tipe) {
    panelStatus.innerText = pesan;
    panelStatus.className = "";
    if (tipe === "ok") panelStatus.classList.add('status-ok');
    if (tipe === "warn") panelStatus.classList.add('status-warn');
    panelStatus.style.display = "block";

    setTimeout(() => {
      panelStatus.style.display = "none";
    }, 4500);
  }

  // Load sandi dari storage
  const cache = await chrome.storage.local.get("sandi_tetap");
  if (cache.sandi_tetap) {
    sandiTerkunci = cache.sandi_tetap;
    inputSandi.value = sandiTerkunci;
    inputSandi.disabled = true;
    btnSetSandi.style.display = "none";
    btnResetSandi.style.display = "inline-block";
    badgeLockStatus.innerText = "Terkunci";
    badgeLockStatus.style.color = "#34d399";
  }

  btnSetSandi.addEventListener('click', async () => {
    const txt = inputSandi.value.trim();
    if (!txt) {
      tampilkanStatus("Isi kata sandi terlebih dahulu!", "warn");
      return;
    }
    sandiTerkunci = txt;
    await chrome.storage.local.set({ "sandi_tetap": sandiTerkunci });

    inputSandi.disabled = true;
    btnSetSandi.style.display = "none";
    btnResetSandi.style.display = "inline-block";
    badgeLockStatus.innerText = "Terkunci";
    badgeLockStatus.style.color = "#34d399";
    tampilkanStatus("Kata sandi berhasil dikunci secara permanen.", "ok");
  });

  btnResetSandi.addEventListener('click', async () => {
    await chrome.storage.local.remove("sandi_tetap");
    sandiTerkunci = "";
    inputSandi.value = "";
    inputSandi.disabled = false;
    btnSetSandi.style.display = "inline-block";
    btnResetSandi.style.display = "none";
    badgeLockStatus.innerText = "Belum Dikunci";
    badgeLockStatus.style.color = "#64748b";
    tampilkanStatus("Kunci kata sandi dibuka kembali.", "warn");
  });

  // Ekstraksi komponen baris (Mendukung pipe, spasi/tab, dan cookies mentah)
  function parseBaris(baris) {
    const line = baris.trim();
    let rawUid = "";
    let rawPass = "";
    let rawCookie = "";

    if (line.includes('|')) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        rawUid = parts[0].trim();
        rawPass = parts[1].trim();
        rawCookie = parts.slice(2).join('|').trim();
      } else if (parts.length === 2) {
        rawUid = parts[0].trim();
        rawPass = "";
        rawCookie = parts[1].trim();
      }
    } else {
      const matchFirstSpace = line.match(/\s+/);
      if (!matchFirstSpace) {
        rawUid = "";
        rawPass = "";
        rawCookie = line;
      } else {
        const firstSpacePos = matchFirstSpace.index;
        const firstToken = line.slice(0, firstSpacePos).trim();
        const afterFirst = line.slice(firstSpacePos + matchFirstSpace[0].length).trim();

        if (firstToken.includes('=')) {
          rawUid = "";
          rawPass = "";
          rawCookie = line;
        } else {
          rawUid = firstToken;
          const matchSecondSpace = afterFirst.match(/\s+/);
          if (matchSecondSpace) {
            const secondSpacePos = matchSecondSpace.index;
            const secondToken = afterFirst.slice(0, secondSpacePos).trim();
            const afterSecond = afterFirst.slice(secondSpacePos + matchSecondSpace[0].length).trim();

            if (secondToken.includes('=')) {
              rawPass = "";
              rawCookie = afterFirst;
            } else {
              rawPass = secondToken;
              rawCookie = afterSecond;
            }
          } else {
            if (afterFirst.includes('=')) {
              rawPass = "";
              rawCookie = afterFirst;
            } else {
              rawPass = afterFirst;
              rawCookie = "";
            }
          }
        }
      }
    }

    return { rawUid, rawPass, rawCookie };
  }

  // Pemrosesan utama
  btnGenerate.addEventListener('click', () => {
    const rawData = inputCookies.value.trim();
    if (!rawData) {
      tampilkanStatus("Masukkan data pada area input!", "warn");
      return;
    }

    const barisList = rawData.split("\n");
    let listSukses = [];
    let listDobel = [];
    let setUidsTerproses = new Set();
    let countFixed = 0;
    let adaSandiKosong = false;

    // Tahap verifikasi awal kebutuhan kata sandi
    for (let baris of barisList) {
      if (!baris.trim()) continue;
      const parsed = parseBaris(baris);
      if (!parsed.rawPass && !sandiTerkunci) {
        adaSandiKosong = true;
        break;
      }
    }

    if (adaSandiKosong) {
      tampilkanStatus("Terdapat data tanpa kata sandi! Atur dan 'KUNCI' sandi terlebih dahulu.", "warn");
      return;
    }

    barisList.forEach(baris => {
      const line = baris.trim();
      if (!line) return;

      const { rawUid, rawPass, rawCookie } = parseBaris(line);

      // Deteksi UID Facebook (c_user) atau Instagram (ds_user_id)
      const matchFb = rawCookie.match(/c_user=(\d+)/) || line.match(/c_user=(\d+)/);
      const matchIg = rawCookie.match(/ds_user_id=(\d+)/) || line.match(/ds_user_id=(\d+)/);
      const matchCookieUid = matchFb || matchIg;

      let finalUid = "";
      let wasFixed = false;

      if (matchCookieUid) {
        const cookieUid = matchCookieUid[1];
        if (rawUid && rawUid !== cookieUid) {
          finalUid = cookieUid;
          wasFixed = true;
        } else {
          finalUid = cookieUid;
        }
      } else if (rawUid) {
        finalUid = rawUid;
      }

      if (!finalUid) return;

      const finalPass = rawPass ? rawPass : sandiTerkunci;
      const cleanCookie = rawCookie ? rawCookie : line;

      // Filter duplikat
      if (setUidsTerproses.has(finalUid)) {
        listDobel.push(`[DOBEL UID: ${finalUid}] | ${line}`);
      } else {
        setUidsTerproses.add(finalUid);
        listSukses.push(`${finalUid}|${finalPass}|${cleanCookie}`);
        if (wasFixed) {
          countFixed++;
        }
      }
    });

    outputSukses.value = listSukses.join("\n");
    outputDobel.value = listDobel.join("\n");

    valSukses.innerText = listSukses.length;
    valDobel.innerText = listDobel.length;
    valFixed.innerText = countFixed;

    if (listSukses.length > 0) {
      let pesanStatus = `Berhasil memproses ${listSukses.length} akun. ${listDobel.length} akun duplikat disisihkan.`;
      if (countFixed > 0) {
        pesanStatus = `Sukses: ${listSukses.length} akun (${countFixed} akun diperbaiki karena UID & cookie beda), ${listDobel.length} duplikat dibuang.`;
      }
      tampilkanStatus(pesanStatus, "ok");
    } else {
      tampilkanStatus("Tidak ditemukan UID atau cookies yang valid untuk diproses.", "warn");
    }
  });

  // Salin hasil ke clipboard
  btnCopyAll.addEventListener('click', () => {
    const isiOutput = outputSukses.value.trim();
    if (!isiOutput) {
      tampilkanStatus("Tidak ada data hasil untuk disalin!", "warn");
      return;
    }

    navigator.clipboard.writeText(isiOutput).then(() => {
      btnCopyAll.innerText = "TERSALIN!";
      btnCopyAll.style.backgroundColor = "#10b981";
      tampilkanStatus("Seluruh hasil berhasil disalin ke clipboard.", "ok");

      setTimeout(() => {
        btnCopyAll.innerText = "SALIN SEMUA";
        btnCopyAll.style.backgroundColor = "#2563eb";
      }, 2000);
    });
  });
});