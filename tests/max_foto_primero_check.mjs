/* Ficha de un producto en Max: la FOTO primero, los datos debajo.
 *
 * Antes salía la ficha larga y, al final, una tarjeta pequeña; además el chat se
 * desplazaba al final del texto, así que la foto quedaba arriba, fuera de vista.
 * Aquí se comprueba en un navegador: orden en el DOM, que la tarjeta se vea sin
 * desplazarse, que las listas sigan con el texto primero y que el siguiente
 * mensaje del cliente suelte el anclaje.
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
const PROD = LITE.find(p => Number(p.stock) > 0 && !p.digital && p.moneda !== 'MN' && /defender 10w/i.test(p.nombre));
if (!PROD) { console.log('falta el producto de prueba — se salta'); process.exit(0); }
const CATS = JSON.parse(await readFile(join(RAIZ, 'categorias.json'), 'utf8')); delete CATS.apagadas;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const servidor = createServer(async (q, r) => {
  const camino = decodeURIComponent(q.url.split('?')[0]);
  if (camino === '/categorias.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(CATS)); return; }
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
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.route(u => !['localhost', 'tiendamax.org'].includes(u.hostname), r => r.abort());
await ctx.route(u => u.hostname === 'tiendamax.org', r => r.fulfill({ status: 404 }));
const pg = await ctx.newPage();
await pg.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0, null, { timeout: 15000 });
await pg.tap('#tmBotBubble');
await pg.waitForFunction(() => window._tmBotCerebroListo === true, null, { timeout: 15000 });

const preguntar = async (q) => {
  await pg.fill('#tmBotInput', q); await pg.tap('#tmBotSend');
  await pg.waitForFunction(() => !document.querySelector('.tm-bot-typing'), null, { timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(1800);
};
// Qué hay después del último mensaje del cliente, en orden.
const secuencia = () => pg.evaluate(() => {
  const cuerpo = document.getElementById('tmBotBody');
  const hijos = [...cuerpo.children];
  let i = hijos.length - 1;
  while (i >= 0 && !(hijos[i].classList.contains('tm-bot-msg') && hijos[i].classList.contains('user'))) i--;
  return hijos.slice(i + 1).map(h =>
    h.classList.contains('tm-bot-products') ? (h.querySelector('.tm-bot-product.grande') ? 'tarjeta-grande' : 'tarjetas')
    : h.classList.contains('bot') ? 'texto' : 'otro');
});

// ── 1. Un producto: tarjeta grande ANTES del texto ───────────────────────
await preguntar(PROD.nombre.split('|')[0].trim());
let sec = await secuencia();
ok(sec[0] === 'tarjeta-grande', `la ficha de un producto empieza por la tarjeta con la foto: ${JSON.stringify(sec)}`);
ok(sec.indexOf('texto') > sec.indexOf('tarjeta-grande'), `los datos van DESPUÉS de la tarjeta: ${JSON.stringify(sec)}`);
const vista = await pg.evaluate(() => {
  const cuerpo = document.getElementById('tmBotBody');
  const t = cuerpo.querySelector('.tm-bot-products:last-of-type .tm-bot-product.grande') ||
            [...cuerpo.querySelectorAll('.tm-bot-product.grande')].pop();
  if(!t) return null;
  const rt = t.getBoundingClientRect(), rc = cuerpo.getBoundingClientRect();
  const img = t.querySelector('img').getBoundingClientRect();
  return { arriba: rt.top - rc.top, dentro: rt.top >= rc.top - 2 && rt.top < rc.bottom - 100, alto: img.height };
});
ok(vista && vista.dentro, `la tarjeta tiene que verse sin desplazarse (${vista ? Math.round(vista.arriba) + 'px' : 'no hay tarjeta grande'})`);
ok(vista && vista.alto >= 150, `la foto es grande (${vista ? Math.round(vista.alto) + 'px' : 'no hay tarjeta grande'} de alto)`);

// El texto de debajo no repite el nombre que la tarjeta ya trae arriba.
const textoDebajo = await pg.evaluate(() => {
  const cuerpo = document.getElementById('tmBotBody');
  const m = [...cuerpo.querySelectorAll('.tm-bot-msg.bot')].pop();
  return m ? m.innerText.replace(/\s+/g, ' ').trim() : '';
});
const nombreCorto = PROD.nombre.split('|')[0].trim();
ok(!textoDebajo.startsWith(nombreCorto) && !textoDebajo.startsWith('📦 ' + nombreCorto),
   `el texto no debe volver a empezar por el nombre (ya está en la tarjeta): ${textoDebajo.slice(0, 80)}`);

// ── 2. Una lista: el texto sigue ANTES de las tarjetas ───────────────────
await preguntar('aceite 5w30');
sec = await secuencia();
ok(sec.indexOf('texto') !== -1 && sec.indexOf('tarjetas') > sec.indexOf('texto'), `en una lista el texto va primero: ${JSON.stringify(sec)}`);
ok(!sec.includes('tarjeta-grande'), `una lista no lleva tarjeta grande: ${JSON.stringify(sec)}`);

// ── 3. Tras el siguiente mensaje el chat vuelve a bajar al final ─────────
await preguntar(PROD.nombre.split('|')[0].trim());
await preguntar('gracias');
const abajo = await pg.evaluate(() => { const b = document.getElementById('tmBotBody'); return b.scrollHeight - b.scrollTop - b.clientHeight; });
ok(abajo < 40, `con el mensaje siguiente el chat baja al final (faltan ${Math.round(abajo)}px)`);

await navegador.close(); servidor.close();
if (fallos.length) { console.error(`❌ ${fallos.length} comprobación(es) fallida(s):\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Max enseña la foto primero y los datos debajo.');
