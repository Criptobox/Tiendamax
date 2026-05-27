
// ═══════════════════════════════════════════════════════
//  SEGURIDAD AVANZADA (Admin Shield)
// ═══════════════════════════════════════════════════════

let _ultimoMovimiento = Date.now();
const _TIMEOUT_SESION = 15 * 60 * 1000; // 15 minutos

function registrarMovimiento() {
    _ultimoMovimiento = Date.now();
}

function verificarInactividad() {
    if (usuarioAutenticado && (Date.now() - _ultimoMovimiento > _TIMEOUT_SESION)) {
        cerrarAdminPanelForzoso();
        mostrarNotificacion('🔒 Sesión cerrada por inactividad', 'info');
    }
}

function cerrarAdminPanelForzoso() {
    usuarioAutenticado = false;
    cerrarAdminPanel();
    // Limpiar contraseñas de memoria si las hay
    const pw = document.getElementById('adminPassword');
    if (pw) pw.value = '';
}

// Bloquear al ocultar pestaña (OPCIONAL - Muy estricto)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && usuarioAutenticado) {
        // Podríamos cerrar sesión o simplemente registrar el evento
        console.log('Admin panel hidden - security check');
    }
});

// Registrar eventos de actividad
document.addEventListener('mousedown', registrarMovimiento);
document.addEventListener('keydown', registrarMovimiento);
document.addEventListener('touchstart', registrarMovimiento);

// Timer de verificación
setInterval(verificarInactividad, 60000); // Cada minuto

// ── LOG DE ACCESOS (Local) ──
function registrarAccesoExitoso() {
    const logs = JSON.parse(localStorage.getItem('admin_security_logs') || '[]');
    logs.unshift({
        fecha: new Date().toISOString(),
        evento: 'Acceso Exitoso',
        agente: navigator.userAgent.substring(0, 50)
    });
    localStorage.setItem('admin_security_logs', JSON.stringify(logs.slice(0, 10)));
}

function renderizarLogsSeguridad() {
    const cont = document.getElementById('securityLogsContent');
    if (!cont) return;
    const logs = JSON.parse(localStorage.getItem('admin_security_logs') || '[]');
    
    if (logs.length === 0) {
        cont.innerHTML = '<p style="color:#666; font-size:12px;">No hay registros recientes.</p>';
        return;
    }

    cont.innerHTML = logs.map(l => `
        <div style="font-size:11px; padding:6px; border-bottom:1px solid rgba(255,255,255,0.05); color:#aaa;">
            <span style="color:var(--success); font-weight:700;">[OK]</span> 
            ${new Date(l.fecha).toLocaleString()}
        </div>
    `).join('');
}

// Interceptar login exitoso
const _origVerificarPassword = verificarPassword;
verificarPassword = async function(e) {
    const success = await _origVerificarPassword(e);
    // Nota: verificarPassword en script.js no devuelve nada, 
    // pero si usuarioAutenticado se vuelve true, fue exitoso.
    setTimeout(() => {
        if (usuarioAutenticado) {
            registrarAccesoExitoso();
            renderizarLogsSeguridad();
        }
    }, 500);
};
