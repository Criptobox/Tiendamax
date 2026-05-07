'use strict';

// 1. CARGA DE DATOS (Mantenemos tus variables originales)
let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];

// 2. INICIO
document.addEventListener('DOMContentLoaded', () => {
    actualizarTienda();
    if(localStorage.getItem('darkMode') === 'true') toggleDarkMode(true);
});

function actualizarTienda() {
    renderProductosMasVendidos();
    renderCategoriasHome();
}

// 3. RENDERIZADO PREMIUM
function renderProductosMasVendidos() {
    const grid = document.getElementById('masVendidosGrid');
    if (!grid) return;

    const destacados = productos.filter(p => p.masVendido === "true" || p.masVendido === true);
    
    if (destacados.length === 0) {
        document.getElementById('masVendidosVacio').style.display = 'block';
        grid.innerHTML = '';
        return;
    }

    grid.innerHTML = destacados.map(p => `
        <div class="producto-card" onclick="mostrarDetalleProducto('${p.id}')">
            <img src="${p.imagen}" class="producto-img" onerror="this.src='https://via.placeholder.com/300'">
            <div style="padding: 10px 0;">
                <span style="font-size: 12px; opacity: 0.5;">${p.categoria}</span>
                <h3 style="font-size: 1.1rem; margin: 5px 0;">${p.nombre}</h3>
                <p style="color: var(--primary); font-weight: 800; font-size: 1.3rem;">$${p.precio}</p>
            </div>
        </div>
    `).join('');
}

function renderCategoriasHome() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;
    grid.innerHTML = categorias.map(c => `
        <div onclick="seleccionarCategoria('${c}')" style="background:var(--card); padding:25px; border-radius:20px; text-align:center; cursor:pointer; box-shadow:var(--shadow)">
            <div style="font-size:2rem; margin-bottom:10px">📦</div>
            <span style="font-weight:700">${c}</span>
        </div>
    `).join('');
}

// 4. FUNCIONES DE VISTA
function mostrarDetalleProducto(id) {
    const p = productos.find(item => item.id === id);
    if (!p) return;

    document.getElementById('detailProductName').innerText = p.nombre;
    document.getElementById('detailProductDescription').innerText = p.descripcion;
    document.getElementById('detailProductImage').src = p.imagen;
    document.getElementById('detailPriceActual').innerText = `$${p.precio}`;
    
    const modal = document.getElementById('productDetailModal');
    modal.classList.remove('hidden');
}

function cerrarDetalleModal() {
    document.getElementById('productDetailModal').classList.add('hidden');
}

function volverAlInicio() {
    document.getElementById('vistaInicio').style.display = 'block';
    document.getElementById('vistaCategoria').style.display = 'none';
}

function toggleDarkMode(init = false) {
    const isDark = init ? localStorage.getItem('darkMode') === 'true' : document.body.classList.toggle('dark-mode');
    if(!init) localStorage.setItem('darkMode', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// 5. LOGIN ADMIN (Tu lógica original simplificada)
function abrirLoginAdmin() {
    const pass = prompt("Introduce la contraseña:");
    if (pass === "Cripx") { 
        alert("Acceso concedido");
        // Aquí puedes poner la lógica para mostrar tu panel admin original
    }
}
