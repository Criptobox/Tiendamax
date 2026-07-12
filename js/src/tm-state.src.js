/* ============================================================
   TiendaMax — módulo: tm-state
   Funciones utilidad, navegación entre vistas, render categorías home, más vendidos
   Extraído de script.src.js (L1576–L2008, 433 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

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
    if (!num || num.length < 6) return;
    localStorage.setItem('whatsappNumero', num);
    localStorage.setItem('whatsappNumber', num);
    mostrarNotificacion('✅ WhatsApp guardado: +' + num);
}

function cargarNumeroWhatsApp() {
    const saved = localStorage.getItem('whatsappNumero') || localStorage.getItem('whatsappNumber');
    const input = document.getElementById('adminWhatsappNum');
    if (input && saved) input.value = saved;
}

// Texto real de cobertura/costo de envío — lo escribe el admin (⚙️ Configuración → 🚚 Envío).
// Sin valor guardado, no se inventa "toda Cuba" ni ningún alcance: se muestra un texto
// genérico honesto que no promete cobertura que no existe.
function getEnvioTexto() {
    const saved = (localStorage.getItem('envioTexto') || '').trim();
    return saved || 'Según zona · costo aparte';
}

function guardarEnvioTexto() {
    const input = document.getElementById('adminEnvioTexto');
    const status = document.getElementById('envioTextoStatus');
    if (!input) return;
    const val = input.value.trim();
    localStorage.setItem('envioTexto', val);
    if (status) {
        status.textContent = val ? '✅ Guardado' : '✅ Guardado (se mostrará "Según zona")';
        status.style.color = '#2ECC71';
    }
    mostrarNotificacion('✅ Texto de envío guardado');
}

function cargarEnvioTexto() {
    const saved = localStorage.getItem('envioTexto');
    const input = document.getElementById('adminEnvioTexto');
    if (input && saved) input.value = saved;
}

function _gaEvent(name, params) {
    try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch(e) {}
}
function contactarWhatsApp() {
    _gaEvent('contact', { method: 'whatsapp_general' });
    const numeroWhatsApp = getNumeroWhatsApp();
    let texto = 'Hola, me interesa conocer más sobre tus productos. ¿Puedes ayudarme?';
    try {
        // Try to include the featured/highlighted product name for context
        const ofertaId = localStorage.getItem('ofertaDiaId');
        const ps = typeof productos !== 'undefined' ? productos : [];
        let prod = ofertaId ? ps.find(p => String(p.id) === String(ofertaId)) : null;
        if (!prod) {
            prod = ps.find(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0 && p.precioActual > 0);
        }
        if (prod && prod.nombre) {
            texto = 'Hola, vi el producto "' + prod.nombre + '" en TiendaMax y me interesa. ¿Está disponible?';
        }
    } catch(e) {}
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
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
        const icon = claro ? '🌙' : '☀️';
        if (btn.classList.contains('mobile-theme-btn')) {
            // Botón del menú móvil: muestra texto + icono
            btn.textContent = icon + ' Tema: ' + (claro ? 'Oscuro' : 'Claro');
        } else {
            btn.textContent = icon;
        }
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
    setTimeout(() => notif.remove(), tipo === 'error' ? 8000 : 4000);
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
            const cached = tmParseArray(localStorage.getItem('productos'));
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
        _heroSoloConStock = false;
        _heroOrden = '';
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

// Oculta el banner de oferta si el producto está agotado
function verificarStockOfertaBanner() {
    try {
        const id = localStorage.getItem('ofertaDiaId');
        if (!id) return;
        const prod = productos.find(p => String(p.id) === String(id));
        if (!prod) return;
        const agotado = prod.stock === 0 || prod.agotado === true || Number(prod.stock) <= 0;
        const banner = document.getElementById('urgenciaBanner');
        if (!banner) return;
        if (agotado) {
            banner.style.setProperty('display', 'none', 'important');
            banner.onclick = null;
            if (document.body) document.body.classList.add('tm-no-oferta-banner');
        }
    } catch(e) {}
}

// Categorías con pocos productos (< 3) van a un desplegable "Ver más", para que
// la vitrina no se vea vacía con estantes de 1 solo producto. Reutilizado por
// los dos renderers (instantáneo y con datos frescos).
const TM_CAT_MIN = 3;
function _tmCatVerMas(grid, extras) {
    if (!grid) return;
    const cont = grid.parentNode; if (!cont) return;
    const oldBtn = document.getElementById('catVerMasBtn'); if (oldBtn) oldBtn.remove();
    const oldWrap = document.getElementById('catExtraWrap'); if (oldWrap) oldWrap.remove();
    if (!extras || !extras.length) return;

    const wrap = document.createElement('div');
    wrap.id = 'catExtraWrap';
    wrap.style.cssText = 'display:none;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px;max-width:960px;margin:14px auto 0';
    extras.forEach(e => {
        const c = document.createElement('div');
        c.style.cssText = 'background:#171717;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:16px 12px;text-align:center;cursor:pointer;transition:transform .2s ease,border-color .2s ease';
        c.onmouseenter = () => { c.style.transform = 'translateY(-3px)'; c.style.borderColor = 'rgba(255,140,0,.35)'; };
        c.onmouseleave = () => { c.style.transform = ''; c.style.borderColor = 'rgba(255,255,255,.07)'; };
        c.innerHTML = '<div style="font-size:30px;margin-bottom:8px">' + e.icon + '</div>' +
            '<div style="font-size:12px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.4px">' + e.name + '</div>' +
            '<div style="font-size:10.5px;color:' + (e.count === 0 ? '#888' : '#ff8c00') + ';margin-top:4px;font-weight:600">' + (e.count === 0 ? '🕐 Próximamente' : e.count + ' producto' + (e.count !== 1 ? 's' : '')) + '</div>';
        c.onclick = () => mostrarVistaCategoria(e.cat);
        wrap.appendChild(c);
    });

    const btn = document.createElement('button');
    btn.id = 'catVerMasBtn'; btn.type = 'button';
    btn.style.cssText = 'display:block;margin:20px auto 0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:13px;font-weight:700;padding:12px 26px;border-radius:26px;cursor:pointer;transition:background .2s';
    const setLabel = open => { btn.textContent = open ? '− Ver menos' : '+ Ver más categorías (' + extras.length + ')'; };
    setLabel(false);
    btn.onclick = () => { const open = wrap.style.display === 'none'; wrap.style.display = open ? 'grid' : 'none'; setLabel(open); };

    cont.appendChild(btn);
    cont.appendChild(wrap);
}

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

    const _catDisplayNames = { 'WIFI': 'REDES' };
    const _extras = [];
    categorias.forEach(cat => {
        const count = productos.filter(p => p.categoria === cat).length;
        const displayCat = _catDisplayNames[cat] || cat;
        // Pocas unidades (< 3) → al desplegable "Ver más"
        if (count < TM_CAT_MIN) {
            _extras.push({ cat, count, name: escapeHtml(displayCat), icon: escapeHtml(obtenerIconoCategoria(cat)) });
            return;
        }
        const mv = mvPorCat[cat] || 0;
        const isPopular = mv > 0 && (mv === maxMV || mv >= 2);
        const card = document.createElement('div');
        card.className = 'categoria-card' + (isPopular ? ' cat-popular' : '');
        card.innerHTML = `
            <span class="cat-popular-badge">+ Popular</span>
            <span class="cat-icon">${escapeHtml(obtenerIconoCategoria(cat))}</span>
            <span class="cat-name">${escapeHtml(displayCat)}</span>
            <span class="cat-count">${safeNum(count) + ' producto' + (count !== 1 ? 's' : '')}</span>
        `;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
    _tmCatVerMas(grid, _extras);
    // Dispara animaciones CSS DESPUÉS de que el DOM está poblado
    // Si ya tiene tm-rendered (del render instantáneo), no la quitar para evitar parpadeo
    if (!grid.classList.contains('tm-rendered')) {
        requestAnimationFrame(() => grid.classList.add('tm-rendered'));
    }
}

// ===== RENDERIZAR MÁS VENDIDOS =====

function renderizarMasVendidos() {
    // Siempre actualizar el hero galería, independiente de si el grid existe
    if (typeof renderHeroGaleria === 'function') renderHeroGaleria();

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

    // Reutiliza el mismo constructor de tarjeta que la grilla principal
    // (tm-ui.src.js, expuesto como window._tmCrearCard) para que "Más
    // Vendidos" se vea idéntico a las tarjetas nuevas, sin duplicar markup.
    productosAMostrar.forEach(producto => {
        if (typeof window._tmCrearCard !== 'function') return;
        const card = window._tmCrearCard(producto);
        card.classList.add('tm-anim-card');
        grid.appendChild(card);
        if (window._tmAnimObs) window._tmAnimObs.observe(card);
    });

    // Poblar la sección "Oferta del día" (se oculta sola si no hay ofertaDiaId)
    if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
    // Poblar la sección "Oferta por tiempo limitado" (independiente de ofertaDiaId)
    if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();
    // Ocultar banner de urgencia si el producto de oferta está agotado
    verificarStockOfertaBanner();
}

