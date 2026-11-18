/* Publicar en MUCHOS grupos de Facebook — js/revolico_integration.js, en el
 * admin.html de verdad y en un navegador de verdad.
 *
 * Nada de esto falla con un error: la lista seguiría «funcionando» con 12
 * grupos y 22.000 px de alto, y un producto de GYM seguiría llegando al grupo
 * de energía solar. Lo que se protege:
 *
 *  - La lista es compacta: con 12 grupos, una línea cada uno (antes cada grupo
 *    traía 43 casillas, 4.500 px). Buscar filtra sin cambiar los índices.
 *  - El TEMA del grupo (sus categorías) manda: sin marcar lleva todo; marcado,
 *    solo eso (sin acentos ni mayúsculas). La cola de un producto aparta los
 *    grupos que no lo llevan, con su razón y «Incluir igual»; el plan del día
 *    le da a cada grupo solo lo que lleva y nunca el mismo producto en dos
 *    pasos seguidos; «publicar productos en este grupo» sigue el tema, no la
 *    lista de ids con que se creó el grupo.
 *  - Alta en bloque: enlaces pegados, uno por línea; limpia ?ref=, m., web. y
 *    /permalink; no repite lo que ya hay; el nombre de antes del enlace es el
 *    nombre; se guarda como cualquier cambio (marca de tiempo y subida).
 *  - Un toque por grupo: «guardar imagen + copiar texto + abrir» baja la
 *    imagen SOLO si la casilla está marcada, y lo apunta con el grupo.
 *  - Con grupos guardados, «Facebook» en un producto abre la cola; sin grupos,
 *    la vista previa de siempre.
 *
 * Se corre solo (`node tests/grupos_lista_check.mjs`) y desde unittest
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

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };

// Dos categorías distintas con producto en stock: A y B. Y varios de A, para el plan.
const conStock = CATALOGO.filter(p => Number(p.stock) > 0 && p.categoria && p.activo !== false);
const cats = [...new Set(conStock.map(p => p.categoria))];
const CAT_A = cats.find(c => conStock.filter(p => p.categoria === c).length >= 2);
const CAT_B = cats.find(c => c !== CAT_A);
if (!CAT_A || !CAT_B) { console.log('el catálogo no tiene dos categorías con stock — se salta'); process.exit(0); }
const PA = conStock.filter(p => p.categoria === CAT_A);
const PB = conStock.filter(p => p.categoria === CAT_B);

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
await ctx.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
await ctx.route('**/grupos_facebook_config.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"grupos":[]}' }));
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
pagina.on('dialog', d => d.accept());

const G = (nombre, slug, extra = {}) => Object.assign({ nombre, url: `https://www.facebook.com/groups/${slug}/`, productos: [], categorias: [], ts: 1 }, extra);
const GRUPOS3 = [
    G('Todo Habana', 'todohabana'),
    G('Solo A', 'soloa', { categorias: [CAT_A] }),
    G('Solo B', 'solob', { categorias: [CAT_B.toLowerCase()] }),   // en minúsculas: tiene que valer igual
];
await pagina.addInitScript(g => {
    if (sessionStorage.getItem('_ini')) return;
    sessionStorage.setItem('_ini', '1');
    localStorage.setItem('gruposFB', JSON.stringify(g));
    localStorage.setItem('whatsappNumero', '5354320170');
    window.__descargas = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__descargas.push(this.download); return orig.apply(this, arguments); };
    window.open = u => { (window.__abiertos = window.__abiertos || []).push(String(u)); return {}; };
}, GRUPOS3);
await pagina.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded' });
await pagina.waitForTimeout(4500);
await pagina.evaluate(() => {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login,.tm2-login-card,#tm2Login').forEach(e => { e.style.display = 'none'; });
    go('publicar');
});
await pagina.waitForTimeout(2500);

// ── 1) El tema ─────────────────────────────────────────────────────────────
const tema = await pagina.evaluate(({ A, B }) => {
    const [todo, soloA, soloB] = JSON.parse(localStorage.getItem('gruposFB'));
    const pa = { categoria: A }, pb = { categoria: B }, acentos = { categoria: B.toUpperCase() };
    return {
        todo: [_grupoAcepta(todo, pa), _grupoAcepta(todo, pb)],
        a: [_grupoAcepta(soloA, pa), _grupoAcepta(soloA, pb)],
        b: [_grupoAcepta(soloB, pb), _grupoAcepta(soloB, pa), _grupoAcepta(soloB, acentos)],
        vacio: _grupoAcepta({ categorias: [] }, pa), sinCampo: _grupoAcepta({}, pa),
        acento: _grupoAcepta({ categorias: ['Energía'] }, { categoria: 'ENERGIA' }),
    };
}, { A: CAT_A, B: CAT_B });
ok(tema.todo[0] && tema.todo[1], 'un grupo sin categorías tiene que llevar todo');
ok(tema.a[0] && !tema.a[1], 'un grupo de la categoría A no puede llevar la B');
ok(tema.b[0] && !tema.b[1] && tema.b[2], 'el tema no distingue mayúsculas');
ok(tema.vacio && tema.sinCampo, 'categorías vacías o ausentes = lleva todo (los grupos de antes no tienen el campo)');
ok(tema.acento, '«Energía» y «ENERGIA» tienen que ser la misma categoría');

// ── 2) La lista compacta ───────────────────────────────────────────────────
const lista = await pagina.evaluate(() => {
    const nombres = ['Tecnología Habana', 'Compra venta La Habana', 'Energía solar Cuba', 'Ofertas Cuba', 'Venta de equipos', 'Autos y repuestos',
                     'Gym Habana', 'Celulares Cuba', 'Matanzas compra venta', 'Hogar y cocina', 'Seguridad y cámaras', 'WiFi y redes Cuba'];
    const gs = nombres.map((n, i) => ({ nombre: n, url: `https://www.facebook.com/groups/gr${i}abc/`, productos: [], categorias: [], ts: 1 }));
    localStorage.setItem('gruposFB', JSON.stringify(gs));
    renderizarGruposFB(gs);
    const cont = document.getElementById('listaGruposFB');
    const filas = [...cont.querySelectorAll('.gfb')];
    const cuerpoAbierto = filas.some(f => !f.querySelector('.gfb-cuerpo').hidden);
    const alto = Math.round(cont.getBoundingClientRect().height);
    const maxFila = Math.max(...filas.map(f => Math.round(f.getBoundingClientRect().height)));
    const checks = cont.querySelectorAll('input[type=checkbox]:not([data-x])').length;
    // buscar
    const q = document.getElementById('gfbBuscar'); q.value = 'solar'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const visibles = filas.filter(f => f.style.display !== 'none').map(f => f.dataset.i);
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    return { n: filas.length, alto, maxFila, cuerpoAbierto, visibles, hayBuscador: !!q, checks };
});
ok(lista.n === 12, `la lista no pinta una fila por grupo (${lista.n})`);
ok(lista.alto < 12 * 110 + 120, `12 grupos ocupan ${lista.alto} px: tendrían que ser una línea cada uno (la tarjeta de antes medía 4.500 px por grupo)`);
ok(lista.maxFila <= 110, `una fila de grupo mide ${lista.maxFila} px: ya no es una línea`);
ok(!lista.cuerpoAbierto, 'los grupos tienen que verse plegados');
ok(lista.hayBuscador, 'con más de 6 grupos tiene que haber buscador');
ok(JSON.stringify(lista.visibles) === '["2"]', `buscar «solar» no dejó solo «Energía solar Cuba» (índices: ${JSON.stringify(lista.visibles)})`);

// Tocar la categoría guarda el tema, sella el grupo y programa la subida.
const toque = await pagina.evaluate(async (A) => {
    document.querySelector('#grupoFB_2 .gfb-cab').click();
    const abierto = !document.querySelector('#grupoFB_2 .gfb-cuerpo').hidden;
    const antes = JSON.parse(localStorage.getItem('gruposFB'))[2].ts;
    await new Promise(r => setTimeout(r, 5));
    const chip = [...document.querySelectorAll('#grupoFB_2 .gfb-tema')].find(b => b.dataset.cat === A);
    chip.click();
    const g = JSON.parse(localStorage.getItem('gruposFB'))[2];
    const meta = document.querySelector('#grupoFB_2 .gfb-meta').textContent;
    return { abierto, cats: g.categorias, selado: g.ts > antes, meta, estado: TM_GRUPOS_ESTADO };
}, CAT_A);
ok(toque.abierto, 'tocar la línea del grupo no lo abre');
ok(JSON.stringify(toque.cats) === JSON.stringify([CAT_A]), `tocar la categoría no la guardó en el grupo: ${JSON.stringify(toque.cats)}`);
ok(toque.selado, 'cambiar el tema no puso hora al grupo: con dos teléfonos, el otro lo pisaría');
ok(toque.meta.includes(CAT_A), 'la línea del grupo no dice de qué es después de cambiarlo');
ok(toque.estado === 'pendiente', `cambiar el tema no programó la subida al repo (${toque.estado})`);

// ── 3) Alta en bloque ──────────────────────────────────────────────────────
const parse = await pagina.evaluate(() => {
    const txt = [
        'Motos Cuba https://www.facebook.com/groups/motoscuba?ref=share',
        'https://m.facebook.com/groups/123456789012/',
        'https://www.facebook.com/groups/gr0abc/',
        'esto no tiene enlace',
        '- Ventas Camagüey - https://web.facebook.com/groups/ventascmg/permalink/99/',
        'https://www.instagram.com/algo/',
    ].join('\n');
    const existentes = JSON.parse(localStorage.getItem('gruposFB'));
    return gfbParsear(txt, existentes);
});
ok(parse.nuevos.length === 3, `el alta en bloque no encontró 3 grupos nuevos: ${JSON.stringify(parse.nuevos)}`);
ok(parse.nuevos[0].url === 'https://www.facebook.com/groups/motoscuba/' && parse.nuevos[0].nombre === 'Motos Cuba',
   `no limpió ?ref= ni tomó el nombre de antes del enlace: ${JSON.stringify(parse.nuevos[0])}`);
ok(parse.nuevos[1].url === 'https://www.facebook.com/groups/123456789012/' && parse.nuevos[1].nombre === 'Grupo 89012',
   `un enlace con id numérico tiene que llamarse «Grupo 89012» y salir de m.facebook.com como www: ${JSON.stringify(parse.nuevos[1])}`);
ok(parse.nuevos[2].url === 'https://www.facebook.com/groups/ventascmg/' && parse.nuevos[2].nombre === 'Ventas Camagüey',
   `no quitó /permalink ni los guiones del nombre: ${JSON.stringify(parse.nuevos[2])}`);
ok(parse.repetidos === 1, `un grupo que ya existe no se tiene que repetir (repetidos: ${parse.repetidos})`);
ok(parse.sinEnlace === 2, `las líneas sin enlace de Facebook (${parse.sinEnlace}) tienen que contarse, no inventar grupos`);

const alta = await pagina.evaluate(async () => {
    const antes = JSON.parse(localStorage.getItem('gruposFB')).length;
    gfbAbrirAlta();
    document.getElementById('gfbAltaTxt').value = 'Motos Cuba https://www.facebook.com/groups/motoscuba\nhttps://www.facebook.com/groups/otrogrupo';
    document.getElementById('gfbAltaOk').click();
    const gs = JSON.parse(localStorage.getItem('gruposFB'));
    return { antes, despues: gs.length, ult: gs.slice(-2).map(g => [g.nombre, !!g.ts, Array.isArray(g.categorias)]),
             filas: document.querySelectorAll('#listaGruposFB .gfb').length, estado: TM_GRUPOS_ESTADO,
             cuenta: document.getElementById('pub-fb-groups-count').textContent };
});
ok(alta.despues === alta.antes + 2, `el alta en bloque no agregó los 2 grupos (${alta.antes} → ${alta.despues})`);
ok(alta.ult.every(x => x[1] && x[2]), 'los grupos nuevos tienen que llevar hora y categorías (vacías = todo)');
ok(alta.filas === alta.despues && String(alta.cuenta) === String(alta.despues), 'la lista y el contador no se repintaron tras el alta');
ok(alta.estado === 'pendiente', `el alta no programó la subida al repo (${alta.estado})`);

// ── 4) La cola y el plan respetan el tema ──────────────────────────────────
await pagina.evaluate(g => {
    localStorage.setItem('gruposFB', JSON.stringify(g));
    renderizarGruposFB(g);
    localStorage.setItem('tm_publog_v1', '[]');
}, GRUPOS3);
const cola = await pagina.evaluate(async (pid) => {
    await tmColaGrupos(pid);
    const items = _COLA.items.map(x => ({ g: x.g.nombre, estado: x.estado, motivo: x.motivo }));
    cerrarColaGrupos();
    return items;
}, PB[0].id);
const de = n => cola.find(x => x.g === n) || {};
ok(de('Todo Habana').estado === 'pendiente', 'el grupo sin tema tiene que recibir el producto');
ok(de('Solo B').estado === 'pendiente', 'el grupo de esa categoría tiene que recibir el producto');
ok(de('Solo A').estado === 'apartado' && /no lleva/.test(de('Solo A').motivo), `el grupo de otra categoría tiene que quedar apartado con su razón: ${JSON.stringify(de('Solo A'))}`);

const incluir = await pagina.evaluate(async (pid) => {
    await tmColaGrupos(pid);
    const btn = document.querySelector('#colaLista [data-cola-incluir]');
    if (btn) btn.click();
    const r = _COLA.items.map(x => x.estado);
    cerrarColaGrupos();
    return r;
}, PB[0].id);
ok(incluir.filter(e => e === 'pendiente').length === 3, `«Incluir igual» no dejó pendiente el grupo apartado por tema: ${JSON.stringify(incluir)}`);

const plan = await pagina.evaluate(async ({ a, b }) => {
    await tmColaPlan([a[0].id, a[1].id, b[0].id]);
    const items = _COLA.items.map(x => ({ g: x.g.nombre, cat: x.p.categoria, id: x.p.id }));
    cerrarColaGrupos();
    return items;
}, { a: PA, b: PB });
const soloA = plan.filter(x => x.g === 'Solo A'), soloB = plan.filter(x => x.g === 'Solo B');
ok(soloA.length > 0 && soloA.every(x => x.cat === CAT_A), `el plan le dio al grupo de ${CAT_A} algo de otra categoría: ${JSON.stringify(soloA)}`);
ok(soloB.length > 0 && soloB.every(x => x.cat.toLowerCase() === CAT_B.toLowerCase()), `el plan le dio al grupo de ${CAT_B} algo de otra categoría: ${JSON.stringify(soloB)}`);
ok(plan.every((x, i) => i === 0 || x.id !== plan[i - 1].id), `el plan puso el mismo producto en dos pasos seguidos: ${JSON.stringify(plan.map(x => x.id))}`);
const porGrupo = {}; plan.forEach(x => { (porGrupo[x.g] = porGrupo[x.g] || []).push(x.id); });
ok(Object.values(porGrupo).every(ids => new Set(ids).size === ids.length), 'el plan repitió un producto en el mismo grupo');

const unGrupo = await pagina.evaluate(({ i }) => {
    publicarEnGrupoFB(i);
    const filas = document.querySelectorAll('#grupoPublicarList > div').length;
    const m = document.getElementById('grupoPublicarModal'); if (m) m.remove();
    return filas;
}, { i: 1 });
ok(unGrupo === conStock.filter(p => p.categoria === CAT_A).length + CATALOGO.filter(p => p.categoria === CAT_A && !(Number(p.stock) > 0) && p.activo !== false).length,
   `«publicar productos en este grupo» no sigue el tema del grupo (${unGrupo} filas)`);

// ── 5) Un toque por grupo ──────────────────────────────────────────────────
const toqueUnico = async (conImagen) => pagina.evaluate(async ({ pid, conImagen }) => {
    localStorage.setItem('tm_publog_v1', '[]');
    localStorage.removeItem('tm_cola_pausa_hasta');
    Object.keys(localStorage).filter(k => /^tm_cola/.test(k) && k !== 'tm_cola_con_imagen').forEach(k => localStorage.removeItem(k));
    window.__descargas = [];
    await tmColaGrupos(pid);
    await new Promise(r => setTimeout(r, 700));
    const chk = document.getElementById('colaConImagen');
    chk.checked = conImagen; chk.dispatchEvent(new Event('change'));
    const rotulo = document.getElementById('colaAbrir').textContent;
    const g = _COLA.items[_COLA.actual].g.nombre;
    document.getElementById('colaAbrir').click();
    await new Promise(r => setTimeout(r, 700));
    const reg = JSON.parse(localStorage.getItem('tm_publog_v1') || '[]').filter(e => e.red === 'fb');
    const r = { descargas: window.__descargas.slice(), rotulo, pref: localStorage.getItem('tm_cola_con_imagen'), destino: reg.map(e => e.destino), g,
                abiertos: (window.__abiertos || []).slice(-1) };
    cerrarColaGrupos();
    return r;
}, { pid: PB[0].id, conImagen });
const conImg = await toqueUnico(true);
ok(conImg.descargas.length === 1 && /^tiendamax-/.test(conImg.descargas[0]), `con la casilla marcada, un toque tenía que bajar la imagen: ${JSON.stringify(conImg.descargas)}`);
ok(/Guardar imagen, copiar texto y abrir/.test(conImg.rotulo), `el botón no dice lo que hace con la imagen: «${conImg.rotulo}»`);
ok(conImg.destino.includes(conImg.g), `abrir el grupo no lo apuntó con el grupo (${JSON.stringify(conImg.destino)})`);
ok(conImg.abiertos[0] && conImg.abiertos[0].includes('facebook.com/groups/'), 'el toque no abrió el grupo');
const sinImg = await toqueUnico(false);
ok(sinImg.descargas.length === 0, `con la casilla desmarcada no se baja nada: ${JSON.stringify(sinImg.descargas)}`);
ok(sinImg.pref === '0', 'la elección de la casilla no se recordó');
ok(/^📋 Copiar texto y abrir/.test(sinImg.rotulo), `sin imagen el botón tiene que decir solo texto: «${sinImg.rotulo}»`);

// ── 6) «Facebook» en un producto ───────────────────────────────────────────
const facebook = async (grupos) => pagina.evaluate(async ({ grupos, pid }) => {
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    const c = document.getElementById('fbColaModal'); if (c) c.remove();
    const p = document.getElementById('fbPreviewModal'); if (p) p.remove();
    await pubShareAct(pid, 'fb');
    await new Promise(r => setTimeout(r, 600));
    const r = { cola: !!document.getElementById('fbColaModal'), vista: !!document.getElementById('fbPreviewModal'),
                boton: (document.querySelector('#fbPreviewModal')?.innerText.match(/uno a uno \((\d+)\)/) || [])[1] || '' };
    ['fbColaModal', 'fbPreviewModal'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    clearInterval(_colaReloj);
    return r;
}, { grupos, pid: String(PB[0].id) });
const conGrupos = await facebook(GRUPOS3);
ok(conGrupos.cola && !conGrupos.vista, `con grupos guardados, «Facebook» tenía que abrir la cola directamente: ${JSON.stringify(conGrupos)}`);
const sinGrupos = await facebook([]);
ok(sinGrupos.vista && !sinGrupos.cola, `sin grupos, «Facebook» tiene que abrir la vista previa de siempre: ${JSON.stringify(sinGrupos)}`);
const cuentaBoton = await pagina.evaluate(async ({ grupos, pid }) => {
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    previsualizarFacebook(pid, null);
    await new Promise(r => setTimeout(r, 500));
    const t = (document.querySelector('#fbPreviewModal')?.innerText.match(/uno a uno \((\d+)\)/) || [])[1];
    const e = document.getElementById('fbPreviewModal'); if (e) e.remove();
    return t;
}, { grupos: GRUPOS3, pid: String(PB[0].id) });
ok(cuentaBoton === '2', `la vista previa cuenta los grupos a los que NO les toca este producto (${cuentaBoton} en vez de 2)`);

// ── 7) «3 redes»: Facebook va por la cola cuando hay grupos ────────────────
const tres = await pagina.evaluate(async ({ grupos, ids }) => {
    const salida = async (gs, plantillas) => {
        localStorage.setItem('gruposFB', JSON.stringify(gs));
        if (plantillas) localStorage.setItem('tm_plantillas_v1', JSON.stringify(plantillas)); else localStorage.removeItem('tm_plantillas_v1');
        go('publicar'); pubSwitch('wizard');
        await new Promise(r => setTimeout(r, 400));
        ids.forEach(id => wzToggle(String(id), true));
        const html = document.getElementById('wz-salida').innerText;
        const secciones = [...document.querySelectorAll('#wz-salida .section')].map(s => s.innerText);
        return { html, secciones, cola: !!document.getElementById('wz-fb-cola'), nota: !!document.getElementById('wz-fb-cola-nota') };
    };
    const conGrupos = await salida(grupos);
    document.getElementById('wz-fb-cola').click();
    await new Promise(r => setTimeout(r, 800));
    const abierta = !!document.getElementById('fbColaModal');
    cerrarColaGrupos();
    const sinGrupos = await salida([]);
    // Plantillas propias solo de Facebook: Revólico y WhatsApp usan LAS SUYAS por defecto, no esa.
    const soloFb = await salida([], [{ id: 'mia', nombre: 'MI PLANTILLA FB', red: 'fb', texto: 'PLANTILLA-DE-FACEBOOK {nombre}' }]);
    return { conGrupos, abierta, sinGrupos, soloFb };
}, { grupos: GRUPOS3, ids: [PB[0].id] });
ok(tres.conGrupos.cola && tres.conGrupos.nota, 'con grupos guardados, «3 redes» tiene que ofrecer la cola para Facebook');
ok(tres.abierta, 'el botón de la cola en «3 redes» no abrió la cola');
ok(!tres.sinGrupos.cola && /Copiar y abrir/.test(tres.sinGrupos.html), 'sin grupos, «3 redes» tiene que seguir copiando con la plantilla');
const bloqueDe = ic => tres.soloFb.secciones.find(b => b.startsWith(ic)) || '';
ok(tres.soloFb.secciones.length === 3, `«3 redes» tenía que pintar 3 bloques y pintó ${tres.soloFb.secciones.length}`);
ok(/PLANTILLA-DE-FACEBOOK/.test(bloqueDe('📘')), 'Facebook tiene que usar la plantilla propia');
ok(!/PLANTILLA-DE-FACEBOOK/.test(bloqueDe('🟠')) && !/PLANTILLA-DE-FACEBOOK/.test(bloqueDe('🟢')),
   'con plantillas propias solo de Facebook, Revólico y WhatsApp usaron la de Facebook en vez de la suya por defecto');
ok(/Revolico — anuncio/.test(bloqueDe('🟠')), 'Revólico tiene que usar su plantilla por defecto');

// El SDK de Firebase no se carga sin red (gstatic va a null): ese error es del entorno de prueba.
const erroresPropios = erroresJs.filter(e => !/firebase is not defined/.test(e));
ok(erroresPropios.length === 0, 'errores de JavaScript en la página: ' + erroresPropios.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de la lista de grupos, el tema y la cola en regla.`);
