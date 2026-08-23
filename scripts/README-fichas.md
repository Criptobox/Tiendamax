# Editor de fichas de producto

Herramienta local para completar los 5 bloques de la ficha (specs clave, ficha
técnica, características, ideal para, qué incluye) **con datos reales**.

Vive en `scripts/` a propósito: `pages.yml` excluye esa carpeta del deploy, así
que no se publica en el sitio.

## Uso

```bash
python3 scripts/extraer_ficha.py     # relee productos.json -> ficha-datos.{json,js}
```

Después abrí `scripts/ficha-editor.html` con doble clic (funciona con `file://`,
sin servidor y sin internet).

- Viene **precargado** con lo que ya estaba escrito dentro de `descripcion`.
- Cada dato tiene un botón de **origen** — clic para ciclar:
  `◆ repo` (venía del catálogo) → `◆ internet` (verificado en una fuente) →
  `◆ a mano` (lo cargaste vos). Editar un dato del repo lo pasa a "a mano" solo.
- Filtros: por categoría, **incompletos**, **sin nada**, **specs sin etiqueta**.
- Guarda solo en `localStorage` del navegador mientras trabajás. **Descargá el
  JSON antes de limpiar el navegador o se pierde.**
- El contador `n/5` de cada tarjeta dice cuántos bloques tienen algo.

## Importante

`extraer_ficha.py` **no escribe `productos.json`**. Solo lee. La carga al
catálogo es un paso aparte, después de revisar el JSON exportado.
