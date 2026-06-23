/*******************************************************
 * TiendaMax Telegram Bot — Apps Script v4
 * Sin spam · privado · resumen · stock · interesados
 * Teclado persistente de botones
 *******************************************************/

const PROPS = PropertiesService.getScriptProperties();

function getProp_(name, fallback) {
  fallback = fallback || '';
  return PROPS.getProperty(name) || fallback;
}

function botToken_()    { return getProp_('BOT_TOKEN'); }
function adminId_()     { return String(getProp_('ADMIN_CHAT_ID')); }
function firebaseUrl_() { return String(getProp_('FIREBASE_URL')).replace(/\/$/, ''); }
function siteUrl_()     { return getProp_('SITE_URL', 'https://tiendamax.org'); }

function productosUrl_() {
  return getProp_(
    'PRODUCTOS_URL',
    'https://raw.githubusercontent.com/Criptobox/Tiendamax/main/productos.json'
  );
}

/*******************************************************
 * Teclado principal — siempre visible en el chat
 *******************************************************/

function mainKeyboard_() {
  return {
    keyboard: [
      [{ text: '📊 Resumen' },     { text: '📦 Stock' }],
      [{ text: '🔥 Interesados' }, { text: '📣 Campaña' }],
      [{ text: '🛍️ Productos' },   { text: '✅ Tareas' }],
      [{ text: '💰 Venta manual' }]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

/*******************************************************
 * Telegram helpers
 *******************************************************/

function sendMessage_(chatId, text, opts) {
  opts = opts || {};
  var payload = {
    chat_id: chatId,
    text: String(text).slice(0, 3900),
    disable_web_page_preview: true
  };
  if (opts.reply_markup) payload.reply_markup = opts.reply_markup;

  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken_() + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function editMessage_(chatId, messageId, text, opts) {
  opts = opts || {};
  var payload = {
    chat_id: chatId,
    message_id: messageId,
    text: String(text).slice(0, 3900),
    disable_web_page_preview: true
  };
  if (opts.reply_markup) payload.reply_markup = opts.reply_markup;

  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken_() + '/editMessageText', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function answerCallback_(callbackId, text) {
  text = text || '';
  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken_() + '/answerCallbackQuery', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId, text: text }),
    muteHttpExceptions: true
  });
}

/*******************************************************
 * Webhook — un único doPost, limpio
 *******************************************************/

function doGet(e) {
  return ContentService.createTextOutput('TiendaMax Bot OK');
}

function doPost(e) {
  try {
    var update = JSON.parse(e.postData.contents);

    // Ignorar si Telegram reenvía el mismo update (duplicado)
    if (isDuplicateUpdate_(update.update_id)) {
      return ContentService.createTextOutput('OK');
    }

    if (update.message)        handleMessage_(update.message);
    if (update.callback_query) handleCallback_(update.callback_query);

  } catch (err) {
    console.error('doPost error:', err);
  }

  return ContentService.createTextOutput('OK');
}

/*******************************************************
 * Router de mensajes
 *******************************************************/

function handleMessage_(msg) {
  var chatId = String(msg.chat.id);
  var text   = msg.text || '';

  if (chatId !== adminId_()) {
    sendMessage_(chatId, '⛔ No autorizado.');
    return;
  }

  // Comandos y botones del teclado — no pasan por anti-duplicado de texto
  if (text.startsWith('/start') || text.startsWith('/ayuda') || text.startsWith('/help')) {
    cmdStart_(chatId); return;
  }
  if (text.startsWith('/resumen')  || text === '📊 Resumen')     { cmdResumen_(chatId); return; }
  if (text.startsWith('/stock')    || text === '📦 Stock')        { cmdStock_(chatId); return; }
  if (text.startsWith('/interesados') || text === '🔥 Interesados') { cmdInteresados_(chatId); return; }
  if (text.startsWith('/campana')  || text.startsWith('/campaña') || text === '📣 Campaña') {
    cmdCampana_(chatId); return;
  }
  if (text.startsWith('/productos') || text === '🛍️ Productos') {
    cmdProductos_(chatId, text.replace('/productos', '').replace('🛍️ Productos', '').trim()); return;
  }
  if (text.startsWith('/tareas')   || text === '✅ Tareas')       { cmdTareas_(chatId); return; }
  if (text.startsWith('/venta')    || text === '💰 Venta manual') {
    if (text === '💰 Venta manual') {
      sendMessage_(chatId, 'Escribe: /venta Nombre x2 $50\nEjemplo: /venta Router WiFi x1 $25');
      return;
    }
    cmdVentaManual_(chatId, text); return;
  }

  // Anti-spam solo para texto libre / órdenes pegadas
  if (isDuplicateText_(text)) {
    sendMessage_(chatId, '⚠️ Ese mensaje ya fue recibido recientemente.');
    return;
  }

  var items = parseOrden_(text);
  if (items && items.length) {
    PROPS.setProperty('PENDING_' + chatId, JSON.stringify(items));

    var total = 0;
    var lines = ['🛒 Orden detectada:', ''];
    items.forEach(function(item) {
      var sub = item.precio * item.cantidad;
      total += sub;
      lines.push('• ' + item.nombre + ' x' + item.cantidad + ' = $' + sub.toFixed(2));
    });
    lines.push('');
    lines.push('Total: $' + total.toFixed(2));

    sendMessage_(chatId, lines.join('\n'), {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Registrar venta', callback_data: 'venta_ok' },
          { text: '❌ Cancelar',        callback_data: 'venta_cancel' }
        ]]
      }
    });
    return;
  }

  sendMessage_(chatId, 'No reconocí ese mensaje. Usa /ayuda para ver comandos.');
}

/*******************************************************
 * Callbacks (botones inline)
 *******************************************************/

function handleCallback_(q) {
  var chatId    = String(q.message.chat.id);
  var messageId = q.message.message_id;

  if (chatId !== adminId_()) {
    answerCallback_(q.id, 'No autorizado');
    return;
  }

  answerCallback_(q.id);

  if (q.data === 'venta_cancel') {
    PROPS.deleteProperty('PENDING_' + chatId);
    editMessage_(chatId, messageId, '❌ Cancelado.');
    return;
  }

  if (q.data === 'venta_ok') {
    var raw = PROPS.getProperty('PENDING_' + chatId);
    if (!raw) {
      editMessage_(chatId, messageId, '⚠️ No hay venta pendiente. Repite el comando.');
      return;
    }
    var items = JSON.parse(raw);
    PROPS.deleteProperty('PENDING_' + chatId);
    editMessage_(chatId, messageId, registrarVenta_(items));
  }
}

/*******************************************************
 * Comandos
 *******************************************************/

function cmdStart_(chatId) {
  sendMessage_(chatId,
    '👋 TiendaMax Bot listo.\n\n' +
    'Usa los botones de abajo o escribe:\n' +
    '/resumen · /stock · /interesados\n' +
    '/campana · /productos · /tareas\n' +
    '/venta Nombre x2 $50\n\n' +
    'También puedes pegar una orden de WhatsApp.',
    { reply_markup: mainKeyboard_() }
  );
}

function cmdResumen_(chatId) {
  var ventas         = getFirebase_('ventas') || {};
  var interesadosRaw = getFirebase_('interesados') || {};
  var vistas         = getFirebase_('analytics/vistas') || {};
  var wa             = getFirebase_('analytics/whatsapp') || {};

  var ventasArr = objectValues_(ventas);
  var hoy       = Utilities.formatDate(new Date(), 'America/Havana', 'dd/MM/yyyy');
  var ventasHoy = ventasArr.filter(function(v) { return v.fecha === hoy; });
  var totalHoy  = ventasHoy.reduce(function(s, v) { return s + Number(v.total || 0); }, 0);

  var interesados    = flattenInteresados_(interesadosRaw);
  var interesadosHoy = interesados.filter(function(x) {
    if (!x.ts) return false;
    return Utilities.formatDate(new Date(Number(x.ts)), 'America/Havana', 'dd/MM/yyyy') === hoy;
  });

  var lines = [
    '📊 TiendaMax — ' + hoy,
    '',
    '🛒 Ventas hoy: ' + ventasHoy.length + ' · $' + totalHoy.toFixed(2),
    '📦 Ventas total: ' + ventasArr.length,
    '👁️ Vistas: ' + sumCounters_(vistas),
    '💬 WhatsApp: ' + sumCounters_(wa),
    '🔥 Interesados hoy: ' + interesadosHoy.length
  ];

  var top = topInteresados_(interesados);
  if (top.length) {
    lines.push('');
    lines.push('🔥 Más interés:');
    top.slice(0, 5).forEach(function(x) {
      lines.push('• ' + x.producto + ' — ' + x.count);
    });
  }

  sendMessage_(chatId, lines.join('\n'));
}

function cmdStock_(chatId) {
  var productos = getProductos_();
  var bajos     = productos.filter(function(p) { var s = Number(p.stock || 0); return s > 0 && s <= 3; });
  var agotados  = productos.filter(function(p) { return Number(p.stock || 0) <= 0; });

  var lines = [
    '📦 Stock TiendaMax',
    'Productos: ' + productos.length,
    '⚠️ Bajos: ' + bajos.length,
    '🚫 Agotados: ' + agotados.length
  ];

  if (bajos.length) {
    lines.push('');
    lines.push('⚠️ Stock bajo:');
    bajos.slice(0, 12).forEach(function(p) { lines.push('• ' + p.nombre + ' (' + p.stock + ')'); });
  }
  if (agotados.length) {
    lines.push('');
    lines.push('🚫 Agotados:');
    agotados.slice(0, 12).forEach(function(p) { lines.push('• ' + p.nombre); });
  }

  sendMessage_(chatId, lines.join('\n'));
}

function cmdInteresados_(chatId) {
  var raw  = getFirebase_('interesados') || {};
  var top  = topInteresados_(flattenInteresados_(raw));

  if (!top.length) {
    sendMessage_(chatId, 'Aún no hay interesados registrados.');
    return;
  }

  var lines = ['🔥 Interesados WhatsApp', ''];
  top.slice(0, 10).forEach(function(x, i) {
    lines.push((i + 1) + '. ' + x.producto + ' — ' + x.count + ' interés(es)');
  });
  sendMessage_(chatId, lines.join('\n'));
}

function cmdCampana_(chatId) {
  var productos   = getProductos_();
  var raw         = getFirebase_('interesados') || {};
  var top         = topInteresados_(flattenInteresados_(raw));
  var producto    = null;

  if (top.length) {
    producto = productos.find(function(p) { return String(p.id) === String(top[0].productoId); });
  }
  if (!producto) {
    producto = productos
      .filter(function(p) { return Number(p.stock || 0) > 0; })
      .sort(function(a, b) { return Number(b.stock || 0) - Number(a.stock || 0); })[0];
  }
  if (!producto) {
    sendMessage_(chatId, 'No encontré producto para campaña.');
    return;
  }

  var precio = Number(producto.precioActual || 0).toFixed(2);
  var url    = siteUrl_() + '/p/producto-' + producto.id + '.html';

  sendMessage_(chatId,
    '📣 Campaña sugerida\n\n' +
    'Producto: ' + producto.nombre + '\n' +
    'Precio: $' + precio + '\n' +
    'Stock: ' + (producto.stock || 0) + '\n\n' +
    'Facebook / WhatsApp:\n' +
    '🔥 ' + producto.nombre + '\n\n' +
    'Disponible en TiendaMax por $' + precio + ' USD.\n' +
    '📦 Stock: ' + (producto.stock || 0) + '\n' +
    '📲 Escríbenos para reservar.\n\n' +
    'Push:\n' +
    'Título: 🔥 ' + String(producto.nombre).slice(0, 34) + '\n' +
    'Mensaje: Disponible por $' + precio + '. Reserva por WhatsApp.\n' +
    'URL: ' + url
  );
}

function cmdProductos_(chatId, q) {
  var productos = getProductos_();

  if (q) {
    var qq = q.toLowerCase();
    productos = productos.filter(function(p) {
      return String(p.nombre || '').toLowerCase().includes(qq) ||
             String(p.categoria || '').toLowerCase().includes(qq);
    });
  }

  if (!productos.length) {
    sendMessage_(chatId, 'No encontré productos.');
    return;
  }

  var lines = ['🛍️ Productos (' + productos.length + ')', ''];
  productos.slice(0, 60).forEach(function(p) {
    var stock = Number(p.stock || 0);
    var icon  = stock <= 0 ? '🚫' : (stock <= 3 ? '⚠️' : '✅');
    lines.push(icon + ' ' + p.nombre + ' — $' + Number(p.precioActual || 0).toFixed(2) + ' · stock ' + stock);
  });
  sendMessage_(chatId, lines.join('\n'));
}

function cmdTareas_(chatId) {
  var productos = getProductos_();
  var noSeo  = productos.filter(function(p) { return !p.seoTitle && !p.seoDescription; }).length;
  var noRecs = productos.filter(function(p) { return !p.recomendados || !p.recomendados.length; }).length;
  var bajos  = productos.filter(function(p) { var s = Number(p.stock || 0); return s > 0 && s <= 3; }).length;
  var agot   = productos.filter(function(p) { return Number(p.stock || 0) <= 0; }).length;

  var lines = ['✅ Tareas sugeridas', ''];
  if (noSeo)       lines.push('• Generar SEO a ' + Math.min(5, noSeo) + ' productos.');
  if (noRecs)      lines.push('• Generar recomendaciones a ' + Math.min(5, noRecs) + ' productos.');
  if (bajos || agot) lines.push('• Revisar stock: ' + bajos + ' bajos, ' + agot + ' agotados.');
  lines.push('• Crear campaña del día.');
  lines.push('• Actualizar tienda si hiciste cambios.');
  sendMessage_(chatId, lines.join('\n'));
}

function cmdVentaManual_(chatId, text) {
  var body = text.replace('/venta', '').trim();
  var m    = body.match(/^(.+?)\s+x(\d+)\s+\$([0-9]+(?:\.[0-9]+)?)$/i);

  if (!m) {
    sendMessage_(chatId, 'Uso: /venta Nombre x2 $50');
    return;
  }

  var item = { nombre: m[1].trim(), cantidad: Number(m[2]), precio: Number(m[3]) };
  PROPS.setProperty('PENDING_' + chatId, JSON.stringify([item]));

  sendMessage_(chatId,
    '¿Registrar venta?\n\n' +
    item.nombre + '\n' +
    'Cantidad: ' + item.cantidad + '\n' +
    'Total: $' + (item.cantidad * item.precio).toFixed(2),
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Registrar venta', callback_data: 'venta_ok' },
          { text: '❌ Cancelar',        callback_data: 'venta_cancel' }
        ]]
      }
    }
  );
}

/*******************************************************
 * Venta / Orden WhatsApp
 *******************************************************/

function parseOrden_(text) {
  var upper = String(text).toUpperCase();
  if (!upper.includes('NUEVA ORDEN') || !upper.includes('TIENDAMAX')) return null;

  var items = [];
  var lines = text.split('\n');

  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/\*?\d+\.\*?\s+(.+)/);
    if (!m) continue;

    var nombre   = m[1].replace(/\*/g, '').trim();
    var cantidad = 1;
    var precio   = 0;

    for (var j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      var cm = lines[j].match(/Cant[.:\s]*\*?(\d+)\*?/i);
      var pm = lines[j].match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*USD/i);
      if (cm) cantidad = Number(cm[1]);
      if (pm) precio   = Number(pm[1]);
    }

    items.push({ nombre: nombre, cantidad: cantidad, precio: precio });
  }

  return items.length ? items : null;
}

function registrarVenta_(items) {
  var msgs = [];
  items.forEach(function(item) {
    var id    = Date.now();
    var total = Number(item.precio || 0) * Number(item.cantidad || 1);
    putFirebase_('ventas/' + id, {
      id:         id,
      productoId: 0,
      producto:   item.nombre,
      precio:     Number(item.precio || 0),
      cantidad:   Number(item.cantidad || 1),
      total:      total,
      ganancia:   0,
      fecha:      Utilities.formatDate(new Date(), 'America/Havana', 'dd/MM/yyyy'),
      fuente:     'telegram_apps_script'
    });
    msgs.push('✅ ' + item.nombre + ' x' + item.cantidad + ' · $' + total.toFixed(2));
  });
  return '🎉 Venta registrada\n\n' + msgs.join('\n');
}

/*******************************************************
 * Firebase / Productos
 *******************************************************/

function getFirebase_(path) {
  var res = UrlFetchApp.fetch(firebaseUrl_() + '/' + path + '.json', {
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) return null;
  return JSON.parse(res.getContentText() || 'null');
}

function putFirebase_(path, data) {
  UrlFetchApp.fetch(firebaseUrl_() + '/' + path + '.json', {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
}

function getProductos_() {
  try {
    var res = UrlFetchApp.fetch(productosUrl_(), { muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) return [];
    var data = JSON.parse(res.getContentText());
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/*******************************************************
 * Utilidades
 *******************************************************/

function objectValues_(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).map(function(k) { return obj[k]; })
    .filter(function(v) { return v && typeof v === 'object'; });
}

function sumCounters_(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  var total = 0;
  Object.keys(obj).forEach(function(k) {
    var v = obj[k];
    if (typeof v === 'number') total += v;
    else if (v && typeof v === 'object' && typeof v.count === 'number') total += v.count;
  });
  return total;
}

function flattenInteresados_(raw) {
  var arr = [];
  if (!raw || typeof raw !== 'object') return arr;
  Object.keys(raw).forEach(function(productoId) {
    var node = raw[productoId];
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function(k) {
      var v = node[k];
      if (v && typeof v === 'object') arr.push(v);
    });
  });
  return arr.sort(function(a, b) { return Number(b.ts || 0) - Number(a.ts || 0); });
}

function topInteresados_(arr) {
  var map = {};
  arr.forEach(function(x) {
    var id = String(x.productoId || x.producto || '');
    if (!map[id]) map[id] = { productoId: x.productoId, producto: x.producto || 'Producto', count: 0 };
    map[id].count++;
  });
  return Object.keys(map).map(function(k) { return map[k]; })
    .sort(function(a, b) { return b.count - a.count; });
}

/*******************************************************
 * Anti-duplicado de texto (órdenes pegadas)
 *******************************************************/

function isDuplicateText_(text) {
  var hash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
  ).slice(0, 24);
  var key = 'TH_' + hash;
  if (PROPS.getProperty(key)) return true;
  try { PROPS.setProperty(key, String(Date.now())); } catch (e) {}
  return false;
}

/*******************************************************
 * Anti-duplicado de update_id (reintentos de Telegram)
 *******************************************************/

function isDuplicateUpdate_(updateId) {
  if (updateId === undefined || updateId === null) return false;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    var key = 'UID_' + updateId;
    if (PROPS.getProperty(key)) return true;
    try { PROPS.setProperty(key, '1'); } catch (e) {}
    return false;
  } catch (err) {
    // No se pudo bloquear — dejar pasar para no perder mensajes
    return false;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/*******************************************************
 * Limpieza (ejecutar manualmente o via trigger diario)
 *******************************************************/

function limpiarHashes() {
  var props = PropertiesService.getScriptProperties();
  var all   = props.getProperties();
  var count = 0;
  Object.keys(all).forEach(function(k) {
    if (k.startsWith('TH_') || k.startsWith('UID_') ||
        k.startsWith('MSG_HASH_') || k.startsWith('UPDATE_ID_')) {
      props.deleteProperty(k);
      count++;
    }
  });
  Logger.log('Limpieza completada: ' + count + ' entradas eliminadas.');
}

/*******************************************************
 * Setup y pruebas
 *******************************************************/

function setWebhook() {
  var webAppUrl = getProp_('WEB_APP_URL');
  if (!webAppUrl) throw new Error('Falta WEB_APP_URL en Script Properties');
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + botToken_() + '/setWebhook?url=' + encodeURIComponent(webAppUrl),
    { muteHttpExceptions: true }
  );
  Logger.log(res.getContentText());
}

function deleteWebhook() {
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + botToken_() + '/deleteWebhook',
    { muteHttpExceptions: true }
  );
  Logger.log(res.getContentText());
}

function getWebhookInfo() {
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + botToken_() + '/getWebhookInfo',
    { muteHttpExceptions: true }
  );
  Logger.log(res.getContentText());
}

function testSend() {
  sendMessage_(adminId_(), '✅ TiendaMax Bot OK — ' +
    Utilities.formatDate(new Date(), 'America/Havana', 'dd/MM/yyyy HH:mm'));
}

function testProps() {
  Logger.log('BOT_TOKEN largo: '   + botToken_().length);
  Logger.log('ADMIN_CHAT_ID: '     + adminId_());
  Logger.log('FIREBASE_URL: '      + firebaseUrl_());
  Logger.log('PRODUCTOS_URL: '     + productosUrl_());
  Logger.log('SITE_URL: '          + siteUrl_());
  Logger.log('WEB_APP_URL: '       + getProp_('WEB_APP_URL'));
}
