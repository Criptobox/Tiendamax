// ═══════════════════════════════════════════════════════
//  TiendaMax — Service Worker v2
//  - Cache-first para shell estático
//  - Network-first para datos (JSON, APIs)
//  - Auto-actualización sin quedarse con versión vieja
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-v2';
const STATIC_ASSETS = [
    '/index.html',
    '/css/styles.css',
    '/css/animations.css',
    '/js/script.js',
    '/js/subcategorias.js',
    '/js/revolico_integration.js',
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
            .then(() => self.skipWaiting()) // Activar de inmediato sin esperar
    );
});

// ── Activar: borrar caches viejas y tomar control de todos los clientes ──
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim()) // Controlar pestañas abiertas de inmediato
    );
});

// ── Notificar a todos los clientes cuando hay una actualización lista ──
self.addEventListener('message', e => {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Estrategia de fetch ──
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Nunca interceptar estas peticiones externas
    const externos = [
        'anthropic.com', 'github.com', 'raw.githubusercontent.com',
        'whatsapp.com', 'wa.me', 'unsplash.com', 'fonts.googleapis.com',
        'fonts.gstatic.com', 'api.revolico', 'cloudflare'
    ];
    if (externos.some(d => url.hostname.includes(d))) return;

    // Solo GET
    if (e.request.method !== 'GET') return;

    const path = url.pathname;

    // JSON de datos → siempre red (ya tienen cache-buster ?_=timestamp)
    if (path.endsWith('.json')) {
        e.respondWith(
            fetch(e.request)
                .catch(() => caches.match(e.request)) // offline: servir último JSON conocido
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
                    // Devolver cache inmediato, actualizar en background
                    return cached || networkFetch;
                })
            )
        );
        return;
    }

    // Todo lo demás → Network-first con fallback a cache y luego a index.html
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
