/* ============================================================
   TiendaMax — módulo: tm-data
   Configuración global, validación campos, carga datos desde GitHub
   Extraído de script.src.js (L925–L1575, 651 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== CONFIGURACIÓN GLOBAL =====
// Constantes para autenticacion PBKDF2
const AUTH_SALT_KEY = 'tm_auth_salt_v3';
const AUTH_HASH_KEY = 'tm_auth_hash_v3';
const AUTH_ITERATIONS = 310000;

function _generarSal() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _getSalt() {
    let salt = localStorage.getItem(AUTH_SALT_KEY);
    if (!salt) {
        salt = _generarSal();
        try { localStorage.setItem(AUTH_SALT_KEY, salt); } catch(e) {}
    }
    return salt;
}

// SHA-256 para migración desde hashes hardcodeados viejos
async function _hashSha256(password) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let productos = tmParse(localStorage.getItem('productos'), null) || [];
let categorias = tmParse(localStorage.getItem('categorias'), null) || ['General'];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';
let subcategoriaSeleccionada = 'Todas';

// Iconos para cada categoría (Mapeo automático por palabras clave)
const ICONOS_MAPA = {
    'wifi': '📡', 'internet': '📡', 'red': '📡', 'router': '📡',
    'energia': '⚡', 'bateria': '⚡', 'luz': '⚡', 'corriente': '⚡', 'inversor': '⚡',
    'celular': '📱', 'telefono': '📱', 'movil': '📱', 'iphone': '📱', 'android': '📱',
    'utiles': '🔧', 'herramienta': '🔧', 'reparacion': '🔧', 'ferreteria': '🔧',
    'ropa': '👗', 'vestir': '👗', 'moda': '👗', 'calzado': '👗', 'zapatos': '👗',
    'electronica': '💻', 'computadora': '💻', 'laptop': '💻', 'tecnologia': '💻',
    'hogar': '🏠', 'casa': '🏠', 'mueble': '🏠', 'cocina': '🏠',
    'alimento': '🍎', 'comida': '🍎', 'fruta': '🍎', 'dulce': '🍎',
    'belleza': '💄', 'maquillaje': '💄', 'perfume': '💄', 'cuidado': '💄',
    'deporte': '⚽', 'gym': '⚽', 'ejercicio': '⚽', 'fitness': '⚽',
    'juguete': '🧸', 'niño': '🧸', 'bebe': '🧸', 'diversion': '🧸',
    'libro': '📚', 'estudio': '📚', 'papeleria': '📚', 'escuela': '📚',
    'auto': '🚗', 'carro': '🚗', 'moto': '🚗', 'vehiculo': '🚗', 'repuesto': '🚗',
    'reloj': '⌚', 'joya': '💎', 'accesorio': '💍',
    'mascota': '🐾', 'perro': '🐾', 'gato': '🐾',
    'musica': '🎵', 'audio': '🔊', 'sonido': '🔊',
    'viaje': '✈️', 'maleta': '🧳',
    'general': '🛍️'
};

// Cargar iconos personalizados desde localStorage
let iconosPersonalizados = tmParse(localStorage.getItem('iconosPersonalizados'), null) || {};

function obtenerIconoCategoria(nombre) {
    if (!nombre) return '🛍️';
    
    // 1. Prioridad: Icono personalizado guardado por el usuario
    if (iconosPersonalizados[nombre]) return iconosPersonalizados[nombre];
    
    // 2. Mapeo automático por palabras clave
    const nombreMinus = nombre.toLowerCase();
    for (const [clave, icono] of Object.entries(ICONOS_MAPA)) {
        if (nombreMinus.includes(clave)) return icono;
    }
    
    // 3. Por defecto: Icono de "Todos" (🛍️) si no se encuentra nada
    return '🛍️';
}


// ═══════════════════════════════════════════════════════
//  BÚSQUEDA HERO — con IA (Claude API)
// ═══════════════════════════════════════════════════════
let _heroSearchActivo  = '';
let _heroPrecioMin     = 0;
let _heroPrecioMax     = Infinity;
let _heroSoloConStock  = false;
let _heroOrden         = '';
let _heroSearchTimer   = null;
let _aiSearchTimer     = null;

// Scroll position saved when search opens (for reference; no longer used for body position:fixed)
let _searchOpenScrollY = 0;

// Flag to track if search panel pushed a history state
let _searchPanelHistoryPushed = false;

function abrirPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (!panel) return;
    // If already visible, don't re-open
    if (panel.classList.contains('visible')) return;
    panel.classList.add('visible');
    if (bar) { bar.classList.add('open'); bar.setAttribute('aria-expanded', 'true'); }
    // Allow hero to overflow so the absolute-positioned search panel is visible on PC
    const hero = document.querySelector('.hero.nd-hero');
    if (hero) hero.classList.add('search-panel-open');
    // Save scroll position for restoring later
    _searchOpenScrollY = window.scrollY;
    // Lock body scroll — on mobile the panel is position:fixed fullscreen,
    // so we only need overflow:hidden (NOT position:fixed on body which causes
    // jump-to-top bugs on many mobile browsers)
    document.body.classList.add('search-open');
    // Push history state so the back button closes the panel instead of exiting
    if (!_searchPanelHistoryPushed) {
        _searchPanelHistoryPushed = true;
        history.pushState({ searchPanel: true }, '');
    }
    setTimeout(() => document.getElementById('heroSearchInput')?.focus(), 50);
}

function cerrarPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    const wasOpen = panel && panel.classList.contains('visible');
    if (panel) panel.classList.remove('visible');
    if (bar)   { bar.classList.remove('open'); bar.setAttribute('aria-expanded', 'false'); }
    // Remove overflow override from hero
    const hero = document.querySelector('.hero.nd-hero');
    if (hero) hero.classList.remove('search-panel-open');
    // Restore body scroll
    document.body.classList.remove('search-open');
    document.body.style.top = '';
    _searchOpenScrollY = 0;
    // If closing from a history entry we pushed, go back
    if (wasOpen && _searchPanelHistoryPushed) {
        _searchPanelHistoryPushed = false;
        // Only go back if we're still on our pushed state
        if (history.state && history.state.searchPanel) {
            history.back();
        }
    }
}

// Handle browser back button / popstate: close overlays instead of exiting page
// NOTE: This is the ONLY popstate handler. tm-iife.src.js has a redundant one
// that was removed to avoid double-firing and history state conflicts.
window.addEventListener('popstate', function(e) {
    let closed = false;
    
    // Close search panel if open
    const panel = document.getElementById('heroSearchPanel');
    if (panel && panel.classList.contains('visible')) {
        _searchPanelHistoryPushed = false;
        panel.classList.remove('visible');
        const bar = document.getElementById('heroSearchBar');
        if (bar) { bar.classList.remove('open'); bar.setAttribute('aria-expanded', 'false'); }
        const hero = document.querySelector('.hero.nd-hero');
        if (hero) hero.classList.remove('search-panel-open');
        document.body.classList.remove('search-open');
        document.body.style.top = '';
        _searchOpenScrollY = 0;
        closed = true;
    }
    
    // Close cart drawer if open
    const cartDrawer = document.getElementById('carritoDrawer');
    if (tmOverlayAbierto('carritoDrawer')) {
        cartDrawer.classList.add('hidden');
        document.body.style.overflow = '';
        document.body.classList.remove('cart-open');
        closed = true;
    }
    
    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobileMenuOverlay');
    if (tmOverlayAbierto('mobileMenuOverlay', 'open')) {
        window._menuMovilHistoryPushed = false;
        mobileMenu.classList.remove('open');
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        if (hamburgerBtn) hamburgerBtn.classList.remove('open');
        document.body.classList.remove('menu-open');
        document.body.style.overflow = '';
        closed = true;
    }
    
    // Close product detail modal if open
    const detailModal = document.getElementById('productDetailModal');
    if (tmOverlayAbierto('productDetailModal')) {
        if (typeof cerrarDetalleModal === 'function') {
            cerrarDetalleModal();
        } else {
            detailModal.classList.add('hidden');
            detailModal.classList.remove('modal-show');
            document.body.style.overflow = '';
        }
        closed = true;
    }
    
    // Close agent chat panel if open
    const agentPanel = document.getElementById('tmAgentPanel');
    if (agentPanel && agentPanel.classList.contains('open')) {
        agentPanel.classList.remove('open');
        const agentBubble = document.getElementById('tmAgentBubble');
        if (agentBubble) agentBubble.classList.remove('hidden');
        closed = true;
    }
    
    // If we closed something, replace the current history state so the next
    // back press navigates away instead of getting stuck in a loop.
    // Do NOT pushState (which would create an infinite back trap).
    if (closed) {
        history.replaceState({ initial: true }, '');
    }
});

// Push an initial history state on page load so the first back press
// doesn't exit the page (gives the popstate handler a chance to work)
(function() {
    if (history.state === null || history.state === undefined) {
        history.replaceState({ initial: true }, '');
    }
})();

// Stubs de compatibilidad
function inicializarSliderPrecios() {}
function actualizarSliderPrecio() {}

// Búsqueda local rápida
function busquedaLocal(q) {
    if (!q) return productos.slice(0, 6);
    const normFn = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ql = normFn(q);
    // Also try stemmed form for plurals
    let qlStem = ql;
    if (ql.endsWith('es') && ql.length - 2 >= 3) qlStem = ql.slice(0, -2);
    else if (ql.endsWith('s') && ql.length - 1 >= 4) qlStem = ql.slice(0, -1);
    return productos.filter(p =>
        normFn(p.nombre).includes(ql) ||
        normFn(p.descripcion).includes(ql) ||
        normFn(p.categoria).includes(ql) ||
        normFn(p.subcategoria).includes(ql) ||
        (qlStem !== ql && (
            normFn(p.nombre).includes(qlStem) ||
            normFn(p.descripcion).includes(qlStem) ||
            normFn(p.categoria).includes(qlStem) ||
            normFn(p.subcategoria).includes(qlStem)
        ))
    ).slice(0, 6);
}

// Búsqueda inteligente local (sin depender de APIs externas)
async function busquedaConIA(q) {
    if (!q || q.length < 3 || productos.length === 0) return null;

    const normalizar = (txt) => String(txt || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ');

    // Spanish stemming: strips plural suffixes for better matching
    const stemES = (word) => {
        if (!word || word.length < 5) return word;
        if (word.endsWith('es') && word.length - 2 >= 3) return word.slice(0, -2);
        if (word.endsWith('s') && word.length - 1 >= 4) return word.slice(0, -1);
        return word;
    };

    const alias = {
        wifi: ['router', 'internet', 'red', 'repetidor'],
        internet: ['wifi', 'router', 'red'],
        bateria: ['bateria', 'power bank', 'energia', 'corriente'],
        energia: ['inversor', 'bateria', 'corriente', 'solar'],
        corriente: ['energia', 'inversor', 'bateria'],
        inversor: ['inversor', 'energia', 'corriente', 'solar', 'bateria', 'hibrido'],
        telefono: ['celular', 'movil', 'smartphone'],
        celular: ['telefono', 'movil', 'smartphone'],
        laptop: ['computadora', 'pc'],
        computadora: ['laptop', 'pc'],
        camara: ['foto', 'fotografia', 'seguridad'],
        tv: ['televisor', 'monitor'],
        router: ['wifi', 'internet', 'red', 'repetidor'],
        repetidor: ['wifi', 'router', 'internet', 'red', 'extensor'],
        solar: ['panel', 'fotovoltaico', 'energia', 'inversor', 'controlador'],
        cargador: ['cargador', 'carga', 'usb', 'rapido'],
        switch: ['switch', 'red', 'ethernet', 'poE'],
        controlador: ['solar', 'mppt', 'controlador', 'carga'],
        seguridad: ['camara', 'alarma', 'sensor', 'vigilancia'],
        transferencia: ['transferencia', 'interruptor', 'switch'],
        motos: ['moto', 'motocicleta', 'scooter', 'motor'],
        carro: ['auto', 'vehiculo', 'repuesto', 'neumatico'],
        audio: ['parlante', 'altavoz', 'bocina', 'speaker', 'bluetooth'],
        memoria: ['usb', 'pendrive', 'microsd', 'tarjeta'],
        cable: ['cable', 'hdmi', 'usb', 'cargador', 'conector'],
        lampara: ['led', 'luz', 'iluminacion', 'foco']
    };

    const tokensBase = normalizar(q).split(/\s+/).filter(Boolean);
    const tokens = new Set(tokensBase);
    // Add both original and stemmed forms to alias lookup
    tokensBase.forEach(t => {
        const stemmed = stemES(t);
        (alias[t] || []).forEach(a => tokens.add(a));
        if (stemmed !== t) {
            tokens.add(stemmed);  // Add stemmed form (e.g. "inversor" from "inversores")
            (alias[stemmed] || []).forEach(a => tokens.add(a));  // Add aliases for stemmed form
        }
    });

    const resultados = productos
        .map(p => {
            const texto = normalizar([p.nombre, p.descripcion, p.categoria, p.subcategoria].join(' '));
            const pNombre = normalizar(p.nombre);
            const pCat = normalizar(p.categoria);
            const pSubcat = normalizar(p.subcategoria);
            let score = 0;
            // Distinguish between primary tokens (original query + stemmed) and alias tokens
            const primaryTokens = new Set(tokensBase);
            const stemmedQ = stemES(normalizar(q));
            if (stemmedQ !== normalizar(q)) primaryTokens.add(stemmedQ);
            tokens.forEach(t => {
                if (!t) return;
                const isPrimary = primaryTokens.has(t);
                // Primary tokens get much higher weight than alias tokens
                if (texto.includes(t)) score += isPrimary ? 4 : 1;
                if (pNombre.includes(t)) score += isPrimary ? 10 : 2;
                if (pCat.includes(t) || pSubcat.includes(t)) score += isPrimary ? 6 : 1;
            });
            // Bonus: exact full query match in name (highest signal)
            if (pNombre.includes(normalizar(q))) score += 12;
            // Bonus: stemmed full query match in name
            if (stemmedQ !== normalizar(q) && pNombre.includes(stemmedQ)) score += 10;
            // Penalty: if the product's category is completely unrelated to the query
            // Uses the UNRELATED_CATEGORY_MAP from tm-agent for stronger penalty
            const qKey = stemmedQ || normalizar(q);
            const unrelatedMap = {
                'inversor':  ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO', 'UTILES'],
                'bateria':   ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO'],
                'router':    ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO'],
                'celular':   ['MOTOS', 'CARROS', 'ENERGIA', 'REDES'],
                'solar':     ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'ALIMENTO', 'CELULARES'],
                'cargador':  ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO'],
                'audio':     ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'ALIMENTO'],
                'seguridad': ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'ALIMENTO']
            };
            if (unrelatedMap[qKey] && unrelatedMap[qKey].some(uc => (p.categoria || '').toUpperCase() === uc)) {
                score -= 30;  // Strong penalty for wrong-category products
            }
            if (score === 0) return null;
            return { producto: p, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.producto.stock - b.producto.stock)
        .slice(0, 5)
        .map(x => x.producto);

    return resultados.length ? resultados : null;
}

function renderSugerencias(resultados, q) {
    const sugBox = document.getElementById('heroSearchSuggestions');
    if (!sugBox) return;
    if (!resultados || resultados.length === 0) {
        // Mostrar más vendidos como sugerencia cuando no hay resultados
        const sugeridos = productos
            .filter(p => p.stock > 0 && (p.masVendido === true || p.masVendido === 'true'))
            .slice(0, 4);
        const fallback = sugeridos.length > 0 ? sugeridos : productos.filter(p => p.stock > 0).slice(0, 4);
        if (fallback.length === 0) {
            sugBox.innerHTML = '<div class="hsb-sug-empty">😕 Sin resultados para "' + escapeHtml(q) + '"</div>';
            return;
        }
        const items = fallback.map(p =>
            '<div class="hsb-sug-item" onclick="seleccionarSugerencia(' + safeNum(p.id) + ')">' +
            '<img class="hsb-sug-img" src="' + escapeAttr(p.imagen) + '" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
            '<span class="hsb-sug-name">' + escapeHtml(p.nombre) + '</span>' +
            '<span class="hsb-sug-price">$' + Number(p.precioActual).toFixed(2) + '</span>' +
            '</div>'
        ).join('');
        sugBox.innerHTML =
            '<div class="hsb-sug-empty" style="padding:8px 12px;font-size:12px;">😕 Sin resultados para "' + escapeHtml(q) + '"</div>' +
            '<div style="padding:6px 12px;font-size:11px;opacity:0.6;border-top:1px solid rgba(255,255,255,0.08);">🔥 Te puede interesar</div>' +
            items;
        return;
    }
    sugBox.innerHTML = resultados.map(p => {
        // resaltarTexto ya genera HTML controlado a partir de p.nombre escapado
        const nombre = q ? resaltarTexto(escapeHtml(p.nombre), q) : escapeHtml(p.nombre);
        const agotadoBadge = p.stock === 0 ? '<span style="color:#e74c3c;font-size:10px;font-weight:700;margin-left:4px;">AGOTADO</span>' : '';
        return '<div class="hsb-sug-item" onclick="seleccionarSugerencia(' + safeNum(p.id) + ')">' +
            '<img class="hsb-sug-img" src="' + escapeAttr(p.imagen) + '" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
            '<span class="hsb-sug-name">' + nombre + agotadoBadge + '</span>' +
            '<span class="hsb-sug-price">$' + Number(p.precioActual).toFixed(2) + '</span>' +
            '</div>';
    }).join('');
}

async function buscarDesdeHero(query) {
    clearTimeout(_heroSearchTimer);
    clearTimeout(_aiSearchTimer);
    const q = (query || '').trim();
    const sugBox = document.getElementById('heroSearchSuggestions');
    const aiLabel = document.getElementById('hsb-ai-label');
    if (!q) {
        if (sugBox) sugBox.innerHTML = '';
        if (aiLabel) aiLabel.style.display = 'none';
        return;
    }
    _heroSearchTimer = setTimeout(async () => {
        const locales = busquedaLocal(q);
        renderSugerencias(locales, q);
        if (q.length >= 3) {
            if (aiLabel) aiLabel.style.display = 'block';
            if (locales.length < 2 && sugBox) {
                sugBox.innerHTML = '<div class="hsb-ai-loading">🤖 Buscando con IA</div>';
            }
            _aiSearchTimer = setTimeout(async () => {
                const iaResultados = await busquedaConIA(q);
                if (iaResultados && iaResultados.length > 0) {
                    renderSugerencias(iaResultados, q);
                } else {
                    renderSugerencias(locales.length > 0 ? locales : [], q);
                }
            }, 600);
        }
    }, 250); // OPT 3G: 250ms debounce (era 150) — menos renders en tipeo rápido en 3G
}

function _tmRegistrarBusqueda(q) {
    try {
        const base = _fbRtdbUrl();
        if (!base) return;
        const key = q.replace(/[.#$/[\]]/g, '_').slice(0, 60);
        const url = base + '/analytics/busquedas/' + encodeURIComponent(key) + '.json';
        fetch(url + '?_=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : 0)
            .then(count => fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify((Number(count) || 0) + 1)
            }))
            .catch(() => {});
    } catch(e) {}
}

function aplicarBusquedaHero() {
    const q = (document.getElementById('heroSearchInput')?.value || '').trim().toLowerCase();
    _heroSearchActivo = q;
    // Leer filtros del panel de búsqueda
    _heroPrecioMin    = parseFloat(document.getElementById('hsbPrecioMin')?.value || '0') || 0;
    _heroPrecioMax    = parseFloat(document.getElementById('hsbPrecioMax')?.value || '') || Infinity;
    _heroSoloConStock = !!(document.getElementById('hsbSoloStock')?.checked);
    _heroOrden        = document.getElementById('hsbOrden')?.value || '';
    if (q.length >= 2) {
        try {
            let _bs = tmParseObject(localStorage.getItem('tm_busquedas_v1'));
            _bs[q] = (_bs[q] || 0) + 1;
            // Limitar a 300 búsquedas únicas — eliminar las menos frecuentes
            const _bsKeys = Object.keys(_bs);
            if (_bsKeys.length > 300) {
                const sorted = _bsKeys.sort((a, b) => _bs[a] - _bs[b]);
                sorted.slice(0, _bsKeys.length - 300).forEach(k => delete _bs[k]);
            }
            localStorage.setItem('tm_busquedas_v1', JSON.stringify(_bs));
            _tmRegistrarBusqueda(q);
        } catch(e) {}
    }
    cerrarPanelBusqueda();
    mostrarVistaCategoria('Todas');
}


function exportarBackupCompleto() {
    const claves = ['heroBanners','heroTagline','monedaActual','tasaMN','tiendaNombre',
        'carrito_v2','wishlist_v1','activeCountdown','ofertaDiaId','ofertaDiaTexto',
        'revolico_config','tm_busquedas_v1'];
    const datos = {};
    claves.forEach(k => { try { datos[k] = localStorage.getItem(k); } catch(e) {} });
    const backup = { fecha: new Date().toISOString(), version: '2.0', localStorage: datos };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'tiendamax-backup-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    mostrarNotificacion('✅ Backup descargado');
}

function seleccionarSugerencia(id) {
    cerrarPanelBusqueda();
    abrirDetalleProducto(id);
}

function resaltarTexto(texto, query) {
    try {
        const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        // Sin padding horizontal: con queries cortas ("a") casi cada letra del
        // nombre queda envuelta en su propio <mark>, y el padding las separaba
        // visualmente ("B a terí a" en vez de "Batería").
        return texto.replace(re, '<mark style="background:rgba(201,169,110,0.35);color:inherit;border-radius:3px;">$1</mark>');
    } catch(e) { return texto; }
}

// Cerrar panel al tocar fuera (or press Escape)
// Fix: also check .hsb-pill and #pwa-install-banner so clicks inside
// the search UI don't accidentally close the panel (PC search was broken).
document.addEventListener('click', (e) => {
    if (e.target.closest('.hsb-search') || e.target.closest('.hsb-pill') || e.target.closest('.nd-hero-search')) return;
    cerrarPanelBusqueda();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarPanelBusqueda();
});

// ── Touch scroll containment inside the search panel ──
// Prevents scroll chaining: when user scrolls inside the panel
// and reaches the boundary, the page behind should NOT scroll.
(function _initSearchPanelTouchGuard() {
    const panel = document.getElementById('heroSearchPanel');
    if (!panel) return;

    panel.addEventListener('touchmove', (e) => {
        // If the panel itself can scroll, just stop propagation to body
        // (overscroll-behavior:contain handles modern browsers; this is a fallback)
        e.stopPropagation();
    }, { passive: true });

    // Also guard the suggestions container (nested scrollable area)
    const suggestions = document.getElementById('heroSearchSuggestions');
    if (suggestions) {
        suggestions.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }
})();

// ═══════════════════════════════════════════════════════
//  SUBIDA DE IMÁGENES A GITHUB (archivos .jpg reales)
// ═══════════════════════════════════════════════════════
async function subirImagenAGitHub(fileOrBase64) {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');

    const base64full = await comprimirImagen(fileOrBase64);

    if (!user || !repo || !token) return base64full; // fallback sin config

    try {
        const base64data = base64full.includes(',') ? base64full.split(',')[1] : base64full;
        if (!base64data) return base64full; // fallback si el data URL está malformado
        // comprimirImagen() devuelve WebP siempre que el navegador lo soporte
        // (la inmensa mayoría de los casos) — la extensión del archivo debe
        // reflejar el formato real, si no queda un .jpg que por dentro es
        // WebP (rompe los link previews de WhatsApp/Facebook, que validan
        // el formato real de la imagen, no solo la extensión).
        const mimeMatch = base64full.match(/^data:image\/(\w+);base64,/);
        const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'jpg';
        const filename   = 'img_' + Date.now() + '.' + ext;
        const path       = 'imagenes/' + filename;
        const apiUrl     = 'https://api.github.com/repos/' + user + '/' + repo + '/contents/' + path;
        const headers    = { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' };
        const res = await fetch(apiUrl, {
            method: 'PUT', headers,
            body: JSON.stringify({ message: 'Imagen: ' + filename, content: base64data })
        });
        if (res.ok) return 'https://raw.githubusercontent.com/' + user + '/' + repo + '/main/' + path;
    } catch(e) { /* fallback */ }
    return base64full;
}

// ═══════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════
function stat(icon, label, value, color) {
    const uid = 'ts' + Math.random().toString(36).slice(2,7);
    const sizeCls = typeof value === 'number' ? 'admin-stat-value' : 'admin-stat-value';
    const html = '<div class="admin-analytics-stat">' +
        '<div class="icon">' + icon + '</div>' +
        '<div id="' + uid + '" class="tm-counter ' + sizeCls + '" style="color:' + (color||'var(--primary-color,#c9a96e)') + ';">' + value + '</div>' +
        '<div class="label">' + label + '</div>' +
        '</div>';
    setTimeout(() => {
        const el = document.getElementById(uid);
        if (!el) return;
        if (typeof value === 'number') {
            animarContador(el, value, 800 + Math.random() * 500);
        } else if (typeof value === 'string' && value.startsWith('$')) {
            animarContador(el, parseFloat(value.replace('$','')), 1000, '$');
        }
    }, 60);
    return html;
}

// ===== VALIDACIÓN DE CAMPOS =====

function validarProducto(producto) {
    const errores = [];
    
    if (!producto.nombre || producto.nombre.trim().length === 0) {
        errores.push('El nombre del producto es requerido');
    }
    if (!producto.descripcion || producto.descripcion.trim().length === 0) {
        errores.push('La descripción es requerida');
    }
    if (!producto.imagen) {
        errores.push('La imagen es requerida');
    }
    if (!producto.precioActual || producto.precioActual <= 0) {
        errores.push('El precio debe ser mayor a 0');
    }
    // FIX: permitir stock = 0 (producto agotado al crearlo). Solo rechazar negativos o no-números.
    if (producto.stock === undefined || producto.stock === null ||
        isNaN(Number(producto.stock)) || Number(producto.stock) < 0) {
        errores.push('El stock no puede ser negativo');
    }
    if (!producto.categoria) {
        errores.push('La categoría es requerida');
    }
    
    // Solo calcular descuento si hay precio original definido
    if (producto.precioOriginal && producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) {
        const descuentoCalculado = Math.round(((producto.precioOriginal - producto.precioActual) / producto.precioOriginal) * 100);
        producto.descuento = descuentoCalculado;
    } else {
        producto.descuento = 0;
    }
    
    return errores;
}

// ===== CARGA DE DATOS DESDE GITHUB =====

// Función para hashear la contraseña (PBKDF2). salt opcional (default: _getSalt())
async function hashPassword(password, salt) {
    const s = salt || _getSalt();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: new TextEncoder().encode(s), iterations: AUTH_ITERATIONS, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const hashArray = Array.from(new Uint8Array(bits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cargarDatosDesdeGitHub() {
    // Intentar usar raw.githubusercontent.com si está configurado (no tiene límite de 1MB)
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    const baseUrl = (ghUser && ghRepo)
        ? `https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main`
        : null;

    // Función helper: intenta raw primero, luego relativo
    // cache:'no-cache' = GET condicional (304 si no cambió → sin re-descarga)
    async function fetchJSON(filename) {
        const opts = { cache: 'no-cache' };
        if (baseUrl) {
            try {
                const res = await fetch(`${baseUrl}/${filename}`, opts);
                if (res.ok) return await res.json();
            } catch(e) {}
        }
        // Fallback: ruta relativa (funciona en GitHub Pages)
        try {
            const res = await fetch(filename, opts);
            if (res.ok) return await res.json();
        } catch(e) {}
        return null;
    }

    try {
        // ── PASO 1: Solo categorias.json (pequeño) — config no crítica se carga después ──
        const [dataCat, dataComisiones] = await Promise.all([
            fetchJSON('categorias.json').catch(() => null),
            Promise.resolve(null), // comisiones consolidadas en productos.json
        ]);
        // Config no crítica: se carga en background sin bloquear la UI
        setTimeout(async () => {
            try {
                const [dataG, dataR] = await Promise.all([
                    fetchJSON('grupos_facebook_config.json').catch(() => null),
                    fetchJSON('revolico_config.json').catch(() => null),
                ]);
                if (dataG && dataG.grupos) localStorage.setItem('gruposFB', JSON.stringify(dataG.grupos));
                if (dataR && Object.keys(dataR).length > 0) localStorage.setItem('revolicoConfig', JSON.stringify(dataR));
            } catch(e) {}
        }, 4000);

        // Aplicar categorías de inmediato para que el grid aparezca rápido
        if (dataCat) {
            if (Array.isArray(dataCat) && dataCat.length > 0) {
                categorias = dataCat;
                localStorage.setItem('categorias', JSON.stringify(categorias));
            } else if (dataCat.nombres && dataCat.nombres.length > 0) {
                categorias = dataCat.nombres;
                localStorage.setItem('categorias', JSON.stringify(categorias));
                if (dataCat.iconos && Object.keys(dataCat.iconos).length > 0) {
                    Object.assign(iconosPersonalizados, dataCat.iconos);
                    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
                }
            }
        }

        // comisiones consolidadas en productos.json — no se usa archivo separado
        // grupos FB y revolico config se cargan en background (setTimeout arriba)

        // Ventas migradas a Firebase — sync en background tras cargar productos
        setTimeout(_fbSincronizarVentasAlIniciar, 2000);

        // Countdown desde Firebase — sincroniza a todos los dispositivos de clientes
        setTimeout(async () => {
            try {
                const base = _fbRtdbUrl();
                if (!base) return;
                const r = await fetch(base + '/configuracion/activeCountdown.json');
                if (!r.ok) return;
                const fbCd = await r.json();
                if (fbCd && fbCd.productId && fbCd.endTime && fbCd.endTime > Date.now()) {
                    localStorage.setItem('activeCountdown', JSON.stringify(fbCd));
                } else {
                    localStorage.removeItem('activeCountdown');
                }
                if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();
                if (typeof iniciarCountdownsActivos === 'function') iniciarCountdownsActivos();
            } catch(e) {}
        }, 800);

        // Categorías desde Firebase RTDB — más recientes que categorias.json (admin las actualiza ahí)
        setTimeout(async () => {
            try {
                const base = _fbRtdbUrl();
                if (!base) return;
                const r = await fetch(base + '/configuracion/categorias.json');
                if (!r.ok) return;
                const fbCat = await r.json();
                if (!fbCat || !Array.isArray(fbCat.nombres) || fbCat.nombres.length === 0) return;
                // Solo aplicar si Firebase tiene datos más recientes que categorias.json
                const mismas = fbCat.nombres.length === categorias.length && fbCat.nombres.every(c => categorias.includes(c));
                if (!mismas) {
                    categorias = fbCat.nombres;
                    localStorage.setItem('categorias', JSON.stringify(categorias));
                    if (fbCat.iconos) {
                        Object.assign(iconosPersonalizados, fbCat.iconos);
                        localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
                    }
                    renderizarCategoriasHome();
                    actualizarSelectCategorias();
                    actualizarBotonesCategorias();
                    actualizarListaCategorias();
                }
            } catch(e) {}
        }, 1500);

        // Renderizar categorías YA (con datos frescos, sin esperar archivos pesados)
        renderizarCategoriasHomeInstant(); // actualiza el grid visual inmediatamente
        renderizarCategoriasHome();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();

        // ── PASO 2: Cargar productos PRIMERO (lo que el usuario quiere ver) ──
        // OPT 3G: cargar productos-lite.json (39KB) en vez de productos.json (148KB).
        // lite NO tiene descripción (se carga on-demand al abrir el modal de detalle).
        let dataProd = await fetchJSON('productos-lite.json').catch(() => null);
        if (!dataProd || !Array.isArray(dataProd) || dataProd.length === 0) {
            dataProd = await fetchJSON('productos.json').catch(() => null);
        }

        // Aplicar productos
        if (dataProd && dataProd.length > 0) {
            // Guardar en localStorage ANTES de renderizar para que Instant tenga datos frescos
            const productosLocales = tmParse(localStorage.getItem('productos'), []) || [];
            const mapaLocal = {};
            productosLocales.forEach(p => { mapaLocal[p.id] = p; });

            productos = dataProd.map(p => {
                const fix = url => url && url.includes('raw.githubusercontent.com')
                    ? url.replace(/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\//,'https://tiendamax.org/')
                    : url;
                if (p.imagen) p.imagen = fix(p.imagen);
                if (p.imagenSecundaria) p.imagenSecundaria = fix(p.imagenSecundaria);
                if (Array.isArray(p.imagenes)) p.imagenes = p.imagenes.map(fix);

                // comision viene directamente del producto en productos.json
                const local = mapaLocal[p.id];
                if (local && local.comision !== undefined && p.comision === undefined) {
                    p.comision = local.comision;
                }
                if (local && local.resenas && local.resenas.length > 0) p.resenas = local.resenas;
                return p;
            });
            localStorage.setItem('productos', JSON.stringify(productos));
            // Refrescar categorías con conteos reales ahora que productos está listo
            renderizarCategoriasHomeInstant();
        }

        // Re-renderizar todo ahora que los productos están listos
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarRecientes();  // 👀 Vistos recientemente
        _observarTestimonios(); // 🌟 Testimonios reales (lazy: solo cuando el bloque es visible)
        actualizarListaProductos();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        verificarOfertasYMostrarBanner();
        // Si el admin está abierto, actualizar el select de oferta del día
        // con los productos frescos recién cargados
        const adminAbierto = document.getElementById('adminPanel');
        if (adminAbierto && adminAbierto.classList.contains('visible')) {
            poblarSelectOfertaDia();
        }
        inicializarSliderPrecios();
        // Refrescar Me Gusta si está visible
        const vMG = document.getElementById('vistaMeGusta');
        if (vMG && vMG.style.display !== 'none') mostrarVistaMeGusta();
        verificarProductosNuevos();
        // Re-render secciones especiales ahora que productos están frescos
        if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
        if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();

        // ── PASO 3: Banners ON-DEMAND (3G-optimizado) ──
        // Solo se descarga banners.json (89KB) cuando el hero es visible (IntersectionObserver)
        // Y el navegador está idle (requestIdleCallback) → no compite con productos por ancho de banda
        const _cargarBannersOnDemand = async () => {
            if (window._tmBannersLoaded) return;
            window._tmBannersLoaded = true;
            try {
                const dataBanners = await fetchJSON('banners.json').catch(() => null);
                if (dataBanners && Array.isArray(dataBanners) && dataBanners.length > 0) {
                    localStorage.setItem('heroBanners', JSON.stringify(dataBanners));
                    if (typeof window.recargarBanners === 'function') window.recargarBanners(dataBanners);
                }
            } catch(e) {}
        };
        const _heroEl = document.querySelector('.hero, .hero-galeria, .hero-seccion, #hero, [class*="hero"]');
        if (_heroEl && typeof IntersectionObserver !== 'undefined') {
            const _bannerObs = new IntersectionObserver(function(entries) {
                if (entries[0] && entries[0].isIntersecting) {
                    _bannerObs.disconnect();
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(_cargarBannersOnDemand, { timeout: 4000 });
                    } else {
                        setTimeout(_cargarBannersOnDemand, 1500);
                    }
                }
            }, { rootMargin: '150px' });
            _bannerObs.observe(_heroEl);
            setTimeout(function() { if (!window._tmBannersLoaded) _cargarBannersOnDemand(); }, 6000);
        } else {
            setTimeout(_cargarBannersOnDemand, 2500);
        }

        // CRÍTICO: si el usuario YA navegó a una categoría mientras se cargaba,
        // re-renderizar la vista de productos con los datos frescos.
        const vCat = document.getElementById('vistaCategoria');
        if (vCat && vCat.style.display === 'block') {

            renderizarProductos();
        }


    } catch (e) {
        console.warn('⚠️ Error en cargarDatosDesdeGitHub:', e && e.message);

        renderizarCategoriasHome();
        renderizarMasVendidos();
        setTimeout(cargarTestimoniosFirebase, 1500);
        verificarOfertasYMostrarBanner();
        if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
        if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();
        // También re-render si estamos en vista categoría
        const vCat = document.getElementById('vistaCategoria');
        if (vCat && vCat.style.display === 'block' && typeof renderizarProductos === 'function') {
            renderizarProductos();
        }
    }
}

// Sincronizar entre pestañas
window.addEventListener('storage', (event) => {
    if (event.key === 'productos') {
        productos = tmParse(event.newValue, null) || [];
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
    }
    if (event.key === 'categorias') {
        categorias = tmParse(event.newValue, null) || ['General'];
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarCategoriasHome();
        renderizarProductos();
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    }
    if (event.key === 'activeCountdown' || event.key === 'ofertaDiaId' || event.key === 'ofertaDiaTexto') {
        if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
        if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();
        if (typeof iniciarCountdownsActivos === 'function') iniciarCountdownsActivos();
    }
});

