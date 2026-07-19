/* ============================================================
   TiendaMax — módulo: tm-config
   Globals, constantes, helper sanitización HTML (anti-XSS)
   Extraído de script.src.js (L1–L924, 924 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

'use strict';
// ===== VARIABLES GLOBALES INICIALIZADAS TEMPRANO (evitar TDZ) =====
var countdownIntervals = {};
let _monedaActual = localStorage.getItem('monedaActual') || 'USD';
function tmMonedaActual(){ return _monedaActual; }

// ===== HELPER: JSON.parse SEGURO (anti-crash si localStorage se corrompe) =====
// Uso: tmParse(localStorage.getItem('productos'), [])
//      tmParse('{"foo":1}', {})  →  {foo:1}
//      tmParse('INVALID', [])    →  []  (no crashea)
function tmParse(jsonStr, fallback) {
    if (jsonStr == null || jsonStr === '') return fallback;
    try {
        var parsed = JSON.parse(jsonStr);
        return (parsed === null || parsed === undefined) ? fallback : parsed;
    } catch (e) {
        // No relanzar: devolver fallback silenciosamente.
        // (el caller decide si loguear; por defecto no, para no spamear consola)
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[tmParse] JSON inválido, usando fallback:', e.message);
        }
        return fallback;
    }
}
// Alias global por si otros scripts lo necesitan
window.tmParse = tmParse;
// Helper adicional: parsear JSON de localStorage garantizando tipo array.
// Uso: tmParseArray(localStorage.getItem('productos'))  →  siempre devuelve []
function tmParseArray(jsonStr) {
    var v = tmParse(jsonStr, []);
    return Array.isArray(v) ? v : [];
}
window.tmParseArray = tmParseArray;
// Helper adicional: parsear JSON de localStorage garantizando tipo objeto.
function tmParseObject(jsonStr) {
    var v = tmParse(jsonStr, {});
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

// ===== VENDIDOS REALES (badge "🔥 N vendidos") =====
// vendidos.json lo agrega scripts/build_vendidos.py desde /ventas de Firebase
// cada 3h (ver build-vendidos.yml). A diferencia de "masVendido" (flag manual
// que activa el admin con ⭐), esto es la cantidad real vendida por producto.
// Fetch fire-and-forget: las tarjetas ya se re-renderizan varias veces
// durante la carga, así que no hace falta bloquear nada por esto.
window._tmVendidos = {};
function _tmVendidosCount(id) {
    var v = window._tmVendidos[String(id)];
    return typeof v === 'number' ? v : 0;
}
(function () {
    fetch('vendidos.json?_=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (data && data.por_producto && typeof data.por_producto === 'object' &&
                Object.keys(data.por_producto).length > 0) {
                window._tmVendidos = data.por_producto;
                // Las tarjetas ya se pintaron ANTES de que este fetch resolviera
                // (es fire-and-forget para no bloquear el primer render) — sin
                // este re-render el badge de "N vendidos" nunca llegaba a
                // aparecer aunque los datos ya estuvieran cargados.
                if (typeof renderizarProductos === 'function') renderizarProductos();
                if (typeof renderizarMasVendidos === 'function') renderizarMasVendidos();
            }
        })
        .catch(function () { /* silencioso: el badge simplemente no aparece */ });
})();
window.tmParseObject = tmParseObject;

// ===== CONSTANTES DE CONFIGURACIÓN =====
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutos de bloqueo tras intentos fallidos
const PUSH_BANNER_DELAY_MS = 45000; // 45 segundos antes de mostrar banner de notificaciones
const PUSH_BANNER_DENY_DELAY_HOURS = 6; // 6 horas si el usuario deniega permisos
const PUSH_RECHAZO_DELAY_DAYS = [1, 3, 7, 14, 30]; // Días de espera según cantidad de rechazos

// ===== HELPER DE SANITIZACIÓN HTML (anti-XSS) =====
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// Chequeo compartido de "¿este overlay está abierto?" — cada overlay usa su
// propia convención de clase: detalle de producto y carrito son abierto =
// SIN .hidden (default de esta función); menú móvil es abierto = CON .open;
// el modal de notificaciones es abierto = CON .activo. Pasa el segundo
// argumento solo cuando la convención no es la de .hidden. Antes este mismo
// par null-check + classList.contains vivía copiado en tm-iife.src.js (ESC),
// tm-data.src.js (popstate) y tm-agent.src.js (burbuja del chat).
function tmOverlayAbierto(id, claseSiAbierto) {
    const el = document.getElementById(id);
    if (!el) return false;
    return claseSiAbierto ? el.classList.contains(claseSiAbierto) : !el.classList.contains('hidden');
}

function safeNum(n, def = 0) {
    const v = Number(n);
    return isFinite(v) ? v : def;
}


// ═══════════════════════════════════════════════════════
//  🛒 CARRITO DE COMPRAS — con persistencia 24h
// ═══════════════════════════════════════════════════════

function _cargarCarrito() {
    try {
        const raw = localStorage.getItem('carrito_v2');
        if (!raw) return [];
        const { items, expires } = JSON.parse(raw);
        if (Date.now() > expires) { localStorage.removeItem('carrito_v2'); return []; }
        return items || [];
    } catch { return []; }
}
let carrito = _cargarCarrito();

function guardarCarrito() {
    const payload = { items: carrito, expires: Date.now() + 24 * 60 * 60 * 1000 };
    localStorage.setItem('carrito_v2', JSON.stringify(payload));
    actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
    const total = carrito.reduce((s, i) => s + i.cantidad, 0);
    const el = document.getElementById('cartCount');
    const btn = document.querySelector('.cart-icon-btn');
    if (btn) btn.classList.toggle('tiene-items', total > 0);
    if (!el) return;
    if (total === 0) {
        el.style.display = 'none';
    } else {
        el.style.display = 'flex';
        el.textContent = total > 99 ? '99+' : total;
    }
}

function _tmCartBump() {
    const btn = document.querySelector('.cart-icon-btn');
    const count = document.getElementById('cartCount');
    if (btn) { btn.classList.remove('tm-cart-bump'); btn.getBoundingClientRect(); btn.classList.add('tm-cart-bump'); setTimeout(() => btn.classList.remove('tm-cart-bump'), 450); }
    if (count) { count.classList.remove('tm-count-pop'); count.getBoundingClientRect(); count.classList.add('tm-count-pop'); setTimeout(() => count.classList.remove('tm-count-pop'), 350); }
}


// ══════════════════════════════════════════════════════════════
//  ME GUSTA / WISHLIST
// ══════════════════════════════════════════════════════════════
let wishlist = tmParseArray(localStorage.getItem('wishlist_v1')).map(String);

function guardarWishlist() {
    localStorage.setItem('wishlist_v1', JSON.stringify(wishlist));
}

function toggleMeGusta(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    id = String(id);
    const idx = wishlist.indexOf(id);
    const agregando = idx === -1;
    if (agregando) {
        wishlist.push(id);
        mostrarNotificacion('❤️ Agregado a Me Gusta');
    } else {
        wishlist.splice(idx, 1);
        mostrarNotificacion('🤍 Eliminado de Me Gusta');
    }
    guardarWishlist();
    actualizarBadgeCorazon();

    // Actualizar todos los botones de esta card
    document.querySelectorAll('[data-like-id="' + id + '"]').forEach(btn => {
        btn.classList.toggle('liked', wishlist.includes(id));
        btn.setAttribute('aria-label', wishlist.includes(id) ? 'Quitar me gusta' : 'Me gusta');
        // Animación del corazón en el botón
        btn.classList.remove('heart-pop');
        btn.getBoundingClientRect();
        btn.classList.add('heart-pop');
    });

    // Animación fly-to-heart solo al agregar
    if (agregando && e) {
        flyToHeart(e);
    }

    // Avisar cuando este producto baje de precio (solo si ya tiene push
    // habilitado — no se le pide permiso acá para no interrumpir el ❤️ con
    // un diálogo). Silencioso: si no hay token o falla, el ❤️ igual funciona.
    // Al quitar el ❤️ se da de baja, para no avisar de precio a quien ya
    // no le interesa el producto.
    const fcmTokenActual = localStorage.getItem('fcmToken');
    if (fcmTokenActual) {
        if (agregando) _tmSuscribirAvisoPrecio(id, fcmTokenActual);
        else _tmDesuscribirAvisoPrecio(id, fcmTokenActual);
    }
}

async function _tmSuscribirAvisoPrecio(productId, fcmToken) {
    try {
        const fbCfgRaw = localStorage.getItem('firebaseConfig');
        if (!fbCfgRaw) return;
        const fbCfg = JSON.parse(fbCfgRaw);
        const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        await fetch(rtdbUrl + '/wishlist_avisos/' + productId + '/' + encodeURIComponent(fcmToken) + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: fcmToken, ts: Date.now() }),
            signal: ctrl.signal
        });
        clearTimeout(tid);
    } catch (e) { /* silencioso: el ❤️ ya se guardó local, esto es solo el aviso extra */ }
}

function _tmDesuscribirAvisoPrecio(productId, fcmToken) {
    try {
        const fbCfgRaw = localStorage.getItem('firebaseConfig');
        if (!fbCfgRaw) return;
        const fbCfg = JSON.parse(fbCfgRaw);
        const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
        fetch(rtdbUrl + '/wishlist_avisos/' + productId + '/' + encodeURIComponent(fcmToken) + '.json', { method: 'DELETE' }).catch(() => {});
    } catch (e) { /* silencioso */ }
}

function actualizarBadgeCorazon() {
    const el = document.getElementById('heartCount');
    const btn = document.getElementById('heartHeaderBtn');
    const icon = document.getElementById('heartHeaderIcon');
    if (!el) return;
    const total = wishlist.length;
    if (total === 0) {
        el.style.display = 'none';
        if (icon) { icon.setAttribute('fill', 'none'); icon.style.color = ''; }
    } else {
        el.style.display = 'flex';
        el.textContent = total > 99 ? '99+' : total;
        if (icon) { icon.setAttribute('fill', 'currentColor'); icon.style.color = '#e74c3c'; }
    }
    if (btn) btn.classList.toggle('has-likes', total > 0);
}

function flyToHeart(e) {
    const heartBtn = document.getElementById('heartHeaderBtn');
    if (!heartBtn) return;

    // Posición origen (donde se tocó)
    // FIX: en touchend, e.touches está vacío, usar changedTouches
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    const srcX = e.clientX || (touch ? touch.clientX : window.innerWidth / 2);
    const srcY = e.clientY || (touch ? touch.clientY : 100);

    // Posición destino (el corazón del header)
    const destRect = heartBtn.getBoundingClientRect();
    const destX = destRect.left + destRect.width / 2;
    const destY = destRect.top + destRect.height / 2;

    // Crear partícula voladora
    const fly = document.createElement('div');
    fly.innerHTML = '❤️';
    fly.style.cssText = [
        'position:fixed',
        'left:' + srcX + 'px',
        'top:' + srcY + 'px',
        'font-size:22px',
        'pointer-events:none',
        'z-index:99999',
        'transform:translate(-50%,-50%) scale(1)',
        'transition:left 0.55s cubic-bezier(.4,0,.2,1),top 0.55s cubic-bezier(.4,0,.2,1),transform 0.55s,opacity 0.55s',
        'opacity:1',
        'will-change:transform,left,top'
    ].join(';');
    document.body.appendChild(fly);

    // Forzar reflow y luego animar hacia el corazón del header
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            fly.style.left  = destX + 'px';
            fly.style.top   = destY + 'px';
            fly.style.transform = 'translate(-50%,-50%) scale(0.3)';
            fly.style.opacity = '0';
        });
    });

    // Pulso en el header al aterrizar
    setTimeout(() => {
        fly.remove();
        if (heartBtn) {
            heartBtn.classList.remove('heart-land');
            heartBtn.getBoundingClientRect();
            heartBtn.classList.add('heart-land');
        }
    }, 560);
}

function getMeGustaHTML(id) {
    id = String(id);
    const liked = wishlist.includes(id);
    return '<button class="btn-megusta' + (liked ? ' liked' : '') + '" ' +
        'data-like-id="' + id + '" ' +
        'aria-label="' + (liked ? 'Quitar me gusta' : 'Me gusta') + '" ' +
        'onclick="toggleMeGusta(' + id + ', event)" type="button">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="' + (liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
        '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' +
        '</svg>' +
        '</button>';
}

function agregarAlCarrito(id, cantidad) {
    const p = productos.find(x => x.id === id);
    if (!p || p.stock === 0) return;

    // Cantidad opcional (desde el modal de detalle). Si no viene, suma 1.
    const cant = Math.max(1, Math.min(safeNum(cantidad) || 1, safeNum(p.stock, 1)));

    const existing = carrito.find(x => x.id === id);
    if (existing) {
        if (existing.cantidad < p.stock) {
            existing.cantidad = Math.min(existing.cantidad + cant, p.stock);
        } else {
            mostrarNotificacion('⚠️ No hay más unidades disponibles', 'error');
            return;
        }
    } else {
        carrito.push({
            id:       p.id,
            nombre:   p.nombre,
            precio:   p.precioActual,
            imagen:   p.imagen,
            cantidad: cant
        });
    }
    guardarCarrito();
    _tmToastProducto(p);
    _tmCartBump();
    renderizarCarrito();
    actualizarBotonesCarrito();
}

function quitarDelCarrito(id) {
    carrito = carrito.filter(x => x.id !== id);
    guardarCarrito();
    renderizarCarrito();
    actualizarBotonesCarrito();
}

function cambiarCantidad(id, delta) {
    const item = carrito.find(x => x.id === id);
    if (!item) return;
    const p = productos.find(x => x.id === id);
    const maxStock = p ? safeNum(p.stock, 99) : 99;
    const nueva = Math.min(maxStock, item.cantidad + delta);
    if (nueva <= 0) { quitarDelCarrito(id); return; }
    item.cantidad = nueva;
    guardarCarrito();
    renderizarCarrito();
}

function limpiarCarrito() {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    actualizarBotonesCarrito();
}

// ── Accesibilidad: trampa de foco reutilizable para modales ──
// Guarda qué tenía el foco antes de abrir, mueve el foco DENTRO del modal,
// atrapa Tab/Shift+Tab mientras está abierto (no se puede tabular al fondo
// oculto), y devuelve el foco al elemento que abrió el modal al cerrarlo.
// No soporta modales anidados (no hace falta hoy: carrito y detalle de
// producto nunca se abren uno desde dentro del otro).
let _tmFocusTrapReturnEl = null;
let _tmFocusTrapKeydownHandler = null;
const _TM_FOCUSABLES_SEL = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tmAbrirFocusTrap(modalEl) {
    if (!modalEl) return;
    _tmFocusTrapReturnEl = document.activeElement;
    const focusables = () => Array.from(modalEl.querySelectorAll(_TM_FOCUSABLES_SEL))
        .filter(el => el.offsetParent !== null);
    if (!modalEl.hasAttribute('tabindex')) modalEl.setAttribute('tabindex', '-1');
    const first = focusables()[0] || modalEl;
    // requestAnimationFrame: al abrir, el modal puede seguir con display:none
    // un instante (transición de clases) — esperar al siguiente frame evita
    // intentar enfocar un elemento todavía no visible.
    requestAnimationFrame(() => { try { first.focus({ preventScroll: true }); } catch (e) {} });

    _tmFocusTrapKeydownHandler = function (e) {
        if (e.key !== 'Tab') return;
        const els = focusables();
        if (!els.length) { e.preventDefault(); return; }
        const firstEl = els[0], lastEl = els[els.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault(); lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault(); firstEl.focus();
        }
    };
    modalEl.addEventListener('keydown', _tmFocusTrapKeydownHandler);
}

function tmCerrarFocusTrap(modalEl) {
    if (modalEl && _tmFocusTrapKeydownHandler) {
        modalEl.removeEventListener('keydown', _tmFocusTrapKeydownHandler);
    }
    _tmFocusTrapKeydownHandler = null;
    const ret = _tmFocusTrapReturnEl;
    _tmFocusTrapReturnEl = null;
    if (ret && typeof ret.focus === 'function' && document.contains(ret)) {
        try { ret.focus({ preventScroll: true }); } catch (e) {}
    }
}

function abrirCarrito() {
    renderizarCarrito();
    const drawer = document.getElementById('carritoDrawer');
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.classList.add("cart-open");
    tmAbrirFocusTrap(drawer);
    // Push history so back button closes cart instead of exiting page
    history.pushState({ cartOpen: true }, '');
}

function cerrarCarrito() {
    const drawer = document.getElementById('carritoDrawer');
    drawer.classList.add('hidden');
    document.body.style.overflow = '';
    document.body.classList.remove("cart-open");
    tmCerrarFocusTrap(drawer);
}

function renderizarCarrito() {
    const itemsEl  = document.getElementById('carritoItems');
    const vacioEl  = document.getElementById('carritoVacio');
    const footerEl = document.getElementById('carritoFooter');
    const totalEl  = document.getElementById('carritoTotal');
    if (!itemsEl) return;

    if (carrito.length === 0) {
        itemsEl.innerHTML  = '';
        vacioEl.style.display  = 'block';
        footerEl.style.display = 'none';
        vacioEl.querySelectorAll('.tm-empty-dot').forEach(d => {
            d.style.animation = 'none';
            d.offsetHeight;
            d.style.animation = '';
        });
        return;
    }

    vacioEl.style.display  = 'none';
    footerEl.style.display = 'block';

    const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const fmt = (usd) => typeof formatPrecio === 'function' ? formatPrecio(usd) : ('$' + usd.toFixed(2) + ' USD');
    if (totalEl) totalEl.textContent = fmt(total);

    itemsEl.innerHTML = carrito.map(item => {
        const subtotal = item.precio * item.cantidad;
        const nombre   = escapeHtml(item.nombre);
        const imagen   = escapeAttr(item.imagen);
        const idSafe   = safeNum(item.id);
        return '<div class="carrito-item" id="cartItem-' + idSafe + '">' +
            '<img class="carrito-item-img" loading="lazy" decoding="async" src="' + imagen + '" alt="' + nombre + '" onerror="this.style.display=\'none\'">'  +
            '<div class="carrito-item-info">' +
                '<div class="carrito-item-name">' + nombre + '</div>' +
                '<div class="carrito-item-price">' + fmt(subtotal) + '</div>' +
                '<div class="carrito-item-controls">' +
                    '<button class="carrito-qty-btn" onclick="cambiarCantidad(' + idSafe + ',-1)">−</button>' +
                    '<span class="carrito-qty-num">' + safeNum(item.cantidad, 1) + '</span>' +
                    '<button class="carrito-qty-btn" onclick="cambiarCantidad(' + idSafe + ',1)">+</button>' +
                    '<span style="font-size:11px;color:#aaa;margin-left:4px;">' + fmt(item.precio) + ' c/u</span>' +
                '</div>' +
            '</div>' +
            '<button class="carrito-item-del" onclick="quitarDelCarrito(' + idSafe + ')" title="Eliminar">✕</button>' +
            '</div>';
    }).join('');

    // Mostrar productos similares debajo de los items
    renderizarSimilaresCarrito();
    // Siempre sincronizar el badge del header
    actualizarContadorCarrito();
}

function renderizarSimilaresCarrito() {
    const secEl  = document.getElementById('carritoSimilares');
    const gridEl = document.getElementById('carritoSimilaresGrid');
    if (!secEl || !gridEl || typeof productos === 'undefined') return;

    if (carrito.length === 0) { secEl.style.display = 'none'; return; }

    // Categorías presentes en el carrito
    const categoriasCarrito = [...new Set(
        carrito.map(i => {
            const p = productos.find(x => x.id === i.id);
            return p ? (p.categoria || '') : '';
        }).filter(Boolean)
    )];

    const idsEnCarrito = new Set(carrito.map(i => i.id));

    // Similares: primero recomendaciones IA de los productos del carrito, luego misma categoría.
    const recIdsCarrito = [];
    carrito.forEach(i => {
        const p = productos.find(x => x.id === i.id);
        if (p && Array.isArray(p.recomendados)) recIdsCarrito.push(...p.recomendados.map(String));
    });
    const recIA = [...new Set(recIdsCarrito)]
        .map(id => productos.find(p => String(p.id) === id))
        .filter(p => p && !idsEnCarrito.has(p.id) && p.precioActual > 0 && Number(p.stock) > 0);
    const fallbackSim = productos
        .filter(p =>
            !idsEnCarrito.has(p.id) &&
            !recIdsCarrito.includes(String(p.id)) &&
            categoriasCarrito.includes(p.categoria || '') &&
            p.precioActual > 0 &&
            Number(p.stock) > 0
        )
        .sort(() => Math.random() - 0.5);
    const similares = [...recIA, ...fallbackSim].slice(0, 3);

    if (similares.length === 0) { secEl.style.display = 'none'; return; }

    secEl.style.display = 'block';
    // Reutiliza el mismo constructor de tarjeta que la grilla principal
    // para que las cards se vean idénticas a las del catálogo (fondo gris claro, mismo diseño).
    if (typeof window._tmCrearCard === 'function') {
        gridEl.innerHTML = similares.map(p => window._tmCrearCard(p, { lazy: true }).outerHTML).join('');
    } else {
        gridEl.innerHTML = '';
    }
}

// ── Helper compartido: construye el mensaje premium para WhatsApp ──
// Recibe un array de items { id?, nombre, precio, cantidad } y devuelve
// el mensaje YA encoded listo para meter en `?text=`.
//
// Dos modos, mismo formato base (evita mantener dos builders separados
// que podian desincronizarse - ver enviarTicketCliente en tm-ui.src.js):
//  - Pedido nuevo (por defecto): lo usan comprarCarrito (carrito), tmComprar
//    (boton "Pedir" de cards) y contactarProducto (boton "Pedir" del modal).
//    Un solo item con id -> link a la pagina del producto (WhatsApp genera
//    previa con miniatura via og:image); varios -> link generico a la tienda.
//  - Ticket de venta ya confirmada (opts.ticket=true): lo usa enviarTicketCliente
//    (POS del admin). Encabezado distinto, incluye numero de ticket/fecha y el
//    link de seguimiento en tiempo real a pedido.html.
function _mensajeOrdenWA(items, opts) {
    opts = opts || {};
    // Emojis como escape ASCII para evitar corrupci\u00f3n de 4-byte UTF-8 en servidor
    const E = {
        cart : '\uD83D\uDED2',  // 🛒
        spark: '\u2728',        // ✨
        dot  : '\uD83D\uDD39',  // 🔹
        money: '\uD83D\uDCB0',  // 💰
        chart: '\uD83D\uDCC8',  // 📈
        bill : '\uD83D\uDCB5',  // 💵
        truck: '\uD83D\uDE9A',  // 🚚
        pray : '\uD83D\uDE4F',  // 🙏
        heart: '\u2764\uFE0F',  // ❤️
        link : '\uD83D\uDD17',  // 🔗
        pack : '\uD83D\uDCE6',  // 📦
        check: '\u2705',        // ✅
        cal  : '\uD83D\uDCC5',  // 📅
    };
    const SEP = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';

    const L = [];
    if (opts.ticket) {
        L.push(E.check + E.pack + ' *TICKET DE COMPRA \u2014 TIENDAMAX* ' + E.pack + E.check);
        L.push(SEP);
        L.push('');
        L.push(E.pack + ' *Ticket N\u00ba:* TM-' + opts.numeroCorto);
        L.push(E.cal + ' *Fecha:* ' + opts.fecha);
    } else {
        L.push(E.cart + E.spark + ' *NUEVA ORDEN \u2014 TIENDAMAX* ' + E.spark + E.cart);
        L.push(SEP);
    }
    L.push('');

    items.forEach((it, i) => {
        const precio = Number(it.precio || 0);
        const cant   = Number(it.cantidad || 1);
        L.push(E.dot + ' *' + (i + 1) + '.* ' + it.nombre);
        L.push(precio > 0
            ? '      \u25b8 Cant: *' + cant + '*  \u00b7  $' + precio.toFixed(2) + ' USD c/u'
            : '      \u25b8 Cant: *' + cant + '*');
        L.push('');
    });

    const subtotal = items.reduce(
        (s, i) => s + Number(i.precio || 0) * Number(i.cantidad || 1), 0
    );

    L.push(SEP);
    if (opts.ticket) {
        // El ticket es una venta ya cerrada: "Total" a secas, sin línea de tasa aparte.
        L.push(E.money + ' *Total:* $' + subtotal.toFixed(2) + ' USD');
        const tasaFinal = (typeof getTasaMN === 'function') ? getTasaMN() : 0;
        if (tasaFinal > 0) {
            const totalMN = Math.round(subtotal * tasaFinal).toLocaleString('es-CU');
            L.push(E.bill + ' *Total MN:* ' + totalMN + ' MN');
        }
    } else if (subtotal > 0) {
        L.push(E.money + ' *Subtotal:* $' + subtotal.toFixed(2) + ' USD');
        const tasaFinal = (typeof getTasaMN === 'function') ? getTasaMN() : 0;
        if (tasaFinal > 0) {
            const totalMN = Math.round(subtotal * tasaFinal).toLocaleString('es-CU');
            L.push(E.chart + ' *Tasa:* 1 USD = ' + tasaFinal + ' MN');
            L.push(E.bill  + ' *TOTAL:* *' + totalMN + ' MN*');
        }
    }

    L.push('');
    L.push(opts.ticket
        ? E.truck + ' _Tu pedido est\u00e1 confirmado. Coordinaremos la entrega por aqu\u00ed._'
        : E.truck + ' _Env\u00edame los datos para coordinar la entrega, por favor._');
    L.push('');

    if (opts.ticket && opts.pedidoId) {
        L.push(E.pack + ' *Segu\u00ed tu pedido en tiempo real:*');
        L.push(E.link + ' https://tiendamax.org/pedido.html?id=' + opts.pedidoId);
        L.push('');
    }

    L.push(E.pray + ' _\u00a1Gracias por tu compra!_ ' + E.heart);

    if (!opts.ticket) {
        // Un solo producto con id -> link al producto (WhatsApp genera miniatura con og:image)
        // Varios productos -> link generico a la tienda
        if (items.length === 1 && items[0].id) {
            L.push(E.link + ' https://tiendamax.org/p/producto-' + items[0].id + '.html');
        } else {
            L.push(E.link + ' https://tiendamax.org');
        }
    }

    return encodeURIComponent(L.join('\n'));
}

function comprarCarrito() {
    if (carrito.length === 0) return;
    // Historial del cliente + analytics antes de abrir WhatsApp
    const pedidoId = guardarPedidoCliente(carrito.slice());
    if (typeof tmTrackWhatsApp === 'function') carrito.forEach(i => tmTrackWhatsApp(i.id));
    carrito.forEach(i => tmRegistrarInteresWhatsApp(i.id, 'carrito'));
    _gaEvent('purchase', { method: 'whatsapp_cart', items: carrito.length });
    const msg = _mensajeOrdenWA(carrito, { pedidoId });
    window.open('https://wa.me/' + getNumeroWhatsApp() + '?text=' + msg, '_blank', 'noopener,noreferrer');
}

// ── Interesados WhatsApp: registra intención de compra para seguimiento admin ──
function tmRegistrarInteresWhatsApp(producto, origen = 'whatsapp') {
    try {
        const p = (typeof producto === 'object' && producto)
            ? producto
            : (Array.isArray(productos) ? productos.find(x => String(x.id) === String(producto)) : null);
        if (!p || !p.id) return;
        const item = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            ts: Date.now(),
            fecha: new Date().toISOString(),
            productoId: p.id,
            producto: p.nombre || 'Producto',
            precio: Number(p.precioActual || p.precio || 0),
            stock: Number(p.stock || 0),
            categoria: p.categoria || 'General',
            origen,
            url: '/p/producto-' + p.id + '.html'
        };
        // Local fallback
        try {
            const arr = tmParseArray(localStorage.getItem('tm_interesados_whatsapp'));
            arr.unshift(item);
            localStorage.setItem('tm_interesados_whatsapp', JSON.stringify(arr.slice(0, 500)));
        } catch(e) {}
        // Firebase RTDB si hay config. Fire & forget.
        (async () => {
            try {
                if (typeof _fbEnsureConfig === 'function') await _fbEnsureConfig();
                const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
                if (!base) return;
                await fetch(`${base}/interesados/${p.id}/${item.ts}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item)
                });
            } catch(e) { console.warn('[interesados]', e.message); }
        })();
    } catch(e) { console.warn('[interesados]', e); }
}
window.tmRegistrarInteresWhatsApp = tmRegistrarInteresWhatsApp;

// Actualiza el estado visual de los botones "Agregar al carrito" en los cards
function actualizarBotonesCarrito() {
    document.querySelectorAll('[data-cart-id]').forEach(btn => {
        const id = btn.getAttribute('data-cart-id');
        // FIX: comparar como strings para evitar bugs si los IDs cambian de tipo
        const enCarrito = carrito.some(x => String(x.id) === String(id));
        if (enCarrito) {
            btn.classList.add('en-carrito');
            btn.textContent = '✓ En carrito';
        } else {
            btn.classList.remove('en-carrito');
            btn.textContent = '🛒 Agregar';
        }
    });
}

// ═══════════════════════════════════════════════════════
//  ⭐ RESEÑAS
// ═══════════════════════════════════════════════════════
let _estrellasSeleccionadas = 0;
let _productoResena = null;
let _resenaFotoData = null;

// Rating labels in Spanish
const _ratingLabels = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

function _updateRatingText(n) {
    const txt = document.getElementById('ratingText');
    if (txt) txt.textContent = n > 0 ? _ratingLabels[n] : 'Selecciona';
}

function _updateRatingHiddenInput(n) {
    const inp = document.getElementById('ratingValue');
    if (inp) inp.value = n;
}

function mostrarFormResena() {
    const form = document.getElementById('formResena');
    const btn  = document.getElementById('btnAgregarResena');
    if (!form) return;
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? '+ Agregar reseña' : '✕ Cancelar';
    _estrellasSeleccionadas = 0;
    setEstrellas(0);
    _updateRatingText(0);
    _updateRatingHiddenInput(0);
    const autorEl = document.getElementById('resenaAutor');
    const textoEl = document.getElementById('resenaTexto');
    if (autorEl) autorEl.value = '';
    if (textoEl) textoEl.value = '';
    const compradorEl = document.getElementById('resenaComprador');
    if (compradorEl) compradorEl.checked = false;
    quitarFotoResena();
}

// Comprime la foto al seleccionarla y guarda el data URL para enviarlo con la reseña.
async function previsualizarFotoResena(input) {
    const file = input && input.files && input.files[0];
    const prev = document.getElementById('resenaFotoPreview');
    if (!file) { quitarFotoResena(); return; }
    try {
        _resenaFotoData = await comprimirImagen(file, 35, 700, 700);
        if (prev) {
            prev.style.display = 'flex';
            prev.innerHTML =
                '<img src="' + escapeAttr(_resenaFotoData) + '" alt="Vista previa" style="width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,.15);">' +
                '<button type="button" onclick="quitarFotoResena()" style="background:none;border:none;color:#e74c3c;font-size:13px;cursor:pointer;font-weight:600;">✕ Quitar foto</button>';
        }
    } catch (e) {
        _resenaFotoData = null;
        mostrarNotificacion('⚠️ No se pudo procesar la imagen', 'error');
    }
}

function quitarFotoResena() {
    _resenaFotoData = null;
    const prev  = document.getElementById('resenaFotoPreview');
    const input = document.getElementById('resenaFoto');
    if (prev)  { prev.style.display = 'none'; prev.innerHTML = ''; }
    if (input) input.value = '';
}

function setEstrellas(n) {
    _estrellasSeleccionadas = n;
    // Legacy estrella-btn support
    document.querySelectorAll('.estrella-btn').forEach((btn, i) => {
        btn.classList.toggle('activa', i < n);
        btn.setAttribute('aria-checked', i < n ? 'true' : 'false');
    });
    // New star-btn interactive rating
    document.querySelectorAll('.star-btn').forEach((btn, i) => {
        const idx = parseInt(btn.getAttribute('data-value'), 10) - 1;
        btn.classList.toggle('active', idx < n);
        btn.setAttribute('aria-checked', idx < n ? 'true' : 'false');
    });
    _updateRatingText(n);
    _updateRatingHiddenInput(n);
}

// ── Interactive Star Rating: event delegation for hover, click, touch ──
function _initRatingStarsInput() {
    const container = document.getElementById('ratingStarsInput');
    if (!container || container._ratingInit) return;
    container._ratingInit = true;

    const stars = () => container.querySelectorAll('.star-btn');

    // Helper: get star value from element
    function starValue(el) {
        return parseInt(el.getAttribute('data-value'), 10) || 0;
    }

    // Click / tap → select rating with pop animation
    container.addEventListener('click', function (e) {
        const star = e.target.closest('.star-btn');
        if (!star) return;
        const val = starValue(star);
        setEstrellas(val);
        // Pop animation on clicked star and all active stars
        stars().forEach(function (s) {
            const sv = starValue(s);
            if (sv <= val) {
                s.classList.remove('pop');
                // Force reflow to restart animation
                void s.offsetWidth;
                s.classList.add('pop');
                s.addEventListener('animationend', function handler() {
                    s.classList.remove('pop');
                    s.removeEventListener('animationend', handler);
                });
            }
        });
    });

    // Hover → preview stars up to hovered one
    container.addEventListener('mouseover', function (e) {
        const star = e.target.closest('.star-btn');
        if (!star) return;
        const val = starValue(star);
        stars().forEach(function (s) {
            const sv = starValue(s);
            s.classList.toggle('hover', sv <= val);
        });
    });

    // Mouse leave → remove hover, restore active based on current value
    container.addEventListener('mouseleave', function () {
        stars().forEach(function (s) {
            s.classList.remove('hover');
        });
        // Restore active state from _estrellasSeleccionadas
        stars().forEach(function (s) {
            const sv = starValue(s);
            s.classList.toggle('active', sv <= _estrellasSeleccionadas);
        });
    });

    // Touch support: prevent double-firing and handle touch on mobile
    container.addEventListener('touchend', function (e) {
        const star = e.target.closest('.star-btn');
        if (!star) return;
        e.preventDefault(); // prevent ghost click
        const val = starValue(star);
        setEstrellas(val);
        // Pop animation
        stars().forEach(function (s) {
            const sv = starValue(s);
            if (sv <= val) {
                s.classList.remove('pop');
                void s.offsetWidth;
                s.classList.add('pop');
                s.addEventListener('animationend', function handler() {
                    s.classList.remove('pop');
                    s.removeEventListener('animationend', handler);
                });
            }
        });
    });

    // Keyboard: Enter / Space on star-btn
    container.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const star = e.target.closest('.star-btn');
        if (!star) return;
        e.preventDefault();
        const val = starValue(star);
        setEstrellas(val);
        // Pop animation
        star.classList.remove('pop');
        void star.offsetWidth;
        star.classList.add('pop');
        star.addEventListener('animationend', function handler() {
            star.classList.remove('pop');
            star.removeEventListener('animationend', handler);
        });
    });
}

// Initialize on DOMContentLoaded and also when the form becomes visible
document.addEventListener('DOMContentLoaded', _initRatingStarsInput);
// Also init when form is shown (in case DOM wasn't ready)
const _origMostrarFormResena = mostrarFormResena;
mostrarFormResena = function () {
    _origMostrarFormResena();
    _initRatingStarsInput();
};

function guardarResena() {
    if (!_detalleProductoActual) return;
    const autor = (document.getElementById('resenaAutor')?.value || '').trim();
    const texto = (document.getElementById('resenaTexto')?.value || '').trim();
    if (!autor) { mostrarNotificacion('⚠️ Escribe tu nombre', 'error'); return; }
    if (_estrellasSeleccionadas === 0) { mostrarNotificacion('⚠️ Selecciona una calificación', 'error'); return; }
    if (!texto) { mostrarNotificacion('⚠️ Escribe tu reseña', 'error'); return; }
    if (texto.length < 10) { mostrarNotificacion('⚠️ La reseña es muy corta', 'error'); return; }

    const pid = String(_detalleProductoActual.id);
    const ts  = Date.now();
    const nuevaResena = {
        id: ts,
        ts: ts,
        autor: autor.substring(0, 50),
        texto: texto.substring(0, 400),
        estrellas: _estrellasSeleccionadas,
        fecha: new Date().toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }),
        productoId: pid,
        productoNombre: _detalleProductoActual.nombre || '',
        comprador: !!(document.getElementById('resenaComprador')?.checked)
    };
    if (_resenaFotoData) nuevaResena.imagen = _resenaFotoData;

    mostrarFormResena();
    mostrarNotificacion('⏳ Publicando reseña...');

    // Guardar en Firebase — visible para todos al instante
    (async () => {
        try {
            const base = _fbRtdbUrl();
            if (base) {
                const _ctrl = new AbortController();
                const _tid = setTimeout(() => _ctrl.abort(), 6000);
                const r = await fetch(base + '/resenas/' + pid + '/' + ts + '.json', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nuevaResena),
                    signal: _ctrl.signal
                });
                clearTimeout(_tid);
                if (r.ok) {
                    mostrarNotificacion('✅ ¡Reseña publicada! Visible para todos');
                    // Recargar reseñas desde Firebase
                    await renderizarResenas(pid);
                    return;
                }
            }
        } catch(e) {}
        // Fallback local
        const key = 'resenas_' + pid;
        const resenas = tmParseArray(localStorage.getItem(key));
        resenas.unshift(nuevaResena);
        localStorage.setItem(key, JSON.stringify(resenas.slice(0, 20)));
        mostrarNotificacion('💾 Reseña guardada localmente');
        await renderizarResenas(pid);
    })();
}

async function renderizarResenas(productoId) {
    const el = document.getElementById('listaResenas');
    if (!el) return;
    const pid = String(productoId);

    // Promedio destacado arriba del modal (oculto por defecto; se muestra solo si hay reseñas)
    const ratingTop = document.getElementById('detailRatingTop');
    if (ratingTop) { ratingTop.style.display = 'none'; ratingTop.innerHTML = ''; }

    el.innerHTML = '<p class="resenas-vacio" style="color:#aaa;font-size:13px;text-align:center;padding:12px;">⏳ Cargando reseñas...</p>';

    let resenas = [];

    // Leer desde Firebase (fuente de verdad) con timeout corto (4s) para no colgar al cliente
    // en redes con *.firebaseio.com bloqueado (típico en Cuba).
    try {
        const base = _fbRtdbUrl();
        if (base) {
            const ctrl = new AbortController();
            const tmo = setTimeout(() => ctrl.abort(), 4000);
            const r = await fetch(base + '/resenas/' + pid + '.json', { signal: ctrl.signal });
            clearTimeout(tmo);
            if (r.ok) {
                const data = await r.json();
                if (data && typeof data === 'object') {
                    resenas = Object.values(data).filter(Boolean).sort((a,b) => b.id - a.id);
                }
            }
        }
    } catch(e) {}

    // Fallback 1: cache estático resenas-cache.json (commiteado cada hora por GitHub Actions)
    // Este archivo se sirve desde el mismo origen que la web, así que funciona aunque Firebase esté bloqueado.
    if (resenas.length === 0) {
        try {
            const r = await fetch('resenas-cache.json?v=' + (window.__tmResenasCacheVer || ''), { cache: 'no-store' });
            if (r.ok) {
                const cache = await r.json();
                const porProd = cache && cache.por_producto && cache.por_producto[pid];
                if (Array.isArray(porProd) && porProd.length) {
                    resenas = porProd.slice().sort((a,b) => (b.id || 0) - (a.id || 0));
                }
            }
        } catch(e) {}
    }

    // Fallback 2: localStorage (reseñas que el propio usuario envió desde este navegador)
    if (resenas.length === 0) {
        const prodEnMemoria = productos.find(p => p.id === productoId);
        if (prodEnMemoria && Array.isArray(prodEnMemoria.resenas) && prodEnMemoria.resenas.length > 0) {
            resenas = prodEnMemoria.resenas;
        } else {
            const key = 'resenas_' + pid;
            resenas = tmParseArray(localStorage.getItem(key));
        }
    }

    if (resenas.length === 0) {
        el.innerHTML = '<p class="resenas-vacio">Sé el primero en dejar una reseña 🌟</p>';
        return;
    }
    const promedio = (resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length).toFixed(1);
    // Mostrar el promedio arriba del modal (junto al precio)
    if (ratingTop) {
        ratingTop.innerHTML =
            '<span class="drt-stars">' + '★'.repeat(Math.round(parseFloat(promedio))) + '☆'.repeat(5 - Math.round(parseFloat(promedio))) + '</span>' +
            '<span class="drt-num">' + promedio + '</span>' +
            '<span class="drt-count">· ' + resenas.length + ' reseña' + (resenas.length !== 1 ? 's' : '') + '</span>' +
            '<button type="button" class="drt-ver-todas" onclick="document.querySelector(\'.detail-resenas-section\').scrollIntoView({behavior:\'smooth\'})">Ver todas</button>';
        ratingTop.style.display = 'flex';
    }
    // El promedio ya se muestra arriba (#detailRatingTop); abajo va directo a la lista.
    el.innerHTML =
        resenas.map(r => {
            const e = Math.max(0, Math.min(5, parseInt(r.estrellas, 10) || 0));
            const nombre = String(r.autor || '?').trim();
            const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
            const _avatarPalette = ['#ff7a29,#ff4d00', '#60a5fa,#3b82f6', '#a78bfa,#7c3aed', '#4ade80,#16a34a', '#fb7185,#e11d48'];
            let _hash = 0; for (let i = 0; i < nombre.length; i++) _hash = (_hash * 31 + nombre.charCodeAt(i)) >>> 0;
            const avatarGrad = _avatarPalette[_hash % _avatarPalette.length];
            return '<div class="resena-item">' +
                '<div class="resena-top">' +
                    '<span class="resena-avatar" style="background:linear-gradient(135deg,' + avatarGrad + ')">' + escapeHtml(iniciales) + '</span>' +
                    '<div class="resena-meta">' +
                        '<span class="resena-autor">' + escapeHtml(nombre) + '</span>' +
                        '<span class="resena-fecha">' + escapeHtml(r.fecha) + '</span>' +
                    '</div>' +
                    '<span class="resena-estrellas">' + '★'.repeat(e) + '☆'.repeat(5 - e) + '</span>' +
                '</div>' +
                '<p class="resena-texto">' + escapeHtml(r.texto) + '</p>' +
                (r.imagen && /^data:image\//.test(String(r.imagen))
                    ? '<img class="resena-foto" src="' + escapeAttr(r.imagen) + '" alt="Foto de la reseña" loading="lazy">'
                    : '') +
                (r.comprador ? '<span class="resena-verificada">✓ Compra verificada</span>' : '') +
            '</div>';
        }).join('');
}

// ── TESTIMONIOS DINÁMICOS DESDE FIREBASE ────────────────
let _tmAllResenas = [];

function _renderTestimoniosPage(show) {
    const grid = document.getElementById('testimoniosGrid');
    const cta  = document.getElementById('testimoniosCTA');
    if (!grid || !_tmAllResenas.length) return;
    const starChars = n => '★'.repeat(Math.min(5, Math.max(1, n))) + '☆'.repeat(5 - Math.min(5, Math.max(1, n)));
    grid.innerHTML = _tmAllResenas.slice(0, show).map(r => {
        const nombre = String(r.autor || '?').trim();
        const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';
        const paletas = ['#ff7a29,#ff4d00','#60a5fa,#3b82f6','#a78bfa,#7c3aed','#4ade80,#16a34a','#fb7185,#e11d48'];
        let hash = 0;
        for (let i = 0; i < nombre.length; i++) hash = hash * 31 + nombre.charCodeAt(i) >>> 0;
        const estrellas = Math.max(0, Math.min(5, parseInt(r.estrellas, 10) || 0));
        return '<div class="testimonio-card">' +
            '<div class="resena-top">' +
                '<span class="resena-avatar" style="background:linear-gradient(135deg,' + paletas[hash % paletas.length] + ')">' + escapeHtml(iniciales) + '</span>' +
                '<div class="resena-meta">' +
                    '<span class="resena-autor">' + escapeHtml(nombre) + '</span>' +
                    '<span class="resena-fecha">' + escapeHtml(r.fecha || '') + '</span>' +
                '</div>' +
                '<span class="resena-estrellas">' + starChars(estrellas) + '</span>' +
            '</div>' +
            '<p class="resena-texto">' + escapeHtml(r.texto.substring(0, 250)) + '</p>' +
            (r.productoNombre ? '<span class="resena-verificada" style="background:rgba(255,107,53,.08);border-color:rgba(255,107,53,.25);color:var(--coral,#FF6B35);">' + escapeHtml(r.productoNombre.substring(0, 30)) + '</span>' : '') +
        '</div>';
    }).join('');
    const remaining = _tmAllResenas.length - show;
    let btn = document.getElementById('nd-resenas-mas');
    if (remaining > 0) {
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'nd-resenas-mas';
            btn.style.cssText = 'text-align:center;margin-top:16px;';
            grid.insertAdjacentElement('afterend', btn);
        }
        btn.innerHTML = '<button onclick="_renderTestimoniosPage(' + (show + 6) + ')">Ver ' + remaining + ' reseña' + (remaining === 1 ? '' : 's') + ' más ↓</button>';
    } else {
        if (btn) btn.remove();
        // Mostrar CTA "deja tu reseña" cuando ya no hay más
        if (cta) {
            cta.style.display = 'block';
            if (!cta.querySelector('#tm-cta-link')) {
                cta.innerHTML = '<button id="tm-cta-link" onclick="document.querySelector(\'.productos-grid,.producto-card\')?.scrollIntoView({behavior:\'smooth\'})">✍️ Deja tu reseña en cualquier producto →</button>';
            }
        }
    }
}

let _testimoniosIniciados = false;
function _observarTestimonios() {
    if (_testimoniosIniciados) return;
    const grid = document.getElementById('testimoniosGrid');
    if (!grid) return;
    if (!('IntersectionObserver' in window)) {
        window.addEventListener('load', () => setTimeout(cargarTestimoniosFirebase, 2000), { once: true });
        return;
    }
    // FIX: si el grid está oculto (dentro de vistaInicio con display:none), el observer
    // nunca dispara. Fallback: cargar a los 3s sí o sí, además del observer.
    setTimeout(function() {
        if (!_testimoniosIniciados) {
            _testimoniosIniciados = true;
            cargarTestimoniosFirebase();
        }
    }, 3000);
    const obs = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        if (_testimoniosIniciados) return;
        _testimoniosIniciados = true;
        cargarTestimoniosFirebase();
    }, { rootMargin: '300px' });
    obs.observe(grid);
}

async function cargarTestimoniosFirebase() {
    const grid = document.getElementById('testimoniosGrid');
    const cta  = document.getElementById('testimoniosCTA');
    if (!grid) return;

    // Intentar Firebase primero (con timeout de 5s). Si *.firebaseio.com está bloqueado
    // (común en Cuba), caer al cache estático resenas-cache.json que se sirve desde el mismo origen.
    let allResenas = [];
    let usedSource = 'firebase';
    try {
        const base = _fbRtdbUrl();
        if (!base) throw new Error('no config');

        // shallow=true solo trae las claves (no el contenido), para listar productos con reseñas
        const ctrl = new AbortController();
        const tmo = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(base + '/resenas.json?shallow=true', { signal: ctrl.signal });
        clearTimeout(tmo);
        if (!r.ok) throw new Error('fetch failed ' + r.status);
        const productIds = await r.json();
        if (!productIds || typeof productIds !== 'object') throw new Error('empty');

        const pids = Object.keys(productIds).slice(0, 20);
        await Promise.all(pids.map(async pid => {
            try {
                const ctrl2 = new AbortController();
                const tmo2 = setTimeout(() => ctrl2.abort(), 5000);
                const rp = await fetch(base + '/resenas/' + pid + '.json', { signal: ctrl2.signal });
                clearTimeout(tmo2);
                if (!rp.ok) return;
                const data = await rp.json();
                if (data && typeof data === 'object') {
                    Object.values(data).filter(Boolean).forEach(r => allResenas.push(r));
                }
            } catch(e) {}
        }));
    } catch(e) {
        // Firebase falló (timeout/bloqueo/error). Intentar cache estático.
        usedSource = 'cache';
        try {
            const r = await fetch('resenas-cache.json?v=' + (window.__tmResenasCacheVer || ''), { cache: 'no-store' });
            if (r.ok) {
                const cache = await r.json();
                const porProd = cache && cache.por_producto || {};
                Object.keys(porProd).forEach(pid => {
                    if (Array.isArray(porProd[pid])) {
                        porProd[pid].forEach(r => allResenas.push(r));
                    }
                });
            }
        } catch(e2) {}
    }

    // Si Firebase no devolvió nada, intentar cache aunque Firebase no haya tirado excepción
    if (allResenas.length === 0) {
        try {
            const r = await fetch('resenas-cache.json?v=' + (window.__tmResenasCacheVer || ''), { cache: 'no-store' });
            if (r.ok) {
                const cache = await r.json();
                const porProd = cache && cache.por_producto || {};
                Object.keys(porProd).forEach(pid => {
                    if (Array.isArray(porProd[pid])) {
                        porProd[pid].forEach(r => allResenas.push(r));
                    }
                });
                if (allResenas.length) usedSource = 'cache-fallback';
            }
        } catch(e) {}
    }

    if (allResenas.length === 0) {
        // Vacío real: ni Firebase ni cache tienen reseñas
        grid.innerHTML = '';
        if (cta) {
            cta.style.display = 'block';
            cta.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:14px;margin-bottom:12px;">Sé el primero en dejar una reseña</p>';
        }
        console.warn('cargarTestimoniosFirebase: sin reseñas ni en Firebase ni en cache');
        return;
    }

    // Preferir 4+ estrellas, pero si no hay suficientes, incluir todas
    let mejores = allResenas
        .filter(r => r.estrellas >= 4 && r.texto && r.texto.length > 15)
        .sort((a, b) => (b.id || 0) - (a.id || 0));

    if (mejores.length === 0) {
        mejores = allResenas
            .filter(r => r.texto && r.texto.length > 15)
            .sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    if (mejores.length === 0) {
        grid.innerHTML = '';
        if (cta) {
            cta.style.display = 'block';
            cta.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:14px;margin-bottom:12px;">Sé el primero en dejar una reseña</p>';
        }
        return;
    }

    _tmAllResenas = mejores;
    _renderTestimoniosPage(4);
    if (cta) cta.style.display = 'block';
}

// ═══════════════════════════════════════════════════════
//  🕐 VISTOS RECIENTEMENTE (v2 - con timestamps y caducidad)
//
//  Guarda hasta 12 productos vistos por el cliente, con
//  timestamp para caducar tras 30 días. Solo se guardan
//  visualizaciones REALES (productos que el cliente abrió).
// ═══════════════════════════════════════════════════════
const _TM_VISTOS_MAX = 12;
const _TM_VISTOS_DIAS_CADUCIDAD = 30;

function _cargarVistos() {
    try {
        const raw = localStorage.getItem('recientes_v2');
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        // Filtrar caducados
        const limite = Date.now() - _TM_VISTOS_DIAS_CADUCIDAD * 24 * 60 * 60 * 1000;
        return arr.filter(x => x && x.t && x.t > limite);
    } catch(e) { return []; }
}

function _guardarVistos(arr) {
    try {
        localStorage.setItem('recientes_v2', JSON.stringify(arr));
    } catch(e) {
        // Si la cuota está llena, intentar reducir a la mitad
        try {
            localStorage.setItem('recientes_v2', JSON.stringify(arr.slice(0, 6)));
        } catch(e2) {}
    }
}

function registrarVisto(id) {
    if (!id) return;
    let vistos = _cargarVistos();
    // Quitar si ya existe (para subirlo al top)
    vistos = vistos.filter(x => String(x.id) !== String(id));
    // Añadir al principio con timestamp
    vistos.unshift({ id: String(id), t: Date.now() });
    // Limitar a 12
    vistos = vistos.slice(0, _TM_VISTOS_MAX);
    _guardarVistos(vistos);
    // Re-renderizar las secciones si están visibles
    setTimeout(renderizarRecientes, 100);
}

function limpiarRecientes() {
    try { localStorage.removeItem('recientes_v2'); } catch(e) {}
    try { localStorage.removeItem('recientes'); } catch(e) {}  // limpiar versión vieja
    renderizarRecientes();
}

// Renderiza los productos vistos en la sección "seccionRecientes" (home)
// y en "detailVistosGrid" (modal de detalle). Si no hay productos, oculta las secciones.
function renderizarRecientes() {
    if (!Array.isArray(productos) || productos.length === 0) return;

    const vistos = _cargarVistos();
    const productoActualId = (typeof _detalleProductoActual !== 'undefined' && _detalleProductoActual)
        ? String(_detalleProductoActual.id) : null;

    // Resolver IDs → objetos producto. Excluir el producto que está abierto ahora.
    const items = vistos
        .map(v => productos.find(p => String(p.id) === String(v.id)))
        .filter(Boolean)
        .filter(p => String(p.id) !== productoActualId)
        .slice(0, 6);

    // ─── Sección en HOME ───
    const secHome = document.getElementById('seccionRecientes');
    const gridHome = document.getElementById('recientesGrid');
    if (secHome && gridHome) {
        if (items.length === 0) {
            secHome.style.display = 'none';
        } else {
            secHome.style.display = '';
            gridHome.innerHTML = items.map(_renderCardRecientes).join('');
        }
    }

    // ─── Sección en DETALLE de producto ───
    const secDet = document.getElementById('detailVistosSection');
    const gridDet = document.getElementById('detailVistosGrid');
    if (secDet && gridDet) {
        if (items.length === 0) {
            secDet.style.display = 'none';
        } else {
            secDet.style.display = 'block';
            gridDet.innerHTML = items.map(_renderCardRecientes).join('');
        }
    }
}

function _renderCardRecientes(p) {
    // Reutiliza el mismo constructor de tarjeta que la grilla principal
    // (tm-ui.src.js, expuesto como window._tmCrearCard) para que estas
    // tarjetas se vean idénticas a las nuevas, sin duplicar el markup.
    if (typeof window._tmCrearCard === 'function') {
        return window._tmCrearCard(p, { lazy: true }).outerHTML;
    }
    return '';
}

// ═══════════════════════════════════════════════════════
//  🔔 NOTIFICACIONES PUSH
// ═══════════════════════════════════════════════════════
async function solicitarNotificaciones() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
}

function mostrarNotificacionPush(titulo, cuerpo, icono) {
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(titulo, {
            body: cuerpo,
            icon: icono || 'https://tiendamax.org/favicon.ico',
            badge: 'https://tiendamax.org/favicon.ico',
            tag: 'tiendamax'
        });
    } catch(e) {}
}

// Verificar si hay productos nuevos desde la última visita
function verificarProductosNuevos() {
    const ultimaVisita = parseInt(localStorage.getItem('ultimaVisita') || '0');
    const ahora = Date.now();
    localStorage.setItem('ultimaVisita', ahora.toString());
    if (ultimaVisita === 0) return; // Primera visita
    const nuevos = productos.filter(p => p.id > ultimaVisita).length;
    if (nuevos > 0 && Notification.permission === 'granted') {
        mostrarNotificacionPush(
            '🛍️ TiendaMax',
            nuevos === 1 ? '¡Hay 1 producto nuevo!' : `¡Hay ${nuevos} productos nuevos!`
        );
    }
}


