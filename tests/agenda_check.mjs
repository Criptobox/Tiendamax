/* La agenda de Inicio — admin.html + js/admin-copilot.js
 *
 * Lo que se protege es una mentira, no una excepción. La agenda enseña las
 * tareas que calcula el Copiloto, y entre "todavía no las he calculado" y "no
 * hay ninguna" hay dos estados que se ven igual si no se separan a propósito:
 * mientras el motor no termina, la pantalla decía "✅ Nada urgente ahora
 * mismo" con 59 productos agotados. Nada falla, nada avisa, y el dueño cierra
 * el panel tranquilo.
 *
 * Se corre solo (`node tests/agenda_check.mjs`) y desde unittest
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
try { ({ chromium } = requerir('/opt/pw-browsers/../node22/lib/node_modules/playwright/index.js')); } catch (e) {}
if (!chromium) {
    try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
    catch (e) { try { ({ chromium } = requerir('playwright')); }
    catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }
}

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

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
// Sin red: la agenda tiene que pintarse igual, y así el test no depende de nada.
for (const h of ['googleapis.com','gstatic.com','firebaseio.com','google-analytics.com','raw.githubusercontent.com','tiendamax.org'])
    await ctx.route(u => u.hostname.includes(h), r => r.abort());
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 180)));
await pagina.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await pagina.waitForTimeout(3000);
await pagina.evaluate(() => {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
});

// Los onclick= de la agenda se resuelven contra el ámbito global y el código
// vive dentro de un IIFE: sin export, los botones son decoración.
const globales = await pagina.evaluate(() => ['agendaAbrir','agendaHecho','agendaVerTodas','tmInicioAgenda']
    .filter(n => typeof window[n] !== 'function'));
ok(globales.length === 0, `estos onclick de la agenda no llegan al ámbito global: ${globales.join(', ')}`);

const pintar = (tareas, listo) => pagina.evaluate(({ tareas, listo }) => {
    window.tmCopilotoTareas = () => tareas;
    window.tmCopilotoListo = () => listo;
    window.tmInicioAgenda();
    const a = document.getElementById('inicio-agenda');
    return { txt: a.innerText, filas: a.querySelectorAll('.agenda-t').length,
             acciones: [...a.querySelectorAll('.agenda-t .ac .go')].map(b => b.textContent) };
}, { tareas, listo });

// 1) Aún calculando, sin tareas todavía → NO puede decir que todo está bien.
let r = await pintar([], false);
ok(!/nada urgente/i.test(r.txt),
   `mientras el motor no ha terminado la agenda dice que no hay nada urgente: ${JSON.stringify(r.txt)}`);
ok(/revisando/i.test(r.txt), `no avisa de que está revisando: ${JSON.stringify(r.txt)}`);

// 2) Ya calculó y de verdad no hay nada.
r = await pintar([], true);
ok(/nada urgente/i.test(r.txt), `con el cálculo hecho y cero tareas debería decirlo: ${JSON.stringify(r.txt)}`);

// 3) Con tareas: se pintan con su acción, y el nombre del producto va escapado.
r = await pintar([
    { id:'t1', urgency:3, icon:'🔴', title:'59 productos agotados', detail:'Batería <b>Must</b>', action:'Gestionar', tab:'manage-products' },
    { id:'t2', urgency:2, icon:'⚠️', title:'3 con stock bajo', detail:'x', action:'Ver stock', tab:'manage-products' },
    { id:'t3', urgency:1, icon:'🤖', title:'IA no configurada', detail:'y', action:'Configurar', tab:'configuracion' },
    { id:'t4', urgency:1, icon:'📦', title:'cuarta', detail:'z', action:'Abrir', tab:'inicio' },
], true);
ok(r.filas === 3, `la agenda debería enseñar 3 tareas y enseña ${r.filas}`);
ok(r.acciones.join('|') === 'Gestionar|Ver stock|Configurar',
   `los botones no llevan la acción de su tarea: ${JSON.stringify(r.acciones)}`);
ok(/otras 1/.test(r.txt), 'no ofrece abrir el copiloto para ver las que no caben');
// El detalle sale de nombres de producto, que los escribe el dueño.
const crudo = await pagina.evaluate(() => document.getElementById('inicio-agenda').innerHTML);
ok(!crudo.includes('<b>Must</b>'),
   'el detalle de la tarea entra sin escapar: un nombre con < > rompería la agenda.');

// 4) El pie con el resumen sigue ahí en los tres estados: es lo que sustituyó
//    al banner del robot y no puede desaparecer con las tareas.
ok(/producto/i.test(r.txt), `el pie con el resumen del catálogo desapareció: ${JSON.stringify(r.txt)}`);

ok(erroresJs.length === 0, 'errores de JS al pintar la agenda: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s) en la agenda de Inicio:\n' + fallos.map(f => '  · ' + f).join('\n'));
    process.exit(1);
}
console.log('✅ agenda de Inicio: tres estados, escapado, acciones y exports al ámbito global.');
