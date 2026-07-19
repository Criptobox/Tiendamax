/* ============================================================
   TiendaMax — TmAgent: Motor de Agente Inteligente Local
   ============================================================
   Asistente virtual 24/7 que conoce el inventario, compara
   productos, calcula consumo eléctrico y guía al cliente
   hacia WhatsApp cuando está listo para comprar.

   FUNCIONA 100% OFFLINE — sin API externa para el 80%+ de
   las consultas. Usa los datos globales `productos` y las
   funciones existentes busquedaConIA(), tmFuzzyMatch(),
   formatPrecio(), getTasaMN(), getNumeroWhatsApp().

   Uso:
     window.TmAgent.init()
     window.TmAgent.chat("busco un router wifi")
   ============================================================ */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 1: INTENT DETECTION
  // ═══════════════════════════════════════════════════════════════

  const INTENT = {
    SEARCH:    'buscar_producto',
    COMPARE:   'comparar_productos',
    RECOMMEND: 'recomendacion',
    CALCULATE: 'calcular_consumo',
    DETAIL:    'detalle_producto',
    STOCK:     'disponibilidad',
    GREETING:  'saludo',
    FAREWELL:  'despedida',
    HELP:      'ayuda',
    SHIPPING:  'envio',
    PAYMENT:   'pago',
    HOURS:     'horario',
    LOCATION:  'ubicacion',
    WHATSAPP:  'whatsapp',
    WARRANTY:  'garantia',
    RETURNS:   'devolucion',
    OFFERS:    'ofertas',
    CATEGORIES:'categorias',
    UNKNOWN:   'desconocido'
  };

  /**
   * Normaliza texto: minúsculas, sin acentos, sin puntuación extra.
   */
  function norm(txt) {
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Spanish stemmer: strips common plural suffixes so "inversores" → "inversor",
   * "baterías" → "bateria", "routers" → "router", "celulares" → "celular".
   * Conservative: only strips when the stem is >= 3 chars to avoid false positives.
   */
  function _stemES(word) {
    if (!word || word.length < 5) return word;
    // -es: inversores → inversor, celulares → celular, baterías → bateria
    if (word.endsWith('es') && word.length - 2 >= 3) {
      return word.slice(0, -2);
    }
    // -s: routers → router, gatos → gato (but NOT 2-letter endings like "los" → "lo")
    if (word.endsWith('s') && word.length - 1 >= 4) {
      return word.slice(0, -1);
    }
    return word;
  }

  /**
   * Map of product type keywords to filter function.
   * Used when user says "comparar los inversores" to only show inverters.
   */
  var PRODUCT_TYPE_FILTERS = {
    'inversor': function(p) { return /inversor/i.test(p.nombre || '') || (p.specs && p.specs.join(' ').match(/inversor/i)); },
    'bateria': function(p) { return /bater[ií]a|life\/?po4|lion|lithium/i.test(p.nombre || ''); },
    'cargador': function(p) { return /cargador/i.test(p.nombre || ''); },
    'router': function(p) { return /router/i.test(p.nombre || ''); },
    'repetidor': function(p) { return /repetidor|extensor|amplificador/i.test(p.nombre || ''); },
    'controlador': function(p) { return /controlador.*solar|solar.*controlador|mppt/i.test(p.nombre || ''); },
    'solar': function(p) { return /solar|panel.*fotovoltaico/i.test(p.nombre || ''); },
    'switch': function(p) { return /switch/i.test(p.nombre || ''); },
    'celular': function(p) { return /celular|smartphone|iphone|samsung|xiaomi|tecno|alcatel|motorola|nokia/i.test(p.nombre || ''); },
    'moto': function(p) { return /moto|motocicleta|scooter/i.test(p.nombre || ''); },
    'carro': function(p) { return /carro|auto|llanta|neumatico|repuesto/i.test(p.nombre || ''); },
    'seguridad': function(p) { return /camara.*seguridad|alarma|sensor.*movimiento|dvr|nvr/i.test(p.nombre || ''); },
    'transferencia': function(p) { return /transferencia|interruptor.*transferencia/i.test(p.nombre || ''); },
    'audio': function(p) { return /parlante|altavoz|bocina|speaker|bluetooth|radio/i.test(p.nombre || ''); },
    'cable': function(p) { return /cable|hdmi|conector|adaptador/i.test(p.nombre || ''); },
    'lampara': function(p) { return /lampara|led|foco|iluminacion|bombillo/i.test(p.nombre || ''); },
    'memoria': function(p) { return /usb|pendrive|microsd|tarjeta.*memoria/i.test(p.nombre || ''); }
  };

  /**
   * Categories that are NOT related to a given product type keyword.
   * Used to penalize products from wrong categories in search results.
   * E.g. searching "inversor" should NOT return products from MOTOS/CARROS category.
   */
  var UNRELATED_CATEGORY_MAP = {
    'inversor':  ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO', 'UTILES'],
    'bateria':   ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO'],
    'router':    ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO'],
    'celular':   ['MOTOS', 'CARROS', 'ENERGIA', 'REDES'],
    'solar':     ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'ALIMENTO', 'CELULARES'],
    'cargador':  ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'HOGAR', 'ALIMENTO'],
    'moto':      ['ENERGIA', 'REDES', 'CELULARES', 'ROPA', 'CALZADO', 'HOGAR'],
    'carro':     ['ENERGIA', 'REDES', 'CELULARES', 'ROPA', 'CALZADO', 'HOGAR'],
    'audio':     ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'ALIMENTO'],
    'seguridad': ['MOTOS', 'CARROS', 'ROPA', 'CALZADO', 'ALIMENTO']
  };

  /**
   * Detecta la intención del mensaje del usuario.
   * Prioriza intenciones específicas sobre las genéricas.
   */
  function detectIntent(msg) {
    const n = norm(msg);

    // ── Saludos ──
    if (/^(hola|hey|buenos dias|buenas tardes|buenas noches|asere|que vola|saludos|hi|hello|que tal|buen dia|buenas|yo)\b/.test(n) && n.length < 30) {
      return INTENT.GREETING;
    }

    // ── Despedidas ──
    if (/^(gracias|chao|adios|bye|hasta luego|nos vemos|hasta manana|me voy|listo|ok gracias|ya esta|perfecto gracias)\b/.test(n) && n.length < 30) {
      return INTENT.FAREWELL;
    }

    // ── Ayuda ──
    if (/^(ayuda|help|que puedes hacer|como funciona|que haces|para que sirves|que sabes hacer)/.test(n)) {
      return INTENT.HELP;
    }

    // ── WhatsApp ──
    // OJO: nada de "telefono"/"contacto" a secas — "busco un telefono" es una
    // búsqueda de producto, no una petición del número de la tienda.
    if (/whatsapp|wasap|numero de (contacto|telefono|la tienda)|como (los )?contacto|como contactar|contactarlos/.test(n)) {
      return INTENT.WHATSAPP;
    }

    // ── Envío ──
    if (/envio|delivery|domicilio|traen|llegan|entrega|despacho|lo llevan|hacen envios|envian/.test(n)) {
      return INTENT.SHIPPING;
    }

    // ── Pago ──
    // Guard con _mentionsProduct: "tengo 50 usd para un cargador" es una
    // búsqueda con presupuesto, no una pregunta sobre formas de pago.
    if (/pago|paga|efectivo|transferencia|usd|mn|moneda|como pago|formas de pago|aceptan/.test(n) && !_mentionsProduct(n)) {
      return INTENT.PAYMENT;
    }

    // ── Horario ──
    if (/horario|abierto|cierran|abren|que hora|a que hora|horario de atencion/.test(n)) {
      return INTENT.HOURS;
    }

    // ── Ubicación ──
    if (/donde estan|direccion|ubicacion|local|tienda fisica|donde queda|donde estan ubicados/.test(n)) {
      return INTENT.LOCATION;
    }

    // ── Garantía ──
    if (/garantia|warranty|garant[aia]/.test(n)) {
      return INTENT.WARRANTY;
    }

    // ── Devolución ──
    if (/devolver|cambio|devolucion|devolvi|reembolso|me arrepenti/.test(n)) {
      return INTENT.RETURNS;
    }

    // ── Ofertas ──
    // Señales fuertes (oferta/descuento/rebaja) ganan siempre; las débiles
    // ("barato") solo si NO se menciona un producto — "quiero un celular
    // barato" es una búsqueda de celulares, no un pedido de ofertas genéricas.
    if (/oferta|descuento|rebaja|promocion|precio especial|esta escapao/.test(n)) {
      return INTENT.OFFERS;
    }
    if (/barato|economico/.test(n) && !_mentionsProduct(n)) {
      return INTENT.OFFERS;
    }

    // ── Categorías ──
    if (/categoria|categorias|que venden|que tienen|que hay|tipos de productos|ver todo/.test(n)) {
      return INTENT.CATEGORIES;
    }

    // ── Comparar ──
    if (/comparar|compara|cual es mejor|diferencia|vs|versus|mejor entre|que me conviene mas entre/.test(n)) {
      return INTENT.COMPARE;
    }

    // ── Calcular consumo ──
    if (/cuanto.*watt|cuanto.*consumo|que inversor necesito|cuanta energia|calcular.*consumo|calcular.*potencia|cuanto.*potencia|inversor para casa|inversor para mi|cuantos watt|necesito un inversor|que bateria necesito/.test(n)) {
      return INTENT.CALCULATE;
    }

    // ── Disponibilidad / Stock ──
    if (/hay disponible|tiene stock|tienen|hay disponible|esta disponible|queda|quedan|hay de|tiene de/.test(n)) {
      return INTENT.STOCK;
    }

    // ── Recomendación ──
    if (/recomienda|recomiendas|que me recomiendas|que me aconsejas|sugieres|que me conviene|cual me recomiendas|me recomiendas/.test(n)) {
      return INTENT.RECOMMEND;
    }

    // ── Detalle de producto ──
    if (/cuanto cuesta|que precio|precio de|cuanto vale|que specs|que especificaciones|cuanto tiene|dime mas de|hablame de|detalles de|info de/.test(n)) {
      return INTENT.DETAIL;
    }

    // ── Búsqueda (fallback si contiene términos de producto) ──
    if (/busco|necesito|quiero|quisiera|tiene|tienen|hay|venden|mostrar|ver|mostrame|dame|buscar|encuentra|comprar|compra|pedir/.test(n) && n.length > 3) {
      return INTENT.SEARCH;
    }

    return INTENT.UNKNOWN;
  }

  /**
   * Extrae un presupuesto del mensaje: "hasta 100", "menos de 50",
   * "tengo 200 usd", "entre 50 y 100", "de 20 a 40".
   * Ignora números con unidad técnica (12v, 3000w, 100ah...) para no
   * confundir "cargador de 12 a 24v" con un rango de precio.
   * Devuelve { min?, max?, cleaned } o null. cleaned = mensaje sin la
   * frase de presupuesto (para que no ensucie la búsqueda).
   */
  function _parseBudget(n) {
    var NOUNIT = '(?!\\s*(?:w|v|ah|a|hz|mah|btu|gb|tb|mbps|gbps|k)\\b)';
    var m, out = null, cleaned = n;
    if ((m = n.match(new RegExp('(?:entre|de)\\s+(\\d+)' + NOUNIT + '\\s+(?:y|a)\\s+(\\d+)' + NOUNIT + '(?:\\s*(?:usd|dolares|pesos))?')))) {
      out = { min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
    } else if ((m = n.match(new RegExp('(?:hasta|menos de|maximo|no mas de|por menos de|debajo de|tengo)\\s*\\$?\\s*(\\d+)' + NOUNIT)))) {
      out = { max: parseInt(m[1], 10) };
    } else if ((m = n.match(new RegExp('(?:mas de|minimo|desde|a partir de)\\s*\\$?\\s*(\\d+)' + NOUNIT)))) {
      out = { min: parseInt(m[1], 10) };
    }
    if (!out) return null;
    cleaned = n.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    out.cleaned = cleaned;
    return out;
  }

  /**
   * Complementos que venden juntos: dado un producto, qué tipos ofrecerle
   * de acompañamiento ("¿Y la batería para ese inversor?").
   */
  var COMPLEMENTS = {
    'inversor':  ['bateria', 'solar', 'controlador'],
    'bateria':   ['inversor', 'cargador'],
    'solar':     ['controlador', 'bateria'],
    'controlador': ['solar', 'bateria'],
    'router':    ['repetidor', 'switch'],
    'repetidor': ['router'],
    'switch':    ['router', 'cable'],
    'seguridad': ['memoria', 'cable'],
    'celular':   ['audio', 'cargador', 'memoria']
  };

  /**
   * Devuelve hasta `max` productos en stock que complementan a `p`
   * (otro tipo, mismo ecosistema). Para el "combina bien con…" del cierre.
   */
  function _getComplements(p, max) {
    max = max || 2;
    var type = null;
    for (var t in PRODUCT_TYPE_FILTERS) {
      if (PRODUCT_TYPE_FILTERS.hasOwnProperty(t) && PRODUCT_TYPE_FILTERS[t](p)) { type = t; break; }
    }
    if (!type || !COMPLEMENTS[type]) return [];
    var ps = _getProducts();
    var found = [];
    var seen = { };
    seen[String(p.id)] = true;
    COMPLEMENTS[type].forEach(function (compType) {
      if (found.length >= max) return;
      var filter = PRODUCT_TYPE_FILTERS[compType];
      if (!filter) return;
      var candidates = ps.filter(function (x) {
        // Mismo ecosistema pero DISTINTO tipo: sugerir "otro inversor" como
        // complemento de un inversor no es cross-sell, es competencia.
        return x.stock > 0 && !seen[String(x.id)] && filter(x) && !PRODUCT_TYPE_FILTERS[type](x);
      }).sort(function (a, b) {
        var ma = (a.masVendido === true || a.masVendido === 'true') ? 1 : 0;
        var mb = (b.masVendido === true || b.masVendido === 'true') ? 1 : 0;
        if (ma !== mb) return mb - ma;
        return (a.precioActual || 0) - (b.precioActual || 0);
      });
      if (candidates[0]) { found.push(candidates[0]); seen[String(candidates[0].id)] = true; }
    });
    return found;
  }

  /** Etiquetas legibles (plural) por tipo de producto, para los botones del chooser */
  var TYPE_LABELS = {
    'inversor': 'inversores', 'bateria': 'baterías', 'router': 'routers',
    'repetidor': 'repetidores', 'cargador': 'cargadores', 'celular': 'celulares',
    'solar': 'paneles solares', 'seguridad': 'cámaras de seguridad',
    'audio': 'equipos de audio', 'switch': 'switches', 'controlador': 'controladores',
    'lampara': 'lámparas', 'memoria': 'memorias', 'cable': 'cables',
    'moto': 'accesorios de moto', 'carro': 'accesorios de carro',
    'transferencia': 'transferencias'
  };

  /**
   * Chooser de comparación: cuando el cliente dice "comparar" sin decir qué,
   * ofrecer los tipos del catálogo que tienen ≥2 productos EN STOCK, con
   * botones "Comparar X" que disparan la comparación real (antes los botones
   * decían "Ver routers", que hacía una búsqueda — el cliente elegía y la
   * comparación nunca llegaba).
   */
  function _compareTypeChooser() {
    var ps = _getProducts();
    var counts = [];
    for (var t in PRODUCT_TYPE_FILTERS) {
      if (!PRODUCT_TYPE_FILTERS.hasOwnProperty(t)) continue;
      var c = ps.filter(function (p) { return p.stock > 0 && PRODUCT_TYPE_FILTERS[t](p); }).length;
      if (c >= 2) counts.push({ type: t, count: c });
    }
    counts.sort(function (a, b) { return b.count - a.count; });
    var top = counts.slice(0, 4);
    if (top.length === 0) {
      return {
        text: '¿Qué productos quieres comparar? Dime dos nombres, por ejemplo:\n"comparar el Powmr y el Must"',
        quickReplies: ['🔥 Ofertas', '📦 Categorías']
      };
    }
    return {
      text: '📊 ¡Claro! ¿Qué quieres comparar? Elige una opción o dime dos productos:',
      quickReplies: top.map(function (x) {
        return 'Comparar ' + (TYPE_LABELS[x.type] || x.type);
      })
    };
  }

  /**
   * ¿El mensaje menciona un tipo de producto o categoría del catálogo?
   * Usado para desambiguar intents genéricos ("barato", "ofertas") de
   * búsquedas reales ("celular barato").
   */
  function _mentionsProduct(n) {
    var words = n.split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w.length < 3) continue;
      var st = _stemES(w);
      if (PRODUCT_TYPE_FILTERS[w] || PRODUCT_TYPE_FILTERS[st]) return true;
    }
    return _extractCategoryFromMsg(n) !== null;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 2: SPEC PARSER
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parsea el array de specs libre a datos estructurados.
   * Extrae: watts, volts, ampHours, amps, speedMbps, speedGbps,
   *         wifiVersion, mppt, gigabit, solar, productType.
   */
  function parseSpec(specs) {
    if (!Array.isArray(specs) || specs.length === 0) return {};
    const text = specs.join(' ');
    const result = {};

    // Watts (maneja kW también)
    const wattMatch = text.match(/(\d+[\.,]?\d*)\s*[Kk][Ww]/);
    if (wattMatch) {
      result.watts = parseFloat(wattMatch[1].replace(',', '.')) * 1000;
    } else {
      const wMatch = text.match(/(\d+[\.,]?\d*)\s*[Ww](?:\s|$|[^a-zA-Z]|[Ww])/);
      if (wMatch) {
        result.watts = parseFloat(wMatch[1].replace(',', '.'));
      }
    }

    // Voltios
    const vMatch = text.match(/(\d+[\.,]?\d*)\s*[Vv]/);
    if (vMatch) {
      const volts = parseFloat(vMatch[1].replace(',', '.'));
      // Buscar si hay múltiples voltajes (ej: 12V/24V)
      const allV = [...text.matchAll(/(\d+[\.,]?\d*)\s*[Vv]/g)].map(m => parseFloat(m[1].replace(',', '.')));
      result.volts = allV.length > 1 ? allV : volts;
    }

    // Amperios-hora (Ah) — debe ir antes que Amps para no confundir
    const ahMatch = text.match(/(\d+[\.,]?\d*)\s*[Aa][Hh]/);
    if (ahMatch) {
      result.ampHours = parseFloat(ahMatch[1].replace(',', '.'));
    }

    // Amperios (A, no Ah)
    if (!result.ampHours) {
      const aMatch = text.match(/(\d+[\.,]?\d*)\s*[Aa](?:\s|$|[^a-zA-ZhH])/);
      if (aMatch) {
        result.amps = parseFloat(aMatch[1].replace(',', '.'));
      }
    }

    // Velocidad Gbps
    const gbpsMatch = text.match(/(\d+[\.,]?\d*)\s*[Gg][Bb][Pp][Ss]/);
    if (gbpsMatch) {
      result.speedGbps = parseFloat(gbpsMatch[1].replace(',', '.'));
      result.speedMbps = result.speedGbps * 1000;
    } else {
      // Velocidad Mbps
      const mbpsMatch = text.match(/(\d+[\.,]?\d*)\s*[Mm][Bb][Pp][Ss]/);
      if (mbpsMatch) {
        result.speedMbps = parseFloat(mbpsMatch[1].replace(',', '.'));
      }
    }

    // WiFi versión
    const wifiMatch = text.match(/[Ww][Ii]-?[Ff][Ii]\s*(\d)/);
    if (wifiMatch) {
      result.wifiVersion = parseInt(wifiMatch[1], 10);
    }

    // MPPT
    if (/[Mm][Pp][Pp][Tt]/.test(text)) {
      result.mppt = true;
    }

    // Gigabit
    if (/[Gg]igabit/.test(text)) {
      result.gigabit = true;
    }

    // Solar / Híbrido
    if (/[Ss]olar/.test(text)) {
      result.solar = true;
    }
    if (/[Hh][ií]brido/.test(text)) {
      result.solar = true;
      result.hybrid = true;
    }

    // Tipo de producto (del texto del spec o nombre)
    if (/[Cc]argador/.test(text)) result.productType = 'cargador';
    if (/[Ii]nversor/.test(text)) result.productType = 'inversor';
    if (/[Bb]ater[ií]a/.test(text)) result.productType = 'bateria';
    if (/[Rr]outer/.test(text)) result.productType = 'router';
    if (/[Rr]epetidor/.test(text)) result.productType = 'repetidor';
    if (/[Ss]witch/.test(text)) result.productType = 'switch';

    // Puertos RJ45
    const portMatch = text.match(/(\d+)\s*[Pp]uertos?\s*[Rr][Jj]45/);
    if (portMatch) result.ports = parseInt(portMatch[1], 10);

    // Antenas
    const antMatch = text.match(/(\d+)\s*[Aa]ntenas/);
    if (antMatch) result.antennas = parseInt(antMatch[1], 10);

    return result;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 3: PRODUCT SEARCH ENGINE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Busca productos usando múltiples estrategias:
   * 1. busquedaConIA() (sinónimos)
   * 2. tmFuzzyMatch() (tolerancia a typos)
   * 3. Búsqueda directa por campos
   */
  // Cache for async IA results (busquedaConIA returns a Promise).
  // Se guarda CON la query que lo generó: sin eso, los resultados async de
  // una búsqueda anterior ("router") contaminaban la siguiente ("bateria").
  var _iaCachedResults = null; // { query, results }

  function searchProducts(query, options) {
    options = options || {};
    const maxResults = options.maxResults || 5;
    const onlyInStock = options.onlyInStock !== false; // por defecto sí
    var ps = _getProducts();
    if (!ps || ps.length === 0) return [];

    const nq = norm(query);

    // Estrategia 1: busquedaConIA — now properly awaited (it's async).
    // This enables synonym-based search results.
    let iaResults = null;
    if (typeof busquedaConIA === 'function') {
      try {
        var _iaRaw = busquedaConIA(query);
        // busquedaConIA is async — it returns a Promise.
        // We can't await in a sync function, so we run it in the background
        // and the next time the user searches, cached results will be used.
        // For THIS call, we use the scoring search (Strategy 2).
        if (Array.isArray(_iaRaw)) {
          iaResults = _iaRaw;
        } else if (_iaRaw && typeof _iaRaw.then === 'function') {
          // It's a Promise — resolve it and cache (junto con SU query) for next call
          _iaRaw.then(function(results) {
            if (Array.isArray(results) && results.length > 0) {
              _iaCachedResults = { query: nq, results: results };
            }
          }).catch(function() { /* silent */ });
          // Use cached IA results ONLY if they were produced by this same query
          if (_iaCachedResults && _iaCachedResults.query === nq &&
              Array.isArray(_iaCachedResults.results) && _iaCachedResults.results.length > 0) {
            iaResults = _iaCachedResults.results;
          }
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[TmAgent] busquedaConIA error:', e);
        }
      }
    }

    // Estrategia 2: Búsqueda directa con scoring (always runs)
    const scored = ps.map(function (p) {
      let score = 0;
      const nombre = norm(p.nombre || '');
      const desc = norm(p.descripcion || '');
      const cat = norm(p.categoria || '');
      const subcat = norm(p.subcategoria || '');
      const allText = nombre + ' ' + desc + ' ' + cat + ' ' + subcat;
      const rawCat = (p.categoria || '').toUpperCase();

      // Coincidencia exacta en nombre (peso máximo)
      if (nombre.includes(nq)) score += 20;

      // Coincidencia por palabras — with stemming support
      const words = nq.split(/\s+/).filter(Boolean);
      words.forEach(function (w) {
        if (w.length < 2) return;
        // Direct match
        if (nombre.includes(w)) score += 8;
        if (cat.includes(w) || subcat.includes(w)) score += 5;
        if (desc.includes(w)) score += 3;
        if (allText.includes(w)) score += 2;
        // Stemmed match (handles plurals: "inversores" → "inversor")
        var stemmed = _stemES(w);
        if (stemmed !== w) {
          if (nombre.includes(stemmed)) score += 7;
          if (cat.includes(stemmed) || subcat.includes(stemmed)) score += 4;
          if (desc.includes(stemmed)) score += 2;
        }
        // Product type filter match (high bonus for exact type match)
        if (PRODUCT_TYPE_FILTERS[stemmed] && PRODUCT_TYPE_FILTERS[stemmed](p)) score += 12;
        if (PRODUCT_TYPE_FILTERS[w] && PRODUCT_TYPE_FILTERS[w](p)) score += 12;
        // Category penalty: if query keyword has unrelated categories, heavily penalize.
        // Pero si PRODUCT_TYPE_FILTERS ya confirmó que el producto ES ese tipo exacto
        // (ej. un cargador en MOTOS que sí es el cargador buscado), no penalizar —
        // si no, productos correctos en categorías "raras" quedaban sub-rankeados.
        var keyForUnrelated = stemmed || w;
        var yaConfirmadoPorTipo = (PRODUCT_TYPE_FILTERS[keyForUnrelated] && PRODUCT_TYPE_FILTERS[keyForUnrelated](p));
        if (!yaConfirmadoPorTipo && UNRELATED_CATEGORY_MAP[keyForUnrelated] &&
            UNRELATED_CATEGORY_MAP[keyForUnrelated].indexOf(rawCat) !== -1) {
          score -= 20;  // Strong penalty for wrong-category products
        }
      });

      // Bonus por fuzzy match en nombre
      if (typeof tmFuzzyMatch === 'function') {
        try {
          if (tmFuzzyMatch(p.nombre, query)) score += 4;
        } catch (e) { /* silencioso */ }
      }

      // Bonus si busquedaConIA lo encontró (only if iaResults is a real array)
      if (iaResults && Array.isArray(iaResults) && iaResults.some(function (ip) { return ip.id === p.id; })) {
        score += 15;
      }

      // Bonos de stock/vendido/descuento SOLO si ya hay match textual —
      // sin esta condición, cualquier producto con stock+descuento pasaba
      // el filtro score>0 y se colaba al final de TODAS las búsquedas.
      if (score > 0) {
        if (p.stock > 0) score += 3;
        if (p.masVendido === true || p.masVendido === 'true') score += 2;
        if (p.descuento > 0) score += 1;
      }

      return { product: p, score: score };
    })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; });

    let results = scored.map(function (x) { return x.product; });

    // Si busquedaConIA encontró algo que no está en los scored, agregarlo
    if (iaResults && Array.isArray(iaResults)) {
      var resultIds = new Set(results.map(function (r) { return r.id; }));
      iaResults.forEach(function (p) {
        if (!resultIds.has(p.id)) {
          results.unshift(p);
          resultIds.add(p.id);
        }
      });
    }

    // Fallback: if scoring found nothing, try a broader direct search
    if (results.length === 0) {
      results = _fallbackSearch(query);
    }

    // Filtrar por stock si se requiere. Estricto: no ofrecer agotados como
    // "opciones" — un vendedor no muestra lo que no puede vender. Si TODO
    // está agotado se devuelven igual (el caller avisa y ofrece "Avísame").
    if (onlyInStock) {
      var inStock = results.filter(function (p) { return p.stock > 0; });
      if (inStock.length > 0) results = inStock;
    }

    return results.slice(0, maxResults);
  }

  /**
   * Fallback search: direct string matching on productos array.
   * Used when busquedaConIA is async (returns Promise) and the
   * scoring search comes up empty.
   */
  function _fallbackSearch(query) {
    var ps = _getProducts();
    if (!ps || !Array.isArray(ps) || ps.length === 0) return [];
    var q = norm(query);
    // Also try stemmed form for plurals
    var qStem = _stemES(q);
    return ps.filter(function (p) {
      var pn = norm(p.nombre || '');
      var pc = norm(p.categoria || '');
      var ps2 = norm(p.subcategoria || '');
      var pd = norm(p.descripcion || '');
      return pn.includes(q) || pc.includes(q) || ps2.includes(q) || pd.includes(q) ||
             (qStem !== q && (pn.includes(qStem) || pc.includes(qStem) || ps2.includes(qStem) || pd.includes(qStem)));
    }).slice(0, 6);
  }

  /**
   * Busca un producto por ID exacto.
   */
  function getProductById(id) {
    var ps = _getProducts();
    return ps.find(function (p) { return String(p.id) === String(id); }) || null;
  }

  /**
   * Busca productos por categoría.
   */
  function getProductsByCategory(cat, options) {
    options = options || {};
    var maxResults = options.maxResults || 10;
    var onlyInStock = options.onlyInStock !== false;
    var ps = _getProducts();
    var nCat = norm(cat);

    var results = ps.filter(function (p) {
      return norm(p.categoria || '').includes(nCat) || norm(p.subcategoria || '').includes(nCat);
    });

    // Priorizar con stock, luego más vendidos, luego con descuento
    results.sort(function (a, b) {
      // Stock primero
      var sa = a.stock > 0 ? 1 : 0;
      var sb = b.stock > 0 ? 1 : 0;
      if (sa !== sb) return sb - sa;
      // Más vendidos
      var ma = (a.masVendido === true || a.masVendido === 'true') ? 1 : 0;
      var mb = (b.masVendido === true || b.masVendido === 'true') ? 1 : 0;
      if (ma !== mb) return mb - ma;
      // Con descuento
      var da = a.descuento > 0 ? 1 : 0;
      var db = b.descuento > 0 ? 1 : 0;
      if (da !== db) return db - da;
      // Menor precio primero
      return (a.precioActual || 0) - (b.precioActual || 0);
    });

    if (onlyInStock) {
      var inStock = results.filter(function (p) { return p.stock > 0; });
      if (inStock.length > 0) results = inStock;
    }

    return results.slice(0, maxResults);
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 4: PRODUCT FORMATTER
  // ═══════════════════════════════════════════════════════════════

  /**
   * Formatea un producto como tarjeta para respuesta del agente.
   */
  function formatProductCard(p, options) {
    options = options || {};
    var precio = _fmtPrice(p.precioActual);

    var lines = [];
    lines.push('🛒 ' + (p.nombre || 'Producto'));
    lines.push('');
    lines.push('💵 ' + precio + _mnSuffix(p.precioActual));

    if (p.descuento > 0) {
      lines.push('🔥 ' + p.descuento + '% OFF' + (p.precioOriginal > 0 ? ' (antes $' + p.precioOriginal.toFixed(2) + ')' : ''));
    }

    var stockText = p.stock <= 0 ? '❌ Agotado' :
                    p.stock <= 3 ? '⚠️ ¡Solo ' + p.stock + ' disponibles!' :
                    '📦 ' + p.stock + ' disponibles';
    lines.push(stockText);

    if (p.masVendido === true || p.masVendido === 'true') {
      lines.push('🔥 Más vendido');
    }

    // Specs
    if (Array.isArray(p.specs) && p.specs.length > 0) {
      var cleanSpecs = p.specs.map(function (s) {
        return String(s).replace(/^[⠀-代言]\s*/, '').trim(); // quitar zero-width chars
      }).filter(Boolean);
      if (cleanSpecs.length > 0) {
        lines.push('📋 ' + cleanSpecs.join(' · '));
      }
    }

    // Garantía
    if (p.garantia) {
      lines.push('🛡️ Garantía: ' + p.garantia);
    }

    return lines.join('\n');
  }

  /**
   * Formato corto para listas de productos.
   */
  function formatProductShort(p, index) {
    var emoji = index !== undefined ? (index + 1) + '️⃣ ' : '• ';
    var stockIcon = p.stock <= 0 ? ' ❌' : p.stock <= 3 ? ' ⚠️' : '';
    var price = _fmtPrice(p.precioActual);
    var vendido = (p.masVendido === true || p.masVendido === 'true') ? ' 🔥' : '';
    var desc = p.descuento > 0 ? ' -' + p.descuento + '%' : '';

    return emoji + (p.nombre || 'Producto') + ' — ' + price + desc + _mnSuffix(p.precioActual) + stockIcon + vendido;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 5: PRODUCT COMPARISON ENGINE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Compara productos dados sus IDs o instancias.
   * Devuelve tabla formateada + recomendación.
   */
  function compareProducts(productIdsOrProducts) {
    if (!productIdsOrProducts || productIdsOrProducts.length < 2) {
      return {
        text: 'Necesito al menos 2 productos para comparar. Dime cuáles te interesan.',
        quickReplies: ['Ver routers', 'Ver inversores', 'Ver baterías']
      };
    }

    // Resolver productos
    var prods = productIdsOrProducts.map(function (item) {
      if (typeof item === 'object' && item.id) return item;
      return getProductById(item);
    }).filter(Boolean);

    if (prods.length < 2) {
      return {
        text: 'No encontré suficientes productos para comparar. ¿Puedes ser más específico?',
        quickReplies: ['Ver categorías', 'Buscar producto']
      };
    }

    // Parsear specs de cada uno
    var parsed = prods.map(function (p) {
      return { product: p, spec: parseSpec(p.specs) };
    });

    // El texto es un resumen corto: la tabla detallada la renderiza la UI del
    // chat como HTML (response.comparison). La versión anterior metía una
    // tabla ASCII alineada con espacios dentro del texto — en la burbuja del
    // chat (fuente proporcional, panel angosto) se veía rota y duplicaba la
    // tabla HTML de abajo.
    var lines = [];
    lines.push('📊 Comparando ' + prods.length + ' productos:');
    lines.push('');
    prods.forEach(function (p, i) {
      lines.push(formatProductShort(p, i));
    });

    // Mejor precio (índice del más barato)
    var minPriceIdx = 0;
    prods.forEach(function (p, i) {
      if ((p.precioActual || 0) < (prods[minPriceIdx].precioActual || 0)) minPriceIdx = i;
    });

    lines.push('');
    lines.push('🏆 RECOMENDACIÓN:');

    // Mejor precio
    if (minPriceIdx >= 0) {
      lines.push('• Mejor precio: ' + _shortName(prods[minPriceIdx].nombre) + ' ($' + prods[minPriceIdx].precioActual.toFixed(2) + ')');
    }

    // Mejor rendimiento (mayor score de specs)
    var perfScores = parsed.map(function (x) {
      var s = 0;
      if (x.spec.watts) s += x.spec.watts / 100;
      if (x.spec.speedMbps) s += x.spec.speedMbps / 100;
      if (x.spec.ampHours) s += x.spec.ampHours / 10;
      if (x.spec.wifiVersion) s += x.spec.wifiVersion * 2;
      if (x.spec.gigabit) s += 3;
      if (x.spec.mppt) s += 3;
      if (x.spec.solar) s += 2;
      return s;
    });
    var bestPerfIdx = perfScores.indexOf(Math.max.apply(null, perfScores));
    if (bestPerfIdx >= 0 && perfScores[bestPerfIdx] > 0) {
      lines.push('• Mejor rendimiento: ' + _shortName(prods[bestPerfIdx].nombre));
    }

    // Mejor relación calidad-precio (score / precio)
    var valueScores = parsed.map(function (x, i) {
      var price = prods[i].precioActual || 1;
      return perfScores[i] / price;
    });
    var bestValueIdx = valueScores.indexOf(Math.max.apply(null, valueScores));
    if (bestValueIdx >= 0 && valueScores[bestValueIdx] > 0 && bestValueIdx !== minPriceIdx && bestValueIdx !== bestPerfIdx) {
      lines.push('• Mejor relación calidad-precio: ' + _shortName(prods[bestValueIdx].nombre));
    }

    lines.push('');
    lines.push('¿Te interesa alguno? Te paso por WhatsApp 👇');

    return {
      text: lines.join('\n'),
      products: prods.filter(function (p) { return p.stock > 0; }),
      comparison: { products: prods, parsed: parsed, bestPriceIdx: minPriceIdx, bestPerfIdx: bestPerfIdx },
      quickReplies: prods.filter(function (p) { return p.stock > 0; }).slice(0, 3).map(function (p) {
        return 'Comprar ' + _shortName(p.nombre);
      }).concat(['💬 WhatsApp'])
    };
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 6: CONSUMPTION CALCULATOR
  // ═══════════════════════════════════════════════════════════════

  var DISPOSITIVOS_COMUNES = {
    'cargador de telefono': 10,
    'telefono cargador': 10,
    'telefono': 10,
    'celular': 10,
    'lampara led': 10,
    'lampara': 10,
    'led': 10,
    'ventilador': 75,
    'tv 32': 80,
    'tv 32 pulgadas': 80,
    'tv': 80,
    'televisor': 80,
    'tv 50': 150,
    'tv 50 pulgadas': 150,
    'nevera pequena': 150,
    'nevera': 150,
    'refrigerador': 150,
    'nevera grande': 300,
    'microondas': 1000,
    'olla arrocera': 400,
    'olla': 400,
    'plancha': 1000,
    'lavadora': 500,
    'computadora': 200,
    'pc': 200,
    'laptop': 65,
    'router wifi': 15,
    'router': 15,
    'radio': 20,
    'cocina electrica': 1500,
    'cocina': 1500,
    'aire acondicionado 12000btu': 1500,
    'aire acondicionado': 1500,
    'aire': 1500,
    'ac': 1500,
    'monitor': 30,
    'impresora': 50,
    'bombillo': 10,
    'cargador': 10,
    'altavoz': 20,
    'speaker': 20
  };

  /**
   * Estado del flujo de cálculo (multiturno).
   */
  var _calcState = null; // null = no activo, { step, devices }
  var _lastCalc = null;  // { devices, hours } — para "necesito más horas de respaldo"
  var _lastPackLink = null; // link WA del último pack recomendado

  /**
   * Inicia o continúa el flujo de cálculo de consumo.
   */
  function handleCalculate(msg) {
    var n = norm(msg);

    // Si no hay estado activo, iniciar flujo. Pero si el mensaje inicial YA
    // trae dispositivos ("qué inversor necesito para tv y nevera"), calcular
    // directo sin obligar al usuario a repetirlos.
    if (!_calcState) {
      var directDevices = _parseDevices(msg);
      if (Object.keys(directDevices).length > 0) {
        return _calcResult(directDevices, n, 4);
      }
      _calcState = { step: 'awaiting_devices', devices: {} };
      return {
        text: '¡Te ayudo a calcular! ⚡ ¿Qué dispositivos quieres conectar?\n\n' +
              'Puedes decirme por ejemplo:\n"TV, nevera y 5 lámparas"\n\n' +
              'O selecciona los que tienes:\n' +
              '📱 Cargador de teléfono  💡 Lámpara LED  🌬️ Ventilador  📺 TV\n' +
              '🧊 Nevera  💻 PC  🍳 Microondas  ❄️ Aire Acond.',
        calculator: { step: 'awaiting_devices' },
        quickReplies: ['TV + Nevera', 'Solo luces y teléfono', 'PC + Router', 'Todo lo básico']
      };
    }

    // Si el usuario quiere cancelar. Anclado al INICIO del mensaje: antes,
    // /no/ sin anclar hacía que "telefono" (contiene "no") cancelara el flujo.
    if (/^\s*(cancelar|salir|olvidalo|dejalo|no|nada|otra cosa|ya no)\b/.test(n)) {
      _calcState = null;
      return {
        text: 'OK, si necesitas calcular después, aquí estoy. 👍',
        quickReplies: ['Buscar producto', 'Ver categorías']
      };
    }

    // Parsear dispositivos del mensaje
    var devices = _parseDevices(msg);
    if (Object.keys(devices).length === 0) {
      return {
        text: 'No reconocí los dispositivos. Prueba con:\n"TV, nevera y 3 lámparas"\n\nO di: cargador de teléfono, ventilador, PC, microondas, aire acondicionado...',
        quickReplies: ['TV + Nevera', 'Solo luces', 'Cancelar']
      };
    }

    return _calcResult(devices, n, 4);
  }

  /**
   * Núcleo del cálculo de consumo: dado el mapa de dispositivos, arma la
   * respuesta con inversor/batería/pack reales del inventario.
   * Separado de handleCalculate para poder recalcular (ej. con más horas
   * de respaldo) sin re-parsear el mensaje.
   */
  function _calcResult(devices, n, backupHoursParam) {
    // Calcular consumo total
    var totalWatts = 0;
    var detailLines = [];
    for (var dev in devices) {
      if (!devices.hasOwnProperty(dev)) continue;
      var qty = devices[dev];
      var wattPerUnit = DISPOSITIVOS_COMUNES[dev] || 50;
      var subtotal = qty * wattPerUnit;
      totalWatts += subtotal;
      var qtyStr = qty > 1 ? qty + 'x ' : '';
      detailLines.push('• ' + qtyStr + _capitalize(dev) + ': ' + subtotal + 'W');
    }

    var safetyWatts = Math.ceil(totalWatts * 1.3);
    detailLines.push('─────────────');
    detailLines.push('🔢 Total: ' + totalWatts + 'W');
    detailLines.push('⚡ Con margen de seguridad (×1.3): ' + safetyWatts + 'W');

    // ── Buscar PRODUCTOS REALES del inventario ──
    var ps = _getProducts();

    // Inversores: categoría ENERGIA, stock > 0
    var inversores = ps.filter(function (p) {
      if (p.stock <= 0) return false;
      var spec = parseSpec(p.specs);
      return (p.categoria === 'ENERGIA') &&
             (spec.productType === 'inversor' || /inversor/i.test(p.nombre || ''));
    });

    // Baterías: categoría ENERGIA, stock > 0
    var baterias = ps.filter(function (p) {
      if (p.stock <= 0) return false;
      var spec = parseSpec(p.specs);
      return (p.categoria === 'ENERGIA') &&
             (spec.productType === 'bateria' || /bater/i.test(p.nombre || ''));
    });

    // Paneles solares y controladores
    var solares = ps.filter(function (p) {
      if (p.stock <= 0) return false;
      var spec = parseSpec(p.specs);
      return (p.categoria === 'ENERGIA') &&
             (/solar|panel/i.test(p.nombre || '') || spec.solar);
    });

    var controladores = ps.filter(function (p) {
      if (p.stock <= 0) return false;
      return (p.categoria === 'ENERGIA') &&
             (/controlador|regulador|mppt/i.test(p.nombre || ''));
    });

    // Routers WiFi (si el usuario necesita router)
    var routers = ps.filter(function (p) {
      if (p.stock <= 0) return false;
      var spec = parseSpec(p.specs);
      return (p.categoria === 'WIFI') &&
             (spec.productType === 'router' || /router/i.test(p.nombre || ''));
    });

    // ── Ordenar inversores por mejor ajuste ──
    inversores.sort(function (a, b) {
      var sa = parseSpec(a.specs);
      var sb = parseSpec(b.specs);
      var wa = sa.watts || 0;
      var wb = sb.watts || 0;
      var aCovers = wa >= safetyWatts ? 0 : 1;
      var bCovers = wb >= safetyWatts ? 0 : 1;
      if (aCovers !== bCovers) return aCovers - bCovers;
      return Math.abs(wa - safetyWatts) - Math.abs(wb - safetyWatts);
    });

    // ── Ordenar baterías por mejor ajuste ──
    var backupHours = backupHoursParam || 4;
    var batteryVoltage = 12;
    var requiredAh = Math.ceil((totalWatts * backupHours) / batteryVoltage);

    baterias.sort(function (a, b) {
      var sa = parseSpec(a.specs);
      var sb = parseSpec(b.specs);
      var aha = sa.ampHours || 0;
      var ahb = sb.ampHours || 0;
      var aCovers = aha >= requiredAh ? 0 : 1;
      var bCovers = ahb >= requiredAh ? 0 : 1;
      if (aCovers !== bCovers) return aCovers - bCovers;
      return Math.abs(aha - requiredAh) - Math.abs(ahb - requiredAh);
    });

    // ── Construir texto del resultado ──
    var lines = [];
    lines.push('📊 Tu consumo estimado:');
    lines.push('');
    lines = lines.concat(detailLines);
    lines.push('');

    // Productos a mostrar como tarjetas
    var recommendedProducts = [];

    // ── Recomendar inversor real ──
    var bestInverter = null;
    if (inversores.length > 0) {
      bestInverter = inversores[0];
      var invSpec = parseSpec(bestInverter.specs);
      var invW = invSpec.watts || 0;
      var sufficient = invW >= safetyWatts;

      lines.push('📦 Inversor recomendado:');
      if (sufficient) {
        lines.push('Este inversor de ' + invW + 'W cubre tus ' + safetyWatts + 'W con margen de seguridad ✅');
      } else if (invW >= totalWatts) {
        lines.push('Este inversor de ' + invW + 'W cubre tus ' + totalWatts + 'W justos (sin margen) ⚠️');
      } else {
        lines.push('⚠️ El inversor más potente disponible es ' + invW + 'W, necesitas ' + safetyWatts + 'W');
      }

      // Mostrar hasta 2 inversores
      for (var i = 0; i < Math.min(inversores.length, 2); i++) {
        recommendedProducts.push(inversores[i]);
      }
      lines.push('');
    } else {
      lines.push('⚠️ No tengo inversores en stock ahora. Escríbenos por WhatsApp para cotizar.');
      lines.push('');
    }

    // ── Recomendar batería real ──
    var bestBattery = null;
    if (baterias.length > 0) {
      bestBattery = baterias[0];
      var batSpec = parseSpec(bestBattery.specs);
      var batAh = batSpec.ampHours || 0;
      var batV = batSpec.volts && !Array.isArray(batSpec.volts) ? batSpec.volts : batteryVoltage;
      var actualHours = batAh > 0 ? ((batAh * batV) / totalWatts).toFixed(1) : '?';

      lines.push('🔋 Batería recomendada (para ~' + backupHours + 'h de respaldo):');
      lines.push('Necesitas ~' + requiredAh + 'Ah a ' + batteryVoltage + 'V');
      if (batAh > 0) {
        lines.push('Esta batería de ' + batAh + 'Ah te da ~' + actualHours + 'h de respaldo');
      }

      recommendedProducts.push(bestBattery);
      lines.push('');
    }

    // ── Recomendar panel solar + controlador (si aplica) ──
    var needsRouter = false;
    for (var d in devices) {
      if (devices.hasOwnProperty(d) && /router/i.test(d)) { needsRouter = true; break; }
    }

    var hasSolarHint = /solar|fotov|panel|off.?grid|autonom/i.test(n);
    if (hasSolarHint && solares.length > 0) {
      lines.push('☀️ Panel solar recomendado:');
      for (var si = 0; si < Math.min(solares.length, 2); si++) {
        recommendedProducts.push(solares[si]);
        var solSpec = parseSpec(solares[si].specs);
        lines.push('• ' + solares[si].nombre + ' (' + (solSpec.watts || '?') + 'W) — ' + _fmtPrice(solares[si].precioActual));
      }
      if (controladores.length > 0) {
        recommendedProducts.push(controladores[0]);
        lines.push('🔧 Controlador: ' + controladores[0].nombre + ' — ' + _fmtPrice(controladores[0].precioActual));
      }
      lines.push('');
    }

    // ── Router WiFi si el usuario lo necesita ──
    if (needsRouter && routers.length > 0) {
      recommendedProducts.push(routers[0]);
      lines.push('📡 Router WiFi disponible:');
      lines.push('• ' + routers[0].nombre + ' — ' + _fmtPrice(routers[0].precioActual));
      lines.push('');
    }

    // ── PACK COMPLETO ──
    var packProducts = [];
    var packLines = [];
    var packTotal = 0;

    if (bestInverter) {
      var iSpec = parseSpec(bestInverter.specs);
      packProducts.push(bestInverter);
      packTotal += bestInverter.precioActual || 0;
      packLines.push('• Inversor ' + (iSpec.watts || '') + 'W — ' + _fmtPrice(bestInverter.precioActual) +
        ' (cubres ' + totalWatts + 'W × 1.3 = ' + safetyWatts + 'W)');
    }
    if (bestBattery) {
      var bSpec = parseSpec(bestBattery.specs);
      var bAh = bSpec.ampHours || 0;
      var bV = bSpec.volts && !Array.isArray(bSpec.volts) ? bSpec.volts : batteryVoltage;
      var bHours = bAh > 0 ? ((bAh * bV) / totalWatts).toFixed(1) : '?';
      packProducts.push(bestBattery);
      packTotal += bestBattery.precioActual || 0;
      packLines.push('• Batería ' + bAh + 'Ah ' + bV + 'V — ' + _fmtPrice(bestBattery.precioActual) +
        ' (≈' + bHours + 'h de respaldo)');
    }
    if (hasSolarHint && solares.length > 0) {
      packProducts.push(solares[0]);
      packTotal += solares[0].precioActual || 0;
      var sSpec = parseSpec(solares[0].specs);
      packLines.push('• Panel solar ' + (sSpec.watts || '') + 'W — ' + _fmtPrice(solares[0].precioActual));
      if (controladores.length > 0) {
        packProducts.push(controladores[0]);
        packTotal += controladores[0].precioActual || 0;
        packLines.push('• Controlador — ' + _fmtPrice(controladores[0].precioActual));
      }
    }

    if (packProducts.length >= 2) {
      lines.push('🔋 PACK COMPLETO PARA TUS NECESIDADES:');
      lines = lines.concat(packLines);
      lines.push('─────────────');
      lines.push('💰 Total del pack: ' + _fmtPrice(packTotal));
      lines.push('');
      lines.push('💬 ¿Te interesa? Te paso por WhatsApp');
    } else {
      lines.push('💬 ¿Te interesa alguno? Te paso por WhatsApp');
    }

    // Resetear estado del flujo, pero recordar el cálculo para follow-ups
    // ("necesito más horas de respaldo" recalcula con estos mismos equipos).
    _calcState = null;
    _lastCalc = { devices: devices, hours: backupHours };
    _lastPackLink = null;
    if (packProducts.length >= 2) {
      var _packMsg = 'Hola, me interesa el pack completo para ' + safetyWatts + 'W: ' +
        packProducts.map(function (p) { return p.nombre; }).join(', ');
      _lastPackLink = 'https://wa.me/' + _getWhatsAppNumber() + '?text=' + encodeURIComponent(_packMsg);
    }

    // Construir respuesta con productos reales como tarjetas
    // Evitar duplicados en recommendedProducts
    var seen = {};
    var uniqueProducts = [];
    recommendedProducts.forEach(function (p) {
      if (!seen[p.id]) {
        seen[p.id] = true;
        uniqueProducts.push(p);
      }
    });

    return {
      text: lines.join('\n'),
      products: uniqueProducts.slice(0, 6),
      calculator: {
        totalWatts: totalWatts,
        safetyWatts: safetyWatts,
        devices: devices,
        recommendedInverters: inversores.slice(0, 3).map(function (p) { return p.id; }),
        recommendedBatteries: baterias.slice(0, 2).map(function (p) { return p.id; }),
        packProducts: packProducts.map(function (p) { return p.id; }),
        packTotal: packTotal
      },
      quickReplies: [
        'Ver inversores disponibles',
        'Ver baterías',
        'Necesito más horas de respaldo',
        'Comprar pack por WhatsApp'
      ].concat(hasSolarHint ? ['Ver paneles solares'] : [])
    };
  }

  /**
   * Parsea dispositivos y cantidades del mensaje del usuario.
   * Retorna: { "telefono": 1, "lampara": 3, ... }
   */
  function _parseDevices(msg) {
    var devices = {};
    var n = norm(msg);

    // Presets: los quickReplies del propio bot deben funcionar siempre
    if (/todo lo basico|lo basico|todo basico|lo esencial/.test(n)) {
      return { 'telefono': 2, 'lampara': 3, 'ventilador': 1, 'tv': 1, 'nevera': 1 };
    }

    // Números en palabras → dígitos ("dos lamparas" → "2 lamparas")
    var numWords = { 'un': 1, 'una': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4,
                     'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10 };
    n = n.replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/g, function (m) {
      return String(numWords[m]);
    });

    // Mapeo de sinónimos
    var syns = {
      'celular': 'telefono', 'movil': 'telefono', 'smartphone': 'telefono',
      'telefono cargador': 'cargador de telefono',
      'cargador': 'cargador de telefono',
      'bombillo': 'lampara', 'foco': 'lampara', 'luces': 'lampara', 'luz': 'lampara',
      'nevera pequena': 'nevera', 'refrigerador': 'nevera', 'frigider': 'nevera',
      'pc': 'computadora', 'laptop': 'laptop',
      'ac': 'aire acondicionado 12000btu', 'split': 'aire acondicionado 12000btu',
      'aire': 'aire acondicionado 12000btu',
      'aire acondicionado': 'aire acondicionado 12000btu',
      'micro': 'microondas', 'horno': 'microondas',
      'arrocera': 'olla arrocera', 'olla': 'olla arrocera',
      'tele': 'tv', 'television': 'tv', 'televisor': 'tv'
    };

    // Lista de nombres a escanear: dispositivos conocidos + sinónimos (antes
    // los sinónimos solo funcionaban con cantidad explícita — "solo luces y
    // telefono" perdía las luces porque "luces" no es clave del diccionario).
    // Ordenados por longitud descendente para que "nevera pequena" tenga
    // prioridad sobre "nevera" y "telefono" sobre "tele".
    var knownDevices = Object.keys(DISPOSITIVOS_COMUNES)
      .concat(Object.keys(syns))
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .sort(function (a, b) { return b.length - a.length; });

    // Paso 1: Buscar patrones "Nx dispositivo" (con cantidad explícita)
    var qtyPattern = /(\d+)\s*(cargador de telefono|telefono|celular|movil|lampara|led|foco|bombillo|luz|luces|ventilador|tv|televisor|tele|nevera|refrigerador|frigider|microondas|olla|plancha|lavadora|computadora|pc|laptop|router|radio|cocina|aire|ac|split|monitor|impresora|cargador|altavoz|speaker|telefono cargador|nevera pequena|nevera grande|aire acondicionado 12000btu|aire acondicionado|olla arrocera|tv 32|tv 50|router wifi|cocina electrica)/g;

    var match;
    while ((match = qtyPattern.exec(n)) !== null) {
      var qty = parseInt(match[1], 10);
      var dev = match[2];
      dev = syns[dev] || dev;
      devices[dev] = (devices[dev] || 0) + qty;
    }

    // Paso 2: Buscar dispositivos sin cantidad (asume 1)
    // Esto corre SIEMPRE, no solo cuando el paso 1 no encontró nada,
    // porque el usuario puede decir "TV, nevera y 3 lámparas"
    // (TV y nevera sin cantidad, lámparas con cantidad).
    //
    // En lugar de dividir por comas (que norm() ya eliminó), escaneamos
    // la cadena completa buscando cada dispositivo conocido.
    var usedRanges = []; // Para evitar solapamientos

    knownDevices.forEach(function (known) {
      // Buscar todas las ocurrencias del dispositivo en el texto
      var searchPos = 0;
      while (searchPos < n.length) {
        var idx = n.indexOf(known, searchPos);
        if (idx === -1) break;

        // Verificar que este rango no esté ya usado (por otro dispositivo o por qtyPattern)
        var overlaps = usedRanges.some(function (r) {
          return idx < r.end && (idx + known.length) > r.start;
        });

        if (!overlaps) {
          // Verificar si el dispositivo ya fue detectado por el paso 1 (qtyPattern)
          // Buscar el nombre canónico en DISPOSITIVOS_COMUNES
          var canonicalName = syns[known] || known;
          if (!devices[canonicalName]) {
            // Buscar si hay una cantidad justo antes del dispositivo
            var beforeText = n.substring(Math.max(0, idx - 5), idx).trim();
            var qtyBefore = beforeText.match(/(\d+)\s*$/);
            var q = qtyBefore ? parseInt(qtyBefore[1], 10) : 1;
            devices[canonicalName] = (devices[canonicalName] || 0) + q;
            usedRanges.push({ start: idx, end: idx + known.length });
          } else {
            usedRanges.push({ start: idx, end: idx + known.length });
          }
        }

        searchPos = idx + known.length;
      }
    });

    return devices;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 7: RECOMMENDATION ENGINE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Recomienda productos basándose en contexto.
   * NUNCA recomienda productos agotados.
   * SIEMPRE menciona cuando stock ≤ 3.
   */
  function recommendProducts(context) {
    context = context || {};
    var ps = _getProducts();
    var category = context.category;
    var budget = context.budget;
    var need = context.need;
    var productType = context.productType;

    // Filtrar solo con stock
    var available = ps.filter(function (p) { return p.stock > 0; });
    if (available.length === 0) {
      return {
        text: 'No tengo productos disponibles en este momento. Escríbenos por WhatsApp para saber cuándo reponemos. 📱',
        quickReplies: ['💬 WhatsApp']
      };
    }

    // Filtrar por tipo de producto si se detectó (inversor, bateria, etc.)
    if (productType && PRODUCT_TYPE_FILTERS[productType]) {
      var typeFiltered = available.filter(PRODUCT_TYPE_FILTERS[productType]);
      if (typeFiltered.length > 0) available = typeFiltered;
    }

    // Filtrar por categoría si se especifica
    if (category) {
      var nCat = norm(category);
      var filtered = available.filter(function (p) {
        return norm(p.categoria || '').includes(nCat) || norm(p.subcategoria || '').includes(nCat);
      });
      if (filtered.length > 0) available = filtered;
    }

    // Filtrar por presupuesto si se especifica
    if (budget && budget > 0) {
      var withinBudget = available.filter(function (p) { return p.precioActual <= budget; });
      if (withinBudget.length > 0) available = withinBudget;
    }

    // Filtrar por necesidad (texto) si se especifica
    if (need) {
      var nNeed = norm(need);
      var byNeed = available.filter(function (p) {
        return norm(p.nombre || '').includes(nNeed) ||
               norm(p.descripcion || '').includes(nNeed) ||
               norm(p.categoria || '').includes(nNeed);
      });
      if (byNeed.length > 0) available = byNeed;
    }

    // Ordenar: más vendidos > con descuento > mejor valor (specs/precio)
    available.sort(function (a, b) {
      // 1. Más vendidos
      var ma = (a.masVendido === true || a.masVendido === 'true') ? 1 : 0;
      var mb = (b.masVendido === true || b.masVendido === 'true') ? 1 : 0;
      if (ma !== mb) return mb - ma;
      // 2. Con descuento
      var da = a.descuento > 0 ? 1 : 0;
      var db = b.descuento > 0 ? 1 : 0;
      if (da !== db) return db - da;
      // 3. Urgencia de stock (menos stock primero para crear urgencia)
      if (a.stock <= 3 && b.stock > 3) return -1;
      if (b.stock <= 3 && a.stock > 3) return 1;
      // 4. Menor precio
      return (a.precioActual || 0) - (b.precioActual || 0);
    });

    var top = available.slice(0, 5);
    var lines = [];
    lines.push('🎯 Te recomiendo:');
    lines.push('');

    top.forEach(function (p, i) {
      var urgency = p.stock <= 3 ? ' ⚠️ ¡Quedan pocos!' : '';
      var discount = p.descuento > 0 ? ' 🔥 -' + p.descuento + '%' : '';
      var hot = (p.masVendido === true || p.masVendido === 'true') ? ' 🔥' : '';
      lines.push((i + 1) + '️⃣ ' + p.nombre + ' — ' + _fmtPrice(p.precioActual) + _mnSuffix(p.precioActual) + discount + urgency + hot);
      if (Array.isArray(p.specs) && p.specs.length > 0) {
        var cleanSpecs = p.specs.map(function (s) { return String(s).replace(/^[⠀-代言]\s*/, '').trim(); }).filter(Boolean);
        lines.push('   📋 ' + cleanSpecs.join(' · '));
      }
    });

    lines.push('');
    lines.push('¿Te interesa alguno? 😊');

    return {
      text: lines.join('\n'),
      products: top,
      quickReplies: top.slice(0, 3).map(function (p) {
        return _shortName(p.nombre);
      }).concat(['Ver más', '💬 WhatsApp'])
    };
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 8: FAST RESPONSES (Regex, sin LLM, instantáneas)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Genera respuestas rápidas BAJO DEMANDA (lazy).
   * No se evalúan al cargar el IIFE, solo cuando chat() las necesita.
   * Esto evita que _waLink() / _getRate() fallen si localStorage
   * aún no está disponible al momento del parseo.
   */
  /**
   * Gancho de ventas para el saludo: cuántas ofertas reales hay hoy.
   * Un saludo con dato concreto vende más que uno genérico.
   */
  function _welcomeHook() {
    try {
      var conDescuento = _getProducts().filter(function (p) {
        return p.stock > 0 && p.descuento > 0;
      });
      if (conDescuento.length === 0) return '';
      var top = conDescuento.reduce(function (a, b) { return (b.descuento || 0) > (a.descuento || 0) ? b : a; });
      return '\n\n🔥 Hoy hay ' + conDescuento.length + ' producto' + (conDescuento.length > 1 ? 's' : '') +
             ' en oferta (hasta -' + top.descuento + '%).';
    } catch (e) { return ''; }
  }

  function _getFastResponse(intentKey) {
    switch (intentKey) {
      case 'GREETING':
        return {
          text: '¡Hola! 👋 Soy Max, tu asistente de TiendaMax. ¿En qué te puedo ayudar?\n\nPuedo buscar productos, comparar precios, calcular consumo eléctrico o decirte cómo comprar.' + _welcomeHook(),
          quickReplies: ['🔥 Ofertas', '📦 Categorías', '⚡ Calcular consumo', '💬 WhatsApp']
        };
      case 'FAREWELL':
        return {
          text: '¡Hasta luego! Cuando quieras, aquí estoy. 🙌',
          quickReplies: ['🔥 Ofertas', '📦 Categorías']
        };
      case 'HELP':
        return {
          text: '¡Claro! Puedo ayudarte con:\n\n' +
                '🔍 Buscar productos — "busco un router wifi"\n' +
                '📊 Comparar — "compara routers"\n' +
                '⚡ Calcular consumo — "qué inversor necesito"\n' +
                '💵 Precios — "cuánto cuesta la batería"\n' +
                '📦 Disponibilidad — "hay routers disponibles?"\n' +
                '🚚 Envíos — "hacen envíos?"\n' +
                '💳 Pagos — "cómo puedo pagar?"\n' +
                '🛡️ Garantía — "hay garantía?"\n' +
                '💬 WhatsApp — "pásame el WhatsApp"\n\n' +
                '¡Pregúntame lo que necesites!',
          quickReplies: ['Buscar producto', 'Ver ofertas', 'Calcular consumo', '💬 WhatsApp']
        };
      case 'WHATSAPP':
        return {
          text: '📱 Nuestro WhatsApp:\n\n' + _waLink(),
          quickReplies: ['💬 Abrir WhatsApp', 'Ver productos']
        };
      case 'SHIPPING':
        return {
          text: '🚚 Envíos:\n\n' + _envioTexto() + '\n\nCoordinamos la entrega por WhatsApp. ¡Escríbenos! 👇',
          quickReplies: ['💬 WhatsApp', 'Ver productos']
        };
      case 'PAYMENT':
        return {
          text: '💳 Formas de pago:\n\n' +
                '💵 Efectivo (USD o MN)\n' +
                '📱 Transferencia bancaria\n' +
                '💱 Tasa del día: 1 USD = ' + _getRate() + ' MN\n\n' +
                'Coordinamos el pago por WhatsApp cuando haces tu pedido.\n' +
                '💡 Puedes cambiar la moneda con el botón USD/MN arriba de la tienda.',
          quickReplies: ['💬 WhatsApp', '🔥 Ofertas']
        };
      case 'HOURS':
        return {
          text: '🕐 Horario de atención:\n\n' +
                'Lunes a Sábado: 9:00 AM - 8:00 PM\n' +
                'Domingos: 10:00 AM - 6:00 PM\n\n' +
                'La tienda online está abierta 24/7 🌐\n' +
                'Para compras, escríbenos por WhatsApp en cualquier momento.',
          quickReplies: ['💬 WhatsApp', 'Ver productos']
        };
      case 'LOCATION':
        return {
          text: '📍 TiendaMax es una tienda online.\n\n' +
                'Operamos desde Cuba con envío a diferentes zonas.\n' +
                'Para coordinar entrega o visitarnos, escríbenos por WhatsApp. 📱',
          quickReplies: ['💬 WhatsApp', '🚚 Info de envío']
        };
      case 'WARRANTY':
        return {
          text: '🛡️ Garantía:\n\n' +
                'Todos nuestros productos tienen garantía.\n' +
                'La duración varía según el producto (consultá el detalle de cada uno).\n' +
                'Si tienes algún problema, contáctanos por WhatsApp y lo resolvemos. 👍',
          quickReplies: ['💬 WhatsApp', 'Ver productos']
        };
      case 'RETURNS':
        return {
          text: '↩️ Devoluciones:\n\n' +
                'Aceptamos cambios y devoluciones dentro de los primeros 7 días si el producto llega con defecto.\n' +
                'El producto debe estar en su estado original y con su empaque.\n' +
                'Para gestionar una devolución, escríbenos por WhatsApp. 📱',
          quickReplies: ['💬 WhatsApp']
        };
      default:
        return null;
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 9: MAIN CHAT HANDLER
  // ═══════════════════════════════════════════════════════════════

  /**
   * Historial de la conversación (en memoria, por sesión).
   */
  var _conversationHistory = [];
  var MAX_HISTORY = 20;

  // ── Memoria de contexto de la conversación ──
  // Los quickReplies que el propio bot ofrece ("Comparar", "Ver más",
  // "Ver similar") necesitan saber de qué se estaba hablando; sin esto,
  // tocarlos disparaba búsquedas literales de "comparar"/"ver mas" que
  // devolvían productos aleatorios o errores.
  var _lastResults = [];      // resultados completos de la última búsqueda/ofertas
  var _lastShownCount = 0;    // cuántos de esos ya se mostraron
  var _lastQuery = '';        // término de la última búsqueda
  var _lastDetailProduct = null; // último producto mostrado en detalle

  /**
   * Meta-comandos: respuestas a los botones que el propio bot ofrece.
   * Se evalúan ANTES de detectIntent porque son literales conocidos,
   * no lenguaje natural. Devuelve null si el mensaje no es un meta-comando.
   */
  function _handleMetaCommand(n) {
    // "Buscar producto" / "Buscar otro" — pedir el término, no buscarlo literal
    if (/^(buscar (producto|otro|algo)|🔍 buscar producto)$/.test(n) || n === 'buscar') {
      return {
        text: '🔍 Dime qué producto buscas.\nPor ejemplo: "router wifi", "inversor 3000w", "audífonos"...',
        quickReplies: ['🔥 Ofertas', '📦 Categorías']
      };
    }

    // "Ver más" — continuar la lista anterior en vez de buscar "ver mas"
    if (/^ver mas( productos| resultados)?$/.test(n)) {
      if (_lastResults.length > _lastShownCount) {
        var next = _lastResults.slice(_lastShownCount, _lastShownCount + 5);
        _lastShownCount += next.length;
        var moreLines = ['🔍 Más resultados' + (_lastQuery ? ' para "' + _lastQuery + '"' : '') + ':', ''];
        next.forEach(function (p, i) { moreLines.push(formatProductShort(p, i)); });
        var hayMas = _lastResults.length > _lastShownCount;
        return {
          text: moreLines.join('\n'),
          products: next,
          quickReplies: next.slice(0, 2).map(function (p) { return _shortName(p.nombre); })
            .concat(hayMas ? ['Ver más'] : []).concat(['💬 WhatsApp'])
        };
      }
      return _handleOffers('ofertas');
    }

    // "Comparar" pelado — comparar lo que se acaba de mostrar; si no hay
    // contexto suficiente, dar a escoger tipos comparables (chooser real).
    if (/^comparar$/.test(n)) {
      var comparables = _lastResults.slice(0, _lastShownCount || 5).filter(function (p) { return p.stock > 0; });
      if (comparables.length >= 2) {
        return compareProducts(comparables.slice(0, 4));
      }
      return _compareTypeChooser();
    }

    // "la primera" / "el 2" / "quiero el tercero" — referencia ordinal a la
    // lista recién mostrada (antes buscaba "primera" como si fuera un producto)
    var ordMatch = n.match(/^(?:quiero |me interesa |dame )?(?:el |la )?(1|2|3|4|5|primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta)$/);
    if (ordMatch && _lastResults.length > 0) {
      var ordMap = { 'primero': 1, 'primera': 1, 'segundo': 2, 'segunda': 2,
                     'tercero': 3, 'tercera': 3, 'cuarto': 4, 'cuarta': 4,
                     'quinto': 5, 'quinta': 5 };
      var idx = (ordMap[ordMatch[1]] || parseInt(ordMatch[1], 10)) - 1;
      var elegido = _lastResults[idx];
      if (elegido) {
        _lastDetailProduct = elegido;
        var combosOrd = _getComplements(elegido);
        var ordText = formatProductCard(elegido);
        if (combosOrd.length > 0) {
          ordText += '\n\n💡 Combina bien con:';
          combosOrd.forEach(function (c) { ordText += '\n• ' + _shortName(c.nombre) + ' — ' + _fmtPrice(c.precioActual); });
        }
        ordText += '\n\n¿Qué quieres hacer?';
        return {
          text: ordText,
          products: [elegido].concat(combosOrd),
          whatsappProduct: elegido.stock > 0 ? elegido.id : null,
          quickReplies: elegido.stock > 0
            ? ['💬 Comprar por WhatsApp', 'Ver similar']
            : ['Ver similar', '💬 WhatsApp']
        };
      }
    }

    // "Ver similar" — misma categoría que el último producto visto
    if (/^ver similar(es)?$/.test(n)) {
      if (_lastDetailProduct) {
        var sim = getProductsByCategory(_lastDetailProduct.categoria || '', { maxResults: 6, onlyInStock: true })
          .filter(function (p) { return String(p.id) !== String(_lastDetailProduct.id); })
          .slice(0, 4);
        if (sim.length > 0) {
          return {
            text: '🔎 Similares a ' + _shortName(_lastDetailProduct.nombre) + ':',
            products: sim,
            quickReplies: sim.slice(0, 2).map(function (p) { return _shortName(p.nombre); }).concat(['Comparar', '💬 WhatsApp'])
          };
        }
      }
      return null;
    }

    // "Abrir WhatsApp" / "Comprar por WhatsApp" — dar el botón directo
    if (/^(💬 )?(abrir whatsapp|comprar por whatsapp)$/.test(n) || /^abrir whatsapp$/.test(n)) {
      return {
        text: 'Perfecto 👇 Toca el botón para escribirnos:',
        whatsappProduct: _lastDetailProduct || null,
        quickReplies: ['Ver productos', '🔥 Ofertas']
      };
    }

    // "Comprar pack por WhatsApp" — link del último pack calculado
    if (/^comprar pack( por whatsapp)?$/.test(n)) {
      if (_lastPackLink) {
        return {
          text: '🔋 Tu pack te espera 👇\n' + _lastPackLink,
          quickReplies: ['Ver inversores disponibles', 'Ver baterías']
        };
      }
      return null;
    }

    // "Necesito más horas de respaldo" — recalcular con el doble de horas
    if (/mas horas de respaldo|necesito mas horas|mas respaldo/.test(n)) {
      if (_lastCalc && _lastCalc.devices) {
        var newHours = Math.min((_lastCalc.hours || 4) * 2, 24);
        var r = _calcResult(_lastCalc.devices, n, newHours);
        r.text = '🔋 Recalculado para ~' + newHours + 'h de respaldo:\n\n' + r.text;
        return r;
      }
      return null;
    }

    // ── Superlativos sobre la lista mostrada ──
    // "el más barato" / "el más potente" / "el mejor"
    // Solo sobre lo que el cliente VIO (no la cola completa de resultados,
    // que puede traer coincidencias débiles de otra categoría).
    if (_lastResults.length > 0) {
      var shown = _lastResults.slice(0, _lastShownCount || 5);
      var pool = shown.filter(function (p) { return p.stock > 0; });
      if (pool.length === 0) pool = shown;
      var pick = null, pickLabel = '';
      if (/^(el |la )?mas barat[oa]$/.test(n) || /^cual es (el |la )?mas barat[oa]/.test(n)) {
        pick = pool.reduce(function (a, b) { return (b.precioActual || 0) < (a.precioActual || 0) ? b : a; });
        pickLabel = '💵 El más económico:';
      } else if (/^(el |la )?mas potente$/.test(n) || /^cual es (el |la )?mas potente/.test(n)) {
        pick = pool.reduce(function (a, b) {
          return (parseSpec(b.specs).watts || 0) > (parseSpec(a.specs).watts || 0) ? b : a;
        });
        pickLabel = '⚡ El más potente:';
      } else if (/^(el |la )?mejor$/.test(n) || /^cual (es el |es la |me recomiendas)?mejor/.test(n)) {
        pick = pool.filter(function (p) { return p.masVendido === true || p.masVendido === 'true'; })[0] || pool[0];
        pickLabel = '🏆 Mi recomendado:';
      }
      if (pick) {
        _lastDetailProduct = pick;
        return {
          text: pickLabel + '\n\n' + formatProductCard(pick) + '\n\n¿Te lo aparto? 😊',
          products: [pick],
          whatsappProduct: pick.stock > 0 ? pick.id : null,
          quickReplies: ['💬 Comprar por WhatsApp', 'Ver similar', 'Es muy caro']
        };
      }
    }

    // ── Objeción de precio: "es muy caro" ──
    if (/(muy|esta|es|que) car[oa]\b|carisim[oa]|no me alcanza|mucho dinero/.test(n)) {
      var ref = _lastDetailProduct || (_lastResults.length ? _lastResults[0] : null);
      if (ref) {
        // Alternativas más baratas del mismo tipo/categoría, en stock
        var refType = null;
        for (var rt in PRODUCT_TYPE_FILTERS) {
          if (PRODUCT_TYPE_FILTERS.hasOwnProperty(rt) && PRODUCT_TYPE_FILTERS[rt](ref)) { refType = rt; break; }
        }
        var cheaper = _getProducts().filter(function (p) {
          if (p.stock <= 0 || String(p.id) === String(ref.id)) return false;
          if ((p.precioActual || 0) >= (ref.precioActual || 0)) return false;
          if (refType) return PRODUCT_TYPE_FILTERS[refType](p);
          return (p.categoria || '') === (ref.categoria || '');
        }).sort(function (a, b) { return (b.precioActual || 0) - (a.precioActual || 0); }).slice(0, 3);

        if (cheaper.length > 0) {
          var objLines = ['Te entiendo 👍 Mira estas opciones más económicas:', ''];
          cheaper.forEach(function (p, i) { objLines.push(formatProductShort(p, i)); });
          objLines.push('');
          objLines.push('💡 Recuerda: puedes pagar en MN a la tasa del día, y el pago es contra entrega.');
          _lastResults = cheaper;
          _lastShownCount = cheaper.length;
          return {
            text: objLines.join('\n'),
            products: cheaper,
            quickReplies: cheaper.slice(0, 2).map(function (p) { return _shortName(p.nombre); }).concat(['💬 WhatsApp'])
          };
        }
        return {
          text: 'Es la mejor opción que tengo ahora en esa línea 🙏 Pero recuerda:\n\n' +
                '💵 Pagas contra entrega (nada por adelantado)\n' +
                '🇨🇺 Puedes pagar en MN a la tasa del día\n' +
                '💬 Escríbenos por WhatsApp y vemos cómo ayudarte con el precio.',
          whatsappProduct: ref.stock > 0 ? ref.id : null,
          quickReplies: ['💬 WhatsApp', 'Ver ofertas', '📦 Categorías']
        };
      }
      return null;
    }

    // ── "¿Es nuevo o de uso?" / garantía del producto en contexto ──
    if (_lastDetailProduct && /es nuevo|de uso|es usado|nuevo o de uso/.test(n)) {
      var esUsado = _lastDetailProduct.usado === true || _lastDetailProduct.usado === 'true';
      return {
        text: (esUsado
          ? '📦 ' + _shortName(_lastDetailProduct.nombre) + ' es DE USO, revisado y funcionando.'
          : '✨ ' + _shortName(_lastDetailProduct.nombre) + ' es NUEVO.') +
          (_lastDetailProduct.garantia ? '\n🛡️ Garantía: ' + _lastDetailProduct.garantia : '\n🛡️ Tiene garantía.') +
          '\n\n¿Te lo aparto?',
        whatsappProduct: _lastDetailProduct.stock > 0 ? _lastDetailProduct.id : null,
        quickReplies: ['💬 Comprar por WhatsApp', 'Ver similar']
      };
    }
    if (_lastDetailProduct && /garantia/.test(n) && n.length < 45) {
      return {
        text: '🛡️ ' + _shortName(_lastDetailProduct.nombre) + ': ' +
              (_lastDetailProduct.garantia ? 'garantía de ' + _lastDetailProduct.garantia : 'tiene garantía incluida') +
              '.\nSi algo falla, contáctanos por WhatsApp y lo resolvemos. 👍',
        whatsappProduct: _lastDetailProduct.stock > 0 ? _lastDetailProduct.id : null,
        quickReplies: ['💬 Comprar por WhatsApp', 'Ver similar']
      };
    }

    // ── Carrito desde el chat ──
    if (/^(🛒 )?(ver|abrir) (el )?carrito$/.test(n) || n === 'carrito') {
      return {
        text: 'Abriendo tu carrito 🛒',
        action: 'openCart',
        quickReplies: ['Seguir comprando', '🔥 Ofertas']
      };
    }
    if (/^seguir comprando$/.test(n)) {
      return _handleOffers('ofertas');
    }

    return null;
  }

  /**
   * Punto de entrada principal del agente.
   * Recibe un mensaje del usuario y devuelve una respuesta estructurada.
   *
   * @param {string} message - Mensaje del usuario
   * @returns {Object} - { text, products?, comparison?, calculator?, quickReplies, whatsappProduct? }
   */
  function chat(message) {
    message = (message || '').trim();
    if (!message) {
      return {
        text: '¿En qué te puedo ayudar? Escribe lo que buscas o selecciona una opción. 😊',
        quickReplies: ['🔥 Ofertas', '📦 Categorías', '💬 WhatsApp']
      };
    }

    // Guardar en historial
    _conversationHistory.push({ role: 'user', text: message, ts: Date.now() });
    if (_conversationHistory.length > MAX_HISTORY * 2) {
      _conversationHistory = _conversationHistory.slice(-MAX_HISTORY);
    }

    // Detectar intención
    var intent = detectIntent(message);
    var response;

    // ── Meta-comandos (botones que el propio bot ofrece) ──
    if (!_calcState) {
      response = _handleMetaCommand(norm(message));
    }

    // ── Flujo conversacional activo (ej: calculadora esperando dispositivos) ──
    // Si hay un flujo activo, SIEMPRE procesar con ese handler, sin importar
    // la intención detectada. Al cancelar, responder la despedida del flujo
    // directamente — antes "caía al flujo normal" y terminaba buscando
    // "cancelar" como si fuera un producto.
    if (!response && _calcState) {
      var nCheck = norm(message);
      if (/^\s*(cancelar|salir|no gracias|nada|otra cosa|ya no|olvidalo|dejalo)\b/.test(nCheck)) {
        _calcState = null;
        response = {
          text: 'OK, si necesitas calcular después, aquí estoy. 👍\n¿Te ayudo con otra cosa?',
          quickReplies: ['Buscar producto', '🔥 Ofertas', '📦 Categorías']
        };
      } else {
        response = handleCalculate(message);
      }
    }

    // ── Respuestas rápidas (sin búsqueda de productos, evaluadas lazy) ──
    // Solo si no hay ya una respuesta de un flujo activo (ej. calculadora):
    // si no, un intent rápido pisaba la respuesta pero _calcState seguía activo,
    // dejando la conversación colgada en un estado que ya no correspondía.
    if (!response) {
    var _fastKey = null;
    switch (intent) {
      case INTENT.GREETING:  _fastKey = 'GREETING'; break;
      case INTENT.FAREWELL:  _fastKey = 'FAREWELL'; break;
      case INTENT.HELP:      _fastKey = 'HELP'; break;
      case INTENT.WHATSAPP:  _fastKey = 'WHATSAPP'; break;
      case INTENT.SHIPPING:  _fastKey = 'SHIPPING'; break;
      case INTENT.PAYMENT:   _fastKey = 'PAYMENT'; break;
      case INTENT.HOURS:     _fastKey = 'HOURS'; break;
      case INTENT.LOCATION:  _fastKey = 'LOCATION'; break;
      case INTENT.WARRANTY:  _fastKey = 'WARRANTY'; break;
      case INTENT.RETURNS:   _fastKey = 'RETURNS'; break;
    }
    if (_fastKey) {
      response = _getFastResponse(_fastKey);
    }
    }

    // ── Intenciones que requieren procesamiento ──
    if (!response) {
    switch (intent) {
      case INTENT.CATEGORIES:
        response = _handleCategories();
        break;

      case INTENT.OFFERS:
        response = _handleOffers(message);
        break;

      case INTENT.SEARCH:
        response = _handleSearch(message);
        break;

      case INTENT.COMPARE:
        response = _handleCompare(message);
        break;

      case INTENT.RECOMMEND:
        response = _handleRecommend(message);
        break;

      case INTENT.CALCULATE:
        response = handleCalculate(message);
        break;

      case INTENT.DETAIL:
        response = _handleDetail(message);
        break;

      case INTENT.STOCK:
        response = _handleStock(message);
        break;

      default:
        // Intentar búsqueda como último recurso
        response = _handleSearch(message);
        if (!response.products || response.products.length === 0) {
          // En vez de un "no entendí" seco, mostrar lo más buscado —
          // un vendedor nunca deja al cliente sin nada que mirar.
          var populares = _getProducts().filter(function (p) {
            return p.stock > 0 && (p.masVendido === true || p.masVendido === 'true');
          }).slice(0, 3);
          if (populares.length > 0) {
            _lastResults = populares;
            _lastShownCount = populares.length;
            response = {
              text: 'No estoy seguro de haberte entendido 🤔 pero mira lo más buscado de la tienda:\n\n' +
                    populares.map(function (p, i) { return formatProductShort(p, i); }).join('\n') +
                    '\n\n¿O me dices con otras palabras qué buscas?',
              products: populares,
              quickReplies: ['🔥 Ofertas', '📦 Categorías', '⚡ Calcular consumo', '💬 WhatsApp']
            };
          } else {
            response = {
              text: 'No entendí bien tu consulta. ¿Puedo ayudarte con algo de esto?',
              quickReplies: ['Buscar producto', '🔥 Ofertas', '📦 Categorías', '💬 WhatsApp']
            };
          }
        }
        break;
    }
    } // fin if (!response)

    // Guardar respuesta en historial
    _conversationHistory.push({ role: 'bot', text: response.text, ts: Date.now() });

    // Aprender de la interacción (no bloqueante)
    _learnAsync(message, intent, response);

    return response;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 10: INTENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

  function _handleCategories() {
    var cats = _getCategories();
    var ps = _getProducts();

    var lines = [];
    lines.push('📦 Nuestras categorías:');
    lines.push('');

    var catCounts = {};
    ps.forEach(function (p) {
      var c = p.categoria || 'General';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    // Iconos para categorías
    var catIcons = {
      'WIFI': '📡', 'ENERGIA': '⚡', 'CELULARES': '📱', 'UTILES': '🛠️',
      'CARROS': '🚗', 'ROPA': '👗', 'SEGURIDAD': '🔒', 'HOGAR': '🏠',
      'JUEGOS': '🎮', 'MOTOS': '🛵', 'PC Y LAPTOPS': '💻', 'GYM': '🏋️'
    };

    cats.forEach(function (cat) {
      var icon = catIcons[cat] || '🛍️';
      var count = catCounts[cat] || 0;
      var inStock = ps.filter(function (p) { return p.categoria === cat && p.stock > 0; }).length;
      lines.push(icon + ' ' + cat + ' — ' + inStock + ' disponible' + (inStock !== 1 ? 's' : '') + ' de ' + count);
    });

    lines.push('');
    lines.push('¿Cuál te interesa?');

    return {
      text: lines.join('\n'),
      quickReplies: cats.slice(0, 5).map(function (c) { return (catIcons[c] || '🛍️') + ' ' + c; }).concat(['🔥 Ofertas'])
    };
  }

  function _handleOffers(message) {
    var ps = _getProducts();
    // "ofertas en celulares" → filtrar por la categoría mencionada
    var cat = _extractCategoryFromMsg(message || '');
    // Productos con descuento o más vendidos
    var offers = ps.filter(function (p) {
      return p.stock > 0 && (p.descuento > 0 || (p.masVendido === true || p.masVendido === 'true'));
    }).sort(function (a, b) {
      // Priorizar con descuento
      var da = a.descuento > 0 ? a.descuento : 0;
      var db = b.descuento > 0 ? b.descuento : 0;
      if (da !== db) return db - da;
      return (b.precioActual || 0) - (a.precioActual || 0);
    });

    if (cat) {
      var enCat = offers.filter(function (p) { return (p.categoria || '').toUpperCase() === cat; });
      if (enCat.length > 0) offers = enCat;
    }

    if (offers.length === 0) {
      // Fallback: mostrar los más vendidos con stock
      offers = ps.filter(function (p) { return p.stock > 0; })
        .sort(function (a, b) { return (b.precioActual || 0) - (a.precioActual || 0); })
        .slice(0, 5);
    }

    // Recordar contexto para "Ver más" / "Comparar"
    _lastResults = offers;
    _lastShownCount = Math.min(offers.length, 5);
    _lastQuery = cat ? 'ofertas en ' + cat : 'ofertas';

    var lines = [];
    lines.push(cat ? '🔥 Ofertas en ' + cat + ':' : '🔥 Ofertas y más vendidos:');
    lines.push('');

    offers.slice(0, 5).forEach(function (p, i) {
      lines.push(formatProductShort(p, i));
      if (p.stock <= 3) {
        lines.push('   ⚠️ ¡Solo ' + p.stock + ' disponibles!');
      }
    });

    lines.push('');
    lines.push('¿Algo te llama la atención? 😊');

    return {
      text: lines.join('\n'),
      products: offers.slice(0, 5),
      quickReplies: offers.slice(0, 3).map(function (p) { return _shortName(p.nombre); }).concat(['Ver más', '💬 WhatsApp'])
    };
  }

  function _handleSearch(message) {
    // Presupuesto: "inversor hasta 200", "tengo 100 usd para un router"
    var budget = _parseBudget(norm(message));
    // Extraer término de búsqueda (sin la frase de presupuesto)
    var query = _extractSearchQuery(budget ? budget.cleaned : message);
    // Pedir de más para poder responder "Ver más" después sin re-buscar
    var fullResults = searchProducts(query, { maxResults: 15 });

    if (budget) {
      var inBudget = fullResults.filter(function (p) {
        var pr = p.precioActual || 0;
        if (budget.max !== undefined && pr > budget.max) return false;
        if (budget.min !== undefined && pr < budget.min) return false;
        return true;
      });
      if (inBudget.length > 0) {
        fullResults = inBudget;
      } else if (budget.max !== undefined && fullResults.length > 0) {
        // Nada dentro del presupuesto: ofrecer lo más cercano por arriba,
        // avisando — mejor que un "no encontré" seco.
        var closest = fullResults.slice().sort(function (a, b) {
          return (a.precioActual || 0) - (b.precioActual || 0);
        }).slice(0, 3);
        _lastResults = closest;
        _lastShownCount = closest.length;
        _lastQuery = query;
        return {
          text: '😕 No tengo "' + query + '" por debajo de $' + budget.max + ' ahora mismo.\n' +
                'Lo más cercano que tengo:\n\n' +
                closest.map(function (p, i) { return formatProductShort(p, i); }).join('\n') +
                '\n\n💡 Recuerda que pagas contra entrega, y en MN si prefieres.',
          products: closest,
          quickReplies: closest.slice(0, 2).map(function (p) { return _shortName(p.nombre); }).concat(['🔥 Ofertas', '💬 WhatsApp'])
        };
      }
    }

    var results = fullResults.slice(0, 5);

    if (results.length === 0) {
      // Intentar búsqueda más amplia sin filtro de stock
      results = searchProducts(query, { maxResults: 5, onlyInStock: false });

      if (results.length === 0) {
        return {
          text: '😕 No encontré "' + query + '" en nuestro catálogo.\n\n¿Quieres buscar algo diferente o ver nuestras categorías?',
          quickReplies: ['📦 Categorías', '🔥 Ofertas', '💬 WhatsApp']
        };
      }

      // Todos agotados
      return {
        text: 'Encontré resultados para "' + query + '" pero están agotados:\n\n' +
              results.map(function (p, i) { return formatProductShort(p, i); }).join('\n') +
              '\n\nEscríbenos por WhatsApp para saber cuándo reponen. 📱',
        products: results,
        quickReplies: ['💬 WhatsApp', '📦 Categorías', 'Buscar otro']
      };
    }

    // Recordar contexto para "Ver más" / "Comparar"
    _lastResults = fullResults;
    _lastShownCount = results.length;
    _lastQuery = query;

    var lines = [];
    if (results.length === 1) {
      _lastDetailProduct = results[0];
      lines.push(formatProductCard(results[0]));
      var combos1 = _getComplements(results[0]);
      if (combos1.length > 0) {
        lines.push('');
        lines.push('💡 Combina bien con:');
        combos1.forEach(function (c) { lines.push('• ' + _shortName(c.nombre) + ' — ' + _fmtPrice(c.precioActual)); });
      }
      lines.push('');
      lines.push('¿Qué quieres hacer?');
      return {
        text: lines.join('\n'),
        products: [results[0]].concat(combos1),
        whatsappProduct: results[0].stock > 0 ? results[0].id : null,
        quickReplies: results[0].stock > 0
          ? ['💬 Comprar por WhatsApp', 'Ver similar', 'Comparar']
          : ['Ver similar', '💬 WhatsApp']
      };
    } else {
      lines.push('🔍 Encontré ' + results.length + ' resultados para "' + query + '":');
      lines.push('');
      results.forEach(function (p, i) {
        lines.push(formatProductShort(p, i));
        if (p.stock <= 3 && p.stock > 0) {
          lines.push('   ⚠️ ¡Solo ' + p.stock + ' disponibles!');
        }
      });
      lines.push('');
      lines.push('¿Cuál te interesa?');
    }

    var qr = results.slice(0, 3).map(function (p) { return _shortName(p.nombre); });
    if (results.length > 1) {
      qr.push('Comparar');
    }
    qr.push('💬 WhatsApp');

    return {
      text: lines.join('\n'),
      products: results,
      quickReplies: qr
    };
  }

  function _handleCompare(message) {
    var n = norm(message);

    // Intentar extraer nombres de productos del mensaje
    var ps = _getProducts();
    var mentioned = [];

    // ── NEW: Detect product type from message using stemming ──
    // "comparar los inversores" → detect "inversor" type
    var detectedType = null;
    var words = n.split(/\s+/);
    for (var wi = 0; wi < words.length; wi++) {
      var stemmed = _stemES(words[wi]);
      if (PRODUCT_TYPE_FILTERS[stemmed]) {
        detectedType = stemmed;
        break;
      }
      // Also check unstemmed (for "inversor" said in singular)
      if (PRODUCT_TYPE_FILTERS[words[wi]]) {
        detectedType = words[wi];
        break;
      }
    }

    // Buscar productos mencionados — improved with stemming.
    // Las palabras que son TIPOS de producto ("cargadores", "routers") no
    // cuentan como mención de un producto concreto: van por el path de
    // detectedType (que filtra por stock). Sin esto, "comparar cargadores"
    // trataba cada cargador agotado como "mencionado explícitamente".
    ps.forEach(function (p) {
      var pName = norm(p.nombre);
      var matchCount = 0;
      words.forEach(function (w) {
        if (w.length < 3) return;
        if (PRODUCT_TYPE_FILTERS[w] || PRODUCT_TYPE_FILTERS[_stemES(w)]) return;
        // Direct match: product name contains the word
        if (pName.includes(w)) { matchCount++; return; }
        // Stemmed match: product name contains stemmed word
        var stemmed = _stemES(w);
        if (stemmed !== w && pName.includes(stemmed)) { matchCount++; return; }
        // Reverse match: a word in the product name is a plural of the search word
        var pWords = pName.split(/\s+/);
        for (var pi = 0; pi < pWords.length; pi++) {
          if (pWords[pi].length < 3) continue;
          var pStemmed = _stemES(pWords[pi]);
          if (pStemmed === stemmed || pWords[pi] === stemmed) { matchCount++; break; }
        }
      });
      if (matchCount >= 2 || (matchCount >= 1 && pName.split(/\s+/).length <= 3)) {
        mentioned.push(p);
      }
    });

    // ── NEW: If we detected a product type, filter category results by type ──
    var catMention = _extractCategoryFromMsg(message);
    if (mentioned.length < 2) {
      if (detectedType && PRODUCT_TYPE_FILTERS[detectedType]) {
        // Filter products by the detected type — solo EN STOCK: el relleno
        // automático de la comparación no debe ofrecer agotados.
        var typeProds = ps.filter(PRODUCT_TYPE_FILTERS[detectedType])
          .filter(function (p) { return p.stock > 0; })
          .sort(function (a, b) { return (a.precioActual || 0) - (b.precioActual || 0); });
        var existingIds = new Set(mentioned.map(function (p) { return p.id; }));
        typeProds.forEach(function (p) {
          if (!existingIds.has(p.id) && mentioned.length < 4) {
            mentioned.push(p);
            existingIds.add(p.id);
          }
        });
      }
      // Fallback: also try category if type didn't yield enough
      if (mentioned.length < 2 && catMention) {
        var catProds = getProductsByCategory(catMention, { maxResults: 4, onlyInStock: true });
        var existingIds2 = new Set(mentioned.map(function (p) { return p.id; }));
        catProds.forEach(function (p) {
          if (!existingIds2.has(p.id) && mentioned.length < 4) {
            mentioned.push(p);
            existingIds2.add(p.id);
          }
        });
      }
    }

    if (mentioned.length >= 2) {
      return compareProducts(mentioned.slice(0, 4));
    }

    // No encontré suficientes productos para comparar → dar a escoger de
    // verdad (botones que disparan comparaciones reales, no búsquedas).
    return _compareTypeChooser();
  }

  function _handleRecommend(message) {
    var n = norm(message);
    var context = {};

    // Detectar categoría
    var cat = _extractCategoryFromMsg(message);
    if (cat) context.category = cat;

    // Detect product type for filtering (e.g. "recomienda un inversor" → filter to inverters only)
    var words = n.split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      var stemmed = _stemES(words[i]);
      if (PRODUCT_TYPE_FILTERS[stemmed]) {
        context.productType = stemmed;
        break;
      }
      if (PRODUCT_TYPE_FILTERS[words[i]]) {
        context.productType = words[i];
        break;
      }
    }

    // Detectar presupuesto (mismo parser que la búsqueda)
    var budgetInfo = _parseBudget(n);
    if (budgetInfo && budgetInfo.max !== undefined) {
      context.budget = budgetInfo.max;
    }

    // Detectar necesidad
    var needMatch = n.match(/para\s+(.+?)(?:\s*$|\s*\.)/);
    if (needMatch) context.need = needMatch[1];

    return recommendProducts(context);
  }

  function _handleDetail(message) {
    var query = _extractSearchQuery(message);
    var results = searchProducts(query, { maxResults: 1 });

    if (results.length === 0) {
      results = searchProducts(query, { maxResults: 1, onlyInStock: false });
    }

    if (results.length === 0) {
      return {
        text: 'No encontré ese producto. ¿Puedes ser más específico?',
        quickReplies: ['Buscar producto', '📦 Categorías']
      };
    }

    var p = results[0];
    _lastDetailProduct = p;
    var lines = [];
    lines.push(formatProductCard(p));
    lines.push('');

    // Si tiene descripción, agregar un extracto
    if (p.descripcion) {
      var shortDesc = p.descripcion.replace(/\n/g, ' ').substring(0, 200);
      if (p.descripcion.length > 200) shortDesc += '...';
      lines.push('💬 ' + shortDesc);
      lines.push('');
    }

    // Cross-sell: qué combina con este producto
    var combos = _getComplements(p);
    if (combos.length > 0) {
      lines.push('💡 Combina bien con:');
      combos.forEach(function (c) { lines.push('• ' + _shortName(c.nombre) + ' — ' + _fmtPrice(c.precioActual)); });
      lines.push('');
    }

    lines.push('¿Qué quieres hacer?');

    return {
      text: lines.join('\n'),
      products: [p].concat(combos),
      whatsappProduct: p.stock > 0 ? p.id : null,
      quickReplies: p.stock > 0
        ? ['💬 Comprar por WhatsApp', 'Ver similar', 'Comparar']
        : ['Ver similar', '💬 WhatsApp']
    };
  }

  function _handleStock(message) {
    var query = _extractSearchQuery(message);
    var results = searchProducts(query, { maxResults: 5, onlyInStock: false });

    if (results.length === 0) {
      return {
        text: 'No encontré ese producto. ¿Puedes describirlo mejor?',
        quickReplies: ['Buscar producto', '📦 Categorías']
      };
    }

    // Recordar contexto para "la primera" / "Comparar"
    _lastResults = results;
    _lastShownCount = results.length;
    _lastQuery = query;

    var lines = [];
    results.forEach(function (p, i) {
      var stockStatus = p.stock <= 0 ? '❌ Agotado' :
                       p.stock <= 3 ? '⚠️ ¡Solo ' + p.stock + ' disponibles!' :
                       '✅ ' + p.stock + ' disponibles';
      lines.push((i + 1) + '️⃣ ' + p.nombre + ' — ' + stockStatus + ' — ' + _fmtPrice(p.precioActual));
    });

    lines.push('');
    if (results.some(function (p) { return p.stock > 0; })) {
      lines.push('¿Te interesa alguno?');
    } else {
      lines.push('Todos agotados 😔 Escríbenos por WhatsApp para saber cuándo reponen.');
    }

    return {
      text: lines.join('\n'),
      products: results,
      quickReplies: results.filter(function (p) { return p.stock > 0; }).slice(0, 2).map(function (p) {
        return _shortName(p.nombre);
      }).concat(['💬 WhatsApp'])
    };
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 11: WHATSAPP HANDOFF
  // ═══════════════════════════════════════════════════════════════

  /**
   * Genera el enlace de WhatsApp para un producto específico.
   */
  function handoffToWhatsApp(product) {
    if (!product) {
      var num = _getWhatsAppNumber();
      return 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hola, me interesa conocer más sobre sus productos. ¿Pueden ayudarme?');
    }

    var p = typeof product === 'object' ? product : getProductById(product);
    if (!p) {
      var num2 = _getWhatsAppNumber();
      return 'https://wa.me/' + num2 + '?text=' + encodeURIComponent('Hola, me interesa un producto de TiendaMax.');
    }

    var msg = 'Hola, me interesa el producto: ' + p.nombre + ' - $' + (p.precioActual || 0).toFixed(2) + ' USD';
    var num3 = _getWhatsAppNumber();
    return 'https://wa.me/' + num3 + '?text=' + encodeURIComponent(msg);
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 12: LEARNING SYSTEM (Firebase, no bloqueante)
  // ═══════════════════════════════════════════════════════════════

  var _learnedFAQs = {};
  var _popularProducts = [];

  /**
   * Aprende de la interacción. No bloquea la respuesta.
   */
  function _learnAsync(query, intent, response) {
    // Guardar en localStorage como mínimo
    try {
      var interactions = tmParse(localStorage.getItem('tm_agent_interactions'), []);
      interactions.unshift({
        query: query,
        intent: intent,
        ts: Date.now(),
        productsShown: (response.products || []).map(function (p) { return p.id; })
      });
      // Mantener solo las últimas 100
      localStorage.setItem('tm_agent_interactions', JSON.stringify(interactions.slice(0, 100)));
    } catch (e) { /* silencioso */ }

    // Guardar en Firebase si está disponible (no bloqueante)
    _saveToFirebase(query, intent, response);
  }

  /**
   * Guarda interacción en Firebase RTDB.
   * No bloquea — fire and forget.
   */
  function _saveToFirebase(query, intent, response) {
    try {
      var fbConfig = _getFirebaseConfig();
      if (!fbConfig || !fbConfig.databaseURL) return;

      var dbUrl = fbConfig.databaseURL;
      var interaction = {
        query: query,
        intent: intent,
        ts: Date.now(),
        fecha: new Date().toISOString(),
        productsShown: (response.products || []).map(function (p) { return p.id; })
      };

      // Fire and forget
      fetch(dbUrl + '/agente/interacciones/' + Date.now() + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interaction)
      }).catch(function () { /* silencioso */ });

      // Agregar a FAQ si es una consulta nueva
      var faqKey = norm(query).replace(/\s+/g, '_').substring(0, 50);
      fetch(dbUrl + '/agente/faq/' + faqKey + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          intent: intent,
          lastResponse: (response.text || '').substring(0, 200),
          count: { '.sv': { 'increment': 1 } }, // Server-side increment (sintaxis correcta de Firebase)
          lastUpdated: Date.now()
        })
      }).catch(function () { /* silencioso */ });

    } catch (e) { /* silencioso */ }
  }

  /**
   * Carga FAQs aprendidas desde Firebase.
   * Llamado al init, no bloquea.
   */
  function loadLearnedFAQs() {
    try {
      var fbConfig = _getFirebaseConfig();
      if (!fbConfig || !fbConfig.databaseURL) return;

      fetch(fbConfig.databaseURL + '/agente/faq.json?orderBy="count"&limitToLast=20')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && typeof data === 'object') {
            _learnedFAQs = data;
          }
        })
        .catch(function () { /* silencioso */ });

      // Cargar productos populares
      fetch(fbConfig.databaseURL + '/agente/popular.json?orderBy="views"&limitToLast=10')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && typeof data === 'object') {
            _popularProducts = Object.values(data).sort(function (a, b) {
              return (b.views || 0) - (a.views || 0);
            });
          }
        })
        .catch(function () { /* silencioso */ });

    } catch (e) { /* silencioso */ }
  }

  /**
   * Devuelve las FAQs aprendidas.
   */
  function getFAQ() {
    return _learnedFAQs;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 13: UTILITY HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene el array de productos del scope global.
   */
  function _getProducts() {
    if (typeof productos !== 'undefined' && Array.isArray(productos) && productos.length > 0) {
      return productos;
    }
    // Fallback: localStorage
    try {
      var local = tmParse(localStorage.getItem('productos'), []);
      if (Array.isArray(local) && local.length > 0) return local;
    } catch (e) { /* silencioso */ }
    return [];
  }

  /**
   * Obtiene las categorías del scope global.
   */
  function _getCategories() {
    if (typeof categorias !== 'undefined' && Array.isArray(categorias) && categorias.length > 0) {
      return categorias;
    }
    try {
      var local = tmParse(localStorage.getItem('categorias'), []);
      if (Array.isArray(local) && local.length > 0) return local;
    } catch (e) { /* silencioso */ }
    return ['WIFI', 'ENERGIA', 'CELULARES', 'UTILES', 'CARROS', 'ROPA', 'SEGURIDAD', 'HOGAR', 'JUEGOS', 'MOTOS', 'PC Y LAPTOPS', 'GYM'];
  }

  /**
   * Formatea precio usando la función global si está disponible.
   */
  function _fmtPrice(usd) {
    if (typeof formatPrecio === 'function') {
      try { return formatPrecio(usd); } catch (e) { /* fallback */ }
    }
    return '$' + parseFloat(usd || 0).toFixed(2) + ' USD';
  }

  /**
   * Sufijo " | $X MN" para un precio — SOLO si _fmtPrice devolvió USD.
   * Cuando el cliente ya cambió la moneda a MN, formatPrecio devuelve MN
   * y añadir el sufijo duplicaba el precio ("$52,000 MN | $52,000 MN").
   */
  function _mnSuffix(usd) {
    if (_fmtPrice(usd).indexOf('MN') !== -1) return '';
    var tasa = _getRate();
    if (!(tasa > 0)) return '';
    return ' | $' + Math.round(usd * tasa).toLocaleString('es-CU') + ' MN';
  }

  /**
   * Obtiene la tasa MN usando la función global si está disponible.
   */
  function _getRate() {
    if (typeof getTasaMN === 'function') {
      try { return getTasaMN(); } catch (e) { /* fallback */ }
    }
    var base = parseFloat(localStorage.getItem('tasaMN') || '0');
    return base > 0 ? base + 10 : 670; // fallback con margen
  }

  /**
   * Obtiene el número de WhatsApp.
   */
  function _getWhatsAppNumber() {
    if (typeof getNumeroWhatsApp === 'function') {
      try { return getNumeroWhatsApp(); } catch (e) { /* fallback */ }
    }
    return localStorage.getItem('whatsappNumero') || '5354320170';
  }

  /**
   * Obtiene el texto de envío.
   */
  function _envioTexto() {
    if (typeof getEnvioTexto === 'function') {
      try { return getEnvioTexto(); } catch (e) { /* fallback */ }
    }
    return (localStorage.getItem('envioTexto') || '').trim() || 'Según zona · costo aparte';
  }

  /**
   * Genera link de WhatsApp formateado.
   */
  function _waLink() {
    var num = _getWhatsAppNumber();
    var link = 'https://wa.me/' + num;
    return num + '\n👉 ' + link;
  }

  /**
   * Obtiene la config de Firebase.
   */
  function _getFirebaseConfig() {
    try {
      var raw = localStorage.getItem('firebaseConfig');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* silencioso */ }
    // Fallback: config.json fue cargado en la página
    return null;
  }

  /**
   * Extrae el término de búsqueda del mensaje.
   * Remueve palabras de intención y se queda con lo importante.
   */
  function _extractSearchQuery(message) {
    var n = norm(message);
    // Remover palabras de intención
    var stopWords = [
      'busco', 'necesito', 'quiero', 'tiene', 'tienen', 'hay', 'venden',
      'mostrar', 'ver', 'mostrame', 'dame', 'buscar', 'encuentra',
      'por favor', 'como', 'cual', 'que', 'un', 'una', 'unos', 'unas',
      'el', 'la', 'los', 'las', 'de', 'del', 'en', 'para', 'con',
      'me', 'puedes', 'ayudar', 'alguien', 'sabe', 'donde', 'estan',
      'cuanto', 'cuesta', 'vale', 'precio', 'stock', 'disponible',
      'disponibles', 'disponibilidad', 'si', 'no', 'o', 'y', 'pero', 'mas', 'menos',
      'comparar', 'compara', 'diferencia', 'versus', 'mejor',
      'comprar', 'compra', 'pedir', 'quisiera', 'muestrame', 'ensename',
      'algun', 'alguna', 'barato', 'barata', 'economico', 'economica'
    ];
    var words = n.split(/\s+/).filter(function (w) {
      return w.length > 1 && stopWords.indexOf(w) === -1;
    });
    var query = words.join(' ').trim();
    return query || message;
  }

  /**
   * Detecta la categoría mencionada en el mensaje.
   */
  function _extractCategoryFromMsg(message) {
    var n = norm(message);
    var catMap = {
      'wifi': 'WIFI', 'router': 'WIFI', 'internet': 'WIFI', 'red': 'WIFI', 'repetidor': 'WIFI',
      'energia': 'ENERGIA', 'inversor': 'ENERGIA', 'bateria': 'ENERGIA', 'solar': 'ENERGIA', 'cargador': 'ENERGIA',
      'celular': 'CELULARES', 'telefono': 'CELULARES', 'iphone': 'CELULARES', 'android': 'CELULARES',
      'util': 'UTILES', 'herramienta': 'UTILES', 'ferreteria': 'UTILES',
      'carro': 'CARROS', 'auto': 'CARROS', 'vehiculo': 'CARROS', 'repuesto': 'CARROS',
      'ropa': 'ROPA', 'vestir': 'ROPA', 'moda': 'ROPA', 'zapato': 'ROPA',
      'seguridad': 'SEGURIDAD', 'camara': 'SEGURIDAD', 'alarma': 'SEGURIDAD',
      'hogar': 'HOGAR', 'casa': 'HOGAR', 'mueble': 'HOGAR', 'cocina': 'HOGAR',
      'juego': 'JUEGOS', 'consola': 'JUEGOS', 'playstation': 'JUEGOS',
      'moto': 'MOTOS', 'motocicleta': 'MOTOS',
      'pc': 'PC Y LAPTOPS', 'laptop': 'PC Y LAPTOPS', 'computadora': 'PC Y LAPTOPS',
      'gym': 'GYM', 'ejercicio': 'GYM', 'fitness': 'GYM', 'deporte': 'GYM'
    };
    // First try exact word match (including stemmed forms)
    for (var key in catMap) {
      if (!catMap.hasOwnProperty(key)) continue;
      if (n.includes(key)) return catMap[key];
    }
    // Then try stemmed words from the message
    var words = n.split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      var stemmed = _stemES(words[i]);
      if (catMap[stemmed]) return catMap[stemmed];
    }
    return null;
  }

  /**
   * Acorta un nombre de producto para UI compacta.
   */
  function _shortName(nombre) {
    if (!nombre) return 'Producto';
    // Quitar emojis y zero-width chars al inicio
    var clean = nombre.replace(/^[⠀-代言]\s*/, '').replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '').trim();
    if (clean.length > 25) {
      clean = clean.substring(0, 22) + '...';
    }
    return clean;
  }

  /**
   * Capitaliza la primera letra.
   */
  function _capitalize(str) {
    return String(str || '').charAt(0).toUpperCase() + String(str || '').slice(1);
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 14: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  var _initialized = false;

  /**
   * Inicializa el agente. Carga datos y FAQs aprendidas.
   */
  function init() {
    if (_initialized) return;
    _initialized = true;

    // Cargar FAQs aprendidas (no bloqueante)
    loadLearnedFAQs();

    // Cargar historial de conversación desde sessionStorage
    try {
      var saved = sessionStorage.getItem('tm_agent_history');
      if (saved) _conversationHistory = JSON.parse(saved);
    } catch (e) { /* silencioso */ }

    // Guardar historial periódicamente
    setInterval(function () {
      try {
        sessionStorage.setItem('tm_agent_history', JSON.stringify(_conversationHistory.slice(-MAX_HISTORY)));
      } catch (e) { /* silencioso */ }
    }, 5000);

    // ── Solo mostrar la burbuja en la vista de inicio ──
    _updateBubbleVisibility();
    // Observar cambios de vista para mostrar/ocultar la burbuja
    setInterval(_updateBubbleVisibility, 800);

    // ── Mensaje de bienvenida automático (solo primera visita) ──
    _showAutoWelcome();

    if (typeof console !== 'undefined' && console.log) {
      console.log('[TmAgent] Inicializado ✅');
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 15: UI RENDERING
  // ═══════════════════════════════════════════════════════════════

  var _panelOpen = false;
  var _welcomed = false;
  var _unreadCount = 0;
  var _isProcessing = false;

  /** Shorthand para document.getElementById */
  function _el(id) { return document.getElementById(id); }

  /** Escapa HTML para prevenir XSS */
  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str || '')));
    return div.innerHTML;
  }

  /** Escapa atributos HTML */
  function _escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Toggle panel open/close */
  function toggle() {
    if (_panelOpen) {
      close();
    } else {
      open();
    }
  }

  /** Open panel, show welcome if first time */
  function open() {
    var panel = _el('tmAgentPanel');
    var bubble = _el('tmAgentBubble');
    if (!panel) return;
    panel.classList.add('open');
    if (bubble) bubble.classList.add('hidden');
    _panelOpen = true;
    _unreadCount = 0;
    _updateBadge(0);

    // Show welcome on first open
    if (!_welcomed) {
      _welcomed = true;
      _renderWelcome();
    }

    _scrollToBottom();

    // Focus input after animation
    var input = _el('tmAgentInput');
    if (input) setTimeout(function () { input.focus(); }, 300);
  }

  /** Close panel */
  function close() {
    var panel = _el('tmAgentPanel');
    if (!panel) return;
    panel.classList.remove('open');
    _panelOpen = false;
    // Delegar a _updateBubbleVisibility para respetar la lógica de homepage-only
    _updateBubbleVisibility();
  }

  /** Get input value, call chat(), render response */
  function send() {
    if (_isProcessing) return;
    var input = _el('tmAgentInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendQuick(text);
  }

  /** Quick reply button clicked — send as user message */
  function sendQuick(text) {
    if (_isProcessing) return;
    text = (text || '').trim();
    if (!text) return;

    _isProcessing = true;

    // Clear quick replies
    var qrContainer = _el('tmQuickReplies');
    if (qrContainer) qrContainer.innerHTML = '';

    // Render user message bubble
    _renderUserMsg(text);

    // Show typing indicator
    _renderTyping();

    // Process with minimum 500ms delay for natural feel
    var startTime = Date.now();
    var response;
    try {
      response = chat(text);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[TmAgent] Error procesando mensaje:', e);
      }
      response = {
        text: 'Lo siento, hubo un error procesando tu mensaje. Intenta de nuevo. 🙏',
        quickReplies: ['Buscar producto', '💬 WhatsApp']
      };
    }

    var elapsed = Date.now() - startTime;
    var remainingDelay = Math.max(0, 500 - elapsed);

    setTimeout(function () {
      _removeTyping();
      _renderBotMsg(response);
      _isProcessing = false;

      // Update badge if panel is closed
      if (!_panelOpen) {
        _unreadCount++;
        _updateBadge(_unreadCount);
      }
    }, remainingDelay);
  }

  /** Mostrar la burbuja solo si estamos en la vista de inicio */
  function _updateBubbleVisibility() {
    var bubble = _el('tmAgentBubble');
    if (!bubble) return;
    var vistaInicio = document.getElementById('vistaInicio');
    var isHome = vistaInicio && vistaInicio.style.display !== 'none';
    // Con un modal/drawer abierto (detalle de producto, carrito, menú móvil)
    // la burbuja (z-index 9999, fija abajo-derecha) tapa el botón
    // "Pedir"/"Avísame" sticky de esos paneles, o los links del menú móvil
    // (que comparte el mismo z-index:9999 — la burbuja gana por ir después
    // en el DOM). Se oculta mientras estén abiertos.
    var hayOverlayAbierto =
      (typeof tmOverlayAbierto === 'function') && (
        tmOverlayAbierto('productDetailModal') ||
        tmOverlayAbierto('carritoDrawer') ||
        tmOverlayAbierto('mobileMenuOverlay', 'open')
      );
    // Si el panel está abierto, no ocultar la burbuja (se oculta por open())
    if (_panelOpen) return;
    if (isHome && !hayOverlayAbierto) {
      bubble.style.display = '';
      bubble.classList.remove('hidden');
    } else {
      bubble.style.display = 'none';
    }
  }

  /** Mensaje de bienvenida automático al entrar a la página (solo la primera vez) */
  function _showAutoWelcome() {
    try {
      if (sessionStorage.getItem('tm_auto_welcomed')) return;
    } catch (e) { return; }
    // Mostrar después de un breve delay para no interrumpir la carga.
    // OJO: la bandera "ya se mostró" se marca DENTRO del setTimeout, justo
    // antes de mostrar la tarjeta — no antes de programarlo. El service
    // worker recarga la página ~1s después de activar una versión nueva
    // (ver sw.js / SW_UPDATED), lo que mataba este setTimeout a mitad de
    // camino; si la bandera ya se hubiera marcado al programar el timer
    // (como antes), la recarga dejaba la bienvenida marcada como "vista"
    // sin haberse mostrado nunca.
    setTimeout(function () {
      var card = _el('tmWelcomeCard');
      var bubble = _el('tmAgentBubble');
      if (!card || !bubble) return;
      // Asegurar que estamos en inicio
      var vistaInicio = document.getElementById('vistaInicio');
      if (!vistaInicio || vistaInicio.style.display === 'none') return;
      try { sessionStorage.setItem('tm_auto_welcomed', '1'); } catch (e) {}
      // Mostrar badge con "1"
      _unreadCount = 1;
      _updateBadge(1);
      card.classList.add('show');
      var hideTimer = setTimeout(function () { card.classList.remove('show'); }, 9000);
      var closeBtn = _el('tmWelcomeClose');
      if (closeBtn) closeBtn.onclick = function (e) {
        e.stopPropagation();
        clearTimeout(hideTimer);
        card.classList.remove('show');
      };
      card.onclick = function () {
        clearTimeout(hideTimer);
        card.classList.remove('show');
        open();
      };
    }, 2500);
  }

  /** Show welcome message with quick replies */
  function _renderWelcome() {
    var welcomeText = '¡Hola! 👋 Soy el asistente de TiendaMax. Puedo ayudarte a encontrar productos, comparar opciones o calcular qué necesitas. ¿En qué te ayudo?';
    var response = {
      text: welcomeText,
      quickReplies: ['🔍 Buscar producto', '📊 Comparar', '⚡ Calcular consumo', '💰 Ver ofertas']
    };
    _renderBotMsg(response);
  }

  /** Render agent response (text, products, comparison, calculator, quickReplies) */
  function _renderBotMsg(response) {
    var container = _el('tmAgentMessages');
    if (!container) return;

    // ── Render text ──
    if (response.text) {
      var msgDiv = document.createElement('div');
      msgDiv.className = 'tm-msg bot';
      // Escapar primero (anti-XSS) y linkificar después: los links que el
      // propio bot emite (wa.me) eran texto plano imposible de tocar.
      var safeHtml = _escapeHtml(response.text)
        .replace(/(https:\/\/[^\s<&]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#25D366;text-decoration:underline;word-break:break-all">$1</a>')
        .replace(/\n/g, '<br>');
      msgDiv.innerHTML = safeHtml;
      container.appendChild(msgDiv);
    }

    // ── Render product cards ──
    if (response.products && response.products.length > 0) {
      response.products.forEach(function (p) {
        container.appendChild(_renderProductCard(p));
      });
    }

    // ── Render comparison table ──
    if (response.comparison) {
      container.appendChild(_renderComparison(response.comparison));
    }

    // ── Render calculator result ──
    if (response.calculator) {
      container.appendChild(_renderCalculator(response.calculator));
    }

    // ── Render WhatsApp button if whatsappProduct is set ──
    if (response.whatsappProduct) {
      var p = typeof response.whatsappProduct === 'object'
        ? response.whatsappProduct
        : getProductById(response.whatsappProduct);
      if (p) {
        var waWrap = document.createElement('div');
        waWrap.style.cssText = 'align-self:flex-start;margin-top:4px;';
        var waLink = handoffToWhatsApp(p);
        waWrap.innerHTML = '<a href="' + _escapeAttr(waLink) + '" target="_blank" rel="noopener" class="tm-wa-btn">' +
          '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.685-1.228A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.4 0-4.637-.762-6.465-2.057l-.377-.282-3.392.889.924-3.272-.31-.394A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>' +
          ' Comprar por WhatsApp</a>';
        container.appendChild(waWrap);
      }
    }

    // ── Render quick replies ──
    if (response.quickReplies && response.quickReplies.length > 0) {
      _renderQuickReplies(response.quickReplies);
    }

    // ── Acciones sobre la tienda (ej. abrir el carrito real) ──
    if (response.action === 'openCart') {
      setTimeout(function () {
        close();
        if (typeof window.abrirCarrito === 'function') {
          try { window.abrirCarrito(); } catch (e) { /* silencioso */ }
        }
      }, 600);
    }

    _scrollToBottom();
  }

  /** Render user message bubble */
  function _renderUserMsg(text) {
    var container = _el('tmAgentMessages');
    if (!container) return;
    var msgDiv = document.createElement('div');
    msgDiv.className = 'tm-msg user';
    msgDiv.innerHTML = _escapeHtml(text).replace(/\n/g, '<br>');
    container.appendChild(msgDiv);
    _scrollToBottom();
  }

  /** Render mini product card in chat */
  function _renderProductCard(p) {
    var card = document.createElement('div');
    card.className = 'tm-msg-product';

    // Thumbnail
    var imgSrc = '';
    if (p.imagenes && p.imagenes.length > 0) {
      imgSrc = p.imagenes[0];
    } else if (p.imagen) {
      imgSrc = p.imagen;
    }
    if (!imgSrc) {
      imgSrc = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">' +
        '<rect fill="%231a1a2e" width="56" height="56" rx="8"/>' +
        '<text x="50%" y="54%" text-anchor="middle" fill="%23666" font-size="18">📦</text></svg>'
      );
    }

    // Price with currency (sufijo MN solo si el precio principal está en USD)
    var price = _fmtPrice(p.precioActual);
    var mnPlain = _mnSuffix(p.precioActual);
    var priceMN = mnPlain
      ? ' <small style="color:rgba(255,255,255,0.5);font-weight:400;font-size:11px">' +
        _escapeHtml(mnPlain.replace(/^ \| /, '| ')) + '</small>'
      : '';

    // Stock status (green/yellow/red dot)
    var stockClass, stockText;
    if (p.stock <= 0) {
      stockClass = 'out-of-stock';
      stockText = '● Agotado';
    } else if (p.stock <= 3) {
      stockClass = 'low-stock';
      stockText = '● Solo ' + p.stock + ' disponibles';
    } else {
      stockClass = 'in-stock';
      stockText = '● ' + p.stock + ' disponibles';
    }

    // Truncate name if long
    var name = p.nombre || 'Producto';
    if (name.length > 40) name = name.substring(0, 37) + '...';

    // WhatsApp link for this product
    var waLink = handoffToWhatsApp(p);

    // Botón central: "Agregar" si hay stock; "🔔 Avísame" si está agotado
    // (abre el detalle, donde vive la suscripción de aviso de stock real).
    var addBtn = '';
    if (p.stock > 0 && typeof window.agregarAlCarrito === 'function') {
      addBtn = '<button onclick="TmAgent._addToCart(' + p.id + ')" style="flex:1;padding:5px 8px;border-radius:8px;border:none;background:rgba(255,107,53,0.9);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">🛒 Agregar</button>';
    } else if (p.stock <= 0) {
      addBtn = '<button onclick="TmAgent._viewProduct(' + p.id + ')" style="flex:1;padding:5px 8px;border-radius:8px;border:none;background:linear-gradient(135deg,#f5a623,#e8701e);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">🔔 Avísame</button>';
    }

    card.innerHTML =
      '<img src="' + _escapeAttr(imgSrc) + '" alt="' + _escapeAttr(name) + '" loading="lazy">' +
      '<div class="product-info">' +
        '<div class="product-name">' + _escapeHtml(name) + '</div>' +
        '<div class="product-price">' + _escapeHtml(price) + priceMN + '</div>' +
        '<div class="product-stock ' + stockClass + '">' + stockText + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
          '<button onclick="TmAgent._viewProduct(' + p.id + ')" style="flex:1;padding:5px 8px;border-radius:8px;border:1px solid rgba(255,107,53,0.3);background:rgba(255,107,53,0.08);color:#FF6B35;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Ver detalle</button>' +
          addBtn +
          '<a href="' + _escapeAttr(waLink) + '" target="_blank" rel="noopener" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:5px 8px;border-radius:8px;border:none;background:#25D366;color:#fff;font-size:11px;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit;box-shadow:0 2px 8px rgba(37,211,102,0.25)">WhatsApp</a>' +
        '</div>' +
      '</div>';

    return card;
  }

  /** Agregar al carrito desde una tarjeta del chat, sin salir de la conversación */
  function _addToCart(id) {
    if (typeof window.agregarAlCarrito !== 'function') return;
    try { window.agregarAlCarrito(id); } catch (e) { return; }
    var p = getProductById(id);
    _renderBotMsg({
      text: '✅ ' + (p ? _shortName(p.nombre) : 'Producto') + ' agregado al carrito.\n¿Seguimos?',
      quickReplies: ['🛒 Ver carrito', 'Seguir comprando', '💬 WhatsApp']
    });
  }

  /** Render comparison table in chat */
  function _renderComparison(data) {
    var wrap = document.createElement('div');
    wrap.className = 'tm-msg-comparison';

    var prods = data.products || [];
    var parsed = data.parsed || [];

    if (prods.length < 2) {
      wrap.innerHTML = '<div style="color:#f2f2f5;font-size:13px">No hay suficientes datos para comparar.</div>';
      return wrap;
    }

    // Build HTML table
    var html = '<table><thead><tr><th></th>';
    prods.forEach(function (p) {
      html += '<th>' + _escapeHtml(_shortName(p.nombre)) + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Price row
    html += '<tr';
    if (data.bestPriceIdx >= 0) html += ' class="winner"';
    html += '><td>💵 Precio</td>';
    prods.forEach(function (p, i) {
      html += '<td>' + _escapeHtml(_fmtPrice(p.precioActual)) +
        (i === data.bestPriceIdx ? ' ★' : '') + '</td>';
    });
    html += '</tr>';

    // Stock row
    html += '<tr><td>📦 Stock</td>';
    prods.forEach(function (p) {
      html += '<td>' + (p.stock > 0 ? p.stock + ' uds' : 'Agotado') + '</td>';
    });
    html += '</tr>';

    // Dynamic spec rows
    var specFields = [
      { key: 'watts', label: '⚡ Potencia', unit: 'W' },
      { key: 'volts', label: '🔌 Voltaje', unit: 'V' },
      { key: 'ampHours', label: '🔋 Capacidad', unit: 'Ah' },
      { key: 'amps', label: '⚡ Corriente', unit: 'A' },
      { key: 'speedMbps', label: '🚀 Velocidad', unit: 'Mbps' },
      { key: 'wifiVersion', label: '📡 WiFi', unit: '' },
      { key: 'gigabit', label: '🔌 Gigabit', bool: true },
      { key: 'mppt', label: '☀️ MPPT', bool: true },
      { key: 'solar', label: '☀️ Solar', bool: true },
      { key: 'ports', label: '🔌 Puertos', unit: '' },
      { key: 'antennas', label: '📡 Antenas', unit: '' }
    ];

    specFields.forEach(function (field) {
      var values = parsed.map(function (x) { return x.spec ? x.spec[field.key] : undefined; });
      var anyValue = values.some(function (v) { return v !== undefined && v !== null; });
      if (!anyValue) return;

      html += '<tr><td>' + field.label + '</td>';
      values.forEach(function (v) {
        if (v === undefined || v === null) {
          html += '<td>—</td>';
        } else if (field.bool) {
          html += '<td>' + (v ? 'Sí' : 'No') + '</td>';
        } else if (Array.isArray(v)) {
          html += '<td>' + _escapeHtml(v.join('/') + (field.unit || '')) + '</td>';
        } else {
          html += '<td>' + _escapeHtml(String(v) + (field.unit || '')) + '</td>';
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';

    // Recommendation badges
    if (data.bestPerfIdx >= 0 && prods[data.bestPerfIdx]) {
      html += '<div style="margin-top:8px;font-size:12px;color:#25D366">🏆 Mejor rendimiento: ' +
        _escapeHtml(_shortName(prods[data.bestPerfIdx].nombre)) + '</div>';
    }
    if (data.bestPriceIdx >= 0 && prods[data.bestPriceIdx]) {
      html += '<div style="margin-top:4px;font-size:12px;color:#FF6B35">💵 Mejor precio: ' +
        _escapeHtml(_shortName(prods[data.bestPriceIdx].nombre)) + '</div>';
    }

    wrap.innerHTML = html;
    return wrap;
  }

  /** Render calculator result in chat */
  function _renderCalculator(data) {
    var wrap = document.createElement('div');
    wrap.className = 'tm-msg-calc';

    // Awaiting devices step
    if (data.step === 'awaiting_devices') {
      wrap.innerHTML =
        '<div class="calc-title">⚡ Calculadora de consumo</div>' +
        '<div style="font-size:12.5px;color:rgba(255,255,255,0.7)">' +
          'Selecciona tus dispositivos o descríbelos en el chat.</div>';
      return wrap;
    }

    // Full calculator result
    var html = '<div class="calc-title">⚡ Tu consumo estimado</div>';
    html += '<div class="device-list">';

    if (data.devices) {
      for (var dev in data.devices) {
        if (!data.devices.hasOwnProperty(dev)) continue;
        var qty = data.devices[dev];
        var wattPerUnit = DISPOSITIVOS_COMUNES[dev] || 50;
        html += '<div class="device-item"><span>' +
          _escapeHtml(_capitalize(dev)) + (qty > 1 ? ' (×' + qty + ')' : '') +
          '</span><span>' + (qty * wattPerUnit) + 'W</span></div>';
      }
    }

    html += '</div>';
    html += '<div class="total"><span>Total (con margen ×1.3):</span><span>' +
      (data.safetyWatts || 0) + 'W</span></div>';

    // Pack completo section
    if (data.packProducts && data.packProducts.length >= 2) {
      html += '<div style="margin-top:10px;padding:10px 12px;background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.3);border-radius:10px">';
      html += '<div style="font-size:13px;font-weight:700;color:#25D366;margin-bottom:6px">🔋 Pack completo para tus necesidades</div>';

      var packIds = data.packProducts;
      var ps = _getProducts();
      var packTotalPrice = 0;
      packIds.forEach(function (pid) {
        var p = ps.find(function (x) { return x.id === pid; });
        if (p) {
          var spec = parseSpec(p.specs);
          var desc = '';
          if (spec.productType === 'inversor' || /inversor/i.test(p.nombre || '')) {
            desc = (spec.watts || '') + 'W → cubre tus ' + (data.safetyWatts || 0) + 'W';
          } else if (spec.productType === 'bateria' || /bater/i.test(p.nombre || '')) {
            desc = (spec.ampHours || '') + 'Ah ' + (spec.volts && !Array.isArray(spec.volts) ? spec.volts : 12) + 'V → respaldo';
          } else if (/solar|panel/i.test(p.nombre || '')) {
            desc = (spec.watts || '') + 'W panel solar';
          } else {
            desc = _shortName(p.nombre);
          }
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px;color:rgba(255,255,255,0.85)">';
          html += '<span>• ' + _escapeHtml(desc) + '</span>';
          html += '<span style="font-weight:600;color:#FF6B35">' + _escapeHtml(_fmtPrice(p.precioActual)) + '</span>';
          html += '</div>';
          packTotalPrice += p.precioActual || 0;
        }
      });

      html += '<div style="border-top:1px solid rgba(255,255,255,0.15);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:13px;font-weight:700">';
      html += '<span style="color:rgba(255,255,255,0.9)">💰 Total del pack</span>';
      html += '<span style="color:#FF6B35">' + _escapeHtml(_fmtPrice(packTotalPrice)) + '</span>';
      html += '</div>';

      // WhatsApp button for pack
      var waNum = _getWhatsAppNumber();
      var packMsg = 'Hola, me interesa el pack completo para ' + (data.safetyWatts || 0) + 'W: ';
      packIds.forEach(function (pid, idx) {
        var p = ps.find(function (x) { return x.id === pid; });
        if (p) {
          packMsg += (idx > 0 ? ', ' : '') + p.nombre;
        }
      });
      var packWaLink = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(packMsg);
      html += '<a href="' + _escapeAttr(packWaLink) + '" target="_blank" rel="noopener" style="display:block;margin-top:8px;text-align:center;padding:8px 12px;border-radius:8px;background:#25D366;color:#fff;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 2px 8px rgba(37,211,102,0.25)">💬 Comprar pack por WhatsApp</a>';

      html += '</div>';
    } else if (data.recommendedInverters && data.recommendedInverters.length > 0) {
      html += '<div class="recommendation">📦 Te recomiendo un inversor de al menos ' +
        data.safetyWatts + 'W</div>';
    }

    wrap.innerHTML = html;
    return wrap;
  }

  /** Render quick reply buttons */
  function _renderQuickReplies(replies) {
    var container = _el('tmQuickReplies');
    if (!container) return;
    container.innerHTML = '';

    replies.forEach(function (text) {
      var btn = document.createElement('button');
      btn.className = 'tm-quick-reply';
      btn.textContent = text;
      btn.onclick = function () {
        TmAgent.sendQuick(text);
      };
      container.appendChild(btn);
    });
  }

  /** Show typing indicator (3 bouncing dots) */
  function _renderTyping() {
    var container = _el('tmAgentMessages');
    if (!container) return;
    // Remove any existing typing indicator
    _removeTyping();
    var typing = document.createElement('div');
    typing.className = 'tm-typing';
    typing.id = 'tmTypingIndicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typing);
    _scrollToBottom();
  }

  /** Remove typing indicator */
  function _removeTyping() {
    var el = _el('tmTypingIndicator');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /** Auto-scroll messages to bottom */
  function _scrollToBottom() {
    var container = _el('tmAgentMessages');
    if (container) {
      requestAnimationFrame(function () {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  /** Update unread badge on bubble */
  function _updateBadge(n) {
    var badge = _el('tmAgentBadge');
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /** Open product detail modal (called from product card "Ver detalle" button) */
  function _viewProduct(id) {
    // La función real del bundle es abrirDetalleProducto — "abrirModalProducto"
    // no existe en ningún lado y el botón "Ver detalle" nunca abría el modal.
    if (typeof abrirDetalleProducto === 'function') {
      try { close(); abrirDetalleProducto(id); return; } catch (e) { /* fallback */ }
    }
    if (typeof abrirModalProducto === 'function') {
      try { abrirModalProducto(id); return; } catch (e) { /* fallback */ }
    }
    // Fallback: try to scroll to product card in grid
    var card = document.querySelector('[data-product-id="' + id + '"]');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }


  // ═══════════════════════════════════════════════════════════════
  //  SECCIÓN 16: PUBLIC API — window.TmAgent
  // ═══════════════════════════════════════════════════════════════

  window.TmAgent = {
    /**
     * Inicializa el agente.
     */
    init: init,

    /**
     * Punto de entrada principal: mensaje del usuario → respuesta.
     * @param {string} message - Mensaje del usuario
     * @returns {Object} { text, products?, comparison?, calculator?, quickReplies, whatsappProduct? }
     */
    chat: chat,

    /**
     * Compara productos por IDs o instancias.
     * @param {Array} ids - Array de IDs o productos
     * @returns {Object} { text, products?, comparison?, quickReplies }
     */
    compare: compareProducts,

    /**
     * Calcula consumo eléctrico basado en dispositivos.
     * @param {Object|undefined} needs - Si no se pasa, inicia flujo conversacional
     * @returns {Object} { text, products?, calculator?, quickReplies }
     */
    calculate: function (needs) {
      if (needs && typeof needs === 'object' && needs.devices) {
        _calcState = null; // resetear
        return handleCalculate(needs.devices);
      }
      return handleCalculate('');
    },

    /**
     * Obtiene las FAQs aprendidas.
     * @returns {Object} FAQs
     */
    getFAQ: getFAQ,

    /**
     * Recomienda productos.
     * @param {Object} context - { category?, budget?, need? }
     * @returns {Object} { text, products?, quickReplies }
     */
    recommend: recommendProducts,

    /**
     * Busca productos.
     * @param {string} query - Término de búsqueda
     * @param {Object} options - { maxResults?, onlyInStock? }
     * @returns {Array} Productos encontrados
     */
    search: searchProducts,

    /**
     * Genera enlace de WhatsApp para un producto.
     * @param {Object|number|string} product - Producto o ID
     * @returns {string} URL de WhatsApp
     */
    whatsapp: handoffToWhatsApp,

    /**
     * Parsea specs de un producto.
     * @param {Array} specs - Array de strings de specs
     * @returns {Object} Datos estructurados
     */
    parseSpec: parseSpec,

    /**
     * Detecta la intención de un mensaje.
     * @param {string} message - Mensaje del usuario
     * @returns {string} Intención detectada
     */
    detectIntent: detectIntent,

    /**
     * Devuelve el historial de conversación.
     * @returns {Array} Historial
     */
    getHistory: function () { return _conversationHistory.slice(); },

    /**
     * Limpia el historial y estado de la conversación.
     */
    reset: function () {
      _conversationHistory = [];
      _calcState = null;
      _lastCalc = null;
      _lastPackLink = null;
      _lastResults = [];
      _lastShownCount = 0;
      _lastQuery = '';
      _lastDetailProduct = null;
      _iaCachedResults = null;
      try { sessionStorage.removeItem('tm_agent_history'); } catch (e) { /* */ }
    },

    // ── UI Methods ──

    /**
     * Toggle panel open/close.
     */
    toggle: toggle,

    /**
     * Open panel, show welcome if first time.
     */
    open: open,

    /**
     * Close panel.
     */
    close: close,

    /**
     * Get input value, call chat(), render response.
     */
    send: send,

    /**
     * Quick reply button clicked — send as user message.
     * @param {string} text - The quick reply text to send
     */
    sendQuick: sendQuick,

    /**
     * Open product detail modal (internal, called from product card button).
     * @param {number|string} id - Product ID
     */
    _viewProduct: _viewProduct,

    /**
     * Add product to the store cart from a chat card (internal).
     * @param {number|string} id - Product ID
     */
    _addToCart: _addToCart
  };

})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { TmAgent.init(); });
} else {
  TmAgent.init();
}
