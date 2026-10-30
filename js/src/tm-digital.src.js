// ═══════════════════════════════════════════════════════════════════════
//  PRODUCTOS DIGITALES — categoría TARJETAS (tarjetas regalo, recargas)
// ═══════════════════════════════════════════════════════════════════════
//
//  Un producto con `digital: true` no es una cosa que se entrega: es un
//  código que el dueño compra cuando el cliente ya pagó. De ahí salen las
//  cuatro diferencias con un producto normal, y nada más cambia:
//
//  - Tiene IMPORTES (`importes: [{v, usdt, usd, on}]`): la de $10, la de $25…
//    o 100/310/520 diamantes. El cliente elige uno en la ficha.
//  - Se cobra en USDT (red BEP20) o en USD, NUNCA en MN. El dueño paga en
//    USDT, que en Cuba está más caro que el dólar: convertir a la tasa del
//    dólar le haría perder dinero en cada venta. Por eso el precio de la
//    tarjeta no lleva la clase `.precio-actual` — actualizarPreciosMostrados
//    (tm-patches) reescribe en MN todo lo que la lleve.
//  - No se paga al recibir: se paga primero, y un código enviado no se
//    devuelve. La tarjeta dice «Código por WhatsApp», no «Pago al recibir».
//  - «Pedir» abre la ficha (hay que elegir importe) en vez de ir directo a
//    WhatsApp, y el mensaje ya lleva importe, región y la red de pago.
//
//  Los precios salen de la regla de scripts/precios_digitales.py (y de
//  tmDigitalPrecioUSDT, abajo, que usa el panel): valor + 20 %, mínimo coste +
//  1 USDT, pedido mínimo 2 USDT; en USD, × 1,05. La tienda solo lee los
//  precios ya guardados en cada importe.
// ═══════════════════════════════════════════════════════════════════════

const TM_DIG_RED = 'BEP20';

function tmEsDigital(p) {
    return !!(p && p.digital && Array.isArray(p.importes) && p.importes.length);
}

// Los importes que se venden (el panel puede apagar alguno sin borrarlo).
function tmDigitalImportes(p) {
    return (p && Array.isArray(p.importes) ? p.importes : [])
        .filter(x => x && x.on !== false && Number(x.usdt) > 0);
}

function tmDigitalValor(p, v) {
    return p && p.unidad ? Number(v).toLocaleString('es-ES') + ' ' + p.unidad : '$' + v;
}

// La regla de precio, la misma que scripts/precios_digitales.py
// (tests/test_digital.py compara las dos). La usa el panel (💳 Tarjetas) al
// cambiar un coste; la tienda solo lee los precios ya guardados.
function tmDigitalPrecioUSDT(valor, coste, recarga) {
    const base = recarga ? coste : valor;
    const x = Math.max(base * 1.20, coste + 1);
    return Math.max(2, Math.ceil(x - 1e-9));
}
function tmDigitalPrecioUSD(usdt) {
    return Math.ceil(Number(usdt) * 1.05 * 2 - 1e-9) / 2;
}
function _tmDigUsd(imp) {
    return Number(imp.usd) > 0 ? Number(imp.usd) : tmDigitalPrecioUSD(imp.usdt);
}
function _tmDigMoney(n) {
    return '$' + (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n)));
}

function tmDigitalDesde(p) {
    return tmDigitalImportes(p).reduce((m, x) => (!m || Number(x.usdt) < Number(m.usdt)) ? x : m, null);
}

// Lo que va en la tarjeta de producto en lugar del precio. Ocupa las mismas
// dos filas que un precio normal (la del precio tachado y la del precio),
// para que la tarjeta mida lo mismo que sus vecinas en la rejilla.
function tmDigitalPrecioCardHTML(p) {
    const d = tmDigitalDesde(p);
    if (!d) return '';
    return '<div class="pv2-oldrow tm-dig-sub">desde · ≈ ' + _tmDigMoney(_tmDigUsd(d)) + ' USD</div>' +
           '<span class="tm-dig-precio">' + Number(d.usdt) + ' USDT</span>';
}

// ── La ficha ─────────────────────────────────────────────────────────────
let _tmDigActual = null, _tmDigIdx = 0, _tmDigCant = 1, _tmDigHist = false;

function _tmDigEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _tmDigCrearDOM() {
    if (document.getElementById('tmDigFicha')) return;
    const veil = document.createElement('div');
    veil.id = 'tmDigVeil'; veil.className = 'tm-dig-veil';
    veil.addEventListener('click', tmDigitalCerrar);
    const m = document.createElement('div');
    m.id = 'tmDigFicha'; m.className = 'tm-dig-ficha';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'tmDigTitulo');
    m.innerHTML =
        '<div class="tm-dig-scroll">' +
          '<div class="tm-dig-img"><img id="tmDigImg" alt=""><button type="button" class="tm-dig-x" id="tmDigX" aria-label="Cerrar">✕</button></div>' +
          '<h2 class="tm-dig-titulo" id="tmDigTitulo"></h2>' +
          '<div class="tm-dig-infos">' +
            '<div class="tm-dig-info"><b>Entrega</b><small>Código por WhatsApp · 5–30 min</small></div>' +
            '<div class="tm-dig-info"><b id="tmDigInfo2T"></b><small id="tmDigInfo2"></small></div>' +
          '</div>' +
          '<div class="tm-dig-cat" id="tmDigCat"></div>' +
          '<div class="tm-dig-grande" id="tmDigGrande"></div>' +
          '<div class="tm-dig-usd" id="tmDigUsd"></div>' +
          '<div class="tm-dig-lbl">Elige el importe</div>' +
          '<div class="tm-dig-imps" id="tmDigImps" role="group" aria-label="Importe"></div>' +
          '<div class="tm-dig-aviso" id="tmDigAviso"></div>' +
          '<p class="tm-dig-desc" id="tmDigDesc"></p>' +
        '</div>' +
        '<div class="tm-dig-barra">' +
          '<div class="tm-dig-tot"><b id="tmDigTot"></b><small id="tmDigTotUsd"></small></div>' +
          '<div class="tm-dig-qty"><button type="button" id="tmDigMenos" aria-label="Uno menos">−</button><output id="tmDigCant">1</output><button type="button" id="tmDigMas" aria-label="Uno más">+</button></div>' +
          '<button type="button" class="tm-dig-pedir" id="tmDigPedir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg>Pedir</button>' +
        '</div>';
    document.body.appendChild(veil);
    document.body.appendChild(m);
    document.getElementById('tmDigX').addEventListener('click', tmDigitalCerrar);
    document.getElementById('tmDigImps').addEventListener('click', e => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        _tmDigIdx = Number(b.dataset.i) || 0;
        _tmDigPintar();
    });
    document.getElementById('tmDigMenos').addEventListener('click', () => { _tmDigCant = Math.max(1, _tmDigCant - 1); _tmDigPintar(); });
    document.getElementById('tmDigMas').addEventListener('click', () => { _tmDigCant = Math.min(10, _tmDigCant + 1); _tmDigPintar(); });
    document.getElementById('tmDigPedir').addEventListener('click', tmDigitalPedir);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _tmDigActual) tmDigitalCerrar(); });
    // «Atrás» del móvil cierra la ficha en vez de salir de la tienda.
    window.addEventListener('popstate', () => { if (_tmDigActual) { _tmDigHist = false; tmDigitalCerrar(); } });
}

function _tmDigPintar() {
    const p = _tmDigActual; if (!p) return;
    const imps = tmDigitalImportes(p);
    if (_tmDigIdx >= imps.length) _tmDigIdx = imps.length - 1;
    const imp = imps[_tmDigIdx], tot = Number(imp.usdt) * _tmDigCant;
    const totUsd = _tmDigUsd(imp) * _tmDigCant;
    const recarga = !!p.unidad;
    const global = String(p.region || '').startsWith('Cualquier');
    const img = document.getElementById('tmDigImg');
    img.src = p.imagen || ''; img.alt = p.nombre || '';
    const partes = String(p.nombre || '').split(' '), ult = partes.pop();
    document.getElementById('tmDigTitulo').innerHTML = _tmDigEsc(partes.join(' ')) + ' <em>' + _tmDigEsc(ult) + '</em>';
    document.getElementById('tmDigInfo2T').textContent = recarga ? 'A tu cuenta' : 'Región';
    document.getElementById('tmDigInfo2').textContent = recarga ? 'Con tu ID de jugador' : (global ? 'Cualquier país' : (p.region || ''));
    document.getElementById('tmDigCat').innerHTML = _tmDigEsc(p.categoria || '') + (p.subcategoria ? ' · <span>' + _tmDigEsc(p.subcategoria) + '</span>' : '');
    document.getElementById('tmDigGrande').innerHTML = Number(imp.usdt) + '<small>USDT</small>';
    document.getElementById('tmDigUsd').textContent = '≈ ' + _tmDigMoney(_tmDigUsd(imp)) + ' USD si pagas en dólares · ' + (recarga ? '' : 'saldo ') + tmDigitalValor(p, imp.v);
    document.getElementById('tmDigImps').innerHTML = imps.map((x, i) =>
        '<button type="button" data-i="' + i + '" aria-pressed="' + (i === _tmDigIdx) + '" class="' + (i === _tmDigIdx ? 'on' : '') + '">' +
        _tmDigEsc(tmDigitalValor(p, x.v)) + '<small>' + Number(x.usdt) + ' USDT</small></button>').join('');
    document.getElementById('tmDigAviso').innerHTML = recarga
        ? '🎮 <span>Va directo a tu cuenta con tu ID de jugador. Mándanos una captura de tu perfil donde se vea: a un ID equivocado no se le pueden quitar.</span>'
        : (global ? '🌍 <span>Sirve para cuentas de cualquier país.</span>'
                  : '⚠️ <span>Solo funciona en cuentas de <b>' + _tmDigEsc(p.region) + '</b>. Dinos de qué país es tu cuenta antes de pagar.</span>');
    document.getElementById('tmDigDesc').textContent = p.descripcion || 'Pagas primero (USDT por la red ' + TM_DIG_RED + ', o USD) y te mandamos el código por WhatsApp. Un código enviado no se puede devolver.';
    document.getElementById('tmDigCant').textContent = _tmDigCant;
    document.getElementById('tmDigTot').textContent = tot + ' USDT';
    document.getElementById('tmDigTotUsd').textContent = '≈ ' + _tmDigMoney(totUsd) + ' USD';
}

function tmDigitalAbrir(p) {
    if (!tmEsDigital(p) || !tmDigitalImportes(p).length) return false;
    _tmDigCrearDOM();
    _tmDigActual = p; _tmDigCant = 1;
    _tmDigIdx = Math.min(1, tmDigitalImportes(p).length - 1);
    _tmDigPintar();
    document.getElementById('tmDigVeil').classList.add('on');
    document.getElementById('tmDigFicha').classList.add('on');
    document.body.classList.add('tm-dig-abierta');
    try { history.pushState({ tmDig: p.id }, ''); _tmDigHist = true; } catch (e) { _tmDigHist = false; }
    try { document.getElementById('tmDigX').focus({ preventScroll: true }); } catch (e) {}
    return true;
}

function tmDigitalCerrar() {
    if (!_tmDigActual) return;
    _tmDigActual = null;
    const f = document.getElementById('tmDigFicha'), v = document.getElementById('tmDigVeil');
    if (f) f.classList.remove('on');
    if (v) v.classList.remove('on');
    document.body.classList.remove('tm-dig-abierta');
    if (_tmDigHist) { _tmDigHist = false; try { history.back(); } catch (e) {} }
}

// El mensaje de WhatsApp: todo lo que el dueño necesita para comprar sin
// preguntar dos veces — qué, de cuánto, de qué región y cómo se paga.
function tmDigitalMensaje(p, imp, cant) {
    const recarga = !!p.unidad;
    const tot = Number(imp.usdt) * cant, totUsd = _tmDigUsd(imp) * cant;
    let url = '';
    try { url = typeof tmUrlProducto === 'function' ? tmUrlProducto(p) : ''; } catch (e) {}
    const lineas = [
        'Hola, quiero ' + cant + '× ' + p.nombre + ' de ' + tmDigitalValor(p, imp.v) +
            (recarga ? '.' : ' (región: ' + (p.region || '') + ').'),
        'Total: ' + tot + ' USDT (red ' + TM_DIG_RED + ') o ' + _tmDigMoney(totUsd) + ' USD.',
    ];
    if (recarga) lineas.push('Mi ID de jugador: ');
    if (url) lineas.push(url);
    return lineas.join('\n');
}

function tmDigitalPedir() {
    const p = _tmDigActual; if (!p) return;
    const imp = tmDigitalImportes(p)[_tmDigIdx]; if (!imp) return;
    try { if (typeof tmTrackWhatsApp === 'function') tmTrackWhatsApp(p.id); } catch (e) {}
    try { if (typeof tmRegistrarInteresWhatsApp === 'function') tmRegistrarInteresWhatsApp(p.id, 'ficha'); } catch (e) {}
    try { if (typeof _gaEvent === 'function') _gaEvent('contact', { method: 'whatsapp_digital', item_name: p.nombre, value: Number(imp.usdt) * _tmDigCant }); } catch (e) {}
    const num = typeof getNumeroWhatsApp === 'function' ? getNumeroWhatsApp() : '';
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(tmDigitalMensaje(p, imp, _tmDigCant)), '_blank', 'noopener,noreferrer');
}

function _tmDigBuscar(id) {
    try {
        if (typeof productos !== 'undefined' && Array.isArray(productos)) {
            return productos.find(x => x && String(x.id) === String(id)) || null;
        }
    } catch (e) {}
    return null;
}

// La ficha de siempre no sabe de importes: un producto digital abre la suya.
// Se envuelve al final del bundle, así que esta comprobación va la primera
// aunque otros módulos hayan envuelto antes abrirDetalleProducto.
(function () {
    if (typeof abrirDetalleProducto === 'function') {
        const _prevAbrir = abrirDetalleProducto;
        abrirDetalleProducto = function (id) {
            const p = _tmDigBuscar(id);
            if (tmEsDigital(p)) { tmDigitalAbrir(p); return; }
            return _prevAbrir.apply(this, arguments);
        };
        window.abrirDetalleProducto = abrirDetalleProducto;
    }
    // «Pedir» desde cualquier otro sitio (Max, sugerencias de búsqueda) iría
    // directo a WhatsApp sin importe: a un digital se le abre la ficha.
    if (typeof tmComprar === 'function') {
        const _prevComprar = tmComprar;
        tmComprar = function (event, id) {
            const p = _tmDigBuscar(id);
            if (tmEsDigital(p)) { tmDigitalAbrir(p); return; }
            return _prevComprar.apply(this, arguments);
        };
        window.tmComprar = tmComprar;
    }
})();
