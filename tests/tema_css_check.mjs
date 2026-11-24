/* La hoja del tema de temporada (css/tema-estacional.css, 9 KB comprimidos) ya no va en bundle.css:
 * solo se pide cuando hay tema, y siempre DESPUÉS del bundle (la cascada no cambia).
 *  · sin tema (fuera de temporada, o ?tema=no) no se descarga;
 *  · con tema al abrir (?tema=navidad) se pide una vez, tras el bundle, y se aplica;
 *  · si el tema se enciende cuando llega config.json, también se pide (y una sola vez);
 *  · bundle.css no lleva ninguna regla de html[data-tema]. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); }
catch (e2) { console.log('playwright no disponible — se salta'); process.exit(0); } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const CONFIG_BASE = JSON.parse(await readFile(join(RAIZ, 'config.json'), 'utf8'));
let configServida = CONFIG_BASE;
const servidor = createServer(async (q, r) => {
  const c = decodeURIComponent(q.url.split('?')[0]);
  if (c === '/config.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(configServida)); return; }
  try { const ruta = c === '/' ? '/index.html' : c; r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(await readFile(normalize(join(RAIZ, ruta)))); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const BASE = `http://localhost:${servidor.address().port}`;
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
const nav = await chromium.launch();

async function abrir(url, config) {
  configServida = config || CONFIG_BASE;
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  const pedidos = []; pg.on('request', r => { const u = r.url(); if (/\/css\/(bundle|tema-estacional)\.css/.test(u)) pedidos.push(u.replace(/^.*\/css\//, 'css/').split('?')[0]); });
  await pg.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 0, null, { timeout: 20000 });
  await pg.waitForTimeout(2500);
  const r = { pedidos, errs,
    tema: await pg.evaluate(() => document.documentElement.getAttribute('data-tema')),
    hojas: await pg.evaluate(() => [...document.styleSheets].map(s => (s.href || '').replace(/^.*\/css\//, 'css/').split('?')[0]).filter(Boolean)) };
  await ctx.close(); return r;
}
// ── sin tema ──
let r = await abrir('/?tema=no');
ok(!r.pedidos.includes('css/tema-estacional.css'), `sin tema no se descarga la hoja: ${JSON.stringify(r.pedidos)}`);
ok(r.pedidos.includes('css/bundle.css') && r.tema === null, 'el bundle sí, y sin data-tema');
// ── con tema al abrir ──
r = await abrir('/?tema=navidad');
ok(r.tema === 'navidad', 'tema navidad aplicado');
ok(r.pedidos.filter(x => x === 'css/tema-estacional.css').length === 1, `la hoja del tema se pide UNA vez: ${JSON.stringify(r.pedidos)}`);
ok(r.pedidos.indexOf('css/bundle.css') >= 0 && r.pedidos.indexOf('css/bundle.css') < r.pedidos.indexOf('css/tema-estacional.css'), 'y después del bundle');
ok(r.hojas.indexOf('css/bundle.css') < r.hojas.indexOf('css/tema-estacional.css') && r.hojas.includes('css/tema-estacional.css'), `en el árbol, detrás del bundle: ${JSON.stringify(r.hojas)}`);
// ── el tema se enciende al llegar config.json ──
r = await abrir('/', Object.assign({}, CONFIG_BASE, { tema: { modo: 'halloween', ts: Date.now() } }));
ok(r.tema === 'halloween', `config.json enciende el tema: ${r.tema}`);
ok(r.pedidos.filter(x => x === 'css/tema-estacional.css').length === 1, `y entonces se pide la hoja (una vez): ${JSON.stringify(r.pedidos)}`);
ok(r.hojas.includes('css/tema-estacional.css') && r.hojas.indexOf('css/bundle.css') < r.hojas.indexOf('css/tema-estacional.css'), 'detrás del bundle');
// ── el bundle no lleva el tema ──
const bundle = await readFile(join(RAIZ, 'css', 'bundle.css'), 'utf8');
ok(!/\[data-tema/.test(bundle), 'bundle.css no lleva reglas de [data-tema]');
await nav.close(); servidor.close();
if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ La hoja del tema solo se pide con tema y va después del bundle.');
