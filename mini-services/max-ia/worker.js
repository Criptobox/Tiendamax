/* Max IA — intérprete de preguntas para el chat de TiendaMax (Cloudflare Worker).
 *
 * La IA NO contesta al cliente: solo traduce lo que escribió al vocabulario del
 * catálogo. Recibe el texto y la lista de nombres de lo que hay a la venta y
 * devuelve {consulta, ids, fuera}. El texto, el precio y el stock que ve el
 * cliente salen del navegador y del catálogo real, nunca del modelo: así un
 * modelo que se equivoca solo puede señalar el producto equivocado, no inventar
 * un dato. Cada id se valida contra la lista recibida.
 *
 * Proveedores con respaldo en este orden (el primero que dé una respuesta
 * válida gana; si uno se cae o se pasa de límite, salta al siguiente):
 *   OPENROUTER_API_KEY → GEMINI_API_KEY → NVIDIA_API_KEY
 * Las claves son secretos del Worker (nunca en el repo ni en el navegador).
 */
const ORIGENES = ['https://tiendamax.org', 'https://www.tiendamax.org'];
const TIMEOUT_MS = 5000;
const MAX_Q = 200, MAX_CAT = 160, MAX_CONSULTA = 80, MAX_IDS = 3;
const LIMITE_POR_MIN = 20;

const PROVEEDORES = [
  { clave: 'OPENROUTER_API_KEY', nombre: 'openrouter',
    llamar: (env, msgs, senal) => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: senal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY, 'X-Title': 'TiendaMax Max' },
      body: JSON.stringify({ model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', messages: msgs, temperature: 0, max_tokens: 200 })
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('openrouter ' + r.status))).then(j => j.choices[0].message.content) },
  { clave: 'GEMINI_API_KEY', nombre: 'gemini',
    llamar: (env, msgs, senal) => fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (env.GEMINI_MODEL || 'gemini-2.0-flash') + ':generateContent', {
      method: 'POST', signal: senal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: msgs[0].content }] },
        contents: [{ role: 'user', parts: [{ text: msgs[1].content }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json' } })
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('gemini ' + r.status))).then(j => j.candidates[0].content.parts[0].text) },
  { clave: 'NVIDIA_API_KEY', nombre: 'nvidia',
    llamar: (env, msgs, senal) => fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST', signal: senal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.NVIDIA_API_KEY },
      body: JSON.stringify({ model: env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct', messages: msgs, temperature: 0, max_tokens: 200 })
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('nvidia ' + r.status))).then(j => j.choices[0].message.content) },
];

const SISTEMA = `Eres el intérprete de preguntas de una tienda cubana de tecnología, energía, hogar, carros y herramientas.
Un cliente escribió algo que el buscador de la tienda no entendió. Tu trabajo es SOLO traducirlo a lo que la tienda vende. NO contestes al cliente, NO des precios, NO inventes productos ni datos.
Recibes el mensaje y la lista de lo que hay a la venta como [id, nombre]. Responde únicamente con JSON de esta forma:
{"consulta": "frase corta con palabras de tienda", "ids": [ids de la lista], "fuera": false}
Reglas:
- "ids": hasta 3 ids de la lista que de verdad sirven para lo que pide el cliente, del más al menos adecuado. Si no estás seguro de que sirvan, deja [] (equivocarte es peor que no saber).
- "consulta": cómo se llamaría eso en un catálogo («cargador de batería», «planta eléctrica», «router wifi»), en español, sin marcas inventadas. Vacía "" si no es sobre un producto.
- "fuera": true solo si lo que pide claramente NO es algo que una tienda así venda (comida, medicinas, ropa, servicios...).
- Los modelos y cifras importan: m5 no es m2, 5W30 no es 10W40, 8 puertos no es 5 puertos. No mezcles.
- Nunca pongas en "ids" algo que no esté en la lista.`;

const _cuentas = new Map();
function _limitado(ip){
  const ahora = Date.now(), c = _cuentas.get(ip) || { t: ahora, n: 0 };
  if(ahora - c.t > 60000){ c.t = ahora; c.n = 0; }
  c.n++; _cuentas.set(ip, c);
  if(_cuentas.size > 2000) for(const [k, v] of _cuentas) if(ahora - v.t > 60000) _cuentas.delete(k);
  return c.n > LIMITE_POR_MIN;
}
function _cors(origen){
  const h = { 'Vary': 'Origin', 'Content-Type': 'application/json' };
  if(ORIGENES.includes(origen)){ h['Access-Control-Allow-Origin'] = origen; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Max-Age'] = '86400'; }
  return h;
}
const _json = (obj, status, origen) => new Response(JSON.stringify(obj), { status: status || 200, headers: _cors(origen) });

/** Valida lo que dice el modelo: JSON, ids dentro de la lista, textos acotados. Lo demás se descarta. */
export function validarRespuesta(bruto, idsValidos){
  let o;
  try {
    const m = String(bruto || '').match(/\{[\s\S]*\}/);
    o = JSON.parse(m ? m[0] : '');
  } catch(e){ return null; }
  if(!o || typeof o !== 'object') return null;
  const ids = (Array.isArray(o.ids) ? o.ids : []).map(String).filter((x, i, a) => idsValidos.has(x) && a.indexOf(x) === i).slice(0, MAX_IDS);
  const consulta = typeof o.consulta === 'string' ? o.consulta.replace(/[<>{}\[\]\n\r]/g, ' ').trim().slice(0, MAX_CONSULTA) : '';
  return { consulta, ids, fuera: o.fuera === true };
}
export function validarEntrada(b){
  if(!b || typeof b.q !== 'string' || !Array.isArray(b.cat)) return null;
  const q = b.q.trim().slice(0, MAX_Q);
  if(q.length < 2) return null;
  const cat = b.cat.slice(0, MAX_CAT).map(x => Array.isArray(x) ? [String(x[0]).slice(0, 24), String(x[1] || '').slice(0, 70)] : null).filter(x => x && x[0] && x[1]);
  if(!cat.length) return null;
  return { q, cat };
}

export default {
  async fetch(req, env, ctx){
    const origen = req.headers.get('Origin') || '';
    if(req.method === 'OPTIONS') return new Response(null, { status: 204, headers: _cors(origen) });
    if(req.method !== 'POST') return _json({ ok: false, error: 'metodo' }, 405, origen);
    if(!ORIGENES.includes(origen)) return _json({ ok: false, error: 'origen' }, 403, origen);
    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    if(_limitado(ip)) return _json({ ok: false, error: 'limite' }, 429, origen);
    let entrada;
    try { entrada = validarEntrada(await req.json()); } catch(e){ entrada = null; }
    if(!entrada) return _json({ ok: false, error: 'entrada' }, 400, origen);

    const idsValidos = new Set(entrada.cat.map(x => x[0]));
    const msgs = [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: 'Mensaje del cliente: ' + JSON.stringify(entrada.q) + '\nA la venta: ' + JSON.stringify(entrada.cat) }
    ];
    const activos = PROVEEDORES.filter(p => env[p.clave]);
    for(const p of activos){
      try {
        const bruto = await p.llamar(env, msgs, AbortSignal.timeout(TIMEOUT_MS));
        const v = validarRespuesta(bruto, idsValidos);
        if(v) return _json({ ok: true, via: p.nombre, ...v }, 200, origen);
      } catch(e){ /* se cayó o se pasó de límite: sigue el siguiente */ }
    }
    return _json({ ok: false, error: activos.length ? 'sin_respuesta' : 'sin_claves' }, 503, origen);
  }
};
