'use strict';

// ===== CONFIGURACIÓN GLOBAL =====
const BACKEND_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://127.0.0.1:5002/api' 
    : '/api';
// Contraseña hasheada (SHA-256 de 'Cripx') para que no sea visible en texto plano
const PASSWORD_ADMIN_HASH = 'a338781ef2610e22bde9dae45f2d8aaa6a8a8c4584158f18cd91089b9192bc62';

let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';

// Iconos para cada categoría (Mapeo automático por palabras clave)
const ICONOS_MAPA = {
    'wifi': '📡', 'internet': '📡', 'red': '📡', 'router': '📡',
    'energia': '⚡', 'bateria': '⚡', 'luz': '⚡', 'corriente': '⚡', 'inversor': '⚡',
    'celular': '📱', 'telefono': '📱', 'movil': '📱', 'iphone': '📱', 'android': '📱',
    'utiles': '🔧', 'herramienta': '🔧', 'reparacion': '🔧', 'ferreteria': '🔧',
    'ropa': '👗', 'vestir': '👗', 'moda': '👗', 'calzado': '👗', 'zapatos': '👗',
    'electronica': '💻', 'computadora': '💻', 'laptop': '💻', 'tecnologia': '💻',
    'hogar': '🏠', 'casa': '🏠', 'mueble': '🏠', 'cocina': '🏠',
    'alimento': '🍎', 'comida': '🍎', 'fruta': '🍎', 'dulce': '🍎',
    'belleza': '💄', 'maquillaje': '💄', 'perfume': '💄', 'cuidado': '💄',
    'deporte': '⚽', 'gym': '⚽', 'ejercicio': '⚽', 'fitness': '⚽',
    'juguete': '🧸', 'niño': '🧸', 'bebe': '🧸', 'diversion': '🧸',
    'libro': '📚', 'estudio': '📚', 'papeleria': '📚', 'escuela': '📚',
    'auto': '🚗', 'carro': '🚗', 'moto': '🚗', 'vehiculo': '🚗', 'repuesto': '🚗',
    'reloj': '⌚', 'joya': '💎', 'accesorio': '💍',
    'mascota': '🐾', 'perro': '🐾', 'gato': '🐾',
    'musica': '🎵', 'audio': '🔊', 'sonido': '🔊',
    'viaje': '✈️', 'maleta': '🧳',
    'general': '🛍️'
};

// Cargar iconos personalizados desde localStorage
let iconosPersonalizados = JSON.parse(localStorage.getItem('iconosPersonalizados')) || {};

function obtenerIconoCategoria(nombre) {
    if (!nombre) return '🛍️';
    
    // 1. Prioridad: Icono personalizado guardado por el usuario
    if (iconosPersonalizados[nombre]) return iconosPersonalizados[nombre];
    
    // 2. Mapeo automático por palabras clave
    const nombreMinus = nombre.toLowerCase();
    for (const [clave, icono] of Object.entries(ICONOS_MAPA)) {
        if (nombreMinus.includes(clave)) return icono;
    }
    
    // 3. Por defecto: Icono de "Todos" (🛍️) si no se encuentra nada
    return '🛍️';
}

// ===== VALIDACIÓN DE CAMPOS =====

function validarProducto(producto) {
    const errores = [];
    
    if (!producto.nombre || producto.nombre.trim().length === 0) {
        errores.push('El nombre del producto es requerido');
    }
    if (!producto.descripcion || producto.descripcion.trim().length === 0) {
        errores.push('La descripción es requerida');
    }
    if (!producto.imagen) {
        errores.push('La imagen es requerida');
    }
    if (!producto.precioActual || producto.precioActual <= 0) {
        errores.push('El precio debe ser mayor a 0');
    }
    if (!producto.stock || producto.stock <= 0) {
        errores.push('El stock debe ser mayor a 0');
    }
    if (!producto.categoria) {
        errores.push('La categoría es requerida');
    }
    
    // Solo calcular descuento si hay precio original definido
    if (producto.precioOriginal && producto.precioOriginal > 0 && producto.precioOriginal > producto.precioActual) {
        const descuentoCalculado = Math.round(((producto.precioOriginal - producto.precioActual) / producto.precioOriginal) * 100);
        producto.descuento = descuentoCalculado;
    } else if (!producto.descuento) {
        producto.descuento = 0;
    }
    
    return errores;
}

// ===== CARGA DE DATOS DESDE GITHUB =====

// Función para hashear la contraseña
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cargarDatosDesdeGitHub() {
    try {
        const resProd = await fetch('productos.json', { cache: 'no-store' });
        if (resProd.ok) {
            const data = await resProd.json();
            if (data && data.length > 0) {
                productos = data;
                localStorage.setItem('productos', JSON.stringify(productos));
            }
        }
        const resCat = await fetch('categorias.json', { cache: 'no-store' });
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
        console.log('✅ Datos sincronizados con GitHub');
    } catch (e) {
        console.log('ℹ️ Iniciando con datos locales');
        renderizarCategoriasHome();
        renderizarMasVendidos();
        verificarOfertasYMostrarBanner();
    }
}

// Sincronizar entre pestañas
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

// ===== FUNCIONES DE UTILIDAD =====

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

function mostrarNotificacion(mensaje, tipo = 'success') {
    const notif = document.createElement('div');
    notif.className = `notificacion notif-${tipo}`;
    notif.textContent = mensaje;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${tipo === 'error' ? '#e74c3c' : tipo === 'info' ? '#3498db' : '#27ae60'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
}

// ===== NAVEGACIÓN ENTRE VISTAS =====

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

// ===== RENDERIZAR CATEGORÍAS EN LA HOME =====

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

// ===== RENDERIZAR MÁS VENDIDOS =====

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
	            <p class="producto-description">${producto.descripcion}</p>
	            <p class="precio">
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

// ===== AUTENTICACIÓN =====

function abrirLoginAdmin() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
    setTimeout(() => document.getElementById('adminPassword').focus(), 100);
}

function cerrarLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    document.getElementById('adminPassword').value = '';
}

async function verificarPassword(event) {
    event.preventDefault();
    const passwordInput = document.getElementById('adminPassword').value.trim();
    const inputHash = await hashPassword(passwordInput);
    
    // El hash 'a338...' es de 'Cripx'
    // El hash '9003...' es el que tenía el usuario originalmente
    const hashesValidos = [
        'a338781ef2610e22bde9dae45f2d8aaa6a8a8c4584158f18cd91089b9192bc62',
        '90035f586903f0259868846c2459740b957630712759861619894101e405187e'
    ];
    
    console.log('Intento de login con hash:', inputHash);
    
    if (hashesValidos.includes(inputHash)) {
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
    panel.style.removeProperty('display');
    actualizarListaProductos();
    actualizarSelectCategorias();
    actualizarListaCategorias();
    verificarEstadoBackend();
}

function cerrarAdminPanel() {
    const panel = document.getElementById('adminPanel');
    panel.classList.add('hidden');
    panel.classList.remove('visible');
    panel.style.removeProperty('display');
}

function switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
    });
}

// ===== PRODUCTOS =====

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
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            descuento: parseInt(document.getElementById('productDiscount').value) || 0,
            stock: parseInt(document.getElementById('productStock').value) || 0,
            categoria: document.getElementById('productCategory').value,
            masVendido: masVendidoVal ? masVendidoVal.value === 'true' : false,
            // Nuevos campos psicológicos y de estado
            usado: document.getElementById('productUsado').checked,
            garantia: document.getElementById('productGarantia').value.trim(),
            devolucion: document.getElementById('productDevolucion') ? document.getElementById('productDevolucion').checked : false
        };

        // Validar producto
        const errores = validarProducto(producto);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos.push(producto);
        guardarProductos();
        sincronizarConGitHub();
        document.getElementById('productForm').reset();
        mostrarNotificacion('✅ ¡Producto agregado exitosamente!');
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        verificarOfertasYMostrarBanner();
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

async function sincronizarConBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/productos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productos)
        });
        return response.ok;
    } catch (e) {
        console.warn('Backend no disponible para sincronización');
        return false;
    }
}

// ===== RENDERIZAR PRODUCTOS =====

function renderizarProductos() {
    const productosGrid = document.getElementById('productosGrid');
    if (!productosGrid) return;

    const productosFiltrados = categoriaSeleccionada === 'Todas' 
        ? productos 
        : productos.filter(p => p.categoria === categoriaSeleccionada);

    productosGrid.innerHTML = '';

    if (productosFiltrados.length === 0) {
        productosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px;">No hay productos en esta categoría</p>';
        return;
    }

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
            <p class="producto-description">${producto.descripcion}</p>
	            <p class="precio">
	                <span class="precio-actual">$${producto.precioActual.toFixed(2)} USD</span>
	            </p>
            <div class="stock">📦 Stock: ${producto.stock} unidades</div>
            <button class="btn btn-small btn-primary" onclick="event.stopPropagation(); contactarProducto('${producto.nombre}')">🛒 Comprar</button>
        `;
        productosGrid.appendChild(card);
    });
}

// ===== DETALLE DE PRODUCTO =====

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
    if (priceOriginal) priceOriginal.style.display = 'none';

    const discountBadge = document.getElementById('detailProductBadge');
    if (p.descuento > 0) {
        discountBadge.style.display = 'inline-block';
        discountBadge.textContent = `-${p.descuento}%`;
    } else {
        discountBadge.style.display = 'none';
    }

    document.getElementById('detailPriceActual').textContent = `$${p.precioActual.toFixed(2)} USD`;
    document.getElementById('detailProductStock').innerHTML = `<span>📦 Solo quedan ${p.stock} unidades</span>`;
    document.getElementById('detailStockBarFill').style.width = `${Math.max(15, (p.stock / 20) * 100)}%`;
    
    document.getElementById('detailBuyBtn').onclick = () => contactarProducto(p.nombre);

    const modal = document.getElementById('productDetailModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = 'hidden';
}

function cerrarDetalleModal() {
    const modal = document.getElementById('productDetailModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
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
                <p><strong>Categoría:</strong> ${producto.categoria} | <strong>Precio:</strong> $${producto.precioActual.toFixed(2)} USD ${producto.descuento > 0 ? `(-${producto.descuento}%)` : ''}</p>
            </div>
            <div class="product-item-actions" style="clear:both;padding-top:8px;">
                <button class="btn-small-icon btn-edit" onclick="abrirEditModal(${producto.id})">✏️ Editar</button>
                <button class="btn-small-icon btn-delete" onclick="eliminarProducto(${producto.id})">🗑️ Eliminar</button>
                <button class="btn-small-icon btn-revolico" style="background:#ff9800" onclick="copiarParaRevolico(${producto.id})">📋 Revolico</button>
                <button class="btn-small-icon btn-revolico" style="background:#4267B2" onclick="copiarParaFacebook(${producto.id})">📋 Facebook</button>
                <button class="btn-small-icon btn-revolico" onclick="publicarEnRevolico(${producto.id})">🤖 Rev</button>
                <button class="btn-small-icon btn-revolico" style="background:#4267B2" onclick="publicarEnFacebook(${producto.id})">🤖 FB</button>
            </div>
        `;
        productsList.appendChild(item);
    });
}

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
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank'); }, 500);
    }).catch(() => { 
        window.open('https://www.revolico.com/item/publish', '_blank');
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
        setTimeout(() => { window.open('https://www.facebook.com/groups/feed/', '_blank'); }, 500);
    }).catch(() => { 
        window.open('https://www.facebook.com/groups/feed/', '_blank');
    });
}

// ===== PUBLICACIÓN EN REVOLICO =====

function prepararPublicacionManual(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    const texto = `${producto.nombre}\n\n${producto.descripcion}\n\nPrecio: ${producto.precioActual} USD\nContacto: +53 54320170`;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank'); }, 1000);
    }).catch(() => { window.open('https://www.revolico.com/item/publish', '_blank'); });
}

async function publicarEnRevolico(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    mostrarNotificacion(`🚀 Publicando "${producto.nombre}" en Revolico...`, 'info');
    try {
        const response = await fetch(`${BACKEND_URL}/publicar-revolico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(producto)
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion(`✅ ¡Publicado en Revolico!: ${producto.nombre}`);
        } else {
            mostrarNotificacion(`❌ Error Revolico: ${data.error || 'Fallo'}`, 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error de conexión con el backend', 'error');
    }
}

async function publicarEnFacebook(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    mostrarNotificacion(`🚀 Publicando "${producto.nombre}" en Facebook...`, 'info');
    try {
        const response = await fetch(`${BACKEND_URL}/publicar-facebook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(producto)
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion(`✅ ¡Publicado en Facebook!: ${producto.nombre}`);
        } else {
            mostrarNotificacion(`❌ Error Facebook: ${data.error || 'Fallo'}`, 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error de conexión con el backend', 'error');
    }
}

async function publicarAhora() {
    const btn = document.getElementById('btnPublicarAhora');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }
    mostrarNotificacion('🚀 Iniciando publicación automática en Revolico...', 'info');
    try {
        const response = await fetch(`${BACKEND_URL}/publicar-ahora`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productos)
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion(`✅ ${data.mensaje}`);
            cargarEstadoPublicacion();
        } else {
            mostrarNotificacion(`❌ Error: ${data.error}`, 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error de conexión con el backend', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Publicar Ahora en Revolico (Automático)'; }
    }
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

    list.innerHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: rgba(52, 152, 219, 0.1); border: 1px dashed #3498DB; border-radius: 10px; text-align: center;">
            <p style="font-size: 13px; margin-bottom: 10px;">Para guardar tus categorías permanentemente, descarga este archivo y súbelo a GitHub.</p>
            <button class="btn btn-primary" style="background:#3498DB" onclick="descargarCategoriasJSON()">📥 Descargar categorias.json</button>
        </div>
    `;

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
    mostrarNotificacion('✅ Categoría agregada');
}

function guardarCategorias() {
    localStorage.setItem('categorias', JSON.stringify(categorias));
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
    }
}

// ===== GESTIÓN DE PRODUCTOS (EDITAR/ELIMINAR) =====

function eliminarProducto(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    productos = productos.filter(p => p.id !== id);
    guardarProductos();
    sincronizarConBackend();
    renderizarCategoriasHome();
    renderizarMasVendidos();
    renderizarProductos();
    actualizarListaProductos();
    verificarOfertasYMostrarBanner();
    mostrarNotificacion('🗑️ Producto eliminado', 'info');
}

function abrirEditModal(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('editProductName').value = p.nombre;
    document.getElementById('editProductDescription').value = p.descripcion;
    document.getElementById('editProductPriceActual').value = p.precioActual;
    document.getElementById('editProductDiscount').value = p.descuento || '';
    document.getElementById('editProductStock').value = p.stock;
    document.getElementById('editProductCategory').value = p.categoria;
    
    // Nuevos campos en edición
    if (document.getElementById('editProductUsado')) document.getElementById('editProductUsado').checked = p.usado || false;
    if (document.getElementById('editProductGarantia')) document.getElementById('editProductGarantia').value = p.garantia || '';
    if (document.getElementById('editProductDevolucion')) document.getElementById('editProductDevolucion').checked = p.devolucion || false;

    const masVendidoSel = document.getElementById('editProductMasVendido');
    if (masVendidoSel) masVendidoSel.value = p.masVendido ? 'true' : 'false';

    const preview = document.getElementById('currentImagePreview');
    if (preview && p.imagen) {
        preview.innerHTML = `<img src="${p.imagen}" style="max-width:100px;max-height:80px;border-radius:8px;">`;
    }

    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
}

function cerrarEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
}

function guardarProductoEditado(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    if (index === -1) return;

    const masVendidoSel = document.getElementById('editProductMasVendido');
    const fileInput = document.getElementById('editProductImage');
    const file = fileInput ? fileInput.files[0] : null;

    const actualizarProducto = (nuevaImagen) => {
        const productoActualizado = {
            ...productos[index],
            nombre: document.getElementById('editProductName').value.trim(),
            descripcion: document.getElementById('editProductDescription').value.trim(),
            precioActual: parseFloat(document.getElementById('editProductPriceActual').value) || 0,
            descuento: parseInt(document.getElementById('editProductDiscount').value) || 0,
            stock: parseInt(document.getElementById('editProductStock').value) || 0,
            categoria: document.getElementById('editProductCategory').value,
            masVendido: masVendidoSel ? masVendidoSel.value === 'true' : productos[index].masVendido,
            imagen: nuevaImagen || productos[index].imagen,
            // Nuevos campos psicológicos y de estado
            usado: document.getElementById('editProductUsado') ? document.getElementById('editProductUsado').checked : productos[index].usado,
            garantia: document.getElementById('editProductGarantia') ? document.getElementById('editProductGarantia').value.trim() : productos[index].garantia,
            devolucion: document.getElementById('editProductDevolucion') ? document.getElementById('editProductDevolucion').checked : productos[index].devolucion
        };

        // Validar producto
        const errores = validarProducto(productoActualizado);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos[index] = productoActualizado;
        guardarProductos();
        sincronizarConGitHub();
        cerrarEditModal();
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('✅ Producto actualizado');
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => actualizarProducto(e.target.result);
        reader.readAsDataURL(file);
    } else {
        actualizarProducto(null);
    }
}

// ===== ESTADO DEL BACKEND =====

async function verificarEstadoBackend() {
    const statusEl = document.getElementById('backendStatus');
    if (!statusEl) return;
    try {
        const response = await fetch(`${BACKEND_URL}/status`);
        const data = await response.json();
        if (data.status === 'online') {
            statusEl.innerHTML = `✅ <strong>Backend activo</strong> | Hora Cuba: ${data.hora_cuba} | Próxima publicación: ${data.proxima_publicacion || 'No programada'}`;
            statusEl.style.color = '#27AE60';
        }
    } catch (e) {
        statusEl.innerHTML = '❌ <strong>Backend desconectado</strong> (El agente automático no está corriendo)';
        statusEl.style.color = '#E74C3C';
    }
}

async function cargarEstadoPublicacion() {
    const logContainer = document.getElementById('historialPublicaciones');
    if (!logContainer) return;
    try {
        const response = await fetch(`${BACKEND_URL}/historial`);
        const registros = await response.json();
        if (registros.length === 0) {
            logContainer.innerHTML = '<p>No hay historial de publicaciones aún.</p>';
            return;
        }
        let html = '<div class="logs-list">';
        registros.reverse().forEach(reg => {
            const fecha = new Date(reg.fecha).toLocaleString();
            html += `
                <div class="log-item">
                    <div class="log-header">
                        <strong>${fecha}</strong> - ${reg.exitosos}/${reg.total} exitosos
                    </div>
                    <ul class="log-details">
                        ${reg.resultados.map(res => `
                            <li class="${res.exito ? 'success' : 'error'}">
                                ${res.producto}: ${res.exito ? '✅' : '❌'} ${res.mensaje}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        });
        html += '</div>';
        logContainer.innerHTML = html;
    } catch (e) {
        logContainer.innerHTML = '<p>No se pudo cargar el historial.</p>';
    }
}

// ===== SINCRONIZACIÓN CON GITHUB =====

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

async function sincronizarTodoConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        mostrarNotificacion('❌ Configura primero tu usuario, repo y token en la pestaña Configuración', 'error');
        switchTab('configuracion');
        return;
    }
    mostrarNotificacion('🚀 Sincronizando todo con GitHub...', 'info');
    try {
        // Sincronizar productos
        await subirArchivoAGitHub(user, repo, token, 'productos.json', productos);
        // Sincronizar categorías
        await subirArchivoAGitHub(user, repo, token, 'categorias.json', categorias);
        // Sincronizar subcategorías
        const subcats = JSON.parse(localStorage.getItem('subcategorias')) || {};
        await subirArchivoAGitHub(user, repo, token, 'subcategorias.json', subcats);
        
        mostrarNotificacion('✅ ¡Tienda, categorías y subcategorías sincronizadas! Los cambios serán visibles en 1-2 minutos.');
    } catch (e) {
        mostrarNotificacion('❌ Error al sincronizar: ' + e.message, 'error');
    }
}

async function sincronizarConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        console.log('ℹ️ GitHub no configurado. Saltando sincronización automática.');
        return;
    }
    try {
        await subirArchivoAGitHub(user, repo, token, 'productos.json', productos);
        console.log('✅ Productos sincronizados con GitHub automáticamente');
    } catch (e) {
        console.warn('⚠️ Error al sincronizar automáticamente:', e.message);
    }
}

async function subirArchivoAGitHub(user, repo, token, path, data) {
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${path}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    let sha = null;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
        if (res.ok) { const fileData = await res.json(); sha = fileData.sha; }
    } catch (e) {}
    const body = { message: `Actualización automática de ${path}`, content: content, sha: sha };
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error al subir archivo');
    }
}

// ===== LÓGICA DE PERSUASIÓN Y VENTAS =====

function verificarOfertasYMostrarBanner() {
    const banner = document.getElementById('urgenciaBanner');
    if (!banner) return;

    const hayOfertas = productos.some(p => parseFloat(p.precioOriginal) > parseFloat(p.precioActual));

    if (hayOfertas) {
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

// ===== INICIALIZACIÓN =====

function inicializarTienda() {
    console.log("🚀 Inicializando TiendaMax...");
    
    cargarDatosDesdeGitHub();

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.onsubmit = null;
        productForm.addEventListener('submit', agregarProductoForm);
    }

    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.onsubmit = null;
        editForm.addEventListener('submit', guardarProductoEditado);
    }

    const loginForm = document.querySelector('#loginModal form');
    if (loginForm) {
        loginForm.onsubmit = null;
        loginForm.addEventListener('submit', verificarPassword);
    }

    setInterval(() => {
        const panel = document.getElementById('adminPanel');
        if (panel && !panel.classList.contains('hidden')) {
            verificarEstadoBackend();
        }
    }, 30000);

    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        const btn = document.querySelector('.theme-toggle');
        if (btn) btn.textContent = '☀️';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarTienda);
} else {
    inicializarTienda();
}

// ===== AUTOMATIZACIÓN HÍBRIDA (SELENIUM) =====

async function abrirNavegadorParaLogin() {
    const btn = document.getElementById('btnAbrirNavegador');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Abriendo...'; }
    mostrarNotificacion('🌐 Abriendo ventana de Chrome. Por favor, inicia sesión en Revolico.', 'info');
    try {
        const response = await fetch(`${BACKEND_URL}/abrir-navegador`);
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('✅ Navegador abierto. Inicia sesión y luego dale a "Publicar Todo".');
        } else {
            mostrarNotificacion('❌ No se pudo abrir el navegador. ¿Instalaste Chrome?', 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error de conexión con el backend', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔓 1. Abrir Navegador y Loguearme'; }
    }
}
