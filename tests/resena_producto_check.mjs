/* Reseñas de la portada: el producto reseñado sale con su foto pequeña.
 *  · producto en el catálogo (por id, o por nombre si la reseña no trae id) → botón con
 *    miniatura 40×40 y nombre, que abre su ficha;
 *  · producto que ya no está a la venta aquí (apagado o borrado) → solo texto, sin enlace;
 *  · agotado conserva foto y enlace; el toque mide ≥ 44 px; sin desbordar a 320 px. */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const LITE = JSON.parse(readFileSync(join(RAIZ, 'productos-lite.json'), 'utf8'));
const CATS = JSON.parse(readFileSync(join(RAIZ, 'categorias.json'), 'utf8')); delete CATS.apagadas;
const A = LITE.find(p => Number(p.stock) > 0 && p.imagen && !p.digital);
const B = LITE.find(p => p !== A && Number(p.stock) > 0 && p.imagen && !p.digital);
const servidor = createServer(async (q, r) => {
  const c = decodeURIComponent(q.url.split('?')[0]);
  if (c === '/categorias.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(CATS)); return; }
  try { const ruta = c === '/' ? '/index.html' : c; const b = await readFile(normalize(join(RAIZ, ruta))); r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(b); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 320, height: 700 }, serviceWorkers: 'block' });
await ctx.route(u => !['localhost'].includes(u.hostname), r => r.abort());
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(`http://localhost:${servidor.address().port}/`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0 && typeof _renderTestimoniosPage === 'function', null, { timeout: 15000 });
await pg.evaluate(([a, b]) => {
  window.__abierto = null; window.abrirDetalleProducto = id => { window.__abierto = String(id); };
  const base = { autor: 'Ana', estrellas: 5, fecha: '23 nov 2026', texto: 'Muy buen producto, lo recomiendo mucho.' };
  _tmAllResenas = [
    { ...base, id: 1, productoId: a.id, productoNombre: a.nombre },
    { ...base, id: 2, productoNombre: b.nombre },                       // sin id: por nombre
    { ...base, id: 3, productoId: 'ya-no-existe', productoNombre: 'Cosa que ya no se vende' },
  ];
  _renderTestimoniosPage(4);
}, [A, B]);
const info = await pg.evaluate(() => [...document.querySelectorAll('#testimoniosGrid .testimonio-card')].map(c => {
  const b = c.querySelector('.resena-prod'), t = c.querySelector('.resena-prod-txt');
  const i = b && b.querySelector('img');
  return { boton: !!b, texto: !!t, img: !!i, w: i ? i.getAttribute('width') : null, lazy: i ? i.loading : null, alto: b ? b.getBoundingClientRect().height : 0,
           desborda: b ? b.getBoundingClientRect().right > document.documentElement.clientWidth : false };
}));
ok(info[0].boton && info[0].img && info[0].w === '40' && info[0].lazy === 'lazy', 'producto del catálogo: botón con miniatura 40 px lazy: ' + JSON.stringify(info[0]));
ok(info[0].alto >= 44, 'el toque mide al menos 44 px: ' + info[0].alto);
ok(!info[0].desborda, 'no se sale de la pantalla a 320 px');
ok(info[1].boton && info[1].img, 'sin productoId se encuentra por nombre: ' + JSON.stringify(info[1]));
ok(info[2].texto && !info[2].boton, 'producto que ya no está: solo texto, sin botón: ' + JSON.stringify(info[2]));
await pg.click('#testimoniosGrid .testimonio-card:first-child .resena-prod');
ok(await pg.evaluate(() => window.__abierto) === String(A.id), 'tocar la miniatura abre la ficha de ese producto');
ok(errs.length === 0, 'errores de página: ' + JSON.stringify(errs));
await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Las reseñas muestran el producto con su foto pequeña.');
