// ════════════════════════════════════════════════════════════════
//  TiendaMax — Firebase Messaging Service Worker v6
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

// ── Recibir mensajes de script.js para sincronizar el flag ──
self.addEventListener('message', (event) => {
  if (!event.data) return;

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
function mostrarNotificacionTM(payload) {
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
