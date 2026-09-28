/* «✅ Entregado → registrar venta» del vale, de punta a punta: vale.html →
 * admin.html#reservas → venta registrada.
 *
 * Todo esto falla sin error. Una venta que no se registra no suma comisión
 * en Inicio y nadie lo nota; una registrada dos veces, o que descuenta el
 * stock otra vez, deja el catálogo diciendo que quedan menos de las que hay;
 * y un vale del cliente siguiente que arrastra la reserva del anterior
 * registra la venta a la persona equivocada.
 *
 *  - El vale enseña la comisión (USD y MN aparte) y avisa de lo que no tiene.
 *  - Entregado: reserva si hacía falta, apunta cuál es y abre el panel.
 *  - El panel pone ESA reserva arriba y destacada; ejecutarla registra la
 *    venta con su comisión y sin volver a tocar el stock.
 *  - De vuelta en el vale, el historial dice ✅ Vendido.
 *  - «Nuevo cliente» vacía los productos y la reserva del anterior.
 *  - Un vale escrito a mano no ofrece registrar (no se sabe qué producto es).
 *
 * Se corre solo (`node tests/vale_venta_check.mjs`) y desde unittest
 * (tests/test_vale_venta.py). Sale con 1 si algo falla.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const servidor = createServer(async (q, r) => {
    const camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino.startsWith('/fakedb/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('null'); return; }
    try {
        const cuerpo = await readFile(normalize(join(RAIZ, camino === '/' ? '/index.html' : camino)));
        r.writeHead(200, { 'Content-Type': MIME[extname(camino)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
let comprobaciones = 0;
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };
async function esperar(pagina, expr, ms = 10000) {
    try { await pagina.waitForFunction(expr, null, { timeout: ms }); return true; }
    catch (e) { return false; }
}

// Dos productos reales en stock: uno con comisión y otro sin ella.
const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const disp = CATALOGO.filter(p => Number(p.stock) >= 2);
const CON = disp.find(p => Number(p.comision) > 0 && String(p.comisionMoneda || 'USD').toUpperCase() === 'USD');
const SIN = disp.find(p => !(Number(p.comision) > 0));
if (!CON || !SIN) { console.log('el catálogo no tiene un producto con comisión y otro sin ella en stock — se salta'); process.exit(0); }

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 420, height: 900 } });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const errores = [];
await ctx.addInitScript(([puerto, cat]) => {
    if (!localStorage.getItem('__tm_prueba')) {
        localStorage.setItem('__tm_prueba', '1');
        localStorage.setItem('firebaseConfig', JSON.stringify({ apiKey: 'x', projectId: 'p', databaseURL: `http://localhost:${puerto}/fakedb` }));
        localStorage.setItem('productos', JSON.stringify(cat));
    }
    window.confirm = () => true;
    window.__copiado = [];
    try {
        Object.defineProperty(navigator, 'clipboard', { configurable: true,
            value: { writeText: t => { window.__copiado.push(t); return Promise.resolve(); } } });
    } catch (e) {}
}, [PUERTO, CATALOGO]);

const vale = await ctx.newPage();
vale.on('pageerror', e => errores.push('vale: ' + String(e).slice(0, 200)));
await vale.goto(`http://localhost:${PUERTO}/vale.html`);
await esperar(vale, 'typeof valeEntregado === "function"');

// 1) Vale escrito a mano: no hay botón de registrar.
const aMano = await vale.evaluate(() => {
    document.getElementById('vCliente').value = 'Cliente A Mano';
    document.getElementById('vTelefono').value = '53 1111 2222';
    document.getElementById('vArticulo').value = '1x Algo escrito a mano';
    goStep(3);
    return { btn: !!document.querySelector('#ventaBox .btn-venta'), txt: document.getElementById('ventaBox').textContent };
});
ok(!aMano.btn && /Elegir del catálogo/.test(aMano.txt), `un vale escrito a mano ofrece registrar la venta sin saber qué producto es: «${aMano.txt}»`);

// 2) Vale del catálogo: comisión a la vista, Entregado reserva y abre el panel.
const stockAntes = Number(CON.stock);
const caja = await vale.evaluate(([con, sin]) => {
    resetForm();
    document.getElementById('vCliente').value = 'María Pérez';
    document.getElementById('vTelefono').value = '53 5555 1234';
    agregarProductoVale(con.nombre, Number(con.precioActual) || 0, String(con.id));
    agregarProductoVale(sin.nombre, Number(sin.precioActual) || 0, String(sin.id));
    goStep(3);
    const b = document.getElementById('ventaBox');
    return { txt: b.textContent, btn: !!b.querySelector('.btn-venta') };
}, [CON, SIN]);
ok(caja.btn, 'el vale con productos del catálogo no ofrece «Entregado → registrar venta»');
ok(caja.txt.includes('$' + Number(CON.comision).toLocaleString('es-CU') + ' USD'), `el vale no enseña la comisión de «${CON.nombre}»: «${caja.txt.slice(0, 300)}»`);
ok(caja.txt.includes('sin comisión') && /no tiene comisión/.test(caja.txt), `no avisa de que «${SIN.nombre}» no tiene comisión: «${caja.txt.slice(0, 300)}»`);

await Promise.all([
    vale.waitForURL(/admin\.html#reservas/, { timeout: 15000 }).catch(() => {}),
    vale.evaluate(() => { valeEntregado(); }),
]);
ok(/admin\.html#reservas$/.test(vale.url()), `«Entregado» no abrió el panel en Reservas: ${vale.url()}`);

// 3) El panel: esa reserva arriba y destacada; ejecutarla registra la venta.
const panel = vale;   // misma pestaña
await esperar(panel, 'typeof reservaVender === "function" && document.querySelector("#reservasContenido")', 20000);
await panel.evaluate(() => {
    const m = document.getElementById('loginModal'); if (m) m.classList.add('hidden');
    const a = document.getElementById('adminPanel'); if (a) a.classList.remove('hidden');
    renderReservas();
});
const antes = await panel.evaluate(() => {
    const apunte = JSON.parse(localStorage.getItem('tm_vale_vender') || 'null');
    const primera = document.querySelector('#reservasContenido > div');
    const pend = TMReservas.pendientes();
    return { apunte, primeraId: primera && primera.id, primeraTxt: primera ? primera.textContent : '',
             pend: pend.map(r => ({ id: r.id, cliente: r.cliente })),
             stock: (JSON.parse(localStorage.getItem('productos')) || []).find(p => String(p.id) === String(window.__conId)) };
});
ok(antes.apunte && antes.pend.some(r => r.id === antes.apunte.id && r.cliente === 'María Pérez'),
   `el vale no dejó apuntada la reserva de María: ${JSON.stringify(antes)}`);
ok(antes.primeraId === 'reservaDelVale' && /María Pérez/.test(antes.primeraTxt) && /marcaste como entregado/.test(antes.primeraTxt),
   `la reserva del vale no sale la primera ni destacada: «${antes.primeraTxt.slice(0, 160)}»`);

const tras = await panel.evaluate(([conId, apunte]) => {
    reservaVender(apunte.id);
    const ventas = JSON.parse(localStorage.getItem('registroVentas') || '[]');
    const r = TMReservas.lista().find(x => x.id === apunte.id);
    const p = (JSON.parse(localStorage.getItem('productos')) || []).find(x => String(x.id) === String(conId));
    return { venta: ventas[0], estado: r && r.estado, apunte: localStorage.getItem('tm_vale_vender'), stock: p && Number(p.stock) };
}, [String(CON.id), antes.apunte || {}]);
ok(tras.estado === 'vendida', `ejecutar la venta no cerró la reserva: ${tras.estado}`);
ok(tras.venta && JSON.stringify(tras.venta).includes(String(CON.id)) && tras.venta.cliente === 'María Pérez',
   `la venta no quedó registrada con el producto y el cliente: ${JSON.stringify(tras.venta).slice(0, 300)}`);
const linea = tras.venta && (tras.venta.items || tras.venta.detalle || []).find(d => String(d.productoId) === String(CON.id));
ok(linea && Number(linea.comision) === Number(CON.comision), `la venta no lleva la comisión del producto: ${JSON.stringify(linea)}`);
ok(tras.stock === stockAntes - 1, `el stock tiene que bajar UNA vez (${stockAntes} → ${stockAntes - 1}) y quedó en ${tras.stock}`);
ok(tras.apunte === null, 'el apunte del vale sigue ahí después de vender: la próxima vez destacaría una reserva cerrada');

// 4) De vuelta en el vale: el historial dice Vendido; «Nuevo cliente» vacía todo.
await panel.goto(`http://localhost:${PUERTO}/vale.html`);
await esperar(panel, 'typeof valeEntregado === "function"');
const hist = await panel.evaluate(() => { goTab('historial'); return document.getElementById('histBody').textContent; });
ok(/María Pérez/.test(hist) && /Vendido/.test(hist), `el historial del vale no dice que se vendió: «${hist.slice(0, 200)}»`);
const nuevo = await panel.evaluate(([con]) => {
    goTab('nuevo');
    agregarProductoVale(con.nombre, Number(con.precioActual) || 0, String(con.id));
    reservarSiToca();
    const primera = _valeReservaHecha;
    resetForm();
    return { items: _valeItems.length, reserva: _valeReservaHecha, primera,
             caja: document.getElementById('ventaBox').textContent };
}, [CON]);
ok(nuevo.items === 0 && nuevo.reserva === null, `«Nuevo cliente» arrastra los productos o la reserva del anterior: ${JSON.stringify(nuevo)}`);
ok(/Elegir del catálogo/.test(nuevo.caja), 'tras «Nuevo cliente», el vale sigue ofreciendo registrar la venta del anterior');
ok(!errores.length, 'errores de JavaScript: ' + errores.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de «Entregado → registrar venta»`);
