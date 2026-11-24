/* Selección de categoría y subcategoría.
 *  · Tienda: las subcategorías van en UNA fila que se desliza (con 9 ocupaban media pantalla),
 *    cada una con lo que hay disponible, y la categoría elegida queda a la vista en la tira.
 *  · Admin: los <select> de categoría/subcategoría se manejan con botones (color + cantidad),
 *    sin dejar de ser la fuente de verdad: elegir un botón cambia el select y dispara su onchange,
 *    y un cambio hecho por el código (abrir un producto) se refleja en los botones. */
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
const CATS = JSON.parse(await readFile(join(RAIZ, 'categorias.json'), 'utf8')); delete CATS.apagadas;
const servidor = createServer(async (q, r) => {
  const c = decodeURIComponent(q.url.split('?')[0]);
  if (c === '/categorias.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(CATS)); return; }
  try { const ruta = c === '/' ? '/index.html' : c; r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(await readFile(normalize(join(RAIZ, ruta)))); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const BASE = `http://localhost:${servidor.address().port}`;
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());

// ── Tienda ──
{
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0 && typeof subcategorias !== 'undefined' && (subcategorias.LUBRICANTES || []).length > 4, null, { timeout: 20000 });
  await pg.evaluate(() => mostrarVistaCategoria('LUBRICANTES'));
  await pg.waitForTimeout(1500);
  const t = await pg.evaluate(() => {
    const w = document.getElementById('subcategoriaTabs'); const tabs = [...w.querySelectorAll('.subcategoria-tab')];
    const tops = tabs.map(x => x.getBoundingClientRect().top);
    return { n: tabs.length, filas: (Math.max(...tops) - Math.min(...tops)) < 8 ? 1 : 2, alto: w.getBoundingClientRect().height, desliza: w.scrollWidth > w.clientWidth,
             conNumero: tabs.every(x => x.querySelector('.tab-n')), todos: tabs[0].querySelector('.tab-n').textContent };
  });
  ok(t.n >= 6 && t.filas === 1, `las subcategorías van en UNA fila: ${JSON.stringify(t)}`);
  ok(t.alto < 80, `y ocupan poco alto (${t.alto}px)`);
  ok(t.desliza && t.conNumero, 'se deslizan y cada una dice cuántos hay');
  const disp = await pg.evaluate(() => productos.filter(p => p.categoria === 'LUBRICANTES' && Number(p.stock) > 0).length);
  ok(Number(t.todos) === disp, `«Todos» cuenta los disponibles (${t.todos} vs ${disp})`);
  // elegir una del final deja la pestaña a la vista
  const vis = await pg.evaluate(() => {
    const w = document.getElementById('subcategoriaTabs'); const tabs = [...w.querySelectorAll('.subcategoria-tab')];
    tabs[tabs.length - 1].click();
    const a = document.querySelector('#subcategoriaTabs .subcategoria-tab.active'); const w2 = document.getElementById('subcategoriaTabs');
    const r = a.getBoundingClientRect(), rw = w2.getBoundingClientRect();
    return r.left >= rw.left - 2 && r.right <= rw.right + 2;
  });
  ok(vis, 'la pestaña elegida queda a la vista aunque esté al final');
  const pill = await pg.evaluate(() => { const w = document.getElementById('categoriaFiltro'); const a = w.querySelector('.categoria-btn.active'); if (!a) return null; const r = a.getBoundingClientRect(), rw = w.getBoundingClientRect(); return { dentro: r.left >= rw.left - 2 && r.right <= rw.right + 2 }; });
  await pg.waitForTimeout(800);
  const pill2 = await pg.evaluate(() => { const w = document.getElementById('categoriaFiltro'); const a = w.querySelector('.categoria-btn.active'); const r = a.getBoundingClientRect(), rw = w.getBoundingClientRect(); return r.left >= rw.left - 2 && r.right <= rw.right + 2; });
  ok(pill2, 'la categoría activa queda entera dentro de la tira (no cortada por el borde)');
  ok(errs.length === 0, 'errores de página (tienda): ' + JSON.stringify(errs));
  await pg.close();
}

// ── Admin ──
{
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => { if (!/catColControl/.test(String(e))) errs.push(String(e).slice(0, 160)); });
  await pg.goto(BASE + '/admin.html');
  await pg.waitForFunction(() => typeof window.chipPickersIniciar === 'function' && document.querySelectorAll('#productCategory option').length > 5, null, { timeout: 30000 });
  await pg.evaluate(() => { const m = document.getElementById('loginModal'); if (m) m.classList.add('hidden'); const a = document.getElementById('adminPanel'); if (a) a.classList.remove('hidden'); document.querySelector('.side-btn[data-view="agregar"]').click(); });
  await pg.waitForTimeout(800);
  const r = await pg.evaluate(async () => {
    const sel = document.getElementById('productCategory'), box = sel.nextElementSibling;
    const opciones = [...sel.options].filter(o => o.value).length;
    const chips = box.querySelectorAll('.chip-sel').length;
    const lub = [...box.querySelectorAll('.chip-sel')].find(c => /LUBRIC/.test(c.textContent));
    lub.click(); await new Promise(r => setTimeout(r, 100));
    const sub = document.getElementById('productSubcategory');
    const subChips = sub.nextElementSibling.querySelectorAll('.chip-sel').length;
    const subOpts = sub.options.length;
    const marcado = sel.nextElementSibling.querySelector('.chip-sel.on');
    // cambio hecho por el código → se refleja
    sel.value = 'WIFI'; await new Promise(r => setTimeout(r, 50));
    const tras = sel.nextElementSibling.querySelector('.chip-sel.on');
    const dot = box.querySelector('.chip-dot') && box.querySelector('.chip-dot').style.background;
    return { opciones, chips, valor: (lub ? 'LUBRICANTES' : ''), seleccionado: marcado && marcado.textContent, subChips, subOpts, trasCodigo: tras && tras.textContent, dot, oculto: getComputedStyle(sel).opacity };
  });
  ok(r.opciones > 5 && r.chips === r.opciones, `un botón por categoría: ${JSON.stringify(r)}`);
  ok(/LUBRICANTES/.test(r.seleccionado || ''), 'tocar un botón elige esa categoría (su onchange rellena las subcategorías)');
  ok(r.subChips === r.subOpts && r.subChips > 2, `y salen sus subcategorías como botones (+ «Sin subcategoría»): ${r.subChips}/${r.subOpts}`);
  ok(/WIFI/.test(r.trasCodigo || ''), 'un cambio hecho por el código se refleja en los botones');
  ok(!!r.dot, 'cada categoría lleva su color');
  ok(r.oculto === '0', 'el select original sigue ahí, oculto');
  ok(errs.length === 0, 'errores de página (admin): ' + JSON.stringify(errs));
  await pg.close();
}
await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Selección de categoría y subcategoría: tienda y admin.');
