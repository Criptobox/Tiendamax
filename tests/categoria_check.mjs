/* La pantalla 🏷️ Compartir categoría — en un navegador de verdad.
 *
 * Cuatro cosas que se rompen sin dar un solo error:
 *
 *  - **Un lote cancelado apuntaba doce productos como publicados.** Los
 *    carteles se marcaban MIENTRAS se dibujaban, antes de compartir: bastaba
 *    con abrir la hoja de compartir y darle atrás para que doce quedaran
 *    hechos en el Historial sin haber salido. Y «Hoy toca publicar» lee ese
 *    mismo registro, así que dejaba de proponerlos.
 *  - **El tope de doce dejaba productos inalcanzables.** Era un slice(0,12)
 *    fijo, así que en una categoría de diecisiete salían siempre los MISMOS
 *    doce. El aviso «de 17, tope 12» era verdad y no servía de nada.
 *  - **La garantía se prometía en todas las categorías.** La escribe el
 *    gestor producto a producto y casi ninguno la trae; imprimirla igual es
 *    una promesa que el cliente vuelve a cobrar.
 *  - **Un solo texto para cuatro redes.** Facebook corta en «Ver más» a las
 *    dos primeras líneas, WhatsApp castiga los hashtags, Instagram no hace
 *    clicable el enlace del pie y Revólico lo muestra en texto plano.
 *
 * Nada de esto se puede comprobar leyendo admin.html: que el tope esté
 * escrito no dice qué doce salen, y que la palabra «Garantía» esté en el
 * fichero no dice cuándo se imprime.
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

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
               '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

const servidor = createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    if (p.endsWith('/publicaciones.json')) { r.writeHead(404); r.end(); return; }
    const ruta = normalize(join(RAIZ, decodeURIComponent(p)));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

/* Los productos salen del catálogo de verdad —hacen falta fotos que existan,
   porque un cartel sin foto se descarta a propósito— y se les cambia solo lo
   que este test necesita distinguir. */
const REALES = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'))
    .filter(p => Number(p.stock) > 0 && (p.imagen || (p.imagenes || [])[0]));
if (REALES.length < 24) { console.log('catálogo insuficiente para el test — se salta'); process.exit(0); }

let n = 0;
const tomar = (cuantos, extra) => REALES.slice(n, n += cuantos)
    .map((p, i) => Object.assign({}, p, { id: 'fix-' + (n - cuantos + i), stock: 5,
                                          masVendido: false, precioOriginal: 0 }, extra(p, i)));

const MIOS = [].concat(
    /* 17 productos: dos tandas (12 + 5). Ninguno con garantía. Todos en USD.
       Los nombres imitan al catálogo de verdad: una marca que se repite y una
       palabra suelta distinta en cada uno, más una genérica que se repite.
       Con nombres de una sola palabra no se nota la diferencia entre recortar
       las etiquetas y no recortarlas, ni si la lista de genéricas se aplica. */
    tomar(17, (p, i) => ({ categoria: 'GRANDE',
                           nombre: 'Grande ' + (i + 1) + ' Mikrotik Adaptador Rarito' + String.fromCharCode(97 + i),
                           garantia: '', moneda: null, precioActual: 20 + i })),
    // Todos con garantía escrita: ahí sí se puede prometer.
    tomar(3, () => ({ categoria: 'CONGAR', garantia: '6 meses', moneda: null, precioActual: 90 })),
    // Dos monedas en la misma categoría: no hay un «desde» que sea verdad.
    tomar(1, () => ({ categoria: 'MIXTA', garantia: '', moneda: null, precioActual: 500 })),
    tomar(1, () => ({ categoria: 'MIXTA', garantia: '', moneda: 'MN', precioActual: 280 })),
    // Solo MN: el «desde» tiene que decir la moneda.
    tomar(2, (p, i) => ({ categoria: 'SOLOMN', garantia: '', moneda: 'MN', precioActual: 1500 + i })),
);

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 1400 }, serviceWorkers: 'block' });
const erroresJs = [];
// En Playwright gana la ruta registrada MÁS TARDE: el corte general va primero.
await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
/* Las fotos del catálogo son URLs absolutas a tiendamax.org y se sirven desde
   el repo: un cartel sin foto se descarta a propósito, así que sin esto el
   lote no generaría nada y el test pasaría por el motivo equivocado. */
await ctx.route('https://tiendamax.org/**', async r => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(new URL(r.request().url()).pathname)));
    try {
        const cuerpo = await readFile(ruta);
        await r.fulfill({ status: 200, contentType: MIME[extname(ruta)] || 'application/octet-stream', body: cuerpo });
    } catch (e) { await r.abort(); }
});

const pagina = await ctx.newPage();
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
await pagina.waitForTimeout(2500);
await pagina.evaluate(prods => {
    localStorage.removeItem('tm_publog_v1');
    PRODUCTOS = prods;
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
    go('publicar');
    pubSwitch('categoria');       // la pantalla vive en su propia pestaña
}, MIOS);
await pagina.waitForTimeout(3000);

// ── 1) Tandas: nada queda fuera de alcance ───────────────────────────
const tandas = await pagina.evaluate(() => ({
    n: pubCatTandas('GRANDE'),
    t0: pubCatProdsTanda('GRANDE', 0).map(p => p.id),
    t1: pubCatProdsTanda('GRANDE', 1).map(p => p.id),
    todos: pubCatProds('GRANDE').map(p => p.id),
    unaSola: pubCatTandas('CONGAR'),
}));
ok(tandas.n === 2, `17 productos son 2 tandas; dice ${tandas.n}`);
ok(tandas.t0.length === 12 && tandas.t1.length === 5,
   `la primera tanda son 12 y la segunda 5; son ${tandas.t0.length} y ${tandas.t1.length}`);
const cubiertos = new Set([...tandas.t0, ...tandas.t1]);
ok(cubiertos.size === tandas.todos.length && tandas.todos.every(id => cubiertos.has(id)),
   'entre las tandas tienen que salir TODOS: con el tope fijo cinco no se podían publicar nunca');
ok(tandas.t0.every(id => !tandas.t1.includes(id)),
   'una tanda no puede repetir lo de la anterior, o se publica dos veces lo mismo');
ok(tandas.unaSola === 1, 'una categoría que cabe en una tanda no se parte');

await pagina.evaluate(() => { pubCatOnSelect('GRANDE'); });
await pagina.waitForTimeout(2600);
const cabecera = await pagina.evaluate(() => (document.getElementById('pub-cat-preview') || {}).textContent || '');
ok(/Tanda 1 de 2/.test(cabecera), `tiene que decir en qué tanda va; dice «${cabecera.slice(0, 120)}»`);
ok(/de 17/.test(cabecera), 'y cuántos hay en total, o no se sabe que falta algo');

await pagina.evaluate(() => pubCatTandaIr(1));
await pagina.waitForTimeout(2600);
const cabecera2 = await pagina.evaluate(() => (document.getElementById('pub-cat-preview') || {}).textContent || '');
ok(/Tanda 2 de 2/.test(cabecera2), 'el botón ▶ tiene que llevar a la tanda siguiente');
await pagina.evaluate(() => pubCatTandaIr(-1));
await pagina.waitForTimeout(2600);

// ── 2) Un lote cancelado no apunta NADA ──────────────────────────────
await pagina.evaluate(() => {
    localStorage.removeItem('tm_publog_v1');
    // Hoja de compartir disponible, pero el usuario la cierra.
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(Object.assign(new Error('Share canceled'), { name: 'AbortError' }));
});
await pagina.evaluate(() => pubCatCartelesLote('GRANDE', 'share'));
await pagina.waitForTimeout(1500);
const trasCancelar = await pagina.evaluate(() => ({
    log: JSON.parse(localStorage.getItem('tm_publog_v1') || '[]').length,
    info: (document.getElementById('pub-cat-lote-info') || {}).textContent || '',
    tanda: pubCatTandas('GRANDE') > 1 ? (document.getElementById('pub-cat-preview') || {}).textContent || '' : '',
}));
ok(trasCancelar.log === 0,
   `cancelar la hoja de compartir no puede dejar ${trasCancelar.log} productos apuntados como publicados: `
   + 'el Historial los da por hechos y «Hoy toca» deja de proponerlos');
ok(/[Cc]ancelad/.test(trasCancelar.info),
   `y tiene que decirlo, o parece que salió; dice «${trasCancelar.info}»`);
ok(!/Tanda 2 de 2/.test(trasCancelar.tanda), 'cancelado no avanza de tanda');

// ── 3) Un lote que SÍ sale apunta la tanda, y solo la tanda ──────────
await pagina.evaluate(() => { navigator.share = () => Promise.resolve(); });
await pagina.evaluate(() => pubCatCartelesLote('GRANDE', 'share'));
await pagina.waitForTimeout(2000);
const trasSalir = await pagina.evaluate(() => ({
    log: JSON.parse(localStorage.getItem('tm_publog_v1') || '[]'),
    t0: pubCatProdsTanda('GRANDE', 0).map(p => p.id),
    t1: pubCatProdsTanda('GRANDE', 1).map(p => p.id),
}));
const apuntados = new Set(trasSalir.log.map(e => e.pid));
ok(apuntados.size === 12,
   `salieron los 12 de la tanda: tienen que quedar 12 apuntados, hay ${apuntados.size}`);
ok(trasSalir.t0.every(id => apuntados.has(id)),
   'lo apuntado tiene que ser exactamente lo que se compartió');
ok(trasSalir.t1.every(id => !apuntados.has(id)),
   'lo que NO salió no puede quedar apuntado: es lo que queda por publicar');
await pagina.waitForTimeout(1400);
const avanzo = await pagina.evaluate(() => (document.getElementById('pub-cat-preview') || {}).textContent || '');
ok(/Tanda 2 de 2/.test(avanzo),
   'al terminar una tanda la pantalla pasa a la siguiente: el trabajo es publicar la categoría, no doce');

// ── 4) La garantía solo cuando es verdad ─────────────────────────────
const gar = await pagina.evaluate(() => ({
    sin: pubCatText('GRANDE', 'fb'),
    con: pubCatText('CONGAR', 'fb'),
    tarjetaSin: tmCatalogHTML('GRANDE'),
    tarjetaCon: tmCatalogHTML('CONGAR'),
}));
ok(!/[Gg]arant/.test(gar.sin),
   'ninguno de esos productos tiene garantía escrita: prometerla es una promesa que el cliente vuelve a cobrar');
ok(/Garantía/.test(gar.con), 'y donde todos la tienen, sí se dice: es un argumento de venta real');
ok(!/[Gg]arant/.test(gar.tarjetaSin), 'la imagen de la categoría prometía lo mismo que el texto');
ok(/Garantía/.test(gar.tarjetaCon), 'y tiene que seguir diciéndolo cuando toca');
ok(/Pruébalo al recibir/.test(gar.sin),
   'sin garantía la línea no desaparece: lo que sí es verdad sigue vendiendo');

// ── 5) Un texto por red ──────────────────────────────────────────────
const t = await pagina.evaluate(() => ({
    wa: pubCatText('GRANDE', 'wa'), fb: pubCatText('GRANDE', 'fb'),
    ig: pubCatText('GRANDE', 'ig'), rev: pubCatText('GRANDE', 'rev'),
}));
const distintos = new Set([t.wa, t.fb, t.ig, t.rev]);
ok(distintos.size === 4, `las cuatro redes no pueden recibir el mismo texto; hay ${distintos.size} distintos`);
[['wa', t.wa], ['fb', t.fb], ['ig', t.ig], ['rev', t.rev]].forEach(([r, x]) => {
    ok(/Grande 1/.test(x) && /\$20/.test(x), `el texto de ${r} tiene que llevar nombres y precios`);
});

ok(!/#/.test(t.wa), 'en WhatsApp los hashtags leen como spam: es un chat, no un muro');
ok(!/Escribe "QUIERO" por WhatsApp/.test(t.wa),
   'no se manda a WhatsApp a quien ya está escribiendo por WhatsApp');

const fb2 = t.fb.split('\n').slice(0, 2).join(' ');
ok(!/TIENDAMAX/.test(fb2),
   `Facebook corta en «Ver más» tras dos líneas: ahí no puede ir el nombre de la tienda. Van: «${fb2}»`);
ok(/\$20/.test(fb2) && /17|12|en stock/.test(fb2),
   `esas dos líneas son las únicas que se leen seguro: tienen que llevar el gancho y el dato. Van: «${fb2}»`);
ok(/#/.test(t.fb), 'en Facebook los hashtags del final sí trabajan');

ok(/bio/.test(t.ig), 'en Instagram el enlace del pie no es clicable: el enlace está en la bio');
ok(!/🔗 tiendamax\.org/.test(t.ig), 'mandar a copiar una URL a mano desde Instagram no es una llamada a la acción');

ok(!/#/.test(t.rev), 'Revólico es un formulario: los hashtags son relleno');
ok(!/🏪|━/.test(t.rev), 'y lo muestra en texto plano: la cabecera de marca empuja los precios fuera de la vista');

// ── 6) «desde X» nunca mezcla monedas ────────────────────────────────
const desde = await pagina.evaluate(() => ({
    mixta: pubCatDesde(pubCatProds('MIXTA')),
    soloMn: pubCatDesde(pubCatProds('SOLOMN')),
    soloUsd: pubCatDesde(pubCatProds('CONGAR')),
    textoMixta: pubCatText('MIXTA', 'fb'),
}));
ok(desde.mixta === 'desde $500 · desde 280 MN',
   `con dos monedas salen las dos, cada una con su «desde»; dice «${desde.mixta}»`);
ok(!/\$280|desde \$280/.test(desde.mixta),
   'el mínimo de los 280 MN no puede salir con el símbolo del dólar: es el error de la Linterna');
ok(!/desde \$500 · 280/.test(desde.mixta),
   'sin repetir «desde», «$500 · 280 MN» se lee como un precio puesto en dos monedas');
ok(desde.soloMn === 'desde 1500 MN', `en MN hay que decir la moneda; dice «${desde.soloMn}»`);
ok(desde.soloUsd === 'desde $90', `en USD, el símbolo; dice «${desde.soloUsd}»`);

// ── 7) El precio dentro del anuncio, y las etiquetas ─────────────────
const remate = await pagina.evaluate(() => ({
    fb: pubCatText('GRANDE', 'fb'),
    mn: pubCatText('SOLOMN', 'fb'),
}));
ok(!/\.00/.test(remate.fb),
   'doce líneas de «$130.00» son ruido: los céntimos son cero en todo el catálogo');
ok(!/\$\d+ USD/.test(remate.fb), 'el símbolo y la palabra USD juntos sobran');
ok(/— 1[.,]?500 MN/.test(remate.mn) && !/\$1[.,]?500 MN/.test(remate.mn),
   `en MN se escribe «1,500 MN», nunca «$1,500 MN»; sale «${(remate.mn.match(/— .*MN/) || [''])[0]}»`);
const tags = (remate.fb.match(/#\w+/g) || []);
ok(tags.length <= 8,
   `salían 22 etiquetas por publicación y ninguna red premia la cantidad; salen ${tags.length}`);
ok(tags.includes('#TiendaMax') && tags.includes('#Cuba') && tags.includes('#GRANDE'),
   'la marca, el país y la categoría no se pierden por recortar');
ok(tags.includes('#Mikrotik'),
   'lo que se repite en varios productos es la marca, y esa sí se busca');
ok(!tags.some(t => /^#Rarito/.test(t)),
   `una palabra que sale en UN solo producto no trae a nadie y ocupa el sitio `
   + `de una marca; salieron ${JSON.stringify(tags)}`);
ok(!tags.some(t => /^#(Adaptador|Exterior|Cable|Loco|Patch|Internacional)$/i.test(t)),
   'las palabras genéricas del nombre no son etiquetas: nadie busca «#Adaptador»');

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Compartir categoría: 39 comprobaciones OK');
