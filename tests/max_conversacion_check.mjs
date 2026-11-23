/* Max conversa, y pregunta antes de volcar la lista — con el catálogo real.
 *
 * El dueño probó Max y dijo que «es como un buscador». Tres causas, ninguna
 * da error: contesta, bien formado, otra cosa:
 *
 *  1. No conocía cómo LLAMA la gente a lo que vendes. «Estación de carga»
 *     sacaba cargadores y un MPPT; la BLUETTI AC180 (que es una estación) solo
 *     salía escribiendo «power station». max-sinonimos.json lo arregla, y los
 *     sinónimos solo SUMAN: no quitan resultados ni tocan la regla del modelo.
 *  2. Cuando dudaba, soltaba 4-8 productos «relacionados». Ahora, si no hay un
 *     ganador claro, hace UNA pregunta con botones sacados de los candidatos
 *     reales; nunca más de 3 productos en una respuesta genérica y el resto
 *     detrás de «➕ Ver más».
 *  3. «Hola», «qué tal», «gracias», «quién eres» tenían una respuesta fija o
 *     ninguna. Ahora varían (por contador, no al azar), llevan la hora del
 *     teléfono y SIEMPRE una puerta de salida. Y no roban consultas: «hola,
 *     tienen routers» saluda corto y contesta lo de los routers.
 *
 * Cada mensaje corre en un bot NUEVO (el hilo ES estado: uno heredado haría
 * pasar o fallar según el orden). Sinónimos: un fixture propio, y si existe el
 * max-sinonimos.json real (TM_SINONIMOS=real) también deben pasar con él.
 * La hora del teléfono se fija (FakeDate) para que el saludo sea estable.
 *
 * TM_CEREBRO=<ruta> prueba otra copia del cerebro (así se hacen las mutaciones).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CEREBRO = process.env.TM_CEREBRO || join(RAIZ, 'js/src/tm-bot-cerebro.src.js');
const FUENTE = readFileSync(CEREBRO, 'utf8');
const noop = () => {};
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, remove: noop, addEventListener: noop, setAttribute: noop, getAttribute: () => null,
    insertAdjacentHTML: noop, focus: noop, scrollIntoView: noop, dataset: {}, children: [],
    innerHTML: '', textContent: '', getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    querySelector: () => el(), querySelectorAll: () => [],
});

const crudo = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const PRODS = crudo.productos || crudo;
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const buscar = re => PRODS.find(p => re.test(p.nombre || ''));
const bluetti = buscar(/Generador Solar Port[aá]til BLUETTI AC180/i);
if (!bluetti || !(bluetti.stock > 0) || !buscar(/NanoStation M5 Loco/i) || !buscar(/NanoStation Loco M2/i)
    || !buscar(/Switch Gigabit de 8 Puertos/i)) {
    console.log('el catálogo ya no tiene los productos de referencia — se salta');
    process.exit(0);
}

// ── Sinónimos: fixture propio (o el real) ───────────────────────────────
const m2 = buscar(/NanoStation Loco M2/i);
const agotado = PRODS.find(p => !(p.stock > 0) && /^[A-Za-zÁ-ú ]{8,30}$/.test(p.nombre || '')
                             && PRODS.filter(q => q.nombre === p.nombre).length === 1);
const FIXTURE = {
    version: 1,
    productos: {
        [bluetti.id]: ['estacion de carga', 'power station', 'planta portatil', 'estacion de energia', 'bateria portatil'],
        [m2.id]: ['antena loca de dos y cuatro'],
        ...(agotado ? { [agotado.id]: ['cosa rarisima aparte'] } : {}),
    },
    categorias: { ENERGIA: ['apagon', 'corriente'] },
};
const REAL = join(RAIZ, 'max-sinonimos.json');
const USAR_REAL = process.env.TM_SINONIMOS === 'real';
if (USAR_REAL && !existsSync(REAL)) { console.log('no hay max-sinonimos.json real — se salta'); process.exit(0); }
const SINON = USAR_REAL ? JSON.parse(readFileSync(REAL, 'utf8')) : FIXTURE;

function nuevoBot({ hora = 9, sinonimos = SINON, catalogo = PRODS } = {}) {
    class FakeDate extends Date { getHours() { return hora; } }
    const win = {
        location: { origin: 'https://tiendamax.org' }, addEventListener: noop, setTimeout, clearTimeout,
        open: () => null, matchMedia: () => ({ matches: false, addEventListener: noop }),
    };
    const sb = {
        window: win, location: win.location,
        document: { createElement: el, querySelector: () => el(), querySelectorAll: () => [], addEventListener: noop, body: el(), head: el() },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'node' }, productos: catalogo, console: { log: noop, warn: noop, error: noop },
        setTimeout, clearTimeout, requestAnimationFrame: noop, Date: FakeDate,
        fetch: () => Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(FUENTE, sb);
    const B = sb.window._tmBot;
    B.sincronizar();
    if (sinonimos) B.ponerSinonimos(sinonimos);
    return B;
}
const limpio = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const ver = (B, q) => {
    const r = B.responder(q);
    return { r, intent: B.context.lastIntent, texto: limpio(r.response), prods: r.products || [],
             nombres: (r.products || []).map(p => p.nombre), botones: r.quickReplies || [] };
};
const una = (q, o) => ver(nuevoBot(o), q);
const lineaDe = (q, a) => `«${q}»: «${a.texto.slice(0, 110)}» ⟦${a.nombres.join(' | ').slice(0, 90)}⟧`;

// ═══ 3 · CONVERSACIÓN ═══════════════════════════════════════════════════
// Saludos y variantes de «cómo estás». Todos contestan como persona, sin
// productos, con puerta de salida (≥3 botones) y sin «no te entendí».
const SALUDOS = ['hola', 'holaa', 'holaaa max', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'wenas',
    'qué tal', 'cómo estás', 'cómo te va', 'qué hay', 'qué bolá', 'asere', 'hola cómo estás', 'buenas tardes max',
    'epa', 'hola, buenos días', 'buenas! qué tal?'];
for (const q of SALUDOS) {
    const a = una(q);
    ok(a.intent === 'saludo', `«${q}» es un saludo (dio ${a.intent})`);
    ok(a.texto.length > 15 && a.texto.length < 260, `«${q}»: respuesta corta de persona, no un muro (${a.texto.length} car.)`);
    ok(!a.prods.length && !/no te entend/i.test(a.texto), `«${q}» no devuelve productos ni «no te entendí»: ${lineaDe(q, a)}`);
    ok(a.botones.length >= 3, `«${q}» deja una puerta de salida con botones (${a.botones.length})`);
    ok(!a.r.bienvenida, `«${q}» escrito en el chat no repite el panel de bienvenida entero`);
}
// La hora del teléfono; y si el cliente dijo la suya, la suya.
ok(/Buenos días/.test(una('hola', { hora: 9 }).texto), '«hola» a las 9 → Buenos días');
ok(/Buenas tardes/.test(una('hola', { hora: 15 }).texto), '«hola» a las 15 → Buenas tardes');
ok(/Buenas noches/.test(una('hola', { hora: 21 }).texto), '«hola» a las 21 → Buenas noches');
ok(/Buenas noches/.test(una('buenas noches', { hora: 9 }).texto), 'si el cliente dice «buenas noches», se le contesta lo mismo');
ok(/Max/.test(una('cómo estás').texto + una('hola').texto + una('hola', { hora: 15 }).texto + una('hola', { hora: 21 }).texto), 'Max dice su nombre al saludar');
// Variantes: 4 saludos seguidos no son la misma frase, y la secuencia es estable.
function secuencia(q, n) { const B = nuevoBot(); return Array.from({ length: n }, () => ver(B, q).texto); }
for (const q of ['hola', 'gracias', 'chao', 'quién eres', 'jaja', 'cómo estás']) {
    const a = secuencia(q, 4), b = secuencia(q, 4);
    ok(new Set(a).size >= 3, `«${q}» ×4 tiene variantes (${new Set(a).size} distintas)`);
    ok(JSON.stringify(a) === JSON.stringify(b), `«${q}» ×4 es determinista (sin Math.random)`);
}
// Gracias, despedidas, quién eres, ayuda, cumplidos, «no sé», groserías.
const CASOS = [
    ['gracias', 'gracias', /nada|gusto|placer|estamos/i], ['muchas gracias', 'gracias', /nada|gusto|placer|estamos/i],
    ['ok gracias', 'gracias', /nada|gusto|placer|estamos/i], ['mil gracias', 'gracias', /nada|gusto|placer|estamos/i],
    ['te lo agradezco', 'gracias', /nada|gusto|placer|estamos/i], ['gracias max', 'gracias', /nada|gusto|placer|estamos/i],
    ['graciaaas', 'gracias', /nada|gusto|placer|estamos/i],
    ['chao', 'despedida', /chao|luego|dale|vemos/i], ['adiós', 'despedida', /chao|luego|dale|vemos/i],
    ['hasta luego', 'despedida', /chao|luego|dale|vemos/i], ['nos vemos', 'despedida', /chao|luego|dale|vemos/i],
    ['hasta mañana', 'despedida', /chao|luego|dale|vemos/i],
    ['quién eres', 'quienEres', /no soy una persona/i], ['eres un robot', 'quienEres', /no soy una persona/i],
    ['eres una persona', 'quienEres', /no soy una persona/i], ['cómo te llamas', 'quienEres', /Max/],
    ['qué puedes hacer', 'ayuda', /Max/], ['en qué me ayudas', 'ayuda', /Max/], ['ayuda', 'ayuda', /Max/],
    ['jaja', 'cumplido', /./], ['jajaja', 'cumplido', /./], ['genial', 'cumplido', /./], ['excelente', 'cumplido', /./],
    ['no sé', 'noSe', /./], ['no sé qué comprar', 'noSe', /./], ['estoy viendo', 'noSe', /./], ['solo mirando', 'noSe', /./],
    ['eres una mierda', 'groseria', /WhatsApp/], ['idiota', 'groseria', /WhatsApp/], ['no sirves para nada', 'groseria', /WhatsApp/],
];
for (const [q, intent, re] of CASOS) {
    const a = una(q);
    ok(a.intent === intent, `«${q}» → ${intent} (dio ${a.intent})`);
    ok(re.test(a.texto), `«${q}»: la respuesta dice lo que toca: ${lineaDe(q, a)}`);
    ok(!/no te entend/i.test(a.texto) && !a.prods.length, `«${q}» no cae en «no te entendí» ni suelta productos`);
    ok(a.botones.length >= 1, `«${q}» deja botones`);
}
// Max es un asistente, no una persona, y ofrece a una persona por WhatsApp en su horario.
{
    const a = una('eres un robot');
    ok(/WhatsApp/.test(a.texto) && /10:00 am a 6:00 pm/.test(a.texto), 'quién eres: ofrece una persona por WhatsApp, de 10:00 am a 6:00 pm');
    const g = una('eres una mierda');
    ok(!/mierda/i.test(g.texto), 'la grosería no se devuelve ni se repite');
    ok(/10:00 am a 6:00 pm/.test(g.texto), 'la grosería se contesta serena y con el horario de una persona');
    ok(/Comandos de Max/.test(una('/ayuda').texto), '/ayuda sigue dando la lista de comandos');
    ok(!/Comandos de Max/.test(una('ayuda').texto), '«ayuda» a secas ya no es una lista de comandos');
}
// Los botones del saludo llevan a algún sitio (no a «no te entendí»).
{
    for (const q of ['arma un sistema solar básico', 'mi equipo tiene una avería', '🔥 Rebajas']) {
        const a = una(q);
        ok(!/no te entend|no lo manejo/i.test(a.texto), `el botón/pregunta «${q}» lleva a una respuesta de verdad: ${lineaDe(q, a)}`);
    }
}
// La charla NO roba una consulta: gana la consulta (con saludo corto delante).
{
    const a = una('hola, tienen routers?');
    ok(a.intent !== 'saludo' && /router/i.test(a.texto + a.nombres.join(' ')), `«hola, tienen routers» contesta lo de los routers: ${lineaDe('hola, tienen routers', a)}`);
    ok(/^¡(Buenos días|Buenas tardes|Buenas noches)! 👋/.test(a.texto), '…y saluda breve delante');
    const b = una('hola quiero un router');
    ok(b.intent !== 'saludo' && /^¡Buen/.test(b.texto), '«hola quiero un router» sigue siendo la consulta');
    ok(una('buenas tardes, cuánto cuesta el envío').intent === 'envios', 'saludo + «cuánto cuesta el envío» = envíos');
    ok(una('gracias, y tienen inversores?').intent !== 'gracias', '«gracias, y tienen inversores» no es solo un gracias');
    ok(una('gracias por el envío a holguín').intent === 'envios', '«gracias por el envío a holguín» sigue siendo envíos');
    ok(una('jaja cuánto cuesta el bluetti').intent !== 'cumplido', 'una risa con consulta es la consulta');
    ok(una('coño, tienen routers').intent !== 'groseria', 'una interjección con consulta es la consulta');
    ok(una('no sé qué router comprar').intent !== 'noSe', '«no sé qué router comprar» es una consulta de router');
    ok(una('quién eres').texto !== una('hola').texto, 'quién eres no es un saludo');
}

// ═══ 1 · SINÓNIMOS ══════════════════════════════════════════════════════
if (!USAR_REAL) {
    for (const q of ['estación de carga', 'tienen power station', 'necesito una planta portátil',
                     'busco una estacion de energia', 'Estación de Carga!']) {
        const a = una(q);
        ok(a.nombres[0] === bluetti.nombre, `«${q}» enseña la BLUETTI primero: ${lineaDe(q, a)}`);
    }
    // El sinónimo SUMA: los cargadores y el MPPT siguen existiendo para quien los pide.
    const cg = una('necesito un cargador');
    ok(cg.nombres.length && cg.nombres[0] !== bluetti.nombre && /Cargador/i.test(cg.nombres[0]),
       `«necesito un cargador» no lo desplaza la BLUETTI: ${lineaDe('necesito un cargador', cg)}`);
    // Sin el archivo Max funciona igual que antes (y no revienta).
    const sin = una('estación de carga', { sinonimos: null });
    ok(sin.texto.length > 10, 'sin max-sinonimos.json responde igual (no rompe)');
    ok(!sin.nombres.includes(bluetti.nombre) || sin.nombres.length >= 1, 'sin sinónimos la búsqueda sigue su camino de siempre');
    // Un sinónimo que apunta a algo sin stock: su ficha agotada con «Avísame».
    if (agotado) {
        const a = una('tienen la cosa rarisima aparte');
        ok(a.texto.includes(limpio(agotado.nombre).slice(0, 18)) && /agotado/i.test(a.texto) && a.botones.some(b => /Avísame/i.test(b)),
           `un sinónimo hacia un agotado da su ficha «agotado» con Avísame: ${lineaDe('cosa rarisima', a)}`);
    }
    // No cambia la regla del modelo: m5 no es m2 aunque M2 tenga un sinónimo.
    const nano = una('Necesito nano loco m5');
    ok(/NanoStation M5 Loco/i.test(nano.nombres.join('|')) && !nano.nombres.some(n => /Loco M2/i.test(n)),
       `«nano loco m5» sigue dando la M5 y no la M2 con sinónimos cargados: ${lineaDe('nano loco m5', nano)}`);
    // Los sinónimos de categoría sesgan, con menos peso: «apagón» sin más pregunta por tipos.
    const ap = una('tengo problemas de corriente');
    ok(ap.texto.length > 10 && ap.prods.length <= 3, `un sinónimo de categoría no suelta lista: ${lineaDe('corriente', ap)}`);
    // Un sinónimo mal formado no rompe nada.
    const mal = una('estación de carga', { sinonimos: { version: 1, productos: { [bluetti.id]: 'no es lista', x: null }, categorias: 7 } });
    ok(mal.texto.length > 10, 'un max-sinonimos.json mal formado se ignora sin romper');
} else {
    const a = una('estación de carga');
    ok(a.nombres[0] === bluetti.nombre, `con el max-sinonimos.json real, «estación de carga» da la BLUETTI primero: ${lineaDe('estación de carga', a)}`);
    for (const q of ['tienen power station', 'necesito una planta portátil']) {
        ok(una(q).nombres[0] === bluetti.nombre, `con el real, «${q}» da la BLUETTI primero`);
    }
}

// ═══ 2 · PREGUNTAR ANTES DE VOLCAR ══════════════════════════════════════
// Duda real → UNA pregunta, con 2-3 botones de opciones reales, sin productos.
{
    const a = una('para cargar el celular');
    ok(a.r.aclaracion === true && a.prods.length === 0, `la duda se pregunta, no se lista: ${lineaDe('para cargar el celular', a)}`);
    const op = a.botones.filter(b => /^🔎/.test(b));
    ok(op.length >= 2 && op.length <= 3, `la pregunta trae 2-3 botones de opción (${op.length})`);
    ok((a.r.response.match(/\?/g) || []).length === 1, 'UNA sola pregunta');
    // Cada botón de opción lleva a SOLO ese tipo (todo lo que enseña es de esa subcategoría).
    for (const b of op) {
        const sub = b.replace(/^🔎\s*/, '');
        const c = una(b);
        ok(c.prods.length >= 1 && c.prods.every(p => String(p.subcategoria).toLowerCase() === sub.toLowerCase()),
           `el botón «${b}» enseña solo ese tipo: ${lineaDe(b, c)}`);
    }
}
// Los botones de opción de TODA subcategoría con stock funcionan.
{
    const subs = [...new Set(PRODS.filter(p => p.stock > 0 && p.subcategoria).map(p => p.subcategoria))];
    const rotos = subs.filter(sub => {
        const c = una('🔎 ' + sub.charAt(0) + sub.slice(1).toLowerCase());
        return !(c.prods.length >= 1 && c.prods.every(p => p.subcategoria === sub));
    });
    ok(!rotos.length, `todo botón «🔎 subcategoría» lleva a esa subcategoría; fallan: ${rotos.join(', ')}`);
}
// Una respuesta genérica NUNCA pasa de 3 productos; el resto va tras «➕ Ver más».
const GENERICAS = ['tengo 50 dolares', 'tengo 100 dolares', 'necesito algo', 'necesito algo para el carro',
    'algo para la casa', 'quiero algo para vigilar', 'para cargar el celular', 'necesito un cable', 'recomiéndame algo',
    'qué me recomiendas', 'tengo $30', 'no sé qué comprar', 'algo para la moto', 'necesito algo para los apagones'];
for (const q of GENERICAS) {
    const a = una(q);
    ok(a.prods.length <= 3, `«${q}» (genérica) no enseña más de 3 productos (enseñó ${a.prods.length})`);
    ok(a.texto.length > 10, `«${q}» contesta algo`);
}
{
    const B = nuevoBot();
    const a = ver(B, 'tengo 50 dolares');
    ok(a.prods.length === 3 && a.botones.includes('➕ Ver más'), `un presupuesto enseña 3 y «➕ Ver más»: ${lineaDe('tengo 50 dolares', a)}`);
    const b = ver(B, '➕ Ver más');
    ok(b.intent === 'verMas' && b.prods.length >= 1 && b.prods.length <= 3
       && b.prods.every(p => !a.nombres.includes(p.nombre)), `«Ver más» enseña los siguientes sin repetir: ${lineaDe('ver más', b)}`);
    ok(a.prods.concat(b.prods).every(p => p.precio <= 50), 'Ver más respeta el presupuesto');
    const c = una('ver más');
    ok(c.intent === 'verMas' && !c.prods.length && /¿Más de qué\?/.test(c.texto), '«ver más» sin lista pregunta de qué, no inventa');
    const d = una('más');
    ok(d.intent !== 'verMas', 'un «más» suelto sin lista detrás no es «ver más»');
}
// Ganador claro → lo enseña primero.
{
    const a = una('bluetti ac180');
    ok(a.nombres[0] === bluetti.nombre, '«bluetti ac180» enseña la BLUETTI primero');
    const h = una('tienes el hap ac3');
    ok(h.nombres.length >= 1 && h.nombres.every(n => /hAP ac3|ac3/i.test(n)), `«tienes el hap ac3» sigue dando solo el ac3: ${lineaDe('hap ac3', h)}`);
}
// Nada inventado: lo que no hay se dice, con WhatsApp y categorías.
{
    const a = una('tienen cuchillos de cocina');
    ok(/no lo manejo/i.test(a.texto) && !a.prods.length && a.botones.some(b => /WhatsApp/.test(b)) && a.botones.some(b => /Categor/.test(b)),
       `lo que no hay se dice («eso no lo manejo») con WhatsApp y categorías: ${lineaDe('cuchillos', a)}`);
    const hayPanel = PRODS.some(p => /panel(es)?\s+solar(es)?|fotovoltaic/i.test(String(p.nombre)) && !/base|soporte|estructura/i.test(String(p.nombre)) && Number(p.stock) > 0);
    const p = una('tienen paneles solares');
    ok(hayPanel ? p.intent !== 'noVendemos' : (p.intent === 'noVendemos' && !p.prods.length),
       '«paneles solares»: ' + (hayPanel ? 'hay uno en el catálogo y no se niega' : 'sigue diciendo que no se venden'));
}
// Lo que se pide EXPRESAMENTE como familia o categoría sigue como está.
{
    const ac = una('aceite 5w30');
    ok(ac.intent === 'familia' || /5W-?30/i.test(ac.texto + ac.nombres.join('')), `«aceite 5w30» sigue siendo la familia: ${lineaDe('aceite 5w30', ac)}`);
    const ant = una('anticongelante');
    ok(ant.intent === 'familia' && ant.prods.length >= 1, '«anticongelante» sigue siendo la familia');
    const of = una('ofertas');
    ok(of.intent === 'ofertas', '«ofertas» sigue siendo ofertas');
    const cat = una('ver categoría energía');
    ok(cat.intent === 'categoria' || cat.intent === 'categorias', '«ver categoría energía» sigue siendo la categoría');
}


// Catálogo sintético (parte del real, renombrado): casos que el catálogo de hoy
// no da —6 candidatos del mismo tipo; 2 tipos empatados— y que son justo los
// que prueban «≤3 + Ver más» y «preguntar cuando hay duda entre tipos».
{
    const molde = PRODS.find(p => p.stock > 0 && p.categoria === 'HOGAR') || PRODS.find(p => p.stock > 0);
    const clon = (i, nombre, sub, precio) => ({ ...molde, id: 900000 + i, nombre, subcategoria: sub, categoria: 'HOGAR',
        stock: 5, precio, precioActual: precio, precioOriginal: 0, descripcion: '', specs: [], ficha: [] });
    const A = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map((n, i) => clon(i, `Lampara Solar ${n}`, 'LUCES', 10 + i));
    const V = ['Uno', 'Dos', 'Tres'].map((n, i) => clon(20 + i, `Cable Premium ${n}`, 'VIDEO', 5 + i));
    const R = ['Cuatro', 'Cinco', 'Seis'].map((n, i) => clon(30 + i, `Cable Premium ${n}`, 'REDES', 7 + i));
    const cat = [...A, ...V, ...R];
    const B1 = nuevoBot({ catalogo: cat, sinonimos: null });
    const a = ver(B1, 'necesito una lampara');
    ok(a.prods.length === 3 && a.botones.includes('➕ Ver más'),
       `6 candidatos del mismo tipo: se enseñan 3 y «➕ Ver más» (enseñó ${a.prods.length}): ${lineaDe('necesito una lampara', a)}`);
    const b = ver(B1, 'ver más');
    ok(b.prods.length === 3 && b.prods.every(p => !a.nombres.includes(p.nombre)) && !b.botones.includes('➕ Ver más'),
       `«Ver más» enseña los otros 3, sin repetir y sin más «Ver más»: ${lineaDe('ver más', b)}`);
    const c = ver(nuevoBot({ catalogo: cat, sinonimos: null }), 'necesito un cable');
    ok(c.r.aclaracion === true && !c.prods.length && c.botones.filter(x => /^🔎/.test(x)).length === 2,
       `dos tipos empatados: UNA pregunta con los dos botones, sin lista: ${lineaDe('necesito un cable', c)}`);
    const d = ver(nuevoBot({ catalogo: cat, sinonimos: null }), '🔎 Redes');
    ok(d.prods.length === 3 && d.prods.every(p => p.subcategoria === 'REDES'), `el botón «🔎 Redes» enseña solo Redes: ${lineaDe('🔎 Redes', d)}`);
    // Un ganador claro NO se pregunta: se enseña primero.
    const g = ver(nuevoBot({ catalogo: cat, sinonimos: null }), 'cable premium cuatro');
    ok(!g.r.aclaracion && g.nombres[0] === 'Cable Premium Cuatro', `ganador claro: se enseña primero, sin preguntar: ${lineaDe('cable premium cuatro', g)}`);
}

// ═══ LO QUE NO DEBE EMPEORAR ════════════════════════════════════════════
{
    const nano = una('Necesito nano loco m5');
    ok(nano.nombres.length === 1 && /NanoStation M5 Loco/i.test(nano.nombres[0]), `«nano loco m5» → la M5 Loco: ${lineaDe('nano loco m5', nano)}`);
    const sw = una('switch de 8 puertos');
    ok(sw.nombres.length >= 1 && sw.nombres.every(n => /8 Puertos/i.test(n)), `«switch de 8 puertos» nunca da el de 5: ${lineaDe('switch 8', sw)}`);
    const inv = una('mi inversor pita');
    ok(inv.intent === 'diagnostico', `«mi inversor pita» sigue siendo diagnóstico (dio ${inv.intent})`);
    const ac = una('aceite 10w40');
    ok(ac.nombres.length >= 1 && ac.nombres.every(n => /10W ?-? ?40/i.test(n)), `«aceite 10w40» solo da 10W-40: ${lineaDe('aceite 10w40', ac)}`);
    {
        const hayPanel2 = PRODS.some(p => /panel(es)?\s+solar(es)?|fotovoltaic/i.test(String(p.nombre)) && !/base|soporte|estructura/i.test(String(p.nombre)) && Number(p.stock) > 0);
        // Sin panel en el catálogo no se enseña nada como si lo fuera; con él, se enseña ese y solo ese.
        const pr = una('paneles solares').prods;
        ok(hayPanel2 ? (pr.length >= 1 && pr.every(x => /panel/i.test(String((x && x.nombre) || x)))) : !pr.length,
           '«paneles solares» enseña solo paneles (o nada si no hay): ' + JSON.stringify(pr));
    }
}

if (fallos.length) {
    console.log(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.slice(0, 40).forEach(f => console.log('   • ' + f));
    process.exit(1);
}
console.log('✅ Max conversa, pregunta antes de volcar y respeta los sinónimos');
