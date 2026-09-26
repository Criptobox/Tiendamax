/* ============================================================
   TiendaMax — módulo: tm-catalog
   Copiar FB/Revolico, publicación, categorías gestión, gestión productos, estado backend, sync GitHub, delta sync
   Extraído de script.src.js (L3472–L4282, 811 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// Aquí vivían copiarParaFacebook/copiarParaRevolico y los tres envoltorios de
// publicación. Nadie los llamaba: los botones que los usaban se fueron cuando
// el panel pasó a admin.html, y ahora quien copia y apunta la publicación son
// wzCopiar() y plCopiar() allí.

// ===== CATEGORÍAS (GESTIÓN) =====

function actualizarSelectCategorias() {
    ['productCategory', 'editProductCategory'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const val = select.value;
        select.innerHTML = '';
        // Incluye la categoría que ya tenga el producto aunque no esté
        // declarada: si falta la <option>, select.value se queda vacío, cae a
        // 'General' y al guardar le cambia la categoría al producto sin avisar.
        tmCategoriasVisibles(productos, categorias).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            select.appendChild(opt);
        });
        select.value = val || 'General';
    });
}

function actualizarBotonesCategorias() {
    const container = document.getElementById('categoriaFiltro');
    if (!container) return;

    container.innerHTML = `<button class="categoria-btn ${categoriaSeleccionada === 'Todas' ? 'active' : ''}" onclick="filtrarPorCategoria('Todas')">Todas</button>`;

    // Sin esto, una categoría no declarada no tiene píldora: sus productos
    // solo se ven en "Todas" y no hay forma de filtrarlos.
    tmCategoriasVisibles(productos, categorias).forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `categoria-btn ${categoriaSeleccionada === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => filtrarPorCategoria(cat);
        container.appendChild(btn);
    });

    // La fila de categorías se desplaza en horizontal y la activa suele caer
    // fuera de la pantalla —o cortada por el borde, como pasaba con ENERGIA—.
    // Se centra para que siempre se vea entera dónde estás parado.
    const activa = container.querySelector('.categoria-btn.active');
    if (activa && typeof activa.scrollIntoView === 'function') {
        try {
            activa.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        } catch (e) {
            // Navegadores viejos: sin opciones, y sin arrastrar la página vertical
            container.scrollLeft = activa.offsetLeft - (container.clientWidth - activa.offsetWidth) / 2;
        }
    }
}

function filtrarPorCategoria(cat) {
    categoriaSeleccionada = cat;
    // Marcar el chip activo a mano en vez de llamar a actualizarBotonesCategorias():
    // aquella borra y reconstruye la tira entera, así que al tocar un chip se
    // perdían la píldora animada y la posición del scroll. _tmSliderMover()
    // (definida al final de tm-iife.src.js) desliza la píldora al chip nuevo.
    const container = document.getElementById('categoriaFiltro');
    if (container) {
        container.querySelectorAll('.categoria-btn').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.tmCat || btn.textContent.trim()) === cat);
        });
        if (typeof _tmSliderMover === 'function') _tmSliderMover();
    }
    // Cambiar de categoría también cambia sus subcategorías. Sin esto los chips
    // de subcategoría se quedaban en los de la categoría ANTERIOR —en WIFI
    // salían HERRAMIENTAS, DEPORTES, HOGAR…, que son de UTILES— y el conteo
    // con ellos, porque renderizarSubcategoriaTabs() es quien llama a
    // actualizarCategoriaStats(). Además hay que soltar la subcategoría
    // elegida ANTES de repintar: si no, la parrilla filtra por una que en la
    // categoría nueva no existe y sale vacía.
    if (typeof subcategoriaSeleccionada !== 'undefined') subcategoriaSeleccionada = 'Todas';
    if (typeof renderizarSubcategoriaTabs === 'function') renderizarSubcategoriaTabs();
    renderizarProductos();
    const titulo = document.getElementById('tituloCategoriaActual');
    if (titulo) {
        const icono = typeof obtenerIconoCategoria === 'function' ? obtenerIconoCategoria(cat) : '';
        titulo.textContent = cat === 'Todas' ? '🛍️ Todos los Productos' : `${icono} ${cat}`;
    }
}


function agregarCategoria() {
    const input = document.getElementById('newCategoryName');
    const iconInput = document.getElementById('newCategoryIcon');
    const name = input.value.trim();
    const icon = iconInput.value.trim();
    
    if (!name) return;
    if (categorias.includes(name)) { mostrarNotificacion('La categoría ya existe', 'error'); return; }
    
    categorias.push(name);
    
    // Si el usuario puso un icono, guardarlo como personalizado
    if (icon) {
        iconosPersonalizados[name] = icon;
        localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
    }
    
    guardarCategorias();
    input.value = '';
    iconInput.value = '';
    
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    renderizarCategoriasHome();
    mostrarNotificacion('✅ Categoría agregada');
}

let _guardarCategoriasTimer = null;
function guardarCategorias() {
    localStorage.setItem('categorias', JSON.stringify(categorias));
    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
    // Persistir en Firebase RTDB para que sobreviva recargas y otros dispositivos
    const base = _fbRtdbUrl();
    if (base) {
        fetch(base + '/configuracion/categorias.json', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({nombres: categorias, iconos: iconosPersonalizados, ts: Date.now()})
        }).catch(() => {});
    }
    // Auto-sync a GitHub (debounced)
    clearTimeout(_guardarCategoriasTimer);
    _guardarCategoriasTimer = setTimeout(() => {
        const user = localStorage.getItem('githubUser');
        const repo = localStorage.getItem('githubRepo');
        const token = localStorage.getItem('githubToken');
        if (!user || !repo || !token) return;
        // Se relee para no perder `apagadas`, que este guardado no gestiona.
        _tmLeerJsonRepoFresco(user, repo, token, 'categorias.json').catch(() => null).then(r => {
            const d = { nombres: categorias, iconos: iconosPersonalizados };
            const ap = (typeof window.tmApagadasParaSubir === 'function') ? window.tmApagadasParaSubir(r && r.apagadas) : (r && r.apagadas);
            if (ap) d.apagadas = ap;
            return subirArchivoAGitHub(user, repo, token, 'categorias.json', d);
        }).catch(() => {});
        subirArchivoAGitHub(user, repo, token, 'subcategorias.json', tmParseObject(localStorage.getItem('subcategorias'))).catch(() => {});
    }, 2000);
}


// ===== GESTIÓN DE PRODUCTOS (EDITAR/ELIMINAR) =====


// Aquí estaban verificarEstadoBackend y cargarEstadoPublicacion. Las dos solo
// escribían un aviso fijo ("modo manual activo") en #backendStatus y
// #historialPublicaciones, que no existen en ningún HTML desde que el panel se
// fue a admin.html. La primera se llamaba además desde un setInterval cada 30
// segundos, para no hacer nada.

// ===== SINCRONIZACIÓN CON GITHUB =====

// Detrás de los tres campos de GitHub había cinco líneas que rellenaban
// #firebaseConfigJson, #firebaseVapidKey y #firebaseServerKey. Esos campos no
// existen en admin.html —la configuración de Firebase se hace ahora en
// #fb-config-input / #fb-vapid-input, con su propio cargador—, así que la
// primera de ellas tiraba un TypeError cada vez que se abría ⚙️ Configuración
// y cortaba la función ahí. No se veía nada raro porque lo único que quedaba
// detrás eran las otras cuatro, igual de inútiles; pero cualquier cosa que se
// añadiera al final de esta función no se habría ejecutado nunca.
function cargarConfiguracionGitHub() {
    document.getElementById('githubUser').value = localStorage.getItem('githubUser') || '';
    document.getElementById('githubRepo').value = localStorage.getItem('githubRepo') || 'Tiendamax';
    document.getElementById('githubToken').value = localStorage.getItem('githubToken') || '';
}

function guardarConfiguracionGitHub(event) {
    event.preventDefault();
    const token = document.getElementById('githubToken').value.trim();
    localStorage.setItem('githubUser', document.getElementById('githubUser').value.trim());
    localStorage.setItem('githubRepo', document.getElementById('githubRepo').value.trim());
    localStorage.setItem('githubToken', token);
    // Duración y antelación del aviso, si el formulario los trae.
    const dEl = document.getElementById('ghTokenDias');
    const aEl = document.getElementById('ghTokenAviso');
    const cambios = {};
    if (dEl && Number(dEl.value) > 0) cambios.dias = Math.min(400, Number(dEl.value));
    if (aEl && Number(aEl.value) > 0) cambios.aviso = Math.min(60, Number(aEl.value));
    if (typeof tmTokenGuardarMeta === 'function' && Object.keys(cambios).length) tmTokenGuardarMeta(cambios);
    /* Token distinto = token nuevo = el reloj vuelve a empezar. Es lo único
       que hace que el aviso siga sirviendo sin que nadie apunte fechas a
       mano; volver a pulsar Guardar con el mismo token no renueva nada en
       GitHub, así que tampoco aquí. */
    let nuevo = null;
    if (typeof tmTokenMarcarSiCambio === 'function') nuevo = tmTokenMarcarSiCambio(token);
    mostrarNotificacion(nuevo
        ? '✅ Token nuevo guardado — el aviso vuelve a contar desde hoy'
        : '✅ Configuración de GitHub guardada localmente');
    if (typeof tmTokenPintarEstado === 'function') tmTokenPintarEstado();
}


// ===== SISTEMA DE DELTA SYNC =====
// Registra qué productos fueron modificados desde la última sincronización
function marcarProductoModificado(id) {
    const modificados = tmParseArray(localStorage.getItem('productosModificados'));
    if (!modificados.includes(id)) modificados.push(id);
    localStorage.setItem('productosModificados', JSON.stringify(modificados));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
}

function limpiarProductosModificados() {
    localStorage.removeItem('productosModificados');
    localStorage.removeItem('productosEliminados');
    localStorage.setItem('ultimaSincronizacion', Date.now().toString());
}

function obtenerProductosModificados() {
    return tmParseArray(localStorage.getItem('productosModificados'));
}

// Borrados pendientes de publicar (para no "resucitarlos" al fusionar con el repo)
function marcarProductoEliminado(id) {
    const el = tmParseArray(localStorage.getItem('productosEliminados'));
    if (!el.map(String).includes(String(id))) { el.push(id); localStorage.setItem('productosEliminados', JSON.stringify(el)); }
}
function obtenerProductosEliminados() {
    return tmParseArray(localStorage.getItem('productosEliminados'));
}


// ── Anti-pisado: fusiona el catálogo en memoria con el productos.json del repo ──
// Los productos que el admin cambió esta sesión (productosModificados) mandan; los
// que NO tocó toman la versión del repo (así no se pisan fotos/precios cambiados
// desde otra sesión o dispositivo). Los que existen en el repo y no en memoria se
// conservan salvo que el admin los haya borrado. Si el repo no responde, devuelve
// el array en memoria tal cual (sin cambiar el comportamiento anterior).
// Guarda el último productos.json remoto que se pudo leer, para poder diffearlo
// contra lo que se publica y armar la auditoría de cambios (ver más abajo).
let _tmUltimoRemotoParaAuditoria = null;

// Lee un JSON del repo por la Contents API (autenticada), que NO tiene el lag de
// CDN de raw.githubusercontent.com. Ese lag era la causa raíz de que un producto
// recién marcado agotado "resucitara": tras publicar y limpiar productosModificados,
// el siguiente "Actualizar tienda" leía por raw una copia VIEJA del repo (aún con
// stock), y como el producto ya no estaba en modificados, el merge lo reponía con esa
// versión vieja y lo republicaba disponible. La Contents API devuelve el commit más
// reciente al instante. Si falla (o el archivo no trae content inline), cae a raw.
async function _tmLeerJsonRepoFresco(user, repo, token, path) {
    if (token) {
        try {
            const r = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/${path}?ref=main&_=${Date.now()}`, {
                headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
                cache: 'no-store'
            });
            if (r.ok) {
                const j = await r.json();
                if (j && j.encoding === 'base64' && j.content) {
                    const bin = atob(j.content.replace(/\s/g, ''));
                    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
                    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
                }
            }
        } catch (e) {}
    }
    try {
        const r = await fetch(`https://raw.githubusercontent.com/${user}/${repo}/main/${path}?_=${Date.now()}`, { cache: 'no-store' });
        if (r.ok) return await r.json();
    } catch (e) {}
    return null;
}

/* Los ids que este panel ha visto en productos.json del repo (ver
   _tmMergeProductosConRepo). null si aún no se ha apuntado ninguno. */
function _tmIdsVistosEnRepo() {
    const v = localStorage.getItem('tm_ids_en_repo');
    return v === null ? null : new Set(tmParseArray(v).map(String));
}
function _tmSumarIdsEnRepo(ids, base) {
    try {
        const todos = new Set(base || _tmIdsVistosEnRepo() || []);
        ids.forEach(id => todos.add(String(id)));
        localStorage.setItem('tm_ids_en_repo', JSON.stringify([...todos]));
    } catch (e) {}
}

/* ── Subir solo lo tocado ────────────────────────────────────────────────
 * "Actualizar tienda" subía productos.json ENTERO para cambiar un precio:
 * ~540 KB en base64, decenas de segundos desde un móvil en Cuba. Ahora sube
 * cambios/<ms>-<azar>.json con solo los productos que difieren del repo (y
 * los borrados), y regenerate-artifacts.yml los aplica con
 * scripts/aplicar_cambios.py. La forma del fichero está documentada allí.
 *
 * Entre la subida y que el workflow lo aplique pasa un minuto. Si en ese
 * minuto se vuelve a publicar, el productos.json del repo todavía es el
 * viejo, y fusionar contra él devolvería a la memoria del panel los valores
 * de antes: el siguiente cambio a ese producto los subiría de vuelta. Por eso
 * lo subido queda en tm_cambios_pendientes y se superpone al repo (ver
 * _tmConPendientes) hasta que el repo lo refleje, lo que se sabe por `rev`:
 * la hora de la subida, que viaja dentro del producto. */
const _TM_PENDIENTES = 'tm_cambios_pendientes';
const _TM_PENDIENTE_CADUCA = 3 * 24 * 3600 * 1000;
function _tmPendientes() {
    const o = tmParseObject(localStorage.getItem(_TM_PENDIENTES));
    return { productos: o.productos || {}, eliminados: o.eliminados || {} };
}
function _tmGuardarPendientes(pend) {
    try { localStorage.setItem(_TM_PENDIENTES, JSON.stringify(pend)); } catch (e) {}
}
function _tmRegistrarPendientes(cambios) {
    const pend = _tmPendientes();
    (cambios.productos || []).forEach(p => { pend.productos[String(p.id)] = p; });
    (cambios.eliminados || []).forEach(id => { pend.eliminados[String(id)] = Date.parse(cambios.creado) || Date.now(); });
    _tmGuardarPendientes(pend);
}
/* El catálogo del repo tal como quedará cuando se apliquen los cambios que
   este panel ya subió. Lo ya aplicado se quita de la lista. */
function _tmConPendientes(remoto) {
    const pend = _tmPendientes();
    const byId = {};
    remoto.forEach(p => { if (p && p.id != null) byId[String(p.id)] = p; });
    const ahora = Date.now();
    let cambio = false;
    Object.keys(pend.productos).forEach(id => {
        const mio = pend.productos[id], suyo = byId[id];
        const aplicado = suyo && Number(suyo.rev || 0) >= Number(mio.rev || 0);
        if (aplicado || ahora - Number(mio.rev || 0) > _TM_PENDIENTE_CADUCA) { delete pend.productos[id]; cambio = true; }
    });
    Object.keys(pend.eliminados).forEach(id => {
        if (!byId[id] || ahora - Number(pend.eliminados[id]) > _TM_PENDIENTE_CADUCA) { delete pend.eliminados[id]; cambio = true; }
    });
    if (cambio) _tmGuardarPendientes(pend);
    const out = remoto.filter(p => !(p && pend.eliminados[String(p.id)]))
                      .map(p => (p && pend.productos[String(p.id)]) || p);
    Object.keys(pend.productos).forEach(id => { if (!byId[id]) out.push(pend.productos[id]); });
    return out;
}
/* ¿Subidos hace más de 15 min y el repo aún no los refleja? Entonces el
   workflow que los aplica está fallando, y el gestor tiene que saberlo. */
function _tmPendientesAtascados() {
    const pend = _tmPendientes(), limite = Date.now() - 15 * 60 * 1000;
    return Object.values(pend.productos).filter(p => Number(p.rev || 0) < limite).length
         + Object.values(pend.eliminados).filter(t => Number(t) < limite).length;
}
function _tmMismoProducto(a, b) {
    const canon = o => JSON.stringify(Object.keys(o).filter(k => k !== 'rev').sort()
                                            .reduce((r, k) => (r[k] = o[k], r), {}));
    return canon(a) === canon(b);
}
/* Lo que hay que subir: los productos que difieren del repo (con los
   pendientes ya superpuestos) y los que ya no están. null si nada. */
function _tmCambiosParaSubir(finales, remoto) {
    if (!Array.isArray(finales)) return null;
    const rem = {};
    (remoto || []).forEach(p => { if (p && p.id != null) rem[String(p.id)] = p; });
    const idsFinales = new Set(finales.map(p => String(p.id)));
    const productos = [], posiciones = {};
    finales.forEach((p, i) => {
        const id = String(p.id), r = rem[id];
        if (r) {
            // El panel trabaja con el catálogo lite: sin descripción no es
            // "la borró", es que no la tiene (aplicar_cambios la conserva).
            const a = ('descripcion' in p || !('descripcion' in r)) ? p : Object.assign({}, p, { descripcion: r.descripcion });
            if (_tmMismoProducto(a, r)) return;
        } else {
            posiciones[id] = i ? String(finales[i - 1].id) : null;
        }
        productos.push(p);
    });
    const eliminados = Array.isArray(remoto) ? Object.keys(rem).filter(id => !idsFinales.has(id)) : [];
    if (!productos.length && !eliminados.length) return null;
    const rev = Date.now();
    return { v: 1, creado: new Date(rev).toISOString(),
             productos: productos.map(p => Object.assign({}, p, { rev })),
             eliminados, posiciones };
}
function _tmRutaCambios(cambios) {
    return 'cambios/' + Date.parse(cambios.creado) + '-' + Math.random().toString(36).slice(2, 6) + '.json';
}
/* Tras subir con éxito un fichero: lo que implica para la memoria del panel. */
function _tmTrasSubir(path, data) {
    if (path.startsWith('cambios/') && data) {
        _tmRegistrarPendientes(data);
        _tmSumarIdsEnRepo((data.productos || []).map(p => p.id));
    } else if (path === 'productos.json' && Array.isArray(data)) {
        _tmSumarIdsEnRepo(data.map(p => p.id));
    }
}

async function _tmMergeProductosConRepo(user, repo, remotoYaLeido) {
    let remoto = null;
    _tmUltimoRemotoParaAuditoria = null;
    const _j = (remotoYaLeido !== undefined) ? remotoYaLeido
             : await _tmLeerJsonRepoFresco(user, repo, localStorage.getItem('githubToken'), 'productos.json');
    if (Array.isArray(_j)) remoto = _j; else if (_j && Array.isArray(_j.productos)) remoto = _j.productos;
    if (!Array.isArray(remoto)) return productos.slice();
    // Lo ya subido que el workflow aún no ha aplicado cuenta como del repo.
    remoto = _tmConPendientes(remoto);
    _tmUltimoRemotoParaAuditoria = remoto;

    const mods = new Set(obtenerProductosModificados().map(String));
    const del  = new Set(obtenerProductosEliminados().map(String));
    const memIds = new Set(productos.map(p => String(p.id)));
    const remotoById = {};
    remoto.forEach(p => { if (p && p.id != null) remotoById[String(p.id)] = p; });

    /* Borrado desde OTRO sitio: estaba en el repo, ya no está, y aquí nadie lo
       tocó. Esto conservaba los productos AÑADIDOS en otro dispositivo pero
       no respetaba los BORRADOS: un panel abierto desde antes del borrado lo
       volvía a subir en la siguiente publicación. Para distinguirlo de un
       producto nuevo creado aquí (que tampoco está en el repo) hace falta
       saber si este panel lo vio alguna vez EN el repo: eso guarda
       tm_ids_en_repo. La primera vez no existe, y entonces cuenta como visto
       lo que había en memoria sin tocar — un producto nuevo se marca como
       modificado al crearlo, así que ese no entra. */
    let vistos = _tmIdsVistosEnRepo();
    if (!vistos) vistos = new Set(productos.map(p => String(p.id)).filter(id => !mods.has(id)));
    const borradoFuera = p => { const id = String(p.id);
        return !remotoById[id] && !mods.has(id) && vistos.has(id); };
    _tmSumarIdsEnRepo(Object.keys(remotoById), vistos);

    // Empezar por lo que el admin ve; no-modificados toman la versión del repo.
    const merged = productos.filter(p => !borradoFuera(p)).map(p => {
        const id = String(p.id);
        if (mods.has(id)) return p;                 // el admin lo cambió esta sesión → su versión
        return remotoById[id] || p;                 // no lo tocó → versión del repo
    });
    // Conservar productos que están en el repo pero no en memoria (agregados en otra
    // sesión/dispositivo), salvo que el admin los haya eliminado.
    remoto.forEach(p => {
        if (p && p.id != null && !memIds.has(String(p.id)) && !del.has(String(p.id))) merged.push(p);
    });
    return merged;
}

// ── Auditoría de cambios reales de productos (Firebase /auditoria_productos) ──
// Sin esto, cuando "algo vuelve a salir" (como reportó el admin) no hay forma
// de ver qué cambió de verdad ni cuándo — solo snapshot()/rollback manual en
// Herramientas, no automático. Compara el productos.json remoto (antes de
// publicar, guardado por _tmMergeProductosConRepo) contra lo que se va a subir,
// y registra un evento por cada producto creado/eliminado/campo editado.
// Best-effort: si Firebase no está configurado o falla, no bloquea el publish.
const _TM_AUDITORIA_CAMPOS = ['nombre', 'precioActual', 'precioOriginal', 'stock', 'categoria', 'subcategoria', 'masVendido', 'imagen'];
const _TM_AUDITORIA_MAX = 20; // tope por sync (evita ráfagas gigantes con CSV masivo)

function _tmRegistrarAuditoriaCambios(prodsFinal) {
    const remoto = _tmUltimoRemotoParaAuditoria;
    const base = _fbRtdbUrl();
    if (!base || !Array.isArray(remoto) || !Array.isArray(prodsFinal)) return;
    const norm = v => (v === undefined || v === null) ? '' : String(v);

    const oldById = {};
    remoto.forEach(p => { if (p && p.id != null) oldById[String(p.id)] = p; });
    const newIds = new Set(prodsFinal.map(p => String(p.id)));
    const entradas = [];

    prodsFinal.forEach(p => {
        const id = String(p.id);
        const old = oldById[id];
        const nombre = norm(p.nombre).slice(0, 80);
        if (!old) { entradas.push({ accion: 'creado', productoId: id, nombre }); return; }
        _TM_AUDITORIA_CAMPOS.forEach(campo => {
            const de = norm(old[campo]), a = norm(p[campo]);
            if (de === a) return;
            entradas.push({ accion: 'editado', productoId: id, nombre, campo, de: de.slice(0, 120), a: a.slice(0, 120) });
        });
    });
    remoto.forEach(p => {
        if (p && p.id != null && !newIds.has(String(p.id))) {
            entradas.push({ accion: 'eliminado', productoId: String(p.id), nombre: norm(p.nombre).slice(0, 80) });
        }
    });
    if (!entradas.length) return;

    const ts = Date.now();
    entradas.slice(0, _TM_AUDITORIA_MAX).forEach((e, i) => {
        const id2 = `${ts}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        fetch(`${base}/auditoria_productos/${id2}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ ts }, e))
        }).catch(() => {});
    });
}

// ── Anti-pisado: igual que _tmMergeProductosConRepo pero para categorías.
// Sin esto, cualquier "Actualizar tienda" (incluso solo por cambiar un precio)
// sobreescribía categorias.json con la copia en memoria de ESTA sesión, borrando
// categorías/emojis agregados desde otro dispositivo/sesión que no se recargó.
// Nunca borra: nombres/iconos del repo que no están en memoria se conservan.
async function _tmMergeCategoriasConRepo(user, repo, remotoYaLeido) {
    const local = { nombres: (categorias || []).slice(), iconos: Object.assign({}, iconosPersonalizados || {}) };
    let remoto = null;
    const _j = (remotoYaLeido !== undefined) ? remotoYaLeido
             : await _tmLeerJsonRepoFresco(user, repo, localStorage.getItem('githubToken'), 'categorias.json');
    if (_j && Array.isArray(_j.nombres)) remoto = _j;
    // Lo apagado desde el panel (ver catApSubir en admin.html) viaja en este
    // mismo fichero: reescribirlo sin la clave lo encendería todo. Sin el
    // panel cargado se conserva lo que ya hubiera en el repo.
    const apR = remoto ? remoto.apagadas : undefined;
    const apagadas = (typeof window.tmApagadasParaSubir === 'function') ? window.tmApagadasParaSubir(apR) : apR;
    const conApagadas = o => (apagadas ? Object.assign(o, { apagadas }) : o);
    if (!remoto) return conApagadas(local);

    const eliminadas = new Set(tmParseArray(localStorage.getItem('categoriasEliminadas')));
    const nombres = local.nombres.slice();
    remoto.nombres.forEach(n => { if (!nombres.includes(n) && !eliminadas.has(n)) nombres.push(n); });
    const iconos = Object.assign({}, remoto.iconos || {}, local.iconos);
    return conApagadas({ nombres, iconos });
}

// ── Anti-pisado: igual que la de categorías, pero para subcategorias.json
// ({ CATEGORIA: [sub, sub...] }). Fusiona por categoría, unión de subcategorías.
async function _tmMergeSubcategoriasConRepo(user, repo, remotoYaLeido) {
    const local = tmParseObject(localStorage.getItem('subcategorias'));
    let remoto = null;
    const _j = (remotoYaLeido !== undefined) ? remotoYaLeido
             : await _tmLeerJsonRepoFresco(user, repo, localStorage.getItem('githubToken'), 'subcategorias.json');
    if (_j && typeof _j === 'object' && !Array.isArray(_j)) remoto = _j;
    if (!remoto) return local;

    const merged = {};
    Object.keys(local).forEach(cat => { merged[cat] = (local[cat] || []).slice(); });
    Object.keys(remoto).forEach(cat => {
        if (!merged[cat]) { merged[cat] = (remoto[cat] || []).slice(); return; }
        (remoto[cat] || []).forEach(s => { if (!merged[cat].includes(s)) merged[cat].push(s); });
    });
    return merged;
}

// Evita que el sync borre descripciones: el admin carga el catálogo lite (sin
// descripcion), así que antes de subir productos.json recupera descripcion/seoTitle/
// seoDescription del productos.json del repo para los productos que no las tengan en memoria.
async function _tmPreservarDescripciones(remotoYaLeido) {
    try {
        if (!Array.isArray(productos) || !productos.some(p => !p.descripcion)) return;
        /* El catálogo del repo ya lo bajó quien llama (son 425 KB y se estaban
           descargando DOS veces seguidas en cada publicación: una aquí y otra
           en _tmMergeProductosConRepo, con medio segundo de diferencia). Si no
           lo trae, se baja como antes. */
        let full = Array.isArray(remotoYaLeido) ? remotoYaLeido : null;
        if (!full) {
            const res = await fetch('productos.json?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return;
            full = await res.json();
        }
        if (!Array.isArray(full)) return;
        const map = {};
        full.forEach(p => { if (p && p.id != null) map[String(p.id)] = p; });
        productos.forEach(p => {
            const fp = map[String(p.id)];
            if (!fp) return;
            if (!p.descripcion && fp.descripcion) p.descripcion = fp.descripcion;
            if (!p.seoTitle && fp.seoTitle) p.seoTitle = fp.seoTitle;
            if (!p.seoDescription && fp.seoDescription) p.seoDescription = fp.seoDescription;
        });
    } catch (e) { console.warn('[preservarDescripciones]', e); }
}

// ── Lock anti-carrera: evita que el auto-sync silencioso (tras ajustar
// stock) y una sincronización manual completa lean el repo en instantes
// distintos y una pise el merge de la otra. _tmMergeProductosConRepo lee el
// repo de nuevo cada vez, así que basta con que nunca corran a la vez.
let _tmSyncEnCurso = false;
async function _tmEsperarSyncLibre() {
    while (_tmSyncEnCurso) {
        await new Promise(r => setTimeout(r, 300));
    }
}

// Archivos que no lograron subir en el último intento. Permiten reintentar
// solo esos en vez de repetir la publicación entera, que además vuelve a
// releer y fusionar todo el catálogo contra el repo.
let _tmSyncPendientes = [];

function _tmMostrarBotonReintento(paths) {
    const card = document.querySelector('#tmSyncFloat .tm-sync-float-card');
    if (!card || !paths.length) return;
    let btnR = document.getElementById('tmSyncRetry');
    if (!btnR) {
        btnR = document.createElement('button');
        btnR.id = 'tmSyncRetry';
        btnR.type = 'button';
        btnR.style.cssText = 'margin-top:10px;width:100%;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,106,31,.5);background:rgba(255,106,31,.15);color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;pointer-events:auto';
        card.appendChild(btnR);
    }
    btnR.textContent = '🔁 Reintentar ' + paths.length + ' archivo(s)';
    btnR.onclick = reintentarSyncPendientes;
    const f = document.getElementById('tmSyncFloat');
    if (f) { f.style.display = 'block'; f.style.pointerEvents = 'auto'; }
}

// Reintenta SOLO los archivos que fallaron, con los mismos datos ya fusionados.
async function reintentarSyncPendientes() {
    if (!_tmSyncPendientes.length) return;
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) { mostrarNotificacion('❌ Falta la configuración de GitHub', 'error'); return; }
    const btnR = document.getElementById('tmSyncRetry');
    if (btnR) { btnR.disabled = true; btnR.textContent = '⏳ Reintentando…'; }
    const quedan = [];
    for (const item of _tmSyncPendientes) {
        try { await subirArchivoAGitHub(user, repo, token, item.path, item.data); _tmTrasSubir(item.path, item.data); }
        catch (e) { quedan.push(item); }
    }
    _tmSyncPendientes = quedan;
    if (quedan.length === 0) {
        if (btnR) btnR.remove();
        const f = document.getElementById('tmSyncFloat');
        if (f) f.style.display = 'none';
        limpiarProductosModificados();
        if (typeof tmActualizarPendientes === 'function') tmActualizarPendientes();
        mostrarNotificacion('✅ Completado: ya subió todo lo que faltaba.');
    } else {
        if (btnR) { btnR.disabled = false; btnR.textContent = '🔁 Reintentar ' + quedan.length + ' archivo(s)'; }
        mostrarNotificacion('❌ Siguen fallando ' + quedan.length + ' archivo(s). Revisa el token y la conexión.', 'error');
    }
}

async function sincronizarTodoConGitHub() {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        mostrarNotificacion('❌ Configura primero tu usuario, repo y token en la pestaña Configuración', 'error');
        switchTab('configuracion');
        return;
    }
    await _tmEsperarSyncLibre();
    _tmSyncEnCurso = true;
    try {

    const btn = document.querySelector('[data-action="sincronizarTodoConGitHub"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    // --- Barra de progreso ---
    let barraContenedor = document.getElementById('syncProgressContenedor');
    if (!barraContenedor) {
        barraContenedor = document.createElement('div');
        barraContenedor.id = 'syncProgressContenedor';
        barraContenedor.style.cssText = 'margin-top:14px;';
        barraContenedor.innerHTML = `
            <div style="background:#2a2a2a;border-radius:8px;overflow:hidden;height:14px;margin-bottom:6px;">
                <div id="syncProgressBarra" style="height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#ff9a6c);transition:width 0.4s ease;border-radius:8px;"></div>
            </div>
            <p id="syncProgressTexto" style="font-size:12px;color:#aaa;text-align:center;margin:0;"></p>
        `;
        if (btn) btn.parentNode.insertBefore(barraContenedor, btn.nextSibling);
    }
    barraContenedor.style.display = 'block';
    const barra   = document.getElementById('syncProgressBarra');
    const textoEl = document.getElementById('syncProgressTexto');

    // Barra flotante global: visible aunque el botón esté en otra pestaña o fuera de pantalla.
    let barraFloat = document.getElementById('tmSyncFloat');
    if (!barraFloat) {
        barraFloat = document.createElement('div');
        barraFloat.id = 'tmSyncFloat';
        barraFloat.innerHTML = `
          <div class="tm-sync-float-card">
            <div class="tm-sync-float-top"><b>🔄 Actualizando tienda</b><span id="tmSyncFloatPct">0%</span></div>
            <div class="tm-sync-float-track"><div id="tmSyncFloatBar"></div></div>
            <div id="tmSyncFloatText">Preparando...</div>
          </div>`;
        const st = document.createElement('style');
        st.id = 'tmSyncFloatStyle';
        st.textContent = `#tmSyncFloat{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateX(-50%);z-index:99999;width:min(92vw,460px);pointer-events:none}.tm-sync-float-card{background:rgba(15,15,15,.96);border:1px solid rgba(201,169,110,.35);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04) inset;border-radius:16px;padding:13px 14px;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.tm-sync-float-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:9px}.tm-sync-float-top b{color:#fff}.tm-sync-float-top span{color:#C9A96E;font-weight:900}.tm-sync-float-track{height:11px;background:#272727;border-radius:999px;overflow:hidden}.tm-sync-float-track>div{height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#C9A96E);border-radius:999px;transition:width .35s ease}#tmSyncFloatText{font-size:11px;color:#bbb;margin-top:7px;text-align:center}`;
        document.head.appendChild(st);
        document.body.appendChild(barraFloat);
    }
    barraFloat.style.display = 'block';
    const barraFloatBar = document.getElementById('tmSyncFloatBar');
    const barraFloatPct = document.getElementById('tmSyncFloatPct');
    const barraFloatText = document.getElementById('tmSyncFloatText');

    if (barra)   barra.style.width = '0%';
    if (textoEl) textoEl.textContent = 'Preparando...';
    if (barraFloatBar) barraFloatBar.style.width = '0%';
    if (barraFloatPct) barraFloatPct.textContent = '0%';
    if (barraFloatText) barraFloatText.textContent = 'Preparando...';

    function actualizarBarra(paso, total, mensaje) {
        const pct = Math.round((paso / total) * 100);
        if (barra)   barra.style.width = pct + '%';
        if (textoEl) textoEl.textContent = mensaje;
        if (barraFloatBar) barraFloatBar.style.width = pct + '%';
        if (barraFloatPct) barraFloatPct.textContent = pct + '%';
        if (barraFloatText) barraFloatText.textContent = mensaje;
    }
    // -------------------------

    const idsModificados = obtenerProductosModificados();
    const hayDelta = idsModificados.length > 0 && idsModificados.length < productos.length;

    if (hayDelta) {
        mostrarNotificacion(`🔄 Subiendo ${idsModificados.length} producto(s) modificado(s)...`, 'info');
    } else {
        mostrarNotificacion('🚀 Sincronizando tienda completa con GitHub...', 'info');
    }

    // Construir config.json con tasa + oferta del día para que todos los clientes la vean.
    // IMPORTANTE: partimos del config.json que ya está en GitHub para NO borrar campos
    // que este sync no gestiona (margenMN, tasaMNAnterior, tasaFuente, tasaActualizada…).
    // Antes se sobreescribía config.json completo y se perdía el margenMN → el bot de
    // Telegram y la tienda volvían al margen por defecto (10).
    /* Las cuatro lecturas del repo van EN PARALELO, más el listado de shas.
       Son ficheros distintos y ninguna depende de otra, pero se hacían una
       detrás de otra: cinco idas y vueltas encadenadas antes de empezar a
       subir. Desde un móvil en Cuba eso es el grueso de la espera. (Las
       SUBIDAS siguen en fila: ahí el orden sí importa, ver más abajo.) */
    const [_cfgRepo, _prodRepo, _catRepo, _subcatRepo, _shasRaiz] = await Promise.all([
        _tmLeerJsonRepoFresco(user, repo, token, 'config.json').catch(() => null),
        _tmLeerJsonRepoFresco(user, repo, token, 'productos.json').catch(() => null),
        _tmLeerJsonRepoFresco(user, repo, token, 'categorias.json').catch(() => null),
        _tmLeerJsonRepoFresco(user, repo, token, 'subcategorias.json').catch(() => null),
        _tmShasDeLaRaiz(user, repo, token).catch(() => null),
    ]);
    let _configBase = {};
    if (_cfgRepo && typeof _cfgRepo === 'object' && !Array.isArray(_cfgRepo)) _configBase = _cfgRepo;
    const _configSync = Object.assign({}, _configBase, {
        tasaMN:              parseFloat(localStorage.getItem('tasaMN') || '0') || _configBase.tasaMN || undefined,
        ofertaDiaId:         localStorage.getItem('ofertaDiaId') || undefined,
        ofertaDiaTexto:      localStorage.getItem('ofertaDiaTexto') || undefined,
        ofertaDiaActualizado: localStorage.getItem('ofertaDiaId') ? new Date().toISOString() : undefined,
        firebaseConfig:      localStorage.getItem('firebaseConfig') ? tmParse(localStorage.getItem('firebaseConfig'), null) : _configBase.firebaseConfig,
        // Aquí iba `fcmServerKey`. config.json se publica en un repo público
        // (raw.githubusercontent.com lo sirve a cualquiera) y la Server Key de
        // FCM manda push a todos los clientes del proyecto. Nunca llegó a
        // estar en el fichero —nadie escribía esa clave— pero el camino sí
        // existía: bastaba con que alguien la dejara en localStorage una vez.
        // Un secreto no se cuela en un fichero público por un renglón que
        // nadie usa.
        actualizado:         new Date().toISOString(),
    });
    // Preservar el margen MN configurado (puede ser 0). localStorage manda; si no, se
    // mantiene el que ya venía en config.json.
    const _mLS = parseFloat(localStorage.getItem('margenMN'));
    if (!isNaN(_mLS)) _configSync.margenMN = _mLS;
    // Limpiar claves undefined
    Object.keys(_configSync).forEach(k => _configSync[k] === undefined && delete _configSync[k]);
    /* Las marcas de tiempo solo avanzan si algo cambió de verdad.
       Estampar la hora en cada pulsación hacía que config.json nunca fuera
       igual al del repo, así que la poda de "lo que ya está igual no se
       sube" nunca lo alcanzaba: un PUT, un commit y un despliegue de Pages
       por publicación sin cambiar nada. Y ofertaDiaActualizado decía que la
       oferta del día se había tocado cada vez que se publicaba un precio. */
    if (_cfgRepo && _configBase === _cfgRepo) {
        if (_configSync.ofertaDiaId === _configBase.ofertaDiaId
            && _configSync.ofertaDiaTexto === _configBase.ofertaDiaTexto
            && _configBase.ofertaDiaActualizado) {
            _configSync.ofertaDiaActualizado = _configBase.ofertaDiaActualizado;
        }
        const _sinHora = o => JSON.stringify(Object.assign({}, o, { actualizado: 0 }));
        if (_configBase.actualizado && _sinHora(_configSync) === _sinHora(_configBase)) {
            _configSync.actualizado = _configBase.actualizado;
        }
    }

    // No perder descripciones al subir (el admin trabaja con el catálogo lite).
    // Con el catálogo del repo que ya bajamos arriba: son 425 KB y se estaban
    // descargando dos veces seguidas en cada publicación.
    const _prodRepoArr = Array.isArray(_prodRepo) ? _prodRepo
                       : (_prodRepo && Array.isArray(_prodRepo.productos) ? _prodRepo.productos : null);
    await _tmPreservarDescripciones(_prodRepoArr);

    // Anti-pisado: fusionar con el productos.json del repo para no revertir cambios
    // (p.ej. fotos) hechos desde otra sesión/dispositivo que no están en esta memoria.
    const _prodsFinal = await _tmMergeProductosConRepo(user, repo, _prodRepo);
    try { _tmRegistrarAuditoriaCambios(_prodsFinal); } catch (e) {}
    /* productos-lite.json ya NO se sube desde aquí.
     *
     * Es productos.json sin `descripcion`, y lo único que le ahorra al cliente
     * son 9 KB comprimidos (las descripciones comprimen muy bien). Al gestor le
     * costaba 475 KB de subida en CADA publicación — a 300 kbps, la mitad de
     * los 26 segundos que tardaba el botón desde un móvil.
     *
     * Y encima era trabajo repetido: regenerate-artifacts.yml ya lo regenera
     * en cada push a productos.json, con `scripts/build-productos-lite.py`.
     * Se estaba subiendo medio mega que un workflow reescribía igual minutos
     * después. Ahora ese paso va el PRIMERO del workflow y con su propio push,
     * para que la tienda quede desfasada segundos y no lo que tarde en
     * instalarse Pillow y renderizarse las tarjetas OG. */
    // Anti-pisado: mismo criterio que productos, para no borrar categorías/
    // subcategorías agregadas desde otra sesión/dispositivo al publicar.
    const _catFinal = await _tmMergeCategoriasConRepo(user, repo, _catRepo);
    const _subcatFinal = await _tmMergeSubcategoriasConRepo(user, repo, _subcatRepo);
    /* banners.json y revolico_config.json ya NO se suben desde aquí.
       El panel no tiene editor de Revolico, y los banners los edita la
       pestaña Publicar, que lee y escribe banners.json en el repo sin pasar
       por localStorage. Lo que este botón subía era la copia de la tienda
       en localStorage: vieja si se acababan de publicar banners nuevos (los
       revertía) y [] si la copia no había llegado a bajar (3G que se cae,
       móvil nuevo) — la portada se quedaba sin banners.
       Los grupos sí se editan aquí, pero la copia también llega en segundo
       plano: sin la clave, "no lo tengo" no es "está vacío" y no se sube.
       Si el gestor los borra todos a propósito, la clave existe y vale "[]". */
    const _siLoCargo = (clave, leer) => {
        const v = localStorage.getItem(clave);
        return v === null ? null : leer(v);
    };
    const _gruposLS = _siLoCargo('gruposFB', tmParseArray);
    // Solo lo tocado, no el catálogo entero (ver _tmCambiosParaSubir).
    const _cambios = _tmCambiosParaSubir(_prodsFinal, _tmUltimoRemotoParaAuditoria);
    const archivos = [
        { path: _cambios ? _tmRutaCambios(_cambios) : null, data: _cambios },
        { path: 'categorias.json',             data: _catFinal },
        { path: 'subcategorias.json',          data: _subcatFinal },
        // Sin marca de tiempo: nadie la leía y hacía que el fichero cambiara
        // en cada publicación aunque la lista de grupos fuera la misma.
        { path: 'grupos_facebook_config.json', data: _gruposLS && { grupos: _gruposLS } },
        // comisiones.json eliminado — consolidado en productos.json
        // ventas_historial.json migrado a Firebase — ya no se sube a GitHub
        { path: 'config.json',                 data: _configSync },
    ].filter(a => a.data !== null);

    // Si hay productos modificados: subir productos + lite + config + grupos + categorias (siempre)
    // Si no hay delta: subir todo
    let archivosFiltrados = hayDelta
        ? archivos.filter(a => a.path.startsWith('cambios/') || ['config.json', 'grupos_facebook_config.json', 'categorias.json'].includes(a.path))
        : archivos;

    /* Lo que ya está igual en el repo no se sube.
       Cambiar el precio de UN producto reescribía además categorias.json,
       config.json y grupos_facebook_config.json byte por byte idénticos: tres
       idas y vueltas, tres commits y tres despliegues de Pages que se cancelan
       entre sí para no cambiar nada. El sha del repo ya vino en el listado, así
       que comparar no cuesta ninguna petición. (config.json entra en la poda
       porque su marca de tiempo solo avanza si algo cambió, ver arriba.) */
    let _sinCambio = 0;
    /* config.json se compara por CONTENIDO, no por bytes: el cron de la tasa
       lo escribe desde Python ("tasaMN": 720.0) y aquí sale 720, así que tras
       cada cambio de tasa el sha nunca coincidía aunque el número fuera el
       mismo. Ya lo tenemos leído, así que no cuesta nada. */
    if (_cfgRepo && _configBase === _cfgRepo
        && JSON.stringify(_configSync) === JSON.stringify(_configBase)) {
        const _antes = archivosFiltrados.length;
        archivosFiltrados = archivosFiltrados.filter(a => a.path !== 'config.json');
        _sinCambio += _antes - archivosFiltrados.length;
    }
    if (_shasRaiz) {
        const _quedan = [];
        for (const a of archivosFiltrados) {
            const mio = await _tmShaDeGit(JSON.stringify(a.data, null, 2));
            if (mio && _shasRaiz[a.path] === mio) { _sinCambio++; continue; }
            _quedan.push(a);
        }
        archivosFiltrados = _quedan;
    }
    /* Dejar memoria y localStorage EXACTAMENTE iguales a lo que quedó
       publicado. Lo necesitan los dos finales —el que sube y el que no tenía
       nada que subir—, y con una copia en cada uno la que se queda atrás es
       la del camino que casi nunca se recorre. */
    const _cuadrarMemoria = () => {
        try {
            if (!Array.isArray(_prodsFinal)) return;
            if (typeof window.apReplaceProductos === 'function') {
                window.apReplaceProductos(_prodsFinal.slice());
            } else {
                productos.length = 0; _prodsFinal.forEach(p => productos.push(p));
                localStorage.setItem('productos', JSON.stringify(_prodsFinal));
            }
        } catch (e) {}
    };

    if (!archivosFiltrados.length) {
        /* Todo idéntico a lo que ya está publicado. Decirlo es la respuesta
           correcta: subirlo igual son commits que no cambian nada y un
           despliegue de Pages de propina. */
        actualizarBarra(1, 1, '✅ Ya estaba todo publicado');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }
        setTimeout(() => {
            if (barraContenedor) barraContenedor.style.display = 'none';
            const f = document.getElementById('tmSyncFloat');
            if (f) f.style.display = 'none';
        }, 4000);
        limpiarProductosModificados();
        if (typeof tmActualizarPendientes === 'function') tmActualizarPendientes();
        _cuadrarMemoria();
        _tmSyncPendientes = [];
        mostrarNotificacion('✅ No había nada que publicar: la tienda ya estaba al día.');
        return;
    }

    let ok = 0, errors = [];
    const fallidos = [];   // los archivos concretos que no subieron, para reintentar solo esos
    const subidos  = [];
    const total = archivosFiltrados.length;
    // Subir secuencialmente para evitar conflictos de SHA en GitHub
    for (let i = 0; i < archivosFiltrados.length; i++) {
        const { path, data } = archivosFiltrados[i];
        actualizarBarra(i, total, `Subiendo ${path}… (${i + 1}/${total})`);
        if (btn) btn.textContent = `⏳ ${i + 1}/${total} archivos...`;
        try {
            await subirArchivoAGitHub(user, repo, token, path, data,
                                      _shasRaiz ? (_shasRaiz[path] || null) : undefined);
            ok++; subidos.push(path);
            _tmTrasSubir(path, data);
        } catch (e) {
            errors.push(`${path}: ${e.message}`);
            fallidos.push({ path, data });
        }
    }
    // Guardar lo que falló para poder reintentar SOLO eso desde el botón.
    _tmSyncPendientes = fallidos;
    if (errors.length === 0) {
        actualizarBarra(total, total, '✅ ¡Todo subido correctamente!');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }
        setTimeout(() => {
            if (barraContenedor) barraContenedor.style.display = 'none';
            const f = document.getElementById('tmSyncFloat');
            if (f) f.style.display = 'none';
        }, 4000);
        limpiarProductosModificados();
        if (typeof tmActualizarPendientes === 'function') tmActualizarPendientes();
        // Blindaje: tras limpiar productosModificados, ni un reload ni el catálogo
        // lite pueden "perder" un producto recién agregado ni resucitar uno
        // agotado — la copia local ya es la publicada.
        _cuadrarMemoria();
        _tmPublicarVersionFirebase();
        const info = (hayDelta ? `${idsModificados.length} producto(s) actualizado(s)` : `${ok} archivos`)
                   + (_sinCambio ? `, ${_sinCambio} sin cambios` : '');
        // Con cambios/ la tienda los ve cuando el workflow los aplica y
        // despliega Pages: alrededor de un minuto, no treinta segundos.
        mostrarNotificacion(`✅ Tienda actualizada (${info}). Visible en ~1 minuto.`);
        const _atascados = _tmPendientesAtascados();
        if (_atascados) mostrarNotificacion(`⚠️ Hay ${_atascados} cambio(s) subidos hace más de 15 min que la tienda todavía no muestra. Revisa en GitHub → Actions el workflow "Regenerar páginas".`, 'error');
    } else {
        const primerError = errors[0];
        const causa = primerError.includes(': ') ? primerError.split(': ').slice(1).join(': ').trim() : primerError;
        // Mostrar error en la barra flotante en rojo y mantenerla visible
        actualizarBarra(total, total, '❌ ' + causa);
        const floatText = document.getElementById('tmSyncFloatText');
        const floatBar  = document.getElementById('tmSyncFloatBar');
        if (floatText) { floatText.style.color = '#FF6B35'; floatText.textContent = '❌ ' + causa; }
        if (floatBar)  floatBar.style.background = '#FF6B35';
        if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }
        // Ocultar barra local tras 8s pero no la flotante (hasta que el usuario la vea)
        setTimeout(() => { if (barraContenedor) barraContenedor.style.display = 'none'; }, 8000);
        setTimeout(() => {
            const f = document.getElementById('tmSyncFloat');
            if (f) f.style.display = 'none';
        }, 12000);
        mostrarNotificacion(`❌ Error al subir: ${causa}`, 'error');
        console.error('Errores de sincronización:', errors);
        /* Ya no hay dos catálogos que puedan quedar descompasados: el panel
           sube productos.json y el lite lo deriva CI. Lo que sí hay que decir
           es que si el catálogo no subió, la tienda sigue con lo viejo. */
        if (fallidos.some(f => f.path.startsWith('cambios/'))) {
            mostrarNotificacion('⚠️ El catálogo no subió, así que la tienda sigue mostrando lo anterior. Pulsa "Reintentar".', 'error');
        }
        _tmMostrarBotonReintento(fallidos.map(f => f.path));
    }
    } finally {
        _tmSyncEnCurso = false;
    }
}

async function sincronizarConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {

        return;
    }
    // Auto-sync silencioso: si ya hay una sync en curso, se omite esta vuelta
    // (el próximo ajuste de stock la disparará de nuevo con el estado ya al día).
    if (_tmSyncEnCurso) return;
    _tmSyncEnCurso = true;
    try {
        await _tmPreservarDescripciones();
        const _final = await _tmMergeProductosConRepo(user, repo);
        // Solo lo tocado; regenerate-artifacts.yml lo aplica y rehace el lite.
        const _cambios = _tmCambiosParaSubir(_final, _tmUltimoRemotoParaAuditoria);
        if (!_cambios) return;
        const _ruta = _tmRutaCambios(_cambios);
        await subirArchivoAGitHub(user, repo, token, _ruta, _cambios, null);
        _tmTrasSubir(_ruta, _cambios);
        _tmPublicarVersionFirebase();
    } catch (e) {
        console.warn('⚠️ Error al sincronizar automáticamente:', e.message);
    } finally {
        _tmSyncEnCurso = false;
    }
}

// ── Señal de versión en Firebase para forzar actualización en todos los clientes ──
// Sin proof a propósito: guardarlo dentro de /config no protegía nada. En una
// escritura parcial a un hijo, `newData` en el padre es el MERGE de lo que ya
// hay con lo que llega, así que el proof guardado satisfacía la regla por sí
// solo y cualquiera podía escribir o borrar version sin conocerlo. La regla
// ahora solo exige que el número suba y sea una fecha reciente.
async function _tmPublicarVersionFirebase() {
    const base = _fbRtdbUrl();
    if (!base) return;
    try {
        const res = await fetch(`${base}/config/version.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
        });
        // Antes esto se tragaba cualquier error: fetch no lanza en 4xx, así que
        // el admin veía "tienda actualizada" mientras los clientes no se
        // enteraban de nada. Ahora al menos queda dicho.
        if (!res.ok && typeof mostrarNotificacion === 'function') {
            mostrarNotificacion('⚠️ La tienda se publicó, pero no se pudo avisar a los clientes de que hay versión nueva (' + res.status + '). Verán los cambios cuando les caduque la caché.', 'error');
        }
    } catch(e) {}
}

/* El SHA de TODOS los ficheros de la raíz en UNA petición.
 *
 * La Contents API exige el sha del fichero para reemplazarlo, y se pedía uno
 * por uno: con cinco ficheros eran cinco idas y vueltas antes de subir nada,
 * encadenadas. El listado del directorio devuelve nombre y sha de los 63
 * ficheros de la raíz de una vez, y todo lo que publica el panel está ahí.
 *
 * Si falla, se devuelve null y cada subida vuelve a pedir el suyo como antes:
 * esto acelera, no es de lo que depende que se publique. */
async function _tmShasDeLaRaiz(user, repo, token) {
    try {
        const r = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/?ref=main&_=${Date.now()}`, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
            cache: 'no-store'
        });
        if (!r.ok) return null;
        const lista = await r.json();
        if (!Array.isArray(lista)) return null;
        const mapa = {};
        lista.forEach(f => { if (f && f.type === 'file' && f.name) mapa[f.name] = f.sha; });
        return mapa;
    } catch (e) { return null; }
}

/* El sha que git le daría a este contenido: sha1("blob <bytes>\0" + bytes).
 *
 * Sirve para no subir un fichero que ya está igual en el repo. Cambiar el
 * precio de UN producto reescribía además categorias.json, config.json y
 * grupos_facebook_config.json idénticos a como estaban: tres idas y vueltas,
 * tres commits y tres despliegues de Pages que se cancelan entre sí, para no
 * cambiar nada. Comparar shas no cuesta ninguna petición — el del repo ya
 * vino en el listado de arriba.
 *
 * Si los bytes no coinciden exactamente (otro formateo, un script de Python
 * que escribió el fichero) los shas difieren y se sube: el error cae del lado
 * de subir de más, que no pierde nada. */
async function _tmShaDeGit(texto) {
    try {
        if (!(crypto && crypto.subtle && crypto.subtle.digest)) return null;
        const cuerpo = new TextEncoder().encode(texto);
        const cab = new TextEncoder().encode('blob ' + cuerpo.length + '\0');
        const todo = new Uint8Array(cab.length + cuerpo.length);
        todo.set(cab, 0); todo.set(cuerpo, cab.length);
        const h = await crypto.subtle.digest('SHA-1', todo);
        return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
}

async function subirArchivoAGitHub(user, repo, token, path, data, shaConocido) {
    const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' };
    const jsonStr  = JSON.stringify(data, null, 2);
    const content  = btoa(Array.from(new TextEncoder().encode(jsonStr), b => String.fromCharCode(b)).join(''));

    // Calcular tamaño aproximado en bytes (base64 → bytes originales)
    const sizeBytes = jsonStr.length;
    const apiBase   = `https://api.github.com/repos/${user}/${repo}`;

    // Detectar la rama principal (main o master) automáticamente
    async function obtenerRamaPrincipal() {
        try {
            const res = await fetch(`${apiBase}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.default_branch || 'main';
            }
        } catch (e) {}
        return 'main';
    }

    // Función interna para obtener el SHA del archivo (Contents API)
    // Cache-buster para evitar que GitHub devuelva SHA desactualizado
    async function obtenerSHA() {
        try {
            const res = await fetch(`${apiBase}/contents/${path}?_=${Date.now()}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.sha || null;
            }
            if (res.status === 404) return null;
            return null;
        } catch (e) { return null; }
    }

    // Para archivos < 900KB usar la Contents API normal (más simple)
    if (sizeBytes < 900 * 1024) {
        // El sha puede venir del listado de la raíz (una petición para todos)
        // en vez de pedir uno por fichero. Si viene mal, el reintento de abajo
        // pide el suyo y reintenta, igual que si no hubiéramos traído ninguno.
        let sha = (shaConocido !== undefined) ? shaConocido : await obtenerSHA();
        const body = { message: `Actualización de ${path}`, content };
        if (sha) body.sha = sha;

        let response = await fetch(`${apiBase}/contents/${path}`, {
            method: 'PUT', headers, body: JSON.stringify(body)
        });

        // Reintentar con SHA fresco si hay conflicto (hasta 3 intentos)
        for (let intento = 0; intento < 3 && !response.ok && (response.status === 409 || response.status === 422); intento++) {
            await new Promise(r => setTimeout(r, 800)); // esperar antes de reintentar
            sha = await obtenerSHA();
            const bodyRetry = { message: `Actualización de ${path}`, content };
            if (sha) bodyRetry.sha = sha;
            response = await fetch(`${apiBase}/contents/${path}`, {
                method: 'PUT', headers, body: JSON.stringify(bodyRetry)
            });
        }

        if (!response.ok) {
            // Dar mensajes de error claros según el código HTTP
            if (response.status === 401) {
                throw new Error('Token inválido o expirado. Ve a Config y actualiza tu Token de Acceso.');
            }
            if (response.status === 403) {
                throw new Error('Token sin permisos. Asegúrate de que tenga el permiso "repo" completo.');
            }
            // Para 404 en el PUT: verificar si es el repo o el archivo
            if (response.status === 404) {
                // Comprobar si el repo existe realmente
                const checkRepo = await fetch(`${apiBase}`, { headers });
                if (!checkRepo.ok) {
                    throw new Error(`Repositorio "${user}/${repo}" no encontrado. Verifica usuario y nombre del repo en Config.`);
                }
                // El repo existe pero el archivo no se pudo crear: problema de permisos del token
                throw new Error('Token sin permisos de escritura. Asegúrate de que tenga el permiso "repo" completo (no solo "public_repo").');
            }
            let errMsg = `Error ${response.status} al subir ${path}`;
            try { const err = await response.json(); errMsg = err.message || errMsg; } catch(e) {}
            throw new Error(errMsg);
        }
        return;
    }

    // Para archivos >= 900KB usar el Git Data API (soporta archivos grandes)
    const rama = await obtenerRamaPrincipal();

    // Paso 1: Crear blob con el contenido
    const blobRes = await fetch(`${apiBase}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content, encoding: 'base64' })
    });
    if (!blobRes.ok) {
        const e = await blobRes.json();
        throw new Error(`Error creando blob: ${e.message}`);
    }
    const { sha: blobSha } = await blobRes.json();

    // Paso 2: Obtener el SHA del commit más reciente (HEAD)
    const refRes = await fetch(`${apiBase}/git/ref/heads/${rama}`, { headers });
    if (!refRes.ok) throw new Error(`No se pudo obtener la rama "${rama}"`);
    const { object: { sha: commitSha } } = await refRes.json();

    // Paso 3: Obtener el tree SHA del commit
    const commitRes = await fetch(`${apiBase}/git/commits/${commitSha}`, { headers });
    if (!commitRes.ok) throw new Error('No se pudo obtener el commit');
    const { tree: { sha: treeSha } } = await commitRes.json();

    // Paso 4: Crear nuevo tree con el archivo actualizado
    const newTreeRes = await fetch(`${apiBase}/git/trees`, {
        method: 'POST', headers,
        body: JSON.stringify({
            base_tree: treeSha,
            tree: [{ path, mode: '100644', type: 'blob', sha: blobSha }]
        })
    });
    if (!newTreeRes.ok) throw new Error('Error creando tree');
    const { sha: newTreeSha } = await newTreeRes.json();

    // Paso 5: Crear nuevo commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
        method: 'POST', headers,
        body: JSON.stringify({
            message: `Actualización de ${path}`,
            tree: newTreeSha,
            parents: [commitSha]
        })
    });
    if (!newCommitRes.ok) throw new Error('Error creando commit');
    const { sha: newCommitSha } = await newCommitRes.json();

    // Paso 6: Actualizar referencia HEAD (force:true evita el error "not a fast-forward")
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${rama}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sha: newCommitSha, force: true })
    });
    if (!updateRefRes.ok) {
        const e = await updateRefRes.json();
        throw new Error(`Error actualizando ref: ${e.message}`);
    }
}

