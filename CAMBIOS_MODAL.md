# TiendaMax — Modal premium v4

Archivos incluidos en este paquete:

- `index.html`: estructura del modal, rating en el encabezado y cache-busting.
- `css/modal-v4.css`: estilos premium verticales, colores, layout, countdown y responsive.
- `css/bundle.css`: bundle CSS regenerado.
- `js/src/tm-product.src.js`: lógica fuente del detalle, descuento y scroll inicial.
- `js/src/tm-product.js`: módulo minificado regenerado.
- `js/tm-bundle.js`: bundle JS regenerado.
- `admin.html`: referencia de cache-busting actualizada para el bundle.

El countdown solo aparece cuando existe una oferta activa asociada al producto. No se agregó selector de variantes. El modal responde correctamente al modo oscuro y al modo claro, con contraste alto en ambos temas.

## Vista local

Desde la carpeta raíz de TiendaMax:

```bash
python3 -m http.server 8000
```

Luego abrir `http://localhost:8000/index.html`.
