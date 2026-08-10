/* ============================================================
   TiendaMax — módulo: tm-ui
   Fast categories, patches, fix subcategorías, premium upgrade pack
   Extraído de script.src.js (L5075–L6776, 1702 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== FAST CATEGORIES - render from localStorage immediately =====
// Patch renderizarCategoriasHome for performance 
// (already called from cargarDatosDesdeGitHub, but we want instant local render too)

// ── Búsqueda tolerante a errores (los clientes escriben "blutu", "camara", "guifi") ──
// Normaliza fonética básica del español y permite 1 letra de diferencia en palabras largas.
function tmFuzzyNorm(s) {
    return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sin acentos
        .replace(/h/g, '')                                    // h muda
        .replace(/v/g, 'b')                                   // b = v
        .replace(/z/g, 's').replace(/c([ei])/g, 's$1')        // seseo
        .replace(/qu/g, 'k').replace(/c([aou])/g, 'k$1')      // c fuerte = k
        .replace(/ll/g, 'y').replace(/w/g, 'gu');             // guifi = wifi
}
function _tmLev1(a, b) { // ¿distancia de edición <= 1?
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, diff = 0;
    while (i < la && j < lb) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++diff > 1) return false;
        if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return diff + (la - i) + (lb - j) <= 1;
}
function tmFuzzyMatch(texto, query) {
    const t = tmFuzzyNorm(texto);
    if (!query) return true;
    const palabrasQ = tmFuzzyNorm(query).split(/\s+/).filter(Boolean);
    if (!palabrasQ.length) return true;
    const palabrasT = t.split(/[^a-z0-9]+/).filter(Boolean);
    return palabrasQ.every(q => {
        if (t.includes(q)) return true;
        if (q.length < 4) return false;                        // cortas: solo exactas
        return palabrasT.some(w => w.startsWith(q.slice(0, 4)) || _tmLev1(q, w));
    });
}
window.tmFuzzyMatch = tmFuzzyMatch;

function renderizarCategoriasHomeInstant() {
    // Load from localStorage immediately (no network wait)
    const localProds = tmParse(localStorage.getItem('productos'), null) || [];
    const localCats = tmParse(localStorage.getItem('categorias'), null) || [];
    // Solo omitir si no hay absolutamente nada (primer uso sin datos en caché)
    if (localCats.length === 0) return;
    
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    // Mismo ícono SVG de línea que el renderer con datos frescos, para que el
    // pintado instantáneo no parpadee de emoji → SVG al llegar la red.
    const _svgCatI = (cat) => (typeof obtenerIconoCategoriaSVG === 'function' && obtenerIconoCategoriaSVG(cat)) || null;
    const cardTodas = document.createElement('div');
    cardTodas.className = 'categoria-card';
    if (typeof tmPintarCategoria === 'function') tmPintarCategoria(cardTodas, 'todos');
    cardTodas.innerHTML = `<span class="cat-wm">🛍️</span><span class="cat-icon">${_svgCatI('todos') || '🛍️'}</span><span class="cat-name">Todos</span><span class="cat-count">${localProds.length} producto${localProds.length !== 1 ? 's' : ''}</span><span class="cat-cta">→ Explorar</span>`;
    cardTodas.onclick = () => mostrarVistaCategoria('Todas');
    grid.appendChild(cardTodas);

    // Mismas categorías que el renderer con datos frescos (incluidas las que
    // solo existen dentro de los productos): si esta lista fuera más corta,
    // el pintado instantáneo mostraría menos tarjetas y al llegar la red
    // aparecerían de golpe.
    const _catsI = (typeof tmCategoriasVisibles === 'function')
        ? tmCategoriasVisibles(localProds, localCats) : localCats;
    const maxCount = _catsI.length ? Math.max(..._catsI.map(cat => localProds.filter(p => p.categoria === cat).length)) : 0;
    const _dn = { 'WIFI': 'REDES' };
    const _extrasI = [];
    const _minI = (typeof TM_CAT_MIN !== 'undefined') ? TM_CAT_MIN : 3;
    _catsI.forEach(cat => {
        const count = localProds.filter(p => p.categoria === cat).length;
        const icon = obtenerIconoCategoria(cat);
        // Pocas unidades (< 3) → desplegable "Ver más"
        if (count < _minI) {
            _extrasI.push({ cat, count, name: _dn[cat] || cat, icon });
            return;
        }
        const card = document.createElement('div');
        card.className = 'categoria-card';
        // Mismo color que el renderer con datos frescos: si no, el pintado
        // instantáneo (caché) parpadearía de un tono a otro al llegar la red.
        if (typeof tmPintarCategoria === 'function') tmPintarCategoria(card, cat);
        const badge = (count > 0 && count === maxCount) ? '<span class="cat-badge">🔥 Popular</span>' : '';
        const cta = '<span class="cat-cta">→ Explorar</span>';
        card.innerHTML = `${badge}<span class="cat-wm">${icon}</span><span class="cat-icon">${_svgCatI(cat) || icon}</span><span class="cat-name">${_dn[cat] || cat}</span><span class="cat-count">${count + ' producto' + (count !== 1 ? 's' : '')}</span>${cta}`;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
    if (typeof _tmCatVerMas === 'function') _tmCatVerMas(grid, _extrasI);
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


// actualizarListaProductos pintaba la lista del panel viejo en #productsList y,
// por un envoltorio que estaba aquí, refrescaba de paso el <select> del
// countdown. La lista se fue con el panel; el select sigue en admin.html, así
// que sus llamadas pasaron a llamar directamente a actualizarCountdownProductSelect.

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


let _tmBulkSelected = new Set();


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


// desdeVenta=true cuando lo llama registrarVenta (omite notificación de stock para no duplicar)


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
        // Firmada con la cuenta: el `proof` de antes era el hash de la
        // contraseña local, que ya no existe.
        const putRes = await fetch(rtdbUrl + '/admin_push_requests/' + reqId + '.json' + (await _fbAuthQS()), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '✅ ¡' + nombre + ' está de vuelta!', body: 'El producto que querías ya está disponible. ¡No te quedes sin él!', url: '/', ts: Date.now() })
        });
        if (!putRes.ok) return;
        // Uno a uno, no el nodo del producto entero: la regla solo concede
        // escritura en avisos_stock/$productId/$tokenId, así que borrar el
        // padre devuelve 403 y la lista se quedaba ahí para siempre,
        // reavisando a la misma gente en cada reposición.
        await Promise.all(Object.keys(avisos).map(tokenId =>
            fetch(rtdbUrl + '/avisos_stock/' + productId + '/' + encodeURIComponent(tokenId) + '.json',
                  { method: 'DELETE' }).catch(() => {})));
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

let _ajustarStockSyncTimer = null;
function ajustarStock(id, cantidad, desdeVenta = false) {
    const p = productos.find(p => p.id === id);
    if (!p) return;
    const antes = p.stock;
    p.stock = Math.max(0, (p.stock || 0) + cantidad);
    guardarProductos();
    marcarProductoModificado(id);
    // Debounce: espera 2s tras el último clic para no disparar múltiples syncs
    clearTimeout(_ajustarStockSyncTimer);
    _ajustarStockSyncTimer = setTimeout(() => sincronizarConGitHub(), 2000);
    actualizarCountdownProductSelect();
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
            // OPT 3G: silencioso — Firebase config se cargará en próximo intento
        } finally {
            setTimeout(() => { _fbConfigPromise = null; }, 1000);
        }
        return null;
    })();
    return _fbConfigPromise;
}

/* (eliminado) El generador de reseñas de ejemplo se quitó: eran textos con
   autores inventados y además viajaban a cada cliente de la tienda. */


// Helper: obtiene la URL base de Firebase RTDB desde config guardada
function _fbRtdbUrl() {
    try {
        const cfg = tmParseObject(localStorage.getItem('firebaseConfig'));
        if (!cfg || typeof cfg !== 'object') return null;
        return cfg.databaseURL ||
               (cfg.projectId ? `https://${cfg.projectId}-default-rtdb.firebaseio.com` : null);
    } catch(e) { return null; }
}

/* Firma para las rutas que ya no son públicas.
   /ventas dejó de ser legible por cualquiera: lleva tus ingresos y tus
   ganancias, y hasta ahora bastaba con saber la URL. Ahora la lectura pide
   `auth != null`, así que cada llamada tiene que ir firmada con el token de la
   cuenta. Sin sesión devuelve cadena vacía y la petición dará 401 — quien
   llama ya trata ese caso como "no hay datos", que es como se comportaba
   antes de existir Firebase.

   El token se pide fresco cada vez a propósito: caduca a la hora y el SDK lo
   renueva solo, pero uno guardado aquí se quedaría viejo y daría 401 mudos. */
async function _fbAuthQS(sep) {
    try {
        if (typeof TMAuth === 'undefined') return '';
        const t = await TMAuth.token();
        return t ? ((sep || '?') + 'auth=' + encodeURIComponent(t)) : '';
    } catch (e) { return ''; }
}

// Escribe una venta en Firebase RTDB (sin bloquear — fire & forget)
function _fbGuardarVenta(venta) {
    (async () => {
        await _fbEnsureConfig();
        const url = _fbRtdbUrl();
        if (!url) return;
        await fetch(`${url}/ventas/${venta.id}.json${await _fbAuthQS()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(venta)
        });
    })().catch(() => {}); // OPT 3G: silencioso
}

// Anula una venta. En Firebase NO se toca nada: el nodo es inmutable
// (.write "!data.exists()"), porque sin autenticación cualquier permiso que
// se le diera al admin lo tendría también un desconocido — y con él podría
// borrar el historial o marcarlo entero como anulado, que a efectos del panel
// es lo mismo. La anulación se guarda aquí, en el dispositivo del admin.
const VENTAS_ANULADAS_KEY = 'tm_ventas_anuladas';

function ventasAnuladas() {
    try {
        const v = JSON.parse(localStorage.getItem(VENTAS_ANULADAS_KEY) || '[]');
        return Array.isArray(v) ? v.map(String) : [];
    } catch(e) { return []; }
}

function _fbEliminarVenta(id) {
    try {
        const lista = ventasAnuladas();
        if (lista.indexOf(String(id)) === -1) lista.push(String(id));
        localStorage.setItem(VENTAS_ANULADAS_KEY, JSON.stringify(lista.slice(-2000)));
    } catch(e) {}
}


// Nota: aquí vivía _fbMigrarVentasRaiz, que movía ventas guardadas por error en
// la raíz de Firebase (0,1,2…) a /ventas/{id}. Se eliminó porque ya no podía
// funcionar: la raíz tiene ".read": false en firebase-rules.json, así que su
// sondeo a /0.json devolvía 401 y la migración cortaba ahí siempre. Lo único
// que quedaba era una petición fallida y un error rojo en la consola de cada
// visitante.

// Carga ventas desde Firebase y hace merge con localStorage (en background al iniciar)
// OPT 3G: silencioso — si Firebase no responde (común en 3G cubano), no spamear la consola.
let _fbSyncVentasEnCurso = false;


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


// Registra un pedido con uno o varios productos como UNA sola venta (un vale).
// `cliente` es opcional: {nombre, tel}. Se guarda SOLO en localStorage — ver
// más abajo, en el bloque que sube el pedido a Firebase.
/* `opts.stockYaDescontado`: la venta viene de una reserva. Al mandar el vale
   la unidad ya salió del stock —ese es el sentido de reservar— así que
   restarla otra vez aquí la contaría dos veces y el catálogo diría que quedan
   menos de las que hay. Cualquier otra venta sigue descontando como siempre. */
function registrarVentaPedido(items, cliente, opts) {
    items = (items || []).filter(it => it && it.productoId);
    if (!items.length) { mostrarNotificacion('⚠️ Agrega al menos un producto', 'error'); return; }
    const detalle = items.map(it => {
        const p = productos.find(x => x.id === it.productoId) || {};
        const cant = it.cantidad || 1;
        const precio = (it.precio != null ? it.precio : p.precioActual) || 0;
        const comision = (it.comision != null ? it.comision : p.comision) || 0;
        return {
            producto: it.producto || p.nombre || 'Producto',
            productoId: it.productoId,
            cantidad: cant,
            precio: precio,
            comision: comision,
            comisionMoneda: it.comisionMoneda || p.comisionMoneda || 'USD',
            total: precio * cant,
            ganancia: comision * cant
        };
    });
    const total = detalle.reduce((s, d) => s + d.total, 0);
    const ganancia = detalle.reduce((s, d) => s + d.ganancia, 0);
    const unidades = detalle.reduce((s, d) => s + d.cantidad, 0);
    const venta = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        items: detalle,
        producto: detalle.length === 1 ? detalle[0].producto : `${detalle[0].producto} +${detalle.length - 1} más`,
        productoId: detalle[0].productoId,
        cantidad: unidades,
        precio: detalle.length === 1 ? detalle[0].precio : total,
        comision: detalle.length === 1 ? detalle[0].comision : ganancia,
        comisionMoneda: detalle[0].comisionMoneda,
        total: total,
        ganancia: ganancia
    };
    // Nombre y teléfono del cliente. El tab Clientes ya los leía (v.cliente /
    // v.telefono) y salía vacío porque nadie los escribía nunca.
    if (cliente) {
        const nom = String(cliente.nombre || '').trim();
        const tel = String(cliente.tel || '').replace(/\D/g, '');
        if (nom) venta.cliente = nom;
        if (tel.length >= 6) venta.telefono = tel;
    }
    guardarVenta(venta);
    if (!(opts && opts.stockYaDescontado)) detalle.forEach(d => ajustarStock(d.productoId, -(d.cantidad), true));
    mostrarNotificacion(`✅ Venta registrada: ${detalle.length} producto${detalle.length > 1 ? 's' : ''}`);

    // Guardar también como pedido en Firebase para seguimiento del cliente (multi-item).
    //
    // OJO: el payload se arma campo a campo A PROPÓSITO — nunca con el objeto
    // `venta` entero. /pedidos/$id tiene ".read": true y aquí no hay
    // autenticación, así que cada pedido lo puede leer cualquiera: mandar
    // venta.cliente o venta.telefono sería publicar el nombre y el número de
    // la persona. Esos dos se quedan en localStorage.
    (async () => {
        try {
            const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
            if (!base) return;
            await fetch(base + '/pedidos/' + venta.id + '.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: venta.id,
                    fecha: venta.fecha,
                    items: detalle.map(d => ({ id: d.productoId, nombre: d.producto, cantidad: d.cantidad, precio: d.precio })),
                    total: total,
                    estado: 'confirmado',
                    clienteTs: Date.now(),
                    actualizado: Date.now()
                })
            });
        } catch(e) {}
    })();
    return venta;
}

// Compat: registrar una venta de un solo producto
function registrarVenta(productoId, cantidad) {
    const p = productos.find(p => p.id === productoId);
    if (!p) return;
    registrarVentaPedido([{ productoId: p.id, producto: p.nombre, cantidad: cantidad || 1, precio: p.precioActual, comision: p.comision || 0, comisionMoneda: p.comisionMoneda || 'USD' }]);
}


// Página actual del historial de ventas
let _ventasPagina = 0;
const _VENTAS_POR_PAGINA = 20;


// Carrito del pedido (varios productos en una sola venta)
let _ventaCarrito = [];


// ── Grupos de Facebook con selección de productos ────


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


// ── Grupos FB persistentes (carga al abrir pestaña) ──

function cargarGruposFB() {
    const grupos = tmParseArray(localStorage.getItem('gruposFB'));
    renderizarGruposFB(grupos);
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
        const putRes = await fetch(rtdbUrl + '/admin_push_requests/' + reqId + '.json' + (await _fbAuthQS()), {
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


// ── Meta real en las tarjetas: reseñas (resenas-cache.json) + vistas (Firebase) ──
window._tmRatingMap = window._tmRatingMap || null;   // { id: {avg, count} }
window._tmViewsMap  = window._tmViewsMap  || null;   // { id: count }
let _tmMetaCargando = false;

function _tmMetaCard(id) {
    const sid = String(id);
    let h = '';
    const r = window._tmRatingMap && window._tmRatingMap[sid];
    if (r && r.count > 0) {
        h += '<span class="pv2-rating">★ ' + r.avg.toFixed(1) + ' <i>(' + r.count + ')</i></span>';
    }
    const v = window._tmViewsMap && window._tmViewsMap[sid];
    if (typeof v === 'number' && v >= 15) {
        h += '<span class="pv2-views">👁️ ' + v.toLocaleString('es') + '</span>';
    }
    return h;
}

function _tmAplicarMetaCards() {
    document.querySelectorAll('#productosGrid .pcard-v2[data-product-id]').forEach(function(c) {
        const m = c.querySelector('.pv2-meta');
        if (m) m.innerHTML = _tmMetaCard(c.dataset.productId);
    });
}

async function _tmCargarMetaCatalogo() {
    // Si ya están los mapas, solo re-aplicar a las tarjetas actuales
    if (window._tmRatingMap && window._tmViewsMap) { _tmAplicarMetaCards(); return; }
    if (_tmMetaCargando) return;
    _tmMetaCargando = true;

    // Reseñas: cache estático (mismo origen, confiable en Cuba)
    if (!window._tmRatingMap) {
        try {
            const r = await fetch('resenas-cache.json?v=' + (window.__tmResenasCacheVer || Date.now()), { cache: 'no-store' });
            if (r.ok) {
                const data = await r.json();
                const pp = (data && data.por_producto) || {};
                const map = {};
                Object.keys(pp).forEach(function(id) {
                    const arr = Array.isArray(pp[id]) ? pp[id] : [];
                    if (arr.length) {
                        const suma = arr.reduce(function(s, x) { return s + (Number(x.estrellas) || 0); }, 0);
                        map[String(id)] = { avg: suma / arr.length, count: arr.length };
                    }
                });
                window._tmRatingMap = map;
            } else { window._tmRatingMap = {}; }
        } catch (e) { window._tmRatingMap = {}; }
    }

    // Vistas: una sola lectura de todo el nodo analytics/vistas
    if (!window._tmViewsMap) {
        try {
            const cfg = (typeof tmParseObject === 'function') ? tmParseObject(localStorage.getItem('firebaseConfig')) : JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
            const base = cfg.databaseURL || (cfg.projectId ? 'https://' + cfg.projectId + '-default-rtdb.firebaseio.com' : null);
            if (base) {
                const r = await fetch(base + '/analytics/vistas.json');
                if (r.ok) {
                    const data = await r.json();
                    const map = {};
                    if (data && typeof data === 'object') {
                        Object.keys(data).forEach(function(id) {
                            const c = data[id] && data[id].count;
                            if (typeof c === 'number') map[String(id)] = c;
                        });
                    }
                    window._tmViewsMap = map;
                } else { window._tmViewsMap = {}; }
            } else { window._tmViewsMap = {}; }
        } catch (e) { window._tmViewsMap = {}; }
    }

    _tmMetaCargando = false;
    _tmAplicarMetaCards();
}

// ── Patch renderizarProductos to show agotado/oferta badges ──
if (typeof renderizarProductos === 'function') {
const _origRenderProductosFinal = renderizarProductos;
renderizarProductos = function() {
    const productosGrid = document.getElementById('productosGrid');
    if (!productosGrid) { _origRenderProductosFinal(); return; }

    // RESILIENCIA: si productos está vacío, intentar cargar de localStorage
    if (!Array.isArray(productos) || productos.length === 0) {
        try {
            const cached = tmParseArray(localStorage.getItem('productos'));
            if (Array.isArray(cached) && cached.length > 0) {
                productos = cached;
            }
        } catch(e) {}
    }

    // FIX: desconectar el observer de "load more" previo SIEMPRE al inicio de render,
    // para que no quede observando un botón que ya no existe (causaba state leak: al cambiar
    // de categoría después de hacer load-more, mostraba más productos de los debidos).
    if (window._tmLoadMoreObs) { try { window._tmLoadMoreObs.disconnect(); } catch(e){} window._tmLoadMoreObs = null; }

    // OPT 3G: caché memoizado del filtrado — si los inputs no cambiaron y el array
    // de productos es el mismo, reusar el resultado filtrado (evita re-calcular filter+sort)
    const ofertaId = getOfertaDiaId();
    const _cacheKey = categoriaSeleccionada + '|' + (subcategoriaSeleccionada||'') + '|' +
                      (_heroSearchActivo||'') + '|' + _heroPrecioMin + '|' + _heroPrecioMax + '|' +
                      _heroSoloConStock + '|' + _heroOrden + '|' + ofertaId + '|' +
                      (productos.length) + '|' + (productos[0] && productos[0].id);
    let productosFiltrados;
    if (window._tmFiltroCacheKey === _cacheKey && Array.isArray(window._tmFiltroCacheVal)) {
        productosFiltrados = window._tmFiltroCacheVal;
    } else {
        productosFiltrados = categoriaSeleccionada === 'Todas'
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
                    (p.categoria||'').toLowerCase().includes(q) ||
                    tmFuzzyMatch(p.nombre + ' ' + (p.categoria||''), q);
                const precio = safeNum(p.precioActual);
                const matchP = precio >= _heroPrecioMin && precio <= _heroPrecioMax;
                return matchQ && matchP;
            });
        }
        if (_heroSoloConStock) productosFiltrados = productosFiltrados.filter(p => safeNum(p.stock) > 0);
        if (_heroOrden === 'precio_asc')  productosFiltrados.sort((a,b) => safeNum(a.precioActual) - safeNum(b.precioActual));
        else if (_heroOrden === 'precio_desc') productosFiltrados.sort((a,b) => safeNum(b.precioActual) - safeNum(a.precioActual));
        else if (_heroOrden === 'az')     productosFiltrados.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));

        if (ofertaId) {
            productosFiltrados = productosFiltrados.sort((a, b) => {
                if (String(a.id) === String(ofertaId)) return -1;
                if (String(b.id) === String(ofertaId)) return 1;
                return 0;
            });
        }

        productosFiltrados = productosFiltrados.sort((a, b) => {
            const aAgotado = a.stock === 0 ? 1 : 0;
            const bAgotado = b.stock === 0 ? 1 : 0;
            return aAgotado - bAgotado;
        });

        window._tmFiltroCacheKey = _cacheKey;
        window._tmFiltroCacheVal = productosFiltrados.slice();
    }

    productosGrid.innerHTML = '';
    if (productosFiltrados.length === 0) {
        if (!Array.isArray(productos) || productos.length === 0) {
            const skeletonHTML = Array(8).fill(0).map(() =>
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

    // ── OPT 3G: Render progresivo real — primeros 8, resto por IO (append, no re-render) ──
    const _visibleCount = 8;
    const _tmBatchSize = 8;

    // Helper reutilizable: crea UNA card de producto
    // opts.lazy: true (default) = loading="lazy"; false = loading="eager" + fetchpriority="high"
    function _tmCrearCard(producto, opts) {
        var _lazy = opts && opts.lazy !== undefined ? opts.lazy : true;
        const esAgotado = producto.stock === 0;
        const esOfertaDia = String(producto.id) === String(ofertaId);
        const card = document.createElement('div');
        card.className = 'producto-card pcard-v2 tm-anim-card' + (esAgotado ? ' card-agotado' : '');
        // Clic en cualquier parte de la tarjeta: comodidad para el ratón y el
        // dedo, nada más. La tarjeta NO es un botón.
        //
        // Lo era: role="button" + tabIndex + aria-label sobre el contenedor. Y
        // dentro lleva el botón "Pedir", o sea un botón dentro de otro botón —
        // que no es válido y deja al de dentro fuera del alcance de un lector de
        // pantalla en modo formulario. Además el nombre accesible ("Ver detalle
        // de X") no contenía el texto visible de la tarjeta, así que quien usa
        // control por voz decía "pulsa <nombre del producto>" y no pasaba nada.
        //
        // Ahora lo que se enfoca y se anuncia es el título (abajo, un <button>
        // de verdad) y el botón "Pedir", cada uno con su nombre. Para el teclado
        // hay dos paradas claras en vez de una tarjeta entera opaca.
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.dataset.productId = String(producto.id);
        const _id  = safeNum(producto.id);
        const _nomCorto = _tmTruncar2Lineas(producto.nombre);
        // `_nom` sigue siendo texto plano escapado (alt="" y data-nombre, que
        // alimenta el mensaje de WhatsApp: ahí el emoji sí se conserva).
        const _nom = escapeHtml(_nomCorto);
        // El título visible cambia el emoji por su ícono de línea (tm-iconos).
        const _nomHTML = (typeof tmNombreHTML === 'function') ? tmNombreHTML(_nomCorto) : _nom;
        const _img = escapeAttr(producto.imagen);
        const _stk = safeNum(producto.stock);
        // La etiqueta de la esquina NO lleva el texto libre de la oferta. Ese
        // texto lo escribe el admin a mano ("🔥🔥🔥 TU MEJOR OPCIÓN 🔥🔥🔥") y en
        // una pastilla de dos centímetros salía cortado — "🔥🔥🔥 TU MEJOR…" —,
        // que no dice nada y encima parece roto. Va el descuento si lo hay, y
        // si no una palabra corta: lo que sí cabe y sí informa.
        const _txt = 'OFERTA';
        const _cat = escapeHtml(producto.categoria || '');
        const _tieneGarantia = producto.garantia && String(producto.garantia).trim();
        const _hasDescuento = producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual;
        const _pctDesc = _hasDescuento ? Math.round((1 - producto.precioActual / producto.precioOriginal) * 100) : 0;
        // Badge en la esquina de la foto. Agotado: solo 'AGOTADO' (sin hype).
        const _vendidos = (typeof _tmVendidosCount === 'function') ? _tmVendidosCount(_id) : 0;
        const _tag = esAgotado
            ? '<span class="pv2-tag out">AGOTADO</span>'
            : (esOfertaDia ? '<span class="pv2-tag oferta">' + (_hasDescuento ? '-' + _pctDesc + '%' : _txt) + '</span>'
                : (_hasDescuento ? '<span class="pv2-tag">-' + _pctDesc + '%</span>'
                    : (_stk > 0 && _stk <= 3 ? '<span class="pv2-tag last">' + tmIcoUI('⚡') + ' Últimas ' + _stk + '</span>'
                        : (_vendidos >= 3 ? '<span class="pv2-tag hot">' + tmIcoUI('🔥') + ' ' + _vendidos + ' vendidos</span>'
                            : (producto.masVendido ? '<span class="pv2-tag hot">' + tmIcoUI('🔥') + ' Destacado</span>' : '')))));
        // Botón Pedir / Avísame (ancho completo). Agotado: texto corto + color distinto.
        const _btn = esAgotado
            ? '<button class="btn-pedir-card pv2-aviso" type="button" onclick="event.stopPropagation();abrirDetalleProducto(' + _id + ')">' + tmIcoUI('🔔') + ' Avísame</button>'
            : '<button class="btn-pedir-card pv2-pedir" data-nombre="' + _nom + '" onclick="event.stopPropagation(); tmComprar(event, ' + _id + ', this.dataset.nombre)" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>';
        // Lazy loading: first N products above fold get eager+fetchpriority=high for LCP;
        // everything else (below fold, paginated, side sections) gets lazy for bandwidth.
        var _imgAttrs = ' src="' + _img + '" alt="' + _nom + '" loading="' + (_lazy ? 'lazy' : 'eager') + '" decoding="async"' + (_lazy ? '' : ' fetchpriority="high"') + ' onerror="this.style.opacity=\'0.25\'"';
        card.innerHTML =
            '<div class="pv2-photo">' +
                _tag +
                getMeGustaHTML(_id) +
                '<img' + _imgAttrs + '>' +
            '</div>' +
            '<div class="pv2-body">' +
                (_cat ? '<span class="pv2-cat">' + _cat + '</span>' : '') +
                // El título es el destino accesible de la tarjeta: un <button>
                // real, con el nombre del producto como nombre accesible. El
                // stopPropagation evita que el clic llegue además a la tarjeta y
                // abra el detalle dos veces.
                '<h3 class="pv2-title" style="height:36px;max-height:36px;min-height:36px;overflow:hidden;line-height:18px;white-space:normal;">' +
                    '<button type="button" class="pv2-title-btn" onclick="event.stopPropagation();abrirDetalleProducto(' + _id + ')">' + _nomHTML + '</button>' +
                '</h3>' +
                '<div class="pv2-meta">' + (typeof _tmMetaCard === 'function' ? _tmMetaCard(_id) : '') + '</div>' +
                (typeof renderCountdownHtml === 'function' ? renderCountdownHtml(_id) : '') +
                '<div class="pv2-foot">' +
                    '<div class="pv2-price">' +
                        // El porcentaje ya sale en la esquina de la foto (.pv2-tag);
                        // repetirlo aquí hacía que "-13%" apareciera dos veces en la
                        // misma tarjeta. Se queda solo el precio anterior tachado, que
                        // es el dato que la insignia no da.
                        // La fila del precio anterior se dibuja SIEMPRE: cuando no hay
                        // descuento va vacía y oculta (visibility, no display) para que
                        // reserve su alto. Si no, la tarjeta con descuento salía ~15px
                        // más alta que sus vecinas y rompía la rejilla.
                        (_hasDescuento
                            ? '<div class="pv2-oldrow"><span class="pv2-old">$' + Number(producto.precioOriginal).toFixed(0) + '</span></div>'
                            : '<div class="pv2-oldrow pv2-oldrow-ghost" aria-hidden="true"><span class="pv2-old">&nbsp;</span></div>') +
                        '<span class="precio-actual" data-usd="' + safeNum(producto.precioActual) + '">$' + Number(producto.precioActual).toFixed(2) + ' USD</span>' +
                    '</div>' +
                    (esAgotado ? '' : '<div class="pv2-trust">' + tmIcoUI('🔒') + ' Pago al recibir' + (_tieneGarantia ? ' · ' + tmIcoUI('🛡') + ' Garantía' : '') + '</div>') +
                    _btn +
                '</div>' +
                '<span class="stock-count">' + (esAgotado ? 0 : _stk) + '</span>' +
            '</div>';
        return card;
    }
    window._tmCrearCard = _tmCrearCard;

    // Render inicial en lote con DocumentFragment (1 reflow en vez de N appendChild)
    const _frag = document.createDocumentFragment();
    const _cardsIniciales = productosFiltrados.slice(0, _visibleCount).map(p => _tmCrearCard(p, { lazy: false }));
    _cardsIniciales.forEach(c => _frag.appendChild(c));
    productosGrid.appendChild(_frag);
    if (window._tmAnimObs) _cardsIniciales.forEach(c => window._tmAnimObs.observe(c));
    // Cargar reseñas/vistas reales y pintarlas en las tarjetas
    setTimeout(_tmCargarMetaCatalogo, 0);

    // Botón "cargar más" + auto-cargar en scroll (APPEND nuevo lote, no re-render completo)
    if (productosFiltrados.length > _visibleCount) {
        let _loadedCount = _visibleCount;
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'tmLoadMoreBtn';
        loadMoreBtn.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:28px;padding:0 16px';
        const _restInit = productosFiltrados.length - _loadedCount;
        loadMoreBtn.innerHTML = '<p style="color:rgba(255,255,255,0.35);font-size:12px;letter-spacing:.5px;text-transform:uppercase">Mostrando ' + _loadedCount + ' de ' + productosFiltrados.length + ' productos</p><button class="btn-seguir-viendo">' + tmIcoUI('👁') + ' Seguir viendo <span style="background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:20px;font-size:11px;margin-left:4px">' + _restInit + ' más</span></button>';

        const _appendBatch = () => {
            const next = productosFiltrados.slice(_loadedCount, _loadedCount + _tmBatchSize);
            if (next.length === 0) { loadMoreBtn.remove(); return; }
            const f = document.createDocumentFragment();
            const _cardsLote = next.map(p => _tmCrearCard(p, { lazy: true }));
            _cardsLote.forEach(c => f.appendChild(c));
            productosGrid.insertBefore(f, loadMoreBtn);
            if (window._tmAnimObs) _cardsLote.forEach(c => window._tmAnimObs.observe(c));
            _loadedCount += next.length;
            const restantes = productosFiltrados.length - _loadedCount;
            const pEl = loadMoreBtn.querySelector('p');
            const btnEl = loadMoreBtn.querySelector('.btn-seguir-viendo');
            if (restantes <= 0) {
                loadMoreBtn.remove();
                if (window._tmLoadMoreObs) { window._tmLoadMoreObs.disconnect(); window._tmLoadMoreObs = null; }
            } else {
                if (pEl) pEl.textContent = 'Mostrando ' + _loadedCount + ' de ' + productosFiltrados.length + ' productos';
                if (btnEl) btnEl.innerHTML = tmIcoUI('👁') + ' Seguir viendo <span style="background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:20px;font-size:11px;margin-left:4px">' + restantes + ' más</span>';
            }
        };
        loadMoreBtn.querySelector('.btn-seguir-viendo').onclick = _appendBatch;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) _appendBatch();
        }, { rootMargin: '300px' });
        observer.observe(loadMoreBtn);
        window._tmLoadMoreObs = observer;

        productosGrid.appendChild(loadMoreBtn);
    }
};
} // end typeof renderizarProductos guard


