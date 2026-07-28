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
        const topBar = document.getElementById('tmTopbar');
        const urg = document.getElementById('urgenciaBanner');
        const header = document.querySelector('.header');
        const headerContent = document.querySelector('.header-content');
        const currencyBar = document.getElementById('currencyBar');
        const pwaBanner = document.getElementById('pwa-install-banner');
        const topBarVisible = topBar && getComputedStyle(topBar).display !== 'none';
        const topBarH = topBarVisible ? Math.ceil(topBar.getBoundingClientRect().height) : 0;
        root.style.setProperty('--tm-topbar-h', topBarH + 'px');
        const urgVisible = urg && getComputedStyle(urg).display !== 'none';
        const urgH = urgVisible ? Math.ceil(urg.getBoundingClientRect().height) : 0;
        // El banner de instalar PWA es fixed:top:0 y flota por encima de todo
        // (z-index más alto que el header) — cuando está visible hay que
        // empujar el header hacia abajo su altura real, si no lo tapa.
        const pwaVisible = pwaBanner && pwaBanner.classList.contains('pwa-show');
        const pwaH = pwaVisible ? Math.ceil(pwaBanner.getBoundingClientRect().height) : 0;
        root.style.setProperty('--tm-pwa-h', pwaH + 'px');
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

// mostrarNotificacion defined in tm-toast.js

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
        const agotado = Number(prod.stock) <= 0;
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

    // Mismas tarjetas .categoria-card que la grilla principal: heredan el
    // diseño nuevo (vidrio, variantes de color e íconos SVG) sin duplicar CSS.
    const wrap = document.createElement('div');
    wrap.id = 'catExtraWrap';
    // 'oculto' es una clase con display:none !important — el display:grid
    // !important de .categorias-grid (styles.css) le gana a un style inline
    // sin !important, así que esconderlo por inline no funciona.
    wrap.className = 'categorias-grid cat-extra-oculto';
    // Además de la clase, el display en línea CON !important: así ocultarse no
    // depende de que el CSS esté fresco (si el navegador guardó un bundle.css
    // viejo sin .cat-extra-oculto, las extras salían siempre visibles).
    wrap.style.setProperty('display', 'none', 'important');
    extras.forEach(e => {
        const c = document.createElement('div');
        c.className = 'categoria-card';
        const icon = document.createElement('span');
        icon.className = 'cat-icon';
        const svg = (typeof obtenerIconoCategoriaSVG === 'function') ? obtenerIconoCategoriaSVG(e.cat) : null;
        if (svg) icon.innerHTML = svg; else icon.textContent = e.icon;
        const nm = document.createElement('span');
        nm.className = 'cat-name';
        nm.textContent = e.name;
        const ct = document.createElement('span');
        ct.className = 'cat-count';
        ct.textContent = e.count === 0 ? 'Próximamente' : e.count + ' producto' + (e.count !== 1 ? 's' : '');
        c.append(icon, nm, ct);
        c.onclick = () => mostrarVistaCategoria(e.cat);
        wrap.appendChild(c);
    });

    const btn = document.createElement('button');
    btn.id = 'catVerMasBtn'; btn.type = 'button';
    btn.className = 'cat-vermas-btn';
    const setLabel = open => { btn.textContent = open ? '− Ver menos' : '+ Ver más categorías (' + extras.length + ')'; };
    setLabel(false);
    btn.onclick = () => {
        const abrir = wrap.classList.contains('cat-extra-oculto');
        wrap.classList.toggle('cat-extra-oculto', !abrir);
        if (abrir) wrap.style.setProperty('display', 'grid', 'important');
        else       wrap.style.setProperty('display', 'none', 'important');
        setLabel(abrir);
    };

    cont.appendChild(btn);
    cont.appendChild(wrap);
}

// Calificación real del hero (fila de confianza): promedio de TODAS las reseñas
// del catálogo (resenas-cache.json), no un número inventado. Se carga una sola vez.
let _tmRatingHeroCargado = false;
async function _tmCargarRatingHero() {
    if (_tmRatingHeroCargado) return;
    _tmRatingHeroCargado = true;
    const el = document.getElementById('ndStatRating');
    if (!el) return;
    try {
        const res = await fetch('resenas-cache.json?v=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const porProducto = (data && data.por_producto) || {};
        let suma = 0, total = 0;
        Object.values(porProducto).forEach(arr => {
            if (Array.isArray(arr)) arr.forEach(r => { suma += Number(r.estrellas) || 0; total++; });
        });
        if (total > 0) el.innerHTML = (suma / total).toFixed(1) + '<i>★</i>';
    } catch (e) { /* deja el valor por defecto del HTML */ }
}

function renderizarCategoriasHome() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const heroStatProductos = document.getElementById('ndStatProductos');
    if (heroStatProductos) heroStatProductos.textContent = productos.length + '+';
    const heroChipCount = document.getElementById('opChipCount');
    if (heroChipCount) heroChipCount.textContent = productos.length;
    _tmCargarRatingHero();

    // Ícono de línea (SVG) como el preview; emoji solo de respaldo o si el
    // admin guardó un ícono personalizado para la categoría.
    const _svgCat = (cat) => (typeof obtenerIconoCategoriaSVG === 'function' && obtenerIconoCategoriaSVG(cat)) || null;

    const cardTodas = document.createElement('div');
    cardTodas.className = 'categoria-card';
    const totalProductos = productos.length;
    cardTodas.innerHTML = `
        <span class="cat-icon">${_svgCat('todos') || '🛍️'}</span>
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
            // Sin escapeHtml: _tmCatVerMas inserta con textContent, no innerHTML
            _extras.push({ cat, count, name: displayCat, icon: obtenerIconoCategoria(cat) });
            return;
        }
        const mv = mvPorCat[cat] || 0;
        const isPopular = mv > 0 && (mv === maxMV || mv >= 2);
        const card = document.createElement('div');
        card.className = 'categoria-card' + (isPopular ? ' cat-popular' : '');
        card.innerHTML = `
            <span class="cat-popular-badge">+ Popular</span>
            <span class="cat-icon">${_svgCat(cat) || escapeHtml(obtenerIconoCategoria(cat))}</span>
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

// ── Carrusel de "Productos Destacados" ──────────────────────────
// Deslizamiento horizontal con flechas, puntos y avance automático.
// renderizarMasVendidos() lo llama cada vez que repinta la fila (los datos
// se refrescan desde GitHub/Firebase), así que lo primero es limpiar el
// estado anterior: si no, se acumulan intervalos y listeners duplicados.
let _mvSliderEstado = null;
function _tmInitDestacadosSlider() {
    const grid = document.getElementById('masVendidosGrid');
    const wrap = document.getElementById('mvSliderWrap');
    if (!grid || !wrap) return;

    // Limpieza del render anterior
    if (_mvSliderEstado) {
        clearInterval(_mvSliderEstado.timer);
        _mvSliderEstado.limpiar();
        _mvSliderEstado = null;
    }

    const cards = Array.from(grid.children);
    const prev = document.getElementById('mvPrev');
    const next = document.getElementById('mvNext');
    const dotsWrap = document.getElementById('mvDots');

    if (dotsWrap) dotsWrap.innerHTML = '';
    if (cards.length < 2) { wrap.classList.add('mv-sin-controles'); return; }

    // Los controles solo tienen sentido si la fila realmente desborda. Con 2
    // destacados en escritorio entran de sobra y unas flechas que no mueven
    // nada confunden; en móvil las mismas 2 sí desbordan y ahí sí van.
    const hayDesborde = () => grid.scrollWidth > grid.clientWidth + 4;
    const aplicarControles = () => wrap.classList.toggle('mv-sin-controles', !hayDesborde());
    aplicarControles();
    window.addEventListener('resize', aplicarControles);

    let pagina = 0;
    const dots = cards.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Ver destacado ' + (i + 1));
        if (i === 0) b.classList.add('active');
        b.addEventListener('click', () => { pausar(); irA(i); reanudar(); });
        dotsWrap.appendChild(b);
        return b;
    });

    function marcar(i) {
        pagina = ((i % cards.length) + cards.length) % cards.length;
        dots.forEach((d, n) => d.classList.toggle('active', n === pagina));
    }
    function irA(i) {
        marcar(i);
        const card = cards[pagina];
        if (!card) return;
        // scrollTo relativo: centra la tarjeta sin depender de anchos fijos
        const r = card.getBoundingClientRect();
        const g = grid.getBoundingClientRect();
        grid.scrollTo({ left: grid.scrollLeft + (r.left - g.left) - 8, behavior: 'smooth' });
    }

    let timer = null;
    const reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function reanudar() {
        if (reducido) return;      // sin auto-avance si el usuario pidió menos movimiento
        if (!hayDesborde()) return; // nada que rotar: no gastar un intervalo de fondo
        clearInterval(timer);
        timer = setInterval(() => irA(pagina + 1), 5000);
        if (_mvSliderEstado) _mvSliderEstado.timer = timer;
    }
    function pausar() { clearInterval(timer); }

    const onPrev = () => { pausar(); irA(pagina - 1); reanudar(); };
    const onNext = () => { pausar(); irA(pagina + 1); reanudar(); };
    if (prev) prev.addEventListener('click', onPrev);
    if (next) next.addEventListener('click', onNext);
    grid.addEventListener('mouseenter', pausar);
    grid.addEventListener('mouseleave', reanudar);

    // Al deslizar con el dedo/trackpad, sincronizar el punto activo
    let scrollTimer = null;
    const onScroll = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const g = grid.getBoundingClientRect();
            let cerca = 0, min = Infinity;
            cards.forEach((c, i) => {
                const d = Math.abs(c.getBoundingClientRect().left - g.left);
                if (d < min) { min = d; cerca = i; }
            });
            marcar(cerca);
        }, 120);
    };
    grid.addEventListener('scroll', onScroll, { passive: true });

    // Solo rota mientras se ve. Sin esto seguía desplazando cada 5s con el
    // usuario leyendo el footer: trabajo de layout y batería a cambio de nada,
    // que se nota justo en los teléfonos modestos a los que apunta el sitio.
    let visObs = null;
    if ('IntersectionObserver' in window) {
        visObs = new IntersectionObserver(entradas => {
            if (entradas[0].isIntersecting) reanudar(); else pausar();
        }, { threshold: 0.15 });
        visObs.observe(wrap);
    }
    // Tampoco rota con la pestaña en segundo plano
    const onVisibilidad = () => { if (document.hidden) pausar(); else reanudar(); };
    document.addEventListener('visibilitychange', onVisibilidad);

    _mvSliderEstado = {
        timer,
        limpiar() {
            if (prev) prev.removeEventListener('click', onPrev);
            if (next) next.removeEventListener('click', onNext);
            grid.removeEventListener('mouseenter', pausar);
            grid.removeEventListener('mouseleave', reanudar);
            grid.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', aplicarControles);
            document.removeEventListener('visibilitychange', onVisibilidad);
            if (visObs) visObs.disconnect();
            clearTimeout(scrollTimer);
        }
    };
    // Sin arranque directo: lo enciende el observer cuando la fila entra en
    // pantalla (y si no hay observer, se arranca aquí).
    if (!visObs) reanudar();
}

function renderizarMasVendidos() {
    // Siempre actualizar el hero galería, independiente de si el grid existe
    if (typeof renderHeroGaleria === 'function') renderHeroGaleria();

    const grid = document.getElementById('masVendidosGrid');
    const vacio = document.getElementById('masVendidosVacio');
    if (!grid) return;

    const masVendidos = productos.filter(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0);
    const productosAMostrar = masVendidos.length > 0 ? masVendidos : [...productos].filter(p => p.precioActual > 0 && p.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, 6);

    // Fade out skeletons before rendering real cards
    if (typeof _tmRemoverSkeletons === 'function') _tmRemoverSkeletons('masVendidosGrid');
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
        const card = window._tmCrearCard(producto, { lazy: true });
        // .mv-card = tratamiento visual propio de destacados (ver oficial-plus.css).
        // No lleva .tm-anim-card: el reveal por scroll deja las tarjetas en
        // opacity:0 hasta que entran en viewport, y dentro de un carrusel
        // horizontal las que están fuera de vista nunca "entran", así que se
        // quedaban invisibles al deslizar.
        card.classList.add('mv-card');
        grid.appendChild(card);
    });
    _tmInitDestacadosSlider();

    // Poblar la sección "Oferta del día" (se oculta sola si no hay ofertaDiaId)
    if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
    // Poblar la sección "Oferta por tiempo limitado" (independiente de ofertaDiaId)
    if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();
    // Ocultar banner de urgencia si el producto de oferta está agotado
    verificarStockOfertaBanner();
}

