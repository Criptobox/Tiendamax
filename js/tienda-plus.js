/* ════════════════════════════════════════════════════════════════════
 *  TIENDAMAX — TIENDA PLUS  (v3)
 *  1) Ordenar + filtrar productos
 *  2) "Avísame cuando vuelva" en productos agotados (WhatsApp)
 *  3) Compartir carrito completo por WhatsApp
 * ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ordenActual = 'relevancia';
    var soloEnStock = false;
    var K_AVISO = 'tm_avisos_wap_v1';

    function $(id) { return document.getElementById(id); }

    function rtdbUrl() {
        try {
            var cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
            if (cfg.databaseURL) return cfg.databaseURL;
            if (cfg.projectId)   return 'https://' + cfg.projectId + '-default-rtdb.firebaseio.com';
        } catch (e) {}
        return null;
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    // ── Registrar en Firebase /lista_espera ───────────────────────────
    async function registrarListaEspera(productoId, productoNombre, tel, nombre) {
        var base = rtdbUrl();
        if (!base) return false;
        try {
            var entradaId = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            var res = await fetch(base + '/lista_espera/' + String(productoId) + '/' + entradaId + '.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tel: tel, nombre: nombre || '', productoId: String(productoId), producto: productoNombre || '', ts: Date.now() })
            });
            return res.ok;
        } catch (e) { return false; }
    }

    // ── Modal "Avísame cuando vuelva" ─────────────────────────────────
    function mostrarModalAviso(id, nombreProducto) {
        var old = document.getElementById('tmAvisoModal');
        if (old) old.remove();
        var m = document.createElement('div');
        m.id = 'tmAvisoModal';
        m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:16px';
        m.innerHTML =
            '<div style="background:#1a1a2e;border-radius:20px 20px 16px 16px;padding:24px 20px 28px;width:100%;max-width:420px;box-shadow:0 -4px 40px rgba(0,0,0,.5)">' +
                '<div style="text-align:center;margin-bottom:16px">' +
                    '<div style="font-size:34px;margin-bottom:6px">🔔</div>' +
                    '<h3 style="font-size:16px;font-weight:800;color:#fff;margin:0 0 6px">¿Te avisamos cuando vuelva?</h3>' +
                    '<p style="font-size:12px;color:#888;margin:0;line-height:1.5">Te mandamos un <b style="color:#25D366">WhatsApp</b> cuando <b style="color:#ccc">' + esc(nombreProducto) + '</b> esté disponible.</p>' +
                '</div>' +
                '<input id="tmAvisoTel" type="tel" placeholder="Tu WhatsApp (ej: 53512345)" autocomplete="tel" ' +
                    'style="width:100%;background:#0d0d1a;border:1.5px solid rgba(255,255,255,.15);border-radius:12px;padding:13px 16px;font-size:14px;color:#fff;margin-bottom:10px;box-sizing:border-box;outline:none">' +
                '<input id="tmAvisoNombre" type="text" placeholder="Tu nombre (opcional)" ' +
                    'style="width:100%;background:#0d0d1a;border:1.5px solid rgba(255,255,255,.12);border-radius:12px;padding:13px 16px;font-size:14px;color:#fff;margin-bottom:14px;box-sizing:border-box;outline:none">' +
                '<button id="tmAvisoEnviar" type="button" ' +
                    'style="width:100%;background:#25D366;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;margin-bottom:10px">' +
                    '✅ Avisarme por WhatsApp</button>' +
                '<button type="button" onclick="document.getElementById(\'tmAvisoModal\').remove()" ' +
                    'style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:11px;font-size:13px;color:#888;cursor:pointer">' +
                    'Cancelar</button>' +
            '</div>';
        document.body.appendChild(m);
        m.addEventListener('click', function(e){ if (e.target === m) m.remove(); });
        var telInput = $('tmAvisoTel');
        if (telInput) setTimeout(function(){ telInput.focus(); }, 100);
        $('tmAvisoEnviar').addEventListener('click', function() {
            var tel = (telInput ? telInput.value : '').trim().replace(/\s+/g,'');
            var nombre = ($('tmAvisoNombre') ? $('tmAvisoNombre').value : '').trim();
            if (!tel || tel.length < 6) {
                if (telInput) { telInput.style.borderColor='#e74c3c'; telInput.focus(); }
                return;
            }
            var btn = $('tmAvisoEnviar');
            btn.disabled = true; btn.textContent = '⏳ Guardando…';
            registrarListaEspera(id, nombreProducto, tel, nombre).then(function(ok) {
                m.remove();
                if (ok) {
                    var arr = avisosGuardados();
                    if (arr.indexOf(String(id)) === -1) arr.push(String(id));
                    guardarAvisos(arr);
                    actualizarBotonesAvisoDOM();
                    if (typeof mostrarNotificacion === 'function')
                        mostrarNotificacion('🔔 ¡Listo! Te avisaremos por WhatsApp cuando vuelva', 'success');
                } else {
                    if (typeof mostrarNotificacion === 'function')
                        mostrarNotificacion('⚠️ No se pudo guardar. Inténtalo de nuevo.', 'error');
                }
            });
        });
    }

    function avisosGuardados() {
        try { return JSON.parse(localStorage.getItem(K_AVISO) || '[]'); } catch(e) { return []; }
    }
    function guardarAvisos(arr) {
        try { localStorage.setItem(K_AVISO, JSON.stringify(arr)); } catch(e) {}
    }
    function botonAvisoHTML(id) {
        var pedido = avisosGuardados().indexOf(String(id)) !== -1;
        return '<button class="tmplus-aviso-btn' + (pedido ? ' pedido' : '') + '" data-aviso-id="' + id + '" type="button">' +
               (pedido ? '🔔 Te avisaremos' : '🔔 Avísame cuando vuelva') + '</button>';
    }
    function actualizarBotonesAvisoDOM() {
        var arr = avisosGuardados();
        document.querySelectorAll('.tmplus-aviso-btn').forEach(function(btn) {
            var pedido = arr.indexOf(btn.getAttribute('data-aviso-id')) !== -1;
            btn.classList.toggle('pedido', pedido);
            btn.textContent = pedido ? '🔔 Te avisaremos' : '🔔 Avísame cuando vuelva';
        });
    }

    // ════════════════════════════════════════════════════════════════
    //  1) BARRA DE ORDEN Y FILTRO
    // ════════════════════════════════════════════════════════════════
    function construirBarra() {
        if ($('tmPlusBar')) return;
        var grid = $('productosGrid');
        if (!grid) return;
        var bar = document.createElement('div');
        bar.id = 'tmPlusBar'; bar.className = 'tmplus-bar';
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
            '<label class="tmplus-check" for="tmSoloStock">' +
                '<span class="tmplus-toggle-wrap">' +
                    '<input type="checkbox" id="tmSoloStock" class="tmplus-toggle-input">' +
                    '<span class="tmplus-toggle-thumb"></span>' +
                '</span>' +
                ' Solo disponibles' +
            '</label>';
        grid.parentNode.insertBefore(bar, grid);
        $('tmOrden').addEventListener('change', function() {
            ordenActual = this.value;
            if (typeof renderizarProductos === 'function') renderizarProductos();
        });
        $('tmSoloStock').addEventListener('change', function() {
            soloEnStock = this.checked;
            if (typeof renderizarProductos === 'function') renderizarProductos();
        });
    }

    function aplicarOrdenYFiltro() {
        var grid = $('productosGrid');
        if (!grid) return;
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.producto-card'));
        if (!cards.length) return;
        cards.forEach(function(card) {
            card.style.display = (soloEnStock && card.classList.contains('card-agotado')) ? 'none' : '';
        });
        var visibles = cards.filter(function(c){ return c.style.display !== 'none'; });
        function precioDeCard(c) { var el=c.querySelector('.precio-actual'); var v=el?parseFloat(el.getAttribute('data-usd')):NaN; return isFinite(v)?v:0; }
        if (ordenActual==='precio-asc') visibles.sort(function(a,b){ return precioDeCard(a)-precioDeCard(b); });
        else if (ordenActual==='precio-desc') visibles.sort(function(a,b){ return precioDeCard(b)-precioDeCard(a); });
        else if (ordenActual==='vendidos') visibles.sort(function(a,b){ return (!!b.querySelector('.badge-vendido'))-(!!a.querySelector('.badge-vendido')); });
        if (ordenActual!=='relevancia'&&ordenActual!=='nuevos') visibles.forEach(function(card){ grid.appendChild(card); });
    }

    // ════════════════════════════════════════════════════════════════
    //  2) INYECTAR BOTÓN "AVÍSAME" EN CARDS AGOTADAS
    // ════════════════════════════════════════════════════════════════
    function postProcesarCards() {
        var grid = $('productosGrid');
        if (!grid) return;
        grid.querySelectorAll('.producto-card').forEach(function(card) {
            if (!card.classList.contains('card-agotado')) return;
            var corazon = card.querySelector('[data-like-id]');
            var id = corazon ? corazon.getAttribute('data-like-id') : null;
            if (!id || card.querySelector('.tmplus-aviso-btn')) return;
            var nombreEl = card.querySelector('.producto-nombre, h3, .card-title, b');
            var nombre = nombreEl ? nombreEl.textContent.trim().slice(0,60) : 'este producto';
            var wrap = document.createElement('div');
            wrap.className = 'tmplus-aviso-wrap';
            wrap.innerHTML = botonAvisoHTML(id);
            card.appendChild(wrap);
            wrap.querySelector('.tmplus-aviso-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                if (avisosGuardados().indexOf(String(id)) !== -1) return;
                mostrarModalAviso(id, nombre);
            });
        });
        actualizarBotonesAvisoDOM();
        aplicarOrdenYFiltro();
    }

    // ════════════════════════════════════════════════════════════════
    //  3) COMPARTIR CARRITO POR WHATSAPP
    // ════════════════════════════════════════════════════════════════
    function compartirCarritoWA() {
        var items = (typeof carrito !== 'undefined' && Array.isArray(carrito)) ? carrito : [];
        if (!items.length) { if (typeof mostrarNotificacion==='function') mostrarNotificacion('Tu carrito está vacío','info'); return; }
        var texto = typeof _mensajeOrdenWA === 'function'
            ? decodeURIComponent(_mensajeOrdenWA(items))
            : '🛒 Mi carrito en TiendaMax:\n' + items.map(function(i){ return '• '+i.nombre+' x'+(i.cantidad||1); }).join('\n');
        window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
    }

    function inyectarBotonCompartirCarrito() {
        var cont = $('carritoFooter') || $('carritoDrawer');
        if (!cont || cont.querySelector('.tmplus-share-cart')) return;
        var comprarBtn = cont.querySelector('[data-action="comprarCarrito"], .carrito-btn-comprar');
        var btn = document.createElement('button');
        btn.className='tmplus-share-cart'; btn.type='button';
        btn.innerHTML='🔗 Compartir carrito'; btn.onclick=compartirCarritoWA;
        if (comprarBtn&&comprarBtn.parentNode) comprarBtn.parentNode.insertBefore(btn, comprarBtn.nextSibling);
        else cont.appendChild(btn);
    }

    function engancharRender() {
        if (typeof renderizarProductos !== 'function') return false;
        var prev = renderizarProductos;
        renderizarProductos = function() { prev.apply(this, arguments); setTimeout(postProcesarCards, 0); };
        return true;
    }

    // ════════════════════════════════════════════════════════════════
    //  ACCESIBILIDAD — tarjetas de producto operables por teclado
    //  Render-agnóstico: etiqueta cualquier .producto-card / .rel-card
    //  (grid, más vendidos, relacionados) sin tocar el render minificado.
    // ════════════════════════════════════════════════════════════════
    function inicializarA11yTarjetas() {
        var SEL = '.producto-card, .rel-card';

        function etiquetar(card) {
            if (card.getAttribute('data-a11y') === '1') return;
            card.setAttribute('data-a11y', '1');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            if (!card.getAttribute('aria-label')) {
                var t = card.querySelector('h3, .producto-nombre, .rel-card-name, .card-title');
                var nombre = t ? t.textContent.trim().slice(0, 80) : 'producto';
                card.setAttribute('aria-label', nombre + ' — ver detalles');
            }
        }
        function etiquetarTodo(root) {
            try { (root || document).querySelectorAll(SEL).forEach(etiquetar); } catch (e) {}
        }

        // Enter / Espacio activan la tarjeta SOLO cuando ella misma tiene el
        // foco (no robamos la tecla a los botones internos: Pedir, ❤️).
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            var card = e.target.closest && e.target.closest(SEL);
            if (!card || e.target !== card) return;
            e.preventDefault();
            card.click();
        }, false);

        // Etiqueta lo que ya exista y lo que se renderice después.
        etiquetarTodo(document);
        try {
            new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var added = muts[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var n = added[j];
                        if (!n || n.nodeType !== 1) continue;
                        if (n.matches && n.matches(SEL)) etiquetar(n);
                        else if (n.querySelector && n.querySelector(SEL)) etiquetarTodo(n);
                    }
                }
            }).observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    function init() {
        construirBarra();
        inicializarA11yTarjetas();
        if (!engancharRender()) {
            var tries=0, iv=setInterval(function(){
                tries++;
                if (engancharRender()||tries>40){ clearInterval(iv); if(typeof renderizarProductos==='function') renderizarProductos(); }
            }, 100);
        } else {
            if (typeof renderizarProductos==='function') renderizarProductos();
        }
        document.addEventListener('click', function(e){
            if (e.target.closest('[data-action="abrirCarrito"],[onclick*="abrirCarrito"]')) setTimeout(inyectarBotonCompartirCarrito,120);
        });
        window.tmCompartirCarrito = compartirCarritoWA;
    }

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
