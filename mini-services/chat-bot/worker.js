/*
 * TiendaMax — Bot "Max" (chat) · Cloudflare Worker
 * ----------------------------------------------------------------------------
 * Versión de producción del backend del chat (reemplaza index.ts, que solo
 * corría en el sandbox con z-ai-web-dev-sdk).
 *
 * - Respuestas rápidas (saludos, cómo comprar, envíos, tasa, categorías,
 *   ofertas, FAQ…) se resuelven SIN LLM → instantáneas y gratis.
 * - Preguntas abiertas usan OpenRouter con modelos :free (fallback en cadena).
 * - El catálogo se lee de productos.json publicado (cache en memoria del isolate).
 *
 * Variables (Worker Settings → Variables and Secrets):
 *   OPENROUTER_API_KEY  (secret)  — key de https://openrouter.ai (modelos :free)
 *   WHATSAPP            (var, opc) — número de contacto. Default 5354320170
 *   SITE_URL           (var, opc) — default https://tiendamax.org
 *
 * KV opcional (binding "KV"): si está, guarda historial corto por sesión.
 *
 * Deploy:  cd mini-services/chat-bot && npx wrangler deploy
 * Secret:  npx wrangler secret put OPENROUTER_API_KEY
 * ----------------------------------------------------------------------------
 */

const DEFAULT_SITE = 'https://tiendamax.org';
const PRODS_URL = 'https://raw.githubusercontent.com/Criptobox/Tiendamax/main/productos.json';
const CATS_URL  = 'https://raw.githubusercontent.com/Criptobox/Tiendamax/main/categorias.json';
const CONFIG_URL = 'https://raw.githubusercontent.com/Criptobox/Tiendamax/main/config.json';

const FREE_MODELS = [
    'deepseek/deepseek-chat-v3:free',
    'deepseek/deepseek-r1:free',
    'google/gemini-2.0-flash-exp:free',
    'qwen/qwen3-30b-a3b:free',
    'meta-llama/llama-3.3-70b-instruct:free'
];

// ── Cache del catálogo en el isolate (TTL 5 min) ──
let _cache = { t: 0, productos: [], categorias: [], config: {} };
const CACHE_TTL = 5 * 60 * 1000;

async function cargarDatos() {
    if (Date.now() - _cache.t < CACHE_TTL && _cache.productos.length) return _cache;
    try {
        const [pr, cr, cfg] = await Promise.all([
            fetch(PRODS_URL).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch(CATS_URL).then(r => r.ok ? r.json() : { nombres: [] }).catch(() => ({ nombres: [] })),
            fetch(CONFIG_URL).then(r => r.ok ? r.json() : {}).catch(() => ({}))
        ]);
        const productos = Array.isArray(pr) ? pr : Object.values(pr || {});
        const categorias = Array.isArray(cr) ? cr : (cr.nombres || []);
        _cache = { t: Date.now(), productos, categorias, config: cfg || {} };
    } catch (e) {
        _cache.t = Date.now(); // no martillar en cada request
    }
    return _cache;
}

// ── Búsqueda local de productos (para sugerencias) ──
function buscarProductos(query, productos) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return productos
        .filter(p => {
            const nombre = (p.nombre || '').toLowerCase();
            const desc = (p.descripcion || '').toLowerCase();
            const cat = (p.categoria || '').toLowerCase();
            return nombre.includes(q) || desc.includes(q) || cat.includes(q);
        })
        .slice(0, 4)
        .map(p => ({
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precioActual || 0),
            categoria: p.categoria,
            stock: p.stock,
            imagen: p.imagen
        }));
}

// ── System prompt con contexto del catálogo ──
function buildSystemPrompt(data, whatsapp) {
    const { productos, categorias, config } = data;
    const tasa = config.tasaMN || 695;
    const categoriasStr = categorias.map(c => {
        const count = productos.filter(p => p.categoria === c).length;
        return `  • ${c} (${count} productos)`;
    }).join('\n');
    const prodsStr = productos.map(p => {
        const precio = Number(p.precioActual || 0).toFixed(2);
        const stock = p.stock || 0;
        const agotado = stock === 0 ? ' [AGOTADO]' : '';
        return `  [${p.id}] ${p.nombre} — $${precio} USD${agotado} (${p.categoria || 'General'}, stock ${stock})`;
    }).join('\n');

    return `Eres "Max", el asistente virtual de TiendaMax, una tienda online cubana.
Responde SIEMPRE en español, con tono amigable, cercano y cubano (puedes usar "asere", "compay", "dale" con moderación).
Sé CONCISO: respuestas cortas (máx 3-4 líneas) salvo que el usuario pida detalle.

TIENDA:
- Nombre: TiendaMax
- Es una tienda online cubana de tecnología, electrónica, energía, redes, motos, carros y más
- Pago: CONTRA ENTREGA (el cliente paga al recibir)
- Moneda: precios en USD, conversión a MN (pesos cubanos) con tasa ${tasa} MN = 1 USD
- Tasa actual: 1 USD = ${tasa} MN
- WhatsApp de contacto: ${whatsapp}
- Envíos: a domicilio en Cuba, coordinar por WhatsApp

CATÁLOGO (${productos.length} productos en ${categorias.length} categorías):
${categoriasStr}

PRODUCTOS (id | nombre | precio USD | categoría | stock):
${prodsStr}

REGLAS:
1. Si el usuario pregunta por un producto o tipo de producto, busca en el catálogo y recomienda productos específicos con su nombre real, precio en USD y MN.
2. Para convertir USD a MN: multiplica por ${tasa}. Ejemplo: $10 USD = ${10 * tasa} MN.
3. Si un producto está agotado, indícalo y sugiere alternativas.
4. Si preguntan cómo comprar, explica: "Toca el botón 'Pedir' en cualquier producto y se abre WhatsApp con tu pedido."
5. No inventes productos que no están en el catálogo.
6. Si no sabes algo, deriva a WhatsApp: "Para eso escríbenos por WhatsApp ${whatsapp}".
7. Si el usuario saluda, saluda de vuelta y ofrece ayuda.
8. Mantén respuestas cortas y útiles.`;
}

// ── Respuestas rápidas predefinidas (sin LLM, para 3G) ──
function respuestaRapida(message, data) {
    const { productos, categorias, config } = data;
    const m = message.toLowerCase().trim();
    if (/^(hola|buenas|saludos|hey|que bol[aá]|asere|dime)/.test(m)) {
        return { response: '¡Hola! Soy Max 🤖 Tu asistente de TiendaMax. ¿Qué buscas hoy? Puedo ayudarte con productos, precios, envíos o cómo comprar.', quickReplies: ['🔥 Ver ofertas', '📦 Categorías', '💬 WhatsApp', '❓ Cómo comprar'] };
    }
    if (/^(gracias|thanks|thx|mil gracias|muchas gracias)/.test(m)) {
        return { response: '¡De nada! 🙌 Aquí estoy si necesitas algo más. Dale, revisa el catálogo que hay cosas buenas.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(chao|adios|hasta luego|nos vemos|bye)/.test(m)) {
        return { response: '¡Chao! Que tengas buen día. Vuelve cuando quieras 🤖', quickReplies: [] };
    }
    if (/^(como comprar|como compro|como pido|como hago un pedido|como pedir)/.test(m) || m === 'cómo comprar') {
        return { response: '🛒 Es súper fácil:\n1. Navega el catálogo o busca tu producto\n2. Toca el botón "Pedir" en el producto\n3. Se abre WhatsApp con tu pedido listo\n4. Coordinas pago contra entrega y envío', quickReplies: ['📦 Ver productos', '💬 WhatsApp'] };
    }
    if (/(whatsapp|telefono|teléfono|contacto|numero|número)/.test(m)) {
        return { response: `💬 Nuestro WhatsApp es ${config._wa || '5354320170'}. Toca cualquier botón "Pedir" en un producto y se abre directo con tu pedido.`, quickReplies: ['📦 Ver productos'] };
    }
    if (/(envio|envíos|envios|entrega|domicilio|delivery)/.test(m)) {
        if (/(cuanto|cuánto|tarda|demora|tiempo|cuando|cuándo|llega)/.test(m)) {
            return { response: '🚚 El tiempo de entrega depende de tu ubicación:\n• La Habana: 1-2 días\n• Otras provincias: 2-5 días\nCoordina el detalle por WhatsApp.', quickReplies: ['💬 WhatsApp'] };
        }
        return { response: '🚚 Hacemos envíos a domicilio en toda Cuba. El costo se coordina por WhatsApp según tu ubicación. ¡Pago contra entrega!', quickReplies: ['💬 WhatsApp'] };
    }
    if (/(pago|pagar|tarjeta|transferencia|efectivo)/.test(m)) {
        return { response: '💵 Aceptamos pago CONTRA ENTREGA. Pagas al recibir el producto. Simple y seguro.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(tasa|dolar|dólar|usd|mn|peso|cambio|conversion)/.test(m)) {
        return { response: `💱 Tasa actual: 1 USD = ${config.tasaMN || 695} MN. Todos los precios están en USD; el botón de moneda (USD/MN) en el hero los convierte al instante.`, quickReplies: ['📦 Ver productos'] };
    }
    if (/(categoria|categorías|categorias|seccion|secciones|que tienen|que venden|que hay)/.test(m)) {
        const lista = categorias.map(c => { const count = productos.filter(p => p.categoria === c).length; return `• ${c} (${count})`; }).join('\n');
        return { response: `📦 Tenemos ${productos.length} productos en ${categorias.length} categorías:\n${lista}\n\n¿Cuál te interesa?`, quickReplies: categorias.slice(0, 4) };
    }
    if (/(oferta|ofertas|descuento|barato|rebaja|promocion)/.test(m)) {
        const ofertas = productos.filter(p => p.precioOriginal > 0 && p.precioOriginal > p.precioActual).slice(0, 4);
        if (ofertas.length === 0) return { response: '🔍 Ahora mismo no hay ofertas activas. Pero hay productos con buen precio en todas las categorías. ¿Qué buscas?', quickReplies: ['📦 Categorías'] };
        const lista = ofertas.map(p => `• ${p.nombre} — $${Number(p.precioActual).toFixed(2)} USD (era $${Number(p.precioOriginal).toFixed(2)})`).join('\n');
        return { response: `🔥 Ofertas actuales:\n${lista}\n\nToca cualquier producto para pedirlo.`, quickReplies: ['💬 WhatsApp'] };
    }
    if (/(garantia|garantía|warranty|garant)/.test(m)) {
        return { response: '🛡️ Sí, todos los productos tienen garantía. Si algo no funciona, escríbenos por WhatsApp y lo resolvemos. La garantía varía según el producto (pregunta por la del tuyo).', quickReplies: ['💬 WhatsApp', '📦 Ver productos'] };
    }
    if (/(devolucion|devolución|devolver|cambiar|return)/.test(m)) {
        return { response: '↩️ Aceptamos devoluciones dentro de 24 horas si el producto llega dañado o no corresponde a lo pedido. Escríbenos por WhatsApp para coordinar.', quickReplies: ['💬 WhatsApp'] };
    }
    if (/(donde.*estan|ubicacion|ubicación|dirección|direccion|donde.*quedan|local)/.test(m)) {
        return { response: '📍 TiendaMax es una tienda online. No tenemos local físico abierto al público. Todo se gestiona por WhatsApp y enviamos a tu puerta. 🚚', quickReplies: ['💬 WhatsApp', '📦 Ver productos'] };
    }
    if (/(horario|hora.*atienden|que.*hora|abierto|abren)/.test(m)) {
        return { response: '🕐 Atendemos de Lunes a Sábado, de 9:00am a 8:00pm (hora de Cuba). Puedes hacer pedidos online 24/7 y te respondemos en horario de atención.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(usado|usados|segunda mano|reacondicionado)/.test(m)) {
        const usados = productos.filter(p => p.usado === true || p.usado === 'true');
        if (usados.length > 0) return { response: `♻️ Sí, tenemos ${usados.length} producto(s) usado(s) en buen estado. Cada uno indica "♻️ Producto usado" en su descripción. Los usados tienen precio más bajo.`, quickReplies: ['📦 Ver productos'] };
        return { response: '♻️ Actualmente no tenemos productos usados en catálogo. Todos son nuevos.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(stock|disponible|disponibilidad|tienen.*en existencia|hay.*stock)/.test(m)) {
        const agotados = productos.filter(p => p.stock === 0).length;
        const disponibles = productos.length - agotados;
        return { response: `📦 Tenemos ${disponibles} productos disponibles y ${agotados} agotados. Cada producto muestra su stock en tiempo real. Si algo está agotado, toca "Avisarme cuando vuelva" y te notificamos.`, quickReplies: ['📦 Ver productos'] };
    }
    if (/(seguimiento|seguir.*pedido|donde.*pedido|estado.*pedido|mi pedido|rastrear)/.test(m)) {
        return { response: '📦 Puedes seguir tu pedido en tiempo real desde el link que te enviamos por WhatsApp al confirmar la venta. También lo encuentras en "Mis Pedidos" → "Seguir pedido".', quickReplies: ['💬 WhatsApp'] };
    }
    return null; // → usar LLM
}

// ── Llamada a OpenRouter con fallback de modelos gratis ──
async function llmOpenRouter(messages, apiKey, siteUrl) {
    let lastErr = '';
    for (const model of FREE_MODELS) {
        try {
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey,
                    'HTTP-Referer': siteUrl,
                    'X-Title': 'TiendaMax Bot Max'
                },
                body: JSON.stringify({ model, temperature: 0.6, max_tokens: 600, messages })
            });
            if (resp.ok) {
                const data = await resp.json();
                const txt = (data.choices?.[0]?.message?.content || '').trim();
                if (txt) return txt;
                lastErr = 'respuesta vacía';
            } else {
                const t = await resp.text().catch(() => '');
                lastErr = `HTTP ${resp.status} [${model}]`;
                // Si el modelo no existe/sin endpoints, probar el siguiente
                if (!(resp.status === 404 || /no endpoints|not found|model|rate/i.test(t))) break;
            }
        } catch (e) { lastErr = e.message; }
    }
    throw new Error(lastErr || 'OpenRouter no disponible');
}

// ── Handler del chat ──
async function handleChat(message, sessionId, env) {
    const data = await cargarDatos();
    const whatsapp = env.WHATSAPP || '5354320170';
    data.config._wa = whatsapp;

    // 1. Respuesta rápida (sin LLM)
    const rapida = respuestaRapida(message, data);
    if (rapida) {
        const productos = buscarProductos(message, data.productos);
        return { ...rapida, products: productos.length > 0 ? productos : undefined };
    }

    // 2. LLM (OpenRouter)
    if (!env.OPENROUTER_API_KEY) {
        const productos = buscarProductos(message, data.productos);
        return {
            response: productos.length > 0
                ? 'Mira, esto es lo que tengo relacionado 👇 Toca cualquiera para pedirlo, o escríbenos por WhatsApp para más ayuda.'
                : 'Puedo ayudarte con productos, precios, envíos, ofertas y cómo comprar. ¿Qué necesitas? Si es algo específico, escríbenos por WhatsApp.',
            products: productos.length > 0 ? productos : undefined,
            quickReplies: ['🔥 Ofertas', '📦 Categorías', '💬 WhatsApp', '❓ Cómo comprar']
        };
    }

    try {
        let history = [];
        if (env.KV && sessionId) {
            try { history = JSON.parse(await env.KV.get('chat:' + sessionId) || '[]'); } catch (e) {}
        }
        const messages = [
            { role: 'system', content: buildSystemPrompt(data, whatsapp) },
            ...history.slice(-8),
            { role: 'user', content: message }
        ];
        const response = await llmOpenRouter(messages, env.OPENROUTER_API_KEY, env.SITE_URL || DEFAULT_SITE);

        if (env.KV && sessionId) {
            history.push({ role: 'user', content: message }, { role: 'assistant', content: response });
            try { await env.KV.put('chat:' + sessionId, JSON.stringify(history.slice(-16)), { expirationTtl: 3600 }); } catch (e) {}
        }

        const productos = buscarProductos(message, data.productos);
        return { response, products: productos.length > 0 ? productos : undefined, quickReplies: ['📦 Ver productos', '💬 WhatsApp'] };
    } catch (e) {
        const productos = buscarProductos(message, data.productos);
        return {
            response: 'Tuve un problemita técnico ahora mismo 😅 Pero puedo mostrarte productos o puedes escribirnos por WhatsApp directo.',
            products: productos.length > 0 ? productos : undefined,
            quickReplies: ['💬 WhatsApp', '📦 Ver productos']
        };
    }
}

// ── Worker entrypoint ──
export default {
    async fetch(request, env) {
        const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        const url = new URL(request.url);
        const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

        if (url.pathname.endsWith('/health')) {
            const d = await cargarDatos();
            return json({ ok: true, productos: d.productos.length, categorias: d.categorias.length, llm: !!env.OPENROUTER_API_KEY });
        }

        if (request.method === 'POST') {
            let data;
            try { data = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
            const message = data && data.message;
            if (!message || typeof message !== 'string') return json({ error: 'message es requerido' }, 400);
            if (message.length > 2000) return json({ error: 'Mensaje demasiado largo' }, 413);
            const sid = data.sessionId || 'anon-' + Math.random().toString(36).slice(2);
            try {
                const result = await handleChat(message, sid, env);
                return json({ success: true, sessionId: sid, ...result });
            } catch (e) {
                return json({ success: false, error: e.message }, 500);
            }
        }

        return json({ error: 'Not found' }, 404);
    }
};
