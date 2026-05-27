// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  TiendaMax â€” Firebase Messaging Service Worker v3
//  Maneja las notificaciones push cuando la pestaÃ±a estÃ¡
//  cerrada o en background. Renderiza imagen del producto.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// FunciÃ³n auxiliar para construir y mostrar notificaciÃ³n
function mostrarNotificacionTM(payload) {
  console.log('[firebase-messaging-sw v3] Payload recibido:', payload);

  const notif = payload.notification || {};
  const data  = payload.data || {};

  const titulo = notif.title  || data.title  || 'ðŸ“¢ TiendaMax';
  const cuerpo = notif.body   || data.body   || 'Tienes una nueva notificaciÃ³n';
  const url    = data.url     || notif.click_action || '/';
  // Imagen del producto (importante para pushes de rebajas/productos nuevos)
  let imagen   = notif.image  || data.image || null;
  // Limpiar si viene vacÃ­o
  if (imagen && (imagen === '' || imagen === 'null' || imagen === 'undefined')) {
    imagen = null;
  }
  const icono  = notif.icon   || data.icon  || '/icons/icon-192.png';
  const tag    = data.tag     || 'tiendamax';

  const opciones = {
    body:    cuerpo,
    icon:    icono,
    badge:   '/icons/icon-192.png',
    data:    { url: url, fechaRecibida: Date.now() },
    vibrate: [200, 100, 200],
    tag:     tag,
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'ver',    title: 'ðŸ‘€ Ver oferta' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  };

  // AÃ±adir imagen solo si existe (la imagen grande del push)
  if (imagen) {
    opciones.image = imagen;
  }

  return self.registration.showNotification(titulo, opciones);
}

// 1. Mensajes recibidos en BACKGROUND (app cerrada o en otra pestaÃ±a)
messaging.onBackgroundMessage((payload) => {
  return mostrarNotificacionTM(payload);
});

// 2. Listener directo de 'push' como fallback
//    (algunos navegadores no llaman a onBackgroundMessage para data-only messages)
self.addEventListener('push', (event) => {
  if (!event.data) return;
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
  // Si la lib de firebase ya manejÃ³ esto, no duplicar
  // (firebase llama onBackgroundMessage para mensajes con "notification";
  //  para data-only message, tambiÃ©n, pero por si acaso usamos waitUntil)
  if (payload.notification) {
    // Firebase ya manejarÃ¡ vÃ­a onBackgroundMessage
    return;
  }
  event.waitUntil(mostrarNotificacionTM(payload));
});

// 3. Click en la notificaciÃ³n â†’ navegar al producto
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'cerrar') return;

  const urlDestino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      // Si ya hay una ventana abierta de TiendaMax, enfocarla y navegar
      for (const client of lista) {
        if (client.url.includes('tiendamax.org') && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(urlDestino).catch(() => clients.openWindow(urlDestino));
          }
          return;
        }
      }
      // Si no hay ninguna abierta, abrir nueva
      if (clients.openWindow) {
        return clients.openWindow(urlDestino);
      }
    })
  );
});

console.log('[firebase-messaging-sw v3] Cargado correctamente');

