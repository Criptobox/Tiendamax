/* Segunda prueba del dueño a Max (nov-2026): tasa y precio en MN, tipo de
 * producto sin stock u oculto, «cómo pago» con el pedido, ubicación de la
 * tienda y «cargador de batería». Sandbox como max_no_disponible_check:
 * localStorage 'productos' = catálogo completo, `productos` = solo lo visible
 * (WIFI apagada). Corre sin red contra productos.json de hoy.
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

const TIMBRE = TODOS.find(p => /^Timbre Inteligente/i.test(p.nombre));
const ROUTER = TODOS.find(p => p.subcategoria === 'ROUTERS');
if(!TIMBRE || !ROUTER){ console.log('falta el timbre o un router en el catálogo — se salta'); process.exit(0); }
const precioTimbre = Number(TIMBRE.precioActual ?? TIMBRE.precio);
const OFF = ROUTER.categoria;                         // WIFI apagada

function nuevo(visibles, guardado, ls = {}){
    const sb = {
        window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
                 open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
        location:{origin:'https://tiendamax.org'},
        document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
        localStorage:{ getItem:k => (k === 'productos' && guardado) ? JSON.stringify(guardado) : (k in ls ? ls[k] : null), setItem:noop, removeItem:noop },
        navigator:{ userAgent:'node' }, productos:JSON.parse(JSON.stringify(visibles)),
        console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout, requestAnimationFrame:noop,
        fetch:()=>Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(CODIGO, sb);
    const B = sb.window._tmBot; B.sincronizar(); return B;
}
const limpio = s => String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ask = (B, q) => { const r = B.responder(q); return { texto: limpio(r.response), prods: (r.products||[]).map(p => p.nombre), intent: B.context.lastIntent, botones:(r.quickReplies||[]).join('|') }; };
const visibles = TODOS.filter(p => p.categoria !== OFF);
const mn = n => Math.round(n).toLocaleString('es-ES');

// ── 1) Tasa: el precio del producto en MN, con la tasa del sitio (base + margen) ──
{
    const B = nuevo(visibles, TODOS, { tasaMN:'935', margenMN:'20' });
    for(const q of ['cuánto cuesta el timbre en MN', 'cuánto cuesta el timbre en pesos', 'a cuánto sale el timbre en cup']){
        const a = ask(B, q);
        ok(a.texto.includes(mn(precioTimbre * 955) + ' MN'), `«${q}» debe dar ${mn(precioTimbre*955)} MN (tasa 935 + 20): ${a.texto.slice(0,160)}`);
        ok(/Timbre/i.test(a.prods.join()), `«${q}» nombra el timbre`);
        ok(!/margen|\(935\)|\+ 20/i.test(a.texto), `«${q}» da el precio final sin desglosar: ${a.texto.slice(0,200)}`);
        ok(!/margen operativo|recargo/i.test(a.texto), `«${q}» no suena a recargo`);
    }
    const g = ask(B, 'cuánto es el dólar');
    ok(/1 USD = 955 MN/.test(g.texto) && !/margen|\(935\)|\+ 20/i.test(g.texto), 'la tasa general da 955 directo, sin sumas: ' + g.texto.slice(0,200));
    ok(/ya lo incluye todo/i.test(g.texto), 'y deja claro que el precio en MN ya lo incluye todo');
    ok(!g.texto.includes('23.375'), 'nunca la base sola');
}
{
    const B = nuevo(visibles, TODOS, { tasaMN:'935', margenMN:'0' });
    const a = ask(B, 'cuánto cuesta el timbre en MN');
    ok(a.texto.includes(mn(precioTimbre * 935) + ' MN'), `con margen 0 sale ${mn(precioTimbre*935)} MN: ${a.texto.slice(0,160)}`);
    ok(/1 USD = 935 MN/.test(ask(B, 'cuánto es el dólar').texto) && !/margen/i.test(a.texto), 'con margen 0 la tasa es 935 directa: ' + a.texto.slice(0,200));
}
{   // sin tasa cargada: texto honesto, ningún 0 MN
    const B = nuevo(visibles, TODOS, {});
    const a = ask(B, 'cuánto es el dólar');
    ok(/no tengo la tasa/i.test(a.texto) && !/\b0 MN/.test(a.texto), 'sin tasa no se inventa número: ' + a.texto.slice(0,160));
}
{   // el cuánto-es-un-dólar no se confunde con un producto
    const B = nuevo(visibles, TODOS, { tasaMN:'935', margenMN:'20' });
    const a = ask(B, 'a cuánto está el cambio hoy');
    ok(a.prods.length === 0, 'la pregunta por la tasa no nombra producto: ' + a.prods);
}

// ── 2) Tipo de producto sin stock ──
{
    const B = nuevo(visibles, TODOS, { tasaMN:'935', margenMN:'20' });
    for(const [q, pal] of [['tienen routers','routers'], ['tienen un router','routers'], ['hay antenas','antenas']]){
        const a = ask(B, q);
        ok(a.intent === 'tipoSinStock', `«${q}» → ${a.intent}`);
        ok(new RegExp('no tengo ' + pal + ' disponibles', 'i').test(a.texto), `«${q}» dice que no hay ${pal}: ${a.texto.slice(0,140)}`);
        ok(a.prods.length === 0 && !/Av[ií]same/i.test(a.botones + a.texto), `«${q}» no enseña nada ni ofrece «Avísame» de lo apagado`);
        ok(/WhatsApp/.test(a.botones) && /Categor/.test(a.botones), `«${q}» ofrece WhatsApp y categorías`);
        ok(!/\d+ disponibles/.test(a.texto), `«${q}» no suelta el bloque genérico`);
    }
    // con marca o modelo sigue su camino; lo que sí hay, igual
    ok(ask(B, 'tienen inversores').intent !== 'tipoSinStock', 'un tipo que sí existe visible no es «sin stock»');
    ok(ask(B, 'tienen cargadores').intent !== 'tipoSinStock', 'cargadores sí hay');
    // encendida la categoría, no hay aviso de apagado
    const B2 = nuevo(TODOS, TODOS, {});
    ok(ask(B2, 'tienen routers').intent !== 'tipoSinStock', 'con la categoría encendida no se dice «no tengo»');
    const B3 = nuevo(visibles, null, {});
    ok(ask(B3, 'tienen routers').intent !== 'tipoSinStock', 'sin catálogo guardado Max no inventa');
}

// ── 3) Cómo pago / cómo hago el pedido ──
{
    const B = nuevo(visibles, TODOS, {});
    for(const q of ['¿cómo pago?', 'cómo hago el pedido', 'cómo compro y pago']){
        const a = ask(B, q);
        ok(/Pedir/.test(a.texto) && /WhatsApp/.test(a.texto) && /entrega/i.test(a.texto) && /al recibir/i.test(a.texto) && /USD/.test(a.texto) && /MN/.test(a.texto), `«${q}» cubre pedido, entrega y pago: ${a.texto.slice(0,200)}`);
        ok(/sin Zelle|no aceptamos Zelle/i.test(a.texto), `«${q}» aclara que no hay Zelle`);
    }
    ok(/Zelle/i.test(ask(B, 'aceptan zelle').texto) && ask(B, 'aceptan zelle').intent === 'pago', 'la pregunta específica sigue su respuesta');
}

// ── 4) Ubicación ──
{
    const B = nuevo(visibles, TODOS, {});
    for(const q of ['dónde está la tienda', 'dónde queda la tienda', 'dónde están']){
        const a = ask(B, q);
        ok(a.intent === 'ubicacion', `«${q}» → ${a.intent}`);
        ok(/100% online/.test(a.texto) && /WhatsApp/.test(a.texto) && a.prods.length === 0, `«${q}» da la ubicación real: ${a.texto.slice(0,120)}`);
        ok(!/calle|avenida|\bave\b|entre .* y /i.test(a.texto), `«${q}» no inventa una dirección`);
    }
    ok(ask(B, 'tienda de campaña').intent !== 'ubicacion', 'la tienda de campaña sigue siendo un producto');
    ok(ask(B, 'dónde está mi pedido').intent !== 'ubicacion', '«dónde está mi pedido» es seguimiento');
}

// ── 5) Cargador de batería: el tipo es cargador ──
{
    const B = nuevo(visibles, TODOS, {});
    const CARG = TODOS.filter(p => p.subcategoria === 'CARGADORES' && p.stock > 0).map(p => p.nombre);
    for(const q of ['cargador de batería', 'cargador para batería de carro']){
        const a = ask(B, q);
        ok(a.prods.length >= 1 && a.prods.every(n => CARG.includes(n)), `«${q}» solo muestra cargadores en stock: ${a.prods}`);
        ok(!/Must|LP15/i.test(a.prods.join()), `«${q}» no pone la batería agotada primero`);
        ok(!/Agotado ahora mismo/i.test(a.texto), `«${q}» no abre con una ficha agotada`);
    }
    ok(ask(B, 'cargador vevor 35a').prods.join().includes('35A'), 'nombrando un modelo sigue su ficha');
    ok(ask(B, 'batería para carro').intent !== 'tipoDe', 'batería de carro no es «cargador»');
}

if(fallos.length){ console.error(`❌ ${fallos.length} comprobación(es) fallida(s):\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Segunda prueba de Max: tasa, tipos sin stock, cómo pago, ubicación y cargador de batería.');
