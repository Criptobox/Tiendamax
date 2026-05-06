'use strict';

// ===== CONFIGURACIÓN GLOBAL =====
const BACKEND_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://127.0.0.1:5002/api' 
    : '/api';
const PASSWORD_ADMIN = 'Cripx';

let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';

const ICONOS_CATEGORIAS = {
    'General':    '🛍️',
    'WIFI':       '📡',
    'ENERGIA':    '⚡',
    'CELULARES':  '📱',
    'UTILES':     '🔧',
    'Ropa':       '👗',
    'Electrónica':'💻',
    'Hogar':      '🏠',
    'Alimentos':  '🍎',
    'Belleza':    '💄',
    'Deportes':   '⚽',
    'Juguetes':   '🧸',
    'Libros':     '📚',
    'Automóviles':'🚗',
};

function obtenerIconoCategoria(nombre) {
    return ICONOS_CATEGORIAS[nombre] || '📦';
}

async function cargarDatosDesdeGitHub() {
    try {
        const resProd = await fetch('productos.json?v=' + Date.now());
        if (resProd.ok) {
            const data = await resProd.json();
            if (data && data.length > 0) {
                productos = data;
                localStorage.setItem('productos', JSON.stringify(productos));
            }
        }
        const resCat = await fetch('categorias.json?v=' + Date.now());
        if (resCat.ok) {
            const data = await resCat.json();
            if (data && data.length > 0) {
                categorias = data;
                localStorage.setItem('categorias', JSON.stringify(categorias));
            }
        }
        renderizarCategoriasHome();
        renderizarMasVendidos();
        actualizarListaProductos();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        verificarOfertasYMostrarBanner();
    } catch (e) {
        renderizarCategoriasHome();
        renderizarMasVendidos();
        verificarOfertasYMostrarBanner();
    }
}

window.addEventListener('storage', (event) => {
    if (event.key === 'productos') {
        productos = JSON.parse(event.newValue) || [];
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
    }
    if (event.key === 'categorias') {
        categorias = JSON.parse(event.newValue) || ['General'];
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarCategoriasHome();
        renderizarProductos();
    }
});

function contactarWhatsApp() {
    const numeroWhatsApp = '5354320170';
    const mensaje = encodeURIComponent('Hola, me interesa conocer más sobre tus productos. ¿Puedes ayudarme?');
    window.open(`https://wa.me/${numeroWhatsApp}?text=${mensaje}`, '_blank');
}

function scrollToProductos() {
    const el = document.querySelector('#categorias-home');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function mostrarVistaInicio() {
    document.getElementById('vistaInicio').style.display = 'block';
    document.getElementById('vistaCategoria').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarVistaCategoria(categoria) {
    categoriaSeleccionada = categoria;
    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaCategoria').style.display = 'block';
    const icono = obtenerIconoCategoria(categoria);
    const titulo = categoria === 'Todas' ? '🛍️ Todos los Productos' : `${icono} ${categoria}`;
    document.getElementById('tituloCategoriaActual').textContent = titulo;
    actualizarBotonesCategorias();
    renderizarProductos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function volverAlInicio() {
    mostrarVistaInicio();
}

function renderizarCategoriasHome() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const cardTodas = document.createElement('div');
    cardTodas.className = 'categoria-card';
    const totalProductos = productos.length;
    cardTodas.innerHTML = `
        <span class="cat-icon">🛍️</span>
        <span class="cat-name">Todos</span>
        <span class="cat-count">${totalProductos} producto${totalProductos !== 1 ? 's' : ''}</span>
    `;
    cardTodas.onclick = () => mostrarVistaCategoria('Todas');
    grid.appendChild(cardTodas);
    categorias.forEach(cat => {
        const count = productos.filter(p => p.categoria === cat).length;
        const card = document.createElement('div');
        card.className = 'categoria-card';
        card.innerHTML = `
            <span class="cat-icon">${obtenerIconoCategoria(cat)}</span>
            <span class="cat-name">${cat}</span>
            <span class="cat-count">${count} producto${count !== 1 ? 's' : ''}</span>
        `;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
}

function renderizarMasVendidos() {
    const grid = document.getElementById('masVendidosGrid');
    const vacio = document.getElementById('masVendidosVacio');
    if (!grid) return;
    const masVendidos = productos.filter(p => p.masVendido === true || p.masVendido === 'true');
    const productosAMostrar = masVendidos.length > 0 ? masVendidos : productos.slice(0, 3);
    grid.innerHTML = '';
    if (productosAMostrar.length === 0) {
        if (vacio) vacio.style.display = 'block';
        return;
    }
    if (vacio) vacio.style.display = 'none';
    productosAMostrar.forEach(producto => {
        const card = document.createElement('div');
        card.className = 'producto-card';
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.innerHTML = `
            <div class="badge-vendido">🔥 Más Vendido</div>
            <div class="producto-image">
                <img src="${producto.imagen}" alt="${producto.nombre}" loading="lazy">
                ${producto.descuento > 0 ? `<div class="badge">-${producto.descuento}%</div>` : ''}
            </div>
            <h3>${producto.nombre}</h3>
            <p class="precio">
                ${producto.precioOriginal !== producto.precioActual ? `<span class="precio-original">$${producto.precioOriginal.toFixed(2)}</span>` : ''}
                <span class="precio-actual">$${producto.precioActual.toFixed(2)} USD</span>
            </p>
            <div class="stock-count">
                <span>📦 Solo quedan ${producto.stock} unidades</span>
            </div>
            <div class="stock-bar">
                <div class="stock-bar-fill" style="width: ${Math.max(15, (producto.stock / 20) * 100)}%"></div>
            </div>
            <button class="btn btn-small btn-primary" onclick="event.stopPropagation(); contactarProducto('${producto.nombre}')">🛒 Comprar</button>
        `;
        grid.appendChild(card);
    });
}

function abrirLoginAdmin() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('hidden');
    modal.style.setProperty('display', 'flex', 'important');
    setTimeout(() => document.getElementById('adminPassword').focus(), 100);
}

function cerrarLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('hidden');
    modal.style.setProperty('display', 'none', 'important');
    document.getElementById('adminPassword').value = '';
}

function verificarPassword(event) {
    event.preventDefault();
    const password = document.getElementById('adminPassword').value;
    if (password === PASSWORD_ADMIN) {
        usuarioAutenticado = true;
        cerrarLoginModal();
        abrirAdminPanel();
    } else {
        mostrarNotificacion('❌ Contraseña incorrecta', 'error');
        document.getElementById('adminPassword').value = '';
    }
}

function abrirAdminPanel() {
    if (!usuarioAutenticado) { abrirLoginAdmin(); return; }
    const panel = document.getElementById('adminPanel');
    panel.classList.remove('hidden');
    panel.classList.add('visible');
    panel.style.setProperty('display', 'flex', 'important');
    actualizarListaProductos();
    actualizarSelectCategorias();
    actualizarListaCategorias();
}

function cerrarAdminPanel() {
    const panel = document.getElementById('adminPanel');
    panel.classList.add('hidden');
    panel.classList.remove('visible');
    panel.style.setProperty('display', 'none', 'important');
}

function switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(tabName)) btn.classList.add('active');
    });
}

function mostrarNotificacion(mensaje, tipo = 'success') {
    const notif = document.createElement('div');
    notif.className = `notificacion notificacion-${tipo}`;
    notif.textContent = mensaje;
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        padding: 14px 20px; border-radius: 10px; font-weight: 600;
        font-size: 14px; max-width: 350px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        background: ${tipo === 'success' ? '#27AE60' : tipo === 'error' ? '#E74C3C' : '#3498DB'};
        color: white;
    `;
    document.body.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}

function agregarProductoForm(event) {
    event.preventDefault();
    const fileInput = document.getElementById('productImage');
    const file = fileInput.files[0];
    if (!file) { mostrarNotificacion('Por favor selecciona una imagen', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const masVendidoVal = document.getElementById('productMasVendido');
        const producto = {
            id: Date.now(),
            nombre: document.getElementById('productName').value.trim(),
            descripcion: document.getElementById('productDescription').value.trim(),
            imagen: e.target.result,
            precioOriginal: parseFloat(document.getElementById('productPriceOriginal').value) || 0,
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            descuento: parseInt(document.getElementById('productDiscount').value) || 0,
            stock: parseInt(document.getElementById('productStock').value) || 0,
            categoria: document.getElementById('productCategory').value,
            masVendido: masVendidoVal ? masVendidoVal.value === 'true' : false
        };
        productos.push(producto);
        guardarProductos();
        document.getElementById('productForm').reset();
        mostrarNotificacion('✅ ¡Producto agregado exitosamente!');
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
    };
    reader.readAsDataURL(file);
}

function guardarProductos() {
    localStorage.setItem('productos', JSON.stringify(productos));
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

function renderizarProductos() {
    const productosGrid = document.getElementById('productosGrid');
    const productoVacio = document.getElementById('productoVacio');
    if (!productosGrid) return;
    productosGrid.innerHTML = '';
    const productosFiltrados = categoriaSeleccionada === 'Todas'
        ? productos
        : productos.filter(p => p.categoria === categoriaSeleccionada);
    if (productosFiltrados.length === 0) {
        if (productoVacio) productoVacio.style.display = 'block';
        return;
    }
    if (productoVacio) productoVacio.style.display = 'none';
    productosFiltrados.forEach(producto => {
        const card = document.createElement('div');
        card.className = 'producto-card';
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.innerHTML = `
            ${producto.masVendido ? '<div class="badge-vendido">🔥 Más Vendido</div>' : ''}
            <div class="producto-image">
                <img src="${producto.imagen}" alt="${producto.nombre}" loading="lazy">
                ${producto.descuento > 0 ? `<div class="badge">-${producto.descuento}%</div>` : ''}
            </div>
            <h3>${producto.nombre}</h3>
            <p class="precio">
                ${producto.precioOriginal !== producto.precioActual ? `<span class="precio-original">$${producto.precioOriginal.toFixed(2)}</span>` : ''}
                <span class="precio-actual">$${producto.precioActual.toFixed(2)} USD</span>
            </p>
            <div class="stock">📦 Stock: ${producto.stock} unidades</div>
            <button class="btn btn-small btn-primary" onclick="event.stopPropagation(); contactarProducto('${producto.nombre}')">🛒 Comprar</button>
        `;
        productosGrid.appendChild(card);
    });
}

function abrirDetalleProducto(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;
    document.getElementById('detailProductName').textContent = p.nombre;
    document.getElementById('detailProductImage').src = p.imagen;
    document.getElementById('detailProductImage').alt = p.nombre;
    document.getElementById('detailProductCategory').textContent = obtenerIconoCategoria(p.categoria) + ' ' + p.categoria;
    document.getElementById('detailProductDescription').textContent = p.descripcion;
    const badge = document.getElementById('detailProductBadge');
    if (p.descuento > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = `-${p.descuento}%`;
    } else {
        badge.style.display = 'none';
    }
    const priceOriginal = document.getElementById('detailPriceOriginal');
    if (p.precioOriginal !== p.precioActual) {
        priceOriginal.style.display = 'inline';
        priceOriginal.textContent = `$${p.precioOriginal.toFixed(2)}`;
    } else {
        priceOriginal.style.display = 'none';
    }
    document.getElementById('detailPriceActual').textContent = `$${p.precioActual.toFixed(2)} USD`;
    document.getElementById('detailProductStock').innerHTML = `<span>📦 Solo quedan ${p.stock} unidades</span>`;
    document.getElementById('detailStockBarFill').style.width = `${Math.max(15, (p.stock / 20) * 100)}%`;
    document.getElementById('detailBuyBtn').onclick = () => contactarProducto(p.nombre);
    const modal = document.getElementById('productDetailModal');
    modal.classList.remove('hidden');
    modal.style.setProperty('display', 'flex', 'important');
    document.body.style.overflow = 'hidden';
}

function cerrarDetalleModal() {
    const modal = document.getElementById('productDetailModal');
    modal.classList.add('hidden');
    modal.style.setProperty('display', 'none', 'important');
    document.body.style.overflow = 'auto';
}

function contactarProducto(nombre) {
    const msg = encodeURIComponent(`Hola, me interesa el producto: ${nombre}. ¿Está disponible?`);
    window.open(`https://wa.me/5354320170?text=${msg}`, '_blank');
}

function actualizarListaProductos() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;
    productsList.innerHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: rgba(39, 174, 96, 0.1); border: 1px dashed #27AE60; border-radius: 10px; text-align: center;">
            <p style="font-size: 13px; margin-bottom: 10px;">Para guardar permanentemente, descarga y sube a GitHub.</p>
            <button class="btn btn-primary" onclick="descargarProductosJSON()">📥 Descargar productos.json</button>
        </div>
    `;
    if (productos.length === 0) {
        productsList.innerHTML += '<p class="no-products">No hay productos aún</p>';
        return;
    }
    productos.forEach(producto => {
        const item = document.createElement('div');
        item.className = 'product-item';
        item.innerHTML = `
            <div class="product-item-info">
                <img src="${producto.imagen}" alt="${producto.nombre}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;float:left;margin-right:12px;">
                <h4>${producto.nombre} ${producto.masVendido ? '🔥' : ''}</h4>
                <p><strong>Categoría:</strong> ${producto.categoria} | <strong>Precio:</strong> $${producto.precioActual.toFixed(2)} USD</p>
            </div>
            <div class="product-item-actions" style="clear:both;padding-top:8px;">
                <button class="btn-small-icon btn-edit" onclick="abrirEditModal(${producto.id})">✏️ Editar</button>
                <button class="btn-small-icon btn-delete" onclick="eliminarProducto(${producto.id})">🗑️ Eliminar</button>
            </div>
        `;
        productsList.appendChild(item);
    });
}

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
    const container = document.getElementById('botonesCategorias');
    if (!container) return;
    container.innerHTML = '';
    const btnTodas = document.createElement('button');
    btnTodas.className = `cat-btn ${categoriaSeleccionada === 'Todas' ? 'active' : ''}`;
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = () => mostrarVistaCategoria('Todas');
    container.appendChild(btnTodas);
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `cat-btn ${categoriaSeleccionada === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => mostrarVistaCategoria(cat);
        container.appendChild(btn);
    });
}

function actualizarListaCategorias() {
    const list = document.getElementById('categoriesList');
    if (!list) return;
    list.innerHTML = '';
    categorias.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <span>${obtenerIconoCategoria(cat)} ${cat}</span>
            <button class="btn-small-icon btn-delete" onclick="eliminarCategoria('${cat}')">🗑️</button>
        `;
        list.appendChild(item);
    });
}

function agregarCategoria() {
    const input = document.getElementById('newCategoryName');
    const nombre = input.value.trim();
    if (!nombre) return;
    if (categorias.includes(nombre)) { mostrarNotificacion('La categoría ya existe', 'error'); return; }
    categorias.push(nombre);
    localStorage.setItem('categorias', JSON.stringify(categorias));
    input.value = '';
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    actualizarListaCategorias();
    renderizarCategoriasHome();
    mostrarNotificacion('✅ Categoría agregada');
}

function eliminarCategoria(nombre) {
    if (nombre === 'General') { mostrarNotificacion('No puedes eliminar la categoría General', 'error'); return; }
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return;
    categorias = categorias.filter(c => c !== nombre);
    localStorage.setItem('categorias', JSON.stringify(categorias));
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    actualizarListaCategorias();
    renderizarCategoriasHome();
}

function eliminarProducto(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    productos = productos.filter(p => p.id !== id);
    guardarProductos();
    renderizarCategoriasHome();
    renderizarMasVendidos();
    renderizarProductos();
    actualizarListaProductos();
    mostrarNotificacion('🗑️ Producto eliminado');
}

function abrirEditModal(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;
    document.getElementById('editProductId').value = p.id;
    document.getElementById('editProductName').value = p.nombre;
    document.getElementById('editProductDescription').value = p.descripcion;
    document.getElementById('editProductPriceOriginal').value = p.precioOriginal;
    document.getElementById('editProductPriceActual').value = p.precioActual;
    document.getElementById('editProductDiscount').value = p.descuento;
    document.getElementById('editProductStock').value = p.stock;
    document.getElementById('editProductCategory').value = p.categoria;
    const masVendidoVal = document.getElementById('editProductMasVendido');
    if (masVendidoVal) masVendidoVal.value = p.masVendido ? 'true' : 'false';
    const modal = document.getElementById('editProductModal');
    modal.classList.remove('hidden');
    modal.style.setProperty('display', 'flex', 'important');
}

function cerrarEditModal() {
    const modal = document.getElementById('editProductModal');
    modal.classList.add('hidden');
    modal.style.setProperty('display', 'none', 'important');
}

function guardarEdicionProducto(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    if (index === -1) return;
    const masVendidoVal = document.getElementById('editProductMasVendido');
    productos[index] = {
        ...productos[index],
        nombre: document.getElementById('editProductName').value.trim(),
        descripcion: document.getElementById('editProductDescription').value.trim(),
        precioOriginal: parseFloat(document.getElementById('editProductPriceOriginal').value) || 0,
        precioActual: parseFloat(document.getElementById('editProductPriceActual').value) || 0,
        descuento: parseInt(document.getElementById('editProductDiscount').value) || 0,
        stock: parseInt(document.getElementById('editProductStock').value) || 0,
        categoria: document.getElementById('editProductCategory').value,
        masVendido: masVendidoVal ? masVendidoVal.value === 'true' : false
    };
    guardarProductos();
    cerrarEditModal();
    mostrarNotificacion('✅ Producto actualizado');
    renderizarCategoriasHome();
    renderizarMasVendidos();
    renderizarProductos();
    actualizarListaProductos();
}

function verificarOfertasYMostrarBanner() {
    const banner = document.getElementById('ofertaBanner');
    if (!banner) return;
    const tieneOfertas = productos.some(p => p.descuento > 0);
    banner.style.display = tieneOfertas ? 'block' : 'none';
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    cargarDatosDesdeGitHub();
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) document.body.classList.add('dark-mode');
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
});
