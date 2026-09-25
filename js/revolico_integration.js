/**
 * revolico_integration.js — TiendaMax v2
 * Asistente para publicar en Facebook y Revolico desde el panel admin.
 */

function _escH(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


/* El catálogo con DESCRIPCIONES. En el panel hay dos: PRODUCTOS (admin.html),
   que las trae —cargarDatos las rellena desde productos.json—, y el bareword
   `productos` del motor, que es productos-lite.json SIN ellas. Aquí se leía el
   segundo, así que todos los posts de Facebook y los anuncios de Revólico
   salían sin descripción, con el texto ya escrito en el producto, y nada lo
   delataba: el post se ve completo, solo que corto. */
function _catalogo() {
    try { if (Array.isArray(window.PRODUCTOS) && window.PRODUCTOS.length) return window.PRODUCTOS; } catch (e) {}
    try { if (typeof productos !== 'undefined' && Array.isArray(productos) && productos.length) return productos; } catch (e) {}
    try { const l = JSON.parse(localStorage.getItem('productos') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function _productoPorId(id) {
    return _catalogo().find(p => p && String(p.id) === String(id)) || null;
}

// _precioMN se quitó: estaba definida pero nunca se usaba, y el precio en CUP
// no debe ir en publicaciones (el post queda meses y la tasa cambia cada semana).

// La moneda de un producto vive en el producto, no en la cifra: uno marcado
// moneda:'MN' lleva su precio TAL CUAL, sin pasar por la tasa. Todo lo de este
// fichero acaba delante de un cliente —el mensaje de WhatsApp, el post de
// Facebook, el anuncio de Revolico—, así que escribir "USD" a mano le afirmaba
// una moneda falsa a quien iba a pagar.
function _esMN(producto) {
    return !!(producto && producto.moneda === 'MN');
}
function _monedaDe(producto) { return _esMN(producto) ? 'MN' : 'USD'; }
// "$150 USD" o "$5000 MN", ya listo para pegar.
function _precioTxt(producto, valor) {
    const n = Number(valor != null ? valor : (producto && producto.precioActual) || 0);
    return '$' + (_esMN(producto) ? Math.round(n) : n) + ' ' + _monedaDe(producto);
}

// Enlace del producto con utm, para ver en Analytics qué red trae las visitas.
// `grupo` (opcional) le pega la marca del grupo, `&g=<código>`: la ficha /p/
// la cuenta aparte en /analytics/grupos/<código>, y así se ve QUÉ grupo trae a
// quien escribe y no solo "Facebook". Solo sale un código que pase el mismo
// filtro que aplican la ficha y la regla de Firebase (ver tmGrupoCodigo).
function _urlProducto(producto, src, grupo) {
    // El canal se normaliza: este fichero mandaba 'fb' y 'rev' donde el panel
    // manda 'facebook' y 'revolico', así que el mismo canal se contaba partido
    // en dos. tmCanalCanonico() vive en el bundle, que carga antes que esto.
    const canal = (typeof tmCanalCanonico === 'function' && tmCanalCanonico(src)) || src;
    const g = grupo ? tmGrupoCodigo(grupo) : '';
    return `https://tiendamax.org/p/producto-${producto.id}.html?utm_source=${canal}&utm_medium=social&utm_campaign=producto`
         + (g ? `&g=${g}` : '');
}
// Enlace de pedido en 1 toque: abre WhatsApp con el mensaje ya redactado. Un
// wa.me pelado abre un chat vacío y el cliente tiene que escribir él — ahí se
// pierden pedidos.
function _waPedido(producto, src) {
    const num = localStorage.getItem('whatsappNumero') || '5354320170';
    // El mensaje va al mínimo: solo el nombre. Antes llevaba también el precio
    // y la URL completa con sus tres utm, y todo eso se codifica —el emoji del
    // nombre son 12 caracteres él solo—, así que el enlace pasaba de 256
    // caracteres y era más de la mitad del anuncio. Quien recibe el mensaje ya
    // sabe el precio y la URL no le dice nada: lo que necesita es QUÉ producto.
    const nombre = (typeof tmPartirEmoji === 'function')
        ? tmPartirEmoji(producto.nombre || '').texto
        : String(producto.nombre || '').trim();
    const msg = `Hola, quiero: ${nombre}`;
    return `https://wa.me/${String(num).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

function _hashtagsCategoria(categoria, soloCategoria) {
    const mapa = {
        'WiFi':        '#wifi #router #internet #repetidor',
        'Energía':     '#energia #solar #inversor #bateria',
        'Celulares':   '#celular #movil #smartphone',
        'Computación': '#computacion #laptop #pc',
        'PC y Laptops':'#laptop #computadora #pc',
        'Hogar':       '#hogar #casa #electrodomesticos',
        'Audio':       '#audio #sonido #musica',
        'Cámaras':     '#camara #fotografia #seguridad',
        'Iluminación': '#iluminacion #led',
        'Carros':      '#autos #carros #vehiculos',
        'Motos':       '#motos #motocicletas',
        'Ropa':        '#ropa #moda #fashion',
        'Lencería':    '#ropa #lenceria #moda',
        'Seguridad':   '#seguridad #camaras #alarma',
        'Juegos':      '#videojuegos #juegos #gaming',
        'Útiles':      '#hogar #utiles #herramientas',
        'Herramientas':'#herramientas #tools',
        'Electrónica': '#electronica #tecnologia',
    };
    if (soloCategoria) return mapa[categoria] || '#tecnologia';
    const base = '#tiendamax #cuba #oferta #envio';
    return `${base} ${mapa[categoria] || '#tecnologia'}`;
}

// ── AI helpers ──────────────────────────────────────────────────────────────

async function _generarTextoFacebookAI(producto) {
    if (typeof tmAIChat !== 'function') throw new Error('Módulo IA no cargado');
    const whatsapp = localStorage.getItem('whatsappNumero') || '5354320170';
    const url = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const info = [
        `Producto: ${producto.nombre}`,
        `Precio: ${_precioTxt(producto)}`,
        producto.descripcion && `Descripción: ${producto.descripcion}`,
        producto.garantia && `Garantía: ${producto.garantia}`,
        producto.usado && 'Producto usado/refurbished',
    ].filter(Boolean).join('\n');
    const prompt = `Escribe una publicación atractiva y variada para un grupo de ventas de Facebook en Cuba (español cubano). Usa emojis creativos. ${_esMN(producto) ? 'El precio es en MN (pesos cubanos): escríbelo tal cual, con "MN", y no lo conviertas a USD.' : 'Muestra el precio SOLO en USD (no menciones precio en MN/CUP).'} No menciones la cantidad en stock. Termina con WhatsApp wa.me/${whatsapp} y el enlace ${url}. Responde SOLO con el texto listo para pegar, sin explicaciones.\n\n${info}`;
    return await tmAIChat(prompt, { max_tokens: 550, temperature: 0.85 });
}

async function _generarTextoRevolicoAI(producto) {
    if (typeof tmAIChat !== 'function') throw new Error('Módulo IA no cargado');
    const url  = `https://tiendamax.org/p/producto-${producto.id}.html`;
    const tags = _hashtagsCategoria(producto.categoria);
    const info = [
        `Nombre: ${producto.nombre}`,
        `Precio: ${_precioTxt(producto)}`,
        producto.descripcion && `Descripción: ${producto.descripcion}`,
        producto.garantia && `Garantía: ${producto.garantia}`,
        producto.stock === 0 ? 'AGOTADO' : `Stock: ${producto.stock} unidades`,
        producto.usado && 'Usado/refurbished',
    ].filter(Boolean).join('\n');
    const prompt = `Crea un anuncio para Revolico.com (clasificados Cuba). Responde SOLO con JSON válido, sin markdown ni bloques de código:\n{"titulo":"solo nombre del producto, máx 70 chars, sin precio","descripcion":"descripción persuasiva en texto plano, 150-280 chars, menciona especificaciones clave y disponibilidad. NO incluir precio ni número de WhatsApp (Revolico los muestra automáticamente). Terminar con enlace ${url} y los hashtags: ${tags}"}\n\nDATOS DEL PRODUCTO:\n${info}`;
    const raw = await tmAIChat(prompt, { max_tokens: 700, temperature: 0.65 });
    // Extraer JSON — intenta con y sin bloque de código
    const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) {
        try {
            const parsed = JSON.parse(m[0]);
            return {
                titulo: String(parsed.titulo || producto.nombre).slice(0, 70),
                descripcion: String(parsed.descripcion || raw)
            };
        } catch (_) {}
    }
    // Fallback: usar respuesta como descripción
    return { titulo: producto.nombre.slice(0, 70), descripcion: clean.slice(0, 500) };
}

// ── Canvas helpers para imagen de anuncio ────────────────────────────────────

function _revRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}

// Carga una imagen para el lienzo. crossOrigin='anonymous' es obligatorio: sin
// él el canvas queda "tainted" y toDataURL() lanza, o sea que se rompen «Copiar
// imagen» y «Descargar». Con timeout porque una petición colgada dejaba la
// promesa sin resolver y el anuncio salía sin foto sin decir por qué.
function _revIntentarImg(src, ms) {
    return new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        let hecho = false;
        const acabar = v => { if (!hecho) { hecho = true; clearTimeout(t); res(v); } };
        const t = setTimeout(() => acabar(null), ms || 8000);
        // naturalWidth 0 = decodificó a nada: cuenta como fallo, o el lienzo
        // dibuja un rectángulo vacío creyendo que hay foto.
        img.onload = () => acabar(img.naturalWidth && img.naturalHeight ? img : null);
        img.onerror = () => acabar(null);
        img.src = src;
    });
}

// Tres intentos, de menos a más raro, igual que hace la tienda con sus <img>:
//   1. la URL tal cual
//   2. la misma con un parámetro nuevo, para saltarse una entrada de caché
//      envenenada (del navegador o del service worker)
//   3. el espejo de raw.githubusercontent, que es de donde salió la foto
// Antes había un solo intento: un fallo pasajero —y en un móvil cubano los hay—
// dejaba ese producto con el marcador de cámara para siempre, sin avisar.
async function _revLoadImg(src) {
    if (!src) return null;
    let img = await _revIntentarImg(src);
    if (img) return img;

    img = await _revIntentarImg(src + (src.indexOf('?') === -1 ? '?' : '&') + '_r=' + Date.now());
    if (img) return img;

    const ruta = (String(src).match(/(?:^|\/)imagenes\/[\w.\-]+\.(?:webp|jpg|jpeg|png)(?:[?#]|$)/i) || [''])[0]
        .replace(/^\//, '').split(/[?#]/)[0];
    if (ruta && String(src).indexOf('raw.githubusercontent') === -1) {
        let user, repo;
        try { user = localStorage.getItem('githubUser'); repo = localStorage.getItem('githubRepo'); } catch (e) { /* sin config */ }
        if (user && repo) {
            img = await _revIntentarImg('https://raw.githubusercontent.com/' + user + '/' + repo + '/main/' + ruta);
            if (img) return img;
        }
    }
    return null;
}


// El tono de fondo del anuncio sale de la categoría del producto, para que en
// una lista de Revólico se distingan de un vistazo. El naranja quemado de antes
// queda como respaldo: una categoría sin color en la tabla sigue saliendo como
// siempre en vez de perder el fondo.
const _REV_TONO_POR_DEFECTO = '#c0390a';
function _revTonoCategoria(producto) {
    const c = (typeof tmColorCategoria === 'function')
        ? tmColorCategoria(producto && producto.categoria) : null;
    return c || _REV_TONO_POR_DEFECTO;
}
// Los colores de categoría están pensados para un chip sobre fondo oscuro, así
// que algunos son muy claros (ENERGIA es amarillo). Puestos tal cual, el fondo
// competía con la foto y la franja negra de abajo perdía contraste. Se bajan
// todos a la luminancia del naranja original, que es la que ya estaba probada:
// así el amarillo y el azul pesan lo mismo en la imagen.
function _revOscurecer(hex, objetivo) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
    const k = lum > 0 ? Math.min(1, objetivo / lum) : 1;
    const p2 = v => Math.round(Math.max(0, Math.min(255, v * k))).toString(16).padStart(2, '0');
    return '#' + p2(r) + p2(g) + p2(b);
}
// Luminancia del #c0390a de siempre: el listón que igualan las demás.
const _REV_LUM = (0.2126*0xc0 + 0.7152*0x39 + 0.0722*0x0a) / 255;

// ── Formatos del anuncio ─────────────────────────────────────────────────────
// El cuadrado es el de siempre: Revólico y Facebook enseñan la imagen entera.
// El vertical existe porque el Estado de WhatsApp ocupa la pantalla completa
// del teléfono y recorta por arriba y por abajo lo que no sea 9:16 — un anuncio
// cuadrado publicado ahí pierde el precio o la franja de marca sin avisar.
// `retrato` (4:5) es el otro formato que Facebook enseña entero en el muro de
// un grupo. Se reparte como el cuadrado —texto encima de la foto—, no como el
// vertical: con 1350 de alto, poner el texto debajo dejaba la foto apaisada.
const _ANUNCIO_FORMATOS = { cuadrado: {W:1080, H:1080}, retrato: {W:1080, H:1350}, vertical: {W:1080, H:1920} };

// Lo que cambia entre versiones del mismo anuncio, para publicarlo en varios
// grupos sin que se vea copiado y pegado. La 0 es la de siempre y tiene que
// salir idéntica: es la que dibujan Revólico, el lote y el Estado.
//   dir    — hacia dónde va el degradado del fondo
//   ax, ay — qué parte de la foto se queda al recortarla para llenar la caja
//   izq    — el nombre y el precio alineados a la izquierda en vez de al centro
const _ANUNCIO_VARIANTES = [
    { dir: [0, 0, 1, 1], ax: .5,  ay: .5,  izq: false },
    { dir: [1, 0, 0, 1], ax: .5,  ay: .38, izq: false },
    { dir: [0, 0, 0, 1], ax: .5,  ay: .62, izq: true  },
    { dir: [0, 1, 1, 0], ax: .42, ay: .5,  izq: true  },
];

// Parte un texto en como mucho `maxLineas` renglones que quepan en `maxW`, y
// corta con puntos suspensivos lo que sobre. Sin esto un nombre largo se
// dibujaba de un tirón y se salía del lienzo por la derecha: canvas no avisa ni
// recorta, simplemente pinta fuera y no se ve.
function _anuPartir(ctx, texto, maxW, maxLineas) {
    const palabras = String(texto == null ? '' : texto).trim().split(/\s+/).filter(Boolean);
    const lineas = [];
    let actual = '', truncado = false;
    for (let i = 0; i < palabras.length; i++) {
        const tent = actual ? actual + ' ' + palabras[i] : palabras[i];
        // `!actual`: una palabra sola más ancha que la caja entra igual y se
        // recorta abajo; si no, se perdería el renglón entero.
        if (!actual || ctx.measureText(tent).width <= maxW) { actual = tent; continue; }
        if (lineas.length + 1 >= maxLineas) { lineas.push(actual); actual = ''; truncado = true; break; }
        lineas.push(actual); actual = palabras[i];
    }
    if (actual) lineas.push(actual);
    if (truncado && lineas.length) {
        let ult = lineas[lineas.length - 1] + '…';
        while (ctx.measureText(ult).width > maxW && ult.length > 2) ult = ult.slice(0, -2) + '…';
        lineas[lineas.length - 1] = ult;
    }
    return { lineas: lineas, truncado: truncado };
}

/* Dibuja el anuncio en `canvas`. Devuelve false si la foto del producto no
   cargó (el lienzo sale con el marcador de cámara y quien publica tiene que
   enterarse ANTES de subirlo).

   opciones = { formato: 'cuadrado' | 'retrato' | 'vertical', texto: bool,
                variante: 0-3, foto: url }

   `variante` y `foto` son para publicar el mismo producto en varios grupos:
   ver _ANUNCIO_VARIANTES. Sin ellas sale exactamente el anuncio de siempre.

   `texto:false` es el anuncio de Revólico: solo foto y marca, porque Revólico
   ya pide el título, el precio y la descripción en sus propios campos y
   repetirlos dentro de la imagen sobra. En Facebook y en el Estado de WhatsApp
   la imagen va sola —el pie se lee después o no se lee—, así que ahí sí lleva
   encima el nombre y el precio. */
async function _dibujarImagenAnuncio(canvas, producto, opciones) {
    const opt = opciones || {};
    const fmt = _ANUNCIO_FORMATOS[opt.formato] || _ANUNCIO_FORMATOS.cuadrado;
    const conTexto = !!opt.texto;
    // Solo el 9:16 lleva el texto debajo de la foto; el 4:5 se reparte como
    // el cuadrado (ver _ANUNCIO_FORMATOS).
    const vertical = fmt.H / fmt.W > 1.5;
    const nVar = Math.abs(parseInt(opt.variante, 10) || 0) % _ANUNCIO_VARIANTES.length;
    const va = _ANUNCIO_VARIANTES[nVar];
    const W = fmt.W, H = fmt.H;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fondo degradado en el tono de la categoría. Cambia SOLO el fondo: el
    // borde dorado y el "TiendaMax" naranja de abajo se quedan igual en todas
    // las categorías, que son los que hacen que el anuncio se reconozca como
    // tuyo entre los cientos que hay en Revólico.
    const tono = _revOscurecer(_revTonoCategoria(producto), _REV_LUM);
    const bg = ctx.createLinearGradient(va.dir[0]*W, va.dir[1]*H, va.dir[2]*W, va.dir[3]*H);
    bg.addColorStop(0, '#0d0d0d');
    bg.addColorStop(.6, _revOscurecer(tono, _REV_LUM * 0.22));
    bg.addColorStop(1, tono);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Borde dorado
    ctx.strokeStyle = 'rgba(201,169,110,.8)'; ctx.lineWidth = 9;
    _revRoundRect(ctx, 38, 38, W-76, H-76, 46); ctx.stroke();

    const precio = Number((producto && producto.precioActual) || 0);
    const antes  = Number((producto && producto.precioOriginal) || 0);
    const hayDesc = antes > precio && precio > 0;
    const pct = hayDesc ? Math.round((antes - precio) / antes * 100) : 0;

    // El bloque de texto se MIDE antes de repartir el alto. Con un reparto
    // fijo, un nombre de dos renglones más un "antes" tachado no cabía y el
    // precio acababa pintado encima del "TiendaMax" de la franja — sin error
    // ninguno, solo un anuncio ilegible ya publicado.
    const barraH = conTexto ? (vertical ? 240 : 180) : 200;
    let fN = vertical ? 62 : 54;
    const fA = 40, fP = vertical ? 112 : 100;
    const fU = Math.round(fP * 0.33);
    let lineasNombre = [], altoTexto = 0, yFinTexto = 0;
    if (conTexto) {
        // Nombre sin el emoji de delante: a este tamaño pesa como una palabra
        // más y lo que tiene que leerse de lejos es el nombre.
        const nombre = (typeof tmPartirEmoji === 'function')
            ? (tmPartirEmoji((producto && producto.nombre) || '').texto || ((producto && producto.nombre) || ''))
            : String((producto && producto.nombre) || '');
        // Se prueba con la letra grande y se va bajando hasta que el nombre
        // entero quepa. Cortar el final es lo que hacía que "Protector TOMZN
        // TOVPD1-60" saliera sin el 60 y "Proteína ... 962g" sin el gramaje:
        // justo lo que distingue un producto de su hermano de al lado.
        const maxLineas = vertical ? 3 : 3;
        for (fN = vertical ? 62 : 54; fN >= 34; fN -= 4) {
            ctx.font = '800 ' + fN + 'px system-ui,Arial';
            const r = _anuPartir(ctx, nombre, W - 190, maxLineas);
            lineasNombre = r.lineas;
            if (!r.truncado) break;
        }
        altoTexto = Math.round(fN * 1.16) * lineasNombre.length
                  + Math.round(fN * 0.50)
                  + (hayDesc ? Math.round(fA * 1.55) : 0)
                  + Math.round(fP * 1.05)
                  + 34;
    }
    // Foto del producto. En vertical sobra alto y el texto va DEBAJO de ella.
    // En cuadrado no cabe: descontarle el texto la dejaba en una tira de 2:1,
    // y apoyar el texto sobre su pie dejaba asomar las esquinas redondeadas
    // por los lados, que se lee como un fallo. Va a sangre hasta el borde y el
    // velo la oscurece: es la foto la que llega abajo, no un recuadro cortado.
    const im = await _revLoadImg(opt.foto || producto.imagen || '');
    const px = 76, py = 76, pw = W-152;
    const ph = (conTexto && !vertical)
        ? H - 46 - py
        : H - barraH - altoTexto - py;
    if (im) {
        ctx.save(); _revRoundRect(ctx, px, py, pw, ph, 32); ctx.clip();
        const rLlenar = Math.max(pw/im.width, ph/im.height);
        const rCaber  = Math.min(pw/im.width, ph/im.height);
        const pinta = r => ctx.drawImage(im, px+(pw-im.width*r)*va.ax, py+(ph-im.height*r)*va.ay, im.width*r, im.height*r);
        // Cuánta foto se pierde al recortarla para llenar la caja. Un recorte
        // pequeño no se nota; una foto apaisada dentro del formato vertical
        // perdía el 40% del ancho y el producto salía cortado por la mitad.
        // Cuando pasa de ahí se mete entera y el hueco lo tapa la misma foto
        // ampliada y desenfocada, como hacen las apps de historias: rellenar
        // con un color plano deja dos franjas que parecen un error de montaje.
        // Solo con texto: el anuncio de Revólico se queda exactamente igual.
        if (conTexto && 1 - rCaber/rLlenar > 0.22) {
            ctx.filter = 'blur(48px)'; ctx.globalAlpha = .55;
            pinta(rLlenar);
            ctx.filter = 'none'; ctx.globalAlpha = 1;
            pinta(rCaber);
        } else {
            pinta(rLlenar);
        }
        ctx.restore();
    } else {
        ctx.save(); _revRoundRect(ctx, px, py, pw, ph, 32); ctx.clip();
        const ph2 = ctx.createLinearGradient(px, py, px+pw, py+ph);
        ph2.addColorStop(0, '#1e3a5c'); ph2.addColorStop(1, '#0a1828');
        ctx.fillStyle = ph2; ctx.fillRect(px, py, pw, ph);
        ctx.font = '200px serif'; ctx.fillStyle = 'rgba(255,107,53,.2)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('📷', px+pw/2, py+ph/2);
        ctx.restore();
    }
    const _sinFoto = !im;

    if (conTexto) {
        // Sello de descuento en la esquina de la foto. Solo con rebaja de
        // verdad y a partir del 5%: un "-1%" es ruido y le resta credibilidad
        // a los descuentos buenos.
        if (pct >= 5) {
            const txt = '-' + pct + '%';
            ctx.font = '900 54px system-ui,Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const anchoSello = ctx.measureText(txt).width + 52;
            const sx = px + pw - anchoSello - 26, sy = py + 26;
            ctx.fillStyle = '#e0301e';
            _revRoundRect(ctx, sx, sy, anchoSello, 78, 20); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(txt, sx + anchoSello/2, sy + 41);
        }

        // Velo oscuro bajo el texto. El fondo lo pone la categoría y algunas
        // son claras (Energía es amarillo): sin esto el nombre blanco y el
        // precio dorado se apoyan en un marrón claro y pierden contraste, y no
        // se nota hasta publicar un producto de esa categoría.
        const veloY = H - barraH - altoTexto;
        const velo = ctx.createLinearGradient(0, veloY, 0, H);
        velo.addColorStop(0, 'rgba(8,6,4,0)');
        velo.addColorStop(.14, 'rgba(8,6,4,.92)');
        velo.addColorStop(1, 'rgba(8,6,4,.97)');
        ctx.fillStyle = velo; ctx.fillRect(0, veloY, W, H - veloY);

        // Alineado a la izquierda arranca donde arranca el ancho que midió
        // _anuPartir (W-190 centrado): el mismo renglón cabe en los dos.
        const izq = va.izq;
        const cx = izq ? 95 : W/2;
        let y = veloY + Math.round(fN * 0.42);
        ctx.textAlign = izq ? 'left' : 'center'; ctx.textBaseline = 'top';
        ctx.font = '800 ' + fN + 'px system-ui,Arial';
        ctx.fillStyle = '#fff';
        for (const l of lineasNombre) { ctx.fillText(l, cx, y); y += Math.round(fN * 1.16); }
        y += Math.round(fN * 0.22);

        // Precio anterior tachado — solo si la rebaja existe. Un "antes"
        // inventado se nota y quema la tienda.
        if (hayDesc) {
            ctx.font = fA + 'px system-ui,Arial';
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            const txtA = _precioTxt(producto, antes);
            ctx.fillText(txtA, cx, y);
            const wA = ctx.measureText(txtA).width;
            ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
            ctx.beginPath();
            const xA = izq ? cx + wA/2 : cx;
            ctx.moveTo(xA - wA/2 - 8, y + fA*0.58); ctx.lineTo(xA + wA/2 + 8, y + fA*0.58);
            ctx.stroke();
            y += Math.round(fA * 1.55);
        }

        // La cifra y la moneda se miden juntas y se pintan desde la izquierda:
        // centrando cada una por su lado, el conjunto queda descuadrado.
        const cifra  = '$' + (_esMN(producto) ? Math.round(precio) : precio);
        const moneda = ' ' + _monedaDe(producto);
        ctx.textAlign = 'left';
        ctx.font = '900 ' + fP + 'px system-ui,Arial';
        const wC = ctx.measureText(cifra).width;
        ctx.font = '700 ' + fU + 'px system-ui,Arial';
        const wM = ctx.measureText(moneda).width;
        const x0 = izq ? cx : cx - (wC + wM)/2;
        ctx.font = '900 ' + fP + 'px system-ui,Arial'; ctx.fillStyle = '#C9A96E';
        ctx.fillText(cifra, x0, y);
        ctx.font = '700 ' + fU + 'px system-ui,Arial'; ctx.fillStyle = 'rgba(201,169,110,.72)';
        ctx.fillText(moneda, x0 + wC, y + Math.round((fP - fU) * 0.66));
        ctx.textAlign = 'center';
        yFinTexto = y + Math.round(fP * 1.05);
    }

    // Dónde acabó de verdad el texto, frente a dónde se le había reservado
    // sitio. Son dos cuentas distintas y separarlas es justo lo que pone el
    // precio encima del "TiendaMax": el test lo cruza producto a producto.
    try {
        if (conTexto && canvas.dataset) canvas.dataset.tmAnuncio = JSON.stringify({
            W: W, H: H, barraTop: H - barraH, altoFoto: ph,
            lineasNombre: lineasNombre.length, yFinTexto: yFinTexto,
            titulo: lineasNombre.join(' '), cuerpoTitulo: fN, variante: nVar,
        });
    } catch (e) { /* OffscreenCanvas u otro lienzo sin dataset */ }

    // Franja de marca abajo
    const barY = H - barraH;
    const barGrad = ctx.createLinearGradient(0, barY, 0, H);
    barGrad.addColorStop(0, 'rgba(8,6,4,0)');
    barGrad.addColorStop(.35, 'rgba(8,6,4,.88)');
    barGrad.addColorStop(1, 'rgba(8,6,4,.97)');
    ctx.fillStyle = barGrad; ctx.fillRect(0, barY, W, H - barY);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 68px system-ui,Arial'; ctx.fillStyle = '#FF6B35';
    ctx.fillText('TiendaMax', W/2, H - Math.round(barraH * 0.56));
    ctx.font = '36px system-ui,Arial'; ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillText('tiendamax.org', W/2, H - Math.round(barraH * 0.29));

    // El velo del texto se traga el borde por abajo, así que se repasa. Solo
    // con texto: sin él, el anuncio de Revólico se queda como estaba.
    if (conTexto) {
        ctx.strokeStyle = 'rgba(201,169,110,.8)'; ctx.lineWidth = 9;
        _revRoundRect(ctx, 38, 38, W-76, H-76, 46); ctx.stroke();
    }
    return !_sinFoto;
}

// Un solo lienzo para las tres redes. Lo llaman la vista previa de Revólico
// (aquí abajo), la de Facebook y el "🖼️ Estado" de admin.html, que antes
// montaba un cartel en HTML y lo fotografiaba con html2canvas.
window.tmAnuncioImagen = function(canvas, producto, opciones) {
    return _dibujarImagenAnuncio(canvas, producto, opciones);
};

// ── end canvas helpers ────────────────────────────────────────────────────────

async function _copiar(texto) {
    try {
        await navigator.clipboard.writeText(texto);
    } catch(e) {
        const ta = document.createElement('textarea');
        ta.value = texto;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

// ══════════════════════════════════════════════════════════════
//  VARIOS GRUPOS SIN QUE PAREZCA EL MISMO ANUNCIO
// ══════════════════════════════════════════════════════════════
/* Publicar el mismo producto en cinco grupos con el mismo texto, la misma foto
   y el mismo recorte es justo lo que Facebook detecta como spam, y lo que los
   administradores de grupo borran a mano. Aquí se decide, para cada grupo, qué
   VERSIÓN le toca: el texto, la imagen y la foto de portada cambian; los datos
   no. Todo sale del producto —nada inventado— y es determinista: la misma
   pareja producto+grupo da la misma versión en el móvil y en la computadora.

   La rotación usa el registro de publicaciones (tm_publog_v1, que ya guarda
   `destino`): la versión de un grupo avanza una cada vez que ese producto sale
   en ese grupo, así que el mismo grupo nunca recibe la misma dos veces
   seguidas, y como arranca en la posición del grupo en la lista, dos grupos
   seguidos de la cola tampoco coinciden. */
const TM_VARIANTES = 4;
// El código del grupo va en el enlace (?g=) y termina siendo una ruta de
// Firebase. El filtro es el MISMO en los tres sitios —aquí, la ficha /p/
// (MEDIR_JS) y la regla de /analytics/grupos—: si uno acepta algo que otro no,
// la visita se pierde en silencio o crea nodos que nadie pidió.
const _GRUPO_COD_RE = /^[a-z0-9]{4,8}$/;
function _hash32(txt) {
    let h = 0x811c9dc5;
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
}
// Sale de la URL del grupo, no de un contador ni del nombre: así no hace falta
// guardarlo en ningún sitio, es igual en todos los teléfonos y renombrar el
// grupo no parte sus visitas en dos. No dice nada del grupo a quien lo lea.
function tmGrupoCodigo(g) {
    const propio = String((g && g.codigo) || '').toLowerCase();
    if (_GRUPO_COD_RE.test(propio)) return propio;
    const url = String((g && g.url) || '').trim().toLowerCase()
        .replace(/^https?:\/\//, '').replace(/^(www|m|web|mbasic)\./, '')
        .split(/[?#]/)[0].replace(/\/+$/, '');
    if (!url) return '';
    return _hash32(url).toString(36).padStart(6, '0').slice(-6);
}
window.tmGrupoCodigo = tmGrupoCodigo;

function _gruposFB() {
    try {
        const v = JSON.parse(localStorage.getItem('gruposFB') || '[]');
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}
function _grupoValido(g) { return !!(g && g.url && String(g.url).includes('facebook.com')); }
// Con qué nombre queda en el registro. Es lo que se lee en el Historial.
function _grupoDestino(g) { return String((g && (g.nombre || g.url)) || '').trim(); }
function _pubsGrupo(g) {
    const dst = _grupoDestino(g), url = String((g && g.url) || '').trim();
    if (!dst) return [];
    const log = (typeof tmPublicaciones === 'function') ? tmPublicaciones() : [];
    return log.filter(e => e && e.red === 'fb' && (e.destino === dst || (url && e.destino === url)));
}
function _inicioDeHoy() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function tmGrupoHoy(g) { const t0 = _inicioDeHoy(); return _pubsGrupo(g).filter(e => e.ts >= t0).length; }
function tmGrupoUltimaDe(g, pid) {
    let ts = 0;
    _pubsGrupo(g).forEach(e => { if (e.pid === String(pid) && e.ts > ts) ts = e.ts; });
    return ts || null;
}
// 0 = sin límite. Lo pone el gestor en la tarjeta del grupo: cada grupo tolera
// una cosa distinta y eso solo lo sabe quien está dentro.
function _grupoMaxDia(g) { const n = parseInt(g && g.maxDia, 10); return n > 0 ? n : 0; }
function _grupoEnlaces(g) { return !(g && g.enlaces === false); }

function tmVarianteGrupo(g, pos, pid) {
    const veces = _pubsGrupo(g).filter(e => e.pid === String(pid)).length;
    return (Math.abs(pos | 0) + veces) % TM_VARIANTES;
}

// Las fotos distintas del producto, la principal primero.
function _fotosDe(producto) {
    const out = [];
    [producto && producto.imagen].concat(Array.isArray(producto && producto.imagenes) ? producto.imagenes : [])
        .forEach(u => { u = String(u || '').trim(); if (u && !out.includes(u)) out.push(u); });
    return out;
}
// Formato 1:1 o 4:5, alineación, recorte y fondo salen de `v`; la foto de
// portada rota aparte, sobre las que tenga el producto.
function _opcionesImagenVariante(producto, v, k) {
    const fotos = _fotosDe(producto);
    return { formato: (v & 1) ? 'retrato' : 'cuadrado', texto: true, variante: v,
             foto: fotos.length ? fotos[Math.abs(k | 0) % fotos.length] : '' };
}

// Para los grupos que no dejan poner enlaces: el número se escribe, no se enlaza.
function _numWaLegible() {
    const n = String(localStorage.getItem('whatsappNumero') || '5354320170').replace(/\D/g, '');
    return /^53\d{8}$/.test(n) ? '+53 ' + n.slice(2, 6) + ' ' + n.slice(6) : '+' + n;
}

// Las primeras `n` líneas con texto. Una descripción de diez renglones pegada
// igual en todas las versiones es lo que más delata el copia-pega.
function _primerasLineas(texto, n) {
    return String(texto || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, n).join('\n');
}

// Apunta lo publicado donde lo apunta el resto del panel, y repinta la lista
// de Publicar para que el badge «hace X» y «Hoy toca» se enteren.
// `grupo`: el del post, para apuntar con él su marca (?g=) si el enlace la llevó.
function _marcarPublicado(pid, red, destino, grupo) {
    const extra = (grupo && _grupoEnlaces(grupo)) ? { g: tmGrupoCodigo(grupo) } : undefined;
    try {
        if (typeof pubMarcarPublicado === 'function') pubMarcarPublicado(pid, red, destino, extra);
        else if (typeof tmRegistrarPublicacion === 'function') tmRegistrarPublicacion(pid, red, destino, undefined, extra);
    } catch (e) {}
    setTimeout(() => {
        try { if (typeof pubRenderShareList === 'function') pubRenderShareList(); } catch (e) {}
        try { if (typeof pubRenderHoy === 'function') pubRenderHoy(); } catch (e) {}
    }, 300);
}

/* ── Los grupos también viven en el repositorio, y se guardan solos ─────
   Vivían en localStorage y solo subían con un «Guardar» que la pantalla de
   Publicar no tiene. Peor: 4 s después de abrir el panel, tm-data copiaba
   encima el grupos_facebook_config.json del repo —que estaba vacío—, así que
   los grupos se BORRABAN en cada recarga, sin error ninguno. Y con ellos sus
   reglas (máximo al día, enlaces).

   Mismo camino que comparar-marcas.json:
     · Se guarda en local en el acto y sube con un respiro de 4 s.
     · Se FUSIONA por grupo, no fichero contra fichero: la clave es
       tmGrupoCodigo (la URL normalizada) y gana el `ts` más nuevo. Así, con
       dos teléfonos, el último en guardar no borra los grupos del otro.
     · Borrar deja una lápida, no un hueco: un grupo que solo desaparece es un
       grupo que el otro aparato todavía tiene y vuelve a subir.
     · Al cargar, lo local que el repo no tiene se sube: un guardado que falló
       o un cambio hecho sin conexión se arreglan solos.
   Los grupos sin URL válida (a medio escribir) se quedan en local y no suben. */
const GRUPOS_ARCHIVO = 'grupos_facebook_config.json';
const GRUPOS_BORRADOS_KEY = 'gruposFB_borrados';
const GRUPOS_LAPIDA_DIAS = 120;
let _gruposTimer = null, _gruposSubiendo = false;
let TM_GRUPOS_ESTADO = 'local';   // local | pendiente | guardando | guardado | error | sin-token

function _gruposBorrados() {
    try { const o = JSON.parse(localStorage.getItem(GRUPOS_BORRADOS_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
}
function _gruposGuardarLocal(grupos, borrados) {
    try { localStorage.setItem('gruposFB', JSON.stringify(grupos)); } catch (e) {}
    if (borrados) try { localStorage.setItem(GRUPOS_BORRADOS_KEY, JSON.stringify(borrados)); } catch (e) {}
}
function tmGruposFusionar(remoto, local, borradosR, borradosL) {
    const lim = Date.now() - GRUPOS_LAPIDA_DIAS * 86400000;
    const borrados = {};
    [borradosR, borradosL].forEach(b => Object.keys(b || {}).forEach(k => {
        const t = Number(b[k]) || 0;
        if (t >= lim && t > (borrados[k] || 0)) borrados[k] = t;
    }));
    const porCod = new Map(), sinCod = [], orden = [];
    const meter = g => {
        if (!g || typeof g !== 'object') return;
        const cod = _grupoValido(g) ? tmGrupoCodigo(g) : '';
        if (!cod) { sinCod.push(g); return; }
        const ya = porCod.get(cod);
        if (!ya) { porCod.set(cod, g); orden.push(cod); }
        else if ((Number(g.ts) || 0) > (Number(ya.ts) || 0)) porCod.set(cod, g);
    };
    (local || []).forEach(meter);
    (remoto || []).forEach(g => { if (g && _grupoValido(g)) meter(g); });
    const grupos = orden.map(c => porCod.get(c))
        .filter(g => !(borrados[tmGrupoCodigo(g)] >= (Number(g.ts) || 0)))
        .concat(sinCod);
    return { grupos, borrados };
}
function tmGruposEstadoTexto() {
    return ({ local: '', pendiente: '☁️ Grupos sin guardar todavía…', guardando: '☁️ Guardando grupos…',
              guardado: '☁️ Grupos guardados: te siguen en cualquier teléfono',
              error: '⚠️ No pude guardar los grupos en el repositorio. Lo reintento al próximo cambio.',
              'sin-token': '⚠️ Grupos solo en este teléfono: configura GitHub en ⚙️ para que no se pierdan.' })[TM_GRUPOS_ESTADO] || '';
}
function _gruposAviso() {
    const e = document.getElementById('pub-grupos-estado');
    if (e) e.textContent = tmGruposEstadoTexto();
}
function _gruposSubirLuego() {
    TM_GRUPOS_ESTADO = 'pendiente'; _gruposAviso();
    clearTimeout(_gruposTimer);
    _gruposTimer = setTimeout(() => { _gruposSubir(); }, 4000);
}
async function _gruposSubir() {
    const user = localStorage.getItem('githubUser'), repo = localStorage.getItem('githubRepo'), token = localStorage.getItem('githubToken');
    if (!user || !repo || !token || typeof subirArchivoAGitHub !== 'function') { TM_GRUPOS_ESTADO = 'sin-token'; _gruposAviso(); return false; }
    if (_gruposSubiendo) { _gruposSubirLuego(); return false; }
    _gruposSubiendo = true; TM_GRUPOS_ESTADO = 'guardando'; _gruposAviso();
    try {
        // Se relee justo antes de escribir: lo que otro teléfono guardó
        // mientras tanto tiene que sobrevivir a este guardado.
        const remoto = (typeof _tmLeerJsonRepoFresco === 'function')
            ? await _tmLeerJsonRepoFresco(user, repo, token, GRUPOS_ARCHIVO) : null;
        const f = tmGruposFusionar(remoto && remoto.grupos, _gruposFB(), remoto && remoto.borrados, _gruposBorrados());
        _gruposGuardarLocal(f.grupos, f.borrados);
        await subirArchivoAGitHub(user, repo, token, GRUPOS_ARCHIVO,
            { grupos: f.grupos.filter(_grupoValido), borrados: f.borrados });
        TM_GRUPOS_ESTADO = 'guardado';
        return true;
    } catch (e) {
        TM_GRUPOS_ESTADO = 'error';
        return false;
    } finally {
        _gruposSubiendo = false; _gruposAviso();
    }
}
// Lo llama tm-data al leer el fichero del repo (en vez de pisar lo local).
window.tmGruposDesdeRepo = function(datos) {
    const local = _gruposFB(), borradosL = _gruposBorrados();
    const f = tmGruposFusionar(datos && datos.grupos, local, datos && datos.borrados, borradosL);
    _gruposGuardarLocal(f.grupos, f.borrados);
    const remotos = new Set(((datos && datos.grupos) || []).filter(_grupoValido).map(g => tmGrupoCodigo(g) + '|' + (Number(g.ts) || 0)));
    const faltan = f.grupos.filter(_grupoValido).some(g => !remotos.has(tmGrupoCodigo(g) + '|' + (Number(g.ts) || 0)))
        || Object.keys(f.borrados).some(k => !(datos && datos.borrados && datos.borrados[k]));
    if (faltan) _gruposSubirLuego();
    else if (TM_GRUPOS_ESTADO === 'local') { TM_GRUPOS_ESTADO = f.grupos.length ? 'guardado' : 'local'; _gruposAviso(); }
    // Solo se repinta si cambió algo: repintar reconstruye los campos y le
    // quitaría el foco a quien esté escribiendo la URL de un grupo.
    if (JSON.stringify(f.grupos) !== JSON.stringify(local)) {
        try { if (typeof renderizarGruposFB === 'function' && document.getElementById('listaGruposFB')) renderizarGruposFB(f.grupos); } catch (e) {}
    }
};
window.tmGruposFusionar = tmGruposFusionar;

// Cada cambio en los grupos pone la hora al grupo tocado y programa la
// subida. Se envuelven las funciones del bundle (tm-ui) en vez de tocarlas:
// el bundle viaja a los teléfonos de los clientes y esto solo lo usa el panel.
(function() {
    const sellar = (i) => {
        const gs = _gruposFB();
        if (gs[i]) { gs[i].ts = Date.now(); _gruposGuardarLocal(gs); }
    };
    const envolver = (nombre, antes, despues) => {
        const orig = window[nombre];
        if (typeof orig !== 'function') return;
        window[nombre] = function() {
            const ctx = antes ? antes.apply(null, arguments) : null;
            const r = orig.apply(this, arguments);
            if (despues) despues.apply(null, [ctx].concat(Array.from(arguments)));
            _gruposSubirLuego();
            return r;
        };
    };
    envolver('actualizarGrupoFB',
        (i, campo) => campo === 'url' ? tmGrupoCodigo(_gruposFB()[i]) : null,
        (codAntes, i, campo) => {
            sellar(i);
            // Cambiar la URL es cambiar de grupo: el código viejo se entierra,
            // o volvería desde el repo como un grupo más.
            if (campo === 'url' && codAntes && codAntes !== tmGrupoCodigo(_gruposFB()[i])) {
                const b = _gruposBorrados(); b[codAntes] = Date.now(); _gruposGuardarLocal(_gruposFB(), b);
            }
        });
    envolver('toggleProductoEnGrupo', null, (_, i) => sellar(i));
    envolver('agregarGrupoFB', null, () => { const gs = _gruposFB(); sellar(gs.length - 1); });
    envolver('eliminarGrupoFB',
        (i) => { const g = _gruposFB()[i]; return g && _grupoValido(g) ? tmGrupoCodigo(g) : ''; },
        (cod) => { if (cod) { const b = _gruposBorrados(); b[cod] = Date.now(); _gruposGuardarLocal(_gruposFB(), b); } });
    // El «Guardar» viejo subía la lista tal cual y pisaba los grupos del otro
    // teléfono: ahora es el mismo guardado fusionado, sin esperar.
    window.guardarGruposFB = async function() {
        clearTimeout(_gruposTimer);
        const ok = await _gruposSubir();
        if (typeof mostrarNotificacion === 'function') mostrarNotificacion(ok ? '✅ Grupos guardados' : tmGruposEstadoTexto(), ok ? 'success' : 'warning');
    };
})();

// Lo que trae cada grupo: visitas a la ficha y toques en su WhatsApp con la
// marca ?g= de ese grupo (MEDIR_JS en las fichas /p/). Una lectura, guardada
// 5 minutos: la tarjeta se repinta cada vez que se filtra la lista.
let _gruposStatsCache = null;
function _gruposStats() {
    if (_gruposStatsCache && Date.now() - _gruposStatsCache.t < 300000) return _gruposStatsCache.p;
    const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : '';
    const p = !base ? Promise.reject(new Error('sin firebase'))
        : fetch(base + '/analytics/grupos.json?_=' + Date.now(), { cache: 'no-store' })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(d => (d && typeof d === 'object') ? d : {});
    _gruposStatsCache = { t: Date.now(), p };
    p.catch(() => { _gruposStatsCache = null; });
    return p;
}

// Los campos de reglas y lo que trae el grupo, dentro de su tarjeta. Lo llama
// renderizarGruposFB (bundle): vive aquí porque el bundle también se sirve a la
// tienda y esto solo lo usa el panel.
window.tmGrupoExtras = function(card, g, i) {
    const caja = document.createElement('div');
    caja.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;padding:10px;border-radius:10px;background:rgba(127,127,127,.08);font-size:12px;';
    const fila = document.createElement('div');
    fila.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;align-items:center;';
    const lMax = document.createElement('label');
    lMax.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;';
    lMax.textContent = 'Máx. al día aquí:';
    const inMax = document.createElement('input');
    inMax.type = 'number'; inMax.min = '0'; inMax.max = '20'; inMax.placeholder = 'sin límite';
    inMax.value = _grupoMaxDia(g) || '';
    inMax.style.cssText = 'width:84px;padding:5px 8px;border-radius:6px;border:1px solid var(--border-color);font-size:12px;';
    inMax.addEventListener('input', () => {
        const n = parseInt(inMax.value, 10);
        actualizarGrupoFB(i, 'maxDia', n > 0 ? Math.min(n, 20) : '');
    });
    lMax.appendChild(inMax);
    const lEnl = document.createElement('label');
    lEnl.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer;';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.checked = _grupoEnlaces(g);
    chk.addEventListener('change', () => { actualizarGrupoFB(i, 'enlaces', chk.checked); pintarStats(); });
    lEnl.appendChild(chk);
    lEnl.appendChild(document.createTextNode('Admite enlaces'));
    fila.appendChild(lMax); fila.appendChild(lEnl);
    caja.appendChild(fila);

    const hoy = document.createElement('div');
    hoy.style.opacity = '.75';
    const n = tmGrupoHoy(g), max = _grupoMaxDia(g);
    hoy.textContent = `Hoy aquí: ${n}${max ? ' de ' + max : ''}` +
        (_grupoEnlaces(g) ? '' : ' · sin enlaces: el post lleva tu WhatsApp escrito');
    caja.appendChild(hoy);

    const stats = document.createElement('div');
    stats.id = 'grupoFBStats_' + i;
    stats.style.opacity = '.85';
    caja.appendChild(stats);
    function pintarStats() {
        const cod = tmGrupoCodigo(g);
        if (!cod) { stats.textContent = ''; return; }
        if (!chk.checked) { stats.textContent = '📊 Sin enlaces no se puede medir qué trae este grupo.'; return; }
        stats.textContent = '📊 ⏳ Mirando lo que trae…';
        _gruposStats().then(d => {
            const e = d[cod] || {};
            const vis = Number(e.visitas && e.visitas.count) || 0;
            const wa  = Number(e.whatsapp && e.whatsapp.count) || 0;
            const hora = _grupoMejorHora(e.horas);
            stats.textContent = (vis || wa)
                ? `📊 Desde este grupo: 👀 ${vis} visita${vis === 1 ? '' : 's'} · 💬 ${wa} toque${wa === 1 ? '' : 's'} en WhatsApp`
                  + (hora ? ` · responden más entre las ${hora.desde} y las ${hora.hasta} h` : '')
                : '📊 Todavía nada con la marca de este grupo (cuentan los enlaces publicados desde la cola o desde aquí).';
        }).catch(() => {
            // Un fallo de red NO es «no trae nada»: dicho así, el gestor deja
            // de publicar justo donde le funciona.
            stats.textContent = '📊 No pude leer lo que trae este grupo (¿sin conexión?).';
        });
    }
    pintarStats();
    // Las ventas marcadas de este grupo (formulario de venta → Facebook → el
    // grupo). Son datos del panel, no de Firebase: salen aunque no haya red.
    const cod = tmGrupoCodigo(g);
    const nVentas = _ventasDeGrupo(cod);
    if (cod) {
        const ven = document.createElement('div');
        ven.style.opacity = '.85';
        ven.textContent = nVentas
            ? `💰 ${nVentas} venta${nVentas === 1 ? '' : 's'} marcada${nVentas === 1 ? '' : 's'} de este grupo`
            : '💰 Ninguna venta marcada de este grupo todavía (al anotar una venta de Facebook, toca el grupo).';
        caja.appendChild(ven);
    }
    card.appendChild(caja);
};
function _ventasDeGrupo(cod) {
    if (!cod) return 0;
    let ventas = [];
    try { if (typeof VENTAS !== 'undefined' && Array.isArray(VENTAS)) ventas = VENTAS; } catch (e) {}
    if (!ventas.length) { try { ventas = JSON.parse(localStorage.getItem('registroVentas') || '[]'); } catch (e) { ventas = []; } }
    return (Array.isArray(ventas) ? ventas : []).filter(v => v && v.grupo === cod).length;
}
/* A qué hora responde un grupo: la franja de dos horas con más toques en
   WhatsApp. Solo con GRUPO_MIN_HORAS toques o más: con tres toques, «a las
   21 h» es casualidad dicha como si fuera un dato, y el gestor movería su
   rutina por ella. */
const GRUPO_MIN_HORAS = 10;
function _grupoMejorHora(horas) {
    if (!horas || typeof horas !== 'object') return null;
    const n = h => Number(horas[String(h).padStart(2, '0')] && horas[String(h).padStart(2, '0')].count) || 0;
    let total = 0; for (let h = 0; h < 24; h++) total += n(h);
    if (total < GRUPO_MIN_HORAS) return null;
    let mejor = 0, suma = -1;
    for (let h = 0; h < 24; h++) { const t = n(h) + n((h + 1) % 24); if (t > suma) { suma = t; mejor = h; } }
    return { desde: mejor, hasta: (mejor + 2) % 24, toques: suma, total };
}

function _cuandoTxt(ts) {
    const dias = Math.floor((Date.now() - ts) / 86400000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return 'hace ' + dias + ' días';
}

// ══════════════════════════════════════════════════════════════
//  FACEBOOK
// ══════════════════════════════════════════════════════════════

/* opciones = { variante: 0-3, enlaces: bool (por defecto sí), grupo }

   La versión 0 es el post de siempre. Las otras tres cambian el arranque, el
   orden de los bloques, los separadores, las palabras del pedido y los
   hashtags — no los datos: el nombre, el precio, la rebaja, la garantía y la
   escasez salen del producto en todas, y lo que el producto no declara no sale
   en ninguna. `enlaces:false` es para los grupos que borran posts con enlaces:
   el número de WhatsApp va escrito y no hay URL. */
function _textoFacebook(producto, opciones) {
    const o = opciones || {};
    const v = Math.abs(parseInt(o.variante, 10) || 0) % TM_VARIANTES;
    const conEnlaces = o.enlaces !== false;
    if (v) return _textoFacebookOtra(producto, v, conEnlaces, o.grupo);

    const precio   = producto.precioActual;
    const hashtags = _hashtagsCategoria(producto.categoria);

    let t = `✨ ${producto.nombre}\n\n`;

    if (producto.usado) t += '♻️ Producto usado / refurbished\n\n';
    if (producto.descripcion) t += `${producto.descripcion}\n\n`;

    t += '━━━━━━━━━━━━━━━━━━━━━\n';

    if (producto.precioOriginal > 0 && producto.precioOriginal > precio) {
        const ahorro = (producto.precioOriginal - precio).toFixed(0);
        // OJO: Facebook NO renderiza markdown. Antes se usaba ~~tachado~~ y en el
        // post salían las virgulillas literales ("~~$85 USD~~"), que se ve a
        // descuido. En texto plano se lee mejor "Antes / AHORA".
        t += `💰 Antes ${_precioTxt(producto, producto.precioOriginal)}  👉  AHORA ${_precioTxt(producto, precio)}\n`;
        t += `🎉 Ahorras ${_precioTxt(producto, ahorro)}\n`;
    } else {
        t += `💰 Precio: ${_precioTxt(producto, precio)}\n`;
    }

    if (producto.garantia)   t += `🛡️ Garantía: ${producto.garantia}\n`;
    if (producto.devolucion) t += `✅ Devolución segura garantizada\n`;
    // Escasez real (solo si de verdad queda poco): es lo que más mueve a escribir.
    const _st = Number(producto.stock || 0);
    if (_st > 0 && _st <= 3) t += _st === 1 ? '⚡ ¡Queda 1 disponible!\n' : `⚡ ¡Últimas ${_st} unidades!\n`;

    t += '\n━━━━━━━━━━━━━━━━━━━━━\n';
    if (conEnlaces) {
        t += `📲 Pídelo en 1 toque (ya te abre el chat):\n${_waPedido(producto, 'facebook')}\n`;
        t += `🔗 Fotos y detalles: ${_urlProducto(producto, 'facebook', o.grupo)}\n\n`;
    } else {
        t += `💬 Escríbeme al WhatsApp: ${_numWaLegible()}\n\n`;
    }
    t += hashtags;

    return t;
}

function _textoFacebookOtra(producto, v, conEnlaces, grupo) {
    const precio = Number(producto.precioActual || 0);
    const antes  = Number(producto.precioOriginal || 0);
    const rebaja = antes > precio && precio > 0;
    const linPrecio = rebaja
        ? `Antes ${_precioTxt(producto, antes)} → ahora ${_precioTxt(producto, precio)} (ahorras ${_precioTxt(producto, (antes - precio).toFixed(0))})`
        : _precioTxt(producto, precio);
    const desc  = String(producto.descripcion || '').trim();
    const ficha = _fichaCorta(producto, 4);
    const L = [];
    if (v === 1) {
        // El precio arriba, antes que nada: quien baja por el grupo decide ahí.
        L.push(`🔥 ${producto.nombre}`, `💰 ${linPrecio}`, '');
        if (producto.usado) L.push('♻️ Usado / refurbished', '');
        if (ficha.length) L.push(ficha.join('\n'), '');
        else if (desc) L.push(_primerasLineas(desc, 3), '');
    } else if (v === 2) {
        L.push(`📦 ${producto.nombre}`, '');
        if (producto.usado) L.push('♻️ Producto usado / refurbished', '');
        if (desc) L.push(desc, '');
        L.push('▫️▫️▫️', `Precio: ${linPrecio}`);
    } else {
        L.push(String(producto.nombre || ''), '');
        if (producto.usado) L.push('♻️ Usado', '');
        if (ficha.length) L.push(ficha.map(f => f.replace(/^•/, '✅')).join('\n'), '');
        if (desc) L.push(_primerasLineas(desc, ficha.length ? 2 : 6), '');
        L.push(`💵 ${linPrecio}`);
    }
    if (producto.garantia)   L.push(`🛡️ Garantía: ${producto.garantia}`);
    if (producto.devolucion) L.push('✅ Devolución segura garantizada');
    const st = Number(producto.stock || 0);
    if (st > 0 && st <= 3) L.push(st === 1 ? '⚡ Queda 1' : `⚡ Quedan ${st}`);
    L.push('');
    const cta = [null, ['💬 Pedidos por WhatsApp:', '👀 Más fotos:'],
                       ['👉 Para pedirlo, toca aquí:', '🌐 Ficha completa:'],
                       ['📩 Escríbeme:', '📷 Ver fotos:']][v];
    if (conEnlaces) {
        L.push(cta[0], _waPedido(producto, 'facebook'),
               `${cta[1]} ${_urlProducto(producto, 'facebook', grupo)}`);
    } else {
        L.push(`💬 Escríbeme al WhatsApp: ${_numWaLegible()}`);
    }
    const tags = v === 1 ? _hashtagsCategoria(producto.categoria, true) : v === 3 ? '#tiendamax #cuba' : '';
    if (tags) L.push('', tags);
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Copia la versión que le toca a ESE grupo y lo abre. `iGrupo` es la posición
// en la lista de grupos; sin ella, el post de siempre y sin marca de grupo.
async function copiarYAbrirFacebook(productoId, grupoUrl, iGrupo) {
    const producto = _productoPorId(productoId);
    if (!producto) return false;
    const g = (iGrupo != null) ? _gruposFB()[iGrupo] : null;
    const texto = g
        ? _textoFacebook(producto, { variante: tmVarianteGrupo(g, iGrupo, producto.id), enlaces: _grupoEnlaces(g), grupo: g })
        : _textoFacebook(producto);
    await _copiar(texto);
    _marcarPublicado(producto.id, 'fb', g ? _grupoDestino(g) : 'Facebook', g);
    mostrarNotificacion('✅ Texto copiado — pégalo en Facebook', 'success');
    window.open(grupoUrl || 'https://www.facebook.com', '_blank', 'noopener,noreferrer');
    return true;
}

function previsualizarFacebook(productoId, grupoUrl) {
    const producto = _productoPorId(productoId);
    if (!producto) return;

    const _grupos = _gruposFB().filter(_grupoValido);

    const existing = document.getElementById('fbPreviewModal');
    if (existing) document.body.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'fbPreviewModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    const fbUrl = grupoUrl || 'https://www.facebook.com';
    const sBtnBase = 'border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:540px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📘 Vista previa — Facebook</h2>
          <button class="close-btn" onclick="cerrarFbPreview()" type="button">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;">
          <!-- Imagen de anuncio con branding — el mismo lienzo que Revólico,
               aquí con el nombre y el precio encima porque en Facebook la
               imagen es lo primero (y a veces lo único) que se mira. -->
          <div>
            <canvas id="fbImgCanvas" style="width:100%;border-radius:12px;display:block;background:#111;"></canvas>
            <div id="fbImgAviso" style="display:none;margin-top:8px;padding:9px 11px;border-radius:9px;font-size:12px;font-weight:700;line-height:1.4;background:rgba(231,76,60,.14);border:1px solid rgba(231,76,60,.4);color:#ff9a90;">⚠️ La foto de este producto no cargó — la imagen saldría con el icono de cámara. Revisa la conexión y vuelve a abrir la vista previa.</div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button id="btnCopyFbImg" type="button"
                style="${sBtnBase}flex:1;padding:8px 12px;background:rgba(59,89,152,.18);border:1px solid rgba(59,89,152,.4);color:#93c5fd;">📋 Copiar imagen</button>
              <button id="btnDlFbImg" type="button"
                style="${sBtnBase}flex:1;padding:8px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ccc;">⬇️ Descargar</button>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="fbPostTA" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">Texto del post</label>
              <div style="display:flex;gap:6px;">
                <button id="btnFbAI" type="button" style="${sBtnBase}background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);color:#c4b5fd;">✨ Mejorar con IA</button>
                <button id="btnCopyFbPost" type="button" style="${sBtnBase}background:rgba(59,89,152,.15);border:1px solid rgba(59,89,152,.35);color:#93c5fd;">📋 Copiar</button>
              </div>
            </div>
            <textarea id="fbPostTA" rows="13"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:12px;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box;"></textarea>
          </div>
          ${_grupos.length ? `<button type="button" id="btnFbColaGrupos"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#FF6B35,#C9A96E);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            📢 Publicar en mis grupos, uno a uno (${_grupos.length})
          </button>
          <p style="font-size:11px;opacity:.6;margin:-6px 0 0;text-align:center;line-height:1.4;">Cada grupo recibe su propia versión del texto y de la imagen, con una pausa entre uno y otro.</p>` : ''}
          <button type="button" id="btnAbrirFb"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#3B5998,#4267B2);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            📘 Copiar y Abrir ${_grupos.length ? 'un grupo' : 'Facebook'} →
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.getElementById('fbPostTA').value = _textoFacebook(producto);

    const fbCanvas = document.getElementById('fbImgCanvas');
    if (fbCanvas) {
        const _aviso = document.getElementById('fbImgAviso');
        _dibujarImagenAnuncio(fbCanvas, producto, { formato: 'cuadrado', texto: true }).then(hayFoto => {
            if (_aviso) _aviso.style.display = hayFoto ? 'none' : 'block';
        }).catch(() => {
            fbCanvas.style.display = 'none';
            if (_aviso) { _aviso.textContent = '⚠️ No se pudo generar la imagen del anuncio.'; _aviso.style.display = 'block'; }
        });
    }

    // Facebook no deja publicar desde fuera: el flujo es copiar la imagen,
    // pegarla en el grupo y pegar debajo el texto. Por eso los dos botones,
    // igual que en Revólico.
    document.getElementById('btnCopyFbImg')?.addEventListener('click', function() {
        const cv = document.getElementById('fbImgCanvas');
        if (!cv) return;
        cv.toBlob(async blob => {
            try {
                await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
                mostrarNotificacion('✅ Imagen copiada — pégala en la publicación de Facebook', 'success');
            } catch(e) {
                mostrarNotificacion('❌ No se pudo copiar — usa ⬇️ Descargar', 'error');
            }
        }, 'image/png');
    });

    document.getElementById('btnDlFbImg')?.addEventListener('click', function() {
        const cv = document.getElementById('fbImgCanvas');
        if (!cv) return;
        const a = document.createElement('a');
        a.download = `tiendamax-fb-${producto.id}.jpg`;
        a.href = cv.toDataURL('image/jpeg', 0.9);
        a.click();
    });

    // Aquí había un «Abrir en todos mis grupos»: abría todas las pestañas a la
    // vez con el MISMO texto y la misma imagen. Cinco posts idénticos en cinco
    // grupos en un minuto es exactamente lo que Facebook marca como spam. Ahora
    // es una cola: un grupo cada vez, su propia versión, y una pausa.
    document.getElementById('btnFbColaGrupos')?.addEventListener('click', function() {
        cerrarFbPreview();
        tmColaGrupos(producto.id);
    });

    document.getElementById('btnFbAI')?.addEventListener('click', async function() {
        this.textContent = '⏳ Generando...';
        this.disabled = true;
        try {
            const texto = await _generarTextoFacebookAI(producto);
            document.getElementById('fbPostTA').value = texto;
            mostrarNotificacion('✅ Post mejorado con IA', 'success');
        } catch(e) {
            mostrarNotificacion('❌ ' + (e.message || 'Error IA'), 'error');
        } finally {
            this.textContent = '✨ Mejorar con IA';
            this.disabled = false;
        }
    });

    document.getElementById('btnCopyFbPost')?.addEventListener('click', async function() {
        await _copiar(document.getElementById('fbPostTA').value);
        this.textContent = '✅ Copiado';
        setTimeout(() => { this.textContent = '📋 Copiar'; }, 2000);
    });

    document.getElementById('btnAbrirFb')?.addEventListener('click', async function() {
        await _copiar(document.getElementById('fbPostTA').value);
        let w = null;
        try { w = window.open(fbUrl, '_blank', 'noopener,noreferrer'); } catch(e) {}
        // Se apunta al abrir, no al dibujar la vista previa: abrir la vista y
        // cerrarla no es publicar (la misma regla que el lote por categoría).
        // Con el nombre del grupo cuando es uno de los tuyos, para que su
        // registro y su tope diario lo cuenten.
        const _g = grupoUrl ? _grupos.find(x => x.url === grupoUrl) : null;
        _marcarPublicado(producto.id, 'fb', _g ? _grupoDestino(_g) : 'Facebook', _g);
        if (w) {
            mostrarNotificacion('✅ Texto copiado — pégalo en Facebook', 'success');
        } else {
            // Ventana bloqueada (típico en PWA/modo app): el texto ya quedó copiado.
            mostrarNotificacion('⚠️ El navegador bloqueó la ventana. Texto copiado — abre Facebook manualmente y pega, o permite ventanas emergentes para este sitio.', 'warning');
            return; // no cerrar el modal, para que pueda reintentar
        }
        cerrarFbPreview();
    });
}

function cerrarFbPreview() {
    const m = document.getElementById('fbPreviewModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}


function publicarEnGrupoFB(iGrupo) {
    const catalogo = _catalogo();
    if (!catalogo.length) return;
    const grupos = _gruposFB();
    const grupo = grupos[iGrupo];
    if (!grupo || !grupo.url) { mostrarNotificacion('❌ Agrega la URL del grupo primero', 'error'); return; }
    const prods = catalogo.filter(p => (grupo.productos || []).includes(p.id))
        .sort((a, b) => (!a.stock || a.stock <= 0) - (!b.stock || b.stock <= 0));
    if (prods.length === 0) { mostrarNotificacion('❌ No hay productos seleccionados para este grupo', 'error'); return; }

    const existing = document.getElementById('grupoPublicarModal');
    if (existing) document.body.removeChild(existing);
    const modal = document.createElement('div');
    modal.id = 'grupoPublicarModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:520px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📢 Publicar en: ${_escH(grupo.nombre || grupo.url)}</h2>
          <button class="close-btn" onclick="cerrarGrupoPublicarModal()" type="button">✕</button>
        </div>
        <p style="font-size:12px;opacity:.7;margin:8px 0 4px;">Haz clic en cada producto. Se copia la versión que le toca a este grupo y se abre — pega y publica, luego vuelve.</p>
        <p id="grupoPublicarHoy" style="font-size:12px;font-weight:700;margin:0 0 12px;"></p>
        <div id="grupoPublicarList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
      </div>`;
    document.body.appendChild(modal);

    const max = _grupoMaxDia(grupo);
    const hoyTxt = () => {
        const n = tmGrupoHoy(grupo);
        const el = document.getElementById('grupoPublicarHoy');
        if (el) el.textContent = max
            ? `Hoy aquí: ${n} de ${max}${n >= max ? ' — tope de hoy alcanzado' : ''}`
            : `Hoy aquí: ${n}${_grupoEnlaces(grupo) ? '' : ' · este grupo no admite enlaces'}`;
        return n;
    };
    hoyTxt();

    const list = document.getElementById('grupoPublicarList');
    prods.forEach((p, idx) => {
        const agotado = p.stock === 0;
        const row = document.createElement('div');
        row.id = `gprow_${p.id}`;
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;
            background:rgba(255,255,255,${agotado ? '.03' : '.06'});border-radius:10px;opacity:${agotado ? '.5' : '1'};`;
        const num = document.createElement('span');
        num.style.cssText = 'font-size:12px;font-weight:700;opacity:.5;min-width:18px;';
        num.textContent = `${idx + 1}.`;
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        const nombre = document.createElement('div');
        nombre.style.cssText = 'font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nombre.textContent = p.nombre;
        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:11px;opacity:.6;margin-top:2px;';
        // Dónde ya salió: repetir el mismo producto en el mismo grupo a los
        // pocos días es lo que hace que el administrador lo borre.
        const ult = tmGrupoUltimaDe(grupo, p.id);
        meta.textContent = `${_precioTxt(p)}${agotado ? ' · 🚫 Agotado' : ''}${ult ? ' · ya salió aquí ' + _cuandoTxt(ult) : ''}`;
        info.appendChild(nombre);
        info.appendChild(meta);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tm-gp-btn';
        if (agotado) {
            btn.textContent = '🚫 Agotado';
            btn.disabled = true;
            btn.style.cssText = 'background:#555;color:#999;border:none;padding:7px 14px;border-radius:8px;font-size:12px;cursor:not-allowed;white-space:nowrap;flex-shrink:0;';
        } else {
            btn.textContent = '📋 Copiar y Abrir';
            btn.style.cssText = 'background:#4267B2;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;';
            btn.addEventListener('click', async () => {
                if (max && tmGrupoHoy(grupo) >= max) {
                    mostrarNotificacion(`⏸️ Hoy ya van ${max} en este grupo (tu máximo). Sigue mañana.`, 'warning');
                    return;
                }
                if (!_colaPuedeSeguir(true)) return;
                await copiarYAbrirFacebook(p.id, grupo.url, iGrupo);
                _colaEmpezarPausa();
                btn.textContent = '✅ Publicado';
                btn.style.background = '#27AE60';
                btn.disabled = true;
                row.style.opacity = '.5';
                if (max && hoyTxt() >= max) {
                    list.querySelectorAll('.tm-gp-btn:not([disabled])').forEach(b => {
                        b.disabled = true; b.textContent = '⏸️ Tope de hoy';
                        b.style.background = '#555'; b.style.cursor = 'not-allowed';
                    });
                } else hoyTxt();
            });
        }
        row.appendChild(num); row.appendChild(info); row.appendChild(btn);
        list.appendChild(row);
    });
}

function cerrarGrupoPublicarModal() {
    const m = document.getElementById('grupoPublicarModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}

// ══════════════════════════════════════════════════════════════
//  COLA: UN PRODUCTO, TUS GRUPOS, UNO A UNO
// ══════════════════════════════════════════════════════════════
/* Sustituye al «Abrir en todos mis grupos». Tres reglas:

   · Un grupo cada vez, con SU versión ya copiada (tmVarianteGrupo).
   · Una pausa entre grupos (3–5 min, con cuenta atrás) y un tope por hora.
     La pausa es una sugerencia y se puede saltar; el tope no — es lo que
     separa publicar en varios grupos de que Facebook te limite la cuenta.
   · Un grupo donde el producto salió hace menos de TM_COLA_REPETIR_DIAS, o
     que ya llegó hoy a su máximo, queda apartado y dice por qué. Se puede
     incluir igual con un toque: lo decide quien conoce el grupo.

   Los relojes se guardan como una hora (localStorage), no como un contador:
   irse a Facebook y volver no reinicia nada, y vale igual para la lista de
   productos de un grupo (publicarEnGrupoFB), que respeta la misma pausa. */
const TM_COLA_PAUSA_KEY = 'tm_fb_pausa_min';
const TM_COLA_HORA_KEY  = 'tm_fb_max_hora';
const TM_COLA_HASTA_KEY = 'tm_fb_pausa_hasta';
const TM_COLA_REPETIR_DIAS = 7;
let _COLA = null, _colaReloj = null;

function _colaPausaMin() {
    const n = parseInt(localStorage.getItem(TM_COLA_PAUSA_KEY), 10);
    return n >= 3 && n <= 5 ? n : 4;
}
function _colaMaxHora() {
    const n = parseInt(localStorage.getItem(TM_COLA_HORA_KEY), 10);
    return n >= 1 && n <= 12 ? n : 4;
}
// Las publicaciones EN GRUPOS de la última hora (lo publicado en el muro
// propio no cuenta para el tope), de la más vieja a la más nueva.
function _colaPubsHora() {
    const dsts = new Set();
    _gruposFB().forEach(g => {
        const d = _grupoDestino(g); if (d) dsts.add(d);
        if (g && g.url) dsts.add(String(g.url).trim());
    });
    const desde = Date.now() - 3600000;
    const log = (typeof tmPublicaciones === 'function') ? tmPublicaciones() : [];
    return log.filter(e => e && e.red === 'fb' && e.ts >= desde && dsts.has(e.destino))
              .map(e => e.ts).sort((a, b) => a - b);
}
function _colaEsperaHora() {
    const ts = _colaPubsHora(), max = _colaMaxHora();
    if (ts.length < max) return 0;
    return Math.max(0, ts[ts.length - max] + 3600000 - Date.now());
}
function _colaEsperaPausa() {
    const hasta = parseInt(localStorage.getItem(TM_COLA_HASTA_KEY) || '0', 10) || 0;
    return Math.max(0, hasta - Date.now());
}
function _colaEmpezarPausa() {
    try { localStorage.setItem(TM_COLA_HASTA_KEY, String(Date.now() + _colaPausaMin() * 60000)); } catch (e) {}
}
function _mmss(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
// ¿Se puede publicar ya en un grupo? El tope por hora bloquea; la pausa, con
// `preguntar`, deja seguir si quien publica lo confirma.
function _colaPuedeSeguir(preguntar) {
    const h = _colaEsperaHora();
    if (h > 0) {
        mostrarNotificacion(`⏸️ Ya van ${_colaMaxHora()} en grupos en la última hora (tu tope). El siguiente, en ${_mmss(h)}.`, 'warning');
        return false;
    }
    const pz = _colaEsperaPausa();
    if (pz > 0 && preguntar) return confirm(`Faltan ${_mmss(pz)} de la pausa sugerida entre grupos. ¿Publicar ya de todos modos?`);
    return true;
}



// Por qué un grupo no entra en la cola de este producto ('' si entra).
// `planeados`: los que este mismo plan ya le mete hoy a ese grupo.
function _colaMotivo(g, pid, planeados) {
    const ult = tmGrupoUltimaDe(g, pid);
    if (ult && Date.now() - ult < TM_COLA_REPETIR_DIAS * 86400000) return `ya salió aquí ${_cuandoTxt(ult)}`;
    const max = _grupoMaxDia(g);
    if (max) {
        const n = tmGrupoHoy(g), m = n + (planeados || 0);
        if (m >= max) return planeados
            ? `llega a su máximo de hoy (${max}) con lo que ya va en este plan`
            : `hoy ya van ${n} aquí (tu máximo: ${max})`;
    }
    return '';
}

/* ── Qué trae cada grupo, para ordenar la cola ─────────────────────────
   Con datos, primero los grupos que más toques en WhatsApp traen por
   publicación. La regla es la de «Hoy toca»: SIN datos no se ordena por
   ellos. Un grupo cuenta como «con datos» cuando lleva GRUPO_MIN_PUBS
   publicaciones con su marca (el campo `g` del registro: las de antes de la
   marca no pueden haber traído nada medible, y contarlas acusaría al grupo).
   Un grupo que llega a ese mínimo con cero visitas va al final y lo dice;
   uno sin datos se queda donde lo pusiste. Si la lectura falla, orden de
   siempre y una línea que lo avisa: un fallo de red no es «este grupo no
   trae nada». */
const GRUPO_MIN_PUBS = 3;
function _grupoRendimiento(g, stats) {
    const cod = tmGrupoCodigo(g);
    if (!stats || !cod || !_grupoEnlaces(g)) return null;
    const pubs = _pubsGrupo(g).filter(e => e.g === cod).length;
    if (pubs < GRUPO_MIN_PUBS) return null;
    const e = stats[cod] || {};
    const vis = Number(e.visitas && e.visitas.count) || 0;
    const wa  = Number(e.whatsapp && e.whatsapp.count) || 0;
    return { pubs, vis, wa, tasa: wa / pubs, tasaVis: vis / pubs };
}
function _ordenarGrupos(entradas, stats) {
    const con = [], sin = [], nada = [];
    entradas.forEach(x => {
        const r = _grupoRendimiento(x.g, stats);
        x.rend = r;
        if (!r) sin.push(x);
        else if (!r.vis && !r.wa) { x.nota = `${r.pubs} publicaciones con marca y ninguna visita`; nada.push(x); }
        else { x.nota = `${r.wa} toque${r.wa === 1 ? '' : 's'} en WhatsApp en ${r.pubs} publicaciones`; con.push(x); }
    });
    con.sort((a, b) => (b.rend.tasa - a.rend.tasa) || (b.rend.tasaVis - a.rend.tasaVis));
    return con.concat(sin, nada);
}
// La lectura de lo que trae cada grupo, con un tope: la cola no puede
// quedarse esperando a Firebase. null = no se sabe (y entonces no se ordena).
function _statsConTope(ms) {
    return Promise.race([
        _gruposStats().catch(() => null),
        new Promise(r => setTimeout(() => r(null), ms)),
    ]);
}
function _notaOrden(stats, entradas) {
    if (!stats) return '⚠️ No pude leer lo que trae cada grupo: van en tu orden de siempre.';
    return entradas.some(x => x.rend) ? '📊 Primero los grupos que más te traen.' : '';
}

async function tmColaGrupos(productoId) {
    const producto = _productoPorId(productoId);
    if (!producto) return;
    const validos = _gruposFB().map((g, i) => ({ g, i })).filter(x => _grupoValido(x.g));
    if (!validos.length) { mostrarNotificacion('❌ No tienes grupos de Facebook guardados', 'error'); return; }
    const stats = await _statsConTope(2500);
    const orden = _ordenarGrupos(validos, stats);
    const items = orden.map(x => {
        const motivo = _colaMotivo(x.g, producto.id);
        return { p: producto, i: x.i, g: x.g, nota: x.nota || '', estado: motivo ? 'apartado' : 'pendiente', motivo };
    });
    _colaMontar({ items, titulo: producto.nombre, plan: false, nota: _notaOrden(stats, orden) });
}

/* El plan del día: los productos de «Hoy toca» repartidos por tus grupos en
   UNA sola cola, respetando lo mismo que la cola de un producto (7 días, el
   máximo de cada grupo contando lo que el propio plan le mete, el tope por
   hora y la pausa). El orden es en diagonal —en cada vuelta cada grupo recibe
   un producto distinto—, así que dos pasos seguidos nunca repiten ni grupo ni
   producto: publicar el mismo producto en cinco grupos seguidos es justo lo
   que se ve como spam aunque cada texto sea distinto. */
async function tmColaPlan(ids) {
    const prods = (ids || []).map(_productoPorId).filter(p => p && Number(p.stock || 0) > 0);
    if (!prods.length) { mostrarNotificacion('❌ No hay productos con stock para el plan', 'error'); return; }
    const validos = _gruposFB().map((g, i) => ({ g, i })).filter(x => _grupoValido(x.g));
    if (!validos.length) { mostrarNotificacion('❌ No tienes grupos de Facebook guardados', 'error'); return; }
    const stats = await _statsConTope(2500);
    const orden = _ordenarGrupos(validos, stats);
    const planeados = new Map();
    const items = [];
    for (let r = 0; r < prods.length; r++) {
        orden.forEach((x, j) => {
            const p = prods[(r + j) % prods.length];
            const ya = planeados.get(x.i) || 0;
            const motivo = _colaMotivo(x.g, p.id, ya);
            if (!motivo) planeados.set(x.i, ya + 1);
            items.push({ p, i: x.i, g: x.g, nota: x.nota || '', estado: motivo ? 'apartado' : 'pendiente', motivo });
        });
    }
    _colaMontar({ items, titulo: `Plan de hoy: ${prods.length} producto${prods.length === 1 ? '' : 's'} en ${orden.length} grupo${orden.length === 1 ? '' : 's'}`,
                  plan: true, nota: _notaOrden(stats, orden) });
}
window.tmColaPlan = tmColaPlan;

function _colaMontar(cola) {
    _COLA = Object.assign({ actual: -1, ultimo: -1 }, cola);
    _colaAvanzar();
    const prev = document.getElementById('fbColaModal');
    if (prev) prev.remove();
    const modal = document.createElement('div');
    modal.id = 'fbColaModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:540px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📢 En tus grupos, uno a uno</h2>
          <button class="close-btn" onclick="cerrarColaGrupos()" type="button">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:13px;font-weight:700;">${_escH(cola.titulo)}</div>
          ${cola.nota ? `<div id="colaNota" style="font-size:12px;opacity:.8;">${_escH(cola.nota)}</div>` : ''}
          <div id="colaPaso"></div>
          <div id="colaLista" style="display:flex;flex-direction:column;gap:6px;"></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;opacity:.85;">
            <label>Pausa entre grupos
              <select id="colaPausaSel" style="margin-left:4px;">${[3, 4, 5].map(n => `<option value="${n}" ${n === _colaPausaMin() ? 'selected' : ''}>${n} min</option>`).join('')}</select>
            </label>
            <label>Tope por hora
              <select id="colaHoraSel" style="margin-left:4px;">${[2, 3, 4, 5, 6, 8].map(n => `<option value="${n}" ${n === _colaMaxHora() ? 'selected' : ''}>${n}</option>`).join('')}</select>
            </label>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('colaPausaSel').addEventListener('change', function() {
        try { localStorage.setItem(TM_COLA_PAUSA_KEY, this.value); } catch (e) {}
    });
    document.getElementById('colaHoraSel').addEventListener('change', function() {
        try { localStorage.setItem(TM_COLA_HORA_KEY, this.value); } catch (e) {}
        _colaTic();
    });
    _colaPintar();
    clearInterval(_colaReloj);
    _colaReloj = setInterval(_colaTic, 1000);
}

function _colaAvanzar() {
    if (!_COLA) return;
    _COLA.actual = _COLA.items.findIndex(it => it.estado === 'pendiente');
    const it = _COLA.items[_COLA.actual];
    // La versión se fija al mostrar el grupo: apuntar la publicación la hace
    // avanzar, y el texto y la imagen de ESTE grupo tienen que ser los mismos.
    if (it) it.v = tmVarianteGrupo(it.g, it.i, it.p.id);
}

function _colaPintar() {
    if (!_COLA) return;
    const paso = document.getElementById('colaPaso');
    const lista = document.getElementById('colaLista');
    if (!paso || !lista) return;
    const { items, plan } = _COLA;
    const it = items[_COLA.actual];
    const hechos = items.filter(x => x.estado === 'abierto').length;
    const ult = items[_COLA.ultimo];
    const reabrir = ult ? `<div style="font-size:12px;padding:8px 10px;border-radius:8px;background:rgba(39,174,96,.12);">✅ Abierto: <b>${_escH(_grupoDestino(ult.g))}</b>. ¿No se abrió? <a href="#" id="colaReabrir">Abrirlo otra vez</a></div>` : '';
    if (!it) {
        const apartados = items.filter(x => x.estado === 'apartado').length;
        paso.innerHTML = reabrir + `<div style="padding:14px;border-radius:10px;background:rgba(255,255,255,.05);font-size:13px;line-height:1.5;">
            ${hechos ? `✅ Listo: ${plan ? hechos + ' publicaci' + (hechos === 1 ? 'ón' : 'ones') : 'publicado en ' + hechos + ' grupo' + (hechos === 1 ? '' : 's')}.` : 'No queda nada en la cola.'}
            ${apartados ? `<br>${apartados} apartado${apartados === 1 ? '' : 's'} — abajo dice por qué, y puedes incluirlo igual.` : ''}</div>`;
    } else {
        const pendientes = items.filter(x => x.estado === 'pendiente').length;
        const sinEnlaces = !_grupoEnlaces(it.g);
        const producto = it.p;
        paso.innerHTML = reabrir + `
          <div style="font-size:12px;opacity:.8;margin-bottom:6px;">${plan ? 'Paso' : 'Grupo'} ${hechos + 1} de ${hechos + pendientes} · ${plan ? `<b>${_escH(producto.nombre)}</b> → ` : ''}<b>${_escH(_grupoDestino(it.g))}</b> · versión ${it.v + 1} de ${TM_VARIANTES}${sinEnlaces ? ' · <span style="color:#f5b041;">sin enlaces</span>' : ''}</div>
          <canvas id="colaCanvas" style="width:100%;border-radius:12px;display:block;background:#111;"></canvas>
          <div id="colaAvisoFoto" style="display:none;margin-top:6px;font-size:12px;color:#ff9a90;">⚠️ La foto no cargó — la imagen saldría con el icono de cámara.</div>
          <div style="font-size:11px;font-weight:700;opacity:.6;margin:10px 0 4px;">1️⃣ GUARDA LA IMAGEN</div>
          <div style="display:flex;gap:8px;">
            <button id="colaCopiarImg" type="button" class="btn btn-ghost" style="flex:1;">📋 Copiar imagen</button>
            <button id="colaBajarImg" type="button" class="btn btn-ghost" style="flex:1;">⬇️ Descargar</button>
          </div>
          <div style="font-size:11px;font-weight:700;opacity:.6;margin:10px 0 4px;">2️⃣ COPIA EL TEXTO Y ABRE EL GRUPO</div>
          <textarea id="colaTexto" rows="10" style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:12px;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>
          <div id="colaCuenta" style="font-size:12px;margin:6px 0;min-height:16px;"></div>
          <button id="colaAbrir" type="button" style="width:100%;padding:14px;background:linear-gradient(135deg,#3B5998,#4267B2);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;">📋 Copiar texto y abrir el grupo →</button>
          <button id="colaSaltar" type="button" class="btn btn-ghost" style="width:100%;margin-top:8px;justify-content:center;">⏭️ Saltar ${plan ? 'este paso' : 'este grupo'}</button>`;
        document.getElementById('colaTexto').value =
            _textoFacebook(producto, { variante: it.v, enlaces: !sinEnlaces, grupo: it.g });
        const cv = document.getElementById('colaCanvas');
        _dibujarImagenAnuncio(cv, producto, _opcionesImagenVariante(producto, it.v, it.v)).then(hay => {
            const a = document.getElementById('colaAvisoFoto'); if (a) a.style.display = hay ? 'none' : 'block';
        }).catch(() => { cv.style.display = 'none'; });
        document.getElementById('colaCopiarImg').addEventListener('click', () => {
            cv.toBlob(async blob => {
                try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); mostrarNotificacion('✅ Imagen copiada', 'success'); }
                catch (e) { mostrarNotificacion('❌ No se pudo copiar — usa ⬇️ Descargar', 'error'); }
            }, 'image/png');
        });
        document.getElementById('colaBajarImg').addEventListener('click', () => {
            const a = document.createElement('a');
            a.download = `tiendamax-${producto.id}-v${it.v + 1}.jpg`;
            a.href = cv.toDataURL('image/jpeg', 0.9);
            a.click();
        });
        document.getElementById('colaAbrir').addEventListener('click', _colaAbrir);
        document.getElementById('colaSaltar').addEventListener('click', () => {
            it.estado = 'saltado'; it.motivo = 'lo saltaste';
            _colaAvanzar(); _colaPintar();
        });
    }
    document.getElementById('colaReabrir')?.addEventListener('click', e => {
        e.preventDefault();
        if (ult) window.open(ult.g.url, '_blank', 'noopener,noreferrer');
    });

    const chip = { pendiente: '⏳ en cola', abierto: '✅ publicado', saltado: '⏭️ saltado', apartado: '⏸️ apartado' };
    lista.innerHTML = items.map((x, k) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,${k === _COLA.actual ? '.10' : '.04'});font-size:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${plan ? _escH(_nombreLimpio(x.p)) + ' → ' : ''}${_escH(_grupoDestino(x.g))}</div>
            <div style="opacity:.65;">${chip[x.estado]}${x.motivo ? ' · ' + _escH(x.motivo) : ''}${x.nota ? ' · 📊 ' + _escH(x.nota) : ''}</div>
          </div>
          ${x.estado === 'apartado' || x.estado === 'saltado' ? `<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 8px;" data-cola-incluir="${k}">Incluir igual</button>` : ''}
        </div>`).join('');
    lista.querySelectorAll('[data-cola-incluir]').forEach(b => b.addEventListener('click', () => {
        const x = items[Number(b.dataset.colaIncluir)];
        if (!x) return;
        x.estado = 'pendiente'; x.motivo = '';
        if (_COLA.actual < 0) _colaAvanzar();
        _colaPintar();
    }));
    _colaTic();
}

// Cada segundo: la cuenta atrás y si el botón de abrir está disponible. Solo
// toca esas dos cosas; repintar el lienzo cada segundo sería absurdo.
function _colaTic() {
    const modal = document.getElementById('fbColaModal');
    if (!modal || modal.style.display === 'none') { clearInterval(_colaReloj); _colaReloj = null; return; }
    const cuenta = document.getElementById('colaCuenta');
    const btn = document.getElementById('colaAbrir');
    if (!cuenta || !btn) return;
    const h = _colaEsperaHora(), pz = _colaEsperaPausa();
    if (h > 0) {
        cuenta.innerHTML = `⏸️ Ya van ${_colaMaxHora()} en grupos en la última hora (tu tope). El siguiente, en <b>${_mmss(h)}</b>.`;
        btn.disabled = true; btn.style.opacity = '.5';
    } else if (pz > 0) {
        cuenta.innerHTML = `⏳ Pausa sugerida: <b>${_mmss(pz)}</b> — así Facebook no lo ve como spam. <a href="#" id="colaSaltarPausa">Saltar la pausa</a>`;
        btn.disabled = true; btn.style.opacity = '.5';
        document.getElementById('colaSaltarPausa')?.addEventListener('click', e => {
            e.preventDefault();
            try { localStorage.removeItem(TM_COLA_HASTA_KEY); } catch (er) {}
            _colaTic();
        });
    } else {
        cuenta.textContent = '';
        btn.disabled = false; btn.style.opacity = '1';
    }
}

async function _colaAbrir() {
    if (!_COLA) return;
    const it = _COLA.items[_COLA.actual];
    if (!it || !_colaPuedeSeguir(false) || _colaEsperaPausa() > 0) return;
    const ta = document.getElementById('colaTexto');
    await _copiar(ta ? ta.value : '');
    let w = null;
    try { w = window.open(it.g.url, '_blank', 'noopener,noreferrer'); } catch (e) {}
    _marcarPublicado(it.p.id, 'fb', _grupoDestino(it.g), it.g);
    it.estado = 'abierto'; it.motivo = '';
    _COLA.ultimo = _COLA.actual;
    _colaEmpezarPausa();
    mostrarNotificacion(w ? '✅ Texto copiado — pégalo en el grupo' : '⚠️ El navegador bloqueó la ventana. El texto ya está copiado: abre el grupo con «Abrirlo otra vez».', w ? 'success' : 'warning');
    _colaAvanzar();
    _colaPintar();
}

// ══════════════════════════════════════════════════════════════
//  LO QUE YA PUBLICASTE: CORREGIR Y RENOVAR
// ══════════════════════════════════════════════════════════════
/* La lista que abren las tareas del Copiloto «agotados que siguen publicados»,
   «precio viejo en lo publicado» y «Revólico para renovar». El análisis NO
   está aquí: es tmPubVivas / tmRevPorRenovar en admin-copilot.js, el mismo
   que cuenta la tarea — con una copia en cada lado, el número de la tarea y la
   lista que abre acabarían siendo dos conjuntos distintos. Aquí solo se pinta
   y se apunta lo resuelto. */
function _grupoPorDestino(destino) {
    return _gruposFB().find(g => _grupoValido(g) && (_grupoDestino(g) === destino || String(g.url).trim() === destino)) || null;
}
function _pvFila(texto, sub, botones) {
    // Se parte en dos renglones cuando no cabe: en un móvil, texto y botones
    // en una sola fila dejaban el nombre en una columna de una palabra.
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px;">
        <div style="flex:1 1 170px;min-width:0;"><div style="font-weight:600;">${texto}</div>${sub ? `<div style="opacity:.7;">${sub}</div>` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;">${botones}</div></div>`;
}
function _pvBtn(txt, attrs) {
    return `<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 8px;" ${attrs}>${txt}</button>`;
}
function _pvAbrirDe(destino) {
    if (destino === 'Revolico') return _pvBtn('🟠 Abrir Revólico', `data-pv-url="https://www.revolico.com/"`);
    const g = _grupoPorDestino(destino);
    return g ? _pvBtn('Abrir grupo', `data-pv-url="${_escH(g.url)}"`) : '';
}

window.tmPubVivasAbrir = function(seccion) {
    const prev = document.getElementById('pubVivasModal');
    if (prev) prev.remove();
    const modal = document.createElement('div');
    modal.id = 'pubVivasModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:540px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>📌 Lo que ya publicaste</h2>
          <button class="close-btn" type="button" id="pvCerrar">✕</button>
        </div>
        <div id="pvCuerpo" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('pvCerrar').addEventListener('click', () => { modal.remove(); _pvAvisarCopiloto(); });
    _pvPintar(seccion);
};
function _pvEstadoTexto() {
    return typeof window.tmPubResueltosEstado === 'function' ? window.tmPubResueltosEstado() : '';
}
// El guardado cambia de estado DENTRO de los 4 s de espera: sin repintar la
// línea, seguiría diciendo «sin guardar» cuando ya llegó.
window.tmPubResueltosAlCambiar = function() {
    const e = document.getElementById('pvEstado');
    if (e) e.textContent = _pvEstadoTexto();
};
function _pvAvisarCopiloto() {
    try { if (typeof window.tmCopilotRefresh === 'function') window.tmCopilotRefresh(false); } catch (e) {}
}
function _pvPintar(seccion) {
    const cuerpo = document.getElementById('pvCuerpo');
    if (!cuerpo) return;
    if (typeof window.tmPubVivas !== 'function') {
        cuerpo.innerHTML = '<p style="font-size:13px;">El Copiloto no está cargado: sin él no puedo cruzar lo publicado con el catálogo.</p>';
        return;
    }
    const v = window.tmPubVivas();
    const renov = typeof window.tmRevPorRenovar === 'function' ? window.tmRevPorRenovar() : [];
    const bloques = [];
    const cab = (id, t, d) => `<div id="${id}"><h3 style="margin:0 0 4px;font-size:15px;">${t}</h3><p style="font-size:12px;opacity:.7;margin:0 0 8px;">${d}</p>`;
    if (v.agotados.length) bloques.push(cab('pv-agotados', '📵 Agotados que siguen publicados',
        'Bórralos o márcalos como vendidos en cada sitio: la gente sigue escribiendo por ellos.')
        + v.agotados.map(x => `<div style="font-size:13px;font-weight:700;margin:8px 0 4px;">${_escH(x.p.nombre)}</div>`
            + x.donde.map(d => _pvFila(_escH(d.donde), 'publicado ' + _cuandoTxt(d.ts),
                _pvAbrirDe(d.donde) + _pvBtn('✅ Ya lo quité', `data-pv-resolver="agotado" data-pid="${_escH(String(x.p.id))}" data-destino="${_escH(d.donde)}"`))).join('')).join('') + '</div>');
    if (v.precios.length) bloques.push(cab('pv-precios', '💲 Con el precio viejo',
        'El post sigue diciendo el precio de cuando salió. Edítalo en cada sitio.')
        + v.precios.map(x => `<div style="font-size:13px;font-weight:700;margin:8px 0 4px;">${_escH(x.p.nombre)} · ahora ${_escH(_precioTxt(x.p, x.ahora))}</div>`
            + x.donde.map(d => _pvFila(_escH(d.donde), `dice ${_escH('$' + d.precio + ' ' + (d.moneda || 'USD'))} · publicado ${_cuandoTxt(d.ts)}`,
                _pvAbrirDe(d.donde) + _pvBtn('✅ Ya lo corregí', `data-pv-resolver="precio" data-pid="${_escH(String(x.p.id))}" data-destino="${_escH(d.donde)}"`))).join('')).join('') + '</div>');
    if (renov.length) bloques.push(cab('pv-renovar', '🔁 Revólico para renovar',
        'Renuévalos desde «Mis anuncios» en tu cuenta: sube el anuncio en la lista sin duplicarlo.')
        + renov.map(x => _pvFila(_escH(x.p.nombre), `publicado o renovado hace ${x.dias} días`,
            _pvAbrirDe('Revolico') + _pvBtn('✅ Lo renové', `data-pv-renovar="${_escH(String(x.p.id))}"`))).join('') + '</div>');
    cuerpo.innerHTML = (bloques.length ? bloques.join('')
        : '<div style="padding:14px;border-radius:10px;background:rgba(255,255,255,.05);font-size:13px;">✅ Nada que corregir: lo que tienes publicado sigue siendo verdad.</div>')
        // Lo que marcas aquí se guarda en el repositorio. Si no llegó, hay que poder verlo.
        + `<p id="pvEstado" style="font-size:10.5px;opacity:.7;margin:0;text-align:center;">${_escH(_pvEstadoTexto())}</p>`;
    if (seccion) {
        const ancla = document.getElementById(seccion === 'rev-renovar' ? 'pv-renovar' : 'pv-agotados') || document.getElementById('pv-precios');
        if (ancla) try { ancla.scrollIntoView({ block: 'start' }); } catch (e) {}
    }
    cuerpo.querySelectorAll('[data-pv-url]').forEach(b => b.addEventListener('click', () =>
        window.open(b.dataset.pvUrl, '_blank', 'noopener,noreferrer')));
    cuerpo.querySelectorAll('[data-pv-resolver]').forEach(b => b.addEventListener('click', () => {
        if (typeof window.tmPubResolver === 'function') window.tmPubResolver(b.dataset.pid, b.dataset.destino, b.dataset.pvResolver);
        _pvPintar();
    }));
    cuerpo.querySelectorAll('[data-pv-renovar]').forEach(b => b.addEventListener('click', () => {
        _marcarPublicado(b.dataset.pvRenovar, 'revolico', 'Revolico (renovado)');
        _pvPintar();
    }));
}

function cerrarColaGrupos() {
    const m = document.getElementById('fbColaModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
    clearInterval(_colaReloj); _colaReloj = null;
}


// ══════════════════════════════════════════════════════════════
//  REVOLICO — Vista previa + publicación
// ══════════════════════════════════════════════════════════════

const _REVOLICO_CATS = {
    'WiFi':         { label: 'Computación › Redes',         url: 'https://www.revolico.com/anuncios/nuevo/?c=58' },
    'Energía':      { label: 'Electrónica › Baterías',      url: 'https://www.revolico.com/anuncios/nuevo/?c=74' },
    'Herramientas': { label: 'Herramientas',                url: 'https://www.revolico.com/anuncios/nuevo/?c=23' },
    'Electrónica':  { label: 'Electrónica',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Celulares':    { label: 'Celulares y Tablets',         url: 'https://www.revolico.com/anuncios/nuevo/?c=7'  },
    'Computación':  { label: 'Computación',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=8'  },
    'PC y Laptops': { label: 'Computación',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=8'  },
    'Hogar':        { label: 'Hogar y Jardín',              url: 'https://www.revolico.com/anuncios/nuevo/?c=10' },
    'Útiles':       { label: 'Hogar y Jardín',              url: 'https://www.revolico.com/anuncios/nuevo/?c=10' },
    'Audio':        { label: 'Electrónica › Audio',         url: 'https://www.revolico.com/anuncios/nuevo/?c=72' },
    'Cámaras':      { label: 'Electrónica › Fotografía',   url: 'https://www.revolico.com/anuncios/nuevo/?c=73' },
    'Iluminación':  { label: 'Electrónica',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Carros':       { label: 'Autos y Otros Vehículos',     url: 'https://www.revolico.com/anuncios/nuevo/?c=3'  },
    'Motos':        { label: 'Motocicletas y Bicicletas',   url: 'https://www.revolico.com/anuncios/nuevo/?c=4'  },
    'Ropa':         { label: 'Moda y Accesorios',           url: 'https://www.revolico.com/anuncios/nuevo/?c=12' },
    'Lencería':     { label: 'Moda y Accesorios',           url: 'https://www.revolico.com/anuncios/nuevo/?c=12' },
    'Seguridad':    { label: 'Electrónica',                 url: 'https://www.revolico.com/anuncios/nuevo/?c=9'  },
    'Juegos':       { label: 'Juguetes y Videojuegos',      url: 'https://www.revolico.com/anuncios/nuevo/?c=44' },
};
const _REVOLICO_DEFAULT = { label: 'Electrónica', url: 'https://www.revolico.com/anuncios/nuevo/?c=9' };

// Cuatro datos de la ficha, en líneas cortas. Quien mira clasificados escanea
// buscando cifras, no lee párrafos: el anuncio llevaba solo la descripción en
// prosa aunque el producto tuviera guardados marca, modelo, velocidad y
// puertos. Se saltan los valores largos: en Revólico el texto va sin formato y
// una línea de 90 caracteres se parte por donde caiga.
function _fichaCorta(producto, maxFilas) {
    const filas = Array.isArray(producto && producto.ficha) ? producto.ficha : [];
    return filas
        .filter(f => f && f.k && f.v && String(f.v).length <= 55)
        .slice(0, maxFilas || 4)
        .map(f => `• ${String(f.k).trim()}: ${String(f.v).trim()}`);
}

function _nombreLimpio(producto) {
    const n = String((producto && producto.nombre) || '');
    const t = (typeof tmPartirEmoji === 'function') ? (tmPartirEmoji(n).texto || n) : n;
    return t.replace(/\s+/g, ' ').trim();
}

/* Acorta un título sin perder el modelo. Cortar por el final es lo que hacía
   que «…soldadura multiproceso 3 en 1» saliera sin el «3 en 1», y en este
   catálogo lo que va al final suele ser justo lo que distingue un producto de
   su hermano (m2/m5, 8/5 puertos, 962g). Se quitan primero las palabras más
   largas que NO llevan cifra —las descriptivas—, nunca la primera. */
function _acortarTitulo(texto, max) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const ws = t.split(' ');
    const orden = ws.map((w, k) => ({ w, k }))
        .filter(x => x.k > 0 && !/\d/.test(x.w))
        .sort((a, b) => b.w.length - a.w.length || b.k - a.k);
    const fuera = new Set();
    const unir = () => ws.filter((w, k) => !fuera.has(k)).join(' ');
    for (const x of orden) { if (unir().length <= max) break; fuera.add(x.k); }
    const r = unir();
    return r.length <= max ? r : r.slice(0, max - 1) + '…';
}

/* Hasta cuatro títulos para el mismo producto. TODOS llevan el nombre entero
   (o acortado con _acortarTitulo): lo que cambia es lo que se le añade, y solo
   se añade lo que el producto declara —la marca si el nombre no la dice, un
   dato corto de su ficha, la garantía, la rebaja—. Un título que no cabe en
   70 con el nombre entero no se ofrece: acortar el nombre para meter un
   adorno es cambiar el modelo por un adjetivo. */
function _titulosRevolico(producto) {
    const base = _nombreLimpio(producto);
    const out = [_acortarTitulo(base, 70)];
    const add = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t && t.length <= 70 && !out.includes(t)) out.push(t); };
    const bajo = base.toLowerCase();
    const ficha = Array.isArray(producto && producto.ficha) ? producto.ficha : [];
    const marca = ficha.find(f => f && /^marca$/i.test(String(f.k || '').trim()));
    if (marca && marca.v && !bajo.includes(String(marca.v).trim().toLowerCase())) add(`${String(marca.v).trim()} ${base}`);
    ficha.filter(f => f && f.k && f.v && !/^(marca|modelo)$/i.test(String(f.k).trim())
                      && String(f.v).trim().length >= 3 && String(f.v).trim().length <= 22
                      && !bajo.includes(String(f.v).trim().toLowerCase()))
         .slice(0, 2).forEach(f => add(`${base} · ${String(f.v).trim()}`));
    if (producto && producto.garantia) add(`${base} con garantía`);
    const precio = Number((producto && producto.precioActual) || 0), antes = Number((producto && producto.precioOriginal) || 0);
    if (antes > precio && precio > 0) add(`${base} · rebajado`);
    return out.slice(0, TM_VARIANTES);
}

// `variante` 0 es el anuncio de siempre; las otras cambian el título (ver
// _titulosRevolico), el orden de los bloques y las palabras del pedido. Los
// datos son los mismos en las cuatro.
function _textoRevolico(producto, variante) {
    const v = Math.abs(parseInt(variante, 10) || 0) % TM_VARIANTES;
    const titulos = _titulosRevolico(producto);
    // Título: solo nombre, sin precio (Revolico tiene campo de precio separado)
    const titulo = titulos[v % titulos.length] || String(producto.nombre || '').slice(0, 70);

    const usado = producto.usado ? 'PRODUCTO USADO / REFURBISHED' : '';
    const desc = producto.descripcion ? String(producto.descripcion).trim() : '';
    const ficha = _fichaCorta(producto).join('\n');

    // Qué trae la caja, en una línea: es la duda que más se pregunta por
    // WhatsApp y responderla en el anuncio ahorra el mensaje.
    const incluye = (Array.isArray(producto.incluye) ? producto.incluye : [])
        .map(x => String(x).replace(/^\s*\d+\s*[x×]\s*/i, '').split(' (')[0].trim())
        .filter(Boolean).slice(0, 4);
    const incl = incluye.length ? 'Incluye: ' + incluye.join(', ') : '';

    const confianza = [];
    if (producto.garantia)   confianza.push('Garantía: ' + producto.garantia);
    if (producto.devolucion) confianza.push('Devolución segura garantizada');
    const conf = confianza.join('\n');

    // El conteo de unidades no va: es un dato que envejece solo —el anuncio se
    // queda meses publicado y el stock cambia— y no ayuda a decidir. El aviso
    // de agotado sí, que ese evita que alguien escriba por algo que no hay.
    const agotado = producto.stock === 0 ? '⚠️ AGOTADO — Consultar disponibilidad' : '';

    // Revólico no es red social: los hashtags no hacen nada ahí (no hay búsqueda
    // por hashtag) y solo ensucian el anuncio. Se dejan fuera a propósito.
    // El enlace de WhatsApp se queda —un wa.me pelado abre un chat vacío y ahí
    // se pierden pedidos— pero adelgazado: ver _waPedido.
    const wa = _waPedido(producto, 'revolico'), url = _urlProducto(producto, 'revolico');
    const cta = [
        '📲 Pedir por WhatsApp: ' + wa + '\n🔗 Fotos y ficha completa: ' + url,
        '💬 Escríbeme por WhatsApp: ' + wa + '\n👀 Más fotos: ' + url,
        '👉 Pedidos: ' + wa + '\n🌐 Ficha: ' + url,
        '📩 WhatsApp: ' + wa + '\n📷 Fotos: ' + url,
    ][v];
    const orden = [
        [usado, desc, ficha, incl, conf, agotado, cta],
        [usado, ficha, _primerasLineas(desc, 4), incl, conf, agotado, cta],
        [usado, desc, incl, ficha, conf, agotado, cta],
        [usado, conf, ficha, desc, incl, agotado, cta],
    ][v];
    return { titulo, descripcion: orden.filter(Boolean).join('\n\n') };
}

// Cuántas veces salió ya en Revólico: de ahí la versión que toca y la foto
// que va de portada. Así el siguiente anuncio del mismo producto no es el
// mismo anuncio.
function _vecesRevolico(pid) {
    const log = (typeof tmPublicaciones === 'function') ? tmPublicaciones() : [];
    return log.filter(e => e && e.red === 'revolico' && e.pid === String(pid)).length;
}

/* `restaurar` = { v } cuando lo reabre el restaurador de `pageshow`: el dueño
   vuelve de Revólico a copiar el título y tiene que encontrar la MISMA
   versión que empezó a pegar, no la siguiente (apuntar la publicación hace
   avanzar la rotación). */
function previsualizarRevolico(productoId, restaurar) {
    const producto = _productoPorId(productoId);
    if (!producto) return;

    const catInfo = _REVOLICO_CATS[producto.categoria] || _REVOLICO_DEFAULT;
    const _vRest = restaurar ? parseInt(restaurar.v, 10) : NaN;
    let revVar = isFinite(_vRest) ? _vRest : _vecesRevolico(producto.id) % TM_VARIANTES;
    const { titulo, descripcion } = _textoRevolico(producto, revVar);
    const revFotos = _fotosDe(producto);
    const revUrl = catInfo.url;
    // Ya salió en Revólico: lo que toca casi siempre es RENOVAR ese anuncio,
    // no poner otro igual al lado.
    const revUlt = (!restaurar && typeof tmUltimaPublicacion === 'function') ? tmUltimaPublicacion(producto.id, 'revolico') : null;
    let revMarcado = !!restaurar;

    const existing = document.getElementById('revPreviewModal');
    if (existing) existing.remove();

    // Abrir una vista previa anula el "me fui a Revolico" que hubiera pendiente
    // de otro producto. Sin esto, el restaurador de más abajo pisaba este modal
    // con el del producto guardado y el anuncio salía con la descripción de
    // otro: el dueño abría uno tras otro y siempre veía el mismo texto.
    sessionStorage.removeItem('_tmRevActive');

    const modal = document.createElement('div');
    modal.id = 'revPreviewModal';
    modal.className = 'modal';
    modal.dataset.productoId = String(producto.id);
    modal.style.display = 'flex';

    const sBtnBase = 'border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:540px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h2>🟠 Vista previa — Revolico</h2>
          <button class="close-btn" onclick="cerrarRevPreview()" type="button">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;">
          ${revUlt ? `<div id="revRenovar" style="padding:11px 12px;border-radius:10px;background:rgba(245,176,65,.13);border:1px solid rgba(245,176,65,.4);font-size:12.5px;line-height:1.5;">
            🔁 <b>Ya lo publicaste en Revólico ${_cuandoTxt(revUlt)}.</b> Si ese anuncio sigue publicado, <b>renuévalo</b> desde «Mis anuncios» en tu cuenta de Revólico en vez de publicar otro: un anuncio repetido se ve como spam y lo pueden borrar.
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <button id="btnRevRenovado" type="button" style="${sBtnBase}padding:7px 12px;background:rgba(245,176,65,.25);border:1px solid rgba(245,176,65,.5);color:#f5b041;">✅ Lo renové</button>
              <span style="opacity:.7;align-self:center;">o sigue abajo para publicar uno nuevo (sale con otra versión).</span>
            </div>
          </div>` : ''}

          <!-- Imagen de anuncio con branding -->
          <div>
            <canvas id="revImgCanvas" style="width:100%;border-radius:12px;display:block;background:#111;"></canvas>
            <div id="revImgAviso" style="display:none;margin-top:8px;padding:9px 11px;border-radius:9px;font-size:12px;font-weight:700;line-height:1.4;background:rgba(231,76,60,.14);border:1px solid rgba(231,76,60,.4);color:#ff9a90;">⚠️ La foto de este producto no cargó — el anuncio saldría con el icono de cámara en su lugar. Revisa la conexión y vuelve a abrir la vista previa.</div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button id="btnCopyRevImg" type="button"
                style="${sBtnBase}flex:1;padding:8px 12px;background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar imagen</button>
              <button id="btnDlRevImg" type="button"
                style="${sBtnBase}flex:1;padding:8px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ccc;">⬇️ Descargar</button>
            </div>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="revTituloTA" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">
                Título &nbsp;<span id="revTituloCount" style="color:#FF6B35;">${titulo.length}/70</span>
              </label>
              <button id="btnCopyTitulo" type="button" onclick="copiarRevTitulo()"
                style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar título</button>
            </div>
            <textarea id="revTituloTA" maxlength="70" rows="2"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:13px;resize:none;outline:none;font-family:inherit;box-sizing:border-box;">${_escH(titulo)}</textarea>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="revPrecioInp" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">Precio (${_monedaDe(producto)})</label>
              <button id="btnCopyPrecio" type="button"
                style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar precio</button>
            </div>
            <input id="revPrecioInp" type="text" value="${Number(producto.precioActual || 0)}"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,107,53,.18);border-radius:8px;color:#FF6B35;font-size:15px;font-weight:700;outline:none;font-family:inherit;box-sizing:border-box;">
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label for="revDescTA" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;">Descripción</label>
              <div style="display:flex;gap:6px;">
                <button id="btnRevAI" type="button"
                  style="${sBtnBase}background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);color:#c4b5fd;">✨ IA</button>
                <button id="btnCopyDesc" type="button" onclick="copiarRevDesc()"
                  style="${sBtnBase}background:rgba(255,107,53,.15);border:1px solid rgba(255,107,53,.35);color:#FF6B35;">📋 Copiar</button>
              </div>
            </div>
            <textarea id="revDescTA" rows="8"
              style="width:100%;padding:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;font-size:12px;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box;">${_escH(descripcion)}</textarea>
          </div>

          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,.05);border-radius:8px;font-size:12px;">
            <span style="opacity:.6;">Categoría sugerida:</span>
            <span style="font-weight:700;color:#FF6B35;">${catInfo.label}</span>
          </div>

          <div style="display:flex;align-items:center;gap:8px;font-size:12px;">
            <span id="revVersion" style="opacity:.7;flex:1;"></span>
            <button id="btnRevOtra" type="button"
              style="${sBtnBase}background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ccc;">🔁 Otra versión</button>
          </div>

          <button type="button" id="btnAbrirRev"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#e67e22,#d35400);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-sizing:border-box;">
            🟠 Copiar descripción y Abrir Revolico →
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // Generar imagen de anuncio con branding. La foto de portada rota con la
    // versión cuando el producto tiene varias: la misma primera foto en cada
    // anuncio es lo primero que delata que es el mismo.
    const revCanvas = document.getElementById('revImgCanvas');
    const pintarRev = () => {
        if (!revCanvas) return;
        // Si la foto no entra, el lienzo dibuja un marcador de cámara y el
        // anuncio se puede publicar así sin que nadie lo note. Se avisa aquí
        // arriba, que es donde el dueño está mirando.
        const _aviso = document.getElementById('revImgAviso');
        const foto = revFotos.length ? revFotos[revVar % revFotos.length] : '';
        _dibujarImagenAnuncio(revCanvas, producto, foto && revVar % revFotos.length ? { foto } : undefined).then(hayFoto => {
            if (_aviso) _aviso.style.display = hayFoto ? 'none' : 'block';
        }).catch(() => {
            revCanvas.style.display = 'none';
            if (_aviso) { _aviso.textContent = '⚠️ No se pudo generar la imagen del anuncio.'; _aviso.style.display = 'block'; }
        });
        const ver = document.getElementById('revVersion');
        if (ver) ver.textContent = `Versión ${revVar + 1} de ${TM_VARIANTES}` +
            (revFotos.length > 1 ? ` · foto ${revVar % revFotos.length + 1} de ${revFotos.length} de portada` : '');
    };
    pintarRev();

    document.getElementById('btnRevOtra')?.addEventListener('click', function() {
        revVar = (revVar + 1) % TM_VARIANTES;
        const r = _textoRevolico(producto, revVar);
        const ta = document.getElementById('revTituloTA'); if (ta) ta.value = r.titulo;
        const cnt = document.getElementById('revTituloCount'); if (cnt) cnt.textContent = `${r.titulo.length}/70`;
        const da = document.getElementById('revDescTA'); if (da) da.value = r.descripcion;
        pintarRev();
    });

    document.getElementById('btnRevRenovado')?.addEventListener('click', function() {
        _marcarPublicado(producto.id, 'revolico', 'Revolico (renovado)');
        mostrarNotificacion('✅ Apuntado como renovado', 'success');
        cerrarRevPreview();
    });

    document.getElementById('btnCopyRevImg')?.addEventListener('click', async function() {
        const cv = document.getElementById('revImgCanvas');
        if (!cv) return;
        cv.toBlob(async blob => {
            try {
                await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
                mostrarNotificacion('✅ Imagen copiada — pégala en el campo de foto de Revolico', 'success');
            } catch(e) {
                mostrarNotificacion('❌ No se pudo copiar — usa ⬇️ Descargar', 'error');
            }
        // El portapapeles del navegador solo acepta PNG: con image/jpeg,
        // clipboard.write() lanzaba y este botón caía SIEMPRE en el aviso de
        // error. La descarga sigue en JPEG, que es lo que se sube.
        }, 'image/png');
    });

    document.getElementById('btnDlRevImg')?.addEventListener('click', function() {
        const cv = document.getElementById('revImgCanvas');
        if (!cv) return;
        const a = document.createElement('a');
        a.download = `anuncio-${producto.id}.jpg`;
        a.href = cv.toDataURL('image/jpeg', 0.85);
        a.click();
    });

    document.getElementById('revTituloTA')?.addEventListener('input', function() {
        const count = document.getElementById('revTituloCount');
        if (count) count.textContent = `${this.value.length}/70`;
    });

    document.getElementById('btnCopyPrecio')?.addEventListener('click', async function() {
        const val = document.getElementById('revPrecioInp')?.value || '';
        await _copiar(val);
        this.textContent = '✅ Copiado';
        setTimeout(() => { this.textContent = '📋 Copiar precio'; }, 2000);
    });

    document.getElementById('btnRevAI')?.addEventListener('click', async function() {
        this.textContent = '⏳...';
        this.disabled = true;
        try {
            const result = await _generarTextoRevolicoAI(producto);
            if (result.titulo) {
                const ta = document.getElementById('revTituloTA');
                if (ta) { ta.value = result.titulo; }
                const count = document.getElementById('revTituloCount');
                if (count) count.textContent = `${result.titulo.length}/70`;
            }
            if (result.descripcion) {
                const da = document.getElementById('revDescTA');
                if (da) da.value = result.descripcion;
            }
            mostrarNotificacion('✅ Anuncio mejorado con IA', 'success');
        } catch(e) {
            mostrarNotificacion('❌ ' + (e.message || 'Error IA'), 'error');
        } finally {
            this.textContent = '✨ IA';
            this.disabled = false;
        }
    });

    document.getElementById('btnAbrirRev')?.addEventListener('click', async function() {
        const desc = document.getElementById('revDescTA').value;
        await _copiar(desc);
        mostrarNotificacion('✅ Descripción copiada — regresa aquí para copiar más campos', 'success');
        sessionStorage.setItem('_tmRevActive', String(productoId));
        sessionStorage.setItem('_tmRevVar', String(revVar));
        // Se apunta al abrir Revólico, y una sola vez por vista previa: volver
        // a tocarlo para copiar otra cosa no es otro anuncio.
        if (!revMarcado) { revMarcado = true; _marcarPublicado(producto.id, 'revolico', 'Revolico'); }
        window.open(revUrl, '_blank', 'noopener,noreferrer');
        // No cerrar el modal — el usuario regresa a esta pantalla para seguir copiando
    });
}

async function copiarRevTitulo() {
    const ta = document.getElementById('revTituloTA');
    if (!ta) return;
    await _copiar(ta.value);
    const btn = document.getElementById('btnCopyTitulo');
    if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => { btn.textContent = '📋 Copiar título'; }, 2000); }
}

async function copiarRevDesc() {
    const ta = document.getElementById('revDescTA');
    if (!ta) return;
    await _copiar(ta.value);
    const btn = document.getElementById('btnCopyDesc');
    if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => { btn.textContent = '📋 Copiar descripción'; }, 2000); }
}

function cerrarRevPreview() {
    sessionStorage.removeItem('_tmRevActive');
    sessionStorage.removeItem('_tmRevVar');
    const m = document.getElementById('revPreviewModal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}


// ── Botones "Publicar" directos en la lista de configuración de Revolico ─────
(function() {
    const BTN_STYLE = 'background:#e67e22;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:4px;';


    // Aquí se envolvía renderizarRevolicoConfig para añadir los botones de
    // publicar a #listaRevolicoConfig. Ese contenedor no existe, y la función
    // tampoco desde este barrido — el envoltorio se quedaba reintentándose cada
    // 200 ms, para siempre, esperando algo que ya no iba a llegar.
})();

// Restaurar vista previa de Revolico si el usuario vuelve después de ir a otra app
window.addEventListener('pageshow', function() {
    const savedId = sessionStorage.getItem('_tmRevActive');
    if (!savedId) return;
    const m = document.getElementById('revPreviewModal');
    // Solo se reabre el modal que el propio usuario dejó a medias: el que sigue
    // en el DOM, oculto, y es de ESE producto. Si mientras tanto abrió otro, o
    // no hay modal, aquí no se toca nada.
    if (!m || getComputedStyle(m).display !== 'none') return;
    if (String(m.dataset.productoId || '') !== String(savedId)) return;
    // Esperar a que los productos estén disponibles antes de reabrir
    const tryReopen = (attempts) => {
        const prods = (typeof productos !== 'undefined' && Array.isArray(productos) ? productos : null)
            || (() => { try { return JSON.parse(localStorage.getItem('productos') || '[]'); } catch(e) { return []; } })();
        if (prods.length) { previsualizarRevolico(savedId, { v: sessionStorage.getItem('_tmRevVar') }); return; }
        if (attempts > 0) setTimeout(() => tryReopen(attempts - 1), 600);
    };
    setTimeout(() => tryReopen(5), 400);
});
