/* Smoke test E2E: tienda y admin cargan sin errores de página.
   Corre en CI (smoke-web.yml) con Playwright + servidor estático local.
   Falla si: error JS de página, sin tarjetas de producto, overflow horizontal,
   o si el login stub del admin no deja el panel usable. */
import { chromium, devices } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.jpg':'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path.slice(1));
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(8977, r));

const browser = await chromium.launch();
let fallos = 0;
const fallo = (msg) => { console.error('❌ ' + msg); fallos++; };

// ── TIENDA (móvil) ──
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8977/index.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000);
  const st = await page.evaluate(() => ({
    cards: document.querySelectorAll('.producto-card').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  if (st.cards < 1) fallo('tienda: sin tarjetas de producto');
  if (st.overflow > 2) fallo('tienda: overflow horizontal de ' + st.overflow + 'px');
  // errores de red local (JSON faltantes en sandbox) no cuentan
  const graves = errs.filter(e => !/Unexpected token '<'|Failed to fetch|NetworkError|Load failed/.test(e));
  if (graves.length) fallo('tienda: errores de página → ' + graves.join(' | '));
  console.log('✓ tienda:', JSON.stringify(st), '· errores graves:', graves.length);
  await ctx.close();
}

// ── ADMIN (login stub = flujo real de clases) ──
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto('http://localhost:8977/admin.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { usuarioAutenticado = true; cerrarLoginModal(); abrirAdminPanel(); });
  await page.waitForTimeout(1500);
  const views = await page.evaluate(() => [...document.querySelectorAll('.side-btn[data-view]')].map(b => b.dataset.view));
  for (const v of views) { await page.evaluate(v => go(v), v); await page.waitForTimeout(120); }
  const st = await page.evaluate(() => ({
    views: document.querySelectorAll('.view').length,
    scrollable: document.documentElement.scrollHeight >= document.documentElement.clientHeight,
    panelVisible: !!document.querySelector('#adminPanel.visible'),
    bodyOverflowHidden: getComputedStyle(document.body).overflow === 'hidden',
  }));
  if (!st.panelVisible) fallo('admin: panel no visible tras login');
  if (st.bodyOverflowHidden) fallo('admin: body con overflow hidden (bug de scroll)');
  const graves = errs.filter(e => !/Unexpected token '<'|Failed to fetch|NetworkError|Load failed/.test(e));
  if (graves.length) fallo('admin: errores de página → ' + graves.join(' | '));
  console.log('✓ admin:', JSON.stringify({ ...st, viewsRecorridas: views.length }), '· errores graves:', graves.length);
  await ctx.close();
}

await browser.close();
server.close();
if (fallos) { console.error(fallos + ' fallo(s)'); process.exit(1); }
console.log('✅ smoke OK');
