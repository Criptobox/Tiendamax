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
├── iniciar.sh              # Script para iniciar todo
└── detener.sh              # Script para detener todo
```

---

## Cómo Usar

### Iniciar el sistema

```bash
cd /home/ubuntu/tiendamax
bash iniciar.sh
```

### Detener el sistema

```bash
bash detener.sh
```

### Acceder a la tienda

- **Tienda:** http://localhost:8000
- **API Backend:** http://localhost:5002/api/status

---

## Panel de Administración

1. Haz clic en el botón ⚙️ (esquina superior derecha)
2. Contraseña: `admin123`
3. Desde el panel puedes:
   - **Agregar productos** con imagen, precio y descripción
   - **Publicar en Revolico** manualmente o de forma automática
   - **Ver el historial** de publicaciones
   - **Gestionar categorías**

---

## Publicación Automática en Revolico

El sistema publica automáticamente a:
- **8:00 AM** (hora Cuba)
- **5:00 PM** (hora Cuba)

**Importante:** Asegúrate de importar tus cookies de Revolico desde el panel de administración para que la publicación automática funcione correctamente.

---

## Despliegue para Acceso desde Cuba

### Opción 1: Hosting en Cuba (Recomendado)

Para que la página sea accesible desde Cuba sin restricciones, necesitas alojarla en un servidor con IP cubana o en un hosting que no esté bloqueado en Cuba.

**Opciones recomendadas:**
1. **ETECSA / Nauta Hogar** - Servidor local en Cuba
2. **VPS con IP no bloqueada** - Contratado desde Cuba
3. **GitHub Pages** - Gratuito, accesible desde Cuba

### Opción 2: GitHub Pages (Gratuito)

1. Crea una cuenta en [github.com](https://github.com)
2. Crea un repositorio nuevo (ej: `tiendamax`)
3. Sube los archivos: `index.html`, `css/`, `js/`
4. Ve a Settings → Pages → Source: `main branch`
5. Tu tienda estará en: `https://tu-usuario.github.io/tiendamax`

**Nota:** GitHub Pages solo sirve archivos estáticos. El backend Python debe correr en un servidor separado.

### Opción 3: Netlify (Gratuito, accesible desde Cuba)

1. Ve a [netlify.com](https://netlify.com)
2. Arrastra la carpeta del proyecto
3. Netlify te dará una URL gratuita accesible desde Cuba

### Opción 4: Servidor VPS

Si tienes un VPS (DigitalOcean, Vultr, Hetzner, etc.):

```bash
# En el servidor VPS
git clone tu-repositorio
cd tiendamax
bash iniciar.sh
```

---

## Configuración del Backend para Producción

Edita `backend/app.py` y cambia:

```python
# Para producción, usa una IP pública
app.run(host='0.0.0.0', port=5002, debug=False)
```

Y en `js/script.js`, actualiza la URL del backend:

```javascript
// Cambia localhost por la IP o dominio de tu servidor
const BACKEND_URL = 'http://TU-IP-PUBLICA:5002/api';
```

---

## API del Backend

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/status` | GET | Estado del servidor y próxima publicación |
| `/api/productos` | GET | Lista de productos |
| `/api/productos` | POST | Sincronizar productos desde frontend |
| `/api/publicar-revolico` | POST | Publicar un producto en Revolico |
| `/api/publicar-ahora` | POST | Publicar todos los productos ahora |
| `/api/historial` | GET | Historial de publicaciones |

---

## Solución de Problemas

### El backend no inicia

```bash
cd /home/ubuntu/tiendamax/backend
python3 app.py
# Ver el error en la consola
```

### Revolico no publica

1. Verifica que las credenciales sean correctas en `backend/app.py`
2. Revisa los logs: `cat backend/backend.log`
3. Prueba la conexión: `curl http://localhost:5002/api/test-revolico`

### La página no carga en Cuba

- Verifica que el servidor no use servicios bloqueados (Cloudflare, AWS, etc.)
- Usa un hosting con IP no bloqueada en Cuba
- Considera usar GitHub Pages o Netlify

---

## Contacto y Soporte

WhatsApp: +53 54320170
