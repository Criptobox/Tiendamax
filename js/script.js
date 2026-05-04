'use strict';

// ===== CONFIGURACIÓN GLOBAL =====
const BACKEND_URL = 'https://5002-i6bdiswc6y2g1sau59ksd-1967fdb6.us2.manus.computer/api';
const PASSWORD_ADMIN = 'admin123';

let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';

// Sincronizar datos entre pestañas/ventanas
window.addEventListener('storage', (event) => {
    if (event.key === 'productos') {
        productos = JSON.parse(event.newValue) || [];
        renderizarProductos();
        actualizarListaProductos();
    }
    if (event.key === 'categorias') {
        categorias = JSON.parse(event.newValue) || ['General'];
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
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
    const el = document.querySelector('#productos');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

// Inicializar modo oscuro
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

// ===== AUTENTICACIÓN =====

function abrirLoginAdmin() {
    document.getElementById('loginModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('adminPassword').focus(), 100);
}

function cerrarLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
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
    document.getElementById('adminPanel').classList.remove('hidden');
    actualizarListaProductos();
    actualizarSelectCategorias();
    actualizarListaCategorias();
    verificarEstadoBackend();
}

function cerrarAdminPanel() {
    document.getElementById('adminPanel').classList.add('hidden');
}

function switchTab(tabName) {
    // Quitar activo de todos los contenidos
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    // Quitar activo de todos los botones
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Activar el seleccionado
    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    
    // Activar el botón (usando event.currentTarget o buscando por onclick)
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('onclick').includes(tabName)) btn.classList.add('active');
        });
    }
    
    if (tabName === 'publicar-ahora') cargarEstadoPublicacion();
}

// ===== NOTIFICACIONES =====

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
    setTimeout(() => { notif.style.opacity = '0'; notif.style.transition = 'opacity 0.3s'; setTimeout(() => notif.remove(), 300); }, 4000);
}

// ===== PRODUCTOS =====

function agregarProductoForm(event) {
    event.preventDefault();
    const fileInput = document.getElementById('productImage');
    const file = fileInput.files[0];
    if (!file) { mostrarNotificacion('Por favor selecciona una imagen', 'error'); return; }

    const reader = new FileReader();
    reader.onload = function(e) {
        const producto = {
            id: Date.now(),
            nombre: document.getElementById('productName').value.trim(),
            descripcion: document.getElementById('productDescription').value.trim(),
            imagen: e.target.result,
            precioOriginal: parseFloat(document.getElementById('productPriceOriginal').value),
            precioActual: parseFloat(document.getElementById('productPriceActual').value),
            descuento: parseInt(document.getElementById('productDiscount').value),
            stock: parseInt(document.getElementById('productStock').value),
            categoria: document.getElementById('productCategory').value
        };
        productos.push(producto);
        guardarProductos();
        sincronizarConBackend();
        document.getElementById('productForm').reset();
        mostrarNotificacion('✅ ¡Producto agregado exitosamente!');
        renderizarProductos();
        actualizarListaProductos();
    };
    reader.readAsDataURL(file);
}

function guardarProductos() {
    localStorage.setItem('productos', JSON.stringify(productos));
}

function guardarCategorias() {
    localStorage.setItem('categorias', JSON.stringify(categorias));
}

async function sincronizarConBackend() {
    try {
        await fetch(`${BACKEND_URL}/productos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productos)
        });
    } catch (e) {
        console.warn('Backend no disponible para sincronización');
    }
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
        card.innerHTML = `
            <div class="producto-image">
                <img src="${producto.imagen}" alt="${producto.nombre}" loading="lazy">
                ${producto.descuento > 0 ? `<div class="badge">-${producto.descuento}%</div>` : ''}
            </div>
            <h3>${producto.nombre}</h3>
            <p class="producto-description">${producto.descripcion}</p>
            <p class="precio">
                ${producto.precioOriginal !== producto.precioActual ? `<span class="precio-original">$${producto.precioOriginal.toFixed(2)}</span>` : ''}
                <span class="precio-actual">$${producto.precioActual.toFixed(2)} USD</span>
            </p>
            <p class="stock">📦 ${producto.stock <= 5 ? `⚠️ ¡Solo ${producto.stock} unidades!` : `${producto.stock} unidades disponibles`}</p>
            <button class="btn btn-small btn-primary" onclick="contactarProducto('${producto.nombre}')">🛒 Comprar</button>
        `;
        productosGrid.appendChild(card);
    });
}

function contactarProducto(nombre) {
    const msg = encodeURIComponent(`Hola, me interesa el producto: ${nombre}. ¿Está disponible?`);
    window.open(`https://wa.me/5354320170?text=${msg}`, '_blank');
}

function actualizarListaProductos() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;
    
    productsList.innerHTML = '';
    if (productos.length === 0) {
        productsList.innerHTML = '<p class="no-products">No hay productos aún</p>';
        return;
    }
    productos.forEach(producto => {
        const item = document.createElement('div');
        item.className = 'product-item';
        item.innerHTML = `
            <div class="product-item-info">
                <img src="${producto.imagen}" alt="${producto.nombre}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;float:left;margin-right:12px;">
                <h4>${producto.nombre}</h4>
                <p><strong>Categoría:</strong> ${producto.categoria} | <strong>Precio:</strong> $${producto.precioActual.toFixed(2)} USD | <strong>Stock:</strong> ${producto.stock} uds</p>
            </div>
            <div class="product-item-actions" style="clear:both;padding-top:8px;">
                <button class="btn-small-icon btn-edit" onclick="abrirEditModal(${producto.id})">✏️ Editar</button>
                <button class="btn-small-icon btn-delete" onclick="eliminarProducto(${producto.id})">🗑️ Eliminar</button>
                <button class="btn-small-icon btn-revolico" onclick="publicarEnRevolico(${producto.id})">📤 Revolico</button>
            </div>
        `;
        productsList.appendChild(item);
    });
}

// ===== CATEGORÍAS =====

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
    const filtro = document.getElementById('categoriaFiltro');
    if (!filtro) return;
    filtro.innerHTML = '<button class="categoria-btn active" onclick="filtrarPorCategoria(\'Todas\')">Todas</button>';
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'categoria-btn';
        btn.textContent = cat;
        btn.onclick = () => filtrarPorCategoria(cat);
        filtro.appendChild(btn);
    });
}

function filtrarPorCategoria(categoria) {
    categoriaSeleccionada = categoria;
    document.querySelectorAll('.categoria-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === categoria);
    });
    renderizarProductos();
}

function actualizarListaCategorias() {
    const list = document.getElementById('categoriesList');
    if (!list) return;
    list.innerHTML = '';
    categorias.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;';
        item.innerHTML = `
            <span>${cat}</span>
            ${cat !== 'General' ? `<button class="btn-small-icon btn-delete" onclick="eliminarCategoria(${index})">🗑️</button>` : ''}
        `;
        list.appendChild(item);
    });
}

function agregarCategoria() {
    const nombre = prompt('Nombre de la nueva categoria:');
    if (nombre && nombre.trim()) {
        const cat = nombre.trim();
        if (!categorias.includes(cat)) {
            categorias.push(cat);
            guardarCategorias();
            actualizarSelectCategorias();
            actualizarBotonesCategorias();
            actualizarListaCategorias();
            mostrarNotificacion('✅ Categoria agregada');
        } else {
            mostrarNotificacion('❌ La categoria ya existe', 'error');
        }
    }
}

function eliminarCategoria(index) {
    if (confirm(`¿Eliminar la categoria "${categorias[index]}"?`)) {
        categorias.splice(index, 1);
        guardarCategorias();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarProductos();
    }
}

// ===== EDICIÓN =====

function abrirEditModal(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;
    document.getElementById('editProductId').value = p.id;
    document.getElementById('editProductName').value = p.nombre;
    document.getElementById('editProductDescription').value = p.descripcion;
    document.getElementById('editProductCategory').value = p.categoria;
    document.getElementById('editProductPriceOriginal').value = p.precioOriginal;
    document.getElementById('editProductPriceActual').value = p.precioActual;
    document.getElementById('editProductDiscount').value = p.descuento;
    document.getElementById('editProductStock').value = p.stock;
    document.getElementById('currentImagePreview').innerHTML = `<img src="${p.imagen}" style="width:100px;border-radius:8px;">`;
    document.getElementById('editModal').classList.remove('hidden');
}

function cerrarEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editForm').reset();
}

function guardarProductoEditado(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    if (index === -1) return;

    const fileInput = document.getElementById('editProductImage');
    const file = fileInput.files[0];

    const updateData = () => {
        productos[index].nombre = document.getElementById('editProductName').value.trim();
        productos[index].descripcion = document.getElementById('editProductDescription').value.trim();
        productos[index].categoria = document.getElementById('editProductCategory').value;
        productos[index].precioOriginal = parseFloat(document.getElementById('editProductPriceOriginal').value);
        productos[index].precioActual = parseFloat(document.getElementById('editProductPriceActual').value);
        productos[index].descuento = parseInt(document.getElementById('editProductDiscount').value);
        productos[index].stock = parseInt(document.getElementById('editProductStock').value);
        
        guardarProductos();
        sincronizarConBackend();
        cerrarEditModal();
        mostrarNotificacion('✅ Cambios guardados');
        renderizarProductos();
        actualizarListaProductos();
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            productos[index].imagen = e.target.result;
            updateData();
        };
        reader.readAsDataURL(file);
    } else {
        updateData();
    }
}

function eliminarProducto(id) {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
        productos = productos.filter(p => p.id !== id);
        guardarProductos();
        sincronizarConBackend();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('🗑️ Producto eliminado');
    }
}

// ===== INTEGRACIÓN BACKEND (REVOLICO) =====

async function verificarEstadoBackend() {
    const statusEl = document.getElementById('backendStatus');
    if (!statusEl) return;
    try {
        const res = await fetch(`${BACKEND_URL}/status`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        if (data.status === 'online') {
            statusEl.innerHTML = `<span style="color:#27AE60">✅ Backend activo</span> | Hora Cuba: ${data.hora_cuba} | Próxima publicación: ${data.proxima_publicacion || 'No programada'}`;
        } else {
            statusEl.innerHTML = '<span style="color:#E74C3C">⚠️ Backend inactivo</span>';
        }
    } catch (e) {
        statusEl.innerHTML = '<span style="color:#E74C3C">❌ Sin conexión con el backend</span>';
    }
}

async function cargarEstadoPublicacion() {
    verificarEstadoBackend();
    const historialEl = document.getElementById('historialPublicaciones');
    if (!historialEl) return;
    try {
        const res = await fetch(`${BACKEND_URL}/historial`);
        const data = await res.json();
        if (data && data.length > 0) {
            historialEl.innerHTML = data.reverse().slice(0, 5).map(reg => `
                <div class="historial-item" style="padding:10px; border-bottom:1px solid #eee; font-size:13px;">
                    <strong>${new Date(reg.fecha).toLocaleDateString()} ${reg.hora}</strong>: 
                    ${reg.exitosos}/${reg.total} exitosos
                </div>
            `).join('');
        } else {
            historialEl.innerHTML = '<p style="color:#666;font-size:13px">No hay historial disponible</p>';
        }
    } catch (e) {
        historialEl.innerHTML = '<p style="color:#E74C3C;font-size:13px">Error cargando historial</p>';
    }
}

async function publicarEnRevolico(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;
    mostrarNotificacion(`📤 Publicando "${p.nombre}" en Revolico...`, 'info');
    try {
        const res = await fetch(`${BACKEND_URL}/publicar-revolico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
        });
        const data = await res.json();
        if (data.success) {
            mostrarNotificacion(`✅ Publicado: ${p.nombre}`);
            if (data.url) window.open(data.url, '_blank');
        } else {
            mostrarNotificacion(`❌ Error: ${data.error}`, 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error de conexión', 'error');
    }
}

async function publicarAhora() {
    const btn = document.getElementById('btnPublicarAhora');
    if (btn) { btn.textContent = '⏳ Publicando...'; btn.disabled = true; }
    const resEl = document.getElementById('resultadoPublicacion');
    if (resEl) resEl.innerHTML = '<p>🚀 Iniciando publicación de todos los productos...</p>';
    
    try {
        const res = await fetch(`${BACKEND_URL}/publicar-ahora`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productos)
        });
        const data = await res.json();
        if (data.success) {
            mostrarNotificacion('✅ Proceso de publicación completado');
            if (resEl) {
                resEl.innerHTML = `
                    <div style="background:#E8F5E9; padding:15px; border-radius:8px; border:1px solid #2E7D32; margin-top:10px;">
                        <h4 style="color:#2E7D32; margin-top:0;">✅ ¡Éxito!</h4>
                        <p>${data.mensaje}</p>
                        <div style="max-height:150px; overflow-y:auto; margin-top:10px; font-size:12px;">
                            ${data.resultados.map(r => `
                                <div style="margin-bottom:4px; padding-bottom:4px; border-bottom:1px solid #C8E6C9;">
                                    ${r.exito ? '✅' : '❌'} ${r.producto}: ${r.mensaje || r.error || ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        } else {
            mostrarNotificacion(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error conectando al servidor', 'error');
    }
    if (btn) { btn.textContent = '🚀 Publicar Ahora en Revolico'; btn.disabled = false; }
    cargarEstadoPublicacion();
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    // Renderizar UI
    renderizarProductos();
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    actualizarListaCategorias();
    
    // Smooth Scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    
    // Verificar backend
    verificarEstadoBackend();
});

// Cerrar modales al hacer clic fuera
document.addEventListener('click', function(event) {
    const editModal = document.getElementById('editModal');
    const loginModal = document.getElementById('loginModal');
    const adminPanel = document.getElementById('adminPanel');
    
    if (event.target === editModal) cerrarEditModal();
    if (event.target === loginModal) cerrarLoginModal();
    if (event.target === adminPanel) cerrarAdminPanel();
});
