/* TiendaMax — Biometric Auth (WebAuthn / Passkeys)
 * Usa la API Platform Authenticator del navegador:
 * Touch ID, Face ID, Windows Hello, huella Android.
 * Requiere HTTPS en producción (ya configurado en tiendamax.org).
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

  function supported() {
    return !!(window.PublicKeyCredential && window.crypto && window.crypto.getRandomValues);
  }

  function storedCred() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function bufToB64(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  }

  function b64ToBuf(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }

  /* ── Registro (desde Configuración del panel) ── */
  window.tmRegistrarHuella = async function () {
    if (!supported()) {
      notify('Tu navegador no soporta autenticación biométrica.', 'error');
      return;
    }
    try {
      var cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'TiendaMax Admin', id: location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: 'admin',
            displayName: 'Administrador TiendaMax'
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' },
            { alg: -257, type: 'public-key' }
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
      if (!cred) throw new Error('No se creó la credencial');
      localStorage.setItem(LS_KEY, JSON.stringify({
        id: cred.id,
        rawId: bufToB64(cred.rawId)
      }));
      notify('✅ Huella registrada. Ya puedes entrar sin contraseña.', 'success');
      refreshUI();
    } catch (e) {
      if (e.name === 'NotAllowedError') notify('Registro cancelado.', 'info');
      else if (e.name === 'InvalidStateError') notify('Credencial ya registrada en este dispositivo.', 'warning');
      else notify('Error al registrar: ' + e.message, 'error');
    }
  };

  /* ── Eliminar credencial ── */
  window.tmEliminarHuella = function () {
    localStorage.removeItem(LS_KEY);
    notify('Huella eliminada. Usa contraseña para acceder.', 'info');
    refreshUI();
  };

  /* ── Login con huella ── */
  window.loginConBiometria = async function () {
    if (!supported()) {
      notify('Tu dispositivo no soporta autenticación biométrica.', 'error');
      return;
    }
    var cred = storedCred();
    if (!cred) {
      notify('No hay huella registrada. Entra con contraseña y regístrala en Configuración → Seguridad.', 'info');
      return;
    }
    try {
      var assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: b64ToBuf(cred.rawId), transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      if (assertion) {
        if (typeof window.tmGrantAdminAccess === 'function') {
          window.tmGrantAdminAccess();
        } else {
          var modal = document.getElementById('loginModal');
          if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
          var panel = document.getElementById('adminPanel');
          if (panel) { panel.classList.remove('hidden'); panel.classList.add('visible'); document.body.classList.add('admin-mode'); }
        }
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') notify('Autenticación cancelada o huella no reconocida.', 'info');
      else notify('Error al autenticar: ' + e.message, 'error');
    }
  };

  /* ── Actualizar botón de login en la pantalla de acceso ── */
  function updateLoginBtn() {
    var btn = document.getElementById('btnBiometricLogin');
    if (!btn) return;
    btn.style.display = (supported() && !!storedCred()) ? '' : 'none';
  }

  /* ── Actualizar sección dentro del panel (Configuración → Seguridad) ── */
  function updateBioSection() {
    var el = document.getElementById('tmBioSection');
    if (!el) return;
    var hasCred = !!storedCred();
    if (!supported()) {
      el.innerHTML = '<p style="color:#888;font-size:13px;margin:0">Tu navegador no soporta biometría WebAuthn.</p>';
      return;
    }
    el.innerHTML = hasCred
      ? '<p style="color:#7ed47e;font-size:13px;margin:0 0 10px">✅ Huella registrada en este dispositivo.</p>' +
        '<button type="button" onclick="window.tmEliminarHuella()" style="padding:7px 14px;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.25);border-radius:8px;color:#e74c3c;cursor:pointer;font-size:13px">🗑 Eliminar huella</button>'
      : '<p style="color:#888;font-size:13px;margin:0 0 10px">Sin huella registrada en este dispositivo.</p>' +
        '<button type="button" onclick="window.tmRegistrarHuella()" style="padding:7px 14px;background:rgba(201,169,110,.14);border:1px solid rgba(201,169,110,.3);border-radius:8px;color:#C9A96E;cursor:pointer;font-size:13px">👆 Registrar huella / Face ID</button>';
  }

  function refreshUI() {
    updateLoginBtn();
    updateBioSection();
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', function () {
    refreshUI();
    var loginBtn = document.getElementById('btnBiometricLogin');
    if (loginBtn) loginBtn.addEventListener('click', function (e) { e.preventDefault(); window.loginConBiometria(); });
  });

  /* Refrescar sección cuando el panel admin se abre */
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var p = document.getElementById('adminPanel');
        if (p && !p.classList.contains('hidden')) setTimeout(updateBioSection, 350);
      }
    });
  });
  document.addEventListener('DOMContentLoaded', function () {
    var p = document.getElementById('adminPanel');
    if (p) obs.observe(p, { attributes: true });
  });
})();
