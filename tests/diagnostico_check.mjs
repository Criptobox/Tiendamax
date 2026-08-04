/* Regresión del diagnóstico de averías — js/src/tm-bot-cerebro.src.js
 *
 * Lo que se protege es una promesa: Max NO inventa el significado de un
 * código de error. Los códigos numéricos dependen del fabricante ("04" no es
 * lo mismo en un Must que en un Powmr) y viven en codigos-error.json, que se
 * llena copiando manuales. Si alguien hace que el bot conteste igual sin ese
 * dato — encabezando con el síntoma más probable, por ejemplo — el cliente lee
 * una deducción como si fuera la lectura de su código, y en eléctrica eso
 * puede costarle el equipo. Nada falla ni avisa: solo empieza a mentir bonito.
 *
 * Se ejecuta contra el fichero real de producción.
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
const texto = (r) => String(r.response || '').replace(/<[^>]+>/g, '');

// ── La promesa: un código desconocido no se traduce ──────────────────────
for (const frase of ['mi inversor da error 04', 'el inversor marca F05', 'código 27 en el inversor']) {
    const t = texto(B.diagnosticar(frase));
    ok(/no lo tengo|no tengo el manual/i.test(t),
        `"${frase}" debe decir que no tiene ese código, no traducirlo`);
    ok(/marca y modelo/i.test(t),
        `"${frase}" debe pedir marca y modelo para poder confirmarlo`);
}

// Con síntomas reales SÍ puede deducir, pero primero avisa de que deduce.
const mixto = texto(B.diagnosticar('mi inversor pita con la luz roja y marca error 04'));
const iAviso = mixto.search(/no lo tengo|no tengo el manual/i);
const iDiag = mixto.search(/sobrecarga/i);
ok(iAviso >= 0 && iDiag >= 0 && iAviso < iDiag,
    'con código desconocido, el aviso debe ir ANTES del diagnóstico deducido');
ok(/deducido de los s[ií]ntomas|no le[ií]do de tu c[oó]digo/i.test(mixto),
    'la deducción debe presentarse como deducción, no como lectura del código');

// ── Encaminado: lo que es avería y lo que no ─────────────────────────────
const AVERIAS = [
    ['mi inversor pita y tiene la luz roja encendida', 'sobrecarga'],
    ['el inversor se apaga cuando arranca la nevera', 'arranca'],
    ['el controlador mppt no carga aunque hay sol', 'no carga'],
    ['la antena cpe no enciende', 'poe'],
    ['el router se cae cada rato', 'se cae'],
    ['conecta al wifi pero no hay internet en el router', 'no hay internet'],
    ['mi bateria esta hinchada y huele', 'hinchada'],
];
for (const [frase, esperado] of AVERIAS) {
    ok(B.detectIntent(frase) === 'diagnostico', `"${frase}" debería ir a diagnóstico`);
    ok(texto(B.diagnosticar(frase)).toLowerCase().includes(esperado),
        `"${frase}" debería reconocerse como "${esperado}"`);
}

// Estas son consultas de compra: si el diagnóstico se las queda, el cliente
// que quería comprar recibe una guía de averías.
for (const frase of [
    'qué router tiene puerto WAN', 'compara el router Tenda vs el Archer',
    'arma un sistema solar básico', 'tengo $100, qué cámara me recomiendas',
    'este inversor funciona con mi nevera',
    'cuánto dura una batería de 100Ah con mi nevera',
    'háblame del inversor Tataliken', 'hacen envíos a Santiago',
]) {
    ok(B.detectIntent(frase) !== 'diagnostico', `"${frase}" NO debería ir a diagnóstico`);
}

// ── El aparato correcto ──────────────────────────────────────────────────
// "la cámara no conecta al wifi" se clasificaba como router por el "wifi",
// y perdía el diagnóstico de cámara, que es el útil (2.4 GHz vs 5 GHz).
ok(B.familiaDelTexto('la camara no conecta al wifi') === 'CÁMARAS',
    'el nombre del aparato debe pesar más que la palabra "wifi"');
ok(B.familiaDelTexto('el router se cae') === 'ROUTERS', 'router debe detectarse');
ok(B.familiaDelTexto('no hay internet') === 'ROUTERS',
    'sin aparato nombrado, "internet" sí puede resolver a router');
ok(B.familiaDelTexto('quiero comprar algo') === null,
    'sin señales, no debe adivinar aparato');

// ── Seguridad ────────────────────────────────────────────────────────────
const bat = texto(B.diagnosticar('mi bateria esta hinchada y huele'));
ok(/no la cargues|deja de usarla/i.test(bat),
    'una batería hinchada debe llevar primero a dejar de usarla');
ok(/no abras/i.test(texto(B.diagnosticar('mi inversor pita y tiene la luz roja'))),
    'debe advertir de no abrir el aparato (riesgo + anula la garantía)');
for (const d of B.DIAGNOSTICO) {
    const todo = (d.significa + ' ' + d.pasos.join(' ')).toLowerCase();
    ok(!/\b(abre|abrir|destapa|desarma|suelda|soldar)\b.*(aparato|equipo|inversor|router|c[aá]mara)/.test(todo),
        `"${d.titulo}" no debe mandar a abrir el aparato`);
    ok(d.pasos.length > 0 && d.significa, `"${d.titulo}" debe explicar qué pasa y qué hacer`);
    ok(/^[A-ZÁÉÍÓÚÑ0-9]/.test(d.titulo), `"${d.titulo}" mal formado`);
}

// ── Cuando no sabe, lo dice ──────────────────────────────────────────────
const nada = texto(B.diagnosticar('le pasa algo raro no sé'));
ok(/qu[eé] aparato|cu[eé]ntame|vamos a ver/i.test(nada),
    'sin datos suficientes debe pedir información, no inventar un diagnóstico');

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ diagnóstico: todas las comprobaciones pasan');
