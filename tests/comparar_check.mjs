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
        // Precio distinto, sin más. Los dos con stock: se puede vender hoy.
        { id: '103', nombre: 'Batería', precio: 270, precioMoneda: 'USD', stock: 2,
          categoria: 'Energia', comision: 10, comisionMoneda: 'USD' },
        // Precio distinto pero agotado EN LAS DOS: es verdad y no es trabajo
        // de hoy. Con el catálogo real esto era 5 de cada 6 filas.
        { id: '115', nombre: 'Dormido', precio: 90, precioMoneda: 'USD', stock: 0,
          categoria: 'Hogar', comision: 5, comisionMoneda: 'USD' },
        // La principal se contradice consigo misma: su página dice 55 y su
        // ficha interna 60. Va aparte para que ninguna otra comprobación lo
        // toque antes.
        { id: '110', nombre: 'Con dos precios', precio: 55, precioMoneda: 'USD', precioOtro: 60,
          stock: 3, categoria: 'Hogar', comision: 5, comisionMoneda: 'USD' },
        // «280 cup» no son 280 dólares. Con pareja, no se compara contra un
        // precio en USD; sin pareja, no se pinta con un $ delante. Hacen
        // falta los dos: la fila de «te falta» no pasa por la comparación.
        { id: '109', nombre: 'Cable en CUP', precio: 280, precioMoneda: 'MN', stock: 9,
          categoria: 'Wifi', comision: 5, comisionMoneda: 'USD' },
        { id: '111', nombre: 'Rollo CUP sin pareja', precio: 280, precioMoneda: 'MN',
          stock: 4, categoria: 'Wifi', comision: 5, comisionMoneda: 'USD' },
        // Repuesto: ella tiene, yo estoy en cero.
        { id: '104', nombre: 'Router', precio: 50, stock: 7, categoria: 'Wifi',
          comision: 5, comisionMoneda: 'USD' },
        // Falta y ella lo puede servir.
        { id: '105', nombre: 'Cámara nueva', precio: 45, stock: 6, categoria: 'Seguridad',
          comision: 10, comisionMoneda: 'USD' },
        // Falta pero ella también lo tiene agotado: no se ofrece subir.
        { id: '106', nombre: 'Agotado en las dos', precio: 20, stock: 0, categoria: 'Hogar',
          comision: 5, comisionMoneda: 'USD' },
        // La principal tiene el MISMO producto dos veces, con dos ids y dos
        // precios. Uno coincide con un producto propio por id; el otro se
        // quedaba en «te faltan» para siempre y el gestor juraba, con razón,
        // que sí lo tenía. Caso real: «Sistema de Alarma».
        { id: '112', nombre: 'Alarma', precio: 170, stock: 0, categoria: 'Seguridad',
          comision: 5, comisionMoneda: 'USD' },
        { id: '113', nombre: 'ALARMA', precio: 180, stock: 2, categoria: 'Seguridad',
          comision: 5, comisionMoneda: 'USD' },
        // Parecidísimo a «Alarma» pero NO es el mismo nombre. No puede contar
        // como duplicado: si el criterio fuera el parecido, volvemos a
        // emparejar solo, que es justo lo que no se puede hacer aquí
        // (hAP ac3 y hap ax3 son dos routers distintos).
        { id: '114', nombre: 'Alarma Pro', precio: 200, stock: 3, categoria: 'Seguridad',
          comision: 5, comisionMoneda: 'USD' },
        // Segundo faltante: uno se empareja y el otro se oculta, que son los
        // dos caminos y hay que poder probarlos por separado.
        { id: '108', nombre: 'Otra que falta', precio: 15, stock: 5, categoria: 'Hogar',
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
    // El mío en dólares; el de la principal, en CUP. No son comparables.
    { id: 109, nombre: 'Cable en CUP', precioActual: 4, stock: 9, comision: 5, comisionMoneda: 'USD' },
    { id: 110, nombre: 'Con dos precios', precioActual: 50, stock: 3, comision: 5, comisionMoneda: 'USD' },
    // Lo vendo yo y la principal ni lo tiene: no sale en ninguna lista.
    // Mismo id que la primera ficha «Alarma» de la principal: empareja sola.
    { id: 112, nombre: 'KIT de alarma con panel', precioActual: 170, stock: 0, comision: 5, comisionMoneda: 'USD' },
    { id: 115, nombre: 'Dormido', precioActual: 100, stock: 0, comision: 5, comisionMoneda: 'USD' },
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
await ctx.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com', r => r.abort());
await ctx.route(u => u.pathname.endsWith('/principal-catalogo.json'),
    r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRINCIPAL) }));
/* El "repositorio": lo que devuelve comparar-marcas.json y lo que se le sube.
   Sin esto el test escribiría de verdad contra api.github.com. */
let REPO = null;
const SUBIDAS = [];
await ctx.route(u => u.pathname.endsWith('/comparar-marcas.json'),
    r => REPO ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REPO) })
              : r.fulfill({ status: 404, body: '' }));
await ctx.route(u => u.hostname === 'api.github.com', r => {
    const req = r.request();
    if (req.method() === 'PUT') {
        const cuerpo = JSON.parse(req.postData() || '{}');
        const texto = Buffer.from(cuerpo.content, 'base64').toString('utf8');
        SUBIDAS.push({ ruta: req.url().split('/contents/')[1], datos: JSON.parse(texto) });
        REPO = JSON.parse(texto);
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"x"}}' });
    }
    if (req.url().includes('/contents/'))
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{"sha":"sha1"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"default_branch":"main"}' });
});
await ctx.route(u => u.pathname.endsWith('/principal-fichas.json'),
    r => r.fulfill({ status: 200, contentType: 'application/json',
                     body: JSON.stringify({ fichas: { '105': { descripcion: 'Descripción de prueba', garantia: '3 meses' } } }) }));

const pagina = await ctx.newPage();
pagina.on('pageerror', e => erroresJs.push(String(e).slice(0, 200)));
await pagina.addInitScript(prods => {
    localStorage.setItem('productos', JSON.stringify(prods));
    localStorage.setItem('githubUser', 'quien');
    localStorage.setItem('githubRepo', 'repo');
    localStorage.setItem('githubToken', 'ghp_de_mentira');
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
ok(fal && fal.n === 5,
   `«Te faltan» debería ofrecer la Cámara nueva, Otra que falta, el Rollo en CUP, la ficha `
   + `duplicada de la Alarma y la Alarma Pro, ofrece ${fal ? fal.n : '?'}`);
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

// ── 7) Emparejar a mano: la lista no se puede arreglar sola ──────────
// La principal escribe «mikrotik sxt sq 5ax» y aquí es «MikroTik SXTsq 5 AX»
// —el mismo aparato— mientras que «hAP ac3» y «hap ax3» son dos routers. La
// pareja que más puntúa de todo el catálogo real resulta ser una equivocada
// (0,89) y una correcta saca 0,41: no hay umbral que las separe, así que
// emparejar es cosa de la persona y la pantalla solo ordena candidatos.
await pagina.evaluate(() => { go('comparar'); if (!document.querySelector('.cmp-pick')) cmpAbrirPicker('105'); });
await pagina.waitForTimeout(400);
const pick = await pagina.evaluate(() => {
    const c = document.querySelector('.cmp-pick');
    return c ? { ojo: (c.querySelector('.cmp-pick-ojo') || {}).textContent || '',
                 ops: [...c.querySelectorAll('.cmp-pick-op')].length } : null;
});
ok(pick && pick.ops > 0, 'el selector no ofreció ningún producto propio');
ok(pick && /m2|m5|ac3|ax3/.test(pick.ojo),
   'el selector debe avisar de que el modelo entero importa: es su única defensa contra emparejar m2 con m5');

const faltanAntes = (await bloque('Te faltan')).n;
await pagina.evaluate(() => cmpEnlazar('105', '104'));
await pagina.waitForTimeout(400);
const faltanDespues = await bloque('Te faltan');
ok(!faltanDespues || faltanDespues.n === faltanAntes - 1,
   'al emparejarlo debe salir de «Te faltan»');
ok(await pagina.evaluate(() => {
       const m = JSON.parse(localStorage.getItem('tm_cmp_marcas') || '{}')['105'];
       return !!(m && m.mio === '104');
   }), 'el emparejamiento se guarda en el momento: si solo viviera en memoria, cerrar la pestaña antes de que suba al repositorio lo perdería');

// Lo que hace que emparejar valga la pena: el producto pasa a compararse.
// La Cámara nueva (ella 6) enlazada con el Router (yo 0 tras el test 5… no:
// se le puso 7) — se comprueba que aparece en ALGUNA comparación con su
// nombre propio, no en la lista de los que faltan.
const dondeSale = await pagina.evaluate(() => [...document.querySelectorAll('.cmp-bloque')]
    .filter(e => e.textContent.includes('Router'))
    .map(e => e.querySelector('.cmp-tit').textContent.trim()));
ok(!dondeSale.some(t => t.includes('Te faltan')),
   'un producto emparejado no puede seguir contando como que falta');

// La fila enseña MI nombre (es el que cambia el botón) y, debajo, el de la
// principal cuando no coinciden: sin eso no hay forma de ver si el
// emparejamiento que hiciste es el correcto.
const alias = await pagina.evaluate(() => {
    const a = document.querySelector('.cmp-alias');
    return a ? a.textContent : null;
});
ok(alias && alias.includes('Cámara nueva'),
   'una fila emparejada debe enseñar también el nombre que tiene en la principal');

// Ocultar uno que SÍ está en la lista: esconder el que ya estaba fuera no
// prueba nada, y fue justo el agujero que dejó pasar la primera versión.
await pagina.evaluate(() => cmpOcultar('108'));
await pagina.waitForTimeout(350);
const trasOcultar = await bloque('Te faltan');
ok(!trasOcultar || trasOcultar.n === faltanAntes - 2,
   `«no me interesa» debe quitarlo de la lista: quedan ${trasOcultar ? trasOcultar.n : 0} de ${faltanAntes - 1}`);

const pie = await pagina.evaluate(() => {
    const c = document.querySelector('.cmp-marcas-cab');
    return c ? c.textContent : null;
});
ok(pie && /2 marcados/.test(pie), `el pie debería contar los 2 marcados a mano, dice «${pie}»`);
await pagina.evaluate(() => { cmpVerMarcas(); });
await pagina.waitForTimeout(300);
const deshacer = await pagina.evaluate(() => [...document.querySelectorAll('.cmp-marca button')].length);
ok(deshacer === 2, `cada marca necesita su «deshacer»; hay ${deshacer}`);
await pagina.evaluate(() => { cmpDesmarcar('105'); cmpDesmarcar('108'); });
await pagina.waitForTimeout(300);
const vuelto = await bloque('Te faltan');
ok(vuelto && vuelto.n === faltanAntes,
   `al deshacer deben volver los ${faltanAntes} de antes, hay ${vuelto ? vuelto.n : '?'}`);

// ── 8) Duplicados de la propia principal, y muchos-a-uno ─────────────
// La principal reintroduce productos: la misma alarma está con dos ids. Uno
// coincide con un producto propio, el otro se quedaba en «te faltan» para
// siempre. No es emparejar por parecido: son dos fichas de la MISMA tienda
// con el nombre idéntico una vez normalizado.
const avisoGemela = await pagina.evaluate(() => {
    const g = document.querySelector('.cmp-gemela');
    return g ? { texto: g.textContent.replace(/\s+/g, ' ').trim(),
                 boton: !!g.querySelector('button') } : null;
});
ok(avisoGemela, 'la ficha duplicada debe avisar de que la principal la tiene dos veces');
ok(avisoGemela && /KIT de alarma con panel/.test(avisoGemela.texto),
   `el aviso tiene que nombrar el producto propio que ya es esa otra ficha; dice «${avisoGemela && avisoGemela.texto}»`);
ok(avisoGemela && avisoGemela.boton, 'el aviso necesita el botón para emparejarlo de un toque');
const cuantosAvisos = await pagina.evaluate(() => document.querySelectorAll('.cmp-gemela').length);
ok(cuantosAvisos === 1,
   `solo «ALARMA» es un duplicado de «Alarma»; «Alarma Pro» se le parece mucho y NO lo es. `
   + `Hay ${cuantosAvisos} avisos: si son 2, el criterio dejó de ser el nombre idéntico`);

const faltanConGemela = (await bloque('Te faltan')).n;
// Sin `?.` esto revienta el proceso cuando el aviso no existe y el fallo se
// queda sin explicar: un test que muere no dice qué se rompió.
const pulsado = await pagina.evaluate(() => {
    const b = document.querySelector('.cmp-gemela button');
    if (!b) return false;
    b.click();
    return true;
});
if (pulsado) {
    await pagina.waitForTimeout(400);
    const trasGemela = await bloque('Te faltan');
    ok(!trasGemela || trasGemela.n === faltanConGemela - 1,
       'al decir «es el mismo» la ficha duplicada sale de la lista');
    ok(await pagina.evaluate(() => {
           const m = JSON.parse(localStorage.getItem('tm_cmp_marcas') || '{}');
           return String((m['113'] || {}).mio) === '112';
       }), 'el emparejamiento del duplicado se guarda como cualquier otro');
} else {
    ok(false, 'sin aviso de duplicado no hay botón que pulsar');
    ok(false, '(y por tanto tampoco se puede comprobar que se guarde)');
}

// Un producto propio tiene que poder valer para DOS fichas de la principal:
// si no, quien tiene UNA soldadora no puede tapar las dos que la principal
// tiene de ella, y esa fila no se quita nunca.
await pagina.evaluate(() => cmpAbrirPicker('105'));
await pagina.waitForTimeout(300);
await pagina.evaluate(() => cmpPickerBuscar('KIT de alarma'));
await pagina.waitForTimeout(400);
const conYa = await pagina.evaluate(() => [...document.querySelectorAll('.cmp-pick-op')]
    .map(e => e.textContent.replace(/\s+/g, ' ').trim()));
ok(conYa.some(t => /KIT de alarma con panel/.test(t)),
   'un producto ya emparejado con otra ficha se sigue ofreciendo: la principal duplica productos');
ok(conYa.some(t => /ya emparejado/.test(t)),
   'pero tiene que decir con qué está emparejado ya, o se empareja a ciegas');
await pagina.evaluate(() => cmpCerrarPicker());
await pagina.waitForTimeout(300);
await pagina.evaluate(() => cmpDesmarcar('113'));
await pagina.waitForTimeout(300);

// ── 8) El precio, con su moneda y con la contradicción a la vista ────
await pagina.evaluate(() => { CMP_ABIERTO_TODO = 1; ['pre', 'dud'].forEach(k => { if (!document.querySelector('.cmp-bloque')) return; }); });
await pagina.evaluate(() => { ['pre', 'dud'].forEach(k => {
    const c = document.querySelector(`.cmp-cab[onclick*="'${k}'"]`);
    if (c && c.getAttribute('aria-expanded') !== 'true') cmpPlegar(k); }); });
await pagina.waitForTimeout(400);
const pre = await bloque('Precio distinto');
const dosPrecios = pre && pre.filas.find(f => f.texto.includes('Con dos precios'));
ok(dosPrecios && /55/.test(dosPrecios.boton || ''),
   `el botón debe poner el precio que enseña su página (55), dice «${dosPrecios && dosPrecios.boton}»`);
ok(dosPrecios && /60/.test(dosPrecios.texto),
   'cuando la principal se contradice, la otra cifra se enseña en vez de esconderse: '
   + 'es lo único que deja comprobarlo de un vistazo');

// El de CUP no se compara contra uno en USD ni se pinta con un $.
const dudPrecio = await bloque('no puedo comparar');
ok(dudPrecio && dudPrecio.filas.some(f => /Cable en CUP/.test(f.texto) && /MN/.test(f.texto)),
   'un precio en MN frente a uno en USD no es una diferencia: 280 CUP son unos $4');
// Y en «te faltan», que no pasa por la comparación y pinta el precio a pelo.
const filaCup = await pagina.evaluate(() => {
    const f = [...document.querySelectorAll('.cmp-fila')].find(x => x.textContent.includes('Rollo CUP sin pareja'));
    return f ? f.textContent.replace(/\s+/g, ' ') : '';
});
ok(filaCup && !/\$\s?280/.test(filaCup),
   `«280 cup» no se puede pintar como $280; la fila dice «${filaCup.slice(0, 90)}»`);
ok(/280\s*MN/.test(filaCup),
   `la fila debe decir la moneda; dice «${filaCup.slice(0, 90)}»`);

// ── 8) Lo marcado a mano se guarda en el repositorio ─────────────────
// Marcar cuesta trabajo: si vive solo en este navegador, cambiar de teléfono
// lo tira. Y como puede marcarse desde dos aparatos, guardar el fichero
// entero pisaría lo del otro sin avisar — por eso se fusiona marca a marca.
await pagina.evaluate(() => { cmpEnlazar('105', '104'); cmpOcultar('108'); });
await pagina.waitForTimeout(600);
const estadoPre = await pagina.evaluate(() => (document.getElementById('cmp-estado') || {}).textContent || '');
ok(/sin guardar/.test(estadoPre),
   `mientras no ha subido, el pie debe decirlo; dice «${estadoPre}»`);
ok(SUBIDAS.length === 0, 'dos toques seguidos no pueden ser dos commits: hay un respiro antes de subir');

await pagina.waitForTimeout(4600);
ok(SUBIDAS.length === 1, `tras el respiro debe haber UNA subida, hay ${SUBIDAS.length}`);
ok(SUBIDAS[0] && SUBIDAS[0].ruta === 'comparar-marcas.json',
   `se sube a comparar-marcas.json, no a ${SUBIDAS[0] && SUBIDAS[0].ruta}`);
const subido = (SUBIDAS[0] && SUBIDAS[0].datos && SUBIDAS[0].datos.marcas) || {};
ok(subido['105'] && subido['105'].mio === '104', 'el emparejamiento no llegó al fichero');
ok(subido['108'] && subido['108'].oculto, 'el oculto no llegó al fichero');
ok(Object.values(subido).every(m => m.ts), 'cada marca necesita su fecha: es lo que decide quién gana al fusionar');
const estadoPost = await pagina.evaluate(() => (document.getElementById('cmp-estado') || {}).textContent || '');
ok(/guardado/.test(estadoPost), `tras subir, el pie debe confirmarlo; dice «${estadoPost}»`);

// Otro aparato marcó algo más mientras tanto: fusionar, no pisar.
REPO = { actualizado: new Date().toISOString(), marcas: Object.assign({}, subido,
    { '106': { oculto: true, ts: Date.now() } }) };
await pagina.evaluate(() => cmpDesmarcar('108'));
await pagina.waitForTimeout(4800);
const ultimo = SUBIDAS[SUBIDAS.length - 1].datos.marcas;
ok(ultimo['106'] && ultimo['106'].oculto,
   'lo que marcó el otro aparato entre medias no puede desaparecer al subir lo de este');
ok(ultimo['108'] && ultimo['108'].borrado,
   'deshacer se guarda como lápida: si la marca se borrara sin más, el otro aparato la volvería a subir');
ok(ultimo['105'] && ultimo['105'].mio === '104', 'el emparejamiento de antes sigue');

await pagina.evaluate(() => { cmpDesmarcar('105'); cmpDesmarcar('106'); });
await pagina.waitForTimeout(400);

// ── 9) Lo agotado no estorba, pero tampoco se borra ─────────────────
// Una diferencia de precio en algo que está en cero es verdad y no es
// trabajo de hoy: no se puede vender. En el catálogo real eran 5 de 6 filas,
// y mezcladas convertían la pantalla en ruido que escondía la única útil.
await pagina.evaluate(() => {
    const c = document.querySelector(`.cmp-cab[onclick*="'pre'"]`);
    if (c && c.getAttribute('aria-expanded') !== 'true') cmpPlegar('pre');
});
await pagina.waitForTimeout(400);
const preDorm = await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.cmp-bloque')]
        .find(e => e.querySelector('.cmp-tit').textContent.includes('Precio distinto'));
    if (!b) return null;
    return {
        badge: Number(b.querySelector('.cmp-n').textContent),
        visibles: [...b.querySelectorAll('.cmp-filas > .cmp-fila')].map(f => f.textContent),
        linea: (b.querySelector('.cmp-dorm > button') || {}).textContent || '',
    };
});
ok(preDorm, 'el bloque de precio debería existir');
ok(preDorm && preDorm.badge === 1,
   `el número grande cuenta lo que se puede hacer HOY (1, la Batería), dice ${preDorm && preDorm.badge}`);
ok(preDorm && !preDorm.visibles.some(t => /Dormido/.test(t)),
   'un producto agotado en las dos tiendas no puede estar entre las filas de trabajo');
ok(preDorm && /1 más, agotado/.test(preDorm.linea),
   `tiene que decir cuántas aparta y por qué; dice «${preDorm && preDorm.linea}»`);

// Apartar no es borrar: cuando vuelva el stock el precio tiene que estar bien.
await pagina.evaluate(() => cmpVerDormidas('pre'));
await pagina.waitForTimeout(400);
const abierto = await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.cmp-bloque')]
        .find(e => e.querySelector('.cmp-tit').textContent.includes('Precio distinto'));
    const f = [...b.querySelectorAll('.cmp-fila')].find(x => x.textContent.includes('Dormido'));
    return f ? { hay: true, marcada: f.classList.contains('cmp-fila-dorm'),
                 tag: !!f.querySelector('.cmp-tag-dorm'),
                 boton: !!f.querySelector('.cmp-b') } : { hay: false };
});
ok(abierto.hay, 'la fila apartada tiene que poder abrirse: no se ha borrado');
ok(abierto.marcada && abierto.tag,
   'y verse como lo que es, agotada, o al abrirla vuelve a confundir');
ok(abierto.boton, 'sigue teniendo su botón: el precio hay que poder arreglarlo igual');

// ── 9) Rellenar el formulario ─────────────────────────────────────────
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

// ── 10) Nada se publica solo ──────────────────────────────────────────
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
console.log('✅ Comparar con la principal: 61 comprobaciones OK');
