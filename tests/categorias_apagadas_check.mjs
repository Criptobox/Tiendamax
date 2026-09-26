/* Categorías y subcategorías apagadas — la tienda y el panel de verdad.
 *
 * Nada de esto falla con un error: una categoría "apagada" que sigue
 * saliendo en las rebajas, en la búsqueda o en Max se ve exactamente igual
 * que una que nadie apagó. Lo que se comprueba:
 *
 *  Tienda (index.html)
 *   - Lo apagado no está en `productos` (de ahí leen la rejilla, la búsqueda,
 *     los destacados y Max), ni en las tarjetas de categoría, ni en las
 *     píldoras, ni en las rebajas, ni en las pestañas de subcategoría.
 *   - Los nombres se comparan sin tildes ni mayúsculas ("útiles" = UTILES).
 *   - {off:false} es una categoría que se volvió a encender: se ve.
 *   - localStorage guarda el catálogo ENTERO: lo comparte el panel.
 *   - La primera pintura (de la caché, antes de que llegue la red) ya no lo
 *     enseña, tampoco en las rebajas, que se pintan antes del bundle.
 *   - Encender lo trae de vuelta.
 *
 *  Panel (admin.html)
 *   - Un interruptor por categoría y por subcategoría; tocarlo guarda en el
 *     repo solo, fusionado con lo que apagó el otro teléfono y sin tocar
 *     nombres ni iconos.
 *   - Encender deja {off:false} con hora nueva, no borra la entrada.
 *   - "Actualizar tienda" reescribe categorias.json CON lo apagado.
 *   - Publicar no propone lo que está apagado.
 *
 * Se corre solo (`node tests/categorias_apagadas_check.mjs`) y desde
 * unittest (tests/test_categorias_apagadas.py). Sale con 1 si algo falla.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js'));
} catch (e) {
    try { ({ chromium } = requerir('playwright')); }
    catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); }
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };

const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos-lite.json'), 'utf8'));
const CATS_REPO = JSON.parse(await readFile(join(RAIZ, 'categorias.json'), 'utf8'));
const n = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

// Una categoría con una rebaja en stock (para ver que las rebajas la respetan),
// y una subcategoría de OTRA categoría con hermanas que sí se ven.
const rebajado = CATALOGO.find(p => Number(p.stock) > 0 && Number(p.precioOriginal) > Number(p.precioActual));
const CAT_OFF = rebajado ? rebajado.categoria : 'UTILES';
const porSub = {};
CATALOGO.forEach(p => { if (p.subcategoria && n(p.categoria) !== n(CAT_OFF)) {
    const k = p.categoria + '|' + p.subcategoria; porSub[k] = (porSub[k] || 0) + 1; } });
const clave = Object.keys(porSub).sort((a, b) => porSub[b] - porSub[a])
    .find(k => Object.keys(porSub).some(j => j !== k && j.split('|')[0] === k.split('|')[0]));
if (!clave) { console.log('catálogo sin una categoría con dos subcategorías — se salta'); process.exit(0); }
const [SUB_CAT, SUB_OFF] = clave.split('|');
const OTRA = CATALOGO.find(p => n(p.categoria) !== n(CAT_OFF) && n(p.categoria) !== n(SUB_CAT) && Number(p.stock) > 0);
const REENCENDIDA = OTRA.categoria;
const apagadoEn = p => n(p.categoria) === n(CAT_OFF) || (n(p.categoria) === n(SUB_CAT) && n(p.subcategoria) === n(SUB_OFF));
const FUERA = CATALOGO.filter(apagadoEn);
const DENTRO = CATALOGO.filter(p => !apagadoEn(p));

// Las claves se escriben A PROPÓSITO en minúsculas y con tilde donde se
// pueda: la tienda compara sin tildes ni mayúsculas, igual que Python.
const conTilde = s => s.toLowerCase().replace(/^utiles$/, 'útiles').replace(/^energia$/, 'energía');
const AHORA = Date.now();
const APAGADAS = {
    categorias: {
        [conTilde(CAT_OFF)]: { off: true, ts: AHORA - 1000 },
        [REENCENDIDA]: { off: false, ts: AHORA - 500 },
    },
    subcategorias: { [SUB_CAT]: { [SUB_OFF.toLowerCase()]: { off: true, ts: AHORA - 1000 } } },
};

let CATS_SERVIDAS = Object.assign({}, CATS_REPO, { apagadas: APAGADAS });
let CATS_COLGADO = false;
const servidor = createServer(async (q, r) => {
    const camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino === '/categorias.json') {
        if (CATS_COLGADO) return;   // la red no responde: solo queda la caché
        r.writeHead(200, { 'Content-Type': 'application/json' });
        return r.end(JSON.stringify(CATS_SERVIDAS));
    }
    const ruta = normalize(join(RAIZ, camino === '/' ? '/index.html' : camino));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// ════════════════════════ TIENDA ════════════════════════
{
    const ctx = await navegador.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 1200, height: 900 } });
    await ctx.route(u => u.hostname !== 'localhost', r => {
        if (new URL(r.request().url()).hostname.endsWith('firebaseio.com'))
            return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        return r.abort();
    });
    const pagina = await ctx.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(String(e).slice(0, 200)));
    const url = `http://localhost:${PUERTO}/index.html`;

    const estado = async () => pagina.evaluate(`(() => {
        const ids = Array.isArray(productos) ? productos.map(p => String(p.id)) : [];
        const txt = id => (document.getElementById(id) || {}).textContent || '';
        return {
            ids, cats: Array.isArray(categorias) ? categorias.slice() : [],
            tarjetas: txt('categoriasGrid'), pildoras: txt('categoriaFiltro'),
            rebajas: txt('rebajasHome'),
            guardados: (JSON.parse(localStorage.getItem('productos') || '[]') || []).length,
            copia: localStorage.getItem('tm_cat_apagadas') || '',
        };
    })()`);

    // 1) Primera visita, sin caché.
    await pagina.goto(url);
    await pagina.waitForFunction('typeof productos !== "undefined" && productos.length > 0', null, { timeout: 20000 });
    await pagina.waitForTimeout(1500);
    let e = await estado();
    const fueraIds = new Set(FUERA.map(p => String(p.id)));
    ok(!e.ids.some(id => fueraIds.has(id)),
       `la tienda sigue teniendo en memoria ${e.ids.filter(id => fueraIds.has(id)).length} producto(s) apagados: saldrían en la rejilla, la búsqueda y Max`);
    ok(e.ids.length === DENTRO.length,
       `tenían que quedar ${DENTRO.length} productos y quedan ${e.ids.length} (¿se ha apagado de más?)`);
    ok(e.ids.some(id => String(OTRA.id) === id),
       `${REENCENDIDA} está {off:false} —se volvió a encender— y aun así no sale`);
    ok(!e.cats.some(c => n(c) === n(CAT_OFF)), `${CAT_OFF} sigue en la lista de categorías de la tienda`);
    ok(!new RegExp('\\b' + CAT_OFF + '\\b', 'i').test(e.pildoras), `${CAT_OFF} sigue saliendo en las píldoras de filtro`);
    ok(e.guardados === CATALOGO.length,
       `localStorage tiene que guardar el catálogo ENTERO (${CATALOGO.length}), lo comparte el panel; guarda ${e.guardados}`);
    ok(/"off":true/.test(e.copia), 'no quedó copia de lo apagado para la próxima visita');
    if (rebajado) ok(!e.rebajas.includes(rebajado.nombre.replace(/^\W+/, '').slice(0, 18)),
       `la rebaja de «${rebajado.nombre}» sigue en la portada con ${CAT_OFF} apagada`);

    // Tarjetas: la categoría apagada no tiene tarjeta; una que sí se ve, sí.
    const tarjetas = await pagina.evaluate(() => Array.from(document.querySelectorAll('#categoriasGrid [onclick], #categoriasGrid [data-cat], #categoriasGrid a, #categoriasGrid button'))
        .map(x => (x.getAttribute('onclick') || '') + '|' + (x.getAttribute('data-cat') || '') + '|' + x.textContent).join('\n'));
    ok(!new RegExp(CAT_OFF, 'i').test(tarjetas.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
       `${CAT_OFF} sigue teniendo tarjeta en el inicio`);

    // Pestañas de subcategoría.
    await pagina.evaluate(c => { mostrarVistaCategoria(c); }, SUB_CAT);
    await pagina.waitForTimeout(400);
    const tabs = await pagina.evaluate(() => Array.from(document.querySelectorAll('#subcategoriaTabs .subcategoria-tab')).map(b => b.textContent.trim()));
    ok(!tabs.some(t => n(t) === n(SUB_OFF)), `la pestaña «${SUB_OFF}» sigue en ${SUB_CAT}: ${JSON.stringify(tabs)}`);
    ok(tabs.length >= 2, `${SUB_CAT} se quedó sin pestañas: solo tenía que desaparecer «${SUB_OFF}»`);
    const grid = await pagina.evaluate(() => (document.getElementById('productosGrid') || {}).textContent || '');
    const unoFuera = FUERA.find(p => n(p.categoria) === n(SUB_CAT));
    if (unoFuera) ok(!grid.includes(unoFuera.nombre.slice(0, 20)), `«${unoFuera.nombre}» sigue en la rejilla de ${SUB_CAT}`);

    // 2) Segunda visita con la red colgada: la primera pintura sale de la caché.
    CATS_COLGADO = true;
    await pagina.goto(url, { waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction('typeof productos !== "undefined" && productos.length > 0', null, { timeout: 15000 });
    await pagina.waitForTimeout(800);
    e = await estado();
    ok(!e.ids.some(id => fueraIds.has(id)), 'con la red lenta, la caché vuelve a enseñar lo apagado hasta que llega categorias.json');
    if (rebajado) ok(!e.rebajas.includes(rebajado.nombre.replace(/^\W+/, '').slice(0, 18)),
       'las rebajas se pintan antes del bundle y con la caché vuelven a enseñar lo apagado');
    CATS_COLGADO = false;

    // 3) Encender: categorias.json sin la clave.
    CATS_SERVIDAS = Object.assign({}, CATS_REPO);
    delete CATS_SERVIDAS.apagadas;
    await pagina.goto(url);
    await pagina.waitForFunction(`typeof productos !== "undefined" && productos.length === ${CATALOGO.length}`, null, { timeout: 20000 })
        .catch(() => {});
    e = await estado();
    ok(e.ids.length === CATALOGO.length, `al encenderlo todo tienen que volver los ${CATALOGO.length}; hay ${e.ids.length}`);
    ok(!/"off":true/.test(e.copia), 'la copia de lo apagado no se limpió al encender');
    ok(!errores.length, 'errores de JavaScript en la tienda: ' + errores.join(' | '));
    await ctx.close();
}

// ════════════════════════ PANEL ════════════════════════
{
    const REPO = {
        // El otro teléfono ya apagó una subcategoría: tiene que sobrevivir.
        'categorias.json': Object.assign({}, CATS_REPO, { apagadas: {
            categorias: {}, subcategorias: { [SUB_CAT]: { [SUB_OFF]: { off: true, ts: AHORA - 60000 } } } } }),
    };
    const SUBIDAS = [];
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    CATS_SERVIDAS = REPO['categorias.json'];
    const ctx = await navegador.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 420, height: 900 } });
    await ctx.route(u => !['localhost', 'api.github.com'].includes(u.hostname) && !u.hostname.endsWith('firebaseio.com'), r => r.abort());
    await ctx.route(u => u.hostname.endsWith('firebaseio.com'), r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await ctx.route(u => u.hostname === 'api.github.com', async r => {
        const m = new URL(r.request().url()).pathname.match(/\/contents\/(.+)$/);
        if (!m) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
        const ruta = decodeURIComponent(m[1]);
        if (r.request().method() === 'PUT') {
            const cuerpo = JSON.parse(r.request().postData() || '{}');
            const datos = JSON.parse(Buffer.from(cuerpo.content || '', 'base64').toString('utf8') || 'null');
            REPO[ruta] = datos; SUBIDAS.push({ ruta, datos });
            return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s2"}}' });
        }
        if (!(ruta in REPO)) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return r.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ sha: 's1', encoding: 'base64', content: b64(JSON.stringify(REPO[ruta])) }) });
    });
    const pagina = await ctx.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(String(e).slice(0, 200)));
    await pagina.addInitScript(() => {
        window.confirm = () => true;
        localStorage.setItem('githubUser', 'quien');
        localStorage.setItem('githubRepo', 'repo');
        localStorage.setItem('githubToken', 'ghp_de_mentira');
    });
    await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
    await pagina.waitForFunction('typeof window.catSwitch === "function" && window.PRODUCTOS.length > 0', null, { timeout: 20000 });
    await pagina.waitForTimeout(1500);
    await pagina.evaluate(() => {
        document.getElementById('adminPanel').classList.remove('hidden');
        document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
        window.go('categorias');
        window.catSwitch('cat');
    });
    const nCats = CATS_REPO.nombres.length;
    const sw = await pagina.evaluate(() => Array.from(document.querySelectorAll('#cat-list .cat-sw')).map(b => b.getAttribute('aria-checked')));
    ok(sw.length === nCats, `tiene que haber un interruptor por categoría (${nCats}), hay ${sw.length}`);
    ok(sw.every(x => x === 'true'), 'con nada apagado, todos los interruptores tienen que estar en verde');

    // Apagar una categoría tocando su interruptor.
    const i = CATS_REPO.nombres.findIndex(x => n(x) === n(CAT_OFF));
    await pagina.locator('#cat-list .cat-sw').nth(i).click();
    const tras = await pagina.evaluate(i => {
        const b = document.querySelectorAll('#cat-list .cat-sw')[i];
        return { on: b.getAttribute('aria-checked'), tag: b.parentElement.textContent.includes('Apagada'),
                 estado: document.getElementById('cat-ap-estado').textContent };
    }, i);
    ok(tras.on === 'false' && tras.tag, 'el interruptor no se puso en apagado o la fila no dice «Apagada»');
    ok(/no sale/.test(tras.estado), `la línea de arriba tiene que decir cuántos productos no salen: «${tras.estado}»`);
    await pagina.waitForTimeout(5500);
    let sub = SUBIDAS.filter(s => s.ruta === 'categorias.json').pop();
    ok(!!sub, 'apagar no subió categorias.json al repo solo (sin pasar por «Actualizar tienda»)');
    if (sub) {
        const d = sub.datos;
        const kc = Object.keys(d.apagadas.categorias).find(k => n(k) === n(CAT_OFF));
        ok(kc && d.apagadas.categorias[kc].off === true && d.apagadas.categorias[kc].ts > AHORA,
           'la categoría no quedó {off:true} con la hora del toque');
        ok(d.apagadas.subcategorias[SUB_CAT] && d.apagadas.subcategorias[SUB_CAT][SUB_OFF]
           && d.apagadas.subcategorias[SUB_CAT][SUB_OFF].off === true,
           'lo que apagó el otro teléfono se perdió al guardar: hay que fusionar, no pisar');
        ok(JSON.stringify(d.nombres) === JSON.stringify(CATS_REPO.nombres), 'guardar el interruptor cambió la lista de categorías');
        ok(JSON.stringify(d.iconos) === JSON.stringify(CATS_REPO.iconos), 'guardar el interruptor cambió los iconos');
    }
    const est = await pagina.evaluate(() => document.getElementById('cat-ap-estado').textContent);
    ok(/Guardado/.test(est), `la línea de estado tiene que decir que se guardó: «${est}»`);

    // La vista de subcategorías: su interruptor refleja lo del otro teléfono.
    const subSw = await pagina.evaluate(([c, s]) => {
        window.catSwitch('sub');
        const filas = Array.from(document.querySelectorAll('#cat-list .cat-sw'));
        const b = filas.find(x => /Encender|Apagar/.test(x.getAttribute('aria-label')) && x.getAttribute('aria-label').endsWith(s));
        return { total: filas.length, on: b ? b.getAttribute('aria-checked') : null };
    }, [SUB_CAT, SUB_OFF]);
    ok(subSw.total > 5, 'la vista de subcategorías no tiene interruptores');
    ok(subSw.on === 'false', `«${SUB_OFF}» está apagada en el repo y su interruptor dice ${subSw.on}`);

    // Publicar no propone lo apagado.
    const pub = await pagina.evaluate(([c, uno]) => ({
        cat: window.pubCatProds(c).length,
        prod: typeof window.tmProductoApagado === 'function' && window.tmProductoApagado(uno) === true,
        otro: typeof window.tmProductoApagado === 'function' && window.tmProductoApagado({ categoria: 'NO-EXISTE' }) === false,
    }), [CAT_OFF, FUERA.find(p => n(p.categoria) === n(CAT_OFF))]);
    ok(pub.cat === 0, `«Por categoría» sigue ofreciendo ${pub.cat} producto(s) de ${CAT_OFF}, que está apagada`);
    ok(pub.prod && pub.otro, 'window.tmProductoApagado no distingue lo apagado: el Copiloto y Publicar lo proponen igual');

    // "Actualizar tienda" reescribe categorias.json: tiene que llevar lo apagado.
    const merge = await pagina.evaluate(async () => {
        const r = await _tmMergeCategoriasConRepo('quien', 'repo');
        return r && r.apagadas ? JSON.stringify(r.apagadas) : '';
    });
    ok(/"off":true/.test(merge), '«Actualizar tienda» reescribiría categorias.json sin lo apagado y lo encendería todo');

    // Encender: {off:false} con hora nueva, no borrar la entrada.
    await pagina.evaluate(() => window.catSwitch('cat'));
    await pagina.locator('#cat-list .cat-sw').nth(i).click();
    await pagina.waitForTimeout(5500);
    sub = SUBIDAS.filter(s => s.ruta === 'categorias.json').pop();
    const kc = sub && Object.keys(sub.datos.apagadas.categorias).find(k => n(k) === n(CAT_OFF));
    ok(kc && sub.datos.apagadas.categorias[kc].off === false,
       'encender tiene que dejar {off:false}: si se borra la entrada, el otro teléfono la vuelve a apagar');
    ok(!errores.length, 'errores de JavaScript en el panel: ' + errores.join(' | '));
    await ctx.close();
}

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de categorías apagadas`);
