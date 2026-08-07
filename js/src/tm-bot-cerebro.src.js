/* ============================================================
   TiendaMax — Max Bot · cerebro del asistente
   ------------------------------------------------------------
   Este archivo NO se carga con la página: js/tm-bot.js (la burbuja)
   lo inyecta la primera vez que el cliente abre el chat. Así el
   homepage no paga los ~90 KB de base de conocimiento en 3G.

   Qué hace: responde SIN backend. Todo el razonamiento (intención,
   búsqueda, comparativas, cálculos de autonomía, explicaciones
   técnicas) corre en el navegador contra el catálogo real. No hay
   servidor que se pueda caer ni API key que se pueda vencer.

   El catálogo, la tasa, el número de WhatsApp y los favoritos NO se
   copian aquí: se leen en vivo del sitio (el global `productos`,
   getTasaMN(), getNumeroWhatsApp(), wishlist_v1) para que el bot
   nunca conteste con datos viejos.

   NO editar js/tm-bot-cerebro.js — es el minificado. Edita este
   .src.js y corre scripts/minify_js.py + scripts/build_js_bundle.py.
   ============================================================ */
(function(){
  'use strict';

  // ════════════════════════════════════════════════════════════
  //  ADAPTADOR AL SITIO REAL
  //  El prototipo traía el catálogo, la tasa y el WhatsApp
  //  incrustados. Congelarlos aquí significaría que el bot empieza
  //  a mentir el día que el admin cambie un precio, así que todos
  //  esos datos se leen en vivo del sitio en cada respuesta.
  // ════════════════════════════════════════════════════════════

  const SITE_URL = (location.origin && location.origin.indexOf('http') === 0)
    ? location.origin
    : 'https://tiendamax.org';

  // ── Config que puede cambiar sin recargar la página ──
  let WHATSAPP = '5354320170';
  let TASA_BASE_MN = 0;
  let MARGEN_MN = 0;
  let TASA_MN = 0;

  function _refrescarConfig(){
    try {
      WHATSAPP = (typeof getNumeroWhatsApp === 'function')
        ? getNumeroWhatsApp()
        : (localStorage.getItem('whatsappNumero') || '5354320170');
    } catch(e){ WHATSAPP = '5354320170'; }
    try {
      const base = parseFloat(localStorage.getItem('tasaMN') || '0');
      const margen = parseFloat(localStorage.getItem('margenMN'));
      TASA_BASE_MN = base > 0 ? base : 0;
      MARGEN_MN = isNaN(margen) ? 10 : margen;
      // getTasaMN() del sitio ya suma base+margen y devuelve 0 si no hay tasa.
      TASA_MN = (typeof getTasaMN === 'function') ? (getTasaMN() || 0) : (TASA_BASE_MN ? TASA_BASE_MN + MARGEN_MN : 0);
    } catch(e){ TASA_MN = 0; }
  }

  // ── Catálogo en vivo ──────────────────────────────────────
  // El sitio guarda los productos en el global `productos` (lo llena
  // tm-data.src.js desde productos-lite.json). Ese archivo trae
  // `precioActual`; el cerebro razona con `precio`, así que se
  // normaliza. No se clona el producto entero: se envuelve, para que
  // las descripciones que lleguen después (ver _cargarDescripciones)
  // aparezcan solas.
  let PRODUCTOS = [];
  let _catFirma = '';

  function _normalizar(p){
    const precio = Number(p.precioActual != null ? p.precioActual : p.precio) || 0;
    const original = Number(p.precioOriginal) || 0;
    return {
      id: p.id,
      nombre: String(p.nombre || ''),
      precio: precio,
      precioOriginal: original,
      imagen: p.imagen || '',
      categoria: String(p.categoria || ''),
      subcategoria: String(p.subcategoria || ''),
      stock: Number(p.stock) || 0,
      descuento: Number(p.descuento) || 0,
      usado: !!p.usado,
      masVendido: !!p.masVendido,
      garantia: p.garantia || '',
      devolucion: !!p.devolucion,
      specs: Array.isArray(p.specs) ? p.specs : [],
      descripcion: p.descripcion || _descCache[p.id] || '',
      slug: p.slug || '',
      _orig: p,
    };
  }

  // OJO: `productos` se lee por bareword, NO por window.productos.
  // tm-data.src.js lo declara con `let` en el top level de un script
  // clásico y `let` no crea propiedad en window: window.productos es
  // undefined siempre. Como este archivo también es script clásico,
  // comparte el entorno léxico global y lo ve por nombre.
  function _productosVivos(){
    try { if (typeof productos !== 'undefined' && Array.isArray(productos) && productos.length) return productos; } catch(e){}
    try { return JSON.parse(localStorage.getItem('productos') || '[]') || []; } catch(e){ return []; }
  }

  function refrescarCatalogo(force){
    const fuente = _productosVivos();
    // Firma barata para no re-normalizar 118 productos en cada mensaje.
    const firma = fuente.length + ':' + (fuente[0] && fuente[0].id) + ':' + (fuente[fuente.length-1] && fuente[fuente.length-1].id) + ':' + _descVersion;
    if (!force && firma === _catFirma && PRODUCTOS.length) return PRODUCTOS;
    _catFirma = firma;
    PRODUCTOS = fuente.map(_normalizar);
    return PRODUCTOS;
  }

  // ── Descripciones (el sitio público carga productos-lite.json, que
  //    no las trae). Sin ellas el bot pierde la mitad de su capacidad
  //    de búsqueda, así que se bajan una vez, en segundo plano, al
  //    abrir el chat. Si falla, el bot sigue funcionando con nombre,
  //    specs y categoría.
  let _descCache = {};
  let _descVersion = 0;
  let _descPedidas = false;

  function _cargarDescripciones(){
    if (_descPedidas) return;
    _descPedidas = true;
    // ¿Ya vienen completas? (pasa si alguien abrió una ficha antes)
    const vivos = _productosVivos();
    if (vivos.length && !vivos.some(p => !p.descripcion)) return;
    fetch('productos.json', { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(full => {
        if (!Array.isArray(full)) return;
        full.forEach(p => { if (p && p.descripcion) _descCache[p.id] = p.descripcion; });
        _descVersion++;
        refrescarCatalogo(true);
      })
      .catch(() => {});
  }

  // ── Categorías ────────────────────────────────────────────
  // Se arman desde el catálogo real, no desde una lista fija: si el
  // admin crea una categoría nueva mañana, el bot la nombra igual que
  // las demás en vez de ignorarla. El icono sale del mismo mapa que
  // usa la tienda (TM_ICONOS vía obtenerIconoCategoria) y la
  // descripción de esta tabla; lo que no esté aquí cae en un texto
  // genérico en vez de romperse.
  const CAT_DESC = {
    'WIFI':        {icono:'📶', desc:'Routers, antenas, repetidores y equipos de red'},
    'ENERGIA':     {icono:'⚡', desc:'Baterías, inversores, paneles solares y carga'},
    'CARROS':      {icono:'🚗', desc:'Accesorios y repuestos para vehículos'},
    'UTILES':      {icono:'🛠️', desc:'Herramientas, iluminación, hogar y bienestar'},
    'SEGURIDAD':   {icono:'🔒', desc:'Cámaras, alarmas y cerraduras inteligentes'},
    'HOGAR':       {icono:'🏠', desc:'Electrodomésticos y artículos para el hogar'},
    'MOTOS':       {icono:'🛵', desc:'Accesorios, aceites y partes para motocicletas'},
    'CELULARES':   {icono:'📱', desc:'Teléfonos y accesorios para móviles'},
    'AUDIO':       {icono:'🔊', desc:'Altavoces, audífonos y equipos de sonido'},
    'JUEGOS':      {icono:'🎮', desc:'Consolas, controles y videojuegos'},
    'ROPA':        {icono:'👗', desc:'Vestuario y moda'},
    'PC Y LAPTOPS':{icono:'💻', desc:'Computadoras y accesorios'},
    'GYM':         {icono:'🏋️', desc:'Equipamiento deportivo y fitness'},
  };

  let CATEGORIAS = [];

  function _iconoDeCategoria(nombre){
    const fija = CAT_DESC[String(nombre || '').toUpperCase()];
    if (fija) return fija.icono;
    // Emoji personalizado que el admin le puso a la categoría
    try {
      const perso = JSON.parse(localStorage.getItem('iconosPersonalizados') || '{}');
      const ico = perso[nombre] || perso[String(nombre).toUpperCase()];
      if (ico) return ico;
    } catch(e){}
    return '📦';
  }

  function refrescarCategorias(){
    const vistas = [];
    const orden = [];
    PRODUCTOS.forEach(p => {
      const c = p.categoria;
      if (c && vistas.indexOf(c) === -1){ vistas.push(c); orden.push(c); }
    });
    // Categorías declaradas por el admin aunque hoy no tengan productos
    try {
      const decl = JSON.parse(localStorage.getItem('categorias') || '[]');
      if (Array.isArray(decl)) decl.forEach(c => {
        const n = (typeof c === 'string') ? c : (c && c.nombre);
        if (n && vistas.indexOf(n) === -1){ vistas.push(n); orden.push(n); }
      });
    } catch(e){}
    CATEGORIAS = orden.map(n => {
      const fija = CAT_DESC[String(n).toUpperCase()];
      return {
        nombre: n,
        icono: _iconoDeCategoria(n),
        desc: fija ? fija.desc : 'Productos de ' + String(n).toLowerCase(),
      };
    });
    return CATEGORIAS;
  }

  // Punto único de refresco: se llama antes de cada respuesta.
  function _sincronizar(){
    _refrescarConfig();
    refrescarCatalogo();
    refrescarCategorias();
  }

  // ── Integración con la tienda ─────────────────────────────
  // El bot no reimplementa carrito, favoritos ni ficha: llama a las
  // funciones que ya usa el sitio, así el badge del corazón, el
  // contador del carrito y el modal quedan sincronizados.
  function abrirFichaEnTienda(id){
    if (typeof abrirDetalleProducto === 'function'){
      try { abrirDetalleProducto(id); return true; } catch(e){}
    }
    window.open(SITE_URL + '/p/producto-' + id + '.html', '_blank', 'noopener,noreferrer');
    return true;
  }

  function agregarAlCarritoTienda(id){
    if (typeof agregarAlCarrito === 'function'){
      try { agregarAlCarrito(id, 1); return true; } catch(e){}
    }
    return false;
  }

  // Favoritos: el prototipo guardaba su propia lista en
  // tm_bot_wishlist_v1, invisible para la tienda. Se apunta a
  // wishlist_v1 —la misma lista del ❤️ del catálogo— para que sea una
  // sola lista y el contador del header cuente lo que añade el bot.
  function _favIds(){
    // Igual que `productos`: `wishlist` es un `let` global, no window.wishlist.
    try { if (typeof wishlist !== 'undefined' && Array.isArray(wishlist)) return wishlist.map(String); } catch(e){}
    try { return (JSON.parse(localStorage.getItem('wishlist_v1') || '[]') || []).map(String); } catch(e){ return []; }
  }
  function _guardarFavIds(ids){
    try {
      localStorage.setItem('wishlist_v1', JSON.stringify(ids));
      // Mutar el array en sitio: reasignarlo no cambiaría el `let` del sitio.
      try {
        if (typeof wishlist !== 'undefined' && Array.isArray(wishlist)){
          wishlist.length = 0; ids.forEach(i => wishlist.push(i));
        }
      } catch(e){}
      if (typeof actualizarBadgeCorazon === 'function') actualizarBadgeCorazon();
      document.querySelectorAll('[data-like-id]').forEach(btn => {
        btn.classList.toggle('liked', ids.indexOf(String(btn.getAttribute('data-like-id'))) !== -1);
      });
    } catch(e){}
  }

  // ── Aprendizaje de preguntas → alimenta faq.html ──────────
  // scripts/build_faq.py regenera faq.html cada 6 h (workflow build-faq.yml)
  // mezclando 5 preguntas fijas con las que MÁS REPITEN los clientes, que lee
  // de /agente/faq en Firebase. Ese nodo lo llenaba el asistente anterior
  // (TmAgent); al retirarlo la página se habría quedado congelada en las 5
  // fijas para siempre, sin que nada fallara de forma visible. Lo hace Max.
  //
  // Contrato exigido por firebase-rules.json en /agente/faq/$faqKey:
  // query, intent, count y lastUpdated OBLIGATORIOS (lastResponse opcional),
  // con longitudes topadas. Si falta uno, la regla rechaza el PATCH entero.
  // Se conserva la misma forma de clave que usaba TmAgent para no partir en
  // dos el histórico ya acumulado.
  function _registrarPreguntaFAQ(texto, intent, respuestaHTML){
    try {
      const t = String(texto || '').trim();
      if (t.length < 5 || t.length > 300) return;
      if (t.charAt(0) === '/') return;              // comandos, no preguntas
      const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
      if (!base) return;
      // Firebase prohíbe . # $ / [ ] en las claves
      const clave = cleanForMatch(t).replace(/\s+/g, '_').substring(0, 50).replace(/[.#$/[\]]/g, '_');
      if (!clave) return;
      // Cortar a 300 puede partir un emoji por la mitad (son 2 unidades UTF-16)
      // y dejar un � en faq.html, que es una página pública indexada.
      const recortar = (txt, max) => {
        let r = String(txt).substring(0, max);
        if (r.length && /[\uD800-\uDBFF]/.test(r.charAt(r.length - 1))) r = r.slice(0, -1);
        return r;
      };
      const limpio = String(respuestaHTML || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      // Lo que escribe el cliente puede acabar en faq.html, que es pública y
      // la indexa Google, y ahora también se lee desde el panel. La gente
      // mete su teléfono en la misma frase ("soy de Holguín, mi número es
      // 5354…, ¿tienen routers?"). Se quita antes de guardarlo: una vez
      // dentro ya no hay forma de sacarlo de la página indexada.
      const _sinDatos = (txt) => String(txt)
          .replace(/\+?\s?(?:53\s?)?[5-9]\d{3}\s?\d{4}\b/g, '[teléfono]')
          .replace(/\b\d{8,}\b/g, '[número]')
          .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]');
      fetch(base + '/agente/faq/' + encodeURIComponent(clave) + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: _sinDatos(recortar(t, 300)),
          intent: recortar(String(intent || 'desconocido'), 40),
          lastResponse: _sinDatos(recortar(limpio, 300)),
          count: { '.sv': { increment: 1 } },       // incremento del lado del servidor
          lastUpdated: Date.now()
        })
      }).catch(function(){});
    } catch(e){}
  }

  // ════════════════════════════════════════════════════════════
  //  BASE DE CONOCIMIENTO EXPERTA (ampliada v3)
  // ════════════════════════════════════════════════════════════
  const KNOWLEDGE = {
    'wan': {
      term: 'puerto WAN',
      what: 'WAN = Wide Area Network. Es el puerto donde conectas el cable de internet que viene del proveedor (ETECSA, fibra, etc).',
      why: 'Sin este puerto, el router no puede recibir internet. Todos los routers domésticos lo tienen, pero en routers profesionales a veces es solo un puerto reconfigurable.',
      how: 'Si tu internet viene por cable (fibra óptica o coaxial), lo conectas al puerto WAN y el router reparte la señal por wifi y por los puertos LAN.',
      related: ['lan','gigabit','fibra','router'],
    },
    'lan': {
      term: 'puerto LAN',
      what: 'LAN = Local Area Network. Son los puertos para conectar dispositivos por cable (PC, TV, consola, otro router).',
      why: 'Conexión por cable = más estable y rápida que wifi. Ideal para TV Smart, consola de gaming o PC de trabajo.',
      how: 'Conectas un cable RJ45 del puerto LAN del router a tu dispositivo. Los routers típicos tienen 4 puertos LAN.',
      related: ['wan','gigabit','rj45','ethernet'],
    },
    'gigabit': {
      term: 'Gigabit (1000 Mbps)',
      what: 'Gigabit = 1000 Mbps. Es 10 veces más rápido que Fast Ethernet (100 Mbps).',
      why: 'Para copiar archivos grandes entre dispositivos en tu red local o para internet de alta velocidad, necesitas puertos Gigabit. Si no, te convierte en cuello de botella.',
      how: 'Asegúrate de que tanto el router como el dispositivo y el cable soporten Gigabit. Un cable Cat5e o Cat6 ya sirve.',
      related: ['lan','wan','ethernet','rj45'],
    },
    'fast ethernet': {
      term: 'Fast Ethernet (100 Mbps)',
      what: 'Fast Ethernet = puertos de 100 Mbps. Más lento que Gigabit pero suficiente para internet básico.',
      why: 'Si tu internet es de 50 Mbps o menos, Fast Ethernet basta. Para velocidades mayores o copia local, necesitas Gigabit.',
      how: 'Identificable porque los routers baratos lo traen. Si ves "Gigabit" en specs, ya es superior.',
      related: ['gigabit','lan'],
    },
    'wifi 6': {
      term: 'Wi-Fi 6 (802.11ax)',
      what: 'Wi-Fi 6 es el estándar más moderno de wifi. Más rápido, mejor con varios dispositivos a la vez, menor consumo.',
      why: 'Si tienes 10+ dispositivos conectados, smart TV, celular, laptop, consola... Wi-Fi 6 los atiende a todos sin perder velocidad. Wi-Fi 5 (AC) se ahoga con muchos.',
      how: 'Necesitas que tanto el router como el dispositivo soporten Wi-Fi 6. Es retrocompatible: un dispositivo viejo sigue funcionando, pero a su velocidad.',
      related: ['mu-mimo','banda','beamforming','wifi 5','ofdma'],
    },
    'wifi 5': {
      term: 'Wi-Fi 5 (802.11ac)',
      what: 'Wi-Fi 5 es el estándar anterior, todavía muy común. Suficiente para hogares con pocos dispositivos.',
      why: 'Si tienes 3-5 dispositivos y no haces streaming 4K simultáneo, Wi-Fi 5 (AC1200/AC1750) te basta y cuesta menos.',
      how: 'Funciona en doble banda (2.4 y 5 GHz). La velocidad real que obtienes es aprox la mitad de la teórica.',
      related: ['wifi 6','ac1200','banda'],
    },
    'ofdma': {
      term: 'OFDMA',
      what: 'OFDMA = permite al router atender varios dispositivos en una sola transmisión, no uno a la vez.',
      why: 'Es la killer feature de Wi-Fi 6. Reduce latencia cuando hay muchos dispositivos activos al mismo tiempo.',
      how: 'Automático en routers Wi-Fi 6. Asegúrate de que tus dispositivos también lo soporten.',
      related: ['wifi 6','mu-mimo'],
    },
    'mu-mimo': {
      term: 'MU-MIMO',
      what: 'MU-MIMO = Multi-User MIMO. Permite al router atender varios dispositivos a la vez sin repartir la velocidad.',
      why: 'Sin MU-MIMO, el router habla con un dispositivo a la vez (rápido, pero secuencial). Con MU-MIMO, habla con varios en paralelo.',
      how: 'Funciona en Wi-Fi 5 (AC) y superiores. Asegúrate de que el router lo soporte y que tus dispositivos también.',
      related: ['wifi 6','wifi 5','beamforming','ofdma'],
    },
    'beamforming': {
      term: 'Beamforming',
      what: 'Beamforming = el router enfoca la señal wifi hacia el dispositivo, en vez de radiar en todas direcciones.',
      why: 'Mejor alcance y más estabilidad. El router "sabe" dónde está tu celular y le manda señal dirigida.',
      how: 'Es automático. Solo necesitas un router que lo soporte (casi todos los modernos) y dispositivo compatible.',
      related: ['mu-mimo','banda','antena'],
    },
    'doble banda': {
      term: 'Doble banda (2.4 GHz + 5 GHz)',
      what: 'Dos frecuencias wifi: 2.4 GHz (más alcance, más lenta) y 5 GHz (menos alcance, más rápida).',
      why: '2.4 GHz atraviesa mejor paredes pero se satura (microondas, bluetooth, vecinos). 5 GHz es más limpia y rápida pero no llega tan lejos.',
      how: 'Conecta el celular/laptop a 5 GHz si estás cerca. Conecta cosas lejanas o viejas a 2.4 GHz.',
      related: ['banda','wifi 6','wifi 5','2.4','5 ghz'],
    },
    '2.4': {
      term: '2.4 GHz',
      what: 'Banda de wifi con más alcance pero menos velocidad. Atraviesa paredes mejor que 5 GHz.',
      why: 'Para dispositivos lejanos, cámaras wifi, cerraduras inteligentes, sensores IoT. Es la banda universal.',
      how: 'Casi todos los dispositivos soportan 2.4 GHz. Es la única banda que soportan los gadgets baratos.',
      related: ['5 ghz','doble banda','banda'],
    },
    '5 ghz': {
      term: '5 GHz',
      what: 'Banda de wifi con menos alcance pero mucha más velocidad. Ideal para streaming y gaming.',
      why: 'Para TV 4K, consola, descargas grandes, video llamadas. Menos interferencia que 2.4 GHz.',
      how: 'Necesitas estar relativamente cerca del router (la misma habitación o la siguiente).',
      related: ['2.4','doble banda','wifi 6'],
    },
    'ac1200': {
      term: 'AC1200',
      what: 'Estándar Wi-Fi 5 que suma 300 Mbps (2.4 GHz) + 867 Mbps (5 GHz) = 1200 Mbps teóricos.',
      why: 'Es el wifi más común en Cuba. Suficiente para una casa con varios dispositivos haciendo streaming HD.',
      how: 'La velocidad real que obtienes es 50-60% de la teórica. Aun así, basta para uso doméstico.',
      related: ['wifi 5','doble banda'],
    },
    'poE': {
      term: 'PoE (Power over Ethernet)',
      what: 'PoE = entrega electricidad y datos por el mismo cable de red. No necesitas enchufar el dispositivo a la corriente.',
      why: 'Para cámaras de seguridad, antenas wifi en el techo, puntos de acceso lejanos. Un solo cable RJ45 hace todo.',
      how: 'Necesitas un router/switch que entregue PoE (o un inyector PoE) y un dispositivo que lo reciba.',
      related: ['lan','rj45','camara'],
    },
    'rj45': {
      term: 'RJ45 (cable de red)',
      what: 'RJ45 = el conector del cable de red ethernet. El cablecito con clavija plástica que se conecta a routers y PCs.',
      why: 'Para conexión por cable, mucho más estable y rápido que wifi.',
      how: 'Categoría Cat5e (hasta 1 Gbps) o Cat6 (hasta 10 Gbps). Cat5e es suficiente para uso doméstico.',
      related: ['lan','gigabit','ethernet'],
    },
    'mppt': {
      term: 'MPPT (Maximum Power Point Tracking)',
      what: 'MPPT = tecnología que maximiza la energía que el panel solar entrega a la batería. Sigue el punto óptimo de operación.',
      why: 'Sin MPPT, pierdes 20-30% de la energía del panel. Con MPPT, aprovechas casi todo.',
      how: 'Viene integrado en inversores solares híbridos y en controladores de carga modernos. Si compras panel solar, busca MPPT.',
      related: ['solar','inversor','bateria','controlador','pwm'],
    },
    'pwm': {
      term: 'PWM (más barato que MPPT)',
      what: 'PWM = tecnología más simple y barata que MPPT para cargar baterías desde panel solar.',
      why: 'Cuesta menos pero pierde energía del panel. Para sistemas pequeños (panel < 100W) suele bastar.',
      how: 'Solo en controladores de carga básicos. Si el panel es grande o quieres eficiencia, ve por MPPT.',
      related: ['mppt','solar','controlador'],
    },
    'controlador de carga': {
      term: 'Controlador de carga solar',
      what: 'Es la pieza que va entre el panel y la batería. Regula cuánta corriente entra para que la batería se cargue bien y no se pase.',
      why: 'Sin él, el panel carga a lo bruto: en un día fuerte sobrecarga la batería y la estropea, y de noche la batería se descarga hacia el panel.',
      how: 'Se conecta primero la batería, después el panel y la carga al final. Los hay PWM (más baratos) y MPPT (aprovechan 20-30 % más).',
      related: ['mppt','pwm','solar','bateria'],
    },
    'ups': {
      term: 'UPS (respaldo ininterrumpido)',
      what: 'Un aparato con batería dentro que mantiene encendido lo que tenga enchufado cuando se va la corriente, sin que llegue a apagarse.',
      why: 'Para lo que no puede irse de golpe: una computadora, un router, una caja registradora. En un apagón te da minutos, no horas.',
      how: 'Para aguantar horas hace falta un inversor con batería aparte, no un UPS: el UPS está pensado para que te dé tiempo a guardar y apagar.',
      related: ['inversor','bateria','apagon'],
    },
    'ip66': {
      term: 'IP66 / IP67 (resistencia al agua y al polvo)',
      what: 'Dos cifras: la primera es el polvo (6 = no entra nada) y la segunda el agua. IP66 aguanta chorros de agua; IP67, quedar sumergido un rato.',
      why: 'Es lo que decide si una cámara o una lámpara puede ir a la intemperie. Un IP44 puesto fuera aguanta una llovizna, no un aguacero.',
      how: 'Para exterior en Cuba, busca IP66 como mínimo. Y ojo: la resistencia es del cuerpo, no de los empalmes del cable — esos hay que protegerlos aparte.',
      related: ['camara','exterior'],
    },
    'lifepo4': {
      term: 'LiFePO4 (litio hierro fosfato)',
      what: 'Tipo de batería de litio, más segura y duradera que las de plomo-ácido o las de litio traditional.',
      why: 'Hasta 6000 ciclos de carga (plomo-ácido = 500 ciclos). No se incendia como otras de litio. Soporta descarga profunda sin dañarse.',
      how: 'Para sistemas solares, inversores, vehículos eléctricos. Más cara al inicio pero más barata por ciclo de vida.',
      related: ['litio','bateria','solar','inversor'],
    },
    'litio': {
      term: 'Batería de litio',
      what: 'Batería de litio = la tecnología de los celulares y autos eléctricos. Más ligera, sin mantenimiento, más ciclos que plomo-ácido.',
      why: 'No hay que revisar el agua, no se sulfatan, descarga profunda sin daño. Cuesta más pero dura 5-10x más.',
      how: 'Cargar con voltaje y corriente correctos (el inversor/controlador debe ser compatible).',
      related: ['lifepo4','bateria','solar'],
    },
    'gel': {
      term: 'Batería de gel (AGM / sellada)',
      what: 'Es una plomo-ácido con el electrolito en gel, sellada: no hay que echarle agua ni ventilarla como a la de carro.',
      why: 'Aguanta mejor la descarga que una de arranque y no bota gases, así que puede ir dentro de la casa. Pero sigue siendo plomo: unos 500-800 ciclos y no le gusta bajar del 50%.',
      how: 'Buena opción si el presupuesto no llega a litio. Si la vas a ciclar todos los días con apagones largos, el litio sale más barato por año aunque cueste más al inicio.',
      related: ['plomo acido','litio','lifepo4','bateria'],
    },
    'plomo acido': {
      term: 'Batería de plomo-ácido',
      what: 'Batería tradicional de carro. Barata pero con poca vida útil (500 ciclos) y no soporta descarga profunda.',
      why: 'Para arrancar motores va perfecto. Para sistema solar o inversor NO es ideal: la descargas al 50% y se daña.',
      how: 'Necesita mantenimiento (revisar agua destilada). No la descargues más del 50% o se sulfata.',
      related: ['bateria','litio','lifepo4'],
    },
    'inversor': {
      term: 'Inversor',
      what: 'Inversor = convierte la corriente DC (batería/panel) en AC (la que usan los electrodomésticos).',
      why: 'Sin inversor, la energía de tu batería o panel solar no alimenta nevera, TV, ventilador. Solo sirve para cosas DC.',
      how: 'Elige por potencia (W) según lo que vas a conectar. Inversor híbrido = inversor + cargador + MPPT en uno.',
      related: ['mppt','bateria','solar','ondas pura','onda modificada'],
    },
    'ondas pura': {
      term: 'Inversor de onda pura (senoidal)',
      what: 'Inversor de onda pura = produce electricidad idéntica a la del enchufe de la pared. Limpia, sin distorsión.',
      why: 'OBLIGATORIO para equipos sensibles: nevera, aire acondicionado, TV LED, computadora, equipo médico. Onda modificada puede dañarlos.',
      how: 'Cuesta más que onda modificada pero protege tus equipos. Si vas a conectar electrodomésticos, siempre onda pura.',
      related: ['inversor','onda modificada'],
    },
    'onda modificada': {
      term: 'Inversor de onda modificada',
      what: 'Inversor de onda modificada = produce electricidad "aproximada", no idéntica a la del enchufe. Más barata.',
      why: 'Sirve para cargas simples: ventilador, bombilla, cargador de celular, herramientas. NO para nevera, TV LED, equipo médico.',
      how: 'Si solo necesitas luz y ventilador en apagones, basta. Pero cuidado con equipos electrónicos caros.',
      related: ['inversor','ondas pura'],
    },
    'inversor hibrido': {
      term: 'Inversor híbrido',
      what: 'Inversor híbrido = inversor + cargador de batería + controlador MPPT en un solo equipo.',
      why: 'No necesitas comprar 3 equipos por separado. Carga la batería con panel solar Y con la red eléctrica cuando hay.',
      how: 'Conectas panel + batería + salida AC. El equipo decide automáticamente de dónde tomar energía.',
      related: ['inversor','mppt','solar','bateria'],
    },
    'solar': {
      term: 'Energía solar',
      what: 'Sistema que captura luz del sol con paneles y la convierte en electricidad para cargar baterías.',
      why: 'En Cuba con apagones frecuentes, un sistema solar te da autonomía. Si combinas panel + batería + inversor, tienes luz 24/7.',
      how: 'Necesitas: 1) Panel solar, 2) Controlador/MPPT, 3) Batería, 4) Inversor. El tamaño depende de tu consumo.',
      related: ['mppt','lifepo4','inversor','bateria','panel solar'],
    },
    'panel solar': {
      term: 'Panel solar',
      what: 'Panel fotovoltaico = captura luz del sol y la convierte en electricidad DC.',
      why: 'Energía gratis después de la inversión inicial. En Cuba con apagones, te da independencia real.',
      how: 'Se mide en W (potencia). Un panel de 100W da ~400Wh al día en Cuba (5h sol). Para cargar una batería de 1200Wh necesitas 1-2 días.',
      related: ['solar','mppt','bateria','inversor'],
    },
    'bateria': {
      term: 'Batería',
      what: 'Almacena energía para usar cuando no hay sol o hay apagón. Tipos: plomo-ácido (barata, poca vida), gel, litio (cara, larga vida).',
      why: 'Sin batería, el sistema solar solo funciona de día. La batería es el corazón del sistema de respaldo.',
      how: 'Capacidad en Ah (amperios-hora). 100Ah a 12V = 1200Wh = alimenta nevera 4-6 horas.',
      related: ['lifepo4','solar','inversor','mppt','ah','plomo acido'],
    },
    'ah': {
      term: 'Ah (amperios-hora)',
      what: 'Ah = unidad de capacidad de batería. Cuántos amperios puede entregar durante 1 hora.',
      why: 'Mayor Ah = más autonomía. 100Ah a 12V = 1200 Wh (vatios-hora). Una nevera consume ~150W, dura 8 horas con esa batería.',
      how: 'Para calcular autonomía: Wh = Ah × Voltios. Divide Wh entre consumo de tu equipo en W = horas de autonomía.',
      related: ['bateria','wh','voltios'],
    },
    'wh': {
      term: 'Wh (vatios-hora)',
      what: 'Wh = unidad real de energía almacenada. Wh = Ah × Voltios.',
      why: 'Es la medida que importa para calcular autonomía. Una batería de 100Ah a 12V = 1200Wh.',
      how: 'Divide Wh entre consumo del equipo en W = horas que dura. 1200Wh / 150W (nevera) = 8 horas.',
      related: ['ah','bateria','voltios'],
    },
    'voltios': {
      term: 'Voltaje (V)',
      what: 'Voltaje = "presión" eléctrica del sistema. Baterías típicas: 12V (pequeñas), 24V (medianas), 48V (grandes).',
      why: 'El inversor y la batería deben ser del mismo voltaje. 12V para sistemas pequeños, 48V para grandes (más eficiente).',
      how: 'Si tu batería es 12V, necesitas inversor 12V. Si es 24V, inversor 24V. Mezclar voltajes = equipo quemado.',
      related: ['bateria','inversor','ah'],
    },
    '1080p': {
      term: '1080p (Full HD)',
      what: 'Resolución de video 1920x1080. Suficiente para reconocer caras y matrículas a corta distancia.',
      why: 'Para seguridad del hogar, 1080p es el mínimo recomendado. 720p se ve borroso al hacer zoom.',
      how: 'A mayor resolución, más espacio de almacenamiento. Una cámara 1080p graba ~50 GB por día.',
      related: ['camara','hd','4k','vision nocturna'],
    },
    '4k': {
      term: '4K (Ultra HD)',
      what: 'Resolución 3840x2160, 4 veces más que 1080p. Nitidez máxima para hacer zoom sin perder detalle.',
      why: 'Para reconocer caras o matrículas a 10+ metros. Pero consume MUCHO almacenamiento.',
      how: 'Necesitas una tarjeta grande o disco. 4K graba ~200 GB por día por cámara.',
      related: ['1080p','camara'],
    },
    'vision nocturna': {
      term: 'Visión nocturna',
      what: 'Capacidad de la cámara de ver en la oscuridad. Dos tipos: infrarrojos (B&N) o luz blanca (color).',
      why: 'Sin visión nocturna, de noche no ves nada. Esencial para seguridad 24/7.',
      how: 'Los LEDs infrarrojos se encienden automáticamente cuando hay poca luz. La imagen sale en blanco y negro. Las de luz blanca dan color pero consumen más.',
      related: ['camara','infrarrojo','1080p','ptz'],
    },
    'ptz': {
      term: 'PTZ (Pan-Tilt-Zoom)',
      what: 'PTZ = cámara que se mueve: Pan (gira horizontal), Tilt (gira vertical), Zoom (acerca sin perder calidad).',
      why: 'Una cámara PTZ cubre lo que 3-4 cámaras fijas. Ideal para vigilar patios grandes o comercios.',
      how: 'La controlas desde el celular con la app. Algunas siguen movimiento automáticamente.',
      related: ['camara','1080p','vision nocturna'],
    },
    'e27': {
      term: 'Rosca E27',
      what: 'E27 = la rosca estándar de bombillo (27mm de diámetro). Se enrosca en cualquier lámpara de casa.',
      why: 'Las cámaras con rosca E27 se instalan en 1 segundo: las enroscas en el portalámpara y listo. No necesitas cableado.',
      how: 'Asegúrate de que el portalámpara tenga corriente 24/7 (no conectado a un breaker que apagues).',
      related: ['camara','wifi'],
    },
    'rfid': {
      term: 'RFID (radiofrecuencia)',
      what: 'RFID = abre cerraduras con tarjetas o llaveros de proximidad. Acercas la tarjeta y se desbloquea.',
      why: 'Más rápido que llave, no se pierde, puedes dar acceso temporal a alguien y revocarlo.',
      how: 'La cerradura incluye las tarjetas. Si pierdes una, la borras del sistema y esa tarjeta ya no abre.',
      related: ['biometrico','cerradura'],
    },
    'biometrico': {
      term: 'Biométrico (huella)',
      what: 'Sensor que lee tu huella dactilar para abrir cerradura. Sin llave, sin tarjeta, sin clave.',
      why: 'No se puede perder ni robar (como una llave). Cada persona tiene su huella registrada.',
      how: 'Registras las huellas de quienes pueden entrar. Hasta 100 huellas en modelos típicos.',
      related: ['rfid','cerradura'],
    },
    '4g': {
      term: '4G LTE',
      what: '4G = internet por red celular (el mismo del celular). Pones SIM y tienes internet.',
      why: 'Para zonas donde no llega fibra óptica ni ADSL. Un router 4G te da wifi en una finca, en el carro, o donde haya señal móvil.',
      how: 'Compras una SIM con plan de datos (LTE), la pones en el router y listo. Velocidad depende de la cobertura.',
      related: ['lte','wifi','router','sim'],
    },
    'lte': {
      term: 'LTE (Long Term Evolution)',
      what: 'LTE = el estándar de 4G. Velocidad real 10-50 Mbps (depende de cobertura).',
      why: 'Es el 4G real que tenemos en Cuba. Para uso doméstico en zona rural es ideal.',
      how: 'Siempre que veas "4G LTE" en un router, significa que soporta SIM de datos.',
      related: ['4g','sim','router'],
    },
    'switch': {
      term: 'Switch de red',
      what: 'Switch = repartidor de puertos LAN. Si tu router tiene 4 puertos y necesitas 8, le pones un switch.',
      why: 'Para conectar varios dispositivos por cable en una oficina o casa con muchos equipos.',
      how: 'Conectas un cable del router al switch, y del switch a cada dispositivo. No necesita configuración.',
      related: ['lan','gigabit','rj45'],
    },
    'cerradura': {
      term: 'Cerradura inteligente',
      what: 'Cerradura que se abre con huella, tarjeta RFID, código, app, o llave física. Olvídate de cargar llaves.',
      why: 'Comodidad + seguridad. Puedes dar accesos temporales (a un trabajador, a un familiar de visita).',
      how: 'Funciona con baterías (recargables o pilas) que duran meses. Instalación similar a una cerradura normal.',
      related: ['biometrico','rfid'],
    },
    'camara': {
      term: 'Cámara de seguridad',
      what: 'Cámara que graba y se ve desde el celular. Tipos: fija (mira un punto), PTZ (se mueve), domo, bala.',
      why: 'Para vigilar casa, negocio, vehículos. Disuasivo y evidencia si pasa algo.',
      how: 'Necesitas wifi (cámara wifi) o cableado (cámara con DVR). La app del fabricante te da notificación de movimiento.',
      related: ['1080p','vision nocturna','ptz','e27','poe'],
    },
    'alarma': {
      term: 'Sistema de alarma',
      what: 'Kit con sensores (movimiento, puerta, ventana) + sirena + panel central. Si algo se activa, suena.',
      why: 'Detecta intrusos y los espanta. Algunas llaman por teléfono o mandan alerta al celular.',
      how: 'Sensores inalámbricos (con pila) se instalan en puertas/ventanas. El panel se programa con código.',
      related: ['camara','cerradura','seguridad'],
    },
    'dvr': {
      term: 'DVR (grabador digital)',
      what: 'DVR = caja que graba las cámaras de seguridad. Se conecta a un disco duro y a las cámaras por cable.',
      why: 'Para grabar 24/7 sin depender de internet. Si cortan el wifi, las cámaras siguen grabando.',
      how: 'Conectas las cámaras (BNC o RJ45) + disco duro. Se mira desde el celular con la app del fabricante.',
      related: ['camara','1080p','cctv'],
    },
    'cctv': {
      term: 'CCTV (circuito cerrado de TV)',
      what: 'CCTV = sistema de cámaras de seguridad cerrado, no transmite a internet (solo a tu DVR).',
      why: 'Más privado: nadie puede ver tus cámaras desde afuera. Más estable: no depende del wifi.',
      how: 'Cámaras + DVR + monitor. Requiere cableado pero es muy confiable.',
      related: ['camara','dvr','1080p'],
    },
    'gpon': {
      term: 'GPON (fibra óptica)',
      what: 'GPON = tecnología de fibra óptica que usa ETECSA para internet de alta velocidad.',
      why: 'Si tienes GPON en tu casa, necesitas un router con puerto WAN Gigabit para aprovechar la velocidad.',
      how: 'El cable de fibra llega a una ONT (caja de ETECSA), de ahí sale un cable RJ45 al puerto WAN de tu router.',
      related: ['wan','gigabit','fibra','router'],
    },
    'fibra': {
      term: 'Fibra óptica',
      what: 'Cable de vidrio que transmite internet a velocidades enormes (hasta 1 Gbps simétrico).',
      why: 'Mucho más rápida y estable que el cobre. Es lo que usa ETECSA para internet moderno en Cuba.',
      how: 'Llega a una ONT en tu casa. De ahí conectas tu router por cable al puerto WAN.',
      related: ['gpon','wan','router'],
    },
    'wps': {
      term: 'WPS (botón de conexión rápida)',
      what: 'WPS = botón físico en el router. Lo presionas y conectas dispositivos al wifi sin escribir la clave.',
      why: 'Comodidad para conectar impresoras, repetidores, cámaras wifi sin teclear la contraseña.',
      how: 'Presionas WPS en el router + WPS en el dispositivo (o lo configuras en 2 minutos).',
      related: ['router','wifi','wpa'],
    },
    'wpa': {
      term: 'WPA3 (seguridad wifi)',
      what: 'WPA3 = el estándar más seguro de cifrado wifi. Reemplaza a WPA2.',
      why: 'WPA2 tiene vulnerabilidades conocidas. WPA3 te protege contra ataques de fuerza bruta.',
      how: 'Necesitas router y dispositivo compatible. Wi-Fi 6 ya lo exige por defecto.',
      related: ['wifi 6','wps','router'],
    },
    'qos': {
      term: 'QoS (Quality of Service)',
      what: 'QoS = prioriza tráfico importante. Por ejemplo, le da prioridad a tu llamada de WhatsApp sobre las descargas.',
      why: 'Si tienes internet limitado y varias personas usan la red, QoS asegura que lo crítico funcione.',
      how: 'Se configura en el router. Mikrotik y routers profesionales lo hacen muy bien.',
      related: ['router','gigabit'],
    },
    'vpn': {
      term: 'VPN (red privada virtual)',
      what: 'VPN = conecta dos redes por internet como si estuvieran en la misma casa. Cifra el tráfico.',
      why: 'Para conectar la casa de un familiar a la tuya (compartir internet) o para trabajar remoto seguro.',
      how: 'Mikrotik y routers profesionales lo soportan. Configuras los dos extremos.',
      related: ['router','qos'],
    },
    'kv': {
      term: 'kVa / kW (potencia)',
      what: 'kVa = potencia aparente. kW = potencia útil real. kW = kVa × factor de potencia (~0.8).',
      why: 'Los inversores se anuncian en kVa o W. Para comparar, multiplica kVa × 0.8 = kW reales.',
      how: 'Un inversor 3.6kVa = ~2.88 kW reales. Asegúrate de sumar los W de todos los equipos que vas a conectar.',
      related: ['inversor','w'],
    },
    'w': {
      term: 'Watt (W)',
      what: 'W = unidad de potencia. Cuánto consume un equipo eléctrico por segundo.',
      why: 'Para dimensionar sistema solar/inversor necesitas sumar los W de todos los equipos.',
      how: 'Nevera ~150W, TV LED ~80W, ventilador ~50W, bombilla LED ~10W. Suma y agrega 30% de margen.',
      related: ['kv','inversor','solar'],
    },
    'sim': {
      term: 'SIM card',
      what: 'SIM = tarjeta con chip que da acceso a la red celular. Se inserta en routers 4G y celulares.',
      why: 'Sin SIM no hay internet 4G. La SIM contiene tu número y plan de datos.',
      how: 'Comprar en ETECSA con plan de datos LTE. Tamaño estándar (mini/micro/nano) según el equipo.',
      related: ['4g','lte','router'],
    },
    'doble sim': {
      term: 'Doble SIM',
      what: 'Equipo que acepta 2 SIM cards. Para tener dos líneas (ej: datos + voz) o cambiar entre operadoras.',
      why: 'Si una operadora se cae, la otra sigue. Útil en Cuba donde la cobertura varía.',
      how: 'Configuras cuál SIM se usa para qué (datos por una, llamadas por otra).',
      related: ['sim','4g','lte'],
    },
    'nauta hogar': {
      term: 'Nauta Hogar (ETECSA)',
      what: 'Servicio de internet ADSL sobre línea telefónica que brinda ETECSA en Cuba. Requiere autenticación con usuario y contraseña.',
      why: 'Requiere un módem-router ADSL con puerto RJ11 (entrada telefónica). ETECSA provee estos equipos como el TP-Link TD-W8901N.',
      how: 'Si ya tienes el equipo de ETECSA, puedes conectar uno de nuestros routers a los puertos LAN del módem-router para ampliar tu red Wi-Fi.',
      related: ['rj11','router','repetidor','lan','adsl'],
    },
    'rj11': {
      term: 'Puerto RJ11 (ADSL / Línea Telefónica)',
      what: 'Conector pequeño usado para la línea telefónica o internet ADSL (Nauta Hogar). Es el puerto que ETECSA usa para dar el servicio inicial.',
      why: 'Los módem-routers ADSL lo tienen integrado. En TiendaMax no vendemos equipos con este puerto para la conexión principal.',
      how: 'Para mejorar tu internet, conectas uno de nuestros routers (que tienen puerto WAN RJ45) a los puertos LAN del módem-router que te dio ETECSA.',
      related: ['nauta hogar','rj45','lan','wan','adsl'],
    },
    'adsl': {
      term: 'ADSL (Línea Digital Asimétrica)',
      what: 'Tecnología que permite transmitir internet de alta velocidad sobre la línea telefónica tradicional.',
      why: 'Es la tecnología que usa ETECSA para Nauta Hogar. Requiere un módem-router con puerto RJ11.',
      how: 'ETECSA instala un módem-router ADSL en tu casa. Puedes ampliar la señal conectando routers adicionales a sus puertos LAN.',
      related: ['nauta hogar','rj11','modem-router'],
    },
    'repetidor': {
      term: 'Repetidor / Extensor Wi-Fi',
      what: 'Un dispositivo que capta la señal Wi-Fi de tu router principal y la vuelve a emitir para que llegue más lejos.',
      why: 'Ideal si el módem-router de ETECSA o tu router principal están en la sala y la señal no llega a los cuartos o al patio.',
      how: 'Lo enchufas a mitad de camino entre el router y la zona muerta. No necesita cables, solo configuración inalámbrica.',
      related: ['router','nauta hogar','wifi'],
    },
  };

  // Sinónimos → término clave
  const KNOWLEDGE_SYNONYMS = {
    'controlador de carga':'controlador de carga','controlador solar':'controlador de carga',
    'regulador de carga':'controlador de carga','regulador solar':'controlador de carga','controlador':'controlador de carga',
    'ups':'ups','respaldo ininterrumpido':'ups','no break':'ups','nobreak':'ups',
    // Sin "impermeable"/"resistente al agua": esas palabras están en la ficha
    // de una capa de moto y una tienda de campaña, y el filtro las listaba
    // como productos "que cumplen IP66". Aquí solo entran las siglas reales.
    'ip66':'ip66','ip67':'ip66','ip65':'ip66','ip68':'ip66','grado ip':'ip66',
    'puerto wan':'wan','puertos wan':'wan','port wan':'wan','router con wan':'wan',
    'puerto lan':'lan','puertos lan':'lan','port lan':'lan','ethernet':'lan','cable de red':'rj45',
    'wifi6':'wifi 6','wi-fi 6':'wifi 6','wifi 6':'wifi 6','ax1500':'wifi 6','ax3000':'wifi 6','ax1450':'wifi 6','ax1800':'wifi 6','802.11ax':'wifi 6',
    'wifi5':'wifi 5','wi-fi 5':'wifi 5','wifi 5':'wifi 5','wifi5 ':'wifi 5','ac1200':'ac1200','ac1750':'ac1200','ac1900':'ac1200','802.11ac':'wifi 5',
    'mumimo':'mu-mimo','mu-mimo':'mu-mimo','mu mimo':'mu-mimo',
    'beamforming':'beamforming','beam forming':'beamforming',
    'doble banda':'doble banda','dual band':'doble banda','dualband':'doble banda',
    '2.4':'2.4','2.4ghz':'2.4','2 4 ghz':'2.4',
    '5ghz':'5 ghz','5 ghz':'5 ghz','5g wifi':'5 ghz',
    'poe':'poE','power over ethernet':'poE',
    'rj45':'rj45','cable rj45':'rj45',
    'mppt':'mppt','maximum power point':'mppt',
    'pwm':'pwm',
    'lifepo4':'lifepo4','litio hierro':'lifepo4','litio fosfato':'lifepo4','bateria lifepo4':'lifepo4',
    'litio':'litio','bateria de litio':'litio','litio ion':'litio',
    'plomo acido':'plomo acido','plomo-acido':'plomo acido','plomo acida':'plomo acido',
    'gel':'gel','de gel':'gel','bateria de gel':'gel','agm':'gel','sellada':'gel','bateria sellada':'gel',
    'inversor':'inversor','inversora':'inversor','invertidor':'inversor',
    'ondas pura':'ondas pura','onda pura':'ondas pura','senoidal':'ondas pura','onda senoidal':'ondas pura','pure sine':'ondas pura',
    'onda modificada':'onda modificada','onda cuadrada':'onda modificada','modified sine':'onda modificada',
    'inversor hibrido':'inversor hibrido','hibrido':'inversor hibrido',
    'solar':'solar','energia solar':'solar','placa solar':'solar','panel solar':'panel solar',
    'bateria':'bateria','baterias':'bateria',
    'amperio hora':'ah','amperios hora':'ah','ampere hour':'ah',
    'wh':'wh','vatios hora':'wh','watt hora':'wh',
    'voltios':'voltios','voltaje':'voltios','12v':'voltios','24v':'voltios','48v':'voltios',
    '1080p':'1080p','full hd':'1080p','fhd':'1080p','1920x1080':'1080p',
    '4k':'4k','ultra hd':'4k','uhd':'4k','2160p':'4k',
    'vision nocturna':'vision nocturna','nocturna':'vision nocturna','ver de noche':'vision nocturna','infrarrojo':'vision nocturna','infrarrojos':'vision nocturna',
    'ptz':'ptz','pan tilt':'ptz','pan-tilt':'ptz',
    'e27':'e27','rosca e27':'e27','rosca de bombillo':'e27',
    'rfid':'rfid','tarjeta rfid':'rfid','llavero rfid':'rfid',
    'biometrico':'biometrico','biometrica':'biometrico','huella':'biometrico','lector de huella':'biometrico',
    '4g':'4g','4g lte':'4g','router 4g':'4g','sim':'4g','sim card':'4g','doble sim':'doble sim',
    'lte':'lte',
    'switch':'switch','switch de red':'switch','repartidor':'switch',
    'cerradura':'cerradura','cerradura inteligente':'cerradura','cerradura biometrica':'cerradura',
    'camara':'camara','camaras':'camara','camara de seguridad':'camara','videovigilancia':'camara','cctv':'cctv',
    'alarma':'alarma','sistema de alarma':'alarma','sensor de movimiento':'alarma',
    'dvr':'dvr','grabador digital':'dvr',
    'gpon':'gpon','fibra optica':'gpon','fibra':'fibra',
    'wps':'wps',
    'wpa':'wpa','wpa3':'wpa','wpa2':'wpa',
    'qos':'qos','quality of service':'qos',
    'vpn':'vpn','red privada':'vpn',
    'kva':'kv','kilovoltiamper':'kv','kw':'w','kilowatt':'w','watt':'w','vatios':'w',
    'nauta hogar':'nauta hogar','nautahogar':'nauta hogar','nauta':'nauta hogar','servicio nauta':'nauta hogar','internet de etecsa':'nauta hogar',
    'rj11':'rj11','puerto rj11':'rj11','conector telefonico':'rj11','linea telefonica':'rj11','entrada telefonia':'rj11',
    'adsl':'adsl','adsl2':'adsl','xdsl':'adsl',
    'repetidor':'repetidor','repetidor wifi':'repetidor','extensor wifi':'repetidor','amplificador wifi':'repetidor','amplificador de señal':'repetidor','wifi booster':'repetidor','range extender':'repetidor',
    'modem-router':'rj11','modem router':'rj11','modem de etecsa':'rj11','equipo de etecsa':'nauta hogar',
  };

  // ════════════════════════════════════════════════════════════
  //  SISTEMAS PRECONFIGURADOS (combos inteligentes)
  // ════════════════════════════════════════════════════════════
  // Cuando el usuario pide "arma un sistema X", sugerir todos los componentes
  const SISTEMAS = {
    'solar basico': {
      nombre: 'Sistema solar básico (luz + carga celular en apagón)',
      presupuesto: '$200-400 USD',
      componentes: [
        {rol: 'Panel solar', subcat: 'PANELES SOLARES', min: 1},
        {rol: 'Controlador MPPT', subcat: 'CONTROLADORES SOLARES', min: 1},
        {rol: 'Batería', subcat: 'BATERÍAS', min: 1},
        {rol: 'Inversor (onda pura si conectarás nevera)', subcat: 'INVERSORES', min: 1},
      ],
    },
    'solar mediano': {
      nombre: 'Sistema solar mediano (nevera + luces + ventilador en apagón)',
      presupuesto: '$500-1000 USD',
      componentes: [
        {rol: 'Panel solar (mínimo 200W total)', subcat: 'PANELES SOLARES', min: 2},
        {rol: 'Controlador MPPT', subcat: 'CONTROLADORES SOLARES', min: 1},
        {rol: 'Batería (mínimo 100Ah)', subcat: 'BATERÍAS', min: 1},
        {rol: 'Inversor onda pura (mínimo 1000W)', subcat: 'INVERSORES', min: 1},
      ],
    },
    'solar completo': {
      nombre: 'Sistema solar completo (casa completa, aire acondicionado incluido)',
      presupuesto: '$1500-3000 USD',
      componentes: [
        {rol: 'Paneles solares (mínimo 1000W total)', subcat: 'PANELES SOLARES', min: 4},
        {rol: 'Controlador MPPT (60A+)', subcat: 'CONTROLADORES SOLARES', min: 1},
        {rol: 'Banco de baterías (mínimo 200Ah a 48V)', subcat: 'BATERÍAS', min: 4},
        {rol: 'Inversor híbrido onda pura (mínimo 3kW)', subcat: 'INVERSORES', min: 1},
      ],
    },
    'seguridad casa': {
      nombre: 'Kit de seguridad para casa',
      presupuesto: '$80-300 USD',
      componentes: [
        {rol: 'Cámara(s) de seguridad', subcat: 'CÁMARAS', min: 2},
        {rol: 'Cerradura inteligente (opcional)', subcat: 'CERRADURAS', min: 1},
        {rol: 'Sistema de alarma (opcional)', subcat: 'ALARMAS', min: 1},
      ],
    },
    'internet finca': {
      nombre: 'Internet para finca o zona rural sin fibra',
      presupuesto: '$130-260 USD',
      componentes: [
        {rol: 'Router 4G LTE (con SIM)', subcat: 'ROUTERS', min: 1},
        {rol: 'Antena CPE exterior (opcional, para enlazar a otra casa)', subcat: 'ROUTERS', min: 0},
      ],
    },
    'internet casa': {
      nombre: 'Internet potente para casa con fibra',
      presupuesto: '$80-230 USD',
      componentes: [
        {rol: 'Router Gigabit (Wi-Fi 6 ideal)', subcat: 'ROUTERS', min: 1},
        {rol: 'Repetidor wifi (opcional, si la casa es grande)', subcat: 'ACCESORIOS', min: 0},
      ],
    },
  };

  // Accesorios sugeridos automáticamente cuando compras cierto producto
  const ACCESORIOS_AUTOMATICOS = {
    'PANELES SOLARES': [
      {que: 'Controlador MPPT', subcat: 'CONTROLADORES SOLARES', por: 'Sin esto el panel no carga batería'},
      {que: 'Batería', subcat: 'BATERÍAS', por: 'Para almacenar la energía del panel'},
      {que: 'Inversor', subcat: 'INVERSORES', por: 'Para usar la energía en electrodomésticos AC'},
    ],
    'INVERSORES': [
      {que: 'Batería', subcat: 'BATERÍAS', por: 'El inversor necesita batería para funcionar'},
    ],
    'CÁMARAS': [
      {que: 'Tarjeta microSD', subcat: 'ACCESORIOS', por: 'Para grabar localmente (algunas incluidas)'},
    ],
    'CERRADURAS': [
      {que: 'Pilas AA o batería recargable', subcat: null, por: 'Para alimentar la cerradura (suele usar 4-8 pilas)'},
    ],
  };

  // ════════════════════════════════════════════════════════════
  //  COMPATIBILIDAD INVERSOR ↔ ELECTRODOMÉSTICOS (potencia real)
  // ════════════════════════════════════════════════════════════
  const CONSUMO_EQUIPOS = {
    'bombilla led': {w: 10, pico: 10, categoria:'iluminación'},
    'foco led': {w: 15, pico: 15, categoria:'iluminación'},
    'bombilla incandescente': {w: 60, pico: 60, categoria:'iluminación'},
    'celular': {w: 15, pico: 15, categoria:'carga'},
    'laptop': {w: 65, pico: 65, categoria:'carga'},
    'pc': {w: 200, pico: 250, categoria:'cómputo'},
    'computadora': {w: 200, pico: 250, categoria:'cómputo'},
    'tv led': {w: 80, pico: 120, categoria:'entretenimiento'},
    'tv lcd': {w: 120, pico: 180, categoria:'entretenimiento'},
    'ventilador': {w: 50, pico: 80, categoria:'confort'},
    'abanico': {w: 50, pico: 80, categoria:'confort'},
    'nevera': {w: 150, pico: 600, categoria:'electrodoméstico', nota:'Pico de 600W al arrancar el compresor'},
    'refrigerador': {w: 150, pico: 600, categoria:'electrodoméstico', nota:'Pico de 600W al arrancar el compresor'},
    'congelador': {w: 200, pico: 800, categoria:'electrodoméstico'},
    'microondas': {w: 800, pico: 1000, categoria:'electrodoméstico'},
    'olla arrocera': {w: 400, pico: 500, categoria:'electrodoméstico'},
    'plancha': {w: 1000, pico: 1000, categoria:'electrodoméstico'},
    'lavadora': {w: 500, pico: 1500, categoria:'electrodoméstico', nota:'Pico de 1500W al arrancar motor'},
    'aire 12000': {w: 1000, pico: 2500, categoria:'climatización', nota:'12.000 BTU, pico 2500W al arrancar compresor'},
    'split 12000': {w: 1000, pico: 2500, categoria:'climatización'},
    'aire 18000': {w: 1500, pico: 3500, categoria:'climatización', nota:'18.000 BTU'},
    'bomba de agua': {w: 300, pico: 800, categoria:'plomería'},
  };

  // Tabla de inversores: qué soporta cada potencia
  const INVERSOR_POTENCIA = [
    {potencia_w: 500, kva: '0.6 kVa', soporta: ['2-3 bombillas LED', 'celular', 'laptop', 'ventilador'], no_soporta: ['nevera', 'aire', 'lavadora', 'microondas'], recomendado_para: 'Luz + carga + ventilador en apagón corto'},
    {potencia_w: 1000, kva: '1.2 kVa', soporta: ['Lo anterior + TV LED', 'PC básica'], no_soporta: ['nevera (pico 600W!)', 'aire', 'lavadora', 'microondas'], recomendado_para: 'Habitación con TV y luces'},
    {potencia_w: 1500, kva: '1.8 kVa', soporta: ['Lo anterior + nevera pequeña'], no_soporta: ['aire acondicionado', 'lavadora', 'microondas'], recomendado_para: 'Cocina básica + nevera + luces'},
    {potencia_w: 2000, kva: '2.4 kVa', soporta: ['Lo anterior + olla arrocera', 'bomba de agua'], no_soporta: ['aire acondicionado', 'lavadora', 'microondas'], recomendado_para: 'Casa pequeña sin aire'},
    {potencia_w: 3000, kva: '3.6 kVa', soporta: ['Lo anterior + lavadora', 'microondas corto'], no_soporta: ['aire 18000 BTU'], recomendado_para: 'Casa mediana con lavadora'},
    {potencia_w: 3600, kva: '4.3 kVa', soporta: ['Lo anterior + aire 12000 BTU'], no_soporta: ['aire 18000 BTU + nevera simultáneo'], recomendado_para: 'Casa con aire 12000 BTU'},
    {potencia_w: 5000, kva: '6.0 kVa', soporta: ['Casa completa + aire 12000 BTU + lavadora + nevera'], no_soporta: ['Aires múltiples de 18000+'], recomendado_para: 'Casa grande con todo'},
    {potencia_w: 8000, kva: '10 kVa', soporta: ['Casa completa con varios aires + cocina eléctrica'], no_soporta: ['Equipos industriales'], recomendado_para: 'Negocio o casa muy grande'},
  ];

  // ════════════════════════════════════════════════════════════
  //  ENVÍOS POR MUNICIPIO/PROVINCIA
  //  IMPORTANTE: La mensajería llega desde Pinar del Río hasta Matanzas.
  //  NO se publican precios de envío — se coordinan por WhatsApp.
  //  Para zonas fuera de este alcance, también coordinar por WhatsApp (envío por vía).
  // ════════════════════════════════════════════════════════════
  const ENVIOS_HABANA = [
    {municipio: 'Habana Vieja', nota: 'Zona céntrica, entrega rápida'},
    {municipio: 'Centro Habana', nota: 'Zona céntrica'},
    {municipio: 'Cerro', nota: ''},
    {municipio: '10 de Octubre', nota: ''},
    {municipio: 'La Lisa', nota: ''},
    {municipio: 'Marianao', nota: ''},
    {municipio: 'Playa', nota: 'Miramar, Vedado incluidos'},
    {municipio: 'Plaza de la Revolución', nota: 'Vedado, Nuevo Vedado'},
    {municipio: 'Regla', nota: 'Requiere cruce de bahía'},
    {municipio: 'Habana del Este', nota: 'Alamar, Guanabo'},
    {municipio: 'Cotorro', nota: 'Zona más alejada'},
    {municipio: 'Arroyo Naranjo', nota: ''},
    {municipio: 'San Miguel del Padrón', nota: ''},
    {municipio: 'Boyeros', nota: 'Aeropuerto, Santiago de las Vegas'},
  ];
  // Provincias CON cobertura de mensajería directa (Pinar del Río → Matanzas)
  const ENVIOS_PROVINCIAS = [
    {provincia: 'Pinar del Río', nota: 'Mensajería directa'},
    {provincia: 'Artemisa', nota: 'Mensajería directa'},
    {provincia: 'Mayabeque', nota: 'Mensajería directa'},
    {provincia: 'Matanzas', nota: 'Mensajería directa, incluye Varadero'},
  ];
  // Provincias SIN cobertura directa — coordinar por WhatsApp (envío por vía)
  const ENVIOS_VIA_WHATSAPP = [
    {provincia: 'Villa Clara', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Cienfuegos', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Sancti Spíritus', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Ciego de Ávila', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Camagüey', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Las Tunas', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Holguín', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Granma', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Santiago de Cuba', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Guantánamo', nota: 'Coordinar por WhatsApp — envío por vía'},
    {provincia: 'Isla de la Juventud', nota: 'Coordinar por WhatsApp — envío por vía'},
  ];

  // ════════════════════════════════════════════════════════════
  //  MÉTODOS DE PAGO DETALLADOS
  // ════════════════════════════════════════════════════════════
  /* La lista de métodos vive AQUÍ y en ningún otro sitio. R.pago la usa para
     armar su respuesta: si se escribe la lista a mano en el texto, el dato y
     el mensaje acaban diciendo cosas distintas y nadie se entera hasta que un
     cliente intenta pagar con algo que ya no se acepta. */
  const METODOS_PAGO = [
    {metodo: 'Efectivo USD', detalle: 'Billetes USD en efectivo al recibir. Preferible para montos altos.', disponible: true, comision: 0},
    {metodo: 'Efectivo MN', detalle: `Pesos cubanos (MN) al recibir, a la tasa del día (${TASA_MN} MN = 1 USD, margen ya incluido).`, disponible: true, comision: 0},
    {metodo: 'Efectivo mixto', detalle: 'Combinación USD + MN para completar el monto. El repartidor calcula al recibir.', disponible: true, comision: 0},
    {metodo: 'Zelle (familiares en USA)', detalle: 'Pago vía Zelle desde familiar en el extranjero. Coordinar con el equipo por WhatsApp.', disponible: true, comision: 0, nota: 'Solo para pedidos prepagados'},
    {metodo: 'EnZona / Transfermóvil', detalle: 'No se aceptan.', disponible: false, comision: 0},
    {metodo: 'Transferencia bancaria (BPA, BANMET, Bandec)', detalle: 'No se acepta.', disponible: false, comision: 0},
    {metodo: 'Crypto (USDT, BTC)', detalle: 'Pago en criptomonedas estables. Confirmar wallet y monto con anticipación.', disponible: false, comision: 0, nota: 'Próximamente disponible'},
  ];


  // ════════════════════════════════════════════════════════════
  //  ESTADO + MEMORIA DE CONTEXTO
  // ════════════════════════════════════════════════════════════
  let _panelOpen = false;
  let _messages = [];
  let _sending = false;
  let _lastProductsShown = [];
  let _lastCompare = [];
  // Memoria: producto mencionado en la última consulta, presupuesto del usuario, etc.
  let _context = {
    lastProduct: null,       // último producto del que habló
    lastIntent: null,
    lastCategory: null,
    categoriaPedida: null,   // la categoría que detectIntent acaba de reconocer
    presupuesto: null,       // si mencionó un presupuesto
    conversationStep: 0,
  };
  const SESSION_ID = 'tm-bot-' + (Date.now().toString(36) + Math.random().toString(36).slice(2,6));

  // ════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));

  function normalize(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  function cleanForMatch(s){
    let n = normalize(s).replace(/[^a-z0-9\s.]/g,' ').replace(/\s+/g,' ').trim();
    return n;
  }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function escapeAttr(s){
    return String(s||'').replace(/["'<>&]/g, c => ({'"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;','&':'&amp;'})[c]);
  }
  function fmtUSD(n){ return '$' + (Number(n)||0).toFixed(2); }
  function fmtMN(usd){
    // Sin tasa configurada devuelve vacío: mejor no decir nada que
    // anunciar "0 MN" y que parezca que el producto es gratis.
    if(!TASA_MN || TASA_MN <= 0) return '';
    return Math.round((Number(usd)||0) * TASA_MN).toLocaleString('es-ES') + ' MN';
  }
  function catIcon(cat){
    const c = CATEGORIAS.find(x => x.nombre === cat);
    return c ? c.icono : '📦';
  }
  function stockText(p){
    if(p.stock === 0) return '<em style="color:#ff8888">Agotado</em>';
    if(p.stock <= 3) return `<em style="color:#ffb347">Solo ${p.stock} u</em>`;
    return `<em>${p.stock} en stock</em>`;
  }
  // URL robusta: usa slug si existe, si no, usa ID
  function productUrl(p){
    // Las páginas estáticas se generan por ID (ver scripts/build_paginas*),
    // no por slug: p/producto-<id>.html. Con slug daban 404.
    if(!p) return SITE_URL;
    return SITE_URL + '/p/producto-' + p.id + '.html';
  }
  // Imagen con fallback multinivel (principal → thumb → placeholder local)
  function imageUrl(p){
    if(!p || !p.imagen) return null;
    // Si la imagen incluye tiendamax.org, también generar versión /imagenes/thumbs/
    let img = p.imagen;
    // Reemplazar /imagenes/ por /imagenes/thumbs/ si existe (miniaturas más ligeras)
    if(img.includes('/imagenes/') && !img.includes('/thumbs/')){
      const thumbUrl = img.replace('/imagenes/', '/imagenes/thumbs/');
      return { primary: img, thumb: thumbUrl, fallback: true };
    }
    return { primary: img, thumb: img, fallback: true };
  }
  const PLACEHOLDER_IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 44 44%22%3E%3Crect width=%2244%22 height=%2244%22 fill=%22%23252525%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 font-size=%2218%22%3E📦%3C/text%3E%3C/svg%3E';
  const PLACEHOLDER_IMG_SM = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 42 42%22%3E%3Crect width=%2242%22 height=%2242%22 fill=%22%23252525%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 font-size=%2216%22%3E📦%3C/text%3E%3C/svg%3E';

  // ════════════════════════════════════════════════════════════
  //  BÚSQUEDA DE PRODUCTOS
  // ════════════════════════════════════════════════════════════
  function scoreProduct(p, q){
    if(!q) return 0;
    const nombre = cleanForMatch(p.nombre);
    const desc = cleanForMatch(p.descripcion || '');
    const cat = cleanForMatch(p.categoria || '');
    const sub = cleanForMatch(p.subcategoria || '');
    const specs = cleanForMatch((p.specs||[]).join(' '));
    let score = 0;
    if(nombre === q) score += 100;
    const qWords = q.split(' ').filter(w => w.length > 1);
    const allInName = qWords.every(w => nombre.includes(w));
    if(allInName) score += 50;
    const someInName = qWords.filter(w => nombre.includes(w)).length;
    score += someInName * 12;
    if(specs.includes(q)) score += 25;
    const someInSpecs = qWords.filter(w => specs.includes(w)).length;
    score += someInSpecs * 6;
    if(sub.includes(q)) score += 20;
    const someInSub = qWords.filter(w => sub.includes(w)).length;
    score += someInSub * 5;
    if(desc.includes(q)) score += 10;
    const someInDesc = qWords.filter(w => desc.includes(w)).length;
    score += someInDesc * 3;
    if(cat.includes(q)) score += 8;
    return score;
  }

  function findProducts(query, n=4, opts={}){
    const { includeAgotados=false, filterFn=null, presupuesto=null } = opts;
    const q = cleanForMatch(query);
    if(!q || q.length < 2) return [];
    let list = PRODUCTOS
      .map(p => ({p, s: scoreProduct(p, q)}))
      .filter(x => x.s > 0);
    if(filterFn) list = list.filter(x => filterFn(x.p));
    if(!includeAgotados) list = list.filter(x => x.p.stock > 0);
    if(presupuesto) list = list.filter(x => x.p.precio <= presupuesto);
    return list
      .sort((a,b) => b.s - a.s)
      .slice(0, n)
      .map(x => x.p);
  }

  function findProduct(query, opts={}){
    const r = findProducts(query, 1, opts);
    return r.length ? r[0] : null;
  }

  function detectProductMentions(text){
    const t = cleanForMatch(text);
    if(!t) return [];
    // Palabras genéricas que NO deben contar como match distintivo
    // (son tan comunes que producen falsos positivos)
    const GENERICAS = new Set([
      'camara','camaras','wifi','inalambrico','inalambrica','inteligente','seguridad',
      'red','conexion','conectividad','alto','alta','bajo','baja','profesional',
      'doble','triple','simple','sencillo','kit','sistema','panel','display','pantalla',
      'control','remoto','digital','analogico','analogica','usb','tipo','modelo',
      'bateria','cargador','inversor','solar','router','switch','antena',
      'alarma','cerradura','exterior','interior','color','negro','blanco',
      'cable','cables','diseno','calidad','garantia','producto','nuevo','usado',
      'global','version','clasico','plus','max','mini','ultra','super',
    ]);
    const mentions = [];
    for(const p of PRODUCTOS){
      const nombre = cleanForMatch(p.nombre);
      if(!nombre) continue;
      if(nombre.length >= 5 && t.includes(nombre)){
        mentions.push({p, score: nombre.length, exactMatch:true});
        continue;
      }
      const palabras = nombre.split(' ').filter(w => w.length > 3);
      if(palabras.length >= 2){
        // Palabras distintivas: las que NO son genéricas
        const distintivas = palabras.filter(w => !GENERICAS.has(w));
        const foundDistintivas = distintivas.filter(w => t.includes(w)).length;
        const foundTotal = palabras.filter(w => t.includes(w)).length;
        // Detectar si hay al menos 1 palabra distintiva relevante Y 2+ palabras totales
        if(foundDistintivas >= 1 && foundTotal >= 2){
          mentions.push({p, score: foundDistintivas * 8 + foundTotal * 2, exactMatch:false});
        }
      }
    }
    const seen = new Set();
    return mentions
      .sort((a,b) => b.score - a.score)
      .filter(m => { if(seen.has(m.p.id)) return false; seen.add(m.p.id); return true; })
      .map(m => m.p);
  }

  // ════════════════════════════════════════════════════════════
  //  DETECCIÓN DE TÉRMINOS TÉCNICOS
  // ════════════════════════════════════════════════════════════
  function detectTechTerms(text){
    const t = ' ' + cleanForMatch(text) + ' ';
    const found = new Set();
    for(const [syn, key] of Object.entries(KNOWLEDGE_SYNONYMS)){
      const synClean = cleanForMatch(syn);
      if(t.includes(' ' + synClean + ' ') || t.includes(' ' + synClean) || t.includes(synClean + ' ')){
        found.add(key);
      }
    }
    return Array.from(found);
  }

  // Coincidencia por palabra completa, no por substring: con substring
  // la clave "ah" (amperios hora) matcheaba "ahora" y "trabaja", y el
  // bot recomendaba cualquier cosa como si tuviera esa característica.
  function _matchTermino(texto, patron){
    if(!texto || !patron) return false;
    const i = texto.indexOf(patron);
    if(i === -1) return false;
    const antes = i === 0 ? ' ' : texto[i-1];
    const desp = (i + patron.length >= texto.length) ? ' ' : texto[i + patron.length];
    return !/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(desp);
  }

  function findProductsByTechSpec(techKeys, n=4){
    const techStrings = techKeys.map(k => KNOWLEDGE[k]?.term?.toLowerCase() || k);
    const techClean = techKeys.map(k => cleanForMatch(KNOWLEDGE[k]?.term || k));
    const synClean = Object.entries(KNOWLEDGE_SYNONYMS)
      .filter(([_,k]) => techKeys.includes(k))
      .map(([syn]) => cleanForMatch(syn));
    // La clave suelta ('wan', 'mppt', 'gigabit') faltaba: solo se buscaba
    // el término largo ("puerto WAN"), y casi ninguna ficha lo escribe así.
    const keysClean = techKeys.map(k => cleanForMatch(k));
    const allPatterns = [...new Set([...techClean, ...synClean, ...keysClean,
      ...techStrings.map(s=>cleanForMatch(s))])].filter(s => s.length > 1);

    return PRODUCTOS
      .filter(p => p.stock > 0)
      .map(p => {
        const specs = cleanForMatch((p.specs||[]).join(' '));
        const nombre = cleanForMatch(p.nombre);
        const desc = cleanForMatch(p.descripcion || '');
        let score = 0;
        let specsMatches = 0, nameMatches = 0, descMatches = 0;
        for(const pat of allPatterns){
          if(_matchTermino(specs, pat)){ score += 3; specsMatches++; }
          else if(_matchTermino(nombre, pat)){ score += 2; nameMatches++; }
          else if(_matchTermino(desc, pat)){ score += 1; descMatches++; }
        }
        if(specsMatches > 0) score += 2;
        return {p, score, specsMatches, nameMatches, descMatches};
      })
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score || b.specsMatches - a.specsMatches || a.p.precio - b.p.precio)
      .slice(0, n)
      .map(x => x.p);
  }

  // ════════════════════════════════════════════════════════════
  //  COMPARACIÓN COHERENTE — por SUBCATEGORÍA (estricto)
  // ════════════════════════════════════════════════════════════
  // Compara si dos productos son comparables: deben ser del mismo tipo
  // (cargador vs cargador, router vs router, batería vs batería)
  function sonComparables(p1, p2){
    if(!p1 || !p2) return {ok:false, reason:'incompleto'};
    // Misma subcategoría → comparables ✅
    if(p1.subcategoria && p2.subcategoria && p1.subcategoria === p2.subcategoria){
      return {ok:true, reason:'misma_subcategoria', subcat:p1.subcategoria};
    }
    // Si ambos son routers aunque uno sea CPE → mismo tipo
    const sub1 = (p1.subcategoria||'').toUpperCase();
    const sub2 = (p2.subcategoria||'').toUpperCase();
    // Excepción: ROUTERS y ACCESORIOS en WIFI pueden no ser comparables
    if(p1.categoria === p2.categoria){
      // Misma categoría pero subcategorías diferentes: solo comparables
      // si las subcategorías están vacías o son equivalentes
      if(!p1.subcategoria && !p2.subcategoria) return {ok:true, reason:'misma_cat_sin_sub'};
      // Si son subcategorias distintas en misma categoría, NO comparables
      // (ej: batería vs inversor en ENERGIA, cargador vs batería en ENERGIA)
      return {ok:false, reason:'subcategoria_diferente', cat:p1.categoria, sub1, sub2};
    }
    // Categoría diferente → NO comparables
    return {ok:false, reason:'categoria_diferente', cat1:p1.categoria, cat2:p2.categoria, sub1, sub2};
  }

  // ════════════════════════════════════════════════════════════
  //  DETECCIÓN DE PRESUPUESTO
  // ════════════════════════════════════════════════════════════
  function detectPresupuesto(text){
    const m = text.toLowerCase();
    // Patrones: "tengo $100", "presupuesto de 80", "hasta 150 dólares", "barato menos de 50"
    const patterns = [
      /(?:tengo|presupuesto|gastar|gastarme|invertir|invertirle)\s+(?:de\s+)?(?:hasta\s+)?\$?\s*(\d{2,6})\s*(?:usd|d[oó]lares?|pesos?|mn)?/i,
      /(?:hasta|m[aá]ximo|menos de|no m[aá]s de)\s+\$?\s*(\d{2,6})\s*(?:usd|d[oó]lares?|pesos?|mn)?/i,
      /\$\s*(\d{2,6})\s*(?:usd|d[oó]lares?)/i,
      // "con 200 usd", "por 150 dólares": la forma más común de decirlo aquí,
      // y no la cogía ninguno de los patrones de arriba.
      /(?:con|por|para)\s+\$?\s*(\d{2,6})\s*(?:usd|d[oó]lares?|dolares)\b/i,
      /(?:barato|econ[oó]mico).{0,20}\$?\s*(\d{2,6})/i,
    ];
    for(const pat of patterns){
      const match = m.match(pat);
      if(match){
        const val = parseInt(match[1]);
        if(val >= 10 && val <= 10000) return val;
      }
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════
  //  DETECCIÓN DE INTENCIÓN
  // ════════════════════════════════════════════════════════════
  function detectIntent(text){
    let t = normalize(text).trim();
    let m = text.toLowerCase().trim();

    // Si la frase empieza con saludo + contenido, separar el saludo y procesar el contenido
    // Ej: "hola quiero comprar un router" → detectar como recomendacion (router)
    // Las formas de dos palabras van PRIMERO en la alternancia: la regex es
    // perezosa y con "buenas" delante partía "buenas tardes" en "buenas" +
    // "tardes", y el saludo entero se buscaba como producto (daba fallback).
    const saludoMatch = m.match(/^(hola max|buenos d[ií]as|buenas tardes|buenas noches|buen d[ií]a|que tal|hola|buenas|saludos|hey|holi)[,\s]+(.+)/i);
    // Y si lo que queda tras el saludo es otro trozo de saludo, no hay
    // contenido que procesar: sigue siendo un saludo a secas.
    const _restoSaludo = saludoMatch && /^(tardes|noches|d[ií]as|dia|max|tal|amigo|amiga|como estas|c[oó]mo est[aá]s|que tal)[\s!?.¿¡]*$/i.test(saludoMatch[2].trim());
    if(saludoMatch && !_restoSaludo && saludoMatch[2] && saludoMatch[2].trim().length > 5){
      m = saludoMatch[2].trim();
      t = normalize(m);
    }

    // "q tienen", "ke productos venden", "mandan pa oriente": así se escribe
    // por el móvil aquí, y sin normalizarlo caía todo en búsqueda o fallback.
    m = m.replace(/\bq\b/g, 'que').replace(/\bke\b/g, 'que')
         .replace(/\bpa\b/g, 'para').replace(/\bxq\b|\bpq\b/g, 'porque')
         .replace(/\btmb\b/g, 'tambien').replace(/\bkiero\b/g, 'quiero');
    t = normalize(m);

    // Actualizar contexto con presupuesto si lo menciona
    const presupuesto = detectPresupuesto(text);
    const _subAhora = _detectarSubcategoria(text);
    if(presupuesto){
        _context.presupuesto = presupuesto;
        _context.presupuestoTurno = _context.conversationStep;
        _context.presupuestoSub = _subAhora || null;
    } else if(_context.presupuesto && _subAhora && _context.presupuestoSub && _subAhora !== _context.presupuestoSub){
        // Cambió de tipo de producto: el presupuesto era para lo otro. Sin
        // esto, un "tengo $30" para una cámara seguía filtrando la pregunta
        // siguiente sobre inversores y no salía ni uno.
        _context.presupuesto = null;
        _context.presupuestoSub = null;
    } else if(_context.presupuesto && (_context.conversationStep - (_context.presupuestoTurno || 0)) > 3){
        // Se olvida solo. Antes, un "tengo $50" al principio dejaba escondido
        // medio catálogo durante toda la conversación y el cliente no tenía
        // forma de saber por qué no le salían cosas.
        _context.presupuesto = null;
    }

    // Comparación tecnológica (no de productos): "wifi 5 vs wifi 6", "wifi 5 o wifi 6"
    // Detecta: vs, versus, "o" entre dos términos, "mejor que", "diferencia entre", "qué es mejor"
    //          Y TAMBIÉN: "compara", "comparar", "compara X con Y", "contra", "cuál es mejor"
    //          + "compara los/carga X" (plural, pidiendo comparar varios del mismo tipo)
    const esComparacionPlural = /\b(compara|comparar|comparame|compare)\s+(los|las|el|la|estos|estas)?\s*/.test(m) || /\b(compara|compare)\s+\w+s\b/.test(m);
    const esComparativaExplicita = /\b(vs|versus|contra|mejor que|diferencia entre|qu[eé] es mejor|qu[eé] es peor|compara|comparar|comparame|compare|cu[aá]l es mejor|cu[aá]l me recomiendan entre)\b/i.test(m);
    // Detectar "X o Y" cuando ambos son términos técnicos
    const techTermsTemp = detectTechTerms(text);
    const mentionsTemp = detectProductMentions(text);
    const tieneParticulaO = /\s+o\s+/.test(m) && techTermsTemp.length >= 2;
    // Detectar "X con Y" o "X y Y" como comparación si hay 2+ productos mencionados
    const tieneConOY = /\s+(con|y)\s+/.test(m) && mentionsTemp.length >= 2;

    if(esComparativaExplicita || tieneParticulaO || (tieneConOY && /compara|comparar/i.test(m)) || esComparacionPlural){
      // IMPORTANTE: si hay 2+ productos mencionados, SIEMPRE es comparación de productos
      // (no comparación tecnológica). La comparación de productos valida coherencia por subcategoría.
      if(mentionsTemp.length >= 2){
        return 'comparacion';
      }
      // Si menciona 1 producto + 1 tecnología, o 1 producto solo: comparación de productos
      // (el bot pedirá el segundo producto o sugerirá alternativas)
      if(mentionsTemp.length === 1){
        return 'comparacion';
      }
      // Si solo menciona tecnologías PURAS (wifi 5, wifi 6, ondas pura, etc.) sin
      // categorías de producto, es comparación tecnológica.
      // Pero si hay categorías de producto (camara, batería, router, etc.) que son
      // también términos técnicos, NO es comparación tecnológica — es comparación de productos.
      const categoriasProducto = ['camara','bateria','cargador','inversor','router','switch','antena','alarma','cerradura','panel','controlador'];
      const techPuras = techTermsTemp.filter(k => !categoriasProducto.includes(k));
      if(techTermsTemp.length >= 2 && techPuras.length >= 2 && mentionsTemp.length === 0){
        return 'comparacionTecnologica';
      }
      // En cualquier otro caso (incluyendo 0 productos pero con categorías de producto
      // mencionadas), ir a comparacion para que el bot pida más info
      if(techTermsTemp.length >= 1){
        return 'comparacion';
      }
      // Caso: "compara los cargadores" / "compara las cámaras" (plural sin productos específicos)
      // El usuario quiere comparar varios del mismo tipo — ir a comparacion
      if(esComparacionPlural) return 'comparacion';
      if(techTermsTemp.length >= 2) return 'comparacionTecnologica';
    }

    // Saludo
    // ─── COMANDOS ESPECIALES (con /) ───
    // Los botones del panel llevan emoji delante ("🤖 /ayuda"), y el ancla ^\/
    // no casaba con eso: el comando se perdía y caía en 'recomendacion', así
    // que pedir ayuda devolvía una lista de productos. Se quita lo que haya
    // antes de la barra para probar los comandos.
    const mCmd = m.replace(/^[^\w\/]+/, '');
    if(/^\/(ayuda|help|comandos)/i.test(mCmd)) return 'ayuda';
    // "ayuda" a secas también es pedir ayuda. Dentro de una frase ("necesito
    // ayuda con un router") sigue siendo una recomendación, que es lo correcto.
    if(/^(ayuda|help|comandos|no s[eé] qu[eé] hacer)[\s!?.¿¡]*$/i.test(mCmd)) return 'ayuda';
    // La regla de arriba solo acepta la palabra sola, así que "¿me puedes
    // ayudar?" —la forma normal de pedirlo— caía en búsqueda de productos.
    if(/^(me (puedes|podr[ií]as) ayudar|puedes ayudarme|podr[ií]as ayudarme|me ayudas|ay[uú]dame|necesito ayuda)[\s!?.¿¡]*$/i.test(mCmd)) return 'ayuda';
    // Preguntar qué sabe hacer es pedir exactamente el menú de ayuda.
    if(/\b(qu[eé] (puedes|sabes) hacer|en qu[eé] (me )?puedes ayudar|para qu[eé] sirves|qu[eé] cosas puedes hacer)\b/i.test(m)) return 'ayuda';
    // Un "sí", "ok" o "dale" suelto no es una búsqueda: la palabra puntuaba
    // dentro de algún nombre de producto y Max devolvía resultados al azar.
    if(/^(s[ií]|no|ok|okay|oki|vale|dale|claro|listo|aj[aá]|perfecto|entiendo|entendido|bueno)[\s!?.¿¡]*$/i.test(mCmd)) return 'confirmacion';
    if(/^\/(limpiar|clear|reset)/i.test(mCmd)) return 'resetCmd';
    if(/^\/(envios|envíos|envio)/i.test(mCmd)) return 'envios';
    if(/^\/(pago|pagar)/i.test(mCmd)) return 'pago';
    if(/^\/(tasa|dolar)/i.test(mCmd)) return 'tasa';
    if(/^\/(categorias|cat)/i.test(mCmd)) return 'categorias';
    if(/^\/(ofertas)/i.test(mCmd)) return 'ofertas';
    if(/^\/(whatsapp|contacto)/i.test(mCmd)) return 'whatsapp';
    if(/^\/(deseos|favoritos|wishlist|lista)/i.test(mCmd)) return 'wishlist';

    // ─── CARRITO ───
    // Va antes que deseos porque "quiero pedir todo" es ambiguo y aquí el
    // cliente ya dijo la palabra carrito: eso desempata.
    if(/\bcarrito\b/i.test(m) || /^\/(carrito|cesta)/i.test(mCmd)) return 'carrito';

    // ─── LISTA DE DESEOS (intención natural) ───
    if(/\b(lista de deseos|mis favoritos|mi lista|ver mi lista|wishlist|deseos|favoritos|guardar en favoritos|añadir a favoritos|añadir a deseos|añade a mi lista|agrega a favoritos|quita de deseos|sacar de favoritos|vaciar lista|vaciar deseos)\b/i.test(m)) return 'wishlist';

    // ¿Está pidiendo una categoría concreta? Va antes que todo lo demás
    // porque "wifi" a secas también puntúa en cámaras y timbres wifi, y la
    // búsqueda difusa devolvía una mezcla sin sentido.
    const _catPedida = _detectarCategoriaPedida(m);
    if(_catPedida){ _context.categoriaPedida = _catPedida; return 'categoria'; }

    // Quién es Max. Va antes del saludo porque "¿tú quién eres?" no lleva
    // ninguna palabra de saludo y terminaba buscando productos.
    if(/\b(qui[eé]n eres|qui[eé]n sos|c[oó]mo te llamas|eres (un |una )?(bot|robot|humano|persona|ia|m[aá]quina)|eres real|hablo con (un |una )?(bot|persona|humano|robot))\b/i.test(m)) return 'quienEres';

    if(/\b(hola|buenas|saludos|hey|que bol[aá]|asere|compay|dime|buenos d[ií]as|buenas tardes|buenas noches|qu[eé] tal|que tal|buen d[ií]a|buen dia|hola max|holi)\b/i.test(m)) return 'saludo';
    if(/\b(chao|adios|nos vemos|hasta luego|bye|hasta ma[ñn]ana|cu[ií]date)\b/.test(m)) return 'despedida';
    if(/\b(gracias|thx|mil gracias|muchas gracias|te agradezco)\b/.test(m)) return 'gracias';

    if(/\b(c[oó]mo compro|c[oó]mo pedir|c[oó]mo hago.*pedido|c[oó]mo comprar|quiero comprar|quiero pedir|hacer.*pedido|proceso.*compra)\b/.test(m)) return 'comprar';
    if(/\b(env[ií]o|env[ií]an|entrega|domicilio|delivery|llevan.*casa|a domicilio|cobertura|a d[oó]nde llevan|donde llevan|a d[oó]nde hacen|hacen env[ií]os|env[ií]an a|llegan (hasta|a)|llega (hasta|a)|reparten|mensajer[ií]a|mandan|manda)\b/.test(m)
       || /\b(oriente|occidente|centro del pa[ií]s|toda la isla|todo el pa[ií]s)\b/.test(m)
       || /\b(recoger\w*|recojo|lo busco yo|pasar a buscar|buscarlo yo|recogida)\b/.test(m)) return 'envios';
    if(/\b(acepta[ns]?|admite[ns]?|reciben|recibe)\b[^.?]{0,20}\b(cup|mn|usd|d[oó]lar|peso|efectivo|tarjeta|transferencia|zelle|enzona|moneda)\b/.test(m)) return 'pago';
    if(/\b(pago|pagar|pago|tarjeta|transferencia|efectivo|contrareembolso|contra entrega|al recibir|zelle|enzona|en c[úu]anto.*pago)\b/.test(m)
       || /se paga\b|c[oó]mo se paga/.test(m)) return 'pago';
    if(/\b(garant[ií]a|warranty|garant)\b/.test(m)) return 'garantia';
    // Preguntar QUÉ ES algo va al glosario, aunque la palabra sea de esta
    // familia: "¿qué es RJ11?" tiene su entrada y quedaba inalcanzable detrás
    // de la charla de Nauta Hogar. Es el mismo fallo que ya se arregló con
    // "¿qué es un inversor?", y vuelve solo en cuanto se añade una intención
    // nueva por palabra clave.
    const _pideDefinicion = /\b(qu[eé] es|qu[eé] son|qu[eé] significa|qu[eé] quiere decir|para qu[eé] sirve|expl[ií]ca(me)?|def[ií]ne(me)?|en qu[eé] consiste)\b/.test(m);
    // Nauta Hogar / ETECSA va antes que envíos y pago: "¿venden módems para
    // Nauta Hogar?" lleva palabras que se llevaban esas otras intenciones.
    if(!_pideDefinicion && /nauta hogar|nautahogar|adsl|rj11|etecsa|m[oó]dem.de.etecsa|m[oó]dem.router|m[oó]dem.para.nauta|ampliar.se[ñn]al.nauta|mejorar.se[ñn]al.nauta/i.test(m)) return 'nautaHogar';
    // Con \b al final, "devolverlo" y "me lo cambian" —como se pregunta de
    // verdad— no casaban y se iban a búsqueda de productos.
    if(/\b(devoluci[oó]n\w*|devolv\w*|devuelv\w*|cambiar|cambian|cambio|return|reembols\w*)\b/.test(m)
       || /llega (roto|mal|da[ñn]ado|defectuoso)|viene (roto|mal|da[ñn]ado)|sale malo|no sirve al llegar|se rompe/.test(m)) return 'devolucion';
    // "con 200 usd, ¿qué me llevo?" no pregunta la tasa: trae presupuesto y una
    // petición. La palabra "usd" se lo llevaba a la conversión del día.
    if(detectPresupuesto(text) !== null
       && /\b(qu[eé] me (llevo|recomiendas|aconsejas|compro|sugieres)|qu[eé] (puedo|podr[ií]a) comprar|alcanza para|me alcanza|qu[eé] me alcanza)\b/.test(m)) return 'recomendacion';
    if(/\b(tasa|d[oó]lar|usd|mn|cup|peso|cambio|conversi[oó]n|cu[aá]nto.*cuesta.*peso)\b/.test(m)
       || /moneda nacional|en pesos\b/.test(m)) return 'tasa';
    // (el bloque de pago de arriba ya se quedó con "aceptan cup", que es otra
    //  pregunta: si aceptan esa moneda, no a cuánto está)
    if(/\b(whatsapp|tel[eé]fono|contacto|n[uú]mero|llamar|les escribo)\b/.test(m)) return 'whatsapp';
    if(/\b(donde est[aá]n|ubicaci[oó]n|direcci[oó]n|donde quedan|local|tienda f[ií]sica|est[aá]n en)\b/.test(m)) return 'ubicacion';
    if(/\b(horario|hora.*atienden|qu[eé] hora|abren|abierto|cuando atienden)\b/.test(m)) return 'horario';
    if(/\b(m[aá]s vendido|mas vendido|top ventas|m[aá]s popular|bestseller|lo que m[aá]s sale)\b/.test(m)) return 'masVendidos';
    if(/\b(seguimiento|seguir.*pedido|estado.*pedido|mi pedido|rastrear|d[oó]nde est[aá] mi pedido)\b/.test(m)) return 'seguimiento';

    // SISTEMA COMPLETO: "arma un sistema solar", "kit de seguridad", "internet para la finca"
    if(/\b(arma|armar|quiero armar|necesito armar|kit|sistema completo|sistema solar|sistema de seguridad|sistema de c[aá]maras|sistema de internet|kit de seguridad|todo lo que necesito para|todo para)\b/.test(m)
       || /\b(internet|wifi|se[ñn]al|c[aá]maras?) en toda la casa\b/.test(m)
       || /cubrir toda la (casa|finca|nave)/.test(m)){
      if(/\bseguridad|camaras?|vigilar|casa segura|negocio seguro\b/.test(m)) return 'sistemaSeguridad';
      if(/\bsolar|energia|apag[oó]n|planta|panel\b/.test(m)) return 'sistemaSolar';
      if(/\binternet|wifi|finca|casa de campo|zona rural|sin fibra|señal celular\b/.test(m)) return 'sistemaInternet';
    }

    // AUTONOMÍA: "cuánto dura esta batería con mi nevera"
    if(/\b(cu[aá]nto dura|cu[aá]ntas horas|autonom[ií]a|duraci[oó]n|cu[aá]nto tiempo aguanta)\b/.test(m) && /\b(bater[ií]a|inversor|sistema|nevera|aire|ventilador)\b/.test(m)) return 'autonomia';

    // COMPATIBILIDAD: "este router funciona con mi equipo X"
    if(/\b(funciona con|compatible con|sirve para|lo puedo conectar a|lo puedo usar con|trabaja con|soporta)\b/.test(m)
       || /\bme sirve\b|\bsirve\b[^.?]{0,40}\bpara\b|\balcanza para\b|\baguanta\b[^.?]{0,30}\b(nevera|aire|bomba|tv|refrigerador)\b/.test(m)) return 'compatibilidad';

    // DEFINICIÓN: "¿qué es MPPT?", "¿para qué sirve un controlador?".
    // Lo primero que Max anuncia en su saludo es que explica términos técnicos,
    // y NINGUNA forma de preguntarlo llegaba aquí: "qué es un inversor" daba la
    // lista de inversores, "qué es MPPT" una búsqueda vacía y "qué es onda
    // pura" la ficha de un producto. El único camino que funcionaba era
    // "qué router tiene puerto WAN", que no es una definición sino un filtro.
    if(/\b(qu[eé] es|qu[eé] son|qu[eé] significa|qu[eé] quiere decir|para qu[eé] sirve|expl[ií]ca(me)?|def[ií]ne(me)?|en qu[eé] consiste)\b/.test(m)
       && detectTechTerms(text).length > 0) return 'tecnico';

    // "¿cuál es el mejor router?" pide una recomendación, no la definición de
    // lo que es un router — que es lo que contestaba al caer en 'tecnico'.
    if(/\b(el|la|los|las) mejor(es)?\b/.test(m) && !/\bvs\b|versus|diferencia/.test(m)){
      const _cats = ['camara','camaras','bateria','baterias','cargador','inversor','inversores','router','routers',
                     'switch','antena','alarma','cerradura','panel','paneles','controlador','controladores'];
      if(_cats.some(c => new RegExp('\\b' + c + '\\b').test(normalize(m)))) return 'recomendacion';
    }

    // AVERÍA: "mi inversor pita", "el router se cae", "error 04".
    // Va después de compatibilidad para no robarle "¿no funciona con...?",
    // y antes de la pregunta técnica: quien tiene el aparato echando humo no
    // está preguntando qué significa una sigla.
    if(esAveria(text)) return 'diagnostico';

    // PREGUNTA TÉCNICA: "qué router tiene X"
    const patronTecnico = /\b(qué|que|cu[aá]les|cuales|quienes|quien).*(tienen|tiene|con|con puerto|con luz|con wifi|con camara|con bateria|con panel|con sensor).+|(router|c[aá]mara|camaras|bater[ií]a|baterias|inversor|inversores|cerradura|alarma|antena|router|switch|panel).+(con|que tenga|que tengan|con puerto).+/i;
    if(patronTecnico.test(m)){
      const techTerms = detectTechTerms(text);
      if(techTerms.length > 0) return 'tecnico';
    }

    // Recomendación por necesidad o muestra de categoría — TIENE PRIORIDAD sobre ofertas
    // Verbos de petición explícita: necesito, busco, quiero, muéstrame, ver, dame, etc.
    const verbosNecesidad = /\b(necesito|busco|quiero|me urge|tengo.*problema|recomi[eé]ndame|sugi[ée]reme|qu[eé] me recomiendan|qu[eé] me aconsejan|para vigilar|para tener|para cargar|para escuchar|para ver|para jugar|para cocinar|para navegar|para conectar|mu[eé]strame|muestrame|muestra|ver|dame|dame.*productos|ens[eé]ñame|ensename|ver lista|quiero ver|buscar|no s[eé] qu[eé]|no se que|qu[eé] me recomiendas|ayuda)\b/;
    // Detectar si menciona una categoría por nombre
    const mencionaCategoria = /\b(ropa|wifi|energ[ií]a|seguridad|carros|motos|hogar|celulares|audio|juegos|gym|u[ú]tiles|computadora|laptop|gaming)\b/i.test(m);
    // Detectar si menciona presupuesto ("tengo $X", "presupuesto de X")
    const mencionaPresupuesto = detectPresupuesto(text) !== null;

    // ─── DETALLE: si el usuario menciona un producto específico por nombre,
    //priorizar DETALLE sobre recomendación (ej: "quiero el router Tenda", "dame el cargador Ntrc")
    const mentionsDetalle = detectProductMentions(text);
    if(mentionsDetalle.length >= 1){
      // Si hay un verbo de petición Y un producto específico detectado, ir a detalle
      if(verbosNecesidad.test(m) || /\b(quiero (el|la|los|las|un|una)|dame (el|la|los|las|un|una)|ver (el|la|los|las|un|una)|deseo (el|la|los|las|un|una)|necesito (el|la|los|las|un|una))\b/.test(m)){
        return 'detalle';
      }
      // Preguntar el precio de un producto concreto es pedir su ficha: ahí
      // está el precio, el stock y el botón de pedir. Devolvía una búsqueda.
      if(/\bcu[aá]nto (vale|cuesta|sale|es|est[aá])\b|\bqu[eé] precio\b|\bprecio de\b/.test(m)) return 'detalle';
    }

    // "muéstrame el catálogo" / "qué productos tienen" es pedir el índice
    // entero, no una recomendación. Va ANTES porque "muéstrame" y "qué...tienen"
    // son verbos de necesidad y se lo llevaban a una lista arbitraria.
    if(/\b(cat[aá]logo|catalogo)\b/.test(m) || /qu[eé] (productos|cosas|art[ií]culos)\s+(tienen|venden|hay)/.test(m)) return 'categorias';

    if(verbosNecesidad.test(m) || mencionaPresupuesto || (mencionaCategoria && /\b(mu[eé]strame|muestrame|muestra|ver|dame|buscar|quiero|tienes|hay)\b/i.test(m))) return 'recomendacion';

    // Ofertas (solo si NO hay verbo de necesidad)
    // Con \b al final, "descuentos" y "rebajas" en plural no casaban.
    if(/\b(oferta|ofertas|descuento|rebaja|promoci[oó]n|rebajad)\w*/.test(m)) return 'ofertas';
    if(/\bbarato\b/.test(m) && !verbosNecesidad.test(m)) return 'ofertas';

    // Stock — pero "¿está agotado el inversor Must?" pregunta por UN producto,
    // no por el inventario entero: la ficha ya dice si queda o no. Contestaba
    // con el conteo global del catálogo, que no responde nada.
    if(/\b(stock|disponible|disponibilidad|agotad\w*|queda[n]?)\b/.test(m)
       && detectProductMentions(text).length === 1) return 'detalle';
    // Va ANTES de categorías: "qué hay disponible" contiene "qué hay" y se lo
    // llevaba el índice de categorías, que no dice cuántos quedan.
    if(/\b(stock|disponibilidad|agotad\w*|existencias?)\b/.test(m)
       || /qu[eé] (hay|tienen|queda) disponible/.test(m)) return 'stock';

    // Categorías
    if(/\b(categor[ií]a|categor[ií]as|secci[oó]n|secciones|qu[eé] tienen|qu[eé] venden|qu[eé] hay|cat[aá]logo)\b/.test(m)) return 'categorias';

    if(/\b(stock|disponible|disponibilidad|tienen.*existencia|hay.*stock|agotado|cu[aá]les hay|que hay disponible|que tienen disponible)\b/.test(m)) return 'stock';
    if(/\b(usado|usados|segunda mano|reacondicionado)\b/.test(m)) return 'usados';

    // Patrones de petición de DETALLE explícito
    const patronDetalle = /\b(h[aá]blame (de|del|de la|de los|de las)|dime (de|del|de la|de los|de las)|inf[oó]rmate (de|del|de la)|inf[oó]rmame (de|del|de la)|informaci[oó]n (de|del|de la)|info (de|del|de la)|ficha (de|del|de la)|ficha t[eé]cnica (de|del|de la)|quiero saber (de|del|de la|sobre)|mu[eé]strame|mu[eé]stra|qu[eé] tal (el|la|los|las)|me dices (del|de la|de los|de las|de)|detalles (de|del|de la|de los|de las)|sobre (el|la|los|las)|cu[eé]ntame (de|del|de la|sobre)|quiero (el|la|los|las|un|una)|dame (el|la|los|las|un|una)|ver (el|la|los|las|un|una)|deseo (el|la|los|las|un|una)|necesito (el|la|los|las|un|una))\b/;
    const pideDetalle = patronDetalle.test(m);
    const mentions = detectProductMentions(text);
    if(pideDetalle && mentions.length === 1) return 'detalle';
    if(pideDetalle){
      const q1 = cleanForMatch(text);
      const arr = PRODUCTOS.map(p => ({p, s: scoreProduct(p, q1)})).sort((a,b)=>b.s-a.s);
      if(arr[0] && arr[0].s >= 25 && (!arr[1] || arr[0].s >= arr[1].s * 1.15)) return 'detalle';
    }
    if(mentions.length === 1) return 'detalle';
    // Si hay múltiples menciones y el usuario pide detalle explícito, ir a detalle
    // (R.detalle listará las opciones y preguntará cuál)
    if(mentions.length >= 2 && pideDetalle) return 'detalle';
    if(mentions.length >= 2) return 'busqueda';

    // Va ANTES del scoring difuso: "módem de etecsa" o "señal de nauta" son
    // preguntas muy concretas que la búsqueda por parecido contestaba con
    // cualquier producto que compartiera una palabra.
    if(!_pideDefinicion && /nauta hogar|nautahogar|adsl|rj11|etecsa|m[oó]dem.de.etecsa|m[oó]dem.router|l[ií]nea.telef[oó]nica|m[oó]dem.para.nauta|ampliar.se[ñn]al|mejorar.se[ñn]al|se[ñn]al.de.nauta|router.para.nauta|repetidor.para.nauta|equipo.de.etecsa|instalaci[oó]n.de.nauta/i.test(text)) {
      return 'nautaHogar';
    }

    const q = cleanForMatch(text);
    const scored = PRODUCTOS
      .map(p => ({p, s: scoreProduct(p, q)}))
      .filter(x => x.s > 0)
      .sort((a,b) => b.s - a.s);
    if(scored.length === 0) return 'fallback';
    const top = scored[0];
    const second = scored[1];
    if(top.s >= 50 && (!second || top.s >= second.s * 1.5)) return 'detalle';
    return 'busqueda';
  }

  // ════════════════════════════════════════════════════════════
  //  GENERADORES DE RESPUESTA
  // ════════════════════════════════════════════════════════════
  const R = {};

  R.saludo = (text) => ({
    response: `¡Hola! 🤖 Soy <strong>Max</strong>, tu asesor en TiendaMax. Te atiendo como si fuera mi propia tienda.\n\nTengo acceso al catálogo completo (<em>${PRODUCTOS.filter(p=>p.stock>0).length} productos disponibles</em>) y puedo hacer mucho más que buscar productos:\n\n• <em>Explicarte términos técnicos</em> (WAN, MPPT, PoE, LiFePO4, RJ11, ADSL...) y decirte qué productos los cumplen\n• <em>Comparar dos productos del mismo tipo</em> lado a lado con veredicto\n• <em>Armar un sistema completo</em> (solar, seguridad, internet para la finca) con todos los componentes\n• <em>Calcular autonomía</em>: "¿cuánto dura esta batería con mi nevera?"\n• <em>Diagnosticar una avería</em>: "mi inversor pita y tiene la luz roja"\n• <em>Filtrar por presupuesto</em>: "tengo $100, ¿qué cámara me recomiendas?"\n• <em>Nauta Hogar / ETECSA</em>: "¿venden módems para Nauta Hogar?"\n• <em>Lista de deseos</em>: guarda productos y pide todos por WhatsApp\n• <em>Comandos rápidos</em>: escribe <code>/ayuda</code> para ver todos\n\n¿Qué necesitas hoy? Pregúntame lo que sea.`,
    quickReplies: ['🔥 Ver ofertas','📦 Categorías','💝 Ver mi lista','📶 Nauta Hogar','🤖 /ayuda']
  });

  R.despedida = () => ({
    response: '¡Chao! 🙌 Vuelve cuando quieras. Si necesitas ayuda con un pedido, escríbenos por WhatsApp. Dale, que estés bien. 👋',
    quickReplies: ['💬 WhatsApp']
  });

  R.gracias = () => ({
    response: '¡De nada! 🙌 Para eso estoy. Si necesitas algo más, aquí sigo. ¿Quieres que te muestre algo más del catálogo?',
    quickReplies: ['🔥 Ofertas','📦 Categorías','💬 WhatsApp']
  });

  R.comprar = () => ({
    response: `🛒 <strong>Cómo comprar en TiendaMax</strong>\n\n<strong>Paso 1 — Elige tu producto</strong>\nNavega el catálogo o pídeme que te busque algo. También puedes añadir productos a tu lista de deseos escribiendo "añade [producto] a mi lista".\n\n<strong>Paso 2 — Haz tu pedido</strong>\nToca el botón <code>Pedir</code> en cualquier producto. Se abre WhatsApp con tu pedido ya armado. O escribe "pedir todo mi carrito" para enviar todo de una vez.\n\n<strong>Paso 3 — Coordina el pago</strong>\nPagas <strong>contra entrega</strong> cuando recibes el producto. Aceptamos:\n• Efectivo USD (dólares)\n• Efectivo MN (pesos cubanos a la tasa del día)\n• Zelle (si un familiar paga desde USA)\n\n<strong>Paso 4 — Recibe tu pedido</strong>\nNuestro mensajero lleva el producto a tu puerta. Pagas al recibir y revisas que todo esté bien.\n\nSin riesgos. Pagas solo cuando lo tienes en la mano. ¿Quieres que te muestre productos para empezar?`,
    quickReplies: ['🔥 Ver ofertas','📦 Categorías','💳 Métodos de pago','🚚 Envíos','💬 WhatsApp']
  });

  R.envios = (text) => {
    const m = text.toLowerCase();
    const t = cleanForMatch(text);

    // Detectar municipio de La Habana específico
    let municipioEncontrado = null;
    for(const mun of ENVIOS_HABANA){
      const munClean = cleanForMatch(mun.municipio);
      if(t.includes(munClean) || t.includes(munClean.replace(/\s+/g,''))){
        municipioEncontrado = mun;
        break;
      }
    }

    // Detectar provincia CON cobertura (Pinar del Río → Matanzas)
    let provinciaEncontrada = null;
    for(const prov of ENVIOS_PROVINCIAS){
      const provClean = cleanForMatch(prov.provincia);
      if(t.includes(provClean)){
        provinciaEncontrada = prov;
        break;
      }
    }

    // Detectar provincia SIN cobertura directa (centro-oriente)
    let provinciaSinCobertura = null;
    for(const prov of ENVIOS_VIA_WHATSAPP){
      const provClean = cleanForMatch(prov.provincia);
      if(t.includes(provClean)){
        provinciaSinCobertura = prov;
        break;
      }
    }

    // Detectar "habana" genérico
    const esHabana = /\b(habana|havana|la habana)\b/.test(m);

    if(municipioEncontrado){
      return {
        response: `🚚 <strong>Envío a ${municipioEncontrado.municipio} (La Habana)</strong>\n\n✅ <strong>Zona con cobertura de mensajería directa</strong> (Pinar del Río → Matanzas).\n${municipioEncontrado.nota ? `• <em>Nota:</em> ${municipioEncontrado.nota}\n` : ''}\n⚠️ <em>Debes escribirnos por WhatsApp para coordinar la dirección exacta, horario de entrega y confirmar.</em>\n\nEl pago es <strong>contra entrega</strong>: pagas cuando recibes el producto.`,
        quickReplies: ['💬 Coordinar por WhatsApp','📦 Ver productos','🚚 Ver otra zona']
      };
    }

    if(provinciaEncontrada){
      return {
        response: `🚚 <strong>Envío a ${provinciaEncontrada.provincia}</strong>\n\n✅ <strong>Zona con cobertura de mensajería directa</strong> (Pinar del Río → Matanzas).\n• <em>Cobertura:</em> ${provinciaEncontrada.nota}\n\n⚠️ <em>Debes escribirnos por WhatsApp para coordinar la dirección exacta, horario y detalles de la entrega.</em>\n\nEl pago es <strong>contra entrega</strong>.`,
        quickReplies: ['💬 Coordinar por WhatsApp','📦 Ver productos','🚚 Ver otra zona']
      };
    }

    if(provinciaSinCobertura){
      return {
        response: `🚚 <strong>Envío a ${provinciaSinCobertura.provincia}</strong>\n\n⚠️ <strong>Nuestra mensajería directa llega desde Pinar del Río hasta Matanzas.</strong> Tu provincia está fuera de esa zona.\n\nPero tranquilo, podemos coordinar el envío por vía alterna:\n• Encomienda por ómnibus nacional (desde La Habana)\n• Transporte privado contratado por ti\n• Acuerdo especial con mensajería de la zona\n\nPara eso necesitamos que escribas por WhatsApp y armamos la logística según tu caso.`,
        quickReplies: ['💬 Coordinar por WhatsApp','📦 Ver productos','🚚 Ver zonas con cobertura']
      };
    }

    if(esHabana && !municipioEncontrado){
      let body = `🚚 <strong>Envíos en La Habana</strong>\n\n✅ Cobertura de mensajería directa en todos los municipios:\n\n`;
      ENVIOS_HABANA.slice(0,7).forEach(mun => {
        body += `• <strong>${mun.municipio}</strong>${mun.nota ? ` — ${mun.nota}` : ''}\n`;
      });
      body += `\n…y los demás municipios similares. Dime tu municipio específico y te confirmo.\n\n⚠️ <em>Para cualquier municipio debes escribirnos por WhatsApp y coordinar la entrega.</em>\n\nEl pago es <strong>contra entrega</strong>.`;
      return {
        response: body,
        quickReplies: ['💬 Coordinar por WhatsApp','🚚 Ver provincias','📦 Ver productos']
      };
    }

    if(/\b(cu[aá]nto|tarda|demora|tiempo|cuando|llega|provincias|todas las provincias|cobertura|donde llevan|a donde llegan|a d[oó]nde hacen|hacen env[ií]os|env[ií]an a)\b/.test(m)){
      let body = `🚚 <strong>Cobertura de envíos TiendaMax</strong>\n\n`;
      body += `📍 <strong>Zona con mensajería directa</strong> (pago contra entrega):\n`;
      body += `• <strong>La Habana</strong> — todos los municipios\n`;
      ENVIOS_PROVINCIAS.forEach(p => {
        body += `• <strong>${p.provincia}</strong> — ${p.nota}\n`;
      });
      body += `\n📍 <strong>Zona sin mensajería directa</strong> (coordinar por WhatsApp — envío por vía):\n`;
      body += `• Villa Clara, Cienfuegos, Sancti Spíritus, Ciego de Ávila, Camagüey\n`;
      body += `• Las Tunas, Holguín, Granma, Santiago de Cuba, Guantánamo\n`;
      body += `• Isla de la Juventud\n\n`;
      body += `<strong>Para cualquier envío debes escribirnos por WhatsApp</strong> y coordinamos la entrega o el envío por vía según tu caso.\n\n<em>El costo del envío se informa por WhatsApp según tu ubicación exacta.</em>`;
      return {
        response: body,
        quickReplies: ['💬 Coordinar por WhatsApp','🚚 Ver La Habana','📦 Ver productos']
      };
    }

    return {
      response: `🚚 <strong>Cobertura de Mensajería TiendaMax</strong>\n\nNuestra mensajería directa con pago contra entrega opera <strong>únicamente en el corredor desde Matanzas hasta Pinar del Río</strong>, incluyendo:\n\n• <strong>La Habana</strong> — todos los municipios\n• <strong>Artemisa</strong>\n• <strong>Mayabeque</strong>\n\n🚫 <strong>Para el Centro y Oriente del país</strong> (Villa Clara, Cienfuegos, Camagüey, Las Tunas, Holguín, Santiago de Cuba, Guantánamo, Isla de la Juventud):\n\nNo contamos con ruta directa. El envío se coordina por WhatsApp a través de agencias de encomiendas externas (VíaCar, transporte por ómnibus) o con el transportista de tu confianza.\n\n⚠️ <em>Para cualquier zona debes escribir por WhatsApp y coordinar.</em>\n\nDime tu municipio o provincia y te confirmo.`,
      quickReplies: ['🚚 Soy de Occidente (Matanzas-Pinar)','🚚 Soy del Centro/Oriente','💬 Coordinar por WhatsApp']
    };
  };

  R.pago = (text) => {
    const m = text.toLowerCase();

    if(/\bcripto|crypto|usdt|btc|bitcoin|ethereum\b/.test(m)){
      return {
        response: `🪙 <strong>Pago en criptomonedas</strong>\n\nActualmente en desarrollo. Próximamente aceptaremos USDT (Tether), BTC (Bitcoin) y ETH (Ethereum).\n\nPara enterarte cuando se active, escríbenos por WhatsApp.`,
        quickReplies: ['💬 WhatsApp','💵 Ver otros métodos','📦 Ver productos']
      };
    }

    if(/\bzelle|familiares en usa|desde el extranjero|pago desde usa\b/.test(m)){
      return {
        response: `💸 <strong>Pago vía Zelle (familiares en USA)</strong>\n\nSi un familiar en el extranjero va a pagar tu pedido:\n\n1. Coordinamos el monto y los datos de la cuenta por WhatsApp\n2. Tu familiar envía el pago desde su cuenta bancaria en USA\n3. Confirmamos la recepción del pago\n4. Te enviamos el producto y tú no pagas nada al recibirlo\n\nIdeal para regalos o cuando el comprador no está en Cuba.`,
        quickReplies: ['💬 WhatsApp','💵 Ver otros métodos','📦 Ver productos']
      };
    }

    if(/\benzona|aisml|transfermovil\b/.test(m)){
      return {
        response: `🚫 <strong>No trabajamos con EnZona ni Transfermóvil.</strong>\n\nPara mantener nuestros procesos ágiles y seguros, aceptamos únicamente:\n\n• <strong>Efectivo USD</strong> (dólares)\n• <strong>Efectivo MN</strong> (pesos cubanos, a la tasa del día)\n• <strong>Zelle</strong> (para pagos desde USA)\n\n¿Quieres coordinar tu pedido por WhatsApp con alguno de estos métodos?`,
        quickReplies: ['💬 WhatsApp','💵 Ver métodos aceptados','📦 Ver productos']
      };
    }

    if(/\btransferencia bancaria|bancario|bpa|banmet|bandec|bicsa\b/.test(m)){
      return {
        response: `🏦 <strong>No aceptamos transferencias bancarias</strong> (BPA, BANMET, Bandec, BICSA).\n\nNuestros únicos métodos aceptados son:\n\n• <strong>Efectivo USD</strong> (dólares)\n• <strong>Efectivo MN</strong> (pesos cubanos, a la tasa del día)\n• <strong>Zelle</strong> (desde el extranjero)\n\n¿Deseas coordinar tu pedido por WhatsApp con alguno de estos métodos?`,
        quickReplies: ['💬 WhatsApp','💵 Ver métodos aceptados','📦 Ver productos']
      };
    }

    if(/\bmn|peso cubano|pesos? nacionales?\b/.test(m)){
      return {
        response: `💵 <strong>Pago en MN (pesos cubanos)</strong>\n\nAceptamos pago en efectivo MN al recibir el producto.\n\nEl precio en MN que ves en el catálogo ya está calculado con la <strong>tasa de cambio del día</strong> más un pequeño <strong>margen operativo</strong> de la tienda.\n\nEse es el monto exacto que pagarás contra entrega. No hay que sumar nada más.\n\n<em>El precio que ves es el precio que pagas.</em>`,
        quickReplies: ['💵 Ver otros métodos','💬 WhatsApp','📦 Ver productos']
      };
    }

    // Se arma desde METODOS_PAGO, no a mano: escribir la lista aquí es cómo se
    // llega a que el dato diga una cosa y el mensaje otra.
    const _si = METODOS_PAGO.filter(x => x.disponible);
    const _no = METODOS_PAGO.filter(x => !x.disponible && !/pr[oó]ximamente/i.test(x.nota || ''));
    let body = `💳 <strong>Métodos de pago en TiendaMax</strong>\n\nAceptamos únicamente:\n\n`;
    _si.forEach(x => { body += `✅ <strong>${x.metodo}</strong>\n   ${x.detalle}\n`; });
    if(_no.length){
      body += `\n🚫 <strong>No aceptamos:</strong>\n`;
      _no.forEach(x => { body += `   • ${x.metodo}\n`; });
    }
    body += `\n¿Te interesa un método en específico?`;

    return {
      response: body,
      quickReplies: ['💵 Pago en MN','💸 Pago con Zelle','💬 WhatsApp']
    };
  };

  R.garantia = (text) => {
    const mentions = detectProductMentions(text);
    const POLICY = `\n\n<strong>⚠️ Importante:</strong> La garantía <strong>NO es universal</strong>.\n• ✅ Cubre <strong>defectos técnicos o de fábrica</strong> exclusivamente.\n• ❌ No cubre: mal uso, golpes, quemaduras por variaciones de voltaje, instalaciones incorrectas.`;

    // Producto identificado con garantía en su ficha
    if(mentions.length >= 1){
      const conGar = mentions.filter(x => String(x.garantia || '').trim());
      if(conGar.length === 1){
        const p = conGar[0];
        return {
          response: `🛡️ <strong>${escapeHtml(p.nombre)}</strong> tiene <strong>${escapeHtml(String(p.garantia).trim())}</strong>.${POLICY}\n\nSi presenta un defecto de fábrica, escríbenos por WhatsApp dentro de las primeras 24 horas con fotos o video del problema.`,
          products: [p],
          quickReplies: ['💬 Contactar Soporte','📦 Ver más productos']
        };
      }
      if(conGar.length > 1){
        let body = `🛡️ Tengo ${conGar.length} modelos con garantía:${POLICY}\n\n`;
        conGar.slice(0,4).forEach(x => {
          body += `• <strong>${escapeHtml(x.nombre)}</strong> — ${escapeHtml(String(x.garantia).trim())}\n`;
        });
        return { response: body, products: conGar.slice(0,4), quickReplies: ['💬 Contactar Soporte','📦 Ver más productos'] };
      }
      // Mención sin garantía anotada
      const nom = mentions.length === 1 ? escapeHtml(mentions[0].nombre) : 'ese producto';
      return {
        response: `🛡️ De <strong>${nom}</strong> no tengo el plazo de garantía anotado en la ficha. Prefiero no inventar uno.${POLICY}\n\nEscríbenos por WhatsApp y te confirmamos si tiene garantía y su plazo exacto.`,
        products: mentions.slice(0,3),
        quickReplies: ['💬 Contactar Soporte','📦 Ver más productos']
      };
    }

    // Sin producto específico → política general
    return {
      response: `🛡️ <strong>Política de Garantía TiendaMax</strong>\n\nLa garantía <strong>NO es universal</strong>. Aplica únicamente a los productos que lo indican específicamente en su ficha técnica.\n\n<strong>Condiciones de cobertura:</strong>\n\n• ✅ Cubre exclusivamente <strong>defectos técnicos o desperfectos de fábrica</strong>.\n• ❌ No cubre daños por <strong>mal uso</strong>.\n• ❌ No cubre <strong>golpes</strong> o daños físicos.\n• ❌ No cubre <strong>quemaduras por variaciones de voltaje</strong> (picos de tensión).\n• ❌ No cubre <strong>instalaciones incorrectas</strong>.\n\nSi tu producto tiene garantía y presenta un defecto técnico, escríbenos por WhatsApp. Te pediremos descripción del problema y, si es posible, foto o video.`,
      quickReplies: ['💬 Contactar Soporte','📦 Ver productos']
    };
  };

  R.devolucion = () => ({
    response: `↩️ <strong>Política de Devolución TiendaMax</strong>\n\nAceptamos devoluciones dentro de <strong>24 horas</strong> tras la entrega si:\n• El producto llega dañado o con <strong>defecto de fábrica</strong>\n• No corresponde a lo que pediste\n\n<strong>No procede devolución</strong> por:\n• Daños por mal uso, golpes o caídas\n• Quemaduras por variaciones de voltaje\n• Instalación incorrecta\n\nPara iniciar una devolución, escríbenos por WhatsApp con fotos del estado y descripción del problema. Coordinamos recogida y reemplazo o devolución del dinero.`,
    quickReplies: ['💬 Contactar Soporte','🛡️ Política de garantía','📦 Ver productos']
  });

  R.tasa = () => ({
    response: `💱 <strong>Tasa de cambio TiendaMax</strong>\n\n<code>1 USD = ${TASA_MN} MN</code>\n\nDesglose:\n• <strong>Tasa base elTOQUE:</strong> ${TASA_BASE_MN} MN\n  <em>(elTOQUE es la referencia de tasa de cambio en Cuba, se actualiza a diario)</em>\n• <strong>Margen operativo:</strong> +${MARGEN_MN} MN\n• <strong>Total que pagas:</strong> ${TASA_MN} MN por USD\n\nEl precio en MN que ves en el catálogo <strong>ya incluye la tasa + el margen</strong>. No hay que sumar nada más.\n\nEjemplo: un producto de <code>$100 USD</code> → pagas <code>${(100*TASA_MN).toLocaleString('es-ES')} MN</code> contra entrega.\n\n<em>El precio que ves es el precio que pagas.</em>`,
    quickReplies: ['💳 Métodos de pago','📦 Ver productos','💬 WhatsApp']
  });

  R.whatsapp = () => ({
    response: `💬 Nuestro WhatsApp es <code>+${WHATSAPP}</code>. Toca cualquier botón <code>Pedir</code> en un producto y se abre WhatsApp con el pedido armado. También puedes escribirnos directo para consultas personalizadas.`,
    quickReplies: ['📦 Ver productos','💬 Abrir WhatsApp']
  });

  R.ubicacion = () => ({
    response: `📍 TiendaMax es una tienda <strong>100% online</strong>. No tenemos local físico abierto al público. Todo se gestiona por WhatsApp y te enviamos a la puerta de tu casa. 🚚`,
    quickReplies: ['💬 WhatsApp','📦 Ver productos']
  });

  R.horario = () => ({
    response: `🕐 Atendemos de <strong>Lunes a Sábado, de 9:00am a 8:00pm</strong> (hora de Cuba). Los pedidos online se pueden hacer 24/7, pero las respuestas por WhatsApp son en horario de atención.`,
    quickReplies: ['📦 Ver productos','💬 WhatsApp']
  });

  R.ofertas = () => {
    const ofertas = PRODUCTOS
      .filter(p => p.stock > 0 && p.precioOriginal > 0 && p.precioOriginal > p.precio)
      .sort((a,b) => (b.precioOriginal - b.precio) - (a.precioOriginal - a.precio))
      .slice(0, 4);
    // Se excluyen los que ya salieron arriba: antes un producto con
    // precioOriginal y descuento aparecía dos veces, en el texto y en las
    // tarjetas.
    const yaListados = new Set(ofertas.map(p => p.id));
    const descuento = PRODUCTOS.filter(p => p.stock > 0 && p.descuento > 0 && !yaListados.has(p.id))
      .sort((a,b)=>b.descuento-a.descuento).slice(0,4);
    if(ofertas.length === 0 && descuento.length === 0){
      return {
        response: '🔍 Ahora mismo no hay ofertas activas con precio rebajado <em>disponibles</em>. Pero hay productos con excelente relación calidad-precio en todas las categorías. ¿Qué tipo de producto buscas y te muestro los mejores?',
        quickReplies: ['📦 Categorías','🆚 Comparar dos productos']
      };
    }
    let body = '🔥 <strong>Ofertas y rebajas actuales (solo productos disponibles)</strong>:\n\n';
    if(ofertas.length > 0){
      body += '<em>Con precio anterior marcado:</em>\n';
      ofertas.forEach(p => {
        const off = Math.round((1 - p.precio/p.precioOriginal) * 100);
        body += `• <strong>${escapeHtml(p.nombre)}</strong> — ${fmtUSD(p.precio)} (era ${fmtUSD(p.precioOriginal)}, -${off}%)\n`;
      });
    }
    if(descuento.length > 0){
      body += '\n<em>Con descuento activo:</em>\n';
      descuento.forEach(p => {
        body += `• <strong>${escapeHtml(p.nombre)}</strong> — ${fmtUSD(p.precio)} (-${p.descuento}%)\n`;
      });
    }
    body += '\nToca cualquiera para ver la ficha completa y pedirlo.';
    return {
      response: body,
      products: [...ofertas, ...descuento].slice(0,4),
      quickReplies: ['💬 WhatsApp','📦 Ver categorías']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  UNA CATEGORÍA CONCRETA
  // ════════════════════════════════════════════════════════════
  // Preguntar por una categoría acababa en la búsqueda difusa por texto:
  // "wifi" puntuaba alto en cualquier cámara wifi o timbre wifi, así que
  // pedir WIFI devolvía 1 router y 3 cámaras de seguridad — 4 productos de
  // los 25 que hay. Ahora se filtra por p.categoria y punto.

  // El home rotula WIFI como "REDES"; el cliente puede escribir cualquiera.
  const ALIAS_CAT = {
    'redes':'WIFI', 'red':'WIFI', 'internet':'WIFI', 'wi fi':'WIFI', 'wifi':'WIFI',
    'energia':'ENERGIA', 'solar':'ENERGIA', 'corriente':'ENERGIA',
    'seguridad':'SEGURIDAD', 'vigilancia':'SEGURIDAD',
    'carros':'CARROS', 'carro':'CARROS', 'autos':'CARROS', 'auto':'CARROS',
    'motos':'MOTOS', 'moto':'MOTOS',
    'hogar':'HOGAR', 'casa':'HOGAR',
    'celulares':'CELULARES', 'celular':'CELULARES', 'telefonos':'CELULARES',
    'audio':'AUDIO', 'sonido':'AUDIO', 'musica':'AUDIO',
    'juegos':'JUEGOS', 'gaming':'JUEGOS',
    'ropa':'ROPA', 'utiles':'UTILES', 'herramientas':'UTILES',
    'gym':'GYM', 'gimnasio':'GYM',
    'pc':'PC Y LAPTOPS', 'laptops':'PC Y LAPTOPS', 'computadoras':'PC Y LAPTOPS',
  };

  // Palabras de relleno que rodean al nombre: si al quitarlas solo queda la
  // categoría, el cliente está pidiendo ESA categoría. Con esto "categorías
  // wifi", "wifi" o "muéstrame la sección de audio" entran, pero "necesito
  // una cámara wifi para el patio" NO — ahí quedan palabras sueltas y sigue
  // siendo una búsqueda normal.
  const _RELLENO_CAT = /\b(ver|veo|mostrar|muestrame|muestra|ensename|quiero|dame|deseo|necesito|busco|buscar|hay|tienes|tienen|que|todos|todas|todo|toda|los|las|el|la|un|una|de|del|en|por|para|productos|producto|articulos|categoria|categorias|seccion|secciones|catalogo|lista|listado|mas|otros|opciones|disponibles?)\b/g;

  function _detectarCategoriaPedida(text){
    let t = cleanForMatch(text).replace(_RELLENO_CAT, ' ').replace(/\s+/g, ' ').trim();
    if(!t || t.length > 24) return null;
    // Coincidencia exacta con el nombre real de una categoría del catálogo
    for(const c of CATEGORIAS){
      if(cleanForMatch(c.nombre) === t) return c.nombre;
    }
    if(ALIAS_CAT[t]){
      // Solo si esa categoría existe de verdad en el catálogo de ahora
      const real = CATEGORIAS.find(c => c.nombre === ALIAS_CAT[t]);
      if(real) return real.nombre;
    }
    return null;
  }

  // Igual que con las categorías, pero un nivel más fino. La búsqueda difusa
  // puntúa la descripción, así que "una batería para el apagón" devolvía un
  // cargador, una alarma, fundas de auto y una raqueta matamoscas — todos
  // mencionan "batería" en su texto. Si el cliente nombra un TIPO que existe
  // como subcategoría, se filtra por ella y se acabó la adivinanza.
  // Se deriva del catálogo: una subcategoría nueva funciona sin tocar código.
  function _detectarSubcategoria(text){
    const t = ' ' + cleanForMatch(text) + ' ';
    const subs = [...new Set(PRODUCTOS.map(p => p.subcategoria).filter(Boolean))];
    let mejor = null, mejorLen = 0;
    subs.forEach(sub => {
      const base = cleanForMatch(sub);
      const variantes = new Set([base, base.replace(/es$/, ''), base.replace(/s$/, '')]);
      // Primera palabra: "CONTROLADORES SOLARES" → "controlador(es)"
      const prim = base.split(' ')[0];
      if(prim.length >= 5){ variantes.add(prim); variantes.add(prim.replace(/es$/, '')); variantes.add(prim.replace(/s$/, '')); }
      variantes.forEach(v => {
        if(v.length >= 4 && t.indexOf(' ' + v) !== -1 && v.length > mejorLen){ mejor = sub; mejorLen = v.length; }
      });
    });
    return mejor;
  }

  const TM_MAX_TARJETAS_CAT = 8;   // el prototipo enseñaba 4 y sabía a poco

  R.categoria = (text) => {
    const cat = _context.categoriaPedida || _detectarCategoriaPedida(text);
    _context.categoriaPedida = null;
    if(!cat) return R.categorias();
    _context.lastCategory = cat;

    const info = CATEGORIAS.find(c => c.nombre === cat) || {icono:'📦', desc:''};
    const todos = PRODUCTOS.filter(p => p.categoria === cat);
    const disp = todos.filter(p => p.stock > 0).sort((a,b) => a.precio - b.precio);
    const agotados = todos.length - disp.length;

    if(disp.length === 0){
      return {
        response: `${info.icono} <strong>${cat}</strong>\n\nAhora mismo no tengo nada <em>disponible</em> en esta categoría${agotados ? ` (${agotados} agotado${agotados>1?'s':''})` : ''}. Escríbeme por WhatsApp y te aviso en cuanto entre mercancía, o mira otra categoría.`,
        quickReplies: ['💬 WhatsApp','📦 Ver categorías']
      };
    }

    // Agrupar por subcategoría: en WIFI hay routers, switches y accesorios
    // mezclados, y verlos separados orienta mucho más que una lista plana.
    const porSub = {};
    disp.forEach(p => { const s = p.subcategoria || 'OTROS'; (porSub[s] = porSub[s] || []).push(p); });
    const subs = Object.keys(porSub).sort((a,b) => porSub[b].length - porSub[a].length);

    let body = `${info.icono} <strong>${cat}</strong>${info.desc ? ` — ${info.desc}` : ''}\n\n`;
    body += `Tengo <em>${disp.length} producto${disp.length>1?'s':''} disponible${disp.length>1?'s':''}</em>`;
    if(agotados) body += ` (y ${agotados} agotado${agotados>1?'s':''})`;
    body += `, desde ${fmtUSD(disp[0].precio)} hasta ${fmtUSD(disp[disp.length-1].precio)}.\n\n`;

    if(subs.length > 1){
      body += `<strong>Por tipo:</strong>\n`;
      subs.forEach(s => { body += `• ${s} — <em>${porSub[s].length}</em>\n`; });
      body += `\n`;
    }

    const listados = disp.slice(0, 10);
    body += `<strong>Disponibles ahora</strong> (de más barato a más caro):\n`;
    listados.forEach((p, i) => {
      body += `<strong>${i+1}.</strong> ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)} · <em>${stockText(p)}</em>\n`;
    });
    if(disp.length > listados.length){
      body += `\n…y ${disp.length - listados.length} más. Dime qué tipo buscas (${subs.slice(0,2).join(', ')}…) o tu presupuesto y afino.\n`;
    }
    body += `\nToca cualquier tarjeta para ver la ficha completa.`;

    const qrs = [`🛍️ Ver los ${disp.length} en la tienda`];
    if(disp.length >= 2) qrs.push('🆚 Comparar dos de estos');
    subs.slice(0, 2).forEach(s => { if(subs.length > 1) qrs.push('📂 ' + s); });
    qrs.push('📦 Otras categorías');

    return { response: body, products: disp.slice(0, TM_MAX_TARJETAS_CAT), quickReplies: qrs };
  };

  R.categorias = () => {
    const lista = CATEGORIAS.map(c => {
      const disp = PRODUCTOS.filter(p => p.categoria === c.nombre && p.stock > 0).length;
      const total = PRODUCTOS.filter(p => p.categoria === c.nombre).length;
      if(total === 0) return null;
      const dispStr = disp > 0 ? `<em>${disp} disp.</em>` : '<em style="color:#ff8888">agotados</em>';
      return `${c.icono} <strong>${c.nombre}</strong> — ${c.desc} <em>(${dispStr} de ${total})</em>`;
    }).filter(Boolean).join('\n');
    const totalDisp = PRODUCTOS.filter(p=>p.stock>0).length;
    return {
      response: `📦 Tenemos <em>${totalDisp} productos disponibles</em> en <em>${CATEGORIAS.filter(c => PRODUCTOS.some(p=>p.categoria===c.nombre)).length} categorías</em>:\n\n${lista}\n\n¿Cuál te interesa? Pregúntame por una y te muestro lo mejor.`,
      quickReplies: CATEGORIAS.filter(c => PRODUCTOS.some(p=>p.categoria===c.nombre && p.stock>0)).slice(0,5).map(c => c.icono + ' ' + c.nombre)
    };
  };

  R.stock = () => {
    const agotados = PRODUCTOS.filter(p => p.stock === 0);
    const disponibles = PRODUCTOS.filter(p => p.stock > 0);
    let body = `📦 Estado del catálogo:\n• <em>${disponibles.length}</em> productos disponibles\n• <em>${agotados.length}</em> productos agotados\n\n`;
    if(disponibles.length > 0){
      body += 'Algunos disponibles ahora mismo:\n';
      disponibles.slice(0,3).forEach(p => {
        body += `• ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)}\n`;
      });
    }
    body += '\nToca "Avisarme cuando vuelva" en cualquier producto agotado y te notificamos.';
    return {
      response: body,
      products: disponibles.slice(0,4),
      quickReplies: ['🔥 Ofertas','📦 Categorías']
    };
  };

  R.usados = () => {
    const usados = PRODUCTOS.filter(p => p.usado && p.stock > 0);
    if(usados.length === 0){
      return {
        response: '♻️ Actualmente no tenemos productos usados <em>disponibles</em>. Todos son nuevos con garantía.',
        quickReplies: ['📦 Ver productos']
      };
    }
    return {
      response: `♻️ Tenemos <em>${usados.length}</em> producto(s) usado(s) en buen estado. Cada uno indica "♻️ Producto usado" en su ficha. Suelen tener precio más bajo. Mira los que hay:`,
      products: usados.slice(0,4),
      quickReplies: ['📦 Ver todos']
    };
  };

  R.masVendidos = () => {
    const top = PRODUCTOS.filter(p => p.masVendido && p.stock > 0).slice(0,4);
    if(top.length === 0){
      return {
        response: '🏆 No tengo un ranking de "más vendidos" activo ahora mismo, pero te puedo recomendar lo más popular según lo que la gente busca. ¿Qué necesitas?',
        quickReplies: ['📦 Categorías','🔥 Ofertas']
      };
    }
    return {
      response: `🏆 <strong>Lo más vendido ahora mismo</strong> en TiendaMax (solo disponibles):\n\nToca cualquiera para ver ficha completa y pedirlo.`,
      products: top,
      quickReplies: ['💬 WhatsApp','🔥 Ver ofertas']
    };
  };

  R.seguimiento = () => ({
    response: `📦 Puedes seguir tu pedido en tiempo real desde el link que te enviamos por WhatsApp al confirmar la venta. También lo encuentras en <code>Mis Pedidos → Seguir pedido</code>. Si no recibiste el link, escríbenos por WhatsApp con tu número de pedido.`,
    quickReplies: ['💬 WhatsApp']
  });

  // ════════════════════════════════════════════════════════════
  //  DIAGNÓSTICO DE AVERÍAS
  // ════════════════════════════════════════════════════════════
  // Para qué: casi toda "garantía" de un inversor o un router es en realidad
  // un equipo sano mal usado — la nevera que arranca pidiendo el triple, el
  // ONT que hay que reiniciar antes que el router, la batería descargada por
  // debajo del corte. Cada una de esas que se resuelve por chat es una
  // devolución que no se paga.
  //
  // REGLA DURA: aquí NO se inventan códigos. Lo de abajo son patrones de
  // síntoma ciertos para toda la familia de aparatos (un inversor que pita
  // con la luz de fallo está en sobrecarga, sea de la marca que sea). Los
  // códigos concretos — "Error 04", "F05" — dependen del fabricante y del
  // modelo, viven en codigos-error.json y salen de copiar los manuales. Si el
  // código no está ahí, Max lo dice en vez de suponerlo: un diagnóstico
  // eléctrico inventado no es una respuesta imperfecta, es una avería nueva.
  //
  // Y nunca se manda abrir un aparato: además del riesgo, abrirlo anula la
  // garantía que este diagnóstico existe para proteger.
  const DIAGNOSTICO = [
    // ── Inversores ──────────────────────────────────────────
    {
      familia: 'INVERSORES', urgente: true,
      titulo: 'Sobrecarga o cortocircuito en la salida',
      // Ojo: aquí NO va /error/. Casaba con cualquier "da error 04" y hacía
      // que Max encabezara la respuesta con "Sobrecarga" — presentando una
      // suposición como si fuera lo que significa ese código.
      sintomas: [/pit(a|ando|ido)|beep|suena|chilla|alarma/, /luz roja|roja.*(fija|encendida)|sobrecarga|fault/],
      significa: 'El inversor se está protegiendo: lo que tienes conectado pide más de lo que puede dar, o hay un corto en la salida.',
      pasos: [
        'Desconecta <strong>todo</strong> lo que tenga enchufado antes de nada.',
        'Suma los W de los equipos: si pasan de lo que aguanta el inversor, esa es la causa.',
        'Si hay una bomba de agua o un motor, comprueba que no esté trabado — trabado consume muchísimo más.',
        'No lo reinicies con la carga puesta: vuelve a protegerse y no habrás averiguado nada.'
      ]
    },
    {
      familia: 'INVERSORES', urgente: false,
      titulo: 'Se apaga justo cuando arranca la nevera o la bomba',
      sintomas: [/se apaga|se corta|se reinicia|corta.*(cuando|al)/, /nevera|refrigerador|bomba|motor|compresor|aire/],
      significa: 'No está roto. Los motores arrancan pidiendo 3 o 4 veces su consumo normal durante un segundo, y ese pico es el que no aguanta.',
      pasos: [
        'Mira la potencia de <em>pico</em> del inversor, no la continua: para una nevera de 150W hacen falta unos 1000W continuos.',
        'Conecta el motor solo, sin nada más, y prueba: si así arranca, era la suma.',
        'Si el inversor es de onda modificada, un motor puede no arrancar nunca aunque sobre potencia.'
      ]
    },
    {
      familia: 'INVERSORES', urgente: false,
      titulo: 'Avisa de batería baja',
      sintomas: [/pit(a|ando|ido)|alarma|beep/, /bater[ií]a|voltaje|bajo|descargad/],
      significa: 'La batería bajó del voltaje mínimo y el inversor corta para no dañarla. Es la protección haciendo su trabajo.',
      pasos: [
        'Carga la batería antes de volver a usarla; dejarla descargada días le quita vida.',
        'Si se descarga mucho antes que antes, la batería está gastada, no el inversor.',
        'Con batería de plomo-ácido no bajes del 50 %: descargarla a fondo la arruina en pocos ciclos.'
      ]
    },
    {
      familia: 'INVERSORES', urgente: false,
      titulo: 'Se calienta y se apaga al rato',
      sintomas: [/calienta|caliente|temperatura|quema|hirviendo/, /apaga|corta|para/],
      significa: 'Protección por temperatura. Suele ser ventilación, no avería.',
      pasos: [
        'Déjalo destapado y con aire por los lados; dentro de un mueble cerrado se ahoga.',
        'Trabajar al máximo de su potencia todo el día lo calienta aunque esté sano: deja margen.',
        'Comprueba que el ventilador gire y que las rejillas no estén tapadas de polvo.'
      ]
    },
    {
      familia: 'INVERSORES', urgente: false,
      titulo: 'No enciende nada',
      sintomas: [/no enciende|no prende|no da se[ñn]ales|muerto|no hace nada/],
      significa: 'Casi siempre es la alimentación de continua, no el inversor.',
      pasos: [
        'Revisa los bornes de la batería: flojos o sulfatados no dejan pasar corriente.',
        'Casi todos llevan un fusible en la entrada de continua — es lo primero que se va.',
        'Comprueba la polaridad. Invertida, muchos no encienden (y algunos se dañan).'
      ]
    },
    {
      familia: 'INVERSORES', urgente: false,
      titulo: 'Zumbido en los equipos conectados',
      sintomas: [/zumb|ruido|vibra|suena raro|interferencia/],
      significa: 'Si el inversor es de onda modificada, no es un fallo: los transformadores y motores zumban con esa onda.',
      pasos: [
        'Para nevera, bomba, audio o equipos médicos hace falta <strong>onda pura</strong>.',
        'Con onda modificada, ese zumbido acorta la vida de los motores.'
      ]
    },
    // ── Controladores solares ───────────────────────────────
    {
      familia: 'CONTROLADORES SOLARES', urgente: false,
      titulo: 'No carga aunque hay sol',
      sintomas: [/no carga|no est[aá] cargando|no sube|no entra corriente|no llega/],
      significa: 'Suele ser el orden de conexión o el voltaje del panel, no el controlador.',
      pasos: [
        'Orden correcto: <strong>primero la batería</strong>, después el panel, y la carga al final. Al revés, muchos controladores ni arrancan.',
        'El panel tiene que dar más voltaje que la batería para poder cargarla.',
        'Si el controlador ve voltaje del panel pero no carga, puede ser que la batería ya esté llena.',
        'Revisa que el tipo de batería configurado sea el tuyo: con litio puesto como plomo (o al revés) carga mal.'
      ]
    },
    // ── Routers y antenas ───────────────────────────────────
    {
      familia: 'ROUTERS', urgente: false,
      titulo: 'Conecta al wifi pero no hay internet',
      sintomas: [/sin internet|no hay internet|no navega|conecta pero|sin conexi[oó]n|no carga.*p[aá]gina/],
      significa: 'El wifi del router funciona; lo que falla es lo que viene de fuera.',
      pasos: [
        'Reinicia <strong>primero</strong> el equipo de la fibra (ONT) y espera a que estabilice; después el router.',
        'Mira la luz de WAN o internet del router: apagada o roja = no le llega señal.',
        'Si cambiaste de router, hay que volver a poner el usuario y la clave de PPPoE.',
        'Prueba con un cable directo al ONT: si así navega, el problema está entre ONT y router.'
      ]
    },
    {
      familia: 'ROUTERS', urgente: false,
      titulo: 'Se cae la conexión cada cierto tiempo',
      sintomas: [/se cae|se corta|se desconecta|intermitente|a cada rato|se reinicia solo/],
      significa: 'Cortes periódicos casi nunca son del wifi: son alimentación o calor.',
      pasos: [
        'Toca el router: si quema, ponlo donde le dé aire y levántalo de la superficie.',
        'Prueba otra fuente de corriente — las fuentes gastadas dan cortes que parecen fallo de señal.',
        'Si tienes apagones o bajones, un inversor o UPS pequeño lo estabiliza.'
      ]
    },
    {
      familia: 'ROUTERS', urgente: false,
      titulo: 'La antena de exterior no enciende (PoE)',
      sintomas: [/no enciende|no prende|sin luz|no da se[ñn]ales/, /antena|cpe|nanostation|exterior|poe/],
      significa: 'La alimentación de estas antenas va por el propio cable de red, y el inyector tiene dos bocas que no son iguales.',
      pasos: [
        'El cable que va a la antena entra en la boca <strong>PoE</strong> del inyector; la otra (LAN) va al router.',
        'Cambiadas de sitio, la antena no recibe corriente — y es el fallo más común.',
        'Pasados unos 50 m, un cable malo ya no lleva bien la alimentación: usa cable de cobre de verdad, no de aluminio.'
      ]
    },
    // ── Cámaras ─────────────────────────────────────────────
    {
      familia: 'CÁMARAS', urgente: false,
      titulo: 'No conecta al wifi',
      sintomas: [/no conecta|no se conecta|no encuentra|no aparece|no enlaza|no vincula/],
      significa: 'La mayoría de estas cámaras solo hablan wifi de 2.4 GHz.',
      pasos: [
        'Conecta el móvil a la red de <strong>2.4 GHz</strong> mientras la configuras, no a la de 5 GHz.',
        'Si el router junta las dos bandas en un mismo nombre, sepáralas un momento para emparejarla.',
        'La clave del wifi con símbolos raros da problemas en algunos modelos.'
      ]
    },
    {
      familia: 'CÁMARAS', urgente: false,
      titulo: 'De noche se ve todo blanco o velado',
      sintomas: [/blanco|velad|reflejo|borros|no se ve.*noche|noche.*no se ve/],
      significa: 'El infrarrojo está rebotando en algo cercano, casi siempre un cristal o una pared.',
      pasos: [
        'Si está detrás de un cristal, el reflejo es suyo: sácala fuera o apaga el infrarrojo.',
        'Sepárala de paredes, techos y telarañas — cualquier cosa a un palmo devuelve toda la luz.'
      ]
    },
    // ── Baterías ────────────────────────────────────────────
    {
      familia: 'BATERÍAS', urgente: true,
      titulo: 'Hinchada, caliente o con olor',
      sintomas: [/hinchad|inflad|abombad|huele|olor|derrame|fuga|muy caliente|humo/],
      significa: 'Deja de usarla ahora mismo. Una batería hinchada o que huele es un riesgo real, no una avería que se repara.',
      pasos: [
        '<strong>No la cargues más</strong> y desconéctala.',
        'Sácala a un sitio ventilado, lejos de cosas que ardan, y no la pinches ni la abras.',
        'Escríbenos por WhatsApp: eso sí entra en garantía si es reciente.'
      ]
    },
    {
      familia: 'BATERÍAS', urgente: false,
      titulo: 'Dura mucho menos que antes',
      sintomas: [/dura menos|dura poco|se descarga r[aá]pido|no aguanta|baja r[aá]pido/],
      significa: 'Capacidad perdida. En plomo-ácido suele venir de haberla descargado a fondo varias veces.',
      pasos: [
        'Mídele el voltaje en reposo, una hora después de dejar de cargar y sin nada conectado.',
        'Si con el inversor puesto el voltaje se desploma, ya no da su capacidad.',
        'De plomo-ácido, no bajar del 50 %; de LiFePO4 puedes usar mucho más sin castigarla.'
      ]
    }
  ];

  // Palabras que delatan de qué aparato habla el cliente cuando no nombra un
  // producto del catálogo ("mi inversor está pitando").
  // En dos niveles: primero el nombre del aparato, y solo si no aparece
  // ninguno, las palabras de conexión. Si no, "la cámara no conecta al wifi"
  // se clasificaba como router — por el "wifi" — y perdía el diagnóstico de
  // cámara, que es el que servía.
  const _FAMILIA_PALABRAS = {
    'INVERSORES': /\binversor|inversores|planta el[eé]ctrica\b/,
    'CONTROLADORES SOLARES': /\bcontrolador|mppt|pwm|regulador\b/,
    'BATERÍAS': /\bbater[ií]a|bateria|acumulador\b/,
    'CÁMARAS': /\bc[aá]mara|camara|c[aá]maras|videovigilancia|dvr\b/,
    'ROUTERS': /\brouter|antena|cpe|nanostation|repetidor|access point\b/
  };
  const _FAMILIA_VAGA = { 'ROUTERS': /\bwifi|wi-fi|internet|se[ñn]al|red\b/ };

  // Señales de que esto es una avería y no una consulta de compra. Van en dos
  // niveles a propósito: "pita" o "echa humo" no aparecen nunca en una
  // pregunta de compra, pero "no funciona" sí ("¿no funciona con mi nevera?"),
  // así que las flojas solo cuentan si además se sabe de qué aparato habla.
  // OJO con el \b final: lo llevaban y por eso "hinchada" no casaba con la raíz
  // "hinchad" ni "parpadea" con "parpade" — cinco de siete raíces no servían y
  // el diagnóstico entero quedaba inalcanzable con las frases más naturales.
  // Las raíces van con \w* y solo llevan \b las palabras completas.
  const _AVERIA_FUERTE = /\b(pit[ao]\w*|pitido|beep\b|parpade\w*|titil\w*|luz roja|se calienta|calentando|hinchad\w*|inflad\w*|abombad\w*|huele\b|humo\b|zumb\w*|aver[ií]\w*|no da corriente|dura menos)/i;
  const _AVERIA_DEBIL = /\b(no enciende|no prende|no carga|no funciona|no conecta|se apaga|se corta|se reinicia|se desconecta|se cae|sin internet|no hay internet|sin se[ñn]al|sin conexi[oó]n|no navega|fall[ao]\w*|se ve blanco|no da (internet|se[ñn]al|corriente|imagen|video)|no graba|no transmite|no muestra|no llega (internet|se[ñn]al)|no agarra se[ñn]al)/i;

  /** ¿Está describiendo una avería? */
  function esAveria(text){
    if(_AVERIA_FUERTE.test(text)) return true;
    if(detectarCodigo(text)) return true;
    return _AVERIA_DEBIL.test(text) && !!_familiaDelTexto(text);
  }

  function _familiaDelTexto(text){
    // Un producto del catálogo mencionado manda sobre las palabras sueltas.
    const mencion = detectProductMentions(text)[0];
    if(mencion && mencion.subcategoria) return String(mencion.subcategoria).toUpperCase();
    const m = text.toLowerCase();
    for(const fam in _FAMILIA_PALABRAS){
      if(_FAMILIA_PALABRAS[fam].test(m)) return fam;
    }
    for(const fam in _FAMILIA_VAGA){
      if(_FAMILIA_VAGA[fam].test(m)) return fam;
    }
    return null;
  }

  /** Entradas que encajan con lo que describe el cliente, mejor primero. */
  function diagnosticar(text, familia){
    const m = text.toLowerCase();
    const fam = familia || _familiaDelTexto(text);
    const puntuadas = [];
    for(const d of DIAGNOSTICO){
      if(fam && d.familia !== fam) continue;
      let n = 0;
      d.sintomas.forEach(rx => { if(rx.test(m)) n++; });
      if(n === 0) continue;
      // Casar TODOS los grupos de síntomas pesa más que casar uno: distingue
      // "se apaga con la nevera" de un "se apaga" genérico.
      if(n === d.sintomas.length) n += 2;
      if(!fam) n -= 1;   // sin saber el aparato, menos confianza
      puntuadas.push({ d: d, n: n });
    }
    puntuadas.sort((a, b) => b.n - a.n);
    return puntuadas.map(x => x.d);
  }

  // ── Códigos concretos de cada marca ─────────────────────────
  // No van en este archivo a propósito: se copian de los manuales y cambian
  // con cada modelo. Se bajan solo cuando alguien pregunta por una avería.
  let _CODIGOS = null, _codigosPedidos = false;

  function _cargarCodigos(){
    if(_codigosPedidos) return;
    _codigosPedidos = true;
    // Relativa, igual que productos.json y resenas-cache.json: el chat solo
    // se carga desde index.html, en la raíz. Con SITE_URL + '/…' el guard de
    // test_llamadas_vs_reglas la confunde con una llamada a la RTDB.
    fetch('codigos-error.json', { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { _CODIGOS = (j && j.marcas) || {}; })
      .catch(() => { _CODIGOS = {}; });
  }

  /** "error 04", "F05", "código E3" → el código tal cual lo escribió. */
  function detectarCodigo(text){
    const m = text.match(/\b(?:error|err|c[oó]digo|code|falla|fallo)\s*[:#-]?\s*([a-z]?\s?\d{1,3}[a-z]?)\b/i)
           || text.match(/\b([EFP]\s?-?\s?\d{1,3})\b/i);
    return m ? m[1].replace(/\s+/g, '').toUpperCase() : null;
  }

  function buscarCodigo(codigo, familia, texto){
    if(!codigo || !_CODIGOS) return null;
    // El cliente escribe "error 4" y el manual lo imprime "04". Se prueban las
    // dos formas: si no, tener el código en la tabla no serviría de nada.
    const formas = [codigo];
    if(/^\d{1,2}$/.test(codigo)) formas.push(codigo.padStart(2, '0'), String(Number(codigo)));
    // La marca la tiene que haber dicho el cliente. Sin esto se recorría la
    // tabla entera y "mi inversor da error 04" se contestaba con el manual de
    // Powmr a alguien que quizá tiene un Must — que es exactamente lo que este
    // módulo promete no hacer, dicho encima con el nombre de otra marca.
    const _t = normalize(String(texto || ''));
    for(const marca in _CODIGOS){
      if(_t.indexOf(normalize(marca)) === -1) continue;
      const tabla = _CODIGOS[marca] || {};
      for(const forma of formas){
        const entrada = tabla[forma];
        if(entrada && (!familia || !entrada.familia || entrada.familia === familia)){
          return Object.assign({ marca: marca, codigo: forma }, entrada);
        }
      }
    }
    return null;
  }

  R.diagnostico = (text) => {
    _cargarCodigos();
    const familia = _familiaDelTexto(text);
    const codigo = detectarCodigo(text);
    const hallazgos = diagnosticar(text, familia);

    // Un código concreto que sí tenemos en el manual manda sobre el síntoma.
    const delManual = buscarCodigo(codigo, familia, text);
    if(delManual){
      let body = `⚠️ <strong>Código ${escapeHtml(delManual.codigo)}</strong> · ${escapeHtml(delManual.marca)}\n\n`;
      body += `${escapeHtml(delManual.significa || '')}\n\n`;
      (delManual.pasos || []).forEach((p, i) => { body += `${i + 1}. ${p}\n`; });
      body += `\n¿Se resolvió? Si no, escríbeme y lo vemos.`;
      return { response: body, quickReplies: ['💬 WhatsApp', '📦 Ver productos'] };
    }

    if(!hallazgos.length){
      // Aquí es donde se decide no inventar. Un significado sacado de otra
      // marca puede costarle el equipo al cliente.
      let body = `🔧 <strong>Vamos a ver qué le pasa</strong>\n\n`;
      const _marcaDicha = codigo && _CODIGOS
        ? Object.keys(_CODIGOS).find(mk => normalize(text).indexOf(normalize(mk)) !== -1)
        : null;
      if(codigo && _marcaDicha){
        // Sí tenemos el manual de esa marca; lo que falta es ese código.
        body += `Veo el código <code>${escapeHtml(codigo)}</code>. Tengo el manual de <strong>${escapeHtml(_marcaDicha)}</strong>, pero ese código no está en él y no me lo voy a inventar. Dime el <strong>modelo exacto</strong> y qué hace el equipo, y lo vemos.\n\n`;
      } else if(codigo && _CODIGOS){
        body += `Veo el código <code>${escapeHtml(codigo)}</code>, pero no tengo el manual de esa marca, y los códigos no significan lo mismo en dos fabricantes distintos. Prefiero no adivinarlo: en eléctrica una suposición puede costarte el equipo. Dime <strong>marca y modelo</strong> y te lo confirmo.\n\n`;
      } else if(codigo){
        // La tabla todavía se está bajando. Decir "no tengo el manual" aquí
        // sería mentir por una carrera de carga, no por falta del dato.
        body += `Veo el código <code>${escapeHtml(codigo)}</code>. Dime <strong>marca y modelo</strong> del equipo y te lo confirmo — el mismo número significa cosas distintas en cada fabricante y no quiero adivinarlo.\n\n`;
      }
      body += `Cuéntame estas tres cosas y te digo qué es:\n`;
      body += `• Qué aparato es (inversor, controlador, router, cámara, batería)\n`;
      body += `• Qué hace exactamente: ¿pita?, ¿parpadea alguna luz?, ¿se apaga solo?\n`;
      body += `• Qué tenías conectado cuando pasó\n\n`;
      body += `Por ejemplo: <em>"mi inversor pita y tiene la luz roja encendida"</em>.\n\n`;
      body += `Si prefieres, mándame marca y modelo por WhatsApp con una foto de la pantalla y lo miro yo.`;
      return { response: body, quickReplies: ['💬 WhatsApp', '📦 Ver productos'] };
    }

    const d = hallazgos[0];
    let body = '';

    // Si preguntó por un código que no tenemos, eso va PRIMERO. Encabezar con
    // el síntoma más probable presentaría una deducción como si fuera la
    // lectura de su código, que es justo lo que este módulo no debe hacer.
    if(codigo){
      body += `🔍 <strong>El código ${escapeHtml(codigo)} no lo tengo</strong>\n\n`;
      body += `Ese número significa cosas distintas en cada fabricante y no tengo el manual de tu modelo. No te lo traduzco a ciegas: en eléctrica, el significado de otra marca puede costarte el equipo.\n\n`;
      body += `Ahora bien, por lo que me cuentas lo más probable es <em>${escapeHtml(d.titulo.toLowerCase())}</em> — deducido de los síntomas, no leído de tu código:\n\n`;
    } else {
      body += (d.urgente ? '🚨' : '🔧') + ` <strong>${escapeHtml(d.titulo)}</strong>\n\n`;
    }

    body += `${d.significa}\n\n`;
    body += `<strong>Qué hacer:</strong>\n`;
    d.pasos.forEach((p, i) => { body += `${i + 1}. ${p}\n`; });

    if(hallazgos[1]){
      body += `\nSi no era eso, lo siguiente más probable es <em>${escapeHtml(hallazgos[1].titulo.toLowerCase())}</em>.`;
    }
    if(codigo){
      body += `\n\nMándame marca y modelo exactos y te confirmo qué es el ${escapeHtml(codigo)} de verdad.`;
    }
    body += `\n\n⚠️ <em>No abras el aparato</em>: además del riesgo, abrirlo anula la garantía. Si con esto sigue igual, escríbeme y lo vemos.`;

    return {
      response: body,
      products: familia
        ? PRODUCTOS.filter(p => (p.subcategoria || '').toUpperCase() === familia && p.stock > 0).slice(0, 2)
        : [],
      quickReplies: ['💬 WhatsApp', '🔧 Sigue igual', '📦 Ver productos']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  ARMADO DE SISTEMAS (estructura) + COTIZACIÓN IMPRIMIBLE
  // ════════════════════════════════════════════════════════════
  // Los tres armadores (solar, seguridad, internet) recorrían el catálogo con
  // el mismo bucle copiado tres veces, y sólo conservaban una lista plana de
  // productos: el rol que cumplía cada uno ("Batería", "Inversor") se perdía
  // al pintar el texto. La cotización necesita justo ese dato, así que el
  // recorrido se hace una sola vez aquí y devuelve la estructura.
  function _armarSistema(sis){
    const grupos = (sis.componentes || []).map(comp => {
      const prods = PRODUCTOS.filter(p =>
        (p.subcategoria || '').toUpperCase() === comp.subcat && p.stock > 0
      ).slice(0, 2);
      // "Agotado" y "no lo vendemos" no son lo mismo, y decir lo primero
      // cuando pasa lo segundo promete que vuelve algo que nunca estuvo:
      // de PANELES SOLARES no hay ni uno en el catálogo, ni agotado.
      const enCatalogo = PRODUCTOS.some(p => (p.subcategoria || '').toUpperCase() === comp.subcat);
      return {
        rol: comp.rol,
        subcat: comp.subcat,
        enCatalogo: enCatalogo,
        // min:0 marca los componentes que el propio catálogo describe como
        // "(opcional)". No entran en el total: cotizar como obligatorio algo
        // que el cliente puede no llevar infla el precio y quema la confianza.
        cantidad: Math.max(1, comp.min || 0),
        opcional: (comp.min || 0) === 0,
        prods: prods
      };
    });
    return { nombre: sis.nombre, presupuesto: sis.presupuesto, grupos: grupos };
  }

  /** El texto de componentes, idéntico al que pintaban los tres armadores. */
  function _sistemaCuerpo(armado, mostrarAgotados){
    let body = '';
    for(const g of armado.grupos){
      if(g.prods.length > 0){
        body += `<strong>${g.rol}:</strong>\n`;
        g.prods.forEach(p => {
          body += `• ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)} · <em>${stockText(p)}</em>\n`;
        });
        body += '\n';
      } else if(mostrarAgotados){
        body += g.enCatalogo
          ? `<strong>${g.rol}:</strong> <em style="color:#ff8888">Agotado ahora mismo</em>. Avísame por WhatsApp cuando vuelve.\n\n`
          : `<strong>${g.rol}:</strong> <em style="color:#ffb347">No lo vendemos</em>. Esta pieza la pones tú o la buscamos aparte — el resto del sistema sí te lo armo.\n\n`;
      }
    }
    return body;
  }

  function _sistemaProductos(armado){
    const out = [];
    armado.grupos.forEach(g => out.push(...g.prods));
    return out;
  }

  /** Capacidad real de una batería, o null si el producto no la declara.
   *  A diferencia de R.autonomia — que asume 100Ah × 12V para poder dar
   *  igualmente una respuesta aproximada en el chat — aquí NO se inventa
   *  nada: la cotización es un papel que el cliente le enseña a un
   *  instalador, y un número supuesto ahí no se lee como estimación, se lee
   *  como dato. Sólo cuenta "Ah" escrito con esas letras: el "(75A)" del
   *  nombre de una batería de auto puede ser corriente de arranque, no
   *  capacidad, y confundirlos exagera la autonomía casi un tercio. */
  function _capacidadBateria(p){
    if(!p) return null;
    const texto = [p.nombre || ''].concat(p.specs || []).join(' ');
    const mAh = texto.match(/(\d+(?:[.,]\d+)?)\s*ah\b/i);
    const mV  = texto.match(/(\d+(?:[.,]\d+)?)\s*v\b/i);
    if(!mAh || !mV) return null;
    const ah = parseFloat(mAh[1].replace(',', '.'));
    const v  = parseFloat(mV[1].replace(',', '.'));
    if(!(ah > 0) || !(v > 0)) return null;
    return { ah: ah, v: v, wh: Math.round(ah * v) };
  }

  // Consumos de referencia para justificar la autonomía en el papel. Son los
  // mismos que usa el cálculo del chat, para que no digan cosas distintas.
  const _ESCENARIOS = [
    { nombre: 'Nevera', w: 150 },
    { nombre: 'TV + 3 bombillas LED', w: 110 },
    { nombre: 'Ventilador + 2 bombillas LED', w: 70 }
  ];

  function _fechaLarga(d){
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio',
                   'agosto','septiembre','octubre','noviembre','diciembre'];
    return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  }

  function _folio(d){
    const dosCifras = n => String(n).padStart(2, '0');
    return 'TM-' + d.getFullYear() + dosCifras(d.getMonth() + 1) + dosCifras(d.getDate()) +
           '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function _horasTexto(h){
    if(!(h > 0)) return '—';
    return h < 1 ? Math.round(h * 60) + ' min' : (h.toFixed(1).replace('.', ',') + ' h');
  }

  /** Documento HTML completo y autónomo de la propuesta técnica.
   *  Sin <script>, sin fuentes externas y sin imágenes remotas: se imprime
   *  desde el navegador tal cual, también sin conexión. */
  function cotizacionHTML(armado, notas){
    const hoy = new Date();
    const esc = escapeHtml;
    let total = 0;
    let hayFaltantes = false;

    const filas = armado.grupos.map(g => {
      const p = g.prods[0];
      if(!p){
        if(!g.opcional) hayFaltantes = true;
        // Un componente que no vendemos no es un componente agotado: en una
        // propuesta por escrito, "sin existencia" se lee como "ya vuelve".
        const motivo = (g.enCatalogo === false)
          ? 'No forma parte de nuestro catálogo — lo aporta el cliente o se busca aparte'
          : 'Sin existencia en este momento — a confirmar por WhatsApp';
        return `<tr class="sin-stock">
          <td>${esc(g.rol)}</td>
          <td colspan="4">${motivo}</td>
        </tr>`;
      }
      const subtotal = (Number(p.precio) || 0) * g.cantidad;
      if(!g.opcional) total += subtotal;
      const alt = g.prods[1]
        ? `<div class="alt">Alternativa: ${esc(g.prods[1].nombre)} — ${fmtUSD(g.prods[1].precio)}</div>`
        : '';
      const faltaStock = p.stock < g.cantidad
        ? `<div class="aviso">Quedan ${p.stock} en existencia de ${g.cantidad === 1 ? 'la unidad necesaria' : 'las ' + g.cantidad + ' necesarias'}</div>`
        : '';
      return `<tr${g.opcional ? ' class="opcional"' : ''}>
        <td>${esc(g.rol)}${g.opcional ? '<span class="tag">opcional</span>' : ''}</td>
        <td><a href="${esc(productUrl(p))}">${esc(p.nombre)}</a>${alt}${faltaStock}</td>
        <td class="num">${g.cantidad}</td>
        <td class="num">${fmtUSD(p.precio)}</td>
        <td class="num">${g.opcional ? '—' : fmtUSD(subtotal)}</td>
      </tr>`;
    }).join('\n');

    // Autonomía: sólo si alguna batería del sistema declara su capacidad.
    let bloqueAutonomia = '';
    const grupoBat = armado.grupos.find(g => g.subcat === 'BATERÍAS' && g.prods.length);
    if(grupoBat){
      const bat = grupoBat.prods[0];
      const cap = _capacidadBateria(bat);
      if(cap){
        const whBanco = cap.wh * grupoBat.cantidad;
        // Se descuenta la profundidad de descarga y el rendimiento del
        // inversor. Dar los Wh brutos como si fueran aprovechables es el
        // error clásico de estas hojas y deja al cliente a mitad de noche.
        const util = Math.round(whBanco * 0.8 * 0.85);
        const filasAut = _ESCENARIOS.map(e =>
          `<tr><td>${esc(e.nombre)}</td><td class="num">${e.w} W</td>` +
          `<td class="num">${_horasTexto(util / e.w)}</td></tr>`
        ).join('\n');
        bloqueAutonomia = `
        <section class="bloque">
          <h2>Cálculo de autonomía</h2>
          <p class="formula">
            ${esc(bat.nombre)} · ${cap.ah} Ah × ${cap.v} V = <strong>${cap.wh.toLocaleString('es-ES')} Wh</strong>
            ${grupoBat.cantidad > 1 ? ` × ${grupoBat.cantidad} unidades = <strong>${whBanco.toLocaleString('es-ES')} Wh</strong>` : ''}
          </p>
          <p class="nota">
            De esa capacidad no se aprovecha todo: se calcula sobre el
            <strong>80&nbsp;%</strong> de descarga útil (descargar por debajo acorta
            mucho la vida de la batería) y un <strong>85&nbsp;%</strong> de rendimiento
            del inversor. Energía real disponible: <strong>${util.toLocaleString('es-ES')} Wh</strong>.
          </p>
          <table class="tabla">
            <thead><tr><th>Equipo conectado</th><th class="num">Consumo</th><th class="num">Autonomía</th></tr></thead>
            <tbody>${filasAut}</tbody>
          </table>
          <p class="nota">
            Las neveras y los aires acondicionados arrancan pidiendo 3–4 veces su
            consumo normal. El inversor debe aguantar ese pico, no sólo el consumo
            continuo, o se apagará cada vez que el compresor arranque.
          </p>
        </section>`;
      } else {
        bloqueAutonomia = `
        <section class="bloque">
          <h2>Cálculo de autonomía</h2>
          <p class="nota">
            La batería seleccionada (${esc(bat.nombre)}) no declara su capacidad en
            amperios-hora, así que <strong>no se calcula la autonomía aquí</strong>:
            estimarla sin ese dato daría un número que parece medido y no lo está.
            Escríbenos por WhatsApp con el modelo exacto y te lo calculamos.
          </p>
        </section>`;
      }
    }

    const totalMN = fmtMN(total);
    const notasHTML = (notas && String(notas).trim())
      ? `<section class="bloque"><h2>Notas técnicas</h2><p>${esc(notas)}</p></section>`
      : '';

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Propuesta técnica — ${esc(armado.nombre)} — TiendaMax</title>
<style>
  :root{ --coral:#FF6A1F; --tinta:#1a1512; --suave:#6b625c; --linea:#e2ddd8; }
  *{ box-sizing:border-box; }
  body{
    margin:0; padding:32px 24px 64px;
    font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    color:var(--tinta); background:#fff;
    max-width:820px; margin-inline:auto;
  }
  h1{ font-size:25px; line-height:1.2; margin:0 0 4px; text-wrap:balance; }
  h2{ font-size:16px; margin:0 0 10px; letter-spacing:.02em; text-transform:uppercase; color:var(--coral); }
  a{ color:inherit; }
  .cab{ display:flex; justify-content:space-between; align-items:flex-start; gap:24px;
        border-bottom:3px solid var(--coral); padding-bottom:14px; margin-bottom:22px; }
  .marca{ font-size:22px; font-weight:800; letter-spacing:-.02em; }
  .marca span{ color:var(--coral); }
  .marca small{ display:block; font-size:11px; font-weight:600; letter-spacing:.14em;
                text-transform:uppercase; color:var(--suave); margin-top:3px; }
  .folio{ text-align:right; font-size:12px; color:var(--suave); white-space:nowrap; }
  .folio b{ display:block; font-size:13px; color:var(--tinta); letter-spacing:.04em; }
  .presu{ color:var(--suave); margin:0 0 24px; }
  .bloque{ margin:0 0 26px; break-inside:avoid; }
  .tabla{ width:100%; border-collapse:collapse; font-size:14px; }
  .tabla th{ text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
             color:var(--suave); border-bottom:1px solid var(--linea); padding:0 8px 7px; }
  /* Sin esto los encabezados quedan a la izquierda sobre columnas de cifras
     alineadas a la derecha: .tabla th gana por especificidad a .num. */
  .tabla th.num{ text-align:right; }
  .bloque .nota + .tabla{ margin-top:16px; }
  .tabla td{ border-bottom:1px solid var(--linea); padding:9px 8px; vertical-align:top; }
  .tabla td:first-child{ font-weight:600; width:26%; }
  .num{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .alt, .aviso{ font-size:12px; color:var(--suave); margin-top:3px; }
  .aviso{ color:#b4540f; }
  .sin-stock td{ color:var(--suave); font-style:italic; }
  .opcional td:first-child{ font-weight:500; }
  .tag{ display:inline-block; margin-left:6px; padding:1px 6px; border-radius:99px;
        background:#f1ece7; color:var(--suave); font-size:10px; font-weight:700;
        letter-spacing:.06em; text-transform:uppercase; font-style:normal; }
  .total{ display:flex; justify-content:flex-end; gap:18px; align-items:baseline;
          margin-top:14px; padding-top:12px; border-top:2px solid var(--tinta); }
  .total .cifra{ font-size:23px; font-weight:800; font-variant-numeric:tabular-nums; }
  .total .mn{ font-size:13px; color:var(--suave); }
  .formula{ font-size:16px; margin:0 0 8px; }
  .nota{ font-size:13px; color:var(--suave); margin:8px 0 0; }
  .pie{ margin-top:34px; padding-top:14px; border-top:1px solid var(--linea);
        font-size:12px; color:var(--suave); }
  .pie b{ color:var(--tinta); }
  /* Abajo y no arriba: en la esquina superior tapaba el folio y la fecha. */
  .tm-print{ position:fixed; bottom:16px; right:16px; padding:11px 18px; border:0;
             border-radius:99px; background:var(--coral); color:#fff; font:inherit;
             font-weight:700; font-size:14px; cursor:pointer;
             box-shadow:0 4px 14px rgba(0,0,0,.18); }
  @media print{
    body{ padding:0; max-width:none; font-size:12pt; }
    .tm-print{ display:none; }
    a{ text-decoration:none; }
    .bloque, tr{ break-inside:avoid; }
  }
  @page{ margin:16mm; }
</style>
</head>
<body>
<button class="tm-print" onclick="window.print()">Imprimir o guardar en PDF</button>

<header class="cab">
  <div class="marca">Tienda<span>Max</span><small>Propuesta técnica</small></div>
  <div class="folio"><b>${esc(_folio(hoy))}</b>${esc(_fechaLarga(hoy))}</div>
</header>

<h1>${esc(armado.nombre)}</h1>
<p class="presu">Rango de presupuesto de referencia: <strong>${esc(armado.presupuesto)}</strong></p>

<section class="bloque">
  <h2>Componentes</h2>
  <table class="tabla">
    <thead><tr>
      <th>Función en el sistema</th><th>Producto</th>
      <th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="total">
    <span>Total de lo disponible hoy</span>
    <span class="cifra">${fmtUSD(total)}</span>
    ${totalMN ? `<span class="mn">≈ ${esc(totalMN)}</span>` : ''}
  </div>
  <p class="nota">
    El total suma sólo los componentes obligatorios que están en existencia hoy.
    Los marcados como opcionales y los que aparecen sin existencia
    ${hayFaltantes ? '— que sí hacen falta para que el sistema funcione — ' : ''}
    quedan fuera de esa cifra.
  </p>
</section>

${bloqueAutonomia}
${notasHTML}

<footer class="pie">
  <p><b>Pedidos y consultas:</b> WhatsApp +${esc(WHATSAPP)} · ${esc(SITE_URL)}</p>
  <p>
    Precios en USD, ${esc(_fechaLarga(hoy))}. Sujetos a cambio y a existencia en el
    momento del pedido. Esta propuesta es orientativa: la instalación eléctrica
    debe revisarla un técnico calificado.
  </p>
</footer>
</body>
</html>`;
  }

  /** Abre la propuesta en una pestaña nueva, lista para imprimir o guardar
   *  en PDF con el propio navegador. Nada de librerías de PDF: en 3G cubano
   *  bajar medio mega para maquetar una hoja no se justifica, y el diálogo
   *  del sistema ya ofrece "Guardar como PDF" en Android y en iPhone. */
  function abrirCotizacion(){
    if(!_ULTIMO_SISTEMA){
      addMessageTyped(`Primero arma un sistema y te preparo la propuesta. Prueba con <em>"arma un sistema solar básico"</em>.`, 'bot');
      renderQuickReplies(['☀️ Armar sistema solar','🔒 Kit de seguridad','💬 WhatsApp']);
      return;
    }
    const html = cotizacionHTML(_ULTIMO_SISTEMA.armado, _ULTIMO_SISTEMA.notas);
    let win = null;
    try { win = window.open('', '_blank'); } catch(e){}
    if(win && win.document){
      win.document.open();
      win.document.write(html);
      win.document.close();
      addMessageTyped(`📄 Te abrí la <strong>propuesta técnica</strong> en otra pestaña. Ahí tienes el botón para <em>imprimirla o guardarla en PDF</em> y enviarla por correo.`, 'bot');
    } else {
      // Bloqueador de ventanas emergentes: en vez de perder el documento, se
      // ofrece como descarga directa, que no lo bloquea nadie.
      try {
        const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'propuesta-tiendamax.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        addMessageTyped(`📄 Tu navegador bloqueó la pestaña nueva, así que te <strong>descargué la propuesta</strong>. Ábrela y usa el botón de imprimir para guardarla en PDF.`, 'bot');
      } catch(e){
        addMessageTyped(`No pude abrir la propuesta desde aquí. Escríbeme por WhatsApp y te la mando yo mismo.`, 'bot');
      }
    }
    renderQuickReplies(['💬 WhatsApp','🆚 Comparar inversores','📦 Ver más productos']);
  }

  // Lo último que armó el cliente, para que el botón de cotizar sepa de qué
  // sistema hablar sin tener que volver a interpretar la frase original.
  let _ULTIMO_SISTEMA = null;

  // ════════════════════════════════════════════════════════════
  //  SISTEMA SOLAR COMPLETO
  // ════════════════════════════════════════════════════════════
  R.sistemaSolar = (text) => {
    const m = text.toLowerCase();
    let tamano = 'solar mediano';
    if(/\bb[aá]sico|peque[ñn]o|barato|luz|carga.*celular|solo.*celular\b/.test(m)) tamano = 'solar basico';
    else if(/\bcompleto|grande|casa completa|aire acondicionado|todo|potente\b/.test(m)) tamano = 'solar completo';

    const sis = SISTEMAS[tamano];
    let body = `☀️ <strong>${sis.nombre}</strong>\n`;
    body += `💰 <strong>Presupuesto estimado:</strong> ${sis.presupuesto}\n\n`;
    body += `📋 <strong>Componentes necesarios</strong> (todos disponibles en TiendaMax):\n\n`;

    const armado = _armarSistema(sis);
    body += _sistemaCuerpo(armado, true);

    let tip;
    if(tamano === 'solar basico'){
      tip = `Para luz y carga de celular, una batería de plomo-ácido de 50Ah basta. Si quieres conectar nevera después, ve por LiFePO4 directamente.`;
    } else if(tamano === 'solar mediano'){
      // Antes decía "6-8 horas". Salían de dividir 1200Wh entre 150W sin
      // descontar nada, y la cotización — que sí descuenta descarga útil y
      // rendimiento del inversor — daba 5,8 h en el mismo documento. Se
      // corrige aquí para que el chat y el papel no se contradigan.
      tip = `Con 100Ah a 12V tienes 1200Wh en el papel, pero descontando la descarga útil de la batería y las pérdidas del inversor cuentas con unas 5-6 horas de nevera (~150W). Inversor onda pura obligatorio para nevera.`;
    } else {
      tip = `Para casa completa necesitas inversor híbrido (carga batería con panel Y con red eléctrica). Sistema 48V es más eficiente que 12V a esta escala.`;
    }
    body += `💡 <strong>Tip de experto:</strong> ` + tip;
    body += `\n\n¿Quieres que te arme la <em>comparativa</em> de los inversores disponibles, o prefieres que te calcule la <em>autonomía</em> exacta con tus equipos?`;

    _ULTIMO_SISTEMA = { armado: armado, notas: tip };

    return {
      response: body,
      products: _sistemaProductos(armado).slice(0,4),
      quickReplies: ['📄 Descargar cotización','🆚 Comparar inversores','⏱️ Calcular autonomía','💬 WhatsApp']
    };
  };

  R.sistemaSeguridad = (text) => {
    const m = text.toLowerCase();
    const sis = SISTEMAS['seguridad casa'];
    let body = `🔒 <strong>${sis.nombre}</strong>\n`;
    body += `💰 <strong>Presupuesto estimado:</strong> ${sis.presupuesto}\n\n`;
    body += `📋 <strong>Componentes recomendados</strong> (todos disponibles):\n\n`;

    const armado = _armarSistema(sis);
    body += _sistemaCuerpo(armado, false);

    let tip;
    if(/exterior|patio|afuera|calle/.test(m)){
      tip = `Para exterior necesitas cámara con clasificación IP66 (resistente al agua) y visión nocturna. Las cámaras tipo bala son ideales para exteriores.`;
    } else if(/negocio|tienda|comercio|local/.test(m)){
      tip = `Para negocio te conviene un kit con DVR + 4-8 cámaras. Grabación 24/7 sin depender de wifi. Más caro pero más serio.`;
    } else {
      tip = `Para casa basta con 2-3 cámaras wifi (algunas con rosca E27 que instalas en segundos) + la app del celular. Si quieres sumar cerradura biométrica, mejor.`;
    }
    body += `💡 <strong>Tip de experto:</strong> ` + tip;
    body += `\n\n¿Quieres que te <em>compare las cámaras</em> disponibles, o prefieres ver <em>opciones por presupuesto</em>?`;

    _ULTIMO_SISTEMA = { armado: armado, notas: tip };

    return {
      response: body,
      products: _sistemaProductos(armado).slice(0,4),
      quickReplies: ['📄 Descargar cotización','🆚 Comparar cámaras','💬 WhatsApp','⏱️ Ver alternativas']
    };
  };

  R.sistemaInternet = (text) => {
    const m = text.toLowerCase();
    const esFinca = /\bfinca|casa de campo|zona rural|campo|monte|lejos\b/.test(m);
    const sis = esFinca ? SISTEMAS['internet finca'] : SISTEMAS['internet casa'];
    let body = `📶 <strong>${sis.nombre}</strong>\n`;
    body += `💰 <strong>Presupuesto estimado:</strong> ${sis.presupuesto}\n\n`;
    body += `📋 <strong>Componentes recomendados</strong> (todos disponibles):\n\n`;

    const armado = _armarSistema(sis);
    body += _sistemaCuerpo(armado, false);

    let tip;
    if(esFinca){
      tip = `Para finca sin fibra, un router 4G LTE con SIM de ETECSA es la solución. Velocidad depende de la señal celular en tu zona. La antena CPE exterior mejora mucho la recepción si la señal es débil.`;
    } else {
      tip = `Para casa con fibra ETECSA, necesitas router con puerto WAN Gigabit para aprovechar la velocidad. Wi-Fi 6 si tienes 10+ dispositivos, Wi-Fi 5 (AC1200) basta para menos.`;
    }
    body += `💡 <strong>Tip de experto:</strong> ` + tip;
    body += `\n\n¿Quieres que te <em>compare los routers</em>, o prefieres ver <em>qué router tiene puerto WAN</em>?`;

    _ULTIMO_SISTEMA = { armado: armado, notas: tip };

    return {
      response: body,
      products: _sistemaProductos(armado).slice(0,4),
      quickReplies: ['📄 Descargar cotización','🆚 Comparar routers','📖 Qué router tiene puerto WAN','💬 WhatsApp']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  AUTONOMÍA DE BATERÍA
  // ════════════════════════════════════════════════════════════
  R.autonomia = (text) => {
    const m = text.toLowerCase();
    // Detectar equipos mencionados (nevera, aire, ventilador, TV, etc.)
    const equiposConsumo = {
      'nevera': 150, 'refrigerador': 150,
      'aire acondicionado': 1000, 'aire': 1000, 'split': 1000,
      'ventilador': 50, 'abanico': 50,
      'tv': 80, 'televisor': 80, 'television': 80,
      'bombilla': 10, 'foco': 10, 'lampara': 10, 'luz': 10,
      'celular': 10, 'telefono': 10, 'movil': 10,
      'laptop': 60, 'computadora': 150, 'pc': 150,
      'microondas': 800, 'olla arrocera': 400, 'plancha': 1000,
      'lavadora': 500, 'bombas de agua': 300, 'bomba': 300,
    };
    let equiposDetectados = [];
    for(const [nombre, w] of Object.entries(equiposConsumo)){
      const nombreClean = cleanForMatch(nombre);
      if(cleanForMatch(text).includes(nombreClean)){
        equiposDetectados.push({nombre, w});
      }
    }
    // Si no detecta equipos, sugerir escenarios
    if(equiposDetectados.length === 0){
      return {
        response: `⏱️ <strong>Cálculo de autonomía de batería</strong>\n\nDime qué equipos vas a conectar y te calculo cuántas horas duran con cada batería. Por ejemplo:\n• <em>"cuánto dura una batería de 100Ah con mi nevera"</em>\n• <em>"cuánto aguanta una batería de 12V con TV y 3 bombillas"</em>\n\nConsumo típico (W):\n• <code>Bombilla LED: 10W</code>\n• <code>Celular (cargando): 10W</code>\n• <code>Ventilador: 50W</code>\n• <code>TV LED: 80W</code>\n• <code>Nevera: 150W (con picos de 600W al arrancar)</code>\n• <code>Aire acondicionado: 1000W</code>\n\nFórmula: <code>Horas = (Ah × V) ÷ W</code>`,
        quickReplies: ['⏱️ Nevera con batería 100Ah','⏱️ TV + 3 bombillas','📦 Ver baterías']
      };
    }
    // Buscar batería mencionada
    const bat = detectProductMentions(text).find(p => (p.subcategoria||'').toUpperCase() === 'BATERÍAS');
    let capWh = 1200; // default: 100Ah × 12V
    let batInfo = '';
    if(bat){
      // Extraer Ah y V de specs
      const specsText = (bat.specs||[]).join(' ');
      const ahMatch = specsText.match(/(\d+(?:\.\d+)?)\s*ah/i);
      const vMatch = specsText.match(/(\d+(?:\.\d+)?)\s*v/i);
      const ah = ahMatch ? parseFloat(ahMatch[1]) : 100;
      const v = vMatch ? parseFloat(vMatch[1]) : 12;
      capWh = ah * v;
      batInfo = `<strong>${escapeHtml(bat.nombre)}</strong> (${ah}Ah × ${v}V = ${capWh.toLocaleString()}Wh)\n\n`;
    } else {
      batInfo = `<strong>Batería típica de 100Ah a 12V</strong> (= 1.200Wh)\n\n`;
    }
    const totalW = equiposDetectados.reduce((s, e) => s + e.w, 0);
    const horas = capWh / totalW;
    const horasStr = horas < 1 ? `${Math.round(horas*60)} minutos` : `${horas.toFixed(1)} horas`;
    let body = `⏱️ <strong>Cálculo de autonomía</strong>\n\n`;
    body += batInfo;
    body += `<strong>Equipos detectados:</strong>\n`;
    equiposDetectados.forEach(e => {
      body += `• ${escapeHtml(e.nombre)}: ~${e.w}W\n`;
    });
    body += `\n<strong>Consumo total:</strong> ${totalW}W\n`;
    body += `<strong>Autonomía estimada:</strong> <em style="color:#2ECC71;font-weight:700">${horasStr}</em>\n\n`;
    body += `⚠️ <em>Ojo:</em> Las neveras y aires tienen pico de arranque (3-4x su consumo). El inversor debe soportar ese pico. Para nevera necesitas inversor onda pura de mínimo 1000W continuo (2000W pico).\n\n`;
    if(bat){
      body += `¿Quieres ver <em>inversores compatibles</em> o que te <em>compare baterías</em>?`;
    } else {
      body += `¿Quieres ver <em>baterías disponibles</em> con esa capacidad?`;
    }
    return {
      response: body,
      products: bat ? [bat] : PRODUCTOS.filter(p => (p.subcategoria||'').toUpperCase() === 'BATERÍAS' && p.stock > 0).slice(0,4),
      quickReplies: bat ? ['🆚 Comparar baterías','📦 Ver inversores','💬 WhatsApp'] : ['🆚 Comparar baterías','📦 Ver inversores']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  COMPATIBILIDAD
  // ════════════════════════════════════════════════════════════
  R.compatibilidad = (text) => {
    const m = text.toLowerCase();
    const mentions = detectProductMentions(text);
    const techTerms = detectTechTerms(text);

    let body = `🔌 <strong>Compatibilidad de equipos</strong>\n\n`;

    // Caso 1: router + fibra ETECSA
    if(/\brouter\b/.test(m) && /\bfibra|gpon|etecs|internet\b/.test(m)){
      const routers = PRODUCTOS.filter(p => (p.subcategoria||'').toUpperCase() === 'ROUTERS' && p.stock > 0).slice(0,4);
      body += `Para conectar un router a la fibra de ETECSA necesitas:\n• Puerto <strong>WAN</strong> en el router (todos los routers domésticos lo tienen)\n• Idealmente <strong>Gigabit</strong> (1000 Mbps) para aprovechar la velocidad de fibra\n• El cable RJ45 va de la ONT (caja de ETECSA) al puerto WAN del router\n\nRouters compatibles con fibra ETECSA:\n`;
      routers.forEach(p => {
        const hasGig = (p.specs||[]).some(s => /gigabit/i.test(s));
        body += `• <strong>${escapeHtml(p.nombre)}</strong> — ${fmtUSD(p.precio)} ${hasGig ? '✅ Gigabit' : '⚠️ Fast Ethernet'}\n`;
      });
      return {
        response: body,
        products: routers,
        quickReplies: ['🆚 Comparar estos routers','📖 Qué es WAN','💬 WhatsApp']
      };
    }

    // Caso 2: inversor + nevera/aire (con tabla de potencia detallada)
    if(/\binversor\b/.test(m) && /\bnevera|aire|electrodom|lavadora|microondas|plancha|olla|ventilador|bombilla|tv|computadora|celular\b/.test(m)){
      // Detectar equipos mencionados
      const equiposDetectados = [];
      for(const [nombre, info] of Object.entries(CONSUMO_EQUIPOS)){
        const nombreClean = cleanForMatch(nombre);
        if(cleanForMatch(text).includes(nombreClean)){
          equiposDetectados.push({nombre, ...info});
        }
      }
      const totalW = equiposDetectados.reduce((s, e) => s + e.w, 0);
      const picoMax = Math.max(...equiposDetectados.map(e => e.pico), 0);
      const invs = PRODUCTOS.filter(p => (p.subcategoria||'').toUpperCase() === 'INVERSORES' && p.stock > 0).slice(0,4);

      let body = `🔌 <strong>Compatibilidad inversor ↔ electrodomésticos</strong>\n\n`;

      if(equiposDetectados.length > 0){
        body += `<strong>Equipos que mencionas:</strong>\n`;
        equiposDetectados.forEach(e => {
          body += `• <strong>${escapeHtml(e.nombre)}</strong>: ${e.w}W consumo${e.pico > e.w ? ` (pico ${e.pico}W al arrancar)` : ''}\n`;
        });
        body += `\n<strong>Consumo total simultáneo:</strong> ${totalW}W\n`;
        body += `<strong>Pico máximo (al arrancar el más grande):</strong> ${picoMax}W\n\n`;

        // Buscar inversor que aguante el pico
        const inversoresQueSirven = invs.filter(p => {
          // Extraer potencia del nombre/specs
          const txt = ((p.nombre||'') + ' ' + (p.specs||[]).join(' ')).toLowerCase();
          const wMatch = txt.match(/(\d{3,5})\s*[kw]/);
          const w = wMatch ? parseInt(wMatch[1]) * (txt.includes('kw') ? 1000 : 1) : 0;
          return w >= picoMax;
        });

        body += `<strong>Inversores disponibles que soportan tu carga:</strong>\n`;
        if(inversoresQueSirven.length > 0){
          inversoresQueSirven.forEach(p => {
            body += `• <strong>${escapeHtml(p.nombre)}</strong> — ${fmtUSD(p.precio)}\n`;
          });
        } else {
          body += `⚠️ Ninguno de los inversores disponibles aguanta el pico de ${picoMax}W. Coordinemos por WhatsApp para conseguirte uno más potente.\n`;
        }

        body += `\n💡 <strong>Tip de experto:</strong> El inversor siempre debe soportar el <em>pico de arranque</em> (no solo el consumo continuo). Las neveras y aires triplican su consumo por 1-2 segundos al arrancar. Si tu inversor no aguanta el pico, se apaga o se quema.`;
      } else {
        // Mostrar tabla completa de potencias
        body += `Aquí tienes la <strong>tabla de potencias por inversor</strong>:\n\n`;
        INVERSOR_POTENCIA.forEach(inv => {
          body += `<strong>🔋 ${inv.potencia_w}W (${inv.kva})</strong>\n`;
          body += `   ✅ Soporta: ${inv.soporta.join(', ')}\n`;
          body += `   ❌ No aguanta: ${inv.no_soporta.join(', ')}\n`;
          body += `   🎯 Ideal para: ${inv.recomendado_para}\n\n`;
        });
        body += `Dime qué equipos quieres conectar y te calculo qué inversor necesitas exactamente.`;
      }

      return {
        response: body,
        products: invs,
        quickReplies: ['⏱️ Calcular autonomía','🆚 Comparar inversores','💬 WhatsApp']
      };
    }

    // Caso 3: cámara + wifi
    if(/\bc[aá]mara\b/.test(m) && /\bwifi|internet|red\b/.test(m)){
      body += `Las cámaras wifi necesitan:\n• Red wifi 2.4 GHz (la mayoría no soporta 5 GHz)\n• Cobertura wifi decente donde vas a poner la cámara\n• App del fabricante (V380 Pro, Tuya, etc.)\n• Corriente 24/7 (algunas con batería, otras con cable)\n\nTip: si la cámara queda lejos del router, mejor usa un repetidor wifi o una cámara con antena direccional.`;
      const cams = PRODUCTOS.filter(p => (p.subcategoria||'').toUpperCase() === 'CÁMARAS' && p.stock > 0).slice(0,4);
      return {
        response: body,
        products: cams,
        quickReplies: ['🆚 Comparar cámaras','📦 Ver repetidores','💬 WhatsApp']
      };
    }

    // Caso genérico
    if(mentions.length > 0){
      const p = mentions[0];
      body += `Sobre <strong>${escapeHtml(p.nombre)}</strong>:\n\nPara decirte si es compatible necesito más info. ¿Con qué equipo lo quieres conectar? ¿Cuál es tu setup actual?`;
      return {
        response: body,
        quickReplies: ['💬 WhatsApp','📦 Ver productos']
      };
    }

    body += `Dime qué equipos quieres conectar y te digo si son compatibles. Por ejemplo:\n• <em>"este router funciona con la fibra de ETECSA"</em>\n• <em>"este inversor sirve para mi nevera"</em>\n• <em>"esta cámara funciona con mi wifi"</em>`;
    return {
      response: body,
      quickReplies: ['📦 Ver productos','💬 WhatsApp']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  COMPARACIÓN TECNOLÓGICA (no de productos)
  // ════════════════════════════════════════════════════════════
  R.comparacionTecnologica = (text) => {
    const techKeys = detectTechTerms(text);
    if(techKeys.length < 2) return R.fallback(text);
    const t1 = techKeys[0];
    const t2 = techKeys[1];
    const k1 = KNOWLEDGE[t1];
    const k2 = KNOWLEDGE[t2];
    if(!k1 || !k2) return R.fallback(text);

    let body = `🆚 <strong>${k1.term} vs ${k2.term}</strong>\n\n`;
    body += `<strong>${k1.term}:</strong>\n${k1.what}\n<em>¿Para qué?</em> ${k1.why}\n\n`;
    body += `<strong>${k2.term}:</strong>\n${k2.what}\n<em>¿Para qué?</em> ${k2.why}\n\n`;

    // Veredicto contextual
    let verdict = '';
    if(t1 === 'wifi 6' && t2 === 'wifi 5'){
      verdict = `🥇 <strong>Wi-Fi 6 es superior</strong> si tienes muchos dispositivos o planeas mantener el router 5+ años. <strong>Wi-Fi 5 basta</strong> si tienes pocos dispositivos y quieres ahorrar.`;
    } else if(t1 === 'ondas pura' && t2 === 'onda modificada'){
      verdict = `🥇 <strong>Onda pura siempre</strong> para nevera, aire, TV LED, equipo médico. <strong>Onda modificada</strong> solo para ventilador, bombilla, cargador de celular.`;
    } else if(t1 === 'mppt' && t2 === 'pwm'){
      verdict = `🥇 <strong>MPPT es mejor</strong> si tu panel es > 100W (aprovechas 20-30% más energía). <strong>PWM basta</strong> para sistemas pequeños y baratos.`;
    } else if(t1 === 'lifepo4' && (t2 === 'plomo acido' || t2 === 'litio')){
      verdict = `🥇 <strong>LiFePO4 es lo mejor</strong> si tienes presupuesto: 6000 ciclos vs 500 de plomo-ácido. <strong>Plomo-ácido</strong> es más barata al inicio pero se daña con descarga profunda.`;
    } else if((t1 === 'gigabit' && t2 === 'fast ethernet') || (t2 === 'gigabit' && t1 === 'fast ethernet')){
      verdict = `🥇 <strong>Gigabit (1000 Mbps)</strong> si tienes fibra o copias archivos entre equipos. <strong>Fast Ethernet (100 Mbps)</strong> basta para internet de menos de 100 Mbps.`;
    } else {
      verdict = `La elección depende de tu caso de uso. ¿Me cuentas qué necesitas y te recomiendo?`;
    }
    body += `<strong>Mi veredicto:</strong> ${verdict}`;

    // Productos relacionados con cada tecnología
    const prodsT1 = findProductsByTechSpec([t1], 2);
    const prodsT2 = findProductsByTechSpec([t2], 2);
    const products = [...prodsT1, ...prodsT2].slice(0, 4);

    if(products.length > 0){
      body += `\n\n📦 Productos relacionados disponibles:`;
    }

    return {
      response: body,
      products: products,
      quickReplies: ['🆚 Comparar dos productos','📦 Ver categorías','💬 WhatsApp']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  DETALLE DE PRODUCTO (con accesorios sugeridos)
  // ════════════════════════════════════════════════════════════
  R.detalle = (text) => {
    const m = text.toLowerCase();
    // PRIMERO: detectar si el usuario pide un tipo de producto genérico
    // ("panel solar", "inversor", "batería", etc.) sin nombre específico.
    // En ese caso, mostrar lista de productos del tipo + accesorios sugeridos.
    // Esto evita que findProduct('panel solar') devuelva una cámara con "solar" en specs.
    let subcatDetectada = null;
    if(/panel solar|placa solar/.test(m)) subcatDetectada = 'PANELES SOLARES';
    else if(/inversor/.test(m) && !/inversor.*(de|con|para)/.test(m)) subcatDetectada = 'INVERSORES';
    else if(/\bbater[ií]a\b/.test(m) && !/bater[ií]a.*(de|con|para)/.test(m)) subcatDetectada = 'BATERÍAS';
    else if(/controlador/.test(m)) subcatDetectada = 'CONTROLADORES SOLARES';
    else if(/cargador/.test(m)) subcatDetectada = 'CARGADORES';
    else if(/\bc[aá]mara|camaras|cameras\b/.test(m) && !/c[aá]mara.*(de|con|para|web)/.test(m)) subcatDetectada = 'CÁMARAS';
    else if(/alarma/.test(m)) subcatDetectada = 'ALARMAS';
    else if(/cerradura/.test(m)) subcatDetectada = 'CERRADURAS';
    else if(/router/.test(m)) subcatDetectada = 'ROUTERS';
    else if(/switch/.test(m)) subcatDetectada = 'SWITCHES';

    const esGenerico = /háblame|dime|inf[oó]rmame|quiero saber|mu[eé]strame|detalles?|sobre|cu[eé]ntame/.test(m);
    // IMPORTANTE: si hay un producto específico mencionado por nombre, NO tratar como genérico
    const mentionsEspecificas = detectProductMentions(text);
    if(subcatDetectada && esGenerico && mentionsEspecificas.length === 0){
      const disp = PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === subcatDetectada && x.stock > 0).slice(0,4);
      const agotados = PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === subcatDetectada && x.stock === 0);
      if(disp.length > 0 || agotados.length > 0){
        const accesorios = ACCESORIOS_AUTOMATICOS[subcatDetectada];
        let body = `📦 <strong>${subcatDetectada}</strong> — Tenemos <em>${disp.length} disponible(s)</em>${agotados.length > 0 ? ` y ${agotados.length} agotado(s)` : ''}:\n\n`;
        if(disp.length > 0){
          disp.forEach((prod, i) => {
            body += `<strong>${i+1}.</strong> ${escapeHtml(prod.nombre)} — ${fmtUSD(prod.precio)} · <em>${stockText(prod)}</em>\n`;
          });
        }
        if(accesorios){
          body += `\n🔧 <strong>Para armar completo necesitas también:</strong>\n`;
          accesorios.forEach(a => {
            if(a.subcat){
              const dispAcc = PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === a.subcat && x.stock > 0).slice(0,1);
              if(dispAcc.length > 0){
                body += `• <strong>${a.que}</strong> (${a.por}) — desde ${fmtUSD(dispAcc[0].precio)}\n`;
              } else {
                body += `• <strong>${a.que}</strong> (${a.por}) — <em>agotado</em>\n`;
              }
            } else {
              body += `• <strong>${a.que}</strong> (${a.por})\n`;
            }
          });
        }
        body += `\n¿Quieres que te muestre la ficha completa de alguno, o que te arme un sistema?`;
        return {
          response: body,
          products: disp,
          quickReplies: ['🆚 Comparar dos de estos','☀️ Armar sistema','💬 WhatsApp']
        };
      }
      // Si es PANELES SOLARES pero no hay disponibles (no vendemos paneles todavía)
      if(subcatDetectada === 'PANELES SOLARES'){
        const relacionados = PRODUCTOS.filter(x => x.categoria === 'ENERGIA' && x.stock > 0).slice(0,4);
        let body = `☀️ <strong>Paneles solares</strong>\n\nEn este momento no tenemos paneles solares en catálogo. Pero para armar un sistema solar te puedo ofrecer los demás componentes disponibles:\n\n`;
        relacionados.forEach((p,i) => {
          body += `<strong>${i+1}.</strong> ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)} · <em>${stockText(p)}</em>\n`;
        });
        body += `\n💡 <em>Tip:</em> Para un sistema solar necesitas panel (externo) + controlador MPPT + batería + inversor. Si tienes un panel de otro lado, te armo el resto del sistema.\n\n¿Quieres que te <em>arme un sistema completo</em> con lo disponible, o te <em>explico cómo funciona cada componente</em>?`;
        return {
          response: body,
          products: relacionados,
          quickReplies: ['☀️ Armar sistema solar','📖 Qué es MPPT','💬 WhatsApp']
        };
      }
    }

    // Si no es genérico, buscar producto específico
    const mentions = detectProductMentions(text);
    let p = null;
    if(mentions.length === 1){
      p = mentions[0];
    } else if(mentions.length >= 2){
      // Si hay múltiples menciones (ej: "háblame del router Tenda" → varios modelos Tenda),
      // listarlos y preguntar cuál quiere ver
      const disponibles = mentions.filter(x => x.stock > 0);
      const lista = disponibles.length > 0 ? disponibles : mentions;
      // El contador iba sobre `mentions` pero la lista pintada es `lista`
      // (solo los disponibles): decía "3 productos" y enseñaba 2.
      const muestra = lista.slice(0,4);
      let body = `📦 Encontré <em>${lista.length} producto${lista.length>1?'s':''}</em> que coinciden. Dime cuál te interesa:\n\n`;
      muestra.forEach((prod, i) => {
        body += `<strong>${i+1}.</strong> ${escapeHtml(prod.nombre)} — ${fmtUSD(prod.precio)} · <em>${stockText(prod)}</em>\n`;
      });
      if(lista.length > muestra.length) body += `\n<em>…y ${lista.length - muestra.length} más. Afina el nombre y te los saco todos.</em>\n`;
      body += `\nToca cualquiera para ver la ficha completa, o dime el nombre específico.`;
      return {
        response: body,
        products: muestra,
        // Con el prefijo "Ver ficha" el chip cae en el caso que abre la ficha;
        // sin él acababa en una búsqueda difusa por texto.
        quickReplies: muestra.slice(0,3).map(x => '📦 Ver ficha ' + (x.nombre.length > 28 ? x.nombre.slice(0,28) + '…' : x.nombre))
      };
    }
    if(!p){
      p = findProduct(text, {includeAgotados:true});
      if(!p) return R.fallback(text);
    }
    return buildDetalle(p, text);
  };

  function buildDetalle(p, originalQuery){
    _context.lastProduct = p;
    const agotado = p.stock === 0;
    const enOferta = p.precioOriginal > 0 && p.precioOriginal > p.precio;
    const usado = p.usado;
    let body = `📦 <strong>${escapeHtml(p.nombre)}</strong>\n\n`;
    body += `💰 <strong>Precio:</strong> ${fmtUSD(p.precio)} USD · <em>${fmtMN(p.precio)}</em>\n`;
    if(enOferta){
      const off = Math.round((1 - p.precio/p.precioOriginal)*100);
      body += `🔥 <em>Oferta:</em> antes ${fmtUSD(p.precioOriginal)} (-${off}%)\n`;
    }
    body += `📂 <strong>Categoría:</strong> ${catIcon(p.categoria)} ${p.categoria}` + (p.subcategoria ? ` › ${p.subcategoria}` : '') + '\n';
    body += `📦 <strong>Stock:</strong> ${stockText(p)}\n`;
    if(usado) body += `♻️ <em>Producto usado en buen estado</em>\n`;
    if(p.garantia) body += `🛡️ <strong>Garantía:</strong> ${escapeHtml(p.garantia)}\n`;
    if(p.devolucion) body += `↩️ Acepta devolución\n`;
    if(p.specs && p.specs.length > 0){
      body += `\n📋 <strong>Ficha técnica:</strong>\n`;
      p.specs.forEach(s => { body += `• ${escapeHtml(s)}\n`; });
    }
    if(p.descripcion){
      const descCorta = p.descripcion.length > 400 ? p.descripcion.slice(0,400) + '…' : p.descripcion;
      body += `\n📝 ${escapeHtml(descCorta)}\n`;
    }

    // Detectar términos técnicos en specs del producto y explicarlos
    const techEnSpecs = detectTechTerms((p.specs||[]).join(' '));
    if(techEnSpecs.length > 0){
      body += `\n📖 <strong>¿Qué significan estos términos?</strong>\n`;
      techEnSpecs.slice(0,2).forEach(k => {
        const info = KNOWLEDGE[k];
        if(info){
          body += `• <strong>${info.term}:</strong> ${info.what.slice(0,120)}${info.what.length > 120 ? '…' : ''}\n`;
        }
      });
    }

    // Sugerir accesorios automáticamente
    const subcat = (p.subcategoria||'').toUpperCase();
    const accesorios = ACCESORIOS_AUTOMATICOS[subcat];
    if(accesorios && !agotado){
      body += `\n🔧 <strong>Para armar completo necesitas también:</strong>\n`;
      accesorios.forEach(a => {
        if(a.subcat){
          const dispAcc = PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === a.subcat && x.stock > 0).slice(0,1);
          if(dispAcc.length > 0){
            body += `• <strong>${a.que}</strong> (${a.por}) — desde ${fmtUSD(dispAcc[0].precio)}\n`;
          } else {
            body += `• <strong>${a.que}</strong> (${a.por}) — <em>agotado</em>\n`;
          }
        } else {
          body += `• <strong>${a.que}</strong> (${a.por})\n`;
        }
      });
    }

    if(agotado){
      // Las opiniones también van aquí: hoy los tres productos reseñados
      // están agotados, y esa prueba social es justo lo que convence de
      // esperar a que vuelva en vez de irse.
      body += bloqueResenas(p);
      body += `\n⚠️ <em>Este producto está agotado ahora mismo.</em> Pero tengo alternativas similares disponibles:`;
      const alt = findAlternativas(p, 3);
      return {
        response: body,
        products: alt,
        quickReplies: alt.length > 0 ? ['🆚 Comparar dos de estos','❤️ Añadir a deseos','💬 WhatsApp'] : ['❤️ Añadir a deseos','💬 WhatsApp','📦 Ver categorías']
      };
    }

    body += bloqueResenas(p);
    body += `\n¿Quieres que <em>te lo compare con otro similar</em>, te calcule la <em>autonomía</em>, o veas <em>alternativas</em>?`;
    const qrs = ['🛒 Pedir por WhatsApp','🛍️ Añadir al carrito','👁️ Ver en la tienda','🆚 Comparar con otro','📦 Ver alternativas',
                 (isInWishlist(p.id) ? '💔 Quitar de deseos' : '❤️ Añadir a deseos')];
    if(subcat === 'BATERÍAS') qrs.splice(1, 0, '⏱️ Calcular autonomía');
    if(subcat === 'INVERSORES') qrs.splice(1, 0, '⏱️ Autonomía con nevera');
    return {
      response: body,
      products: [p],
      quickReplies: qrs
    };
  }

  function findAlternativas(p, n=3){
    return PRODUCTOS
      .filter(x => x.categoria === p.categoria && (x.subcategoria||'') === (p.subcategoria||'') && x.id !== p.id && x.stock > 0)
      .sort((a,b) => Math.abs(a.precio - p.precio) - Math.abs(b.precio - p.precio))
      .slice(0, n);
  }

  // ════════════════════════════════════════════════════════════
  //  COMPARACIÓN DE PRODUCTOS (estricta por subcategoría)
  // ════════════════════════════════════════════════════════════
  R.comparacion = (text) => {
    let mentions = detectProductMentions(text);
    // Split por: vs, versus, contra, mejor que, "o", "con", "y" (cuando hay "compara" en el texto)
    const isCompareQuery = /compara|comparar/i.test(text);
    const splitPattern = isCompareQuery
      ? /\s+(?:vs|versus|contra|mejor que)\s+|\s+o\s+(?:el|la|los|las)?\s+|\s+con\s+(?:el|la|los|las)?\s+|\s+y\s+(?:el|la|los|las)?\s+/i
      : /\s+(?:vs|versus|contra|mejor que)\s+|\s+o\s+(?:el|la|los|las)?\s+/i;
    const parts = text.split(splitPattern).filter(s => s.trim().length > 2);
    if(mentions.length < 2 && parts.length >= 2){
      const ps = parts.map(part => findProduct(part, {includeAgotados:true})).filter(Boolean);
      if(ps.length >= 2) mentions = ps.slice(0,2);
    }
    if(mentions.length < 2){
      if(mentions.length === 1){
        // Buscar alternativas de la misma subcategoría para sugerir comparación
        const subcat = mentions[0].subcategoria;
        if(subcat){
          const sim = PRODUCTOS.filter(p => (p.subcategoria||'') === subcat && p.id !== mentions[0].id && p.stock > 0).slice(0,3);
          if(sim.length >= 1){
            // Ya sabemos el primero: solo falta que toque el segundo.
            return { elegirRival: mentions[0] };
          }
        }
      }
      // Si el texto ya apunta a un tipo concreto ("compara los routers"), se
      // ofrecen esos para elegir. Escribir los nombres completos a mano era
      // pedirle demasiado al cliente.
      const subPedida = _detectarSubcategoria(text);
      const catPedida = _detectarCategoriaPedida(text);
      let candidatos = [];
      if(subPedida) candidatos = PRODUCTOS.filter(p => p.subcategoria === subPedida && p.stock > 0);
      else if(catPedida) candidatos = PRODUCTOS.filter(p => p.categoria === catPedida && p.stock > 0);
      if(candidatos.length >= 2){
        return { elegirComparar: candidatos.sort((a,b) => a.precio - b.precio),
                 tituloComparar: 'Esto es lo que tengo en ' + String(subPedida || catPedida) };
      }
      return {
        response: `🆚 Con gusto. <strong>Solo comparo productos del mismo tipo</strong> (router con router, batería con batería), que es cuando la comparativa sirve de algo.\n\nDime de qué tipo quieres y te enseño los que hay para que <em>elijas cuáles</em>:`,
        quickReplies: ['🆚 Comparar routers','🆚 Comparar baterías','🆚 Comparar cámaras','🆚 Comparar inversores','📦 Ver categorías']
      };
    }

    // Respetar el ORDEN EN QUE EL CLIENTE LOS NOMBRÓ. detectProductMentions
    // devuelve por puntuación, así que "compara A vs B" podía pintar B en la
    // primera columna y A en la segunda: uno pide una cosa y ve otra.
    let p1 = mentions[0];
    let p2 = mentions[1];
    (function(){
      const t = cleanForMatch(text);
      const pos = pr => {
        const n = cleanForMatch(pr.nombre);
        let i = t.indexOf(n);
        if(i !== -1) return i;
        // El nombre completo puede no estar literal: se usa su palabra más
        // distintiva (la más larga) como ancla.
        const w = n.split(' ').filter(x => x.length > 3).sort((a,b) => b.length - a.length)[0];
        return w ? t.indexOf(w) : -1;
      };
      const i1 = pos(p1), i2 = pos(p2);
      if(i1 !== -1 && i2 !== -1 && i2 < i1){ const tmp = p1; p1 = p2; p2 = tmp; }
    })();

    // Verificación estricta: deben ser del mismo tipo
    const coherencia = sonComparables(p1, p2);
    if(!coherencia.ok){
      let body = `🤔 <strong>Espera, esos dos no son del mismo tipo.</strong>\n\n`;
      if(coherencia.reason === 'subcategoria_diferente'){
        body += `<strong>${escapeHtml(p1.nombre)}</strong> es <em>${p1.subcategoria}</em> y <strong>${escapeHtml(p2.nombre)}</strong> es <em>${p2.subcategoria}</em> (ambos en ${p1.categoria}, pero cosas diferentes). Es como comparar un cargador con una batería: cada uno hace algo distinto.\n\n`;
      } else {
        body += `<strong>${escapeHtml(p1.nombre)}</strong> es <em>${p1.categoria}</em> y <strong>${escapeHtml(p2.nombre)}</strong> es <em>${p2.categoria}</em>. Es como comparar un televisor con una bicicleta: cada uno tiene su uso.\n\n`;
      }
      body += `Solo comparo <strong>productos del mismo tipo</strong> para que la comparativa te sea útil. Mejor dime: ¿cuál de los dos necesitas? Te muestro alternativas <em>del mismo tipo</em>:\n\n`;

      const sub1 = (p1.subcategoria||'').toUpperCase();
      const sub2 = (p2.subcategoria||'').toUpperCase();
      const alt1 = sub1 ? PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === sub1 && x.id !== p1.id && x.stock > 0).slice(0,2) : [];
      const alt2 = sub2 ? PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === sub2 && x.id !== p2.id && x.stock > 0).slice(0,2) : [];

      if(alt1.length > 0){
        body += `<strong>Si te interesa ${sub1}:</strong>\n`;
        alt1.forEach(p => { body += `• ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)}\n`; });
      }
      if(alt2.length > 0){
        body += `\n<strong>Si te interesa ${sub2}:</strong>\n`;
        alt2.forEach(p => { body += `• ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)}\n`; });
      }
      body += `\n¿Cuál de los dos tipos te sirve? Te armo la comparativa con dos del mismo tipo.`;
      return {
        response: body,
        products: [...alt1, ...alt2].slice(0,4),
        quickReplies: [
          ...(alt1.length > 0 ? ['🆚 Comparar 2 ' + sub1.toLowerCase()] : []),
          ...(alt2.length > 0 ? ['🆚 Comparar 2 ' + sub2.toLowerCase()] : []),
          '💬 WhatsApp'
        ]
      };
    }

    return buildComparacion(p1, p2);
  };

  /* ── Características REALES, no "Spec 1 vs Spec 1" ──
     La tabla comparaba specs[0] contra specs[0] por POSICIÓN. Como cada
     ficha lista lo suyo en el orden que le dio la gana, se acababan
     enfrentando cosas que no tienen nada que ver: "Libre (Multibanda)"
     contra "WiFi de Largo Alcance" bajo el rótulo "Spec 2", como si fueran
     la misma característica medida en dos productos.

     Ahora se extraen atributos con significado (potencia en W, capacidad en
     Ah, estándar Wi-Fi, resolución, tipo de onda, MPPT vs PWM, química de
     la batería…) del nombre + las specs + la descripción, y se emparejan
     por atributo. Solo se compara lo que ambos declaran; lo que solo tiene
     uno se muestra igual, pero sin fingir que el otro "pierde".

     Los patrones se validaron contra el catálogo real antes de entrar. */
  const COMP_ATRIBUTOS = [
    { id:'wifi_std', label:'Wi-Fi',
      re:/\bwi-?fi\s*(\d)\b|\b802\.11\s*(ax|ac|n)\b|\b(ax|ac)\s*\d{3,4}\b/i,
      val:m=>{ const g=(m[1]||m[2]||m[3]||'').toLowerCase();
        if(g==='6'||g==='ax') return {n:6, t:'Wi-Fi 6 (ax)'};
        if(g==='5'||g==='ac') return {n:5, t:'Wi-Fi 5 (ac)'};
        if(g==='4'||g==='n')  return {n:4, t:'Wi-Fi 4 (n)'};
        return null; }, mas:true },
    { id:'wifi_vel', label:'Velocidad Wi-Fi', re:/\b(?:ac|ax)\s*(\d{3,4})\b/i,
      val:m=>({n:+m[1], t:m[1]+' Mbps'}), mas:true },
    { id:'potencia', label:'Potencia', re:/(\d+(?:[.,]\d+)?)\s*(k)?\s*w(?:atts?|\b)/i,
      val:m=>{ const n=parseFloat(m[1].replace(',','.'))*(m[2]?1000:1);
        return n>0 && n<=100000 ? {n, t: n>=1000 ? (n/1000).toString().replace(/\.0$/,'')+' kW' : n+' W'} : null; }, mas:true },
    { id:'capacidad', label:'Capacidad', re:/(\d+(?:[.,]\d+)?)\s*a\s*h\b/i,
      val:m=>({n:parseFloat(m[1].replace(',','.')), t:m[1]+' Ah'}), mas:true },
    { id:'mah', label:'Batería', re:/(\d{3,6})\s*m\s*ah\b/i, val:m=>({n:+m[1], t:(+m[1]).toLocaleString('es-ES')+' mAh'}), mas:true },
    { id:'voltaje', label:'Voltaje', re:/(\d+(?:[.,]\d+)?)\s*v(?:olt|\b)/i,
      val:m=>{ const n=parseFloat(m[1].replace(',','.')); return n>0&&n<=1000?{n, t:m[1]+'V'}:null; }, mas:null },
    { id:'amperaje', label:'Amperaje', re:/(\d+(?:[.,]\d+)?)\s*a(?:mp|mperes?|\b)(?!h)/i,
      val:m=>{ const n=parseFloat(m[1].replace(',','.')); return n>0&&n<=500?{n, t:m[1]+'A'}:null; }, mas:true },
    { id:'resolucion', label:'Resolución', re:/\b(4k|2k|1440p|1080p|720p|ultra\s*hd|full\s*hd)\b/i,
      val:m=>{ const s=m[1].toLowerCase().replace(/\s+/g,' ');
        const tab={'4k':2160,'ultra hd':2160,'2k':1440,'1440p':1440,'1080p':1080,'full hd':1080,'720p':720};
        return {n:tab[s]||0, t:m[1].toUpperCase()}; }, mas:true },
    { id:'megapixel', label:'Megapíxeles', re:/(\d+(?:[.,]\d+)?)\s*mp\b/i,
      val:m=>({n:parseFloat(m[1].replace(',','.')), t:m[1]+' MP'}), mas:true },
    { id:'puertos', label:'Puertos', re:/\b(gigabit|10\/100\/1000|fast\s*ethernet|10\/100)\b/i,
      val:m=>{ const g=/gigabit|1000/i.test(m[1]); return {n:g?1000:100, t:g?'Gigabit (1000 Mbps)':'Fast Ethernet (100 Mbps)'}; }, mas:true },
    { id:'bandas', label:'Bandas', re:/\b(doble\s*banda|dual\s*band|tri\s*banda|2\.4\s*ghz|5\s*ghz)\b/i,
      val:m=>{ const s=m[1].toLowerCase(); if(/tri/.test(s)) return {n:3,t:'Triple banda'};
        if(/doble|dual/.test(s)) return {n:2,t:'Doble banda (2.4 + 5 GHz)'};
        return /5/.test(s)?{n:2,t:'5 GHz'}:{n:1,t:'2.4 GHz'}; }, mas:true },
    { id:'onda', label:'Tipo de onda', re:/\b(onda[s]?\s*pura|senoidal\s*pura|pure\s*sine|onda\s*modificada|onda\s*cuadrada)\b/i,
      val:m=>/pura|pure|senoidal/i.test(m[1])?{n:2,t:'Onda pura (senoidal)'}:{n:1,t:'Onda modificada'}, mas:true },
    { id:'controlador', label:'Controlador', re:/\b(mppt|pwm)\b/i,
      val:m=>/mppt/i.test(m[1])?{n:2,t:'MPPT (más eficiente)'}:{n:1,t:'PWM'}, mas:true },
    { id:'quimica', label:'Química', re:/\b(lifepo4|litio\s*hierro|li-?ion|litio|plomo[\s-]*[aá]cido|agm|gel)\b/i,
      val:m=>{ const s=m[1].toLowerCase();
        if(/lifepo4|hierro/.test(s)) return {n:3,t:'LiFePO4 (más vida útil)'};
        if(/litio|ion/.test(s)) return {n:2,t:'Litio'};
        return {n:1,t:'Plomo-ácido'}; }, mas:true },
    { id:'nocturna', label:'Visión nocturna', re:/\b(visi[oó]n\s*nocturna|infrarroj|night\s*vision)\b/i,
      val:()=>({n:1,t:'Sí'}), mas:true },
    { id:'almacen', label:'Almacenamiento', re:/(\d+)\s*(gb|tb)\b/i,
      val:m=>({n:+m[1]*(/tb/i.test(m[2])?1024:1), t:m[1]+m[2].toUpperCase()}), mas:true },
    { id:'movil', label:'Red móvil', re:/\b(5g|4g\s*lte|4g|lte|3g)\b/i,
      val:m=>{ const s=m[1].toLowerCase(); return {n:/5g/.test(s)?5:/4g|lte/.test(s)?4:3, t:m[1].toUpperCase()}; }, mas:true },
    { id:'antenas', label:'Antenas', re:/(\d+)\s*antenas?\b/i, val:m=>({n:+m[1], t:m[1]+' antenas'}), mas:true },
    { id:'mimo', label:'MU-MIMO', re:/\b(mu-?\s?mimo)\b/i, val:()=>({n:1,t:'Sí'}), mas:true },
    { id:'poe', label:'PoE', re:/\b(poe|power\s*over\s*ethernet)\b/i, val:()=>({n:1,t:'Sí'}), mas:true },
    { id:'pantalla', label:'Pantalla', re:/\b(pantalla\s*lcd|lcd|display)\b/i, val:()=>({n:1,t:'Sí'}), mas:true },
    { id:'alcance', label:'Alcance', re:/(\d+)\s*(?:m|metros)\s*(?:de\s*)?(?:alcance|cobertura|distancia)/i,
      val:m=>({n:+m[1], t:m[1]+' m'}), mas:true },
  ];

  function extraerAtributos(p){
    const texto = [p.nombre, (p.specs||[]).join(' · '), p.descripcion||''].join(' · ');
    const out = {};
    COMP_ATRIBUTOS.forEach(a=>{
      const m = texto.match(a.re);
      if(!m) return;
      const v = a.val(m);
      if(v) out[a.id] = { ...v, label:a.label, mas:a.mas };
    });
    return out;
  }

  function buildComparacion(p1, p2){
    const rows = [];
    rows.push({label:'Producto', v1:p1.nombre, v2:p2.nombre, img1:p1.imagen, img2:p2.imagen, isHeader:true});

    // ─── FILA 1: Precio ───
    const precioGanador = p1.precio < p2.precio ? 1 : (p2.precio < p1.precio ? 2 : 0);
    rows.push({label:'Precio USD', v1:fmtUSD(p1.precio), v2:fmtUSD(p2.precio), v1MN:fmtMN(p1.precio), v2MN:fmtMN(p2.precio), winner:precioGanador, lowerBetter:true});

    // ─── FILA 2: Diferencia de precio ───
    const diff = Math.abs(p1.precio - p2.precio);
    const diffPct = Math.round((diff / Math.max(p1.precio, p2.precio)) * 100);
    if(diff > 0){
      const masBarato = p1.precio < p2.precio ? p1 : p2;
      rows.push({
        label:'Diferencia',
        v1: p1.precio < p2.precio ? `${diffPct}% más barato` : `${diffPct}% más caro`,
        v2: p2.precio < p1.precio ? `${diffPct}% más barato` : `${diffPct}% más caro`,
        winner: p1.precio < p2.precio ? 1 : 2,
        lowerBetter:true
      });
    }

    // ─── FILA 3: Oferta ───
    const enOferta1 = p1.precioOriginal > 0 && p1.precioOriginal > p1.precio;
    const enOferta2 = p2.precioOriginal > 0 && p2.precioOriginal > p2.precio;
    if(enOferta1 || enOferta2){
      const off1 = enOferta1 ? Math.round((1 - p1.precio/p1.precioOriginal)*100) : 0;
      const off2 = enOferta2 ? Math.round((1 - p2.precio/p2.precioOriginal)*100) : 0;
      rows.push({
        label:'Oferta',
        v1: enOferta1 ? `-${off1}% (era ${fmtUSD(p1.precioOriginal)})` : 'Sin oferta',
        v2: enOferta2 ? `-${off2}% (era ${fmtUSD(p2.precioOriginal)})` : 'Sin oferta',
        winner: off1 > off2 ? 1 : (off2 > off1 ? 2 : 0)
      });
    }

    // ─── FILA 4: Stock ───
    rows.push({
      label:'Disponibilidad',
      v1: p1.stock===0 ? '❌ Agotado' : (p1.stock<=3 ? `⚠️ Solo ${p1.stock} u` : `✅ ${p1.stock} u`),
      v2: p2.stock===0 ? '❌ Agotado' : (p2.stock<=3 ? `⚠️ Solo ${p2.stock} u` : `✅ ${p2.stock} u`),
      winner: p1.stock>0 && p2.stock===0 ? 1 : (p2.stock>0 && p1.stock===0 ? 2 : (p1.stock>p2.stock?1:(p2.stock>p1.stock?2:0)))
    });

    // ─── FILA 5: Categoría ───
    rows.push({label:'Categoría', v1: (catIcon(p1.categoria)+' '+p1.categoria), v2:(catIcon(p2.categoria)+' '+p2.categoria)});

    // ─── FILA 6: Tipo ───
    if(p1.subcategoria || p2.subcategoria) rows.push({label:'Tipo', v1:p1.subcategoria||'—', v2:p2.subcategoria||'—'});

    // ─── FILA 7: características emparejadas por significado ───
    const a1 = extraerAtributos(p1), a2 = extraerAtributos(p2);
    const claves = COMP_ATRIBUTOS.map(a => a.id).filter(id => a1[id] || a2[id]);
    claves.forEach(id => {
      const x = a1[id], y = a2[id];
      const etiqueta = (x || y).label;
      let ganador;
      if(x && y && x.mas === true && x.n !== y.n) ganador = x.n > y.n ? 1 : 2;
      else if(x && !y) ganador = 1;          // solo uno lo declara
      else if(y && !x) ganador = 2;
      else ganador = 0;
      rows.push({ label: etiqueta, v1: x ? x.t : '—', v2: y ? y.t : '—', winner: ganador });
    });

    // Lo que no encajó en ningún atributo se enseña tal cual, en su propia
    // fila para cada producto: es información útil, pero enfrentarla entre
    // sí sería inventar una comparación que no existe.
    const sueltas = p => (p.specs||[]).filter(sp => !COMP_ATRIBUTOS.some(a => a.re.test(String(sp))));
    const s1s = sueltas(p1), s2s = sueltas(p2);
    if(s1s.length || s2s.length){
      rows.push({ label:'Otras', v1: s1s.join(' · ') || '—', v2: s2s.join(' · ') || '—', winner: 0 });
    }

    // ─── FILA 8: Garantía ───
    if(p1.garantia || p2.garantia){
      rows.push({label:'Garantía', v1:p1.garantia||'Estándar', v2:p2.garantia||'Estándar'});
    }

    // ─── FILA 9: Condición ───
    if(p1.usado || p2.usado){
      rows.push({
        label:'Condición',
        v1: p1.usado ? '♻️ Usado' : '✨ Nuevo',
        v2: p2.usado ? '♻️ Usado' : '✨ Nuevo',
        winner: p1.usado && !p2.usado ? 2 : (p2.usado && !p1.usado ? 1 : 0)
      });
    }

    // Antes había aquí una fila "Relación specs/$" que dividía el NÚMERO de
    // viñetas de la ficha entre el precio y coronaba un ganador. Contar
    // cuántas frases escribió el admin no mide nada del producto: tres
    // viñetas escuetas ganaban a dos detalladas. Se quita.
    // Para comparar de verdad se usan las características extraídas arriba.
    const car1 = Object.keys(a1).length, car2 = Object.keys(a2).length;

    // ─── VEREDICTO INTELIGENTE ───
    let verdict = '';
    const mismoTipo = p1.subcategoria === p2.subcategoria;
    const nombreCorto1 = p1.nombre.length > 35 ? p1.nombre.slice(0,35)+'…' : p1.nombre;
    const nombreCorto2 = p2.nombre.length > 35 ? p2.nombre.slice(0,35)+'…' : p2.nombre;

    // Caso 1: alguno agotado
    if(p1.stock === 0 && p2.stock > 0){
      verdict = `🥇 <strong>${escapeHtml(p2.nombre)}</strong> gana por disponibilidad: el otro está agotado. Si te interesa el agotado, te puedo avisar cuando vuelva o mostrarte alternativas.`;
    } else if(p2.stock === 0 && p1.stock > 0){
      verdict = `🥇 <strong>${escapeHtml(p1.nombre)}</strong> gana por disponibilidad: el otro está agotado. Si te interesa el agotado, te puedo avisar cuando vuelva o mostrarte alternativas.`;
    } else if(p1.stock === 0 && p2.stock === 0){
      verdict = `⚠️ Ambos están agotados ahora mismo. Pídeme alternativas similares que sí tenga disponibles.`;
    } else {
      // Ambos disponibles → análisis profundo
      // Puntos fuertes de cada uno
      const puntos1 = [];
      const puntos2 = [];
      // Precio
      if(p1.precio < p2.precio){
        puntos1.push(`más accesible por ${fmtUSD(diff)} (${diffPct}% menos)`);
      } else if(p2.precio < p1.precio){
        puntos2.push(`más accesible por ${fmtUSD(diff)} (${diffPct}% menos)`);
      }
      // Características medibles en las que uno gana al otro (potencia,
      // capacidad, resolución…), no cuántas viñetas tiene la ficha.
      const gana1 = [], gana2 = [];
      COMP_ATRIBUTOS.forEach(a => {
        const x = a1[a.id], y = a2[a.id];
        if(x && y && a.mas === true && x.n !== y.n){ (x.n > y.n ? gana1 : gana2).push(a.label.toLowerCase() + ' (' + (x.n > y.n ? x.t : y.t) + ')'); }
      });
      if(gana1.length) puntos1.push('mejor en ' + gana1.slice(0,3).join(', '));
      if(gana2.length) puntos2.push('mejor en ' + gana2.slice(0,3).join(', '));
      // Oferta
      if(enOferta1 && (!enOferta2 || (enOferta2 && (p1.precioOriginal - p1.precio) > (p2.precioOriginal - p2.precio)))){
        const off1 = Math.round((1 - p1.precio/p1.precioOriginal)*100);
        puntos1.push(`en oferta (${off1}% de descuento)`);
      }
      if(enOferta2 && (!enOferta1 || (enOferta1 && (p2.precioOriginal - p2.precio) > (p1.precioOriginal - p1.precio)))){
        const off2 = Math.round((1 - p2.precio/p2.precioOriginal)*100);
        puntos2.push(`en oferta (${off2}% de descuento)`);
      }
      // Stock
      if(p1.stock > p2.stock && p2.stock <= 3){
        puntos1.push(`más stock disponible (${p1.stock} vs ${p2.stock})`);
      } else if(p2.stock > p1.stock && p1.stock <= 3){
        puntos2.push(`más stock disponible (${p2.stock} vs ${p1.stock})`);
      }
      // Condición
      if(!p1.usado && p2.usado){
        puntos1.push(`nuevo (el otro es usado)`);
      } else if(!p2.usado && p1.usado){
        puntos2.push(`nuevo (el otro es usado)`);
      }
      // Garantía
      if(p1.garantia && !p2.garantia){
        puntos1.push(`garantía específica (${escapeHtml(p1.garantia)})`);
      } else if(p2.garantia && !p1.garantia){
        puntos2.push(`garantía específica (${escapeHtml(p2.garantia)})`);
      }

      // Construir veredicto
      let partes = [];
      if(puntos1.length > 0){
        partes.push(`🟢 <strong>${escapeHtml(nombreCorto1)}</strong>: ${puntos1.join(', ')}`);
      }
      if(puntos2.length > 0){
        partes.push(`🟢 <strong>${escapeHtml(nombreCorto2)}</strong>: ${puntos2.join(', ')}`);
      }

      if(partes.length === 0){
        verdict = `🤝 <strong>Están parejos</strong> en specs, precio y disponibilidad. La decisión es por marca o preferencia personal.`;
      } else {
        verdict = `<strong>Análisis lado a lado:</strong>\n${partes.join('\n')}\n\n`;
        // Recomendación final según perfiles
        let recomendaciones = [];
        if(p1.precio < p2.precio){
          recomendaciones.push(`Si tu prioridad es <strong>ahorrar</strong>: ${escapeHtml(nombreCorto1)}`);
        } else if(p2.precio < p1.precio){
          recomendaciones.push(`Si tu prioridad es <strong>ahorrar</strong>: ${escapeHtml(nombreCorto2)}`);
        }
        if(gana1.length > gana2.length){
          recomendaciones.push(`Si tu prioridad son las <strong>prestaciones</strong>: ${escapeHtml(nombreCorto1)}`);
        } else if(gana2.length > gana1.length){
          recomendaciones.push(`Si tu prioridad son las <strong>prestaciones</strong>: ${escapeHtml(nombreCorto2)}`);
        }
        if(recomendaciones.length > 0){
          verdict += `🎯 <strong>Mi recomendación:</strong>\n${recomendaciones.join('\n')}\n\n`;
        }
        verdict += `¿Para qué lo necesitas? Con tu caso de uso te digo cuál encaja mejor.`;
      }
    }

    return {
      response: `🆚 <strong>Comparación detallada</strong> entre dos ${p1.subcategoria || p1.categoria} (${mismoTipo ? 'mismo tipo ✅' : 'categorías relacionadas'}):\n\nAquí tienes la ficha completa lado a lado, con análisis de puntos fuertes y recomendación al final 👇`,
      compare: {p1, p2, rows, verdict},
      quickReplies: ['📦 Ver ficha ' + (p1.nombre.length>20?p1.nombre.slice(0,20)+'…':p1.nombre), '📦 Ver ficha ' + (p2.nombre.length>20?p2.nombre.slice(0,20)+'…':p2.nombre), '💬 WhatsApp']
    };
  }

  // ════════════════════════════════════════════════════════════
  //  RESPUESTA TÉCNICA — "qué router tiene puerto WAN"
  // ════════════════════════════════════════════════════════════
  R.tecnico = (text) => {
    const techKeys = detectTechTerms(text);
    if(techKeys.length === 0) return R.fallback(text);

    let catFiltro = null;
    let subcatFiltro = null;
    const m = text.toLowerCase();
    if(/\brouter|switch|antena|repetidor|cpe\b/.test(m)){ catFiltro = 'WIFI'; if(/\brouter\b/.test(m)) subcatFiltro = 'ROUTERS'; else if(/\bswitch\b/.test(m)) subcatFiltro = 'SWITCHES'; else if(/\bantena|cpe\b/.test(m)) subcatFiltro = 'ROUTERS'; }
    else if(/\binversor\b/.test(m)){ catFiltro = 'ENERGIA'; subcatFiltro = 'INVERSORES'; }
    else if(/\bbater[ií]a|baterias\b/.test(m)){ catFiltro = 'ENERGIA'; subcatFiltro = 'BATERÍAS'; }
    else if(/\bpanel solar|placa solar\b/.test(m)){ catFiltro = 'ENERGIA'; subcatFiltro = 'PANELES SOLARES'; }
    else if(/\bcontrolador solar|controlador de carga\b/.test(m)){ catFiltro = 'ENERGIA'; subcatFiltro = 'CONTROLADORES SOLARES'; }
    else if(/\bcargador\b/.test(m)){ catFiltro = 'ENERGIA'; subcatFiltro = 'CARGADORES'; }
    else if(/\bc[aá]mara|camaras\b/.test(m)){ catFiltro = 'SEGURIDAD'; subcatFiltro = 'CÁMARAS'; }
    else if(/\balarma\b/.test(m)){ catFiltro = 'SEGURIDAD'; subcatFiltro = 'ALARMAS'; }
    else if(/\bcerradura\b/.test(m)){ catFiltro = 'SEGURIDAD'; subcatFiltro = 'CERRADURAS'; }
    else if(/\bcarro|auto|veh[ií]culo\b/.test(m)) catFiltro = 'CARROS';
    else if(/\bmoto\b/.test(m)) catFiltro = 'MOTOS';
    else if(/\bcelular|tel[ée]fono|m[oó]vil\b/.test(m)) catFiltro = 'CELULARES';

    let products = findProductsByTechSpec(techKeys, 12);
    if(subcatFiltro){
      const subFiltered = products.filter(p => (p.subcategoria||'').toUpperCase() === subcatFiltro);
      if(subFiltered.length > 0) products = subFiltered;
      else if(catFiltro) products = products.filter(p => p.categoria === catFiltro);
    } else if(catFiltro){
      products = products.filter(p => p.categoria === catFiltro);
    }
    // Filtrar por presupuesto si hay
    if(_context.presupuesto){
      products = products.filter(p => p.precio <= _context.presupuesto);
    }
    products = products.slice(0, 4);

    if(products.length === 0){
      const explicas = techKeys.map(k => buildTechExplanation(k)).filter(Boolean);
      // Quien pregunta "¿qué es onda pura?" quiere la explicación, no un aviso
      // de inventario. Empezar por "no encontré productos" contestaba a otra
      // pregunta antes que a la suya.
      const esDefinicion = /\b(qu[eé] es|qu[eé] son|qu[eé] significa|qu[eé] quiere decir|para qu[eé] sirve|expl[ií]ca(me)?|def[ií]ne(me)?|en qu[eé] consiste)\b/.test(String(text || '').toLowerCase());
      const sinStock = `🔍 Ahora mismo no tengo productos disponibles con esa característica${_context.presupuesto ? ` y presupuesto de $${_context.presupuesto}` : ''}.`;
      let body = esDefinicion
        ? (explicas.join('\n\n') + (explicas.length ? '\n\n' : '') + sinStock)
        : (sinStock + (explicas.length ? '\n\n' + explicas.join('\n\n') : ''));
      body += `\n\n¿Quieres ver todos los productos de alguna categoría? Toca una opción:`;
      return {
        response: body,
        quickReplies: ['📦 Categorías','🔥 Ofertas','💬 WhatsApp']
      };
    }

    let body = '';
    const explicas = techKeys.map(k => buildTechExplanation(k)).filter(Boolean);
    if(explicas.length > 0){
      body += explicas.join('\n\n') + '\n\n';
    }

    body += `🎯 <strong>Productos disponibles que cumplen</strong>${catFiltro ? ` en ${catIcon(catFiltro)} ${catFiltro}${subcatFiltro ? ' / ' + subcatFiltro : ''}` : ''}${_context.presupuesto ? ` (hasta ${fmtUSD(_context.presupuesto)})` : ''}:\n\n`;
    products.forEach((p, i) => {
      const matchingSpecs = (p.specs||[]).filter(s => {
        const sClean = cleanForMatch(s);
        return techKeys.some(k => {
          const kSyns = Object.entries(KNOWLEDGE_SYNONYMS).filter(([_,v])=>v===k).map(([kk])=>cleanForMatch(kk));
          kSyns.push(cleanForMatch(k));
          return kSyns.some(syn => _matchTermino(sClean, syn));
        });
      });
      body += `<strong>${i+1}.</strong> <strong>${escapeHtml(p.nombre)}</strong> — ${fmtUSD(p.precio)}\n`;
      if(matchingSpecs.length > 0){
        body += `   ✅ ${matchingSpecs.slice(0,2).map(s => escapeHtml(s)).join(' · ')}\n`;
      }
      body += `   📦 ${stockText(p)} | ${catIcon(p.categoria)} ${p.categoria}\n`;
    });
    body += `\nToca cualquier tarjeta para ver la ficha completa. ¿Quieres que <em>compare dos de estos</em>?`;

    return {
      response: body,
      products: products,
      quickReplies: products.length >= 2 ? ['🆚 Comparar dos de estos','💬 WhatsApp'] : ['💬 WhatsApp','📦 Ver categorías']
    };
  };

  function buildTechExplanation(key){
    const info = KNOWLEDGE[key];
    if(!info) return '';
    return `📖 <strong>${info.term}</strong>\n${info.what}\n<em>¿Para qué sirve?</em> ${info.why}\n<em>¿Cómo se usa?</em> ${info.how}`;
  }

  // ════════════════════════════════════════════════════════════
  //  RECOMENDACIÓN (con presupuesto)
  // ════════════════════════════════════════════════════════════
  R.recomendacion = (text) => {
    const t = text.toLowerCase();
    let categoria = null;
    if(/(vigilar|vigilancia|c[aá]mara.*seguridad|casa.*segura|negocio.*segur|robo|ladrones|intrusos|proteger.*casa|cuidar.*casa|esp[ií]a)/.test(t)) categoria = 'SEGURIDAD';
    // El TIPO de producto manda sobre la tecnología que lo acompaña: "cámara
    // wifi" es una cámara, no un router. Antes /wifi/ se evaluaba antes que
    // /cámara/ y "necesito una cámara wifi para el patio" devolvía switches.
    else if(/(c[aá]mara|camaras|cameras|alarma|cerradura|timbre)/.test(t)) categoria = 'SEGURIDAD';
    else if(/(bater[ií]a|inversor|controlador|panel solar|cargador)/.test(t)) categoria = 'ENERGIA';
    else if(/(internet|wifi|se[ñn]al.*wifi|red wifi|conect.*internet|navegar|ver.*netflix|streaming|descargar)/.test(t)) categoria = 'WIFI';
    else if(/(apag[oó]n|luz.*casa|sin luz|sin corriente|cargar.*celular.*apag[oó]n|energ[ií]a.*casa|respaldo|planta el[eé]ctrica)/.test(t)) categoria = 'ENERGIA';
    else if(/(cocinar|comida|nevera|lavadora|olla|arroz|plancha|licuadora|electrodom|tostadora|microondas)/.test(t)) categoria = 'HOGAR';
    else if(/(escuchar m[uú]sica|m[uú]sica|fiesta|sonido|altavoz|parlante|bocina|aud[ií]fono|auricular)/.test(t)) categoria = 'AUDIO';
    else if(/(jugar|gaming|videojuego|consola|play|nintendo|xbox|gamer|controles?)/.test(t)) categoria = 'JUEGOS';
    else if(/(wifi|router|antena|repetidor|cpe|switch)/.test(t)) categoria = 'WIFI';
    else if(/(energ[ií]a|bater[ií]a|solar|inversor|panel|carga|planta|controlador)/.test(t)) categoria = 'ENERGIA';
    else if(/(c[aá]mara|camaras|cameras|seguridad|alarma|cerradura)/.test(t)) categoria = 'SEGURIDAD';
    else if(/(carro|auto|coche|veh[ií]culo|autom[oó]vil|accesorio.*auto)/.test(t)) categoria = 'CARROS';
    else if(/(moto[s]?|motocicleta|scooter)/.test(t)) categoria = 'MOTOS';
    else if(/(casa|hogar)/.test(t)) categoria = 'HOGAR';
    else if(/(celular|tel[ée]fono|m[oó]vil|smartphone|androide|iphone)/.test(t)) categoria = 'CELULARES';
    else if(/(computadora|laptop|pc|notebook|netbook|tablet)/.test(t)) categoria = 'PC Y LAPTOPS';
    else if(/(gym|gimnasio|pesas|fitness|ejercicio|m[uú]sculo)/.test(t)) categoria = 'GYM';
    else if(/(herramienta|tornillo|taladro|martillo|u[ú]tiles|trabajo)/.test(t)) categoria = 'UTILES';
    else if(/\b(ropa|shorts?|pantal[oó]n|camisa|blusa|vestido|chaqueta|abrigo|lencer[ií]a|traje de ba[ñn]o|underwear)\b/.test(t)) categoria = 'ROPA';

    if(categoria){
      const dispCount = PRODUCTOS.filter(p => p.categoria === categoria && p.stock > 0).length;
      if(dispCount === 0){
        return {
          response: `📦 En este momento la categoría <strong>${catIcon(categoria)} ${categoria}</strong> está <em style="color:#ff8888">agotada</em>. Tenemos productos disponibles en otras categorías. ¿Quieres verlas?`,
          quickReplies: ['📦 Categorías disponibles','💬 WhatsApp']
        };
      }
    }

    if(!categoria){
      // Si hay presupuesto pero no categoría, buscar con el presupuesto
      if(_context.presupuesto){
        const prods = PRODUCTOS.filter(p => p.stock > 0 && p.precio <= _context.presupuesto)
          .sort((a,b) => b.precio - a.precio).slice(0,4);
        if(prods.length > 0){
          return {
            response: `💰 Con tu presupuesto de <strong>${fmtUSD(_context.presupuesto)}</strong> tienes estas opciones disponibles (las más caras primero, que dan más valor):\n\nDime qué tipo de producto te interesa para afinar la recomendación.`,
            products: prods,
            quickReplies: ['📦 Categorías','🆚 Comparar dos de estos','💬 WhatsApp']
          };
        }
      }
      const prods = findProducts(text.replace(/^(necesito|busco|quiero|recomi[ée]ndame|sugi[ée]reme|para)/g,' ').trim(), 4);
      if(prods.length > 0){
        return {
          response: `🎯 Según lo que me dices, te puedo recomendar esto del catálogo (todos disponibles). Mira cuál te encaja:`,
          products: prods,
          quickReplies: ['🆚 Comparar dos de estos','💬 WhatsApp']
        };
      }
      return {
        response: `🎯 Cuéntame un poco más: ¿para qué lo necesitas? Por ejemplo:\n• <em>"para tener internet en una finca sin fibra"</em>\n• <em>"para vigilar mi casa de noche"</em>\n• <em>"para cargar mi celular cuando hay apagón"</em>\n\nCon eso te recomiendo el producto justo.`,
        quickReplies: ['📦 Ver categorías','🔥 Ofertas']
      };
    }

    let prods = PRODUCTOS
      .filter(p => p.categoria === categoria && p.stock > 0);
    // Si dijo el tipo exacto ("qué cámara me recomiendas"), no se le enseña la
    // categoría entera: pedía una cámara y le salían la cerradura y el timbre,
    // que también son SEGURIDAD. R.busqueda ya afinaba así; aquí no.
    const _subPedida = _detectarSubcategoria(text);
    const _porSub = _subPedida ? prods.filter(p => p.subcategoria === _subPedida) : [];
    if(_porSub.length) prods = _porSub;
    if(_context.presupuesto){
      const _dentro = prods.filter(p => p.precio <= _context.presupuesto);
      // Si nada del tipo pedido entra en el presupuesto se dice, no se rellena
      // con otra cosa: "tengo $30, ¿qué inversor me recomiendas?" devolvía un
      // probador de baterías, que era lo único de ENERGIA bajo ese precio.
      if(!_dentro.length && _porSub.length){
        const _barato = _porSub.slice().sort((a,b) => a.precio - b.precio)[0];
        return {
          response: `📂 No tengo nada en <strong>${escapeHtml(String(_subPedida))}</strong> por debajo de ${fmtUSD(_context.presupuesto)}. Lo más barato que tengo disponible es de <strong>${fmtUSD(_barato.precio)}</strong>.\n\nSi quieres te lo enseño igual, o dime otro presupuesto y busco de nuevo.`,
          products: _porSub.slice().sort((a,b) => a.precio - b.precio).slice(0, 3),
          quickReplies: ['📦 Otras categorías','🔥 Ofertas','💬 WhatsApp']
        };
      }
      prods = _dentro;
    }
    prods = prods.sort((a,b) => a.precio - b.precio);
    if(!prods.length){
      return {
        response: `📂 No tengo nada disponible en <strong>${catIcon(categoria)} ${categoria}</strong> por debajo de ${fmtUSD(_context.presupuesto)}. Dime otro presupuesto y te busco de nuevo, o mira las ofertas.`,
        quickReplies: ['🔥 Ofertas','📦 Otras categorías','💬 WhatsApp']
      };
    }

    const cat = CATEGORIAS.find(c => c.nombre === categoria);
    let body = `🎯 Para lo que me pides, la categoría ideal es <strong>${cat.icono} ${categoria}</strong> (${cat.desc}).\n\n`;
    if(_context.presupuesto){
      body += `💰 Filtrando por tu presupuesto de <strong>${fmtUSD(_context.presupuesto)}</strong>:\n\n`;
    }
    const _n = Math.min(4, prods.length);
    body += `Te muestro <em>${_n}</em> ${_n === 1 ? 'opción disponible' : 'opciones disponibles'}, ordenada${_n === 1 ? '' : 's'} por precio (de menor a mayor). ¿Cuál te llama la atención?\n\n`;
    body += `<strong>Tip:</strong> Si quieres, me dices <em>"compara el A vs el B"</em> y te armo la tabla lado a lado.`;
    return {
      response: body,
      products: prods.slice(0,4),
      quickReplies: ['🆚 Comparar dos de estos','💬 WhatsApp','📦 Otras categorías']
    };
  };

  R.busqueda = (text) => {
    // Si nombra un tipo que existe en el catálogo, eso manda sobre la
    // puntuación difusa por descripción.
    const sub = _detectarSubcategoria(text);
    if(sub){
      const _todos = PRODUCTOS.filter(p => p.subcategoria === sub && p.stock > 0)
                              .sort((a,b) => a.precio - b.precio);
      let lista = _todos;
      if(_context.presupuesto) lista = lista.filter(p => p.precio <= _context.presupuesto);
      // Si el presupuesto deja el tipo pedido sin nada, se dice — no se cae a
      // la búsqueda difusa, que contestaba "qué inversor me recomiendas" con
      // una raqueta matamoscas porque era lo único bajo ese precio.
      if(!lista.length && _todos.length){
        return {
          response: `📂 No tengo nada en <strong>${escapeHtml(sub)}</strong> por debajo de ${fmtUSD(_context.presupuesto)}. Lo más barato que tengo disponible es de <strong>${fmtUSD(_todos[0].precio)}</strong>.\n\nSi quieres te lo enseño igual, o dime otro presupuesto y busco de nuevo.`,
          products: _todos.slice(0, 3),
          quickReplies: ['📦 Otras categorías','🔥 Ofertas','💬 WhatsApp']
        };
      }
      if(lista.length){
        let body = `📂 <strong>${escapeHtml(sub)}</strong> — tengo <em>${lista.length} disponible${lista.length>1?'s':''}</em>`;
        if(_context.presupuesto) body += ` dentro de tu presupuesto de ${fmtUSD(_context.presupuesto)}`;
        body += `, de más barato a más caro:\n\n`;
        lista.slice(0, 10).forEach((p, i) => {
          body += `<strong>${i+1}.</strong> ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)} · <em>${stockText(p)}</em>\n`;
        });
        body += `\nToca cualquiera para ver la ficha completa.`;
        return {
          response: body,
          products: lista.slice(0, TM_MAX_TARJETAS_CAT),
          quickReplies: lista.length >= 2
            ? ['🆚 Comparar dos de estos','📦 Otras categorías','💬 WhatsApp']
            : ['📦 Otras categorías','💬 WhatsApp']
        };
      }
    }
    const mentions = detectProductMentions(text);
    if(mentions.length === 1){
      return buildDetalle(mentions[0], text);
    }
    if(mentions.length >= 2){
      const disponibles = mentions.filter(m => m.stock > 0);
      const lista = disponibles.length > 0 ? disponibles : mentions;
      return {
        response: `🔍 Encontré varios productos relacionados. ${disponibles.length > 0 ? `<em>Solo te muestro los disponibles</em>` : `<em style="color:#ff8888">Ojo: algunos están agotados</em>`}. Toca cualquiera para ver la ficha, o dime <em>"compara el A vs el B"</em>.`,
        products: lista.slice(0,4),
        quickReplies: ['🆚 Comparar dos de estos','💬 WhatsApp']
      };
    }
    const prods = findProducts(text, 4, {presupuesto: _context.presupuesto});
    if(prods.length === 0){
      const agotados = findProducts(text, 2, {includeAgotados:true});
      if(agotados.length > 0){
        const alt = findAlternativas(agotados[0], 3);
        let body = `🔍 Ese producto lo tenemos pero está <em style="color:#ff8888">agotado</em> ahora mismo. Te muestro <strong>alternativas similares disponibles</strong>:`;
        return {
          response: body,
          products: alt,
          quickReplies: ['💬 WhatsApp','📦 Categorías']
        };
      }
      return R.fallback(text);
    }
    return {
      response: `🔍 Esto es lo que tengo <em>disponible</em> relacionado con tu búsqueda${_context.presupuesto ? ` (hasta ${fmtUSD(_context.presupuesto)})` : ''}. Toca cualquiera para ver la ficha completa:`,
      products: prods,
      quickReplies: ['🆚 Comparar dos de estos','💬 WhatsApp','📦 Categorías']
    };
  };

  /* ── NAUTA HOGAR / ETECSA ──────────────────────────────────────────────
     Aquí Nauta Hogar es *el* internet de casa, y la pregunta que llega es
     siempre la misma: "¿venden módems para Nauta Hogar?". La respuesta honesta
     es que no —los da ETECSA— pero sí hay con qué mejorar la señal, así que
     decirlo y ofrecer lo que sí hay vale más que una búsqueda vacía. */
  R.nautaHogar = (text) => {
    const m = text.toLowerCase();
    // Por NOMBRE, no por subcategoría: los repetidores del catálogo están en
    // ACCESORIOS, así que filtrar por subcategoría "REPETIDOR" no encontraba
    // ninguno y el botón "Ver Repetidores" no llevaba a nada.
    const _routers = () => PRODUCTOS.filter(p => Number(p.stock) > 0 &&
        (/ROUTERS?/i.test(p.subcategoria || '') || /\brouter\b/i.test(p.nombre || '')) &&
        !/repetidor|extensor/i.test(p.nombre || ''));
    const _repetidores = () => PRODUCTOS.filter(p => Number(p.stock) > 0 &&
        /repetidor|extensor|amplificador/i.test((p.nombre || '') + ' ' + (p.subcategoria || '')));
    // fmtUSD(r.precio): dentro del cerebro el precio ya viene normalizado a
    // `precio` (ver _sincronizar); `precioActual` solo existe en el JSON crudo
    // y aquí saldría $0.00 en cada línea.
    const _lista = (arr) => arr.map(r =>
        `• <strong>${escapeHtml(r.nombre)}</strong> — ${fmtUSD(r.precio)}\n`).join('');
    const _COMO = `\n\n<strong>¿Cómo se conecta?</strong>\n1. Toma un cable de red (RJ45)\n2. Un extremo a un puerto <strong>LAN</strong> del módem-router de ETECSA\n3. El otro al puerto <strong>WAN</strong> de tu router nuevo\n4. Configura el router nuevo (nombre de red y contraseña)`;

    if(/\b(repetidor|extensor|amplificador|amplificar)\b/i.test(m)){
      const rep = _repetidores().slice(0, 4);
      if(rep.length){
        return {
          response: `📡 <strong>Repetidores para amplificar la señal de Nauta Hogar</strong>\n\nSe enchufan a mitad de camino entre el equipo de ETECSA y la zona donde no llega la señal — sin cables:\n\n${_lista(rep)}\n¿Quieres detalles de alguno?`,
          products: rep, quickReplies: ['📶 Ver Routers','💬 WhatsApp']
        };
      }
      // Decirlo, en vez de caer al texto general como si no se hubiera
      // preguntado por repetidores.
      return {
        response: `📡 Ahora mismo <strong>no tengo repetidores disponibles</strong>. Vuelven a entrar cada poco — escríbeme por WhatsApp y te aviso.\n\nMientras tanto, un router conectado al equipo de ETECSA también mejora bastante la cobertura. ¿Te los enseño?`,
        quickReplies: ['📶 Ver Routers','💬 WhatsApp']
      };
    }

    if(/\b(router|routers|enrutar)\b/i.test(m)){
      const routers = _routers().slice(0, 4);
      if(routers.length){
        return {
          response: `📶 <strong>Routers para ampliar tu Nauta Hogar</strong>\n\nSe conectan por cable a los puertos LAN del módem-router de ETECSA y crean una red Wi-Fi más rápida y con mejor alcance:\n\n${_lista(routers)}${_COMO}\n\n¿Quieres detalles de alguno?`,
          products: routers, quickReplies: ['📡 Ver Repetidores','💬 WhatsApp']
        };
      }
    }

    if(/compatible|sirve para nauta|funciona con nauta|puedo usar con/i.test(m)){
      return {
        response: `📶 <strong>Equipos compatibles con Nauta Hogar</strong>\n\nETECSA da el servicio con un módem-router ADSL con puerto RJ11 (el de la línea telefónica), tipo TP-Link TD-W8901N.\n\n⚠️ <em>Esos equipos no los vendemos: los provee ETECSA.</em>\n\n✅ <strong>Lo que sí tengo, y sirve para mejorar tu red:</strong>\n• <strong>Routers</strong> → se conectan a los puertos LAN del equipo de ETECSA\n• <strong>Repetidores Wi-Fi</strong> → amplifican la señal, sin cables`,
        quickReplies: ['📶 Ver Routers','📡 Ver Repetidores','💬 WhatsApp']
      };
    }

    return {
      response: `📶 <strong>Nauta Hogar y equipos ADSL</strong>\n\nNauta Hogar funciona con un <strong>módem-router ADSL</strong> con puerto RJ11 (entrada telefónica), como el TP-Link TD-W8901N que entrega ETECSA.\n\n⚠️ <strong>Esos no los vendemos</strong> — ETECSA los provee directamente. Prefiero decírtelo antes de que pierdas el viaje.\n\n✅ <strong>Lo que sí tengo para mejorar tu señal:</strong>\n• <strong>Routers Wi-Fi</strong>: por cable al equipo de ETECSA, para una red más rápida y con más alcance.\n• <strong>Repetidores Wi-Fi</strong>: llevan la señal a los cuartos donde el equipo de ETECSA no llega.${_COMO}\n\n¿Te enseño los routers o los repetidores?`,
      quickReplies: ['📶 Ver Routers','📡 Ver Repetidores','📶 Equipos compatibles','💬 WhatsApp']
    };
  };

  R.fallback = (text) => {
    _registrarPreguntaFAQ(text, 'desconocido', '');
    const prods = findProducts(text, 3);
    if(prods.length > 0){
      return {
        response: `🤔 No estoy seguro de qué necesitas exactamente, pero por lo que escribes puede que te interese algo de esto (todos disponibles). Si no es lo que buscas, dime más detalles: para qué lo necesitas, presupuesto, marca preferida…`,
        products: prods,
        quickReplies: ['📦 Categorías','🔥 Ofertas','🤖 /ayuda','💬 WhatsApp']
      };
    }
    return {
      response: `🤔 Disculpa, no estoy seguro de haber entendido tu pregunta.\n\nPuedo ayudarte con:\n\n• <em>Buscar productos</em> en el catálogo\n• <em>Calcular sistemas solares</em> y autonomía\n• <em>Comparar productos</em> lado a lado\n• <em>Resolver dudas técnicas</em> (códigos de error, glosario)\n• <em>Pagos, envíos y garantía</em>\n• <em>Nauta Hogar y equipos de red</em>\n\n¿Puedes reformular tu pregunta? O escribe <code>/ayuda</code> para ver todo lo que sé hacer.`,
      quickReplies: ['🤖 /ayuda','📦 Categorías','🔥 Ofertas','💬 Hablar con un humano']
    };
  };

  // ════════════════════════════════════════════════════════════
  //  LISTA DE DESEOS (favoritos persistente)
  // ════════════════════════════════════════════════════════════
  // El carrito es el de la tienda, así que aquí solo se lee y se resume: si
  // el cliente lo vacía desde el icono del header, el bot lo ve al instante.
  R.carrito = (text) => {
    const m = text.toLowerCase();
    const c = resumenCarrito();

    if(/vaciar|limpiar|borrar/i.test(m)){
      return {
        response: `Para vaciarlo, ábrelo con el icono 🛒 de arriba y quita lo que no quieras — así no te borro nada por error.`,
        quickReplies: ['🧾 Ver mi carrito','📦 Ver más productos']
      };
    }

    if(!c){
      return {
        response: `🛒 Tu carrito está vacío ahora mismo.\n\nDime qué necesitas y te lo voy armando: puedes añadir productos desde aquí mismo y luego pedirlos todos juntos en un solo mensaje de WhatsApp.`,
        quickReplies: ['📦 Ver categorías','🔥 Lo más vendido','💰 Ofertas']
      };
    }

    if(/pedir|comprar|cerrar|finalizar|encargar/i.test(m)){
      if(typeof comprarCarrito === 'function'){
        setTimeout(() => { try { comprarCarrito(); } catch(e){} }, 300);
        return {
          response: `💳 Te abro WhatsApp con los <strong>${c.unidades}</strong> artículos del carrito (<strong>${fmtUSD(c.total)}</strong>). El mensaje ya va escrito, solo dale enviar.`,
          quickReplies: ['📦 Ver categorías']
        };
      }
    }

    let body = `🛒 <strong>Esto llevas en el carrito</strong>\n`;
    c.items.forEach(i => {
      const cant = Number(i.cantidad) || 1;
      const sub = (Number(i.precio) || 0) * cant;
      body += `• ${cant}× ${escapeHtml(i.nombre || 'Producto')} — ${fmtUSD(sub)}\n`;
    });
    body += `\n<strong>Total: ${fmtUSD(c.total)}</strong> (${c.unidades} artículo${c.unidades>1?'s':''})`;
    body += `\n<em>El envío se coordina aparte según tu zona.</em>`;
    body += `\n\n¿Lo pido ya por WhatsApp o sigues mirando?`;
    return {
      response: body,
      quickReplies: ['💳 Pedir todo el carrito','📦 Ver categorías','🚚 Ver envíos']
    };
  };

  R.wishlist = (text) => {
    const m = text.toLowerCase();
    // Vaciar lista
    if(/vaciar|limpiar|borrar|elimina todo/i.test(m)){
      const list = getWishlist();
      if(list.length === 0){
        return { response: '💝 Tu lista de deseos ya está vacía.', quickReplies: ['📦 Ver productos'] };
      }
      saveWishlist([]);
      return {
        response: `🗑️ He vaciado tu lista de deseos. Tenía <em>${list.length} producto${list.length>1?'s':''}</em>. Si quieres recuperar alguno, búscalo de nuevo y añádelo.`,
        quickReplies: ['📦 Ver productos','🔥 Ofertas']
      };
    }
    // Quitar producto específico
    if(/quita|sacar|elimina|borra/i.test(m)){
      const mentions = detectProductMentions(text);
      if(mentions.length >= 1){
        const p = mentions[0];
        if(isInWishlist(p.id)){
          removeFromWishlist(p.id);
          return {
            response: `❌ He quitado <strong>${escapeHtml(p.nombre)}</strong> de tu lista de deseos.`,
            quickReplies: ['💝 Ver mi lista','📦 Ver productos']
          };
        } else {
          return {
            response: `Ese producto no está en tu lista de deseos. ¿Quieres ver tu lista actual?`,
            quickReplies: ['💝 Ver mi lista','📦 Ver productos']
          };
        }
      }
    }
    // Añadir producto
    if(/añade|agrega|guarda|añadir|agregar|guardar/i.test(m)){
      const mentions = detectProductMentions(text);
      if(mentions.length >= 1){
        const p = mentions[0].stock > 0 ? mentions[0] : mentions[0];
        if(addToWishlist(p)){
          return {
            response: `❤️ ¡Listo! Añadí <strong>${escapeHtml(p.nombre)}</strong> a tu lista de deseos.\n\nAhora puedes seguir mirando productos y añadir más. Cuando quieras ver tu lista completa, escribe <em>"ver mi lista"</em> o <code>/deseos</code>.`,
            quickReplies: ['💝 Ver mi lista','📦 Ver más productos','💬 WhatsApp']
          };
        } else {
          return {
            response: `Ese producto ya está en tu lista de deseos. ¿Quieres ver tu lista?`,
            quickReplies: ['💝 Ver mi lista','📦 Ver productos']
          };
        }
      }
      return {
        response: `💝 Dime qué producto quieres añadir. Por ejemplo:\n• <em>"añade el router Tenda a mi lista"</em>\n• <em>"quiero guardar este inversor"</em>`,
        quickReplies: ['📦 Ver productos','💝 Ver mi lista']
      };
    }
    // Pedir todo por WhatsApp
    if(/pedir todo|pedir toda|comprar todo/i.test(m)){
      const list = getWishlist();
      if(list.length === 0){
        return { response: '💝 Tu lista de deseos está vacía. Añade productos primero.', quickReplies: ['📦 Ver productos'] };
      }
      const total = list.reduce((s, p) => s + p.precio, 0);
      let msg = '¡Hola TiendaMax! Quiero pedir los siguientes productos de mi lista de deseos:\n\n';
      list.forEach((p, i) => {
        msg += `${i+1}. ${p.nombre} — ${fmtUSD(p.precio)}\n`;
      });
      msg += `\nTotal estimado: ${fmtUSD(total)} (${fmtMN(total)})`;
      const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
      let body = `💬 ¡Listo! Tu lista de <em>${list.length} producto${list.length>1?'s':''}</em> está armada para enviar por WhatsApp:\n\n`;
      body += `💰 <strong>Total:</strong> ${fmtUSD(total)} · <em>${fmtMN(total)}</em>\n\n`;
      body += `Toca aquí para abrir WhatsApp con el pedido completo:\n${url}`;
      return { response: body, quickReplies: ['💝 Ver mi lista','💬 Abrir WhatsApp'] };
    }
    // Default: mostrar lista
    return buildWishlistResponse();
  };

  // ════════════════════════════════════════════════════════════
  //  AYUDA — menú de comandos
  // ════════════════════════════════════════════════════════════
  R.ayuda = () => ({
    response: `🤖 <strong>Comandos de Max Bot</strong>\n\nPuedes escribir directamente o usar estos comandos:\n\n<em>Comandos con /:</em>\n• <code>/deseos</code> — ver tu lista de deseos\n• <code>/ofertas</code> — ver productos en oferta\n• <code>/categorias</code> — ver categorías del catálogo\n• <code>/envios</code> — cobertura de mensajería\n• <code>/pago</code> — métodos de pago\n• <code>/tasa</code> — tasa del día (USD → MN)\n• <code>/whatsapp</code> — contacto directo\n• <code>/limpiar</code> — reiniciar conversación\n\n<em>Frases útiles:</em>\n• <em>"compara el router A vs el router B"</em>\n• <em>"qué cámara tiene visión nocturna"</em>\n• <em>"arma un sistema solar básico"</em>\n• <em>"cuánto dura una batería con mi nevera"</em>\n• <em>"mi inversor pita y tiene la luz roja"</em>\n• <em>"tengo $100, ¿qué cámara me recomiendas?"</em>\n• <em>"añade el router Tenda a mi lista"</em>\n• <em>"háblame del inversor solar"</em>\n• <em>"este inversor sirve para mi nevera"</em>\n• <em>"¿venden módems para Nauta Hogar?"</em>\n\n¿Qué necesitas hacer?`,
    quickReplies: ['💝 Ver mi lista','🔥 Ofertas','📦 Categorías','💬 WhatsApp']
  });

  // Un "sí"/"ok"/"dale" suelto no dice qué quiere el cliente. Se contesta
  // corto y se le dan rutas, en vez de devolverle productos que no pidió.
  R.confirmacion = () => ({
    response: `👍 Dime qué necesitas y te ayudo: puedo buscarte un producto, comparar dos, explicarte un término técnico o armarte un sistema completo.\n\nSi prefieres verlo todo, escribe <code>/ayuda</code>.`,
    quickReplies: ['📦 Categorías','🔥 Ofertas','🤖 /ayuda','💬 WhatsApp']
  });

  R.quienEres = () => ({
    response: `🤖 Soy <strong>Max</strong>, el asistente de TiendaMax. No soy una persona: soy un programa que corre aquí mismo, en tu navegador, con el catálogo de la tienda delante.\n\nPor eso te puedo decir precios, disponibilidad y fichas al momento. Y si necesitas hablar con alguien de verdad, te paso con el equipo por WhatsApp.\n\n¿Qué estás buscando?`,
    quickReplies: ['📦 Categorías','🔥 Ofertas','🤖 /ayuda','💬 WhatsApp']
  });

  R.resetCmd = () => {
    resetChat();
    return { response: '', quickReplies: [] };
  };

  // ════════════════════════════════════════════════════════════
  //  RESPONDER
  // ════════════════════════════════════════════════════════════
  function responder(text){
    // El catálogo llega asincrónico y el admin puede cambiar precios o la
    // tasa mientras el chat está abierto: se releen en cada mensaje.
    _sincronizar();
    if(PRODUCTOS.length === 0){
      return {
        response: '⏳ Todavía estoy cargando el catálogo. Dame un segundo y vuelve a preguntarme, o escríbenos directo por WhatsApp y te atendemos al momento.',
        quickReplies: ['💬 WhatsApp']
      };
    }
    const intent = detectIntent(text);
    _context.lastIntent = intent;
    _context.conversationStep++;
    const handler = R[intent] || R.fallback;
    return handler(text);
  }

  // ════════════════════════════════════════════════════════════
  //  UI — Referencias DOM (igual que v2)
  // ════════════════════════════════════════════════════════════
  const bubble = $('#tmBotBubble');
  const welcome = $('#tmBotWelcome');
  const panel = $('#tmBotPanel');
  const bodyEl = $('#tmBotBody');
  const inputEl = $('#tmBotInput');
  const sendBtn = $('#tmBotSend');
  const closeBtn = $('#tmBotClose');
  const resetBtn = $('#tmBotReset');
  const quickRepliesEl = $('#tmBotQuickReplies');
  const welcomeClose = $('.tm-bot-welcome-close');
  const suggestionsEl = $('#tmBotSuggestions');
  const capGrid = $('#tmCapGrid');

  // Baja del todo ahora, en el siguiente frame y otra vez cuando
  // termine de cargar cada imagen recién insertada (las tarjetas de
  // producto crecen después de pintarse y dejaban la respuesta a medias).
  let _scrollTimer = null;
  function _scrollAlFondo(){
    if(!bodyEl) return;
    const bajar = () => { bodyEl.scrollTop = bodyEl['scrollHeight']; };
    bajar();
    requestAnimationFrame(bajar);
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(bajar, 300);
    bodyEl.querySelectorAll('img:not([data-scrolled])').forEach(img => {
      img.setAttribute('data-scrolled', '1');
      if(!img.complete) img.addEventListener('load', bajar, { once: true });
    });
  }

  function nowTime(){ const d=new Date(); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }

  function addDateSep(){
    const el = document.createElement('div');
    el.className = 'tm-bot-date-sep';
    el.textContent = 'Hoy · ' + new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
    bodyEl.appendChild(el);
  }

  // Convierte URLs sueltas en enlaces. Solo http/https, y solo sobre el
  // HTML que arma el bot: el texto del usuario ya viene escapado.
  function linkificar(html){
    return String(html).replace(/(^|[\s(])(https?:\/\/[^\s<>"']+)/g, (m, pre, url) =>
      pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="tm-bot-link">' + url + '</a>');
  }

  function addMessage(html, who){
    const msg = document.createElement('div');
    msg.className = 'tm-bot-msg ' + who;
    msg.innerHTML = (who === 'bot' ? linkificar(html) : html) + `<span class="meta">${nowTime()}</span>`;
    bodyEl.appendChild(msg);
    _scrollAlFondo();
    _messages.push({html, who});
    return msg;
  }

  function addTyping(){
    const t = document.createElement('div');
    t.className = 'tm-bot-msg bot tm-bot-typing-wrap';
    t.innerHTML = '<div class="tm-bot-typing"><span></span><span></span><span></span></div>';
    t.id = 'tmBotTyping';
    bodyEl.appendChild(t);
    _scrollAlFondo();
  }
  function removeTyping(){
    const t = $('#tmBotTyping');
    if(t) t.remove();
  }

  function addMessageTyped(html, who='bot'){
    const msg = document.createElement('div');
    msg.className = 'tm-bot-msg ' + who;
    msg.innerHTML = (who === 'bot' ? linkificar(html) : html) + `<span class="meta">${nowTime()}</span>`;
    bodyEl.appendChild(msg);
    _scrollAlFondo();
    _messages.push({html, who});
  }

  /* ── Elegir QUÉ comparar, en vez de decidirlo por el cliente ──
     Antes, cualquier atajo de comparación ("comparar dos de estos",
     "comparar routers"…) agarraba los dos PRIMEROS de la lista y armaba la
     tabla. Si querías comparar el tercero con el quinto, no había forma de
     pedirlo. Ahora se muestran las opciones y se eligen una a una. */
  let _compSel = { p1: null, lista: [] };

  function _tarjetaElegible(p, etiqueta, onClick){
    const item = document.createElement('div');
    item.className = 'tm-bot-product';
    const imgInfo = imageUrl(p);
    const imgSrc = imgInfo ? imgInfo.primary : PLACEHOLDER_IMG;
    item.innerHTML =
      '<img class="tm-bot-product-img" src="' + escapeAttr(imgSrc) + '" alt="" loading="lazy" ' +
        'onerror="this.src=\'' + PLACEHOLDER_IMG + '\';this.onerror=null;">' +
      '<div class="tm-bot-product-info">' +
        '<div class="tm-bot-product-name">' + escapeHtml(p.nombre) + '</div>' +
        '<div class="tm-bot-product-price">' + fmtUSD(p.precio) + ' USD</div>' +
        '<div class="tm-bot-product-stock">' + escapeHtml(String(p.subcategoria || p.categoria || '')) + ' · ' + (p.stock > 0 ? p.stock + ' en stock' : 'agotado') + '</div>' +
      '</div>' +
      '<div class="tm-bot-product-go">' + etiqueta + '</div>';
    item.onclick = onClick;
    return item;
  }

  function _pintarElegibles(lista, etiqueta, onPick){
    const wrap = document.createElement('div');
    wrap.className = 'tm-bot-products';
    lista.forEach(p => wrap.appendChild(_tarjetaElegible(p, etiqueta, () => onPick(p))));
    bodyEl.appendChild(wrap);
    _scrollAlFondo();
  }

  // Paso 1: elegir el primero
  function pedirElegirPrimero(lista, titulo){
    lista = (lista || []).filter(Boolean);
    if(lista.length < 2){
      addMessageTyped('Para comparar necesito al menos dos productos del mismo tipo disponibles. Dime qué categoría te interesa y te enseño lo que hay.', 'bot');
      renderQuickReplies(['📦 Ver categorías','💬 WhatsApp']);
      return;
    }
    _compSel = { p1: null, lista: lista };
    addMessageTyped('🆚 ' + (titulo || 'Vamos a comparar') + '.\n\n<strong>Toca el PRIMERO</strong> que quieras comparar:', 'bot');
    _pintarElegibles(lista.slice(0, 8), '1️⃣', p => elegirPrimero(p));
    renderQuickReplies(['📦 Ver categorías','💬 WhatsApp']);
  }

  // Paso 2: elegir el segundo, solo entre los comparables de verdad
  function elegirPrimero(p){
    _compSel.p1 = p;
    _context.lastProduct = p;
    // Solo del mismo tipo: comparar una batería con un router no dice nada
    let rivales = _compSel.lista.filter(x => String(x.id) !== String(p.id) && sonComparables(p, x).ok);
    if(!rivales.length){
      rivales = PRODUCTOS.filter(x => String(x.id) !== String(p.id) && x.stock > 0 && sonComparables(p, x).ok);
    }
    if(!rivales.length){
      addMessageTyped('No tengo otro <strong>' + escapeHtml(p.subcategoria || p.categoria) + '</strong> disponible para comparar con <strong>' + escapeHtml(p.nombre) + '</strong>. Te muestro su ficha completa:', 'bot');
      const d = buildDetalle(p);
      if(d.response) addMessageTyped(d.response, 'bot');
      if(d.products) addProducts(d.products);
      if(d.quickReplies) renderQuickReplies(d.quickReplies);
      return;
    }
    addMessageTyped('Elegiste <strong>' + escapeHtml(p.nombre) + '</strong>.\n\n<strong>Ahora toca el SEGUNDO</strong> (solo te muestro los del mismo tipo, que son los que tiene sentido comparar):', 'bot');
    _pintarElegibles(rivales.slice(0, 8), '2️⃣', p2 => {
      const r = buildComparacion(p, p2);
      if(r.response) addMessageTyped(r.response, 'bot');
      if(r.compare) addCompareTable(r.compare);
      if(r.quickReplies) renderQuickReplies(r.quickReplies);
      _compSel = { p1: null, lista: [] };
    });
    renderQuickReplies(['🔄 Elegir otro primero','📦 Ver categorías']);
  }


  /* ══════════════════════════════════════════════════════════
     PRUEBA SOCIAL, LEADS Y CARRITO
     ══════════════════════════════════════════════════════════
     Tres cosas que el sitio ya tenía y el chat no usaba:
     · resenas-cache.json — opiniones reales de clientes. Enseñar que otro
       ya lo compró y quedó contento vende más que cualquier adjetivo.
     · el nodo /interesados de Firebase — el admin ya lo lee y lo muestra
       como "N interesados sin atender". Cada cliente que pide algo por el
       chat es un lead; antes se perdía.
     · el carrito real de la tienda — el chat solo sabía pedir de UNO en
       uno, así que el cliente que quería tres cosas tenía que escribir
       tres veces por WhatsApp. */

  let _resenas = null;   // {productoId: [{autor, texto, estrellas, fecha}]}

  function _cargarResenas(){
    if (_resenas !== null) return Promise.resolve(_resenas);
    _resenas = {};
    return fetch('resenas-cache.json', { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.por_producto) _resenas = j.por_producto; return _resenas; })
      .catch(() => _resenas);
  }

  function resenasDe(id){
    const arr = _resenas && _resenas[String(id)];
    return Array.isArray(arr) ? arr : [];
  }

  function _estrellas(n){
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  // Bloque de opiniones para la ficha. Devuelve '' si no hay ninguna: mejor
  // no decir nada que enseñar un "0 reseñas" que resta confianza.
  function bloqueResenas(p){
    const rs = resenasDe(p.id);
    if(!rs.length) return '';
    const media = rs.reduce((a,r) => a + (Number(r.estrellas)||0), 0) / rs.length;
    let t = `\n💬 <strong>Lo que dicen quienes lo compraron</strong> (${rs.length} opinión${rs.length>1?'es':''}, ${media.toFixed(1)} ${_estrellas(media)})\n`;
    rs.slice(0,2).forEach(r => {
      const txt = String(r.texto||'').trim();
      t += `• <em>${escapeHtml(r.autor||'Cliente')}</em> ${_estrellas(r.estrellas)}: "${escapeHtml(txt.length>140 ? txt.slice(0,140)+'…' : txt)}"\n`;
    });
    return t;
  }

  // Lead al admin. La regla de Firebase exige ts dentro de ±5 min, así que
  // se manda el reloj del cliente tal cual y se deja fallar en silencio si
  // va desfasado: no vale la pena romperle el chat por esto.
  function registrarInteres(p, origen){
    try {
      if (typeof tmRegistrarInteresWhatsApp === 'function'){ tmRegistrarInteresWhatsApp(p.id, origen || 'bot'); return; }
      const base = (typeof _fbRtdbUrl === 'function') ? _fbRtdbUrl() : null;
      if (!base) return;
      const ts = Date.now();
      fetch(base + '/interesados/' + p.id + '/' + ts + '.json', {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ts, producto: String(p.nombre).slice(0,200), productoId: String(p.id), origen: origen || 'bot' })
      }).catch(() => {});
    } catch(e){}
  }

  // ── Carrito: se usa el DE LA TIENDA, no uno propio ──
  // Si el bot llevara su propia lista, el cliente añadiría tres cosas por el
  // chat y el icono del carrito seguiría en cero.
  function carritoDelSitio(){
    try { if (typeof carrito !== 'undefined' && Array.isArray(carrito)) return carrito; } catch(e){}
    return null;
  }
  function resumenCarrito(){
    const c = carritoDelSitio();
    if(!c || !c.length) return null;
    const total = c.reduce((s,i) => s + (Number(i.precio)||0) * (Number(i.cantidad)||1), 0);
    const unidades = c.reduce((s,i) => s + (Number(i.cantidad)||1), 0);
    return { items: c, total, unidades };
  }

  function addProducts(products){
    if(!products || products.length === 0) return;
    const wrap = document.createElement('div');
    wrap.className = 'tm-bot-products';
    products.forEach(p => {
      const item = document.createElement('div');
      item.className = 'tm-bot-product';
      const agotado = p.stock === 0;
      // Imagen con fallback multinivel: original → thumbs/ → placeholder
      const imgInfo = imageUrl(p);
      const imgSrc = imgInfo ? imgInfo.primary : PLACEHOLDER_IMG;
      item.innerHTML = `
        <img class="tm-bot-product-img" src="${escapeAttr(imgSrc)}" alt="" loading="lazy" onerror="if(this.src!=='${escapeAttr(imgInfo?imgInfo.thumb:PLACEHOLDER_IMG)}'){this.src='${escapeAttr(imgInfo?imgInfo.thumb:PLACEHOLDER_IMG)}';}else{this.src='${PLACEHOLDER_IMG}';this.onerror=null;}">
        <div class="tm-bot-product-info">
          <div class="tm-bot-product-name">${escapeHtml(p.nombre)}</div>
          <div class="tm-bot-product-price">${fmtUSD(p.precio)} USD <span class="mn">· ${fmtMN(p.precio)}</span></div>
          <div class="tm-bot-product-stock ${agotado?'out':''}">${agotado ? '❌ Agotado' : '📦 ' + p.stock + ' en stock'}</div>
        </div>
        <div class="tm-bot-product-go">›</div>
      `;
      item.onclick = () => {
        // Si el producto es de ROPA o LLANTAS, mostrar selector de talla/medida primero
        const subcatUpper = (p.subcategoria||'').toUpperCase();
        const catUpper = (p.categoria||'').toUpperCase();
        if(catUpper === 'ROPA' || subcatUpper === 'ROPA' || subcatUpper === 'HOMBRE' || subcatUpper === 'LENCERÍA' || subcatUpper === 'LENCERIA'){
          showSizeSelector(p, 'ropa');
          return;
        }
        if(subcatUpper === 'LLANTAS' || /llanta|neum[aá]tico|goma/i.test(p.nombre)){
          showSizeSelector(p, 'llanta');
          return;
        }
        const r = buildDetalle(p);
        if(r.response) addMessageTyped(r.response, 'bot');
        if(r.products) addProducts(r.products);
        if(r.quickReplies) renderQuickReplies(r.quickReplies);
      };
      wrap.appendChild(item);
    });
    bodyEl.appendChild(wrap);
    _scrollAlFondo();
    _lastProductsShown = products;
  }

  // Selector de talla/medida antes de armar pedido de WhatsApp
  function showSizeSelector(p, tipo){
    const subcatUpper = (p.subcategoria||'').toUpperCase();
    let opciones = [];
    let titulo = '';
    if(tipo === 'ropa'){
      titulo = '👕 Selecciona tu talla';
      opciones = ['XS','S','M','L','XL','XXL','3XL'];
    } else if(tipo === 'llanta'){
      titulo = '🛞 Selecciona la medida';
      // Medidas de llantas más comunes en Cuba
      opciones = ['175/70 R13','175/70 R14','185/65 R14','185/65 R15','195/65 R15','205/55 R16','215/60 R16','155/80 R13','165/70 R13','175/65 R14'];
    }
    let body = `${titulo} para <strong>${escapeHtml(p.nombre)}</strong>:\n\nSelecciona una opción y te armo el enlace de WhatsApp con tu pedido ya listo:`;

    addMessageTyped(body, 'bot');
    // Renderizar tarjetas con las opciones de talla
    const wrap = document.createElement('div');
    wrap.className = 'tm-bot-products';
    opciones.forEach(opcion => {
      const item = document.createElement('div');
      item.className = 'tm-bot-product';
      item.innerHTML = `
        <div class="tm-bot-product-info" style="margin-left:8px">
          <div class="tm-bot-product-name">${escapeHtml(opcion)}</div>
          <div class="tm-bot-product-stock">Tocar para pedir →</div>
        </div>
        <div class="tm-bot-product-go">›</div>
      `;
      item.onclick = () => {
        const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('¡Hola TiendaMax! Quiero pedir: ' + p.nombre + ' — Talla/medida: ' + opcion + ' — Precio: ' + fmtUSD(p.precio) + ' (' + fmtMN(p.precio) + ')')}`;
        let msg = `✅ ¡Listo! Tu pedido con talla <strong>${escapeHtml(opcion)}</strong>:\n\n`;
        msg += `📦 <strong>${escapeHtml(p.nombre)}</strong>\n`;
        msg += `📏 Talla/medida: <strong>${escapeHtml(opcion)}</strong>\n`;
        msg += `💰 Precio: ${fmtUSD(p.precio)} (${fmtMN(p.precio)})\n\n`;
        msg += `Toca aquí para abrir WhatsApp con tu pedido ya armado:\n${url}`;
        addMessageTyped(msg, 'bot');
        renderQuickReplies(['💬 Abrir WhatsApp','📦 Ver más productos']);
      };
      wrap.appendChild(item);
    });
    bodyEl.appendChild(wrap);
    _scrollAlFondo();
  }

  function addCompareTable(cmp){
    const wrap = document.createElement('div');
    wrap.className = 'tm-bot-compare';
    const imgInfo1 = imageUrl(cmp.p1);
    const imgInfo2 = imageUrl(cmp.p2);
    const imgSrc1 = imgInfo1 ? imgInfo1.primary : PLACEHOLDER_IMG_SM;
    const imgThumb1 = imgInfo1 ? imgInfo1.thumb : PLACEHOLDER_IMG_SM;
    const imgSrc2 = imgInfo2 ? imgInfo2.primary : PLACEHOLDER_IMG_SM;
    const imgThumb2 = imgInfo2 ? imgInfo2.thumb : PLACEHOLDER_IMG_SM;
    let html = `<div class="tm-bot-compare-head"><span class="ic">🆚</span> Comparativa lado a lado</div>`;
    html += `<div class="tm-bot-compare-grid">`;
    html += `<div class="ch">Producto</div>`;
    html += `<div class="ch ch-img"><img src="${escapeAttr(imgSrc1)}" alt="" loading="lazy" onerror="if(this.src!=='${escapeAttr(imgThumb1)}'){this.src='${escapeAttr(imgThumb1)}';}else{this.src='${PLACEHOLDER_IMG_SM}';this.onerror=null;}"><div class="nm">${escapeHtml(cmp.p1.nombre.length>28?cmp.p1.nombre.slice(0,28)+'…':cmp.p1.nombre)}</div></div>`;
    html += `<div class="ch ch-img"><img src="${escapeAttr(imgSrc2)}" alt="" loading="lazy" onerror="if(this.src!=='${escapeAttr(imgThumb2)}'){this.src='${escapeAttr(imgThumb2)}';}else{this.src='${PLACEHOLDER_IMG_SM}';this.onerror=null;}"><div class="nm">${escapeHtml(cmp.p2.nombre.length>28?cmp.p2.nombre.slice(0,28)+'…':cmp.p2.nombre)}</div></div>`;
    cmp.rows.slice(1).forEach(row => {
      html += `<div class="row-label">${escapeHtml(row.label)}</div>`;
      const c1 = row.winner === 1 ? 'win' : (row.winner === 2 ? 'lose' : (row.winner === 0 ? 'neutral' : 'v'));
      const c2 = row.winner === 2 ? 'win' : (row.winner === 1 ? 'lose' : (row.winner === 0 ? 'neutral' : 'v'));
      let v1 = escapeHtml(String(row.v1));
      let v2 = escapeHtml(String(row.v2));
      if(row.v1MN) v1 += ` <span style="color:var(--muted);font-size:10px">(${escapeHtml(row.v1MN)})</span>`;
      if(row.v2MN) v2 += ` <span style="color:var(--muted);font-size:10px">(${escapeHtml(row.v2MN)})</span>`;
      html += `<div class="v ${c1}">${v1}</div>`;
      html += `<div class="v ${c2}">${v2}</div>`;
    });
    html += `</div>`;
    html += `<div class="tm-bot-compare-verdict">${cmp.verdict}</div>`;
    wrap.innerHTML = html;
    bodyEl.appendChild(wrap);
    _scrollAlFondo();
    _lastCompare = [cmp.p1, cmp.p2];
  }

  function renderQuickReplies(replies){
    quickRepliesEl.innerHTML = '';
    if(!replies || replies.length === 0) return;
    replies.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'tm-bot-quickreply';
      if(/whatsapp/i.test(r)) btn.classList.add('wa');
      if(/comparar|compar/i.test(r.toLowerCase())) btn.classList.add('compare');
      btn.textContent = r;
      btn.onclick = () => handleQuickReply(r);
      quickRepliesEl.appendChild(btn);
    });
  }

  function handleQuickReply(reply){
    const r = reply.toLowerCase();
    // Va la primera: el documento se arma con lo que ya está en memoria, sin
    // volver a preguntarle nada al cliente.
    if(/cotizaci[oó]n|propuesta t[eé]cnica/.test(r)){ abrirCotizacion(); return; }
    if(/sigue igual/.test(r)){
      addMessageTyped(`Entonces hay que verlo con el modelo delante. Mándame por WhatsApp:\n\n• <strong>Marca y modelo</strong> exactos (están en la pegatina de atrás)\n• Una <strong>foto de la pantalla o de las luces</strong> como están ahora\n• Qué tenías conectado cuando empezó\n\nCon eso lo miro yo. No abras el aparato mientras tanto: abrirlo anula la garantía.`, 'bot');
      renderQuickReplies(['💬 WhatsApp']);
      return;
    }
    // Estas tres van primero a propósito: /whatsapp/ de más abajo las
    // capturaría y abriría un chat vacío en vez de hacer lo que dicen.
    if(/pedir por whatsapp/.test(r)){
      const p = _context.lastProduct;
      if(p){ pedirProductoPorWhatsApp(p); return; }
    }
    if(/ver en la tienda/.test(r)){
      const p = _context.lastProduct;
      if(p){ abrirFichaEnTienda(p.id); return; }
    }
    // Carrito de la tienda (el mismo del icono del header, no uno del bot).
    if(/a[ñn]adir al carrito|agregar al carrito/.test(r)){
      const p = _context.lastProduct;
      if(p){
        if(agregarAlCarritoTienda(p.id)){
          const c = resumenCarrito();
          let t = `🛍️ Añadí <strong>${escapeHtml(p.nombre)}</strong> al carrito.`;
          if(c) t += ` Ya llevas <strong>${c.unidades}</strong> artículo${c.unidades>1?'s':''} por <strong>${fmtUSD(c.total)}</strong>.`;
          t += `\nPuedes seguir mirando y pedirlo todo junto de una vez.`;
          addMessageTyped(t, 'bot');
          renderQuickReplies(['🧾 Ver mi carrito','💳 Pedir todo el carrito','📦 Ver más productos']);
        } else {
          addMessageTyped(`No pude añadirlo desde aquí. Ábrelo en la tienda y usa el botón de carrito.`, 'bot');
          renderQuickReplies(['👁️ Ver en la tienda','🛒 Pedir por WhatsApp']);
        }
        return;
      }
      addMessageTyped(`Primero enséñame cuál. Escribe algo como <em>"háblame del router Tenda"</em> y te doy el botón para añadirlo.`, 'bot');
      renderQuickReplies(['📦 Ver productos']);
      return;
    }
    if(/ver mi carrito|qu[eé] llevo en el carrito/.test(r)){ sendMessage('qué llevo en el carrito'); return; }
    if(/pedir todo el carrito|comprar el carrito/.test(r)){
      const c = resumenCarrito();
      if(!c){
        addMessageTyped(`Tu carrito está vacío. Dime qué buscas y te lo voy armando.`, 'bot');
        renderQuickReplies(['📦 Ver categorías','🔥 Lo más vendido']);
        return;
      }
      if(typeof comprarCarrito === 'function'){
        addMessageTyped(`💳 Te abro WhatsApp con los <strong>${c.unidades}</strong> artículos del carrito (${fmtUSD(c.total)}). Solo tienes que darle enviar.`, 'bot');
        try { comprarCarrito(); } catch(e){}
      } else {
        pedirProductoPorWhatsApp(c.items[0]);
      }
      return;
    }
    if(/quitar de deseos/.test(r)){
      const p = _context.lastProduct;
      if(p){
        removeFromWishlist(p.id);
        addMessageTyped(`💔 Quité <strong>${escapeHtml(p.nombre)}</strong> de tu lista. También desapareció del ❤️ del catálogo.`, 'bot');
        renderQuickReplies(['💝 Ver mi lista','📦 Ver más productos']);
        return;
      }
    }
    if(/whatsapp/i.test(r)){ window.open('https://wa.me/' + WHATSAPP, '_blank', 'noopener,noreferrer'); return; }
    // Lista de deseos
    if(/añadir a deseos|añade a deseos|agregar a deseos/i.test(r)){
      if(_context.lastProduct){
        if(addToWishlist(_context.lastProduct)){
          addMessageTyped(`❤️ ¡Listo! Añadí <strong>${escapeHtml(_context.lastProduct.nombre)}</strong> a tu lista de deseos. Es la misma lista del ❤️ del catálogo, así que también lo verás ahí.`, 'bot');
          renderQuickReplies(['💝 Ver mi lista','📦 Ver más productos','💬 WhatsApp']);
        } else {
          addMessageTyped(`Ese producto ya está en tu lista de deseos.`, 'bot');
          renderQuickReplies(['💝 Ver mi lista','📦 Ver productos']);
        }
      } else {
        addMessageTyped(`Primero muéstrame un producto. Escribe algo como <em>"háblame del router Tenda AC1200"</em> y luego podrás añadirlo.`, 'bot');
        renderQuickReplies(['📦 Ver productos','💝 Ver mi lista']);
      }
      return;
    }
    if(/ver mi lista|mi lista de deseos|ver lista|mis favoritos/i.test(r)){
      sendMessage('ver mi lista de deseos');
      return;
    }
    if(/vaciar lista|vaciar deseos|limpiar lista/i.test(r)){
      sendMessage('vaciar mi lista de deseos');
      return;
    }
    if(/pedir todo/i.test(r)){
      sendMessage('pedir todo de mi lista por WhatsApp');
      return;
    }
    if(/ver cobertura|ver zonas con cobertura/i.test(r)){
      sendMessage('cobertura de envíos');
      return;
    }
    // Reset conversación
    if(/reiniciar conversaci[oó]n|reiniciar chat|empezar de nuevo/i.test(r)){
      resetChat();
      return;
    }
    // Envíos
    if(/env[ií]o a la habana|envio a la habana/i.test(r)){
      sendMessage('envío a La Habana');
      return;
    }
    if(/env[ií]o a mi provincia|envio a mi provincia/i.test(r)){
      sendMessage('cuánto cuesta el envío a provincias');
      return;
    }
    if(/ver otra zona|ver provincias/i.test(r)){
      sendMessage('cuánto cuesta el envío a provincias');
      return;
    }
    // Pagos
    if(/pago en mn|pago mn/i.test(r)){ sendMessage('pago en MN'); return; }
    if(/pago con zelle|pago zelle/i.test(r)){ sendMessage('pago con Zelle'); return; }
    if(/pago por transferencia|transferencia bancaria/i.test(r)){ sendMessage('pago por transferencia bancaria'); return; }
    if(/enzona/i.test(r)){ sendMessage('pago por EnZona'); return; }
    if(/ver otros m[eé]todos|ver otros metodos/i.test(r)){ sendMessage('métodos de pago'); return; }
    // Comparar por tipo: en vez de agarrar los dos primeros, se muestran los
    // disponibles de ese tipo para que el cliente elija cuáles quiere.
    const _tipoComp = [
      [/comparar.*router|compara.*router/, 'ROUTERS', 'routers'],
      [/comparar.*bater|compara.*bater/,   'BATERÍAS', 'baterías'],
      [/comparar.*c[aá]mara|compara.*c[aá]mara/, 'CÁMARAS', 'cámaras'],
      [/comparar.*inversor|compara.*inversor/,   'INVERSORES', 'inversores'],
    ].find(t => t[0].test(r));
    if(_tipoComp){
      const lista = PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase() === _tipoComp[1] && x.stock > 0)
                             .sort((a,b) => a.precio - b.precio);
      pedirElegirPrimero(lista, 'Esto es lo que tengo en ' + _tipoComp[1]);
      return;
    }
    if(/comparar dos de (wif|energi|seguridad|carros|motos|hogar|celulares|audio|juegos|ropa|pc|gym|utiles|router|bater|c[aá]mara|inversor|cargador|cerradura|alarma|antena|switch|panel|controlador)/.test(r)){
      const catMatch = r.match(/comparar dos de (\w+)/);
      if(catMatch){
        const key = catMatch[1].toUpperCase();
        let lista = PRODUCTOS.filter(x => (x.subcategoria||'').toUpperCase().startsWith(key) && x.stock > 0);
        if(lista.length < 2) lista = PRODUCTOS.filter(x => (x.categoria||'').toUpperCase().startsWith(key) && x.stock > 0);
        if(lista.length >= 2){
          pedirElegirPrimero(lista.sort((a,b) => a.precio - b.precio), 'Elige cuáles quieres comparar');
          return;
        }
      }
      sendMessage('quiero comparar dos productos');
      return;
    }
    if(/comparar dos de estos/.test(r)){
      // Antes comparaba el 1º con el 2º de lo que hubiera en pantalla. Si
      // querías el tercero contra el quinto, no había manera de pedirlo.
      pedirElegirPrimero(_lastProductsShown, 'De los que te acabo de mostrar');
      return;
    }
    if(/elegir otro primero/.test(r)){
      pedirElegirPrimero(_compSel.lista.length ? _compSel.lista : _lastProductsShown, 'Empezamos de nuevo');
      return;
    }
    // "Comparar con otro" desde la ficha de un producto concreto
    if(/comparar con otro/.test(r)){
      const base = _context.lastProduct;
      if(base){
        const rivales = PRODUCTOS.filter(x => String(x.id) !== String(base.id) && x.stock > 0 && sonComparables(base, x).ok);
        if(rivales.length){
          _compSel = { p1: base, lista: rivales };
          addMessageTyped('Comparando <strong>' + escapeHtml(base.nombre) + '</strong>.\n\n<strong>Toca con cuál</strong> quieres compararlo:', 'bot');
          _pintarElegibles(rivales.sort((a,b) => a.precio - b.precio).slice(0, 8), '2️⃣', p2 => {
            const r2 = buildComparacion(base, p2);
            if(r2.response) addMessageTyped(r2.response, 'bot');
            if(r2.compare) addCompareTable(r2.compare);
            if(r2.quickReplies) renderQuickReplies(r2.quickReplies);
          });
          renderQuickReplies(['📦 Ver categorías','💬 WhatsApp']);
          return;
        }
      }
    }
    if(/comparar dos/.test(r)){ sendMessage('quiero comparar dos productos'); return; }
    if(/arma.*sistema solar|sistema solar/.test(r)){ sendMessage('arma un sistema solar básico'); return; }
    if(/kit.*seguridad/.test(r)){ sendMessage('arma un kit de seguridad para casa'); return; }
    if(/calcular autonom/.test(r)){ sendMessage('cuánto dura una batería de 100Ah con mi nevera'); return; }
    if(/autonom.*nevera/.test(r)){ sendMessage('cuánto dura una batería de 100Ah con mi nevera'); return; }
    if(/ver ficha/.test(r)){
      const name = reply.replace(/^📦\s*Ver ficha\s*/i,'').replace(/…$/,'').trim();
      const p = findProduct(name, {includeAgotados:true})
             || _lastCompare.find(x => x.nombre.startsWith(name))
             || _lastProductsShown.find(x => x.nombre.startsWith(name));
      if(p){
        const r2 = buildDetalle(p);
        if(r2.response) addMessageTyped(r2.response, 'bot');
        if(r2.products) addProducts(r2.products);
        if(r2.quickReplies) renderQuickReplies(r2.quickReplies);
        return;
      }
    }
    if(/alternativas/.test(r)){
      if(_lastProductsShown[0]){
        const subcat = _lastProductsShown[0].subcategoria;
        const alt = PRODUCTOS.filter(p => (p.subcategoria||'') === subcat && p.id !== _lastProductsShown[0].id && p.stock > 0).slice(0,4);
        addMessageTyped(`📦 Alternativas disponibles del mismo tipo (${subcat}):`, 'bot');
        addProducts(alt);
        renderQuickReplies(['🆚 Comparar dos de estos','💬 WhatsApp']);
      }
      return;
    }
    if(/otras categor/.test(r)){ sendMessage('qué categorías tienen'); return; }
    if(/productos con stock/.test(r)){
      const disp = PRODUCTOS.filter(p => p.stock > 0).slice(0,4);
      addMessageTyped(`📦 Productos con stock ahora mismo:`, 'bot');
      addProducts(disp);
      return;
    }
    // "🛍️ Ver los 12 en la tienda" → abrir la vista real del catálogo
    if(/ver los \d+ en la tienda/.test(r)){
      const cat = _context.lastCategory;
      if(cat && typeof mostrarVistaCategoria === 'function'){
        try { mostrarVistaCategoria(cat); closePanel(); return; } catch(e){}
      }
    }
    // Chips de subcategoría ("📂 ROUTERS") dentro de la categoría actual
    if(/^📂/.test(reply)){
      const sub = reply.replace(/^📂\s*/, '').trim();
      const cat = _context.lastCategory;
      const lista = PRODUCTOS.filter(p => p.stock > 0 &&
        (p.subcategoria || 'OTROS').toUpperCase() === sub.toUpperCase() &&
        (!cat || p.categoria === cat)).sort((a,b) => a.precio - b.precio);
      if(lista.length){
        addMessageTyped(`📂 <strong>${escapeHtml(sub)}</strong> — <em>${lista.length} disponible${lista.length>1?'s':''}</em>, de más barato a más caro:`, 'bot');
        addProducts(lista.slice(0, TM_MAX_TARJETAS_CAT));
        renderQuickReplies(lista.length >= 2 ? ['🆚 Comparar dos de estos','📦 Otras categorías','💬 WhatsApp'] : ['📦 Otras categorías','💬 WhatsApp']);
        return;
      }
    }
    // Chip de categoría del menú ("📶 WIFI"): antes no coincidía con ningún
    // caso —no contiene "categor"— y caía en el sendMessage del final, que
    // acababa en búsqueda difusa por texto.
    {
      const cat = _detectarCategoriaPedida(reply);
      if(cat){ sendMessage(reply); return; }
    }
    if(/categor/i.test(r) || /ver productos/.test(r)){ sendMessage('qué categorías tienen'); return; }
    if(/ofertas?/.test(r)){ sendMessage('qué ofertas tienen'); return; }
    if(/c[oó]mo comprar/.test(r)){ sendMessage('cómo comprar'); return; }
    if(/env[ií]o/.test(r)){ sendMessage('hacen envíos?'); return; }
    if(/qué.*puerto wan/.test(r)){ sendMessage('qué router tiene puerto wan'); return; }
    if(/ver inversores/.test(r)){
      const invs = PRODUCTOS.filter(p => (p.subcategoria||'').toUpperCase() === 'INVERSORES' && p.stock > 0).slice(0,4);
      addMessageTyped(`📦 Inversores disponibles:`, 'bot');
      addProducts(invs);
      return;
    }
    if(/ver bater/.test(r)){
      const bats = PRODUCTOS.filter(p => (p.subcategoria||'').toUpperCase() === 'BATERÍAS' && p.stock > 0).slice(0,4);
      addMessageTyped(`📦 Baterías disponibles:`, 'bot');
      addProducts(bats);
      return;
    }
    if(/ver repetidores/.test(r)){
      const reps = PRODUCTOS.filter(p => /repetidor|extensor/i.test(p.nombre) && p.stock > 0).slice(0,4);
      addMessageTyped(`📦 Repetidores wifi disponibles:`, 'bot');
      addProducts(reps);
      return;
    }
    sendMessage(reply);
  }

  async function sendMessage(text){
    text = (text||'').trim();
    if(!text || _sending) return;
    _sending = true;
    inputEl.value = '';
    hideSuggestions();
    sendBtn.disabled = true;
    addMessage(escapeHtml(text), 'user');
    saveHistory(); // guardar tras mensaje del usuario
    addTyping();
    const delay = 350 + Math.random() * 500 + Math.min(text.length * 8, 600);
    await new Promise(r => setTimeout(r, delay));
    removeTyping();
    try {
      const data = responder(text);
      // Fire-and-forget: si Firebase no está configurado o el PATCH falla, el
      // chat sigue igual. responder() acaba de dejar la intención en _context.
      _registrarPreguntaFAQ(text, _context.lastIntent, data.response);
      if(data.response) addMessageTyped(data.response, 'bot');
      // Señales del flujo de comparación: en vez de un texto, se pintan las
      // opciones para que el cliente elija tocando cuál va contra cuál.
      if(data.elegirComparar){ pedirElegirPrimero(data.elegirComparar, data.tituloComparar); saveHistory(); return; }
      if(data.elegirRival){ elegirPrimero(data.elegirRival); saveHistory(); return; }
      if(data.compare) addCompareTable(data.compare);
      else if(data.products) addProducts(data.products);
      renderQuickReplies(data.quickReplies || defaultQuickReplies());
      saveHistory(); // guardar tras respuesta del bot
    } catch(e){
      addMessageTyped('😅 Tuve un problemita técnico procesando eso. ¿Puedes reformular? También puedes escribirnos por WhatsApp.', 'bot');
      renderQuickReplies(['💬 WhatsApp','📦 Categorías']);
      saveHistory();
    } finally {
      _sending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  function defaultQuickReplies(){
    return ['🔥 Ofertas','📦 Categorías','🆚 Comparar dos productos','💬 WhatsApp'];
  }

  let _activeSuggestionIdx = -1;
  let _currentSuggestions = [];

  function showSuggestions(query){
    if(!query || query.length < 2){ hideSuggestions(); return; }
    const prods = findProducts(query, 5);
    if(prods.length === 0){
      const actions = [
        {ic:'🆚', name:'Comparar dos productos', meta:'Ej: router Kuwfi vs Tenda', action:'comparar dos productos'},
        {ic:'☀️', name:'Armar sistema solar', meta:'Kit completo con todos los componentes', action:'arma un sistema solar básico'},
        {ic:'🔒', name:'Kit de seguridad', meta:'Para casa o negocio', action:'arma un kit de seguridad para casa'},
        {ic:'⏱️', name:'Calcular autonomía', meta:'¿Cuánto dura una batería?', action:'cuánto dura una batería de 100Ah con mi nevera'},
        {ic:'📖', name:'¿Qué significa un término?', meta:'WAN, MPPT, LiFePO4, PoE...', action:'qué es el puerto wan'},
      ];
      _currentSuggestions = actions;
      renderSuggestions(actions.map(a => ({...a, isAction:true})));
      return;
    }
    _currentSuggestions = prods.map(p => ({
      id: p.id, img: p.imagen, name: p.nombre, meta: `${fmtUSD(p.precio)} · ${p.categoria}` + (p.stock===0?' · AGOTADO':''), isProduct:true, p
    }));
    renderSuggestions(_currentSuggestions);
  }

  function renderSuggestions(items){
    if(items.length === 0){ hideSuggestions(); return; }
    suggestionsEl.innerHTML = '';
    items.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'tm-bot-suggestion';
      div.dataset.idx = idx;
      if(it.img){
        div.innerHTML = `<div class="ic"><img src="${escapeAttr(it.img)}" alt="" onerror="this.parentNode.classList.add('placeholder');this.parentNode.textContent='📦';"></div><div class="tm-bot-suggestion-info"><div class="tm-bot-suggestion-name">${escapeHtml(it.name)}</div><div class="tm-bot-suggestion-meta">${escapeHtml(it.meta)}</div></div><div class="tm-bot-suggestion-action">Ver ficha</div>`;
      } else {
        div.innerHTML = `<div class="ic placeholder">${it.ic||'🔍'}</div><div class="tm-bot-suggestion-info"><div class="tm-bot-suggestion-name">${escapeHtml(it.name)}</div><div class="tm-bot-suggestion-meta">${escapeHtml(it.meta||'')}</div></div><div class="tm-bot-suggestion-action">Ir</div>`;
      }
      div.onclick = () => {
        if(it.isProduct){
          hideSuggestions();
          inputEl.value = '';
          const r = buildDetalle(it.p);
          addMessage(escapeHtml('Háblame de: ' + it.p.nombre), 'user');
          addTyping();
          setTimeout(() => {
            removeTyping();
            if(r.response) addMessageTyped(r.response, 'bot');
            if(r.products) addProducts(r.products);
            if(r.quickReplies) renderQuickReplies(r.quickReplies);
          }, 500);
        } else if(it.isAction){
          hideSuggestions();
          inputEl.value = '';
          sendMessage(it.action);
        }
      };
      suggestionsEl.appendChild(div);
    });
    suggestionsEl.classList.add('show');
    _activeSuggestionIdx = -1;
  }

  function hideSuggestions(){
    suggestionsEl.classList.remove('show');
    suggestionsEl.innerHTML = '';
    _activeSuggestionIdx = -1;
    _currentSuggestions = [];
  }

  function moveSuggestion(delta){
    if(_currentSuggestions.length === 0) return;
    _activeSuggestionIdx = (_activeSuggestionIdx + delta + _currentSuggestions.length) % _currentSuggestions.length;
    $$('.tm-bot-suggestion', suggestionsEl).forEach((el, i) => {
      el.classList.toggle('active', i === _activeSuggestionIdx);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  PERSISTENCIA EN localStorage (recuerda chat entre recargas)
  // ════════════════════════════════════════════════════════════
  const STORAGE_KEY = 'tm_bot_history_v1';
  const CONTEXT_KEY = 'tm_bot_context_v1';
  const WISHLIST_KEY = 'tm_bot_wishlist_v1';
  const MAX_STORED = 30; // máximo mensajes a persistir

  // ─── LISTA DE DESEOS (favoritos) ───
  // La lista del bot ES la lista del ❤️ de la tienda (wishlist_v1). Antes
  // eran dos listas distintas: el cliente añadía algo desde el chat y el
  // corazón del header seguía en cero, sin explicación posible.
  function getWishlist(){
    const ids = _favIds();
    return ids.map(id => {
      const p = PRODUCTOS.find(x => String(x.id) === String(id));
      return p ? {id: p.id, nombre: p.nombre, precio: p.precio, imagen: p.imagen, categoria: p.categoria} : null;
    }).filter(Boolean);
  }
  function saveWishlist(list){
    _guardarFavIds((list || []).map(x => String(x.id)));
  }
  function addToWishlist(p){
    const ids = _favIds();
    if(ids.indexOf(String(p.id)) !== -1) return false;
    ids.push(String(p.id));
    _guardarFavIds(ids);
    return true;
  }
  function removeFromWishlist(id){
    _guardarFavIds(_favIds().filter(x => x !== String(id)));
  }
  function isInWishlist(id){
    return _favIds().indexOf(String(id)) !== -1;
  }

  // ─── Ver lista de deseos formateada ───
  function buildWishlistResponse(){
    const list = getWishlist();
    if(list.length === 0){
      return {
        response: `💝 <strong>Tu lista de deseos está vacía</strong>\n\nPara añadir productos, mirá la ficha de cualquier producto y verás un botón <em>❤️ Añadir a deseos</em>. También puedes escribir:\n• <em>"añade el router Tenda a mi lista"</em>\n• <em>"quiero guardar este producto"</em>\n\nLa lista se guarda en tu navegador y queda disponible aunque cierres la página.`,
        quickReplies: ['📦 Ver productos','🔥 Ofertas','💬 WhatsApp']
      };
    }
    const total = list.reduce((s, p) => s + p.precio, 0);
    let body = `💝 <strong>Tu lista de deseos</strong> (${list.length} producto${list.length>1?'s':''}):\n\n`;
    list.forEach((p, i) => {
      body += `<strong>${i+1}.</strong> ${escapeHtml(p.nombre)} — ${fmtUSD(p.precio)}\n`;
    });
    body += `\n💰 <strong>Total estimado:</strong> ${fmtUSD(total)} · <em>${fmtMN(total)}</em>\n\n`;
    body += `Para pedir todos, escríbenos por WhatsApp con la lista. Para quitar uno, dime "quita de deseos [nombre]".`;
    return {
      response: body,
      products: list.map(p => PRODUCTOS.find(x => x.id === p.id)).filter(Boolean).slice(0,4),
      quickReplies: ['💬 Pedir todo por WhatsApp','📦 Ver productos','🗑️ Vaciar lista']
    };
  }

  function saveHistory(){
    try {
      const toSave = _messages.slice(-MAX_STORED).map(m => ({
        html: m.html,
        who: m.who,
        ts: Date.now()
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      localStorage.setItem(CONTEXT_KEY, JSON.stringify(_context));
    } catch(e){ /* localStorage puede no estar disponible */ }
  }
  function loadHistory(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const msgs = JSON.parse(raw);
      if(!Array.isArray(msgs) || msgs.length === 0) return null;
      // Restaurar contexto
      const ctxRaw = localStorage.getItem(CONTEXT_KEY);
      if(ctxRaw){
        try { _context = JSON.parse(ctxRaw); } catch(e) {}
      }
      return msgs;
    } catch(e){ return null; }
  }
  function clearHistory(){
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CONTEXT_KEY);
    } catch(e){}
  }

  function openPanel(){
    panel.classList.add('open');
    _panelOpen = true;
    bubble.classList.remove('has-new');
    const badge = bubble.querySelector('.tm-bot-badge');
    if(badge) badge.remove();
    welcome.classList.remove('visible');
    setTimeout(() => inputEl.focus(), 300);
    if(_messages.length === 0){
      // Intentar cargar historial previo de localStorage
      const prev = loadHistory();
      if(prev && prev.length > 0){
        addDateSep();
        // Avisar al usuario que se restauró la conversación
        const restMsg = document.createElement('div');
        restMsg.className = 'tm-bot-date-sep';
        restMsg.style.color = 'var(--coral-2)';
        restMsg.textContent = '↩️ Conversación anterior restaurada';
        bodyEl.appendChild(restMsg);
        prev.forEach(m => {
          const msg = document.createElement('div');
          msg.className = 'tm-bot-msg ' + m.who;
          msg.innerHTML = m.who === 'bot' ? linkificar(m.html) : m.html;
          bodyEl.appendChild(msg);
          _messages.push({html: m.html, who: m.who});
        });
        _scrollAlFondo();
        addMessageTyped(`¡Hola de nuevo! 👋 Recuperé tu conversación anterior. ¿Continuamos o prefieres <em>reiniciar</em>?`, 'bot');
        renderQuickReplies(['🔄 Reiniciar conversación','📦 Categorías','💬 WhatsApp']);
      } else {
        addDateSep();
        const saludo = R.saludo('hola');
        addMessageTyped(saludo.response, 'bot');
        renderQuickReplies(saludo.quickReplies);
      }
    }
  }
  function closePanel(){
    panel.classList.remove('open');
    _panelOpen = false;
    hideSuggestions();
  }

  function resetChat(){
    bodyEl.innerHTML = '';
    _messages = [];
    _lastProductsShown = [];
    _lastCompare = [];
    _context = { lastProduct: null, lastIntent: null, lastCategory: null, presupuesto: null, conversationStep: 0 };
    clearHistory();
    addDateSep();
    const saludo = R.saludo('hola');
    addMessageTyped(saludo.response, 'bot');
    renderQuickReplies(saludo.quickReplies);
  }

  // ════════════════════════════════════════════════════════════
  //  Capacidades — ampliadas v3
  // ════════════════════════════════════════════════════════════
  const CAPACIDADES = [
    {ic:'🆚', title:'Comparar (solo del mismo tipo)', desc:'Compara cargador con cargador, router con router, batería con batería. Rechaza mezclas sin sentido.', try:'compara el router Kuwfi 4G vs el Tenda AC1200'},
    {ic:'💝', title:'Lista de deseos (favoritos)', desc:'Guarda productos para después. Total acumulado y pedido completo por WhatsApp.', try:'ver mi lista de deseos'},
    {ic:'📖', title:'Preguntas técnicas explicadas', desc:'Pregunta "qué router tiene puerto WAN" y te lo explico + te muestro los que cumplen.', try:'qué router tiene puerto wan'},
    {ic:'☀️', title:'Armar sistema solar completo', desc:'Kit con panel + controlador + batería + inversor. Elige tamaño: básico, mediano o completo.', try:'arma un sistema solar básico para apagones'},
    {ic:'🔒', title:'Kit de seguridad para casa', desc:'Cámaras + cerradura + alarma según tu caso (casa, negocio, exterior).', try:'arma un kit de seguridad para casa'},
    {ic:'⏱️', title:'Calcular autonomía de batería', desc:'Dime qué equipos conectas y te calculo cuántas horas duran con cada batería.', try:'cuánto dura una batería de 100Ah con mi nevera'},
    {ic:'🔌', title:'Compatibilidad inversor ↔ electrodomésticos', desc:'Dime qué equipos conectarás y te digo qué inversor los aguanta, considerando picos de arranque.', try:'este inversor sirve para mi nevera y mi tv'},
    {ic:'🔧', title:'Diagnóstico de averías', desc:'Dime qué hace el aparato — pita, parpadea, se apaga — y te digo qué significa y qué hacer antes de moverlo.', try:'mi inversor pita y tiene la luz roja encendida'},
    {ic:'📄', title:'Propuesta técnica en PDF', desc:'Del sistema que te arme, un documento con componentes, precios y autonomía, listo para imprimir o mandar por correo.', try:'arma un sistema solar mediano'},
    {ic:'💰', title:'Filtrar por presupuesto', desc:'Dime "tengo $100" y te muestro solo opciones dentro de tu presupuesto.', try:'tengo $100, ¿qué cámara me recomiendas?'},
    {ic:'🚚', title:'Envíos: Pinar del Río → Matanzas', desc:'Mensajería directa en occidente. Centro/Oriente: coordinar por WhatsApp.', try:'hacen envíos a santiago de cuba'},
    {ic:'💵', title:'Métodos de pago detallados', desc:'Efectivo USD/MN, Zelle, EnZona, transferencia bancaria, crypto (próximamente).', try:'métodos de pago'},
    {ic:'👕', title:'Selector de talla/medida', desc:'Para ropa y llantas, te pregunta la talla exacta antes de armar el pedido de WhatsApp.', try:'muéstrame ropa disponible'},
    {ic:'📋', title:'Ficha de cualquier producto', desc:'Con ficha técnica, garantía, descripción y accesorios sugeridos automáticamente.', try:'háblame del inversor solar de 3.6kW'},
    {ic:'🎯', title:'Recomendar por necesidad', desc:'Dime para qué lo necesitas y te recomiendo el producto justo (solo disponibles).', try:'necesito algo para vigilar mi casa de noche'},
    {ic:'🔥', title:'Ver ofertas', desc:'Productos con descuento activo y stock, ordenados por ahorro.', try:'qué ofertas tienen'},
    {ic:'💱', title:'Tasa del día (con margen)', desc:'1 USD = 695 MN (675 base + 20 margen). Conversión clara al instante.', try:'cuál es la tasa de hoy?'},
    {ic:'🤖', title:'Comandos rápidos', desc:'Escribe /ayuda para ver todos los comandos: /deseos, /ofertas, /envios, /pago, /tasa, /limpiar.', try:'/ayuda'},
    {ic:'💬', title:'Contactar humanos', desc:'Cuando necesites atención personal, te paso al WhatsApp de la tienda.', try:'dame el whatsapp'},
  ];

  function renderCapacidades(){
    if(!capGrid) return;
    capGrid.innerHTML = '';
    CAPACIDADES.forEach(c => {
      const card = document.createElement('div');
      card.className = 'tm-cap-card';
      card.innerHTML = `
        <div class="ic">${c.ic}</div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.desc)}</p>
        <span class="try">Probar →</span>
      `;
      card.onclick = () => {
        if(!_panelOpen) openPanel();
        setTimeout(() => sendMessage(c.try), 250);
      };
      capGrid.appendChild(card);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  Eventos
  // ════════════════════════════════════════════════════════════
  bubble.onclick = () => { _panelOpen ? closePanel() : openPanel(); };
  closeBtn.onclick = closePanel;
  resetBtn.onclick = resetChat;
  if(welcomeClose) welcomeClose.onclick = (e) => { e.stopPropagation(); welcome.classList.remove('visible'); };
  sendBtn.onclick = () => sendMessage(inputEl.value);
  inputEl.addEventListener('input', (e) => { showSuggestions(e.target.value); });
  inputEl.addEventListener('keydown', (e) => {
    if(_currentSuggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){
      e.preventDefault();
      moveSuggestion(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if(_currentSuggestions.length > 0 && e.key === 'Enter' && _activeSuggestionIdx >= 0){
      e.preventDefault();
      $$('.tm-bot-suggestion', suggestionsEl)[_activeSuggestionIdx]?.click();
      return;
    }
    if(e.key === 'Escape'){ hideSuggestions(); return; }
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });
  document.addEventListener('click', (e) => { if(!panel.contains(e.target)) hideSuggestions(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && _panelOpen){ closePanel(); } });

  // El cartel de bienvenida lo dispara js/tm-bot.js: existe desde que
  // carga la página, mucho antes de que este cerebro se descargue.
  renderCapacidades();

  // ── Pedido por WhatsApp con el producto ya escrito ──
  function pedirProductoPorWhatsApp(p){
    const mn = fmtMN(p.precio);
    const msg = `¡Hola TiendaMax! Quiero pedir: ${p.nombre} — ${fmtUSD(p.precio)} USD${mn ? ' (' + mn + ')' : ''}`;
    window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
    if(typeof tmTrackWhatsApp === 'function'){ try { tmTrackWhatsApp(p.id); } catch(e){} }
    // Queda como lead en el admin ("N interesados sin atender"), igual que
    // si hubiera pulsado Pedir en el catálogo.
    registrarInteres(p, 'bot');
  }

  _sincronizar();
  _cargarDescripciones();
  _cargarResenas();

  window._tmBot = {
    open: openPanel, close: closePanel, reset: resetChat, send: sendMessage,
    listo: true,
    sincronizar: _sincronizar,
    pedirProductoPorWhatsApp,
    abrirFichaEnTienda,
    agregarAlCarritoTienda,
    get productos(){ return PRODUCTOS; },
    findProducts: (q, n, opts) => findProducts(q, n||4, opts||{}),
    findProduct: (q, opts) => findProduct(q, opts||{}),
    responder,
    buildComparacion,
    buildDetalle,
    detectTechTerms,
    detectProductMentions,
    detectIntent,
    detectPresupuesto,
    findProductsByTechSpec,
    sonComparables,
    calcularAutonomia: R.autonomia,
    armarSistemaSolar: R.sistemaSolar,
    armarSistemaSeguridad: R.sistemaSeguridad,
    armarSistemaInternet: R.sistemaInternet,
    armarSistema: _armarSistema,
    capacidadBateria: _capacidadBateria,
    diagnosticar: R.diagnostico,
    esAveria,
    detectarCodigo,
    familiaDelTexto: _familiaDelTexto,
    DIAGNOSTICO,
    cotizacionHTML,
    abrirCotizacion,
    get ultimoSistema(){ return _ULTIMO_SISTEMA; },
    comparacionTecnologica: R.comparacionTecnologica,
    KNOWLEDGE,
    // Se expone para que el test pueda cruzar el dato con lo que sale en la
    // respuesta: escribir la lista de métodos a mano en el texto es cómo se
    // llega a que el bot ofrezca un pago que ya no se acepta.
    METODOS_PAGO,
    SISTEMAS,
    ACCESORIOS_AUTOMATICOS,
    context: _context,
    get tasa(){ return {base: TASA_BASE_MN, margen: MARGEN_MN, total: TASA_MN}; },
  };

  // La tabla de códigos se pedía dentro de R.diagnostico, así que la PRIMERA
  // avería siempre llegaba antes que el fetch y Max contestaba "no tengo el
  // manual de esa marca" de un código que sí estaba en la tabla. Se pide aquí,
  // al cargar el cerebro (que ya es a demanda, al abrir el chat), para que
  // esté lista mucho antes de que nadie escriba un error.
  _cargarCodigos();

  // Handshake: js/tm-bot.js espera esta señal para soltar el "cargando…"
  // y mostrar el saludo. Se avisa al final, con todo ya definido.
  window._tmBotCerebroListo = true;
  if(typeof window._tmBotAlCargarCerebro === 'function'){
    try { window._tmBotAlCargarCerebro(); } catch(e){}
  }

})();
