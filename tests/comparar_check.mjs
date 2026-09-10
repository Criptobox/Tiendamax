/* La pantalla 🔀 Comparar con la principal — en un navegador de verdad.
 *
 * El script (scripts/comparar_principal.py) solo baja el catálogo. QUIÉN
 * aparece en cada lista, con qué botón y con qué número lo decide el
 * navegador, cruzando ese fichero con PRODUCTOS. Eso no se puede comprobar
 * leyendo admin.html, y los tres fallos que importa cazar no dan error:
 *
 *  - Una comisión de 1500 MN comparada con una de $1,80 sale como una
 *    diferencia enorme que no existe: son casi el mismo dinero. Con la regla
 *    rota, la pantalla enseña 7 diferencias donde hay 1, y cada una lleva un
 *    botón que estropea una comisión que estaba bien.
 *  - Los botones tienen que tocar el catálogo DE VERDAD (PRODUCTOS +
 *    localStorage) y por el mismo camino que el resto del panel. Si solo
 *    repintan, el gestor cree que lo arregló y no se subió nada.
 *  - Ofrecer subir un producto que la principal tiene agotado es publicar
 *    una ficha que no puede vender y que además hay que mantener.
 *
 * Firebase y la red externa se interceptan. Se corre solo
 * (`node tests/comparar_check.mjs`) y desde unittest (test_comparar_principal.py).
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

/* Catálogo de la principal de mentira, con un caso de cada cosa. Se sirve en
 * lugar del real para que el test diga siempre lo mismo: el de verdad cambia
 * cada tres horas y un test que depende de él falla solo. */
const PRINCIPAL = {
    actualizado: new Date().toISOString(),
    total: 6,
    productos: [
        // Misma comisión, distinta MONEDA de escritura: 1500 MN ≈ $2,18. NO
        // es una diferencia y no puede salir con botón.
        { id: '101', nombre: 'Linterna', precio: 30, stock: 4, categoria: 'Utiles',
          comision: 1.8, comisionMoneda: 'USD' },
        // Diferencia de verdad: misma moneda, otro número.
        { id: '102', nombre: 'Timbre', precio: 25, stock: 3, categoria: 'Hogar',
          comision: 1000, comisionMoneda: 'MN' },
        // Precio distinto.
        { id: '103', nombre: 'Batería', precio: 270, stock: 2, categoria: 'Energia',
          comision: 10, comisionMoneda: 'USD' },
        // Repuesto: ella tiene, yo estoy en cero.
        { id: '104', nombre: 'Router', precio: 50, stock: 7, categoria: 'Wifi',
          comision: 5, comisionMoneda: 'USD' },
        // Falta y ella lo puede servir.
        { id: '105', nombre: 'Cámara nueva', precio: 45, stock: 6, categoria: 'Seguridad',
          comision: 10, comisionMoneda: 'USD' },
        // Falta pero ella también lo tiene agotado: no se ofrece subir.
        { id: '106', nombre: 'Agotado en las dos', precio: 20, stock: 0, categoria: 'Hogar',
          comision: 5, comisionMoneda: 'USD' },
        // Mío sin moneda declarada (14 productos están así). Se deduce MN por
        // el tamaño, así que SÍ es comparable con los 1000 MN de la principal.
        { id: '107', nombre: 'Sin moneda', precio: 20, stock: 2, categoria: 'Hogar',
          comision: 1000, comisionMoneda: 'MN' },
    ],
};
const MIOS = [
    { id: 101, nombre: 'Linterna', precioActual: 30, stock: 4, comision: 1500, comisionMoneda: 'MN' },
    { id: 102, nombre: 'Timbre', precioActual: 25, stock: 3, comision: 1500, comisionMoneda: 'MN' },
    { id: 103, nombre: 'Batería', precioActual: 300, stock: 2, comision: 10, comisionMoneda: 'USD' },
    { id: 104, nombre: 'Router', precioActual: 50, stock: 0, comision: 5, comisionMoneda: 'USD' },
    { id: 107, nombre: 'Sin moneda', precioActual: 20, stock: 2, comision: 1500 },
    // Lo vendo yo y la principal ni lo tiene: no sale en ninguna lista.
    { id: 900, nombre: 'Solo mío', precioActual: 10, stock: 3, comision: 2, comisionMoneda: 'USD' },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
const erroresJs = [];
await ctx.route('**/*.firebaseio.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
await ctx.route(u => u.pathname.endsWith('/principal-catalogo.json'),
    r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRINCIPAL) }));
await ctx.route(u => u.pathname.endsWith('/principal-fichas.json'),
    r => r.fulfill({ status: 200, contentType: 'application/json',
                     body: JSON.stringify({ fichas: { '105': { descripcion: 'Descripción de prueba', garantia: '3 meses' } } }) }));

const pagina = await ctx.newPage();
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(prods => {
    localStorage.setItem('productos', JSON.stringify(prods));
}, MIOS);
await pagina.goto(`http://localhost:${PUERTO}/admin.html`);
await pagina.waitForTimeout(2400);
await pagina.evaluate(() => {
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
});
// El panel puede haber recargado el catálogo real desde la red; se fuerza el
// de prueba antes de comparar.
await pagina.evaluate(prods => { PRODUCTOS = prods; go('comparar'); }, MIOS);
await pagina.waitForTimeout(1200);
await pagina.evaluate(() => ['fal', 'pre', 'com', 'dud'].forEach(k => cmpPlegar(k)));
await pagina.waitForTimeout(400);

const bloque = async nombre => pagina.evaluate(t => {
    const b = [...document.querySelectorAll('.cmp-bloque')].find(e => e.querySelector('.cmp-tit').textContent.includes(t));
    if (!b) return null;
    return {
        n: Number(b.querySelector('.cmp-n').textContent),
        filas: [...b.querySelectorAll('.cmp-fila')].map(f => ({
            texto: f.querySelector('.cmp-txt').textContent,
            boton: (f.querySelector('.cmp-b') || {}).textContent || null,
            onclick: (f.querySelector('.cmp-b') || {}).getAttribute
                ? f.querySelector('.cmp-b').getAttribute('onclick') : null,
        })),
    };
}, nombre);

// ── 1) La misma comisión en distinta moneda NO es una diferencia ──────
const com = await bloque('Comisión distinta');
ok(com && com.n === 2, `«Comisión distinta» debería tener 2 filas (Timbre y Sin moneda), tiene ${com ? com.n : 'el bloque no existe'}`);
ok(com && !com.filas.some(f => f.texto.includes('Linterna')),
   'la Linterna (1500 MN vs $1,80 = casi el mismo dinero) NO puede salir como diferencia de comisión');
ok(com && com.filas.some(f => f.texto.includes('Timbre')),
   'el Timbre (1500 MN vs 1000 MN, misma moneda) sí es una diferencia real y falta');
ok(com && com.filas.some(f => f.texto.includes('Sin moneda')),
   'un producto propio sin comisionMoneda se deduce por tamaño (1500 → MN) y sí es comparable');

// ── 2) La que no se puede comparar sale aparte y SIN botón de aplicar ──
const dud = await bloque('no puedo comparar');
ok(dud && dud.filas.some(f => f.texto.includes('Linterna')),
   'la Linterna debería salir en «Comisiones que no puedo comparar»');
ok(dud && dud.filas.every(f => !/cmpPonerComision/.test(f.onclick || '')),
   'una comisión que no se puede comparar no puede llevar un botón que la copie');

// ── 3) Solo se ofrece subir lo que la principal puede servir ──────────
const fal = await bloque('Te faltan');
ok(fal && fal.n === 1, `«Te faltan» debería ofrecer solo la Cámara nueva, ofrece ${fal ? fal.n : '?'}`);
ok(fal && !fal.filas.some(f => f.texto.includes('Agotado en las dos')),
   'no se ofrece subir un producto que la principal también tiene agotado');

// ── 4) Repuestos y fantasmas ──────────────────────────────────────────
const rep = await bloque('repuso');
ok(rep && rep.filas.length === 1 && rep.filas[0].texto.includes('Router'),
   'el Router (ella 7, yo 0) debería estar en los repuestos');
ok(rep && /Poner 7/.test(rep.filas[0].boton || ''),
   `el botón debería poner las 7 unidades de la principal, dice «${rep ? rep.filas[0].boton : '?'}»`);
const solo = await pagina.evaluate(() => document.getElementById('cmp-cuerpo').textContent.includes('Solo mío'));
ok(!solo, 'un producto que solo tengo yo no es una diferencia con la principal');

// ── 5) Los botones tocan el catálogo de verdad ────────────────────────
const leer = id => pagina.evaluate(i => {
    const p = (JSON.parse(localStorage.getItem('productos') || '[]')).find(x => String(x.id) === i);
    return p ? { stock: p.stock, precio: p.precioActual, com: p.comision, mon: p.comisionMoneda } : null;
}, id);

await pagina.evaluate(() => cmpPonerStock('104', 7));
await pagina.waitForTimeout(250);
const router = await leer('104');
ok(router && router.stock === 7, `«Poner 7» dejó el stock en ${router && router.stock}, debía guardar 7 en localStorage`);

await pagina.evaluate(() => cmpPonerPrecio('103', 270));
await pagina.waitForTimeout(250);
const bat = await leer('103');
ok(bat && bat.precio === 270, `el precio quedó en ${bat && bat.precio}, debía ser 270`);

await pagina.evaluate(() => cmpPonerComision('102', 1000, 'MN'));
await pagina.waitForTimeout(250);
const timbre = await leer('102');
ok(timbre && timbre.com === 1000 && timbre.mon === 'MN',
   `la comisión quedó en ${JSON.stringify(timbre)}, debía ser 1000 MN`);

// El caso que hace falta el `p.comisionMoneda = moneda`: mi producto no
// declaraba moneda, se dedujo por tamaño para poder comparar, y al aplicar
// hay que DEJARLA ESCRITA. Si no, queda un 1000 sin moneda, que se deduce
// como USD la próxima vez — y $1000 de comisión sobre un producto de $20.
await pagina.evaluate(() => cmpPonerComision('107', 1000, 'MN'));
await pagina.waitForTimeout(250);
const sinMon = await leer('107');
ok(sinMon && sinMon.mon === 'MN',
   `al aplicar hay que dejar la moneda escrita; quedó ${JSON.stringify(sinMon)}. `
   + 'Un 1000 sin moneda se deduce mal en cuanto lo lea otra pantalla');

// ── 6) Arreglado desaparece de la lista, sin esperar al cron ──────────
await pagina.waitForTimeout(300);
const repDespues = await bloque('repuso');
ok(!repDespues || !repDespues.filas.some(f => f.texto.includes('Router')),
   'tras poner el stock, el Router debe salir de la lista en el momento');

// ── 7) Rellenar el formulario ─────────────────────────────────────────
await pagina.evaluate(() => cmpRellenar('105'));
await pagina.waitForTimeout(800);
const form = await pagina.evaluate(() => ({
    vista: (document.querySelector('.view.active') || {}).id,
    nombre: document.getElementById('productName').value,
    desc: document.getElementById('productDescription').value,
    precio: document.getElementById('productPriceActual').value,
    stock: document.getElementById('productStock').value,
    com: document.getElementById('productComision').value,
    mon: document.getElementById('productComisionMoneda').value,
    gar: document.getElementById('productGarantia').value,
}));
ok(form.vista === 'view-agregar', 'Rellenar debería abrir el formulario de Agregar');
ok(form.nombre === 'Cámara nueva' && form.precio === '45' && form.stock === '6',
   `el formulario no se rellenó bien: ${JSON.stringify(form)}`);
ok(form.desc === 'Descripción de prueba',
   'la descripción sale de principal-fichas.json y no llegó');
ok(form.com === '10' && form.mon === 'USD',
   `la comisión del formulario quedó en ${form.com} ${form.mon}, debía ser 10 USD`);
ok(form.gar === '3 meses', 'la garantía de la principal debería venir rellena');

// ── 8) Nada se publica solo ───────────────────────────────────────────
const guardados = await pagina.evaluate(() =>
    (JSON.parse(localStorage.getItem('productos') || '[]')).length);
ok(guardados === MIOS.length,
   `Rellenar no puede guardar nada: hay ${guardados} productos y había ${MIOS.length}`);

ok(erroresJs.length === 0, 'errores de JS: ' + erroresJs.join(' | '));

await navegador.close();
servidor.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ Comparar con la principal: 21 comprobaciones OK');
