/* 🏷️ Categorías: tres fallos que el dueño reportó y que no daban ningún error.
 *
 *  1. Agregar subcategorías «se pasaba a otra categoría»: cada alta redibujaba
 *     el formulario y el selector volvía a la primera.
 *  2. El color de una categoría nueva salía igual al de otra (un hash sobre 15
 *     tonos más coincidencia parcial de subcadenas) y no había dónde elegirlo.
 *  3. Una categoría/subcategoría recién creada no salía en los selectores del
 *     producto (el del modal de editar solo listaba las que ya tenían producto).
 *
 * Se prueba en el panel real con un GitHub de mentira que RECUERDA lo que se
 * sube, y en la tienda real leyendo ese mismo categorias.json.
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

const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    try { const b = await readFile(normalize(join(RAIZ, decodeURIComponent(p)))); r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const leer = async n => JSON.parse(await readFile(join(RAIZ, n), 'utf8'));
const CATALOGO = await leer('productos.json');
const CAT0 = await leer('categorias.json');
const REPO = {
    'productos.json':     JSON.stringify(CATALOGO, null, 2),
    'categorias.json':    JSON.stringify(CAT0, null, 2),
    'subcategorias.json': JSON.stringify(await leer('subcategorias.json'), null, 2),
    'config.json':        JSON.stringify(await leer('config.json'), null, 2),
};
const b64 = t => Buffer.from(t, 'utf8').toString('base64');
const shaGit = t => { const b = Buffer.from(t, 'utf8'); return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex'); };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 1400 }, serviceWorkers: 'block' });
await ctx.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com' && !u.hostname.includes('firebaseio.com') && !u.hostname.includes('raw.githubusercontent'), r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
// El «sitio» también sirve lo que hay en el repo (aquí no hay retraso de Pages: eso ya lo prueba catsub_check).
await ctx.route(u => u.hostname.includes('localhost') && /\/(categorias|subcategorias)\.json$/.test(u.pathname), r => {
    const n = r.request().url().split('?')[0].split('/').pop();
    return r.fulfill({ status: 200, contentType: 'application/json', body: REPO[n] });
});
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
    if (sessionStorage.getItem('_catcol_init')) return;
    sessionStorage.setItem('_catcol_init', '1');
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
const repoCats = () => JSON.parse(REPO['categorias.json']);
const repoSubs = () => JSON.parse(REPO['subcategorias.json']);
const esperar = (p, ms) => p.waitForTimeout(ms);

let pag = await abrir();
const NOMBRES = CAT0.nombres;
const CAT3 = NOMBRES[2];

/* ── 1) Tres subcategorías seguidas en la 3ª categoría ───────────────────── */
await pag.evaluate(() => { go('categorias'); catSwitch('sub'); });
await pag.selectOption('#newSubCat', CAT3);
for (const [i, nom] of ['SUBPRUEBA A', 'SUBPRUEBA B', 'SUBPRUEBA C'].entries()) {
    await pag.fill('#newSubName', nom);
    if (i < 2) await pag.click('#cat-list button[onclick="subAgregar()"]');
    else await pag.press('#newSubName', 'Enter');
    const est = await pag.evaluate(() => ({ cat: document.getElementById('newSubCat').value, nombre: document.getElementById('newSubName').value, foco: document.activeElement && document.activeElement.id }));
    ok(est.cat === CAT3, `tras agregar «${nom}» el selector saltó a «${est.cat}» en vez de seguir en «${CAT3}».`);
    ok(est.nombre === '', `tras agregar «${nom}» el campo del nombre no quedó vacío.`);
    ok(est.foco === 'newSubName', `tras agregar «${nom}» el foco no quedó en el campo del nombre (está en «${est.foco}»).`);
}
const subsLocal = await pag.evaluate(c => (JSON.parse(localStorage.getItem('subcategorias') || '{}')[c]) || [], CAT3);
ok(['SUBPRUEBA A', 'SUBPRUEBA B', 'SUBPRUEBA C'].every(s => subsLocal.includes(s)), `las tres subcategorías no quedaron en «${CAT3}»: ${JSON.stringify(subsLocal.filter(s => /PRUEBA/.test(s)))}.`);
const otras = await pag.evaluate(c => { const m = JSON.parse(localStorage.getItem('subcategorias') || '{}'); return Object.keys(m).filter(k => k !== c && (m[k] || []).some(s => /SUBPRUEBA/.test(s))); }, CAT3);
ok(otras.length === 0, `alguna subcategoría cayó en otra categoría: ${otras}.`);
await esperar(pag, 6500);
ok(['SUBPRUEBA A', 'SUBPRUEBA B', 'SUBPRUEBA C'].every(s => (repoSubs()[CAT3] || []).includes(s)), 'las subcategorías no llegaron al repo.');

/* ── 2) Elegir un color ───────────────────────────────────────────────────── */
const CATCOLOR = 'MOTOS';                      // con stock: su tarjeta sale en el inicio de la tienda
const ELEGIDO = '#12ab34';
await pag.evaluate(() => { go('categorias'); catSwitch('cat'); });
await pag.evaluate(([c, h]) => {
    const inp = [...document.querySelectorAll('#cat-list input.cat-col-in')].find(i => i.getAttribute('aria-label') === 'Color de ' + c);
    inp.value = h; inp.dispatchEvent(new Event('change', { bubbles: true }));
}, [CATCOLOR, ELEGIDO]);
ok(await pag.evaluate(c => { const i = [...document.querySelectorAll('#cat-list input.cat-col-in')].find(x => x.getAttribute('aria-label') === 'Color de ' + c); return i && i.value; }, CATCOLOR) === ELEGIDO, 'el selector de color no muestra el color elegido.');
await esperar(pag, 6500);
let rc = repoCats();
ok(rc.colores && rc.colores[CATCOLOR] === ELEGIDO.toUpperCase(), `el color no llegó a categorias.json (${JSON.stringify(rc.colores)}).`);
ok(JSON.stringify(rc.nombres) === JSON.stringify(CAT0.nombres) && JSON.stringify(rc.iconos) === JSON.stringify(CAT0.iconos) && JSON.stringify(rc.apagadas) === JSON.stringify(CAT0.apagadas),
   'publicar el color cambió nombres, iconos o apagadas.');

// Otro escritor de categorias.json: apagar una categoría. El color no puede perderse.
await pag.evaluate(() => catApToggle('CELULARES'));
await esperar(pag, 7000);
rc = repoCats();
ok(rc.colores && rc.colores[CATCOLOR] === ELEGIDO.toUpperCase(), 'apagar una categoría borró el color del repo.');
ok(rc.apagadas && rc.apagadas.categorias.CELULARES.off === true, 'apagar una categoría no llegó al repo.');
// «Actualizar tienda» reescribe el fichero entero.
await pag.evaluate(() => { productos.length && (productos[0].precioActual = Number(productos[0].precioActual || 0) + 1); localStorage.setItem('productosModificados', JSON.stringify([String(productos[0].id)])); });
await pag.evaluate(() => sincronizarTodoConGitHub());
await esperar(pag, 6000);
rc = repoCats();
ok(rc.colores && rc.colores[CATCOLOR] === ELEGIDO.toUpperCase(), '«Actualizar tienda» borró el color elegido de categorias.json.');
ok(rc.apagadas && rc.apagadas.categorias.CELULARES.off === true && rc.iconos && Object.keys(rc.iconos).length === Object.keys(CAT0.iconos).length, '«Actualizar tienda» perdió apagadas o iconos al llevar el color.');

// Un color recién elegido, aún sin subir (el guardado propio espera 4 s), tiene que viajar
// en «Actualizar tienda»: si no, esa publicación lo dejaría fuera del repo.
await pag.evaluate(() => { catColElegir('GYM', '#aa11bb'); });
await pag.evaluate(() => { productos.length && (productos[0].precioActual = Number(productos[0].precioActual || 0) + 1); localStorage.setItem('productosModificados', JSON.stringify([String(productos[0].id)])); });
await pag.evaluate(() => sincronizarTodoConGitHub());
await esperar(pag, 1500);
ok(repoCats().colores && repoCats().colores.GYM === '#AA11BB', '«Actualizar tienda» no llevó un color elegido que aún no se había subido.');
await esperar(pag, 5000);
ok(repoCats().colores && repoCats().colores.GYM === '#AA11BB' && repoCats().colores[CATCOLOR], 'tras el guardado propio el color de GYM o el de MOTOS se perdieron.');
await pag.evaluate(() => catColAuto('GYM'));   // GYM vuelve a su color de siempre para la comprobación del punto 3

// La tienda real, leyendo ese categorias.json, pinta la tarjeta con ese color.
const tienda = await ctx.newPage();
tienda.on('pageerror', e => erroresJs.push('tienda: ' + String(e).slice(0, 200)));
await tienda.goto(`http://localhost:${PUERTO}/index.html`);
await tienda.waitForTimeout(6000);
const colorTarjeta = n => tienda.evaluate(nom => {
    const c = [...document.querySelectorAll('.categoria-card')].find(x => (x.textContent || '').toLowerCase().includes(nom.toLowerCase()));
    return c ? c.style.getPropertyValue('--cat-color').trim().toLowerCase() : null;
}, n);
ok(await colorTarjeta(CATCOLOR) === ELEGIDO, `la tienda no pinta la tarjeta de ${CATCOLOR} con el color elegido (${await colorTarjeta(CATCOLOR)}).`);
// «Volver a automático»: el color elegido se va y la tarjeta recupera el de siempre.
await tienda.close();
await pag.evaluate(c => catColAuto(c), CATCOLOR);
await esperar(pag, 6500);
rc = repoCats();
ok(!(rc.colores && rc.colores[CATCOLOR]), 'volver a automático no quitó el color del repo.');
const tienda2 = await ctx.newPage();
await tienda2.goto(`http://localhost:${PUERTO}/index.html`);
await tienda2.waitForTimeout(6000);
const motos2 = await tienda2.evaluate(() => { const c = [...document.querySelectorAll('.categoria-card')].find(x => /motos/i.test(x.textContent || '')); return c ? c.style.getPropertyValue('--cat-color').trim().toLowerCase() : null; });
ok(motos2 === '#ff6b1a', `tras volver a automático MOTOS debería recuperar su color de siempre (#ff6b1a) y tiene ${motos2}.`);
await tienda2.close();

/* ── 3) Una categoría nueva sin color no repite ninguno ────────────────────── */
const SIEMPRE = { WIFI: '#3B82F6', ENERGIA: '#F59E0B', CELULARES: '#A855F7', UTILES: '#06B6D4', CARROS: '#6366F1', ROPA: '#D946EF', SEGURIDAD: '#EF4444', HOGAR: '#14B8A6', JUEGOS: '#EAB308', MOTOS: '#FF6B1A', 'PC Y LAPTOPS': '#EC4899', GYM: '#22C55E', AUDIO: '#F43F5E', TARJETAS: '#84CC16' };
const nuevas = ['ZZNUEVA UNO', 'ZZNUEVA DOS', 'ZZNUEVA TRES'];
await pag.evaluate(() => { go('categorias'); catSwitch('cat'); });
for (const n of nuevas) {
    await pag.fill('#newCategoryName', n);
    await pag.click('#cat-list button[onclick="catAgregar()"]');
    await esperar(pag, 400);
}
const colores = await pag.evaluate(() => {
    const o = {}; JSON.parse(localStorage.getItem('categorias') || '[]').forEach(c => { o[c] = String(tmColorTiendaCategoria(c)).toUpperCase(); }); return o;
});
for (const [c, h] of Object.entries(SIEMPRE)) ok(colores[c] === h, `${c} debía conservar su color de siempre ${h} y tiene ${colores[c]}.`);
const vistos = {};
Object.entries(colores).forEach(([c, h]) => { (vistos[h] = vistos[h] || []).push(c); });
const repetidos = Object.entries(vistos).filter(([, l]) => l.length > 1);
ok(repetidos.length === 0, `hay categorías con el mismo color: ${JSON.stringify(repetidos)}.`);
ok(nuevas.every(n => colores[n]), 'una categoría nueva se quedó sin color.');
// El color elegido de una categoría tampoco se lo roba el automático de otra.
await pag.evaluate(c => catColElegir(c, '#0ea5e9'), nuevas[0]);
const col2 = await pag.evaluate(() => { const o = {}; JSON.parse(localStorage.getItem('categorias') || '[]').forEach(c => { o[c] = String(tmColorTiendaCategoria(c)).toUpperCase(); }); return o; });
const v2 = {}; Object.entries(col2).forEach(([c, h]) => { (v2[h] = v2[h] || []).push(c); });
ok(Object.values(v2).every(l => l.length === 1), `con un color elegido hay categorías repetidas: ${JSON.stringify(Object.entries(v2).filter(([, l]) => l.length > 1))}.`);
await esperar(pag, 7000);

/* ── 4) La categoría y la subcategoría nuevas salen en los selectores del producto ── */
const SUBNUEVA = 'SUBDELANUEVA';
await pag.evaluate(() => catSwitch('sub'));
await pag.selectOption('#newSubCat', nuevas[1]);
await pag.fill('#newSubName', SUBNUEVA);
await pag.click('#cat-list button[onclick="subAgregar()"]');
await esperar(pag, 6500);
const revisarSelectores = async (p, cuando) => {
    const r = await p.evaluate(async ([cat, sub]) => {
        const id = String(PRODUCTOS[0].id);
        apEdit(id);
        const sc = document.getElementById('pedit-cat');
        const tieneCat = [...sc.options].some(o => o.value === cat);
        sc.value = cat; sc.dispatchEvent(new Event('change', { bubbles: true }));
        const tieneSub = [...document.getElementById('pedit-subcat').options].some(o => o.value === sub);
        apEditClose();
        const nuevoCat = document.getElementById('productCategory');
        const nTieneCat = !!nuevoCat && [...nuevoCat.options].some(o => o.value === cat);
        if (nuevoCat) { nuevoCat.value = cat; nuevoCat.dispatchEvent(new Event('change', { bubbles: true })); }
        const nTieneSub = [...document.getElementById('productSubcategory').options].some(o => o.value === sub);
        return { tieneCat, tieneSub, nTieneCat, nTieneSub };
    }, [nuevas[1], SUBNUEVA]);
    ok(r.tieneCat, `${cuando}: la categoría nueva no sale en el selector del modal de editar producto.`);
    ok(r.tieneSub, `${cuando}: la subcategoría nueva no sale en el selector del modal de editar producto.`);
    ok(r.nTieneCat, `${cuando}: la categoría nueva no sale en el formulario de producto nuevo.`);
    ok(r.nTieneSub, `${cuando}: la subcategoría nueva no sale en el formulario de producto nuevo.`);
};
await revisarSelectores(pag, 'al instante');
await pag.close();
pag = await abrir();
await revisarSelectores(pag, 'tras recargar');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('❌ categorías (selector, color, selectores de producto):\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ categorías: se sigue en la misma, el color se elige y no se repite, lo nuevo sale en los selectores');
