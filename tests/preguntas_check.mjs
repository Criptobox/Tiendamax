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
                                 CEREBRO.indexOf('function _registrarPreguntaFAQ') + 2000);
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
                              CEREBRO.indexOf('function _registrarPreguntaFAQ') + 2000);
    ok(/query: _sinDatos\(/.test(reg), 'la pregunta del cliente debe sanearse');
    ok(/lastResponse: _sinDatos\(/.test(reg), 'la respuesta guardada también');
}

// ── 4. El apartado del admin ─────────────────────────────────────────────
{
    ok(/\['preguntas','❓ Preguntas'\]/.test(COPI), 'falta la pestaña ❓ Preguntas');
    ok(/if\(view==='preguntas'\)/.test(COPI), 'la pestaña no está enrutada a ninguna vista');
    ok(/function preguntasHtml\(\)/.test(COPI), 'falta la vista');

    // Lo que Max NO supo contestar va primero: es lo único accionable.
    // R.fallback marca el intent como 'desconocido'; si el panel deja de
    // mirarlo, la lista pierde justo la señal por la que existe.
    ok(/_registrarPreguntaFAQ\(text, 'desconocido'/.test(CEREBRO),
        "R.fallback debe marcar la pregunta como 'desconocido'");
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

if (fallos.length) {
    console.error(`❌ ${fallos.length} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log('✅ preguntas: todas las comprobaciones pasan');
