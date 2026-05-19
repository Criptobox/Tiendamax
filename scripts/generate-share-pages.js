#!/usr/bin/env node
/**
 * Genera páginas HTML estáticas en /p/ para cada producto
 * con las etiquetas Open Graph correctas (imagen, título, descripción).
 *
 * Cuando alguien comparte https://tiendamax.org/p/producto-1234.html
 * WhatsApp/Facebook/Telegram leen los meta tags y muestran la miniatura.
 * Luego la página redirige al usuario a la app principal.
 *
 * USO:
 *   node scripts/generate-share-pages.js
 *
 * También se ejecuta automáticamente vía GitHub Actions
 * cuando se actualiza productos.json
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://tiendamax.org';
const PRODUCTOS_FILE = path.join(__dirname, '..', 'productos.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'p');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildImageUrl(imagen) {
  if (!imagen) return `${SITE_URL}/og-image.svg`;
  if (imagen.startsWith('http')) return imagen;
  return `${SITE_URL}/imagenes/${imagen}`;
}

function generateProductPage(producto) {
  const imagenUrl = buildImageUrl(producto.imagen);
  const nombre = escapeHtml(producto.nombre || 'Producto');
  const descripcion = escapeHtml(
    (producto.descripcion || 'Disponible en TiendaMax').replace(/\n/g, ' ').substring(0, 200)
  );
  const precio = Number(producto.precioActual || 0).toFixed(2);
  const productoId = producto.id;
  const redirectUrl = `${SITE_URL}/#producto-${productoId}`;
  const pageUrl = `${SITE_URL}/p/producto-${productoId}.html`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nombre} — $${precio} USD | TiendaMax</title>

<!-- ═══ Open Graph (WhatsApp, Facebook, Instagram) ═══ -->
<meta property="og:type" content="product">
<meta property="og:title" content="${nombre} — $${precio} USD">
<meta property="og:description" content="${descripcion}">
<meta property="og:image" content="${imagenUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<meta property="og:site_name" content="TiendaMax">
<meta property="product:price:amount" content="${precio}">
<meta property="product:price:currency" content="USD">
<meta property="og:locale" content="es_CU">

<!-- ═══ Twitter Card ═══ -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${nombre} — $${precio} USD">
<meta name="twitter:description" content="${descripcion}">
<meta name="twitter:image" content="${imagenUrl}">

<!-- ═══ Redireccionar al usuario a la app ═══ -->
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<link rel="canonical" href="${redirectUrl}">

<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0D0D0D;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
  }
  .loader {
    padding: 40px;
  }
  .loader h2 {
    color: #C9A96E;
    font-size: 18px;
    margin-bottom: 12px;
  }
  .loader p {
    color: #888;
    font-size: 14px;
    margin-bottom: 20px;
  }
  .loader a {
    display: inline-block;
    background: linear-gradient(135deg, #FF6B35, #E8501E);
    color: #fff;
    text-decoration: none;
    padding: 12px 28px;
    border-radius: 50px;
    font-weight: 600;
    font-size: 14px;
  }
  .spinner {
    width: 36px; height: 36px;
    border: 3px solid rgba(201,169,110,0.2);
    border-top-color: #C9A96E;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 20px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="loader">
  <div class="spinner"></div>
  <h2>${nombre}</h2>
  <p>$${precio} USD — Abriendo producto...</p>
  <a href="${redirectUrl}">Abrir en TiendaMax</a>
</div>
<script>
  // Redirección instantánea
  window.location.replace('${redirectUrl}');
</script>
</body>
</html>`;
}

// ── Main ──
try {
  const raw = fs.readFileSync(PRODUCTOS_FILE, 'utf8');
  const productos = JSON.parse(raw);

  // Crear directorio /p/ si no existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Limpiar archivos viejos
  const oldFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.html'));
  oldFiles.forEach(f => fs.unlinkSync(path.join(OUTPUT_DIR, f)));

  // Generar página por cada producto
  let count = 0;
  productos.forEach(p => {
    if (!p.id) return;
    const html = generateProductPage(p);
    const filePath = path.join(OUTPUT_DIR, `producto-${p.id}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    count++;
  });

  console.log(`✅ ${count} páginas de producto generadas en /p/`);
  console.log(`   Ejemplo: ${SITE_URL}/p/producto-${productos[0]?.id}.html`);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
