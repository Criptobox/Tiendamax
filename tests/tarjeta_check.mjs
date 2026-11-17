/* 🎁 Tarjeta de cliente — admin.html (js/tarjeta-cliente.js) + t.html
 *
 * La tarjeta da 1000 MN de descuento en cada una de las 3 compras siguientes a
 * la primera, y sale de la comisión del gestor. Lo que aquí se prueba en un
 * navegador, porque leyendo el código no se ve:
 *
 *  · la primera venta con WhatsApp crea la tarjeta y abre la hoja con la imagen
 *    (nombre, código, QR); la segunda NO crea otra;
 *  · /privado/tarjetas lleva los datos (firmado) y /tarjetas/<c> solo {r,n,e}
 *    — nunca el teléfono — dentro de lo que la regla acepta;
 *  · en el formulario de venta, el WhatsApp tecleado trae la tarjeta, el botón
 *    aplica −1000 MN, la venta lo guarda (también en /ventas) y la ganancia en
 *    MN baja exactamente eso; tras 3 usos ya no se ofrece;
 *  · una tarjeta inventada no descuenta nada; anular una venta devuelve su uso;
 *  · otro teléfono, vacío, recupera la tarjeta y sus usos desde la cuenta;
 *  · t.html enseña nombre y descuentos que quedan, y no rompe con un código malo.
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
const REGLA = JSON.parse(readFileSync(join(RAIZ, 'firebase-rules.json'), 'utf8')).rules.tarjetas;
ok(REGLA && REGLA['.read'] === false && /admin_uid/.test(REGLA['$codigo']['.write']), 'la regla de /tarjetas: no se lista, y solo escribe la cuenta del dueño');
const codRe = new RegExp(REGLA['$codigo']['.read'].match(/\/(\^.*\$)\//)[1]);
const cumplePublica = o => o && Object.keys(o).every(k => ['r', 'n', 'e'].includes(k)) && typeof o.r === 'number' && o.r >= 0 && o.r <= 3
    && typeof o.e === 'number' && (o.n === undefined || (typeof o.n === 'string' && o.n.length <= 30));

// Un producto con comisión en MN de 1000 o más y stock de sobra.
const CAT = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const PRODS = Array.isArray(CAT) ? CAT : CAT.productos;
const P = PRODS.find(p => p.comisionMoneda === 'MN' && Number(p.comision) >= 1000 && Number(p.stock) > 0);
ok(P, 'no encontré en el catálogo un producto con comisión en MN ≥ 1000 para la prueba');

let DB = {};
const ESCRITURAS = [];
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const erroresJs = [];

async function contexto(vp) {
    const ctx = await navegador.newContext({ viewport: vp || { width: 412, height: 1000 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.hostname.includes('localhost') && !u.hostname.includes('firebaseio.com'), r => r.abort());
    await ctx.route(u => u.hostname.includes('firebaseio.com'), async r => {
        const url = new URL(r.request().url());
        const ruta = url.pathname.replace(/\.json$/, '').replace(/^\//, '');
        const firmada = url.searchParams.has('auth'), metodo = r.request().method();
        const privada = ruta.startsWith('privado') || (ruta.startsWith('tarjetas') && metodo !== 'GET');
        if (privada && !firmada) { ESCRITURAS.push({ ruta, metodo, sinFirma: true }); return r.fulfill({ status: 401, body: '"Permission denied"' }); }
        if (ruta === 'tarjetas' && metodo === 'GET') return r.fulfill({ status: 401, body: '"Permission denied"' });   // no se lista
        if (metodo === 'PUT') {
            const cuerpo = JSON.parse(r.request().postData() || 'null');
            ESCRITURAS.push({ ruta, metodo, cuerpo });
            const partes = ruta.split('/'); let n = DB;
            partes.slice(0, -1).forEach(p => { n[p] = n[p] || {}; n = n[p]; });
            n[partes[partes.length - 1]] = cuerpo;
            return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) });
        }
        let n = DB; for (const p of ruta.split('/').filter(Boolean)) n = (n || {})[p];
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(n === undefined ? null : n) });
    });
    return ctx;
}
async function abrirPanel() {
    const ctx = await contexto();
    const p = await ctx.newPage();
    p.on('pageerror', e => erroresJs.push('panel: ' + String(e).slice(0, 200)));
    p.on('dialog', d => d.accept());
    await p.addInitScript(() => {
        localStorage.setItem('firebaseConfig', JSON.stringify({ projectId: 'tiendamax-8feb5', databaseURL: 'https://tiendamax-8feb5-default-rtdb.firebaseio.com' }));
    });
    await p.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);
    await p.evaluate(() => {
        // La cuenta del dueño, de mentira: firma igual que TMAuth.fetchPrivado.
        window.TMAuth = Object.assign(window.TMAuth || {}, {
            token: async () => 'tok',
            fetchPrivado: async (ruta, o) => {
                const base = 'https://tiendamax-8feb5-default-rtdb.firebaseio.com';
                const r = await fetch(base + ruta + '?auth=tok', o || {});
                if (!r.ok) return { ok: false, estado: r.status };
                const t = await r.text(); return { ok: true, dato: t ? JSON.parse(t) : null };
            },
        });
        window.__abiertos = []; window.open = u => { window.__abiertos.push(u); return null; };
        document.getElementById('adminPanel')?.classList.remove('hidden');
        document.querySelectorAll('#loginModal,.tm2-login,.tm2-login-card,#tm2Login').forEach(e => e.remove());
        go('ventas');
    });
    // Stock de sobra para vender varias veces el mismo producto en la prueba.
    await p.evaluate(pid => { [typeof PRODUCTOS !== 'undefined' ? PRODUCTOS : [], typeof productos !== 'undefined' ? productos : []]
        .forEach(l => (l || []).forEach(x => { if (String(x.id) === String(pid)) x.stock = 50; })); }, P.id);
    await p.waitForTimeout(600);
    return { ctx, p };
}
const vender = (p, nombre, tel, aplicar) => p.evaluate(async ([pid, nombre, tel, aplicar]) => {
    document.getElementById('tarjeta-hoja')?.remove();
    ventaAdd(pid);
    document.getElementById('venta-cliente').value = nombre;
    const t = document.getElementById('venta-tel'); t.value = tel; t.dispatchEvent(new Event('input', { bubbles: true }));
    const caja = document.getElementById('venta-tarjeta').innerText;
    if (aplicar) [...document.querySelectorAll('#venta-tarjeta button')].find(b => /Aplicar/.test(b.textContent))?.click();
    const cajaAplicada = document.getElementById('venta-tarjeta').innerText;
    ventaRegistrar();
    await new Promise(r => setTimeout(r, 900));
    const v = JSON.parse(localStorage.getItem('registroVentas'))[0];
    return { caja, cajaAplicada, venta: { id: v.id, tarjeta: v.tarjeta, desc: v.descTarjetaMN }, hoja: !!document.getElementById('tarjeta-hoja') };
}, [P.id, nombre, tel, aplicar]);

// ── 1) Primera compra: nace la tarjeta ────────────────────────────────────
const TEL = '5355512345';
let { ctx, p } = await abrirPanel();
let r1 = await vender(p, 'Mario Pérez', TEL, false);
await p.waitForTimeout(1500);
const t1 = await p.evaluate(tel => tmTarjetas.porTel(tel), TEL);
ok(t1 && codRe.test(t1.c), 'la primera compra con WhatsApp crea una tarjeta con código válido: ' + JSON.stringify(t1));
ok(r1.hoja, 'al crearla se abre la hoja para enviársela');
const C = t1 && t1.c;
const img = await p.evaluate(() => { const c = document.getElementById('tarjeta-canvas'); return c ? { w: c.width, h: c.height, d: JSON.parse(c.dataset.tmTarjeta || '{}') } : null; });
ok(img && img.w === 1012 && img.d.c === C && img.d.qr > 0, 'la imagen de la tarjeta lleva su código y su QR: ' + JSON.stringify(img));
ok(!r1.venta.tarjeta, 'la venta que crea la tarjeta no la usa');
const priv = ((DB.privado || {}).tarjetas || {})[C], pub = (DB.tarjetas || {})[C];
ok(priv && priv.t === TEL && priv.n === 'Mario Pérez', '/privado/tarjetas guarda nombre y teléfono: ' + JSON.stringify(priv));
ok(cumplePublica(pub) && pub.r === 3 && pub.n === 'Mario', '/tarjetas/<c> solo {r,n,e} y cumple la regla: ' + JSON.stringify(pub));
ok(!JSON.stringify(pub || {}).includes(TEL), 'el teléfono no sale nunca en el nodo público');
ok(!ESCRITURAS.some(e => e.sinFirma), 'todas las escrituras de la tarjeta van firmadas');
const texto = await p.evaluate(c => tmTarjetas.textoEnvio(tmTarjetas.porCodigo(c)), C);
ok(/Mario/.test(texto) && texto.includes('https://tiendamax.org/t?c=' + C) && /1000 MN/.test(texto) && /3 compras/.test(texto), 'el mensaje de envío: ' + texto);
// El botón de enviar (en PC no hay hoja de compartir con archivos): abre su chat.
await p.evaluate(() => document.getElementById('tarjeta-enviar').click());
await p.waitForTimeout(600);
const abiertos = await p.evaluate(() => window.__abiertos);
ok(abiertos.some(u => u.startsWith('https://wa.me/' + TEL + '?text=')), 'enviar abre el chat del cliente con el texto: ' + abiertos.join(' '));

// ── 2) Segunda compra: se ofrece y se aplica ──────────────────────────────
let r2 = await vender(p, 'Mario Pérez', TEL, true);
ok(/tiene Tarjeta/.test(r2.caja) && /quedan 3 de 3/.test(r2.caja), 'con su WhatsApp, el formulario ofrece la tarjeta: ' + r2.caja);
ok(/aplicado/.test(r2.cajaAplicada) && /pasa de \d+ a \d+/.test(r2.cajaAplicada), 'al aplicarla dice cuánto baja la comisión: ' + r2.cajaAplicada);
ok(r2.venta.tarjeta === C && r2.venta.desc === 1000, 'la venta guarda la tarjeta y el descuento: ' + JSON.stringify(r2.venta));
ok(!r2.hoja, 'la segunda compra no crea otra tarjeta');
const tras2 = await p.evaluate(tel => ({ r: tmTarjetas.restantes(tmTarjetas.porTel(tel)), n: Object.keys(tmTarjetas.leer()).length }), TEL);
ok(tras2.r === 2 && tras2.n === 1, 'queda 1 tarjeta con 2 usos: ' + JSON.stringify(tras2));
await p.waitForTimeout(1200);
ok((DB.tarjetas || {})[C] && DB.tarjetas[C].r === 2, 'la página pública ya dice 2: ' + JSON.stringify((DB.tarjetas || {})[C]));
const vFb = (DB.ventas || {})[r2.venta.id];
ok(vFb && vFb.tarjeta === C && vFb.descTarjetaMN === 1000, '/ventas lleva la tarjeta, o el otro teléfono contaría la comisión entera: ' + JSON.stringify(vFb && { t: vFb.tarjeta, d: vFb.descTarjetaMN }));
// La ganancia en MN baja exactamente 1000 (Inicio y Ventas leen gananciasDe).
const gan = await p.evaluate(([id1, id2]) => {
    const vs = JSON.parse(localStorage.getItem('registroVentas'));
    const a = vs.find(v => v.id === id1), b = vs.find(v => v.id === id2);
    const sinDesc = Object.assign({}, b); delete sinDesc.descTarjetaMN;
    return { con: window.tmGananciasDe ? window.tmGananciasDe([b]).mn : null, sin: window.tmGananciasDe ? window.tmGananciasDe([sinDesc]).mn : null };
}, [r1.venta.id, r2.venta.id]);
ok(gan.con !== null && gan.sin - gan.con === 1000, 'la ganancia en MN baja exactamente 1000: ' + JSON.stringify(gan));

// ── 3) Tres usos y se acabó; una tarjeta inventada no descuenta ───────────
await vender(p, 'Mario Pérez', TEL, true);
const r4 = await vender(p, 'Mario Pérez', TEL, true);
const r5 = await vender(p, 'Mario Pérez', TEL, true);
ok(r4.venta.tarjeta === C, 'el tercer uso se aplica');
ok(/ya usó sus 3/.test(r5.caja) && !r5.venta.tarjeta, 'tras 3 usos ya no se ofrece ni se aplica: ' + r5.caja);
const falsa = await p.evaluate(pid => {
    const v = registrarVentaPedido([{ productoId: pid, cantidad: 1 }], { nombre: 'Otro', tel: '5355599999' }, { tarjeta: { codigo: 'TMABCDEF', mn: 1000 } });
    return { t: v.tarjeta, d: v.descTarjetaMN };
}, P.id);
ok(!falsa.t && !falsa.d, 'un código que no existe no descuenta nada: ' + JSON.stringify(falsa));
// Anular una venta devuelve su uso.
const anul = await p.evaluate(([tel, id]) => { _fbEliminarVenta(id); return tmTarjetas.restantes(tmTarjetas.porTel(tel)); }, [TEL, r4.venta.id]);
ok(anul === 1, 'anular una venta con tarjeta devuelve el uso: quedan ' + anul);
// Clientes muestra la tarjeta de cada uno.
const chip = await p.evaluate(tel => window.tmTarjetaChip(tel), TEL);
ok(chip.includes(C.slice(0, 2) + '-' + C.slice(2)) && /1\/3/.test(chip), 'Clientes enseña la tarjeta y sus usos: ' + chip);
await ctx.close();

// ── 4) Otro teléfono, vacío: la recupera de la cuenta ─────────────────────
({ ctx, p } = await abrirPanel());
await p.evaluate(() => tmTarjetas.sincronizar());
const otro = await p.evaluate(tel => { const t = tmTarjetas.porTel(tel); return t && { c: t.c, usos: Object.keys(t.usos || {}).length }; }, TEL);
ok(otro && otro.c === C && otro.usos === 3, 'otro teléfono recupera la tarjeta y sus usos: ' + JSON.stringify(otro));
await ctx.close();

// ── 5) t.html ─────────────────────────────────────────────────────────────
DB.tarjetas[C] = { r: 1, n: 'Mario', e: Date.now() };
for (const [url, espera] of [[`/t.html?c=${C}`, 'bien'], ['/t.html?c=TM2345AB', 'no-existe'], ['/t.html?c=hola', 'malo']]) {
    const c2 = await contexto({ width: 320, height: 700 });
    const pg = await c2.newPage();
    pg.on('pageerror', e => erroresJs.push('t.html: ' + String(e).slice(0, 160)));
    await pg.goto(`http://localhost:${PUERTO}${url}`, { waitUntil: 'networkidle' });
    const s = await pg.evaluate(() => ({ t: document.getElementById('titulo').textContent, n: document.getElementById('nombre').textContent,
        wa: document.getElementById('wa').hidden ? '' : document.getElementById('wa').href, pts: document.querySelectorAll('.pt:not(.usado)').length,
        ancho: document.documentElement.scrollWidth }));
    ok(s.ancho <= 320, `${url}: a 320 px no se sale (${s.ancho})`);
    if (espera === 'bien') {
        ok(s.n === 'Mario' && /te quedan 1 descuento de 1000 MN/.test(s.t) && s.pts === 1, 't.html enseña nombre y lo que queda: ' + JSON.stringify(s));
        ok(decodeURIComponent(s.wa).includes(C.slice(0, 2) + '-' + C.slice(2)), 'el botón de WhatsApp lleva el código: ' + s.wa);
    } else if (espera === 'no-existe') ok(/No encontramos/.test(s.t), 'código que no existe: ' + s.t);
    else ok(/no es de una tarjeta/.test(s.t), 'código mal formado: ' + s.t);
    await c2.close();
}

ok(!erroresJs.length, 'errores de JS: ' + erroresJs.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('FALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
console.log('tarjeta_check: todo bien');
