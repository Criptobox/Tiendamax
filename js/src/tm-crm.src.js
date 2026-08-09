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

function _tmListaProductos(nombres) {
    if (!nombres.length) return 'tu compra';
    if (nombres.length === 1) return nombres[0];
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

/** El texto que se le manda al cliente. Sin emojis de relleno ni "estimado
 *  cliente": esto lo lee un vecino que compró un inversor, no un suscriptor. */
function tmTextoSeguimiento(seg, tienda) {
    if (!seg) return '';
    const nombre = seg.nombre ? seg.nombre.split(/\s+/)[0] : '';
    const saludo = nombre ? ('Hola ' + nombre) : 'Hola';
    const prods = _tmListaProductos(tmProductosDeVenta(seg.venta));
    const firma = (tienda || 'TiendaMax');

    if (seg.hito === 'inicial') {
        return saludo + ', te escribo de ' + firma + '. Hace unos días te llevaste ' +
               prods + ' — ¿te llegó bien y está funcionando como esperabas?\n\n' +
               'Si tienes cualquier duda con la instalación, dime y te ayudo.';
    }
    if (seg.hito === 'satisfaccion') {
        return saludo + ', soy de ' + firma + '. Ya va un mes con ' + prods +
               ' — ¿todo bien?\n\n' +
               'Si estás contento, me ayudaría mucho que dejaras una reseña; y si algo no va ' +
               'como debe, prefiero saberlo y resolverlo.';
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
