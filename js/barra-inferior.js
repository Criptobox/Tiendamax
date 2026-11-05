/* Barra inferior del móvil: qué pestaña está activa, el contador del carrito y
   el botón «Categorías». El HTML y el CSS están en index.html y en
   css/barra-inferior.css; aquí no hay navegación propia, solo se mira a qué
   vista ha llegado la tienda con las funciones de siempre (volverAlInicio,
   abrirCarrito, abrirMenuMovil), que los botones llaman por data-action.

   Va suelto (no en el bundle) porque solo lo necesita index.html: el bundle
   también lo carga el panel. Después de tm-bundle.js, como los demás. */
(function () {
    'use strict';
    var barra = document.getElementById('tmBarra');
    if (!barra) return;

    var botones = {};
    barra.querySelectorAll('[data-barra]').forEach(function (b) { botones[b.getAttribute('data-barra')] = b; });

    function visible(id) {
        var e = document.getElementById(id);
        return !!(e && getComputedStyle(e).display !== 'none');
    }
    var enBandaCategorias = false;   // la sección de categorías cruza la mitad de la pantalla

    function cual() {
        var b = document.body;
        if (b.classList.contains('cart-open')) return 'carrito';
        var menu = document.getElementById('mobileMenuOverlay');
        if (menu && menu.classList.contains('open')) return 'mas';
        if (visible('vistaPedidos')) return 'mas';        // «Mis pedidos» vive en el menú
        if (visible('vistaCategoria')) return 'categorias';
        if (visible('vistaMeGusta')) return '';           // tiene su corazón en el encabezado
        // Arriba del todo manda «Inicio»: con la portada compacta las categorías
        // ya asoman en la primera pantalla y no por eso se está «en categorías».
        return enBandaCategorias && window.pageYOffset > 60 ? 'categorias' : 'inicio';
    }

    var ultima = null;
    function marcar(forzada) {
        var c = forzada !== undefined ? forzada : cual();
        if (c === ultima) return;
        ultima = c;
        Object.keys(botones).forEach(function (k) {
            if (k === c) botones[k].setAttribute('aria-current', 'page');
            else botones[k].removeAttribute('aria-current');
        });
    }

    // «Categorías»: si ya está en el inicio, baja a ellas; si no, vuelve al
    // inicio primero (las vistas de categoría, me gusta y pedidos lo tapan).
    function irACategorias() {
        var el = document.getElementById('categorias-home');
        if (!el) return;
        var h = document.querySelector('.header');
        var y = el.getBoundingClientRect().top + window.pageYOffset - (h ? h.offsetHeight : 70) - 10;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    window.tmBarraCategorias = function () {
        var enInicio = visible('vistaInicio') && !visible('vistaCategoria') && !visible('vistaMeGusta') && !visible('vistaPedidos');
        if (!enInicio && typeof window.volverAlInicio === 'function') window.volverAlInicio();
        setTimeout(irACategorias, enInicio ? 0 : 140);
        marcar('categorias');
    };

    // Lo que cambia de vista: cada una pone o quita display en su contenedor.
    var vigilar = ['vistaInicio', 'vistaCategoria', 'vistaMeGusta', 'vistaPedidos', 'mobileMenuOverlay'];
    if ('MutationObserver' in window) {
        var mo = new MutationObserver(function () { marcar(); });
        vigilar.forEach(function (id) {
            var e = document.getElementById(id);
            if (e) mo.observe(e, { attributes: true, attributeFilter: ['style', 'class'] });
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    // En el inicio, «Categorías» se enciende mientras esa sección está en la
    // parte de arriba de la pantalla: de justo debajo del encabezado a un 45 %
    // de la altura. Es la zona donde queda al tocar el botón (la sección es
    // baja, unos 280 px: una banda en el centro no la alcanzaba).
    var cats = document.getElementById('categorias-home');
    if (cats && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
            enBandaCategorias = es.some(function (e) { return e.isIntersecting; });
            marcar();
        }, { rootMargin: '-90px 0px -55% 0px' }).observe(cats);
    }
    window.addEventListener('scroll', function () { if (window.pageYOffset < 120) marcar(); }, { passive: true });
    barra.addEventListener('click', function (e) {
        var b = e.target.closest('[data-barra]');
        if (b && b.getAttribute('data-barra') !== 'categorias') setTimeout(marcar, 60);
    });
    window.addEventListener('popstate', function () { setTimeout(marcar, 60); });

    // Contador: el del encabezado (#cartCount) es el dato; este lo copia.
    var cuenta = document.getElementById('tmBarraCount');
    var fuente = document.getElementById('cartCount');
    function copiarCuenta() {
        if (!cuenta || !fuente) return;
        var hay = fuente.style.display !== 'none' && fuente.textContent.trim() !== '' && fuente.textContent.trim() !== '0';
        cuenta.hidden = !hay;
        if (hay) cuenta.textContent = fuente.textContent.trim();
        if (botones.carrito) botones.carrito.setAttribute('aria-label', hay ? 'Carrito, ' + fuente.textContent.trim() + ' en total' : 'Carrito');
    }
    if (fuente && 'MutationObserver' in window) {
        new MutationObserver(copiarCuenta).observe(fuente, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
    }
    copiarCuenta();

    // El saltito del carrito al añadir algo: el del encabezado ya no se ve.
    var bumpOriginal = window._tmCartBump;
    window._tmCartBump = function () {
        if (typeof bumpOriginal === 'function') bumpOriginal.apply(this, arguments);
        var b = botones.carrito;
        if (!b) return;
        b.classList.remove('tm-bump'); void b.offsetWidth; b.classList.add('tm-bump');
        setTimeout(function () { b.classList.remove('tm-bump'); }, 480);
    };

    // Con el teclado abierto la barra estorba (en iOS flota encima de él). Se
    // detecta por lo que se ve de la pantalla, no por el foco: el campo de
    // búsqueda sigue enfocado después de cerrar su panel, y con el foco como
    // señal la barra se quedaba escondida hasta tocar otra cosa. Un zoom con
    // los dedos también encoge lo visible, de ahí mirar la escala.
    var vv = window.visualViewport;
    if (vv) {
        var teclado = function () {
            var abierto = vv.scale <= 1.02 && vv.height < window.innerHeight * 0.75;
            document.body.classList.toggle('tm-escribiendo', abierto);
        };
        vv.addEventListener('resize', teclado);
        teclado();
    }

    /* La bola de Max vive en la barra: si algo cubre la barra (modal de
       producto, carrito, menú, búsqueda a pantalla completa, teclado, un panel
       del propio Max), la bola se esconde también. En vez de listar cada capa,
       se pregunta lo único que importa: ¿lo que hay en el centro de la barra
       es la barra? Cualquier capa nueva que se añada mañana queda cubierta sin
       tocar esto. En el ordenador la barra no existe y no se hace nada. */
    var temporizador = null;
    function revisarCubierta() {
        temporizador = null;
        var visible = getComputedStyle(barra).display !== 'none';
        var cubierta = false;
        if (visible) {
            var r = barra.getBoundingClientRect();
            var e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            cubierta = !(e && barra.contains(e));
        } else {
            // Oculta por CSS: en el ordenador es lo normal (la bola sigue como
            // siempre); en el móvil es la búsqueda a pantalla completa, y la
            // bola se va con la barra.
            cubierta = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
        }
        document.body.classList.toggle('tm-barra-cubierta', cubierta);
    }
    function programarRevision() {
        if (temporizador) return;
        // Tras el cambio y otra vez al acabar su animación de entrada o salida.
        temporizador = setTimeout(revisarCubierta, 80);
        setTimeout(revisarCubierta, 420);
    }
    if ('MutationObserver' in window) {
        new MutationObserver(programarRevision)
            .observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true, childList: true });
    }
    window.addEventListener('resize', programarRevision);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', programarRevision);
    revisarCubierta();

    marcar();
})();
