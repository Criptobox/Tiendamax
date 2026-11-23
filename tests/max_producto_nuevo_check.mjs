/* Un producto NUEVO se reconoce solo, sin que nadie le escriba sinónimos.
 *
 * Hoy el dueño añadió un panel solar y Max contestaba «no lo manejo» hasta que
 * alguien lo apuntó a mano en max-sinonimos.json. Tiene que ser automático: el
 * tipo de producto va al principio del nombre, así que lo que el cliente pide con
 * dos o más palabras y que está TODO en el arranque del nombre cuenta como el
 * nombre. Se prueba con productos inventados, sin archivo de sinónimos.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODIGO = readFileSync(join(process.env.TM_CEREBRO || join(RAIZ, 'js/src/tm-bot-cerebro.src.js')), 'utf8');
const noop = () => {};
const el = () => ({ style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    appendChild:noop, remove:noop, addEventListener:noop, setAttribute:noop, getAttribute:()=>null,
    insertAdjacentHTML:noop, focus:noop, scrollIntoView:noop, dataset:{}, children:[],
    innerHTML:'', textContent:'', getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    querySelector:()=>el(), querySelectorAll:()=>[] });
const REALES = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const nuevo = (extra) => {
    const sb = {
        window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
                 open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
        location:{origin:'https://tiendamax.org'},
        document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
        localStorage:{ getItem:()=>null, setItem:noop, removeItem:noop },
        navigator:{ userAgent:'node' }, productos:JSON.parse(JSON.stringify(REALES.concat(extra))),
        console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout, requestAnimationFrame:noop,
        fetch:()=>Promise.reject(new Error('sin red: no hay archivo de sinónimos')),
    };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(CODIGO, sb);
    const B = sb.window._tmBot; B.sincronizar(); return B;
};
const limpio = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ask = (B, q) => { const r = B.responder(q); return { texto: limpio(r.response), nombres: (r.products || []).map(p => p.nombre), intent: B.context.lastIntent }; };

const base = { categoria: 'HOGAR', subcategoria: 'CLIMA', imagen: '', descripcion: '', ficha: [], specs: [], comision: 1, moneda: 'USD' };
const NUEVOS = [
    { ...base, id: 990000001, nombre: 'Estufa Eléctrica Portátil Calorix X1 1500W', precioActual: 45, stock: 6 },
    { ...base, id: 990000002, nombre: 'Estufa Eléctrica Portátil Calorix Y2 2000W', precioActual: 58, stock: 4 },
    { ...base, id: 990000003, nombre: 'Purificador de Agua Portátil AquaPura 5L', precioActual: 30, stock: 0 },
    { ...base, id: 990000004, categoria: 'COCINA', subcategoria: 'UTENSILIOS', nombre: 'Licuadora de Mano Inalámbrica Mixi Pro', precioActual: 22, stock: 9 },
    // El caso que falló de verdad: TODAS las palabras del tipo son «genéricas» para el buscador
    // (panel solar, cámara de seguridad, alarma inteligente, cerradura digital) y por eso no
    // cuentan como nombre; sin el reconocimiento automático, nada las encontraba.
    { ...base, id: 990000005, categoria: 'SEGURIDAD', subcategoria: 'CAMARAS', nombre: 'Cámara de Seguridad Solar Visor Zeta 4MP', precioActual: 70, stock: 5 },
    { ...base, id: 990000006, categoria: 'SEGURIDAD', subcategoria: 'ALARMAS', nombre: 'Alarma Inteligente Wifi Kodo 8 Zonas', precioActual: 55, stock: 3 },
    { ...base, id: 990000007, categoria: 'SEGURIDAD', subcategoria: 'CERRADURAS', nombre: 'Cerradura Digital Exterior Lock Nova', precioActual: 95, stock: 2 },
];
const B = nuevo(NUEVOS);

// 1. Dos palabras del tipo, en cualquier forma de pedirlo
for (const q of ['licuadora de mano', 'quiero una licuadora inalámbrica', 'tienen licuadora de mano inalambrica', 'necesito licuadoras de mano']) {
    const a = ask(B, q);
    ok(a.nombres.length === 1 && /Mixi Pro/.test(a.nombres[0]), `«${q}» debe dar la licuadora nueva (sin sinónimos): ${a.nombres} → ${a.texto.slice(0, 80)}`);
    ok(!/no lo manejo|no vendo|no te entend/i.test(a.texto), `«${q}» no debe negarlo: ${a.texto.slice(0, 80)}`);
}
// 1b. Todas las palabras del tipo son genéricas: es lo que de verdad había que arreglar
for (const [q, re] of [['camara de seguridad solar', /Visor Zeta/], ['quiero una cámara seguridad solar', /Visor Zeta/],
                       ['alarma inteligente wifi', /Kodo/], ['tienen alarma inteligente', /Kodo/],
                       ['cerradura digital exterior', /Lock Nova/], ['quiero una cerradura digital', /Lock Nova/]]) {
    const a = ask(B, q);
    ok(a.nombres.length >= 1 && re.test(a.nombres[0]), `«${q}» debe dar el producto nuevo aunque todas sus palabras sean genéricas: ${a.nombres} → ${a.texto.slice(0, 90)}`);
}
// 2. Agotado: su propia ficha, con «agotado»
{
    const a = ask(B, 'purificador de agua portátil');
    // Su propia ficha diciendo «agotado» (con alternativas debajo, como siempre en un agotado).
    ok(/AquaPura/.test(a.texto) && /agotad/i.test(a.texto) && /Avísame/i.test(a.texto), `lo nuevo agotado da su ficha «agotado»: ${a.nombres} → ${a.texto.slice(0, 100)}`);
}
// 3. Hermanos: el modelo que no se nombró no es una alternativa
{
    const y = ask(B, 'estufa eléctrica y2');
    ok(y.nombres.length === 1 && /Y2/.test(y.nombres[0]), `«estufa eléctrica y2» da solo la Y2: ${y.nombres}`);
    const x = ask(B, 'estufa eléctrica x1');
    ok(x.nombres.length === 1 && /X1/.test(x.nombres[0]), `«estufa eléctrica x1» da solo la X1: ${x.nombres}`);
}
// 4. Lo nuevo no ensucia lo que ya funcionaba
for (const [q, no] of [['hola', /Calorix|Mixi|AquaPura/], ['tienen routers', /Calorix|Mixi|AquaPura/], ['aceite 10w40', /Calorix|Mixi|AquaPura/],
                       ['estación de carga', /Calorix|Mixi|AquaPura/], ['mi inversor pita', /Calorix|Mixi|AquaPura/]]) {
    const a = ask(B, q);
    ok(!no.test(a.nombres.join(' ') + ' ' + a.texto), `«${q}» no debe traer lo nuevo: ${a.nombres} → ${a.texto.slice(0, 80)}`);
}
// 5. Una sola palabra suelta no dispara el reconocimiento automático (eso son tipos y familias)
{
    const a = ask(B, 'estufa');
    ok(a.intent !== 'noVendemos', '«estufa» a secas no se niega');
}
// 6. Lo ya conocido sigue igual con el producto real
{
    const a = ask(B, 'panel solar');
    ok(a.nombres.length === 1 && /Panel Solar Fotovoltaico/.test(a.nombres[0]), `«panel solar» da el panel real sin archivo de sinónimos: ${a.nombres}`);
}

if (fallos.length) { console.error(`❌ ${fallos.length} comprobación(es) fallida(s):\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Un producto nuevo se reconoce solo, sin sinónimos.');
