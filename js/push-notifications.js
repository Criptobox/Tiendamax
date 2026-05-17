// ============================================================
//  TiendaMax — Sistema de Notificaciones Push
//  Archivo: js/push-notifications.js
//  Cómo usar: agregar <script src="js/push-notifications.js"></script>
//  en index.html, DESPUÉS del script principal.
// ============================================================

// ⚠️ REEMPLAZA esta clave con tu VAPID public key (ver README_PUSH.md)
const VAPID_PUBLIC_KEY = '{
"sujeto": "mailto: <freebost6@gmail.com>",
"clave pública": "BFq0ThYZuIUq4MmbR488mYeiEbt9PC57x8czvfyzTsad_6AFwDXWCa_SO0Vz_8USdqKw-TCdsCmqKctpJ1lT24w",
"clave privada": "71SkftFqAJQoeblCZIMiUDWshQLMlYQ27l5nE3pikPM"
}';

// URL donde se guardan las suscripciones.
// Si usas solo GitHub Pages (sin backend), usa la opción localStorage.
// Si tienes el backend Flask corriendo, usa '/api/push/subscribe'
const MODO_SIN_BACKEND = true; // ← cambia a false si tienes Flask activo

// ─────────────────────────────────────────────
//  Convertir VAPID key al formato que pide el navegador
// ─────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// ─────────────────────────────────────────────
//  Guardar suscripción (localStorage o backend)
// ─────────────────────────────────────────────
async function guardarSuscripcion(subscription) {
  if (MODO_SIN_BACKEND) {
    // Modo sin backend: guardamos en localStorage del navegador del cliente.
    // Las notificaciones se dispararán desde el panel admin del mismo navegador.
    const subs = JSON.parse(localStorage.getItem('push_subscriptions') || '[]');
    const json = JSON.stringify(subscription);
    if (!subs.includes(json)) {
      subs.push(json);
      localStorage.setItem('push_subscriptions', JSON.stringify(subs));
    }
    console.log('[Push] Suscripción guardada localmente.');
  } else {
    // Modo con backend Flask
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    console.log('[Push] Suscripción enviada al servidor.');
  }
}

// ─────────────────────────────────────────────
//  Suscribir al usuario
// ─────────────────────────────────────────────
async function suscribirUsuario() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Este navegador no soporta notificaciones push.');
    return null;
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    console.warn('[Push] El usuario denegó las notificaciones.');
    return null;
  }

  try {
    const registro = await navigator.serviceWorker.ready;
    const subscription = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await guardarSuscripcion(subscription);
    return subscription;
  } catch (err) {
    console.error('[Push] Error al suscribirse:', err);
    return null;
  }
}

// ─────────────────────────────────────────────
//  Mostrar notificación local (sin servidor)
//  Ideal para ofertas relámpago desde el panel admin
// ─────────────────────────────────────────────
async function mostrarNotificacionLocal({ titulo, cuerpo, url = '/', icono = '/icons/icon-192.png', badge = '/icons/icon-192.png' }) {
  if (!('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'granted') return;

  const registro = await navigator.serviceWorker.ready;
  registro.showNotification(titulo, {
    body: cuerpo,
    icon: icono,
    badge: badge,
    data: { url },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'ver', title: '👀 Ver oferta' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  });
}

// ─────────────────────────────────────────────
//  Inyectar botón de suscripción en la página
// ─────────────────────────────────────────────
function inyectarBotonSuscripcion() {
  // Solo mostrar si no está ya suscrito
  if (localStorage.getItem('push_suscrito') === 'si') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  const banner = document.createElement('div');
  banner.id = 'push-banner';
  banner.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: #1a1a2e; border: 1px solid #C9A96E; color: #fff;
    padding: 14px 20px; border-radius: 12px; z-index: 9999;
    display: flex; align-items: center; gap: 12px; max-width: 340px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: sans-serif; font-size: 14px;
  `;
  banner.innerHTML = `
    <span style="font-size:22px">🔔</span>
    <div style="flex:1">
      <strong style="color:#C9A96E">¡Activa las alertas!</strong><br>
      <span style="font-size:12px;opacity:0.8">Recibe ofertas relámpago y nuevos productos</span>
    </div>
    <button id="btn-activar-push" style="
      background:#C9A96E; color:#000; border:none; border-radius:8px;
      padding:8px 14px; cursor:pointer; font-weight:bold; font-size:13px; white-space:nowrap;
    ">Activar</button>
    <button id="btn-cerrar-push" style="
      background:none; border:none; color:#aaa; cursor:pointer; font-size:18px; padding:0 4px;
    ">×</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('btn-activar-push').addEventListener('click', async () => {
    const sub = await suscribirUsuario();
    if (sub) {
      localStorage.setItem('push_suscrito', 'si');
      banner.remove();
      mostrarNotificacionLocal({
        titulo: '✅ ¡Listo! TiendaMax activado',
        cuerpo: 'Te avisaremos de ofertas y productos nuevos.',
        url: '/'
      });
    }
  });

  document.getElementById('btn-cerrar-push').addEventListener('click', () => {
    banner.remove();
    // Volver a preguntar en 3 días
    localStorage.setItem('push_pospuesto', Date.now() + 3 * 24 * 60 * 60 * 1000);
  });
}

// ─────────────────────────────────────────────
//  API pública para usar desde script.js (panel admin)
// ─────────────────────────────────────────────
window.TiendaMaxPush = {

  // Llamar al agregar un producto nuevo desde el panel admin
  notificarNuevoProducto(nombre, precio, urlProducto = '/') {
    mostrarNotificacionLocal({
      titulo: '🆕 Nuevo producto en TiendaMax',
      cuerpo: `${nombre} — $${precio}`,
      url: urlProducto
    });
  },

  // Llamar al hacer una rebaja desde el panel admin
  notificarRebaja(nombre, precioAntes, precioAhora, urlProducto = '/') {
    mostrarNotificacionLocal({
      titulo: '🏷️ ¡Rebaja en TiendaMax!',
      cuerpo: `${nombre}: $${precioAntes} → $${precioAhora}`,
      url: urlProducto
    });
  },

  // Oferta del día (programar para 8:00 AM automáticamente)
  programarOfertaDelDia(nombre, precio, hora = '08:00') {
    const [h, m] = hora.split(':').map(Number);
    const ahora = new Date();
    const objetivo = new Date();
    objetivo.setHours(h, m, 0, 0);
    if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);
    const ms = objetivo - ahora;
    console.log(`[Push] Oferta del día programada para ${hora} (en ${Math.round(ms/60000)} min)`);
    setTimeout(() => {
      mostrarNotificacionLocal({
        titulo: '☀️ Oferta del día — TiendaMax',
        cuerpo: `${nombre} — Solo hoy: $${precio}`,
        url: '/?oferta=dia'
      });
    }, ms);
  },

  // Oferta relámpago con cuenta regresiva
  ofertaRelampago(nombre, precio, minutosRestantes = 60) {
    mostrarNotificacionLocal({
      titulo: `⚡ ¡Oferta relámpago! ${minutosRestantes} min`,
      cuerpo: `${nombre} — $${precio} · ¡Date prisa!`,
      url: '/?oferta=relampago'
    });
  },

  // Suscribir manualmente (útil si quieres poner un botón propio)
  suscribir: suscribirUsuario,

  // Verificar si el usuario está suscrito
  estaSuscrito() {
    return localStorage.getItem('push_suscrito') === 'si';
  }
};

// ─────────────────────────────────────────────
//  Inicializar al cargar la página
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const pospuesto = localStorage.getItem('push_pospuesto');
  if (pospuesto && Date.now() < parseInt(pospuesto)) return;

  // Mostrar banner después de 4 segundos si el usuario no está suscrito
  setTimeout(inyectarBotonSuscripcion, 4000);
});
