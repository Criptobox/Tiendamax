'use strict';

// ===== CONFIGURACIÓN GLOBAL =====
const BACKEND_URL = 'https://5002-i6bdiswc6y2g1sau59ksd-1967fdb6.us2.manus.computer/api';
const PASSWORD_ADMIN = 'admin123';

let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';

// Intentar cargar datos desde el archivo JSON de GitHub al iniciar
async function cargarDatosDesdeGitHub() {
    try {
        // Cargar productos
        const resProd = await fetch('productos.json?v=' + Date.now());
        if (resProd.ok) {
            const data = await resProd.json();
            if (data && data.length > 0) {
                productos = data;
                localStorage.setItem('productos', JSON.stringify(productos));
            }
        }
        
        // Cargar categorías
        const resCat = await fetch('categorias.json?v=' + Date.now());
        if (resCat.ok) {
            const data = await resCat.json();
            if (data && data.length > 0) {
                categorias = data;
                localStorage.setItem('categorias', JSON.stringify(categorias));
            }
        }
        
        renderizarProductos();
        actualizarListaProductos();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        console.log('✅ Datos sincronizados con GitHub');
    } catch (e) {
        console.log('ℹ️ Iniciando con datos locales');
    }
}

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
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    
    // Marcar botón activo
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabName)) {
            btn.classList.add('active');
        }
    });
    
    if (tabName === 'publicar-ahora') cargarEstadoPublicacion();
    if (tabName === 'configuracion') cargarConfiguracionGitHub();
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
    setTimeout(() => { 
        notif.style.opacity = '0'; 
        notif.style.transition = 'opacity 0.3s'; 
        setTimeout(() => notif.remove(), 300); 
    }, 4000);
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
            precioOriginal: parseFloat(document.getElementById('productPriceOriginal').value) || 0,
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            descuento: parseInt(document.getElementById('productDiscount').value) || 0,
            stock: parseInt(document.getElementById('productStock').value) || 0,
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
    
    productsList.innerHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: rgba(39, 174, 96, 0.1); border: 1px dashed #27AE60; border-radius: 10px; text-align: center;">
            <p style="font-size: 13px; margin-bottom: 10px;">Para que otros vean tus productos, descarga este archivo y súbelo a GitHub.</p>
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
                <h4>${producto.nombre}</h4>
                <p><strong>Categoría:</strong> ${producto.categoria} | <strong>Precio:</strong> $${producto.precioActual.toFixed(2)} USD</p>
            </div>
            <div class="product-item-actions" style="clear:both;padding-top:8px;">
                <button class="btn-small-icon btn-edit" onclick="abrirEditModal(${producto.id})">✏️ Editar</button>
                <button class="btn-small-icon btn-delete" onclick="eliminarProducto(${producto.id})">🗑️ Eliminar</button>
                <button class="btn-small-icon btn-revolico" style="background:#ff9800" onclick="prepararPublicacionManual(${producto.id})">📋 Copiar y Abrir</button>
                <button class="btn-small-icon btn-revolico" onclick="publicarEnRevolico(${producto.id})">🤖 Auto</button>
            </div>
        `;
        productsList.appendChild(item);
    });
}

// ===== PUBLICACIÓN EN REVOLICO (MANUAL Y AUTO) =====

function prepararPublicacionManual(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `${producto.nombre}\n\n${producto.descripcion}\n\nPrecio: ${producto.precioActual} USD\nContacto: +53 54320170`;
    
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => {
            window.open('https://www.revolico.com/item/publish', '_blank');
        }, 1000);
    }).catch(err => {
        console.error('Error al copiar:', err);
        window.open('https://www.revolico.com/item/publish', '_blank');
    });
}

async function publicarEnRevolico(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    mostrarNotificacion(`🚀 Intentando publicar "${producto.nombre}"...`, 'info');
    
    try {
        const response = await fetch(`${BACKEND_URL}/publicar-revolico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(producto)
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion(`✅ ¡Publicado!: ${producto.nombre}`);
        } else {
            mostrarNotificacion(`❌ Error: ${data.error || 'No se pudo publicar'}`, 'error');
        }
    } catch (e) {
        mostrarNotificacion('❌ Error de conexión con el backend', 'error');
    }
}

async function publicarTodosAhora() {
    if (!confirm('¿Quieres publicar todos los productos en Revolico ahora mismo?')) return;
    
    mostrarNotificacion('🚀 Iniciando publicación masiva...', 'info');
    
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
    const container = document.getElementById('categoriasContainer');
    if (!container) return;
    
    container.innerHTML = `<button class="btn-cat ${categoriaSeleccionada === 'Todas' ? 'active' : ''}" onclick="filtrarPorCategoria('Todas')">Todas</button>`;
    
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `btn-cat ${categoriaSeleccionada === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => filtrarPorCategoria(cat);
        container.appendChild(btn);
    });
}

function filtrarPorCategoria(cat) {
    categoriaSeleccionada = cat;
    actualizarBotonesCategorias();
    renderizarProductos();
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
            <span>${cat}</span>
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
    const name = input.value.trim();
    if (!name) return;
    if (categorias.includes(name)) { mostrarNotificacion('La categoría ya existe', 'error'); return; }
    
    categorias.push(name);
    guardarCategorias();
    input.value = '';
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    actualizarListaCategorias();
    mostrarNotificacion('✅ Categoría agregada');
}

function guardarCategorias() {
    localStorage.setItem('categorias', JSON.stringify(categorias));
}

function eliminarCategoria(index) {
    if (categorias[index] === 'General') return;
    if (confirm(`¿Eliminar la categoría "${categorias[index]}"?`)) {
        categorias.splice(index, 1);
        guardarCategorias();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarProductos();
    }
}

// ===== GESTIÓN DE PRODUCTOS (EDITAR/ELIMINAR) =====

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
    
    document.getElementById('editModal').classList.remove('hidden');
}

function cerrarEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

function guardarEdicion(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    
    if (index !== -1) {
        productos[index] = {
            ...productos[index],
            nombre: document.getElementById('editProductName').value.trim(),
            descripcion: document.getElementById('editProductDescription').value.trim(),
            precioOriginal: parseFloat(document.getElementById('editProductPriceOriginal').value) || 0,
            precioActual: parseFloat(document.getElementById('editProductPriceActual').value) || 0,
            descuento: parseInt(document.getElementById('editProductDiscount').value) || 0,
            stock: parseInt(document.getElementById('editProductStock').value) || 0,
            categoria: document.getElementById('editProductCategory').value
        };
        
        guardarProductos();
        sincronizarConBackend();
        cerrarEditModal();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('✅ Producto actualizado');
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
    const logContainer = document.getElementById('publishLogs');
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

// ===== SINCRONIZACIÓN AUTOMÁTICA CON GITHUB =====

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

    mostrarNotificacion('🚀 Sincronizando con GitHub...', 'info');

    try {
        await subirArchivoAGitHub(user, repo, token, 'productos.json', productos);
        await subirArchivoAGitHub(user, repo, token, 'categorias.json', categorias);
        mostrarNotificacion('✅ ¡Tienda sincronizada con éxito! Los cambios serán visibles en 1-2 minutos.');
    } catch (e) {
        mostrarNotificacion('❌ Error al sincronizar: ' + e.message, 'error');
    }
}

async function subirArchivoAGitHub(user, repo, token, path, data) {
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${path}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    
    // Obtener el SHA del archivo si ya existe
    let sha = null;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
        if (res.ok) {
            const fileData = await res.json();
            sha = fileData.sha;
        }
    } catch (e) {}

    const body = {
        message: `Actualización automática de ${path}`,
        content: content,
        sha: sha
    };

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error al subir archivo');
    }
}

// ===== INICIALIZACIÓN =====

document.addEventListener('DOMContentLoaded', () => {
    cargarDatosDesdeGitHub();
    renderizarProductos();
    actualizarBotonesCategorias();
    
    // Event listeners
    const productForm = document.getElementById('productForm');
    if (productForm) productForm.addEventListener('submit', agregarProductoForm);
    
    const editForm = document.getElementById('editForm');
    if (editForm) editForm.addEventListener('submit', guardarEdicion);
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', verificarPassword);
    
    // Verificar backend cada 30 segundos si el panel está abierto
    setInterval(() => {
        if (!document.getElementById('adminPanel').classList.contains('hidden')) {
            verificarEstadoBackend();
        }
    }, 30000);
});
