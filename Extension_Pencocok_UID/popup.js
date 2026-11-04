document.addEventListener('DOMContentLoaded', async () => {
  const inputSandi = document.getElementById('input-sandi');
  const btnSetSandi = document.getElementById('btn-set-sandi');
  const btnResetSandi = document.getElementById('btn-reset-sandi');
  const badgeLockStatus = document.getElementById('badge-lock-status');
  const inputCookies = document.getElementById('input-cookies');
  const inputRef = document.getElementById('input-ref');
  const btnGenerate = document.getElementById('btn-generate');
  const outputSukses = document.getElementById('output-sukses');
  const outputDobel = document.getElementById('output-dobel');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const panelStatus = document.getElementById('panel-status');

  const valSukses = document.getElementById('val-sukses');
  const valDobel = document.getElementById('val-dobel');
  const valFixed = document.getElementById('val-fixed');
  const valMatched = document.getElementById('val-matched');

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

  // Membuat tabel referensi kata sandi valid dari kolom kanan berdasarkan UID
  function buatMapReferensi(rawDataRef) {
    const mapRef = new Map();
    if (!rawDataRef) return mapRef;

    const barisList = rawDataRef.split("\n");
    for (let baris of barisList) {
      const line = baris.trim();
      if (!line) continue;

      let uid = "";
      let pass = "";

      const matchFb = line.match(/c_user=(\d+)/);
      const matchIg = line.match(/ds_user_id=(\d+)/);
      const cookieUid = matchFb ? matchFb[1] : (matchIg ? matchIg[1] : null);

      if (line.includes('|')) {
        const parts = line.split('|');
        uid = parts[0].trim();
        if (parts.length >= 2) {
          pass = parts[1].trim();
        }
      } else {
        const matchSpace = line.match(/\s+/);
        if (matchSpace) {
          uid = line.slice(0, matchSpace.index).trim();
          const sisa = line.slice(matchSpace.index + matchSpace[0].length).trim();
          const matchSpace2 = sisa.match(/\s+/);
          if (matchSpace2) {
            pass = sisa.slice(0, matchSpace2.index).trim();
          } else {
            pass = sisa;
          }
        }
      }

      if (pass) {
        if (uid) mapRef.set(uid, pass);
        if (cookieUid) mapRef.set(cookieUid, pass);
      }
    }
    return mapRef;
  }

  // Deteksi apakah sebuah baris memiliki string cookies aktif (FB/IG/format pasangan cookie)
  function apakahPunyaCookie(cookieStr, lineStr) {
    if (!cookieStr && !lineStr) return false;
    const gabungan = `${cookieStr || ""} ${lineStr || ""}`;
    if (/c_user=\d+|ds_user_id=\d+|xs=[^;]+|datr=[^;]+|sessionid=[^;]+/i.test(gabungan)) {
      return true;
    }
    if (cookieStr && cookieStr.includes(';') && cookieStr.includes('=')) {
      return true;
    }
    return false;
  }

  // Pemrosesan utama
  btnGenerate.addEventListener('click', () => {
    const rawData = inputCookies.value.trim();
    const rawDataRef = inputRef.value.trim();

    if (!rawData) {
      tampilkanStatus("Masukkan data pada area input kiri (Data Utama)!", "warn");
      return;
    }

    const mapRef = buatMapReferensi(rawDataRef);
    const barisList = rawData.split("\n");

    let mapSukses = new Map();
    let listDobel = [];
    let passPerUid = new Map();

    // Petakan password dari data referensi kolom kanan
    for (let [uid, pass] of mapRef.entries()) {
      if (pass) passPerUid.set(uid, pass);
    }

    // Petakan password yang terbawa di baris kolom kiri (misal baris UID|Sandi|2FA)
    for (let baris of barisList) {
      if (!baris.trim()) continue;
      const parsed = parseBaris(baris);
      const matchFb = parsed.rawCookie.match(/c_user=(\d+)/) || baris.match(/c_user=(\d+)/);
      const matchIg = parsed.rawCookie.match(/ds_user_id=(\d+)/) || baris.match(/ds_user_id=(\d+)/);
      const tempUid = (matchFb ? matchFb[1] : (matchIg ? matchIg[1] : null)) || parsed.rawUid;
      if (tempUid && parsed.rawPass && !passPerUid.has(tempUid)) {
        passPerUid.set(tempUid, parsed.rawPass);
      }
    }

    // Verifikasi kelengkapan kata sandi
    let adaSandiKosong = false;
    for (let baris of barisList) {
      if (!baris.trim()) continue;
      const parsed = parseBaris(baris);
      const matchFb = parsed.rawCookie.match(/c_user=(\d+)/) || baris.match(/c_user=(\d+)/);
      const matchIg = parsed.rawCookie.match(/ds_user_id=(\d+)/) || baris.match(/ds_user_id=(\d+)/);
      const tempUid = (matchFb ? matchFb[1] : (matchIg ? matchIg[1] : null)) || parsed.rawUid;

      const adaPass = parsed.rawPass || (tempUid && passPerUid.has(tempUid)) || sandiTerkunci;
      if (!adaPass) {
        adaSandiKosong = true;
        break;
      }
    }

    if (adaSandiKosong) {
      tampilkanStatus("Terdapat data tanpa kata sandi! Atur dan 'KUNCI' sandi atau sertakan data referensi sandi.", "warn");
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

      // Cek status kepemilikan cookies
      const hasCookie = apakahPunyaCookie(rawCookie, line);

      // Penentuan kata sandi:
      // 1. Prioritaskan kolom kanan (referensi)
      // 2. Sandi dari baris ini
      // 3. Sandi yang terpetakan untuk UID ini dari baris cadangan
      // 4. Sandi default terkunci
      let finalPass = "";
      let wasPassMatched = false;

      if (mapRef.has(finalUid)) {
        finalPass = mapRef.get(finalUid);
        wasPassMatched = true;
      } else if (rawPass) {
        finalPass = rawPass;
      } else if (passPerUid.has(finalUid)) {
        finalPass = passPerUid.get(finalUid);
      } else {
        finalPass = sandiTerkunci;
      }

      // Cookie selalu mengambil dari data kolom kiri (sesi fresh)
      const cleanCookie = rawCookie ? rawCookie : line;
      const formattedOutput = `${finalUid}|${finalPass}|${cleanCookie}`;

      const currentEntry = {
        finalUid,
        finalPass,
        cleanCookie,
        hasCookie,
        wasFixed,
        wasPassMatched,
        rawPass,
        originalLine: line,
        formattedOutput
      };

      // Filter duplikat dengan prioritas kepemilikan cookies
      if (mapSukses.has(finalUid)) {
        const existingEntry = mapSukses.get(finalUid);

        if (!existingEntry.hasCookie && currentEntry.hasCookie) {
          // Akun lama tidak punya cookies (hanya 2FA), akun baru punya cookies:
          // Akun lama dipindahkan ke duplikat, akun baru dengan cookies dijadikan data utama
          listDobel.push(`[DOBEL UID: ${finalUid}] | ${existingEntry.originalLine}`);

          // Jika baris cookies tidak memiliki sandi bawaan dan tidak ada di referensi, warisi sandi dari baris 2FA
          if (!currentEntry.rawPass && existingEntry.rawPass && !mapRef.has(finalUid)) {
            currentEntry.finalPass = existingEntry.rawPass;
            currentEntry.formattedOutput = `${finalUid}|${currentEntry.finalPass}|${cleanCookie}`;
          }

          mapSukses.set(finalUid, currentEntry);
        } else {
          // Akun lama sudah punya cookies, atau kedua akun status cookies-nya sama:
          // Baris saat ini diklasifikasikan sebagai duplikat
          listDobel.push(`[DOBEL UID: ${finalUid}] | ${line}`);
        }
      } else {
        mapSukses.set(finalUid, currentEntry);
      }
    });

    let listSukses = [];
    let countFixed = 0;
    let countMatched = 0;

    for (const entry of mapSukses.values()) {
      listSukses.push(entry.formattedOutput);
      if (entry.wasFixed) countFixed++;
      if (entry.wasPassMatched) countMatched++;
    }

    outputSukses.value = listSukses.join("\n");
    outputDobel.value = listDobel.join("\n");

    valSukses.innerText = listSukses.length;
    valDobel.innerText = listDobel.length;
    valFixed.innerText = countFixed;
    valMatched.innerText = countMatched;

    if (listSukses.length > 0) {
      let pesanStatus = `Berhasil memproses ${listSukses.length} akun. ${listDobel.length} akun duplikat disisihkan.`;
      const detailPesan = [];
      if (countFixed > 0) detailPesan.push(`${countFixed} UID diperbaiki`);
      if (countMatched > 0) detailPesan.push(`${countMatched} sandi dicocokkan`);
      if (detailPesan.length > 0) {
        pesanStatus = `Sukses: ${listSukses.length} akun (${detailPesan.join(', ')}), ${listDobel.length} duplikat dibuang.`;
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