/* Tema de temporada (Navidad / Halloween) — index.html + admin.html
 *
 * La fecha lo propone y el dueño lo confirma, lo cambia o lo apaga en
 * ⚙️ Configuración (config.json → tema). Nada de esto se ve leyendo el código:
 *
 *  · la regla: qué toca cada día, que un "apagado" valga solo para esa
 *    temporada y que un tema puesto a mano caduque;
 *  · la tienda se viste antes de pintar con lo último que dijo config.json, y
 *    obedece a config.json cuando llega (apagado = sin atributo);
 *  · ?tema= es una vista previa: config.json no la pisa ni se guarda;
 *  · el panel, al tocar «Apagado», sube config.json CON TODO lo demás
 *    (tasa, Firebase…) y solo cambia `tema`.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.ico':'image/x-icon' };
const CONFIG = JSON.parse(await readFile(join(RAIZ, 'config.json'), 'utf8'));
let configServida = CONFIG;
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    if (q.url.startsWith('/config.json')) { r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify(configServida)); }
    try { const b = await readFile(ruta); r.writeHead(200, {'Content-Type': MIME[extname(ruta)] || 'application/octet-stream'}); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
const DIC = new Date('2026-12-10T12:00:00');

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
for (const h of ['googleapis.com','gstatic.com','firebaseio.com','google-analytics.com','raw.githubusercontent.com','tiendamax.org'])
    await ctx.route(u => u.hostname.includes(h), r => r.abort());
const erroresJs = [];

// 1) La regla, en el navegador (es la misma copia en la tienda y en el panel).
{
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${PUERTO}/index.html?tema=no`, { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate(() => {
        const d = s => new Date(s + 'T12:00:00');
        const ahora = d('2026-12-10').getTime();
        return {
            dic1: tmTemaPorFecha(d('2026-12-01')), ene6: tmTemaTemporada(d('2027-01-06')), ene7: tmTemaPorFecha(d('2027-01-07')),
            oct23: tmTemaPorFecha(d('2026-10-23')), oct24: tmTemaPorFecha(d('2026-10-24')), nov1: tmTemaPorFecha(d('2026-11-01')), nov2: tmTemaPorFecha(d('2026-11-02')),
            auto: tmTemaEfectivo(null, d('2026-12-10')),
            offEsta: tmTemaEfectivo({ modo: 'off', temporada: 'navidad-2026', ts: ahora }, d('2026-12-10')),
            offOtra: tmTemaEfectivo({ modo: 'off', temporada: 'halloween-2026', ts: ahora }, d('2026-12-10')),
            offAnoSig: tmTemaEfectivo({ modo: 'off', temporada: 'navidad-2026', ts: ahora }, d('2027-12-10')),
            mano: tmTemaEfectivo({ modo: 'halloween', ts: ahora }, d('2026-12-20')),
            manoCaduca: tmTemaEfectivo({ modo: 'halloween', ts: ahora }, d('2027-02-01')),
        };
    });
    ok(r.dic1 === 'navidad' && r.ene6 === 'navidad-2026' && r.ene7 === '', `Navidad va del 1 dic al 6 ene (y el 6 ene es la del año anterior): ${JSON.stringify(r)}`);
    ok(r.oct23 === '' && r.oct24 === 'halloween' && r.nov1 === 'halloween' && r.nov2 === '', `Halloween va del 24 oct al 1 nov: ${JSON.stringify(r)}`);
    ok(r.auto === 'navidad', 'sin elección, la fecha manda');
    ok(r.offEsta === '' && r.offOtra === 'navidad' && r.offAnoSig === 'navidad',
       `un «apagado» vale solo para la temporada en que se apagó: ${JSON.stringify(r)}`);
    ok(r.mano === 'halloween' && r.manoCaduca === '', `un tema puesto a mano manda, pero caduca a los 45 días: ${JSON.stringify(r)}`);
    await p.close();
}

// 2) La tienda: viste por fecha, obedece a config.json y recuerda para la próxima visita.
const tienda = async (url, cfg, ls) => {
    configServida = cfg;
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('tienda: ' + String(e).slice(0, 160)));
    await p.clock.setFixedTime(DIC);
    if (ls) await p.addInitScript(v => localStorage.setItem('tm_tema_cfg', v), ls);
    await p.goto(`http://localhost:${PUERTO}/${url}`, { waitUntil: 'domcontentloaded' });
    const antes = await p.evaluate(() => document.documentElement.getAttribute('data-tema'));
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({ despues: document.documentElement.getAttribute('data-tema'), ls: localStorage.getItem('tm_tema_cfg'),
        icono: document.querySelector('link[rel="icon"][sizes="32x32"]').getAttribute('href'), apple: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href') }));
    await p.close();
    return Object.assign({ antes }, r);
};
const OFF = { modo: 'off', temporada: 'navidad-2026', ts: DIC.getTime() };
let t = await tienda('index.html', CONFIG);
ok(t.antes === 'navidad' && t.despues === 'navidad', `el 10 de diciembre, sin elección, la tienda va de Navidad: ${JSON.stringify(t)}`);
ok(t.icono === '/iconos/navidad/favicon-32.png' && t.apple === '/iconos/navidad/apple-touch-icon.png', `el icono de la pestaña sigue al tema: ${t.icono} · ${t.apple}`);
t = await tienda('index.html', Object.assign({}, CONFIG, { tema: OFF }));
ok(t.despues === null, `apagado en config.json → la tienda sin tema: ${JSON.stringify(t)}`);
ok(/^\/iconos\/favicon-32\.png/.test(t.icono), `apagado → el icono de siempre: ${t.icono}`);
ok(t.ls && JSON.parse(t.ls).modo === 'off', 'la elección se recuerda para pintar la próxima visita sin esperar la red');
t = await tienda('index.html', Object.assign({}, CONFIG, { tema: OFF }), JSON.stringify(OFF));
ok(t.antes === null, `con lo recordado, la visita siguiente ya nace sin tema (sin parpadeo de Navidad): ${JSON.stringify(t)}`);
const MARCA = JSON.stringify({ modo: 'auto', ts: 1 });
t = await tienda('index.html?tema=halloween', Object.assign({}, CONFIG, { tema: OFF }), MARCA);
ok(t.antes === 'halloween' && t.despues === 'halloween', `?tema= es la vista previa y config.json no la pisa: ${JSON.stringify(t)}`);
ok(t.ls === MARCA, `?tema= no se guarda (ni pisa lo recordado): ${t.ls}`);

// 3) El panel: «Apagado» sube config.json entero con solo `tema` cambiado.
const REPO = { 'config.json': JSON.stringify(CONFIG) };
const PUTS = [];
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
await ctx.route(u => u.hostname === 'api.github.com', r => {
    const req = r.request(), url = req.url(), ruta = (url.split('/contents/')[1] || '').split('?')[0];
    if (req.method() === 'PUT') {
        const txt = Buffer.from(JSON.parse(req.postData()).content, 'base64').toString('utf8');
        REPO[ruta] = txt; PUTS.push(ruta);
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' + PUTS.length } }) });
    }
    if (url.includes('/contents/')) {
        const c = REPO[ruta];
        if (!ruta) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return r.fulfill({ status: c ? 200 : 404, contentType: 'application/json', body: c ? JSON.stringify({ sha: 'x', encoding: 'base64', content: b64(c) }) : '{}' });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
});
{
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('panel: ' + String(e).slice(0, 160)));
    p.on('dialog', d => d.accept());
    await p.clock.setFixedTime(DIC);
    await p.addInitScript(() => { localStorage.setItem('githubUser', 'quien'); localStorage.setItem('githubRepo', 'repo'); localStorage.setItem('githubToken', 'ghp_de_mentira'); });
    await p.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(3500);
    ok(await p.evaluate(() => !document.documentElement.hasAttribute('data-tema')), 'el panel nunca se viste: el tema es de la tienda');
    await p.evaluate(() => { document.getElementById('adminPanel')?.classList.remove('hidden'); document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none'); go('config'); });
    const est0 = await p.evaluate(() => document.getElementById('temaEstado').innerText);
    ok(/hoy toca 🎄 Navidad/.test(est0) && /muestra: 🎄 Navidad/.test(est0), `Configuración dice qué toca y qué se ve: ${JSON.stringify(est0)}`);
    // El botón de verdad: si temaElegir no colgara de window, no haría nada y nada fallaría.
    await p.evaluate(() => [...document.querySelectorAll('#temaOpciones button')].find(b => /Apagado/.test(b.textContent)).click());
    await p.waitForTimeout(6000);
    const est1 = await p.evaluate(() => document.getElementById('temaEstado').innerText);
    ok(PUTS.includes('config.json'), `«Apagado» no subió config.json (PUTs: ${JSON.stringify(PUTS)}; ${est1})`);
    const subido = JSON.parse(REPO['config.json']);
    ok(subido.tema && subido.tema.modo === 'off' && subido.tema.temporada === 'navidad-2026', `tema subido: ${JSON.stringify(subido.tema)}`);
    ok(subido.tasaMN === CONFIG.tasaMN && JSON.stringify(subido.firebaseConfig) === JSON.stringify(CONFIG.firebaseConfig),
       'al subir el tema se perdió otra clave de config.json');
    ok(/muestra: sin tema/.test(est1) && /Guardado/.test(est1), `tras apagar, la pantalla lo dice: ${JSON.stringify(est1)}`);
    // «Actualizar tienda» reescribe config.json: el tema tiene que viajar.
    const viaja = await p.evaluate(() => JSON.stringify(window.tmTemaParaSubir(null)));
    ok(/"modo":"off"/.test(viaja), `tmTemaParaSubir no devuelve la elección local: ${viaja}`);
    await p.close();
}

ok(!erroresJs.length, 'errores de JS: ' + erroresJs.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('FALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
console.log('tema_check: todo bien');
