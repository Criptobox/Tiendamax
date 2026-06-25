/**
 * TiendaMax — Mini-service: chat-bot (puerto 3030)
 * Asistente "Max" para la tienda. Conoce el catálogo (productos.json),
 * info de la tienda (tasa, envíos, WhatsApp) y responde con LLM.
 *
 * API:
 *   POST /api/chat  { message, sessionId, history? }  →  { response, products?, quickReplies? }
 *   GET  /api/health  →  { ok: true }
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ZAI from 'z-ai-web-dev-sdk';

const PORT = 3030;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

// ── Cargar datos del catálogo (cache en memoria) ──
let _productos = [];
let _categorias = [];
let _config = {};
let _zai = null;
let _dataLoaded = false;

async function cargarDatos() {
    if (_dataLoaded) return;
    try {
        const [prodRaw, catRaw, cfgRaw] = await Promise.all([
            readFile(join(PUBLIC_DIR, 'productos.json'), 'utf-8').catch(() => '[]'),
            readFile(join(PUBLIC_DIR, 'categorias.json'), 'utf-8').catch(() => '{"nombres":[]}'),
            readFile(join(PUBLIC_DIR, 'config.json'), 'utf-8').catch(() => '{}'),
        ]);
        _productos = JSON.parse(prodRaw);
        const catObj = JSON.parse(catRaw);
        _categorias = Array.isArray(catObj) ? catObj : (catObj.nombres || []);
        _config = JSON.parse(cfgRaw);
        _dataLoaded = true;
        console.log(`[bot] Catálogo cargado: ${_productos.length} productos, ${_categorias.length} categorías`);
    } catch (e) {
        console.error('[bot] Error cargando datos:', e.message);
        _dataLoaded = true; // no reintentar en cada request
    }
}

// ── Inicializar LLM ──
async function initLLM() {
    if (_zai) return _zai;
    try {
        _zai = await ZAI.create();
        console.log('[bot] LLM inicializado');
        return _zai;
    } catch (e) {
        console.error('[bot] Error init LLM:', e.message);
        throw e;
    }
}

// ── Construir system prompt con contexto del catálogo ──
function buildSystemPrompt() {
    const tasa = _config.tasaMN || 0;
    const whatsapp = '5354320170'; // default, el admin lo cambia
    const categoriasStr = _categorias.map(c => {
        const count = _productos.filter(p => p.categoria === c).length;
        return `  • ${c} (${count} productos)`;
    }).join('\n');

    // Resumen compacto de productos (id, nombre, precio, categoría, stock)
    const prodsStr = _productos.map(p => {
        const precio = Number(p.precioActual || 0).toFixed(2);
        const stock = p.stock || 0;
        const agotado = stock === 0 ? ' [AGOTADO]' : '';
        return `  [${p.id}] ${p.nombre} — $${precio} USD${agotado} (${p.categoria||'General'}, stock ${stock})`;
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

CATÁLOGO (${_productos.length} productos en ${_categorias.length} categorías):
${categoriasStr}

PRODUCTOS (id | nombre | precio USD | categoría | stock):
${prodsStr}

REGLAS:
1. Si el usuario pregunta por un producto o tipo de producto, busca en el catálogo y recomienda productos específicos con su nombre real, precio en USD y MN.
2. Para convertir USD a MN: multiplica por ${tasa}. Ejemplo: $10 USD = ${10*tasa} MN.
3. Si un producto está agotado, indícalo y sugiere alternativas.
4. Si preguntan cómo comprar, explica: "Toca el botón 'Pedir' en cualquier producto y se abre WhatsApp con tu pedido."
5. No inventes productos que no están en el catálogo.
6. Si no sabes algo, deriva a WhatsApp: "Para eso escríbenos por WhatsApp ${whatsapp}".
7. Si el usuario saluda, saluda de vuelta y ofrece ayuda.
8. Mantén respuestas cortas y útiles.`;
}

// ── Búsqueda local de productos (para sugerencias) ──
function buscarProductos(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return _productos
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
            imagen: p.imagen,
        }));
}

// ── Conversaciones en memoria (sessionId → messages) ──
const _conversations = new Map();
const MAX_HISTORY = 20;

function getHistory(sessionId) {
    if (!_conversations.has(sessionId)) {
        _conversations.set(sessionId, []);
    }
    return _conversations.get(sessionId);
}

function trimHistory(history) {
    if (history.length > MAX_HISTORY) {
        return history.slice(-MAX_HISTORY);
    }
    return history;
}

// ── Respuestas rápidas predefinidas (sin LLM, para 3G) ──
function respuestaRapida(message) {
    const m = message.toLowerCase().trim();
    // Saludos
    if (/^(hola|buenas|saludos|hey|que bol[aá]|asere|dime)/.test(m)) {
        return {
            response: '¡Hola! Soy Max 🤖 Tu asistente de TiendaMax. ¿Qué buscas hoy? Puedo ayudarte con productos, precios, envíos o cómo comprar.',
            quickReplies: ['🔥 Ver ofertas', '📦 Categorías', '💬 WhatsApp', '❓ Cómo comprar'],
        };
    }
    if (/^(gracias|thanks|thx|mil gracias|muchas gracias)/.test(m)) {
        return { response: '¡De nada! 🙌 Aquí estoy si necesitas algo más. Dale, revisa el catálogo que hay cosas buenas.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(chao|adios|hasta luego|nos vemos|bye)/.test(m)) {
        return { response: '¡Chao! Que tengas buen día. Vuelve cuando quieras 🤖', quickReplies: [] };
    }
    if (/^(como comprar|como compro|como pido|como hago un pedido|como pedir)/.test(m) || m === 'cómo comprar') {
        return {
            response: '🛒 Es súper fácil:\n1. Navega el catálogo o busca tu producto\n2. Toca el botón "Pedir" en el producto\n3. Se abre WhatsApp con tu pedido listo\n4. Coordinas pago contra entrega y envío',
            quickReplies: ['📦 Ver productos', '💬 WhatsApp'],
        };
    }
    if (/(whatsapp|telefono|teléfono|contacto|numero|número)/.test(m)) {
        return { response: '💬 Nuestro WhatsApp es 5354320170. Toca cualquier botón "Pedir" en un producto y se abre directo con tu pedido.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(envio|envíos|envios|entrega|domicilio|delivery)/.test(m)) {
        // Si pregunta específicamente por tiempo/demora, dar respuesta de tiempos
        if (/(cuanto|cuánto|tarda|demora|tiempo|cuando|cuándo|llega)/.test(m)) {
            return { response: '🚚 El tiempo de entrega depende de tu ubicación:\n• La Habana: 1-2 días\n• Otras provincias: 2-5 días\nCoordina el detalle por WhatsApp.', quickReplies: ['💬 WhatsApp'] };
        }
        return { response: '🚚 Hacemos envíos a domicilio en toda Cuba. El costo se coordina por WhatsApp según tu ubicación. ¡Pago contra entrega!', quickReplies: ['💬 WhatsApp'] };
    }
    if (/(pago|pagar|tarjeta|transferencia|efectivo)/.test(m)) {
        return { response: '💵 Aceptamos pago CONTRA ENTREGA. Pagas al recibir el producto. Simple y seguro.', quickReplies: ['📦 Ver productos'] };
    }
    if (/(tasa|dolar|dólar|usd|mn|peso|cambio|conversion)/.test(m)) {
        return { response: `💱 Tasa actual: 1 USD = ${_config.tasaMN || 695} MN. Todos los precios están en USD; el botón de moneda (USD/MN) en el hero los convierte al instante.`, quickReplies: ['📦 Ver productos'] };
    }
    if (/(categoria|categorías|categorias|seccion|secciones|que tienen|que venden|que hay)/.test(m)) {
        const lista = _categorias.map(c => {
            const count = _productos.filter(p => p.categoria === c).length;
            return `• ${c} (${count})`;
        }).join('\n');
        return { response: `📦 Tenemos ${_productos.length} productos en ${_categorias.length} categorías:\n${lista}\n\n¿Cuál te interesa?`, quickReplies: _categorias.slice(0, 4) };
    }
    if (/(oferta|ofertas|descuento|barato|rebaja|promocion)/.test(m)) {
        const ofertas = _productos.filter(p => p.precioOriginal > 0 && p.precioOriginal > p.precioActual).slice(0, 4);
        if (ofertas.length === 0) {
            return { response: '🔍 Ahora mismo no hay ofertas activas. Pero hay productos con buen precio en todas las categorías. ¿Qué buscas?', quickReplies: ['📦 Categorías'] };
        }
        const lista = ofertas.map(p => `• ${p.nombre} — $${Number(p.precioActual).toFixed(2)} USD (era $${Number(p.precioOriginal).toFixed(2)})`).join('\n');
        return { response: `🔥 Ofertas actuales:\n${lista}\n\nToca cualquier producto para pedirlo.`, quickReplies: ['💬 WhatsApp'] };
    }
    // FAQ: Garantía
    if (/(garantia|garantía|warranty|garant)/.test(m)) {
        return { response: '🛡️ Sí, todos los productos tienen garantía. Si algo no funciona, escríbenos por WhatsApp y lo resolvemos. La garantía varía según el producto (pregunta por la del tuyo).', quickReplies: ['💬 WhatsApp', '📦 Ver productos'] };
    }
    // FAQ: Devoluciones
    if (/(devolucion|devolución|devolver|cambiar|return)/.test(m)) {
        return { response: '↩️ Aceptamos devoluciones dentro de 24 horas si el producto llega dañado o no corresponde a lo pedido. Escríbenos por WhatsApp para coordinar.', quickReplies: ['💬 WhatsApp'] };
    }
    // FAQ: Ubicación
    if (/(donde.*estan|ubicacion|ubicación|dirección|direccion|donde.*quedan|local)/.test(m)) {
        return { response: '📍 TiendaMax es una tienda online. No tenemos local físico abierto al público. Todo se gestiona por WhatsApp y enviamos a tu puerta. 🚚', quickReplies: ['💬 WhatsApp', '📦 Ver productos'] };
    }
    // FAQ: Horario
    if (/(horario|hora.*atienden|que.*hora|abierto|abren)/.test(m)) {
        return { response: '🕐 Atendemos de Lunes a Sábado, de 9:00am a 8:00pm (hora de Cuba). Puedes hacer pedidos online 24/7 y te respondemos en horario de atención.', quickReplies: ['📦 Ver productos'] };
    }
    // FAQ: Productos usados
    if (/(usado|usados|segunda mano|usado|reacondicionado)/.test(m)) {
        const usados = _productos.filter(p => p.usado === true || p.usado === 'true');
        if (usados.length > 0) {
            return { response: `♻️ Sí, tenemos ${usados.length} producto(s) usado(s) en buen estado. Cada uno indica "♻️ Producto usado" en su descripción. Los usados tienen precio más bajo.`, quickReplies: ['📦 Ver productos'] };
        }
        return { response: '♻️ Actualmente no tenemos productos usados en catálogo. Todos son nuevos.', quickReplies: ['📦 Ver productos'] };
    }
    // FAQ: Stock / disponibilidad
    if (/(stock|disponible|disponibilidad|tienen.*en existencia|hay.*stock)/.test(m)) {
        const agotados = _productos.filter(p => p.stock === 0).length;
        const disponibles = _productos.length - agotados;
        return { response: `📦 Tenemos ${disponibles} productos disponibles y ${agotados} agotados. Cada producto muestra su stock en tiempo real. Si algo está agotado, toca "Avisarme cuando vuelva" y te notificamos.`, quickReplies: ['📦 Ver productos'] };
    }
    // FAQ: Seguimiento de pedido
    if (/(seguimiento|seguir.*pedido|donde.*pedido|estado.*pedido|mi pedido|rastrear)/.test(m)) {
        return { response: '📦 Puedes seguir tu pedido en tiempo real desde el link que te enviamos por WhatsApp al confirmar la venta. También lo encuentras en "Mis Pedidos" → "Seguir pedido".', quickReplies: ['💬 WhatsApp'] };
    }
    return null; // no es respuesta rápida → usar LLM
}

// ── Handler del chat con LLM ──
async function handleChat(message, sessionId) {
    await cargarDatos();
    // 1. Intentar respuesta rápida primero (sin LLM, más rápido en 3G)
    const rapida = respuestaRapida(message);
    if (rapida) {
        // Detectar productos mencionados para sugerencias
        const productos = buscarProductos(message);
        return { ...rapida, products: productos.length > 0 ? productos : undefined };
    }

    // 2. Usar LLM con contexto del catálogo
    try {
        const zai = await initLLM();
        const history = getHistory(sessionId);
        const systemPrompt = buildSystemPrompt();

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8), // últimos 8 turnos para no explotar tokens
            { role: 'user', content: message },
        ];

        const completion = await zai.chat.completions.create({
            messages,
            thinking: { type: 'disabled' },
        });

        const response = completion.choices?.[0]?.message?.content || 'Lo siento, no pude procesar eso. ¿Puedes reformular?';

        // Guardar en historial
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: response });
        trimHistory(history);

        // Sugerencias de productos basadas en el mensaje del usuario
        const products = buscarProductos(message);

        return {
            response,
            products: products.length > 0 ? products : undefined,
            quickReplies: ['📦 Ver productos', '💬 WhatsApp'],
        };
    } catch (e) {
        console.error('[bot] LLM error:', e.message);
        return {
            response: 'Lo siento, tuve un problema técnico. Mientras tanto, puedes escribirnos por WhatsApp directamente. ¿Algo más en lo que pueda ayudar?',
            quickReplies: ['💬 WhatsApp', '📦 Ver productos'],
        };
    }
}

// ── Rate limiting simple (por IP) ──
const _rateLimit = new Map(); // ip → [{time}, ...]
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 30; // 30 mensajes por minuto por IP
function rateLimitOk(ip) {
    const now = Date.now();
    const arr = (_rateLimit.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
    if (arr.length >= RATE_LIMIT_MAX) {
        _rateLimit.set(ip, arr);
        return false;
    }
    arr.push(now);
    _rateLimit.set(ip, arr);
    return true;
}
// Limpieza periódica del rate limit
setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of _rateLimit) {
        const fresh = arr.filter(t => now - t < RATE_LIMIT_WINDOW);
        if (fresh.length === 0) _rateLimit.delete(ip);
        else _rateLimit.set(ip, fresh);
    }
}, 5 * 60 * 1000);

// ── LRU eviction de conversaciones (evita memory leak) ──
const MAX_CONVERSATIONS = 200;
function evictOldConversations() {
    if (_conversations.size > MAX_CONVERSATIONS) {
        // Eliminar las 50 más viejas (orden de inserción)
        const keys = _conversations.keys();
        const toDelete = MAX_CONVERSATIONS / 4;
        for (let i = 0; i < toDelete; i++) {
            const k = keys.next().value;
            if (k) _conversations.delete(k);
        }
        console.log(`[bot] Evicted ${toDelete} old conversations (cache size: ${_conversations.size})`);
    }
}
setInterval(evictOldConversations, 10 * 60 * 1000);

// ── HTTP server ──
const server = createServer(async (req, res) => {
    // CORS para que el frontend pueda llamarlo
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Health check
    if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, productos: _productos.length, categorias: _categorias.length, llm: !!_zai }));
        return;
    }

    // POST /api/chat
    if (req.url === '/api/chat' && req.method === 'POST') {
        // Rate limit por IP
        const ip = req.socket.remoteAddress || 'unknown';
        if (!rateLimitOk(ip)) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Demasiadas solicitudes. Espera un minuto.' }));
            return;
        }

        // Body size limit (10KB max)
        let body = '';
        for await (const chunk of req) {
            body += chunk;
            if (body.length > 10240) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Mensaje demasiado largo' }));
                return;
            }
        }
        let data;
        try { data = JSON.parse(body); } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inválido' })); return; }

        const { message, sessionId } = data;
        if (!message || typeof message !== 'string') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'message es requerido' }));
            return;
        }
        const sid = sessionId || 'anon-' + Math.random().toString(36).slice(2);
        try {
            const result = await handleChat(message, sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, sessionId: sid, ...result }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

// Pre-cargar datos al iniciar
cargarDatos().then(() => initLLM().catch(() => {}));

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[bot] TiendaMax chat-bot escuchando en http://localhost:${PORT}`);
    console.log(`[bot] API: POST /api/chat { message, sessionId }`);
});
