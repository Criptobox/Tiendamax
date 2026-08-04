/* Los comandos con / de Max — js/src/tm-bot-cerebro.src.js
 *
 * Existe por un fallo que llegó a producción: el botón del panel dice
 * "🤖 /ayuda", los comandos se detectaban con el ancla ^\/ y el emoji de
 * delante rompía la coincidencia. El comando se perdía en silencio y caía en
 * 'recomendacion' — un cliente pidió ayuda y Max le ofreció aceite de motor.
 * Nada falla ni avisa: solo contesta otra cosa.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const el = () => ({
    innerHTML: '', textContent: '', value: '', className: '', id: '', style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, remove: noop, insertBefore: noop,
    addEventListener: noop, removeEventListener: noop, setAttribute: noop,
    getAttribute: () => null, focus: noop, blur: noop, scrollTo: noop,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    querySelector: () => el(), querySelectorAll: () => [],
});
const win = {
    location: { origin: 'https://tiendamax.org' },
    addEventListener: noop, setTimeout, clearTimeout, open: () => null,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
};
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const sb = {
    window: win, location: win.location,
    document: { createElement: el, querySelector: () => el(), querySelectorAll: () => [],
                addEventListener: noop, body: el(), head: el() },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: 'node' },
    productos: catalogo.productos || catalogo,
    console, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error('sin red en el test')),
};
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8'), sb);

const B = sb.window._tmBot;
B.sincronizar();
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };
const intent = t => B.detectIntent(t);

// ── Cada comando, tal cual y con el emoji del botón delante ──────────────
const COMANDOS = [
    ['/ayuda', 'ayuda'], ['/limpiar', 'resetCmd'], ['/envios', 'envios'],
    ['/pago', 'pago'], ['/tasa', 'tasa'], ['/categorias', 'categorias'],
    ['/ofertas', 'ofertas'], ['/whatsapp', 'whatsapp'], ['/deseos', 'wishlist'],
];
for (const [cmd, esperado] of COMANDOS) {
    ok(intent(cmd) === esperado, `"${cmd}" → ${intent(cmd)}, esperaba ${esperado}`);
    // Así es EXACTAMENTE como llegan desde los botones del panel.
    const conEmoji = '🤖 ' + cmd;
    ok(intent(conEmoji) === esperado,
        `"${conEmoji}" → ${intent(conEmoji)}, esperaba ${esperado} (el emoji del botón no puede romper el comando)`);
}

// Mayúsculas y espacios de sobra tampoco.
ok(intent('/AYUDA') === 'ayuda', 'el comando no distingue mayúsculas');
ok(intent('  /tasa  ') === 'tasa', 'los espacios sobrantes no cuentan');

// ── "ayuda" a secas es pedir ayuda ───────────────────────────────────────
for (const t of ['ayuda', 'Ayuda', 'ayuda!', '¿ayuda?', 'help']) {
    ok(intent(t) === 'ayuda', `"${t}" debería dar ayuda, dio ${intent(t)}`);
}
// Pero dentro de una frase sigue siendo una consulta de compra: quien escribe
// "necesito ayuda con un router" quiere un router, no el menú de comandos.
for (const t of ['necesito ayuda con un router', 'ayuda para elegir una cámara']) {
    ok(intent(t) !== 'ayuda', `"${t}" NO debería dar el menú de comandos`);
}

// ── El botón del saludo tiene que ser uno de los que funcionan ───────────
const saludo = B.responder('hola');
const botones = saludo.quickReplies || [];
botones.filter(b => /\//.test(b)).forEach(b => {
    ok(intent(b) !== 'recomendacion' && intent(b) !== 'fallback',
        `el botón "${b}" del saludo cae en ${intent(b)}`);
});

// ── Preguntas que Max contestaba con otra cosa ───────────────────────────
// Salieron de leer 25 preguntas reales de cliente. Ninguna fallaba: todas
// devolvían una respuesta bien formada, pero de otro tema.
const MAL_ENCAMINADAS = [
    // "en moneda nacional" es como se dice aquí; caía en búsqueda de productos.
    ['cuanto es en moneda nacional', 'tasa'],
    ['cuanto cuesta en cup', 'tasa'],
    // Pedía una recomendación y recibía la definición de qué es un inversor.
    ['cual es el mejor inversor que tienen', 'recomendacion'],
    ['cual es la mejor camara', 'recomendacion'],
];
for (const [q, esperado] of MAL_ENCAMINADAS) {
    ok(intent(q) === esperado, `"${q}" → ${intent(q)}, esperaba ${esperado}`);
}
// Y lo que ya funcionaba tiene que seguir igual: "el mejor" no puede secuestrar
// las comparaciones.
ok(intent('compara wifi 5 vs wifi 6') === 'comparacionTecnologica',
    'las comparaciones técnicas no deben caer en recomendación');
ok(intent('cual es mejor wifi 5 o wifi 6') !== 'recomendacion',
    'preguntar cuál de dos tecnologías es mejor sigue siendo una comparación');

// La garantía de un producto sin plazo anotado se dice, no se inventa ni se
// contesta con el texto general —que invita a preguntar justo lo que acaba de
// dejar sin responder.
const gar = B.responder('el inversor tataliken tiene garantia').response;
ok(/no tengo el plazo|no lo tengo anotado/i.test(gar),
    'sin garantía en la ficha, Max debe decirlo en vez de soltar el texto general');
ok(!/\b(\d+)\s*(mes|a[ñn]o)/i.test(gar),
    'no debe inventarse un plazo de garantía que la ficha no trae');

// ── "¿Qué es X?" — lo primero que Max anuncia en su saludo ───────────────
// Ninguna forma de preguntarlo llegaba a la explicación: "qué es un inversor"
// daba la lista de inversores, "qué es MPPT" una búsqueda vacía y "qué es onda
// pura" la ficha de un producto. La función existía y era inalcanzable.
for (const q of ['que es un inversor', 'que es mppt', 'que significa mppt',
                 'explicame que es poe', 'que es lifepo4', 'que es onda pura']) {
    ok(intent(q) === 'tecnico', `"${q}" → ${intent(q)}, debería explicar el término`);
}
// Y la explicación va PRIMERO: quien pregunta qué es algo no preguntó por el
// inventario, y se le contestaba con "no encontré productos" antes que nada.
const def = B.responder('que es onda pura').response.replace(/<[^>]+>/g, '');
ok(def.indexOf('onda pura') < def.indexOf('no tengo productos'),
    'en una definición, la explicación va antes que el aviso de inventario');

// Los filtros técnicos siguen funcionando: son otra pregunta.
ok(intent('que router tiene puerto wan') === 'tecnico', 'el filtro técnico sigue igual');

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ comandos: todas las comprobaciones pasan');
