/* 🎁 Tarjeta TiendaMax — solo en el panel (admin.html). Página pública: t.html.
 * Lo que trae a la tienda al amigo recomendado: js/referido.js.
 *
 * Al cerrar la PRIMERA compra de un cliente (con su WhatsApp) nace su tarjeta:
 * su nombre, un código al azar (TM + 6) y un QR a tiendamax.org/t?c=<código>.
 * Da hasta 1000 MN de descuento en sus 3 compras siguientes, y sale de la
 * comisión del gestor (lo decidió él, para atraer clientes). Reglas, todas del
 * dueño, y todas aquí y en ningún otro sitio:
 *
 *  · POR TRAMOS, mirando el total en USD (es como se vende): menos de $25 no
 *    hay descuento y la tarjeta NO se gasta; desde $25, 500 MN; desde $45,
 *    1000 MN. En lo barato (aceites, anticongelante) la comisión es 230–690 MN
 *    y un descuento fijo de 1000 dejaba al gestor perdiendo dinero; con los
 *    tramos el descuento nunca pasa de la mitad de su comisión.
 *  · EL DESCUENTO ES EN MN. Si el cliente paga en USD se le resta el
 *    equivalente del día; eso lo hace el gestor al cobrar, aquí no se convierte.
 *  · CADUCA (TM_TJ_DIAS, 90 días por defecto) y la campaña se puede apagar en
 *    ⚙️ Configuración: no es para siempre. Apagada, no nacen tarjetas nuevas
 *    ni premios por referidos; las que ya existen valen hasta su fecha.
 *  · REFERIDOS: desde su página, el cliente regala su enlace (/?ref=<código>).
 *    El amigo, en su PRIMERA compra de $25 o más, recibe el descuento de su
 *    tramo —que cuenta como el primero de SU tarjeta, nace con ella—, y quien
 *    lo recomendó gana +1 descuento, como mucho por 2 amigos (TM_TJ_EXTRA_MAX).
 *    Sin compra no hay premio: visitar la tienda no da nada.
 *  · Código al azar (no TM-0001…): uno que se adivina es un descuento que usa
 *    cualquiera. Sin 0/O/1/I/L: se dicta por teléfono.
 *  · Datos: /privado/tarjetas/<código> (solo la cuenta del dueño). Usos y
 *    premios son conjuntos {idVenta: ts} que solo crecen: dos teléfonos se
 *    fusionan uniéndolos. Una venta anulada (tm_ventas_anuladas) no cuenta ni
 *    como uso ni como premio. Espejo público /tarjetas/<código> = {r,n,e,x,f,g}
 *    (quedan, nombre de pila, emitida, caduca, acepta referidos, premios): ni
 *    teléfono ni compras. La regla deja leer un código, nunca la lista.
 * tests/tarjeta_check.mjs + test_tarjeta_cliente.py.
 */
(function () {
  'use strict';
  var LS = 'tm_tarjetas_v1', LS_CFG = 'tm_tarjeta_cfg';
  var USOS = 3, EXTRA_MAX = 2, DIAS_DEF = 90;
  var TRAMOS = [[45, 1000], [25, 500]];          // [desde USD, descuento MN], de mayor a menor
  var MINIMO = TRAMOS[TRAMOS.length - 1][0];
  var ALF = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var URL_T = 'https://tiendamax.org/t?c=', URL_REF = 'https://tiendamax.org/?ref=';

  function leer() { try { var o = JSON.parse(localStorage.getItem(LS) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
  function escribir(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function tel(t) { var d = String(t || '').replace(/\D/g, ''); return d.length >= 6 ? d : ''; }
  function pila(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bonito(c) { return c ? c.slice(0, 2) + '-' + c.slice(2) : ''; }
  function fechaCorta(ts) { try { return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function anuladas() { try { return (typeof ventasAnuladas === 'function') ? ventasAnuladas() : JSON.parse(localStorage.getItem('tm_ventas_anuladas') || '[]').map(String); } catch (e) { return []; } }
  function contar(set) { var an = anuladas(), n = 0; Object.keys(set || {}).forEach(function (v) { if (an.indexOf(String(v)) === -1) n++; }); return n; }
  function nuevoCodigo(existentes) {
    for (var k = 0; k < 50; k++) {
      var b = new Uint8Array(6), s = 'TM';
      (window.crypto || window.msCrypto).getRandomValues(b);
      for (var i = 0; i < 6; i++) s += ALF[b[i] % ALF.length];
      if (!existentes[s]) return s;
    }
    throw new Error('sin código');
  }

  /* ── La campaña: encendida o no, y cuántos días vale cada tarjeta ── */
  function cfg() {
    try { var o = JSON.parse(localStorage.getItem(LS_CFG) || 'null'); if (o && typeof o === 'object') return { on: o.on !== false, dias: Number(o.dias) > 0 ? Number(o.dias) : DIAS_DEF, ts: Number(o.ts) || 0 }; } catch (e) {}
    return { on: true, dias: DIAS_DEF, ts: 0 };
  }
  function guardarCfg(o) { try { localStorage.setItem(LS_CFG, JSON.stringify(o)); } catch (e) {} }

  /* ── Estado de una tarjeta ── */
  function vencida(t, ahora) { return !!(t && t.x && (ahora || Date.now()) > t.x); }
  function premios(t) { return Math.min(EXTRA_MAX, contar(t && t.extra)); }
  function restantes(t, ahora) {
    if (!t || vencida(t, ahora)) return 0;
    return Math.max(0, USOS + premios(t) - contar(t.usos));
  }
  function porTel(tl) {
    tl = tel(tl); if (!tl) return null;
    var o = leer(), mejor = null;
    Object.keys(o).forEach(function (c) { var t = o[c]; if (t && t.t === tl && (!mejor || (t.e || 0) > (mejor.e || 0))) mejor = t; });
    return mejor;
  }
  function codigoDe(texto) {
    var s = String(texto || '').trim(), m = /[?&](?:c|ref)=([0-9A-Za-z-]+)/.exec(s);
    var c = (m ? m[1] : s).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (/^[0-9A-Z]{6}$/.test(c)) c = 'TM' + c;
    return /^TM[2-9A-HJKMNP-Z]{6}$/.test(c) ? c : '';
  }
  function porCodigo(c) { c = codigoDe(c); return c ? (leer()[c] || null) : null; }
  function primeraCompra(tl) {
    tl = tel(tl); if (!tl) return false;
    var vs = (typeof cargarVentas === 'function') ? cargarVentas() : [];
    var an = anuladas();
    return !vs.some(function (v) { return tel(v.telefono) === tl && an.indexOf(String(v.id)) === -1; }) && !porTel(tl);
  }

  /* ── El tramo: cuánto se descuenta según el total en USD de la compra ── */
  function totalUSD(items) {
    var tasa = parseFloat(localStorage.getItem('tasaMN') || '0') || 0, usd = 0;
    (items || []).forEach(function (it) {
      var imp = (Number(it.precio) || 0) * (Number(it.cantidad || it.qty) || 1);
      // Un producto con precio fijo en MN solo se pasa a USD para saber el tramo; no se enseña ni se cobra así.
      if (it.moneda === 'MN') { if (tasa > 0) usd += imp / tasa; } else usd += imp;
    });
    return usd;
  }
  function descuentoDe(items) {
    var usd = totalUSD(items);
    for (var i = 0; i < TRAMOS.length; i++) if (usd >= TRAMOS[i][0]) return TRAMOS[i][1];
    return 0;
  }

  /* ── Crear, usar, premiar ── */
  function crear(nombre, telefono, ventaId, por) {
    var o = leer(), c = nuevoCodigo(o), ahora = Date.now(), cf = cfg();
    o[c] = { c: c, n: String(nombre || '').trim().slice(0, 60), t: tel(telefono), v: ventaId || null, e: ahora, x: ahora + cf.dias * 864e5, usos: {}, extra: {}, ts: ahora };
    if (por) o[c].por = por;
    escribir(o); subir(c);
    return o[c];
  }
  function marcar(c, campo, ventaId, extra) {
    var o = leer(); if (!o[c]) return null;
    o[c][campo] = o[c][campo] || {}; o[c][campo][String(ventaId)] = Date.now();
    if (extra) Object.assign(o[c], extra);
    o[c].ts = Date.now();
    escribir(o); subir(c);
    return o[c];
  }

  /* ── Cuenta (Firebase) ── */
  // Cuántas compras lleva ese WhatsApp (sin las anuladas): las bolsitas 🛍️ que ve en
  // su tarjeta y en la tienda. Solo el número: ni productos ni precios, el código
  // de la tarjeta lo puede tener alguien más.
  function compras(t) {
    var tl = t && t.t; if (!tl) return 0;
    var an = anuladas();
    return ((typeof cargarVentas === 'function') ? cargarVentas() : []).filter(function (v) { return tel(v.telefono) === tl && an.indexOf(String(v.id)) === -1; }).length;
  }
  function publico(t) {
    var cf = cfg();
    return { r: restantes(t), n: pila(t.n).slice(0, 30), e: t.e, x: t.x || 0, f: (cf.on && !vencida(t)) ? 1 : 0, g: premios(t), k: Math.min(999, compras(t)) };
  }
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
      var base = (y.ts || 0) > (x.ts || 0) ? y : x, r = Object.assign({}, base);
      ['usos', 'extra'].forEach(function (k) { r[k] = Object.assign({}, x[k] || {}, y[k] || {}); });
      o[c] = r;
    });
    return o;
  }
  async function sincronizar() {
    if (typeof TMAuth === 'undefined' || !TMAuth.fetchPrivado) return;
    var cc = await TMAuth.fetchPrivado('/privado/tarjeta_config.json');
    if (cc.ok && cc.dato && (Number(cc.dato.ts) || 0) > cfg().ts) guardarCfg(cc.dato);
    else if (cc.ok && cfg().ts > (Number(cc.dato && cc.dato.ts) || 0)) TMAuth.fetchPrivado('/privado/tarjeta_config.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg()) });
    var r = await TMAuth.fetchPrivado('/privado/tarjetas.json');
    if (!r.ok) return;
    var remoto = (r.dato && typeof r.dato === 'object') ? r.dato : {}, f = fusionar(remoto, leer());
    escribir(f);
    // Lo que la cuenta no tiene igual (una subida que falló, una venta sin red) se sube.
    for (var c in f) { if (JSON.stringify(f[c]) !== JSON.stringify(remoto[c])) await subir(c); }
    try { if (typeof window.renderClientes === 'function') window.renderClientes(); } catch (e) {}
    pintarCfg();
  }

  /* ── La imagen de la tarjeta (canvas) ── */
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function cargarImg(src) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; }); }
  async function dibujar(canvas, t) {
    var W = 1012, H = 638, g = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    try { await Promise.all([document.fonts.load('700 60px "Playfair Display"'), document.fonts.load('italic 700 60px "Playfair Display"'), document.fonts.load('600 30px "DM Sans"')]); } catch (e) {}
    var serif = '"Playfair Display", Georgia, serif', sans = '"DM Sans", system-ui, sans-serif', mono = '"JetBrains Mono", ui-monospace, monospace';
    rr(g, 0, 0, W, H, 44); g.save(); g.clip();
    g.fillStyle = '#0F0E0D'; g.fillRect(0, 0, W, H);
    var rg = g.createRadialGradient(W * .92, H * 1.05, 10, W * .92, H * 1.05, W * .75);
    rg.addColorStop(0, 'rgba(255,107,53,.30)'); rg.addColorStop(1, 'rgba(255,107,53,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.restore(); rr(g, 1.5, 1.5, W - 3, H - 3, 43); g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 3; g.stroke();
    var logo = await cargarImg('/iconos/icon-192.png');
    if (logo) { g.save(); rr(g, 64, 56, 84, 84, 20); g.clip(); g.drawImage(logo, 64, 56, 84, 84); g.restore(); }
    g.textBaseline = 'alphabetic'; g.font = '700 46px ' + serif; g.fillStyle = '#F5EFE6'; g.fillText('Tienda', 172, 112);
    var wT = g.measureText('Tienda').width; g.fillStyle = '#FF6B35'; g.fillText('Max', 172 + wT, 112);
    g.font = '600 18px ' + sans; g.fillStyle = '#9C9389'; g.fillText('T A R J E T A   D E   C L I E N T E', 174, 140);
    // Nombre (encoge hasta caber, nunca se corta).
    var nombre = t.n || 'Cliente TiendaMax', tam = 60;
    do { g.font = '700 ' + tam + 'px ' + serif; tam -= 2; } while (g.measureText(nombre).width > 560 && tam > 30);
    g.fillStyle = '#F5EFE6'; g.fillText(nombre, 64, 252);
    // La oferta: «hasta 1000 MN» en grande, los tramos debajo, sin letra pequeña escondida.
    g.font = '600 26px ' + sans; g.fillStyle = '#C9C0B5'; g.fillText('Hasta', 64, 330);
    var wH = g.measureText('Hasta ').width;
    g.font = 'italic 700 70px ' + serif; g.fillStyle = '#FF6B35'; g.fillText('1000 MN', 64 + wH, 336);
    g.font = '500 25px ' + sans; g.fillStyle = '#F5EFE6'; g.fillText('de descuento en tus próximas ' + USOS + ' compras', 64, 380);
    g.font = '600 21px ' + sans; g.fillStyle = '#C9A96E';
    g.fillText('Desde $' + TRAMOS[1][0] + ': ' + TRAMOS[1][1] + ' MN  ·  Desde $' + TRAMOS[0][0] + ': ' + TRAMOS[0][1] + ' MN', 64, 420);
    for (var i = 0; i < USOS; i++) {
      var cx = 84 + i * 62, cy = 468;
      g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fillStyle = 'rgba(255,107,53,.16)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#FF6B35'; g.stroke();
      g.font = '700 20px ' + sans; g.fillStyle = '#FF6B35'; g.textAlign = 'center'; g.fillText(String(i + 1), cx, cy + 7); g.textAlign = 'left';
    }
    if (t.x) { g.font = '500 19px ' + sans; g.fillStyle = '#9C9389'; g.fillText('Válida hasta el ' + fechaCorta(t.x), 84 + USOS * 62, 475); }
    g.font = '600 16px ' + sans; g.fillStyle = '#9C9389'; g.fillText('TU CÓDIGO', 64, 548);
    g.font = '700 40px ' + mono; g.fillStyle = '#F5EFE6';
    var cod = bonito(t.c), x = 64; for (var k = 0; k < cod.length; k++) { g.fillText(cod[k], x, 592); x += g.measureText(cod[k]).width + 6; }
    var q = (typeof tmQR === 'function') ? tmQR(URL_T + t.c) : null, qs = 300, qx = W - 64 - qs, qy = 170;
    rr(g, qx, qy, qs, qs, 28); g.fillStyle = '#F7F0DD'; g.fill();
    if (q) {
      var m = (qs - 44) / q.n; g.fillStyle = '#111';
      for (var f = 0; f < q.n; f++) for (var c = 0; c < q.n; c++) if (q.get(f, c)) g.fillRect(Math.round(qx + 22 + c * m), Math.round(qy + 22 + f * m), Math.ceil(m), Math.ceil(m));
    }
    g.font = '600 19px ' + sans; g.fillStyle = '#9C9389'; g.textAlign = 'center';
    g.fillText('Escanéala: tus descuentos y', qx + qs / 2, qy + qs + 34);
    g.fillText('regalos para tus amigos', qx + qs / 2, qy + qs + 58);
    g.font = '500 15px ' + sans; g.fillStyle = '#6F675E';
    g.fillText('Personal · no canjeable por efectivo', qx + qs / 2, qy + qs + 84);
    g.textAlign = 'left';
    canvas.dataset.tmTarjeta = JSON.stringify({ c: t.c, qr: q ? q.n : 0 });
    return canvas;
  }

  function textoEnvio(t) {
    var n = pila(t.n);
    return '¡Gracias por tu compra' + (n ? ', ' + n : '') + '! 🎁\n' +
      'Te regalo tu *Tarjeta TiendaMax*: hasta 1000 MN de descuento en tus próximas ' + USOS + ' compras ' +
      '(desde $' + TRAMOS[1][0] + ': ' + TRAMOS[1][1] + ' MN · desde $' + TRAMOS[0][0] + ': ' + TRAMOS[0][1] + ' MN)' +
      (t.x ? ', hasta el ' + fechaCorta(t.x) : '') + '.\n\n' +
      'Al pedir, solo dime tu código: *' + bonito(t.c) + '*\n' +
      '👉 ' + URL_T + t.c + '\n\n' +
      'Si se la recomiendas a un amigo y compra, te sumo un descuento más. Mándale este enlace:\n' +
      '👉 ' + URL_REF + t.c;
  }
  function textoAvisoReferido(ref, amigo) {
    var n = pila(ref.n), a = pila(amigo && amigo.n);
    return '¡Hola' + (n ? ' ' + n : '') + '! 🎁 ' + (a ? a : 'Tu amigo') + ' ya compró con tu recomendación.\n' +
      'Te sumé un descuento más a tu Tarjeta TiendaMax: ahora te quedan ' + restantes(ref) + '.\n👉 ' + URL_T + ref.c;
  }

  /* ── Hoja: ver, enviar y guardar la tarjeta ── */
  async function hoja(t, recienCreada) {
    var prev = document.getElementById('tarjeta-hoja'); if (prev) prev.remove();
    var d = document.createElement('div'); d.id = 'tarjeta-hoja';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:12px';
    var r = restantes(t), ref = t.por ? leer()[t.por] : null;
    d.innerHTML = '<div style="width:100%;max-width:480px;background:var(--card,#15151f);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:20px;padding:18px;color:var(--text,#fff);max-height:94vh;overflow:auto">' +
      '<h3 style="margin:0 0 4px">🎁 ' + (recienCreada ? 'Tarjeta TiendaMax creada' : 'Tarjeta TiendaMax') + '</h3>' +
      '<p style="font-size:12.5px;color:var(--gray,#999);margin:0 0 12px">' + escH(t.n || 'Cliente') + ' · <b style="color:#fff">' + bonito(t.c) + '</b> · ' +
      (vencida(t) ? '<b style="color:#ffb347">caducó el ' + fechaCorta(t.x) + '</b>' : 'le quedan <b style="color:#fff">' + r + '</b> descuento' + (r === 1 ? '' : 's') + (t.x ? ' · hasta el ' + fechaCorta(t.x) : '')) +
      (premios(t) ? ' · ' + premios(t) + ' por amigos' : '') + '. Sale de tu comisión.</p>' +
      '<canvas id="tarjeta-canvas" style="width:100%;height:auto;border-radius:14px;display:block;background:#0F0E0D"></canvas>' +
      '<p id="tarjeta-est" style="font-size:12px;color:var(--gray,#999);min-height:16px;margin:8px 0 0"></p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">' +
      (t.t ? '<button class="btn btn-primary" id="tarjeta-enviar">📤 Enviársela por WhatsApp</button>' : '') +
      (ref && ref.t ? '<button class="btn btn-ghost" id="tarjeta-avisar">💬 Avisar a ' + escH(pila(ref.n) || 'quien lo recomendó') + ' de su premio</button>' : '') +
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
    var av = d.querySelector('#tarjeta-avisar');
    if (av) av.onclick = function () { window.open('https://wa.me/' + ref.t + '?text=' + encodeURIComponent(textoAvisoReferido(leer()[ref.c] || ref, t)), '_blank', 'noopener,noreferrer'); est.textContent = 'Se abrió el chat de ' + (pila(ref.n) || 'quien lo recomendó') + '.'; };
    var env = d.querySelector('#tarjeta-enviar');
    if (env) env.onclick = async function () {
      var b = await png(), texto = textoEnvio(t);
      var f = (typeof File === 'function') ? new File([b], nombreArchivo, { type: 'image/png' }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], text: texto }); est.textContent = '✅ Enviada.'; return; }
        catch (e) { if (e && e.name === 'AbortError') { est.textContent = 'Cancelado: no se envió.'; return; } }
      }
      descargar(b);
      window.open('https://wa.me/' + t.t + '?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
      est.textContent = 'Se abrió su chat con el mensaje; adjunta la imagen que se acaba de guardar.';
    };
  }

  /* ── La venta ── */
  var orig = window.registrarVentaPedido;
  if (typeof orig === 'function') {
    window.registrarVentaPedido = function (items, cliente, opts) {
      opts = Object.assign({}, opts || {});
      var desc = descuentoDe(items), tlCli = tel(cliente && cliente.tel), nuevo = null, refT = null;
      var pedido = opts.tarjeta; delete opts.tarjeta;
      // Todo se comprueba AQUÍ, no en quien llama: existe, le quedan, no caducó y la compra llega al tramo.
      if (pedido && pedido.ref) {
        refT = porCodigo(pedido.ref);
        if (refT && cfg().on && !vencida(refT) && desc > 0 && tlCli && refT.t !== tlCli && primeraCompra(tlCli)) {
          nuevo = crear(cliente && cliente.nombre, tlCli, null, refT.c);
          opts.tarjeta = { codigo: nuevo.c, mn: desc };
        } else refT = null;
      } else if (pedido && pedido.codigo) {
        var t = porCodigo(pedido.codigo);
        if (t && restantes(t) > 0 && desc > 0) opts.tarjeta = { codigo: t.c, mn: desc };
      }
      var v = orig.call(this, items, cliente, opts);
      if (!v) { if (nuevo) { var o0 = leer(); delete o0[nuevo.c]; escribir(o0); } return v; }
      if (nuevo) {
        // El amigo recomendado: su primer descuento ya va en esta venta, y quien lo trajo gana uno más.
        marcar(nuevo.c, 'usos', v.id, { v: v.id });
        marcar(refT.c, 'extra', v.id);
        VENTA_TJ = null; ESC = ''; aplicar = false;
        setTimeout(function () { hoja(leer()[nuevo.c], true); }, 300);
      } else if (v.tarjeta) {
        marcar(v.tarjeta, 'usos', v.id); VENTA_TJ = null; ESC = ''; aplicar = false;
      } else if (cfg().on && v.telefono && primeraCompraSalvo(v.telefono, v.id)) {
        var tn = crear(v.cliente, v.telefono, v.id);
        setTimeout(function () { hoja(tn, true); }, 300);
      } else if (v.telefono) {
        // Compra sin usar la tarjeta: su tarjeta suma una bolsita igual.
        var tc = porTel(v.telefono); if (tc) subir(tc.c);
      }
      return v;
    };
  }
  // ¿Esta venta es la primera de ese WhatsApp? (la propia venta ya está guardada)
  function primeraCompraSalvo(tl, id) {
    tl = tel(tl); if (!tl || porTel(tl)) return false;
    var an = anuladas();
    return !((typeof cargarVentas === 'function') ? cargarVentas() : []).some(function (v) { return String(v.id) !== String(id) && tel(v.telefono) === tl && an.indexOf(String(v.id)) === -1; });
  }

  /* ── Formulario de venta ── */
  var VENTA_TJ = null, CARRITO = [], aplicar = false, ESC = '', REF = '';
  function comision(cart) {
    var mn = 0, usd = 0;
    (cart || []).forEach(function (it) { var g = (Number(it.comision) || 0) * (Number(it.cantidad) || 1); if (it.comisionMoneda === 'MN') mn += g; else usd += g; });
    return { mn: mn, usd: usd };
  }
  function avisoComision(desc) {
    var cm = comision(CARRITO);
    if (cm.mn > 0) return 'Tu comisión en MN pasa de ' + cm.mn + ' a ' + (cm.mn - desc) + '.';
    return 'Tu comisión aquí es en USD ($' + cm.usd.toFixed(2) + '); los ' + desc + ' MN se restan de tu ganancia en MN.';
  }
  function cajaTramo(desc) {
    var usd = totalUSD(CARRITO);
    return desc > 0 ? 'Compra de $' + usd.toFixed(2) + ' → <b>−' + desc + ' MN</b>'
      : 'Compra de $' + usd.toFixed(2) + ': no llega a $' + MINIMO + ', así que no hay descuento y la tarjeta no se gasta.';
  }
  var BTN_ESC = '<button type="button" class="btn btn-ghost" style="padding:5px 10px;font-size:12px" onclick="tmTarjetaEscanear()">📷 Escanear tarjeta</button>';
  function pintarVenta(cart) {
    if (cart) CARRITO = cart;
    var box = document.getElementById('venta-tarjeta'); if (!box) return;
    if (!CARRITO.length) { box.innerHTML = ''; VENTA_TJ = null; aplicar = false; return; }
    var telIn = document.getElementById('venta-tel'), codIn = document.getElementById('venta-tj-cod');
    var cod = codIn ? codIn.value : '', tlCli = tel(telIn && telIn.value), desc = descuentoDe(CARRITO);
    if (cod) { var cc = codigoDe(cod), tc = cc && leer()[cc]; if (tc && tlCli && tc.t !== tlCli && primeraCompra(tlCli)) { REF = cc; ESC = ''; } else { ESC = cc; REF = ''; } }
    var refT = REF ? leer()[REF] : null;
    // Cliente nuevo que viene recomendado.
    if (refT && tlCli && primeraCompra(tlCli)) {
      var vale = cfg().on && !vencida(refT) && refT.t !== tlCli;
      VENTA_TJ = vale && desc > 0 ? 'ref:' + refT.c : null;
      if (!VENTA_TJ) aplicar = false;
      box.innerHTML = '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid ' + (aplicar ? '#FF6B35' : 'rgba(255,255,255,.12)') + ';background:' + (aplicar ? 'rgba(255,107,53,.12)' : 'rgba(255,255,255,.03)') + '">' +
        '<div style="font-size:12px;color:#fff">🤝 Recomendado por <b>' + escH(refT.n || 'un cliente') + '</b> (' + bonito(refT.c) + ')</div>' +
        '<div style="font-size:11.5px;color:var(--gray);margin-top:3px">' + (vale ? cajaTramo(desc) + (desc > 0 ? ' en su primera compra; nace su tarjeta con ese uso hecho y ' + escH(pila(refT.n) || 'quien lo recomendó') + ' gana un descuento más' + (premios(refT) >= EXTRA_MAX ? ' (ya llegó al tope de ' + EXTRA_MAX + ': no suma)' : '') + '.' : '') : (vencida(refT) ? 'Esa tarjeta caducó.' : 'La campaña está apagada en ⚙️ Configuración.')) + '</div>' +
        (VENTA_TJ ? '<button type="button" class="btn ' + (aplicar ? 'btn-primary' : 'btn-ghost') + '" style="padding:5px 11px;font-size:12px;margin-top:7px" onclick="tmTarjetaAplicar()">' + (aplicar ? '✅ −' + desc + ' MN aplicado' : 'Aplicar −' + desc + ' MN') + '</button>' : '') +
        (aplicar ? '<div style="font-size:11.5px;color:var(--gold,#c9a96e);margin-top:6px">' + escH(avisoComision(desc)) + ' Cobra al cliente ' + desc + ' MN menos.</div>' : '') + '</div>';
      return;
    }
    var t = (ESC && leer()[ESC]) || porTel(tlCli);
    if (!t) {
      VENTA_TJ = null; aplicar = false;
      var esNuevo = tlCli && primeraCompra(tlCli);
      box.innerHTML = '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--gray)">🎁 ' +
        (esNuevo ? '¿Lo recomendó alguien? Escanea la tarjeta de quien lo envió o escribe su código' : '¿Trae Tarjeta TiendaMax?') + ' ' + BTN_ESC +
        '<input id="venta-tj-cod" class="form-input" placeholder="Código TM-…" style="width:140px;padding:4px 8px;font-size:12px" value="' + escH(cod) + '" oninput="tmTarjetaVentaPintar()"></div>' +
        (cod && !codigoDe(cod) ? '<div style="font-size:11.5px;color:#ffb347;margin-top:4px">Ese código no tiene la forma TM-XXXXXX.</div>' : cod ? '<div style="font-size:11.5px;color:#ffb347;margin-top:4px">No encuentro esa tarjeta.</div>' : '');
      return;
    }
    var r = restantes(t);
    if (VENTA_TJ && VENTA_TJ !== t.c) aplicar = false;
    VENTA_TJ = t.c;
    if (r <= 0) { aplicar = false; box.innerHTML = '<div style="margin-top:8px;font-size:12px;color:var(--gray)">🎁 ' + escH(t.n || 'Este cliente') + (vencida(t) ? ': su tarjeta ' + bonito(t.c) + ' caducó el ' + fechaCorta(t.x) + '.' : ' ya usó todos sus descuentos (' + bonito(t.c) + ').') + '</div>'; return; }
    if (desc <= 0) aplicar = false;
    box.innerHTML = '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid ' + (aplicar ? '#FF6B35' : 'rgba(255,255,255,.12)') + ';background:' + (aplicar ? 'rgba(255,107,53,.12)' : 'rgba(255,255,255,.03)') + '">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:170px;font-size:12px;color:#fff">🎁 <b>' + escH(t.n || 'Cliente') + '</b> tiene Tarjeta <b>' + bonito(t.c) + '</b><br><span style="color:var(--gray)">Le quedan ' + r + ' descuento' + (r === 1 ? '' : 's') + (t.x ? ' · hasta el ' + fechaCorta(t.x) : '') + '</span></div>' +
      (desc > 0 ? '<button type="button" class="btn ' + (aplicar ? 'btn-primary' : 'btn-ghost') + '" style="padding:5px 11px;font-size:12px" onclick="tmTarjetaAplicar()">' + (aplicar ? '✅ −' + desc + ' MN aplicado' : 'Aplicar −' + desc + ' MN') + '</button>' : '') + '</div>' +
      '<div style="font-size:11.5px;color:var(--gray);margin-top:6px">' + cajaTramo(desc) + '</div>' +
      (aplicar ? '<div style="font-size:11.5px;color:var(--gold,#c9a96e);margin-top:4px">' + escH(avisoComision(desc)) + ' Cobra al cliente ' + desc + ' MN menos.</div>' : '') + '</div>';
  }
  window.tmTarjetaVentaPintar = function (cart) { if (cart && !cart.length) { aplicar = false; VENTA_TJ = null; ESC = ''; REF = ''; } pintarVenta(cart); };
  window.tmTarjetaAplicar = function () { aplicar = !aplicar; pintarVenta(); };
  window.tmTarjetaVenta = function () {
    if (!aplicar || !VENTA_TJ) return null;
    return VENTA_TJ.indexOf('ref:') === 0 ? { ref: VENTA_TJ.slice(4) } : { codigo: VENTA_TJ };
  };
  // La venta desde una reserva (vale entregado): se pregunta, con la tarjeta y el tramo delante.
  window.tmTarjetaPreguntar = function (telefono, items, codigo) {
    var desc = descuentoDe(items), c = codigoDe(codigo), tlCli = tel(telefono);
    // Una tarjeta escaneada en la reserva: es la del cliente, o —si el WhatsApp es
    // nuevo y la tarjeta es de otra persona— la de quien lo recomendó.
    if (c) {
      var te = leer()[c];
      if (!te || desc <= 0) return null;
      if (tlCli && te.t !== tlCli && primeraCompra(tlCli)) {
        if (!cfg().on || vencida(te)) return null;
        return confirm('🤝 Recomendado por ' + (te.n || 'un cliente') + ' (tarjeta ' + bonito(c) + ').\n\nSu primera compra lleva ' + desc + ' MN de descuento y ' + (pila(te.n) || 'quien lo recomendó') + ' gana un uso. Sale de tu comisión.\n\n¿Aplicar?')
          ? { ref: c } : null;
      }
      if (restantes(te) <= 0) return null;
      return confirm('🎁 ' + (te.n || 'Este cliente') + ' tiene Tarjeta ' + bonito(c) + ' (le quedan ' + restantes(te) + ').\n\n¿Le aplicas ' + desc + ' MN de descuento en esta venta? Sale de tu comisión.')
        ? { codigo: c } : null;
    }
    var t = porTel(telefono);
    if (!t || restantes(t) <= 0 || desc <= 0) return null;
    return confirm('🎁 ' + (t.n || 'Este cliente') + ' tiene Tarjeta ' + bonito(t.c) + ' (le quedan ' + restantes(t) + ').\n\n¿Le aplicas ' + desc + ' MN de descuento en esta venta? Sale de tu comisión.')
      ? { codigo: t.c } : null;
  };
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'venta-tel') pintarVenta(); });

  /* ── Escanear la tarjeta ──
     Al entregar (se paga al recibir) la tarjeta está delante: un escaneo la
     aplica y pone nombre y WhatsApp si faltaban. Si el formulario ya tiene el
     WhatsApp de un cliente NUEVO y la tarjeta es de otra persona, es la de
     quien lo recomendó. «Desde una foto» lee la que mandan por WhatsApp.
     Lector del navegador (BarcodeDetector, Chrome en Android); sin él
     (iPhone), se dice y se escribe el código. */
  async function aplicarEscaneada(c) {
    var t = leer()[c];
    if (!t) { try { await sincronizar(); } catch (e) {} t = leer()[c]; }   // creada en otro teléfono
    if (!t) return { ok: false, msg: 'Esa tarjeta (' + bonito(c) + ') no está en tu cuenta.' };
    var telIn = document.getElementById('venta-tel'), nomIn = document.getElementById('venta-cliente'), tlCli = tel(telIn && telIn.value);
    if (tlCli && t.t !== tlCli && primeraCompra(tlCli)) { REF = c; ESC = ''; aplicar = cfg().on && !vencida(t); pintarVenta(); return { ok: true, t: t, ref: true }; }
    if (restantes(t) <= 0) return { ok: false, msg: (t.n || 'Ese cliente') + (vencida(t) ? ': su tarjeta caducó.' : ' ya usó todos sus descuentos.') };
    ESC = c; REF = '';
    if (telIn && !tlCli && t.t) telIn.value = t.t;
    if (nomIn && !nomIn.value.trim() && t.n) nomIn.value = t.n;
    aplicar = descuentoDe(CARRITO) > 0; pintarVenta();
    return { ok: true, t: t };
  }
  window.tmTarjetaCodigoDe = codigoDe;
  /* Comprueba un código escaneado sin tocar el formulario de venta (lo usa Reservas). */
  async function validarEscaneada(c) {
    var t = leer()[c];
    // Con un tope: en datos lentos la cuenta puede no contestar y el escáner no se queda esperando.
    if (!t) { try { await Promise.race([sincronizar(), new Promise(function (r) { setTimeout(r, 4000); })]); } catch (e) {} t = leer()[c]; }
    if (!t) return { ok: false, msg: 'Esa tarjeta (' + bonito(c) + ') no está en tu cuenta.' };
    if (restantes(t) <= 0) return { ok: false, msg: (t.n || 'Ese cliente') + (vencida(t) ? ': su tarjeta caducó.' : ' ya usó todos sus descuentos.') };
    return { ok: true, t: t, toast: '🎁 Tarjeta de ' + (t.n || 'cliente') };
  }
  window.tmTarjetaValidar = validarEscaneada;
  /* opts.alCodigo(c) → {ok,msg,t,toast}: en vez de rellenar la venta, entrega el código. */
  window.tmTarjetaEscanear = async function (opts) {
    var alCodigo = opts && typeof opts.alCodigo === 'function' ? opts.alCodigo : null;
    var prev = document.getElementById('tarjeta-escaner'); if (prev) prev.remove();
    var d = document.createElement('div'); d.id = 'tarjeta-escaner';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:14px';
    d.innerHTML = '<div style="width:100%;max-width:420px;background:var(--card,#15151f);border-radius:20px;padding:16px;color:var(--text,#fff)">' +
      '<h3 style="margin:0 0 10px">📷 Escanear tarjeta</h3>' +
      '<div style="position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:1"><video id="tje-video" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>' +
      '<div style="position:absolute;inset:18%;border:3px solid #FF6B35;border-radius:18px;box-shadow:0 0 0 999px rgba(0,0,0,.35)"></div></div>' +
      '<p id="tje-est" style="font-size:12.5px;color:var(--gray,#aaa);margin:10px 0 0;min-height:18px">Apunta al QR de la tarjeta.</p>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><label class="btn btn-ghost" style="flex:1;text-align:center;cursor:pointer">🖼️ Desde una foto<input id="tje-foto" type="file" accept="image/*" hidden></label>' +
      '<button class="btn btn-ghost" style="flex:1" id="tje-cerrar">Cancelar</button></div></div>';
    document.body.appendChild(d);
    var est = d.querySelector('#tje-est'), video = d.querySelector('#tje-video'), stream = null, vivo = true;
    function cerrar() { vivo = false; if (stream) stream.getTracks().forEach(function (x) { x.stop(); }); d.remove(); }
    d.querySelector('#tje-cerrar').onclick = cerrar;
    var lector = null;
    try { if ('BarcodeDetector' in window) lector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
    async function resultado(valor) {
      var c = codigoDe(valor);
      if (!c) { est.textContent = 'Ese QR no es de una Tarjeta TiendaMax.'; return false; }
      est.textContent = 'Tarjeta ' + bonito(c) + '…';
      var r = alCodigo ? await alCodigo(c) : await aplicarEscaneada(c);
      if (!r.ok) { est.textContent = r.msg; return false; }
      cerrar();
      if (alCodigo) { if (typeof showToast === 'function' && r.toast) showToast(r.toast, ''); return true; }
      if (typeof showToast === 'function') showToast(r.ref ? '🤝 Recomendado por ' + (pila(r.t.n) || 'un cliente') : '🎁 Tarjeta de ' + (r.t.n || 'cliente'), r.ref ? 'Su descuento de bienvenida queda aplicado' : (descuentoDe(CARRITO) > 0 ? 'Descuento aplicado' : 'Esta compra no llega a $' + MINIMO + ': no se gasta'));
      return true;
    }
    d.querySelector('#tje-foto').onchange = async function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      if (!lector) { est.textContent = 'Este navegador no lee QR: escribe el código de la tarjeta (las 6 letras tras TM-).'; return; }
      try {
        var bmp = await createImageBitmap(f), cod = await lector.detect(bmp);
        if (!cod.length) { est.textContent = 'No veo ningún QR en esa foto. Prueba con otra más cerca.'; return; }
        await resultado(cod[0].rawValue);
      } catch (err) { est.textContent = 'No pude leer esa foto.'; }
    };
    if (!lector) { est.textContent = 'Este navegador no lee QR (pasa en iPhone). Escribe el código de la tarjeta: las 6 letras tras TM-.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!vivo) { stream.getTracks().forEach(function (x) { x.stop(); }); return; }
      video.srcObject = stream; await video.play();
    } catch (e) { est.textContent = 'Sin acceso a la cámara. Usa «Desde una foto» o escribe el código.'; return; }
    (async function bucle() {
      while (vivo) {
        try { var cs = await lector.detect(video); if (cs.length && await resultado(cs[0].rawValue)) return; } catch (e) {}
        await new Promise(function (r) { setTimeout(r, 300); });
      }
    })();
  };

  /* ── Clientes: la tarjeta de cada uno (ficha en Clientes, historial de ventas) ── */
  window.tmTarjetaVer = function (c) { var t = porCodigo(c); if (t) hoja(t, false); };
  // Compartir de un toque: la imagen y el mensaje a la hoja de compartir del
  // móvil. Si el navegador no deja (PC, o tardó en dibujar y perdió el toque),
  // abre la hoja de la tarjeta, que tiene «Enviar por WhatsApp» y «Guardar».
  window.tmTarjetaCompartir = async function (c) {
    var t = porCodigo(c); if (!t) return;
    try {
      var cv = document.createElement('canvas'); await dibujar(cv, t);
      var b = await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
      var f = (typeof File === 'function') ? new File([b], 'tarjeta-tiendamax-' + t.c + '.png', { type: 'image/png' }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], text: textoEnvio(t) }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
    } catch (e) {}
    hoja(t, false);
  };
  // El bloque de la tarjeta dentro de la ficha de cada cliente (Clientes).
  window.tmTarjetaBloque = function (telefono) {
    var tl = tel(telefono); if (!tl) return '';
    var t = porTel(tl);
    if (!t) {
      if (!cfg().on) return '';
      return '<div class="cli-tj cli-tj-nueva"><div class="cli-tj-txt"><b>🎁 Sin tarjeta todavía</b><span>Hasta 1000 MN en sus próximas ' + USOS + ' compras desde $' + MINIMO + '</span></div>' +
        '<button class="btn btn-ghost" onclick="tmTarjetaCrearPara(\'' + tl + '\')">Crear tarjeta</button></div>';
    }
    var r = restantes(t), refs = contar(t.extra), v = vencida(t);
    var estado = v ? 'Caducó el ' + fechaCorta(t.x) : (r + ' descuento' + (r === 1 ? '' : 's') + ' · hasta el ' + fechaCorta(t.x)) + (refs ? ' · 🤝 ' + refs + ' traído' + (refs === 1 ? '' : 's') : '');
    return '<div class="cli-tj' + (v ? ' cli-tj-vieja' : '') + '"><div class="cli-tj-txt"><b>🎁 ' + bonito(t.c) + '</b><span>' + escH(estado) + '</span></div>' +
      '<div class="cli-tj-acc"><button class="btn btn-primary" onclick="tmTarjetaCompartir(\'' + t.c + '\')">📤 Compartir</button>' +
      '<button class="btn btn-ghost" onclick="tmTarjetaVer(\'' + t.c + '\')">Ver</button></div></div>';
  };
  // La tarjeta en el historial de ventas: la venta que la creó y la que la usó.
  // Solo un código con forma de código se pinta: la venta puede venir de
  // Firebase, y lo que se pinta con innerHTML no puede llevar marcado ajeno.
  var COD_RE = /^TM[0-9A-Z]{6}$/;
  window.tmTarjetaDeVenta = function (venta) {
    if (!venta) return '';
    if (venta.tarjeta && !COD_RE.test(String(venta.tarjeta))) venta = Object.assign({}, venta, { tarjeta: '' });
    var o = leer(), h = [];
    Object.keys(o).forEach(function (c) { var t = o[c]; if (COD_RE.test(c) && t && String(t.v) === String(venta.id)) h.push('<button class="tj-tag" onclick="tmTarjetaVer(\'' + c + '\')">🎁 Tarjeta ' + bonito(c) + ' creada</button>'); });
    if (venta.tarjeta && o[venta.tarjeta] && String(o[venta.tarjeta].v) !== String(venta.id)) h.push('<button class="tj-tag" onclick="tmTarjetaVer(\'' + venta.tarjeta + '\')">🎁 −' + (Number(venta.descTarjetaMN) || 0) + ' MN · ' + bonito(venta.tarjeta) + '</button>');
    else if (venta.tarjeta && !o[venta.tarjeta]) h.push('<span class="tj-tag">🎁 −' + (Number(venta.descTarjetaMN) || 0) + ' MN · ' + bonito(venta.tarjeta) + '</span>');
    return h.join('');
  };
  window.tmTarjetaCrearPara = function (tl) {
    var vs = (typeof cargarVentas === 'function' ? cargarVentas() : []).filter(function (v) { return tel(v.telefono) === tl; });
    var nombre = (vs.find(function (v) { return v.cliente; }) || {}).cliente || '';
    if (!confirm('¿Crear la Tarjeta TiendaMax de ' + (nombre || tl) + '?\n\nHasta 1000 MN de descuento en sus próximas ' + USOS + ' compras desde $' + MINIMO + ', durante ' + cfg().dias + ' días. Sale de tu comisión.')) return;
    var t = crear(nombre, tl, vs.length ? vs[0].id : null);
    try { if (typeof window.renderClientes === 'function') window.renderClientes(); } catch (e) {}
    hoja(t, true);
  };

  /* La tienda (Max) solo anuncia la tarjeta con la campaña encendida, y no
     puede leer /privado: se publica {on, ts} en config.json, cambiando SOLO
     esa clave tras releer el fichero (como el tema y las zonas de envío). */
  async function publicarCampana(n) {
    var u = localStorage.getItem('githubUser'), r = localStorage.getItem('githubRepo'), t = localStorage.getItem('githubToken');
    if (!u || !r || !t || typeof subirArchivoAGitHub !== 'function' || typeof _tmLeerJsonRepoFresco !== 'function') return false;
    try {
      var c = await _tmLeerJsonRepoFresco(u, r, t, 'config.json');
      if (!c || typeof c !== 'object' || Array.isArray(c) || !c.firebaseConfig) throw new Error('no pude leer config.json');
      var nueva = { on: !!n.on, ts: n.ts };
      if (c.tarjeta && (+c.tarjeta.ts || 0) >= n.ts) return true;
      await subirArchivoAGitHub(u, r, t, 'config.json', Object.assign({}, c, { tarjeta: nueva }));
      return true;
    } catch (e) {
      if (typeof showToast === 'function') showToast('⚠️ No pude avisar a la tienda', 'Max puede seguir anunciando la tarjeta. Vuelve a tocar el interruptor.');
      return false;
    }
  }

  /* ── ⚙️ Configuración: la campaña ── */
  function pintarCfg() {
    var box = document.getElementById('tarjetaCfg'); if (!box) return;
    var c = cfg(), o = leer(), activas = 0, refs = 0;
    Object.keys(o).forEach(function (k) { if (restantes(o[k]) > 0) activas++; refs += contar(o[k].extra); });
    box.innerHTML = '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px"><input type="checkbox" id="tj-on" ' + (c.on ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#FF6B35"> Dar tarjeta en la primera compra y aceptar referidos</label>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px"><span>Cada tarjeta vale</span><input id="tj-dias" class="form-input" type="number" min="7" max="365" value="' + c.dias + '" style="width:80px"><span>días</span></div>' +
      '<p style="font-size:12px;color:var(--gray);margin:10px 0 0;line-height:1.5">Tramos: desde $' + TRAMOS[1][0] + ' → ' + TRAMOS[1][1] + ' MN · desde $' + TRAMOS[0][0] + ' → ' + TRAMOS[0][1] + ' MN; por debajo no se gasta. ' + USOS + ' descuentos + hasta ' + EXTRA_MAX + ' por amigos que compren. Apagada: no nacen tarjetas ni premios nuevos; las que hay valen hasta su fecha.<br>' +
      '<b style="color:var(--text,#fff)">' + activas + '</b> tarjeta' + (activas === 1 ? '' : 's') + ' con descuentos · <b style="color:var(--text,#fff)">' + refs + '</b> cliente' + (refs === 1 ? '' : 's') + ' traído' + (refs === 1 ? '' : 's') + ' por recomendación.</p>';
    function guardar() {
      var n = { on: box.querySelector('#tj-on').checked, dias: Math.max(7, Math.min(365, parseInt(box.querySelector('#tj-dias').value, 10) || DIAS_DEF)), ts: Date.now() };
      guardarCfg(n);
      if (typeof TMAuth !== 'undefined' && TMAuth.fetchPrivado) TMAuth.fetchPrivado('/privado/tarjeta_config.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) });
      // La página de cada tarjeta deja (o vuelve) a ofrecer «regala a un amigo».
      Object.keys(leer()).forEach(function (k) { subir(k); });
      if (typeof showToast === 'function') showToast(n.on ? '🎁 Campaña de tarjetas encendida' : '⏸️ Campaña de tarjetas apagada', n.on ? 'Tarjetas de ' + n.dias + ' días' : 'Las que ya existen valen hasta su fecha');
      publicarCampana(n);
      pintarCfg();
    }
    box.querySelector('#tj-on').onchange = guardar;
    box.querySelector('#tj-dias').onchange = guardar;
  }
  document.addEventListener('DOMContentLoaded', pintarCfg);
  if (document.readyState !== 'loading') setTimeout(pintarCfg, 0);

  window.tmTarjetas = { compras: compras, leer: leer, porTel: porTel, porCodigo: porCodigo, restantes: restantes, premios: premios, vencida: vencida, crear: crear, dibujar: dibujar,
    textoEnvio: textoEnvio, fusionar: fusionar, sincronizar: sincronizar, descuentoDe: descuentoDe, cfg: cfg, USOS: USOS, EXTRA_MAX: EXTRA_MAX, TRAMOS: TRAMOS };
  setTimeout(function () { sincronizar().catch(function () {}); }, 4000);
})();
