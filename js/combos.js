/* TiendaMax — muestra los combos publicados (combos.json) en la home.
   Se oculta solo si no hay combos. Pedido por WhatsApp con el detalle del combo. */
(function () {
  'use strict';
  var WA = '5354320170';
  function money(n) { return '$' + (Number(n) || 0).toLocaleString('es-US', { maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  var _combos = [];

  // Agrega el combo al carrito como una sola línea con el precio del combo.
  // Reutiliza el carrito global de la tienda (no lo manda directo a WhatsApp).
  function comboAlCarrito(idx) {
    var c = _combos[idx];
    if (!c) return;
    var precio = Number(c.precio) || 0;
    var cid = 'combo_' + (c.id != null ? c.id : String(c.nombre || idx).replace(/\s+/g, '_'));
    try {
      if (typeof carrito === 'undefined' || !Array.isArray(carrito)) { return; }
      var ex = carrito.find(function (x) { return x.id === cid; });
      if (ex) { ex.cantidad = (ex.cantidad || 1) + 1; }
      else {
        carrito.push({
          id: cid,
          nombre: '🎁 ' + (c.nombre || 'Combo'),
          precio: precio,
          imagen: (typeof c.imagen === 'string' ? c.imagen : ''),
          cantidad: 1,
          esCombo: true
        });
      }
      if (typeof guardarCarrito === 'function') guardarCarrito();
      if (typeof renderizarCarrito === 'function') renderizarCarrito();
      if (typeof actualizarBotonesCarrito === 'function') actualizarBotonesCarrito();
      if (typeof _tmCartBump === 'function') { try { _tmCartBump(); } catch (e) {} }
      if (typeof mostrarNotificacion === 'function') mostrarNotificacion('🎁 Combo agregado al carrito');
    } catch (e) { /* si la tienda no expone el carrito, no hacemos nada */ }
  }
  window.tmComboAlCarrito = comboAlCarrito;

  function render(combos) {
    if (!Array.isArray(combos) || !combos.length) return;
    _combos = combos;
    var sec = document.getElementById('combosSection');
    var grid = document.getElementById('combosGrid');
    if (!sec || !grid) return;
    grid.innerHTML = combos.map(function (c, _idx) {
      var precio = Number(c.precio) || 0;
      var orig = Number(c.precioOriginal) || 0;
      var ahorro = orig - precio;
      var items = (c.items || []);
      var itemsTxt = items.map(function (it) { return (it.cantidad > 1 ? it.cantidad + '× ' : '') + esc(it.nombre); }).join(' + ');
      var msg = 'Hola! Me interesa el combo "' + (c.nombre || '') + '": ' +
        items.map(function (it) { return (it.cantidad > 1 ? it.cantidad + 'x ' : '') + it.nombre; }).join(' + ') +
        '. Precio combo: ' + money(precio) + '. ¿Está disponible?';
      var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
      // Foto propia del combo (elegida en el admin); si no hay, queda el diseño de texto
      var foto = (typeof c.imagen === 'string' && /^(data:image\/|https?:\/\/|\/)/.test(c.imagen))
        ? '<img class="cimg" src="' + esc(c.imagen) + '" alt="" loading="lazy" style="width:100%;height:150px;object-fit:cover;border-radius:12px;margin-bottom:10px" onerror="this.remove()">'
        : '';
      return '<div class="combo-card">' +
        foto +
        '<div class="cnm">🎁 ' + esc(c.nombre || 'Combo') + '</div>' +
        '<div class="citems">' + itemsTxt + '</div>' +
        '<div class="cprice-row"><span class="cprice">' + money(precio) + '</span>' +
        (orig > precio ? '<span class="cold">' + money(orig) + '</span>' : '') +
        (ahorro > 0 ? '<span class="csave">ahorra ' + money(ahorro) + '</span>' : '') +
        '</div>' +
        '<button class="cbtn cbtn-cart" type="button" onclick="tmComboAlCarrito(' + _idx + ')" style="width:100%;justify-content:center;margin-bottom:8px;background:rgba(255,107,53,.12);color:#ff8c5a;border:1px solid rgba(255,107,53,.4)">🛒 Agregar al carrito</button>' +
        '<a class="cbtn" href="' + wa + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        'Pedir por WhatsApp</a>' +
        '</div>';
    }).join('');
    sec.style.display = '';
  }

  function load() {
    fetch('combos.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(render)
      .catch(function () { /* sin combos: la sección queda oculta */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
