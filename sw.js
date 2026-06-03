// ═══════════════════════════════════════════════════════
// TiendaMax — Service Worker Unificado v117
// v117: UNIFICACIÓN — absorbe la lógica de firebase-messaging-sw.js
//        para eliminar el conflicto de dos SWs manejando push.
//        Ahora un solo SW gestiona caché + Firebase Messaging.
// v116: badge solido + footer movil naranja
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tiendamax-v117';

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

// ── IndexedDB helper (migrado desde firebase-messaging-sw.js v5) ──
const IDB_NAME = 'tm_push_prefs';
const IDB_STORE = 'prefs';
const IDB_VERSION = 1;

function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        });
    } catch(e) { return undefined; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const req = tx.objectStore(IDB_STORE).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = e => reject(e.target.error);
        });
    } catch(e) {}
}

// ── Firebase config — se carga dinámicamente desde config.json ──
let _firebaseInitialized = false;

async function initFirebaseInSW() {
    if (_firebaseInitialized) return;
    try {
        // Cargar config.json desde caché o red
        const res = await fetch('/config.json');
        if (!res.ok) return;
        const cfg = await res.json();
        if (!cfg.firebaseConfig || !cfg.firebaseConfig.projectId) return;

        // Importar Firebase SDK (ya están cacheados o se cargan desde red)
        importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
        importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

        if (!firebase.apps.length) {
            firebase.initializeApp(cfg.firebaseConfig);
        }
        _firebaseInitialized = true;
        console.log('[SW v117] Firebase Messaging inicializado');
    } catch(e) {
        console.warn('[SW v117] No se pudo inicializar Firebase:', e.message);
    }
}

// ── Mensajes desde el cliente (migrado desde firebase-messaging-sw.js) ──
self.addEventListener('message', (event) => {
    if (!event.data) return;

    // SKIP_WAITING del index
    if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
        self.skipWaiting();
    }

    if (event.data.type === 'TM_SET_DESUSCRITO') {
        idbSet('tm_push_desuscrito', '1').then(() => {
            console.log('[SW v117] Flag desuscrito guardado en IndexedDB');
        });
    }

    if (event.data.type === 'TM_CLEAR_DESUSCRITO') {
        idbSet('tm_push_desuscrito', '0').then(() => {
            console.log('[SW v117] Flag desuscrito borrado de IndexedDB');
        });
    }
});

// ── Helper: construir y mostrar notificación ──
function mostrarNotificacionTM(payload) {
    console.log('[SW v117] Payload recibido:', payload);

    const notif = payload.notification || {};
    const data = payload.data || {};

    const titulo = notif.title || data.title || '📢 TiendaMax';
    const cuerpo = notif.body || data.body || 'Tienes una nueva notificación';
    const url = data.url || notif.click_action || '/';

    let imagen = notif.image || data.image || null;
    if (imagen && (imagen === '' || imagen === 'null' || imagen === 'undefined')) {
        imagen = null;
    }

    const icono = notif.icon || data.icon || '/iconos/icon-192.png';
    const tag = data.tag || 'tiendamax';

    const opciones = {
        body: cuerpo,
        icon: icono,
        badge: '/iconos/icon-192.png',
        data: { url: url, fechaRecibida: Date.now() },
        vibrate: [200, 100, 200],
        tag: tag,
        renotify: true,
        requireInteraction: false,
        actions: [
            { action: 'ver', title: '👀 Ver oferta' },
            { action: 'cerrar', title: 'Cerrar' }
        ]
    };

    if (imagen) {
        opciones.image = imagen;
    }

    return self.registration.showNotification(titulo, opciones);
}

// ═══════════════════════════════════════════════════════════
//  INSTALL — cachear assets estáticos
// ═══════════════════════════════════════════════════════════
self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(err => console.warn('Cache addAll failed:', err)))
    );
});

// ═══════════════════════════════════════════════════════════
//  ACTIVATE — limpiar cachés viejas + inicializar Firebase
// ═══════════════════════════════════════════════════════════
self.addEventListener('activate', e => {
    e.waitUntil(
        (async () => {
            // Limpiar cachés viejas
            const keys = await caches.keys();
            await Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
            await self.clients.claim();

            // Inicializar Firebase Messaging dentro del SW
            await initFirebaseInSW();

            // Registrar listener de background messages (solo una vez)
            if (_firebaseInitialized && firebase.messaging) {
                try {
                    const messaging = firebase.messaging();
                    messaging.onBackgroundMessage(async (payload) => {
                        const desuscrito = await idbGet('tm_push_desuscrito');
                        if (desuscrito === '1') {
                            console.log('[SW v117] Usuario desuscrito, notificación bloqueada.');
                            return;
                        }
                        return mostrarNotificacionTM(payload);
                    });
                    console.log('[SW v117] onBackgroundMessage registrado');
                } catch(e) {
                    console.warn('[SW v117] Error registrando onBackgroundMessage:', e);
                }
            }

            // Notificar a los clientes que el SW se ha actualizado
            const allClients = await self.clients.matchAll({ type: 'window' });
            for (const client of allClients) {
                client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
            }
        })()
    );
});

// ═══════════════════════════════════════════════════════════
//  FETCH — estrategia de caché
// ═══════════════════════════════════════════════════════════
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

    // Network-First para JSON
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

    // Network-First para HTML
    const esHTML = e.request.mode === 'navigate' ||
        path.endsWith('.html') || path === '/' ||
        (e.request.headers.get('accept') || '').includes('text/html');
    if (esHTML) {
        e.respondWith(
            fetch(e.request)
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

    // Cache-First para assets estáticos
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

// ═══════════════════════════════════════════════════════════
//  PUSH — manejador unificado (reemplaza los dos anteriores)
//  Solo un listener de push, que verifica desuscripción
//  y muestra la notificación.
// ═══════════════════════════════════════════════════════════
self.addEventListener('push', async (event) => {
    if (!event.data) return;

    // Verificar si el usuario se desuscribió manualmente
    const desuscrito = await idbGet('tm_push_desuscrito');
    if (desuscrito === '1') {
        console.log('[SW v117] Usuario desuscrito, push bloqueado.');
        return;
    }

    let payload = {};
    try {
        payload = event.data.json();
    } catch (e) {
        try {
            payload = { data: { body: event.data.text() } };
        } catch (e2) {
            console.warn('[SW v117] No se pudo parsear payload', e2);
            return;
        }
    }

    // Si Firebase ya va a manejar esta notificación vía onBackgroundMessage,
    // NO la mostramos duplicada. Solo la mostramos si:
    // - Tiene payload.data (FCM data message) → la mostramos nosotros
    // - Tiene payload.notification (FCM notification message) → Firebase la maneja
    //   (pero si Firebase no está inicializado, la mostramos como fallback)
    if (payload.notification && _firebaseInitialized) {
        // Firebase onBackgroundMessage se encargará
        return;
    }

    // Si es un data message o Firebase no está inicializado, la mostramos
    event.waitUntil(mostrarNotificacionTM(payload));
});

// ═══════════════════════════════════════════════════════════
//  NOTIFICATION CLICK — manejador unificado
// ═══════════════════════════════════════════════════════════
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'cerrar') return;

    const urlDestino = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
            // Intentar enfocar una ventana existente de TiendaMax
            for (const client of lista) {
                if (client.url.includes('tiendamax.org') && 'focus' in client) {
                    client.focus();
                    if ('navigate' in client) {
                        return client.navigate(urlDestino).catch(() => clients.openWindow(urlDestino));
                    }
                    return;
                }
            }
            // Si no hay ventana abierta, crear una nueva
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});

console.log('[SW v117] Service Worker Unificado cargado correctamente');
