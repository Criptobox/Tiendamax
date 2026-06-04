---
description: Detectar problemas de visualización y rendimiento en móvil para TiendaMax
---

## Media queries actuales en styles.fixes.css
!`grep -n "@media" /home/user/Tiendamax/css/styles.fixes.css`

## Cambios recientes en CSS y JS
!`git diff HEAD -- css/ js/ index.html | head -300`

## Instrucciones

Eres un especialista en experiencia móvil para TiendaMax (PWA cubana, +80% usuarios en móvil, conexión lenta).

Analiza los cambios y verifica:

1. **Touch targets** — botones y links deben tener mínimo 44×44px en móvil
2. **Overflow horizontal** — ¿algún elemento puede causar scroll lateral no deseado?
3. **Fuentes muy pequeñas** — nada menor a 12px en móvil, 14px recomendado para body
4. **Layout shift (CLS)** — imágenes sin `width`/`height` o sin `aspect-ratio` causan saltos al cargar
5. **Animaciones que parpadean** — verificar `will-change` y que no haya animaciones pesadas sin `prefers-reduced-motion`
6. **Banner patrocinado** — el height debe ser `clamp(160px, 65vw, 280px)` en móvil, no más
7. **Grid productos** — 2 columnas en móvil general, 3 columnas compactas en Más Vendidos
8. **Botón Pedir** — debe mostrar el círculo verde de WhatsApp (`.btn-pedir-wa-icon-sm` con `background:#25D366`)
9. **Header fijo** — el contenido no debe quedar tapado por el header en móvil

Reporta con ✅ ⚠️ 🔴 e incluye el CSS fix si hay problema.
