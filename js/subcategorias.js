// ===== GESTIÓN DE SUBCATEGORÍAS =====
// Este módulo extiende la funcionalidad de categorías con soporte para subcategorías

let subcategorias = (() => { try { return JSON.parse(localStorage.getItem('subcategorias')) || {}; } catch(e) { return {}; } })();

/**
 * Estructura de subcategorias:
 * {
 *   "Electrónica": ["Celulares", "Laptops", "Tablets"],
 *   "Ropa": ["Hombres", "Mujeres", "Niños"]
 * }
 */

// ===== FUNCIONES DE SUBCATEGORÍAS =====

function inicializarSubcategorias() {
    // Asegurar que todas las categorías tengan un array de subcategorías
    if (typeof categorias !== 'undefined') {
        categorias.forEach(cat => {
            if (!subcategorias[cat]) {
                subcategorias[cat] = [];
            }
        });
    }
    guardarSubcategorias();
    actualizarSelectSubcategorias();
}

function guardarSubcategorias() {
    localStorage.setItem('subcategorias', JSON.stringify(subcategorias));
}


function actualizarSelectSubcategorias() {
    ['productSubcategory', 'editProductSubcategory'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        
        const val = select.value;
        const catSelect = id === 'productSubcategory' 
            ? document.getElementById('productCategory')
            : document.getElementById('editProductCategory');
        
        if (!catSelect) return;
        
        const categoria = catSelect.value;
        select.innerHTML = '<option value="">-- Sin subcategoría --</option>';
        
        if (subcategorias[categoria]) {
            subcategorias[categoria].forEach(subcat => {
                const opt = document.createElement('option');
                opt.value = subcat;
                opt.textContent = subcat;
                select.appendChild(opt);
            });
        }
        
        select.value = val || '';
    });
}


// ===== INTEGRACIÓN CON PRODUCTOS =====

function agregarSubcategoriaAlProducto() {
    const productForm = document.getElementById('productForm');
    if (!productForm) return;

    // Buscar si ya existe el select de subcategoría
    if (document.getElementById('productSubcategory')) return;

    // Insertar después del select de categoría
    const categorySelect = document.getElementById('productCategory');
    if (!categorySelect) return;
    const categoryGroup = categorySelect.parentElement;
    const subcatGroup = document.createElement('div');
    subcatGroup.className = 'form-group';
    subcatGroup.innerHTML = `
        <label>Subcategoría (opcional):</label>
        <select id="productSubcategory" onchange="actualizarSelectSubcategorias()">
            <option value="">-- Sin subcategoría --</option>
        </select>
    `;
    categoryGroup.insertAdjacentElement('afterend', subcatGroup);
}


// ===== SINCRONIZACIÓN DE SUBCATEGORÍAS CON GITHUB =====


// ===== CARGAR SUBCATEGORÍAS DESDE GITHUB =====

// FIX BUG #16: renombrada para evitar conflicto con la de script.js (que hace merge).
// Esta versión SOLO se usa internamente desde este módulo si script.js no la ha redefinido.
async function _subcatModuloCargarDesdeGitHub() {
    try {
        const res = await fetch('subcategorias.json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data) {
                subcategorias = data;
                localStorage.setItem('subcategorias', JSON.stringify(subcategorias));

            }
        }
    } catch (e) {

    }
}
// Solo registrar como cargarSubcategoriasDesdeGitHub si script.js no la definió
if (typeof window.cargarSubcategoriasDesdeGitHub !== 'function') {
    window.cargarSubcategoriasDesdeGitHub = _subcatModuloCargarDesdeGitHub;
}

// ===== INICIALIZACIÓN =====

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            (window.cargarSubcategoriasDesdeGitHub || _subcatModuloCargarDesdeGitHub)();
            inicializarSubcategorias();
            agregarSubcategoriaAlProducto();
            // Escuchar cambios en la categoría del formulario para actualizar subcategorías
            const productCat = document.getElementById('productCategory');
            if (productCat) {
                productCat.addEventListener('change', actualizarSelectSubcategorias);
            }
            const editCat = document.getElementById('editProductCategory');
            if (editCat) {
                editCat.addEventListener('change', actualizarSelectSubcategorias);
            }
        }, 100);
    });
} else {
    (window.cargarSubcategoriasDesdeGitHub || _subcatModuloCargarDesdeGitHub)();
    inicializarSubcategorias();
    agregarSubcategoriaAlProducto();
    // Escuchar cambios en la categoría del formulario para actualizar subcategorías
    const productCat = document.getElementById('productCategory');
    if (productCat) {
        productCat.addEventListener('change', actualizarSelectSubcategorias);
    }
    const editCat = document.getElementById('editProductCategory');
    if (editCat) {
        editCat.addEventListener('change', actualizarSelectSubcategorias);
    }
}

// Sincronizar cambios de categoría
window.addEventListener('storage', (event) => {
    if (event.key === 'subcategorias') {
        if (event.newValue) {
            try { subcategorias = JSON.parse(event.newValue); } catch(e) { subcategorias = {}; }
        } else {
            subcategorias = {};
        }
        actualizarSelectSubcategorias();
    }
});
