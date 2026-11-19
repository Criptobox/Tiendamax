/* «¿Te sirvió?» en el chat de Max, lo que el dueño le enseña, y el panel 🤖 Max.
 *
 * Todo esto falla sin errores:
 *  · el voto apuntado a una clave distinta de la pregunta no se cruza nunca
 *    en el panel («0 👎» con clientes enfadados);
 *  · una fila de opinión en un saludo o en «no te entendí» es ruido;
 *  · lo enseñado que no se aplica se ve igual que lo que sí;
 *  · el panel que no puede leer las opiniones y pinta «sin opiniones» dice
 *    algo que no sabe;
 *  · deshacer sin lápida vuelve a aparecer desde el otro teléfono.
 *
 * Firebase de mentira en /fakedb (apunta lo que se escribe); auth.js
 * sustituido con una sesión. Se corre solo y desde test_max_panel.py.
 */
import { readFile } from 'node:fs/promises';
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

const CATALOGO = JSON.parse(await readFile(join(RAIZ, 'productos.json'), 'utf8'));
const PRODS = CATALOGO.productos || CATALOGO;
const NANO = PRODS.find(p => /nanostation m5 loco/i.test(p.nombre));
if (!NANO) { console.log('falta la NanoStation M5 Loco en el catálogo — se salta'); process.exit(0); }

const AHORA = Date.now();
const FAQ = {
  'tienen_bateria_para_moto': { query: 'tienen bateria para moto', intent: 'desconocido', count: 5, lastUpdated: AHORA - 3600e3, lastResponse: 'no te entendí' },
  'a_como_esta_el_dolar': { query: 'a como esta el dolar', intent: 'tasa', count: 2, lastUpdated: AHORA - 7200e3, lastResponse: 'La tasa de hoy es 1 USD = 955 MN' },
  'hacen_envios_a_playa': { query: 'hacen envios a playa', intent: 'envios', count: 9, lastUpdated: AHORA - 1800e3, lastResponse: 'Envío a Playa (La Habana)' },
  '__prueba_del_panel': { query: 'prueba', intent: 'prueba', count: 1, lastUpdated: AHORA },
};
const OPS = {
  'a_como_esta_el_dolar': { a: { v: -1, m: 'Información incorrecta', ts: AHORA - 3600e3 }, b: { v: -1, m: 'Información incorrecta', ts: AHORA - 3000e3 } },
  'hacen_envios_a_playa': { c: { v: 1, ts: AHORA - 1000e3 }, d: { v: 1, ts: AHORA - 900e3 }, e: { v: 1, ts: AHORA - 800e3 } },
};
const BUS = { 'panel%20solar%20flexible': { count: 6 }, 'router': { count: 30 } };
const escritos = [];

const AUTH_FALSO = `window.TMAuth={
  init:function(){return new Promise(function(r){setTimeout(r,200);});},
  usuario:function(){return {uid:'u1',email:'a@b.c'};},
  alCambiar:function(f){try{f(this.usuario());}catch(e){}},
  entrar:async function(){return{ok:false};}, crearCuenta:async function(){return{ok:false};},
  recuperar:async function(){return{ok:false};}, salir:async function(){}, token:async function(){return 'tk';},
  estadoDueno:async function(){return{};}, diagnostico:async function(){return{pasos:[]};}, reclamar:async function(){return{ok:false};},
  fetchPrivado:function(path){ if(window.__opsRotas) return Promise.resolve({ok:false,msg:'Firebase rechazó la petición'});
    return fetch('/fakedb'+path).then(function(r){return r.json();}).then(function(d){return {ok:true,dato:d};}); },
  rtdb:function(){return '';}
};`;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
let ENSENADO_SERVIDO = { ensenado: {}, demanda: {}, resueltas: {} };
const servidor = createServer(async (q, r) => {
  const camino = decodeURIComponent(q.url.split('?')[0]);
  if (camino.startsWith('/fakedb/')) {
    let cuerpo = ''; for await (const c of q) cuerpo += c;
    if (q.method !== 'GET') escritos.push({ m: q.method, ruta: camino, cuerpo: cuerpo ? JSON.parse(cuerpo) : null });
    const datos = { '/fakedb/agente/faq.json': FAQ, '/fakedb/agente/opiniones.json': OPS, '/fakedb/analytics/busquedas.json': BUS }[camino];
    r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(q.method === 'GET' ? (datos || null) : { name: 'x' })); return;
  }
  if (camino === '/js/auth.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); r.end(AUTH_FALSO); return; }
  if (camino === '/max-aprendido.json') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(ENSENADO_SERVIDO)); return; }
  if (camino === '/config.json') {
    const c = JSON.parse(await readFile(join(RAIZ, 'config.json'), 'utf8'));
    c.firebaseConfig = Object.assign({}, c.firebaseConfig, { databaseURL: `http://localhost:${PUERTO}/fakedb` });
    r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(c)); return;
  }
  try {
    const ruta = camino === '/' ? '/index.html' : camino;
    let cuerpo = await readFile(normalize(join(RAIZ, ruta)));
    // Sin `apagadas`: lo que se prueba es cómo Max aplica lo enseñado, no qué
    // categoría tiene apagada hoy el dueño (el día que apagó WIFI la NanoStation
    // desapareció de la tienda —bien hecho— y esta prueba se puso roja sin romperse nada).
    if (ruta.endsWith('categorias.json')) { const c = JSON.parse(cuerpo); delete c.apagadas; cuerpo = JSON.stringify(c); }
    r.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' }); r.end(cuerpo);
  } catch (e) { r.writeHead(404); r.end(); }
}).listen(0);
const PUERTO = servidor.address().port;

const fallos = []; let comprobaciones = 0;
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };
const errores = [];
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function contexto() {
  const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 400, height: 860 } });
  await ctx.route(u => u.hostname !== 'localhost', r => r.abort());
  await ctx.addInitScript(([puerto, cat]) => {
    localStorage.setItem('firebaseConfig', JSON.stringify({ apiKey: 'x', projectId: 'p', databaseURL: `http://localhost:${puerto}/fakedb` }));
    if (!localStorage.getItem('productos')) localStorage.setItem('productos', JSON.stringify(cat));
    window.__abiertos = []; window.open = u => { window.__abiertos.push(String(u)); return {}; };
  }, [PUERTO, PRODS]);
  return ctx;
}
async function preguntar(pg, texto) {
  await pg.fill('#tmBotInput', texto); await pg.click('#tmBotSend');
  await pg.waitForFunction(() => !document.getElementById('tmBotTyping') && !document.getElementById('tmBotSend').disabled, null, { timeout: 15000 });
  await pg.waitForTimeout(150);
}

// ── 1) El chat: «¿Te sirvió?», el voto y lo enseñado ──
{
  ENSENADO_SERVIDO = { ensenado: { 'nano loco': { id: NANO.id, ts: AHORA } }, demanda: {}, resueltas: {} };
  const ctx = await contexto();
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errores.push('chat: ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  await pg.click('#tmBotBubble');
  await pg.waitForFunction(() => window._tmBot && typeof window._tmBot.claveFAQ === 'function', null, { timeout: 20000 });
  await pg.waitForTimeout(800);

  // La bienvenida: cuatro botones, la caja de regalo y las rebajas
  ok((await pg.$$('.tmb-bienv .tmb-int')).length === 4, 'la bienvenida trae los cuatro botones grandes');
  ok(!!(await pg.$('.tmb-bienv .tmb-regalo')), 'con la campaña encendida sale la caja de la Tarjeta TiendaMax');
  const reb = await pg.$$eval('.tmb-mini .tmb-st', xs => xs.map(x => x.className + '|' + x.textContent));
  ok(reb.every(r => (/ ok\|● \d+ disponibles/.test(r)) || (/ am\|● Quedan [1-5]$/.test(r))), `rebajas con el color de stock correcto: ${reb.join(' ; ')}`);
  await pg.click('.tmb-bienv .tmb-regalo');
  await pg.waitForFunction(() => !document.getElementById('tmBotTyping') && document.querySelector('.tmb-regalo-det'), null, { timeout: 15000 });
  const det = await pg.$eval('.tmb-regalo-det', e => e.textContent);
  ok(/Desde \$25.*−500 MN.*Desde \$45.*−1\.000 MN/.test(det) && /próximas 3 compras/.test(det) && /hasta 2/.test(det), `la explicación de la tarjeta, con los tramos de verdad: ${det.slice(0, 300)}`);
  const ints = await pg.evaluate(() => ['cómo funciona la tarjeta tiendamax', 'si recomiendo a un amigo que gano', 'puedo pagar con tarjeta', 'tienen tarjeta de playstation']
    .map(q => window._tmBot.detectIntent(q)));
  ok(ints[0] === 'tarjeta' && ints[1] === 'tarjeta', `preguntar por la tarjeta o los referidos lleva a la explicación: ${ints}`);
  ok(ints[2] === 'pago' && ints[3] !== 'tarjeta', `«pagar con tarjeta» es pago y una tarjeta regalo es un producto: ${ints}`);

  await preguntar(pg, 'hola');
  ok(!(await pg.$('.tm-bot-opina')), 'un saludo no pide opinión');

  await preguntar(pg, 'quiero un router para la casa');
  const fila = await pg.$('.tm-bot-opina');
  ok(!!fila, 'una respuesta que contesta algo tiene que preguntar «¿Te sirvió?»');
  const clave = await pg.evaluate(() => window._tmBot.claveFAQ('quiero un router para la casa'));
  await pg.click('.tm-bot-opina button[data-v="-1"]');
  await pg.click('.tm-bot-opina button[data-m="No era lo que buscaba"]');
  await pg.waitForTimeout(400);
  const voto = escritos.find(e => e.ruta === `/fakedb/agente/opiniones/${clave}.json`);
  ok(voto && voto.m === 'POST' && voto.cuerpo.v === -1 && voto.cuerpo.m === 'No era lo que buscaba' && voto.cuerpo.ts && voto.cuerpo.ts['.sv'] === 'timestamp',
     `el 👎 tiene que llegar a /agente/opiniones/<misma clave que la pregunta> con su motivo: ${JSON.stringify(escritos.slice(-3))}`);
  const faqDeEsa = escritos.find(e => e.ruta === `/fakedb/agente/faq/${clave}.json`);
  ok(!!faqDeEsa, 'la pregunta y el voto tienen que usar la misma clave');
  ok(Object.keys(voto ? voto.cuerpo : {}).every(k => ['v', 'm', 'ts'].includes(k)), 'el voto no lleva nada más que v, m y ts');

  await preguntar(pg, 'otra cosa: hacen envios a playa?');
  ok((await pg.$$('.tm-bot-opina')).length === 1, 'solo la última respuesta lleva la fila de opinión');
  await pg.click('.tm-bot-opina button[data-v="-1"]');
  await pg.click('.tm-bot-opina button[data-m="Prefiero una persona"]');
  ok((await pg.evaluate(() => window.__abiertos.slice(-1)[0] || '')).includes('wa.me'), '«Prefiero una persona» abre WhatsApp');

  const ens = await pg.evaluate(async () => {
    const r = window._tmBot.responder('cuanto cuesta el nano loco');
    return String(r.response || '') + ' || ' + (r.products || []).map(p => p.nombre).join('|');
  });
  ok(/NanoStation M5 Loco/i.test(ens), `lo enseñado («nano loco» → NanoStation M5 Loco) tiene que aplicarse: ${ens.slice(0, 300)}`);
  await ctx.close();
}

// ── 1b) Con la campaña apagada, Max no anuncia la tarjeta ──
{
  const ctx = await contexto();
  await ctx.addInitScript(() => localStorage.setItem('tm_tarjeta_campana', JSON.stringify({ on: false, ts: 1 })));
  await ctx.route(u => /\/config\.json/.test(u.pathname), async r => {
    const c = JSON.parse(await readFile(join(RAIZ, 'config.json'), 'utf8'));
    c.firebaseConfig = Object.assign({}, c.firebaseConfig, { databaseURL: `http://localhost:${PUERTO}/fakedb` });
    c.tarjeta = { on: false, ts: 1 };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errores.push('campaña: ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  await pg.click('#tmBotBubble');
  await pg.waitForFunction(() => window._tmBot && document.querySelector('.tmb-bienv'), null, { timeout: 20000 });
  ok(!(await pg.$('.tmb-bienv .tmb-regalo')), 'con la campaña apagada no sale la caja de regalo');
  const r = await pg.evaluate(() => String(window._tmBot.responder('como funciona la tarjeta tiendamax').response || ''));
  ok(/no tengo una promoción de tarjeta activa/.test(r) && !/−500/.test(r), `apagada, no se promete ningún descuento: ${r.slice(0, 160)}`);
  await ctx.close();
}

// ── 2) El panel 🤖 Max ──
{
  ENSENADO_SERVIDO = { ensenado: {}, demanda: {}, resueltas: {} };
  const ctx = await contexto();
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errores.push('panel: ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${PUERTO}/admin.html#max`);
  await pg.waitForFunction(() => typeof window.maxCargar === 'function' && Array.isArray(window.PRODUCTOS) && window.PRODUCTOS.length > 0, null, { timeout: 25000 });
  await pg.evaluate(() => window.maxCargar());
  await pg.waitForFunction(() => window.tmMaxPanel && window.tmMaxPanel.datos.listo, null, { timeout: 15000 });
  const t = await pg.evaluate(() => document.getElementById('max-cont').textContent);
  ok(/bateria para moto/.test(t) && /no entendió/.test(t), `«Por arreglar» tiene que traer lo que Max no entendió: ${t.slice(0, 400)}`);
  ok(/a como esta el dolar/.test(t) && /Información incorrecta/.test(t), 'y lo que recibió 👎, con su motivo');
  ok(!/prueba del panel|__prueba/.test(t), 'la clave de prueba no es una pregunta');
  ok(/60%/.test(t) && /3 👍 · 2 👎/.test(t), `el porcentaje sale de los votos (3 de 5): ${(t.match(/\d+%[^·]*/) || [''])[0]}`);
  ok(/panel solar flexible/.test(t), 'lo que buscan y no hay en el catálogo va en «Lo que buscan y no tienes»');
  // «router»: está en el catálogo pero agotado → demanda marcada como agotada, no como «no lo tienes».
  const lineaRouter = (t.match(/«router»[^«]*/) || [''])[0];
  ok(!lineaRouter || /agotado/.test(lineaRouter), `lo que tienes en el catálogo no se presenta como «no lo tienes»: ${lineaRouter}`);

  // Enseñar: abrir, buscar, elegir
  await pg.evaluate(() => maxAbrirEnsenar('tienen_bateria_para_moto'));
  await pg.fill('#max-ens-tienen_bateria_para_moto .max-frase', 'nano loco');
  await pg.fill('#max-ens-tienen_bateria_para_moto .max-busq', 'nanostation m5 loco');
  await pg.evaluate(() => maxBuscar('tienen_bateria_para_moto'));
  const cand = await pg.$$eval('#max-ens-tienen_bateria_para_moto .max-cand b', bs => bs.map(b => b.textContent));
  ok(cand.length && /NanoStation M5 Loco/i.test(cand[0]), `el buscador tiene que proponer el modelo exacto primero: ${cand.join(' | ')}`);
  await pg.click('#max-ens-tienen_bateria_para_moto .max-cand');
  const apr = await pg.evaluate(() => JSON.parse(JSON.stringify(window.tmMaxPanel.aprendido)));
  ok(apr.ensenado['nano loco'] && String(apr.ensenado['nano loco'].id) === String(NANO.id), `enseñar tiene que guardar frase → producto: ${JSON.stringify(apr.ensenado)}`);
  ok(apr.resueltas['tienen_bateria_para_moto'], 'y dar la pregunta por resuelta');
  await pg.waitForTimeout(4600);   // se intenta guardar en la tienda 4 s después del toque
  const t2 = await pg.evaluate(() => document.getElementById('max-cont').textContent);
  ok(!/bateria para moto/.test(t2.split('Lo que buscan')[0]), 'resuelta, sale de «Por arreglar»');
  ok(/«nano loco» → NanoStation M5 Loco/i.test(t2), 'aparece en «Lo que le enseñaste»');
  ok(/Sin token de GitHub/.test(t2), 'sin token, dice que solo vale en este teléfono');
  ok(JSON.parse(await pg.evaluate(() => localStorage.getItem('tm_max_aprendido'))).ensenado['nano loco'], 'se guarda en el teléfono al momento');

  // Deshacer deja lápida, y la fusión gana por ts
  await pg.evaluate(() => maxDesensenar('nano loco'));
  const fus = await pg.evaluate(() => {
    const a = window.tmMaxPanel.aprendido;
    const viejo = { ensenado: { 'nano loco': { id: 1, ts: 1 } }, demanda: {}, resueltas: {} };
    return { lap: a.ensenado['nano loco'], gana: window.tmMaxPanel.fusionar(viejo, a).ensenado['nano loco'] };
  });
  ok(fus.lap && fus.lap.borrado, 'deshacer deja lápida');
  ok(fus.gana && fus.gana.borrado, 'la lápida más nueva gana a la enseñanza vieja del otro teléfono');

  // Sin poder leer las opiniones, no se dice «sin opiniones»
  await pg.evaluate(async () => { window.__opsRotas = true; await window.maxCargar(); });
  const t3 = await pg.evaluate(() => document.getElementById('max-cont').textContent);
  ok(/opiniones: Firebase rechazó/.test(t3), `si no se pueden leer las opiniones hay que decirlo: ${(t3.match(/—[^%]{0,80}/) || [''])[0]}`);
  await ctx.close();
}

const propios = errores.filter(e => !/firebase is not defined|Failed to fetch|NetworkError/i.test(e));
ok(propios.length === 0, 'errores de JavaScript: ' + propios.join(' | '));
await nav.close(); servidor.close();
if (fallos.length) { console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - ')); process.exit(1); }
console.log(`✅ ${comprobaciones} comprobaciones del «¿Te sirvió?» y del panel de Max en regla.`);
