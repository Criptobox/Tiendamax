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

  // ── Regresión: marcar varios agotados en bloque debe registrar el cambio
  // para publicar (bug real: apBulkZero no llamaba a marcarProductoModificado
  // y el agotado revertía al publicar — ver PR #53). ──
  await page.evaluate(() => window.switchTab && window.switchTab('productos'));
  await page.waitForTimeout(400);
  const bulkOk = await page.evaluate(() => {
    const ps = (window.productos || []).filter(p => p.stock > 0).slice(0, 2);
    if (ps.length < 2) return { skip: true };
    localStorage.removeItem('productosModificados');
    ps.forEach(p => window.apSelTgl(String(p.id)));
    window.apBulkZero();
    const mods = JSON.parse(localStorage.getItem('productosModificados') || '[]').map(String);
    const allMarked = ps.every(p => mods.includes(String(p.id)));
    const allZero = ps.every(p => { const f = (window.productos || []).find(x => String(x.id) === String(p.id)); return f && f.stock === 0; });
    return { allMarked, allZero };
  });
  if (!bulkOk.skip && (!bulkOk.allMarked || !bulkOk.allZero)) fallo('admin: bulk agotado no marca modificado → ' + JSON.stringify(bulkOk));

  // ── Regresión: el modal de editar producto debe quedar SIEMPRE por encima
  // del panel del Copiloto IA (bug real: copiloto z-index:99999 > pmodal
  // z-index:200 lo tapaba entero — ver PR #54). ──
  const zOk = await page.evaluate(() => {
    const pmodal = getComputedStyle(document.querySelector('.pmodal') || document.body).zIndex;
    const copBubble = document.querySelector('.tm-copilot-bubble, .tm-copilot-sheet');
    const copZ = copBubble ? getComputedStyle(copBubble).zIndex : '0';
    return { pmodalZ: Number(pmodal) || 0, copZ: Number(copZ) || 0 };
  });
  if (zOk.pmodalZ <= zOk.copZ) fallo('admin: .pmodal (' + zOk.pmodalZ + ') no está por encima del copiloto (' + zOk.copZ + ')');

  // ── Regresión: editar nombre/foto de un producto debe guardar Y marcar
  // el producto como modificado (bug real: apEditSave/apStock/apFav/
  // almProductoToggle/_ofertasFinAutoRevertir no marcaban — ver PR #51/#53). ──
  const editOk = await page.evaluate(() => {
    const p = (window.productos || [])[0];
    if (!p) return { skip: true };
    window.apEdit(String(p.id));
    localStorage.removeItem('productosModificados');
    const nombreInput = document.getElementById('pedit-nombre');
    nombreInput.value = 'TEST REGRESION ' + Date.now();
    nombreInput.dispatchEvent(new Event('input', { bubbles: true }));
    window.apEditSave();
    const mods = JSON.parse(localStorage.getItem('productosModificados') || '[]').map(String);
    return { marked: mods.includes(String(p.id)), modalClosed: !document.getElementById('pedit-modal').classList.contains('show') };
  });
  if (!editOk.skip && (!editOk.marked || !editOk.modalClosed)) fallo('admin: guardar edición no marca modificado o no cierra → ' + JSON.stringify(editOk));

  await ctx.close();
}

await browser.close();
server.close();
if (fallos) { console.error(fallos + ' fallo(s)'); process.exit(1); }
console.log('✅ smoke OK');
