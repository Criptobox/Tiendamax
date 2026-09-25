/* Regresión de la imagen de anuncio — js/revolico_integration.js
 *
 * Un solo lienzo dibuja las tres imágenes que publica la tienda: el anuncio de
 * Revólico (cuadrado, sin texto), el post de Facebook y el lote por categoría
 * (cuadrado, con texto) y el Estado de WhatsApp (vertical, con texto).
 *
 * Lo que se protege es lo que ya se rompió una vez y NO avisa:
 *
 *  - El alto del bloque de texto se reserva con una cuenta y el texto se pinta
 *    con otra. Cuando se separaron, el precio salió pintado encima del
 *    "TiendaMax" de la franja de marca. Canvas no da error: dibuja lo que le
 *    pidas donde se lo pidas, y el anuncio se publica ilegible.
 *  - El nombre se corta a dos o tres renglones. El cartel viejo cortaba por
 *    palabras y "Switch Gigabit de 8 Puertos" salía "SWITCH PUERTOS", sin el 8,
 *    que es lo único que lo distingue del de 5 puertos.
 *  - Un nombre largo puede comerse el alto de la foto hasta dejarla en nada.
 *
 * Necesita navegador de verdad: las tres cosas dependen de measureText(), que
 * no existe en Node. Se corre solo (`node tests/anuncio_check.mjs`) y desde
 * unittest (tests/test_anuncio.py). Sale con código 1 si algo falla.
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

const PRODUCTOS = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pagina = await navegador.newPage();
const erroresJs = [];
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
// Sin red: la foto no debe hacer falta para el reparto del lienzo, y así el
// test no depende de que las imágenes de tiendamax.org estén accesibles.
await pagina.route(u => u.hostname === 'tiendamax.org', r => r.abort());
await pagina.goto(`http://localhost:${PUERTO}/tests/anuncio_check.html`);
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/tm-bundle.js` });
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/admin-copilot.js` });
await pagina.addScriptTag({ url: `http://localhost:${PUERTO}/js/revolico_integration.js` });

const hayApi = await pagina.evaluate(() => typeof window.tmAnuncioImagen === 'function');
ok(hayApi, 'window.tmAnuncioImagen no existe: el Estado de WhatsApp y el lote por categoría lo llaman por ahí.');

if (hayApi) {
    // Las versiones de los grupos (variante 1–3, y el 4:5 «retrato») mueven el
    // texto y el formato: tienen que cumplir lo mismo que el anuncio de siempre.
    const combinaciones = [['cuadrado', 0], ['vertical', 0], ['retrato', 0],
                           ['cuadrado', 1], ['retrato', 1], ['cuadrado', 2],
                           ['retrato', 2], ['cuadrado', 3], ['retrato', 3]];
    for (const [formato, variante] of combinaciones) {
        const medidas = await pagina.evaluate(async ({ productos, formato, variante }) => {
            const salida = [];
            for (const p of productos) {
                const cv = document.createElement('canvas');
                await window.tmAnuncioImagen(cv, p, { formato, texto: true, variante });
                // El título se LEE del lienzo (d.titulo), no se recalcula
                // aquí: recalculándolo, el test comprobaba su propia copia de
                // la lógica y daba por bueno un corte que el dibujo sí hacía.
                const d = JSON.parse(cv.dataset.tmAnuncio || '{}');
                const limpio = (typeof tmPartirEmoji === 'function')
                    ? (tmPartirEmoji(p.nombre || '').texto || p.nombre || '') : (p.nombre || '');
                salida.push({ id: p.id, nombre: p.nombre, ancho: cv.width, alto: cv.height,
                              texto: d.titulo || '', limpio, ...d });
            }
            return salida;
        }, { productos: PRODUCTOS, formato, variante });

        for (const m of medidas) {
            const quien = `[${formato} v${variante}] ${m.nombre}`;
            if (formato === 'retrato') ok(m.ancho === 1080 && m.alto === 1350,
               `${quien}: el 4:5 tiene que ser 1080×1350, sale ${m.ancho}×${m.alto}`);
            ok(m.variante === variante, `${quien}: pedida la versión ${variante}, el lienzo dice ${m.variante}`);
            ok(m.yFinTexto > 0 && m.yFinTexto <= m.barraTop,
               `${quien}: el texto acaba en y=${m.yFinTexto} y la franja de marca empieza en ${m.barraTop} — el precio se pinta encima del "TiendaMax".`);
            ok(m.altoFoto >= Math.round(m.alto * 0.35),
               `${quien}: la foto se queda en ${m.altoFoto}px de alto (menos del 35% de ${m.alto}) — el texto se la comió.`);
            // El nombre puede acortarse, pero no puede perder un número: es lo
            // que distingue un switch de 8 puertos de uno de 5.
            const numsOrig = (m.limpio.match(/\d+/g) || []);
            const numsCorte = (m.texto.match(/\d+/g) || []);
            const perdidos = numsOrig.filter(n => !numsCorte.includes(n));
            ok(perdidos.length === 0,
               `${quien}: el título se queda en "${m.texto}" y pierde ${JSON.stringify(perdidos)} — es justo lo que distingue este producto de su hermano.`);
        }
    }

    // Revólico no lleva texto encima: es la decisión de diseño de ese anuncio
    // (Revólico ya pide título, precio y descripción en sus propios campos).
    const sinTexto = await pagina.evaluate(async (p) => {
        const cv = document.createElement('canvas');
        await window.tmAnuncioImagen(cv, p, { formato: 'cuadrado' });
        return { ancho: cv.width, alto: cv.height, datos: cv.dataset.tmAnuncio || '' };
    }, PRODUCTOS[0]);
    ok(sinTexto.ancho === 1080 && sinTexto.alto === 1080,
       `el anuncio de Revólico dejó de ser 1080×1080 (${sinTexto.ancho}×${sinTexto.alto}).`);
    ok(sinTexto.datos === '',
       'el anuncio sin texto está reservando bloque de texto: Revólico lo lleva a propósito solo con foto y marca.');

    // La versión 0 tiene que ser EXACTAMENTE el anuncio de siempre: la usan
    // Revólico, el lote por categoría y el Estado. Pasarle variante:0 o no
    // pasarle nada da los mismos píxeles.
    const iguales = await pagina.evaluate(async (p) => {
        const a = document.createElement('canvas'), b = document.createElement('canvas');
        await window.tmAnuncioImagen(a, p, { formato: 'cuadrado', texto: true });
        await window.tmAnuncioImagen(b, p, { formato: 'cuadrado', texto: true, variante: 0 });
        const c = document.createElement('canvas'), d = document.createElement('canvas');
        await window.tmAnuncioImagen(c, p, { formato: 'cuadrado', texto: true });
        await window.tmAnuncioImagen(d, p, { formato: 'cuadrado', texto: true, variante: 2 });
        return { cero: a.toDataURL() === b.toDataURL(), distinta: c.toDataURL() !== d.toDataURL() };
    }, PRODUCTOS[0]);
    ok(iguales.cero, 'variante:0 dibuja algo distinto del anuncio de siempre.');
    ok(iguales.distinta, 'la versión 2 sale idéntica a la de siempre: en cinco grupos se vería el mismo anuncio.');
}

ok(erroresJs.length === 0, 'errores de JS al dibujar: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s) en la imagen de anuncio:\n' + fallos.map(f => '  · ' + f).join('\n'));
    process.exit(1);
}
console.log('✅ imagen de anuncio: ' + (PRODUCTOS.length * 9) + ' comprobaciones de reparto, corte de título y alto de foto.');
