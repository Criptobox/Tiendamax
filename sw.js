// ═══════════════════════════════════════════════════════
// TiendaMax — Service Worker
// Estrategias: Network-First para HTML/JSON/admin-JS (cambios inmediatos),
// Cache-First para assets estáticos versionados con ?v=hash.
// El CACHE_NAME lo bumpea CI (minify-js.yml / build-css.yml) en cada build.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-20260706025618';
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
  '/config.json'
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
        }).catch(() => caches.match('/offline.html'))
    );
});

// Manejo de Notificaciones Push
self.addEventListener('push', e => {
    let datos = {
        titulo: '📢 TiendaMax',
        cuerpo: 'Tienes una nueva notificación',
        url: '/',
        icono: '/iconos/icon-192.png'
    };

    if (e.data) {
        try {
            const jsonPayload = e.data.json();
            // Manejo de estructura FCM estándar
            if (jsonPayload.data) {
                datos.url = jsonPayload.data.url || datos.url;
                datos.titulo = jsonPayload.data.title || jsonPayload.data.titulo || datos.titulo;
                datos.cuerpo = jsonPayload.data.body || jsonPayload.data.cuerpo || datos.cuerpo;
                if (jsonPayload.data.image) datos.icono = jsonPayload.data.image;
            }
        } catch (err) {
            datos.cuerpo = e.data.text();
        }
    }

    e.waitUntil(
        self.registration.showNotification(datos.titulo, {
            body: datos.cuerpo,
            icon: '/iconos/icon-192.png',
            image: datos.icono !== '/iconos/icon-192.png' ? datos.icono : undefined,
            badge: '/iconos/icon-192.png',
            data: { url: datos.url },
            vibrate: [200, 100, 200],
            actions: [
                { action: 'ver', title: '👀 Ver ahora' },
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
        clients.matchAll({ type: 'window' }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url === urlDestino && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(urlDestino);
        })
    );
});
