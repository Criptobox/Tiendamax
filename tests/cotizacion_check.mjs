/* Regresión de la cotización imprimible de Max — js/src/tm-bot-cerebro.src.js
 *
 * Lo que se protege aquí es sobre todo una decisión, no una función: la
 * cotización NO inventa números. Es un papel que el cliente le enseña a un
 * instalador, así que una autonomía estimada sobre supuestos se lee como dato
 * medido. Si alguien "mejora" _capacidadBateria() para que siempre devuelva
 * algo (como sí hace el cálculo del chat, que asume 100Ah × 12V), el documento
 * empieza a publicar horas inventadas sin que nada falle ni avise.
 *
 * Se ejecuta contra el fichero real de producción, no contra una copia.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8');

// El cerebro es un IIFE que se cuelga de window. Se le da lo mínimo para que
// cargue: no toca el DOM hasta que alguien abre el chat.
const noop = () => {};
// El cerebro sí engancha la burbuja del chat al cargar, así que querySelector
// tiene que devolver algo: con null revienta antes de definir window._tmBot.
const nuevoElemento = () => ({
    innerHTML: '', textContent: '', value: '', className: '', id: '',
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, remove: noop, insertBefore: noop,
    addEventListener: noop, removeEventListener: noop, setAttribute: noop,
    getAttribute: () => null, focus: noop, blur: noop, scrollTo: noop,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    querySelector: () => nuevoElemento(), querySelectorAll: () => [],
});
const ventana = {
    location: { origin: 'https://tiendamax.org' },
    addEventListener: noop, setTimeout, clearTimeout, open: () => null,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
};
const sandbox = {
    window: ventana,
    document: {
        createElement: nuevoElemento,
        querySelector: () => nuevoElemento(), querySelectorAll: () => [],
        addEventListener: noop, body: nuevoElemento(), head: nuevoElemento(),
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: 'node' },
    location: ventana.location,
    productos: [],
    console, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('sin red en el test')),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fuente, sandbox);

const B = sandbox.window._tmBot;
const fallos = [];
function ok(cond, msg) { if (!cond) fallos.push(msg); }

// ── _capacidadBateria: sólo lee lo que el producto declara ───────────────
const conAh = { nombre: 'Batería Must Tipo LIFEPO4', specs: ['12.8V', '100Ah'] };
const cap = B.capacidadBateria(conAh);
ok(cap && cap.ah === 100 && cap.v === 12.8 && cap.wh === 1280,
    `12.8V + 100Ah debería dar 1280Wh, dio ${JSON.stringify(cap)}`);

// El "(75A)" de una batería de auto puede ser corriente de arranque, no
// capacidad. Confundirlos exagera la autonomía casi un tercio.
ok(B.capacidadBateria({ nombre: '🚗 Batería Automotriz Lubrim (75A)', specs: ['Energía Confiable'] }) === null,
    'una batería que sólo declara "75A" NO debe dar capacidad: A no es Ah');
ok(B.capacidadBateria({ nombre: 'Estación de Carga', specs: ['1800W', '2700W'] }) === null,
    'un producto que sólo declara W no tiene capacidad en Ah');
ok(B.capacidadBateria({ nombre: 'Batería 100Ah', specs: [] }) === null,
    'sin voltaje no se puede calcular Wh: no debe suponer 12V');
ok(B.capacidadBateria(null) === null, 'sin producto debe devolver null, no reventar');

// ── El documento no publica autonomía cuando no la sabe ──────────────────
function armadoCon(bateria) {
    return {
        nombre: 'Sistema de prueba', presupuesto: '$100-200 USD',
        grupos: [{
            rol: 'Batería', subcat: 'BATERÍAS', cantidad: 1, opcional: false,
            prods: bateria ? [bateria] : [],
        }],
    };
}
const conDato = B.cotizacionHTML(armadoCon(Object.assign({ id: 1, precio: 300, stock: 5 }, conAh)), '');
const sinDato = B.cotizacionHTML(armadoCon({ id: 2, precio: 85, stock: 10, nombre: 'Batería Automotriz (75A)', specs: [] }), '');

ok(/1280 Wh|1\.280 Wh/.test(conDato), 'con capacidad declarada debe imprimir los Wh calculados');
ok(!/\d+,\d+ h|\d+ h<\/td>/.test(sinDato),
    'sin capacidad declarada NO debe imprimir ninguna autonomía en horas');
ok(/no declara su capacidad/.test(sinDato),
    'sin capacidad debe decir por qué no calcula, no callarse');

// La autonomía se calcula sobre la energía aprovechable, no sobre la nominal:
// 1280Wh × 0,8 de descarga útil × 0,85 del inversor = 870Wh.
ok(/870 Wh/.test(conDato),
    'debe descontar descarga útil y rendimiento del inversor antes de dar horas');
ok(!/1280 Wh<\/strong>\s*<\/p>\s*<table/.test(conDato),
    'no debe pasar de los Wh nominales a la tabla de horas sin explicar el descuento');

// ── Los opcionales no inflan el total ────────────────────────────────────
const conOpcional = B.cotizacionHTML({
    nombre: 'X', presupuesto: '$1',
    grupos: [
        { rol: 'Obligatorio', subcat: 'ROUTERS', cantidad: 2, opcional: false,
          prods: [{ id: 3, nombre: 'Router', precio: 50, stock: 9 }] },
        { rol: 'Extra', subcat: 'ACCESORIOS', cantidad: 1, opcional: true,
          prods: [{ id: 4, nombre: 'Repetidor', precio: 40, stock: 9 }] },
    ],
}, '');
ok(/\$100\.00/.test(conOpcional), 'el total debe ser 2 × $50 = $100');
ok(!/\$140\.00/.test(conOpcional), 'el componente opcional NO debe entrar en el total');

// ── Sin existencia: se dice, no se omite ─────────────────────────────────
const agotado = B.cotizacionHTML(armadoCon(null), '');
ok(/Sin existencia/.test(agotado),
    'un componente sin stock debe aparecer marcado, no desaparecer de la lista');
ok(/hacen falta para que el sistema funcione/.test(agotado),
    'debe avisar de que al total le faltan componentes obligatorios');

// ── El HTML es autónomo e imprimible ─────────────────────────────────────
ok(/^<!doctype html>/i.test(conDato.trim()), 'debe ser un documento completo');
ok(!/<script/i.test(conDato), 'no debe llevar <script>: se imprime tal cual, también sin conexión');
ok(!/https?:\/\/(fonts|cdn|unpkg|cdnjs)/i.test(conDato),
    'no debe depender de recursos externos: en 3G o sin datos no cargarían');
ok(/@media print/.test(conDato) && /\.tm-print\{ display:none/.test(conDato.replace(/\s+/g, ' ')),
    'el botón de imprimir debe ocultarse al imprimir');

// ── Escapado ─────────────────────────────────────────────────────────────
const conHtml = B.cotizacionHTML(armadoCon({
    id: 5, precio: 10, stock: 1, nombre: '<img src=x onerror=alert(1)>', specs: [],
}), '');
ok(!/<img src=x/.test(conHtml), 'el nombre del producto debe ir escapado');

// ── El armador conserva el rol y la cantidad ─────────────────────────────
sandbox.productos = [
    { id: 9, nombre: 'Panel A', precioActual: 100, stock: 3, subcategoria: 'PANELES SOLARES' },
];
B.sincronizar();
const armado = B.armarSistema({
    nombre: 'S', presupuesto: '$1',
    componentes: [
        { rol: 'Panel solar', subcat: 'PANELES SOLARES', min: 2 },
        { rol: 'Antena (opcional)', subcat: 'ROUTERS', min: 0 },
    ],
});
ok(armado.grupos[0].rol === 'Panel solar' && armado.grupos[0].cantidad === 2,
    'el armador debe conservar el rol y la cantidad mínima de cada componente');
ok(armado.grupos[0].opcional === false && armado.grupos[1].opcional === true,
    'min:0 marca el componente como opcional');
ok(armado.grupos[0].prods.length === 1 && armado.grupos[0].prods[0].nombre === 'Panel A',
    'el armador debe encontrar los productos de la subcategoría');

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ cotización: todas las comprobaciones pasan');
