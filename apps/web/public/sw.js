/*
 * Service worker da VNDesign Leads (PWA).
 *  - Página "Sem ligação" quando a navegação falha (os dados nunca ficam em cache).
 *  - Página "A atualizar" quando o servidor está a reiniciar (publicação na Hostinger).
 *  - Notificações push (follow-ups do dia) e abertura do lead ao tocar.
 */
const CACHE = 'vnd-shell-v2';
const OFFLINE_URL = '/offline';
const UPDATING_URL = '/a-atualizar';
const PRECACHE = [OFFLINE_URL, UPDATING_URL, '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Só as navegações (páginas): rede primeiro.
//  - 502/503/504 ou servidor sem resposta (com internet): "A atualizar" (volta sozinha);
//  - sem internet: "Sem ligação".
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request)
      .then(async (res) => (res.status >= 502 && res.status <= 504 ? (await caches.match(UPDATING_URL)) || res : res))
      .catch(async () => {
        const page = self.navigator.onLine === false ? OFFLINE_URL : UPDATING_URL;
        return (await caches.match(page)) || (await caches.match(OFFLINE_URL)) || Response.error();
      }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'VNDesign Leads';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || 'vnd',
      renotify: Boolean(data.tag),
      lang: 'pt-PT',
      data: { url: data.url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
