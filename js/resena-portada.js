/* ============================================================
 * resena-portada.js — «⭐ Deja tu reseña» desde la portada.
 *
 * Antes la sección de reseñas solo decía «deja tu reseña en cualquier
 * producto»: sin botón, y escondida hasta que Firebase contestaba. Aquí hay un
 * botón siempre visible (HTML estático, no depende de que cargue nada) que abre
 * un selector con búsqueda; elegir un producto lleva a resena.html?p=<id>, la
 * página ligera que YA existe (estrellas grandes, frases de un toque, escribe en
 * /resenas con la misma regla y la misma marca de «compra verificada»). No hay
 * aquí lógica de escritura: duplicarla sería tener dos reglas que se separan.
 *
 * Por qué resena.html y no el formulario de la ficha: ese formulario vive en el
 * bundle (~570 KB en 3G) y obliga a abrir la ficha y bajar hasta el final;
 * resena.html pesa 12 KB y no necesita catálogo.
 *
 * Es un script SUELTO y escrito en ES5 a propósito: si el bundle no se ejecuta
 * (navegador viejo, localStorage bloqueado, red mala) el botón sigue ahí y
 * funciona. La lista de productos sale, por este orden, de la variable
 * `productos` del bundle (ya sin lo apagado), de localStorage y, si no hay
 * nada, de productos-lite.json; todo con try/catch y con un mensaje claro si
 * ninguna fuente contesta. Sin APIs modernas: ni closest, ni Promise, ni
 * AbortController, ni IntersectionObserver.
 * ============================================================ */
(function () {
    'use strict';

    var MAX = 30;           // filas pintadas a la vez: ligero en 3G y en móviles viejos
    var ESPERA_MS = 8000;
    var abierto = null;     // { caja, input, lista, estado, previo }
    var cache = null;       // lista ya preparada para esta visita

    function porId(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function parse(txt) { try { return JSON.parse(txt); } catch (e) { return null; } }
    function norm(s) {
        s = String(s == null ? '' : s).toLowerCase();
        try { if (s.normalize) s = s.normalize('NFD'); } catch (e) {}
        return s.replace(/[̀-ͯ]/g, '');
    }
    function ancestro(el, sel) {   // closest() a mano: el nodo puede ser de texto o no existir
        while (el && el !== document) {
            if (el.nodeType === 1) {
                if (sel === 'btn' && el.getAttribute && el.getAttribute('data-tm-resena') !== null) return el;
            }
            el = el.parentNode;
        }
        return null;
    }

    /* ── qué productos se pueden haber comprado = los que la tienda enseña ── */
    function apagadasIndice(estado) {
        var cats = {}, subs = {}, a = estado || {}, c, s;
        var ac = a.categorias || {}, as = a.subcategorias || {};
        for (c in ac) { if (ac[c] && ac[c].off) cats[norm(c).toUpperCase()] = 1; }
        for (c in as) {
            for (s in (as[c] || {})) { if (as[c][s] && as[c][s].off) subs[norm(c).toUpperCase() + '|' + norm(s).toUpperCase()] = 1; }
        }
        return { cats: cats, subs: subs };
    }
    function digitalOculto(p) {
        if (!p || !p.digital) return false;
        if (p.activo === false) return true;
        var im = p.importes, i;
        if (!im || !im.length) return true;
        for (i = 0; i < im.length; i++) { if (im[i] && im[i].on !== false && Number(im[i].usdt) > 0) return false; }
        return true;
    }
    function preparar(arr, estadoApagadas) {
        var ix = apagadasIndice(estadoApagadas), out = [], i, p, cat, sub;
        for (i = 0; i < (arr || []).length; i++) {
            p = arr[i];
            if (!p || !p.id || !p.nombre) continue;
            cat = norm(p.categoria).toUpperCase(); sub = norm(p.subcategoria).toUpperCase();
            if (ix.cats[cat] || ix.subs[cat + '|' + sub]) continue;
            if (digitalOculto(p)) continue;
            out.push({
                id: String(p.id), nombre: String(p.nombre), clave: norm(p.nombre + ' ' + (p.categoria || '')),
                img: p.imagen ? String(p.imagen) : '', hay: Number(p.stock) > 0 || !!p.digital, orden: i
            });
        }
        out.sort(function (a, b) { return (b.hay - a.hay) || (a.orden - b.orden); });
        return out;
    }

    function pedirJSON(url, cb) {
        var hecho = false, t;
        function fin(v) { if (hecho) return; hecho = true; clearTimeout(t); cb(v); }
        t = setTimeout(function () { fin(null); }, ESPERA_MS);
        try {
            var x = new XMLHttpRequest();
            x.open('GET', url, true);
            x.onreadystatechange = function () {
                if (x.readyState !== 4) return;
                fin(x.status >= 200 && x.status < 300 ? parse(x.responseText) : null);
            };
            x.onerror = function () { fin(null); };
            x.send();
        } catch (e) { fin(null); }
    }

    function obtenerLista(cb) {
        if (cache && cache.length) return cb(cache);
        var vivo = null, estado = parse(lsGet('tm_cat_apagadas'));
        // 1) lo que el bundle ya tiene en memoria (sin lo apagado)
        try { if (typeof productos !== 'undefined' && productos && productos.length) vivo = productos; } catch (e) {}
        if (vivo) { cache = preparar(vivo, null); if (cache.length) return cb(cache); }
        // 2) la copia de localStorage (guarda la lista entera: se filtra aquí)
        var ls = parse(lsGet('productos'));
        if (ls && ls.length) { cache = preparar(ls, estado); if (cache.length) return cb(cache); }
        // 3) la red: el catálogo ligero y, de paso, lo apagado
        pedirJSON('productos-lite.json', function (lista) {
            if (!lista || !lista.length) return cb(null);
            pedirJSON('categorias.json', function (cats) {
                var ap = (cats && cats.apagadas) || estado;
                cache = preparar(lista, ap);
                cb(cache.length ? cache : null);
            });
        });
    }

    /* ── el selector ── */
    function filtrar(lista, q) {
        var palabras = norm(q).split(/\s+/).filter(function (w) { return w; });
        if (!palabras.length) return lista;
        return lista.filter(function (p) {
            for (var i = 0; i < palabras.length; i++) { if (p.clave.indexOf(palabras[i]) < 0) return false; }
            return true;
        });
    }
    function pintar(lista, q) {
        if (!abierto) return;
        var res = filtrar(lista, q), muestra = res.slice(0, MAX), html = '', i, p;
        for (i = 0; i < muestra.length; i++) {
            p = muestra[i];
            html += '<li><a class="tmrs-fila" href="resena.html?p=' + encodeURIComponent(p.id) + '">' +
                (p.img ? '<img src="' + esc(p.img) + '" alt="" width="44" height="44" loading="lazy" decoding="async">' : '<span class="tmrs-sinfoto" aria-hidden="true"></span>') +
                '<span class="tmrs-nom">' + esc(p.nombre) + '</span>' +
                '<span class="tmrs-ir" aria-hidden="true">›</span></a></li>';
        }
        abierto.lista.innerHTML = html;
        abierto.estado.textContent = !res.length
            ? 'No encontré «' + q + '». Prueba con otra palabra.'
            : (res.length > MAX ? 'Mostrando ' + MAX + ' de ' + res.length + '. Escribe para afinar.'
                : res.length + (res.length === 1 ? ' producto' : ' productos'));
    }

    function cerrar() {
        if (!abierto) return;
        var a = abierto; abierto = null;
        try { document.removeEventListener('keydown', teclas, true); } catch (e) {}
        if (a.caja.parentNode) a.caja.parentNode.removeChild(a.caja);
        try { document.documentElement.className = document.documentElement.className.replace(/\s*tmrs-abierto/, ''); } catch (e) {}
        try { if (a.previo && a.previo.focus) a.previo.focus(); } catch (e) {}
    }
    function teclas(e) {
        if (!abierto) return;
        var k = e.key || e.keyCode;
        if (k === 'Escape' || k === 'Esc' || k === 27) { e.preventDefault(); cerrar(); return; }
        if (k !== 'Tab' && k !== 9) return;
        // el foco no sale del cuadro mientras está abierto
        var f = abierto.caja.querySelectorAll('input, a[href], button'), n = f.length;
        if (!n) return;
        var primero = f[0], ultimo = f[n - 1], act = document.activeElement;
        if (e.shiftKey && (act === primero || !abierto.caja.contains(act))) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && (act === ultimo || !abierto.caja.contains(act))) { e.preventDefault(); primero.focus(); }
    }

    function abrir(boton) {
        if (abierto) return;
        var caja = document.createElement('div');
        caja.className = 'tmrs-fondo';
        caja.innerHTML =
            '<div class="tmrs-panel" role="dialog" aria-modal="true" aria-labelledby="tmrs-tit">' +
              '<div class="tmrs-cab"><h3 id="tmrs-tit">¿Qué producto compraste?</h3>' +
              '<button type="button" class="tmrs-x" aria-label="Cerrar">✕</button></div>' +
              '<input type="search" class="tmrs-q" id="tmrs-q" placeholder="Busca por nombre…" aria-label="Buscar producto" autocomplete="off" autocapitalize="off" spellcheck="false">' +
              '<p class="tmrs-estado" id="tmrs-estado" role="status" aria-live="polite">Cargando productos…</p>' +
              '<ul class="tmrs-lista" id="tmrs-lista"></ul>' +
            '</div>';
        document.body.appendChild(caja);
        try { document.documentElement.className += ' tmrs-abierto'; } catch (e) {}
        abierto = { caja: caja, input: porId('tmrs-q'), lista: porId('tmrs-lista'), estado: porId('tmrs-estado'), previo: boton || document.activeElement };
        document.addEventListener('keydown', teclas, true);
        caja.addEventListener('click', function (e) {
            var t = e.target;
            if (t === caja) return cerrar();
            while (t && t !== caja) {
                if (t.className && String(t.className).indexOf('tmrs-x') >= 0) return cerrar();
                t = t.parentNode;
            }
        });
        try { abierto.input.focus(); } catch (e) {}
        var mia = abierto;
        obtenerLista(function (lista) {
            if (abierto !== mia) return;
            if (!lista) {
                mia.estado.innerHTML = 'No pude cargar la lista de productos. Abre el producto que compraste y toca «+ Agregar reseña» en su ficha.';
                return;
            }
            pintar(lista, mia.input.value);
            mia.input.addEventListener('input', function () { pintar(lista, mia.input.value); });
        });
    }

    document.addEventListener('click', function (e) {
        var b = ancestro(e.target, 'btn');
        if (!b) return;
        e.preventDefault();
        abrir(b);
    }, false);

})();
