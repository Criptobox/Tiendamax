
// ═══════════════════════════════════════════════════════
//  DASHBOARD REAL-TIME (Métricas Basadas en Hechos)
// ═══════════════════════════════════════════════════════

function renderizarAnalytics() {
    const el = document.getElementById('analyticsContent');
    if (!el) return;

    // 1. CARGA DE DATOS REALES (Strict)
    // Solo lo que el admin confirmó manualmente en la pestaña Ventas
    const ventasConfirmadas = JSON.parse(localStorage.getItem('registroVentas') || '[]');
    // Solo clics reales de clientes en las tarjetas
    const vistasReales = JSON.parse(localStorage.getItem('vistasProd') || '{}');

    // ── CÁLCULO FINANCIERO ──
    const totalIngresos   = ventasConfirmadas.reduce((s, v) => s + (v.total || 0), 0);
    const gananciaNeta    = ventasConfirmadas.reduce((s, v) => s + (v.ganancia || 0), 0);
    const unidadesVendidas = ventasConfirmadas.reduce((s, v) => s + (v.cantidad || 1), 0);

    // ── ESTADO DE INVENTARIO ──
    const agotados = productos.filter(p => p.stock === 0);
    const criticos = productos.filter(p => p.stock > 0 && p.stock <= 3);

    // ── TOP PERFORMANCE ──
    // Procesamos el catálogo comparando vistas vs ventas reales
    const performanceMap = productos.map(p => {
        const idStr = String(p.id);
        const v = vistasReales[idStr] || 0;
        const s = ventasConfirmadas.filter(sale => String(sale.productoId) === idStr)
                                   .reduce((acc, sale) => acc + (sale.cantidad || 1), 0);
        return { ...p, vistas: v, ventas: s };
    });

    const topVentas = [...performanceMap].sort((a,b) => b.ventas - a.ventas).slice(0, 5);
    const topInteres = [...performanceMap].sort((a,b) => b.vistas - a.vistas).slice(0, 5);

    // ── RENDERIZADO UI ──
    el.innerHTML = `
        <!-- Bloque 1: Dinero Real (Solo ventas confirmadas) -->
        <div class="admin-stats-grid">
            <div class="admin-stat-card green">
                <div class="admin-stat-value">$${totalIngresos.toLocaleString()}</div>
                <div class="admin-stat-label">Ingresos Confirmados</div>
            </div>
            <div class="admin-stat-card gold">
                <div class="admin-stat-value">$${gananciaNeta.toLocaleString()}</div>
                <div class="admin-stat-label">Ganancia Real (Comisión)</div>
            </div>
            <div class="admin-stat-card blue">
                <div class="admin-stat-value">${unidadesVendidas}</div>
                <div class="admin-stat-label">Productos Entregados</div>
            </div>
        </div>

        <!-- Bloque 2: Alertas de Stock -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:24px;">
            <div class="admin-alert-box ${agotados.length > 0 ? 'red' : 'green'}" style="margin:0;">
                <strong>${agotados.length} Agotados</strong><br>
                <span>${agotados.length > 0 ? 'No se pueden pedir' : 'Todo disponible'}</span>
            </div>
            <div class="admin-alert-box ${criticos.length > 0 ? 'orange' : 'green'}" style="margin:0; border-color:#f39c12; color:#f39c12; background:rgba(243,156,18,0.05)">
                <strong>${criticos.length} Casi Agotados</strong><br>
                <span>Menos de 3 unidades</span>
            </div>
        </div>

        <!-- Bloque 3: Comparativa Real -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
            
            <div class="admin-chart-box">
                <div class="admin-chart-title">🏆 Ventas Reales (Confirmadas)</div>
                <div class="admin-top-list">
                    ${topVentas.filter(p => p.ventas > 0).map((p, i) => `
                        <div class="admin-top-item">
                            <span class="admin-top-rank">${i+1}</span>
                            <span class="admin-top-name">${p.nombre}</span>
                            <span class="admin-top-value gold">${p.ventas} uds</span>
                        </div>
                    `).join('') || '<p class="admin-empty">Sin ventas hoy</p>'}
                </div>
            </div>

            <div class="admin-chart-box">
                <div class="admin-chart-title">👁️ Interés de Clientes (Vistas)</div>
                <div class="admin-top-list">
                    ${topInteres.filter(p => p.vistas > 0).map((p, i) => `
                        <div class="admin-top-item">
                            <span class="admin-top-rank">${i+1}</span>
                            <span class="admin-top-name">${p.nombre}</span>
                            <span class="admin-top-value blue">👁️ ${p.vistas}</span>
                        </div>
                    `).join('') || '<p class="admin-empty">Sin visitas registradas</p>'}
                </div>
            </div>
        </div>
    `;
}
