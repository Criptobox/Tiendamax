/* 🤖 Max — el panel de lo que preguntan los clientes y cómo les fue.
 *
 * Solo en el panel (admin.html), cargado después de admin-copilot.js. Junta
 * en un sitio lo que antes estaba disperso o no existía:
 *
 *   · /agente/faq            cada pregunta, cuántas veces, qué contestó Max y si
 *                            no la entendió (intent 'desconocido'). Pública:
 *                            alimenta faq.html.
 *   · /agente/opiniones      el «¿Te sirvió? 👍/👎» de cada respuesta, con el
 *                            motivo del 👎. Solo la lee el dueño (va firmada
 *                            con TMAuth.fetchPrivado).
 *   · /analytics/busquedas   lo que escriben en el buscador de la tienda.
 *   · max-aprendido.json     lo que el gestor le enseña a Max: «esta frase es
 *                            este producto», lo que es demanda y lo ya resuelto.
 *
 * Max no aprende solo: no hay IA en la tienda. Aprende lo que alguien decide
 * aquí. Por eso la pantalla separa lo que se arregla con un toque (enseñar un
 * producto) de lo que es demanda (no es un fallo de Max: es algo que no
 * vendes) y de lo que hay que corregir en el código (se anota).
 *
 * max-aprendido.json se guarda como comparar-marcas.json: en este teléfono al
 * tocar, en la tienda 4 s después tras releer el fichero, fusionado por
 * entrada con el `ts` más nuevo, y deshacer deja lápida (si no, el otro
 * teléfono lo vuelve a subir). tests/max_panel_check.mjs.
 */
(function () {
  'use strict';
  var ARCHIVO = 'max-aprendido.json', LS = 'tm_max_aprendido', LAPIDA_DIAS = 90;
  var APR = { ensenado: {}, demanda: {}, resueltas: {} };
  var ESTADO = 'local', _timer = null, _enCurso = false;
  var DATOS = { faq: null, ops: null, bus: null, errFaq: '', errOps: '', listo: false };
  var PERIODO = 7;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function prods() { try { return Array.isArray(window.PRODUCTOS) ? window.PRODUCTOS : []; } catch (e) { return []; } }
  function hace(ts) {
    var d = Math.floor((Date.now() - (Number(ts) || 0)) / 86400000);
    return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }

  /* ── max-aprendido.json ─────────────────────────────────────────────── */
  function leerLocal() {
    try { var o = JSON.parse(localStorage.getItem(LS) || 'null'); if (o && typeof o === 'object') APR = normalizar(o); } catch (e) {}
  }
  function normalizar(o) {
    return { ensenado: (o && o.ensenado) || {}, demanda: (o && o.demanda) || {}, resueltas: (o && o.resueltas) || {} };
  }
  function fusionarMapa(a, b) {
    var out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(function (k) {
      var m = b[k]; if (!m || typeof m !== 'object') return;
      if (!out[k] || (Number(m.ts) || 0) > (Number(out[k].ts) || 0)) out[k] = m;
    });
    return out;
  }
  function fusionar(a, b) {
    return { ensenado: fusionarMapa(a.ensenado, b.ensenado), demanda: fusionarMapa(a.demanda, b.demanda), resueltas: fusionarMapa(a.resueltas, b.resueltas) };
  }
  function podar(o) {
    var corte = Date.now() - LAPIDA_DIAS * 86400000, out = { ensenado: {}, demanda: {}, resueltas: {} };
    ['ensenado', 'demanda', 'resueltas'].forEach(function (m) {
      Object.keys(o[m] || {}).forEach(function (k) {
        var x = o[m][k]; if (!x) return;
        if (x.borrado && (Number(x.ts) || 0) < corte) return;
        out[m][k] = x;
      });
    });
    return out;
  }
  function igual(a, b) { return JSON.stringify(podar(a)) === JSON.stringify(podar(b)); }
  async function bajar() {
    try {
      var r = await fetch(ARCHIVO + '?_=' + Date.now(), { cache: 'no-store' });
      if (r.status === 404) return { ensenado: {}, demanda: {}, resueltas: {} };
      if (!r.ok) return null;
      return normalizar(await r.json());
    } catch (e) { return null; }
  }
  function guardar() {
    try { localStorage.setItem(LS, JSON.stringify(APR)); } catch (e) {}
    ESTADO = 'pendiente'; pintarEstado();
    clearTimeout(_timer);
    _timer = setTimeout(publicar, 4000);
  }
  async function publicar() {
    var user = localStorage.getItem('githubUser'), repo = localStorage.getItem('githubRepo'), token = localStorage.getItem('githubToken');
    if (!user || !repo || !token || typeof window.subirArchivoAGitHub !== 'function') { ESTADO = 'sin-token'; pintarEstado(); return false; }
    if (_enCurso) return false;
    _enCurso = true; ESTADO = 'guardando'; pintarEstado();
    try {
      // Releer justo antes: el otro teléfono pudo enseñarle algo entretanto.
      var remoto = await bajar();
      if (remoto === null) throw new Error('no pude leer ' + ARCHIVO);
      APR = podar(fusionar(remoto, APR));
      try { localStorage.setItem(LS, JSON.stringify(APR)); } catch (e) {}
      await window.subirArchivoAGitHub(user, repo, token, ARCHIVO, Object.assign({ actualizado: new Date().toISOString() }, APR));
      ESTADO = 'guardado'; pintarEstado();
      return true;
    } catch (e) {
      ESTADO = 'error'; pintarEstado();
      return false;
    } finally { _enCurso = false; }
  }
  async function sincronizar() {
    var remoto = await bajar();
    if (remoto === null) return;
    var junto = podar(fusionar(remoto, APR));
    var faltaArriba = !igual(junto, remoto);
    APR = junto;
    try { localStorage.setItem(LS, JSON.stringify(APR)); } catch (e) {}
    // Lo de este teléfono que la tienda no tiene se sube solo.
    if (faltaArriba) guardar(); else { ESTADO = 'guardado'; pintarEstado(); }
  }
  function pintarEstado() {
    var el = $('max-estado'); if (!el) return;
    el.textContent = {
      local: '', pendiente: '⏳ Guardando en la tienda en unos segundos…', guardando: '⏳ Guardando en la tienda…',
      guardado: '✅ Guardado en la tienda: Max ya lo usa.', error: '⚠️ No pude guardar en la tienda. Se queda en este teléfono y lo reintento.',
      'sin-token': '⚠️ Sin token de GitHub: lo enseñado solo vale en este teléfono. Ponlo en ⚙️ Configuración.'
    }[ESTADO] || '';
  }

  /* ── Datos ──────────────────────────────────────────────────────────── */
  function base() { try { return (typeof window._fbRtdbUrl === 'function') ? window._fbRtdbUrl() : null; } catch (e) { return null; } }
  async function leerPublico(ruta) {
    var b = base(); if (!b) throw new Error('sin configuración de Firebase');
    var r = await fetch(b + ruta + '?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }
  async function cargar() {
    DATOS.listo = false; pintar();
    var tareas = [
      leerPublico('/agente/faq.json').then(function (d) { DATOS.faq = d || {}; DATOS.errFaq = ''; }).catch(function (e) { DATOS.faq = null; DATOS.errFaq = e.message; }),
      leerPublico('/analytics/busquedas.json').then(function (d) { DATOS.bus = d || {}; }).catch(function () { DATOS.bus = null; }),
      (typeof window.TMAuth !== 'undefined' && window.TMAuth.fetchPrivado
        ? window.TMAuth.fetchPrivado('/agente/opiniones.json').then(function (r) {
            if (r && r.ok) { DATOS.ops = r.dato || {}; DATOS.errOps = ''; }
            else { DATOS.ops = null; DATOS.errOps = (r && r.msg) || 'no se pudo leer'; }
          })
        : Promise.resolve().then(function () { DATOS.ops = null; DATOS.errOps = 'no has entrado con tu cuenta'; })),
      sincronizar()
    ];
    await Promise.all(tareas);
    DATOS.listo = true; pintar();
  }

  /* Cada pregunta con sus votos del periodo. */
  function analizar() {
    var desde = PERIODO ? Date.now() - PERIODO * 86400000 : 0;
    var faq = DATOS.faq || {}, ops = DATOS.ops || {};
    var filas = Object.keys(faq).filter(function (k) { return k !== '__prueba_del_panel' && faq[k] && faq[k].query; }).map(function (k) {
      var x = faq[k], votos = ops[k] || {}, up = 0, down = 0, motivos = {}, ultNo = 0;
      Object.keys(votos).forEach(function (id) {
        var v = votos[id]; if (!v || (Number(v.ts) || 0) < desde) return;
        if (v.v === 1) up++;
        else if (v.v === -1) { down++; if (v.m) motivos[v.m] = (motivos[v.m] || 0) + 1; ultNo = Math.max(ultNo, Number(v.ts) || 0); }
      });
      return { k: k, q: String(x.query), n: Number(x.count) || 1, intent: String(x.intent || ''), resp: String(x.lastResponse || ''),
               ts: Number(x.lastUpdated) || 0, sin: String(x.intent || '') === 'desconocido', up: up, down: down, motivos: motivos, ultNo: ultNo };
    });
    var enPeriodo = filas.filter(function (f) { return f.ts >= desde || f.up || f.down; });
    var up = 0, down = 0; enPeriodo.forEach(function (f) { up += f.up; down += f.down; });
    function resuelta(f) {
      var r = APR.resueltas[f.k]; if (!r || r.borrado) return false;
      // Si después de resolverla vuelve a fallar, vuelve a la lista.
      return (Number(r.ts) || 0) >= Math.max(f.sin ? f.ts : 0, f.ultNo);
    }
    var arreglar = enPeriodo.filter(function (f) { return (f.sin || f.down > 0) && !resuelta(f); })
      .sort(function (a, b) { return (b.down * 2 + (b.sin ? b.n : 0)) - (a.down * 2 + (a.sin ? a.n : 0)) || b.ts - a.ts; });
    var contestadas = enPeriodo.filter(function (f) { return !f.sin; }).sort(function (a, b) { return b.n - a.n; });
    return {
      filas: enPeriodo, arreglar: arreglar, contestadas: contestadas,
      kpi: { preguntas: enPeriodo.length, sin: enPeriodo.filter(function (f) { return f.sin; }).length, up: up, down: down,
             pct: (up + down) ? Math.round(up / (up + down) * 100) : null },
      semanas: semanas()
    };
  }
  /* % de «me sirvió» de las últimas 6 semanas (solo con votos de verdad). */
  function semanas() {
    var ops = DATOS.ops || {}, out = [];
    for (var i = 5; i >= 0; i--) {
      var hasta = Date.now() - i * 7 * 86400000, desde = hasta - 7 * 86400000, up = 0, tot = 0;
      Object.keys(ops).forEach(function (k) { Object.keys(ops[k] || {}).forEach(function (id) {
        var v = ops[k][id]; var t = Number(v && v.ts) || 0;
        if (t >= desde && t < hasta) { tot++; if (v.v === 1) up++; }
      }); });
      out.push(tot ? Math.round(up / tot * 100) : null);
    }
    return out;
  }
  /* Lo que buscan y no tienes: búsquedas sin producto que las responda, más
     lo que el gestor marcó como demanda. Mismo criterio que el Copiloto. */
  function demanda() {
    var ps = prods(), out = [];
    var tiene = function (q) {
      var t = norm(q).split(' ').filter(function (w) { return w.length > 3; });
      if (!t.length) return true;
      return ps.some(function (p) { var n = norm(p.nombre) + ' ' + norm(p.categoria) + ' ' + norm(p.subcategoria); return t.every(function (w) { return n.indexOf(w) !== -1; }); });
    };
    var agotado = function (q) {
      var t = norm(q).split(' ').filter(function (w) { return w.length > 3; });
      if (!t.length) return false;
      var m = ps.filter(function (p) { var n = norm(p.nombre) + ' ' + norm(p.subcategoria); return t.every(function (w) { return n.indexOf(w) !== -1; }); });
      return m.length > 0 && m.every(function (p) { return !(Number(p.stock) > 0); });
    };
    Object.keys(APR.demanda).forEach(function (f) { var d = APR.demanda[f]; if (d && !d.borrado) out.push({ q: f, n: Number(d.n) || 1, anotada: true, agotado: agotado(f) }); });
    var bus = DATOS.bus || {};
    Object.keys(bus).forEach(function (k) {
      var q; try { q = decodeURIComponent(k); } catch (e) { q = k; }
      var n = Number(bus[k] && bus[k].count != null ? bus[k].count : bus[k]) || 0;
      if (n < 2 || out.some(function (o) { return norm(o.q) === norm(q); })) return;
      if (agotado(q)) out.push({ q: q, n: n, agotado: true });
      else if (!tiene(q)) out.push({ q: q, n: n });
    });
    return out.sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
  }

  /* ── Acciones ───────────────────────────────────────────────────────── */
  function marcarResuelta(k) { APR.resueltas[k] = { ts: Date.now() }; guardar(); pintar(); }
  function ensenar(frase, id, clave) {
    var f = norm(frase); if (!f || f.length < 3) { aviso('Escribe la frase que usan los clientes (al menos 3 letras).'); return; }
    var p = prods().find(function (x) { return String(x.id) === String(id); }); if (!p) return;
    APR.ensenado[f] = { id: p.id, nombre: p.nombre, ts: Date.now() };
    if (clave) APR.resueltas[clave] = { ts: Date.now() };
    guardar(); pintar();
    aviso('✅ Enseñado: «' + f + '» → ' + p.nombre);
  }
  function desEnsenar(f) { APR.ensenado[f] = { borrado: true, ts: Date.now() }; guardar(); pintar(); }
  function anotarDemanda(q, n, clave) {
    var f = norm(q); if (!f) return;
    APR.demanda[f] = { n: n || 1, ts: Date.now() };
    if (clave) APR.resueltas[clave] = { ts: Date.now() };
    guardar(); pintar();
  }
  function quitarDemanda(f) { APR.demanda[f] = { borrado: true, ts: Date.now() }; guardar(); pintar(); }
  function aviso(t) { try { if (typeof window.showToast === 'function') window.showToast(t); else if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion(t); } catch (e) {} }

  /* El buscador de «Enseñar»: candidatos por palabras del nombre. Propone,
     no decide: m2 no es m5, y el gestor lo elige a mano. */
  function candidatos(q) {
    var t = norm(q).split(' ').filter(function (w) { return w.length > 1; });
    if (!t.length) return [];
    return prods().map(function (p) {
      var n = ' ' + norm(p.nombre) + ' ';
      var s = t.reduce(function (a, w) { return a + (n.indexOf(' ' + w + ' ') !== -1 ? 2 : n.indexOf(w) !== -1 ? 1 : 0); }, 0);
      return { p: p, s: s };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s || (Number(b.p.stock) > 0) - (Number(a.p.stock) > 0); }).slice(0, 6).map(function (x) { return x.p; });
  }
  var _abierto = null;   // clave de la fila con el buscador abierto
  function pintarBuscador(clave, q) {
    var box = $('max-ens-' + clave); if (!box) return;
    var frase = (box.querySelector('.max-frase') || {}).value || q;
    var busq = (box.querySelector('.max-busq') || {}).value || q;
    var lista = candidatos(busq);
    box.querySelector('.max-cands').innerHTML = lista.length
      ? lista.map(function (p) {
          return '<button type="button" class="max-cand" onclick="maxEnsenar(\'' + esc(clave) + '\',\'' + esc(String(p.id)) + '\')">'
            + '<b>' + esc(p.nombre) + '</b><span>' + (Number(p.stock) > 0 ? Number(p.stock) + ' disponibles' : 'agotado') + '</span></button>';
        }).join('')
      : '<div class="max-vacio">Ningún producto con esas palabras. Prueba con la marca o el modelo.</div>';
    void frase;
  }

  /* ── Pintar ─────────────────────────────────────────────────────────── */
  function pintar() {
    var cont = $('max-cont'); if (!cont) return;
    if (!DATOS.listo && !DATOS.faq) { cont.innerHTML = '<div class="max-vacio">Cargando lo que le preguntan a Max…</div>'; return; }
    var a = analizar(), k = a.kpi, h = '';
    h += '<div class="max-per">' + [[1, 'Hoy'], [7, '7 días'], [30, '30 días'], [0, 'Todo']].map(function (x) {
      return '<button type="button" class="' + (PERIODO === x[0] ? 'on' : '') + '" onclick="maxPeriodo(' + x[0] + ')">' + x[1] + '</button>';
    }).join('') + '<button type="button" class="max-rec" onclick="maxCargar()" title="Volver a leer">↻</button></div>';
    if (DATOS.errFaq) h += '<div class="max-err">No pude leer las preguntas: <b>' + esc(DATOS.errFaq) + '</b>. Esto no es «nadie preguntó»: es que no llegué a mirar.</div>';
    h += '<div class="max-kp">'
      + '<div><b>' + k.preguntas + '</b><small>preguntas distintas</small></div>'
      + '<div><b style="color:' + (k.pct == null ? 'var(--muted)' : k.pct >= 70 ? '#4ade80' : k.pct >= 50 ? '#fbbf24' : '#f87171') + '">' + (k.pct == null ? '—' : k.pct + '%') + '</b><small>' + (k.pct == null ? (DATOS.errOps ? 'opiniones: ' + esc(DATOS.errOps) : 'todavía sin opiniones') : 'le sirvió (' + k.up + ' 👍 · ' + k.down + ' 👎)') + '</small></div>'
      + '<div><b style="color:' + (k.sin ? '#f87171' : 'inherit') + '">' + k.sin + '</b><small>no supo contestar</small></div>'
      + '<div><b style="color:' + (a.arreglar.length ? '#fbbf24' : '#4ade80') + '">' + a.arreglar.length + '</b><small>por arreglar</small></div>'
      + '</div>';
    if (a.semanas.some(function (x) { return x != null; })) {
      h += '<div class="max-sec"><h4>👍 Le sirvió · últimas 6 semanas</h4><div class="max-spark">' + a.semanas.map(function (p) {
        return '<div title="' + (p == null ? 'sin votos' : p + '%') + '" style="height:' + (p == null ? 4 : Math.max(6, p)) + '%;' + (p == null ? 'background:rgba(255,255,255,.08)' : '') + '"><span>' + (p == null ? '' : p + '%') + '</span></div>';
      }).join('') + '</div></div>';
    }
    // Por arreglar
    h += '<div class="max-sec"><h4>❓ Por arreglar <em>' + a.arreglar.length + '</em></h4>';
    if (!a.arreglar.length) h += '<div class="max-vacio">' + (DATOS.faq ? 'Nada pendiente en este periodo. 🎉' : '—') + '</div>';
    a.arreglar.slice(0, 25).forEach(function (f) {
      var mot = Object.keys(f.motivos).sort(function (x, y) { return f.motivos[y] - f.motivos[x]; });
      h += '<div class="max-it">'
        + '<div class="q">«' + esc(f.q) + '» <span class="tg ' + (f.down ? 't1' : 't2') + '">' + (f.sin ? f.n + (f.n > 1 ? ' veces' : ' vez') + ' · no entendió' : f.down + ' 👎') + '</span></div>'
        + (mot.length ? '<div class="m">' + mot.map(function (x) { return esc(x) + (f.motivos[x] > 1 ? ' ×' + f.motivos[x] : ''); }).join(' · ') + '</div>' : '')
        + (!f.sin && f.resp ? '<div class="r">Max: «' + esc(f.resp.slice(0, 160)) + (f.resp.length > 160 ? '…' : '') + '»</div>' : '')
        + '<div class="m">' + hace(f.ts) + '</div>'
        + '<div class="bt">'
        + '<button type="button" class="o" onclick="maxAbrirEnsenar(\'' + esc(f.k) + '\')">📖 Enseñar: es un producto…</button>'
        + '<button type="button" class="g" onclick="maxDemanda(\'' + esc(f.k) + '\')">🛒 Es demanda</button>'
        + '<button type="button" class="g" onclick="maxResuelta(\'' + esc(f.k) + '\')">✓ Ya está</button>'
        + '</div>'
        + (_abierto === f.k ? '<div class="max-ens" id="max-ens-' + esc(f.k) + '">'
            + '<label>Frase que usa el cliente <input class="max-frase" value="' + esc(norm(f.q)) + '" placeholder="ej: nano loco"></label>'
            + '<small>Déjala corta: lo que identifica al producto («nano loco», «planta»). Si la frase aparece en un mensaje, Max entiende ese producto.</small>'
            + '<label>Busca el producto <input class="max-busq" value="' + esc(f.q) + '" oninput="maxBuscar(\'' + esc(f.k) + '\')"></label>'
            + '<div class="max-cands"></div><small>m2 no es m5, ac3 no es ax3: elige el modelo exacto.</small></div>' : '')
        + '</div>';
    });
    h += '</div>';
    // Demanda
    var dem = demanda();
    h += '<div class="max-sec"><h4>🛒 Lo que buscan y no tienes</h4>';
    if (!dem.length) h += '<div class="max-vacio">' + (DATOS.bus || Object.keys(APR.demanda).length ? 'Nada repetido que falte en el catálogo.' : 'No pude leer las búsquedas.') + '</div>';
    dem.forEach(function (d) {
      h += '<div class="max-it"><div class="q">«' + esc(d.q) + '» <span class="tg ' + (d.agotado ? 't2' : 't1') + '">' + d.n + (d.n > 1 ? ' veces' : ' vez') + (d.agotado ? ' · agotado' : '') + '</span></div>'
        + '<div class="m">' + (d.agotado ? 'Lo tienes, pero sin stock: ' + d.n + ' personas lo buscaron.' : 'No hay nada así en el catálogo. Si la principal lo tiene, súbelo.') + '</div>'
        + '<div class="bt"><button type="button" class="o" onclick="go(\'comparar\')">🔀 Buscar en Comparar</button>'
        + (d.anotada ? '<button type="button" class="g" onclick="maxQuitarDemanda(\'' + esc(norm(d.q)) + '\')">Quitar</button>' : '') + '</div></div>';
    });
    h += '</div>';
    // Enseñado
    var ens = Object.keys(APR.ensenado).filter(function (f) { return APR.ensenado[f] && !APR.ensenado[f].borrado; });
    h += '<div class="max-sec"><h4>📖 Lo que le enseñaste</h4>';
    if (!ens.length) h += '<div class="max-vacio">Todavía nada. Desde «Por arreglar» → «Enseñar», Max aprende qué producto quería decir el cliente.</div>';
    ens.forEach(function (f) {
      var e = APR.ensenado[f], p = prods().find(function (x) { return String(x.id) === String(e.id); });
      h += '<div class="max-ensl">«' + esc(f) + '» → <b>' + esc(p ? p.nombre : (e.nombre || e.id)) + '</b>' + (p ? '' : ' <span class="tg t1">ya no está en el catálogo</span>')
        + '<button type="button" onclick="maxDesensenar(\'' + esc(f) + '\')">deshacer</button></div>';
    });
    h += '<div class="max-nota" id="max-estado"></div></div>';
    // Contestadas
    h += '<div class="max-sec"><h4>💬 Contestadas · para revisar</h4>';
    if (!a.contestadas.length) h += '<div class="max-vacio">' + (DATOS.faq ? 'Ninguna en este periodo.' : '—') + '</div>';
    a.contestadas.slice(0, 15).forEach(function (f) {
      h += '<div class="max-it"><div class="q">«' + esc(f.q) + '» <span class="tg t3">' + f.n + (f.n > 1 ? ' veces' : ' vez') + (f.up ? ' · 👍 ' + f.up : '') + (f.down ? ' · 👎 ' + f.down : '') + '</span></div>'
        + (f.resp ? '<div class="m">Max: ' + esc(f.resp.slice(0, 120)) + (f.resp.length > 120 ? '…' : '') + '</div>' : '') + '</div>';
    });
    h += '</div>';
    cont.innerHTML = h;
    pintarEstado();
    if (_abierto) pintarBuscador(_abierto, (a.arreglar.find(function (f) { return f.k === _abierto; }) || {}).q || '');
  }

  function fila(k) { return analizar().filas.find(function (f) { return f.k === k; }); }

  /* ── API para los onclick (el panel vive en una IIFE) ─────────────────── */
  window.maxCargar = function () { leerLocal(); return cargar(); };
  window.maxPeriodo = function (d) { PERIODO = Number(d) || 0; pintar(); };
  window.maxResuelta = function (k) { marcarResuelta(k); };
  window.maxAbrirEnsenar = function (k) { _abierto = _abierto === k ? null : k; pintar(); };
  window.maxBuscar = function (k) { pintarBuscador(k, ''); };
  window.maxEnsenar = function (k, id) {
    var box = $('max-ens-' + k), frase = box ? (box.querySelector('.max-frase') || {}).value : '';
    _abierto = null; ensenar(frase, id, k);
  };
  window.maxDemanda = function (k) { var f = fila(k); if (f) anotarDemanda(f.q, f.n, k); };
  window.maxQuitarDemanda = function (f) { quitarDemanda(f); };
  window.maxDesensenar = function (f) { desEnsenar(f); };
  // Para las pruebas: el estado y la fusión, sin pasar por la red.
  window.tmMaxPanel = { fusionar: fusionar, podar: podar, analizar: analizar, demanda: demanda, get aprendido() { return APR; }, get datos() { return DATOS; } };

  leerLocal();
  var css = document.createElement('style');
  css.textContent = ''
    + '#max-cont .max-per{display:flex;gap:6px;margin:4px 0 12px;flex-wrap:wrap}'
    + '#max-cont .max-per button{border:1px solid var(--border);background:transparent;color:var(--text);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}'
    + '#max-cont .max-per button.on{background:var(--o,#ea580c);border-color:var(--o,#ea580c);color:#fff;font-weight:700}'
    + '#max-cont .max-per .max-rec{margin-left:auto}'
    + '#max-cont .max-kp{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
    + '#max-cont .max-kp div{background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:11px 12px}'
    + '#max-cont .max-kp b{font-size:24px;display:block;line-height:1.15}'
    + '#max-cont .max-kp small{color:var(--muted);font-size:12px}'
    + '#max-cont .max-sec{margin-top:18px}'
    + '#max-cont .max-sec h4{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;display:flex;align-items:center;gap:7px}'
    + '#max-cont .max-sec h4 em{font-style:normal;background:rgba(239,68,68,.15);color:#f87171;border-radius:999px;padding:1px 8px;font-size:11.5px;letter-spacing:0}'
    + '#max-cont .max-it{background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:11px 12px;margin-bottom:8px}'
    + '#max-cont .max-it .q{font-size:14.5px;font-weight:700}'
    + '#max-cont .max-it .m{font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.4}'
    + '#max-cont .max-it .r{font-size:12.5px;background:rgba(0,0,0,.18);border-radius:10px;padding:7px 9px;margin-top:7px;line-height:1.4}'
    + '#max-cont .bt{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}'
    + '#max-cont .bt button{border:0;border-radius:10px;padding:8px 11px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}'
    + '#max-cont .bt .o{background:var(--o,#ea580c);color:#fff}#max-cont .bt .g{background:rgba(255,255,255,.07);color:var(--text)}'
    + '#max-cont .tg{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px;margin-left:4px;vertical-align:2px}'
    + '#max-cont .t1{background:rgba(239,68,68,.15);color:#f87171}#max-cont .t2{background:rgba(245,158,11,.16);color:#fbbf24}#max-cont .t3{background:rgba(56,189,248,.14);color:#38bdf8}'
    + '#max-cont .max-spark{display:flex;align-items:flex-end;gap:6px;height:64px}'
    + '#max-cont .max-spark div{flex:1;background:rgba(74,222,128,.55);border-radius:5px 5px 0 0;position:relative}'
    + '#max-cont .max-spark span{position:absolute;top:-16px;left:0;right:0;text-align:center;font-size:10.5px;color:var(--muted)}'
    + '#max-cont .max-ens{margin-top:10px;border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px}'
    + '#max-cont .max-ens label{font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:4px}'
    + '#max-cont .max-ens input{background:var(--card,#121215);border:1px solid var(--border);border-radius:10px;padding:9px 10px;color:var(--text);font:inherit;font-size:14px}'
    + '#max-cont .max-ens small{font-size:11.5px;color:var(--muted)}'
    + '#max-cont .max-cand{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:10px;padding:9px 10px;margin-top:5px;color:var(--text);font:inherit;font-size:13px;cursor:pointer}'
    + '#max-cont .max-cand span{color:var(--muted);font-size:12px;white-space:nowrap}'
    + '#max-cont .max-ensl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:9px 11px;margin-bottom:6px;font-size:13.5px}'
    + '#max-cont .max-ensl button{margin-left:auto;background:none;border:0;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;text-decoration:underline}'
    + '#max-cont .max-vacio{color:var(--muted);font-size:13px;padding:6px 2px}'
    + '#max-cont .max-err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:10px}'
    + '#max-cont .max-nota{font-size:12px;color:var(--muted);margin-top:6px}';
  document.head.appendChild(css);
})();
