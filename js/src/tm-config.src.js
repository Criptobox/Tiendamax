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
let wishlist = tmParse(localStorage.getItem('wishlist_v1'), []).map(String);

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

function agregarAlCarrito(id) {
    const p = productos.find(x => x.id === id);
    if (!p || p.stock === 0) return;

    const existing = carrito.find(x => x.id === id);
    if (existing) {
        if (existing.cantidad < p.stock) {
            existing.cantidad++;
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
            cantidad: 1
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
    const maxStock = p ? p.stock : 99;
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

function abrirCarrito() {
    renderizarCarrito();
    const drawer = document.getElementById('carritoDrawer');
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function cerrarCarrito() {
    document.getElementById('carritoDrawer').classList.add('hidden');
    document.body.style.overflow = '';
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
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2) + ' USD';

    itemsEl.innerHTML = carrito.map(item => {
        const subtotal = (item.precio * item.cantidad).toFixed(2);
        const nombre   = escapeHtml(item.nombre);
        const imagen   = escapeAttr(item.imagen);
        const idSafe   = safeNum(item.id);
        return '<div class="carrito-item" id="cartItem-' + idSafe + '">' +
            '<img class="carrito-item-img" loading="lazy" decoding="async" src="' + imagen + '" alt="' + nombre + '" onerror="this.style.display=\'none\'">'  +
            '<div class="carrito-item-info">' +
                '<div class="carrito-item-name">' + nombre + '</div>' +
                '<div class="carrito-item-price">$' + subtotal + ' USD</div>' +
                '<div class="carrito-item-controls">' +
                    '<button class="carrito-qty-btn" onclick="cambiarCantidad(' + idSafe + ',-1)">−</button>' +
                    '<span class="carrito-qty-num">' + safeNum(item.cantidad, 1) + '</span>' +
                    '<button class="carrito-qty-btn" onclick="cambiarCantidad(' + idSafe + ',1)">+</button>' +
                    '<span style="font-size:11px;color:#aaa;margin-left:4px;">$' + item.precio.toFixed(2) + ' c/u</span>' +
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
        .filter(p => p && !idsEnCarrito.has(p.id) && p.precioActual > 0 && p.agotado !== true);
    const fallbackSim = productos
        .filter(p =>
            !idsEnCarrito.has(p.id) &&
            !recIdsCarrito.includes(String(p.id)) &&
            categoriasCarrito.includes(p.categoria || '') &&
            p.precioActual > 0 &&
            p.agotado !== true
        )
        .sort(() => Math.random() - 0.5);
    const similares = [...recIA, ...fallbackSim].slice(0, 3);

    if (similares.length === 0) { secEl.style.display = 'none'; return; }

    secEl.style.display = 'block';
    gridEl.innerHTML = similares.map(p => {
        const img    = escapeAttr((p.imagenes && p.imagenes[0]) ? p.imagenes[0] : (p.imagen || ''));
        const nombre = escapeHtml(p.nombre);
        const idSafe = safeNum(p.id);
        const stock  = parseInt(p.stock, 10);
        const urgencia = (!isNaN(stock) && stock > 0 && stock <= 3)
            ? '<div class="cs-urgencia">🔥 ¡Solo quedan ' + stock + '!</div>'
            : '';
        return '<div class="cs-card" style="cursor:pointer" onclick="if(typeof cerrarCarrito===\'function\')cerrarCarrito();abrirDetalleProducto(' + idSafe + ')">' +
            '<img class="cs-card-img" src="' + img + '" alt="' + nombre + '" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<div class="cs-card-body">' +
                '<div class="cs-card-nombre">' + nombre + '</div>' +
                '<div class="cs-card-precio">$' + Number(p.precioActual).toFixed(2) + ' USD</div>' +
                urgencia +
            '</div>' +
            '<button class="cs-card-btn" onclick="event.stopPropagation();agregarAlCarrito(' + idSafe + ');renderizarCarrito();">🛒 Agregar</button>' +
        '</div>';
    }).join('');
}

// ── Helper compartido: construye el mensaje premium para WhatsApp ──
// Recibe un array de items { id?, nombre, precio, cantidad } y devuelve
// el mensaje YA encoded listo para meter en `?text=`.
// Lo usan: comprarCarrito (carrito), tmComprar (botón "Pedir" de cards),
// y contactarProducto (botón "Pedir" del modal de detalle).
//
// Si hay UN solo item con id, el link al final apunta a la página del
// producto (/p/producto-{id}.html) para que WhatsApp genere la previa
// con miniatura usando los meta og:image. Si hay varios, link genérico.
function _mensajeOrdenWA(items, pedidoId) {
    // Emojis como escape ASCII para evitar corrupción de 4-byte UTF-8 en servidor
    const E = {
        cart : '\uD83D\uDED2',  // 🛒
        spark: '\u2728',        // ✨  (BMP — ok directo, pero escapado por consistencia)
        dot  : '\uD83D\uDD39',  // 🔹
        money: '\uD83D\uDCB0',  // 💰
        chart: '\uD83D\uDCC8',  // 📈
        bill : '\uD83D\uDCB5',  // 💵
        truck: '\uD83D\uDE9A',  // 🚚
        pray : '\uD83D\uDE4F',  // 🙏
        heart: '\u2764\uFE0F',  // ❤️
        link : '\uD83D\uDD17',  // 🔗
        pack : '\uD83D\uDCE6',  // 📦
    };

    const L = [];
    L.push(E.cart + E.spark + ' *NUEVA ORDEN \u2014 TIENDAMAX* ' + E.spark + E.cart);
    L.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
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

    L.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
    if (subtotal > 0) {
        L.push(E.money + ' *Subtotal:* $' + subtotal.toFixed(2) + ' USD');
        const tasaFinal = (typeof getTasaMN === 'function') ? getTasaMN() : 0;
        if (tasaFinal > 0) {
            const totalMN = Math.round(subtotal * tasaFinal).toLocaleString('es-CU');
            L.push(E.chart + ' *Tasa:* 1 USD = ' + tasaFinal + ' MN');
            L.push(E.bill  + ' *TOTAL:* *' + totalMN + ' MN*');
        }
    }

    L.push('');
    L.push(E.truck + ' _Env\u00edame los datos para coordinar la entrega, por favor._');
    L.push('');
    L.push(E.pray + ' _\u00a1Gracias por tu compra!_ ' + E.heart);

    // Un solo producto con id → link al producto (WhatsApp genera miniatura con og:image)
    // Varios productos → link genérico a la tienda
    if (items.length === 1 && items[0].id) {
        L.push(E.link + ' https://tiendamax.org/p/producto-' + items[0].id + '.html');
    } else {
        L.push(E.link + ' https://tiendamax.org');
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
    const msg = _mensajeOrdenWA(carrito, pedidoId);
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

function mostrarFormResena() {
    const form = document.getElementById('formResena');
    const btn  = document.getElementById('btnAgregarResena');
    if (!form) return;
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? '+ Agregar reseña' : '✕ Cancelar';
    _estrellasSeleccionadas = 0;
    setEstrellas(0);
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
    document.querySelectorAll('.estrella-btn').forEach((btn, i) => {
        btn.classList.toggle('activa', i < n);
    });
}

function guardarResena() {
    if (!_detalleProductoActual) return;
    const autor = (document.getElementById('resenaAutor')?.value || '').trim();
    const texto = (document.getElementById('resenaTexto')?.value || '').trim();
    if (!autor) { mostrarNotificacion('⚠️ Escribe tu nombre', 'error'); return; }
    if (_estrellasSeleccionadas === 0) { mostrarNotificacion('⚠️ Selecciona una valoración', 'error'); return; }
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
                const r = await fetch(base + '/resenas/' + pid + '/' + ts + '.json', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nuevaResena)
                });
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

    // Leer desde Firebase (fuente de verdad)
    try {
        const base = _fbRtdbUrl();
        if (base) {
            const r = await fetch(base + '/resenas/' + pid + '.json');
            if (r.ok) {
                const data = await r.json();
                if (data && typeof data === 'object') {
                    resenas = Object.values(data).filter(Boolean).sort((a,b) => b.id - a.id);
                }
            }
        }
    } catch(e) {}

    // Fallback a localStorage si Firebase no responde
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
            '<span style="color:#f59e0b;font-size:16px;letter-spacing:1px;">' + '★'.repeat(Math.round(parseFloat(promedio))) + '</span>' +
            '<span style="font-weight:800;font-size:15px;color:#f2f2f5;">' + promedio + '</span>' +
            '<span style="font-size:12px;color:#9a9aa2;">(' + resenas.length + ' reseña' + (resenas.length !== 1 ? 's' : '') + ')</span>';
        ratingTop.style.display = 'inline-flex';
    }
    el.innerHTML =
        '<div style="text-align:center;margin-bottom:14px;">' +
            '<span style="font-size:28px;font-weight:900;color:#f59e0b;">' + promedio + '</span>' +
            '<span style="color:#f59e0b;font-size:18px;margin-left:6px;">' + '★'.repeat(Math.round(parseFloat(promedio))) + '</span>' +
            '<div style="font-size:12px;color:#aaa;">' + resenas.length + ' reseña' + (resenas.length !== 1 ? 's' : '') + '</div>' +
        '</div>' +
        resenas.map(r => {
            const e = Math.max(0, Math.min(5, parseInt(r.estrellas, 10) || 0));
            return '<div class="resena-item">' +
                '<div class="resena-top">' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span class="resena-autor">' + escapeHtml(r.autor) + '</span>' +
                        (r.comprador ? '<span style="font-size:10px;background:#1a3a1a;color:#4caf50;border:1px solid #4caf50;border-radius:4px;padding:1px 5px;">✓ Comprador</span>' : '') +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span class="resena-estrellas">' + '★'.repeat(e) + '☆'.repeat(5 - e) + '</span>' +
                        '<span class="resena-fecha">' + escapeHtml(r.fecha) + '</span>' +
                    '</div>' +
                '</div>' +
                '<p class="resena-texto">' + escapeHtml(r.texto) + '</p>' +
                (r.imagen && /^data:image\//.test(String(r.imagen))
                    ? '<img class="resena-foto" src="' + escapeAttr(r.imagen) + '" alt="Foto de la reseña" loading="lazy">'
                    : '') +
            '</div>';
        }).join('');
}

// ── TESTIMONIOS DINÁMICOS DESDE FIREBASE ────────────────
let _tmAllResenas = [];

function _renderTestimoniosPage(show) {
    const grid = document.getElementById('testimoniosGrid');
    const cta  = document.getElementById('testimoniosCTA');
    if (!grid || !_tmAllResenas.length) return;
    const stars = n => '⭐'.repeat(Math.min(5, Math.max(1, n)));
    grid.innerHTML = _tmAllResenas.slice(0, show).map(r =>
        '<div class="testimonio-card">' +
            '<div class="stars">' + stars(r.estrellas) + '</div>' +
            '<p>"' + escapeHtml(r.texto.substring(0, 180)) + '"</p>' +
            '<p class="autor">— ' + escapeHtml(r.autor) +
            (r.productoNombre ? ' <span style="font-size:10px;opacity:0.5;font-weight:400;">· ' + escapeHtml(r.productoNombre.substring(0, 30)) + '</span>' : '') +
            '</p></div>'
    ).join('');
    const remaining = _tmAllResenas.length - show;
    let btn = document.getElementById('nd-resenas-mas');
    if (remaining > 0) {
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'nd-resenas-mas';
            btn.style.cssText = 'text-align:center;margin-top:16px;';
            grid.insertAdjacentElement('afterend', btn);
        }
        btn.innerHTML = '<button onclick="_renderTestimoniosPage(' + (show + 4) + ')">Ver ' + remaining + ' reseña' + (remaining === 1 ? '' : 's') + ' más ↓</button>';
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

    try {
        const base = _fbRtdbUrl();
        if (!base) throw new Error('no config');

        // Leer todas las reseñas de todos los productos
        const r = await fetch(base + '/resenas.json?shallow=true');
        if (!r.ok) throw new Error('fetch failed ' + r.status);
        const productIds = await r.json();
        if (!productIds || typeof productIds !== 'object') throw new Error('empty');

        const pids = Object.keys(productIds).slice(0, 20);
        const allResenas = [];
        await Promise.all(pids.map(async pid => {
            try {
                const rp = await fetch(base + '/resenas/' + pid + '.json');
                if (!rp.ok) return;
                const data = await rp.json();
                if (data && typeof data === 'object') {
                    Object.values(data).filter(Boolean).forEach(r => allResenas.push(r));
                }
            } catch(e) {}
        }));

        if (allResenas.length === 0) throw new Error('no resenas');

        // Preferir 4+ estrellas, pero si no hay suficientes, incluir todas
        let mejores = allResenas
            .filter(r => r.estrellas >= 4 && r.texto && r.texto.length > 15)
            .sort((a, b) => b.id - a.id);

        if (mejores.length === 0) {
            mejores = allResenas
                .filter(r => r.texto && r.texto.length > 15)
                .sort((a, b) => b.id - a.id);
        }

        if (mejores.length === 0) throw new Error('no good resenas');

        _tmAllResenas = mejores;
        _renderTestimoniosPage(4);
        if (cta) cta.style.display = 'block';

    } catch(e) {
        // Solo limpiar si hay error de "vacío real" (Firebase configurado pero sin reseñas)
        // Si es error de conexión/config, dejar los skeletons
        const esVacio = e.message === 'no resenas' || e.message === 'no good resenas' || e.message === 'empty';
        if (esVacio) {
            grid.innerHTML = '';
            if (cta) {
                cta.style.display = 'block';
                cta.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:14px;margin-bottom:12px;">Sé el primero en dejar una reseña</p>';
            }
        }
        // Si es error de red/config: los skeletons siguen visibles (sin hacer nada)
        console.warn('cargarTestimoniosFirebase:', e.message);
        // Diagnóstico visible en admin (solo si la consola no es accesible)
        if (window._tmAdminMode && e.message !== 'no resenas' && e.message !== 'no good resenas' && e.message !== 'empty') {
            mostrarNotificacion('⚠️ Reseñas Firebase: ' + e.message, 'info');
        }
    }
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
    const id = safeNum(p.id);
    const nombre = escapeHtml(p.nombre);
    const img = escapeAttr(p.imagen || '');
    const precio = Number(p.precioActual || 0).toFixed(2);
    const agotado = p.stock === 0;
    return '<div class="rec-card" onclick="abrirDetalleProducto(' + id + ')">'
        + (agotado ? '<span class="rec-card-agotado">Agotado</span>' : '')
        + '<img src="' + img + '" alt="' + nombre + '" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
        + '<div class="rec-card-info">'
        +     '<div class="rec-card-nombre">' + nombre + '</div>'
        +     '<div class="rec-card-precio">$' + precio + '</div>'
        + '</div>'
        + '</div>';
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


