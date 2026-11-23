/* vale.html → «Elegir del catálogo»: la fila de categorías no se aplasta.
 * La hoja es una columna flex con altura máxima; el buscador y las categorías
 * (overflow-x:auto → mínimo 0) se encogían hasta quedar en rayitas y tapaban
 * las categorías al llenar el vale. Se mide en pantallas de teléfono pequeñas. */
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer(async (q, r) => {
  const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
  try { r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(await readFile(ruta)); } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const fallos = [];
const nav = await chromium.launch();
for (const [w, h] of [[360, 640], [320, 568]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${srv.address().port}/vale.html`);
  await pg.evaluate(() => {
    _catProductos = Array.from({ length: 40 }, (_, i) => ({ id: i, nombre: 'Producto ' + i, categoria: ['ENERGIA', 'WIFI', 'CARROS', 'MOTOS', 'AUDIO', 'SEGURIDAD'][i % 6], precioActual: 10 }));
    document.getElementById('modalCatalogo').classList.add('open'); renderCatChips(); renderCatalogo();
  });
  await pg.waitForTimeout(900);
  const m = await pg.evaluate(() => {
    const g = i => document.getElementById(i).getBoundingClientRect().height;
    const chip = document.querySelector('#catChips .chip').getBoundingClientRect();
    return { buscar: g('catBuscar'), chips: g('catChips'), lista: g('catLista'), chipAlto: chip.height };
  });
  const t = `${w}×${h}: ${JSON.stringify(m)}`;
  if (m.buscar < 36) fallos.push('el buscador se aplastó — ' + t);
  if (m.chips < 26 || m.chipAlto < 22) fallos.push('las categorías se aplastaron — ' + t);
  if (m.lista < 120) fallos.push('la lista de productos casi no se ve — ' + t);
  await ctx.close();
}
await nav.close(); srv.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ El selector de catálogo del vale conserva su buscador y sus categorías.');
