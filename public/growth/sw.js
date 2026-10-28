/* App-shell cache. GitHub API calls are never cached here; the app caches vault files itself. */
const VERSION = 'growth-v9';
const SHELL = ['./', 'index.html', 'styles.css', 'features.js', 'app.js', 'manifest.webmanifest', 'vendor/marked.js', 'vendor/purify.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Android share menu → Growth: stash what was shared, then open the app's share screen. */
async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll('media').filter((f) => f && typeof f !== 'string' && f.size);
  const c = await caches.open('growth-share');
  const base = new URL('__share', self.registration.scope).href;
  for (const k of await c.keys()) await c.delete(k);
  await c.put(base, new Response(JSON.stringify({ title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '', files: files.length, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
  for (let i = 0; i < files.length; i++) await c.put(base + '/file' + i, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'image/jpeg' } }));
  return Response.redirect(new URL('./#/share', self.registration.scope).href, 303);
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share')) {
    e.respondWith(receiveShare(e.request).catch(() => Response.redirect(new URL('./#/inbox', self.registration.scope).href, 303)));
    return;
  }
  if (e.request.method !== 'GET' || url.hostname === 'api.github.com') return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  // Network first for the shell (so updates land on next open), cache as fallback offline.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(e.request, sameOrigin ? { cache: 'no-cache' } : {});
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
