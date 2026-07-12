/* ============================================================
   TiendaMax — módulo: tm-product
   Compresión imágenes, render productos, galería, detalle producto
   Extraído de script.src.js (L2785–L3471, 687 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== COMPRESIÓN DE IMÁGENES =====
// Comprime una imagen (File o base64) a máximo ~40KB manteniendo buena calidad visual
function comprimirImagen(source, maxKB = 25, maxWidth = 480, maxHeight = 480) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width  = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            let quality = 0.82;
            // Intentar WebP primero (mejor compresión)
            let result = canvas.toDataURL('image/webp', quality);
            // Si el navegador no soporta WebP, devuelve PNG — detectarlo
            const supportsWebP = result.startsWith('data:image/webp');
            const fmt = supportsWebP ? 'image/webp' : 'image/jpeg';
            if (!supportsWebP) result = canvas.toDataURL(fmt, quality);
            // Reducir calidad hasta entrar en maxKB
            while (result.length > maxKB * 1024 * 1.37 && quality > 0.2) {
                quality -= 0.06;
                result = canvas.toDataURL(fmt, quality);
            }
            resolve(result);
        };

        img.onerror = () => resolve(source);

        if (typeof source === 'string') {
            img.src = source;
        } else {
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(source);
        }
    });
}

function descargarProductosJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(productos, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "productos.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo productos.json generado. Súbelo a tu GitHub.');
}

async function sincronizarConBackend() {
    // Backend eliminado en esta versión del repo.
    // Dejamos esta función como no-op para evitar errores y mantener compatibilidad.
    return false;
}

// ===== RENDERIZAR PRODUCTOS =====


let productosVisibleCount = 20;

function renderizarProductos(isLoadMore = false) {
    if (!isLoadMore) {
        productosVisibleCount = 20;
    }
    const productosGrid = document.getElementById('productosGrid');
    if (!productosGrid) return;

    let productosFiltrados = (categoriaSeleccionada === 'Todas' 
        ? productos 
        : productos.filter(p => p.categoria === categoriaSeleccionada))
        .slice().sort((a, b) => {
            const aAgotado = a.stock === 0 ? 1 : 0;
            const bAgotado = b.stock === 0 ? 1 : 0;
            return aAgotado - bAgotado;
        });

    // Filtrar por subcategoría si hay una seleccionada (y no es 'Todas')
    if (categoriaSeleccionada !== 'Todas' && subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
        productosFiltrados = productosFiltrados.filter(p => p.subcategoria === subcategoriaSeleccionada);
    }

    // Filtro de búsqueda hero, precio, stock y orden
    if (_heroSearchActivo || _heroPrecioMin > 0 || _heroPrecioMax < Infinity) {
        const q = _heroSearchActivo;
        productosFiltrados = productosFiltrados.filter(p => {
            const matchQ = !q || p.nombre.toLowerCase().includes(q) ||
                (p.descripcion||'').toLowerCase().includes(q) ||
                (p.categoria||'').toLowerCase().includes(q);
            const matchP = p.precioActual >= _heroPrecioMin && p.precioActual <= _heroPrecioMax;
            return matchQ && matchP;
        });
    }
    if (_heroSoloConStock) productosFiltrados = productosFiltrados.filter(p => safeNum(p.stock) > 0);
    if (_heroOrden === 'precio_asc')  productosFiltrados.sort((a,b) => safeNum(a.precioActual) - safeNum(b.precioActual));
    else if (_heroOrden === 'precio_desc') productosFiltrados.sort((a,b) => safeNum(b.precioActual) - safeNum(a.precioActual));
    else if (_heroOrden === 'az')     productosFiltrados.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));

    productosGrid.innerHTML = '';

    if (productosFiltrados.length === 0) {
        // Mensaje contextual según la situación real
        let mensaje;
        if (!Array.isArray(productos) || productos.length === 0) {
            mensaje = '⏳ Cargando productos... Si esto persiste, recarga la página.';
        } else if (subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
            mensaje = 'No hay productos en esta subcategoría aún.';
        } else if (_heroSearchActivo) {
            mensaje = 'No hay productos que coincidan con tu búsqueda.';
        } else {
            mensaje = 'No hay productos en esta categoría aún.';
        }
        productosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 60px 20px; font-size:15px;">' + escapeHtml(mensaje) + '</p>';
        return;
    }

    const productosAMostrar = productosFiltrados.slice(0, productosVisibleCount);

    productosAMostrar.forEach(producto => {
        const card = document.createElement('div');
        const _stock  = safeNum(producto.stock);
        const _esAgotado = _stock === 0;
        card.className = 'producto-card pcard-v2' + (_esAgotado ? ' card-agotado' : '');
        card.dataset.productId = String(producto.id);
        card.onclick = () => abrirDetalleProducto(producto.id);
        const _nombre = escapeHtml(producto.nombre);
        const _img    = escapeAttr(producto.imagen);
        const _id     = safeNum(producto.id);
        const _cat    = escapeHtml(producto.categoria || '');
        const _tieneDesc = producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual;
        const _pctDesc = _tieneDesc ? Math.round((1 - producto.precioActual/producto.precioOriginal) * 100) : 0;
        const _precioTxt = typeof formatPrecio === 'function'
            ? formatPrecio(producto.precioActual)
            : '$' + Number(producto.precioActual||0).toFixed(2) + ' USD';
        // separa el importe de "USD" para dar acento tipográfico
        const _precioMatch = String(_precioTxt).match(/^(.*?)(\s*USD)?$/i);
        const _precioNum = _precioMatch ? _precioMatch[1].trim() : _precioTxt;
        const _precioCur = /USD/i.test(_precioTxt) ? '<span class="pv2-cur">USD</span>' : '';
        const _estado = _esAgotado
            ? '<div class="pv2-status agotado">⛔ <b>Agotado</b> · te aviso cuando llegue</div>'
            : (producto.masVendido
                ? '<div class="pv2-status">🔥 Destacado · <b>En stock</b></div>'
                : '<div class="pv2-status">✓ <b>En stock</b></div>');
        const _pedirBtn = _esAgotado
            ? '<button class="btn-pedir-card pv2-aviso" type="button" onclick="event.stopPropagation();abrirDetalleProducto(' + _id + ')">🔔 Avísame</button>'
            : '<button class="btn-pedir-card pv2-pedir" onclick="event.stopPropagation();tmComprar(event,' + _id + ',this.dataset.nombre)" data-nombre="' + _nombre + '" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>';
        card.innerHTML = `
            <div class="pv2-photo">
                <img src="${_img}" alt="${_nombre}" loading="lazy" onerror="this.style.display='none'">
            </div>
            <div class="pv2-veil"></div>
            <div class="pv2-top">
                ${_tieneDesc ? `<span class="pv2-disc">-${_pctDesc}%</span>` : ''}
                ${producto.masVendido ? '<span class="pv2-hot"><i>●</i> Más vendido</span>' : ''}
            </div>
            <div class="pv2-body">
                ${_cat ? `<span class="pv2-cat">${_cat}</span>` : ''}
                <h3>${_nombre}</h3>
                ${_estado}
                ${typeof renderCountdownHtml === 'function' ? renderCountdownHtml(_id) : ''}
                <div class="pv2-foot">
                    <div class="pv2-price">
                        ${_tieneDesc ? `<span class="pv2-old">$${Number(producto.precioOriginal).toFixed(0)}</span>` : ''}
                        <span class="precio-actual" data-usd="${safeNum(producto.precioActual)}">${_precioNum}${_precioCur}</span>
                        <span class="pv2-tax">Impuestos incluidos</span>
                    </div>
                    ${_pedirBtn}
                </div>
                <span class="stock-count">${_esAgotado ? 0 : _stock}</span>
            </div>
        `;
        productosGrid.appendChild(card);
        if (window._tmAnimObs) window._tmAnimObs.observe(card);
    });

    if (productosFiltrados.length > productosVisibleCount) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:28px;padding:0 16px';
        const restantes = productosFiltrados.length - productosVisibleCount;
        loadMoreBtn.innerHTML = `
            <p style="color:rgba(255,255,255,0.35);font-size:12px;letter-spacing:.5px;text-transform:uppercase">
                Mostrando ${Math.min(productosVisibleCount, productosFiltrados.length)} de ${productosFiltrados.length} productos
            </p>
            <button class="btn-seguir-viendo">
                👁️ Seguir viendo <span style="background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:20px;font-size:11px;margin-left:4px">${restantes} más</span>
            </button>`;
        loadMoreBtn.querySelector('.btn-seguir-viendo').onclick = () => {
            productosVisibleCount += 20;
            renderizarProductos(true);
        };
        productosGrid.appendChild(loadMoreBtn);
    }
}



// ===== GALERÍA DE PRODUCTO =====
function _tmDedupImagenes(arr) {
    const out = [];
    (arr || []).forEach(u => {
        u = (u || '').trim();
        if (u && !out.includes(u)) out.push(u);
    });
    return out;
}

function obtenerImagenesProducto(producto) {
    if (!producto) return [];
    return _tmDedupImagenes([
        producto.imagen,
        ...(Array.isArray(producto.imagenes) ? producto.imagenes : []),
        producto.imagenSecundaria
    ]);
}

async function subirMultiplesImagenes(inputId) {
    const input = document.getElementById(inputId);
    const files = input && input.files ? Array.from(input.files).filter(Boolean) : [];
    if (!files.length) return [];
    const urls = [];
    for (let i = 0; i < files.length; i++) {
        mostrarNotificacion('⏳ Subiendo foto ' + (i + 1) + ' de ' + files.length + '...', 'info');
        urls.push(await subirImagenAGitHub(files[i]));
    }
    return urls.filter(Boolean);
}

function renderizarGaleriaDetalle(producto) {
    const thumbs = document.getElementById('detailGalleryThumbs');
    const img = document.getElementById('detailProductImage');
    const counter = document.getElementById('detailPhotoCounter');
    if (!thumbs || !img) return;
    const imagenes = obtenerImagenesProducto(producto);

    if (counter) {
        if (imagenes.length > 1) {
            counter.textContent = '1 / ' + imagenes.length;
            counter.style.display = 'block';
        } else {
            counter.style.display = 'none';
        }
    }

    if (imagenes.length <= 1) {
        thumbs.style.display = 'none';
        thumbs.innerHTML = '';
        return;
    }
    thumbs.style.display = 'flex';
    thumbs.innerHTML = imagenes.map((url, i) =>
        '<button type="button" class="detail-gallery-thumb' + (i === 0 ? ' active' : '') + '" data-img="' + escapeAttr(url) + '" data-idx="' + i + '" aria-label="Ver imagen ' + (i + 1) + '">' +
            '<img src="' + escapeAttr(url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
        '</button>'
    ).join('');
    thumbs.querySelectorAll('.detail-gallery-thumb').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const url = this.getAttribute('data-img');
            if (!url) return;
            img.src = url;
            _resetZoomPan(img);
            thumbs.querySelectorAll('.detail-gallery-thumb').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            if (counter) counter.textContent = (parseInt(this.getAttribute('data-idx'), 10) + 1) + ' / ' + imagenes.length;
        });
    });
    _initSwipeGaleria(img);
}

// ===== DETALLE DE PRODUCTO =====

// Producto actualmente abierto en el modal
let _detalleProductoActual = null;
// Cantidad elegida en el modal de detalle (aplica a carrito y a Pedir por WhatsApp)
let _detalleCantidad = 1;
let _detalleMaxStock = 1;

// Actualiza el número mostrado en el stepper del modal, respetando 1..stock
function detalleQtyDelta(delta) {
    const nueva = Math.max(1, Math.min(_detalleCantidad + delta, _detalleMaxStock));
    _detalleCantidad = nueva;
    const val = document.getElementById('detailQtyValue');
    if (val) val.textContent = String(nueva);
    const menos = document.querySelector('#detailQtyRow .detail-qty-stepper button:first-child');
    const mas   = document.querySelector('#detailQtyRow .detail-qty-stepper button:last-child');
    if (menos) menos.disabled = nueva <= 1;
    if (mas)   mas.disabled   = nueva >= _detalleMaxStock;
}

// Corazón de favoritos del modal (reusa la wishlist existente)
function detalleToggleFav(ev) {
    if (ev) ev.stopPropagation();
    const p = _detalleProductoActual;
    if (!p) return;
    if (typeof toggleMeGusta === 'function') {
        toggleMeGusta(p.id, ev);
    }
    const favBtn = document.getElementById('detailFavBtn');
    if (favBtn) {
        const liked = (typeof wishlist !== 'undefined' && Array.isArray(wishlist)) && wishlist.includes(String(p.id));
        favBtn.textContent = liked ? '❤️' : '🤍';
        favBtn.classList.toggle('liked', liked);
    }
}

function abrirDetalleProducto(id) {
    
    const p = productos.find(prod => prod.id === id);
    if (!p) {
        console.warn('Producto no encontrado:', id);
        return;
    }
    
    if (typeof tmTrackVista === 'function') tmTrackVista(id); // 📊 Analytics
    if (typeof actualizarVisibilidadBannerOferta === 'function') actualizarVisibilidadBannerOferta(false);
    _detalleProductoActual = p;
    // Deep link: actualizar URL sin recargar
    // pushState para que el botón "Atrás" cierre el modal en lugar de salir del sitio
    if (location.hash !== '#producto-' + id) {
        history.pushState({ modalProducto: id }, '', '#producto-' + id);
    }
    
    // SEO dinámico: actualizar meta tags para este producto
    if (typeof actualizarSEOPorProducto === 'function') {
        actualizarSEOPorProducto(p);
    }

    // Nombre
    document.getElementById('detailProductName').textContent = p.nombre;

    // Imagen + galería (reset zoom)
    const img = document.getElementById('detailProductImage');
    const _imagenesDetalle = obtenerImagenesProducto(p);
    img.src = _imagenesDetalle[0] || p.imagen || '';
    img.alt = p.nombre;
    _resetZoomPan(img);
    renderizarGaleriaDetalle(p);

    // Categoría y subcategoría
    document.getElementById('detailProductCategory').textContent =
        obtenerIconoCategoria(p.categoria) + ' ' + p.categoria;
    const subEl = document.getElementById('detailSubcategoria');
    if (p.subcategoria && p.subcategoria !== 'Todas') {
        subEl.textContent = '↳ ' + p.subcategoria;
        subEl.style.display = 'block';
    } else {
        subEl.style.display = 'none';
    }

    // Agotado: sin badges de hype (ni descuento ni destacado)
    const _agotadoModal = safeNum(p.stock) === 0;

    // Descuento badge
    const badge = document.getElementById('detailProductBadge');
    const _hasPrecioOrig = p.precioOriginal > 0 && parseFloat(p.precioOriginal) > parseFloat(p.precioActual);
    badge.style.display = (_hasPrecioOrig && !_agotadoModal) ? 'inline-block' : 'none';
    if (_hasPrecioOrig) badge.textContent = `-$${(parseFloat(p.precioOriginal) - parseFloat(p.precioActual)).toFixed(0)}`;

    // Más vendido badge (solo si hay stock)
    const hotBadge = document.getElementById('detailMasVendidoBadge');
    hotBadge.style.display = ((p.masVendido === true || p.masVendido === 'true') && !_agotadoModal) ? 'block' : 'none';

    // Badge "recién llegado" — mismo criterio que las cards (esProductoNuevo, 7 días)
    const nuevoBadgeEl = document.getElementById('detailNuevoBadge');
    if (nuevoBadgeEl) {
        const _esNuevo = (typeof esProductoNuevo === 'function') && esProductoNuevo(p) && !_agotadoModal;
        nuevoBadgeEl.style.display = _esNuevo ? 'inline-flex' : 'none';
    }

    // Precio
    const precioOriginal = p.descuento > 0
        ? (p.precioActual / (1 - p.descuento / 100))
        : null;
    // NOTA: el bloque que actualiza #detailPriceOriginal está abajo (después de
    // este comentario) y siempre gana. El cálculo de precioOriginal se mantiene
    // por si descuento > 0 (para badge "Ahorras $X"). El antiguo bloque que
    // escribía aquí en #detailPriceOriginal se eliminó (era código muerto).
    // Precio en modal con tachado real
const _detailPrecioEl = document.getElementById('detailPriceActual');
const _detailPrecioOldEl = document.getElementById('detailPriceOriginal');
const _detailPrecioMNEl = document.getElementById('detailPriceMN');
// USD siempre visible en el modal
if (_detailPrecioEl) _detailPrecioEl.textContent = `$${Number(p.precioActual||0).toFixed(2)} USD`;
if (_detailPrecioOldEl) {
    if (p.precioOriginal > 0 && parseFloat(p.precioOriginal) > parseFloat(p.precioActual)) {
        _detailPrecioOldEl.textContent = `$${parseFloat(p.precioOriginal).toFixed(2)} USD`;
        _detailPrecioOldEl.style.display = 'inline';
    } else {
        _detailPrecioOldEl.style.display = 'none';
    }
}
// Equivalente MN dinámico
if (_detailPrecioMNEl) {
    const _tasaModal = typeof getTasaMN === 'function' ? getTasaMN() : 0;
    if (_tasaModal > 0) {
        _detailPrecioMNEl.textContent = `≈ ${Math.round(p.precioActual * _tasaModal).toLocaleString('es-CU')} MN`;
        _detailPrecioMNEl.style.display = 'block';
    } else {
        _detailPrecioMNEl.style.display = 'none';
    }
}

    // Ahorro
    const ahorroEl = document.getElementById('detailAhorroBadge');
    if (precioOriginal && p.descuento > 0) {
        const ahorro = (Number(precioOriginal||0) - Number(p.precioActual||0)).toFixed(2);
        ahorroEl.textContent = `Ahorras $${ahorro}`;
        ahorroEl.style.display = 'inline';
    } else {
        ahorroEl.style.display = 'none';
    }

    // Stock
    const stockEl = document.getElementById('detailProductStock');
    const _stockN = safeNum(p.stock);
    if (_stockN === 0) {
        stockEl.innerHTML = '<span style="color:#e74c3c;font-weight:700;">❌ Sin stock</span>';
    } else if (_stockN <= 3) {
        stockEl.innerHTML = `<span style="color:#e67e22;font-weight:700;">⚠️ ¡Últimas ${_stockN} unidades!</span>`;
    } else {
        stockEl.innerHTML = `<span>📦 ${_stockN} unidades disponibles</span>`;
    }
    document.getElementById('detailStockBarFill').style.width =
        `${Math.min(100, Math.max(8, (p.stock / 20) * 100))}%`;

    // Selector de cantidad — reset a 1, tope = stock, oculto si agotado
    _detalleMaxStock = Math.max(1, _stockN);
    _detalleCantidad = 1;
    const _qtyRow = document.getElementById('detailQtyRow');
    if (_qtyRow) {
        _qtyRow.style.display = _stockN > 0 ? 'flex' : 'none';
        const _qtyVal = document.getElementById('detailQtyValue');
        if (_qtyVal) _qtyVal.textContent = '1';
        const _qtyStock = document.getElementById('detailQtyStock');
        if (_qtyStock) _qtyStock.innerHTML = _stockN > 0 ? `📦 Solo quedan <b>${_stockN}</b> ${_stockN === 1 ? 'unidad' : 'unidades'}` : '';
        const _qtyMenos = _qtyRow.querySelector('.detail-qty-stepper button:first-child');
        const _qtyMas   = _qtyRow.querySelector('.detail-qty-stepper button:last-child');
        if (_qtyMenos) _qtyMenos.disabled = true;
        if (_qtyMas)   _qtyMas.disabled   = _stockN <= 1;
    }

    // Badges extra: garantia, devolución, usado
    const extBadges = document.getElementById('detailExtraBadges');
    let badges = '';
    if (p.devolucion) badges += `<span class="detail-badge-tag dtag-devolucion">↩️ Devolución aceptada</span>`;
    if (p.usado) badges += `<span class="detail-badge-tag dtag-usado">♻️ Producto usado</span>`;
    extBadges.innerHTML = badges;

    // Specs como chips (icono + valor), estilo ficha. Campo 'specs' del producto + garantía.
    const specBadgesEl = document.getElementById('detailSpecBadges');
    if (specBadgesEl) {
        const specs = Array.isArray(p.specs) ? p.specs.filter(s => s && String(s).trim()).slice(0, 6) : [];
        const _iconoSpec = (s) => {
            const t = String(s).toLowerCase();
            if (/mbps|ghz|\bhz\b|wifi|wi-fi/.test(t)) return '📶';
            if (/\bw\b|watt|\d+w/.test(t)) return '⚡';
            if (/\ba\b|amp|\d+a\b/.test(t)) return '🔌';
            if (/\bv\b|volt|\d+v/.test(t)) return '🔋';
            if (/ah|mah/.test(t)) return '🔋';
            return '🔧';
        };
        let chips = specs.map(s => `<div class="detail-chip"><span class="ic">${_iconoSpec(s)}</span><span class="tx"><b>${escapeHtml(s)}</b></span></div>`);
        if (p.garantia && String(p.garantia).trim()) {
            chips.push(`<div class="detail-chip"><span class="ic">🛡️</span><span class="tx"><small>Garantía</small><b>${escapeHtml(String(p.garantia))}</b></span></div>`);
        }
        if (chips.length > 0) {
            specBadgesEl.className = 'detail-spec-badges detail-chips';
            specBadgesEl.innerHTML = chips.join('');
            specBadgesEl.style.display = 'grid';
        } else {
            specBadgesEl.innerHTML = '';
            specBadgesEl.style.display = 'none';
        }
    }

    // Trust badges dinámicos (solo si el producto los tiene)
    const trustBadgesEl = document.getElementById('detailTrustBadges');
    if (trustBadgesEl) {
        let trustHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding:12px;background:rgba(0,0,0,0.03);border-radius:10px;border:1px solid rgba(0,0,0,0.06);">';
        trustHtml += '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;background:rgba(46,204,113,0.10);color:#2ECC71;">🔒 Pago contra entrega</span>';
        if (p.garantia && String(p.garantia).trim()) {
            trustHtml += `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;background:rgba(232,80,30,0.10);color:#E8501E;">🛡️ Garantía ${escapeHtml(p.garantia)}</span>`;
        }
        if (p.devolucion === true) {
            trustHtml += '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;background:rgba(52,152,219,0.10);color:#3498DB;">↩️ Devolución aceptada</span>';
        }
        trustHtml += '</div>';
        trustBadgesEl.innerHTML = trustHtml;
        trustBadgesEl.style.display = 'block';
    }

    // Descripción
    // Descripción: usar textContent preserva saltos de línea con CSS white-space
    // Descripción
    // OPT 3G: si la descripción no está (vino de productos-lite.json), fetch on-demand.
    const descEl = document.getElementById('detailProductDescription');
    if (p.descripcion) {
        descEl.textContent = p.descripcion;
    } else {
        descEl.textContent = 'Cargando descripción…';
        (async () => {
            try {
                const res = await fetch('productos.json', { cache: 'no-cache' });
                if (!res.ok) throw new Error('no ok');
                const full = await res.json();
                const fp = full.find(x => String(x.id) === String(p.id));
                if (fp && fp.descripcion) {
                    p.descripcion = fp.descripcion;
                    descEl.textContent = fp.descripcion;
                    if (fp.seoTitle) p.seoTitle = fp.seoTitle;
                    if (fp.seoDescription) p.seoDescription = fp.seoDescription;
                } else {
                    descEl.textContent = '';
                }
            } catch(e) {
                descEl.textContent = '';
            }
        })();
    }

    // Botón comprar (estilo WhatsApp "Pedir")
    const buyBtn = document.getElementById('detailBuyBtn');
    buyBtn.disabled = p.stock === 0;
    if (p.stock === 0) {
        buyBtn.innerHTML = '❌ Sin stock';
        // Añadir botón "Avisarme cuando vuelva" si no existe
        let avisarBtn = document.getElementById('detailAvisarBtn');
        if (!avisarBtn) {
            avisarBtn = document.createElement('button');
            avisarBtn.id = 'detailAvisarBtn';
            avisarBtn.style.cssText = 'width:100%;margin-top:10px;padding:14px;border-radius:16px;border:none;background:linear-gradient(135deg,#f5a623,#e8701e);color:white;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:filter .2s;';
            avisarBtn.innerHTML = '🔔 Avísame';
            // Insertar DEBAJO de la fila de acción (no dentro de ella)
            const _ctaRow = document.getElementById('detailCtaRow') || buyBtn.parentNode;
            _ctaRow.parentNode.insertBefore(avisarBtn, _ctaRow.nextSibling);
            avisarBtn.onclick = () => suscribirAvisoStock(p.id, p.nombre);
        }
        // Verificar si ya está suscrito
        _verificarSuscripcionAviso(p.id);
    } else {
        buyBtn.innerHTML = `
            <span class="btn-pedir-wa-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
            </span>
            <span class="btn-pedir-wa-text">Pedir</span>
        `;
        // Quitar botón avisar si existe y hay stock
        const avisarBtn = document.getElementById('detailAvisarBtn');
        if (avisarBtn) avisarBtn.remove();
    }
    buyBtn.onclick = () => contactarProducto(p.nombre);

    // Productos relacionados: primero recomendaciones IA guardadas, luego misma categoría.
    const recIds = Array.isArray(p.recomendados) ? p.recomendados.map(String) : [];
    const recIA = recIds
        .map(id => productos.find(x => String(x.id) === id))
        .filter(x => x && x.id !== p.id);
    const fallbackRel = productos
        .filter(x => x.id !== p.id && x.categoria === p.categoria && !recIds.includes(String(x.id)))
        .sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0));
    const relacionados = [...recIA, ...fallbackRel].slice(0, 4);
    const relSection = document.getElementById('detailRelacionados');
    const relGrid    = document.getElementById('detailRelacionadosGrid');
    if (relacionados.length > 0) {
        const _tasaRel = typeof getTasaMN === 'function' ? getTasaMN() : 0;
        const upsellNote = p.upsellText ? `<div class="rel-upsell-note" style="grid-column:1/-1;font-size:12px;color:#C9A96E;background:rgba(201,169,110,.08);border:1px solid rgba(201,169,110,.18);border-radius:10px;padding:10px 12px;margin-bottom:4px;">💡 ${escapeHtml(p.upsellText)}</div>` : '';
        relGrid.innerHTML = upsellNote + relacionados.map(r => {
            const _mnRel = _tasaRel > 0
                ? `<span class="rel-card-price-mn">≈ ${Math.round(Number(r.precioActual) * _tasaRel).toLocaleString('es-CU')} MN</span>`
                : '';
            return `
            <div class="rel-card" onclick="abrirDetalleProducto(${safeNum(r.id)})"${r.stock === 0 ? ' style="opacity:0.5"' : ''}>
                <img src="${escapeAttr(r.imagen)}" alt="${escapeHtml(r.nombre)}" loading="lazy" onerror="this.style.display='none'">
                <div class="rel-card-name">${escapeHtml(r.nombre)}</div>
                <div class="rel-card-price">$${Number(r.precioActual).toFixed(2)} USD${_mnRel}</div>
            </div>
            `;
        }).join('');
        relSection.style.display = 'block';
    } else {
        relSection.style.display = 'none';
    }

    // Reseñas
    renderizarResenas(p.id);
    document.getElementById('formResena').style.display = 'none';
    const btnResena = document.getElementById('btnAgregarResena');
    if (btnResena) btnResena.textContent = '+ Agregar reseña';
    _estrellasSeleccionadas = 0;
    setEstrellas(0);

    // Historial de vistas
    registrarVisto(p.id);

    // Contador de vistas — local primero, Firebase en segundo plano
    (function() {
        const vDiv = document.getElementById('detailPersonasViendo');
        if (!vDiv) return;
        const prodId = p.id;
        const local = obtenerVistasProd(prodId) || 0;
        if (local > 0) {
            vDiv.style.display = 'flex';
            vDiv.innerHTML = '<span class="pv-inner">👁️ <strong>' + local.toLocaleString() + '</strong> personas vieron esto</span>';
        }
        (async () => {
            try {
                const cfg = tmParseObject(localStorage.getItem('firebaseConfig'));
                const base = cfg.databaseURL || (cfg.projectId ? 'https://' + cfg.projectId + '-default-rtdb.firebaseio.com' : null);
                if (!base) return;
                const res = await fetch(base + '/analytics/vistas/' + String(prodId) + '/count.json');
                if (!res.ok) return;
                const cnt = await res.json();
                if (typeof cnt !== 'number' || cnt <= 0) return;
                const el = document.getElementById('detailPersonasViendo');
                if (el) {
                    el.style.display = 'flex';
                    el.innerHTML = '<span class="pv-inner">👁️ <strong>' + cnt.toLocaleString() + '</strong> personas vieron esto</span>';
                }
            } catch(e) {}
        })();
    })();

    // Botón carrito en el modal — ícono en la fila de acción (junto al corazón y Pedir)
    const detailBuyRow = document.getElementById('detailBuyBtn');
    const ctaRow = document.getElementById('detailCtaRow');
    if (detailBuyRow && ctaRow) {
        let cartRowEl = document.getElementById('detailCartBtn');
        if (!cartRowEl) {
            cartRowEl = document.createElement('button');
            cartRowEl.id = 'detailCartBtn';
            cartRowEl.type = 'button';
            // insertar antes del botón Pedir (después del corazón)
            ctaRow.insertBefore(cartRowEl, detailBuyRow);
        }
        // Sin stock: no se puede agregar al carrito → ocultar
        if (p.stock === 0) {
            cartRowEl.style.display = 'none';
        } else {
            cartRowEl.style.display = '';
            const enCarro = carrito.some(x => x.id === p.id);
            cartRowEl.className = 'detail-cta-icon' + (enCarro ? ' en-carrito' : '');
            cartRowEl.textContent = enCarro ? '✓' : '🛒';
            cartRowEl.title = enCarro ? 'En el carrito — ver carrito' : 'Agregar al carrito';
            cartRowEl.setAttribute('aria-label', cartRowEl.title);
            cartRowEl.onclick = () => {
                if (carrito.some(x => x.id === p.id)) {
                    cerrarDetalleModal();
                    abrirCarrito();
                } else {
                    agregarAlCarrito(p.id, _detalleCantidad, cartRowEl);
                    cartRowEl.className = 'detail-cta-icon en-carrito';
                    cartRowEl.textContent = '✓';
                    cartRowEl.title = 'En el carrito — ver carrito';
                }
            };
        }
    }

    // Estado del corazón de favoritos en el modal
    const favBtn = document.getElementById('detailFavBtn');
    if (favBtn) {
        const liked = (typeof wishlist !== 'undefined' && Array.isArray(wishlist)) && wishlist.includes(String(p.id));
        favBtn.textContent = liked ? '❤️' : '🤍';
        favBtn.classList.toggle('liked', liked);
    }

    // Abrir modal
    const modal = document.getElementById('productDetailModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = 'hidden';
    // Scroll al top para que el usuario vea el producto desde el inicio
    const detailBody = modal.querySelector('.detail-body') || modal.querySelector('.detail-modal-content');
    if (detailBody) detailBody.scrollTop = 0;
    
    
    
}

function cerrarDetalleModal() {
    // FIX: cerrar panel de compartir si estaba abierto
    var _pcr = document.getElementById('panelCompartirRedes');
    if (_pcr) _pcr.style.display = 'none';

    _resetZoomPan(document.getElementById('detailProductImage'));

    const modal = document.getElementById('productDetailModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = '';
    _detalleProductoActual = null;
    if (typeof actualizarVisibilidadBannerOferta === 'function') {
        actualizarVisibilidadBannerOferta(typeof tmVistaInicioActiva === 'function' ? tmVistaInicioActiva() : true);
    }
    // Limpiar el hash de la URL
    history.replaceState(null, '', window.location.pathname + window.location.search);
    
    // SEO dinámico: restaurar meta tags originales
    if (typeof restaurarSEOOriginal === 'function') {
        restaurarSEOOriginal();
    }
}

let _zoomPanState = null;

function _resetZoomPan(img) {
    if (!img) return;
    if (_zoomPanState) { _zoomPanState.cleanup(); _zoomPanState = null; }
    img.classList.remove('zoomed', 'dragging');
    img.style.transform = '';
    img.style.transition = '';
    const hint = img.parentElement && img.parentElement.querySelector('.detail-zoom-hint');
    if (hint) hint.textContent = '🔍 Toca para ampliar';
}

function _initZoomPan(img) {
    const SCALE = 2.2;
    let tx = 0, ty = 0, startX = 0, startY = 0, startTx = 0, startTy = 0;
    let isDragging = false, hasMoved = false;
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function maxPan() {
        const wrap = img.parentElement;
        if (!wrap) return { x: 0, y: 0 };
        const iR = img.getBoundingClientRect(), wR = wrap.getBoundingClientRect();
        return { x: Math.max(0, (iR.width * SCALE - wR.width) / 2), y: Math.max(0, (iR.height * SCALE - wR.height) / 2) };
    }
    function applyT(dur) {
        const m = maxPan();
        tx = clamp(tx, -m.x, m.x); ty = clamp(ty, -m.y, m.y);
        img.style.transition = dur ? 'transform ' + dur + 'ms cubic-bezier(.4,0,.2,1)' : 'none';
        img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + SCALE + ')';
    }
    function onMD(e) { isDragging = true; hasMoved = false; startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty; img.classList.add('dragging'); e.preventDefault(); }
    function onMM(e) { if (!isDragging) return; const dx = e.clientX - startX, dy = e.clientY - startY; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true; tx = startTx + dx; ty = startTy + dy; applyT(0); }
    function onMU() { isDragging = false; img.classList.remove('dragging'); if (!hasMoved) { _resetZoomPan(img); } else { applyT(150); } }
    function onTS(e) { if (e.touches.length !== 1) return; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startTx = tx; startTy = ty; hasMoved = false; e.preventDefault(); }
    function onTM(e) { if (e.touches.length !== 1) return; const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY; if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true; tx = startTx + dx; ty = startTy + dy; applyT(0); e.preventDefault(); }
    function onTE() { if (!hasMoved) { _resetZoomPan(img); } else { applyT(150); } }
    img.addEventListener('mousedown', onMD);
    document.addEventListener('mousemove', onMM);
    document.addEventListener('mouseup', onMU);
    img.addEventListener('touchstart', onTS, { passive: false });
    img.addEventListener('touchmove', onTM, { passive: false });
    img.addEventListener('touchend', onTE);
    applyT(300);
    _zoomPanState = { cleanup() { img.removeEventListener('mousedown', onMD); document.removeEventListener('mousemove', onMM); document.removeEventListener('mouseup', onMU); img.removeEventListener('touchstart', onTS); img.removeEventListener('touchmove', onTM); img.removeEventListener('touchend', onTE); } };
}

function toggleZoomImagen(img) {
    if (img.classList.contains('zoomed')) { _resetZoomPan(img); return; }
    img.classList.add('zoomed');
    const hint = img.parentElement && img.parentElement.querySelector('.detail-zoom-hint');
    if (hint) hint.textContent = '↔ Arrastra · Toca para cerrar';
    _initZoomPan(img);
}

function _initSwipeGaleria(img) {
    if (img._swipeGaleriaInited) return;
    img._swipeGaleriaInited = true;
    let swX = 0, swY = 0;
    img.addEventListener('touchstart', function(e) {
        if (img.classList.contains('zoomed') || e.touches.length !== 1) return;
        swX = e.touches[0].clientX; swY = e.touches[0].clientY;
    }, { passive: true });
    img.addEventListener('touchend', function(e) {
        if (img.classList.contains('zoomed')) return;
        const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY;
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
        const thumbs = Array.from(document.querySelectorAll('#detailGalleryThumbs .detail-gallery-thumb'));
        if (thumbs.length < 2) return;
        const idx = thumbs.findIndex(t => t.classList.contains('active'));
        const next = dx < 0 ? (idx + 1) % thumbs.length : (idx - 1 + thumbs.length) % thumbs.length;
        thumbs[next].click();
    }, { passive: true });
}

function abrirPanelCompartir() {
    const panel = document.getElementById('panelCompartirRedes');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
}

function _getShareData() {
    const p = _detalleProductoActual;
    if (!p) return null;
    const url = 'https://tiendamax.org/p/producto-' + p.id + '.html';
    const _pa = Number(p.precioActual||0).toFixed(2);
    return {
        nombre: p.nombre,
        precio: _pa,
        texto: '🛍️ *' + p.nombre + '* — $' + _pa + ' USD\n📦 Stock disponible\n👉 ' + url,
        url: url
    };
}

function compartirWhatsApp() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(d.texto);
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
}

function compartirFacebook() {
    const d = _getShareData(); if (!d) return;
    const url = encodeURIComponent(d.url);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${encodeURIComponent(d.texto)}`, '_blank', 'noopener,noreferrer');
}

function compartirTelegram() {
    const d = _getShareData(); if (!d) return;
    // FIX: eliminada variable msg que no se usaba
    window.open(`https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.texto)}`, '_blank', 'noopener,noreferrer');
}

function compartirTwitter() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(`${d.nombre} — $${d.precio} USD en @TiendaMax 🛍️ ${d.url}`);
    window.open(`https://twitter.com/intent/tweet?text=${msg}`, '_blank', 'noopener,noreferrer');
}

function compartirNativo() {
    const p = _detalleProductoActual;
    if (!p) return;
    const texto = `🛍️ ${p.nombre} — $${Number(p.precioActual||0).toFixed(2)} USD\n📦 Stock disponible\n👉 tiendamax.org`;
    const urlProducto = 'https://tiendamax.org/p/producto-' + p.id + '.html';
    if (navigator.share) {
        navigator.share({ title: p.nombre, text: texto, url: urlProducto }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto + '\n' + urlProducto).then(() => mostrarNotificacion('📤 Texto copiado para compartir'));
    }
}

function compartirProducto() {
    abrirPanelCompartir();
}

function copiarLinkProducto() {
    const p = _detalleProductoActual;
    const url = p
        ? 'https://tiendamax.org/p/producto-' + p.id + '.html'
        : 'https://tiendamax.org';
    navigator.clipboard.writeText(url).then(() =>
        mostrarNotificacion('🔗 Enlace copiado — ¡listo para compartir!')
    ).catch(() => {
        // Fallback para dispositivos sin clipboard API
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        mostrarNotificacion('🔗 Enlace copiado');
    });
}

function contactarProducto(nombre) {
    const p = _detalleProductoActual;
    // Cantidad elegida en el modal (tope = stock); por defecto 1
    const cant = p ? Math.max(1, Math.min(safeNum(_detalleCantidad) || 1, safeNum(p.stock) || 1)) : 1;
    const item = p
        ? { id: p.id, nombre: p.nombre, precio: parseFloat(p.precioActual) || 0, cantidad: cant }
        : { nombre: nombre || 'Producto', precio: 0, cantidad: 1 };
    if (p) tmRegistrarInteresWhatsApp(p, 'detalle');
    // Generar vale/pedido para seguimiento
    const pedidoId = (typeof guardarPedidoCliente === 'function') ? guardarPedidoCliente([item]) : null;
    const msg = _mensajeOrdenWA([item], { pedidoId });
    window.open(`https://wa.me/${getNumeroWhatsApp()}?text=${msg}`, '_blank', 'noopener,noreferrer');
}

// ═══════════════════════════════════════════════════════════
//  🔔 AVISARME CUANDO VUELVA — suscripción a alertas de stock
//  Guarda el FCM token del cliente en /avisos_stock/{productId}/
//  Cuando el admin repone stock, _procesarAvisosStock envía push automáticamente.
// ═══════════════════════════════════════════════════════════

// Suscribir al cliente para recibir aviso cuando el producto vuelva a tener stock
async function suscribirAvisoStock(productId, nombreProducto) {
    try {
        // 1. Obtener FCM token del cliente (si no existe, pedir permiso)
        let fcmToken = localStorage.getItem('fcmToken');
        if (!fcmToken) {
            // Pedir permiso de notificaciones
            if (!('Notification' in window)) {
                mostrarNotificacion('⚠️ Tu navegador no soporta notificaciones', 'error');
                return;
            }
            if (Notification.permission === 'default') {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                    mostrarNotificacion('⚠️ Necesitas aceptar las notificaciones para recibir el aviso', 'error');
                    return;
                }
            } else if (Notification.permission === 'denied') {
                mostrarNotificacion('⚠️ Las notificaciones están bloqueadas. Actívalas para recibir el aviso.', 'error');
                return;
            }
            // Intentar obtener el token FCM
            if (typeof inicializarFirebaseFCMClient === 'function') {
                const fbCfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
                if (fbCfg.projectId) {
                    await inicializarFirebaseFCMClient(fbCfg);
                    fcmToken = localStorage.getItem('fcmToken');
                }
            }
            if (!fcmToken) {
                // Fallback: usar un ID anónimo (no recibirá push pero se registrará)
                fcmToken = 'anon_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                localStorage.setItem('fcmToken', fcmToken);
            }
        }

        // 1b. Pedir el WhatsApp del cliente para poder avisarle también por mensaje
        let telCliente = '';
        try {
            const ingresado = prompt('📲 Déjanos tu WhatsApp y te avisamos apenas vuelva (opcional, ej: 5XXXXXXX):', '');
            if (ingresado) telCliente = String(ingresado).replace(/[^0-9+]/g, '').slice(0, 20);
        } catch(e) {}

        // 2. Guardar suscripción en Firebase: /avisos_stock/{productId}/{token} = { ts, nombre, tel }
        const fbCfgRaw = localStorage.getItem('firebaseConfig');
        if (!fbCfgRaw) {
            mostrarNotificacion('⚠️ No se pudo conectar con el servidor. Intenta más tarde.', 'error');
            return;
        }
        const fbCfg = JSON.parse(fbCfgRaw);
        const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
        const res = await fetch(rtdbUrl + '/avisos_stock/' + productId + '/' + encodeURIComponent(fcmToken) + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({
                token: fcmToken,
                ts: Date.now(),
                producto: nombreProducto
            }, telCliente ? { tel: telCliente } : {}))
        });

        if (!res.ok) {
            mostrarNotificacion('⚠️ Error al registrar el aviso. Intenta más tarde.', 'error');
            return;
        }

        // 3. Guardar localmente para saber que ya está suscrito
        const suscripciones = tmParseArray(localStorage.getItem('avisos_stock_suscritos'));
        if (!suscripciones.includes(productId)) {
            suscripciones.push(productId);
            localStorage.setItem('avisos_stock_suscritos', JSON.stringify(suscripciones));
        }

        // 4. Actualizar botón
        const btn = document.getElementById('detailAvisarBtn');
        if (btn) {
            btn.innerHTML = '✅ ¡Te avisaremos cuando vuelva!';
            btn.style.background = 'linear-gradient(135deg,#2ECC71,#27AE60)';
            btn.disabled = true;
            btn.style.cursor = 'default';
        }

        mostrarNotificacion('🔔 ¡Listo! Te avisaremos cuando ' + nombreProducto + ' vuelva a estar disponible', 'success');
    } catch(e) {
        mostrarNotificacion('⚠️ Error: ' + e.message, 'error');
    }
}

// Verificar si el cliente ya está suscrito a avisos de un producto
function _verificarSuscripcionAviso(productId) {
    try {
        const suscripciones = tmParseArray(localStorage.getItem('avisos_stock_suscritos'));
        if (suscripciones.includes(productId)) {
            const btn = document.getElementById('detailAvisarBtn');
            if (btn) {
                btn.innerHTML = '✅ ¡Te avisaremos cuando vuelva!';
                btn.style.background = 'linear-gradient(135deg,#2ECC71,#27AE60)';
                btn.disabled = true;
                btn.style.cursor = 'default';
            }
        }
    } catch(e) {}
}

// actualizarListaProductos está definida más abajo (versión mejorada con filtros por categoría)

