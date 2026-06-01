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
  const pages = { cam: 'pageCam', gallery: 'pageGallery', recap: 'pageRecap' };
  const navs  = { cam: 'navCamera', gallery: 'navGallery', recap: 'navRecap' };

  Object.values(pages).forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById(pages[key]).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(navs[key]).classList.add('active');

  if (key === 'gallery') loadGalleryPage();
}

document.getElementById('navCamera').addEventListener('click',  () => showPage('cam'));
document.getElementById('navGallery').addEventListener('click', () => showPage('gallery'));
document.getElementById('navRecap').addEventListener('click',   () => showPage('recap'));

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
    renderTagGrid();
    tagNextSlot++;
    if (tagNextSlot >= 9) {
      showToast('🎉 ครบ 9 รูปแล้ว!');
      snapBtn.disabled = true;
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

  // show grid overlay
  tagGridOverlay.classList.add('active');
  renderTagGrid();

  // enable shutter if camera is live
  if (stream) snapBtn.disabled = false;
}

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
      <div class="gallery-empty" style="grid-column:span 3">
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

    cell.addEventListener('click', () => window.open(item.image_url, '_blank'));
    photoGrid.appendChild(cell);
  });
}

capsuleBtn.addEventListener('click', () => showToast('💊 Capsule — coming soon!'));

// ── GUEST MODAL ──────────────────────────────────────────────
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
