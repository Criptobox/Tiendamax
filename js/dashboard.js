function renderizarAnalytics() {
    const el = document.getElementById('analyticsContent');
    if (!el) return;

    const ventas = JSON.parse(localStorage.getItem('registroVentas') || '[]');
    const vistas = JSON.parse(localStorage.getItem('vistasProd') || '{}');

    const totalIngresos = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const gananciaNeta = ventas.reduce((s, v) => s + (v.ganancia || 0), 0);
    const unidadesVendidas = ventas.reduce((s, v) => s + (v.cantidad || 1), 0);

    const agotados = productos.filter(p => p.stock === 0).length;
    const criticos = productos.filter(p => p.stock > 0 && p.stock <= 3).length;

    const performance = productos.map(p => {
        const idStr = String(p.id);
        const v = vistas[idStr] || 0;
        const s = ventas.filter(sale => String(sale.productoId) === idStr).reduce((acc, sale) => acc + (sale.cantidad || 1), 0);
        return { ...p, vistas: v, ventas: s };
    });

    const topVentas = [...performance].sort((a,b) => b.ventas - a.ventas).slice(0, 5);
    const topInteres = [...performance].sort((a,b) => b.vistas - a.vistas).slice(0, 5);

    el.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
            <div style="padding: 20px; border-radius: 15px; text-align: center; background: linear-gradient(135deg, #1e5e2f, #27ae60); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <span style="font-size: 32px; font-weight: 800; display: block; color: white;">$${totalIngresos.toLocaleString()}</span>
                <span style="font-size: 12px; text-transform: uppercase; opacity: 0.9; color: white;">Ventas (USD)</span>
            </div>
            <div style="padding: 20px; border-radius: 15px; text-align: center; background: linear-gradient(135deg, #8a6d3b, #C9A96E); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <span style="font-size: 32px; font-weight: 800; display: block; color: white;">$${gananciaNeta.toLocaleString()}</span>
                <span style="font-size: 12px; text-transform: uppercase; opacity: 0.9; color: white;">Ganancia Neta</span>
            </div>
            <div style="padding: 20px; border-radius: 15px; text-align: center; background: linear-gradient(135deg, #214d72, #3498db); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <span style="font-size: 32px; font-weight: 800; display: block; color: white;">${unidadesVendidas}</span>
                <span style="font-size: 12px; text-transform: uppercase; opacity: 0.9; color: white;">Uds. Vendidas</span>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
            <div style="padding: 15px; border-radius: 12px; border-left: 5px solid #e74c3c; background: rgba(255,255,255,0.05); color: #ff9999;">
                <strong>⚠️ ${agotados} Productos Agotados</strong><br>
                <small style="font-size:11px;">Reponer stock urgente</small>
            </div>
            <div style="padding: 15px; border-radius: 12px; border-left: 5px solid #f39c12; background: rgba(255,255,255,0.05); color: #ffcc66;">
                <strong>⚡ ${criticos} Stock Crítico</strong><br>
                <small style="font-size:11px;">Menos de 3 unidades restantes</small>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div style="background: #1a1a1a; padding: 20px; border-radius: 16px; border: 1px solid #333;">
                <span style="font-size: 16px; color: var(--gold); font-weight: bold; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">🏆 Top Ventas (Uds)</span>
                ${topVentas.filter(p => p.ventas > 0).map((p, i) => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #2a2a2a;">
                        <span style="font-weight: 900; color: #555; width: 20px;">${i+1}</span>
                        <span style="flex: 1; font-size: 14px; color: #eee;">${p.nombre}</span>
                        <span style="font-weight: bold; font-size: 14px; color: var(--gold);">${p.ventas} uds</span>
                    </div>
                `).join('') || '<p style="text-align:center; color:#555; padding:10px;">Sin ventas</p>'}
            </div>

            <div style="background: #1a1a1a; padding: 20px; border-radius: 16px; border: 1px solid #333;">
                <span style="font-size: 16px; color: #3498db; font-weight: bold; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">👁️ Más Vistos</span>
                ${topInteres.filter(p => p.vistas > 0).map((p, i) => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #2a2a2a;">
                        <span style="font-weight: 900; color: #555; width: 20px;">${i+1}</span>
                        <span style="flex: 1; font-size: 14px; color: #eee;">${p.nombre}</span>
                        <span style="font-weight: bold; font-size: 14px; color: #3498db;">${p.vistas} vistas</span>
                    </div>
                `).join('') || '<p style="text-align:center; color:#555; padding:10px;">Sin visitas</p>'}
            </div>
        </div>
    `;
}
