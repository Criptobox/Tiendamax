/* ============================================================
   TiendaMax — módulo: tm-publicar
   Plantillas de texto para los posts y registro de publicaciones.

   Todo vive en localStorage, no en Firebase, y es a propósito: son datos de
   trabajo del admin, no del sitio. Meterlos en la base obligaría a abrirlos a
   escritura anónima (no hay autenticación), y ya sabemos cómo acaba eso.

   NO toca el generador de carteles: aquí solo se arma TEXTO.
   ============================================================ */

// ===== PLANTILLAS DE TEXTO =====

const TM_PLANTILLAS_KEY = 'tm_plantillas_v1';

// Cada variable se sustituye por su valor al usar la plantilla. El editor las
// enseña como botones para insertarlas sin tener que recordarlas.
const TM_PLANTILLA_VARS = [
    { v: 'nombre',         d: 'Nombre del producto' },
    { v: 'descripcion',    d: 'Descripción completa' },
    { v: 'inicio_desc',    d: 'Primeras 2 líneas de la descripción' },
    { v: 'precioActual',   d: 'Precio de venta' },
    { v: 'precioOriginal', d: 'Precio antes del descuento' },
    { v: 'ahorro',         d: 'Cuánto se ahorra' },
    { v: 'descuento',      d: 'Porcentaje de descuento' },
    { v: 'garantia',       d: 'Garantía del producto' },
    { v: 'stock',          d: 'Unidades disponibles' },
    { v: 'categoria',      d: 'Categoría' },
    { v: 'wa_link',        d: 'Enlace de WhatsApp con el pedido escrito' },
    { v: 'url_producto',   d: 'Enlace a la ficha en la tienda' },
    { v: 'hashtags',       d: 'Hashtags de la categoría' },
    // Estas traen la línea entera y se quedan VACÍAS si no aplican. Sin ellas
    // salía "Ahorras $0 USD (0%)" en productos sin descuento, o "Antes $300 →
    // AHORA $300", que resta credibilidad en vez de sumarla.
    { v: 'linea_precio',   d: 'Precio (con el "antes" solo si hay descuento)' },
    { v: 'linea_ahorro',   d: 'Cuánto ahorra — vacío si no hay descuento' },
    { v: 'linea_garantia', d: 'Garantía — vacío si el producto no la tiene' },
    { v: 'linea_stock',    d: 'Unidades — vacío si está agotado' }
];

function _tmNum(x) { const n = Number(x); return isFinite(n) ? n : 0; }

function _tmWaNumero() {
    // pubWaNum vive en admin.html y ya lee la clave correcta; se usa esa para
    // no acabar con dos números distintos según quién arme el texto.
    try { if (typeof pubWaNum === 'function') return pubWaNum(); } catch (e) {}
    // Solo 'whatsappNumero': es la única clave que alguien escribe. Aquí había
    // también un fallback a 'adminWhatsappNum', que es el id del input y no una
    // clave de localStorage — nunca devolvió nada.
    return String(localStorage.getItem('whatsappNumero') || '5354320170').replace(/\D/g, '');
}

/** Enlace a la ficha. Se delega en pubUrl cuando existe para que la plantilla
 *  lleve el mismo utm_source que el resto del panel — sin eso, lo publicado
 *  desde aquí no aparecería atribuido a ninguna red en Analytics. */
function _tmUrlProducto(p, red) {
    try { if (typeof pubUrl === 'function') return pubUrl(p, red || 'copy'); } catch (e) {}
    return 'https://tiendamax.org/p/producto-' + p.id + '.html';
}

/** Valores de las variables para un producto concreto. */
function tmVarsProducto(p, red) {
    if (!p) return {};
    const actual = _tmNum(p.precioActual);
    const original = _tmNum(p.precioOriginal) || actual;
    const ahorro = Math.max(0, original - actual);
    const desc = String(p.descripcion || '').trim();
    const url = _tmUrlProducto(p, red);
    const cat = String(p.categoria || '').trim();
    return {
        nombre: p.nombre || '',
        descripcion: desc,
        // Dos líneas: en Facebook lo que va después del "ver más" casi nadie
        // lo lee, así que la plantilla corta suele rendir mejor.
        inicio_desc: desc.split('\n').slice(0, 2).join('\n'),
        precioActual: String(actual),
        precioOriginal: String(original),
        ahorro: String(ahorro),
        descuento: String(_tmNum(p.descuento)),
        garantia: p.garantia || 'Consultar',
        stock: String(_tmNum(p.stock)),
        categoria: cat,
        wa_link: (function () {
            try { if (typeof pubWaLink === 'function') return pubWaLink(p, red || 'copy'); } catch (e) {}
            return 'https://wa.me/' + _tmWaNumero() + '?text=' +
                   encodeURIComponent('Hola, quiero: ' + (p.nombre || '') + '\n' + url);
        })(),
        url_producto: url,
        linea_precio: (ahorro > 0)
            ? ('💰 Antes $' + original + ' → AHORA $' + actual + ' USD')
            : ('💰 Precio: $' + actual + ' USD'),
        linea_ahorro: (ahorro > 0)
            ? ('🎉 Ahorras $' + ahorro + ' USD' + (_tmNum(p.descuento) > 0 ? ' (' + _tmNum(p.descuento) + '%)' : ''))
            : '',
        linea_garantia: (p.garantia && String(p.garantia).trim())
            ? ('🛡️ Garantía: ' + String(p.garantia).trim()) : '',
        linea_stock: (_tmNum(p.stock) > 0)
            ? ('📦 Quedan ' + _tmNum(p.stock) + ' unidades') : '',
        hashtags: ('#TiendaMax #Cuba ' + (cat ? '#' + cat.replace(/\s+/g, '') : '')).trim()
    };
}

/** Sustituye {variable} por su valor. Lo que no reconoce lo deja tal cual,
 *  para no borrar en silencio algo que el admin escribió a mano. */
function tmAplicarPlantilla(texto, producto, red) {
    const vars = tmVarsProducto(producto, red);
    const out = String(texto || '').replace(/\{(\w+)\}/g, (m, k) =>
        Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m);
    // Una variable vacía deja su línea en blanco; sin esto el post sale con
    // huecos de tres o cuatro saltos donde antes había una frase.
    return out.replace(/[ \t]+$/gm, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
}

function tmPlantillasPorDefecto() {
    return [
        {
            id: 'def_fb', nombre: '📘 Facebook — completa', red: 'fb',
            texto: '🛍️ {nombre}\n\n{inicio_desc}\n\n{linea_precio}\n' +
                   '{linea_garantia}\n{linea_stock}\n\n' +
                   '📲 Pídelo aquí:\n{wa_link}\n\n🔗 Fotos y detalles:\n{url_producto}\n\n{hashtags}'
        },
        {
            id: 'def_oferta', nombre: '🔥 Facebook — con descuento', red: 'fb',
            texto: '🔥 OFERTA — {nombre}\n\n{inicio_desc}\n\n' +
                   '{linea_precio}\n{linea_ahorro}\n{linea_garantia}\n{linea_stock}\n\n' +
                   '📲 {wa_link}\n\n{hashtags}'
        },
        {
            id: 'def_rev', nombre: '🟠 Revolico — anuncio', red: 'revolico',
            texto: '{nombre}\n\n{inicio_desc}\n\n{linea_precio}\n' +
                   '{linea_garantia}\n{linea_stock}\n\nPedir por WhatsApp: {wa_link}'
        },
        {
            id: 'def_wa', nombre: '🟢 Estado de WhatsApp — corta', red: 'wa',
            texto: '{nombre} — ${precioActual} USD\n{linea_garantia}\nPídelo: {wa_link}'
        }
    ];
}

function tmPlantillas() {
    let guardadas = null;
    try { guardadas = JSON.parse(localStorage.getItem(TM_PLANTILLAS_KEY) || 'null'); } catch (e) {}
    if (!Array.isArray(guardadas) || !guardadas.length) return tmPlantillasPorDefecto();
    return guardadas;
}

function _tmGuardarPlantillas(lista) {
    try { localStorage.setItem(TM_PLANTILLAS_KEY, JSON.stringify(lista)); return true; }
    catch (e) { return false; }
}

function tmGuardarPlantilla(plantilla) {
    if (!plantilla || !plantilla.nombre || !plantilla.texto) return false;
    const lista = tmPlantillas().slice();
    const i = lista.findIndex(x => x.id === plantilla.id);
    if (i >= 0) lista[i] = Object.assign({}, lista[i], plantilla);
    else lista.push(Object.assign({ id: 'pl_' + Date.now(), usos: 0 }, plantilla));
    return _tmGuardarPlantillas(lista);
}

function tmBorrarPlantilla(id) {
    return _tmGuardarPlantillas(tmPlantillas().filter(x => x.id !== id));
}

/** Suma un uso. Sirve para ordenar por las que de verdad usas. */
function tmContarUsoPlantilla(id) {
    const lista = tmPlantillas().slice();
    const p = lista.find(x => x.id === id);
    if (!p) return;
    p.usos = (_tmNum(p.usos) || 0) + 1;
    _tmGuardarPlantillas(lista);
}


// ===== REGISTRO DE PUBLICACIONES =====

const TM_PUBLOG_KEY = 'tm_publog_v1';
const TM_PUBLOG_MAX = 600;   // ~medio año publicando a diario

/** Apunta que un producto se publicó en una red. Se llama solo desde las
 *  funciones de copiar: el admin no tiene que registrar nada a mano, que es
 *  justo lo que haría que el registro quedara siempre incompleto. */
/** `ts` solo lo usa la migración del historial viejo del panel: sin él, las
 *  publicaciones de hace semanas se apuntarían con la fecha de hoy y "hace X
 *  días" pasaría a decir "hoy" para todo el catálogo. */
function tmRegistrarPublicacion(productoId, red, destino, ts) {
    if (!productoId || !red) return;
    try {
        const log = tmPublicaciones().slice();
        const cuando = Number(ts);
        log.push({ pid: String(productoId), red: String(red),
                   destino: String(destino || ''),
                   ts: (isFinite(cuando) && cuando > 0) ? cuando : Date.now() });
        localStorage.setItem(TM_PUBLOG_KEY, JSON.stringify(log.slice(-TM_PUBLOG_MAX)));
    } catch (e) {}
}

function tmPublicaciones() {
    try {
        const v = JSON.parse(localStorage.getItem(TM_PUBLOG_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}

/** Última vez que se publicó ese producto (en una red concreta o en cualquiera). */
function tmUltimaPublicacion(productoId, red) {
    const pid = String(productoId);
    let ts = 0;
    tmPublicaciones().forEach(e => {
        if (e.pid !== pid) return;
        if (red && e.red !== red) return;
        if (e.ts > ts) ts = e.ts;
    });
    return ts || null;
}

/** Días desde la última publicación. null si no se publicó nunca. */
function tmDiasSinPublicar(productoId, red) {
    const ts = tmUltimaPublicacion(productoId, red);
    if (!ts) return null;
    return Math.floor((Date.now() - ts) / 86400000);
}

/** Cuántas publicaciones por día, para pintar el calendario.
 *  Devuelve { 'AAAA-MM-DD': n }. */
function tmPublicacionesPorDia(desdeTs) {
    const out = {};
    tmPublicaciones().forEach(e => {
        if (desdeTs && e.ts < desdeTs) return;
        const d = new Date(e.ts);
        const k = d.getFullYear() + '-' +
                  String(d.getMonth() + 1).padStart(2, '0') + '-' +
                  String(d.getDate()).padStart(2, '0');
        out[k] = (out[k] || 0) + 1;
    });
    return out;
}

/** Productos que llevan `dias` o más sin publicarse en ninguna red.
 *  Los que no se publicaron NUNCA también cuentan: son los que más se olvidan. */
function tmProductosSinPublicar(lista, dias) {
    const limite = _tmNum(dias) || 21;
    return (lista || []).filter(p => {
        if (!p || p.activo === false) return false;
        const d = tmDiasSinPublicar(p.id);
        return d === null || d >= limite;
    });
}

/** Las últimas N publicaciones, de la más reciente a la más vieja. */
function tmPublicacionesRecientes(n) {
    return tmPublicaciones().slice().sort((a, b) => b.ts - a.ts).slice(0, _tmNum(n) || 20);
}
