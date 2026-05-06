# TiendaMax - Guía Completa

## Descripción

TiendaMax es una tienda online con publicación automática en Revolico. El sistema publica todos los productos automáticamente **a las 8:00 AM y 5:00 PM** (hora Cuba).

---

## Estructura del Proyecto

```
tiendamax/
├── index.html              # Página principal de la tienda
├── css/
│   └── styles.css          # Estilos de la tienda
├── js/
│   ├── script.js           # Lógica del frontend
│   └── revolico_integration.js
├── backend/
│   ├── app.py              # Servidor Flask (API)
│   ├── revolico_agent.py   # Agente de publicación en Revolico
│   └── data/               # Datos guardados (productos, historial)
├── iniciar_windows.bat     # Iniciar bot en Windows
└── instalar_librerias.bat  # Instalar dependencias
```

---

## Panel de Administración

1. Haz clic en el botón ⚙️ (esquina superior derecha).
2. Ingresa tu contraseña de administrador (configurada en `js/script.js`).
3. Desde el panel puedes:
   - **Agregar productos** con imagen, precio y descripción.
   - **Publicar en Revolico** de forma automática o manual.
   - **Usar el Asistente de Facebook** para Grupos.
   - **Gestionar categorías** y sincronizar con GitHub.

---

## Publicación Automática en Revolico

El sistema publica automáticamente a:
- **8:00 AM** (hora Cuba)
- **5:00 PM** (hora Cuba)

**Importante:** Debes importar tus cookies de Revolico desde el panel para que la publicación funcione.

---

## Configuración de GitHub

Para que tus cambios se guarden en internet:
1. Configura tu **Usuario, Repositorio y Token** en la pestaña "Configuración" del panel admin.
2. Haz clic en **"ACTUALIZAR TIENDA AHORA"** después de cada cambio.

---

## Contacto y Soporte

WhatsApp: +53 54320170
