---
description: Revisión completa antes de hacer push en TiendaMax — UI, mobile, accesibilidad y seguridad
---

## Estado del repositorio
!`git status --short`

## Archivos modificados
!`git diff --name-only HEAD`

## Diff completo
!`git diff HEAD`

## Versión actual del bundle y SW
!`grep -n "bundle.css\?v=" /home/user/Tiendamax/index.html | head -3`
!`grep "CACHE_NAME" /home/user/Tiendamax/sw.js | head -1`

## Instrucciones

Ejecuta una revisión completa de todos los cambios pendientes en TiendaMax antes del push. Sé conciso pero exhaustivo.

---

### 🎨 UI / Estilos
- Reglas CSS conflictivas o `!important` innecesarios
- Colores fuera de paleta: naranja `#FF6B35`, dorado `#C9A96E`, verde `#25D366`, fondo `#0d0d0d`
- ¿El bundle.css fue regenerado? ¿La versión `?v=N` en index.html coincide con `CACHE_NAME` en sw.js?

### 📱 Mobile
- Touch targets < 44px
- Overflow horizontal posible
- Fuentes < 12px en móvil
- Círculo verde WhatsApp en botones Pedir (`.btn-pedir-wa-icon-sm` background verde)
- Banner patrocinado: height no mayor a 280px en móvil

### ♿ Accesibilidad
- Botones con solo ícono sin aria-label
- Imágenes de producto sin alt descriptivo
- Inputs sin label asociado

### 🔒 Seguridad
- `innerHTML` con datos no escapados (datos de producto, usuario, localStorage)
- URLs en `href` o `src` sin validación `https?:` (evitar path traversal)
- Datos sensibles hardcodeados (tokens, claves API)

---

Termina con veredicto final:
- ✅ **LISTO PARA PUSH** — sin problemas
- ⚠️ **REVISAR** — hay advertencias menores, push posible con cuidado
- 🔴 **NO PUSHEAR** — hay problemas críticos que corregir primero
