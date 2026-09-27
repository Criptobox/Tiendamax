// ═══════════════════════════════════════════════════════
// SEO DINÁMICO — Actualiza meta tags por producto
// ═══════════════════════════════════════════════════════

// Lo que la página tenía ANTES de abrir la ficha, leído del propio HTML.
// Antes era una copia escrita aquí a mano ("TiendaMax — Tu tienda online en
// Cuba") que no coincidía con el <title> real de index.html, así que al
// cerrar la ficha la pestaña cambiaba a un título que la página nunca tuvo.
// Se captura al abrir la primera ficha (no al abrir una segunda desde
// «relacionados», que ya muestra la de un producto) y se devuelve al cerrar.
const _TM_SEO_CAMPOS = [
    ['link[rel="canonical"]', 'href'],
    ['meta[property="og:title"]', 'content'], ['meta[property="og:description"]', 'content'],
    ['meta[property="og:image"]', 'content'], ['meta[property="og:url"]', 'content'],
    ['meta[name="twitter:title"]', 'content'], ['meta[name="twitter:description"]', 'content'],
    ['meta[name="twitter:image"]', 'content'], ['meta[name="description"]', 'content'],
    ['meta[name="keywords"]', 'content'],
];
let _tmSEOAntes = null;
function _tmSEOCapturar() {
    if (_tmSEOAntes) return;
    _tmSEOAntes = { title: document.title, campos: _TM_SEO_CAMPOS.map(([sel, attr]) => {
        const el = document.querySelector(sel);
        return el ? [el, attr, el.getAttribute(attr)] : null;
    }).filter(Boolean) };
}
const _tmOGDefault = { image: 'https://tiendamax.org/img/og-image.jpg' };

// Actualizar canonical URL y meta tags cuando se abre un producto
function actualizarSEOPorProducto(producto) {
    if (!producto) return;
    _tmSEOCapturar();
    
    const baseUrl = 'https://tiendamax.org';
    const productoUrl = `${baseUrl}/#producto-${producto.id}`;
    
    // Actualizar canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.href = productoUrl;
    }
    
    // Construir valores OG del producto
    const seoTitle = producto.seoTitle || producto.nombre || 'TiendaMax';
    const rawDesc = producto.seoDescription || String(producto.descripcion || '');
    const seoDesc = rawDesc.length > 200 ? rawDesc.substring(0, 200) + '…' : rawDesc;
    const seoImage = producto.imagen || _tmOGDefault.image;

    // Actualizar Open Graph
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    
    if (ogTitle) ogTitle.content = seoTitle;
    if (ogDesc) ogDesc.content = seoDesc;
    if (ogImage) ogImage.content = seoImage;
    if (ogUrl) ogUrl.content = productoUrl;
    
    // Actualizar Twitter Card
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    const twImage = document.querySelector('meta[name="twitter:image"]');
    const metaDesc = document.querySelector('meta[name="description"]');
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    
    if (twTitle) twTitle.content = seoTitle;
    if (twDesc) twDesc.content = seoDesc;
    if (twImage) twImage.content = seoImage;
    if (metaDesc) metaDesc.content = seoDesc;
    if (metaKeywords && Array.isArray(producto.seoKeywords)) metaKeywords.content = producto.seoKeywords.join(', ');
    
    // Actualizar title de la página
    document.title = producto.seoTitle || `${producto.nombre} | TiendaMax`;
}

// Restaurar meta tags originales cuando se cierra el producto
function restaurarSEOOriginal() {
    if (!_tmSEOAntes) return;
    _tmSEOAntes.campos.forEach(([el, attr, valor]) => {
        if (valor == null) el.removeAttribute(attr); else el.setAttribute(attr, valor);
    });
    document.title = _tmSEOAntes.title;
    _tmSEOAntes = null;
}
