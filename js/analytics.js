// ═══════════════════════════════════════════════════════
//  📊 TIENDAMAX ANALYTICS — analytics.js
//  Registra vistas y clicks de WhatsApp en Firebase RTDB.
//  Incluye el panel visual para el admin.
// ═══════════════════════════════════════════════════════

// ── Utilidad: obtener la URL base de Firebase RTDB ──────
function _tmRtdbUrl() {
    try {
        const cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
        if (cfg.databaseURL) return cfg.databaseURL;
        if (cfg.projectId)   return `https://${cfg.projectId}-default-rtdb.firebaseio.com`;
    } catch(e) {}
    return null;
}

// ── Registrar un evento (fire-and-forget, nunca bloquea la UI) ──
// tipo: 'vistas' | 'whatsapp'
// id:   ID del producto (string o number)
async function tmTrackEventoV2(tipo, id) {
    const base = _tmRtdbUrl();
    if (!base || !id) return;
    try {
        const url = `${base}/analytics/${tipo}/${String(id)}/count.json`;
        const r = await fetch(url);
        const v = r.ok ? (await r.json()) : null;
        const actual = (typeof v === 'number') ? v : 0;
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(actual + 1)
        });
    } catch(e) {}
}

// ── API pública ─────────────────────────────────────────

// Llamar cuando el usuario abre un producto
function tmTrackVista(productoId) {
    tmTrackEventoV2('vistas', productoId);
}

// Llamar justo antes de abrir WhatsApp con un producto
function tmTrackWhatsApp(productoId) {
    tmTrackEventoV2('whatsapp', productoId);
}

// ── Leer todos los contadores de analytics ──────────────
async function tmLeerAnalytics() {
    const base = _tmRtdbUrl();
    if (!base) return { vistas: {}, whatsapp: {}, suscriptores: 0 };
    try {
        const [rV, rW, rT] = await Promise.all([
            fetch(`${base}/analytics/vistas.json`),
            fetch(`${base}/analytics/whatsapp.json`),
            fetch(`${base}/tokens.json?shallow=true`)
        ]);
        const vistas     = rV.ok ? (await rV.json()) || {} : {};
        const whatsapp   = rW.ok ? (await rW.json()) || {} : {};
        const tokensKeys = rT.ok ? (await rT.json()) || {} : {};

        // vistas y whatsapp tienen forma { productoId: { count: N } }
        const vistasCont   = {};
        const whatsappCont = {};
        Object.entries(vistas).forEach(([id, v])   => { vistasCont[id]   = (typeof v === 'object' ? v.count : v) || 0; });
        Object.entries(whatsapp).forEach(([id, v]) => { whatsappCont[id] = (typeof v === 'object' ? v.count : v) || 0; });

        return {
            vistas:       vistasCont,
            whatsapp:     whatsappCont,
            suscriptores: Object.keys(tokensKeys).length
        };
    } catch(e) {
        return { vistas: {}, whatsapp: {}, suscriptores: 0 };
    }
}

// ── Panel de Analytics para el Admin ────────────────────
async function renderizarAnalyticsFirebase() {
    const el = document.getElementById('analyticsContent');
    if (!el) return;

    // Mostrar estado de carga
    el.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-secondary,#888);">
            <div style="font-size:24px;margin-bottom:8px">⏳</div>
            <div>Cargando datos de Firebase...</div>
        </div>`;

    // Datos locales (inventario)
    const totalProductos = productos.length;
    const totalStock     = productos.reduce((s, p) => s + (p.stock || 0), 0);
    const sinStock       = productos.filter(p => p.stock === 0).length;
    const catConteo      = {};
    productos.forEach(p => { catConteo[p.categoria] = (catConteo[p.categoria] || 0) + 1; });
    const topCats = Object.entries(catConteo).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Datos de Firebase
    const { vistas, whatsapp, suscriptores } = await tmLeerAnalytics();

    // Calcular totales
    const totalVistas   = Object.values(vistas).reduce((s, n) => s + n, 0);
    const totalWA       = Object.values(whatsapp).reduce((s, n) => s + n, 0);
    const conversion    = totalVistas > 0 ? ((totalWA / totalVistas) * 100).toFixed(1) : '0.0';

    // Top 5 productos por vistas (cruzado con datos de producto)
    const topVistas = Object.entries(vistas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => {
            const p = productos.find(x => String(x.id) === String(id));
            return { id, count, nombre: p ? p.nombre : `Producto ${id}`, categoria: p ? p.categoria : '—' };
        });

    const maxV = topVistas.length ? topVistas[0].count : 1;

    // Top 5 productos por clicks WhatsApp
    const topWA = Object.entries(whatsapp)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => {
            const p = productos.find(x => String(x.id) === String(id));
            return { id, count, nombre: p ? p.nombre : `Producto ${id}` };
        });

    const maxWA = topWA.length ? topWA[0].count : 1;

    // Conversión por categoría
    const convCat = {};
    productos.forEach(p => {
        const id  = String(p.id);
        const cat = p.categoria || 'Sin categoría';
        if (!convCat[cat]) convCat[cat] = { v: 0, w: 0 };
        convCat[cat].v += vistas[id] || 0;
        convCat[cat].w += whatsapp[id] || 0;
    });
    const convCatArr = Object.entries(convCat)
        .map(([cat, d]) => ({ cat, pct: d.v > 0 ? ((d.w / d.v) * 100).toFixed(1) : '0.0', v: d.v, w: d.w }))
        .filter(x => x.v > 0)
        .sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct))
        .slice(0, 6);

    const noFirebase = _tmRtdbUrl() === null;

    el.innerHTML = `
        ${noFirebase ? `
        <div style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#e74c3c;">
            ⚠️ Firebase no configurado — ve a la pestaña <strong>⚙️ Config</strong> y pega tu configuración de Firebase para activar analytics en tiempo real.
        </div>` : ''}

        <!-- Métricas principales -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px;">
            ${_statCard('👁️', 'Vistas totales', totalVistas)}
            ${_statCard('💬', 'Clicks WhatsApp', totalWA)}
            ${_statCard('🔔', 'Suscriptores', suscriptores)}
            ${_statCard('📈', 'Conversión', conversion + '%')}
            ${_statCard('📦', 'Productos', totalProductos)}
            ${_statCard('⚠️', 'Sin stock', sinStock, sinStock > 0 ? '#e74c3c' : null)}
        </div>

        <!-- Top productos por vistas -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
            <div style="background:var(--card-bg,rgba(255,255,255,0.04));border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
                <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-primary,#fff);">🔥 Más vistos</div>
                ${topVistas.length === 0
                    ? `<div style="font-size:12px;color:#888;padding:8px 0;">Sin datos aún — las vistas se registran cuando los clientes abren productos.</div>`
                    : topVistas.map((p, i) => `
                        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:11px;color:#888;width:14px">${i + 1}</span>
                            <div style="flex:1;min-width:0">
                                <div style="font-size:12px;color:var(--text-primary,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
                                <div style="font-size:11px;color:#888">${p.categoria}</div>
                            </div>
                            <div style="width:60px;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
                                <div style="height:100%;border-radius:2px;background:#c9a96e;width:${Math.round(p.count / maxV * 100)}%"></div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:#c9a96e;min-width:24px;text-align:right">${p.count}</span>
                        </div>`).join('')
                }
            </div>

            <div style="background:var(--card-bg,rgba(255,255,255,0.04));border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
                <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-primary,#fff);">💬 Más pedidos por WhatsApp</div>
                ${topWA.length === 0
                    ? `<div style="font-size:12px;color:#888;padding:8px 0;">Sin datos aún — los clicks se registran cuando un cliente pulsa "Pedir".</div>`
                    : topWA.map((p, i) => `
                        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:11px;color:#888;width:14px">${i + 1}</span>
                            <div style="flex:1;min-width:0">
                                <div style="font-size:12px;color:var(--text-primary,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
                            </div>
                            <div style="width:60px;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
                                <div style="height:100%;border-radius:2px;background:#25d366;width:${Math.round(p.count / maxWA * 100)}%"></div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:#25d366;min-width:24px;text-align:right">${p.count}</span>
                        </div>`).join('')
                }
            </div>
        </div>

        <!-- Conversión por categoría -->
        ${convCatArr.length > 0 ? `
        <div style="background:var(--card-bg,rgba(255,255,255,0.04));border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:20px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-primary,#fff);">📊 Conversión por categoría <span style="font-size:11px;font-weight:400;color:#888">(vistas → WhatsApp)</span></div>
            ${convCatArr.map(c => `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                    <span style="font-size:12px;color:#888;width:100px;flex-shrink:0">${c.cat}</span>
                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
                        <div style="height:100%;border-radius:3px;background:#c9a96e;width:${Math.min(100, parseFloat(c.pct) * 4)}%"></div>
                    </div>
                    <span style="font-size:12px;font-weight:600;color:#c9a96e;min-width:38px;text-align:right">${c.pct}%</span>
                    <span style="font-size:11px;color:#888;min-width:60px">${c.v}v / ${c.w}wa</span>
                </div>`).join('')}
        </div>` : ''}

        <!-- Top categorías por inventario -->
        <div style="background:var(--card-bg,rgba(255,255,255,0.04));border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-primary,#fff);">🏷️ Categorías por inventario</div>
            ${topCats.map(([cat, n]) => `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                    <span style="font-size:12px;color:#888;width:100px;flex-shrink:0">${cat}</span>
                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
                        <div style="height:100%;border-radius:3px;background:#c9a96e;width:${Math.round(n / totalProductos * 100)}%"></div>
                    </div>
                    <span style="font-size:12px;font-weight:600;color:#c9a96e;min-width:24px;text-align:right">${n}</span>
                </div>`).join('')}
        </div>

        <div style="margin-top:14px;text-align:right;">
            <button onclick="renderizarAnalyticsFirebase()" style="font-size:12px;padding:6px 14px;border-radius:8px;background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);color:#c9a96e;cursor:pointer;">
                🔄 Actualizar datos
            </button>
        </div>
    `;
}

function _statCard(icon, label, value, color) {
    return `
        <div style="background:var(--card-bg,rgba(255,255,255,0.04));border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 12px;text-align:center;">
            <div style="font-size:20px;margin-bottom:4px">${icon}</div>
            <div style="font-size:20px;font-weight:700;color:${color || 'var(--primary-color,#c9a96e)'};">${value}</div>
            <div style="font-size:11px;color:#888;margin-top:2px">${label}</div>
        </div>`;
}
