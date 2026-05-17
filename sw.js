// ============================================================
//  TiendaMax — sw.js (Service Worker actualizado)
//  INSTRUCCIÓN: Reemplaza tu sw.js actual con este contenido.
//  Agrega el bloque de Push al final de tu sw.js existente.
// ============================================================

// ── CACHE (mantén tu lógica de cache existente arriba) ──────

const CACHE_NAME = 'tiendamax-v3';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/script.js',
  '/js/push-notifications.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
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

// ── PUSH NOTIFICATIONS ──────────────────────────────────────

// Se dispara cuando llega una notificación push desde el servidor
self.addEventListener('push', event => {
  let datos = {
    titulo: '📢 TiendaMax',
    cuerpo: 'Tienes una nueva notificación',
    url: '/',
    icono: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  };

  if (event.data) {
    try {
      datos = { ...datos, ...event.data.json() };
    } catch (e) {
      datos.cuerpo = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: datos.icono,
      badge: datos.badge,
      data: { url: datos.url },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: [
        { action: 'ver', title: '👀 Ver oferta' },
        { action: 'cerrar', title: 'Cerrar' }
      ]
    })
  );
});

// Se dispara cuando el usuario hace clic en la notificación
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'cerrar') return;

  const urlDestino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si ya hay una ventana abierta, enfocala y navega
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(urlDestino);
          return;
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(urlDestino);
      }
    })
  );
});

// Se dispara cuando se cierra la notificación sin hacer clic
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notificación cerrada:', event.notification.title);
});
