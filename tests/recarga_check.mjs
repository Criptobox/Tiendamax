/* La tienda no se recarga sola, y el cliente se queda donde estaba.
 *
 * El dueño lo vio así: "cuando entro se actualiza sola varias veces, y si
 * estás en una categoría te saca al inicio; si salgo y al rato entro, lo
 * vuelve a hacer". Eran dos recargas automáticas, y ninguna daba error:
 *
 *   · En la PRIMERA visita el service worker se instala, toma el control y
 *     `controllerchange` recargaba la página. Con 3G eso llega segundos
 *     después de entrar, cuando el cliente ya tocó una categoría.
 *   · Cada "Actualizar tienda" escribe /config/version en Firebase, y al
 *     ENTRAR, si no coincidía con la última vista, se recargaba — o sea el
 *     primer cliente después de cada publicación, cada vez.
 *
 * Las dos eran inútiles: index.html va por la red primero y los JS llevan
 * ?v=hash, así que lo recién abierto ya es lo nuevo. La categoría no vive en
 * la URL, de modo que cualquier recarga devuelve al inicio.
 *
 * Aquí se hace con un navegador de verdad y el service worker activo.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) {
    try { ({ chromium } = requerir('playwright')); }
    catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); }
}

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png',
               '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const PEDIDOS = [];
const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    PEDIDOS.push(p);
    try {
        const cuerpo = await readFile(normalize(join(RAIZ, decodeURIComponent(p === '/' ? '/index.html' : p))));
        r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

let VERSION = 1000;   // /config/version: lo que escribe el panel al publicar
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });   // SW activo
await ctx.route(u => !u.hostname.includes('localhost'), r => {
    const url = r.request().url();
    if (url.includes('firebaseio.com'))
        return r.fulfill({ status: 200, contentType: 'application/json',
                           body: url.includes('/config/version') ? String(VERSION) : 'null' });
    return r.abort();
});
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
let cargas = 0;
pagina.on('load', () => { cargas++; });

const enCategoria = () => pagina.evaluate(() =>
    getComputedStyle(document.getElementById('vistaCategoria')).display !== 'none').catch(() => false);
const entrarACategoria = () => pagina.evaluate(() => {
    mostrarVistaCategoria(categorias[0]);
}).catch(() => {});
const abrir = async () => {
    cargas = 0;
    await pagina.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction(() => typeof mostrarVistaCategoria === 'function'
        && typeof categorias !== 'undefined' && categorias.length > 0, null, { timeout: 30000 });
};

// ── 1. Primera visita: se instala el service worker ──────────────────────
await abrir();
await entrarACategoria();
await pagina.waitForTimeout(6000);
const swActivo = await pagina.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false);
ok(swActivo, 'el service worker tiene que haber tomado el control (si no, esta prueba no prueba nada)');
ok(cargas === 1, `primera visita: la página se cargó ${cargas} veces; al instalarse el SW no puede recargarse`);
ok(await enCategoria(), 'primera visita: el cliente tiene que seguir en la categoría que abrió');

// ── 2. El gestor publica y entra un cliente ──────────────────────────────
const tieneFirebase = await pagina.evaluate(() => {
    localStorage.setItem('tm_deploy_version', '1000');
    localStorage.removeItem('tm_deploy_reload_ts');
    return !!localStorage.getItem('firebaseConfig');
});
ok(tieneFirebase, 'sin firebaseConfig la tienda no mira /config/version y la prueba 2 no prueba nada');
VERSION = 2000;
await abrir();
await entrarACategoria();
await pagina.waitForTimeout(5000);
ok(cargas === 1, `tras publicar, la página se cargó ${cargas} veces al entrar; lo recién abierto ya es lo nuevo`);
ok(await enCategoria(), 'tras publicar, el cliente que entra tiene que seguir en su categoría');
ok(await pagina.evaluate(() => localStorage.getItem('tm_deploy_version')) === '2000',
   'al entrar se apunta la versión publicada, para no refrescar por ella al volver');

// ── 3. Vuelve a una pestaña que dejó abierta, y entretanto se publicó ────
/* Aquí sí hay algo que traer: precios y stock nuevos. Se piden otra vez los
   productos, sin recargar: el cliente sigue en su categoría. */
VERSION = 3000;
const antes = PEDIDOS.filter(p => /productos(-lite)?\.json$/.test(p)).length;
await pagina.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
});
await pagina.waitForTimeout(3000);
const despues = PEDIDOS.filter(p => /productos(-lite)?\.json$/.test(p)).length;
ok(cargas === 1, `al volver a la pestaña la página se recargó (${cargas} cargas); basta con pedir los datos`);
ok(despues > antes, 'al volver tras una publicación hay que pedir otra vez los productos');
ok(await enCategoria(), 'al volver a la pestaña el cliente tiene que seguir en su categoría');

ok(erroresJs.length === 0, 'errores JS en la tienda: ' + erroresJs.slice(0, 2).join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`\n❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ la tienda no se recarga sola y el cliente se queda donde estaba.');
