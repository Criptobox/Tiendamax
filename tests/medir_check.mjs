/* El contador de las fichas /p/ — comprobado en un navegador de verdad.
 *
 * Lo que hace este script no se puede comprobar leyendo el HTML: son cuatro
 * decisiones que solo existen mientras la página corre, y las cuatro fallan
 * calladas.
 *
 *  - Que el canal salga de la lista blanca y no del utm_source crudo. Tener
 *    la tabla escrita en el fichero no prueba que se use: basta un `var
 *    c=q` para que un enlace inventado abra nodos nuevos en Firebase, y el
 *    fichero sigue teniendo su tabla intacta para quien lo lea.
 *  - Que el dueño no se cuente. Abre sus propias fichas para comprobarlas.
 *  - Que la segunda visita en la misma sesión no vuelva a contar.
 *  - Que el canal llegue al mensaje de WhatsApp. Sin eso se sabe qué canal
 *    trae gente pero no cuál acaba escribiendo.
 *
 * Firebase se intercepta: no se escribe nada en ninguna base. Se corre solo
 * (`node tests/medir_check.mjs`) y desde unittest (tests/test_ficha_venta.py).
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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

// Una ficha con stock (lleva el botón de pedir) y su id.
const fichas = (await readdir(join(RAIZ, 'p'))).filter(f => f.startsWith('producto-'));
let FICHA = null;
for (const f of fichas) {
    const html = await readFile(join(RAIZ, 'p', f), 'utf8');
    if (html.includes('<div class="tm-stok-y">')) { FICHA = f; break; }
}
if (!FICHA) { console.log('no hay fichas con stock — se salta'); process.exit(0); }
const ID = FICHA.replace('producto-', '').replace('.html', '');

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/** Abre la ficha con `busqueda` y devuelve las escrituras que intentó. */
async function visita(busqueda, { comoDueño = false, contexto = null } = {}) {
    const ctx = contexto || await navegador.newContext({ serviceWorkers: 'block' });
    const escrituras = [];
    if (!contexto) {
        await ctx.route('**/*.firebaseio.com/**', r => {
            escrituras.push(r.request().url().replace(/^https:\/\/[^/]+/, ''));
            return r.fulfill({ status: 200, contentType: 'application/json', body: '1' });
        });
        if (comoDueño) await ctx.addInitScript(() => localStorage.setItem('githubToken', 'x'));
    } else {
        ctx.__escrituras.length = 0;
    }
    const pg = await ctx.newPage();
    await pg.goto('file://' + join(RAIZ, 'p', FICHA) + busqueda);
    await pg.waitForTimeout(350);
    const href = await pg.$eval('#tmWa', a => a.getAttribute('href')).catch(() => null);
    await pg.close();
    if (!contexto) await ctx.close();
    return { escrituras, href };
}

// 1) El canal sale de la lista blanca, no del utm_source crudo.
const inventado = await visita('?utm_source=algo-que-nadie-publico');
ok(!inventado.escrituras.some(u => u.includes('/analytics/fuentes/')),
   'un utm_source que no está en la lista blanca creó un nodo en /analytics/fuentes: '
   + inventado.escrituras.filter(u => u.includes('fuentes')).join(', '));

// 2) Un alias conocido se normaliza al canal canónico ('fb' → 'facebook').
const fb = await visita('?utm_source=fb');
ok(fb.escrituras.some(u => u.includes('/analytics/fuentes/facebook/count.json')),
   "el alias 'fb' no se contó como facebook");
ok(!fb.escrituras.some(u => u.includes('/analytics/fuentes/fb/')),
   "'fb' se escribió tal cual en vez de normalizarse a facebook");

// 3) El canal viaja hasta el mensaje de WhatsApp.
ok(decodeURIComponent(fb.href || '').includes('?utm_source=facebook'),
   'el enlace de WhatsApp no lleva el canal: se sabe quién entra pero no quién escribe');

// 4) El dueño no se cuenta.
const dueño = await visita('?utm_source=fb', { comoDueño: true });
ok(dueño.escrituras.length === 0,
   `el dueño generó ${dueño.escrituras.length} escritura(s): sus comprobaciones inflan las vistas`);

// 5) Recargar en la misma sesión no vuelve a contar.
const ctx = await navegador.newContext({ serviceWorkers: 'block' });
ctx.__escrituras = [];
await ctx.route('**/*.firebaseio.com/**', r => {
    ctx.__escrituras.push(r.request().url().replace(/^https:\/\/[^/]+/, ''));
    return r.fulfill({ status: 200, contentType: 'application/json', body: '1' });
});
const pg = await ctx.newPage();
await pg.goto('file://' + join(RAIZ, 'p', FICHA));
await pg.waitForTimeout(350);
const primera = ctx.__escrituras.length;
ctx.__escrituras.length = 0;
await pg.reload();
await pg.waitForTimeout(350);
const segunda = ctx.__escrituras.length;
ok(primera > 0, 'la primera visita no contó nada');
ok(segunda === 0, `recargar contó ${segunda} escritura(s) más: cualquiera infla su propio producto con F5`);

// 6) El clic de WhatsApp se cuenta una vez.
await pg.goto('file://' + join(RAIZ, 'p', FICHA));
await pg.waitForTimeout(300);
ctx.__escrituras.length = 0;
await pg.evaluate(() => {
    const a = document.getElementById('tmWa');
    a.removeAttribute('target'); a.setAttribute('href', 'javascript:void 0');
    a.click(); a.click();
});
await pg.waitForTimeout(300);
const clics = ctx.__escrituras.filter(u => u.includes('/analytics/whatsapp/')).length;
ok(clics === 1, `dos clics contaron ${clics} veces (debe ser 1)`);
await ctx.close();

// 7) Las rutas son las del resto del sitio, con el id del producto.
ok(fb.escrituras.some(u => u === `/analytics/vistas/${ID}/count.json`),
   'la vista del producto no fue a /analytics/vistas/<id>/count.json');
ok(fb.escrituras.some(u => u === '/analytics/visitas/count.json'),
   'la visita general no se contó');

await navegador.close();

if (fallos.length) {
    console.error('❌ ' + fallos.length + ' fallo(s):');
    fallos.forEach(f => console.error('   · ' + f));
    process.exit(1);
}
console.log('✅ contador de las fichas /p/: 7 comprobaciones OK');
