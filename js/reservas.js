/* Reservas: el puente entre el vale y la venta.
 *
 * El caso real: mandas el vale porque el cliente va a pasar a recoger otro día.
 * Esa unidad ya no se puede vender a nadie más, pero la venta todavía no
 * existe — puede que el cliente no aparezca. Antes no había nada en medio: o
 * registrabas la venta de algo que aún no habías cobrado, o dejabas el stock
 * como si el producto siguiera libre y lo vendías dos veces.
 *
 * Una reserva descuenta el stock al momento de mandar el vale y se queda
 * esperando. Desde el admin se cierra de dos maneras y solo dos: ✅ se ejecuta
 * la venta (el stock ya estaba descontado, no se toca otra vez) o ❌ se
 * cancela (el stock vuelve). Nunca caduca sola: si el cliente pagó y a los
 * tres días el sistema devolviera el stock por su cuenta, venderías la misma
 * unidad otra vez. Se avisa y decide el dueño.
 *
 * ── Por qué este archivo es aparte y no toca nada del bundle ──
 * vale.html es una página suelta: no carga js/tm-bundle.js, así que no tiene
 * `productos`, ni guardarProductos(), ni ajustarStock(). Y admin.html sí. Este
 * archivo es lo único que cargan las dos, y por eso escribe en localStorage
 * directamente, releyendo siempre antes (nada de copias en memoria).
 *
 * ── La regla que no se puede romper ──
 * Todo lo que toque `productos` aquí hace leer→modificar→escribir en el mismo
 * instante. El admin mantiene el catálogo en memoria y lo vuelca entero al
 * guardar: si esto guardara una copia leída hace un minuto, el admin la
 * pisaría y el descuento del vale desaparecería sin que nadie se entere. Por
 * eso existe además tmReservasRefrescarAdmin(), que el admin llama al volver
 * al primer plano.
 *
 * Los datos del cliente (nombre y teléfono) se quedan aquí, en localStorage, y
 * no salen a Firebase: /pedidos es `.read: true` y en este proyecto no hay
 * Firebase Auth, así que sería publicarlos.
 */
(function () {
  'use strict';

  var LS_RESERVAS = 'tm_reservas';
  var LS_PRODUCTOS = 'productos';
  var LS_MODIFICADOS = 'productosModificados';
  var MAX = 300;
  var DIAS_AVISO = 3;

  function _leer(clave, porDefecto) {
    try {
      var v = JSON.parse(localStorage.getItem(clave) || 'null');
      return Array.isArray(v) ? v : porDefecto;
    } catch (e) { return porDefecto; }
  }

  function reservas() { return _leer(LS_RESERVAS, []); }

  function _guardarReservas(lista) {
    try {
      localStorage.setItem(LS_RESERVAS, JSON.stringify(lista.slice(0, MAX)));
      return true;
    } catch (e) { return false; }
  }

  // El precio del catálogo se llama precioActual en el JSON crudo.
  function _precio(p) { return Number(p.precioActual != null ? p.precioActual : p.precio) || 0; }

  /* Mueve stock releyendo del disco en este mismo instante. Devuelve el detalle
     de lo aplicado, o null si no pudo guardarse (cuota llena): quien llama
     tiene que poder no dar la reserva por buena. */
  function _moverStock(items, signo) {
    var ps = _leer(LS_PRODUCTOS, null);
    if (!ps) return null;                       // sin catálogo local no hay nada que descontar
    var tocados = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var p = null;
      for (var j = 0; j < ps.length; j++) {
        if (String(ps[j].id) === String(it.id)) { p = ps[j]; break; }
      }
      if (!p) continue;
      var antes = Number(p.stock) || 0;
      p.stock = Math.max(0, antes + signo * (Number(it.cantidad) || 1));
      tocados.push({ id: p.id, nombre: p.nombre, antes: antes, despues: p.stock });
    }
    if (!tocados.length) return [];
    try {
      localStorage.setItem(LS_PRODUCTOS, JSON.stringify(ps));
    } catch (e) { return null; }
    // Marcar para que la próxima sincronización lo suba a GitHub; si no, la
    // tienda pública seguiría enseñando el stock viejo.
    try {
      var mods = _leer(LS_MODIFICADOS, []);
      tocados.forEach(function (t) { if (mods.indexOf(t.id) === -1) mods.push(t.id); });
      localStorage.setItem(LS_MODIFICADOS, JSON.stringify(mods));
      localStorage.setItem('ultimaModificacion', String(Date.now()));
    } catch (e) {}
    return tocados;
  }

  /* Cuánto hay reservado de un producto ahora mismo. El stock guardado YA lo
     tiene descontado; esto sirve para poder decir "quedan 2, y 1 reservada". */
  function reservadoDe(id) {
    var n = 0;
    reservas().forEach(function (r) {
      if (r.estado !== 'reservada') return;
      (r.items || []).forEach(function (it) {
        if (String(it.id) === String(id)) n += Number(it.cantidad) || 1;
      });
    });
    return n;
  }

  /* Crear la reserva. `items` = [{id, cantidad}]. El resto (nombre, precio) se
     toma del catálogo para que no dependa de lo que se escribió en el vale. */
  function crear(items, datos) {
    items = (items || []).filter(function (it) { return it && it.id; });
    if (!items.length) return { ok: false, msg: 'No elegiste ningún producto del catálogo.' };

    var ps = _leer(LS_PRODUCTOS, null);
    if (!ps) return { ok: false, msg: 'Este navegador no tiene el catálogo guardado. Abre el admin una vez y vuelve.' };

    // Comprobar ANTES de tocar nada: reservar más de lo que hay dejaría el
    // stock en 0 y la reserva mintiendo sobre unidades que no existen.
    var detalle = [], faltan = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var p = null;
      for (var j = 0; j < ps.length; j++) {
        if (String(ps[j].id) === String(items[i].id)) { p = ps[j]; break; }
      }
      if (!p) { faltan.push('un producto que ya no está en el catálogo'); continue; }
      var cant = Math.max(1, Number(it.cantidad) || 1);
      if ((Number(p.stock) || 0) < cant) {
        faltan.push(p.nombre + ' (quedan ' + (Number(p.stock) || 0) + ', pides ' + cant + ')');
        continue;
      }
      detalle.push({
        id: p.id, nombre: p.nombre, cantidad: cant, precio: _precio(p),
        moneda: p.moneda === 'MN' ? 'MN' : 'USD',
        comision: Number(p.comision) || 0, comisionMoneda: p.comisionMoneda || 'USD'
      });
    }
    if (faltan.length) return { ok: false, msg: 'No hay stock para: ' + faltan.join('; ') + '.' };

    var aplicado = _moverStock(detalle, -1);
    if (aplicado === null) return { ok: false, msg: 'No se pudo guardar el descuento de stock (navegador sin espacio). No se reservó nada.' };

    var r = {
      id: 'rsv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      ts: Date.now(),
      estado: 'reservada',
      cliente: String((datos && datos.cliente) || '').slice(0, 80),
      telefono: String((datos && datos.telefono) || '').slice(0, 25),
      nota: String((datos && datos.nota) || '').slice(0, 140),
      items: detalle,
      // Dos totales, como en la venta: un producto con precio fijo en MN no se
      // suma con los de USD. `total` es la parte en dólares —lo que leían las
      // reservas de siempre— y totalMN va aparte.
      total: detalle.reduce(function (s, d) { return s + (d.moneda === 'MN' ? 0 : d.precio * d.cantidad); }, 0),
      totalMN: detalle.reduce(function (s, d) { return s + (d.moneda === 'MN' ? d.precio * d.cantidad : 0); }, 0)
    };
    var lista = reservas();
    lista.unshift(r);
    if (!_guardarReservas(lista)) {
      _moverStock(detalle, +1);          // deshacer: sin reserva guardada, el stock no puede quedar descontado
      return { ok: false, msg: 'No se pudo guardar la reserva (navegador sin espacio). El stock se devolvió.' };
    }
    _espejar();
    return { ok: true, reserva: r };
  }

  function _cerrar(id, estado, devolverStock) {
    var lista = reservas();
    var r = null;
    for (var i = 0; i < lista.length; i++) { if (lista[i].id === id) { r = lista[i]; break; } }
    if (!r) return { ok: false, msg: 'No encuentro esa reserva.' };
    if (r.estado !== 'reservada') return { ok: false, msg: 'Esa reserva ya estaba ' + r.estado + '.' };
    if (devolverStock) {
      if (_moverStock(r.items, +1) === null) {
        return { ok: false, msg: 'No se pudo devolver el stock. No se canceló nada.' };
      }
    }
    r.estado = estado;
    r.tsResuelta = Date.now();
    if (!_guardarReservas(lista)) {
      if (devolverStock) _moverStock(r.items, -1);   // deshacer la devolución
      return { ok: false, msg: 'No se pudo guardar el cambio.' };
    }
    _espejar();
    return { ok: true, reserva: r };
  }

  /* La venta se ejecutó. El stock YA está descontado desde que se hizo el
     vale: volver a descontarlo aquí lo restaría dos veces. */
  function marcarVendida(id) { return _cerrar(id, 'vendida', false); }

  /* El cliente no vino. El producto vuelve a estar a la venta. */
  function cancelar(id) { return _cerrar(id, 'cancelada', true); }

  function diasDe(r) { return Math.floor((Date.now() - (r.ts || 0)) / 86400000); }
  function pendientes() { return reservas().filter(function (r) { return r.estado === 'reservada'; }); }
  function pendientesViejas() { return pendientes().filter(function (r) { return diasDe(r) >= DIAS_AVISO; }); }

  /* ── Espejo en Firebase ────────────────────────────────────────────────
     localStorage sigue mandando: es instantáneo y funciona sin cobertura, que
     en Cuba no es un detalle. Firebase es la copia que sobrevive a borrar los
     datos del navegador y la que hace que veas lo mismo desde el móvil y desde
     la PC.

     Va a /privado, que pide `auth != null`. Eso importa: una reserva lleva el
     nombre y el teléfono del cliente, y en las rutas públicas de este proyecto
     —/pedidos, /ventas hasta hoy— cualquiera con la URL podía leerlas. Sin
     cuenta iniciada esto no hace nada y todo sigue funcionando en local.

     Se manda la lista entera y no cada cambio: son unos pocos KB, y así una
     reserva cerrada en el móvil no puede quedarse "pendiente" en la PC porque
     se perdió justo ese envío. */
  function _espejar() {
    try {
      if (typeof TMAuth === 'undefined') return;
      TMAuth.fetchPrivado('/privado/reservas.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reservas())
      }).then(function (r) {
        /* Si Firebase la rechaza, la reserva se queda SOLO en este navegador y
           el dueño no se entera: la ve en pantalla igual. El día que cambie de
           móvil o borre los datos, desaparece con el stock ya descontado. Se
           apunta el motivo y se avisa una vez. */
        window.tmReservasEstado = { ts: Date.now(), ok: !!r.ok, error: r.ok ? null : (r.msg || 'rechazado') };
        if (!r.ok && !r.sinSesion && !_avisado) {
          _avisado = true;
          if (typeof mostrarNotificacion === 'function') {
            mostrarNotificacion('⚠️ La reserva se guardó solo en este dispositivo: ' + (r.msg || '') , 'error');
          } else if (typeof toast === 'function') {
            toast('⚠️ Reserva solo en este dispositivo: ' + (r.msg || ''));
          }
        }
      });
    } catch (e) {}
  }
  var _avisado = false;

  /* Trae lo de Firebase y lo mezcla con lo de aquí. Gana SIEMPRE lo cerrado:
     si en el móvil se ejecutó la venta y en la PC sigue pendiente, la reserva
     está cerrada — dar por buena la versión pendiente la dejaría lista para
     ejecutarse otra vez y venderías dos veces lo mismo. */
  async function sincronizar() {
    if (typeof TMAuth === 'undefined') return { ok: false, msg: 'sin cuenta' };
    var r = await TMAuth.fetchPrivado('/privado/reservas.json');
    if (!r.ok) return r;
    var remotas = Array.isArray(r.dato) ? r.dato : [];
    var locales = reservas();
    var porId = {};
    locales.forEach(function (x) { porId[x.id] = x; });
    var nuevas = 0, cerradas = 0;
    remotas.forEach(function (x) {
      if (!x || !x.id) return;
      var mio = porId[x.id];
      if (!mio) { locales.push(x); porId[x.id] = x; nuevas++; return; }
      if (mio.estado === 'reservada' && x.estado !== 'reservada') {
        mio.estado = x.estado; mio.tsResuelta = x.tsResuelta || Date.now(); cerradas++;
      }
    });
    if (nuevas || cerradas) {
      locales.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      _guardarReservas(locales);
    }
    _espejar();
    return { ok: true, nuevas: nuevas, cerradas: cerradas };
  }

  window.TMReservas = {
    lista: reservas,
    pendientes: pendientes,
    pendientesViejas: pendientesViejas,
    reservadoDe: reservadoDe,
    crear: crear,
    marcarVendida: marcarVendida,
    cancelar: cancelar,
    sincronizar: sincronizar,
    dias: diasDe,
    DIAS_AVISO: DIAS_AVISO
  };
})();
