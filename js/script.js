// ================= POLYFILL COMPATIBILIDAD =================
(function() {
    // Fix localStorage en modo privado
    try {
        localStorage.setItem('_test_', '1');
        localStorage.removeItem('_test_');
    } catch(e) {
        console.warn('localStorage no disponible. Usando memoria temporal.');
        window._localStore = {};
        localStorage.setItem = (k,v) => window._localStore[k] = v;
        localStorage.getItem = k => window._localStore[k] || null;
        localStorage.removeItem = k => delete window._localStore[k];
    }

    // Fix CSS Grid en navegadores antiguos
    if (!window.CSS || !CSS.supports('display', 'grid')) {
        document.documentElement.classList.add('no-grid');
    }
})();

// ================= CONFIGURACIÓN =================
let currentCurrency = localStorage.getItem('currency') || 'USD';
let tasaCambio = parseFloat(localStorage.getItem('tasa')) || 1.0;
const productos = JSON.parse(localStorage.getItem('productos')) || [];
const categorias = JSON.parse(localStorage.getItem('categorias')) || [];

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', () => {
    actualizarTasaUI();
    renderCategorias();
    renderProductos();
    initScrollEffects();
});

// ================= MONEDA =================
function setCurrency(currency) {
    currentCurrency = currency;
    localStorage.setItem('currency', currency);
    actualizarTasaUI();
    renderProductos();
    document.querySelectorAll('.cur-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === currency);
    });
}

function actualizarTasaUI() {
    const label = currentCurrency === 'USD' ? '1 USD = 1 MN' : `1 USD = ${tasaCambio} MN`;
    document.getElementById('tasaLabel').textContent = label;
    const mobileLabel = document.getElementById('tasaLabelMobile');
    if (mobileLabel) mobileLabel.textContent = label;
}

// ================= RENDERIZADO =================
function renderCategorias() {
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;
    grid.innerHTML = categorias.map(cat => `
        <div class="categoria-card" onclick="filtrarCategoria('${cat.nombre}')">
            <div class="categoria-img">${cat.icono || '📦'}</div>
            <div class="categoria-info">
                <h3>${cat.nombre}</h3>
                <p>${cat.cantidad || 0} productos</p>
            </div>
        </div>
    `).join('');
}

function renderProductos(filtro = '') {
    const grid = document.getElementById('masVendidosGrid');
    if (!grid) return;
    
    let prods = filtro ? productos.filter(p => p.nombre.toLowerCase().includes(filtro.toLowerCase())) : productos;
    
    grid.innerHTML = prods.map(p => {
        const precio = currentCurrency === 'USD' ? p.precioUSD : (p.precioUSD * tasaCambio).toFixed(2);
        const moneda = currentCurrency;
        return `
        <div class="producto-card">
            <div style="position:relative;">
                <div class="producto-img">${p.imagen ? `<img src="${p.imagen}" alt="${p.nombre}" style="width:100%;height:100%;object-fit:cover;">` : '📷'}</div>
                ${p.etiqueta ? `<span class="badge ${p.etiqueta.toLowerCase().replace(' ', '-')}">${p.etiqueta}</span>` : ''}
            </div>
            <div class="producto-info">
                <h3>${p.nombre}</h3>
                <div class="precio">${precio} ${moneda}</div>
                ${currentCurrency === 'MN' ? `<div class="precio-mn">≈ ${(p.precioUSD).toFixed(2)} USD</div>` : ''}
                <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="comprar('${p.nombre}')">Comprar →</button>
            </div>
        </div>`;
    }).join('');
}

// ================= UTILIDADES =================
function buscarProductos() {
    const val = document.getElementById('buscador').value;
    renderProductos(val);
}

function comprar(nombre) {
    window.open(`https://wa.me/5354320170?text=Hola, me interesa: ${encodeURIComponent(nombre)}`, '_blank');
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('active');
}

function mostrarPanelAjustes() {
    alert('⚙️ Panel de Ajustes: Aquí podrás conectar tu backend de Revolico y gestionar la tasa de cambio.');
}

function initScrollEffects() {
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        if (window.scrollY > 50) header.style.background = 'rgba(13,13,13,0.98)';
        else header.style.background = 'rgba(13,13,13,0.95)';
    });
}

// ================= ADMIN (Simplificado) =================
function limpiarVistoReciente() {
    localStorage.removeItem('visto_reciente');
    document.getElementById('vistoLista').innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Historial limpio</p>';
}
