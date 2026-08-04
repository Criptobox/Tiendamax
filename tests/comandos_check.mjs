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
    console, setTimeout, clearTimeout, requestAnimationFrame: noop,
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

// ── Barrido de 195 preguntas reales ──────────────────────────────────────
// Ninguna de estas fallaba: todas devolvían una respuesta bien formada, del
// tema equivocado. Se dejan las que estaban mal encaminadas, agrupadas por la
// causa, porque cada grupo es un fallo distinto y volver a romper uno no
// rompería los demás.
const ENCAMINADAS = [
    // El saludo se partía mal: la alternancia era perezosa y "buenas tardes"
    // salía como "buenas" + "tardes", y "tardes" se buscaba como producto.
    ['buenas tardes', 'saludo'], ['buenos dias', 'saludo'], ['buenas noches', 'saludo'],
    ['buenas tardes max', 'saludo'], ['buenos dias como estas', 'saludo'],
    ['hola max', 'saludo'], ['que bola asere', 'saludo'],
    // Pero un saludo CON contenido sí se parte: es lo que hace esa regla.
    ['hola quiero un router', 'recomendacion'],

    // Un "sí"/"ok" suelto puntuaba dentro de algún nombre y devolvía productos.
    ['si', 'confirmacion'], ['no', 'confirmacion'], ['ok', 'confirmacion'],
    ['vale', 'confirmacion'], ['dale', 'confirmacion'], ['listo', 'confirmacion'],

    // Identidad y capacidades: no existían, caían en búsqueda de productos.
    ['quien eres', 'quienEres'], ['eres un bot', 'quienEres'],
    ['hablo con una persona', 'quienEres'], ['como te llamas', 'quienEres'],
    ['me puedes ayudar', 'ayuda'], ['que puedes hacer', 'ayuda'],
    ['que sabes hacer', 'ayuda'], ['en que me puedes ayudar', 'ayuda'],

    // Devoluciones: con \b al final, "devolverlo" y "me lo cambian" —como se
    // pregunta de verdad— no casaban.
    ['si se rompe me lo cambian', 'devolucion'],
    ['puedo devolverlo si no me gusta', 'devolucion'],
    ['y si llega roto que hago', 'devolucion'],

    // Recogida: no estaba contemplada en ningún sitio.
    ['puedo recogerlo yo mismo', 'envios'],
    ['llegan hasta holguin', 'envios'], ['reparten en la habana', 'envios'],

    // "usd" se llevaba a la tasa una pregunta que traía presupuesto.
    ['con 200 usd que me llevo para el internet', 'recomendacion'],
    // Y preguntar la tasa de verdad sigue siendo la tasa.
    ['a como esta el dolar hoy', 'tasa'], ['cuanto es en moneda nacional', 'tasa'],

    // Stock: "agotados" en plural no casaba, y "qué hay disponible" se lo
    // llevaba el índice de categorías, que no dice cuántos quedan.
    ['cuantos productos tienen agotados', 'stock'], ['que hay disponible', 'stock'],
    // Preguntar por el stock de UN producto es pedir su ficha, no el conteo
    // global del catálogo: la ficha ya dice si queda o no.
    ['esta agotado el inversor must', 'detalle'],
    ['queda algun powmr 5000w', 'detalle'],

    // Sistemas completos: solo se disparaban con "arma".
    ['quiero un sistema de seguridad completo', 'sistemaSeguridad'],
    ['necesito internet en toda la casa', 'sistemaInternet'],
    ['arma un sistema solar basico', 'sistemaSolar'],

    // "gel" no era un término conocido, así que comparar gel con litio no era
    // una comparación técnica sino una petición de comparar dos productos.
    ['diferencia entre gel y litio', 'comparacionTecnologica'],
    ['cual es mejor wifi 5 o wifi 6', 'comparacionTecnologica'],
];
for (const [q, esperado] of ENCAMINADAS) {
    ok(intent(q) === esperado, `"${q}" → ${intent(q)}, esperaba ${esperado}`);
}

// ── Lo que sale, no solo a dónde va ──────────────────────────────────────
// El presupuesto vivía tres turnos, así que un "$30" para una cámara seguía
// filtrando la pregunta siguiente: "¿qué inversor me recomiendas?" contestaba
// con una raqueta matamoscas, lo único del catálogo por debajo de $30.
B.responder('tengo 30 dolares que camara me recomiendas');
const inv = B.responder('que inversor me recomiendas');
ok((inv.products || []).every(p => /inversor/i.test(p.nombre)),
    'al cambiar de tipo de producto el presupuesto anterior no puede seguir filtrando');
ok(!/30/.test(inv.response),
    'el presupuesto de la cámara no puede seguir aplicándose a los inversores');
B.responder('/limpiar');

// Y cuando de verdad no hay nada de ese tipo en el presupuesto, se dice —
// no se rellena con lo que sea que quepa. Las dos rutas que listan por tipo
// (recomendación y búsqueda) tienen que decirlo igual.
const sinNada = B.responder('tengo 30 dolares que inversor me recomiendas');
ok(/no tengo nada en/i.test(sinNada.response) && /lo m[aá]s barato/i.test(sinNada.response),
    'si nada del tipo pedido entra en el presupuesto, debe decirlo con el precio real');
ok((sinNada.products || []).every(p => /inversor/i.test(p.nombre)),
    'no puede ofrecer otra cosa en lugar de lo que le pidieron');
B.responder('/limpiar');

// Aquí el presupuesto viene del turno anterior sin tipo, así que sigue vivo:
// es la misma situación por la ruta de búsqueda.
B.responder('tengo 30 dolares');
const sinNada2 = B.responder('que inversor me recomiendas');
ok(/no tengo nada en/i.test(sinNada2.response),
    'por la ruta de búsqueda también debe decir que nada de ese tipo entra en el presupuesto');
ok((sinNada2.products || []).every(p => /inversor/i.test(p.nombre)),
    'la ruta de búsqueda tampoco puede rellenar con otro producto que sí quepa');
B.responder('/limpiar');

// Pedir un tipo concreto no puede devolver la categoría entera: "qué cámara me
// recomiendas" sacaba la cerradura y el timbre, que también son SEGURIDAD.
const cams = B.responder('tengo 100 dolares que camara me recomiendas');
ok((cams.products || []).length > 0 && (cams.products || []).every(p => /c[aá]mara/i.test(p.nombre)),
    'al pedir un tipo concreto no deben salir otros productos de la misma categoría');
B.responder('/limpiar');

// IP66 listaba una capa de moto y una tienda de campaña como productos "que
// cumplen": la ficha decía "impermeable", que no es una clasificación IP.
const ip = B.responder('que es ip66');
ok(!/capa para moto|tienda de campa/i.test(JSON.stringify(ip.products || [])),
    'una prenda impermeable no cumple IP66: no puede listarse como que sí');

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ comandos: todas las comprobaciones pasan');
