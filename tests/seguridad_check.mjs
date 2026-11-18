/* Seguridad del panel — lo que una lectura del código no ve.
 *
 * El PAT de GitHub vive en el localStorage de tiendamax.org: cualquier marcado
 * ajeno que el panel pinte con innerHTML puede llevárselo. Estos agujeros los
 * encontró una auditoría (nov-2026) y aquí se comprueban en un navegador:
 *
 *  · una venta inventada en /ventas (id con comillas, tarjeta con <img>) no
 *    ejecuta nada al pintarse, y su tarjeta falsa se descarta;
 *  · un almacén con clave o ubicación maliciosa (javascript:) no se pinta;
 *  · «⏱️ Activar contador» sube config.json ENTERO con solo activeCountdown
 *    cambiado — antes lo subía con tres campos y se perdían firebaseConfig,
 *    margenMN y el tema;
 *  · borrar un producto no borra sus fotos del repo al momento: van a la cola
 *    hasta que el catálogo publicado ya no las usa.
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
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try { const b = await readFile(ruta); r.writeHead(200, {'Content-Type': MIME[extname(ruta)] || 'application/octet-stream'}); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

let comprobaciones = 0;
const fallos = [];
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };
const CONFIG = JSON.parse(readFileSync(join(RAIZ, 'config.json'), 'utf8'));
const PRODS = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const CON_FOTO = PRODS.find(p => p.imagen && String(p.imagen).includes('/imagenes/') && (p.stock || 0) > 0);

const XSS = 'window.__xss=(window.__xss||0)+1';
const VENTAS_FB = {
    a: { id: "1790000000000');" + XSS + ";//", producto: 'Router', precio: 0, cantidad: 0, total: 0, fecha: 'x' },
    b: { id: 1790000000001, producto: 'Router', precio: 0, cantidad: 0, total: 0, fecha: 'x', tarjeta: '<img src=x onerror="' + XSS + '">' },
};
const ALMACENES_FB = {
    ['"><img src=x onerror=' + XSS + '>']: { nombre: 'Malo' },
    alm_1: { nombre: 'Almacén bueno', direccion: 'Calle 1', ubicacion: 'javascript:' + XSS },
};

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const erroresJs = [];
const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
const PUTS_GH = [], DELETES_GH = [];
await ctx.route(u => u.hostname.includes('firebaseio.com'), r => {
    const u = r.request().url();
    if (/\/ventas\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VENTAS_FB) });
    if (/\/almacenes\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALMACENES_FB) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
});
await ctx.route(u => u.hostname === 'api.github.com', r => {
    const q = r.request();
    if (q.method() === 'PUT') { PUTS_GH.push({ url: q.url(), body: JSON.parse(q.postData() || '{}') }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"y"}}' }); }
    if (q.method() === 'DELETE') { DELETES_GH.push(q.url()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"sha":"x"}' });
});
for (const h of ['googleapis.com', 'gstatic.com', 'google-analytics.com', 'raw.githubusercontent.com'])
    await ctx.route(u => u.hostname.includes(h), r => r.abort());
await ctx.addInitScript(() => {
    if (sessionStorage.getItem('_ini')) return; sessionStorage.setItem('_ini', '1');
    localStorage.setItem('firebaseConfig', JSON.stringify({ databaseURL: 'https://prueba-default-rtdb.firebaseio.com', projectId: 'prueba' }));
    localStorage.setItem('githubUser', 'u'); localStorage.setItem('githubRepo', 'r'); localStorage.setItem('githubToken', 't');
    localStorage.setItem('tasaMN', '1');   // una tasa vieja en este teléfono: no puede llegar al config
});
const p = await ctx.newPage();
p.on('pageerror', e => erroresJs.push(String(e).slice(0, 160)));
p.on('dialog', d => d.accept());
await p.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(3500);
await p.evaluate(() => { document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none'); });

// ── 1) Ventas inventadas en Firebase ──────────────────────────────────────
await p.evaluate(() => go('ventas'));
await p.waitForTimeout(1500);
const v = await p.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('img[src="x"]').length,
    texto: document.body.innerText, tarjeta: typeof tmTarjetaDeVenta === 'function' ? tmTarjetaDeVenta({ id: 1, tarjeta: '<img src=x onerror=alert(1)>' }) : 'sin función' }));
ok(v.xss === 0 && v.imgs === 0, `una venta inventada en /ventas ejecutó marcado en el panel (xss=${v.xss}, img=${v.imgs})`);
ok(!/<img/i.test(v.tarjeta), 'tmTarjetaDeVenta pintó una tarjeta que no tiene forma de código: ' + v.tarjeta);

// ── 2) Almacenes con clave o ubicación maliciosa ──────────────────────────
await p.evaluate(() => go('almacen'));
await p.waitForTimeout(1500);
const a = await p.evaluate(() => ({ xss: window.__xss || 0, js: document.querySelectorAll('#alm-list a[href^="javascript"]').length,
    malo: /Malo/.test((document.getElementById('alm-list') || {}).innerText || ''), bueno: /Almacén bueno/.test((document.getElementById('alm-list') || {}).innerText || '') }));
ok(a.xss === 0 && a.js === 0, `un almacén con ubicación javascript: o clave con marcado se pintó (xss=${a.xss}, js=${a.js})`);
ok(!a.malo && a.bueno, `el almacén con clave maliciosa tenía que descartarse y el bueno verse (malo=${a.malo}, bueno=${a.bueno})`);

// ── 3) El contador no vacía config.json ───────────────────────────────────
PUTS_GH.length = 0;
await p.evaluate(async () => {
    localStorage.setItem('activeCountdown', JSON.stringify({ productId: '1', endTime: Date.now() + 3600000, texto: 'x' }));
    await _sincronizarConfigGH();
});
await p.waitForTimeout(800);
const putCfg = PUTS_GH.find(x => /contents\/config\.json/.test(x.url));
let subido = null;
try { subido = putCfg && JSON.parse(Buffer.from(putCfg.body.content, 'base64').toString('utf8')); } catch (e) {}
ok(subido, 'activar el contador no subió config.json');
if (subido) {
    for (const k of ['firebaseConfig', 'margenMN', 'tasaMN', 'tema'].filter(k => k in CONFIG))
        ok(JSON.stringify(subido[k]) === JSON.stringify(CONFIG[k]), `el contador cambió o borró «${k}» de config.json: ${JSON.stringify(subido[k])}`);
    ok(subido.activeCountdown && subido.activeCountdown.productId === '1', 'el contador no quedó en config.json');
}

// ── 4) Borrar un producto no borra sus fotos al momento ───────────────────
if (CON_FOTO) {
    DELETES_GH.length = 0;
    await p.evaluate(id => { go('productos'); apDel(id); }, String(CON_FOTO.id));
    await p.waitForTimeout(1500);
    const cola = await p.evaluate(() => JSON.parse(localStorage.getItem('tm_fotos_por_borrar') || '[]'));
    ok(DELETES_GH.length === 0, 'borrar un producto borró fotos del repo antes de publicar: ' + DELETES_GH.join(' | '));
    ok(cola.some(x => x.u === CON_FOTO.imagen), 'la foto del producto borrado no quedó en la cola de fotos por borrar');
    // La cola no borra lo que sigue publicado (productos-lite.json del repo aún lo tiene).
    // (la cola se procesa 8 s después de cada carga de datos)
    await p.evaluate(() => cargarDatos(true));
    await p.waitForTimeout(9500);
    ok(DELETES_GH.length === 0, 'la cola borró una foto que el catálogo publicado todavía usa');
} else ok(false, 'no hay producto con foto del repo para probar el borrado');

const propios = erroresJs.filter(e => !/firebase is not defined/.test(e));
ok(propios.length === 0, 'errores de JavaScript: ' + propios.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de seguridad del panel en regla.`);
