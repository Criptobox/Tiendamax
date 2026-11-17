/* 🎁 Tarjeta TiendaMax y referidos — admin.html (js/tarjeta-cliente.js),
 * t.html y la tienda (js/referido.js).
 *
 * Reglas del dueño, que aquí se prueban en un navegador porque leyendo el
 * código no se ve si se cumplen:
 *  · nace con la primera compra con WhatsApp; la segunda no crea otra;
 *  · POR TRAMOS en USD: <$25 no descuenta ni gasta; desde $25, 500 MN; desde
 *    $45, 1000 MN — la venta lo guarda (también en /ventas) y la ganancia en
 *    MN baja exactamente eso;
 *  · caduca, y la campaña se apaga en ⚙️ Configuración;
 *  · REFERIDOS: el amigo nuevo, en su primera compra desde $25, recibe su
 *    descuento (primer uso de SU tarjeta) y quien lo trajo gana +1, con tope
 *    de 2; sin tramo, sin campaña, a uno mismo o con tarjeta caducada, nada;
 *  · escanear (foto) la aplica y rellena nombre y WhatsApp;
 *  · /privado lleva los datos firmados, /tarjetas/<c> solo {r,n,e,x,f,g};
 *  · otro teléfono vacío lo recupera todo;
 *  · t.html enseña lo que queda, los tramos y «regala a un amigo»;
 *  · la tienda recoge /?ref= y lo pone SOLO en los pedidos a su número.
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
const cumplePublica = o => o && Object.keys(o).every(k => ['r', 'n', 'e', 'x', 'f', 'g', 'k'].includes(k)) && typeof o.r === 'number' && o.r >= 0 && o.r <= 5
    && typeof o.e === 'number' && (o.n === undefined || (typeof o.n === 'string' && o.n.length <= 30)) && [0, 1].includes(o.f) && o.g >= 0 && o.g <= 2;

// Tres productos en USD, uno por tramo.
const CAT = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const PRODS = (Array.isArray(CAT) ? CAT : CAT.productos).filter(p => !p.digital && p.moneda !== 'MN' && Number(p.comision) > 0);
const BARATO = PRODS.find(p => Number(p.precioActual) < 25), MEDIO = PRODS.find(p => Number(p.precioActual) >= 25 && Number(p.precioActual) < 45),
      ALTO = PRODS.find(p => Number(p.precioActual) >= 45);
ok(BARATO && MEDIO && ALTO, 'faltan productos de prueba por tramo');

let DB = {};
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const erroresJs = [];
const ESCRITURAS = [];

async function contexto(vp) {
    const ctx = await navegador.newContext({ viewport: vp || { width: 412, height: 1000 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.hostname.includes('localhost') && !u.hostname.includes('firebaseio.com'), r => r.abort());
    await ctx.route(u => u.hostname.includes('firebaseio.com'), async r => {
        const url = new URL(r.request().url());
        const ruta = url.pathname.replace(/\.json$/, '').replace(/^\//, '');
        const firmada = url.searchParams.has('auth'), metodo = r.request().method();
        const privada = ruta.startsWith('privado') || (ruta.startsWith('tarjetas') && metodo !== 'GET');
        if (privada && !firmada) { ESCRITURAS.push({ ruta, sinFirma: true }); return r.fulfill({ status: 401, body: '"Permission denied"' }); }
        if (ruta === 'tarjetas' && metodo === 'GET') return r.fulfill({ status: 401, body: '"Permission denied"' });
        if (metodo === 'PUT') {
            const cuerpo = JSON.parse(r.request().postData() || 'null');
            ESCRITURAS.push({ ruta, cuerpo });
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
    await p.evaluate(ids => {
        window.TMAuth = Object.assign(window.TMAuth || {}, {
            token: async () => 'tok',
            fetchPrivado: async (ruta, o) => {
                const r = await fetch('https://tiendamax-8feb5-default-rtdb.firebaseio.com' + ruta + '?auth=tok', o || {});
                if (!r.ok) return { ok: false, estado: r.status };
                const t = await r.text(); return { ok: true, dato: t ? JSON.parse(t) : null };
            },
        });
        window.__abiertos = []; window.open = u => { window.__abiertos.push(u); return null; };
        document.getElementById('adminPanel')?.classList.remove('hidden');
        document.querySelectorAll('#loginModal,.tm2-login,.tm2-login-card,#tm2Login').forEach(e => e.remove());
        [typeof PRODUCTOS !== 'undefined' ? PRODUCTOS : [], typeof productos !== 'undefined' ? productos : []]
            .forEach(l => (l || []).forEach(x => { if (ids.includes(String(x.id))) x.stock = 99; }));
        go('ventas');
    }, [String(BARATO.id), String(MEDIO.id), String(ALTO.id)]);
    await p.waitForTimeout(500);
    return { ctx, p };
}
// Una venta por el formulario de verdad. `codigo`: lo que se teclea en el campo de tarjeta.
const vender = (p, prod, nombre, tel, { aplicar = false, codigo = '' } = {}) => p.evaluate(async ([pid, nombre, tel, aplicar, codigo]) => {
    document.getElementById('tarjeta-hoja')?.remove();
    ventaAdd(pid);
    document.getElementById('venta-cliente').value = nombre;
    const t = document.getElementById('venta-tel'); t.value = tel; t.dispatchEvent(new Event('input', { bubbles: true }));
    if (codigo) { const c = document.getElementById('venta-tj-cod'); if (c) { c.value = codigo; tmTarjetaVentaPintar(); } }
    const caja = document.getElementById('venta-tarjeta').innerText;
    if (aplicar) [...document.querySelectorAll('#venta-tarjeta button')].find(b => /Aplicar/.test(b.textContent))?.click();
    const cajaAplicada = document.getElementById('venta-tarjeta').innerText;
    ventaRegistrar();
    await new Promise(r => setTimeout(r, 900));
    const v = JSON.parse(localStorage.getItem('registroVentas'))[0];
    return { caja, cajaAplicada, venta: { id: v.id, tarjeta: v.tarjeta, desc: v.descTarjetaMN, tel: v.telefono }, hoja: !!document.getElementById('tarjeta-hoja') };
}, [String(prod.id), nombre, tel, aplicar, codigo]);
const tarjetaDe = (p, tel) => p.evaluate(tel => { const t = tmTarjetas.porTel(tel); return t && { c: t.c, r: tmTarjetas.restantes(t), g: tmTarjetas.premios(t), por: t.por || null, x: t.x, e: t.e }; }, tel);

const MARIO = '5355512345', JUAN = '5355500001', PEDRO = '5355500002', ANA = '5355500003', LUIS = '5355500004';
let { ctx, p } = await abrirPanel();

// ── 1) Primera compra: nace la tarjeta ────────────────────────────────────
const r1 = await vender(p, MEDIO, 'Mario Pérez', MARIO);
await p.waitForTimeout(1200);
const m1 = await tarjetaDe(p, MARIO);
ok(m1 && codRe.test(m1.c) && m1.r === 3, 'la primera compra crea la tarjeta con 3 descuentos: ' + JSON.stringify(m1));
ok(r1.hoja && !r1.venta.tarjeta, 'al crearla se abre la hoja, y esa venta no la usa');
const C = m1.c;
ok(Math.round((m1.x - m1.e) / 864e5) === 90, 'caduca a los 90 días: ' + Math.round((m1.x - m1.e) / 864e5));
const pub1 = (DB.tarjetas || {})[C], priv1 = ((DB.privado || {}).tarjetas || {})[C];
ok(priv1 && priv1.t === MARIO, '/privado guarda el teléfono');
ok(cumplePublica(pub1) && pub1.r === 3 && pub1.n === 'Mario' && pub1.f === 1 && pub1.g === 0 && pub1.x === m1.x, 'espejo público dentro de la regla: ' + JSON.stringify(pub1));
ok(!JSON.stringify(pub1 || {}).includes(MARIO), 'el teléfono no sale nunca en el nodo público');
const img = await p.evaluate(() => { const c = document.getElementById('tarjeta-canvas'); return c ? JSON.parse(c.dataset.tmTarjeta || '{}') : null; });
ok(img && img.c === C && img.qr > 0, 'la imagen lleva el código y el QR');
const texto = await p.evaluate(c => tmTarjetas.textoEnvio(tmTarjetas.porCodigo(c)), C);
ok(/desde \$25: 500 MN · desde \$45: 1000 MN/.test(texto) && texto.includes('https://tiendamax.org/t?c=' + C) && /hasta el/.test(texto), 'el mensaje explica tramos, fecha y enlace: ' + texto);

// ── 2) Tramos ─────────────────────────────────────────────────────────────
const r2 = await vender(p, BARATO, 'Mario Pérez', MARIO, { aplicar: true });
ok(/no llega a \$25/.test(r2.caja) && !/Aplicar/.test(r2.caja), 'por debajo de $25 no se ofrece: ' + r2.caja);
ok(!r2.venta.tarjeta && (await tarjetaDe(p, MARIO)).r === 3, 'y la tarjeta no se gasta');
const r3 = await vender(p, MEDIO, 'Mario Pérez', MARIO, { aplicar: true });
ok(/Aplicar −500 MN/.test(r3.caja) && r3.venta.tarjeta === C && r3.venta.desc === 500, 'desde $25: 500 MN: ' + JSON.stringify(r3.venta) + ' ' + r3.caja);
await p.waitForTimeout(800);
const vFb = (DB.ventas || {})[r3.venta.id];
ok(vFb && vFb.tarjeta === C && vFb.descTarjetaMN === 500, '/ventas lleva la tarjeta y el descuento');
const gan = await p.evaluate(id => { const v = JSON.parse(localStorage.getItem('registroVentas')).find(x => x.id === id); const s = Object.assign({}, v); delete s.descTarjetaMN;
    return window.tmGananciasDe([s]).mn - window.tmGananciasDe([v]).mn; }, r3.venta.id);
ok(gan === 500, 'la ganancia en MN baja exactamente el descuento: ' + gan);

// Desde $45, escaneando la tarjeta en foto con el formulario vacío: se aplica y pone nombre y WhatsApp.
const sinLector = await p.evaluate(async () => { delete window.BarcodeDetector; await tmTarjetaEscanear(); const t = document.getElementById('tje-est').textContent; document.getElementById('tje-cerrar').click(); return t; });
ok(/no lee QR/.test(sinLector), 'sin lector (iPhone) lo dice: ' + sinLector);
await p.evaluate(([pid, c]) => {
    window.BarcodeDetector = class { async detect() { return [{ rawValue: 'https://tiendamax.org/t?c=' + c }]; } };
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('sin cámara'));
    document.getElementById('tarjeta-hoja')?.remove(); ventaAdd(pid); tmTarjetaEscanear();
}, [String(ALTO.id), C]);
await p.waitForTimeout(300);
await p.setInputFiles('#tje-foto', join(RAIZ, 'iconos', 'favicon-96.png'));
await p.waitForTimeout(1000);
const esc = await p.evaluate(() => ({ tel: document.getElementById('venta-tel').value, nom: document.getElementById('venta-cliente').value, caja: document.getElementById('venta-tarjeta').innerText }));
ok(esc.tel === MARIO && esc.nom === 'Mario Pérez' && /−1000 MN aplicado/.test(esc.caja), 'escanear desde $45 aplica 1000 MN y rellena: ' + JSON.stringify(esc));
const r4 = await p.evaluate(async () => { ventaRegistrar(); await new Promise(r => setTimeout(r, 900)); const v = JSON.parse(localStorage.getItem('registroVentas'))[0]; return { t: v.tarjeta, d: v.descTarjetaMN, id: v.id }; });
ok(r4.t === C && r4.d === 1000 && (await tarjetaDe(p, MARIO)).r === 1, 'desde $45: 1000 MN, y queda 1');
const codigos = await p.evaluate(() => ['https://tiendamax.org/t?c=TM4VE3C8', 'https://tiendamax.org/?ref=TM4VE3C8', 'tm-4ve3c8', '4VE3C8', 'TM0OIL11', 'hola'].map(tmTarjetaCodigoDe));
ok(JSON.stringify(codigos) === JSON.stringify(['TM4VE3C8', 'TM4VE3C8', 'TM4VE3C8', 'TM4VE3C8', '', '']), 'leer el código de la tarjeta, del enlace de regalo o escrito: ' + JSON.stringify(codigos));

// ── 3) Referidos ──────────────────────────────────────────────────────────
const j = await vender(p, MEDIO, 'Juan Gómez', JUAN, { codigo: C, aplicar: true });
ok(/Recomendado por/.test(j.caja) && /Mario/.test(j.caja), 'un WhatsApp nuevo con el código de Mario: recomendado: ' + j.caja);
const tj = await tarjetaDe(p, JUAN);
ok(tj && tj.por === C && tj.r === 2 && j.venta.tarjeta === tj.c && j.venta.desc === 500, 'Juan: 500 MN ya en su primera compra, su tarjeta nace con ese uso hecho: ' + JSON.stringify({ tj, v: j.venta }));
const mJ = await tarjetaDe(p, MARIO);
ok(mJ.r === 2 && mJ.g === 1, 'Mario gana un descuento más: ' + JSON.stringify(mJ));
await p.evaluate(() => document.getElementById('tarjeta-avisar').click());
const aviso = await p.evaluate(() => window.__abiertos.slice(-1)[0] || '');
ok(aviso.startsWith('https://wa.me/' + MARIO + '?text=') && /Juan/.test(decodeURIComponent(aviso)) && /te quedan 2/.test(decodeURIComponent(aviso)), 'avisar a Mario de su premio: ' + decodeURIComponent(aviso));
// Compra barata: no hay premio (pero sí su propia tarjeta, como primera compra).
const pd = await vender(p, BARATO, 'Pedro', PEDRO, { codigo: C, aplicar: true });
const tp = await tarjetaDe(p, PEDRO);
ok(!pd.venta.tarjeta && tp && !tp.por && tp.r === 3 && (await tarjetaDe(p, MARIO)).g === 1, 'una compra de menos de $25 no da premio por referido: ' + JSON.stringify(tp));
// Tope: dos premios como mucho.
await vender(p, MEDIO, 'Ana', ANA, { codigo: C, aplicar: true });
const lu = await vender(p, ALTO, 'Luis', LUIS, { codigo: C, aplicar: true });
ok(/tope/.test(lu.caja), 'con 2 premios, avisa de que ya no suma: ' + lu.caja);
const mTope = await tarjetaDe(p, MARIO);
ok(mTope.g === 2 && mTope.r === 3 && lu.venta.desc === 1000, 'tope de 2 premios: Mario 3+2−2 = 3, y Luis igual tiene su descuento: ' + JSON.stringify(mTope));
// A sí mismo, no: Mario con su propio código ya no es cliente nuevo.
const self = await vender(p, MEDIO, 'Mario Pérez', MARIO, { codigo: C, aplicar: false });
ok(!/Recomendado/.test(self.caja), 'nadie se recomienda a sí mismo: ' + self.caja);
// Un código inventado no descuenta nada.
const falsa = await p.evaluate(pid => { const v = registrarVentaPedido([{ productoId: pid, cantidad: 1, precio: 60 }], { nombre: 'X', tel: '5355599999' }, { tarjeta: { codigo: 'TMABCDEF' } }); return [v.tarjeta, v.descTarjetaMN]; }, String(ALTO.id));
ok(!falsa[0] && !falsa[1], 'un código que no existe no descuenta nada');
// Anular la venta del primer descuento se lo devuelve.
const antes = (await tarjetaDe(p, MARIO)).r;
const trasAnular = await p.evaluate(([tel, id]) => { _fbEliminarVenta(id); return tmTarjetas.restantes(tmTarjetas.porTel(tel)); }, [MARIO, r3.venta.id]);
ok(trasAnular === antes + 1, `anular una venta devuelve su descuento: ${antes} → ${trasAnular}`);
ok((await p.evaluate(tel => window.tmTarjetaChip(tel), MARIO)).includes('🤝 3'), 'Clientes enseña cuántos trajo');
// Las bolsitas: el espejo cuenta las compras de Mario (sin la anulada).
const kMario = await p.evaluate(tel => { const t = tmTarjetas.porTel(tel); return tmTarjetas.compras(t); }, MARIO);
await p.evaluate(tel => { const t = tmTarjetas.porTel(tel); return Promise.resolve(); }, MARIO);
await vender(p, BARATO, 'Mario Pérez', MARIO);             // compra sin usar la tarjeta: suma bolsita igual
await p.waitForTimeout(1000);
ok((DB.tarjetas || {})[C] && DB.tarjetas[C].k === kMario + 1, `cada compra suma una bolsita en la página, use o no la tarjeta: ${kMario} → ${(DB.tarjetas || {})[C] && DB.tarjetas[C].k}`);
ok(!('p' in (DB.tarjetas[C] || {})) && !JSON.stringify(DB.tarjetas[C]).match(/[A-Za-z]{4,} [A-Z0-9]/), 'el espejo no lleva productos');

// ── 4) Caducidad y campaña apagada ────────────────────────────────────────
const cad = await p.evaluate(tel => { const o = tmTarjetas.leer(), t = tmTarjetas.porTel(tel); o[t.c].x = Date.now() - 1000; localStorage.setItem('tm_tarjetas_v1', JSON.stringify(o)); return tmTarjetas.restantes(tmTarjetas.porTel(tel)); }, PEDRO);
ok(cad === 0, 'caducada, no le queda ninguno');
const rc = await vender(p, MEDIO, 'Pedro', PEDRO, { aplicar: true });
ok(/caducó/.test(rc.caja) && !rc.venta.tarjeta, 'el formulario dice que caducó y no la aplica: ' + rc.caja);
await p.evaluate(() => { go('config'); });
await p.waitForTimeout(300);
await p.evaluate(() => { const c = document.getElementById('tj-on'); c.checked = false; c.dispatchEvent(new Event('change')); });
await p.waitForTimeout(1500);
ok((DB.tarjetas || {})[C] && DB.tarjetas[C].f === 0, 'campaña apagada: la página deja de ofrecer «regala»: ' + JSON.stringify((DB.tarjetas || {})[C]));
await p.evaluate(() => go('ventas'));
const off = await vender(p, MEDIO, 'Nadia', '5355500005', { codigo: C, aplicar: true });
ok(!off.hoja && !(await tarjetaDe(p, '5355500005')) && !off.venta.tarjeta, 'apagada: ni tarjeta nueva ni descuento de referido: ' + off.caja);
ok(!ESCRITURAS.some(e => e.sinFirma), 'todas las escrituras van firmadas');
await ctx.close();

// ── 5) Otro teléfono, vacío ───────────────────────────────────────────────
({ ctx, p } = await abrirPanel());
await p.evaluate(() => tmTarjetas.sincronizar());
const otro = await p.evaluate(([a, b]) => ({ m: tmTarjetas.porTel(a), j: tmTarjetas.porTel(b), on: tmTarjetas.cfg().on }), [MARIO, JUAN]);
ok(otro.m && otro.m.c === C && Object.keys(otro.m.extra || {}).length === 3 && otro.j && otro.j.por === C && otro.on === false,
   'otro teléfono recupera tarjetas, premios y que la campaña está apagada: ' + JSON.stringify({ c: otro.m && otro.m.c, ex: otro.m && Object.keys(otro.m.extra || {}).length, on: otro.on }));
await ctx.close();

// ── 6) t.html ─────────────────────────────────────────────────────────────
const ahora = Date.now();
DB.tarjetas[C] = { r: 2, n: 'Mario', e: ahora, x: ahora + 30 * 864e5, f: 1, g: 2, k: 5 };
DB.tarjetas.TM2345AB = { r: 3, n: 'Vieja', e: ahora - 100 * 864e5, x: ahora - 864e5, f: 1, g: 0 };
DB.tarjetas.TM2345AC = { r: 3, n: 'Sin', e: ahora, x: ahora + 864e5, f: 0, g: 0 };
for (const [url, espera] of [[`/t.html?c=${C}`, 'bien'], ['/t.html?c=TM2345AB', 'caducada'], ['/t.html?c=TM2345AC', 'apagada'], ['/t.html?c=TM2345AD', 'no-existe'], ['/t.html?c=hola', 'malo']]) {
    const c2 = await contexto({ width: 320, height: 700 });
    const pg = await c2.newPage();
    pg.on('pageerror', e => erroresJs.push('t.html: ' + String(e).slice(0, 160)));
    await pg.goto(`http://localhost:${PUERTO}${url}`, { waitUntil: 'networkidle' });
    const s = await pg.evaluate(() => ({ t: document.getElementById('titulo').textContent, n: document.getElementById('nombre').textContent,
        wa: document.getElementById('wa').hidden ? '' : document.getElementById('wa').href, pts: document.querySelectorAll('.pt:not(.usado)').length,
        tot: document.querySelectorAll('.pt').length, tramos: !document.getElementById('tramos').hidden, regalo: !document.getElementById('regalo').hidden,
        regaloTxt: document.getElementById('regaloSub').textContent, ancho: document.documentElement.scrollWidth,
        bolsas: document.querySelectorAll('#bolsas .bolsa').length, comprasT: document.getElementById('comprasT').textContent,
        form: getComputedStyle(document.getElementById('codigoF')).display !== 'none',
        qr: !document.getElementById('qrB').hidden ? Number(document.getElementById('qr').dataset.n || 0) : 0, qrCod: document.getElementById('qrCod').textContent, guardada: localStorage.getItem('tm_mi_tarjeta') }));
    ok(s.ancho <= 320, `${url}: a 320 px no se sale (${s.ancho})`);
    if (espera === 'bien') {
        ok(s.n === 'Mario' && /te quedan 2 descuentos/.test(s.t) && s.pts === 2 && s.tot === 5 && s.tramos, 't.html: nombre, lo que queda (de 3+2) y los tramos: ' + JSON.stringify(s));
        ok(s.regalo && /Ya ganaste tus 2/.test(s.regaloTxt), 'con la campaña viva ofrece regalar, y dice que llegó al tope: ' + s.regaloTxt);
        ok(decodeURIComponent(s.wa).includes(C.slice(0, 2) + '-' + C.slice(2)), 'el pedido lleva el código');
        ok(!s.form, 'con la tarjeta cargada no se ve el campo para escribir el código');
        ok(s.qr > 0 && s.qrCod === C.slice(0, 2) + '-' + C.slice(2), 'su perfil enseña su QR y su código para escanearlo al vender: ' + JSON.stringify([s.qr, s.qrCod]));
        ok(s.bolsas === 5 && /Has comprado 5 veces/.test(s.comprasT), 'una bolsita por compra: ' + JSON.stringify([s.bolsas, s.comprasT]));
        ok(s.guardada && JSON.parse(s.guardada).c === C, 'abrir su tarjeta la deja recordada en el teléfono');
    } else if (espera === 'caducada') ok(/caducó/.test(s.t) && !s.regalo && s.pts === 0 && !s.qr, 'caducada (sin QR para cobrar): ' + JSON.stringify(s));
    else if (espera === 'apagada') ok(!s.regalo && /te quedan 3/.test(s.t), 'campaña apagada: se puede usar pero no regalar: ' + JSON.stringify(s));
    else if (espera === 'no-existe') ok(/No encontramos/.test(s.t), 'código que no existe: ' + s.t);
    else ok(/no es de una tarjeta/.test(s.t) && s.form, 'código mal formado (y ofrece escribirlo): ' + s.t);
    await c2.close();
}

{
    const c2 = await contexto({ width: 390, height: 800 });
    const pg = await c2.newPage();
    await pg.goto(`http://localhost:${PUERTO}/t.html`, { waitUntil: 'networkidle' });
    const sin = await pg.evaluate(() => ({ t: document.getElementById('titulo').textContent, form: getComputedStyle(document.getElementById('codigoF')).display !== 'none' }));
    ok(/Mira tu Tarjeta/.test(sin.t) && sin.form, 'sin enlace pide el código: ' + JSON.stringify(sin));
    await pg.fill('#codigoIn', C.slice(2));
    await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle' }), pg.click('#codigoF button')]);
    await pg.goto(`http://localhost:${PUERTO}/t.html`, { waitUntil: 'networkidle' });
    const con = await pg.evaluate(() => document.getElementById('nombre').textContent);
    ok(con === 'Mario', 'escrito una vez, la próxima vez /t abre su tarjeta sola: ' + con);
    await c2.close();
}

// ── 7) La tienda recoge /?ref= ────────────────────────────────────────────
async function tienda(ref) {
    const c3 = await contexto({ width: 390, height: 844 });
    const pg = await c3.newPage();
    pg.on('pageerror', e => erroresJs.push('tienda: ' + String(e).slice(0, 160)));
    await pg.addInitScript(() => { window.__abiertos = []; window.open = u => { window.__abiertos.push(u); return null; }; });
    await pg.goto(`http://localhost:${PUERTO}/index.html?ref=${ref}`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(3500);
    const s = await pg.evaluate(() => {
        window.open('https://wa.me/5354320170?text=' + encodeURIComponent('Hola, quiero el router'));
        window.open('https://wa.me/?text=' + encodeURIComponent('Mira esto'));
        return { ls: localStorage.getItem('tm_ref'), url: location.search, franja: document.getElementById('tmRefFranja')?.innerText || '', abiertos: window.__abiertos };
    });
    await c3.close();
    return s;
}
DB.tarjetas[C].f = 1;
const st = await tienda(C);
ok(st.ls && JSON.parse(st.ls).c === C && !/ref=/.test(st.url), 'la tienda recuerda el código y limpia el enlace: ' + JSON.stringify({ ls: st.ls, url: st.url }));
ok(/Mario/.test(st.franja) && /1000 MN/.test(st.franja), 'enseña quién le regaló: ' + st.franja);
const pedido = decodeURIComponent(st.abiertos[0] || '');
ok(pedido.includes('Hola, quiero el router') && pedido.includes('Vengo recomendado por la tarjeta ' + C.slice(0, 2) + '-' + C.slice(2)), 'el pedido a la tienda lleva el código: ' + pedido);
ok(st.abiertos[1] === 'https://wa.me/?text=' + encodeURIComponent('Mira esto'), 'compartir con alguien (sin número) no se toca: ' + st.abiertos[1]);
const sa = await tienda('TM2345AC');   // campaña apagada en esa tarjeta
ok(!sa.ls && !/Vengo recomendado/.test(decodeURIComponent(sa.abiertos[0] || '')), 'una tarjeta sin campaña no regala: ' + JSON.stringify(sa.ls));

// ── 8) La tienda saluda a quien tiene tarjeta ─────────────────────────────
async function tiendaCon(codigo) {
    const c3 = await contexto({ width: 390, height: 844 });
    const pg = await c3.newPage();
    pg.on('pageerror', e => erroresJs.push('tienda(mi): ' + String(e).slice(0, 160)));
    await pg.addInitScript(c => { if (!sessionStorage.getItem('_i')) { sessionStorage.setItem('_i', '1'); localStorage.setItem('tm_mi_tarjeta', JSON.stringify({ c, ts: Date.now() })); } }, codigo);
    await pg.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(3500);
    const s = await pg.evaluate(() => { const el = document.getElementById('tmMiTarjeta'), chip = document.querySelector('#vistaInicio .op-chip');
        return { txt: el ? el.innerText.replace(/\s+/g, ' ') : '', href: el ? el.getAttribute('href') : '', chipOculto: chip ? getComputedStyle(chip).display === 'none' : null,
                 ls: localStorage.getItem('tm_mi_tarjeta'), ancho: document.documentElement.scrollWidth }; });
    await c3.close();
    return s;
}
const mi = await tiendaCon(C);
ok(/Hola Mario/.test(mi.txt) && /\b5\b/.test(mi.txt) && /\b2\b/.test(mi.txt) && mi.href === '/t?c=' + C && mi.chipOculto === true, 'la tienda saluda con nombre, bolsitas y descuentos, y abre su tarjeta: ' + JSON.stringify(mi));
ok(mi.ancho <= 390, 'la píldora no ensancha la portada: ' + mi.ancho);
const borrada = await tiendaCon('TM2345AD');      // ya no existe
ok(!borrada.txt && !borrada.ls && borrada.chipOculto === false, 'una tarjeta que ya no existe se olvida y vuelve lo de siempre: ' + JSON.stringify(borrada));

ok(!erroresJs.length, 'errores de JS: ' + erroresJs.join(' | '));
await navegador.close(); servidor.close();
if (fallos.length) { console.log('FALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
console.log('tarjeta_check: todo bien');
