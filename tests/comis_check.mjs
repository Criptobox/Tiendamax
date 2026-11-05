/* Comisión por cobrar — admin.html
 *
 * La venta se cobra al cliente al momento, pero la COMISIÓN la paga el dueño al
 * mes. El panel la contaba como ganancia sin decir que aún no estaba en la
 * mano. Aquí se comprueba, en el navegador, lo que no se ve leyendo el código:
 *
 *  · lo pendiente se agrupa por mes y USD y MN nunca comparten cifra;
 *  · un mes ya terminado dice que «ya te lo deben» y el actual que sigue
 *    acumulándose (el dueño paga el mes cerrado);
 *  · marcar un mes como cobrado lo saca de lo pendiente (y de Inicio) sin
 *    tocar la venta, y deshacerlo lo devuelve;
 *  · la marca es por venta y gana la más nueva: deshacer escribe p:0, no
 *    borra, o el otro teléfono volvería a subirla.
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
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try { const b = await readFile(ruta); r.writeHead(200, {'Content-Type': MIME[extname(ruta)] || 'application/octet-stream'}); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const VENTAS = (() => {
    const hoy = new Date(), a = hoy.getFullYear(), m = hoy.getMonth();
    const t = (mes, dia) => new Date(a, mes, dia, 12).getTime();
    return [
        { id:t(m,1),   total:320, productos:[{producto:'Inversor 3000W', cantidad:1, precio:320, comision:38, comisionMoneda:'USD'}] },
        { id:t(m-1,5), total:180, productos:[{producto:'Router', cantidad:1, precio:180, comision:22, comisionMoneda:'USD'}] },
        { id:t(m-1,9), total:0, totalMN:9000, productos:[{producto:'Bombillo', cantidad:6, precio:1500, moneda:'MN', comision:300, comisionMoneda:'MN'}] },
        { id:t(m-1,12), total:40, productos:[{producto:'Cable sin comision', cantidad:1, precio:40}] },
    ];
})();
const ID_MES_PASADO = VENTAS[1].id, ID_MN = VENTAS[2].id, ID_ACTUAL = VENTAS[0].id;

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
for (const h of ['googleapis.com','gstatic.com','firebaseio.com','google-analytics.com','raw.githubusercontent.com','tiendamax.org'])
    await ctx.route(u => u.hostname.includes(h), r => r.abort());
await ctx.addInitScript(v => { localStorage.setItem('registroVentas', JSON.stringify(v)); localStorage.setItem('githubUser','quien'); localStorage.setItem('githubRepo','repo'); localStorage.setItem('githubToken','ghp_de_mentira'); }, VENTAS);
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 180)));
await pagina.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await pagina.waitForTimeout(3000);
await pagina.evaluate(() => {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
    go('ventas');
});
await pagina.waitForTimeout(1200);

const leer = () => pagina.evaluate(() => ({
    caja: document.getElementById('comis-box')?.innerText || '',
    fila: document.getElementById('hi-porcobrar-fila')?.style.display,
    inicio: document.getElementById('hi-porcobrar')?.textContent || '',
    ls: JSON.parse(localStorage.getItem('tm_comis_cobradas') || '{}'),
    ventasLS: localStorage.getItem('registroVentas'),
}));

// 1) Pendiente: 38 + 22 USD y 1,800 MN (6 bombillos × 300), cada uno en su moneda. La venta sin comisión no cuenta.
let v = await leer();
ok(/Comisión por cobrar/.test(v.caja), 'no sale el bloque «Comisión por cobrar» en Ventas.');
ok(/\$60/.test(v.caja) && /1,800/.test(v.caja) && /MN/.test(v.caja),
   `el total pendiente no cuadra (60 USD y 1,800 MN: 6 bombillos a 300): ${JSON.stringify(v.caja.slice(0, 160))}`);
ok(/3 ventas/.test(v.caja), `debería haber 3 ventas con comisión pendiente: ${JSON.stringify(v.caja.slice(0, 160))}`);
ok(!/\$1,860|\$1860/.test(v.caja), 'se sumaron USD y MN en una sola cifra.');
ok(/mes cerrado: ya te lo deben/.test(v.caja) && /mes en curso/.test(v.caja),
   'no distingue el mes cerrado (ya te lo deben) del mes en curso.');
ok(v.fila === 'flex' && /60/.test(v.inicio), `Inicio no avisa de lo pendiente: ${JSON.stringify(v.inicio)}`);

// 2) «Me pagaron» el mes pasado: solo queda el actual, la venta no se toca.
// Con el botón de verdad (su onclick): si la función no cuelga de window, el botón no hace nada y nada falla.
pagina.on('dialog', d => d.accept());
await pagina.evaluate(() => {
    const bs = [...document.querySelectorAll('#comis-box button')].filter(b => /Me pagaron/.test(b.textContent));
    bs[bs.length - 1].click();   // el mes más viejo = el mes pasado
});
await pagina.waitForTimeout(300);
v = await leer();
ok(v.ls[String(ID_MES_PASADO)] && v.ls[String(ID_MES_PASADO)].p === 1 && v.ls[String(ID_MN)].p === 1, 'no quedó apuntada la marca de cobrado por venta.');
ok(/1 venta/.test(v.caja) && !/1,800/.test(v.caja.split('Ya cobradas')[0]), `tras cobrar el mes pasado debería quedar solo 1 venta pendiente: ${JSON.stringify(v.caja.slice(0, 200))}`);
ok(/38/.test(v.inicio) && !/MN/.test(v.inicio), `Inicio debería enseñar solo lo del mes actual (38 USD): ${JSON.stringify(v.inicio)}`);
ok(/Ya cobradas \(2 ventas/.test(v.caja), `las cobradas deberían listarse aparte: ${JSON.stringify(v.caja.slice(-200))}`);
ok(v.ventasLS === JSON.stringify(VENTAS), 'marcar la comisión modificó las ventas (/ventas es inmutable: la marca va aparte).');

// 3) Todo cobrado: «estás al día» y Inicio sin la línea.
await pagina.evaluate(id => comisMarcar([id], true), ID_ACTUAL);
await pagina.waitForTimeout(300);
v = await leer();
ok(/Estás al día/.test(v.caja) && v.fila === 'none', 'con todo cobrado debería decir «estás al día» y quitar la línea de Inicio.');

// 4) Deshacer: escribe p:0 (no borra) y vuelve a lo pendiente.
await pagina.evaluate(id => comisMarcar([id], false), ID_MES_PASADO);
await pagina.waitForTimeout(300);
v = await leer();
ok(v.ls[String(ID_MES_PASADO)] && v.ls[String(ID_MES_PASADO)].p === 0 && v.ls[String(ID_MES_PASADO)].ts > 0,
   'deshacer debe escribir p:0 con fecha, no borrar la marca: el otro teléfono la volvería a subir.');
ok(/22/.test(v.caja) && /1 venta/.test(v.caja.split('Ya cobradas')[0]), `la venta deshecha no volvió a lo pendiente: ${JSON.stringify(v.caja.slice(0, 200))}`);

// 5) Dos teléfonos: gana la marca más nueva por venta.
const f = await pagina.evaluate(() => ({
    a: comisFusionar({x:{p:1,ts:10}}, {x:{p:0,ts:20}}),
    b: comisFusionar({x:{p:0,ts:30}}, {x:{p:1,ts:20}}),
    c: comisFusionar({x:{p:1,ts:1}}, {y:{p:1,ts:2}}),
}));
ok(f.a.x.p === 0 && f.b.x.p === 0 && f.c.x && f.c.y, `la fusión no deja ganar a la marca más nueva: ${JSON.stringify(f)}`);

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) { console.log('❌ comisión por cobrar:\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ comisión por cobrar: todo en orden');
