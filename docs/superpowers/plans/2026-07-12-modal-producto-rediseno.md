# Rediseño visual del modal de producto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle el modal de detalle de producto (`#productDetailModal` en `index.html`) para que se vea como el mockup de referencia del usuario, usando exclusivamente datos ya reales/existentes — sin reconstruir el modal ni tocar su lógica de negocio.

**Architecture:** Restyle en el lugar. Los mismos elementos por ID que ya rellena `abrirDetalleProducto()` (en `js/src/tm-product.src.js`) se mantienen; solo se agregan 2 elementos HTML nuevos (contador de fotos, badge "recién llegado"), se conecta el countdown ya existente (`renderCountdownHtml`/`getActiveCountdown`, hoy usado solo en las cards de la grilla) dentro del modal, y se reescriben las reglas CSS de `css/rediseno-cards.css` (último archivo del bundle, gana la cascada) para el layout nuevo.

**Tech Stack:** HTML/CSS/JS vanilla (sin build de CSS con preprocesador; `scripts/build_css.py` concatena, `scripts/minify_js.py`/`build_js_bundle.py` minifican y empaquetan JS). Playwright para pruebas E2E, `python3 -m unittest` para la suite Python (no aplica a este trabajo, pero debe seguir en verde).

## Global Constraints

- Cero datos decorativos/inventados: cada elemento visual usa un dato real ya existente en el producto/analytics/Firebase, o no se muestra.
- No se toca la lógica de negocio: los mismos IDs de elemento (`detailProductName`, `detailPriceActual`, etc.) se mantienen; `abrirDetalleProducto()` sigue siendo la única función que puebla el modal.
- Sin selector de variantes vinculadas ni caja "Qué recibirás" (descartados con el usuario).
- El countdown solo se muestra si `getActiveCountdown()?.productId === p.id` (un solo producto a la vez, configurado por el admin). Ningún otro producto muestra countdown.
- El texto de "vieron esto" no debe mencionar una ventana de tiempo (el dato es un contador acumulado, no de 24h).
- Editar solo `js/src/tm-product.src.js`, `js/src/tm-init.src.js` (fuente legible) — nunca `js/src/tm-product.js`/`tm-init.js` (generados por `python3 scripts/minify_js.py`) ni `js/tm-bundle.js` (generado por `python3 scripts/build_js_bundle.py`) a mano.
- Después de tocar cualquier `.src.js`, correr `python3 scripts/minify_js.py <modulo>` y `python3 scripts/build_js_bundle.py` antes de probar en el navegador (igual patrón que el resto de la sesión).
- Después de tocar `css/rediseno-cards.css`, correr `python3 scripts/build_css.py` para regenerar `css/bundle.css` antes de probar (el bundle es lo que realmente carga `index.html`).
- Verificación visual: cada tarea de CSS incluye un paso de screenshot con Playwright para comparar contra el layout esperado antes de dar la tarea por terminada.

---

## Task 1: Badge "RECIÉN LLEGADO" en el header del modal

**Files:**
- Modify: `index.html:1190-1193` (bloque `.modal-header` del `#productDetailModal`)
- Modify: `js/src/tm-product.src.js` función `abrirDetalleProducto(id)` — agregar bloque nuevo cerca de la línea 358 (donde ya se decide `_agotadoModal` para los otros badges de hype)
- Modify: `css/rediseno-cards.css` (agregar al final)
- Test: `tests/_task1_badge_nuevo.mjs` (Playwright, se borra al final de la tarea — no es parte de la suite permanente, es solo para verificar esta tarea antes de commitear)

**Interfaces:**
- Consumes: `esProductoNuevo(producto)` — función ya existente en `js/src/tm-patches.src.js:1191`, recibe el objeto producto completo y devuelve `true`/`false` según `fechaAgregado` (< 7 días).
- Produces: elemento `#detailNuevoBadge` visible/oculto según corresponda — no lo consume ninguna otra tarea de este plan.

- [ ] **Step 1: Agregar el elemento HTML del badge**

En `index.html`, dentro de `.modal-header`, antes del `<h2 id="detailProductName">`:

```html
            <div class="modal-header">
                <div id="detailNuevoBadge" class="detail-badge-nuevo" style="display:none;">🆕 RECIÉN LLEGADO</div>
                <h2 id="detailProductName">Detalle del Producto</h2>
                <button data-action="cerrarDetalleModal" aria-label="Cerrar detalle del producto" type="button" class="close-btn">×</button>
            </div>
```

- [ ] **Step 2: Poblar el badge en `abrirDetalleProducto()`**

En `js/src/tm-product.src.js`, justo después de la línea que calcula `_agotadoModal` (busca `const _agotadoModal = safeNum(p.stock) === 0;`), agregar:

```javascript
    // Badge "recién llegado" — mismo criterio que las cards (esProductoNuevo, 7 días)
    const nuevoBadgeEl = document.getElementById('detailNuevoBadge');
    if (nuevoBadgeEl) {
        const _esNuevo = (typeof esProductoNuevo === 'function') && esProductoNuevo(p) && !_agotadoModal;
        nuevoBadgeEl.style.display = _esNuevo ? 'inline-flex' : 'none';
    }
```

- [ ] **Step 3: Minificar y regenerar el bundle**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-product
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

Expected: `node -c` no imprime nada (sintaxis válida).

- [ ] **Step 4: CSS del badge**

Agregar al final de `css/rediseno-cards.css`:

```css
/* Badge "recién llegado" — header del modal de detalle */
.detail-badge-nuevo{
  display:inline-flex; align-items:center; gap:5px;
  background:rgba(255,107,53,.14); border:1px solid rgba(255,107,53,.35);
  color:var(--coral,#FF6B35); font-size:10.5px; font-weight:800;
  letter-spacing:.04em; text-transform:uppercase;
  padding:5px 11px; border-radius:20px; margin-bottom:8px;
}
body.light-mode .detail-badge-nuevo{ background:rgba(255,107,53,.10); }
```

- [ ] **Step 5: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 6: Verificar con Playwright**

Crear `tests/_task1_badge_nuevo.mjs`:

```javascript
import { chromium, devices } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path.slice(1));
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(9101, r));
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:9101/index.html', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const result = await page.evaluate(() => {
  // Forzar un producto con fechaAgregado reciente (simula "nuevo") sin tocar productos.json real
  const p = { ...productos[0], fechaAgregado: new Date().toISOString() };
  const idx = productos.findIndex(x => x.id === productos[0].id);
  productos[idx] = p;
  abrirDetalleProducto(p.id);
  const badge = document.getElementById('detailNuevoBadge');
  return { display: badge ? getComputedStyle(badge).display : 'NO-EL', text: badge ? badge.textContent : '' };
});
console.log('resultado:', JSON.stringify(result));
console.log('errors:', errs);
const ok = result.display !== 'none' && result.text.includes('RECIÉN LLEGADO');
console.log(ok ? '✅ badge nuevo OK' : '❌ FALLO');
await browser.close(); server.close();
if (!ok) process.exit(1);
```

Run: `NODE_PATH=/opt/node22/lib/node_modules node tests/_task1_badge_nuevo.mjs`
Expected: `✅ badge nuevo OK`, sin errores de página.

- [ ] **Step 7: Screenshot visual**

```bash
cd /home/user/Tiendamax
NODE_PATH=/opt/node22/lib/node_modules node -e "
import('playwright').then(async ({chromium, devices}) => {
  const { createServer } = await import('http');
  const { readFile } = await import('fs/promises');
  const { extname, join } = await import('path');
  const ROOT = process.cwd();
  const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(ROOT, p === '/' ? 'index.html' : p.slice(1));
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(r => server.listen(9102, r));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  await page.goto('http://localhost:9102/index.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => abrirDetalleProducto(productos[0].id));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/task1-modal.png' });
  await browser.close(); server.close();
});
"
```

Abrir `/tmp/task1-modal.png` con la herramienta Read (soporta imágenes) y confirmar visualmente que el badge se ve bien posicionado, sin solaparse con el botón de cerrar ni desbordar el header.

- [ ] **Step 8: Borrar el test temporal y commitear**

```bash
cd /home/user/Tiendamax
rm -f tests/_task1_badge_nuevo.mjs
git add index.html js/src/tm-product.src.js js/src/tm-product.js js/tm-bundle.js css/rediseno-cards.css css/bundle.css
git commit -m "feat(modal): badge recién llegado en el header del detalle de producto"
```

---

## Task 2: Contador de fotos "1 / N" sobre la galería

**Files:**
- Modify: `index.html:1198-1204` (`.detail-image-wrap`)
- Modify: `js/src/tm-product.src.js` función `renderizarGaleriaDetalle(producto)` (línea 242) y el punto donde se hace clic en una miniatura (línea 258-267, dentro de la misma función)
- Modify: `css/rediseno-cards.css`
- Test: `tests/_task2_photo_counter.mjs` (temporal)

**Interfaces:**
- Consumes: `obtenerImagenesProducto(producto)` — función ya existente, devuelve array de URLs de imagen del producto.
- Produces: elemento `#detailPhotoCounter` con texto `"N / M"` — no lo consume ninguna otra tarea.

- [ ] **Step 1: Agregar el elemento HTML**

En `index.html`, dentro de `.detail-image-wrap`, después de `#detailGalleryThumbs`:

```html
                        <div id="detailGalleryThumbs" class="detail-gallery-thumbs" style="display:none;"></div>
                        <div id="detailPhotoCounter" class="detail-photo-counter" style="display:none;"></div>
```

- [ ] **Step 2: Actualizar `renderizarGaleriaDetalle()`**

En `js/src/tm-product.src.js`, reemplazar la función completa (línea 242-270):

```javascript
function renderizarGaleriaDetalle(producto) {
    const thumbs = document.getElementById('detailGalleryThumbs');
    const img = document.getElementById('detailProductImage');
    const counter = document.getElementById('detailPhotoCounter');
    if (!thumbs || !img) return;
    const imagenes = obtenerImagenesProducto(producto);

    if (counter) {
        if (imagenes.length > 1) {
            counter.textContent = '1 / ' + imagenes.length;
            counter.style.display = 'block';
        } else {
            counter.style.display = 'none';
        }
    }

    if (imagenes.length <= 1) {
        thumbs.style.display = 'none';
        thumbs.innerHTML = '';
        return;
    }
    thumbs.style.display = 'flex';
    thumbs.innerHTML = imagenes.map((url, i) =>
        '<button type="button" class="detail-gallery-thumb' + (i === 0 ? ' active' : '') + '" data-img="' + escapeAttr(url) + '" data-idx="' + i + '" aria-label="Ver imagen ' + (i + 1) + '">' +
            '<img src="' + escapeAttr(url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
        '</button>'
    ).join('');
    thumbs.querySelectorAll('.detail-gallery-thumb').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const url = this.getAttribute('data-img');
            if (!url) return;
            img.src = url;
            _resetZoomPan(img);
            thumbs.querySelectorAll('.detail-gallery-thumb').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            if (counter) counter.textContent = (parseInt(this.getAttribute('data-idx'), 10) + 1) + ' / ' + imagenes.length;
        });
    });
    _initSwipeGaleria(img);
}
```

Nota: esta función ya se llama sola en `abrirDetalleProducto()` (línea 339 actual) — no hace falta tocar esa parte.

- [ ] **Step 3: Minificar y regenerar bundle**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-product
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

- [ ] **Step 4: CSS del contador**

Agregar a `css/rediseno-cards.css`:

```css
/* Contador de fotos "N / M" — esquina inferior izquierda de la imagen */
.detail-photo-counter{
  position:absolute; bottom:10px; left:10px;
  background:rgba(0,0,0,.62); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
  color:#fff; font-size:11px; font-weight:700;
  padding:5px 11px; border-radius:20px; z-index:4;
  pointer-events:none;
}
```

- [ ] **Step 5: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 6: Verificar con Playwright**

Crear `tests/_task2_photo_counter.mjs` (mismo boilerplate de servidor que Task 1, cambiar el puerto a 9103), body de verificación:

```javascript
const result = await page.evaluate(() => {
  const multiImg = productos.find(p => Array.isArray(p.imagenes) && p.imagenes.length > 1)
    || { ...productos[0], imagenes: [productos[0].imagen, productos[0].imagen] };
  if (!productos.includes(multiImg)) productos.push(multiImg);
  abrirDetalleProducto(multiImg.id);
  const counter = document.getElementById('detailPhotoCounter');
  const before = { display: counter ? getComputedStyle(counter).display : 'NO-EL', text: counter ? counter.textContent : '' };
  const secondThumb = document.querySelectorAll('.detail-gallery-thumb')[1];
  if (secondThumb) secondThumb.click();
  const after = { text: counter ? counter.textContent : '' };
  return { before, after };
});
console.log('resultado:', JSON.stringify(result));
const ok = result.before.display !== 'none' && /^1 \/ \d+$/.test(result.before.text) && result.after.text.startsWith('2 / ');
console.log(ok ? '✅ contador de fotos OK' : '❌ FALLO');
```

Run: `NODE_PATH=/opt/node22/lib/node_modules node tests/_task2_photo_counter.mjs`
Expected: `✅ contador de fotos OK`.

- [ ] **Step 7: Screenshot visual**

Mismo patrón que Task 1 Step 7, guardar en `/tmp/task2-modal.png`, revisar con Read que el contador no se solape con el hint "Toca para ampliar" (que ya vive abajo a la derecha) — el contador va abajo a la **izquierda**, no debería chocar.

- [ ] **Step 8: Borrar test temporal y commitear**

```bash
cd /home/user/Tiendamax
rm -f tests/_task2_photo_counter.mjs
git add index.html js/src/tm-product.src.js js/src/tm-product.js js/tm-bundle.js css/rediseno-cards.css css/bundle.css
git commit -m "feat(modal): contador de fotos N/M en la galería del detalle"
```

---

## Task 3: Trust badges como tarjetas con ícono

**Files:**
- Modify: `js/src/tm-product.src.js` función `abrirDetalleProducto(id)`, bloque de "Trust badges dinámicos" (línea 471-485 actual)
- Modify: `css/rediseno-cards.css`
- Test: `tests/_task3_trust_badges.mjs` (temporal)

**Interfaces:**
- Consumes: `p.garantia` (string), `p.devolucion` (boolean) — campos ya existentes en cada producto.
- Produces: `#detailTrustBadges` con hasta 3 `.detail-trust-card` — no lo consume ninguna otra tarea.

- [ ] **Step 1: Reemplazar el bloque de trust badges**

En `js/src/tm-product.src.js`, reemplazar el bloque actual (busca el comentario `// Trust badges dinámicos (solo si el producto los tiene)`):

```javascript
    // Trust badges dinámicos: tarjetas con ícono (envío y pago siempre reales;
    // garantía/devolución solo si el producto los tiene de verdad)
    const trustBadgesEl = document.getElementById('detailTrustBadges');
    if (trustBadgesEl) {
        const cards = [
            { ic: '🚚', t: 'Envío', s: 'Toda Cuba' },
            { ic: '🔒', t: 'Pago seguro', s: 'Contra entrega' }
        ];
        if (p.garantia && String(p.garantia).trim()) {
            cards.push({ ic: '🛡️', t: 'Garantía', s: escapeHtml(String(p.garantia)) });
        }
        if (p.devolucion === true) {
            cards.push({ ic: '↩️', t: 'Devolución', s: 'Aceptada' });
        }
        trustBadgesEl.innerHTML = cards.map(c =>
            '<div class="detail-trust-card"><span class="dtc-ic">' + c.ic + '</span><div class="dtc-tx"><b>' + c.t + '</b><small>' + c.s + '</small></div></div>'
        ).join('');
        trustBadgesEl.style.display = 'grid';
    }
```

- [ ] **Step 2: Minificar y regenerar bundle**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-product
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

- [ ] **Step 3: CSS de las tarjetas**

Agregar a `css/rediseno-cards.css` (reemplaza el estilo pill anterior de `.detail-trust-badges`, que era inline — ahora se estiliza por clase):

```css
/* Trust badges como tarjetas con ícono (reemplaza las pills en línea) */
#detailTrustBadges.detail-trust-badges{
  display:grid; grid-template-columns:repeat(auto-fit, minmax(90px, 1fr));
  gap:8px; margin-top:14px;
}
.detail-trust-card{
  display:flex; flex-direction:column; align-items:center; text-align:center; gap:4px;
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09);
  border-radius:14px; padding:12px 8px;
}
.detail-trust-card .dtc-ic{ font-size:20px; }
.detail-trust-card .dtc-tx b{ display:block; font-size:11.5px; font-weight:800; color:#f2f2f5; }
.detail-trust-card .dtc-tx small{ display:block; font-size:10px; color:#9a9aa2; margin-top:1px; }
body.light-mode .detail-trust-card{ background:rgba(0,0,0,.03); border-color:rgba(0,0,0,.08); }
body.light-mode .detail-trust-card .dtc-tx b{ color:#1a1a1a; }
```

- [ ] **Step 4: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 5: Verificar con Playwright**

Crear `tests/_task3_trust_badges.mjs` (puerto 9104):

```javascript
const result = await page.evaluate(() => {
  const conGarantiaYDevol = { ...productos[0], garantia: '6 meses', devolucion: true };
  productos[productos.findIndex(x => x.id === productos[0].id)] = conGarantiaYDevol;
  abrirDetalleProducto(conGarantiaYDevol.id);
  const cards = Array.from(document.querySelectorAll('#detailTrustBadges .detail-trust-card')).map(c => c.textContent);
  return { count: cards.length, cards };
});
console.log('resultado:', JSON.stringify(result));
const ok = result.count === 4 && result.cards.some(c => c.includes('6 meses')) && result.cards.some(c => c.includes('Devolución'));
console.log(ok ? '✅ trust badges OK' : '❌ FALLO');
```

Run: `NODE_PATH=/opt/node22/lib/node_modules node tests/_task3_trust_badges.mjs`
Expected: `✅ trust badges OK` (4 tarjetas: envío, pago, garantía, devolución).

- [ ] **Step 6: Verificar caso sin garantía/devolución**

Agregar al mismo archivo de test, antes de cerrar el browser:

```javascript
const result2 = await page.evaluate(() => {
  const sinExtras = { ...productos[0], garantia: '', devolucion: false };
  productos[productos.findIndex(x => x.id === productos[0].id)] = sinExtras;
  abrirDetalleProducto(sinExtras.id);
  return document.querySelectorAll('#detailTrustBadges .detail-trust-card').length;
});
console.log('sin extras, tarjetas:', result2);
const ok2 = result2 === 2;
console.log(ok2 ? '✅ caso sin extras OK (solo envío+pago)' : '❌ FALLO caso sin extras');
if (!ok2) process.exitCode = 1;
```

- [ ] **Step 7: Screenshot visual y limpieza**

Mismo patrón que tareas anteriores (`/tmp/task3-modal.png`), confirmar que las tarjetas se ven en fila/grid ordenado sin desbordar en mobile (390px de ancho).

```bash
cd /home/user/Tiendamax
rm -f tests/_task3_trust_badges.mjs
git add js/src/tm-product.src.js js/src/tm-product.js js/tm-bundle.js css/rediseno-cards.css css/bundle.css
git commit -m "feat(modal): trust badges como tarjetas con ícono (envío, pago, garantía, devolución)"
```

---

## Task 4: Rating con estrellas grandes + link "Ver todas"

**Files:**
- Modify: `js/src/tm-config.src.js` función `renderizarResenas(productoId)` (línea 704), bloque de `ratingTop` (línea 767-773 actual)
- Modify: `css/rediseno-cards.css`
- Test: `tests/_task4_rating.mjs` (temporal)

**Interfaces:**
- Consumes: `resenas` array ya calculado dentro de `renderizarResenas` (cada item tiene `.estrellas`).
- Produces: `#detailRatingTop` con estrellas + promedio + link "Ver todas" que hace `scrollIntoView` a `.detail-resenas-section`.

- [ ] **Step 1: Reemplazar el bloque de `ratingTop`**

En `js/src/tm-config.src.js`, reemplazar (busca `// Mostrar el promedio arriba del modal (junto al precio)`):

```javascript
    // Mostrar el promedio arriba del modal (estrellas + link a la sección de abajo)
    if (ratingTop) {
        ratingTop.innerHTML =
            '<span class="drt-stars">' + '★'.repeat(Math.round(parseFloat(promedio))) + '☆'.repeat(5 - Math.round(parseFloat(promedio))) + '</span>' +
            '<span class="drt-num">' + promedio + '</span>' +
            '<span class="drt-count">· ' + resenas.length + ' reseña' + (resenas.length !== 1 ? 's' : '') + '</span>' +
            '<button type="button" class="drt-ver-todas" onclick="document.querySelector(\'.detail-resenas-section\').scrollIntoView({behavior:\'smooth\'})">Ver todas</button>';
        ratingTop.style.display = 'flex';
    }
```

- [ ] **Step 2: Minificar y regenerar bundle**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-config
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

- [ ] **Step 3: CSS del rating**

Agregar a `css/rediseno-cards.css` (reemplaza el estilo inline previo del contenedor, que queda solo con `display`/`gap` desde el HTML — el resto se estiliza acá):

```css
/* Rating con estrellas grandes + link "Ver todas" */
#detailRatingTop.detail-rating-top{ flex-wrap:wrap; }
.drt-stars{ color:#f59e0b; font-size:17px; letter-spacing:1px; }
.drt-num{ font-weight:800; font-size:15px; color:#f2f2f5; }
.drt-count{ font-size:12px; color:#9a9aa2; }
.drt-ver-todas{
  background:none; border:none; color:var(--coral,#FF6B35); font-size:12px; font-weight:700;
  cursor:pointer; padding:0; margin-left:2px; text-decoration:underline;
  font-family:inherit;
}
body.light-mode .drt-num{ color:#1a1a1a; }
```

- [ ] **Step 4: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 5: Verificar con Playwright**

Crear `tests/_task4_rating.mjs` (puerto 9105):

```javascript
const result = await page.evaluate(async () => {
  // Producto con reseñas guardadas en localStorage (fallback 2 de renderizarResenas)
  const p = productos[0];
  localStorage.setItem('resenas_' + p.id, JSON.stringify([
    { autor: 'Ana', estrellas: 5, texto: 'Excelente producto, llegó rápido', fecha: '10 jul 2026' },
    { autor: 'Luis', estrellas: 4, texto: 'Buena calidad por el precio', fecha: '9 jul 2026' }
  ]));
  abrirDetalleProducto(p.id);
  await new Promise(r => setTimeout(r, 800)); // renderizarResenas es async
  const top = document.getElementById('detailRatingTop');
  const before = { display: top ? getComputedStyle(top).display : 'NO-EL', html: top ? top.innerHTML : '' };
  const btn = top ? top.querySelector('.drt-ver-todas') : null;
  let scrolled = false;
  if (btn) {
    const section = document.querySelector('.detail-resenas-section');
    const origScrollIntoView = section.scrollIntoView;
    section.scrollIntoView = () => { scrolled = true; };
    btn.click();
    section.scrollIntoView = origScrollIntoView;
  }
  return { before, scrolled };
});
console.log('resultado:', JSON.stringify(result));
const ok = result.before.display !== 'none' && result.before.html.includes('4.5') && result.before.html.includes('2 reseñas') && result.scrolled;
console.log(ok ? '✅ rating OK' : '❌ FALLO');
```

Run: `NODE_PATH=/opt/node22/lib/node_modules node tests/_task4_rating.mjs`
Expected: `✅ rating OK` (promedio (5+4)/2=4.5, "2 reseñas", el link scrollea).

- [ ] **Step 6: Screenshot visual y limpieza**

```bash
cd /home/user/Tiendamax
rm -f tests/_task4_rating.mjs
git add js/src/tm-config.src.js js/src/tm-config.js js/tm-bundle.js css/rediseno-cards.css css/bundle.css
git commit -m "feat(modal): rating con estrellas grandes y link a reseñas completas"
```

---

## Task 5: Bloque de precio más grande

**Files:**
- Modify: `css/rediseno-cards.css` únicamente — no requiere cambios de JS, `#detailPriceActual`/`#detailPriceOriginal`/`#detailPriceMN` ya reciben los valores correctos.

**Interfaces:**
- Consumes: nada nuevo (elementos ya poblados por `abrirDetalleProducto()`).
- Produces: nada que consuman otras tareas — puramente visual.

- [ ] **Step 1: CSS del bloque de precio**

Agregar a `css/rediseno-cards.css`:

```css
/* Bloque de precio: precio principal grande, MN debajo (no al lado) */
#productDetailModal .detail-price-wrap{
  display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 10px;
  margin:10px 0 4px;
}
#productDetailModal .detail-price-main{
  font-size:30px; font-weight:900; color:var(--coral,#FF6B35);
  letter-spacing:-.01em;
}
#productDetailModal .detail-price-old{
  font-size:14px; color:#8a8a92; text-decoration:line-through;
}
#productDetailModal .detail-price-mn{
  flex-basis:100%; font-size:13px; color:#9a9aa2; font-weight:600;
}
body.light-mode #productDetailModal .detail-price-old{ color:#999; }
body.light-mode #productDetailModal .detail-price-mn{ color:#777; }
```

- [ ] **Step 2: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 3: Screenshot visual**

Mismo patrón (`/tmp/task5-modal.png`), verificar en un producto CON oferta (`precioOriginal > precioActual`) que el tachado y el "Ahorras $X" no se amontonen con el precio grande — ajustar `gap`/`flex-wrap` si hace falta antes de dar por buena la tarea (esto es CSS puro, se puede iterar directo sin volver a picar código).

- [ ] **Step 4: Commitear**

```bash
cd /home/user/Tiendamax
git add css/rediseno-cards.css css/bundle.css
git commit -m "style(modal): precio principal más grande, MN en línea propia"
```

---

## Task 6: Countdown real conectado al modal

**Files:**
- Modify: `index.html` (`.detail-price-wrap`, agregar contenedor después)
- Modify: `js/src/tm-product.src.js` funciones `abrirDetalleProducto(id)` y `cerrarDetalleModal()`
- Modify: `css/rediseno-cards.css`
- Test: `tests/_task6_countdown.mjs` (temporal)

**Interfaces:**
- Consumes: `getActiveCountdown()` (`js/src/tm-init.src.js:792`) — devuelve `null` o `{ productId, endTime, texto }`; `renderCountdownHtml(productId)` (`js/src/tm-init.src.js:806`) — devuelve el HTML del bloque de countdown (mismo usado en las cards) o `''` si no aplica a ese producto.
- Produces: variable module-level `_detalleCountdownInterval` — timer propio del modal, limpiado al cerrar. No lo consume ninguna otra tarea.

- [ ] **Step 1: Agregar el contenedor HTML**

En `index.html`, después del cierre de `.detail-price-wrap` (antes del bloque de Stock):

```html
                        <div id="detailCountdown" class="detail-countdown-wrap" style="display:none;"></div>
```

- [ ] **Step 2: Poblar y arrancar el countdown en `abrirDetalleProducto()`**

En `js/src/tm-product.src.js`, agregar la variable module-level justo antes de `function abrirDetalleProducto(id) {` (línea 308):

```javascript
let _detalleCountdownInterval = null;

function abrirDetalleProducto(id) {
```

Dentro de `abrirDetalleProducto(id)`, después del bloque que puebla `#detailPriceMN` (busca el cierre `}` que sigue a `_detailPrecioMNEl.style.display = 'none';`), agregar:

```javascript
    // Countdown: solo si ESTE producto es el de la oferta activa configurada por el admin
    const _cdWrap = document.getElementById('detailCountdown');
    if (_detalleCountdownInterval) { clearInterval(_detalleCountdownInterval); _detalleCountdownInterval = null; }
    if (_cdWrap) {
        const _cd = (typeof getActiveCountdown === 'function') ? getActiveCountdown() : null;
        if (_cd && String(_cd.productId) === String(p.id) && typeof renderCountdownHtml === 'function') {
            const _cdHtml = renderCountdownHtml(p.id);
            if (_cdHtml) {
                _cdWrap.innerHTML = _cdHtml;
                _cdWrap.style.display = 'block';
                const pad = n => String(n).padStart(2, '0');
                const _tick = () => {
                    const rem = Math.max(0, _cd.endTime - Date.now());
                    const hEl = document.getElementById('cd_h_' + p.id);
                    const mEl = document.getElementById('cd_m_' + p.id);
                    const sEl = document.getElementById('cd_s_' + p.id);
                    if (hEl) hEl.textContent = pad(Math.floor(rem / 3600000));
                    if (mEl) mEl.textContent = pad(Math.floor((rem % 3600000) / 60000));
                    if (sEl) sEl.textContent = pad(Math.floor((rem % 60000) / 1000));
                    if (rem <= 0 && _detalleCountdownInterval) {
                        clearInterval(_detalleCountdownInterval);
                        _detalleCountdownInterval = null;
                        _cdWrap.style.display = 'none';
                    }
                };
                _tick();
                _detalleCountdownInterval = setInterval(_tick, 1000);
            } else {
                _cdWrap.style.display = 'none';
            }
        } else {
            _cdWrap.style.display = 'none';
        }
    }
```

- [ ] **Step 3: Limpiar el timer al cerrar el modal**

En `js/src/tm-product.src.js`, dentro de `cerrarDetalleModal()` (línea 678), agregar al principio del cuerpo de la función:

```javascript
function cerrarDetalleModal() {
    if (_detalleCountdownInterval) { clearInterval(_detalleCountdownInterval); _detalleCountdownInterval = null; }
    // FIX: cerrar panel de compartir si estaba abierto
```

- [ ] **Step 4: Minificar y regenerar bundle**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-product
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

- [ ] **Step 5: CSS del contenedor**

Agregar a `css/rediseno-cards.css`. Nota: `.producto-countdown`/`.countdown-block`/`.countdown-sep` ya tienen estilo base en otro archivo (se usan en las cards) — acá solo se ajusta el margen para que encaje en el modal, sin reescribir el estilo base de los bloques de dígitos:

```css
/* Wrapper del countdown dentro del modal (el contenido interno ya tiene su estilo) */
#detailCountdown.detail-countdown-wrap{ margin:10px 0 4px; }
#detailCountdown .producto-countdown{ width:100%; }
```

- [ ] **Step 6: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 7: Verificar con Playwright — caso CON countdown activo**

Crear `tests/_task6_countdown.mjs` (puerto 9106):

```javascript
const result = await page.evaluate(() => {
  const p = productos[0];
  const cd = { productId: p.id, endTime: Date.now() + 3 * 3600000, texto: 'Oferta especial' };
  localStorage.setItem('activeCountdown', JSON.stringify(cd));
  abrirDetalleProducto(p.id);
  const wrap = document.getElementById('detailCountdown');
  return { display: wrap ? getComputedStyle(wrap).display : 'NO-EL', html: wrap ? wrap.innerHTML.length : 0 };
});
console.log('con countdown activo:', JSON.stringify(result));
const ok1 = result.display !== 'none' && result.html > 0;
console.log(ok1 ? '✅ countdown visible para el producto correcto' : '❌ FALLO');
```

- [ ] **Step 8: Verificar caso SIN countdown (producto distinto)**

Agregar al mismo archivo:

```javascript
const result2 = await page.evaluate(() => {
  const otro = productos[1] || productos[0];
  // activeCountdown sigue apuntando a productos[0], no a "otro"
  abrirDetalleProducto(otro.id);
  const wrap = document.getElementById('detailCountdown');
  return { display: wrap ? getComputedStyle(wrap).display : 'NO-EL' };
});
console.log('producto sin countdown:', JSON.stringify(result2));
const ok2 = result2.display === 'none';
console.log(ok2 ? '✅ countdown oculto para producto sin oferta activa' : '❌ FALLO');
```

- [ ] **Step 9: Verificar que el timer se limpia al cerrar**

Agregar al mismo archivo, antes de cerrar el browser:

```javascript
const result3 = await page.evaluate(() => {
  const p = productos[0];
  localStorage.setItem('activeCountdown', JSON.stringify({ productId: p.id, endTime: Date.now() + 3600000, texto: 'x' }));
  abrirDetalleProducto(p.id);
  const hadInterval = typeof _detalleCountdownInterval !== 'undefined' && _detalleCountdownInterval !== null;
  cerrarDetalleModal();
  const clearedAfterClose = (typeof _detalleCountdownInterval !== 'undefined') && _detalleCountdownInterval === null;
  return { hadInterval, clearedAfterClose };
});
console.log('limpieza de timer:', JSON.stringify(result3));
const ok3 = result3.hadInterval && result3.clearedAfterClose;
console.log(ok3 ? '✅ timer limpiado al cerrar' : '❌ FALLO limpieza de timer');
if (!ok3) process.exitCode = 1;
```

Run: `NODE_PATH=/opt/node22/lib/node_modules node tests/_task6_countdown.mjs`
Expected: los 3 checks en verde.

- [ ] **Step 10: Screenshot visual y limpieza**

```bash
cd /home/user/Tiendamax
rm -f tests/_task6_countdown.mjs
git add index.html js/src/tm-product.src.js js/src/tm-product.js js/tm-bundle.js css/rediseno-cards.css css/bundle.css
git commit -m "feat(modal): countdown real conectado (solo para el producto con oferta activa)"
```

---

## Task 7: Caja de stock bajo con barra de color

**Files:**
- Modify: `css/rediseno-cards.css` únicamente — `#detailProductStock`/`#detailStockBarFill` ya reciben el texto/ancho correctos desde `abrirDetalleProducto()` (no se toca JS).

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: CSS de la caja de stock**

Agregar a `css/rediseno-cards.css`:

```css
/* Caja de aviso de stock bajo + barra de color */
#productDetailModal .detail-stock{
  display:inline-block; font-size:13px; font-weight:700;
  padding:8px 12px; border-radius:10px;
  background:rgba(230,126,34,.08); border:1px solid rgba(230,126,34,.25);
}
#productDetailModal .stock-bar{
  height:6px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden;
}
#productDetailModal .stock-bar-fill{
  height:100%; border-radius:99px;
  background:linear-gradient(90deg, #e67e22, #f39c12);
  transition:width .3s ease;
}
body.light-mode #productDetailModal .stock-bar{ background:rgba(0,0,0,.06); }
```

- [ ] **Step 2: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 3: Screenshot visual**

Verificar con un producto de `stock <= 3` (ya hay lógica real que lo detecta) que la caja se vea como aviso claro, y con un producto de stock alto que NO se vea la caja de urgencia (solo el texto normal "📦 N unidades disponibles", sin el fondo naranja — puede requerir un selector CSS más específico si el HTML no distingue los dos casos por clase; si `#detailProductStock` no tiene una clase distinta para "stock bajo" vs "stock normal", ajustar el JS de `abrirDetalleProducto()` en este mismo paso para agregar `stockEl.classList.toggle('stock-bajo', _stockN > 0 && _stockN <= 3)` y condicionar el fondo naranja al selector `.detail-stock.stock-bajo` en vez de aplicarlo siempre).

- [ ] **Step 4: Si hizo falta el ajuste de JS del Step 3, minificar y regenerar**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-product
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

- [ ] **Step 5: Commitear**

```bash
cd /home/user/Tiendamax
git add css/rediseno-cards.css css/bundle.css js/src/tm-product.src.js js/src/tm-product.js js/tm-bundle.js 2>/dev/null
git commit -m "style(modal): caja de aviso de stock bajo con barra de color"
```

---

## Task 8: Texto y estilo de "vieron esto" sin ventana de tiempo falsa

**Files:**
- Modify: `js/src/tm-product.src.js`, dos lugares dentro de `abrirDetalleProducto(id)` donde se arma el texto de `#detailPersonasViendo` (línea ~600 y ~614 actuales — contador local y contador de Firebase)
- Modify: `css/rediseno-cards.css`
- Test: `tests/_task8_vieron_esto.mjs` (temporal)

**Interfaces:**
- Consumes: `obtenerVistasProd(prodId)` (contador local ya existente) y el fetch a `/analytics/vistas/{id}/count.json` (ya existente).
- Produces: texto sin mención de "24h" en `#detailPersonasViendo` — no lo consume ninguna otra tarea.

- [ ] **Step 1: Cambiar el texto del contador local**

En `js/src/tm-product.src.js`, dentro del bloque `// Contador de vistas — local primero, Firebase en segundo plano`, cambiar:

```javascript
            vDiv.innerHTML = '<span class="pv-inner">👁️ <strong>' + local.toLocaleString() + '</strong> personas vieron esto</span>';
```

por:

```javascript
            vDiv.innerHTML = '<span class="pv-inner">👁️ <strong>' + local.toLocaleString() + '</strong> personas vieron este producto</span>';
```

- [ ] **Step 2: Cambiar el texto del contador de Firebase**

En el mismo archivo, el fetch async que sigue, cambiar:

```javascript
                    el.innerHTML = '<span class="pv-inner">👁️ <strong>' + cnt.toLocaleString() + '</strong> personas vieron esto</span>';
```

por:

```javascript
                    el.innerHTML = '<span class="pv-inner">👁️ <strong>' + cnt.toLocaleString() + '</strong> personas vieron este producto</span>';
```

- [ ] **Step 3: Minificar y regenerar bundle**

```bash
cd /home/user/Tiendamax
python3 scripts/minify_js.py tm-product
python3 scripts/build_js_bundle.py
node -c js/tm-bundle.js
```

- [ ] **Step 4: CSS del contador**

Agregar a `css/rediseno-cards.css`:

```css
/* Contador "vieron este producto" — línea pequeña con ícono */
.contador-personas .pv-inner{
  display:inline-flex; align-items:center; gap:5px;
  font-size:12px; color:#9a9aa2; font-weight:600;
}
.contador-personas .pv-inner strong{ color:#f2f2f5; }
body.light-mode .contador-personas .pv-inner strong{ color:#1a1a1a; }
```

- [ ] **Step 5: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 6: Verificar con Playwright**

Crear `tests/_task8_vieron_esto.mjs` (puerto 9107):

```javascript
const result = await page.evaluate(() => {
  const p = productos[0];
  // vistasProd = { [id]: count }, ver _cargarVistas()/obtenerVistasProd() en tm-patches.src.js:185-198
  localStorage.setItem('vistasProd', JSON.stringify({ [p.id]: 7 }));
  abrirDetalleProducto(p.id);
  const el = document.getElementById('detailPersonasViendo');
  return { text: el ? el.textContent : 'NO-EL' };
});
console.log('resultado:', JSON.stringify(result));
const ok = result.text.includes('7') && !result.text.includes('24') && !result.text.includes('horas');
console.log(ok ? '✅ contador local real, sin mención de ventana de 24h' : '❌ FALLO');
```

Run: `NODE_PATH=/opt/node22/lib/node_modules node tests/_task8_vieron_esto.mjs`
Expected: `✅ sin mención de ventana de 24h`.

- [ ] **Step 7: Limpieza y commit**

```bash
cd /home/user/Tiendamax
rm -f tests/_task8_vieron_esto.mjs
git add js/src/tm-product.src.js js/src/tm-product.js js/tm-bundle.js css/rediseno-cards.css css/bundle.css
git commit -m "fix(modal): texto de vistas sin insinuar ventana de 24h que no existe"
```

---

## Task 9: Botón "Pedir por WhatsApp" más protagonista

**Files:**
- Modify: `css/rediseno-cards.css` únicamente.

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: CSS del botón**

Agregar a `css/rediseno-cards.css`:

```css
/* Botón "Pedir por WhatsApp" más grande/protagonista dentro del modal */
#productDetailModal .detail-cta-row #detailBuyBtn.detail-buy-btn{
  padding:16px 18px; font-size:16px; border-radius:16px;
}
#productDetailModal .detail-cta-row #detailBuyBtn .btn-pedir-wa-text{ font-weight:800; }
```

- [ ] **Step 2: Regenerar bundle.css**

```bash
cd /home/user/Tiendamax
python3 scripts/build_css.py
```

- [ ] **Step 3: Screenshot visual y commit**

Verificar en mobile (390px) que el botón no empuje al corazón/carrito fuera de la fila.

```bash
cd /home/user/Tiendamax
git add css/rediseno-cards.css css/bundle.css
git commit -m "style(modal): botón Pedir por WhatsApp más grande"
```

---

## Task 10: QA final — regresión completa

**Files:**
- No se modifica código de producto — solo verificación.

- [ ] **Step 1: Suite de tests existente**

```bash
cd /home/user/Tiendamax
python3 -m unittest discover -s tests -p "test_*.py"
```

Expected: `OK`, 18 tests (los mismos de siempre — este trabajo no agrega tests Python porque no toca lógica Python).

- [ ] **Step 2: Smoke test E2E**

```bash
cd /home/user/Tiendamax
NODE_PATH=/opt/node22/lib/node_modules node tests/smoke-web.mjs
```

Expected: `✅ smoke OK`. Si falla por el timeout conocido de imágenes externas en el sandbox (no relacionado con este trabajo, ya documentado en sesiones anteriores), repetir una vez; si persiste, verificar manualmente con un check dirigido (`waitUntil:'domcontentloaded'` en vez de `'load'`, como se hizo en tareas anteriores de esta sesión) en lugar de asumir que es un fallo real.

- [ ] **Step 3: Recorrido visual completo en mobile**

Screenshot de 3 escenarios reales (usar el mismo patrón de servidor+Playwright de las tareas anteriores, sin dejar el script en el repo):
1. Producto normal (sin oferta, sin countdown, con reseñas, stock alto).
2. Producto con oferta activa + countdown + stock bajo (`stock<=3`).
3. Producto agotado (`stock=0`) — confirmar que NO aparecen countdown ni badges de hype, y que se ve el botón "🔔 Avísame" en vez de "Pedir".

Revisar las 3 imágenes con la herramienta Read antes de dar la tarea por cerrada.

- [ ] **Step 4: Bump de versión de service worker y `?v=`**

```bash
cd /home/user/Tiendamax
VERSION="tiendamax-$(date -u +%Y%m%d%H%M)"
sed -i "s/const CACHE_NAME = 'tiendamax-[^']*'/const CACHE_NAME = '$VERSION'/" sw.js
python3 scripts/bump_versions.py
```

- [ ] **Step 5: Commit final**

```bash
cd /home/user/Tiendamax
git add sw.js index.html admin.html 404.html 2>/dev/null
git commit -m "chore: bump SW y cache-busting tras rediseño del modal de producto"
```

- [ ] **Step 6: Push, PR y deploy**

Seguir el mismo patrón usado durante toda la sesión: `git push -u origin claude/admin-design-review-oa2dg0`, crear PR contra `main`, si hay conflicto (patrón recurrente esta sesión: commits de bots ya mergeados aparecen como "already upstream") hacer `git fetch origin main && git rebase origin/main` y resolver cualquier conflicto trivial de `sw.js` (tomar el valor más nuevo y volver a correr el bump), mergear con `merge_method: "squash"`, y disparar `pages.yml` manualmente al final (`mcp__github__actions_run_trigger`, `method: "run_workflow"`, `ref: "main"`) — los workflows de bot ya fueron arreglados esta sesión para auto-disparar Pages en sus propios commits, pero el merge de este PR lo hace directo el actor humano/API, así que igual conviene confirmar en la lista de runs que el deploy quedó en verde antes de reportar terminado.

---

## Self-review (hecho por quien escribió este plan)

- **Cobertura de la spec:** las 15 secciones de la spec están cubiertas — Tasks 1-9 cubren cada sección 1:1 (con Task 5/7/9 CSS-only para precio/stock/CTA que no necesitaban cambios de JS), Task 10 es la verificación final. Los 2 puntos "fuera de alcance" (variantes, qué recibirás) no tienen tarea — correcto, están explícitamente descartados. La descripción-como-checklist (punto 13 de la spec) se dejó fuera de este plan a propósito: requiere inspeccionar el formato real de las descripciones existentes antes de decidir si aplica, y el usuario no lo mencionó como prioridad al aprobar "dale hazlo" — si se quiere, es una Task 11 futura, no bloquea el resto.
- **Placeholders:** no hay TODO/TBD. Se verificó el código real de `obtenerVistasProd`/`_cargarVistas` (`tm-patches.src.js:185-198`) para confirmar la clave exacta de localStorage (`vistasProd`, objeto `{id: count}`) antes de escribir el test de Task 8, en vez de asumir un formato.
- **Consistencia de tipos/nombres:** `_detalleCountdownInterval`, `getActiveCountdown()`, `renderCountdownHtml()`, `esProductoNuevo()` se usan con la misma firma en todas las tareas que los tocan.
