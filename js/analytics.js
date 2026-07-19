// ═══════════════════════════════════════════════════════
// 📊 TIENDAMAX ANALYTICS — analytics.js v7
// v7: carnet de identidad (deviceId) — cuenta y borra por dispositivo
//     real. Botón "Borrar todos" para reiniciar lista de suscriptores.
// v6: borrar suscriptor individual + limpiar duplicados
// v5: panel rediseñado + fix contador suscriptores
// ═══════════════════════════════════════════════════════

// ── Sanitización HTML para el panel (anti-XSS) ──────────
function _escH(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _escA(s) { return _escH(s); }

// ── Utilidad: obtener/cargar la URL base de Firebase RTDB ──────
let _tmFbConfigPromise = null;
async function _tmEnsureFirebaseConfig() {
    try {
        const raw = localStorage.getItem('firebaseConfig');
        if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && (cfg.databaseURL || cfg.projectId)) return cfg;
        }
    } catch(e) {}
    if (_tmFbConfigPromise) return _tmFbConfigPromise;
    _tmFbConfigPromise = (async () => {
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
            console.warn('[analytics] No se pudo cargar config.json:', e.message);
        } finally {
            setTimeout(() => { _tmFbConfigPromise = null; }, 1000);
        }
        return null;
    })();
    return _tmFbConfigPromise;
}
function _tmRtdbUrl() {
    try {
        const cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
        if (cfg.databaseURL) return cfg.databaseURL;
        if (cfg.projectId)   return `https://${cfg.projectId}-default-rtdb.firebaseio.com`;
    } catch(e) {}
    return null;
}
// Precargar para que Analytics/limpiador estén listos al abrir el admin.
_tmEnsureFirebaseConfig().catch(() => null);

// ── Rate limiting para prevenir abuso ──────────────────
// El cooldown vivía SOLO en memoria: recargar la página (F5, o simplemente
// entrar y salir del detalle varias veces) reiniciaba _tmAnalyticsSessions
// y cada recarga contaba como una vista nueva — un mismo visitante podía
// inflar el contador a mano entrando 100 veces seguidas al mismo producto.
// Ahora el timestamp también se guarda en sessionStorage, así sobrevive
// recargas dentro de la misma pestaña/sesión (se limpia solo al cerrarla).
const _tmAnalyticsSessions = {};
const _tmAnalyticsCooldown = 30 * 60 * 1000; // 30 min: una "vista" real por sesión, no por click
const _tmAnalyticsMaxPerSession = 200;
let _tmAnalyticsCount = 0;

function _tmCanTrack(tipo, id) {
    const key = `${tipo}_${id}`;
    const now = Date.now();
    if (_tmAnalyticsCount >= _tmAnalyticsMaxPerSession) return false;
    let last = _tmAnalyticsSessions[key];
    if (last === undefined) {
        try { last = parseInt(sessionStorage.getItem('tm_an_' + key) || '0', 10) || 0; } catch(e) { last = 0; }
    }
    if (last && (now - last) < _tmAnalyticsCooldown) return false;
    _tmAnalyticsSessions[key] = now;
    try { sessionStorage.setItem('tm_an_' + key, String(now)); } catch(e) {}
    _tmAnalyticsCount++;
    return true;
}

// ── Registrar un evento (fire-and-forget) ───────────────
// Read-modify-write sin transacción real: bajo tráfico concurrente en el
// mismo producto, la regla de Firebase (".validate": newData == data + 1)
// rechaza el segundo PUT si otro cliente incrementó primero. Reintentamos
// unas pocas veces con el valor fresco en vez de perder el incremento en
// silencio (antes no se chequeaba r.ok del PUT).
async function tmTrackEventoV2(tipo, id) {
    await _tmEnsureFirebaseConfig();
    const base = _tmRtdbUrl();
    if (!base || !id) return;
    if (!_tmCanTrack(tipo, id)) return;
    const url = `${base}/analytics/${tipo}/${String(id)}/count.json`;
    for (let intento = 0; intento < 3; intento++) {
        try {
            const r = await fetch(url);
            const v = r.ok ? (await r.json()) : null;
            const actual = (typeof v === 'number') ? v : 0;
            const put = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actual + 1)
            });
            if (put.ok) return;
            // Rechazado por la regla (otro cliente incrementó primero): reintentar
            // con el valor fresco en vez de perder este incremento en silencio.
        } catch(e) {
            console.warn(`⚠️ Analytics (${tipo}/${id}):`, e);
            return;
        }
    }
}

// ── API pública ─────────────────────────────────────────
function tmTrackVista(productoId)    { tmTrackEventoV2('vistas', productoId); }
function tmTrackWhatsApp(productoId) { tmTrackEventoV2('whatsapp', productoId); }

// ── Contador de suscriptores (caché local) ──────────────
function tmRefrescarConteoSuscriptores() {
    // No incrementar/decrementar “a ciegas”: el contador real es la cantidad
    // de dispositivos únicos guardados en Firebase. Así borrar datos del navegador
    // y volver a activar no infla el número local.
    setTimeout(() => {
        tmLeerAnalytics()
            .then(d => localStorage.setItem('tm_subscriber_count', String(d.suscriptores || 0)))
            .catch(() => null);
    }, 800);
}
function tmRegistrarSuscriptor() { tmRefrescarConteoSuscriptores(); }
function tmDesregistrarSuscriptor() { tmRefrescarConteoSuscriptores(); }

// ── Fetch con timeout ───────────────────────────────────
function _tmFetch(url, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    // Anti-caché: lee siempre la lista fresca de Firebase (antes el navegador/SW
    // servía una copia vieja y los suscriptores dados de baja seguían apareciendo).
    const sep = url.includes('?') ? '&' : '?';
    return fetch(url + sep + '_=' + Date.now(), { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t));
}

// ── Parsear userAgent simple ────────────────────────────
function _tmParseDevice(ua = '') {
    if (/iPhone|iPad|iPod/i.test(ua)) return { tipo: 'iOS', icon: '🍎' };
    if (/Android/i.test(ua))          return { tipo: 'Android', icon: '🤖' };
    if (/Windows/i.test(ua))          return { tipo: 'Windows', icon: '🖥️' };
    if (/Mac/i.test(ua))              return { tipo: 'Mac', icon: '💻' };
    if (/Linux/i.test(ua))            return { tipo: 'Linux', icon: '🐧' };
    return { tipo: 'Otro', icon: '📱' };
}

// ── Tiempo relativo ─────────────────────────────────────
function _tmRelTime(ts) {
    if (!ts) return 'Desconocido';
    const d = Date.now() - ts;
    if (d < 60000)    return 'hace menos de 1 min';
    if (d < 3600000)  return `hace ${Math.floor(d/60000)} min`;
    if (d < 86400000) return `hace ${Math.floor(d/3600000)}h`;
    const days = Math.floor(d/86400000);
    if (days < 7)     return `hace ${days}d`;
    if (days < 30)    return `hace ${Math.floor(days/7)} sem`;
    const meses = Math.floor(days/30);
    if (meses < 1) return 'hace menos de un mes';
    return `hace ${meses} mes${meses > 1 ? 'es' : ''}`;
}

// Cuenta suscriptores únicos. Prioridad: deviceId (carnet) > fingerprint > token.
// Las entradas legacy sin deviceId ni fingerprint cuentan por token string.
function tmContarSuscriptoresUnicos(tokensData = {}) {
    const vals = Object.values(tokensData).filter(t => t && t.token);
    const uasConFp = new Set(vals.filter(t => t.fingerprint && t.userAgent).map(t => t.userAgent));
    const claves = new Set();
    vals.forEach(t => {
        if (t.deviceId) {
            claves.add('did:' + t.deviceId);
        } else if (t.fingerprint) {
            claves.add('fp:' + t.fingerprint);
        } else if (t.userAgent && uasConFp.has(t.userAgent)) {
            // legacy: mismo dispositivo ya re-registrado con fingerprint, no contar doble
            return;
        } else {
            claves.add('tk:' + t.token);
        }
    });
    return claves.size;
}
window.tmContarSuscriptoresUnicos = tmContarSuscriptoresUnicos;

// ── Leer todos los datos de analytics ───────────────────
async function tmLeerAnalytics() {
    await _tmEnsureFirebaseConfig();
    const base = _tmRtdbUrl();
    if (!base) return { vistas: {}, whatsapp: {}, suscriptores: 0, tokensData: {} };

    const results = await Promise.allSettled([
        _tmFetch(`${base}/analytics/vistas.json`),
        _tmFetch(`${base}/analytics/whatsapp.json`),
        _tmFetch(`${base}/tokens.json`)   // full para ver timestamps y userAgents
    ]);

    let vistas = {}, whatsapp = {}, tokensData = {};

    if (results[0].status === 'fulfilled' && results[0].value.ok) {
        try { vistas = await results[0].value.json() || {}; } catch(e) {}
    }
    if (results[1].status === 'fulfilled' && results[1].value.ok) {
        try { whatsapp = await results[1].value.json() || {}; } catch(e) {}
    }
    if (results[2].status === 'fulfilled' && results[2].value.ok) {
        try { tokensData = await results[2].value.json() || {}; } catch(e) {}
    }

    // Convertir contadores (acepta {count: N} o N directamente)
    const vistasCont = {}, whatsappCont = {};
    Object.entries(vistas).forEach(([id, v]) => {
        vistasCont[id] = (typeof v === 'object' ? v.count : v) || 0;
    });
    Object.entries(whatsapp).forEach(([id, v]) => {
        whatsappCont[id] = (typeof v === 'object' ? v.count : v) || 0;
    });

    // Suscriptores: Firebase como fuente de verdad, contando dispositivos únicos
    const suscriptores = tmContarSuscriptoresUnicos(tokensData);
    // Sincronizar caché local con el valor real
    try { localStorage.setItem('tm_subscriber_count', String(suscriptores)); } catch(e) {}

    return { vistas: vistasCont, whatsapp: whatsappCont, suscriptores, tokensData };
}

// ── Panel de Analytics ───────────────────────────────────
async function renderizarAnalyticsFirebase() {
    const el = document.getElementById('analyticsContent');
    if (!el) return;

    el.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">
        <div style="font-size:28px;margin-bottom:10px">⏳</div>
        <div style="font-size:13px;">Cargando datos de Firebase...</div>
    </div>`;

    // Datos locales de productos
    const prods = (typeof productos !== 'undefined') ? productos : [];
    const totalProductos = prods.length;
    const totalStock     = prods.reduce((s, p) => s + (p.stock || 0), 0);
    const sinStockList   = prods.filter(p => (p.stock || 0) === 0);
    const stockBajo      = prods.filter(p => p.stock > 0 && p.stock <= 3);

    const catConteo = {};
    prods.forEach(p => { catConteo[p.categoria] = (catConteo[p.categoria] || 0) + 1; });
    const topCats = Object.entries(catConteo).sort((a,b) => b[1]-a[1]).slice(0,5);

    // Datos de Firebase
    const { vistas, whatsapp, suscriptores, tokensData } = await tmLeerAnalytics();

    // Ventas: localStorage primero, luego Firebase RTDB como fallback o si tiene más registros
    let _ventasGrafica = (typeof cargarVentas === 'function') ? cargarVentas() : [];
    try {
        const _vbase = _tmRtdbUrl();
        if (_vbase) {
            const _vr = await _tmFetch(`${_vbase}/ventas.json`);
            if (_vr.ok) {
                const _vraw = await _vr.json();
                if (_vraw && typeof _vraw === 'object') {
                    const _vfb = Object.values(_vraw).filter(Boolean).sort((a, b) => b.id - a.id);
                    if (_vfb.length > _ventasGrafica.length) {
                        _ventasGrafica = _vfb;
                        try { localStorage.setItem('registroVentas', JSON.stringify(_vfb.slice(0, 500))); } catch(e) {}
                    }
                }
            }
        }
    } catch(e) {}

    // Demanda de restock: cuántos "avísame" tiene cada producto
    let avisosCount = {};
    try {
        const base = _tmRtdbUrl();
        if (base) {
            const r = await _tmFetch(`${base}/avisos_count.json`);
            if (r.ok) {
                const raw = await r.json() || {};
                Object.entries(raw).forEach(([id, v]) => {
                    avisosCount[id] = (v && typeof v === 'object' ? v.count : v) || 0;
                });
            }
        }
    } catch (e) {}

    // Búsquedas: Firebase como fuente de verdad, merge con localStorage del dispositivo
    let busquedasData = {};
    try {
        const base = _tmRtdbUrl();
        if (base) {
            const r = await _tmFetch(`${base}/analytics/busquedas.json`);
            if (r.ok) {
                const raw = await r.json() || {};
                if (raw && typeof raw === 'object') busquedasData = raw;
            }
        }
    } catch(e) {}
    try {
        const ls = JSON.parse(localStorage.getItem('tm_busquedas_v1') || '{}');
        Object.entries(ls).forEach(([term, cnt]) => {
            busquedasData[term] = Math.max(busquedasData[term] || 0, cnt);
        });
    } catch(e) {}

    const totalVistas = Object.values(vistas).reduce((s,n) => s+n, 0);
    const totalWA     = Object.values(whatsapp).reduce((s,n) => s+n, 0);
    const conversion  = totalVistas > 0 ? ((totalWA / totalVistas) * 100).toFixed(1) : '0.0';

    // Top 5 por vistas
    const topVistas = Object.entries(vistas)
        .sort((a,b) => b[1]-a[1]).slice(0,5)
        .map(([id,count]) => {
            const p = prods.find(x => String(x.id) === String(id));
            return { id, count, nombre: p ? p.nombre : `Producto ${id}`, categoria: p ? p.categoria : '—', wa: whatsapp[id] || 0 };
        });
    const maxV = topVistas.length ? topVistas[0].count : 1;

    // Top 5 por WhatsApp
    const topWA = Object.entries(whatsapp)
        .sort((a,b) => b[1]-a[1]).slice(0,5)
        .map(([id,count]) => {
            const p = prods.find(x => String(x.id) === String(id));
            return { id, count, nombre: p ? p.nombre : `Producto ${id}`, v: vistas[id] || 0 };
        });
    const maxWA = topWA.length ? topWA[0].count : 1;

    // Conversión por categoría
    const convCat = {};
    prods.forEach(p => {
        const id = String(p.id), cat = p.categoria || 'Sin categoría';
        if (!convCat[cat]) convCat[cat] = { v:0, w:0 };
        convCat[cat].v += vistas[id] || 0;
        convCat[cat].w += whatsapp[id] || 0;
    });
    const convCatArr = Object.entries(convCat)
        .map(([cat,d]) => ({ cat, pct: d.v > 0 ? ((d.w/d.v)*100).toFixed(1) : '0.0', v:d.v, w:d.w }))
        .filter(x => x.v > 0).sort((a,b) => parseFloat(b.pct)-parseFloat(a.pct)).slice(0,6);

    // Oportunidades: vistas altas pero 0 clicks WA
    const oportunidades = Object.entries(vistas)
        .filter(([id,v]) => v >= 3 && !(whatsapp[id]))
        .sort((a,b) => b[1]-a[1]).slice(0,4)
        .map(([id,v]) => {
            const p = prods.find(x => String(x.id) === String(id));
            return { id, v, nombre: p ? p.nombre : `Producto ${id}` };
        });

    // Sin datos de Firebase nada
    const sinEngagement = prods.filter(p => !vistas[String(p.id)] && !whatsapp[String(p.id)]).length;

    // Breakdown de dispositivos de suscriptores
    const deviceCount = {};
    Object.values(tokensData).forEach(t => {
        const { tipo, icon } = _tmParseDevice(t.userAgent || '');
        deviceCount[tipo] = { count: (deviceCount[tipo]?.count || 0) + 1, icon };
    });
    const deviceArr = Object.entries(deviceCount).sort((a,b) => b[1].count - a[1].count);

    // Suscriptores únicos ordenados por timestamp desc (un registro por dispositivo)
    const _devSeen = new Set();
    const recientes = Object.entries(tokensData)
        .filter(([, t]) => t && t.token)
        .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0))
        .filter(([, t]) => {
            const dk = t.fingerprint ? 'fp:' + t.fingerprint : 'tk:' + t.token;
            if (_devSeen.has(dk)) return false;
            _devSeen.add(dk);
            return true;
        })
        .map(([k, t]) => ({ ...t, _fbKey: k }));

    const noFirebase = !_tmRtdbUrl();

    // ─── RENDER ────────────────────────────────────────────
    el.innerHTML = `
        ${noFirebase ? `<div style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#e74c3c;">
            ⚠️ Firebase no configurado — ve a <strong>⚙️ Config</strong> y pega tu configuración de Firebase.
        </div>` : ''}

        <!-- KPIs principales -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px;">
            ${_kpi('👁️','Vistas', totalVistas, '#3B82F6', totalVistas === 0 ? 'sin datos' : topVistas[0] ? '↑ ' + topVistas[0].nombre.slice(0,12) : '')}
            ${_kpi('💬','Clicks WA', totalWA, '#25D366', totalWA === 0 ? 'sin pedidos aún' : totalWA === 1 ? '1 pedido' : totalWA + ' pedidos')}
            ${_kpi('🔔','Suscriptores', suscriptores, '#F59E0B', suscriptores === 0 ? 'nadie aún' : deviceArr[0] ? deviceArr[0][1].icon + ' ' + deviceArr[0][0] : '')}
            ${_kpi('📈','Conversión', conversion + '%', '#8B5CF6', totalVistas > 0 ? totalWA + ' de ' + totalVistas : 'sin tráfico')}
            ${_kpi('📦','Productos', totalProductos, '#06B6D4', stockBajo.length > 0 ? '⚠️ ' + stockBajo.length + ' bajo' : 'catálogo ok')}
            ${_kpi('⚠️','Sin stock', sinStockList.length, '#EF4444', sinStockList.length > 0 ? sinStockList[0].nombre.slice(0,12) : '✅ ok')}
        </div>

        <!-- Gráfica mensual de ventas -->
        ${(() => {
            const ventas = _ventasGrafica;
            if (ventas.length === 0) return '';
            const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            const totalesMes = Array(12).fill(0);
            const anioActual = new Date().getFullYear();
            ventas.forEach(v => {
                const d = new Date(v.fecha || v.id);
                if (!isNaN(d.getTime()) && d.getFullYear() === anioActual) {
                    totalesMes[d.getMonth()] += v.total || 0;
                }
            });
            const maxM = Math.max(...totalesMes, 1);
            const mesActual = new Date().getMonth();
            const totalAnio = totalesMes.reduce((s,n) => s+n, 0);
            if (totalAnio === 0) return '';
            const bars = meses.map((m, i) => {
                const esActual = i === mesActual;
                const tieneVentas = totalesMes[i] > 0;
                const h = tieneVentas ? Math.max(8, Math.round((totalesMes[i] / maxM) * 60)) : 0;
                const labelColor = esActual ? '#c9a96e' : tieneVentas ? '#666' : '#333';
                return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end;">' +
                    (tieneVentas
                        ? '<div title="' + m + ': $' + totalesMes[i].toFixed(0) + '" style="width:80%;height:' + h + 'px;border-radius:3px 3px 0 0;' +
                          'background:' + (esActual ? 'linear-gradient(180deg,#f0a500,#c97d00)' : 'rgba(240,165,0,0.45)') + ';cursor:pointer;transition:opacity .2s;" ' +
                          'onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1"></div>'
                        : '<div style="width:2px;height:4px;background:#2a2a3a;border-radius:1px;"></div>') +
                    '<div style="font-size:8px;color:' + labelColor + ';font-weight:' + (esActual ? '700' : '400') + ';">' + m + '</div></div>';
            }).join('');
            return '<div style="' + _cardStyle() + 'padding:14px;margin-bottom:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<div style="font-size:13px;font-weight:700;color:#fff;">📅 Ventas ' + anioActual + '</div>' +
                '<div style="font-size:13px;font-weight:800;color:#f0a500;">$' + totalAnio.toFixed(0) + '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:flex-end;gap:4px;height:72px;">' + bars + '</div>' +
                '</div>';
        })()}

        <!-- Funnel compacto — fila horizontal debajo del chart -->
        ${totalVistas > 0 ? (() => {
            const convColor = parseFloat(conversion) >= 10 ? '#25d366' : parseFloat(conversion) >= 5 ? '#c9a96e' : '#e74c3c';
            const perdidos = totalVistas - totalWA;
            const barWaPct = Math.round((totalWA / totalVistas) * 100);
            return `<div style="${_cardStyle()}padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:0;">
                <!-- Vistas -->
                <div style="text-align:center;min-width:64px;">
                    <div style="font-size:18px;font-weight:800;color:#c9a96e;">${totalVistas}</div>
                    <div style="font-size:10px;color:#888;">👁️ Vistas</div>
                </div>
                <!-- Barra de progreso -->
                <div style="flex:1;margin:0 10px;">
                    <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${barWaPct}%;background:${convColor};border-radius:3px;transition:width .4s;"></div>
                    </div>
                    <div style="text-align:center;margin-top:4px;font-size:10px;color:#666;">${perdidos} no convirtieron</div>
                </div>
                <!-- Conversión % -->
                <div style="text-align:center;min-width:44px;">
                    <div style="font-size:16px;font-weight:800;color:${convColor};">${conversion}%</div>
                    <div style="font-size:10px;color:#888;">conv.</div>
                </div>
                <!-- Separador -->
                <div style="width:1px;height:36px;background:rgba(255,255,255,0.07);margin:0 12px;flex-shrink:0;"></div>
                <!-- Pedidos WA -->
                <div style="text-align:center;min-width:52px;">
                    <div style="font-size:18px;font-weight:800;color:#25d366;">${totalWA}</div>
                    <div style="font-size:10px;color:#888;">💬 WA</div>
                </div>
            </div>`;
        })() : ''}

        <!-- Top productos con ambas métricas -->
        <div style="${_cardStyle()}padding:14px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:#fff;">🏆 Top productos</div>
            ${topVistas.length === 0
                ? `<div style="font-size:12px;color:#888;padding:12px 0;text-align:center;">Sin datos aún. Las vistas aparecen cuando los clientes abren los productos.</div>`
                : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                    <div style="font-size:10px;color:#666;font-weight:600;letter-spacing:.5px;">PRODUCTO</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                        <div style="font-size:10px;color:#c9a96e;font-weight:600;text-align:right;">VISTAS</div>
                        <div style="font-size:10px;color:#25d366;font-weight:600;text-align:right;">WA</div>
                    </div>
                </div>
                ${topVistas.map((p,i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + '.';
                    const barPct = Math.round(p.count/maxV*100);
                    return `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:7px 0;border-top:1px solid rgba(255,255,255,0.05);align-items:center;">
                    <div>
                        <span style="font-size:${i<3?'14px':'10px'};margin-right:5px;vertical-align:middle;">${medal}</span>
                        <span style="font-size:11px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:130px;vertical-align:middle">${p.nombre}</span>
                        <div style="margin-top:4px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                            <div style="height:100%;background:linear-gradient(90deg,#3B82F6,#60A5FA);width:${barPct}%;border-radius:2px;transition:width .4s;"></div>
                        </div>
                        <div style="font-size:9px;color:#555;margin-top:1px;">${barPct}% del top</div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:right;">
                        <span style="font-size:13px;font-weight:700;color:#3B82F6;">${p.count}</span>
                        <span style="font-size:13px;font-weight:700;color:${p.wa>0?'#25D366':'#555'};">${p.wa}</span>
                    </div>
                </div>`;}).join('')}`
            }
        </div>

        <!-- Alerta: productos sin engagement -->
        ${sinEngagement > 0 && sinEngagement >= Math.ceil(totalProductos * 0.4) ? `
        <div style="background:rgba(230,126,34,0.08);border:1px solid rgba(230,126,34,0.3);border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;">
            <div style="font-size:24px;flex-shrink:0;">👻</div>
            <div>
                <div style="font-size:13px;font-weight:700;color:#e67e22;margin-bottom:4px;">${sinEngagement} productos sin ninguna vista (${Math.round(sinEngagement/totalProductos*100)}% del catálogo)</div>
                <div style="font-size:11px;color:#aaa;line-height:1.5;">Estos productos nunca han sido vistos. Revisa sus fotos, precios o si aparecen bien en el catálogo.</div>
            </div>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <!-- Conversión por categoría -->
            <div style="${_cardStyle()}padding:14px;">
                <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:#fff;">📊 Conversión / categoría</div>
                ${convCatArr.length === 0
                    ? `<div style="font-size:11px;color:#888;padding:8px 0;text-align:center;">Sin datos</div>`
                    : convCatArr.map(c => {
                        const pctVal = parseFloat(c.pct);
                        const barColor = pctVal >= 30 ? '#25D366' : pctVal >= 10 ? '#F59E0B' : '#EF4444';
                        const pctColor = pctVal >= 30 ? '#25D366' : pctVal >= 10 ? '#F59E0B' : '#EF4444';
                        return `
                    <div style="margin-bottom:9px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:10px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">${c.cat}</span>
                            <span style="font-size:11px;font-weight:700;color:${pctColor};">${c.pct}%</span>
                        </div>
                        <div style="height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;">
                            <div style="height:100%;border-radius:2px;background:${barColor};width:${Math.min(100,pctVal*4)}%;transition:width .4s;"></div>
                        </div>
                        <div style="font-size:10px;color:#666;margin-top:2px;">${c.v}v · ${c.w}wa</div>
                    </div>`;}).join('')
                }
            </div>

            <!-- Inventario health -->
            <div style="${_cardStyle()}padding:14px;">
                <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:#fff;">📦 Salud del inventario</div>
                ${_inventarioItem('✅','Con stock', totalProductos - sinStockList.length, '#25d366')}
                ${_inventarioItem('🟡','Stock bajo (≤3)', stockBajo.length, stockBajo.length > 0 ? '#f39c12' : '#555')}
                ${_inventarioItem('🔴','Agotados', sinStockList.length, sinStockList.length > 0 ? '#e74c3c' : '#555')}
                ${_inventarioItem('👻','Sin engagement', sinEngagement, sinEngagement > 2 ? '#e17055' : '#555')}
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);">
                    <div style="font-size:10px;color:#888;margin-bottom:4px;">Unidades totales en stock</div>
                    <div style="font-size:18px;font-weight:700;color:#c9a96e;">${totalStock}</div>
                </div>
            </div>
        </div>

        <!-- Reponer pronto: stock bajo con contexto de demanda -->
        ${stockBajo.length > 0 ? (() => {
            const urgentes = stockBajo
                .map(p => ({ p, v: vistas[String(p.id)] || 0, wa: whatsapp[String(p.id)] || 0 }))
                .sort((a, b) => b.v - a.v);
            return `<div style="${_cardStyle()}padding:14px;margin-bottom:16px;">
                <div style="font-size:13px;font-weight:700;color:#f39c12;margin-bottom:10px;">⚠️ Reponer pronto — stock ≤ 3</div>
                ${urgentes.map(({p, v, wa}) => {
                    const col = p.stock === 1 ? '#e74c3c' : '#f39c12';
                    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,0.05);">
                        <div style="width:32px;height:32px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#111;">
                            <img src="${p.imagen || ''}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" loading="lazy">
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.nombre}</div>
                            <div style="font-size:10px;color:#888;">👁 ${v}v · 💬 ${wa}wa · $${Number(p.precioActual).toFixed(0)} USD</div>
                        </div>
                        <div style="font-size:22px;font-weight:800;color:${col};flex-shrink:0;min-width:20px;text-align:right;">${p.stock}</div>
                    </div>`;
                }).join('')}
            </div>`;
        })() : ''}

        <!-- Demanda de reposición: agotados con "avísame" -->
        ${(() => {
            const esperando = sinStockList
                .map(p => ({ p, n: avisosCount[String(p.id)] || 0 }))
                .filter(x => x.n > 0)
                .sort((a, b) => b.n - a.n);
            if (esperando.length === 0) {
                return `<div style="${_cardStyle()}padding:14px;margin-bottom:16px;">
                    <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">🔔 Esperando reposición</div>
                    <div style="font-size:11px;color:#888;">Ningún producto agotado tiene solicitudes de aviso por ahora.</div>
                </div>`;
            }
            const totalEsperando = esperando.reduce((s, x) => s + x.n, 0);
            return `<div style="${_cardStyle()}padding:14px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                    <div style="font-size:13px;font-weight:700;color:#fff;">🔔 Esperando reposición
                        <span style="background:rgba(201,169,110,0.2);color:#c9a96e;border-radius:20px;padding:2px 10px;font-size:12px;margin-left:6px;">${totalEsperando} solicitudes</span>
                    </div>
                </div>
                <div style="font-size:10px;color:#888;margin-bottom:8px;">Productos agotados que tus clientes quieren. Repón primero los de arriba.</div>
                ${esperando.map((x, i) => `
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i < esperando.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.05);' : ''}">
                        <img src="${_escA(x.p.imagen || '')}" alt="" loading="lazy" style="width:36px;height:36px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#222;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_escH(x.p.nombre || 'Producto')}</div>
                            <div style="font-size:10px;color:#888;">${x.p.categoria || 'Sin categoría'}</div>
                        </div>
                        <div style="font-size:14px;font-weight:700;color:#c9a96e;flex-shrink:0;">${x.n} <span style="font-size:10px;color:#888;font-weight:400;">esperan</span></div>
                    </div>`).join('')}
            </div>`;
        })()}

        <!-- Suscriptores push -->
        <div style="${_cardStyle()}padding:14px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div style="font-size:13px;font-weight:700;color:#fff;">🔔 Suscriptores push <span style="background:rgba(79,195,247,0.2);color:#4fc3f7;border-radius:20px;padding:2px 10px;font-size:12px;margin-left:6px;">${suscriptores}</span></div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button id="tm-btn-dedup" onclick="tmLimpiarDuplicados()" style="font-size:11px;padding:5px 12px;border-radius:8px;background:rgba(79,195,247,0.12);border:1px solid rgba(79,195,247,0.3);color:#4fc3f7;cursor:pointer;">🔁 Limpiar duplicados</button>
                <button id="tm-btn-limpiar" onclick="tmLimpiarTokensInvalidos()" style="font-size:11px;padding:5px 12px;border-radius:8px;background:rgba(231,76,60,0.12);border:1px solid rgba(231,76,60,0.3);color:#e74c3c;cursor:pointer;">🧹 Tokens inválidos</button>
                <button id="tm-btn-borrar-todos" onclick="tmBorrarTodosSuscriptores()" style="font-size:11px;padding:5px 12px;border-radius:8px;background:rgba(180,0,0,0.18);border:1px solid rgba(180,0,0,0.4);color:#ff6b6b;cursor:pointer;">🗑 Borrar todos</button>
                </div>
            </div>
            <div id="tm-limpiar-info" style="font-size:12px;margin-bottom:10px;min-height:16px;"></div>
            ${suscriptores === 0 ? `<div style="font-size:12px;color:#888;text-align:center;padding:12px 0;">Ningún suscriptor aún. Los clientes se suscriben desde la campana 🔔 del sitio.</div>` : `
            <!-- Breakdown por dispositivo -->
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                ${deviceArr.map(([tipo,{count,icon}]) => `
                <div style="background:rgba(79,195,247,0.1);border:1px solid rgba(79,195,247,0.2);border-radius:20px;padding:4px 12px;font-size:12px;color:#4fc3f7;">
                    ${icon} ${tipo} <strong>${count}</strong>
                </div>`).join('')}
            </div>
            <!-- Recientes -->
            <div style="font-size:11px;color:#666;font-weight:600;margin-bottom:6px;letter-spacing:.5px;">ÚLTIMAS SUSCRIPCIONES</div>
            ${recientes.length === 0
                ? `<div style="font-size:11px;color:#888;">Sin timestamp disponible</div>`
                : recientes.map(t => {
                    const { tipo, icon } = _tmParseDevice(t.userAgent || '');
                    const fechaCorta = t.timestamp ? new Date(t.timestamp).toLocaleDateString('es-ES', {day:'2-digit', month:'short'}) : '';
                    const browser = /Chrome/i.test(t.userAgent||'') ? 'Chrome' : /Firefox/i.test(t.userAgent||'') ? 'Firefox' : /Safari/i.test(t.userAgent||'') ? 'Safari' : /Edge/i.test(t.userAgent||'') ? 'Edge' : '';
                    const fbKey = _escA(t._fbKey || '');
                    const fp    = _escA(t.fingerprint || '');
                    const tok   = _escA(t.token || '');
                    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <div style="width:34px;height:34px;background:rgba(79,195,247,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${icon}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12px;color:#ddd;font-weight:600;">${tipo}${browser ? ' · ' + browser : ''}</div>
                            <div style="font-size:10px;color:#666;">${_tmRelTime(t.timestamp)}</div>
                        </div>
                        ${fechaCorta ? `<div style="font-size:10px;color:#555;flex-shrink:0;">${fechaCorta}</div>` : ''}
                        <button onclick="tmBorrarSuscriptor('${fbKey}','${fp}','${tok}')" title="Borrar este suscriptor" style="background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.35);color:#e74c3c;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;flex-shrink:0;">🗑</button>
                    </div>`;
                }).join('')}
            `}
        </div>

        <!-- Oportunidades -->
        ${oportunidades.length > 0 ? `
        <div style="${_cardStyle()}border-color:rgba(230,126,34,0.3);padding:14px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#e67e22;">💡 Oportunidades de mejora</div>
            <div style="font-size:11px;color:#888;margin-bottom:12px;">Productos con vistas pero sin pedidos — revisa precio, descripción o foto.</div>
            ${oportunidades.map(o => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:12px;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${o.nombre}</span>
                <span style="font-size:11px;color:#e67e22;background:rgba(230,126,34,0.15);padding:2px 8px;border-radius:10px;">${o.v} vistas · 0 pedidos</span>
            </div>`).join('')}
        </div>` : ''}

        <!-- Categorías por inventario -->
        <div style="${_cardStyle()}padding:14px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:#fff;">🏷️ Distribución por categoría</div>
            ${topCats.map(([cat,n]) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="font-size:11px;color:#888;width:90px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat}</span>
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;border-radius:3px;background:linear-gradient(90deg,#c9a96e,#e8c88a);width:${totalProductos>0?Math.round(n/totalProductos*100):0}%;"></div>
                </div>
                <span style="font-size:12px;font-weight:700;color:#c9a96e;min-width:20px;text-align:right;">${n}</span>
            </div>`).join('')}
        </div>

        <!-- Pie de actualización -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="font-size:11px;color:#555;">Fuente: Firebase Realtime Database</span>
            <button onclick="renderizarAnalyticsFirebase()" style="font-size:12px;padding:6px 16px;border-radius:8px;background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.3);color:#c9a96e;cursor:pointer;">
                🔄 Actualizar
            </button>
        </div>

        <div style="margin-top:28px">
            <h4 style="font-size:13px;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:14px;display:flex;align-items:center;gap:8px;"><span style="background:rgba(201,169,110,.15);border:1px solid rgba(201,169,110,.25);border-radius:8px;padding:4px 10px;font-size:11px;color:#C9A96E">🔍 Búsquedas</span></h4>
            ${(function(){
                try {
                    const top = Object.entries(busquedasData).sort((a,b)=>b[1]-a[1]).slice(0,8);
                    if (!top.length) return '<p style="font-size:12px;color:#555;font-style:italic">Sin búsquedas registradas aún.</p>';
                    const max = top[0][1];
                    return top.map(([term, cnt]) =>
                        `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                            <span style="font-size:12px;color:rgba(255,255,255,.75);min-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escH(term)}</span>
                            <div style="flex:1;height:6px;background:#1e1e1e;border-radius:3px;overflow:hidden">
                                <div style="height:100%;width:${Math.round(cnt/max*100)}%;background:linear-gradient(90deg,#C9A96E,#e8c88a);border-radius:3px"></div>
                            </div>
                            <span style="font-size:11px;color:#666;min-width:24px;text-align:right">${cnt}</span>
                        </div>`
                    ).join('');
                } catch(e) { return ''; }
            })()}
        </div>
    `;
}

// ── Helpers de render ────────────────────────────────────
function _cardStyle() {
    return `background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;`;
}
function _kpi(icon, label, value, color = '#c9a96e', sub = '') {
    const subTrimmed = sub.length > 16 ? sub.slice(0, 14) + '…' : sub;
    return `<div style="background:linear-gradient(135deg,${color}dd,${color}99);border-radius:12px;padding:12px 8px;text-align:center;box-shadow:0 2px 8px ${color}44;">
        <div style="font-size:15px;margin-bottom:2px;">${icon}</div>
        <div style="font-size:22px;font-weight:900;color:#fff;line-height:1.1;text-shadow:0 1px 3px rgba(0,0,0,.3);">${value}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.85);margin-top:3px;letter-spacing:.3px;">${label}</div>
        ${subTrimmed ? `<div style="font-size:9px;color:rgba(255,255,255,.65);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subTrimmed}</div>` : ''}
    </div>`;
}
function _inventarioItem(icon, label, value, color = '#c9a96e') {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:11px;color:#aaa;">${icon} ${label}</span>
        <span style="font-size:13px;font-weight:700;color:${color};">${value}</span>
    </div>`;
}

// ── _statCard legacy (compatibilidad con código externo) ─
function _statCard(icon, label, value, color) {
    return _kpi(icon, label, value, color || '#c9a96e');
}

// ── Limpiar tokens muertos de Firebase ──────────────────
// Usa dry_run=true: FCM valida los tokens sin enviar nada.
// Borra los que devuelven NotRegistered o InvalidRegistration.
// NOTA: antes había una rama que validaba tokens contra la Legacy FCM HTTP
// API (fcm.googleapis.com/fcm/send con "Authorization: key=..."). Google
// retiró ese endpoint por completo en junio de 2024 — esa rama solo fallaba
// con un error de HTTP siempre que hubiera una Server Key configurada, en
// vez de usar la limpieza por antigüedad (que sí funciona). Se quitó del
// todo y se dejó solo el criterio por antigüedad como único mecanismo.
async function tmLimpiarTokensInvalidos() {
    await _tmEnsureFirebaseConfig();
    const btnId  = 'tm-btn-limpiar';
    const infoId = 'tm-limpiar-info';
    const btn    = document.getElementById(btnId);
    const info   = document.getElementById(infoId);
    const notify = (msg, t = 'info') => {
        if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion(msg, t);
        if (info) {
            const col = t === 'success' ? '#25d366' : t === 'error' ? '#e74c3c' : '#f39c12';
            info.innerHTML = `<span style="color:${col}">${msg}</span>`;
        }
    };

    const base = _tmRtdbUrl();
    if (!base) { notify('⚠️ Firebase no configurado.', 'warning'); return; }
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Limpiando…'; }
    try {
        const res = await _tmFetch(`${base}/tokens.json`);
        if (!res.ok) throw new Error('No se pudo leer la base de datos');
        const tokensData = await res.json();
        if (!tokensData) { notify('✅ No hay tokens que limpiar.', 'success'); return; }
        const DIAS_45 = 45 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - DIAS_45;
        const viejos = Object.keys(tokensData).filter(k => {
            const t = tokensData[k];
            return t && t.timestamp && t.timestamp < cutoff;
        });
        if (viejos.length === 0) {
            notify('✅ No hay tokens viejos (>45 días). Todo limpio.', 'success');
        } else {
            await Promise.allSettled(viejos.map(k => fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })));
            notify(`✅ ${viejos.length} token${viejos.length>1?'s':''} eliminado${viejos.length>1?'s':''} (>45 días).`, 'success');
            setTimeout(() => renderizarAnalyticsFirebase(), 1200);
        }
    } catch(e) {
        notify('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🧹 Limpiar tokens inválidos'; }
    }
}
window.tmLimpiarTokensInvalidos = tmLimpiarTokensInvalidos;

// ── Borrar todas las entradas de un dispositivo específico ─
// fbKey: clave Firebase del registro principal (más seguro)
// fingerprint y token: para encontrar duplicados del mismo dispositivo
async function tmBorrarSuscriptor(fbKey, fingerprint, token) {
    const base = _tmRtdbUrl();
    if (!base) return;
    const res = await fetch(`${base}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const tokensData = await res.json() || {};
    const toDelete = Object.entries(tokensData).filter(([k, t]) => {
        if (!t || !t.token) return false;
        if (fbKey && k === fbKey) return true;
        if (fingerprint && t.fingerprint === fingerprint) return true;
        if (token && t.token === token) return true;
        return false;
    }).map(([k]) => k);
    await Promise.allSettled(toDelete.map(k =>
        fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })
    ));
    if (typeof window.mostrarNotificacion === 'function')
        window.mostrarNotificacion('✅ Suscriptor eliminado.', 'success');
    if (typeof window.tmAdminRefreshSubscribers === 'function') window.tmAdminRefreshSubscribers();
    setTimeout(() => { if (typeof renderizarAnalyticsFirebase === 'function') renderizarAnalyticsFirebase(); }, 800);
}
window.tmBorrarSuscriptor = tmBorrarSuscriptor;

// ── Borrar TODOS los suscriptores (reinicio completo) ──────
async function tmBorrarTodosSuscriptores() {
    if (!window.confirm('¿Borrar TODOS los suscriptores? Esta acción no se puede deshacer.\n\nLos clientes que vuelvan a activar notificaciones se registrarán de nuevo automáticamente.')) return;
    const base = _tmRtdbUrl();
    if (!base) { if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('⚠️ Firebase no configurado.', 'warning'); return; }
    const btn = document.getElementById('tm-btn-borrar-todos');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Borrando…'; }
    try {
        const res = await fetch(`${base}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo leer la base de datos');
        const tokensData = await res.json() || {};
        const keys = Object.keys(tokensData);
        if (keys.length === 0) {
            if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('✅ Ya no hay suscriptores.', 'success');
            return;
        }
        await Promise.allSettled(keys.map(k =>
            fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })
        ));
        if (typeof window.mostrarNotificacion === 'function')
            window.mostrarNotificacion(`✅ ${keys.length} suscriptor${keys.length > 1 ? 'es' : ''} eliminado${keys.length > 1 ? 's' : ''}. Lista reiniciada.`, 'success');
        if (typeof window.tmAdminRefreshSubscribers === 'function') window.tmAdminRefreshSubscribers();
        setTimeout(() => { if (typeof renderizarAnalyticsFirebase === 'function') renderizarAnalyticsFirebase(); }, 800);
    } catch(e) {
        if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🗑 Borrar todos'; }
    }
}
window.tmBorrarTodosSuscriptores = tmBorrarTodosSuscriptores;

// ── Fusionar entradas duplicadas (mismo dispositivo, varias claves) ─
async function tmLimpiarDuplicados() {
    await _tmEnsureFirebaseConfig();
    const base = _tmRtdbUrl();
    if (!base) { if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('⚠️ Firebase no configurado.', 'warning'); return; }
    const btnDedup = document.getElementById('tm-btn-dedup');
    if (btnDedup) { btnDedup.disabled = true; btnDedup.textContent = '⏳ Limpiando…'; }
    try {
        const res = await fetch(`${base}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo leer la base de datos');
        const tokensData = await res.json() || {};
        const entries = Object.entries(tokensData).filter(([, t]) => t && t.token);
        // Por cada dispositivo, quedarse con la entrada más reciente
        const bestByDevice = {};
        entries.forEach(([k, t]) => {
            const dk = t.deviceId ? 'did:' + t.deviceId : t.fingerprint ? 'fp:' + t.fingerprint : 'tk:' + t.token;
            if (!bestByDevice[dk] || (t.timestamp || 0) > (bestByDevice[dk].ts || 0)) {
                bestByDevice[dk] = { key: k, ts: t.timestamp || 0 };
            }
        });
        const keepKeys = new Set(Object.values(bestByDevice).map(d => d.key));
        const deleteKeys = entries.filter(([k]) => !keepKeys.has(k)).map(([k]) => k);
        if (deleteKeys.length === 0) {
            if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('✅ Sin duplicados. Todo limpio.', 'success');
        } else {
            await Promise.allSettled(deleteKeys.map(k =>
                fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })
            ));
            if (typeof window.mostrarNotificacion === 'function')
                window.mostrarNotificacion(`✅ ${deleteKeys.length} entradas duplicadas eliminadas. Ahora cada suscriptor tiene exactamente 1 entrada.`, 'success');
        }
        if (typeof window.tmAdminRefreshSubscribers === 'function') window.tmAdminRefreshSubscribers();
        setTimeout(() => { if (typeof renderizarAnalyticsFirebase === 'function') renderizarAnalyticsFirebase(); }, 800);
    } catch(e) {
        if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('❌ Error: ' + e.message, 'error');
    } finally {
        if (btnDedup) { btnDedup.disabled = false; btnDedup.textContent = '🔁 Limpiar duplicados'; }
    }
}
window.tmLimpiarDuplicados = tmLimpiarDuplicados;
