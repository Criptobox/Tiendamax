# Fichas de producto — herramientas

Tres archivos, todos en `scripts/` a propósito: `pages.yml` excluye esa carpeta
del deploy, así que nada de esto se publica en el sitio.

| Archivo | Para qué |
|---|---|
| `ficha-probador.html` | **Empezá acá.** Pegás la ficha y la ves renderizada al instante. Usa el `bundle.css` real del repo. |
| `ficha-probador-web.html` | La misma herramienta pero **autocontenida** (sin depender del repo), para publicarla como página. |
| `ficha-editor.html` | Cargar los 132 productos uno por uno, precargado desde el catálogo. |
| `ficha-preview.html` | Comparación fija antes/después del Tataliken. |

## `ficha-probador.html` — probar una ficha

Doble clic y listo (funciona con `file://`, sin servidor ni internet).

- **Pegar texto**: pegás la ficha en el formato que ya usás (encabezados
  `Especificaciones Clave`, `Ficha Técnica`, `Características`, `Ideal Para`,
  `Incluye la caja`, con o sin emoji) y se parsea sola mientras escribís.
- **Formulario**: los mismos datos campo por campo, si preferís tipear.
- Lo que va **entre paréntesis al final de un valor** se guarda como *nota*
  aparte — `4000W (para arranques)` → valor `4000W` + nota. Así el valor sigue
  siendo comparable entre productos.
- **Copiar JSON** te da el fragmento listo para pegar en `productos.json`.

### Sobre el chip de las specs clave

`modal-v4.css` iguala `.dsr-label` y `.dsr-value` con `!important` (mismo color
`#ffd1b3`, mismo tamaño 13.5px, mismo peso 700). Sin separador el chip se lee
`Potencia 4000W Pico / 2000W Continuos` de corrido, sin distinguir el nombre del
dato. Los dos probadores agregan un `·` con un `::after` — no toca
`modal-v4.css`, que por convención gana todo.

Ojo: el contenedor tiene que llevar `id="detailSpecBadges"`, no solo la clase.
Sin el `id` las reglas de `modal-v4.css` no aplican y la vista previa miente.

---

# Editor de fichas de producto (los 132)

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
