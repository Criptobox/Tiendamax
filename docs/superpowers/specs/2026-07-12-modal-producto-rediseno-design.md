# Rediseño visual del modal de detalle de producto

## Contexto

El usuario pasó un mockup de referencia (imagen) con un estilo de modal de producto más "premium": galería grande con contador de fotos, badges de confianza en tarjetas, bloque de precio grande, countdown de oferta, barra de "casi agotado", chips de specs, botón WhatsApp grande, contador de "personas vieron esto", reseñas con promedio arriba.

Investigación previa (esta sesión) confirmó que **la mayoría de esos elementos ya existen con datos reales**, enganchados al modal actual (`#productDetailModal` en `index.html`, lógica en `js/src/tm-product.src.js`, `tm-config.src.js`, `tm-init.src.js`). El trabajo es principalmente de **estilo visual**, no de lógica nueva — con dos excepciones explícitas descartadas por decisión del usuario (ver "Fuera de alcance").

Regla de la sesión (ya aplicada en tareas previas — "Texto honesto permanente para Carritos y WhatsApp chat"): **cero datos decorativos/falsos**. Todo elemento visual debe reflejar un dato real existente; si no hay dato real, el elemento no se muestra (no se inventa).

## Decisiones ya tomadas con el usuario

1. **Sin selector de variantes** (voltaje/potencia como botones en el mismo modal). Cada variante sigue siendo un producto independiente; la sección "también te puede interesar" (`#detailRelacionados`, ya existente) cumple ese rol.
2. **Sin caja "Qué recibirás"** (contenido de la caja/unboxing). No hay campo real para eso y se solapa con specs+garantía ya mostrados. Descartado — si se quiere más adelante, requeriría un campo nuevo "incluye" en el producto (fuera de este alcance).
3. **Countdown**: solo aparece en el producto que coincide con el `activeCountdown` configurado por el admin (un único producto a la vez, vía `getActiveCountdown()`). El resto de productos no muestran countdown.
4. **"Personas vieron esto"**: el dato real (`/analytics/vistas/{id}/count`) es un contador acumulado histórico, no una ventana de 24h. El texto no debe decir "en las últimas 24h" (eso sería inventado) — queda "X personas vieron este producto".

## Enfoque técnico

**Restyle en el lugar, no reconstrucción.** El modal actual funciona y está bien probado (varias rondas de fixes esta sesión: badges, foto cover, cantidad, botón WhatsApp). Toda la lógica de datos (`abrirDetalleProducto()` en `tm-product.src.js`) sigue escribiendo en los MISMOS IDs de elemento que ya existen hoy. Solo se toca:

- **CSS** (`css/rediseno-cards.css`, que ya es el último archivo en el orden de `build_css.py` y gana la cascada — se sigue extendiendo ahí, no se crea otro archivo de estilos para no fragmentar más).
- **HTML** (`index.html`, bloque `#productDetailModal`): reordenar/envolver elementos existentes en nuevos contenedores para el layout del mockup, y agregar 2 elementos nuevos (contador de fotos, contenedor de countdown) que no existían.
- **JS**: cambios mínimos — conectar el countdown reusando `renderCountdownHtml()` (ya existe, ya se usa en las cards de la grilla) dentro del modal, agregar el contador de fotos ("1 / N") a `renderizarGaleriaDetalle()`, y el cambio de texto de "vieron esto" ya descrito arriba.

## Secciones del modal (mapeo mockup → dato real → cambio)

1. **Header imagen**: badge "🆕 RECIÉN LLEGADO" superpuesto en la imagen si `esProductoNuevo(p)` (función ya existente, usada en cards) — nuevo elemento, estilo tipo mockup. Badge de descuento (`#detailProductBadge`, ya existe) se mantiene, solo cambia posición/estilo para no chocar con el nuevo badge "nuevo". Contador "1 / N" sobre la imagen — nuevo `<span>`, alimentado desde `renderizarGaleriaDetalle()` (ya sabe cuántas imágenes hay).
2. **Galería**: miniaturas (`#detailGalleryThumbs`, ya existe) — solo estilo, se acomodan en fila tipo mockup.
3. **Título + rating**: `#detailProductName` (ya existe) + `#detailRatingTop` (ya existe, hoy se ve como texto simple) — reestilar para que se vea como el mockup (estrellas grandes + "4.8 · 24 reseñas") y agregar link "Ver todas" que hace scroll a `.detail-resenas-section` (ya existe la sección).
4. **Trust badges**: `#detailTrustBadges` (ya existe, hoy son pills en línea) — cambiar el HTML que genera `abrirDetalleProducto()` en `tm-product.src.js` para armar 3 tarjetas con ícono grande (envío, pago contra entrega siempre; garantía solo si `p.garantia`; devolución solo si `p.devolucion === true`) en vez de pills.
5. **Categoría**: `#detailProductCategory` (ya existe) — reestilar como tag/pill pequeño arriba del precio, estilo mockup.
6. **Precio**: `#detailPriceActual` + `#detailPriceMN` + `#detailPriceOriginal` (ya existen) — agrandar tipografía del precio principal, acomodar el MN debajo en vez de al lado.
7. **Countdown**: contenedor nuevo `#detailCountdown` (oculto por defecto). En `abrirDetalleProducto()`, si `getActiveCountdown()?.productId === p.id`, se llena con `renderCountdownHtml(p.id)` (reusa el HTML/estilo ya usado en las cards — mismo `.countdown-block` con horas:minutos:segundos) y se arranca un `setInterval` propio del modal (limpiado en `cerrarDetalleModal()` para no dejar timers corriendo con el modal cerrado). Si no coincide, el contenedor queda oculto — no se muestra countdown genérico.
8. **Stock**: `#detailProductStock` + `#detailStockBarFill` (ya existen, ya calculan el ancho real de la barra con `stock/20` como tope de referencia) — reestilar la barra a colores tipo mockup (ámbar si stock bajo, verde si stock normal) y la caja de aviso "¡Casi agotado!" cuando `stock <= 3` (ya existe el texto "¡Últimas N unidades!", se envuelve en una caja con el estilo del mockup en vez de texto suelto).
9. **Specs**: `#detailSpecBadges` (ya existe, chips) — se mantienen como chips, se ajusta estilo/grid para que se vea más ordenado tipo ficha técnica.
10. **"Vieron esto"**: `#detailPersonasViendo` (ya existe) — cambio de texto (quitar "últimas 24h", ver arriba) + reestilo como línea pequeña con ícono, estilo mockup.
11. **Selector de cantidad + CTA**: `#detailQtyRow`, `#detailCtaRow`, `#detailBuyBtn`, `#detailFavBtn`, `#detailCartBtn` (todos ya existen) — solo ajuste de estilos para que el botón de WhatsApp sea más grande/protagonista como en el mockup.
12. **Compartir**: pills existentes (`.detail-share-pill`) — se mantienen, ajuste de estilo menor si hace falta para el layout nuevo.
13. **Descripción**: `.detail-description-section` (ya existe) — se puede convertir la primera parte en checklist (✅ por línea) SI la descripción del producto ya viene con saltos de línea tipo lista (a verificar en la implementación; si no, se deja como párrafo, no se inventa estructura que no está en el dato).
14. **Reseñas**: `.detail-resenas-section` (ya existe, funcional) — sin cambios de lógica, solo que el promedio ahora vive arriba (`#detailRatingTop`, punto 3) y acá abajo queda la lista completa como ya está.
15. **Relacionados**: `#detailRelacionados` (ya existe) — sin cambios, cumple el rol del selector de variantes descartado.

## Fuera de alcance (explícitamente)

- Selector de variantes vinculadas.
- Caja "Qué recibirás".
- Auto-carga de specs por IA en el formulario de crear producto (pedido por el usuario, pero es un tema aparte del admin — se planifica después de cerrar este rediseño).
- Cualquier dato "decorativo" no respaldado por un campo real (ventanas de tiempo falsas, contadores inventados, testimonios genéricos).

## Testing

Mismo patrón que el resto de la sesión:
- Playwright: abrir el modal con un producto real (con oferta activa, con countdown activo, con stock bajo, con reseñas) y confirmar que cada sección muestra el dato correcto y no rompe cuando el dato no existe (producto sin reseñas, sin garantía, sin countdown activo, sin descuento).
- Chequeo visual manual en navegador (mobile viewport, ya que es el público real) para validar que el layout se parece al mockup y no hay overflow/solapamientos.
- Suite existente (`python3 -m unittest`, `tests/smoke-web.mjs`) debe seguir pasando sin cambios — no se toca lógica de negocio, solo presentación.
