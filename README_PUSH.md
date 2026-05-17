# 🔔 README_PUSH.md — Guía de Notificaciones Push para TiendaMax

## ¿Qué tienes que hacer? (Resumen en 5 pasos)

---

## PASO 1 — Generar tus claves VAPID

Las claves VAPID son como una firma digital que identifica tu tienda.
Necesitas generarlas UNA SOLA VEZ.

### Opción A — Online (más fácil)
Ve a: https://vapidkeys.com/
Haz clic en "Generate" y guarda las dos claves.

### Opción B — Con Node.js en tu computadora
```bash
npm install -g web-push
web-push generate-vapid-keys
```

Resultado:
```
Public Key:  BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U
Private Key: UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
```

---

## PASO 2 — Agregar la clave pública al código

Abre `js/push-notifications.js` y reemplaza:
```javascript
const VAPID_PUBLIC_KEY = 'TU_VAPID_PUBLIC_KEY_AQUI';
```
Por tu clave pública real:
```javascript
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-...';
```

---

## PASO 3 — Agregar el script en index.html

Busca en tu `index.html` donde cargas los scripts y agrega:
```html
<!-- ANTES de cerrar </body> -->
<script src="js/push-notifications.js"></script>
```

---

## PASO 4 — Reemplazar sw.js

Reemplaza tu `sw.js` actual con el nuevo `sw.js` incluido en este paquete.
Si ya tienes lógica de cache propia que quieres mantener, solo agrega
el bloque comentado como `── PUSH NOTIFICATIONS ──` al final de tu sw.js.

---

## PASO 5 — Subir a GitHub

```bash
git add js/push-notifications.js sw.js
git commit -m "feat: agregar sistema de notificaciones push"
git push origin main
```

GitHub Pages desplegará automáticamente. ¡Listo!

---

## ¿Cómo funciona exactamente?

### Para los clientes:
1. La primera vez que visiten la tienda (después de 4 segundos), verán un banner:
   "🔔 ¡Activa las alertas! — Recibe ofertas relámpago y nuevos productos"
2. Si hacen clic en "Activar", el navegador preguntará permiso.
3. Si aceptan, quedan suscritos y recibirán notificaciones.

### Para ti (desde el panel admin):
- Cuando agregues un producto: se dispara automáticamente si integras el fragmento en script.js
- Puedes enviar manualmente desde los botones del panel:
  - ⚡ Oferta relámpago
  - ☀️ Oferta del día (se programa para las 8 AM)
  - 📢 Mensaje libre

---

## Modo sin backend vs con backend

### MODO SIN BACKEND (recomendado para empezar)
`MODO_SIN_BACKEND = true` en push-notifications.js

- Las notificaciones se envían desde el mismo navegador donde estás administrando.
- Funciona perfectamente en GitHub Pages.
- Limitación: para notificar a TODOS los clientes necesitas tener el panel abierto.

### MODO CON BACKEND Flask (para escala mayor)
`MODO_SIN_BACKEND = false`

Agrega estas rutas a tu `backend/app.py`:

```python
from flask import request, jsonify
import json, os

SUSCRIPCIONES_FILE = 'backend/data/push_subscriptions.json'

@app.route('/api/push/subscribe', methods=['POST'])
def push_subscribe():
    sub = request.json
    subs = []
    if os.path.exists(SUSCRIPCIONES_FILE):
        with open(SUSCRIPCIONES_FILE) as f:
            subs = json.load(f)
    if sub not in subs:
        subs.append(sub)
        with open(SUSCRIPCIONES_FILE, 'w') as f:
            json.dump(subs, f)
    return jsonify({'ok': True})

@app.route('/api/push/send', methods=['POST'])
def push_send():
    from pywebpush import webpush, WebPushException
    datos = request.json
    subs = []
    if os.path.exists(SUSCRIPCIONES_FILE):
        with open(SUSCRIPCIONES_FILE) as f:
            subs = json.load(f)
    
    VAPID_PRIVATE_KEY = 'TU_PRIVATE_KEY_AQUI'
    VAPID_CLAIMS = {"sub": "mailto:tu@email.com"}
    
    enviados = 0
    for sub in subs:
        try:
            webpush(
                subscription_info=sub,
                data=json.dumps(datos),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS
            )
            enviados += 1
        except WebPushException as e:
            print(f'Error enviando push: {e}')
    
    return jsonify({'enviados': enviados})
```

Instalar dependencia:
```bash
pip install pywebpush
```

---

## Compatibilidad

| Navegador | Soporte |
|-----------|---------|
| Chrome (Android/Desktop) | ✅ Completo |
| Firefox | ✅ Completo |
| Edge | ✅ Completo |
| Safari iOS 16.4+ | ✅ (con app instalada en home) |
| Safari macOS | ✅ |
| Samsung Internet | ✅ |

**Nota iOS:** En iPhone/iPad, las notificaciones push en PWA solo funcionan si el usuario primero instala la tienda en la pantalla de inicio (botón Compartir → Añadir a pantalla de inicio).

---

## Preguntas frecuentes

**¿Cuántos clientes puedo notificar?**
Sin backend: solo los que tengan la tienda abierta en ese momento.
Con backend: todos los que hayan aceptado, sin límite.

**¿Puedo programar las notificaciones?**
Sí, `programarOfertaDelDia()` usa `setTimeout` para programar.
Para persistencia real entre reinicios, usa el backend con una tarea cron.

**¿Las notificaciones llegan aunque la tienda esté cerrada?**
Sí, si el usuario la tiene instalada como PWA y el service worker está activo.
