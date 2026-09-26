/* El enlace corto de cada producto (tiendamax.org/p/<nombre-corto>) en el
 * panel de verdad (admin.html, que carga el bundle).
 *
 * Nada de esto falla con un error: un enlace mal armado se publica igual y
 * lleva a una página que el generador nunca creó, o a la de otro producto.
 *
 *  - tmUrlProducto arma /p/<slug>, ?c=fb corto, y con marca de grupo solo ?g=.
 *  - Sin slug válido, producto-<id>.html (que existe siempre).
 *  - El campo del modal: propone, avisa de un nombre ya usado por OTRO
 *    producto (también de los que tuvo antes) y no deja guardarlo.
 *  - Cambiarlo guarda el viejo en slugsAnteriores: lo publicado sigue llegando.
 *
 * Se corre solo (`node tests/enlace_corto_check.mjs`) y desde unittest
 * (tests/test_enlace_corto.py). Sale con 1 si algo falla.
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
               '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };
const servidor = createServer(async (q, r) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])));
    try {
        const cuerpo = await readFile(ruta);
        r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
        r.end(cuerpo);
    } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);

const fallos = [];
let comprobaciones = 0;
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const [A, B] = CATALOGO.filter(p => p.slug);
if (!B) { console.log('catálogo sin slugs — se salta'); process.exit(0); }

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 420, height: 900 } });
await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
const pagina = await ctx.newPage();
const errores = [];
pagina.on('pageerror', e => errores.push(String(e).slice(0, 200)));
await pagina.addInitScript(() => { window.confirm = () => true; });
await pagina.goto(`http://localhost:${servidor.address().port}/admin.html`);
await pagina.waitForFunction('typeof window.apSlugInput === "function" && window.PRODUCTOS.length > 0', null, { timeout: 20000 });
await pagina.evaluate(() => {
    document.getElementById('adminPanel').classList.remove('hidden');
    document.querySelectorAll('.tm2-login-card, #tm2Login, .tm2-login').forEach(x => x.remove());
});

// 1) Cómo se arma el enlace.
const u = await pagina.evaluate(([a]) => ({
    solo: tmUrlProducto(a),
    porId: tmUrlProducto(a.id),
    fb: tmUrlProducto(a, 'facebook'),
    wa: tmUrlProducto(a, 'whatsapp'),
    grupo: tmUrlProducto(a, 'facebook', 'k3x9ab'),
    grupoMalo: tmUrlProducto(a, 'facebook', '../x'),
    sinSlug: tmUrlProducto({ id: 42 }, 'fb'),
    slugMalo: tmUrlProducto({ id: 43, slug: 'producto-43' }),
}), [A]);
const base = 'https://tiendamax.org/p/' + A.slug;
ok(u.solo === base, `el enlace de «${A.nombre}» no es ${base}: ${u.solo}`);
ok(u.porId === base, `con solo el id, tmUrlProducto no encuentra el slug: ${u.porId}`);
ok(u.fb === base + '?c=fb', `Facebook tiene que salir con ?c=fb: ${u.fb}`);
ok(u.wa === base + '?c=wa', `WhatsApp tiene que salir con ?c=wa: ${u.wa}`);
ok(u.grupo === base + '?g=k3x9ab', `en un grupo sobra el canal, solo ?g=: ${u.grupo}`);
ok(u.grupoMalo === base + '?c=fb', `una marca de grupo inválida no puede ir al enlace: ${u.grupoMalo}`);
ok(u.sinSlug === 'https://tiendamax.org/p/producto-42.html?c=fb', `sin slug, producto-<id>.html: ${u.sinSlug}`);
ok(u.slugMalo === 'https://tiendamax.org/p/producto-43.html', `un slug que choca con los saltos no se usa: ${u.slugMalo}`);

// 2) El publicar del panel (pubUrl) también sale corto.
const pub = await pagina.evaluate(a => (typeof window.pubUrl === 'function' ? window.pubUrl(a, 'fb') : tmUrlProducto(a, 'facebook')), A);
ok(!/utm_|producto-\d+\.html/.test(pub), `el panel sigue publicando el enlace largo: ${pub}`);

// 3) El campo del modal de edición.
const m = await pagina.evaluate(async ([a, b]) => {
    apEdit(a.id);
    const inp = document.getElementById('pedit-slug'), info = document.getElementById('pedit-slug-info');
    const r = { cargado: inp.value };
    inp.value = b.slug; apSlugInput(); r.avisoOcupado = info.textContent;
    await apEditSave(); r.trasOcupado = (PRODUCTOS.find(x => String(x.id) === String(a.id)) || {}).slug;
    apEdit(a.id);
    inp.value = 'Nuevo Nombre Con Tildé'; apSlugInput(); r.aviso = info.textContent;
    await apEditSave();
    const p = PRODUCTOS.find(x => String(x.id) === String(a.id));
    r.slug = p.slug; r.anteriores = p.slugsAnteriores || [];
    // Otro producto no puede quedarse con el nombre que A tuvo antes.
    apEdit(b.id); inp.value = a.slug; apSlugInput(); r.avisoViejo = info.textContent;
    apEdit(a.id); apSlugProponer(); r.propuesto = inp.value;
    return r;
}, [A, B]);
ok(m.cargado === A.slug, `el modal no carga el enlace corto del producto: «${m.cargado}»`);
ok(/ya lo usa/.test(m.avisoOcupado), `no avisa de que el nombre ya es de «${B.nombre}»: «${m.avisoOcupado}»`);
ok(m.trasOcupado === A.slug, 'se guardó un enlace corto que ya usa otro producto: los dos apuntarían a la misma página');
ok(m.slug === 'nuevo-nombre-con-tilde', `el enlace no se limpió (minúsculas, sin tildes, guiones): «${m.slug}»`);
ok(m.anteriores.includes(A.slug), 'cambiar el enlace no guardó el viejo: lo ya publicado dejaría de llegar');
ok(/ya lo usa/.test(m.avisoViejo), 'otro producto puede quedarse con el nombre viejo de este: sus enlaces publicados cambiarían de producto');
ok(m.propuesto && m.propuesto.length <= 28 && /^[a-z0-9-]+$/.test(m.propuesto), `la propuesta no es un enlace válido: «${m.propuesto}»`);
ok(!errores.length, 'errores de JavaScript en el panel: ' + errores.join(' | '));

await navegador.close();
servidor.close();
if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobación(es) fallida(s):`);
    fallos.forEach(f => console.error('   • ' + f));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones del enlace corto`);
