/* «⭐ Deja tu reseña» desde la portada + que el apartado de reseñas no dependa
 * de nada que un navegador pueda no tener.
 *
 * El dueño reportó dos cosas: el apartado de la portada «no funciona» (era un
 * texto sin botón, escondido hasta que Firebase contestaba) y que en algunos
 * navegadores los productos «no muestran» el modo de dejar reseña. Aquí se
 * comprueba en Chromium, que es lo único que hay, simulando las carencias:
 * sin IntersectionObserver/ResizeObserver, con localStorage que lanza error,
 * con fetch roto, sin Firebase y sin closest/URLSearchParams/AbortController
 * en resena.html. Lo que NO se puede probar aquí es Safari, Firefox o una
 * WebView vieja de verdad: se prueba la ausencia de cada API, no el motor.
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
const BASE = `http://localhost:${servidor.address().port}`;

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
const LITE = JSON.parse(readFileSync(join(RAIZ, 'productos-lite.json'), 'utf8'));
const CATS = JSON.parse(readFileSync(join(RAIZ, 'categorias.json'), 'utf8'));
const apagada = c => { const a = (CATS.apagadas || {}).categorias || {}; return Object.keys(a).some(k => a[k] && a[k].off && k.toUpperCase() === String(c).toUpperCase()); };
const VISIBLES = LITE.filter(p => !apagada(p.categoria) && !(p.digital && p.activo === false));
const OCULTO = LITE.find(p => apagada(p.categoria));
const INVERSOR = LITE.find(p => /inversor/i.test(p.nombre) && !apagada(p.categoria));
ok(VISIBLES.length > 20 && OCULTO && INVERSOR, 'faltan datos del catálogo real para la prueba');

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const erroresJs = [];
const PUTS = [];

async function contexto({ vp, firebase = 'null', init } = {}) {
    const ctx = await navegador.newContext({ viewport: vp || { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route(u => u.hostname.includes('firebaseio.com'), r => {
        const req = r.request();
        if (firebase === 'caido') return r.abort();
        if (req.method() === 'PUT') { PUTS.push({ url: req.url(), body: JSON.parse(req.postData()) }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    for (const h of ['googleapis.com','gstatic.com','google-analytics.com','raw.githubusercontent.com','api.github.com'])
        await ctx.route(u => u.hostname.includes(h), r => r.abort());
    if (init) await ctx.addInitScript(init);
    return ctx;
}

// Abre el selector desde la portada y comprueba lo esencial. `etiqueta` dice qué carencia se simula.
async function portada(etiqueta, opts, { esperaBundle = true } = {}) {
    const ctx = await contexto(opts);
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!opts || !opts.tolerarErrores) erroresJs.push(etiqueta + ': ' + String(e).slice(0, 140)); });
    await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#tmResenaPortadaBtn', { state: 'attached', timeout: 15000 });
    await p.waitForTimeout(esperaBundle ? 3500 : 1200);   // deja que corran el bundle y las reseñas
    const btn = p.locator('#tmResenaPortadaBtn');
    await btn.scrollIntoViewIfNeeded();
    const caja = await btn.boundingBox();
    ok(caja && caja.width > 100 && caja.height >= 44, `${etiqueta}: el botón «Deja tu reseña» se ve y es táctil (${JSON.stringify(caja)})`);
    return { ctx, p, btn };
}

async function selector(etiqueta, p, btn) {
    await btn.click();
    await p.waitForSelector('.tmrs-panel', { timeout: 5000 });
    await p.waitForFunction(() => document.querySelectorAll('.tmrs-fila').length > 0, null, { timeout: 12000 }).catch(() => {});
    const n = await p.locator('.tmrs-fila').count();
    ok(n > 0 && n <= 30, `${etiqueta}: el selector lista productos (hay ${n}, máximo 30)`);
    return n;
}

// ── 1) camino normal: sin reseñas en ningún lado, Firebase vacío ──────────
{
    const { ctx, p, btn } = await portada('normal');
    const cta = await p.evaluate(() => { const c = document.getElementById('testimoniosCTA'); const cs = getComputedStyle(c); return { vis: cs.display !== 'none' && cs.visibility !== 'hidden', btn: !!c.querySelector('button') }; });
    ok(cta.vis && cta.btn, 'el CTA de reseñas es visible y contiene un botón, aunque no haya reseñas');
    await selector('normal', p, btn);
    const nombres = await p.$$eval('.tmrs-nom', e => e.map(x => x.textContent));
    ok(!nombres.includes(OCULTO.nombre), `no ofrece productos de categorías apagadas («${OCULTO.nombre}»)`);
    ok(await p.$$eval('.tmrs-fila img', e => e.length > 0), 'cada fila lleva su foto pequeña');
    // búsqueda
    await p.fill('#tmrs-q', 'inversor');
    const f = await p.$$eval('.tmrs-nom', e => e.map(x => x.textContent));
    ok(f.length >= 1 && f.every(t => /inversor/i.test(t)), `buscar «inversor» deja solo inversores (${f.length})`);
    ok(f.includes(INVERSOR.nombre), 'el inversor del catálogo está en el resultado');
    await p.fill('#tmrs-q', 'zzzxxqq');
    ok((await p.locator('.tmrs-fila').count()) === 0 && /No encontré/.test(await p.textContent('#tmrs-estado')), 'sin coincidencias lo dice');
    await p.fill('#tmrs-q', 'invérsor');   // sin tildes ni mayúsculas
    ok((await p.locator('.tmrs-fila').count()) >= 0, 'buscar con tilde no rompe');
    await p.fill('#tmrs-q', INVERSOR.nombre.split(' ').slice(0, 2).join(' ').toUpperCase());
    // elegir un producto → resena.html?p=<id>
    const fila = p.locator('.tmrs-fila', { hasText: INVERSOR.nombre }).first();
    const href = await fila.getAttribute('href');
    ok(href === `resena.html?p=${encodeURIComponent(INVERSOR.id)}`, `la fila apunta al flujo de reseña con el id correcto: ${href}`);
    await Promise.all([p.waitForURL(u => u.pathname.endsWith('/resena.html') && u.searchParams.get('p') === String(INVERSOR.id), { timeout: 8000, waitUntil: 'commit' }), fila.click()]);
    await p.waitForSelector('#estrellas .estrella', { timeout: 8000 });
    ok((await p.locator('.estrella').count()) === 5, 'se abre la página de reseña con sus 5 estrellas');
    await ctx.close();
}

// ── 2) teclado: Enter abre, Tab no se sale, Escape cierra y devuelve el foco ──
{
    const { ctx, p, btn } = await portada('teclado');
    await btn.focus();
    await p.keyboard.press('Enter');
    await p.waitForSelector('.tmrs-panel', { timeout: 5000 });
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'tmrs-q'), 'al abrir, el foco va a la búsqueda');
    await p.waitForFunction(() => document.querySelectorAll('.tmrs-fila').length > 0, null, { timeout: 12000 });
    for (let i = 0; i < 45; i++) {
        await p.keyboard.press('Tab');
        if (!(await p.evaluate(() => !!document.activeElement.closest('.tmrs-panel')))) { ok(false, 'el foco se salió del cuadro con Tab'); break; }
    }
    await p.keyboard.press('Shift+Tab');
    ok(await p.evaluate(() => !!document.activeElement.closest('.tmrs-panel')), 'Shift+Tab tampoco saca el foco');
    await p.keyboard.press('Escape');
    ok((await p.locator('.tmrs-panel').count()) === 0, 'Escape cierra el selector');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'tmResenaPortadaBtn'), 'al cerrar, el foco vuelve al botón');
    await ctx.close();
}

// ── 3) 320 px, sin desborde horizontal, tema claro y oscuro ───────────────
for (const tema of ['oscuro', 'claro']) {
    const { ctx, p, btn } = await portada('320 ' + tema, { vp: { width: 320, height: 640 } });
    if (tema === 'claro') await p.evaluate(() => document.body.classList.add('light-mode'));
    await selector('320 ' + tema, p, btn);
    const m = await p.evaluate(() => {
        const pa = document.querySelector('.tmrs-panel').getBoundingClientRect();
        const cs = getComputedStyle(document.querySelector('.tmrs-panel'));
        const nom = getComputedStyle(document.querySelector('.tmrs-nom')).color;
        const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
        const a = lum(cs.backgroundColor), b = lum(nom);
        return { ancho: pa.width, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    ok(m.ancho <= 320 && m.sw <= m.cw, `320 px ${tema}: el cuadro cabe y la página no desborda (${JSON.stringify(m)})`);
    ok(m.ratio >= 4.5, `${tema}: contraste del nombre contra el fondo ${m.ratio.toFixed(1)} < 4.5`);
    await ctx.close();
}

// ── 4) sin Firebase y con el fetch roto ───────────────────────────────────
{
    const { ctx, p, btn } = await portada('firebase caído + fetch roto', {
        firebase: 'caido',
        init: () => { window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); }; }
    });
    await selector('firebase caído + fetch roto', p, btn);
    await ctx.close();
}

// ── 5) carencias de navegador: sin observadores y con localStorage que lanza ──
{
    const sinApis = () => {
        delete window.IntersectionObserver; delete window.ResizeObserver;
        try { delete window.AbortController; } catch (e) {}
        Element.prototype.closest = undefined;                 // hace explotar lo que lo use sin comprobar
        try { delete String.prototype.normalize; } catch (e) {}
    };
    const { ctx, p, btn } = await portada('sin IntersectionObserver/ResizeObserver/closest', { init: sinApis, tolerarErrores: true });
    // sin closest el delegador de eventos de la tienda no sirve, pero el selector no lo usa
    await selector('sin APIs', p, btn);
    await p.fill('#tmrs-q', 'inversor');
    ok((await p.locator('.tmrs-fila').count()) >= 1, 'sin APIs modernas la búsqueda sigue filtrando');
    await ctx.close();
}
{
    const lsRoto = () => {
        const lanza = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
        Object.defineProperty(window, 'localStorage', { get: lanza, configurable: true });
        Object.defineProperty(window, 'sessionStorage', { get: lanza, configurable: true });
    };
    // El selector tiene que funcionar aunque el bundle muera por el almacenamiento.
    const { ctx, p, btn } = await portada('localStorage bloqueado', { init: lsRoto, tolerarErrores: true }, { esperaBundle: false });
    await selector('localStorage bloqueado', p, btn);
    const nombres = await p.$$eval('.tmrs-nom', e => e.map(x => x.textContent));
    ok(!nombres.includes(OCULTO.nombre), 'con localStorage bloqueado tampoco ofrece lo apagado (lee categorias.json)');
    await ctx.close();
}

// ── 6) la ficha: «+ Agregar reseña» y su formulario, con carencias ────────
async function ficha(etiqueta, opts) {
    const ctx = await contexto(opts);
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!opts || !opts.tolerarErrores) erroresJs.push(etiqueta + ': ' + String(e).slice(0, 140)); });
    await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0 && typeof abrirDetalleProducto === 'function', null, { timeout: 20000 });
    await p.evaluate(id => abrirDetalleProducto(id), INVERSOR.id);
    await p.waitForTimeout(800);
    const b = p.locator('#btnAgregarResena');
    await b.scrollIntoViewIfNeeded();
    ok(await b.isVisible(), `${etiqueta}: «+ Agregar reseña» se ve en la ficha`);
    await b.click();
    await p.waitForTimeout(300);
    ok(await p.locator('#formResena').isVisible(), `${etiqueta}: el formulario aparece al tocar el botón`);
    ok(await p.locator('#ratingStarsInput .star-btn').count() === 5 && await p.locator('#resenaTexto').isVisible(), `${etiqueta}: estrellas y texto presentes`);
    await ctx.close();
}
await ficha('ficha normal');
await ficha('ficha sin observadores', { init: () => { delete window.IntersectionObserver; delete window.ResizeObserver; } });
await ficha('ficha con fetch lento y sin Firebase', { firebase: 'caido', init: () => { const f = window.fetch; window.fetch = (...a) => new Promise(r => setTimeout(() => r(f(...a)), 1500)); } });
await ficha('ficha con localStorage bloqueado (acceder lanza)', { init: () => {
    const lanza = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: lanza, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { get: lanza, configurable: true });
} });
await ficha('ficha con localStorage lleno (setItem lanza)', { init: () => { Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; } });

// ── 7) resena.html sin URLSearchParams/closest/AbortController/fetch ──────
{
    const ctx = await contexto({ init: () => {
        delete window.URLSearchParams; delete window.AbortController; delete window.fetch;
        Element.prototype.closest = undefined;
        Object.defineProperty(HTMLElement.prototype, 'dataset', { get() { return undefined; }, configurable: true });
    } });
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('resena sin APIs: ' + String(e).slice(0, 140)));
    await p.goto(`${BASE}/resena.html?p=${INVERSOR.id}&n=Ana`, { waitUntil: 'networkidle' });
    ok(/Ana/.test(await p.textContent('#titulo')), 'resena.html lee el nombre sin URLSearchParams');
    ok(/Inversor/.test(await p.textContent('#titulo')), 'resena.html saca el nombre del producto sin fetch');
    await p.locator('.estrella').nth(4).click();
    await p.locator('.chip').first().click();
    ok(await p.locator('#enviar').isEnabled(), 'con 5 estrellas, una frase y nombre se puede publicar');
    PUTS.length = 0;
    await p.click('#enviar');
    await p.waitForSelector('#gracias:not([hidden])', { timeout: 8000 });
    const put = PUTS.find(x => x.url.includes('/resenas/' + INVERSOR.id + '/'));
    ok(put && put.body.estrellas === 5 && put.body.productoId === String(INVERSOR.id) && put.body.ts && put.body.ts['.sv'] === 'timestamp', 'la reseña se escribe en /resenas/<id> con la hora del servidor');
    ok(put && put.body.comprador === false && !put.body.verificada, 'desde la portada no se afirma «compra»: sin v=1 ni token no hay marca');
    await ctx.close();
}

await navegador.close();
servidor.close();
if (erroresJs.length) fallos.push('errores de JS en página: ' + erroresJs.join(' | '));
if (fallos.length) { console.log('FALLOS:\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log('resena_portada_check: todo bien');
