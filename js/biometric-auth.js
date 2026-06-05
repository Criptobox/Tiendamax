/* TiendaMax — Biometric Auth (WebAuthn / Passkeys)
 * Usa la API de Platform Authenticator del navegador (Touch ID, Face ID,
 * Windows Hello, huella Android) para iniciar sesión sin contraseña.
 * Requiere HTTPS en producción (localhost funciona en desarrollo).
 */
(function () {
  'use strict';

  var LS_KEY = 'tm_bio_cred';

  function notify(msg, type) {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion(msg, type || 'info');
    } else {
      alert(msg);
    }
  }

  function isSupported() {
    return !!(window.PublicKeyCredential &&
              window.crypto &&
              window.crypto.getRandomValues);
  }

  function getStoredCred() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function bufToB64(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  }

  function b64ToBuf(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /* ── Registro (una sola vez, desde el panel) ── */
  window.tmRegistrarHuella = async function () {
    if (!isSupported()) {
      notify('Tu dispositivo o navegador no soporta autenticación biométrica.', 'error');
      return;
    }

    try {
      var challenge = crypto.getRandomValues(new Uint8Array(32));
      var userId    = crypto.getRandomValues(new Uint8Array(16));

      var credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: {
            name: 'TiendaMax Admin',
            id: location.hostname
          },
          user: {
            id: userId,
            name: 'admin',
            displayName: 'Administrador TiendaMax'
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' },  // ES256
            { alg: -257, type: 'public-key' }    // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            requireResidentKey: false
          },
          timeout: 60000,
          attestation: 'none'
        }
      });

      if (!credential) throw new Error('No se creó la credencial');

      localStorage.setItem(LS_KEY, JSON.stringify({
        id: credential.id,
        rawId: bufToB64(credential.rawId)
      }));

      notify('✅ Huella registrada. La próxima vez puedes entrar sin contraseña.', 'success');
      updateBioSection();
      updateLoginBtn();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        notify('Registro cancelado.', 'info');
      } else if (err.name === 'InvalidStateError') {
        notify('Esta huella ya está registrada en el dispositivo.', 'warning');
      } else {
        notify('Error al registrar: ' + err.message, 'error');
      }
    }
  };

  /* ── Eliminar credencial registrada ── */
  window.tmEliminarHuella = function () {
    localStorage.removeItem(LS_KEY);
    notify('Huella eliminada. Usa contraseña para acceder.', 'info');
    updateBioSection();
    updateLoginBtn();
  };

  /* ── Login con huella ── */
  window.loginConBiometria = async function () {
    if (!isSupported()) {
      notify('Tu dispositivo no soporta autenticación biométrica.', 'error');
      return;
    }

    var stored = getStoredCred();
    if (!stored) {
      notify('No hay huella registrada. Entra con contraseña y regístrala desde Configuración → Seguridad.', 'info');
      return;
    }

    try {
      var challenge = crypto.getRandomValues(new Uint8Array(32));
      var rawId     = b64ToBuf(stored.rawId);

      var assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            type: 'public-key',
            id: rawId,
            transports: ['internal']
          }],
          userVerification: 'required',
          timeout: 60000
        }
      });

      if (assertion) {
        if (typeof window.tmGrantAdminAccess === 'function') {
          window.tmGrantAdminAccess();
        } else {
          // Fallback si script.js aún no está cargado
          var modal = document.getElementById('loginModal');
          if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
          var panel = document.getElementById('adminPanel');
          if (panel) {
            panel.classList.remove('hidden');
            panel.classList.add('visible');
            document.body.classList.add('admin-mode');
          }
        }
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        notify('Autenticación cancelada o huella no reconocida.', 'info');
      } else {
        notify('Error al autenticar: ' + err.message, 'error');
      }
    }
  };

  /* ── Actualizar botón de login ── */
  function updateLoginBtn() {
    var loginBtn = document.getElementById('btnBiometricLogin');
    if (!loginBtn) return;
    var supported = isSupported();
    var hasCred   = !!getStoredCred();
    loginBtn.style.display = (supported && hasCred) ? '' : 'none';
  }

  /* ── Sección de biometría en la pestaña Configuración ── */
  function updateBioSection() {
    var section = document.getElementById('tmBioSection');
    if (!section) return;
    var hasCred = !!getStoredCred();
    if (!isSupported()) {
      section.innerHTML = '<p style="color:#888;font-size:13px;margin:0">Tu navegador no soporta autenticación biométrica.</p>';
      return;
    }
    if (hasCred) {
      section.innerHTML =
        '<p style="color:#7ed47e;font-size:13px;margin:0 0 10px">✅ Huella registrada en este dispositivo.</p>' +
        '<button type="button" onclick="window.tmEliminarHuella()" style="padding:7px 14px;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.25);border-radius:8px;color:#e74c3c;cursor:pointer;font-size:13px">🗑 Eliminar huella</button>';
    } else {
      section.innerHTML =
        '<p style="color:#888;font-size:13px;margin:0 0 10px">No hay huella registrada.</p>' +
        '<button type="button" onclick="window.tmRegistrarHuella()" style="padding:7px 14px;background:rgba(201,169,110,.14);border:1px solid rgba(201,169,110,.3);border-radius:8px;color:#C9A96E;cursor:pointer;font-size:13px">👆 Registrar huella / Face ID</button>';
    }
  }

  /* ── Inicialización ── */
  document.addEventListener('DOMContentLoaded', function () {
    updateLoginBtn();
    updateBioSection();

    var loginBtn = document.getElementById('btnBiometricLogin');
    if (loginBtn) {
      loginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.loginConBiometria();
      });
    }
  });

  // Actualizar sección cuando el panel admin se hace visible
  var panelObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var p = document.getElementById('adminPanel');
        if (p && !p.classList.contains('hidden')) {
          setTimeout(updateBioSection, 400);
        }
      }
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    var p = document.getElementById('adminPanel');
    if (p) panelObserver.observe(p, { attributes: true });
  });
})();
