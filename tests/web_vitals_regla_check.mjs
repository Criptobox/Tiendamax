/* ¿La muestra que manda el navegador pasa la regla que publica el repo?
 *
 * El agente de salud avisa por Telegram de "0 muestras: nadie está
 * reportando", pero desde el servidor no se puede saber por qué: si las
 * reglas rechazan las escrituras o si simplemente hay poco tráfico. Y el
 * snippet tampoco lo sabía — enviaba con sendBeacon, que devuelve true por
 * haber ENCOLADO, no por haber entregado.
 *
 * Esto cierra el hueco por el otro lado: coge el payload EXACTO que arma
 * js/web-vitals-snippet.js, lo pasa por las reglas EXACTAS de
 * firebase-rules.json, y dice si Firebase lo aceptaría. No sustituye a probar
 * contra el proyecto real (para eso está tmWebVitalsProbar en la consola),
 * pero sí impide que cliente y reglas se separen sin que nadie lo note, que es
 * como se llega a una métrica muerta durante meses.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGLAS = JSON.parse(readFileSync(join(RAIZ, 'firebase-rules.json'), 'utf8')).rules;
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

/* ── Un evaluador mínimo de reglas RTDB ──────────────────────────────────
   Solo entiende lo que usa esta regla: hasChildren, child().val(), isNumber,
   isString, .length, data.exists() y `now`. Se traduce a JS y se evalúa; con
   cualquier construcción que no reconozca, avisa en vez de dar por bueno. */
function evaluar(expr, { valor, now, existe }) {
    const soportado = /^[\s\w$'".,()!&|<>=+\-\[\]]*$/;
    if (!soportado.test(expr)) throw new Error('expresión no soportada: ' + expr);
    const newData = {
        hasChildren: (ks) => ks.every(k => valor != null && typeof valor === 'object' && k in valor),
        child: (k) => ({
            val: () => (valor && typeof valor === 'object') ? valor[k] : undefined,
            isNumber: () => typeof (valor || {})[k] === 'number',
            isString: () => typeof (valor || {})[k] === 'string',
        }),
        val: () => valor,
        isNumber: () => typeof valor === 'number',
        isString: () => typeof valor === 'string',
    };
    const data = { exists: () => !!existe };
    // eslint-disable-next-line no-new-func
    return new Function('newData', 'data', 'now', 'return (' + expr + ');')(newData, data, now);
}

/** Aplica el nodo de reglas a un payload. Devuelve [] si todo pasa. */
function validar(nodoReglas, payload, now) {
    const problemas = [];
    if (nodoReglas['.write'] !== undefined) {
        if (!evaluar(nodoReglas['.write'], { valor: payload, now, existe: false })) {
            problemas.push('.write deniega la escritura');
        }
    }
    if (nodoReglas['.validate'] !== undefined) {
        if (!evaluar(nodoReglas['.validate'], { valor: payload, now, existe: false })) {
            problemas.push('.validate del nodo falla: ' + nodoReglas['.validate']);
        }
    }
    const comodin = Object.keys(nodoReglas).find(k => k.startsWith('$'));
    for (const campo of Object.keys(payload || {})) {
        const r = nodoReglas[campo] || (comodin ? nodoReglas[comodin] : null);
        if (!r) continue;
        if (r['.validate'] === false) { problemas.push(`el campo "${campo}" no está permitido`); continue; }
        if (typeof r['.validate'] === 'string') {
            if (!evaluar(r['.validate'], { valor: payload[campo], now, existe: false })) {
                problemas.push(`el campo "${campo}" (${JSON.stringify(payload[campo])}) no pasa: ${r['.validate']}`);
            }
        }
    }
    return problemas;
}

/* ── El payload EXACTO que arma el snippet ───────────────────────────────
   Se saca del fichero, no se escribe a mano: si el snippet cambia de campos,
   este test tiene que enterarse. */
const SNIPPET = readFileSync(join(RAIZ, 'js/web-vitals-snippet.js'), 'utf8');
const bloque = SNIPPET.slice(SNIPPET.indexOf('var payload = {'), SNIPPET.indexOf('var conn = _conexion();'));
const campos = [...bloque.matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
ok(campos.length > 0, 'no consigo leer los campos del payload en el snippet');

const REGLA = REGLAS.web_vitals.$dia.$muestraId;
const AHORA = Date.now();

// El servidor resuelve {".sv":"timestamp"} a su propio reloj antes de validar.
const muestra = { lcp: 1840, cls: 0.052, inp: 96, ttfb: 420, conn: '4g' };
muestra.ts = AHORA;   // = now, que es lo que deja el .sv

// Los campos del snippet y los del payload de prueba tienen que ser los mismos.
for (const c of campos) {
    ok(c in muestra, `el snippet manda "${c}" y esta prueba no lo cubre — actualízala`);
}

// ── 1. Una muestra normal se acepta ──────────────────────────────────────
{
    const p = validar(REGLA, muestra, AHORA);
    ok(p.length === 0, 'una muestra normal debería aceptarse, pero: ' + p.join(' · '));
}

// ── 2. El reloj del visitante ya no decide ───────────────────────────────
// Este era el fallo: con Date.now() del móvil, una hora desfasada tiraba la
// muestra. Con .sv el ts SIEMPRE es el del servidor, así que ese caso no
// puede volver — y se comprueba que el snippet no haya vuelto a Date.now().
{
    // Se mira SOLO dentro de _enviar(): tmWebVitalsProbar también manda un
    // .sv, y buscándolo en todo el fichero la comprobación pasaba aunque el
    // envío real hubiera vuelto a Date.now().
    ok(/ts: \{ '\.sv': 'timestamp' \}/.test(bloque),
        'el ts volvió a salir del reloj del visitante: una hora desfasada tira la muestra');
    // Y que la regla, si alguien la relaja, siga sin admitir un ts de cliente.
    const conRelojMalo = { ...muestra, ts: AHORA - 30 * 60000 };   // móvil 30 min atrasado
    const p = validar(REGLA, conRelojMalo, AHORA);
    ok(p.length > 0,
        'la regla debe seguir rechazando un ts que no sea el del servidor: si lo acepta, vuelve a poder llegar basura');
}

// ── 3. Lo que la regla tiene que seguir parando ──────────────────────────
{
    const casos = [
        ['sin lcp', (() => { const m = { ...muestra }; delete m.lcp; return m; })()],
        ['un campo de más', { ...muestra, ip: '1.2.3.4' }],
        ['lcp de texto', { ...muestra, lcp: 'rápido' }],
        ['lcp imposible', { ...muestra, lcp: 999999 }],
        ['cls negativo', { ...muestra, cls: -1 }],
        ['conn larguísimo', { ...muestra, conn: 'x'.repeat(40) }],
    ];
    for (const [que, p] of casos) {
        ok(validar(REGLA, p, AHORA).length > 0, `la regla debería rechazar ${que} y lo acepta`);
    }
}

// ── 4. Append-only ───────────────────────────────────────────────────────
// Sin esto cualquiera podría reescribir las muestras de otro.
{
    ok(!evaluar(REGLA['.write'], { valor: muestra, now: AHORA, existe: true }),
        'sobre una muestra que ya existe la escritura debe denegarse');
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ web vitals: el payload del navegador pasa las reglas del repo');
