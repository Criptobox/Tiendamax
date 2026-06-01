// ════════════════════════════════════════════════════════════════
//  TiendaMax — push-fix.js  v3  (suscripción 1 toque + respeta baja)
//  Hace que TANTO el cartel inicial ("Avísame") COMO la campana 🔔
//  registren al suscriptor de inmediato al dar "Permitir", sin pasos
//  extra. Espera de verdad: SDK -> SW -> getToken -> escritura /tokens.
//  Debe cargarse DESPUÉS de script.js.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";
  var SDK_APP = "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js";
  var SDK_MSG = "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js";
  var _onMsgSet = false;

  function cargarScript(src) {
    return new Promise(function (res, rej) {
      if ([].some.call(document.scripts, function (s) { return s.src === src; })) return res();
      var el = document.createElement("script");
      el.src = src; el.onload = res;
      el.onerror = function () { rej(new Error("No se pudo cargar " + src)); };
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

  // Núcleo: resuelve SOLO cuando el token se escribió (o lanza error).
  async function registrarTokenRobusto(cfgArg) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    // Respeta la baja: si el usuario se desuscribió, NO re-registrar al cargar.
    // (La campana 🔔 borra este flag antes de reactivar, así que ahí sí procede.)
    if (localStorage.getItem("tm_push_desuscrito") === "1") return false;

    var cfg = await obtenerConfig(cfgArg);
    if (!cfg || !cfg.projectId) throw new Error("Sin configuración de Firebase");
    var vapid = cfg.vapidKey || localStorage.getItem("firebaseVapidKey");
    if (!vapid) throw new Error("Falta la clave VAPID");

    await cargarScript(SDK_APP);
    await cargarScript(SDK_MSG);
    if (!window.firebase) throw new Error("SDK de Firebase no disponible");
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    if (firebase.messaging && firebase.messaging.isSupported && !firebase.messaging.isSupported())
      throw new Error("Este navegador no soporta FCM");
    var messaging = firebase.messaging();

    var reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/firebase-cloud-messaging-push-scope" });
    await navigator.serviceWorker.ready;
    try { messaging.useServiceWorker && messaging.useServiceWorker(reg); } catch (e) {}

    // Notificaciones en primer plano (toast), una sola vez
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

    var token = await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
    if (!token) throw new Error("No se obtuvo token (revisa permiso/VAPID)");

    var dbURL = cfg.databaseURL || ("https://" + cfg.projectId + "-default-rtdb.firebaseio.com");
    var id = btoa(token).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    var resp = await fetch(dbURL + "/tokens/" + id + ".json", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, timestamp: Date.now(), userAgent: navigator.userAgent })
    });
    if (!resp.ok) {
      var t = ""; try { t = await resp.text(); } catch (e) {}
      throw new Error("La base rechazó el alta (HTTP " + resp.status + "). " + (t || ""));
    }

    localStorage.setItem("fcmToken", token);
    try { localStorage.removeItem("tm_push_desuscrito"); } catch (e) {}
    if (typeof window.tmRegistrarSuscriptor === "function") { try { window.tmRegistrarSuscriptor(); } catch (e) {} }
    console.log("[push-fix v3] ✅ Suscriptor registrado.");
    return true;
  }

  // Sobrescribe AMBAS rutas: la campana y el cartel inicial.
  window.tmRegistrarTokenFCMSiPermitido = function () { return registrarTokenRobusto(); };
  window.inicializarFirebaseFCMClient   = function (cfg) { return registrarTokenRobusto(cfg); };

  // Recuperación automática: dispositivo con permiso ya dado pero sin token guardado.
  function autoRecuperar() {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (localStorage.getItem("tm_push_desuscrito") === "1") return;
      if (localStorage.getItem("fcmToken")) return;
      setTimeout(function () {
        registrarTokenRobusto().catch(function (e) { console.warn("[push-fix v3] auto-recuperación:", e.message); });
      }, 3000);
    } catch (e) {}
  }
  if (document.readyState === "complete" || document.readyState === "interactive") autoRecuperar();
  else window.addEventListener("DOMContentLoaded", autoRecuperar);
})();
