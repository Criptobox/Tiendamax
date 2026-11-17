/* 🎁 Tarjeta de cliente — solo en el panel (admin.html).
 *
 * Al cerrar la PRIMERA compra de un cliente (con su WhatsApp), el panel le crea
 * una tarjeta personal: su nombre, un código único (TM + 6) y un QR que abre
 * tiendamax.org/t?c=<código>. Vale 1000 MN de descuento en cada una de sus 3
 * compras siguientes. El descuento sale de la comisión del gestor —lo decidió
 * él, para atraer clientes— y así lo cuenta gananciasDe(): la venta guarda
 * `tarjeta` y `descTarjetaMN` y la ganancia en MN baja eso.
 *
 * Por qué así:
 *  · Código único y al azar (no TM-0001, TM-0002…): un código que se adivina
 *    es un descuento que usa cualquiera. 31⁶ ≈ 900 millones de combinaciones.
 *  · La verdad vive en /privado/tarjetas/<código> (solo la cuenta del dueño):
 *    nombre y teléfono son datos personales, como /privado/clientes. Los usos
 *    son un conjunto {idVenta: ts} que solo crece: dos teléfonos se fusionan
 *    uniéndolos, sin que uno pise al otro.
 *  · La página pública /t solo puede leer /tarjetas/<código> = {r, n, e}:
 *    cuántos descuentos quedan, el nombre de pila y la fecha. Ni teléfono ni
 *    compras. La regla no deja listar el nodo entero, solo un código concreto.
 *  · Una venta ANULADA devuelve su uso (cuenta lo que dice tm_ventas_anuladas,
 *    igual que el resto del panel).
 *  · Local en el toque; la cuenta, al momento si hay sesión, y al abrir el
 *    panel se sube lo que la cuenta no tenga (mismo autocurado que clientes).
 * tests/tarjeta_check.mjs + test_tarjeta_cliente.py.
 */
(function () {
  'use strict';
  var LS = 'tm_tarjetas_v1';
  var USOS = 3, DESCUENTO_MN = 1000;
  var ALF = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sin 0/O, 1/I/L: se dictan por teléfono
  var URL_T = 'https://tiendamax.org/t?c=';

  function leer() { try { var o = JSON.parse(localStorage.getItem(LS) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
  function escribir(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function tel(t) { var d = String(t || '').replace(/\D/g, ''); return d.length >= 6 ? d : ''; }
  function pila(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bonito(c) { return c ? c.slice(0, 2) + '-' + c.slice(2) : ''; }
  function anuladas() { try { return (typeof ventasAnuladas === 'function') ? ventasAnuladas() : JSON.parse(localStorage.getItem('tm_ventas_anuladas') || '[]').map(String); } catch (e) { return []; } }
  function nuevoCodigo(existentes) {
    for (var k = 0; k < 50; k++) {
      var b = new Uint8Array(6), s = 'TM';
      (window.crypto || window.msCrypto).getRandomValues(b);
      for (var i = 0; i < 6; i++) s += ALF[b[i] % ALF.length];
      if (!existentes[s]) return s;
    }
    throw new Error('sin código');
  }

  /* ── Estado ── */
  function restantes(t) {
    if (!t) return 0;
    var an = anuladas(), n = 0;
    Object.keys(t.usos || {}).forEach(function (v) { if (an.indexOf(String(v)) === -1) n++; });
    return Math.max(0, USOS - n);
  }
  function porTel(tl) {
    tl = tel(tl); if (!tl) return null;
    var o = leer(), mejor = null;
    Object.keys(o).forEach(function (c) { var t = o[c]; if (t && t.t === tl && (!mejor || (t.e || 0) > (mejor.e || 0))) mejor = t; });
    return mejor;
  }
  function porCodigo(c) {
    c = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (/^[0-9A-Z]{6}$/.test(c)) c = 'TM' + c;
    return leer()[c] || null;
  }
  function crear(nombre, telefono, ventaId) {
    var o = leer(), c = nuevoCodigo(o), ahora = Date.now();
    o[c] = { c: c, n: String(nombre || '').trim().slice(0, 60), t: tel(telefono), v: ventaId || null, e: ahora, usos: {}, ts: ahora };
    escribir(o); subir(c);
    return o[c];
  }
  function usar(c, ventaId) {
    var o = leer(); if (!o[c]) return;
    o[c].usos = o[c].usos || {}; o[c].usos[String(ventaId)] = Date.now(); o[c].ts = Date.now();
    escribir(o); subir(c);
  }

  /* ── Cuenta (Firebase) ── */
  function publico(t) { return { r: restantes(t), n: pila(t.n).slice(0, 30), e: t.e }; }
  async function subir(c) {
    var t = leer()[c];
    if (!t || typeof TMAuth === 'undefined' || !TMAuth.fetchPrivado) return false;
    var a = await TMAuth.fetchPrivado('/privado/tarjetas/' + c + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) });
    if (!a.ok) return false;
    var b = await TMAuth.fetchPrivado('/tarjetas/' + c + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(publico(t)) });
    return !!b.ok;
  }
  function fusionar(a, b) {
    var o = {};
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (c) {
      var x = (a || {})[c], y = (b || {})[c];
      if (!x || !y) { o[c] = x || y; return; }
      var base = (y.ts || 0) > (x.ts || 0) ? y : x, usos = {};
      [x.usos || {}, y.usos || {}].forEach(function (u) { Object.keys(u).forEach(function (k) { usos[k] = u[k]; }); });
      o[c] = Object.assign({}, base, { usos: usos });
    });
    return o;
  }
  async function sincronizar() {
    if (typeof TMAuth === 'undefined' || !TMAuth.fetchPrivado) return;
    var r = await TMAuth.fetchPrivado('/privado/tarjetas.json');
    if (!r.ok) return;
    var remoto = (r.dato && typeof r.dato === 'object') ? r.dato : {}, local = leer(), f = fusionar(remoto, local);
    escribir(f);
    // Lo que la cuenta no tiene igual (una subida que falló, una venta sin red) se sube.
    for (var c in f) { if (JSON.stringify(f[c]) !== JSON.stringify(remoto[c])) await subir(c); }
    try { if (typeof window.renderClientes === 'function') window.renderClientes(); } catch (e) {}
  }

  /* ── La imagen de la tarjeta (canvas) ── */
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function cargarImg(src) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; }); }
  async function dibujar(canvas, t) {
    var W = 1012, H = 638, g = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    try { await Promise.all([document.fonts.load('700 60px "Playfair Display"'), document.fonts.load('italic 700 60px "Playfair Display"'), document.fonts.load('600 30px "DM Sans"')]); } catch (e) {}
    var serif = '"Playfair Display", Georgia, serif', sans = '"DM Sans", system-ui, sans-serif', mono = '"JetBrains Mono", ui-monospace, monospace';
    // Fondo: negro cálido, brillo naranja abajo a la derecha, borde fino.
    rr(g, 0, 0, W, H, 44); g.save(); g.clip();
    g.fillStyle = '#0F0E0D'; g.fillRect(0, 0, W, H);
    var rg = g.createRadialGradient(W * .92, H * 1.05, 10, W * .92, H * 1.05, W * .75);
    rg.addColorStop(0, 'rgba(255,107,53,.30)'); rg.addColorStop(1, 'rgba(255,107,53,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.restore(); rr(g, 1.5, 1.5, W - 3, H - 3, 43); g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 3; g.stroke();
    // Marca.
    var logo = await cargarImg('/iconos/icon-192.png');
    if (logo) { g.save(); rr(g, 64, 56, 84, 84, 20); g.clip(); g.drawImage(logo, 64, 56, 84, 84); g.restore(); }
    g.textBaseline = 'alphabetic'; g.font = '700 46px ' + serif; g.fillStyle = '#F5EFE6'; g.fillText('Tienda', 172, 112);
    var wT = g.measureText('Tienda').width; g.fillStyle = '#FF6B35'; g.fillText('Max', 172 + wT, 112);
    g.font = '600 18px ' + sans; g.fillStyle = '#9C9389'; g.fillText('T A R J E T A   D E   C L I E N T E', 174, 140);
    // Nombre (encoge hasta caber, nunca se corta).
    var nombre = t.n || 'Cliente TiendaMax', tam = 64;
    do { g.font = '700 ' + tam + 'px ' + serif; tam -= 2; } while (g.measureText(nombre).width > 560 && tam > 30);
    g.fillStyle = '#F5EFE6'; g.fillText(nombre, 64, 268);
    // La oferta.
    g.font = 'italic 700 74px ' + serif; g.fillStyle = '#FF6B35'; g.fillText('1000 MN', 64, 372);
    var wO = g.measureText('1000 MN ').width; g.font = '700 30px ' + sans; g.fillStyle = '#F5EFE6'; g.fillText('de descuento', 64 + wO, 368);
    g.font = '500 27px ' + sans; g.fillStyle = '#C9C0B5'; g.fillText('en cada una de tus próximas 3 compras', 64, 418);
    // Tres casillas, una por compra.
    for (var i = 0; i < USOS; i++) {
      var cx = 84 + i * 62, cy = 476;
      g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fillStyle = 'rgba(255,107,53,.16)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#FF6B35'; g.stroke();
      g.font = '700 20px ' + sans; g.fillStyle = '#FF6B35'; g.textAlign = 'center'; g.fillText(String(i + 1), cx, cy + 7); g.textAlign = 'left';
    }
    // Código, grande y espaciado: se dicta por WhatsApp.
    g.font = '600 16px ' + sans; g.fillStyle = '#9C9389'; g.fillText('TU CÓDIGO', 64, 548);
    g.font = '700 40px ' + mono; g.fillStyle = '#F5EFE6';
    var cod = bonito(t.c), x = 64; for (var k = 0; k < cod.length; k++) { g.fillText(cod[k], x, 592); x += g.measureText(cod[k]).width + 6; }
    // QR sobre fondo crema.
    var q = (typeof tmQR === 'function') ? tmQR(URL_T + t.c) : null, qs = 300, qx = W - 64 - qs, qy = 170;
    rr(g, qx, qy, qs, qs, 28); g.fillStyle = '#F7F0DD'; g.fill();
    if (q) {
      var m = (qs - 44) / q.n; g.fillStyle = '#111';
      for (var f = 0; f < q.n; f++) for (var c = 0; c < q.n; c++) if (q.get(f, c)) g.fillRect(Math.round(qx + 22 + c * m), Math.round(qy + 22 + f * m), Math.ceil(m), Math.ceil(m));
    }
    g.font = '600 19px ' + sans; g.fillStyle = '#9C9389'; g.textAlign = 'center';
    g.fillText('Escanéala para ver tus descuentos', qx + qs / 2, qy + qs + 36);
    g.font = '500 16px ' + sans; g.fillStyle = '#6F675E';
    g.fillText('Personal · no canjeable por efectivo', qx + qs / 2, qy + qs + 62);
    g.textAlign = 'left';
    canvas.dataset.tmTarjeta = JSON.stringify({ c: t.c, qr: q ? q.n : 0 });
    return canvas;
  }

  function textoEnvio(t) {
    var n = pila(t.n);
    return '¡Gracias por tu compra' + (n ? ', ' + n : '') + '! 🎁\n' +
      'Te regalo tu *Tarjeta TiendaMax*: 1000 MN de descuento en cada una de tus próximas 3 compras.\n\n' +
      'Al pedir, solo dime tu código: *' + bonito(t.c) + '*\n' +
      '👉 ' + URL_T + t.c;
  }

  /* ── Hoja: ver, enviar y guardar la tarjeta ── */
  async function hoja(t, recienCreada) {
    var prev = document.getElementById('tarjeta-hoja'); if (prev) prev.remove();
    var d = document.createElement('div'); d.id = 'tarjeta-hoja';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:12px';
    var r = restantes(t);
    d.innerHTML = '<div style="width:100%;max-width:480px;background:var(--card,#15151f);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:20px;padding:18px;color:var(--text,#fff);max-height:94vh;overflow:auto">' +
      '<h3 style="margin:0 0 4px">🎁 ' + (recienCreada ? 'Tarjeta de cliente creada' : 'Tarjeta de cliente') + '</h3>' +
      '<p style="font-size:12.5px;color:var(--gray,#999);margin:0 0 12px">' + escH(t.n || 'Cliente') + ' · <b style="color:#fff">' + bonito(t.c) + '</b> · le quedan <b style="color:#fff">' + r + ' de ' + USOS + '</b> descuentos de 1000 MN. Sale de tu comisión.</p>' +
      '<canvas id="tarjeta-canvas" style="width:100%;height:auto;border-radius:14px;display:block;background:#0F0E0D"></canvas>' +
      '<p id="tarjeta-est" style="font-size:12px;color:var(--gray,#999);min-height:16px;margin:8px 0 0"></p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">' +
      (t.t ? '<button class="btn btn-primary" id="tarjeta-enviar">📤 Enviársela por WhatsApp</button>' : '') +
      '<button class="btn btn-ghost" id="tarjeta-guardar">⬇️ Guardar imagen</button>' +
      '<button class="btn btn-ghost" id="tarjeta-cerrar">Cerrar</button></div></div>';
    document.body.appendChild(d);
    var cv = d.querySelector('#tarjeta-canvas'), est = d.querySelector('#tarjeta-est');
    await dibujar(cv, t);
    var nombreArchivo = 'tarjeta-tiendamax-' + t.c + '.png';
    function png() { return new Promise(function (ok) { cv.toBlob(function (b) { ok(b); }, 'image/png'); }); }
    function descargar(b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
    d.querySelector('#tarjeta-cerrar').onclick = function () { d.remove(); };
    d.addEventListener('click', function (e) { if (e.target === d) d.remove(); });
    d.querySelector('#tarjeta-guardar').onclick = async function () { descargar(await png()); est.textContent = '✅ Imagen guardada.'; };
    var env = d.querySelector('#tarjeta-enviar');
    if (env) env.onclick = async function () {
      var b = await png(), texto = textoEnvio(t);
      var f = (typeof File === 'function') ? new File([b], nombreArchivo, { type: 'image/png' }) : null;
      // Con la hoja de compartir del móvil va la imagen y el texto juntos; si no
      // se puede (PC), se abre su chat con el texto y la imagen se descarga para adjuntarla.
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], text: texto }); est.textContent = '✅ Enviada.'; return; }
        catch (e) { if (e && e.name === 'AbortError') { est.textContent = 'Cancelado: no se envió.'; return; } }
      }
      descargar(b);
      window.open('https://wa.me/' + t.t + '?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
      est.textContent = 'Se abrió su chat con el mensaje; adjunta la imagen que se acaba de guardar.';
    };
  }

  /* ── La venta: crear la tarjeta tras la primera compra; aplicar el descuento ── */
  var orig = window.registrarVentaPedido;
  if (typeof orig === 'function') {
    window.registrarVentaPedido = function (items, cliente, opts) {
      opts = opts || {};
      // La tarjeta se comprueba AQUÍ, no en quien llama: existe y le quedan usos.
      if (opts.tarjeta) {
        var tj = porCodigo(opts.tarjeta.codigo);
        if (!tj || restantes(tj) <= 0) { opts = Object.assign({}, opts); delete opts.tarjeta; }
        else opts = Object.assign({}, opts, { tarjeta: { codigo: tj.c, mn: DESCUENTO_MN } });
      }
      var v = orig.call(this, items, cliente, opts);
      if (!v) return v;
      if (v.tarjeta) { usar(v.tarjeta, v.id); VENTA_TJ = null; }
      else if (v.telefono && !porTel(v.telefono)) {
        // Primera compra con su WhatsApp: nace su tarjeta.
        var t = crear(v.cliente, v.telefono, v.id);
        setTimeout(function () { hoja(t, true); }, 300);
      }
      return v;
    };
  }

  // Formulario de venta: el WhatsApp tecleado (o un código) trae su tarjeta.
  var VENTA_TJ = null, CARRITO = [], aplicar = false;
  function comisionMN(cart) {
    var mn = 0, usd = 0;
    (cart || []).forEach(function (it) { var g = (Number(it.comision) || 0) * (Number(it.cantidad) || 1); if (it.comisionMoneda === 'MN') mn += g; else usd += g; });
    return { mn: mn, usd: usd };
  }
  function pintarVenta(cart) {
    if (cart) CARRITO = cart;
    var box = document.getElementById('venta-tarjeta'); if (!box) return;
    var telIn = document.getElementById('venta-tel'), codIn = document.getElementById('venta-tj-cod');
    var cod = codIn ? codIn.value : '';
    var t = (cod && porCodigo(cod)) || porTel(telIn && telIn.value);
    if (!t || !CARRITO.length) { VENTA_TJ = null; aplicar = false; box.innerHTML = CARRITO.length ? '<div style="margin-top:8px;font-size:11.5px;color:var(--gray)">🎁 ¿Trae Tarjeta TiendaMax? <input id="venta-tj-cod" class="form-input" placeholder="Código TM-…" style="display:inline-block;width:140px;padding:4px 8px;font-size:12px" value="' + escH(cod) + '" oninput="tmTarjetaVentaPintar()"></div>' + (cod ? '<div style="font-size:11.5px;color:#ffb347;margin-top:4px">No encuentro esa tarjeta en este teléfono.</div>' : '') : ''; return; }
    var r = restantes(t);
    if (VENTA_TJ && VENTA_TJ !== t.c) aplicar = false;
    VENTA_TJ = t.c;
    if (r <= 0) { box.innerHTML = '<div style="margin-top:8px;font-size:12px;color:var(--gray)">🎁 ' + escH(t.n || 'Este cliente') + ' ya usó sus ' + USOS + ' descuentos (' + bonito(t.c) + ').</div>'; aplicar = false; return; }
    var cm = comisionMN(CARRITO), aviso = '';
    if (aplicar) {
      if (cm.usd > 0 && cm.mn === 0) aviso = 'Tu comisión aquí es en USD ($' + cm.usd.toFixed(2) + '); los 1000 MN se restan de tu ganancia en MN.';
      else if (cm.mn < DESCUENTO_MN) aviso = 'En esta venta tu comisión en MN es ' + cm.mn + ': con el descuento quedas en ' + (cm.mn - DESCUENTO_MN) + ' MN.';
      else aviso = 'Tu comisión en MN pasa de ' + cm.mn + ' a ' + (cm.mn - DESCUENTO_MN) + '.';
    }
    box.innerHTML = '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid ' + (aplicar ? '#FF6B35' : 'rgba(255,255,255,.12)') + ';background:' + (aplicar ? 'rgba(255,107,53,.12)' : 'rgba(255,255,255,.03)') + '">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:170px;font-size:12px;color:#fff">🎁 <b>' + escH(t.n || 'Cliente') + '</b> tiene Tarjeta <b>' + bonito(t.c) + '</b><br><span style="color:var(--gray)">Le quedan ' + r + ' de ' + USOS + ' descuentos de 1000 MN</span></div>' +
      '<button type="button" class="btn ' + (aplicar ? 'btn-primary' : 'btn-ghost') + '" style="padding:5px 11px;font-size:12px" onclick="tmTarjetaAplicar()">' + (aplicar ? '✅ −1000 MN aplicado' : 'Aplicar −1000 MN') + '</button></div>' +
      (aviso ? '<div style="font-size:11.5px;color:var(--gold,#c9a96e);margin-top:6px">' + escH(aviso) + ' Cobra al cliente 1000 MN menos.</div>' : '') + '</div>';
  }
  window.tmTarjetaVentaPintar = function (cart) { if (cart && !cart.length) { aplicar = false; VENTA_TJ = null; var ci = document.getElementById('venta-tj-cod'); if (ci) ci.value = ''; } pintarVenta(cart); };
  window.tmTarjetaAplicar = function () { aplicar = !aplicar; pintarVenta(); };
  window.tmTarjetaVenta = function () { return (aplicar && VENTA_TJ) ? { codigo: VENTA_TJ, mn: DESCUENTO_MN } : null; };
  // La venta desde una reserva (vale entregado): se pregunta, con la tarjeta delante.
  window.tmTarjetaPreguntar = function (telefono) {
    var t = porTel(telefono); if (!t || restantes(t) <= 0) return null;
    return confirm('🎁 ' + (t.n || 'Este cliente') + ' tiene Tarjeta ' + bonito(t.c) + ' (le quedan ' + restantes(t) + ' de ' + USOS + ').\n\n¿Le aplicas el descuento de 1000 MN en esta venta? Sale de tu comisión.')
      ? { codigo: t.c, mn: DESCUENTO_MN } : null;
  };
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'venta-tel') pintarVenta(); });

  // Clientes: la tarjeta de cada uno, para verla o reenviarla; o crearla a quien compró antes de que existieran.
  window.tmTarjetaChip = function (telefono) {
    var t = porTel(telefono), tl = tel(telefono); if (!tl) return '';
    if (!t) return '<br><button class="btn btn-ghost" style="padding:2px 8px;font-size:10.5px;margin-top:4px" onclick="tmTarjetaCrearPara(\'' + tl + '\')">🎁 Crear tarjeta</button>';
    var r = restantes(t);
    return '<br><button class="btn btn-ghost" style="padding:2px 8px;font-size:10.5px;margin-top:4px" onclick="tmTarjetaVer(\'' + t.c + '\')">🎁 ' + bonito(t.c) + ' · ' + r + '/' + USOS + '</button>';
  };
  window.tmTarjetaVer = function (c) { var t = porCodigo(c); if (t) hoja(t, false); };
  window.tmTarjetaCrearPara = function (tl) {
    var vs = (typeof cargarVentas === 'function' ? cargarVentas() : []).filter(function (v) { return tel(v.telefono) === tl; });
    var nombre = (vs.find(function (v) { return v.cliente; }) || {}).cliente || '';
    if (!confirm('¿Crear la Tarjeta TiendaMax de ' + (nombre || tl) + '?\n\n3 descuentos de 1000 MN en sus próximas compras, que salen de tu comisión.')) return;
    var t = crear(nombre, tl, vs.length ? vs[0].id : null);
    try { if (typeof window.renderClientes === 'function') window.renderClientes(); } catch (e) {}
    hoja(t, true);
  };

  // Para las pruebas y para el resto del panel.
  window.tmTarjetas = { leer: leer, porTel: porTel, porCodigo: porCodigo, restantes: restantes, crear: crear, dibujar: dibujar, textoEnvio: textoEnvio, fusionar: fusionar, sincronizar: sincronizar, USOS: USOS, DESCUENTO_MN: DESCUENTO_MN };
  setTimeout(function () { sincronizar().catch(function () {}); }, 4000);
})();
