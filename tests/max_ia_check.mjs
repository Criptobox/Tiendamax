/* Max + IA: la IA solo INTERPRETA lo que Max no entendió.
 *  · sin <meta tm-bot-ia> no se llama a nada y Max contesta como siempre;
 *  · un mensaje que Max no entiende y la IA traduce a UN producto → su ficha real
 *    (precio y stock del catálogo, no del modelo);
 *  · un id que no está en el catálogo (modelo que alucina) se ignora;
 *  · si el servicio falla, Max conserva su respuesta; dos fallos lo apagan;
 *  · al servicio solo viajan el texto y los nombres del catálogo;
 *  · lo que Max ya entiende no gasta una consulta. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }

const LITE = JSON.parse(readFileSync(join(RAIZ, 'productos-lite.json'), 'utf8'));
const CATS = JSON.parse(readFileSync(join(RAIZ, 'categorias.json'), 'utf8')); delete CATS.apagadas;
const OBJ = LITE.find(p => Number(p.stock) > 0 && !p.digital && p.moneda !== 'MN' && /defender 10w/i.test(p.nombre));
if (!OBJ) { console.log('falta producto de prueba — se salta'); process.exit(0); }
const NOMBRE = OBJ.nombre.split('|')[0].trim();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const URL_IA = 'https://max-ia.test.workers.dev/';
let conMeta = true;
const servidor = createServer(async (q, r) => {
  const c = decodeURIComponent(q.url.split('?')[0]);
  if (c === '/categorias.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(CATS)); return; }
  try {
    const ruta = c === '/' ? '/index.html' : c;
    let b = await readFile(normalize(join(RAIZ, ruta)));
    if (ruta === '/index.html') b = Buffer.from(b.toString('utf8').replace('<meta name="tm-bot-ia" content="">', conMeta ? `<meta name="tm-bot-ia" content="${URL_IA}">` : '<meta name="tm-bot-ia" content="">'));
    r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(b);
  } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();

async function abrir(respuestaIA) {
  const llamadas = [];
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(u => u.hostname === 'max-ia.test.workers.dev', async r => {
    const cuerpo = JSON.parse(r.request().postData() || '{}'); llamadas.push(cuerpo);
    const x = respuestaIA(cuerpo, llamadas.length);
    if (x === 'caido') return r.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":false}' });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(x) });
  });
  await ctx.route(u => !['localhost', 'max-ia.test.workers.dev'].includes(u.hostname), r => r.abort());
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(`http://localhost:${servidor.address().port}/`, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0, null, { timeout: 15000 });
  await pg.click('#tmBotBubble');
  await pg.waitForFunction(() => window._tmBotCerebroListo === true, null, { timeout: 15000 });
  const preguntar = async q => {
    await pg.evaluate(() => { window._tmBot.context && (window._tmBot.context.lastProduct = null); });
    await pg.fill('#tmBotInput', q); await pg.click('#tmBotSend');
    await pg.waitForFunction(() => !document.querySelector('.tm-bot-typing'), null, { timeout: 12000 }).catch(() => {});
    await pg.waitForTimeout(1800);
    return pg.evaluate(() => {
      const cu = document.getElementById('tmBotBody'); const h = [...cu.children]; let i = h.length - 1;
      while (i >= 0 && !(h[i].classList.contains('tm-bot-msg') && h[i].classList.contains('user'))) i--;
      return h.slice(i + 1).map(x => x.innerText || '').join(' ').replace(/\s+/g, ' ').trim();
    });
  };
  return { ctx, pg, llamadas, preguntar, errs };
}
const RARA = 'zxqv wkjh plmn tgbn';

// ── 1. Sin meta: ni una llamada, Max igual que siempre ──
conMeta = false;
{ const t = await abrir(() => ({ ok: true, consulta: '', ids: [], fuera: false }));
  const a = await t.preguntar(RARA);
  ok(t.llamadas.length === 0, 'sin <meta tm-bot-ia> no se llama al servicio');
  ok(/no te entend/i.test(a), 'sin IA Max dice lo de siempre: ' + a.slice(0, 120));
  await t.ctx.close(); }
conMeta = true;

// ── 2. La IA traduce a un producto real: sale SU ficha del catálogo ──
{ const t = await abrir(c => ({ ok: true, consulta: 'aceite 10w40', ids: [String(OBJ.id)], fuera: false, via: 'x' }));
  const a = await t.preguntar(RARA);
  ok(t.llamadas.length === 1, 'se consultó una vez: ' + t.llamadas.length);
  const env = t.llamadas[0] || { cat: [] };
  ok(env.q === RARA && Array.isArray(env.cat) && env.cat.length > 20, 'viaja el texto y la lista del catálogo');
  ok(Object.keys(env).sort().join() === 'cat,q', 'y NADA más (sin datos del cliente): ' + Object.keys(env).join());
  ok(env.cat.every(x => x.length === 2 && !/@|\d{8}/.test(x[1])), 'la lista solo lleva [id, nombre]');
  ok(a.includes(NOMBRE.slice(0, 20)) && /Entend[ií] que buscas/i.test(a), 'enseña el producto interpretado: ' + a.slice(0, 200));
  ok(new RegExp(String(Math.round(Number(OBJ.precioActual)))).test(a), 'con el precio del catálogo, no del modelo: ' + a.slice(0, 260));
  const reps = await t.preguntar(RARA);
  ok(t.llamadas.length === 1, 'la misma frase no gasta otra consulta (cache)');
  ok(t.errs.length === 0, 'sin errores de página: ' + JSON.stringify(t.errs));
  await t.ctx.close(); }

// ── 3. El modelo alucina un id: se ignora, Max conserva su respuesta ──
{ const t = await abrir(() => ({ ok: true, consulta: '', ids: ['id-que-no-existe'], fuera: false }));
  const a = await t.preguntar(RARA);
  ok(/no te entend/i.test(a) && !/Entend[ií] que buscas/i.test(a), 'un id inventado no produce nada: ' + a.slice(0, 160));
  await t.ctx.close(); }

// ── 4. «fuera»: no se fuerza ningún producto ──
{ const t = await abrir(() => ({ ok: true, consulta: '', ids: [], fuera: true }));
  const a = await t.preguntar('zxqv una pizza wkjh');
  ok(!/Entend[ií] que buscas/i.test(a), 'si no es de la tienda no se inventa un producto: ' + a.slice(0, 160));
  await t.ctx.close(); }

// ── 5. Servicio caído: Max conserva su respuesta; dos fallos lo apagan ──
{ const t = await abrir(() => 'caido');
  const a = await t.preguntar(RARA);
  ok(/no te entend/i.test(a), 'con el servicio caído Max contesta lo de siempre: ' + a.slice(0, 120));
  await t.preguntar('zxqv wkjh dos');
  await t.preguntar('zxqv wkjh tres');
  ok(t.llamadas.length === 2, 'tras dos fallos seguidos deja de insistir: ' + t.llamadas.length);
  ok(t.errs.length === 0, 'sin errores de página: ' + JSON.stringify(t.errs));
  await t.ctx.close(); }

// ── 6. Lo que Max ya entiende no gasta consulta ──
{ const t = await abrir(() => ({ ok: true, consulta: '', ids: [], fuera: false }));
  await t.preguntar(NOMBRE);
  await t.preguntar('hola');
  ok(t.llamadas.length === 0, 'un producto nombrado o un saludo no consultan la IA: ' + t.llamadas.length);
  await t.ctx.close(); }

await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Max + IA: la IA solo interpreta y el catálogo contesta.');
