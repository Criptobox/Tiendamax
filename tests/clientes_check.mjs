/* El nombre y el teléfono del cliente: en Firebase pero NO en /ventas.
 *
 * El equilibrio que protege este test tiene dos lados y los dos duelen:
 *
 *  · Dejarlos solo en localStorage significa que perder el teléfono es
 *    perder la lista de clientes — meses de trabajo.
 *  · Meterlos dentro de /ventas/$id era lo que se hacía, y ese nodo tiene
 *    dos problemas propios: cualquiera puede CREAR filas ahí sin cuenta
 *    (a propósito, para que una venta no se pierda con el token caducado) y,
 *    una vez escrita, la fila no se corrige ni se borra.
 *
 * Van a /privado/clientes/<idVenta>, que pide la cuenta del dueño para leer
 * y para escribir, y sí se puede reescribir.
 *
 * Nada de esto se ve leyendo el fichero: que el payload de /ventas no nombre
 * `cliente` no prueba que el dato llegue a otro sitio, ni que vuelva al
 * abrir el panel en otro aparato, ni que una subida fallida se cure sola.
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
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

// Firebase de mentira: guarda lo que le mandan y lo devuelve, y exige ?auth=
// en /privado igual que las reglas de verdad.
let DB = { ventas: {}, privado: { clientes: {} } };
const ESCRITURAS = [];

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function abrirPanel(conAuth = true) {
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 1000 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
    await ctx.route('**/*.firebaseio.com/**', async r => {
        const url = new URL(r.request().url());
        const ruta = url.pathname.replace(/\.json$/, '').replace(/^\//, '');
        const firmada = url.searchParams.has('auth');
        const metodo = r.request().method();
        if (ruta.startsWith('privado') && !firmada) {
            ESCRITURAS.push({ ruta, metodo, sinFirma: true });
            return r.fulfill({ status: 401, contentType: 'application/json', body: '"Permission denied"' });
        }
        if (metodo === 'PUT') {
            ESCRITURAS.push({ ruta, metodo, cuerpo: JSON.parse(r.request().postData() || 'null') });
            const partes = ruta.split('/');
            let n = DB;
            partes.slice(0, -1).forEach(p => { n[p] = n[p] || {}; n = n[p]; });
            n[partes[partes.length - 1]] = JSON.parse(r.request().postData() || 'null');
            return r.fulfill({ status: 200, contentType: 'application/json', body: r.request().postData() || 'null' });
        }
        let n = DB;
        for (const p of ruta.split('/').filter(Boolean)) { n = (n || {})[p]; }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(n === undefined ? null : n) });
    });
    const pagina = await ctx.newPage();
    await pagina.addInitScript(cfg => {
        localStorage.setItem('firebaseConfig', JSON.stringify({
            projectId: 'tiendamax-8feb5',
            databaseURL: 'https://tiendamax-8feb5-default-rtdb.firebaseio.com',
        }));
        // TMAuth de mentira: devuelve token (o no, para probar el caso sin firma).
        window.__TOKEN_OK = cfg;
    }, conAuth);
    await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
    await pagina.waitForTimeout(2500);
    await pagina.evaluate(() => {
        window.TMAuth = Object.assign(window.TMAuth || {}, {
            token: async () => (window.__TOKEN_OK ? 'tok-de-mentira' : null),
        });
        document.getElementById('adminPanel').classList.remove('hidden');
        document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
    });
    return { ctx, pagina };
}

// ── 1) El aparato que anota la venta ─────────────────────────────────
const a = await abrirPanel(true);
await a.pagina.evaluate(() => {
    productos = [{ id: 7, nombre: 'Router', precioActual: 100, comision: 10, comisionMoneda: 'USD', stock: 5 }];
    registrarVentaPedido([{ productoId: 7, cantidad: 1 }],
                         { nombre: 'Juan Pérez', tel: '53555555' }, { origen: 'whatsapp' });
});
await a.pagina.waitForTimeout(1500);

const aVentas = Object.values(DB.ventas);
ok(aVentas.length === 1, `debería haber 1 venta en Firebase, hay ${aVentas.length}`);
const v = aVentas[0] || {};
ok(!('cliente' in v) && !('telefono' in v),
   `/ventas no puede llevar al cliente: esa fila no se corrige ni se borra nunca. Lleva ${JSON.stringify(Object.keys(v))}`);
ok(v.origen === 'whatsapp',
   'el canal sí va: es de la tienda, y sin él el cruce de 📣 Publicar solo contaría un teléfono');

const clientes = DB.privado.clientes;
const ids = Object.keys(clientes);
ok(ids.length === 1, `el cliente tiene que quedar guardado en /privado; hay ${ids.length}`);
ok((clientes[ids[0]] || {}).n === 'Juan Pérez' && (clientes[ids[0]] || {}).t === '53555555',
   `el nombre y el teléfono tienen que llegar enteros: ${JSON.stringify(clientes[ids[0]])}`);
ok(ids[0] === String(v.id), 'se guarda con el id de la venta, o no hay forma de volver a juntarlos');
ok(ESCRITURAS.some(e => e.ruta.startsWith('privado/clientes') && !e.sinFirma),
   'la escritura a /privado va firmada, o sería un 401 mudo');
await a.ctx.close();

// ── 2) El teléfono se perdió: otro aparato, localStorage vacío ───────
const b = await abrirPanel(true);
const recuperado = await b.pagina.evaluate(async () => {
    localStorage.removeItem('registroVentas');
    await window.cargarVentasFirebase();
    const lista = JSON.parse(localStorage.getItem('registroVentas') || '[]');
    const v = lista[0] || {};
    return { n: lista.length, cliente: v.cliente, telefono: v.telefono, total: v.total };
});
ok(recuperado.n === 1, `la venta tiene que volver de Firebase; volvieron ${recuperado.n}`);
ok(recuperado.cliente === 'Juan Pérez' && recuperado.telefono === '53555555',
   `perder el teléfono no puede ser perder la lista de clientes; volvió ${JSON.stringify(recuperado)}`);
await b.ctx.close();

// ── 3) Sin firma no se manda, y se cura al siguiente arranque ────────
DB = { ventas: {}, privado: { clientes: {} } };
const c = await abrirPanel(false);            // TMAuth no da token
await c.pagina.evaluate(() => {
    productos = [{ id: 9, nombre: 'Cable', precioActual: 20, comision: 2, comisionMoneda: 'USD', stock: 5 }];
    registrarVentaPedido([{ productoId: 9, cantidad: 1 }], { nombre: 'Ana', tel: '53444444' }, {});
});
await c.pagina.waitForTimeout(1200);
ok(Object.keys(DB.privado.clientes).length === 0,
   'sin firma no se manda nada a /privado: sería un 401 y el dato se daría por guardado');
/* Y no basta con que no llegue: no se puede ni intentar. El 401 de Firebase
   es mudo —fetch resuelve igual— así que un PUT sin firma se ve exactamente
   como uno que funcionó, y el arreglarse-solo del siguiente arranque no
   sabría que le toca. Que no salga es lo que hay que comprobar; que no llegue
   lo garantiza el servidor de mentira de este test, no el código. */
ok(!ESCRITURAS.some(e => e.ruta.startsWith('privado/clientes') && e.sinFirma),
   `salió un PUT sin firma a /privado: el 401 es mudo y el dato se daría por subido. `
   + `Intentos: ${JSON.stringify(ESCRITURAS.filter(e => e.sinFirma))}`);
const localTrasFallo = await c.pagina.evaluate(() =>
    (JSON.parse(localStorage.getItem('registroVentas') || '[]')[0] || {}).cliente);
ok(localTrasFallo === 'Ana', 'pero en el aparato no se pierde');
const guardado = await c.pagina.evaluate(() => localStorage.getItem('registroVentas'));
await c.ctx.close();

const d = await abrirPanel(true);             // ahora sí hay token
await d.pagina.evaluate(async g => {
    localStorage.setItem('registroVentas', g);
    await window.cargarVentasFirebase();
}, guardado);
await d.pagina.waitForTimeout(1200);
const curados = Object.values(DB.privado.clientes);
ok(curados.length === 1 && curados[0].n === 'Ana',
   `una subida que falló se cura al siguiente arranque, no se queda callada; hay ${JSON.stringify(curados)}`);
await d.ctx.close();

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Clientes en /privado: 12 comprobaciones OK');
