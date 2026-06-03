"use strict";

window.mostrarNotificacion = function(mensaje, tipo = 'success') {
    const colors = {
        success: { bg: 'rgba(37,211,102,0.15)', border: 'rgba(37,211,102,0.4)', text: '#25d366' },
        error: { bg: 'rgba(231,76,60,0.15)', border: 'rgba(231,76,60,0.4)', text: '#e74c3c' },
        warning: { bg: 'rgba(241,196,15,0.15)', border: 'rgba(241,196,15,0.4)', text: '#f1c40f' },
        info: { bg: 'rgba(52,152,219,0.15)', border: 'rgba(52,152,219,0.4)', text: '#3498db' }
    };
    const theme = colors[tipo] || colors.info;
    const toast = document.createElement('div');
    toast.className = 'tm-toast';
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 10000;
        background: ${theme.bg}; border: 1px solid ${theme.border};
        color: ${theme.text}; padding: 12px 20px; border-radius: 12px;
        font-family: "DM Sans", sans-serif; font-size: 14px; font-weight: 600;
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        transition: all 0.3s ease; opacity: 0; transform: translateY(20px);
        pointer-events: none;
    `;
    toast.textContent = mensaje;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 10);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(20px)";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

function toggleDarkMode() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('tm_theme', isLight ? 'light' : 'dark');
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isLight ? '🌙' : '☀️';
}

function _initTema() {
    const pref = localStorage.getItem('tm_theme') || 'dark';
    if (pref === 'light') {
        document.body.classList.add('light-mode');
        const btn = document.querySelector('.theme-toggle');
        if (btn) btn.textContent = '🌙';
    } else {
        document.body.classList.remove('light-mode');
        const btn = document.querySelector('.theme-toggle');
        if (btn) btn.textContent = '☀️';
    }
}

window.abrirModalNotificaciones = function() {
    const overlay = document.getElementById('notifModalOverlay');
    if (overlay) {
        overlay.classList.add('activo');
        actualizarEstadoNotificacionesModal();
    }
};

window.cerrarModalNotificaciones = function() {
    const overlay = document.getElementById('notifModalOverlay');
    if (overlay) overlay.classList.remove('activo');
};

function actualizarEstadoNotificacionesModal() {
    const box = document.getElementById('notifEstadoBox');
    const icon = document.getElementById('notifEstadoIcono');
    const texto = document.getElementById('notifEstadoTexto');
    const sub = document.getElementById('notifEstadoSubtexto');
    const btn = document.getElementById('notifBotonAccion');
    if (!box) return;

    if (!('Notification' in window)) {
        box.className = 'notif-modal-estado bloqueado';
        icon.textContent = '❌';
        texto.textContent = 'No soportado';
        sub.textContent = 'Tu navegador no soporta notificaciones.';
        btn.style.display = 'none';
        return;
    }

    const status = Notification.permission;
    if (status === 'granted') {
        box.className = 'notif-modal-estado';
        icon.textContent = '✅';
        texto.textContent = 'Notificaciones Activas';
        sub.textContent = 'Estás suscrito a las novedades.';
        btn.textContent = '🚫 Desactivar Notificaciones';
        btn.className = 'notif-modal-boton desactivar';
    } else if (status === 'denied') {
        box.className = 'notif-modal-estado bloqueado';
        icon.textContent = '🚫';
        texto.textContent = 'Notificaciones Bloqueadas';
        sub.textContent = 'Has denegado el permiso en el navegador.';
        btn.style.display = 'none';
        document.getElementById('notifModalInfoBloqueado').style.display = 'block';
    } else {
        box.className = 'notif-modal-estado desactivado';
        icon.textContent = '🔔';
        texto.textContent = 'Notificaciones Desactivadas';
        sub.textContent = 'No hemos recibido permiso todavía.';
        btn.textContent = '🔔 Activar Notificaciones';
        btn.className = 'notif-modal-boton';
        document.getElementById('notifModalInfoBloqueado').style.display = 'none';
    }
}

// Initialize theme on load
document.addEventListener('DOMContentLoaded', _initTema);

window.setCurrency = function(moneda) {
    localStorage.setItem("monedaActual", moneda);
    document.getElementById("curUSD").classList.toggle("active", moneda === "USD");
    document.getElementById("curMN").classList.toggle("active", moneda === "MN");
    
    // Actualizar precios en toda la página si es necesario
    if (typeof renderizarProductos === 'function') {
        const cat = document.getElementById('tituloCategoriaActual')?.textContent || 'Todas';
        mostrarVistaCategoria(cat);
    }
    // Actualizar total del carrito si está abierto
    if (typeof renderizarCarrito === 'function') renderizarCarrito();
};

window.mostrarVistaMeGusta = function() {
    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaCategoria').style.display = 'none';
    document.getElementById('vistaPedidos').style.display = 'none';
    document.getElementById('vistaMeGusta').style.display = 'block';
    
    const grid = document.getElementById('meGustaGrid');
    if (grid) {
        const list = productos.filter(p => wishlist.includes(String(p.id)));
        if (list.length === 0) {
            document.getElementById('meGustaVacio').style.display = 'block';
            grid.innerHTML = '';
        } else {
            document.getElementById('meGustaVacio').style.display = 'none';
            grid.innerHTML = list.map(p => renderCardProducto(p)).join('');
        }
    }
};

window.cerrarVistaMeGusta = function() {
    document.getElementById('vistaMeGusta').style.display = 'none';
    document.getElementById('vistaInicio').style.display = 'block';
};

window.mostrarVistaPedidos = function() {
    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaCategoria').style.display = 'none';
    document.getElementById('vistaMeGusta').style.display = 'none';
    document.getElementById('vistaPedidos').style.display = 'block';
    // Lógica de pedidos (simulada o cargada de JSON)
    document.getElementById('pedidosLista').innerHTML = '<p style="text-align:center; color:#888;">No hay pedidos registrados localmente.</p>';
    document.getElementById('pedidosVacio').style.display = 'none';
};

window.cerrarVistaPedidos = function() {
    document.getElementById('vistaPedidos').style.display = 'none';
    document.getElementById('vistaInicio').style.display = 'block';
};

window.toggleNotificacionesTM = async function() {
    const status = Notification.permission;
    if (status === 'granted') {
        // Lógica para desuscibir o informar
        mostrarNotificacion('Las notificaciones ya están activas', 'info');
    } else {
        await solicitarNotificaciones();
        actualizarEstadoNotificacionesModal();
    }
};
