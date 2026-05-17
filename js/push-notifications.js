// ============================================================
//  TiendaMax — Sistema de Notificaciones Push
//  js/push-notifications.js
//  SIN VAPID — funciona 100% con el service worker existente
// ============================================================

const PUSH_KEY = 'tm_push_ok';

// ── Mostrar notificación desde el service worker ─────────────
async function tmNotificar({ titulo, cuerpo, url = '/', icono = '/icons/icon-192.png' }) {
  if (!('serviceWorker' in navigator)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(titulo, {
      body: cuerpo,
      icon: icono,
      badge: icono,
      data: { url },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: [
        { action: 'ver', title: '👀 Ver oferta' },
        { action: 'cerrar', title: 'Cerrar' }
      ]
    });
    return true;
  } catch (e) {
    console.warn('[Push] Error al mostrar notificación:', e);
    return false;
  }
}

// ── Pedir permiso al usuario ──────────────────────────────────
async function tmPedirPermiso() {
  if (!('Notification' in window)) return 'no-support';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const r = await Notification.requestPermission();
  return r;
}

// ── Inyectar banner flotante de suscripción ───────────────────
function tmMostrarBanner() {
  if (localStorage.getItem(PUSH_KEY)) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;

  const pospuesto = parseInt(localStorage.getItem('tm_push_pospuesto') || '0');
  if (Date.now() < pospuesto) return;

  const b = document.createElement('div');
  b.id = 'tm-push-banner';
  b.innerHTML = `
    <div style="
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:#1a1a1a;border:1.5px solid #C9A96E;border-radius:14px;
      padding:14px 18px;display:flex;align-items:center;gap:12px;
      max-width:320px;width:90%;z-index:99999;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:sans-serif;
    ">
      <span style="font-size:26px;flex-shrink:0">🔔</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;color:#C9A96E;margin-bottom:2px">¡Activa las alertas!</div>
        <div style="font-size:12px;color:#aaa;line-height:1.3">Recibe ofertas relámpago y productos nuevos</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button id="tm-push-si" style="
          background:#C9A96E;color:#000;border:none;border-radius:8px;
          padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap
        ">Activar</button>
        <button id="tm-push-no" style="
          background:none;border:none;color:#666;font-size:11px;cursor:pointer;text-align:center
        ">Ahora no</button>
      </div>
    </div>
  `;
  document.body.appendChild(b);

  document.getElementById('tm-push-si').onclick = async () => {
    const r = await tmPedirPermiso();
    b.remove();
    if (r === 'granted') {
      localStorage.setItem(PUSH_KEY, '1');
      tmNotificar({
        titulo: '✅ TiendaMax activado',
        cuerpo: 'Te avisaremos de ofertas y productos nuevos.',
        url: '/'
      });
    }
  };

  document.getElementById('tm-push-no').onclick = () => {
    b.remove();
    localStorage.setItem('tm_push_pospuesto', Date.now() + 2 * 24 * 60 * 60 * 1000);
  };
}

// ── API pública: window.TiendaMaxPush ─────────────────────────
window.TiendaMaxPush = {

  nuevoProducto(nombre, precio) {
    tmNotificar({
      titulo: '🆕 Nuevo en TiendaMax',
      cuerpo: `${nombre}  —  $${precio} USD`,
      url: '/'
    });
  },

  rebaja(nombre, precioAntes, precioAhora) {
    tmNotificar({
      titulo: '🏷️ ¡Rebaja en TiendaMax!',
      cuerpo: `${nombre}: $${precioAntes} → $${precioAhora} USD`,
      url: '/'
    });
  },

  relampago(nombre, precio, minutos = 60) {
    tmNotificar({
      titulo: `⚡ ¡Oferta relámpago! Quedan ${minutos} min`,
      cuerpo: `${nombre}  —  $${precio} USD · ¡Date prisa!`,
      url: '/'
    });
  },

  ofertaDia(nombre, precio, programar = false) {
    if (!programar) {
      tmNotificar({
        titulo: '☀️ Oferta del día — TiendaMax',
        cuerpo: `${nombre}  —  Solo hoy: $${precio} USD`,
        url: '/'
      });
      return;
    }
    const ahora = new Date();
    const objetivo = new Date();
    objetivo.setHours(8, 0, 0, 0);
    if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);
    setTimeout(() => {
      tmNotificar({
        titulo: '☀️ Oferta del día — TiendaMax',
        cuerpo: `${nombre}  —  Solo hoy: $${precio} USD`,
        url: '/'
      });
    }, objetivo - ahora);
  },

  enviar(titulo, cuerpo, url = '/') {
    return tmNotificar({ titulo, cuerpo, url });
  },

  get activo() {
    return Notification.permission === 'granted';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(tmMostrarBanner, 5000);
});
