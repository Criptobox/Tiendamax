/* Inicio, para un GESTOR — admin.html
 *
 * Quien usa este panel no es el dueño de los productos: cobra una comisión por
 * lo que vende. De ahí las tres cosas que se comprueban aquí, todas invisibles
 * si se rompen:
 *
 *  · La tarjeta grande enseña SU ganancia, no el valor del inventario. Ese
 *    número es de otro y no depende de él.
 *  · USD y MN nunca comparten cifra. Sumarlos da un número que no existe —la
 *    tasa cambia cada semana— y ya pasó una vez en la lista de comisiones,
 *    donde 300 MN se leían como $300.
 *  · Los bloques sin datos se pliegan a una línea. El gráfico de 7 días salía
 *    plano en cero casi siempre y se comía 160 px para no decir nada.
 *
 * Se corre solo (`node tests/inicio_check.mjs`) y desde unittest
 * (tests/test_agenda_inicio.py). Sale con código 1 si algo falla.
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

// Ventas de muestra: dos monedas, dos meses. Con comisión por línea y por
// cantidad, que es como las guarda el panel de verdad.
const VENTAS = (() => {
    const hoy = new Date(), a = hoy.getFullYear(), m = hoy.getMonth();
    const t = (mes, dia) => new Date(a, mes, dia, 12).getTime();
    return [
        { id:t(m,1),   total:320, productos:[{producto:'Inversor', cantidad:1, precio:320, comision:38, comisionMoneda:'USD'}] },
        { id:t(m,2),   total:0, totalMN:9000, productos:[{producto:'Bombillo', cantidad:6, precio:1500, moneda:'MN', comision:300, comisionMoneda:'MN'}] },
        { id:t(m-1,5), total:180, productos:[{producto:'Router', cantidad:1, precio:180, comision:22, comisionMoneda:'USD'}] },
    ];
})();

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
for (const h of ['googleapis.com','gstatic.com','firebaseio.com','google-analytics.com','raw.githubusercontent.com','tiendamax.org'])
    await ctx.route(u => u.hostname.includes(h), r => r.abort());
await ctx.addInitScript(v => localStorage.setItem('registroVentas', JSON.stringify(v)), VENTAS);
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 180)));
await pagina.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await pagina.waitForTimeout(3000);
await pagina.evaluate(() => {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
    if (typeof go === 'function') go('inicio');
});
await pagina.waitForTimeout(1500);

const v = await pagina.evaluate(() => ({
    usd: document.getElementById('hi-gan-usd')?.textContent || '',
    mn:  document.getElementById('hi-gan-mn')?.textContent || '',
    etiqueta: document.querySelector('#inicio-hero .hi-lbl')?.textContent || '',
    kpis: [...document.querySelectorAll('#inicio-kpis .kpi .lbl')].map(x => x.textContent),
    graficos: document.querySelectorAll('#inicio-graf .bar-chart').length,
    grafTxt: document.getElementById('inicio-graf')?.innerText || '',
    masDeja: document.getElementById('inicio-top')?.innerText || '',
}));

// 1) La tarjeta grande es la ganancia del gestor, no el inventario.
ok(/ganancia/i.test(v.etiqueta),
   `la tarjeta grande dejó de ser la ganancia: ${JSON.stringify(v.etiqueta)}`);
ok(!/inventario/i.test(v.etiqueta),
   'la tarjeta grande volvió al valor del inventario, que no es dinero del gestor.');

// 2) Las dos monedas, en dos sitios, con su comisión × cantidad bien contada.
//    38 USD de una venta + 22 de la del mes pasado = 60. MN: 300 × 6 = 1800.
ok(v.usd.includes('60') && !/MN/.test(v.usd),
   `la ganancia en USD no cuadra o se le coló MN: ${JSON.stringify(v.usd)}`);
ok(v.mn.includes('1,800') && /MN/.test(v.mn),
   `la ganancia en MN no cuadra o no dice de qué moneda es: ${JSON.stringify(v.mn)}`);

// 3) Nada de stock como alerta: reponer no depende del gestor.
const stockEnKpis = v.kpis.filter(l => /agotad|stock bajo/i.test(l));
ok(stockEnKpis.length === 0,
   `volvió una tarjeta de almacén a Inicio: ${JSON.stringify(stockEnKpis)}`);

// 4) El gráfico separa las monedas en dos, cada una con su escala.
ok(v.graficos === 2, `deberían ser dos gráficos (USD y MN) y hay ${v.graficos}`);
ok(/EN USD/.test(v.grafTxt) && /EN MN/.test(v.grafTxt),
   'los gráficos no dicen de qué moneda es cada uno.');

// 5) Y "lo que más te deja" es comisión, no unidades vendidas.
ok(/\$/.test(v.masDeja), `"lo que más te deja" no enseña dinero: ${JSON.stringify(v.masDeja.slice(0,80))}`);

// 6) Sin ninguna comisión, el bloque del gráfico se pliega a una línea en vez
//    de dejar 160 px de barras en cero.
//    Se comprueba como pasa de verdad —una pestaña sin ninguna venta— y no
//    llamando a la función por dentro: lo que importa es lo que ve quien abre
//    el panel recién instalado.
const ctxVacio = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
for (const h of ['googleapis.com','gstatic.com','firebaseio.com','google-analytics.com','raw.githubusercontent.com','tiendamax.org'])
    await ctxVacio.route(u => u.hostname.includes(h), r => r.abort());
await ctxVacio.addInitScript(() => localStorage.setItem('registroVentas', '[]'));
const pv = await ctxVacio.newPage();
await pv.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await pv.waitForTimeout(3000);
await pv.evaluate(() => {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
    if (typeof go === 'function') go('inicio');
});
await pv.waitForTimeout(1200);
const vacio = await pv.evaluate(() => {
    const box = document.getElementById('inicio-graf');
    return { barras: box.querySelectorAll('.bar-chart').length, txt: box.innerText,
             masDeja: document.getElementById('inicio-top')?.innerText || '',
             alto: Math.round(box.getBoundingClientRect().height) };
});
ok(vacio.barras === 0,
   'sin comisiones el gráfico sigue dibujando barras en cero — el hueco que se venía a quitar.');
ok(/sin comisiones/i.test(vacio.txt),
   `plegado sin decir por qué: ${JSON.stringify(vacio.txt)}`);
ok(vacio.alto < 90,
   `el bloque plegado sigue ocupando ${vacio.alto} px; la idea era una línea.`);
ok(vacio.masDeja.length < 140 && !/^\s*$/.test(vacio.masDeja),
   `"lo que más te deja" vacío debería ser una frase corta, no un bloque: ${JSON.stringify(vacio.masDeja)}`);

ok(erroresJs.length === 0, 'errores de JS en Inicio: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s) en Inicio:\n' + fallos.map(f => '  · ' + f).join('\n'));
    process.exit(1);
}
console.log('✅ Inicio (gestor): ganancia en la tarjeta grande, USD y MN sin mezclar, sin bloques vacíos.');
