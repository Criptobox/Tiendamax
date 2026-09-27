/* Cuatro detalles de la tienda (index.html) que se ven mal sin romper nada:
 *
 *  1. El buscador: al escribir «router» las cinco sugerencias salían
 *     AGOTADO. Lo que se puede comprar va primero.
 *  2. El conteo de una categoría: la tarjeta del inicio dice «5
 *     disponibles» y al entrar se ven 8 tarjetas. La cabecera tiene que
 *     cuadrar con la tarjeta y contar los agotados aparte.
 *  3. Al cerrar la ficha de un producto, la pestaña vuelve al título que
 *     tenía la página (no a uno escrito a mano que nunca tuvo).
 *  4. «Preguntas frecuentes» no va en la lista de categorías del pie, sino
 *     en su bloque «Ayuda».
 *
 * Se corre solo (`node tests/tienda_detalles_check.mjs`) y desde unittest
 * (tests/test_tienda_detalles.py). Sale con 1 si algo falla.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const servidor = createServer(async (q, r) => {
    let camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino === '/') camino = '/index.html';
    try {
        const cuerpo = await readFile(normalize(join(RAIZ, camino)));
        r.writeHead(200, { 'Content-Type': MIME[extname(camino)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);

const fallos = [];
let comprobaciones = 0;
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos-lite.json'), 'utf8'));
const disp = p => Number(p.stock) > 0;
// Una categoría con disponibles y agotados a la vez.
const porCat = {};
CATALOGO.forEach(p => { const c = porCat[p.categoria] = porCat[p.categoria] || { d: 0, a: 0 }; disp(p) ? c.d++ : c.a++; });
// La más pequeña: en las grandes la rejilla pinta 8 y un «ver más».
const CAT = Object.keys(porCat).filter(c => porCat[c].d > 0 && porCat[c].a > 0)
    .sort((x, y) => (porCat[x].d + porCat[x].a) - (porCat[y].d + porCat[y].a))[0];
// Una búsqueda con agotados y disponibles entre sus coincidencias.
const PALABRA = ['router', 'cargador', 'controlador', 'camara', 'inversor'].find(w => {
    const m = CATALOGO.filter(p => p.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(w));
    return m.some(disp) && m.some(p => !disp(p));
});

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 390, height: 844 } });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const pagina = await ctx.newPage();
const errores = [];
pagina.on('pageerror', e => errores.push(String(e).slice(0, 200)));
await pagina.goto(`http://localhost:${servidor.address().port}/index.html`);
await pagina.waitForFunction('typeof productos !== "undefined" && productos.length > 0 && typeof buscarDesdeHero === "function"', null, { timeout: 20000 });
await pagina.waitForTimeout(1200);

// 1) Buscador: «router» (el caso que se vio) y una palabra con agotados y
//    disponibles entre sus coincidencias por nombre.
for (const PALABRA_ of ['router', PALABRA].filter(Boolean)) {
    const PALABRA = PALABRA_;
    await pagina.evaluate(w => { const i = document.getElementById('heroSearchInput'); i.value = w; buscarDesdeHero(w); }, PALABRA);
    await pagina.waitForTimeout(900);
    const sug = await pagina.evaluate(() => Array.from(document.querySelectorAll('#heroSearchSuggestions .hsb-sug-item'))
        .map(x => /AGOTADO/.test(x.textContent)));
    ok(sug.length > 0, `buscar «${PALABRA}» no dio sugerencias`);
    const primerAgotado = sug.indexOf(true);
    ok(primerAgotado === -1 || !sug.slice(primerAgotado).includes(false),
       `buscando «${PALABRA}» sale un AGOTADO antes que uno disponible: ${JSON.stringify(sug)}`);
    ok(sug[0] === false, `la primera sugerencia de «${PALABRA}» está agotada aunque hay disponibles`);
}

// 2) Conteo de la categoría.
if (CAT) {
    const esperado = porCat[CAT];
    await pagina.evaluate(c => mostrarVistaCategoria(c), CAT);
    await pagina.waitForTimeout(700);
    const stats = await pagina.evaluate(() => (document.getElementById('categoriaStats') || {}).textContent || '');
    ok(new RegExp('^' + esperado.d + ' disponibles?').test(stats),
       `${CAT}: la cabecera tiene que empezar por «${esperado.d} disponibles», como su tarjeta; dice «${stats}»`);
    ok(stats.includes(esperado.a + ' agotado'), `${CAT}: los ${esperado.a} agotados que se ven no se cuentan aparte: «${stats}»`);
    // La rejilla pinta de 8 en 8 («ver más»): lo que se comprueba es que las
    // que se ven empiecen por las disponibles, que es lo que cuenta la cifra.
    const orden = await pagina.evaluate(() => Array.from(document.querySelectorAll('#productosGrid .producto-card'))
        .map(c => c.classList.contains('card-agotado')));
    const i = orden.indexOf(true);
    ok(orden.length > 0 && (i === -1 || !orden.slice(i).includes(false)),
       `${CAT}: hay tarjetas agotadas antes que disponibles: ${JSON.stringify(orden)}`);
}

// 3) Título de la pestaña al cerrar la ficha.
const original = await pagina.evaluate(() => document.title);
const abierto = await pagina.evaluate(async id => {
    abrirDetalleProducto(id);
    await new Promise(r => setTimeout(r, 400));
    const t = document.title;
    cerrarDetalleModal();
    await new Promise(r => setTimeout(r, 200));
    return { t, despues: document.title, og: (document.querySelector('meta[property="og:title"]') || {}).content };
}, CATALOGO.find(disp).id);
ok(abierto.t !== original, 'abrir la ficha no cambió el título de la pestaña (la prueba no prueba nada)');
ok(abierto.despues === original, `al cerrar la ficha la pestaña dice «${abierto.despues}» y la página decía «${original}»`);

// 4) Pie: Preguntas frecuentes en Ayuda, no entre las categorías.
const pie = await pagina.evaluate(() => ({
    enCats: !!document.querySelector('footer nav[aria-label="Categorías"] a[href*="faq"]'),
    enAyuda: !!document.querySelector('footer nav[aria-label="Ayuda"] a[href="/faq.html"]'),
    titulos: Array.from(document.querySelectorAll('footer .footer-nav-tit')).map(h => h.textContent.trim()),
}));
ok(!pie.enCats, '«Preguntas frecuentes» sigue dentro de la lista de categorías del pie');
ok(pie.enAyuda, 'el pie no tiene «Preguntas frecuentes» en el bloque Ayuda');
ok(pie.titulos.join('|') === 'Categorías|Ayuda', `los bloques del pie no se titulan Categorías y Ayuda: ${pie.titulos}`);
ok(!errores.length, 'errores de JavaScript en la tienda: ' + errores.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de la tienda (buscador «${PALABRA}», conteo de ${CAT}, pestaña, pie)`);
