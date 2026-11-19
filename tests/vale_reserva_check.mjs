/* El vale nuevo y sus reservas, en un navegador de verdad.
 *
 * Todo lo de aquí falla sin error:
 *  - Mandar el vale como IMAGEN no reservaba (solo el texto lo hacía): el
 *    cliente tenía su vale y la unidad seguía a la venta para otro.
 *  - Lo escrito a mano no se reservaba nunca, aunque se llamara exactamente
 *    como un producto del catálogo. Solo el nombre IDÉNTICO cuenta: «m2» no es
 *    «m5», y reservar el hermano equivocado es peor que no reservar.
 *  - Cancelar la imagen (Compartir → atrás) no puede reservar.
 *  - El vale dice hasta cuándo se guarda, con el mismo plazo que usa el panel.
 *  - En el panel, un vale vencido dice que venció y ofrece «Recordarle», y
 *    cancelar por «no vino» se apunta para avisar la próxima vez.
 *  - Volver del vale al panel (o recargarlo) pedía el login aunque la sesión
 *    de la cuenta seguía viva: el panel tiene que entrar solo con ella, y
 *    seguir pidiendo el login sin ella.
 *  - Los MN con punto de miles, y el código del vale sin 0/O/1/I/L.
 *
 * Se corre solo (`node tests/vale_reserva_check.mjs`) y desde unittest
 * (tests/test_vale_reserva.py). Sale con 1 si algo falla.
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

/* La cuenta de Firebase, sustituida: con sesión o sin ella según la prueba. */
const AUTH_FALSO = `window.TMAuth={
  init:function(){return new Promise(function(r){setTimeout(r,300);});},
  usuario:function(){return window.__sesion?{uid:'u1',email:'a@b.c'}:null;},
  alCambiar:function(f){try{f(this.usuario());}catch(e){}},
  entrar:async function(){return{ok:false,msg:'no'};}, crearCuenta:async function(){return{ok:false};},
  recuperar:async function(){return{ok:false};}, salir:async function(){}, token:async function(){return null;},
  estadoDueno:async function(){return{};}, diagnostico:async function(){return{pasos:[]};}, reclamar:async function(){return{ok:false};},
  fetchPrivado:function(){return Promise.resolve(new Response('null',{status:200}));}, rtdb:function(){return '';}
};`;

const servidor = createServer(async (q, r) => {
    const camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino.startsWith('/fakedb/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('null'); return; }
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
const disp = CATALOGO.filter(p => Number(p.stock) >= 3 && !p.digital);
const A = disp[0], B = disp[1];
if (!A || !B) { console.log('el catálogo no tiene dos productos con stock — se salta'); process.exit(0); }

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errores = [];

async function contexto(conSesion, modoShare) {
    const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 420, height: 900 } });
    await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
    await ctx.addInitScript(([puerto, cat, sesion, modo]) => {
        window.__sesion = sesion;
        if (!localStorage.getItem('__tm_prueba')) {
            localStorage.setItem('__tm_prueba', '1');
            localStorage.setItem('firebaseConfig', JSON.stringify({ apiKey: 'x', projectId: 'p', databaseURL: `http://localhost:${puerto}/fakedb` }));
            localStorage.setItem('productos', JSON.stringify(cat));
        }
        window.__abiertos = [];
        window.open = u => { window.__abiertos.push(String(u)); return {}; };
        window.__confirmar = [];
        window.confirm = m => { window.__confirmar.push(m); return true; };
        try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }); } catch (e) {}
        if (modo) {
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
            Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {
                if (modo === 'cancela') { const e = new Error('Share canceled'); e.name = 'AbortError'; throw e; }
            } });
        }
    }, [PUERTO, CATALOGO, conSesion, modoShare]);
    return ctx;
}
const stockDe = (pg, id) => pg.evaluate(id => {
    const p = (JSON.parse(localStorage.getItem('productos')) || []).find(x => String(x.id) === id);
    return p ? Number(p.stock) : null;
}, String(id));

// ── 1) La imagen reserva; cancelarla no ──
for (const modo of ['comparte', 'cancela']) {
    const ctx = await contexto(false, modo);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('vale ' + modo + ': ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/vale.html`);
    await pg.waitForFunction(() => typeof enviarValeImagenWA === 'function', null, { timeout: 15000 });
    const antes = await stockDe(pg, A.id);
    const r = await pg.evaluate(async ([a]) => {
        resetForm();
        document.getElementById('vCliente').value = 'Imagen Prueba';
        document.getElementById('vTelefono').value = '53 5555 0001';
        agregarProductoVale(a.nombre, Number(a.precioActual) || 0, String(a.id));
        _valeAlm = null;                                  // ya elegido: va por mensajería
        await _enviarValeImagenWA();
        return { reserva: _valeReservaHecha, pend: TMReservas.pendientes().length };
    }, [A]);
    const despues = await stockDe(pg, A.id);
    if (modo === 'comparte') {
        ok(r.reserva && r.pend === 1, `mandar el vale como imagen no reservó: ${JSON.stringify(r)}`);
        ok(despues === antes - 1, `la imagen tenía que descontar 1 del stock (${antes} → ${antes - 1}) y quedó ${despues}`);
    } else {
        ok(!r.reserva && r.pend === 0 && despues === antes, `cancelar «Compartir» reservó igual: ${JSON.stringify(r)} stock ${antes}→${despues}`);
    }
    await ctx.close();
}

// ── 2) Lo escrito a mano con el nombre exacto se reserva; lo demás avisa ──
{
    const ctx = await contexto(false, null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('vale escrito: ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/vale.html`);
    await pg.waitForFunction(() => typeof reservarSiToca === 'function', null, { timeout: 15000 });
    const antesB = await stockDe(pg, B.id);
    const r = await pg.evaluate(([b]) => {
        resetForm();
        document.getElementById('vCliente').value = 'Escrito Prueba';
        document.getElementById('vTelefono').value = '53 5555 0002';
        // Mayúsculas y tildes distintas, mismo nombre: cuenta. Uno inventado: no.
        const nom = b.nombre.toUpperCase();
        document.getElementById('vArticulo').value = '2x ' + nom + '\n1x Producto Que No Existe 9000';
        reservarSiToca();
        const res = TMReservas.pendientes()[0];
        return { items: res ? res.items.map(i => [String(i.id), i.cantidad]) : null, toast: document.getElementById('toast').textContent };
    }, [B]);
    ok(r.items && r.items.length === 1 && r.items[0][0] === String(B.id) && r.items[0][1] === 2,
       `el producto escrito con su nombre exacto no se reservó (o se reservó otra cosa): ${JSON.stringify(r)}`);
    ok(await stockDe(pg, B.id) === antesB - 2, 'lo escrito a mano tenía que descontar 2 del stock');

    // Un nombre parecido NO reserva.
    const r2 = await pg.evaluate(([b]) => {
        resetForm();
        document.getElementById('vCliente').value = 'Parecido';
        document.getElementById('vArticulo').value = '1x ' + b.nombre + ' Pro';
        const antes = TMReservas.pendientes().length;
        reservarSiToca();
        return { nuevas: TMReservas.pendientes().length - antes, toast: document.getElementById('toast').textContent };
    }, [B]);
    ok(r2.nuevas === 0 && /No se reservó nada/.test(r2.toast), `un nombre parecido no puede reservar el producto: ${JSON.stringify(r2)}`);

    // El texto y la imagen dicen hasta cuándo, con el plazo del panel; MN con punto; código legible.
    const t = await pg.evaluate(([a]) => {
        localStorage.setItem('tm_reserva_horas', '24');
        resetForm();
        document.getElementById('vCliente').value = 'Plazo';
        document.getElementById('vTelefono').value = '53 5555 0003';
        agregarProductoVale(a.nombre, Number(a.precioActual) || 0, String(a.id));
        document.getElementById('vUSD').value = '100'; tasa = 500; margenMN = 0; calcular();
        reservarSiToca();
        const res = TMReservas.pendientes().find(r => r.cliente === 'Plazo');
        document.getElementById('vMensajeria').value = '500 CUP'; recalc();
        const total = totalValeTexto();
        return { total, texto: construirTextoVale(), vence: res && res.vence, ts: res && res.ts, cup: document.getElementById('vTotal').textContent,
                 codigo: _valeCodigo, mn: fmtMN(80750) };
    }, [A]);
    ok(t.vence && t.vence >= t.ts + 24 * 3600000 && t.vence - t.ts < 48 * 3600000 && new Date(t.vence).getHours() === 20 && new Date(t.vence).getMinutes() === 0,
       `la reserva tiene que durar al menos 24 h y vencer al cierre (20:00), no de madrugada: ${new Date(t.vence)}`);
    ok(/Te lo guardamos hasta el/.test(t.texto), 'el texto del vale no dice hasta cuándo se guarda');
    ok(/^\$100 USD \+ 500 MN de mensajería \(o 50\.500 MN todo incluido\)$/.test(t.total), `el total tiene que ir en USD, con la mensajería aparte y los MN de referencia: «${t.total}»`);
    ok(t.mn === '80.750' && /50\.500 CUP/.test(t.cup), `los MN tienen que llevar punto de miles: ${t.mn} / ${t.cup}`);
    ok(/^[2-9A-HJKMNP-Z]{6}$/.test(t.codigo), `el código del vale tiene letras que se confunden al dictarlo: ${t.codigo}`);
    await ctx.close();
}

// ── 2b) La garantía es de cada producto, no del vale ──
{
    const ctx = await contexto(false, null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('vale garantía: ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/vale.html`);
    await pg.waitForFunction(() => typeof textoGarantias === 'function', null, { timeout: 15000 });
    const g = await pg.evaluate(([a, b]) => {
        const ps = JSON.parse(localStorage.getItem('productos'));
        ps.forEach(p => { if (String(p.id) === String(a.id)) p.garantia = '3 meses'; if (String(p.id) === String(b.id)) p.garantia = ''; });
        localStorage.setItem('productos', JSON.stringify(ps));
        resetForm();
        document.getElementById('vGarantia').value = '1 año';      // escrito para todo: no puede pegarse a lo del catálogo
        agregarProductoVale(a.nombre, Number(a.precioActual) || 0, String(a.id));
        agregarProductoVale(b.nombre, Number(b.precioActual) || 0, String(b.id));
        const mixto = textoGarantias();
        document.getElementById('vArticulo').value += '\n1x Cable escrito a mano';
        const conMano = _garantiasVale();
        resetForm(); agregarProductoVale(b.nombre, Number(b.precioActual) || 0, String(b.id));
        document.getElementById('vGarantia').value = '';
        return { mixto, conMano, ninguna: textoGarantias() };
    }, [A, B]);
    ok(g.mixto.includes(A.nombre + ': 3 meses') && g.mixto.includes(B.nombre + ': sin garantía') && !g.mixto.includes('1 año'),
       `la garantía tiene que ser la de cada producto: «${g.mixto}»`);
    ok(g.conMano.find(x => /Cable escrito/.test(x.nombre)).garantia === '1 año', 'el campo de garantía tiene que valer para lo escrito a mano');
    ok(/sin garantía/.test(g.ninguna), `un vale sin productos con garantía no puede prometerla: «${g.ninguna}»`);
    await ctx.close();
}

// ── 2c) El texto es para el cliente, y con mensajería cuenta la Tarjeta ──
{
    const ctx = await contexto(false, null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('vale tarjeta: ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/vale.html`);
    await pg.waitForFunction(() => typeof _valeProgramaTarjeta === 'function', null, { timeout: 15000 });
    const r = await pg.evaluate(([a]) => {
        const llenar = () => {
            resetForm();
            document.getElementById('vCliente').value = 'Nuevo Cliente';
            document.getElementById('vTelefono').value = '53 5000 7777';
            document.getElementById('vDireccion').value = 'Calle 10 #5, Playa';
            agregarProductoVale(a.nombre, Number(a.precioActual) || 0, String(a.id));
        };
        localStorage.removeItem('tm_tarjetas_v1'); localStorage.removeItem('tm_tarjeta_cfg');
        llenar(); _valeAlm = null;
        const dom = construirTextoVale();
        llenar(); _valeAlm = { id: 'x', nombre: 'Almacén X', direccion: 'Dir X' };
        const rec = construirTextoVale();
        localStorage.setItem('tm_tarjeta_cfg', JSON.stringify({ on: false, dias: 90, ts: 1 }));
        llenar(); _valeAlm = null;
        const apagada = construirTextoVale();
        localStorage.removeItem('tm_tarjeta_cfg');
        localStorage.setItem('tm_tarjetas_v1', JSON.stringify({ TMABCDEF: { c: 'TMABCDEF', t: '5350007777', e: Date.now(), x: Date.now() + 864e5, usos: {}, extra: {} } }));
        llenar(); _valeAlm = null;
        const yaTiene = construirTextoVale();
        return { dom, rec, apagada, yaTiene };
    }, [A]);
    ok(/Con esta compra recibes tu Tarjeta TiendaMax/.test(r.dom) && /próximas 3 compras \(desde \$25: −500 MN · desde \$45: −1000 MN\)/.test(r.dom) && /Recomienda a un amigo/.test(r.dom),
       `con mensajería, al cliente nuevo hay que contarle la Tarjeta con sus tramos: «${r.dom.slice(-600)}»`);
    ok(!/Tarjeta/.test(r.rec), 'en recogida la tarjeta la da el gestor en mano: el vale no la anuncia');
    ok(!/Tarjeta/.test(r.apagada), 'con la campaña apagada el vale no puede prometer la tarjeta');
    ok(/Tu Tarjeta TiendaMax: TM-ABCDEF/.test(r.yaTiene) && /\?ref=TMABCDEF/.test(r.yaTiene) && /t\?c=TMABCDEF/.test(r.yaTiene) && !/recibes tu Tarjeta/.test(r.yaTiene),
       `a quien ya tiene tarjeta se le recuerda la suya, con su enlace y el de recomendar: «${r.yaTiene.slice(-500)}»`);
    ok(/te mandamos tu tarjeta con su QR y tu enlace/.test(r.dom), 'al cliente nuevo hay que decirle cómo le llega la tarjeta');
    ok(!/Zelle|Promotor|Vuelto: —|Dirección Cliente/.test(r.dom + r.rec), 'el texto del cliente no puede llevar etiquetas internas (Zelle, Promotor, Vuelto vacío)');
    ok(!/Dirección:|Mensajería:/.test(r.rec), `en recogida no van la dirección del cliente ni la mensajería: «${r.rec.slice(0, 300)}»`);
    ok(/Lo revisas antes de pagar/.test(r.dom) && !/verificado/i.test(r.dom), 'el texto tiene que decir que se revisa antes de pagar, sin «verificado»');
    await ctx.close();
}

// ── 2d) El descuento se refleja: el de la tarjeta se propone solo, uno escrito manda ──
{
    const ctx = await contexto(false, null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('vale descuento: ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/vale.html`);
    await pg.waitForFunction(() => typeof _valeDescuento === 'function', null, { timeout: 15000 });
    const r = await pg.evaluate(() => {
        localStorage.setItem('tm_tarjetas_v1', JSON.stringify({ TMABCDEF: { c: 'TMABCDEF', t: '5350008888', e: Date.now(), x: Date.now() + 864e5, usos: {}, extra: {} } }));
        resetForm(); _valeAlm = null; tasa = 500; margenMN = 0;
        document.getElementById('vCliente').value = 'Con Tarjeta';
        document.getElementById('vTelefono').value = '53 5000 8888';
        document.getElementById('vArticulo').value = '1x Cosa — $50.00 USD c/u';
        document.getElementById('vUSD').value = '50'; calcular();
        document.getElementById('vMensajeria').value = '500'; recalc(); drawValeImg();
        const auto = { campo: document.getElementById('vDescuento').value, total: totalValeTexto(), form: document.getElementById('vTotal').textContent, texto: construirTextoVale() };
        document.getElementById('vUSD').value = '20'; calcular(); drawValeImg();
        const bajo = document.getElementById('vDescuento').value;
        document.getElementById('vUSD').value = '50'; calcular();
        document.getElementById('vDescuento').value = '$5'; _valeDescTocado(); drawValeImg();
        const manual = { campo: document.getElementById('vDescuento').value, total: totalValeTexto() };
        return { auto, bajo, manual };
    });
    ok(r.auto.campo === '1000 MN', `con tarjeta y compra de $50 tenía que proponer 1000 MN: «${r.auto.campo}»`);
    ok(/^\$50 USD − 1\.000 MN de descuento \+ 500 MN de mensajería \(o 24\.500 MN todo incluido\)$/.test(r.auto.total), `el total no refleja el descuento: «${r.auto.total}»`);
    ok(/24\.500/.test(r.auto.form), `el total del formulario no refleja el descuento: «${r.auto.form}»`);
    ok(/🏷️ Descuento \(Tarjeta TM-ABCDEF\): −1\.000 MN/.test(r.auto.texto) && /En este pedido: −1\.000 MN/.test(r.auto.texto), 'el texto no dice el descuento ni que sale de la tarjeta');
    ok(r.bajo === '', `por debajo de $25 la tarjeta no se gasta: «${r.bajo}»`);
    ok(/^\$45 USD \+ 500 MN de mensajería \(o 23\.000 MN todo incluido\)$/.test(r.manual.total), `un descuento escrito en USD tiene que restarse de los dólares: «${r.manual.total}»`);
    await ctx.close();
}

// ── 3) El panel: entra solo con la sesión, pide login sin ella ──
for (const sesion of [true, false]) {
    const ctx = await contexto(sesion, null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('panel ' + sesion + ': ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/admin.html#reservas`);
    await pg.waitForFunction(() => typeof window.renderReservas === 'function', null, { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    const e = await pg.evaluate(() => ({
        panel: !document.getElementById('adminPanel').classList.contains('hidden'),
        login: !document.getElementById('loginModal').classList.contains('hidden'),
        vista: !!document.querySelector('#view-reservas.active, #view-reservas.on, #view-reservas[style*="block"]') || (document.querySelector('.view.active')||{}).id
    }));
    if (sesion) ok(e.panel && !e.login, `con la sesión viva el panel tenía que abrirse solo, sin login: ${JSON.stringify(e)}`);
    else ok(!e.panel && e.login, `sin sesión el panel no puede abrirse: ${JSON.stringify(e)}`);
    await ctx.close();
}

// ── 4) Reservas vencidas: lo dice, «Recordarle» con texto, «no vino» se apunta ──
{
    const ctx = await contexto(true, null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push('panel reservas: ' + String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${PUERTO}/admin.html#reservas`);
    await pg.waitForFunction(() => typeof window.renderReservas === 'function' && window.TMReservas, null, { timeout: 20000 });
    const r = await pg.evaluate(([a]) => {
        const c1 = TMReservas.crear([{ id: a.id, cantidad: 1 }], { cliente: 'Ana López', telefono: '5355550010' });
        // La hago vencer: creada hace 3 días con plazo de 48 h.
        const lista = JSON.parse(localStorage.getItem('tm_reservas') || '[]');
        return { ok: c1.ok, id: c1.reserva && c1.reserva.id, clave: Object.keys(localStorage).filter(k => /reserv/i.test(k)) };
    }, [A]);
    ok(r.ok, 'no se pudo crear la reserva de prueba');
    const venc = await pg.evaluate(([id]) => {
        // Envejecer la reserva donde la guarde TMReservas.
        for (const k of Object.keys(localStorage)) {
            let v; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
            if (Array.isArray(v) && v.some(x => x && x.id === id)) {
                v.forEach(x => { if (x.id === id) { x.ts -= 3 * 86400000; x.vence = Date.now() - 86400000; } });
                localStorage.setItem(k, JSON.stringify(v));
            }
        }
        renderReservas();
        const card = document.querySelector('#reservasContenido > div');
        const txt = card ? card.textContent : '';
        reservaRecordar(id);
        return { txt, vencidas: TMReservas.pendientesVencidas().length, abierto: window.__abiertos.slice(-1)[0] || '' };
    }, [r.id]);
    ok(venc.vencidas === 1 && /Venció/.test(venc.txt) && /Recordarle/.test(venc.txt), `la reserva vencida no lo dice ni ofrece recordarle: «${venc.txt.slice(0, 220)}»`);
    ok(/wa\.me\/5355550010\?text=/.test(venc.abierto) && /sigues%20interesado/.test(venc.abierto), `«Recordarle» no abre WhatsApp con el texto: ${venc.abierto}`);

    const can = await pg.evaluate(([id, a]) => {
        reservaCancelar(id);
        const r = TMReservas.lista().find(x => x.id === id);
        const c2 = TMReservas.crear([{ id: a.id, cantidad: 1 }], { cliente: 'Ana otra vez', telefono: '+53 5555 0010' });
        renderReservas();
        return { estado: r.estado, motivo: r.motivo, aviso: document.getElementById('reservasContenido').textContent, preguntas: window.__confirmar.length };
    }, [r.id, A]);
    ok(can.estado === 'cancelada' && can.motivo === 'novino', `cancelar por «no vino» no se apuntó: ${JSON.stringify(can)}`);
    ok(/ya dejó 1 vale sin venir/.test(can.aviso), `el siguiente vale de ese WhatsApp no avisa que no vino: «${can.aviso.slice(0, 260)}»`);
    await ctx.close();
}

const propios = errores.filter(e => !/firebase is not defined|Failed to fetch|NetworkError/i.test(e));
ok(propios.length === 0, 'errores de JavaScript: ' + propios.join(' | '));
await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones del vale y sus reservas en regla.`);
