/* Mert Yeşil Eğitim Portalı — Akıllı Tahta Service Worker
 * Uygulama kabuğunu ve CDN kütüphanelerini önbelleğe alır, açılan PDF'leri
 * çevrimdışı kullanım için saklar. */
const VERSION = 'mytahta-v2.0.0';
const SHELL_CACHE = VERSION + '-shell';
const LIB_CACHE = 'mytahta-libs-v1';
const PDF_CACHE = 'mytahta-pdfs-v1';
const PDF_LIMIT = 40;

const SHELL = ['./', './akillitahta.html', './assets/app.css', './assets/app.js', './assets/config.js', './manifest.json', './icon.png'];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mytahta-v') && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPdfRequest(url) {
  return /\.pdf($|\?)/i.test(url.pathname + url.search) ||
    (url.hostname === 'www.googleapis.com' && /\/drive\/v3\/files\/[^/]+(\/export)?$/.test(url.pathname) && /alt=media|mimeType=application%2Fpdf|mimeType=application\/pdf/.test(url.search));
}

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: cacheName === SHELL_CACHE && new URL(req.url).pathname.endsWith('/') });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (isPdfRequest(url)) {
      if (req.headers.has('range')) return;
      event.respondWith(networkFirst(req, PDF_CACHE).finally(() => trimCache(PDF_CACHE, PDF_LIMIT)));
      return;
    }
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, LIB_CACHE));
    return;
  }

  if (isPdfRequest(url) && !req.headers.has('range')) {
    event.respondWith(networkFirst(req, PDF_CACHE).finally(() => trimCache(PDF_CACHE, PDF_LIMIT)));
  }
});
