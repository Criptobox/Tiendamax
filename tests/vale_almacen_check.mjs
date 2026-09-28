/* El vale del gestor (vale.html): de qué almacén recoge el cliente, y el
 * bloque ATENCIÓN que ahora escribe el dueño.
 *
 * Nada de esto falla con un error. Un vale que sale sin preguntar el almacén
 * manda al cliente sin dirección; uno que coge la de otro almacén lo manda al
 * sitio equivocado; y unas condiciones editadas que no llegan al texto dejan
 * al cliente leyendo las viejas.
 *
 *  - Copiar, enviar el texto o enviar la imagen: si no se eligió almacén, se
 *    pregunta ANTES y el envío sigue al elegir (no se copia ni se guarda nada
 *    hasta entonces).
 *  - Se sugiere el almacén donde están los productos del vale, y los que el
 *    panel borró no salen.
 *  - La dirección llega al texto, a la imagen y al historial; «sin dirección»
 *    no pone ninguna.
 *  - Sin conexión: los guardados, avisando; sin nada guardado, lo dice y deja
 *    enviar sin dirección.
 *  - ATENCIÓN: se edita, se guarda, llega al texto, se lee bien.
 *  - Cancelar el menú de compartir no descarga la imagen (Chrome rechaza con
 *    un AbortError cuyo mensaje es «Share canceled», sin «abort»).
 *
 * Se corre solo (`node tests/vale_almacen_check.mjs`) y desde unittest
 * (tests/test_vale_almacen.py). Sale con 1 si algo falla.
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

const ALMACENES = {
    alm_a: { nombre: 'Almacén Playa', direccion: 'Calle 70 #512 e/ 5ta y 7ma, Playa' },
    alm_b: { nombre: 'Almacén Vedado', direccion: 'Calle 23 #456 e/ L y M, Vedado',
             ubicacion: 'https://maps.google.com/?q=23.1405,-82.3830', productos: { '101': true } },
    alm_c: { nombre: 'Almacén Borrado', direccion: 'No debe salir' },
};
let respuestaDB = { estado: 200, cuerpo: ALMACENES };

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const camino = decodeURIComponent(q.url.split('?')[0]);
    if (camino === '/fakedb/almacenes.json') {
        r.writeHead(respuestaDB.estado, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify(respuestaDB.cuerpo));
        return;
    }
    if (camino.startsWith('/fakedb/')) { r.writeHead(401); r.end('{}'); return; }
    try {
        const cuerpo = await readFile(normalize(join(RAIZ, camino)));
        r.writeHead(200, { 'Content-Type': MIME[extname(camino)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = [];
let comprobaciones = 0;
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };

// Esperar sin reventar: si no llega, es un fallo más de la lista, no un
// TimeoutError que corta la prueba y esconde el resto.
async function esperar(pagina, expr, ms = 8000) {
    try { await pagina.waitForFunction(expr, null, { timeout: ms }); return true; }
    catch (e) { return false; }
}

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function abrir({ conCache = false } = {}) {
    const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 420, height: 900 } });
    await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
    const pagina = await ctx.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(String(e).slice(0, 200)));
    await pagina.addInitScript(([puerto, cache, alm]) => {
        localStorage.setItem('firebaseConfig', JSON.stringify({ apiKey: 'x', projectId: 'p', databaseURL: `http://localhost:${puerto}/fakedb` }));
        localStorage.setItem('productos', JSON.stringify([
            { id: 101, nombre: 'Router Prueba AX3', precioActual: 80, stock: 4, almacenId: 'alm_b' },
            { id: 102, nombre: 'Cable Prueba', precioActual: 5, stock: 40 },
        ]));
        localStorage.setItem('tm_almacenes_borrados', JSON.stringify(['alm_c']));
        if (cache) localStorage.setItem('tm_vale_almacenes', JSON.stringify(alm));
        window.__copiado = [];
        try {
            Object.defineProperty(navigator, 'clipboard', { configurable: true,
                value: { writeText: t => { window.__copiado.push(t); return Promise.resolve(); } } });
        } catch (e) {}
    }, [PUERTO, conCache, ALMACENES]);
    await pagina.goto(`http://localhost:${PUERTO}/vale.html`);
    await pagina.waitForFunction('typeof conAlmacen === "function" && typeof renderAtencion === "function"', null, { timeout: 15000 });
    return { ctx, pagina, errores };
}

async function llenar(pagina) {
    await pagina.evaluate(() => {
        document.getElementById('vCliente').value = 'María Pérez';
        document.getElementById('vTelefono').value = '53 5555 1234';
        agregarProductoVale('Router Prueba AX3', 80, '101');
        goStep(3);
    });
}

// ── 1) Preguntar antes de copiar; sugerir; la dirección llega a todo ──
{
    const { ctx, pagina, errores } = await abrir();
    await llenar(pagina);
    const antes = await pagina.evaluate(() => ({
        caja: document.getElementById('almBody').textContent,
        alto: (drawValeImg(), document.getElementById('valeImgCanvas').height),
    }));
    ok(/Sin elegir/.test(antes.caja), `el paso 3 tiene que decir que falta elegir el almacén: «${antes.caja}»`);

    await pagina.evaluate(() => copiarVale());
    await esperar(pagina, 'document.querySelectorAll("#almLista .alm-opt").length >= 3');
    const modal = await pagina.evaluate(() => ({
        abierto: document.getElementById('modalAlm').classList.contains('open'),
        copiado: window.__copiado.length,
        hist: JSON.parse(localStorage.getItem('valesMax') || '[]').length,
        opciones: Array.from(document.querySelectorAll('#almLista .alm-opt')).map(b => b.textContent),
    }));
    ok(modal.abierto, 'copiar el vale sin almacén elegido no abrió la pregunta');
    ok(modal.copiado === 0, 'se copió el vale antes de elegir el almacén');
    ok(modal.hist === 0, 'se guardó el vale en el historial antes de elegir el almacén');
    ok(/Ahí están los productos/.test(modal.opciones[0]) && /Almacén Vedado/.test(modal.opciones[0]),
       `el primero tiene que ser el almacén donde está el producto, marcado: ${JSON.stringify(modal.opciones)}`);
    ok(!modal.opciones.some(o => /Borrado/.test(o)), 'sale un almacén que el panel borró');
    ok(modal.opciones.some(o => /Almacén Playa/.test(o)) && /Sin dirección/.test(modal.opciones.at(-1)),
       `faltan el otro almacén o la opción sin dirección: ${JSON.stringify(modal.opciones)}`);

    await pagina.evaluate(() => { const b = document.querySelector('#almLista .alm-opt'); if (b) b.click(); });
    await pagina.waitForTimeout(150);
    const tras = await pagina.evaluate(() => ({
        cerrado: !document.getElementById('modalAlm').classList.contains('open'),
        texto: window.__copiado[0] || '',
        hist: JSON.parse(localStorage.getItem('valesMax') || '[]')[0] || {},
        caja: document.getElementById('almBody').textContent,
        alto: document.getElementById('valeImgCanvas').height,
    }));
    ok(tras.cerrado, 'la pregunta no se cerró al elegir');
    ok(tras.texto.includes('📍 Recoger en: Almacén Vedado — Calle 23 #456 e/ L y M, Vedado'),
       'elegir el almacén no terminó de copiar el vale, o el texto no lleva su dirección:\n' + tras.texto.slice(0, 400));
    ok(tras.texto.includes('🗺️ Ubicación del almacén: https://maps.google.com/?q=23.1405,-82.3830'), 'el texto no lleva la ubicación del almacén');
    ok(tras.hist.almacen === 'Almacén Vedado', `el historial no apunta el almacén: ${JSON.stringify(tras.hist)}`);
    ok(/Almacén Vedado/.test(tras.caja) && /Calle 23/.test(tras.caja), `el paso 3 no enseña el almacén elegido: «${tras.caja}»`);
    ok(tras.alto > antes.alto + 150, `la imagen no hizo sitio para la dirección (${antes.alto} → ${tras.alto})`);

    // Elegido una vez, los siguientes envíos no vuelven a preguntar.
    await pagina.evaluate(() => copiarVale());
    await pagina.waitForTimeout(100);
    const segunda = await pagina.evaluate(() => ({ n: window.__copiado.length, abierto: document.getElementById('modalAlm').classList.contains('open') }));
    ok(segunda.n === 2 && !segunda.abierto, 'con el almacén ya elegido, copiar otra vez volvió a preguntar');

    // 2) Cancelar compartir no descarga nada.
    const cancel = await pagina.evaluate(async () => {
        const vistos = { open: 0, blob: 0 };
        window.open = () => { vistos.open++; return null; };
        URL.createObjectURL = () => { vistos.blob++; return 'blob:x'; };
        navigator.canShare = () => true;
        navigator.share = () => Promise.reject(new DOMException('Share canceled', 'AbortError'));
        await enviarValeImagenWA();
        await new Promise(r => setTimeout(r, 300));
        return vistos;
    });
    ok(cancel.open === 0 && cancel.blob === 0, `cancelar el menú de compartir descargó la imagen o abrió WhatsApp: ${JSON.stringify(cancel)}`);

    // 3) Nuevo cliente: la elección no se arrastra, y «sin dirección» no pone ninguna.
    await pagina.evaluate(() => { resetForm(); });
    await llenar(pagina);
    const reset = await pagina.evaluate(() => document.getElementById('almBody').textContent);
    ok(/Sin elegir/.test(reset), 'el almacén del cliente anterior se quedó puesto en el vale nuevo');
    await pagina.evaluate(() => copiarVale());
    ok(await esperar(pagina, 'document.getElementById("modalAlm").classList.contains("open") && document.querySelectorAll("#almLista .alm-opt").length > 0'),
       'el vale del cliente nuevo no preguntó el almacén');
    await pagina.evaluate(() => { const b = Array.from(document.querySelectorAll('#almLista .alm-opt')).at(-1); if (b) b.click(); });
    await pagina.waitForTimeout(100);
    const sinDir = await pagina.evaluate(() => window.__copiado.at(-1) || '');
    ok(sinDir.includes('María Pérez') && !sinDir.includes('Recoger en'), 'con «sin dirección» el vale lleva una dirección de almacén, o no se copió');

    // 4) ATENCIÓN: legible, editable y en el texto.
    const aten0 = await pagina.evaluate(() => {
        const li = document.querySelector('#atencionBox .aten-lista li');
        return { n: document.querySelectorAll('#atencionBox .aten-lista li').length, color: getComputedStyle(li).color,
                 fondo: getComputedStyle(document.getElementById('atencionBox')).backgroundColor, texto: construirTextoVale() };
    });
    ok(aten0.n === 4, `ATENCIÓN tiene que traer las 4 condiciones de siempre: ${aten0.n}`);
    ok(aten0.texto.includes('• Solo aceptamos hasta cinco billetes de 1 USD por compra'), 'el texto del vale no lleva las condiciones de siempre');
    const lum = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const contraste = (lum(aten0.color) + .05) / (lum(aten0.fondo) + .05);
    ok(contraste >= 7, `las condiciones se leen mal: contraste ${contraste.toFixed(1)}:1 (${aten0.color} sobre ${aten0.fondo})`);

    const aten1 = await pagina.evaluate(() => {
        document.querySelector('#atencionBox .aten-edit').click();
        document.getElementById('atenTitulo').value = '⚠️ Importante';
        document.getElementById('atenLineas').value = '• Pagos solo en efectivo\n\n- Horario de 9 a 5';
        guardarAten();
        return { lis: Array.from(document.querySelectorAll('#atencionBox .aten-lista li')).map(l => l.textContent),
                 tit: document.querySelector('#atencionBox .aten-tit').textContent,
                 guardado: JSON.parse(localStorage.getItem('valeAtencion')), texto: construirTextoVale() };
    });
    ok(aten1.lis.join('|') === 'Pagos solo en efectivo|Horario de 9 a 5', `las condiciones editadas no se guardaron limpias: ${JSON.stringify(aten1.lis)}`);
    ok(aten1.tit === '⚠️ Importante', 'el título editado no se guardó');
    ok(aten1.guardado && aten1.guardado.ts > 0, 'las condiciones no quedaron en el teléfono con su fecha');
    ok(aten1.texto.includes('⚠️ Importante\n• Pagos solo en efectivo\n• Horario de 9 a 5') && !aten1.texto.includes('cinco billetes'),
       'el texto del vale no lleva las condiciones editadas:\n' + aten1.texto.slice(-200));
    const vacio = await pagina.evaluate(() => {
        document.querySelector('#atencionBox .aten-edit').click();
        document.getElementById('atenLineas').value = '  \n ';
        guardarAten();
        return JSON.parse(localStorage.getItem('valeAtencion')).lineas.length;
    });
    ok(vacio === 2, 'se pudieron guardar unas condiciones vacías');
    await pagina.evaluate(() => { renderAtencion(false); });
    ok(!errores.length, 'errores de JavaScript en el vale: ' + errores.join(' | '));
    await ctx.close();
}

// ── 5) Sin conexión: con lo guardado avisa; sin nada guardado lo dice ──
respuestaDB = { estado: 500, cuerpo: {} };
{
    const { ctx, pagina, errores } = await abrir({ conCache: true });
    await llenar(pagina);
    await pagina.evaluate(() => abrirAlm());
    await esperar(pagina, '!_almCargando && document.querySelectorAll("#almLista .alm-opt").length > 0', 12000);
    const r = await pagina.evaluate(() => document.getElementById('almLista').textContent);
    ok(/Almacén Vedado/.test(r) && /Sin conexión/.test(r), `sin conexión tiene que enseñar los guardados y avisar: «${r.slice(0, 200)}»`);
    ok(!errores.length, 'errores de JavaScript sin conexión: ' + errores.join(' | '));
    await ctx.close();
}
{
    const { ctx, pagina, errores } = await abrir();
    await llenar(pagina);
    await pagina.evaluate(() => abrirAlm());
    await esperar(pagina, '!_almCargando && document.querySelectorAll("#almLista .alm-opt").length > 0', 12000);
    const r = await pagina.evaluate(() => ({ t: document.getElementById('almLista').textContent, n: document.querySelectorAll('#almLista .alm-opt').length }));
    ok(/No pude leer los almacenes/.test(r.t), `sin conexión y sin nada guardado no lo dice: «${r.t.slice(0, 200)}»`);
    ok(r.n === 1 && /Sin dirección/.test(r.t), 'sin almacenes tiene que quedar al menos «sin dirección» para poder enviar');
    ok(!errores.length, 'errores de JavaScript sin nada guardado: ' + errores.join(' | '));
    await ctx.close();
}

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones del vale (almacén, ATENCIÓN, compartir)`);
