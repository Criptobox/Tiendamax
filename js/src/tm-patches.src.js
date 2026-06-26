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
    // Ganancia separada por moneda de la comisión (USD vs Moneda Nacional)
    const totalGananciaUSD = ventas.reduce((s, v) => s + (String(v.comisionMoneda || 'USD') === 'MN' ? 0 : Number(v.ganancia || 0)), 0);
    const totalGananciaMN  = ventas.reduce((s, v) => s + (String(v.comisionMoneda || 'USD') === 'MN' ? Number(v.ganancia || 0) : 0), 0);
    const totalUnidades = ventas.reduce((s, v) => s + Number(v.cantidad || 1), 0);
    const ticketProm    = ventas.length ? totalVentas / ventas.length : 0;
    const margenPct     = totalVentas > 0 ? (totalGanancia / totalVentas) * 100 : 0;
    // El margen % solo aplica a la ganancia en USD (el total vendido está en USD)
    const margenPctUSD  = totalVentas > 0 ? (totalGananciaUSD / totalVentas) * 100 : 0;

    const ahora = Date.now();
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const ventasHoy = ventas.filter(v => Number(v.id || 0) >= inicioHoy.getTime());
    const ventas7d  = ventas.filter(v => Number(v.id || 0) >= ahora - 7 * 24 * 60 * 60 * 1000);
    const totalHoy  = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
    const total7d   = ventas7d.reduce((s, v) => s + Number(v.total || 0), 0);
    const ventas7d_prev = ventas.filter(v => { const ts = Number(v.id || 0); return ts >= ahora - 14*86400000 && ts < ahora - 7*86400000; });
    const total7d_prev = ventas7d_prev.reduce((s, v) => s + Number(v.total || 0), 0);
    const cambio7d_pct = total7d_prev > 0 ? ((total7d - total7d_prev) / total7d_prev * 100) : (total7d > 0 ? 100 : 0);

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

    const semanasHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <div style="flex:1;min-width:90px;padding:10px;background:rgba(39,174,96,.12);border:1px solid rgba(39,174,96,.25);border-radius:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#27ae60">$${total7d.toFixed(0)}</div>
            <div style="font-size:11px;color:#888;margin-top:3px">Esta semana</div>
            <div style="font-size:10px;color:#666">${ventas7d.length} venta${ventas7d.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="flex:1;min-width:90px;padding:10px;background:rgba(52,152,219,.12);border:1px solid rgba(52,152,219,.25);border-radius:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#3498db">$${total7d_prev.toFixed(0)}</div>
            <div style="font-size:11px;color:#888;margin-top:3px">Semana anterior</div>
            <div style="font-size:10px;color:#666">${ventas7d_prev.length} venta${ventas7d_prev.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="flex:1;min-width:70px;padding:10px;background:rgba(${cambio7d_pct >= 0 ? '39,174,96' : '231,76,60'},.12);border:1px solid rgba(${cambio7d_pct >= 0 ? '39,174,96' : '231,76,60'},.25);border-radius:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:${cambio7d_pct >= 0 ? '#27ae60' : '#e74c3c'}">${cambio7d_pct >= 0 ? '+' : ''}${cambio7d_pct.toFixed(0)}%</div>
            <div style="font-size:11px;color:#888;margin-top:3px">Variación</div>
        </div>
    </div>`;

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
            ${kpiCard('gold',
                '<span class="tm-kpi-usd">$' + totalGananciaUSD.toFixed(0) + '<small>USD</small></span>' +
                '<span class="tm-kpi-mn-val">' + totalGananciaMN.toLocaleString('es-CU') + '<small>MN</small></span>',
                'Mi ganancia', margenPctUSD.toFixed(1) + '% margen')}
            ${kpiCard('blue', String(totalUnidades), 'Unidades', '$' + ticketProm.toFixed(0) + ' ticket prom.')}
            ${kpiCard('purple', '$' + totalHoy.toFixed(0), 'Hoy', ventasHoy.length + ' venta' + (ventasHoy.length !== 1 ? 's' : ''))}
            ${kpiCard('dark', '$' + total7d.toFixed(0), 'Últimos 7 días', ventas7d.length + ' venta' + (ventas7d.length !== 1 ? 's' : '') + (total7d_prev > 0 ? ' · ' + (cambio7d_pct >= 0 ? '▲' : '▼') + Math.abs(cambio7d_pct).toFixed(0) + '%' : ''))}
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
                ${miniSection('📅 Esta semana vs anterior', semanasHtml)}
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
                : '<div class="stock">📦 Stock: ' + _stk + ' unidades</div>' +
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

async function tmRefrescarTasaElToque() {
    const btn = document.getElementById('btnRefrescarTasa');
    const status = document.getElementById('tasaMNStatus');
    const fuente = document.getElementById('tasaElToqueFuente');
    if (btn) { btn.textContent = '⏳ Consultando elTOQUE…'; btn.disabled = true; }
    const prevTasa = parseFloat(localStorage.getItem('tasaMN') || '0');
    try {
        await cargarTasaDesdeGitHub();
        const newTasa = parseFloat(localStorage.getItem('tasaMN') || '0');
        if (newTasa > 0) {
            const cambio = prevTasa > 0 ? (newTasa > prevTasa ? ` ▲ subió ${Math.round(newTasa - prevTasa)}` : newTasa < prevTasa ? ` ▼ bajó ${Math.round(prevTasa - newTasa)}` : ' · sin cambio') : '';
            if (status) { status.textContent = `✅ Tasa actualizada: ${newTasa} MN/USD${cambio}`; status.style.color = '#2ECC71'; }
            if (fuente) fuente.textContent = `Fuente: config.json · ${new Date().toLocaleTimeString('es-CU')}`;
        } else {
            if (status) { status.textContent = '⚠️ No se pudo obtener la tasa. Revisa la conexión.'; status.style.color = '#e74c3c'; }
        }
    } catch(e) {
        if (status) { status.textContent = '⚠️ Error al consultar. Intenta de nuevo.'; status.style.color = '#e74c3c'; }
    } finally {
        if (btn) { btn.textContent = '🔄 Refrescar desde elTOQUE'; btn.disabled = false; }
    }
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
            let alreadyStored = false;
            try {
                const allRes = await fetch(`${rtdbUrl}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
                if (allRes.ok) {
                    const allData = await allRes.json();
                    if (allData && typeof allData === 'object') {
                        // Si el token ya está guardado con la misma clave y valor, no escribir de nuevo.
                        if (allData[tokenId] && allData[tokenId].token === token) {
                            alreadyStored = true;
                        }
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

            // Evitar escribir si el token ya está registrado correctamente (previene spam al admin)
            if (alreadyStored) return;

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
    const body  = document.getElementById('manualPushBody').value.trim();
    const url   = document.getElementById('manualPushUrl').value.trim() || '/';
    const status = document.getElementById('manualPushStatus');

    if (!title || !body) {
        if (status) status.textContent = '⚠️ Título y cuerpo son requeridos.';
        return;
    }

    const fbConfigRaw = localStorage.getItem('firebaseConfig');
    if (!fbConfigRaw) {
        if (status) status.textContent = '⚠️ Configura Firebase primero.';
        return;
    }

    const fbConfig = JSON.parse(fbConfigRaw);
    const rtdbUrl  = fbConfig.databaseURL || `https://${fbConfig.projectId}-default-rtdb.firebaseio.com`;

    if (status) status.textContent = '⏳ Encolando notificación...';

    try {
        // Escribir la solicitud en admin_push_requests (procesada por el script Python)
        const reqId  = 'req_' + Date.now();
        const reqRes = await fetch(`${rtdbUrl}/admin_push_requests/${reqId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body, url, ts: Date.now() })
        });
        if (!reqRes.ok) {
            if (status) status.textContent = `❌ Error guardando en Firebase: ${reqRes.status}`;
            return;
        }

        // Disparar el workflow flush-push-queue.yml para envío inmediato
        const ghUser  = localStorage.getItem('githubUser');
        const ghRepo  = localStorage.getItem('githubRepo') || 'Tiendamax';
        const ghToken = localStorage.getItem('githubToken');
        let dispatched = false;
        if (ghUser && ghToken) {
            try {
                const dispRes = await fetch(
                    `https://api.github.com/repos/${ghUser}/${ghRepo}/actions/workflows/flush-push-queue.yml/dispatches`,
                    {
                        method: 'POST',
                        headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ref: 'main' })
                    }
                );
                dispatched = dispRes.ok || dispRes.status === 204;
            } catch (_) {}
        }

        if (dispatched) {
            if (status) status.textContent = '✅ Notificación encolada y workflow disparado — llegará en ~1 minuto.';
        } else {
            if (status) status.textContent = '✅ Notificación encolada — se enviará en el próximo ciclo automático (máx 30 min). Configura GitHub Token para envío inmediato.';
        }
    } catch (e) {
        console.error(e);
        if (status) status.textContent = '❌ Error de conexión.';
    }
}

window.tmMonedaActual = () => _monedaActual;

// Expuesto para biometric-auth.js: otorga acceso sin re-prompt de contraseña
