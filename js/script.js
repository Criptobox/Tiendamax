
// ═══════════════════════════════════════════════════════
//  🛒 CARRITO DE COMPRAS — con persistencia 24h
// ═══════════════════════════════════════════════════════

function _cargarCarrito() {
    try {
        const raw = localStorage.getItem('carrito_v2');
        if (!raw) return [];
        const { items, expires } = JSON.parse(raw);
        if (Date.now() > expires) { localStorage.removeItem('carrito_v2'); return []; }
        return items || [];
    } catch { return []; }
}
let carrito = _cargarCarrito();

function guardarCarrito() {
    const payload = { items: carrito, expires: Date.now() + 24 * 60 * 60 * 1000 };
    localStorage.setItem('carrito_v2', JSON.stringify(payload));
    actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
    const total = carrito.reduce((s, i) => s + i.cantidad, 0);
    const el = document.getElementById('cartCount');
    if (!el) return;
    if (total === 0) {
        el.style.display = 'none';
    } else {
        el.style.display = 'flex';
        el.textContent = total > 99 ? '99+' : total;
    }
}

function agregarAlCarrito(id) {
    const p = productos.find(x => x.id === id);
    if (!p || p.stock === 0) return;

    const existing = carrito.find(x => x.id === id);
    if (existing) {
        if (existing.cantidad < p.stock) {
            existing.cantidad++;
        } else {
            mostrarNotificacion('⚠️ No hay más unidades disponibles', 'error');
            return;
        }
    } else {
        carrito.push({
            id:       p.id,
            nombre:   p.nombre,
            precio:   p.precioActual,
            imagen:   p.imagen,
            cantidad: 1
        });
    }
    guardarCarrito();
    mostrarNotificacion('✅ ' + p.nombre.substring(0,25) + ' agregado al carrito');
    renderizarCarrito();
    actualizarBotonesCarrito();
}

function quitarDelCarrito(id) {
    carrito = carrito.filter(x => x.id !== id);
    guardarCarrito();
    renderizarCarrito();
    actualizarBotonesCarrito();
}

function cambiarCantidad(id, delta) {
    const item = carrito.find(x => x.id === id);
    if (!item) return;
    const p = productos.find(x => x.id === id);
    const maxStock = p ? p.stock : 99;
    item.cantidad = Math.max(1, Math.min(maxStock, item.cantidad + delta));
    if (item.cantidad === 0) quitarDelCarrito(id);
    else { guardarCarrito(); renderizarCarrito(); }
}

function limpiarCarrito() {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    actualizarBotonesCarrito();
}

function abrirCarrito() {
    renderizarCarrito();
    const drawer = document.getElementById('carritoDrawer');
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function cerrarCarrito() {
    document.getElementById('carritoDrawer').classList.add('hidden');
    document.body.style.overflow = '';
}

function renderizarCarrito() {
    const itemsEl  = document.getElementById('carritoItems');
    const vacioEl  = document.getElementById('carritoVacio');
    const footerEl = document.getElementById('carritoFooter');
    const totalEl  = document.getElementById('carritoTotal');
    if (!itemsEl) return;

    if (carrito.length === 0) {
        itemsEl.innerHTML  = '';
        vacioEl.style.display  = 'block';
        footerEl.style.display = 'none';
        return;
    }

    vacioEl.style.display  = 'none';
    footerEl.style.display = 'block';

    const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2) + ' USD';

    itemsEl.innerHTML = carrito.map(item => {
        const subtotal = (item.precio * item.cantidad).toFixed(2);
        return '<div class="carrito-item" id="cartItem-' + item.id + '">' +
            '<img class="carrito-item-img" src="' + item.imagen + '" alt="' + item.nombre + '" onerror="this.style.display=&quot;none&quot;">'  +
            '<div class="carrito-item-info">' +
                '<div class="carrito-item-name">' + item.nombre + '</div>' +
                '<div class="carrito-item-price">$' + subtotal + ' USD</div>' +
                '<div class="carrito-item-controls">' +
                    '<button class="carrito-qty-btn" onclick="cambiarCantidad(' + item.id + ',-1)">−</button>' +
                    '<span class="carrito-qty-num">' + item.cantidad + '</span>' +
                    '<button class="carrito-qty-btn" onclick="cambiarCantidad(' + item.id + ',1)">+</button>' +
                    '<span style="font-size:11px;color:#aaa;margin-left:4px;">$' + item.precio.toFixed(2) + ' c/u</span>' +
                '</div>' +
            '</div>' +
            '<button class="carrito-item-del" onclick="quitarDelCarrito(' + item.id + ')" title="Eliminar">✕</button>' +
            '</div>';
    }).join('');
}

function comprarCarrito() {
    if (carrito.length === 0) return;
    const lineas = carrito.map(i =>
        '• ' + i.nombre + ' x' + i.cantidad + ' — $' + (i.precio * i.cantidad).toFixed(2) + ' USD'
    );
    const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const msg = encodeURIComponent(
        'Hola! Me gustar\u00eda hacer este pedido:\n\n' +
        lineas.join('\n') +
        '\n\n\uD83D\uDCB0 Total: $' + total.toFixed(2) + ' USD\n\n\u00BFEst\u00E1 disponible?'
    );
    window.open('https://wa.me/' + getNumeroWhatsApp() + '?text=' + msg, '_blank');
}

// Actualiza el estado visual de los botones "Agregar al carrito" en los cards
function actualizarBotonesCarrito() {
    document.querySelectorAll('[data-cart-id]').forEach(btn => {
        const id = parseInt(btn.getAttribute('data-cart-id'));
        const enCarrito = carrito.some(x => x.id === id);
        if (enCarrito) {
            btn.classList.add('en-carrito');
            btn.textContent = '✓ En carrito';
        } else {
            btn.classList.remove('en-carrito');
            btn.textContent = '🛒 Agregar';
        }
    });
}

// ═══════════════════════════════════════════════════════
//  ⭐ RESEÑAS
// ═══════════════════════════════════════════════════════
let _estrellasSeleccionadas = 0;
let _productoResena = null;

function mostrarFormResena() {
    const form = document.getElementById('formResena');
    const btn  = document.getElementById('btnAgregarResena');
    if (!form) return;
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? '+ Agregar reseña' : '✕ Cancelar';
    _estrellasSeleccionadas = 0;
    setEstrellas(0);
    const autorEl = document.getElementById('resenaAutor');
    const textoEl = document.getElementById('resenaTexto');
    if (autorEl) autorEl.value = '';
    if (textoEl) textoEl.value = '';
}

function setEstrellas(n) {
    _estrellasSeleccionadas = n;
    document.querySelectorAll('.estrella-btn').forEach((btn, i) => {
        btn.classList.toggle('activa', i < n);
    });
}

function guardarResena() {
    if (!_detalleProductoActual) return;
    const autor = (document.getElementById('resenaAutor')?.value || '').trim();
    const texto = (document.getElementById('resenaTexto')?.value || '').trim();
    if (!autor) { mostrarNotificacion('⚠️ Escribe tu nombre', 'error'); return; }
    if (_estrellasSeleccionadas === 0) { mostrarNotificacion('⚠️ Selecciona una valoración', 'error'); return; }
    if (!texto) { mostrarNotificacion('⚠️ Escribe tu reseña', 'error'); return; }

    const nuevaResena = {
        autor,
        texto,
        estrellas: _estrellasSeleccionadas,
        fecha: new Date().toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' })
    };

    // Guardar en clave propia del producto (persistencia local)
    const key = 'resenas_' + _detalleProductoActual.id;
    const resenas = JSON.parse(localStorage.getItem(key) || '[]');
    resenas.unshift(nuevaResena);
    const resenasSlice = resenas.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(resenasSlice));

    // También guardar dentro del array de productos en localStorage para que
    // se incluyan en el productos.json descargable y sean persistentes
    try {
        const prodIndex = productos.findIndex(p => p.id === _detalleProductoActual.id);
        if (prodIndex !== -1) {
            if (!productos[prodIndex].resenas) productos[prodIndex].resenas = [];
            productos[prodIndex].resenas.unshift(nuevaResena);
            productos[prodIndex].resenas = productos[prodIndex].resenas.slice(0, 20);
            localStorage.setItem('productos', JSON.stringify(productos));
            // Sincronizar también con el producto actual en memoria
            _detalleProductoActual.resenas = productos[prodIndex].resenas;
        }
    } catch(e) { /* no crítico */ }

    mostrarFormResena(); // cerrar form
    renderizarResenas(_detalleProductoActual.id);
    mostrarNotificacion('✅ ¡Reseña publicada!');
}

function renderizarResenas(productoId) {
    const el = document.getElementById('listaResenas');
    if (!el) return;

    // Buscar reseñas: primero en el producto en memoria, luego en localStorage
    let resenas = [];
    const prodEnMemoria = productos.find(p => p.id === productoId);
    if (prodEnMemoria && Array.isArray(prodEnMemoria.resenas) && prodEnMemoria.resenas.length > 0) {
        resenas = prodEnMemoria.resenas;
    } else {
        const key = 'resenas_' + productoId;
        resenas = JSON.parse(localStorage.getItem(key) || '[]');
    }

    if (resenas.length === 0) {
        el.innerHTML = '<p class="resenas-vacio">Sé el primero en dejar una reseña 🌟</p>';
        return;
    }
    const promedio = (resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length).toFixed(1);
    el.innerHTML =
        '<div style="text-align:center;margin-bottom:14px;">' +
            '<span style="font-size:28px;font-weight:900;color:#f59e0b;">' + promedio + '</span>' +
            '<span style="color:#f59e0b;font-size:18px;margin-left:6px;">' + '★'.repeat(Math.round(parseFloat(promedio))) + '</span>' +
            '<div style="font-size:12px;color:#aaa;">' + resenas.length + ' reseña' + (resenas.length !== 1 ? 's' : '') + '</div>' +
        '</div>' +
        resenas.map(r =>
            '<div class="resena-item">' +
                '<div class="resena-top">' +
                    '<span class="resena-autor">' + r.autor + '</span>' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span class="resena-estrellas">' + '★'.repeat(r.estrellas) + '☆'.repeat(5 - r.estrellas) + '</span>' +
                        '<span class="resena-fecha">' + r.fecha + '</span>' +
                    '</div>' +
                '</div>' +
                '<p class="resena-texto">' + r.texto + '</p>' +
            '</div>'
        ).join('');
}

// ═══════════════════════════════════════════════════════
//  🕐 VISTO RECIENTEMENTE
// ═══════════════════════════════════════════════════════
function registrarVisto(id) {
    let recientes = JSON.parse(localStorage.getItem('recientes') || '[]');
    recientes = recientes.filter(x => x !== id);
    recientes.unshift(id);
    recientes = recientes.slice(0, 8); // max 8
    localStorage.setItem('recientes', JSON.stringify(recientes));
    renderizarRecientes();
}

function limpiarRecientes() {
    localStorage.removeItem('recientes');
    const sec = document.getElementById('seccionRecientes');
    if (sec) sec.style.display = 'none';
}

function renderizarRecientes() {
    // Sección "Visto recientemente" oculta
    const _sec = document.getElementById("seccionRecientes"); if (_sec) _sec.style.display = "none"; return;
    const recientes = JSON.parse(localStorage.getItem('recientes') || '[]');
    const sec  = document.getElementById('seccionRecientes');
    const grid = document.getElementById('recientesGrid');
    if (!sec || !grid || recientes.length === 0) {
        if (sec) sec.style.display = 'none';
        return;
    }
    const items = recientes
        .map(id => productos.find(p => p.id === id))
        .filter(Boolean);
    if (items.length === 0) { sec.style.display = 'none'; return; }

    sec.style.display = 'block';
    grid.innerHTML = items.map(p =>
        '<div class="producto-card" onclick="abrirDetalleProducto(' + p.id + ')" style="cursor:pointer;">' +
            '<div class="producto-image">' +
                '<img src="' + p.imagen + '" alt="' + p.nombre + '" loading="lazy">' +
            '</div>' +
            '<h3 style="font-size:13px;padding:10px 12px 4px;">' + p.nombre + '</h3>' +
            '<p class="precio" style="padding:0 12px 10px;"><span class="precio-actual">$' + p.precioActual.toFixed(2) + '</span></p>' +
        '</div>'
    ).join('');
}

// ═══════════════════════════════════════════════════════
//  🔔 NOTIFICACIONES PUSH
// ═══════════════════════════════════════════════════════
async function solicitarNotificaciones() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
}

function mostrarNotificacionPush(titulo, cuerpo, icono) {
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(titulo, {
            body: cuerpo,
            icon: icono || 'https://tiendamax.org/favicon.ico',
            badge: 'https://tiendamax.org/favicon.ico',
            tag: 'tiendamax'
        });
    } catch(e) {}
}

// Verificar si hay productos nuevos desde la última visita
function verificarProductosNuevos() {
    const ultimaVisita = parseInt(localStorage.getItem('ultimaVisita') || '0');
    const ahora = Date.now();
    localStorage.setItem('ultimaVisita', ahora.toString());
    if (ultimaVisita === 0) return; // Primera visita
    const nuevos = productos.filter(p => p.id > ultimaVisita).length;
    if (nuevos > 0 && Notification.permission === 'granted') {
        mostrarNotificacionPush(
            '🛍️ TiendaMax',
            nuevos === 1 ? '¡Hay 1 producto nuevo!' : `¡Hay ${nuevos} productos nuevos!`
        );
    }
}

'use strict';

// ===== CONFIGURACIÓN GLOBAL =====
const BACKEND_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://127.0.0.1:5002/api' 
    : '/api';
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
//  BÚSQUEDA HERO — con IA (Claude API)
// ═══════════════════════════════════════════════════════
let _heroSearchActivo = '';
let _heroPrecioMin    = 0;
let _heroPrecioMax    = Infinity;
let _heroSearchTimer  = null;
let _aiSearchTimer    = null;

function abrirPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (!panel) return;
    panel.classList.add('visible');
    if (bar) bar.classList.add('open');
    setTimeout(() => document.getElementById('heroSearchInput')?.focus(), 50);
}

function cerrarPanelBusqueda() {
    const panel = document.getElementById('heroSearchPanel');
    const bar   = document.getElementById('heroSearchBar');
    if (panel) panel.classList.remove('visible');
    if (bar)   bar.classList.remove('open');
}

// Stubs de compatibilidad
function inicializarSliderPrecios() {}
function actualizarSliderPrecio() {}

// Búsqueda local rápida
function busquedaLocal(q) {
    if (!q) return productos.slice(0, 6);
    const ql = q.toLowerCase();
    return productos.filter(p =>
        p.nombre.toLowerCase().includes(ql) ||
        (p.descripcion||'').toLowerCase().includes(ql) ||
        (p.categoria||'').toLowerCase().includes(ql) ||
        (p.subcategoria||'').toLowerCase().includes(ql)
    ).slice(0, 6);
}

// Búsqueda con IA
async function busquedaConIA(q) {
    if (!q || q.length < 3 || productos.length === 0) return null;
    try {
        const catalogo = productos.map(p =>
            'ID:' + p.id + ' | "' + p.nombre + '" | ' + p.categoria + ' | $' + p.precioActual + ' | Desc: ' + (p.descripcion||'').substring(0,80)
        ).join('\n');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 200,
                system: 'Eres un asistente de búsqueda de tienda. Dado un catálogo de productos y una consulta del usuario, devuelve SOLO un JSON array con los IDs de los productos más relevantes (máximo 5), ordenados por relevancia. Ejemplo: [123456, 789012]. Si no hay resultados devuelve []. NO agregues texto adicional.',
                messages: [{ role: 'user', content: 'Catálogo:\n' + catalogo + '\n\nConsulta del usuario: "' + q + '"\n\nResponde solo con el JSON array de IDs.' }]
            })
        });
        if (!response.ok) return null;
        const data = await response.json();
        const text = data.content?.map(c => c.text || '').join('') || '';
        const clean = text.replace(/```json|```/g, '').trim();
        const ids = JSON.parse(clean);
        if (!Array.isArray(ids)) return null;
        return ids.map(id => productos.find(p => String(p.id) === String(id))).filter(Boolean);
    } catch(e) { return null; }
}

function renderSugerencias(resultados, q) {
    const sugBox = document.getElementById('heroSearchSuggestions');
    if (!sugBox) return;
    if (!resultados || resultados.length === 0) {
        sugBox.innerHTML = '<div class="hsb-sug-empty">😕 Sin resultados para "' + q + '"</div>';
        return;
    }
    sugBox.innerHTML = resultados.map(p => {
        const nombre = q ? resaltarTexto(p.nombre, q) : p.nombre;
        const agotadoBadge = p.stock === 0 ? '<span style="color:#e74c3c;font-size:10px;font-weight:700;margin-left:4px;">AGOTADO</span>' : '';
        return '<div class="hsb-sug-item" onclick="seleccionarSugerencia(' + p.id + ')">' +
            '<img class="hsb-sug-img" src="' + p.imagen + '" onerror="this.style.display=\'none\'">' +
            '<span class="hsb-sug-name">' + nombre + agotadoBadge + '</span>' +
            '<span class="hsb-sug-price">$' + p.precioActual.toFixed(2) + '</span>' +
            '</div>';
    }).join('');
}

async function buscarDesdeHero(query) {
    clearTimeout(_heroSearchTimer);
    clearTimeout(_aiSearchTimer);
    const q = (query || '').trim();
    const sugBox = document.getElementById('heroSearchSuggestions');
    const aiLabel = document.getElementById('hsb-ai-label');
    if (!q) {
        if (sugBox) sugBox.innerHTML = '';
        if (aiLabel) aiLabel.style.display = 'none';
        return;
    }
    _heroSearchTimer = setTimeout(async () => {
        const locales = busquedaLocal(q);
        renderSugerencias(locales, q);
        if (q.length >= 3) {
            if (aiLabel) aiLabel.style.display = 'block';
            if (locales.length < 2 && sugBox) {
                sugBox.innerHTML = '<div class="hsb-ai-loading">🤖 Buscando con IA</div>';
            }
            _aiSearchTimer = setTimeout(async () => {
                const iaResultados = await busquedaConIA(q);
                if (iaResultados && iaResultados.length > 0) {
                    renderSugerencias(iaResultados, q);
                } else {
                    renderSugerencias(locales.length > 0 ? locales : [], q);
                }
            }, 600);
        }
    }, 150);
}

function aplicarBusquedaHero() {
    const q = (document.getElementById('heroSearchInput')?.value || '').trim().toLowerCase();
    _heroSearchActivo = q;
    _heroPrecioMin = 0;
    _heroPrecioMax = Infinity;
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
    if (!e.target.closest('.hsb-wrap')) cerrarPanelBusqueda();
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
    const uid = 'ts' + Math.random().toString(36).slice(2,7);
    const html = '<div style="background:var(--bg-secondary,#f9f6f1);border-radius:12px;padding:14px;text-align:center;">' +
        '<div style="font-size:22px;">' + icon + '</div>' +
        '<div id="' + uid + '" class="tm-counter" style="font-size:' + (typeof value === 'number' ? '22px' : '18px') + ';font-weight:800;color:' + (color||'var(--primary-color,#c9a96e)') + ';">' + value + '</div>' +
        '<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
        '</div>';
    // Animar contador después del render
    setTimeout(() => {
        const el = document.getElementById(uid);
        if (!el) return;
        if (typeof value === 'number') {
            animarContador(el, value, 800 + Math.random() * 500);
        } else if (typeof value === 'string' && value.startsWith('$')) {
            animarContador(el, parseFloat(value.replace('$','')), 1000, '$');
        }
    }, 60);
    return html;
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
        // Cargar banners PRIMERO para que el slider muestre los correctos de una vez
        try {
            const dataBanners = await fetchJSON('banners.json');
            if (dataBanners && Array.isArray(dataBanners) && dataBanners.length > 0) {
                localStorage.setItem('heroBanners', JSON.stringify(dataBanners));
                if (typeof window.recargarBanners === 'function') window.recargarBanners(dataBanners);
            }
        } catch(e) {}

        // Cargar comisiones desde archivo separado
        try {
            const dataComisiones = await fetchJSON('comisiones.json');
            if (dataComisiones && typeof dataComisiones === 'object') {
                localStorage.setItem('comisiones', JSON.stringify(dataComisiones));
            }
        } catch(e) {}

        const dataProd = await fetchJSON('productos.json');
        if (dataProd && dataProd.length > 0) {
            // Preservar campos locales (comision, resenas) que no están en GitHub
            const productosLocales = JSON.parse(localStorage.getItem('productos') || '[]');
            const mapaLocal = {};
            productosLocales.forEach(p => { mapaLocal[p.id] = p; });

            productos = dataProd.map(p => {
                const fix = url => url && url.includes('raw.githubusercontent.com')
                    ? url.replace(/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\//,'https://tiendamax.org/')
                    : url;
                if (p.imagen) p.imagen = fix(p.imagen);
                if (p.imagenSecundaria) p.imagenSecundaria = fix(p.imagenSecundaria);
                if (Array.isArray(p.imagenes)) p.imagenes = p.imagenes.map(fix);

                // Aplicar comisiones: primero desde almacén separado (comisiones.json/localStorage),
                // luego desde el producto local, para que siempre prevalezca el valor más reciente
                const comisionesGuardadas = JSON.parse(localStorage.getItem('comisiones') || '{}');
                const local = mapaLocal[p.id];
                if (comisionesGuardadas[p.id] !== undefined) {
                    // El almacén separado es la fuente de verdad para comisiones
                    p.comision = comisionesGuardadas[p.id];
                } else if (local && local.comision !== undefined) {
                    p.comision = local.comision;
                    // Migrar al almacén separado para que persista
                    const com = JSON.parse(localStorage.getItem('comisiones') || '{}');
                    com[p.id] = local.comision;
                    localStorage.setItem('comisiones', JSON.stringify(com));
                }
                if (local && local.resenas && local.resenas.length > 0) p.resenas = local.resenas;
                return p;
            });
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
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    }
});

// ===== FUNCIONES DE UTILIDAD =====

function getNumeroWhatsApp() {
    return localStorage.getItem('whatsappNumero') || '5354320170';
}

function guardarNumeroWhatsApp() {
    const input = document.getElementById('adminWhatsappNum');
    if (!input) return;
    const num = input.value.trim().replace(/\D/g, '');
    if (!num || num.length < 6) { mostrarNotificacion('⚠️ Número inválido', 'error'); return; }
    localStorage.setItem('whatsappNumero', num);
    mostrarNotificacion('✅ Número de WhatsApp guardado: +' + num);
}

function cargarNumeroWhatsApp() {
    const saved = localStorage.getItem('whatsappNumero');
    const input = document.getElementById('adminWhatsappNum');
    if (input && saved) input.value = saved;
}

function contactarWhatsApp() {
    const numeroWhatsApp = getNumeroWhatsApp();
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
    // Dispara animaciones CSS DESPUÉS de que el DOM está poblado
    grid.classList.remove('tm-rendered');
    requestAnimationFrame(() => grid.classList.add('tm-rendered'));
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
            
            <button class="btn-pedir-card" onclick="event.stopPropagation(); tmComprar(event, ${producto.id}, '${producto.nombre}')" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>
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

    // ── Rate limiting: 3 intentos → bloqueo 5 minutos ──
    const rl = JSON.parse(localStorage.getItem('admin_rl') || '{"count":0,"until":0}');
    if (Date.now() < rl.until) {
        const mins = Math.ceil((rl.until - Date.now()) / 60000);
        mostrarNotificacion(`🔒 Demasiados intentos. Espera ${mins} min.`, 'error');
        return;
    }

    const passwordInput = document.getElementById('adminPassword').value.trim();
    const inputHash = await hashPassword(passwordInput);
    
    const hashesValidos = [
        'a338781ef2610e22bde9dae45f2d8aaa6a8a8c4584158f18cd91089b9192bc62',
        '90035f586903f0259868846c2459740b957630712759861619894101e405187e'
    ];
    
    if (hashesValidos.includes(inputHash)) {
        localStorage.removeItem('admin_rl');
        usuarioAutenticado = true;
        cerrarLoginModal();
        abrirAdminPanel();
    } else {
        // Registrar intento fallido
        const newCount = (rl.count || 0) + 1;
        const lockout = newCount >= 3 ? Date.now() + 5 * 60 * 1000 : rl.until;
        localStorage.setItem('admin_rl', JSON.stringify({ count: newCount, until: lockout }));
        const msg = newCount >= 3
            ? '🔒 3 intentos fallidos. Bloqueado 5 min.'
            : `❌ Contraseña incorrecta (intento ${newCount}/3)`;
        mostrarNotificacion(msg, 'error');
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
    if (tabName === 'ventas') setTimeout(renderizarVentas, 100);
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
            comision: parseFloat(document.getElementById('productComision')?.value) || 0,
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

        // Guardar comisión en almacén separado (siempre, aunque sea 0)
        const comisiones = JSON.parse(localStorage.getItem('comisiones') || '{}');
        comisiones[producto.id] = producto.comision || 0;
        localStorage.setItem('comisiones', JSON.stringify(comisiones));

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
function comprimirImagen(source, maxKB = 25, maxWidth = 480, maxHeight = 480) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width  = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            let quality = 0.82;
            let result  = canvas.toDataURL('image/jpeg', quality);
            while (result.length > maxKB * 1024 * 1.37 && quality > 0.2) {
                quality -= 0.06;
                result = canvas.toDataURL('image/jpeg', quality);
            }
            resolve(result);
        };

        img.onerror = () => resolve(source);

        if (typeof source === 'string') {
            img.src = source;
        } else {
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
            <button class="btn-pedir-card" onclick="event.stopPropagation(); tmComprar(event, ${producto.id}, '${producto.nombre}')" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>
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

    // Botón comprar (estilo WhatsApp "Pedir")
    const buyBtn = document.getElementById('detailBuyBtn');
    buyBtn.disabled = p.stock === 0;
    if (p.stock === 0) {
        buyBtn.innerHTML = '❌ Sin stock';
    } else {
        buyBtn.innerHTML = `
            <span class="btn-pedir-wa-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
            </span>
            <span class="btn-pedir-wa-text">Pedir</span>
        `;
    }
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

    // Reseñas
    renderizarResenas(p.id);
    document.getElementById('formResena').style.display = 'none';
    const btnResena = document.getElementById('btnAgregarResena');
    if (btnResena) btnResena.textContent = '+ Agregar reseña';
    _estrellasSeleccionadas = 0;
    setEstrellas(0);

    // Historial de vistas
    registrarVisto(p.id);

    // Botón carrito en modal
    const detailBuyRow = document.getElementById('detailBuyBtn');
    if (detailBuyRow) {
        // Agregar botón carrito junto al de comprar si no existe
        let cartRowEl = document.getElementById('detailCartBtn');
        if (!cartRowEl) {
            cartRowEl = document.createElement('button');
            cartRowEl.id = 'detailCartBtn';
            cartRowEl.className = 'btn-carrito';
            cartRowEl.style.cssText = 'width:100%;margin-bottom:10px;padding:12px;font-size:14px;';
            detailBuyRow.parentNode.insertBefore(cartRowEl, detailBuyRow.nextSibling);
        }
        const enCarro = carrito.some(x => x.id === p.id);
        cartRowEl.textContent  = enCarro ? '✓ En el carrito — Ver carrito' : '🛒 Agregar al carrito';
        cartRowEl.className    = 'btn-carrito' + (enCarro ? ' en-carrito' : '');
        cartRowEl.style.cssText = 'width:100%;margin-bottom:10px;padding:12px;font-size:14px;';
        cartRowEl.onclick = () => {
            if (carrito.some(x => x.id === p.id)) {
                cerrarDetalleModal();
                abrirCarrito();
            } else {
                agregarAlCarrito(p.id, null, cartRowEl);
                cartRowEl.textContent = '✓ En el carrito — Ver carrito';
                cartRowEl.className = 'btn-carrito en-carrito';
            }
        };
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

function abrirPanelCompartir() {
    const panel = document.getElementById('panelCompartirRedes');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
}

function _getShareData() {
    const p = _detalleProductoActual;
    if (!p) return null;
    return {
        nombre: p.nombre,
        precio: p.precioActual.toFixed(2),
        texto: `🛍️ *${p.nombre}* — $${p.precioActual.toFixed(2)} USD\n📦 Stock disponible\n👉 tiendamax.org`,
        url: 'https://tiendamax.org'
    };
}

function compartirWhatsApp() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(d.texto);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function compartirFacebook() {
    const d = _getShareData(); if (!d) return;
    const url = encodeURIComponent(d.url);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${encodeURIComponent(d.texto)}`, '_blank');
}

function compartirTelegram() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(d.texto + '\n' + d.url);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.texto)}`, '_blank');
}

function compartirTwitter() {
    const d = _getShareData(); if (!d) return;
    const msg = encodeURIComponent(`${d.nombre} — $${d.precio} USD en @TiendaMax 🛍️ ${d.url}`);
    window.open(`https://twitter.com/intent/tweet?text=${msg}`, '_blank');
}

function compartirNativo() {
    const p = _detalleProductoActual;
    if (!p) return;
    const texto = `🛍️ ${p.nombre} — $${p.precioActual.toFixed(2)} USD\n📦 Stock disponible\n👉 tiendamax.org`;
    if (navigator.share) {
        navigator.share({ title: p.nombre, text: texto, url: 'https://tiendamax.org' }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => mostrarNotificacion('📤 Texto copiado para compartir'));
    }
}

function compartirProducto() {
    abrirPanelCompartir();
}

function copiarLinkProducto() {
    navigator.clipboard.writeText('https://tiendamax.org').then(() =>
        mostrarNotificacion('🔗 Enlace copiado')
    ).catch(() => mostrarNotificacion('❌ No se pudo copiar', 'error'));
}

function contactarProducto(nombre) {
    const msg = encodeURIComponent(`Hola, me interesa el producto: ${nombre}. ¿Está disponible?`);
    window.open(`https://wa.me/${getNumeroWhatsApp()}?text=${msg}`, '_blank');
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
    if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
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
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
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
    if (document.getElementById('editProductComision')) document.getElementById('editProductComision').value = p.comision || '';

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
            devolucion: document.getElementById('editProductDevolucion') ? document.getElementById('editProductDevolucion').checked : productos[index].devolucion,
            comision: document.getElementById('editProductComision') ? parseFloat(document.getElementById('editProductComision').value) || 0 : productos[index].comision || 0
        };

        // Validar producto
        const errores = validarProducto(productoActualizado);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos[index] = productoActualizado;
        guardarProductos();

        // Guardar comisión en almacén separado para que persista
        const comisiones = JSON.parse(localStorage.getItem('comisiones') || '{}');
        comisiones[productoActualizado.id] = productoActualizado.comision || 0;
        localStorage.setItem('comisiones', JSON.stringify(comisiones));

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

    const btn = document.querySelector('[data-action="sincronizarTodoConGitHub"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    // --- Barra de progreso ---
    let barraContenedor = document.getElementById('syncProgressContenedor');
    if (!barraContenedor) {
        barraContenedor = document.createElement('div');
        barraContenedor.id = 'syncProgressContenedor';
        barraContenedor.style.cssText = 'margin-top:14px;';
        barraContenedor.innerHTML = `
            <div style="background:#2a2a2a;border-radius:8px;overflow:hidden;height:14px;margin-bottom:6px;">
                <div id="syncProgressBarra" style="height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#ff9a6c);transition:width 0.4s ease;border-radius:8px;"></div>
            </div>
            <p id="syncProgressTexto" style="font-size:12px;color:#aaa;text-align:center;margin:0;"></p>
        `;
        if (btn) btn.parentNode.insertBefore(barraContenedor, btn.nextSibling);
    }
    barraContenedor.style.display = 'block';
    const barra   = document.getElementById('syncProgressBarra');
    const textoEl = document.getElementById('syncProgressTexto');
    if (barra)   barra.style.width = '0%';
    if (textoEl) textoEl.textContent = 'Preparando...';

    function actualizarBarra(paso, total, mensaje) {
        const pct = Math.round((paso / total) * 100);
        if (barra)   barra.style.width = pct + '%';
        if (textoEl) textoEl.textContent = mensaje;
    }
    // -------------------------

    const idsModificados = obtenerProductosModificados();
    const hayDelta = idsModificados.length > 0 && idsModificados.length < productos.length;

    if (hayDelta) {
        mostrarNotificacion(`🔄 Subiendo ${idsModificados.length} producto(s) modificado(s)...`, 'info');
    } else {
        mostrarNotificacion('🚀 Sincronizando tienda completa con GitHub...', 'info');
    }

    const archivos = [
        { path: 'productos.json',              data: productos },
        { path: 'categorias.json',             data: { nombres: categorias, iconos: iconosPersonalizados } },
        { path: 'subcategorias.json',          data: JSON.parse(localStorage.getItem('subcategorias') || '{}') },
        { path: 'grupos_facebook_config.json', data: { grupos: JSON.parse(localStorage.getItem('gruposFB') || '[]'), exportado: new Date().toISOString() } },
        { path: 'revolico_config.json',        data: JSON.parse(localStorage.getItem('revolicoConfig') || '{}') },
        { path: 'banners.json',                data: JSON.parse(localStorage.getItem('heroBanners') || '[]') },
        { path: 'comisiones.json',             data: JSON.parse(localStorage.getItem('comisiones') || '{}') },
    ];

    // Si hay productos modificados: subir solo productos.json + comisiones.json
    // Si no hay delta: subir todo
    const archivosFiltrados = hayDelta
        ? archivos.filter(a => a.path === 'productos.json' || a.path === 'comisiones.json')
        : archivos;

    let ok = 0, errors = [];
    const total = archivosFiltrados.length;
    // Subir secuencialmente para evitar conflictos de SHA en GitHub
    for (let i = 0; i < archivosFiltrados.length; i++) {
        const { path, data } = archivosFiltrados[i];
        actualizarBarra(i, total, `Subiendo ${path}… (${i + 1}/${total})`);
        if (btn) btn.textContent = `⏳ ${i + 1}/${total} archivos...`;
        try {
            await subirArchivoAGitHub(user, repo, token, path, data);
            ok++;
        } catch (e) {
            errors.push(`${path}: ${e.message}`);
        }
    }
    actualizarBarra(total, total, errors.length === 0 ? '✅ ¡Todo subido correctamente!' : '⚠️ Completado con errores');

    if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }

    // Ocultar barra después de 4 segundos
    setTimeout(() => {
        if (barraContenedor) barraContenedor.style.display = 'none';
    }, 4000);

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

    // Paso 6: Actualizar referencia HEAD (force:true evita el error "not a fast-forward")
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/main`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sha: newCommitSha, force: true })
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
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-action="sincronizarTodoConGitHub"]').forEach(el => {
            el.addEventListener('click', sincronizarTodoConGitHub);
        });
    });
} else {
    inicializarTienda();
    document.querySelectorAll('[data-action="sincronizarTodoConGitHub"]').forEach(el => {
        el.addEventListener('click', sincronizarTodoConGitHub);
    });
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

const HERO_IMG_DEFAULT = 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&q=75&auto=format&fit=crop';

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
    // Dispara animaciones CSS DESPUÉS de que el DOM está poblado
    requestAnimationFrame(() => grid.classList.add('tm-rendered'));
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
                        · Stock: <strong>${producto.stock || 0}</strong>
                        ${producto.comision > 0 ? `· 💰 Comisión: <strong style="color:#27ae60;">$${producto.comision.toFixed(2)}</strong>` : ''}
                    </p>
                </div>
                <div class="product-item-actions" style="clear:both;padding-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
                    <button class="btn-small-icon" style="background:#27ae60;color:white;" onclick="ajustarStock(${producto.id}, 1)">+1 Stock</button>
                    <button class="btn-small-icon" style="background:#e74c3c;color:white;" onclick="ajustarStock(${producto.id}, -1)">-1 Stock</button>
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

// ── Ajustar stock desde gestionar ──────────────────
// desdeVenta=true cuando lo llama registrarVenta (omite notificación de stock para no duplicar)
function ajustarStock(id, cantidad, desdeVenta = false) {
    const p = productos.find(p => p.id === id);
    if (!p) return;
    const antes = p.stock;
    p.stock = Math.max(0, (p.stock || 0) + cantidad);
    guardarProductos();
    marcarProductoModificado(id);
    actualizarListaProductos();
    // Solo mostrar notificación de stock cuando se ajusta desde Gestionar (no desde una venta)
    if (!desdeVenta) {
        mostrarNotificacion(`📦 ${p.nombre}: ${antes} → ${p.stock} unidades`);
        if (p.stock === 0) mostrarNotificacion(`🔴 ¡${p.nombre} agotado!`, 'error');
        else if (p.stock <= 2) mostrarNotificacion(`⚠️ ${p.nombre}: solo ${p.stock} unidad(es)`, 'warning');
    }
}

// ── VENTAS — registro de ventas ─────────────────────
function cargarVentas() {
    return JSON.parse(localStorage.getItem('registroVentas') || '[]');
}

function guardarVenta(venta) {
    const ventas = cargarVentas();
    ventas.unshift(venta);
    localStorage.setItem('registroVentas', JSON.stringify(ventas.slice(0, 500)));
}

function registrarVenta(productoId, cantidad) {
    const p = productos.find(p => p.id === productoId);
    if (!p) return;
    const venta = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}),
        producto: p.nombre,
        productoId: p.id,
        cantidad: cantidad || 1,
        precio: p.precioActual,
        comision: p.comision || 0,
        total: p.precioActual * (cantidad || 1),
        ganancia: (p.comision || 0) * (cantidad || 1)
    };
    guardarVenta(venta);
    ajustarStock(productoId, -(cantidad || 1), true); // true = viene de una venta confirmada
    renderizarVentas();
    mostrarNotificacion(`✅ Venta registrada: ${p.nombre}`);
}

function renderizarVentas() {
    const cont = document.getElementById('ventasContenido');
    if (!cont) return;
    const ventas = cargarVentas();

    const totalVentas   = ventas.reduce((s, v) => s + v.total, 0);
    const totalGanancia = ventas.reduce((s, v) => s + (v.ganancia || 0), 0);
    const totalUnidades = ventas.reduce((s, v) => s + (v.cantidad || 1), 0);

    let html = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
        <div style="background:linear-gradient(135deg,#27ae60,#2ecc71);color:white;padding:16px;border-radius:12px;text-align:center;">
            <div style="font-size:22px;font-weight:900;">$${totalVentas.toFixed(2)}</div>
            <div style="font-size:11px;opacity:0.9;">Total vendido</div>
        </div>
        <div style="background:linear-gradient(135deg,#f39c12,#f1c40f);color:white;padding:16px;border-radius:12px;text-align:center;">
            <div style="font-size:22px;font-weight:900;">$${totalGanancia.toFixed(2)}</div>
            <div style="font-size:11px;opacity:0.9;">Mi ganancia</div>
        </div>
        <div style="background:linear-gradient(135deg,#3498db,#2980b9);color:white;padding:16px;border-radius:12px;text-align:center;">
            <div style="font-size:22px;font-weight:900;">${totalUnidades}</div>
            <div style="font-size:11px;opacity:0.9;">Unidades vendidas</div>
        </div>
    </div>

    <div style="margin-bottom:16px;">
        <h4 style="margin-bottom:10px;">📦 Registrar venta manual</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
            <select id="ventaProductoSelect" style="padding:10px;border-radius:8px;border:1px solid #ddd;font-size:14px;">
                <option value="">— Selecciona producto —</option>
                ${productos.map(p => `<option value="${p.id}">${p.nombre} · $${p.precioActual} · Stock: ${p.stock}${p.comision ? ` · Comisión: $${p.comision}` : ''}</option>`).join('')}
            </select>
            <div style="display:flex;gap:8px;">
                <input type="number" id="ventaCantidad" value="1" min="1" placeholder="Cantidad" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;font-size:14px;">
                <button onclick="registrarVentaDesdeForm()" type="button" class="btn btn-primary" style="flex:2;">✅ Registrar venta</button>
            </div>
        </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h4>📋 Historial de ventas</h4>
        <button onclick="borrarHistorialVentas()" type="button" style="background:#e74c3c;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">🗑️ Limpiar</button>
    </div>`;

    if (ventas.length === 0) {
        html += '<p style="color:#aaa;text-align:center;padding:20px;">No hay ventas registradas aún.</p>';
    } else {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        ventas.slice(0, 50).forEach(v => {
            html += `<div style="background:rgba(39,174,96,0.06);border:1px solid rgba(39,174,96,0.2);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:13px;">${v.producto}</div>
                    <div style="font-size:11px;color:#888;">${v.fecha} · ${v.cantidad} unidad(es)</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:14px;font-weight:700;color:#27ae60;">$${v.total.toFixed(2)}</div>
                    ${v.ganancia > 0 ? `<div style="font-size:11px;color:#f39c12;">Ganancia: $${v.ganancia.toFixed(2)}</div>` : ''}
                </div>
                <button onclick="eliminarVenta(${v.id})" type="button" style="background:#e74c3c;color:white;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex-shrink:0;">✕</button>
            </div>`;
        });
        html += '</div>';
    }

    cont.innerHTML = html;
}

function registrarVentaDesdeForm() {
    const sel = document.getElementById('ventaProductoSelect');
    const cant = parseInt(document.getElementById('ventaCantidad')?.value) || 1;
    const id = parseInt(sel?.value);
    if (!id) { mostrarNotificacion('⚠️ Selecciona un producto', 'error'); return; }
    registrarVenta(id, cant);
}

function eliminarVenta(id) {
    const ventas = cargarVentas().filter(v => v.id !== id);
    localStorage.setItem('registroVentas', JSON.stringify(ventas));
    renderizarVentas();
}

function borrarHistorialVentas() {
    if (!confirm('¿Borrar todo el historial de ventas?')) return;
    localStorage.removeItem('registroVentas');
    renderizarVentas();
    mostrarNotificacion('🗑️ Historial borrado');
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



// ═══════════════════════════════════════════════════════
//  OFERTA DEL DÍA
// ═══════════════════════════════════════════════════════
function poblarSelectOfertaDia() {
    ['ofertaDiaSelect','ofertaDiaSelect2'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— Sin oferta del día activa —</option>';
        productos.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nombre + ' — $' + p.precioActual.toFixed(2);
            sel.appendChild(opt);
        });
        const saved = localStorage.getItem('ofertaDiaId');
        if (saved) sel.value = saved;
        else if (current) sel.value = current;
    });
    actualizarStatusOfertaDia();
}

function actualizarStatusOfertaDia() {
    const savedId = localStorage.getItem('ofertaDiaId');
    const texto = localStorage.getItem('ofertaDiaTexto') || '🔥 OFERTA DEL DÍA';
    ['ofertaDiaStatus','ofertaDiaStatus2'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (savedId) {
            const p = productos.find(x => String(x.id) === String(savedId));
            el.innerHTML = p ? '✅ Activa: <strong>' + p.nombre + '</strong> — Badge: "' + texto + '"' : '⚠️ Producto no encontrado';
        } else {
            el.textContent = 'Sin oferta activa.';
        }
    });
}

function guardarOfertaDia() {
    const sel = document.getElementById('ofertaDiaSelect');
    const textoEl = document.getElementById('ofertaDiaTexto');
    _guardarOfertaDiaDesde(sel, textoEl);
}
function guardarOfertaDia2() {
    const sel = document.getElementById('ofertaDiaSelect2');
    const textoEl = document.getElementById('ofertaDiaTexto2');
    _guardarOfertaDiaDesde(sel, textoEl);
}
function _guardarOfertaDiaDesde(sel, textoEl) {
    if (!sel || !sel.value) { mostrarNotificacion('⚠️ Selecciona un producto', 'error'); return; }
    const texto = textoEl ? (textoEl.value.trim() || '🔥 OFERTA DEL DÍA') : '🔥 OFERTA DEL DÍA';
    localStorage.setItem('ofertaDiaId', sel.value);
    localStorage.setItem('ofertaDiaTexto', texto);
    actualizarStatusOfertaDia();
    renderizarProductos();
    renderizarMasVendidos();
    mostrarNotificacion('🏷️ Oferta del Día activada');
}
function desactivarOfertaDia() {
    localStorage.removeItem('ofertaDiaId');
    localStorage.removeItem('ofertaDiaTexto');
    poblarSelectOfertaDia();
    renderizarProductos();
    renderizarMasVendidos();
    mostrarNotificacion('❌ Oferta del Día desactivada');
}
function getOfertaDiaId() {
    return localStorage.getItem('ofertaDiaId') || null;
}
function getOfertaDiaTexto() {
    return localStorage.getItem('ofertaDiaTexto') || '🔥 OFERTA DEL DÍA';
}

// Renderizar lista de productos agotados en el panel
function renderizarListaAgotados() {
    const el = document.getElementById('productosAgotadosList');
    if (!el) return;
    const agotados = productos.filter(p => p.stock === 0);
    if (agotados.length === 0) {
        el.innerHTML = '<p style="font-size:13px;color:#27ae60;text-align:center;">✅ No hay productos agotados actualmente.</p>';
        return;
    }
    el.innerHTML = agotados.map(p =>
        '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:white;border-radius:10px;border:1px solid rgba(231,76,60,0.3);">' +
            '<img src="' + p.imagen + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" onerror="this.style.display=\'none\'">' +
            '<div style="flex:1;"><div style="font-size:13px;font-weight:700;">' + p.nombre + '</div>' +
            '<div style="font-size:11px;color:#e74c3c;font-weight:700;">📦 AGOTADO</div></div>' +
            '<button class="btn btn-primary" onclick="abrirEditModal(' + p.id + ')" style="font-size:11px;padding:6px 10px;">✏️ Editar</button>' +
        '</div>'
    ).join('');
}

// ── Patch switchTab to hook oferta-dia tab ──
const _origSwitchTabFinal = switchTab;
switchTab = function(tabName) {
    // Refrescar select de categorías al entrar al tab de subcategorías
    if (tabName === 'manage-subcategories' && typeof actualizarSelectCategoriasPadre === 'function') {
        setTimeout(actualizarSelectCategoriasPadre, 50);
    }
    _origSwitchTabFinal(tabName);
    if (tabName === 'oferta-dia') {
        setTimeout(() => {
            poblarSelectOfertaDia();
            renderizarListaAgotados();
        }, 100);
    }
    if (tabName === 'configuracion') {
        setTimeout(cargarNumeroWhatsApp, 100);
    }
};

// ── Patch abrirAdminPanel to load WhatsApp number ──
const _origAbrirAdminFinal = abrirAdminPanel;
abrirAdminPanel = function() {
    _origAbrirAdminFinal();
    cargarNumeroWhatsApp();
    poblarSelectOfertaDia();
};

// ── Patch renderizarProductos to show agotado/oferta badges ──
const _origRenderProductosFinal = renderizarProductos;
renderizarProductos = function() {
    const productosGrid = document.getElementById('productosGrid');
    if (!productosGrid) { _origRenderProductosFinal(); return; }

    let productosFiltrados = categoriaSeleccionada === 'Todas'
        ? productos
        : productos.filter(p => p.categoria === categoriaSeleccionada);

    if (categoriaSeleccionada !== 'Todas' && subcategoriaSeleccionada && subcategoriaSeleccionada !== 'Todas') {
        productosFiltrados = productosFiltrados.filter(p => p.subcategoria === subcategoriaSeleccionada);
    }
    if (_heroSearchActivo || _heroPrecioMin > 0 || _heroPrecioMax < Infinity) {
        const q = _heroSearchActivo;
        productosFiltrados = productosFiltrados.filter(p => {
            const matchQ = !q || p.nombre.toLowerCase().includes(q) ||
                (p.descripcion||'').toLowerCase().includes(q) ||
                (p.categoria||'').toLowerCase().includes(q);
            return matchQ;
        });
    }

    // Ordenar: oferta del día primero
    const ofertaId = getOfertaDiaId();
    if (ofertaId) {
        productosFiltrados = productosFiltrados.sort((a, b) => {
            if (String(a.id) === String(ofertaId)) return -1;
            if (String(b.id) === String(ofertaId)) return 1;
            return 0;
        });
    }

    productosGrid.innerHTML = '';
    if (productosFiltrados.length === 0) {
        productosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 60px 20px; font-size:15px;">No hay productos en esta subcategoría aún.</p>';
        return;
    }

    productosFiltrados.forEach(producto => {
        const esAgotado = producto.stock === 0;
        const esOfertaDia = String(producto.id) === String(ofertaId);
        const card = document.createElement('div');
        card.className = 'producto-card' + (esAgotado ? ' card-agotado' : '');
        card.onclick = () => abrirDetalleProducto(producto.id);
        card.style.position = 'relative';
        card.innerHTML =
            (esOfertaDia ? '<div class="badge-oferta-dia">' + getOfertaDiaTexto() + '</div>' :
             esAgotado ? '<div class="badge-agotado">AGOTADO</div>' :
             producto.masVendido ? '<div class="badge-vendido">🔥 Más Vendido</div>' : '') +
            '<div class="producto-image">' +
                '<img src="' + producto.imagen + '" alt="' + producto.nombre + '" loading="lazy">' +
                (producto.descuento > 0 ? '<div class="badge">-' + producto.descuento + '%</div>' : '') +
            '</div>' +
            '<h3>' + producto.nombre + '</h3>' +
            '<p class="producto-description">' + producto.descripcion + '</p>' +
            '<p class="precio"><span class="precio-actual">$' + producto.precioActual.toFixed(2) + ' USD</span></p>' +
            (esAgotado
                ? '<div class="stock" style="color:#e74c3c;font-weight:700;">❌ Agotado</div><button class="btn btn-small btn-primary" disabled style="opacity:0.5;cursor:not-allowed;">No disponible</button>'
                : '<div class="stock">📦 Stock: ' + producto.stock + ' unidades</div>' +
                  (typeof renderCountdownHtml === 'function' ? renderCountdownHtml(producto.id) : '') +
                  '<button class="btn-pedir-card" onclick="event.stopPropagation(); tmComprar(event, ' + producto.id + ', \'' + producto.nombre + '\')" type="button"><span class="btn-pedir-wa-icon-sm"><svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span> Pedir</button>');
        productosGrid.appendChild(card);
    });
};


/* ============================================================
   TIENDAMAX — PREMIUM UPGRADE PACK JS
   Cursor · Progress bar · Toast glass · Placeholder animado
   Separadores · Footer premium
   ============================================================ */

// ===== CURSOR DORADO (solo desktop pointer:fine) =====
(function initCursor() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const cur = document.createElement('div');
    cur.id = 'tm-cursor';
    document.body.appendChild(cur);

    let mx = -100, my = -100;
    document.addEventListener('mousemove', e => {
        mx = e.clientX; my = e.clientY;
        cur.style.left = mx + 'px';
        cur.style.top  = my + 'px';
    }, { passive: true });

    document.addEventListener('mouseenter', () => cur.style.opacity = '1');
    document.addEventListener('mouseleave', () => cur.style.opacity = '0');

    const hoverEls = 'a,button,[onclick],[role="button"],.producto-card,.categoria-card';
    document.addEventListener('mouseover', e => {
        if (e.target.closest(hoverEls)) cur.classList.add('hover');
    });
    document.addEventListener('mouseout', e => {
        if (e.target.closest(hoverEls)) cur.classList.remove('hover');
    });
    document.addEventListener('mousedown', () => cur.classList.add('click'));
    document.addEventListener('mouseup',   () => cur.classList.remove('click'));
})();

// ===== BARRA DE PROGRESO DORADA =====
(function initProgress() {
    const bar = document.createElement('div');
    bar.id = 'tm-progress';
    document.body.appendChild(bar);

    function update() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
        bar.style.width = pct + '%';
        bar.style.opacity = pct > 1 ? '1' : '0';
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
})();

// ===== TOAST GLASSMORPHISM — reemplaza mostrarNotificacion =====
(function overrideToast() {
    let toastEl = null;
    let hideTimer = null;

    function getToast() {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'tm-toast';
            document.body.appendChild(toastEl);
        }
        return toastEl;
    }

    window.mostrarNotificacion = function(mensaje, tipo = 'success') {
        const t = getToast();
        clearTimeout(hideTimer);

        // Ícono
        const icon = tipo === 'error' ? '✕' : tipo === 'info' ? 'i' : '✓';
        t.className = 'tm-toast' + (tipo === 'error' ? ' error' : '');
        t.innerHTML = `<span class="tm-toast-icon">${icon}</span><span>${mensaje}</span>`;

        // Forzar reflow para reiniciar animación
        t.classList.remove('show', 'hide');
        void t.offsetWidth;
        t.classList.add('show');

        hideTimer = setTimeout(() => {
            t.classList.add('hide');
            setTimeout(() => { if (t) t.classList.remove('show', 'hide'); }, 350);
        }, 3500);
    };
})();

// ===== PLACEHOLDER ANIMADO EN BÚSQUEDA =====
(function initPlaceholder() {
    const frases = [
        'Buscar productos...',
        'WiFi, inversores...',
        'Celulares, cargadores...',
        'Tecnología premium...',
        'Energía solar...'
    ];
    let idx = 0;

    function rotar() {
        const input = document.getElementById('heroSearchInput');
        if (!input || document.activeElement === input || input.value) return;
        idx = (idx + 1) % frases.length;
        // Fade out → cambiar → fade in via style
        input.style.transition = 'opacity 0.4s';
        input.style.opacity = '0';
        setTimeout(() => {
            input.placeholder = frases[idx];
            input.style.opacity = '1';
        }, 400);
    }

    // Esperar a que el DOM esté listo
    function startRotation() {
        const input = document.getElementById('heroSearchInput');
        if (!input) { setTimeout(startRotation, 500); return; }
        setInterval(rotar, 3200);
    }
    setTimeout(startRotation, 2000);
})();




/* ════════════════════════════════════════════════════
   PREMIUM UPGRADE PACK 2 — JS
   Fly-to-cart · Skeleton loading · Analytics counter
═════════════════════════════════════════════════════ */

// ── 1. FLY-TO-CART: partícula que vuela al ícono del carrito ──
function flyToCart(originEl) {
    const cartBtn = document.querySelector('.cart-icon-btn');
    if (!cartBtn || !originEl) return;

    const from = originEl.getBoundingClientRect();
    const to   = cartBtn.getBoundingClientRect();

    const particle = document.createElement('div');
    particle.className = 'fly-particle';
    particle.style.cssText = `
        left: ${from.left + from.width / 2 - 7}px;
        top:  ${from.top  + from.height/ 2 - 7}px;
        opacity: 1;
    `;
    document.body.appendChild(particle);

    // Calcular delta
    const dx = (to.left + to.width / 2 - 7)  - (from.left + from.width  / 2 - 7);
    const dy = (to.top  + to.height/ 2 - 7)  - (from.top  + from.height / 2 - 7);

    // Arc animation usando requestAnimationFrame
    const duration = 650;
    const start = performance.now();

    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        // Ease in-out cubic
        const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
        // Arc: parábola en Y
        const arc = -Math.sin(Math.PI * t) * 90;

        particle.style.transform = `translate(${dx * e}px, ${dy * e + arc}px) scale(${1 - t * 0.4})`;
        particle.style.opacity   = t > 0.7 ? (1 - (t - 0.7) / 0.3) : '1';

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            particle.remove();
            // Bounce del carrito
            cartBtn.classList.remove('bounce');
            void cartBtn.offsetWidth; // reflow
            cartBtn.classList.add('bounce');
            setTimeout(() => cartBtn.classList.remove('bounce'), 560);
        }
    }
    requestAnimationFrame(step);
}

// ── FLY-TO-CART: función global que llama botones de comprar ──
function tmComprar(event, id, nombre) {
    const btn = (event && (event.currentTarget || event.target)) || null;
    // Lanzar partícula desde el botón
    if (btn) requestAnimationFrame(() => flyToCart(btn));
    // Agregar al carrito internamente
    agregarAlCarrito(id);
    // Abrir WhatsApp
    if (typeof contactarProducto === 'function') contactarProducto(nombre);
}

// Patch agregarAlCarrito para fly desde modal
const _origAgregarAlCarrito = agregarAlCarrito;
agregarAlCarrito = function(id, _unused, originEl) {
    _origAgregarAlCarrito(id);
    if (originEl) requestAnimationFrame(() => flyToCart(originEl));
};

// ── 2. SKELETON LOADING en grids de productos ──
function mostrarSkeletons(containerId, cantidad = 6) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const skeletonHTML = Array(cantidad).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line price"></div>
            <div style="margin:12px 16px 16px;height:36px;border-radius:10px;background:linear-gradient(90deg,#f0ebe4 25%,#e8e2da 50%,#f0ebe4 75%);background-size:200% auto;animation:skeletonPulse 1.5s ease-in-out infinite;"></div>
        </div>
    `).join('');

    container.innerHTML = skeletonHTML;
}

// ── 3. ANALYTICS COUNTER ANIMADO ──
function animarContador(el, target, duration = 1200, prefix = '', suffix = '') {
    const isFloat = String(target).includes('.');
    const decimals = isFloat ? 2 : 0;
    const numTarget = parseFloat(target) || 0;
    const start = performance.now();

    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        // Ease out expo
        const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        const current = numTarget * e;
        el.textContent = prefix + current.toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = prefix + numTarget.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
}

// Patch stat() para usar contadores animados
const _origStat = stat;
stat = function(icon, label, value, color) {
    const isNumeric = typeof value === 'number' || (typeof value === 'string' && value.startsWith('$'));
    const id = 'tm-stat-' + Math.random().toString(36).slice(2,7);
    const display = typeof value === 'number' ? value : value;

    const html = '<div style="background:var(--bg-secondary,#f9f6f1);border-radius:12px;padding:14px;text-align:center;">' +
        '<div style="font-size:22px;">' + icon + '</div>' +
        '<div id="' + id + '" class="tm-counter" style="font-size:' + (typeof value === 'number' ? '22px' : '18px') + ';font-weight:800;color:' + (color || 'var(--primary-color,#c9a96e)') + ';">' + value + '</div>' +
        '<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
        '</div>';

    // Animar después del render
    if (isNumeric) {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof value === 'number') {
                animarContador(el, value, 900 + Math.random() * 400);
            } else if (typeof value === 'string' && value.startsWith('$')) {
                const num = parseFloat(value.replace('$',''));
                animarContador(el, num, 1000, '$');
            }
        }, 80);
    }

    return html;
};

