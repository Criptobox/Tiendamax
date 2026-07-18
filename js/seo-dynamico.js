// ═══════════════════════════════════════════════════════
// SEO DINÁMICO — Actualiza meta tags por producto
// ═══════════════════════════════════════════════════════

// Valores OG originales del homepage (para restaurar al cerrar modal)
const _tmOGDefault = {
    title: 'TiendaMax — Tu tienda online en Cuba',
    description: 'Encuentra los mejores productos al mejor precio. Envíos a toda Cuba.',
    url: 'https://tiendamax.cu',
    image: 'https://tiendamax.cu/img/og-image.jpg'
};

// Actualizar canonical URL y meta tags cuando se abre un producto
function actualizarSEOPorProducto(producto) {
    if (!producto) return;
    
    const baseUrl = 'https://tiendamax.cu';
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
    const baseUrl = _tmOGDefault.url;
    
    // Restaurar canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.href = baseUrl;
    }
    
    // Restaurar Open Graph
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    
    if (ogTitle) ogTitle.content = _tmOGDefault.title;
    if (ogDesc) ogDesc.content = _tmOGDefault.description;
    if (ogImage) ogImage.content = _tmOGDefault.image;
    if (ogUrl) ogUrl.content = baseUrl;
    
    // Restaurar Twitter Card
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    const twImage = document.querySelector('meta[name="twitter:image"]');
    
    if (twTitle) twTitle.content = _tmOGDefault.title;
    if (twDesc) twDesc.content = _tmOGDefault.description;
    if (twImage) twImage.content = _tmOGDefault.image;
    
    // Restaurar title original
    document.title = 'TiendaMax — Tu tienda online en Cuba';
}
