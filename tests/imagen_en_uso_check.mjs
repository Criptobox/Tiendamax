/* Regresión de imagenEnUso() / _rutaImagenDesdeUrl() — js/src/tm-data.src.js
 *
 * Es la comprobación que decide si una foto se borra del repo. Cuando dice
 * "no la usa nadie" y se equivoca, el fichero desaparece y el producto que sí
 * la usaba se queda con la imagen rota — sin error, sin aviso, sin nada que
 * mirar hasta que alguien abre la tienda. Ya pasó con img_1783179797781.webp
 * (el inversor Tataliken 4000W).
 *
 * Se ejecuta contra el fichero real, no contra una copia: reimplementar la
 * lógica aquí la dejaría desincronizada a la primera modificación.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = readFileSync(join(RAIZ, 'js/src/tm-data.src.js'), 'utf8');

// tm-data.src.js es un script clásico enorme lleno de dependencias del DOM.
// Aquí solo interesan dos funciones, así que se extraen por nombre y se
// evalúan sueltas — así el test sigue leyendo el código de producción real.
function extraer(nombre) {
    const i = fuente.indexOf(`function ${nombre}(`);
    if (i === -1) throw new Error(`No se encontró function ${nombre}() en tm-data.src.js`);
    let prof = 0, dentro = false;
    for (let j = i; j < fuente.length; j++) {
        const c = fuente[j];
        if (c === '{') { prof++; dentro = true; }
        else if (c === '}') { prof--; if (dentro && prof === 0) return fuente.slice(i, j + 1); }
    }
    throw new Error(`Llaves desbalanceadas en ${nombre}()`);
}

const sandbox = {
    productos: [],
    localStorage: { getItem: () => null },
    tmParseArray: (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    console,
};
vm.createContext(sandbox);
vm.runInContext(extraer('_rutaImagenDesdeUrl') + '\n' + extraer('imagenEnUso'), sandbox);

const fallos = [];
function ok(cond, msg) { if (!cond) fallos.push(msg); }

const PAGES = 'https://tiendamax.org/imagenes/img_X.webp';
const RAW = 'https://raw.githubusercontent.com/Criptobox/Tiendamax/main/imagenes/img_X.webp';
const REL = 'imagenes/img_X.webp';
const OTRA = 'https://tiendamax.org/imagenes/img_OTRA.webp';

function conCatalogo(lista, fn) {
    sandbox.productos = lista;
    try { return fn(); } finally { sandbox.productos = []; }
}

// ── El caso que rompió el catálogo ──────────────────────────────────────
// Producto A escribe la URL de raw.githubusercontent, producto B la de
// tiendamax.org. Es el MISMO fichero: borrarlo por B rompe A.
conCatalogo([{ id: 'A', imagen: RAW }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === true,
        'FALLO: no detecta que otro producto usa el mismo fichero con la URL de raw.githubusercontent');
});
conCatalogo([{ id: 'A', imagen: PAGES }], () => {
    ok(sandbox.imagenEnUso(RAW, 'B') === true,
        'FALLO: no detecta el mismo fichero cuando el otro producto usa la URL de tiendamax.org');
});
conCatalogo([{ id: 'A', imagen: REL }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === true,
        'FALLO: no detecta el mismo fichero escrito como ruta relativa');
});

// Con querystring de cache-busting sigue siendo el mismo fichero.
conCatalogo([{ id: 'A', imagen: PAGES + '?v=abc123' }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === true,
        'FALLO: el ?v= de cache-busting despista a la comprobación');
});

// ── Lo que NO debe dar falso positivo ───────────────────────────────────
conCatalogo([{ id: 'A', imagen: OTRA }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === false,
        'FALLO: da por usada una imagen que nadie usa (nunca se borraría nada)');
});
conCatalogo([], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === false, 'FALLO: catálogo vacío debería dar false');
    ok(sandbox.imagenEnUso('', 'B') === false, 'FALLO: url vacía debería dar false');
    ok(sandbox.imagenEnUso(null, 'B') === false, 'FALLO: url null debería dar false');
});

// El producto que se está editando se ignora a propósito: si no, quitarle
// una foto nunca la borraría.
conCatalogo([{ id: 'A', imagen: PAGES }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'A') === false,
        'FALLO: no está ignorando al propio producto que se edita');
});

// ── Otros campos donde vive una foto ────────────────────────────────────
conCatalogo([{ id: 'A', imagenes: [OTRA, RAW] }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === true, 'FALLO: no mira el array imagenes[]');
});
conCatalogo([{ id: 'A', imagenSecundaria: RAW }], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === true, 'FALLO: no mira imagenSecundaria');
});

// ── Lo que no es del repo se compara literal ────────────────────────────
// _rutaImagenDesdeUrl() no las normaliza y borrarImagenDeGitHub() tampoco las
// tocaría, así que aquí la igualdad exacta es lo correcto.
const EXTERNA = 'https://otrodominio.com/foto.webp';
conCatalogo([{ id: 'A', imagen: EXTERNA }], () => {
    ok(sandbox.imagenEnUso(EXTERNA, 'B') === true, 'FALLO: imagen externa idéntica debería contar como en uso');
    ok(sandbox.imagenEnUso('https://otrodominio.com/distinta.webp', 'B') === false,
        'FALLO: imagen externa distinta no debería contar como en uso');
});

// ── Combos ──────────────────────────────────────────────────────────────
sandbox.localStorage = { getItem: (k) => k === 'combos' ? JSON.stringify([{ imagen: RAW }]) : null };
conCatalogo([], () => {
    ok(sandbox.imagenEnUso(PAGES, 'B') === true, 'FALLO: no detecta que un combo usa el mismo fichero');
});
sandbox.localStorage = { getItem: () => null };

if (fallos.length) {
    console.error(fallos.join('\n'));
    process.exit(1);
}
console.log('imagenEnUso: 15 comprobaciones OK');
