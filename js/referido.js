/* 🤝 Referidos — en la tienda (index.html).
 *
 * Un cliente con Tarjeta TiendaMax regala su enlace desde t.html:
 *   tiendamax.org/?ref=TM7K3QX9
 * Aquí se recoge: se comprueba que la tarjeta existe, que su campaña sigue y
 * que no caducó (/tarjetas/<código>, el mismo espejo público que lee t.html),
 * se recuerda 30 días en este teléfono y:
 *  · se enseña una franja: «María te regaló hasta 1000 MN…»;
 *  · cualquier pedido por WhatsApp AL NÚMERO DE LA TIENDA lleva la línea
 *    «Vengo recomendado por la tarjeta TM-…», para que el gestor lo vea sin
 *    preguntar. Se hace aquí, en un solo sitio, interceptando los wa.me de la
 *    tienda: el texto del pedido se arma en una docena de lugares (ficha,
 *    carrito, combos, digitales…) y tocar cada uno es olvidarse de alguno.
 *    Un wa.me SIN número (compartir con un amigo) no se toca.
 * Sin compra no hay premio: esto solo hace que el código llegue con el pedido.
 * El descuento lo aplica el panel (js/tarjeta-cliente.js), que comprueba todo.
 */
(function () {
  'use strict';
  var LS = 'tm_ref', DIAS = 30, RTDB_RESPALDO = 'https://tiendamax-8feb5-default-rtdb.firebaseio.com';
  var RE = /^TM[2-9A-HJKMNP-Z]{6}$/;
  function lsGet() { try { var o = JSON.parse(localStorage.getItem(LS) || 'null'); return (o && RE.test(o.c) && Date.now() - (o.ts || 0) < DIAS * 864e5) ? o : null; } catch (e) { return null; } }
  function lsSet(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function bonito(c) { return c.slice(0, 2) + '-' + c.slice(2); }

  function linea(ref) { return '🎁 Vengo recomendado por la tarjeta ' + bonito(ref.c); }
  // https://wa.me/<número>?text=… → el mismo enlace con la línea al final del texto.
  function conRef(url) {
    var ref = lsGet(); if (!ref) return url;
    var m = /^https:\/\/(?:wa\.me|api\.whatsapp\.com\/send)\/?(\d{6,})?(?:\?(.*))?$/.exec(String(url || ''));
    if (!m || !m[1]) return url;                       // sin número: es compartir con alguien, no un pedido
    var q = new URLSearchParams(m[2] || ''), t = q.get('text') || '';
    if (t.indexOf(bonito(ref.c)) !== -1) return url;
    q.set('text', (t ? t + '\n\n' : '') + linea(ref));
    return 'https://wa.me/' + m[1] + '?' + q.toString().replace(/\+/g, '%20');
  }
  window.tmConReferido = conRef;

  var abrir = window.open;
  window.open = function (url) {
    var a = Array.prototype.slice.call(arguments);
    try { a[0] = conRef(url); } catch (e) {}
    return abrir.apply(window, a);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me/"],a[href*="api.whatsapp.com/send"]');
    if (!a) return;
    try { var n = conRef(a.href); if (n !== a.href) a.href = n; } catch (err) {}
  }, true);

  function franja(ref) {
    try { if (sessionStorage.getItem('tm_ref_visto')) return; } catch (e) {}
    var d = document.createElement('div');
    d.id = 'tmRefFranja'; d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:9990;max-width:520px;margin:0 auto;' +
      'background:#161412;color:#F5EFE6;border:1px solid rgba(255,107,53,.5);border-radius:16px;padding:12px 40px 12px 14px;' +
      'font:500 13.5px/1.45 Inter,system-ui,sans-serif;box-shadow:0 14px 34px -14px rgba(0,0,0,.7)';
    var quien = ref.n ? String(ref.n).replace(/[<>&"]/g, '') : 'Un amigo';
    d.innerHTML = '🎁 <b>' + quien + '</b> te regaló <b style="color:#FF6B35">hasta 1000 MN</b> de descuento en tu primera compra desde $25. ' +
      'Pide por WhatsApp como siempre: tu regalo va en el mensaje.' +
      '<button type="button" aria-label="Cerrar" style="position:absolute;top:6px;right:8px;background:none;border:0;color:#A39A8F;font-size:20px;cursor:pointer;padding:4px 8px">×</button>';
    d.querySelector('button').onclick = function () { d.remove(); };
    document.body.appendChild(d);
    try { sessionStorage.setItem('tm_ref_visto', '1'); } catch (e) {}
  }

  function base() {
    var p = window.__tmConfigInicial && typeof window.__tmConfigInicial.then === 'function' ? window.__tmConfigInicial
      : fetch('config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; });
    return Promise.resolve(p).catch(function () { return null; })
      .then(function (c) { return (c && c.firebaseConfig && c.firebaseConfig.databaseURL) || RTDB_RESPALDO; });
  }

  function iniciar() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('ref'); } catch (e) {}
    var c = String(q || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (q) {
      // El enlace queda limpio: si lo vuelven a compartir, no arrastra el código.
      try { var u = new URL(location.href); u.searchParams.delete('ref'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) {}
    }
    if (!RE.test(c)) { var ya = lsGet(); if (ya) franja(ya); return; }
    base().then(function (b) { return fetch(b + '/tarjetas/' + c + '.json', { cache: 'no-store' }); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (t) {
        // Solo una tarjeta que existe, con la campaña viva y sin caducar, regala.
        if (!t || t.f !== 1 || (t.x && Date.now() > t.x)) return;
        var ref = { c: c, n: String(t.n || '').slice(0, 30), ts: Date.now() };
        lsSet(ref);
        try { sessionStorage.removeItem('tm_ref_visto'); } catch (e) {}
        franja(ref);
      })
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
