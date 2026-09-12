/* Max buscando un producto concreto — con el catálogo real.
 *
 * El caso que lo destapó: un cliente escribió «Necesito nano loco m5». La
 * NanoStation M5 Loco estaba con 12 unidades, y Max contestó con una lista
 * de recomendaciones. La causa, silenciosa:
 *
 *  · **El modelo se tiraba a la basura.** Las palabras del nombre se
 *     filtraban con `w.length > 3`, así que `m5` no contaba. En este
 *     catálogo m5 no es m2, ac3 no es ax3 y «8 Puertos» no es «5 Puertos»:
 *     esas dos o tres letras son justo lo que separa un producto de su
 *     hermano, y eran lo único que se descartaba.
 * Y dos reglas que van en la dirección contraria —la de no contestar de
 * más—, que son las que hay que vigilar de verdad:
 *
 *  · Si el cliente NOMBRÓ un modelo, el que lleva otro distinto no se
 *    ofrece: quien pide la m5 y ve la M2 al lado puede comprarse la que no
 *    era. Se descarta, no se baja de puesto.
 *  · Pedir por su nombre algo AGOTADO tiene que dar su ficha diciendo que
 *    está agotado, no la ficha del hermano que sí queda. Eso último es una
 *    respuesta segura a una pregunta que nadie hizo.
 *
 * Corre sin red, contra productos.json.
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
    fetch:()=>Promise.reject(new Error('sin red en el test')),
};
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(RAIZ,'js/src/tm-bot-cerebro.src.js'),'utf8'), sb);
const B = sb.window._tmBot;
B.sincronizar();
await new Promise(r => setTimeout(r, 30));

const limpio = s => String(s||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
/* Lo que el cliente ve son DOS cosas: el texto y las tarjetas de producto que
   van en `products`. Mirar solo el texto da por bueno un "Encontré varios
   productos relacionados" que debajo enseña justo el equivocado. */
const preguntar = async q => {
    const r = await B.responder(q);
    return limpio(r.response) + ' ⟦' + (r.products||[]).map(p => p.nombre).join(' | ') + '⟧';
};
const hay = n => PRODS.some(p => new RegExp(n,'i').test(p.nombre||''));

// El test se apoya en productos reales: si el catálogo cambia y ya no están,
// vale más saltar que dar por bueno un test que ya no prueba nada.
if(!hay('NanoStation M5 Loco') || !hay('NanoStation Loco M2') || !hay('Switch Gigabit de 8 Puertos')){
    console.log('el catálogo ya no tiene los productos de referencia — se salta');
    process.exit(0);
}

// ── 1) El caso real ──────────────────────────────────────────────────
const r1 = await preguntar('Necesito nano loco m5');
ok(/NanoStation M5 Loco/i.test(r1),
   `«nano loco m5» tiene que encontrar la NanoStation M5 Loco (12 en stock): «${r1.slice(0,120)}»`);
ok(!/te puedo recomendar|Mira cuál te encaja/i.test(r1),
   'pedir UN producto por su nombre no puede contestarse con una lista de recomendaciones');
ok(/160|Stock|Ficha/i.test(r1),
   'y tiene que ser la ficha, con su precio y su stock, no solo el nombre');

// ── 2) El modelo que no es, no se ofrece ─────────────────────────────
ok(!/Loco M2|M2 Internacional/i.test(r1),
   `quien escribe «m5» no puede recibir la M2 al lado: son dos equipos y se lleva el que no era. «${r1.slice(0,160)}»`);
const r2 = await preguntar('nanostation loco m2');
ok(/Loco M2/i.test(r2) && !/M5 Loco/i.test(r2),
   `y al revés igual: pedir la m2 no puede sacar la M5. «${r2.slice(0,140)}»`);

// ── 3) La abreviatura ────────────────────────────────────────────────
ok(/Archer A6/i.test(await preguntar('tienes el archer a6')),
   'un modelo de dos caracteres (a6) tiene que bastar para identificar el producto');
ok(/RB750GR3/i.test(await preguntar('mikrotik hex rb750gr3')),
   'el nombre completo con su modelo tiene que dar ese producto y no otro');

// ── 4) Un solo resultado es una ficha, no una lista de uno ───────────
const r4 = await preguntar('switch de 5 puertos');
ok(!/producto que coinciden|Dime cuál te interesa/i.test(r4),
   `con un solo resultado no hay nada que elegir; la lista de uno obliga a un toque de más: «${r4.slice(0,120)}»`);
ok(/Switch Gigabit de 5 Puertos/i.test(r4), 'y es la ficha de ese producto');
ok(/\$20|Stock|Ficha/i.test(r4), 'con su precio y su stock, que es lo que se venía a saber');

// ── 5) Lo agotado se dice, no se sustituye ───────────────────────────
const r5 = await preguntar('quiero un switch de 8 puertos');
ok(/8 Puertos/i.test(r5),
   `el de 8 existe (agotado): hay que hablar de ÉL. «${r5.slice(0,140)}»`);
ok(/agotado/i.test(r5),
   'y decir que está agotado — el cliente puede apuntarse al aviso de reposición');
ok(!/^📦 🌐 Switch Gigabit de 5/.test(r5),
   'dar la ficha del de 5 como si fuera lo pedido es una respuesta segura a una pregunta que nadie hizo');

// ── 6) Una cifra que no es un modelo no filtra nada ──────────────────
// "tengo 150 dólares" no está nombrando el modelo 150 de nada.
const r6 = await preguntar('tengo 150 dolares que me llevo');
ok(!/no estoy seguro de haber entendido/i.test(r6),
   `una cifra de presupuesto no puede dejar al bot sin respuesta: «${r6.slice(0,120)}»`);

// ── 7) Tienda física → WhatsApp ──────────────────────────────────────
for(const q of ['tienen tienda fisica','puedo ir a verlo','donde estan ubicados',
                'puedo pasar por la tienda','me puedo acercar']){
    const r = await preguntar(q);
    ok(/online/i.test(r) && !/no estoy seguro de haber entendido/i.test(r),
       `«${q}» tiene que entenderse: quien lo pregunta está a un paso de comprar. «${r.slice(0,100)}»`);
    ok(/WhatsApp/i.test(r),
       `«${q}»: decir solo «no hay local» cierra la conversación; hay que mandarlo a escribir. «${r.slice(0,120)}»`);
}

// ── 8) Nada de lo que ya estaba protegido se rompe ───────────────────
// Cada una de estas tiene su propia cicatriz en los comentarios del cerebro.
const noRomper = [
    ['tienen paneles solares', /no vendo|no tenemos/i, 'paneles solares: sigue diciendo que no'],
    ['aceite para carro', /aceite|mannol|fanfaro/i, 'aceite para carro no puede devolver el ventilador'],
    // Aquí el invariante es al revés: NO negar algo que el catálogo sí
    // tiene. El generador solar BLUETTI y la PC de escritorio existen, y
    // NO_VENDEMOS llegó a taparlos. Lo que no puede pasar es el «no vendo».
    ['necesito un generador', /^(?!.*no (vendo|manejo)).*/is, 'el generador solar está en catálogo: no se puede negar'],
    ['tienen laptops', /^(?!.*\bno manejo\b).*/is, 'hay una PC en catálogo: la última palabra la tiene el catálogo'],
    ['acepta transferencia', /pago|transferencia/i, 'pago por transferencia'],
];
for(const [q, re, porque] of noRomper){
    const r = await preguntar(q);
    ok(re.test(r), `${porque} — contestó: «${r.slice(0,140)}»`);
}

if(fallos.length){
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Max buscando producto: 25 comprobaciones OK');
