// ═══════════════════════════════════════════════════════
// TiendaMax — Service Worker v159
// v155: estilos hero inline — independientes del bundle, botones iguales garantizados.
// v154: hero centrado completo + botones iguales + bundle incluido.
// v150: borde dorado + acento naranja en tarjetas Más Vendidos (móvil).
// v147: push-fix.js — espera activación real de firebase-messaging-sw.js antes de getToken().
// v146: eliminar click_action obsoleto (deprecado por FCM desde 2020).
// v145: búsquedas a Firebase, ventas read-off, timezone Cuba fix.
// v144: banners flotantes secuenciales — notificaciones primero, install después.
// v143: eliminar canvas de líneas animadas del hero (parpadeo en móvil).
// v142: lazy load fade-in, búsquedas en analytics, preview admin.
// v141: bounce carrito, toast con foto, pull-to-refresh, badge rebajado.
// v140: zoom 2.2× en imagen de detalle + badge verde animado "✨ Nuevo".
// v139: separador visual "Sin stock" entre disponibles y agotados en el grid.
// v138: chip-slider animado en filtro de categorías — píldora naranja deslizante.
// v137: carrito vacío animado — ícono flotante + puntos dorados.
// v136: imágenes de producto con proporción 4:3 uniforme (era 1:1).
// v135: skeleton loading en productosGrid y masVendidosGrid mientras carga data.
// v134: fix crítico precios/fotos mezclados — post-processor usa dataset.productId en lugar de índice.
// v133: alineación tarjetas producto — stock-count sin salto de línea.
// v132: fix banner notificaciones — mismo flujo que modal campana.
// v131: Firebase version signal para forzar actualización en todos los clientes.
// v130: PWA install más robusto (delay 1.5s, botón en menú, dismiss 2 días).
// v129: fix definitivo opacidad categorías vacías (clase proximamente + !important).
// v128: agotados al final en Gestionar.
// v127: categorías con 0 productos opacas, botón →0 en tarjetas Gestionar.
// v126: fix fotos en modal editar (reset inputs, botón eliminar por foto), tarjetas Gestionar optimizadas.
// v125: fondo coloreado en KPIs de Analytics (gradiente sólido como panel de Ventas).
// v124: colores en KPIs de Analytics, mejoras visuales en Ventas y Analytics.
// v66: corrige assets cacheados inexistentes y fuerza actualización de caché.
// v65: fuerza actualización de caché para el nuevo estilo naranja del botón
//      "Avísame cuando vuelva" en productos agotados.
// v64: fuerza actualización de caché para cargar los arreglos de tarjetas
//      móviles, barra de moneda y offset del header.
// v62: las 3 funciones que mandan pedidos por WhatsApp
//      (comprarCarrito, tmComprar, contactarProducto) ahora
//      usan el mismo helper _mensajeOrdenWA con formato premium.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-v166';

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
  '/js/analytics.js',
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
