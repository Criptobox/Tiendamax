/* «Pongo una venta en reserva, la confirmo y no descuenta del stock.»
 *
 * Invariante: cada unidad sale del stock EXACTAMENTE una vez entre reservar y
 * vender. Si al confirmar la reserva no había descontado, se descuenta en ese
 * momento; nunca dos veces. Nada de esto da error: el catálogo solo dice una
 * cifra falsa.
 *
 * Caminos que crean la reserva (vale.html): copiar, mandar por WhatsApp,
 * mandar como imagen y «Entregado → registrar venta». Camino que la confirma:
 * «✅ Ejecutar venta» (reservaVender). Lo que se mide en cada uno: el stock
 * del localStorage, el de la MEMORIA del panel (lo que «Actualizar tienda»
 * sube) y lo que se publica en GitHub.
 *
 *  1. Los cuatro caminos de crear: el stock baja 1; confirmar no lo baja otra vez.
 *  2. Confirmar publica el stock (antes quedaba solo en el panel: la tienda
 *     seguía enseñando la cifra vieja hasta pulsar «Actualizar tienda»).
 *  3. Panel abierto antes que el vale (otra pestaña): confirmar, una sola vez.
 *  4. Reserva hecha en OTRO dispositivo (llega por Firebase, el descuento no):
 *     al confirmar baja ahora, una vez, y lo dice; cancelarla no devuelve una
 *     unidad que nunca salió; la cancelada en su dispositivo sí la devuelve.
 *  5. Confirmar dos veces la misma reserva no descuenta ni vende dos veces.
 *
 * Se corre solo (`node tests/reserva_stock_check.mjs`) y desde unittest
 * (tests/test_reserva_stock.py). Sale con 1 si algo falla.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.svg':'image/svg+xml' };

/* Firebase compartido entre «dispositivos»: un mapa en el servidor. */
const PRIV = new Map();
/* La cuenta, sustituida: con sesión, y fetchPrivado hablando con ese mapa. */
const AUTH_FALSO = `window.TMAuth={
  init:function(){return new Promise(function(r){setTimeout(r,200);});},
  usuario:function(){return {uid:'u1',email:'a@b.c'};},
  alCambiar:function(f){try{f(this.usuario());}catch(e){}},
  entrar:async function(){return{ok:false,msg:'no'};}, crearCuenta:async function(){return{ok:false};},
  recuperar:async function(){return{ok:false};}, salir:async function(){}, token:async function(){return 'tok';},
  estadoDueno:async function(){return{};}, diagnostico:async function(){return{pasos:[]};}, reclamar:async function(){return{ok:false};},
  fetchPrivado:async function(path,opts){
    var r=await fetch('/fakepriv'+path,opts||{}); var t=await r.text(); var d=null; try{d=JSON.parse(t);}catch(e){}
    return {ok:r.ok,dato:d};
  }, rtdb:function(){return '';}
};`;

const servidor = createServer(async (q, r) => {
    const camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino.startsWith('/fakedb/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('null'); return; }
    if (camino.startsWith('/fakepriv/')) {
        if (q.method === 'PUT') {
            let cuerpo = ''; for await (const c of q) cuerpo += c;
            PRIV.set(camino, cuerpo);
            r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(cuerpo); return;
        }
        r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(PRIV.get(camino) || 'null'); return;
    }
    if (camino === '/js/auth.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); r.end(AUTH_FALSO); return; }
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

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const disp = CATALOGO.filter(p => Number(p.stock) >= 6 && !p.digital && Number(p.comision) > 0);
if (disp.length < 4) { console.log('el catálogo no tiene cuatro productos con stock y comisión — se salta'); process.exit(0); }
const [P1, P2, P3, P4] = disp;

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errores = [];

/* Un «dispositivo»: su propio localStorage, GitHub falso que anota lo que se sube. */
async function dispositivo(nombre) {
    const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 420, height: 900 } });
    const SUBIDAS = [];
    const b64 = t => Buffer.from(t, 'utf8').toString('base64');
    const cuerpoRepo = JSON.stringify(CATALOGO);
    await ctx.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com'
                         && !u.hostname.includes('firebaseio.com') && !u.hostname.includes('raw.githubusercontent'), r => r.abort());
    await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await ctx.route(u => u.hostname.includes('raw.githubusercontent'), r => {
        const ruta = (r.request().url().split('/main/')[1] || '').split('?')[0];
        return r.fulfill({ status: 200, contentType: 'application/json', body: ruta === 'productos.json' ? cuerpoRepo : 'null' });
    });
    await ctx.route(u => u.hostname === 'api.github.com', r => {
        const req = r.request(), url = req.url();
        const ruta = (url.split('/contents/')[1] || '').split('?')[0];
        if (req.method() === 'PUT') {
            let cuerpo = null;
            try { cuerpo = JSON.parse(Buffer.from(JSON.parse(req.postData()).content, 'base64').toString('utf8')); } catch (e) {}
            SUBIDAS.push({ ruta, cuerpo });
            return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"nuevo"}}' });
        }
        if (url.includes('/contents/')) {
            if (!ruta) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
            if (ruta === 'productos.json') return r.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ sha: 'sha-productos', encoding: 'base64', content: b64(cuerpoRepo) }) });
            return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 'sin' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
    });
    await ctx.addInitScript(([puerto, cat]) => {
        if (!localStorage.getItem('__tm_prueba')) {
            localStorage.setItem('__tm_prueba', '1');
            localStorage.setItem('firebaseConfig', JSON.stringify({ apiKey: 'x', projectId: 'p', databaseURL: `http://localhost:${puerto}/fakedb` }));
            localStorage.setItem('productos', JSON.stringify(cat));
            localStorage.setItem('githubUser', 'quien'); localStorage.setItem('githubRepo', 'repo'); localStorage.setItem('githubToken', 'ghp_de_mentira');
        }
        window.confirm = () => true;
        window.open = () => ({});
        try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }); } catch (e) {}
        try {
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
            Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
        } catch (e) {}
    }, [PUERTO, CATALOGO]);
    return { ctx, SUBIDAS, nombre };
}
const enLS = (pg, id) => pg.evaluate(id => {
    const p = (JSON.parse(localStorage.getItem('productos')) || []).find(x => String(x.id) === id);
    return p ? Number(p.stock) : null;
}, String(id));
/* El `productos` del motor (el que fusiona al publicar), distinto del PRODUCTOS que pinta el panel. */
const enMotor = (pg, id) => pg.evaluate(id => {
    const p = (typeof productos !== 'undefined' ? productos : []).find(x => String(x.id) === id);
    return p ? Number(p.stock) : null;
}, String(id));
const enMemoria = (pg, id) => pg.evaluate(id => {
    const p = (window.PRODUCTOS || []).find(x => String(x.id) === id);
    return p ? Number(p.stock) : null;
}, String(id));
async function abrirPanel(d, hash) {
    const pg = await d.ctx.newPage();
    pg.on('pageerror', e => { if (!/catColControl/.test(String(e))) errores.push(d.nombre + ' panel: ' + String(e).slice(0, 200)); });
    await pg.goto(`http://localhost:${PUERTO}/admin.html${hash || ''}`);
    await pg.waitForFunction(() => typeof window.reservaVender === 'function' && Array.isArray(window.PRODUCTOS) && window.PRODUCTOS.length > 0,
        null, { timeout: 25000 }).catch(() => {});
    await pg.evaluate(() => { const m = document.getElementById('loginModal'); if (m) m.classList.add('hidden');
        const a = document.getElementById('adminPanel'); if (a) a.classList.remove('hidden'); });
    return pg;
}
async function abrirVale(d) {
    const pg = await d.ctx.newPage();
    pg.on('pageerror', e => { if (!/catColControl/.test(String(e))) errores.push(d.nombre + ' vale: ' + String(e).slice(0, 200)); });
    await pg.goto(`http://localhost:${PUERTO}/vale.html`);
    await pg.waitForFunction(() => typeof reservarSiToca === 'function' && typeof copiarVale === 'function', null, { timeout: 20000 });
    return pg;
}
const prepararVale = (pg, p, nombre) => pg.evaluate(([p, nombre]) => {
    resetForm();
    document.getElementById('vCliente').value = nombre;
    document.getElementById('vTelefono').value = '53 5555 ' + String(Math.floor(1000 + Math.random() * 8999));
    agregarProductoVale(p.nombre, Number(p.precioActual) || 0, String(p.id));
    _valeAlm = null;                                  // ya elegido: va por mensajería
}, [p, nombre]);
const ventasDe = (pg, id) => pg.evaluate(id => (JSON.parse(localStorage.getItem('registroVentas') || '[]'))
    .filter(v => JSON.stringify(v).includes('"productoId":' + (isNaN(id) ? JSON.stringify(id) : id)) || JSON.stringify(v).includes('"productoId":"' + id + '"')).length, String(id));

/* ═══ 1 y 2. Los cuatro caminos de crear la reserva, y confirmarla ═══ */
const CAMINOS = [
    ['copiar',    (pg) => pg.evaluate(() => { copiarVale(); }), P1],
    ['WhatsApp',  (pg) => pg.evaluate(() => { enviarValeWA(); }), P2],
    ['imagen',    (pg) => pg.evaluate(async () => { await _enviarValeImagenWA(); }), P3],
    ['Entregado', null, P4],
];
for (const [camino, accion, P] of CAMINOS) {
    const d = await dispositivo('camino-' + camino);
    const vale = await abrirVale(d);
    const S = await enLS(vale, P.id);
    await prepararVale(vale, P, 'Cliente ' + camino);
    let panel;
    if (accion) {
        await accion(vale);
        const r = await vale.evaluate(() => ({ id: _valeReservaHecha, n: TMReservas.pendientes().length }));
        ok(r.id && r.n === 1, `[${camino}] no creó la reserva: ${JSON.stringify(r)}`);
        ok(await enLS(vale, P.id) === S - 1, `[${camino}] reservar tenía que bajar el stock 1 (${S} → ${S - 1}) y quedó ${await enLS(vale, P.id)}`);
        panel = await abrirPanel(d, '#reservas');
    } else {
        await Promise.all([vale.waitForURL(/admin\.html#reservas/, { timeout: 15000 }).catch(() => {}), vale.evaluate(() => { valeEntregado(); })]);
        ok(await enLS(vale, P.id) === S - 1, `[${camino}] reservar tenía que bajar el stock 1 (${S} → ${S - 1}) y quedó ${await enLS(vale, P.id)}`);
        panel = vale;
        await panel.waitForFunction(() => typeof window.reservaVender === 'function' && Array.isArray(window.PRODUCTOS) && window.PRODUCTOS.length > 0,
            null, { timeout: 25000 }).catch(() => {});
        await panel.evaluate(() => { const m = document.getElementById('loginModal'); if (m) m.classList.add('hidden');
            const a = document.getElementById('adminPanel'); if (a) a.classList.remove('hidden'); });
    }
    const rid = await panel.evaluate(() => TMReservas.pendientes()[0].id);
    ok(await enMemoria(panel, P.id) === S - 1, `[${camino}] el panel no tiene la reserva descontada en memoria: ${await enMemoria(panel, P.id)} (esperado ${S - 1})`);
    d.SUBIDAS.length = 0;
    await panel.evaluate(id => { reservaVender(id); }, rid);
    ok(await enLS(panel, P.id) === S - 1, `[${camino}] confirmar bajó el stock otra vez (disco ${await enLS(panel, P.id)}, esperado ${S - 1})`);
    ok(await enMemoria(panel, P.id) === S - 1, `[${camino}] confirmar dejó la memoria del panel en ${await enMemoria(panel, P.id)} (esperado ${S - 1})`);
    ok(await ventasDe(panel, P.id) === 1, `[${camino}] la venta no quedó registrada una vez`);
    // Se publica sola, como cualquier venta.
    await panel.waitForFunction(() => true).catch(() => {});
    const t0 = Date.now(); let sub = null;
    while (Date.now() - t0 < 9000 && !sub) {
        sub = d.SUBIDAS.find(x => x.ruta.startsWith('cambios/') && x.cuerpo && (x.cuerpo.productos || []).some(p => String(p.id) === String(P.id)));
        if (!sub) await panel.waitForTimeout(300);
    }
    ok(sub && Number(sub.cuerpo.productos.find(p => String(p.id) === String(P.id)).stock) === S - 1,
       `[${camino}] confirmar no publicó el stock (${S - 1}) en GitHub: ${JSON.stringify(d.SUBIDAS.map(x => x.ruta))}`);
    // Confirmar otra vez la misma: ni vende ni descuenta de nuevo.
    await panel.evaluate(id => { reservaVender(id); }, rid);
    ok(await enLS(panel, P.id) === S - 1 && await enMemoria(panel, P.id) === S - 1 && await ventasDe(panel, P.id) === 1,
       `[${camino}] confirmar dos veces la misma reserva descontó o vendió dos veces`);
    await d.ctx.close();
}

/* ═══ 3. Panel abierto ANTES que el vale (otra pestaña) ═══ */
{
    const d = await dispositivo('dos-pestañas');
    const panel = await abrirPanel(d);
    const S = await enMemoria(panel, P1.id);
    const vale = await abrirVale(d);
    await prepararVale(vale, P1, 'Otra Pestaña');
    await vale.evaluate(() => { copiarVale(); });
    await panel.bringToFront();
    await panel.waitForFunction(([id, n]) => { const p = window.PRODUCTOS.find(x => String(x.id) === id); return p && Number(p.stock) === n; },
        [String(P1.id), S - 1], { timeout: 6000 }).catch(() => {});
    ok(await enMemoria(panel, P1.id) === S - 1, `[dos pestañas] el panel abierto antes no trajo el descuento: ${await enMemoria(panel, P1.id)} (esperado ${S - 1})`);
    const rid = await panel.evaluate(() => TMReservas.pendientes()[0].id);
    await panel.evaluate(id => { reservaVender(id); }, rid);
    ok(await enMemoria(panel, P1.id) === S - 1 && await enLS(panel, P1.id) === S - 1,
       `[dos pestañas] confirmar dejó memoria=${await enMemoria(panel, P1.id)} disco=${await enLS(panel, P1.id)} (esperado ${S - 1} en los dos)`);
    await d.ctx.close();
}

/* ═══ 4. Reserva hecha en otro dispositivo ═══ */
{
    PRIV.clear();
    const movil = await dispositivo('móvil'), pc = await dispositivo('pc');
    const vale = await abrirVale(movil);
    const SM = await enLS(vale, P2.id);
    await prepararVale(vale, P2, 'Cliente Del Móvil');
    await vale.evaluate(() => { copiarVale(); });
    await vale.waitForTimeout(500);                    // el espejo a Firebase
    const idA = await vale.evaluate(() => _valeReservaHecha);
    await prepararVale(vale, P3, 'Segundo Del Móvil');
    await vale.evaluate(() => { copiarVale(); });
    await vale.waitForTimeout(500);
    const idB = await vale.evaluate(() => _valeReservaHecha);
    const S3m = await enLS(vale, P3.id);
    ok(idA && idB && idA !== idB && PRIV.has('/fakepriv/privado/reservas.json'), 'el móvil no espejó sus reservas a Firebase');

    const panel = await abrirPanel(pc);
    const SP = await enMemoria(panel, P2.id), S3p = await enMemoria(panel, P3.id);
    const sinc = await panel.evaluate(async () => { const r = await TMReservas.sincronizar(); return { r, n: TMReservas.pendientes().length }; });
    ok(sinc.n === 2, `la PC no recibió las reservas del móvil: ${JSON.stringify(sinc)}`);
    ok(await panel.evaluate(([a]) => !TMReservas.descontadaAqui(TMReservas.lista().find(r => r.id === a)), [idA]),
       'la PC cree que ya descontó una reserva que se hizo en el móvil');

    // Confirmar la del móvil desde la PC: baja UNA vez, ahora, y lo dice.
    pc.SUBIDAS.length = 0;
    await panel.evaluate(id => { reservaVender(id); }, idA);
    ok(await enMotor(panel, P2.id) === SP - 1, `[otro dispositivo] el catálogo del motor (el que se publica) quedó en ${await enMotor(panel, P2.id)} (esperado ${SP - 1})`);
    ok(await enMemoria(panel, P2.id) === SP - 1 && await enLS(panel, P2.id) === SP - 1,
       `[otro dispositivo] confirmar en la PC no descontó (memoria ${await enMemoria(panel, P2.id)}, disco ${await enLS(panel, P2.id)}, esperado ${SP - 1})`);
    ok(await ventasDe(panel, P2.id) === 1, '[otro dispositivo] la venta no quedó registrada');
    const aviso = await panel.evaluate(() => document.body.innerText);
    ok(/Stock descontado ahora/.test(aviso), '[otro dispositivo] no se avisó de que el stock se descontó al confirmar');
    const t0 = Date.now(); let sub = null;
    while (Date.now() - t0 < 9000 && !sub) {
        sub = pc.SUBIDAS.find(x => x.ruta.startsWith('cambios/') && x.cuerpo && (x.cuerpo.productos || []).some(p => String(p.id) === String(P2.id)));
        if (!sub) await panel.waitForTimeout(300);
    }
    ok(sub && Number(sub.cuerpo.productos.find(p => String(p.id) === String(P2.id)).stock) === SP - 1,
       '[otro dispositivo] el stock descontado al confirmar no se publicó: ' + JSON.stringify(pc.SUBIDAS.map(x => x.ruta)));
    await panel.evaluate(id => { reservaVender(id); }, idA);
    ok(await enMemoria(panel, P2.id) === SP - 1 && await ventasDe(panel, P2.id) === 1, '[otro dispositivo] confirmar otra vez descontó o vendió dos veces');

    // Cancelar desde la PC la del móvil: allí salió, aquí no; el stock de la PC no sube.
    await panel.evaluate(id => { reservaCancelar(id); }, idB);
    ok(await enMemoria(panel, P3.id) === S3p && await enLS(panel, P3.id) === S3p,
       `[otro dispositivo] cancelar en la PC devolvió una unidad que nunca salió de su catálogo: ${await enMemoria(panel, P3.id)} (esperado ${S3p})`);
    ok(await panel.evaluate(id => TMReservas.lista().find(r => r.id === id).estado, idB) === 'cancelada', '[otro dispositivo] no quedó cancelada');

    // Y en el móvil, la suya sí devuelve (la unidad salió de ahí).
    const vale2 = await abrirVale(movil);
    await vale2.evaluate(() => TMReservas.sincronizar());
    ok(await vale2.evaluate(id => TMReservas.lista().find(r => r.id === id).estado, idB) === 'cancelada', 'el móvil no vio la cancelación');
    const c = await vale2.evaluate(async ([id]) => {
        // Una reserva nueva del móvil, cancelada en el móvil.
        const ps = JSON.parse(localStorage.getItem('productos'));
        const p = ps.find(x => String(x.id) === id);
        const antes = p.stock;
        const r = TMReservas.crear([{ id: p.id, cantidad: 1 }], { cliente: 'X', telefono: '535555' });
        const mid = JSON.parse(localStorage.getItem('productos')).find(x => String(x.id) === id).stock;
        TMReservas.cancelar(r.reserva.id);
        const fin = JSON.parse(localStorage.getItem('productos')).find(x => String(x.id) === id).stock;
        return { antes, mid, fin };
    }, [String(P4.id)]);
    ok(c.mid === c.antes - 1 && c.fin === c.antes, `cancelar en el dispositivo que reservó tenía que devolver la unidad: ${JSON.stringify(c)}`);
    ok(await enLS(vale2, P3.id) === S3m + 1,
       `la reserva del móvil, cancelada desde la PC, no devolvió la unidad al catálogo del móvil que la descontó: ${await enLS(vale2, P3.id)} (esperado ${S3m + 1})`);
    await movil.ctx.close(); await pc.ctx.close();
}

ok(!errores.length, 'errores de JavaScript: ' + errores.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de reserva → stock → venta`);
