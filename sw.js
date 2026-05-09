// TiendaMax Service Worker — Caché inteligente
const CACHE_NAME   = 'tiendamax-v1';
const CACHE_STATIC = 'tiendamax-static-v1';

// Archivos estáticos que nunca cambian (o cambian muy poco)
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/script.js',
];

// Instalar: precargar archivos estáticos
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_FILES)).catch(() => {})
    );
    self.skipWaiting();
});

// Activar: limpiar cachés viejas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys
                .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
                .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Fetch: estrategia por tipo de recurso
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Archivos JSON de datos (productos, categorias) → Network first, luego caché
    if (url.includes('productos.json') || url.includes('categorias.json') ||
        url.includes('subcategorias.json') || url.includes('raw.githubusercontent.com')) {
        event.respondWith(networkFirstJSON(event.request));
        return;
    }

    // Imágenes de productos en GitHub raw → Cache first (raramente cambian)
    if (url.includes('raw.githubusercontent.com') && url.includes('/imagenes/')) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // Archivos estáticos (CSS, JS, HTML) → Cache first con actualización en background
    if (url.includes('/css/') || url.includes('/js/') || url.endsWith('.html')) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    // Todo lo demás → red normal
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Network first: intenta red, si falla usa caché
async function networkFirstJSON(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await caches.match(request);
        return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }
}

// Cache first: sirve desde caché, si no existe va a red
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('', { status: 404 });
    }
}

// Stale while revalidate: sirve caché inmediato, actualiza en background
async function staleWhileRevalidate(request) {
    const cache  = await caches.open(CACHE_STATIC);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => cached);
    return cached || fetchPromise;
}
