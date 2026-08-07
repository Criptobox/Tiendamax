/* Las preguntas que le hacen a Max, y el apartado del admin que las enseña.
 *
 * La recogida existía desde hacía tiempo y no había producido nada. Tres cosas
 * lo impedían, y ninguna daba un error:
 *
 * 1. La regla de /agente/faq ponía `.write: "!data.exists()"` en query, intent
 *    y lastResponse. El bot manda siempre un PATCH con los cinco campos, y en
 *    RTDB un update es atómico: la SEGUNDA vez que alguien preguntaba lo
 *    mismo, esos tres campos ya existían, se denegaban, y el PATCH entero
 *    fallaba. El contador se quedaba clavado en 1 para siempre — y
 *    build_faq.py exige MIN_COUNT=3 para aprender una pregunta, así que la
 *    función no podía funcionar nunca. faq.json tenía 0 aprendidas.
 *
 * 2. /agente era `.read: false`, así que el panel no podía leerlo. El Copiloto
 *    ya pedía /agente/faq.json y siempre recibía null.
 *
 * 3. Se guardaba tal cual lo que escribe el cliente, y esas preguntas acaban
 *    en faq.html — pública e indexada por Google. Un teléfono escrito en la
 *    pregunta se publicaba.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGLAS = JSON.parse(readFileSync(join(RAIZ, 'firebase-rules.json'), 'utf8')).rules;
const CEREBRO = readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8');
const COPI = readFileSync(join(RAIZ, 'js/admin-copilot.js'), 'utf8');
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

// ── 1. Repetir una pregunta tiene que poder contarse ─────────────────────
{
    const nodo = REGLAS.agente.faq.$faqKey;
    // El bot manda SIEMPRE los mismos campos, la primera vez y las siguientes.
    const bloque = CEREBRO.slice(CEREBRO.indexOf('function _registrarPreguntaFAQ'),
                                 CEREBRO.indexOf('function _registrarPreguntaFAQ') + 3500);
    const enviados = ['query', 'intent', 'lastResponse', 'count', 'lastUpdated']
        .filter(c => new RegExp('\\n\\s*' + c + ':').test(bloque));
    ok(enviados.length >= 4, `no reconozco los campos que manda el bot (vi ${enviados.join(', ')})`);

    // Ninguno de esos campos puede tener un .write que falle cuando ya existe:
    // tumbaría el update entero y el contador nunca pasaría de 1.
    for (const campo of enviados) {
        const w = nodo[campo] && nodo[campo]['.write'];
        ok(w !== '!data.exists()',
            `"${campo}" tiene .write "!data.exists()": la 2ª vez que preguntan lo mismo el PATCH falla entero y el contador se queda en 1`);
    }
    // El guard bueno sigue en el padre: solo se admite +1, nada de saltos.
    ok(/count.*\+ 1/.test(nodo['.write'] || ''),
        'el nodo debe seguir exigiendo que el contador suba de uno en uno');
}

// ── 2. El panel tiene que poder leerlas ──────────────────────────────────
{
    ok(REGLAS.agente.faq['.read'] === true,
        '/agente/faq debe ser legible o el panel siempre recibe null');
    // El .read:false del padre no lo impide —los permisos bajan, no suben—
    // pero /agente entero sigue cerrado.
    ok(REGLAS.agente['.read'] === false,
        'solo se abre /agente/faq, no /agente entero');
    ok(/getJson\('\/agente\/faq\.json'\)/.test(COPI),
        'el panel debe leer /agente/faq.json');
}

// ── 3. Nada de teléfonos ni correos guardados ────────────────────────────
// Estas preguntas acaban en faq.html, que es pública e indexada: una vez
// dentro, ya no hay forma de sacarlas del índice de Google.
{
    const m = CEREBRO.match(/const _sinDatos = \(txt\) => String\(txt\)[\s\S]*?;\n/);
    ok(m, 'falta el saneado de datos personales antes de guardar la pregunta');
    if (m) {
        const _sinDatos = new Function('return ' + m[0].replace('const _sinDatos = ', '').replace(/;\s*$/, ''))();
        const casos = [
            ['mi numero es 54320170 tienen routers', /\[teléfono\]/, /54320170/],
            ['llamame al +53 5432 0170', /\[teléfono\]/, /5432/],
            ['escribeme a juan@nauta.cu', /\[correo\]/, /juan@/],
        ];
        for (const [texto, debe, noDebe] of casos) {
            const out = _sinDatos(texto);
            ok(debe.test(out), `"${texto}" no se saneó: ${out}`);
            ok(!noDebe.test(out), `"${texto}" deja el dato dentro: ${out}`);
        }
        // Y no puede comerse lo que sí importa de la pregunta.
        for (const t of ['router de 5000w', 'bateria 100ah 12v', 'el AC1200 sirve', 'inversor 3000w 24v']) {
            ok(_sinDatos(t) === t, `el saneado se comió parte de "${t}": ${_sinDatos(t)}`);
        }
    }
    // Y se aplica a los DOS campos de texto libre, no solo a la pregunta.
    const reg = CEREBRO.slice(CEREBRO.indexOf('function _registrarPreguntaFAQ'),
                              CEREBRO.indexOf('function _registrarPreguntaFAQ') + 3500);
    ok(/query: _sinDatos\(/.test(reg), 'la pregunta del cliente debe sanearse');
    ok(/lastResponse: _sinDatos\(/.test(reg), 'la respuesta guardada también');
}

// ── 4. El apartado del admin ─────────────────────────────────────────────
{
    ok(/\['preguntas','❓ Preguntas'\]/.test(COPI), 'falta la pestaña ❓ Preguntas');
    ok(/if\(view==='preguntas'\)/.test(COPI), 'la pestaña no está enrutada a ninguna vista');
    ok(/function preguntasHtml\(\)/.test(COPI), 'falta la vista');

    // Lo que Max NO supo contestar va primero: es lo único accionable.
    ok(/sinRespuesta: String\(x\.intent \|\| ''\) === 'desconocido'/.test(COPI),
        'el panel debe distinguir lo que Max no supo contestar');
    ok(/\.sort\(\(a, b\) => \(b\.sinRespuesta - a\.sinRespuesta\)/.test(COPI),
        'las que Max no supo contestar van primero, y luego por veces repetidas');

    // "Hecho" tiene que persistir, o vuelven a salir en cada refresco.
    ok(/pregVistas: 'tm_copilot_preguntas_vistas'/.test(COPI), 'falta dónde guardar las revisadas');
    ok(/function pregMarcar\(k\)/.test(COPI) && /localStorage\.setItem\(LS\.pregVistas/.test(COPI),
        '"Hecho" debe guardarse');
    ok(/data-cop="pregReset"/.test(COPI), 'debe poder volverse a ver lo ya revisado');
}

// ── 5. Una pregunta = un PATCH, con la intención de verdad ───────────────
// Esto se mira EJECUTANDO el bot y espiando lo que manda, no leyendo el
// código. Había dos registros por mensaje —uno dentro de R.fallback y otro en
// el manejador del chat— y la comprobación estática de antes daba las dos por
// buenas porque cada pieza, por separado, estaba bien escrita. En marcha, el
// segundo PATCH pisaba 'desconocido' con 'fallback', así que el apartado
// "🤷 Max no supo contestar" no podía tener nunca nada dentro, y cada
// pregunta sin respuesta contaba doble.
{
    const noop = () => {};
    const el = () => ({
        innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        appendChild: noop, removeChild: noop, remove: noop, insertBefore: noop,
        addEventListener: noop, removeEventListener: noop, setAttribute: noop,
        getAttribute: () => null, focus: noop, blur: noop, scrollTo: noop,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
        querySelector: () => el(), querySelectorAll: () => [],
    });
    const catalogo = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
    const escritos = [];
    const win = { location: { origin: 'https://tiendamax.org' }, addEventListener: noop,
                  setTimeout, clearTimeout, open: () => null,
                  matchMedia: () => ({ matches: false, addEventListener: noop }) };
    const sb = {
        window: win, location: win.location,
        document: { createElement: el, querySelector: () => el(), querySelectorAll: () => [],
                    addEventListener: noop, body: el(), head: el() },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'node' },
        productos: catalogo.productos || catalogo,
        console, setTimeout, clearTimeout, requestAnimationFrame: noop,
        _fbRtdbUrl: () => 'https://ejemplo-default-rtdb.firebaseio.com',
        fetch: (u, o) => {
            if (String(u).includes('/agente/faq/')) escritos.push(JSON.parse(o.body));
            return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''),
                                     json: () => Promise.resolve({}) });
        },
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    // Se saca _registrarPreguntaFAQ del cierre para poder llamarlo igual que
    // lo llama el manejador del chat, sin necesitar DOM.
    vm.runInContext(CEREBRO.replace('window._tmBot = {',
        'window._espia = { reg: _registrarPreguntaFAQ, ctx: () => _context };\n  window._tmBot = {'), sb);
    const B = sb.window._tmBot;
    B.sincronizar();

    // Exactamente lo que hace el chat al enviar (ver el bloque de envío).
    const preguntar = (q) => {
        escritos.length = 0;
        const data = B.responder(q);
        sb.window._espia.reg(q, data.sinRespuesta ? 'desconocido' : sb.window._espia.ctx().lastIntent, data.response);
        return { data, escritos: escritos.slice() };
    };

    const nada = preguntar('sdfjk asdkjh qwerty zxcvbn');
    ok(nada.data.sinRespuesta === true, 'la respuesta de fallback debe venir marcada como sin respuesta');
    ok(nada.escritos.length === 1,
        `una pregunta debe generar UN PATCH, generó ${nada.escritos.length} (el contador subiría de dos en dos)`);
    ok(nada.escritos[0] && nada.escritos[0].intent === 'desconocido',
        `lo que Max no supo contestar debe guardarse como 'desconocido', guardó '${nada.escritos[0] && nada.escritos[0].intent}'`);

    const buena = preguntar('quiero un router tp link');
    ok(buena.escritos.length === 1, 'una pregunta contestada también genera un solo PATCH');
    ok(buena.escritos[0] && buena.escritos[0].intent !== 'desconocido',
        'una pregunta que Max sí contestó no puede marcarse como sin respuesta');

    // El PATCH tiene que cumplir el contrato de la regla o Firebase lo tumba
    // entero, y eso ya pasó una vez sin dejar rastro en ningún sitio.
    for (const campo of ['query', 'intent', 'count', 'lastUpdated']) {
        ok(buena.escritos[0] && buena.escritos[0][campo] !== undefined,
            `el PATCH debe traer "${campo}": la regla lo exige y sin él se rechaza todo`);
    }

    // Y el fallo tiene que dejar rastro. Con .catch(()=>{}) a secas, unas
    // reglas sin publicar dejan el apartado vacío sin una sola pista —es el
    // mismo agujero mudo que tuvo Web Vitals durante meses.
    ok(/_recordarFAQ\(/.test(CEREBRO), 'el resultado del PATCH debe apuntarse en algún sitio');
    ok(/window\.tmPreguntasProbar = function/.test(CEREBRO),
        'debe haber una prueba de escritura a mano para distinguir "no hay preguntas" de "las reglas rechazan"');
    ok(/k !== '__prueba_del_panel'/.test(COPI),
        'la clave de prueba no puede salir en la lista como si fuera una pregunta de un cliente');
}

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ preguntas: todas las comprobaciones pasan');
