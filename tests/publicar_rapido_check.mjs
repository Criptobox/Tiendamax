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
const GRUPOS = [{ nombre: 'Compra venta Habana', url: 'https://www.facebook.com/groups/123' }];
const CUERPOS = {
    'productos.json':              JSON.stringify(CATALOGO, null, 2),
    'productos-lite.json':         JSON.stringify(CATALOGO.map(p => { const { descripcion, ...r } = p; return r; }), null, 2),
    'categorias.json':             JSON.stringify(await leer('categorias.json'), null, 2),
    'subcategorias.json':          JSON.stringify(await leer('subcategorias.json'), null, 2),
    /* config.json tal como lo deja el cron de la tasa: escrito desde Python
       (720.0, no 720) y con la hora de la última pasada. Si el panel lo
       compara por bytes o le pone la hora de ahora, lo sube en cada
       publicación — pasó: un commit de config.json por cada "Actualizar". */
    'config.json':                 JSON.stringify(Object.assign(await leer('config.json'),
                                       { actualizado: '2026-01-01T00:00:00.000Z' }), null, 2)
                                       .replace(/("tasaMN": \d+)(,?)$/m, '$1.0$2'),
    // Con un grupo: vacío en los dos lados, subir [] encima no se notaría.
    'grupos_facebook_config.json': JSON.stringify({ grupos: GRUPOS }, null, 2),
};
if (!/"tasaMN": \d+\.0/.test(CUERPOS['config.json']))
    throw new Error('el config.json de prueba no quedó con la tasa en formato Python');
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
        let cuerpo = null;
        if (ruta === 'productos.json' || ruta.startsWith('cambios/')) {
            try { cuerpo = JSON.parse(Buffer.from(JSON.parse(req.postData()).content, 'base64').toString('utf8')); }
            catch (e) {}
        }
        LOG.push({ tipo:'PUT', ruta, cuerpo });
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
// 4.5 s: la copia de grupos y Revolico baja en segundo plano a los 4 s, y
// tiene que haber llegado ya para no pisar lo que se fija aquí abajo.
await pagina.waitForTimeout(4500);
await pagina.evaluate(() => { document.getElementById('adminPanel').classList.remove('hidden'); });

/* Estado de partida: el catálogo completo cargado y UN precio cambiado de
   verdad. Marcar un producto como modificado sin tocarlo mide el caso "no
   cambió nada", que es justo el que la poda se salta: parecería estupendo y
   no probaría nada. */
await pagina.evaluate(async (GRUPOS_) => {
    const full = await (await fetch('productos-lite.json')).json();
    if (window.apReplaceProductos) window.apReplaceProductos(full.slice());
    else { productos.length = 0; full.forEach(p => productos.push(p)); }
    productos[0].precioActual = Number(productos[0].precioActual || 0) + 1;
    localStorage.setItem('gruposFB', JSON.stringify(GRUPOS_));
    localStorage.setItem('productosModificados', JSON.stringify([String(productos[0].id)]));
}, GRUPOS);
LOG.length = 0;
SITIO.length = 0;
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);

const gets = LOG.filter(x => x.tipo === 'GET');
const puts = LOG.filter(x => x.tipo === 'PUT');
const cuantos = (arr, ruta) => arr.filter(x => x.ruta === ruta).length;
const deCambios = arr => arr.filter(x => x.tipo === 'PUT' && x.ruta.startsWith('cambios/'));

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
ok(cuantos(puts, 'config.json') === 0,
   'config.json no cambió (solo su hora o 720.0 frente a 720): no se sube');
ok(cuantos(puts, 'grupos_facebook_config.json') === 0,
   'la lista de grupos no cambió: no se sube');
// Y lo que SÍ cambió, se sube: es la mitad que de verdad importa.
/* Y lo que SÍ cambió, se sube — pero solo eso. Subir productos.json entero
   eran ~540 KB en base64 por cambiar un precio; ahora va un fichero en
   cambios/ con el producto tocado, y regenerate-artifacts.yml lo aplica. */
ok(cuantos(puts, 'productos.json') === 0, 'productos.json entero ya no se sube desde el panel');
const _c1 = deCambios(LOG);
ok(_c1.length === 1, `el precio cambiado tiene que subir en UN fichero de cambios/ (van ${_c1.length})`);
const _PRIMERO = CATALOGO[0];
if (_c1[0] && _c1[0].cuerpo) {
    const c = _c1[0].cuerpo;
    ok(c.v === 1 && Array.isArray(c.productos) && c.productos.length === 1
       && String(c.productos[0].id) === String(_PRIMERO.id),
       'el fichero de cambios lleva solo el producto tocado: ' + JSON.stringify((c.productos||[]).map(p => p.id)));
    ok(c.productos[0] && c.productos[0].rev > 0, 'cada producto subido lleva su `rev`, para saber cuándo se aplicó');
    /* El contrato entre las dos mitades: lo que sube el panel, aplicado por
       scripts/aplicar_cambios.py al catálogo del repo, tiene que dar
       EXACTAMENTE lo que el panel habría subido entero (su memoria tras
       publicar). Si no, la tienda muestra otra cosa que el panel. */
    const { execFileSync } = await import('node:child_process');
    const aplicado = JSON.parse(execFileSync('python3', ['-c',
        'import sys,json; sys.path.insert(0,"scripts"); import aplicar_cambios as a; '
        + 'd=json.load(sys.stdin); print(json.dumps(a.aplicar(d["cat"], [("x.json", d["cambio"])]), ensure_ascii=False))'],
        { cwd: RAIZ, input: JSON.stringify({ cat: CATALOGO, cambio: c }) }).toString());
    const memoria = await pagina.evaluate(() => JSON.parse(JSON.stringify(productos)));
    const sinRev = arr => arr.map(p => { const { rev, ...r } = p; return JSON.stringify(Object.keys(r).sort().reduce((o, k) => (o[k] = r[k], o), {})); });
    const a = sinRev(aplicado), m = sinRev(memoria);
    const distintos = a.filter((x, i) => x !== m[i]).length;
    ok(a.length === m.length && distintos === 0,
       `aplicar el fichero de cambios al repo no da lo que el panel tiene: ${distintos} producto(s) distintos de ${a.length} (${m.length} en el panel)`);
    const kb = Buffer.byteLength(JSON.stringify(c, null, 2)) / 1024;
    ok(kb < 20, `cambiar un precio no puede costar ${kb.toFixed(0)} KB de subida`);
}
/* Y el lite NO se sube desde el panel: son 475 KB en cada publicación para
   ahorrarle al cliente 9 KB comprimidos, y regenerate-artifacts.yml ya lo
   deriva de este mismo push. Subirlo era además la forma de que los dos
   catálogos quedaran descompasados — pasó: el lite del repo tenía el stock
   viejo de dos productos y la tienda ofrecía un router agotado. */
ok(cuantos(puts, 'productos-lite.json') === 0,
   'el lite lo deriva CI de productos.json; subirlo desde el móvil es medio mega de más');

// ── 4. El total ──────────────────────────────────────────────────────────
/* El número exacto depende de cuántos ficheros cambien; el tope es lo que
   vigila que no vuelvan a colarse idas y vueltas de más. Antes eran 14. */
ok(LOG.length <= 9, `cambiar un producto no puede costar ${LOG.length} peticiones a GitHub`);

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
ok(deCambios(LOG).length === 0 && cuantos(LOG.filter(x => x.tipo === 'PUT'), 'productos.json') === 0,
   'sin tocar nada, el segundo "Actualizar tienda" no vuelve a subir el catálogo');
ok(LOG.filter(x => x.tipo === 'PUT').length === 0,
   'sin tocar nada, el segundo "Actualizar tienda" no sube ningún fichero: '
   + LOG.filter(x => x.tipo === 'PUT').map(x => x.ruta).join(', '));

// ── 7. Lo que el panel no llegó a cargar no se sube vacío ───────────────
/* Móvil recién estrenado o 3G que se cayó: la copia de grupos no bajó y la
   de banners es la de la tienda (vieja o ninguna). Publicar "todo" (sin
   productos marcados) subía [] o la lista vieja encima de la buena: la
   portada se quedaba sin banners, o volvían los que se acababan de quitar
   desde la pestaña Publicar. */
LOG.length = 0;
await pagina.evaluate(() => {
    localStorage.removeItem('gruposFB');
    localStorage.setItem('heroBanners', '[]');
    localStorage.setItem('revolicoConfig', '{}');
    localStorage.setItem('productosModificados', '[]');   // → camino "subir todo"
});
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);
for (const f of ['banners.json', 'revolico_config.json', 'grupos_facebook_config.json'])
    ok(cuantos(LOG.filter(x => x.tipo === 'PUT'), f) === 0,
       `${f} no se puede pisar desde "Actualizar tienda" con una copia vacía o vieja`);

// ── 8. Lo borrado en otro sitio no vuelve; lo nuevo de aquí sí sube ──────
/* La fusión con el repo conservaba lo AÑADIDO en otro dispositivo pero no
   respetaba lo BORRADO: un panel abierto desde antes del borrado lo volvía a
   subir en la siguiente publicación. El caso contrario tiene que seguir
   funcionando: un producto recién creado aquí tampoco está en el repo. */
const BORRADO = CATALOGO[5];
CUERPOS['productos.json'] = JSON.stringify(CATALOGO.filter(p => p.id !== BORRADO.id), null, 2);
LOG.length = 0;
const idNuevo = await pagina.evaluate((idBorrado) => {
    const enMemoria = productos.some(p => String(p.id) === String(idBorrado));
    const nuevo = Object.assign({}, productos[1], { id: 4242424242424, nombre: 'Producto recién creado' });
    productos.push(nuevo);
    marcarProductoModificado(nuevo.id);           // lo que hace el formulario al crear
    return enMemoria ? nuevo.id : null;
}, BORRADO.id);
ok(idNuevo, 'el producto borrado en el repo tiene que seguir en la memoria del panel (si no, esto no prueba nada)');
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);
const _c8 = (deCambios(LOG)[0] || {}).cuerpo;
const subido = _c8 && _c8.productos;
ok(Array.isArray(subido), 'con un producto nuevo, tiene que subir un fichero de cambios');
if (Array.isArray(subido)) {
    ok(!subido.some(p => String(p.id) === String(BORRADO.id)),
       'un producto borrado desde otro dispositivo no puede volver a subirse desde este panel');
    ok(subido.some(p => String(p.id) === String(idNuevo)),
       'el producto recién creado aquí tiene que subirse, aunque no esté en el repo');
    // Y dónde va: el workflow lo coloca detrás del que tenía delante en el
    // panel ("Nuevo producto" al final, "Duplicar" arriba).
    ok(_c8.posiciones && String(idNuevo) in _c8.posiciones,
       'un producto nuevo tiene que llevar su posición en el fichero de cambios');
}

// ── 9. Publicar otra vez antes de que el workflow aplique lo anterior ────
/* Entre subir cambios/ y que regenerate-artifacts los aplique pasa un
   minuto, y el dueño publica varias veces seguidas (cuatro en tres minutos,
   visto en el historial). En ese minuto productos.json del repo es el viejo:
   fusionar contra él devolvía a la memoria el precio de antes, y cambiar
   luego el stock del mismo producto subía ese precio viejo de vuelta. */
const PRECIO_PUBLICADO = Number(_PRIMERO.precioActual || 0) + 1;
LOG.length = 0;
await pagina.evaluate((id) => {
    const p = productos.find(x => String(x.id) === String(id));
    p.stock = Number(p.stock || 0) + 5;
    marcarProductoModificado(p.id);
}, _PRIMERO.id);
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);
const _c9 = (deCambios(LOG)[0] || {}).cuerpo;
const _p9 = _c9 && (_c9.productos || []).find(p => String(p.id) === String(_PRIMERO.id));
ok(_p9 && Number(_p9.precioActual) === PRECIO_PUBLICADO,
   `publicar otra vez antes de que se aplique lo anterior no puede devolver el precio viejo (${_p9 && _p9.precioActual} en vez de ${PRECIO_PUBLICADO})`);
ok(_p9 && Number(_p9.stock) === Number(_PRIMERO.stock || 0) + 5, 'y el stock nuevo tiene que ir');

// El workflow aplica: el repo ya lo refleja, y sale de pendientes.
CUERPOS['productos.json'] = JSON.stringify(JSON.parse(CUERPOS['productos.json'])
    .map(p => String(p.id) === String(_PRIMERO.id) ? _p9 : p), null, 2);
LOG.length = 0;
await pagina.evaluate(() => sincronizarTodoConGitHub());
await pagina.waitForTimeout(300);
const _siguen = await pagina.evaluate(() =>
    Object.keys((JSON.parse(localStorage.getItem('tm_cambios_pendientes') || '{}').productos) || {}));
ok(_p9 && !_siguen.includes(String(_PRIMERO.id)), 'lo que el repo ya refleja deja de estar pendiente');
ok(deCambios(LOG).length === 0 || !(deCambios(LOG)[0].cuerpo.productos || []).some(p => String(p.id) === String(_PRIMERO.id)),
   'y no se vuelve a subir');

ok(erroresJs.length === 0, 'errores JS en el panel: ' + erroresJs.slice(0,2).join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`\n❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ publicar rápido: ${LOG.length} peticiones en el segundo intento, todo comprobado.`);
