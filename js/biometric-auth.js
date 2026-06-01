/* TiendaMax — Biometric Auth compatibility stub
 * Evita errores 404 cuando admin.html carga el módulo biométrico.
 * La autenticación principal sigue siendo la contraseña PBKDF2 de script.src.js.
 * Este archivo deja preparados los botones por si se implementan passkeys más adelante.
 */
(function () {
  'use strict';

  function notify(msg, type) {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion(msg, type || 'info');
    } else {
      console.log('[biometric-auth]', msg);
    }
  }

  window.loginConBiometria = window.loginConBiometria || function () {
    notify('🔐 Acceso biométrico no configurado en este dispositivo. Usa la contraseña.', 'info');
    return false;
  };

  document.addEventListener('DOMContentLoaded', function () {
    var loginBox = document.getElementById('biometricLoginBox');
    var loginBtn = document.getElementById('btnBiometricLogin');
    var registerBtn = document.getElementById('btnBiometricRegister');

    // Mantenerlo oculto hasta implementar passkeys reales. Así no promete una
    // función que todavía no está activa, pero tampoco rompe admin.html.
    if (loginBox) loginBox.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';

    if (loginBtn) {
      loginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.loginConBiometria();
      });
    }
  });
})();
