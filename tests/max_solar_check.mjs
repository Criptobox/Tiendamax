/* Max armando un sistema solar — con el catálogo real.
 *
 * Lo que proponía (nov-2026) para «sistema solar para el refri y 2
 * ventiladores»: un controlador MPPT, una BATERÍA DE CARRO y el BLUETTI
 * AC180 en el mismo hueco de «Batería», más la ficha de una lámpara-
 * ventilador pegada debajo, bajo «(todos disponibles en TiendaMax)» con un
 * inversor agotado y paneles que no se venden. Ningún instalador firma eso:
 *  · una estación todo en uno ya trae batería, inversor y controlador —
 *    no se le suma ninguno;
 *  · una batería de arranque no sirve para guardar energía solar;
 *  · «y 2 ventiladores» es la carga del sistema, no otra pregunta;
 *  · lo que falta se dice, y no se ofrece comparar inversores agotados.
 * Se corre dos veces: con el catálogo real y sin estaciones (armado por piezas).
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
const REALES = catalogo.productos || catalogo;
const SIN_ESTACION = process.env.TM_SIN_ESTACION === '1';
// Variante sin estaciones de energía: el armado por piezas sigue sin meter baterías de carro.
const PRODS = SIN_ESTACION ? REALES.filter(p => !/bluetti|generador solar|ecoflow/i.test(p.nombre)) : REALES;
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
const txt = r => String(r.response || '').replace(/<[^>]+>/g, '');
const nombres = r => (r.products || []).map(p => p.nombre).join(' | ');
const hayEstacion = PRODS.some(p => p.stock > 0 && /bluetti|generador solar/i.test(p.nombre));
const hayInv = PRODS.some(p => p.stock > 0 && String(p.subcategoria).toUpperCase() === 'INVERSORES');

for (const q of ['quiero un sistema solar para el refri y 2 ventiladores', 'sistema solar basico para luz']) {
  const r = await B.responder(q);
  const t = txt(r), n = nombres(r);
  ok(!/automotriz|arranque/i.test(t + n), `«${q}»: una batería de carro no va en un sistema solar:\n${t.slice(0, 500)}`);
  ok(!/todos disponibles/i.test(t), `«${q}»: no puede decir «todos disponibles» con piezas que faltan`);
  ok(!/l[aá]mpara/i.test(t + n), `«${q}»: lo que va detrás del «y» es la carga, no otra pregunta (salió una lámpara)`);
  ok(hayInv || !(r.quickReplies || []).some(b => /comparar inversores/i.test(b)), `«${q}»: ofrece comparar inversores sin ninguno en stock`);
  if (hayEstacion) {
    ok(/no necesitas bater[ií]a, inversor ni controlador aparte/i.test(t), `«${q}»: con la estación no se suman batería ni controlador:\n${t.slice(0, 500)}`);
    ok(!/controlador mppt/i.test(n), `«${q}»: se ofreció un controlador aparte de la estación: ${n}`);
    ok(/1152 Wh/.test(t) && /1800 W/.test(t), `«${q}»: las cifras de la estación salen de su ficha`);
    ok(/paneles solares/i.test(t), `«${q}»: tiene que decir qué pasa con los paneles`);
    const a = B.ultimoSistema && B.ultimoSistema.armado;
    ok(a && a.grupos.length === 2 && a.grupos[0].prods[0] && /bluetti/i.test(a.grupos[0].prods[0].nombre), 'la cotización tiene que ser la estación + paneles');
    const html = B.cotizacionHTML(a, B.ultimoSistema.notas);
    ok(!/Rango de presupuesto de referencia: <strong>(null|undefined)?<\/strong>/.test(html), 'la cotización imprime un presupuesto vacío');
  } else {
    ok(!/bluetti|generador solar/i.test(n), 'sin estación en stock no puede aparecer');
  }
}
// La casa completa no cabe en una estación de 1800 W.
const rc = await B.responder('sistema solar para casa completa con aire acondicionado');
ok(!/no necesitas bater/i.test(txt(rc)), 'la casa completa no se resuelve con una estación portátil');
ok(!/automotriz/i.test(txt(rc) + nombres(rc)), 'casa completa: tampoco baterías de carro');

// Un panel solar real en el catálogo: se ofrece si cabe en la entrada de la estación y, si da
// más vatios de los que ella admite, se dice que NO se conecte (en vez de recomendarlo o de
// decir «no los tengo»).
{
  const panel = PRODS.find(p => p.stock > 0 && (/panel(es)?\s+solar(es)?|panel.*fotovoltaic/i.test(String(p.nombre).split('|')[0]) || String(p.subcategoria).toUpperCase() === 'PANELES SOLARES') && !/\b(base|soporte|estructura|riel|rack|kit|controlador|cargador|inversor|disyuntor|breaker)\b/i.test(p.nombre));
  if (hayEstacion && panel) {
    const w = (String(panel.nombre).match(/(\d{2,4})\s*w\b/i) || [0, 0])[1] * 1;
    const r = await B.responder('quiero un sistema solar para el refri y 2 ventiladores');
    const t = txt(r);
    ok(!/No los tengo ahora|Agotados ahora mismo/i.test(t), 'hay un panel en el catálogo: no puede decir «no los tengo»');
    // El nombre puede traer espacios raros: se compara por palabras, no por la cadena exacta.
    const norm = x => String(x).replace(/\s+/g, ' ').trim().toLowerCase();
    ok(norm(t).includes(norm(panel.nombre).split('|')[0].trim().slice(0, 30)), 'el panel del catálogo tiene que aparecer en el sistema: ' + JSON.stringify(panel.nombre));
    if (w > 500) ok(/no lo conectes/i.test(t), `un panel de ${w} W supera la entrada de la estación (500 W): se dice que no se conecte`);
  }
}

if (fallos.length) { console.error('❌ ' + fallos.length + ' fallo(s):\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Max armando sistemas solares' + (SIN_ESTACION ? ' (sin estación)' : '') + ': en regla.');
