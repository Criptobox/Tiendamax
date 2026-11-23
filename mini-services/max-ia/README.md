# Max IA (intérprete de preguntas)

Cuando Max (el chat) no entiende un mensaje, el navegador le pregunta a este
Worker **qué quiso decir el cliente**. La IA solo devuelve
`{consulta, ids, fuera}`: una frase en vocabulario de tienda y hasta 3 ids de la
lista que el navegador le mandó. **Nunca contesta al cliente ni da precios o
stock**: eso sale del catálogo real, así que un modelo que se equivoca solo
puede señalar el producto equivocado (y cada id se valida contra la lista).

Respaldo en cadena: OpenRouter → Gemini → NVIDIA. Si uno falla, salta al
siguiente; si fallan todos, Max contesta como siempre (sin IA).

## Activarlo (una vez)

1. Crea las cuentas gratis y saca una clave de API de cada una
   (OpenRouter, Google AI Studio, NVIDIA Build). Con una basta; con varias hay respaldo.
2. En GitHub → Settings → Secrets and variables → Actions, crea:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y las claves que tengas:
   `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`
   (el workflow sube solo las que existan).
   **Las claves nunca se pegan en el chat ni se suben al repo.**
3. Ejecuta el workflow «Deploy Max IA». Imprime la URL del Worker.
4. Pon esa URL en `index.html` → `<meta name="tm-bot-ia" content="URL">`.
   Con el `content` vacío, Max no usa IA (es el interruptor).

Los modelos se pueden cambiar con las variables `OPENROUTER_MODEL`,
`GEMINI_MODEL`, `NVIDIA_MODEL`.
