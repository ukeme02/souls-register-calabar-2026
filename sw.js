/* ============ Service worker — offline app shell ============ */
const CACHE = 'souls-register-v2';
const SHELL = [
  './',
  './index.html',
  './css/fonts.css',
  './css/styles.css',
  './fonts/nunito-sans-expanded-latin.woff2',
  './fonts/nunito-sans-expanded-latin-ext.woff2',
  './js/config.js',
  './js/db.js',
  './js/sync.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never touch API calls (Apps Script) or non-GET
  if (e.request.method !== 'GET' || url.hostname.includes('script.google.com')) return;

  // App shell: cache-first, then network (and refresh cache)
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const fetchAndCache = fetch(e.request)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchAndCache;
    }).then((res) => {
      if (res) return res;
      // navigation fallback
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    })
  );
});
