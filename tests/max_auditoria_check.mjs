/* Auditoría del 4-nov-2026: a Max se le preguntó «¿Cuánto cuesta X y hay en
 * stock?» por cada producto con stock, y 18 de 59 salieron mal. Este fichero
 * es ese informe convertido en pruebas.
 *
 * Los 18 eran de DOS familias distintas, y se prueban por separado:
 *
 *  A) Productos que la tienda SÍ muestra y Max contestaba mal (4):
 *     el inflador (leído como «batería inflada»), la lámpara E27 (la rosca
 *     leída como código de error), el compresor ST-221 (ganaba el nombre
 *     corto de otro) y los puertos del Archer C50 (la tabla completa de la
 *     ficha no se usaba).
 *
 *  B) Productos de categorías APAGADAS en el panel (TARJETAS, PC Y LAPTOPS,
 *     JUEGOS): desde la tienda no existen —a propósito—, así que Max no podía
 *     darles precio. Lo que fallaba era CÓMO decía que no: el guion de métodos
 *     de pago, el recuento del catálogo o un producto cualquiera. Y el día que
 *     se enciendan, Max tiene que volver a venderlas: se prueban las dos mitades.
 *
 * Corre sin red, contra productos.json y categorias.json. Mira el catálogo de
 * hoy, así que cada bloque se salta si el producto ya no está.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const el = () => ({ style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    appendChild:noop, remove:noop, addEventListener:noop, setAttribute:noop, getAttribute:()=>null,
    insertAdjacentHTML:noop, focus:noop, scrollIntoView:noop, dataset:{}, children:[],
    innerHTML:'', textContent:'', getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    querySelector:()=>el(), querySelectorAll:()=>[] });

const crudo = JSON.parse(readFileSync(join(RAIZ,'productos.json'),'utf8'));
const TODOS = crudo.productos || crudo;
const apagadas = new Set(Object.entries(
    (JSON.parse(readFileSync(join(RAIZ,'categorias.json'),'utf8')).apagadas || {}).categorias || {})
    .filter(([, v]) => v && v.off).map(([k]) => k));
const VISIBLES = TODOS.filter(p => !apagadas.has(p.categoria));   // lo que la tienda le enseña a Max

const fallos = [];
const ok = (c, m) => { if(!c) fallos.push(m); };
const limpio = s => String(s||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();

async function maxCon(productos){
    const sb = {
        window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
                 open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
        location:{origin:'https://tiendamax.org'},
        document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
        localStorage:{ getItem:()=>null, setItem:noop, removeItem:noop },
        navigator:{ userAgent:'node' }, productos,
        console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout,
        requestAnimationFrame:noop, cancelAnimationFrame:noop,
        fetch:()=>Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(readFileSync(join(RAIZ,'js/src/tm-bot-cerebro.src.js'),'utf8'), sb);
    const B = sb.window._tmBot;
    B.sincronizar();
    await new Promise(r => setTimeout(r, 30));
    return async q => {
        await B.responder('/limpiar');
        const r = await B.responder(q);
        return { t: limpio(r.response), tarjetas:(r.products||[]).map(p => p.nombre) };
    };
}
const preguntarVisible = await maxCon(VISIBLES);
const nombre = re => TODOS.find(p => re.test(p.nombre || ''));
const usd = p => { const n = Number(p.precioActual); return Number.isInteger(n) ? String(n) : n.toFixed(2); };

// ── A) Lo que la tienda muestra ───────────────────────────────────────
/* Cada uno: la ficha del producto NOMBRADO (con su precio y su stock) y nada
   del guion de avería ni de otro producto. */
for(const [re, que] of [
    [/^Inflador Digital/, 'el inflador se leía «inflado» (batería hinchada) y abría el guion de avería'],
    [/^Compresor de Aire Port[aá]til Digital ST-221/, 'ganaba el «Compresor de Aire» corto, agotado y de otro precio'],
    [/^L[aá]mpara Ventilador de Techo Flower/, '«E27» (la rosca) se leía como código de error'],
]){
    const p = nombre(re);
    if(!p || Number(p.stock) <= 0 || apagadas.has(p.categoria)) continue;
    const titulo = p.nombre.split(' | ')[0].replace(/\s*\(.*?\)\s*$/, '');
    for(const q of [`¿Cuánto cuesta ${titulo} y hay en stock?`, `${titulo} precio`]){
        const r = await preguntarVisible(q);
        ok(r.tarjetas[0] === p.nombre && r.t.includes('$' + usd(p)) && !/Vamos a ver qué le pasa|batería hinchada/i.test(r.t),
           `«${q}»: ${que}. Dijo: «${r.t.slice(0,130)}» ⟦${r.tarjetas.slice(0,2).join(' | ')}⟧`);
    }
}
/* Lo contrario de cada arreglo: que lo que SÍ es una avería siga siéndolo. */
for(const [q, debe] of [['mi batería se infló', /BATER[IÍ]AS|bater[ií]a/i],
                        ['el inversor da error E27', /c[oó]digo E27/i],
                        ['inversor E04', /c[oó]digo E04/i]]){
    const r = await preguntarVisible(q);
    ok(debe.test(r.t) || /Vamos a ver|hinch|dej[aá] de cargar|sobrecarga/i.test(r.t),
       `«${q}» sigue siendo una avería o una búsqueda de baterías, no una ficha: «${r.t.slice(0,110)}»`);
}
{   // y el nombre corto sigue dando el producto corto
    const corto = nombre(/^Compresor de Aire$/);
    if(corto && !apagadas.has(corto.categoria)){
        const r = await preguntarVisible('cuanto cuesta el compresor de aire');
        ok(r.tarjetas[0] === corto.nombre, `«el compresor de aire» (nombre exacto) sigue dando ese: «${r.tarjetas[0]}»`);
    }
    // y dos productos que solo se distinguen en el paréntesis no se eligen al azar
    const itel = VISIBLES.filter(p => /^Smartphone itel A100C/.test(p.nombre));
    if(itel.length > 1){
        const r = await preguntarVisible('cuanto cuesta Smartphone itel A100C');
        ok(itel.every(p => r.tarjetas.includes(p.nombre)),
           `«Smartphone itel A100C» a secas son dos productos y salen los dos, no uno elegido: ${r.tarjetas.join(' | ')}`);
    }
}

// ── A) Los puertos del Archer C50: la tabla completa de la ficha ──────
{
    const c50 = nombre(/Archer C50/);
    const puertos = c50 && (c50.ficha || []).find(f => /puerto/i.test(f.k || ''));
    if(c50 && puertos && !apagadas.has(c50.categoria)){
        const r = await preguntarVisible('¿Cuántos puertos tiene el TP-Link Archer C50 y de qué velocidad?');
        ok(r.t.includes(String(puertos.v).slice(0, 30)),
           `los puertos salen de la ficha, tal cual: «${r.t.slice(0,300)}»`);
        ok(r.tarjetas.length === 1 && r.tarjetas[0] === c50.nombre,
           `la segunda mitad («y de qué velocidad») sigue siendo del mismo producto, no una búsqueda que pega tarjetas ajenas: ${r.tarjetas.join(' | ')}`);
        const g = await preguntarVisible('¿El Archer C50 tiene puertos Gigabit?');
        const dice10100 = /10\/100/.test(puertos.v + ' ' + (puertos.nota || ''));
        const diceGiga = /gigabit|1000/i.test(puertos.v + ' ' + (puertos.nota || ''));
        if(dice10100 && !diceGiga)
            ok(/No son Gigabit/i.test(g.t) && !/S[ií], tiene puertos Gigabit/i.test(g.t),
               `la ficha dice 10/100 y Max tiene que decir que NO son Gigabit: «${g.t.slice(0,160)}»`);
        // Y una pregunta de precio no se llena de datos que nadie pidió.
        const pr = await preguntarVisible('¿Cuánto cuesta el TP-Link Archer C50 y hay en stock?');
        ok(!/Lo que preguntas/.test(pr.t), `preguntar el precio no abre «Lo que preguntas»: «${pr.t.slice(0,120)}»`);
    }
}

// ── B) Categorías apagadas: se dice que no, con claridad ──────────────
const NO_LO_TENGO = /no (lo |la |los |las )?(manejo|tengo|vendo)|no (lo |la |los |las )?tengo disponible/i;
const MALAS = /M[eé]todos de pago|Estado del cat[aá]logo|Algunos disponibles ahora mismo|categor[ií]a .{0,12}est[aá] .{0,6}agotada/i;
const apagadosConStock = TODOS.filter(p => apagadas.has(p.categoria) && Number(p.stock) > 0);
for(const p of apagadosConStock){
    if(!/^(TARJETAS|PC Y LAPTOPS)$/.test(p.categoria)) continue;       // las dos con respuesta propia
    const titulo = p.nombre.split(' | ')[0].replace(/\s*\(.*?\)\s*$/, '');
    const r = await preguntarVisible(`¿Cuánto cuesta ${titulo} y hay en stock?`);
    ok(NO_LO_TENGO.test(r.t) && !MALAS.test(r.t) && r.tarjetas.length === 0,
       `«${titulo}» (${p.categoria}, apagada) tiene que contestar «no lo manejo» y nada más; dijo «${r.t.slice(0,120)}» ⟦${r.tarjetas.slice(0,2).join(' | ')}⟧`);
}
if(apagadas.has('JUEGOS') || apagadas.has('PC Y LAPTOPS')){
    const r = await preguntarVisible('quiero una pc gaming');
    ok(!/est[aá] .{0,8}agotada/i.test(r.t), `una categoría apagada no está «agotada», no existe: «${r.t.slice(0,130)}»`);
}
/* Lo que NO es esto tiene que seguir su camino: la marca sola, o preguntar
   cómo se paga, no es pedir una tarjeta de regalo. */
for(const [q, debe] of [['aceptan tarjeta visa', /M[eé]todos de pago/i],
                        ['aceptan tarjeta de crédito', /M[eé]todos de pago/i],
                        ['quiero un router para ver netflix', /WIFI|Archer|router/i]]){
    const r = await preguntarVisible(q);
    ok(debe.test(r.t + ' ' + r.tarjetas.join(' ')) && !/tarjetas de regalo/i.test(r.t),
       `«${q}» no es pedir una tarjeta de regalo: «${r.t.slice(0,110)}»`);
}

// ── B) …y encendidas, Max las vende ───────────────────────────────────
/* El «no lo tengo» se calla solo cuando hay con stock algo que encaje: si
   alguien enciende TARJETAS y Max sigue diciendo que no las tiene, el arreglo
   de arriba habría cambiado un error por otro. Con el catálogo ENTERO. */
if(apagadosConStock.length){
    const preguntarTodo = await maxCon(TODOS);
    for(const p of apagadosConStock){
        if(!/^(TARJETAS|PC Y LAPTOPS)$/.test(p.categoria)) continue;
        const titulo = p.nombre.split(' | ')[0].replace(/\s*\(.*?\)\s*$/, '');
        const r = await preguntarTodo(`¿Cuánto cuesta ${titulo} y hay en stock?`);
        ok(r.tarjetas[0] === p.nombre && !NO_LO_TENGO.test(r.t),
           `con ${p.categoria} ENCENDIDA, «${titulo}» tiene que ser el producto, no «no lo manejo»: «${r.t.slice(0,110)}» ⟦${r.tarjetas.slice(0,2).join(' | ')}⟧`);
    }
}

if(fallos.length){
    console.error(`\n❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ Auditoría de Max: los 18 errores del informe, cubiertos.');
