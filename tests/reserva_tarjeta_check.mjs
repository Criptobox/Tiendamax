/* Reservas: «📷 Escanear tarjeta» para el cliente que tiene la Tarjeta TiendaMax.
 *
 * El vale se entrega y se paga al recibir; la tarjeta está delante. Antes solo se
 * podía aplicar en el formulario de venta, no al «✅ Ejecutar venta» de una
 * reserva, y el descuento se perdía (o lo aplicaba solo si el WhatsApp ya estaba
 * en la tarjeta). Se prueba en el panel real:
 *  · cada reserva pendiente ofrece el botón;
 *  · un código que no existe se rechaza y no se guarda nada;
 *  · uno bueno queda a la vista en la reserva (y se puede quitar);
 *  · al ejecutar la venta el descuento del tramo llega a la venta (descTarjetaMN),
 *    (la tarjeta sin teléfono guardado: solo el código puede dar el descuento);
 *  · sin tarjeta escaneada la venta sale igual que antes (sin descuento).
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const servidor = createServer(async (q, r) => {
  const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
  try { r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(await readFile(ruta)); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const ahora = Date.now();
const TARJETA = { c: 'TMK7M2QX', n: 'María Pérez', t: '', v: 'x', e: ahora - 864e5, x: ahora + 80 * 864e5, usos: {}, extra: {}, ts: ahora };
const RESERVA = (id, tel) => ({ id, ts: ahora, vence: ahora + 40 * 3600000, estado: 'reservada', disp: 'disp-a', cliente: 'María', telefono: tel,
  nota: '', total: 30, totalMN: 0,
  items: [{ id: 111, nombre: 'Producto de prueba', cantidad: 1, precio: 30, moneda: 'USD', comision: 3, comisionMoneda: 'USD' }] });

const navegador = await chromium.launch();
async function panel(reservas) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
  await ctx.addInitScript(([tj, rs]) => {
    if (!localStorage.getItem('__tm')) {
      localStorage.setItem('__tm', '1');
      localStorage.setItem('tm_tarjetas_v1', JSON.stringify({ [tj.c]: tj }));
      localStorage.setItem('tm_reservas', JSON.stringify(rs));
      localStorage.setItem('tm_dispositivo', 'disp-a');
      localStorage.setItem('productos', JSON.stringify([{ id: 111, nombre: 'Producto de prueba', categoria: 'WIFI', precioActual: 30, stock: 5, moneda: 'USD' }]));
      localStorage.setItem('tasaMN', '955');
    }
    window.confirm = () => true;
    try { delete window.BarcodeDetector; } catch (e) {}
    window.__codigo = 'TMK7M2QX';
    window.prompt = () => window.__codigo;
  }, [TARJETA, reservas]);
  const pg = await ctx.newPage();
  const errores = []; pg.on('pageerror', e => { if (!/catColControl/.test(String(e))) errores.push(String(e).slice(0, 200)); });
  await pg.goto(`http://localhost:${PUERTO}/admin.html#reservas`);
  await pg.waitForFunction(() => typeof window.reservaVender === 'function' && typeof window.tmTarjetaPreguntar === 'function', null, { timeout: 25000 });
  await pg.evaluate(() => { const m = document.getElementById('loginModal'); if (m) m.classList.add('hidden');
    const a = document.getElementById('adminPanel'); if (a) a.classList.remove('hidden'); renderReservas(); });
  return { ctx, pg, errores };
}
const ventas = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('registroVentas') || '[]'));

// ── 1. Con tarjeta escaneada: el descuento llega a la venta ───────────────
{
  const { ctx, pg, errores } = await panel([RESERVA('rsv-a1', '')]);
  const tienBoton = await pg.evaluate(() => /Escanear tarjeta/.test(document.getElementById('reservasContenido').innerText));
  ok(tienBoton, 'cada reserva pendiente ofrece «Escanear tarjeta»');

  await pg.evaluate(() => { window.__codigo = 'TMAAAAAA'; });          // no existe (ni tiene la forma válida de alfabeto)
  await pg.evaluate(() => reservaEscanearTarjeta('rsv-a1'));
  ok(await pg.evaluate(() => !localStorage.getItem('tm_reserva_tarjeta') || localStorage.getItem('tm_reserva_tarjeta') === '{}'), 'un código que no existe no se guarda');

  await pg.evaluate(() => { window.__codigo = 'tm-k7m2qx'; });
  await pg.evaluate(() => reservaEscanearTarjeta('rsv-a1'));
  const txt = await pg.evaluate(() => document.getElementById('reservasContenido').innerText);
  ok(/María Pérez/.test(txt) && /TM-K7M2QX/.test(txt), `la tarjeta escaneada queda a la vista en la reserva: ${txt.slice(0, 200)}`);

  await pg.evaluate(() => reservaTarjetaQuitar('rsv-a1'));
  ok(!/TM-K7M2QX/.test(await pg.evaluate(() => document.getElementById('reservasContenido').innerText)), 'se puede quitar la tarjeta');
  await pg.evaluate(() => { window.__codigo = 'TMK7M2QX'; });
  await pg.evaluate(() => reservaEscanearTarjeta('rsv-a1'));

  await pg.evaluate(() => reservaVender('rsv-a1'));
  const v = await ventas(pg);
  ok(v.length === 1, `se registró una venta (hay ${v.length})`);
  const venta = v[0] || {};
  ok(venta.tarjeta === 'TMK7M2QX' && Number(venta.descTarjetaMN) === 500, `la venta lleva la tarjeta y 500 MN de descuento: ${JSON.stringify({ t: venta.tarjeta, d: venta.descTarjetaMN })}`);
  ok(await pg.evaluate(() => { try { return !JSON.parse(localStorage.getItem('tm_reserva_tarjeta') || '{}')['rsv-a1']; } catch (e) { return false; } }), 'la marca de la reserva se borra al ejecutar la venta');
  ok(errores.length === 0, 'errores de página: ' + JSON.stringify(errores));
  await ctx.close();
}

// ── 2. Sin tarjeta escaneada: todo como antes ────────────────────────────
{
  const { ctx, pg, errores } = await panel([RESERVA('rsv-b1', '53 5000 9999')]);
  await pg.evaluate(() => reservaVender('rsv-b1'));
  const v = (await ventas(pg))[0] || {};
  ok(!v.tarjeta && !Number(v.descTarjetaMN || 0), `sin escanear no hay descuento: ${JSON.stringify({ t: v.tarjeta, d: v.descTarjetaMN })}`);
  ok(errores.length === 0, 'errores de página (sin tarjeta): ' + JSON.stringify(errores));
  await ctx.close();
}

await navegador.close(); servidor.close();
if (fallos.length) { console.error(`❌ ${fallos.length} comprobación(es) fallida(s):\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Reservas: escanear la tarjeta aplica su descuento al ejecutar la venta.');
