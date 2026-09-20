/* Lo que cuesta pulsar "Actualizar tienda", contado en peticiones.
 *
 * El dueño avisó de que tardaba muchísimo. Cambiar el precio de UN producto
 * costaba 14 idas y vueltas a GitHub y 1,5 MB de descarga — y nada de eso se
 * ve leyendo el código: son cinco `await` seguidos que por separado parecen
 * razonables. Medido con 400 ms de latencia (un móvil en Cuba), eran 6 s; con
 * 800 ms, 11,5 s.
 *
 * Tres cosas lo causaban, y este archivo vigila las tres:
 *
 *  · productos.json se descargaba DOS veces seguidas (425 KB cada una), una
 *    en _tmPreservarDescripciones y otra en _tmMergeProductosConRepo.
 *  · Las cuatro lecturas del repo iban en fila aunque son ficheros distintos
 *    y ninguna depende de otra.
 *  · Cada subida pedía antes el sha de SU fichero, uno por uno; y se subían
 *    ficheros idénticos a los del repo (categorias.json, config.json…), que
 *    además son commits y despliegues de Pages que no cambian nada.
 *
 * Se mide con un GitHub de mentira que devuelve shas de git REALES: con shas
 * inventados nunca coincide nada y la poda parecería funcionar sin hacerlo.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };
const SITIO = [];        // lo que el panel pide a su propio origen
const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    SITIO.push(p);
    try {
        const cuerpo = await readFile(normalize(join(RAIZ, decodeURIComponent(p))));
        r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const leer = async n => JSON.parse(await readFile(join(RAIZ, n), 'utf8'));
// El panel escribe con JSON.stringify(x, null, 2); el "repo" tiene que estar
// en ese mismo formato o los shas no coinciden nunca y no se poda nada.
const CUERPOS = {
    'productos.json':              JSON.stringify(CATALOGO, null, 2),
    'productos-lite.json':         JSON.stringify(CATALOGO.map(p => { const { descripcion, ...r } = p; return r; }), null, 2),
    'categorias.json':             JSON.stringify(await leer('categorias.json'), null, 2),
    'subcategorias.json':          JSON.stringify(await leer('subcategorias.json'), null, 2),
    'config.json':                 JSON.stringify(await leer('config.json'), null, 2),
    'grupos_facebook_config.json': JSON.stringify({ grupos: [], exportado: '' }, null, 2),
};
const b64 = t => Buffer.from(t, 'utf8').toString('base64');
const shaGit = t => { const b = Buffer.from(t, 'utf8');
    return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex'); };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport:{width:412,height:1400}, serviceWorkers:'block' });
const LOG = [];

await ctx.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com'
                     && !u.hostname.includes('firebaseio.com') && !u.hostname.includes('raw.githubusercontent'),
                r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status:200, contentType:'application/json', body:'null' }));
await ctx.route(u => u.hostname.includes('raw.githubusercontent'), r => {
    const ruta = (r.request().url().split('/main/')[1] || '').split('?')[0];
    return r.fulfill({ status:200, contentType:'application/json', body: CUERPOS[ruta] || 'null' });
});
await ctx.route(u => u.hostname === 'api.github.com', r => {
    const req = r.request(), url = req.url();
    const ruta = (url.split('/contents/')[1] || '').split('?')[0];
    if (req.method() === 'PUT') {
        LOG.push({ tipo:'PUT', ruta });
        return r.fulfill({ status:200, contentType:'application/json', body:'{"content":{"sha":"nuevo"}}' });
    }
    if (url.includes('/contents/')) {
        if (!ruta) {
            LOG.push({ tipo:'GET', ruta:'(listado raíz)' });
            return r.fulfill({ status:200, contentType:'application/json',
                body: JSON.stringify(Object.keys(CUERPOS).map(n => ({ name:n, path:n, type:'file', sha:shaGit(CUERPOS[n]) }))) });
        }
        LOG.push({ tipo:'GET', ruta });
        const c = CUERPOS[ruta];
        return r.fulfill({ status:200, contentType:'application/json',
            body: c ? JSON.stringify({ sha:shaGit(c), encoding:'base64', content:b64(c) })
                    : JSON.stringify({ sha:'sin' }) });
    }
    LOG.push({ tipo:'GET', ruta:'(repo)' });
    return r.fulfill({ status:200, contentType:'application/json', body:'{"default_branch":"main"}' });
});

const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(() => {
    localStorage.setItem('githubUser', 'quien');
    localStorage.setItem('githubRepo', 'repo');
    localStorage.setItem('githubToken', 'ghp_de_mentira');
});
await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
await pagina.waitForTimeout(2500);
await pagina.evaluate(() => { document.getElementById('adminPanel').classList.remove('hidden'); });

/* Estado de partida: el catálogo completo cargado y UN precio cambiado de
   verdad. Marcar un producto como modificado sin tocarlo mide el caso "no
   cambió nada", que es justo el que la poda se salta: parecería estupendo y
   no probaría nada. */
await pagina.evaluate(async () => {
    const full = await (await fetch('productos-lite.json')).json();
    if (window.apReplaceProductos) window.apReplaceProductos(full.slice());
    else { productos.length = 0; full.forEach(p => productos.push(p)); }
    productos[0].precioActual = Number(productos[0].precioActual || 0) + 1;
    localStorage.setItem('productosModificados', JSON.stringify([String(productos[0].id)]));
});
LOG.length = 0;
SITIO.length = 0;
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);

const gets = LOG.filter(x => x.tipo === 'GET');
const puts = LOG.filter(x => x.tipo === 'PUT');
const cuantos = (arr, ruta) => arr.filter(x => x.ruta === ruta).length;

// ── 1. El catálogo se baja UNA vez ───────────────────────────────────────
ok(cuantos(gets, 'productos.json') === 1,
   `productos.json son 425 KB: se baja una vez, no ${cuantos(gets,'productos.json')}`);

/* Y tampoco desde el propio sitio: _tmPreservarDescripciones se bajaba
   tiendamax.org/productos.json (392 KB) además del que ya traía la API.
   Solo pasa cuando en memoria está el catálogo LITE, que es como carga el
   panel de verdad — con el completo cargado ese camino ni se ejecuta y la
   medición no vería nada. */
ok(SITIO.filter(p => p.endsWith('/productos.json')).length === 0,
   'durante la publicación no hay que bajarse otra vez el catálogo del sitio');

// ── 2. Un solo listado en vez de un sha por fichero ──────────────────────
ok(cuantos(gets, '(listado raíz)') === 1,
   'el sha de todos los ficheros se pide en UNA petición (listado de la raíz)');
/* categorias.json y config.json sí se leen una vez: hace falta su contenido
   para fusionarlo. Lo que no puede pasar es que un fichero se pida DOS veces
   —una para leerlo y otra para su sha—, ni que se pida el de los que no se
   leen para nada. */
for (const f of Object.keys(CUERPOS))
    ok(cuantos(gets, f) <= 1, `${f} se pide ${cuantos(gets,f)} veces; con una basta`);
for (const f of ['grupos_facebook_config.json','productos-lite.json'])
    ok(cuantos(gets, f) === 0,
       `${f} no hay que leerlo para publicarlo: su sha ya vino en el listado`);

// ── 3. No se sube lo que ya está igual ───────────────────────────────────
ok(cuantos(puts, 'categorias.json') === 0,
   'categorias.json no cambió: subirlo es un commit y un despliegue de Pages para nada');
// Y lo que SÍ cambió, se sube: es la mitad que de verdad importa.
ok(cuantos(puts, 'productos.json') === 1, 'el catálogo cambió: tiene que subir');
ok(cuantos(puts, 'productos-lite.json') === 1, 'y el catálogo lite con él, o la tienda muestra lo viejo');

// ── 4. El total ──────────────────────────────────────────────────────────
/* El número exacto depende de cuántos ficheros cambien; el tope es lo que
   vigila que no vuelvan a colarse idas y vueltas de más. Antes eran 14. */
ok(LOG.length <= 10, `cambiar un producto no puede costar ${LOG.length} peticiones a GitHub`);

// ── 5. Las lecturas van en paralelo ──────────────────────────────────────
/* Cinco `await` seguidos tardan cinco veces más que cinco a la vez, y eso no
   se ve en el número de peticiones: hay que mirar CUÁNDO salen. Se
   comprueba sobre el fuente porque el orden real depende del navegador. */
const FUENTE = await readFile(join(RAIZ, 'js/src/tm-catalog.src.js'), 'utf8');
const _i = FUENTE.indexOf('async function sincronizarTodoConGitHub');
const _cuerpo = FUENTE.slice(_i, FUENTE.indexOf('\n}', _i));
ok(/Promise\.all\(\[[\s\S]{0,600}_tmLeerJsonRepoFresco[\s\S]{0,600}_tmShasDeLaRaiz/.test(_cuerpo),
   'las lecturas del repo tienen que salir a la vez, no una detrás de otra');

// ── 6. Pulsarlo dos veces seguidas no publica nada la segunda ────────────
LOG.length = 0;
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);
ok(LOG.filter(x => x.tipo === 'PUT' && x.ruta === 'productos.json').length === 0,
   'sin tocar nada, el segundo "Actualizar tienda" no vuelve a subir el catálogo');

ok(erroresJs.length === 0, 'errores JS en el panel: ' + erroresJs.slice(0,2).join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`\n❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ publicar rápido: ${LOG.length} peticiones en el segundo intento, todo comprobado.`);
