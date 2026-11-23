/* Tarjetas de categoría de la portada: de más a menos disponibles.
 * Con tope de 4 en el móvil, una categoría con muchos productos que se creó
 * después (LUBRICANTES, 8) quedaba al final detrás de «Ver más». */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }
const LITE = JSON.parse(readFileSync(join(RAIZ, 'productos-lite.json'), 'utf8'));
const CATS = JSON.parse(readFileSync(join(RAIZ, 'categorias.json'), 'utf8')); delete CATS.apagadas;
// Catálogo de prueba: la categoría con más disponibles es la ÚLTIMA de la lista.
const mk = (cat, n, base) => Array.from({ length: n }, (_, i) => ({ ...LITE.find(p => Number(p.stock) > 0), id: base + i, nombre: `${cat} prueba ${i}`, categoria: cat, stock: 5, subcategoria: '' }));
const PRODS = [...mk('ENERGIA', 4, 9100), ...mk('UTILES', 3, 9200), ...mk('CARROS', 5, 9300), ...mk('HOGAR', 3, 9400), ...mk('CELULARES', 3, 9500), ...mk('LUBRICANTES', 11, 9600)];
const CATS2 = { ...CATS, categorias: ['ENERGIA', 'UTILES', 'CARROS', 'HOGAR', 'CELULARES', 'LUBRICANTES'] };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const servidor = createServer(async (q, r) => {
  const c = decodeURIComponent(q.url.split('?')[0]);
  if (c === '/productos-lite.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(PRODS)); return; }
  if (c === '/categorias.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(CATS2)); return; }
  try { const ruta = c === '/' ? '/index.html' : c; r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(await readFile(normalize(join(RAIZ, ruta)))); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(`http://localhost:${servidor.address().port}/`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.some(p => p.categoria === 'LUBRICANTES'), null, { timeout: 15000 });
await pg.waitForTimeout(1500);
const tarjetas = await pg.evaluate(() => [...document.querySelectorAll('#categorias-home .categoria-card')]
  .filter(c => c.offsetParent !== null && !/Todos/.test(c.innerText))
  .map(c => ({ n: (c.querySelector('.cat-name') || {}).textContent, c: parseInt((c.querySelector('.cat-count') || {}).textContent, 10) })));
ok(tarjetas.length >= 2, 'hay tarjetas visibles: ' + JSON.stringify(tarjetas));
ok(tarjetas[0] && tarjetas[0].n === 'LUBRICANTES', `la categoría con más disponibles va primero: ${JSON.stringify(tarjetas)}`);
const cuentas = tarjetas.map(t => t.c);
ok(cuentas.every((x, i) => i === 0 || cuentas[i - 1] >= x), 'de más a menos disponibles: ' + cuentas.join());
ok(errs.length === 0, 'errores de página: ' + JSON.stringify(errs));
await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Las categorías con más productos van primero.');
