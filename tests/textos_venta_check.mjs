/* Vender el problema que resuelve, no la ficha — los textos de Facebook
 * (js/revolico_integration.js) y de «Por categoría» (admin.html), en el
 * admin.html de verdad y en un navegador de verdad.
 *
 * Nada de esto falla con un error: un post que abre con «Estación de energía
 * portátil de alta potencia…» se publica igual, y un gancho con «aguanta 10
 * horas» inventado también. Lo que se protege:
 *
 *  - Las dos primeras líneas (lo que se ve antes de «Ver más») llevan el uso y
 *    el precio, en las cuatro versiones.
 *  - El gancho sale del que aprobó el gestor o del «Ideal para» del producto;
 *    nunca del «Ideal para» genérico que comparten varios productos.
 *  - Ningún gancho con una cifra que no esté en los datos (con su unidad: 10
 *    horas no es 10A), ni precio, ni garantía o rebaja no declaradas; un gancho
 *    guardado que no pasa no se imprime.
 *  - La confianza («lo pruebas y pagas al recibirlo») en todo lo físico y en
 *    nada digital, que se paga antes.
 *  - Hashtags de SU categoría (no #tecnologia en un aceite), #oferta solo con
 *    rebaja y nada de #envio.
 *  - «Por categoría»: en las categorías con problema, la pregunta arriba, el
 *    «para qué» de cada producto y la pregunta de cierre; en ninguna, la
 *    urgencia inventada de «mañana suben con la tasa» ni «QUEDAN POCOS».
 *  - El editor del gancho en la cola: no guarda lo que no pasa, y lo que pasa
 *    se guarda en el producto (para «Actualizar tienda») y rehace el texto.
 *
 * Se corre solo (`node tests/textos_venta_check.mjs`) y desde unittest
 * (tests/test_textos_venta.py). Sale con código 1 si algo falla.
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

const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
await ctx.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
pagina.on('dialog', d => d.accept());
await pagina.addInitScript(() => {
    if (sessionStorage.getItem('_ini')) return;
    sessionStorage.setItem('_ini', '1');
    localStorage.setItem('whatsappNumero', '5354320170');
    localStorage.setItem('gruposFB', JSON.stringify([{ nombre: 'Grupo A', url: 'https://www.facebook.com/groups/grupoa/', categorias: [], ts: 1 }]));
    window.open = () => ({});
});
await pagina.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded' });
await pagina.waitForTimeout(4500);
await pagina.evaluate(() => {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.querySelectorAll('#loginModal,.tm2-login,.tm2-login-card,#tm2Login').forEach(e => { e.style.display = 'none'; });
});

// Productos de prueba, metidos en el catálogo del panel.
const r = await pagina.evaluate(() => {
    const base = { stock: 5, activo: true, imagen: '', descripcion: 'Descripción técnica larga del fabricante, para el final.' };
    const SOLAR = Object.assign({}, base, {
        id: 'tv-solar', nombre: 'Estación Solar X100', categoria: 'ENERGIA', precioActual: 300,
        idealPara: ['Respaldo doméstico durante apagones prolongados: refrigerador, router y luces', 'Campamentos y viajes'],
        caracteristicas: [{ d: 'Batería LiFePO4 de 1000 Wh' }, { d: 'Salida de 1200W de onda pura' }, { d: 'Incluye tarjeta de garantía del fabricante' }],
        // «10A» está en la ficha: «10 horas» solo se rechaza si se mira la unidad.
        ficha: [{ k: 'Categoría', v: 'Energía' }, { k: 'Capacidad', v: '1000 Wh' }, { k: 'Salida DC', v: '12V/10A' }],
    });
    const GEN = (i) => Object.assign({}, base, { id: 'tv-gen' + i, nombre: 'Aceite ' + i, categoria: 'CARROS', precioActual: 20 + i,
        idealPara: ['Mantenimiento preventivo y protección de vehículos'], ficha: [{ k: 'Estado', v: 'Nuevo' }, { k: 'Viscosidad', v: '5W-30' }] });
    const REBAJA = Object.assign({}, GEN(9), { id: 'tv-rebaja', nombre: 'Aceite rebajado', precioActual: 25, precioOriginal: 30 });
    const DIGI = Object.assign({}, base, { id: 'tv-digi', nombre: 'Tarjeta Regalo', categoria: 'TARJETAS', precioActual: 12, digital: true, stock: 99 });
    // Cada copia con su propio «Ideal para»: tres productos con el mismo serían, con razón, relleno.
    const CON_GANCHO = Object.assign({}, SOLAR, { id: 'tv-gancho', idealPara: ['Oficinas pequeñas sin corriente'], gancho: '🔌 ¿Se va la luz? Sigue con el refrigerador y el router encendidos' });
    const GANCHO_MALO = Object.assign({}, SOLAR, { id: 'tv-malo', idealPara: ['Talleres con apagones frecuentes'], gancho: '🔌 Aguanta 10 horas el refrigerador' });
    [SOLAR, GEN(1), GEN(2), GEN(3), REBAJA, DIGI, CON_GANCHO, GANCHO_MALO].forEach(p => PRODUCTOS.push(p));
    const vs = p => [0, 1, 2, 3].map(v => _textoFacebook(p, { variante: v }));
    return {
        solar: vs(SOLAR), gen: vs(GEN(1)), rebaja: vs(REBAJA), digi: vs(DIGI), gancho: vs(CON_GANCHO), malo: vs(GANCHO_MALO),
        precioSolar: _precioTxt(SOLAR), precioGancho: _precioTxt(CON_GANCHO),
        validos: [
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 ¿Se va la luz? Sigue con el refrigerador encendido'),
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 Con 1200 vatios mueves lo de la casa'),
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 Batería de 1000 Wh para el apagón'),
        ],
        invalidos: [
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 Aguanta 10 horas el refrigerador'),
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 Por solo $300 tienes luz'),
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 Con garantía de por vida'),
            _ganchoProblema(_productoPorId('tv-solar'), '🔌 Antes costaba más'),
            _ganchoProblema(_productoPorId('tv-solar'), 'corto'),
        ],
    };
});

// ── 1) Las dos primeras líneas ─────────────────────────────────────────────
r.solar.forEach((t, v) => {
    const dos = t.split('\n').slice(0, 2).join(' ');
    ok(dos.includes(r.precioSolar), `versión ${v}: el precio no está en las dos primeras líneas (lo que se ve antes de «Ver más»): «${dos}»`);
    ok(/apagones/i.test(dos), `versión ${v}: el uso no está en las dos primeras líneas: «${dos}»`);
});
ok(r.solar[0].split('\n')[0].startsWith('🎯 '), 'sin gancho aprobado, la versión 0 tiene que abrir con el «Ideal para»');
ok(new Set(r.solar).size === 4, 'las cuatro versiones tienen que seguir siendo distintas');
ok([0, 2].every(v => r.solar[v].includes('Descripción técnica larga')), 'la descripción tiene que seguir en el post de las versiones 0 y 2 (más abajo)');

// ── 2) El gancho aprobado manda; el genérico no se usa ─────────────────────
r.gancho.forEach((t, v) => {
    const dos = t.split('\n').slice(0, 2).join(' ');
    ok(dos.includes('Sigue con el refrigerador y el router encendidos'), `versión ${v}: el gancho aprobado no está arriba: «${dos}»`);
    ok(dos.includes(r.precioGancho), `versión ${v}: con gancho, el precio sigue en las dos primeras líneas`);
});
r.gen.forEach((t, v) => {
    ok(!/Mantenimiento preventivo/.test(t), `versión ${v}: el «Ideal para» que comparten tres productos es relleno y salió`);
    ok(!/Categoría:|Estado:/.test(t), `versión ${v}: la ficha de relleno («Categoría:», «Estado:») salió como si fuera un argumento`);
});

// ── 3) La validación del gancho ────────────────────────────────────────────
ok(r.validos.every(x => x === ''), `ganchos con datos reales rechazados: ${JSON.stringify(r.validos)}`);
ok(r.invalidos.every(x => x), `ganchos que no pueden salir y pasaron: ${JSON.stringify(r.invalidos)}`);
ok(/10 horas/.test(r.invalidos[0]), `«10 horas» no está en la ficha (que dice 10A, 1000 Wh y 1200W): «${r.invalidos[0]}»`);
r.malo.forEach((t, v) => ok(!/10 horas/.test(t), `versión ${v}: un gancho guardado con una cifra inventada se imprimió`));

// ── 4) Promesas, confianza y hashtags ──────────────────────────────────────
r.solar.forEach((t, v) => ok(!/garant[ií]a/i.test(t), `versión ${v}: una frase del fabricante con «garantía» coló una promesa que el producto no declara`));
r.solar.forEach((t, v) => ok(/pagas cuando lo tienes en la mano/.test(t), `versión ${v}: falta la confianza (lo pruebas y pagas al recibirlo)`));
r.digi.forEach((t, v) => ok(!/pagas cuando lo tienes|al recibirlo/.test(t), `versión ${v}: un código digital se paga antes; no puede decir que se paga al recibirlo`));
ok(/#carros/.test(r.gen[0]) && !/#tecnologia/.test(r.gen[0]), `un aceite (CARROS) tiene que llevar #carros, no #tecnologia: «${r.gen[0].split('\n').pop()}»`);
ok(!/#oferta/.test(r.gen[0]) && /#oferta/.test(r.rebaja[0]), '#oferta solo con una rebaja de verdad');
ok(![...r.solar, ...r.gen, ...r.rebaja].some(t => /#envio/.test(t)), '#envio prometía un envío que el producto no declara');
ok(/¿Te lo aparto\?/.test(r.solar[0]), 'la versión 0 tiene que cerrar con una pregunta');

// ── 5) «Por categoría» ─────────────────────────────────────────────────────
const cat = await pagina.evaluate(() => ({
    energia: pubCatText('ENERGIA', 'fb'), energiaWa: pubCatText('ENERGIA', 'wa'), energiaRev: pubCatText('ENERGIA', 'rev'),
    carros: pubCatText('CARROS', 'fb'), tarjetas: pubCatConfianza([PRODUCTOS.find(p => p.id === 'tv-digi')]),
    fisicos: pubCatConfianza([PRODUCTOS.find(p => p.id === 'tv-solar')]),
}));
ok(cat.energia.split('\n')[0].includes('¿Cuánto quieres mantener encendido'), `ENERGÍA tiene que abrir con la pregunta del problema: «${cat.energia.split('\n')[0]}»`);
ok(/↳ Respaldo doméstico durante apagones/.test(cat.energia), 'en un post por problema, cada producto tiene que decir para qué sirve');
ok(/Dime qué quieres mantener encendido/.test(cat.energia) && /Dime qué quieres mantener encendido/.test(cat.energiaWa),
   'el post por problema tiene que cerrar invitando a contar qué necesita');
ok(!/↳/.test(cat.energiaRev), 'Revólico es texto plano: sin «para qué» debajo de cada línea');
ok(/¿Al carro le toca/.test(cat.carros), 'CARROS tiene que abrir con su problema');
ok(![cat.energia, cat.energiaWa, cat.energiaRev, cat.carros].some(t => /mañana suben con la tasa|Precios de HOY/i.test(t)),
   'los precios están en dólares o fijos en MN: «mañana suben con la tasa» es una urgencia inventada');
const html = await readFile(join(RAIZ, 'admin.html'), 'utf8');
const ganchoDef = (html.match(/const PUB_GANCHOS_DEF = \[[^\]]*\]/) || [''])[0];
ok(ganchoDef && !/QUEDAN POCOS|VOLANDO|SE ACABA/i.test(ganchoDef), `los ganchos por defecto no pueden prometer escasez que no se sabe: ${ganchoDef}`);
ok(/paga en la entrega/.test(cat.fisicos) && !/paga en la entrega|Pruébalo/.test(cat.tarjetas),
   `la confianza de la categoría: pagar en la entrega en lo físico, nunca en lo digital («${cat.fisicos}» / «${cat.tarjetas}»)`);

// ── 6) El editor del gancho en la cola ─────────────────────────────────────
const editor = await pagina.evaluate(async () => {
    localStorage.setItem('productosModificados', '[]');
    await tmColaGrupos('tv-solar');
    await new Promise(r => setTimeout(r, 600));
    const hay = !!document.getElementById('colaGanchoIn');
    const inp = document.getElementById('colaGanchoIn');
    inp.value = '🔌 Aguanta 10 horas el refrigerador';
    document.getElementById('colaGanchoOk').click();
    const rechazo = document.getElementById('colaGanchoMsg').textContent;
    const trasMalo = PRODUCTOS.find(p => p.id === 'tv-solar').gancho;
    document.getElementById('colaGanchoIn').value = '🔌 ¿Se va la luz? Sigue con el refrigerador encendido';
    document.getElementById('colaGanchoOk').click();
    const p = PRODUCTOS.find(p => p.id === 'tv-solar');
    const texto = document.getElementById('colaTexto').value;
    const mods = JSON.parse(localStorage.getItem('productosModificados') || '[]');
    cerrarColaGrupos();
    return { hay, rechazo, trasMalo, guardado: p.gancho, texto, marcado: mods.map(String).includes('tv-solar') };
});
ok(editor.hay, 'el paso de la cola tiene que ofrecer escribir el gancho');
ok(/No lo guardo/.test(editor.rechazo) && !editor.trasMalo, `un gancho con «10 horas» inventado se guardó: «${editor.rechazo}»`);
ok(editor.guardado === '🔌 ¿Se va la luz? Sigue con el refrigerador encendido', `el gancho válido no se guardó en el producto (${editor.guardado})`);
ok(editor.texto.split('\n').slice(0, 2).join(' ').includes('Sigue con el refrigerador encendido'), 'guardar el gancho no rehízo el texto del grupo');
ok(editor.marcado, 'el gancho guardado no quedó marcado para «Actualizar tienda»: no llegaría al otro teléfono');

const erroresPropios = erroresJs.filter(e => !/firebase is not defined/.test(e));
ok(erroresPropios.length === 0, 'errores de JavaScript en la página: ' + erroresPropios.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de los textos de venta en regla.`);
