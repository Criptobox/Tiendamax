/* La reseña desde el seguimiento post-venta — resena.html + Clientes del panel
 *
 * Casi nadie dejaba reseña: se pedía al mes, metida en una frase, y el enlace
 * abría la tienda entera para luego rellenar cinco campos al final de la ficha.
 * Aquí se comprueba, en un navegador, lo que una lectura del código no ve:
 *
 *  · resena.html nombra al cliente y al producto (sacado de su ficha de
 *    redirección, no del catálogo), no deja publicar sin estrellas ni texto,
 *    y con dos toques (5 ★ + una frase) publica en /resenas/<id>/<ts> lo que
 *    la regla de Firebase acepta, marcado como compra;
 *  · no descarga el bundle ni el catálogo: es la página ligera que se promete;
 *  · con pocas estrellas ofrece WhatsApp para resolverlo;
 *  · el panel ofrece «⭐ Pedir reseña» solo tras el primer seguimiento, abre el
 *    chat con el pedido escrito, y «✍️ Publicar su reseña» sube lo que el
 *    cliente contestó por chat (botones colgados de window, o no hacen nada).
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try { const b = await readFile(ruta); r.writeHead(200, {'Content-Type': MIME[extname(ruta)] || 'application/octet-stream'}); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
const REGLA = JSON.parse(readFileSync(join(RAIZ, 'firebase-rules.json'), 'utf8')).rules.resenas['$productoId']['$resenaId']['.validate'];
// La regla, en JS: lo que Firebase aceptaría (ts lo pone el servidor).
const cumpleRegla = r => r && ['autor','texto','estrellas','fecha','ts'].every(k => k in r)
    && Number.isInteger(r.estrellas) && r.estrellas >= 1 && r.estrellas <= 5
    && r.texto.length >= 10 && r.texto.length <= 400 && r.autor.length >= 1 && r.autor.length <= 50
    && (typeof r.ts === 'number' || (r.ts && r.ts['.sv'] === 'timestamp'));
ok(/estrellas/.test(REGLA) && /texto/.test(REGLA), 'no encontré la regla de /resenas');

const PID = '1777924118004';   // Inversor Tataliken 4000W: tiene su p/producto-<id>.html
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const erroresJs = [];
const PUTS = [];
const nuevoCtx = async (vp) => {
    const ctx = await navegador.newContext({ viewport: vp || { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route(u => u.hostname.includes('firebaseio.com'), r => {
        const req = r.request();
        if (req.method() === 'PUT') { PUTS.push({ url: req.url(), body: JSON.parse(req.postData()) }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    for (const h of ['googleapis.com','gstatic.com','google-analytics.com','raw.githubusercontent.com','api.github.com'])
        await ctx.route(u => u.hostname.includes(h), r => r.abort());
    return ctx;
};

// ── 1) resena.html ────────────────────────────────────────────────────────
{
    const ctx = await nuevoCtx();
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('resena: ' + String(e).slice(0, 160)));
    const pedidos = [];
    p.on('request', q => pedidos.push(q.url()));
    await p.goto(`http://localhost:${PUERTO}/resena.html?p=${PID}&n=Mario&v=1`, { waitUntil: 'networkidle' });
    const t = await p.evaluate(() => ({ h1: document.getElementById('titulo').textContent, autor: document.getElementById('autor').value,
        img: !document.getElementById('img').classList.contains('vacia'), btn: document.getElementById('enviar').disabled,
        paso2: document.getElementById('paso2').classList.contains('ver') }));
    ok(/^Hola Mario, ¿qué tal tu Inversor Tataliken 4000W\?$/.test(t.h1), `el título nombra al cliente y al producto, sin emoji: «${t.h1}»`);
    ok(t.autor === 'Mario', 'el nombre viene puesto');
    ok(t.img, 'la imagen del producto se ve');
    ok(t.btn && !t.paso2, 'sin estrellas no se puede publicar y el resto aún no se ve');
    ok(!pedidos.some(u => /tm-bundle|productos(-lite)?\.json|bundle\.css/.test(u)), 'no baja el bundle ni el catálogo: ' + pedidos.filter(u => /bundle|productos/.test(u)).join(' '));
    // Dos toques: 5 estrellas y una frase.
    await p.click('.estrella[data-n="5"]');
    await p.click('.chip:has-text("Funciona perfecto")');
    const listo = await p.evaluate(() => !document.getElementById('enviar').disabled);
    ok(listo, 'con 5 ★ y una frase ya se puede publicar');
    await p.click('#enviar');
    await p.waitForFunction(() => !document.getElementById('gracias').hidden, null, { timeout: 8000 }).catch(() => {});
    const put = PUTS.find(x => x.url.includes('/resenas/' + PID + '/'));
    ok(put, 'no se publicó nada en /resenas');
    if (put) {
        ok(cumpleRegla(put.body), 'lo publicado no pasa la regla de Firebase: ' + JSON.stringify(put.body));
        ok(put.body.estrellas === 5 && put.body.texto === 'Funciona perfecto' && put.body.autor === 'Mario', 'contenido: ' + JSON.stringify(put.body));
        ok(put.body.comprador === true, 'desde el enlace del seguimiento sale marcada como compra');
        ok(put.body.productoNombre === 'Inversor Tataliken 4000W', 'productoNombre: ' + put.body.productoNombre);
        ok(put.body.ts && put.body.ts['.sv'] === 'timestamp', 'la hora la pone el servidor (un móvil con la hora mal no ve su reseña rechazada)');
    }
    ok(await p.evaluate(() => /Gracias, Mario/.test(document.getElementById('gTitulo').textContent)), 'tras publicar, da las gracias por el nombre');
    await p.reload({ waitUntil: 'networkidle' });
    ok(await p.evaluate(() => !document.getElementById('gracias').hidden && document.getElementById('form').hidden), 'al volver al enlace no pide otra vez la misma reseña');
    await ctx.close();
}
// Pocas estrellas: frases de queja y salida a WhatsApp. Y a 320 px, nada se sale.
{
    const ctx = await nuevoCtx({ width: 320, height: 640 });
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('resena(2): ' + String(e).slice(0, 160)));
    await p.goto(`http://localhost:${PUERTO}/resena.html?p=${PID}`, { waitUntil: 'networkidle' });
    await p.click('.estrella[data-n="2"]');
    const r = await p.evaluate(() => ({ malo: getComputedStyle(document.getElementById('malo')).display !== 'none',
        wa: document.getElementById('waMalo').href, chips: [...document.querySelectorAll('.chip')].map(c => c.textContent),
        h1: document.getElementById('titulo').textContent, ancho: document.documentElement.scrollWidth }));
    ok(r.malo && /wa\.me\/5354320170/.test(r.wa) && decodeURIComponent(r.wa).includes('Inversor Tataliken 4000W'), 'con 2 ★ ofrece WhatsApp nombrando el producto: ' + r.wa);
    ok(r.chips.includes('No funciona bien') && !r.chips.includes('Lo recomiendo'), 'con 2 ★ las frases son de queja: ' + r.chips.join(', '));
    ok(/^¿Qué tal tu Inversor/.test(r.h1), 'sin nombre en el enlace el título empieza en mayúscula: ' + r.h1);
    ok(r.ancho <= 320, `a 320 px la página no se sale (${r.ancho})`);
    await ctx.close();
}

// ── 2) El panel: Clientes → Pedir / Publicar ──────────────────────────────
{
    const AHORA = Date.now(), ID = AHORA - 4 * 86400000;
    const VENTAS = [{ id: ID, fecha: 'x', cliente: 'Lucía Gómez', telefono: '5355557777',
        items: [{ producto: 'Inversor Tataliken 4000W', productoId: PID, cantidad: 1, precio: 170 }], total: 170 },
      // Compró hace 4 días y NO se le ha escrito aún: está en «Por contactar», no en «Pedir reseña».
      { id: ID - 1000, fecha: 'x', cliente: 'Pedro Ruiz', telefono: '5355558888',
        items: [{ producto: 'Inversor Tataliken 4000W', productoId: PID, cantidad: 1, precio: 170 }], total: 170 }];
    const ctx = await nuevoCtx({ width: 412, height: 915 });
    await ctx.addInitScript(([v, id]) => {
        if (sessionStorage.getItem('_ini')) return; sessionStorage.setItem('_ini', '1');
        localStorage.setItem('registroVentas', JSON.stringify(v));
        localStorage.setItem('tm_seguimientos_v1', JSON.stringify({ [id + '|inicial']: Date.now() }));
        localStorage.setItem('firebaseConfig', JSON.stringify({ databaseURL: 'https://prueba-default-rtdb.firebaseio.com', projectId: 'prueba' }));
        window.__abiertos = []; window.open = (u) => { window.__abiertos.push(u); return null; };
    }, [VENTAS, ID]);
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('panel: ' + String(e).slice(0, 160)));
    p.on('dialog', d => d.accept());
    await p.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { window.__abiertos = []; window.open = (u) => { window.__abiertos.push(u); return null; };
        document.getElementById('adminPanel')?.classList.remove('hidden'); document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none'); go('clientes'); });
    await p.waitForTimeout(800);
    const fila = () => p.evaluate(() => [...document.querySelectorAll('#cli-lista .cli-card')].map(c => c.innerText).join('\n---\n'));
    let f = await fila();
    ok(/Pedir reseña/.test(f), `tras el primer seguimiento, la fila ofrece pedir la reseña: ${f.slice(0, 200)}`);
    // Su propio apartado: quien ya contestó sale de «Por contactar» y entra en «Pedir reseña»,
    // sin tener que buscarlo entre todos los clientes.
    const chips = () => p.evaluate(() => [...document.querySelectorAll('#cli-lista .vo-chip')].map(c => c.textContent.trim()));
    let ch = await chips();
    ok(ch.some(t => /Pedir reseña \(1\)/.test(t)), 'el chip «Pedir reseña» cuenta 1: ' + ch.join(' | '));
    ok(ch.some(t => /Por contactar \(1\)/.test(t)), 'Pedro sigue en «Por contactar»: ' + ch.join(' | '));
    await p.evaluate(() => cliFiltro('resena'));
    let fr = await fila();
    ok(/Lucía/.test(fr) && !/Pedro/.test(fr), 'el apartado solo enseña a Lucía, no a Pedro: ' + fr.slice(0, 160));
    await p.evaluate(() => cliFiltro('contactar'));
    fr = await fila();
    ok(/Pedro/.test(fr) && !/Lucía/.test(fr), '«Por contactar» enseña a Pedro y ya no a Lucía: ' + fr.slice(0, 160));
    await p.evaluate(() => cliFiltro('resena'));
    await p.evaluate(() => [...document.querySelectorAll('#cli-lista .cli-card button')].find(b => /Pedir reseña/.test(b.textContent)).click());
    const abiertos = await p.evaluate(() => window.__abiertos);
    const txt = decodeURIComponent((abiertos[0] || '').split('text=')[1] || '');
    ok((abiertos[0] || '').startsWith('https://wa.me/5355557777?text='), 'abre el chat del cliente: ' + abiertos[0]);
    ok(/^¡Qué bueno, Lucía!/.test(txt) && txt.includes('https://tiendamax.org/resena?p=' + PID + '&n=Luc%C3%ADa&v=1'), 'el pedido lleva su nombre y el enlace: ' + txt);
    f = await fila();
    ok(/Reseña pedida/.test(f) && !/Pedir reseña/.test(f), 'pedida una vez, la fila ya no ofrece pedirla otra vez: ' + f.slice(0, 200));
    // Contestó por chat: se publica desde el panel.
    await p.evaluate(() => [...document.querySelectorAll('#cli-lista .cli-card button')].find(b => /Publicar su reseña/.test(b.textContent)).click());
    await p.click('#rp-est .rp-e[data-n="5"]');
    await p.fill('#rp-txt', 'Muy bueno, llegó en dos días');
    const antes = PUTS.length;
    await p.click('#rp-ok');
    // Primero intenta con la cuenta (tope de 3 s si el SDK no llega) y luego sin ella.
    await p.waitForTimeout(4500);
    const put = PUTS.slice(antes).find(x => x.url.includes('/resenas/' + PID + '/'));
    ok(put && cumpleRegla(put.body), 'publicar desde el panel no subió una reseña válida: ' + JSON.stringify(put && put.body));
    if (put) ok(put.body.autor === 'Lucía' && put.body.comprador === true && put.body.origen === 'whatsapp' && put.body.estrellas === 5,
               'reseña del panel: ' + JSON.stringify(put.body));
    f = await fila();
    ok(!/Publicar su reseña|Pedir reseña/.test(f), 'publicada, el apartado ya no la ofrece: ' + f.slice(0, 200));
    await p.evaluate(() => cliFiltro('todos'));
    f = await fila();
    ok(/Al día/.test(f.split('---')[0] + f), 'publicada, su ficha vuelve a «Al día»: ' + f.slice(0, 200));
    await ctx.close();
}

ok(!erroresJs.length, 'errores de JS: ' + erroresJs.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('FALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
console.log('resena_check: todo bien');
