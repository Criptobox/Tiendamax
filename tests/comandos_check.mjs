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

// ── Lo que salió de auditar 602 preguntas con cuatro auditores ───────────
// Ninguna fallaba. Todas devolvían una respuesta bien escrita, de otro tema.

// La palabra suelta que se llevaba la pregunta a otra intención. Cada una
// dejaba inalcanzable algo que sí existe.
{
    // "cobertura" es como se pide un repetidor aquí — y hasta el producto se
    // llama "Repetidor Wi-fi Extensor de Cobertura". Se iba a la tabla de
    // provincias de envíos.
    ok(intent('quiero mejorar la cobertura de mi casa') !== 'envios',
        'la cobertura del wifi no es la cobertura de los envíos');
    ok(intent('cual es la cobertura de envio') === 'envios',
        'pero la cobertura del envío sí sigue siendo envíos');
    // "cambio" se llevaba "¿a cómo está el cambio?" a devoluciones.
    ok(intent('cual es la tasa de cambio') === 'tasa', 'la tasa de cambio es la tasa');
    ok(intent('a como esta el cambio') === 'tasa', 'preguntar por el cambio es la tasa');
    ok(intent('quiero devolver el producto') === 'devolucion', 'devolver sigue siendo devolución');
    // "transferencia" dejaba inalcanzables dos productos que se llaman así.
    const tr = B.responder('tienen transferencia automatica');
    ok((tr.products || []).some(p => /transferencia/i.test(p.nombre)),
        'los productos que se llaman "Transferencia" deben poder buscarse por su nombre');
    ok(intent('aceptan transferencia bancaria') === 'pago',
        'la transferencia bancaria sí es una pregunta de pago');
}

// El ruido del scoring: "un" contaba como término de búsqueda y casaba DENTRO
// de otras palabras ("g-un", "com-un-icador"). Una pistola de masaje sacaba 21
// puntos con "quiero un inversor powmr", a dos del inversor de verdad.
{
    // La lista de palabras vacías se pina por estructura: con la comparación
    // por principio de palabra ya no hace falta para ESTE caso, pero es la que
    // evita que un "de" o un "que" sumen puntos en cualquier otra búsqueda.
    const srcSc = readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8');
    // Se ancla a la línea de scoreProduct (`let qWords`), no al patrón suelto:
    // _matchFuerte usa el mismo filtro con `const qWords` y está justo entre
    // scoreProduct y findProducts, así que cualquier recorte por posición se
    // lo tragaba y la comprobación pasaba con el scoring ya roto.
    ok(/let qWords = q\.split\(' '\)\.filter\(w => w\.length > 1 && !_VACIAS\.has\(w\)\);/.test(srcSc),
        'scoreProduct tiene que descartar las palabras vacías: si no, "de" y "que" puntúan como términos');
    for (const [q, fuera] of [
        ['quiero un inversor powmr', /masaje|timbre/i],
        ['un router bueno', /masaje|timbre/i],
        ['me hace falta una bateria de litio', /buceo|cerradura/i],
    ]) {
        const r = B.responder(q);
        const nombres = (r.products || []).map(p => p.nombre).join(' | ');
        ok(!fuera.test(nombres), `"${q}" saca productos de otro mundo: ${nombres}`);
    }
}

// Plurales: el catálogo está en singular y la gente pregunta en plural.
// "tienen neveras" caía en "no te entendí" teniendo una nevera de $250.
{
    for (const [q, esperado] of [
        ['tienen neveras', /nevera/i], ['tienen lavadoras', /lavadora/i],
        ['tienen televisores', /tv|televis/i], ['tienen repetidores', /repetidor/i],
    ]) {
        const r = B.responder(q);
        const nombres = (r.products || []).map(p => p.nombre).join(' | ');
        // El texto cuenta igual que las tarjetas: lo que se comprueba acá es
        // que el plural se entienda, no que haya stock. Cuando el producto
        // está agotado —los dos repetidores lo están— Max lo nombra y dice
        // que no queda, y eso ES haberlo encontrado; mirando solo r.products
        // no se distinguía de un "no te entendí".
        const dicho = nombres + ' ' + String(r.response || '').replace(/<[^>]*>/g, ' ');
        ok(esperado.test(dicho), `"${q}" no encuentra lo que sí hay: ${nombres || '(nada)'}`);
        ok(!/no te entend|no entiendo/i.test(r.response || ''),
            `"${q}" cae en "no te entendí" — el plural no se está resolviendo`);
    }
}

// Cómo se dice aquí: "bocina" es la palabra cubana y no está en ningún nombre
// del catálogo, pero la Xiaomi Sound sí está en stock.
{
    const r = B.responder('bocina');
    ok((r.products || []).some(p => /sound|audifono/i.test(p.nombre)),
        '"bocina" debe llegar al audio que sí hay');
}

// "para carro" / "para moto": no distinguen nada, y con ellas contando
// cualquier frase sacaba el "Ventilador Para Carro" como ficha única. Los 12
// aceites del catálogo eran invisibles a la consulta más natural que existe.
{
    const r = B.responder('tienen aceite para carro');
    const nombres = (r.products || []).map(p => p.nombre).join(' | ');
    ok(/aceite|mannol|fanfaro/i.test(nombres), `"tienen aceite para carro" da: ${nombres}`);
    ok(!/ventilador/i.test(nombres), 'y no puede dar el ventilador de carro');
}

// Lo que NO se vende se dice. Antes la búsqueda difusa contestaba "tienen
// paneles solares" con un interruptor de transferencia, y el cliente se iba
// creyendo que sí.
{
    // 'tienen cable de red' salió de esta lista: el catálogo ahora trae un
    // Patch Cord Cat6A con 300 unidades, así que decir "no lo vendo" sería
    // mentir. Lo que se comprueba de ese caso está justo debajo.
    for (const q of ['tienen paneles solares', 'venden placas solares',
                     'cuanto cuesta una laptop',
                     'tienen tarjetas sim']) {
        ok(intent(q) === 'noVendemos', `"${q}" → ${intent(q)}, debería decir que no lo vende`);
    }
    const r = B.responder('tienen paneles solares');
    ok(/no vendo|no manejo/i.test(r.response), 'tiene que decirlo con todas las letras');
    ok(!(r.products || []).length, 'y no enseñar productos como si fueran eso');
    // Pero preguntar QUÉ ES sigue siendo una explicación.
    ok(intent('que es un panel solar') === 'tecnico',
        'preguntar qué es un panel solar sigue siendo una explicación');
}
// Lo que entró al catálogo se vende, aunque alguna vez no se vendiera. El
// cable de red estuvo en NO_VENDEMOS hasta que entraron 300 unidades.
{
    const r = B.responder('tienen cable de red');
    ok(!/no vendo|no manejo/i.test(r.response),
        'el catálogo tiene cable de red con stock: Max no puede decir que no lo vende');
    ok((r.products || []).some(p => /cable/i.test(p.nombre)),
        'y tiene que enseñar el cable');
}

// Nada de la lista puede estar de verdad en el catálogo: decirle que no a un
// cliente por algo que sí tienes es peor que el fallo que esto arregla.
{
    const catalogo = sb.productos || [];
    for (const item of B.NO_VENDEMOS) {
        const encontrado = catalogo.filter(p => Number(p.stock) > 0 && item.re.test(p.nombre || ''));
        ok(!encontrado.length,
            `NO_VENDEMOS dice que no hay "${item.que}" pero el catálogo tiene: ${encontrado.map(p => p.nombre).join(', ')}`);
    }
}

// "Ese producto lo tenemos" solo si de verdad se parece a lo que pidieron.
// "tienen bocina JBL" —marca que no existe— contestaba "lo tenemos pero está
// agotado", y el vendedor quedaba desmentido por WhatsApp.
{
    const r = B.responder('tienen bocina jbl');
    ok(!/lo tenemos/i.test(r.response), 'no puede afirmar tener una marca que no existe');
    // El guard se pina por estructura además de por comportamiento: hoy esa
    // pregunta ya encuentra la Xiaomi que sí hay, así que no llega a la rama
    // del agotado. Si el filtro se quita, vuelve el "ese producto lo tenemos"
    // ante cualquier coincidencia difusa, y eso no se vería aquí.
    const src = readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8');
    ok(/const agotadoReal = agotados\.find\(p => _matchFuerte\(p, _qa\)\)/.test(src),
        'el agotado que se anuncia tiene que casar de verdad con lo que pidieron');
    // Y no se promete una lista de alternativas que luego no llega.
    // Solo la frase que PROMETE una lista a continuación; la ficha de un
    // producto agotado también dice "alternativas" y ahí es una oferta, no
    // una promesa incumplida.
    for (const q of ['tienen linterna', 'tienen toldo', 'bocina', 'que mal servicio']) {
        const x = B.responder(q);
        if (/alternativas (similares )?disponibles<\/strong>:|alternativas disponibles<\/strong>:/i.test(x.response)) {
            ok((x.products || []).length > 0,
                `"${q}" promete alternativas y no enseña ninguna`);
        }
    }
}

// La autonomía no puede estampar una capacidad supuesta DEBAJO del nombre
// propio de un producto: ahí no se lee como estimación, se lee como ficha.
{
    const r = B.responder('cuanto dura la bateria automotriz lubrim con la tv');
    ok(/no tengo los ah|no puedo calcularte/i.test(r.response),
        'sin Ah/V declarados hay que decirlo, no inventar 100Ah bajo su nombre');
    ok(!/lubrim[^\n]*100ah/i.test(r.response.replace(/<[^>]+>/g, '')),
        'no puede aparecer "100Ah" en la misma línea que el nombre del producto');
    // Y los Ah que escribe el cliente mandan.
    const r2 = B.responder('cuanto dura una bateria de 200ah con la nevera');
    ok(/200ah/i.test(r2.response), 'si el cliente dice 200Ah, se usan 200Ah');
    ok(/16\.0 horas|16 horas/i.test(r2.response), `200Ah×12V÷150W = 16h, dio: ${r2.response.slice(0, 200)}`);
}

// Seguridad: la batería hinchada es la única entrada urgente de la tabla, y
// en pretérito ("se hinchó") no llegaba — daba un catálogo de baterías.
{
    for (const q of ['mi bateria se hincho', 'la bateria se inflo', 'mi bateria esta hinchada']) {
        const r = B.responder(q);
        ok(/deja de usarla|no la cargues/i.test(r.response),
            `"${q}" debe llevar al aviso de seguridad, dio: ${r.response.slice(0, 90)}`);
    }
}

// El precio inventado: "Tarjeta microSD — desde $150.00" salía de una funda de
// asiento de coche, el primer producto de la subcategoría ACCESORIOS.
{
    const acc = B.ACCESORIOS_AUTOMATICOS['CÁMARAS'] || [];
    const sd = acc.find(a => /microsd/i.test(a.que));
    ok(!sd || !sd.subcat,
        'la microSD no se vende: con subcat le pone el precio del primer accesorio que pille');
}

// Y la tasa dentro de los métodos de pago: la plantilla se evaluaba al cargar
// el módulo, cuando TASA_MN todavía vale 0. La respuesta más consultada decía
// "0 MN = 1 USD" siempre, en producción.
{
    const mn = B.METODOS_PAGO.find(x => /Efectivo MN/i.test(x.metodo));
    ok(mn && typeof mn.detalle === 'function',
        'el detalle con la tasa tiene que ser función, o se congela el 0 del arranque');
    const pago = B.responder('que metodos de pago aceptan').response;
    ok(!/\b0 MN = 1 USD/.test(pago), 'la respuesta de pagos no puede decir "0 MN = 1 USD"');
}

// ── Nauta Hogar / ETECSA ─────────────────────────────────────────────────
// Aquí Nauta Hogar es EL internet de casa y la pregunta llega a diario. La
// respuesta honesta es que esos módems no se venden —los da ETECSA—, así que
// lo importante es que Max lo diga y ofrezca lo que sí hay, en vez de soltar
// una búsqueda de productos que no resuelve el viaje.
for (const q of ['venden modems para nauta hogar', 'tienen modem para nauta',
                 'como mejoro la señal de mi nauta hogar', 'equipo de etecsa',
                 'que router me sirve para nauta hogar', 'necesito un repetidor para nauta hogar']) {
    ok(intent(q) === 'nautaHogar', `"${q}" → ${intent(q)}, esperaba nautaHogar`);
}
// Pero preguntar QUÉ ES uno de esos términos sigue yendo al glosario: las
// entradas de RJ11/ADSL/Nauta Hogar existen y quedaban inalcanzables detrás
// de la intención nueva — el mismo fallo que ya tuvo "¿qué es un inversor?".
for (const q of ['que es rj11', 'que es nauta hogar', 'que es adsl',
                 'para que sirve un repetidor', 'que significa adsl']) {
    ok(intent(q) === 'tecnico', `"${q}" → ${intent(q)}, debería explicar el término`);
}
{
    // No se puede prometer lo que no se vende.
    const r = B.responder('venden modems para nauta hogar');
    ok(/no los vendemos|no vendemos/i.test(r.response),
        'Max debe decir claramente que los módems de Nauta Hogar no los vende');
    ok(/etecsa/i.test(r.response), 'y que los provee ETECSA');
}
{
    // Los repetidores del catálogo están en la subcategoría ACCESORIOS, no en
    // una llamada REPETIDOR: filtrar por subcategoría no encontraba ninguno y
    // el botón "Ver Repetidores" que el propio bot ofrece no llevaba a nada.
    const r = B.responder('quiero un repetidor para nauta hogar');
    const hayEnCatalogo = (sb.productos || []).some(p =>
        Number(p.stock) > 0 && /repetidor|extensor/i.test(p.nombre || ''));
    if (hayEnCatalogo) {
        ok((r.products || []).length > 0,
            'hay repetidores con stock y Max no enseña ninguno');
        ok((r.products || []).every(p => /repetidor|extensor|amplificador/i.test(p.nombre)),
            'lo que enseña como repetidor tiene que serlo');
    }
    // Y el precio sale del campo que el cerebro normaliza: con `precioActual`
    // —que solo existe en el JSON crudo— salía $0.00 en cada línea.
    ok(!/\$0\.00|\$undefined/.test(r.response),
        'los precios de la lista de Nauta Hogar salen vacíos');
}

// ── Garantía: no se promete lo que no se cumple ──────────────────────────
{
    const g = B.responder('tienen garantia').response;
    ok(/no es universal/i.test(g), 'la garantía general debe decir que NO es universal');
    for (const excl of ['mal uso', 'golpes', 'voltaje', 'instalaci']) {
        ok(new RegExp(excl, 'i').test(g), `la política debe nombrar la exclusión "${excl}"`);
    }
    ok(!/todos los productos tienen garant/i.test(g),
        'no puede volver a prometerse garantía para todo');
}

// ── Pagos: el mensaje sale del dato, no de una lista escrita a mano ──────
{
    const pago = B.responder('que metodos de pago aceptan').response;
    for (const m of B.METODOS_PAGO.filter(x => x.disponible)) {
        ok(pago.includes(m.metodo), `"${m.metodo}" está activo y no sale en la respuesta`);
    }
    for (const m of B.METODOS_PAGO.filter(x => !x.disponible && !/pr[oó]ximamente/i.test(x.nota || ''))) {
        ok(pago.includes(m.metodo), `"${m.metodo}" está desactivado y debe salir como NO aceptado`);
    }
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
