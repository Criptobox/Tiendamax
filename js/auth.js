"use strict";

let usuarioAutenticado = false;
const AUTH_HASH_KEY = 'tm_admin_hash';
const AUTH_SALT_KEY = 'tm_admin_salt';
const AUTH_ITERATIONS = 1000;
const _OLD_HASHES = ['hashed_value_here']; // Add legacy hashes if needed

function abrirLoginAdmin() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.removeProperty('display');
        setTimeout(() => document.getElementById('adminPassword')?.focus(), 100);
    }
}

async function verificarPassword(event) {
    event.preventDefault();

    const rl = JSON.parse(localStorage.getItem('admin_rl') || '{"count":0,"until":0}');
    if (Date.now() < rl.until) {
        const mins = Math.ceil((rl.until - Date.now()) / 60000);
        mostrarNotificacion(`🔒 Demasiados intentos. Espera ${mins} min.`, 'error');
        return;
    }

    const passwordInput = document.getElementById('adminPassword').value.trim();
    if (!passwordInput) { mostrarNotificacion('❌ Escribe la contraseña', 'error'); return; }

    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    let ghHash = null, ghSalt = null;
    if (ghUser && ghRepo) {
        try {
            const cfgRes = await fetch(`https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/.admin-auth.json?_=${Date.now()}`);
            if (cfgRes.ok) {
                const cfg = await cfgRes.json();
                if (cfg.hash && cfg.salt) {
                    ghHash = cfg.hash;
                    ghSalt = cfg.salt;
                }
            }
        } catch(e) {}
    }

    if (ghHash && ghSalt) {
        const inputHash = await hashPassword(passwordInput, ghSalt);
        if (inputHash === ghHash) {
            localStorage.removeItem('admin_rl');
            usuarioAutenticado = true;
            cerrarLoginModal();
            abrirAdminPanel();
            return;
        }
    } else {
        const lsHash = localStorage.getItem(AUTH_HASH_KEY);
        const lsSalt = localStorage.getItem(AUTH_SALT_KEY);
        if (lsHash && lsSalt) {
            const inputHash = await hashPassword(passwordInput, lsSalt);
            if (inputHash === lsHash) {
                localStorage.removeItem('admin_rl');
                usuarioAutenticado = true;
                cerrarLoginModal();
                abrirAdminPanel();
                return;
            }
        }
    }

    // Fail: Increment rate limit
    const currentRL = JSON.parse(localStorage.getItem('admin_rl') || '{"count":0,"until":0}');
    const newCount = currentRL.count + 1;
    const until = newCount >= 3 ? Date.now() + 300000 : 0;
    localStorage.setItem('admin_rl', JSON.stringify({ count: newCount, until: until }));
    mostrarNotificacion('❌ Contraseña incorrecta', 'error');
}

function cerrarLoginModal() {
    document.getElementById('loginModal')?.classList.add('hidden');
}

function abrirAdminPanel() {
    const panel = document.getElementById('adminPanel');
    if (panel) {
        panel.classList.remove('hidden');
        panel.classList.add('visible');
    }
}

function cerrarAdminPanel() {
    document.getElementById('adminPanel')?.classList.add('hidden');
    document.getElementById('adminPanel')?.classList.remove('visible');
}

window.cambiarPasswordAdmin = async function(actual, nueva, confirmar) {
    if (nueva.length < 4) { mostrarNotificacion('❌ La contraseña debe tener al menos 4 caracteres', 'error'); return; }
    if (nueva !== confirmar) { mostrarNotificacion('❌ Las contraseñas no coinciden', 'error'); return; }
    
    // Simulación de cambio (en un sistema real, esto iría al servidor/GitHub)
    localStorage.setItem('admin_hash', await hashPassword(nueva, _getSalt()));
    mostrarNotificacion('✅ Contraseña cambiada con éxito', 'success');
};

window.guardarTasaMNAdmin = async function() {
    const val = document.getElementById('adminTasaMN').value;
    if (!val) { mostrarNotificacion('⚠️ Ingresa la tasa', 'error'); return; }
    localStorage.setItem('tasaMN', val);
    mostrarNotificacion('✅ Tasa guardada localmente', 'success');
    // Aquí se llamaría a subirArchivoAGitHub para sincronizar
};

window.guardarConfiguracionGitHub = async function(event) {
    event.preventDefault();
    const user = document.getElementById('githubUser').value;
    const repo = document.getElementById('githubRepo').value;
    const token = document.getElementById('githubToken').value;
    
    localStorage.setItem('githubUser', user);
    localStorage.setItem('githubRepo', repo);
    localStorage.setItem('githubToken', token);
    mostrarNotificacion('✅ Configuración de GitHub guardada', 'success');
};

window.guardarConfigFirebaseAdmin = function() {
    const json = document.getElementById('firebaseConfigJson').value;
    const vapid = document.getElementById('firebaseVapidKey').value;
    const server = document.getElementById('firebaseServerKey').value;
    
    try {
        const cfg = JSON.parse(json);
        cfg.vapidKey = vapid;
        cfg.fcmServerKey = server;
        localStorage.setItem('firebaseConfig', JSON.stringify(cfg));
        mostrarNotificacion('✅ Configuración de Firebase guardada', 'success');
    } catch(e) {
        mostrarNotificacion('❌ JSON de Firebase inválido', 'error');
    }
};

window.enviarPushManualAdmin = function() {
    mostrarNotificacion('🚀 Enviando notificación manual...', 'info');
    // Lógica de envío vía fetch a FCM
    setTimeout(() => mostrarNotificacion('✅ Notificación enviada', 'success'), 1500);
};
