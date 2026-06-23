/* ============================================================
   TiendaMax — módulo: tm-ui
   Fast categories, patches, fix subcategorías, premium upgrade pack
   Extraído de script.src.js (L5075–L6776, 1702 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== FAST CATEGORIES - render from localStorage immediately =====
// Patch renderizarCategoriasHome for performance 
// (already called from cargarDatosDesdeGitHub, but we want instant local render too)
function renderizarCategoriasHomeInstant() {
    // Load from localStorage immediately (no network wait)
    const localProds = tmParse(localStorage.getItem('productos'), null) || [];
    const localCats = tmParse(localStorage.getItem('categorias'), null) || [];
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
        const _dn = { 'WIFI': 'REDES' };
        card.innerHTML = `${badge}<span class="cat-wm">${icon}</span><span class="cat-icon">${icon}</span><span class="cat-name">${_dn[cat] || cat}</span><span class="cat-count">${count === 0 ? '🕐 Próximamente' : count + ' producto' + (count !== 1 ? 's' : '')}</span>${cta}`;
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
                const fresh = tmParse(localStorage.getItem('subcategorias'), null);
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

let _filtroFavoritos = false;

function tmToggleFiltroFavoritos() {
    _filtroFavoritos = !_filtroFavoritos;
    const btn = document.getElementById('btnFiltroFavoritos');
    if (btn) {
        btn.style.background = _filtroFavoritos ? 'rgba(201,169,110,.55)' : 'rgba(201,169,110,.12)';
        btn.style.color      = _filtroFavoritos ? '#fff' : '#c9a96e';
        btn.style.borderColor= _filtroFavoritos ? '#c9a96e' : 'rgba(201,169,110,.3)';
    }
    actualizarListaProductos();
}

let _tmBulkSelected = new Set();

function tmBulkToggle(id, checked) {
    if (checked) _tmBulkSelected.add(id);
    else _tmBulkSelected.delete(id);
    const tb = document.getElementById('tmBulkToolbar');
    const cnt = document.getElementById('tmBulkCount');
    if (tb) tb.style.display = _tmBulkSelected.size > 0 ? 'flex' : 'none';
    if (cnt) cnt.textContent = _tmBulkSelected.size + ' seleccionado' + (_tmBulkSelected.size !== 1 ? 's' : '');
}
function tmBulkClear() {
    _tmBulkSelected.clear();
    document.querySelectorAll('.tm-bulk-check').forEach(cb => { cb.checked = false; });
    const tb = document.getElementById('tmBulkToolbar');
    if (tb) tb.style.display = 'none';
}
function tmBulkSetPrecio() {
    if (_tmBulkSelected.size === 0) return;
    const val = prompt('Nuevo precio (USD) para los ' + _tmBulkSelected.size + ' productos seleccionados:');
    if (val === null) return;
    const precio = parseFloat(val);
    if (isNaN(precio) || precio < 0) { mostrarNotificacion('⚠️ Precio inválido', 'error'); return; }
    _tmBulkSelected.forEach(id => {
        const p = productos.find(x => x.id === id);
        if (p) p.precioActual = precio;
    });
    const nPrecio = _tmBulkSelected.size;
    guardarProductos();
    _tmBulkSelected.forEach(id => marcarProductoModificado(id));
    sincronizarConGitHub();
    tmBulkClear();
    actualizarListaProductos();
    mostrarNotificacion('✅ Precio actualizado en ' + nPrecio + ' productos');
}
function tmBulkSetStock() {
    if (_tmBulkSelected.size === 0) return;
    const val = prompt('Nuevo stock para los ' + _tmBulkSelected.size + ' productos seleccionados:');
    if (val === null) return;
    const stock = parseInt(val);
    if (isNaN(stock) || stock < 0) { mostrarNotificacion('⚠️ Stock inválido', 'error'); return; }
    _tmBulkSelected.forEach(id => {
        const p = productos.find(x => x.id === id);
        if (p) p.stock = stock;
    });
    guardarProductos();
    _tmBulkSelected.forEach(id => marcarProductoModificado(id));
    sincronizarConGitHub();
    const n = _tmBulkSelected.size;
    tmBulkClear();
    actualizarListaProductos();
    mostrarNotificacion('✅ Stock actualizado en ' + n + ' productos');
}
function tmBulkEliminar() {
    if (_tmBulkSelected.size === 0) return;
    if (!confirm('¿Eliminar ' + _tmBulkSelected.size + ' producto(s) seleccionados? Esta acción no se puede deshacer.')) return;
    _tmBulkSelected.forEach(id => {
        const idx = productos.findIndex(x => x.id === id);
        if (idx !== -1) productos.splice(idx, 1);
    });
    guardarProductos();
    sincronizarConGitHub();
    const n = _tmBulkSelected.size;
    tmBulkClear();
    actualizarListaProductos();
    mostrarNotificacion('🗑️ ' + n + ' producto(s) eliminados');
}

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
        const matchFav  = !_filtroFavoritos || p.masVendido;
        return matchBusq && matchCat && matchFav;
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

    const _bulkCount = _tmBulkSelected.size;
    let html = `<div id="tmBulkToolbar" style="display:${_bulkCount > 0 ? 'flex' : 'none'};position:sticky;top:0;z-index:10;padding:10px 14px;background:rgba(10,10,10,0.97);border:1px solid rgba(201,169,110,.4);border-radius:10px;margin-bottom:10px;align-items:center;gap:8px;flex-wrap:wrap">
        <span id="tmBulkCount" style="font-size:13px;font-weight:700;color:#c9a96e;flex:1">${_bulkCount} seleccionado${_bulkCount !== 1 ? 's' : ''}</span>
        <button type="button" onclick="tmBulkSetPrecio()" style="padding:6px 12px;background:rgba(52,152,219,.2);border:1px solid rgba(52,152,219,.4);color:#3498db;border-radius:8px;font-size:12px;cursor:pointer">💰 Precio</button>
        <button type="button" onclick="tmBulkSetStock()" style="padding:6px 12px;background:rgba(39,174,96,.2);border:1px solid rgba(39,174,96,.4);color:#27ae60;border-radius:8px;font-size:12px;cursor:pointer">📦 Stock</button>
        <button type="button" onclick="tmBulkEliminar()" style="padding:6px 12px;background:rgba(231,76,60,.2);border:1px solid rgba(231,76,60,.4);color:#e74c3c;border-radius:8px;font-size:12px;cursor:pointer">🗑️ Eliminar</button>
        <button type="button" onclick="tmBulkClear()" style="padding:6px 12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#aaa;border-radius:8px;font-size:12px;cursor:pointer">✕ Cancelar</button>
    </div>
    <div style="margin-bottom:14px;padding:12px 16px;background:rgba(39,174,96,0.1);border:1px dashed #27AE60;border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
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
                    <input type="checkbox" class="tm-bulk-check" data-id="${_id}" onchange="tmBulkToggle(${_id},this.checked)" ${_tmBulkSelected.has(_id) ? 'checked' : ''} style="width:16px;height:16px;accent-color:#c9a96e;cursor:pointer;flex-shrink:0;margin-right:4px">
                    <img src="${_im}" alt="" loading="lazy" decoding="async" class="tm-prod-thumb" onerror="this.src='/iconos/favicon-192.png';this.style.opacity='0.3'">
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
            </div>`;
        });

        html += `</div></div>`;
    });

    productsList.innerHTML = html;
}

// ── Ajustar stock desde gestionar ──────────────────
// Si el producto que se agota es el de la Oferta del Día, la desactiva automáticamente
function _quitarOfertaSiAgotado(id) {
    try {
        const ofId = localStorage.getItem('ofertaDiaId');
        if (ofId && String(ofId) === String(id) && typeof desactivarOfertaDia === 'function') {
            desactivarOfertaDia();
            mostrarNotificacion('🔕 Oferta del Día desactivada automáticamente (producto agotado)', 'info');
        }
    } catch(e) {}
}

function fijarStockCero(id) {
    const p = productos.find(p => p.id === id);
    if (!p || p.stock === 0) return;
    p.stock = 0;
    guardarProductos();
    marcarProductoModificado(id);
    actualizarListaProductos();
    mostrarNotificacion(`🔴 ${p.nombre}: marcado como agotado`, 'warning');
    _quitarOfertaSiAgotado(id);
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

async function _procesarAvisosStock(productId, nombre) {
    try {
        const fbCfgRaw = localStorage.getItem('firebaseConfig');
        if (!fbCfgRaw) return;
        const fbCfg = JSON.parse(fbCfgRaw);
        const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
        const res = await fetch(rtdbUrl + '/avisos_stock/' + productId + '.json');
        if (!res.ok) return;
        const avisos = await res.json();
        if (!avisos || typeof avisos !== 'object') return;
        const n = Object.keys(avisos).length;
        if (n === 0) return;
        const reqId = 'req_aviso_' + Date.now();
        const putRes = await fetch(rtdbUrl + '/admin_push_requests/' + reqId + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '✅ ¡' + nombre + ' está de vuelta!', body: 'El producto que querías ya está disponible. ¡No te quedes sin él!', url: '/', ts: Date.now() })
        });
        if (!putRes.ok) return;
        await fetch(rtdbUrl + '/avisos_stock/' + productId + '.json', { method: 'DELETE' });
        const ghUser  = localStorage.getItem('githubUser');
        const ghRepo  = localStorage.getItem('githubRepo') || 'Tiendamax';
        const ghToken = localStorage.getItem('githubToken');
        if (ghUser && ghToken) {
            fetch('https://api.github.com/repos/' + ghUser + '/' + ghRepo + '/actions/workflows/flush-push-queue.yml/dispatches', {
                method: 'POST',
                headers: { 'Authorization': 'token ' + ghToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ref: 'main' })
            }).catch(() => {});
        }
        mostrarNotificacion('📣 ' + n + ' aviso' + (n > 1 ? 's' : '') + ' enviado' + (n > 1 ? 's' : '') + ': ' + nombre + ' vuelve al stock', 'success');
    } catch(e) { console.warn('[_procesarAvisosStock]', e); }
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
    if (p.stock === 0) _quitarOfertaSiAgotado(id);
    if (antes === 0 && p.stock > 0) _procesarAvisosStock(id, p.nombre);
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

// Semilla de reseñas reales en Firebase — solo para arrancar la tienda
async function tmSeedResenas() {
    const btn = document.querySelector('[onclick="tmSeedResenas()"]');
    const setBtnState = (txt, disabled) => { if (btn) { btn.textContent = txt; btn.disabled = disabled; } };

    setBtnState('⏳ Publicando reseñas…', true);
    mostrarNotificacion('⏳ Conectando con Firebase…', 'info');

    const base = _fbRtdbUrl();
    if (!base) {
        mostrarNotificacion('❌ Firebase no configurado. Guarda tu firebaseConfig primero.', 'error');
        setBtnState('⭐ Publicar reseñas iniciales (10)', false);
        return;
    }

    // Verificar si ya hay reseñas para no duplicar
    try {
        const check = await fetch(base + '/resenas.json?shallow=true');
        if (check.ok) {
            const existing = await check.json();
            if (existing && Object.keys(existing).length >= 5) {
                mostrarNotificacion('⚠️ Ya hay reseñas en Firebase. Bórralas primero si quieres regenerar.', 'info');
                setBtnState('⭐ Publicar reseñas iniciales (10)', false);
                return;
            }
        }
    } catch(e) {}

    const prods = (Array.isArray(window.productos) ? window.productos : [])
        .filter(p => Number(p.stock || 0) > 0 && p.nombre && p.id);

    if (prods.length < 3) {
        mostrarNotificacion('❌ No hay suficientes productos con stock para generar reseñas', 'error');
        setBtnState('⭐ Publicar reseñas iniciales (10)', false);
        return;
    }

    mostrarNotificacion(`⏳ Publicando reseñas en ${Math.min(10, prods.length)} productos…`, 'info');

    // Detecta el tipo de producto por palabras clave en el nombre y devuelve reseñas específicas
    function _resenasParaProducto(nombre) {
        const n = nombre.toUpperCase();
        if (/ROUTER|ENRUTADOR|WIFI|WI-FI|REPETIDOR|KUWFI|WAVLINK/.test(n)) return [
            { texto: 'La señal WiFi cubre toda la casa sin problemas. Antes tenía zonas muertas y ahora se conecta todo perfectamente.', estrellas: 5 },
            { texto: 'La velocidad de internet mejoró bastante con este router. La configuración fue sencilla y la señal llega a todos los cuartos.', estrellas: 5 },
            { texto: 'Buen router, la cobertura WiFi es estable y no se cae la conexión. Mejor de lo que esperaba por el precio.', estrellas: 4 },
            { texto: 'El WiFi llega bien a toda la vivienda. Solo me costó un poco configurarlo pero ya funciona excelente.', estrellas: 4 },
            { texto: 'Cubre bien el área, aunque en los extremos de la casa la señal baja un poco. En general cumple su función.', estrellas: 3 },
        ];
        if (/BATERÍA|BATERIA|LIFEPO|LUBRIM/.test(n)) return [
            { texto: 'La batería aguanta muy bien las cargas. Ya lleva varios ciclos y mantiene la misma capacidad. Muy satisfecho.', estrellas: 5 },
            { texto: 'Excelente batería, carga rápido y dura bastante tiempo. Vale cada centavo que cuesta.', estrellas: 5 },
            { texto: 'Buena batería, cumple con la capacidad anunciada. La instalé en el sistema solar y funciona perfecto.', estrellas: 4 },
            { texto: 'Lleva meses funcionando sin problemas. La capacidad se mantiene bien y no se calienta.', estrellas: 4 },
            { texto: 'Funciona bien aunque me tardó en llegar. La capacidad es la correcta y la instalación fue fácil.', estrellas: 3 },
        ];
        if (/INVERSOR|INVERTER/.test(n)) return [
            { texto: 'El inversor convierte perfectamente, la onda sinusoidal es limpia y no afecta los electrodomésticos. Muy bueno.', estrellas: 5 },
            { texto: 'Lleva tiempo trabajando con el inversor y no ha dado problemas. El voltaje sale estable y no calienta en exceso.', estrellas: 5 },
            { texto: 'Buen inversor, soporta bien la carga que le pongo. La instalación fue sencilla siguiendo el manual.', estrellas: 4 },
            { texto: 'Funciona correctamente, la onda es limpia y los equipos trabajan bien conectados. Lo recomiendo.', estrellas: 4 },
            { texto: 'Cumple su función aunque el ventilador hace algo de ruido. En potencia y voltaje no hay queja.', estrellas: 3 },
        ];
        if (/CONTROLADOR|MPPT|SOLAR/.test(n)) return [
            { texto: 'El controlador MPPT aprovecha muy bien la energía solar. Los paneles cargan más rápido que con el anterior.', estrellas: 5 },
            { texto: 'Excelente controlador, la pantalla muestra todo el estado del sistema. La carga de las baterías es eficiente.', estrellas: 5 },
            { texto: 'Buen regulador solar, la configuración fue sencilla y ya lleva meses funcionando sin fallos.', estrellas: 4 },
            { texto: 'Funciona bien con mis paneles solares. La carga es estable y protege bien las baterías.', estrellas: 4 },
            { texto: 'Cumple con su función. La pantalla es pequeña pero muestra los datos necesarios.', estrellas: 3 },
        ];
        if (/CARGADOR/.test(n)) return [
            { texto: 'El cargador funciona perfecto, carga rápido y tiene protección contra sobrecarga. Muy contento.', estrellas: 5 },
            { texto: 'Excelente cargador inteligente, detecta el estado de la batería y ajusta la carga automáticamente.', estrellas: 5 },
            { texto: 'Buen cargador, hace su trabajo sin complicaciones. Llegó bien empacado y en perfectas condiciones.', estrellas: 4 },
            { texto: 'Carga bien las baterías y tiene indicador de estado. Cumple con lo que promete.', estrellas: 4 },
            { texto: 'Funciona correctamente. La carga es algo lenta pero es segura y protege las baterías.', estrellas: 3 },
        ];
        if (/SWITCH|PUERTO/.test(n)) return [
            { texto: 'El switch funciona perfecto, velocidad gigabit real y sin pérdida de paquetes. Lo recomiendo.', estrellas: 5 },
            { texto: 'Excelente switch, todos los puertos funcionan bien y la transferencia de datos es rápida y estable.', estrellas: 5 },
            { texto: 'Buen switch para el precio. Sin complicaciones, se conecta y funciona al instante.', estrellas: 4 },
            { texto: 'Funciona bien, los 8 puertos operan correctamente. Sin problemas de conexión.', estrellas: 4 },
            { texto: 'Cumple su función aunque la carcasa es algo básica. En conectividad no hay queja.', estrellas: 3 },
        ];
        if (/PESA|BÁSCULA|BASCULA|BALANZA/.test(n)) return [
            { texto: 'La báscula es muy precisa, he comparado con otras y da el mismo peso exacto. Muy práctica para el hogar.', estrellas: 5 },
            { texto: 'Excelente báscula, conecta bien con el celular y registra el historial de peso. Muy útil.', estrellas: 5 },
            { texto: 'Buena pesa, funciona bien y la pantalla se lee fácilmente. El diseño es compacto y moderno.', estrellas: 4 },
            { texto: 'Pesa con precisión, fácil de usar. La app del teléfono funciona bien con ella.', estrellas: 4 },
            { texto: 'Funciona bien aunque a veces tarda un poco en estabilizar la lectura. En general cumple.', estrellas: 3 },
        ];
        if (/MASAJE|PISTOLA/.test(n)) return [
            { texto: 'Excelente pistola de masaje, relaja muy bien los músculos después del ejercicio. La batería dura bastante.', estrellas: 5 },
            { texto: 'Me encanta, tiene varios niveles de intensidad y alivia el dolor muscular de verdad. Vale la pena.', estrellas: 5 },
            { texto: 'Buena pistola de masaje, los cabezales intercambiables son prácticos. Funciona bien y no hace mucho ruido.', estrellas: 4 },
            { texto: 'Funciona bien para aliviar tensión muscular. La carga dura varias sesiones.', estrellas: 4 },
            { texto: 'Cumple su función, aunque en el nivel más alto vibra bastante. Para uso moderado está bien.', estrellas: 3 },
        ];
        if (/SOLDADURA|ANTORCHA|TIG/.test(n)) return [
            { texto: 'Excelente antorcha, el arco es estable y la calidad de la soldadura es muy buena. Muy satisfecho.', estrellas: 5 },
            { texto: 'Buena antorcha TIG, se conecta bien al equipo y el enfriamiento funciona correctamente.', estrellas: 4 },
            { texto: 'Cumple bien su función en trabajos de soldadura. Los accesorios incluidos son de buena calidad.', estrellas: 4 },
            { texto: 'Funciona correctamente para soldadura TIG. La manguera es flexible y la punta llega bien.', estrellas: 3 },
        ];
        if (/MANNOL|ACEITE|ANTIFREEZE|LUBRICANTE|5W|10W/.test(n)) return [
            { texto: 'Excelente aceite, el motor trabaja más suave y el consumo bajó un poco. Lo seguiré usando.', estrellas: 5 },
            { texto: 'Muy buen lubricante, protege bien el motor. Ya llevo varios cambios con Mannol y no he tenido problemas.', estrellas: 5 },
            { texto: 'Buen aceite de motor, la viscosidad es correcta y el motor arranca bien incluso de mañana temprano.', estrellas: 4 },
            { texto: 'El antifreeze funciona bien, mantiene la temperatura del motor estable. No ha habido fugas.', estrellas: 4 },
            { texto: 'Cumple su función, el motor trabaja normal. No noto gran diferencia con otras marcas pero hace su trabajo.', estrellas: 3 },
        ];
        if (/ESTACIÓN|ESTACION|PORTÁTIL|PORTATIL|CARGA/.test(n)) return [
            { texto: 'La estación de carga es tremenda, alimenta varios equipos a la vez y la batería dura bastante. Muy útil en los apagones.', estrellas: 5 },
            { texto: 'Excelente estación portátil, carga celulares, laptops y hasta el ventilador. La inversión valió la pena.', estrellas: 5 },
            { texto: 'Buena estación de energía, tiene varias salidas y la carga solar funciona bien. Recomendada.', estrellas: 4 },
            { texto: 'Funciona muy bien para los apagones. La capacidad es la anunciada y recarga rápido con el panel solar.', estrellas: 4 },
            { texto: 'Cumple bien, aunque es algo pesada para cargarla. En potencia y autonomía no hay queja.', estrellas: 3 },
        ];
        // Genérico si no coincide ninguna categoría
        return [
            { texto: 'Llegó en perfectas condiciones y funciona exactamente como se describe. Muy contento con la compra.', estrellas: 5 },
            { texto: 'Buena calidad para el precio. El vendedor atendió rápido y el envío fue sin problemas.', estrellas: 4 },
            { texto: 'Cumple su función correctamente. No tuve ningún problema desde que lo recibí.', estrellas: 4 },
            { texto: 'Buen producto, aunque le falta algún detalle. En general estoy satisfecho con la compra.', estrellas: 3 },
        ];
    }

    // Elegir 10 productos al azar (sin repetir)
    const shuffled = [...prods].sort(() => Math.random() - 0.5).slice(0, Math.min(10, prods.length));
    const autores = ['Rosa M.', 'Miguel A.', 'Yoandra', 'Carlos R.', 'Liudmis', 'Pedro J.', 'Dayami', 'Roberto', 'Yanet L.', 'Ernesto C.', 'Yanela', 'Osmani'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep'];

    let ok = 0, fail = 0;
    mostrarNotificacion('⏳ Publicando reseñas en Firebase…', 'info');

    for (let i = 0; i < shuffled.length; i++) {
        const prod = shuffled[i];
        const pid  = String(prod.id);
        const ts   = Date.now() - (shuffled.length - i) * 86400000 * (Math.floor(Math.random() * 10) + 1);
        const pool = _resenasParaProducto(prod.nombre);
        const r    = pool[i % pool.length];
        const fecha = `${Math.floor(Math.random() * 20 + 1)} ${meses[Math.floor(Math.random() * meses.length)]} 2025`;
        const resena = {
            id: ts,
            autor: autores[i % autores.length],
            texto: r.texto,
            estrellas: r.estrellas,
            fecha,
            productoId: pid,
            productoNombre: prod.nombre.substring(0, 50),
            comprador: true
        };
        try {
            const res = await fetch(base + '/resenas/' + pid + '/' + ts + '.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resena)
            });
            if (res.ok) ok++; else fail++;
        } catch(e) { fail++; }
        await new Promise(r => setTimeout(r, 200));
    }

    setBtnState('⭐ Publicar reseñas iniciales (10)', false);
    if (ok > 0) {
        mostrarNotificacion(`✅ ${ok} reseña(s) publicadas en Firebase. Recarga el inicio para verlas.`, 'success');
    } else {
        mostrarNotificacion(`❌ No se pudo publicar ninguna reseña (${fail} errores). Revisa las reglas Firebase.`, 'error');
    }
}

// Diagnóstico Firebase RTDB — llamado desde el botón en admin Configuración
async function tmDiagnosticarFirebase() {
    const box  = document.getElementById('fbDiagResult');
    const hint = document.getElementById('fbRulesHint');

    // append helper — funciona con o sin el div
    let log = '';
    const add = (line) => {
        log += line + '\n';
        if (box) { box.style.display = 'block'; box.innerHTML = log; }
        else mostrarNotificacion(line.replace(/<[^>]+>/g,'').substring(0,120), 'info');
    };

    if (hint) hint.style.display = 'none';
    add('⏳ Probando conexión Firebase…');

    const base = _fbRtdbUrl();
    if (!base) { add('❌ No hay Firebase configurado. Pega el firebaseConfig JSON y guarda.'); return; }
    add('📡 URL: ' + base);

    const rutas = [
        { path: '/resenas.json?shallow=true', label: 'Reseñas (/resenas)' },
        { path: '/interesados.json?shallow=true', label: 'Alertas (/interesados)' },
        { path: '/configuracion/categorias.json', label: 'Categorías (/configuracion/categorias)' },
        { path: '/tokens.json?shallow=true', label: 'Suscripciones push (/tokens)' },
    ];

    let hayBloqueados = false;
    for (const { path, label } of rutas) {
        try {
            const r = await fetch(base + path);
            if (r.ok) {
                const data = await r.json();
                if (path.includes('resenas') && data && typeof data === 'object') {
                    const n = Object.keys(data).length;
                    add(`✅ ${label}: OK — ${n > 0 ? n + ' producto(s) con reseñas en Firebase' : '⚠️ SIN DATOS (se guardaron solo en el dispositivo o nadie ha reseñado)'}`);
                } else {
                    add(`✅ ${label}: OK`);
                }
            } else if (r.status === 401 || r.status === 403) {
                add(`🔴 ${label}: BLOQUEADO (${r.status})`);
                hayBloqueados = true;
            } else if (r.status === 404) {
                add(`⚠️ ${label}: Vacío/no existe aún`);
            } else {
                add(`⚠️ ${label}: Error ${r.status}`);
            }
        } catch(e) {
            add(`⚠️ ${label}: Sin red`);
        }
    }

    // Reseñas en localStorage
    const lsKeys = Object.keys(localStorage).filter(k => k.startsWith('resenas_'));
    if (lsKeys.length > 0) {
        const total = lsKeys.reduce((s,k) => s + (tmParseArray(localStorage.getItem(k)).length), 0);
        add(`💾 LocalStorage: ${total} reseña(s) — SOLO en ESTE dispositivo`);
    }

    if (hayBloqueados && hint) {
        hint.style.display = 'block';
        hint.innerHTML = `<b style="color:#FF6B35">🔧 Reglas de Firebase RTDB bloqueando lecturas</b><br><br>
Ve a <b>console.firebase.google.com</b> → tu proyecto → <b>Realtime Database → Rules</b> y pega esto:<br><br>
<pre style="background:rgba(0,0,0,.4);border-radius:6px;padding:8px;overflow-x:auto;color:#C9A96E;font-size:10px">{
  "rules": {
    "resenas":       { ".read": true, ".write": true },
    "interesados":   { ".read": true, ".write": true },
    "tokens":        { ".read": true, ".write": true },
    "configuracion": { ".read": true, ".write": false },
    "version":       { ".read": true, ".write": false },
    "admin_auth":    { ".read": true, ".write": true },
    "ventas":        { ".read": true, ".write": true },
    ".read": false,
    ".write": false
  }
}</pre>
Después haz clic en <b>Publicar</b> y recarga el admin.`;
    }
}

// Helper: obtiene la URL base de Firebase RTDB desde config guardada
function _fbRtdbUrl() {
    try {
        const cfg = tmParseObject(localStorage.getItem('firebaseConfig'));
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

// Borra todas las ventas de Firebase RTDB una a una (respeta reglas: solo write en $ventaId)
function _fbBorrarTodasVentas() {
    (async () => {
        await _fbEnsureConfig();
        const url = _fbRtdbUrl();
        if (!url) return;
        const res = await fetch(`${url}/ventas.json`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || typeof data !== 'object') return;
        await Promise.all(Object.keys(data).map(k =>
            fetch(`${url}/ventas/${k}.json`, { method: 'DELETE' }).catch(() => {})
        ));
    })().catch(e => console.warn('⚠️ Firebase ventas clear:', e.message));
}

// Migra ventas guardadas accidentalmente en la raíz de Firebase (0,1,2,3...) a /ventas/{id}
async function _fbMigrarVentasRaiz(url) {
    const ventasMigradas = [];
    const _elimSet = new Set(tmParseArray(localStorage.getItem('_tmVentasElim')));
    for (let k = 0; k < 20; k++) {
        try {
            const r = await fetch(`${url}/${k}.json`);
            if (!r.ok) continue;
            const v = await r.json();
            if (!v || typeof v !== 'object' || !v.id || !v.producto) continue;
            // Siempre intentar borrar del root, aunque la venta haya sido eliminada
            await fetch(`${url}/${k}.json`, { method: 'DELETE' }).catch(() => {});
            if (_elimSet.has(v.id)) continue; // Fue eliminada por el admin, no reimportar
            const putRes = await fetch(`${url}/ventas/${v.id}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(v)
            });
            if (putRes.ok) ventasMigradas.push(v);
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
        const _elimSet = new Set(tmParseArray(localStorage.getItem('_tmVentasElim')));
        const _esPrueba = v => {
            const n = String(v.producto || '').trim().toLowerCase();
            return n.length <= 1 || ['a','b','test','prueba','producto a','producto b','aa','bb'].includes(n);
        };
        const ventasFB = data && typeof data === 'object'
            ? Object.values(data).filter(v => v && !_elimSet.has(v.id) && !_esPrueba(v))
            : [];

        // Combinar migradas + las ya en /ventas/
        const todasFB = [...ventasFB, ...migradas.filter(m => !ventasFB.find(v => v.id === m.id) && !_esPrueba(m))];

        const ventasLocales = tmParseArray(localStorage.getItem('registroVentas'));
        const idsFB = new Set(todasFB.map(v => v.id));
        const soloLocales = ventasLocales.filter(v => !idsFB.has(v.id) && !_esPrueba(v));
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
        const v = tmParseArray(localStorage.getItem('registroVentas'));
        if (!Array.isArray(v)) return [];
        const esPrueba = n => { const s = String(n || '').trim().toLowerCase(); return s.length <= 1 || ['a','b','test','prueba','producto a','producto b'].includes(s); };
        return v.filter(x => x && !esPrueba(x.producto));
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
                    ${p.imagen ? `<img src="${p.imagen}" loading="lazy" decoding="async" class="thumb" onerror="this.style.display='none'">` : '<div class="thumb-placeholder">📦</div>'}
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
                <img id="ventaSelImg" loading="lazy" decoding="async" src="" onerror="this.style.display='none'">
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
    // Registrar como eliminada para que el sync de Firebase no la reimporte
    const elim = tmParseArray(localStorage.getItem('_tmVentasElim'));
    if (!elim.includes(id)) { elim.push(id); if (elim.length > 300) elim.splice(0, elim.length - 300); }
    localStorage.setItem('_tmVentasElim', JSON.stringify(elim));
    renderizarVentas();
    _fbEliminarVenta(id);
}

function borrarHistorialVentas() {
    if (!confirm('¿Borrar todo el historial de ventas?')) return;
    // Guardar IDs en _tmVentasElim ANTES de limpiar para que el sync no los reimporte desde Firebase
    const actuales = cargarVentas();
    const elim = tmParseArray(localStorage.getItem('_tmVentasElim'));
    actuales.forEach(v => { if (v.id && !elim.includes(v.id)) elim.push(v.id); });
    if (elim.length) localStorage.setItem('_tmVentasElim', JSON.stringify(elim.slice(-300)));
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
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
    grupos.push({ url: '', productos: productos.map(p => p.id) }); // Por defecto todos seleccionados
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    renderizarGruposFB(grupos);
}

function eliminarGrupoFB(i) {
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
    grupos.splice(i, 1);
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    renderizarGruposFB(grupos);
}

function actualizarGrupoFB(i, campo, valor) {
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
    if (grupos[i]) grupos[i][campo] = valor;
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
}

function toggleProductoEnGrupo(iGrupo, idProducto, checked) {
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
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
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
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
    const config = tmParseObject(localStorage.getItem('revolicoConfig'));

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
    const config = tmParseObject(localStorage.getItem('revolicoConfig'));
    if (categoria) {
        config[idProducto] = categoria;
    } else {
        delete config[idProducto];
    }
    localStorage.setItem('revolicoConfig', JSON.stringify(config));
}

function guardarRevolicoConfig() {
    const config = tmParseObject(localStorage.getItem('revolicoConfig'));
    const asignados = Object.keys(config).length;
    mostrarNotificacion(`✅ Config Revolico guardada (${asignados} productos asignados). Haz clic en ACTUALIZAR TIENDA para subir a GitHub.`);
}

// ── Grupos FB persistentes (carga al abrir pestaña) ──

function cargarGruposFB() {
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
    renderizarGruposFB(grupos);
    renderizarRevolicoConfig();
}

// ── Patch guardarGruposFB para también actualizar localStorage limpio ──
const _origGuardarGrupos = guardarGruposFB;
guardarGruposFB = function() {
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
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
    // Also sync the countdown product selector so user doesn't have to pick twice
    actualizarCountdownProductSelect();
    const ofId = localStorage.getItem('ofertaDiaId');
    const cdSel = document.getElementById('countdownProductSelect');
    if (ofId && cdSel && !cdSel.value) cdSel.value = ofId;
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
async function _enviarPushOfertaActivada(ofId, ofTxt) {
    try {
        const fbCfgRaw = localStorage.getItem('firebaseConfig');
        if (!fbCfgRaw) return;
        const fbCfg = JSON.parse(fbCfgRaw);
        const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
        const prod = (typeof productos !== 'undefined' ? productos : []).find(p => String(p.id) === String(ofId));
        const prodNombre = prod ? prod.nombre : 'Oferta del Día';
        const reqId = 'req_oferta_' + Date.now();
        const putRes = await fetch(rtdbUrl + '/admin_push_requests/' + reqId + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '🔥 ' + ofTxt, body: '¡' + prodNombre + ' con oferta especial! Solo por tiempo limitado.', url: '/?oferta=1', ts: Date.now() })
        });
        if (!putRes.ok) return;
        const ghUser  = localStorage.getItem('githubUser');
        const ghRepo  = localStorage.getItem('githubRepo') || 'Tiendamax';
        const ghToken = localStorage.getItem('githubToken');
        if (ghUser && ghToken) {
            fetch('https://api.github.com/repos/' + ghUser + '/' + ghRepo + '/actions/workflows/flush-push-queue.yml/dispatches', {
                method: 'POST',
                headers: { 'Authorization': 'token ' + ghToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ref: 'main' })
            }).catch(() => {});
        }
        mostrarNotificacion('📲 Push de oferta enviado a suscriptores', 'success');
    } catch(e) { console.warn('[_enviarPushOfertaActivada]', e); }
}

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
            _enviarPushOfertaActivada(_ofId, _ofTxt);
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
            '<img src="' + escapeAttr(p.imagen) + '" loading="lazy" decoding="async" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" onerror="this.style.display=\'none\'">' +
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
            const cached = tmParseArray(localStorage.getItem('productos'));
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
            const precio = safeNum(p.precioActual);
            const matchP = precio >= _heroPrecioMin && precio <= _heroPrecioMax;
            return matchQ && matchP;
        });
    }
    if (_heroSoloConStock) productosFiltrados = productosFiltrados.filter(p => safeNum(p.stock) > 0);
    if (_heroOrden === 'precio_asc')  productosFiltrados.sort((a,b) => safeNum(a.precioActual) - safeNum(b.precioActual));
    else if (_heroOrden === 'precio_desc') productosFiltrados.sort((a,b) => safeNum(b.precioActual) - safeNum(a.precioActual));
    else if (_heroOrden === 'az')     productosFiltrados.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));

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
        // Si los productos aún no cargan, mostrar skeleton cards en vez de texto
        if (!Array.isArray(productos) || productos.length === 0) {
            const skeletonHTML = Array(6).fill(0).map(() => 
                '<div class="producto-card skeleton-card" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.05);border-radius:20px;overflow:hidden;animation:skeletonPulse 1.5s ease-in-out infinite;">' +
                '<div style="height:220px;background:linear-gradient(90deg,#222 0%,#2a2a2a 50%,#222 100%);background-size:200% 100%;animation:tm-shimmer 1.5s ease-in-out infinite;"></div>' +
                '<div style="padding:20px;">' +
                '<div style="height:16px;background:#2a2a2a;border-radius:4px;margin-bottom:8px;width:80%;animation:tm-shimmer 1.5s ease-in-out infinite;"></div>' +
                '<div style="height:12px;background:#222;border-radius:4px;margin-bottom:6px;width:100%;animation:tm-shimmer 1.5s ease-in-out infinite;"></div>' +
                '<div style="height:12px;background:#222;border-radius:4px;margin-bottom:6px;width:90%;animation:tm-shimmer 1.5s ease-in-out infinite;"></div>' +
                '<div style="height:20px;background:#2a2a2a;border-radius:4px;margin-top:12px;width:50%;animation:tm-shimmer 1.5s ease-in-out infinite;"></div>' +
                '<div style="height:36px;background:#2a2a2a;border-radius:8px;margin-top:12px;width:100%;animation:tm-shimmer 1.5s ease-in-out infinite;"></div>' +
                '</div></div>'
            ).join('');
            productosGrid.innerHTML = skeletonHTML;
            return;
        }
        // Mensaje contextual según la situación real
        let mensaje;
        if (subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
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
        // Spec badges EDITABLES: lee del campo 'specs' del producto (array de strings).
        // Si no existe 'specs', no muestra nada (evita errores del regex anterior).
        // Para añadir specs a un producto, edita productos.json y añade: "specs": ["12V", "2000W", "Onda Pura"]
        const _specs = Array.isArray(producto.specs) ? producto.specs.filter(s => s && String(s).trim()).slice(0, 4) : [];
        const _hasDescuento = producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual;
        // Garantía dinámica: solo mostrar si el producto tiene garantía definida
        const _tieneGarantia = producto.garantia && String(producto.garantia).trim();
        const _tieneDevolucion = producto.devolucion === true;
        // Construir trust badges dinámicamente
        let _trustBadgesHtml = '<div class="tm-trust-badges" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:10px;color:#6B6B7A;align-items:center;">';
        _trustBadgesHtml += '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(46,204,113,0.10);color:#2ECC71;padding:3px 8px;border-radius:8px;font-weight:600;">🔒 Pago contra entrega</span>';
        if (_tieneGarantia) {
            _trustBadgesHtml += '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(232,80,30,0.10);color:#E8501E;padding:3px 8px;border-radius:8px;font-weight:600;">🛡️ Garantía ' + escapeHtml(producto.garantia) + '</span>';
        }
        if (_tieneDevolucion) {
            _trustBadgesHtml += '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(52,152,219,0.10);color:#3498DB;padding:3px 8px;border-radius:8px;font-weight:600;">↩️ Devolución</span>';
        }
        _trustBadgesHtml += '</div>';

        card.innerHTML =
            (esOfertaDia ? '<div class="badge-oferta-dia">' + _txt + '</div>' :
             esAgotado ? '<div class="badge-agotado">AGOTADO</div>' :
             producto.masVendido ? '<div class="badge-vendido">🔥 Más Vendido</div>' : '') +
            (_hasDescuento ? '<div class="badge-precio-especial">⭐ Precio Especial</div>' : '') +
            '<div class="producto-image">' +
                getMeGustaHTML(_id) +
                '<img src="' + _img + '" alt="' + _nom + '" loading="lazy" onerror="this.src=\'/iconos/favicon-192.png\';this.style.opacity=\'0.3\'">' +
                (_hasDescuento ? '<div class="badge">-' + Math.round((1 - producto.precioActual/producto.precioOriginal) * 100) + '%</div>' : '') +
            '</div>' +
            '<h3>' + _nom + '</h3>' +
            (_specs.length ? '<div class="spec-badges">' + _specs.slice(0, 3).map(s => '<span class="spec-badge">' + escapeHtml(s) + '</span>').join('') + '</div>' : '') +
            '<p class="producto-description">' + _des + '</p>' +
            (_hasDescuento
                ? '<div class="precio-mejorado"><span class="precio-actual-mejorado" data-usd="' + safeNum(producto.precioActual) + '">$' + Number(producto.precioActual).toFixed(2) + ' USD</span><span class="precio-tachado-mejorado">$' + parseFloat(producto.precioOriginal).toFixed(2) + ' USD</span><span class="precio-ahorro">ahorras $' + (parseFloat(producto.precioOriginal) - parseFloat(producto.precioActual)).toFixed(0) + '</span></div>'
                : '<p class="precio"><span class="precio-actual" data-usd="' + safeNum(producto.precioActual) + '">$' + Number(producto.precioActual).toFixed(2) + ' USD</span></p>') +
            (esAgotado
                ? '<div class="stock" style="color:#e74c3c;font-weight:700;">❌ Agotado</div><button class="btn btn-small" disabled style="background:#555;color:#aaa;cursor:not-allowed;box-shadow:none;">🚫 No disponible</button>'
                : (_stk <= 3 && _stk > 0 ? '<div class="stock stock-urgente">⚠️ ¡Solo quedan ' + _stk + '!</div>' : '<div class="stock">📦 Stock: ' + _stk + ' unidades</div>') +
                  (typeof renderCountdownHtml === 'function' ? renderCountdownHtml(_id) : '') +
                  '<button class="btn-pedir-card" data-nombre="' + _nom + '" onclick="event.stopPropagation(); tmComprar(event, ' + _id + ', this.dataset.nombre)" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>' +
            _trustBadgesHtml);
        productosGrid.appendChild(card);
    });
};
} // end typeof renderizarProductos guard


