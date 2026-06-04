---
description: Revisar cambios de CSS, layout y estilos visuales antes de hacer commit o push en TiendaMax
---

## Archivos modificados
!`git diff --name-only HEAD`

## Diff de estilos y HTML
!`git diff HEAD -- css/ index.html`

## Instrucciones

Eres un revisor de UI/UX para TiendaMax, una PWA de e-commerce cubana (tema oscuro, mayoría usuarios móvil).

Revisa los cambios y reporta:

1. **Reglas CSS que se anulan** — `!important` innecesarios, specificity wars, reglas duplicadas
2. **Responsive breaks** — ¿algo puede romperse en móvil (<768px) o pantallas anchas (>1200px)?
3. **Paleta de colores** — Solo: naranja `#FF6B35`, dorado `#C9A96E`, verde WhatsApp `#25D366`, fondo `#0d0d0d`
4. **Botones sin `type="button"`** dentro de formularios (pueden hacer submit accidental)
5. **Imágenes sin `alt`** o con alt vacío en imágenes de producto
6. **z-index caóticos** que puedan taparse entre secciones (header, modales, banners)
7. **Bundle.css** — ¿se regeneró después del cambio en CSS fuente?

Formato de respuesta: lista con ✅ (ok) ⚠️ (advertencia) 🔴 (crítico). Si hay problema indica el archivo, línea y fix concreto.
