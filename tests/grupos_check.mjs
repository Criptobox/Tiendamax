/* Publicar el mismo producto en varios grupos sin que parezca el mismo anuncio
 * — js/revolico_integration.js, comprobado en un navegador de verdad.
 *
 * Nada de esto falla con un error. Lo que se protege:
 *
 *  - Que las versiones del texto sean DISTINTAS entre sí y que ninguna diga
 *    algo que el producto no declara (una garantía, una rebaja). Que el
 *    fichero tenga cuatro plantillas no prueba que salgan cuatro textos.
 *  - Que la versión 0 sea el post de siempre y que un grupo sin enlaces no
 *    lleve ninguna URL (el administrador borra el post).
 *  - Que la marca del grupo (?g=) pase el mismo filtro que la ficha y la regla
 *    de Firebase, y que sea la misma para la misma URL escrita de dos formas.
 *  - Que la cola aparte los grupos donde el producto ya salió o que llegaron a
 *    su máximo del día, y diga por qué; que la pausa sea saltable y el tope por
 *    hora no; que abrir el grupo lo apunte en el registro CON el grupo.
 *  - Que mirar una vista previa no cuente como publicado.
 *  - Revólico: todos los títulos conservan el modelo (m2 no es m5), avisa de
 *    renovar cuando ya salió, y la vista restaurada es la misma versión.
 *  - La tarjeta del grupo: sus reglas se guardan, y lo que trae el grupo tiene
 *    tres estados — un fallo de red no puede leerse como «no trae nada».
 *
 * Se corre solo (`node tests/grupos_check.mjs`) y desde unittest
 * (tests/test_publicar_grupos.py). Sale con código 1 si algo falla.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };

// Un producto real con stock, varias fotos, ficha y SIN garantía ni rebaja:
// así cualquier «Garantía» o «Antes» en un texto es inventado.
const SIN = CATALOGO.find(p => Number(p.stock) > 0 && !p.garantia && !(Number(p.precioOriginal) > Number(p.precioActual))
                                && Array.isArray(p.imagenes) && p.imagenes.length > 1 && Array.isArray(p.ficha) && p.ficha.length);
const CON = CATALOGO.find(p => Number(p.stock) > 0 && p.garantia && Number(p.precioOriginal) > Number(p.precioActual));
if (!SIN) { console.log('no hay un producto de prueba adecuado en el catálogo — se salta'); process.exit(0); }

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block' });
let STATS = { modo: 'ok', datos: {} };
await ctx.route('**/*.firebaseio.com/**', r => {
    if (STATS.modo === 'caido') return r.abort();
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS.datos) });
});
await ctx.route(u => u.hostname === 'tiendamax.org', r => r.abort());
await ctx.route(u => u.hostname === 'api.github.com', r => r.fulfill({ status: 404, body: '{}' }));
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('whatsappNumero', '5354320170');
    localStorage.setItem('firebaseConfig', JSON.stringify({ databaseURL: 'https://prueba-default-rtdb.firebaseio.com' }));
    window.open = () => ({});
    window.confirm = () => false;
});
await pagina.goto(`http://localhost:${PUERTO}/tests/anuncio_check.html`);
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/tm-bundle.js` });
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/admin-copilot.js` });
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/revolico_integration.js` });
await pagina.evaluate(cat => { localStorage.setItem('productos', JSON.stringify(cat)); try { productos = cat; } catch (e) {} }, CATALOGO);

// ── 1) Textos por grupo ─────────────────────────────────────────────────
const G_A = { nombre: 'Tecnología Habana', url: 'https://www.facebook.com/groups/tecnohabana/' };
const t = await pagina.evaluate(({ SIN, CON, G_A }) => {
    const vs = [0, 1, 2, 3].map(v => _textoFacebook(SIN, { variante: v }));
    const vsCon = CON ? [0, 1, 2, 3].map(v => _textoFacebook(CON, { variante: v })) : [];
    return {
        vs, vsCon,
        clasico: _textoFacebook(SIN),
        precio: _precioTxt(SIN),
        precioCon: CON ? _precioTxt(CON) : '',
        sinEnl: [0, 1, 2, 3].map(v => _textoFacebook(SIN, { variante: v, enlaces: false })),
        conGrupo: [0, 1, 2, 3].map(v => _textoFacebook(SIN, { variante: v, grupo: G_A })),
        cod: tmGrupoCodigo(G_A),
    };
}, { SIN, CON, G_A });
ok(new Set(t.vs).size === 4, 'las cuatro versiones del texto no son distintas entre sí: en cuatro grupos sale el mismo post');
ok(t.vs[0] === t.clasico, 'la versión 0 dejó de ser el post de siempre');
t.vs.forEach((x, v) => {
    ok(x.includes(SIN.nombre), `la versión ${v} no lleva el nombre del producto`);
    ok(x.includes(t.precio), `la versión ${v} no lleva el precio (${t.precio})`);
    ok(!/garant/i.test(x), `la versión ${v} promete garantía y el producto no la declara`);
    ok(!/antes|ahorras/i.test(x), `la versión ${v} anuncia una rebaja que no existe`);
    ok(!/&g=/.test(x), `la versión ${v} lleva marca de grupo sin grupo`);
});
t.vsCon.forEach((x, v) => {
    ok(/garant/i.test(x), `con garantía declarada, la versión ${v} tiene que decirla`);
    ok(/antes/i.test(x) && x.includes(t.precioCon), `con rebaja real, la versión ${v} tiene que decir antes y ahora`);
});
t.sinEnl.forEach((x, v) => {
    ok(!/https?:\/\/|wa\.me/.test(x), `la versión ${v} para un grupo sin enlaces lleva una URL: el administrador borra el post`);
    ok(x.includes('+53 5432 0170'), `la versión ${v} sin enlaces tiene que llevar el WhatsApp escrito`);
});
ok(/^[a-z0-9]{4,8}$/.test(t.cod), `el código del grupo «${t.cod}» no pasa el filtro de la ficha y de la regla`);
t.conGrupo.forEach((x, v) => ok(x.includes('&g=' + t.cod), `la versión ${v} de un grupo no lleva su marca &g=`));

// ── 2) La marca del grupo ────────────────────────────────────────────────
const cods = await pagina.evaluate(() => [
    tmGrupoCodigo({ url: 'https://www.facebook.com/groups/tecnohabana/' }),
    tmGrupoCodigo({ url: 'https://m.facebook.com/groups/tecnohabana' }),
    tmGrupoCodigo({ url: 'http://facebook.com/groups/tecnohabana/?ref=share' }),
    tmGrupoCodigo({ url: 'https://www.facebook.com/groups/ventascuba/' }),
    tmGrupoCodigo({ url: 'https://www.facebook.com/groups/x/', codigo: '../../admin' }),
    tmGrupoCodigo({ url: '' }),
]);
ok(cods[0] === cods[1] && cods[1] === cods[2], `la misma URL escrita de tres formas da tres códigos: ${cods.slice(0, 3)} — el grupo se contaría partido`);
ok(cods[0] !== cods[3], 'dos grupos distintos dan el mismo código');
ok(/^[a-z0-9]{4,8}$/.test(cods[4]), `un código guardado inválido se aceptó tal cual: «${cods[4]}»`);
ok(cods[5] === '', 'un grupo sin URL no puede tener código');

// ── 3) Mirar la vista previa no es publicar ──────────────────────────────
const vista = await pagina.evaluate(async (pid) => {
    const n0 = tmPublicaciones().length;
    previsualizarFacebook(pid, null);
    await new Promise(r => setTimeout(r, 150));
    const n1 = tmPublicaciones().length;
    const hayViejo = !!document.getElementById('btnFbAllGroups');
    document.getElementById('btnAbrirFb').click();
    await new Promise(r => setTimeout(r, 150));
    const log = tmPublicaciones();
    return { n0, n1, n2: log.length, ultimo: log[log.length - 1], hayViejo };
}, SIN.id);
ok(vista.n1 === vista.n0, 'abrir la vista previa de Facebook ya lo apunta como publicado');
ok(vista.n2 === vista.n0 + 1 && vista.ultimo && vista.ultimo.red === 'fb', 'abrir Facebook desde la vista previa tiene que apuntarlo');
ok(!vista.hayViejo, 'volvió el «Abrir en todos mis grupos»: el mismo post en todos a la vez');

// ── 4) La cola ────────────────────────────────────────────────────────────
const HOY = Date.now(), DIA = 86400000;
const grupos = [
    { nombre: 'Grupo A', url: 'https://www.facebook.com/groups/aaa/' },
    { nombre: 'Grupo B', url: 'https://www.facebook.com/groups/bbb/' },
    { nombre: 'Grupo C', url: 'https://www.facebook.com/groups/ccc/', maxDia: 1 },
    { nombre: 'Grupo D', url: 'https://www.facebook.com/groups/ddd/', enlaces: false },
];
const cola = await pagina.evaluate(async ({ pid, grupos, HOY, DIA }) => {
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    localStorage.setItem('tm_publog_v1', JSON.stringify([
        { pid: String(pid), red: 'fb', destino: 'Grupo B', ts: HOY - 2 * DIA - 3600000 },
        { pid: 'otro', red: 'fb', destino: 'Grupo C', ts: HOY - 2 * 3600000 },
    ]));
    localStorage.removeItem('tm_fb_pausa_hasta');
    localStorage.setItem('tm_fb_max_hora', '4');
    const esperada = _textoFacebook(_productoPorId(pid), { variante: tmVarianteGrupo(grupos[0], 0, pid), enlaces: true, grupo: grupos[0] });
    tmColaGrupos(pid);
    await new Promise(r => setTimeout(r, 200));
    const lista = document.getElementById('colaLista').textContent;
    const paso = document.getElementById('colaPaso').textContent;
    const txtA = document.getElementById('colaTexto').value;
    const abrirA = document.getElementById('colaAbrir').disabled;
    document.getElementById('colaAbrir').click();
    await new Promise(r => setTimeout(r, 200));
    const log = tmPublicaciones();
    const pausa = parseInt(localStorage.getItem('tm_fb_pausa_hasta') || '0', 10);
    const pasoD = document.getElementById('colaPaso').textContent;
    const txtD = document.getElementById('colaTexto').value;
    _colaTic();
    const abrirDPausa = document.getElementById('colaAbrir').disabled;
    const cuentaPausa = document.getElementById('colaCuenta').textContent;
    // Tope por hora: con 1, lo publicado en A ya lo llena.
    localStorage.setItem('tm_fb_max_hora', '1');
    localStorage.removeItem('tm_fb_pausa_hasta');
    _colaTic();
    const abrirTope = document.getElementById('colaAbrir').disabled;
    const cuentaTope = document.getElementById('colaCuenta').innerHTML;
    localStorage.setItem('tm_fb_max_hora', '4');
    _colaTic();
    const abrirLibre = document.getElementById('colaAbrir').disabled;
    // Saltar la pausa: se puede.
    _colaEmpezarPausa(); _colaTic();
    document.getElementById('colaSaltarPausa').click();
    const abrirSaltada = document.getElementById('colaAbrir').disabled;
    document.getElementById('colaAbrir').click();
    await new Promise(r => setTimeout(r, 200));
    const fin = document.getElementById('colaPaso').textContent;
    // Incluir igual el apartado B.
    const btnB = [...document.querySelectorAll('[data-cola-incluir]')]
        .find(b => b.closest('div').parentElement.textContent.includes('Grupo B'));
    if (btnB) btnB.click();
    const tras = document.getElementById('colaPaso').textContent;
    cerrarColaGrupos();
    return { lista, paso, txtA, esperada, abrirA, log, pausa, pasoD, txtD, abrirDPausa, cuentaPausa,
             abrirTope, cuentaTope, abrirLibre, abrirSaltada, fin, tras, hayB: !!btnB };
}, { pid: SIN.id, grupos, HOY, DIA });
ok(/Grupo B[^]*ya salió aquí hace 2 días/.test(cola.lista), `el grupo donde salió hace 2 días no quedó apartado con su motivo: «${cola.lista.slice(0, 200)}»`);
ok(/Grupo C[^]*hoy ya van 1 aquí \(tu máximo: 1\)/.test(cola.lista), 'el grupo que llegó a su máximo de hoy no quedó apartado con su motivo');
ok(/Grupo A/.test(cola.paso) && /versión 1 de 4/.test(cola.paso), `la cola no empezó por el grupo A en su versión: «${cola.paso.slice(0, 120)}»`);
ok(cola.txtA === cola.esperada, 'el texto de la cola no es la versión que le toca a ese grupo');
ok(!cola.abrirA, 'sin pausa ni tope pendientes, el primer grupo tiene que poder abrirse');
const ultA = cola.log[cola.log.length - 1];
ok(ultA && ultA.red === 'fb' && ultA.destino === 'Grupo A', `abrir el grupo no lo apuntó con su nombre: ${JSON.stringify(ultA)}`);
ok(cola.pausa > HOY + 3 * 60000 - 5000, 'abrir un grupo no empezó la pausa');
ok(/Grupo D/.test(cola.pasoD) && /sin enlaces/.test(cola.pasoD), 'tras A tenía que venir D (B y C apartados) y decir que no admite enlaces');
ok(!/https?:\/\//.test(cola.txtD) && cola.txtD !== cola.txtA, 'el grupo D (sin enlaces) no puede llevar URL, ni el mismo texto que A');
ok(cola.abrirDPausa && /Pausa sugerida/.test(cola.cuentaPausa), 'durante la pausa el siguiente grupo no puede abrirse sin decir cuánto falta');
ok(cola.abrirTope && /tope/.test(cola.cuentaTope) && !/Saltar/.test(cola.cuentaTope), 'con el tope por hora lleno tiene que bloquear, y ese no se salta');
ok(!cola.abrirLibre, 'sin tope ni pausa el botón tiene que volver');
ok(!cola.abrirSaltada, '«Saltar la pausa» no dejó publicar');
ok(/publicado en 2 grupos/.test(cola.fin) && /2 apartados/.test(cola.fin), `al terminar tiene que resumir: «${cola.fin.slice(0, 160)}»`);
ok(cola.hayB && /Grupo B/.test(cola.tras), '«Incluir igual» no volvió a meter el grupo apartado en la cola');

// ── 5) Rotación: el mismo grupo no recibe dos veces seguidas la misma ──────
const rot = await pagina.evaluate((pid) => {
    const g = JSON.parse(localStorage.getItem('gruposFB'))[0];
    const antes = tmVarianteGrupo(g, 0, pid);
    tmRegistrarPublicacion(pid, 'fb', 'Grupo A');
    return { antes, despues: tmVarianteGrupo(g, 0, pid) };
}, SIN.id);
ok(rot.antes !== rot.despues, 'publicar en un grupo no hizo avanzar su versión: la próxima vez recibe el mismo post');

// ── 6) La tarjeta del grupo ────────────────────────────────────────────────
const G0cod = await pagina.evaluate(() => tmGrupoCodigo(JSON.parse(localStorage.getItem('gruposFB'))[0]));
STATS = { modo: 'ok', datos: { [G0cod]: { visitas: { count: 12 }, whatsapp: { count: 3 } } } };
const tarjeta = await pagina.evaluate(async () => {
    const c = document.createElement('div'); c.id = 'listaGruposFB'; document.body.appendChild(c);
    _gruposStatsCache = null;
    renderizarGruposFB(JSON.parse(localStorage.getItem('gruposFB')));
    await new Promise(r => setTimeout(r, 400));
    const card = document.getElementById('grupoFB_0');
    const stats = document.getElementById('grupoFBStats_0').textContent;
    const num = card.querySelector('input[type=number]');
    num.value = '3'; num.dispatchEvent(new Event('input'));
    const chk = [...card.querySelectorAll('input[type=checkbox]')].find(x => /enlaces/i.test(x.parentElement.textContent));
    chk.checked = false; chk.dispatchEvent(new Event('change'));
    const g = JSON.parse(localStorage.getItem('gruposFB'))[0];
    return { stats,
             statsD: document.getElementById('grupoFBStats_3').textContent,
             maxDia: g.maxDia, enlaces: g.enlaces };
});
ok(/12 visitas/.test(tarjeta.stats) && /3 toques/.test(tarjeta.stats), `la tarjeta no enseña lo que trae el grupo: «${tarjeta.stats}»`);
ok(/no se puede medir/.test(tarjeta.statsD), 'un grupo sin enlaces no puede decir «todavía nada»: no hay nada que medir');
ok(tarjeta.maxDia === 3, `el máximo al día no se guardó (${tarjeta.maxDia})`);
ok(tarjeta.enlaces === false, 'desmarcar «Admite enlaces» no se guardó');
STATS = { modo: 'caido', datos: {} };
const caido = await pagina.evaluate(async () => {
    _gruposStatsCache = null;
    renderizarGruposFB(JSON.parse(localStorage.getItem('gruposFB')));
    await new Promise(r => setTimeout(r, 400));
    return document.getElementById('grupoFBStats_1').textContent;
});
ok(/No pude leer/.test(caido), `con la red caída dice «${caido}»: un fallo no es «no trae nada»`);

// ── 7) Revólico ──────────────────────────────────────────────────────────
const rev = await pagina.evaluate(async (cat) => {
    const malos = [];
    for (const p of cat) {
        const limpio = _nombreLimpio(p);
        const modelos = limpio.split(' ').filter(w => /\d/.test(w));
        _titulosRevolico(p).forEach(t => {
            if (t.length > 70) malos.push(`«${t}» pasa de 70`);
            const faltan = modelos.filter(m => !t.split(' ').includes(m));
            if (faltan.length) malos.push(`«${t}» pierde ${faltan.join(',')}`);
            if (/garantía/.test(t) && !p.garantia) malos.push(`«${t}» promete garantía`);
            if (/rebajado/.test(t) && !(Number(p.precioOriginal) > Number(p.precioActual))) malos.push(`«${t}» dice rebajado`);
        });
    }
    return malos;
}, CATALOGO);
ok(rev.length === 0, 'títulos de Revólico mal: ' + rev.slice(0, 5).join(' | '));

const rv = await pagina.evaluate(async (pid) => {
    localStorage.setItem('tm_publog_v1', '[]');
    const p = _productoPorId(pid);
    const descs = new Set([0, 1, 2, 3].map(v => _textoRevolico(p, v).descripcion));
    previsualizarRevolico(pid);
    await new Promise(r => setTimeout(r, 150));
    const aviso0 = !!document.getElementById('revRenovar');
    const n0 = tmPublicaciones().length;
    document.getElementById('btnAbrirRev').click();
    await new Promise(r => setTimeout(r, 100));
    document.getElementById('btnAbrirRev').click();
    await new Promise(r => setTimeout(r, 100));
    const n1 = tmPublicaciones().length;
    const titulo1 = document.getElementById('revTituloTA').value;
    previsualizarRevolico(pid, { v: sessionStorage.getItem('_tmRevVar') });
    await new Promise(r => setTimeout(r, 100));
    const tituloRest = document.getElementById('revTituloTA').value;
    const avisoRest = !!document.getElementById('revRenovar');
    previsualizarRevolico(pid);
    await new Promise(r => setTimeout(r, 100));
    const aviso = (document.getElementById('revRenovar') || {}).textContent || '';
    const version = document.getElementById('revVersion').textContent;
    document.getElementById('btnRevRenovado').click();
    const log = tmPublicaciones();
    return { distintas: descs.size, aviso0, n0, n1, titulo1, tituloRest, avisoRest, aviso, version,
             ultimo: log[log.length - 1] };
}, SIN.id);
ok(rv.distintas >= 3, `las versiones del anuncio de Revólico salen casi iguales (${rv.distintas} distintas de 4)`);
ok(!rv.aviso0, 'avisa de renovar un anuncio que nunca se publicó');
ok(rv.n1 === rv.n0 + 1, `abrir Revólico dos veces desde la misma vista previa apuntó ${rv.n1 - rv.n0} anuncios: volver a copiar otro campo no es otro anuncio`);
ok(rv.tituloRest === rv.titulo1 && !rv.avisoRest, 'al volver de Revólico la vista previa salió con OTRA versión: el título no casa con la descripción ya pegada');
ok(/Ya lo publicaste en Revólico hoy/.test(rv.aviso) && /renuévalo/.test(rv.aviso), `no avisa de renovar: «${rv.aviso.slice(0, 120)}»`);
ok(/Versión 2 de 4/.test(rv.version), `el segundo anuncio tiene que salir con la versión siguiente: «${rv.version}»`);
ok(/foto 2 de/.test(rv.version), 'con varias fotos, el segundo anuncio tiene que llevar otra de portada');
ok(rv.ultimo && rv.ultimo.red === 'revolico' && rv.ultimo.destino === 'Revolico (renovado)', '«Lo renové» no quedó apuntado');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s) publicando en grupos:\n' + fallos.map(f => '  · ' + f).join('\n'));
    process.exit(1);
}
console.log(`✅ publicar en grupos: ${comprobaciones} comprobaciones OK`);
