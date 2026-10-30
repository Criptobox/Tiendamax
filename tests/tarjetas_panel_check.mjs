/* 💳 Tarjetas en el panel, en un navegador de verdad — ver tarRender en
 * admin.html y js/src/tm-digital.src.js.
 *
 * Lo que se rompe aquí no da error: un precio que no se recalcula sale a la
 * venta con el margen de ayer, una ganancia mal contada se queda así en
 * Inicio para siempre, y un coste que se cuela en productos.json publica en
 * la web cuánto paga el dueño y dónde.
 *
 *  - Cambiar el coste recalcula precio (valor + 20 %, mínimo coste + 1) y
 *    ganancia, y deja el producto para publicar.
 *  - El coste se guarda en tm_costes_digitales, nunca en el producto.
 *  - Los interruptores quitan un producto o un importe sin borrarlo.
 *  - Vender: tocar la tarjeta pide el importe; la venta lleva el precio en
 *    USD y la ganancia como comisión, y no descuenta stock.
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
    const camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino.startsWith('/fakedb/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('null'); return; }
    try {
        const cuerpo = await readFile(normalize(join(RAIZ, camino === '/' ? '/admin.html' : camino)));
        r.writeHead(200, { 'Content-Type': MIME[extname(camino)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
let n = 0;
const ok = (c, m) => { n++; if (!c) fallos.push(m); };

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const MC = CATALOGO.find(p => p.slug === 'mastercard-prepago');
if (!MC) { console.log('no está la Mastercard prepago en el catálogo — se salta'); process.exit(0); }
const ID = String(MC.id);

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 420, height: 900 } });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
await ctx.addInitScript(([puerto, cat]) => {
    if (!localStorage.getItem('__tm_prueba')) {
        localStorage.setItem('__tm_prueba', '1');
        localStorage.setItem('firebaseConfig', JSON.stringify({ apiKey: 'x', projectId: 'p', databaseURL: `http://localhost:${puerto}/fakedb` }));
        localStorage.setItem('productos', JSON.stringify(cat));
    }
    window.confirm = () => true;
}, [PUERTO, CATALOGO]);
const errores = [];
const p = await ctx.newPage();
p.on('pageerror', e => errores.push(String(e).slice(0, 200)));
await p.goto(`http://localhost:${PUERTO}/admin.html#tarjetas`);
// Funciones, no texto: el CSP del panel prohíbe eval y una espera con texto
// se agota callada.
await p.waitForFunction(() => Array.isArray(window.PRODUCTOS) && window.PRODUCTOS.some(x => x && x.digital)
    && document.querySelector('#tar-lista .tar-prod'), null, { timeout: 30000 }).catch(() => {});
await p.evaluate(() => {
    const m = document.getElementById('loginModal'); if (m) m.classList.add('hidden');
    const a = document.getElementById('adminPanel'); if (a) a.classList.remove('hidden');
});

// 1) La pantalla
const lista = await p.evaluate(() => document.querySelectorAll('#tar-lista .tar-prod').length);
const cuantos = CATALOGO.filter(x => x.digital).length;
ok(lista === cuantos, `💳 Tarjetas enseña ${lista} productos y el catálogo tiene ${cuantos} digitales`);

// 2) Cambiar el coste de la Mastercard de $20 a 25 USDT: 20 × 1,2 = 24 < 25 + 1 → 26
const cambia = async (v, valor) => p.evaluate(([id, v, valor]) => {
    const i = document.querySelector(`#tar-lista input[data-act="coste"][data-pid="${id}"][data-v="${v}"]`);
    i.value = valor; i.dispatchEvent(new Event('change', { bubbles: true }));
}, [ID, String(v), String(valor)]);
await cambia(20, 25);
const tras = await p.evaluate(id => {
    const prod = window.PRODUCTOS.find(x => String(x.id) === id);
    const ls = (JSON.parse(localStorage.getItem('productos')) || []).find(x => String(x.id) === id);
    const costes = JSON.parse(localStorage.getItem('tm_costes_digitales') || '{}');
    const mods = JSON.parse(localStorage.getItem('productosModificados') || '[]').map(String);
    const fila = [...document.querySelectorAll(`#tar-lista input[data-pid="${id}"]`)].find(i => i.dataset.v === '20').closest('tr');
    return { imp: prod.importes.find(x => x.v === 20), precioActual: prod.precioActual, comision: prod.comision,
             lsImp: ls && ls.importes.find(x => x.v === 20), coste: costes[id] && costes[id].imps && costes[id].imps['20'],
             marcado: mods.includes(id), fila: fila.textContent.replace(/\s+/g, ' ') };
}, ID);
ok(tras.imp.usdt === 26 && tras.imp.usd === 27.5, `con coste 25 la de $20 debería costar 26 USDT / $27.5 y quedó ${JSON.stringify(tras.imp)}`);
ok(tras.lsImp && tras.lsImp.usdt === 26, 'el precio nuevo no se guardó en el catálogo del panel');
ok(tras.coste && tras.coste.c === 25, 'el coste no se guardó en tm_costes_digitales');
ok(tras.marcado, 'el producto no quedó marcado para publicar');
ok(/0\.90/.test(tras.fila), `la fila no enseña la ganancia (26 − 25 − 0,10 = 0,90): «${tras.fila}»`);
ok(Math.abs(tras.comision - 0.9) < 1e-9 && tras.precioActual === 27.5, `la comisión/precio del producto no siguen al importe más barato: ${tras.comision} / ${tras.precioActual}`);
const publico = await p.evaluate(() => localStorage.getItem('productos'));
ok(!/"coste"|"proveedor"|Bitrefill|Cryptorefills/.test(publico), 'el coste o el proveedor se colaron en el catálogo que se publica');

// Lo devolvemos al coste real para lo que sigue: 20,5 → 24 USDT.
await cambia(20, 20.5);

// 3) Interruptores
await p.evaluate(id => document.querySelector(`#tar-lista button[data-act="imp"][data-pid="${id}"][data-v="100"]`).click(), ID);
await p.evaluate(id => document.querySelector(`#tar-lista button[data-act="prod"][data-pid="${id}"]`).click(), ID);
const sw = await p.evaluate(id => {
    const prod = window.PRODUCTOS.find(x => String(x.id) === id);
    return { activo: prod.activo, on100: prod.importes.find(x => x.v === 100).on, oculto: tmDigitalOculto(prod) };
}, ID);
ok(sw.on100 === false, 'el interruptor del importe no lo apagó');
ok(sw.activo === false && sw.oculto, 'el interruptor del producto no lo quitó de la tienda');
await p.evaluate(id => document.querySelector(`#tar-lista button[data-act="prod"][data-pid="${id}"]`).click(), ID);

// 4) Vender un importe
await p.evaluate(() => go('ventas'));
await p.evaluate(id => ventaAdd(id), ID);
const selector = await p.evaluate(() => {
    const b = document.getElementById('venta-imps');
    return { visible: b && !b.hidden, botones: b ? [...b.querySelectorAll('button[data-v]')].map(x => x.dataset.v) : [] };
});
ok(selector.visible, 'tocar una tarjeta digital al vender no pidió el importe');
ok(selector.botones.join() === '20,50', `el selector de importe ofrece ${selector.botones.join()} y debería ofrecer 20,50 (el de 100 está apagado)`);
await p.evaluate(() => document.querySelector('#venta-imps button[data-v="50"]').click());
const venta = await p.evaluate(id => {
    const antes = window.PRODUCTOS.find(x => String(x.id) === id).stock;
    ventaRegistrar();
    const v = (JSON.parse(localStorage.getItem('registroVentas') || '[]'))[0];
    return { antes, despues: window.PRODUCTOS.find(x => String(x.id) === id).stock, v };
}, ID);
const linea = venta.v && (venta.v.items || [])[0];
ok(linea && /\$50/.test(linea.producto), `la venta no dice qué importe se vendió: ${JSON.stringify(linea)}`);
ok(linea && linea.precio === 63 && linea.moneda === 'USD', `la venta de la de $50 tiene que ir a $63 USD: ${JSON.stringify(linea)}`);
ok(linea && Math.abs(linea.comision - (60 - 51.26 - 0.10)) < 1e-6 && linea.comisionMoneda === 'USD',
   `la comisión de la venta tiene que ser la ganancia (60 − 51,26 − 0,10): ${JSON.stringify(linea)}`);
ok(venta.antes === venta.despues, `vender un digital descontó stock (${venta.antes} → ${venta.despues})`);

ok(!errores.length, 'errores de JavaScript: ' + errores.join(' | '));
await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${n} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${n} comprobaciones de 💳 Tarjetas en el panel`);
