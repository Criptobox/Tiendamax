/* ============================================================
   TiendaMax — módulo: tm-catalog
   Copiar FB/Revolico, publicación, categorías gestión, gestión productos, estado backend, sync GitHub, delta sync
   Extraído de script.src.js (L3472–L4282, 811 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== FUNCIÓN DE COPIAR PARA FACEBOOK Y REVOLICO =====

function copiarParaRevolico(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `
${producto.nombre}

${producto.descripcion}

💰 Precio: $${producto.precioActual} USD
${producto.stock > 0 ? `📦 Stock: ${producto.stock} unidades disponibles` : '❌ Agotado'}

📞 Contacto: +53 54320170
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); }, 500);
    }).catch(() => { 
        window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer');
    });
}

function copiarParaFacebook(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `
🛍️ ${producto.nombre}

${producto.descripcion}

💰 Precio: $${producto.precioActual} USD
${producto.descuento > 0 ? `🔥 ¡OFERTA! (-${producto.descuento}%)` : ''}
${producto.stock > 0 ? `📦 Disponible: ${producto.stock} unidades` : '❌ Agotado'}

📞 Interesado? Contáctame por WhatsApp: +53 54320170

#TiendaMax #VentasCuba #GruposFacebook #Oferta
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Texto copiado para GRUPOS! Ahora pega en tus grupos de Facebook.');
        setTimeout(() => { window.open('https://www.facebook.com/groups/feed/', '_blank', 'noopener,noreferrer'); }, 500);
    }).catch(() => { 
        window.open('https://www.facebook.com/groups/feed/', '_blank', 'noopener,noreferrer');
    });
}

// ===== PUBLICACIÓN EN REVOLICO =====

function prepararPublicacionManual(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    const texto = `${producto.nombre}\n\n${producto.descripcion}\n\nPrecio: ${producto.precioActual} USD\nContacto: +53 54320170`;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); }, 1000);
    }).catch(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); });
}

async function publicarEnRevolico(id) {
    if (typeof copiarYAbrirRevolico === 'function') {
        copiarYAbrirRevolico(id);
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Revolico no está disponible', 'error');
}

async function publicarEnFacebook(id) {
    if (typeof copiarYAbrirFacebook === 'function') {
        copiarYAbrirFacebook(id);
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Facebook no está disponible', 'error');
}

async function publicarAhora() {
    if (typeof mostrarSelectorAsistenteRevolico === 'function') {
        mostrarSelectorAsistenteRevolico();
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Revolico no está disponible', 'error');
}

// ===== CATEGORÍAS (GESTIÓN) =====

function actualizarSelectCategorias() {
    ['productCategory', 'editProductCategory'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const val = select.value;
        select.innerHTML = '';
        categorias.forEach(cat => {
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

    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `categoria-btn ${categoriaSeleccionada === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => filtrarPorCategoria(cat);
        container.appendChild(btn);
    });
}

function filtrarPorCategoria(cat) {
    categoriaSeleccionada = cat;
    actualizarBotonesCategorias();
    renderizarProductos();
    const titulo = document.getElementById('tituloCategoriaActual');
    if (titulo) {
        const icono = obtenerIconoCategoria(cat);
        titulo.textContent = cat === 'Todas' ? '🛍️ Todos los Productos' : `${icono} ${cat}`;
    }
}

function actualizarListaCategorias() {
    const list = document.getElementById('categoryList');
    if (!list) return;

    list.innerHTML = '';

    categorias.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <span>${obtenerIconoCategoria(cat)} ${cat}</span>
            ${cat !== 'General' ? `<button onclick="eliminarCategoria(${index})">🗑️</button>` : ''}
        `;
        list.appendChild(item);
    });
}

function descargarCategoriasJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(categorias, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "categorias.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo categorias.json generado. Súbelo a tu GitHub.');
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
    actualizarListaCategorias();
    renderizarCategoriasHome();
    if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    mostrarNotificacion('✅ Categoría agregada');
}

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
        }).catch(() => {
            mostrarNotificacion('⚠️ Categoría guardada localmente. Sin conexión Firebase — haz clic en Actualizar Tienda para hacerla permanente.', 'info');
        });
    }
}

function eliminarCategoria(index) {
    const nombre = categorias[index];
    if (nombre === 'General') return;
    if (confirm(`¿Eliminar la categoría "${nombre}"?`)) {
        // Eliminar icono personalizado si existe
        if (iconosPersonalizados[nombre]) {
            delete iconosPersonalizados[nombre];
            localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
        }
        
        categorias.splice(index, 1);
        guardarCategorias();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarCategoriasHome();
        renderizarProductos();
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    }
}

// ===== GESTIÓN DE PRODUCTOS (EDITAR/ELIMINAR) =====

function eliminarProducto(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    productos = productos.filter(p => p.id !== id);
    guardarProductos();
    // Una eliminación requiere sincronizar todos los productos
    localStorage.setItem('productosModificados', JSON.stringify(productos.map(p => p.id)));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
    sincronizarConBackend();
    renderizarCategoriasHome();
    renderizarMasVendidos();
    renderizarProductos();
    actualizarListaProductos();
    verificarOfertasYMostrarBanner();
    mostrarNotificacion('🗑️ Producto eliminado', 'info');
}

// ── Estado de la galería en el modal de edición ──────────
let _editImagenesEliminar = new Set();
let _editProductActual = null;

function _renderEditGallery(p) {
    const preview = document.getElementById('currentImagePreview');
    if (!preview) return;
    const imgs = obtenerImagenesProducto(p).filter(u => !_editImagenesEliminar.has(u));
    preview.innerHTML = '';
    if (!imgs.length) {
        const s = document.createElement('span');
        s.style.cssText = 'font-size:12px;color:#888;';
        s.textContent = 'Sin imágenes';
        preview.appendChild(s);
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'admin-gallery-preview';
    imgs.forEach(url => {
        const item = document.createElement('div');
        item.className = 'admin-gallery-item';
        const img = document.createElement('img');
        img.src = url;
        img.onerror = () => { img.style.display = 'none'; };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-gallery-delete';
        btn.title = 'Quitar esta foto';
        btn.textContent = '✕';
        btn.addEventListener('click', () => {
            _editImagenesEliminar.add(url);
            _renderEditGallery(p);
        });
        item.appendChild(img);
        item.appendChild(btn);
        wrap.appendChild(item);
    });
    preview.appendChild(wrap);
}

function _renderEditRecomendados(p) {
    const container = document.getElementById('editRecomendadosList');
    if (!container) return;
    const currentIds = new Set((p.recomendados || []).map(String));
    const others = productos.filter(x => String(x.id) !== String(p.id));
    if (others.length === 0) { container.innerHTML = '<span style="font-size:12px;color:#666">No hay otros productos</span>'; return; }
    container.innerHTML = others.map(x => {
        const checked = currentIds.has(String(x.id));
        return '<label style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,.06);border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap">' +
            '<input type="checkbox" class="tm-rec-check" value="' + safeNum(x.id) + '"' + (checked ? ' checked' : '') + '> ' +
            escapeHtml((x.nombre || '').slice(0, 35)) +
        '</label>';
    }).join('');
}

function abrirEditModal(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('editProductName').value = p.nombre;
    document.getElementById('editProductDescription').value = p.descripcion;
    document.getElementById('editProductPriceActual').value = p.precioActual;
    const _epOrig = document.getElementById('editProductPrecioOriginal');
    if (_epOrig) _epOrig.value = p.precioOriginal > 0 ? p.precioOriginal : '';
    document.getElementById('editProductStock').value = p.stock;
    document.getElementById('editProductCategory').value = p.categoria;

    // Cargar subcategorías del producto al editar
    if (typeof actualizarSelectSubcategorias === 'function') {
        actualizarSelectSubcategorias();
        setTimeout(() => {
            const editSubcat = document.getElementById('editProductSubcategory');
            if (editSubcat && p.subcategoria) editSubcat.value = p.subcategoria;
        }, 50);
    }
    
    // Nuevos campos en edición
    if (document.getElementById('editProductUsado')) document.getElementById('editProductUsado').checked = p.usado || false;
    if (document.getElementById('editProductGarantia')) document.getElementById('editProductGarantia').value = p.garantia || '';
    if (document.getElementById('editProductSpecs')) document.getElementById('editProductSpecs').value = Array.isArray(p.specs) ? p.specs.join(', ') : '';
    if (document.getElementById('editProductDevolucion')) document.getElementById('editProductDevolucion').checked = p.devolucion || false;
    if (document.getElementById('editProductComision')) document.getElementById('editProductComision').value = p.comision || '';
    const _editComMon = p.comisionMoneda || 'USD';
    const _editHidMon = document.getElementById('editProductComisionMoneda');
    if (_editHidMon) _editHidMon.value = _editComMon;
    const _editToggle = document.getElementById('tmMonedaToggleEdit');
    if (_editToggle) _editToggle.querySelectorAll('.tm-moneda-btn').forEach(b => b.classList.toggle('active', b.dataset.moneda === _editComMon));

    const masVendidoSel = document.getElementById('editProductMasVendido');
    if (masVendidoSel) masVendidoSel.value = p.masVendido ? 'true' : 'false';

    // Limpiar estado de fotos de la edición anterior
    _editImagenesEliminar = new Set();
    _editProductActual = p;
    const _fi1 = document.getElementById('editProductImage');
    if (_fi1) _fi1.value = '';
    const _fi2 = document.getElementById('editProductImagesExtra');
    if (_fi2) _fi2.value = '';
    _renderEditGallery(p);
    _renderEditRecomendados(p);

    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
}

function cerrarEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
}

async function guardarProductoEditado(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    if (index === -1) return;

    const masVendidoSel = document.getElementById('editProductMasVendido');
    const fileInput = document.getElementById('editProductImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    try {
        let nuevaImagen = null;
        if (file) {
            mostrarNotificacion('⏳ Subiendo imagen principal...', 'info');
            nuevaImagen = await subirImagenAGitHub(file);
        }
        const extrasNuevas = await subirMultiplesImagenes('editProductImagesExtra');
        const imagenPrincipal = nuevaImagen || productos[index].imagen;
        // Excluir fotos marcadas para eliminar en el modal
        const anteriores = obtenerImagenesProducto(productos[index]).filter(u => !_editImagenesEliminar.has(u));
        const imagenes = _tmDedupImagenes([
            imagenPrincipal,
            ...anteriores.filter(url => url !== productos[index].imagen && url !== imagenPrincipal),
            ...extrasNuevas
        ]);

        const productoActualizado = {
            ...productos[index],
            nombre: document.getElementById('editProductName').value.trim(),
            descripcion: document.getElementById('editProductDescription').value.trim(),
            precioActual: parseFloat(document.getElementById('editProductPriceActual').value) || 0,
            precioOriginal: parseFloat(document.getElementById('editProductPrecioOriginal')?.value) || 0,
            descuento: 0,
            stock: parseInt(document.getElementById('editProductStock').value) || 0,
            categoria: document.getElementById('editProductCategory').value,
            subcategoria: (document.getElementById('editProductSubcategory') && document.getElementById('editProductSubcategory').value) ? document.getElementById('editProductSubcategory').value : (productos[index].subcategoria || ''),
            masVendido: masVendidoSel ? masVendidoSel.value === 'true' : productos[index].masVendido,
            imagen: imagenPrincipal,
            imagenes: imagenes,
            usado: document.getElementById('editProductUsado') ? document.getElementById('editProductUsado').checked : productos[index].usado,
            garantia: document.getElementById('editProductGarantia') ? document.getElementById('editProductGarantia').value.trim() : productos[index].garantia,
            specs: (() => {
                const raw = (document.getElementById('editProductSpecs')?.value || '').trim();
                if (!raw) return [];
                return raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
            })(),
            devolucion: document.getElementById('editProductDevolucion') ? document.getElementById('editProductDevolucion').checked : productos[index].devolucion,
            comision: document.getElementById('editProductComision') ? parseFloat(document.getElementById('editProductComision').value) || 0 : productos[index].comision || 0,
            comisionMoneda: document.getElementById('editProductComisionMoneda')?.value || productos[index].comisionMoneda || 'USD',
            recomendados: Array.from(document.querySelectorAll('#editRecomendadosList .tm-rec-check:checked')).map(cb => parseInt(cb.value))
        };

        const errores = validarProducto(productoActualizado);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos[index] = productoActualizado;
        guardarProductos();
        marcarProductoModificado(productoActualizado.id);
        sincronizarConGitHub();
        cerrarEditModal();
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('✅ Producto actualizado');
    } catch (e) {
        console.error('Error actualizando producto:', e);
        mostrarNotificacion('❌ Error actualizando imágenes: ' + (e.message || e), 'error');
    }
}

// ===== ESTADO DEL BACKEND =====

async function verificarEstadoBackend() {
    const statusEl = document.getElementById('backendStatus');
    if (!statusEl) return;
    statusEl.innerHTML = '🟠 <strong>Modo manual activo</strong> · Publicación asistida desde el navegador · Sin dependencia de backend roto';
    statusEl.style.color = '#F39C12';
}

async function cargarEstadoPublicacion() {
    const logContainer = document.getElementById('historialPublicaciones');
    if (!logContainer) return;
    logContainer.innerHTML = '<p style="font-size:13px;color:#666;">Modo manual activo. No existe historial automático porque este repo no incluye backend de publicación.</p>';
}

// ===== SINCRONIZACIÓN CON GITHUB =====

function cargarConfiguracionGitHub() {
    document.getElementById('githubUser').value = localStorage.getItem('githubUser') || '';
    document.getElementById('githubRepo').value = localStorage.getItem('githubRepo') || 'Tiendamax';
    document.getElementById('githubToken').value = localStorage.getItem('githubToken') || '';
    
    const fbConfig = localStorage.getItem('firebaseConfig');
    if (fbConfig) {
        try {
            document.getElementById('firebaseConfigJson').value = JSON.stringify(JSON.parse(fbConfig), null, 2);
        } catch(e) {
            document.getElementById('firebaseConfigJson').value = fbConfig;
        }
    } else {
        document.getElementById('firebaseConfigJson').value = '';
    }
    document.getElementById('firebaseVapidKey').value = localStorage.getItem('firebaseVapidKey') || '';
    document.getElementById('firebaseServerKey').value = localStorage.getItem('fcmServerKey') || '';
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
    localStorage.setItem('ultimaSincronizacion', Date.now().toString());
}

function obtenerProductosModificados() {
    return tmParseArray(localStorage.getItem('productosModificados'));
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

    // Construir config.json con tasa + oferta del día para que todos los clientes la vean
    const _configSync = {
        tasaMN:              parseFloat(localStorage.getItem('tasaMN') || '0') || undefined,
        ofertaDiaId:         localStorage.getItem('ofertaDiaId') || undefined,
        ofertaDiaTexto:      localStorage.getItem('ofertaDiaTexto') || undefined,
        ofertaDiaActualizado: localStorage.getItem('ofertaDiaId') ? new Date().toISOString() : undefined,
        firebaseConfig:      localStorage.getItem('firebaseConfig') ? tmParse(localStorage.getItem('firebaseConfig'), null) : undefined,
        fcmServerKey:        localStorage.getItem('fcmServerKey') || undefined,
        actualizado:         new Date().toISOString(),
    };
    // Limpiar claves undefined
    Object.keys(_configSync).forEach(k => _configSync[k] === undefined && delete _configSync[k]);

    const _productosLite = productos.map(p => { const { descripcion, ...r } = p; return r; });
    const archivos = [
        { path: 'productos.json',              data: productos },
        { path: 'productos-lite.json',         data: _productosLite },
        { path: 'categorias.json',             data: { nombres: categorias, iconos: iconosPersonalizados } },
        { path: 'subcategorias.json',          data: tmParseObject(localStorage.getItem('subcategorias')) },
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
    const total = archivosFiltrados.length;
    // Subir secuencialmente para evitar conflictos de SHA en GitHub
    for (let i = 0; i < archivosFiltrados.length; i++) {
        const { path, data } = archivosFiltrados[i];
        actualizarBarra(i, total, `Subiendo ${path}… (${i + 1}/${total})`);
        if (btn) btn.textContent = `⏳ ${i + 1}/${total} archivos...`;
        try {
            await subirArchivoAGitHub(user, repo, token, path, data);
            ok++;
        } catch (e) {
            errors.push(`${path}: ${e.message}`);
        }
    }
    if (errors.length === 0) {
        actualizarBarra(total, total, '✅ ¡Todo subido correctamente!');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }
        setTimeout(() => {
            if (barraContenedor) barraContenedor.style.display = 'none';
            const f = document.getElementById('tmSyncFloat');
            if (f) f.style.display = 'none';
        }, 4000);
        limpiarProductosModificados();
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
    }
}

async function sincronizarConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {

        return;
    }
    try {
        const _lite = productos.map(p => { const { descripcion, ...r } = p; return r; });
        await subirArchivoAGitHub(user, repo, token, 'productos.json', productos);
        await subirArchivoAGitHub(user, repo, token, 'productos-lite.json', _lite);
        _tmPublicarVersionFirebase();
    } catch (e) {
        console.warn('⚠️ Error al sincronizar automáticamente:', e.message);
    }
}

// ── Señal de versión en Firebase para forzar actualización en todos los clientes ──
async function _tmPublicarVersionFirebase() {
    const base = _tmRtdbUrl();
    if (!base) return;
    try {
        await fetch(`${base}/config/version.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
        });
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

