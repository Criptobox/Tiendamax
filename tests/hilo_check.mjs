/* El hilo de la conversación de Max — js/src/tm-bot-cerebro.src.js
 *
 * Un cliente no repite el nombre del producto en cada mensaje. Le enseñas
 * cuatro routers y escribe "¿cuánto cuesta?". Sin memoria, eso caía en "no
 * te entendí" — y "dame más info" era peor: se buscaba como si fuera el
 * nombre de un producto y Max contestaba con una camioneta de $33 000. Fue,
 * de lejos, lo que más salió en las cuatro auditorías del bot.
 *
 * Nada de esto falla ni avisa: el chat responde, bien formado, otra cosa.
 * Por eso se prueba la RESPUESTA (que nombre el producto, que diga su
 * precio), no solo la intención.
 *
 * Lo que este archivo vigila con más cuidado es el lado contrario: que el
 * hilo no se coma preguntas que traen tema propio. Dos ya se colaron en
 * desarrollo y las dos venían del mismo error — reconocer solo el PRINCIPIO
 * de la frase:
 *
 *   · "cuánto vale el envío pa Holguín"      → lista de precios de audífonos
 *   · "qué me recomiendas para los apagones" → perdía los apagones
 *
 * De ahí que la frase de hilo tenga que ser el mensaje entero, con nada
 * detrás salvo un pronombre suelto.
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
const FUENTE = readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8');
const CATALOGO = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));

// Cada escenario arranca con un bot nuevo: el hilo ES estado, y un test que
// heredara el contexto del anterior pasaría o fallaría según el orden.
function nuevoBot() {
    const win = {
        location: { origin: 'https://tiendamax.org' },
        addEventListener: noop, setTimeout, clearTimeout, open: () => null,
        matchMedia: () => ({ matches: false, addEventListener: noop }),
    };
    const sb = {
        window: win, location: win.location,
        document: { createElement: el, querySelector: () => el(), querySelectorAll: () => [],
                    addEventListener: noop, body: el(), head: el() },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'node' },
        productos: CATALOGO.productos || CATALOGO,
        console, setTimeout, clearTimeout, requestAnimationFrame: noop,
        fetch: () => Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(FUENTE, sb);
    sb.window._tmBot.sincronizar();
    return sb.window._tmBot;
}

const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };
const plano = (h) => String(h || '').replace(/<[^>]+>/g, '');

// Habla con Max de corrido y devuelve la última respuesta, como un cliente.
function conversar(...turnos) {
    const B = nuevoBot();
    let r = {};
    let intent = '';
    for (const q of turnos) { intent = B.detectIntent(q); r = B.responder(q) || {}; }
    return { intent, texto: plano(r.response), productos: r.products || [] };
}

const UNO = '🛜 Router Tp-link Archer AX1450 (Wi-fi 6)';   // $80, 7 en stock
const VARIOS = 'tienes routers wifi';                       // enseña 4 de golpe

// ── 1. Con UN producto enseñado, la pregunta suelta habla de ESE ─────────
// El nombre tiene que aparecer en la respuesta: es la única prueba de que
// contestó del producto y no del catálogo entero.
{
    // El precio se lee del producto YA normalizado por el bot (el JSON crudo
    // lo llama precioActual), no del archivo.
    const ficha = conversar('tienes el archer ax1450');
    const p = ficha.productos[0];
    ok(p && p.nombre === UNO, `esperaba la ficha de "${UNO}", dio "${p && p.nombre}"`);
    if (p && p.nombre === UNO) {
        const precio = conversar('tienes el archer ax1450', 'cuánto cuesta');
        ok(precio.intent === 'hiloPrecio', `"cuánto cuesta" tras un producto → ${precio.intent}`);
        ok(precio.texto.includes(p.nombre), 'el precio debe decir de QUÉ producto habla');
        ok(precio.texto.includes(p.precio.toFixed(2)),
            `debe decir el precio real (${p.precio}), dijo: ${precio.texto.slice(0, 120)}`);

        const stock = conversar('tienes el archer ax1450', 'está disponible');
        ok(stock.intent === 'hiloStock', `"está disponible" tras un producto → ${stock.intent}`);
        ok(stock.texto.includes(p.nombre), 'la disponibilidad debe ser la de ESE producto');
        ok(stock.texto.includes(String(p.stock)),
            `debe decir cuántos quedan de verdad (${p.stock})`);
        // El fallo original: "está disponible" contestaba con el recuento
        // global del catálogo ("68 disponibles, 51 agotados"), que no
        // responde nada de lo que se preguntó.
        ok(!/productos disponibles/.test(stock.texto),
            '"está disponible" no puede contestar con el estado del catálogo entero');

        const comprar = conversar('tienes el archer ax1450', 'lo quiero');
        ok(comprar.intent === 'hiloComprar', `"lo quiero" tras un producto → ${comprar.intent}`);
        ok(comprar.productos.some(x => x.nombre === p.nombre),
            'al pedirlo hay que enseñar la tarjeta del producto, que es la que trae el botón Pedir');
    }
}

// ── 2. Con VARIOS enseñados, no se inventa cuál eligió ───────────────────
{
    const lista = conversar(VARIOS, 'cuánto cuesta');
    ok(lista.intent === 'hiloPrecio', `"cuánto cuesta" tras varios → ${lista.intent}`);
    ok(lista.productos.length > 1, 'debe seguir hablando de los varios que enseñó');
    // Cada uno con su precio: elegir uno "por el cliente" sería inventarlo.
    for (const p of lista.productos) {
        ok(lista.texto.includes(p.nombre), `falta ${p.nombre} en la lista de precios`);
        ok(lista.texto.includes(p.precio.toFixed(2)), `falta el precio de ${p.nombre}`);
    }

    const cual = conversar(VARIOS, 'cuál me recomiendas');
    ok(cual.intent === 'hiloCual', `"cuál me recomiendas" tras varios → ${cual.intent}`);
    // Sin saber el uso, lo único demostrable es cuál cuesta menos y cuál más.
    // Coronar un ganador a ojo es exactamente el tipo de respuesta inventada
    // que se está quitando del bot.
    // Se comprueban las ETIQUETAS, no las palabras sueltas: "más caro"
    // también aparece en la frase de cierre ("no el que más caro sea"), así
    // que buscarla a secas daba por bueno un texto que ya coronaba ganador.
    ok(/El m[aá]s barato:/.test(cual.texto) && /El m[aá]s caro:/.test(cual.texto),
        'debe apoyarse en el precio, que es lo único que sabe sin preguntar');
    ok(!/(el mejor|la mejor|el ganador|te recomiendo el|yo cogeria|yo cogería)/i.test(cual.texto),
        'sin saber el uso no puede coronar un ganador: eso es inventarlo');
    ok(/para qu[eé] lo vas a usar/i.test(cual.texto),
        'y tiene que preguntar el uso antes de recomendar');

    const info = conversar(VARIOS, 'dame más info');
    ok(info.intent === 'hiloDetalle', `"dame más info" tras varios → ${info.intent}`);
    // El fallo original, y el más vergonzoso: se buscaba "dame más info" como
    // nombre de producto y salía un Changan CS75 de $33 000.
    ok(!/33000|33 000/.test(info.texto), '"dame más info" no puede acabar enseñando un carro');
}

// ── 3. Sin nada enseñado antes NO hay hilo ───────────────────────────────
// "cuánto cuesta" de primeras no se puede contestar, y fingir que sí sería
// contestar del último producto de otra conversación.
for (const q of ['cuánto cuesta', 'cuál me recomiendas', 'dame más info', 'lo quiero']) {
    const r = conversar(q);
    ok(!/^hilo/.test(r.intent), `"${q}" sin contexto previo no puede ser hilo (dio ${r.intent})`);
}

// ── 4. Lo que trae tema propio NO es hilo ────────────────────────────────
// Todas se hacen DESPUÉS de enseñar productos, que es cuando el hilo está
// armado y puede robarlas. Las dos primeras se colaron de verdad.
const NO_SON_HILO = [
    ['cuánto vale el envio pa holguin', 'envios'],
    ['que me recomiendas para los apagones', null],
    ['cuánto cuesta un inversor', null],
    ['cuál es la tasa', 'tasa'],
    ['cuánto cuesta el envío', 'envios'],
    ['qué precio tiene una cámara', null],
];
for (const [q, esperado] of NO_SON_HILO) {
    const r = conversar(VARIOS, q);
    ok(!/^hilo/.test(r.intent), `"${q}" trae tema propio, no puede ser hilo (dio ${r.intent})`);
    if (esperado) ok(r.intent === esperado, `"${q}" → ${r.intent}, esperaba ${esperado}`);
}

// ── 5. Las formas de decirlo que se oyen aquí ────────────────────────────
const FORMAS = [
    ['cuánto vale', 'hiloPrecio'], ['a cómo está', 'hiloPrecio'],
    ['qué precio tiene', 'hiloPrecio'], ['y cuánto cuesta eso', 'hiloPrecio'],
    ['cuál es mejor', 'hiloCual'], ['cuál me conviene', 'hiloCual'],
    ['cuántos quedan', 'hiloStock'], ['lo tienes', 'hiloStock'],
    ['cuéntame más', 'hiloDetalle'], ['más detalles', 'hiloDetalle'],
    ['me interesa', 'hiloComprar'], ['cómo lo pido', 'hiloComprar'],
];
for (const [q, esperado] of FORMAS) {
    const r = conversar(VARIOS, q);
    ok(r.intent === esperado, `"${q}" → ${r.intent}, esperaba ${esperado}`);
}

// ── 6. La memoria no puede vivir solo en el DOM ──────────────────────────
// _lastProductsShown se llenaba únicamente en addProducts(), que es capa de
// pintado. Cualquier respuesta que no pasara por ahí dejaba al hilo ciego.
// Ahora responder() la anota, y por eso todo lo de arriba funciona sin DOM.
{
    const src = FUENTE.slice(FUENTE.indexOf('function responder(text)'),
                             FUENTE.indexOf('function responder(text)') + 1600);
    ok(/_lastProductsShown = data\.products/.test(src),
        'responder() debe anotar lo que enseñó, o el hilo solo funciona con DOM delante');
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ hilo: todas las comprobaciones pasan');
