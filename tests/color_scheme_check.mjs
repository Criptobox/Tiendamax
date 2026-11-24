/* color-scheme: los controles nativos y las barras de desplazamiento siguen el modo de la tienda
 * (oscuro por defecto; claro con body.light-mode o mientras carga con html.tm-pre-light). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const servidor = createServer(async (q, r) => {
  const c = decodeURIComponent(q.url.split('?')[0]);
  try { const ruta = c === '/' ? '/index.html' : c; r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(await readFile(normalize(join(RAIZ, ruta)))); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const pg = await ctx.newPage();
await pg.goto(`http://localhost:${servidor.address().port}/`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0, null, { timeout: 20000 });
const cs = () => pg.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const fallos = [];
await pg.evaluate(() => document.body.classList.remove('light-mode'));
const oscuro = await cs();
await pg.evaluate(() => document.body.classList.add('light-mode'));
const claro = await cs();
await pg.evaluate(() => { document.body.classList.remove('light-mode'); document.documentElement.classList.add('tm-pre-light'); });
const precarga = await cs();
if (oscuro !== 'dark') fallos.push(`en oscuro debe ser dark: ${oscuro}`);
if (claro !== 'light') fallos.push(`con body.light-mode debe ser light: ${claro}`);
if (precarga !== 'light') fallos.push(`con html.tm-pre-light debe ser light: ${precarga}`);
await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ color-scheme sigue al modo de la tienda.');
