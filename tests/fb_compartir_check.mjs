/* «Copiar y elegir el grupo en Facebook» (vista previa de Facebook, sin grupo).
 *
 * El botón abría la portada de Facebook: había que buscar el grupo y pegar a
 * mano. Ahora abre «Compartir» del teléfono con la imagen del anuncio (se
 * elige Facebook → Grupo) y deja el texto en el portapapeles. Se comprueba en
 * un navegador, con navigator.share simulado:
 *  · comparte un archivo PNG y el texto del post, y el texto queda copiado;
 *  · solo marca «publicado» si se compartió; cancelar no marca nada;
 *  · donde no se pueden compartir archivos, descarga la imagen y abre la lista
 *    de grupos de Facebook, no la portada.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try { const b = await readFile(ruta); r.writeHead(200, {'Content-Type': MIME[extname(ruta)] || 'application/octet-stream'}); r.end(b); }
    catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

let comprobaciones = 0;
const fallos = [];
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };
const PRODS = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const prod = PRODS.find(p => p.stock > 0 && !p.digital);

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errores = [];

async function escenario(modo) {
    const ctx = await nav.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
    await ctx.addInitScript(m => {
        localStorage.setItem('gruposFB', '[]');
        window.__comp = []; window.__abiertos = []; window.__copiado = '';
        window.open = u => { window.__abiertos.push(u); return {}; };
        try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copiado = t; }, write: async () => {} }, configurable: true }); } catch (e) {}
        if (m === 'pc') {
            Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
        } else {
            Object.defineProperty(navigator, 'canShare', { value: d => !!(d && d.files && d.files.length), configurable: true });
            Object.defineProperty(navigator, 'share', { value: async d => {
                window.__comp.push({ n: (d.files || []).length, tipo: d.files && d.files[0] && d.files[0].type, texto: d.text || '' });
                if (m === 'cancela') { const e = new Error('Share canceled'); e.name = 'AbortError'; throw e; }
            }, configurable: true });
        }
    }, modo);
    const p = await ctx.newPage();
    p.on('pageerror', e => errores.push(modo + ': ' + String(e).slice(0, 160)));
    await p.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(3500);
    await p.evaluate(id => { document.getElementById('adminPanel')?.classList.remove('hidden');
        document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
        localStorage.setItem('tm_publog_v1', '[]');
        previsualizarFacebook(id); }, String(prod.id));
    // La imagen del anuncio tarda en dibujarse (foto bloqueada → icono).
    await p.waitForFunction(() => { const m = document.getElementById('fbPreviewModal'); return m && m._tmBlob; }, null, { timeout: 15000 }).catch(() => {});
    const boton = await p.evaluate(() => (document.getElementById('btnAbrirFb') || {}).textContent || '');
    await p.click('#btnAbrirFb');
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({ comp: window.__comp, abiertos: window.__abiertos, copiado: window.__copiado,
        texto: (document.getElementById('fbPostTA') || {}).value || '',
        log: JSON.parse(localStorage.getItem('tm_publog_v1') || '[]') }));
    await ctx.close();
    return Object.assign(r, { boton });
}

const a = await escenario('comparte');
ok(/elegir el grupo/i.test(a.boton), 'sin grupos guardados, el botón tiene que decir que se elige el grupo: ' + a.boton);
ok(a.comp.length === 1 && a.comp[0].n === 1 && a.comp[0].tipo === 'image/png', 'tenía que abrir «Compartir» con la imagen PNG del anuncio: ' + JSON.stringify(a.comp));
ok(a.comp[0] && a.comp[0].texto && a.comp[0].texto === a.texto, 'el texto del post va dentro de lo que se comparte');
ok(a.copiado && a.copiado === a.texto, 'el texto del post tiene que quedar copiado para pegarlo en el grupo');
ok(a.abiertos.length === 0, 'compartiendo no hace falta abrir ninguna ventana: ' + a.abiertos.join(' '));
ok(a.log.some(e => String(e.pid) === String(prod.id) && /compartido/i.test(JSON.stringify(e))), 'compartido, tenía que quedar en el registro de publicaciones: ' + JSON.stringify(a.log).slice(0, 200));

const b = await escenario('cancela');
ok(b.comp.length === 1, 'tenía que intentar compartir');
ok(b.log.length === 0, 'cancelar «Compartir» no puede marcar el producto como publicado: ' + JSON.stringify(b.log).slice(0, 200));

const c = await escenario('pc');
ok(c.abiertos.length === 1 && /facebook\.com\/groups\/feed/.test(c.abiertos[0]), 'sin compartir archivos, tiene que abrir la lista de grupos, no la portada: ' + c.abiertos.join(' '));
ok(c.copiado === c.texto, 'en PC el texto también queda copiado');

// ── «🪄 3 redes» sin grupos: la plantilla de Facebook sale CON las imágenes,
//    y en todos los textos de Facebook el enlace de la ficha va primero (de él
//    saca Facebook la vista previa: con wa.me delante salía «wa.me» sin foto).
{
    const ctx = await nav.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
    await ctx.addInitScript(() => {
        localStorage.setItem('gruposFB', '[]'); localStorage.removeItem('tm_plantillas_v1');
        window.__comp = []; window.__copiado = '';
        try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copiado = t; }, write: async () => {} }, configurable: true }); } catch (e) {}
        Object.defineProperty(navigator, 'canShare', { value: d => !!(d && d.files && d.files.length), configurable: true });
        Object.defineProperty(navigator, 'share', { value: async d => { window.__comp.push({ n: (d.files || []).length, texto: d.text || '' }); }, configurable: true });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errores.push('3redes: ' + String(e).slice(0, 160)));
    await p.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(3500);
    const ids = PRODS.filter(x => x.stock > 0 && !x.digital).slice(0, 2).map(x => String(x.id));
    const r = await p.evaluate(async ids => {
        document.getElementById('adminPanel')?.classList.remove('hidden');
        document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
        localStorage.setItem('tm_publog_v1', '[]');
        go('publicar'); pubSwitch('wizard');
        await new Promise(r => setTimeout(r, 400));
        ids.forEach(id => wzToggle(id, true));
        await new Promise(r => setTimeout(r, 6000));   // las imágenes se dibujan al pintar el bloque
        const hay = !!document.getElementById('wz-fb-share');
        await wzCompartirFB();
        const primerEnlace = t => (String(t).match(/https?:\/\/\S+/) || [''])[0];
        const prod = PRODUCTOS.find(x => String(x.id) === ids[0]);
        const textos = [0, 1, 2, 3].map(v => _textoFacebook(prod, { variante: v }));
        return { hay, comp: window.__comp, copiado: window.__copiado,
                 log: JSON.parse(localStorage.getItem('tm_publog_v1') || '[]'),
                 primeros: textos.map(primerEnlace), plantilla: primerEnlace(window.__copiado) };
    }, ids);
    ok(r.hay, 'sin grupos, «3 redes» tiene que ofrecer compartir Facebook con la imagen');
    ok(r.comp.length === 1 && r.comp[0].n === 2, 'tenía que compartir una imagen por producto: ' + JSON.stringify(r.comp));
    ok(r.copiado && r.comp[0] && r.comp[0].texto === r.copiado, 'el texto de la plantilla tiene que quedar copiado y viajar con las imágenes');
    ok(ids.every(id => r.log.some(e => String(e.pid) === id)), 'compartido, cada producto tiene que quedar en el registro');
    ok(r.primeros.every(u => /tiendamax\.org\/p\//.test(u)), 'en los textos de Facebook el primer enlace tiene que ser la ficha (de él sale la foto de la vista previa): ' + r.primeros.join(' | '));
    ok(/tiendamax\.org\/p\//.test(r.plantilla), 'en la plantilla de Facebook por defecto el primer enlace tiene que ser la ficha: ' + r.plantilla);
    await ctx.close();
}

const propios = errores.filter(e => !/firebase is not defined/.test(e));
ok(propios.length === 0, 'errores de JavaScript: ' + propios.join(' | '));
await nav.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de «elegir el grupo en Facebook» en regla.`);
