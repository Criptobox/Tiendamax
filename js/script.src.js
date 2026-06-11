'use strict';
// ===== VARIABLES GLOBALES INICIALIZADAS TEMPRANO (evitar TDZ) =====
var countdownIntervals = {};
let _monedaActual = localStorage.getItem('monedaActual') || 'USD';

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
let wishlist = JSON.parse(localStorage.getItem('wishlist_v1') || '[]').map(String);

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
            '<img class="carrito-item-img" src="' + imagen + '" alt="' + nombre + '" onerror="this.style.display=\'none\'">'  +
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
        return '<div class="cs-card" style="cursor:pointer" onclick="if(typeof cerrarCarrito===\'function\')cerrarCarrito();abrirDetalleProducto(' + idSafe + ')">' +
            '<img class="cs-card-img" src="' + img + '" alt="' + nombre + '" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<div class="cs-card-body">' +
                '<div class="cs-card-nombre">' + nombre + '</div>' +
                '<div class="cs-card-precio">$' + Number(p.precioActual).toFixed(2) + ' USD</div>' +
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
function _mensajeOrdenWA(items) {
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
    guardarPedidoCliente(carrito.slice());
    if (typeof tmTrackWhatsApp === 'function') carrito.forEach(i => tmTrackWhatsApp(i.id));
    carrito.forEach(i => tmRegistrarInteresWhatsApp(i.id, 'carrito'));
    const msg = _mensajeOrdenWA(carrito);
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
            const arr = JSON.parse(localStorage.getItem('tm_interesados_whatsapp') || '[]');
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
        autor: autor.substring(0, 50),
        texto: texto.substring(0, 400),
        estrellas: _estrellasSeleccionadas,
        fecha: new Date().toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }),
        productoId: pid,
        productoNombre: _detalleProductoActual.nombre || '',
        comprador: !!(document.getElementById('resenaComprador')?.checked)
    };

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
        const resenas = JSON.parse(localStorage.getItem(key) || '[]');
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
            resenas = JSON.parse(localStorage.getItem(key) || '[]');
        }
    }

    if (resenas.length === 0) {
        el.innerHTML = '<p class="resenas-vacio">Sé el primero en dejar una reseña 🌟</p>';
        return;
    }
    const promedio = (resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length).toFixed(1);
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
            '</div>';
        }).join('');
}

// ── TESTIMONIOS DINÁMICOS DESDE FIREBASE ────────────────
async function cargarTestimoniosFirebase() {
    const grid = document.getElementById('testimoniosGrid');
    const cta  = document.getElementById('testimoniosCTA');
    if (!grid) return;

    try {
        const base = _fbRtdbUrl();
        if (!base) throw new Error('no config');

        // Leer todas las reseñas de todos los productos
        const r = await fetch(base + '/resenas.json?shallow=true');
        if (!r.ok) throw new Error('fetch failed');
        const productIds = await r.json();
        if (!productIds || typeof productIds !== 'object') throw new Error('empty');

        // Buscar reseñas de cada producto en paralelo (máx 6 para no saturar)
        const pids = Object.keys(productIds).slice(0, 6);
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

        // Ordenar por más recientes y tomar las mejores con 4-5 estrellas
        const mejores = allResenas
            .filter(r => r.estrellas >= 4 && r.texto && r.texto.length > 15)
            .sort((a, b) => b.id - a.id)
            .slice(0, 6);

        if (mejores.length === 0) throw new Error('no good resenas');

        const stars = n => '⭐'.repeat(Math.min(5, Math.max(1, n)));

        grid.innerHTML = mejores.map(r =>
            '<div class="testimonio-card">' +
                '<div class="stars">' + stars(r.estrellas) + '</div>' +
                '<p>"' + escapeHtml(r.texto.substring(0, 200)) + '"</p>' +
                '<p class="autor">— ' + escapeHtml(r.autor) +
                (r.productoNombre ? ' <span style="font-size:10px;opacity:0.5;font-weight:400;">· ' + escapeHtml(r.productoNombre.substring(0, 30)) + '</span>' : '') +
                '</p>' +
            '</div>'
        ).join('');

        if (cta) cta.style.display = 'block';

    } catch(e) {
        // Sin reseñas reales aún — mostrar mensaje invitando a dejar una
        grid.innerHTML =
            '<div class="testimonio-card" style="grid-column:1/-1;text-align:center;padding:40px;">' +
                '<div style="font-size:40px;margin-bottom:12px;">⭐</div>' +
                '<p style="color:rgba(255,255,255,0.5);font-size:15px;">Aún no hay reseñas. ¡Sé el primero en compartir tu experiencia!</p>' +
            '</div>';
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
        + '<img src="' + img + '" alt="' + nombre + '" loading="lazy" onerror="this.style.display=\'none\'">'
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


// ===== CONFIGURACIÓN GLOBAL =====
// Constantes para autenticacion PBKDF2
const AUTH_SALT_KEY = 'tm_auth_salt_v3';
const AUTH_HASH_KEY = 'tm_auth_hash_v3';
const AUTH_ITERATIONS = 310000;

function _generarSal() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _getSalt() {
    let salt = localStorage.getItem(AUTH_SALT_KEY);
    if (!salt) {
        salt = _generarSal();
        try { localStorage.setItem(AUTH_SALT_KEY, salt); } catch(e) {}
    }
    return salt;
}

// SHA-256 para migración desde hashes hardcodeados viejos
async function _hashSha256(password) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';
let subcategoriaSeleccionada = 'Todas';

// Iconos para cada categoría (Mapeo automático por palabras clave)
const ICONOS_MAPA = {
    'wifi': '📡', 'internet': '📡', 'red': '📡', 'router': '📡',
    'energia': '⚡', 'bateria': '⚡', 'luz': '⚡', 'corriente': '⚡', 'inversor': '⚡',
    'celular': '📱', 'telefono': '📱', 'movil': '📱', 'iphone': '📱', 'android': '📱',
    'utiles': '🔧', 'herramienta': '🔧', 'reparacion': '🔧', 'ferreteria': '🔧',
    'ropa': '👗', 'vestir': '👗', 'moda': '👗', 'calzado': '👗', 'zapatos': '👗',
    'electronica': '💻', 'computadora': '💻', 'laptop': '💻', 'tecnologia': '💻',
    'hogar': '🏠', 'casa': '🏠', 'mueble': '🏠', 'cocina': '🏠',
    'alimento': '🍎', 'comida': '🍎', 'fruta': '🍎', 'dulce': '🍎',
    'belleza': '💄', 'maquillaje': '💄', 'perfume': '💄', 'cuidado': '💄',
    'deporte': '⚽', 'gym': '⚽', 'ejercicio': '⚽', 'fitness': '⚽',
    'juguete': '🧸', 'niño': '🧸', 'bebe': '🧸', 'diversion': '🧸',
    'libro': '📚', 'estudio': '📚', 'papeleria': '📚', 'escuela': '📚',
    'auto': '🚗', 'carro': '🚗', 'moto': '🚗', 'vehiculo': '🚗', 'repuesto': '🚗',
    'reloj': '⌚', 'joya': '💎', 'accesorio': '💍',
    'mascota': '🐾', 'perro': '🐾', 'gato': '🐾',
    'musica': '🎵', 'audio': '🔊', 'sonido': '🔊',
    'viaje': '✈️', 'maleta': '🧳',
    'general': '🛍️'
};

// Cargar iconos personalizados desde localStorage
let iconosPersonalizados = JSON.parse(localStorage.getItem('iconosPersonalizados')) || {};

function obtenerIconoCategoria(nombre) {
    if (!nombre) return '🛍️';
    
    // 1. Prioridad: Icono personalizado guardado por el usuario
    if (iconosPersonalizados[nombre]) return iconosPersonalizados[nombre];
    
    // 2. Mapeo automático por palabras clave
    const nombreMinus = nombre.toLowerCase();
    for (const [clave, icono] of Object.entries(ICONOS_MAPA)) {
        if (nombreMinus.includes(clave)) return icono;
    }
    
    // 3. Por defecto: Icono de "Todos" (🛍️) si no se encuentra nada
    return '🛍️';
}


// ═══════════════════════════════════════════════════════
//  BÚSQUEDA HERO — con IA (Claude API)
// ═══════════════════════════════════════════════════════
let _heroSearchActivo = '';
let _heroPrecioMin    = 0;
let _heroPrecioMax    = Infinity;
let _heroSearchTimer  = null;
let _aiSearchTimer    = null;

function abrirPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (!panel) return;
    panel.classList.add('visible');
    if (bar) bar.classList.add('open');
    setTimeout(() => document.getElementById('heroSearchInput')?.focus(), 50);
}

function cerrarPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (panel) panel.classList.remove('visible');
    if (bar)   bar.classList.remove('open');
}

// Stubs de compatibilidad
function inicializarSliderPrecios() {}
function actualizarSliderPrecio() {}

// Búsqueda local rápida
function busquedaLocal(q) {
    if (!q) return productos.slice(0, 6);
    const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ql = norm(q);
    return productos.filter(p =>
        norm(p.nombre).includes(ql) ||
        norm(p.descripcion).includes(ql) ||
        norm(p.categoria).includes(ql) ||
        norm(p.subcategoria).includes(ql)
    ).slice(0, 6);
}

// Búsqueda inteligente local (sin depender de APIs externas)
async function busquedaConIA(q) {
    if (!q || q.length < 3 || productos.length === 0) return null;

    const normalizar = (txt) => String(txt || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ');

    const alias = {
        wifi: ['router', 'internet', 'red', 'repetidor'],
        internet: ['wifi', 'router', 'red'],
        bateria: ['bateria', 'power bank', 'energia', 'corriente'],
        energia: ['inversor', 'bateria', 'corriente', 'solar'],
        corriente: ['energia', 'inversor', 'bateria'],
        telefono: ['celular', 'movil', 'smartphone'],
        celular: ['telefono', 'movil', 'smartphone'],
        laptop: ['computadora', 'pc'],
        computadora: ['laptop', 'pc'],
        camara: ['foto', 'fotografia'],
        tv: ['televisor', 'monitor']
    };

    const tokensBase = normalizar(q).split(/\s+/).filter(Boolean);
    const tokens = new Set(tokensBase);
    tokensBase.forEach(t => (alias[t] || []).forEach(a => tokens.add(a)));

    const resultados = productos
        .map(p => {
            const texto = normalizar([p.nombre, p.descripcion, p.categoria, p.subcategoria].join(' '));
            let score = 0;
            tokens.forEach(t => {
                if (!t) return;
                if (texto.includes(t)) score += 2;
                if (normalizar(p.nombre).includes(t)) score += 4;
                if (normalizar(p.categoria).includes(t) || normalizar(p.subcategoria).includes(t)) score += 2;
            });
            if (normalizar(p.nombre).includes(normalizar(q))) score += 8;
            if (score === 0) return null;
            return { producto: p, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.producto.stock - b.producto.stock)
        .slice(0, 5)
        .map(x => x.producto);

    return resultados.length ? resultados : null;
}

function renderSugerencias(resultados, q) {
    const sugBox = document.getElementById('heroSearchSuggestions');
    if (!sugBox) return;
    if (!resultados || resultados.length === 0) {
        // Mostrar más vendidos como sugerencia cuando no hay resultados
        const sugeridos = productos
            .filter(p => p.stock > 0 && (p.masVendido === true || p.masVendido === 'true'))
            .slice(0, 4);
        const fallback = sugeridos.length > 0 ? sugeridos : productos.filter(p => p.stock > 0).slice(0, 4);
        if (fallback.length === 0) {
            sugBox.innerHTML = '<div class="hsb-sug-empty">😕 Sin resultados para "' + escapeHtml(q) + '"</div>';
            return;
        }
        const items = fallback.map(p =>
            '<div class="hsb-sug-item" onclick="seleccionarSugerencia(' + safeNum(p.id) + ')">' +
            '<img class="hsb-sug-img" src="' + escapeAttr(p.imagen) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<span class="hsb-sug-name">' + escapeHtml(p.nombre) + '</span>' +
            '<span class="hsb-sug-price">$' + Number(p.precioActual).toFixed(2) + '</span>' +
            '</div>'
        ).join('');
        sugBox.innerHTML =
            '<div class="hsb-sug-empty" style="padding:8px 12px;font-size:12px;">😕 Sin resultados para "' + escapeHtml(q) + '"</div>' +
            '<div style="padding:6px 12px;font-size:11px;opacity:0.6;border-top:1px solid rgba(255,255,255,0.08);">🔥 Te puede interesar</div>' +
            items;
        return;
    }
    sugBox.innerHTML = resultados.map(p => {
        // resaltarTexto ya genera HTML controlado a partir de p.nombre escapado
        const nombre = q ? resaltarTexto(escapeHtml(p.nombre), q) : escapeHtml(p.nombre);
        const agotadoBadge = p.stock === 0 ? '<span style="color:#e74c3c;font-size:10px;font-weight:700;margin-left:4px;">AGOTADO</span>' : '';
        return '<div class="hsb-sug-item" onclick="seleccionarSugerencia(' + safeNum(p.id) + ')">' +
            '<img class="hsb-sug-img" src="' + escapeAttr(p.imagen) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<span class="hsb-sug-name">' + nombre + agotadoBadge + '</span>' +
            '<span class="hsb-sug-price">$' + Number(p.precioActual).toFixed(2) + '</span>' +
            '</div>';
    }).join('');
}

async function buscarDesdeHero(query) {
    clearTimeout(_heroSearchTimer);
    clearTimeout(_aiSearchTimer);
    const q = (query || '').trim();
    const sugBox = document.getElementById('heroSearchSuggestions');
    const aiLabel = document.getElementById('hsb-ai-label');
    if (!q) {
        if (sugBox) sugBox.innerHTML = '';
        if (aiLabel) aiLabel.style.display = 'none';
        return;
    }
    _heroSearchTimer = setTimeout(async () => {
        const locales = busquedaLocal(q);
        renderSugerencias(locales, q);
        if (q.length >= 3) {
            if (aiLabel) aiLabel.style.display = 'block';
            if (locales.length < 2 && sugBox) {
                sugBox.innerHTML = '<div class="hsb-ai-loading">🤖 Buscando con IA</div>';
            }
            _aiSearchTimer = setTimeout(async () => {
                const iaResultados = await busquedaConIA(q);
                if (iaResultados && iaResultados.length > 0) {
                    renderSugerencias(iaResultados, q);
                } else {
                    renderSugerencias(locales.length > 0 ? locales : [], q);
                }
            }, 600);
        }
    }, 150);
}

function _tmRegistrarBusqueda(q) {
    try {
        const base = _fbRtdbUrl();
        if (!base) return;
        const key = q.replace(/[.#$/[\]]/g, '_').slice(0, 60);
        const url = base + '/analytics/busquedas/' + encodeURIComponent(key) + '.json';
        fetch(url + '?_=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : 0)
            .then(count => fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify((Number(count) || 0) + 1)
            }))
            .catch(() => {});
    } catch(e) {}
}

function aplicarBusquedaHero() {
    const q = (document.getElementById('heroSearchInput')?.value || '').trim().toLowerCase();
    _heroSearchActivo = q;
    if (q.length >= 2) {
        try {
            const _bs = JSON.parse(localStorage.getItem('tm_busquedas_v1') || '{}');
            _bs[q] = (_bs[q] || 0) + 1;
            localStorage.setItem('tm_busquedas_v1', JSON.stringify(_bs));
            _tmRegistrarBusqueda(q);
        } catch(e) {}
    }
    _heroPrecioMin = 0;
    _heroPrecioMax = Infinity;
    cerrarPanelBusqueda();
    mostrarVistaCategoria('Todas');
}

function seleccionarSugerencia(id) {
    cerrarPanelBusqueda();
    abrirDetalleProducto(id);
}

function resaltarTexto(texto, query) {
    try {
        const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return texto.replace(re, '<mark style="background:rgba(201,169,110,0.25);color:inherit;border-radius:3px;padding:0 2px;">$1</mark>');
    } catch(e) { return texto; }
}

// Cerrar panel al tocar fuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.hsb-wrap')) cerrarPanelBusqueda();
});

// ═══════════════════════════════════════════════════════
//  SUBIDA DE IMÁGENES A GITHUB (archivos .jpg reales)
// ═══════════════════════════════════════════════════════
async function subirImagenAGitHub(fileOrBase64) {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');

    const base64full = await comprimirImagen(fileOrBase64);

    if (!user || !repo || !token) return base64full; // fallback sin config

    try {
        const base64data = base64full.includes(',') ? base64full.split(',')[1] : base64full;
        if (!base64data) return base64full; // fallback si el data URL está malformado
        const filename   = 'img_' + Date.now() + '.jpg';
        const path       = 'imagenes/' + filename;
        const apiUrl     = 'https://api.github.com/repos/' + user + '/' + repo + '/contents/' + path;
        const headers    = { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' };
        const res = await fetch(apiUrl, {
            method: 'PUT', headers,
            body: JSON.stringify({ message: 'Imagen: ' + filename, content: base64data })
        });
        if (res.ok) return 'https://raw.githubusercontent.com/' + user + '/' + repo + '/main/' + path;
    } catch(e) { /* fallback */ }
    return base64full;
}

// ═══════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════
function stat(icon, label, value, color) {
    const uid = 'ts' + Math.random().toString(36).slice(2,7);
    const sizeCls = typeof value === 'number' ? 'admin-stat-value' : 'admin-stat-value';
    const html = '<div class="admin-analytics-stat">' +
        '<div class="icon">' + icon + '</div>' +
        '<div id="' + uid + '" class="tm-counter ' + sizeCls + '" style="color:' + (color||'var(--primary-color,#c9a96e)') + ';">' + value + '</div>' +
        '<div class="label">' + label + '</div>' +
        '</div>';
    setTimeout(() => {
        const el = document.getElementById(uid);
        if (!el) return;
        if (typeof value === 'number') {
            animarContador(el, value, 800 + Math.random() * 500);
        } else if (typeof value === 'string' && value.startsWith('$')) {
            animarContador(el, parseFloat(value.replace('$','')), 1000, '$');
        }
    }, 60);
    return html;
}

// ===== VALIDACIÓN DE CAMPOS =====

function validarProducto(producto) {
    const errores = [];
    
    if (!producto.nombre || producto.nombre.trim().length === 0) {
        errores.push('El nombre del producto es requerido');
    }
    if (!producto.descripcion || producto.descripcion.trim().length === 0) {
        errores.push('La descripción es requerida');
    }
    if (!producto.imagen) {
        errores.push('La imagen es requerida');
    }
    if (!producto.precioActual || producto.precioActual <= 0) {
        errores.push('El precio debe ser mayor a 0');
    }
    // FIX: permitir stock = 0 (producto agotado al crearlo). Solo rechazar negativos o no-números.
    if (producto.stock === undefined || producto.stock === null ||
        isNaN(Number(producto.stock)) || Number(producto.stock) < 0) {
        errores.push('El stock no puede ser negativo');
    }
    if (!producto.categoria) {
        errores.push('La categoría es requerida');
    }
    
    // Solo calcular descuento si hay precio original definido
    if (producto.precioOriginal && producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) {
        const descuentoCalculado = Math.round(((producto.precioOriginal - producto.precioActual) / producto.precioOriginal) * 100);
        producto.descuento = descuentoCalculado;
    } else if (!producto.descuento) {
        producto.descuento = 0;
    }
    
    return errores;
}

// ===== CARGA DE DATOS DESDE GITHUB =====

// Función para hashear la contraseña (PBKDF2). salt opcional (default: _getSalt())
async function hashPassword(password, salt) {
    const s = salt || _getSalt();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: new TextEncoder().encode(s), iterations: AUTH_ITERATIONS, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const hashArray = Array.from(new Uint8Array(bits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cargarDatosDesdeGitHub() {
    // Intentar usar raw.githubusercontent.com si está configurado (no tiene límite de 1MB)
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    const baseUrl = (ghUser && ghRepo)
        ? `https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main`
        : null;

    // Función helper: intenta raw primero, luego relativo
    // cache:'no-cache' = GET condicional (304 si no cambió → sin re-descarga)
    async function fetchJSON(filename) {
        const opts = { cache: 'no-cache' };
        if (baseUrl) {
            try {
                const res = await fetch(`${baseUrl}/${filename}`, opts);
                if (res.ok) return await res.json();
            } catch(e) {}
        }
        // Fallback: ruta relativa (funciona en GitHub Pages)
        try {
            const res = await fetch(filename, opts);
            if (res.ok) return await res.json();
        } catch(e) {}
        return null;
    }

    try {
        // ── PASO 1: Solo categorias.json (pequeño) — config no crítica se carga después ──
        const [dataCat, dataComisiones] = await Promise.all([
            fetchJSON('categorias.json').catch(() => null),
            Promise.resolve(null), // comisiones consolidadas en productos.json
        ]);
        // Config no crítica: se carga en background sin bloquear la UI
        setTimeout(async () => {
            try {
                const [dataG, dataR] = await Promise.all([
                    fetchJSON('grupos_facebook_config.json').catch(() => null),
                    fetchJSON('revolico_config.json').catch(() => null),
                ]);
                if (dataG && dataG.grupos) localStorage.setItem('gruposFB', JSON.stringify(dataG.grupos));
                if (dataR && Object.keys(dataR).length > 0) localStorage.setItem('revolicoConfig', JSON.stringify(dataR));
            } catch(e) {}
        }, 4000);

        // Aplicar categorías de inmediato para que el grid aparezca rápido
        if (dataCat) {
            if (Array.isArray(dataCat) && dataCat.length > 0) {
                categorias = dataCat;
                localStorage.setItem('categorias', JSON.stringify(categorias));
            } else if (dataCat.nombres && dataCat.nombres.length > 0) {
                categorias = dataCat.nombres;
                localStorage.setItem('categorias', JSON.stringify(categorias));
                if (dataCat.iconos && Object.keys(dataCat.iconos).length > 0) {
                    Object.assign(iconosPersonalizados, dataCat.iconos);
                    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
                }
            }
        }

        // comisiones consolidadas en productos.json — no se usa archivo separado
        // grupos FB y revolico config se cargan en background (setTimeout arriba)

        // Ventas migradas a Firebase — sync en background tras cargar productos
        setTimeout(_fbSincronizarVentasAlIniciar, 2000);

        // Renderizar categorías YA (con datos frescos, sin esperar archivos pesados)
        renderizarCategoriasHomeInstant(); // actualiza el grid visual inmediatamente
        renderizarCategoriasHome();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();

        // ── PASO 2: Cargar archivos pesados en paralelo (banners + productos) ──
        const [dataBanners, dataProd] = await Promise.all([
            fetchJSON('banners.json').catch(() => null),
            fetchJSON('productos.json').catch(() => null),
        ]);

        // Aplicar banners
        if (dataBanners && Array.isArray(dataBanners) && dataBanners.length > 0) {
            localStorage.setItem('heroBanners', JSON.stringify(dataBanners));
            if (typeof window.recargarBanners === 'function') window.recargarBanners(dataBanners);
        }

        // Aplicar productos
        if (dataProd && dataProd.length > 0) {
            // Guardar en localStorage ANTES de renderizar para que Instant tenga datos frescos
            const productosLocales = JSON.parse(localStorage.getItem('productos') || '[]');
            const mapaLocal = {};
            productosLocales.forEach(p => { mapaLocal[p.id] = p; });

            productos = dataProd.map(p => {
                const fix = url => url && url.includes('raw.githubusercontent.com')
                    ? url.replace(/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\//,'https://tiendamax.org/')
                    : url;
                if (p.imagen) p.imagen = fix(p.imagen);
                if (p.imagenSecundaria) p.imagenSecundaria = fix(p.imagenSecundaria);
                if (Array.isArray(p.imagenes)) p.imagenes = p.imagenes.map(fix);

                // comision viene directamente del producto en productos.json
                const local = mapaLocal[p.id];
                if (local && local.comision !== undefined && p.comision === undefined) {
                    p.comision = local.comision;
                }
                if (local && local.resenas && local.resenas.length > 0) p.resenas = local.resenas;
                return p;
            });
            localStorage.setItem('productos', JSON.stringify(productos));
            // Refrescar categorías con conteos reales ahora que productos está listo
            renderizarCategoriasHomeInstant();
        }

        // Re-renderizar todo ahora que los productos están listos
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarRecientes();  // 👀 Vistos recientemente
        setTimeout(cargarTestimoniosFirebase, 1500); // 🌟 Testimonios reales
        actualizarListaProductos();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        verificarOfertasYMostrarBanner();
        // Si el admin está abierto, actualizar el select de oferta del día
        // con los productos frescos recién cargados
        const adminAbierto = document.getElementById('adminPanel');
        if (adminAbierto && adminAbierto.classList.contains('visible')) {
            poblarSelectOfertaDia();
        }
        inicializarSliderPrecios();
        // Refrescar Me Gusta si está visible
        const vMG = document.getElementById('vistaMeGusta');
        if (vMG && vMG.style.display !== 'none') mostrarVistaMeGusta();
        verificarProductosNuevos();

        // CRÍTICO: si el usuario YA navegó a una categoría mientras se cargaba,
        // re-renderizar la vista de productos con los datos frescos.
        const vCat = document.getElementById('vistaCategoria');
        if (vCat && vCat.style.display === 'block') {
            
            renderizarProductos();
        }

        
    } catch (e) {
        console.warn('⚠️ Error en cargarDatosDesdeGitHub:', e && e.message);

        renderizarCategoriasHome();
        renderizarMasVendidos();
        setTimeout(cargarTestimoniosFirebase, 1500);
        verificarOfertasYMostrarBanner();
        // También re-render si estamos en vista categoría
        const vCat = document.getElementById('vistaCategoria');
        if (vCat && vCat.style.display === 'block' && typeof renderizarProductos === 'function') {
            renderizarProductos();
        }
    }
}

// Sincronizar entre pestañas
window.addEventListener('storage', (event) => {
    if (event.key === 'productos') {
        productos = JSON.parse(event.newValue) || [];
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
    }
    if (event.key === 'categorias') {
        categorias = JSON.parse(event.newValue) || ['General'];
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarCategoriasHome();
        renderizarProductos();
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    }
});

// ===== FUNCIONES DE UTILIDAD =====

function actualizarOffsetsUI() {
    try {
        const root = document.documentElement;
        const urg = document.getElementById('urgenciaBanner');
        const header = document.querySelector('.header');
        const headerContent = document.querySelector('.header-content');
        const currencyBar = document.getElementById('currencyBar');
        const urgVisible = urg && getComputedStyle(urg).display !== 'none';
        const urgH = urgVisible ? Math.ceil(urg.getBoundingClientRect().height) : 0;
        // --tm-header-h debe representar solo la fila superior del header.
        // Antes se medía .header completo, que incluye la barra de moneda; eso
        // duplicaba el offset y podía provocar saltos/solapes al hacer scroll.
        const headerH = headerContent
            ? Math.ceil(headerContent.getBoundingClientRect().height)
            : (header ? Math.ceil(header.getBoundingClientRect().height) : 70);
        const currencyH = currencyBar ? Math.ceil(currencyBar.getBoundingClientRect().height) : 0;
        root.style.setProperty('--tm-urgencia-h', urgH + 'px');
        root.style.setProperty('--tm-header-h', headerH + 'px');
        root.style.setProperty('--tm-currency-h', currencyH + 'px');
    } catch (e) {}
}


function getNumeroWhatsApp() {
    return localStorage.getItem('whatsappNumero') || '5354320170';
}

function guardarNumeroWhatsApp() {
    const input = document.getElementById('adminWhatsappNum');
    if (!input) return;
    const num = input.value.trim().replace(/\D/g, '');
    if (!num || num.length < 6) { mostrarNotificacion('⚠️ Número inválido', 'error'); return; }
    localStorage.setItem('whatsappNumero', num);
    mostrarNotificacion('✅ Número de WhatsApp guardado: +' + num);
}

function cargarNumeroWhatsApp() {
    const saved = localStorage.getItem('whatsappNumero');
    const input = document.getElementById('adminWhatsappNum');
    if (input && saved) input.value = saved;
}

function contactarWhatsApp() {
    const numeroWhatsApp = getNumeroWhatsApp();
    const mensaje = encodeURIComponent('Hola, me interesa conocer más sobre tus productos. ¿Puedes ayudarme?');
    window.open(`https://wa.me/${numeroWhatsApp}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
}

function scrollToProductos() {
    const el = document.querySelector('#categorias-home');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════════
//  🌗 MODO CLARO / OSCURO
//  El sitio es OSCURO por defecto (tema premium).
//  El usuario puede alternar a CLARO con el botón ☀️/🌙.
//  Se guarda en localStorage como 'tm_theme' = 'light' | 'dark'
// ═══════════════════════════════════════════════════════
function aplicarTema(tema) {
    // tema: 'light' o 'dark' (cualquier otra cosa = dark)
    const claro = (tema === 'light');
    document.body.classList.toggle('light-mode', claro);
    // Limpiar la clase preliminar que pusimos en <html> para evitar parpadeo
    document.documentElement.classList.remove('tm-pre-light');
    // Actualizar TODOS los botones de tema (puede haber más de uno)
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        // En claro mostramos 🌙 (acción = ir a oscuro). En oscuro mostramos ☀️.
        btn.textContent = claro ? '🌙' : '☀️';
        btn.setAttribute('aria-label', claro ? 'Activar modo oscuro' : 'Activar modo claro');
        btn.setAttribute('title',      claro ? 'Activar modo oscuro' : 'Activar modo claro');
    });
    // Color del navegador (theme-color del browser bar)
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', claro ? '#FAF8F5' : '#0D0D0D');
    try { localStorage.setItem('tm_theme', claro ? 'light' : 'dark'); } catch(e) {}
}

function toggleDarkMode() {
    const esClaroAhora = document.body.classList.contains('light-mode');
    aplicarTema(esClaroAhora ? 'dark' : 'light');
}

function _initTema() {
    let pref = null;
    try { pref = localStorage.getItem('tm_theme'); } catch(e) {}
    // Migración suave desde la versión anterior (darkMode booleano)
    if (pref === null) {
        try {
            const legacy = localStorage.getItem('darkMode');
            if (legacy === 'false') pref = 'light';
            else pref = 'dark';
            localStorage.setItem('tm_theme', pref);
            localStorage.removeItem('darkMode');
        } catch(e) { pref = 'dark'; }
    }
    aplicarTema(pref === 'light' ? 'light' : 'dark');
}
// Ejecutar lo antes posible
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initTema);
} else {
    _initTema();
}

function mostrarNotificacion(mensaje, tipo = 'success') {
    const notif = document.createElement('div');
    notif.className = `notificacion notif-${tipo}`;
    notif.textContent = mensaje;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${tipo === 'error' ? '#e74c3c' : tipo === 'info' ? '#3498db' : '#27ae60'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
}

function _tmToastProducto(p) {
    document.querySelectorAll('.tm-toast-prod').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = 'tm-toast-prod';
    const img = document.createElement('img');
    img.className = 'tm-toast-img';
    img.src = p.imagen || '';
    img.alt = '';
    const info = document.createElement('div');
    info.className = 'tm-toast-info';
    const nombre = document.createElement('div');
    nombre.className = 'tm-toast-nombre';
    nombre.textContent = p.nombre;
    const precio = document.createElement('div');
    precio.className = 'tm-toast-precio';
    precio.textContent = typeof formatPrecio === 'function' ? formatPrecio(p.precioActual) : ('$' + Number(p.precioActual).toFixed(2) + ' USD');
    info.appendChild(nombre);
    info.appendChild(precio);
    const check = document.createElement('div');
    check.className = 'tm-toast-check';
    check.textContent = '✓';
    toast.appendChild(img);
    toast.appendChild(info);
    toast.appendChild(check);
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 250); }, 3000);
}

// ===== NAVEGACIÓN ENTRE VISTAS =====

function tmElementoVisible(id) {
    const el = document.getElementById(id);
    return !!(el && getComputedStyle(el).display !== 'none');
}

function tmVistaInicioActiva() {
    const bodyBloqueaBanner = document.body && document.body.classList.contains('tm-no-oferta-banner');
    const inicio = document.getElementById('vistaInicio');
    const inicioVisible = !inicio || getComputedStyle(inicio).display !== 'none';
    const detalleAbierto = tmElementoVisible('productDetailModal') && !document.getElementById('productDetailModal').classList.contains('hidden');
    const otraVistaVisible = tmElementoVisible('vistaCategoria') || tmElementoVisible('vistaMeGusta') || tmElementoVisible('vistaPedidos');
    return inicioVisible && !detalleAbierto && !otraVistaVisible && !bodyBloqueaBanner;
}

function actualizarVisibilidadBannerOferta(esHome) {
    const banner = document.getElementById('urgenciaBanner');
    if (document.body) document.body.classList.toggle('tm-no-oferta-banner', !esHome);
    if (!banner) return;
    if (esHome) {
        if (document.body) document.body.classList.remove('tm-no-oferta-banner');
        verificarOfertasYMostrarBanner();
    } else {
        banner.style.setProperty('display', 'none', 'important');
        banner.onclick = null;
        if (typeof actualizarOffsetsUI === 'function') setTimeout(actualizarOffsetsUI, 0);
    }
}

function mostrarVistaInicio() {
    document.getElementById('vistaInicio').style.display = 'block';
    document.getElementById('vistaCategoria').style.display = 'none';
    actualizarVisibilidadBannerOferta(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarVistaCategoria(categoria) {
    categoriaSeleccionada = categoria;
    subcategoriaSeleccionada = 'Todas';

    // RESILIENCIA: si el array de productos en memoria está vacío
    // pero hay datos en localStorage (caso PWA con cache), recargarlos.
    if ((!Array.isArray(productos) || productos.length === 0)) {
        try {
            const cached = JSON.parse(localStorage.getItem('productos') || '[]');
            if (Array.isArray(cached) && cached.length > 0) {
                productos = cached;
                
            }
        } catch(e) {}
    }

    // Si navegamos a una categoría específica (no "Todas"), limpiar filtros
    // de búsqueda previos para que aparezcan todos los productos de la categoría.
    // Si vamos a "Todas", mantener los filtros (puede venir de aplicarBusquedaHero).
    if (categoria !== 'Todas') {
        _heroSearchActivo = '';
        _heroPrecioMin = 0;
        _heroPrecioMax = Infinity;
        const heroInput = document.getElementById('heroSearchInput');
        if (heroInput) heroInput.value = '';
    }
    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaCategoria').style.display = 'block';
    actualizarVisibilidadBannerOferta(false);

    const icono = obtenerIconoCategoria(categoria);
    const titulo = categoria === 'Todas' ? '🛍️ Todos los Productos' : `${icono} ${categoria}`;
    document.getElementById('tituloCategoriaActual').textContent = titulo;

    actualizarBotonesCategorias();
    renderizarSubcategoriaTabs();
    renderizarProductos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderizarSubcategoriaTabs() {
    const tabsContainer = document.getElementById('subcategoriaTabs');
    if (!tabsContainer) return;

    // Cuando es "Todas" no hay subcategoría tabs
    if (categoriaSeleccionada === 'Todas') {
        tabsContainer.style.display = 'none';
        return;
    }

    // Obtener subcategorías de la categoría actual
    const subcats = (typeof subcategorias !== 'undefined' && subcategorias[categoriaSeleccionada]) 
        ? subcategorias[categoriaSeleccionada] 
        : [];

    if (subcats.length === 0) {
        tabsContainer.style.display = 'none';
        return;
    }

    tabsContainer.style.display = 'flex';
    tabsContainer.innerHTML = '';

    // Tab "Todas" para esta categoría
    const tabTodas = document.createElement('button');
    tabTodas.className = `subcategoria-tab ${subcategoriaSeleccionada === 'Todas' ? 'active' : ''}`;
    tabTodas.innerHTML = `<span class="tab-icon">🔎</span><span class="tab-label">Todos</span>`;
    tabTodas.onclick = () => seleccionarSubcategoria('Todas');
    tabsContainer.appendChild(tabTodas);

    subcats.forEach(subcat => {
        const tab = document.createElement('button');
        tab.className = `subcategoria-tab ${subcategoriaSeleccionada === subcat ? 'active' : ''}`;
        tab.innerHTML = `<span class="tab-label">${escapeHtml(subcat)}</span>`;
        tab.onclick = () => seleccionarSubcategoria(subcat);
        tabsContainer.appendChild(tab);
    });

    // Actualizar stats
    actualizarCategoriaStats();
}

function seleccionarSubcategoria(subcat) {
    subcategoriaSeleccionada = subcat;
    renderizarSubcategoriaTabs();
    renderizarProductos();
}

function actualizarCategoriaStats() {
    const statsEl = document.getElementById('categoriaStats');
    if (!statsEl) return;
    const total = categoriaSeleccionada === 'Todas' 
        ? productos.length 
        : productos.filter(p => p.categoria === categoriaSeleccionada).length;
    statsEl.textContent = `${total} producto${total !== 1 ? 's' : ''}`;
}

function volverAlInicio() {
    mostrarVistaInicio();
}

// ===== RENDERIZAR CATEGORÍAS EN LA HOME =====

function renderizarCategoriasHome() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const cardTodas = document.createElement('div');
    cardTodas.className = 'categoria-card';
    const totalProductos = productos.length;
    cardTodas.innerHTML = `
        <span class="cat-icon">🛍️</span>
        <span class="cat-name">Todos</span>
        <span class="cat-count">${safeNum(totalProductos)} producto${totalProductos !== 1 ? 's' : ''}</span>
    `;
    cardTodas.onclick = () => mostrarVistaCategoria('Todas');
    grid.appendChild(cardTodas);

    // Contar masVendidos por categoría para el badge + POPULAR
    const mvPorCat = {};
    productos.forEach(p => {
        if ((p.masVendido === true || p.masVendido === 'true') && p.stock > 0) {
            mvPorCat[p.categoria] = (mvPorCat[p.categoria] || 0) + 1;
        }
    });
    const maxMV = Math.max(...Object.values(mvPorCat), 0);

    categorias.forEach(cat => {
        const count = productos.filter(p => p.categoria === cat).length;
        const mv = mvPorCat[cat] || 0;
        const isPopular = mv > 0 && (mv === maxMV || mv >= 2);
        const card = document.createElement('div');
        card.className = 'categoria-card' + (count === 0 ? ' proximamente' : '') + (isPopular ? ' cat-popular' : '');
        card.innerHTML = `
            <span class="cat-popular-badge">+ Popular</span>
            <span class="cat-icon">${escapeHtml(obtenerIconoCategoria(cat))}</span>
            <span class="cat-name">${escapeHtml(cat)}</span>
            <span class="cat-count">${count === 0 ? '🕐 Próximamente' : safeNum(count) + ' producto' + (count !== 1 ? 's' : '')}</span>
        `;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
    // Dispara animaciones CSS DESPUÉS de que el DOM está poblado
    // Si ya tiene tm-rendered (del render instantáneo), no la quitar para evitar parpadeo
    if (!grid.classList.contains('tm-rendered')) {
        requestAnimationFrame(() => grid.classList.add('tm-rendered'));
    }
}

// ===== RENDERIZAR MÁS VENDIDOS =====

function renderizarMasVendidos() {
    const grid = document.getElementById('masVendidosGrid');
    const vacio = document.getElementById('masVendidosVacio');
    if (!grid) return;

    const masVendidos = productos.filter(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0);
    const productosAMostrar = masVendidos.length > 0 ? masVendidos : [...productos].filter(p => p.precioActual > 0 && p.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, 6);

    grid.innerHTML = '';

    if (productosAMostrar.length === 0) {
        if (vacio) vacio.style.display = 'block';
        return;
    }
    if (vacio) vacio.style.display = 'none';

    productosAMostrar.forEach(producto => {
        const card = document.createElement('div');
        card.className = 'producto-card tm-anim-card';
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.dataset.productId = String(producto.id);
            const _nombre = escapeHtml(producto.nombre);
            const _desc   = escapeHtml(producto.descripcion);
            const _img    = escapeAttr(producto.imagen);
            const _id     = safeNum(producto.id);
            card.innerHTML = `
	            <div class="badge-vendido">🔥 Más Vendido</div>
	            <div class="producto-image">
	                <img src="${_img}" alt="${_nombre}" loading="lazy" onerror="this.src='/iconos/favicon-192.png';this.style.objectFit='cover';this.style.opacity='0.3'">
	                ${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? `<div class="badge">-$${(producto.precioOriginal - producto.precioActual).toFixed(0)}</div>` : ''}
	            </div>
	            <h3>${_nombre}</h3>
	            <p class="producto-description">${_desc}</p>
	            <p class="precio">
	                ${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? '<span class="precio-tachado">$' + parseFloat(producto.precioOriginal).toFixed(2) + ' USD</span> ' : ''}<span class="precio-actual" data-usd="${safeNum(producto.precioActual)}">${typeof formatPrecio==='function'?formatPrecio(producto.precioActual):'$'+producto.precioActual.toFixed(2)+' USD'}</span>${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? ' <span class="precio-ahorro">-$' + (producto.precioOriginal - producto.precioActual).toFixed(0) + '</span>' : ''}
	            </p>
            <div class="stock-count">
                <span>📦 Solo quedan ${safeNum(producto.stock)} unidades</span>
            </div>
            <div class="stock-bar">
                <div class="stock-bar-fill" style="width: ${Math.min(100, (safeNum(producto.stock) / 20) * 100)}%"></div>
            </div>
            
            <button class="btn-pedir-card" onclick="event.stopPropagation(); tmComprar(event, ${_id}, this.dataset.nombre)" data-nombre="${_nombre}" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>
        `;
        grid.appendChild(card);
        if (window._tmAnimObs) window._tmAnimObs.observe(card);
    });

    // Poblar la sección "Oferta del día" (se oculta sola si no hay ofertaDiaId)
    if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
    // Poblar la galería rotativa del hero con productos reales
    if (typeof renderHeroGaleria === 'function') renderHeroGaleria();
}

// ===== AUTENTICACIÓN =====

function abrirLoginAdmin() {
    window.location.href = 'admin.html';
}

function cerrarLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    document.getElementById('adminPassword').value = '';
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

    // 1. Intentar auth global desde GitHub .admin-auth.json
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
    // 2. Auth según disponibilidad: GitHub primero, luego local, luego migración
    if (ghHash && ghSalt) {
        // 2a. Auth global desde GitHub
        const inputHash = await hashPassword(passwordInput, ghSalt);
        if (inputHash === ghHash) {
            localStorage.removeItem('admin_rl');
            try { localStorage.setItem(AUTH_SALT_KEY, ghSalt); } catch(e) {}
            try { localStorage.setItem(AUTH_HASH_KEY, ghHash); } catch(e) {}
            usuarioAutenticado = true;
            cerrarLoginModal();
            abrirAdminPanel();
            return;
        }
    } else {
        const lsHash = localStorage.getItem(AUTH_HASH_KEY);
        const lsSalt = localStorage.getItem(AUTH_SALT_KEY);
        if (lsHash && lsSalt) {
            // 2b. Auth local (per-browser backup)
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

    // 3. Todo falló
    const newCount = (rl.count || 0) + 1;
    const lockout = newCount >= 3 ? Date.now() + LOCKOUT_DURATION_MS : rl.until;
    localStorage.setItem('admin_rl', JSON.stringify({ count: newCount, until: lockout }));
    const msg = newCount >= 3
        ? '🔒 3 intentos fallidos. Bloqueado 5 min.'
        : `❌ Contraseña incorrecta (intento ${newCount}/3)`;
    mostrarNotificacion(msg, 'error');
    document.getElementById('adminPassword').value = '';
}

// Cambiar contraseña (llamado desde admin.html)
async function cambiarPasswordAdmin(ci, ni, coi) {
    if (!ci || !ni || !coi) {
        mostrarNotificacion('❌ Completa todos los campos', 'error');
        return;
    }

    // Detectar sal vigente: GitHub primero, luego localStorage
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    let ch = null, cs = null;
    if (ghUser && ghRepo) {
        try {
            const r = await fetch(`https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/.admin-auth.json?_=${Date.now()}`);
            if (r.ok) {
                const cfg = await r.json();
                if (cfg.hash && cfg.salt) {
                    ch = cfg.hash;
                    cs = cfg.salt;
                }
            }
        } catch(e) {}
    }
    if (!ch || !cs) {
        ch = localStorage.getItem(AUTH_HASH_KEY);
        cs = localStorage.getItem(AUTH_SALT_KEY);
    }
    if (!ch || !cs) {
        mostrarNotificacion('❌ No hay contraseña configurada. Accede primero o configura GitHub.', 'error');
        return;
    }

    const ch2 = await hashPassword(ci, cs);
    if (ch2 !== ch) { mostrarNotificacion('❌ Contraseña actual incorrecta', 'error'); return; }
    if (ni.length < 4) { mostrarNotificacion('❌ La nueva contraseña debe tener al menos 4 caracteres', 'error'); return; }
    if (ni !== coi) { mostrarNotificacion('❌ Las contraseñas nuevas no coinciden', 'error'); return; }

    const ns = _generarSal();
    const nh = await hashPassword(ni, ns);
    try { localStorage.setItem(AUTH_SALT_KEY, ns); } catch(e) {}
    try { localStorage.setItem(AUTH_HASH_KEY, nh); } catch(e) {}

    // Subir a GitHub (PUT directo para evitar bugs de subirArchivoAGitHub)
    if (ghUser && ghRepo) {
        const ghToken = localStorage.getItem('githubToken');
        if (ghToken) {
            try {
                const authData = { hash: nh, salt: ns, iterations: AUTH_ITERATIONS };
                const jsonStr = JSON.stringify(authData);
                const content = btoa(Array.from(new TextEncoder().encode(jsonStr), b => String.fromCharCode(b)).join(''));
                const ghRes = await fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/contents/.admin-auth.json`, {
                    method: 'PUT',
                    headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Actualizar contraseña admin', content })
                });
                if (!ghRes.ok) {
                    const err = await ghRes.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${ghRes.status}`);
                }
            } catch(e) {
                mostrarNotificacion(`⚠️ No se pudo subir a GitHub: ${e.message}`, 'error');
            }
        }
    }

    mostrarNotificacion('✅ Contraseña cambiada con éxito', 'success');
    document.getElementById('ci').value = '';
    document.getElementById('ni').value = '';
    document.getElementById('coi').value = '';
}

function abrirAdminPanel() {
    if (!usuarioAutenticado) { abrirLoginAdmin(); return; }
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('visible');
    panel.style.removeProperty('display');
    document.body.classList.add('admin-mode');

    if (!document.querySelector('script[src*="revolico_integration"]')) {
        const _rs = document.createElement('script');
        _rs.src = 'js/revolico_integration.js?v=11';
        document.head.appendChild(_rs);
    }

    actualizarListaProductos();
    actualizarSelectCategorias();
    actualizarListaCategorias();
    verificarEstadoBackend();
    actualizarCountdownProductSelect();
    cargarNumeroWhatsApp();
    poblarSelectOfertaDia();
    // FIX: Cargar analytics cuando se abre el panel admin
    setTimeout(() => {
        if (typeof renderizarAnalyticsFirebase === 'function') {
            renderizarAnalyticsFirebase();
        }
    }, 500);

    const inputTasa = document.getElementById('adminTasaMN');
    if (inputTasa) {
        const saved = localStorage.getItem('tasaMN');
        if (saved) inputTasa.value = saved;
    }
}

function cerrarAdminPanel() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('visible');
    panel.style.removeProperty('display');
    document.body.classList.remove('admin-mode');
}

function switchTab(tabName) {
    // Remove active from all tabs (class only — never use inline style on admin-tabs)
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.removeProperty('display'); // Fix: clear any rogue inline display
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
    });

    // Tab-specific hooks consolidados
    if (tabName === 'publicar-ahora') setTimeout(cargarGruposFB, 100);
    if (tabName === 'manage-products') setTimeout(actualizarListaProductos, 100);
    if (tabName === 'ventas') setTimeout(renderizarVentas, 100);
    if (tabName === 'analytics') setTimeout(() => { if (typeof renderizarAnalyticsFirebase === 'function') renderizarAnalyticsFirebase(); }, 150);
    if (tabName === 'manage-subcategories') {
        setTimeout(() => {
            if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
            if (typeof actualizarListaSubcategorias === 'function') actualizarListaSubcategorias();
        }, 50);
    }
    if (tabName === 'oferta-dia') {
        setTimeout(() => {
            poblarSelectOfertaDia();
            renderizarListaAgotados();
        }, 100);
    }
    if (tabName === 'configuracion') {
        setTimeout(cargarNumeroWhatsApp, 100);
        setTimeout(cargarConfiguracionGitHub, 100);
    }
}

// ===== PRODUCTOS =====

async function agregarProductoForm(event) {
    event.preventDefault();
    const fileInput = document.getElementById('productImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!file) { mostrarNotificacion('Por favor selecciona una imagen principal', 'error'); return; }

    try {
        mostrarNotificacion('⏳ Subiendo imagen principal...', 'info');
        const imagenPrincipal = await subirImagenAGitHub(file);
        const extras = await subirMultiplesImagenes('productImagesExtra');
        const imagenes = _tmDedupImagenes([imagenPrincipal, ...extras]);

        const masVendidoVal = document.getElementById('productMasVendido');
        const producto = {
            id: Date.now(),
            nombre: document.getElementById('productName').value.trim(),
            descripcion: document.getElementById('productDescription').value.trim(),
            imagen: imagenPrincipal,
            imagenes: imagenes,
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            precioOriginal: parseFloat(document.getElementById('productPrecioOriginal')?.value) || 0,
            descuento: 0,
            stock: parseInt(document.getElementById('productStock').value) || 0,
            comision: parseFloat(document.getElementById('productComision')?.value) || 0,
            comisionMoneda: document.getElementById('productComisionMoneda')?.value || 'USD',
            categoria: document.getElementById('productCategory').value,
            subcategoria: (document.getElementById('productSubcategory') && document.getElementById('productSubcategory').value) ? document.getElementById('productSubcategory').value : '',
            masVendido: masVendidoVal ? masVendidoVal.value === 'true' : false,
            usado: document.getElementById('productUsado').checked,
            garantia: document.getElementById('productGarantia').value.trim(),
            devolucion: document.getElementById('productDevolucion') ? document.getElementById('productDevolucion').checked : false,
            fechaAgregado: new Date().toISOString()
        };

        const errores = validarProducto(producto);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos.push(producto);
        guardarProductos();
        marcarProductoModificado(producto.id);
        sincronizarConGitHub();
        document.getElementById('productForm').reset();
        const _mon1 = document.getElementById('productComisionMoneda');
        if (_mon1) _mon1.value = 'USD';
        const _tog1 = document.getElementById('tmMonedaToggle1');
        if (_tog1) _tog1.querySelectorAll('.tm-moneda-btn').forEach(b => b.classList.toggle('active', b.dataset.moneda === 'USD'));
        mostrarNotificacion('✅ ¡Producto agregado exitosamente!');
        if (window.TiendaMaxPush) {
            window.TiendaMaxPush.nuevoProducto(producto.nombre, producto.precioActual, producto.id, producto.imagen);
        }
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        verificarOfertasYMostrarBanner();
    } catch (e) {
        console.error('Error subiendo imágenes:', e);
        mostrarNotificacion('❌ Error subiendo imágenes: ' + (e.message || e), 'error');
    }
}

function guardarProductos() {
    localStorage.setItem('productos', JSON.stringify(productos));
}

// ===== COMPRESIÓN DE IMÁGENES =====
// Comprime una imagen (File o base64) a máximo ~40KB manteniendo buena calidad visual
function comprimirImagen(source, maxKB = 25, maxWidth = 480, maxHeight = 480) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width  = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            let quality = 0.82;
            // Intentar WebP primero (mejor compresión)
            let result = canvas.toDataURL('image/webp', quality);
            // Si el navegador no soporta WebP, devuelve PNG — detectarlo
            const supportsWebP = result.startsWith('data:image/webp');
            const fmt = supportsWebP ? 'image/webp' : 'image/jpeg';
            if (!supportsWebP) result = canvas.toDataURL(fmt, quality);
            // Reducir calidad hasta entrar en maxKB
            while (result.length > maxKB * 1024 * 1.37 && quality > 0.2) {
                quality -= 0.06;
                result = canvas.toDataURL(fmt, quality);
            }
            resolve(result);
        };

        img.onerror = () => resolve(source);

        if (typeof source === 'string') {
            img.src = source;
        } else {
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(source);
        }
    });
}

function descargarProductosJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(productos, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "productos.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo productos.json generado. Súbelo a tu GitHub.');
}

async function sincronizarConBackend() {
    // Backend eliminado en esta versión del repo.
    // Dejamos esta función como no-op para evitar errores y mantener compatibilidad.
    return false;
}

// ===== RENDERIZAR PRODUCTOS =====


let productosVisibleCount = 20;

function renderizarProductos(isLoadMore = false) {
    if (!isLoadMore) {
        productosVisibleCount = 20;
    }
    const productosGrid = document.getElementById('productosGrid');
    if (!productosGrid) return;

    let productosFiltrados = (categoriaSeleccionada === 'Todas' 
        ? productos 
        : productos.filter(p => p.categoria === categoriaSeleccionada))
        .slice().sort((a, b) => {
            const aAgotado = a.stock === 0 ? 1 : 0;
            const bAgotado = b.stock === 0 ? 1 : 0;
            return aAgotado - bAgotado;
        });

    // Filtrar por subcategoría si hay una seleccionada (y no es 'Todas')
    if (categoriaSeleccionada !== 'Todas' && subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
        productosFiltrados = productosFiltrados.filter(p => p.subcategoria === subcategoriaSeleccionada);
    }

    // Filtro de búsqueda hero y precio
    if (_heroSearchActivo || _heroPrecioMin > 0 || _heroPrecioMax < Infinity) {
        const q = _heroSearchActivo;
        productosFiltrados = productosFiltrados.filter(p => {
            const matchQ = !q || p.nombre.toLowerCase().includes(q) ||
                (p.descripcion||'').toLowerCase().includes(q) ||
                (p.categoria||'').toLowerCase().includes(q);
            const matchP = p.precioActual >= _heroPrecioMin && p.precioActual <= _heroPrecioMax;
            return matchQ && matchP;
        });
    }

    productosGrid.innerHTML = '';

    if (productosFiltrados.length === 0) {
        // Mensaje contextual según la situación real
        let mensaje;
        if (!Array.isArray(productos) || productos.length === 0) {
            mensaje = '⏳ Cargando productos... Si esto persiste, recarga la página.';
        } else if (subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
            mensaje = 'No hay productos en esta subcategoría aún.';
        } else if (_heroSearchActivo) {
            mensaje = 'No hay productos que coincidan con tu búsqueda.';
        } else {
            mensaje = 'No hay productos en esta categoría aún.';
        }
        productosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 60px 20px; font-size:15px;">' + escapeHtml(mensaje) + '</p>';
        return;
    }

    const productosAMostrar = productosFiltrados.slice(0, productosVisibleCount);

    productosAMostrar.forEach(producto => {
        const card = document.createElement('div');
        card.className = 'producto-card';
        card.onclick = () => abrirDetalleProducto(producto.id);
        const _nombre = escapeHtml(producto.nombre);
        const _desc   = escapeHtml(producto.descripcion);
        const _img    = escapeAttr(producto.imagen);
        const _id     = safeNum(producto.id);
        const _stock  = safeNum(producto.stock);
        card.innerHTML = `
            ${producto.masVendido ? '<div class="badge-vendido">🔥 Más Vendido</div>' : ''}
            <div class="producto-image">
                <img src="${_img}" alt="${_nombre}" loading="lazy" onerror="this.src='/iconos/favicon-192.png';this.style.opacity='0.3'">
                ${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? `<div class="badge">-$${(producto.precioOriginal - producto.precioActual).toFixed(0)}</div>` : ''}
            </div>
            <h3>${_nombre}</h3>
            <p class="producto-description">${_desc}</p>
	            <p class="precio">
	                <span class="precio-actual" data-usd="${safeNum(producto.precioActual)}">${typeof formatPrecio === 'function' ? formatPrecio(producto.precioActual) : '$'+producto.precioActual.toFixed(2)+' USD'}</span>
	            </p>
            <div class="stock">📦 Stock: ${_stock} unidades</div>
            ${typeof renderCountdownHtml === 'function' ? renderCountdownHtml(_id) : ''}
            <button data-action="agregarAlCarrito" data-arg="${_id}" class="btn btn-primary btn-add-cart">🛒 Añadir</button>
        `;
        productosGrid.appendChild(card);
        if (window._tmAnimObs) window._tmAnimObs.observe(card);
    });

    if (productosFiltrados.length > productosVisibleCount) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:28px;padding:0 16px';
        const restantes = productosFiltrados.length - productosVisibleCount;
        loadMoreBtn.innerHTML = `
            <p style="color:rgba(255,255,255,0.35);font-size:12px;letter-spacing:.5px;text-transform:uppercase">
                Mostrando ${Math.min(productosVisibleCount, productosFiltrados.length)} de ${productosFiltrados.length} productos
            </p>
            <button class="btn-seguir-viendo">
                👁️ Seguir viendo <span style="background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:20px;font-size:11px;margin-left:4px">${restantes} más</span>
            </button>`;
        loadMoreBtn.querySelector('.btn-seguir-viendo').onclick = () => {
            productosVisibleCount += 20;
            renderizarProductos(true);
        };
        productosGrid.appendChild(loadMoreBtn);
    }
}



// ===== GALERÍA DE PRODUCTO =====
function _tmDedupImagenes(arr) {
    const out = [];
    (arr || []).forEach(u => {
        u = (u || '').trim();
        if (u && !out.includes(u)) out.push(u);
    });
    return out;
}

function obtenerImagenesProducto(producto) {
    if (!producto) return [];
    return _tmDedupImagenes([
        producto.imagen,
        ...(Array.isArray(producto.imagenes) ? producto.imagenes : []),
        producto.imagenSecundaria
    ]);
}

async function subirMultiplesImagenes(inputId) {
    const input = document.getElementById(inputId);
    const files = input && input.files ? Array.from(input.files).filter(Boolean) : [];
    if (!files.length) return [];
    const urls = [];
    for (let i = 0; i < files.length; i++) {
        mostrarNotificacion('⏳ Subiendo foto ' + (i + 1) + ' de ' + files.length + '...', 'info');
        urls.push(await subirImagenAGitHub(files[i]));
    }
    return urls.filter(Boolean);
}

function renderizarGaleriaDetalle(producto) {
    const thumbs = document.getElementById('detailGalleryThumbs');
    const img = document.getElementById('detailProductImage');
    if (!thumbs || !img) return;
    const imagenes = obtenerImagenesProducto(producto);
    if (imagenes.length <= 1) {
        thumbs.style.display = 'none';
        thumbs.innerHTML = '';
        return;
    }
    thumbs.style.display = 'flex';
    thumbs.innerHTML = imagenes.map((url, i) =>
        '<button type="button" class="detail-gallery-thumb' + (i === 0 ? ' active' : '') + '" data-img="' + escapeAttr(url) + '" aria-label="Ver imagen ' + (i + 1) + '">' +
            '<img src="' + escapeAttr(url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
        '</button>'
    ).join('');
    thumbs.querySelectorAll('.detail-gallery-thumb').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const url = this.getAttribute('data-img');
            if (!url) return;
            img.src = url;
            _resetZoomPan(img);
            thumbs.querySelectorAll('.detail-gallery-thumb').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    _initSwipeGaleria(img);
}

// ===== DETALLE DE PRODUCTO =====

// Producto actualmente abierto en el modal
let _detalleProductoActual = null;

function abrirDetalleProducto(id) {
    
    const p = productos.find(prod => prod.id === id);
    if (!p) {
        console.warn('Producto no encontrado:', id);
        return;
    }
    
    if (typeof tmTrackVista === 'function') tmTrackVista(id); // 📊 Analytics
    if (typeof actualizarVisibilidadBannerOferta === 'function') actualizarVisibilidadBannerOferta(false);
    _detalleProductoActual = p;
    // Deep link: actualizar URL sin recargar
    // pushState para que el botón "Atrás" cierre el modal en lugar de salir del sitio
    if (location.hash !== '#producto-' + id) {
        history.pushState({ modalProducto: id }, '', '#producto-' + id);
    }
    
    // SEO dinámico: actualizar meta tags para este producto
    if (typeof actualizarSEOPorProducto === 'function') {
        actualizarSEOPorProducto(p);
    }

    // Nombre
    document.getElementById('detailProductName').textContent = p.nombre;

    // Imagen + galería (reset zoom)
    const img = document.getElementById('detailProductImage');
    const _imagenesDetalle = obtenerImagenesProducto(p);
    img.src = _imagenesDetalle[0] || p.imagen || '';
    img.alt = p.nombre;
    _resetZoomPan(img);
    renderizarGaleriaDetalle(p);

    // Categoría y subcategoría
    document.getElementById('detailProductCategory').textContent =
        obtenerIconoCategoria(p.categoria) + ' ' + p.categoria;
    const subEl = document.getElementById('detailSubcategoria');
    if (p.subcategoria && p.subcategoria !== 'Todas') {
        subEl.textContent = '↳ ' + p.subcategoria;
        subEl.style.display = 'block';
    } else {
        subEl.style.display = 'none';
    }

    // Descuento badge
    const badge = document.getElementById('detailProductBadge');
    const _hasPrecioOrig = p.precioOriginal > 0 && parseFloat(p.precioOriginal) > parseFloat(p.precioActual);
    badge.style.display = _hasPrecioOrig ? 'inline-block' : 'none';
    if (_hasPrecioOrig) badge.textContent = `-$${(parseFloat(p.precioOriginal) - parseFloat(p.precioActual)).toFixed(0)}`;

    // Más vendido badge
    const hotBadge = document.getElementById('detailMasVendidoBadge');
    hotBadge.style.display = (p.masVendido === true || p.masVendido === 'true') ? 'block' : 'none';

    // Precio
    const precioOriginal = p.descuento > 0
        ? (p.precioActual / (1 - p.descuento / 100))
        : null;
    // NOTA: el bloque que actualiza #detailPriceOriginal está abajo (después de
    // este comentario) y siempre gana. El cálculo de precioOriginal se mantiene
    // por si descuento > 0 (para badge "Ahorras $X"). El antiguo bloque que
    // escribía aquí en #detailPriceOriginal se eliminó (era código muerto).
    // Precio en modal con tachado real
const _detailPrecioEl = document.getElementById('detailPriceActual');
const _detailPrecioOldEl = document.getElementById('detailPriceOriginal');
const _detailPrecioMNEl = document.getElementById('detailPriceMN');
// USD siempre visible en el modal
if (_detailPrecioEl) _detailPrecioEl.textContent = `$${p.precioActual.toFixed(2)} USD`;
if (_detailPrecioOldEl) {
    if (p.precioOriginal > 0 && parseFloat(p.precioOriginal) > parseFloat(p.precioActual)) {
        _detailPrecioOldEl.textContent = `$${parseFloat(p.precioOriginal).toFixed(2)} USD`;
        _detailPrecioOldEl.style.display = 'inline';
    } else {
        _detailPrecioOldEl.style.display = 'none';
    }
}
// Equivalente MN dinámico
if (_detailPrecioMNEl) {
    const _tasaModal = typeof getTasaMN === 'function' ? getTasaMN() : 0;
    if (_tasaModal > 0) {
        _detailPrecioMNEl.textContent = `≈ ${Math.round(p.precioActual * _tasaModal).toLocaleString('es-CU')} MN`;
        _detailPrecioMNEl.style.display = 'block';
    } else {
        _detailPrecioMNEl.style.display = 'none';
    }
}

    // Ahorro
    const ahorroEl = document.getElementById('detailAhorroBadge');
    if (precioOriginal && p.descuento > 0) {
        const ahorro = (precioOriginal - p.precioActual).toFixed(2);
        ahorroEl.textContent = `Ahorras $${ahorro}`;
        ahorroEl.style.display = 'inline';
    } else {
        ahorroEl.style.display = 'none';
    }

    // Stock
    const stockEl = document.getElementById('detailProductStock');
    const _stockN = safeNum(p.stock);
    if (_stockN === 0) {
        stockEl.innerHTML = '<span style="color:#e74c3c;font-weight:700;">❌ Sin stock</span>';
    } else if (_stockN <= 3) {
        stockEl.innerHTML = `<span style="color:#e67e22;font-weight:700;">⚠️ ¡Últimas ${_stockN} unidades!</span>`;
    } else {
        stockEl.innerHTML = `<span>📦 ${_stockN} unidades disponibles</span>`;
    }
    document.getElementById('detailStockBarFill').style.width =
        `${Math.min(100, Math.max(8, (p.stock / 20) * 100))}%`;

    // Badges extra: garantia, devolución, usado
    const extBadges = document.getElementById('detailExtraBadges');
    let badges = '';
    if (p.garantia) badges += `<span class="detail-badge-tag dtag-garantia">🛡️ Garantía: ${escapeHtml(p.garantia)}</span>`;
    if (p.devolucion) badges += `<span class="detail-badge-tag dtag-devolucion">↩️ Devolución aceptada</span>`;
    if (p.usado) badges += `<span class="detail-badge-tag dtag-usado">♻️ Producto usado</span>`;
    extBadges.innerHTML = badges;

    // Descripción
    // Descripción: usar textContent preserva saltos de línea con CSS white-space
    document.getElementById('detailProductDescription').textContent = p.descripcion || '';

    // Botón comprar (estilo WhatsApp "Pedir")
    const buyBtn = document.getElementById('detailBuyBtn');
    buyBtn.disabled = p.stock === 0;
    if (p.stock === 0) {
        buyBtn.innerHTML = '❌ Sin stock';
    } else {
        buyBtn.innerHTML = `
            <span class="btn-pedir-wa-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
            </span>
            <span class="btn-pedir-wa-text">Pedir</span>
        `;
    }
    buyBtn.onclick = () => contactarProducto(p.nombre);

    // Productos relacionados: primero recomendaciones IA guardadas, luego misma categoría.
    const recIds = Array.isArray(p.recomendados) ? p.recomendados.map(String) : [];
    const recIA = recIds
        .map(id => productos.find(x => String(x.id) === id))
        .filter(x => x && x.id !== p.id);
    const fallbackRel = productos
        .filter(x => x.id !== p.id && x.categoria === p.categoria && !recIds.includes(String(x.id)))
        .sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0));
    const relacionados = [...recIA, ...fallbackRel].slice(0, 4);
    const relSection = document.getElementById('detailRelacionados');
    const relGrid    = document.getElementById('detailRelacionadosGrid');
    if (relacionados.length > 0) {
        const _tasaRel = typeof getTasaMN === 'function' ? getTasaMN() : 0;
        const upsellNote = p.upsellText ? `<div class="rel-upsell-note" style="grid-column:1/-1;font-size:12px;color:#C9A96E;background:rgba(201,169,110,.08);border:1px solid rgba(201,169,110,.18);border-radius:10px;padding:10px 12px;margin-bottom:4px;">💡 ${escapeHtml(p.upsellText)}</div>` : '';
        relGrid.innerHTML = upsellNote + relacionados.map(r => {
            const _mnRel = _tasaRel > 0
                ? `<span class="rel-card-price-mn">≈ ${Math.round(Number(r.precioActual) * _tasaRel).toLocaleString('es-CU')} MN</span>`
                : '';
            return `
            <div class="rel-card" onclick="abrirDetalleProducto(${safeNum(r.id)})"${r.stock === 0 ? ' style="opacity:0.5"' : ''}>
                <img src="${escapeAttr(r.imagen)}" alt="${escapeHtml(r.nombre)}" loading="lazy" onerror="this.style.display='none'">
                <div class="rel-card-name">${escapeHtml(r.nombre)}</div>
                <div class="rel-card-price">$${Number(r.precioActual).toFixed(2)} USD${_mnRel}</div>
            </div>
            `;
        }).join('');
        relSection.style.display = 'block';
    } else {
        relSection.style.display = 'none';
    }

    // Reseñas
    renderizarResenas(p.id);
    document.getElementById('formResena').style.display = 'none';
    const btnResena = document.getElementById('btnAgregarResena');
    if (btnResena) btnResena.textContent = '+ Agregar reseña';
    _estrellasSeleccionadas = 0;
    setEstrellas(0);

    // Historial de vistas
    registrarVisto(p.id);

    // Contador de vistas — local primero, Firebase en segundo plano
    (function() {
        const vDiv = document.getElementById('detailPersonasViendo');
        if (!vDiv) return;
        const prodId = p.id;
        const local = obtenerVistasProd(prodId) || 0;
        if (local > 0) {
            vDiv.style.display = 'flex';
            vDiv.innerHTML = '<span class="pv-inner">👁️ <strong>' + local.toLocaleString() + '</strong> personas vieron esto</span>';
        }
        (async () => {
            try {
                const cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
                const base = cfg.databaseURL || (cfg.projectId ? 'https://' + cfg.projectId + '-default-rtdb.firebaseio.com' : null);
                if (!base) return;
                const res = await fetch(base + '/analytics/vistas/' + String(prodId) + '/count.json');
                if (!res.ok) return;
                const cnt = await res.json();
                if (typeof cnt !== 'number' || cnt <= 0) return;
                const el = document.getElementById('detailPersonasViendo');
                if (el) {
                    el.style.display = 'flex';
                    el.innerHTML = '<span class="pv-inner">👁️ <strong>' + cnt.toLocaleString() + '</strong> personas vieron esto</span>';
                }
            } catch(e) {}
        })();
    })();

    // Botón carrito en modal
    const detailBuyRow = document.getElementById('detailBuyBtn');
    if (detailBuyRow) {
        // Agregar botón carrito junto al de comprar si no existe
        let cartRowEl = document.getElementById('detailCartBtn');
        if (!cartRowEl) {
            cartRowEl = document.createElement('button');
            cartRowEl.id = 'detailCartBtn';
            cartRowEl.className = 'btn-carrito';
            cartRowEl.style.cssText = 'width:100%;margin-bottom:10px;padding:12px;font-size:14px;';
            detailBuyRow.parentNode.insertBefore(cartRowEl, detailBuyRow.nextSibling);
        }
        const enCarro = carrito.some(x => x.id === p.id);
        cartRowEl.textContent  = enCarro ? '✓ En el carrito — Ver carrito' : '🛒 Agregar al carrito';
        cartRowEl.className    = 'btn-carrito' + (enCarro ? ' en-carrito' : '');
        cartRowEl.style.cssText = 'width:100%;margin-bottom:10px;padding:12px;font-size:14px;';
        cartRowEl.onclick = () => {
            if (carrito.some(x => x.id === p.id)) {
                cerrarDetalleModal();
                abrirCarrito();
            } else {
                agregarAlCarrito(p.id, null, cartRowEl);
                cartRowEl.textContent = '✓ En el carrito — Ver carrito';
                cartRowEl.className = 'btn-carrito en-carrito';
            }
        };
    }

    // Abrir modal
    const modal = document.getElementById('productDetailModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = 'hidden';
    // Scroll al top para que el usuario vea el producto desde el inicio
    const detailBody = modal.querySelector('.detail-body') || modal.querySelector('.detail-modal-content');
    if (detailBody) detailBody.scrollTop = 0;
    
    
    
}

function cerrarDetalleModal() {
    // FIX: cerrar panel de compartir si estaba abierto
    var _pcr = document.getElementById('panelCompartirRedes');
    if (_pcr) _pcr.style.display = 'none';

    _resetZoomPan(document.getElementById('detailProductImage'));

    const modal = document.getElementById('productDetailModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = '';
    _detalleProductoActual = null;
    if (typeof actualizarVisibilidadBannerOferta === 'function') {
        actualizarVisibilidadBannerOferta(typeof tmVistaInicioActiva === 'function' ? tmVistaInicioActiva() : true);
    }
    // Limpiar el hash de la URL
    history.replaceState(null, '', window.location.pathname + window.location.search);
    
    // SEO dinámico: restaurar meta tags originales
    if (typeof restaurarSEOOriginal === 'function') {
        restaurarSEOOriginal();
    }
}

let _zoomPanState = null;

function _resetZoomPan(img) {
    if (!img) return;
    if (_zoomPanState) { _zoomPanState.cleanup(); _zoomPanState = null; }
    img.classList.remove('zoomed', 'dragging');
    img.style.transform = '';
    img.style.transition = '';
    const hint = img.parentElement && img.parentElement.querySelector('.detail-zoom-hint');
    if (hint) hint.textContent = '🔍 Toca para ampliar';
}

function _initZoomPan(img) {
    const SCALE = 2.2;
    let tx = 0, ty = 0, startX = 0, startY = 0, startTx = 0, startTy = 0;
    let isDragging = false, hasMoved = false;
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function maxPan() {
        const wrap = img.parentElement;
        if (!wrap) return { x: 0, y: 0 };
        const iR = img.getBoundingClientRect(), wR = wrap.getBoundingClientRect();
        return { x: Math.max(0, (iR.width * SCALE - wR.width) / 2), y: Math.max(0, (iR.height * SCALE - wR.height) / 2) };
    }
    function applyT(dur) {
        const m = maxPan();
        tx = clamp(tx, -m.x, m.x); ty = clamp(ty, -m.y, m.y);
        img.style.transition = dur ? 'transform ' + dur + 'ms cubic-bezier(.4,0,.2,1)' : 'none';
        img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + SCALE + ')';
    }
    function onMD(e) { isDragging = true; hasMoved = false; startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty; img.classList.add('dragging'); e.preventDefault(); }
    function onMM(e) { if (!isDragging) return; const dx = e.clientX - startX, dy = e.clientY - startY; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true; tx = startTx + dx; ty = startTy + dy; applyT(0); }
    function onMU() { isDragging = false; img.classList.remove('dragging'); if (!hasMoved) { _resetZoomPan(img); } else { applyT(150); } }
    function onTS(e) { if (e.touches.length !== 1) return; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startTx = tx; startTy = ty; hasMoved = false; e.preventDefault(); }
    function onTM(e) { if (e.touches.length !== 1) return; const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY; if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true; tx = startTx + dx; ty = startTy + dy; applyT(0); e.preventDefault(); }
    function onTE() { if (!hasMoved) { _resetZoomPan(img); } else { applyT(150); } }
    img.addEventListener('mousedown', onMD);
    document.addEventListener('mousemove', onMM);
    document.addEventListener('mouseup', onMU);
    img.addEventListener('touchstart', onTS, { passive: false });
    img.addEventListener('touchmove', onTM, { passive: false });
    img.addEventListener('touchend', onTE);
    applyT(300);
    _zoomPanState = { cleanup() { img.removeEventListener('mousedown', onMD); document.removeEventListener('mousemove', onMM); document.removeEventListener('mouseup', onMU); img.removeEventListener('touchstart', onTS); img.removeEventListener('touchmove', onTM); img.removeEventListener('touchend', onTE); } };
}

function toggleZoomImagen(img) {
    if (img.classList.contains('zoomed')) { _resetZoomPan(img); return; }
    img.classList.add('zoomed');
    const hint = img.parentElement && img.parentElement.querySelector('.detail-zoom-hint');
    if (hint) hint.textContent = '↔ Arrastra · Toca para cerrar';
    _initZoomPan(img);
}

function _initSwipeGaleria(img) {
    if (img._swipeGaleriaInited) return;
    img._swipeGaleriaInited = true;
    let swX = 0, swY = 0;
    img.addEventListener('touchstart', function(e) {
        if (img.classList.contains('zoomed') || e.touches.length !== 1) return;
        swX = e.touches[0].clientX; swY = e.touches[0].clientY;
    }, { passive: true });
    img.addEventListener('touchend', function(e) {
        if (img.classList.contains('zoomed')) return;
        const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY;
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
        const thumbs = Array.from(document.querySelectorAll('#detailGalleryThumbs .detail-gallery-thumb'));
        if (thumbs.length < 2) return;
        const idx = thumbs.findIndex(t => t.classList.contains('active'));
        const next = dx < 0 ? (idx + 1) % thumbs.length : (idx - 1 + thumbs.length) % thumbs.length;
        thumbs[next].click();
    }, { passive: true });
}

function abrirPanelCompartir() {
    const panel = document.getElementById('panelCompartirRedes');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
}

function _getShareData() {
    const p = _detalleProductoActual;
    if (!p) return null;
    const url = 'https://tiendamax.org/p/producto-' + p.id + '.html';
    return {
        nombre: p.nombre,
        precio: p.precioActual.toFixed(2),
        texto: '🛍️ *' + p.nombre + '* — $' + p.precioActual.toFixed(2) + ' USD\n📦 Stock disponible\n👉 ' + url,
        url: url
    };
}

function compartirWhatsApp() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(d.texto);
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
}

function compartirFacebook() {
    const d = _getShareData(); if (!d) return;
    const url = encodeURIComponent(d.url);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${encodeURIComponent(d.texto)}`, '_blank', 'noopener,noreferrer');
}

function compartirTelegram() {
    const d = _getShareData(); if (!d) return;
    // FIX: eliminada variable msg que no se usaba
    window.open(`https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.texto)}`, '_blank', 'noopener,noreferrer');
}

function compartirTwitter() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(`${d.nombre} — $${d.precio} USD en @TiendaMax 🛍️ ${d.url}`);
    window.open(`https://twitter.com/intent/tweet?text=${msg}`, '_blank', 'noopener,noreferrer');
}

function compartirNativo() {
    const p = _detalleProductoActual;
    if (!p) return;
    const texto = `🛍️ ${p.nombre} — $${p.precioActual.toFixed(2)} USD\n📦 Stock disponible\n👉 tiendamax.org`;
    const urlProducto = 'https://tiendamax.org/p/producto-' + p.id + '.html';
    if (navigator.share) {
        navigator.share({ title: p.nombre, text: texto, url: urlProducto }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto + '\n' + urlProducto).then(() => mostrarNotificacion('📤 Texto copiado para compartir'));
    }
}

function compartirProducto() {
    abrirPanelCompartir();
}

function copiarLinkProducto() {
    const p = _detalleProductoActual;
    const url = p
        ? 'https://tiendamax.org/p/producto-' + p.id + '.html'
        : 'https://tiendamax.org';
    navigator.clipboard.writeText(url).then(() =>
        mostrarNotificacion('🔗 Enlace copiado — ¡listo para compartir!')
    ).catch(() => {
        // Fallback para dispositivos sin clipboard API
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        mostrarNotificacion('🔗 Enlace copiado');
    });
}

function contactarProducto(nombre) {
    const p = _detalleProductoActual;
    const item = p
        ? { id: p.id, nombre: p.nombre, precio: parseFloat(p.precioActual) || 0, cantidad: 1 }
        : { nombre: nombre || 'Producto', precio: 0, cantidad: 1 };
    if (p) tmRegistrarInteresWhatsApp(p, 'detalle');
    const msg = _mensajeOrdenWA([item]);
    window.open(`https://wa.me/${getNumeroWhatsApp()}?text=${msg}`, '_blank', 'noopener,noreferrer');
}

// actualizarListaProductos está definida más abajo (versión mejorada con filtros por categoría)

// ===== FUNCIÓN DE COPIAR PARA FACEBOOK Y REVOLICO =====

function copiarParaRevolico(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `
${producto.nombre}

${producto.descripcion}

💰 Precio: $${producto.precioActual} USD
${producto.stock > 0 ? `📦 Stock: ${producto.stock} unidades disponibles` : '❌ Agotado'}

📞 Contacto: +53 54320170
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); }, 500);
    }).catch(() => { 
        window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer');
    });
}

function copiarParaFacebook(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `
🛍️ ${producto.nombre}

${producto.descripcion}

💰 Precio: $${producto.precioActual} USD
${producto.descuento > 0 ? `🔥 ¡OFERTA! (-${producto.descuento}%)` : ''}
${producto.stock > 0 ? `📦 Disponible: ${producto.stock} unidades` : '❌ Agotado'}

📞 Interesado? Contáctame por WhatsApp: +53 54320170

#TiendaMax #VentasCuba #GruposFacebook #Oferta
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Texto copiado para GRUPOS! Ahora pega en tus grupos de Facebook.');
        setTimeout(() => { window.open('https://www.facebook.com/groups/feed/', '_blank', 'noopener,noreferrer'); }, 500);
    }).catch(() => { 
        window.open('https://www.facebook.com/groups/feed/', '_blank', 'noopener,noreferrer');
    });
}

// ===== PUBLICACIÓN EN REVOLICO =====

function prepararPublicacionManual(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    const texto = `${producto.nombre}\n\n${producto.descripcion}\n\nPrecio: ${producto.precioActual} USD\nContacto: +53 54320170`;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); }, 1000);
    }).catch(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); });
}

async function publicarEnRevolico(id) {
    if (typeof copiarYAbrirRevolico === 'function') {
        copiarYAbrirRevolico(id);
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Revolico no está disponible', 'error');
}

async function publicarEnFacebook(id) {
    if (typeof copiarYAbrirFacebook === 'function') {
        copiarYAbrirFacebook(id);
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Facebook no está disponible', 'error');
}

async function publicarAhora() {
    if (typeof mostrarSelectorAsistenteRevolico === 'function') {
        mostrarSelectorAsistenteRevolico();
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Revolico no está disponible', 'error');
}

// ===== CATEGORÍAS (GESTIÓN) =====

function actualizarSelectCategorias() {
    ['productCategory', 'editProductCategory'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const val = select.value;
        select.innerHTML = '';
        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            select.appendChild(opt);
        });
        select.value = val || 'General';
    });
}

function actualizarBotonesCategorias() {
    const container = document.getElementById('categoriaFiltro');
    if (!container) return;

    container.innerHTML = `<button class="categoria-btn ${categoriaSeleccionada === 'Todas' ? 'active' : ''}" onclick="filtrarPorCategoria('Todas')">Todas</button>`;

    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `categoria-btn ${categoriaSeleccionada === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => filtrarPorCategoria(cat);
        container.appendChild(btn);
    });
}

function filtrarPorCategoria(cat) {
    categoriaSeleccionada = cat;
    actualizarBotonesCategorias();
    renderizarProductos();
    const titulo = document.getElementById('tituloCategoriaActual');
    if (titulo) {
        const icono = obtenerIconoCategoria(cat);
        titulo.textContent = cat === 'Todas' ? '🛍️ Todos los Productos' : `${icono} ${cat}`;
    }
}

function actualizarListaCategorias() {
    const list = document.getElementById('categoryList');
    if (!list) return;

    list.innerHTML = '';

    categorias.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <span>${obtenerIconoCategoria(cat)} ${cat}</span>
            ${cat !== 'General' ? `<button onclick="eliminarCategoria(${index})">🗑️</button>` : ''}
        `;
        list.appendChild(item);
    });
}

function descargarCategoriasJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(categorias, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "categorias.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo categorias.json generado. Súbelo a tu GitHub.');
}

function agregarCategoria() {
    const input = document.getElementById('newCategoryName');
    const iconInput = document.getElementById('newCategoryIcon');
    const name = input.value.trim();
    const icon = iconInput.value.trim();
    
    if (!name) return;
    if (categorias.includes(name)) { mostrarNotificacion('La categoría ya existe', 'error'); return; }
    
    categorias.push(name);
    
    // Si el usuario puso un icono, guardarlo como personalizado
    if (icon) {
        iconosPersonalizados[name] = icon;
        localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
    }
    
    guardarCategorias();
    input.value = '';
    iconInput.value = '';
    
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    actualizarListaCategorias();
    renderizarCategoriasHome();
    if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    mostrarNotificacion('✅ Categoría agregada');
}

function guardarCategorias() {
    localStorage.setItem('categorias', JSON.stringify(categorias));
    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
}

function eliminarCategoria(index) {
    const nombre = categorias[index];
    if (nombre === 'General') return;
    if (confirm(`¿Eliminar la categoría "${nombre}"?`)) {
        // Eliminar icono personalizado si existe
        if (iconosPersonalizados[nombre]) {
            delete iconosPersonalizados[nombre];
            localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
        }
        
        categorias.splice(index, 1);
        guardarCategorias();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarCategoriasHome();
        renderizarProductos();
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    }
}

// ===== GESTIÓN DE PRODUCTOS (EDITAR/ELIMINAR) =====

function eliminarProducto(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    productos = productos.filter(p => p.id !== id);
    guardarProductos();
    // Una eliminación requiere sincronizar todos los productos
    localStorage.setItem('productosModificados', JSON.stringify(productos.map(p => p.id)));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
    sincronizarConBackend();
    renderizarCategoriasHome();
    renderizarMasVendidos();
    renderizarProductos();
    actualizarListaProductos();
    verificarOfertasYMostrarBanner();
    mostrarNotificacion('🗑️ Producto eliminado', 'info');
}

// ── Estado de la galería en el modal de edición ──────────
let _editImagenesEliminar = new Set();
let _editProductActual = null;

function _renderEditGallery(p) {
    const preview = document.getElementById('currentImagePreview');
    if (!preview) return;
    const imgs = obtenerImagenesProducto(p).filter(u => !_editImagenesEliminar.has(u));
    preview.innerHTML = '';
    if (!imgs.length) {
        const s = document.createElement('span');
        s.style.cssText = 'font-size:12px;color:#888;';
        s.textContent = 'Sin imágenes';
        preview.appendChild(s);
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'admin-gallery-preview';
    imgs.forEach(url => {
        const item = document.createElement('div');
        item.className = 'admin-gallery-item';
        const img = document.createElement('img');
        img.src = url;
        img.onerror = () => { img.style.display = 'none'; };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-gallery-delete';
        btn.title = 'Quitar esta foto';
        btn.textContent = '✕';
        btn.addEventListener('click', () => {
            _editImagenesEliminar.add(url);
            _renderEditGallery(p);
        });
        item.appendChild(img);
        item.appendChild(btn);
        wrap.appendChild(item);
    });
    preview.appendChild(wrap);
}

function abrirEditModal(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('editProductName').value = p.nombre;
    document.getElementById('editProductDescription').value = p.descripcion;
    document.getElementById('editProductPriceActual').value = p.precioActual;
    const _epOrig = document.getElementById('editProductPrecioOriginal');
    if (_epOrig) _epOrig.value = p.precioOriginal > 0 ? p.precioOriginal : '';
    document.getElementById('editProductStock').value = p.stock;
    document.getElementById('editProductCategory').value = p.categoria;

    // Cargar subcategorías del producto al editar
    if (typeof actualizarSelectSubcategorias === 'function') {
        actualizarSelectSubcategorias();
        setTimeout(() => {
            const editSubcat = document.getElementById('editProductSubcategory');
            if (editSubcat && p.subcategoria) editSubcat.value = p.subcategoria;
        }, 50);
    }
    
    // Nuevos campos en edición
    if (document.getElementById('editProductUsado')) document.getElementById('editProductUsado').checked = p.usado || false;
    if (document.getElementById('editProductGarantia')) document.getElementById('editProductGarantia').value = p.garantia || '';
    if (document.getElementById('editProductDevolucion')) document.getElementById('editProductDevolucion').checked = p.devolucion || false;
    if (document.getElementById('editProductComision')) document.getElementById('editProductComision').value = p.comision || '';
    const _editComMon = p.comisionMoneda || 'USD';
    const _editHidMon = document.getElementById('editProductComisionMoneda');
    if (_editHidMon) _editHidMon.value = _editComMon;
    const _editToggle = document.getElementById('tmMonedaToggleEdit');
    if (_editToggle) _editToggle.querySelectorAll('.tm-moneda-btn').forEach(b => b.classList.toggle('active', b.dataset.moneda === _editComMon));

    const masVendidoSel = document.getElementById('editProductMasVendido');
    if (masVendidoSel) masVendidoSel.value = p.masVendido ? 'true' : 'false';

    // Limpiar estado de fotos de la edición anterior
    _editImagenesEliminar = new Set();
    _editProductActual = p;
    const _fi1 = document.getElementById('editProductImage');
    if (_fi1) _fi1.value = '';
    const _fi2 = document.getElementById('editProductImagesExtra');
    if (_fi2) _fi2.value = '';
    _renderEditGallery(p);

    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
}

function cerrarEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
}

async function guardarProductoEditado(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    if (index === -1) return;

    const masVendidoSel = document.getElementById('editProductMasVendido');
    const fileInput = document.getElementById('editProductImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    try {
        let nuevaImagen = null;
        if (file) {
            mostrarNotificacion('⏳ Subiendo imagen principal...', 'info');
            nuevaImagen = await subirImagenAGitHub(file);
        }
        const extrasNuevas = await subirMultiplesImagenes('editProductImagesExtra');
        const imagenPrincipal = nuevaImagen || productos[index].imagen;
        // Excluir fotos marcadas para eliminar en el modal
        const anteriores = obtenerImagenesProducto(productos[index]).filter(u => !_editImagenesEliminar.has(u));
        const imagenes = _tmDedupImagenes([
            imagenPrincipal,
            ...anteriores.filter(url => url !== productos[index].imagen && url !== imagenPrincipal),
            ...extrasNuevas
        ]);

        const productoActualizado = {
            ...productos[index],
            nombre: document.getElementById('editProductName').value.trim(),
            descripcion: document.getElementById('editProductDescription').value.trim(),
            precioActual: parseFloat(document.getElementById('editProductPriceActual').value) || 0,
            precioOriginal: parseFloat(document.getElementById('editProductPrecioOriginal')?.value) || 0,
            descuento: 0,
            stock: parseInt(document.getElementById('editProductStock').value) || 0,
            categoria: document.getElementById('editProductCategory').value,
            subcategoria: (document.getElementById('editProductSubcategory') && document.getElementById('editProductSubcategory').value) ? document.getElementById('editProductSubcategory').value : (productos[index].subcategoria || ''),
            masVendido: masVendidoSel ? masVendidoSel.value === 'true' : productos[index].masVendido,
            imagen: imagenPrincipal,
            imagenes: imagenes,
            usado: document.getElementById('editProductUsado') ? document.getElementById('editProductUsado').checked : productos[index].usado,
            garantia: document.getElementById('editProductGarantia') ? document.getElementById('editProductGarantia').value.trim() : productos[index].garantia,
            devolucion: document.getElementById('editProductDevolucion') ? document.getElementById('editProductDevolucion').checked : productos[index].devolucion,
            comision: document.getElementById('editProductComision') ? parseFloat(document.getElementById('editProductComision').value) || 0 : productos[index].comision || 0,
            comisionMoneda: document.getElementById('editProductComisionMoneda')?.value || productos[index].comisionMoneda || 'USD'
        };

        const errores = validarProducto(productoActualizado);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos[index] = productoActualizado;
        guardarProductos();
        marcarProductoModificado(productoActualizado.id);
        sincronizarConGitHub();
        cerrarEditModal();
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('✅ Producto actualizado');
    } catch (e) {
        console.error('Error actualizando producto:', e);
        mostrarNotificacion('❌ Error actualizando imágenes: ' + (e.message || e), 'error');
    }
}

// ===== ESTADO DEL BACKEND =====

async function verificarEstadoBackend() {
    const statusEl = document.getElementById('backendStatus');
    if (!statusEl) return;
    statusEl.innerHTML = '🟠 <strong>Modo manual activo</strong> · Publicación asistida desde el navegador · Sin dependencia de backend roto';
    statusEl.style.color = '#F39C12';
}

async function cargarEstadoPublicacion() {
    const logContainer = document.getElementById('historialPublicaciones');
    if (!logContainer) return;
    logContainer.innerHTML = '<p style="font-size:13px;color:#666;">Modo manual activo. No existe historial automático porque este repo no incluye backend de publicación.</p>';
}

// ===== SINCRONIZACIÓN CON GITHUB =====

function cargarConfiguracionGitHub() {
    document.getElementById('githubUser').value = localStorage.getItem('githubUser') || '';
    document.getElementById('githubRepo').value = localStorage.getItem('githubRepo') || 'Tiendamax';
    document.getElementById('githubToken').value = localStorage.getItem('githubToken') || '';
    
    const fbConfig = localStorage.getItem('firebaseConfig');
    if (fbConfig) {
        try {
            document.getElementById('firebaseConfigJson').value = JSON.stringify(JSON.parse(fbConfig), null, 2);
        } catch(e) {
            document.getElementById('firebaseConfigJson').value = fbConfig;
        }
    } else {
        document.getElementById('firebaseConfigJson').value = '';
    }
    document.getElementById('firebaseVapidKey').value = localStorage.getItem('firebaseVapidKey') || '';
    document.getElementById('firebaseServerKey').value = localStorage.getItem('fcmServerKey') || '';
}

function guardarConfiguracionGitHub(event) {
    event.preventDefault();
    localStorage.setItem('githubUser', document.getElementById('githubUser').value.trim());
    localStorage.setItem('githubRepo', document.getElementById('githubRepo').value.trim());
    localStorage.setItem('githubToken', document.getElementById('githubToken').value.trim());
    mostrarNotificacion('✅ Configuración de GitHub guardada localmente');
}



// ===== SISTEMA DE DELTA SYNC =====
// Registra qué productos fueron modificados desde la última sincronización
function marcarProductoModificado(id) {
    const modificados = JSON.parse(localStorage.getItem('productosModificados') || '[]');
    if (!modificados.includes(id)) modificados.push(id);
    localStorage.setItem('productosModificados', JSON.stringify(modificados));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
}

function limpiarProductosModificados() {
    localStorage.removeItem('productosModificados');
    localStorage.setItem('ultimaSincronizacion', Date.now().toString());
}

function obtenerProductosModificados() {
    return JSON.parse(localStorage.getItem('productosModificados') || '[]');
}

async function sincronizarTodoConGitHub() {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        mostrarNotificacion('❌ Configura primero tu usuario, repo y token en la pestaña Configuración', 'error');
        switchTab('configuracion');
        return;
    }

    const btn = document.querySelector('[data-action="sincronizarTodoConGitHub"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    // --- Barra de progreso ---
    let barraContenedor = document.getElementById('syncProgressContenedor');
    if (!barraContenedor) {
        barraContenedor = document.createElement('div');
        barraContenedor.id = 'syncProgressContenedor';
        barraContenedor.style.cssText = 'margin-top:14px;';
        barraContenedor.innerHTML = `
            <div style="background:#2a2a2a;border-radius:8px;overflow:hidden;height:14px;margin-bottom:6px;">
                <div id="syncProgressBarra" style="height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#ff9a6c);transition:width 0.4s ease;border-radius:8px;"></div>
            </div>
            <p id="syncProgressTexto" style="font-size:12px;color:#aaa;text-align:center;margin:0;"></p>
        `;
        if (btn) btn.parentNode.insertBefore(barraContenedor, btn.nextSibling);
    }
    barraContenedor.style.display = 'block';
    const barra   = document.getElementById('syncProgressBarra');
    const textoEl = document.getElementById('syncProgressTexto');

    // Barra flotante global: visible aunque el botón esté en otra pestaña o fuera de pantalla.
    let barraFloat = document.getElementById('tmSyncFloat');
    if (!barraFloat) {
        barraFloat = document.createElement('div');
        barraFloat.id = 'tmSyncFloat';
        barraFloat.innerHTML = `
          <div class="tm-sync-float-card">
            <div class="tm-sync-float-top"><b>🔄 Actualizando tienda</b><span id="tmSyncFloatPct">0%</span></div>
            <div class="tm-sync-float-track"><div id="tmSyncFloatBar"></div></div>
            <div id="tmSyncFloatText">Preparando...</div>
          </div>`;
        const st = document.createElement('style');
        st.id = 'tmSyncFloatStyle';
        st.textContent = `#tmSyncFloat{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateX(-50%);z-index:99999;width:min(92vw,460px);pointer-events:none}.tm-sync-float-card{background:rgba(15,15,15,.96);border:1px solid rgba(201,169,110,.35);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04) inset;border-radius:16px;padding:13px 14px;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.tm-sync-float-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:9px}.tm-sync-float-top b{color:#fff}.tm-sync-float-top span{color:#C9A96E;font-weight:900}.tm-sync-float-track{height:11px;background:#272727;border-radius:999px;overflow:hidden}.tm-sync-float-track>div{height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#C9A96E);border-radius:999px;transition:width .35s ease}#tmSyncFloatText{font-size:11px;color:#bbb;margin-top:7px;text-align:center}`;
        document.head.appendChild(st);
        document.body.appendChild(barraFloat);
    }
    barraFloat.style.display = 'block';
    const barraFloatBar = document.getElementById('tmSyncFloatBar');
    const barraFloatPct = document.getElementById('tmSyncFloatPct');
    const barraFloatText = document.getElementById('tmSyncFloatText');

    if (barra)   barra.style.width = '0%';
    if (textoEl) textoEl.textContent = 'Preparando...';
    if (barraFloatBar) barraFloatBar.style.width = '0%';
    if (barraFloatPct) barraFloatPct.textContent = '0%';
    if (barraFloatText) barraFloatText.textContent = 'Preparando...';

    function actualizarBarra(paso, total, mensaje) {
        const pct = Math.round((paso / total) * 100);
        if (barra)   barra.style.width = pct + '%';
        if (textoEl) textoEl.textContent = mensaje;
        if (barraFloatBar) barraFloatBar.style.width = pct + '%';
        if (barraFloatPct) barraFloatPct.textContent = pct + '%';
        if (barraFloatText) barraFloatText.textContent = mensaje;
    }
    // -------------------------

    const idsModificados = obtenerProductosModificados();
    const hayDelta = idsModificados.length > 0 && idsModificados.length < productos.length;

    if (hayDelta) {
        mostrarNotificacion(`🔄 Subiendo ${idsModificados.length} producto(s) modificado(s)...`, 'info');
    } else {
        mostrarNotificacion('🚀 Sincronizando tienda completa con GitHub...', 'info');
    }

    // Construir config.json con tasa + oferta del día para que todos los clientes la vean
    const _configSync = {
        tasaMN:              parseFloat(localStorage.getItem('tasaMN') || '0') || undefined,
        ofertaDiaId:         localStorage.getItem('ofertaDiaId') || undefined,
        ofertaDiaTexto:      localStorage.getItem('ofertaDiaTexto') || undefined,
        ofertaDiaActualizado: localStorage.getItem('ofertaDiaId') ? new Date().toISOString() : undefined,
        firebaseConfig:      localStorage.getItem('firebaseConfig') ? JSON.parse(localStorage.getItem('firebaseConfig')) : undefined,
        fcmServerKey:        localStorage.getItem('fcmServerKey') || undefined,
        actualizado:         new Date().toISOString(),
    };
    // Limpiar claves undefined
    Object.keys(_configSync).forEach(k => _configSync[k] === undefined && delete _configSync[k]);

    const archivos = [
        { path: 'productos.json',              data: productos },
        { path: 'categorias.json',             data: { nombres: categorias, iconos: iconosPersonalizados } },
        { path: 'subcategorias.json',          data: JSON.parse(localStorage.getItem('subcategorias') || '{}') },
        { path: 'grupos_facebook_config.json', data: { grupos: JSON.parse(localStorage.getItem('gruposFB') || '[]'), exportado: new Date().toISOString() } },
        { path: 'revolico_config.json',        data: JSON.parse(localStorage.getItem('revolicoConfig') || '{}') },
        { path: 'banners.json',                data: JSON.parse(localStorage.getItem('heroBanners') || '[]') },
        // comisiones.json eliminado — consolidado en productos.json
        // ventas_historial.json migrado a Firebase — ya no se sube a GitHub
        { path: 'config.json',                 data: _configSync },
    ];

    // Si hay productos modificados: subir solo productos.json + config.json + grupos
    // Si no hay delta: subir todo
    const archivosFiltrados = hayDelta
        ? archivos.filter(a => ['productos.json', 'config.json', 'grupos_facebook_config.json'].includes(a.path))
        : archivos;

    let ok = 0, errors = [];
    const total = archivosFiltrados.length;
    // Subir secuencialmente para evitar conflictos de SHA en GitHub
    for (let i = 0; i < archivosFiltrados.length; i++) {
        const { path, data } = archivosFiltrados[i];
        actualizarBarra(i, total, `Subiendo ${path}… (${i + 1}/${total})`);
        if (btn) btn.textContent = `⏳ ${i + 1}/${total} archivos...`;
        try {
            await subirArchivoAGitHub(user, repo, token, path, data);
            ok++;
        } catch (e) {
            errors.push(`${path}: ${e.message}`);
        }
    }
    actualizarBarra(total, total, errors.length === 0 ? '✅ ¡Todo subido correctamente!' : '⚠️ Completado con errores');

    if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }

    // Ocultar barra después de 4 segundos
    setTimeout(() => {
        if (barraContenedor) barraContenedor.style.display = 'none';
        const f = document.getElementById('tmSyncFloat');
        if (f) f.style.display = 'none';
    }, 4000);

    if (errors.length === 0) {
        limpiarProductosModificados();
        _tmPublicarVersionFirebase(); // señal para forzar actualización en todos los clientes
        const info = hayDelta ? `${idsModificados.length} producto(s) actualizado(s)` : `${ok} archivos`;
        mostrarNotificacion(`✅ Tienda actualizada (${info}). Visible en ~30 segundos.`);
    } else {
        // Mostrar solo el primer error con mensaje claro (suelen tener la misma causa)
        const primerError = errors[0];
        const causa = primerError.includes(': ') ? primerError.split(': ').slice(1).join(': ').trim() : primerError;
        mostrarNotificacion(`❌ ${causa}`, 'error');
        console.error('Errores de sincronización:', errors);
    }
}

async function sincronizarConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {

        return;
    }
    try {
        await subirArchivoAGitHub(user, repo, token, 'productos.json', productos);
        _tmPublicarVersionFirebase();
    } catch (e) {
        console.warn('⚠️ Error al sincronizar automáticamente:', e.message);
    }
}

// ── Señal de versión en Firebase para forzar actualización en todos los clientes ──
async function _tmPublicarVersionFirebase() {
    const base = _tmRtdbUrl();
    if (!base) return;
    try {
        await fetch(`${base}/config/version.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
        });
    } catch(e) {}
}

async function subirArchivoAGitHub(user, repo, token, path, data) {
    const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' };
    const jsonStr  = JSON.stringify(data, null, 2);
    const content  = btoa(Array.from(new TextEncoder().encode(jsonStr), b => String.fromCharCode(b)).join(''));

    // Calcular tamaño aproximado en bytes (base64 → bytes originales)
    const sizeBytes = jsonStr.length;
    const apiBase   = `https://api.github.com/repos/${user}/${repo}`;

    // Detectar la rama principal (main o master) automáticamente
    async function obtenerRamaPrincipal() {
        try {
            const res = await fetch(`${apiBase}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.default_branch || 'main';
            }
        } catch (e) {}
        return 'main';
    }

    // Función interna para obtener el SHA del archivo (Contents API)
    // Cache-buster para evitar que GitHub devuelva SHA desactualizado
    async function obtenerSHA() {
        try {
            const res = await fetch(`${apiBase}/contents/${path}?_=${Date.now()}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.sha || null;
            }
            if (res.status === 404) return null;
            return null;
        } catch (e) { return null; }
    }

    // Para archivos < 900KB usar la Contents API normal (más simple)
    if (sizeBytes < 900 * 1024) {
        let sha = await obtenerSHA();
        const body = { message: `Actualización de ${path}`, content };
        if (sha) body.sha = sha;

        let response = await fetch(`${apiBase}/contents/${path}`, {
            method: 'PUT', headers, body: JSON.stringify(body)
        });

        // Reintentar con SHA fresco si hay conflicto (hasta 3 intentos)
        for (let intento = 0; intento < 3 && !response.ok && (response.status === 409 || response.status === 422); intento++) {
            await new Promise(r => setTimeout(r, 800)); // esperar antes de reintentar
            sha = await obtenerSHA();
            const bodyRetry = { message: `Actualización de ${path}`, content };
            if (sha) bodyRetry.sha = sha;
            response = await fetch(`${apiBase}/contents/${path}`, {
                method: 'PUT', headers, body: JSON.stringify(bodyRetry)
            });
        }

        if (!response.ok) {
            // Dar mensajes de error claros según el código HTTP
            if (response.status === 401) {
                throw new Error('Token inválido o expirado. Ve a Config y actualiza tu Token de Acceso.');
            }
            if (response.status === 403) {
                throw new Error('Token sin permisos. Asegúrate de que tenga el permiso "repo" completo.');
            }
            // Para 404 en el PUT: verificar si es el repo o el archivo
            if (response.status === 404) {
                // Comprobar si el repo existe realmente
                const checkRepo = await fetch(`${apiBase}`, { headers });
                if (!checkRepo.ok) {
                    throw new Error(`Repositorio "${user}/${repo}" no encontrado. Verifica usuario y nombre del repo en Config.`);
                }
                // El repo existe pero el archivo no se pudo crear: problema de permisos del token
                throw new Error('Token sin permisos de escritura. Asegúrate de que tenga el permiso "repo" completo (no solo "public_repo").');
            }
            let errMsg = `Error ${response.status} al subir ${path}`;
            try { const err = await response.json(); errMsg = err.message || errMsg; } catch(e) {}
            throw new Error(errMsg);
        }
        return;
    }

    // Para archivos >= 900KB usar el Git Data API (soporta archivos grandes)
    const rama = await obtenerRamaPrincipal();

    // Paso 1: Crear blob con el contenido
    const blobRes = await fetch(`${apiBase}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content, encoding: 'base64' })
    });
    if (!blobRes.ok) {
        const e = await blobRes.json();
        throw new Error(`Error creando blob: ${e.message}`);
    }
    const { sha: blobSha } = await blobRes.json();

    // Paso 2: Obtener el SHA del commit más reciente (HEAD)
    const refRes = await fetch(`${apiBase}/git/ref/heads/${rama}`, { headers });
    if (!refRes.ok) throw new Error(`No se pudo obtener la rama "${rama}"`);
    const { object: { sha: commitSha } } = await refRes.json();

    // Paso 3: Obtener el tree SHA del commit
    const commitRes = await fetch(`${apiBase}/git/commits/${commitSha}`, { headers });
    if (!commitRes.ok) throw new Error('No se pudo obtener el commit');
    const { tree: { sha: treeSha } } = await commitRes.json();

    // Paso 4: Crear nuevo tree con el archivo actualizado
    const newTreeRes = await fetch(`${apiBase}/git/trees`, {
        method: 'POST', headers,
        body: JSON.stringify({
            base_tree: treeSha,
            tree: [{ path, mode: '100644', type: 'blob', sha: blobSha }]
        })
    });
    if (!newTreeRes.ok) throw new Error('Error creando tree');
    const { sha: newTreeSha } = await newTreeRes.json();

    // Paso 5: Crear nuevo commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
        method: 'POST', headers,
        body: JSON.stringify({
            message: `Actualización de ${path}`,
            tree: newTreeSha,
            parents: [commitSha]
        })
    });
    if (!newCommitRes.ok) throw new Error('Error creando commit');
    const { sha: newCommitSha } = await newCommitRes.json();

    // Paso 6: Actualizar referencia HEAD (force:true evita el error "not a fast-forward")
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${rama}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sha: newCommitSha, force: true })
    });
    if (!updateRefRes.ok) {
        const e = await updateRefRes.json();
        throw new Error(`Error actualizando ref: ${e.message}`);
    }
}

// ===== LÓGICA DE PERSUASIÓN Y VENTAS =====

function verificarOfertasYMostrarBanner() {
    const banner = document.getElementById('urgenciaBanner');
    if (!banner) return;

    // El banner superior solo debe verse en el inicio.
    // En categorías/listados/detalle ya existen etiquetas dentro de las tarjetas.
    if (typeof tmVistaInicioActiva === 'function' && !tmVistaInicioActiva()) {
        banner.style.setProperty('display', 'none', 'important');
        banner.onclick = null;
        if (typeof actualizarOffsetsUI === 'function') setTimeout(actualizarOffsetsUI, 0);
        return;
    }

    // Prioridad 1: Oferta del Día configurada en el admin
    const ofertaDiaId    = localStorage.getItem('ofertaDiaId');
    const ofertaDiaTexto = localStorage.getItem('ofertaDiaTexto') || '🔥 OFERTA DEL DÍA';

    // Prioridad 2: Countdown activo
    const cdData = localStorage.getItem('activeCountdown');
    const cdObj  = cdData ? (() => { try { return JSON.parse(cdData); } catch(e) { return null; } })() : null;
    const cdValido = cdObj && cdObj.endTime && cdObj.endTime > Date.now();

    let targetId = null;

    if (ofertaDiaId) {
        targetId = ofertaDiaId;
        while (banner.firstChild) banner.removeChild(banner.firstChild);
        const spanFlash = document.createElement('span');
        spanFlash.className = 'flash-deal';
        spanFlash.textContent = ofertaDiaTexto + ' · VER AHORA →';
        banner.appendChild(spanFlash);
    } else if (cdValido) {
        targetId = cdObj.productId;
        while (banner.firstChild) banner.removeChild(banner.firstChild);
        banner.appendChild(document.createTextNode('🔥 ' + (cdObj.texto || '¡Oferta especial!') + ' '));
        const spanFlash = document.createElement('span');
        spanFlash.className = 'flash-deal';
        spanFlash.textContent = 'VER AHORA →';
        banner.appendChild(spanFlash);
    } else {
        // No hay oferta ni countdown → ocultar con !important + clase para
        // ganarle a la regla CSS '.urgencia-banner{display:flex !important}'
        banner.style.setProperty('display', 'none', 'important');
        if (document.body) document.body.classList.add('tm-no-oferta-banner');
        banner.onclick = null;
        setTimeout(actualizarOffsetsUI, 0);
        return;
    }

    // Sí hay oferta → quitar la clase que lo bloquea y mostrarlo
    if (document.body) document.body.classList.remove('tm-no-oferta-banner');
    banner.style.setProperty('display', 'flex', 'important');
    banner.style.cursor  = 'pointer';
    setTimeout(actualizarOffsetsUI, 0);

    banner.onclick = () => {
        if (!targetId) return;
        const idNum = Number(targetId);
        const tarjeta = document.querySelector(`[onclick*="abrirDetalleProducto(${idNum})"]`);
        if (tarjeta) {
            tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            tarjeta.style.transition = 'box-shadow 0.3s';
            tarjeta.style.boxShadow  = '0 0 0 3px #ff6b35, 0 8px 32px rgba(255,107,53,0.5)';
            setTimeout(() => { tarjeta.style.boxShadow = ''; }, 2000);
        }
        abrirDetalleProducto(idNum);
    };
}

// ===== INICIALIZACIÓN =====

function _tmInyectarSkeletons() {
    const sk = '<div class="tm-sk-card">' +
        '<div class="tm-sk tm-sk-img"></div>' +
        '<div class="tm-sk-body">' +
            '<div class="tm-sk tm-sk-line" style="width:80%"></div>' +
            '<div class="tm-sk tm-sk-line" style="width:58%"></div>' +
            '<div class="tm-sk tm-sk-line" style="width:40%"></div>' +
            '<div class="tm-sk tm-sk-btn"></div>' +
        '</div></div>';
    const grid = document.getElementById('productosGrid');
    if (grid && !grid.querySelector('.producto-card')) grid.innerHTML = Array(6).fill(sk).join('');
    const mv = document.getElementById('masVendidosGrid');
    if (mv && !mv.querySelector('.producto-card')) mv.innerHTML = Array(2).fill(sk).join('');
}

function inicializarTienda() {
    _tmInyectarSkeletons();
    // Restaurar badges inmediatamente al cargar
    actualizarContadorCarrito();
    actualizarBadgeCorazon();

    // Renderizar desde caché local ANTES de ir a la red
    // → el usuario ve productos al instante en visitas repetidas
    if (productos.length > 0) {
        renderizarCategoriasHomeInstant();
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
    }

    cargarDatosDesdeGitHub(); // actualiza en background

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.onsubmit = null;
        productForm.addEventListener('submit', agregarProductoForm);
    }

    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.onsubmit = null;
        editForm.addEventListener('submit', guardarProductoEditado);
    }

    const loginForm = document.querySelector('#loginModal form');
    if (loginForm) {
        loginForm.onsubmit = null;
        loginForm.addEventListener('submit', verificarPassword);
    }

    setInterval(() => {
        const panel = document.getElementById('adminPanel');
        if (panel && !panel.classList.contains('hidden')) {
            verificarEstadoBackend();
        }
    }, 30000);

    // El tema se inicializa por _initTema() (ver toggleDarkMode arriba).
    // Re-aplicamos por si el botón apareció después de cargar.
    if (typeof _initTema === 'function') _initTema();

    iniciarCountdownsActivos();
    actualizarOffsetsUI();
    actualizarVisibilidadBannerOferta(true);
    setTimeout(actualizarOffsetsUI, 200);
    setTimeout(actualizarOffsetsUI, 1200);
    window.addEventListener('resize', actualizarOffsetsUI);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', actualizarOffsetsUI);
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarTienda);
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-action="sincronizarTodoConGitHub"]').forEach(el => {
            el.addEventListener('click', sincronizarTodoConGitHub);
        });
    });
} else {
    inicializarTienda();
    document.querySelectorAll('[data-action="sincronizarTodoConGitHub"]').forEach(el => {
        el.addEventListener('click', sincronizarTodoConGitHub);
    });
}

// ===== AUTOMATIZACIÓN HÍBRIDA (SELENIUM) =====


// ===== COUNTDOWN TIMER =====
// countdownIntervals ya está declarada arriba (al inicio del archivo)
// para evitar problemas de TDZ. Solo aseguramos que sea objeto.
if (typeof countdownIntervals !== 'object' || countdownIntervals === null) {
    countdownIntervals = {};
}

function guardarCountdown() {
    const productId = document.getElementById('countdownProductSelect').value;
    const horas = parseInt(document.getElementById('countdownHoras').value) || 0;
    const minutos = parseInt(document.getElementById('countdownMinutos').value) || 0;
    const texto = document.getElementById('countdownTexto').value.trim() || '¡Oferta especial!';

    if (!productId) {
        mostrarNotificacion('⚠️ Selecciona un producto', 'error');
        return;
    }

    const duracionMs = (horas * 3600 + minutos * 60) * 1000;
    if (duracionMs <= 0) {
        mostrarNotificacion('⚠️ Ingresa una duración válida', 'error');
        return;
    }

    const endTime = Date.now() + duracionMs;
    const countdown = { productId, endTime, texto };
    localStorage.setItem('activeCountdown', JSON.stringify(countdown));

    const producto = productos.find(p => p.id == productId);
    const nombre = producto ? producto.nombre : 'Producto';

    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = `✅ Countdown activo para: <strong>${escapeHtml(nombre)}</strong>`;

    // Re-render to show timer
    renderizarMasVendidos();
    renderizarProductos();
    iniciarCountdownsActivos();

    mostrarNotificacion(`⏱️ Countdown activado para "${nombre}"`);
}

function desactivarCountdown() {
    localStorage.removeItem('activeCountdown');
    if (!countdownIntervals || typeof countdownIntervals !== 'object') countdownIntervals = {};
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};
    renderizarMasVendidos();
    renderizarProductos();
    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = 'Countdown desactivado.';
    mostrarNotificacion('🗑️ Countdown desactivado');
}

// ═══════════════════════════════════════════════════════
//  ⚡ OFERTA DEL DÍA (sección del home)
//  Se puebla con el producto configurado en `ofertaDiaId`.
//  Si no hay ninguno, la sección queda oculta. Reusa el
//  countdown activo (activeCountdown) con timer propio.
// ═══════════════════════════════════════════════════════
let _ndDealTimer = null;
function renderOfertaDelDia() {
    const sec = document.getElementById('ofertaDelDia');
    if (!sec) return;

    // Limpiar timer previo siempre (evita duplicados al re-render)
    if (_ndDealTimer) { clearInterval(_ndDealTimer); _ndDealTimer = null; }

    let ofId = null;
    try { ofId = localStorage.getItem('ofertaDiaId'); } catch (e) {}
    const prod = ofId ? productos.find(p => String(p.id) === String(ofId)) : null;

    if (!prod) { sec.style.display = 'none'; return; }

    let texto = '⚡ Oferta del día';
    try { texto = localStorage.getItem('ofertaDiaTexto') || texto; } catch (e) {}

    // Textos y producto
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
    setTxt('ndDealBadge', texto);
    setTxt('ndDealTitle', prod.nombre);
    setTxt('ndDealSub', prod.descripcion ? String(prod.descripcion).replace(/<[^>]*>/g, '').slice(0, 110) : 'Aprovecha este precio por tiempo limitado.');
    setTxt('ndDealName', prod.nombre);
    setTxt('ndDealPrice', (typeof formatPrecio === 'function') ? formatPrecio(prod.precioActual) : ('$' + prod.precioActual + ' USD'));

    // Imagen real del producto (o emoji por categoría como fallback)
    const card = document.getElementById('nd-deal-card');
    const emojiEl = document.getElementById('ndDealEmoji');
    if (card) {
        const old = card.querySelector('.nd-dpc-img');
        if (old) old.remove();
        if (prod.imagen) {
            const img = document.createElement('img');
            img.className = 'nd-dpc-img';
            img.src = prod.imagen;
            img.alt = prod.nombre;
            img.loading = 'lazy';
            img.onerror = function () { this.remove(); if (emojiEl) emojiEl.style.display = 'block'; };
            card.insertBefore(img, card.firstChild);
            if (emojiEl) emojiEl.style.display = 'none';
        } else {
            if (emojiEl) {
                emojiEl.style.display = 'block';
                emojiEl.textContent = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(prod.categoria) : '⚡';
            }
        }
    }

    // Precio original tachado + % descuento
    const oldEl = document.getElementById('ndDealOld');
    const discEl = document.getElementById('ndDealDisc');
    const hayDesc = prod.precioOriginal > 0 && prod.precioOriginal > prod.precioActual;
    if (oldEl) {
        if (hayDesc) { oldEl.style.display = 'block'; oldEl.textContent = '$' + Number(prod.precioOriginal).toFixed(0) + ' USD'; }
        else oldEl.style.display = 'none';
    }
    if (discEl) {
        if (hayDesc) {
            const pct = Math.round((1 - prod.precioActual / prod.precioOriginal) * 100);
            setTxt('ndDealDiscPct', pct + '%');
            discEl.style.display = 'flex';
        } else discEl.style.display = 'none';
    }

    // Timer: solo si hay countdown activo para este producto
    const timerWrap = document.getElementById('ndDealTimer');
    const cd = (typeof getActiveCountdown === 'function') ? getActiveCountdown() : null;
    if (cd && String(cd.productId) === String(prod.id) && timerWrap) {
        timerWrap.style.display = 'flex';
        const pad = n => String(n).padStart(2, '0');
        const tick = () => {
            const rem = Math.max(0, cd.endTime - Date.now());
            setTxt('nd-deal-h', pad(Math.floor(rem / 3600000)));
            setTxt('nd-deal-m', pad(Math.floor((rem % 3600000) / 60000)));
            setTxt('nd-deal-s', pad(Math.floor((rem % 60000) / 1000)));
            if (rem <= 0 && _ndDealTimer) { clearInterval(_ndDealTimer); _ndDealTimer = null; }
        };
        tick();
        _ndDealTimer = setInterval(tick, 1000);
    } else if (timerWrap) {
        timerWrap.style.display = 'none';
    }

    sec.style.display = 'block';
}

// Abre el detalle del producto de la oferta del día
function abrirOfertaDelDia() {
    let ofId = null;
    try { ofId = localStorage.getItem('ofertaDiaId'); } catch (e) {}
    if (ofId && typeof abrirDetalleProducto === 'function') abrirDetalleProducto(ofId);
}

// ===== GALERÍA ROTATIVA DEL HERO (tarjeta 3D) con efecto de desintegración =====
let _ndHeroTimer = null;
let _ndHeroIdx = 0;
let _ndHeroProds = [];
let _ndEfectoActivo = false; // bloquea doble transición

// ── Canvas de partículas para el efecto de desintegración ──
function _ndCrearCanvasParticulas() {
    const card = document.getElementById('ndHeroCard3d');
    if (!card) return null;
    let canvas = card.querySelector('.nd-particulas-canvas');
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.className = 'nd-particulas-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;z-index:50;pointer-events:none;border-radius:28px;width:100%;height:100%';
    card.appendChild(canvas);
    canvas.width = card.offsetWidth || 340;
    canvas.height = card.offsetHeight || 440;
    return canvas;
}

function _ndDesintegrarYTransicion(idxSiguiente) {
    const card = document.getElementById('ndHeroCard3d');
    if (!card || _ndEfectoActivo) return;
    _ndEfectoActivo = true;

    const canvas = _ndCrearCanvasParticulas();
    if (!canvas) { _ndEfectoActivo = false; return; }
    const ctx = canvas.getContext('2d');

    // Actualizar tamaño del canvas
    canvas.width = card.offsetWidth || 340;
    canvas.height = card.offsetHeight || 440;
    const W = canvas.width;
    const H = canvas.height;

    // Crear partículas a partir de la imagen actual de la tarjeta
    const particulas = [];
    const cols = 16;
    const rows = 20;
    const pw = W / cols;
    const ph = H / rows;

    const body = document.getElementById('ndHeroBody');
    const imgWrap = document.getElementById('ndHeroImg');

    // Paleta de colores del tema de la tarjeta
    const colores = ['#FF6B35', '#FF9F43', '#E8501E', '#C9A96E', '#FFFFFF', '#FFD4C2', '#FFE8D6', '#1A1A1A', '#2A2A2A', '#E8C88A', '#F0EDE8', '#FAF8F5'];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            particulas.push({
                x: col * pw + pw / 2,
                y: row * ph + ph / 2,
                vx: (Math.random() - 0.5) * 3.5,
                vy: (Math.random() - 0.8) * 4 - 1.5,
                size: Math.random() * (pw * 0.7) + 2,
                life: 1,
                decay: Math.random() * 0.025 + 0.015,
                color: colores[Math.floor(Math.random() * colores.length)],
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.15
            });
        }
    }

    // Ocultar contenido original inmediatamente
    if (body) body.style.opacity = '0';
    if (imgWrap) imgWrap.style.opacity = '0';

    // Preparar el nuevo contenido (pero aún invisible)
    const p = _ndHeroProds[idxSiguiente];
    if (p) {
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('ndHeroCat', p.categoria || 'Producto');
        setTxt('ndHeroTitle', p.nombre || '');
        const hayDesc = p.precioOriginal > 0 && p.precioOriginal > p.precioActual;
        setTxt('ndHeroRate', hayDesc
            ? '⚡ Oferta · ' + safeNum(p.stock) + ' disp.'
            : '4.9 · ' + (safeNum(p.stock) > 0 ? safeNum(p.stock) + ' disponibles' : 'Top ventas'));

        const precioEl = document.getElementById('ndHeroPrice');
        const usdEl = document.getElementById('ndHeroUsd');
        const esMN = (typeof tmMonedaActual === 'function' && tmMonedaActual() === 'MN');
        if (precioEl) {
            if (esMN && typeof getTasaMN === 'function' && getTasaMN() > 0) {
                precioEl.textContent = '$' + Math.round(p.precioActual * getTasaMN()).toLocaleString();
                if (usdEl) usdEl.textContent = 'MN';
            } else {
                precioEl.textContent = '$' + Number(p.precioActual).toFixed(0);
                if (usdEl) usdEl.textContent = 'USD';
            }
        }
        if (imgWrap) {
            const fallback = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(p.categoria) : '📦';
            if (p.imagen) {
                imgWrap.innerHTML = '<img src="' + escapeAttr(p.imagen) + '" alt="' + escapeAttr(p.nombre) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent=\'' + fallback + '\'">';
            } else {
                imgWrap.textContent = fallback;
            }
        }
    }

    // Animar partículas
    let animId;
    const animar = () => {
        ctx.clearRect(0, 0, W, H);

        let todasMuertas = true;
        particulas.forEach(part => {
            if (part.life <= 0) return;
            todasMuertas = false;

            part.x += part.vx;
            part.y += part.vy;
            part.vy += 0.03; // gravedad
            part.vx *= 0.995;
            part.rotation += part.rotSpeed;
            part.life -= part.decay;

            const alpha = Math.max(0, part.life);
            const scale = 0.5 + part.life * 0.5;

            ctx.save();
            ctx.translate(part.x, part.y);
            ctx.rotate(part.rotation);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = part.color;
            ctx.fillRect(-part.size * scale / 2, -part.size * scale / 2, part.size * scale, part.size * scale);
            ctx.restore();
        });

        if (todasMuertas) {
            cancelAnimationFrame(animId);
            // Revelar nuevo contenido
            if (body) { body.style.opacity = '1'; body.style.transition = 'opacity 0.35s ease'; }
            if (imgWrap) { imgWrap.style.opacity = '1'; imgWrap.style.transition = 'opacity 0.35s ease'; }
            // Limpiar canvas
            ctx.clearRect(0, 0, W, H);
            _ndEfectoActivo = false;
            // Actualizar dots
            const dots = document.getElementById('ndHeroDots');
            if (dots) dots.querySelectorAll('.nd-hero-dot').forEach((d, i) => d.classList.toggle('active', i === idxSiguiente));
            return;
        }
        animId = requestAnimationFrame(animar);
    };
    animId = requestAnimationFrame(animar);
}

function renderHeroGaleria() {
    const card = document.getElementById('ndHeroCard3d');
    if (!card || typeof productos === 'undefined' || !Array.isArray(productos)) return;

    // Productos: más vendidos con stock; si no hay, los primeros con stock
    const masVendidos = productos.filter(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0);
    const lista = (masVendidos.length > 0 ? masVendidos : productos.filter(p => p.stock > 0)).slice(0, 6);
    _ndHeroProds = lista;

    // Sin productos → deja el contenido estático y un fallback en el botón
    if (lista.length === 0) {
        const btn0 = document.getElementById('ndHeroBtn');
        if (btn0 && typeof contactarWhatsApp === 'function') btn0.onclick = (e) => { e.stopPropagation(); contactarWhatsApp(); };
        return;
    }

    if (_ndHeroTimer) { clearInterval(_ndHeroTimer); _ndHeroTimer = null; }
    _ndHeroIdx = 0;
    _ndEfectoActivo = false;

    // Puntos indicadores
    const dots = document.getElementById('ndHeroDots');
    if (dots) dots.innerHTML = lista.map((_, i) => '<span class="nd-hero-dot' + (i === 0 ? ' active' : '') + '"></span>').join('');

    // Pintar el primer producto directamente (sin desintegración)
    const pintarDirecto = (idx) => {
        const p = lista[idx];
        if (!p) return;
        const body = document.getElementById('ndHeroBody');
        const imgWrap = document.getElementById('ndHeroImg');

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('ndHeroCat', p.categoria || 'Producto');
        setTxt('ndHeroTitle', p.nombre || '');
        const hayDesc = p.precioOriginal > 0 && p.precioOriginal > p.precioActual;
        setTxt('ndHeroRate', hayDesc
            ? '⚡ Oferta · ' + safeNum(p.stock) + ' disp.'
            : '4.9 · ' + (safeNum(p.stock) > 0 ? safeNum(p.stock) + ' disponibles' : 'Top ventas'));

        const precioEl = document.getElementById('ndHeroPrice');
        const usdEl = document.getElementById('ndHeroUsd');
        const esMN = (typeof tmMonedaActual === 'function' && tmMonedaActual() === 'MN');
        if (precioEl) {
            if (esMN && typeof getTasaMN === 'function' && getTasaMN() > 0) {
                precioEl.textContent = '$' + Math.round(p.precioActual * getTasaMN()).toLocaleString();
                if (usdEl) usdEl.textContent = 'MN';
            } else {
                precioEl.textContent = '$' + Number(p.precioActual).toFixed(0);
                if (usdEl) usdEl.textContent = 'USD';
            }
        }

        if (imgWrap) {
            const fallback = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(p.categoria) : '📦';
            if (p.imagen) {
                imgWrap.innerHTML = '<img src="' + escapeAttr(p.imagen) + '" alt="' + escapeAttr(p.nombre) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent=\'' + fallback + '\'">';
            } else {
                imgWrap.textContent = fallback;
            }
        }

        if (body) body.style.opacity = '1';
        if (imgWrap) imgWrap.style.opacity = '1';
        if (dots) dots.querySelectorAll('.nd-hero-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    };

    pintarDirecto(0);

    // Tocar la tarjeta abre el detalle del producto actual
    card.onclick = () => { const p = _ndHeroProds[_ndHeroIdx]; if (p && typeof abrirDetalleProducto === 'function') abrirDetalleProducto(p.id); };
    // Botón "Pedir" → WhatsApp con el producto actual
    const btn = document.getElementById('ndHeroBtn');
    if (btn) btn.onclick = (e) => {
        e.stopPropagation();
        const p = _ndHeroProds[_ndHeroIdx];
        if (p && typeof tmComprar === 'function') tmComprar(e, p.id, p.nombre);
        else if (typeof contactarWhatsApp === 'function') contactarWhatsApp();
    };

    // Auto-rotación cada 4s con efecto de desintegración
    const avanzar = () => {
        if (_ndEfectoActivo) return;
        _ndHeroIdx = (_ndHeroIdx + 1) % lista.length;
        _ndDesintegrarYTransicion(_ndHeroIdx);
    };
    if (lista.length > 1) _ndHeroTimer = setInterval(avanzar, 4000);

    // Pausa al pasar el mouse / tocar
    card.onmouseenter = () => { if (_ndHeroTimer) { clearInterval(_ndHeroTimer); _ndHeroTimer = null; } };
    card.onmouseleave = () => { if (lista.length > 1 && !_ndHeroTimer) _ndHeroTimer = setInterval(avanzar, 4000); };
}

function getActiveCountdown() {
    try {
        const saved = localStorage.getItem('activeCountdown');
        if (!saved) return null;
        const cd = JSON.parse(saved);
        if (cd.endTime <= Date.now()) {
            localStorage.removeItem('activeCountdown');
            return null;
        }
        return cd;
    } catch { return null; }
}

function renderCountdownHtml(productId) {
    const cd = getActiveCountdown();
    if (!cd || String(cd.productId) !== String(productId)) return '';
    
    return `<div class="producto-countdown" id="countdown_${safeNum(productId)}">
        <span class="countdown-label">🔥 ${escapeHtml(cd.texto)}</span>
        <div class="countdown-time">
            <span class="countdown-block" id="cd_h_${safeNum(productId)}">--</span>
            <span class="countdown-sep">:</span>
            <span class="countdown-block" id="cd_m_${safeNum(productId)}">--</span>
            <span class="countdown-sep">:</span>
            <span class="countdown-block" id="cd_s_${safeNum(productId)}">--</span>
        </div>
    </div>`;
}

function iniciarCountdownsActivos() {
    if (!countdownIntervals || typeof countdownIntervals !== 'object') countdownIntervals = {};
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};

    const cd = getActiveCountdown();
    if (!cd) return;

    const pid = cd.productId;
    const tickerFn = () => {
        const remaining = Math.max(0, cd.endTime - Date.now());
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        const pad = n => String(n).padStart(2, '0');

        ['masVendidosGrid', 'productosGrid'].forEach(gridId => {
            const hEl = document.getElementById(`cd_h_${pid}`);
            const mEl = document.getElementById(`cd_m_${pid}`);
            const sEl = document.getElementById(`cd_s_${pid}`);
            if (hEl) hEl.textContent = pad(h);
            if (mEl) mEl.textContent = pad(m);
            if (sEl) sEl.textContent = pad(s);
        });

        if (remaining <= 0) {
            clearInterval(countdownIntervals[pid]);
            localStorage.removeItem('activeCountdown');
        }
    };
    tickerFn();
    countdownIntervals[pid] = setInterval(tickerFn, 1000);
}

function actualizarCountdownProductSelect() {
    const sel = document.getElementById('countdownProductSelect');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Ninguno (desactivar timer) --</option>';
    productos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        sel.appendChild(opt);
    });
    // Preselect active countdown product
    const cd = getActiveCountdown();
    if (cd) sel.value = cd.productId;
    else if (current) sel.value = current;

    // Update status
    const status = document.getElementById('countdownStatus');
    if (status && cd) {
        const producto = productos.find(p => p.id == cd.productId);
        if (producto) status.innerHTML = `✅ Countdown activo para: <strong>${escapeHtml(producto.nombre)}</strong>`;
    }
}

// ===== FAST CATEGORIES - render from localStorage immediately =====
// Patch renderizarCategoriasHome for performance 
// (already called from cargarDatosDesdeGitHub, but we want instant local render too)
function renderizarCategoriasHomeInstant() {
    // Load from localStorage immediately (no network wait)
    const localProds = JSON.parse(localStorage.getItem('productos')) || [];
    const localCats = JSON.parse(localStorage.getItem('categorias')) || [];
    // Solo omitir si no hay absolutamente nada (primer uso sin datos en caché)
    if (localCats.length === 0) return;
    
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const cardTodas = document.createElement('div');
    cardTodas.className = 'categoria-card';
    cardTodas.innerHTML = `<span class="cat-wm">🛍️</span><span class="cat-icon">🛍️</span><span class="cat-name">Todos</span><span class="cat-count">${localProds.length} producto${localProds.length !== 1 ? 's' : ''}</span><span class="cat-cta">→ Explorar</span>`;
    cardTodas.onclick = () => mostrarVistaCategoria('Todas');
    grid.appendChild(cardTodas);

    const maxCount = localCats.length ? Math.max(...localCats.map(cat => localProds.filter(p => p.categoria === cat).length)) : 0;
    localCats.forEach(cat => {
        const count = localProds.filter(p => p.categoria === cat).length;
        const card = document.createElement('div');
        card.className = 'categoria-card' + (count === 0 ? ' proximamente' : '');
        const icon = obtenerIconoCategoria(cat);
        const badge = (count > 0 && count === maxCount) ? '<span class="cat-badge">🔥 Popular</span>' : '';
        const cta = count > 0 ? '<span class="cat-cta">→ Explorar</span>' : '';
        card.innerHTML = `${badge}<span class="cat-wm">${icon}</span><span class="cat-icon">${icon}</span><span class="cat-name">${cat}</span><span class="cat-count">${count === 0 ? '🕐 Próximamente' : count + ' producto' + (count !== 1 ? 's' : '')}</span>${cta}`;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
    // Dispara animaciones CSS DESPUÉS de que el DOM está poblado
    requestAnimationFrame(() => grid.classList.add('tm-rendered'));
}

// ── Inicialización robusta de categorías ──
// Intenta renderizar inmediatamente, y si el grid aún no existe
// (porque el DOM no está listo), reintenta en DOMContentLoaded.
// Además programa un retry a los 800ms por si los datos llegaron tarde.
function _initCategorias() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return; // DOM no listo aún
    renderizarCategoriasHomeInstant();
}

if (document.readyState !== 'loading') {
    _initCategorias();
} else {
    document.addEventListener('DOMContentLoaded', _initCategorias);
}

// Retry robusto: si después de 800ms el grid sigue vacío, volver a intentar
// Esto cubre el caso PWA donde el SW demora en responder
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const grid = document.getElementById('categoriasGrid');
        if (grid && grid.children.length === 0) {
            renderizarCategoriasHomeInstant();
        }
    }, 800);
    // Segundo retry a los 2s por si la red es muy lenta
    setTimeout(() => {
        const grid = document.getElementById('categoriasGrid');
        if (grid && grid.children.length === 0) {
            renderizarCategoriasHomeInstant();
        }
    }, 2000);
});



// ===== PATCH actualizarListaProductos to also update countdown select =====
if (typeof actualizarListaProductos === 'function') {
    const _origActualizarListaProductos = actualizarListaProductos;
    actualizarListaProductos = function() {
        _origActualizarListaProductos();
        if (typeof actualizarCountdownProductSelect === 'function') {
            actualizarCountdownProductSelect();
        }
    };
}

// ===== FIX: Subcategories showing only General =====
// Override renderizarSubcategoriaTabs to also load from GitHub subcategorias.json
async function cargarSubcategoriasDesdeGitHub() {
    try {
        const res = await fetch('subcategorias.json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object') {
                // Merge with local - github takes priority
                if (typeof subcategorias !== 'undefined') {
                    Object.assign(subcategorias, data);
                    localStorage.setItem('subcategorias', JSON.stringify(subcategorias));
                }
            }
        }
    } catch(e) {
    }
}

// Patch cargarDatosDesdeGitHub to also load subcategorias
if (typeof cargarDatosDesdeGitHub === 'function') {
    const _origCargarDatos = cargarDatosDesdeGitHub;
    cargarDatosDesdeGitHub = async function() {
        await _origCargarDatos();
        await cargarSubcategoriasDesdeGitHub();
        // Re-render subcategoria tabs if a category is currently selected
        if (typeof categoriaSeleccionada !== 'undefined' && categoriaSeleccionada && categoriaSeleccionada !== 'Todas') {
            if (typeof renderizarSubcategoriaTabs === 'function') renderizarSubcategoriaTabs();
        }
    };
}

// FIX: When showing category view, make sure subcategorias are loaded first
if (typeof mostrarVistaCategoria === 'function') {
    const _origMostrarVistaCat = mostrarVistaCategoria;
    mostrarVistaCategoria = function(categoria) {
        // Reload subcategorias from localStorage fresh each time
        if (typeof subcategorias !== 'undefined') {
            try {
                const fresh = JSON.parse(localStorage.getItem('subcategorias'));
                if (fresh) Object.assign(subcategorias, fresh);
            } catch(e) {}
        }
        _origMostrarVistaCat(categoria);
    };
}

// ═══════════════════════════════════════════════════════
//  MEJORAS v3.0 — Gestión por categorías + Grupos FB
// ═══════════════════════════════════════════════════════

// ── Gestión de productos por categorías ──────────────

function actualizarListaProductos() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    const busqueda  = (document.getElementById('searchProductos')?.value || '').toLowerCase().trim();
    const filtroCat = document.getElementById('filtroCategoria')?.value || '';

    // Actualizar opciones del filtro de categoría
    const selectFiltro = document.getElementById('filtroCategoria');
    if (selectFiltro) {
        const cats = [...new Set(productos.map(p => p.categoria).filter(Boolean))];
        const valorActual = selectFiltro.value;
        selectFiltro.innerHTML = '<option value="">Todas las categorías</option>' +
            cats.map(c => `<option value="${c}" ${c === valorActual ? 'selected' : ''}>${c}</option>`).join('');
        selectFiltro.value = valorActual; // FIX: restaurar el filtro
    }

    let filtrados = productos.filter(p => {
        const matchBusq = !busqueda || p.nombre.toLowerCase().includes(busqueda) || (p.descripcion||'').toLowerCase().includes(busqueda);
        const matchCat  = !filtroCat || p.categoria === filtroCat;
        return matchBusq && matchCat;
    });

    if (filtrados.length === 0) {
        productsList.innerHTML = '<p class="no-products">No se encontraron productos</p>';
        return;
    }

    // Agrupar por categoría — agotados al final dentro de cada grupo
    const porCategoria = {};
    filtrados.forEach(p => {
        const cat = p.categoria || 'General';
        if (!porCategoria[cat]) porCategoria[cat] = [];
        porCategoria[cat].push(p);
    });
    Object.values(porCategoria).forEach(arr => arr.sort((a, b) => (a.stock > 0 ? 0 : 1) - (b.stock > 0 ? 0 : 1)));

    let html = `<div style="margin-bottom:14px;padding:12px 16px;background:rgba(39,174,96,0.1);border:1px dashed #27AE60;border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <span style="font-size:13px;">📦 <strong>${safeNum(filtrados.length)}</strong> productos${filtroCat ? ` en <strong>${escapeHtml(filtroCat)}</strong>` : ''}</span>
        <button class="btn btn-primary" onclick="descargarProductosJSON()" style="font-size:12px;padding:8px 14px;">📥 Descargar productos.json</button>
    </div>`;

    Object.entries(porCategoria).forEach(([cat, prods]) => {
        html += `<div style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 14px;background:var(--primary);border-radius:10px;">
                <span style="font-size:16px;font-weight:700;color:white;">${escapeHtml(cat)}</span>
                <span style="font-size:12px;color:rgba(255,255,255,0.8);margin-left:auto;">${safeNum(prods.length)} producto${prods.length>1?'s':''}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">`;

        prods.forEach(producto => {
            const _id = safeNum(producto.id);
            const _nm = escapeHtml(producto.nombre);
            const _im = escapeAttr(producto.imagen);
            const stock = producto.stock || 0;
            const stockClass = stock === 0 ? 'out' : stock <= 3 ? 'low' : 'ok';
            const stockLabel = stock === 0 ? 'Agotado' : stock + ' uds';
            html += `<div class="tm-prod-card">
                <div class="tm-prod-card-header">
                    <img src="${_im}" alt="" class="tm-prod-thumb" onerror="this.src='/iconos/favicon-192.png';this.style.opacity='0.3'">
                    <div class="tm-prod-info">
                        <div class="tm-prod-name">${_nm}${producto.masVendido ? ' 🔥' : ''}</div>
                        <div class="tm-prod-meta">$${Number(producto.precioActual).toFixed(2)} USD${producto.descuento > 0 ? ' · <span style="color:#e74c3c;">−'+safeNum(producto.descuento)+'%</span>' : ''}</div>
                        ${producto.comision > 0 ? `<div class="tm-prod-commission">💰 Comisión: ${producto.comisionMoneda === 'MN' ? '' : '$'}${Number(producto.comision).toFixed(2)} ${producto.comisionMoneda || 'USD'}</div>` : ''}
                    </div>
                    <button type="button" class="tm-prod-icon-btn edit" onclick="abrirEditModal(${_id})" title="Editar">✏️</button>
                    <button type="button" class="tm-prod-icon-btn star${producto.masVendido ? ' active' : ''}" onclick="tmToggleMasVendido(${_id},event)" title="${producto.masVendido ? 'Quitar de Más Vendidos' : 'Destacar en Más Vendidos'}">⭐</button>
                    <button type="button" class="tm-prod-icon-btn del" onclick="eliminarProducto(${_id})" title="Eliminar">🗑️</button>
                </div>
                <div class="tm-prod-stock-row">
                    <button type="button" class="tm-stock-btn minus" onclick="ajustarStock(${_id},-1)">−</button>
                    <button type="button" class="tm-stock-btn plus"  onclick="ajustarStock(${_id}, 1)">+</button>
                    <span class="tm-stock-label">Stock:</span>
                    <span class="tm-stock-value ${stockClass}">${stockLabel}</span>
                    ${stock > 0 ? `<button type="button" class="tm-stock-btn zero" onclick="fijarStockCero(${_id})" title="Marcar agotado">→0</button>` : ''}
                </div>
                <div class="tm-prod-pub-row">
                    <button type="button" class="tm-pub-btn" style="background:#e67e22;" onclick="publicarEnRevolico(${_id})">🟠 Revolico</button>
                    <button type="button" class="tm-pub-btn" style="background:#4267B2;" onclick="copiarParaFacebook(${_id})">📋 Facebook</button>
                </div>
            </div>`;
        });

        html += `</div></div>`;
    });

    productsList.innerHTML = html;
}

// ── Ajustar stock desde gestionar ──────────────────
function fijarStockCero(id) {
    const p = productos.find(p => p.id === id);
    if (!p || p.stock === 0) return;
    p.stock = 0;
    guardarProductos();
    marcarProductoModificado(id);
    actualizarListaProductos();
    mostrarNotificacion(`🔴 ${p.nombre}: marcado como agotado`, 'warning');
}

// desdeVenta=true cuando lo llama registrarVenta (omite notificación de stock para no duplicar)

// ── Toggle rápido de Más Vendido desde la lista de productos ──
function tmToggleMasVendido(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const p = productos.find(x => x.id === id);
    if (!p) return;
    p.masVendido = !p.masVendido;
    guardarProductos();
    marcarProductoModificado(id);
    actualizarListaProductos();
    renderizarMasVendidos();
    if (typeof renderHeroGaleria === 'function') renderHeroGaleria();
    mostrarNotificacion(p.masVendido ? '⭐ ' + p.nombre + ': destacado en Más Vendidos' : ' ' + p.nombre + ': quitado de Más Vendidos');
}

function ajustarStock(id, cantidad, desdeVenta = false) {
    const p = productos.find(p => p.id === id);
    if (!p) return;
    const antes = p.stock;
    p.stock = Math.max(0, (p.stock || 0) + cantidad);
    guardarProductos();
    marcarProductoModificado(id);
    actualizarListaProductos();
    // Solo mostrar notificación de stock cuando se ajusta desde Gestionar (no desde una venta)
    if (!desdeVenta) {
        mostrarNotificacion(`📦 ${p.nombre}: ${antes} → ${p.stock} unidades`);
        if (p.stock === 0) mostrarNotificacion(`🔴 ¡${p.nombre} agotado!`, 'error');
        else if (p.stock <= 2) mostrarNotificacion(`⚠️ ${p.nombre}: solo ${p.stock} unidad(es)`, 'warning');
    }
}

// ── ANIMACIONES DE SCROLL ─────────────────────────────
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .tm-anim-card {
            opacity: 0;
            transform: translateY(20px);
            transition: opacity .45s ease, transform .45s ease;
        }
        .tm-anim-card.tm-visible {
            opacity: 1;
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);
    window._tmAnimObs = new IntersectionObserver((entries) => {
        entries.forEach((e, i) => {
            if (e.isIntersecting) {
                setTimeout(() => e.target.classList.add('tm-visible'), i * 60);
                window._tmAnimObs.unobserve(e.target);
            }
        });
    }, { threshold: 0.08 });
})();

// ── VENTAS — registro de ventas ─────────────────────

// Helper: obtiene/carga la configuración Firebase para RTDB.
// Antes solo leía localStorage; en una sesión nueva del admin eso podía estar vacío
// y por eso las ventas de Firebase no cargaban hasta tocar otra sección.
let _fbConfigPromise = null;
async function _fbEnsureConfig() {
    try {
        const raw = localStorage.getItem('firebaseConfig');
        if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && (cfg.databaseURL || cfg.projectId)) return cfg;
        }
    } catch(e) {}
    if (_fbConfigPromise) return _fbConfigPromise;
    _fbConfigPromise = (async () => {
        try {
            const res = await fetch('config.json?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            const cfg = data && data.firebaseConfig;
            if (cfg && (cfg.databaseURL || cfg.projectId)) {
                localStorage.setItem('firebaseConfig', JSON.stringify(cfg));
                if (cfg.vapidKey) localStorage.setItem('firebaseVapidKey', cfg.vapidKey);
                return cfg;
            }
        } catch(e) {
            console.warn('⚠️ Firebase config load:', e.message);
        } finally {
            setTimeout(() => { _fbConfigPromise = null; }, 1000);
        }
        return null;
    })();
    return _fbConfigPromise;
}

// Helper: obtiene la URL base de Firebase RTDB desde config guardada
function _fbRtdbUrl() {
    try {
        const cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
        if (!cfg || typeof cfg !== 'object') return null;
        return cfg.databaseURL ||
               (cfg.projectId ? `https://${cfg.projectId}-default-rtdb.firebaseio.com` : null);
    } catch(e) { return null; }
}

// Escribe una venta en Firebase RTDB (sin bloquear — fire & forget)
function _fbGuardarVenta(venta) {
    (async () => {
        await _fbEnsureConfig();
        const url = _fbRtdbUrl();
        if (!url) return;
        await fetch(`${url}/ventas/${venta.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(venta)
        });
    })().catch(e => console.warn('⚠️ Firebase ventas write:', e.message));
}

// Elimina una venta de Firebase RTDB
function _fbEliminarVenta(id) {
    (async () => {
        await _fbEnsureConfig();
        const url = _fbRtdbUrl();
        if (!url) return;
        await fetch(`${url}/ventas/${id}.json`, { method: 'DELETE' });
    })().catch(e => console.warn('⚠️ Firebase ventas delete:', e.message));
}

// Borra todo el nodo ventas en Firebase RTDB
function _fbBorrarTodasVentas() {
    (async () => {
        await _fbEnsureConfig();
        const url = _fbRtdbUrl();
        if (!url) return;
        await fetch(`${url}/ventas.json`, { method: 'DELETE' });
    })().catch(e => console.warn('⚠️ Firebase ventas clear:', e.message));
}

// Migra ventas guardadas accidentalmente en la raíz de Firebase (0,1,2,3...) a /ventas/{id}
async function _fbMigrarVentasRaiz(url) {
    const ventasMigradas = [];
    // Probar nodos 0-19 individualmente (no requiere leer la raíz)
    for (let k = 0; k < 20; k++) {
        try {
            const r = await fetch(`${url}/${k}.json`);
            if (!r.ok) continue;
            const v = await r.json();
            if (!v || typeof v !== 'object' || !v.id || !v.producto) continue;
            // Copiar a /ventas/{id}
            const putRes = await fetch(`${url}/ventas/${v.id}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(v)
            });
            if (putRes.ok) {
                // Borrar del root (puede fallar si no hay permisos, no es crítico)
                await fetch(`${url}/${k}.json`, { method: 'DELETE' }).catch(() => {});
                ventasMigradas.push(v);
            }
        } catch(e) {}
    }
    return ventasMigradas;
}

// Carga ventas desde Firebase y hace merge con localStorage (en background al iniciar)
async function _fbSincronizarVentasAlIniciar() {
    await _fbEnsureConfig();
    const url = _fbRtdbUrl();
    if (!url) return;
    try {
        // Migrar ventas mal guardadas en la raíz primero
        const migradas = await _fbMigrarVentasRaiz(url);

        const res = await fetch(`${url}/ventas.json`);
        if (!res.ok) return;
        const data = await res.json();
        const ventasFB = data && typeof data === 'object' ? Object.values(data).filter(Boolean) : [];

        // Combinar migradas + las ya en /ventas/
        const todasFB = [...ventasFB, ...migradas.filter(m => !ventasFB.find(v => v.id === m.id))];

        const ventasLocales = JSON.parse(localStorage.getItem('registroVentas') || '[]');
        const idsFB = new Set(todasFB.map(v => v.id));
        const soloLocales = ventasLocales.filter(v => !idsFB.has(v.id));
        soloLocales.forEach(v => _fbGuardarVenta(v));
        const merged = [...todasFB, ...soloLocales]
            .sort((a, b) => b.id - a.id)
            .slice(0, 500);
        if (merged.length) {
            localStorage.setItem('registroVentas', JSON.stringify(merged));
            renderizarVentas();
        }
    } catch(e) {
        console.warn('⚠️ No se pudo sincronizar ventas desde Firebase:', e.message);
    }
}

function cargarVentas() {
    try {
        const v = JSON.parse(localStorage.getItem('registroVentas') || '[]');
        return Array.isArray(v) ? v : [];
    } catch(e) {
        localStorage.removeItem('registroVentas');
        return [];
    }
}

function guardarVenta(venta) {
    const ventas = cargarVentas();
    ventas.unshift(venta);
    localStorage.setItem('registroVentas', JSON.stringify(ventas.slice(0, 500)));
    // Persistir en Firebase (no bloquea la UI)
    _fbGuardarVenta(venta);
}

function exportarVentasCSV() {
    const ventas = cargarVentas();
    if (!ventas.length) { mostrarNotificacion('No hay ventas que exportar', 'info'); return; }
    const header = 'Fecha,Producto,Cantidad,Precio,Comisión,Total,Ganancia';
    const rows = ventas.map(v =>
        `"${v.fecha}","${v.producto}",${v.cantidad},${v.precio},${v.comision || 0},${v.total},${v.ganancia || 0}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_tiendamax_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarNotificacion('✅ Historial exportado como CSV', 'success');
}

function registrarVenta(productoId, cantidad) {
    const p = productos.find(p => p.id === productoId);
    if (!p) return;
    const venta = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}),
        producto: p.nombre,
        productoId: p.id,
        cantidad: cantidad || 1,
        precio: p.precioActual,
        comision: p.comision || 0,
        comisionMoneda: p.comisionMoneda || 'USD',
        total: p.precioActual * (cantidad || 1),
        ganancia: (p.comision || 0) * (cantidad || 1)
    };
    guardarVenta(venta);
    ajustarStock(productoId, -(cantidad || 1), true); // true = viene de una venta confirmada
    renderizarVentas();
    mostrarNotificacion(`✅ Venta registrada: ${p.nombre}`);
    // Ventas ahora se sincronizan con Firebase (ver _fbGuardarVenta)
}

// Página actual del historial de ventas
let _ventasPagina = 0;
const _VENTAS_POR_PAGINA = 20;

function renderizarVentas(pagina) {
    const cont = document.getElementById('ventasContenido');
    if (!cont) return;
    let ventas = cargarVentas();
    // Si aún no hay ventas locales, dispara una lectura real de Firebase.
    // Esto evita que el admin muestre “No hay ventas” en sesiones nuevas.
    if (!ventas.length && !window.__tmVentasSyncing) {
        window.__tmVentasSyncing = true;
        _fbSincronizarVentasAlIniciar()
            .catch(() => null)
            .finally(() => { window.__tmVentasSyncing = false; });
    }
    if (typeof pagina === 'number') _ventasPagina = pagina;
    // Asegurar que la página sea válida
    const totalPaginas = Math.max(1, Math.ceil(ventas.length / _VENTAS_POR_PAGINA));
    if (_ventasPagina >= totalPaginas) _ventasPagina = totalPaginas - 1;
    if (_ventasPagina < 0) _ventasPagina = 0;

    const totalVentas   = ventas.reduce((s, v) => s + v.total, 0);
    const totalGanancia = ventas.reduce((s, v) => s + (v.ganancia || 0), 0);
    const totalUnidades = ventas.reduce((s, v) => s + (v.cantidad || 1), 0);
    // Paginación
    const totalPaginas2 = Math.max(1, Math.ceil(ventas.length / _VENTAS_POR_PAGINA));
    const ventasPagina  = ventas.slice(_ventasPagina * _VENTAS_POR_PAGINA, (_ventasPagina + 1) * _VENTAS_POR_PAGINA);

    let html = `
    <div style="margin-bottom:16px;">
        <h4 class="admin-section-title">📦 Registrar venta manual</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">

            <!-- Buscador -->
            <div class="admin-search-box">
                <input type="text" id="ventaBuscador" placeholder="🔍 Buscar producto..." oninput="filtrarProductosVenta()"
                    class="admin-search-input">
                <button onclick="limpiarBuscadorVenta()" type="button" id="ventaBuscadorClear"
                    class="admin-search-clear">✕</button>
            </div>

            <!-- Filtro por categorías (chips) -->
            <div id="ventaCategoriaChips" class="admin-chips">
                <button onclick="filtrarVentaPorCategoria('')" type="button" data-cat=""
                    class="chip-cat chip-cat-activo admin-chip active"
                    style="">
                    Todas
                </button>
                ${[...new Set(productos.map(p => p.categoria).filter(Boolean))].map(cat =>
                    `<button onclick="filtrarVentaPorCategoria('${cat.replace(/'/g,"&#39;")}')" type="button" data-cat="${cat}"
                        class="chip-cat admin-chip"
                        style="">
                        ${cat}
                    </button>`
                ).join('')}
            </div>

            <!-- Select oculto para mantener compatibilidad con registrarVentaDesdeForm -->
            <select id="ventaProductoSelect" class="admin-hidden">
                <option value="">— Selecciona producto —</option>
                ${productos.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('')}
            </select>

            <!-- Lista de productos filtrados -->
            <div id="ventaProductosLista" class="admin-product-list">
                ${productos.filter(p => p.stock > 0).map(p => `
                <div class="venta-prod-item admin-product-list-item" data-id="${p.id}" data-nombre="${escapeHtml(p.nombre.toLowerCase())}" data-cat="${escapeHtml(p.categoria||'')}"
                    onclick="seleccionarProductoVenta(${p.id})">
                    ${p.imagen ? `<img src="${p.imagen}" class="thumb" onerror="this.style.display='none'">` : '<div class="thumb-placeholder">📦</div>'}
                    <div class="info">
                        <div class="name">${escapeHtml(p.nombre)}</div>
                        <div class="meta">${escapeHtml(p.categoria||'')} · Stock: ${p.stock}${p.comision ? ` · 💰$${p.comision}` : ''}</div>
                    </div>
                    <div class="price">$${p.precioActual}</div>
                </div>`).join('')}
                ${productos.filter(p => p.stock > 0).length === 0 ? '<p class="admin-empty">Sin productos con stock</p>' : ''}
            </div>

            <!-- Tarjeta del producto seleccionado -->
            <div id="ventaProductoSeleccionado" class="admin-selected-card">
                <img id="ventaSelImg" src="" onerror="this.style.display='none'">
                <div class="info">
                    <div id="ventaSelNombre" class="name"></div>
                    <div id="ventaSelInfo" class="meta"></div>
                </div>
                <button onclick="deseleccionarProductoVenta()" type="button" style="background:none;border:none;font-size:18px;cursor:pointer;color:#aaa;flex-shrink:0;">✕</button>
            </div>

            <div class="admin-input-row">
                <input type="number" id="ventaCantidad" value="1" min="1" placeholder="Cantidad" class="admin-qty-input">
                <button onclick="registrarVentaDesdeForm()" type="button" class="btn btn-primary">✅ Registrar venta</button>
            </div>
        </div>
    </div>

    <div class="admin-dash-header">
        <h4>📋 Historial de ventas</h4>
        <div class="admin-dash-actions">
          <button onclick="exportarVentasCSV()" type="button" class="admin-btn-sm outline">📥 Exportar CSV</button>
          <button onclick="borrarHistorialVentas()" type="button" class="admin-btn-sm red">🗑️ Limpiar</button>
        </div>
    </div>`;

    if (ventas.length === 0) {
        html += '<p class="admin-empty">No hay ventas registradas aún.</p>';
    } else {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        ventasPagina.forEach(v => {
            html += `<div class="admin-history-item">
                <div class="info">
                    <div class="title">${v.producto}</div>
                    <div class="meta">${v.fecha} · ${v.cantidad} unidad(es)</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div class="total">$${v.total.toFixed(2)}</div>
                    ${v.ganancia > 0 ? `<div class="gain">Ganancia: $${v.ganancia.toFixed(2)}</div>` : ''}
                </div>
                <button onclick="eliminarVenta(${v.id})" type="button" style="background:#e74c3c;color:white;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex-shrink:0;">✕</button>
            </div>`;
        });
        html += '</div>';
    }

    // Controles de paginación
    let paginacion = '';
    if (totalPaginas2 > 1) {
        paginacion = `<div class="admin-pagination">
          <button onclick="renderizarVentas(0)" type="button" ${_ventasPagina===0?'disabled':''} >«</button>
          <button onclick="renderizarVentas(${_ventasPagina}-1)" type="button" ${_ventasPagina===0?'disabled':''} >‹</button>
          <span>Página ${_ventasPagina+1} de ${totalPaginas2} · ${ventas.length} ventas en total</span>
          <button onclick="renderizarVentas(${_ventasPagina}+1)" type="button" ${_ventasPagina>=totalPaginas2-1?'disabled':''} >›</button>
          <button onclick="renderizarVentas(${totalPaginas2}-1)" type="button" ${_ventasPagina>=totalPaginas2-1?'disabled':''} >»</button>
        </div>`;
    }
    cont.innerHTML = html + paginacion;
}

function registrarVentaDesdeForm() {
    const sel = document.getElementById('ventaProductoSelect');
    const cant = parseInt(document.getElementById('ventaCantidad')?.value) || 1;
    const id = parseInt(sel?.value);
    if (!id) { mostrarNotificacion('⚠️ Selecciona un producto primero', 'error'); return; }
    registrarVenta(id, cant);
    // Limpiar buscador y selección tras registrar
    deseleccionarProductoVenta();
    const b = document.getElementById('ventaBuscador');
    if (b) { b.value = ''; filtrarProductosVenta(); }
    const cantEl = document.getElementById('ventaCantidad');
    if (cantEl) cantEl.value = '1';
}

function eliminarVenta(id) {
    const ventas = cargarVentas().filter(v => v.id !== id);
    localStorage.setItem('registroVentas', JSON.stringify(ventas));
    renderizarVentas();
    _fbEliminarVenta(id);
}

function borrarHistorialVentas() {
    if (!confirm('¿Borrar todo el historial de ventas?')) return;
    localStorage.removeItem('registroVentas');
    renderizarVentas();
    mostrarNotificacion('🗑️ Historial borrado');
    _fbBorrarTodasVentas();
}

// ── Grupos de Facebook con selección de productos ────

// cargarGruposFB está definida más abajo (versión completa con renderizarRevolicoConfig)

function renderizarGruposFB(grupos) {
    const cont = document.getElementById('listaGruposFB');
    if (!cont) return;

    cont.innerHTML = '';

    if (grupos.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:13px;color:var(--text-muted);text-align:center;padding:10px;';
        empty.textContent = 'No hay grupos configurados aún.';
        cont.appendChild(empty);
        return;
    }

    grupos.forEach((g, i) => {
        const card = document.createElement('div');
        card.id = `grupoFB_${i}`;
        card.style.cssText = 'background:var(--card-bg,#fff);border:1.5px solid var(--border-color);border-radius:12px;padding:14px;position:relative;';

        // Botón eliminar
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.style.cssText = 'position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;font-size:18px;color:#e74c3c;';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', () => eliminarGrupoFB(i));
        card.appendChild(btnDel);

        // Campo nombre
        const labelNombre = document.createElement('label');
        labelNombre.style.cssText = 'font-size:12px;font-weight:600;display:block;margin-bottom:4px;';
        labelNombre.textContent = 'Nombre del grupo:';
        const inputNombre = document.createElement('input');
        inputNombre.type = 'text';
        inputNombre.value = g.nombre || '';
        inputNombre.placeholder = 'Ej: Tecnología Cuba, Ofertas Habana…';
        inputNombre.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);font-size:13px;box-sizing:border-box;margin-bottom:10px;';
        inputNombre.addEventListener('input', () => actualizarGrupoFB(i, 'nombre', inputNombre.value));
        const wrapNombre = document.createElement('div');
        wrapNombre.style.marginBottom = '8px';
        wrapNombre.appendChild(labelNombre);
        wrapNombre.appendChild(inputNombre);
        card.appendChild(wrapNombre);

        // Campo URL
        const labelUrl = document.createElement('label');
        labelUrl.style.cssText = 'font-size:12px;font-weight:600;display:block;margin-bottom:4px;';
        labelUrl.textContent = 'URL del Grupo:';
        const inputUrl = document.createElement('input');
        inputUrl.type = 'text';
        inputUrl.value = g.url || '';
        inputUrl.placeholder = 'https://www.facebook.com/groups/...';
        inputUrl.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);font-size:13px;box-sizing:border-box;';
        inputUrl.addEventListener('input', () => actualizarGrupoFB(i, 'url', inputUrl.value));
        const wrapUrl = document.createElement('div');
        wrapUrl.style.marginBottom = '12px';
        wrapUrl.appendChild(labelUrl);
        wrapUrl.appendChild(inputUrl);
        card.appendChild(wrapUrl);

        // Lista de productos con checkboxes
        const labelProds = document.createElement('label');
        labelProds.style.cssText = 'font-size:12px;font-weight:600;display:block;margin-bottom:6px;';
        labelProds.textContent = 'Productos a publicar en este grupo:';
        card.appendChild(labelProds);

        const listProds = document.createElement('div');
        listProds.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:12px;';

        if (productos.length === 0) {
            const noP = document.createElement('p');
            noP.style.cssText = 'font-size:12px;color:var(--text-muted);';
            noP.textContent = 'No hay productos cargados aún.';
            listProds.appendChild(noP);
        } else {
            const productosOrdenados = [...productos].sort((a, b) => {
                const aAgo = !a.stock || a.stock <= 0;
                const bAgo = !b.stock || b.stock <= 0;
                return aAgo - bAgo;
            });
            productosOrdenados.forEach(p => {
                const agotado = !p.stock || p.stock <= 0;
                const row = document.createElement('label');
                row.style.cssText = `display:flex;align-items:center;gap:8px;font-size:13px;
                    cursor:${agotado ? 'not-allowed' : 'pointer'};
                    opacity:${agotado ? '0.38' : '1'};`;
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.checked = !agotado && (g.productos || []).includes(p.id);
                chk.disabled = agotado;
                chk.style.cssText = 'width:16px;height:16px;accent-color:var(--primary);flex-shrink:0;';
                if (!agotado) chk.addEventListener('change', () => toggleProductoEnGrupo(i, p.id, chk.checked));
                const img = document.createElement('img');
                img.src = p.imagen || '';
                img.style.cssText = 'width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;';
                img.onerror = () => { img.style.display = 'none'; };
                const nombre = document.createElement('span');
                nombre.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
                nombre.textContent = p.nombre;
                const right = document.createElement('span');
                right.style.cssText = 'margin-left:auto;font-size:11px;font-weight:600;flex-shrink:0;white-space:nowrap;';
                if (agotado) {
                    right.style.color = '#e74c3c';
                    right.textContent = '🚫 Agotado';
                } else {
                    right.style.color = 'var(--primary)';
                    right.textContent = `$${p.precioActual}`;
                }
                row.appendChild(chk);
                row.appendChild(img);
                row.appendChild(nombre);
                row.appendChild(right);
                listProds.appendChild(row);
            });
        }
        card.appendChild(listProds);

        // Botón publicar en este grupo
        const btnPublicar = document.createElement('button');
        btnPublicar.type = 'button';
        btnPublicar.style.cssText = 'width:100%;padding:10px;background:#4267B2;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;';
        btnPublicar.textContent = '📢 Publicar productos en este grupo';
        btnPublicar.addEventListener('click', () => publicarEnGrupoFB(i));
        card.appendChild(btnPublicar);

        cont.appendChild(card);
    });
}

function agregarGrupoFB() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    grupos.push({ url: '', productos: productos.map(p => p.id) }); // Por defecto todos seleccionados
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    renderizarGruposFB(grupos);
}

function eliminarGrupoFB(i) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    grupos.splice(i, 1);
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    renderizarGruposFB(grupos);
}

function actualizarGrupoFB(i, campo, valor) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    if (grupos[i]) grupos[i][campo] = valor;
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
}

function toggleProductoEnGrupo(iGrupo, idProducto, checked) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    if (!grupos[iGrupo]) return;
    if (!grupos[iGrupo].productos) grupos[iGrupo].productos = [];
    if (checked) {
        if (!grupos[iGrupo].productos.includes(idProducto))
            grupos[iGrupo].productos.push(idProducto);
    } else {
        grupos[iGrupo].productos = grupos[iGrupo].productos.filter(id => id !== idProducto);
    }
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
}

async function guardarGruposFB() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const validos = grupos.filter(g => g.url && g.url.includes('facebook.com'));

    localStorage.setItem('gruposFB', JSON.stringify(validos));

    const data = { grupos: validos, exportado: new Date().toISOString() };

    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');

    if (!user || !repo || !token) {
        mostrarNotificacion(`✅ ${validos.length} grupos guardados localmente. Configura GitHub para persistirlos en la nube.`, 'info');
        return;
    }

    try {
        mostrarNotificacion('☁️ Guardando grupos en GitHub…', 'info');
        await subirArchivoAGitHub(user, repo, token, 'grupos_facebook_config.json', data);
        mostrarNotificacion(`✅ ${validos.length} grupos guardados en GitHub — persistirán aunque borres el navegador.`, 'success');
    } catch(e) {
        mostrarNotificacion('⚠️ Grupos guardados localmente. Error al subir a GitHub: ' + e.message, 'warning');
    }
}


// switchTab hooks are now inside the switchTab function directly


// ═══════════════════════════════════════════════════════
//  CONFIG PERSISTENTE — Grupos FB + Revolico por categoría
// ═══════════════════════════════════════════════════════

// Categorías disponibles en Revolico
const REVOLICO_CATS = [
    "Computación > Accesorios",
    "Computación > Computadoras",
    "Computación > Impresoras y Tintas",
    "Computación > Redes y Conectividad",
    "Computación > Software",
    "Electrónica > Audio y Video",
    "Electrónica > Celulares y Tablets",
    "Electrónica > Electrónica en General",
    "Electrónica > Fotografía",
    "Electrónica > Juegos y Consolas",
    "Electrónica > TV y Monitores",
    "Hogar y Jardín > Electrodomésticos",
    "Hogar y Jardín > Energía Solar",
    "Hogar y Jardín > Herramientas",
    "Hogar y Jardín > Muebles",
    "Vehículos > Accesorios",
    "Otros > General",
];

// ── Revolico Config ──────────────────────────────────

function renderizarRevolicoConfig() {
    const cont = document.getElementById('listaRevolicoConfig');
    if (!cont) return;

    cont.innerHTML = '';
    const config = JSON.parse(localStorage.getItem('revolicoConfig') || '{}');

    if (productos.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:13px;color:var(--text-muted);text-align:center;padding:10px;';
        empty.textContent = 'No hay productos cargados aún.';
        cont.appendChild(empty);
        return;
    }

    const ordenados = [...productos].sort((a, b) => {
        const aAgo = !a.stock || a.stock <= 0;
        const bAgo = !b.stock || b.stock <= 0;
        return aAgo - bAgo;
    });

    ordenados.forEach(p => {
        const agotado = !p.stock || p.stock <= 0;
        const catActual = config[p.id] || '';

        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;
            background:var(--card-bg,#fff);border-radius:10px;border:1px solid var(--border-color);
            flex-wrap:wrap;opacity:${agotado ? '0.38' : '1'};`;

        const img = document.createElement('img');
        img.src = p.imagen || '';
        img.style.cssText = 'width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;';
        img.onerror = () => { img.style.display = 'none'; };

        const nombre = document.createElement('span');
        nombre.style.cssText = 'flex:1;font-size:13px;font-weight:600;min-width:120px;';
        nombre.textContent = p.nombre;

        if (agotado) {
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:11px;color:#e74c3c;font-weight:700;flex:2;min-width:180px;';
            badge.textContent = '🚫 Agotado — no se publicará';
            row.appendChild(img);
            row.appendChild(nombre);
            row.appendChild(badge);
        } else {
            const sel = document.createElement('select');
            sel.style.cssText = 'flex:2;min-width:180px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--border-color);font-size:12px;background:var(--card-bg,#fff);color:var(--text-primary,#333);';
            const optDefault = document.createElement('option');
            optDefault.value = '';
            optDefault.textContent = '— No publicar en Revolico —';
            sel.appendChild(optDefault);
            REVOLICO_CATS.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                if (c === catActual) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', () => actualizarRevolicoCat(p.id, sel.value));
            row.appendChild(img);
            row.appendChild(nombre);
            row.appendChild(sel);
        }

        cont.appendChild(row);
    });
}

function actualizarRevolicoCat(idProducto, categoria) {
    const config = JSON.parse(localStorage.getItem('revolicoConfig') || '{}');
    if (categoria) {
        config[idProducto] = categoria;
    } else {
        delete config[idProducto];
    }
    localStorage.setItem('revolicoConfig', JSON.stringify(config));
}

function guardarRevolicoConfig() {
    const config = JSON.parse(localStorage.getItem('revolicoConfig') || '{}');
    const asignados = Object.keys(config).length;
    mostrarNotificacion(`✅ Config Revolico guardada (${asignados} productos asignados). Haz clic en ACTUALIZAR TIENDA para subir a GitHub.`);
}

// ── Grupos FB persistentes (carga al abrir pestaña) ──

function cargarGruposFB() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    renderizarGruposFB(grupos);
    renderizarRevolicoConfig();
}

// ── Patch guardarGruposFB para también actualizar localStorage limpio ──
const _origGuardarGrupos = guardarGruposFB;
guardarGruposFB = function() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const validos = grupos.filter(g => g.url && g.url.includes('facebook.com'));
    mostrarNotificacion(`✅ ${validos.length} grupos guardados. Haz clic en ACTUALIZAR TIENDA para que sean permanentes.`);
    // FIX BUG #4: llamar al original para que descargue el JSON
    if (typeof _origGuardarGrupos === 'function') {
        try { _origGuardarGrupos(); } catch(e) { console.warn('Error en _origGuardarGrupos:', e); }
    }
};



// ═══════════════════════════════════════════════════════
//  OFERTA DEL DÍA
// ═══════════════════════════════════════════════════════
function poblarSelectOfertaDia() {
    // Si los productos todavía no cargaron, reintentar cada segundo hasta que estén
    if (!productos || !productos.length) {
        setTimeout(poblarSelectOfertaDia, 1000);
        return;
    }
    ['ofertaDiaSelect2'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— Sin oferta del día activa —</option>';
        productos.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nombre + ' — $' + (parseFloat(p.precioActual) || 0).toFixed(2);
            sel.appendChild(opt);
        });
        const saved = localStorage.getItem('ofertaDiaId');
        if (saved) sel.value = saved;
        else if (current) sel.value = current;
    });
    actualizarStatusOfertaDia();
}

function actualizarStatusOfertaDia() {
    const savedId = localStorage.getItem('ofertaDiaId');
    const texto = localStorage.getItem('ofertaDiaTexto') || '🔥 OFERTA DEL DÍA';
    ['ofertaDiaStatus2'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (savedId) {
            const p = productos.find(x => String(x.id) === String(savedId));
            el.innerHTML = p ? '✅ Activa: <strong>' + escapeHtml(p.nombre) + '</strong> — Badge: "' + escapeHtml(texto) + '"' : '⚠️ Producto no encontrado';
        } else {
            el.textContent = 'Sin oferta activa.';
        }
    });
}


function guardarOfertaDia2() {
    const sel = document.getElementById('ofertaDiaSelect2');
    const textoEl = document.getElementById('ofertaDiaTexto2');
    _guardarOfertaDiaDesde(sel, textoEl);
}
var guardarOfertaDia = guardarOfertaDia2;
function _guardarOfertaDiaDesde(sel, textoEl) {
    if (!sel || !sel.value) { mostrarNotificacion('⚠️ Selecciona un producto', 'error'); return; }
    const texto = textoEl ? (textoEl.value.trim() || '🔥 OFERTA DEL DÍA') : '🔥 OFERTA DEL DÍA';
    const _ofId  = sel.value;
    const _ofTxt = texto;
    localStorage.setItem('ofertaDiaId', _ofId);
    localStorage.setItem('ofertaDiaTexto', _ofTxt);
    verificarOfertasYMostrarBanner();
    actualizarStatusOfertaDia();
    renderizarProductos();
    renderizarMasVendidos();
    mostrarNotificacion('🏷️ Oferta del Día activada');
    // Subir a GitHub para que TODOS los clientes la vean
    (async () => {
        const _u = localStorage.getItem('githubUser');
        const _r = localStorage.getItem('githubRepo');
        const _t = localStorage.getItem('githubToken');
        if (!_u || !_r || !_t) {
            mostrarNotificacion('⚠️ Configura GitHub en Config para que la vean todos', 'error');
            return;
        }
        try {
            const existing = await _leerConfigActual();
            existing.ofertaDiaId = _ofId;
            existing.ofertaDiaTexto = _ofTxt;
            existing.ofertaDiaActualizado = new Date().toISOString();
            await subirArchivoAGitHub(_u, _r, _t, 'config.json', existing);
            mostrarNotificacion('☁️ Oferta subida a GitHub — todos la verán', 'success');
        } catch(e) {
            mostrarNotificacion('⚠️ Error al sincronizar con GitHub: ' + e.message, 'error');
        }
    })();
}
function desactivarOfertaDia() {
    localStorage.removeItem('ofertaDiaId');
    localStorage.removeItem('ofertaDiaTexto');
    verificarOfertasYMostrarBanner();
    poblarSelectOfertaDia();
    renderizarProductos();
    renderizarMasVendidos();
    mostrarNotificacion('❌ Oferta del Día desactivada');
    // Borrar en GitHub
    (async () => {
        const _u = localStorage.getItem('githubUser');
        const _r = localStorage.getItem('githubRepo');
        const _t = localStorage.getItem('githubToken');
        if (!_u || !_r || !_t) {
            mostrarNotificacion('⚠️ Configura GitHub en Config para sincronizar', 'error');
            return;
        }
        try {
            const existing = await _leerConfigActual();
            delete existing.ofertaDiaId;
            delete existing.ofertaDiaTexto;
            existing.ofertaDiaActualizado = new Date().toISOString();
            await subirArchivoAGitHub(_u, _r, _t, 'config.json', existing);
            mostrarNotificacion('☁️ Oferta eliminada en GitHub — ya nadie la verá', 'success');
        } catch(e) {
            mostrarNotificacion('⚠️ Error al sincronizar con GitHub: ' + e.message, 'error');
        }
    })();
}

// Lee el config.json ACTUAL del sitio en vivo (sin adivinar rama main/master).
// Lanza error si no se puede leer, para NUNCA subir un config vacío que borre
// la tasa o la config de Firebase.
async function _leerConfigActual() {
    const res = await fetch('config.json?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo leer config.json actual (HTTP ' + res.status + ')');
    const cfg = await res.json();
    if (!cfg || typeof cfg !== 'object') throw new Error('config.json inválido');
    return cfg;
}
function getOfertaDiaId() {
    return localStorage.getItem('ofertaDiaId') || null;
}
function getOfertaDiaTexto() {
    return localStorage.getItem('ofertaDiaTexto') || '🔥 OFERTA DEL DÍA';
}

// Renderizar lista de productos agotados en el panel
function renderizarListaAgotados() {
    const el = document.getElementById('productosAgotadosList');
    if (!el) return;
    const agotados = productos.filter(p => p.stock === 0);
    if (agotados.length === 0) {
        el.innerHTML = '<p style="font-size:13px;color:#27ae60;text-align:center;">✅ No hay productos agotados actualmente.</p>';
        return;
    }
    // FIX BUG #8: sanitización anti-XSS
    el.innerHTML = agotados.map(p =>
        '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--card-bg,#fff);border-radius:10px;border:1px solid rgba(231,76,60,0.3);">' +
            '<img src="' + escapeAttr(p.imagen) + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" onerror="this.style.display=\'none\'">' +
            '<div style="flex:1;"><div style="font-size:13px;font-weight:700;">' + escapeHtml(p.nombre) + '</div>' +
            '<div style="font-size:11px;color:#e74c3c;font-weight:700;">📦 AGOTADO</div></div>' +
            '<button class="btn btn-primary" onclick="abrirEditModal(' + safeNum(p.id) + ')" style="font-size:11px;padding:6px 10px;">✏️ Editar</button>' +
        '</div>'
    ).join('');
}

// ── Patch renderizarProductos to show agotado/oferta badges ──
if (typeof renderizarProductos === 'function') {
const _origRenderProductosFinal = renderizarProductos;
renderizarProductos = function() {
    const productosGrid = document.getElementById('productosGrid');
    if (!productosGrid) { _origRenderProductosFinal(); return; }

    // Log de diagnóstico (solo en consola, no panel visual)
    

    // RESILIENCIA: si productos está vacío, intentar cargar de localStorage
    if (!Array.isArray(productos) || productos.length === 0) {
        try {
            const cached = JSON.parse(localStorage.getItem('productos') || '[]');
            if (Array.isArray(cached) && cached.length > 0) {
                productos = cached;
                
            }
        } catch(e) {}
    }

    let productosFiltrados = categoriaSeleccionada === 'Todas'
        ? productos
        : productos.filter(p => p.categoria === categoriaSeleccionada);

    

    if (categoriaSeleccionada !== 'Todas' && subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
        productosFiltrados = productosFiltrados.filter(p => p.subcategoria === subcategoriaSeleccionada);
        
    }
    if (_heroSearchActivo || _heroPrecioMin > 0 || _heroPrecioMax < Infinity) {
        const q = _heroSearchActivo;
        productosFiltrados = productosFiltrados.filter(p => {
            const matchQ = !q || p.nombre.toLowerCase().includes(q) ||
                (p.descripcion||'').toLowerCase().includes(q) ||
                (p.categoria||'').toLowerCase().includes(q);
            return matchQ;
        });
        
    }
    

    // Ordenar: oferta del día primero
    const ofertaId = getOfertaDiaId();
    if (ofertaId) {
        productosFiltrados = productosFiltrados.sort((a, b) => {
            if (String(a.id) === String(ofertaId)) return -1;
            if (String(b.id) === String(ofertaId)) return 1;
            return 0;
        });
    }

    // Siempre: agotados al final (después de cualquier otro sort)
    productosFiltrados = productosFiltrados.sort((a, b) => {
        const aAgotado = a.stock === 0 ? 1 : 0;
        const bAgotado = b.stock === 0 ? 1 : 0;
        return aAgotado - bAgotado;
    });

    productosGrid.innerHTML = '';
    if (productosFiltrados.length === 0) {
        // Mensaje contextual según la situación real
        let mensaje;
        if (!Array.isArray(productos) || productos.length === 0) {
            mensaje = '⏳ Cargando productos... Si esto persiste, recarga la página.';
        } else if (subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
            mensaje = 'No hay productos en esta subcategoría aún.';
        } else if (_heroSearchActivo) {
            mensaje = 'No hay productos que coincidan con tu búsqueda.';
        } else {
            mensaje = 'No hay productos en esta categoría aún.';
        }
        productosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 60px 20px; font-size:15px;">' + escapeHtml(mensaje) + '</p>';
        return;
    }

    productosFiltrados.forEach(producto => {
        const esAgotado = producto.stock === 0;
        const esOfertaDia = String(producto.id) === String(ofertaId);
        const card = document.createElement('div');
        card.className = 'producto-card' + (esAgotado ? ' card-agotado' : '');
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.dataset.productId = String(producto.id);
        card.style.position = 'relative';
        // Sanitización defensiva (escapeHtml/escapeAttr definidos al inicio del script)
        const _id  = safeNum(producto.id);
        const _nom = escapeHtml(producto.nombre);
        const _des = escapeHtml(producto.descripcion);
        const _img = escapeAttr(producto.imagen);
        const _stk = safeNum(producto.stock);
        const _txt = escapeHtml(getOfertaDiaTexto());
        // Para el onclick del botón Pedir: necesitamos un string seguro para JS
        const _nomJS = (producto.nombre || '').replace(/[\\'"<>]/g, '');
        card.innerHTML =
            (esOfertaDia ? '<div class="badge-oferta-dia">' + _txt + '</div>' :
             esAgotado ? '<div class="badge-agotado">AGOTADO</div>' :
             producto.masVendido ? '<div class="badge-vendido">🔥 Más Vendido</div>' : '') +
            '<div class="producto-image">' +
                getMeGustaHTML(_id) +
                '<img src="' + _img + '" alt="' + _nom + '" loading="lazy" onerror="this.src=\'/iconos/favicon-192.png\';this.style.opacity=\'0.3\'">' +
                (producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual ? '<div class="badge">-$' + (producto.precioOriginal - producto.precioActual).toFixed(0) + '</div>' : '') +
            '</div>' +
            '<h3>' + _nom + '</h3>' +
            '<p class="producto-description">' + _des + '</p>' +
            '<p class="precio">' +
                (producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual ? '<span class="precio-tachado">$' + parseFloat(producto.precioOriginal).toFixed(2) + ' USD</span> ' : '') +
                '<span class="precio-actual" data-usd="' + safeNum(producto.precioActual) + '">$' + Number(producto.precioActual).toFixed(2) + ' USD</span>' +
                (producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual ? ' <span class="precio-ahorro">-$' + (parseFloat(producto.precioOriginal) - parseFloat(producto.precioActual)).toFixed(0) + '</span>' : '') +
            '</p>' +
            (esAgotado
                ? '<div class="stock" style="color:#e74c3c;font-weight:700;">❌ Agotado</div><button class="btn btn-small" disabled style="background:#555;color:#aaa;cursor:not-allowed;box-shadow:none;">🚫 No disponible</button>'
                : (_stk <= 3 && _stk > 0 ? '<div class="stock stock-urgente">⚠️ ¡Solo quedan ' + _stk + '!</div>' : '<div class="stock">📦 Stock: ' + _stk + ' unidades</div>') +
                  (typeof renderCountdownHtml === 'function' ? renderCountdownHtml(_id) : '') +
                  '<button class="btn-pedir-card" data-nombre="' + _nom + '" onclick="event.stopPropagation(); tmComprar(event, ' + _id + ', this.dataset.nombre)" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>');
        productosGrid.appendChild(card);
    });
};
} // end typeof renderizarProductos guard


/* ============================================================
   TIENDAMAX — PREMIUM UPGRADE PACK JS
   Cursor · Progress bar · Toast glass · Placeholder animado
   Separadores · Footer premium
   ============================================================ */

// ===== CURSOR DORADO ELIMINADO =====
// El cursor custom dorado fue eliminado: ocultaba el cursor del sistema
// cuando algo fallaba y no se veía bien en todos los modos. Ahora se usa
// el cursor nativo del navegador, que siempre funciona.
(function removeOldCursor() {
    // Limpiar el elemento si quedó de una versión anterior cacheada
    const old = document.getElementById('tm-cursor');
    if (old) old.remove();
})();

// ===== BARRA DE PROGRESO DORADA =====
(function initProgress() {
    const bar = document.createElement('div');
    bar.id = 'tm-progress';
    document.body.appendChild(bar);

    function update() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
        bar.style.width = pct + '%';
        bar.style.opacity = pct > 1 ? '1' : '0';
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
})();

// ===== TOAST GLASSMORPHISM — reemplaza mostrarNotificacion =====
(function overrideToast() {
    let toastEl = null;
    let hideTimer = null;

    function getToast() {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'tm-toast';
            document.body.appendChild(toastEl);
        }
        return toastEl;
    }

    window.mostrarNotificacion = function(mensaje, tipo = 'success') {
        const t = getToast();
        clearTimeout(hideTimer);

        // Ícono
        const icon = tipo === 'error' ? '✕' : tipo === 'info' ? 'i' : '✓';
        t.className = 'tm-toast' + (tipo === 'error' ? ' error' : '');
        t.innerHTML = `<span class="tm-toast-icon">${icon}</span><span>${mensaje}</span>`;

        // Forzar reflow para reiniciar animación
        t.classList.remove('show', 'hide');
        t.getBoundingClientRect();
        t.classList.add('show');

        hideTimer = setTimeout(() => {
            t.classList.add('hide');
            setTimeout(() => { if (t) t.classList.remove('show', 'hide'); }, 350);
        }, 3500);
    };
})();

// ===== PLACEHOLDER ANIMADO EN BÚSQUEDA =====
(function initPlaceholder() {
    const frases = [
        'Buscar productos...',
        'WiFi, inversores...',
        'Celulares, cargadores...',
        'Tecnología premium...',
        'Energía solar...'
    ];
    let idx = 0;

    function rotar() {
        const input = document.getElementById('heroSearchInput');
        if (!input || document.activeElement === input || input.value) return;
        idx = (idx + 1) % frases.length;
        // Fade out → cambiar → fade in via style
        input.style.transition = 'opacity 0.4s';
        input.style.opacity = '0';
        setTimeout(() => {
            input.placeholder = frases[idx];
            input.style.opacity = '1';
        }, 400);
    }

    // Esperar a que el DOM esté listo
    function startRotation() {
        const input = document.getElementById('heroSearchInput');
        if (!input) { setTimeout(startRotation, 500); return; }
        setInterval(rotar, 3200);
    }
    setTimeout(startRotation, 2000);
})();




/* ════════════════════════════════════════════════════
   PREMIUM UPGRADE PACK 2 — JS
   Fly-to-cart · Skeleton loading · Analytics counter
═════════════════════════════════════════════════════ */

// ── 1. FLY-TO-CART: partícula que vuela al ícono del carrito ──
function flyToCart(originEl) {
    const cartBtn = document.querySelector('.cart-icon-btn');
    if (!cartBtn || !originEl) return;

    const from = originEl.getBoundingClientRect();
    const to   = cartBtn.getBoundingClientRect();

    const particle = document.createElement('div');
    particle.className = 'fly-particle';
    particle.style.cssText = `
        left: ${from.left + from.width / 2 - 7}px;
        top:  ${from.top  + from.height/ 2 - 7}px;
        opacity: 1;
    `;
    document.body.appendChild(particle);

    // Calcular delta
    const dx = (to.left + to.width / 2 - 7)  - (from.left + from.width  / 2 - 7);
    const dy = (to.top  + to.height/ 2 - 7)  - (from.top  + from.height / 2 - 7);

    // Arc animation usando requestAnimationFrame
    const duration = 650;
    const start = performance.now();

    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        // Ease in-out cubic
        const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
        // Arc: parábola en Y
        const arc = -Math.sin(Math.PI * t) * 90;

        particle.style.transform = `translate(${dx * e}px, ${dy * e + arc}px) scale(${1 - t * 0.4})`;
        particle.style.opacity   = t > 0.7 ? (1 - (t - 0.7) / 0.3) : '1';

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            particle.remove();
            // Bounce del carrito
            cartBtn.classList.remove('bounce');
            cartBtn.getBoundingClientRect(); // reflow
            cartBtn.classList.add('bounce');
            setTimeout(() => cartBtn.classList.remove('bounce'), 560);
        }
    }
    requestAnimationFrame(step);
}

// ── PEDIR POR WHATSAPP: abre WhatsApp directo (NO agrega al carrito) ──
// FIX: Separar "Pedir" (WhatsApp) de "Agregar al carrito".
// El botón "Pedir" solo envía el mensaje a WhatsApp y registra analytics.
// Para agregar al carrito existe el botón "🛒 Añadir" en la tarjeta
// y "🛒 Agregar al carrito" en el modal de detalle.
function tmComprar(event, id, nombre) {
    const btn = (event && (event.currentTarget || event.target)) || null;
    if (btn) requestAnimationFrame(() => flyToCart(btn));
    // 📊 Analytics: registrar click de WhatsApp
    if (typeof tmTrackWhatsApp === 'function') tmTrackWhatsApp(id);
    if (typeof tmRegistrarInteresWhatsApp === 'function') tmRegistrarInteresWhatsApp(id, 'tarjeta');
    // Buscar producto para tener el precio en el mensaje
    const _prod = productos.find(p => p.id === id || p.id === Number(id));
    const item = _prod
        ? { id: _prod.id, nombre: _prod.nombre, precio: parseFloat(_prod.precioActual) || 0, cantidad: 1 }
        : { id: id, nombre: nombre || 'Producto', precio: 0, cantidad: 1 };
    const msg = _mensajeOrdenWA([item]);
    window.open(`https://wa.me/${getNumeroWhatsApp()}?text=${msg}`, '_blank', 'noopener,noreferrer');
}
// Patch agregarAlCarrito para fly desde modal
if (typeof agregarAlCarrito === 'function') {
    const _origAgregarAlCarrito = agregarAlCarrito;
    agregarAlCarrito = function(id, _unused, originEl) {
        _origAgregarAlCarrito(id);
        if (originEl) requestAnimationFrame(() => flyToCart(originEl));
    };
}

// ── 2. SKELETON LOADING en grids de productos ──
function mostrarSkeletons(containerId, cantidad = 6) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const skeletonHTML = Array(cantidad).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line price"></div>
            <div style="margin:12px 16px 16px;height:36px;border-radius:10px;background:linear-gradient(90deg,#f0ebe4 25%,#e8e2da 50%,#f0ebe4 75%);background-size:200% auto;animation:skeletonPulse 1.5s ease-in-out infinite;"></div>
        </div>
    `).join('');

    container.innerHTML = skeletonHTML;
}

// ── 3. ANALYTICS COUNTER ANIMADO ──
function animarContador(el, target, duration = 1200, prefix = '', suffix = '') {
    const isFloat = String(target).includes('.');
    const decimals = isFloat ? 2 : 0;
    const numTarget = parseFloat(target) || 0;
    const start = performance.now();

    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        // Ease out expo
        const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        const current = numTarget * e;
        el.textContent = prefix + current.toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = prefix + numTarget.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
}

// Patch stat() para usar contadores animados
if (typeof stat === 'function') {
const _origStat = stat;
stat = function(icon, label, value, color) {
    const isNumeric = typeof value === 'number' || (typeof value === 'string' && value.startsWith('$'));
    const id = 'tm-stat-' + Math.random().toString(36).slice(2,7);
    const display = typeof value === 'number' ? value : value;

    const html = '<div style="background:var(--bg-secondary,#f9f6f1);border-radius:12px;padding:14px;text-align:center;">' +
        '<div style="font-size:22px;">' + icon + '</div>' +
        '<div id="' + id + '" class="tm-counter" style="font-size:' + (typeof value === 'number' ? '22px' : '18px') + ';font-weight:800;color:' + (color || 'var(--primary-color,#c9a96e)') + ';">' + value + '</div>' +
        '<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
        '</div>';

    // Animar después del render
    if (isNumeric) {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof value === 'number') {
                animarContador(el, value, 900 + Math.random() * 400);
            } else if (typeof value === 'string' && value.startsWith('$')) {
                const num = parseFloat(value.replace('$',''));
                animarContador(el, num, 1000, '$');
            }
        }, 80);
    }

    return html;
};
} // end typeof stat guard


// ── Buscador y filtro de categorías en Ventas ────────────────────
let _ventaCatActiva = '';

function filtrarProductosVenta() {
    const q = (document.getElementById('ventaBuscador')?.value || '').toLowerCase().trim();
    const clearBtn = document.getElementById('ventaBuscadorClear');
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

    const items = document.querySelectorAll('.venta-prod-item');
    items.forEach(item => {
        const nombre = item.dataset.nombre || '';
        const cat    = item.dataset.cat    || '';
        const coincideBusqueda = !q || nombre.includes(q);
        const coincideCat      = !_ventaCatActiva || cat === _ventaCatActiva;
        item.style.display = (coincideBusqueda && coincideCat) ? '' : 'none';
    });
}

function filtrarVentaPorCategoria(cat) {
    _ventaCatActiva = cat;
    document.querySelectorAll('.chip-cat').forEach(btn => {
        const activo = btn.dataset.cat === cat;
        btn.style.background  = activo ? '#3498db' : 'white';
        btn.style.color       = activo ? 'white'   : '#555';
        btn.style.borderColor = activo ? '#3498db' : '#ddd';
    });
    filtrarProductosVenta();
}

function seleccionarProductoVenta(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;

    const sel = document.getElementById('ventaProductoSelect');
    if (sel) sel.value = id;

    document.querySelectorAll('.venta-prod-item').forEach(item => {
        const activo = parseInt(item.dataset.id) === id;
        item.style.borderColor = activo ? '#27ae60' : 'transparent';
        item.style.background  = activo ? 'rgba(39,174,96,0.08)' : 'white';
    });

    const card = document.getElementById('ventaProductoSeleccionado');
    if (card) {
        card.style.display = 'flex';
        const img = document.getElementById('ventaSelImg');
        if (img) { img.src = p.imagen || ''; img.style.display = p.imagen ? '' : 'none'; }
        const nom = document.getElementById('ventaSelNombre');
        if (nom) nom.textContent = p.nombre;
        const inf = document.getElementById('ventaSelInfo');
        if (inf) inf.innerHTML = `$${p.precioActual} · Stock: ${p.stock}${p.comision ? ` · 💰 Comisión: $${p.comision}` : ''}`;
    }

    const cantEl = document.getElementById('ventaCantidad');
    if (cantEl) { cantEl.focus(); cantEl.select(); }
}

function deseleccionarProductoVenta() {
    const sel = document.getElementById('ventaProductoSelect');
    if (sel) sel.value = '';
    document.querySelectorAll('.venta-prod-item').forEach(item => {
        item.style.borderColor = 'transparent';
        item.style.background  = 'white';
    });
    const card = document.getElementById('ventaProductoSeleccionado');
    if (card) card.style.display = 'none';
}

function limpiarBuscadorVenta() {
    const b = document.getElementById('ventaBuscador');
    if (b) { b.value = ''; b.focus(); }
    filtrarProductosVenta();
}

// ══════════════════════════════════════════════════════════════════
//  TIENDAMAX — PREMIUM PACK v2
//  1. Vistas por producto (público + panel admin)
//  2. Dashboard de ventas con gráfica
//  3. Badges "Últimas X unidades" en tarjetas de cliente
//  4. Alerta de stock bajo en tab Gestionar
//  5. Animaciones fade-in al scroll
//  6. Quick View (vista rápida sin abrir detalle)
//  7. Exportar ventas a CSV
// ══════════════════════════════════════════════════════════════════

// ── 1. VISTAS POR PRODUCTO ─────────────────────────────────────────
function _cargarVistas() {
    return JSON.parse(localStorage.getItem('vistasProd') || '{}');
}
function _guardarVistas(v) {
    localStorage.setItem('vistasProd', JSON.stringify(v));
}
function registrarVistaProd(id) {
    const v = _cargarVistas();
    v[id] = (v[id] || 0) + 1;
    _guardarVistas(v);
    return v[id];
}
function obtenerVistasProd(id) {
    return _cargarVistas()[id] || 0;
}
function obtenerTopProductosPorVistas(n = 5) {
    const v = _cargarVistas();
    return Object.entries(v)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id, vistas]) => ({
            producto: productos.find(p => String(p.id) === String(id)),
            vistas
        }))
        .filter(x => x.producto);
}

// Parchar abrirDetalleProducto para registrar vista y mostrarla
if (typeof abrirDetalleProducto === 'function') {
const _origAbrirDetalle = abrirDetalleProducto;
abrirDetalleProducto = function(id) {
    _origAbrirDetalle(id);
    // Mostrar contador local mientras carga Firebase
    const localTotal = registrarVistaProd(id);
    let vistaEl = document.getElementById('detailVistasBadge');
    if (!vistaEl) {
        vistaEl = document.createElement('span');
        vistaEl.id = 'detailVistasBadge';
        vistaEl.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#888;margin-left:10px;';
        const catEl = document.getElementById('detailProductCategory');
        if (catEl && catEl.parentNode) catEl.parentNode.appendChild(vistaEl);
    }
    vistaEl.innerHTML = `👁️ ${localTotal.toLocaleString()} vista${localTotal !== 1 ? 's' : ''}`;
    // Leer el conteo real desde Firebase y actualizar
    (async () => {
        try {
            const base = _fbRtdbUrl();
            if (!base) return;
            const res = await fetch(`${base}/analytics/vistas/${String(id)}/count.json`);
            if (!res.ok) return;
            const fbCount = await res.json();
            if (typeof fbCount !== 'number' || fbCount <= 0) return;
            const el = document.getElementById('detailVistasBadge');
            if (el) el.innerHTML = `👁️ ${fbCount.toLocaleString()} vista${fbCount !== 1 ? 's' : ''}`;
        } catch(e) {}
    })();
};
} // end typeof abrirDetalleProducto guard

// ── 2. DASHBOARD DE VENTAS CON GRÁFICA ────────────────────────────
function renderizarDashboardVentas(contenedor) {
    const ventas = cargarVentas();
    const prods = Array.isArray(productos) ? productos : [];

    const totalVentas   = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalGanancia = ventas.reduce((s, v) => s + Number(v.ganancia || 0), 0);
    const totalUnidades = ventas.reduce((s, v) => s + Number(v.cantidad || 1), 0);
    const ticketProm    = ventas.length ? totalVentas / ventas.length : 0;
    const margenPct     = totalVentas > 0 ? (totalGanancia / totalVentas) * 100 : 0;

    const ahora = Date.now();
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const ventasHoy = ventas.filter(v => Number(v.id || 0) >= inicioHoy.getTime());
    const ventas7d  = ventas.filter(v => Number(v.id || 0) >= ahora - 7 * 24 * 60 * 60 * 1000);
    const totalHoy  = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
    const total7d   = ventas7d.reduce((s, v) => s + Number(v.total || 0), 0);

    const stockBajo = prods.filter(p => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= 3)
        .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
    const agotados = prods.filter(p => Number(p.stock || 0) === 0);
    const inventarioUSD = prods.reduce((s, p) => s + (Number(p.precioActual || 0) * Number(p.stock || 0)), 0);
    const productosConStock = prods.filter(p => Number(p.stock || 0) > 0).length;

    // Gráfica ÚNICA: últimos 14 días. Incluye venta, ganancia y unidades en el tooltip.
    const dias = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const hasta = new Date(d); hasta.setDate(hasta.getDate() + 1);
        dias.push({
            label: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
            desde: d.getTime(),
            hasta: hasta.getTime(),
            total: 0,
            ganancia: 0,
            unidades: 0,
            ventas: 0
        });
    }
    ventas.forEach(v => {
        const ts = Number(v.id || 0);
        const target = dias.find(d => ts >= d.desde && ts < d.hasta);
        if (!target) return;
        target.total    += Number(v.total || 0);
        target.ganancia += Number(v.ganancia || 0);
        target.unidades += Number(v.cantidad || 1);
        target.ventas   += 1;
    });
    const maxTotal = Math.max(...dias.map(d => d.total), 1);

    const topProd = {};
    ventas.forEach(v => {
        const key = String(v.productoId || v.producto || '');
        if (!topProd[key]) {
            const prod = prods.find(p => String(p.id) === String(v.productoId));
            topProd[key] = {
                nombre: v.producto || (prod ? prod.nombre : 'Producto'),
                producto: prod,
                unidades: 0,
                total: 0,
                ganancia: 0
            };
        }
        topProd[key].unidades += Number(v.cantidad || 1);
        topProd[key].total    += Number(v.total || 0);
        topProd[key].ganancia += Number(v.ganancia || 0);
    });
    const topList = Object.values(topProd)
        .sort((a, b) => b.total - a.total || b.unidades - a.unidades)
        .slice(0, 5);

    const topVistas = obtenerTopProductosPorVistas(5);
    const ventasRecientes = ventas.slice(0, 5);
    const reponer = [...stockBajo, ...agotados].slice(0, 5);

    const kpiCard = (cls, value, label, sub) =>
        '<div class="admin-stat-card ' + cls + '">' +
            '<div class="admin-stat-value">' + value + '</div>' +
            '<div class="admin-stat-label">' + label + '</div>' +
            (sub ? '<div class="admin-stat-sub">' + sub + '</div>' : '') +
        '</div>';

    const imgTag = (p) => p && p.imagen
        ? '<img src="' + escapeAttr(p.imagen) + '" class="admin-top-thumb" onerror="this.style.display=\'none\'">'
        : '';

    const empty = '<div class="admin-empty-mini">Sin datos todavía</div>';

    const miniSection = (title, html) =>
        '<div class="admin-mini-section"><div class="admin-chart-title">' + title + '</div>' + (html || empty) + '</div>';

    const masVendidosHtml = topList.length ? topList.map((d, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
        return `
        <div class="admin-top-item">
            <span class="admin-top-rank" style="font-size:${i<3?'14px':'11px'}">${medal}</span>
            ${imgTag(d.producto)}
            <span class="admin-top-name">${escapeHtml(d.nombre)}</span>
            <span class="admin-top-meta">${d.unidades} uds</span>
            <span class="admin-top-value gold">$${d.total.toFixed(0)}</span>
        </div>`;}).join('') : '';

    const reponerHtml = reponer.length ? reponer.map((p, i) => `
        <div class="admin-top-item">
            <span class="admin-top-rank">${i + 1}</span>
            ${imgTag(p)}
            <span class="admin-top-name">${escapeHtml(p.nombre)}</span>
            <span class="admin-top-value ${Number(p.stock || 0) === 0 ? 'red' : 'gold'}">${Number(p.stock || 0) === 0 ? 'Agotado' : (p.stock + ' uds')}</span>
        </div>`).join('') : '';

    const vistosHtml = topVistas.length ? topVistas.map(({ producto: p, vistas }, i) => `
        <div class="admin-top-item">
            <span class="admin-top-rank">${i + 1}</span>
            ${imgTag(p)}
            <span class="admin-top-name">${escapeHtml(p.nombre)}</span>
            <span class="admin-top-value blue">👁️ ${vistas.toLocaleString()}</span>
        </div>`).join('') : '';

    const recientesHtml = ventasRecientes.length ? ventasRecientes.map(v => `
        <div class="admin-top-item">
            <span class="admin-top-name">${escapeHtml(v.producto || 'Producto')}</span>
            <span class="admin-top-meta">${safeNum(v.cantidad, 1)} uds</span>
            <span class="admin-top-value gold">$${Number(v.total || 0).toFixed(0)}</span>
        </div>`).join('') : '';

    return `
    <div class="tm-dashboard-ventas-inner">
        <div class="admin-dash-header">
            <h4>📊 Dashboard de ventas</h4>
            <div class="admin-dash-actions">
                <button onclick="exportarVentasCSV()" type="button" class="admin-btn-sm outline">⬇️ Exportar CSV</button>
            </div>
        </div>

        <div class="admin-stats-grid admin-stats-grid-compact">
            ${kpiCard('green', '$' + totalVentas.toFixed(0), 'Total vendido', ventas.length + ' venta' + (ventas.length !== 1 ? 's' : ''))}
            ${kpiCard('gold', '$' + totalGanancia.toFixed(0), 'Mi ganancia', margenPct.toFixed(1) + '% margen')}
            ${kpiCard('blue', String(totalUnidades), 'Unidades', '$' + ticketProm.toFixed(0) + ' ticket prom.')}
            ${kpiCard('purple', '$' + totalHoy.toFixed(0), 'Hoy', ventasHoy.length + ' venta' + (ventasHoy.length !== 1 ? 's' : ''))}
            ${kpiCard('dark', '$' + total7d.toFixed(0), 'Últimos 7 días', ventas7d.length + ' venta' + (ventas7d.length !== 1 ? 's' : ''))}
            ${kpiCard('red', String(agotados.length), 'Agotados', stockBajo.length + ' con stock bajo')}
        </div>

        <div class="admin-inventory-strip">
            <span>📦 Productos con stock: <strong>${productosConStock}</strong></span>
            <span>⚠️ Stock bajo: <strong>${stockBajo.length}</strong></span>
            <span>💵 Inventario estimado: <strong>$${inventarioUSD.toFixed(0)}</strong></span>
        </div>

        <div class="admin-chart-box admin-unified-dashboard">
            <div class="admin-chart-title">📈 Resumen general — una sola gráfica</div>
            <div class="admin-chart-bars">
                ${dias.map(d => {
                    const h = Math.max(4, Math.round((d.total / maxTotal) * 78));
                    return `<div title="${d.label}: $${d.total.toFixed(2)} · Ganancia $${d.ganancia.toFixed(2)} · ${d.unidades} ud(s)"
                        class="admin-chart-bar ${d.total > 0 ? 'filled' : 'empty'}"
                        style="height:${h}px;"></div>`;
                }).join('')}
            </div>
            <div class="admin-chart-footer"><span>${dias[0].label}</span><span>hoy</span></div>

            <div class="admin-unified-sections">
                ${miniSection('🏆 Más vendidos', masVendidosHtml)}
                ${miniSection('⚠️ Reponer primero', reponerHtml)}
                ${miniSection('👁️ Más vistos', vistosHtml)}
                ${miniSection('🧾 Ventas recientes', recientesHtml)}
            </div>
        </div>
    </div>`;
}

// Parchar renderizarVentas para inyectar el dashboard arriba
if (typeof renderizarVentas === 'function') {
    const _origRenderVentas = renderizarVentas;
    renderizarVentas = function() {
        _origRenderVentas();
        const cont = document.getElementById('ventasContenido');
        if (!cont) return;
        if (cont.querySelector('.tm-dashboard-ventas')) return;
        const dashboard = renderizarDashboardVentas();
        if (dashboard) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tm-dashboard-ventas';
            wrapper.innerHTML = dashboard;
            cont.insertBefore(wrapper, cont.firstChild);
        }
    };
}

// ── 4. ALERTA DE STOCK BAJO EN TAB GESTIONAR ──────────────────────
function actualizarBadgeStockBajo() {
    const btn = document.querySelector('.tab-btn[data-tab="manage-products"]');
    if (!btn) return;
    const bajos = productos.filter(p => p.stock > 0 && p.stock <= 3).length;
    const agotados = productos.filter(p => p.stock === 0).length;
    const total = bajos + agotados;

    // Limpiar badge anterior
    const prev = btn.querySelector('.stock-alert-badge');
    if (prev) prev.remove();

    if (total > 0) {
        const badge = document.createElement('span');
        badge.className = 'stock-alert-badge';
        badge.textContent = total;
        badge.style.cssText = `
            display:inline-flex;align-items:center;justify-content:center;
            background:#e74c3c;color:white;border-radius:50%;
            font-size:10px;font-weight:800;min-width:16px;height:16px;
            padding:0 3px;margin-left:4px;vertical-align:middle;`;
        btn.appendChild(badge);
    }
}

// Hook: actualizar badge cada vez que cambia el stock
if (typeof guardarProductos === 'function') {
    const _origGuardarProd = guardarProductos;
    guardarProductos = function() {
        _origGuardarProd();
        setTimeout(actualizarBadgeStockBajo, 50);
    };
}

// ── 5. ANIMACIONES FADE-IN AL SCROLL ──────────────────────────────
function initScrollAnimations() {
    if (typeof IntersectionObserver === 'undefined') return;
    // FIX: evitar duplicación de <style> con cada render
    if (document.getElementById('tm-scroll-anim-style')) return;
    const style = document.createElement('style');
    style.id = 'tm-scroll-anim-style';
    style.textContent = `
        .producto-card { opacity: 0; transform: translateY(18px); transition: opacity .45s ease, transform .45s ease; }
        .producto-card.visible { opacity: 1; transform: translateY(0); }
        .categoria-card:not(.proximamente) { opacity: 0; transform: translateY(14px); transition: opacity .4s ease, transform .4s ease; }
        .categoria-card.visible { opacity: 1; transform: translateY(0); }
        .categoria-card.proximamente { opacity: 0.4 !important; pointer-events: none !important; cursor: default !important; }
    `;
    document.head.appendChild(style);

    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.08 });

    function observarTarjetas() {
        document.querySelectorAll('.producto-card:not(.visible), .categoria-card:not(.visible)')
            .forEach(c => obs.observe(c));
    }

    // Observar tarjetas actuales y futuras
    observarTarjetas();
    const mutObs = new MutationObserver(observarTarjetas);
    const grid = document.getElementById('productosGrid') || document.body;
    mutObs.observe(grid, { childList: true, subtree: true });
}

// ── 6. EXPORTAR VENTAS A CSV ───────────────────────────────────────

function mostrarVistaMeGusta() {
    // Inyectar estilos para que las cards sean siempre visibles
    if (!document.getElementById('meGustaStyles')) {
        const st = document.createElement('style');
        st.id = 'meGustaStyles';
        st.textContent = `
            #meGustaGrid .producto-card {
                background: var(--card-bg, #fff) !important;
                border: 1px solid rgba(128,128,128,0.2) !important;
                border-bottom: 3px solid #e74c3c !important;
                opacity: 1 !important;
                visibility: visible !important;
                display: flex !important;
                flex-direction: column !important;
            }
            body.dark-mode #meGustaGrid .producto-card {
                background: #1e1e1e !important;
                color: #fff !important;
            }
            body.dark-mode #meGustaGrid .producto-card h3 { color: rgba(255,255,255,0.9) !important; }
            body.dark-mode #meGustaGrid .producto-card .precio-actual { color: #e74c3c !important; }
            body.dark-mode #meGustaGrid .producto-card .producto-description { color: rgba(255,255,255,0.6) !important; }
        `;
        document.head.appendChild(st);
    }
    document.getElementById('vistaInicio').style.display    = 'none';
    document.getElementById('vistaCategoria').style.display = 'none';
    const vPed = document.getElementById('vistaPedidos');
    if (vPed) vPed.style.display = 'none';

    const vistaEl = document.getElementById('vistaMeGusta');
    if (!vistaEl) return;
    vistaEl.style.display = 'block';
    actualizarVisibilidadBannerOferta(false);

    const statsEl  = document.getElementById('meGustaStats');
    const grid     = document.getElementById('meGustaGrid');
    const vacioEl  = document.getElementById('meGustaVacio');
    if (!grid) return;

    // Usar siempre el array global productos (más confiable que localStorage)
    const cat = (typeof productos !== 'undefined' && productos.length > 0)
        ? productos
        : JSON.parse(localStorage.getItem('productos') || '[]');

    // Si aún no hay catálogo, esperar hasta 5 segundos
    if (cat.length === 0 && wishlist.length > 0) {
        if (statsEl) statsEl.textContent = 'Cargando...';
        grid.style.display = 'none';
        if (vacioEl) vacioEl.style.display = 'none';
        mostrarVistaMeGusta._t = (mostrarVistaMeGusta._t || 0) + 1;
        if (mostrarVistaMeGusta._t < 7) {
            setTimeout(mostrarVistaMeGusta, 700);
        } else {
            // FIX BUG #25: dar feedback al usuario si no se pudo cargar
            mostrarVistaMeGusta._t = 0;
            if (statsEl) statsEl.textContent = 'No se pudo cargar el catálogo. Recarga la página.';
            console.warn('[mostrarVistaMeGusta] No se pudo cargar tras 7 intentos.');
        }
        return;
    }
    mostrarVistaMeGusta._t = 0;

    const prods = wishlist
        .map(wid => cat.find(p => String(p.id) === String(wid)))
        .filter(Boolean);

    if (statsEl) statsEl.textContent = prods.length + ' producto' + (prods.length !== 1 ? 's' : '') + ' guardado' + (prods.length !== 1 ? 's' : '');

    if (prods.length === 0) {
        grid.style.display  = 'none';
        if (vacioEl) vacioEl.style.display = 'block';
    } else {
        if (vacioEl) vacioEl.style.display = 'none';
        grid.style.display = '';
        grid.innerHTML = '';
        const ofertaId = getOfertaDiaId();
        prods.forEach(producto => {
            const esAgotado   = producto.stock === 0;
            const esOfertaDia = String(producto.id) === String(ofertaId);
            const card = document.createElement('div');
            card.className = 'producto-card' + (esAgotado ? ' card-agotado' : '');
            card.onclick = () => abrirDetalleProducto(producto.id);
            card.style.position = 'relative';
            // Sanitización defensiva anti-XSS
            const _id  = safeNum(producto.id);
            const _nom = escapeHtml(producto.nombre);
            const _des = escapeHtml(producto.descripcion || '');
            const _img = escapeAttr(producto.imagen || '');
            const _stk = safeNum(producto.stock);
            const _txt = escapeHtml(getOfertaDiaTexto());
            const stockHTML = esAgotado
                ? '<div class="stock" style="color:#e74c3c;font-weight:700;">❌ Agotado</div>'
                : (_stk <= 3
                    ? '<div class="stock stock-urgente">⚠️ ¡Solo quedan ' + _stk + '!</div>'
                    : '<div class="stock">📦 Stock: ' + _stk + ' unidades</div>') +
                  '<button class="btn-pedir-card" data-nombre="' + _nom + '" onclick="event.stopPropagation();tmComprar(event,' + _id + ',this.dataset.nombre)">🛒 Pedir</button>';
            card.innerHTML =
                (esOfertaDia ? '<div class="badge-oferta-dia">' + _txt + '</div>' :
                 esAgotado   ? '<div class="badge-agotado">AGOTADO</div>' :
                 producto.masVendido ? '<div class="badge-vendido">🔥 Más Vendido</div>' : '') +
                '<div class="producto-image">' +
                    getMeGustaHTML(_id) +
                    '<img src="' + _img + '" alt="' + _nom + '" loading="lazy" onerror="this.src=\'/iconos/favicon-192.png\';this.style.opacity=\'0.3\'">' +
                    (producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual ? '<div class="badge">-$' + (producto.precioOriginal - producto.precioActual).toFixed(0) + '</div>' : '') +
                '</div>' +
                '<h3>' + _nom + '</h3>' +
                '<p class="producto-description">' + _des + '</p>' +
                '<p class="precio">' +
                (producto.descuento > 0 ? '<span class="precio-tachado">$' + (Number(producto.precioActual) / (1 - producto.descuento / 100)).toFixed(2) + ' USD</span> ' : '') +
                '<span class="precio-actual" data-usd="' + safeNum(producto.precioActual) + '">$' + Number(producto.precioActual).toFixed(2) + ' USD</span>' +
                (producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual ? ' <span class="precio-ahorro">-$' + (parseFloat(producto.precioOriginal) - parseFloat(producto.precioActual)).toFixed(0) + '</span>' : '') +
            '</p>' +
                stockHTML;
            grid.appendChild(card);
        });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cerrarVistaMeGusta() {
    const v = document.getElementById('vistaMeGusta');
    if (v) v.style.display = 'none';
    mostrarVistaInicio();
}

// ══════════════════════════════════════════════════════════════
//  VISTA: MIS PEDIDOS (historial del cliente)
// ══════════════════════════════════════════════════════════════
function guardarPedidoCliente(itemsCarrito) {
    const pedidos = JSON.parse(localStorage.getItem('pedidos_cliente_v1') || '[]');
    const total   = itemsCarrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    pedidos.unshift({
        id:     Date.now(),
        fecha:  new Date().toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        items:  itemsCarrito.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })),
        total:  total
    });
    localStorage.setItem('pedidos_cliente_v1', JSON.stringify(pedidos.slice(0, 50)));
}

function mostrarVistaPedidos() {
    document.getElementById('vistaInicio').style.display    = 'none';
    document.getElementById('vistaCategoria').style.display = 'none';
    const vMG = document.getElementById('vistaMeGusta');
    if (vMG) vMG.style.display = 'none';

    const vistaEl = document.getElementById('vistaPedidos');
    if (!vistaEl) return;
    vistaEl.style.display = 'block';
    actualizarVisibilidadBannerOferta(false);

    const pedidos   = JSON.parse(localStorage.getItem('pedidos_cliente_v1') || '[]');
    const statsEl   = document.getElementById('pedidosStats');
    const listaEl   = document.getElementById('pedidosLista');
    const vacioEl   = document.getElementById('pedidosVacio');

    if (statsEl) statsEl.textContent = pedidos.length + ' pedido' + (pedidos.length !== 1 ? 's' : '');

    if (pedidos.length === 0) {
        if (listaEl) listaEl.innerHTML = '';
        if (vacioEl) vacioEl.style.display = 'block';
    } else {
        if (vacioEl) vacioEl.style.display = 'none';
        if (listaEl) listaEl.innerHTML = pedidos.map(p => `
          <div class="pedido-card">
            <div class="pedido-card-header">
              <span class="pedido-fecha">📅 ${p.fecha}</span>
              <span class="pedido-total">$${p.total.toFixed(2)} USD</span>
            </div>
            <div class="pedido-items">
              ${p.items.map(i => `
                <div class="pedido-item">
                  <span class="pedido-item-nombre">${i.nombre}</span>
                  <span class="pedido-item-qty">×${i.cantidad}</span>
                  <span class="pedido-item-precio">$${(i.precio * i.cantidad).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
            <button class="pedido-btn-repetir" onclick="repetirPedido(${p.id})">🔄 Pedir de nuevo</button>
          </div>
        `).join('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cerrarVistaPedidos() {
    const v = document.getElementById('vistaPedidos');
    if (v) v.style.display = 'none';
    mostrarVistaInicio();
}

function repetirPedido(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('pedidos_cliente_v1') || '[]');
    const pedido  = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    pedido.items.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (p && p.stock > 0) agregarAlCarrito(item.id);
    });
    cerrarVistaPedidos();
    setTimeout(abrirCarrito, 300);
}


// ══════════════════════════════════════════════════════════════
//  DEEP LINKS — Abrir producto directo desde URL compartida
//  Ejemplo: tiendamax.org/#producto-1777923552923
// ══════════════════════════════════════════════════════════════
function _tmGetDeepLinkProductId() {
    const hash = window.location.hash || '';
    if (hash.startsWith('#producto-')) {
        const id = parseInt(hash.replace('#producto-', ''), 10);
        if (id) return id;
    }
    try {
        const u = new URL(window.location.href);
        const q = u.searchParams.get('producto') || u.searchParams.get('p');
        const id = parseInt(q || '', 10);
        if (id) return id;
    } catch(e) {}
    return 0;
}

function _procesarDeepLink() {
    const id = _tmGetDeepLinkProductId();
    if (!id) return;

    const abrir = () => {
        // Buscar en array global primero
        if (typeof productos !== 'undefined' && productos.length > 0) {
            const p = productos.find(x => x.id === id || String(x.id) === String(id));
            if (p) { abrirDetalleProducto(p.id); return true; }
        }
        // Fallback: localStorage
        let local = [];
        try { local = JSON.parse(localStorage.getItem('productos') || '[]'); } catch(e) {}
        const pLocal = local.find(x => x.id === id || String(x.id) === String(id));
        if (pLocal) {
            if (typeof productos !== 'undefined' && productos.length === 0) productos.push(...local);
            abrirDetalleProducto(pLocal.id);
            return true;
        }
        return false;
    };

    const fetchYabrir = async () => {
        try {
            const r = await fetch('productos.json?_=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return false;
            const data = await r.json();
            if (!Array.isArray(data)) return false;
            try { localStorage.setItem('productos', JSON.stringify(data)); } catch(e) {}
            if (typeof productos !== 'undefined') { productos.length = 0; productos.push(...data); }
            return abrir();
        } catch(e) { return false; }
    };

    // Reintentar hasta 30s para conexiones lentas / Facebook in-app browser.
    if (!abrir()) {
        fetchYabrir().then(ok => {
            if (ok) return;
            let intentos = 0;
            const intervalo = setInterval(async () => {
                intentos++;
                if (abrir() || intentos >= 100) {
                    clearInterval(intervalo);
                    return;
                }
                if (intentos === 10 || intentos === 30 || intentos === 60) {
                    if (await fetchYabrir()) clearInterval(intervalo);
                }
            }, 300);
        });
    }
}

window.addEventListener('hashchange', _procesarDeepLink);
window.addEventListener('popstate', _procesarDeepLink);
document.addEventListener('DOMContentLoaded', () => {
    if (_tmGetDeepLinkProductId()) setTimeout(_procesarDeepLink, 100);
});

// ══════════════════════════════════════════════════════════════
//  NOTIFICACIÓN DE CARRITO ABANDONADO
//  Lógica: si hay productos en el carrito y el usuario lleva
//  más de 2 horas sin interactuar, se envía una notificación push.
//  Se usa el SW existente — no requiere backend.
// ══════════════════════════════════════════════════════════════
(function initCarritoAbandonado() {
    const DELAY_MS  = 2 * 60 * 60 * 1000; // 2 horas
    const KEY_TIMER = 'carrito_notif_timer';
    const KEY_SENT  = 'carrito_notif_sent';
    let   _timer    = null;

    function cancelarTimer() {
        if (_timer) { clearTimeout(_timer); _timer = null; }
        localStorage.removeItem(KEY_TIMER);
    }

    function programarNotificacion() {
        cancelarTimer();
        // Solo si hay carrito con productos
        if (!carrito || carrito.length === 0) return;
        // Solo si tiene permiso de notificaciones
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

        const disparoEn = Date.now() + DELAY_MS;
        localStorage.setItem(KEY_TIMER, disparoEn);
        localStorage.removeItem(KEY_SENT);

        _timer = setTimeout(async () => {
            // Verificar que aún hay carrito y no se envió ya
            const carritoActual = JSON.parse(localStorage.getItem('carrito_v2') || '{"items":[]}').items || [];
            if (carritoActual.length === 0) return;
            if (localStorage.getItem(KEY_SENT)) return;

            const total = carritoActual.reduce((s, i) => s + i.precio * i.cantidad, 0);
            const nombres = carritoActual.slice(0, 2).map(i => i.nombre.substring(0, 20)).join(', ');
            const cuerpo  = carritoActual.length === 1
                ? '¡Tienes ' + carritoActual[0].nombre.substring(0, 30) + ' esperándote! ($' + total.toFixed(0) + ' USD)'
                : '¡Tienes ' + carritoActual.length + ' productos en tu carrito! ' + nombres + '... ($' + total.toFixed(0) + ' USD)';

            try {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification('🛒 ¿Olvidaste algo?', {
                    body: cuerpo,
                    icon: '/iconos/icon-192.png',
                    badge: '/iconos/icon-192.png',
                    data: { url: '/?carrito=1' },
                    vibrate: [200, 100, 200],
                    tag: 'carrito-abandonado',
                    renotify: false,
                    actions: [
                        { action: 'ver', title: '🛒 Ver carrito' },
                        { action: 'cerrar', title: 'Más tarde' }
                    ]
                });
                localStorage.setItem(KEY_SENT, '1');
            } catch(err) {
            }
        }, DELAY_MS);
    }

    // Reprogramar cada vez que cambie el carrito
    const _guardarOriginal = guardarCarrito;
    window.guardarCarrito = function() {
        _guardarOriginal();
        programarNotificacion();
    };

    // Al cargar la página: verificar si hay un timer pendiente del pasado
    window.addEventListener('load', () => {
        const disparoGuardado = parseInt(localStorage.getItem(KEY_TIMER) || '0');
        if (disparoGuardado && Date.now() < disparoGuardado && carrito && carrito.length > 0) {
            const restante = disparoGuardado - Date.now();
            _timer = setTimeout(() => programarNotificacion(), restante);
        } else {
            programarNotificacion();
        }
    });

    // Al abrir el carrito: cancelar el timer (el usuario está activo)
    const _abrirOriginal = abrirCarrito;
    window.abrirCarrito = function() {
        cancelarTimer();
        localStorage.removeItem(KEY_SENT);
        _abrirOriginal();
        // Reprogramar cuando cierre
        setTimeout(programarNotificacion, 500);
    };
})();

// ── REGISTRO DEL SERVICE WORKER + NOTIFICACIONES PUSH ──────────────
// NOTA: El SW se registra desde index.html (con auto-reload).
// Aquí solo manejamos el banner de permiso para notificaciones.
(function initPush() {
    if (!('serviceWorker' in navigator)) return;

    // ═══════════════════════════════════════════════════════
    //  PRE-PROMPT INTELIGENTE para notificaciones
    //  Se muestra SOLO en momentos de alta intención:
    //    • Tras 30s de navegación activa (no al cargar)
    //    • Tras marcar 2 ❤️ Me Gusta
    //    • Tras hacer scroll a la 2ª pantalla
    //    • Tras abrir 3 detalles de productos
    //
    //  NO se muestra si:
    //    • Ya tiene permiso granted
    //    • Está denied (no se puede repreguntar el nativo)
    //    • El usuario dijo "Ahora no" hace menos de X días
    // ═══════════════════════════════════════════════════════
    let _bannerYaMostrado = false;
    function _mostrarBannerPushAhora() {
        if (_bannerYaMostrado) return;
        if (!('Notification' in window)) return;

        // Si ya tiene permiso concedido, no molestar
        if (Notification.permission === 'granted') return;

        // Si el usuario cerró el banner antes, esperar el tiempo configurado
        const pospuesto = parseInt(localStorage.getItem('tm_push_pospuesto') || '0');
        if (Date.now() < pospuesto) return;

        _bannerYaMostrado = true;

        // Eliminar banner anterior si existe
        const anterior = document.getElementById('tm-push-banner-wrap');
        if (anterior) anterior.remove();

        // Mensaje según el estado del permiso
        const estaDenegado = Notification.permission === 'denied';
        const titulo  = estaDenegado ? '🔔 Notificaciones bloqueadas' : '🔔 ¿Quieres avisos de ofertas?';
        const cuerpo  = estaDenegado
            ? 'Para reactivarlas: tres puntos del navegador → Ajustes → Notificaciones → Permitir'
            : 'Te avisamos cuando bajen los precios o lleguen productos nuevos. Sin spam.';
        const btnTexto = estaDenegado ? 'Cómo activarlas' : '🔔 Avísame';

        const b = document.createElement('div');
        b.id = 'tm-push-banner-wrap';
        b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 20px);z-index:2000;width:min(92vw,380px);max-width:380px';
        b.innerHTML = `<div id="tm-push-banner" style="background:#1a1a1a;border:1.5px solid #C9A96E;border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:sans-serif;animation:slideUpBanner .35s ease"><span style="font-size:26px;flex-shrink:0">🔔</span><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#C9A96E;margin-bottom:2px">${escapeHtml(titulo)}</div><div style="font-size:12px;color:#aaa;line-height:1.3">${escapeHtml(cuerpo)}</div></div><div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0"><button id="tm-push-si" style="background:#C9A96E;color:#000;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">${escapeHtml(btnTexto)}</button><button id="tm-push-no" style="background:none;border:none;color:#666;font-size:11px;cursor:pointer;text-align:center">Ahora no</button></div></div>`;
        if (!document.getElementById('slideUpBannerStyle')) {
            const s = document.createElement('style');
            s.id = 'slideUpBannerStyle';
            s.textContent = '@keyframes slideUpBanner{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
            document.head.appendChild(s);
        }
        document.body.appendChild(b);

        document.getElementById('tm-push-si').onclick = async () => {
            b.remove();
            setTimeout(() => { try { if (typeof window._tmMostrarInstall === 'function') window._tmMostrarInstall(); } catch(e){} }, 5000);
            if (estaDenegado) {
                alert('Para activar las notificaciones:\n\n1. Toca los 3 puntos del navegador\n2. Ajustes → Configuración del sitio\n3. Notificaciones → Permitir');
                return;
            }
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                // Mismo flujo que el modal de la campana:
                // 1. Limpiar flag de desuscripción manual para que ejecutarInitFCM registre el token
                localStorage.removeItem('tm_push_desuscrito');
                try {
                    const swReg = await navigator.serviceWorker.ready;
                    if (swReg && swReg.active) swReg.active.postMessage({ type: 'TM_CLEAR_DESUSCRITO' });
                } catch(e) {}
                // 2. Registrar token FCM
                try {
                    await tmRegistrarTokenFCMSiPermitido();
                } catch(e) {}
                // 3. Esperar a que el token se guarde y mostrar resultado
                await new Promise(r => setTimeout(r, 1500));
                const token = localStorage.getItem('fcmToken');
                if (token) {
                    mostrarNotificacion('🔔 ¡Notificaciones activadas!', 'success');
                    try {
                        const reg = await navigator.serviceWorker.ready;
                        reg.showNotification('✅ TiendaMax activado', {
                            body: 'Te avisaremos de ofertas y productos nuevos.',
                            icon: '/iconos/icon-192.png',
                            badge: '/iconos/icon-192.png',
                            vibrate: [200, 100, 200]
                        });
                    } catch(e) {}
                } else {
                    mostrarNotificacion('⚠️ Activa desde la campana 🔔 si no funciona', 'warning');
                }
            } else if (perm === 'denied') {
                localStorage.setItem('tm_push_pospuesto', Date.now() + PUSH_BANNER_DENY_DELAY_HOURS * 60 * 60 * 1000);
            }
        };

        document.getElementById('tm-push-no').onclick = () => {
            b.remove();
            setTimeout(() => { try { if (typeof window._tmMostrarInstall === 'function') window._tmMostrarInstall(); } catch(e){} }, 5000);
            // Pospuesto: cuántas veces lo ha rechazado
            const rechazos = parseInt(localStorage.getItem('tm_push_rechazos') || '0') + 1;
            localStorage.setItem('tm_push_rechazos', String(rechazos));
            // Cada rechazo añade más tiempo de espera
            const dias = PUSH_RECHAZO_DELAY_DAYS[Math.min(rechazos - 1, PUSH_RECHAZO_DELAY_DAYS.length - 1)];
            const ms = dias * 24 * 60 * 60 * 1000;
            localStorage.setItem('tm_push_pospuesto', String(Date.now() + ms));
        };
    }

    // Disparadores de momento correcto
    function _maybeMostrarPushBanner(razon) {
        if (_bannerYaMostrado) return;
        if (!('Notification' in window) || Notification.permission === 'granted') return;
        _mostrarBannerPushAhora();
    }

    // Trigger 1: después de 45 segundos de navegación
    setTimeout(() => _maybeMostrarPushBanner('45s navegando'), PUSH_BANNER_DELAY_MS);

    // Trigger 2: tras hacer scroll a la 2ª pantalla
    let _scrolled = false;
    window.addEventListener('scroll', function onScroll() {
        if (_scrolled) return;
        if (window.scrollY > window.innerHeight * 1.5) {
            _scrolled = true;
            window.removeEventListener('scroll', onScroll);
            setTimeout(() => _maybeMostrarPushBanner('scroll 2ª pantalla'), 1500);
        }
    }, { passive: true });

    // Trigger 3: al marcar 2 Me Gusta
    let _likesContados = parseInt(localStorage.getItem('tm_likes_session') || '0');
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-like-id]');
        if (!btn) return;
        _likesContados++;
        localStorage.setItem('tm_likes_session', String(_likesContados));
        if (_likesContados >= 2) {
            setTimeout(() => _maybeMostrarPushBanner('2 me gusta'), 2000);
        }
    });

    // Trigger 4: tras abrir 3 detalles de productos
    let _detallesAbiertos = parseInt(localStorage.getItem('tm_detalles_session') || '0');
    const _origAbrirDetalle = window.abrirDetalleProducto;
    if (typeof _origAbrirDetalle === 'function') {
        window.abrirDetalleProducto = function() {
            _origAbrirDetalle.apply(this, arguments);
            _detallesAbiertos++;
            localStorage.setItem('tm_detalles_session', String(_detallesAbiertos));
            if (_detallesAbiertos >= 3) {
                setTimeout(() => _maybeMostrarPushBanner('3 detalles abiertos'), 1500);
            }
        };
    }

    window.TiendaMaxPush = {
        async enviar(titulo, cuerpo, url, imagen) {
            if (Notification.permission !== 'granted') return;
            const reg = await navigator.serviceWorker.ready;
            const opciones = {
                body: cuerpo,
                icon: '/iconos/icon-192.png',
                badge: '/iconos/icon-192.png',
                data: { url: url || '/' },
                vibrate: [200, 100, 200],
                actions: [
                    { action: 'ver', title: '👀 Ver' },
                    { action: 'cerrar', title: 'Cerrar' }
                ],
                // tag agrupa notificaciones del mismo tipo (solo se muestra la última)
                tag: 'tm-' + (titulo.substring(0, 20)),
                renotify: true,
            };
            if (imagen) opciones.image = imagen;
            reg.showNotification(titulo, opciones);
        },
        nuevoProducto(nombre, precio, id, imagen) {
            const url = id ? '/p/producto-' + id + '.html' : '/';
            this.enviar('🆕 Nuevo en TiendaMax', nombre + ' desde $' + precio + ' USD', url, imagen);
        },
        rebaja(nombre, antes, ahora, id, imagen) {
            const url = id ? '/p/producto-' + id + '.html' : '/';
            const pct = antes > 0 ? Math.round((antes - ahora) / antes * 100) : 0;
            const titulo = pct > 0 ? '🏷️ ¡Rebaja -' + pct + '%!' : '🏷️ Bajada de precio';
            this.enviar(titulo, nombre + ': $' + antes + ' → $' + ahora + ' USD', url, imagen);
        },
        relampago(nombre, precio, min) {
            this.enviar('⚡ ¡Oferta relámpago ' + (min||60) + ' min!', nombre + ' — $' + precio + ' USD');
        },
        ofertaDia(nombre, precio, id, imagen) {
            const url = id ? '/p/producto-' + id + '.html' : '/';
            this.enviar('☀️ Oferta del día', nombre + ' — Solo hoy: $' + precio + ' USD', url, imagen);
        },
        // Métodos para mostrar AGRUPADOS (ej: tras agregar 5 productos)
        nuevosAgrupados(cantidad) {
            this.enviar('🆕 ' + cantidad + ' productos nuevos', 'Ven a ver las novedades 🛍️', '/');
        },
        rebajasAgrupadas(cantidad) {
            this.enviar('🏷️ ' + cantidad + ' productos en oferta', '¡Aprovecha antes de que se acaben!', '/');
        }
    };
})();

// ═══════════════════════════════════════════════════════
//  #4 BADGE "NUEVO" — Productos de los últimos 7 días
// ═══════════════════════════════════════════════════════
function esProductoNuevo(producto) {
    if (!producto || !producto.fechaAgregado) return false;
    const dias7 = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - new Date(producto.fechaAgregado).getTime()) < dias7;
}

// ═══════════════════════════════════════════════════════
//  #1 CONVERTIDOR USD → MN
//  Tasa se carga desde config.json en GitHub (sube a todos)
//  + 10 MN de margen sobre la tasa base configurada
// ═══════════════════════════════════════════════════════
// _monedaActual ya está declarada al inicio del archivo

function getTasaMN() {
    const base = parseFloat(localStorage.getItem('tasaMN') || '0');
    return base > 0 ? base + 10 : 0;
}

// Guardar tasa en GitHub para que todos la vean
async function guardarTasaEnGitHub(tasaBase) {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) return false;
    try {
        // Leer config existente antes de escribir para no borrar ofertaDiaId ni otros campos
        const existing = await fetch(
            `https://raw.githubusercontent.com/${user}/${repo}/main/config.json?_=${Date.now()}`
        ).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        existing.tasaMN      = tasaBase;
        existing.actualizado = new Date().toISOString();
        await subirArchivoAGitHub(user, repo, token, 'config.json', existing);
        return true;
    } catch(e) { return false; }
}

// Cargar tasa desde GitHub al iniciar
async function cargarTasaDesdeGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    try {
        // Intentar ruta de GitHub raw primero; si no hay credenciales, ruta relativa (GitHub Pages)
        let cfg = null;
        if (user && repo) {
            const res = await fetch(`https://raw.githubusercontent.com/${user}/${repo}/main/config.json?_=${Date.now()}`);
            if (res.ok) cfg = await res.json();
        }
        if (!cfg) {
            // Fallback: ruta relativa — siempre funciona en GitHub Pages
            const res = await fetch(`config.json?_=${Date.now()}`);
            if (res.ok) cfg = await res.json();
        }
        if (cfg) {
            // Cargar tasa MN
            if (cfg.tasaMN && parseFloat(cfg.tasaMN) > 0) {
                localStorage.setItem('tasaMN', String(cfg.tasaMN));
                if (_monedaActual === 'MN') actualizarPreciosMostrados();
                if (typeof actualizarBurbujaTasa === 'function') actualizarBurbujaTasa();
            }
            // Cargar oferta del día
            if (cfg.ofertaDiaId) {
                localStorage.setItem('ofertaDiaId', String(cfg.ofertaDiaId));
                if (cfg.ofertaDiaTexto) localStorage.setItem('ofertaDiaTexto', cfg.ofertaDiaTexto);
            }
            // Cargar configuración de Firebase y arrancar FCM
            if (cfg.firebaseConfig) {
                localStorage.setItem('firebaseConfig', JSON.stringify(cfg.firebaseConfig));
                if (cfg.fcmServerKey) {
                    localStorage.setItem('fcmServerKey', cfg.fcmServerKey);
                }
                if (cfg.firebaseConfig.vapidKey) {
                    localStorage.setItem('firebaseVapidKey', cfg.firebaseConfig.vapidKey);
                }
                inicializarFirebaseFCMClient(cfg.firebaseConfig);
            }
            // Siempre verificar el banner (aunque GitHub no tenga ofertaDiaId,
            // puede haberlo en localStorage de sesiones anteriores)
            verificarOfertasYMostrarBanner();
        }
    } catch(e) {}
}

function setCurrency(moneda) {
    _monedaActual = moneda;
    localStorage.setItem('monedaActual', moneda);
    // Actualizar botones
    document.getElementById('curUSD')?.classList.toggle('active', moneda === 'USD');
    document.getElementById('curMN')?.classList.toggle('active', moneda === 'MN');
    // Actualizar etiqueta de tasa
    const tasa = getTasaMN();
    // tasaLabel está deshabilitado: la tasa se muestra en el botón del toggle
    const label = document.getElementById('tasaLabel');
    if (label) { label.textContent = ''; label.style.display = 'none'; }
    // Actualizar todos los precios visibles
    actualizarPreciosMostrados();
}

function formatPrecio(usd) {
    if (_monedaActual === 'MN') {
        const tasa = getTasaMN();
        if (tasa > 0) return `$${Math.round(usd * tasa).toLocaleString()} MN`;
    }
    return `$${parseFloat(usd).toFixed(2)} USD`;
}

function actualizarPreciosMostrados() {
    // Precios en tarjetas de productos
    document.querySelectorAll('[data-precio-usd]').forEach(el => {
        const usd = parseFloat(el.getAttribute('data-precio-usd'));
        el.textContent = formatPrecio(usd);
    });
    // Re-renderizar si es necesario
    const grid = document.getElementById('productosGrid');
    if (grid && grid.children.length > 0) {
        grid.querySelectorAll('.precio-actual').forEach(el => {
            const usd = parseFloat(el.getAttribute('data-usd') || el.textContent.replace(/[^0-9.]/g, ''));
            if (!isNaN(usd) && usd > 0) {
                if (!el.getAttribute('data-usd')) el.setAttribute('data-usd', usd);
                el.textContent = formatPrecio(usd);
            }
        });
    }
    // Actualizar precio MN en modal de detalle si está abierto
    const _mnEl = document.getElementById('detailPriceMN');
    if (_mnEl) {
        const _tasa = typeof getTasaMN === 'function' ? getTasaMN() : 0;
        const _usdEl = document.getElementById('detailPriceActual');
        const _usd = _usdEl ? parseFloat(_usdEl.textContent.replace(/[^0-9.]/g, '')) : 0;
        if (_tasa > 0 && _usd > 0) {
            _mnEl.textContent = `≈ ${Math.round(_usd * _tasa).toLocaleString('es-CU')} MN`;
            _mnEl.style.display = 'block';
        } else {
            _mnEl.style.display = 'none';
        }
    }
}

// ── BURBUJA TASA DEL DÍA ──────────────────────────────────────────
// Muestra una burbuja flotante visible para TODOS con la tasa actual
function actualizarBurbujaTasa() {
    const tasa = getTasaMN();
    let burbuja = document.getElementById('tasaBurbuja');
    if (!burbuja) {
        burbuja = document.createElement('div');
        burbuja.id = 'tasaBurbuja';
        burbuja.style.cssText = [
            'position:fixed',
            'bottom:80px',
            'right:16px',
            'z-index:9990',
            'background:linear-gradient(135deg,#C9A96E,#E8C88A)',
            'color:#0D0D0D',
            'font-weight:800',
            'font-size:12px',
            'padding:7px 13px',
            'border-radius:999px',
            'box-shadow:0 3px 14px rgba(0,0,0,0.35)',
            'cursor:default',
            'user-select:none',
            'display:flex',
            'align-items:center',
            'gap:5px',
            'transition:opacity 0.3s,transform 0.3s',
            'animation:tasaBurbujaIn 0.4s cubic-bezier(.34,1.56,.64,1) both',
        ].join(';');
        burbuja.title = 'Tasa de cambio del día (incluye margen)';
        // Inyectar keyframe solo una vez
        if (!document.getElementById('tasaBurbujaStyle')) {
            const s = document.createElement('style');
            s.id = 'tasaBurbujaStyle';
            s.textContent = `
                @keyframes tasaBurbujaIn {
                    from { opacity:0; transform:scale(0.6) translateY(12px); }
                    to   { opacity:1; transform:scale(1) translateY(0); }
                }
                #tasaBurbuja:hover { transform:scale(1.06); }
                @media(max-width:480px){ #tasaBurbuja { bottom:70px; right:10px; font-size:11px; padding:6px 11px; } }
            `;
            document.head.appendChild(s);
        }
        document.body.appendChild(burbuja);
    }
    // Burbuja flotante oculta — la tasa se muestra en la barra del header
    burbuja.style.display = 'none';

    // Actualizar barra de moneda del navbar
    const curMNBtn = document.getElementById('curMN');
    const tasaLabel = document.getElementById('tasaLabel');
    // Solo actualizar el botón del toggle; el tasaLabel está oculto
    if (tasa > 0) {
        if (curMNBtn) curMNBtn.textContent = tasa + ' MN';
    } else {
        if (curMNBtn) curMNBtn.textContent = '-- MN';
    }
    if (tasaLabel) tasaLabel.style.display = 'none';
}

// Inicializar barra de moneda al cargar
document.addEventListener('DOMContentLoaded', () => {
    // tasaLabel está deshabilitado: la tasa se muestra en el botón del toggle
    const label = document.getElementById('tasaLabel');
    if (label) { label.textContent = ''; label.style.display = 'none'; }

    if (_monedaActual === 'MN') {
        document.getElementById('curUSD')?.classList.remove('active');
        document.getElementById('curMN')?.classList.add('active');
    }
    // Mostrar burbuja y banner si ya hay datos en localStorage
    actualizarBurbujaTasa();
    verificarOfertasYMostrarBanner();
});

// Exponer formatPrecio globalmente para uso en renderizado
window.tmFormatPrecio = formatPrecio;


// ═══════════════════════════════════════════════════════
//  🔔 INTEGRACIÓN CON FIREBASE CLOUD MESSAGING (FCM)
// ═══════════════════════════════════════════════════════

async function inicializarFirebaseFCMClient(config) {
    if (!config || !config.projectId) return;
    
    // Evitar doble inicialización si las librerías ya se cargaron y Firebase existe
    if (window.firebase && firebase.apps.length) {
        ejecutarInitFCM(config);
        return;
    }

    
    
    // Cargar SDK dinámicamente de forma ordenada (App -> Messaging)
    const scriptApp = document.createElement('script');
    scriptApp.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js';
    scriptApp.onerror = () => { /* FCM no disponible (sin red o bloqueado) */ };
    scriptApp.onload = () => {
        const scriptMsg = document.createElement('script');
        scriptMsg.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js';
        scriptMsg.onerror = () => { /* FCM messaging SDK no disponible */ };
        scriptMsg.onload = () => {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            if (firebase.messaging.isSupported()) {
                ejecutarInitFCM(config);
            }
        };
        document.head.appendChild(scriptMsg);
    };
    document.head.appendChild(scriptApp);
}

function ejecutarInitFCM(config) {
    try {
        const messaging = firebase.messaging();
        // FIX: registrar el SW dedicado de Firebase (firebase-messaging-sw.js)
        // El SW de TiendaMax (sw.js) NO sirve para FCM — debe ser uno propio.
        navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' })
            .then(fcmReg => {
                
                try { messaging.useServiceWorker(fcmReg); } catch(e) { console.warn('[FCM] useServiceWorker:', e); }
                if (Notification.permission === 'granted') {
                    // [FIX] Solo registrar si el usuario NO se desuscribió manualmente
                    const desuscrito = localStorage.getItem('tm_push_desuscrito') === '1';
                    if (desuscrito) {
                        
                        window._tmFcmPending = { messaging: messaging, config: config, fcmReg: fcmReg };
                    } else {
                        
                        solicitarYRegistrarTokenFCM(messaging, config, fcmReg);
                    }
                } else if (Notification.permission === 'default') {
                    
                    // Guardar referencias para reintento posterior cuando el usuario permita
                    window._tmFcmPending = { messaging: messaging, config: config, fcmReg: fcmReg };
                }
            })
            .catch(err => {
                console.error('[FCM] Error registrando firebase-messaging-sw.js:', err);
            });
        
        // Manejar mensajes en primer plano (Foreground)
        messaging.onMessage((payload) => {
            
            const title = payload.notification?.title || payload.data?.title || '📢 TiendaMax';
            const body = payload.notification?.body || payload.data?.body || '';
            const url = payload.data?.url || '/';
            
            mostrarNotificacion(title + ': ' + body, 'info');
        });
    } catch(err) {
        console.error('[FCM] Error inicializando FCM:', err);
    }
}

// FIX: función reutilizable para registrar token FCM tras permiso concedido.
// Llamada desde el handler del botón "Avísame" del banner.
async function tmRegistrarTokenFCMSiPermitido() {
    if (Notification.permission !== 'granted') return;
    // Si ya hay FCM iniciado (pending desde init), usar esa referencia
    if (window._tmFcmPending && window._tmFcmPending.messaging) {
        const p = window._tmFcmPending;
        await solicitarYRegistrarTokenFCM(p.messaging, p.config, p.fcmReg);
        return;
    }
    // Si no, inicializar todo desde cero
    let fbConfig = null;
    try {
        const raw = localStorage.getItem('firebaseConfig');
        if (raw) fbConfig = JSON.parse(raw);
    } catch(e) {}
    if (!fbConfig || !fbConfig.projectId) {
        try {
            const r = await fetch('config.json?_=' + Date.now());
            if (r.ok) {
                const cfg = await r.json();
                fbConfig = cfg.firebaseConfig;
                if (fbConfig) localStorage.setItem('firebaseConfig', JSON.stringify(fbConfig));
            }
        } catch(e) {
            console.error('[FCM] Error cargando config:', e);
        }
    }
    if (fbConfig && fbConfig.projectId) {
        if (typeof inicializarFirebaseFCMClient === 'function') {
            await inicializarFirebaseFCMClient(fbConfig);
        }
    }
}
window.tmRegistrarTokenFCMSiPermitido = tmRegistrarTokenFCMSiPermitido;

function tmPushDeviceFingerprint() {
    const parts = [
        navigator.userAgent || '',
        ((screen && screen.width) || 0) + 'x' + ((screen && screen.height) || 0),
        navigator.language || '',
        (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') || ''
    ].join('|');
    let h = 0;
    for (let i = 0; i < parts.length; i++) h = ((h << 5) - h + parts.charCodeAt(i)) | 0;
    return 'fp_' + (h >>> 0).toString(36);
}
window.tmPushDeviceFingerprint = tmPushDeviceFingerprint;

async function solicitarYRegistrarTokenFCM(messaging, config, fcmReg) {
    try {
        const vapidKey = config.vapidKey || localStorage.getItem('firebaseVapidKey');
        if (!vapidKey) {
            console.warn('[FCM] No se especificó la clave VAPID. No se puede obtener token.');
            return;
        }
        
        // FIX: pasar el serviceWorkerRegistration explícitamente a getToken
        const opts = { vapidKey: vapidKey };
        if (fcmReg) opts.serviceWorkerRegistration = fcmReg;
        const token = await messaging.getToken(opts);
        if (token) {
            
            // Guardar en localStorage
            localStorage.setItem('fcmToken', token);
            
            // Registrar token en Firebase Realtime Database.
            // ID por fingerprint: evita sumar otro suscriptor si el mismo dispositivo
            // borra datos del navegador y vuelve a activar notificaciones.
            const fingerprint = (typeof tmPushDeviceFingerprint === 'function') ? tmPushDeviceFingerprint() : btoa(navigator.userAgent).slice(0,40);
            const tokenId = fingerprint;
            const legacyTokenId = btoa(token).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            const rtdbUrl = config.databaseURL || `https://${config.projectId}-default-rtdb.firebaseio.com`;

            // Limpia entradas anteriores del mismo dispositivo/token antes de guardar.
            try {
                const allRes = await fetch(`${rtdbUrl}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
                if (allRes.ok) {
                    const allData = await allRes.json();
                    if (allData && typeof allData === 'object') {
                        const deletes = [];
                        Object.keys(allData).forEach(k => {
                            const t = allData[k];
                            if (k !== tokenId && (k === legacyTokenId || (t && (t.fingerprint === fingerprint || t.token === token || t.userAgent === navigator.userAgent)))) {
                                deletes.push(fetch(`${rtdbUrl}/tokens/${k}.json`, { method: 'DELETE' }).catch(() => null));
                            }
                        });
                        if (deletes.length) await Promise.allSettled(deletes);
                    }
                }
            } catch(e) {}
            
            await fetch(`${rtdbUrl}/tokens/${tokenId}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent,
                    fingerprint: fingerprint
                })
            });
            if (typeof tmRegistrarSuscriptor === 'function') tmRegistrarSuscriptor();
            
        } else {
            console.warn('[FCM] No se pudo obtener el token de Firebase.');
        }
    } catch (err) {
        console.error('[FCM] Error al registrar token FCM:', err);
    }
}

async function guardarConfigFirebaseAdmin() {
    const jsonInput = document.getElementById('firebaseConfigJson');
    const vapidInput = document.getElementById('firebaseVapidKey');
    const serverInput = document.getElementById('firebaseServerKey');
    const status = document.getElementById('firebaseConfigStatus');
    
    if (!jsonInput || !vapidInput) return;
    
    const rawJson = jsonInput.value.trim();
    const vapidKey = vapidInput.value.trim();
    const serverKey = serverInput.value.trim();
    
    if (!rawJson) {
        if (status) status.textContent = '⚠️ El JSON de configuración de Firebase es requerido.';
        return;
    }
    if (!vapidKey) {
        if (status) status.textContent = '⚠️ La Clave VAPID de Web Push es requerida.';
        return;
    }
    
    let parsedConfig = null;
    try {
        let text = rawJson.replace(/\xa0/g, ' ').trim();
        // Limpiar declaraciones si copiaron el código entero
        text = text.replace(/^(const|let|var)\s+\w+\s*=\s*/, '');
        text = text.replace(/;$/, '');
        // Parseo seguro: intentar JSON.parse después de normalizar claves sin comillas
        let jsonText = text;
        // Si parece un objeto JS (claves sin comillas), añadir comillas
        if (!/^\s*\{[\s\S]*\}\s*$/.test(jsonText)) {
            throw new Error('Configuración no es un objeto');
        }
        // claves sin comillas -> con comillas
        jsonText = jsonText.replace(/([\{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
        // comillas simples -> dobles (solo valores tipo string)
        jsonText = jsonText.replace(/'([^'\\]*)'/g, '"$1"');
        // Quitar comas finales antes de } o ]
        jsonText = jsonText.replace(/,(\s*[\}\]])/g, '$1');
        parsedConfig = JSON.parse(jsonText);
    } catch (e) {
        console.warn('[FCM] Falló parseo JSON, intentando fallback regex...', e);
    }
    
    // Fallback robusto con Regex si falló o si tiene URLs con enlaces Markdown de chats
    let fallbackUsed = false;
    if (!parsedConfig || typeof parsedConfig !== 'object' || !parsedConfig.projectId) {
        fallbackUsed = true;
        parsedConfig = {};
        const lines = rawJson.split('\n');
        for (const line of lines) {
            const cleanLine = line.replace(/\xa0/g, ' ').trim();
            // Buscar patron clave: "valor" o clave: 'valor' o clave: valor (sin comillas para números)
            const match = cleanLine.match(/(\w+)\s*:\s*["']?([^"',\s\}]+)["']?/);
            if (match) {
                const key = match[1];
                let val = match[2];
                // Limpiar enlaces de chat tipo [texto](url)
                if (val.includes('[') && val.includes(']')) {
                    const cleanMatch = val.match(/\[([^\]]+)\]/);
                    if (cleanMatch) val = cleanMatch[1];
                }
                parsedConfig[key] = val;
            }
        }
    }
    
    if (!parsedConfig || typeof parsedConfig !== 'object' || !parsedConfig.projectId) {
        if (status) {
            status.textContent = '❌ Error: Configuración inválida o falta el campo "projectId". Contenido parseado: ' + JSON.stringify(parsedConfig);
        }
        return;
    }
    
    // Guardar vapidKey dentro del objeto de configuración para consistencia
    parsedConfig.vapidKey = vapidKey;
    
    localStorage.setItem('firebaseConfig', JSON.stringify(parsedConfig));
    localStorage.setItem('firebaseVapidKey', vapidKey);
    if (serverKey) {
        localStorage.setItem('fcmServerKey', serverKey);
    } else {
        localStorage.removeItem('fcmServerKey');
    }
    
    if (status) status.textContent = '⏳ Guardando y subiendo a GitHub...';
    
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    
    if (!user || !repo || !token) {
        if (status) status.textContent = '⚠️ Guardado localmente en navegador. Para sincronizar globalmente con GitHub, configura tus credenciales arriba.';
        inicializarFirebaseFCMClient(parsedConfig);
        return;
    }
    
    try {
        const existing = await fetch(
            `https://raw.githubusercontent.com/${user}/${repo}/main/config.json?_=${Date.now()}`
        ).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        
        existing.firebaseConfig = parsedConfig;
        delete existing.fcmServerKey; // no subir server key a GitHub
        existing.actualizado = new Date().toISOString();
        
        await subirArchivoAGitHub(user, repo, token, 'config.json', existing);
        if (status) status.textContent = '✅ ¡Guardado y sincronizado con GitHub con éxito!';
        mostrarNotificacion('✅ Configuración de Firebase guardada y sincronizada.', 'success');
        inicializarFirebaseFCMClient(parsedConfig);
    } catch (e) {
        console.error(e);
        if (status) status.textContent = '❌ Error: ' + e.message;
    }
}

async function enviarPushManualAdmin() {
    const title = document.getElementById('manualPushTitle').value.trim();
    const body = document.getElementById('manualPushBody').value.trim();
    const url = document.getElementById('manualPushUrl').value.trim();
    const status = document.getElementById('manualPushStatus');
    
    if (!title || !body) {
        if (status) status.textContent = '⚠️ Título y cuerpo son requeridos.';
        return;
    }
    
    const serverKey = localStorage.getItem('fcmServerKey');
    const fbConfigRaw = localStorage.getItem('firebaseConfig');
    if (!serverKey || !fbConfigRaw) {
        if (status) status.textContent = '⚠️ Configura Firebase y guarda la Clave de Servidor primero.';
        return;
    }
    
    const fbConfig = JSON.parse(fbConfigRaw);
    const rtdbUrl = fbConfig.databaseURL || `https://${fbConfig.projectId}-default-rtdb.firebaseio.com`;
    
    if (status) status.textContent = '⏳ Buscando suscriptores en Firebase...';
    
    try {
        const res = await fetch(`${rtdbUrl}/tokens.json`);
        if (!res.ok) {
            if (status) status.textContent = '❌ No se pudo conectar a Realtime Database.';
            return;
        }
        
        const tokensData = await res.json();
        if (!tokensData) {
            if (status) status.textContent = '⚠️ No hay ningún suscriptor registrado todavía.';
            return;
        }
        
        // Mantener token y clave alineados para poder borrar exactamente el inválido.
        const tokenEntries = Object.entries(tokensData).filter(([k, t]) => t && t.token);
        const tokens = tokenEntries.map(([, t]) => t.token);
        const tokenKeys = tokenEntries.map(([k]) => k);
        if (tokens.length === 0) {
            if (status) status.textContent = '⚠️ No se encontraron tokens válidos.';
            return;
        }
        
        if (status) status.textContent = `⏳ Enviando a ${tokens.length} suscriptores...`;
        
        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${serverKey}`
            },
            body: JSON.stringify({
                registration_ids: tokens,
                notification: {
                    title: title,
                    body: body,
                    icon: '/iconos/icon-192.png',
                    click_action: window.location.origin + (url || '/')
                },
                data: {
                    url: url || '/'
                }
            })
        });
        
        if (response.ok) {
            const resData = await response.json();
            if (status) status.textContent = `✅ Enviado. Éxitos: ${resData.success || 0}, Fallos: ${resData.failure || 0}`;
            
            // Limpiar tokens obsoletos
            if (resData.results) {
                for (let i = 0; i < resData.results.length; i++) {
                    const result = resData.results[i];
                    if (result.error === 'NotRegistered' || result.error === 'InvalidRegistration') {
                        const tokenKey = tokenKeys[i];
                        if (tokenKey) fetch(`${rtdbUrl}/tokens/${tokenKey}.json`, { method: 'DELETE' }).catch(() => null);
                    }
                }
            }
        } else {
            if (status) status.textContent = `❌ Error en el envío FCM: ${response.status} ${response.statusText}`;
        }
    } catch (e) {
        console.error(e);
        if (status) status.textContent = '❌ Error de conexión o credenciales inválidas.';
    }
}

window.tmMonedaActual = () => _monedaActual;

// Expuesto para biometric-auth.js: otorga acceso sin re-prompt de contraseña
window.tmGrantAdminAccess = function () {
    usuarioAutenticado = true;
    cerrarLoginModal();
    abrirAdminPanel();
};

// Cargar tasa actualizada desde GitHub al iniciar
cargarTasaDesdeGitHub();

// Guardar tasa desde panel admin → localStorage + GitHub
async function guardarTasaMNAdmin() {
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
//  ⬆️ BOTÓN "SUBIR ARRIBA" flotante
//  Aparece tras hacer scroll hacia abajo. Al pulsar, sube suave.
// ═══════════════════════════════════════════════════════════
(function tmBotonSubirArriba() {
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
