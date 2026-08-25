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
    // Cambiar de categoría también cambia sus subcategorías. Sin esto los chips
    // de subcategoría se quedaban en los de la categoría ANTERIOR —en WIFI
    // salían HERRAMIENTAS, DEPORTES, HOGAR…, que son de UTILES— y el conteo
    // con ellos, porque renderizarSubcategoriaTabs() es quien llama a
    // actualizarCategoriaStats(). Además hay que soltar la subcategoría
    // elegida ANTES de repintar: si no, la parrilla filtra por una que en la
    // categoría nueva no existe y sale vacía.
    if (typeof subcategoriaSeleccionada !== 'undefined') subcategoriaSeleccionada = 'Todas';
    actualizarBotonesCategorias();
    if (typeof renderizarSubcategoriaTabs === 'function') renderizarSubcategoriaTabs();
    renderizarProductos();
    const titulo = document.getElementById('tituloCategoriaActual');
    if (titulo) {
        const icono = obtenerIconoCategoria(cat);
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
        subirArchivoAGitHub(user, repo, token, 'categorias.json', { nombres: categorias, iconos: iconosPersonalizados }).catch(() => {});
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
    localStorage.setItem('githubUser', document.getElementById('githubUser').value.trim());
    localStorage.setItem('githubRepo', document.getElementById('githubRepo').value.trim());
    localStorage.setItem('githubToken', document.getElementById('githubToken').value.trim());
    mostrarNotificacion('✅ Configuración de GitHub guardada localmente');
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

async function _tmMergeProductosConRepo(user, repo) {
    let remoto = null;
    const _j = await _tmLeerJsonRepoFresco(user, repo, localStorage.getItem('githubToken'), 'productos.json');
    if (Array.isArray(_j)) remoto = _j; else if (_j && Array.isArray(_j.productos)) remoto = _j.productos;
    if (!Array.isArray(remoto)) return productos.slice();
    _tmUltimoRemotoParaAuditoria = remoto;

    const mods = new Set(obtenerProductosModificados().map(String));
    const del  = new Set(obtenerProductosEliminados().map(String));
    const memIds = new Set(productos.map(p => String(p.id)));
    const remotoById = {};
    remoto.forEach(p => { if (p && p.id != null) remotoById[String(p.id)] = p; });

    // Empezar por lo que el admin ve; no-modificados toman la versión del repo.
    const merged = productos.map(p => {
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
async function _tmMergeCategoriasConRepo(user, repo) {
    const local = { nombres: (categorias || []).slice(), iconos: Object.assign({}, iconosPersonalizados || {}) };
    let remoto = null;
    const _j = await _tmLeerJsonRepoFresco(user, repo, localStorage.getItem('githubToken'), 'categorias.json');
    if (_j && Array.isArray(_j.nombres)) remoto = _j;
    if (!remoto) return local;

    const eliminadas = new Set(tmParseArray(localStorage.getItem('categoriasEliminadas')));
    const nombres = local.nombres.slice();
    remoto.nombres.forEach(n => { if (!nombres.includes(n) && !eliminadas.has(n)) nombres.push(n); });
    const iconos = Object.assign({}, remoto.iconos || {}, local.iconos);
    return { nombres, iconos };
}

// ── Anti-pisado: igual que la de categorías, pero para subcategorias.json
// ({ CATEGORIA: [sub, sub...] }). Fusiona por categoría, unión de subcategorías.
async function _tmMergeSubcategoriasConRepo(user, repo) {
    const local = tmParseObject(localStorage.getItem('subcategorias'));
    let remoto = null;
    const _j = await _tmLeerJsonRepoFresco(user, repo, localStorage.getItem('githubToken'), 'subcategorias.json');
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
async function _tmPreservarDescripciones() {
    try {
        if (!Array.isArray(productos) || !productos.some(p => !p.descripcion)) return;
        const res = await fetch('productos.json?_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const full = await res.json();
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
        try { await subirArchivoAGitHub(user, repo, token, item.path, item.data); }
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
    let _configBase = {};
    try {
        const _cfg = await _tmLeerJsonRepoFresco(user, repo, token, 'config.json');
        if (_cfg && typeof _cfg === 'object' && !Array.isArray(_cfg)) _configBase = _cfg;
    } catch (e) {}
    const _configSync = Object.assign({}, _configBase, {
        tasaMN:              parseFloat(localStorage.getItem('tasaMN') || '0') || _configBase.tasaMN || undefined,
        ofertaDiaId:         localStorage.getItem('ofertaDiaId') || undefined,
        ofertaDiaTexto:      localStorage.getItem('ofertaDiaTexto') || undefined,
        ofertaDiaActualizado: localStorage.getItem('ofertaDiaId') ? new Date().toISOString() : undefined,
        firebaseConfig:      localStorage.getItem('firebaseConfig') ? tmParse(localStorage.getItem('firebaseConfig'), null) : _configBase.firebaseConfig,
        fcmServerKey:        localStorage.getItem('fcmServerKey') || _configBase.fcmServerKey || undefined,
        actualizado:         new Date().toISOString(),
    });
    // Preservar el margen MN configurado (puede ser 0). localStorage manda; si no, se
    // mantiene el que ya venía en config.json.
    const _mLS = parseFloat(localStorage.getItem('margenMN'));
    if (!isNaN(_mLS)) _configSync.margenMN = _mLS;
    // Limpiar claves undefined
    Object.keys(_configSync).forEach(k => _configSync[k] === undefined && delete _configSync[k]);

    // No perder descripciones al subir (el admin trabaja con el catálogo lite).
    await _tmPreservarDescripciones();

    // Anti-pisado: fusionar con el productos.json del repo para no revertir cambios
    // (p.ej. fotos) hechos desde otra sesión/dispositivo que no están en esta memoria.
    const _prodsFinal = await _tmMergeProductosConRepo(user, repo);
    try { _tmRegistrarAuditoriaCambios(_prodsFinal); } catch (e) {}
    const _productosLite = _prodsFinal.map(p => { const { descripcion, ...r } = p; return r; });
    // Anti-pisado: mismo criterio que productos, para no borrar categorías/
    // subcategorías agregadas desde otra sesión/dispositivo al publicar.
    const _catFinal = await _tmMergeCategoriasConRepo(user, repo);
    const _subcatFinal = await _tmMergeSubcategoriasConRepo(user, repo);
    const archivos = [
        { path: 'productos.json',              data: _prodsFinal },
        { path: 'productos-lite.json',         data: _productosLite },
        { path: 'categorias.json',             data: _catFinal },
        { path: 'subcategorias.json',          data: _subcatFinal },
        { path: 'grupos_facebook_config.json', data: { grupos: tmParseArray(localStorage.getItem('gruposFB')), exportado: new Date().toISOString() } },
        { path: 'revolico_config.json',        data: tmParseObject(localStorage.getItem('revolicoConfig')) },
        { path: 'banners.json',                data: tmParseArray(localStorage.getItem('heroBanners')) },
        // comisiones.json eliminado — consolidado en productos.json
        // ventas_historial.json migrado a Firebase — ya no se sube a GitHub
        { path: 'config.json',                 data: _configSync },
    ];

    // Si hay productos modificados: subir productos + lite + config + grupos + categorias (siempre)
    // Si no hay delta: subir todo
    const archivosFiltrados = hayDelta
        ? archivos.filter(a => ['productos.json', 'productos-lite.json', 'config.json', 'grupos_facebook_config.json', 'categorias.json'].includes(a.path))
        : archivos;

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
            await subirArchivoAGitHub(user, repo, token, path, data);
            ok++; subidos.push(path);
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
        // Blindaje: dejar la memoria y el localStorage EXACTAMENTE iguales a lo que
        // quedó publicado (_prodsFinal). Así, tras limpiar productosModificados, ni un
        // reload ni el catálogo lite pueden "perder" un producto recién agregado ni
        // resucitar uno agotado — la copia local ya es la publicada.
        try {
            if (Array.isArray(_prodsFinal)) {
                if (typeof window.apReplaceProductos === 'function') {
                    window.apReplaceProductos(_prodsFinal.slice());
                } else {
                    productos.length = 0; _prodsFinal.forEach(p => productos.push(p));
                    localStorage.setItem('productos', JSON.stringify(_prodsFinal));
                }
            }
        } catch (e) {}
        _tmPublicarVersionFirebase();
        const info = hayDelta ? `${idsModificados.length} producto(s) actualizado(s)` : `${ok} archivos`;
        mostrarNotificacion(`✅ Tienda actualizada (${info}). Visible en ~30 segundos.`);
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
        // Aviso explícito de estado inconsistente: la tienda pública lee
        // productos-lite.json. Si uno de los dos catálogos subió y el otro no,
        // los visitantes ven una versión y el admin otra, y hasta ahora eso no
        // se decía en ninguna parte.
        const _catalogos = ['productos.json', 'productos-lite.json'];
        const _mitad = _catalogos.filter(p => subidos.includes(p)).length === 1;
        if (_mitad) {
            mostrarNotificacion('⚠️ Quedó a medias: uno de los dos catálogos subió y el otro no, así que la tienda puede mostrar datos viejos. Pulsa "Reintentar" para completarlo.', 'error');
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
        const _lite = _final.map(p => { const { descripcion, ...r } = p; return r; });
        await subirArchivoAGitHub(user, repo, token, 'productos.json', _final);
        await subirArchivoAGitHub(user, repo, token, 'productos-lite.json', _lite);
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

async function subirArchivoAGitHub(user, repo, token, path, data) {
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
        let sha = await obtenerSHA();
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

