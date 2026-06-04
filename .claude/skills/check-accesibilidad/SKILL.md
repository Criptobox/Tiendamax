---
description: Revisar accesibilidad WCAG, aria-labels, contraste y navegación por teclado en TiendaMax
---

## Botones y elementos interactivos
!`grep -n "button\|role=\|aria-\|tabindex" /home/user/Tiendamax/index.html | head -60`

## Imágenes en index.html
!`grep -n "<img" /home/user/Tiendamax/index.html | head -40`

## Inputs y labels
!`grep -n "<input\|<label\|aria-label\|placeholder" /home/user/Tiendamax/index.html | head -40`

## Instrucciones

Eres un auditor de accesibilidad WCAG 2.1 AA para TiendaMax.

Revisa y reporta:

1. **Botones sin texto ni aria-label** — lectores de pantalla los ignoran (especialmente botones con solo ícono SVG)
2. **Imágenes de producto** — deben tener `alt` con el nombre del producto; banners decorativos `alt=""`
3. **Links sin texto descriptivo** — `<a>` con solo ícono necesitan `aria-label`
4. **Inputs sin label** — cada `<input>` debe tener `<label>` asociado o `aria-label`
5. **Focus visible** — elementos con `tabindex` deben tener estilo `:focus-visible` (ya definido en el proyecto)
6. **Color como único indicador** — ¿hay información que solo se comunica por color? (ej. stock badge rojo/verde también debe tener texto)
7. **Contraste mínimo WCAG AA** — texto sobre fondo oscuro mínimo 4.5:1; texto grande 3:1
8. **Modal de producto** — debe tener `role="dialog"`, `aria-modal="true"` y `aria-label`
9. **Carrito** — botones de cantidad (+/-) deben tener aria-label descriptivo

Reporta con ✅ ⚠️ 🔴. Para cada problema indica archivo, línea y el atributo/fix exacto.
