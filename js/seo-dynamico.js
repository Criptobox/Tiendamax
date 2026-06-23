// ═══════════════════════════════════════════════════════
// SEO DINÁMICO — Actualiza meta tags por producto
// ═══════════════════════════════════════════════════════

// Actualizar canonical URL y meta tags cuando se abre un producto
function actualizarSEOPorProducto(producto) {
    if (!producto) return;
    
    const baseUrl = 'https://tiendamax.org';
    const productoUrl = `${baseUrl}/#producto-${producto.id}`;
    
    // Actualizar canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.href = productoUrl;
    }
    
    // Actualizar Open Graph
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    
    const seoTitle = producto.seoTitle || `${producto.nombre} — TiendaMax`;
    const seoDesc = producto.seoDescription || `${String(producto.descripcion || '').substring(0, 150)}... | $${producto.precioActual}`;
    const seoImage = producto.imagen;

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
    const baseUrl = 'https://tiendamax.org';
    
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
    
    if (ogTitle) ogTitle.content = 'TiendaMax — Donde encuentras lo que necesitas';
    if (ogDesc) ogDesc.content = 'Calidad premium, precios increíbles y atención personalizada. Miles de clientes satisfechos confían en TiendaMax cada día.';
    if (ogImage) ogImage.content = 'https://tiendamax.org/og-image.svg';
    if (ogUrl) ogUrl.content = baseUrl;
    
    // Restaurar Twitter Card
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    const twImage = document.querySelector('meta[name="twitter:image"]');
    
    if (twTitle) twTitle.content = 'TiendaMax — Donde encuentras lo que necesitas';
    if (twDesc) twDesc.content = 'Calidad premium, precios increíbles y atención personalizada. ¡Pide por WhatsApp!';
    if (twImage) twImage.content = 'https://tiendamax.org/og-image.svg';
    
    // Restaurar title original
    document.title = 'TiendaMax — Donde encuentras lo que necesitas | tiendamax.org';
}
