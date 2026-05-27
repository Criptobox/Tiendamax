# TiendaMax — Guía de migración v38

## ⚠️ Acción requerida tras actualizar

### 1. Configurar la nueva contraseña de administrador

La versión v38 eliminó los hashes de contraseña del código fuente.
El sistema ahora usa **PBKDF2 con sal aleatoria** (310 000 iteraciones, SHA-256).

**La primera vez que entres al panel admin después de esta actualización:**
- El sistema detectará que no hay contraseña configurada.
- Escribe la contraseña que quieras y pulsa Enter — se configurará automáticamente.
- También puedes cambiarla desde **Panel Admin → Configuración → Contraseña del Panel**.

> La contraseña se guarda solo en el `localStorage` del dispositivo donde la configures.
> Si cambias de dispositivo o limpias el storage, tendrás que entrar sin contraseña y volver a configurarla.

### 2. Invalidar contraseñas anteriores

Si otras personas conocían las contraseñas antiguas (`admin123`, etc.), **cambia la contraseña** 
desde el panel una vez actualizado.

### 3. Proteger `ventas_historial.json` en GitHub

Aunque `robots.txt` ahora bloquea los crawlers, el archivo sigue siendo público en GitHub.
Para protegerlo completamente:
- Mueve `ventas_historial.json` a `.gitignore` o hazlo privado.
- Considera mover los datos de ventas a Firebase Realtime Database.

### 4. CSS consolidado

`styles.banner.fix.css` y `styles.fixes.css` se fusionaron en `styles.css` (v13).
Los archivos originales se mantienen en el repositorio por compatibilidad con el SW cacheado
de usuarios existentes, pero **no se cargan más desde HTML**.

### 5. Versiones actualizadas
| Archivo | Versión anterior | Versión nueva |
|---------|-----------------|---------------|
| `js/script.js` | v37 | v38 |
| `css/styles.css` | v12 | v13 |
| Service Worker | v43 | v44 |
