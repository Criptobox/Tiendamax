/* Publicar, segunda tanda — comprobado en el panel de verdad (admin.html).
 *
 * Todo lo de aquí falla sin un error:
 *
 *  - Los grupos se BORRABAN 4 s después de abrir el panel (tm-data copiaba
 *    encima el fichero vacío del repo). Ahora se fusionan por grupo, se suben
 *    solos, y borrar deja lápida para que el otro teléfono no los resucite.
 *  - Los posts salían SIN descripción: se leía el catálogo ligero.
 *  - Lo publicado que se agotó o cambió de precio sigue ahí diciendo lo
 *    viejo; el Copiloto tiene que saber dónde, y dejar de insistir cuando se
 *    arregla (y volver si se vuelve a romper).
 *  - Revólico para renovar.
 *  - El plan del día: dos pasos seguidos no repiten grupo ni producto, y el
 *    máximo de cada grupo cuenta lo que el propio plan le mete.
 *  - El orden por resultados: solo con datos; sin ellos, orden de siempre y
 *    decirlo — un fallo de red no es «este grupo no trae nada».
 *  - Ventas por grupo: opcional, solo con Facebook, y su código viaja a
 *    /ventas (nunca a /pedidos).
 *  - La hora a la que responde un grupo: solo con muestra suficiente.
 *
 * Firebase y GitHub se interceptan. Se corre solo
 * (`node tests/publicar_v2_check.mjs`) y desde unittest
 * (tests/test_publicar_v2.py). Sale con código 1 si algo falla.
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
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const conStock = CATALOGO.filter(p => Number(p.stock) > 0 && p.activo !== false && String(p.descripcion || '').trim().length > 40);
const AGOTADO = CATALOGO.find(p => Number(p.stock) <= 0 && p.activo !== false);
const [P1, P2, P3, P4] = conStock;
if (!AGOTADO || !P4) { console.log('catálogo sin los productos de prueba — se salta'); process.exit(0); }

const AHORA = Date.now(), DIA = 86400000;
const GRUPOS = [
    { nombre: 'Grupo A', url: 'https://www.facebook.com/groups/aaa/' },
    { nombre: 'Grupo B', url: 'https://www.facebook.com/groups/bbb/' },
    { nombre: 'Grupo C', url: 'https://www.facebook.com/groups/ccc/', maxDia: 1 },
];

// ── GitHub de mentira: lo que hay en el repo y lo que se sube ─────────────
const REPO = {
    // Lo que guardó «el otro teléfono»: tiene que sobrevivir a este guardado.
    'grupos_facebook_config.json': { grupos: [{ nombre: 'Del otro teléfono', url: 'https://www.facebook.com/groups/otro/', ts: AHORA - 5000 }], borrados: {} },
    // Y lo que el otro teléfono ya marcó como quitado: aquí no puede volver a avisar.
    'pub-resueltos.json': { resueltos: { [String(AGOTADO.id) + '|Grupo Z']: { tipo: 'agotado', ts: AHORA - DIA, precio: 0 } } },
};
const SUBIDAS = [];
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
// ── Firebase de mentira ─────────────────────────────────────────────────
let FB = { modo: 'ok', grupos: {} };
const DB = { ventas: {} };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 420, height: 900 } });
await ctx.route(u => !['localhost', 'api.github.com'].includes(u.hostname) && !u.hostname.endsWith('firebaseio.com'), r => r.abort());
await ctx.route(u => u.hostname === 'api.github.com', async r => {
    const url = new URL(r.request().url());
    const m = url.pathname.match(/\/contents\/(.+)$/);
    const metodo = r.request().method();
    if (!m) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
    const ruta = decodeURIComponent(m[1]);
    if (metodo === 'PUT') {
        const cuerpo = JSON.parse(r.request().postData() || '{}');
        const datos = JSON.parse(Buffer.from(cuerpo.content || '', 'base64').toString('utf8') || 'null');
        REPO[ruta] = datos;
        SUBIDAS.push({ ruta, datos });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'sha2' } }) });
    }
    if (!(ruta in REPO)) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ sha: 'sha1', encoding: 'base64', content: b64(JSON.stringify(REPO[ruta])) }) });
});
await ctx.route(u => u.hostname.endsWith('firebaseio.com'), r => {
    const url = new URL(r.request().url());
    const ruta = url.pathname.replace(/\.json$/, '').replace(/^\//, '');
    const metodo = r.request().method();
    if (ruta.startsWith('analytics/grupos')) {
        if (FB.modo === 'caido') return r.abort();
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FB.grupos) });
    }
    if (ruta.startsWith('ventas/') && (metodo === 'PUT' || metodo === 'POST')) {
        DB.ventas[ruta.split('/')[1]] = JSON.parse(r.request().postData() || 'null');
        return r.fulfill({ status: 200, contentType: 'application/json', body: r.request().postData() || 'null' });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
});

// El registro publicado del repo es el de verdad: aquí se prueba con uno propio.
await ctx.route(u => u.hostname === 'localhost' && u.pathname === '/publicaciones.json',
    r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"eventos":[]}' }));
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(({ GRUPOS, AHORA, DIA, AGOTADO, P2, P3 }) => {
    window.open = () => ({});
    window.confirm = () => false;
    if (sessionStorage.getItem('__montado')) return;
    sessionStorage.setItem('__montado', '1');
    localStorage.setItem('firebaseConfig', JSON.stringify({ databaseURL: 'https://prueba-default-rtdb.firebaseio.com' }));
    localStorage.setItem('githubUser', 'quien');
    localStorage.setItem('githubRepo', 'repo');
    localStorage.setItem('githubToken', 'ghp_de_mentira');
    localStorage.setItem('gruposFB', JSON.stringify(GRUPOS));
    localStorage.setItem('tm_publog_v1', JSON.stringify([
        // Agotado y publicado hace 2 días en el Grupo A: tiene que avisar.
        { pid: String(AGOTADO.id), red: 'fb', destino: 'Grupo A', ts: AHORA - 2 * DIA, precio: 10, moneda: 'USD' },
        // Ya quitado desde el otro teléfono (ver REPO['pub-resueltos.json']).
        { pid: String(AGOTADO.id), red: 'fb', destino: 'Grupo Z', ts: AHORA - 3 * DIA },
        // Un Estado de WhatsApp no es un post que siga vivo.
        { pid: String(AGOTADO.id), red: 'wa', destino: 'Estado WhatsApp', ts: AHORA - DIA },
        // Publicado a otro precio: tiene que avisar de corregirlo.
        { pid: String(P2.id), red: 'fb', destino: 'Grupo B', ts: AHORA - DIA, precio: Number(P2.precioActual) + 5, moneda: P2.moneda === 'MN' ? 'MN' : 'USD' },
        // Sin precio guardado: no se puede saber, así que no avisa.
        { pid: String(P2.id), red: 'fb', destino: 'Grupo A', ts: AHORA - DIA },
        // Revólico hace 9 días: toca renovar.
        { pid: String(P3.id), red: 'revolico', destino: 'Revolico', ts: AHORA - 9 * DIA },
    ]));
}, { GRUPOS, AHORA, DIA, AGOTADO, P2, P3 });
await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
await pagina.waitForTimeout(2500);
await pagina.evaluate(() => {
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
});

// ── 1) Los grupos ya no se borran al abrir el panel, y se suben fusionados ──
await pagina.waitForTimeout(9500);   // tm-data lee el repo a los 4 s; la subida espera otros 4
const g1 = await pagina.evaluate(() => ({
    local: JSON.parse(localStorage.getItem('gruposFB') || '[]').map(g => g.nombre),
    estado: typeof tmGruposEstadoTexto === 'function' ? tmGruposEstadoTexto() : '',
}));
ok(['Grupo A', 'Grupo B', 'Grupo C'].every(n => g1.local.includes(n)),
   `abrir el panel volvió a borrar los grupos: quedan ${JSON.stringify(g1.local)}`);
const subG = SUBIDAS.filter(s => s.ruta === 'grupos_facebook_config.json');
ok(subG.length >= 1, 'los grupos de este teléfono no se subieron solos al repositorio');
const ultG = subG[subG.length - 1];
const nombresRepo = ultG ? ultG.datos.grupos.map(g => g.nombre) : [];
ok(['Grupo A', 'Grupo B', 'Grupo C', 'Del otro teléfono'].every(n => nombresRepo.includes(n)),
   `el guardado tiene que FUSIONAR con lo que había en el repo, no pisarlo: subió ${JSON.stringify(nombresRepo)}`);
ok(g1.local.includes('Del otro teléfono'), 'lo que guardó el otro teléfono no llegó a este');
ok(/guardados/.test(g1.estado), `la línea de estado tiene que decir que se guardaron: «${g1.estado}»`);

const g2 = await pagina.evaluate(async () => {
    const gs = JSON.parse(localStorage.getItem('gruposFB'));
    const iA = gs.findIndex(g => g.nombre === 'Grupo A');
    actualizarGrupoFB(iA, 'maxDia', 5);
    const tsA = JSON.parse(localStorage.getItem('gruposFB'))[iA].ts;
    const iOtro = gs.findIndex(g => g.nombre === 'Del otro teléfono');
    const codOtro = tmGrupoCodigo(gs[iOtro]);
    eliminarGrupoFB(iOtro);
    await guardarGruposFB();
    // El repo (o Pages, con retraso) trae otra vez el grupo borrado, viejo.
    window.tmGruposDesdeRepo({ grupos: [{ nombre: 'Del otro teléfono', url: 'https://www.facebook.com/groups/otro/', ts: Date.now() - 5000 }] });
    return { tsA, codOtro, local: JSON.parse(localStorage.getItem('gruposFB')).map(g => g.nombre) };
});
ok(g2.tsA > AHORA, 'cambiar un grupo no le puso la hora: la fusión no sabría cuál es el bueno');
const ultG2 = SUBIDAS.filter(s => s.ruta === 'grupos_facebook_config.json').pop();
ok(ultG2 && !ultG2.datos.grupos.some(g => g.nombre === 'Del otro teléfono') && ultG2.datos.borrados[g2.codOtro] > 0,
   'borrar un grupo tiene que dejar lápida en el repo, o el otro teléfono lo vuelve a subir');
ok(!g2.local.includes('Del otro teléfono'), 'un grupo borrado resucitó al leer una copia vieja del repo');

// ── 2) Las descripciones llegan a los textos ─────────────────────────────
const desc = await pagina.evaluate(async (pid) => {
    const conDesc = (PRODUCTOS.find(p => String(p.id) === String(pid)) || {}).descripcion || '';
    previsualizarFacebook(pid, null);
    await new Promise(r => setTimeout(r, 200));
    const fb = document.getElementById('fbPostTA').value;
    cerrarFbPreview();
    previsualizarRevolico(pid);
    await new Promise(r => setTimeout(r, 200));
    const rev = document.getElementById('revDescTA').value;
    cerrarRevPreview();
    return { conDesc: conDesc.slice(0, 40), fb, rev };
}, P1.id);
ok(desc.conDesc && desc.fb.includes(desc.conDesc), 'el post de Facebook sale sin la descripción del producto');
ok(desc.conDesc && desc.rev.includes(desc.conDesc), 'el anuncio de Revólico sale sin la descripción del producto');

// ── 3) El registro guarda el precio y la marca del grupo ─────────────────
const reg = await pagina.evaluate((pid) => {
    const gs = JSON.parse(localStorage.getItem('gruposFB'));
    const iB = gs.findIndex(x => x.nombre === 'Grupo B'), g = gs[iB];
    copiarYAbrirFacebook(pid, g.url, iB);
    return new Promise(r => setTimeout(() => {
        const log = tmPublicaciones();
        const e = log[log.length - 1];
        tmRegistrarPublicacion(pid, 'fb', 'viejo', Date.now() - 3 * 86400000);
        const viejo = tmPublicaciones().find(x => x.destino === 'viejo');
        r({ e, cod: tmGrupoCodigo(g), precio: (PRODUCTOS.find(p => String(p.id) === String(pid)) || {}).precioActual, viejo });
    }, 300));
}, P4.id);
ok(reg.e && reg.e.destino === 'Grupo B' && Number(reg.e.precio) === Number(reg.precio),
   `lo publicado tiene que guardar el precio de ese momento: ${JSON.stringify(reg.e)}`);
ok(reg.e && reg.e.g === reg.cod, 'lo publicado en un grupo con enlaces tiene que guardar su marca');
ok(reg.viejo && !('precio' in reg.viejo), 'una publicación apuntada con fecha pasada no puede llevar el precio de hoy');

// ── 4) El Copiloto: agotados publicados, precio viejo, Revólico ──────────
const tareas = await pagina.evaluate(async () => {
    await tmCopilotRefresh(false);
    return tmCopilotoTareas().map(t => ({ kind: t.kind, title: t.title, detail: t.detail, tab: t.tab }));
});
const tk = k => tareas.find(t => t.kind === k);
ok(tk('pub-agotado') && /Grupo A/.test(tk('pub-agotado').detail), `falta el aviso de agotado publicado (y dónde): ${JSON.stringify(tareas.map(t => t.kind))}`);
ok(tk('pub-agotado') && !/Estado/.test(tk('pub-agotado').detail), 'un Estado de WhatsApp caduca solo: no hay nada que ir a borrar');
ok(tk('pub-agotado') && !/Grupo Z/.test(tk('pub-agotado').detail),
   'lo que el otro teléfono ya marcó como quitado volvió a salir aquí: lo resuelto no viaja entre teléfonos');
ok(tk('pub-precio') && /Grupo B/.test(tk('pub-precio').detail) && !/Grupo A/.test(tk('pub-precio').detail),
   'el precio viejo solo puede avisarse donde se guardó el precio: en el Grupo A no se sabe');
ok(tk('rev-renovar') && /hace 9 días/.test(tk('rev-renovar').detail), 'falta el aviso de renovar en Revólico');

// ── 5) La lista que abren, y resolver ────────────────────────────────────
const pv = await pagina.evaluate(async ({ AGOTADO, P2, P3 }) => {
    tmCopilotoAbrirTarea('pub-vivas');
    await new Promise(r => setTimeout(r, 200));
    const txt = document.getElementById('pvCuerpo').textContent;
    const quitar = document.querySelector(`[data-pv-resolver="agotado"][data-pid="${AGOTADO.id}"]`);
    quitar && quitar.click();
    const corregir = document.querySelector(`[data-pv-resolver="precio"][data-pid="${P2.id}"]`);
    corregir && corregir.click();
    const renovar = document.querySelector(`[data-pv-renovar="${P3.id}"]`);
    renovar && renovar.click();
    await new Promise(r => setTimeout(r, 100));
    const tras = document.getElementById('pvCuerpo').textContent;
    const v = tmPubVivas(), rv = tmRevPorRenovar();
    const log = tmPublicaciones();
    // Si el precio vuelve a cambiar, el aviso tiene que volver.
    const p2 = PRODUCTOS.find(p => String(p.id) === String(P2.id));
    const antes = p2.precioActual;
    p2.precioActual = Number(antes) + 1;
    try { productos.find(p => String(p.id) === String(P2.id)).precioActual = p2.precioActual; } catch (e) {}
    const vuelve = tmPubVivas().precios.some(x => String(x.p.id) === String(P2.id));
    p2.precioActual = antes;
    try { productos.find(p => String(p.id) === String(P2.id)).precioActual = antes; } catch (e) {}
    document.getElementById('pubVivasModal').remove();
    return { txt, tras, agot: v.agotados.length, prec: v.precios.length, renov: rv.length,
             renovado: log.some(e => e.pid === String(P3.id) && e.destino === 'Revolico (renovado)'), vuelve,
             hayBotonGrupo: !!quitar };
}, { AGOTADO, P2, P3 });
ok(/Agotados que siguen publicados/.test(pv.txt) && pv.txt.includes('Grupo A'), 'la lista no dice dónde sigue publicado el agotado');
ok(/Con el precio viejo/.test(pv.txt) && /dice \$/.test(pv.txt), 'la lista no dice qué precio sigue diciendo el post');
ok(/Revólico para renovar/.test(pv.txt), 'la lista no incluye lo que toca renovar');
ok(pv.agot === 0 && pv.prec === 0 && pv.renov === 0, `resolver no quitó los avisos: ${pv.agot} agotados, ${pv.prec} precios, ${pv.renov} por renovar`);
ok(pv.renovado, '«Lo renové» no quedó apuntado en el registro');
ok(/Nada que corregir/.test(pv.tras), `después de resolver todo tiene que decirlo: «${pv.tras.slice(0, 80)}»`);
ok(pv.vuelve, 'un precio corregido que vuelve a cambiar tiene que volver a avisar');

// Lo resuelto aquí sube al repositorio, fusionado con lo del otro teléfono.
await pagina.waitForTimeout(5000);
const subRes = SUBIDAS.filter(s => s.ruta === 'pub-resueltos.json').pop();
const claves = subRes ? Object.keys(subRes.datos.resueltos || {}) : [];
ok(claves.includes(String(AGOTADO.id) + '|Grupo A') && claves.includes(String(P2.id) + '|Grupo B'),
   `lo marcado aquí no subió al repositorio: ${JSON.stringify(claves)}`);
ok(claves.includes(String(AGOTADO.id) + '|Grupo Z'),
   'al subir lo de aquí se perdió lo que había marcado el otro teléfono');
const estadoRes = await pagina.evaluate(() => (window.tmPubResueltosEstado && window.tmPubResueltosEstado()) || '');
ok(/Guardado/.test(estadoRes), `la línea de estado tiene que decir que llegó: «${estadoRes}»`);

// ── 6) El plan del día ──────────────────────────────────────────────────
const plan = await pagina.evaluate(async (ids) => {
    localStorage.removeItem('tm_fb_pausa_hasta');
    // Grupo C tiene máximo 1 al día y hoy no lleva nada.
    await tmColaPlan(ids);
    await new Promise(r => setTimeout(r, 300));
    const its = _COLA.items.map(x => ({ p: String(x.p.id), g: x.g.nombre, estado: x.estado, motivo: x.motivo }));
    const titulo = document.querySelector('#fbColaModal .modal-content').textContent;
    cerrarColaGrupos();
    return { its, titulo };
}, [P1.id, P2.id, P4.id].map(String));
const pend = plan.its.filter(x => x.estado === 'pendiente');
let seguidos = 0;
for (let k = 1; k < plan.its.length; k++) {
    if (plan.its[k].g === plan.its[k - 1].g || plan.its[k].p === plan.its[k - 1].p) seguidos++;
}
ok(seguidos === 0, `el plan repite grupo o producto en dos pasos seguidos (${seguidos} veces): ${JSON.stringify(plan.its.map(x => x.g + '/' + x.p))}`);
ok(pend.filter(x => x.g === 'Grupo C').length === 1, 'el máximo de 1 al día del Grupo C tiene que contar lo que el propio plan le mete');
ok(plan.its.some(x => x.g === 'Grupo C' && /máximo de hoy/.test(x.motivo)), 'lo que no cabe en el máximo del grupo tiene que decir por qué');
ok(/Plan de hoy: 3 productos/.test(plan.titulo), 'el plan tiene que decir cuántos productos reparte');
const botonPlan = await pagina.evaluate(async () => {
    go('publicar');
    await new Promise(r => setTimeout(r, 800));
    return !!document.getElementById('pub-plan-btn');
});
ok(botonPlan, '«Hoy toca publicar» no ofrece el plan del día en tus grupos');

// ── 7) El orden por lo que trae cada grupo ───────────────────────────────
const cods = await pagina.evaluate(() => Object.fromEntries(
    JSON.parse(localStorage.getItem('gruposFB')).map(g => [g.nombre, tmGrupoCodigo(g)])));
FB.grupos = {
    [cods['Grupo B']]: { visitas: { count: 20 }, whatsapp: { count: 6 },
                         horas: { '20': { count: 6 }, '21': { count: 5 }, '09': { count: 1 } } },
    [cods['Grupo A']]: { visitas: { count: 0 }, whatsapp: { count: 0 } },
};
const orden = await pagina.evaluate(async ({ pid, cods }) => {
    // Tres publicaciones CON marca en A y en B; C sin datos.
    const log = tmPublicaciones().filter(e => !['Grupo A', 'Grupo B', 'Grupo C'].includes(e.destino) || e.pid !== 'x');
    const extra = [];
    for (let k = 0; k < 3; k++) {
        extra.push({ pid: 'otro' + k, red: 'fb', destino: 'Grupo A', ts: Date.now() - (20 + k) * 86400000, g: cods['Grupo A'] });
        extra.push({ pid: 'otro' + k, red: 'fb', destino: 'Grupo B', ts: Date.now() - (20 + k) * 86400000, g: cods['Grupo B'] });
    }
    localStorage.setItem('tm_publog_v1', JSON.stringify(log.concat(extra)));
    _gruposStatsCache = null;
    await tmColaGrupos(pid);
    const con = { orden: _COLA.items.map(x => x.g.nombre), notas: _COLA.items.map(x => x.nota),
                  nota: (document.getElementById('colaNota') || {}).textContent || '' };
    cerrarColaGrupos();
    return con;
}, { pid: String(P1.id), cods });
ok(orden.orden.join(',') === 'Grupo B,Grupo C,Grupo A',
   `con datos, primero el que trae, luego el que no tiene datos y al final el que no trae nada: ${orden.orden.join(',')}`);
ok(/ninguna visita/.test(orden.notas[2] || ''), 'el grupo que no trae nada tiene que decirlo');
ok(/Primero los grupos que más te traen/.test(orden.nota), 'la cola tiene que decir por qué va en ese orden');
FB.modo = 'caido';
const caido = await pagina.evaluate(async (pid) => {
    _gruposStatsCache = null;
    await tmColaGrupos(pid);
    const r = { orden: _COLA.items.map(x => x.g.nombre), nota: (document.getElementById('colaNota') || {}).textContent || '' };
    cerrarColaGrupos();
    return r;
}, String(P1.id));
FB.modo = 'ok';
ok(caido.orden.join(',') === 'Grupo A,Grupo B,Grupo C', `sin datos no se ordena por ellos: salió ${caido.orden.join(',')}`);
ok(/No pude leer/.test(caido.nota), 'con Firebase caído tiene que decir que el orden es el de siempre');

// ── 8) La tarjeta del grupo: ventas y hora ───────────────────────────────
const venta = await pagina.evaluate(async ({ cods, pid }) => {
    ventaOrigenTocar('facebook');
    const chips = document.getElementById('venta-origen').textContent;
    const pulsado = () => [...document.querySelectorAll('#venta-origen .vo-grupos .vo-chip[aria-pressed="true"]')].map(b => b.textContent).join(',');
    ventaGrupoTocar(cods['Grupo B']);
    const elegido = pulsado();
    ventaOrigenTocar('whatsapp');
    ventaOrigenTocar('facebook');
    const trasCambiar = pulsado();
    ventaOrigenTocar('facebook');
    registrarVentaPedido([{ productoId: pid, cantidad: 1 }], {}, { origen: 'facebook', grupo: cods['Grupo B'] });
    registrarVentaPedido([{ productoId: pid, cantidad: 1 }], {}, { origen: 'whatsapp', grupo: cods['Grupo B'] });
    registrarVentaPedido([{ productoId: pid, cantidad: 1 }], {}, { origen: 'facebook', grupo: 'Grupo B' });
    await new Promise(r => setTimeout(r, 1200));
    const todas = JSON.parse(localStorage.getItem('registroVentas') || '[]');
    const ventas = todas.slice(0, 3).concat(todas.slice(-3));
    try { VENTAS = JSON.parse(localStorage.getItem('registroVentas') || '[]'); } catch (e) {}
    _gruposStatsCache = null;
    renderizarGruposFB(JSON.parse(localStorage.getItem('gruposFB')));
    await new Promise(r => setTimeout(r, 500));
    const gs = JSON.parse(localStorage.getItem('gruposFB'));
    const card = n => (document.getElementById('grupoFB_' + gs.findIndex(g => g.nombre === n)) || {}).textContent || '';
    const unicas = [...new Map(ventas.map(v => [v.id, v])).values()];
    return { chips, elegido, trasCambiar,
             conGrupo: unicas.filter(v => v.grupo).map(v => ({ origen: v.origen, grupo: v.grupo })),
             cardB: card('Grupo B'), cardA: card('Grupo A') };
}, { cods, pid: String(P4.id) });
ok(/¿De qué grupo\?/.test(venta.chips) && venta.chips.includes('Grupo B'), 'con Facebook, el formulario de venta no ofrece el grupo');
ok(venta.elegido === 'Grupo B', `tocar un grupo en la venta no lo eligió: «${venta.elegido}»`);
ok(venta.trasCambiar === '', 'cambiar de canal tiene que soltar el grupo: una venta de WhatsApp no es de un grupo');
ok(venta.conGrupo.length === 1 && venta.conGrupo[0].origen === 'facebook' && venta.conGrupo[0].grupo === cods['Grupo B'],
   `el grupo solo va con Facebook y con un código válido: ${JSON.stringify(venta.conGrupo)}`);
const aFirebase = Object.values(DB.ventas).filter(v => v && v.grupo);
ok(aFirebase.length === 1 && aFirebase[0].grupo === cods['Grupo B'], 'el grupo de la venta tiene que viajar a /ventas (no se ve desde otro teléfono si no)');
ok(/1 venta marcada/.test(venta.cardB), `la tarjeta del grupo no cuenta sus ventas: «${venta.cardB.slice(0, 200)}»`);
ok(/responden más entre las 20 y las 22 h/.test(venta.cardB), 'con 12 toques repartidos, la tarjeta tiene que decir a qué hora responde el grupo');
ok(!/responden más/.test(venta.cardA), 'sin muestra suficiente no se puede decir a qué hora responde un grupo');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s) en Publicar (2ª tanda):\n' + fallos.map(f => '  · ' + f).join('\n'));
    process.exit(1);
}
console.log(`✅ Publicar (2ª tanda): ${comprobaciones} comprobaciones OK`);
