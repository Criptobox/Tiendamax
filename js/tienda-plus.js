/* ════════════════════════════════════════════════════════════════════
 *  TIENDAMAX — TIENDA PLUS  (v2)
 *  Funciones nuevas, sin tocar script.js:
 *    1) Ordenar + filtrar productos (precio, stock, nuevos, más vendidos)
 *    2) "Avísame cuando vuelva" en productos agotados
 *    3) Compartir carrito completo por WhatsApp
 *
 *  Cargar SIEMPRE después de script.js y event-delegation.js.
 *  Se apoya en funciones globales ya existentes: renderizarProductos,
 *  productos, formatPrecio, mostrarNotificacion, carrito, _mensajeOrdenWA.
 * ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    // ── Estado del módulo ──────────────────────────────────────────────
    var ordenActual = 'relevancia';   // relevancia | precio-asc | precio-desc | nuevos | vendidos
    var soloEnStock = false;

    var K_AVISO = 'tm_avisos_stock_v1';   // ids con "avísame cuando vuelva"

    // ── Helpers ────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }

    // URL de la Realtime Database (mismo patrón que analytics.js)
    function rtdbUrl() {
        try {
            var cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
            if (cfg.databaseURL) return cfg.databaseURL;
            if (cfg.projectId)   return 'https://' + cfg.projectId + '-default-rtdb.firebaseio.com';
        } catch (e) {}
        return null;
    }

    // Registra el interés del cliente en Firebase:
    //  - avisos_stock/{productId}/{tokenId} → token (privado, lo lee solo el servidor)
    //  - avisos_count/{productId}           → contador público (lo lee el admin)
    // Devuelve true si se registró, false si no se pudo (sin token, etc.)
    async function registrarInteresEnServidor(productId) {
        var base = rtdbUrl();
        var token = localStorage.getItem('fcmToken');
        if (!base || !token) return false;   // sin token no hay a quién notificar
        try {
            var tokenId = btoa(token).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            var url = base + '/avisos_stock/' + String(productId) + '/' + tokenId + '.json';
            // Comprobar si este token ya estaba registrado (para no inflar el contador)
            var yaEstaba = false;
            try {
                var prev = await fetch(url);
                if (prev.ok) { var pj = await prev.json(); yaEstaba = !!pj; }
            } catch (e) {}

            var put = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, timestamp: Date.now() })
            });
            if (!put.ok) return false;   // reglas bloquearon la escritura

            // Incrementar contador público solo si es un interesado nuevo
            if (!yaEstaba) {
                var cUrl = base + '/avisos_count/' + String(productId) + '/count.json';
                var actual = 0;
                try {
                    var rc = await fetch(cUrl);
                    if (rc.ok) { var v = await rc.json(); actual = (typeof v === 'number') ? v : 0; }
                } catch (e) {}
                await fetch(cUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(actual + 1)
                });
            }
            return true;
        } catch (e) {
            console.warn('[avisame] no se pudo registrar interés:', e);
            return false;
        }
    }

    function fmt(usd) {
        return (typeof formatPrecio === 'function')
            ? formatPrecio(usd)
            : ('$' + Number(usd).toFixed(2) + ' USD');
    }

    // ════════════════════════════════════════════════════════════════
    //  1) BARRA DE ORDEN Y FILTRO
    // ════════════════════════════════════════════════════════════════

    function construirBarra() {
        if ($('tmPlusBar')) return;
        var grid = $('productosGrid');
        if (!grid) return;

        var bar = document.createElement('div');
        bar.id = 'tmPlusBar';
        bar.className = 'tmplus-bar';
        bar.innerHTML =
            '<div class="tmplus-orden">' +
                '<label class="tmplus-label" for="tmOrden">Ordenar:</label>' +
                '<select id="tmOrden" class="tmplus-select">' +
                    '<option value="relevancia">Relevancia</option>' +
                    '<option value="precio-asc">Precio: menor a mayor</option>' +
                    '<option value="precio-desc">Precio: mayor a menor</option>' +
                    '<option value="nuevos">Más nuevos</option>' +
                    '<option value="vendidos">Más vendidos</option>' +
                '</select>' +
            '</div>' +
            '<label class="tmplus-check">' +
                '<input type="checkbox" id="tmSoloStock"> Solo disponibles' +
            '</label>';

        grid.parentNode.insertBefore(bar, grid);

        $('tmOrden').addEventListener('change', function () {
            ordenActual = this.value;
            if (typeof renderizarProductos === 'function') renderizarProductos();
        });
        $('tmSoloStock').addEventListener('change', function () {
            soloEnStock = this.checked;
            if (typeof renderizarProductos === 'function') renderizarProductos();
        });
    }

    // Aplica orden y filtro sobre las cards YA renderizadas (no toca el array global).
    function aplicarOrdenYFiltro() {
        var grid = $('productosGrid');
        if (!grid) return;

        var cards = Array.prototype.slice.call(grid.querySelectorAll('.producto-card'));
        if (cards.length === 0) return;

        // 1) Filtro: solo en stock
        cards.forEach(function (card) {
            var agotado = card.classList.contains('card-agotado');
            card.style.display = (soloEnStock && agotado) ? 'none' : '';
        });

        // 2) Orden
        var visibles = cards.filter(function (c) { return c.style.display !== 'none'; });

        function precioDeCard(card) {
            var el = card.querySelector('.precio-actual');
            var v = el ? parseFloat(el.getAttribute('data-usd')) : NaN;
            return isFinite(v) ? v : 0;
        }
        function esVendido(card) {
            return !!card.querySelector('.badge-vendido');
        }

        if (ordenActual === 'precio-asc') {
            visibles.sort(function (a, b) { return precioDeCard(a) - precioDeCard(b); });
        } else if (ordenActual === 'precio-desc') {
            visibles.sort(function (a, b) { return precioDeCard(b) - precioDeCard(a); });
        } else if (ordenActual === 'vendidos') {
            visibles.sort(function (a, b) { return (esVendido(b) ? 1 : 0) - (esVendido(a) ? 1 : 0); });
        }
        // 'nuevos' y 'relevancia' conservan el orden de render original.

        if (ordenActual !== 'relevancia' && ordenActual !== 'nuevos') {
            visibles.forEach(function (card) { grid.appendChild(card); });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  2) "AVÍSAME CUANDO VUELVA"  (productos agotados)
    // ════════════════════════════════════════════════════════════════

    function avisosGuardados() {
        try { return JSON.parse(localStorage.getItem(K_AVISO) || '[]'); }
        catch (e) { return []; }
    }
    function guardarAvisos(arr) {
        try { localStorage.setItem(K_AVISO, JSON.stringify(arr)); } catch (e) {}
    }

    function botonAvisoHTML(id) {
        var pedido = avisosGuardados().indexOf(String(id)) !== -1;
        return '<button class="tmplus-aviso-btn' + (pedido ? ' pedido' : '') + '" ' +
               'data-aviso-id="' + id + '" type="button" ' +
               'onclick="event.stopPropagation();">' +
               (pedido ? '🔔 Te avisaremos' : '🔔 Avísame cuando vuelva') + '</button>';
    }

    async function pedirAviso(id) {
        id = String(id);
        var arr = avisosGuardados();
        if (arr.indexOf(id) !== -1) return;

        var notifApi = (typeof Notification !== 'undefined');

        // 1) Pedir permiso si está en "default" (aún no decidido)
        if (notifApi && Notification.permission === 'default') {
            try { await Notification.requestPermission(); } catch (e) {}
        }

        // 2) Si las notificaciones están bloqueadas/denegadas → no podemos avisar.
        //    No marcamos el botón como hecho; guiamos al cliente a activarlas.
        if (!notifApi || Notification.permission !== 'granted') {
            if (typeof mostrarNotificacion === 'function') {
                mostrarNotificacion('🔔 Activa las notificaciones para que podamos avisarte cuando vuelva', 'info');
            }
            return;
        }

        // 3) Obtener/registrar el token FCM
        if (typeof tmRegistrarTokenFCMSiPermitido === 'function') {
            try { await tmRegistrarTokenFCMSiPermitido(); } catch (e) {}
        }
        if (!localStorage.getItem('fcmToken')) {
            if (typeof mostrarNotificacion === 'function') {
                mostrarNotificacion('No pudimos activar el aviso. Inténtalo de nuevo en un momento.', 'info');
            }
            return;
        }

        // 4) Registrar el interés en el servidor (push dirigido)
        var ok = await registrarInteresEnServidor(id);
        if (!ok) {
            if (typeof mostrarNotificacion === 'function') {
                mostrarNotificacion('No pudimos guardar el aviso. Inténtalo de nuevo.', 'info');
            }
            return;
        }

        // 5) Éxito real: ahora sí marcamos el botón y confirmamos
        arr.push(id);
        guardarAvisos(arr);
        actualizarBotonesAvisoDOM();
        if (typeof mostrarNotificacion === 'function') {
            mostrarNotificacion('🔔 Te avisaremos cuando vuelva al stock', 'success');
        }
    }

    function actualizarBotonesAvisoDOM() {
        var arr = avisosGuardados();
        document.querySelectorAll('.tmplus-aviso-btn').forEach(function (btn) {
            var pedido = arr.indexOf(btn.getAttribute('data-aviso-id')) !== -1;
            btn.classList.toggle('pedido', pedido);
            btn.textContent = pedido ? '🔔 Te avisaremos' : '🔔 Avísame cuando vuelva';
        });
    }

    // ════════════════════════════════════════════════════════════════
    //  3) COMPARTIR CARRITO COMPLETO POR WHATSAPP
    // ════════════════════════════════════════════════════════════════

    function compartirCarritoWA() {
        var items = (typeof carrito !== 'undefined' && Array.isArray(carrito)) ? carrito : [];
        if (items.length === 0) {
            if (typeof mostrarNotificacion === 'function')
                mostrarNotificacion('Tu carrito está vacío', 'info');
            return;
        }
        var texto;
        if (typeof _mensajeOrdenWA === 'function') {
            texto = decodeURIComponent(_mensajeOrdenWA(items));
        } else {
            texto = '🛒 Mi carrito en TiendaMax:\n' +
                items.map(function (i) { return '• ' + i.nombre + ' x' + (i.cantidad || 1); }).join('\n');
        }
        var url = 'https://wa.me/?text=' + encodeURIComponent(texto);
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function inyectarBotonCompartirCarrito() {
        var cont = $('carritoFooter') || $('carritoDrawer');
        if (!cont) return;
        if (cont.querySelector('.tmplus-share-cart')) return;

        var comprarBtn = cont.querySelector('[data-action="comprarCarrito"], .carrito-btn-comprar');
        var btn = document.createElement('button');
        btn.className = 'tmplus-share-cart';
        btn.type = 'button';
        btn.innerHTML = '🔗 Compartir carrito';
        btn.onclick = compartirCarritoWA;

        if (comprarBtn && comprarBtn.parentNode) {
            comprarBtn.parentNode.insertBefore(btn, comprarBtn.nextSibling);
        } else {
            cont.appendChild(btn);
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  POST-PROCESO: inyectar botón "avísame" en cards agotadas
    // ════════════════════════════════════════════════════════════════

    function postProcesarCards() {
        var grid = $('productosGrid');
        if (!grid) return;

        grid.querySelectorAll('.producto-card').forEach(function (card) {
            var agotado = card.classList.contains('card-agotado');
            if (!agotado) return;

            // Identificar el producto por data-like-id del corazón
            var id = null;
            var corazon = card.querySelector('[data-like-id]');
            if (corazon) id = corazon.getAttribute('data-like-id');
            if (!id) return;

            if (!card.querySelector('.tmplus-aviso-btn')) {
                var av = document.createElement('div');
                av.className = 'tmplus-aviso-wrap';
                av.innerHTML = botonAvisoHTML(id);
                card.appendChild(av);
                av.querySelector('.tmplus-aviso-btn').addEventListener('click', function (e) {
                    e.stopPropagation();
                    pedirAviso(id);
                });
            }
        });

        actualizarBotonesAvisoDOM();
        aplicarOrdenYFiltro();
    }

    // ════════════════════════════════════════════════════════════════
    //  ENGANCHE: envolver renderizarProductos sin romper la cadena
    // ════════════════════════════════════════════════════════════════

    function engancharRender() {
        if (typeof renderizarProductos !== 'function') return false;
        var prev = renderizarProductos;
        renderizarProductos = function () {
            prev.apply(this, arguments);
            setTimeout(postProcesarCards, 0);
        };
        return true;
    }

    // ── Arranque ───────────────────────────────────────────────────────
    function init() {
        construirBarra();
        if (!engancharRender()) {
            var tries = 0;
            var iv = setInterval(function () {
                tries++;
                if (engancharRender() || tries > 40) {
                    clearInterval(iv);
                    if (typeof renderizarProductos === 'function') renderizarProductos();
                }
            }, 100);
        } else {
            if (typeof renderizarProductos === 'function') renderizarProductos();
        }

        document.addEventListener('click', function (e) {
            var t = e.target.closest('[data-action="abrirCarrito"], [onclick*="abrirCarrito"]');
            if (t) setTimeout(inyectarBotonCompartirCarrito, 120);
        });

        window.tmCompartirCarrito = compartirCarritoWA;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
