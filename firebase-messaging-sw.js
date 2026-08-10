// ════════════════════════════════════════════════════════════════
//  TiendaMax — Firebase Messaging Service Worker v7
//  v7: los avisos ya mostrados caducan. Un push de la web se queda en la
//      bandeja del teléfono hasta que alguien lo aparta, con el texto
//      congelado: "4 productos rebajados" seguía puesto de noche con uno
//      agotado. Se cierran al abrir la tienda y a las 8 h.
//  v6: bump para refrescar SW junto con fix de suscriptores únicos.
//  v5: [FIX] bloquea re-registro automático de token cuando el
//      usuario se desuscribió manualmente (tm_push_desuscrito).
//      Usa IndexedDB para leer el flag (localStorage no disponible en SW).
// ════════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDlmR0_lwZSf7LcoVaz3FvFU3VvBDnCRcM",
  authDomain: "tiendamax-8feb5.firebaseapp.com",
  databaseURL: "https://tiendamax-8feb5-default-rtdb.firebaseio.com",
  projectId: "tiendamax-8feb5",
  storageBucket: "tiendamax-8feb5.firebasestorage.app",
  messagingSenderId: "238891228701",
  appId: "1:238891228701:web:d515133e229c48a5adb0f4"
});

const messaging = firebase.messaging();

// ── IndexedDB helper para leer/escribir el flag de desuscripción ──
const IDB_NAME    = 'tm_push_prefs';
const IDB_STORE   = 'prefs';
const IDB_VERSION = 1;

function abrirIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbGet(key) {
  try {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e) { return undefined; }
}

async function idbSet(key, value) {
  try {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e) {}
}

// ── Caducidad de los avisos ya mostrados ────────────────────────
// Un push de la web no se va solo: se queda en la pantalla del teléfono hasta
// que alguien lo aparta, con el texto congelado del momento en que se mandó.
// Un "🏷️ 4 productos rebajados" de la mañana seguía ahí por la noche, y para
// entonces uno de los cuatro ya estaba agotado.
//
// No hay forma de programar un cierre a futuro desde un service worker: no
// corre si nadie lo despierta. Así que se limpia en los dos momentos en que sí
// está despierto — cuando llega otro push, y cuando el cliente abre la tienda
// (ahí el aviso ya cumplió: la persona está dentro).
const MAX_EDAD_MS = 8 * 60 * 60 * 1000;

// Los avisos del dueño (admin-*) no se tocan: son recordatorios de trabajo, no
// ofertas, y no caducan porque él abra la tienda.
function esDeLaTienda(n) {
  return !String((n && n.tag) || '').startsWith('admin');
}

async function cerrarAvisosViejos(edadMs = MAX_EDAD_MS) {
  try {
    const abiertas = await self.registration.getNotifications();
    const limite = Date.now() - edadMs;
    for (const n of abiertas) {
      const recibida = (n.data && n.data.fechaRecibida) || 0;
      if (esDeLaTienda(n) && recibida && recibida < limite) n.close();
    }
  } catch (e) {}
}

async function cerrarAvisosDeLaTienda() {
  try {
    const abiertas = await self.registration.getNotifications();
    for (const n of abiertas) if (esDeLaTienda(n)) n.close();
  } catch (e) {}
}

// ── Recibir mensajes de script.js para sincronizar el flag ──
self.addEventListener('message', (event) => {
  if (!event.data) return;

  // La tienda quedó abierta delante del cliente: el aviso ya no pinta nada.
  if (event.data.type === 'TM_TIENDA_ABIERTA') {
    event.waitUntil(cerrarAvisosDeLaTienda());
  }

  if (event.data.type === 'TM_SET_DESUSCRITO') {
    // El usuario desactivó las notificaciones
    idbSet('tm_push_desuscrito', '1').then(() => {
      console.log('[SW v6] Flag desuscrito guardado en IndexedDB');
    });
  }

  if (event.data.type === 'TM_CLEAR_DESUSCRITO') {
    // El usuario activó las notificaciones
    idbSet('tm_push_desuscrito', '0').then(() => {
      console.log('[SW v6] Flag desuscrito borrado de IndexedDB');
    });
  }
});

// ── Función auxiliar para construir y mostrar notificación ──
async function mostrarNotificacionTM(payload) {
  console.log('[firebase-messaging-sw v6] Payload recibido:', payload);

  const notif = payload.notification || {};
  const data  = payload.data || {};

  const titulo = notif.title  || data.title  || '📢 TiendaMax';
  const cuerpo = notif.body   || data.body   || 'Tienes una nueva notificación';
  const url    = data.url     || notif.click_action || '/';

  let imagen = notif.image || data.image || null;
  if (imagen && (imagen === '' || imagen === 'null' || imagen === 'undefined')) {
    imagen = null;
  }

  const icono = notif.icon || data.icon || '/iconos/icon-192.png';
  const tag   = data.tag || 'tiendamax';

  const opciones = {
    body:    cuerpo,
    icon:    icono,
    badge:   '/iconos/icon-192.png',
    data:    { url: url, fechaRecibida: Date.now() },
    vibrate: [200, 100, 200],
    tag:     tag,
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'ver',    title: '👀 Ver oferta' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  };

  if (imagen) {
    opciones.image = imagen;
  }

  // Aprovechar que el worker está despierto para barrer lo caducado. El `tag`
  // ya reemplaza el aviso anterior del mismo tipo, pero no toca los de otros.
  await cerrarAvisosViejos();
  return self.registration.showNotification(titulo, opciones);
}

// 1. Mensajes recibidos en BACKGROUND
messaging.onBackgroundMessage(async (payload) => {
  // [FIX] No mostrar notificación si el usuario se desuscribió manualmente
  const desuscrito = await idbGet('tm_push_desuscrito');
  if (desuscrito === '1') {
    console.log('[SW v6] Usuario desuscrito, notificación bloqueada.');
    return;
  }
  return mostrarNotificacionTM(payload);
});

// 2. Listener directo de 'push' como fallback
self.addEventListener('push', async (event) => {
  if (!event.data) return;

  // [FIX] Bloquear si está desuscrito
  const desuscrito = await idbGet('tm_push_desuscrito');
  if (desuscrito === '1') {
    console.log('[SW v6] Usuario desuscrito, push bloqueado.');
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    try {
      payload = { data: { body: event.data.text() } };
    } catch (e2) {
      console.warn('[SW push] no pude parsear payload', e2);
      return;
    }
  }
  if (payload.notification) return; // Firebase ya manejará vía onBackgroundMessage
  event.waitUntil(mostrarNotificacionTM(payload));
});

// 3. Click en la notificación → navegar al producto
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'cerrar') return;

  const urlDestino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const client of lista) {
        if (client.url.includes('tiendamax.org') && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(urlDestino).catch(() => clients.openWindow(urlDestino));
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlDestino);
      }
    })
  );
});

console.log('[firebase-messaging-sw v6] Cargado correctamente');
