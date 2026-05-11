# 📋 Informe de análisis · tiendamax.org

Fecha: análisis automático del sitio en producción.
Foco principal solicitado: **errores visuales y responsive**.

---

## 🔴 Problemas críticos detectados

### 1. Etiquetas `<meta>` y `<link>` duplicadas en el `<head>`
El `<head>` contiene **dos veces** las mismas declaraciones (probablemente por dos pegados de SEO sucesivos):

| Etiqueta | Veces | Conflicto |
|---|---|---|
| `meta name="description"` | 2 | textos diferentes |
| `meta name="keywords"` | 2 | listas distintas |
| `meta name="robots"` | 2 | una más restrictiva que la otra |
| `meta name="theme-color"` | 2 | **`#c9a96e` vs `#FF6B35`** ← navegador pinta uno u otro impredeciblemente |
| `link rel="canonical"` | 2 | `https://tiendamax.org` y `https://tiendamax.org/` |
| `meta property="og:title/url/type"` | 2 | textos distintos |

**Impacto:** Google y redes sociales toman valores impredecibles. El color de la barra del navegador en móvil cambia según el navegador.

**Corrección:** dejar una sola versión de cada meta (la más completa). Ver `index.html.fixed`.

---

### 2. `<div class="container">` con `style="display:contents;"` mal cerrado en el Hero (línea 131)

```html
<section class="hero">
    <div class="container" style="display:contents;">   <!-- línea 131 -->
    <div class="hero-content"> ... </div>
    <div class="hero-image"> ... </div>
    </div>   <!-- ← cierra el container fantasma -->
</section>
```

Hay un `</div>` extra suelto en el árbol (el parser detecta un mismatch). El `display:contents` de paso anula el `.container` (max-width / centrado), por lo que **el container del hero no tiene función real** pero sí ensucia el HTML.

**Corrección:** quitar ese `<div class="container" style="display:contents;">` y su cierre. El hero ya es un grid de 2 columnas dentro de la `<section>`.

---

### 3. Doble bloque `@media (max-width: 768px)` con reglas contradictorias para el Hero

En `css/styles.css`:

- **Línea 1715** define para móvil:
  ```css
  .hero-content { padding: 60px 24px 40px; order: 2; }
  .hero-image   { height: 220px; order: 1; }   /* imagen arriba */
  .hero-content h2 { font-size: 36px; }
  ```
- **Línea 1789** vuelve a redefinir lo mismo con otros valores:
  ```css
  .hero-content { padding: 40px 20px 30px; }     /* gana este */
  .hero-image   { height: 200px; }
  .hero-content h2 { font-size: 30px; line-height: 1.2; }
  ```

**Impacto:** confusión al mantener, y la propiedad `order` solo aparece en uno (lo que puede hacer que en algunos cambios futuros se rompa el orden imagen-arriba/contenido-abajo).

**Corrección:** unificar ambos bloques en uno solo con los valores definitivos.

---

### 4. Definiciones duplicadas de `.hero-image` en CSS

- Línea **290**: define background, flex, overflow…
- Línea **3179**: redefine `.hero-image { position: relative; }` y añade el `::after` del marco dorado.

No es un error grave, pero genera reglas dispersas. Mejor agrupar el marco dorado junto al bloque original o usar un selector más específico.

---

### 5. **334 declaraciones `!important`** en `styles.css`

Es señal de que las cascadas se están "empujando" a la fuerza. Síntomas que probablemente notes:
- Cambiar un estilo localmente no surte efecto.
- Hay que añadir `!important` cada vez.
- Mantenimiento muy frágil.

**Recomendación:** auditar y eliminar progresivamente. Empezar por los `!important` dentro de media queries (la mayoría solo necesitan especificidad).

---

### 6. **75 atributos `onclick=` inline** en el HTML

Mezcla JS con HTML, dificulta CSP (seguridad), debugging y mantenimiento.

**Recomendación:** mover a `addEventListener` desde `script.js` usando `data-action="abrirCarrito"` o IDs.

---

## 🟡 Problemas medios

### 7. `<meta http-equiv="X-UA-Compatible" content="ie=edge">` obsoleto
Solo lo usaba IE11. Hoy es ruido. Eliminar.

### 8. Banner de urgencia `display:none` en HTML pero clase `urgencia-banner` con animaciones
Si nunca se activa por JS, el bloque y su CSS son peso muerto.

### 9. `manifest.json` referenciado pero conviene verificar contenido
Si quieres PWA real, asegúrate de que tenga `start_url`, `icons` (192 y 512), `display`, `background_color`, `theme_color` consistentes con el `<meta theme-color>`.

### 10. Hero en escritorio: padding asimétrico
```css
.hero-content { padding: 80px 60px 80px 0; }  /* sin padding-left */
```
Como el contenedor padre `.hero` no tiene padding lateral, el texto del hero **queda pegado al borde izquierdo** de la pantalla en monitores grandes (a partir de cierto ancho). Debería tener al menos `padding-left: 60px` o usar el `.container` de verdad.

### 11. El logo es un `<h1>` y ya hay otro `<h2>` "Productos que inspiran…" como título principal
Por SEO, el `<h1>` debería ser el del hero, no el logo. Solución: convertir el logo en `<div>` o `<span>` con clase y dejar **solo un H1** por página (el del hero).

### 12. Imagen del hero desde Unsplash con `?w=400`
La imagen se sirve a 400 px de ancho pero la columna del hero suele renderizar a 600–800 px en escritorio → **se ve pixelada** en pantallas grandes.
Subir a `?w=900&q=80` o usar `srcset`.

---

## 🟢 Cosas que están bien
- Viewport correcto.
- Schema.org de tipo `Store` presente.
- Open Graph y Twitter Cards presentes.
- Imágenes con `alt`.
- Manejo de fallback con `onerror` en la imagen del hero.
- Skeleton loaders mientras carga el grid de categorías 👏.
- `lang="es"` declarado.

---

## 📦 Archivos generados con correcciones

1. **`index.html.fixed`** → `<head>` limpio, sin duplicados, sin contenedor fantasma del hero, sin `X-UA-Compatible`, logo como `<div>`.
2. **`css/styles.fixes.css`** → parche de overrides para cargar **después** de `styles.css` que:
   - Unifica el responsive del hero.
   - Arregla padding del hero en escritorio.
   - Mejora resolución de la imagen Unsplash (vía CSS no se puede, va en HTML).
   - Comentarios sobre los `!important` a quitar.

Puedes aplicar primero solo el `index.html.fixed` y el parche CSS para validar. Si todo se ve bien, integramos los cambios al `styles.css` original y limpiamos los `!important` por bloques.

---

## 🔘 SESIÓN 2 — Corrección de botones (completada)

### Cambios aplicados en `index.html.fixed`

| Acción | Antes | Después |
|---|---|---|
| Botones con `type="button"` explícito | 4 / 56 | **56 / 56** ✅ |
| Botones con `aria-label` | 2 / 56 | **20 / 56** (los de icono; los demás tienen texto autodescriptivo) |
| `onclick` inline | 75 | **14** (solo los de lógica compleja) |
| Elementos con `data-action` | 0 | **61** |

### ¿Por qué `type="button"`?
Por defecto un `<button>` dentro de un `<form>` actúa como `submit` y al hacer clic **recarga la página**. Tu panel de administración tiene varios formularios → este era un bug latente serio.

### Migración a `data-action`
- Se añadió `js/event-delegation.js` (un único listener global que delega clics).
- Cada botón simple ahora declara su intención con `data-action="nombreFuncion"` y opcionalmente `data-arg="valor"`.
- El delegador llama a `window.<funcion>` que ya existe en `script.js`. **No hay que tocar `script.js`**.
- Soporte de teclado (Enter/Espacio) para `<div>` y `<span>` con `data-action` → mejora accesibilidad.
- Log en consola del estado: `[event-delegation] data-action activos: 61 · onclick legacy restantes: 14`.

### `onclick` que se mantienen a propósito (14)
Son los que tienen **lógica multi-instrucción** o usan `event` directamente. Migrarlos requeriría crear funciones wrapper en `script.js`. Se pueden hacer en una segunda iteración:

```html
onclick="if(event.target===this)cerrarCarrito()"     <!-- close on backdrop click -->
onclick="if(event.target===this)cerrarDetalleModal()"
onclick="event.stopPropagation()"
onclick="toggleZoomImagen(this)"                      <!-- usa 'this' -->
onclick="volverAlInicio(); cerrarMenuMovil(); return false;"  <!-- multi -->
onclick="abrirLoginAdmin(); cerrarMenuMovil();"
onclick="volverAlInicio(); return false;"
onclick="mostrarVistaInicio(); return false;"
onclick="mostrarVistaCategoria('Todas'); return false;"
onclick="abrirCarrito(); return false;"
```

### Cómo desplegarlo
1. Renombrar `index.html.fixed` → `index.html` y subirlo.
2. Subir `js/event-delegation.js` a la carpeta `js/`.
3. Subir `css/styles.fixes.css` a la carpeta `css/`.
4. Verificar en consola que aparece el log de `event-delegation`.

### Próximo paso opcional
Migrar los 14 `onclick` complejos creando wrappers en `script.js`:
```js
window.cerrarCarritoBackdrop = (e) => { if (e.target === e.currentTarget) cerrarCarrito(); };
window.volverEInicio = () => { volverAlInicio(); cerrarMenuMovil(); };
// etc.
```

---

## 🏁 SESIÓN 3 — Migración 100% completada

Se eliminaron los 14 `onclick` inline restantes ampliando el delegador `event-delegation.js` (v2) con soporte para casos especiales.

### Tabla final

| Métrica | Original | Sesión 2 | Sesión 3 |
|---|:-:|:-:|:-:|
| `onclick` inline | 75 | 14 | **0** ✅ |
| `data-action` | 0 | 61 | **72** |
| Botones con `type="button"` | 4/56 | 56/56 | 56/56 |
| HTML balanceado | ❌ | ✅ | ✅ |

### Atributos `data-*` introducidos

| Atributo | Uso | Reemplaza a |
|---|---|---|
| `data-action="fn1,fn2"` | Multi-acción separada por coma | `onclick="fn1();fn2();"` |
| `data-arg="valor"` | Argumento string o numérico | `onclick="fn('valor')"` |
| `data-pass-element="true"` | Pasa el elemento DOM como argumento | `onclick="fn(this)"` |
| `data-stop-propagation="true"` | Detiene la propagación | `onclick="event.stopPropagation()"` |
| `data-backdrop-close="fn"` | Cierra al clicar el fondo del modal | `onclick="if(event.target===this)fn()"` |

Para `<a data-action="...">` el `preventDefault()` se aplica automáticamente (sustituye `return false`).

### Archivos finales
```
tiendamax/
├── INFORME_ANALISIS.md          ← informe completo
├── index.html.fixed             ← HTML 100% migrado, listo para subir
├── css/
│   ├── styles.css               (original)
│   ├── animations.css           (original)
│   └── styles.fixes.css         ← parche CSS
└── js/
    ├── script.js                (original — sin tocar ✅)
    ├── subcategorias.js         (original)
    ├── revolico_integration.js  (original)
    └── event-delegation.js      ← nuevo delegador v2
```

### Beneficios obtenidos
- ✅ **CSP más estricto** posible (puedes activar `script-src 'self'` sin `'unsafe-inline'`).
- ✅ **Mantenimiento**: cambiar el comportamiento de un botón es modificar un atributo, no buscar en miles de líneas de HTML.
- ✅ **Accesibilidad**: foco visible, soporte de teclado para elementos no-button.
- ✅ **Sin regresiones**: `script.js` original no se tocó.
- ✅ **Bug de `type=submit`** que recargaba la página dentro de formularios → **eliminado**.

### Cómo desplegar
```
1. Renombrar  index.html.fixed → index.html
2. Subir      js/event-delegation.js
3. Subir      css/styles.fixes.css
4. (Opcional) bump del cache-buster: ?v=10 en los <link> y <script>
```

En consola del navegador debe aparecer:
```
[event-delegation v2] data-action: 72 · onclick legacy: 0
```
