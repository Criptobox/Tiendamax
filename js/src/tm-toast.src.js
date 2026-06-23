/* ============================================================
   TiendaMax — módulo: tm-toast
   Efectos visuales: cursor, barra progreso, toast glassmorphism,
   placeholder animado búsqueda, fly-to-cart.
   Extraído de tm-extras.src.js (L13-186, 174 líneas)
   ============================================================ */


// ===== CURSOR DORADO ELIMINADO =====
// El cursor custom dorado fue eliminado: ocultaba el cursor del sistema
// cuando algo fallaba y no se veía bien en todos los modos. Ahora se usa
// el cursor nativo del navegador, que siempre funciona.
(function removeOldCursor() {
    // Limpiar el elemento si quedó de una versión anterior cacheada
    const old = document.getElementById('tm-cursor');
    if (old) old.remove();
})();

// ===== BARRA DE PROGRESO DORADA =====
(function initProgress() {
    const bar = document.createElement('div');
    bar.id = 'tm-progress';
    document.body.appendChild(bar);

    function update() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
        bar.style.width = pct + '%';
        bar.style.opacity = pct > 1 ? '1' : '0';
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
})();

// ===== TOAST GLASSMORPHISM — reemplaza mostrarNotificacion =====
(function overrideToast() {
    let toastEl = null;
    let hideTimer = null;

    function getToast() {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'tm-toast';
            document.body.appendChild(toastEl);
        }
        return toastEl;
    }

    window.mostrarNotificacion = function(mensaje, tipo = 'success') {
        const t = getToast();
        clearTimeout(hideTimer);

        // Ícono
        const icon = tipo === 'error' ? '✕' : tipo === 'info' ? 'i' : '✓';
        t.className = 'tm-toast' + (tipo === 'error' ? ' error' : '');
        t.innerHTML = `<span class="tm-toast-icon">${icon}</span><span>${mensaje}</span>`;

        // Forzar reflow para reiniciar animación
        t.classList.remove('show', 'hide');
        t.getBoundingClientRect();
        t.classList.add('show');

        hideTimer = setTimeout(() => {
            t.classList.add('hide');
            setTimeout(() => { if (t) t.classList.remove('show', 'hide'); }, 350);
        }, 3500);
    };
})();

// ===== PLACEHOLDER ANIMADO EN BÚSQUEDA =====
(function initPlaceholder() {
    const frases = [
        'Buscar productos...',
        'WiFi, inversores...',
        'Celulares, cargadores...',
        'Tecnología premium...',
        'Energía solar...'
    ];
    let idx = 0;

    function rotar() {
        const input = document.getElementById('heroSearchInput');
        if (!input || document.activeElement === input || input.value) return;
        idx = (idx + 1) % frases.length;
        // Fade out → cambiar → fade in via style
        input.style.transition = 'opacity 0.4s';
        input.style.opacity = '0';
        setTimeout(() => {
            input.placeholder = frases[idx];
            input.style.opacity = '1';
        }, 400);
    }

    // Esperar a que el DOM esté listo
    function startRotation() {
        const input = document.getElementById('heroSearchInput');
        if (!input) { setTimeout(startRotation, 500); return; }
        setInterval(rotar, 3200);
    }
    setTimeout(startRotation, 2000);
})();




/* ════════════════════════════════════════════════════
   PREMIUM UPGRADE PACK 2 — JS
   Fly-to-cart · Skeleton loading · Analytics counter
═════════════════════════════════════════════════════ */

// ── 1. FLY-TO-CART: partícula que vuela al ícono del carrito ──
function flyToCart(originEl) {
    const cartBtn = document.querySelector('.cart-icon-btn');
    if (!cartBtn || !originEl) return;

    const from = originEl.getBoundingClientRect();
    const to   = cartBtn.getBoundingClientRect();

    const particle = document.createElement('div');
    particle.className = 'fly-particle';
    particle.style.cssText = `
        left: ${from.left + from.width / 2 - 7}px;
        top:  ${from.top  + from.height/ 2 - 7}px;
        opacity: 1;
    `;
    document.body.appendChild(particle);

    // Calcular delta
    const dx = (to.left + to.width / 2 - 7)  - (from.left + from.width  / 2 - 7);
    const dy = (to.top  + to.height/ 2 - 7)  - (from.top  + from.height / 2 - 7);

    // Arc animation usando requestAnimationFrame
    const duration = 650;
    const start = performance.now();

    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        // Ease in-out cubic
        const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
        // Arc: parábola en Y
        const arc = -Math.sin(Math.PI * t) * 90;

        particle.style.transform = `translate(${dx * e}px, ${dy * e + arc}px) scale(${1 - t * 0.4})`;
        particle.style.opacity   = t > 0.7 ? (1 - (t - 0.7) / 0.3) : '1';

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            particle.remove();
            // Bounce del carrito
            cartBtn.classList.remove('bounce');
            cartBtn.getBoundingClientRect(); // reflow
            cartBtn.classList.add('bounce');
            setTimeout(() => cartBtn.classList.remove('bounce'), 560);
        }
    }
    requestAnimationFrame(step);
}

// ── PEDIR POR WHATSAPP: abre WhatsApp directo (NO agrega al carrito) ──
// FIX: Separar "Pedir" (WhatsApp) de "Agregar al carrito".
// El botón "Pedir" solo envía el mensaje a WhatsApp y registra analytics.
// Para agregar al carrito existe el botón "🛒 Añadir" en la tarjeta
// y "🛒 Agregar al carrito" en el modal de detalle.
function tmComprar(event, id, nombre) {
    const btn = (event && (event.currentTarget || event.target)) || null;
    if (btn) requestAnimationFrame(() => flyToCart(btn));
    // 📊 Analytics: registrar click de WhatsApp
    if (typeof tmTrackWhatsApp === 'function') tmTrackWhatsApp(id);
    if (typeof tmRegistrarInteresWhatsApp === 'function') tmRegistrarInteresWhatsApp(id, 'tarjeta');
    // Buscar producto para tener el precio en el mensaje
    const _prod = productos.find(p => p.id === id || p.id === Number(id));
    const item = _prod
        ? { id: _prod.id, nombre: _prod.nombre, precio: parseFloat(_prod.precioActual) || 0, cantidad: 1 }
        : { id: id, nombre: nombre || 'Producto', precio: 0, cantidad: 1 };
    _gaEvent('contact', { method: 'whatsapp_product', item_name: item.nombre, value: item.precio });
    const msg = _mensajeOrdenWA([item]);
    window.open(`https://wa.me/${getNumeroWhatsApp()}?text=${msg}`, '_blank', 'noopener,noreferrer');
}
// Patch agregarAlCarrito para fly desde modal
