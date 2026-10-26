/* App-shell cache. GitHub API calls are never cached here; the app caches vault files itself. */
const VERSION = 'growth-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'vendor/marked.js', 'vendor/purify.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.github.com') return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  // Network first for the shell (so updates land on next open), cache as fallback offline.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(e.request);
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    } catch {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (e.request.mode === 'navigate') return cache.match('index.html');
      throw new Error('offline');
    }
  })());
});
