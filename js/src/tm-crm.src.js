/* ============================================================
   TiendaMax — módulo: tm-crm
   Seguimiento post-venta: a quién toca escribirle hoy y qué decirle.

   Por qué existe: el tab Clientes del admin YA armaba la lista de clientes a
   partir de las ventas (lee v.cliente y v.telefono), y salía siempre vacía —
   porque el formulario de venta nunca pidió esos dos datos. La mitad de leer
   estaba escrita; faltaba la de capturar. Esto es la otra mitad: con nombre y
   WhatsApp guardados, calcular qué seguimiento toca según los días que han
   pasado desde la compra.

   Todo son funciones puras sobre la lista de ventas — sin DOM, sin red — para
   poder probarlas y para que el panel sea solo pintura.

   IMPORTANTE — dónde vive el dato del cliente: SOLO en localStorage, junto a
   la venta. NO se manda a Firebase. /pedidos/$id tiene ".read": true (cada
   pedido es legible por cualquiera), y aquí no hay autenticación: subir ahí un
   nombre y un teléfono es publicarlos. Ver CLAUDE.md.
   ============================================================ */

const TM_SEG_KEY = 'tm_seguimientos_v1';
const TM_SEG_CONTACTO_KEY = 'tm_seg_contacto_v1';

/* Días de descanso tras escribirle a alguien. Un cliente con dos compras
   puede tener dos hitos vencidos a la vez —"¿te llegó el router?" y "¿cómo va
   la batería?"— y los dos son legítimos, pero no el mismo día. Con esto el
   segundo espera su turno en vez de desaparecer. */
const TM_SEG_ESPERA_DIAS = 3;

/* Los tres hitos, en orden. `ventana` es cuántos días sigue teniendo sentido
   mandarlo: preguntar "¿te llegó bien?" ocho meses después no es un
   seguimiento tardío, es una torpeza. Pasada la ventana el hito se salta y se
   pasa al siguiente. El último no caduca: ofrecer una recompra siempre vale. */
const TM_SEGUIMIENTOS = [
    {
        hito: 'inicial',
        dias: 3,
        ventana: 14,
        etiqueta: 'Seguimiento inicial',
        icono: '📦',
        para: 'Confirmar que llegó y que funciona'
    },
    {
        hito: 'satisfaccion',
        dias: 30,
        ventana: 45,
        etiqueta: 'Satisfacción',
        icono: '⭐',
        para: 'Un mes después: ver si va bien y pedir reseña'
    },
    {
        hito: 'recompra',
        dias: 90,
        ventana: Infinity,
        etiqueta: 'Recompra',
        icono: '🔁',
        para: 'Ofrecer complemento o repetir compra'
    }
];


/** Fecha de una venta. El id es el Date.now() del registro; `fecha` es texto
 *  ya formateado en es-ES y no se puede parsear fiable. */
function tmVentaTs(venta) {
    if (!venta) return null;
    const id = Number(venta.id);
    if (isFinite(id) && id > 1000000000000) return id;
    const t = Date.parse(venta.fecha || '');
    return isNaN(t) ? null : t;
}

/** Teléfono normalizado a dígitos, o '' si no hay uno usable. */
function tmTelDe(venta) {
    const bruto = (venta && (venta.telefono || venta.tel)) || '';
    const soloDigitos = String(bruto).replace(/\D/g, '');
    // Menos de 6 dígitos no es un número: es un apunte a medias.
    return soloDigitos.length >= 6 ? soloDigitos : '';
}

function tmNombreDe(venta) {
    return String((venta && (venta.cliente || venta.nombre)) || '').trim();
}

function tmSeguimientosHechos() {
    try {
        const v = JSON.parse(localStorage.getItem(TM_SEG_KEY) || '{}');
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
}

function _tmClaveSeg(ventaId, hito) { return String(ventaId) + '|' + hito; }

/** Marca un hito como atendido. Marca también los anteriores: si escribes el
 *  de 30 días, el de 3 ya no tiene sentido — y sin esto reaparecería solo. */
function tmMarcarSeguimiento(ventaId, hito, valor) {
    const hechos = tmSeguimientosHechos();
    const i = TM_SEGUIMIENTOS.findIndex(s => s.hito === hito);
    if (i < 0) return hechos;
    if (valor === false) {
        delete hechos[_tmClaveSeg(ventaId, hito)];
    } else {
        for (let j = 0; j <= i; j++) {
            hechos[_tmClaveSeg(ventaId, TM_SEGUIMIENTOS[j].hito)] = Date.now();
        }
    }
    try { localStorage.setItem(TM_SEG_KEY, JSON.stringify(hechos)); } catch (e) {}
    return hechos;
}

/** El hito que toca para UNA venta, o null si no toca ninguno.
 *  Devuelve el más avanzado que esté vencido y dentro de ventana: si estuviste
 *  dos meses sin mirar esto, no se le mandan tres mensajes seguidos al mismo
 *  cliente — se manda el que corresponde a hoy. */
function tmSeguimientoDe(venta, hechos, ahora) {
    hechos = hechos || {};
    ahora = ahora || Date.now();
    const ts = tmVentaTs(venta);
    if (!ts) return null;
    const tel = tmTelDe(venta);
    if (!tel) return null;                    // sin número no hay a quién escribir
    const dias = Math.floor((ahora - ts) / 86400000);
    if (dias < 0) return null;

    let elegido = null;
    for (const s of TM_SEGUIMIENTOS) {
        if (dias < s.dias) break;                                   // aún no toca
        if (hechos[_tmClaveSeg(venta.id, s.hito)]) continue;        // ya atendido
        if (dias > s.dias + s.ventana) continue;                    // se pasó de tarde
        elegido = s;
    }
    if (!elegido) return null;
    return {
        venta: venta,
        hito: elegido.hito,
        etiqueta: elegido.etiqueta,
        icono: elegido.icono,
        para: elegido.para,
        nombre: tmNombreDe(venta),
        tel: tel,
        dias: dias,
        // Cuántos días lleva esperando desde que tocaba. Sirve para ordenar:
        // primero lo más atrasado, que es lo que más se enfría.
        atraso: dias - elegido.dias
    };
}

/** Cuándo se le escribió por última vez a cada número. */
function tmContactos() {
    try {
        const v = JSON.parse(localStorage.getItem(TM_SEG_CONTACTO_KEY) || '{}');
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
}

/** Apunta que hoy ya se le escribió a ese número. Lo llama quien ABRE el chat;
 *  saltar un seguimiento no cuenta, porque ahí no se le escribió a nadie. */
function tmRegistrarContacto(tel) {
    const n = String(tel || '').replace(/\D/g, '');
    if (n.length < 6) return;
    const c = tmContactos();
    c[n] = Date.now();
    try { localStorage.setItem(TM_SEG_CONTACTO_KEY, JSON.stringify(c)); } catch (e) {}
}

/** Todo lo que toca hoy, lo más atrasado primero.
 *
 *  Dos reglas viven aquí y no en el panel, que es donde estaban antes y por eso
 *  no se cumplían: como mucho UN seguimiento por número —una persona con dos
 *  compras no recibe dos mensajes— y nada para quien ya recibió uno en los
 *  últimos días. Agrupar solo al pintar no bastaba: en cuanto se marcaba uno,
 *  el repintado sacaba el siguiente de la misma persona con su botón listo. */
function tmSeguimientosPendientes(ventas, hechos, ahora, contactos) {
    hechos = hechos || tmSeguimientosHechos();
    contactos = contactos || tmContactos();
    ahora = ahora || Date.now();
    const espera = TM_SEG_ESPERA_DIAS * 86400000;
    const porTel = {};
    (ventas || []).forEach(v => {
        const s = tmSeguimientoDe(v, hechos, ahora);
        if (!s) return;
        const ultimo = Number(contactos[s.tel]) || 0;
        if (ultimo && (ahora - ultimo) < espera) return;      // ya se le escribió hace poco
        // De la misma persona, el más atrasado: es el que más se ha enfriado.
        if (!porTel[s.tel] || s.atraso > porTel[s.tel].atraso) porTel[s.tel] = s;
    });
    return Object.keys(porTel).map(k => porTel[k]).sort((a, b) => b.atraso - a.atraso);
}

/** Nombres de los productos de una venta, para poder nombrarlos en el mensaje.
 *  Un seguimiento que dice "tu compra" en vez de "tu inversor" se lee como
 *  plantilla, y una plantilla no consigue respuesta. */
function tmProductosDeVenta(venta) {
    if (!venta) return [];
    if (Array.isArray(venta.items) && venta.items.length) {
        return venta.items.map(it => String((it && it.producto) || '')).filter(Boolean);
    }
    return venta.producto ? [String(venta.producto)] : [];
}

/* ── La reseña ──────────────────────────────────────────────────────────
   Casi nadie dejaba reseña (3 en toda la tienda) y no por el texto: se pedía
   al mes, metida en una frase con el enlace entre paréntesis, a todos por
   igual, y el enlace abría la tienda entera (≈570 KB en 3G) para luego bajar
   hasta el final de la ficha y rellenar cinco campos.

   Ahora va en dos pasos. El mensaje de los 3 días solo pregunta. Si el
   cliente contesta contento, el panel ofrece «⭐ Pedir reseña» —se pide a
   quien acaba de decir que está bien, en ese momento— con un enlace a
   resena.html: una página de pocos KB con las estrellas arriba y el nombre ya
   puesto. Y quien prefiere contestar por el chat, contesta por el chat: el
   gestor la publica desde el panel («✍️ Publicar su reseña»). */
const TM_RESENA_KEY = 'tm_resena_pedida_v1';
/* Hasta cuándo, contado desde la compra, tiene sentido ofrecer los botones de
   la reseña. Pasado eso es mejor dejarlo: ya no es una opinión fresca. */
const TM_RESENA_VENTANA_DIAS = 45;

function tmResenasPedidas() {
    try {
        const v = JSON.parse(localStorage.getItem(TM_RESENA_KEY) || '{}');
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
}
function tmMarcarResenaPedida(ventaId) {
    const p = tmResenasPedidas();
    p[String(ventaId)] = Date.now();
    try { localStorage.setItem(TM_RESENA_KEY, JSON.stringify(p)); } catch (e) {}
    return p;
}

/** Reseña ya publicada para esa venta (desde el panel): la fila deja de
 *  ofrecer botones. La que deja el cliente en resena.html no llega aquí —no
 *  hay forma de saber de qué venta es sin pedirle datos—, así que esa fila
 *  sigue en «pedida» hasta que caduca la ventana. */
const TM_RESENA_HECHA_KEY = 'tm_resena_hecha_v1';
function tmResenasHechas() {
    try {
        const v = JSON.parse(localStorage.getItem(TM_RESENA_HECHA_KEY) || '{}');
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
}
function tmMarcarResenaHecha(ventaId) {
    const h = tmResenasHechas();
    h[String(ventaId)] = Date.now();
    try { localStorage.setItem(TM_RESENA_HECHA_KEY, JSON.stringify(h)); } catch (e) {}
    return h;
}

/** Qué se puede hacer hoy con la reseña de UNA venta:
 *  'pedir'   — ya se le escribió el primer seguimiento y aún no se pidió;
 *  'pedida'  — ya se pidió (queda el botón de publicar lo que conteste);
 *  null      — sin producto de la tienda, sin WhatsApp, o fuera de plazo.
 *  No se pide antes de haber preguntado qué tal: pedir reseña a quien aún no
 *  ha dicho cómo le fue es pedírsela también a quien está molesto. */
function tmResenaEstado(venta, hechos, pedidas, ahora) {
    hechos = hechos || tmSeguimientosHechos();
    pedidas = pedidas || tmResenasPedidas();
    ahora = ahora || Date.now();
    if (!venta || !tmTelDe(venta) || !tmProductoResena(venta)) return null;
    const ts = tmVentaTs(venta);
    if (!ts || (ahora - ts) > TM_RESENA_VENTANA_DIAS * 86400000) return null;
    if (tmResenasHechas()[String(venta.id)]) return null;
    if (pedidas[String(venta.id)]) return 'pedida';
    return hechos[_tmClaveSeg(venta.id, 'inicial')] ? 'pedir' : null;
}

/** El producto de la venta sobre el que se pide opinión: el primero que vino
 *  del catálogo (un artículo escrito a mano no tiene ficha donde reseñarlo).
 *  Solo uno: dos enlaces se leen a spam, y con una reseña ya se gana. */
function tmProductoResena(venta) {
    if (!venta) return null;
    const it = (Array.isArray(venta.items) ? venta.items : []).find(x => x && x.productoId);
    if (it) return { id: String(it.productoId), nombre: String(it.producto || '') };
    return venta.productoId ? { id: String(venta.productoId), nombre: String(venta.producto || '') } : null;
}

/** Enlace a la página de reseña de ese producto, con el nombre de pila del
 *  cliente ya puesto. `v=1` dice que viene de una compra (la reseña sale
 *  marcada «compró en TiendaMax»). '' si la venta no guardó el producto. */
function tmEnlaceResena(venta) {
    const pr = tmProductoResena(venta);
    if (!pr) return '';
    const nombre = tmNombreDe(venta).split(/\s+/)[0] || '';
    return 'https://tiendamax.org/resena?p=' + encodeURIComponent(pr.id) +
           (nombre ? '&n=' + encodeURIComponent(nombre) : '') + '&v=1';
}

function _tmListaProductos(nombres) {
    if (!nombres.length) return 'tu compra';
    if (nombres.length === 1) return nombres[0];
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

function _tmPrimerNombre(venta) {
    return tmNombreDe(venta).split(/\s+/)[0] || '';
}

/** El pedido de reseña, para mandar cuando el cliente ya dijo que va bien.
 *  Corto, una sola petición, el enlace en su propia línea, y la salida de
 *  contestar por el chat para quien no abre enlaces. */
function tmTextoPedirResena(venta, tienda) {
    if (!venta) return '';
    const nombre = _tmPrimerNombre(venta);
    const pr = tmProductoResena(venta);
    const prod = (pr && pr.nombre) || _tmListaProductos(tmProductosDeVenta(venta));
    const enlace = tmEnlaceResena(venta);
    return '¡Qué bueno' + (nombre ? ', ' + nombre : '') + '! 🙌\n' +
           '¿Me regalas tu opinión sobre ' + prod + '? Es un minuto y ayuda mucho a otros a decidirse' +
           (enlace ? ':\n👉 ' + enlace : '.') + '\n\n' +
           'Si te es más fácil, respóndeme aquí con las estrellas (del 1 al 5) y una frase, y la publico yo con tu nombre.';
}

function tmWaPedirResena(venta, tienda) {
    const tel = tmTelDe(venta);
    if (!tel) return '';
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(tmTextoPedirResena(venta, tienda));
}

/** El texto que se le manda al cliente. Sin "estimado cliente": esto lo lee un
 *  vecino que compró un inversor, no un suscriptor. Una pregunta por mensaje. */
function tmTextoSeguimiento(seg, tienda) {
    if (!seg) return '';
    const nombre = seg.nombre ? seg.nombre.split(/\s+/)[0] : '';
    const saludo = nombre ? ('Hola ' + nombre) : 'Hola';
    const prods = _tmListaProductos(tmProductosDeVenta(seg.venta));
    const firma = (tienda || 'TiendaMax');

    if (seg.hito === 'inicial') {
        // Solo la pregunta. La reseña se pide después, a quien conteste que va bien.
        return saludo + ', soy de ' + firma + ' 👋\n' +
               '¿Qué tal te va con ' + prods + '? ¿Ya lo tienes funcionando?\n\n' +
               'Si te surge cualquier duda con la instalación, me escribes por aquí.';
    }
    if (seg.hito === 'satisfaccion') {
        /* Si la reseña ya se pidió, el mes es solo un «¿sigue bien?»: pedirla
           dos veces es lo que hace que la gente deje de contestar. Si nunca se
           pidió (el primer seguimiento se saltó), se pide aquí, igual de corto. */
        const yaPedida = !!tmResenasPedidas()[String(seg.venta && seg.venta.id)];
        const base = saludo + ', soy de ' + firma + '. Ya va un mes con ' + prods + ', ¿sigue todo bien?';
        if (yaPedida) return base + '\n\nSi algo no va como debe, dime y lo resolvemos.';
        const enlace = tmEnlaceResena(seg.venta);
        return base + '\n\n' +
               (enlace ? 'Si estás contento, ¿me dejas tu opinión? Es un minuto:\n👉 ' + enlace + '\n\n' +
                         'O respóndeme aquí con las estrellas (1 a 5) y una frase, y yo publico tu reseña.'
                       : 'Si estás contento, respóndeme con las estrellas (1 a 5) y una frase, y yo publico tu reseña.') +
               '\nY si algo falla, prefiero saberlo y resolverlo.';
    }
    return saludo + ', soy de ' + firma + '. Hace un tiempo te llevaste ' + prods +
           '.\n\n¿Sigue todo bien? Si te hace falta algo para completarlo o quieres ' +
           'repetir, dime y te aparto lo que haya con precio de cliente.';
}

/** Enlace de WhatsApp listo para abrir. */
function tmWaSeguimiento(seg, tienda) {
    if (!seg || !seg.tel) return '';
    return 'https://wa.me/' + seg.tel + '?text=' + encodeURIComponent(tmTextoSeguimiento(seg, tienda));
}
