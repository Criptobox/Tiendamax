/* Worker de Max IA: validación de lo que dice el modelo, respaldo entre
 * proveedores, origen y límite. Se importa el worker tal cual y se le pasa un
 * fetch falso: no sale nada a la red. */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = await import(pathToFileURL(join(RAIZ, 'mini-services/max-ia/worker.js')).href);
const worker = W.default;
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };

const CAT = [['1', 'Cargador de batería 30A'], ['2', 'Router MikroTik hAP ac3'], ['3', 'Aceite 5W30']];
const ids = new Set(['1', '2', '3']);

// ── validarRespuesta: el modelo no puede colar ids ni texto raro ──
let v = W.validarRespuesta('```json\n{"consulta":"cargador de batería","ids":["1","99","1","x"],"fuera":false}\n```', ids);
ok(v && JSON.stringify(v.ids) === '["1"]', 'solo ids de la lista, sin repetir: ' + JSON.stringify(v));
ok(W.validarRespuesta('no sé', ids) === null, 'texto sin JSON → null');
v = W.validarRespuesta('{"consulta":"<script>alert(1)</script> router","ids":[],"fuera":true}', ids);
ok(v && !/[<>]/.test(v.consulta) && v.fuera === true, 'la consulta se limpia: ' + JSON.stringify(v));
v = W.validarRespuesta(JSON.stringify({ consulta: 'x'.repeat(500), ids: ['1', '2', '3', '1'] }), ids);
ok(v.consulta.length <= 80 && v.ids.length <= 3, 'acotado');
ok(W.validarEntrada({ q: 'a', cat: CAT }) === null && W.validarEntrada({ q: 'hola', cat: [] }) === null && W.validarEntrada(null) === null, 'entrada inválida se rechaza');

// ── fetch falso por proveedor ──
let llamadas = [];
let modo = {};   // proveedor → 'ok' | 'caido' | 'basura'
globalThis.fetch = async (url, init) => {
  const prov = url.includes('openrouter') ? 'openrouter' : url.includes('googleapis') ? 'gemini' : 'nvidia';
  llamadas.push(prov);
  const m = modo[prov] || 'caido';
  if (m === 'caido') return new Response('x', { status: 500 });
  const texto = m === 'basura' ? 'lo siento, no puedo' : '{"consulta":"cargador de batería","ids":["1"],"fuera":false}';
  if (prov === 'gemini') return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 });
  return new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }), { status: 200 });
};
const pedir = async (env, { origen = 'https://tiendamax.org', body, ip = '1.1.1.1', metodo = 'POST' } = {}) => {
  const r = await worker.fetch(new Request('https://w.test/', { method: metodo, headers: { 'Origin': origen, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: metodo === 'POST' ? JSON.stringify(body || { q: 'algo pa cargar la bateria', cat: CAT }) : undefined }), env, {});
  return { status: r.status, json: await r.json().catch(() => null), cors: r.headers.get('Access-Control-Allow-Origin') };
};
const ENV = { OPENROUTER_API_KEY: 'a', GEMINI_API_KEY: 'b', NVIDIA_API_KEY: 'c' };

modo = { openrouter: 'ok' }; llamadas = [];
let r = await pedir(ENV);
ok(r.status === 200 && r.json.ok && r.json.via === 'openrouter' && llamadas.join() === 'openrouter', 'el primero que responde gana: ' + JSON.stringify([r.json, llamadas]));
ok(r.cors === 'https://tiendamax.org', 'CORS solo para tiendamax.org');

modo = { openrouter: 'caido', gemini: 'ok' }; llamadas = [];
r = await pedir(ENV, { ip: '2.2.2.2' });
ok(r.json.ok && r.json.via === 'gemini' && llamadas.join() === 'openrouter,gemini', 'si OpenRouter se cae salta a Gemini: ' + JSON.stringify([r.json, llamadas]));

modo = { openrouter: 'basura', gemini: 'caido', nvidia: 'ok' }; llamadas = [];
r = await pedir(ENV, { ip: '3.3.3.3' });
ok(r.json.ok && r.json.via === 'nvidia', 'una respuesta que no es JSON válido también salta al siguiente: ' + JSON.stringify([r.json, llamadas]));

modo = {}; r = await pedir(ENV, { ip: '4.4.4.4' });
ok(r.status === 503 && r.json.ok === false, 'todos caídos → 503 (el navegador sigue sin IA)');
r = await pedir({}, { ip: '5.5.5.5' });
ok(r.status === 503 && r.json.error === 'sin_claves', 'sin claves → 503 claro');

r = await pedir(ENV, { origen: 'https://malo.example', ip: '6.6.6.6' });
ok(r.status === 403 && !r.cors, 'otro origen → 403');
r = await pedir(ENV, { body: { q: '', cat: [] }, ip: '7.7.7.7' });
ok(r.status === 400, 'entrada inválida → 400');
r = await pedir(ENV, { metodo: 'GET', ip: '8.8.8.8' });
ok(r.status === 405, 'GET → 405');

modo = { openrouter: 'ok' };
let ultimo; for (let i = 0; i < 22; i++) ultimo = await pedir(ENV, { ip: '9.9.9.9' });
ok(ultimo.status === 429, 'pasado el límite por minuto → 429');

if (fallos.length) { console.error('❌ ' + fallos.join('\n - ')); process.exit(1); }
console.log('✅ Worker de Max IA: validación, respaldo, origen y límite.');
