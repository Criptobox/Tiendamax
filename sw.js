// ===== TIENDAMAX SERVICE WORKER =====
// Caché inteligente por tipo de archivo para carga instantánea

const CACHE_VERSION = 'tiendamax-v1';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_IMAGES  = `${CACHE_VERSION}-images`;
const CACHE_DATA    = `${CACHE_VERSION}-data`;

// Archivos que se pre-cachean en la instalación
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/script.js',
    '/js/subcategorias.js',
    '/categorias.json',
    '/subcategorias.json',
];

// ── Instalación ──────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activación: limpiar cachés viejos ────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k.startsWith('tiendamax-') && !k.startsWith(CACHE_VERSION))
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: estrategia por tipo de recurso ───────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Solo manejar peticiones del mismo origen y GET
    if (request.method !== 'GET') return;
    if (!url.origin.includes(self.location.origin) && !url.hostname.includes('raw.githubusercontent.com')) return;

    // Ignorar el panel de administración en cache
    if (url.pathname.includes('/api/') || url.pathname.includes('backend')) return;

    // Imágenes → Cache-first con fallback de red
    if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        event.respondWith(imageStrategy(request));
        return;
    }

    // productos.json → Network-first (siempre fresco), con fallback a caché
    if (url.pathname.endsWith('productos.json')) {
        event.respondWith(networkFirstData(request));
        return;
    }

    // CSS, JS, HTML, JSON estático → Stale-while-revalidate
    if (
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.destination === 'document' ||
        url.pathname.endsWith('.json')
    ) {
        event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
        return;
    }
});

// ── Estrategias ──────────────────────────────────────────────

async function imageStrategy(request) {
    const cache = await caches.open(CACHE_IMAGES);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        return new Response('', { status: 408 });
    }
}

async function networkFirstData(request) {
    const cache = await caches.open(CACHE_DATA);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await cache.match(request);
        return cached || new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => null);
    return cached || await fetchPromise;
}
