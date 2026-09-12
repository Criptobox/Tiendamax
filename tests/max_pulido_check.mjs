/* Max, repasado a fondo: el interrogatorio que destapó estos ocho fallos.
 *
 * Se le hicieron ~130 preguntas seguidas contra el catálogo real —saludos,
 * nombres exactos, precios, stock, glosario, averías, sistemas, presupuesto,
 * pago, envío, garantía, cosas que no se venden, groserías, frases sin
 * tildes— y lo que salió no fue una lista de matices: fueron respuestas
 * falsas o absurdas a preguntas que un cliente hace todos los días. Ninguna
 * daba error: el chat contestaba, con aplomo, otra cosa.
 *
 * Cada bloque de aquí abajo es uno de esos fallos, con la pregunta literal
 * que lo sacó. Corre sin red, contra productos.json.
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

const catalogo = JSON.parse(readFileSync(join(RAIZ,'productos.json'),'utf8'));
const PRODS = catalogo.productos || catalogo;
const fallos = [];
const ok = (c,m) => { if(!c) fallos.push(m); };

const sb = {
    window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
             open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
    location:{origin:'https://tiendamax.org'},
    document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
    localStorage:{ getItem:()=>null, setItem:noop, removeItem:noop },
    navigator:{ userAgent:'node' }, productos:PRODS,
    console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout,
    // /limpiar repinta el chat y eso pasa por requestAnimationFrame.
    requestAnimationFrame:noop, cancelAnimationFrame:noop,
    fetch:()=>Promise.reject(new Error('sin red en el test')),
};
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(RAIZ,'js/src/tm-bot-cerebro.src.js'),'utf8'), sb);
const B = sb.window._tmBot;
B.sincronizar();
await new Promise(r => setTimeout(r, 30));

const limpio = s => String(s||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
/* El cliente ve el texto Y las tarjetas de `products`: un test que solo lee
   el texto da por bueno un "encontré varios" que debajo enseña el que no era. */
const preguntar = async q => {
    const r = await B.responder(q);
    return limpio(r.response) + ' ⟦' + (r.products||[]).map(p => p.nombre).join(' | ') + '⟧';
};
/* El presupuesto y el hilo sobreviven de una pregunta a la siguiente (a
   propósito). Entre bloques se limpia, o un "tengo $50" de arriba filtra
   medio catálogo en un bloque que no habla de dinero. */
const limpiarHilo = async () => { await B.responder('/limpiar'); };
const hay = n => PRODS.some(p => new RegExp(n,'i').test(p.nombre||''));

if(!hay('NanoStation M5 Loco') || !hay('TP-Link Archer A6') || !hay('MikroTik hAP ac3') || !hay('Compresor')){
    console.log('el catálogo ya no tiene los productos de referencia — se salta');
    process.exit(0);
}

// ── 1) El nombre completo perdía contra sus hermanos ─────────────────
/* Escribir «NanoStation M5 Loco» entero —el caso con MENOS duda que hay—
   devolvía "Encontré varios productos relacionados" con UN solo producto
   debajo, y «TP-Link Archer A6» sacaba primero el Archer BE230. La causa:
   la rama del nombre exacto no calculaba los `modelos` del producto, así que
   la exclusión por modelo (la que impide ofrecer la M2 a quien pide la M5)
   no se activaba justo cuando el cliente había sido más preciso. */
const e1 = await preguntar('NanoStation M5 Loco');
ok(/Stock|Ficha|Precio/i.test(e1),
   `el nombre completo tiene que dar la ficha, no una lista: «${e1.slice(0,140)}»`);
ok(!/Internacional|Loco M2|5 AC Loco/i.test(e1),
   `y sin los hermanos al lado: «${e1.slice(0,180)}»`);
const e2 = await preguntar('TP-Link Archer A6');
ok(/Archer A6/i.test(e2) && !/BE230|AX1450|AX55|AX21|C54/i.test(e2),
   `«TP-Link Archer A6» tiene que dar el A6 y ningún otro Archer: «${e2.slice(0,180)}»`);
/* Y el caso que apareció al arreglar el anterior: tres nombres del catálogo
   están CONTENIDOS dentro de otro, así que escribir el largo casa con los
   dos y devolvía el índice de la subcategoría encabezado por un producto
   que no era ninguno de los dos. Gana el largo, que es el específico. */
for(const [q, debe, noDebe] of [
        ['Inversor Tataliken 4000W (24V)', /4000W \(24V\)/i, /Tataliken 3500W/i],
        ['Controlador MPPT 100A POWMR',    /100A POWMR/i,      /Transferencia|Boost 1200W/i],
        ['Controlador MPPT 100A Con USB',  /100A Con USB/i,    /Transferencia/i]]){
    const r = await preguntar(q);
    ok(debe.test(r) && /Stock|Precio|Ficha/i.test(r),
       `«${q}» es un nombre completo: da su ficha. «${r.slice(0,150)}»`);
    ok(!noDebe.test(limpio(r).split('⟦')[0]),
       `«${q}» no puede contestarse con el índice de la subcategoría. «${r.slice(0,150)}»`);
}
/* Y la comparación: con los dos nombres escritos ENTEROS, Max comparaba el
   TP-Link Archer C54 —agotado y de uso— contra el AX1450, ninguno de los
   dos nombrado. Escribiéndolos abreviados («compara el hap ac3 con el
   archer a6») acertaba: otra vez el nombre completo era el caso que fallaba.
   Dos cosas lo causaban — la rama del nombre exacto no guardaba los
   `modelos`, así que la exclusión por modelo no descartaba a los hermanos, y
   detectProductMentions ordenaba solo por puntuación, que en un parcial
   crece con el número de palabras y pasa por encima del nombre exacto.
   La comparación devuelve los dos productos en `compare` ({p1,p2}), no en
   `products`: mirar solo el texto da por buena una tabla equivocada. */
const dosDe = async q => { const r = await B.responder(q);
    return [r.compare && r.compare.p1 && r.compare.p1.nombre,
            r.compare && r.compare.p2 && r.compare.p2.nombre]; };
for(const [q, a, b] of [
        ['compara el MikroTik hAP ac3 con el TP-Link Archer A6', /hAP ac3/i, /Archer A6/i],
        ['compara la NanoStation M5 Loco con la NanoStation Loco M2', /M5 Loco/i, /Loco M2/i],
        ['compara el Inversor Tataliken 3500W con el Inversor Tataliken 4000W', /3500W/i, /4000W/i]]){
    const [n1, n2] = await dosDe(q);
    ok(n1 && n2 && a.test(n1) && b.test(n2),
       `«${q}» compara los dos que se nombraron y en ese orden, no otros: «${n1} ⟷ ${n2}»`);
}

// ── 2) Preguntar el stock de UN producto daba el conteo del catálogo ──
/* «¿Hay stock del hap ac3?» y «¿está agotado el compresor?» contestaban
   "82 disponibles · 53 agotados", que no responde nada. detectProductMentions
   pide dos palabras del nombre y estos se nombran con una sola o solo por su
   modelo. La ficha ya dice si queda. */
await limpiarHilo();
const s1 = await preguntar('hay stock del hap ac3');
ok(/hAP ac3/i.test(s1) && !/productos agotados/i.test(s1),
   `preguntar el stock de un producto nombrado da su ficha: «${s1.slice(0,150)}»`);
const s2 = await preguntar('esta agotado el compresor');
ok(/Compresor/i.test(s2) && !/productos agotados/i.test(s2),
   `igual nombrándolo con una sola palabra: «${s2.slice(0,150)}»`);
/* Y al revés: preguntar por el inventario ENTERO tiene que seguir dando el
   conteo. Una regla que resuelva "el único que puntúa" sin exigir que esté
   NOMBRADO se lleva también estas, que rozan una palabra suelta de alguna
   descripción. */
for(const q of ['hay stock','que hay disponible','cuantos productos tienen agotados','cuantos productos tienen disponibles']){
    const r = await preguntar(q);
    ok(/Estado del cat[aá]logo|productos disponibles/i.test(r),
       `«${q}» pregunta por el inventario entero, no por un producto: «${r.slice(0,130)}»`);
}

// ── 3) La tasa sin cargar se anunciaba como «1 USD = 0 MN» ────────────
/* fmtMN y METODOS_PAGO ya se niegan a imprimir ese cero —está escrito en sus
   comentarios—; la respuesta que va ENTERA sobre la tasa era la única que
   todavía lo hacía, y encima tres veces (tasa, base y el ejemplo de $100).
   Pasa de verdad: la config llega por su cuenta y en Cuba puede no llegar.
   En este test no hay red, así que TASA_MN vale 0 — que es el caso. */
await limpiarHilo();
const t1 = await preguntar('a como esta el dolar hoy');
ok(!/=\s*0\s*MN|:\s*0\s*MN|\b0 MN\b/.test(t1),
   `sin tasa cargada no se anuncia un cero: «${t1.slice(0,200)}»`);
ok(/no tengo la tasa|WhatsApp/i.test(t1),
   `se dice que no se sabe y se manda a preguntarla: «${t1.slice(0,150)}»`);

// ── 4) «¿Cuál es el router más barato?» contestaba con llantas ────────
/* La regla \bbarato\b → ofertas solo miraba que no hubiera verbo de
   petición, así que a quien pedía un router le salían cuatro juegos de
   llantas rebajadas. Pedir el más barato DE ALGO es una pregunta sobre ese
   algo. */
await limpiarHilo();
const b1 = await preguntar('cual es el router mas barato');
ok(/ROUTERS|Archer|MikroTik|Tenda|Asus/i.test(b1) && !/Llantas/i.test(b1),
   `«el router más barato» es una pregunta sobre routers: «${b1.slice(0,170)}»`);
const b2 = await preguntar('cual es la camara mas barata');
ok(/C[ÁA]MARAS|Zosi|QW8/i.test(b2) && !/Llantas/i.test(b2),
   `y «la cámara más barata» sobre cámaras: «${b2.slice(0,150)}»`);
/* Sin decir de qué tipo, los extremos del catálogo. Antes salía "la Tienda
   de Campaña está agotada", que no responde nada. */
await limpiarHilo();
const b3 = await preguntar('que es lo mas caro que tienes');
ok(/m[aá]s caro/i.test(b3) && /⟦.+⟧/.test(b3) && !/agotado ahora mismo/i.test(b3),
   `«lo más caro que tienes» enseña los más caros: «${b3.slice(0,170)}»`);
/* Y "ofertas" a secas tiene que seguir siendo las ofertas. */
ok(/Ofertas y rebajas/i.test(await preguntar('que esta en oferta')),
   'preguntar por las ofertas sigue dando las ofertas');

// ── 5) «¿Aceptan MLC?» → "no entendí tu pregunta" ─────────────────────
/* Es una de las monedas con las que se paga en Cuba y no estaba en la lista
   de la regla de pago, que ya tiene cup, mn y usd. */
await limpiarHilo();
for(const q of ['aceptan mlc','puedo pagar con mlc','tienen mlc','mlc']){
    ok(/M[eé]todos de pago/i.test(await preguntar(q)),
       `«${q}» pregunta por los métodos de pago: MLC es una moneda, no un producto`);
}

// ── 6) «¿En cuánto tiempo llega?» → un timbre y un bidón de aceite ────
/* «llega» solo contaba seguido de «a» o «hasta», así que la pregunta más
   normal sobre la entrega se iba a la búsqueda difusa. Y la tabla de
   cobertura dice el DÓNDE, no el CUÁNDO: no hay plazo publicado, así que se
   dice eso — inventar un «24-48 h» es prometer algo que se viene a cobrar. */
await limpiarHilo();
const en1 = await preguntar('en cuanto tiempo llega');
ok(/tiempo de entrega|se coordina/i.test(en1),
   `preguntar cuándo llega se contesta sobre el tiempo: «${en1.slice(0,160)}»`);
ok(!/\b(24|48|72)\s*(h|horas)\b|\b\d+\s*d[ií]as h[aá]biles\b/i.test(en1),
   `y sin inventarse un plazo que nadie prometió: «${en1.slice(0,200)}»`);
ok(/Cobertura de env[ií]os|mensajer[ií]a directa/i.test(await preguntar('cuanto cuesta el envio')),
   'y la pregunta por la cobertura sigue dando la tabla de provincias');

// ── 7) «¿Venden celulares?» → "no entendí tu pregunta" ────────────────
/* La pregunta se entendía perfectamente; la respuesta es que no. El "no te
   entendí" suena a bot roto. No hace falta una lista de lo que no se vende:
   llegar al fallback ya significa que ninguna ficha puntúa, que es la misma
   comprobación que mantiene honesta a NO_VENDEMOS. */
await limpiarHilo();
for(const q of ['venden celulares','venden comida','tienen medicamentos','venden pasaje de avion']){
    const r = await preguntar(q);
    ok(/no lo manejo|no est[aá] en el cat[aá]logo/i.test(r),
       `«${q}» se contesta que no, no con "no te entendí": «${r.slice(0,130)}»`);
}
/* Pero SOLO cuando de verdad no hay nada: lo que sí está en el catálogo no
   puede recibir un "eso no lo manejo". */
for(const q of ['venden televisores','tienen ropa','tienen inversores']){
    const r = await preguntar(q);
    ok(!/no lo manejo/i.test(r),
       `«${q}» sí está en el catálogo y no puede negarse: «${r.slice(0,130)}»`);
}

// ── 8) La cola de resultados sin relación con lo buscado ──────────────
/* «¿Qué precio tiene el compresor?» sacaba el Compresor de Aire y, al lado,
   el Changan CS75. Lo que puntúa a menos de un tercio del primero no está
   "relacionado": comparte una palabra. */
await limpiarHilo();
const c1 = await preguntar('que precio tiene el compresor');
ok(!/Changan|Espejos|Fundas/i.test(c1),
   `un compresor no se acompaña de un SUV: «${c1.slice(0,160)}»`);
const c2 = await preguntar('mikrotik hex');
ok(/hEX/i.test(c2) && !/SXTsq|hAP ac3/i.test(c2),
   `«mikrotik hex» son los hEX, no toda la marca: «${c2.slice(0,160)}»`);

// ── 9) La autonomía no reconocía ni los equipos ni la frase ───────────
/* «¿Cuánto tiempo me dura si pongo un fan y 3 bombillos?» fallaba por las
   dos mitades —el «me» en medio, y «fan»/«bombillos» fuera de la lista de
   equipos— y contestaba con un litro de aceite Fanfaro. */
await limpiarHilo();
const a1 = await preguntar('cuanto tiempo me dura si pongo un fan y 3 bombillos');
ok(/autonom[ií]a/i.test(a1) && !/Fanfaro/i.test(a1),
   `una pregunta de autonomía no se contesta con aceite de motor: «${a1.slice(0,160)}»`);
ok(/Cobertura de env[ií]os|mensajer[ií]a|se coordina/i.test(await preguntar('cuanto dura el envio')),
   '«cuánto dura el envío» sigue siendo envíos, no autonomía');
ok(/Garant[ií]a/i.test(await preguntar('cuanto dura la garantia')),
   '«cuánto dura la garantía» sigue siendo la garantía');

// ── 10) «Se me apaga» no casaba con «se apaga» ───────────────────────
/* El «me» en medio es como se escribe aquí y partía los patrones de avería
   en dos: «se me apaga el inversor solo» acababa en el índice de INVERSORES
   —una lista para comprar, a quien ya tiene uno y se le apaga— y «no me
   carga la batería» en el de BATERÍAS. «No genera» faltaba entero: «el panel
   solar no genera nada» devolvía el Panel Decorativo de Hojas Artificiales. */
await limpiarHilo();
for(const q of ['se me apaga el inversor solo','no me carga la bateria',
                'se me reinicia el router','el panel solar no genera nada']){
    const r = await preguntar(q);
    ok(/🔧|Vamos a ver qu[eé] le pasa|Qu[eé] hacer/i.test(r),
       `«${q}» describe una avería, no una compra: «${r.slice(0,140)}»`);
    ok(!/tengo \d+ disponibles|de m[aá]s barato a m[aá]s caro|Decorativo/i.test(r),
       `«${q}» no puede contestarse con una lista para comprar: «${r.slice(0,140)}»`);
}

// ── 11) Querer comprar algo que no se vende → el instructivo de compra ──
/* «Quiero comprar un panel solar» devolvía los cinco pasos de cómo se compra
   en TiendaMax, de algo que no está a la venta. Y nombrando un producto
   concreto, lo que se quiere es su ficha con el botón de pedir, no el
   instructivo general. */
await limpiarHilo();
const v1 = await preguntar('quiero comprar un panel solar');
ok(/no vendo|no manejo/i.test(v1) && !/Paso 1/i.test(v1),
   `querer comprar lo que no se vende se contesta que no: «${v1.slice(0,140)}»`);
const v2 = await preguntar('quiero comprar el archer a6');
ok(/Archer A6/i.test(v2) && /Stock|Precio/i.test(v2) && !/Paso 1/i.test(v2),
   `nombrando el producto, su ficha: «${v2.slice(0,140)}»`);
/* Pero la pregunta genérica sigue dando el instructivo, que es lo que pide. */
for(const q of ['como compro','como hago un pedido','quiero comprar un router']){
    ok(/Paso 1|C[oó]mo comprar/i.test(await preguntar(q)),
       `«${q}» sí pide el instructivo de compra`);
}

if(fallos.length){
    console.error(`\n❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ Max repasado: los fallos del interrogatorio, cubiertos.');
