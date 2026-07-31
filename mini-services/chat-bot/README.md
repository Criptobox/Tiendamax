# Bot "Max" — chat de TiendaMax

> ⚠️ **Este Worker ya no se usa.** El bot responde ahora **en el navegador**,
> sin backend: `js/src/tm-bot.src.js` (burbuja) + `js/src/tm-bot-cerebro.src.js`
> (todo el razonamiento, contra el catálogo real). El `<meta name="tm-bot-api">`
> que se menciona más abajo **ya no existe en `index.html`**.
>
> Motivo del cambio: la URL del Worker nunca se llegó a poner, así que cada
> mensaje caía en `/api/chat`, que GitHub Pages no puede servir, y el bot
> contestaba siempre "tuve un problema de conexión". Terminó comentado en
> `index.html`. Sin backend no hay URL que configurar, ni API key que se
> venza, ni servicio que se caiga.
>
> El código se conserva por si algún día se quiere volver a un backend con
> LLM para preguntas abiertas. Las instrucciones de abajo son de esa versión.

El chat tiene dos partes:

- **Frontend** (`js/tm-bot.js`): la burbuja y el panel. Ya está en producción.
- **Backend** (`worker.js`): Cloudflare Worker que responde los mensajes.
  GitHub Pages es estático y no puede correr un servidor, por eso el backend
  va en Cloudflare (igual que el bot de Telegram).

> El archivo `index.ts` es la versión vieja que solo corría en el sandbox de
> desarrollo (usaba `z-ai-web-dev-sdk`). En producción se usa `worker.js`.

## Qué ya funciona sin hacer nada

Las **respuestas rápidas** (saludos, cómo comprar, envíos, tasa, categorías,
ofertas, garantía, devoluciones, horario, stock…) se resuelven sin LLM. Apenas
despliegues el Worker, eso funciona aunque no pongas API key.

Las **preguntas abiertas** ("¿qué batería me recomiendas para una casa?")
necesitan el LLM → requieren la API key de OpenRouter (modelos gratis).

## Pasos para activarlo (una sola vez)

1. **Instala wrangler** (si no lo tienes) y entra a la carpeta:
   ```bash
   cd mini-services/chat-bot
   npx wrangler login
   ```

2. **Despliega el Worker:**
   ```bash
   npx wrangler deploy
   ```
   Al terminar, wrangler imprime la URL, algo como:
   ```
   https://tiendamax-chat.TU-SUBDOMINIO.workers.dev
   ```
   Copia esa URL.

3. **(Opcional pero recomendado) Pon la API key de OpenRouter** para que
   responda preguntas abiertas con IA:
   ```bash
   npx wrangler secret put OPENROUTER_API_KEY
   ```
   Pega tu key de https://openrouter.ai (gratis, usa modelos `:free`).

4. **Conecta el frontend al Worker.** En `index.html`, busca:
   ```html
   <meta name="tm-bot-api" content="">
   ```
   y pon la URL del paso 2:
   ```html
   <meta name="tm-bot-api" content="https://tiendamax-chat.TU-SUBDOMINIO.workers.dev">
   ```
   Haz commit y push. Listo: la burbuja ya responde en tiendamax.org.

## Probar que el backend está vivo

```bash
curl https://tiendamax-chat.TU-SUBDOMINIO.workers.dev/api/health
# → {"ok":true,"productos":N,"categorias":M,"llm":true}
```

## Notas

- El catálogo se lee de `productos.json` publicado (cache 5 min). Cuando cambias
  productos, el bot se actualiza solo en ≤5 min.
- El historial corto de cada sesión se guarda en KV (1h). Es opcional.
- Si algún día quieres `/api/chat` directo en tiendamax.org (sin la URL larga),
  hay que proxiar el dominio por Cloudflare y añadir una ruta `tiendamax.org/api/*`
  al Worker. Con la URL del `meta` ya funciona sin eso.
