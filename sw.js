// ═══════════════════════════════════════════════════════
// TiendaMax — Service Worker v121
// v121: cards "Vistos recientemente" más pequeñas — 3 columnas en móvil, imagen 4:3.
// v120: bundle.css v2 — mejoras homepage: espaciado, grid centrado, Próximamente dimmed.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-v121';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/animations.css',
  '/css/styles.banner.fix.css',
  '/css/styles.fixes.css',
  '/css/premium-theme.css',
  '/css/light-mode.css',
  '/css/admin.css',
  '/js/script.js',
  '/js/seo-dynamico.js',
  '/js/share-patch.js',
  '/js/push-fix.js',
  '/js/banners.js',
  '/js/subcategorias.js',
  '/js/revolico_integration.js',
  '/js/biometric-auth.js',
  '/js/event-delegation.js',
  '/js/tienda-plus.js',
  '/css/tienda-plus.css',
  '/css/hero-efectos.css',
  '/js/hero-efectos.js',
  '/og-image.png',
  '/manifest.json',
  '/iconos/icon-192.png',
  '/iconos/icon-512.png'
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
            // Notificar a los clientes que el SW se ha actualizado
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

    const _fetchWithTimeout = (req, ms) => Promise.race([
        fetch(req),
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
                .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
        );
        return;
    }

    // Upgrade transparente a WebP para imágenes de producto
    // Solo si el browser acepta WebP (header Accept lo indica) y la URL es de /imagenes/
    const esImagenProducto = /\/imagenes\/.+\.(jpe?g|png)$/i.test(path);
    const aceptaWebP = (e.request.headers.get('accept') || '').includes('image/webp');
    if (esImagenProducto && aceptaWebP) {
        const webpUrl = e.request.url.replace(/\.(jpe?g|png)(\?.*)?$/i, '.webp');
        const webpReq = new Request(webpUrl, { headers: e.request.headers });
        e.respondWith(
            caches.match(webpReq).then(cached => {
                if (cached) return cached;
                return fetch(webpReq).then(res => {
                    if (res.ok) {
                        // WebP existe: cachear y servir
                        caches.open(CACHE_NAME).then(c => c.put(webpReq, res.clone())).catch(() => {});
                        return res;
                    }
                    // WebP aún no generado: fallback al original
                    return fetch(e.request).then(origRes => {
                        if (origRes.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, origRes.clone())).catch(() => {});
                        return origRes;
                    });
                }).catch(() =>
                    caches.match(e.request).then(c => c || fetch(e.request))
                );
            })
        );
        return;
    }

    // Estrategia Cache-First para Assets estáticos (JS, CSS, imágenes, iconos)
    e.respondWith(
        caches.match(e.request).then(cached => {
            return cached || fetch(e.request).then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
                }
                return res;
            });
        }).catch(() => caches.match('/index.html'))
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
                datos.url = jsonPayload.data.url || jsonPayload.data.click_action || datos.url;
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
