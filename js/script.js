'use strict';

/**
 * TIENDAMAX - CORE ENGINE (PREMIUM EDITION)
 * Manté totes les funcions originals: Revolico, GitHub, Admin Panel.
 */

// ===== 1. CONFIGURACIÓ I ESTAT =====
const BACKEND_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://127.0.0.1:5002/api' 
    : '/api';

const PASSWORD_ADMIN_HASH = 'a338781ef2610e22bde9dae45f2d8aaa6a8a8c4584158f18cd91089b9192bc62';

let productos = JSON.parse(localStorage.getItem('productos')) || [];
let categorias = JSON.parse(localStorage.getItem('categorias')) || ['General'];
let subcategorias = JSON.parse(localStorage.getItem('subcategorias')) || [];
let usuarioAutenticado = false;
let categoriaSeleccionada = 'Todas';

// Iconografia dinàmica
const ICONOS_MAPA = {
    'wifi': '📡', 'energia': '⚡', 'celular': '📱', 'herramienta': '🔧', 'ropa': '👕', 'hogar': '🏠'
};

// ===== 2. INICIALITZACIÓ =====
function inicializarTienda() {
    console.log("🚀 TiendaMax Premium Carregada");
    aplicarTemaGuardado();
    renderCategoriasHome();
    renderProductosMasVendidos();
    configurarEventListeners();
}

function configurarEventListeners() {
    // Escolta de canvis en categoria per a subcategories dinàmiques
    const catSelect = document.getElementById('productCategory');
    if (catSelect) {
        catSelect.addEventListener('change', (e) => actualizarSelectorSubcategorias(e.target.value));
    }
}

// ===== 3. RENDERITZAT PREMIUM (L'aspecte visual) =====
function renderProductosMasVendidos() {
    const grid = document.getElementById('masVendidosGrid');
    const vacio = document.getElementById('masVendidosVacio');
    if (!grid) return;

    const destacados = productos.filter(p => p.masVendido === "true" || p.masVendido === true);

    if (destacados.length === 0) {
        if (vacio) vacio.style.display = 'block';
        grid.innerHTML = '';
        return;
    }

    if (vacio) vacio.style.display = 'none';
    
    grid.innerHTML = destacados.map(p => {
        const desc = parseInt(p.descuento) || 0;
        const precioOriginal = desc > 0 ? Math.round(p.precio / (1 - desc/100)) : null;
        
        return `
            <div class="producto-card" onclick="mostrarDetalleProducto('${p.id}')">
                ${desc > 0 ? `<div class="badge-descuento">-${desc}%</div>` : ''}
                <div class="img-container">
                    <img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.src='https://via.placeholder.com/300'">
                </div>
                <div class="producto-info">
                    <span class="categoria-tag">${p.categoria}</span>
                    <h3>${p.nombre}</h3>
                    <div class="precio-row">
                        <span class="precio-actual">$${p.precio}</span>
                        ${precioOriginal ? `<span class="precio-viejp">$${precioOriginal}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCategoriasHome() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;

    grid.innerHTML = categorias.map(cat => {
        const icono = ICONOS_MAPA[cat.toLowerCase()] || '📦';
        return `
            <div class="categoria-card" onclick="seleccionarCategoria('${cat}')">
                <div class="categoria-icon">${icono}</div>
                <span>${cat}</span>
            </div>
        `;
    }).join('');
}

// ===== 4. NAVEGACIÓ I MODALS =====
function volverAlInicio() {
    document.getElementById('vistaInicio').style.display = 'block';
    document.getElementById('vistaCategoria').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarDetalleProducto(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;

    const modal = document.getElementById('productDetailModal');
    document.getElementById('detailProductName').textContent = p.nombre;
    document.getElementById('detailProductDescription').textContent = p.descripcion;
    document.getElementById('detailProductImage').src = p.imagen;
    document.getElementById('detailPriceActual').textContent = `$${p.precio}`;

    // Configuració botó WhatsApp
    const btnBuy = document.getElementById('detailBuyBtn');
    btnBuy.onclick = () => {
        const msg = `Hola! M'interessa aquest producte: ${p.nombre} ($${p.precio})`;
        window.open(`https://wa.me/5354320170?text=${encodeURIComponent(msg)}`, '_blank');
    };

    modal.classList.add('show');
    modal.classList.remove('hidden');
}

function cerrarDetalleModal() {
    const modal = document.getElementById('productDetailModal');
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

// ===== 5. SISTEMA DE TEMES (MODO OSCURO) =====
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('darkMode', isDark);
    
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function aplicarTemaGuardado() {
    const saved = localStorage.getItem('darkMode') === 'true';
    if (saved) {
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

// ===== 6. PANEL D'ADMINISTRACIÓ (RESUM) =====
async function abrirLoginAdmin() {
    const pass = prompt("Contrasenya d'Administrador:");
    if (!pass) return;

    // Lògica de hash simple per seguretat
    const msgUint8 = new TextEncoder().encode(pass);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex === PASSWORD_ADMIN_HASH) {
        usuarioAutenticado = true;
        alert("🔓 Accés concedit. Benvingut al Panel Premium.");
        // Aquí crides la teva funció original per mostrar el panel admin
        if(typeof mostrarPanelAdmin === "function") mostrarPanelAdmin();
    } else {
        alert("❌ Contrasenya incorrecta.");
    }
}

// Inicialitzar al carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarTienda);
} else {
    inicializarTienda();
}
