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

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Mensaje recibido:', payload);
  const notif    = payload.notification || {};
  const data     = payload.data || {};
  const titulo   = notif.title || data.title || '📢 TiendaMax';
  const cuerpo   = notif.body  || data.body  || 'Tienes una nueva notificación';
  const url      = data.url    || notif.click_action || '/';
  const imagen   = notif.image || data.image;
  const icono    = notif.icon  || '/icons/icon-192.png';

  self.registration.showNotification(titulo, {
    body:   cuerpo,
    icon:   icono,
    badge:  '/icons/icon-192.png',
    image:  imagen,
    data:   { url: url },
    vibrate: [200, 100, 200],
    tag:     data.tag || 'tiendamax',
    renotify: true,
    actions: [
      { action: 'ver',    title: '👀 Ver' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'cerrar') return;
  const urlDestino = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const client of lista) {
        if (client.url.includes('tiendamax.org') && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(urlDestino);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(urlDestino);
    })
  );
});
