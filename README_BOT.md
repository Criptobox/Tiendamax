# 🤖 BOT TIENDAMAX v3.0 — Guía Rápida

## Uso diario (3 pasos)

### 1️⃣ Abrir Chrome especial
Ejecuta: **abrir_chrome_especial.bat**
- Abre Chrome con TU perfil real
- Cloudflare no detecta nada porque eres tú

### 2️⃣ Verificar sesiones
En ese Chrome verifica que estés logueado en:
- https://www.revolico.com
- https://www.facebook.com

### 3️⃣ Iniciar el bot
Ejecuta: **iniciar_bot.bat**

Elige opción **4** para modo automático:
- 8:00 AM → publica en grupos de Facebook
- 9:00 AM → publica en Revolico
- 5:00 PM → publica en grupos de Facebook

---

## Agregar grupos de Facebook

Abre `backend/revolico_agent.py` con el Bloc de Notas y edita:

```python
FACEBOOK_GRUPOS = [
    "https://www.facebook.com/groups/URL_GRUPO_1",
    "https://www.facebook.com/groups/URL_GRUPO_2",
]
```

---

## Agregar productos nuevos

1. Agrega el producto en tu panel de tiendamax.org
2. Click en **"ACTUALIZAR TIENDA AHORA"**
3. El bot lo recoge automáticamente ✅

---

## Archivos importantes

| Archivo | Para qué sirve |
|---------|---------------|
| `abrir_chrome_especial.bat` | Abre Chrome para el bot |
| `iniciar_bot.bat` | Inicia el bot |
| `backend/revolico_agent.py` | Código del bot (configura aquí) |
| `backend/bot_log.txt` | Registro de publicaciones |
