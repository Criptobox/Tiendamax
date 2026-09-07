/* El Copiloto del admin — js/admin-copilot.js
 *
 * Dos fallos que no rompían nada y por eso duraron:
 *
 * 1. TODAS las lecturas de Firebase pasan por getJson() y todas devolvían
 *    null pasara lo que pasara: sin configuración, 401, timeout o red caída.
 *    Arriba eso se contaba como "no hay datos", así que el panel enseñaba
 *    "0 vistas" y "0 interesados" con la misma cara que si de verdad no
 *    hubiera ninguno. No había forma de distinguir una tienda tranquila de
 *    una lectura rota, y el dueño se creía lo primero.
 *
 * 2. Los KPI del Asesor llevaban el número de columnas en un style inline,
 *    que gana a la media query del CSS. En un móvil de 360px seguían siendo
 *    cuatro columnas, y como una celda de grid no baja de su contenido,
 *    "$123,537.00" ensanchaba su columna a 118px y dejaba las otras tres en
 *    64: rótulos partidos en dos líneas y el número saliéndose de la tarjeta.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(RAIZ, 'js/admin-copilot.js'), 'utf8');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

// ── 1. Una lectura rota no puede parecer un cero ─────────────────────────
{
    const g = SRC.match(/async function getJson\(path\)\{[\s\S]*?\n\}/);
    ok(g, 'no encuentro getJson()');
    const cuerpo = g ? g[0] : '';
    ok(!/if \(!base\) return null;/.test(cuerpo),
        'sin configuración de Firebase getJson no puede devolver un null mudo');
    ok(/_fallo\(path/.test(cuerpo),
        'cada camino de fallo de getJson debe apuntar el motivo');
    // Los cuatro modos de fallo, cada uno con su motivo: si comparten uno
    // genérico, el aviso no dice qué arreglar.
    for (const [pista, que] of [
        ['sin configuración', 'falta la config de Firebase'],
        ['revisa las reglas', 'un 401/403 debe señalar las reglas'],
        ['HTTP ', 'otros códigos HTTP'],
        ['AbortError', 'el timeout de 6s'],
        ['no se pudo conectar', 'la red caída'],
    ]) {
        ok(cuerpo.includes(pista), `getJson no distingue ${que}`);
    }
    ok(/_lecturas\.ok\+\+/.test(cuerpo), 'hay que contar también las lecturas buenas');

    // El contador se reinicia en cada tanda, o el aviso se queda pegado.
    ok(/async function collectFirebaseFacts\(ps\)\{\s*\n\s*_reiniciarLecturas\(\);/.test(SRC),
        'cada tanda de lecturas debe empezar de cero, o el aviso no se apaga nunca');

    // Y sobre todo: tiene que verse en el panel, antes de los números.
    ok(/function avisoLecturasHtml\(\)/.test(SRC), 'falta el aviso en la hoja');
    // Se mira dentro de renderSheet: hay otra rejilla igual antes en el
    // fichero (la del Asesor) y buscar la primera del archivo comparaba
    // contra el bloque equivocado.
    const rs = SRC.slice(SRC.indexOf('function renderSheet()'));
    const i = rs.indexOf('${avisoLecturasHtml()}');
    const j = rs.indexOf('<div class="tm-copilot-summary">');
    ok(i > 0 && j > i,
        'el aviso de lecturas debe ir ANTES de los números que pone en duda');
}

// ── 2. Los KPI no pueden salirse de su tarjeta ───────────────────────────
{
    // El style inline gana a la media query: por eso en un móvil seguían
    // siendo cuatro columnas por mucho que el CSS dijera dos.
    ok(!/tm-copilot-summary" style="grid-template-columns/.test(SRC),
        'el número de columnas no puede ir en un style inline: anula la media query');

    // min-width:0 — sin esto una celda de grid nunca baja de su contenido y
    // un número largo ensancha su columna a costa de las demás.
    ok(/\.tm-copilot-stat\{[^}]*min-width:0/.test(SRC),
        'la tarjeta de KPI necesita min-width:0 o el número le roba ancho a las otras');
    ok(/\.tm-copilot-stat b\{[^}]*overflow-wrap:anywhere/.test(SRC),
        'el número debe partirse antes que salirse');

    // Y en pantallas estrechas, dos columnas — también en la fila de tres.
    ok(/@media \(max-width:380px\)\{\.tm-copilot-summary,\.tm-copilot-summary\.tres\{grid-template-columns:repeat\(2,1fr\)\}/.test(SRC),
        'por debajo de 380px las dos rejillas deben caer a dos columnas');
}

// ── moneyCorto: el titular cabe, el dato exacto no se pierde ─────────────
{
    const money = new Function('v', "return '$' + Number(v||0).toLocaleString('es-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });");
    const m = SRC.match(/function moneyCorto\(v\)\{[\s\S]*?\n\}/);
    ok(m, 'no encuentro moneyCorto()');
    const moneyCorto = new Function('money', 'return ' + (m ? m[0].replace('function moneyCorto', 'function') : 'function(){}'))(money);
    const casos = [[0, '$0.00'], [999, '$999.00'], [1000, '$1k'], [1500, '$1.5k'],
                   [123537, '$124k'], [999500, '$1M'], [1250000, '$1.3M']];
    for (const [v, esperado] of casos) {
        ok(moneyCorto(v) === esperado, `moneyCorto(${v}) dio ${moneyCorto(v)}, esperaba ${esperado}`);
    }
    // El corte del millón va sobre el número ya redondeado: con 999.999 el
    // umbral de 1.000.000 no saltaba y salía "$1000k".
    ok(!/k$/.test(moneyCorto(999999)), `moneyCorto(999999) = ${moneyCorto(999999)}: debería ser millones`);
    // Ningún titular puede pasar de 7 caracteres: la tarjeta mide ~90px.
    for (const v of [0, 999, 1000, 123537, 999999, 12500000]) {
        ok(moneyCorto(v).length <= 7, `"${moneyCorto(v)}" no cabe en una tarjeta de KPI`);
    }
    // La cifra exacta sigue estando: en el title del KPI y en el diagnóstico.
    ok(/title="\$\{money\(m\.capitalTotal\)\}"/.test(SRC),
        'el importe exacto debe quedar en el title, no perderse al acortar');
}

// ── 3. Las dos monedas: convertidas para comparar, crudas para enseñar ───
//
// La comisión y el importe pueden estar en USD o en MN. Para ORDENAR productos
// hace falta una moneda común —si no, uno con comisión en 1.500 MN parece 100
// veces más rentable que otro de 12 USD—, así que se convierten con la tasa.
// Pero lo convertido no se puede enseñar como si fuera lo cobrado: la tasa se
// mueve cada semana y el dueño cobró pesos, no dólares. Por eso cada línea
// guarda además la cifra en MN tal cual, y esa es la que va en la columna.
//
// Sin la conversión, sumar crudo daba disparates medidos en el catálogo real:
// $3.055 de ganancia sobre $750 vendidos, y "$5.300 vendidos" cuando fueron
// $300 y 5.000 MN.
{
    const l = SRC.match(/function _lineasDeVenta\(\)\{[\s\S]*?\n\}/);
    ok(l, 'no encuentro _lineasDeVenta()');
    const cuerpo = l ? l[0] : '';
    ok(/comisionMoneda/.test(cuerpo) && /_tasaMN\(\)/.test(cuerpo),
        'la ganancia en MN debe convertirse con la tasa antes de sumarse');
    ok(/gananciaMN:/.test(cuerpo),
        'falta gananciaMN: sin la cifra cruda solo queda el equivalente en '
        + 'dólares, que se mueve con la tasa');
    ok(/totalMN:/.test(cuerpo),
        'falta totalMN: el importe en pesos se sumaba como si fueran dólares');
    ok(/it\.moneda/.test(cuerpo),
        'el importe se reparte por la moneda del PRECIO (it.moneda), no por la '
        + 'de la comisión');

    ok(/gananciaTotalMN:/.test(SRC) && /ingresoTotalMN:/.test(SRC),
        'las métricas no exponen los totales en pesos');
    ok(/const hayMN = /.test(SRC),
        'la columna "En MN" tiene que aparecer solo cuando hay algo en pesos: '
        + 'si no, es una columna con un guion en cada fila');
    ok(/<th>En MN<\/th>/.test(SRC),
        'falta la cabecera de la columna En MN en la tabla de rentabilidad');
    ok(/function moneyMN\(/.test(SRC),
        'falta moneyMN(): los pesos se escriben con su etiqueta para no '
        + 'confundirlos con dólares');
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ copiloto: todas las comprobaciones pasan');
