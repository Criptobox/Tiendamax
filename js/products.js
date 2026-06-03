"use strict";

let productos = [];

async function cargarProductos() {
    try {
        const res = await fetch('productos.json?_=' + Date.now());
        if (!res.ok) throw new Error('No se pudo cargar el catálogo');
        productos = await res.json();
        return productos;
    } catch (e) {
        console.error('Error cargando productos:', e);
        mostrarNotificacion('❌ Error al cargar el catálogo', 'error');
        return [];
    }
}

function mostrarVistaCategoria(cat = 'Todas') {
    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaCategoria').style.display = 'block';
    document.getElementById('tituloCategoriaActual').textContent = cat === 'Todas' ? 'Catálogo Completo' : cat;
    
    // Actualizar filtro de categorías
    const filtro = document.getElementById('categoriaFiltro');
    if (filtro) {
        filtro.style.display = cat === 'Todas' ? 'flex' : 'none';
        const btnTodas = filtro.querySelector('[data-arg="Todas"]');
        if (btnTodas) btnTodas.classList.add('active');
    }

    // Subcategorías
    const tabs = document.getElementById('subcategoriaTabs');
    if (tabs) {
        const subcats = subcategorias[cat] || [];
        if (subcats.length > 0 && cat !== 'Todas') {
            tabs.style.display = 'flex';
            tabs.innerHTML = `<button class="subcat-btn active" onclick="mostrarVistaSubcategoria('${cat}', 'Todas')">Todas</button>` + 
                subcats.map(s => `<button class="subcat-btn" onclick="mostrarVistaSubcategoria('${cat}', '${s}')">${s}</button>`).join('');
        } else {
            tabs.style.display = 'none';
        }
    }

    filtrarProductos(cat);
    window.scrollTo(0, 0);
}

function mostrarVistaSubcategoria(cat, subcat) {
    document.getElementById('tituloCategoriaActual').textContent = `${cat} > ${subcat}`;
    const tabs = document.getElementById('subcategoriaTabs');
    if (tabs) {
        tabs.querySelectorAll('.subcat-btn').forEach(b => {
            b.classList.toggle('active', b.textContent === subcat || (subcat === 'Todas' && b.textContent === 'Todas'));
        });
    }
    filtrarProductos(cat, subcat);
}

function filtrarProductos(cat = 'Todas', subcat = 'Todas') {
    let filtered = productos;
    if (cat !== 'Todas') {
        filtered = productos.filter(p => p.categoria === cat);
    }
    if (subcat !== 'Todas') {
        filtered = filtered.filter(p => p.subcategoria === subcat);
    }
    renderizarProductos(filtered);
}

function renderizarProductos(lista) {
    const grid = document.getElementById('productosGrid');
    const vacio = document.getElementById('productoVacio');
    if (!grid) return;

    if (lista.length === 0) {
        grid.innerHTML = "";
        vacio.style.display = "block";
        return;
    }

    vacio.style.display = "none";
    grid.innerHTML = lista.map(p => renderCardProducto(p)).join('');
}

function renderCardProducto(p) {
    const isAgotado = p.stock <= 0;
    const badgeOferta = p.precioOriginal > p.precio ? `<div class="badge">-${Math.round((1 - p.precio / p.precioOriginal) * 100)}%</div>` : '';
    const badgeHot = p.masVendido ? `<div class="badge-vendido">🔥 Más Vendido</div>` : '';
    const badgeUsado = p.usado ? `<div class="badge-usado">✨ Usado</div>` : '';
    const badgeAgotado = isAgotado ? `<div class="badge-agotado">AGOTADO</div>` : '';

    return `
        <div class="product-card ${isAgotado ? 'agotado' : ''}" onclick="abrirDetalleProducto(${p.id})">
            ${badgeOferta} ${badgeHot} ${badgeUsado} ${badgeAgotado}
            <div class="product-img-wrap">
                <img src="${p.imagen}" alt="${p.nombre}" loading="lazy">
            </div>
            <div class="product-info">
                <div class="product-cat">${p.categoria}</div>
                <div class="product-name">${p.nombre}</div>
                <div class="product-price-wrap">
                    ${p.precioOriginal > p.precio ? `<span class="price-old">$${p.precioOriginal.toFixed(2)}</span>` : ''}
                    <span class="price-main">$${p.precio.toFixed(2)}</span>
                </div>
                <div class="product-footer">
                    <button onclick="event.stopPropagation(); agregarAlCarrito(${p.id})" class="btn-add-cart" ${isAgotado ? 'disabled' : ''}>
                        ${isAgotado ? 'Agotado' : '🛒 Agregar'}
                    </button>
                    <button onclick="event.stopPropagation(); toggleMeGusta(${p.id}, event)" class="btn-like ${wishlist.includes(String(p.id)) ? 'liked' : ''}">
                        ❤️
                    </button>
                </div>
            </div>
        </div>`;
}

async function abrirDetalleProducto(id) {
    const p = productos.find(p => String(p.id) === String(id));
    if (!p) return;

    const modal = document.getElementById('productDetailModal');
    if (!modal) return;

    document.getElementById('detailProductName').textContent = p.nombre;
    document.getElementById('detailProductCategory').textContent = p.categoria;
    
    const sub = document.getElementById('detailSubcategoria');
    if (sub) {
        sub.textContent = p.subcategoria || '';
        sub.style.display = p.subcategoria ? 'block' : 'none';
    }

    const priceMain = document.getElementById('detailPriceActual');
    const priceOld = document.getElementById('detailPriceOriginal');
    const ahorro = document.getElementById('detailAhorroBadge');
    
    const mon = localStorage.getItem('monedaActual') || 'USD';
    const tasa = parseFloat(localStorage.getItem('tasaMN') || '0') + 10;

    if (mon === 'USD') {
        priceMain.textContent = `$${p.precio.toFixed(2)} USD`;
        if (p.precioOriginal > p.precio) {
            priceOld.textContent = `$${p.precioOriginal.toFixed(2)} USD`;
            ahorro.textContent = `Ahorras $${(p.precioOriginal - p.precio).toFixed(2)}`;
            ahorro.style.display = 'block';
        } else {
            priceOld.textContent = '';
            ahorro.style.display = 'none';
        }
    } else {
        priceMain.textContent = `${(p.precio * tasa).toFixed(0)} MN`;
        if (p.precioOriginal > p.precio) {
            priceOld.textContent = `${(p.precioOriginal * tasa).toFixed(0)} MN`;
            ahorro.textContent = `Ahorras ${(p.precioOriginal - p.precio) * tasa.toFixed(0)} MN`;
            ahorro.style.display = 'block';
        } else {
            priceOld.textContent = '';
            ahorro.style.display = 'none';
        }
    }

    const stockEl = document.getElementById('detailProductStock');
    const stockFill = document.getElementById('detailStockBarFill');
    if (stockEl) {
        if (p.stock <= 0) {
            stockEl.textContent = '❌ Producto agotado';
            stockFill.style.width = '0%';
            stockFill.style.background = '#e74c3c';
            document.getElementById('detailBuyBtn').disabled = true;
        } else {
            stockEl.textContent = `📦 ${p.stock} unidades disponibles`;
            const perc = Math.min(100, (p.stock / 20) * 100);
            stockFill.style.width = perc + '%';
            stockFill.style.background = perc < 20 ? '#e74c3c' : (perc < 50 ? '#f1c40f' : '#2ecc71');
            document.getElementById('detailBuyBtn').disabled = false;
        }
    }

    const badges = document.getElementById('detailExtraBadges');
    if (badges) {
        let bHtml = '';
        if (p.garantia) bHtml += `<span class="detail-badge-extra">🛡️ ${p.garantia}</span>`;
        if (p.devolucion) bHml += `<span class="detail-badge-extra">✓ Devolución segura</span>`;
        if (p.usado) bHtml += `<span class="detail-badge-extra">✨ Producto usado</span>`;
        badges.innerHTML = bHtml;
    }

    document.getElementById('detailProductImage').src = p.imagen;
    document.getElementById('detailProductDescription').textContent = p.descripcion;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    registrarVisto(p.id);
}

function cerrarDetalleModal() {
    document.getElementById('productDetailModal').classList.add('hidden');
    document.body.style.overflow = '';
}

function registrarVisto(id) {
    let vistos = _cargarVistos();
    vistos = vistos.filter(v => v !== id);
    vistos.unshift(id);
    if (vistos.length > 10) vistos.pop();
    _guardarVistos(vistos);
    renderizarRecientes();
}

function _cargarVistos() {
    return JSON.parse(localStorage.getItem('tm_vistos') || '[]');
}

function _guardarVistos(arr) {
    localStorage.setItem('tm_vistos', JSON.stringify(arr));
}

function renderizarRecientes() {
    const grid = document.getElementById('recientesGrid');
    const section = document.getElementById('seccionRecientes');
    if (!grid) return;

    const vistosIds = _cargarVistos();
    if (vistosIds.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const list = vistosIds.map(id => productos.find(p => String(p.id) === String(id))).filter(Boolean);
    grid.innerHTML = list.map(p => `
        <div class="rec-card" onclick="abrirDetalleProducto(${p.id})">
            <img src="${p.imagen}" alt="${p.nombre}">
            <div class="rec-card-info">
                <div class="rec-card-nombre">${p.nombre}</div>
                <div class="rec-card-precio">$${p.precio.toFixed(2)}</div>
            </div>
        </div>
    `).join('');
}

function abrirPanelBusqueda() {
    document.getElementById('heroSearchPanel').style.display = 'block';
}

function cerrarPanelBusqueda() {
    document.getElementById('heroSearchPanel').style.display = 'none';
}

async function buscarDesdeHero(q) {
    if (!q) {
        cerrarPanelBusqueda();
        return;
    }
    const res = await busquedaLocal(q);
    renderSugerencias(res, q);
}

function busquedaLocal(q) {
    const query = q.toLowerCase();
    const res = productos.filter(p => 
        p.nombre.toLowerCase().includes(query) || 
        p.categoria.toLowerCase().includes(query) ||
        p.descripcion.toLowerCase().includes(query)
    );
    return res;
}

function renderSugerencias(res, q) {
    const cont = document.getElementById('heroSearchSuggestions');
    if (!cont) return;
    if (res.length === 0) {
        cont.innerHTML = '<div class="hsb-suggestion-empty">No se encontraron productos</div>';
        return;
    }
    cont.innerHTML = res.slice(0, 5).map(p => `
        <div class="hsb-suggestion-item" onclick="seleccionarSugerencia(${p.id})">
            <img src="${p.imagen}" width="30" height="30">
            <span>${p.nombre}</span>
            <span class="hsb-suggestion-price">$${p.precio.toFixed(2)}</span>
        </div>
    `).join('');
}

function seleccionarSugerencia(id) {
    abrirDetalleProducto(id);
    cerrarPanelBusqueda();
}

function aplicarBusquedaHero() {
    const q = document.getElementById('heroSearchInput').value;
    if (!q) return;
    const res = busquedaLocal(q);
    mostrarVistaCategoria('Todas');
    renderizarProductos(res);
    document.getElementById('tituloCategoriaActual').textContent = `Resultados para "${q}"`;
    cerrarPanelBusqueda();
}
