/* Reservas: el puente entre mandar un vale y cobrar la venta.
 *
 * Mandas el vale porque el cliente pasa otro día. Esa unidad ya no se puede
 * vender a nadie más, pero la venta todavía no existe. Antes no había nada en
 * medio: o registrabas una venta que aún no habías cobrado, o dejabas el stock
 * como si el producto siguiera libre y lo vendías dos veces.
 *
 * Todo lo que se prueba aquí falla en silencio y con dinero de por medio: el
 * catálogo enseña un número, nadie ve un error, y te enteras cuando el segundo
 * cliente viene a buscar algo que ya no está.
 *
 * El fallo más caro apareció probando esto en Chromium y no lo habría visto
 * leyendo el código: reservabas 2, abrías el admin, el motor bajaba
 * productos.json —donde el descuento aún no estaba, porque no se había
 * sincronizado— y el producto volvía a aparecer disponible. La reserva seguía
 * ahí, el stock no.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const RESERVAS_JS = readFileSync(join(RAIZ, 'js/reservas.js'), 'utf8');
const VALE = readFileSync(join(RAIZ, 'vale.html'), 'utf8');
const ADMIN = readFileSync(join(RAIZ, 'admin.html'), 'utf8');
const TM_UI = readFileSync(join(RAIZ, 'js/src/tm-ui.src.js'), 'utf8');
const TM_DATA = readFileSync(join(RAIZ, 'js/src/tm-data.src.js'), 'utf8');

// localStorage de mentira, para poder ejecutar reservas.js de verdad en vez de
// leerlo como texto: lo que importa aquí es cuánto stock queda, no qué pone.
function entorno(productos, opts = {}) {
    const datos = Object.create(null);
    datos['productos'] = JSON.stringify(productos);
    const store = {
        getItem: k => (k in datos ? datos[k] : null),
        setItem: (k, v) => {
            if (opts.sinEspacioPara && opts.sinEspacioPara === k) throw new Error('QuotaExceededError');
            datos[k] = String(v);
        },
        removeItem: k => { delete datos[k]; },
    };
    const win = {};
    const sb = { window: win, localStorage: store, console };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(RESERVAS_JS, sb);
    return {
        R: win.TMReservas,
        stock: id => (JSON.parse(datos['productos']) || []).find(p => String(p.id) === String(id)).stock,
        crudo: () => datos,
    };
}

const CATALOGO = [
    { id: 1, nombre: 'Router', precioActual: 80, stock: 4, comision: 5, comisionMoneda: 'USD' },
    { id: 2, nombre: 'Cámara', precioActual: 50, stock: 1, comision: 3, comisionMoneda: 'USD' },
];

// ── 1. Reservar descuenta, cancelar devuelve exactamente lo mismo ────────
{
    const e = entorno(CATALOGO);
    const r = e.R.crear([{ id: 1, cantidad: 2 }], { cliente: 'Ana', telefono: '54320170' });
    ok(r.ok, 'no se pudo crear la reserva: ' + r.msg);
    ok(e.stock(1) === 2, `reservar 2 de 4 debe dejar 2, dejó ${e.stock(1)}`);
    ok(e.R.pendientes().length === 1, 'la reserva debe quedar pendiente');
    ok(e.R.reservadoDe(1) === 2, 'debe poder decirse cuántas hay apartadas');

    const c = e.R.cancelar(r.reserva.id);
    ok(c.ok, 'no se pudo cancelar: ' + c.msg);
    ok(e.stock(1) === 4, `cancelar debe devolver el stock a 4, quedó ${e.stock(1)}`);
    ok(e.R.pendientes().length === 0, 'una reserva cancelada ya no está pendiente');
}

// ── 2. Ejecutar la venta NO vuelve a descontar ───────────────────────────
// La unidad salió del stock al mandar el vale. Restarla otra vez al cobrar la
// contaría dos veces y el catálogo diría que quedan menos de las que hay.
{
    const e = entorno(CATALOGO);
    const r = e.R.crear([{ id: 1, cantidad: 2 }], {});
    const antes = e.stock(1);
    const v = e.R.marcarVendida(r.reserva.id);
    ok(v.ok, 'no se pudo marcar vendida: ' + v.msg);
    ok(e.stock(1) === antes, `ejecutar la venta no puede tocar el stock (era ${antes}, quedó ${e.stock(1)})`);
    ok(e.R.pendientes().length === 0, 'una reserva vendida ya no está pendiente');

    // Y quien registra la venta tiene que saltarse el descuento.
    ok(/function registrarVentaPedido\(items, cliente, opts\)/.test(TM_UI),
        'registrarVentaPedido debe aceptar opciones');
    ok(/if \(!\(opts && opts\.stockYaDescontado\)\) detalle\.forEach\(d => ajustarStock/.test(TM_UI),
        'con stockYaDescontado no se puede volver a descontar');
    ok(/registrarVentaPedido\(items, \{nombre:r\.cliente, tel:r\.telefono\}, \{stockYaDescontado:true\}\)/.test(ADMIN),
        'el admin debe pasar stockYaDescontado al ejecutar una reserva');
}

// ── 3. Cerrar dos veces no puede mover el stock dos veces ────────────────
{
    const e = entorno(CATALOGO);
    const r = e.R.crear([{ id: 1, cantidad: 2 }], {});
    e.R.cancelar(r.reserva.id);
    const dos = e.R.cancelar(r.reserva.id);
    ok(!dos.ok, 'cancelar dos veces debe rechazarse');
    ok(e.stock(1) === 4, `cancelar dos veces devolvería stock de más: quedó ${e.stock(1)}`);
    ok(!e.R.marcarVendida(r.reserva.id).ok, 'una reserva ya cerrada no se puede vender');
}

// ── 4. No se puede reservar lo que no hay ────────────────────────────────
{
    const e = entorno(CATALOGO);
    const r = e.R.crear([{ id: 2, cantidad: 3 }], {});   // solo hay 1
    ok(!r.ok, 'reservar más de lo que hay debe rechazarse');
    ok(e.stock(2) === 1, 'y no puede haber tocado el stock');
    ok(/quedan 1/.test(r.msg), `el aviso debe decir cuántas quedan, dijo: ${r.msg}`);

    // Un pedido con varias líneas es todo o nada: si una no cabe, no se
    // descuenta ninguna, o quedaría media reserva apuntada a medio pedido.
    const e2 = entorno(CATALOGO);
    const r2 = e2.R.crear([{ id: 1, cantidad: 1 }, { id: 2, cantidad: 5 }], {});
    ok(!r2.ok, 'si una línea no cabe, la reserva entera se rechaza');
    ok(e2.stock(1) === 4, `la línea que sí cabía no puede haberse descontado (quedó ${e2.stock(1)})`);
}

// ── 5. Si no se puede guardar la reserva, el stock no se queda descontado ─
// Ese es el peor final posible: unidades fuera del catálogo y ni un apunte de
// por qué. Nadie sabría nunca que faltan.
{
    const e = entorno(CATALOGO, { sinEspacioPara: 'tm_reservas' });
    const r = e.R.crear([{ id: 1, cantidad: 2 }], {});
    ok(!r.ok, 'sin poder guardar la reserva hay que fallar');
    ok(e.stock(1) === 4, `el stock debe deshacerse, quedó ${e.stock(1)}`);
}

// ── 6. Una reserva NUNCA caduca sola ─────────────────────────────────────
// Si el cliente ya pagó y el sistema devolviera el stock por su cuenta,
// venderías dos veces la misma unidad. Se avisa y decide el dueño.
{
    const e = entorno(CATALOGO);
    const r = e.R.crear([{ id: 1, cantidad: 1 }], {});
    const datos = e.crudo();
    const lista = JSON.parse(datos['tm_reservas']);
    lista[0].ts = Date.now() - 30 * 86400000;            // un mes parada
    datos['tm_reservas'] = JSON.stringify(lista);
    ok(e.R.pendientes().length === 1, 'una reserva vieja sigue pendiente, no se cancela sola');
    ok(e.stock(1) === 3, 'y su stock sigue apartado');
    ok(e.R.pendientesViejas().length === 1, 'pero tiene que poder avisarse');
    ok(e.R.dias(lista[0]) >= 29, 'y decir cuántos días lleva');
    ok(!/setTimeout|setInterval/.test(RESERVAS_JS), 'nada de temporizadores que cancelen por su cuenta');
}

// ── 7. El stock reservado no puede revivirlo una descarga del catálogo ───
// Es el fallo que costó encontrar: reservabas, abrías el admin, el motor bajaba
// productos.json —sin el descuento, porque aún no se había sincronizado— y el
// producto volvía a aparecer disponible con la reserva todavía puesta.
{
    ok(/function _tmConservarStockLocal\(remotos\)/.test(TM_DATA),
        'falta la protección del stock local sin publicar');
    ok(/_tmConservarStockLocal\(productos\);\s*\n\s*localStorage\.setItem\('productos'/.test(TM_DATA),
        'hay que aplicarla ANTES de guardar el catálogo bajado de la red');
    ok(/productosModificados/.test(TM_DATA.slice(TM_DATA.indexOf('function _tmConservarStockLocal'),
                                                 TM_DATA.indexOf('function _tmConservarStockLocal') + 1400)),
        'se decide por productosModificados: es la lista de cambios sin subir');
    // Y la reserva tiene que apuntarse ahí, o la protección no la ve.
    ok(/productosModificados/.test(RESERVAS_JS),
        'al mover stock hay que marcar el producto como modificado');
}

// ── 8. El vale reserva al enviarlo, y una sola vez ───────────────────────
{
    ok(/function reservarSiToca\(\)/.test(VALE), 'falta la reserva al enviar el vale');
    ok(/_valeReservaHecha/.test(VALE), 'hace falta recordar que este vale ya reservó');
    const f = VALE.slice(VALE.indexOf('function reservarSiToca()'), VALE.indexOf('function reservarSiToca()') + 700);
    ok(/if\(!_valeItems\.length \|\| _valeReservaHecha\) return;/.test(f),
        'mandar el mismo vale dos veces no puede reservar dos veces');
    // Se reserva lo ELEGIDO DEL CATÁLOGO, no el texto del artículo: ese es
    // libre y no dice qué producto es.
    ok(/_valeItems\.push\(\{id:id/.test(VALE), 'hay que guardar el id del producto elegido');
    ok(/reservarSiToca\(\);/.test(VALE), 'y llamarse al copiar y al enviar');
    ok((VALE.match(/reservarSiToca\(\);/g) || []).length >= 2,
        'tanto al copiar el vale como al mandarlo por WhatsApp');
}

// ── 9. Nada de datos del cliente en Firebase ─────────────────────────────
// Una reserva lleva nombre y teléfono. /pedidos es `.read: true` y aquí no hay
// Firebase Auth: subirlo sería publicarlo.
{
    for (const pista of ['firebaseio', 'firebasedatabase', 'fetch(']) {
        ok(!RESERVAS_JS.includes(pista),
            `reservas.js no puede salir a la red (encontrado: ${pista}): publicaría nombres y teléfonos`);
    }
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ reservas: todas las comprobaciones pasan');
