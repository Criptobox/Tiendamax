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
    categorias.forEach(cat => {
        if (!subcategorias[cat]) {
            subcategorias[cat] = [];
        }
    });
    guardarSubcategorias();
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
    mostrarNotificacion('✅ Subcategoría agregada');
}

function eliminarSubcategoria(categoria, subcategoria) {
    if (confirm(`¿Eliminar la subcategoría "${subcategoria}"?`)) {
        if (subcategorias[categoria]) {
            subcategorias[categoria] = subcategorias[categoria].filter(s => s !== subcategoria);
            guardarSubcategorias();
            actualizarListaSubcategorias();
            mostrarNotificacion('🗑️ Subcategoría eliminada', 'info');
        }
    }
}

function actualizarListaSubcategorias() {
    const list = document.getElementById('subcategoryList');
    if (!list) return;

    list.innerHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: rgba(155, 89, 182, 0.1); border: 1px dashed #9B59B6; border-radius: 10px; text-align: center;">
            <p style="font-size: 13px; margin-bottom: 10px;">Organiza tus productos con subcategorías para una mejor experiencia de compra.</p>
            <button class="btn btn-primary" style="background:#9B59B6" onclick="descargarSubcategoriasJSON()">📥 Descargar subcategorias.json</button>
        </div>
    `;

    let hasSubcategories = false;
    categorias.forEach(cat => {
        if (subcategorias[cat] && subcategorias[cat].length > 0) {
            hasSubcategories = true;
            const catDiv = document.createElement('div');
            catDiv.style.marginBottom = '20px';
            catDiv.innerHTML = `<h4 style="margin-bottom: 10px; color: #9B59B6;">📁 ${cat}</h4>`;
            
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
                item.innerHTML = `
                    <span>📌 ${subcat}</span>
                    <button onclick="eliminarSubcategoria('${cat}', '${subcat}')" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">🗑️</button>
                `;
                subList.appendChild(item);
            });
            
            catDiv.appendChild(subList);
            list.appendChild(catDiv);
        }
    });

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
    const categoryGroup = productForm.querySelector('label:has(+ select#productCategory)').parentElement;
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
    const categoryGroup = editForm.querySelector('label:has(+ select#editProductCategory)').parentElement;
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
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        console.log('ℹ️ GitHub no configurado. Saltando sincronización de subcategorías.');
        return;
    }
    try {
        await subirArchivoAGitHub(user, repo, token, 'subcategorias.json', subcategorias);
        console.log('✅ Subcategorías sincronizadas con GitHub automáticamente');
    } catch (e) {
        console.warn('⚠️ Error al sincronizar subcategorías:', e.message);
    }
}

// ===== CARGAR SUBCATEGORÍAS DESDE GITHUB =====

async function cargarSubcategoriasDesdeGitHub() {
    try {
        const res = await fetch('subcategorias.json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data) {
                subcategorias = data;
                localStorage.setItem('subcategorias', JSON.stringify(subcategorias));
                console.log('✅ Subcategorías cargadas desde GitHub');
            }
        }
    } catch (e) {
        console.log('ℹ️ Subcategorías no disponibles en GitHub');
    }
}

// ===== INICIALIZACIÓN =====

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            cargarSubcategoriasDesdeGitHub();
            inicializarSubcategorias();
            agregarSubcategoriaAlProducto();
            agregarSubcategoriaAlEditModal();
        }, 100);
    });
} else {
    cargarSubcategoriasDesdeGitHub();
    inicializarSubcategorias();
    agregarSubcategoriaAlProducto();
    agregarSubcategoriaAlEditModal();
}

// Sincronizar cambios de categoría
window.addEventListener('storage', (event) => {
    if (event.key === 'subcategorias') {
        subcategorias = JSON.parse(event.newValue) || {};
        actualizarListaSubcategorias();
        actualizarSelectSubcategorias();
    }
});
