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

function _gaEvent(name, params) {
    try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch(e) {}
}
function contactarWhatsApp() {
    _gaEvent('contact', { method: 'whatsapp_general' });
    const numeroWhatsApp = getNumeroWhatsApp();
    const mensaje = encodeURIComponent('Hola, me interesa conocer más sobre tus productos. ¿Puedes ayudarme?');
    window.open(`https://wa.me/${numeroWhatsApp}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
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
        btn.textContent = claro ? '🌙' : '☀️';
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
    categorias.forEach(cat => {
        const count = productos.filter(p => p.categoria === cat).length;
        const mv = mvPorCat[cat] || 0;
        const isPopular = mv > 0 && (mv === maxMV || mv >= 2);
        const card = document.createElement('div');
        card.className = 'categoria-card' + (count === 0 ? ' proximamente' : '') + (isPopular ? ' cat-popular' : '');
        const displayCat = _catDisplayNames[cat] || cat;
        card.innerHTML = `
            <span class="cat-popular-badge">+ Popular</span>
            <span class="cat-icon">${escapeHtml(obtenerIconoCategoria(cat))}</span>
            <span class="cat-name">${escapeHtml(displayCat)}</span>
            <span class="cat-count">${count === 0 ? '🕐 Próximamente' : safeNum(count) + ' producto' + (count !== 1 ? 's' : '')}</span>
        `;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
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

    productosAMostrar.forEach(producto => {
        const card = document.createElement('div');
        card.className = 'producto-card tm-anim-card';
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.dataset.productId = String(producto.id);
            const _nombre = escapeHtml(producto.nombre);
            const _desc   = escapeHtml(producto.descripcion);
            const _img    = escapeAttr(producto.imagen);
            const _id     = safeNum(producto.id);
            card.innerHTML = `
	            <div class="badge-vendido">🔥 Más Vendido</div>
	            <div class="producto-image">
	                <img src="${_img}" alt="${_nombre}" loading="lazy" onerror="this.src='/iconos/favicon-192.png';this.style.objectFit='cover';this.style.opacity='0.3'">
	                ${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? `<div class="badge">-$${(producto.precioOriginal - producto.precioActual).toFixed(0)}</div>` : ''}
	            </div>
	            <h3>${_nombre}</h3>
	            <p class="producto-description">${_desc}</p>
	            <p class="precio">
	                ${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? '<span class="precio-tachado">$' + parseFloat(producto.precioOriginal).toFixed(2) + ' USD</span> ' : ''}<span class="precio-actual" data-usd="${safeNum(producto.precioActual)}">${typeof formatPrecio==='function'?formatPrecio(producto.precioActual):'$'+producto.precioActual.toFixed(2)+' USD'}</span>${(producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) ? ' <span class="precio-ahorro">-$' + (producto.precioOriginal - producto.precioActual).toFixed(0) + '</span>' : ''}
	            </p>
            <div class="stock-count">
                <span>📦 Solo quedan ${safeNum(producto.stock)} unidades</span>
            </div>
            <div class="stock-bar">
                <div class="stock-bar-fill" style="width: ${Math.min(100, (safeNum(producto.stock) / 20) * 100)}%"></div>
            </div>
            
            <button class="btn-pedir-card" onclick="event.stopPropagation(); tmComprar(event, ${_id}, this.dataset.nombre)" data-nombre="${_nombre}" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>
        `;
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

