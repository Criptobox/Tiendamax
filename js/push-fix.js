// ════════════════════════════════════════════════════════════════
//  TiendaMax — push-fix.js  v8
//  v8: carnet de identidad por dispositivo — persiste en localStorage,
//      IndexedDB y cookie de 1 año. Aunque el usuario borre datos del
//      navegador, desactive/active notificaciones, o el token FCM cambie,
//      siempre se usa la misma entrada en Firebase (mismo "carnet").
//      Al re-suscribirse limpia automáticamente entradas duplicadas viejas.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";
  var SDK_APP   = "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js";
  var SDK_MSG   = "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js";
  var _onMsgSet = false;
  var LS_PENDING = "tm_push_token_pending";
  var DID_LS    = "tm_did";            // clave en localStorage y cookie
  var DID_IDB   = "tm_device_prefs";  // nombre de la base IndexedDB

  // ── Carga de scripts ─────────────────────────────────────────
  function cargarScript(src) {
    return new Promise(function (res, rej) {
      if ([].some.call(document.scripts, function (s) { return s.src === src; })) return res();
      var el = document.createElement("script");
      el.src = src; el.onload = res;
      el.onerror = function () { rej(new Error("No se pudo cargar el SDK de notificaciones.")); };
      document.head.appendChild(el);
    });
  }

  // ── Configuración Firebase ───────────────────────────────────
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
            try { localStorage.setItem("firebaseConfig", JSON.stringify(cfg)); } catch(e) {}
            if (cfg.vapidKey) { try { localStorage.setItem("firebaseVapidKey", cfg.vapidKey); } catch(e) {} }
          }
        }
      } catch (e) {}
    }
    return cfg;
  }

  // ── Huella de dispositivo (fallback si todo el storage se borra) ──
  function deviceFingerprint() {
    var parts = [
      navigator.userAgent || '',
      (screen.width || 0) + 'x' + (screen.height || 0),
      navigator.language || '',
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') || ''
    ].join('|');
    var h = 0;
    for (var i = 0; i < parts.length; i++) { h = ((h << 5) - h + parts.charCodeAt(i)) | 0; }
    return 'fp_' + (h >>> 0).toString(36);
  }

  // ── IndexedDB helpers ────────────────────────────────────────
  function _idbOpen() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DID_IDB, 1);
        req.onupgradeneeded = function (e) { e.target.result.createObjectStore('prefs'); };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror   = function () { reject(); };
      } catch (e) { reject(); }
    });
  }

  async function _idbGet(key) {
    try {
      var db = await _idbOpen();
      return new Promise(function (resolve) {
        var tx = db.transaction('prefs', 'readonly');
        var r  = tx.objectStore('prefs').get(key);
        r.onsuccess = function (e) { resolve(e.target.result || null); };
        r.onerror   = function () { resolve(null); };
      });
    } catch (e) { return null; }
  }

  async function _idbSet(key, value) {
    try {
      var db = await _idbOpen();
      return new Promise(function (resolve) {
        var tx = db.transaction('prefs', 'readwrite');
        tx.objectStore('prefs').put(value, key);
        tx.oncomplete = resolve;
        tx.onerror    = resolve;
      });
    } catch (e) {}
  }

  // ── Cookie helpers (1 año de vida) ──────────────────────────
  function _cookieGet() {
    try {
      var m = document.cookie.match(/(^|;)\s*tm_did=([^;]+)/);
      return m ? decodeURIComponent(m[2]) : null;
    } catch (e) { return null; }
  }

  function _cookieSet(id) {
    try {
      var exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = 'tm_did=' + encodeURIComponent(id) + ';expires=' + exp + ';path=/;SameSite=Lax';
    } catch (e) {}
  }

  // ── Carnet de identidad del dispositivo ──────────────────────
  // Recupera el ID de 3 capas de almacenamiento en orden de velocidad.
  // Si no existe en ninguna, genera uno nuevo y lo guarda en las 3.
  // Resultado: mismo dispositivo = mismo ID, aunque se borre localStorage.
  async function getDeviceId() {
    var id;

    // 1. localStorage (más rápido, se borra si el usuario limpia datos del sitio)
    try { id = localStorage.getItem(DID_LS); } catch (e) {}
    if (id && (id.startsWith('did_') || id.startsWith('fp_'))) return id;

    // 2. IndexedDB (sobrevive borrar localStorage en la mayoría de navegadores)
    id = await _idbGet(DID_LS);
    if (id && (id.startsWith('did_') || id.startsWith('fp_'))) {
      try { localStorage.setItem(DID_LS, id); } catch (e) {}
      _cookieSet(id);
      return id;
    }

    // 3. Cookie de 1 año (sobrevive borrar localStorage e IndexedDB en algunos casos)
    id = _cookieGet();
    if (id && (id.startsWith('did_') || id.startsWith('fp_'))) {
      try { localStorage.setItem(DID_LS, id); } catch (e) {}
      await _idbSet(DID_LS, id);
      return id;
    }

    // 4. Generación de nuevo carnet: fingerprint de hardware + aleatorio
    //    El fingerprint garantiza cierta estabilidad entre reinicios totales.
    var fp   = deviceFingerprint();
    var rand = Math.random().toString(36).slice(2, 8);
    var newId = 'did_' + fp.replace('fp_', '') + rand;

    try { localStorage.setItem(DID_LS, newId); } catch (e) {}
    await _idbSet(DID_LS, newId);
    _cookieSet(newId);
    return newId;
  }
  window.tmGetDeviceId = getDeviceId;

  // ── Escribir token en Firebase RTDB ─────────────────────────
  // Usa el carnet (deviceId) como clave Firebase. Al escribir también
  // borra entradas viejas del mismo dispositivo (formato legacy fp_/btoa).
  async function escribirTokenRTDB(cfg, token) {
    var dbURL    = cfg.databaseURL || ("https://" + cfg.projectId + "-default-rtdb.firebaseio.com");
    var deviceId = await getDeviceId();
    var fp       = deviceFingerprint();

    // Limpiar entradas anteriores del mismo dispositivo
    var _alreadyStored = false;
    try {
      var allRes = await fetch(dbURL + "/tokens.json?_=" + Date.now(), { cache: "no-store" });
      if (allRes.ok) {
        var allData = await allRes.json();
        if (allData && typeof allData === "object") {
          // Si el token ya existe con la misma clave y valor, no volver a escribir
          if (allData[deviceId] && allData[deviceId].token === token) { _alreadyStored = true; }
          var deletes = [];
          Object.keys(allData).forEach(function (k) {
            if (k === deviceId) return; // es la entrada actual, no tocar
            var t = allData[k];
            if (!t) return;
            // Eliminar si es este mismo dispositivo con formato viejo o duplicado
            if (k === fp ||                                                    // clave legacy fp_XXXXX
                (t.fingerprint && t.fingerprint === fp) ||                     // datos con mismo fingerprint
                t.token === token ||                                            // mismo token FCM
                (t.userAgent === navigator.userAgent && !t.fingerprint && !t.deviceId)) { // legacy sin dedup
              deletes.push(fetch(dbURL + "/tokens/" + k + ".json", { method: "DELETE" }).catch(function () {}));
            }
          });
          if (deletes.length) await Promise.allSettled(deletes);
        }
      }
    } catch (e) {}

    if (_alreadyStored) return true; // ya registrado, no escribir de nuevo

    var resp = await fetch(dbURL + "/tokens/" + deviceId + ".json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token:     token,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        fingerprint: fp,
        deviceId:  deviceId
      })
    });

    if (!resp.ok) {
      var t = ""; try { t = await resp.text(); } catch (e) {}
      throw new Error("Firebase rechazó el token (HTTP " + resp.status + ")" + (t ? ": " + t : ""));
    }
    try { localStorage.removeItem(LS_PENDING); } catch (e) {}
    return true;
  }

  // ── Registro completo con tolerancia a fallos de red ─────────
  async function registrarTokenRobusto(cfgArg) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    if (localStorage.getItem("tm_push_desuscrito") === "1") return false;

    var cfg = await obtenerConfig(cfgArg);
    if (!cfg || !cfg.projectId) throw new Error("Sin configuración de Firebase. Contacta al administrador.");
    var vapid = cfg.vapidKey || localStorage.getItem("firebaseVapidKey");
    if (!vapid) throw new Error("Falta la clave VAPID. Configura Firebase en el panel admin.");

    try { await cargarScript(SDK_APP); await cargarScript(SDK_MSG); }
    catch (e) { throw new Error("Sin conexión. Verifica tu internet e inténtalo de nuevo."); }

    if (!window.firebase) throw new Error("SDK de Firebase no disponible");
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    if (firebase.messaging && firebase.messaging.isSupported && !firebase.messaging.isSupported())
      throw new Error("Este navegador no soporta notificaciones push");
    var messaging = firebase.messaging();

    var reg;
    try {
      reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/firebase-cloud-messaging-push-scope" });
      if (!reg.active) {
        await new Promise(function (resolve, reject) {
          var sw = reg.installing || reg.waiting;
          if (!sw) { resolve(); return; }
          var t = setTimeout(function () { reject(new Error("timeout activación SW")); }, 12000);
          sw.addEventListener("statechange", function onsc() {
            if (sw.state === "activated")  { clearTimeout(t); sw.removeEventListener("statechange", onsc); resolve(); }
            if (sw.state === "redundant")  { clearTimeout(t); sw.removeEventListener("statechange", onsc); reject(new Error("SW redundante")); }
          });
        });
      }
    } catch (e) { throw new Error("Error al preparar notificaciones: " + e.message); }
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
    try { token = await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg }); }
    catch (e) { throw new Error("Sin conexión con el servidor de notificaciones. Verifica tu internet."); }
    if (!token) throw new Error("No se obtuvo token. Revisa los permisos del navegador.");

    try { localStorage.setItem("fcmToken", token); } catch (e) {}
    try { localStorage.removeItem("tm_push_desuscrito"); } catch (e) {}

    try {
      await escribirTokenRTDB(cfg, token);
      if (typeof window.tmRegistrarSuscriptor === "function") { try { window.tmRegistrarSuscriptor(); } catch (e) {} }
    } catch (e) {
      try { localStorage.setItem(LS_PENDING, JSON.stringify({ token: token, cfg: cfg, ts: Date.now() })); } catch (e2) {}
      console.warn("[push-fix v8] Token FCM OK, RTDB pendiente:", e.message);
    }

    var did = await getDeviceId();
    console.log("[push-fix v8] Registrado. Carnet:", did);
    return true;
  }

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
      console.log("[push-fix v8] Pendiente guardado en RTDB.");
    } catch (e) {
      console.warn("[push-fix v8] Reintento fallido:", e.message);
    }
  }

  function _notif(msg, tipo) {
    if (typeof window.mostrarNotificacion === "function") { try { window.mostrarNotificacion(msg, tipo); } catch (e) {} }
  }
  function _wrap(cfgArg) {
    return registrarTokenRobusto(cfgArg).then(function (ok) {
      if (ok) _notif("✅ Notificaciones activadas correctamente.", "success");
      return ok;
    }).catch(function (e) {
      console.error("[push-fix v8]", e.message);
      _notif("⚠️ No se pudo activar las notificaciones. Intenta de nuevo.", "error");
      return false;
    });
  }

  window.tmRegistrarTokenFCMSiPermitido = function () { return _wrap(); };
  window.inicializarFirebaseFCMClient   = function (cfg) { return _wrap(cfg); };

  function autoRecuperar() {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (localStorage.getItem("tm_push_desuscrito") === "1") return;
      if (localStorage.getItem("fcmToken")) {
        setTimeout(function () { reintentarPendiente().catch(function () {}); }, 3000);
        return;
      }
      setTimeout(function () {
        registrarTokenRobusto().catch(function (e) { console.warn("[push-fix v8] auto-recuperación:", e.message); });
      }, 5000);
    } catch (e) {}
  }
  if (document.readyState === "complete" || document.readyState === "interactive") autoRecuperar();
  else window.addEventListener("DOMContentLoaded", autoRecuperar);
})();
