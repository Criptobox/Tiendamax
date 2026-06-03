// ===== GESTIÓN DE SUBCATEGORÍAS =====
// Este módulo extiende la funcionalidad de categorías con soporte para subcategorías

let subcategorias = JSON.parse(localStorage.getItem('subcategorias')) || {};

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
    actualizarListaSubcategorias();
    actualizarSelectSubcategorias();
}

function guardarSubcategorias() {
    localStorage.setItem('subcategorias', JSON.stringify(subcategorias));
}

function agregarSubcategoria() {
    const categoriaSelect = document.getElementById('subcategoryParentCategory');
    const subcatInput = document.getElementById('newSubcategoryName');
    
    const categoria = categoriaSelect.value;
    const subcategoria = subcatInput.value.trim();

    if (!categoria) {
        mostrarNotificacion('Selecciona una categoría', 'error');
        return;
    }
    if (!subcategoria) {
        mostrarNotificacion('Ingresa el nombre de la subcategoría', 'error');
        return;
    }

    if (!subcategorias[categoria]) {
        subcategorias[categoria] = [];
    }

    if (subcategorias[categoria].includes(subcategoria)) {
        mostrarNotificacion('Esta subcategoría ya existe', 'error');
        return;
    }

    subcategorias[categoria].push(subcategoria);
    guardarSubcategorias();
    subcatInput.value = '';
    actualizarListaSubcategorias();
    actualizarSelectSubcategorias();
    mostrarNotificacion('✅ Subcategoría agregada');
    sincronizarSubcategoriasConGitHub();
}

function eliminarSubcategoria(categoria, subcategoria) {
    if (confirm(`¿Eliminar la subcategoría "${subcategoria}"?`)) {
        if (subcategorias[categoria]) {
            subcategorias[categoria] = subcategorias[categoria].filter(s => s !== subcategoria);
            guardarSubcategorias();
            actualizarListaSubcategorias();
            actualizarSelectSubcategorias();
            mostrarNotificacion('🗑️ Subcategoría eliminada', 'info');
            sincronizarSubcategoriasConGitHub();
        }
    }
}

function actualizarSelectCategoriasPadre() {
    const select = document.getElementById('subcategoryParentCategory');
    if (!select) return;
    const val = select.value;
    select.innerHTML = '<option value="">-- Selecciona una categoría --</option>';
    if (typeof categorias !== 'undefined') {
        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
    }
    if (val) select.value = val;
}

function actualizarListaSubcategorias() {
    const list = document.getElementById('subcategoryList');
    if (!list) return;

    list.innerHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: rgba(155, 89, 182, 0.1); border: 1px dashed #9B59B6; border-radius: 10px; text-align: center;">
            <p style="font-size: 13px; margin-bottom: 10px;">Organiza tus productos con subcategorías para una mejor experiencia de compra.</p>
            <button class="btn btn-primary" style="background:#9B59B6" onclick="sincronizarSubcategoriasConGitHub()">☁️ Guardar subcategorías en GitHub</button>
        </div>
    `;

    let hasSubcategories = false;
    if (typeof categorias !== 'undefined') {
        categorias.forEach(cat => {
            if (subcategorias[cat] && subcategorias[cat].length > 0) {
                hasSubcategories = true;
                const catDiv = document.createElement('div');
                catDiv.style.marginBottom = '20px';
                const h4 = document.createElement('h4');
                h4.style.cssText = 'margin-bottom: 10px; color: #9B59B6;';
                h4.textContent = `📁 ${cat}`;
                catDiv.appendChild(h4);

                const subList = document.createElement('div');
                subList.style.paddingLeft = '20px';

                subcategorias[cat].forEach(subcat => {
                    const item = document.createElement('div');
                    item.className = 'subcategory-item';
                    item.style.cssText = `
                        padding: 8px 12px;
                        background: #f5f5f5;
                        border-radius: 6px;
                        margin-bottom: 8px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    `;
                    const span = document.createElement('span');
                    span.textContent = `📌 ${subcat}`;
                    const btn = document.createElement('button');
                    btn.style.cssText = 'background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;';
                    btn.textContent = '🗑️';
                    btn.addEventListener('click', () => eliminarSubcategoria(cat, subcat));
                    item.appendChild(span);
                    item.appendChild(btn);
                    subList.appendChild(item);
                });
                
                catDiv.appendChild(subList);
                list.appendChild(catDiv);
            }
        });
    }

    if (!hasSubcategories) {
        list.innerHTML += '<p style="color: #999; text-align: center; padding: 20px;">No hay subcategorías aún. ¡Crea una para empezar!</p>';
    }
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

function descargarSubcategoriasJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(subcategorias, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "subcategorias.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo subcategorias.json generado. Súbelo a tu GitHub.');
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

function agregarSubcategoriaAlEditModal() {
    const editForm = document.getElementById('editForm');
    if (!editForm) return;

    // Buscar si ya existe el select de subcategoría
    if (document.getElementById('editProductSubcategory')) return;

    // Insertar después del select de categoría
    const categorySelect = document.getElementById('editProductCategory');
    if (!categorySelect) return;
    const categoryGroup = categorySelect.parentElement;
    const subcatGroup = document.createElement('div');
    subcatGroup.className = 'form-group';
    subcatGroup.innerHTML = `
        <label>Subcategoría (opcional):</label>
        <select id="editProductSubcategory">
            <option value="">-- Sin subcategoría --</option>
        </select>
    `;
    categoryGroup.insertAdjacentElement('afterend', subcatGroup);
}

// ===== SINCRONIZACIÓN DE SUBCATEGORÍAS CON GITHUB =====

async function sincronizarSubcategoriasConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = (typeof obtenerGitHubToken === 'function') ? await obtenerGitHubToken() : localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        mostrarNotificacion('⚠️ Configura GitHub en la pestaña Configuración primero', 'error');
        return;
    }
    try {
        mostrarNotificacion('⏳ Guardando subcategorías en GitHub...', 'info');
        await subirArchivoAGitHub(user, repo, token, 'subcategorias.json', subcategorias);
        mostrarNotificacion('✅ Subcategorías guardadas en GitHub');
        console.log('✅ Subcategorías sincronizadas con GitHub automáticamente');
    } catch (e) {
        mostrarNotificacion('❌ Error al guardar subcategorías: ' + e.message, 'error');
        console.warn('⚠️ Error al sincronizar subcategorías:', e.message);
    }
}

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
                console.log('✅ Subcategorías cargadas desde GitHub (módulo)');
            }
        }
    } catch (e) {
        console.log('ℹ️ Subcategorías no disponibles en GitHub');
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
            agregarSubcategoriaAlEditModal();
            actualizarSelectCategoriasPadre();
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
    agregarSubcategoriaAlEditModal();
    actualizarSelectCategoriasPadre();
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
        actualizarListaSubcategorias();
        actualizarSelectSubcategorias();
    }
});
