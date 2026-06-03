"use strict";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load products
    await cargarProductos();
    
    // 2. Init UI
    actualizarContadorCarrito();
    actualizarBadgeCorazon();
    renderizarRecientes();

    // 3. Other initializations
    if (typeof _initTema === 'function') _initTema();
});

// Global event delegation for actions like data-action
document.addEventListener('click', e => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const arg = target.getAttribute('data-arg');

    if (action === 'volverAlInicio') {
        document.getElementById('vistaCategoria').style.display = 'none';
        document.getElementById('vistaInicio').style.display = 'block';
        document.getElementById('vistaMeGusta').style.display = 'none';
        document.getElementById('vistaPedidos').style.display = 'none';
    } else if (action === 'mostrarVistaCategoria') {
        mostrarVistaCategoria(arg || 'Todas');
    } else if (action === 'abrirCarrito') {
        abrirCarrito();
    } else if (action === 'cerrarCarrito') {
        cerrarCarrito();
    } else if (action === 'comprarCarrito') {
        comprarCarrito();
    } else if (action === 'limpiarCarrito') {
        limpiarCarrito();
    } else if (action === 'abrirLoginAdmin') {
        abrirLoginAdmin();
    } else if (action === 'scrollToProductos') {
        document.getElementById('mas-vendidos').scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'contactarWhatsApp') {
        const num = localStorage.getItem('whatsappNumero') || '5354320170';
        window.open(`https://wa.me/${num}?text=Hola, quiero más información`, '_blank');
    }
});
