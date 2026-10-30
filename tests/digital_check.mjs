/* Productos digitales (categoría TARJETAS) en la tienda, en un navegador de
 * verdad — ver js/src/tm-digital.src.js.
 *
 * Nada de esto da error cuando se rompe: la tarjeta sale igual, solo que con
 * el precio en MN a la tasa del dólar (el dueño pierde en cada venta), o
 * «Pedir» manda a WhatsApp un mensaje sin importe ni red de pago, o la ficha
 * normal abre un producto que no tiene ni stock real ni foto de verdad.
 *
 *  - La tarjeta: precio en USDT, «≈ $X USD», «Código por WhatsApp» y ningún
 *    «Pago al recibir».
 *  - Con MN elegido, ese precio NO cambia (no lleva .precio-actual).
 *  - «Pedir» y la ficha: abre la ficha digital con un botón por importe.
 *  - El mensaje de WhatsApp lleva importe, total en USDT con la red BEP20 y
 *    en USD, y en las recargas pide el ID de jugador.
 *  - Un producto normal sigue abriendo la ficha de siempre.
 *
 * categorias.json se sirve sin `apagadas`: la categoría nace apagada en el
 * repo y lo que se prueba aquí es cómo se ve cuando el dueño la encienda.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const servidor = createServer(async (q, r) => {
    let camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino === '/') camino = '/index.html';
    try {
        let cuerpo = await readFile(normalize(join(RAIZ, camino)));
        if (camino.endsWith('categorias.json')) {
            const c = JSON.parse(cuerpo); delete c.apagadas; cuerpo = JSON.stringify(c);
        }
        r.writeHead(200, { 'Content-Type': MIME[extname(camino)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
let n = 0;
const ok = (c, m) => { n++; if (!c) fallos.push(m); };

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const DIG = CATALOGO.filter(p => p.digital);
const FF = DIG.find(p => p.unidad);
const TARJ = DIG.find(p => !p.unidad && p.region === 'EE. UU.');
const FISICO = CATALOGO.find(p => !p.digital && Number(p.stock) > 0);
if (!FF || !TARJ || !FISICO) { console.log('no hay productos digitales en el catálogo — se salta'); process.exit(0); }

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
await ctx.addInitScript(() => {
    window.__abiertos = [];
    window.open = (u) => { window.__abiertos.push(String(u)); return null; };
});
const errores = [];
const p = await ctx.newPage();
p.on('pageerror', e => errores.push(String(e).slice(0, 200)));
await p.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof tmEsDigital === 'function' && typeof productos !== 'undefined'
    && Array.isArray(productos) && productos.some(x => x && x.digital), null, { timeout: 30000 }).catch(() => {});

// 1) La tarjeta
const card = await p.evaluate(id => {
    const prod = productos.find(x => String(x.id) === String(id));
    const c = window._tmCrearCard ? window._tmCrearCard(prod) : null;
    if (!c) return null;
    document.body.appendChild(c);
    return { txt: c.textContent, html: c.innerHTML };
}, String(TARJ.id));
ok(card, 'no se pudo dibujar la tarjeta de un producto digital (¿_tmCrearCard no existe?)');
if (card) {
    const desde = Math.min(...TARJ.importes.map(x => x.usdt));
    ok(card.txt.includes(desde + ' USDT'), `la tarjeta no dice «${desde} USDT»: «${card.txt.slice(0, 160)}»`);
    ok(/≈ \$[\d.]+ USD/.test(card.txt), 'la tarjeta no dice su equivalente en USD');
    ok(/Código por WhatsApp/.test(card.txt), 'la tarjeta no dice «Código por WhatsApp»');
    ok(!/Pago al recibir/.test(card.txt), 'un digital no se paga al recibir: la tarjeta no puede decirlo');
    ok(!/precio-actual/.test(card.html), 'el precio de un digital no puede llevar .precio-actual: el conmutador lo pasaría a MN');
}

// 2) Con MN elegido, el precio en USDT no se toca
const conMN = await p.evaluate(() => {
    if (typeof setCurrency === 'function') setCurrency('MN');
    if (typeof actualizarPreciosMostrados === 'function') actualizarPreciosMostrados();
    const el = document.querySelector('.tm-dig-precio');
    return el ? el.textContent : '';
});
ok(/USDT$/.test(conMN) && !/MN/.test(conMN), `con MN elegido el precio digital cambió: «${conMN}»`);
await p.evaluate(() => { if (typeof setCurrency === 'function') setCurrency('USD'); });

// 3) La ficha
await p.evaluate(id => abrirDetalleProducto(id), FF.id);
await p.waitForTimeout(400);
const ficha = await p.evaluate(() => {
    const f = document.getElementById('tmDigFicha');
    return f ? { on: f.classList.contains('on'), imps: f.querySelectorAll('#tmDigImps button').length,
                 txt: f.textContent } : null;
});
ok(ficha && ficha.on, 'abrirDetalleProducto con un digital no abrió la ficha digital');
if (ficha) {
    ok(ficha.imps === FF.importes.filter(x => x.on !== false).length, `la ficha enseña ${ficha.imps} importes y el producto tiene ${FF.importes.length}`);
    ok(/ID de jugador/.test(ficha.txt), 'la ficha de una recarga no avisa del ID de jugador');
}
// elegir el importe más grande y pedir dos
const ult = FF.importes.length - 1;
await p.evaluate(i => { document.querySelector(`#tmDigImps button[data-i="${i}"]`).click(); }, ult);
await p.evaluate(() => { document.getElementById('tmDigMas').click(); document.getElementById('tmDigPedir').click(); });
const abiertos = await p.evaluate(() => window.__abiertos.slice());
const wa = abiertos.find(u => u.includes('wa.me')) || '';
const msg = decodeURIComponent(wa.split('text=')[1] || '');
const imp = FF.importes[ult];
ok(wa, '«Pedir» de la ficha digital no abrió WhatsApp');
ok(msg.includes('2×') && msg.includes(imp.v.toLocaleString('es-ES')), `el mensaje no lleva cantidad e importe: «${msg}»`);
ok(msg.includes((imp.usdt * 2) + ' USDT') && /BEP20/.test(msg), `el mensaje no lleva el total en USDT y la red BEP20: «${msg}»`);
ok(/ID de jugador/.test(msg), `el mensaje de una recarga no pide el ID: «${msg}»`);
await p.evaluate(() => tmDigitalCerrar());

// 4) La tarjeta con región: el aviso
await p.evaluate(id => abrirDetalleProducto(id), TARJ.id);
await p.waitForTimeout(300);
const reg = await p.evaluate(() => document.getElementById('tmDigAviso').textContent);
ok(/EE\. UU\./.test(reg), `la ficha de una tarjeta de EE. UU. no avisa de la región: «${reg}»`);
await p.evaluate(() => tmDigitalCerrar());

// 5) «Pedir» desde fuera de la ficha (tmComprar) también abre la ficha
await p.evaluate(id => { window.__abiertos = []; tmComprar(null, id, 'x'); }, FF.id);
const tras = await p.evaluate(() => ({ abiertos: window.__abiertos.length, on: document.getElementById('tmDigFicha').classList.contains('on') }));
ok(tras.on && tras.abiertos === 0, 'tmComprar con un digital fue directo a WhatsApp sin elegir importe');
await p.evaluate(() => tmDigitalCerrar());

// 6) Un producto normal sigue con su ficha
await p.evaluate(id => abrirDetalleProducto(id), FISICO.id);
await p.waitForTimeout(500);
const normal = await p.evaluate(() => document.getElementById('tmDigFicha').classList.contains('on'));
ok(!normal, 'un producto normal abrió la ficha digital');

ok(!errores.length, 'errores de JavaScript: ' + errores.join(' | '));
await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${n} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${n} comprobaciones de productos digitales`);
