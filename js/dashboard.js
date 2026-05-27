
// ═══════════════════════════════════════════════════════
//  DASHBOARD REAL-TIME (Métricas Premium 2.0)
// ═══════════════════════════════════════════════════════

function renderizarAnalytics() {
    const el = document.getElementById('analyticsContent');
    if (!el) return;

    // 1. CARGA DE DATOS REALES (Strict)
    const ventas = JSON.parse(localStorage.getItem('registroVentas') || '[]');
    const vistas = JSON.parse(localStorage.getItem('vistasProd') || '{}');

    // ── CÁLCULO FINANCIERO ──
    const totalIngresos   = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const gananciaNeta    = ventas.reduce((s, v) => s + (v.ganancia || 0), 0);
    const unidadesVendidas = ventas.reduce((s, v) => s + (v.cantidad || 1), 0);

    // ── ESTADO DE INVENTARIO ──
    const agotados = productos.filter(p => p.stock === 0).length;
    const criticos = productos.filter(p => p.stock > 0 && p.stock <= 3).length;

    // ── TOP PERFORMANCE ──
    const performance = productos.map(p => {
        const idStr = String(p.id);
        const v = vistas[idStr] || 0;
        const s = ventas.filter(sale => String(sale.productoId) === idStr)
                        .reduce((acc, sale) => acc + (sale.cantidad || 1), 0);
        return { ...p, vistas: v, ventas: s };
    });

    const topVentas = [...performance].sort((a,b) => b.ventas - a.ventas).slice(0, 5);
    const topInteres = [...performance].sort((a,b) => b.vistas - a.vistas).slice(0, 5);

    // ── RENDERIZADO UI (Diseño Demo) ──
    el.innerHTML = `
        <!-- Stats Principales -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
            <div style="padding: 25px 20px; border-radius: 15px; text-align: center; background: linear-gradient(135deg, #1e5e2f, #27ae60); box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);">
                <span style="font-size: 32px; font-weight: 800; display: block; color: white; margin-bottom: 5px;">$${totalIngresos.toLocaleString()}</span>
                <span style="font-size: 11px; text-transform: uppercase; opacity: 0.9; color: white; letter-spacing: 1px; font-weight: 700;">Ingresos Totales</span>
            </div>
            <div style="padding: 25px 20px; border-radius: 15px; text-align: center; background: linear-gradient(135deg, #8a6d3b, #C9A96E); box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);">
                <span style="font-size: 32px; font-weight: 800; display: block; color: white; margin-bottom: 5px;">$${gananciaNeta.toLocaleString()}</span>
                <span style="font-size: 11px; text-transform: uppercase; opacity: 0.9; color: white; letter-spacing: 1px; font-weight: 700;">Ganancia Real</span>
            </div>
            <div style="padding: 25px 20px; border-radius: 15px; text-align: center; background: linear-gradient(135deg, #214d72, #3498db); box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);">
                <span style="font-size: 32px; font-weight: 800; display: block; color: white; margin-bottom: 5px;">${unidadesVendidas}</span>
                <span style="font-size: 11px; text-transform: uppercase; opacity: 0.9; color: white; letter-spacing: 1px; font-weight: 700;">Uds. Entregadas</span>
            </div>
        </div>

        <!-- Alertas de Inventario -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
            <div style="padding: 15px 20px; border-radius: 12px; border-left: 5px solid #e74c3c; background: rgba(231,76,60,0.1); color: #ff9999;">
                <strong style="display:block; margin-bottom:3px; font-size:15px;">⚠️ ${agotados} Agotados</strong>
                <span style="font-size:12px; opacity:0.8;">Reponer stock para no perder ventas</span>
            </div>
            <div style="padding: 15px 20px; border-radius: 12px; border-left: 5px solid #f39c12; background: rgba(243,156,18,0.1); color: #ffcc66;">
                <strong style="display:block; margin-bottom:3px; font-size:15px;">⚡ ${criticos} En Crítico</strong>
                <span style="font-size:12px; opacity:0.8;">Menos de 3 unidades restantes</span>
            </div>
        </div>

        <!-- Listas de Rendimiento -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
            <!-- Top Ventas -->
            <div style="background: #111; padding: 20px; border-radius: 16px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <div style="font-size: 15px; color: var(--gold); font-weight: bold; margin-bottom: 18px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size:20px;">🏆</span> TOP VENTAS (UNIDADES)
                </div>
                ${topVentas.filter(p => p.ventas > 0).map((p, i) => `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #222;">
                        <span style="font-weight: 900; color: #444; width: 20px; font-size:14px;">${i+1}</span>
                        <img src="${p.imagen}" style="width:35px; height:35px; border-radius:6px; object-fit:cover; background:#222;">
                        <span style="flex: 1; font-size: 13px; color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nombre}</span>
                        <span style="font-weight: 800; font-size: 14px; color: var(--gold);">${p.ventas} uds</span>
                    </div>
                `).join('') || '<p style="text-align:center; color:#555; padding:20px; font-size:13px;">No hay ventas registradas todavía.</p>'}
            </div>

            <!-- Top Interés -->
            <div style="background: #111; padding: 20px; border-radius: 16px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <div style="font-size: 15px; color: #3498db; font-weight: bold; margin-bottom: 18px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size:20px;">👁️</span> MÁS VISTOS (INTERÉS)
                </div>
                ${topInteres.filter(p => p.vistas > 0).map((p, i) => `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #222;">
                        <span style="font-weight: 900; color: #444; width: 20px; font-size:14px;">${i+1}</span>
                        <img src="${p.imagen}" style="width:35px; height:35px; border-radius:6px; object-fit:cover; background:#222;">
                        <span style="flex: 1; font-size: 13px; color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nombre}</span>
                        <span style="font-weight: 800; font-size: 14px; color: #3498db;">${p.vistas.toLocaleString()}</span>
                    </div>
                `).join('') || '<p style="text-align:center; color:#555; padding:20px; font-size:13px;">Sin visitas de clientes aún.</p>'}
            </div>
        </div>
    `;
}
