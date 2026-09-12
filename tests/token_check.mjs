/* El aviso de que hay que cambiar el token de GitHub.
 *
 * Cuando el PAT caduca, «Actualizar tienda» responde 401 y el panel lo
 * enseña como un fallo de red: se vuelve a tocar, y otra vez, y el catálogo
 * se queda sin publicar sin que nada explique por qué. GitHub no dice desde
 * el navegador cuándo vence, así que el gestor pone cuánto dura y con
 * cuántos días de antelación quiere el aviso, y el panel cuenta.
 *
 * Lo que se protege:
 *  · **Sin fecha de creación no se inventa una.** Un «te quedan 90 días»
 *    contado desde hoy, sobre un token que lleva tres meses puesto, es el
 *    dato falso exacto que se venía a dar. Son tres estados: no lo sé /
 *    faltan N / ya venció.
 *  · **Pegar un token distinto reinicia el reloj solo.** Es lo único que
 *    hace que el aviso siga sirviendo sin apuntar fechas a mano — y volver a
 *    pulsar Guardar con el MISMO token no puede reiniciarlo, porque en
 *    GitHub no se renovó nada.
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

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try { const c = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(c);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

let SUBIDO = null;
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 1200 }, serviceWorkers: 'block' });
await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => {
    const req = r.request();
    if (req.url().includes('/privado/github_token.json')) {
        if (req.method() === 'PUT') { SUBIDO = JSON.parse(req.postData() || 'null');
            return r.fulfill({ status: 200, contentType: 'application/json', body: req.postData() }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUBIDO) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
});
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 180)));
await pagina.addInitScript(() => {
    localStorage.setItem('firebaseConfig', JSON.stringify({
        projectId: 'tiendamax-8feb5',
        databaseURL: 'https://tiendamax-8feb5-default-rtdb.firebaseio.com' }));
});
await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
await pagina.waitForTimeout(2500);
await pagina.evaluate(() => {
    window.TMAuth = Object.assign(window.TMAuth || {}, { token: async () => 'tok' });
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
    go('config');
});
await pagina.waitForTimeout(900);

// ── 1) Sin fecha: no se inventa una cuenta atrás ─────────────────────
const sinFecha = await pagina.evaluate(() => {
    localStorage.removeItem('tm_token_meta'); localStorage.removeItem('tm_token_huella');
    tmTokenPintarEstado();
    return { txt: document.getElementById('ghTokenVence').textContent,
             dias: tmTokenDiasRestantes(), toca: tmTokenToca() };
});
ok(sinFecha.dias === null,
   `sin saber cuándo se creó, los días que faltan son desconocidos, no un número: dio ${sinFecha.dias}`);
ok(/No sé desde cuándo/.test(sinFecha.txt),
   `y la pantalla tiene que decirlo, no callarse: «${sinFecha.txt}»`);
ok(sinFecha.toca === false, 'y sin saberlo no se avisa de nada: sería una alarma inventada');

// ── 2) Con fecha: cuenta, y avisa cuando toca ────────────────────────
const cuenta = await pagina.evaluate(() => {
    const dia = 86400000, r = {};
    const poner = (hace, dias, aviso) => {
        localStorage.setItem('tm_token_meta', JSON.stringify({ creado: Date.now() - hace * dia, dias, aviso }));
    };
    poner(10, 90, 5);  tmTokenPintarEstado();
    r.tranquilo = { d: tmTokenDiasRestantes(), toca: tmTokenToca(), txt: document.getElementById('ghTokenVence').textContent };
    poner(86, 90, 5);  tmTokenPintarEstado();
    r.cerca = { d: tmTokenDiasRestantes(), toca: tmTokenToca(), txt: document.getElementById('ghTokenVence').textContent };
    poner(95, 90, 5);  tmTokenPintarEstado();
    r.vencido = { d: tmTokenDiasRestantes(), toca: tmTokenToca(), txt: document.getElementById('ghTokenVence').textContent };
    poner(30, 30, 3);  // duración distinta a la de por defecto
    r.otraDuracion = { d: tmTokenDiasRestantes(), toca: tmTokenToca() };
    return r;
});
ok(cuenta.tranquilo.d === 80 && cuenta.tranquilo.toca === false,
   `a 10 días de puesto un token de 90 faltan 80 y no se avisa; dio ${JSON.stringify(cuenta.tranquilo)}`);
ok(cuenta.cerca.d === 4 && cuenta.cerca.toca === true,
   `con 4 días por delante y aviso de 5, toca avisar; dio ${JSON.stringify(cuenta.cerca)}`);
ok(/faltan 4 días/.test(cuenta.cerca.txt), `y decirlo en días, no en fechas a calcular: «${cuenta.cerca.txt}»`);
ok(cuenta.vencido.d === -5 && cuenta.vencido.toca === true,
   `vencido hace 5 días tiene que salir negativo, no cero; dio ${JSON.stringify(cuenta.vencido)}`);
ok(/Venció hace 5 días/.test(cuenta.vencido.txt) && /parece falta de internet/.test(cuenta.vencido.txt),
   `y explicar cómo se va a manifestar el fallo, o se busca en el sitio equivocado: «${cuenta.vencido.txt}»`);
ok(cuenta.otraDuracion.d === 0 && cuenta.otraDuracion.toca === true,
   `la duración es la que puso el gestor, no 90 fijos; dio ${JSON.stringify(cuenta.otraDuracion)}`);

// ── 3) Un token distinto reinicia el reloj; el mismo, no ─────────────
const reloj = await pagina.evaluate(async () => {
    const dia = 86400000;
    localStorage.setItem('tm_token_meta', JSON.stringify({ creado: Date.now() - 88 * dia, dias: 90, aviso: 5 }));
    localStorage.removeItem('tm_token_huella');
    document.getElementById('githubUser').value = 'quien';
    document.getElementById('githubRepo').value = 'repo';
    document.getElementById('githubToken').value = 'ghp_viejo_viejo';
    document.getElementById('ghTokenDias').value = '90';
    document.getElementById('ghTokenAviso').value = '5';
    const enviar = () => document.getElementById('githubConfigForm')
        .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    enviar();                                  // primera vez: token que no había visto
    const trasPrimero = tmTokenDiasRestantes();
    /* Y ahora el caso que de verdad distingue: el reloj YA lleva 88 días
       corriendo. Volver a pulsar Guardar con el mismo token no puede
       ponerlo a 90 — en GitHub no se renovó nada. Sin retrasar el reloj a
       mano, guardar dos veces seguidas da 90 con guardia y sin ella. */
    const m = JSON.parse(localStorage.getItem('tm_token_meta'));
    m.creado = Date.now() - 88 * dia;
    localStorage.setItem('tm_token_meta', JSON.stringify(m));
    enviar();                                  // otra vez el MISMO token
    const trasRepetir = tmTokenDiasRestantes();
    document.getElementById('githubToken').value = 'ghp_otro_distinto';
    enviar();                                  // token distinto
    await new Promise(r => setTimeout(r, 300));
    return { trasPrimero, trasRepetir, trasCambiar: tmTokenDiasRestantes() };
});
ok(reloj.trasPrimero === 90,
   `guardar un token que el panel no había visto pone el reloj a cero; dio ${reloj.trasPrimero}`);
ok(reloj.trasRepetir === 2,
   `volver a pulsar Guardar con el MISMO token no renueva nada en GitHub, así que tampoco aquí: `
   + `tenía 2 días por delante y quedó en ${reloj.trasRepetir}`);
ok(reloj.trasCambiar === 90,
   `pegar un token distinto sí reinicia la cuenta; dio ${reloj.trasCambiar}`);

// ── 4) Se guarda fuera del teléfono ──────────────────────────────────
ok(SUBIDO && Number(SUBIDO.creado) > 0 && Number(SUBIDO.dias) === 90 && Number(SUBIDO.aviso) === 5,
   `los tres números van a /privado/github_token, o cambiar de teléfono es volver a no saber: ${JSON.stringify(SUBIDO)}`);
ok(SUBIDO && !JSON.stringify(SUBIDO).includes('ghp_'),
   `el token NO puede subir: solo las fechas. Subió ${JSON.stringify(SUBIDO)}`);

// ── 5) La tarea llega a la agenda ────────────────────────────────────
const enAgenda = await pagina.evaluate(() => {
    const dia = 86400000;
    localStorage.setItem('tm_token_meta', JSON.stringify({ creado: Date.now() - 88 * dia, dias: 90, aviso: 5 }));
    const t = [{ id: 'tk', kind: 'token', urgency: 3, icon: '🔑',
                 title: 'El token de GitHub vence en 2 días',
                 detail: 'Cuando venza, «Actualizar tienda» fallará con un 401.',
                 action: 'Renovarlo ya', tab: 'configuracion' }];
    window.tmCopilotoTareas = () => t.map(x => ({ ...x }));
    window.tmCopilotoListo = () => true;
    window.tmInicioAgenda();
    return (document.getElementById('inicio-agenda') || {}).textContent || '';
});
ok(/token de GitHub/.test(enAgenda) && /Renovarlo ya/.test(enAgenda),
   `la tarea tiene que llegar a la agenda de Inicio: «${enAgenda.slice(0, 160)}»`);

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Aviso del token: 15 comprobaciones OK');
