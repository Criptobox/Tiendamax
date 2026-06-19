/**
 * Cloudflare Worker — Proxy seguro para el chat IA de TiendaMax
 *
 * CÓMO DESPLEGAR:
 * 1. Ve a https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Pega este código y guarda con el nombre "tm-chat"
 * 3. En la sección "Settings → Variables" agrega:
 *    - Variable: ANTHROPIC_API_KEY  (tipo Secret)
 *    - Valor: tu clave de Anthropic (sk-ant-...)
 * 4. La URL del worker será: https://tm-chat.TU_SUBDOMINIO.workers.dev
 * 5. Actualiza TM_PROXY_URL en index.html con esa URL
 */

export default {
  async fetch(request, env) {
    const ORIGIN = 'https://tiendamax.org';

    const cors = {
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Rechazar orígenes distintos a tiendamax.org
    const origin = request.headers.get('Origin') || '';
    if (origin !== ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
