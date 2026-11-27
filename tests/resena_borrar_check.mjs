/* Borrar una reseña desde el panel (Clientes → Reviews).
 *
 * Una reseña no se podía quitar nunca: la regla de Firebase la dejaba CREAR a cualquiera y
 * NO tocar después (`!data.exists()`), y el panel no tenía botón. Ahora:
 *  · cada reseña lleva «🗑️ Borrar», con confirmación que nombra a quién es;
 *  · el borrado va FIRMADO (TMAuth.fetchPrivado, método DELETE) a /resenas/<producto>/<clave>;
 *  · cancelar la confirmación no borra nada;
 *  · si Firebase lo rechaza, lo dice y la reseña sigue;
 *  · tras borrar se lanza la sincronización de la caché (workflow sync-resenas);
 *  · la regla: el dueño puede borrar, un desconocido NO (y crear sigue sin cuenta).
 */
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
catch (e) { try { ({ chromium } = requerir('playwright')); } catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = createServer(async (q, r) => {
  const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
  try { const c = await readFile(ruta); r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(c); } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = srv.address().port;
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };

// ── La regla ─────────────────────────────────────────────────────────────
const R = JSON.parse(readFileSync(join(RAIZ, 'firebase-rules.json'), 'utf8')).rules.resenas;
ok(/auth != null/.test(R['$productoId']['.write'] || '') && /admin_uid/.test(R['$productoId']['.write'] || ''), 'el dueño (uid) puede borrar bajo /resenas/<producto>: ' + R['$productoId']['.write']);
ok(R['$productoId']['$resenaId']['.write'] === '!data.exists()', 'un desconocido sigue pudiendo CREAR pero no pisar ni borrar una reseña');
ok(!/auth/.test(R['$productoId']['$resenaId']['.write'] + R['$productoId']['$resenaId']['.validate']), 'crear una reseña sigue sin pedir cuenta');
ok(R['.write'] === false, 'nadie escribe /resenas entero');

// ── El panel ─────────────────────────────────────────────────────────────
const RESENAS = { '1777924118004': {
  '1795000000001': { autor: 'Ariel', texto: 'Funciona perfecto y llegó rápido', estrellas: 4, fecha: '26 nov', ts: 1795000000001 },
  '1795000000002': { autor: 'Lucía', texto: 'Muy buena atención de principio a fin', estrellas: 5, fecha: '26 nov', ts: 1795000000002 } } };
const nav = await chromium.launch();
async function panel() {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  let datos = JSON.parse(JSON.stringify(RESENAS));
  await ctx.route(u => u.hostname.includes('firebaseio.com'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datos) }));
  const DISPAROS = [];
  await ctx.route(u => u.hostname === 'api.github.com', r => { DISPAROS.push(r.request().url()); return r.fulfill({ status: 204, body: '' }); });
  for (const h of ['googleapis.com', 'gstatic.com', 'google-analytics.com', 'raw.githubusercontent.com']) await ctx.route(u => u.hostname.includes(h), r => r.abort());
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('_i')) return; sessionStorage.setItem('_i', '1');
    localStorage.setItem('firebaseConfig', JSON.stringify({ databaseURL: 'https://prueba-default-rtdb.firebaseio.com', projectId: 'prueba' }));
    localStorage.setItem('githubUser', 'u'); localStorage.setItem('githubRepo', 'r'); localStorage.setItem('githubToken', 'tk');
    window.__confirmar = true; window.confirm = (m) => { window.__pregunta = m; return window.__confirmar; };
  });
  const pg = await ctx.newPage();
  const errores = []; pg.on('pageerror', e => errores.push(String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { document.getElementById('adminPanel')?.classList.remove('hidden'); document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none'); go('clientes'); cliSwitch('reviews'); });
  await pg.waitForFunction(() => document.querySelectorAll('#cli-lista .rev-card').length > 0, null, { timeout: 15000 });
  return { ctx, pg, errores, DISPAROS, quitar: k => { delete datos['1777924118004'][k]; } };
}
{
  const { ctx, pg, errores, DISPAROS, quitar } = await panel();
  ok(await pg.evaluate(() => document.querySelectorAll('#cli-lista .rev-card button').length === 2), 'cada reseña lleva su botón «Borrar»');
  // Firma: se sustituye fetchPrivado para ver qué pide, como respondería Firebase.
  await pg.evaluate(() => { window.__llamadas = []; window.__resp = { ok: true, dato: null };
    window.TMAuth = { fetchPrivado: async (p, o) => { window.__llamadas.push({ p, m: (o || {}).method }); return window.__resp; } }; });
  const nombreDe = () => pg.evaluate(() => [...document.querySelectorAll('#cli-lista .rev-name')].map(e => e.textContent));

  // 1) Cancelar la confirmación no borra.
  await pg.evaluate(() => { window.__confirmar = false; });
  await pg.evaluate(() => document.querySelector('#cli-lista .rev-card button').click());
  await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => window.__llamadas.filter(x => x.m === 'DELETE').length === 0), 'cancelar la confirmación no manda ningún borrado');
  ok(/Ariel|Lucía/.test(await pg.evaluate(() => window.__pregunta)) && /No se puede deshacer/.test(await pg.evaluate(() => window.__pregunta)), 'la confirmación nombra a la persona y avisa que no se deshace: ' + await pg.evaluate(() => window.__pregunta));

  // 2) Firebase rechaza: lo dice y la reseña sigue.
  await pg.evaluate(() => { window.__confirmar = true; window.__resp = { ok: false, estado: 403, msg: 'x' }; });
  await pg.evaluate(() => document.querySelector('#cli-lista .rev-card button').click());
  await pg.waitForTimeout(300);
  ok((await nombreDe()).length === 2, 'si Firebase lo rechaza, la reseña sigue en la lista');
  ok(/reglas/i.test(await pg.evaluate(() => document.getElementById('toast-b').textContent)), 'dice que hay que publicar las reglas: ' + await pg.evaluate(() => document.getElementById('toast-b').textContent));
  ok(await pg.evaluate(() => !document.querySelector('#cli-lista .rev-card button').disabled), 'el botón vuelve a estar activo tras el fallo');

  // 3) Borra de verdad: DELETE firmado a la clave exacta, y la caché se sincroniza.
  const primera = await pg.evaluate(() => document.querySelector('#cli-lista .rev-card').getAttribute('data-k'));
  quitar(primera);
  await pg.evaluate(() => { window.__resp = { ok: true, dato: null }; window.__llamadas = []; });
  await pg.evaluate(() => document.querySelector('#cli-lista .rev-card button').click());
  await pg.waitForTimeout(900);
  const ll = (await pg.evaluate(() => window.__llamadas)).filter(x => x.m === 'DELETE');
  ok(ll.length === 1 && ll[0].m === 'DELETE' && ll[0].p === '/resenas/1777924118004/' + primera + '.json', 'DELETE firmado a /resenas/<producto>/<clave>: ' + JSON.stringify(ll));
  ok((await nombreDe()).length === 1, 'tras borrar, la lista se repinta sin esa reseña');
  ok(DISPAROS.some(u => /workflows\/sync-resenas\.yml\/dispatches/.test(u)), 'lanza la sincronización de la caché de reseñas: ' + DISPAROS.join(' '));
  ok(errores.length === 0, 'errores de página: ' + JSON.stringify(errores));
  await ctx.close();
}
await nav.close(); srv.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Borrar una reseña: firmado, con confirmación, y la regla deja solo al dueño.');
