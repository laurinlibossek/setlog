// Offline support. Everything the app needs is cached on install, so it opens
// instantly and works in a basement gym with no signal.
// When you change any file, bump VERSION so phones pick up the update.
const VERSION = 'setlog-v1.3.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/calc.js',
  './js/charts.js',
  './js/db.js',
  './js/demo.js',
  './js/drafts.js',
  './js/editor.js',
  './js/format.js',
  './js/icons.js',
  './js/io.js',
  './js/lib.js',
  './js/pickers.js',
  './js/seed.js',
  './js/sheet.js',
  './js/sound.js',
  './js/store.js',
  './js/tools.js',
  './js/ui.js',
  './js/util.js',
  './js/screens/exercises.js',
  './js/screens/history.js',
  './js/screens/measure.js',
  './js/screens/profile.js',
  './js/screens/workout.js',
  './js/vendor/hooks.js',
  './js/vendor/htm.js',
  './js/vendor/preact.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('setlog-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match('./index.html') || await cache.match('./');
      if (cached) return cached;
      try { return await fetch(req); } catch (e) { return new Response('Offline', { status: 503 }); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
