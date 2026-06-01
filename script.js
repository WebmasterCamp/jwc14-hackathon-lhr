// ============================================================
//  CAPTUROW — script.js
// ============================================================

// ── SUPABASE CONFIG ─────────────────────────────────────────
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY_HERE';
const SUPABASE_READY    = !SUPABASE_URL.includes('YOUR_PROJECT_ID');

let db = null;
try {
  if (SUPABASE_READY && typeof supabase !== 'undefined') {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch(e) { console.warn('Supabase init failed, using localStorage', e); }

// ── DOM REFS ────────────────────────────────────────────────
const video           = document.getElementById('webcam');
const canvas          = document.getElementById('canvas');
const snapBtn         = document.getElementById('snapBtn');
const flashBtn        = document.getElementById('flashBtn');
const flashOverlay    = document.getElementById('flashOverlay');
const camPlaceholder  = document.getElementById('camPlaceholder');
const startCamOverlay = document.getElementById('startCamOverlay');
const camStatus       = document.getElementById('camStatus');
const galleryStrip    = document.getElementById('galleryStrip');
const colorHuntBtn    = null;
const toastEl         = document.getElementById('toast');
const photoGrid       = document.getElementById('photoGrid');
const monthLabel      = document.getElementById('monthLabel');
const monthBack       = document.getElementById('monthBack');
const monthFwd        = document.getElementById('monthFwd');
const capsuleBtn      = document.getElementById('capsuleBtn');
const tagGridOverlay  = document.getElementById('tagGridOverlay');
const pillLabel       = document.getElementById('guestBtn'); // the pill span
const profileIcon     = document.getElementById('profileIcon');
const tagBackBtn      = document.getElementById('tagBackBtn');

// ── STATE ───────────────────────────────────────────────────
let stream      = null;
let isSaving    = false;
let currentDate = new Date();

// tag-mode state
let tagMode       = false;   // true when a tag is active
let tagSlots      = [];      // array of 9 dataURLs or null
let tagNextSlot   = 0;       // index of next empty slot (0-8)

// ── TOAST ───────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ── PAGE NAVIGATION ─────────────────────────────────────────
function showPage(key) {
  const pages = { cam: 'pageCam', gallery: 'pageGallery' };
  const navs  = { cam: 'navCamera', gallery: 'navGallery' };

  Object.values(pages).forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById(pages[key]).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(navs[key]).classList.add('active');

  if (key === 'gallery') loadGalleryPage();
}

document.getElementById('navCamera').addEventListener('click',  () => showPage('cam'));
document.getElementById('navGallery').addEventListener('click', () => showPage('gallery'));

// ── CAMERA ──────────────────────────────────────────────────
async function startCamera() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    camPlaceholder.style.display  = 'none';
    startCamOverlay.style.display = 'none';
    camStatus.classList.add('live');
    snapBtn.disabled = false;
    showToast('📷 กล้องพร้อมแล้ว!');
  } catch (err) {
    showToast('❌ ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง');
  }
}
startCamOverlay.addEventListener('click', startCamera);

// ── FLASH placeholder ───────────────────────────────────────
flashBtn.addEventListener('click', () => { /* no action */ });

// ── SHUTTER ─────────────────────────────────────────────────
snapBtn.addEventListener('click', async () => {
  if (!stream || isSaving) return;
  isSaving = true;
  snapBtn.classList.add('loading');
  snapBtn.disabled = true;

  const ctx = canvas.getContext('2d');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // ── TAG MODE: fill next slot ────────────────────────────
  if (tagMode) {
    if (tagNextSlot >= 9) {
      showToast('✅ ครบ 9 รูปแล้ว!');
      resetShutter();
      return;
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    tagSlots[tagNextSlot] = dataUrl;
    tagNextSlot++;
    renderTagGrid();

    if (tagNextSlot >= 9) {
      // merge all 9 into one image and save
      snapBtn.disabled = true;
      await mergeAndSaveTagGrid();
    }
    resetShutter();
    return;
  }


  // ── NORMAL MODE: save to storage ───────────────────────
  canvas.toBlob(async (blob) => {
    if (!blob) { showToast('❌ ดึงรูปภาพไม่ได้'); resetShutter(); return; }

    const now      = new Date().toISOString();
    const fileName = `memory_${Date.now()}.jpg`;

    if (db) {
      try {
        const { error: upErr } = await db.storage.from('memory-files')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;

        const { data: urlData } = db.storage.from('memory-files').getPublicUrl(fileName);

        const { error: dbErr } = await db.from('memories')
          .insert([{ image_url: urlData.publicUrl, file_name: fileName, created_at: now }]);
        if (dbErr) throw dbErr;

        showToast('✨ บันทึกความทรงจำแล้ว!');
        loadCameraStrip();
      } catch (err) {
        showToast('❌ บันทึกไม่สำเร็จ: ' + err.message);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        const stored = JSON.parse(localStorage.getItem('capturow_memories') || '[]');
        stored.unshift({ image_url: reader.result, created_at: now });
        if (stored.length > 50) stored.length = 50;
        localStorage.setItem('capturow_memories', JSON.stringify(stored));
        showToast('✨ บันทึกแล้ว!');
        loadCameraStrip();
      };
      reader.readAsDataURL(blob);
    }
    resetShutter();
  }, 'image/jpeg', 0.92);
});

function resetShutter() {
  isSaving = false;
  snapBtn.classList.remove('loading');
  snapBtn.disabled = false;
}

// ── COLOR HUNT (removed) ─────────────────────────────────────

// ── TAG MODE HELPERS ─────────────────────────────────────────
function enterTagMode(tagName) {
  tagMode     = true;
  tagSlots    = new Array(9).fill(null);
  tagNextSlot = 0;

  // update pill label
  pillLabel.textContent = tagName;

  // swap profile icon → back button
  profileIcon.style.display = 'none';
  tagBackBtn.classList.add('visible');

  // show grid overlay
  tagGridOverlay.classList.add('active');
  renderTagGrid();

  // enable shutter if camera is live
  if (stream) snapBtn.disabled = false;
}

function exitTagMode() {
  tagMode     = false;
  tagSlots    = [];
  tagNextSlot = 0;

  // restore pill label
  pillLabel.textContent = 'quest';

  // swap back button → profile icon
  tagBackBtn.classList.remove('visible');
  profileIcon.style.display = '';

  // hide grid overlay
  tagGridOverlay.classList.remove('active');
  tagGridOverlay.innerHTML = '';

  // re-enable shutter if camera is live
  if (stream) snapBtn.disabled = false;
}

// back button handler
tagBackBtn.addEventListener('click', exitTagMode);

function renderTagGrid() {
  tagGridOverlay.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'tag-cell' + (tagSlots[i] ? ' filled' : '');
    if (i === tagNextSlot && tagNextSlot < 9) cell.classList.add('next-target');

    if (tagSlots[i]) {
      const img = document.createElement('img');
      img.src = tagSlots[i];
      cell.appendChild(img);
    } else {
      const num = document.createElement('div');
      num.className = 'tag-cell-num';
      num.textContent = i + 1;
      cell.appendChild(num);
    }
    tagGridOverlay.appendChild(cell);
  }
}

async function mergeAndSaveTagGrid() {
  // draw 9 images into a 3x3 grid on a single canvas
  const SIZE = 900;          // output canvas size (square)
  const CELL = SIZE / 3;     // each cell = 300px
  const GAP  = 4;            // gap between cells in px

  const mergeCanvas = document.createElement('canvas');
  mergeCanvas.width  = SIZE;
  mergeCanvas.height = SIZE;
  const mCtx = mergeCanvas.getContext('2d');
  mCtx.fillStyle = '#1a1008';
  mCtx.fillRect(0, 0, SIZE, SIZE);

  // load all 9 images
  const loadImg = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });

  const imgs = await Promise.all(tagSlots.map(loadImg));

  imgs.forEach((img, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x   = col * CELL + (col > 0 ? GAP : 0);
    const y   = row * CELL + (row > 0 ? GAP : 0);
    const w   = CELL - (col > 0 ? GAP : 0);
    const h   = CELL - (row > 0 ? GAP : 0);
    // cover-fit the image into the cell
    const scale = Math.max(w / img.width, h / img.height);
    const sw    = w / scale;
    const sh    = h / scale;
    const sx    = (img.width  - sw) / 2;
    const sy    = (img.height - sh) / 2;
    mCtx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  });

  // save merged image
  const now      = new Date().toISOString();
  const fileName = `tag_${Date.now()}.jpg`;

  mergeCanvas.toBlob(async (blob) => {
    if (!blob) { showToast('❌ รวมรูปไม่สำเร็จ'); return; }

    if (db) {
      try {
        const { error: upErr } = await db.storage.from('memory-files')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = db.storage.from('memory-files').getPublicUrl(fileName);
        const { error: dbErr } = await db.from('memories')
          .insert([{ image_url: urlData.publicUrl, file_name: fileName, created_at: now }]);
        if (dbErr) throw dbErr;
        showToast('🎉 บันทึก 9 รูปเป็นเฟรมเดียวแล้ว!');
        loadCameraStrip();
      } catch (err) {
        showToast('❌ บันทึกไม่สำเร็จ: ' + err.message);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        const stored = JSON.parse(localStorage.getItem('capturow_memories') || '[]');
        stored.unshift({ image_url: reader.result, created_at: now });
        if (stored.length > 50) stored.length = 50;
        localStorage.setItem('capturow_memories', JSON.stringify(stored));
        showToast('🎉 บันทึก 9 รูปเป็นเฟรมเดียวแล้ว!');
        loadCameraStrip();
      };
      reader.readAsDataURL(blob);
    }
  }, 'image/jpeg', 0.92);
}

// ── CAMERA STRIP (2 latest) ──────────────────────────────────
async function loadCameraStrip() {
  let items = [];
  if (db) {
    try {
      const { data } = await db.from('memories').select('image_url,created_at')
        .order('created_at', { ascending: false }).limit(2);
      if (data) items = data;
    } catch(e) {}
  } else {
    items = JSON.parse(localStorage.getItem('capturow_memories') || '[]').slice(0, 2);
  }

  const slots = [items[0] || null, items[1] || null];
  galleryStrip.innerHTML = '';
  slots.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-thumb';
    if (item) {
      const img = document.createElement('img');
      img.src = item.image_url; img.alt = 'memory'; img.loading = 'lazy';
      card.appendChild(img);
      const badge = document.createElement('div');
      badge.className = 'thumb-date';
      badge.textContent = formatDate(item.created_at);
      card.appendChild(badge);
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => window.open(item.image_url, '_blank'));
    } else {
      const e = document.createElement('div');
      e.className = 'thumb-empty'; e.textContent = 'ยังไม่มีรูป';
      card.appendChild(e);
    }
    galleryStrip.appendChild(card);
  });
}

// ── GALLERY PAGE ─────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

function updateMonthLabel() {
  monthLabel.textContent = MONTH_NAMES[currentDate.getMonth()];
}

monthBack.addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  loadGalleryPage();
});

monthFwd.addEventListener('click', () => {
  const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  if (next <= new Date()) { currentDate = next; loadGalleryPage(); }
});

async function loadGalleryPage() {
  updateMonthLabel();
  photoGrid.innerHTML = '<div style="grid-column:span 3;text-align:center;padding:40px 0;color:rgba(255,255,255,0.2);font-family:Mitr,sans-serif;font-size:13px;">กำลังโหลด...</div>';

  let allItems = [];

  if (db) {
    try {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const end   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { data } = await db.from('memories').select('image_url,created_at')
        .gte('created_at', start).lte('created_at', end)
        .order('created_at', { ascending: false });
      if (data) allItems = data;
    } catch(e) {}
  } else {
    const stored = JSON.parse(localStorage.getItem('capturow_memories') || '[]');
    allItems = stored.filter(item => {
      const d = new Date(item.created_at);
      return d.getFullYear() === currentDate.getFullYear() &&
             d.getMonth()    === currentDate.getMonth();
    });
  }

  photoGrid.innerHTML = '';

  if (allItems.length === 0) {
    photoGrid.innerHTML = `
      <div class="gallery-empty" style="grid-column:span 4">
        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" style="opacity:0.3">
          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z"/>
        </svg>
        <span>ยังไม่มีรูปในเดือนนี้</span>
      </div>`;
    return;
  }

  allItems.forEach((item, i) => {
    const cell = document.createElement('div');
    cell.className = 'photo-cell';

    const img = document.createElement('img');
    img.src = item.image_url; img.alt = 'memory'; img.loading = 'lazy';
    cell.appendChild(img);

    const d       = new Date(item.created_at);
    const prevDay = i > 0 ? new Date(allItems[i-1].created_at).getDate() : -1;
    const isNewDay = d.getDate() !== prevDay;

    if (i === 0 || i === allItems.length - 1 || isNewDay) {
      const badge = document.createElement('div');
      badge.className = 'cell-date';
      badge.textContent = formatDate(item.created_at);
      cell.appendChild(badge);
    } else {
      const dots = document.createElement('div');
      dots.className = 'cell-dots';
      dots.textContent = '···';
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => openLightbox(item.image_url));
    photoGrid.appendChild(cell);
  });
}

capsuleBtn.addEventListener('click', () => showCapsulePage());

// ── CAPSULE PAGE ─────────────────────────────────────────────
const capsuleCanvas    = document.getElementById('capsuleCanvas');
const capsuleMonthText = document.getElementById('capsuleMonthText');
const capsuleDateRange = document.getElementById('capsuleDateRange');
const capsuleBackBtn   = document.getElementById('capsuleBackBtn');
const capsuleSaveBtn   = document.getElementById('capsuleSaveBtn');
const capsuleOpenBtn   = document.getElementById('capsuleOpenBtn');

let capsuleDataUrl = null; // holds the generated collage dataURL

capsuleBackBtn.addEventListener('click', () => showPage('gallery'));

async function showCapsulePage() {
  // switch to capsule page (no nav highlight needed)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('pageCapsule').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // set header info
  const mn = MONTH_NAMES[currentDate.getMonth()];
  capsuleMonthText.textContent = mn;

  // load photos for current month
  let items = [];
  if (db) {
    try {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const end   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { data } = await db.from('memories').select('image_url,created_at')
        .gte('created_at', start).lte('created_at', end)
        .order('created_at', { ascending: true });
      if (data) items = data;
    } catch(e) {}
  } else {
    const stored = JSON.parse(localStorage.getItem('capturow_memories') || '[]');
    items = stored.filter(item => {
      const d = new Date(item.created_at);
      return d.getFullYear() === currentDate.getFullYear() &&
             d.getMonth()    === currentDate.getMonth();
    }).reverse();
  }

  // date range label
  if (items.length > 0) {
    const first = new Date(items[0].created_at);
    const last  = new Date(items[items.length - 1].created_at);
    const fmt   = d => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    capsuleDateRange.textContent = `${fmt(first)} - ${fmt(last)}`;
  } else {
    capsuleDateRange.textContent = '';
  }

  if (items.length === 0) {
    // draw empty state on canvas
    const W = 600, H = 400;
    capsuleCanvas.width = W; capsuleCanvas.height = H;
    const ctx = capsuleCanvas.getContext('2d');
    ctx.fillStyle = '#f5ede0';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(44,31,20,0.25)';
    ctx.font = '20px Mitr, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ยังไม่มีรูปในเดือนนี้', W/2, H/2);
    capsuleDataUrl = null;
    return;
  }

  // pick up to 9 photos (shuffle for variety each time)
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  const picks    = shuffled.slice(0, Math.min(9, shuffled.length));

  // load images
  const loadImg = src => new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  const imgs = (await Promise.all(picks.map(p => loadImg(p.image_url)))).filter(Boolean);

  // generate collage layout based on count
  capsuleDataUrl = buildCollage(imgs, mn);
}

function buildCollage(imgs, monthName) {
  const W   = 600;
  const PAD = 12;   // outer padding
  const GAP = 6;    // gap between cells
  const BG  = '#F5EDE0';

  const n = imgs.length;

  // choose layout: list of {x,y,w,h} as fractions of inner area
  const inner = W - PAD * 2;
  let layout = [];

  if (n === 1) {
    layout = [{ x:0, y:0, w:1, h:1 }];
  } else if (n === 2) {
    layout = [
      { x:0,   y:0, w:0.5, h:1 },
      { x:0.5, y:0, w:0.5, h:1 },
    ];
  } else if (n === 3) {
    layout = [
      { x:0,   y:0,   w:0.6,  h:1   },
      { x:0.6, y:0,   w:0.4,  h:0.5 },
      { x:0.6, y:0.5, w:0.4,  h:0.5 },
    ];
  } else if (n === 4) {
    layout = [
      { x:0,   y:0,   w:0.5, h:0.5 },
      { x:0.5, y:0,   w:0.5, h:0.5 },
      { x:0,   y:0.5, w:0.5, h:0.5 },
      { x:0.5, y:0.5, w:0.5, h:0.5 },
    ];
  } else if (n === 5) {
    layout = [
      { x:0,    y:0,    w:0.6,  h:0.55 },
      { x:0.6,  y:0,    w:0.4,  h:0.55 },
      { x:0,    y:0.55, w:0.33, h:0.45 },
      { x:0.33, y:0.55, w:0.34, h:0.45 },
      { x:0.67, y:0.55, w:0.33, h:0.45 },
    ];
  } else if (n === 6) {
    layout = [
      { x:0,    y:0,    w:0.5,  h:0.5  },
      { x:0.5,  y:0,    w:0.25, h:0.5  },
      { x:0.75, y:0,    w:0.25, h:0.5  },
      { x:0,    y:0.5,  w:0.25, h:0.5  },
      { x:0.25, y:0.5,  w:0.25, h:0.5  },
      { x:0.5,  y:0.5,  w:0.5,  h:0.5  },
    ];
  } else {
    // 7-9: big one top-left, rest fill grid
    layout = [
      { x:0,    y:0,    w:0.6,  h:0.55 },
      { x:0.6,  y:0,    w:0.4,  h:0.275},
      { x:0.6,  y:0.275,w:0.4,  h:0.275},
      { x:0,    y:0.55, w:0.33, h:0.45 },
      { x:0.33, y:0.55, w:0.34, h:0.45 },
      { x:0.67, y:0.55, w:0.33, h:0.45 },
    ];
    // add extra cells if n > 6 (up to 9) — shrink to 3-col bottom rows
    if (n >= 7) layout.push({ x:0, y:0, w:0, h:0 }); // placeholder, handled below
    // simpler: just use up to 6 for layout, ignore rest
  }

  // cap to layout slots
  const usedImgs = imgs.slice(0, layout.length);

  // compute canvas height from tallest layout
  const maxBottom = layout.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  const H = Math.round(inner * maxBottom) + PAD * 2;

  capsuleCanvas.width  = W;
  capsuleCanvas.height = H;
  const ctx = capsuleCanvas.getContext('2d');

  // background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  usedImgs.forEach((img, i) => {
    const cell = layout[i];
    const cx = PAD + cell.x * inner + (i > 0 ? GAP/2 : 0);
    const cy = PAD + cell.y * (H - PAD*2) + (cell.y > 0 ? GAP/2 : 0);
    const cw = cell.w * inner - GAP/2;
    const ch = cell.h * (H - PAD*2) - GAP/2;

    // cover-fit
    const scale = Math.max(cw / img.width, ch / img.height);
    const sw = cw / scale, sh = ch / scale;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;

    ctx.save();
    // rounded clip
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + cw - r, cy);
    ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + r);
    ctx.lineTo(cx + cw, cy + ch - r);
    ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - r, cy + ch);
    ctx.lineTo(cx + r, cy + ch);
    ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - r);
    ctx.lineTo(cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, cx, cy, cw, ch);
    ctx.restore();
  });

  return capsuleCanvas.toDataURL('image/jpeg', 0.92);
}

// save collage — download as .jpg
capsuleSaveBtn.addEventListener('click', () => {
  if (!capsuleDataUrl) { showToast('ยังไม่มีรูปให้บันทึก'); return; }
  const mn   = MONTH_NAMES[currentDate.getMonth()];
  const yr   = currentDate.getFullYear();
  const link = document.createElement('a');
  link.href     = capsuleDataUrl;
  link.download = `capsule_${mn}_${yr}.jpg`;
  link.click();
  showToast('💊 บันทึกรูปแล้ว!');
});

// share collage — Web Share API on mobile, fallback open tab on desktop
capsuleOpenBtn.addEventListener('click', async () => {
  if (!capsuleDataUrl) { showToast('ยังไม่มีรูปให้แชร์'); return; }

  if (navigator.share && navigator.canShare) {
    try {
      // convert dataURL → File
      const res  = await fetch(capsuleDataUrl);
      const blob = await res.blob();
      const mn   = MONTH_NAMES[currentDate.getMonth()];
      const yr   = currentDate.getFullYear();
      const file = new File([blob], `capsule_${mn}_${yr}.jpg`, { type: 'image/jpeg' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Capsule ${mn} ${yr}`,
        });
        return;
      }
    } catch(e) {
      if (e.name !== 'AbortError') showToast('แชร์ไม่สำเร็จ');
      return;
    }
  }
  // fallback: open in new tab
  window.open(capsuleDataUrl, '_blank');
});

// ── LIGHTBOX ─────────────────────────────────────────────────
const lightbox      = document.getElementById('lightbox');
const lightboxImg   = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxSave  = document.getElementById('lightboxSave');
const lightboxShare = document.getElementById('lightboxShare');

function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.classList.add('open');
}

lightboxClose.addEventListener('click', () => {
  lightbox.classList.remove('open');
  lightboxImg.src = '';
});

// close on backdrop tap
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
  }
});

// download
lightboxSave.addEventListener('click', () => {
  const url = lightboxImg.src;
  if (!url) return;
  const link = document.createElement('a');
  link.href     = url;
  link.download = `memory_${Date.now()}.jpg`;
  link.click();
  showToast('📥 บันทึกรูปแล้ว!');
});

// share
lightboxShare.addEventListener('click', async () => {
  const url = lightboxImg.src;
  if (!url) return;

  if (navigator.share && navigator.canShare) {
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `memory_${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch(e) {
      if (e.name !== 'AbortError') showToast('แชร์ไม่สำเร็จ');
      return;
    }
  }
  window.open(url, '_blank');
});

// ── QUEST MODAL ──────────────────────────────────────────────
const guestBtn   = document.getElementById('guestBtn');
const guestModal = document.getElementById('guestModal');

guestBtn.addEventListener('click', () => {
  guestModal.classList.toggle('open');
});

// close when tapping backdrop (outside the card)
guestModal.addEventListener('click', (e) => {
  if (e.target === guestModal) guestModal.classList.remove('open');
});

// tag buttons — enter tag mode
guestModal.querySelectorAll('.guest-tag-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    guestModal.classList.remove('open');
    enterTagMode(btn.textContent.trim());
  });
});

// ── INIT ─────────────────────────────────────────────────────
loadCameraStrip();
updateMonthLabel();
