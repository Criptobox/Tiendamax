/* ============================================================
   TiendaMax — módulo: tm-patches
   MONKEY-PATCHES: este archivo sobreescribe funciones definidas
   en otros módulos (tm-config, tm-product, tm-catalog, tm-state,
   tm-admin, tm-ui) para añadir tracking/analytics/gestión extra.

   ⚠️  ORDEN DE CARGA: DEBE cargarse DESPUÉS de todos los módulos
   que define. Si renombras una función original, actualiza su
   patch aquí también.

   Patrón usado en cada patch:
     if (typeof funcionX === 'function') {
       const _orig = funcionX;        // guarda referencia
       funcionX = function(...) {     // reemplaza
         _orig(...);                   // llama original
         // + lógica extra (analytics, tracking, etc.)
       };
     }
   ============================================================ */

if (typeof agregarAlCarrito === 'function') {
    const _origAgregarAlCarrito = agregarAlCarrito;
    agregarAlCarrito = function(id, cantidad, originEl) {
        _origAgregarAlCarrito(id, cantidad);
        if (originEl) requestAnimationFrame(() => flyToCart(originEl));
    };
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
    return tmParseObject(localStorage.getItem('vistasProd'));
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


// Parchar abrirDetalleProducto para registrar la vista real.
// El contador visual vive en #detailPersonasViendo (tm-product.src.js) —
// acá solo se incrementa el dato real en localStorage/Firebase que ese
// contador lee; no se pinta un segundo badge (evita el duplicado que
// aparecía junto a la categoría).
if (typeof abrirDetalleProducto === 'function') {
const _origAbrirDetalle = abrirDetalleProducto;
abrirDetalleProducto = function(id) {
    _origAbrirDetalle(id);
    registrarVistaProd(id);
};
} // end typeof abrirDetalleProducto guard


// Aquí se parcheaba renderizarVentas para meter el dashboard de ventas encima
// de #ventasContenido. Ni la una ni el otro existen: el panel real pinta las
// ventas en #ventas-lista / #ventas-kpis, con su propio código en admin.html.

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
        // Devolver lo que devuelva el original: ahora informa si la copia
        // local se pudo guardar (false cuando la cuota está llena), y quien
        // llama lo necesita para avisar bien.
        const ok = _origGuardarProd.apply(this, arguments);
        setTimeout(actualizarBadgeStockBajo, 50);
        return ok;
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
        : tmParseArray(localStorage.getItem('productos'));

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

    const btnShare = document.getElementById('btnCompartirWishlist');
    if (btnShare) btnShare.style.display = prods.length > 0 ? '' : 'none';

    if (prods.length === 0) {
        grid.style.display  = 'none';
        if (vacioEl) vacioEl.style.display = 'block';
    } else {
        if (vacioEl) vacioEl.style.display = 'none';
        grid.style.display = '';
        grid.innerHTML = '';
        // Reutiliza el mismo constructor de tarjeta que la grilla principal
        // (tm-ui.src.js, expuesto como window._tmCrearCard) para que "Mis Me
        // Gusta" se vea idéntico a las tarjetas nuevas, sin duplicar markup.
        prods.forEach(producto => {
            if (typeof window._tmCrearCard !== 'function') return;
            grid.appendChild(window._tmCrearCard(producto, { lazy: true }));
        });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function compartirWishlistWhatsApp() {
    const cat = (typeof productos !== 'undefined' && productos.length > 0)
        ? productos
        : tmParseArray(localStorage.getItem('productos'));
    const prods = (typeof wishlist !== 'undefined' ? wishlist : [])
        .map(wid => cat.find(p => String(p.id) === String(wid)))
        .filter(Boolean);
    if (prods.length === 0) return;
    let msg = '❤️ Mis productos favoritos:\n\n';
    prods.forEach((p, i) => {
        msg += (i + 1) + '. ' + p.nombre + ' — $' + Number(p.precioActual).toFixed(2) + ' USD\n';
    });
    msg += '\n¡Míralo todo en ' + window.location.origin + '!';
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
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
    const pedidos = tmParseArray(localStorage.getItem('pedidos_cliente_v1'));
    const total   = itemsCarrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const pedidoId = Date.now();
    const fechaStr = new Date().toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    pedidos.unshift({
        id:     pedidoId,
        fecha:  fechaStr,
        items:  itemsCarrito.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })),
        total:  total,
        estado: 'pendiente' // pendiente → confirmado → preparando → en_camino → entregado
    });
    localStorage.setItem('pedidos_cliente_v1', JSON.stringify(pedidos.slice(0, 50)));

    // Guardar en Firebase para seguimiento en tiempo real desde pedido.html
    (async () => {
        try {
            const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
            if (!base) return;
            await fetch(base + '/pedidos/' + pedidoId + '.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: pedidoId,
                    fecha: fechaStr,
                    items: itemsCarrito.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })),
                    total: total,
                    estado: 'pendiente',
                    clienteTs: Date.now(),
                    actualizado: Date.now()
                })
            });
        } catch(e) {}
    })();

    // Retornar el ID para que el mensaje de WhatsApp pueda incluir el link de seguimiento
    return pedidoId;
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

    const pedidos   = tmParseArray(localStorage.getItem('pedidos_cliente_v1'));
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
              <span class="pedido-fecha">📅 ${escapeHtml(p.fecha)}</span>
              <span class="pedido-total">$${p.total.toFixed(2)} USD</span>
            </div>
            <div class="pedido-items">
              ${p.items.map(i => `
                <div class="pedido-item">
                  <span class="pedido-item-nombre">${escapeHtml(i.nombre)}</span>
                  <span class="pedido-item-qty">×${i.cantidad}</span>
                  <span class="pedido-item-precio">$${(i.precio * i.cantidad).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
            <div class="pedido-card-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="pedido-btn-repetir" onclick="repetirPedido(${p.id})">🔄 Pedir de nuevo</button>
                <button class="pedido-btn-seguir" onclick="seguirPedido(${p.id})" style="background:linear-gradient(135deg,#E8501E,#ff6b35);color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">📦 Seguir pedido</button>
            </div>
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
    const pedidos = tmParseArray(localStorage.getItem('pedidos_cliente_v1'));
    const pedido  = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    pedido.items.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (p && p.stock > 0) agregarAlCarrito(item.id);
    });
    cerrarVistaPedidos();
    setTimeout(abrirCarrito, 300);
}

// Abrir página de seguimiento de pedido en tiempo real
function seguirPedido(pedidoId) {
    window.open('pedido.html?id=' + pedidoId, '_blank');
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
        try { local = tmParseArray(localStorage.getItem('productos')); } catch(e) {}
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
            // Igual que en tm-data: el stock cambiado aquí y aún sin publicar
            // no lo puede revivir una descarga de productos.json.
            if (typeof _tmConservarStockLocal === 'function') _tmConservarStockLocal(data);
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

// ══════════════════════════════════════════════════════════════
//  DEEP LINK de categoría — Abrir categoría directo desde /c/<slug>.html
//  Ejemplo: tiendamax.org/?categoria=ENERGIA
// ══════════════════════════════════════════════════════════════
function _procesarDeepLinkCategoria() {
    let cat = '';
    try {
        const u = new URL(window.location.href);
        cat = (u.searchParams.get('categoria') || '').trim();
    } catch(e) {}
    if (!cat) return;
    if (typeof categorias !== 'undefined' && Array.isArray(categorias) && categorias.length > 0) {
        const match = categorias.find(c => c.toLowerCase() === cat.toLowerCase());
        if (match && typeof mostrarVistaCategoria === 'function') mostrarVistaCategoria(match);
    } else if (typeof mostrarVistaCategoria === 'function') {
        // Categorías aún no cargadas: igual navegar, mostrarVistaCategoria
        // resuelve el nombre tal cual venga (coincide con productos.categoria).
        mostrarVistaCategoria(cat);
    }
}

window.addEventListener('hashchange', _procesarDeepLink);
window.addEventListener('popstate', _procesarDeepLink);
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_procesarDeepLinkCategoria, 150);
    if (!_tmGetDeepLinkProductId()) return;
    // No reabrir el producto en una RECARGA hecha por el usuario (ej: activar
    // "Sitio para PC", que recarga la página): el hash #producto- quedó de tu
    // propia navegación, no es un enlace nuevo → límpialo y no abras.
    // Los reloads que hace la app (Service Worker al actualizar) dejan la marca
    // tm_sw_reloading, así que esos SÍ reabren; un enlace compartido también.
    try {
        const nav = performance.getEntriesByType('navigation')[0];
        const swReload = sessionStorage.getItem('tm_sw_reloading');
        if (swReload) sessionStorage.removeItem('tm_sw_reloading');
        if (nav && nav.type === 'reload' && !swReload) {
            history.replaceState(null, '', location.pathname + location.search);
            return;
        }
    } catch (e) {}
    setTimeout(_procesarDeepLink, 100);
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

    async function _enviarNotifAhora() {
        // Verificar que aún hay carrito y no se envió ya
        const carritoActual = tmParse(localStorage.getItem('carrito_v2'), '{"items":[]}').items || [];
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

        _timer = setTimeout(_enviarNotifAhora, DELAY_MS);
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
            // Disparar en el tiempo que YA faltaba, no reiniciar el conteo completo
            // (si no, un usuario que vuelve a la 1h recibía la notif a las 3h).
            const restante = disparoGuardado - Date.now();
            _timer = setTimeout(_enviarNotifAhora, restante);
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
        // No mostrar el prompt de "avisos de ofertas" (pensado para clientes) dentro del panel admin
        if (document.getElementById('adminPanel')) return;

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
        const titulo  = estaDenegado ? 'Notificaciones bloqueadas' : '¿Quieres avisos de ofertas?';
        const cuerpo  = estaDenegado
            ? 'Para reactivarlas: tres puntos del navegador → Ajustes → Notificaciones → Permitir'
            : 'Te avisamos cuando bajen los precios o lleguen productos nuevos. Sin spam.';
        // El texto se inserta escapado; el ícono se concatena aparte como SVG.
        const btnTexto = estaDenegado ? 'Cómo activarlas' : 'Avísame';
        const btnIco   = estaDenegado ? '' : (typeof tmIcoUI === 'function' ? tmIcoUI('🔔') + ' ' : '');
        const bellIco  = (typeof tmIcoUI === 'function') ? tmIcoUI('🔔') : '🔔';

        const b = document.createElement('div');
        b.id = 'tm-push-banner-wrap';
        try { document.body.classList.add('tm-push-banner-visible'); } catch (e) {}
        b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 20px);z-index:2000;width:min(92vw,380px);max-width:380px';
        // El banner solo lleva estilos estructurales inline (layout, tipografía,
        // animación). Los colores se aplican via CSS inyectado una sola vez,
        // con reglas distintas para body.light-mode y body:not(.light-mode),
        // para que respete el tema activo en vez de hardcoded oscuro.
        b.innerHTML = `<div id="tm-push-banner" style="border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:13px;font-family:sans-serif;animation:slideUpBanner .35s cubic-bezier(.22,1,.36,1)"><span class="tmpb-bell" style="flex-shrink:0">${bellIco}</span><div style="flex:1;min-width:0"><div class="tmpb-title" style="font-weight:800;font-size:14px;margin-bottom:2px">${escapeHtml(titulo)}</div><div class="tmpb-body" style="font-size:12px;line-height:1.35">${escapeHtml(cuerpo)}</div></div><div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0"><button id="tm-push-si" style="border:none;border-radius:10px;padding:8px 13px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">${btnIco}${escapeHtml(btnTexto)}</button><button id="tm-push-no" style="background:none;border:none;font-size:11px;cursor:pointer;text-align:center">Ahora no</button></div></div>`;
        if (!document.getElementById('slideUpBannerStyle')) {
            const s = document.createElement('style');
            s.id = 'slideUpBannerStyle';
            s.textContent = `
@keyframes slideUpBanner{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
/* El cartel de notificaciones ocupa 92vw centrado abajo y tapaba la burbuja
   del bot, que vive en bottom:20px/right:16px. Mientras esté visible, la
   burbuja (y su globo de bienvenida) suben por encima. El selector lleva
   body delante para ganarle en especificidad al estilo que inyecta tm-bot. */
/* --tm-push-h NO es el alto del cartel: es lo que ocupa desde el borde
   inferior de la pantalla (su alto más lo que esté separado del borde). Se
   mide así porque el cartel no siempre se apoya donde dice su CSS —- otras
   reglas lo suben—- y cualquier número fijo fallaba en alguna combinación. */
body.tm-push-banner-visible .tm-bot-bubble{bottom:calc(var(--tm-push-h,140px) + 16px) !important}
body.tm-push-banner-visible .tm-bot-welcome{bottom:calc(var(--tm-push-h,140px) + 80px) !important}
@keyframes tmpbRing{0%,70%,100%{transform:rotate(0)}75%{transform:rotate(14deg)}80%{transform:rotate(-12deg)}85%{transform:rotate(8deg)}90%{transform:rotate(-5deg)}95%{transform:rotate(0)}}
.tmpb-bell{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:23px;transform-origin:50% 15%;animation:tmpbRing 3s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.tmpb-bell{animation:none}}
/* Los dos temas van en coral, el color de la marca. El oscuro estaba en dorado
   y desentonaba con el resto del sitio; ahora es el mismo cartel en dos fondos.
   Los tonos concretos salen de comprobar el contraste, no del gusto: el título
   coral claro del modo claro (#E8501E) daba 3.75:1 sobre blanco y el botón
   otro tanto — por debajo del 4.5:1 que pide AA para este tamaño de letra. */
body:not(.light-mode) #tm-push-banner{background:radial-gradient(300px 120px at 12% -20%,rgba(255,138,71,.15),transparent 60%),linear-gradient(160deg,#241d16,#1B1512) !important;border:1.5px solid rgba(255,138,71,.45) !important;box-shadow:0 16px 42px rgba(0,0,0,.6),0 0 0 1px rgba(255,138,71,.07) inset !important}
body:not(.light-mode) .tmpb-bell{background:radial-gradient(circle at 50% 35%,rgba(255,138,71,.38),rgba(210,78,15,.12) 70%);border:1px solid rgba(255,138,71,.5);box-shadow:0 0 18px -2px rgba(255,106,31,.5)}
body:not(.light-mode) .tmpb-title{color:#FF8A47 !important}   /* 7.11:1 */
body:not(.light-mode) .tmpb-body{color:#CFC5BC !important}    /* 9.80:1 */
body:not(.light-mode) #tm-push-si{background:linear-gradient(135deg,#C74A0E,#A33A08) !important;color:#FFFFFF !important;box-shadow:0 8px 20px -6px rgba(199,74,14,.6) !important}
body:not(.light-mode) #tm-push-si:hover{filter:brightness(1.12);transform:translateY(-1px)}
body:not(.light-mode) #tm-push-no{color:#9C9088 !important}
body:not(.light-mode) #tm-push-no:hover{color:#FFFFFF !important}
/* Modo claro: mismo cartel sobre blanco */
body.light-mode #tm-push-banner{background:radial-gradient(300px 120px at 12% -20%,rgba(255,106,31,.1),transparent 60%),#FFFFFF !important;border:1.5px solid rgba(210,78,15,.5) !important;box-shadow:0 12px 34px rgba(210,78,15,.16),0 2px 8px rgba(0,0,0,.06) !important}
body.light-mode .tmpb-bell{background:radial-gradient(circle at 50% 35%,rgba(255,106,31,.22),rgba(210,78,15,.06) 70%);border:1px solid rgba(255,106,31,.4);box-shadow:0 0 16px -3px rgba(255,106,31,.4)}
body.light-mode .tmpb-title{color:#C0410A !important}         /* 5.25:1 */
body.light-mode .tmpb-body{color:#4A4A4A !important}          /* 8.86:1 */
body.light-mode #tm-push-si{background:linear-gradient(135deg,#C74A0E,#A33A08) !important;color:#FFFFFF !important;box-shadow:0 6px 16px -4px rgba(199,74,14,.35) !important}
body.light-mode #tm-push-si:hover{filter:brightness(1.08);transform:translateY(-1px)}
body.light-mode #tm-push-no{color:#6B6B7A !important}
body.light-mode #tm-push-no:hover{color:#1A1A1A !important}
/* Móvil: banner más compacto */
@media (max-width:768px){#tm-push-banner{padding:12px 13px !important;gap:11px !important}.tmpb-bell{width:40px;height:40px;font-size:21px}.tmpb-title{font-size:13px !important}.tmpb-body{font-size:11px !important;line-height:1.3 !important}#tm-push-si{padding:7px 11px !important;font-size:11px !important}#tm-push-no{font-size:10px !important}}
`;
            document.head.appendChild(s);
        }
        document.body.appendChild(b);
        // El desplazamiento de la burbuja era un número fijo (116px) calculado
        // para el cartel de dos líneas. El de "notificaciones bloqueadas" tiene
        // tres y seguía tapando el botón. Ahora se sigue el alto REAL: medirlo
        // una sola vez tampoco basta, porque el texto todavía se está ajustando
        // y sale más bajo de lo que acaba siendo.
        const _medir = () => {
            try {
                const r = b.getBoundingClientRect();
                // Desde el borde inferior de la pantalla hasta el techo del
                // cartel: es justo lo que la burbuja tiene que salvar.
                const usado = window.innerHeight - r.top;
                if (usado > 0) document.documentElement.style.setProperty('--tm-push-h', Math.round(usado) + 'px');
            } catch (e) {}
        };
        _medir();
        requestAnimationFrame(_medir);
        try { new ResizeObserver(_medir).observe(b); } catch (e) { setTimeout(_medir, 400); }
        window.addEventListener('resize', _medir);

        document.getElementById('tm-push-si').onclick = async () => {
            b.remove();
            try { document.body.classList.remove('tm-push-banner-visible'); } catch (e) {}
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
                // 3. Esperar a que el token se guarde y mostrar resultado.
                //    Tener el token de FCM no es estar suscrito: hace falta que
                //    la entrada haya entrado en /tokens, o el servidor no sabrá
                //    a quién mandarle nada.
                await new Promise(r => setTimeout(r, 1500));
                const token = localStorage.getItem('fcmToken') &&
                    (typeof tmPushRegistrado !== 'function' || tmPushRegistrado());
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
            try { document.body.classList.remove('tm-push-banner-visible'); } catch (e) {}
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
//  Margen configurable (margenMN) sobre la tasa base de elTOQUE.
//  margenMN = 0  →  el cliente ve la tasa real de elTOQUE, sin nada encima.
//  Si no está configurado aún, por defecto +10 (comportamiento previo).
// ═══════════════════════════════════════════════════════
// _monedaActual ya está declarada al inicio del archivo

function getMargenMN() {
    const m = parseFloat(localStorage.getItem('margenMN'));
    return isNaN(m) ? 10 : m;   // 0 se respeta; solo cae a 10 si nunca se configuró
}

function getTasaMN() {
    const base = parseFloat(localStorage.getItem('tasaMN') || '0');
    return base > 0 ? base + getMargenMN() : 0;
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
        existing.margenMN    = getMargenMN();
        // Sin esto, el número de WhatsApp que el admin cambia solo quedaba en su
        // propio localStorage: ningún cliente real lo recibía, para siempre,
        // sin ningún error visible — todos los pedidos seguían yendo al número
        // hardcodeado de fallback.
        const _wa = localStorage.getItem('whatsappNumero');
        if (_wa) existing.whatsappNumero = _wa;
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
            // Cargar margen MN (puede ser 0). Solo si viene definido en config.
            if (cfg.margenMN !== undefined && cfg.margenMN !== null && cfg.margenMN !== '' && !isNaN(parseFloat(cfg.margenMN))) {
                localStorage.setItem('margenMN', String(parseFloat(cfg.margenMN)));
            }
            // Cargar tasa MN
            if (cfg.tasaMN && parseFloat(cfg.tasaMN) > 0) {
                localStorage.setItem('tasaMN', String(cfg.tasaMN));
                if (_monedaActual === 'MN') actualizarPreciosMostrados();
                if (typeof actualizarBurbujaTasa === 'function') actualizarBurbujaTasa();
            }
            // Cargar número de WhatsApp publicado por el admin (ver guardarTasaEnGitHub)
            if (cfg.whatsappNumero) {
                const _waNum = String(cfg.whatsappNumero).replace(/\D/g, '');
                if (_waNum && _waNum.length >= 6) {
                    localStorage.setItem('whatsappNumero', _waNum);
                    localStorage.setItem('whatsappNumber', _waNum);
                }
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

    // Actualizar UI del panel admin si está abierto
    const tasa = parseFloat(localStorage.getItem('tasaMN') || '0');
    const inputA = document.getElementById('adminTasaMN');
    if (inputA && tasa > 0 && !inputA.matches(':focus')) inputA.value = tasa;
    const inputM = document.getElementById('adminMargenMN');
    if (inputM && !inputM.matches(':focus')) inputM.value = getMargenMN();
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

/* ── Productos con precio en moneda nacional ─────────────────────────────
   El sitio nació asumiendo que TODO precio es USD y que MN es una conversión
   con la tasa de elTOQUE. Pero hay productos que se venden solo en MN a un
   precio fijo: convertirlos sería hacer que su precio cambie solo cada vez que
   se mueve la tasa, que es justo lo contrario de lo que quiere el vendedor.

   Un producto marcado `moneda:'MN'` lleva su precio TAL CUAL, y el conmutador
   USD/MN de la tienda no lo toca. Los que no traen el campo —los 128 de
   siempre— siguen funcionando exactamente igual que antes. */
function tmEsMN(p) {
    return !!(p && p.moneda === 'MN');
}

function tmMoneda(p) {
    return tmEsMN(p) ? 'MN' : 'USD';
}

/* El precio de un producto en SU moneda, ya formateado. */
function tmPrecioTexto(p, valor) {
    const n = Number(valor != null ? valor : (p && p.precioActual) || 0);
    if (tmEsMN(p)) return '$' + Math.round(n).toLocaleString('es-CU') + ' MN';
    return formatPrecio(n);
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
    // data-mn marca un precio que YA está en moneda nacional y es fijo: el
    // conmutador USD/MN no puede reescribirlo ni convertirlo.
    document.querySelectorAll('[data-precio-usd]:not([data-mn])').forEach(el => {
        const usd = parseFloat(el.getAttribute('data-precio-usd'));
        el.textContent = formatPrecio(usd);
    });
    // Re-renderizar si es necesario
    const grid = document.getElementById('productosGrid');
    if (grid && grid.children.length > 0) {
        grid.querySelectorAll('.precio-actual:not([data-mn])').forEach(el => {
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

            // Este camino no se ejecuta: push-fix.js sustituye por completo
            // tmRegistrarTokenFCMSiPermitido e inicializarFirebaseFCMClient, que son
            // sus dos únicas puertas. Se mantiene al día igualmente porque es lo que
            // corre si ese archivo alguna vez no carga, y porque una copia que
            // todavía leyera /tokens entero se llevaría un 403 en cuanto la lista
            // deje de ser pública, sin decir nada.
            //
            // Se borra la clave vieja a ciegas en vez de listarlo todo, y se escribe
            // sobre la propia: el PUT pisa lo que hubiera.
            if (legacyTokenId !== tokenId) {
                await fetch(`${rtdbUrl}/tokens/${legacyTokenId}.json`, { method: 'DELETE' }).catch(() => null);
            }
            // Y la propia antes de escribirla: la regla no deja cambiar el token
            // de una entrada existente, así que sin esto la rotación de token de
            // FCM se quedaba fuera en silencio.
            await fetch(`${rtdbUrl}/tokens/${tokenId}.json`, { method: 'DELETE' }).catch(() => null);

            await fetch(`${rtdbUrl}/tokens/${tokenId}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    // Hora del SERVIDOR, como en push-fix.js: la regla exige que
                    // caiga a ±15 min de `now` y un móvil con el reloj torcido
                    // se quedaba fuera sin enterarse.
                    timestamp: { '.sv': 'timestamp' },
                    // Recortado como en push-fix.js: el userAgent entero identifica
                    // al cliente mucho más de lo que hace falta.
                    userAgent: String(navigator.userAgent || '').slice(0, 40),
                    fingerprint: fingerprint,
                    deviceId: tokenId
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


window.tmMonedaActual = () => _monedaActual;

// Expuesto para biometric-auth.js: otorga acceso sin re-prompt de contraseña

// ══════════════════════════════════════════════════════════════
//  CONTADOR DE VISITAS — 1 por sesión de navegador, solo en la
//  TIENDA (el admin no cuenta). Usa el increment atómico de RTDB
//  ({".sv":{"increment":1}}) para no pisar valores concurrentes.
//  El admin lo muestra en Analytics como "Visitas a la web".
// ══════════════════════════════════════════════════════════════
(function tmContarVisita() {
    if (document.getElementById('adminPanel')) return; // admin: no contar
    // Tampoco contar al DUEÑO navegando su propia tienda: la tienda y el admin
    // comparten localStorage (mismo dominio), así que si este dispositivo tiene
    // marcas de haber usado el admin, no cuenta como visita de cliente.
    try {
        if (localStorage.getItem('tm_auth_hash_v3') ||
            localStorage.getItem('githubToken') ||
            localStorage.getItem('tm_es_admin')) return;
    } catch (e) {}
    try {
        if (sessionStorage.getItem('tm_visita_contada')) return;
    } catch (e) { return; }

    /* La marca de "ya contada" se pone AL FINAL, cuando el conteo se hizo.
       Ponerla al entrar —como estaba— hacía que un visitante nuevo no se
       contara NUNCA: al instalarse el service worker toma el control y la
       página se RECARGA sola (el controllerchange de index.html) uno o dos
       segundos después de abrir, o sea antes de que venciera este temporizador.
       La segunda carga veía la marca ya puesta y se iba sin contar nada. Y como
       cada despliegue cambia el sw.js, eso le pasaba a casi todos.

       Se espera un poco igualmente para no competir con la carga y para no
       contar al que rebota al instante, pero menos: dos segundos y medio caben
       antes de esa recarga en la mayoría de los casos, y si no caben, ahora ya
       no importa. */
    setTimeout(async () => {
        try {
            if (sessionStorage.getItem('tm_visita_contada')) return;  // otra pestaña se adelantó
            const url = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
            if (!url) return;
            const hoy = new Date().toISOString().slice(0, 10);
            const okTotal = await _tmSumarUno(url + '/analytics/visitas/count.json');
            await _tmSumarUno(url + '/analytics/visitas/dias/' + hoy + '.json');
            if (okTotal) {
                try { sessionStorage.setItem('tm_visita_contada', '1'); } catch (e) {}
            }
        } catch (e) {}
    }, 2500);
})();

/* Suma uno a un contador de Firebase.

   Primero con el incremento del servidor, que es atómico y no pierde visitas
   simultáneas. Si la regla lo rechaza, se cae a leer-y-escribir: la regla dice
   `newData.val() == data.val() + 1` y un número cumple eso sin discusión. Dos
   visitas en el mismo instante pueden perder una por ahí, pero perder alguna
   es infinitamente mejor que un contador clavado, que es lo que había. */
async function _tmSumarUno(url) {
    try {
        const inc = JSON.stringify({ '.sv': { 'increment': 1 } });
        const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: inc });
        if (r.ok) return true;
        if (r.status !== 401 && r.status !== 403) return false;
        const actual = await fetch(url).then(x => x.ok ? x.json() : null).catch(() => null);
        const n = Number(actual) || 0;
        const r2 = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n + 1) });
        return r2.ok;
    } catch (e) { return false; }
}
