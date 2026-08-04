/* Regresión del seguimiento post-venta — js/src/tm-crm.src.js
 *
 * Esto le escribe a clientes reales por WhatsApp. Los fallos que importan aquí
 * no son excepciones, son mensajes inoportunos: preguntarle a alguien "¿te
 * llegó bien?" ocho meses después, o mandarle tres seguimientos seguidos
 * porque el admin estuvo dos meses sin abrir el panel. Nada de eso lanza un
 * error — simplemente queda mal con el cliente.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const almacen = {};
const sb = {
    localStorage: {
        getItem: k => (k in almacen ? almacen[k] : null),
        setItem: (k, v) => { almacen[k] = String(v); },
        removeItem: k => { delete almacen[k]; },
    },
    console,
};
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(RAIZ, 'js/src/tm-crm.src.js'), 'utf8'), sb);
// Las funciones sí quedan en el objeto del contexto, pero los `const` de nivel
// superior NO — igual que en el navegador, donde window.TM_SEGUIMIENTOS es
// undefined. Hay que pedirlo evaluando su nombre.
const HITOS = vm.runInContext('TM_SEGUIMIENTOS', sb);
const TM_CONTACTO_KEY = vm.runInContext('TM_SEG_CONTACTO_KEY', sb);

const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };
const DIA = 86400000;
const AHORA = Date.UTC(2026, 7, 4, 12, 0, 0);
const hace = d => AHORA - d * DIA;

const venta = (dias, extra) => Object.assign({
    id: hace(dias),
    fecha: 'x',
    telefono: '5355551234',
    cliente: 'Ana Pérez',
    items: [{ producto: 'Inversor Tataliken 4000W', cantidad: 1, precio: 170 }],
    producto: 'Inversor Tataliken 4000W',
}, extra || {});

// ── Cuándo toca cada hito ────────────────────────────────────────────────
const casos = [
    [0, null], [2, null],
    [3, 'inicial'], [10, 'inicial'],
    [29, null],                     // el inicial ya caducó (3+14), el de 30 aún no
    [30, 'satisfaccion'], [60, 'satisfaccion'],
    [80, null],                     // satisfacción caducada (30+45), recompra aún no
    [90, 'recompra'], [400, 'recompra'],
];
for (const [dias, esperado] of casos) {
    const s = sb.tmSeguimientoDe(venta(dias), {}, AHORA);
    const got = s ? s.hito : null;
    ok(got === esperado, `a los ${dias} días esperaba ${esperado}, dio ${got}`);
}

// Preguntar "¿te llegó bien?" medio año después no es tarde: es quedar mal.
ok(sb.tmSeguimientoDe(venta(200), {}, AHORA).hito === 'recompra',
    'pasada su ventana, el hito viejo se salta — no se manda con meses de retraso');

// ── Nunca tres mensajes de golpe ─────────────────────────────────────────
// Si el admin estuvo dos meses sin abrir, el cliente NO debe recibir el de 3
// días, el de 30 y el de 90 seguidos: se manda el que corresponde a hoy.
const pend = sb.tmSeguimientosPendientes([venta(95)], {}, AHORA);
ok(pend.length === 1, `una venta debe generar 1 pendiente, generó ${pend.length}`);
ok(pend[0].hito === 'recompra', 'debe ser el hito que corresponde a hoy, no el más viejo');

// Lo anterior pasa hoy solo porque las ventanas no se solapan — con las tres
// cerradas, siempre hay como mucho un candidato. Eso lo garantiza la
// configuración, no el código, así que se comprueba aparte...
for (let i = 0; i + 1 < HITOS.length; i++) {
    const a = HITOS[i], b = HITOS[i + 1];
    ok(a.dias + a.ventana < b.dias + b.ventana,
        `las ventanas de ${a.hito} y ${b.hito} deben ir en orden`);
}
// ...y aparte se comprueba que el código aguante igual si algún día se solapan:
// con dos candidatos vivos debe ganar el MÁS AVANZADO, no el primero. Sin esto,
// ampliar una ventana haría que el cliente recibiera el mensaje viejo.
const ventanaOriginal = HITOS[0].ventana;
HITOS[0].ventana = 200;              // el inicial sigue vivo a los 95 días
const solapado = sb.tmSeguimientoDe(venta(95), {}, AHORA);
HITOS[0].ventana = ventanaOriginal;
ok(solapado && solapado.hito === 'recompra',
    `con dos hitos vivos debe ganar el más avanzado, ganó ${solapado && solapado.hito}`);

// ── Marcar uno da por atendidos los anteriores ───────────────────────────
const v30 = venta(30);
sb.tmMarcarSeguimiento(v30.id, 'satisfaccion');
const hechos = sb.tmSeguimientosHechos();
ok(hechos[v30.id + '|inicial'], 'marcar el de 30 días debe dar por atendido el de 3');
ok(hechos[v30.id + '|satisfaccion'], 'debe marcar el hito pedido');
ok(!hechos[v30.id + '|recompra'], 'no debe marcar los posteriores');
ok(sb.tmSeguimientoDe(v30, hechos, AHORA) === null, 'ya atendido: no debe volver a salir');

// ── Sin teléfono no hay seguimiento ──────────────────────────────────────
ok(sb.tmSeguimientoDe(venta(5, { telefono: '' }), {}, AHORA) === null,
    'sin número no hay a quién escribirle');
ok(sb.tmSeguimientoDe(venta(5, { telefono: '123' }), {}, AHORA) === null,
    '"123" no es un teléfono: es un apunte a medias');
ok(sb.tmTelDe({ telefono: '+53 5 555-1234' }) === '5355551234',
    'el número debe quedar en dígitos para wa.me');

const sb_espera = () => vm.runInContext('TM_SEG_ESPERA_DIAS', sb);

// ── Una persona, un mensaje ──────────────────────────────────────────────
// Mismo número, dos compras con hitos vencidos a la vez. Los dos mensajes son
// legítimos ("¿te llegó el router?" y "¿cómo va la batería?"), pero no el
// mismo día: sale el más atrasado y el otro espera.
const mismoTel = [
    venta(4,   { id: hace(4) }),
    venta(120, { id: hace(120), items: [{ producto: 'Batería LiFePO4' }] }),
];
const unaSola = sb.tmSeguimientosPendientes(mismoTel, {}, AHORA, {});
ok(unaSola.length === 1, `mismo número: 1 pendiente, salieron ${unaSola.length}`);
ok(unaSola[0].hito === 'recompra', 'de la misma persona debe salir el más atrasado');

// Y tras escribirle, el otro NO puede aparecer al instante: agrupar solo al
// pintar no bastaba, porque el repintado sacaba el siguiente enseguida.
const contactos = { '5355551234': AHORA };
ok(sb.tmSeguimientosPendientes(mismoTel, {}, AHORA, contactos).length === 0,
    'recién contactado: no debe salir otro seguimiento del mismo número');
const pasado = { '5355551234': AHORA - (sb_espera() + 1) * 86400000 };
ok(sb.tmSeguimientosPendientes(mismoTel, {}, AHORA, pasado).length === 1,
    'pasado el descanso, el segundo seguimiento debe volver a salir');

// Dos personas distintas sí salen las dos aunque compren el mismo día.
const dosPersonas = sb.tmSeguimientosPendientes(
    [venta(4, { id: hace(4) }), venta(4, { id: hace(4) + 1, telefono: '5355559999' })], {}, AHORA, {});
ok(dosPersonas.length === 2, `dos números distintos: 2 pendientes, salieron ${dosPersonas.length}`);

// El descanso solo lo apunta quien escribe; saltar no cuenta como contacto.
almacen[TM_CONTACTO_KEY] = undefined; delete almacen[TM_CONTACTO_KEY];
sb.tmRegistrarContacto('+53 5 555-1234');
ok(sb.tmContactos()['5355551234'], 'el contacto debe guardarse con el número en dígitos');
sb.tmRegistrarContacto('12');
ok(!sb.tmContactos()['12'], 'un número inválido no debe ensuciar el registro');

// ── Orden: primero lo más frío ───────────────────────────────────────────
// Tres clientes distintos: si compartieran número se agruparían en uno.
const varias = sb.tmSeguimientosPendientes([
    venta(3,  { id: hace(3),  telefono: '5355550003' }),
    venta(12, { id: hace(12), telefono: '5355550012' }),
    venta(5,  { id: hace(5),  telefono: '5355550005' }),
], {}, AHORA, {});
ok(varias.length === 3, `tres clientes dan tres pendientes, dieron ${varias.length}`);
ok(varias[0].dias === 12, 'lo más atrasado va primero, que es lo que más se enfría');

// ── El mensaje ───────────────────────────────────────────────────────────
const seg = sb.tmSeguimientoDe(venta(3), {}, AHORA);
const txt = sb.tmTextoSeguimiento(seg, 'TiendaMax');
ok(/^Hola Ana,/.test(txt), 'debe saludar por el nombre de pila');
ok(txt.includes('Inversor Tataliken 4000W'),
    'debe nombrar el producto: "tu compra" se lee como plantilla y no consigue respuesta');
ok(!/\{|\}/.test(txt), 'no deben quedar variables sin sustituir');

const sinNombre = sb.tmTextoSeguimiento(sb.tmSeguimientoDe(venta(3, { cliente: '' }), {}, AHORA));
ok(/^Hola,/.test(sinNombre), 'sin nombre debe saludar igual, no "Hola undefined"');

const dos = sb.tmSeguimientoDe(venta(3, {
    items: [{ producto: 'Router Tenda' }, { producto: 'Antena CPE' }],
}), {}, AHORA);
ok(sb.tmTextoSeguimiento(dos).includes('Router Tenda y Antena CPE'),
    'con varios productos deben listarse todos');

// El enlace tiene que abrir el chat correcto y con el texto puesto.
const url = sb.tmWaSeguimiento(seg, 'TiendaMax');
ok(url.startsWith('https://wa.me/5355551234?text='), `enlace mal formado: ${url.slice(0, 60)}`);
ok(decodeURIComponent(url.split('text=')[1]).includes('Inversor'), 'el texto debe ir en el enlace');

// ── Datos rotos no rompen el panel ───────────────────────────────────────
ok(sb.tmSeguimientoDe(null, {}, AHORA) === null, 'venta nula');
ok(sb.tmSeguimientoDe({ id: 'x', telefono: '5355551234' }, {}, AHORA) === null, 'sin fecha usable');
ok(sb.tmSeguimientosPendientes(null, {}, AHORA).length === 0, 'lista nula');
ok(sb.tmSeguimientoDe(venta(-5), {}, AHORA) === null, 'una venta con fecha futura no genera nada');

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ seguimiento post-venta: todas las comprobaciones pasan');
