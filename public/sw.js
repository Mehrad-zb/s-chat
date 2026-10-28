/* S-Chat service worker — offline shell, media cache, push notifications */
const VERSION = 'sc-v9';
const SHELL = ['/', '/app.css?v=9', '/js/i18n.js?v=9', '/js/core.js?v=9', '/js/app.js?v=9', '/js/chat.js?v=9', '/js/media.js?v=9', '/js/call.js?v=9', '/js/main.js?v=9',
  '/manifest.webmanifest', '/img/bokeh.jpg', '/icons/icon-192.png?v=2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'sc-media').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname.startsWith('/download/')) return;
  // uploaded media: cache-first (immutable, random names). Skip range requests (audio/video seeking).
  if (url.pathname.startsWith('/f/')) {
    if (req.headers.has('range')) return;
    e.respondWith(caches.open('sc-media').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200 && /^image\//.test(res.headers.get('content-type') || '')) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // app navigation: network first, fall back to cached shell
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); return res; }).catch(() => caches.match('/')));
    return;
  }
  // static assets: stale-while-revalidate
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Satin Connect', body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    // Always show a notification: iOS/Safari cancels push for sites that receive a push without showing one.
    // (The server already skips pushes for the chat you are looking at.)
    if (d.type === 'missed-call' && d.tag) {
      const old = await self.registration.getNotifications({ tag: d.tag.replace('call-', 'call-') });
      old.forEach((n) => n.close());
    }
    const isCall = d.type === 'call';
    await self.registration.showNotification(d.title || 'Satin Connect', {
      body: d.body || '',
      icon: d.icon || '/icons/icon-192.png?v=2',
      badge: '/icons/badge-96.png?v=2',
      tag: d.tag || 'sc',
      renotify: true,
      silent: false,
      requireInteraction: isCall,
      vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [120, 60, 120],
      data: { chat_id: d.chat_id, type: d.type, call_id: d.call_id },
      actions: isCall ? [{ action: 'open', title: '📞 پاسخ / Answer' }] : [],
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        if (d.chat_id) w.postMessage({ type: 'open-chat', chat_id: d.chat_id });
        return;
      }
    }
    await self.clients.openWindow(d.chat_id ? `/?chat=${d.chat_id}` : '/');
  })());
});
