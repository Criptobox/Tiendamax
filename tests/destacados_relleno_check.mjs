/* «Productos Destacados» no puede quedarse en una tarjeta.
 *
 * Los destacados los marca el gestor a mano (masVendido) y hoy solo hay uno
 * con stock: la sección, que es lo segundo que ve el cliente en la portada,
 * enseñaba UNA tarjeta suelta. Con menos de 4 marcados se completa hasta 6 con
 * lo que se puede comprar (primero lo rebajado), y lo marcado a mano va delante.
 * Se prueba contra el catálogo real, que es donde pasó.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); } catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    try { const b = await readFile(normalize(join(RAIZ, decodeURIComponent(p)))); r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
for (const h of ['googleapis.com','gstatic.com','firebaseio.com','google-analytics.com','raw.githubusercontent.com','api.github.com'])
    await ctx.route(u => u.hostname.includes(h), r => r.abort());
const pagina = await ctx.newPage();
const errores = []; pagina.on('pageerror', e => errores.push(String(e).slice(0, 160)));
await pagina.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pagina.waitForTimeout(4500);
const r = await pagina.evaluate(() => {
    const grid = document.getElementById('masVendidosGrid');
    const tarjetas = [...grid.querySelectorAll('.producto-card')];
    const manual = productos.filter(p => (p.masVendido === true || p.masVendido === 'true') && p.stock > 0).length;
    return { n: tarjetas.length, manual, nombres: tarjetas.map(t => (t.querySelector('h3,.producto-nombre,.pv2-nombre') || t).textContent.trim().slice(0, 30)) };
});
const catalogo = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const hay = catalogo.filter(p => Number(p.stock) > 0).length;
ok(r.n >= Math.min(4, hay), `Destacados enseña ${r.n} tarjeta(s) con ${hay} productos a la venta: ${JSON.stringify(r.nombres)}`);
ok(r.n <= Math.max(6, r.manual), `Destacados se pasó de seis: ${r.n}`);
ok(r.manual === 0 || r.n >= r.manual, 'los marcados a mano tienen que salir todos');
ok(errores.length === 0, 'errores de JS: ' + errores.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('❌ destacados:\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ destacados: nunca una tarjeta suelta');
