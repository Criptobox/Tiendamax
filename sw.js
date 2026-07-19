// ═══════════════════════════════════════════════════════
// TiendaMax — Service Worker
// Estrategias: Network-First para HTML/JSON/admin-JS (cambios inmediatos),
// Cache-First para assets estáticos versionados con ?v=hash.
// El CACHE_NAME lo bumpea CI (minify-js.yml / build-css.yml) en cada build.
// ═══════════════════════════════════════════════════════

// Cambiar esta versión fuerza la descarga de index/CSS/JS nuevos en instalaciones PWA.
const CACHE_NAME = 'tiendamax-202607191858';
// Solo recursos de la TIENDA que se piden SIN ?v=. Los del admin se cargan
// bajo demanda. Los .js/.css referenciados con ?v=hash NO se precachean:
// el cache-first matchea por URL exacta (query incluida), así que un precache
// sin ?v= jamás acierta — solo duplicaba la descarga en cada install. Esos
// assets se cachean on-demand con su versión exacta en la primera visita.
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/iconos/icon-192.png',
  '/iconos/icon-512.png',
  '/productos-lite.json',
  '/categorias.json',
  '/config.json',
  '/css/fonts.css',
  '/fonts/dmsans-normal-latin.woff2',
  '/fonts/dmsans-italic-latin.woff2'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(err => console.warn('Cache addAll failed:', err)))
    );
});

// Escuchar la orden del index para activar el SW nuevo de inmediato
self.addEventListener('message', e => {
    if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
        self.skipWaiting();
    }
});

self.addEventListener('activate', e => {
    e.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
            await self.clients.claim();
            // Avisar a las páginas abiertas para que muestren opción de recargar,
            // sin forzar navigate() que vacía el caché y congela el splash en conexión lenta
            const allClients = await self.clients.matchAll({ type: 'window' });
            for (const client of allClients) {
                client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
            }
        })()
    );
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

    // no-store: los caminos network-first (HTML, JSON, admin JS) deben saltarse
    // también el caché HTTP del navegador; si no, GitHub Pages puede servir HTML
    // viejo hasta ~10 min y los cambios no se ven al instante.
    const _fetchWithTimeout = (req, ms) => Promise.race([
        fetch(req, { cache: 'no-store' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);

    // Estrategia Network-First para JSON (precios y productos siempre frescos)
    if (path.endsWith('.json')) {
        e.respondWith(
            _fetchWithTimeout(e.request, 5000)
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

    // Estrategia Network-First para HTML (index y páginas siempre frescos,
    // así los cambios se ven al instante sin depender del caché del SW)
    const esHTML = e.request.mode === 'navigate' ||
                   path.endsWith('.html') || path === '/' ||
                   (e.request.headers.get('accept') || '').includes('text/html');
    if (esHTML) {
        e.respondWith(
            _fetchWithTimeout(e.request, 5000)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(e.request).then(c => c || caches.match('/offline.html')))
        );
        return;
    }

    // Admin JS — Network-First para que los cambios se vean de inmediato
    const esAdminJS = path.startsWith('/js/admin-') || path.startsWith('/js/admin_');
    if (esAdminJS) {
        e.respondWith(
            _fetchWithTimeout(e.request, 6000)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(e.request, { ignoreSearch: true }).then(c => c || fetch(e.request)))
        );
        return;
    }

    // Estrategia Cache-First para Assets estáticos (JS, CSS, imágenes, iconos)
    // Sin ignoreSearch → ?v=hash diferente = cache miss = descarga la versión nueva
    e.respondWith(
        caches.match(e.request).then(cached => {
            return cached || fetch(e.request).then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
                }
                return res;
            });
        })
    );
});

// Manejo de Notificaciones Push
self.addEventListener('push', function(e) {
    let data = {};
    try { if (e.data) data = e.data.json(); } catch(err) { data = {}; }

    // Support both flat format {title, body, url, image} and FCM nested format {data: {title, body, url, image}}
    let title, body, url, image;
    if (data.data) {
        // FCM nested format
        title = data.data.title || data.data.titulo || '🔥 TiendaMax — Nueva oferta';
        body  = data.data.body  || data.data.cuerpo || '¡Hay una nueva oferta disponible!';
        url   = data.data.url   || '/';
        image = data.data.image || '';
    } else {
        // Flat format (direct push from server)
        title = data.title  || data.titulo  || '🔥 TiendaMax — Nueva oferta';
        body  = data.body   || data.cuerpo  || '¡Hay una nueva oferta disponible!';
        url   = data.url    || '/';
        image = data.image  || '';
    }

    const options = {
        body: body,
        icon: '/iconos/icon-192.png',
        badge: '/iconos/icon-192.png',
        image: image || undefined,
        vibrate: [100, 50, 100],
        data: { url: url },
        actions: [
            { action: 'open', title: 'Ver oferta' },
            { action: 'dismiss', title: 'Cerrar' }
        ]
    };
    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    if (e.action === 'dismiss' || e.action === 'cerrar') return;
    const url = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/';
    e.waitUntil(
        (async () => {
            const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            // Navigate existing window to the URL, or open new one
            if (clientsList.length > 0) {
                const client = clientsList[0];
                if (client.url !== url) {
                    try { await client.navigate(url); } catch(e) {}
                }
                return client.focus();
            }
            return clients.openWindow(url);
        })()
    );
});
