/* «Comparé con Revolico el 17/11: no encontré ninguno más barato» en los posts
 * de Facebook — js/revolico_integration.js (_lineaMasBarato), comprobado en un
 * navegador de verdad.
 *
 * Lo que se protege no falla con un error: una frase de «más barato» que sale
 * cuando no es verdad es una promesa que el cliente viene a cobrar, y una que
 * no sale nunca es una función muerta. Las dos cosas se ven igual en el código.
 *
 *  - Con una comparación fresca, de este precio, con anuncios de Revolico y
 *    nadie por debajo: sale, con la FECHA, en las cuatro versiones.
 *  - Cada condición por separado la quita: búsqueda vieja, precio cambiado
 *    después, pocos anuncios, ninguno de Revolico, alguien más barato,
 *    producto en MN, producto agotado, sin datos del radar.
 *  - Sin datos, los textos son EXACTAMENTE los de siempre (la versión 0 no
 *    cambia).
 *  - Revólico no la lleva: ese anuncio dura meses y la frase envejecería.
 *
 * Se corre solo (`node tests/radar_publicar_check.mjs`) y desde unittest
 * (tests/test_radar_vigilar.py). Sale con código 1 si algo falla.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };

const P = CATALOGO.find(p => Number(p.stock) > 0 && Number(p.precioActual) > 0 && !p.moneda
                              && Array.isArray(p.ficha) && p.ficha.length);
if (!P) { console.log('no hay un producto de prueba adecuado en el catálogo — se salta'); process.exit(0); }

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block' });
await ctx.route(u => u.hostname !== 'localhost', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
const pagina = await ctx.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('whatsappNumero', '5354320170');
    window.open = () => ({});
});
await pagina.goto(`http://localhost:${PUERTO}/tests/anuncio_check.html`);
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/tm-bundle.js` });
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/admin-copilot.js` });
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/revolico_integration.js` });
await pagina.evaluate(cat => { localStorage.setItem('productos', JSON.stringify(cat)); try { productos = cat; } catch (e) {} }, CATALOGO);

// Un radar fresco y favorable para P; cada caso cambia UNA cosa.
const horas = h => new Date(Date.now() - h * 3600000).toISOString();
const radar = (_, producto = {}, raiz = {}) => Object.assign({
    actualizado: horas(2), fecha: '2026-11-17',
    productos: [Object.assign({
        id: P.id, nombre: P.nombre, tuPrecio: Number(P.precioActual),
        mercado: { min: Number(P.precioActual) + 5, mediana: Number(P.precioActual) + 10, n: 4 },
        muestras: [{ fuente: 'revolico', precio: Number(P.precioActual) + 5, titulo: 'x', url: 'https://r/1' }],
    }, producto)],
}, raiz);
const textos = (datos, p = P) => pagina.evaluate(({ datos, p }) => {
    window.tmRadarDatos = () => datos;
    return {
        fb: [0, 1, 2, 3].map(v => _textoFacebook(p, { variante: v })),
        rev: [0, 1, 2, 3].map(v => _textoRevolico(p, v).descripcion),
    };
}, { datos, p });
const LINEA = /Comparé con Revolico el \d\d\/\d\d: no encontré ninguno más barato\./;

// ── 1) El caso que sí ──────────────────────────────────────────────────
const bueno = await textos(radar());
bueno.fb.forEach((x, v) => ok(LINEA.test(x), `la versión ${v} no lleva la frase con una comparación fresca y favorable`));
const d = new Date(Date.now() - 2 * 3600000);
const fechaEsperada = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
ok(bueno.fb[0].includes(`el ${fechaEsperada}:`), `la fecha de la frase no es la de la comparación (${fechaEsperada})`);
bueno.rev.forEach((x, v) => ok(!/Comparé con Revolico|más barato/.test(x), `Revólico (versión ${v}) lleva la frase: ese anuncio dura meses y envejece`));

// ── 2) Cada condición, por separado, la quita ─────────────────────────────
const sinFrase = async (nombre, datos, p) => {
    const t = await textos(datos, p);
    t.fb.forEach((x, v) => ok(!LINEA.test(x), `«${nombre}»: la versión ${v} lleva la frase y no debería`));
};
await sinFrase('búsqueda de hace 30 h', radar({}, {}, { actualizado: horas(30) }));
await sinFrase('búsqueda del futuro (reloj raro)', radar({}, {}, { actualizado: horas(-5) }));
await sinFrase('el precio cambió después de comparar', radar({}, { tuPrecio: Number(P.precioActual) + 7 }));
await sinFrase('solo 2 anuncios', radar({}, { mercado: { min: Number(P.precioActual) + 5, n: 2 } }));
await sinFrase('ningún anuncio de Revolico', radar({}, { muestras: [{ fuente: 'porlalivre', precio: Number(P.precioActual) + 5 }] }));
await sinFrase('sin muestras', radar({}, { muestras: [] }));
await sinFrase('alguien más barato', radar({}, { mercado: { min: Number(P.precioActual) - 1, n: 4 } }));
await sinFrase('producto en MN', radar({}, { tuMoneda: 'MN' }));
await sinFrase('sin datos del radar', null);
await sinFrase('radar vacío', { actualizado: horas(1), productos: [] });
await sinFrase('otro producto', radar({}, { id: 'otro-id' }));
await sinFrase('agotado', radar(), Object.assign({}, P, { stock: 0 }));

// Igualar el mínimo no es estar por encima: la frase dice «ninguno más barato».
const igual = await textos(radar({}, { mercado: { min: Number(P.precioActual), n: 4 } }));
igual.fb.forEach((x, v) => ok(LINEA.test(x), `la versión ${v}: con un anuncio al mismo precio «ninguno más barato» sigue siendo verdad`));

// ── 3) Sin datos, los textos son los de siempre ───────────────────────────
const base = await pagina.evaluate(p => { window.tmRadarDatos = undefined; return [0, 1, 2, 3].map(v => _textoFacebook(p, { variante: v })); }, P);
const sinDatos = await textos(null);
ok(JSON.stringify(base) === JSON.stringify(sinDatos.fb), 'sin datos del radar los textos dejaron de ser los de siempre');
ok(new Set(base).size === 4, 'las cuatro versiones dejaron de ser distintas entre sí');

// ── 4) El panel entrega los datos al motor de textos ──────────────────────
const html = await readFile(join(RAIZ, 'admin.html'), 'utf8');
ok(html.includes('window.tmRadarDatos=function(){ return RADAR; };'), 'admin.html no expone window.tmRadarDatos: la frase no saldría nunca');

ok(erroresJs.length === 0, 'errores de JavaScript en la página: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de «más barato que en Revolico» en regla.`);
