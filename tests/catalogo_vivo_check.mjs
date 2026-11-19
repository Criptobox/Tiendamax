/* El catálogo en vivo: lo que el dueño cambia le llega a Max (y a la tienda) sin
 * recargar la página.
 *
 * El fallo era silencioso: Max comparaba el catálogo con una firma de «cuántos
 * hay, el primero y el último», así que un producto que se agotaba o cambiaba de
 * precio no la movía; y la tienda leía productos-lite.json una sola vez, al abrir.
 * Resultado: con el chat abierto, Max ofrecía lo que ya no había y nada fallaba.
 *
 * Un servidor falso sirve el catálogo real y lo cambia a mitad de la prueba
 * (agota un producto, cambia un precio, añade uno nuevo, apaga una categoría).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('playwright')); }
catch (e) { try { ({ chromium } = requerir(join(process.env.NODE_PATH || '', 'playwright'))); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const LITE = JSON.parse(await readFile(join(RAIZ, 'productos-lite.json'), 'utf8'));
const CATS = JSON.parse(await readFile(join(RAIZ, 'categorias.json'), 'utf8'));
delete CATS.apagadas;                                   // lo apagado hoy no es lo que se prueba
const OBJ = LITE.find(p => /defender 10w/i.test(p.nombre) && Number(p.stock) > 0);
const OTRO = LITE.find(p => p !== OBJ && Number(p.stock) > 0 && p.precioActual && p.moneda !== 'MN' && !p.digital);
if (!OBJ || !OTRO) { console.log('faltan productos de prueba en el catálogo — se salta'); process.exit(0); }

// El catálogo que sirve el servidor; la prueba lo muta.
let SERVIDO = JSON.parse(JSON.stringify(LITE));
let CATS_SERVIDAS = JSON.parse(JSON.stringify(CATS));
let pedidosLite = 0;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const servidor = createServer(async (q, r) => {
  const camino = decodeURIComponent(q.url.split('?')[0]);
  if (camino === '/productos-lite.json') { pedidosLite++; r.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(SERVIDO)); return; }
  if (camino === '/categorias.json') { r.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(CATS_SERVIDAS)); return; }
  try {
    const ruta = camino === '/' ? '/index.html' : camino;
    r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
    r.end(await readFile(normalize(join(RAIZ, ruta))));
  } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(u => !['localhost', 'tiendamax.org'].includes(u.hostname), r => r.abort());
await ctx.route(u => u.hostname === 'tiendamax.org', r => r.fulfill({ status: 404 }));
const pg = await ctx.newPage();
const errores = []; pg.on('pageerror', e => errores.push(String(e)));
await pg.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0, null, { timeout: 15000 });

// Abre Max y espera su cerebro.
await pg.click('#tmBotBubble');
await pg.waitForFunction(() => window._tmBotCerebroListo === true, null, { timeout: 15000 });
const preguntar = async (q) => {
  await pg.evaluate(() => { window._tmBot.context && (window._tmBot.context.lastProduct = null); });
  await pg.fill('#tmBotInput', q); await pg.click('#tmBotSend');
  await pg.waitForFunction(() => !document.querySelector('.tm-bot-typing'), null, { timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(2200);
  // Todo lo que Max puso tras tu mensaje: la tarjeta con la foto (que lleva el
  // nombre) y el texto de debajo.
  return pg.evaluate(() => {
    const cuerpo = document.getElementById('tmBotBody');
    const hijos = [...cuerpo.children];
    let i = hijos.length - 1;
    while (i >= 0 && !(hijos[i].classList.contains('tm-bot-msg') && hijos[i].classList.contains('user'))) i--;
    return hijos.slice(i + 1).map(h => h.innerText || '').join(' ').replace(/\s+/g, ' ').trim();
  });
};
const tarjetas = () => pg.evaluate(() => document.querySelectorAll('#tmBotMessages .tm-bot-product, #tmBotMessages [data-pid]').length);

// ── 1. Con el catálogo de hoy, Max lo ofrece ──────────────────────────────
let r1 = await preguntar('tienen 10w40');
ok(/disponible|en stock|Defender/i.test(r1) && !/agotado/i.test(r1.slice(0, 120)), `con stock, Max debe ofrecerlo: ${r1.slice(0, 160)}`);

// ── 2. El dueño lo agota, cambia otro precio, añade uno nuevo ─────────────
const precioViejo = OTRO.precioActual, precioNuevo = Number(precioViejo) + 7;
SERVIDO = JSON.parse(JSON.stringify(LITE)).map(p => {
  if (p.id === OBJ.id) p.stock = 0;
  if (p.id === OTRO.id) p.precioActual = precioNuevo;
  return p;
});

// Sin recargar: el siguiente mensaje se pone al día solo (se vence el intervalo a mano).
await pg.evaluate(() => { _tmVivoUltima = 0; });
const antes = pedidosLite;
let r2 = await preguntar('tienen 10w40');
ok(pedidosLite > antes, 'al preguntar, la tienda volvió a pedir productos-lite.json');
ok(!/\b\d+\s+disponibles?\b|\bquedan\b/i.test(r2.slice(0, 200)) || /agotad/i.test(r2), `agotado en el servidor: Max no debe seguir ofreciéndolo: ${r2.slice(0, 200)}`);
ok(/agotad/i.test(r2), `Max debe decir que está agotado: ${r2.slice(0, 200)}`);

// El precio nuevo es el que Max dice.
let r3 = await preguntar(`cuanto cuesta ${OTRO.nombre.split('|')[0].trim()}`);
ok(r3.includes('$' + precioNuevo) || r3.includes(String(precioNuevo)), `el precio nuevo ($${precioNuevo}) debe salir en Max: ${r3.slice(0, 200)}`);
ok(!r3.includes('$' + precioViejo + '.00') || Number(precioViejo) === precioNuevo, 'el precio viejo no debe seguir saliendo');

// Ahora el dueño añade un producto nuevo (aquí sí cambia la cantidad).
SERVIDO.push({ id: 999000111, nombre: 'Estante Prueba Vivo XQ', categoria: OBJ.categoria, subcategoria: OBJ.subcategoria,
               precioActual: 12, stock: 5, imagen: OBJ.imagen, moneda: 'USD' });
await pg.evaluate(() => { _tmVivoUltima = 0; });
// El producto nuevo existe para Max y para la tienda.
let r4 = await preguntar('tienen estante prueba vivo');
ok(/Estante Prueba Vivo/i.test(r4), `lo nuevo debe aparecer: ${r4.slice(0, 200)}`);
const enTienda = await pg.evaluate(() => productos.some(p => p.id === 999000111) && JSON.parse(localStorage.getItem('productos')).some(p => p.id === 999000111));
ok(enTienda, 'la tienda también tiene el producto nuevo (memoria y localStorage)');

// ── 3. Sin cambios no se repinta nada ni se guarda de más ─────────────────
const huella = () => pg.evaluate(() => tmCatalogoHuella(productos));
const h1 = await huella();
await pg.evaluate(() => { _tmVivoUltima = 0; });
const cambio = await pg.evaluate(() => tmRefrescarCatalogoVivo({ min: 0 }));
ok(cambio === false, 'sin cambios en el servidor, la revisión dice que no cambió nada');
ok(h1 === await huella(), 'sin cambios, el catálogo queda igual');

// ── 4. Se apaga una categoría: desaparece de Max y de la tienda ───────────
CATS_SERVIDAS = JSON.parse(JSON.stringify(CATS));
CATS_SERVIDAS.apagadas = { categorias: { [OBJ.categoria]: { off: true, ts: Date.now() } }, subcategorias: {} };
await pg.evaluate(() => { _tmVivoUltima = 0; });
const c2 = await pg.evaluate(() => tmRefrescarCatalogoVivo({ min: 0 }));
ok(c2 === true, 'apagar una categoría se detecta');
const quedan = await pg.evaluate((cat) => productos.filter(p => p.categoria === cat).length, OBJ.categoria);
ok(quedan === 0, `apagada la categoría, la tienda no debe tener sus productos (quedan ${quedan})`);
let r5 = await preguntar('tienen estante prueba vivo');
// Apagada la categoría, Max lo nombra solo para decir que no está disponible: no enseña
// su tarjeta ni ofrece avisarle al cliente cuando llegue.
ok(/no est[aá] disponible/i.test(r5), `Max debe decir que lo de una categoría apagada no está disponible: ${r5.slice(0, 200)}`);
ok(!/\$12|en stock|disponibles?\b(?!.*no est)|Avísame/i.test(r5.replace(/no est[aá] disponible/ig, '')), `Max no debe enseñar el producto apagado ni ofrecer avisar: ${r5.slice(0, 200)}`);

ok(errores.length === 0, 'errores de página: ' + JSON.stringify(errores));
await navegador.close(); servidor.close();
if (fallos.length) { console.error(`❌ ${fallos.length} comprobación(es) fallida(s):\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log('✅ El catálogo en vivo: Max y la tienda se ponen al día sin recargar.');
