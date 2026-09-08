// ==========================================================
// 1. ENGINE 3D GHOST RIDER SKULL ANATOMY & REALTIME FLAMES
// ==========================================================
const canvas = document.getElementById('canvas3d');
const ctx = canvas.getContext('2d');
const mainCard = document.getElementById('mainCard');

const width = canvas.width = 420;
const height = canvas.height = 600;
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
let isScanning = false;
let animTick = 0;

window.addEventListener('mousemove', (e) => {
  targetX = (e.clientX - width / 2);
  targetY = (e.clientY - height / 2);
});

// Partikel Bara Api Ambien Latar
const emberCount = 50;
const embers = [];
for (let i = 0; i < emberCount; i++) {
  embers.push({
    x: (Math.random() - 0.5) * 500,
    y: Math.random() * 600 - 300,
    z: (Math.random() - 0.5) * 400,
    speedY: Math.random() * 1.8 + 0.8,
    size: Math.random() * 2.2 + 0.8
  });
}

// Simulasi Kobaran Api Menjulang Ghost Rider (Hellfire)
const flameCount = 175;
const flames = [];

function spawnFlame(p) {
  // Emitter melingkupi kubah tengkorak
  const u = (Math.random() - 0.5) * 140;
  p.x = u;
  p.y = -65 - Math.random() * 55 - Math.abs(u) * 0.25;
  p.z = (Math.random() - 0.5) * 80;
  p.vy = -(Math.random() * 3.5 + 2.5);
  p.vx = (Math.random() - 0.5) * 1.6;
  p.vz = (Math.random() - 0.5) * 1.4;
  p.life = 0;
  p.maxLife = Math.random() * 30 + 18;
  p.size = Math.random() * 18 + 12;
  return p;
}

for (let i = 0; i < flameCount; i++) {
  const p = spawnFlame({});
  p.life = Math.random() * p.maxLife;
  flames.push(p);
}

function render3D() {
  ctx.clearRect(0, 0, width, height);
  animTick += 0.025;

  mouseX += (targetX - mouseX) * 0.06;
  mouseY += (targetY - mouseY) * 0.06;

  const fov = 380;
  const centerX = width / 2;
  const centerY = height / 2 - 5;

  // Sudut Rotasi 3D
  const radY = (mouseX * 0.003) + Math.sin(animTick * 0.7) * 0.05;
  const radX = -(mouseY * 0.003) + Math.cos(animTick * 0.5) * 0.04;
  const cosY = Math.cos(radY), sinY = Math.sin(radY);
  const cosX = Math.cos(radX), sinX = Math.sin(radX);

  function project3D(x, y, z) {
    let x1 = x * cosY - z * sinY;
    let z1 = x * sinY + z * cosY;
    let y2 = y * cosX - z1 * sinX;
    let z2 = y * sinX + z1 * cosX;
    const depth = z2 + 280;
    const scale = depth > 0 ? fov / (fov + depth) : 0;
    return {
      x: centerX + x1 * scale * 1.45,
      y: centerY + y2 * scale * 1.45,
      scale: scale,
      z: z2
    };
  }

  // 1. Pancaran Aura Crimson di Belakang Kepala
  const auraGrad = ctx.createRadialGradient(centerX, centerY - 40, 10, centerX, centerY - 40, 195);
  auraGrad.addColorStop(0, 'rgba(255, 60, 0, 0.48)');
  auraGrad.addColorStop(0.35, 'rgba(220, 10, 40, 0.28)');
  auraGrad.addColorStop(0.7, 'rgba(80, 0, 15, 0.12)');
  auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY - 40, 195, 0, Math.PI * 2);
  ctx.fill();

  // 2. Partikel Bara Api Latar
  const emberSpeed = isScanning ? 3.5 : 1.2;
  for (let i = 0; i < emberCount; i++) {
    const e = embers[i];
    e.y -= e.speedY * emberSpeed;
    if (e.y < -280) {
      e.y = 280;
      e.x = (Math.random() - 0.5) * 500;
      e.z = (Math.random() - 0.5) * 400;
    }
    const scale = fov / (fov + e.z + 280);
    const projX = centerX + e.x * scale;
    const projY = centerY + e.y * scale;

    ctx.beginPath();
    ctx.arc(projX, projY, Math.max(0.6, e.size * scale), 0, Math.PI * 2);
    ctx.fillStyle = isScanning ? '#ff6600' : '#ff0033';
    ctx.globalAlpha = Math.max(0.2, (1 - (e.z + 200) / 600) * 0.7);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // 3. Render Kobaran Api Ghost Rider (Additive Flame Layer)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < flameCount; i++) {
    const f = flames[i];
    f.life++;
    f.y += f.vy;
    f.x += f.vx + Math.sin(animTick * 4 + f.life * 0.15) * 1.1;
    f.z += f.vz;

    if (f.life >= f.maxLife) {
      spawnFlame(f);
    }

    const proj = project3D(f.x, f.y, f.z);
    if (proj.scale > 0) {
      const progress = f.life / f.maxLife;
      const currentRadius = f.size * proj.scale * (1 - progress * 0.65);

      const grad = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, Math.max(1, currentRadius));
      if (progress < 0.25) {
        grad.addColorStop(0, 'rgba(255, 255, 220, 0.95)');
        grad.addColorStop(0.4, 'rgba(255, 175, 20, 0.8)');
        grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
      } else if (progress < 0.65) {
        grad.addColorStop(0, 'rgba(255, 140, 20, 0.75)');
        grad.addColorStop(0.5, 'rgba(230, 30, 10, 0.45)');
        grad.addColorStop(1, 'rgba(160, 0, 20, 0)');
      } else {
        grad.addColorStop(0, 'rgba(230, 20, 0, 0.4)');
        grad.addColorStop(0.7, 'rgba(100, 0, 15, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, Math.max(1, currentRadius), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 4. Pembentukan Jalur Vektor Anatomi Tengkorak
  function drawPath(points, close = true) {
    ctx.beginPath();
    const p0 = project3D(...points[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = project3D(...points[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (close) ctx.closePath();
  }

  // --- Siluet Tulang Luar Kranium (Cranial Skull Silhouette) ---
  const craniumContour = [
    [0, -135, 15],
    [32, -132, 12], [58, -118, 5], [78, -90, -5],
    [86, -60, 0], [74, -38, 12], [62, -30, 20],   // Cekungan pelipis (Temporal Inset)
    [88, -12, 28], [82, 14, 38], [66, 28, 42],    // Tonjolan tulang pipi (Zygomatic Arch)
    [48, 32, 45], [44, 46, 42], [42, 60, 28],     // Rahang samping bawah
    [24, 76, 40], [0, 80, 46],                    // Dagu tengah
    [-24, 76, 40], [-42, 60, 28], [-44, 46, 42],
    [-48, 32, 45], [-66, 28, 42], [-82, 14, 38], [-88, -12, 28],
    [-62, -30, 20], [-74, -38, 12], [-86, -60, 0],
    [-78, -90, -5], [-58, -118, 5], [-32, -132, 12]
  ];

  // Shading Dasar Solid Tengkorak
  drawPath(craniumContour);
  ctx.fillStyle = 'rgba(18, 2, 5, 0.95)';
  ctx.fill();

  // Garis Kontur Luar Tengkorak
  ctx.lineWidth = isScanning ? 2.4 : 1.8;
  ctx.strokeStyle = isScanning ? 'rgba(255, 90, 20, 0.98)' : 'rgba(255, 30, 60, 0.85)';
  ctx.shadowBlur = isScanning ? 20 : 12;
  ctx.shadowColor = '#ff2600';
  ctx.stroke();

  // --- Kerutan & Lekukan Alis Menukik Tajam (Furrowed Brow Ridge) ---
  const browRidge = [
    [-62, -42, 44], [-40, -48, 52], [-14, -40, 62],
    [0, -44, 65],
    [14, -40, 62], [40, -48, 52], [62, -42, 44]
  ];
  drawPath(browRidge, false);
  ctx.stroke();

  // Kerutan Dahi Vertikal (Menyeramkan)
  drawPath([[0, -78, 55], [0, -45, 65]], false);
  ctx.stroke();
  drawPath([[-14, -72, 52], [-8, -43, 62]], false);
  ctx.stroke();
  drawPath([[14, -72, 52], [8, -43, 62]], false);
  ctx.stroke();

  // Garis Temporal (Pelipis Cekung)
  drawPath([[-58, -85, 20], [-62, -32, 25]], false);
  ctx.stroke();
  drawPath([[58, -85, 20], [62, -32, 25]], false);
  ctx.stroke();

  // --- Rongga Soket Mata Besar & Menakutkan (Deep Dark Sockets) ---
  const leftEyeSocket = [
    [-14, -36, 58], [-38, -44, 52], [-54, -30, 42],
    [-52, -10, 42], [-32, 0, 48], [-16, -12, 54]
  ];
  const rightEyeSocket = [
    [14, -36, 58], [38, -44, 52], [54, -30, 42],
    [52, -10, 42], [32, 0, 48], [16, -12, 54]
  ];

  [leftEyeSocket, rightEyeSocket].forEach(socket => {
    drawPath(socket);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.98)';
    ctx.fill();
    ctx.stroke();
  });

  // --- Rongga Hidung Segitiga Terbalik (Inverted Piriform Cavity) ---
  const nasalCavity = [
    [0, -18, 62], [-12, 10, 52], [-3, 16, 50], [0, 8, 52], [3, 16, 50], [12, 10, 52]
  ];
  drawPath(nasalCavity);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.98)';
  ctx.fill();
  ctx.stroke();

  // Garis Sekat Tulang Pipi (Cheekbone Insets)
  drawPath([[-52, -8, 42], [-74, 10, 36], [-46, 22, 44]], false);
  ctx.stroke();
  drawPath([[52, -8, 42], [74, 10, 36], [46, 22, 44]], false);
  ctx.stroke();

  // --- Deretan Gigi & Rahang Tengkorak (Teeth & Jaw Alignment) ---
  // Garis Pemisah Bibir / Oklusi Gigi
  drawPath([[-36, 42, 40], [36, 42, 40]], false);
  ctx.stroke();

  // Gigi Atas & Bawah
  const toothLines = [
    [[-26, 32, 43], [-26, 52, 40]],
    [[-16, 30, 47], [-16, 54, 43]],
    [[-6, 29, 49], [-6, 55, 45]],
    [[6, 29, 49], [6, 55, 45]],
    [[16, 30, 47], [16, 54, 43]],
    [[26, 32, 43], [26, 52, 40]]
  ];
  toothLines.forEach(line => {
    drawPath(line, false);
    ctx.stroke();
  });

  // Batas Rahang Atas & Dagu Bawah
  drawPath([[-36, 28, 44], [0, 26, 52], [36, 28, 44]], false);
  ctx.stroke();
  drawPath([[-28, 56, 40], [0, 58, 46], [28, 56, 40]], false);
  ctx.stroke();

  // --- Bola Mata Kobaran Api Menembus Rongga Gelap ---
  const leftPupil = project3D(-34, -20, 44);
  const rightPupil = project3D(34, -20, 44);
  const eyeR = (isScanning ? 7.5 : 5.5) * leftPupil.scale;

  [leftPupil, rightPupil].forEach(eye => {
    if (eye.scale > 0) {
      ctx.save();
      // Flare Luar
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, eyeR * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 70, 0, 0.45)';
      ctx.fill();

      // Inti Api Emas Menyala
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = isScanning ? '#ffffff' : '#ffea00';
      ctx.shadowBlur = isScanning ? 28 : 20;
      ctx.shadowColor = '#ff3b00';
      ctx.fill();
      ctx.restore();
    }
  });

  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;

  requestAnimationFrame(render3D);
}
render3D();

// ==========================================
// 2. LOGIKA VALIDASI AKUN INSTAGRAM
// ==========================================
const inputData = document.getElementById('inputData');
const outputData = document.getElementById('outputData');
const startBtn = document.getElementById('startBtn');
const copyBtn = document.getElementById('copyBtn');
const statusInfo = document.getElementById('statusInfo');
const liveCounter = document.getElementById('liveCounter');

function extractUsername(line) {
  const clean = line.trim();
  if (!clean) return null;
  const tokens = clean.split(/[\s|,]+/);
  return tokens.length > 0 && tokens[0] ? tokens[0].replace(/^@/, '').trim() : null;
}

async function isInstagramLive(username) {
  const cleanUser = username.toLowerCase().trim().replace(/^@/, '');
  if (!cleanUser) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanUser)}/`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    clearTimeout(timeoutId);

    if (response.status === 404 || response.status === 410) {
      return false;
    }

    if (response.status === 429) {
      return 'RATE_LIMITED';
    }

    if (response.status !== 200) {
      return false;
    }

    const html = await response.text();
    const lowerHtml = html.toLowerCase();

    // 1. Ekstraksi <title>
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().toLowerCase() : '';

    // Deteksi halaman error berdasarkan judul halaman
    const isDeadTitle =
      title.includes('page not found') ||
      title.includes('halaman tidak ditemukan') ||
      title.includes('halaman tidak tersedia') ||
      title.includes("sorry, this page isn't available") ||
      title.includes('content unavailable') ||
      title === 'instagram' ||
      title.startsWith('login') ||
      title.startsWith('masuk');

    if (isDeadTitle) {
      return false;
    }

    // 2. Deteksi teks error di luar tag <script>
    const cleanBody = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').toLowerCase();
    const isDeadBody =
      cleanBody.includes('page not found') ||
      cleanBody.includes('halaman tidak ditemukan') ||
      cleanBody.includes("sorry, this page isn't available") ||
      cleanBody.includes('maaf, halaman ini tidak tersedia') ||
      cleanBody.includes('the link you followed may be broken') ||
      cleanBody.includes('tautan yang anda ikuti mungkin rusak');

    if (isDeadBody) {
      return false;
    }

    // 3. Verifikasi konfirmasi profil aktif
    const hasUserInTitle =
      title.includes(`@${cleanUser}`) ||
      title.includes(`(${cleanUser})`) ||
      (title.includes(cleanUser) && title.includes('instagram'));

    const hasDeepLink =
      lowerHtml.includes(`instagram://user?username=${cleanUser}`) ||
      lowerHtml.includes(`/_u/${cleanUser}/`) ||
      lowerHtml.includes(`/_u/${cleanUser}`);

    const hasCanonical =
      lowerHtml.includes(`instagram.com/${cleanUser}/`) ||
      lowerHtml.includes(`instagram.com/${cleanUser}`);

    const hasUserMeta = lowerHtml.includes(`"username":"${cleanUser}"`);
    const hasProfileProps = lowerHtml.includes('"is_private"') || lowerHtml.includes('"profile_pic_url"');

    if (hasUserInTitle || hasDeepLink || (hasCanonical && hasProfileProps) || (hasUserMeta && hasProfileProps)) {
      return true;
    }

    return false;
  } catch (error) {
    clearTimeout(timeoutId);
    return false;
  }
}

async function processParallel(items, concurrency, taskHandler) {
  let index = 0;
  const workers = new Array(concurrency).fill(null).map(async () => {
    while (index < items.length) {
      const currentIndex = index++;
      await taskHandler(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

startBtn.addEventListener('click', async () => {
  const lines = inputData.value.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    statusInfo.textContent = 'STATUS: INPUT KOSONG';
    return;
  }

  startBtn.disabled = true;
  outputData.value = '';
  liveCounter.textContent = '0';
  isScanning = true;
  mainCard.classList.add('scanning');

  const activeAccounts = [];
  let completedCount = 0;
  let rateLimitHit = false;
  const CONCURRENCY = 2;

  await processParallel(lines, CONCURRENCY, async (rawLine) => {
    const username = extractUsername(rawLine);

    if (username) {
      const result = await isInstagramLive(username);

      if (result === 'RATE_LIMITED') {
        rateLimitHit = true;
      } else if (result === true) {
        activeAccounts.push(rawLine);
        outputData.value = activeAccounts.join('\n');
        liveCounter.textContent = String(activeAccounts.length);
      }
    }

    completedCount++;
    statusInfo.textContent = `PINDAI (${completedCount}/${lines.length}): @${username || '-'}`;
    await new Promise(res => setTimeout(res, 250));
  });

  isScanning = false;
  mainCard.classList.remove('scanning');
  startBtn.disabled = false;

  if (rateLimitHit) {
    statusInfo.textContent = `SELESAI (RATE LIMIT IG). AKTIF: ${activeAccounts.length}`;
  } else {
    statusInfo.textContent = `SELESAI. AKTIF: ${activeAccounts.length}/${lines.length}`;
  }
});

copyBtn.addEventListener('click', () => {
  if (!outputData.value.trim()) {
    statusInfo.textContent = 'STATUS: DATA KOSONG';
    return;
  }

  navigator.clipboard.writeText(outputData.value).then(() => {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'TERSALIN!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 1500);
  });
});