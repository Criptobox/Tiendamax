/* La pantalla 📣 Publicar — en un navegador de verdad.
 *
 * Dos cosas que no se pueden comprobar leyendo el fichero, y que fallan sin
 * dar un solo error:
 *
 *  - **El registro de lo publicado vivía solo en este navegador.** Cambiar de
 *    teléfono dejaba los 132 productos en «nunca publicado»; publicar desde
 *    el móvil y abrir el panel en la computadora hacía que la computadora
 *    propusiera lo mismo otra vez, y se publicaba duplicado. Ahora va al
 *    repositorio, y como se publica desde dos aparatos tiene que FUSIONARSE:
 *    subir el fichero entero pisaría lo del otro y el trabajo desaparece sin
 *    que nada se queje.
 *  - **«Hoy toca publicar» ordena por visitas.** Si ordenara por unas visitas
 *    que todavía no han llegado, un producto sin datos leería «0 visitas» —
 *    justo lo más urgente de la lista— y lo más urgente sería siempre lo que
 *    no cargó. Nadie puede distinguir eso de «nadie lo ha visto».
 *
 * Firebase, los analytics y la API de GitHub se interceptan: no se escribe
 * nada en ninguna parte. Se corre solo (`node tests/publicar_check.mjs`) y
 * desde unittest (tests/test_publicar_repo.py).
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

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
let REPO = null;               // lo que hay en publicaciones.json
const SUBIDAS = [];            // lo que se le manda a GitHub

const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    if (p.endsWith('/publicaciones.json')) {
        if (!REPO) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify(REPO));
        return;
    }
    const ruta = normalize(join(RAIZ, decodeURIComponent(p)));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const PRODUCTOS = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'))
    .filter(p => Number(p.stock) > 0).slice(0, 10);
// Los dos primeros: muy vistos y sin un solo clic de WhatsApp. Los tres
// siguientes: nadie los ha visto. El resto, normales.
const VISTAS = {}, WA = {};
PRODUCTOS.forEach((p, i) => {
    VISTAS[p.id] = { count: i < 2 ? 40 + i : (i < 5 ? 0 : 3) };
    WA[p.id] = { count: i < 2 ? 0 : 2 };
});
const MUY_VISTOS = PRODUCTOS.slice(0, 2).map(p => p.nombre);
const SIN_VISTAS = PRODUCTOS.slice(2, 5).map(p => p.nombre);

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 1400 }, serviceWorkers: 'block' });
const erroresJs = [];

// El orden importa: en Playwright gana la ruta registrada MÁS TARDE.
await ctx.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com'
                     && !u.hostname.includes('firebaseio.com'), r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
await ctx.route('**/analytics/vistas.json**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VISTAS) }));
/* Canales. facebook trae muchas visitas y ninguna venta —es el dato que hace
   dejar de perder el rato ahí—; revolico trae pocas y ninguna, que no
   significa nada todavía; whatsapp vende; y 'conocido' vendió sin que nadie
   abriera un enlace, así que nunca tendrá visitas y tiene que salir igual. */
const FUENTES = { facebook:{count:240}, whatsapp:{count:30}, revolico:{count:4} };
await ctx.route('**/analytics/fuentes.json**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FUENTES) }));
await ctx.route('**/analytics/whatsapp.json**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WA) }));
await ctx.route(u => u.hostname === 'api.github.com', r => {
    const req = r.request();
    if (req.method() === 'PUT') {
        const texto = Buffer.from(JSON.parse(req.postData() || '{}').content, 'base64').toString('utf8');
        SUBIDAS.push({ ruta: req.url().split('/contents/')[1], datos: JSON.parse(texto) });
        REPO = JSON.parse(texto);
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"x"}}' });
    }
    if (req.url().includes('/contents/'))
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{"sha":"sha1"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
});

const pagina = await ctx.newPage();
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(() => {
    localStorage.setItem('registroVentas', JSON.stringify([
        { id:'v1', fecha:'2026-01-02', origen:'whatsapp', items:[] },
        { id:'v2', fecha:'2026-01-03', origen:'whatsapp', items:[] },
        { id:'v3', fecha:'2026-01-04', origen:'conocido', items:[] },
    ]));
    localStorage.setItem('githubUser', 'quien');
    localStorage.setItem('githubRepo', 'repo');
    localStorage.setItem('githubToken', 'ghp_de_mentira');
});
await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
await pagina.waitForTimeout(2500);
await pagina.evaluate(() => {
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
    go('publicar');
});
await pagina.waitForTimeout(2400);

// ── 1) Se ve y nadie lo pide: fuera de la cola, y dicho aparte ───────
const sinPedir = await pagina.$$eval('.pub-sinpedir-fila', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
ok(sinPedir.length === 2,
   `los 2 productos con 40 visitas y 0 pedidos deberían salir aparte; salen ${sinPedir.length}`);
ok(MUY_VISTOS.every(n => sinPedir.some(t => t.includes(n))),
   'el bloque «se ven y nadie los pide» no nombra los productos correctos');
ok(sinPedir.every(t => /0 pedidos/.test(t)),
   'cada fila tiene que decir el número, no solo el nombre: sin la cifra no se sabe si es grave');

const hoy = await pagina.$$eval('.pub-hoy-card .pub-hoy-info b', e => e.map(x => x.textContent));
ok(!MUY_VISTOS.some(n => hoy.includes(n)),
   'un producto que se ve y nadie pide NO puede ocupar sitio en la cola de publicar: '
   + 'publicarlo otra vez no arregla el precio ni la foto');
ok(SIN_VISTAS.some(n => hoy.includes(n)),
   `con los datos delante, primero va lo que nadie ha visto; propone ${JSON.stringify(hoy)}`);

/* Mirar solo las tres tarjetas de arriba no basta: los muy vistos quedan al
   final del orden y no asomarían aunque siguieran en la cola. Lo que de
   verdad los expondría es «🔁 Dame otros», que va rotando por TODOS los
   candidatos — así que se recorre la vuelta entera. */
const vistosAlRotar = await pagina.evaluate(async muyVistos => {
    const salieron = new Set();
    for (let i = 0; i < 30; i++) {
        pubRenderHoy(true);
        [...document.querySelectorAll('.pub-hoy-card .pub-hoy-info b')]
            .forEach(b => { if (muyVistos.includes(b.textContent)) salieron.add(b.textContent); });
    }
    return [...salieron];
}, MUY_VISTOS);
ok(vistosAlRotar.length === 0,
   `dando a «Dame otros» hasta dar la vuelta, un producto que se ve y nadie pide `
   + `NO puede aparecer nunca en la cola; apareció ${JSON.stringify(vistosAlRotar)}`);

// ── 2) Sin datos, NO se ordena por ellos ─────────────────────────────
/* No se toca PUB_STATS desde fuera —es `let` dentro del IIFE y no existe en
   window— y además vale más probar el fallo de verdad: Firebase sin
   responder, que en Cuba es un martes cualquiera. Con la pestaña así, la
   pantalla no puede afirmar que algo «se ve y nadie lo pide» ni ordenar por
   unas visitas que no tiene. */
const ctxCaido = await navegador.newContext({ viewport: { width: 412, height: 1400 }, serviceWorkers: 'block' });
await ctxCaido.route(u => !u.hostname.includes('localhost'), r => r.abort());
const pgCaido = await ctxCaido.newPage();
await pgCaido.goto(`http://localhost:${PUERTO}/admin.html`);
await pgCaido.waitForTimeout(2400);
await pgCaido.evaluate(() => {
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
    go('publicar');
});
await pgCaido.waitForTimeout(2200);
const caido = await pgCaido.evaluate(() => ({
    sinPedir: document.querySelectorAll('.pub-sinpedir-fila').length,
    cola: [...document.querySelectorAll('.pub-hoy-card .pub-hoy-info b')].map(x => x.textContent),
    canales: (document.getElementById('pub-fuentes') || {}).textContent || '',
}));
ok(caido.sinPedir === 0,
   'con los analytics caídos no se puede decir que algo «se ve y nadie lo pide»: sería inventarlo');
ok(caido.cola.length > 0,
   'la pantalla tiene que seguir proponiendo qué publicar aunque Firebase no conteste: '
   + 'los días sin publicar salen del registro local y no dependen de la red');
ok(/no pude leer/i.test(caido.canales),
   `sin red, «no pude leerlo» y «todavía no hay datos» se ven igual y significan lo contrario; `
   + `dice «${caido.canales}»`);
ok(!/Todavía no hay visitas/.test(caido.canales),
   'un bloque vacío por un fallo de red se lee como «no funciona ningún canal», que es la conclusión contraria');
await ctxCaido.close();

// ── 2b) Qué canal trae ventas, en la pantalla donde se decide ────────
const canales = await pagina.evaluate(() => {
    const c = document.getElementById('pub-fuentes');
    return { txt: (c || {}).textContent || '', hay: !!c };
});
ok(canales.hay, 'el bloque de canales tiene que estar en 📣 Publicar, que es donde se decide dónde publicar');
ok(/Facebook/.test(canales.txt) && /240/.test(canales.txt),
   `las visitas por canal tienen que salir; sale «${canales.txt.slice(0,140)}»`);
ok(/2 ventas/.test(canales.txt),
   'y las ventas marcadas de ese canal al lado: por separado ninguno de los dos dice dónde publicar');
ok(/Conocido|conocido/.test(canales.txt),
   'un canal que vendió sin que nadie abriera un enlace no tiene visitas y es justo la fila que interesa');
const fbFila = canales.txt.slice(canales.txt.indexOf('Facebook'));
ok(/sin ventas todavía/.test(fbFila.slice(0, 80)),
   '240 visitas y 0 ventas es el dato que hace dejar de perder el rato ahí; hay que decirlo');
ok(!/Revólico[^]{0,60}sin ventas todavía/.test(canales.txt),
   'con 4 visitas no hay muestra: acusar a un canal de no rendir con eso es mandar a dejar de publicar donde sí funciona');

/* El mismo pintor en las dos pantallas. Dos pintores sobre los mismos
   números acaban dando cifras distintas en dos pestañas del mismo panel. */
const mismos = await pagina.evaluate(async () => {
    go('analytics');
    await new Promise(r => setTimeout(r, 1500));
    const an = (document.getElementById('an-fuentes') || {}).textContent || '';
    go('publicar');
    await new Promise(r => setTimeout(r, 800));
    const pu = (document.getElementById('pub-fuentes') || {}).textContent || '';
    const cifras = t => (t.match(/\d+/g) || []).join(',');
    return { an: cifras(an), pu: cifras(pu), anTxt: an.slice(0, 120) };
});
ok(mismos.an.length > 0, `Analytics tiene que seguir pintando lo suyo; salió «${mismos.anTxt}»`);
ok(mismos.an.startsWith(mismos.pu) || mismos.pu.startsWith(mismos.an) || mismos.an === mismos.pu,
   `las dos pantallas no pueden dar cifras distintas del mismo dato: Analytics «${mismos.an}» vs Publicar «${mismos.pu}»`);

// ── 3) El registro se guarda en el repositorio ───────────────────────
const antesDeSubir = SUBIDAS.length;
await pagina.evaluate(() => {
    const b = document.querySelector('.pub-hoy-btns .pub-act.ghost');
    if (b) b.click();
});
await pagina.waitForTimeout(700);
const local = await pagina.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('tm_publog_v1') || '[]').length; }
    catch (e) { return -1; }
});
ok(local > 0, 'lo publicado se apunta en el momento: cerrar la pestaña antes de que suba no puede perderlo');
ok(SUBIDAS.length === antesDeSubir,
   'publicar una tanda son diez toques en un minuto: no puede ser un commit por toque');
const estadoPendiente = await pagina.evaluate(() => (document.getElementById('pub-publog') || {}).textContent || '');
ok(/sin guardar/.test(estadoPendiente),
   `mientras no ha subido tiene que decirlo; dice «${estadoPendiente}»`);

await pagina.waitForTimeout(4800);
ok(SUBIDAS.length === antesDeSubir + 1,
   `tras el respiro debe haber UNA subida, hay ${SUBIDAS.length - antesDeSubir}`);
const subida = SUBIDAS[SUBIDAS.length - 1];
ok(subida && subida.ruta === 'publicaciones.json',
   `se sube a publicaciones.json, no a ${subida && subida.ruta}`);
ok(subida && Array.isArray(subida.datos.eventos) && subida.datos.eventos.length > 0,
   'el fichero tiene que llevar los eventos');
ok(subida && subida.datos.eventos.every(e => e.pid && e.red && e.ts),
   'cada evento necesita producto, red y momento: eso es lo que lo identifica al fusionar');
const estadoOk = await pagina.evaluate(() => (document.getElementById('pub-publog') || {}).textContent || '');
ok(/guardado/.test(estadoOk),
   `al terminar de subir la línea tiene que cambiar, o miente; dice «${estadoOk}»`);

// ── 4) Dos aparatos: fusionar, no pisar ──────────────────────────────
// El otro teléfono publicó otra cosa mientras tanto.
const ajeno = { pid: 'producto-del-otro', red: 'fb', destino: 'Grupos', ts: Date.now() - 1000 };
REPO = { actualizado: new Date().toISOString(), eventos: [ajeno].concat(subida.datos.eventos) };
await pagina.evaluate(() => {
    const b = document.querySelectorAll('.pub-hoy-btns .pub-act.ghost')[1];
    if (b) b.click();
});
await pagina.waitForTimeout(5200);
const ultimo = SUBIDAS[SUBIDAS.length - 1].datos.eventos;
ok(ultimo.some(e => e.pid === 'producto-del-otro'),
   'lo que publicó el otro aparato entre medias no puede desaparecer al subir lo de este');
ok(ultimo.length > subida.datos.eventos.length,
   'y lo de aquí tiene que seguir estando: se unen las dos listas');

// Fusionar dos veces lo mismo no puede duplicar nada: la identidad de un
// evento es producto + red + momento.
const dedupe = await pagina.evaluate(() => {
    const uno = [{ pid: '1', red: 'fb', ts: 111 }, { pid: '1', red: 'wa', ts: 222 }];
    return {
        repetido: tmPublogFusionar(uno, uno).length,
        distintos: tmPublogFusionar(uno, [{ pid: '2', red: 'fb', ts: 111 }]).length,
        mismoMomentoOtraRed: tmPublogFusionar([{ pid: '1', red: 'fb', ts: 5 }],
                                              [{ pid: '1', red: 'wa', ts: 5 }]).length,
    };
});
ok(dedupe.repetido === 2, `fusionar una lista consigo misma no puede duplicar: da ${dedupe.repetido}`);
ok(dedupe.distintos === 3, `dos productos distintos son dos eventos: da ${dedupe.distintos}`);
ok(dedupe.mismoMomentoOtraRed === 2,
   'publicar el mismo producto en dos redes a la vez son DOS publicaciones, no una');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Publicar: 28 comprobaciones OK');
