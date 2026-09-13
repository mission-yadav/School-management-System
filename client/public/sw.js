/* Janaki School PWA service worker.
 * Strategy:
 *  - /api/*  → network only (never cache dynamic data / auth).
 *  - navigations (HTML) → network-first, fall back to cached app shell when offline.
 *  - other same-origin GET (hashed JS/CSS/images) → cache-first, refreshed in the background.
 * Vite fingerprints asset filenames, so cache-first is safe: a new build = new URLs.
 */
const CACHE = 'janaki-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // let cross-origin pass through
  if (url.pathname.startsWith('/api')) return;          // never cache API/auth

  // App navigations: network-first so a fresh deploy is picked up; offline → cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(SHELL, res.clone())); return res; })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  // Static assets: serve from cache, update in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => { if (res && res.status === 200) caches.open(CACHE).then((c) => c.put(request, res.clone())); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
