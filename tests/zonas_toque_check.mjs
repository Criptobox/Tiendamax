/* Zonas de toque de la portada: los botones pequeños (iconos de la cabecera, ♥ de las tarjetas,
 * flechas y puntos de los carruseles, «Buscar», el chat de Max) tienen alrededor un área tocable
 * de 44 px sin cambiar su aspecto. Se mide con elementFromPoint: un toque a ~21 px del centro
 * (donde un botón de 30 px ya no llega) tiene que caer en el propio botón. */
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
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(`http://localhost:${servidor.address().port}/`);
await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0, null, { timeout: 20000 });
await pg.waitForTimeout(2500);
const SEL = ['#heartHeaderBtn', '#notifHeaderBtn', '.header-theme-btn', '.hsb-buscar-pill', '.btn-megusta', '#mvPrev', '.hero-banner-prev'];
for (const s of SEL) {
  const r = await pg.evaluate(async s => {
    const e = document.querySelector(s); if (!e) return { falta: true };
    e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 150));
    const b = e.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const dentro = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
    const alto = Math.max(b.height, 44);
    return { h: Math.round(b.height), arriba: dentro(cx, cy - 21), abajo: dentro(cx, cy + 21), alto };
  }, s);
  if (r.falta) { fallos.push(`no se encontró ${s}`); continue; }
  ok(r.arriba && r.abajo, `${s}: un toque 21 px arriba/abajo del centro no cae en el botón (mide ${r.h}px): ${JSON.stringify(r)}`);
}
// sin cambiar el aspecto: el botón sigue midiendo lo mismo (el área extra es invisible)
const medidas = await pg.evaluate(() => ['#heartHeaderBtn', '.btn-megusta'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)));
ok(medidas[0] <= 34 && medidas[1] <= 34, `el botón no se agrandó a la vista: ${medidas}`);
ok(errs.length === 0, 'errores de página: ' + JSON.stringify(errs));
await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Los botones pequeños tienen zona de toque de 44 px.');
