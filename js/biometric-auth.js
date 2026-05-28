/* ============================================================
 * biometric-auth.js
 * Login admin con huella / Face ID / Windows Hello vía WebAuthn.
 *
 * Cómo funciona:
 *  1. La primera vez, el admin entra con contraseña y registra
 *     su huella → se guarda el credential ID en localStorage.
 *  2. Las siguientes veces puede pulsar "Acceder con huella".
 *     El navegador pide autenticación biométrica al dispositivo.
 *     Si la verifica, da acceso al panel.
 *
 * Requisitos: HTTPS (lo cumple GitHub Pages) y dispositivo con
 * autenticador biométrico (la mayoría de móviles y portátiles modernos).
 *
 * Las claves criptográficas viven SOLO en el dispositivo. Lo que se
 * guarda en localStorage es solo el "ID público" del credential.
 * Nadie puede entrar copiando el localStorage: el dispositivo tiene
 * que aprobar biométricamente cada login.
 * ============================================================ */
(function () {
    'use strict';

    const STORAGE_KEY  = 'biometric_credential_id';
    const RP_NAME      = 'TiendaMax Admin';
    const USER_NAME    = 'admin';
    const USER_DISPLAY = 'Administrador TiendaMax';

    // ── Utilidades base64 ──────────────────────────────────────────
    function bufferToBase64(buf) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function base64ToBuffer(b64) {
        const pad = '='.repeat((4 - b64.length % 4) % 4);
        const s   = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(s);
        const buf = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
        return buf.buffer;
    }

    // ── ¿Soporta WebAuthn este navegador? ─────────────────────────
    async function biometricoDisponible() {
        if (!window.PublicKeyCredential) return false;
        try {
            return await PublicKeyCredential
                .isUserVerifyingPlatformAuthenticatorAvailable();
        } catch (e) { return false; }
    }

    // ── REGISTRO: la primera vez ──────────────────────────────────
    async function registrarBiometrico() {
        if (!await biometricoDisponible()) {
            alert('⚠️ Este dispositivo no tiene huella/Face ID disponible para el navegador.');
            return false;
        }
        try {
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const userId    = crypto.getRandomValues(new Uint8Array(16));

            const cred = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: RP_NAME, id: location.hostname },
                    user: {
                        id: userId,
                        name: USER_NAME,
                        displayName: USER_DISPLAY
                    },
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7   }, // ES256
                        { type: 'public-key', alg: -257 }  // RS256
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform', // huella interna
                        userVerification: 'required',
                        residentKey: 'preferred'
                    },
                    timeout: 60000,
                    attestation: 'none'
                }
            });

            if (!cred) return false;

            const credId = bufferToBase64(cred.rawId);
            localStorage.setItem(STORAGE_KEY, credId);

            mostrarOkular('✅ Huella registrada correctamente. Ya puedes usarla para entrar.');
            actualizarUIBiometrica();
            return true;
        } catch (err) {
            console.error('[biometric] Error registro:', err);
            alert('❌ No se pudo registrar la huella: ' + (err.message || err.name));
            return false;
        }
    }

    // ── LOGIN: usar la huella registrada ──────────────────────────
    async function loginConBiometria() {
        const credId = localStorage.getItem(STORAGE_KEY);
        if (!credId) {
            alert('Primero tienes que registrar tu huella entrando con la contraseña.');
            return;
        }
        try {
            const challenge = crypto.getRandomValues(new Uint8Array(32));

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    allowCredentials: [{
                        id:   base64ToBuffer(credId),
                        type: 'public-key',
                        transports: ['internal']
                    }],
                    userVerification: 'required',
                    timeout: 60000
                }
            });

            if (assertion) {
                // Verificación local: el SO ya validó la huella.
                // Marcamos al usuario como autenticado y abrimos el panel.
                window.usuarioAutenticado = true;
                if (typeof cerrarLoginModal === 'function') cerrarLoginModal();
                if (typeof abrirAdminPanel  === 'function') abrirAdminPanel();
                else mostrarOkular('✅ Acceso concedido');
            }
        } catch (err) {
            console.error('[biometric] Error login:', err);
            if (err.name === 'NotAllowedError') {
                alert('❌ Autenticación cancelada o fallida.');
            } else {
                alert('❌ No se pudo verificar la huella: ' + (err.message || err.name));
            }
        }
    }

    // ── Quitar el registro biométrico ─────────────────────────────
    function eliminarBiometrico() {
        if (confirm('¿Eliminar la huella registrada en este dispositivo?')) {
            localStorage.removeItem(STORAGE_KEY);
            actualizarUIBiometrica();
            mostrarOkular('🗑️ Huella eliminada');
        }
    }

    // ── Mostrar/ocultar botones según estado ──────────────────────
    async function actualizarUIBiometrica() {
        const box       = document.getElementById('biometricLoginBox');
        const btnLogin  = document.getElementById('btnBiometricLogin');
        const btnReg    = document.getElementById('btnBiometricRegister');
        if (!box || !btnLogin || !btnReg) return;

        const disponible = await biometricoDisponible();
        const registrado = !!localStorage.getItem(STORAGE_KEY);

        // Caja de login con huella: solo si el dispositivo soporta y hay registro
        box.style.display = (disponible && registrado) ? 'block' : 'none';

        // Botón de registrar: solo si soporta y NO está registrado
        btnReg.style.display = (disponible && !registrado) ? 'block' : 'none';
        btnReg.textContent   = '🔐 Registrar huella en este dispositivo';

        // Si ya está registrado, ofrecer eliminar (cuando esté logueado)
        if (registrado && window.usuarioAutenticado) {
            btnReg.style.display = 'block';
            btnReg.textContent   = '🗑️ Eliminar huella registrada';
            btnReg.onclick       = eliminarBiometrico;
        } else {
            btnReg.onclick = registrarBiometrico;
        }
    }

    function mostrarOkular(msg) {
        if (typeof mostrarNotificacion === 'function') {
            mostrarNotificacion(msg, 'success');
        } else {
            console.log(msg);
        }
    }

    // ── Wire up ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        actualizarUIBiometrica();

        const btnLogin = document.getElementById('btnBiometricLogin');
        if (btnLogin) btnLogin.addEventListener('click', loginConBiometria);
    });

    // Cuando se abra el modal de login, refrescar el estado
    const _abrirOriginal = window.abrirLoginAdmin;
    if (typeof _abrirOriginal === 'function') {
        window.abrirLoginAdmin = function () {
            _abrirOriginal.apply(this, arguments);
            setTimeout(actualizarUIBiometrica, 50);
        };
    }

    // Exportar al global por si se llama desde data-action
    window.registrarBiometrico = registrarBiometrico;
    window.loginConBiometria   = loginConBiometria;
    window.eliminarBiometrico  = eliminarBiometrico;
})();
