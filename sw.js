// ═══════════════════════════════════════════════════════
// TiendaMax — Service Worker v44
// - Cache-first para shell estático
// - Network-first para JSON de datos
// - Soporte de Notificaciones Push (FCM)
// - Manejo de pushsubscriptionchange para no perder tokens
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-v53';
const STATIC_ASSETS = [
  '/index.html',
  '/css/styles.css',
  '/css/animations.css',
  '/css/styles.banner.fix.css',
  '/css/styles.fixes.css',
  '/css/premium-theme.css',
  '/css/light-mode.css',
  '/css/admin.css',
  '/js/script.js',
  '/js/analytics.js',
  '/js/share-patch.js',
  '/js/banners.js',
  '/js/subcategorias.js',
  '/js/revolico_integration.js',
  '/js/biometric-auth.js',
  '/js/event-delegation.js',
  '/og-image.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
      await self.clients.claim();
      const allClients = await self.clients.matchAll({ type: 'window' });
      for (const client of allClients) {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
      }
    })()
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  const externos = [
    'gstatic.com', 'googleapis.com', 'firebaseio.com', 'firebaseapp.com',
    'github.com', 'githubusercontent.com',
    'whatsapp.com', 'wa.me', 'unsplash.com',
    'fonts.googleapis.com', 'fonts.gstatic.com',
    'eltoque.com'
  ];
  if (externos.some(d => url.hostname.includes(d))) return;

  if (e.request.method !== 'GET') return;

  const path = url.pathname;

  if (path.endsWith('.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (path.endsWith('.js') || path.endsWith('.css')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (STATIC_ASSETS.some(a => path.endsWith(a.split('/').pop()))) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const networkFetch = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone()).catch(() => {});
            return res;
          }).catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request)
          .then(cached => cached || caches.match('/index.html'))
      )
  );
});

self.addEventListener('push', e => {
  let datos = {
    titulo: '📢 TiendaMax',
    cuerpo: 'Tienes una nueva notificación',
    url: '/',
    icono: '/icons/icon-192.png'
  };
  if (e.data) {
    try {
      const jsonPayload = e.data.json();
      if (jsonPayload.notification) {
        datos.titulo = jsonPayload.notification.title || datos.titulo;
        datos.cuerpo = jsonPayload.notification.body  || datos.cuerpo;
        if (jsonPayload.notification.icon) datos.icono = jsonPayload.notification.icon;
        else if (jsonPayload.notification.image) datos.icono = jsonPayload.notification.image;
      }
      if (jsonPayload.data) {
        datos.url    = jsonPayload.data.url || jsonPayload.data.click_action || datos.url;
        datos.titulo = jsonPayload.data.title || jsonPayload.data.titulo || datos.titulo;
        datos.cuerpo = jsonPayload.data.body  || jsonPayload.data.cuerpo  || datos.cuerpo;
        if (jsonPayload.data.icon) datos.icono = jsonPayload.data.icon;
      }
      if (jsonPayload.title || jsonPayload.titulo) datos.titulo = jsonPayload.title || jsonPayload.titulo;
      if (jsonPayload.body  || jsonPayload.cuerpo) datos.cuerpo = jsonPayload.body  || jsonPayload.cuerpo;
      if (jsonPayload.url)                          datos.url    = jsonPayload.url;
      if (jsonPayload.icon || jsonPayload.icono)   datos.icono  = jsonPayload.icon || jsonPayload.icono;
    } catch (err) {
      datos.cuerpo = e.data.text();
    }
  }
  e.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: datos.icono,
      badge: datos.icono,
      data: { url: datos.url },
      vibrate: [200, 100, 200],
      actions: [
        { action: 'ver',    title: '👀 Ver oferta' },
        { action: 'cerrar', title: 'Cerrar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'cerrar') return;
  const urlDestino = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
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

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    all.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGE' }));
  })());
});
