// ═══════════════════════════════════════════════════════
//  TiendaMax — Service Worker v3
//  - Cache-first para shell estático
//  - Network-first para datos (JSON, APIs)
//  - Auto-actualización sin quedarse con versión vieja
//  - Soporte de Notificaciones Push
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-v5';
const STATIC_ASSETS = [
    '/index.html',
    '/css/styles.css',
    '/css/animations.css',
    '/js/script.js',
    '/js/subcategorias.js',
    '/js/revolico_integration.js',
    '/js/push-notifications.js',
    '/og-image.svg',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// ── Instalar: cachear todos los archivos del shell ──
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activar: borrar caches viejas y tomar control ──
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Mensajes ──
self.addEventListener('message', e => {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Estrategia de fetch ──
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    const externos = [
        'anthropic.com', 'github.com', 'raw.githubusercontent.com',
        'whatsapp.com', 'wa.me', 'unsplash.com', 'fonts.googleapis.com',
        'fonts.gstatic.com', 'api.revolico', 'cloudflare'
    ];
    if (externos.some(d => url.hostname.includes(d))) return;

    if (e.request.method !== 'GET') return;

    const path = url.pathname;

    // JSON de datos → siempre red
    if (path.endsWith('.json')) {
        e.respondWith(
            fetch(e.request)
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Shell estático → Cache-first, actualiza en background
    if (STATIC_ASSETS.some(a => path.endsWith(a.split('/').pop()))) {
        e.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(e.request).then(cached => {
                    const networkFetch = fetch(e.request).then(res => {
                        if (res.ok) cache.put(e.request, res.clone());
                        return res;
                    }).catch(() => cached);
                    return cached || networkFetch;
                })
            )
        );
        return;
    }

    // Todo lo demás → Network-first con fallback
    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            })
            .catch(() =>
                caches.match(e.request)
                    .then(cached => cached || caches.match('/index.html'))
            )
    );
});

// ═══════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════

self.addEventListener('push', e => {
    let datos = {
        titulo: '📢 TiendaMax',
        cuerpo: 'Tienes una nueva notificación',
        url: '/',
        icono: '/icons/icon-192.png'
    };
    if (e.data) {
        try { datos = { ...datos, ...e.data.json() }; }
        catch { datos.cuerpo = e.data.text(); }
    }
    e.waitUntil(
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
