/* vale.html → «Elegir del catálogo»: poder encontrar y contar productos sin perderse.
 *  · el buscador ignora tildes/mayúsculas y las palabras valen en cualquier orden;
 *  · cada fila trae foto, nombre completo y cuántas hay;
 *  · − / + cambian la cantidad SIN subir la lista al inicio ni cerrar la hoja;
 *  · no deja pasar del stock;
 *  · subcategorías al elegir una categoría; pie fijo con lo que llevas y el total. */
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
  try { const c = await readFile(ruta); r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(c); } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const pg = await ctx.newPage();
const errores = []; pg.on('pageerror', e => errores.push(String(e).slice(0, 200)));
await pg.goto(`http://localhost:${srv.address().port}/vale.html`);
await pg.evaluate(() => {
  const P = [];
  for (let i = 0; i < 30; i++) P.push({ id: 'e' + i, nombre: 'Cable de red ' + i, categoria: 'WIFI', subcategoria: i % 2 ? 'CABLES' : 'ANTENAS', precioActual: 5, stock: 20 });
  P.push({ id: 'inv', nombre: 'Inversor Tataliken 3000W', categoria: 'ENERGIA', subcategoria: 'INVERSORES', precioActual: 100, stock: 2, imagen: 'x.webp' });
  P.push({ id: 'ace', nombre: 'Aceite Mannol 5W-30 Energía', categoria: 'LUBRICANTES', subcategoria: 'ACEITES', precioActual: 20, stock: 9 });
  _catProductos = P; _catCategoria = ''; _catSub = '';
  document.getElementById('modalCatalogo').classList.add('open'); renderCatChips(); renderCatalogo();
});
const txt = () => pg.evaluate(() => document.getElementById('catLista').innerText);
const buscar = async q => { await pg.fill('#catBuscar', q); await pg.waitForTimeout(50); return txt(); };

// Búsqueda sin tildes, en cualquier orden de palabras, y también por subcategoría
ok(/Aceite Mannol/.test(await buscar('energia aceite')) , 'las palabras valen en cualquier orden y entre nombre y categoría');
ok(/Inversor Tataliken/.test(await buscar('3000w tataliken')), '«3000w tataliken» (orden invertido) encuentra el inversor');
ok(/Aceite Mannol/.test(await buscar('ACEITÉS')) && /Aceite Mannol/.test(await buscar('aceites')), 'busca en la subcategoría, sin tildes ni mayúsculas');
ok(/Ningún producto/.test(await buscar('zzzz')), 'sin resultados lo dice');
await buscar('');

// Subcategorías al elegir categoría
await pg.evaluate(() => setCatCategoria('WIFI'));
ok(await pg.evaluate(() => getComputedStyle(document.getElementById('catSubChips')).display !== 'none' && document.querySelectorAll('#catSubChips .chip').length === 3), 'WIFI muestra «Todas» + 2 subcategorías');
await pg.evaluate(() => setCatSub('CABLES'));
ok(await pg.evaluate(() => document.querySelectorAll('#catLista .hist-item').length === 15), 'la subcategoría filtra (15 cables)');
await pg.evaluate(() => { setCatCategoria(''); });

// Foto y nombre completo
await buscar('inversor');
ok(await pg.evaluate(() => !!document.querySelector('#catLista .hist-item img')), 'la fila lleva foto');
ok(/2 disp/.test(await txt()), 'dice cuántas hay');

// + / − sin saltar y sin cerrar
await buscar('');
await pg.evaluate(() => { document.getElementById('catLista').scrollTop = 400; });
const antes = await pg.evaluate(() => document.getElementById('catLista').scrollTop);
await pg.evaluate(() => catMas('e10')); await pg.evaluate(() => catMas('e10'));
ok(await pg.evaluate(() => _catQty('e10') === 2), 'dos «+» llevan 2');
const despues = await pg.evaluate(() => document.getElementById('catLista').scrollTop);
ok(Math.abs(despues - antes) < 5 && antes > 100, `la lista no salta al inicio (${antes} → ${despues})`);
ok(await pg.evaluate(() => document.getElementById('modalCatalogo').classList.contains('open')), 'la hoja sigue abierta');
ok(/2x Cable de red 10/.test(await pg.evaluate(() => document.getElementById('vArticulo').value)), 'el vale lleva la línea');
await pg.evaluate(() => catMenos('e10'));
ok(await pg.evaluate(() => _catQty('e10') === 1 && /1x Cable de red 10/.test(document.getElementById('vArticulo').value)), '«−» baja a 1');
await pg.evaluate(() => catMenos('e10'));
ok(await pg.evaluate(() => _catQty('e10') === 0 && !/Cable de red 10/.test(document.getElementById('vArticulo').value) && Number(document.getElementById('vUSD').value || 0) === 0), 'a 0 la línea sale y el total vuelve a 0');

// Tope de stock
await pg.evaluate(() => { catMas('inv'); catMas('inv'); catMas('inv'); });
ok(await pg.evaluate(() => _catQty('inv') === 2), 'no pasa del stock (2)');

// Pie
await pg.evaluate(() => catMas('ace'));
const pie = await pg.evaluate(() => { const e = document.getElementById('catPie'); return { v: getComputedStyle(e).display !== 'none', t: e.innerText }; });
ok(pie.v && /3 productos/.test(pie.t) && /220\.00/.test(pie.t), 'el pie dice 3 productos y $220.00: ' + JSON.stringify(pie));
ok(errores.length === 0, 'errores de página: ' + JSON.stringify(errores));
await nav.close(); srv.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ El catálogo del vale se busca, se cuenta y no se pierde.');
