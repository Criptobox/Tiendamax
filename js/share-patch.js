/**
 * ═══════════════════════════════════════════════════════
 * TIENDAMAX — Parche de compartir con miniatura
 * ═══════════════════════════════════════════════════════
 *
 * CAMBIO: Las URLs de compartir ahora apuntan a
 * /p/producto-{id}.html en vez de /#producto-{id}
 *
 * Esto permite que WhatsApp/Facebook/Telegram muestren
 * la imagen del producto como miniatura al compartir.
 *
 * INSTALACIÓN: Reemplazar las funciones existentes en script.js
 * con las versiones de abajo, o agregar este archivo como
 * <script src="js/share-patch.js"></script> DESPUÉS de script.js
 */

// URL base del sitio
var TM_SITE_URL = 'https://tiendamax.org';

/**
 * Genera la URL de compartir para un producto.
 * Usa /p/producto-{id}.html para que los rastreadores
 * lean los meta tags con la imagen del producto.
 */
function tmShareURL(id) {
  return TM_SITE_URL + '/p/producto-' + id + '.html';
}

/**
 * Genera los datos de compartir para el producto actual
 * VERSIÓN ACTUALIZADA — usa /p/ para miniaturas
 */
function _getShareData() {
  var p = _detalleProductoActual;
  if (!p) return null;
  var url = tmShareURL(p.id);
  return {
    nombre: p.nombre,
    precio: p.precioActual.toFixed(2),
    imagen: p.imagen,
    texto: '\uD83D\uDECD\uFE0F *' + p.nombre + '* — $' + p.precioActual.toFixed(2) + ' USD\n\uD83D\uDCE6 Stock disponible\n\uD83D\uDC49 ' + url,
    url: url
  };
}

/**
 * Compartir por WhatsApp
 */
function compartirWhatsApp() {
  var d = _getShareData(); if (!d) return;
  var msg = encodeURIComponent(d.texto);
  window.open('https://wa.me/?text=' + msg, '_blank', 'noopener,noreferrer');
}

/**
 * Compartir por Facebook
 */
function compartirFacebook() {
  var d = _getShareData(); if (!d) return;
  var url = encodeURIComponent(d.url);
  window.open('https://www.facebook.com/sharer/sharer.php?u=' + url + '&quote=' + encodeURIComponent(d.texto), '_blank', 'noopener,noreferrer');
}

/**
 * Compartir por Telegram
 */
function compartirTelegram() {
  var d = _getShareData(); if (!d) return;
  var msg = encodeURIComponent(d.texto + '\n' + d.url);
  window.open('https://t.me/share/url?url=' + encodeURIComponent(d.url) + '&text=' + encodeURIComponent(d.texto), '_blank', 'noopener,noreferrer');
}

/**
 * Compartir por Twitter
 */
function compartirTwitter() {
  var d = _getShareData(); if (!d) return;
  var msg = encodeURIComponent(d.nombre + ' — $' + d.precio + ' USD en @TiendaMax \uD83D\uDECD\uFE0F ' + d.url);
  window.open('https://twitter.com/intent/tweet?text=' + msg, '_blank', 'noopener,noreferrer');
}

/**
 * Compartir nativo (Web Share API)
 */
function compartirNativo() {
  var p = _detalleProductoActual;
  if (!p) return;
  var texto = '\uD83D\uDECD\uFE0F ' + p.nombre + ' — $' + p.precioActual.toFixed(2) + ' USD\n\uD83D\uDCE6 Stock disponible\n\uD83D\uDC49 tiendamax.org';
  var urlProducto = tmShareURL(p.id);
  if (navigator.share) {
    navigator.share({ title: p.nombre, text: texto, url: urlProducto }).catch(function(){});
  } else {
    navigator.clipboard.writeText(texto + '\n' + urlProducto).then(function() {
      mostrarNotificacion('\uD83D\uDCE4 Texto copiado para compartir');
    });
  }
}

/**
 * Copiar link del producto
 * VERSIÓN ACTUALIZADA — usa /p/ para miniaturas
 */
function copiarLinkProducto() {
  var p = _detalleProductoActual;
  var url = p ? tmShareURL(p.id) : TM_SITE_URL;
  navigator.clipboard.writeText(url).then(function() {
    mostrarNotificacion('\uD83D\uDD17 Enlace copiado — ¡listo para compartir!');
  }).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    mostrarNotificacion('\uD83D\uDD17 Enlace copiado — ¡listo para compartir!');
  });
}

// Interceptar si alguien abre un link /p/producto-*.html
// para redirigir al hash correcto (por si el meta-refresh falla)
(function() {
  var match = window.location.pathname.match(/\/p\/producto-(\d+)\.html/);
  if (match) {
    window.location.replace(TM_SITE_URL + '/#producto-' + match[1]);
  }
})();
