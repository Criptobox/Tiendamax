/* Auditoría de 90 preguntas reales a Max (nov-2026): los fallos que dio, como pruebas.
 *
 * Todos eran silenciosos: Max contestaba, solo que otra cosa. Corre sin red
 * contra productos.json de hoy; cada bloque se salta si el producto ya no está.
 *   1 aceite/anticongelante por familia (10w40 = «10W-40»)   2 pedir una persona
 *   3 sin relación → no se recomienda                         4 «sin corriente» → sistema solar
 *   5 seguimiento «y ese cuánto cuesta»                       6 menú/reiniciar/qué eres/reclamar
 *   7 transferencia                                            8 autonomía con Ah y W
 *   9 precio de producto en MN                                10 política real (horario, Zelle, garantía)
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
const PRODS = crudo.productos || crudo;
const CODIGO = readFileSync(join(RAIZ,'js/src/tm-bot-cerebro.src.js'),'utf8');
const fallos = [];
const ok = (c, m) => { if(!c) fallos.push(m); };

// Una conversación nueva por pregunta (o por hilo): sin memoria de la anterior.
function nuevo(){
    const sb = {
        window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
                 open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
        location:{origin:'https://tiendamax.org'},
        document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
        localStorage:{ getItem:()=>null, setItem:noop, removeItem:noop },
        navigator:{ userAgent:'node' }, productos:JSON.parse(JSON.stringify(PRODS)),
        console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout, requestAnimationFrame:noop,
        fetch:()=>Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(CODIGO, sb);
    const B = sb.window._tmBot; B.sincronizar(); return B;
}
const limpio = s => String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ask = (...hilo) => { const B = nuevo(); let r; for(const q of hilo) r = B.responder(q);
    return { B, texto: limpio(r.response), nombres: (r.products||[]).map(p => p.nombre), botones: (r.quickReplies||[]).join(' | '), r, intent: B.context.lastIntent }; };
const hay = re => PRODS.some(p => re.test(p.nombre));
const conStock = re => PRODS.some(p => re.test(p.nombre) && Number(p.stock) > 0);

// ── 0. Prueba de estrés del 26-nov (14 preguntas, 4 fallos) ───────────────
// «80W-90» (aceite de ENGRANAJES) no era una viscosidad que Max conociera: se quedaba en «80w 90», no
// se filtraba y el Fanfaro CVT 8601 (sintético, caja automática) salía entre los minerales 80W-90.
if(conStock(/Digear 80W-90/i)){
    const a = ask('tienes aceite de transmisión 80W-90');
    ok(a.nombres.length >= 1 && a.nombres.every(n => /80W-?90/i.test(n)), `«aceite de transmisión 80W-90» solo debe dar 80W-90: ${a.nombres}`);
    ok(!a.nombres.some(n => /CVT/i.test(n)), 'el aceite CVT (caja automática) no es un 80W-90: dañaría una caja manual');
    ok(/80W-90/.test(a.texto), `la respuesta nombra la viscosidad pedida: ${a.texto.slice(0, 80)}`);
}
// Varios productos que casan y NINGUNO con stock: se dice claro, no «Encontré 6 productos que coinciden».
if(!conStock(/router|Tenda AC6|Wavlink/i) && PRODS.filter(p => /Tenda AC6|Wavlink AC1200|hEX RB750/i.test(p.nombre)).length >= 2){
    // Con los sinónimos reales, que es como contesta Max en la tienda («router wifi» → los routers).
    const B = nuevo(); B.ponerSinonimos(JSON.parse(readFileSync(join(RAIZ, 'max-sinonimos.json'), 'utf8')));
    const r = B.responder('quiero un router wifi'), tx = limpio(r.response);
    ok(/no tengo ninguno|agotad/i.test(tx) && !/Encontré/i.test(tx), `todo agotado: debe decirlo claro, dio: ${tx.slice(0, 140)}`);
    ok(!/Encontré \d+ producto/i.test(tx), 'con todo agotado no se anuncia «Encontré N productos»');
}
// «Apagones» a secas: dos caminos + lo que hay + una pregunta; nunca la hamaca (su descripción dice «ideal para los apagones»).
if(conStock(/BLUETTI AC180/i)){
    for(const q of ['¿me recomiendas algo para los apagones?', 'qué me recomiendas para el apagón']){
        const a = ask(q);
        ok(a.intent === 'apagones', `«${q}» debe ir por apagones, fue ${a.intent}`);
        ok(/dos caminos/i.test(a.texto) && /luces y el celular/i.test(a.texto), `«${q}»: debe explicar los caminos y preguntar qué alimentar: ${a.texto.slice(0, 100)}`);
        ok(a.nombres.length >= 1 && !a.nombres.some(n => /hamaca/i.test(n)) && a.nombres.some(n => /BLUETTI/i.test(n)), `«${q}»: energía sí, hamaca no: ${a.nombres}`);
    }
    // Lo que nombra un tipo de producto sigue su camino (no se roba).
    ok(ask('cuánto dura una batería en un apagón').intent === 'autonomia', 'la autonomía en un apagón sigue siendo autonomía');
    ok(ask('inversor para el apagón').intent !== 'apagones', '«inversor para el apagón» nombra un producto: no es la respuesta genérica');
    ok(/solar/i.test(ask('💡 Sistema solar básico').texto), 'el botón «Sistema solar básico» lleva al sistema solar');
}

// ── 1. Aceites y anticongelante ─────────────────────────────────────────
// Las familias se reconocen por el nombre de la subcategoría. Si el dueño la renombra y la
// expresión ya no la ve, la familia queda sin productos y Max pasa a ofrecer otra cosa
// (el 2T de moto para «aceite para carro») sin ningún error: esto lo hace ruidoso.
{
    const B = nuevo();
    const vacias = B.familiaSinProductos ? B.familiaSinProductos() : (B.familiasSinProductos ? B.familiasSinProductos() : null);
    ok(Array.isArray(vacias), 'el cerebro debe exponer familiasSinProductos()');
    ok(Array.isArray(vacias) && vacias.length === 0,
       'familias de Max sin ningún producto (¿renombraste una subcategoría? actualiza _FAMILIAS.sub): ' + JSON.stringify(vacias));
}
if(conStock(/Defender 10W/i)){
    for(const q of ['aceite 10w40 para carro','tienen 10w40']){
        const a = ask(q);
        ok(a.nombres.some(n => /Defender 10W/i.test(n)), `«${q}» debe mostrar el Mannol Defender 10W-40, dio: ${a.nombres}`);
        ok(!a.nombres.some(n => /Fanfaro 2T/i.test(n)), `«${q}» no debe ofrecer el aceite 2T de moto`);
        ok(a.nombres.length === 1 && !/no lo tengo/i.test(a.texto), `«${q}»: debe dar SOLO el 10W-40 (10w40 = «10W - 40»), dio: ${a.nombres}`);
    }
}
if(conStock(/5W-?30/i)){
    const a = ask('aceite 5w30');
    ok(a.nombres.length >= 1 && a.nombres.every(n => /5W-?30/i.test(n)), `«aceite 5w30» solo debe dar productos 5W-30: ${a.nombres}`);
}
{
    const a = ask('aceite de motor');
    ok(a.nombres.length > 0 && !/Agotado/i.test(a.texto.slice(0, 80)), '«aceite de motor» no empieza por un agotado');
    ok(a.r.products && a.r.products[0].categoria !== 'MOTOS', '«aceite de motor»: lo de carro en stock va primero, no el de moto');
    ok(a.r.products.every(p => p.stock > 0), '«aceite de motor» solo enseña lo que hay');
}
if(conStock(/Antifreeze/i)){
    const a = ask('anticongelante');
    ok(a.nombres.filter(n => /Antifreeze/i.test(n)).length >= 3, '«anticongelante» debe mostrar los Antifreeze en stock');
    ok(!/eso exacto no lo tengo/i.test(a.texto), '«anticongelante» no debe decir «eso exacto no lo tengo»');
}
{   // nombrar la marca sigue dando la ficha del producto
    const a = ask('mannol defender 10w40');
    ok(a.intent === 'detalle', 'con la marca, «mannol defender 10w40» es una ficha, no una familia');
}

// ── 2. Pedir una persona ────────────────────────────────────────────────
for(const q of ['quiero hablar con una persona','hablar con alguien','atención al cliente','humano','agente']){
    const a = ask(q);
    ok(a.intent === 'humano', `«${q}» → ${a.intent}, esperaba humano`);
    ok(/10:00 am a 6:00 pm/.test(a.texto), `«${q}»: debe decir el horario 10 am a 6 pm`);
    ok(/whatsapp/i.test(a.botones) && /wa\.me/.test(a.r.response), `«${q}»: debe llevar a WhatsApp (botón y enlace)`);
    ok(a.nombres.length === 0, `«${q}»: no debe enseñar productos`);
}

// ── 3. Sin relación: no se recomienda ───────────────────────────────────
{
    const a = ask('el wifi está lento');
    ok(a.nombres.every(n => !/Timbre/i.test(n)) && /whatsapp/i.test(a.botones), '«el wifi está lento» no recomienda un timbre y ofrece WhatsApp');
    ok(!ask('wifi lento').nombres.some(n => /Timbre/i.test(n)), '«wifi lento» no recomienda un timbre');
}
{
    const a = ask('recargas de nauta');
    ok(!a.nombres.length && /no las manejo/i.test(a.texto), '«recargas de nauta» no se vende: no debe salir el inflador');
}
{
    const a = ask('aire acondicionado');
    ok(!a.nombres.some(n => /Compresor/i.test(n)), '«aire acondicionado» no es el compresor de aire');
}
{
    const a = ask('quién ganó el juego de beisbol');
    ok(!a.nombres.length && /no lo manejo/i.test(a.texto), '«quién ganó el juego de beisbol» no es de la tienda');
}
{
    const a = ask('tienen bicicletas eléctricas');
    ok(/Bicicletas no tengo/i.test(a.texto) && /moto el[eé]ctrica/i.test(a.texto), 'bicicleta no, moto eléctrica sí, dicho como lo que es');
}
if(!conStock(/c[aá]maras? de seguridad|Zosi|PTZ|Bullet/i)){
    const a = ask('tienen cámaras');
    ok(/reversa/i.test(a.texto) && /seguridad/i.test(a.texto) && /carro/i.test(a.texto), '«tienen cámaras» debe aclarar reversa (carro) frente a seguridad');
}

// ── 4. Sin corriente → sistema solar, sin inventar autonomías ───────────
for(const q of ['tengo 3 bombillos y un tv que necesito para solar','no tengo corriente que hago','ahorrar corriente','asere tienen algo pa la luz']){
    const a = ask(q);
    ok(a.intent === 'solarEntrada', `«${q}» → ${a.intent}, esperaba solarEntrada`);
    ok(/vatios/i.test(a.texto) && /horas/i.test(a.texto), `«${q}»: debe pedir vatios y horas`);
    ok(!/Lámpara Ventilador/i.test(a.nombres.join()) && !/^Hola/i.test(a.texto), `«${q}»: ni lámpara-ventilador ni saludo`);
    ok(!/\b\d+([.,]\d+)?\s*horas de (autonom|bater)/i.test(a.texto), `«${q}»: no inventa una autonomía`);
}

// ── 5. Seguimiento ──────────────────────────────────────────────────────
if(conStock(/Inflador/i)){
    const a = ask('inflador', 'y ese cuánto cuesta');
    ok(/Inflador/i.test(a.texto) && /\$\d+/.test(a.texto), '«y ese cuánto cuesta» tras un producto responde por ese producto');
    const b = ask('necesito un cable','y ese cuánto cuesta');
    ok(!/no te entend/i.test(b.texto), '«y ese cuánto cuesta» tras una lista no es «no te entendí»');
}
{
    const a = ask('cuánto cuesta');
    ok(/de cu[aá]l/i.test(a.texto) && a.nombres.length >= 2, '«cuánto cuesta» sin contexto pregunta de cuál y propone opciones');
}

// ── 6. Atajos ───────────────────────────────────────────────────────────
{
    ok(ask('menú').intent === 'menu' && ask('menú').r.bienvenida === true, '«menú» da la bienvenida con botones');
    ok(ask('reiniciar').intent === 'resetCmd', '«reiniciar» hace lo que /limpiar');
    ok(ask('qué eres').intent === 'quienEres' && /no soy una persona/i.test(ask('qué eres').texto), '«qué eres»: asistente, no persona');
    const r = ask('reclamar');
    ok(r.intent === 'reclamo' && /mismo producto en buen estado/i.test(r.texto) && /whatsapp/i.test(r.botones), '«reclamar»: política de devolución + WhatsApp');
    const n = ask('asdfgh');
    ok(n.texto.length < 140 && !/•/.test(n.r.response), '«no te entendí» es corto, sin seis viñetas');
    ok(ask('reiniciar el router').intent !== 'resetCmd', '«reiniciar el router» no es reiniciar el chat');
}

// ── 7. Pagos: política real ─────────────────────────────────────────────
{
    const a = ask('aceptan transferencia');
    ok(/^🏦?\s*No/i.test(a.texto) && /efectivo/i.test(a.texto) && /whatsapp/i.test(a.texto), '«aceptan transferencia»: no, efectivo al recibir, otra forma por WhatsApp');
    for(const q of ['aceptan zelle','métodos de pago','cómo comprar']){
        const t = ask(q).texto;
        ok(!/Zelle\s*\(|acepta[mn]os[^.]*zelle|o Zelle/i.test(t) || /no (lo )?acept|por ahora no/i.test(t), `«${q}» no debe ofrecer Zelle`);
    }
    ok(/por ahora no/i.test(ask('aceptan zelle').texto), 'Zelle: por ahora no');
    ok(!/Zelle/.test(ask('cómo comprar').texto.replace(/ni transferencias/g,'')) || /no aceptamos Zelle/i.test(ask('cómo comprar').texto), 'cómo comprar: Zelle no');
}

// ── 8. Autonomía con Ah y W ─────────────────────────────────────────────
{
    const a = ask('cuánto dura una batería 100Ah con 500W');
    ok(/1[.,]9 horas/.test(a.texto), `100Ah con 500W = 100×12×0,8÷500 = 1,9 h, dio: ${a.texto.slice(0,200)}`);
    ok(/estimado/i.test(a.texto) && /0,8/.test(a.texto), 'lo dice como estimado y con la fórmula');
    ok(!/Consumo t[ií]pico/i.test(a.texto), 'no suelta la tabla genérica');
}

// ── 9. Precio en MN sin convertir ───────────────────────────────────────
{
    const mn = PRODS.filter(p => String(p.moneda).toUpperCase() === 'MN');
    for(const p of mn){
        const B = nuevo();
        const d = B.buildDetalle(B.productos.find(x => x.id === p.id));
        const t = limpio(d.response);
        const n = String(Math.round(p.precioActual ?? p.precio)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        ok(t.includes(n + ' MN'), `${p.nombre}: debe decir «${n} MN»`);
        ok(!/USD/.test(t.split('Categoría')[0]) && !/\$\s?\d/.test(t.split('Categoría')[0]), `${p.nombre}: no debe decir USD ni $ en el precio`);
    }
    ok(!/\$280\.00 USD|267\.400/.test(ask('cable utp').texto), '«cable utp» no convierte los 280 MN');
}

// ── 10. Política real ───────────────────────────────────────────────────
{
    ok(/10:00 am a 6:00 pm/.test(ask('horario').texto) && !/9:00|8:00/.test(ask('horario').texto), 'horario: 10 am a 6 pm');
    const d = ask('política de devolución').texto;
    ok(/desperfecto de fábrica/i.test(d) && /mismo producto en buen estado/i.test(d) && !/dinero/i.test(d), 'devolución: solo desperfecto de fábrica y mismo producto');
    ok(/solo a los productos que la indican|no declara garant/i.test(ask('garantía').texto + ask('el inversor tataliken tiene garantia').texto), 'garantía: solo donde se declara');
    ok(/solo en La Habana/i.test(ask('envíos').texto), 'mensajería solo en La Habana');
}

// ── Lo que NO se puede romper ───────────────────────────────────────────
{
    // Con un panel solar real en el catálogo, negarlo sería mentir; sin él, se dice que no.
    const hayPanel = PRODS.some(p => /panel(es)?\s+solar(es)?|fotovoltaic/i.test(String(p.nombre)) && !/base|soporte|estructura/i.test(String(p.nombre)) && Number(p.stock) > 0);
    ok(hayPanel ? ask('paneles solares').intent !== 'noVendemos' : ask('paneles solares').intent === 'noVendemos',
       '«paneles solares»: ' + (hayPanel ? 'hay uno en el catálogo y no se niega' : 'sigue diciendo que no se vende'));
    if(hay(/NanoStation M5 Loco/i)){ const a = ask('nano loco m5'); ok(a.nombres.length === 1 && /M5 Loco/i.test(a.nombres[0]), '«nano loco m5» da la M5 Loco'); }
    if(hay(/Switch Gigabit de 8/i)){ const a = ask('switch de 8 puertos'); ok(a.nombres.length === 1 && /8 Puertos/i.test(a.nombres[0]), '«switch de 8 puertos» da el de 8'); }
    ok(ask('mi inversor pita').intent === 'diagnostico', '«mi inversor pita» sigue siendo diagnóstico');
}

if(fallos.length){ console.error('❌ ' + fallos.length + ' comprobación(es) fallida(s):'); fallos.forEach(f => console.error('   • ' + f)); process.exit(1); }
console.log('✅ Auditoría de 90 preguntas: los fallos de Max, cubiertos.');
