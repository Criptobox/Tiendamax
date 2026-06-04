// ════════════════════════════════════════════════════════════════
//  TiendaMax — push-fix.js  v4
//  v4: separar getToken de escritura RTDB — si la red falla sólo
//      al escribir en Firebase, el token se guarda local y se reintenta
//      en background sin mostrar error al usuario. Mensajes en español.
//  v3: suscripción 1 toque + respeta baja.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";
  var SDK_APP = "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js";
  var SDK_MSG = "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js";
  var _onMsgSet = false;
  var LS_PENDING = "tm_push_token_pending";

  function cargarScript(src) {
    return new Promise(function (res, rej) {
      if ([].some.call(document.scripts, function (s) { return s.src === src; })) return res();
      var el = document.createElement("script");
      el.src = src; el.onload = res;
      el.onerror = function () { rej(new Error("No se pudo cargar el SDK de notificaciones.")); };
      document.head.appendChild(el);
    });
  }

  async function obtenerConfig(cfgArg) {
    if (cfgArg && cfgArg.projectId) return cfgArg;
    var cfg = null;
    try { var raw = localStorage.getItem("firebaseConfig"); if (raw) cfg = JSON.parse(raw); } catch (e) {}
    if (!cfg || !cfg.projectId) {
      try {
        var r = await fetch("config.json?_=" + Date.now(), { cache: "no-store" });
        if (r.ok) {
          var j = await r.json();
          cfg = j.firebaseConfig || null;
          if (cfg) {
            localStorage.setItem("firebaseConfig", JSON.stringify(cfg));
            if (cfg.vapidKey) localStorage.setItem("firebaseVapidKey", cfg.vapidKey);
          }
        }
      } catch (e) {}
    }
    return cfg;
  }

  // Escribe token en Firebase RTDB. Si falla por red, guarda en LS para reintento.
  async function escribirTokenRTDB(cfg, token) {
    var dbURL = cfg.databaseURL || ("https://" + cfg.projectId + "-default-rtdb.firebaseio.com");
    var id = btoa(token).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    var resp = await fetch(dbURL + "/tokens/" + id + ".json", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, timestamp: Date.now(), userAgent: navigator.userAgent })
    });
    if (!resp.ok) {
      var t = ""; try { t = await resp.text(); } catch (e) {}
      throw new Error("Firebase rechazó el token (HTTP " + resp.status + ")" + (t ? ": " + t : ""));
    }
    try { localStorage.removeItem(LS_PENDING); } catch (e) {}
    return true;
  }

  // Núcleo: obtiene token FCM y lo guarda. La escritura RTDB es tolerante a fallos de red.
  async function registrarTokenRobusto(cfgArg) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    if (localStorage.getItem("tm_push_desuscrito") === "1") return false;

    var cfg = await obtenerConfig(cfgArg);
    if (!cfg || !cfg.projectId) throw new Error("Sin configuración de Firebase. Contacta al administrador.");
    var vapid = cfg.vapidKey || localStorage.getItem("firebaseVapidKey");
    if (!vapid) throw new Error("Falta la clave VAPID. Configura Firebase en el panel admin.");

    try {
      await cargarScript(SDK_APP);
      await cargarScript(SDK_MSG);
    } catch (e) {
      throw new Error("Sin conexión. Verifica tu internet e inténtalo de nuevo.");
    }
    if (!window.firebase) throw new Error("SDK de Firebase no disponible");
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    if (firebase.messaging && firebase.messaging.isSupported && !firebase.messaging.isSupported())
      throw new Error("Este navegador no soporta notificaciones push");
    var messaging = firebase.messaging();

    var reg;
    try {
      reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/firebase-cloud-messaging-push-scope" });
      // Esperar que ESTE SW específico esté activo — navigator.serviceWorker.ready resuelve
      // con sw.js (scope "/") y puede retornar antes de que firebase-messaging-sw.js active.
      if (!reg.active) {
        await new Promise(function (resolve, reject) {
          var sw = reg.installing || reg.waiting;
          if (!sw) { resolve(); return; }
          var t = setTimeout(function () { reject(new Error("timeout activación SW")); }, 12000);
          sw.addEventListener("statechange", function onsc() {
            if (sw.state === "activated") { clearTimeout(t); sw.removeEventListener("statechange", onsc); resolve(); }
            else if (sw.state === "redundant") { clearTimeout(t); sw.removeEventListener("statechange", onsc); reject(new Error("SW redundante")); }
          });
        });
      }
    } catch (e) {
      throw new Error("Error al preparar el servicio de notificaciones: " + e.message);
    }
    try { messaging.useServiceWorker && messaging.useServiceWorker(reg); } catch (e) {}

    if (!_onMsgSet) {
      _onMsgSet = true;
      try {
        messaging.onMessage(function (p) {
          var n = (p && p.notification) || {}, d = (p && p.data) || {};
          if (typeof window.mostrarNotificacion === "function")
            window.mostrarNotificacion((n.title || d.title || "📢 TiendaMax") + ": " + (n.body || d.body || ""), "info");
        });
      } catch (e) {}
    }

    var token;
    try {
      token = await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
    } catch (e) {
      throw new Error("Sin conexión con el servidor de notificaciones. Verifica tu internet e inténtalo de nuevo.");
    }
    if (!token) throw new Error("No se obtuvo token. Revisa los permisos del navegador.");

    localStorage.setItem("fcmToken", token);
    try { localStorage.removeItem("tm_push_desuscrito"); } catch (e) {}
    if (typeof window.tmRegistrarSuscriptor === "function") { try { window.tmRegistrarSuscriptor(); } catch (e) {} }

    // Escribir en RTDB — si falla por red, el token ya está en FCM; se reintenta después.
    try {
      await escribirTokenRTDB(cfg, token);
    } catch (e) {
      // El token FCM está activo — recibirá notificaciones. Solo falló guardar en la base.
      try { localStorage.setItem(LS_PENDING, JSON.stringify({ token: token, cfg: cfg, ts: Date.now() })); } catch (e2) {}
      console.warn("[push-fix v4] Token FCM OK, RTDB pendiente:", e.message);
    }

    console.log("[push-fix v4] Suscriptor registrado.");
    return true;
  }

  // Reintento silencioso en background de tokens pendientes de escribir en RTDB.
  async function reintentarPendiente() {
    var raw = null;
    try { raw = localStorage.getItem(LS_PENDING); } catch (e) {}
    if (!raw) return;
    var pending;
    try { pending = JSON.parse(raw); } catch (e) { try { localStorage.removeItem(LS_PENDING); } catch (e2) {} return; }
    if (!pending.token || !pending.cfg || Date.now() - (pending.ts || 0) > 86400000) {
      try { localStorage.removeItem(LS_PENDING); } catch (e) {}
      return;
    }
    try {
      await escribirTokenRTDB(pending.cfg, pending.token);
      console.log("[push-fix v4] Token pendiente guardado en RTDB.");
    } catch (e) {
      console.warn("[push-fix v4] Reintento fallido:", e.message);
    }
  }

  function _notif(msg, tipo) {
    if (typeof window.mostrarNotificacion === "function") { try { window.mostrarNotificacion(msg, tipo); } catch(e) {} }
  }
  function _wrap(cfgArg) {
    return registrarTokenRobusto(cfgArg).then(function (ok) {
      if (ok) _notif("✅ Notificaciones activadas correctamente.", "success");
      return ok;
    }).catch(function (e) {
      console.error("[push-fix v4] Error:", e.message);
      _notif("⚠️ No se pudo activar las notificaciones. Intenta de nuevo.", "error");
      return false;
    });
  }

  // Sobrescribe AMBAS rutas: la campana y el cartel inicial.
  window.tmRegistrarTokenFCMSiPermitido = function () { return _wrap(); };
  window.inicializarFirebaseFCMClient   = function (cfg) { return _wrap(cfg); };

  // Al cargar: recuperar token si falta, y reintentar escritura RTDB si hay pendiente.
  function autoRecuperar() {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (localStorage.getItem("tm_push_desuscrito") === "1") return;
      setTimeout(function () { reintentarPendiente().catch(function () {}); }, 5000);
      if (localStorage.getItem("fcmToken")) return;
      setTimeout(function () {
        registrarTokenRobusto().catch(function (e) { console.warn("[push-fix v4] auto-recuperación:", e.message); });
      }, 3000);
    } catch (e) {}
  }
  if (document.readyState === "complete" || document.readyState === "interactive") autoRecuperar();
  else window.addEventListener("DOMContentLoaded", autoRecuperar);
})();
