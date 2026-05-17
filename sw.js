// ============================================================
//  TiendaMax — sw.js actualizado
//  REEMPLAZA tu sw.js actual con este archivo completo
// ============================================================

const CACHE_NAME = 'tiendamax-v4';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/script.js',
  '/js/push-notifications.js',
  '/manifest.json',
  '/productos.json',
  '/categorias.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── Push recibido desde servidor (modo backend) ───────────────
self.addEventListener('push', event => {
  let datos = {
    titulo: '📢 TiendaMax',
    cuerpo: 'Tienes una nueva notificación',
    url: '/',
    icono: '/icons/icon-192.png'
  };
  if (event.data) {
    try { datos = { ...datos, ...event.data.json() }; }
    catch { datos.cuerpo = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: datos.icono,
      badge: datos.icono,
      data: { url: datos.url },
      vibrate: [200, 100, 200],
      actions: [
        { action: 'ver', title: '👀 Ver oferta' },
        { action: 'cerrar', title: 'Cerrar' }
      ]
    })
  );
});

// ── Clic en la notificación ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'cerrar') return;

  const urlDestino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const client of lista) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(urlDestino);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(urlDestino);
    })
  );
});
