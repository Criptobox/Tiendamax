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
 *
 * 🛍️ Mi tarjeta: quien abrió SU tarjeta (t.html) queda recordado en este
 * teléfono (tm_mi_tarjeta). Sin registro ni contraseña: su tarjeta es su
 * cuenta. Al entrar a la tienda, en lugar de «N disponibles» ve una píldora
 * con su nombre, las bolsitas de lo que lleva comprado y los descuentos que
 * le quedan, que abre su tarjeta. Pinta primero lo guardado (sin esperar la
 * red, en 3G) y lo refresca detrás; si la tarjeta ya no existe, se olvida.
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
  /* ── 🛍️ Mi tarjeta ── */
  function miCodigo() { try { var o = JSON.parse(localStorage.getItem('tm_mi_tarjeta') || 'null'); return o && RE.test(o.c) ? o.c : ''; } catch (e) { return ''; } }
  function pildora(c, t) {
    var chip = document.querySelector('#vistaInicio .op-chip'); if (!chip) return;
    var el = document.getElementById('tmMiTarjeta');
    if (!t || typeof t.r !== 'number') { if (el) el.remove(); chip.style.display = ''; return; }
    if (!el) {
      if (!document.getElementById('tmMiTarjetaCss')) {
        var st = document.createElement('style'); st.id = 'tmMiTarjetaCss';
        st.textContent = '.tm-mi{display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:7px 12px 7px 9px;border-radius:999px;border:1px solid rgba(255,107,53,.55);' +
          'background:rgba(255,107,53,.10);color:inherit;text-decoration:none;font:600 13px/1.2 Inter,system-ui,sans-serif;white-space:nowrap}' +
          '.tm-mi b{font-weight:800}.tm-mi .tm-mi-b{display:inline-flex;align-items:center;gap:3px;color:#FF6B35;font-weight:800}' +
          '.tm-mi svg{width:16px;height:16px;flex:none}.tm-mi .tm-mi-n{overflow:hidden;text-overflow:ellipsis}';
        document.head.appendChild(st);
      }
      el = document.createElement('a'); el.id = 'tmMiTarjeta'; el.className = 'tm-mi';
      chip.parentNode.insertBefore(el, chip);
    }
    var bolsa = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 8h12l1 13H5L6 8z"/><path d="M9 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var regalo = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';
    var n = String(t.n || '').replace(/[<>&"]/g, ''), k = Math.max(0, Number(t.k) || 0), vencida = t.x && Date.now() > t.x;
    el.href = '/t?c=' + c;
    el.setAttribute('aria-label', (n ? n + ': ' : '') + k + ' compras, ' + (vencida ? 'tarjeta caducada' : t.r + ' descuentos') + '. Ver mi tarjeta');
    el.innerHTML = '<span class="tm-mi-n">Hola <b>' + (n || 'de nuevo') + '</b></span>' +
      (k ? '<span class="tm-mi-b">' + bolsa + k + '</span>' : '') +
      '<span class="tm-mi-b">' + regalo + (vencida ? '—' : t.r) + '</span>';
    chip.style.display = 'none';
  }
  function miTarjeta() {
    var c = miCodigo(); if (!c) return;
    var dato = null; try { dato = JSON.parse(localStorage.getItem('tm_mi_tarjeta_dato') || 'null'); } catch (e) {}
    if (dato) pildora(c, dato);
    base().then(function (b) { return fetch(b + '/tarjetas/' + c + '.json', { cache: 'no-store' }); })
      .then(function (r) { if (!r.ok) throw new Error('red'); return r.json(); })
      .then(function (t) {
        if (!t) { try { localStorage.removeItem('tm_mi_tarjeta'); localStorage.removeItem('tm_mi_tarjeta_dato'); } catch (e) {} pildora(c, null); return; }
        try { localStorage.setItem('tm_mi_tarjeta_dato', JSON.stringify(t)); } catch (e) {}
        pildora(c, t);
      })
      .catch(function () {});   // sin red se queda lo guardado
  }

  function todo() { iniciar(); miTarjeta(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', todo); else todo();
})();
