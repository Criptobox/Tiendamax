/* Categorías y subcategorías: que lo que editas en el panel se quede.
 *
 * El dueño editaba una subcategoría, volvía a entrar y seguía igual. Había tres
 * causas, y las tres son silenciosas (no sale ningún error):
 *
 *  1. Al abrir el panel, las categorías y subcategorías se leían SIEMPRE del
 *     repo, encima de lo editado y aún sin publicar.
 *  2. Las subcategorías se fusionaban con el repo por UNIÓN: lo borrado o
 *     renombrado en el panel volvía en la siguiente publicación, porque el
 *     repo todavía lo tenía. (Con las categorías pasaba igual: la lista de
 *     «eliminadas» se leía pero nadie la escribía.)
 *  3. Si en la misma publicación había un producto modificado —y renombrar una
 *     subcategoría los modifica— `subcategorias.json` ni se subía.
 *
 * Se prueba con un GitHub de mentira que RECUERDA lo que se sube.
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
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };

// El «sitio» (Pages) sirve los ficheros del disco: es la copia que se queda atrás un rato.
const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    try { const b = await readFile(normalize(join(RAIZ, decodeURIComponent(p)))); r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const leer = async n => JSON.parse(await readFile(join(RAIZ, n), 'utf8'));
const CATALOGO = await leer('productos.json');
// El «repo»: lo que hay publicado. Los PUT lo cambian.
const REPO = {
    'productos.json':     JSON.stringify(CATALOGO, null, 2),
    'categorias.json':    JSON.stringify(await leer('categorias.json'), null, 2),
    'subcategorias.json': JSON.stringify(await leer('subcategorias.json'), null, 2),
    'config.json':        JSON.stringify(await leer('config.json'), null, 2),
};
const b64 = t => Buffer.from(t, 'utf8').toString('base64');
const shaGit = t => { const b = Buffer.from(t, 'utf8'); return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex'); };
const PUTS = [];

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 1400 }, serviceWorkers: 'block' });
await ctx.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com' && !u.hostname.includes('firebaseio.com') && !u.hostname.includes('raw.githubusercontent'), r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
await ctx.route(u => u.hostname.includes('raw.githubusercontent'), r => {
    const ruta = (r.request().url().split('/main/')[1] || '').split('?')[0];
    return r.fulfill({ status: 200, contentType: 'application/json', body: REPO[ruta] || 'null' });
});
await ctx.route(u => u.hostname === 'api.github.com', r => {
    const req = r.request(), url = req.url();
    const ruta = (url.split('/contents/')[1] || '').split('?')[0];
    if (req.method() === 'PUT') {
        let txt = null;
        try { txt = Buffer.from(JSON.parse(req.postData()).content, 'base64').toString('utf8'); } catch (e) {}
        if (txt !== null && !ruta.startsWith('cambios/')) REPO[ruta] = txt;
        PUTS.push(ruta);
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: shaGit(txt || '') } }) });
    }
    if (url.includes('/contents/')) {
        if (!ruta) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.keys(REPO).map(n => ({ name: n, path: n, type: 'file', sha: shaGit(REPO[n]) }))) });
        const c = REPO[ruta];
        return r.fulfill({ status: 200, contentType: 'application/json', body: c ? JSON.stringify({ sha: shaGit(c), encoding: 'base64', content: b64(c) }) : JSON.stringify({ sha: 'sin' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
});

await ctx.addInitScript(() => {
    if (sessionStorage.getItem('_catsub_init')) return;   // solo la primera carga: lo demás ya vive en localStorage
    sessionStorage.setItem('_catsub_init', '1');
    localStorage.setItem('githubUser', 'quien'); localStorage.setItem('githubRepo', 'repo'); localStorage.setItem('githubToken', 'ghp_de_mentira');
});
const erroresJs = [];
const abrir = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
    p.on('dialog', d => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
    await p.goto(`http://localhost:${PUERTO}/admin.html`);
    await p.waitForTimeout(4500);
    await p.evaluate(() => { document.getElementById('adminPanel').classList.remove('hidden'); document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.remove()); });
    return p;
};
// El panel vive dentro de una función: se lee lo que ENSEÑA la pantalla, que es lo que ve el dueño.
const textoVista = (p, vista) => p.evaluate(v => { go('categorias'); catSwitch(v); return document.getElementById('cat-list').innerText; }, vista);
const subVisible = async (p, nombre) => (await textoVista(p, 'sub')).includes(nombre);
const catVisible = async (p, nombre) => (await textoVista(p, 'cat')).includes(nombre);
const nombresCat = p => p.evaluate(() => JSON.parse(localStorage.getItem('categorias') || '[]'));
const repoSubs = () => JSON.parse(REPO['subcategorias.json']);
const repoCats = () => JSON.parse(REPO['categorias.json']);
const esperar = (p, ms) => p.waitForTimeout(ms);

let pag = await abrir();
const CAT = (await nombresCat(pag))[0] || JSON.parse(REPO['categorias.json']).nombres[0];
ok(!!CAT, 'no hay categorías de partida');

// 1) Agrego una subcategoría. Debe verse al instante y TAMBIÉN al volver a entrar.
await pag.evaluate(c => { go('categorias'); catSwitch('sub'); }, CAT);
await pag.evaluate(([c]) => { document.getElementById('newSubCat').value = c; document.getElementById('newSubName').value = 'PRUEBA NUEVA'; subAgregar(); }, [CAT]);
ok(await subVisible(pag, 'PRUEBA NUEVA'), 'la subcategoría nueva no sale en la pantalla.');
await esperar(pag, 7000);                       // el guardado automático
ok((repoSubs()[CAT] || []).includes('PRUEBA NUEVA'), 'la subcategoría nueva no llegó al repo sin pulsar «Actualizar tienda».');
await pag.close();
pag = await abrir();                            // «vuelvo a entrar»
ok(await subVisible(pag, 'PRUEBA NUEVA'), 'al volver a entrar la subcategoría nueva ya no está.');

// 2) Renombrar: no se publica solo (cambia también los productos), pero tiene que
//    SOBREVIVIR a volver a entrar, y al pulsar «Actualizar tienda» el nombre viejo no puede volver.
await pag.evaluate(([c, s]) => { window.prompt = () => 'PRUEBA RENOMBRADA'; go('categorias'); catSwitch('sub'); subRenombrar(c, s); }, [CAT, 'PRUEBA NUEVA']);
await esperar(pag, 6000);
ok((repoSubs()[CAT] || []).includes('PRUEBA NUEVA'), 'renombrar se publicó solo: dejaría la tienda con un nombre nuevo y los productos con el viejo.');
ok(/Actualizar tienda/.test(await pag.evaluate(() => document.getElementById('catsub-estado').innerText)), 'no avisa de que el renombrado espera a «Actualizar tienda».');
await pag.close(); pag = await abrir();
ok(!(await subVisible(pag, 'PRUEBA NUEVA')) && await subVisible(pag, 'PRUEBA RENOMBRADA'), 'al volver a entrar el renombrado sin publicar se perdió.');
await pag.evaluate(() => sincronizarTodoConGitHub());
await esperar(pag, 5000);
let subs = repoSubs()[CAT] || [];
ok(!subs.includes('PRUEBA NUEVA') && subs.includes('PRUEBA RENOMBRADA'), `tras «Actualizar tienda» el nombre viejo volvió o el nuevo no llegó (${JSON.stringify(subs.filter(x => /PRUEBA/.test(x)))}).`);
await pag.close(); pag = await abrir();
ok(!(await subVisible(pag, 'PRUEBA NUEVA')) && await subVisible(pag, 'PRUEBA RENOMBRADA'), 'tras publicar y volver a entrar reapareció el nombre viejo o falta el nuevo.');

// 3) Borrar una subcategoría y publicar con un producto modificado: no puede volver ni quedarse sin subirse.
const ELEGIDA = 'PRUEBA RENOMBRADA';
await pag.evaluate(([c, s]) => { go('categorias'); catSwitch('sub'); subBorrar(c, s); }, [CAT, ELEGIDA]);
await pag.evaluate(() => { productos.length && (productos[0].precioActual = Number(productos[0].precioActual || 0) + 1); localStorage.setItem('productosModificados', JSON.stringify([String(productos[0].id)])); });
await pag.evaluate(() => sincronizarTodoConGitHub());
await esperar(pag, 5000);
ok(!(repoSubs()[CAT] || []).includes(ELEGIDA), 'borrar una subcategoría no llegó al repo (o volvió) al publicar junto a un producto modificado.');

// 4) Categorías: agregar, renombrar y borrar, siempre con la vuelta a entrar.
await pag.evaluate(() => { go('categorias'); catSwitch('cat'); });
await pag.evaluate(() => { document.getElementById('newCategoryName').value = 'CATPRUEBA'; catAgregar(); });
await esperar(pag, 7000);
ok(repoCats().nombres.includes('CATPRUEBA'), 'la categoría nueva no llegó al repo.');
await pag.close(); pag = await abrir();
ok(await catVisible(pag, 'CATPRUEBA'), 'al volver a entrar la categoría nueva ya no está.');
await pag.evaluate(() => { window.prompt = () => 'CATRENOMBRADA'; catRenombrar('CATPRUEBA'); });
await esperar(pag, 6000);
ok(repoCats().nombres.includes('CATPRUEBA'), 'renombrar la categoría se publicó solo.');
await pag.close(); pag = await abrir();
ok(await catVisible(pag, 'CATRENOMBRADA') && !(await catVisible(pag, 'CATPRUEBA')), 'al volver a entrar el renombrado de categoría sin publicar se perdió.');
await pag.evaluate(() => sincronizarTodoConGitHub());
await esperar(pag, 5000);
let cn = repoCats().nombres;
ok(cn.includes('CATRENOMBRADA') && !cn.includes('CATPRUEBA'), `renombrar categoría: el nombre viejo volvió o el nuevo no llegó (${JSON.stringify(cn.filter(x => /CAT/.test(x)))}).`);
await pag.evaluate(() => catBorrar('CATRENOMBRADA'));
await esperar(pag, 7000);
cn = repoCats().nombres;
ok(!cn.includes('CATRENOMBRADA'), 'borrar una categoría no llegó al repo (o volvió).');
await pag.close(); pag = await abrir();
ok(!(await catVisible(pag, 'CATRENOMBRADA')), 'al volver a entrar reapareció la categoría borrada.');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('❌ categorías y subcategorías:\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ categorías y subcategorías: lo editado se guarda, se publica y no vuelve');
