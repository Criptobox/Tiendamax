/* ============================================================
   TiendaMax — módulo: tm-init
   Lógica persuasión, inicialización, automatización Selenium, countdown timer, galería hero
   Extraído de script.src.js (L4283–L5074, 792 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== LÓGICA DE PERSUASIÓN Y VENTAS =====

function verificarOfertasYMostrarBanner() {
    const banner = document.getElementById('urgenciaBanner');
    if (!banner) return;

    // El banner superior solo debe verse en el inicio.
    // En categorías/listados/detalle ya existen etiquetas dentro de las tarjetas.
    if (typeof tmVistaInicioActiva === 'function' && !tmVistaInicioActiva()) {
        banner.style.setProperty('display', 'none', 'important');
        banner.onclick = null;
        if (typeof actualizarOffsetsUI === 'function') setTimeout(actualizarOffsetsUI, 0);
        return;
    }

    // Prioridad 1: Oferta del Día configurada en el admin
    const ofertaDiaId    = localStorage.getItem('ofertaDiaId');
    const ofertaDiaTexto = localStorage.getItem('ofertaDiaTexto') || '🔥 OFERTA DEL DÍA';

    // Prioridad 2: Countdown activo
    const cdData = localStorage.getItem('activeCountdown');
    const cdObj  = cdData ? (() => { try { return JSON.parse(cdData); } catch(e) { return null; } })() : null;
    const cdValido = cdObj && cdObj.endTime && cdObj.endTime > Date.now();

    let targetId = null;

    // Si el producto de la oferta está agotado, el banner se oculta solo —
    // antes seguía saliendo hasta que el cliente recargara. OJO: en la tienda
    // `productos` es un `let` top-level (bareword global), NO window.productos.
    const _cat = (typeof productos !== 'undefined' && Array.isArray(productos)) ? productos : [];
    const _prodOferta = ofertaDiaId ? _cat.find(p => String(p.id) === String(ofertaDiaId)) : null;
    // Catálogo aún no cargado (_cat vacío) → no ocultar todavía (evita parpadeo al arrancar)
    const _ofertaAgotada = ofertaDiaId && _cat.length > 0 && (!_prodOferta || Number(_prodOferta.stock || 0) <= 0);

    if (ofertaDiaId && !_ofertaAgotada) {
        targetId = ofertaDiaId;
        while (banner.firstChild) banner.removeChild(banner.firstChild);
        const spanFlash = document.createElement('span');
        spanFlash.className = 'flash-deal';
        spanFlash.textContent = ofertaDiaTexto + ' · VER AHORA →';
        banner.appendChild(spanFlash);
    } else if (cdValido) {
        targetId = cdObj.productId;
        while (banner.firstChild) banner.removeChild(banner.firstChild);
        banner.appendChild(document.createTextNode('🔥 ' + (cdObj.texto || '¡Oferta especial!') + ' '));
        const spanFlash = document.createElement('span');
        spanFlash.className = 'flash-deal';
        spanFlash.textContent = 'VER AHORA →';
        banner.appendChild(spanFlash);
    } else {
        // No hay oferta ni countdown → ocultar con !important + clase para
        // ganarle a la regla CSS '.urgencia-banner{display:flex !important}'
        banner.style.setProperty('display', 'none', 'important');
        if (document.body) document.body.classList.add('tm-no-oferta-banner');
        banner.onclick = null;
        setTimeout(actualizarOffsetsUI, 0);
        return;
    }

    // Sí hay oferta → quitar la clase que lo bloquea y mostrarlo
    if (document.body) document.body.classList.remove('tm-no-oferta-banner');
    banner.style.setProperty('display', 'flex', 'important');
    banner.style.cursor  = 'pointer';
    setTimeout(actualizarOffsetsUI, 0);

    banner.onclick = () => {
        if (!targetId) return;
        const idNum = Number(targetId);
        const tarjeta = document.querySelector(`[onclick*="abrirDetalleProducto(${idNum})"]`);
        if (tarjeta) {
            tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            tarjeta.style.transition = 'box-shadow 0.3s';
            tarjeta.style.boxShadow  = '0 0 0 3px #ff6b35, 0 8px 32px rgba(255,107,53,0.5)';
            setTimeout(() => {
            tarjeta.style.boxShadow = ''; }, 2000);
        }
        abrirDetalleProducto(idNum);
    };
}

// Re-evaluar el banner de oferta sin que el cliente tenga que recargar:
// cada 90 s se relee config.json (1 KB, network-first) por si el admin activó,
// desactivó o cambió la oferta, y se re-chequea el stock local. También al
// volver a la pestaña (visibilitychange).
(function _tmBannerAutoRefresh() {
    let corriendo = false;
    async function tick() {
        if (corriendo || document.visibilityState === 'hidden') return;
        corriendo = true;
        try {
            const r = await fetch('config.json?_=' + Date.now(), { cache: 'no-store' });
            if (r.ok) {
                const cfg = await r.json();
                if (cfg && typeof cfg === 'object') {
                    if (cfg.ofertaDiaId) {
                        localStorage.setItem('ofertaDiaId', String(cfg.ofertaDiaId));
                        if (cfg.ofertaDiaTexto) localStorage.setItem('ofertaDiaTexto', cfg.ofertaDiaTexto);
                    } else {
                        localStorage.removeItem('ofertaDiaId');
                        localStorage.removeItem('ofertaDiaTexto');
                    }
                }
            }
        } catch (e) {}
        try { verificarOfertasYMostrarBanner(); } catch (e) {}
        corriendo = false;
    }
    setInterval(tick, 90000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
})();

// ===== INICIALIZACIÓN =====

function _tmInyectarSkeletons() {
    const sk = '<div class="tm-sk-card">' +
        '<div class="tm-sk tm-sk-img"></div>' +
        '<div class="tm-sk-body">' +
            '<div class="tm-sk tm-sk-line" style="width:80%"></div>' +
            '<div class="tm-sk tm-sk-line" style="width:58%"></div>' +
            '<div class="tm-sk tm-sk-line" style="width:40%"></div>' +
            '<div class="tm-sk tm-sk-btn"></div>' +
        '</div></div>';
    const grid = document.getElementById('productosGrid');
    // OPT 3G: 8 skeletons = mismo count que el render progresivo, transición visual sin salto
    if (grid && !grid.querySelector('.producto-card')) grid.innerHTML = Array(8).fill(sk).join('');
    const mv = document.getElementById('masVendidosGrid');
    if (mv && !mv.querySelector('.producto-card')) mv.innerHTML = Array(2).fill(sk).join('');
}

/** Smooth fade-out of skeleton cards before real products render */
function _tmRemoverSkeletons(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const skels = grid.querySelectorAll('.tm-sk-card');
    if (skels.length === 0) return;
    skels.forEach(s => s.classList.add('tm-fade-out'));
    setTimeout(() => {
        skels.forEach(s => { if (s.parentNode) s.remove(); });
    }, 320);
}

function inicializarTienda() {
    _tmInyectarSkeletons();
    // Restaurar badges inmediatamente al cargar
    actualizarContadorCarrito();
    actualizarBadgeCorazon();

    // Renderizar desde caché local ANTES de ir a la red
    // → el usuario ve productos al instante en visitas repetidas
    // FIX: usar typeof guard en vez de try/catch para no generar warnings en consola
    if (productos.length > 0) {
        if (typeof renderizarCategoriasHomeInstant === 'function') { try { renderizarCategoriasHomeInstant(); } catch(e) {} }
        if (typeof renderizarCategoriasHome === 'function') { try { renderizarCategoriasHome(); } catch(e) {} }
        if (typeof renderizarMasVendidos === 'function') { try { renderizarMasVendidos(); } catch(e) {} }
        if (typeof renderizarProductos === 'function') { try { renderizarProductos(); } catch(e) {} }
    }

    // Fix: asegurar que el hero galería se pueble incluso si renderizarMasVendidos falló
    if (typeof renderHeroGaleria === 'function' && productos.length > 0) {
        try {
            renderHeroGaleria();
        } catch(e) { console.warn('renderHeroGaleria direct call failed:', e.message); }

    }

    cargarDatosDesdeGitHub(); // actualiza en background

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.onsubmit = null;
        productForm.addEventListener('submit', agregarProductoForm);
    }

    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.onsubmit = null;
        editForm.addEventListener('submit', guardarProductoEditado);
    }

    const loginForm = document.querySelector('#loginModal form');
    if (loginForm) {
        loginForm.onsubmit = null;
        loginForm.addEventListener('submit', verificarPassword);
    }

    setInterval(() => {
        const panel = document.getElementById('adminPanel');
        if (panel && !panel.classList.contains('hidden')) {
            verificarEstadoBackend();
        }
    }, 30000);

    // El tema se inicializa por _initTema() (ver toggleDarkMode arriba).
    // Re-aplicamos por si el botón apareció después de cargar.
    if (typeof _initTema === 'function') _initTema();

    iniciarCountdownsActivos();
    actualizarOffsetsUI();
    actualizarVisibilidadBannerOferta(true);
    setTimeout(actualizarOffsetsUI, 200);
    setTimeout(actualizarOffsetsUI, 1200);
    window.addEventListener('resize', actualizarOffsetsUI);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', actualizarOffsetsUI);
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarTienda);
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-action="sincronizarTodoConGitHub"]').forEach(el => {
            el.addEventListener('click', sincronizarTodoConGitHub);
        });
    });
} else {
    inicializarTienda();
    document.querySelectorAll('[data-action="sincronizarTodoConGitHub"]').forEach(el => {
        el.addEventListener('click', sincronizarTodoConGitHub);
    });
}

// ===== AUTOMATIZACIÓN HÍBRIDA (SELENIUM) =====


// ===== COUNTDOWN TIMER =====
// countdownIntervals ya está declarada arriba (al inicio del archivo)
// para evitar problemas de TDZ. Solo aseguramos que sea objeto.
if (typeof countdownIntervals !== 'object' || countdownIntervals === null) {
    countdownIntervals = {};
}

async function _sincronizarConfigGH() {
    try {
        const user = localStorage.getItem('githubUser');
        const repo = localStorage.getItem('githubRepo');
        const token = localStorage.getItem('githubToken');
        if (!user || !repo || !token) return;
        const cfg = {
            tasaMN: parseFloat(localStorage.getItem('tasaMN') || '0') || undefined,
            ofertaDiaId: localStorage.getItem('ofertaDiaId') || undefined,
            ofertaDiaTexto: localStorage.getItem('ofertaDiaTexto') || undefined,
            ofertaDiaActualizado: localStorage.getItem('ofertaDiaId') ? new Date().toISOString() : undefined,
            activeCountdown: (() => { try { return JSON.parse(localStorage.getItem('activeCountdown')); } catch(e) { return null; } })() || undefined,
            actualizado: new Date().toISOString(),
        };
        Object.keys(cfg).forEach(k => cfg[k] === undefined && delete cfg[k]);
        await subirArchivoAGitHub(user, repo, token, 'config.json', cfg);
    } catch(e) {}
}

function guardarCountdown() {
    const productId = document.getElementById('countdownProductSelect')?.value ||
                      localStorage.getItem('ofertaDiaId') || '';
    const horas = parseInt(document.getElementById('countdownHoras').value) || 0;
    const minutos = parseInt(document.getElementById('countdownMinutos').value) || 0;
    const texto = document.getElementById('countdownTexto').value.trim() || '¡Oferta especial!';

    if (!productId) {
        mostrarNotificacion('⚠️ Selecciona un producto', 'error');
        return;
    }

    const duracionMs = (horas * 3600 + minutos * 60) * 1000;
    if (duracionMs <= 0) {
        mostrarNotificacion('⚠️ Ingresa una duración válida', 'error');
        return;
    }

    const endTime = Date.now() + duracionMs;
    const countdown = { productId, endTime, texto };
    localStorage.setItem('activeCountdown', JSON.stringify(countdown));

    // Sincronizar a Firebase + GitHub config.json
    (async () => {
        try {
            const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
            if (base) await fetch(base + '/configuracion/activeCountdown.json', {
                method: 'PUT', body: JSON.stringify(countdown),
                headers: { 'Content-Type': 'application/json' }
            });
        } catch(e) {}
        _sincronizarConfigGH();
    })();

    const producto = productos.find(p => p.id == productId);
    const nombre = producto ? producto.nombre : 'Producto';

    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = `✅ Countdown activo para: <strong>${escapeHtml(nombre)}</strong>`;

    // Re-render to show timer
    renderizarMasVendidos();
    renderizarProductos();
    iniciarCountdownsActivos();
    if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();

    mostrarNotificacion(`⏱️ Countdown activado para "${nombre}"`);
}

function desactivarCountdown() {
    localStorage.removeItem('activeCountdown');
    if (!countdownIntervals || typeof countdownIntervals !== 'object') countdownIntervals = {};
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};
    if (_flashTimer) { clearInterval(_flashTimer); _flashTimer = null; }
    const flashSec = document.getElementById('ofertaTiempoLimitado');
    if (flashSec) flashSec.style.display = 'none';
    renderizarMasVendidos();
    renderizarProductos();
    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = 'Countdown desactivado.';
    mostrarNotificacion('🗑️ Countdown desactivado');

    // Borrar de Firebase + GitHub config.json
    (async () => {
        try {
            const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
            if (base) await fetch(base + '/configuracion/activeCountdown.json', { method: 'DELETE' });
        } catch(e) {}
        _sincronizarConfigGH();
    })();
}

// ═══════════════════════════════════════════════════════
//  ⚡ OFERTA DEL DÍA (sección del home)
//  Se puebla con el producto configurado en `ofertaDiaId`.
//  Si no hay ninguno, la sección queda oculta. Reusa el
//  countdown activo (activeCountdown) con timer propio.
// ═══════════════════════════════════════════════════════
var _ndDealTimer = null;
function renderOfertaDelDia() {
    const sec = document.getElementById('ofertaDelDia');
    if (!sec) return;

    // Limpiar timer previo siempre (evita duplicados al re-render)
    if (_ndDealTimer) { clearInterval(_ndDealTimer); _ndDealTimer = null; }

    let ofId = null;
    try { ofId = localStorage.getItem('ofertaDiaId'); } catch (e) {}
    const prod = ofId ? productos.find(p => String(p.id) === String(ofId)) : null;

    if (!prod) { sec.style.display = 'none'; return; }

    // Evitar duplicado visual: si hay una "Oferta por tiempo limitado" activa para
    // el mismo producto, no mostramos también la "Oferta del día" (sería dos
    // cuentas regresivas seguidas del mismo producto = se ve como spam).
    try {
        const cd = (typeof getActiveCountdown === 'function') ? getActiveCountdown() : null;
        if (cd && cd.productId && String(cd.productId) === String(ofId)) { sec.style.display = 'none'; return; }
    } catch (e) {}

    let texto = '⚡ Oferta del día';
    try { texto = localStorage.getItem('ofertaDiaTexto') || texto; } catch (e) {}

    // Textos y producto
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
    setTxt('ndDealBadge', texto);
    setTxt('ndDealTitle', prod.nombre);
    setTxt('ndDealSub', prod.descripcion ? String(prod.descripcion).replace(/<[^>]*>/g, '').slice(0, 110) : 'Aprovecha este precio por tiempo limitado.');
    setTxt('ndDealName', prod.nombre);
    setTxt('ndDealPrice', (typeof formatPrecio === 'function') ? formatPrecio(prod.precioActual) : ('$' + prod.precioActual + ' USD'));

    // Imagen real del producto (o emoji por categoría como fallback)
    const card = document.getElementById('nd-deal-card');
    const emojiEl = document.getElementById('ndDealEmoji');
    if (card) {
        const old = card.querySelector('.nd-dpc-img');
        if (old) old.remove();
        if (prod.imagen) {
            const img = document.createElement('img');
            img.className = 'nd-dpc-img';
            img.src = prod.imagen;
            img.alt = prod.nombre;
            img.loading = 'lazy';
            img.onerror = function () { this.remove(); if (emojiEl) emojiEl.style.display = 'block'; };
            card.insertBefore(img, card.firstChild);
            if (emojiEl) emojiEl.style.display = 'none';
        } else {
            if (emojiEl) {
                emojiEl.style.display = 'block';
                emojiEl.textContent = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(prod.categoria) : '⚡';
            }
        }
    }

    // Precio original tachado + % descuento
    const oldEl = document.getElementById('ndDealOld');
    const discEl = document.getElementById('ndDealDisc');
    const hayDesc = prod.precioOriginal > 0 && prod.precioOriginal > prod.precioActual;
    if (oldEl) {
        if (hayDesc) { oldEl.style.display = 'block'; oldEl.textContent = '$' + Number(prod.precioOriginal).toFixed(0) + ' USD'; }
        else oldEl.style.display = 'none';
    }
    if (discEl) {
        if (hayDesc) {
            const pct = Math.round((1 - prod.precioActual / prod.precioOriginal) * 100);
            setTxt('ndDealDiscPct', pct + '%');
            discEl.style.display = 'flex';
        } else discEl.style.display = 'none';
    }

    // Timer: solo si hay countdown activo para este producto
    const timerWrap = document.getElementById('ndDealTimer');
    const cd = (typeof getActiveCountdown === 'function') ? getActiveCountdown() : null;
    if (cd && String(cd.productId) === String(prod.id) && timerWrap) {
        timerWrap.style.display = 'flex';
        const pad = n => String(n).padStart(2, '0');
        const tick = () => {
            const rem = Math.max(0, cd.endTime - Date.now());
            setTxt('nd-deal-h', pad(Math.floor(rem / 3600000)));
            setTxt('nd-deal-m', pad(Math.floor((rem % 3600000) / 60000)));
            setTxt('nd-deal-s', pad(Math.floor((rem % 60000) / 1000)));
            if (rem <= 0 && _ndDealTimer) { clearInterval(_ndDealTimer); _ndDealTimer = null; }
        };
        tick();
        _ndDealTimer = setInterval(tick, 1000);
    } else if (timerWrap) {
        timerWrap.style.display = 'none';
    }

    sec.style.display = 'block';
}

// Abre el detalle del producto de la oferta del día
function abrirOfertaDelDia() {
    let ofId = null;
    try { ofId = localStorage.getItem('ofertaDiaId'); } catch (e) {}
    if (ofId && typeof abrirDetalleProducto === 'function') abrirDetalleProducto(ofId);
}

// ═══════════════════════════════════════════════════════
//  ⏱️ OFERTA POR TIEMPO LIMITADO (sección independiente)
//  Muestra el producto de activeCountdown con su timer.
//  Completamente independiente de ofertaDiaId.
// ═══════════════════════════════════════════════════════
var _flashTimer = null;
function renderOfertaTiempoLimitado() {
    const sec = document.getElementById('ofertaTiempoLimitado');
    if (!sec) return;

    if (_flashTimer) { clearInterval(_flashTimer); _flashTimer = null; }

    const cd = (typeof getActiveCountdown === 'function') ? getActiveCountdown() : null;
    if (!cd || !cd.productId) { sec.style.display = 'none'; return; }

    const prod = productos.find(p => String(p.id) === String(cd.productId));
    if (!prod) { sec.style.display = 'none'; return; }

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setTxt('flashBadge', cd.texto || '⏱️ Oferta por tiempo limitado');
    setTxt('flashTitle', prod.nombre);
    setTxt('flashSub', prod.descripcion ? String(prod.descripcion).replace(/<[^>]*>/g, '').slice(0, 110) : '¡Aprovecha este precio antes de que expire!');
    setTxt('flashName', prod.nombre);
    setTxt('flashPrice', (typeof formatPrecio === 'function') ? formatPrecio(prod.precioActual) : ('$' + prod.precioActual + ' USD'));

    const card = document.getElementById('flash-card');
    const emojiEl = document.getElementById('flashEmoji');
    if (card) {
        const old = card.querySelector('.nd-dpc-img');
        if (old) old.remove();
        if (prod.imagen) {
            const img = document.createElement('img');
            img.className = 'nd-dpc-img';
            img.src = prod.imagen;
            img.alt = escapeHtml(prod.nombre);
            img.loading = 'lazy';
            img.onerror = function () { this.remove(); if (emojiEl) emojiEl.style.display = 'block'; };
            card.insertBefore(img, card.firstChild);
            if (emojiEl) emojiEl.style.display = 'none';
        } else {
            if (emojiEl) {
                emojiEl.style.display = 'block';
                emojiEl.textContent = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(prod.categoria) : '⏱️';
            }
        }
    }

    const oldEl = document.getElementById('flashOld');
    const discEl = document.getElementById('flashDisc');
    const hayDesc = prod.precioOriginal > 0 && prod.precioOriginal > prod.precioActual;
    if (oldEl) {
        if (hayDesc) { oldEl.style.display = 'block'; oldEl.textContent = '$' + Number(prod.precioOriginal).toFixed(0) + ' USD'; }
        else oldEl.style.display = 'none';
    }
    if (discEl) {
        if (hayDesc) {
            const pct = Math.round((1 - prod.precioActual / prod.precioOriginal) * 100);
            setTxt('flashDiscPct', pct + '%');
            discEl.style.display = 'flex';
        } else discEl.style.display = 'none';
    }

    const timerWrap = document.getElementById('flashTimer');
    if (timerWrap) {
        timerWrap.style.display = 'flex';
        const pad = n => String(n).padStart(2, '0');
        const tick = () => {
            const rem = Math.max(0, cd.endTime - Date.now());
            setTxt('flash-h', pad(Math.floor(rem / 3600000)));
            setTxt('flash-m', pad(Math.floor((rem % 3600000) / 60000)));
            setTxt('flash-s', pad(Math.floor((rem % 60000) / 1000)));
            if (rem <= 0) {
                if (_flashTimer) { clearInterval(_flashTimer); _flashTimer = null; }
                sec.style.display = 'none';
            }
        };
        tick();
        _flashTimer = setInterval(tick, 1000);
    }

    sec.style.display = 'block';
}

function abrirProductoFlash() {
    const cd = (typeof getActiveCountdown === 'function') ? getActiveCountdown() : null;
    if (cd && cd.productId && typeof abrirDetalleProducto === 'function') abrirDetalleProducto(cd.productId);
}

// ===== GALERÍA ROTATIVA DEL HERO (tarjeta 3D) con efecto de desintegración =====
var _ndHeroTimer = null;
var _ndHeroIdx = 0;
var _ndHeroProds = [];
var _ndEfectoActivo = false;

// ── Canvas de partículas para el efecto de desintegración ──
function _ndCrearCanvasParticulas() {
    const card = document.getElementById('ndHeroCard3d');
    if (!card) return null;
    let canvas = card.querySelector('.nd-particulas-canvas');
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.className = 'nd-particulas-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;z-index:50;pointer-events:none;border-radius:28px;width:100%;height:100%';
    card.appendChild(canvas);
    canvas.width = card.offsetWidth || 340;
    canvas.height = card.offsetHeight || 440;
    return canvas;
}

function _ndDesintegrarYTransicion(idxSiguiente) {
    const card = document.getElementById('ndHeroCard3d');
    if (!card || _ndEfectoActivo) return;
    _ndEfectoActivo = true;

    const canvas = _ndCrearCanvasParticulas();
    if (!canvas) { _ndEfectoActivo = false; return; }
    const ctx = canvas.getContext('2d');
    canvas.width = card.offsetWidth || 340;
    canvas.height = card.offsetHeight || 440;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    const body = document.getElementById('ndHeroBody');
    const imgWrap = document.getElementById('ndHeroImg');

    // Ocultar contenido real — el canvas toma el relevo visual
    [body, imgWrap].forEach(el => {
        if (!el) return;
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'scale(1)';
        el.style.filter = 'none';
    });

    // ── Fase 1: fragmentos de la tarjeta salen volando hacia afuera ──
    const cols = 9, rows = 12;
    const pw = W / cols, ph = H / rows;
    const paleta = ['#FF6B35','#FF9F43','#E8501E','#C9A96E','#FFFFFF','#FFD4C2','#E8C88A','#2A1F14','#3A2A1A','#FF8C42','#F0C070','#D4845A'];

    const fragmentos = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const sx = col * pw + pw / 2;
            const sy = row * ph + ph / 2;
            const dx = sx - cx;
            const dy = sy - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = 3.5 + Math.random() * 7;
            // delay pequeño: piezas del borde salen un poco antes (efecto desintegración)
            const delay = Math.floor((1 - dist / Math.sqrt(cx*cx + cy*cy)) * 5);
            fragmentos.push({
                x: sx, y: sy,
                vx: (dx / dist) * speed + (Math.random() - 0.5) * 4,
                vy: (dy / dist) * speed * 0.9 + (Math.random() - 0.5) * 3,
                w: pw * 0.85, h: ph * 0.85,
                rot: 0,
                rotSpeed: (Math.random() - 0.5) * 0.18,
                alpha: 1,
                color: paleta[Math.floor(Math.random() * paleta.length)],
                delay, frame: 0
            });
        }
    }

    // Dibujar estado inicial (snapshot de la tarjeta en fragmentos)
    fragmentos.forEach(f => {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.translate(f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
        ctx.restore();
    });

    let frameNum = 0;
    const SCATTER_FRAMES = 36; // ~600ms

    const scatter = () => {
        ctx.clearRect(0, 0, W, H);
        let alguno = false;

        fragmentos.forEach(f => {
            if (frameNum < f.delay) { alguno = true; return; }
            f.x += f.vx;
            f.y += f.vy;
            f.vy += 0.35; // gravedad suave
            f.rot += f.rotSpeed;
            f.alpha -= 0.026;
            if (f.alpha <= 0) return;
            alguno = true;
            ctx.save();
            ctx.globalAlpha = Math.max(0, f.alpha);
            ctx.translate(f.x, f.y);
            ctx.rotate(f.rot);
            ctx.fillStyle = f.color;
            ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
            ctx.restore();
        });

        frameNum++;
        if (alguno && frameNum < SCATTER_FRAMES + 8) {
            requestAnimationFrame(scatter);
        } else {
            ctx.clearRect(0, 0, W, H);
            canvas.remove();
            _mostrarNuevoProductoHero(idxSiguiente, body, imgWrap);
        }
    };

    requestAnimationFrame(scatter);

    // ── Fase 2: preparar nuevo contenido mientras vuelan los fragmentos ──
    const p = _ndHeroProds[idxSiguiente];
    if (p) {
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('ndHeroCat', p.categoria || 'Producto');
        setTxt('ndHeroTitle', p.nombre || '');
        const hayDesc = p.precioOriginal > 0 && p.precioOriginal > p.precioActual;
        setTxt('ndHeroRate', hayDesc
            ? '⚡ Oferta · ' + safeNum(p.stock) + ' disp.'
            : '🔥 Destacado · ' + (safeNum(p.stock) > 0 ? safeNum(p.stock) + ' disponibles' : 'Top ventas'));
        const precioEl = document.getElementById('ndHeroPrice');
        const usdEl = document.getElementById('ndHeroUsd');
        const esMN = (typeof tmMonedaActual === 'function' && tmMonedaActual() === 'MN');
        if (precioEl) {
            if (esMN && typeof getTasaMN === 'function' && getTasaMN() > 0) {
                precioEl.textContent = '$' + Math.round(p.precioActual * getTasaMN()).toLocaleString();
                if (usdEl) usdEl.textContent = 'MN';
            } else {
                precioEl.textContent = '$' + Number(p.precioActual).toFixed(0);
                if (usdEl) usdEl.textContent = 'USD';
            }
        }
        if (imgWrap) {
            const fallback = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(p.categoria) : '📦';
            if (p.imagen) {
                imgWrap.innerHTML = '<img src="' + escapeAttr(p.imagen) + '" alt="' + escapeAttr(p.nombre) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="if(this.parentNode)this.parentNode.textContent=\'' + fallback + '\'">';
            } else {
                imgWrap.textContent = fallback;
            }
        }
    }
}

function _mostrarNuevoProductoHero(idxSiguiente, body, imgWrap) {
    // Entrada con spring: escala desde 0.88 a 1 + fade
    [body, imgWrap].forEach(el => {
        if (!el) return;
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.88)';
        el.style.filter = 'none';
    });
    requestAnimationFrame(() => {
        if (body) {
            body.style.transition = 'transform 0.42s cubic-bezier(.175,.885,.32,1.275), opacity 0.32s ease-out';
            body.style.opacity = '1';
            body.style.transform = 'scale(1)';
        }
        if (imgWrap) {
            imgWrap.style.transition = 'transform 0.42s 0.06s cubic-bezier(.175,.885,.32,1.275), opacity 0.32s 0.06s ease-out';
            imgWrap.style.opacity = '1';
            imgWrap.style.transform = 'scale(1)';
        }
        _ndEfectoActivo = false;
        const dots = document.getElementById('ndHeroDots');
        if (dots) dots.querySelectorAll('.nd-hero-dot').forEach((d, i) => d.classList.toggle('active', i === idxSiguiente));
    });
}

function renderHeroGaleria() {
    const card = document.getElementById('ndHeroCard3d');
    if (!card || typeof productos === 'undefined' || !Array.isArray(productos)) return;

    // Productos: más vendidos con stock; si no hay, los primeros con stock
    const masVendidos = productos.filter(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0);
    const lista = (masVendidos.length > 0 ? masVendidos : productos.filter(p => p.stock > 0)).slice(0, 6);
    _ndHeroProds = lista;

    // Sin productos → deja el contenido estático y un fallback en el botón
    if (lista.length === 0) {
        const btn0 = document.getElementById('ndHeroBtn');
        if (btn0 && typeof contactarWhatsApp === 'function') btn0.onclick = (e) => { e.stopPropagation(); contactarWhatsApp(); };
        return;
    }

    if (_ndHeroTimer) { clearInterval(_ndHeroTimer); _ndHeroTimer = null; }
    _ndHeroIdx = 0;
    _ndEfectoActivo = false;

    // Puntos indicadores
    const dots = document.getElementById('ndHeroDots');
    if (dots) dots.innerHTML = lista.map((_, i) => '<span class="nd-hero-dot' + (i === 0 ? ' active' : '') + '"></span>').join('');

    // Pintar el primer producto directamente (sin desintegración)
    const pintarDirecto = (idx) => {
        const p = lista[idx];
        if (!p) return;
        const body = document.getElementById('ndHeroBody');
        const imgWrap = document.getElementById('ndHeroImg');

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('ndHeroCat', p.categoria || 'Producto');
        setTxt('ndHeroTitle', p.nombre || '');
        const hayDesc = p.precioOriginal > 0 && p.precioOriginal > p.precioActual;
        setTxt('ndHeroRate', hayDesc
            ? '⚡ Oferta · ' + safeNum(p.stock) + ' disp.'
            : '🔥 Destacado · ' + (safeNum(p.stock) > 0 ? safeNum(p.stock) + ' disponibles' : 'Top ventas'));

        const precioEl = document.getElementById('ndHeroPrice');
        const usdEl = document.getElementById('ndHeroUsd');
        const esMN = (typeof tmMonedaActual === 'function' && tmMonedaActual() === 'MN');
        if (precioEl) {
            if (esMN && typeof getTasaMN === 'function' && getTasaMN() > 0) {
                precioEl.textContent = '$' + Math.round(p.precioActual * getTasaMN()).toLocaleString();
                if (usdEl) usdEl.textContent = 'MN';
            } else {
                precioEl.textContent = '$' + Number(p.precioActual).toFixed(0);
                if (usdEl) usdEl.textContent = 'USD';
            }
        }

        if (imgWrap) {
            const fallback = (typeof obtenerIconoCategoria === 'function') ? obtenerIconoCategoria(p.categoria) : '📦';
            if (p.imagen) {
                // El primer producto del hero es el LCP: cárgalo eager + prioridad alta.
                // En la rotación (idx>0) va lazy para no competir por ancho de banda.
                const prio = (idx === 0) ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
                imgWrap.innerHTML = '<img src="' + escapeAttr(p.imagen) + '" alt="' + escapeAttr(p.nombre) + '" ' + prio + ' style="width:100%;height:100%;object-fit:cover" onerror="if(this.parentNode)this.parentNode.textContent=\'' + fallback + '\'">';
            } else {
                imgWrap.textContent = fallback;
            }
        }

        if (body) body.style.opacity = '1';
        if (imgWrap) imgWrap.style.opacity = '1';
        if (dots) dots.querySelectorAll('.nd-hero-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    };

    pintarDirecto(0);

    // Tocar la tarjeta abre el detalle del producto actual
    card.onclick = () => { const p = _ndHeroProds[_ndHeroIdx]; if (p && typeof abrirDetalleProducto === 'function') abrirDetalleProducto(p.id); };
    // role="button" no activa con teclado por sí solo (a diferencia de <button>)
    // — Enter/Espacio deben disparar la misma acción que el click.
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } };
    // Botón "Pedir" → WhatsApp con el producto actual
    const btn = document.getElementById('ndHeroBtn');
    if (btn) btn.onclick = (e) => {
        e.stopPropagation();
        const p = _ndHeroProds[_ndHeroIdx];
        if (p && typeof tmComprar === 'function') tmComprar(e, p.id, p.nombre);
        else if (typeof contactarWhatsApp === 'function') contactarWhatsApp();
    };

    // Auto-rotación cada 4s con efecto de desintegración
    const avanzar = () => {
        if (_ndEfectoActivo) return;
        _ndHeroIdx = (_ndHeroIdx + 1) % lista.length;
        _ndDesintegrarYTransicion(_ndHeroIdx);
    };
    if (lista.length > 1) _ndHeroTimer = setInterval(avanzar, 7000);

    // Pausa al pasar el mouse / tocar
    card.onmouseenter = () => { if (_ndHeroTimer) { clearInterval(_ndHeroTimer); _ndHeroTimer = null; } };
    card.onmouseleave = () => { if (lista.length > 1 && !_ndHeroTimer) _ndHeroTimer = setInterval(avanzar, 7000); };
}

function getActiveCountdown() {
    try {
        const saved = localStorage.getItem('activeCountdown');
        if (!saved) return null;
        const cd = JSON.parse(saved);
        if (cd.endTime <= Date.now()) {
            localStorage.removeItem('activeCountdown');
            return null;
        }
        return cd;
    } catch { return null; }
}

function renderCountdownHtml(productId) {
    const cd = getActiveCountdown();
    if (!cd || String(cd.productId) !== String(productId)) return '';
    
    return `<div class="producto-countdown" id="countdown_${safeNum(productId)}">
        <span class="countdown-label">🔥 ${escapeHtml(cd.texto)}</span>
        <div class="countdown-time">
            <span class="countdown-block" id="cd_h_${safeNum(productId)}">--</span>
            <span class="countdown-sep">:</span>
            <span class="countdown-block" id="cd_m_${safeNum(productId)}">--</span>
            <span class="countdown-sep">:</span>
            <span class="countdown-block" id="cd_s_${safeNum(productId)}">--</span>
        </div>
    </div>`;
}

function iniciarCountdownsActivos() {
    if (!countdownIntervals || typeof countdownIntervals !== 'object') countdownIntervals = {};
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};

    const cd = getActiveCountdown();
    if (!cd) return;

    const pid = cd.productId;
    const tickerFn = () => {
        const remaining = Math.max(0, cd.endTime - Date.now());
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        const pad = n => String(n).padStart(2, '0');

        ['masVendidosGrid', 'productosGrid'].forEach(gridId => {
            const hEl = document.getElementById(`cd_h_${pid}`);
            const mEl = document.getElementById(`cd_m_${pid}`);
            const sEl = document.getElementById(`cd_s_${pid}`);
            if (hEl) hEl.textContent = pad(h);
            if (mEl) mEl.textContent = pad(m);
            if (sEl) sEl.textContent = pad(s);
        });

        if (remaining <= 0) {
            clearInterval(countdownIntervals[pid]);
            localStorage.removeItem('activeCountdown');
        }
    };
    tickerFn();
    countdownIntervals[pid] = setInterval(tickerFn, 1000);
}

function actualizarCountdownProductSelect() {
    const sel = document.getElementById('countdownProductSelect');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Ninguno (desactivar timer) --</option>';
    productos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        sel.appendChild(opt);
    });
    // Preselect active countdown product
    const cd = getActiveCountdown();
    if (cd) sel.value = cd.productId;
    else if (current) sel.value = current;

    // Update status
    const status = document.getElementById('countdownStatus');
    if (status && cd) {
        const producto = productos.find(p => p.id == cd.productId);
        if (producto) status.innerHTML = `✅ Countdown activo para: <strong>${escapeHtml(producto.nombre)}</strong>`;
    }
}

// ===== PWA INSTALL PROMPT — Banner personalizado de instalación =====
(function initPWAInstallPrompt() {
    var deferredPrompt = null;
    var banner = null;
    var installBtn = null;
    var dismissBtn = null;
    var STORAGE_KEY = 'tm_pwa_dismiss';
    var SHOW_DELAY = 3000; // 3 segundos tras carga
    var DISMISS_DAYS = 7;

    function isDismissed() {
        try {
            var ts = localStorage.getItem(STORAGE_KEY);
            if (!ts) return false;
            return (Date.now() - parseInt(ts, 10)) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
        } catch(e) { return false; }
    }

    function markDismissed() {
        try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch(e) {}
    }

    function showBanner() {
        if (!banner) return;
        if (isDismissed()) return;
        banner.classList.add('pwa-show');
    }

    function hideBanner() {
        if (!banner) return;
        banner.classList.remove('pwa-show');
    }

    function init() {
        banner = document.getElementById('pwa-install-banner');
        if (!banner) return;
        installBtn = document.getElementById('pwa-install-btn');
        dismissBtn = document.getElementById('pwa-install-dismiss');

        if (installBtn) {
            installBtn.addEventListener('click', function() {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function(choiceResult) {
                    if (choiceResult.outcome === 'accepted') {
                        if (typeof mostrarNotificacion === 'function') {
                            mostrarNotificacion('¡TiendaMax instalada!', 'success');
                        }
                    }
                    deferredPrompt = null;
                    hideBanner();
                }).catch(function() {
                    deferredPrompt = null;
                    hideBanner();
                });
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function() {
                markDismissed();
                hideBanner();
            });
        }
    }

    // Escuchar beforeinstallprompt
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        // Mostrar banner tras delay (no ser agresivo)
        setTimeout(showBanner, SHOW_DELAY);
    });

    // Tras instalación exitosa, ocultar banner
    window.addEventListener('appinstalled', function() {
        deferredPrompt = null;
        hideBanner();
        if (typeof mostrarNotificacion === 'function') {
            mostrarNotificacion('¡TiendaMax instalada!', 'success');
        }
    });

    // Mostrar banner también cuando hay SW update disponible
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function(event) {
            if (event.data && (event.data.type === 'SW_UPDATED' || event.data.type === 'SW_UPDATE_AVAILABLE')) {
                // Si la app ya está instalada, mostramos aviso de actualización
                // Solo si no estamos ya mostrando el prompt de instalación
                if (!deferredPrompt && !isDismissed()) {
                    if (typeof mostrarNotificacion === 'function') {
                        mostrarNotificacion('Nueva versión disponible. Recarga para actualizar.', 'info');
                    }
                }
            }
        });
    }

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ===== PUSH NOTIFICATION MANAGER — REMOVED (legacy) =====
// This legacy push system used /api/push/subscribe and /api/push/unsubscribe
// endpoints which don't exist on GitHub Pages. It also conflicts with the
// Firebase FCM system in tm-iife.js. Removed to prevent errors and conflicts.

