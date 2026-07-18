/* cart-share.js — Carrito compartible por URL y Web Share API */
(function () {
    // Al cargar la página: restaurar carrito desde parámetro ?carrito=BASE64
    (function () {
        var params = new URLSearchParams(location.search);
        var encoded = params.get('carrito');
        if (!encoded) return;
        try {
            var items = JSON.parse(decodeURIComponent(escape(atob(encoded))));
            if (!Array.isArray(items) || items.length === 0) return;
            var valid = items.every(function (i) {
                return i && typeof i.id !== 'undefined' && typeof i.cantidad === 'number' && i.cantidad > 0;
            });
            if (!valid) return;
            localStorage.setItem('carrito_v2', JSON.stringify({
                items: items,
                expires: Date.now() + 86400000
            }));
            var url = new URL(location.href);
            url.searchParams.delete('carrito');
            history.replaceState(null, '', url.toString());
            window.addEventListener('load', function () {
                setTimeout(function () {
                    if (typeof mostrarNotificacion === 'function') {
                        mostrarNotificacion('🛒 Carrito restaurado (' + items.length + ' producto' + (items.length > 1 ? 's' : '') + ')');
                    }
                    if (typeof actualizarContadorCarrito === 'function') actualizarContadorCarrito();
                    if (typeof renderCarritoItems === 'function') renderCarritoItems();
                }, 800);
            });
        } catch (e) {}
    }());

    window.compartirCarrito = function () {
        try {
            var stored = JSON.parse(localStorage.getItem('carrito_v2') || '{}');
            var items = stored.items || [];
            if (items.length === 0) {
                if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⚠️ El carrito está vacío', 'error');
                return;
            }
            // Encode only items (sin timestamps ni metadata). unescape/encodeURIComponent
            // evita que btoa() rompa con nombres de producto fuera de Latin-1 (emoji,
            // comillas tipográficas, guión largo — todos plausibles en texto de admin).
            var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(items))));
            var url = location.origin + location.pathname + '?carrito=' + encoded;
            var texto = '🛍️ Mira lo que quiero comprar en TiendaMax (' + items.length +
                        ' producto' + (items.length > 1 ? 's' : '') + '):\n' + url;

            if (navigator.share) {
                navigator.share({ title: 'Mi lista en TiendaMax', text: texto, url: url }).catch(function () {});
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function () {
                    if (typeof mostrarNotificacion === 'function') mostrarNotificacion('🔗 Link del carrito copiado');
                });
                return;
            }
            prompt('Copia este link para compartir tu carrito:', url);
        } catch (e) {}
    };
}());
