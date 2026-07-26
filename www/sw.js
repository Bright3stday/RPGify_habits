// Service worker for the browser PWA build only (see js/pwa.js — this never
// registers inside the installed Android app, since @capgo/capacitor-updater
// already owns updating that build's web content, and a second cache layer
// here could shadow what it swaps in).
//
// Strategy: network-first, falling back to cache when offline. This is a
// small app that changes often (OTA-style web updates), so serving a stale
// cached copy while online is a worse failure mode than one extra
// round-trip — the cache exists purely so the app still opens offline.
const CACHE = 'rpgify-pwa-v1';
const APP_SHELL = ['./', './index.html', './styles/main.css', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
  );
});
