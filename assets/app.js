/* ==========================================================
   Mert Yeşil Eğitim Portalı — Akıllı Tahta v2.0
   Kütüphane · Google Drive · Kitap/Sayfa okuyucu · Çizim · Sınıf araçları
   ========================================================== */
'use strict';

const CFG = Object.assign(
  { appName: 'Akıllı Tahta', version: '2.0', googleApiKey: '', corsProxy: '', driveFolders: [], books: [] },
  window.TAHTA_CONFIG || {}
);

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const QR_LIB_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const BOARD_RATIO = 16 / 9;
const BOARD_BOOK = { id: '__board__', title: 'Beyaz Tahta', category: 'Tahta', source: { type: 'board' }, origin: 'system' };
const QUALITY = { normal: 1, high: 1.5, ultra: 2 };
const GOOGLE_NATIVE = {
  'application/vnd.google-apps.document': 'Google Dokümanlar',
  'application/vnd.google-apps.presentation': 'Google Slaytlar',
  'application/vnd.google-apps.spreadsheet': 'Google E-Tablolar'
};

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';

/* ---------------- Yardımcılar ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const trLower = (s) => String(s || '').toLocaleLowerCase('tr');
const pad2 = (n) => String(n).padStart(2, '0');

function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return Math.floor(s / 60) + ' dk önce';
  if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
  return Math.floor(s / 86400) + ' gün önce';
}

function slug(s) {
  return trLower(s).replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sayfa';
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Betik yüklenemedi: ' + src));
    document.head.appendChild(s);
  });
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('mytahta.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mytahta.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('mytahta.' + k); } catch (e) { /* yok */ } },
  keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith('mytahta.')); } catch (e) { return []; } }
};

/* Cihaza kaydedilen PDF dosyaları için IndexedDB */
const blobDB = {
  _db: null,
  open() {
    if (!this._db) {
      this._db = new Promise((res, rej) => {
        const r = indexedDB.open('mytahta', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return this._db;
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  put(k, v) { return this.run('readwrite', (s) => s.put(v, k)); },
  get(k) { return this.run('readonly', (s) => s.get(k)); },
  del(k) { return this.run('readwrite', (s) => s.delete(k)); }
};

function toast(msg, type = 'info', ms = 3200, action = null) {
  const icons = { info: 'fa-circle-info', ok: 'fa-circle-check', warn: 'fa-triangle-exclamation', err: 'fa-circle-xmark' };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.className = 'mini';
    b.textContent = action.label;
    b.onclick = () => { action.fn(); dismiss(); };
    t.appendChild(b);
  }
  $('#toast-stack').appendChild(t);
  const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  if (ms) setTimeout(dismiss, ms);
  return { el: t, dismiss, set(text) { t.querySelector('span').textContent = text; } };
}

/* ---------------- Ayarlar ---------------- */
const DEFAULT_SETTINGS = { apiKey: '', proxy: '', theme: 'auto', sound: true, quality: 'high', defaultMode: 'flip', autoResume: true, autohide: '0' };
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
const apiKey = () => (settings.apiKey || CFG.googleApiKey || '').trim();
const proxyBase = () => (settings.proxy || CFG.corsProxy || '').trim();
const saveSettings = () => store.set('settings', settings);

const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false };
function applyTheme() {
  const t = settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.dataset.theme = t;
  $('#btn-theme i').className = t === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}
if (darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

/* ---------------- Google Drive ---------------- */
const Drive = {
  parse(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    let m;
    if ((m = s.match(/\/folders\/([\w-]{10,})/))) return { type: 'folder', id: m[1] };
    if ((m = s.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([\w-]{10,})/))) {
      const kind = s.match(/\/(document|presentation|spreadsheets)\/d\//);
      const mime = kind ? { document: 'application/vnd.google-apps.document', presentation: 'application/vnd.google-apps.presentation', spreadsheets: 'application/vnd.google-apps.spreadsheet' }[kind[1]] : undefined;
      return { type: 'file', id: m[1], mime };
    }
    if ((m = s.match(/[?&]id=([\w-]{10,})/))) return { type: /folderview|\/folders/.test(s) ? 'folder' : 'file', id: m[1] };
    if (/^[\w-]{20,}$/.test(s)) return { type: 'file', id: s };
    return null;
  },
  fileUrl(id, mime) {
    const k = apiKey();
    if (!k) return null;
    const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id);
    if (mime && GOOGLE_NATIVE[mime]) return `${base}/export?mimeType=application%2Fpdf&key=${encodeURIComponent(k)}`;
    return `${base}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(k)}`;
  },
  proxiedUrl(id) {
    const p = proxyBase();
    if (!p) return null;
    const target = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    return p.includes('{url}') ? p.replace('{url}', encodeURIComponent(target)) : p + encodeURIComponent(target);
  },
  previewUrl: (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,
  viewUrl: (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`,
  folderUrl: (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`,
  thumbUrl: (id, w = 480) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`,
  async api(path, params = {}) {
    const k = apiKey();
    if (!k) throw new Error('Google API anahtarı tanımlı değil.');
    const u = new URL('https://www.googleapis.com/drive/v3/' + path);
    Object.entries({ ...params, key: k }).forEach(([a, b]) => u.searchParams.set(a, b));
    const r = await fetch(u);
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* yok */ }
      if (r.status === 404) msg = 'Dosya bulunamadı veya herkese açık paylaşılmamış.';
      throw new Error(msg);
    }
    return r.json();
  },
  meta(id) {
    return this.api('files/' + encodeURIComponent(id), { fields: 'id,name,mimeType,size,modifiedTime', supportsAllDrives: 'true' });
  },
  async listFolder(folderId, depth = 0, path = []) {
    const out = [];
    let pageToken = '';
    do {
      const params = {
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
        pageSize: '1000', orderBy: 'folder,name', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'
      };
      if (pageToken) params.pageToken = pageToken;
      const j = await this.api('files', params);
      for (const f of j.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (depth < 3) out.push(...await this.listFolder(f.id, depth + 1, [...path, f.name]));
        } else if (f.mimeType === 'application/pdf' || GOOGLE_NATIVE[f.mimeType]) {
          out.push({ ...f, path });
        }
      }
      pageToken = j.nextPageToken;
    } while (pageToken);
    return out;
  }
};

/* ---------------- Kütüphane verisi ---------------- */
let userBooks = store.get('library', []);
let folderSources = store.get('folders', []);
const favorites = new Set(store.get('favorites', []));
const progress = store.get('progress', {});
const covers = store.get('covers', {});
const MEMORY = new Map(); // kaydedilmeden açılan yerel dosyalar
const ui = Object.assign({ tab: 'all', cat: 'all', q: '', sort: 'default' }, store.get('ui', {}), { q: '' });

function normalizeBook(b, origin) {
  const book = { ...b, origin: b.origin || origin };
  if (!book.source) {
    if (b.drive) {
      const p = Drive.parse(b.drive);
      if (p) book.source = { type: 'drive', id: p.id, mime: b.mime || p.mime };
    } else if (b.pdfUrl) {
      book.source = { type: 'url', url: b.pdfUrl };
    }
  }
  if (!book.source) book.source = { type: 'url', url: '' };
  if (!book.cover && b.coverUrl) book.cover = b.coverUrl;
  if (!book.id) book.id = (book.source.type === 'drive' ? 'drive-' + book.source.id : 'b-' + hashStr(JSON.stringify(book.source)));
  book.category = book.category || 'Genel';
  book.title = book.title || 'Adsız Kitap';
  delete book.pdfUrl; delete book.coverUrl; delete book.drive;
  return book;
}

const DEFAULT_BOOKS = (CFG.books || []).map((b) => normalizeBook(b, 'default'));

function allBooks() {
  const ids = new Set(DEFAULT_BOOKS.map((b) => b.id));
  return [...DEFAULT_BOOKS, ...userBooks.filter((b) => !ids.has(b.id))];
}
const findBook = (id) => allBooks().find((b) => b.id === id);
const saveLibrary = () => { if (!store.set('library', userBooks)) toast('Kütüphane kaydedilemedi: depolama alanı dolu.', 'err'); };
const saveFolders = () => store.set('folders', folderSources);

function upsertUserBook(book) {
  const i = userBooks.findIndex((b) => b.id === book.id);
  if (i >= 0) userBooks[i] = { ...userBooks[i], ...book };
  else userBooks.push(book);
  saveLibrary();
}

function coverFor(book) {
  return book.cover || covers[book.id] || (book.source.type === 'drive' ? Drive.thumbUrl(book.source.id) : null);
}

function saveCovers() {
  const keys = Object.keys(covers);
  while (!store.set('covers', covers) && keys.length) delete covers[keys.shift()];
}

async function makeCover(page, id) {
  try {
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 360 / vp1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    covers[id] = c.toDataURL('image/jpeg', 0.74);
    c.width = c.height = 0;
    saveCovers();
  } catch (e) { /* kapak isteğe bağlı */ }
}

function sourceInfo(book) {
  const t = book.source.type;
  if (t === 'drive') return { icon: 'fa-brands fa-google-drive', label: GOOGLE_NATIVE[book.source.mime] || 'Drive', cls: 'drive' };
  if (t === 'local' || t === 'memory') return { icon: 'fa-solid fa-hard-drive', label: 'Cihaz', cls: 'local' };
  if (t === 'board') return { icon: 'fa-solid fa-chalkboard', label: 'Tahta', cls: '' };
  return { icon: 'fa-solid fa-globe', label: 'Web', cls: '' };
}

/* ---------------- Kütüphane arayüzü ---------------- */
function coverHTML(book) {
  const src = coverFor(book);
  const h = parseInt(hashStr(book.title).slice(0, 4), 36) % 360;
  const fb = `<div class="cover-fallback" style="--h:${h}"><i class="${sourceInfo(book).icon}"></i><b>${esc(book.title)}</b></div>`;
  return src
    ? `${fb}<img src="${esc(src)}" alt="" class="book-cover-img" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" style="position:relative">`
    : fb;
}

function tabFilter(list, tab) {
  if (tab === 'fav') return list.filter((b) => favorites.has(b.id));
  if (tab === 'recent') return list.filter((b) => progress[b.id]);
  if (tab === 'drive') return list.filter((b) => b.source.type === 'drive');
  if (tab === 'mine') return list.filter((b) => b.origin !== 'default');
  return list;
}

function renderLibrary() {
  const books = allBooks();
  // sekme sayaçları
  $$('#library-tabs .tab').forEach((t) => {
    const n = tabFilter(books, t.dataset.tab).length;
    t.querySelector('.count').textContent = n || '';
    t.classList.toggle('active', t.dataset.tab === ui.tab);
  });

  let list = tabFilter(books, ui.tab);
  const cats = [...new Set(list.map((b) => b.category))].sort((a, b) => a.localeCompare(b, 'tr'));
  if (ui.cat !== 'all' && !cats.includes(ui.cat)) ui.cat = 'all';
  $('#category-chips').innerHTML = cats.length > 1
    ? [`<button class="chip ${ui.cat === 'all' ? 'active' : ''}" data-cat="all">Tüm kategoriler</button>`,
      ...cats.map((c) => `<button class="chip ${ui.cat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)].join('')
    : '';
  $('#category-list').innerHTML = [...new Set(books.map((b) => b.category))].map((c) => `<option value="${esc(c)}">`).join('');

  if (ui.cat !== 'all') list = list.filter((b) => b.category === ui.cat);
  const words = trLower(ui.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    list = list.filter((b) => {
      const hay = trLower([b.title, b.category, b.type, b.grade, sourceInfo(b).label].join(' '));
      return words.every((w) => hay.includes(w));
    });
  }
  const sort = ui.tab === 'recent' && ui.sort === 'default' ? 'recent' : ui.sort;
  if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  else if (sort === 'recent') list.sort((a, b) => ((progress[b.id] || {}).ts || 0) - ((progress[a.id] || {}).ts || 0));
  else if (sort === 'added') list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  const grid = $('#book-grid');
  grid.innerHTML = list.map((b, i) => {
    const si = sourceInfo(b);
    const pr = progress[b.id];
    const pct = pr && pr.total ? Math.round(((pr.page + 1) / pr.total) * 100) : 0;
    const editable = b.origin !== 'default';
    return `
      <article class="book-card" tabindex="0" data-id="${esc(b.id)}" style="animation-delay:${Math.min(i, 16) * 30}ms">
        <div class="book-cover-wrapper">
          ${coverHTML(b)}
          <div class="book-badges">
            <span class="book-badge ${si.cls}"><i class="${si.icon}"></i> ${esc(b.grade || si.label)}</span>
            <div class="card-tools">
              <button class="fav-btn ${favorites.has(b.id) ? 'on' : ''}" data-act="fav" title="Favorilere ekle/çıkar"><i class="fa-${favorites.has(b.id) ? 'solid' : 'regular'} fa-star"></i></button>
              ${editable ? '<button class="fav-btn extra" data-act="edit" title="Adı / kategoriyi düzenle"><i class="fa-solid fa-pen"></i></button>' : ''}
              ${editable ? '<button class="fav-btn extra danger" data-act="del" title="Kütüphaneden kaldır"><i class="fa-solid fa-trash-can"></i></button>' : ''}
            </div>
          </div>
          ${pct ? `<div class="book-progress" title="%${pct} okundu"><div style="width:${pct}%"></div></div>` : ''}
        </div>
        <div class="book-info">
          <h3 class="book-title">${esc(b.title)}</h3>
          <div class="book-meta">
            <span><i class="fa-regular fa-folder"></i> ${esc(b.category)}</span>
          </div>
          <div class="book-meta">
            <span><i class="fa-regular fa-file-lines"></i> ${esc(b.type || si.label)}</span>
            ${pr ? `<span style="color:var(--primary);font-weight:700">Sayfa ${pr.page + 1}${pr.total ? '/' + pr.total : ''}</span>` : ''}
          </div>
          <div class="book-actions">
            <button class="btn-open-book" data-act="open"><i class="fa-solid fa-book-open"></i> ${pr ? 'Devam Et' : 'Kitabı Aç'}</button>
            ${shareLink(b, 0) ? '<button class="card-icon-btn" data-act="share" title="Paylaş / QR"><i class="fa-solid fa-qrcode"></i></button>' : ''}
          </div>
        </div>
      </article>`;
  }).join('');

  $('#empty-state').hidden = list.length > 0;
  $('#shelf-subtitle').textContent = list.length
    ? `${list.length} kitap · ${cats.length} kategori — bir kitap seçerek akıllı tahta modunda inceleyin.`
    : 'Bu görünümde kitap bulunamadı.';

  // Devam et şeridi
  const recents = books.filter((b) => progress[b.id] && progress[b.id].page > 0)
    .sort((a, b) => progress[b.id].ts - progress[a.id].ts).slice(0, 8);
  const showContinue = recents.length && ui.tab === 'all' && !words.length && ui.cat === 'all';
  $('#continue-section').hidden = !showContinue;
  if (showContinue) {
    $('#continue-row').innerHTML = recents.map((b) => {
      const pr = progress[b.id];
      const src = coverFor(b);
      return `<button class="continue-card" data-id="${esc(b.id)}">
        <div class="mini-cover">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
        <div><b>${esc(b.title)}</b><small>Sayfa ${pr.page + 1}${pr.total ? ' / ' + pr.total : ''} · ${timeAgo(pr.ts)}</small></div>
      </button>`;
    }).join('');
  }

  const syncable = apiKey() && (folderSources.length || (CFG.driveFolders || []).length);
  $('#btn-sync-drive').hidden = !syncable;
  store.set('ui', { tab: ui.tab, cat: ui.cat, sort: ui.sort });
}

function editBook(book) {
  const title = prompt('Kitap adı:', book.title);
  if (title === null) return;
  const category = prompt('Kategori:', book.category);
  if (category === null) return;
  upsertUserBook({ ...book, title: title.trim() || book.title, category: category.trim() || book.category });
  renderLibrary();
}

async function deleteBook(book) {
  if (!confirm(`"${book.title}" kütüphaneden kaldırılsın mı?\nBu kitaba ait çizimler ve okuma ilerlemesi de silinir.`)) return;
  userBooks = userBooks.filter((b) => b.id !== book.id);
  saveLibrary();
  if (book.source.type === 'local') { try { await blobDB.del(book.source.key); } catch (e) { /* yok */ } }
  delete progress[book.id]; store.set('progress', progress);
  delete covers[book.id]; saveCovers();
  favorites.delete(book.id); store.set('favorites', [...favorites]);
  store.del('ink.' + book.id);
  renderLibrary();
  toast('Kitap kaldırıldı.', 'ok');
}

/* ---------------- Drive klasör aktarımı ---------------- */
async function importFolder(folderId, opts = {}) {
  const t = opts.silent ? null : toast('Drive klasörü okunuyor…', 'info', 0);
  try {
    const meta = await Drive.meta(folderId);
    const files = await Drive.listFolder(folderId);
    const baseCat = opts.category || meta.name || 'Google Drive';
    const userIds = new Set(userBooks.filter((b) => b.folderId !== folderId).map((b) => b.id));
    const books = files.filter((f) => !userIds.has('drive-' + f.id)).map((f) => normalizeBook({
      id: 'drive-' + f.id,
      title: f.name.replace(/\.pdf$/i, ''),
      category: f.path.length ? `${baseCat} / ${f.path.join(' / ')}` : baseCat,
      type: GOOGLE_NATIVE[f.mimeType] || (f.size ? 'PDF · ' + fmtBytes(f.size) : 'PDF'),
      source: { type: 'drive', id: f.id, mime: f.mimeType },
      folderId,
      addedAt: Date.parse(f.modifiedTime) || Date.now()
    }, 'drive-folder'));
    userBooks = [...userBooks.filter((b) => b.folderId !== folderId), ...books];
    saveLibrary();
    const entry = { id: folderId, name: meta.name, category: opts.category || '', lastSync: Date.now(), count: books.length };
    const i = folderSources.findIndex((f) => f.id === folderId);
    if (i >= 0) folderSources[i] = entry; else folderSources.push(entry);
    saveFolders();
    renderLibrary();
    if (t) { t.dismiss(); toast(`"${meta.name}" klasöründen ${books.length} kitap aktarıldı.`, 'ok', 4000); }
    return books;
  } catch (err) {
    if (t) t.dismiss();
    toast('Drive klasörü aktarılamadı: ' + err.message, 'err', 6000);
    throw err;
  }
}

async function syncAllFolders(force = false) {
  if (!apiKey()) return;
  const configured = (CFG.driveFolders || []).map((f) => {
    const p = Drive.parse(typeof f === 'string' ? f : (f.link || f.id));
    return p ? { id: p.id, category: f.category || '' } : null;
  }).filter(Boolean);
  const all = [...configured];
  folderSources.forEach((f) => { if (!all.find((c) => c.id === f.id)) all.push({ id: f.id, category: f.category }); });
  const btn = $('#btn-sync-drive');
  btn.classList.add('spin');
  let total = 0;
  for (const f of all) {
    const known = folderSources.find((x) => x.id === f.id);
    if (!force && known && Date.now() - known.lastSync < 6 * 3600e3) continue;
    try { total += (await importFolder(f.id, { category: f.category, silent: !force })).length; } catch (e) { /* bildirildi */ }
  }
  btn.classList.remove('spin');
  if (force) toast(`Drive senkronizasyonu tamamlandı (${total} kitap).`, 'ok');
}

/* ---------------- Yerel dosyalar ---------------- */
async function addLocalFiles(files, opts = {}) {
  const pdfs = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!pdfs.length) { toast('Lütfen PDF dosyası seçin.', 'warn'); return; }
  let save = opts.save !== false;
  let first = null;
  for (const f of pdfs) {
    const id = 'local-' + hashStr(f.name + f.size + f.lastModified);
    if (save) {
      try { await blobDB.put(id, f); } catch (e) {
        save = false;
        toast('Dosya cihaza kaydedilemedi; yalnızca bu oturumda açılacak.', 'warn');
      }
    }
    const book = normalizeBook({
      id,
      title: (pdfs.length === 1 && opts.title) || f.name.replace(/\.pdf$/i, ''),
      category: opts.category || 'Cihazımdaki Dosyalar',
      type: 'PDF · ' + fmtBytes(f.size),
      source: save ? { type: 'local', key: id } : { type: 'memory' },
      addedAt: Date.now(),
      temp: !save
    }, 'user');
    if (save) upsertUserBook(book); else MEMORY.set(id, f);
    first = first || book;
    if (save && !covers[id] && window.pdfjsLib) {
      try {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        await makeCover(await pdf.getPage(1), id);
        pdf.destroy();
      } catch (e) { /* kapak isteğe bağlı */ }
    }
  }
  renderLibrary();
  if (opts.open && first) openBook(first);
  else toast(`${pdfs.length} dosya kütüphaneye eklendi.`, 'ok');
}

/* ==========================================================
   OKUYUCU
   ========================================================== */
const el = {};
const R = {
  book: null, pdf: null, task: null, session: 0, renderGen: 0, mode: null, page: 0, count: 0,
  zoom: 1, panX: 0, panY: 0, fitWidth: false, aspect: 0.707, ratios: [],
  rendered: new Map(), inflight: new Map(), renderTasks: new Set(),
  flip: null, flipLayout: null, pageEls: [], sheet: null, sheetSize: { w: 0, h: 0 }, sheetRatio: 0,
  textCache: new Map(), searchGen: 0, thumbObserver: null, thumbQueue: [], thumbBusy: false,
  outline: [], lastWheel: 0, driveError: ''
};

const readerOpen = () => el.reader.classList.contains('active');
const isBoard = () => R.book && R.book.source.type === 'board';

function showLoading(text, frac) {
  el.loading.hidden = false;
  el.loading.classList.remove('error');
  el.loading.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${esc(text)}</span><div class="mini-progress"><div style="width:${frac != null ? Math.round(frac * 100) : 8}%"></div></div>`;
}
const hideLoading = () => { el.loading.hidden = true; };

function showError(msg, book) {
  el.loading.hidden = false;
  el.loading.classList.add('error');
  const s = book.source;
  const ext = s.type === 'url' ? s.url : s.type === 'drive' ? Drive.viewUrl(s.id) : '';
  el.loading.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>Kitap açılamadı</span>
    <small style="opacity:.8;max-width:420px">${esc(msg)}</small>
    <div class="btn-row" style="justify-content:center">
      <button class="btn btn-primary" data-retry><i class="fa-solid fa-rotate-right"></i> Tekrar dene</button>
      ${ext ? `<a class="btn btn-ghost" href="${esc(ext)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Kaynakta aç</a>` : ''}
    </div>`;
  el.loading.querySelector('[data-retry]').onclick = () => openBook(book);
}

function showNotice(html, actions = []) {
  el.notice.hidden = false;
  el.notice.innerHTML = `<i class="fa-solid fa-circle-info"></i><span>${html}</span>`;
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.onclick = a.fn;
    el.notice.appendChild(b);
  }
  const x = document.createElement('button');
  x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  x.title = 'Kapat';
  x.onclick = () => { el.notice.hidden = true; };
  el.notice.appendChild(x);
}

function describePdfError(err) {
  const name = err && err.name;
  const status = err && err.status;
  if (name === 'InvalidPDFException') return 'Dosya geçerli bir PDF değil.';
  if (name === 'MissingPDFException' || status === 404) return 'Dosya bulunamadı (404).';
  if (status === 403) return 'Erişim reddedildi (403). Dosyanın herkese açık paylaşıldığından ve API anahtarının doğru olduğundan emin olun.';
  if (status === 429) return 'Google kotası aşıldı (429). Bir süre sonra tekrar deneyin.';
  if (name === 'PasswordException') return 'Bu PDF parola korumalı.';
  if (/fetch|network|cors/i.test((err && err.message) || '')) return 'Sunucuya ulaşılamadı ya da sunucu bu siteden erişime (CORS) izin vermiyor.';
  return (err && err.message) || 'Bilinmeyen hata';
}

async function resolveSource(book, opts) {
  const s = book.source;
  if (s.type !== 'drive' && !window.pdfjsLib) throw new Error('PDF motoru yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
  if (s.type === 'url') {
    if (!s.url) throw new Error('Kitabın PDF adresi tanımlı değil.');
    return { params: { url: s.url } };
  }
  if (s.type === 'local') {
    const f = await blobDB.get(s.key);
    if (!f) throw new Error('Dosya bu cihazda bulunamadı. Kitabı yeniden ekleyin.');
    return { params: { data: new Uint8Array(await f.arrayBuffer()) } };
  }
  if (s.type === 'memory') {
    const f = MEMORY.get(book.id);
    if (!f) throw new Error('Dosya artık bellekte değil. Lütfen yeniden seçin.');
    return { params: { data: new Uint8Array(await f.arrayBuffer()) } };
  }
  if (s.type === 'drive') {
    if (opts.forceEmbed) return { embed: Drive.previewUrl(s.id), reason: opts.reason || 'manual' };
    const u = Drive.fileUrl(s.id, s.mime) || (!GOOGLE_NATIVE[s.mime] && Drive.proxiedUrl(s.id));
    if (!u || !window.pdfjsLib) return { embed: Drive.previewUrl(s.id), reason: 'nokey' };
    return { params: { url: u } };
  }
  throw new Error('Desteklenmeyen kaynak türü.');
}

function showReaderShell(book) {
  const si = sourceInfo(book);
  el.title.textContent = book.title;
  el.src.className = 'src-badge ' + si.cls;
  el.src.innerHTML = `<i class="${si.icon}"></i>`;
  el.src.title = si.label;
  el.reader.classList.add('active');
  el.reader.classList.toggle('board-mode', book.source.type === 'board');
  el.reader.classList.toggle('thumbs-hidden', !!store.get('thumbsHidden', false));
  el.reader.setAttribute('aria-hidden', 'false');
  document.body.classList.add('reader-open');
  el.notice.hidden = true;
  $('#search-results').innerHTML = '';
  $('#search-status').textContent = '';
  if (!(history.state && history.state.reader)) history.pushState({ reader: 1 }, '');
  resetIdle();
}

async function openBook(book, opts = {}) {
  if (!book) return;
  closeReader({ internal: true });
  const sess = R.session;
  Object.assign(R, { book, pdf: null, count: 0, page: 0, zoom: 1, panX: 0, panY: 0, fitWidth: false, ratios: [], mode: null, outline: [] });
  showReaderShell(book);
  Ink.load(book.id);
  const saved = progress[book.id];
  const start = Number.isInteger(opts.page) ? opts.page : (settings.autoResume && saved ? saved.page : 0);

  if (book.source.type === 'board') {
    const meta = Ink.data.meta;
    meta.pages = meta.pages || 1;
    meta.bg = meta.bg || 'grid';
    R.count = meta.pages;
    R.aspect = BOARD_RATIO;
    R.page = clamp(start, 0, R.count - 1);
    hideLoading();
    afterDocumentReady();
    setMode('single');
    return;
  }

  showLoading('Kitap hazırlanıyor…', 0.05);
  try {
    const src = await resolveSource(book, opts);
    if (sess !== R.session) return;
    if (src.embed) { setupEmbed(src.embed, src.reason); return; }
    const task = pdfjsLib.getDocument({
      ...src.params,
      cMapUrl: PDFJS_CDN + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: PDFJS_CDN + 'standard_fonts/',
      isEvalSupported: false
    });
    R.task = task;
    task.onProgress = ({ loaded, total }) => {
      if (sess !== R.session) return;
      if (total) showLoading(`İndiriliyor… %${Math.min(100, Math.round((loaded / total) * 100))}`, loaded / total);
      else showLoading(`İndiriliyor… ${fmtBytes(loaded)}`);
    };
    const pdf = await task.promise;
    if (sess !== R.session) return;
    R.pdf = pdf;
    R.count = pdf.numPages;
    const p1 = await pdf.getPage(1);
    if (sess !== R.session) return;
    const vp = p1.getViewport({ scale: 1 });
    R.aspect = vp.width / vp.height;
    R.ratios[0] = R.aspect;
    R.page = clamp(start, 0, R.count - 1);
    hideLoading();
    afterDocumentReady();
    const mode = opts.mode || store.get('lastMode', null) || settings.defaultMode;
    setMode(mode === 'single' ? 'single' : 'flip');
    if (saved && saved.page > 0 && R.page === saved.page && !Number.isInteger(opts.page)) {
      toast(`Kaldığınız yerden devam: ${saved.page + 1}. sayfa`, 'info', 4000, { label: 'Başa dön', fn: () => goTo(0) });
    }
    if (!book.cover && !covers[book.id]) makeCover(p1, book.id);
  } catch (err) {
    if (sess !== R.session) return;
    console.error('PDF açılamadı:', err);
    if (book.source.type === 'drive' && !opts.forceEmbed) {
      R.driveError = describePdfError(err);
      openBook(book, { ...opts, forceEmbed: true, reason: 'error' });
      return;
    }
    showError(describePdfError(err), book);
  }
}

function afterDocumentReady() {
  el.pageTotal.textContent = `/ ${R.count}`;
  el.pageInput.max = R.count;
  setupThumbs();
  loadOutline();
  renderNotesList();
}

function setupEmbed(url, reason) {
  teardownView();
  R.mode = 'embed';
  R.count = 0;
  R.page = 0;
  const wrap = document.createElement('div');
  wrap.className = 'embed-wrap';
  const ifr = document.createElement('iframe');
  ifr.src = url;
  ifr.allow = 'autoplay; fullscreen';
  ifr.addEventListener('load', hideLoading, { once: true });
  wrap.appendChild(ifr);
  el.viewport.appendChild(wrap);
  showLoading('Google Drive önizleyicisi açılıyor…', 0.5);
  setTimeout(hideLoading, 7000);
  Ink.attach(wrap);
  Ink.setKey('E0');
  el.thumbs.innerHTML = '';
  R.zoom = 1; R.panX = R.panY = 0;
  applyTransform();
  updateChrome();
  $('#outline-pane').innerHTML = '<p class="muted small">İçindekiler ve arama, Drive önizleme modunda kullanılamaz.</p>';
  const book = R.book;
  if (reason === 'nokey') {
    showNotice('Drive önizleme modundasınız. Sayfa çevirme efekti, arama ve sayfa sayfa çizim için Ayarlar\'dan bir <b>Google API anahtarı</b> ekleyin.',
      [{ label: 'Ayarlar', fn: openSettings }]);
  } else if (reason === 'error') {
    showNotice(`PDF doğrudan alınamadı (${esc(R.driveError)}). Google önizleyicisi kullanılıyor.`,
      [{ label: 'Tekrar dene', fn: () => openBook(book, { page: 0 }) }]);
  }
}

/* ---------- Görünüm modları ---------- */
function teardownView() {
  if (R.flip) { try { R.flip.destroy(); } catch (e) { /* yok */ } R.flip = null; }
  Ink.detach();
  el.viewport.innerHTML = '';
  R.pageEls = [];
  R.sheet = null;
  R.sheetSize = { w: 0, h: 0 };
}

function setMode(mode) {
  const b = R.book;
  if (!b) return;
  if (mode === 'embed') {
    if (b.source.type === 'drive' && R.mode !== 'embed') openBook(b, { forceEmbed: true });
    return;
  }
  if (R.mode === 'embed' || (!R.pdf && !isBoard())) { openBook(b, { mode, page: R.page }); return; }
  if (isBoard() || !window.St) mode = 'single';
  if (!isBoard()) store.set('lastMode', mode);
  R.mode = mode;
  R.zoom = 1; R.panX = 0; R.panY = 0; R.fitWidth = false;
  teardownView();
  if (mode === 'flip') buildFlip(); else buildSingle();
  applyTransform();
  updateChrome();
  onPageChanged(R.page);
}

function updateChrome() {
  const t = R.book ? R.book.source.type : '';
  const embed = R.mode === 'embed';
  $$('#mode-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === R.mode);
    if (b.dataset.mode === 'embed') b.hidden = t !== 'drive';
    if (b.dataset.mode === 'flip') b.disabled = t === 'board';
  });
  $('#mode-switch').hidden = t === 'board';
  el.nav.style.visibility = embed ? 'hidden' : '';
  $('#zoom-box').hidden = embed;
  $('[data-cmd="panel"]').disabled = embed;
  $('[data-cmd="thumbs"]').disabled = embed;
  $('[data-cmd="original"]').disabled = t === 'board';
  $('[data-cmd="share"]').disabled = !R.book || !shareLink(R.book, 0);
  $$('.stage-arrow').forEach((a) => { a.hidden = embed; });
  el.thumbs.hidden = embed;
}

function computeFlipLayout() {
  const W = el.stage.clientWidth - (el.stage.clientWidth > 700 ? 140 : 24);
  const H = el.stage.clientHeight - 32;
  const a = R.aspect;
  const landscape = R.count > 1 && W / H >= a * 1.45;
  let ph = landscape ? Math.min(H, W / (2 * a)) : Math.min(H, W / a);
  ph = Math.max(120, Math.floor(ph));
  return { pw: Math.floor(ph * a), ph, landscape };
}

const phHTML = (i) => `<div class="page-ph"><span>${i + 1}</span></div>`;

function buildFlip() {
  const L = computeFlipLayout();
  R.flipLayout = L;
  const box = document.createElement('div');
  box.className = 'flip-box' + (L.landscape ? ' landscape' : '');
  const bw = L.landscape ? L.pw * 2 : L.pw;
  box.style.width = bw + 'px';
  box.style.height = L.ph + 'px';
  const container = document.createElement('div');
  container.className = 'flip-container';
  container.style.width = bw + 'px';
  container.style.height = L.ph + 'px';
  box.appendChild(container);
  R.pageEls = [];
  for (let i = 0; i < R.count; i++) {
    const pg = document.createElement('div');
    pg.className = 'page-wrapper';
    if (i === 0 || (i === R.count - 1 && R.count % 2 === 0)) pg.dataset.density = 'hard';
    const content = document.createElement('div');
    content.className = 'page-content';
    const r = R.rendered.get(i);
    if (r) content.appendChild(r.canvas); else content.innerHTML = phHTML(i);
    pg.appendChild(content);
    container.appendChild(pg);
    R.pageEls.push(content);
  }
  el.viewport.appendChild(box);
  R.flip = new St.PageFlip(container, {
    width: L.pw, height: L.ph, size: 'fixed', autoSize: false, showCover: true, usePortrait: true,
    startPage: R.page, maxShadowOpacity: 0.45, flippingTime: 650, mobileScrollSupport: false,
    showPageCorners: true, drawShadow: true
  });
  R.flip.loadFromHTML(container.querySelectorAll('.page-wrapper'));
  R.flip.on('flip', (e) => onPageChanged(e.data));
  R.flip.on('changeState', (e) => {
    const busy = e.data === 'flipping' || e.data === 'user_fold';
    if (Ink.layer) Ink.layer.classList.toggle('flipping', busy);
    if (e.data === 'flipping') playFlipSound();
  });
  Ink.attach(box);
}

function buildSingle() {
  const sheet = document.createElement('div');
  sheet.className = 'single-sheet';
  el.viewport.appendChild(sheet);
  R.sheet = sheet;
  Ink.attach(sheet);
  showSinglePage(R.page, 0);
}

function layoutSingle() {
  if (!R.sheet) return;
  const ratio = R.ratios[R.page] || R.aspect;
  R.sheetRatio = ratio;
  const W = el.stage.clientWidth - (el.stage.clientWidth > 700 ? 140 : 24);
  const H = el.stage.clientHeight - 32;
  let h = H;
  let w = h * ratio;
  if (w > W) { w = W; h = w / ratio; }
  w = Math.max(80, Math.floor(w)); h = Math.max(80, Math.floor(h));
  if (w === R.sheetSize.w && h === R.sheetSize.h) return;
  R.sheetSize = { w, h };
  R.sheet.style.width = w + 'px';
  R.sheet.style.height = h + 'px';
  Ink.resize();
}

function showSinglePage(i, dir) {
  R.page = i;
  const sheet = R.sheet;
  if (!sheet) return;
  const cur = sheet.querySelector('canvas.page-canvas');
  if (cur) cur.remove();
  const ph = sheet.querySelector('.page-ph');
  if (ph) ph.remove();
  if (R.rendered.has(i)) attachPage(i); else sheet.insertAdjacentHTML('afterbegin', phHTML(i));
  layoutSingle();
  if (dir) {
    sheet.classList.remove('flash-next', 'flash-prev');
    void sheet.offsetWidth;
    sheet.classList.add(dir > 0 ? 'flash-next' : 'flash-prev');
  }
}

/* ---------- Sayfa çizimi (render) ---------- */
function targetPx(cssW, visible) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const q = QUALITY[settings.quality] || 1.5;
  return Math.round(cssW * dpr * q * (visible ? clamp(R.zoom, 1, 3) : 1));
}

function visiblePlan() {
  const p = R.page;
  if (R.mode === 'flip' && R.flipLayout) {
    const w = R.flipLayout.pw;
    const vis = R.flipLayout.landscape ? [p, p + 1] : [p];
    const pre = R.flipLayout.landscape ? [p + 2, p + 3, p - 1, p - 2, p + 4, p + 5] : [p + 1, p - 1, p + 2];
    return [...vis.map((i) => ({ i, px: targetPx(w, true) })), ...pre.map((i) => ({ i, px: targetPx(w, false) }))];
  }
  if (R.mode === 'single') {
    const w = R.sheetSize.w || 600;
    return [{ i: p, px: targetPx(w, true) }, { i: p + 1, px: targetPx(w, false) }, { i: p - 1, px: targetPx(w, false) }];
  }
  return [];
}

async function ensureVisible() {
  const sess = R.session;
  const gen = ++R.renderGen;
  for (const { i, px } of visiblePlan()) {
    if (sess !== R.session || gen !== R.renderGen) return;
    if (i < 0 || i >= R.count) continue;
    const have = R.rendered.get(i);
    if (have && have.px >= px * 0.92) { attachPage(i); continue; }
    try { await renderPage(i, px, sess); } catch (err) {
      if (sess === R.session && !(err && err.name === 'RenderingCancelledException')) console.warn('Sayfa çizilemedi', i + 1, err);
    }
  }
  if (sess === R.session && gen === R.renderGen) evictFar();
}

function renderPage(i, px, sess) {
  const inf = R.inflight.get(i);
  if (inf && inf.px >= px * 0.92) return inf.promise;
  const promise = (async () => {
    let canvas;
    let ratio;
    if (isBoard()) {
      ratio = BOARD_RATIO;
      canvas = drawBoardCanvas(Math.min(px, 3840), Ink.data.meta.bg);
    } else {
      const page = await R.pdf.getPage(i + 1);
      const vp1 = page.getViewport({ scale: 1 });
      ratio = vp1.width / vp1.height;
      let w = Math.min(px, 4096);
      if (w * (w / ratio) > 16e6) w = Math.floor(Math.sqrt(16e6 * ratio));
      const vp = page.getViewport({ scale: w / vp1.width });
      canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const task = page.render({ canvasContext: ctx, viewport: vp });
      R.renderTasks.add(task);
      try { await task.promise; } finally { R.renderTasks.delete(task); }
    }
    if (sess !== R.session) { canvas.width = canvas.height = 0; return; }
    R.ratios[i] = ratio;
    canvas.className = 'page-canvas';
    const old = R.rendered.get(i);
    R.rendered.set(i, { canvas, px, ratio });
    attachPage(i);
    if (old && old.canvas !== canvas) { old.canvas.remove(); old.canvas.width = old.canvas.height = 0; }
  })();
  R.inflight.set(i, { px, promise });
  promise.finally(() => { if (R.inflight.get(i) && R.inflight.get(i).promise === promise) R.inflight.delete(i); }).catch(() => {});
  return promise;
}

function attachPage(i) {
  const r = R.rendered.get(i);
  if (!r) return;
  if (R.mode === 'flip') {
    const host = R.pageEls[i];
    if (host && r.canvas.parentNode !== host) host.replaceChildren(r.canvas);
  } else if (R.mode === 'single' && i === R.page && R.sheet) {
    const cur = R.sheet.querySelector('canvas.page-canvas');
    if (cur !== r.canvas) {
      if (cur) cur.remove();
      R.sheet.prepend(r.canvas);
    }
    const ph = R.sheet.querySelector('.page-ph');
    if (ph) ph.remove();
    if (Math.abs(r.ratio - R.sheetRatio) > 0.01) layoutSingle();
  }
}

function evictFar() {
  const keep = R.mode === 'flip' ? 8 : 5;
  for (const [i, r] of R.rendered) {
    if (Math.abs(i - R.page) > keep) {
      r.canvas.remove();
      r.canvas.width = r.canvas.height = 0;
      R.rendered.delete(i);
      if (R.mode === 'flip' && R.pageEls[i]) R.pageEls[i].innerHTML = phHTML(i);
    }
  }
}

function drawBoardCanvas(w, bg) {
  const h = Math.round(w / BOARD_RATIO);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const chalk = bg === 'chalk';
  x.fillStyle = chalk ? '#1f3d2e' : '#ffffff';
  x.fillRect(0, 0, w, h);
  const step = w / 40;
  x.lineWidth = Math.max(1, w / 1600);
  if (bg === 'grid') {
    x.strokeStyle = '#dbe4f0';
    for (let gx = step; gx < w; gx += step) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, h); x.stroke(); }
    for (let gy = step; gy < h; gy += step) { x.beginPath(); x.moveTo(0, gy); x.lineTo(w, gy); x.stroke(); }
  } else if (bg === 'lines') {
    x.strokeStyle = '#c7d7ee';
    for (let gy = step * 1.6; gy < h; gy += step * 1.4) { x.beginPath(); x.moveTo(0, gy); x.lineTo(w, gy); x.stroke(); }
    x.strokeStyle = '#f5a3a3';
    x.beginPath(); x.moveTo(step * 3, 0); x.lineTo(step * 3, h); x.stroke();
  } else if (bg === 'dots') {
    x.fillStyle = '#b8c4d6';
    for (let gx = step; gx < w; gx += step) for (let gy = step; gy < h; gy += step) { x.beginPath(); x.arc(gx, gy, Math.max(1, w / 1200), 0, Math.PI * 2); x.fill(); }
  } else if (chalk) {
    x.fillStyle = 'rgba(255,255,255,0.025)';
    for (let k = 0; k < 900; k++) x.fillRect(Math.random() * w, Math.random() * h, w / 300, w / 300);
    x.strokeStyle = '#6b4f2a'; x.lineWidth = w / 90; x.strokeRect(0, 0, w, h);
  }
  return c;
}

const BOARD_BGS = ['grid', 'plain', 'lines', 'dots', 'chalk'];
const BOARD_BG_NAMES = { grid: 'Kareli', plain: 'Düz beyaz', lines: 'Çizgili', dots: 'Noktalı', chalk: 'Kara tahta' };

function cycleBoardBg() {
  if (!isBoard()) return;
  const meta = Ink.data.meta;
  const next = BOARD_BGS[(BOARD_BGS.indexOf(meta.bg) + 1) % BOARD_BGS.length];
  meta.bg = next;
  Ink.persist();
  for (const r of R.rendered.values()) { r.canvas.remove(); r.canvas.width = r.canvas.height = 0; }
  R.rendered.clear();
  if (next === 'chalk' && (Ink.color === '#0f172a')) setColor('#ffffff');
  if (next !== 'chalk' && Ink.color === '#ffffff') setColor('#0f172a');
  showSinglePage(R.page, 0);
  ensureVisible();
  setupThumbs();
  toast('Zemin: ' + BOARD_BG_NAMES[next], 'info', 1500);
}

function addBoardPage() {
  if (!isBoard()) return;
  Ink.data.meta.pages = (Ink.data.meta.pages || 1) + 1;
  Ink.persist();
  R.count = Ink.data.meta.pages;
  el.pageTotal.textContent = `/ ${R.count}`;
  setupThumbs();
  goTo(R.count - 1);
}

/* ---------- Gezinme ---------- */
function goTo(i) {
  if (!R.count) return;
  i = clamp(i, 0, R.count - 1);
  if (R.mode === 'flip' && R.flip) {
    const cur = R.flip.getCurrentPageIndex();
    if (i === cur) return;
    if (Math.abs(i - cur) <= 3) R.flip.flip(i); else R.flip.turnToPage(i);
    return;
  }
  if (R.mode === 'single') {
    if (i === R.page) return;
    const dir = Math.sign(i - R.page);
    showSinglePage(i, dir);
    if (R.fitWidth) fitWidth(false);
    else if (R.zoom !== 1) { R.zoom = 1; R.panX = R.panY = 0; applyTransform(); }
    onPageChanged(i);
    playFlipSound();
  }
}

function next() {
  if (R.mode === 'flip' && R.flip) R.flip.flipNext();
  else if (R.mode === 'single') goTo(R.page + 1);
}
function prev() {
  if (R.mode === 'flip' && R.flip) R.flip.flipPrev();
  else if (R.mode === 'single') goTo(R.page - 1);
}

const saveProgress = debounce(() => {
  if (!R.book || !R.count || R.book.source.type === 'memory') return;
  progress[R.book.id] = { page: R.page, total: R.count, ts: Date.now() };
  store.set('progress', progress);
}, 600);

function inkKey() {
  if (R.mode === 'embed') return 'E0';
  if (R.mode === 'flip' && R.flipLayout && R.flipLayout.landscape) return 'L' + R.page;
  return 'S' + R.page;
}

function onPageChanged(i) {
  R.page = clamp(i, 0, Math.max(0, R.count - 1));
  el.pageInput.value = R.page + 1;
  const spread = R.mode === 'flip' && R.flipLayout && R.flipLayout.landscape && R.page > 0 ? 2 : 1;
  $('.stage-arrow.left').disabled = R.page <= 0;
  $('.stage-arrow.right').disabled = R.page + spread >= R.count;
  $$('.thumb-item', el.thumbs).forEach((t) => {
    const n = +t.dataset.i;
    const on = n === R.page || (spread === 2 && n === R.page + 1);
    t.classList.toggle('active', on);
    if (n === R.page) t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
  Ink.setKey(inkKey());
  ensureVisible();
  saveProgress();
}

/* ---------- Yakınlaştırma / kaydırma ---------- */
const hiResLater = debounce(() => {
  if (!readerOpen()) return;
  Ink.resize();
  if (R.count) ensureVisible();
}, 260);

function contentSize() {
  if (R.mode === 'flip' && R.flipLayout) return { w: R.flipLayout.pw * (R.flipLayout.landscape ? 2 : 1), h: R.flipLayout.ph };
  if (R.mode === 'single') return R.sheetSize;
  return { w: el.stage.clientWidth, h: el.stage.clientHeight };
}

function clampPan() {
  const c = contentSize();
  const mx = Math.max(0, (c.w * R.zoom - el.stage.clientWidth) / 2 + 60);
  const my = Math.max(0, (c.h * R.zoom - el.stage.clientHeight) / 2 + 60);
  R.panX = clamp(R.panX, -mx, mx);
  R.panY = clamp(R.panY, -my, my);
}

function applyTransform(animate) {
  el.viewport.classList.toggle('animate', !!animate);
  el.viewport.style.transform = `translate(${R.panX}px, ${R.panY}px) scale(${R.zoom})`;
  el.zoomLabel.textContent = Math.round(R.zoom * 100) + '%';
  el.stage.classList.toggle('panning', R.zoom > 1.01 && R.mode === 'single' && Ink.tool === 'cursor');
  hiResLater();
}

function setZoom(z, cx, cy, animate) {
  if (R.mode === 'embed') return;
  const old = R.zoom;
  z = clamp(z, 0.4, 6);
  if (Math.abs(z - old) < 0.001) return;
  const st = el.stage.getBoundingClientRect();
  const ox = cx != null ? cx - (st.left + st.width / 2) : 0;
  const oy = cy != null ? cy - (st.top + st.height / 2) : 0;
  R.panX = ox - (ox - R.panX) * (z / old);
  R.panY = oy - (oy - R.panY) * (z / old);
  R.zoom = z;
  R.fitWidth = false;
  if (z <= 1) { R.panX = 0; R.panY = 0; }
  clampPan();
  applyTransform(animate);
}

function resetZoom() {
  R.zoom = 1; R.panX = 0; R.panY = 0; R.fitWidth = false;
  applyTransform(true);
}

function fitWidth(animate = true) {
  if (R.mode === 'embed') return;
  const c = contentSize();
  if (!c.w) return;
  const z = clamp((el.stage.clientWidth - 40) / c.w, 0.4, 6);
  R.zoom = z;
  R.panX = 0;
  R.panY = Math.max(0, (c.h * z - el.stage.clientHeight) / 2);
  R.fitWidth = true;
  applyTransform(animate);
}

/* ---------- Küçük resimler ---------- */
function setupThumbs() {
  if (R.thumbObserver) R.thumbObserver.disconnect();
  R.thumbQueue = [];
  el.thumbs.innerHTML = '';
  if (!R.count) return;
  const h = window.innerWidth < 820 ? 72 : 92;
  const w = Math.round(h * (isBoard() ? BOARD_RATIO : R.aspect));
  const frag = document.createDocumentFragment();
  for (let i = 0; i < R.count; i++) {
    const b = document.createElement('button');
    b.className = 'thumb-item';
    b.dataset.i = i;
    b.style.width = w + 'px';
    b.title = `Sayfa ${i + 1}`;
    b.innerHTML = `<span class="thumb-page-num">${i + 1}</span>`;
    frag.appendChild(b);
  }
  el.thumbs.appendChild(frag);
  R.thumbObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        R.thumbQueue.push(+e.target.dataset.i);
        R.thumbObserver.unobserve(e.target);
      }
    }
    pumpThumbs();
  }, { root: el.thumbs, rootMargin: '0px 400px' });
  $$('.thumb-item', el.thumbs).forEach((t) => R.thumbObserver.observe(t));
  markInkThumbs();
}

async function pumpThumbs() {
  if (R.thumbBusy) return;
  R.thumbBusy = true;
  const sess = R.session;
  try {
    while (R.thumbQueue.length && sess === R.session) {
      const i = R.thumbQueue.shift();
      await renderThumb(i, sess);
    }
  } finally { R.thumbBusy = false; }
}

async function renderThumb(i, sess) {
  const btn = el.thumbs.querySelector(`.thumb-item[data-i="${i}"]`);
  if (!btn) return;
  const W = Math.round(btn.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) || 120;
  let c;
  try {
    if (isBoard()) {
      c = drawBoardCanvas(W, Ink.data.meta.bg);
    } else {
      const page = await R.pdf.getPage(i + 1);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: W / vp1.width });
      c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
  } catch (e) { return; }
  if (sess !== R.session) return;
  const strokes = Ink.data.pages['S' + i];
  if (strokes && strokes.length) {
    const ctx = c.getContext('2d');
    for (const s of strokes) Ink.drawStroke(ctx, s, c.width, c.height);
  }
  const old = btn.querySelector('canvas');
  if (old) old.remove();
  btn.prepend(c);
}

function refreshThumb(i) {
  if (!R.count || R.mode === 'embed') return;
  const btn = el.thumbs.querySelector(`.thumb-item[data-i="${i}"]`);
  if (btn && btn.querySelector('canvas')) { R.thumbQueue.push(i); pumpThumbs(); }
}

function inkPages() {
  const pages = new Set();
  for (const [k, v] of Object.entries(Ink.data.pages)) {
    if (!v.length) continue;
    const n = parseInt(k.slice(1), 10);
    if (k[0] === 'S') pages.add(n);
    if (k[0] === 'L') { pages.add(n); if (n > 0) pages.add(n + 1); }
  }
  return pages;
}

function markInkThumbs() {
  const pages = inkPages();
  $$('.thumb-item', el.thumbs).forEach((t) => t.classList.toggle('has-ink', pages.has(+t.dataset.i)));
}

/* ---------- İçindekiler / Arama / Notlar ---------- */
async function loadOutline() {
  const pane = $('#outline-pane');
  const sess = R.session;
  if (isBoard()) {
    pane.innerHTML = '<ul class="outline-list">' + Array.from({ length: R.count }, (_, i) =>
      `<li><button data-goto="${i}">Tahta sayfası ${i + 1}<span class="pg">${i + 1}</span></button></li>`).join('') + '</ul>';
    return;
  }
  if (!R.pdf) return;
  pane.innerHTML = '<p class="muted small">Yükleniyor…</p>';
  let ol = null;
  try { ol = await R.pdf.getOutline(); } catch (e) { /* yok */ }
  if (sess !== R.session) return;
  if (!ol || !ol.length) {
    pane.innerHTML = '<p class="muted small">Bu belgede içindekiler bilgisi bulunmuyor. Küçük resimleri veya aramayı kullanabilirsiniz.</p>';
    return;
  }
  R.outline = [];
  const build = (items) => '<ul>' + items.map((it) => {
    const idx = R.outline.push(it) - 1;
    return `<li><button data-ol="${idx}"><span>${esc(it.title)}</span><span class="pg"></span></button>${it.items && it.items.length ? build(it.items) : ''}</li>`;
  }).join('') + '</ul>';
  pane.innerHTML = `<div class="outline-list">${build(ol)}</div>`;
  for (let k = 0; k < R.outline.length; k++) {
    const idx = await destToIndex(R.outline[k].dest).catch(() => null);
    if (sess !== R.session) return;
    R.outline[k].pageIndex = idx;
    const b = pane.querySelector(`[data-ol="${k}"] .pg`);
    if (b && idx != null) b.textContent = idx + 1;
  }
}

async function destToIndex(dest) {
  if (!dest || !R.pdf) return null;
  if (typeof dest === 'string') dest = await R.pdf.getDestination(dest);
  if (!Array.isArray(dest)) return null;
  const ref = dest[0];
  if (ref && typeof ref === 'object') return R.pdf.getPageIndex(ref);
  return Number.isInteger(ref) ? ref : null;
}

async function pageText(i) {
  if (R.textCache.has(i)) return R.textCache.get(i);
  const page = await R.pdf.getPage(i + 1);
  const tc = await page.getTextContent();
  const text = tc.items.map((it) => it.str + (it.hasEOL ? ' ' : '')).join('').replace(/\s+/g, ' ');
  R.textCache.set(i, text);
  return text;
}

async function runSearch(q) {
  const out = $('#search-results');
  const status = $('#search-status');
  const gen = ++R.searchGen;
  out.innerHTML = '';
  q = q.trim();
  if (!R.pdf) { status.textContent = 'Arama yalnızca PDF kitaplarda kullanılabilir.'; return; }
  if (q.length < 2) { status.textContent = 'En az 2 karakter yazın.'; return; }
  const needle = trLower(q);
  let hits = 0;
  let pagesHit = 0;
  for (let i = 0; i < R.count; i++) {
    if (gen !== R.searchGen) return;
    status.textContent = `Aranıyor… ${i + 1}/${R.count} sayfa · ${hits} sonuç`;
    let text = '';
    try { text = await pageText(i); } catch (e) { continue; }
    if (gen !== R.searchGen) return;
    const low = trLower(text);
    let at = low.indexOf(needle);
    if (at < 0) continue;
    pagesHit++;
    let count = 0;
    const first = at;
    while (at >= 0) { count++; at = low.indexOf(needle, at + needle.length); }
    hits += count;
    const s = Math.max(0, first - 40);
    const snippet = esc(text.slice(s, first)) + '<mark>' + esc(text.slice(first, first + q.length)) + '</mark>' + esc(text.slice(first + q.length, first + q.length + 60));
    out.insertAdjacentHTML('beforeend', `<button class="result-item" data-goto="${i}"><span class="pg">Sayfa ${i + 1}${count > 1 ? ` · ${count} eşleşme` : ''}</span><span>${s > 0 ? '…' : ''}${snippet}…</span></button>`);
  }
  status.textContent = hits ? `${pagesHit} sayfada ${hits} sonuç bulundu.` : 'Sonuç bulunamadı. (Taranmış/görsel PDF\'lerde metin bulunmayabilir.)';
}

function renderNotesList() {
  const list = $('#notes-list');
  if (!list) return;
  const pages = [...inkPages()].sort((a, b) => a - b);
  const extra = Ink.data.pages.E0 && Ink.data.pages.E0.length ? '<p class="muted small">Drive önizleme ekranında da çizimleriniz var.</p>' : '';
  list.innerHTML = pages.length
    ? pages.map((p) => `<button class="note-item" data-goto="${p}"><span><i class="fa-solid fa-pen"></i> Sayfa ${p + 1}</span><span class="pg">${p + 1}</span></button>`).join('') + extra
    : '<p class="muted small">Bu kitapta henüz çizim yok.</p>' + extra;
}

function openPanel(tab) {
  el.reader.classList.add('panel-open');
  $$('.side-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.ptab === tab));
  $$('.side-content').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  if (tab === 'search') setTimeout(() => $('#search-input').focus(), 30);
  if (tab === 'notes') renderNotesList();
  onStageResize();
}

/* ---------- Kapatma ---------- */
function closeReader(opts = {}) {
  const wasOpen = readerOpen();
  R.session++;
  for (const t of R.renderTasks) { try { t.cancel(); } catch (e) { /* yok */ } }
  R.renderTasks.clear();
  R.inflight.clear();
  Ink.commitText();
  Ink.saveNow();
  teardownView();
  for (const r of R.rendered.values()) { r.canvas.width = r.canvas.height = 0; }
  R.rendered.clear();
  if (R.task) { try { R.task.destroy(); } catch (e) { /* yok */ } R.task = null; }
  R.pdf = null;
  if (R.thumbObserver) R.thumbObserver.disconnect();
  el.thumbs.innerHTML = '';
  R.textCache.clear();
  R.searchGen++;
  Spot.off();
  Curtain.off();
  el.notice.hidden = true;
  if (opts.internal) return;
  saveProgress.flush();
  el.reader.classList.remove('active', 'board-mode', 'panel-open', 'idle');
  el.reader.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('reader-open');
  R.book = null;
  R.mode = null;
  if (wasOpen) {
    renderLibrary();
    if (!opts.fromPop && history.state && history.state.reader) history.back();
  }
}

/* ---------- Ses ---------- */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playFlipSound() {
  if (!settings.sound) return;
  try {
    const ac = getAudio();
    const len = ac.sampleRate * 0.14;
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, ac.currentTime + 0.14);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.09, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
    noise.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    noise.start();
  } catch (e) { /* ses isteğe bağlı */ }
}
function beep(times = 3) {
  try {
    const ac = getAudio();
    for (let k = 0; k < times; k++) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const t = ac.currentTime + k * 0.45;
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.4);
    }
  } catch (e) { /* yok */ }
}

/* ==========================================================
   ÇİZİM MOTORU
   ========================================================== */
const DRAW_TOOLS = new Set(['pen', 'hl', 'shape', 'eraser', 'laser', 'text']);
const SHAPES = ['rect', 'ellipse', 'line', 'arrow'];
const SHAPE_ICONS = { rect: 'fa-regular fa-square', ellipse: 'fa-regular fa-circle', line: 'fa-solid fa-minus', arrow: 'fa-solid fa-arrow-right-long' };
const SHAPE_NAMES = { rect: 'Dikdörtgen', ellipse: 'Elips', line: 'Çizgi', arrow: 'Ok' };

function strokePoints(s, W, H) {
  const p = s.p;
  switch (s.t) {
    case 'pen': case 'hl': {
      const out = [];
      for (let i = 0; i < p.length; i += 2) out.push([p[i] * W, p[i + 1] * H]);
      return out;
    }
    case 'line': case 'arrow': return [[p[0] * W, p[1] * H], [p[2] * W, p[3] * H]];
    case 'rect': {
      const a = [p[0] * W, p[1] * H]; const b = [p[2] * W, p[3] * H];
      return [a, [b[0], a[1]], b, [a[0], b[1]], a];
    }
    case 'ellipse': {
      const cx = (p[0] + p[2]) / 2 * W; const cy = (p[1] + p[3]) / 2 * H;
      const rx = Math.abs(p[2] - p[0]) / 2 * W; const ry = Math.abs(p[3] - p[1]) / 2 * H;
      const out = [];
      for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
      return out;
    }
    default: return [];
  }
}

function distToSeg(px, py, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function strokeHit(s, px, py, r, W, H) {
  if (s.t === 'text') {
    const fs = s.w * W;
    const lines = s.txt.split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * fs * 0.58;
    const h = lines.length * fs * 1.25;
    const x = s.p[0] * W; const y = s.p[1] * H;
    return px >= x - r && px <= x + w + r && py >= y - r && py <= y + h + r;
  }
  const pts = strokePoints(s, W, H);
  const tol = r + (s.w * W) / 2;
  if (pts.length === 1) return Math.hypot(px - pts[0][0], py - pts[0][1]) < tol;
  for (let i = 1; i < pts.length; i++) if (distToSeg(px, py, pts[i - 1], pts[i]) < tol) return true;
  return false;
}

const Ink = {
  bookId: null, data: { pages: {}, meta: {} }, key: null, host: null, layer: null, base: null, live: null, bctx: null, lctx: null,
  tool: 'cursor', shape: 'rect', color: '#e11d48', size: 4, hidden: false,
  undoS: {}, redoS: {}, cur: null, pointer: null, rect: null, erased: false, laserPts: [], laserRaf: 0, liveRaf: 0, scale: 1,
  textPending: null, cssW: 0, cssH: 0,
  COLORS: ['#0f172a', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#ffffff', '#ec4899'],
  SIZES: [2, 4, 8, 14],

  load(bookId) {
    this.bookId = bookId;
    const d = store.get('ink.' + bookId, null);
    this.data = d && d.pages ? d : { pages: {}, meta: {} };
    this.data.meta = this.data.meta || {};
    this.undoS = {}; this.redoS = {};
    this.key = null;
  },
  persist: debounce(() => Ink.saveNow(), 500),
  saveNow() {
    if (!this.bookId || !this.data) return;
    for (const k of Object.keys(this.data.pages)) if (!this.data.pages[k].length) delete this.data.pages[k];
    const empty = !Object.keys(this.data.pages).length && !Object.keys(this.data.meta).length;
    if (empty) store.del('ink.' + this.bookId);
    else if (!store.set('ink.' + this.bookId, this.data)) toast('Çizimler kaydedilemedi: tarayıcı depolama alanı dolu.', 'err');
  },
  list(key = this.key) {
    const p = this.data.pages;
    if (!p[key]) p[key] = [];
    return p[key];
  },
  attach(host) {
    this.detach();
    this.host = host;
    const layer = document.createElement('div');
    layer.className = 'ink-layer';
    layer.innerHTML = '<canvas class="base"></canvas><canvas class="live"></canvas>';
    host.appendChild(layer);
    this.layer = layer;
    this.base = layer.children[0];
    this.live = layer.children[1];
    this.bctx = this.base.getContext('2d');
    this.lctx = this.live.getContext('2d');
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));
    layer.addEventListener('pointerleave', () => { if (this.tool === 'eraser' && this.pointer == null) this.clearLive(); });
    this.applyToolClass();
    this.resize();
  },
  detach() {
    this.commitText();
    if (this.layer) this.layer.remove();
    this.layer = null; this.host = null; this.cur = null; this.pointer = null;
  },
  setKey(k) {
    if (k === this.key && this.layer) return;
    this.commitText();
    this.key = k;
    this.redraw();
  },
  resize() {
    if (!this.layer) return;
    const w = this.host.clientWidth; const h = this.host.clientHeight;
    if (!w || !h) return;
    let s = Math.min((window.devicePixelRatio || 1) * Math.max(1, R.zoom), 4);
    s = Math.min(s, Math.sqrt(16e6 / (w * h)));
    this.cssW = w; this.cssH = h; this.scale = s;
    for (const c of [this.base, this.live]) { c.width = Math.round(w * s); c.height = Math.round(h * s); }
    this.redraw();
  },
  redraw() {
    if (!this.layer) return;
    const c = this.bctx;
    c.clearRect(0, 0, this.base.width, this.base.height);
    this.layer.classList.toggle('hidden-ink', this.hidden);
    if (!this.key) return;
    for (const s of this.data.pages[this.key] || []) this.drawStroke(c, s, this.base.width, this.base.height);
  },
  clearLive() { if (this.lctx) this.lctx.clearRect(0, 0, this.live.width, this.live.height); },
  drawStroke(ctx, s, W, H) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.lineWidth = Math.max(1, s.w * W);
    if (s.t === 'hl') ctx.globalAlpha = 0.38;
    const p = s.p;
    switch (s.t) {
      case 'pen': case 'hl': {
        if (p.length <= 2) {
          ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
          break;
        }
        ctx.beginPath();
        ctx.moveTo(p[0] * W, p[1] * H);
        for (let i = 2; i < p.length - 2; i += 2) {
          const xc = ((p[i] + p[i + 2]) / 2) * W; const yc = ((p[i + 1] + p[i + 3]) / 2) * H;
          ctx.quadraticCurveTo(p[i] * W, p[i + 1] * H, xc, yc);
        }
        ctx.lineTo(p[p.length - 2] * W, p[p.length - 1] * H);
        ctx.stroke();
        break;
      }
      case 'line': case 'arrow': {
        const x1 = p[0] * W; const y1 = p[1] * H; const x2 = p[2] * W; const y2 = p[3] * H;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (s.t === 'arrow') {
          const a = Math.atan2(y2 - y1, x2 - x1);
          const L = Math.max(12, ctx.lineWidth * 4.5);
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45));
          ctx.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45));
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'rect':
        ctx.strokeRect(Math.min(p[0], p[2]) * W, Math.min(p[1], p[3]) * H, Math.abs(p[2] - p[0]) * W, Math.abs(p[3] - p[1]) * H);
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(((p[0] + p[2]) / 2) * W, ((p[1] + p[3]) / 2) * H, (Math.abs(p[2] - p[0]) / 2) * W, (Math.abs(p[3] - p[1]) / 2) * H, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'text': {
        const fs = s.w * W;
        ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        s.txt.split('\n').forEach((ln, k) => ctx.fillText(ln, p[0] * W, p[1] * H + k * fs * 1.25));
        break;
      }
      default: break;
    }
    ctx.restore();
  },
  pt(e) {
    const r = this.rect || this.layer.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  },
  down(e) {
    if (!DRAW_TOOLS.has(this.tool)) return;
    if (this.pointer != null && this.pointer !== e.pointerId) return; // avuç içi / ikinci parmak
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.rect = this.layer.getBoundingClientRect();
    const [x, y] = this.pt(e);
    const rw = this.rect.width;
    if (this.tool === 'text') { this.openText(e.clientX, e.clientY, x, y); return; }
    try { this.layer.setPointerCapture(e.pointerId); } catch (err) { /* yok */ }
    this.pointer = e.pointerId;
    if (this.tool === 'pen' || this.tool === 'hl') {
      this.cur = { t: this.tool, c: this.color, w: (this.tool === 'hl' ? this.size * 4 + 6 : this.size) / rw, p: [x, y] };
      this.scheduleLive();
    } else if (this.tool === 'shape') {
      this.cur = { t: this.shape, c: this.color, w: Math.max(2, this.size) / rw, p: [x, y, x, y] };
    } else if (this.tool === 'eraser') {
      this.erased = false;
      this.eraseAt(x, y);
    } else if (this.tool === 'laser') {
      this.laserAdd(x, y);
    }
  },
  move(e) {
    if (this.pointer == null || e.pointerId !== this.pointer) {
      if (this.pointer == null && e.pointerType === 'mouse') {
        this.rect = null;
        if (this.tool === 'laser') { const [x, y] = this.pt(e); this.laserAdd(x, y); }
        if (this.tool === 'eraser') { const [x, y] = this.pt(e); this.drawEraserCursor(x, y); }
      }
      return;
    }
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = this.pt(ev);
      if (this.cur && (this.cur.t === 'pen' || this.cur.t === 'hl')) {
        const p = this.cur.p;
        if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) > 0.0007) p.push(x, y);
      } else if (this.cur) {
        let nx = x; let ny = y;
        if (e.shiftKey) {
          const p = this.cur.p;
          if (this.cur.t === 'line' || this.cur.t === 'arrow') {
            const W = this.rect.width; const H = this.rect.height;
            const a = Math.round(Math.atan2((y - p[1]) * H, (x - p[0]) * W) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot((x - p[0]) * W, (y - p[1]) * H);
            nx = p[0] + (len * Math.cos(a)) / W; ny = p[1] + (len * Math.sin(a)) / H;
          } else {
            const W = this.rect.width; const H = this.rect.height;
            const d = Math.max(Math.abs(x - p[0]) * W, Math.abs(y - p[1]) * H);
            nx = p[0] + (Math.sign(x - p[0]) * d) / W; ny = p[1] + (Math.sign(y - p[1]) * d) / H;
          }
        }
        this.cur.p[2] = nx; this.cur.p[3] = ny;
      } else if (this.tool === 'eraser') {
        this.eraseAt(x, y);
      } else if (this.tool === 'laser') {
        this.laserAdd(x, y);
      }
    }
    if (this.cur) this.scheduleLive();
  },
  up(e) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    try { this.layer.releasePointerCapture(e.pointerId); } catch (err) { /* yok */ }
    const s = this.cur;
    this.cur = null;
    if (s) {
      const p = s.p;
      const tiny = p.length === 4 && s.t !== 'pen' && s.t !== 'hl' && Math.abs(p[2] - p[0]) + Math.abs(p[3] - p[1]) < 0.004;
      if (!tiny) {
        this.pushUndo();
        this.list().push(s);
        this.drawStroke(this.bctx, s, this.base.width, this.base.height);
        this.changed();
      }
      this.clearLive();
    } else if (this.tool === 'eraser') {
      if (this.erased) this.changed();
      if (e.pointerType !== 'mouse') this.clearLive();
    }
    this.rect = null;
  },
  scheduleLive() {
    if (this.liveRaf) return;
    this.liveRaf = requestAnimationFrame(() => {
      this.liveRaf = 0;
      this.clearLive();
      if (this.cur) this.drawStroke(this.lctx, this.cur, this.live.width, this.live.height);
    });
  },
  eraserRadius() { return this.size * 3 + 8; },
  drawEraserCursor(x, y) {
    if (!this.lctx) return;
    this.clearLive();
    const c = this.lctx;
    c.save();
    c.strokeStyle = 'rgba(15,23,42,.7)';
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.lineWidth = 1.5 * this.scale;
    c.beginPath();
    c.arc(x * this.live.width, y * this.live.height, this.eraserRadius() * this.scale / Math.max(1, R.zoom), 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.restore();
  },
  eraseAt(x, y) {
    const W = this.rect.width; const H = this.rect.height;
    const list = this.list();
    let hit = false;
    for (let i = list.length - 1; i >= 0; i--) {
      if (strokeHit(list[i], x * W, y * H, this.eraserRadius(), W, H)) {
        if (!this.erased) { this.pushUndo(); this.erased = true; }
        list.splice(i, 1);
        hit = true;
      }
    }
    if (hit) this.redraw();
    this.drawEraserCursor(x, y);
  },
  laserAdd(x, y) {
    this.laserPts.push({ x, y, t: performance.now() });
    if (!this.laserRaf) this.laserRaf = requestAnimationFrame(() => this.laserTick());
  },
  laserTick() {
    const now = performance.now();
    const life = 700;
    this.laserPts = this.laserPts.filter((p) => now - p.t < life);
    if (!this.lctx) { this.laserRaf = 0; return; }
    const c = this.lctx; const W = this.live.width; const H = this.live.height;
    c.clearRect(0, 0, W, H);
    const pts = this.laserPts;
    if (!pts.length) { this.laserRaf = 0; return; }
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = 'rgba(255,0,40,.9)'; c.shadowBlur = 16 * this.scale;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]; const b = pts[i];
      const k = 1 - (now - b.t) / life;
      c.strokeStyle = `rgba(255,45,70,${k})`;
      c.lineWidth = (3 + 7 * k) * this.scale;
      c.beginPath(); c.moveTo(a.x * W, a.y * H); c.lineTo(b.x * W, b.y * H); c.stroke();
    }
    const last = pts[pts.length - 1];
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(last.x * W, last.y * H, 5 * this.scale, 0, Math.PI * 2); c.fill();
    c.restore();
    this.laserRaf = requestAnimationFrame(() => this.laserTick());
  },
  openText(cx, cy, x, y) {
    this.commitText();
    const ed = $('#ink-text-editor');
    const ta = $('#ink-text-input');
    const fs = (14 + this.size * 4) * Math.max(1, R.zoom);
    ed.hidden = false;
    ed.style.left = cx - 10 + 'px';
    ed.style.top = cy - 10 + 'px';
    ta.style.fontSize = fs + 'px';
    ta.style.color = this.color === '#ffffff' ? '#0f172a' : this.color;
    ta.value = '';
    this.textPending = { x, y, w: fs / this.rect.width, key: this.key, color: this.color };
    ta.focus();
    setTimeout(() => { if (this.textPending) ta.focus(); }, 0);
  },
  commitText(cancel) {
    const tp = this.textPending;
    if (!tp) return;
    this.textPending = null;
    const ed = $('#ink-text-editor');
    const ta = $('#ink-text-input');
    const txt = ta.value.replace(/\s+$/, '');
    ed.hidden = true;
    ta.value = '';
    if (cancel || !txt) return;
    if (tp.key === this.key) this.pushUndo();
    this.list(tp.key).push({ t: 'text', c: tp.color, w: tp.w, p: [tp.x, tp.y], txt });
    if (tp.key === this.key) this.redraw();
    this.changed(tp.key);
  },
  changed(key = this.key) {
    this.persist();
    const m = /^S(\d+)$/.exec(key || '');
    if (m) refreshThumb(+m[1]);
    markInkThumbs();
  },
  pushUndo() {
    const k = this.key;
    (this.undoS[k] = this.undoS[k] || []).push(this.list().slice());
    if (this.undoS[k].length > 60) this.undoS[k].shift();
    this.redoS[k] = [];
  },
  undo() {
    const st = this.undoS[this.key];
    if (!st || !st.length) { toast('Geri alınacak işlem yok.', 'info', 1500); return; }
    (this.redoS[this.key] = this.redoS[this.key] || []).push(this.list().slice());
    this.data.pages[this.key] = st.pop();
    this.redraw();
    this.changed();
  },
  redo() {
    const st = this.redoS[this.key];
    if (!st || !st.length) return;
    (this.undoS[this.key] = this.undoS[this.key] || []).push(this.list().slice());
    this.data.pages[this.key] = st.pop();
    this.redraw();
    this.changed();
  },
  clearPage() {
    if (!this.list().length) { toast('Bu sayfada çizim yok.', 'info', 1500); return; }
    this.pushUndo();
    this.data.pages[this.key] = [];
    this.redraw();
    this.changed();
    toast('Sayfadaki çizimler temizlendi.', 'ok', 3500, { label: 'Geri al', fn: () => this.undo() });
  },
  clearAll() {
    if (!confirm('Bu kitaptaki TÜM çizimler silinsin mi? Bu işlem geri alınamaz.')) return;
    this.data.pages = {};
    this.undoS = {}; this.redoS = {};
    this.redraw();
    this.saveNow();
    setupThumbs();
    renderNotesList();
    toast('Tüm çizimler silindi.', 'ok');
  },
  applyToolClass() {
    if (!this.layer) return;
    const t = this.tool;
    const L = this.layer.classList;
    L.toggle('active', DRAW_TOOLS.has(t) || t === 'hand');
    L.toggle('eraser', t === 'eraser');
    L.toggle('laser', t === 'laser');
    L.toggle('text', t === 'text');
    if (t === 'hand') this.layer.style.cursor = 'grab'; else this.layer.style.cursor = '';
  }
};

function setTool(t) {
  if (t === 'shape' && Ink.tool === 'shape') {
    Ink.shape = SHAPES[(SHAPES.indexOf(Ink.shape) + 1) % SHAPES.length];
    toast('Şekil: ' + SHAPE_NAMES[Ink.shape], 'info', 1200);
  }
  Ink.commitText();
  Ink.tool = t;
  Ink.clearLive();
  Ink.applyToolClass();
  $$('#tool-palette [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  $('#tool-shape i').className = SHAPE_ICONS[Ink.shape];
  el.stage.classList.toggle('tool-hand', t === 'hand');
  applyTransform();
}

function setColor(c) {
  Ink.color = c;
  $$('#color-swatches .swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === c));
  if (!DRAW_TOOLS.has(Ink.tool) || Ink.tool === 'eraser' || Ink.tool === 'laser') setTool('pen');
}

function setSize(s) {
  Ink.size = s;
  $$('#size-swatches .size-dot').forEach((d) => d.classList.toggle('active', +d.dataset.size === s));
}

function buildPalette() {
  $('#color-swatches').innerHTML = Ink.COLORS.map((c, i) =>
    `<button class="swatch" data-color="${c}" style="background:${c}" title="Renk ${i + 1}"></button>`).join('') +
    '<label class="swatch custom" title="Özel renk"><input type="color" id="custom-color" value="#00b3a4"></label>';
  $('#size-swatches').innerHTML = Ink.SIZES.map((s) =>
    `<button class="size-dot" data-size="${s}" title="Kalınlık ${s}"><span style="width:${s + 4}px;height:${s + 4}px"></span></button>`).join('');
  setColor(Ink.color);
  setSize(Ink.size);
  setTool('cursor');
}

/* ==========================================================
   SINIF ARAÇLARI
   ========================================================== */
const Spot = {
  on: false, r: 160, x: -1, y: -1,
  toggle() { if (this.on) this.off(); else this.start(); },
  start() {
    this.on = true;
    el.spot.hidden = false;
    if (this.x < 0) { this.x = el.stage.clientWidth / 2; this.y = el.stage.clientHeight / 2; }
    this.paint();
    $('[data-cmd="spotlight"]').classList.add('active');
  },
  off() {
    this.on = false;
    if (el.spot) el.spot.hidden = true;
    const b = $('[data-cmd="spotlight"]');
    if (b) b.classList.remove('active');
  },
  move(e) {
    if (!this.on) return;
    const r = el.stage.getBoundingClientRect();
    this.x = e.clientX - r.left; this.y = e.clientY - r.top;
    this.paint();
  },
  grow(d) { if (!this.on) return; this.r = clamp(this.r + d, 50, 700); this.paint(); },
  paint() {
    el.spot.style.background = `radial-gradient(circle ${this.r}px at ${this.x}px ${this.y}px, transparent ${this.r - 10}px, rgba(2,6,23,.9) ${this.r}px)`;
  }
};

const Curtain = {
  on: false, h: 0.55,
  toggle() { if (this.on) this.off(); else this.start(); },
  start() { this.on = true; this.h = 0.55; el.curtain.hidden = false; this.paint(); $('[data-cmd="curtain"]').classList.add('active'); },
  off() {
    this.on = false;
    if (el.curtain) el.curtain.hidden = true;
    const b = $('[data-cmd="curtain"]');
    if (b) b.classList.remove('active');
  },
  paint() { el.curtain.style.height = (this.h * 100).toFixed(2) + '%'; }
};

const Timer = {
  mode: 'down', total: 300, remain: 300, elapsed: 0, running: false, iv: 0, last: 0,
  show() { el.timer.hidden = false; this.render(); },
  hide() { el.timer.hidden = true; },
  toggleShow() { if (el.timer.hidden) this.show(); else this.hide(); },
  set(min) { this.stop(); this.mode = 'down'; this.total = this.remain = min * 60; el.timer.classList.remove('ringing'); this.render(); },
  add(sec) {
    if (this.mode !== 'down') return;
    this.remain = Math.max(0, this.remain + sec);
    if (!this.running) this.total = this.remain;
    this.render();
  },
  start() {
    if (this.running) { this.stop(); return; }
    if (this.mode === 'down' && this.remain <= 0) this.remain = this.total;
    this.running = true;
    this.last = performance.now();
    this.iv = setInterval(() => this.tick(), 200);
    el.timer.classList.remove('ringing');
    this.render();
  },
  stop() { this.running = false; clearInterval(this.iv); this.render(); },
  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this.mode === 'down') {
      this.remain -= dt;
      if (this.remain <= 0) { this.remain = 0; this.stop(); this.ring(); }
    } else this.elapsed += dt;
    this.render();
  },
  reset() { this.stop(); this.remain = this.total; this.elapsed = 0; el.timer.classList.remove('ringing'); this.render(); },
  toggleMode() { this.mode = this.mode === 'down' ? 'up' : 'down'; this.reset(); },
  ring() {
    el.timer.hidden = false;
    el.timer.classList.add('ringing');
    beep(4);
    toast('Süre doldu!', 'warn', 5000);
    setTimeout(() => el.timer.classList.remove('ringing'), 7000);
  },
  render() {
    const s = this.mode === 'down' ? Math.ceil(this.remain) : Math.floor(this.elapsed);
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
    const d = $('#timer-display');
    d.textContent = h ? `${h}:${pad2(m)}:${pad2(ss)}` : `${pad2(m)}:${pad2(ss)}`;
    d.classList.toggle('low', this.mode === 'down' && this.remain <= 10 && this.remain > 0 && this.running);
    $('#timer-start').innerHTML = this.running ? '<i class="fa-solid fa-pause"></i> Duraklat' : '<i class="fa-solid fa-play"></i> Başlat';
    $('#timer-mode').textContent = this.mode === 'down' ? 'Geri sayım' : 'Kronometre';
    $('#timer-presets').style.display = this.mode === 'down' ? '' : 'none';
    $('#timer-minus').hidden = this.mode !== 'down';
    $('#timer-plus').hidden = this.mode !== 'down';
  }
};

async function snapshot() {
  if (R.mode === 'embed') { toast('Drive önizleme modunda ekran görüntüsü alınamaz.', 'warn'); return; }
  const host = Ink.host;
  if (!host) return;
  const hr = host.getBoundingClientRect();
  const z = hr.width / host.clientWidth;
  const S = Math.min(2.5, 4096 / host.clientWidth);
  const out = document.createElement('canvas');
  out.width = Math.round(host.clientWidth * S);
  out.height = Math.round(host.clientHeight * S);
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  for (const cv of host.querySelectorAll('canvas.page-canvas')) {
    const r = cv.getBoundingClientRect();
    if (!r.width || !cv.width) continue;
    c.drawImage(cv, ((r.left - hr.left) / z) * S, ((r.top - hr.top) / z) * S, (r.width / z) * S, (r.height / z) * S);
  }
  if (!Ink.hidden) c.drawImage(Ink.base, 0, 0, out.width, out.height);
  out.toBlob((b) => {
    if (!b) return;
    downloadBlob(b, `${slug(R.book.title)}-sayfa-${R.page + 1}.png`);
    toast('Ekran görüntüsü kaydedildi.', 'ok');
  }, 'image/png');
}

/* ---------- Paylaşım ---------- */
function shareLink(book, page) {
  const base = location.href.split('#')[0];
  const p = new URLSearchParams();
  const s = book.source;
  if (book.origin === 'default') p.set('kitap', book.id);
  else if (s.type === 'drive') { p.set('drive', s.id); if (GOOGLE_NATIVE[s.mime]) p.set('m', s.mime); }
  else if (s.type === 'url' && s.url) p.set('pdf', s.url);
  else return null;
  if (page > 0) p.set('s', page + 1);
  if (book.origin !== 'default' && book.title) p.set('ad', book.title);
  return base + '#' + p.toString();
}

async function openShare(book, page) {
  const link = shareLink(book, page);
  if (!link) { toast('Bu kitap yalnızca bu cihazda bulunduğu için paylaşılamaz.', 'warn'); return; }
  $('#share-link').value = link;
  const box = $('#qr-box');
  box.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#2563eb;font-size:2rem"></i>';
  $('#share-dialog').showModal();
  try {
    if (!window.qrcode) await loadScript(QR_LIB_URL);
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) {
    box.innerHTML = '<p class="muted small">QR kod oluşturulamadı (çevrimdışı olabilirsiniz). Bağlantıyı kopyalayabilirsiniz.</p>';
  }
}

async function openOriginal() {
  const b = R.book;
  if (!b) return;
  const s = b.source;
  if (s.type === 'drive') window.open(Drive.viewUrl(s.id), '_blank', 'noopener');
  else if (s.type === 'url') window.open(s.url, '_blank', 'noopener');
  else if (s.type === 'local' || s.type === 'memory') {
    const f = s.type === 'local' ? await blobDB.get(s.key) : MEMORY.get(b.id);
    if (f) downloadBlob(f, (f.name || slug(b.title) + '.pdf'));
  }
}

/* ---------- Tam ekran ---------- */
function toggleFullscreen() {
  const d = document;
  const fs = d.fullscreenElement || d.webkitFullscreenElement;
  if (!fs) {
    const e = d.documentElement;
    (e.requestFullscreen || e.webkitRequestFullscreen || (() => {})).call(e);
  } else {
    (d.exitFullscreen || d.webkitExitFullscreen || (() => {})).call(d);
  }
}

/* ---------- Otomatik gizleme ---------- */
let idleTimer = 0;
function resetIdle() {
  el.reader.classList.remove('idle');
  clearTimeout(idleTimer);
  const sec = parseInt(settings.autohide, 10);
  if (sec > 0 && readerOpen()) {
    idleTimer = setTimeout(() => {
      if (!el.reader.classList.contains('panel-open') && Ink.pointer == null && !document.querySelector('dialog[open]')) el.reader.classList.add('idle');
    }, sec * 1000);
  }
}

/* ---------- Sahne boyutu ---------- */
const onStageResize = debounce(() => {
  if (!readerOpen() || !R.book) return;
  if (R.mode === 'flip') {
    const L = computeFlipLayout();
    const o = R.flipLayout;
    if (!o || Math.abs(L.pw - o.pw) > 2 || Math.abs(L.ph - o.ph) > 2 || L.landscape !== o.landscape) {
      const z = R.zoom;
      teardownView();
      buildFlip();
      R.zoom = z;
      clampPan();
      applyTransform();
      onPageChanged(R.page);
    }
  } else if (R.mode === 'single') {
    layoutSingle();
    if (R.fitWidth) fitWidth(false);
    ensureVisible();
  } else {
    Ink.resize();
  }
}, 180);

/* ==========================================================
   DİYALOGLAR
   ========================================================== */
let addTab = 'drive';
let pendingFiles = [];

function openAddDialog(tab) {
  const d = $('#add-dialog');
  $('#add-form').reset();
  pendingFiles = [];
  $('#file-chosen').textContent = 'Birden fazla dosya seçebilirsiniz';
  setAddTab(tab || addTab);
  detectDrive();
  $('#add-drive-keyinfo').innerHTML = apiKey()
    ? '<b style="color:var(--success)">API anahtarı tanımlı:</b> kitap modu, arama ve klasör aktarımı etkin.'
    : 'API anahtarı yok: dosyalar Google önizleyicisinde açılır, klasör aktarımı için <a href="#" data-open-settings>Ayarlar\'dan anahtar ekleyin</a>.';
  d.showModal();
}

function setAddTab(t) {
  addTab = t;
  $$('#add-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.atab === t));
  $$('[data-apane]').forEach((p) => { p.hidden = p.dataset.apane !== t; });
  $('#add-preview').hidden = false;
}

function detectDrive() {
  const v = $('#add-drive-link').value;
  const h = $('#add-drive-detect');
  if (!v.trim()) { h.textContent = ''; h.className = 'hint'; return; }
  const p = Drive.parse(v);
  if (!p) { h.textContent = '✗ Geçerli bir Google Drive bağlantısı algılanamadı.'; h.className = 'hint bad'; return; }
  if (p.type === 'folder') {
    h.textContent = apiKey() ? '✓ Klasör algılandı — içindeki tüm PDF\'ler (alt klasörler dahil) aktarılacak.' : '✗ Klasör aktarımı için Ayarlar\'dan Google API anahtarı eklemelisiniz.';
    h.className = apiKey() ? 'hint ok' : 'hint bad';
  } else {
    h.textContent = `✓ ${p.mime ? GOOGLE_NATIVE[p.mime] : 'Drive dosyası'} algılandı (ID: ${p.id.slice(0, 12)}…)`;
    h.className = 'hint ok';
  }
}

async function submitAdd(openOnly) {
  const title = $('#add-title').value.trim();
  const category = $('#add-category').value.trim();
  const openAfter = openOnly || $('#add-open').checked;
  const btn = $('#add-submit');
  btn.disabled = true;
  try {
    if (addTab === 'drive') {
      const p = Drive.parse($('#add-drive-link').value);
      if (!p) { toast('Geçerli bir Google Drive bağlantısı girin.', 'warn'); return; }
      if (p.type === 'folder') {
        if (!apiKey()) { toast('Klasör aktarmak için Google API anahtarı gerekli.', 'warn', 5000, { label: 'Ayarlar', fn: openSettings }); return; }
        $('#add-dialog').close();
        const books = await importFolder(p.id, { category });
        ui.tab = 'drive'; ui.cat = 'all';
        renderLibrary();
        if (openOnly && books[0]) openBook(books[0]);
        return;
      }
      let meta = null;
      if (apiKey()) {
        try { meta = await Drive.meta(p.id); } catch (e) {
          toast('Drive bilgisi alınamadı: ' + e.message, 'warn', 5000);
        }
      }
      const mime = (meta && meta.mimeType) || p.mime;
      const book = normalizeBook({
        id: 'drive-' + p.id,
        title: title || (meta && meta.name ? meta.name.replace(/\.pdf$/i, '') : 'Drive Belgesi'),
        category: category || 'Google Drive',
        type: GOOGLE_NATIVE[mime] || (meta && meta.size ? 'PDF · ' + fmtBytes(meta.size) : 'Google Drive PDF'),
        source: { type: 'drive', id: p.id, mime },
        addedAt: Date.now(),
        temp: openOnly
      }, 'user');
      $('#add-dialog').close();
      if (!openOnly) { upsertUserBook(book); renderLibrary(); toast('Kitap eklendi.', 'ok'); }
      if (openAfter) openBook(book);
    } else if (addTab === 'url') {
      const url = $('#add-url').value.trim();
      if (!/^https?:\/\//i.test(url)) { toast('Geçerli bir http(s) adresi girin.', 'warn'); return; }
      const drive = Drive.parse(url);
      if (drive && /drive\.google\.com|docs\.google\.com/.test(url)) {
        $('#add-drive-link').value = url;
        setAddTab('drive');
        detectDrive();
        toast('Bu bir Google Drive bağlantısı — Drive sekmesine taşındı.', 'info');
        return;
      }
      let name = 'Web PDF';
      try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/\.pdf$/i, '') || name; } catch (e) { /* yok */ }
      const book = normalizeBook({
        id: 'url-' + hashStr(url),
        title: title || name,
        category: category || 'Web Kitapları',
        type: 'Web PDF',
        cover: $('#add-cover').value.trim() || undefined,
        source: { type: 'url', url },
        addedAt: Date.now(),
        temp: openOnly
      }, 'user');
      $('#add-dialog').close();
      if (!openOnly) { upsertUserBook(book); renderLibrary(); toast('Kitap eklendi.', 'ok'); }
      if (openAfter) openBook(book);
    } else {
      if (!pendingFiles.length) { toast('Önce PDF dosyası seçin.', 'warn'); return; }
      $('#add-dialog').close();
      await addLocalFiles(pendingFiles, { save: !openOnly && $('#add-file-save').checked, open: openAfter, title, category });
    }
  } finally {
    btn.disabled = false;
  }
}

function openSettings() {
  const d = $('#settings-dialog');
  if ($('#add-dialog').open) $('#add-dialog').close();
  $('#set-apikey').value = settings.apiKey || '';
  $('#set-apikey').placeholder = CFG.googleApiKey ? 'config.js içinde tanımlı (değiştirmek için yazın)' : 'AIza…';
  $('#set-proxy').value = settings.proxy || '';
  $('#set-mode').value = settings.defaultMode;
  $('#set-quality').value = settings.quality;
  $('#set-theme').value = settings.theme;
  $('#set-autohide').value = String(settings.autohide);
  $('#set-sound').checked = !!settings.sound;
  $('#set-resume').checked = !!settings.autoResume;
  renderFolderList();
  const info = $('#storage-info');
  info.textContent = '';
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then((e) => {
      info.textContent = `Kullanılan depolama: ${fmtBytes(e.usage || 0)} / ${fmtBytes(e.quota || 0)} · Yedek dosyası cihazdaki PDF'leri içermez.`;
    }).catch(() => {});
  }
  d.showModal();
}

function renderFolderList() {
  const box = $('#folder-list');
  if (!folderSources.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="hint">Aktarılan Drive klasörleri:</div>' + folderSources.map((f) => `
    <div class="folder-row" data-fid="${esc(f.id)}">
      <i class="fa-solid fa-folder"></i>
      <div><b>${esc(f.name)}</b><small>${f.count || 0} kitap · ${timeAgo(f.lastSync)} senkronize edildi</small></div>
      <button type="button" class="icon-btn" data-fact="sync" title="Şimdi senkronize et"><i class="fa-solid fa-rotate"></i></button>
      <button type="button" class="icon-btn" data-fact="open" title="Drive'da aç"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
      <button type="button" class="icon-btn" data-fact="del" title="Klasörü ve kitaplarını kaldır"><i class="fa-solid fa-trash-can"></i></button>
    </div>`).join('');
}

function saveSettingsFromDialog() {
  const prevKey = apiKey();
  settings.apiKey = $('#set-apikey').value.trim();
  settings.proxy = $('#set-proxy').value.trim();
  settings.defaultMode = $('#set-mode').value;
  settings.quality = $('#set-quality').value;
  settings.theme = $('#set-theme').value;
  settings.autohide = $('#set-autohide').value;
  settings.sound = $('#set-sound').checked;
  settings.autoResume = $('#set-resume').checked;
  saveSettings();
  store.set('lastMode', settings.defaultMode);
  applyTheme();
  updateSoundIcon();
  renderLibrary();
  toast('Ayarlar kaydedildi.', 'ok');
  if (apiKey() && apiKey() !== prevKey) syncAllFolders(false);
}

function exportData() {
  const data = {};
  for (const k of store.keys()) data[k] = localStorage.getItem(k);
  const blob = new Blob([JSON.stringify({ app: 'mytahta', version: CFG.version, exported: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
  downloadBlob(blob, `akilli-tahta-yedek-${new Date().toISOString().slice(0, 10)}.json`);
}

async function importData(file) {
  try {
    const j = JSON.parse(await file.text());
    if (!j || j.app !== 'mytahta' || !j.data) throw new Error('Geçersiz yedek dosyası.');
    if (!confirm('Yedek yüklensin mi? Mevcut kütüphane, ayarlar ve çizimler yedektekilerle birleştirilecek.')) return;
    for (const [k, v] of Object.entries(j.data)) if (k.startsWith('mytahta.')) localStorage.setItem(k, v);
    toast('Yedek yüklendi, sayfa yenileniyor…', 'ok');
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    toast('Yedek yüklenemedi: ' + e.message, 'err');
  }
}

function resetAll() {
  if (!confirm('Tüm kütüphane, ayarlar, çizimler ve cihaza kaydedilen PDF\'ler silinecek. Emin misiniz?')) return;
  for (const k of store.keys()) localStorage.removeItem(k);
  try { indexedDB.deleteDatabase('mytahta'); } catch (e) { /* yok */ }
  location.reload();
}

/* ==========================================================
   ADRES ÇUBUĞU (#kitap=…, #drive=…, #pdf=…)
   ========================================================== */
function handleHash() {
  const raw = location.hash.slice(1);
  if (!raw) return;
  const h = new URLSearchParams(raw);
  const s = parseInt(h.get('s') || h.get('sayfa'), 10);
  const page = Number.isNaN(s) ? undefined : Math.max(0, s - 1);
  let book = null;
  if (h.get('kitap')) {
    book = findBook(h.get('kitap'));
    if (!book) toast('Bağlantıdaki kitap bulunamadı.', 'warn');
  } else if (h.get('drive')) {
    const p = Drive.parse(h.get('drive'));
    if (p && p.type === 'file') {
      book = findBook('drive-' + p.id) || normalizeBook({
        id: 'drive-' + p.id, title: h.get('ad') || 'Drive Belgesi', category: 'Paylaşılan',
        source: { type: 'drive', id: p.id, mime: h.get('m') || p.mime }, temp: true
      }, 'user');
    }
  } else if (h.get('pdf')) {
    const url = h.get('pdf');
    if (/^https?:\/\//i.test(url)) {
      book = findBook('url-' + hashStr(url)) || normalizeBook({
        id: 'url-' + hashStr(url), title: h.get('ad') || 'Paylaşılan PDF', category: 'Paylaşılan', source: { type: 'url', url }, temp: true
      }, 'user');
    }
  } else if (h.get('tahta') != null) {
    book = BOARD_BOOK;
  }
  history.replaceState(null, '', location.pathname + location.search);
  if (book) openBook(book, { page });
}

/* ==========================================================
   OLAYLAR
   ========================================================== */
function updateSoundIcon() {
  const b = $('#btn-sound');
  b.querySelector('i').className = settings.sound ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
}

function readerCommand(cmd) {
  switch (cmd) {
    case 'first': goTo(0); break;
    case 'prev': prev(); break;
    case 'next': next(); break;
    case 'last': goTo(R.count - 1); break;
    case 'zoom-in': setZoom(R.zoom * 1.2, null, null, true); break;
    case 'zoom-out': setZoom(R.zoom / 1.2, null, null, true); break;
    case 'zoom-reset': resetZoom(); break;
    case 'fit-width': if (R.fitWidth) resetZoom(); else fitWidth(); break;
    case 'panel':
      if (el.reader.classList.contains('panel-open')) { el.reader.classList.remove('panel-open'); onStageResize(); } else openPanel('outline');
      break;
    case 'thumbs': {
      const hidden = !el.reader.classList.contains('thumbs-hidden');
      el.reader.classList.toggle('thumbs-hidden', hidden);
      store.set('thumbsHidden', hidden);
      onStageResize();
      break;
    }
    case 'sound': settings.sound = !settings.sound; saveSettings(); updateSoundIcon(); break;
    case 'share': if (R.book) openShare(R.book, R.page); break;
    case 'original': openOriginal(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'close': closeReader(); break;
    case 'undo': Ink.undo(); break;
    case 'redo': Ink.redo(); break;
    case 'clear-ink': Ink.clearPage(); break;
    case 'clear-all-ink': Ink.clearAll(); break;
    case 'toggle-ink':
      Ink.hidden = !Ink.hidden;
      Ink.redraw();
      $('#btn-toggle-ink i').className = Ink.hidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      break;
    case 'spotlight': Spot.toggle(); break;
    case 'curtain': Curtain.toggle(); break;
    case 'timer': Timer.toggleShow(); break;
    case 'snapshot': snapshot(); break;
    case 'board-add': addBoardPage(); break;
    case 'board-bg': cycleBoardBg(); break;
    default: break;
  }
}

function bindEvents() {
  // Diyaloglardaki "Kapat/Vazgeç" düğmeleri formu göndermesin (Enter ile yanlışlıkla kapanmayı önler)
  $$('.dialog button[value="cancel"]').forEach((b) => {
    b.type = 'button';
    b.addEventListener('click', () => b.closest('dialog').close());
  });

  // Kütüphane
  $('#library-search').addEventListener('input', debounce((e) => { ui.q = e.target.value; renderLibrary(); }, 120));
  $('#library-sort').value = ui.sort;
  $('#library-sort').addEventListener('change', (e) => { ui.sort = e.target.value; renderLibrary(); });
  $('#library-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { ui.tab = t.dataset.tab; ui.cat = 'all'; renderLibrary(); }
  });
  $('#category-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { ui.cat = c.dataset.cat; renderLibrary(); }
  });
  const onCard = (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const book = findBook(card.dataset.id);
    if (!book) return;
    const act = e.target.closest('[data-act]');
    const a = act ? act.dataset.act : 'open';
    if (a === 'fav') {
      if (favorites.has(book.id)) favorites.delete(book.id); else favorites.add(book.id);
      store.set('favorites', [...favorites]);
      renderLibrary();
    } else if (a === 'edit') editBook(book);
    else if (a === 'del') deleteBook(book);
    else if (a === 'share') openShare(book, 0);
    else openBook(book);
  };
  $('#book-grid').addEventListener('click', onCard);
  $('#continue-row').addEventListener('click', onCard);
  $('#book-grid').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('book-card')) onCard(e); });
  $('#empty-state').addEventListener('click', (e) => { if (e.target.closest('[data-action="add"]')) openAddDialog(); });

  $('#btn-add-book').addEventListener('click', () => openAddDialog());
  $('#btn-open-board').addEventListener('click', () => openBook(BOARD_BOOK));
  $('#btn-open-timer').addEventListener('click', () => Timer.toggleShow());
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-help').addEventListener('click', () => $('#help-dialog').showModal());
  $('#btn-sync-drive').addEventListener('click', () => syncAllFolders(true));
  $('#btn-theme').addEventListener('click', () => {
    settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    saveSettings();
    applyTheme();
  });

  // Ekleme diyaloğu
  $('#add-tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-atab]'); if (t) setAddTab(t.dataset.atab); });
  $('#add-drive-link').addEventListener('input', detectDrive);
  $('#add-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    submitAdd(false);
  });
  $('#add-preview').addEventListener('click', () => submitAdd(true));
  $('#add-dialog').addEventListener('click', (e) => { if (e.target.closest('[data-open-settings]')) { e.preventDefault(); openSettings(); } });
  $('#add-file').addEventListener('change', (e) => {
    pendingFiles = [...e.target.files];
    $('#file-chosen').textContent = pendingFiles.length ? pendingFiles.map((f) => f.name).join(', ') : 'Birden fazla dosya seçebilirsiniz';
  });
  const dz = $('#drop-zone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pendingFiles = [...e.dataTransfer.files];
    $('#file-chosen').textContent = pendingFiles.map((f) => f.name).join(', ');
  });

  // Sayfaya sürükle-bırak PDF
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length || e.target.closest('dialog')) return;
    e.preventDefault();
    addLocalFiles(e.dataTransfer.files, { save: true, open: e.dataTransfer.files.length === 1 });
  });

  // Ayarlar
  $('#settings-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') saveSettingsFromDialog();
  });
  $('#set-apikey-show').addEventListener('click', () => {
    const i = $('#set-apikey');
    i.type = i.type === 'password' ? 'text' : 'password';
  });
  $('#folder-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fact]');
    if (!b) return;
    const id = b.closest('[data-fid]').dataset.fid;
    const f = folderSources.find((x) => x.id === id);
    if (b.dataset.fact === 'sync') { b.classList.add('spin'); try { await importFolder(id, { category: f && f.category }); } catch (err) { /* bildirildi */ } renderFolderList(); }
    if (b.dataset.fact === 'open') window.open(Drive.folderUrl(id), '_blank', 'noopener');
    if (b.dataset.fact === 'del' && confirm('Klasör ve ondan aktarılan kitaplar kütüphaneden kaldırılsın mı?')) {
      folderSources = folderSources.filter((x) => x.id !== id);
      userBooks = userBooks.filter((x) => x.folderId !== id);
      saveFolders(); saveLibrary(); renderFolderList(); renderLibrary();
    }
  });
  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#btn-reset').addEventListener('click', resetAll);

  // Paylaşım
  $('#share-copy').addEventListener('click', async () => {
    const v = $('#share-link').value;
    try { await navigator.clipboard.writeText(v); } catch (e) { $('#share-link').select(); document.execCommand('copy'); }
    toast('Bağlantı kopyalandı.', 'ok');
  });

  // Okuyucu komutları
  el.reader.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cmd]');
    if (c && !c.disabled) { readerCommand(c.dataset.cmd); return; }
    const g = e.target.closest('[data-goto]');
    if (g) { goTo(+g.dataset.goto); if (window.innerWidth < 820) el.reader.classList.remove('panel-open'); return; }
    const ol = e.target.closest('[data-ol]');
    if (ol) {
      const it = R.outline[+ol.dataset.ol];
      if (it && it.pageIndex != null) goTo(it.pageIndex);
      else if (it) destToIndex(it.dest).then((i) => { if (i != null) goTo(i); }).catch(() => {});
    }
  });
  $('#mode-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b && !b.disabled) setMode(b.dataset.mode); });
  $('#tool-palette').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tool]');
    if (t) setTool(Ink.tool === t.dataset.tool && t.dataset.tool !== 'shape' ? 'cursor' : t.dataset.tool);
    const sw = e.target.closest('.swatch[data-color]');
    if (sw) setColor(sw.dataset.color);
    const sz = e.target.closest('[data-size]');
    if (sz) setSize(+sz.dataset.size);
  });
  $('#custom-color').addEventListener('input', (e) => setColor(e.target.value));
  el.thumbs.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.thumbs.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  el.thumbs.addEventListener('click', (e) => { const t = e.target.closest('.thumb-item'); if (t) goTo(+t.dataset.i); });
  el.pageInput.addEventListener('change', () => {
    const v = parseInt(el.pageInput.value, 10);
    if (v >= 1 && v <= R.count) goTo(v - 1); else el.pageInput.value = R.page + 1;
  });
  el.pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.pageInput.blur(); });
  $('.side-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ptab]'); if (b) openPanel(b.dataset.ptab); });
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('#search-input').value); });

  // Metin aracı
  const ta = $('#ink-text-input');
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Ink.commitText(); }
    if (e.key === 'Escape') Ink.commitText(true);
  });
  ta.addEventListener('blur', () => {
    const tp = Ink.textPending;
    setTimeout(() => { if (tp && Ink.textPending === tp && document.activeElement !== ta) Ink.commitText(); }, 150);
  });

  // Sahne: kaydırma, iki parmak yakınlaştırma, kaydırarak sayfa çevirme
  const pointers = new Map();
  let gesture = null;
  el.stage.addEventListener('pointermove', (e) => Spot.move(e), true);
  el.stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.stage-arrow, .curtain-handle, .reader-notice, .reader-loading')) return;
    if (!(Ink.tool === 'cursor' || Ink.tool === 'hand') || R.mode === 'embed') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: R.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    const canPan = Ink.tool === 'hand' || (R.mode === 'single' && R.zoom > 1.01);
    gesture = { type: canPan ? 'pan' : (R.mode === 'single' ? 'swipe' : null), x0: e.clientX, y0: e.clientY, px: R.panX, py: R.panY };
    if (gesture.type) { try { el.stage.setPointerCapture(e.pointerId); } catch (err) { /* yok */ } }
  });
  el.stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const old = R.zoom;
      const z = clamp(gesture.z0 * (d / gesture.d0), 0.4, 6);
      const st = el.stage.getBoundingClientRect();
      const ox = gesture.cx - (st.left + st.width / 2); const oy = gesture.cy - (st.top + st.height / 2);
      R.panX = ox - (ox - R.panX) * (z / old);
      R.panY = oy - (oy - R.panY) * (z / old);
      R.zoom = z;
      if (z <= 1) { R.panX = 0; R.panY = 0; }
      clampPan();
      applyTransform();
    } else if (gesture.type === 'pan') {
      R.panX = gesture.px + (e.clientX - gesture.x0);
      R.panY = gesture.py + (e.clientY - gesture.y0);
      R.fitWidth = false;
      clampPan();
      applyTransform();
    }
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture && gesture.type === 'swipe' && pointers.size === 0) {
      const dx = e.clientX - gesture.x0; const dy = e.clientY - gesture.y0;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else prev(); }
    }
    if (pointers.size === 0) gesture = null;
  };
  el.stage.addEventListener('pointerup', endPointer);
  el.stage.addEventListener('pointercancel', endPointer);
  el.stage.addEventListener('wheel', (e) => {
    if (R.mode === 'embed' || !R.book) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { setZoom(R.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); return; }
    if (e.shiftKey && Spot.on) { Spot.grow(e.deltaY > 0 ? -20 : 20); return; }
    if (R.zoom > 1.01) {
      R.panX -= e.deltaX; R.panY -= e.deltaY; R.fitWidth = R.fitWidth && !e.deltaX;
      clampPan(); applyTransform();
      return;
    }
    const now = Date.now();
    if (now - R.lastWheel < 450 || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 20) return;
    R.lastWheel = now;
    if ((e.deltaY || e.deltaX) > 0) next(); else prev();
  }, { passive: false });

  // Perde tutamacı
  const handle = $('#curtain-handle');
  handle.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId); handle.dataset.drag = '1'; });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.dataset.drag) return;
    const r = el.stage.getBoundingClientRect();
    Curtain.h = clamp((e.clientY - r.top) / r.height, 0.03, 1);
    Curtain.paint();
  });
  handle.addEventListener('pointerup', () => { delete handle.dataset.drag; });
  handle.addEventListener('dblclick', () => Curtain.off());

  // Zamanlayıcı
  $('#timer-presets').addEventListener('click', (e) => { const b = e.target.closest('[data-min]'); if (b) Timer.set(+b.dataset.min); });
  $('#timer-start').addEventListener('click', () => Timer.start());
  $('#timer-reset').addEventListener('click', () => Timer.reset());
  $('#timer-plus').addEventListener('click', () => Timer.add(60));
  $('#timer-minus').addEventListener('click', () => Timer.add(-60));
  $('#timer-mode').addEventListener('click', () => Timer.toggleMode());
  $('#timer-close').addEventListener('click', () => Timer.hide());
  const drag = $('#timer-drag');
  let dragOff = null;
  drag.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = el.timer.getBoundingClientRect();
    dragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
    drag.setPointerCapture(e.pointerId);
  });
  drag.addEventListener('pointermove', (e) => {
    if (!dragOff) return;
    el.timer.style.left = clamp(e.clientX - dragOff.x, 0, window.innerWidth - el.timer.offsetWidth) + 'px';
    el.timer.style.top = clamp(e.clientY - dragOff.y, 0, window.innerHeight - el.timer.offsetHeight) + 'px';
    el.timer.style.right = 'auto'; el.timer.style.bottom = 'auto';
  });
  drag.addEventListener('pointerup', () => { dragOff = null; });

  // Klavye
  document.addEventListener('keydown', onKey);

  // Diğer
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => el.reader.addEventListener(ev, resetIdle, { passive: true }));
  new ResizeObserver(onStageResize).observe(el.stage);
  window.addEventListener('popstate', () => { if (readerOpen()) closeReader({ fromPop: true }); });
  window.addEventListener('hashchange', handleHash);
  const fsIcon = () => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('#btn-fullscreen i').className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
  };
  document.addEventListener('fullscreenchange', fsIcon);
  document.addEventListener('webkitfullscreenchange', fsIcon);
  window.addEventListener('offline', () => toast('İnternet bağlantısı kesildi. Daha önce açılan kitaplar çalışmaya devam edebilir.', 'warn', 5000));
  window.addEventListener('online', () => toast('İnternet bağlantısı geri geldi.', 'ok'));
  window.addEventListener('beforeunload', () => { Ink.saveNow(); saveProgress.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Ink.saveNow(); } });
}

function onKey(e) {
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
  if (document.querySelector('dialog[open]')) return;
  if (!readerOpen()) {
    if (e.key === '/' && !typing) { e.preventDefault(); $('#library-search').focus(); }
    if (e.key === '?' && !typing) $('#help-dialog').showModal();
    return;
  }
  if (typing) return;
  if (Ink.textPending) { $('#ink-text-input').focus(); return; }
  const k = e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) Ink.redo(); else Ink.undo(); return; }
  if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); Ink.redo(); return; }
  if (ctrl && (k === 'f' || k === 'F')) { if (R.pdf) { e.preventDefault(); openPanel('search'); } return; }
  if (ctrl || e.altKey) return;
  const map = { v: 'cursor', p: 'pen', h: 'hl', r: 'shape', x: 'text', e: 'eraser', l: 'laser' };
  const lk = k.toLocaleLowerCase('en');
  if (map[lk]) { setTool(map[lk]); return; }
  if (/^[1-8]$/.test(k)) { setColor(Ink.COLORS[+k - 1]); return; }
  switch (k) {
    case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break;
    case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
    case 'ArrowDown': case 'ArrowUp':
      e.preventDefault();
      if (R.zoom > 1.01) { R.panY += k === 'ArrowDown' ? -80 : 80; clampPan(); applyTransform(); } else if (k === 'ArrowDown') next(); else prev();
      break;
    case 'Home': e.preventDefault(); goTo(0); break;
    case 'End': e.preventDefault(); goTo(R.count - 1); break;
    case '+': case '=': setZoom(R.zoom * 1.2, null, null, true); break;
    case '-': case '_': setZoom(R.zoom / 1.2, null, null, true); break;
    case '0': resetZoom(); break;
    case 'w': case 'W': readerCommand('fit-width'); break;
    case 'f': case 'F': toggleFullscreen(); break;
    case 'm': case 'M': if (!isBoard() && R.mode !== 'embed') setMode(R.mode === 'flip' ? 'single' : 'flip'); break;
    case 't': case 'T': readerCommand('thumbs'); break;
    case 's': case 'S': Spot.toggle(); break;
    case 'c': case 'C': Curtain.toggle(); break;
    case '[': Spot.grow(-30); break;
    case ']': Spot.grow(30); break;
    case '?': $('#help-dialog').showModal(); break;
    case 'Escape':
      if (Ink.tool !== 'cursor') setTool('cursor');
      else if (Spot.on) Spot.off();
      else if (Curtain.on) Curtain.off();
      else if (el.reader.classList.contains('panel-open')) { el.reader.classList.remove('panel-open'); onStageResize(); }
      else closeReader();
      break;
    default: break;
  }
}

/* ==========================================================
   BAŞLANGIÇ
   ========================================================== */
function startClock() {
  const c = $('#live-clock');
  const update = () => { c.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  update();
  setInterval(update, 1000);
}

function init() {
  Object.assign(el, {
    reader: $('#reader'), stage: $('#reader-stage'), viewport: $('#reader-viewport'), loading: $('#reader-loading'),
    notice: $('#reader-notice'), thumbs: $('#thumbs'), pageInput: $('#page-jump-input'), pageTotal: $('#page-total-count'),
    zoomLabel: $('#zoom-label'), title: $('#reader-title-text'), src: $('#reader-src'), nav: $('#reader-nav'),
    spot: $('#spotlight'), curtain: $('#curtain'), timer: $('#timer-widget')
  });
  $$('[data-app-name]').forEach((n) => { n.textContent = CFG.appName; });
  $$('[data-app-version]').forEach((n) => { n.textContent = CFG.version; });
  $('#footer-year').textContent = new Date().getFullYear();
  document.title = `${CFG.appName} - Akıllı Tahta v${CFG.version}`;
  applyTheme();
  buildPalette();
  updateSoundIcon();
  bindEvents();
  renderLibrary();
  startClock();
  Timer.render();
  if (!window.pdfjsLib) toast('PDF motoru yüklenemedi; internet bağlantınızı kontrol edin. Drive önizleme modu yine çalışır.', 'err', 8000);
  if (!window.St) toast('Sayfa çevirme bileşeni yüklenemedi; kitaplar tek sayfa modunda açılacak.', 'warn', 6000);
  setTimeout(() => $('#splash-screen').classList.add('hidden'), 900);
  handleHash();
  syncAllFolders(false);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker kaydedilemedi:', err));
  }
}

document.addEventListener('DOMContentLoaded', init);
