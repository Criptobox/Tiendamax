/* La fila de destacados mientras carga — js/src/tm-state.src.js
 *
 * Existe por un fallo que llegó a producción y nadie veía en las pruebas
 * porque solo dura el segundo y pico que tarda el catálogo en llegar:
 * renderizarMasVendidos() se llama varias veces durante el arranque, y al
 * llegar con `productos` todavía vacío borraba el esqueleto y encendía
 * "Pronto publicaremos nuestros destacados". O sea: la tienda le decía al
 * cliente que no tenía destacados —falso— y de paso la sección se quedaba en
 * 24px de alto, con los tres textos pegados, las flechas flotando en el vacío
 * y la sección de Categorías pareciendo que empezaba cortando esta.
 *
 * Nada falla ni avisa. Solo se ve mal, y solo al entrar.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

// ── Un DOM mínimo: solo lo que toca esta función ─────────────────────────
const noop = () => {};
function nodo(id) {
    return {
        id, innerHTML: '', style: { display: '' }, className: '',
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        children: [], appendChild(c) { this.children.push(c); },
        querySelector(sel) {
            // Lo que consultan _tmInyectarSkeletons y _tmRemoverSkeletons.
            if (/producto-card/.test(sel)) return this.innerHTML.includes('producto-card') ? {} : null;
            if (/tm-sk-card/.test(sel)) return this.innerHTML.includes('tm-sk-card') ? {} : null;
            return null;
        },
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
        addEventListener: noop, removeEventListener: noop, setAttribute: noop,
        getAttribute: () => null, remove: noop, scrollTo: noop, focus: noop,
    };
}

function montar(catalogo) {
    const nodos = {
        masVendidosGrid: nodo('masVendidosGrid'),
        masVendidosVacio: nodo('masVendidosVacio'),
        productosGrid: nodo('productosGrid'),
    };
    // El esqueleto que index.html ya trae escrito en el HTML.
    nodos.masVendidosGrid.innerHTML = '<div class="tm-sk-card"></div>'.repeat(3);
    nodos.masVendidosVacio.style.display = 'none';

    const sb = {
        window: { addEventListener: noop, setTimeout, clearTimeout,
                  matchMedia: () => ({ matches: false, addEventListener: noop }),
                  location: { origin: 'https://tiendamax.org' } },
        document: {
            getElementById: (id) => nodos[id] || null,
            querySelector: () => null, querySelectorAll: () => [],
            createElement: () => nodo('x'), addEventListener: noop,
            body: nodo('body'), head: nodo('head'),
            documentElement: nodo('html'),
        },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'node' },
        console, setTimeout, clearTimeout, requestAnimationFrame: noop,
        setInterval: () => 0, clearInterval: noop,
        fetch: () => Promise.reject(new Error('sin red en el test')),
        productos: catalogo,
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    // De tm-init solo se toman las dos funciones del esqueleto: el fichero
    // entero llama a inicializarTienda() al cargarse y arrastraría media
    // tienda a este test.
    const init = readFileSync(join(RAIZ, 'js/src/tm-init.src.js'), 'utf8');
    const desde = init.indexOf('function _tmInyectarSkeletons');
    const hasta = init.indexOf('function inicializarTienda');
    if (desde < 0 || hasta < 0 || hasta < desde) {
        throw new Error('tm-init.src.js cambió de forma: el test ya no sabe de dónde sacar las funciones del esqueleto');
    }
    vm.runInContext(init.slice(desde, hasta), sb);
    vm.runInContext(readFileSync(join(RAIZ, 'js/src/tm-state.src.js'), 'utf8'), sb);
    return { sb, nodos };
}

// ── Catálogo aún sin llegar ──────────────────────────────────────────────
{
    const { sb, nodos } = montar([]);
    vm.runInContext('renderizarMasVendidos()', sb);
    ok(nodos.masVendidosVacio.style.display === 'none',
        'con el catálogo sin cargar NO puede decir "Pronto publicaremos nuestros destacados": es mentira y solo se ve al entrar');
    ok(/tm-sk-card/.test(nodos.masVendidosGrid.innerHTML),
        'con el catálogo sin cargar el esqueleto se queda: sin él la sección se derrumba a los tres textos pegados');
}

// ── Catálogo cargado y con destacados ────────────────────────────────────
{
    const catalogo = [
        { id: 1, nombre: 'Router A', masVendido: true, stock: 5, precio: 80, precioActual: 80 },
        { id: 2, nombre: 'Cámara B', masVendido: true, stock: 3, precio: 45, precioActual: 45 },
    ];
    const { sb, nodos } = montar(catalogo);
    sb.window._tmCrearCard = (p) => Object.assign(nodo('card-' + p.id), {
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    });
    vm.runInContext('renderizarMasVendidos()', sb);
    ok(nodos.masVendidosVacio.style.display === 'none',
        'con destacados de verdad no se enseña el aviso de vacío');
    ok(nodos.masVendidosGrid.children.length === catalogo.length,
        `debería pintar ${catalogo.length} tarjetas, pintó ${nodos.masVendidosGrid.children.length}`);
}

// ── Catálogo cargado pero sin nada que enseñar ───────────────────────────
// Este SÍ es el caso del aviso: el catálogo llegó y no hay ni un producto con
// stock. Si se pierde, la sección se queda muda y el cliente no sabe por qué.
{
    const { sb, nodos } = montar([
        { id: 1, nombre: 'Agotado', masVendido: true, stock: 0, precio: 10, precioActual: 10 },
    ]);
    vm.runInContext('renderizarMasVendidos()', sb);
    ok(nodos.masVendidosVacio.style.display === 'block',
        'con el catálogo cargado y sin nada disponible, el aviso de vacío sí debe salir');
}

// ── El esqueleto tiene que ser del tamaño de la tarjeta ──────────────────
// Si no ocupa lo mismo, la página pega un tirón justo cuando llega el
// catálogo. El ancho lo da la misma regla que la tarjeta real; el alto es un
// número medido, así que se comprueba que siga escrito junto a ella.
{
    const css = readFileSync(join(RAIZ, 'css/oficial-plus.css'), 'utf8');
    // Dos veces cada una: escritorio y el bloque de móvil, donde la tarjeta
    // mide otra cosa. Con una sola, quitar la de escritorio pasaba inadvertido.
    const altos = css.match(/#masVendidosGrid > \.tm-sk-card\{[^}]*min-height:\d+px/g) || [];
    ok(altos.length >= 2,
        `el esqueleto necesita su alto medido en escritorio Y en móvil (hay ${altos.length}), o la fila salta al cargar`);
    const anchos = css.match(/#masVendidosGrid > \.producto-card,\s*\n\s*html body #mas-vendidos #masVendidosGrid > \.tm-sk-card\{/g) || [];
    ok(anchos.length >= 2,
        `el esqueleto debe compartir la regla de ancho de la tarjeta real en los dos tamaños (hay ${anchos.length}), no tener la suya`);
}

// ── index.html trae el esqueleto escrito ─────────────────────────────────
// Inyectarlo por JS no basta: hasta que corre el bundle la sección ya se
// pintó derrumbada, que es justo el parpadeo que se veía.
{
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    const grid = html.match(/id="masVendidosGrid"[^>]*>([\s\S]*?)<\/div>\s*<button/);
    ok(grid && /tm-sk-card/.test(grid[1]),
        'index.html debe traer el esqueleto de destacados escrito, como ya lo trae el de categorías');
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ destacados: todas las comprobaciones pasan');
