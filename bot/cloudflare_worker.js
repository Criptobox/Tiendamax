/*
 * TiendaMax Telegram Bot — Cloudflare Worker
 *
 * Variables de entorno requeridas (Worker Settings → Variables):
 *   BOT_TOKEN       — token del bot de Telegram
 *   ADMIN_CHAT_ID   — tu chat_id de Telegram
 *   FIREBASE_URL    — ej: https://tu-proyecto-default-rtdb.firebaseio.com
 *   GITHUB_TOKEN    — Personal Access Token con Contents read+write en el repo
 *
 * Variables opcionales:
 *   SITE_URL        — defecto: https://tiendamax.org
 *   PRODUCTOS_URL   — defecto: GitHub raw productos.json
 *
 * KV Namespace (Worker Settings → Bindings → KV namespace):
 *   Nombre de variable: KV  →  namespace: TIENDAMAX_BOT
 */

const CUBA_TZ        = 'America/Havana';
const DEFAULT_SITE   = 'https://tiendamax.org';
const DEFAULT_PRODS  = 'https://raw.githubusercontent.com/Criptobox/Tiendamax/main/productos.json';
const GITHUB_API     = 'https://api.github.com/repos/Criptobox/Tiendamax/contents/productos.json';
const PRODS_PER_PAGE = 8;

// ── Fecha ─────────────────────────────────────────────────────────────────────

function cubaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CUBA_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date);
  const d = {};
  for (const p of parts) d[p.type] = p.value;
  return `${d.day}/${d.month}/${d.year}`;
}

// ── Base64 (soporta unicode) ──────────────────────────────────────────────────

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin   = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function tgPost(token, method, body) {
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function sendMessage(token, chatId, text, opts = {}) {
  const payload = { chat_id: chatId, text: String(text).slice(0, 3900), disable_web_page_preview: true };
  if (opts.reply_markup) payload.reply_markup = opts.reply_markup;
  await tgPost(token, 'sendMessage', payload);
}

async function editMessage(token, chatId, messageId, text, opts = {}) {
  const payload = { chat_id: chatId, message_id: messageId, text: String(text).slice(0, 3900), disable_web_page_preview: true };
  if (opts.reply_markup) payload.reply_markup = opts.reply_markup;
  await tgPost(token, 'editMessageText', payload);
}

async function answerCallback(token, callbackId, text = '') {
  await tgPost(token, 'answerCallbackQuery', { callback_query_id: callbackId, text });
}

// ── Teclado principal ─────────────────────────────────────────────────────────

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: '📊 Resumen' },     { text: '📦 Stock' }],
      [{ text: '🔥 Interesados' }, { text: '📣 Campaña' }],
      [{ text: '🛍️ Productos' },   { text: '✅ Tareas' }],
      [{ text: '💰 Venta manual' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

// ── Firebase REST ─────────────────────────────────────────────────────────────

async function getFirebase(firebaseUrl, path) {
  try {
    const res = await fetch(`${firebaseUrl}/${path}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function putFirebase(firebaseUrl, path, data) {
  await fetch(`${firebaseUrl}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Productos (GitHub raw) ────────────────────────────────────────────────────

async function getProductos(productosUrl) {
  try {
    const res  = await fetch(productosUrl);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── Rebaje de stock vía GitHub API ────────────────────────────────────────────

async function reduceStock(items, env) {
  if (!env.GITHUB_TOKEN) return;

  const headers = {
    'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
    'Accept':        'application/vnd.github.v3+json',
    'User-Agent':    'TiendaMax-Bot',
    'Content-Type':  'application/json',
  };

  try {
    const fileRes = await fetch(GITHUB_API, { headers });
    if (!fileRes.ok) return;
    const fileData = await fileRes.json();

    const productos = JSON.parse(fromBase64(fileData.content));
    let changed = false;

    for (const item of items) {
      let idx = -1;

      // 1) Buscar por ID exacto si está disponible
      if (item.productoId) {
        idx = productos.findIndex(p => String(p.id) === String(item.productoId));
      }

      // 2) Si no hay ID, buscar por nombre (coincidencia parcial)
      if (idx === -1) {
        const q = String(item.nombre || '').toLowerCase().trim();
        idx = productos.findIndex(p =>
          String(p.nombre || '').toLowerCase().includes(q) ||
          q.includes(String(p.nombre || '').toLowerCase())
        );
      }

      if (idx !== -1) {
        const current = Number(productos[idx].stock || 0);
        productos[idx].stock = Math.max(0, current - Number(item.cantidad || 1));
        changed = true;
      }
    }

    if (!changed) return;

    await fetch(GITHUB_API, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'stock: actualizar desde bot Telegram',
        content: toBase64(JSON.stringify(productos, null, 2)),
        sha:     fileData.sha,
      }),
    });
  } catch (e) {
    console.error('reduceStock error:', e);
  }
}

// ── KV ────────────────────────────────────────────────────────────────────────

async function kvGet(kv, key)         { if (!kv) return null; try { return await kv.get(key); } catch { return null; } }
async function kvPut(kv, key, value)  { if (!kv) return;      try { await kv.put(key, value, { expirationTtl: 600 }); } catch {} }
async function kvDel(kv, key)         { if (!kv) return;      try { await kv.delete(key); } catch {} }
async function kvClearVenta(kv, chatId) {
  await Promise.all([
    kvDel(kv, 'VENTA_STATE_'   + chatId),
    kvDel(kv, 'VENTA_PRODUCT_' + chatId),
    kvDel(kv, 'VENTA_QTY_'     + chatId),
  ]);
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function objectValues(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj).filter(v => v && typeof v === 'object');
}

function sumCounters(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((s, v) => {
    if (typeof v === 'number') return s + v;
    if (v && typeof v === 'object' && typeof v.count === 'number') return s + v.count;
    return s;
  }, 0);
}

function flattenInteresados(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const arr = [];
  for (const node of Object.values(raw)) {
    if (!node || typeof node !== 'object') continue;
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') arr.push(v);
    }
  }
  return arr.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}

function topInteresados(arr) {
  const map = {};
  for (const x of arr) {
    const id = String(x.productoId || x.producto || '');
    if (!map[id]) map[id] = { productoId: x.productoId, producto: x.producto || 'Producto', count: 0 };
    map[id].count++;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// ── Funnel de venta ───────────────────────────────────────────────────────────

function buildVentaKeyboard(productos, page) {
  const start = page * PRODS_PER_PAGE;
  const slice = productos.slice(start, start + PRODS_PER_PAGE);
  const rows  = [];

  for (let i = 0; i < slice.length; i += 2) {
    const row = [{ text: String(slice[i].nombre).slice(0, 22), callback_data: 'vp_' + slice[i].id }];
    if (slice[i + 1]) row.push({ text: String(slice[i + 1].nombre).slice(0, 22), callback_data: 'vp_' + slice[i + 1].id });
    rows.push(row);
  }

  const nav = [];
  if (page > 0)                                    nav.push({ text: '◀ Anterior',  callback_data: 'vp_pg_' + (page - 1) });
  if (start + PRODS_PER_PAGE < productos.length)   nav.push({ text: 'Siguiente ▶', callback_data: 'vp_pg_' + (page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: '❌ Cancelar', callback_data: 'venta_cancel_flow' }]);
  return rows;
}

async function showVentaPage(token, chatId, messageId, productos, page) {
  const pages    = Math.ceil(productos.length / PRODS_PER_PAGE);
  const pageInfo = pages > 1 ? ` (${page + 1}/${pages})` : '';
  const text     = `💰 Elige el producto vendido${pageInfo}:`;
  const markup   = { inline_keyboard: buildVentaKeyboard(productos, page) };
  if (messageId) await editMessage(token, chatId, messageId, text, { reply_markup: markup });
  else           await sendMessage(token, chatId, text, { reply_markup: markup });
}

// ── Comandos ──────────────────────────────────────────────────────────────────

async function cmdStart(token, chatId) {
  await sendMessage(token, chatId,
    '👋 TiendaMax Bot listo.\n\n' +
    'Usa los botones de abajo o escribe:\n' +
    '/resumen · /stock · /interesados\n' +
    '/campana · /productos · /tareas\n' +
    '/venta  (flujo guiado)\n\n' +
    'También puedes pegar una orden de WhatsApp.',
    { reply_markup: mainKeyboard() }
  );
}

async function cmdResumen(token, chatId, env) {
  const [ventas, interesadosRaw, vistas, wa] = await Promise.all([
    getFirebase(env.FIREBASE_URL, 'ventas'),
    getFirebase(env.FIREBASE_URL, 'interesados'),
    getFirebase(env.FIREBASE_URL, 'analytics/vistas'),
    getFirebase(env.FIREBASE_URL, 'analytics/whatsapp'),
  ]);

  const ventasArr      = objectValues(ventas || {});
  const hoy            = cubaDate();
  const ventasHoy      = ventasArr.filter(v => v.fecha === hoy);
  const totalHoy       = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
  const interesados    = flattenInteresados(interesadosRaw || {});
  const interesadosHoy = interesados.filter(x => x.ts && cubaDate(new Date(Number(x.ts))) === hoy);

  const lines = [
    '📊 TiendaMax — ' + hoy, '',
    '🛒 Ventas hoy: '   + ventasHoy.length + ' · $' + totalHoy.toFixed(2),
    '📦 Ventas total: ' + ventasArr.length,
    '👁️ Vistas: '      + sumCounters(vistas || {}),
    '💬 WhatsApp: '     + sumCounters(wa || {}),
    '🔥 Interesados hoy: ' + interesadosHoy.length,
  ];

  const top = topInteresados(interesados);
  if (top.length) {
    lines.push('', '🔥 Más interés:');
    top.slice(0, 5).forEach(x => lines.push('• ' + x.producto + ' — ' + x.count));
  }
  await sendMessage(token, chatId, lines.join('\n'));
}

async function cmdStock(token, chatId, env) {
  const productos = await getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS);
  const bajos     = productos.filter(p => { const s = Number(p.stock || 0); return s > 0 && s <= 3; });
  const agotados  = productos.filter(p => Number(p.stock || 0) <= 0);

  const lines = ['📦 Stock TiendaMax', 'Productos: ' + productos.length, '⚠️ Bajos: ' + bajos.length, '🚫 Agotados: ' + agotados.length];
  if (bajos.length)   { lines.push('', '⚠️ Stock bajo:');  bajos.slice(0, 12).forEach(p => lines.push('• ' + p.nombre + ' (' + p.stock + ')')); }
  if (agotados.length){ lines.push('', '🚫 Agotados:');    agotados.slice(0, 12).forEach(p => lines.push('• ' + p.nombre)); }
  await sendMessage(token, chatId, lines.join('\n'));
}

async function cmdInteresados(token, chatId, env) {
  const raw = await getFirebase(env.FIREBASE_URL, 'interesados') || {};
  const top = topInteresados(flattenInteresados(raw));
  if (!top.length) { await sendMessage(token, chatId, 'Aún no hay interesados registrados.'); return; }
  const lines = ['🔥 Interesados WhatsApp', ''];
  top.slice(0, 10).forEach((x, i) => lines.push((i + 1) + '. ' + x.producto + ' — ' + x.count + ' interés(es)'));
  await sendMessage(token, chatId, lines.join('\n'));
}

async function cmdCampana(token, chatId, env) {
  const [raw, productos] = await Promise.all([
    getFirebase(env.FIREBASE_URL, 'interesados'),
    getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS),
  ]);
  const top = topInteresados(flattenInteresados(raw || {}));
  let producto = top.length ? productos.find(p => String(p.id) === String(top[0].productoId)) : null;
  if (!producto) producto = productos.filter(p => Number(p.stock || 0) > 0).sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0))[0];
  if (!producto) { await sendMessage(token, chatId, 'No encontré producto para campaña.'); return; }

  const precio  = Number(producto.precioActual || 0).toFixed(2);
  const siteUrl = env.SITE_URL || DEFAULT_SITE;
  await sendMessage(token, chatId,
    '📣 Campaña sugerida\n\n' +
    'Producto: ' + producto.nombre + '\n' +
    'Precio: $' + precio + '\n' +
    'Stock: ' + (producto.stock || 0) + '\n\n' +
    'Facebook / WhatsApp:\n' +
    '🔥 ' + producto.nombre + '\n\nDisponible en TiendaMax por $' + precio + ' USD.\n' +
    '📦 Stock: ' + (producto.stock || 0) + '\n📲 Escríbenos para reservar.\n\n' +
    'Push:\nTítulo: 🔥 ' + String(producto.nombre).slice(0, 34) + '\n' +
    'Mensaje: Disponible por $' + precio + '. Reserva por WhatsApp.\n' +
    'URL: ' + siteUrl + '/p/producto-' + producto.id + '.html'
  );
}

async function cmdProductos(token, chatId, env, q) {
  let productos = await getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS);
  if (q) {
    const qq = q.toLowerCase();
    productos = productos.filter(p =>
      String(p.nombre || '').toLowerCase().includes(qq) ||
      String(p.categoria || '').toLowerCase().includes(qq)
    );
  }
  if (!productos.length) { await sendMessage(token, chatId, 'No encontré productos.'); return; }
  const lines = ['🛍️ Productos (' + productos.length + ')', ''];
  productos.slice(0, 60).forEach(p => {
    const s = Number(p.stock || 0);
    lines.push((s <= 0 ? '🚫' : s <= 3 ? '⚠️' : '✅') + ' ' + p.nombre + ' — $' + Number(p.precioActual || 0).toFixed(2) + ' · stock ' + s);
  });
  await sendMessage(token, chatId, lines.join('\n'));
}

async function cmdTareas(token, chatId, env) {
  const productos = await getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS);
  const noSeo  = productos.filter(p => !p.seoTitle && !p.seoDescription).length;
  const noRecs = productos.filter(p => !p.recomendados || !p.recomendados.length).length;
  const bajos  = productos.filter(p => { const s = Number(p.stock || 0); return s > 0 && s <= 3; }).length;
  const agot   = productos.filter(p => Number(p.stock || 0) <= 0).length;

  const lines = ['✅ Tareas sugeridas', ''];
  if (noSeo)         lines.push('• Generar SEO a ' + Math.min(5, noSeo) + ' productos.');
  if (noRecs)        lines.push('• Generar recomendaciones a ' + Math.min(5, noRecs) + ' productos.');
  if (bajos || agot) lines.push('• Revisar stock: ' + bajos + ' bajos, ' + agot + ' agotados.');
  lines.push('• Crear campaña del día.', '• Actualizar tienda si hiciste cambios.');
  await sendMessage(token, chatId, lines.join('\n'));
}

async function cmdVenta(token, chatId, env) {
  const productos   = await getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS);
  const disponibles = productos.filter(p => Number(p.stock || 0) > 0);
  if (!disponibles.length) { await sendMessage(token, chatId, '⚠️ No hay productos con stock disponible.'); return; }
  await showVentaPage(token, chatId, null, disponibles, 0);
}

// ── Paso 2 del funnel: recibir cantidad ───────────────────────────────────────

async function handleVentaQuantity(token, chatId, text, env) {
  const qty = parseInt(text.trim(), 10);
  if (!qty || qty <= 0 || qty > 9999) {
    await sendMessage(token, chatId, '⚠️ Escribe solo el número de unidades (ej: 2).');
    return;
  }

  const productJson = await kvGet(env.KV, 'VENTA_PRODUCT_' + chatId);
  if (!productJson) {
    await kvClearVenta(env.KV, chatId);
    await sendMessage(token, chatId, '⚠️ Sesión expirada. Vuelve a pulsar 💰 Venta manual.');
    return;
  }

  const producto = JSON.parse(productJson);
  const precio   = Number(producto.precioActual || 0);
  const total    = precio * qty;

  await kvPut(env.KV, 'VENTA_QTY_'   + chatId, String(qty));
  await kvPut(env.KV, 'VENTA_STATE_' + chatId, 'confirming');

  await sendMessage(token, chatId,
    '🛒 Confirmar venta:\n\n📦 ' + producto.nombre +
    '\nCantidad: ' + qty +
    '\nPrecio unit: $' + precio.toFixed(2) +
    '\nTotal: $' + total.toFixed(2),
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Confirmar', callback_data: 'venta_ok' },
          { text: '❌ Cancelar',  callback_data: 'venta_cancel_flow' },
        ]],
      },
    }
  );
}

// ── Parser de orden WhatsApp ──────────────────────────────────────────────────

function parseOrden(text) {
  const upper = String(text).toUpperCase();
  if (!upper.includes('NUEVA ORDEN') || !upper.includes('TIENDAMAX')) return null;

  // Extraer ID del producto desde la URL (órdenes de botón único)
  const urlMatch      = text.match(/producto-(\d+)\.html/);
  const singleProdId  = urlMatch ? urlMatch[1] : null;

  const items = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\*?\d+\.\*?\s+(.+)/);
    if (!m) continue;

    let cantidad = 1, precio = 0;
    const nombre = m[1].replace(/\*/g, '').trim();

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const cm = lines[j].match(/Cant[.:\s]*\*?(\d+)\*?/i);
      const pm = lines[j].match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*USD/i);
      if (cm) cantidad = Number(cm[1]);
      if (pm) precio   = Number(pm[1]);
    }
    items.push({ nombre, cantidad, precio });
  }

  // Para órdenes de producto único, asignar el ID desde la URL
  if (singleProdId && items.length === 1) {
    items[0].productoId = singleProdId;
  }

  return items.length ? items : null;
}

// ── Registrar venta + rebajar stock ──────────────────────────────────────────

async function registrarVenta(items, env) {
  const msgs = [];
  for (const item of items) {
    const id    = Date.now();
    const total = Number(item.precio || 0) * Number(item.cantidad || 1);
    await putFirebase(env.FIREBASE_URL, 'ventas/' + id, {
      id,
      productoId: item.productoId || 0,
      producto:   item.nombre,
      precio:     Number(item.precio || 0),
      cantidad:   Number(item.cantidad || 1),
      total,
      ganancia:   0,
      fecha:      cubaDate(),
      fuente:     'telegram_worker',
    });
    msgs.push('✅ ' + item.nombre + ' x' + item.cantidad + ' · $' + total.toFixed(2));
  }

  // Rebajar stock en productos.json (async, no bloquea la respuesta)
  reduceStock(items, env).catch(e => console.error('reduceStock:', e));

  return '🎉 Venta registrada\n\n' + msgs.join('\n') +
    (env.GITHUB_TOKEN ? '\n\n📦 Stock actualizado.' : '');
}

// ── Router de mensajes ────────────────────────────────────────────────────────

async function handleMessage(msg, env) {
  const chatId  = String(msg.chat.id);
  const text    = msg.text || msg.caption || '';
  const token   = env.BOT_TOKEN;
  const adminId = String(env.ADMIN_CHAT_ID);

  if (chatId !== adminId) { await sendMessage(token, chatId, '⛔ No autorizado.'); return; }

  // Flujo de venta activo — interceptar texto como cantidad
  const ventaState = await kvGet(env.KV, 'VENTA_STATE_' + chatId);
  if (ventaState === 'waiting_qty') {
    const isCmd = text.startsWith('/') || /^[📊📦🔥📣🛍✅💰]/.test(text) || !text;
    if (isCmd) await kvClearVenta(env.KV, chatId);
    else { await handleVentaQuantity(token, chatId, text, env); return; }
  }

  if (text.startsWith('/start') || text.startsWith('/ayuda') || text.startsWith('/help')) return cmdStart(token, chatId);
  if (text.startsWith('/resumen')    || text === '📊 Resumen')     return cmdResumen(token, chatId, env);
  if (text.startsWith('/stock')      || text === '📦 Stock')       return cmdStock(token, chatId, env);
  if (text.startsWith('/interesados')|| text === '🔥 Interesados') return cmdInteresados(token, chatId, env);
  if (text.startsWith('/campana') || text.startsWith('/campaña') || text === '📣 Campaña') return cmdCampana(token, chatId, env);
  if (text.startsWith('/productos')  || text === '🛍️ Productos') {
    return cmdProductos(token, chatId, env, text.replace('/productos', '').replace('🛍️ Productos', '').trim());
  }
  if (text.startsWith('/tareas')  || text === '✅ Tareas')       return cmdTareas(token, chatId, env);
  if (text.startsWith('/venta')   || text === '💰 Venta manual') return cmdVenta(token, chatId, env);

  // Orden de WhatsApp pegada
  const items = parseOrden(text);
  if (items && items.length) {
    await kvPut(env.KV, 'PENDING_' + chatId, JSON.stringify(items));

    const total = items.reduce((s, it) => s + it.precio * it.cantidad, 0);
    const lines = ['🛒 Orden detectada:', ''];
    items.forEach(it => lines.push('• ' + it.nombre + ' x' + it.cantidad + ' = $' + (it.precio * it.cantidad).toFixed(2)));
    lines.push('', 'Total: $' + total.toFixed(2));
    if (items.some(it => it.productoId)) lines.push('📦 Stock se actualizará al confirmar.');

    return sendMessage(token, chatId, lines.join('\n'), {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Confirmar venta', callback_data: 'venta_ok' },
          { text: '❌ Cancelar',        callback_data: 'venta_cancel' },
        ]],
      },
    });
  }

  await sendMessage(token, chatId, 'No reconocí ese mensaje. Usa /ayuda para ver comandos.');
}

// ── Router de callbacks ───────────────────────────────────────────────────────

async function handleCallback(q, env) {
  const chatId    = String(q.message.chat.id);
  const messageId = q.message.message_id;
  const token     = env.BOT_TOKEN;

  if (chatId !== String(env.ADMIN_CHAT_ID)) { await answerCallback(token, q.id, 'No autorizado'); return; }
  await answerCallback(token, q.id);

  // Paginación del selector de productos
  if (q.data.startsWith('vp_pg_')) {
    const page        = parseInt(q.data.replace('vp_pg_', ''), 10);
    const productos   = await getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS);
    const disponibles = productos.filter(p => Number(p.stock || 0) > 0);
    await showVentaPage(token, chatId, messageId, disponibles, page);
    return;
  }

  // Producto seleccionado en el funnel
  if (q.data.startsWith('vp_')) {
    const productId = q.data.replace('vp_', '');
    const productos = await getProductos(env.PRODUCTOS_URL || DEFAULT_PRODS);
    const producto  = productos.find(p => String(p.id) === productId);
    if (!producto) { await editMessage(token, chatId, messageId, '⚠️ Producto no encontrado. Intenta de nuevo.'); return; }

    await kvPut(env.KV, 'VENTA_STATE_'   + chatId, 'waiting_qty');
    await kvPut(env.KV, 'VENTA_PRODUCT_' + chatId, JSON.stringify(producto));

    await editMessage(token, chatId, messageId,
      '📦 ' + producto.nombre +
      '\nPrecio: $' + Number(producto.precioActual || 0).toFixed(2) +
      '\nStock: ' + (producto.stock || 0) +
      '\n\n¿Cuántas unidades vendiste?\n(escribe el número)'
    );
    return;
  }

  // Cancelar
  if (q.data === 'venta_cancel_flow' || q.data === 'venta_cancel') {
    await kvClearVenta(env.KV, chatId);
    await kvDel(env.KV, 'PENDING_' + chatId);
    await editMessage(token, chatId, messageId, '❌ Cancelado.');
    return;
  }

  // Confirmar venta
  if (q.data === 'venta_ok') {
    // Flujo guiado (funnel con selector de producto)
    const productJson = await kvGet(env.KV, 'VENTA_PRODUCT_' + chatId);
    const qtyStr      = await kvGet(env.KV, 'VENTA_QTY_'     + chatId);

    if (productJson && qtyStr) {
      const producto = JSON.parse(productJson);
      const qty      = parseInt(qtyStr, 10);
      await kvClearVenta(env.KV, chatId);
      const result = await registrarVenta([{
        nombre:     producto.nombre,
        cantidad:   qty,
        precio:     Number(producto.precioActual || 0),
        productoId: producto.id,
      }], env);
      return editMessage(token, chatId, messageId, result);
    }

    // Flujo de orden WhatsApp pegada (PENDING_)
    const raw = await kvGet(env.KV, 'PENDING_' + chatId);
    if (!raw) return editMessage(token, chatId, messageId, '⚠️ No hay venta pendiente. Repite el comando.');
    const items = JSON.parse(raw);
    await kvDel(env.KV, 'PENDING_' + chatId);
    const result = await registrarVenta(items, env);
    return editMessage(token, chatId, messageId, result);
  }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'GET')  return new Response('TiendaMax Bot OK');
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.message)        await handleMessage(update.message, env);
        if (update.callback_query) await handleCallback(update.callback_query, env);
      } catch (e) { console.error('Worker error:', e); }
      return new Response('OK');
    }
    return new Response('Method not allowed', { status: 405 });
  },
};
