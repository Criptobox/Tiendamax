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
let subcategoriaSeleccionada = 'Todas';

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


// ═══════════════════════════════════════════════════════
//  BÚSQUEDA HERO + FILTRO DE PRECIO
// ═══════════════════════════════════════════════════════
let _heroSearchActivo = '';
let _heroPrecioMin    = 0;
let _heroPrecioMax    = Infinity;
let _heroSearchTimer  = null;

function abrirPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (!panel) return;
    panel.classList.add('visible');
    if (bar) bar.classList.add('panel-open');
    inicializarSliderPrecios();
}

function cerrarPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (panel) panel.classList.remove('visible');
    if (bar)   bar.classList.remove('panel-open');
}

function inicializarSliderPrecios() {
    if (!productos || productos.length === 0) return;
    const precios  = productos.map(p => p.precioActual).filter(v => v > 0);
    if (!precios.length) return;
    const minReal  = Math.floor(Math.min(...precios));
    const maxReal  = Math.ceil(Math.max(...precios));
    const sMin = document.getElementById('heroSliderMin');
    const sMax = document.getElementById('heroSliderMax');
    if (!sMin || !sMax) return;
    // Solo inicializar si aún están en defaults
    if (parseFloat(sMin.min) !== minReal) {
        sMin.min = sMax.min = minReal;
        sMin.max = sMax.max = maxReal;
        sMin.value = minReal;
        sMax.value = maxReal;
        _heroPrecioMin = minReal;
        _heroPrecioMax = maxReal;
    }
    actualizarSliderPrecio();
}

function actualizarSliderPrecio() {
    const sMin = document.getElementById('heroSliderMin');
    const sMax = document.getElementById('heroSliderMax');
    if (!sMin || !sMax) return;
    let min = parseFloat(sMin.value);
    let max = parseFloat(sMax.value);
    // Evitar cruce
    if (min > max) { sMin.value = max; min = max; }
    _heroPrecioMin = min;
    _heroPrecioMax = max;
    const label = document.getElementById('heroPrecioRango');
    const allMin = parseFloat(sMin.min), allMax = parseFloat(sMax.max);
    if (label) {
        if (min === allMin && max === allMax) {
            label.textContent = 'Todos los precios';
        } else {
            label.textContent = `$${Math.round(min)} – $${Math.round(max)}`;
        }
    }
    buscarDesdeHero(document.getElementById('heroSearchInput')?.value || '');
}

function buscarDesdeHero(query) {
    clearTimeout(_heroSearchTimer);
    const q      = (query || '').trim().toLowerCase();
    const sugBox = document.getElementById('heroSearchSuggestions');
    const sMin   = document.getElementById('heroSliderMin');
    const sMax   = document.getElementById('heroSliderMax');
    const minVal = sMin ? parseFloat(sMin.value) : 0;
    const maxVal = sMax ? parseFloat(sMax.value) : Infinity;
    const allMin = sMin ? parseFloat(sMin.min) : 0;
    const allMax = sMax ? parseFloat(sMax.max) : Infinity;
    const precioFiltrado = minVal > allMin || maxVal < allMax;

    if (!q && !precioFiltrado) {
        if (sugBox) { sugBox.innerHTML = ''; }
        return;
    }

    _heroSearchTimer = setTimeout(() => {
        if (!sugBox) return;
        const resultados = productos.filter(p => {
            const matchQ = !q || p.nombre.toLowerCase().includes(q) ||
                (p.descripcion||'').toLowerCase().includes(q) ||
                (p.categoria||'').toLowerCase().includes(q);
            const matchP = p.precioActual >= minVal && p.precioActual <= maxVal;
            return matchQ && matchP;
        }).slice(0, 6);

        if (resultados.length === 0) {
            sugBox.innerHTML = '<div class="hero-sug-empty">😕 Sin resultados</div>';
        } else {
            sugBox.innerHTML = resultados.map(p => {
                const nombre = q ? resaltarTexto(p.nombre, q) : p.nombre;
                return '<div class="hero-sug-item" onclick="seleccionarSugerencia(' + p.id + ')">' +
                    '<img class="hero-sug-img" src="' + p.imagen + '" onerror="this.style.display=\'none\'">' +
                    '<span class="hero-sug-name">' + nombre + '</span>' +
                    '<span class="hero-sug-price">$' + p.precioActual.toFixed(2) + '</span>' +
                    '</div>';
            }).join('');
        }
    }, 220);
}

function aplicarBusquedaHero() {
    const q   = (document.getElementById('heroSearchInput')?.value || '').trim().toLowerCase();
    const sMin = document.getElementById('heroSliderMin');
    const sMax = document.getElementById('heroSliderMax');
    _heroSearchActivo = q;
    _heroPrecioMin    = sMin ? parseFloat(sMin.value) : 0;
    _heroPrecioMax    = sMax ? parseFloat(sMax.value) : Infinity;
    cerrarPanelBusqueda();
    mostrarVistaCategoria('Todas');
}

function seleccionarSugerencia(id) {
    cerrarPanelBusqueda();
    abrirDetalleProducto(id);
}

function resaltarTexto(texto, query) {
    try {
        const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return texto.replace(re, '<mark style="background:rgba(201,169,110,0.25);color:inherit;border-radius:3px;padding:0 2px;">$1</mark>');
    } catch(e) { return texto; }
}

// Cerrar panel al tocar fuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.hero-search-wrap')) cerrarPanelBusqueda();
});

// ═══════════════════════════════════════════════════════
//  SUBIDA DE IMÁGENES A GITHUB (archivos .jpg reales)
// ═══════════════════════════════════════════════════════
async function subirImagenAGitHub(fileOrBase64) {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');

    const base64full = await comprimirImagen(fileOrBase64);

    if (!user || !repo || !token) return base64full; // fallback sin config

    try {
        const base64data = base64full.split(',')[1];
        const filename   = 'img_' + Date.now() + '.jpg';
        const path       = 'imagenes/' + filename;
        const apiUrl     = 'https://api.github.com/repos/' + user + '/' + repo + '/contents/' + path;
        const headers    = { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' };
        const res = await fetch(apiUrl, {
            method: 'PUT', headers,
            body: JSON.stringify({ message: 'Imagen: ' + filename, content: base64data })
        });
        if (res.ok) return 'https://raw.githubusercontent.com/' + user + '/' + repo + '/main/' + path;
    } catch(e) { /* fallback */ }
    return base64full;
}

// ═══════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════
function renderizarAnalytics() {
    const el = document.getElementById('analyticsContent');
    if (!el) return;

    const totalProductos  = productos.length;
    const totalStock      = productos.reduce((s, p) => s + (p.stock || 0), 0);
    const sinStock        = productos.filter(p => p.stock === 0).length;
    const masVendidos     = productos.filter(p => p.masVendido).length;
    const conDescuento    = productos.filter(p => p.descuento > 0).length;
    const precioPromedio  = totalProductos ? (productos.reduce((s,p) => s + p.precioActual, 0) / totalProductos).toFixed(2) : 0;
    const precioMax       = totalProductos ? Math.max(...productos.map(p => p.precioActual)) : 0;
    const precioMin       = totalProductos ? Math.min(...productos.map(p => p.precioActual)) : 0;
    const catConteo       = {};
    productos.forEach(p => { catConteo[p.categoria] = (catConteo[p.categoria]||0)+1; });
    const topCats = Object.entries(catConteo).sort((a,b) => b[1]-a[1]).slice(0,5);

    // Calcular tamaño estimado del JSON (base64 vs URL)
    const pesoBase64 = productos.filter(p => p.imagen?.startsWith('data:')).reduce((s,p) => s + p.imagen.length, 0);
    const pesoKB     = Math.round(pesoBase64 / 1024);

    el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px;">
            ${stat('📦', 'Productos', totalProductos)}
            ${stat('🏷️', 'Categorías', Object.keys(catConteo).length)}
            ${stat('📊', 'Stock total', totalStock)}
            ${stat('⚠️', 'Sin stock', sinStock, sinStock > 0 ? '#e74c3c' : null)}
            ${stat('🔥', 'Más vendidos', masVendidos)}
            ${stat('🏷️', 'Con descuento', conDescuento)}
            ${stat('💰', 'Precio prom.', '$'+precioPromedio)}
            ${stat('📈', 'Precio max.', '$'+precioMax)}
        </div>
        <div style="background:${pesoKB > 500 ? 'rgba(231,76,60,0.08)' : 'rgba(39,174,96,0.08)'};border:1px solid ${pesoKB > 500 ? '#e74c3c' : '#27ae60'};border-radius:12px;padding:14px 16px;margin-bottom:20px;">
            <strong>${pesoKB > 500 ? '⚠️ Imágenes pesadas' : '✅ Imágenes optimizadas'}</strong><br>
            <span style="font-size:13px;color:#666;">${pesoKB > 500 ? pesoKB+'KB en base64 — ejecuta <em>migrar_imagenes.html</em> para reducirlo a &lt;50KB' : 'Las imágenes están guardadas como URLs. ¡Perfecto!'}</span>
        </div>
        <h4 style="margin-bottom:12px;">Top categorías por productos</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${topCats.map(([cat, n]) => `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="min-width:120px;font-size:13px;">${cat}</span>
                    <div style="flex:1;background:#f0ebe4;border-radius:99px;height:8px;overflow:hidden;">
                        <div style="width:${Math.round(n/totalProductos*100)}%;background:var(--primary-color,#c9a96e);height:100%;border-radius:99px;"></div>
                    </div>
                    <span style="font-size:12px;color:#999;min-width:24px;">${n}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function stat(icon, label, value, color) {
    return '<div style="background:var(--bg-secondary,#f9f6f1);border-radius:12px;padding:14px;text-align:center;">' +
        '<div style="font-size:22px;">' + icon + '</div>' +
        '<div style="font-size:' + (typeof value === 'number' ? '22px' : '18px') + ';font-weight:800;color:' + (color||'var(--primary-color,#c9a96e)') + ';">' + value + '</div>' +
        '<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
        '</div>';
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
    // Intentar usar raw.githubusercontent.com si está configurado (no tiene límite de 1MB)
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    const baseUrl = (ghUser && ghRepo)
        ? `https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main`
        : null;

    // Función helper: intenta raw primero, luego relativo
    async function fetchJSON(filename) {
        if (baseUrl) {
            try {
                const res = await fetch(`${baseUrl}/${filename}?_=${Date.now()}`);
                if (res.ok) return await res.json();
            } catch(e) {}
        }
        // Fallback: ruta relativa (funciona en GitHub Pages)
        const res = await fetch(`${filename}?_=${Date.now()}`);
        if (res.ok) return await res.json();
        return null;
    }

    try {
        const dataProd = await fetchJSON('productos.json');
        if (dataProd && dataProd.length > 0) {
            productos = dataProd;
            localStorage.setItem('productos', JSON.stringify(productos));
        }

        const dataCat = await fetchJSON('categorias.json');
        if (dataCat) {
            // Soporte para formato nuevo {nombres, iconos} y formato viejo (array)
            if (Array.isArray(dataCat) && dataCat.length > 0) {
                categorias = dataCat;
                localStorage.setItem('categorias', JSON.stringify(categorias));
            } else if (dataCat.nombres && dataCat.nombres.length > 0) {
                categorias = dataCat.nombres;
                localStorage.setItem('categorias', JSON.stringify(categorias));
                if (dataCat.iconos && Object.keys(dataCat.iconos).length > 0) {
                    Object.assign(iconosPersonalizados, dataCat.iconos);
                    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
                }
            }
        }

        // Cargar config de grupos Facebook
        try {
            const dataG = await fetchJSON('grupos_facebook_config.json');
            if (dataG && dataG.grupos) {
                localStorage.setItem('gruposFB', JSON.stringify(dataG.grupos));
                console.log('✅ Grupos FB cargados desde GitHub');
            }
        } catch(e) {}

        // Cargar config de Revolico
        try {
            const dataR = await fetchJSON('revolico_config.json');
            if (dataR && Object.keys(dataR).length > 0) {
                localStorage.setItem('revolicoConfig', JSON.stringify(dataR));
                console.log('✅ Config Revolico cargada desde GitHub');
            }
        } catch(e) {}

        renderizarCategoriasHome();
        renderizarMasVendidos();
        actualizarListaProductos();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        verificarOfertasYMostrarBanner();
        inicializarSliderPrecios();
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
    subcategoriaSeleccionada = 'Todas';
    // Clear hero search state when navigating by category (not from search)
    const heroInput = document.getElementById('heroSearchInput');
    if (heroInput && !_heroSearchActivo) {
        _heroPrecioMin = 0;
        _heroPrecioMax = Infinity;
    }
    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaCategoria').style.display = 'block';

    const icono = obtenerIconoCategoria(categoria);
    const titulo = categoria === 'Todas' ? '🛍️ Todos los Productos' : `${icono} ${categoria}`;
    document.getElementById('tituloCategoriaActual').textContent = titulo;

    actualizarBotonesCategorias();
    renderizarSubcategoriaTabs();
    renderizarProductos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderizarSubcategoriaTabs() {
    const tabsContainer = document.getElementById('subcategoriaTabs');
    const filtroContainer = document.getElementById('categoriaFiltro');
    if (!tabsContainer) return;

    // Si es "Todas", mostrar el filtro de categorías y ocultar tabs
    if (categoriaSeleccionada === 'Todas') {
        tabsContainer.style.display = 'none';
        if (filtroContainer) filtroContainer.style.display = 'flex';
        return;
    }

    // Ocultar filtro de todas las categorías
    if (filtroContainer) filtroContainer.style.display = 'none';

    // Obtener subcategorías de la categoría actual
    const subcats = (typeof subcategorias !== 'undefined' && subcategorias[categoriaSeleccionada]) 
        ? subcategorias[categoriaSeleccionada] 
        : [];

    if (subcats.length === 0) {
        tabsContainer.style.display = 'none';
        return;
    }

    tabsContainer.style.display = 'flex';
    tabsContainer.innerHTML = '';

    // Tab "Todas" para esta categoría
    const tabTodas = document.createElement('button');
    tabTodas.className = `subcategoria-tab ${subcategoriaSeleccionada === 'Todas' ? 'active' : ''}`;
    tabTodas.innerHTML = `<span class="tab-icon">🔎</span><span class="tab-label">Todos</span>`;
    tabTodas.onclick = () => seleccionarSubcategoria('Todas');
    tabsContainer.appendChild(tabTodas);

    subcats.forEach(subcat => {
        const tab = document.createElement('button');
        tab.className = `subcategoria-tab ${subcategoriaSeleccionada === subcat ? 'active' : ''}`;
        tab.innerHTML = `<span class="tab-label">${subcat}</span>`;
        tab.onclick = () => seleccionarSubcategoria(subcat);
        tabsContainer.appendChild(tab);
    });

    // Actualizar stats
    actualizarCategoriaStats();
}

function seleccionarSubcategoria(subcat) {
    subcategoriaSeleccionada = subcat;
    renderizarSubcategoriaTabs();
    renderizarProductos();
}

function actualizarCategoriaStats() {
    const statsEl = document.getElementById('categoriaStats');
    if (!statsEl) return;
    const total = categoriaSeleccionada === 'Todas' 
        ? productos.length 
        : productos.filter(p => p.categoria === categoriaSeleccionada).length;
    statsEl.textContent = `${total} producto${total !== 1 ? 's' : ''}`;
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
            
            <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="btn btn-small btn-primary" style="flex:1;" onclick="event.stopPropagation(); contactarProducto('${producto.nombre}')">💬 Comprar</button>
                <button style="background:#1a1a1a;color:#fff;border:none;border-radius:8px;padding:7px 11px;cursor:pointer;font-size:13px;flex-shrink:0;" onclick="event.stopPropagation(); agregarAlCarrito('${producto.id}')">🛒+</button>
            </div>
            <div onclick="event.stopPropagation()">${renderResenaWidget(producto.id)}</div>
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
    // Remove active from all tabs (class only — never use inline style on admin-tabs)
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.removeProperty('display'); // Fix: clear any rogue inline display
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
    });

    // Tab-specific hooks (all in one place, no double-wrapping)
    if (tabName === 'publicar-ahora') setTimeout(cargarGruposFB, 100);
    if (tabName === 'manage-products') setTimeout(actualizarListaProductos, 100);
    if (tabName === 'analytics') setTimeout(renderizarAnalytics, 100);
}

// ===== PRODUCTOS =====

function agregarProductoForm(event) {
    event.preventDefault();
    const fileInput = document.getElementById('productImage');
    const file = fileInput.files[0];
    if (!file) { mostrarNotificacion('Por favor selecciona una imagen', 'error'); return; }

    // Mostrar indicador de compresión
    mostrarNotificacion('⏳ Subiendo imagen...', 'info');

    subirImagenAGitHub(file).then(imagenComprimida => {
        const masVendidoVal = document.getElementById('productMasVendido');
        const producto = {
            id: Date.now(),
            nombre: document.getElementById('productName').value.trim(),
            descripcion: document.getElementById('productDescription').value.trim(),
            imagen: imagenComprimida,
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            descuento: parseInt(document.getElementById('productDiscount').value) || 0,
            stock: parseInt(document.getElementById('productStock').value) || 0,
            categoria: document.getElementById('productCategory').value,
            subcategoria: (document.getElementById('productSubcategory') && document.getElementById('productSubcategory').value) ? document.getElementById('productSubcategory').value : '',
            masVendido: masVendidoVal ? masVendidoVal.value === 'true' : false,
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
        marcarProductoModificado(producto.id);
        sincronizarConGitHub();
        document.getElementById('productForm').reset();
        mostrarNotificacion('✅ ¡Producto agregado exitosamente!');
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        verificarOfertasYMostrarBanner();
    });
}

function guardarProductos() {
    localStorage.setItem('productos', JSON.stringify(productos));
}

// ===== COMPRESIÓN DE IMÁGENES =====
// Comprime una imagen (File o base64) a máximo ~40KB manteniendo buena calidad visual
function comprimirImagen(source, maxKB = 40, maxWidth = 600, maxHeight = 600) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            // Calcular nuevas dimensiones manteniendo proporción
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width  = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Reducir calidad iterativamente hasta alcanzar el límite de tamaño
            let quality = 0.85;
            let result  = canvas.toDataURL('image/jpeg', quality);
            while (result.length > maxKB * 1024 * 1.37 && quality > 0.25) {
                quality -= 0.08;
                result = canvas.toDataURL('image/jpeg', quality);
            }
            resolve(result);
        };

        img.onerror = () => resolve(source); // Si falla, devolver original

        if (typeof source === 'string') {
            img.src = source; // base64 o URL
        } else {
            // Es un File/Blob
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(source);
        }
    });
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

    let productosFiltrados = categoriaSeleccionada === 'Todas' 
        ? productos 
        : productos.filter(p => p.categoria === categoriaSeleccionada);

    // Filtrar por subcategoría si hay una seleccionada (y no es 'Todas')
    if (categoriaSeleccionada !== 'Todas' && subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
        productosFiltrados = productosFiltrados.filter(p => p.subcategoria === subcategoriaSeleccionada);
    }

    // Filtro de búsqueda hero y precio
    if (_heroSearchActivo || _heroPrecioMin > 0 || _heroPrecioMax < Infinity) {
        const q = _heroSearchActivo;
        productosFiltrados = productosFiltrados.filter(p => {
            const matchQ = !q || p.nombre.toLowerCase().includes(q) ||
                (p.descripcion||'').toLowerCase().includes(q) ||
                (p.categoria||'').toLowerCase().includes(q);
            const matchP = p.precioActual >= _heroPrecioMin && p.precioActual <= _heroPrecioMax;
            return matchQ && matchP;
        });
    }

    productosGrid.innerHTML = '';

    if (productosFiltrados.length === 0) {
        productosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 60px 20px; font-size:15px;">No hay productos en esta subcategoría aún.</p>';
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
            ${typeof renderCountdownHtml === 'function' ? renderCountdownHtml(producto.id) : ''}
            <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="btn btn-small btn-primary" style="flex:1;" onclick="event.stopPropagation(); contactarProducto('${producto.nombre}')">💬 Comprar</button>
                <button style="background:#1a1a1a;color:#fff;border:none;border-radius:8px;padding:7px 11px;cursor:pointer;font-size:13px;flex-shrink:0;" onclick="event.stopPropagation(); agregarAlCarrito('${producto.id}')">🛒+</button>
            </div>
            <div onclick="event.stopPropagation()">${renderResenaWidget(producto.id)}</div>
        `;
        productosGrid.appendChild(card);
    });
}

// ===== DETALLE DE PRODUCTO =====

// Producto actualmente abierto en el modal
let _detalleProductoActual = null;

function abrirDetalleProducto(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;
    _detalleProductoActual = p;
    registrarVisto(id);

    // Nombre
    document.getElementById('detailProductName').textContent = p.nombre;

    // Imagen (reset zoom)
    const img = document.getElementById('detailProductImage');
    img.src = p.imagen;
    img.alt = p.nombre;
    img.classList.remove('zoomed');

    // Categoría y subcategoría
    document.getElementById('detailProductCategory').textContent =
        obtenerIconoCategoria(p.categoria) + ' ' + p.categoria;
    const subEl = document.getElementById('detailSubcategoria');
    if (p.subcategoria && p.subcategoria !== 'Todas') {
        subEl.textContent = '↳ ' + p.subcategoria;
        subEl.style.display = 'block';
    } else {
        subEl.style.display = 'none';
    }

    // Descuento badge
    const badge = document.getElementById('detailProductBadge');
    badge.style.display = p.descuento > 0 ? 'inline-block' : 'none';
    if (p.descuento > 0) badge.textContent = `-${p.descuento}%`;

    // Más vendido badge
    const hotBadge = document.getElementById('detailMasVendidoBadge');
    hotBadge.style.display = (p.masVendido === true || p.masVendido === 'true') ? 'block' : 'none';

    // Precio
    const precioOriginal = p.descuento > 0
        ? (p.precioActual / (1 - p.descuento / 100))
        : null;
    const elOld = document.getElementById('detailPriceOriginal');
    elOld.textContent = precioOriginal ? `$${precioOriginal.toFixed(2)} USD` : '';
    elOld.style.display = precioOriginal ? 'inline' : 'none';
    document.getElementById('detailPriceActual').textContent = `$${p.precioActual.toFixed(2)} USD`;

    // Ahorro
    const ahorroEl = document.getElementById('detailAhorroBadge');
    if (precioOriginal && p.descuento > 0) {
        const ahorro = (precioOriginal - p.precioActual).toFixed(2);
        ahorroEl.textContent = `Ahorras $${ahorro}`;
        ahorroEl.style.display = 'inline';
    } else {
        ahorroEl.style.display = 'none';
    }

    // Stock
    const stockEl = document.getElementById('detailProductStock');
    if (p.stock === 0) {
        stockEl.innerHTML = '<span style="color:#e74c3c;font-weight:700;">❌ Sin stock</span>';
    } else if (p.stock <= 3) {
        stockEl.innerHTML = `<span style="color:#e67e22;font-weight:700;">⚠️ ¡Últimas ${p.stock} unidades!</span>`;
    } else {
        stockEl.innerHTML = `<span>📦 ${p.stock} unidades disponibles</span>`;
    }
    document.getElementById('detailStockBarFill').style.width =
        `${Math.min(100, Math.max(8, (p.stock / 20) * 100))}%`;

    // Badges extra: garantia, devolución, usado
    const extBadges = document.getElementById('detailExtraBadges');
    let badges = '';
    if (p.garantia) badges += `<span class="detail-badge-tag dtag-garantia">🛡️ Garantía: ${p.garantia}</span>`;
    if (p.devolucion) badges += `<span class="detail-badge-tag dtag-devolucion">↩️ Devolución aceptada</span>`;
    if (p.usado) badges += `<span class="detail-badge-tag dtag-usado">♻️ Producto usado</span>`;
    extBadges.innerHTML = badges;

    // Descripción
    document.getElementById('detailProductDescription').textContent = p.descripcion;

    // Botón comprar
    const buyBtn = document.getElementById('detailBuyBtn');
    buyBtn.disabled = p.stock === 0;
    buyBtn.textContent = p.stock === 0 ? '❌ Sin stock' : '🛒 Comprar por WhatsApp';
    buyBtn.onclick = () => contactarProducto(p.nombre);

    // Productos relacionados (misma categoría, excluir actual)
    const relacionados = productos
        .filter(x => x.id !== p.id && x.categoria === p.categoria)
        .slice(0, 4);
    const relSection = document.getElementById('detailRelacionados');
    const relGrid    = document.getElementById('detailRelacionadosGrid');
    if (relacionados.length > 0) {
        relGrid.innerHTML = relacionados.map(r => `
            <div class="rel-card" onclick="abrirDetalleProducto(${r.id})">
                <img src="${r.imagen}" alt="${r.nombre}" loading="lazy"
                     onerror="this.style.display='none'">
                <div class="rel-card-name">${r.nombre}</div>
                <div class="rel-card-price">$${r.precioActual.toFixed(2)}</div>
            </div>
        `).join('');
        relSection.style.display = 'block';
    } else {
        relSection.style.display = 'none';
    }

    // Abrir modal
    const modal = document.getElementById('productDetailModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = 'hidden';
}

function cerrarDetalleModal() {
    const modal = document.getElementById('productDetailModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    document.body.style.overflow = '';
    _detalleProductoActual = null;
}

function toggleZoomImagen(img) {
    img.classList.toggle('zoomed');
}

function compartirProducto() {
    const p = _detalleProductoActual;
    if (!p) return;
    const texto = `🛍️ ${p.nombre} — $${p.precioActual.toFixed(2)} USD
📦 Stock disponible
👉 tiendamax.org`;
    if (navigator.share) {
        navigator.share({ title: p.nombre, text: texto, url: 'https://tiendamax.org' }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => mostrarNotificacion('📤 Texto copiado para compartir'));
    }
}

function copiarLinkProducto() {
    navigator.clipboard.writeText('https://tiendamax.org').then(() =>
        mostrarNotificacion('🔗 Enlace copiado')
    ).catch(() => mostrarNotificacion('❌ No se pudo copiar', 'error'));
}

function contactarProducto(nombre) {
    const msg = encodeURIComponent(`Hola, me interesa el producto: ${nombre}. ¿Está disponible?`);
    window.open(`https://wa.me/5354320170?text=${msg}`, '_blank');
}

// actualizarListaProductos está definida más abajo (versión mejorada con filtros por categoría)

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
    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
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
    // Una eliminación requiere sincronizar todos los productos
    localStorage.setItem('productosModificados', JSON.stringify(productos.map(p => p.id)));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
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

    // Cargar subcategorías del producto al editar
    if (typeof actualizarSelectSubcategorias === 'function') {
        actualizarSelectSubcategorias();
        setTimeout(() => {
            const editSubcat = document.getElementById('editProductSubcategory');
            if (editSubcat && p.subcategoria) editSubcat.value = p.subcategoria;
        }, 50);
    }
    
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
            subcategoria: (document.getElementById('editProductSubcategory') && document.getElementById('editProductSubcategory').value) ? document.getElementById('editProductSubcategory').value : (productos[index].subcategoria || ''),
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
        marcarProductoModificado(productoActualizado.id);
        sincronizarConGitHub();
        cerrarEditModal();
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('✅ Producto actualizado');
    };

    if (file) {
        mostrarNotificacion('⏳ Subiendo imagen...', 'info');
        subirImagenAGitHub(file).then(imagenComprimida => actualizarProducto(imagenComprimida));
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

// ===== SISTEMA DE DELTA SYNC =====
// Registra qué productos fueron modificados desde la última sincronización
function marcarProductoModificado(id) {
    const modificados = JSON.parse(localStorage.getItem('productosModificados') || '[]');
    if (!modificados.includes(id)) modificados.push(id);
    localStorage.setItem('productosModificados', JSON.stringify(modificados));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
}

function limpiarProductosModificados() {
    localStorage.removeItem('productosModificados');
    localStorage.setItem('ultimaSincronizacion', Date.now().toString());
}

function obtenerProductosModificados() {
    return JSON.parse(localStorage.getItem('productosModificados') || '[]');
}

async function sincronizarTodoConGitHub() {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        mostrarNotificacion('❌ Configura primero tu usuario, repo y token en la pestaña Configuración', 'error');
        switchTab('configuracion');
        return;
    }

    const btn = document.querySelector('[onclick="sincronizarTodoConGitHub()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    // Determinar si hay cambios pendientes específicos
    const idsModificados = obtenerProductosModificados();
    const hayDelta = idsModificados.length > 0 && idsModificados.length < productos.length;

    if (hayDelta) {
        mostrarNotificacion(`🔄 Subiendo ${idsModificados.length} producto(s) modificado(s)...`, 'info');
    } else {
        mostrarNotificacion('🚀 Sincronizando tienda completa con GitHub...', 'info');
    }

    // Construir el array de productos a subir
    // Si hay delta y productos.json ya existe en GitHub, solo marcar para subir completo
    // (GitHub necesita el archivo completo, pero lo construimos eficientemente)
    const subcatData  = JSON.parse(localStorage.getItem('subcategorias') || 'null') || {};
    const gruposData  = JSON.parse(localStorage.getItem('gruposFB') || 'null') || [];
    const revData     = JSON.parse(localStorage.getItem('revolicoConfig') || 'null') || {
        enabled: false, username: '', password: '',
        auto_publish: false, interval_hours: 24, max_products: 10, categories: []
    };
    const archivos = [
        { path: 'productos.json',              data: productos },
        { path: 'categorias.json',             data: { nombres: categorias, iconos: iconosPersonalizados } },
        { path: 'subcategorias.json',          data: subcatData },
        { path: 'grupos_facebook_config.json', data: { grupos: gruposData, exportado: new Date().toISOString() } },
        { path: 'revolico_config.json',        data: revData },
    ];

    // Siempre subir todos los archivos para garantizar consistencia
    const archivosFiltrados = archivos;

    let ok = 0, errors = [];
    // Subir secuencialmente para evitar conflictos de SHA en GitHub
    for (const { path, data } of archivosFiltrados) {
        if (btn) btn.textContent = `⏳ Subiendo ${path}...`;
        try {
            await subirArchivoAGitHub(user, repo, token, path, data);
            ok++;
        } catch (e) {
            errors.push(`${path}: ${e.message}`);
        }
    }

    if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }

    if (errors.length === 0) {
        limpiarProductosModificados();
        const info = hayDelta ? `${idsModificados.length} producto(s) actualizado(s)` : `${ok} archivos`;
        mostrarNotificacion(`✅ Tienda actualizada (${info}). Visible en ~30 segundos.`);
    } else {
        mostrarNotificacion('⚠️ ' + errors.join(' | '), 'error');
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
    const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' };
    const jsonStr  = JSON.stringify(data, null, 2);
    const content  = btoa(unescape(encodeURIComponent(jsonStr)));

    // Calcular tamaño aproximado en bytes (base64 → bytes originales)
    const sizeBytes = jsonStr.length;
    const apiBase   = `https://api.github.com/repos/${user}/${repo}`;

    // Función interna para obtener el SHA del archivo (Contents API)
    async function obtenerSHA() {
        try {
            const res = await fetch(`${apiBase}/contents/${path}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.sha || null;
            }
            if (res.status === 404) return null;
            return null;
        } catch (e) { return null; }
    }

    // Para archivos < 900KB usar la Contents API normal (más simple)
    if (sizeBytes < 900 * 1024) {
        let sha = await obtenerSHA();
        const body = { message: `Actualización de ${path}`, content };
        if (sha) body.sha = sha;

        let response = await fetch(`${apiBase}/contents/${path}`, {
            method: 'PUT', headers, body: JSON.stringify(body)
        });

        // Reintentar con SHA fresco si hay conflicto
        if (!response.ok && (response.status === 409 || response.status === 422)) {
            sha = await obtenerSHA();
            const bodyRetry = { message: `Actualización de ${path}`, content };
            if (sha) bodyRetry.sha = sha;
            response = await fetch(`${apiBase}/contents/${path}`, {
                method: 'PUT', headers, body: JSON.stringify(bodyRetry)
            });
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || `Error ${response.status} al subir ${path}`);
        }
        return;
    }

    // Para archivos >= 900KB usar el Git Data API (soporta archivos grandes)
    // Paso 1: Crear blob con el contenido
    const blobRes = await fetch(`${apiBase}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content, encoding: 'base64' })
    });
    if (!blobRes.ok) {
        const e = await blobRes.json();
        throw new Error(`Error creando blob: ${e.message}`);
    }
    const { sha: blobSha } = await blobRes.json();

    // Paso 2: Obtener el SHA del commit más reciente (HEAD)
    const refRes = await fetch(`${apiBase}/git/ref/heads/main`, { headers });
    if (!refRes.ok) throw new Error('No se pudo obtener la rama main');
    const { object: { sha: commitSha } } = await refRes.json();

    // Paso 3: Obtener el tree SHA del commit
    const commitRes = await fetch(`${apiBase}/git/commits/${commitSha}`, { headers });
    if (!commitRes.ok) throw new Error('No se pudo obtener el commit');
    const { tree: { sha: treeSha } } = await commitRes.json();

    // Paso 4: Crear nuevo tree con el archivo actualizado
    const newTreeRes = await fetch(`${apiBase}/git/trees`, {
        method: 'POST', headers,
        body: JSON.stringify({
            base_tree: treeSha,
            tree: [{ path, mode: '100644', type: 'blob', sha: blobSha }]
        })
    });
    if (!newTreeRes.ok) throw new Error('Error creando tree');
    const { sha: newTreeSha } = await newTreeRes.json();

    // Paso 5: Crear nuevo commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
        method: 'POST', headers,
        body: JSON.stringify({
            message: `Actualización de ${path}`,
            tree: newTreeSha,
            parents: [commitSha]
        })
    });
    if (!newCommitRes.ok) throw new Error('Error creando commit');
    const { sha: newCommitSha } = await newCommitRes.json();

    // Paso 6: Actualizar referencia HEAD
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/main`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sha: newCommitSha })
    });
    if (!updateRefRes.ok) {
        const e = await updateRefRes.json();
        throw new Error(`Error actualizando ref: ${e.message}`);
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

// ===== HERO IMAGE ADMIN =====

const HERO_IMG_DEFAULT = 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=85&auto=format&fit=crop';

function cargarImagenHeroGuardada() {
    const saved = localStorage.getItem('heroImage');
    const img = document.getElementById('heroHumanImg');
    if (img && saved) {
        img.src = saved;
    }
    // Update preview in admin
    const preview = document.getElementById('heroPreviewImg');
    if (preview) {
        preview.src = saved || HERO_IMG_DEFAULT;
    }
}

function previewHeroImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('heroPreviewImg');
        if (preview) preview.src = e.target.result;
        document.getElementById('heroImageUrl').value = '';
    };
    reader.readAsDataURL(file);
}

function previewHeroUrl(url) {
    if (!url) return;
    const preview = document.getElementById('heroPreviewImg');
    if (preview) preview.src = url;
    document.getElementById('heroImageUpload').value = '';
}

function guardarImagenHero() {
    const fileInput = document.getElementById('heroImageUpload');
    const urlInput = document.getElementById('heroImageUrl');
    const file = fileInput && fileInput.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            localStorage.setItem('heroImage', e.target.result);
            const img = document.getElementById('heroHumanImg');
            if (img) img.src = e.target.result;
            mostrarNotificacion('✅ Imagen del hero actualizada');
        };
        reader.readAsDataURL(file);
    } else if (urlInput && urlInput.value.trim()) {
        const url = urlInput.value.trim();
        localStorage.setItem('heroImage', url);
        const img = document.getElementById('heroHumanImg');
        if (img) img.src = url;
        mostrarNotificacion('✅ Imagen del hero actualizada');
    } else {
        mostrarNotificacion('⚠️ Selecciona una imagen o pega una URL', 'error');
    }
}

function restaurarImagenHeroDefault() {
    localStorage.removeItem('heroImage');
    const img = document.getElementById('heroHumanImg');
    if (img) img.src = HERO_IMG_DEFAULT;
    const preview = document.getElementById('heroPreviewImg');
    if (preview) preview.src = HERO_IMG_DEFAULT;
    mostrarNotificacion('↩ Imagen restaurada al default');
}

function abrirCambiarImagenHero() {
    abrirAdminPanel();
    setTimeout(() => switchTab('apariencia'), 200);
}

// ===== COUNTDOWN TIMER =====

let countdownIntervals = {};

function guardarCountdown() {
    const productId = document.getElementById('countdownProductSelect').value;
    const horas = parseInt(document.getElementById('countdownHoras').value) || 0;
    const minutos = parseInt(document.getElementById('countdownMinutos').value) || 0;
    const texto = document.getElementById('countdownTexto').value.trim() || '¡Oferta especial!';

    if (!productId) {
        mostrarNotificacion('⚠️ Selecciona un producto', 'error');
        return;
    }

    const duracionMs = (horas * 3600 + minutos * 60) * 1000;
    if (duracionMs <= 0) {
        mostrarNotificacion('⚠️ Ingresa una duración válida', 'error');
        return;
    }

    const endTime = Date.now() + duracionMs;
    const countdown = { productId, endTime, texto };
    localStorage.setItem('activeCountdown', JSON.stringify(countdown));

    const producto = productos.find(p => p.id == productId);
    const nombre = producto ? producto.nombre : 'Producto';

    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = `✅ Countdown activo para: <strong>${nombre}</strong>`;

    // Re-render to show timer
    renderizarMasVendidos();
    renderizarProductos();
    iniciarCountdownsActivos();

    mostrarNotificacion(`⏱️ Countdown activado para "${nombre}"`);
}

function desactivarCountdown() {
    localStorage.removeItem('activeCountdown');
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};
    renderizarMasVendidos();
    renderizarProductos();
    const status = document.getElementById('countdownStatus');
    if (status) status.innerHTML = 'Countdown desactivado.';
    mostrarNotificacion('🗑️ Countdown desactivado');
}

function getActiveCountdown() {
    try {
        const saved = localStorage.getItem('activeCountdown');
        if (!saved) return null;
        const cd = JSON.parse(saved);
        if (cd.endTime <= Date.now()) {
            localStorage.removeItem('activeCountdown');
            return null;
        }
        return cd;
    } catch { return null; }
}

function renderCountdownHtml(productId) {
    const cd = getActiveCountdown();
    if (!cd || String(cd.productId) !== String(productId)) return '';
    
    return `<div class="producto-countdown" id="countdown_${productId}">
        <span class="countdown-label">🔥 ${cd.texto}</span>
        <div class="countdown-time">
            <span class="countdown-block" id="cd_h_${productId}">--</span>
            <span class="countdown-sep">:</span>
            <span class="countdown-block" id="cd_m_${productId}">--</span>
            <span class="countdown-sep">:</span>
            <span class="countdown-block" id="cd_s_${productId}">--</span>
        </div>
    </div>`;
}

function iniciarCountdownsActivos() {
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};

    const cd = getActiveCountdown();
    if (!cd) return;

    const pid = cd.productId;
    const tickerFn = () => {
        const remaining = Math.max(0, cd.endTime - Date.now());
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        const pad = n => String(n).padStart(2, '0');

        ['masVendidosGrid', 'productosGrid'].forEach(gridId => {
            const hEl = document.getElementById(`cd_h_${pid}`);
            const mEl = document.getElementById(`cd_m_${pid}`);
            const sEl = document.getElementById(`cd_s_${pid}`);
            if (hEl) hEl.textContent = pad(h);
            if (mEl) mEl.textContent = pad(m);
            if (sEl) sEl.textContent = pad(s);
        });

        if (remaining <= 0) {
            clearInterval(countdownIntervals[pid]);
            localStorage.removeItem('activeCountdown');
        }
    };
    tickerFn();
    countdownIntervals[pid] = setInterval(tickerFn, 1000);
}

function actualizarCountdownProductSelect() {
    const sel = document.getElementById('countdownProductSelect');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Ninguno (desactivar timer) --</option>';
    productos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        sel.appendChild(opt);
    });
    // Preselect active countdown product
    const cd = getActiveCountdown();
    if (cd) sel.value = cd.productId;
    else if (current) sel.value = current;

    // Update status
    const status = document.getElementById('countdownStatus');
    if (status && cd) {
        const producto = productos.find(p => p.id == cd.productId);
        if (producto) status.innerHTML = `✅ Countdown activo para: <strong>${producto.nombre}</strong>`;
    }
}

// ===== PATCH renderizarMasVendidos to include countdown =====
// Override to inject countdown HTML
const _origRenderMasVendidos = renderizarMasVendidos;
renderizarMasVendidos = function() {
    _origRenderMasVendidos();
    const cd = getActiveCountdown();
    if (!cd) return;
    const grid = document.getElementById('masVendidosGrid');
    if (!grid) return;
    grid.querySelectorAll('.producto-card').forEach(card => {
        card.onclick && card.onclick.toString();
        // find matching product id from onclick
        const onclickAttr = card.getAttribute('onclick') || '';
        const match = onclickAttr.match(/abrirDetalleProducto\((\d+)\)/);
        if (!match) return;
        const pid = match[1];
        if (String(cd.productId) === String(pid)) {
            // Insert countdown before the buy button
            const btn = card.querySelector('.btn-small');
            if (btn && !card.querySelector('.producto-countdown')) {
                const cdDiv = document.createElement('div');
                cdDiv.innerHTML = renderCountdownHtml(pid);
                card.insertBefore(cdDiv.firstChild, btn);
                iniciarCountdownsActivos();
            }
        }
    });
};

// ===== PATCH abrirAdminPanel to init apariencia tab =====
const _origAbrirAdminPanel = abrirAdminPanel;
abrirAdminPanel = function() {
    _origAbrirAdminPanel();
    cargarImagenHeroGuardada();
    actualizarCountdownProductSelect();
    document.body.classList.add('admin-mode');
};

const _origCerrarAdminPanel = cerrarAdminPanel;
cerrarAdminPanel = function() {
    _origCerrarAdminPanel();
    document.body.classList.remove('admin-mode');
};

// ===== PATCH inicializarTienda to load saved hero image and start countdowns =====
const _origInicializarTienda = inicializarTienda;
inicializarTienda = function() {
    _origInicializarTienda();
    cargarImagenHeroGuardada();
    iniciarCountdownsActivos();
};


// ===== FAST CATEGORIES - render from localStorage immediately =====
// Patch renderizarCategoriasHome for performance 
// (already called from cargarDatosDesdeGitHub, but we want instant local render too)
function renderizarCategoriasHomeInstant() {
    // Load from localStorage immediately (no network wait)
    const localProds = JSON.parse(localStorage.getItem('productos')) || [];
    const localCats = JSON.parse(localStorage.getItem('categorias')) || ['General'];
    if (localProds.length === 0 && localCats.length <= 1) return; // Let skeleton show
    
    const grid = document.getElementById('categoriasGrid');
    if (!grid) return;
    
    // Only replace skeletons if we actually have local data
    grid.innerHTML = '';
    const cardTodas = document.createElement('div');
    cardTodas.className = 'categoria-card';
    cardTodas.innerHTML = `<span class="cat-icon">🛍️</span><span class="cat-name">Todos</span><span class="cat-count">${localProds.length} producto${localProds.length !== 1 ? 's' : ''}</span>`;
    cardTodas.onclick = () => mostrarVistaCategoria('Todas');
    grid.appendChild(cardTodas);

    localCats.forEach(cat => {
        const count = localProds.filter(p => p.categoria === cat).length;
        const card = document.createElement('div');
        card.className = 'categoria-card';
        card.innerHTML = `<span class="cat-icon">${obtenerIconoCategoria(cat)}</span><span class="cat-name">${cat}</span><span class="cat-count">${count} producto${count !== 1 ? 's' : ''}</span>`;
        card.onclick = () => mostrarVistaCategoria(cat);
        grid.appendChild(card);
    });
}

// Run instant render immediately on script parse
if (document.readyState !== 'loading') {
    renderizarCategoriasHomeInstant();
} else {
    document.addEventListener('DOMContentLoaded', renderizarCategoriasHomeInstant);
}


// ===== PATCH renderizarProductos to start countdowns after render =====
const _origRenderProductos = renderizarProductos;
renderizarProductos = function() {
    _origRenderProductos();
    if (typeof iniciarCountdownsActivos === 'function') {
        setTimeout(iniciarCountdownsActivos, 50);
    }
};

// ===== PATCH actualizarListaProductos to also update countdown select =====
const _origActualizarListaProductos = actualizarListaProductos;
actualizarListaProductos = function() {
    _origActualizarListaProductos();
    if (typeof actualizarCountdownProductSelect === 'function') {
        actualizarCountdownProductSelect();
    }
};

// ===== FIX: Subcategories showing only General =====
// Override renderizarSubcategoriaTabs to also load from GitHub subcategorias.json
const _origRenderSubcatTabs = typeof renderizarSubcategoriaTabs === 'function' ? renderizarSubcategoriaTabs : null;

async function cargarSubcategoriasDesdeGitHub() {
    try {
        const res = await fetch('subcategorias.json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object') {
                // Merge with local - github takes priority
                if (typeof subcategorias !== 'undefined') {
                    Object.assign(subcategorias, data);
                    localStorage.setItem('subcategorias', JSON.stringify(subcategorias));
                }
            }
        }
    } catch(e) {
        console.log('Subcategorias: usando datos locales');
    }
}

// Patch cargarDatosDesdeGitHub to also load subcategorias
const _origCargarDatos = cargarDatosDesdeGitHub;
cargarDatosDesdeGitHub = async function() {
    await _origCargarDatos();
    await cargarSubcategoriasDesdeGitHub();
    // Re-render subcategoria tabs if a category is currently selected
    if (typeof categoriaSeleccionada !== 'undefined' && categoriaSeleccionada && categoriaSeleccionada !== 'Todas') {
        if (typeof renderizarSubcategoriaTabs === 'function') renderizarSubcategoriaTabs();
    }
};

// FIX: When showing category view, make sure subcategorias are loaded first
const _origMostrarVistaCat = mostrarVistaCategoria;
mostrarVistaCategoria = function(categoria) {
    // Reload subcategorias from localStorage fresh each time
    if (typeof subcategorias !== 'undefined') {
        try {
            const fresh = JSON.parse(localStorage.getItem('subcategorias'));
            if (fresh) Object.assign(subcategorias, fresh);
        } catch(e) {}
    }
    _origMostrarVistaCat(categoria);
};

// ═══════════════════════════════════════════════════════
//  MEJORAS v3.0 — Gestión por categorías + Grupos FB
// ═══════════════════════════════════════════════════════

// ── Gestión de productos por categorías ──────────────

function actualizarListaProductos() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    const busqueda  = (document.getElementById('searchProductos')?.value || '').toLowerCase().trim();
    const filtroCat = document.getElementById('filtroCategoria')?.value || '';

    // Actualizar opciones del filtro de categoría
    const selectFiltro = document.getElementById('filtroCategoria');
    if (selectFiltro) {
        const cats = [...new Set(productos.map(p => p.categoria).filter(Boolean))];
        const valorActual = selectFiltro.value;
        selectFiltro.innerHTML = '<option value="">Todas las categorías</option>' +
            cats.map(c => `<option value="${c}" ${c === valorActual ? 'selected' : ''}>${c}</option>`).join('');
    }

    let filtrados = productos.filter(p => {
        const matchBusq = !busqueda || p.nombre.toLowerCase().includes(busqueda) || (p.descripcion||'').toLowerCase().includes(busqueda);
        const matchCat  = !filtroCat || p.categoria === filtroCat;
        return matchBusq && matchCat;
    });

    if (filtrados.length === 0) {
        productsList.innerHTML = '<p class="no-products">No se encontraron productos</p>';
        return;
    }

    // Agrupar por categoría
    const porCategoria = {};
    filtrados.forEach(p => {
        const cat = p.categoria || 'General';
        if (!porCategoria[cat]) porCategoria[cat] = [];
        porCategoria[cat].push(p);
    });

    let html = `<div style="margin-bottom:14px;padding:12px 16px;background:rgba(39,174,96,0.1);border:1px dashed #27AE60;border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <span style="font-size:13px;">📦 <strong>${filtrados.length}</strong> productos${filtroCat ? ` en <strong>${filtroCat}</strong>` : ''}</span>
        <button class="btn btn-primary" onclick="descargarProductosJSON()" style="font-size:12px;padding:8px 14px;">📥 Descargar productos.json</button>
    </div>`;

    Object.entries(porCategoria).forEach(([cat, prods]) => {
        html += `<div style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 14px;background:var(--primary);border-radius:10px;">
                <span style="font-size:16px;font-weight:700;color:white;">${cat}</span>
                <span style="font-size:12px;color:rgba(255,255,255,0.8);margin-left:auto;">${prods.length} producto${prods.length>1?'s':''}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">`;

        prods.forEach(producto => {
            html += `<div class="product-item" style="border-left:3px solid var(--primary);">
                <div class="product-item-info">
                    <img src="${producto.imagen}" alt="${producto.nombre}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;float:left;margin-right:12px;">
                    <h4 style="margin:0 0 4px;">${producto.nombre} ${producto.masVendido ? '🔥' : ''}</h4>
                    <p style="margin:0;font-size:12px;color:var(--text-muted);">
                        <strong>$${producto.precioActual.toFixed(2)}</strong> USD
                        ${producto.descuento > 0 ? `<span style="color:#e74c3c;margin-left:6px;">-${producto.descuento}%</span>` : ''}
                        ${producto.stock ? `· Stock: ${producto.stock}` : ''}
                    </p>
                </div>
                <div class="product-item-actions" style="clear:both;padding-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
                    <button class="btn-small-icon btn-edit" onclick="abrirEditModal(${producto.id})">✏️ Editar</button>
                    <button class="btn-small-icon btn-delete" onclick="eliminarProducto(${producto.id})">🗑️ Eliminar</button>
                    <button class="btn-small-icon btn-revolico" style="background:#ff9800" onclick="copiarParaRevolico(${producto.id})">📋 Revolico</button>
                    <button class="btn-small-icon btn-revolico" style="background:#4267B2" onclick="copiarParaFacebook(${producto.id})">📋 Facebook</button>
                    <button class="btn-small-icon btn-revolico" onclick="publicarEnRevolico(${producto.id})">🤖 Rev</button>
                </div>
            </div>`;
        });

        html += `</div></div>`;
    });

    productsList.innerHTML = html;
}

// ── Grupos de Facebook con selección de productos ────

// cargarGruposFB está definida más abajo (versión completa con renderizarRevolicoConfig)

function renderizarGruposFB(grupos) {
    const cont = document.getElementById('listaGruposFB');
    if (!cont) return;

    if (grupos.length === 0) {
        cont.innerHTML = '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:10px;">No hay grupos configurados aún.</p>';
        return;
    }

    cont.innerHTML = grupos.map((g, i) => `
        <div style="background:white;border:1.5px solid var(--border-color);border-radius:12px;padding:14px;position:relative;" id="grupoFB_${i}">
            <button onclick="eliminarGrupoFB(${i})" style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;font-size:18px;color:#e74c3c;">✕</button>
            <div style="margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">URL del Grupo:</label>
                <input type="text" value="${g.url||''}" onchange="actualizarGrupoFB(${i},'url',this.value)"
                    placeholder="https://www.facebook.com/groups/..." 
                    style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);font-size:13px;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Productos a publicar en este grupo:</label>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    ${productos.map(p => `
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" ${(g.productos||[]).includes(p.id) ? 'checked' : ''}
                                onchange="toggleProductoEnGrupo(${i}, ${p.id}, this.checked)"
                                style="width:16px;height:16px;accent-color:var(--primary);">
                            <img src="${p.imagen}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;">
                            <span>${p.nombre}</span>
                            <span style="margin-left:auto;color:var(--primary);font-weight:600;">$${p.precioActual}</span>
                        </label>
                    `).join('')}
                </div>
                ${productos.length === 0 ? '<p style="font-size:12px;color:var(--text-muted);">No hay productos cargados aún.</p>' : ''}
            </div>
        </div>
    `).join('');
}

function agregarGrupoFB() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    grupos.push({ url: '', productos: productos.map(p => p.id) }); // Por defecto todos seleccionados
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    renderizarGruposFB(grupos);
}

function eliminarGrupoFB(i) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    grupos.splice(i, 1);
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
    renderizarGruposFB(grupos);
}

function actualizarGrupoFB(i, campo, valor) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    if (grupos[i]) grupos[i][campo] = valor;
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
}

function toggleProductoEnGrupo(iGrupo, idProducto, checked) {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    if (!grupos[iGrupo]) return;
    if (!grupos[iGrupo].productos) grupos[iGrupo].productos = [];
    if (checked) {
        if (!grupos[iGrupo].productos.includes(idProducto))
            grupos[iGrupo].productos.push(idProducto);
    } else {
        grupos[iGrupo].productos = grupos[iGrupo].productos.filter(id => id !== idProducto);
    }
    localStorage.setItem('gruposFB', JSON.stringify(grupos));
}

function guardarGruposFB() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const validos = grupos.filter(g => g.url && g.url.includes('facebook.com'));

    // Exportar para el bot
    const config = {
        grupos: validos,
        exportado: new Date().toISOString(),
        instrucciones: "Copia este JSON y pégalo en el bot como variable GRUPOS_FB_CONFIG"
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'grupos_facebook_config.json';
    a.click();

    mostrarNotificacion(`✅ ${validos.length} grupos guardados. Descargado grupos_facebook_config.json para el bot.`);
}

function abrirChromeEspecial() {
    mostrarNotificacion('ℹ️ Ejecuta abrir_chrome_especial.bat en tu laptop para iniciar el bot.', 'info');
}

// switchTab hooks are now inside the switchTab function directly


// ═══════════════════════════════════════════════════════
//  CONFIG PERSISTENTE — Grupos FB + Revolico por categoría
// ═══════════════════════════════════════════════════════

// Categorías disponibles en Revolico
const REVOLICO_CATS = [
    "Computación > Accesorios",
    "Computación > Computadoras",
    "Computación > Impresoras y Tintas",
    "Computación > Redes y Conectividad",
    "Computación > Software",
    "Electrónica > Audio y Video",
    "Electrónica > Celulares y Tablets",
    "Electrónica > Electrónica en General",
    "Electrónica > Fotografía",
    "Electrónica > Juegos y Consolas",
    "Electrónica > TV y Monitores",
    "Hogar y Jardín > Electrodomésticos",
    "Hogar y Jardín > Energía Solar",
    "Hogar y Jardín > Herramientas",
    "Hogar y Jardín > Muebles",
    "Vehículos > Accesorios",
    "Otros > General",
];

// ── Revolico Config ──────────────────────────────────

function renderizarRevolicoConfig() {
    const cont = document.getElementById('listaRevolicoConfig');
    if (!cont) return;

    const config = JSON.parse(localStorage.getItem('revolicoConfig') || '{}');

    if (productos.length === 0) {
        cont.innerHTML = '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:10px;">No hay productos cargados aún.</p>';
        return;
    }

    cont.innerHTML = productos.map(p => {
        const catActual = config[p.id] || '';
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:white;border-radius:10px;border:1px solid var(--border-color);flex-wrap:wrap;">
            <img src="${p.imagen}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;">
            <span style="flex:1;font-size:13px;font-weight:600;min-width:120px;">${p.nombre}</span>
            <select onchange="actualizarRevolicoCat(${p.id}, this.value)"
                style="flex:2;min-width:180px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--border-color);font-size:12px;background:var(--cream);">
                <option value="">— No publicar en Revolico —</option>
                ${REVOLICO_CATS.map(c => `<option value="${c}" ${c === catActual ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
        </div>`;
    }).join('');
}

function actualizarRevolicoCat(idProducto, categoria) {
    const config = JSON.parse(localStorage.getItem('revolicoConfig') || '{}');
    if (categoria) {
        config[idProducto] = categoria;
    } else {
        delete config[idProducto];
    }
    localStorage.setItem('revolicoConfig', JSON.stringify(config));
}

function guardarRevolicoConfig() {
    const config = JSON.parse(localStorage.getItem('revolicoConfig') || '{}');
    const asignados = Object.keys(config).length;
    mostrarNotificacion(`✅ Config Revolico guardada (${asignados} productos asignados). Haz clic en ACTUALIZAR TIENDA para subir a GitHub.`);
}

// ── Grupos FB persistentes (carga al abrir pestaña) ──

function cargarGruposFB() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    renderizarGruposFB(grupos);
    renderizarRevolicoConfig();
}

// ── Patch guardarGruposFB para también actualizar localStorage limpio ──
const _origGuardarGrupos = guardarGruposFB;
guardarGruposFB = function() {
    const grupos = JSON.parse(localStorage.getItem('gruposFB') || '[]');
    const validos = grupos.filter(g => g.url && g.url.includes('facebook.com'));
    mostrarNotificacion(`✅ ${validos.length} grupos guardados. Haz clic en ACTUALIZAR TIENDA para que sean permanentes.`);
};


function togglePanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    if (!panel) return;
    panel.classList.toggle('visible');
    const bar = document.getElementById('heroSearchBar');
    if (bar) bar.classList.toggle('panel-open');
}


// ══════════════════════════════════════════════════════
// 🛒 MINI-CARRITO
// ══════════════════════════════════════════════════════
let carrito = JSON.parse(localStorage.getItem('carritoTM') || '[]');

function _guardarCarrito() {
    localStorage.setItem('carritoTM', JSON.stringify(carrito));
    _actualizarCarritoUI();
}

function agregarAlCarrito(id) {
    const p = productos.find(x => String(x.id) === String(id));
    if (!p) return;
    const ex = carrito.find(x => String(x.id) === String(id));
    if (ex) {
        ex.qty = (ex.qty || 1) + 1;
    } else {
        carrito.push({
            id: String(p.id),
            nombre: p.nombre,
            precio: parseFloat(p.precioActual || p.precio || 0),
            imagen: p.imagen || (p.imagenes && p.imagenes[0]) || '',
            qty: 1
        });
    }
    _guardarCarrito();
    mostrarNotificacion('✅ Agregado al carrito', 'success');
}

function agregarAlCarritoDesdeDetalle() {
    if (typeof _detalleProductoActual !== 'undefined' && _detalleProductoActual) {
        agregarAlCarrito(_detalleProductoActual.id);
    }
}

function cambiarCantidadCarrito(id, delta) {
    const item = carrito.find(x => String(x.id) === String(id));
    if (!item) return;
    item.qty = Math.max(0, (item.qty || 1) + delta);
    if (item.qty === 0) carrito = carrito.filter(x => String(x.id) !== String(id));
    _guardarCarrito();
}

function vaciarCarrito() {
    if (!confirm('¿Vaciar el carrito?')) return;
    carrito = [];
    _guardarCarrito();
}

function _actualizarCarritoUI() {
    const fab   = document.getElementById('carritoFab');
    const badge = document.getElementById('carritoBadge');
    const total = carrito.reduce((s, x) => s + (x.precio || 0) * (x.qty || 1), 0);
    const count = carrito.reduce((s, x) => s + (x.qty || 1), 0);

    if (fab)   fab.style.display = count > 0 ? 'flex' : 'none';
    if (badge) badge.textContent  = count;

    const totalEl = document.getElementById('carritoTotalEl');
    if (totalEl) totalEl.textContent = '$' + total.toLocaleString();

    const itemsEl = document.getElementById('carritoItemsEl');
    if (!itemsEl) return;

    if (carrito.length === 0) {
        itemsEl.innerHTML = '<div class="carrito-empty">Tu carrito está vacío 🛒</div>';
        return;
    }
    itemsEl.innerHTML = carrito.map(item => `
        <div class="carrito-item">
            <img src="${item.imagen}" alt="${item.nombre}" onerror="this.style.display='none'">
            <div class="carrito-item-info">
                <div class="carrito-item-name">${item.nombre}</div>
                <div class="carrito-item-price">$${(item.precio || 0).toLocaleString()}</div>
            </div>
            <div class="carrito-qty">
                <button class="qty-btn" onclick="cambiarCantidadCarrito('${item.id}', -1)">−</button>
                <span class="qty-num">${item.qty || 1}</span>
                <button class="qty-btn" onclick="cambiarCantidadCarrito('${item.id}', 1)">+</button>
            </div>
        </div>
    `).join('');
}

function abrirCarrito() {
    _actualizarCarritoUI();
    document.getElementById('carritoOverlay').classList.add('open');
}

function cerrarCarrito() {
    document.getElementById('carritoOverlay').classList.remove('open');
}

function pedirCarritoWhatsApp() {
    if (carrito.length === 0) return;
    const tel = '5354320170';
    let msg = '🛒 *Pedido TiendaMax*

';
    let total = 0;
    carrito.forEach(item => {
        const sub = (item.precio || 0) * (item.qty || 1);
        total += sub;
        msg += `• ${item.nombre} ×${item.qty || 1} — $${sub.toLocaleString()}
`;
    });
    msg += `
💰 *Total: $${total.toLocaleString()}*

¡Hola! Quiero hacer este pedido.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ══════════════════════════════════════════════════════
// ⭐ RESEÑAS POR PRODUCTO
// ══════════════════════════════════════════════════════
let _estrellasPendientes = {};

function _getResenas(pid) {
    return JSON.parse(localStorage.getItem('res_' + pid) || '[]');
}

function _saveResena(pid, stars, txt) {
    const lista = _getResenas(pid);
    lista.unshift({ stars, txt, fecha: new Date().toLocaleDateString() });
    localStorage.setItem('res_' + pid, JSON.stringify(lista.slice(0, 30)));
}

function _avgStars(pid) {
    const r = _getResenas(pid);
    if (!r.length) return 0;
    return (r.reduce((s, x) => s + x.stars, 0) / r.length).toFixed(1);
}

function renderResenaWidget(pid) {
    const lista  = _getResenas(pid);
    const avg    = _avgStars(pid);
    const filled = Math.round(avg);
    const starsHTML = [1,2,3,4,5].map(n =>
        `<span class="star-input${n <= filled ? ' active' : ''}" onclick="seleccionarEstrella('${pid}',${n})">★</span>`
    ).join('');
    const listaHTML = lista.slice(0,3).map(r => `
        <div class="resena-item">
            <div class="resena-item-meta">
                <span>${'★'.repeat(r.stars)}</span>
                <span>${r.fecha}</span>
            </div>
            <div>${r.txt}</div>
        </div>`).join('');
    return `
        <div class="resenas-wrap" id="resWrap_${pid}">
            <div class="resenas-header">
                <div class="resenas-stars">${starsHTML}</div>
                ${avg > 0 ? `<span class="resenas-avg">${avg} ★</span><span class="resenas-count">(${lista.length} opinión${lista.length !== 1 ? 'es' : ''})</span>` : '<span class="resenas-count" style="font-size:11px;">Sé el primero en opinar</span>'}
            </div>
            <div class="resena-form" id="resForm_${pid}">
                <textarea class="resena-textarea" id="resTxt_${pid}" rows="2" placeholder="Escribe tu opinión..."></textarea>
                <div class="resena-form-btns">
                    <button class="btn-publicar-resena" onclick="publicarResena('${pid}')">Publicar</button>
                    <button class="btn-cancelar-resena" onclick="cerrarResenaForm('${pid}')">Cancelar</button>
                </div>
            </div>
            ${listaHTML ? `<div class="resenas-lista">${listaHTML}</div>` : ''}
        </div>`;
}

function seleccionarEstrella(pid, n) {
    _estrellasPendientes[pid] = n;
    // Iluminar
    const wrap = document.getElementById('resWrap_' + pid);
    if (wrap) {
        wrap.querySelectorAll('.star-input').forEach((s, i) => {
            s.classList.toggle('active', i < n);
        });
    }
    // Abrir form
    const form = document.getElementById('resForm_' + pid);
    if (form) form.classList.add('open');
}

function cerrarResenaForm(pid) {
    const form = document.getElementById('resForm_' + pid);
    if (form) form.classList.remove('open');
}

function publicarResena(pid) {
    const txt   = (document.getElementById('resTxt_' + pid)?.value || '').trim();
    const stars = _estrellasPendientes[pid] || 5;
    if (!txt) { mostrarNotificacion('Escribe una opinión primero', 'error'); return; }
    _saveResena(pid, stars, txt);
    mostrarNotificacion('✅ ¡Gracias por tu opinión!');
    // Refrescar widget
    const wrap = document.getElementById('resWrap_' + pid);
    if (wrap) wrap.outerHTML = renderResenaWidget(pid);
}

// ══════════════════════════════════════════════════════
// 👁 VISTO RECIENTEMENTE
// ══════════════════════════════════════════════════════
function registrarVisto(pid) {
    let v = JSON.parse(localStorage.getItem('vistosTM') || '[]');
    v = [String(pid), ...v.filter(x => x !== String(pid))].slice(0, 12);
    localStorage.setItem('vistosTM', JSON.stringify(v));
    _renderRecientes();
}

function _renderRecientes() {
    const sec  = document.getElementById('recientesSection');
    const grid = document.getElementById('recientesGrid');
    if (!sec || !grid) return;
    const ids   = JSON.parse(localStorage.getItem('vistosTM') || '[]');
    const items = ids.map(id => productos.find(p => String(p.id) === id)).filter(Boolean);
    if (items.length === 0) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    grid.innerHTML = items.map(p => `
        <div class="reciente-card" onclick="abrirDetalleProducto(${p.id})">
            <img src="${p.imagen || ''}" alt="${p.nombre}" onerror="this.style.display='none'">
            <div class="reciente-name">${p.nombre}</div>
            <div class="reciente-price">$${parseFloat(p.precioActual || p.precio || 0).toLocaleString()}</div>
        </div>
    `).join('');
}

// ══════════════════════════════════════════════════════
// INIT EXTRAS
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    _actualizarCarritoUI();
    _renderRecientes();
});
