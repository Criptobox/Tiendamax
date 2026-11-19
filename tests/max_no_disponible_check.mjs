/* Algo que existe pero la tienda tiene apagado: Max dice «no está disponible
 * ahora», no «no te entendí».
 *
 * Con una categoría apagada en el panel, la tienda quita sus productos de la
 * memoria pero guarda el catálogo ENTERO en localStorage. Quien preguntaba por
 * «nano loco m5» con WIFI apagada recibía «no te entendí»: un callejón para
 * alguien que sabe exactamente lo que quiere. Corre sin red contra
 * productos.json de hoy; el bloque se salta si el producto ya no está.
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
const TODOS = JSON.parse(readFileSync(join(RAIZ,'productos.json'),'utf8'));
const CODIGO = readFileSync(join(RAIZ,'js/src/tm-bot-cerebro.src.js'),'utf8');
const fallos = [];
const ok = (c, m) => { if(!c) fallos.push(m); };

const NANO = TODOS.find(p => /nanostation m5 loco/i.test(p.nombre));
if(!NANO){ console.log('falta la NanoStation M5 Loco en el catálogo — se salta'); process.exit(0); }

// `visibles` = lo que la tienda deja en memoria; `guardado` = lo que hay en localStorage.
function nuevo(visibles, guardado){
    const sb = {
        window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
                 open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
        location:{origin:'https://tiendamax.org'},
        document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
        localStorage:{ getItem:k => (k === 'productos' && guardado) ? JSON.stringify(guardado) : null, setItem:noop, removeItem:noop },
        navigator:{ userAgent:'node' }, productos:JSON.parse(JSON.stringify(visibles)),
        console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout, requestAnimationFrame:noop,
        fetch:()=>Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(CODIGO, sb);
    const B = sb.window._tmBot; B.sincronizar(); return B;
}
const limpio = s => String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ask = (B, q) => { const r = B.responder(q); return { texto: limpio(r.response), prods: (r.products||[]).map(p => p.nombre), intent: B.context.lastIntent, botones:(r.quickReplies||[]).join('|') }; };

// WIFI apagada: lo visible no la tiene, el almacén local sí.
const visibles = TODOS.filter(p => p.categoria !== NANO.categoria);
const B = nuevo(visibles, TODOS);

for(const q of ['nano loco m5', 'cuánto cuesta la nanostation m5 loco', 'tienen la NanoStation M5 Loco?']){
    const a = ask(B, q);
    ok(a.intent === 'noDisponible', `«${q}» → ${a.intent}, esperaba noDisponible`);
    ok(/no est[aá] disponible/i.test(a.texto) && /NanoStation M5 Loco/i.test(a.texto), `«${q}» debe decir que no está disponible y nombrarlo: ${a.texto.slice(0,120)}`);
    ok(a.prods.length === 0, `«${q}» no debe enseñar otro producto: ${a.prods}`);
    ok(/WhatsApp/i.test(a.botones), `«${q}» ofrece WhatsApp`);
    ok(!/no te entend/i.test(a.texto), `«${q}» no es «no te entendí»`);
}

// Lo que sí está a la venta no se toca.
{
    const a = ask(B, 'aceite 10w40');
    ok(a.intent !== 'noDisponible', 'lo que hay a la venta se contesta como siempre');
}
// Una pregunta general no se confunde con un producto oculto.
for(const q of ['tienen routers', 'hola', 'quiero comprar una antena', 'internet para mi casa']){
    const a = ask(B, q);
    ok(a.intent !== 'noDisponible', `«${q}» es una consulta general, no un producto oculto (${a.intent})`);
}
// Si la categoría NO está apagada, el producto se atiende normalmente.
{
    const B2 = nuevo(TODOS, TODOS);
    const a = ask(B2, 'nano loco m5');
    ok(a.intent !== 'noDisponible', 'con la categoría encendida no hay aviso de «no disponible»');
}
// Sin catálogo guardado (primera visita) no se inventa nada.
{
    const B3 = nuevo(visibles, null);
    const a = ask(B3, 'nano loco m5');
    ok(a.intent !== 'noDisponible', 'sin el catálogo completo guardado, Max no inventa un «no disponible»');
}

if(fallos.length){ console.error(`❌ ${fallos.length} comprobación(es) fallida(s):\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Un producto oculto por el panel se contesta con «no está disponible ahora».');
