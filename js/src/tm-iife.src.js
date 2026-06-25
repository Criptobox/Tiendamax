/* ============================================================
   TiendaMax — módulo: tm-iife
   IIFEs finales: carrito abandonado, push notifications,
   panel notificaciones, botón subir, gallery preview admin.
   Extraído de tm-extras.src.js (L1926-2998, 1073 líneas)
   ============================================================ */

window.tmGrantAdminAccess = function () {
    usuarioAutenticado = true;
    cerrarLoginModal();
    abrirAdminPanel();
};

// Cargar tasa actualizada desde GitHub al iniciar
// FIX: cargarTasaDesdeGitHub se define en tm-patches.src.js que carga DESPUÉS
// de tm-iife (orden en index.html). Con defer, los scripts se ejecutan en orden
// del documento, así que al llegar a esta línea la función aún no existe.
function _tmInitTasaSiLista() {
    if (typeof cargarTasaDesdeGitHub === 'function') {
        cargarTasaDesdeGitHub();
        return true;
    }
    return false;
}
if (!_tmInitTasaSiLista()) {
    document.addEventListener('DOMContentLoaded', _tmInitTasaSiLista, { once: true });
    setTimeout(_tmInitTasaSiLista, 800);
}

// Refrescar tasa cada 20 min y al volver a la pestaña
(function() {
    let _lastTasa = parseFloat(localStorage.getItem('tasaMN') || '0');
    async function _checkTasa() {
        const prevTasa = parseFloat(localStorage.getItem('tasaMN') || '0');
        await cargarTasaDesdeGitHub();
        const newTasa = parseFloat(localStorage.getItem('tasaMN') || '0');
        if (newTasa > 0 && prevTasa > 0 && Math.abs(newTasa - prevTasa) >= 1) {
            const subio = newTasa > prevTasa;
            const diff = Math.round(Math.abs(newTasa - prevTasa));
            if (typeof mostrarNotificacion === 'function') {
                mostrarNotificacion(
                    `💱 Tasa actualizada: 1 USD = ${newTasa} MN (${subio ? '▲' : '▼'} ${diff})`,
                    subio ? 'warning' : 'info'
                );
            }
        }
    }
    setInterval(_checkTasa, 20 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _checkTasa();
    });
})();

// Guardar tasa desde panel admin → localStorage + GitHub
async function guardarTasaMNAdmin() {
    // Guardar WhatsApp si el input existe y tiene valor
    const waInput = document.getElementById('adminWhatsappNum');
    if (waInput && waInput.value.trim()) {
        const num = waInput.value.trim().replace(/\D/g, '');
        if (num && num.length >= 6) {
            localStorage.setItem('whatsappNumero', num);
            localStorage.setItem('whatsappNumber', num);
        }
    }

    const input = document.getElementById('adminTasaMN');
    const status = document.getElementById('tasaMNStatus');
    if (!input) return;
    const val = parseFloat(input.value);
    if (!val || val < 1) {
        if (status) status.textContent = '⚠️ Ingresa un valor válido';
        return;
    }
    localStorage.setItem('tasaMN', String(val));
    if (status) status.textContent = '💾 Guardado localmente...';
    // Subir a GitHub para que todos lo vean
    const ok = await guardarTasaEnGitHub(val);
    if (status) {
        status.textContent = ok
            ? `✅ Tasa ${val} MN/USD subida a GitHub. Clientes verán ${val + 10} MN/USD.`
            : '✅ Guardado local. Configura GitHub para sincronizar con todos.';
        status.style.color = ok ? '#2ECC71' : '#C9A96E';
    }
    // Actualizar precios en pantalla y burbuja de tasa
    if (_monedaActual === 'MN') actualizarPreciosMostrados();
    if (typeof actualizarBurbujaTasa === 'function') actualizarBurbujaTasa();
}



// ═══════════════════════════════════════════════════════
//  PARCHE DE ESTABILIDAD 2026-05-23
//  - Moneda robusta
//  - Grid de productos consistente
//  - Vistos recientes reactivado
// ═══════════════════════════════════════════════════════
(function () {
    function tmGetOfertaId() {
        return typeof getOfertaDiaId === 'function' ? getOfertaDiaId() : null;
    }

    function tmFiltrarProductosActuales() {
        let lista = Array.isArray(productos) ? productos.slice() : [];

        if (typeof categoriaSeleccionada !== 'undefined' && categoriaSeleccionada !== 'Todas') {
            lista = lista.filter(p => p.categoria === categoriaSeleccionada);
        }
        if (typeof categoriaSeleccionada !== 'undefined' && categoriaSeleccionada !== 'Todas' && typeof subcategoriaSeleccionada !== 'undefined' && subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
            lista = lista.filter(p => p.subcategoria === subcategoriaSeleccionada);
        }
        if (typeof _heroSearchActivo !== 'undefined' && _heroSearchActivo) {
            const q = _heroSearchActivo;
            lista = lista.filter(p =>
                (p.nombre || '').toLowerCase().includes(q) ||
                (p.descripcion || '').toLowerCase().includes(q) ||
                (p.categoria || '').toLowerCase().includes(q) ||
                (p.subcategoria || '').toLowerCase().includes(q)
            );
        }

        const ofertaId = tmGetOfertaId();
        if (ofertaId) {
            lista.sort((a, b) => {
                if (String(a.id) === String(ofertaId)) return -1;
                if (String(b.id) === String(ofertaId)) return 1;
                return 0;
            });
        }

        // Agotados al final — mismo orden que renderizarProductos
        lista.sort((a, b) => (a.stock === 0 ? 1 : 0) - (b.stock === 0 ? 1 : 0));

        if (typeof productosVisibleCount === 'number' && Number.isFinite(productosVisibleCount)) {
            lista = lista.slice(0, productosVisibleCount);
        }
        return lista;
    }

    function tmPostProcesarGridProductos() {
        const grid = document.getElementById('productosGrid');
        if (!grid) return;

        const lista = tmFiltrarProductosActuales();
        const cards = Array.from(grid.querySelectorAll('.producto-card'));

        cards.forEach((card, index) => {
            const pid = card.dataset.productId;
            const producto = pid
                ? productos.find(p => String(p.id) === pid)
                : lista[index];
            if (!producto) return;

            card.querySelectorAll('.precio-actual').forEach(el => {
                el.setAttribute('data-usd', String(producto.precioActual));
                el.textContent = typeof formatPrecio === 'function'
                    ? formatPrecio(producto.precioActual)
                    : ('$' + Number(producto.precioActual).toFixed(2) + ' USD');
            });

            if (producto.stock > 0 && producto.stock <= 3 && !card.querySelector('.badge-stock-urgente')) {
                const badge = document.createElement('div');
                badge.className = 'badge-stock-urgente';
                badge.textContent = '⚡ Últimas ' + producto.stock;
                badge.style.cssText = 'position:absolute;top:8px;left:8px;background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;box-shadow:0 2px 6px rgba(231,76,60,.4);z-index:3;letter-spacing:0.3px;';
                card.style.position = 'relative';
                card.appendChild(badge);
            }

            const vistas = typeof obtenerVistasProd === 'function' ? (obtenerVistasProd(producto.id) || 0) : 0;
            if (vistas >= 10 && !card.querySelector('.badge-vistas-pub')) {
                const vBadge = document.createElement('div');
                vBadge.className = 'badge-vistas-pub';
                vBadge.innerHTML = '👁️ ' + (vistas >= 1000 ? (vistas / 1000).toFixed(1) + 'k' : vistas);
                vBadge.style.cssText = 'position:absolute;bottom:54px;right:8px;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);color:white;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;z-index:3;';
                card.appendChild(vBadge);
            }

            if (typeof esProductoNuevo === 'function' && esProductoNuevo(producto) && !card.querySelector('.badge-nuevo')) {
                const badgeNuevo = document.createElement('div');
                badgeNuevo.className = 'badge-nuevo';
                badgeNuevo.textContent = '✨ Nuevo';
                const imgWrap = card.querySelector('.producto-image');
                if (imgWrap) imgWrap.appendChild(badgeNuevo);
                card.classList.add('tm-card-nueva');
            }

            if (producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual && !card.querySelector('.badge-rebajado')) {
                const pct = Math.round((1 - producto.precioActual / producto.precioOriginal) * 100);
                const imgWrap = card.querySelector('.producto-image');
                if (imgWrap) {
                    const b = document.createElement('div');
                    b.className = 'badge-rebajado';
                    b.textContent = '▼ ' + pct + '%';
                    imgWrap.appendChild(b);
                }
            }

            // Agrupar todos los badges de la esquina izquierda en columna vertical
            if (!card.querySelector('.tm-badges-col')) {
                const leftBadges = Array.from(card.querySelectorAll(
                    '.badge-vendido,.badge-agotado,.badge-oferta-dia,.badge-rebajado,.badge-stock-urgente,.badge-nuevo'
                ));
                if (leftBadges.length > 0) {
                    const col = document.createElement('div');
                    col.className = 'tm-badges-col';
                    card.appendChild(col);
                    leftBadges.forEach(function(b) {
                        b.style.cssText = '';
                        col.appendChild(b);
                    });
                }
            }
        });

        // Separador visual entre disponibles y agotados
        grid.querySelectorAll('.tm-agotados-header').forEach(el => el.remove());
        const agotadoCards = Array.from(grid.querySelectorAll('.card-agotado'));
        if (agotadoCards.length > 0) {
            const header = document.createElement('div');
            header.className = 'tm-agotados-header';
            const n = agotadoCards.length;
            header.innerHTML =
                '<div class="tm-ah-left">' +
                    '<span class="tm-ah-icon">📦</span>' +
                    '<div><div class="tm-ah-title">Sin stock</div>' +
                    '<div class="tm-ah-sub">Avísate cuando vuelvan</div></div>' +
                '</div>' +
                '<div class="tm-ah-count">' + n + ' producto' + (n === 1 ? '' : 's') + '</div>';
            agotadoCards[0].parentNode.insertBefore(header, agotadoCards[0]);
        }
    }

    function tmMasVendidosActuales() {
        const lista = productos.filter(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0);
        return lista.length > 0 ? lista : productos.filter(p => p.stock > 0).slice(0, 3);
    }

    function tmPostProcesarMasVendidos() {
        const grid = document.getElementById('masVendidosGrid');
        if (!grid) return;
        const lista = tmMasVendidosActuales();
        const cards = Array.from(grid.querySelectorAll('.producto-card'));
        const cd = typeof getActiveCountdown === 'function' ? getActiveCountdown() : null;

        cards.forEach((card, index) => {
            const pid = card.dataset.productId;
            const producto = pid
                ? productos.find(p => String(p.id) === pid)
                : lista[index];
            if (!producto) return;
            card.querySelectorAll('.precio-actual').forEach(el => {
                el.setAttribute('data-usd', String(producto.precioActual));
                el.textContent = typeof formatPrecio === 'function'
                    ? formatPrecio(producto.precioActual)
                    : ('$' + Number(producto.precioActual).toFixed(2) + ' USD');
            });

            if (producto.stock === 0) {
                const stockCount = card.querySelector('.stock-count span');
                if (stockCount) stockCount.textContent = '❌ Producto agotado';
                const stockBar = card.querySelector('.stock-bar-fill');
                if (stockBar) stockBar.style.width = '8%';
                const btn = card.querySelector('.btn-pedir-card');
                if (btn) {
                    btn.textContent = 'No disponible';
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                }
            }

            if (cd && String(cd.productId) === String(producto.id) && !card.querySelector('.producto-countdown') && typeof renderCountdownHtml === 'function') {
                const btn = card.querySelector('.btn-pedir-card');
                if (btn) {
                    const wrap = document.createElement('div');
                    wrap.innerHTML = renderCountdownHtml(producto.id);
                    if (wrap.firstElementChild) card.insertBefore(wrap.firstElementChild, btn);
                }
            }
        });

        if (typeof iniciarCountdownsActivos === 'function') {
            setTimeout(iniciarCountdownsActivos, 50);
        }
    }

    const _tmRenderProductosPrev = renderizarProductos;
    renderizarProductos = function () {
        _tmRenderProductosPrev.apply(this, arguments);
        tmPostProcesarGridProductos();
        if (typeof iniciarCountdownsActivos === 'function') setTimeout(iniciarCountdownsActivos, 50);
        if (typeof initScrollAnimations === 'function') setTimeout(initScrollAnimations, 20);
    };

    const _tmRenderMasVendidosPrev = renderizarMasVendidos;
    renderizarMasVendidos = function () {
        _tmRenderMasVendidosPrev.apply(this, arguments);
        tmPostProcesarMasVendidos();
    };

    actualizarPreciosMostrados = function () {
        document.querySelectorAll('.precio-actual').forEach(el => {
            let usd = parseFloat(el.getAttribute('data-usd') || '');
            if (!Number.isFinite(usd)) {
                const card = el.closest('.producto-card');
                const productId = card && card.dataset ? card.dataset.productId : '';
                const producto = productId ? productos.find(p => String(p.id) === String(productId)) : null;
                if (producto) {
                    usd = Number(producto.precioActual);
                    el.setAttribute('data-usd', String(usd));
                }
            }
            if (Number.isFinite(usd)) {
                el.textContent = typeof formatPrecio === 'function'
                    ? formatPrecio(usd)
                    : ('$' + usd.toFixed(2) + ' USD');
            }
        });

        const detailPrice = document.getElementById('detailPriceActual');
        if (detailPrice && _detalleProductoActual) {
            detailPrice.setAttribute('data-usd', String(_detalleProductoActual.precioActual));
            detailPrice.textContent = typeof formatPrecio === 'function'
                ? formatPrecio(_detalleProductoActual.precioActual)
                : ('$' + Number(_detalleProductoActual.precioActual).toFixed(2) + ' USD');
        }
    };

    // (FIX) Override eliminado: ahora renderizarRecientes funciona de verdad
    // y muestra los productos vistos en home y en detalle.

    // ── Mejora 4: chip-slider animado para filtro de categorías ──
    function _tmSliderInit() {
        const wrap = document.getElementById('categoriaFiltro');
        if (!wrap) return;
        wrap.querySelectorAll('.categoria-btn').forEach(btn => {
            if (!btn.dataset.tmCat) btn.dataset.tmCat = btn.textContent.trim();
        });
        let pill = document.getElementById('tm-chip-slider');
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'tm-chip-slider';
            wrap.insertBefore(pill, wrap.firstChild);
        }
        pill.style.transition = 'none';
        _tmSliderMover();
        requestAnimationFrame(() => { pill.style.transition = ''; });
    }

    function _tmSliderMover() {
        const wrap = document.getElementById('categoriaFiltro');
        const pill = document.getElementById('tm-chip-slider');
        if (!wrap || !pill) return;
        const active = wrap.querySelector('.categoria-btn.active');
        if (!active) { pill.style.opacity = '0'; return; }
        const wRect = wrap.getBoundingClientRect();
        const aRect = active.getBoundingClientRect();
        pill.style.opacity = '1';
        pill.style.top = active.offsetTop + 'px';
        pill.style.left = (aRect.left - wRect.left + wrap.scrollLeft) + 'px';
        pill.style.width = aRect.width + 'px';
        pill.style.height = active.offsetHeight + 'px';
    }

    if (typeof actualizarBotonesCategorias === 'function') {
        const _origActBotones = actualizarBotonesCategorias;
        actualizarBotonesCategorias = function() {
            _origActBotones.apply(this, arguments);
            _tmSliderInit();
        };
    }

    if (typeof filtrarPorCategoria === 'function') {
    const _origFiltrar = filtrarPorCategoria;
    filtrarPorCategoria = function(cat) {
        categoriaSeleccionada = cat;
        const container = document.getElementById('categoriaFiltro');
        if (container) {
            container.querySelectorAll('.categoria-btn').forEach(btn => {
                btn.classList.toggle('active', (btn.dataset.tmCat || btn.textContent.trim()) === cat);
            });
            _tmSliderMover();
        }
        renderizarProductos();
        const titulo = document.getElementById('tituloCategoriaActual');
        if (titulo) {
            const icono = typeof obtenerIconoCategoria === 'function' ? obtenerIconoCategoria(cat) : '';
            titulo.textContent = cat === 'Todas' ? '🛍️ Todos los Productos' : (icono + ' ' + cat);
        }
    };
    } // end typeof filtrarPorCategoria guard

    // ── Pull-to-refresh ──
    (function() {
        const THRESHOLD = 80;
        let startY = 0, pulling = false, active = false;
        const ptr = document.createElement('div');
        ptr.className = 'tm-ptr';
        ptr.innerHTML = '<span class="tm-ptr-icon">↓</span><span class="tm-ptr-txt">Desliza para actualizar</span>';
        document.body.appendChild(ptr);
        const txt = ptr.querySelector('.tm-ptr-txt');

        document.addEventListener('touchstart', function(e) {
            if (window.scrollY > 0) return;
            startY = e.touches[0].clientY;
            pulling = true;
        }, { passive: true });

        document.addEventListener('touchmove', function(e) {
            if (!pulling) return;
            const dy = e.touches[0].clientY - startY;
            if (dy < 10) return;
            active = true;
            ptr.classList.add('tm-ptr-visible');
            ptr.classList.toggle('tm-ptr-ready', dy >= THRESHOLD);
            txt.textContent = dy >= THRESHOLD ? 'Suelta para actualizar' : 'Desliza para actualizar';
        }, { passive: true });

        document.addEventListener('touchend', function() {
            if (!active) { pulling = false; return; }
            const wasReady = ptr.classList.contains('tm-ptr-ready');
            ptr.classList.remove('tm-ptr-ready');
            if (wasReady) {
                ptr.classList.add('tm-ptr-loading');
                ptr.querySelector('.tm-ptr-icon').textContent = '↻';
                txt.textContent = 'Actualizando...';
                setTimeout(function() {
                    if (typeof renderizarProductos === 'function') renderizarProductos();
                    ptr.classList.remove('tm-ptr-loading', 'tm-ptr-visible');
                    ptr.querySelector('.tm-ptr-icon').textContent = '↓';
                    txt.textContent = 'Desliza para actualizar';
                }, 800);
            } else {
                ptr.classList.remove('tm-ptr-visible');
            }
            pulling = false; active = false;
        }, { passive: true });
    })();

    // ── Lazy load fade-in ──
    (function() {
        var obs = typeof IntersectionObserver !== 'undefined' && new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                if (!e.isIntersecting) return;
                var img = e.target;
                if (img.complete) {
                    img.classList.add('tm-vis');
                } else {
                    img.addEventListener('load', function() { img.classList.add('tm-vis'); }, { once: true });
                    img.addEventListener('error', function() { img.classList.add('tm-vis'); }, { once: true });
                }
                obs.unobserve(img);
            });
        }, { rootMargin: '80px' });

        function _tmObserveImgs() {
            if (!obs) return;
            document.querySelectorAll('.producto-image img:not(.tm-img-observe)').forEach(function(img) {
                img.classList.add('tm-img-observe');
                obs.observe(img);
            });
        }

        if (typeof renderizarProductos === 'function') {
            const _origRender = renderizarProductos;
            renderizarProductos = function() {
                _origRender.apply(this, arguments);
                setTimeout(_tmObserveImgs, 30);
            };
        }

        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(_tmObserveImgs, 300);
        });
    })();

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () {
            if (typeof renderizarRecientes === 'function') renderizarRecientes();
            if (typeof actualizarPreciosMostrados === 'function') actualizarPreciosMostrados();
            if (typeof actualizarBadgeStockBajo === 'function') actualizarBadgeStockBajo();
            if (typeof initScrollAnimations === 'function') initScrollAnimations();
            if (typeof verificarEstadoBackend === 'function') verificarEstadoBackend();
            if (typeof cargarEstadoPublicacion === 'function') cargarEstadoPublicacion();
        }, 150);
    });
})();




// === Soporte para shortcut "?admin=1" del manifest PWA ===
(function() {
    try {
        const params = new URLSearchParams(location.search);
        if (params.get('admin') === '1') {
            setTimeout(() => {
                if (typeof abrirLoginAdmin === 'function') abrirLoginAdmin();
            }, 600);
        }
    } catch(e) {}
})();


// === popstate: cerrar modal de producto al pulsar "Atrás" del navegador/móvil ===
window.addEventListener('popstate', function() {
    const modal = document.getElementById('productDetailModal');
    if (modal && !modal.classList.contains('hidden')) {
        // FIX: el nombre correcto es cerrarDetalleModal, no cerrarDetalleProducto
        if (typeof cerrarDetalleModal === 'function') {
            cerrarDetalleModal();
        } else {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            if (typeof _detalleProductoActual !== 'undefined') _detalleProductoActual = null;
        }
    }
});

// ═══════════════════════════════════════════════════════════
//  🔔 PANEL DE CONTROL DE NOTIFICACIONES (modal con ON/OFF)
//
//  Funciones expuestas globalmente:
//    - abrirModalNotificaciones()
//    - cerrarModalNotificaciones()
//    - toggleNotificacionesTM()
//
//  Estado:
//    - 'granted'   → permiso concedido, hay token, ACTIVO
//    - 'denied'    → bloqueado por usuario (no se puede repedir)
//    - 'default'   → nunca decidió
//    - 'no-token'  → permiso OK pero sin token registrado
// ═══════════════════════════════════════════════════════════

(function tmPanelNotificaciones() {
    'use strict';

    let _estadoActual = 'desconocido';

    // Detecta el estado actual de notificaciones
    function detectarEstadoNotif() {
        if (!('Notification' in window)) return 'no-soporta';
        if (Notification.permission === 'denied') return 'bloqueado';
        if (Notification.permission === 'default') return 'sin-decidir';
        // permission === 'granted'
        const tokenLocal = localStorage.getItem('fcmToken');
        if (!tokenLocal) return 'sin-token';
        return 'activo';
    }

    // Actualiza el ícono del header según el estado
    function actualizarIconoHeader() {
        const btn = document.getElementById('notifHeaderBtn');
        const icon = document.getElementById('notifHeaderIcon');
        if (!btn) return;

        const estado = detectarEstadoNotif();
        _estadoActual = estado;

        btn.classList.remove('activo', 'desactivado', 'bloqueado');

        // SVG del ícono según estado
        if (estado === 'activo') {
            btn.classList.add('activo');
            btn.title = 'Notificaciones activas (toca para gestionar)';
            // Campana rellena con onda
            if (icon) icon.innerHTML = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="6" r="3" fill="#25d366" stroke="#0e0e12" stroke-width="1.5"/>';
        } else if (estado === 'bloqueado') {
            btn.classList.add('bloqueado');
            btn.title = 'Notificaciones bloqueadas (toca para ver cómo activarlas)';
            // Campana tachada
            if (icon) icon.innerHTML = '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
            btn.classList.add('desactivado');
            btn.title = 'Activar notificaciones';
            if (icon) icon.innerHTML = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>';
        }
    }

    // Abre el modal y actualiza el estado mostrado
    window.abrirModalNotificaciones = function() {
        const overlay = document.getElementById('notifModalOverlay');
        if (!overlay) return;
        overlay.classList.add('activo');
        document.body.style.overflow = 'hidden';
        actualizarModalNotif();
    };

    window.cerrarModalNotificaciones = function() {
        const overlay = document.getElementById('notifModalOverlay');
        if (!overlay) return;
        overlay.classList.remove('activo');
        document.body.style.overflow = '';
    };

    // Refresca el contenido del modal según estado
    function actualizarModalNotif() {
        const estado = detectarEstadoNotif();
        _estadoActual = estado;

        const box      = document.getElementById('notifEstadoBox');
        const icono    = document.getElementById('notifEstadoIcono');
        const texto    = document.getElementById('notifEstadoTexto');
        const subtexto = document.getElementById('notifEstadoSubtexto');
        const boton    = document.getElementById('notifBotonAccion');
        const infoBlock = document.getElementById('notifModalInfoBloqueado');

        if (!box || !boton) return;

        box.classList.remove('desactivado', 'bloqueado');
        infoBlock.style.display = 'none';

        if (estado === 'no-soporta') {
            icono.textContent = '⚠️';
            texto.textContent = 'No soportado';
            subtexto.textContent = 'Tu navegador no soporta notificaciones push.';
            boton.textContent = 'Cerrar';
            boton.onclick = cerrarModalNotificaciones;
            boton.classList.add('desactivar');
            box.classList.add('bloqueado');
            return;
        }

        if (estado === 'bloqueado') {
            box.classList.add('bloqueado');
            icono.textContent = '🚫';
            texto.textContent = 'Bloqueadas en el navegador';
            subtexto.textContent = 'Tienes que reactivarlas desde ajustes del navegador.';
            boton.textContent = 'Entendido';
            boton.onclick = cerrarModalNotificaciones;
            boton.classList.add('desactivar');
            infoBlock.style.display = 'block';
            return;
        }

        if (estado === 'activo') {
            icono.textContent = '🔔';
            texto.textContent = 'Notificaciones ACTIVAS';
            subtexto.textContent = 'Recibirás ofertas, productos nuevos y cambios de tasa';
            boton.textContent = '🔕 Desactivar notificaciones';
            boton.classList.add('desactivar');
            boton.onclick = toggleNotificacionesTM;
            return;
        }

        // sin-decidir o sin-token
        box.classList.add('desactivado');
        icono.textContent = '🔕';
        texto.textContent = 'Notificaciones APAGADAS';
        subtexto.textContent = 'Te estás perdiendo las ofertas relámpago 🔥';
        boton.textContent = '🔔 Activar notificaciones';
        boton.classList.remove('desactivar');
        boton.onclick = toggleNotificacionesTM;
    }

    // Toggle: activa o desactiva según estado actual
    window.toggleNotificacionesTM = async function() {
        const boton = document.getElementById('notifBotonAccion');
        const estado = detectarEstadoNotif();

        if (estado === 'no-soporta' || estado === 'bloqueado') {
            cerrarModalNotificaciones();
            return;
        }

        if (estado === 'activo') {
            // ─── DESACTIVAR ───
            boton.disabled = true;
            boton.textContent = '⏳ Desactivando...';
            try {
                await desuscribirFCM();
                if (typeof mostrarNotificacion === 'function') {
                    mostrarNotificacion('🔕 Notificaciones desactivadas', 'info');
                }
            } catch (e) {
                console.error('[notif] Error desuscribiendo:', e);
                if (typeof mostrarNotificacion === 'function') {
                    mostrarNotificacion('⚠️ Error al desactivar: ' + e.message, 'error');
                }
            }
            boton.disabled = false;
            actualizarModalNotif();
            actualizarIconoHeader();
            return;
        }

        // ─── ACTIVAR ───
        boton.disabled = true;
        boton.textContent = '⏳ Activando...';

        try {
            // [FIX] El usuario activa voluntariamente — limpiar flag de desuscripción manual
            localStorage.removeItem('tm_push_desuscrito');
            // Notificar al SW para que limpie el flag en IndexedDB
            try {
                const swReg = await navigator.serviceWorker.ready;
                if (swReg && swReg.active) swReg.active.postMessage({ type: 'TM_CLEAR_DESUSCRITO' });
            } catch(e) {}

            // Pedir permiso del navegador si aún no está concedido
            if (Notification.permission !== 'granted') {
                const perm = await Notification.requestPermission();
                if (perm === 'denied') {
                    if (typeof mostrarNotificacion === 'function') {
                        mostrarNotificacion('🚫 Bloqueado. Ve a ajustes del navegador.', 'error');
                    }
                    actualizarModalNotif();
                    actualizarIconoHeader();
                    boton.disabled = false;
                    return;
                }
                if (perm !== 'granted') {
                    boton.disabled = false;
                    actualizarModalNotif();
                    return;
                }
            }

            // Inicializar FCM y registrar token
            if (typeof tmRegistrarTokenFCMSiPermitido === 'function') {
                await tmRegistrarTokenFCMSiPermitido();
            } else if (typeof inicializarFirebaseFCMClient === 'function') {
                let fbConfig = null;
                try {
                    const raw = localStorage.getItem('firebaseConfig');
                    if (raw) fbConfig = JSON.parse(raw);
                } catch(e) {}
                if (!fbConfig || !fbConfig.projectId) {
                    const r = await fetch('config.json?_=' + Date.now());
                    if (r.ok) {
                        const cfg = await r.json();
                        fbConfig = cfg.firebaseConfig;
                        if (fbConfig) localStorage.setItem('firebaseConfig', JSON.stringify(fbConfig));
                    }
                }
                if (fbConfig && fbConfig.projectId) {
                    await inicializarFirebaseFCMClient(fbConfig);
                }
            }

            // Esperar un poquito a que el token se guarde
            await new Promise(r => setTimeout(r, 1500));

            const nuevoEstado = detectarEstadoNotif();
            if (nuevoEstado === 'activo') {
                if (typeof mostrarNotificacion === 'function') {
                    mostrarNotificacion('🔔 ¡Notificaciones activadas!', 'success');
                }
                // Mostrar push de bienvenida local
                try {
                    const reg = await navigator.serviceWorker.ready;
                    reg.showNotification('✅ TiendaMax activado', {
                        body: 'Te avisaremos de ofertas y productos nuevos.',
                        icon: '/iconos/icon-192.png',
                        badge: '/iconos/icon-192.png',
                        vibrate: [200, 100, 200],
                        tag: 'tm-bienvenida'
                    });
                } catch(e) {}
            } else {
                if (typeof mostrarNotificacion === 'function') {
                    mostrarNotificacion('⚠️ No se pudo completar. Reintenta.', 'error');
                }
            }
        } catch(e) {
            console.error('[notif] Error activando:', e);
            if (typeof mostrarNotificacion === 'function') {
                const raw = (e.message || '').toLowerCase();
                const msg = (raw.includes('fetch') || raw.includes('network') || raw.includes('conexión'))
                    ? 'Sin conexión. Verifica tu internet e inténtalo de nuevo.'
                    : (e.message || 'Error desconocido');
                mostrarNotificacion('❌ ' + msg, 'error');
            }
        }

        boton.disabled = false;
        actualizarModalNotif();
        actualizarIconoHeader();
    };

    // Desuscribir: borra token de Firebase RTDB + revoca FCM
    async function desuscribirFCM() {
        const tokenLocal = localStorage.getItem('fcmToken');

        // 1. Borrar de Firebase Realtime Database
        if (tokenLocal) {
            try {
                let fbConfig = null;
                const raw = localStorage.getItem('firebaseConfig');
                if (raw) fbConfig = JSON.parse(raw);
                if (!fbConfig) {
                    const r = await fetch('config.json?_=' + Date.now());
                    if (r.ok) fbConfig = (await r.json()).firebaseConfig;
                }
                if (fbConfig && fbConfig.databaseURL) {
                    const legacyTokenId = btoa(tokenLocal).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
                    const fingerprint = (typeof tmPushDeviceFingerprint === 'function') ? tmPushDeviceFingerprint() : null;
                    const ids = new Set([legacyTokenId, fingerprint].filter(Boolean));
                    // Borrar también tokens viejos/legacy del mismo navegador. Si no,
                    // al desactivar se elimina el registro nuevo con fingerprint pero queda
                    // uno viejo sin fingerprint y el contador parece subir en vez de bajar.
                    try {
                        const allRes = await fetch(fbConfig.databaseURL + '/tokens.json?_=' + Date.now(), { cache: 'no-store' });
                        if (allRes.ok) {
                            const allData = await allRes.json();
                            if (allData && typeof allData === 'object') {
                                Object.keys(allData).forEach(k => {
                                    const t = allData[k];
                                    if (t && (t.fingerprint === fingerprint || t.token === tokenLocal || t.userAgent === navigator.userAgent)) ids.add(k);
                                });
                            }
                        }
                    } catch(e) {}
                    await Promise.allSettled(Array.from(ids).map(id => fetch(fbConfig.databaseURL + '/tokens/' + id + '.json', { method: 'DELETE' })));
                }
            } catch(e) {
                console.warn('[notif] Error borrando token de RTDB:', e);
            }
        }

        // 2. Borrar de localStorage
        localStorage.removeItem('fcmToken');
        // [FIX] Marcar que el usuario se desuscribió manualmente para evitar re-registro al recargar
        localStorage.setItem('tm_push_desuscrito', '1');
        // Notificar al SW para que guarde el flag en IndexedDB (localStorage no disponible en SW)
        try {
            const swReg = await navigator.serviceWorker.ready;
            if (swReg && swReg.active) swReg.active.postMessage({ type: 'TM_SET_DESUSCRITO' });
        } catch(e) {}
        // Actualizar contador de suscriptores local
        if (typeof tmDesregistrarSuscriptor === 'function') tmDesregistrarSuscriptor();

        // 3. [FIX] deleteToken() eliminado — causaba re-registro automático del token
        //    El DELETE en Firebase RTDB (paso 1) es suficiente para dejar de recibir pushes.

        // 4. Limpiar el flag del banner para que no aparezca otra vez al instante
        localStorage.setItem('tm_push_pospuesto', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    }

    // Cerrar modal con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('notifModalOverlay');
            if (overlay && overlay.classList.contains('activo')) {
                cerrarModalNotificaciones();
            }
        }
    });

    // Actualizar ícono al cargar y cada vez que cambie el estado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', actualizarIconoHeader);
    } else {
        actualizarIconoHeader();
    }
    // Refrescar el ícono cada 5 segundos por si cambió el permiso en otra pestaña
    setInterval(actualizarIconoHeader, 5000);

    // Exponer para depuración
    window._tmNotif = {
        actualizarIconoHeader,
        actualizarModalNotif,
        detectarEstadoNotif,
        desuscribirFCM
    };
})();

// ═══════════════════════════════════════════════════════════
//  ⬆️ BOTÓN "SUBIR ARRIBA" flotante — DESHABILITADO
//  Se quitó para poner el bot Max en esa posición (bottom-left).
//  El botón de tema (claro/oscuro) vuelve a su posición flotante bottom-right.
//  Para reactivar: cambiar `false &&` por `true ||` abajo.
// ═══════════════════════════════════════════════════════════
if (false) (function tmBotonSubirArriba() {
    'use strict';

    function crearBoton() {
        if (document.getElementById('tm-subir-arriba')) return;
        const btn = document.createElement('button');
        btn.id = 'tm-subir-arriba';
        btn.setAttribute('aria-label', 'Subir al inicio de la página');
        btn.title = 'Subir arriba';
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
        btn.style.cssText = [
            'position:fixed',
            'bottom:20px',
            'left:16px',
            'width:48px',
            'height:48px',
            'border-radius:50%',
            'background:linear-gradient(135deg,#ff6a00,#ff3d00)',
            'color:#fff',
            'border:none',
            'box-shadow:0 6px 20px rgba(255,106,0,.45)',
            'cursor:pointer',
            'opacity:0',
            'visibility:hidden',
            'transform:translateY(20px) scale(.85)',
            'transition:opacity .3s,transform .3s,visibility .3s',
            'z-index:9998',
            'display:flex',
            'align-items:center',
            'justify-content:center'
        ].join(';');
        btn.onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        document.body.appendChild(btn);
        return btn;
    }

    function mostrarOcultar() {
        const btn = document.getElementById('tm-subir-arriba') || crearBoton();
        if (!btn) return;
        const debeMostrar = window.scrollY > window.innerHeight * 1.2;
        if (debeMostrar) {
            btn.style.opacity = '1';
            btn.style.visibility = 'visible';
            btn.style.transform = 'translateY(0) scale(1)';
        } else {
            btn.style.opacity = '0';
            btn.style.visibility = 'hidden';
            btn.style.transform = 'translateY(20px) scale(.85)';
        }
    }

    function init() {
        crearBoton();
        window.addEventListener('scroll', mostrarOcultar, { passive: true });
        mostrarOcultar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ═══════════════════════════════════════════════════════
//  📲 BANNER DE INSTALACIÓN PWA PERSONALIZADO
//  Reemplaza el cartel naranja por defecto del navegador
//  por uno premium que combina con el de notificaciones.
// ═══════════════════════════════════════════════════════
(function () {
    'use strict';
    var deferredPrompt = null;
    var DISMISS_KEY = 'pwaInstallDismissed';
    var DISMISS_DIAS = 2;

    function yaInstalada() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }

    function descartadaRecientemente() {
        try {
            var t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
            return t && (Date.now() - t) < DISMISS_DIAS * 24 * 60 * 60 * 1000;
        } catch (e) { return false; }
    }

    function esc(s) {
        return (typeof escapeHtml === 'function')
            ? escapeHtml(s)
            : String(s).replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
              });
    }

    function mostrarBannerInstalar() {
        if (document.getElementById('tm-install-banner-wrap')) return;
        if (yaInstalada() || descartadaRecientemente()) return;

        // Asegurar animación (reutiliza la del banner de notificaciones)
        if (!document.getElementById('slideUpBannerStyle')) {
            var s = document.createElement('style');
            s.id = 'slideUpBannerStyle';
            s.textContent = '@keyframes slideUpBanner{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
            document.head.appendChild(s);
        }

        var wrap = document.createElement('div');
        wrap.id = 'tm-install-banner-wrap';
        wrap.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 20px);z-index:2000;width:min(92vw,380px);max-width:380px';
        wrap.innerHTML =
            '<div style="background:#1a1a1a;border:1.5px solid rgba(255,107,53,.5);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:sans-serif;animation:slideUpBanner .35s ease">' +
                '<span style="font-size:26px;flex-shrink:0">📲</span>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-weight:700;font-size:14px;color:#FF6B35;margin-bottom:2px">' + esc('Instala TiendaMax') + '</div>' +
                    '<div style="font-size:12px;color:#aaa;line-height:1.3">' + esc('Acceso directo desde tu pantalla de inicio, más rápido y sin ocupar espacio.') + '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">' +
                    '<button id="tm-install-si" style="background:#FF6B35;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Instalar</button>' +
                    '<button id="tm-install-no" style="background:none;border:none;color:#666;font-size:11px;cursor:pointer;text-align:center">Ahora no</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(wrap);

        document.getElementById('tm-install-si').onclick = async function () {
            wrap.remove();
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            try { await deferredPrompt.userChoice; } catch (e) {}
            deferredPrompt = null;
        };
        document.getElementById('tm-install-no').onclick = function () {
            wrap.remove();
            try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
        };
    }

    // Exponer para que el banner de notificaciones lo active en secuencia
    window._tmMostrarInstall = mostrarBannerInstalar;

    // Capturar el evento y bloquear el cartel naranja por defecto del navegador
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        // Mostrar/actualizar botón en el menú de navegación
        _mostrarBtnInstalarMenu();
        // Si notificaciones ya están resueltas (no habrá banner push), mostrar install después de 20s
        if (!('Notification' in window) || Notification.permission !== 'default') {
            setTimeout(mostrarBannerInstalar, 20000);
        }
    });

    // Botón de instalación en el menú móvil
    function _mostrarBtnInstalarMenu() {
        if (yaInstalada()) return;
        if (document.getElementById('tm-install-menu-btn')) return;
        var menu = document.getElementById('mobileMenuOverlay');
        if (!menu) return;
        var btn = document.createElement('button');
        btn.id = 'tm-install-menu-btn';
        btn.type = 'button';
        btn.className = 'nav-mobile-link';
        btn.style.cssText = 'color:#C9A96E;font-weight:700;';
        btn.textContent = '📲 Instalar app';
        btn.onclick = function () {
            document.getElementById('mobileMenuOverlay').classList.remove('open');
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function () { deferredPrompt = null; }).catch(function () {});
            } else {
                mostrarBannerInstalar();
            }
        };
        // Insertar antes de mobile-menu-actions
        var actions = menu.querySelector('.mobile-menu-actions');
        if (actions) menu.insertBefore(btn, actions);
        else menu.appendChild(btn);
    }

    // Si se instala, limpiar
    window.addEventListener('appinstalled', function () {
        var w = document.getElementById('tm-install-banner-wrap');
        if (w) w.remove();
        deferredPrompt = null;
        try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    });
})();

// ── Gallery preview para Agregar producto ───────────────────────
(function () {
    function initGalleryPreview() {
        var inp = document.getElementById('productImagesExtra');
        var container = document.getElementById('galleryThumbsPreview');
        if (!inp || !container) return;
        inp.addEventListener('change', function () {
            container.innerHTML = '';
            Array.from(this.files).slice(0, 8).forEach(function (file) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    var wrap = document.createElement('div');
                    wrap.className = 'gal';
                    var img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
                    var x = document.createElement('span');
                    x.textContent = '×';
                    x.onclick = function () { wrap.remove(); };
                    wrap.appendChild(img);
                    wrap.appendChild(x);
                    container.appendChild(wrap);
                };
                reader.readAsDataURL(file);
            });
        });
        // Reset gallery on form reset
        var form = document.getElementById('productForm');
        if (form) form.addEventListener('reset', function () { container.innerHTML = ''; });
    }
    document.addEventListener('DOMContentLoaded', initGalleryPreview);
})();
