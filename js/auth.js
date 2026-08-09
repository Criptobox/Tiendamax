/* Firebase Authentication — la cuenta del dueño.
 *
 * Hasta ahora no había ninguna autenticación en todo el proyecto, y eso tenía
 * dos consecuencias que se pagaron caras:
 *
 *  1. La contraseña del admin vivía como hash en el localStorage de UN
 *     navegador. Borrar los datos = quedarse fuera, sin recuperación posible,
 *     porque el hash guardado en Firebase no se puede leer desde el navegador
 *     (ver más abajo por qué).
 *  2. Las reglas de Firebase no podían distinguir al dueño de un desconocido.
 *     Los permisos de LECTURA no ven nada de lo que manda el cliente —un GET
 *     es solo un GET—, así que toda regla que dejara leer al admin dejaba leer
 *     a cualquiera. De ahí que /ventas, con los ingresos y las ganancias,
 *     estuviera abierto a quien supiera la URL.
 *
 * Con una cuenta de verdad, las reglas ya pueden decir `auth != null` y existe
 * un sitio privado donde guardar lo que hoy solo vive en este navegador
 * (reservas, historial de vales, datos de clientes).
 *
 * ── Lo que NO se toca ──
 * La web pública sigue hablando con Firebase sin autenticarse: analíticas,
 * reseñas, registro de push, web vitals, seguimiento de pedidos. Ninguna de
 * esas rutas cambia. Meter `auth != null` en una de ellas rechazaría las
 * peticiones legítimas de los propios clientes, que es exactamente el fallo
 * que tuvo /admin_auth en su día.
 *
 * ── Cómo se autentica una llamada REST ──
 * La API REST de la Realtime Database acepta `?auth=<ID token>`. El token
 * caduca cada hora y el SDK lo renueva solo, así que aquí se pide fresco en
 * cada llamada en vez de guardarlo: un token vencido da 401 y el dato no se
 * guarda, sin más aviso.
 */
(function () {
  'use strict';

  var SDK_APP = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js';
  var SDK_AUTH = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js';

  var _listo = null;        // promesa de "SDK cargado y auth inicializado"
  var _user = null;
  var _oyentes = [];

  function _cargarScript(src) {
    return new Promise(function (res, rej) {
      var existente = document.querySelector('script[src="' + src + '"]');
      if (existente) { existente.addEventListener('load', res); existente.addEventListener('error', rej); if (window.firebase) res(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('no se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function _config() {
    try {
      var c = JSON.parse(localStorage.getItem('firebaseConfig') || 'null');
      if (c && c.apiKey && c.projectId) return c;
    } catch (e) {}
    return null;
  }

  function _rtdb() {
    var c = _config();
    if (!c) return null;
    return (c.databaseURL || ('https://' + c.projectId + '-default-rtdb.firebaseio.com')).replace(/\/$/, '');
  }

  /* Arranca el SDK. Es idempotente: se puede llamar desde donde sea y las
     veces que haga falta. Si no hay firebaseConfig guardada, la busca en
     config.json como hace el resto del proyecto. */
  function init() {
    if (_listo) return _listo;
    _listo = (async function () {
      var cfg = _config();
      if (!cfg) {
        try {
          var r = await fetch('/config.json?_=' + Date.now(), { cache: 'no-store' });
          if (r.ok) {
            var j = await r.json();
            if (j && j.firebaseConfig) {
              localStorage.setItem('firebaseConfig', JSON.stringify(j.firebaseConfig));
              cfg = j.firebaseConfig;
            }
          }
        } catch (e) {}
      }
      if (!cfg) throw new Error('sin configuración de Firebase');
      await _cargarScript(SDK_APP);
      await _cargarScript(SDK_AUTH);
      if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
      var auth = window.firebase.auth();
      // La sesión sobrevive al cierre del navegador: el dueño no tiene por qué
      // volver a entrar cada vez que abre el panel.
      try { await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
      await new Promise(function (res) {
        var quitar = auth.onAuthStateChanged(function (u) {
          _user = u || null;
          _oyentes.forEach(function (f) { try { f(_user); } catch (e) {} });
          res();
        });
        // onAuthStateChanged sigue vivo a propósito: avisa también al entrar,
        // al salir y cuando caduca la sesión.
        void quitar;
      });
      return auth;
    })();
    return _listo;
  }

  function usuario() { return _user; }
  function alCambiar(fn) { _oyentes.push(fn); if (_user !== undefined) { try { fn(_user); } catch (e) {} } }

  async function entrar(email, pass) {
    var auth = await init();
    try {
      var c = await auth.signInWithEmailAndPassword(String(email || '').trim(), String(pass || ''));
      return { ok: true, user: c.user };
    } catch (e) { return { ok: false, codigo: e && e.code, msg: _mensaje(e) }; }
  }

  async function crearCuenta(email, pass) {
    var auth = await init();
    try {
      var c = await auth.createUserWithEmailAndPassword(String(email || '').trim(), String(pass || ''));
      return { ok: true, user: c.user };
    } catch (e) { return { ok: false, codigo: e && e.code, msg: _mensaje(e) }; }
  }

  async function recuperar(email) {
    var auth = await init();
    try {
      await auth.sendPasswordResetEmail(String(email || '').trim());
      return { ok: true };
    } catch (e) { return { ok: false, msg: _mensaje(e) }; }
  }

  async function salir() {
    try { var auth = await init(); await auth.signOut(); return { ok: true }; }
    catch (e) { return { ok: false, msg: _mensaje(e) }; }
  }

  /* Los códigos de Firebase llegan en inglés y como 'auth/invalid-credential'.
     Enseñar eso tal cual no le dice nada a nadie. */
  function _mensaje(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/invalid-email') return 'Ese correo no tiene forma de correo.';
    if (c === 'auth/user-not-found') return 'No hay ninguna cuenta con ese correo. Créala primero.';
    if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials')
      return 'Correo o contraseña incorrectos.';
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
    if (c === 'auth/email-already-in-use') return 'Ya existe una cuenta con ese correo. Entra en vez de crearla.';
    if (c === 'auth/weak-password') return 'La contraseña es muy corta: mínimo 6 caracteres.';
    if (c === 'auth/network-request-failed') return 'Sin conexión con Firebase. Revisa internet.';
    // Este es el que sale cuando en la consola se activó otro proveedor
    // (Google, por ejemplo) pero no el de correo. Son interruptores distintos
    // y conviven sin problema, así que el mensaje da los pasos en vez de
    // dejarte adivinando cuál falta.
    if (c === 'auth/operation-not-allowed')
      return 'Falta activar el proveedor <b>Correo/contraseña</b>. Activar Google no vale: son interruptores distintos.<br>'
           + 'Consola de Firebase → <b>Authentication</b> → pestaña <b>Sign-in method</b> → <b>Add new provider</b> → '
           + '<b>Email/Password</b> → activa el primer interruptor (el de <i>Email link</i> déjalo apagado) → Guardar.';
    // Los de arriba están escritos aquí y llevan negritas a propósito. Este
    // no: es el texto crudo de Firebase, y va escapado por si algún día trae
    // algo que el panel no debería interpretar como HTML.
    return String((e && e.message) || 'Error desconocido.')
      .replace(/[&<>"]/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; });
  }

  /* Token fresco para firmar una llamada REST. null si no hay sesión: quien
     llama debe tratarlo como "no puedo, y hay que decirlo", nunca como "sigue
     sin token" — eso da un 401 mudo. */
  async function token() {
    try {
      await init();
      if (!_user) return null;
      return await _user.getIdToken();
    } catch (e) { return null; }
  }

  /* Llamada a la zona privada de la base de datos. Devuelve
     {ok, dato|null, msg} en vez de lanzar: todas las llamadas de este proyecto
     son "si falla, seguimos", y una excepción suelta se traga el resto de la
     función que la llamó. */
  async function fetchPrivado(path, opts) {
    var base = _rtdb();
    if (!base) return { ok: false, msg: 'sin configuración de Firebase' };
    var t = await token();
    if (!t) return { ok: false, sinSesion: true, msg: 'no has entrado con tu cuenta' };
    var url = base + path + (path.indexOf('?') === -1 ? '?' : '&') + 'auth=' + encodeURIComponent(t);
    try {
      var r = await fetch(url, opts || {});
      if (!r.ok) {
        return { ok: false, estado: r.status, msg: (r.status === 401 || r.status === 403)
          ? 'Firebase rechazó la petición. ¿Publicaste las reglas nuevas?'
          : ('HTTP ' + r.status) };
      }
      var txt = await r.text();
      var dato = null;
      try { dato = txt ? JSON.parse(txt) : null; } catch (e) {}
      return { ok: true, dato: dato };
    } catch (e) {
      return { ok: false, msg: 'no se pudo conectar con Firebase' };
    }
  }

  /* ── Quién es el dueño de esta base ─────────────────────────────────────
     `auth != null` a secas no protege nada aquí. La clave de API de Firebase
     es PÚBLICA —va en el propio sitio, en firebase-messaging-sw.js— y el
     registro por correo está abierto por defecto, así que cualquiera puede
     crearse una cuenta contra este proyecto y quedar autenticado. Con esa
     regla habría podido leer /ventas y /privado igual que el dueño.

     Por eso las reglas comparan contra /admin_uid, que se reclama UNA vez y
     solo con el uid propio: ni se puede cambiar después, ni apuntar a otro.
     El primero que entre se queda la base, y ese eres tú si lo haces ahora
     mismo. Cerrar el registro en la consola (Authentication → Settings →
     User actions → quitar "Enable create") elimina la ventana del todo. */
  async function estadoDueno() {
    await init();
    if (!_user) return { sesion: false };
    var r = await fetchPrivado('/admin_uid.json');
    if (!r.ok) return { sesion: true, uid: _user.uid, error: r.msg };
    var dueno = (typeof r.dato === 'string') ? r.dato : null;
    return { sesion: true, uid: _user.uid, dueno: dueno, soyYo: dueno === _user.uid, libre: !dueno };
  }

  async function reclamar() {
    var e = await estadoDueno();
    if (!e.sesion) return { ok: false, msg: 'entra con tu cuenta primero' };
    if (e.soyYo) return { ok: true, yaEra: true };
    if (e.dueno) {
      return { ok: false, ajeno: true, msg: 'Esta base ya está reclamada por OTRA cuenta (' + e.dueno + '). '
        + 'Si no la reconoces, bórrala desde la consola de Firebase (nodo admin_uid) y vuelve a reclamarla.' };
    }
    var w = await fetchPrivado('/admin_uid.json', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_user.uid)
    });
    if (!w.ok) return { ok: false, msg: w.msg };
    return { ok: true, uid: _user.uid };
  }

  window.TMAuth = {
    init: init,
    usuario: usuario,
    alCambiar: alCambiar,
    entrar: entrar,
    crearCuenta: crearCuenta,
    recuperar: recuperar,
    salir: salir,
    token: token,
    estadoDueno: estadoDueno,
    reclamar: reclamar,
    fetchPrivado: fetchPrivado,
    rtdb: _rtdb
  };
})();
