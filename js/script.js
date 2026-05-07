let db = JSON.parse(localStorage.getItem('tiendamax_db')) || {
    productos: [],
    categorias: ["General"],
    subcategorias: []
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    actualizarTodo();
    if(localStorage.getItem('theme') === 'dark') toggleDarkMode(true);
});

function actualizarTodo() {
    renderProductosMasVendidos();
    localStorage.setItem('tiendamax_db', JSON.stringify(db));
}

// Renderizar Productos
function renderProductosMasVendidos() {
    const grid = document.getElementById('masVendidosGrid');
    if (!grid) return;

    const destacados = db.productos.filter(p => p.masVendido === "true" || p.masVendido === true);
    grid.innerHTML = destacados.map(p => `
        <div class="producto-card" onclick="mostrarDetalleProducto('${p.id}')">
            <img src="${p.imagen}" class="producto-img">
            <h3>${p.nombre}</h3>
            <p class="precio">$${p.precio}</p>
        </div>
    `).join('');
}

// Navegación
function volverAlInicio() {
    document.getElementById('vistaInicio').style.display = 'block';
    document.getElementById('vistaCategoria').style.display = 'none';
}

// Modo Oscuro
function toggleDarkMode(init = false) {
    const body = document.documentElement;
    const isDark = body.getAttribute('data-theme') === 'dark';
    const newTheme = init ? (isDark ? 'dark' : 'light') : (isDark ? 'light' : 'dark');
    
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Detalle de Producto
function mostrarDetalleProducto(id) {
    const p = db.productos.find(item => item.id === id);
    if(!p) return;

    document.getElementById('detailProductName').innerText = p.nombre;
    document.getElementById('detailProductDescription').innerText = p.descripcion;
    document.getElementById('detailProductImage').src = p.imagen;
    document.getElementById('detailPriceActual').innerText = `$${p.precio}`;
    
    const modal = document.getElementById('productDetailModal');
    modal.classList.add('show');
}

function cerrarDetalleModal() {
    document.getElementById('productDetailModal').classList.remove('show');
}
