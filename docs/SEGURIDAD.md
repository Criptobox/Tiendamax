# Guía de Seguridad — TiendaMax

## 1. Firebase Realtime Database — Reglas de Seguridad

Tu `config.json` contiene las credenciales de Firebase. **Esto es normal para apps web**,
pero debes proteger la base de datos con reglas estrictas.

### Reglas recomendadas (Firebase Console → Realtime Database → Rules):

```json
{
  "rules": {
    "tokens": {
      ".read": false,
      ".write": false,
      "$uid": {
        ".validate": "newData.hasChildren(['token'])",
        "token": { ".validate": "newData.isString() && newData.val().length > 20" }
      }
    },
    "ventas": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    ".read": false,
    ".write": false
  }
}
```

> ⚠️ **CRÍTICO**: Si NO configuras estas reglas, cualquiera con tu `projectId` puede
> leer y escribir toda tu base de datos.

### Cómo aplicar:
1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Selecciona tu proyecto (`tiendamax-8feb5`)
3. Realtime Database → Rules
4. Pega las reglas de arriba y Publica

---

## 2. GitHub Token — Buenas Prácticas

El token de GitHub (`githubToken`) se guarda en `localStorage` del navegador.
Cualquier vulnerabilidad XSS podría exponerlo.

### Recomendaciones:

| Práctica | Descripción |
|----------|-------------|
| **Token clásico limitado** | Crea un token con solo `repo` scope. Nunca uses tokens con `admin:repo_hook` u otros scopes |
| **Dispositivo dedicado** | Solo ingresa el token desde el dispositivo que usas para administrar |
| **Rota periódicamente** | Cambia el token cada 30-60 días |
| **No compartas** | Cada admin debe tener su propio token |

### Cómo crear un token seguro:
1. GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Nombre: `TiendaMax-Admin`
3. Scope: solo `repo` (control total sobre repositorios privados)
4. Copia el token y pégalo en el Panel Admin → Configuración

---

## 3. Contraseña de Administrador

### Situación actual (v39+):
- ✅ PBKDF2 con sal aleatoria (310,000 iteraciones, SHA-256)
- ✅ No hay hashes hardcodeados en el código fuente
- ✅ Rate limiting: 3 intentos → bloqueo 5 minutos
- ❌ La contraseña se guarda en `localStorage` del navegador

### Limitaciones conocidas:
- La contraseña solo persiste en el dispositivo donde se configuró
- Si limpias el `localStorage`, pierdes la contraseña
- No hay autenticación multi-dispositivo

### Recomendaciones:
- Configura la contraseña en tu dispositivo principal
- No uses la misma contraseña que en otros servicios
- Si sospechas que se comprometió, cámbiala inmediatamente desde el Panel Admin

---

## 4. `ventas_historial.json` — Datos Sensibles

Este archivo contiene el historial de ventas con montos y ganancias.

### Ya no está en GitHub:
- Se agregó `ventas_historial.json` a `.gitignore`
- Los datos existentes en el historial de GitHub (commits anteriores) **siguen visibles**
- Para limpiarlos: sigue [GitHub Docs: Eliminar datos sensibles](https://docs.github.com/es/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

### Alternativa recomendada:
Migra los datos de ventas a Firebase Realtime Database con reglas de autenticación:

```json
{
  "rules": {
    "ventas": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

---

## 5. API Keys de Firebase

Las API keys de Firebase Web son **públicas por diseño**. No son un secreto.
La seguridad real viene de:
1. **Firebase Security Rules** (la más importante)
2. **App Check** (opcional, verifica que la请求 venga de tu app)
3. **Autenticación** (requiere login para operaciones sensibles)

### Firebase App Check (recomendado):
1. Firebase Console → App Check → Register app
2. Usa reCAPTCHA Enterprise o App Attest
3. Esto evita que otros dominios usen tu API key

---

## 6. Checklist de Seguridad

- [ ] Firebase Realtime Database Rules configuradas (solo auth puede leer/escribir)
- [ ] `ventas_historial.json` en `.gitignore` y eliminado del historial de git
- [ ] Token de GitHub es de tipo "classic" con solo scope `repo`
- [ ] App Check habilitado en Firebase
- [ ] Contraseña de admin cambiada (no usar `admin123`)
- [ ] HTTPS habilitado (GitHub Pages lo hace automáticamente)
- [ ] CSP (Content-Security-Policy) configurado ✅ (ya lo tienes)
- [ ] Sin secretos en el código fuente (verificar con `git log -p`)
