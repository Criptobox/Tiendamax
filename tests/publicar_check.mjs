/* El tab 📣 Publicar del admin — admin.html + js/src/tm-publicar.src.js
 *
 * Existe por un fallo que estuvo meses en producción sin dar la cara: había
 * DOS historiales de publicación que no se hablaban. El tab Compartir —el que
 * se usa— escribía en 'tmPubHist'; el Historial, el aviso de "21 días sin
 * publicar" y la columna "hace X d" leían 'tm_publog_v1', donde Compartir no
 * escribía nunca. Resultado: el Historial vacío para siempre y el aviso
 * diciendo "119 productos llevan 21 días o más" publicaras lo que publicaras.
 *
 * Nada fallaba. Los dos lados funcionaban perfectamente por separado.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const HTML = readFileSync(join(RAIZ, 'admin.html'), 'utf8');
const PUBLICAR = readFileSync(join(RAIZ, 'js/src/tm-publicar.src.js'), 'utf8');

// ── El motor: tm-publicar.src.js corriendo de verdad ─────────────────────
function montar(productos) {
    const guardado = {};
    const sb = {
        window: {}, console,
        localStorage: {
            getItem: k => (k in guardado ? guardado[k] : null),
            setItem: (k, v) => { guardado[k] = String(v); },
            removeItem: k => { delete guardado[k]; },
        },
        PRODUCTOS: productos,
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(PUBLICAR, sb);
    return { sb, guardado, run: expr => vm.runInContext(expr, sb) };
}

const CAT = [
    { id: 'a', nombre: 'Router', stock: 5 },
    { id: 'b', nombre: 'Cámara', stock: 3 },
    { id: 'c', nombre: 'Batería', stock: 0 },
];

// ── Las fechas del historial viejo no se pueden perder al migrar ─────────
// tmRegistrarPublicacion no aceptaba fecha. Sin ese parámetro, migrar el
// historial viejo apuntaría todo con la de hoy y "hace X días" pasaría a
// decir "hoy" para el catálogo entero — justo el dato que se quería salvar.
{
    const { run } = montar(CAT);
    const hace40 = Date.now() - 40 * 86400000;
    run(`tmRegistrarPublicacion('a','otra','viejo',${hace40})`);
    ok(run(`tmDiasSinPublicar('a')`) === 40,
        `una publicación migrada debe conservar su fecha, dio ${run(`tmDiasSinPublicar('a')`)} días`);
    // Y sin fecha sigue siendo ahora, como siempre.
    run(`tmRegistrarPublicacion('b','fb','hoy')`);
    ok(run(`tmDiasSinPublicar('b')`) === 0, 'sin fecha explícita se apunta con la de hoy');
    // Una fecha basura no puede colarse como timestamp.
    run(`tmRegistrarPublicacion('c','fb','x','mañana')`);
    ok(run(`tmDiasSinPublicar('c')`) === 0, 'una fecha inválida cae en "ahora", no en NaN');
}

// ── admin.html: un solo historial ────────────────────────────────────────
{
    // pubHist() ya no puede leer su propio almacén: tiene que derivarse del
    // log, que es lo que hace que las dos mitades se enteren la una de la otra.
    const pubHist = HTML.match(/function pubHist\(\)\{[\s\S]*?\n\}/);
    ok(pubHist && /tmPublicaciones\(\)/.test(pubHist[0]),
        'pubHist() debe derivarse de tmPublicaciones(), no de un almacén aparte');
    ok(pubHist && !/localStorage\.getItem\('tmPubHist'\)/.test(pubHist[0]),
        'pubHist() no puede volver a leer tmPubHist directamente');

    const marcar = HTML.match(/function pubMarcarPublicado\([\s\S]*?\n\}/);
    ok(marcar && /tmRegistrarPublicacion\(/.test(marcar[0]),
        'pubMarcarPublicado() debe apuntar en el log común, o el Historial se queda vacío');
    ok(marcar && !/localStorage\.setItem\('tmPubHist'/.test(marcar[0]),
        'pubMarcarPublicado() no puede seguir escribiendo el almacén viejo');

    // La migración corre una sola vez y no puede duplicar en cada carga.
    ok(/_PUB_HIST_MIGRADO/.test(HTML) && /if\(_PUB_HIST_MIGRADO\) return;/.test(HTML),
        'la migración del historial viejo debe correr una sola vez por carga');
    ok(/!tmUltimaPublicacion\(id\)/.test(HTML),
        'la migración debe saltarse lo que ya está en el log, o duplica en cada visita');

    // Cada botón apunta SU red. Antes iba todo como "otra" y el Historial no
    // servía para saber dónde habías puesto ya cada producto.
    ok(/_redDe\s*=\s*\{[^}]*fb:'fb'[^}]*rev:'revolico'/.test(HTML),
        'pubShareAct debe registrar la red real de cada botón, no "otra" para todo');
}

// ── "Hoy toca publicar" ──────────────────────────────────────────────────
{
    ok(/function pubHoyCandidatos\(\)/.test(HTML) && /function pubHoyToca\(\)/.test(HTML),
        'debe existir la selección de "hoy toca"');
    // Publicar lo agotado es tiempo perdido: no puede entrar en la propuesta.
    const cand = HTML.match(/function pubHoyCandidatos\(\)\{[\s\S]*?\n\}/);
    ok(cand && /Number\(p\.stock\|\|0\)>0/.test(cand[0]),
        '"hoy toca" no puede proponer productos agotados');
    ok(cand && /PUB_HOY_DESCANSO_DIAS/.test(cand[0]),
        'lo publicado hace poco debe descansar, o siempre saldrían los mismos');
    // "Dame otros" tiene que dar OTROS de verdad: se ejecuta la selección
    // real, porque comprobar que el texto menciona el contador no distingue
    // un `if(otros)` de un `if(false)`.
    const desde = HTML.indexOf('const PUB_HOY_N =');
    const hasta = HTML.indexOf('function pubHoyHTML()');
    ok(desde > 0 && hasta > desde, 'no encuentro el bloque de "hoy toca" en admin.html');
    const catalogo = Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, nombre: 'P' + i, stock: 4 }));
    const sbHoy = { PRODUCTOS: catalogo, pubHist: () => ({}), Date, console };
    sbHoy.globalThis = sbHoy;
    vm.createContext(sbHoy);
    // pubRenderHoy sale del propio admin.html —no se reescribe aquí— porque
    // lo que se está comprobando es que ESE botón avance el contador.
    const render = HTML.match(/function pubRenderHoy\(otros\)\{[\s\S]*?\n\}/);
    ok(render, 'no encuentro pubRenderHoy() en admin.html');
    sbHoy.$ = () => null;   // pubRenderHoy repinta el DOM; aquí no hay
    vm.runInContext(HTML.slice(desde, hasta) + '\n' + (render ? render[0] : ''), sbHoy);
    const tanda1 = vm.runInContext('pubHoyToca().map(p=>p.id)', sbHoy);
    vm.runInContext('pubRenderHoy(true)', sbHoy);
    const tanda2 = vm.runInContext('pubHoyToca().map(p=>p.id)', sbHoy);
    ok(tanda1.length === 3 && tanda2.length === 3, 'cada tanda debe traer tres');
    ok(tanda1.join() !== tanda2.join(),
        `"Dame otros" debe dar otros: dio ${tanda1.join()} y luego ${tanda2.join()}`);
    ok(!tanda1.some(id => tanda2.includes(id)),
        'la segunda tanda no debe repetir ninguno de la primera');
    // Y al llegar al final da la vuelta en vez de quedarse en blanco.
    for (let i = 0; i < 5; i++) vm.runInContext('pubRenderHoy(true)', sbHoy);
    ok(vm.runInContext('pubHoyToca().length', sbHoy) === 3,
        'al pasar del último debe dar la vuelta, no quedarse sin nada que proponer');
    // Con menos productos que una tanda tampoco puede romperse.
    const sbPoco = { PRODUCTOS: [{ id: 'x', nombre: 'X', stock: 2 }], pubHist: () => ({}), Date, console };
    sbPoco.globalThis = sbPoco;
    vm.createContext(sbPoco);
    vm.runInContext(HTML.slice(desde, hasta), sbPoco);
    ok(vm.runInContext('pubHoyToca().length', sbPoco) === 1,
        'con un solo producto disponible debe proponer ese, sin repetirlo tres veces');
}

// ── Paginación de la lista ───────────────────────────────────────────────
{
    const filt = HTML.match(/function pubShareFiltered\(\)\{[\s\S]*?\n\}/);
    ok(filt && !/\.slice\(0,\s*120\)/.test(filt[0]),
        'el filtro ya no corta a 120: de eso se encarga la paginación');
    ok(/const PUB_SHARE_PAGINA = 20;/.test(HTML), 'la lista debe pintarse de 20 en 20');
    ok(/PUB_SHARE_VISIBLES\s*\+=\s*PUB_SHARE_PAGINA/.test(HTML), 'debe existir "ver más"');
    // Buscar con la paginación avanzada dejaba la lista vacía: cada filtro
    // tiene que volver a la primera página.
    ok(/id="pub-share-q"[^>]*oninput="pubShareReset\(\)"/.test(HTML),
        'buscar debe reiniciar la paginación');
    ok(/id="pub-share-cat"[^>]*onchange="pubShareReset\(\)"/.test(HTML),
        'cambiar de categoría debe reiniciar la paginación');
    ok(/function pubToggleSinPublicar\(\)\{[^}]*pubShareReset\(\)/.test(HTML),
        'el filtro "solo sin publicar" debe reiniciar la paginación');
}

// ── Racha y calendario ───────────────────────────────────────────────────
{
    ok(/function pubRachaDias\(\)/.test(HTML) && /tmPublicacionesPorDia\(\)/.test(HTML),
        'la racha debe salir de tmPublicacionesPorDia(), que ya existía sin usarse');
    const racha = HTML.match(/function pubRachaDias\(\)\{[\s\S]*?\n\}/);
    ok(racha && /cursor\.setDate\(cursor\.getDate\(\)-1\)/.test(racha[0]),
        'si hoy aún no has publicado, la racha se cuenta desde ayer: si no, se pondría a cero cada mañana');
    // El calendario vacío es justo lo que empuja a empezar.
    ok(/if\(!log\.length\)\{\s*\n\s*return pubCalendarioHTML\(\)/.test(HTML),
        'el calendario debe salir también sin historial');
}

// ── El aviso de "21 días" solo con stock ─────────────────────────────────
{
    ok(/const conStock=olvidados\.filter\(p=>Number\(p\.stock\|\|0\)>0\)/.test(HTML),
        'el aviso de olvidados no puede mandar a publicar lo que está agotado');
}

// ── La pill muerta ───────────────────────────────────────────────────────
{
    const pills = HTML.match(/P\.innerHTML=pill\([\s\S]*?;\s*\}/);
    ok(pills && !/pill\('oferta'/.test(pills[0]),
        'la pill "Oferta del día" no hacía nada más que mandar a otro tab: fuera');
}

// ── Lo que el HTML llama tiene que existir y estar exportado ─────────────
// El bloque de admin.html es un IIFE con lista de exports: una función nueva
// llamada desde un onclick existe, pero el botón no hace nada.
{
    const usadas = new Set();
    (HTML.match(/onclick="(pub[A-Za-z]+)\(/g) || []).forEach(m => {
        usadas.add(m.replace(/onclick="/, '').replace(/\($/, ''));
    });
    for (const fn of ['pubRenderHoy', 'pubShareVerMas', 'pubShareReset']) {
        if (!usadas.has(fn)) continue;
        ok(new RegExp('window\\.' + fn + '\\s*=\\s*' + fn).test(HTML),
            `${fn}() se llama desde un onclick pero no está exportada a window: el botón no haría nada`);
    }
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ publicar: todas las comprobaciones pasan');
