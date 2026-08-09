/* ============================================================
   TiendaMax — módulo: tm-init
   Lógica persuasión, inicialización, automatización Selenium, countdown timer, galería hero
   Extraído de script.src.js (L4283–L5074, 792 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== LÓGICA DE PERSUASIÓN Y VENTAS =====

function verificarOfertasYMostrarBanner() {
    // El banner lo pinta window.tmBannerOfertas, definido en el <script> en
    // línea de index.html. Aquí había una SEGUNDA implementación completa del
    // mismo banner: las dos leían ofertaDiaId y pintaban cosas distintas, así
    // que al cargar el bundle el banner se redibujaba con otro aspecto. Se
    // deja una sola, y esta función queda como el punto por el que el resto
    // del sitio lo refresca.
    if (typeof window.tmBannerOfertas === 'function') { window.tmBannerOfertas(); return; }
    // Sin ella (una página que no sea el inicio) no hay nada que pintar.
    const banner = document.getElementById('urgenciaBanner');
    if (!banner) return;
    banner.style.setProperty('display', 'none', 'important');
    banner.onclick = null;
    if (document.body) document.body.classList.add('tm-no-oferta-banner');
    if (typeof actualizarOffsetsUI === 'function') setTimeout(actualizarOffsetsUI, 0);
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
    // Tres, que es lo que caben en la fila de destacados: con dos, la fila
    // quedaba a medias. Y si el esqueleto ya está puesto no se vuelve a
    // escribir: esta función se llama varias veces durante el arranque y cada
    // reescritura reiniciaba el brillo desde cero.
    if (mv && !mv.querySelector('.producto-card') && !mv.querySelector('.tm-sk-card')) {
        mv.innerHTML = Array(3).fill(sk).join('');
    }
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

    // Solo a GitHub. La regla de configuracion es .write false, asi que el PUT
    // a Firebase que habia aqui devolvia 403 siempre y se lo tragaba el catch:
    // el countdown viaja por config.json, que es lo que leen los clientes.
    _sincronizarConfigGH();

    const producto = productos.find(p => p.id == productId);
    const nombre = producto ? producto.nombre : 'Producto';

    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = `✅ Countdown activo para: <strong>${escapeHtml(nombre)}</strong>`;

    // Re-render to show timer
    renderizarMasVendidos();
    renderizarProductos();
    iniciarCountdownsActivos();
    if (typeof renderOfertaTiempoLimitado === 'function') renderOfertaTiempoLimitado();
    if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();

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
    if (typeof renderOfertaDelDia === 'function') renderOfertaDelDia();
    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = 'Countdown desactivado.';
    mostrarNotificacion('🗑️ Countdown desactivado');

    // Igual que al activarlo: el DELETE a Firebase daba 403 siempre.
    _sincronizarConfigGH();
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
        // El header usa position:fixed con un top calculado a partir de
        // --tm-pwa-h (ver actualizarOffsetsUI) para no quedar tapado por
        // este banner — hay que remedirlo cada vez que aparece/desaparece.
        if (typeof actualizarOffsetsUI === 'function') actualizarOffsetsUI();
    }

    function hideBanner() {
        if (!banner) return;
        banner.classList.remove('pwa-show');
        if (typeof actualizarOffsetsUI === 'function') actualizarOffsetsUI();
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

