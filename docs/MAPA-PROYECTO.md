# 🗺️ Mapa del proyecto TiendaMax

Guía de navegación: **dónde vive cada cosa y qué toco si quiero cambiar X**.
Complementa a `CLAUDE.md` (que explica el *porqué* de las decisiones raras);
este archivo es el *dónde*.

---

## 1. Qué es esto en una frase

Catálogo estático en GitHub Pages (`tiendamax.org`) + Firebase RTDB para lo
dinámico + panel de admin que publica escribiendo archivos al propio repo por
la API de GitHub. **No hay servidor de aplicación en ningún lado.** Los pedidos
salen por `wa.me/...`.

```
┌─────────────┐   GitHub Contents API   ┌──────────────┐  push a main  ┌───────────┐
│ admin.html  │ ──────────────────────▶ │ productos.   │ ────────────▶ │  Actions  │
│ (navegador) │      (PAT en local-     │ json (repo)  │               │ rebuild + │
└─────────────┘       Storage)          └──────────────┘               │  pages.yml│
                                               │                       └─────┬─────┘
                                               ▼                             ▼
                                        productos-lite.json          GitHub Pages (sitio vivo)
                                               │                             │
                                               └────────► index.html ◄───────┘
                                                          /p/*.html
                                                          /c/*.html
                        Firebase RTDB ◄──── fetch anónimo ──────┘
                        (analytics, reseñas, push, precios)
```

---

## 2. Mapa de carpetas

| Ruta | Qué es | ¿Lo edito a mano? |
|---|---|---|
| `index.html` | Storefront: home + catálogo + modal de detalle | ✅ sí |
| `admin.html` | Panel de admin, ~2000 líneas de lógica **inline** | ✅ sí (con cuidado) |
| `productos.json` | **Catálogo maestro** (132 productos) | ⚠️ lo escribe el admin |
| `productos-lite.json` | Copia servida al público | ❌ generado |
| `categorias.json` / `subcategorias.json` | Taxonomía (13 categorías) | ✅ |
| `js/src/*.src.js` | **Fuentes** de los 14 módulos del bundle | ✅ SOLO acá |
| `js/src/*.js` | Minificados de los anteriores | ❌ generado |
| `js/tm-bundle.js` | Concatenación de los minificados | ❌ generado |
| `js/*.js` (raíz) | 20 scripts sueltos, cargados aparte | ✅ sí (son fuente) |
| `css/*.css` | Fuentes CSS | ✅ (menos `bundle.css`) |
| `css/bundle.css` | Concatenación | ❌ generado |
| `p/producto-*.html` | 132 fichas estáticas indexables | ❌ generado |
| `c/*.html` | 13 páginas de categoría | ❌ generado |
| `og/` | 133 tarjetas 1200×630 para WhatsApp/FB | ❌ generado |
| `imagenes/` | 209 fotos `.webp` de producto | ⚠️ las sube el admin |
| `scripts/*.py` | Automatización (crons de Actions) | ✅ |
| `.github/workflows/*.yml` | 29 workflows | ✅ |
| `tests/` | ~375 tests (`test_*.py`) + checks Node (`*.mjs`) | ✅ |
| `bot/` | Bot de Telegram, deploy independiente | ✅ aparte |
| `mini-services/chat-bot/` | Worker de Cloudflare **retirado**, solo referencia | ❌ |
| `firebase-rules.json` | Las únicas reglas "de servidor" que existen | ✅ ⚠️ |

---

## 3. El bundle JS: 14 módulos, el orden **es** la lógica

`scripts/build_js_bundle.py → ORDEN`. El último que define un nombre gana.

| # | Módulo | Líneas | De qué se ocupa |
|---|---|---|---|
| 1 | `tm-iconos` | 481 | emoji → SVG de línea (fuente única de íconos) |
| 2 | `tm-config` | 1378 | globals, constantes, `escapeHtml` (anti-XSS) |
| 3 | `tm-data` | 1127 | carga del catálogo desde GitHub, validación de campos |
| 4 | `tm-state` | 701 | utilidades, navegación entre vistas, render de categorías |
| 5 | `tm-admin` | 760 | auth admin, CRUD de productos |
| 6 | `tm-crm` | 235 | seguimiento post-venta (3/30/90 días) |
| 7 | `tm-product` | 1254 | **render de cards + modal de detalle + ficha técnica** |
| 8 | `tm-catalog` | 835 | copiar a FB/Revolico, gestión de categorías, sync GitHub |
| 9 | `tm-publicar` | 255 | plantillas de texto para posts (localStorage) |
| 10 | `tm-init` | 655 | persuasión/urgencia, inicialización, hero |
| 11 | `tm-ui` | 1307 | fast-categories, subcategorías, "premium pack" |
| 12 | `tm-toast` | 192 | toasts, cursor, fly-to-cart |
| 13 | `tm-iife` | 1024 | carrito abandonado, push, panel de notificaciones |
| 14 | `tm-patches` | 1423 | **monkey-patches: pisa funciones de los 13 anteriores** |

> 🔎 **Si una función no se comporta como dice su definición → mirá `tm-patches` primero.**

**Fuera del bundle** (`STANDALONE`): `tm-bot.src.js` (burbuja de chat) y
`tm-bot-cerebro.src.js` (349 KB fuente / 214 KB minificado — el cerebro del
asistente, se inyecta solo cuando el cliente abre el chat). **No hay LLM**: todo
es JS determinista contra el catálogo vivo.

**Los 20 sueltos de `js/`** se cargan *después* de `tm-bundle.js`, por eso pueden
llamar globals del bundle sin definirlos. Algunos pisan al bundle a propósito
(`push-fix.js` reemplaza el registro FCM entero).

⚠️ `let`/`const` de nivel superior **no** son `window.x`. `productos`,
`categorias` y `wishlist` se leen como bareword con `typeof`, nunca por `window.`.

---

## 4. Pipeline de build (el orden importa)

```bash
scripts/deploy.sh              # hace los 4 pasos de abajo
  ├─ build_css.py              # css/*.css        → css/bundle.css
  ├─ minify_js.py              # js/src/*.src.js  → js/src/*.js      (esbuild)
  ├─ build_js_bundle.py        # js/src/*.js      → js/tm-bundle.js
  └─ bump_versions.py          # reescribe ?v=<hash> en index/admin/404.html
```

**Regla de oro:** editaste un `.src.js` → `minify_js.py` **y después**
`build_js_bundle.py`. El bundle se arma de los *minificados*, no de las fuentes:
saltarse el primer paso envía código viejo sin dar ningún error.

Al pushear a `main`, `build-css.yml` + `minify-js.yml` lo hacen solos y commitean
como `github-actions[bot]`; después `pages.yml` publica. O sea: **no hace falta
buildear a mano para pushear**, sí para verificar local.

---

## 5. La ficha de producto — dónde se dibuja hoy

Este es el circuito que hay que tocar para cambiar **cómo se muestran los datos**:

| Superficie | Archivo | Detalle |
|---|---|---|
| Card del catálogo | `js/src/tm-product.src.js` | grilla de la home |
| **Modal de detalle** | `js/src/tm-product.src.js` **~L604-640** | `#detailSpecBadges` → tabla `Etiqueta \| Valor` |
| Badges de confianza | mismo archivo, ~L645+ | envío / pago / garantía / devolución |
| Página estática `/p/` | `scripts/regenerate_artifacts.py` | HTML indexable, breadcrumbs, JSON-LD |
| Tarjeta OG | `scripts/build_og_images.py` | 1200×630 para WhatsApp/FB |
| Cartel promocional | `js/admin-copilot.js` | 4 plantillas: `clasico`, `pro2`, `horizontal`, `tecno` |
| Cotización PDF | `js/src/tm-bot-cerebro.src.js` → `cotizacionHTML()` | propuesta técnica imprimible |
| Formulario de carga | `admin.html` (inline) + `tm-admin.src.js` | acá se escriben los datos |

**El parser de specs** (en `tm-product.src.js`) acepta dos formas:
- `"Voltaje: 12.8V"` → fila de dos columnas (etiqueta | valor) ✅
- `"12.8V"` → fila sin etiqueta, con ícono ⚠️

Y `js/admin-copilot.js` tiene sus propios extractores (`_tcpTValorCorto`,
`_tcpTSpec`, `_tcpTDato`) **porque `specs` guarda oraciones, no valores**.

---

## 6. Estado real de los datos del catálogo (132 productos)

| Campo | Cobertura | Nota |
|---|---|---|
| `id`, `nombre`, `precioActual`, `imagen`, `categoria`, `subcategoria`, `stock`, `descripcion` | 132/132 | sano |
| `seoTitle` / `seoDescription` | 131/132 | falta 1 |
| `comision` | 125/132 | |
| **`specs`** | **92/132** | **40 productos sin ficha técnica** |
| `precioOriginal` | 104/132 | |
| `imagenes` (galería) | 96/132 | |
| `slug` | 83/132 | 49 sin slug |
| `fechaAgregado` | 49/132 | |

**Productos sin `specs`, por categoría:**
`CARROS 15` · `HOGAR 10` · `MOTOS 8` · `UTILES 2` · y 1 cada uno en
`CELULARES`, `ENERGIA`, `ROPA`, `GYM`, `WIFI`.

**El problema de fondo no es la falta, es la inconsistencia.** Hoy conviven
tres formatos en el mismo campo:

```
A) valor suelto      →  ["12.8V", "100Ah"]                      ← parseable
B) etiqueta: valor   →  ["Voltaje: 12.8V"]                      ← ideal
C) frase de marketing→  ["📡 Diseño de Cobertura Amplia", ...]  ← no es un dato
```

Distribución: 40 productos con 0 specs, 6 con 1, 24 con 2, 48 con 3, 7 con 4, 7 con 5.

`scripts/fill_specs.py` rellena automáticamente **solo el formato A**, con regex
sobre la descripción (`12V`, `2000W`, `128GB`, `IP65`…), tope de 4, e ignora
lubricantes a propósito (el `10W-40` es viscosidad, no una spec).

---

## 7. Firebase RTDB — qué toca el sitio público

`firebase-rules.json` es lo único que se hace cumplir del lado servidor.

- **Escrituras públicas** se protegen con *knowledge proof*: el cliente manda
  `proof` y la regla lo compara contra `root.child('admin_auth/hash')`.
- **Lecturas no pueden filtrar por contenido** — un GET no manda nada. Cerrar
  una lectura = el sitio deja de leer esa ruta, no lee menos.
- Rutas privadas fijan el uid del dueño: `auth.uid === root.child('admin_uid').val()`.
- Cerrar una ruta sin firmar las llamadas del panel = el admin ve ceros. Hay
  **5 helpers de firma** que hay que actualizar juntos: `TMAuth.fetchPrivado`
  (`js/auth.js`), `jget` (`admin.html`), `_fbAuthQS` (`tm-ui.src.js`),
  `_tmFirmar` (`analytics.js`), `_firma`/`_PRIVADAS` (`admin-copilot.js`).
- Las reglas cascadean como permisos de directorio: un `.read: true` en el padre
  **no** se revoca con un `.read: false` en el hijo.
- `firebase-admin` (Python) usa service account y **se saltea todas las reglas**.

---

## 8. Automatización: 29 workflows

Los que más importan:

| Workflow | Script | Qué hace |
|---|---|---|
| `pages.yml` | — | publica el sitio |
| `build-css.yml` / `minify-js.yml` | build_* | rebuild + commit (grupo `repo-autobuild`) |
| `regenerate-artifacts.yml` | `regenerate_artifacts.py` | 132 `/p/`, 13 `/c/`, sitemap, footer de categorías |
| `send-push-notifications.yml` | `send_notifications.py` | cola de push, diff contra snapshot en RTDB |
| `precio-radar.yml` | `precio_radar.py` | scrapea Revolico/Porlalivre/lelespc |
| `revertir-ofertas.yml` | `revertir_ofertas.py` | expira descuentos temporizados |
| `update-eltoque-rate.yml` | `update_rate_from_eltoque.py` | tasa USD→CUP |
| `nightly-agent` / `admin-alerts` / `web-health-agent` | varios | salud y alertas → Telegram + Copiloto |
| `run-tests.yml` | `unittest discover` | lo que corre CI de verdad |

⚠️ Actions solo serializa **dentro** de un `concurrency.group`. Dos workflows de
grupos distintos escribiendo el mismo nodo RTDB **sí** se pisan.

---

## 9. Tests que existen porque el bug era *silencioso*

No los "simplifiques":

- `test_imagen_en_uso.py` — una vez borró la única foto de un producto.
- `test_enlazado_interno.py` — páginas huérfanas: renderizan bien, rankean mal.
- `test_alcance.py` — 23 funciones se mantenían "referenciadas" entre ellas mientras
  la única puerta de entrada renderizaba en un contenedor inexistente.
- `test_ids_fantasma.py` — `getElementById('x').algo` sin `#x`: trunca la función sin error.
- `test_cola_vigente.py` — el push queda congelado en la bandeja; el texto tiene que ser
  cierto **al enviar**.
- `test_build_completeness.py` — archivo nuevo no listado en `ORDEN` = nunca se envía.
- `test_llamadas_vs_reglas.py` — cruza cada fetch del navegador con su regla RTDB.

```bash
python -m unittest discover -s tests -v   # lo que corre CI
node tests/smoke-web.mjs                  # smoke Playwright del sitio vivo
```

---

## 10. "Quiero cambiar X" → tocá esto

| Quiero… | Archivo(s) |
|---|---|
| Cambiar cómo se ve la **ficha técnica** | `js/src/tm-product.src.js` (~L604) + `css/modal-v4.css` |
| Cambiar la **card** del catálogo | `js/src/tm-product.src.js` + `css/rediseno-cards.css` |
| Agregar/renombrar un **campo de producto** | `admin.html` (form) → `tm-admin.src.js` → `tm-product.src.js` → `regenerate_artifacts.py` |
| Cambiar la **página `/p/`** | `scripts/regenerate_artifacts.py` |
| Cambiar un **cartel** | `js/admin-copilot.js` + selector en `admin.html` |
| Agregar un **archivo CSS/JS nuevo** | agregarlo al `ORDEN` correspondiente o **nunca se envía** |
| Tocar **permisos de Firebase** | `firebase-rules.json` + los 5 helpers de firma + `test_auth.py` |
| Cambiar respuestas del **bot** | `js/src/tm-bot-cerebro.src.js` (no hay backend, no hay LLM) |
| Rellenar **specs** faltantes | `scripts/fill_specs.py` |

---

*Generado como referencia de navegación. Si algo acá contradice a `CLAUDE.md`,
gana `CLAUDE.md`.*
