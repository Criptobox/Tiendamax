/* TiendaMax — informe Lighthouse
 *
 * Corre Lighthouse sobre el sitio publicado y escribe un resumen. NO tumba el
 * build: la puntuación de rendimiento depende de la red del runner, del CDN y
 * de la hora, y un umbral duro acabaría bloqueando despliegues buenos por
 * causas ajenas al código. Además pages.yml solo publica si el pipeline pasa,
 * o sea que un falso rojo aquí deja la tienda sin actualizar.
 *
 * Lo que sí es determinista —accesibilidad, buenas prácticas y SEO— se marca
 * como aviso cuando baja del umbral, porque ahí una caída sí es un cambio real
 * en el HTML, no ruido de red.
 *
 *     node tests/lighthouse-report.mjs
 *     SITE_URL=https://tiendamax.org node tests/lighthouse-report.mjs
 *     node tests/lighthouse-report.mjs --json   # solo el JSON, para tuberías
 *
 * Se emula un móvil con 3G lento a propósito: es la conexión de la mayoría de
 * los clientes, y medir en fibra desde un datacenter no dice nada útil.
 */
import { writeFileSync, appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const SITIO = (process.env.SITE_URL || 'https://tiendamax.org').replace(/\/$/, '');
const SOLO_JSON = process.argv.includes('--json');

// Umbrales de las categorías deterministas. El de rendimiento se informa pero
// no se juzga: ver la cabecera.
const MINIMOS = { accessibility: 90, 'best-practices': 90, seo: 90 };

const NOMBRES = {
    performance: 'Rendimiento',
    accessibility: 'Accesibilidad',
    'best-practices': 'Buenas prácticas',
    seo: 'SEO',
};

function log(...a) { if (!SOLO_JSON) console.log(...a); }

/** Una página de producto real del catálogo, no una inventada: es la mitad del
 *  tráfico y se genera con otra plantilla que el home. */
function urlDeProducto() {
    try {
        const raw = JSON.parse(readFileSync(new URL('../productos.json', import.meta.url), 'utf8'));
        const lista = Array.isArray(raw) ? raw : (raw.productos || []);
        const p = lista.find(x => x && x.id && Number(x.stock) > 0) || lista[0];
        if (p?.id) return `${SITIO}/p/producto-${p.id}.html`;
    } catch { /* sin catálogo local: se mide solo el home */ }
    return null;
}

async function auditar(chrome, url) {
    const r = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        // Móvil + 3G lento: la conexión real de la mayoría de los clientes.
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 360, height: 640, deviceScaleFactor: 2, disabled: false },
        throttlingMethod: 'simulate',
        throttling: {
            rttMs: 300, throughputKbps: 700, cpuSlowdownMultiplier: 4,
            requestLatencyMs: 300 * 3.75, downloadThroughputKbps: 700 * 0.9, uploadThroughputKbps: 700 * 0.9,
        },
        onlyCategories: Object.keys(NOMBRES),
    });
    const lhr = r.lhr;
    const cats = {};
    for (const k of Object.keys(NOMBRES)) {
        const s = lhr.categories[k]?.score;
        cats[k] = s == null ? null : Math.round(s * 100);
    }
    const metrica = (id) => lhr.audits[id]?.numericValue ?? null;
    return {
        url,
        categorias: cats,
        // Si Lighthouse no llegó a cargar la página, TODO sale nulo. Sin
        // registrarlo, el informe imprimía "✅ por encima del mínimo" sin haber
        // medido absolutamente nada — verde por no tener datos, que es la peor
        // clase de verde.
        error: lhr.runtimeError?.code
            || (Object.values(cats).every(v => v == null) ? 'SIN_DATOS' : null),
        metricas: {
            lcp: metrica('largest-contentful-paint'),
            cls: metrica('cumulative-layout-shift'),
            tbt: metrica('total-blocking-time'),
            fcp: metrica('first-contentful-paint'),
        },
        // Solo lo que Lighthouse considera fallo, y de las categorías firmes:
        // la lista completa de "oportunidades" es ruido en un informe corto.
        fallos: Object.entries(lhr.audits)
            .filter(([, a]) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
            .map(([id, a]) => ({ id, titulo: a.title, score: Math.round(a.score * 100) }))
            .slice(0, 40),
    };
}

function tabla(resultados) {
    const filas = [];
    filas.push('| Página | ' + Object.values(NOMBRES).join(' | ') + ' |');
    filas.push('|---|' + Object.keys(NOMBRES).map(() => '---:').join('|') + '|');
    for (const r of resultados) {
        const nombre = r.url.replace(SITIO, '') || '/';
        if (r.error) {
            filas.push(`| \`${nombre}\` | ⛔ no se pudo medir (${r.error}) |||`);
            continue;
        }
        const celdas = Object.keys(NOMBRES).map(k => {
            const v = r.categorias[k];
            if (v == null) return 'n/d';
            const icono = v >= 90 ? '🟢' : v >= 50 ? '🟡' : '🔴';
            return `${icono} ${v}`;
        });
        filas.push(`| \`${nombre}\` | ${celdas.join(' | ')} |`);
    }
    return filas.join('\n');
}

function avisos(resultados) {
    const out = [];
    for (const r of resultados) {
        const pag = r.url.replace(SITIO, '') || '/';
        if (r.error) {
            out.push(`\`${pag}\` no se pudo medir (${r.error}) — el informe de esta página no vale`);
            continue;
        }
        for (const [cat, min] of Object.entries(MINIMOS)) {
            const v = r.categorias[cat];
            if (v != null && v < min) {
                out.push(`${NOMBRES[cat]} ${v}/100 en \`${pag}\` (mínimo ${min})`);
            }
        }
    }
    return out;
}

/** En el runner de Actions chrome-launcher encuentra Chrome solo. En un
 *  contenedor donde solo está el Chromium de Playwright hay que señalárselo, y
 *  la carpeta lleva el número de build (chromium-1194), así que no vale una
 *  ruta fija. */
function chromeDePlaywright() {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    try {
        for (const d of readdirSync(base)) {
            if (!d.startsWith('chromium-')) continue;
            const ruta = `${base}/${d}/chrome-linux/chrome`;
            if (existsSync(ruta)) return ruta;
        }
    } catch { /* no está Playwright: que lo busque chrome-launcher */ }
    return undefined;
}

const banderas = ['--headless=new', '--no-sandbox', '--disable-gpu'];
// Si el entorno sale por un proxy, Chrome también tiene que hacerlo o no
// llegará al sitio. En Actions no hay proxy y esto no se activa.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) banderas.push(`--proxy-server=${proxy}`, '--ignore-certificate-errors');

const chrome = await launch({
    chromeFlags: banderas,
    chromePath: process.env.CHROME_PATH || chromeDePlaywright(),
});

let resultados = [];
try {
    const urls = [SITIO + '/', urlDeProducto()].filter(Boolean);
    for (const u of urls) {
        log(`▶ Midiendo ${u} …`);
        resultados.push(await auditar(chrome, u));
    }
} finally {
    await chrome.kill();
}

const informe = {
    sitio: SITIO,
    fecha: new Date().toISOString(),
    paginas: resultados,
    avisos: avisos(resultados),
};

const noMedidas = resultados.filter(r => r.error);

if (SOLO_JSON) {
    console.log(JSON.stringify(informe, null, 1));
} else {
    log('\n' + tabla(resultados) + '\n');
    for (const r of resultados.filter(x => !x.error)) {
        const m = r.metricas;
        log(`${r.url.replace(SITIO, '') || '/'} — LCP ${Math.round(m.lcp)}ms · CLS ${(m.cls ?? 0).toFixed(3)} · TBT ${Math.round(m.tbt)}ms`);
    }
    if (informe.avisos.length) {
        log('\n⚠️  Revisar:');
        informe.avisos.forEach(a => log('   · ' + a));
    } else {
        log('\n✅ Accesibilidad, buenas prácticas y SEO por encima del mínimo.');
    }
    // A stderr para que se vea aunque alguien solo mire los errores del job.
    if (noMedidas.length === resultados.length) {
        console.error('\n⛔ No se pudo medir NINGUNA página: este informe no dice nada.');
    }
}

// Resumen en la pestaña del workflow, que es donde se mira sin abrir el log.
if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
        '## 🔦 Lighthouse — ' + SITIO,
        '',
        'Móvil emulado con 3G lento (300 ms RTT, 700 kbps, CPU ×4).',
        '',
        tabla(resultados),
        '',
        '### Métricas',
        '',
        '| Página | LCP | CLS | TBT |',
        '|---|---:|---:|---:|',
        ...resultados.filter(r => !r.error).map(r => {
            const m = r.metricas;
            return `| \`${r.url.replace(SITIO, '') || '/'}\` | ${Math.round(m.lcp)} ms | ${(m.cls ?? 0).toFixed(3)} | ${Math.round(m.tbt)} ms |`;
        }),
        '',
        noMedidas.length === resultados.length
            ? '## ⛔ No se pudo medir ninguna página\n\nEste informe no dice nada; revisa que el sitio responda.'
            : informe.avisos.length
                ? '### ⚠️ Revisar\n\n' + informe.avisos.map(a => '- ' + a).join('\n')
                : '✅ Accesibilidad, buenas prácticas y SEO por encima del mínimo.',
        '',
        '_El rendimiento se informa pero no se juzga: depende de la red del runner._',
    ].join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

if (process.env.LIGHTHOUSE_JSON_OUT) {
    writeFileSync(process.env.LIGHTHOUSE_JSON_OUT, JSON.stringify(informe, null, 1));
}

// Siempre 0: este informe no bloquea nada. Lo que hay que mirar sale arriba.
process.exit(0);
