/* «Productos que vendes sin comisión» — en un navegador de verdad.
 *
 * El gestor no vende sus productos: gana una COMISIÓN por cada uno, y la
 * línea de la venta copia ese campo. Un producto a la venta con la comisión
 * en blanco es, por tanto, trabajo que sale como ganancia cero en Inicio y
 * una fila que 🔀 Comparar no puede cruzar con la principal. En el catálogo
 * real son 14 con stock, entre ellos 306 unidades de aceite y 300 de cable.
 *
 * El Copiloto ya lo calculaba, pero solo lo decía en la pestaña 📊 Asesor de
 * la burbuja, que no es la pantalla que se mira. Ahora es una tarea de la
 * agenda de Inicio y su botón abre Productos con la lista ya filtrada.
 *
 * Lo que se comprueba aquí no se ve leyendo el fichero: que la tarea llegue a
 * la agenda (AGENDA_NO_MIAS la podría estar echando), que el botón deje la
 * pantalla filtrada de verdad, y que el filtro sea el mismo conjunto que la
 * tarea cuenta — si no coinciden, el número promete un trabajo que la lista
 * no enseña.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.ico':'image/x-icon' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

/* Cuatro casos que tienen que separarse:
   con stock y sin comisión  → es la tarea
   con stock y con comisión  → no
   con stock y comisión "0"  → sí: un cero escrito no es una comisión
   agotado y sin comisión    → no hoy (no lo puede vender; misma regla que
                               las filas «dormidas» de 🔀 Comparar)          */
const MIOS = [
    { id:'a1', nombre:'Aceite sin comisión',   categoria:'CARROS', stock:53, precioActual:25, comision:'',   activo:true },
    { id:'a2', nombre:'Cable sin comisión',    categoria:'WIFI',   stock:300, precioActual:280, comision:null, activo:true },
    { id:'a3', nombre:'Comisión escrita en 0', categoria:'WIFI',   stock:4,  precioActual:30, comision:'0',  activo:true },
    { id:'b1', nombre:'Router con comisión',   categoria:'WIFI',   stock:6,  precioActual:110, comision:'10', comisionMoneda:'USD', activo:true },
    { id:'b2', nombre:'Linterna en MN',        categoria:'HOGAR',  stock:9,  precioActual:12, comision:'1500', comisionMoneda:'MN', activo:true },
    { id:'c1', nombre:'Agotado sin comisión',  categoria:'GYM',    stock:0,  precioActual:35, comision:'',   activo:true },
];
const DEBEN = ['Aceite sin comisión', 'Cable sin comisión', 'Comisión escrita en 0'];
const NO_DEBEN = ['Router con comisión', 'Linterna en MN', 'Agotado sin comisión'];

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 1200 }, serviceWorkers: 'block' });
const erroresJs = [];
await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status:200, contentType:'application/json', body:'null' }));

const pagina = await ctx.newPage();
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil:'domcontentloaded', timeout:45000 });
await pagina.waitForTimeout(3000);
await pagina.evaluate(prods => {
    PRODUCTOS = prods;
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
}, MIOS);

// ── 1) El filtro es exactamente el conjunto de la tarea ──────────────
const cuenta = await pagina.evaluate(() => PRODUCTOS.filter(window.apSinComision).map(p => p.nombre));
ok(cuenta.length === 3, `deberían ser 3 y son ${cuenta.length}: ${JSON.stringify(cuenta)}`);
DEBEN.forEach(n => ok(cuenta.includes(n), `falta «${n}» en la lista`));
NO_DEBEN.forEach(n => ok(!cuenta.includes(n), `«${n}» no debería estar en la lista`));

// ── 2) El botón de la tarea deja la pantalla filtrada ────────────────
await pagina.evaluate(() => window.tmCopilotoAbrirTarea('productos-sin-comision'));
await pagina.waitForTimeout(900);
const pantalla = await pagina.evaluate(() => ({
    vista: (document.querySelector('.view.active') || {}).id || '',
    nombres: [...document.querySelectorAll('#prod-grid')].map(g => g.textContent).join(' '),
    cuenta: (document.getElementById('prod-count') || {}).textContent || '',
    boton: (document.getElementById('prod-filtro-com') || {}).style.color || '',
}));
ok(pantalla.vista === 'view-productos',
   `la tarea tiene que abrir Productos y abrió «${pantalla.vista}»`);
DEBEN.forEach(n => ok(pantalla.nombres.includes(n),
   `«${n}» tendría que estar en la lista al llegar desde la tarea`));
NO_DEBEN.forEach(n => ok(!pantalla.nombres.includes(n),
   `llegando desde la tarea, «${n}» sobra: 132 fichas y ningún indicio de cuáles eran es dejar la tarea a medias`));
ok(/sin comisión/i.test(pantalla.cuenta),
   `el contador tiene que decir qué lista es esta; dice «${pantalla.cuenta}»`);
ok(!!pantalla.boton, 'el botón del filtro tiene que verse encendido, o no se sabe cómo apagarlo');

// Llegar dos veces desde la tarea no puede apagar el filtro.
await pagina.evaluate(() => window.tmCopilotoAbrirTarea('productos-sin-comision'));
await pagina.waitForTimeout(600);
const otraVez = await pagina.evaluate(() => (document.getElementById('prod-count') || {}).textContent || '');
ok(/sin comisión/i.test(otraVez),
   `volver a tocar la tarea no puede alternar el filtro y dejarlo apagado; dice «${otraVez}»`);

// Y se puede quitar a mano.
await pagina.evaluate(() => window.apToggleFiltroComision());
await pagina.waitForTimeout(500);
const apagado = await pagina.evaluate(() => ({
    cuenta: (document.getElementById('prod-count') || {}).textContent || '',
    nombres: (document.getElementById('prod-grid') || {}).textContent || '',
}));
ok(/de 6 productos/.test(apagado.cuenta), `al apagarlo vuelven todos; dice «${apagado.cuenta}»`);
ok(apagado.nombres.includes('Router con comisión'), 'y la lista completa otra vez');

/* Tres estados, no dos: «no queda ninguno» y «no pude revisarlo» se ven
   igual —una lista vacía— y significan lo contrario. Sin el motor cargado, la
   pantalla no puede felicitarte. */
await pagina.evaluate(() => { delete window.tmSinComision; window.apFiltrarSinComision(); });
await pagina.waitForTimeout(700);
const roto = await pagina.evaluate(() => ({
    cuenta: (document.getElementById('prod-count') || {}).textContent || '',
    grid: (document.getElementById('prod-grid') || {}).textContent || '',
}));
ok(/no cargó|no pude/i.test(roto.cuenta + roto.grid),
   `sin el motor tiene que decir que no pudo revisarlo; dice «${roto.cuenta}» / «${roto.grid.slice(0,80)}»`);
ok(!/^0 a la venta|Todo lo que está a la venta tiene/.test(roto.cuenta + roto.grid),
   'una lista vacía porque el motor no cargó no puede leerse como «ya está todo hecho»');
await pagina.reload({ waitUntil:'domcontentloaded' });
await pagina.waitForTimeout(2500);
await pagina.evaluate(prods => {
    PRODUCTOS = prods;
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
}, MIOS);

// ── 3) La tarea llega a la agenda de Inicio ──────────────────────────
/* La agenda quita las tareas que NO son del gestor (reponer stock es del
   dueño). Ponerle precio a su propio trabajo es lo más suyo que hay, así que
   esta tiene que pasar el filtro. */
const enAgenda = await pagina.evaluate(() => {
    const t = [{ id:'x1', kind:'comision', urgency:2, icon:'❓',
                 title:'3 productos que vendes sin comisión',
                 detail:'357 unidades en venta de las que no sabes cuánto te dejan.',
                 action:'Ponerles la comisión', tab:'productos-sin-comision' }];
    window.tmCopilotoTareas = () => t.map(x => ({ ...x }));
    window.tmCopilotoListo = () => true;
    window.tmInicioAgenda();
    const caja = document.getElementById('inicio-agenda');
    return { txt: (caja || {}).textContent || '', html: (caja || {}).innerHTML || '' };
});
ok(/sin comisión/.test(enAgenda.txt),
   `la tarea no llega a la agenda —¿la está echando AGENDA_NO_MIAS?—: «${enAgenda.txt.slice(0,160)}»`);
ok(/Ponerles la comisión/.test(enAgenda.txt), 'con su botón, o no hay por dónde empezar');
ok(!/nada urgente/i.test(enAgenda.txt), 'y no puede decir que no hay nada que hacer');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Sin comisión: 20 comprobaciones OK');
