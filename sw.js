// AGENTVERSE app: offline shell + background notifications + automatic updates.
// Live data (/api, /mcp, /sv, /u, /health, data/*.json) always comes from the network.
const CACHE = 'agentverse-v3';
const META = 'agentverse-meta';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== META).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/(api|mcp|sv|u)\/|\/health$|\/data\//.test(u.pathname)) return;
  if (e.request.mode === 'navigate') { // always the newest deploy when online
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

async function meta(key, val) {
  const c = await caches.open(META);
  if (val === undefined) { const r = await c.match(key); return r ? r.text() : null; }
  await c.put(key, new Response(String(val)));
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let shown = 0;
    try {
      const inbox = await meta('./__inbox');
      if (inbox) {
        const r = await fetch(`./api/push/inbox/${inbox}`, { cache: 'no-store' });
        const { messages = [] } = r.ok ? await r.json() : {};
        const last = await meta('./__lastPush');
        const fresh = [];
        for (const m of messages) { if (m.id === last) break; fresh.push(m); }
        for (const m of fresh.slice(0, 3).reverse()) {
          await self.registration.showNotification(m.title, { body: m.body, tag: m.tag || m.id, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: m.url || './' }, renotify: true });
          shown++;
        }
        if (messages[0]) await meta('./__lastPush', messages[0].id);
      }
    } catch (err) { /* fall through to a generic notice */ }
    if (!shown) await self.registration.showNotification('AGENTVERSE', { body: 'Something needs your attention.', icon: './icons/icon-192.png', data: { url: './' } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if (w.url.startsWith(self.registration.scope)) { w.focus(); return w.navigate(url).catch(() => {}); } }
    return self.clients.openWindow(url);
  }));
});
