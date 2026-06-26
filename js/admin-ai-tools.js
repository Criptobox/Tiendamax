// ═══════════════════════════════════════════════════════
// TiendaMax Admin AI Tools — IA modules v1-v15 — AQ prefix for Gemini
// Extraído de admin.html para reducir peso y facilitar mantenimiento.
// Cada módulo está encapsulado en su propio IIFE.
// ═══════════════════════════════════════════════════════

function tmIAFriendlyError(status, text='') {
  let msg = '';
  try { msg = JSON.parse(text).error?.message || text; } catch(e) { msg = text || ''; }
  if (status === 402 || /insufficient\s*balance|balance|credit|billing|quota/i.test(msg)) {
    return 'IA: saldo/créditos insuficientes. Recarga tu cuenta de IA o cambia a modo local; no es un error de TiendaMax.';
  }
  if (status === 401 || status === 403 || /invalid.*key|unauthorized|forbidden|api[_ ]?key/i.test(msg)) {
    return 'IA: API Key inválida o sin permiso. Revisa la clave guardada en Configuración.';
  }
  if (status === 429 || /rate limit|too many/i.test(msg)) {
    return 'IA: límite de uso temporal alcanzado. Espera un poco e intenta de nuevo.';
  }
  return 'IA HTTP ' + status + (msg ? ': ' + String(msg).slice(0, 140) : '');
}


function tmAIProviderInfo() {
  const key = localStorage.getItem('anthropicApiKey') || '';
  const provider = localStorage.getItem('anthropicApiProvider') || (key.startsWith('sk-or-') ? 'openrouter' : key.startsWith('sk-') ? 'deepseek' : '');
  return { key, provider };
}
function tmOpenRouterModel() {
  return localStorage.getItem('tmOpenRouterModel') || localStorage.getItem('tmOpenRouterModelWorking') || 'openrouter/free';
}
async function tmFetchAI(url, options = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e && (e.name === 'AbortError' || /abort/i.test(e.message || ''))) {
      throw new Error('La IA tardó demasiado en responder. Prueba de nuevo o usa otro proveedor/modelo.');
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
async function tmAIChat(prompt, opts = {}) {
  const { key, provider } = tmAIProviderInfo();
  const max_tokens = opts.max_tokens || 900;
  if (!key) throw new Error('No hay API Key configurada en Configuración → IA.');
  if (provider === 'openrouter' || key.startsWith('sk-or-')) {
    const configured = tmOpenRouterModel();
    const fallbackModels = [
      configured,
      'openrouter/free',
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat-v3:free',
      'qwen/qwen3-235b-a22b:free',
      'qwen/qwen3-30b-a3b:free',
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.3-70b-instruct:free'
    ].filter((m, i, a) => m && a.indexOf(m) === i);
    let lastErr = '';
    for (const model of fallbackModels) {
      const resp = await tmFetchAI('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
          'HTTP-Referer': location.origin || 'https://tiendamax.org',
          'X-Title': 'TiendaMax Admin'
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.65,
          max_tokens,
          messages: [
            { role: 'system', content: opts.system || 'Eres asistente ecommerce de TiendaMax en Cuba. Responde en español, claro, útil y sin inventar datos.' },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        try { localStorage.setItem('tmOpenRouterModelWorking', model); localStorage.setItem('tmOpenRouterLastModel', model); } catch(e) {}
        return (data.choices?.[0]?.message?.content || '').trim();
      }
      let t=''; try{t=await resp.text()}catch(e){}
      lastErr = tmIAFriendlyError(resp.status,t).replace('IA','OpenRouter') + ' [modelo: ' + model + ']';
      // Si el modelo no existe/no tiene endpoints, probar otro gratis automáticamente.
      if (!(resp.status === 404 || /no endpoints|not found|model/i.test(t))) break;
    }
    throw new Error(lastErr || 'OpenRouter: no se pudo usar ningún modelo gratuito configurado.');
  }
  if (provider === 'google' || key.startsWith('AIza') || key.startsWith('AQ')) {
    const models = ['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-flash-latest','gemini-1.5-flash'];
    let lastErr = '';
    for (const model of models) {
      const resp = await tmFetchAI('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          generationConfig: { temperature: opts.temperature ?? 0.65, maxOutputTokens: max_tokens },
          contents: [{ role: 'user', parts: [
            { text: (opts.system ? opts.system + '\n\n' : '') + prompt }
          ] }]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        try { localStorage.setItem('tmGoogleLastModel', model); } catch(e) {}
        return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
      }
      let t=''; try{t=await resp.text()}catch(e){}
      lastErr = 'Gemini HTTP ' + resp.status + (t ? ': ' + t.slice(0,140) : '') + ' [modelo: ' + model + ']';
      if (!(resp.status === 404 || resp.status === 400 || resp.status === 429)) break;
    }
    throw new Error(lastErr || 'Gemini: no se pudo usar ningún modelo gratuito.');
  }
  if (provider === 'groq' || key.startsWith('gsk_')) {
    const models = ['llama-3.1-8b-instant','llama-3.3-70b-versatile','gemma2-9b-it'];
    let lastErr = '';
    for (const model of models) {
      const resp = await tmFetchAI('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':'Bearer '+key},
        body: JSON.stringify({
          model, temperature: opts.temperature ?? 0.65, max_tokens,
          messages: [
            { role:'system', content: opts.system || 'Eres asistente ecommerce de TiendaMax en Cuba. Responde en español, claro, útil y sin inventar datos.' },
            { role:'user', content: prompt }
          ]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        try { localStorage.setItem('tmGroqLastModel', model); } catch(e) {}
        return (data.choices?.[0]?.message?.content || '').trim();
      }
      let t=''; try{t=await resp.text()}catch(e){}
      lastErr = 'Groq HTTP ' + resp.status + (t ? ': ' + t.slice(0,140) : '') + ' [modelo: ' + model + ']';
      if (!(resp.status === 404 || resp.status === 400)) break;
    }
    throw new Error(lastErr || 'Groq: no se pudo usar ningún modelo.');
  }

  if (provider === 'deepseek' || key.startsWith('sk-')) {
    const resp = await tmFetchAI('https://api.deepseek.com/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body: JSON.stringify({
        model:'deepseek-chat',
        temperature: opts.temperature ?? 0.65,
        max_tokens,
        messages:[
          {role:'system',content: opts.system || 'Eres asistente ecommerce de TiendaMax en Cuba. Responde en español, claro, útil y sin inventar datos.'},
          {role:'user',content:prompt}
        ]
      })
    });
    if(!resp.ok){let t='';try{t=await resp.text()}catch(e){};throw new Error(tmIAFriendlyError(resp.status,t));}
    const data=await resp.json();
    return (data.choices?.[0]?.message?.content||'').trim();
  }
  throw new Error('Proveedor IA no soportado. Usa OpenRouter (sk-or-), Gemini (AIza), Groq (gsk_) o IA (sk-).');
}
window.tmAIChat = tmAIChat;
window.tmOpenRouterModel = tmOpenRouterModel;


function tmExtractJsonObject(text) {
  text = String(text || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/,'').trim();
  // Busca objeto balanceado para tolerar texto antes/después del JSON.
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

// ── tm-deepseek-tools-v1 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function prodBySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function prodInfo(p){
    return [
      'Nombre: '+(p.nombre||p.name||'Producto'),
      'Descripción actual: '+(p.descripcion||'Sin descripción'),
      'Categoría: '+(p.categoria||'General'),
      'Subcategoría: '+(p.subcategoria||''),
      'Precio: $'+Number(p.precioActual||p.price||0).toFixed(2)+' USD',
      'Stock: '+Number(p.stock||0),
      p.garantia?('Garantía: '+p.garantia):'',
      p.comision?('Comisión: '+p.comision+' '+(p.comisionMoneda||'USD')):''
    ].filter(Boolean).join('\n');
  }
  function fallback(p, tipo){
    const name=p.nombre||p.name||'Producto TiendaMax';
    const desc=p.descripcion||'Disponible en TiendaMax.';
    const price=Number(p.precioActual||p.price||0).toFixed(2);
    const stock=Number(p.stock||0);
    if(tipo==='post') return `🔥 ${name}\n\n${desc}\n\n💵 $${price} USD\n📦 Stock: ${stock}\n📲 Escríbenos por WhatsApp para reservar.\n\n#TiendaMax #Cuba #${String(p.categoria||'oferta').replace(/\s+/g,'')}`;
    return `${name}\n\n${desc}\n\n💵 Precio: $${price} USD\n📦 Stock: ${stock}\n🏷️ Categoría: ${p.categoria||'General'}\n\nTexto vendedor:\n🔥 ${name} disponible ahora en TiendaMax. Ideal para quien busca calidad, utilidad y entrega coordinada. Escríbenos para reservar.`;
  }
  async function callIA(prompt){
    return tmAIChat(prompt, { max_tokens: 850 });
  }
  async function genAI(){
    const out=$('#tmToolOut'); if(!out) return;
    const p=prodBySelect('tmAiProd');
    const tono=$('#tmAiTone')?.value||'Premium vendedor';
    out.textContent='⏳ Generando con IA...';
    const prompt=`Crea textos para este producto de TiendaMax.\n\n${prodInfo(p)}\n\nTono/Formato: ${tono}.\n\nEntrega:\n1) Título mejorado corto.\n2) Descripción lista para la ficha del producto, 2-4 oraciones.\n3) Texto corto para WhatsApp.\n4) 5 beneficios en bullets.\n5) Hashtags útiles.\n\nNo inventes especificaciones no dadas.`;
    try{ out.textContent=await callIA(prompt); notify('✅ Texto generado con IA','success'); }
    catch(e){ out.textContent=fallback(p,'ai')+'\n\n⚠️ Nota: '+e.message+'. Usé plantilla local.'; notify('Plantilla local: configura la IA en Configuración','warning'); }
  }
  async function genPost(){
    const out=$('#tmToolOut'); if(!out) return;
    const p=prodBySelect('tmPostProd');
    const formato=$('#tmPostType')?.value||'Facebook grupo';
    out.textContent='⏳ Generando post con IA...';
    const prompt=`Genera una publicación lista para copiar.\n\nProducto:\n${prodInfo(p)}\n\nFormato: ${formato}.\n\nReglas:\n- Español natural para Cuba.\n- Usa emojis con moderación.\n- Incluye precio y stock si están disponibles.\n- Cierra con llamada a WhatsApp/reserva.\n- No prometas envíos ni garantía si no está indicado.\n- Si es Facebook grupo, hazlo corto y directo.`;
    try{ out.textContent=await callIA(prompt); notify('✅ Post generado con IA','success'); }
    catch(e){ out.textContent=fallback(p,'post')+'\n\n⚠️ Nota: '+e.message+'. Usé plantilla local.'; notify('Plantilla local: configura la IA en Configuración','warning'); }
  }
  document.addEventListener('click',function(e){
    const btn=e.target.closest('[data-act]'); if(!btn) return;
    if(!btn.closest('#herramientas')) return;
    const act=btn.dataset.act;
    if(act==='aiGen' || act==='postGen'){
      e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      if(act==='aiGen') genAI(); else genPost();
    }
  },true);
})();

// ── tm-deepseek-tools-v2 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function productOptions(){return products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||p.name||'Producto')} — $${Number(p.precioActual||p.price||0).toFixed(2)}</option>`).join('') || '<option value="">Sin productos</option>';}
  function bySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function productUrl(p){ return p && p.id ? `/p/producto-${p.id}.html` : '/'; }
  function prodInfo(p){
    return [
      'Nombre: '+(p.nombre||p.name||'Producto'),
      'Descripción: '+(p.descripcion||'Sin descripción'),
      'Categoría: '+(p.categoria||'General'),
      'Subcategoría: '+(p.subcategoria||''),
      'Precio: $'+Number(p.precioActual||p.price||0).toFixed(2)+' USD',
      'Stock: '+Number(p.stock||0),
      p.garantia?('Garantía: '+p.garantia):'',
      p.usado?'Producto usado/refurbished':'',
      p.devolucion?'Tiene devolución segura/garantía de satisfacción':''
    ].filter(Boolean).join('\n');
  }
  async function deepseek(prompt, max_tokens=750){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){
    const p=$('#tmToolPanel'); if(!p) return;
    p.className='tm-panel active';
    p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`;
    p.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIAExtraCards')) return;
    const div=document.createElement('div');
    div.id='tmIAExtraCards';
    div.innerHTML=`
      <div class="tm-tier"><h4>IA — SIGUIENTES PASOS</h4><span class="tm-tier-badge purple">IA conectada</span></div>
      <div class="tm-tools-grid">
        <div class="tm-tool-card enabled" data-tool="pushai"><span class="state">IA</span><div class="ico" style="background:rgba(245,158,11,.18)">🔔</div><h5>Push con IA</h5><p>Genera título, mensaje y URL de notificación desde un producto.</p></div>
        <div class="tm-tool-card enabled" data-tool="waai"><span class="state">IA</span><div class="ico" style="background:rgba(37,211,102,.18)">💬</div><h5>Respuesta WhatsApp</h5><p>Responde preguntas de clientes con tono vendedor y natural.</p></div>
      </div>`;
    const panel=$('#tmToolPanel');
    if(panel) wrap.insertBefore(div,panel); else wrap.appendChild(div);
  }
  function openPushAI(){
    panel('🔔 Generador IA de notificaciones push','IA crea un título y mensaje corto listo para enviar.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Producto</label><select id="tmPushAiProd">${productOptions()}</select></div>
        <div class="tm-field"><label>Tipo</label><select id="tmPushAiTone"><option>Producto nuevo</option><option>Oferta elegante</option><option>Urgencia suave</option><option>Últimas unidades</option><option>Vuelve a estar disponible</option></select></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds-act="pushGen">Generar push</button><button class="tm-btn gold" data-ds-act="pushApply">Aplicar en Configuración</button><button class="tm-btn" data-ds-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Genera una notificación para rellenar Título, Mensaje y URL.</div>`);
  }
  function openWaAI(){
    panel('💬 Respuestas WhatsApp con IA','Escribe la pregunta del cliente y IA genera una respuesta lista para copiar.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Producto relacionado</label><select id="tmWaAiProd">${productOptions()}</select></div>
        <div class="tm-field"><label>Tono</label><select id="tmWaAiTone"><option>Amable vendedor</option><option>Corto y directo</option><option>Cierre de venta</option><option>Técnico sencillo</option><option>Negociación educada</option></select></div>
      </div>
      <div class="tm-field"><label>Pregunta del cliente</label><textarea id="tmWaAiQ" style="min-height:90px" placeholder="Ej: ¿Tiene garantía? ¿Me lo puedes reservar? ¿Sirve para...? "></textarea></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds-act="waGen">Generar respuesta</button><button class="tm-btn" data-ds-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">La respuesta aparecerá aquí.</div>`);
  }
  async function genPush(){
    const out=$('#tmToolOut'); if(!out) return;
    const p=bySelect('tmPushAiProd'); const tipo=$('#tmPushAiTone')?.value||'Producto nuevo';
    out.textContent='⏳ Generando push con IA...';
    const prompt=`Crea una notificación push para TiendaMax.\n\nProducto:\n${prodInfo(p)}\nURL sugerida: ${productUrl(p)}\nTipo: ${tipo}\n\nResponde SOLO con JSON válido, sin markdown ni explicación:\n{"titulo":"máximo 38 caracteres","mensaje":"máximo 95 caracteres","url":"${productUrl(p)}"}\n\nNo uses comillas fuera del JSON.`;
    try{
      const text=await deepseek(prompt,350);
      const m=tmExtractJsonObject(text); if(!m) throw new Error('La IA no devolvió JSON limpio');
      const j=JSON.parse(m);
      out.dataset.pushTitle=j.titulo||''; out.dataset.pushBody=j.mensaje||''; out.dataset.pushUrl=j.url||productUrl(p);
      out.textContent=`Título: ${j.titulo}\nMensaje: ${j.mensaje}\nURL: ${j.url||productUrl(p)}`;
      notify('✅ Push generado','success');
    }catch(e){
      const title='🔥 '+(p.nombre||'Nuevo producto').slice(0,28);
      const body=`Disponible en TiendaMax. ${Number(p.stock||0)>0?'Stock limitado. ':' '}Escríbenos para reservar.`.slice(0,95);
      out.dataset.pushTitle=title; out.dataset.pushBody=body; out.dataset.pushUrl=productUrl(p);
      out.textContent=`Título: ${title}\nMensaje: ${body}\nURL: ${productUrl(p)}\n\n⚠️ ${e.message}`;
      notify('Push generado con plantilla local','warning');
    }
  }
  function applyPush(){
    const out=$('#tmToolOut'); if(!out) return;
    const title=out.dataset.pushTitle||''; const body=out.dataset.pushBody||''; const url=out.dataset.pushUrl||'';
    if(!title||!body){ notify('Primero genera el push','warning'); return; }
    if(typeof switchTab==='function') switchTab('configuracion');
    setTimeout(()=>{
      const t=$('#manualPushTitle'), b=$('#manualPushBody'), u=$('#manualPushUrl');
      if(t) t.value=title; if(b) b.value=body; if(u) u.value=url;
      notify('✅ Push aplicado en Configuración','success');
      t?.focus();
    },250);
  }
  async function genWa(){
    const out=$('#tmToolOut'); if(!out) return;
    const p=bySelect('tmWaAiProd'); const tono=$('#tmWaAiTone')?.value||'Amable vendedor'; const q=$('#tmWaAiQ')?.value.trim()||'El cliente pide información del producto.';
    out.textContent='⏳ Generando respuesta con IA...';
    const link=`https://tiendamax.org/p/${p.id}.html`;
    const prompt=`Genera una respuesta de WhatsApp para un cliente.\n\nProducto:\n${prodInfo(p)}\nEnlace directo: ${link}\n\nPregunta del cliente:\n${q}\n\nTono: ${tono}.\n\nReglas: respuesta breve y natural, incluye el enlace al final, cierra invitando a reservar. No inventes garantía ni envío. Si falta un dato, pide confirmación.`;
    try{ out.textContent=await deepseek(prompt,600); notify('✅ Respuesta generada','success'); }
    catch(e){ out.textContent=`Hola 👋 Sí, te comento sobre ${p.nombre||'ese producto'}.\n\n${p.descripcion||'Está disponible en TiendaMax.'}\n\n💵 Precio: $${Number(p.precioActual||0).toFixed(2)} USD\n📦 Stock: ${Number(p.stock||0)}\n\nSi quieres, te lo puedo reservar y coordinamos por aquí.\n\n⚠️ ${e.message}`; notify('Respuesta con plantilla local','warning'); }
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="pushai"],[data-tool="waai"]');
    if(tool){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation&&e.stopImmediatePropagation(); tool.dataset.tool==='pushai'?openPushAI():openWaAI(); return; }
    const a=e.target.closest('[data-ds-act]'); if(!a) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.dsAct;
    if(act==='pushGen') genPush();
    if(act==='pushApply') applyPush();
    if(act==='waGen') genWa();
    if(act==='copyOut'){ navigator.clipboard?.writeText($('#tmToolOut')?.textContent||''); notify('Copiado','success'); }
  },true);
  function boot(){ addCards(); }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,900));
  document.addEventListener('click',e=>{ if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300); });
})();

// ── tm-deepseek-tools-v3 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  function productOptions(){return products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||p.name||'Producto')} — stock ${Number(p.stock||0)} — $${Number(p.precioActual||p.price||0).toFixed(2)}</option>`).join('') || '<option value="">Sin productos</option>';}
  function bySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function prodInfo(p){
    return [
      'ID: '+(p.id||''),
      'Nombre: '+(p.nombre||p.name||'Producto'),
      'Descripción: '+(p.descripcion||'Sin descripción'),
      'Categoría: '+(p.categoria||'General'),
      'Subcategoría: '+(p.subcategoria||''),
      'Precio actual: '+Number(p.precioActual||p.price||0).toFixed(2)+' USD',
      'Precio original: '+(p.precioOriginal||''),
      'Stock: '+Number(p.stock||0),
      'Imagen: '+(p.imagen?'sí':'no'),
      'Galería: '+((p.imagenes&&p.imagenes.length)||0),
      p.garantia?('Garantía: '+p.garantia):'Garantía: no indicada',
      p.usado?'Usado/refurbished: sí':'Usado/refurbished: no',
      p.devolucion?'Devolución segura: sí':'Devolución segura: no'
    ].join('\n');
  }
  async function deepseek(prompt, max_tokens=1000){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){
    const p=$('#tmToolPanel'); if(!p) return;
    p.className='tm-panel active';
    p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`;
    p.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIAAuditCards')) return;
    const div=document.createElement('div'); div.id='tmIAAuditCards';
    div.innerHTML=`
      <div class="tm-tier"><h4>IA — OPTIMIZACIÓN</h4><span class="tm-tier-badge gold">Auditoría</span></div>
      <div class="tm-tools-grid">
        <div class="tm-tool-card enabled" data-tool="auditai"><span class="state">IA</span><div class="ico" style="background:rgba(231,76,60,.16)">🕵️</div><h5>Auditor IA de producto</h5><p>Detecta errores, datos faltantes y oportunidades de mejora antes de publicar.</p></div>
        <div class="tm-tool-card enabled" data-tool="insightsai"><span class="state">IA</span><div class="ico" style="background:rgba(52,152,219,.18)">📊</div><h5>Resumen IA de ventas</h5><p>Analiza ventas, stock y analytics para recomendar qué publicar hoy.</p></div>
      </div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openAudit(){
    panel('🕵️ Auditor IA de producto','Revisa un producto y te dice qué arreglar para vender mejor.',`
      <div class="tm-field"><label>Producto a revisar</label><select id="tmAuditProd">${productOptions()}</select></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds3-act="auditRun">Auditar producto</button><button class="tm-btn" data-ds3-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Selecciona un producto y ejecuta la auditoría.</div>`);
  }
  function openInsights(){
    panel('📊 Resumen inteligente de ventas y analytics','IA analiza datos locales/Firebase y propone acciones concretas.',`
      <div class="tm-actions"><button class="tm-btn primary" data-ds3-act="insightsRun">Generar resumen IA</button><button class="tm-btn gold" data-ds3-act="insightsPush">Crear idea de push</button><button class="tm-btn" data-ds3-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Pulsa generar para analizar productos, ventas, stock y métricas disponibles.</div>`);
  }
  function localAudit(p){
    const issues=[];
    if(!(p.nombre||'').trim() || (p.nombre||'').length<8) issues.push('Nombre muy corto o poco descriptivo.');
    if(!(p.descripcion||'').trim() || (p.descripcion||'').length<60) issues.push('Descripción débil: agrega beneficios, uso y condición.');
    if(!Number(p.precioActual||0)) issues.push('Falta precio actual.');
    if(!p.categoria) issues.push('Falta categoría.');
    if(!p.imagen) issues.push('Falta imagen principal.');
    if(Number(p.stock||0)<=0) issues.push('Stock en cero: revisar si debe estar agotado o reponer.');
    if(!p.garantia) issues.push('Garantía no indicada: si aplica, agrégala para generar confianza.');
    return `Auditoría local para: ${p.nombre||'Producto'}\n\nProblemas detectados:\n${issues.length?issues.map(x=>'• '+x).join('\n'):'• No veo problemas críticos.'}\n\nMejoras sugeridas:\n• Título claro con tipo/modelo/beneficio.\n• Descripción en 2-4 oraciones con uso real.\n• Añade foto limpia y datos de garantía si aplica.\n• Publica en redes si tiene stock disponible.`;
  }
  async function runAudit(){
    const out=$('#tmToolOut'); if(!out) return; const p=bySelect('tmAuditProd');
    out.textContent='⏳ Auditando con IA...';
    const prompt=`Audita este producto antes de publicarlo.\n\n${prodInfo(p)}\n\nEntrega en secciones:\n1) Estado general: Bueno/Regular/Crítico.\n2) Problemas o riesgos detectados.\n3) Datos que faltan.\n4) Descripción mejorada sugerida.\n5) Categoría/subcategoría sugerida si ves inconsistencia.\n6) Acción recomendada hoy: publicar, corregir, reponer o archivar.\n\nSé directo y práctico.`;
    try{ out.textContent=await deepseek(prompt,1000); notify('✅ Auditoría generada','success'); }
    catch(e){ out.textContent=localAudit(p)+'\n\n⚠️ '+e.message; notify('Auditoría local: configura la IA para análisis avanzado','warning'); }
  }
  async function collectAnalytics(){
    let fb={vistas:{},whatsapp:{},suscriptores:0};
    try{ if(typeof tmLeerAnalytics==='function') fb=await tmLeerAnalytics(); }catch(e){}
    return fb;
  }
  function buildSummaryPayload(fb){
    const ps=products(); const vs=ventas();
    const low=ps.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3).slice(0,10).map(p=>`${p.nombre} (${p.stock})`);
    const empty=ps.filter(p=>Number(p.stock||0)<=0).slice(0,10).map(p=>p.nombre);
    const topStock=ps.slice().sort((a,b)=>Number(b.stock||0)-Number(a.stock||0)).slice(0,8).map(p=>`${p.nombre}: stock ${p.stock}, $${Number(p.precioActual||0).toFixed(2)}`);
    const recent=vs.slice(0,12).map(v=>`${v.fecha||v.id}: ${v.producto} x${v.cantidad||1} total $${Number(v.total||0).toFixed(2)}`);
    const vistas=Object.entries(fb.vistas||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,10).map(([id,n])=>{const p=ps.find(x=>String(x.id)===String(id)); return `${p?p.nombre:id}: ${n} vistas`;});
    const wa=Object.entries(fb.whatsapp||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,10).map(([id,n])=>{const p=ps.find(x=>String(x.id)===String(id)); return `${p?p.nombre:id}: ${n} WhatsApp`;});
    return {totalProductos:ps.length,ventasCount:vs.length,totalVentas:vs.reduce((s,v)=>s+Number(v.total||0),0),suscriptores:fb.suscriptores||0,stockBajo:low,agotados:empty,topStock,ventasRecientes:recent,topVistas:vistas,topWhatsApp:wa};
  }
  async function runInsights(pushOnly=false){
    const out=$('#tmToolOut'); if(!out) return;
    out.textContent='⏳ Leyendo datos y consultando IA...';
    const fb=await collectAnalytics(); const payload=buildSummaryPayload(fb);
    const prompt=pushOnly?
      `Con estos datos de TiendaMax, propone UNA campaña push para hoy.\n\n${JSON.stringify(payload,null,2)}\n\nEntrega SOLO:\nTítulo:\nMensaje:\nProducto recomendado:\nMotivo:`:
      `Analiza estos datos de TiendaMax y genera un resumen ejecutivo.\n\n${JSON.stringify(payload,null,2)}\n\nEntrega:\n1) Resumen de situación.\n2) 5 acciones recomendadas para hoy.\n3) Productos que conviene publicar.\n4) Productos a reponer/archivar.\n5) Ideas de oferta o push.\n6) Riesgos detectados.\nSé concreto.`;
    try{ out.textContent=await deepseek(prompt,1200); notify('✅ Resumen IA generado','success'); }
    catch(e){
      out.textContent=`Resumen local\n\nProductos: ${payload.totalProductos}\nVentas registradas: ${payload.ventasCount}\nTotal vendido: $${payload.totalVentas.toFixed(2)}\nSuscriptores: ${payload.suscriptores}\n\nStock bajo:\n${payload.stockBajo.map(x=>'• '+x).join('\n')||'• Sin alertas'}\n\nAgotados:\n${payload.agotados.map(x=>'• '+x).join('\n')||'• Sin agotados'}\n\nRecomendación: publica productos con buen stock, repón agotados y usa push para productos con visitas/WhatsApp.\n\n⚠️ ${e.message}`;
      notify('Resumen local: configura la IA para recomendaciones avanzadas','warning');
    }
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="auditai"],[data-tool="insightsai"]');
    if(tool){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation&&e.stopImmediatePropagation(); tool.dataset.tool==='auditai'?openAudit():openInsights(); return; }
    const a=e.target.closest('[data-ds3-act]'); if(!a) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds3Act;
    if(act==='auditRun') runAudit();
    if(act==='insightsRun') runInsights(false);
    if(act==='insightsPush') runInsights(true);
    if(act==='copyOut'){ navigator.clipboard?.writeText($('#tmToolOut')?.textContent||''); notify('Copiado','success'); }
  },true);
  function boot(){ addCards(); }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1000));
  document.addEventListener('click',e=>{ if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300); });
})();

// ── tm-deepseek-tools-v4 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function productOptions(){return products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||p.name||'Producto')} — ${esc(p.categoria||'General')}</option>`).join('') || '<option value="">Sin productos</option>';}
  function bySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function slugify(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70); }
  function prodInfo(p){return `Nombre: ${p.nombre||p.name||''}\nDescripción: ${p.descripcion||''}\nCategoría: ${p.categoria||'General'}\nSubcategoría: ${p.subcategoria||''}\nPrecio: $${Number(p.precioActual||p.price||0).toFixed(2)} USD\nStock: ${Number(p.stock||0)}\nGarantía: ${p.garantia||'no indicada'}`;}
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIASeoCards')) return;
    const div=document.createElement('div'); div.id='tmIASeoCards';
    div.innerHTML=`<div class="tm-tier"><h4>IA — SEO Y COMPARTIR</h4><span class="tm-tier-badge">Visibilidad</span></div>
    <div class="tm-tools-grid">
      <div class="tm-tool-card enabled" data-tool="seoai"><span class="state">IA</span><div class="ico" style="background:rgba(46,204,113,.18)">🔎</div><h5>SEO automático</h5><p>Genera meta title, description, keywords, slug y texto para compartir.</p></div>
    </div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openSEO(){
    panel('🔎 SEO automático con IA','Genera y guarda metadatos para mejorar cómo se comparte cada producto.',`
      <div class="tm-field"><label>Producto</label><select id="tmSeoProd">${productOptions()}</select></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds4-act="seoGen">Generar SEO</button><button class="tm-btn gold" data-ds4-act="seoApply">Guardar en producto</button><button class="tm-btn" data-ds4-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Genera SEO para ver el resultado. Se guardará dentro del producto como campos seoTitle, seoDescription, seoKeywords, slug y shareText.</div>`);
  }
  function localSEO(p){
    const name=p.nombre||'Producto TiendaMax'; const cat=p.categoria||'General'; const price=Number(p.precioActual||0);
    return {seoTitle:`${name} en TiendaMax`,seoDescription:`Compra ${name} en TiendaMax. ${cat}${price?' desde $'+price.toFixed(2)+' USD':''}. Consulta disponibilidad y reserva por WhatsApp.`,seoKeywords:[name,cat,'TiendaMax','Cuba','comprar online'].filter(Boolean),slug:slugify(name),shareText:`🔥 ${name}\n${price?'💵 $'+price.toFixed(2)+' USD\n':''}Disponible en TiendaMax. Escríbenos para reservar.`};
  }
  async function genSEO(){
    const out=$('#tmToolOut'); if(!out) return; const p=bySelect('tmSeoProd'); out.textContent='⏳ Generando SEO con IA...';
    const prompt=`Genera SEO para este producto.\n\n${prodInfo(p)}\n\nResponde SOLO JSON válido con esta forma exacta, sin markdown ni explicación:\n{"seoTitle":"máximo 60 caracteres","seoDescription":"máximo 155 caracteres","seoKeywords":["5 a 8 keywords"],"slug":"url-amigable-sin-acentos","shareText":"texto corto para compartir por WhatsApp/Facebook"}\n\nNo inventes especificaciones.`;
    try{
      const text=await deepseek(prompt); const m=tmExtractJsonObject(text); if(!m) throw new Error('La IA no devolvió JSON limpio');
      const j=JSON.parse(m); j.slug=slugify(j.slug||p.nombre); if(!Array.isArray(j.seoKeywords)) j.seoKeywords=String(j.seoKeywords||'').split(',').map(x=>x.trim()).filter(Boolean);
      out.dataset.seo=JSON.stringify(j); out.textContent=JSON.stringify(j,null,2); notify('✅ SEO generado','success');
    }catch(e){ const j=localSEO(p); out.dataset.seo=JSON.stringify(j); out.textContent=JSON.stringify(j,null,2)+'\n\n⚠️ '+e.message; notify('SEO local generado','warning'); }
  }
  function applySEO(){
    const out=$('#tmToolOut'); if(!out||!out.dataset.seo){notify('Primero genera el SEO','warning');return;}
    const val=$('#tmSeoProd')?.value; const ps=products(); const idx=ps.findIndex(p=>String(p.id)===String(val)); if(idx<0){notify('Producto no encontrado','error');return;}
    let seo; try{seo=JSON.parse(out.dataset.seo)}catch(e){notify('SEO inválido','error');return;}
    ps[idx]={...ps[idx],seoTitle:seo.seoTitle||'',seoDescription:seo.seoDescription||'',seoKeywords:seo.seoKeywords||[],slug:seo.slug||slugify(ps[idx].nombre),shareText:seo.shareText||''};
    saveProducts(ps); try{ if(typeof marcarProductoModificado==='function') marcarProductoModificado(ps[idx].id); }catch(e){}
    notify('✅ SEO guardado en el producto. Pulsa Actualizar tienda para subirlo.','success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="seoai"]'); if(tool){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation&&e.stopImmediatePropagation(); openSEO(); return; }
    const a=e.target.closest('[data-ds4-act]'); if(!a) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds4Act; if(act==='seoGen') genSEO(); if(act==='seoApply') applySEO(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||''); notify('Copiado','success');}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1100));
  document.addEventListener('click',e=>{ if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300); });
})();

// ── tm-deepseek-tools-v5 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function productOptions(){return products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||p.name||'Producto')} — ${esc(p.categoria||'General')} — $${Number(p.precioActual||0).toFixed(2)}</option>`).join('') || '<option value="">Sin productos</option>';}
  function bySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function info(p){return `ID: ${p.id}\nNombre: ${p.nombre||''}\nDescripción: ${p.descripcion||''}\nCategoría: ${p.categoria||'General'}\nSubcategoría: ${p.subcategoria||''}\nPrecio: $${Number(p.precioActual||0).toFixed(2)} USD\nStock: ${Number(p.stock||0)}`;}
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIARecCards')) return;
    const div=document.createElement('div'); div.id='tmIARecCards';
    div.innerHTML=`<div class="tm-tier"><h4>IA — VENTAS CRUZADAS</h4><span class="tm-tier-badge purple">Upsell</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="recsai"><span class="state">IA</span><div class="ico" style="background:rgba(255,107,53,.18)">🧲</div><h5>Recomendador IA</h5><p>Elige productos relacionados, bundles y texto de upsell para aumentar ventas.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openRecs(){
    panel('🧲 Recomendador IA de productos','Guarda productos complementarios para mostrarlos en detalle y carrito.',`
      <div class="tm-field"><label>Producto principal</label><select id="tmRecProd">${productOptions()}</select></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds5-act="recGen">Generar recomendaciones</button><button class="tm-btn gold" data-ds5-act="recApply">Guardar en producto</button><button class="tm-btn" data-ds5-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Genera recomendaciones. Se guardarán como recomendados, bundleText y upsellText.</div>`);
  }
  function localRecs(target){
    const ps=products();
    const same=ps.filter(p=>p.id!==target.id&&p.categoria===target.categoria&&Number(p.stock||0)>0).slice(0,4);
    const other=ps.filter(p=>p.id!==target.id&&p.categoria!==target.categoria&&Number(p.stock||0)>0).slice(0,2);
    const recs=[...same,...other].slice(0,4);
    return {recomendados:recs.map(p=>p.id),bundleText:`Combina ${target.nombre||'este producto'} con accesorios o productos relacionados para aprovechar mejor tu compra.`,upsellText:'También puedes revisar estos productos complementarios antes de reservar.',whatsappUpsell:`Si quieres, también te puedo mostrar opciones relacionadas con ${target.nombre||'ese producto'} para que elijas mejor.`};
  }
  async function genRecs(){
    const out=$('#tmToolOut'); if(!out)return; const target=bySelect('tmRecProd'); out.textContent='⏳ Generando recomendaciones con IA...';
    const candidates=products().filter(p=>p.id!==target.id&&Number(p.stock||0)>0).slice(0,60).map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria,precio:p.precioActual,stock:p.stock,descripcion:String(p.descripcion||'').slice(0,140)}));
    const prompt=`Producto principal:\n${info(target)}\n\nCandidatos disponibles en JSON:\n${JSON.stringify(candidates,null,2)}\n\nElige hasta 4 productos complementarios reales. Responde SOLO JSON válido, sin markdown, sin explicación:\n{"recomendados":[ids reales],"bundleText":"frase corta para sección relacionados","upsellText":"frase corta visible en detalle","whatsappUpsell":"mensaje breve para ofrecer productos relacionados por WhatsApp"}\n\nReglas: usa solo IDs de candidatos, prioriza utilidad complementaria y stock disponible. No recomiendes el mismo producto.`;
    try{
      const text=await deepseek(prompt); const m=tmExtractJsonObject(text); if(!m) throw new Error('La IA no devolvió JSON limpio');
      const j=JSON.parse(m);
      const valid=new Set(candidates.map(c=>String(c.id)));
      j.recomendados=(j.recomendados||[]).map(String).filter(id=>valid.has(id)).slice(0,4);
      out.dataset.recs=JSON.stringify(j); out.textContent=JSON.stringify(j,null,2); notify('✅ Recomendaciones generadas','success');
    }catch(e){ const j=localRecs(target); out.dataset.recs=JSON.stringify(j); out.textContent=JSON.stringify(j,null,2)+'\n\n⚠️ '+e.message; notify('Recomendaciones locales generadas','warning'); }
  }
  function applyRecs(){
    const out=$('#tmToolOut'); if(!out||!out.dataset.recs){notify('Primero genera recomendaciones','warning');return;}
    const val=$('#tmRecProd')?.value; const ps=products(); const idx=ps.findIndex(p=>String(p.id)===String(val)); if(idx<0){notify('Producto no encontrado','error');return;}
    let j; try{j=JSON.parse(out.dataset.recs)}catch(e){notify('JSON inválido','error');return;}
    ps[idx]={...ps[idx],recomendados:(j.recomendados||[]).map(x=>isNaN(Number(x))?x:Number(x)),bundleText:j.bundleText||'',upsellText:j.upsellText||'',whatsappUpsell:j.whatsappUpsell||''};
    saveProducts(ps); try{ if(typeof marcarProductoModificado==='function') marcarProductoModificado(ps[idx].id); }catch(e){}
    notify('✅ Recomendaciones guardadas. Pulsa Actualizar tienda para subirlas.','success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="recsai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openRecs();return;}
    const a=e.target.closest('[data-ds5-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds5Act; if(act==='recGen') genRecs(); if(act==='recApply') applyRecs(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1200));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v6 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function cats(){ return [...new Set(products().map(p=>p.categoria||'General').filter(Boolean))].sort(); }
  function catOptions(){ return '<option value="">Todas</option>'+cats().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
  function slugify(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70); }
  function prodInfo(p){return `ID: ${p.id}\nNombre: ${p.nombre||''}\nDescripción: ${p.descripcion||''}\nCategoría: ${p.categoria||'General'}\nSubcategoría: ${p.subcategoria||''}\nPrecio: $${Number(p.precioActual||0).toFixed(2)} USD\nStock: ${Number(p.stock||0)}\nGarantía: ${p.garantia||'no indicada'}`;}
  function localSEO(p){const name=p.nombre||'Producto TiendaMax', cat=p.categoria||'General', price=Number(p.precioActual||0);return {seoTitle:`${name} en TiendaMax`.slice(0,60),seoDescription:`Compra ${name} en TiendaMax. ${cat}${price?' desde $'+price.toFixed(2)+' USD':''}. Consulta disponibilidad por WhatsApp.`.slice(0,155),seoKeywords:[name,cat,'TiendaMax','Cuba','comprar online'].filter(Boolean),slug:slugify(name),shareText:`🔥 ${name}\n${price?'💵 $'+price.toFixed(2)+' USD\n':''}Disponible en TiendaMax. Escríbenos para reservar.`};}
  function localRecs(target, ps){const same=ps.filter(p=>p.id!==target.id&&p.categoria===target.categoria&&Number(p.stock||0)>0).slice(0,4);const other=ps.filter(p=>p.id!==target.id&&p.categoria!==target.categoria&&Number(p.stock||0)>0).slice(0,2);const recs=[...same,...other].slice(0,4);return {recomendados:recs.map(p=>p.id),bundleText:`Combina ${target.nombre||'este producto'} con productos relacionados para aprovechar mejor tu compra.`,upsellText:'También puedes revisar estas opciones complementarias antes de reservar.',whatsappUpsell:`Si quieres, también te puedo mostrar opciones relacionadas con ${target.nombre||'ese producto'}.`};}
  async function deepseek(prompt,max_tokens=650){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIABulkCards')) return;
    const div=document.createElement('div'); div.id='tmIABulkCards';
    div.innerHTML=`<div class="tm-tier"><h4>IA — AUTOMATIZACIÓN MASIVA</h4><span class="tm-tier-badge gold">Batch</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="bulkai"><span class="state">IA</span><div class="ico" style="background:rgba(155,89,182,.18)">⚙️</div><h5>IA masiva</h5><p>Aplica SEO, auditoría o recomendaciones a varios productos en lote controlado.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openBulk(){
    panel('⚙️ IA masiva por lotes','Procesa pocos productos por tanda para controlar costo y revisar resultados.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Tarea</label><select id="tmBulkTask"><option value="seo_missing">SEO a productos sin SEO</option><option value="seo_all">Regenerar SEO</option><option value="recs_missing">Recomendaciones sin configurar</option><option value="audit_report">Reporte de auditoría</option></select></div>
        <div class="tm-field"><label>Categoría</label><select id="tmBulkCat">${catOptions()}</select></div>
        <div class="tm-field"><label>Límite por tanda</label><input id="tmBulkLimit" type="number" min="1" max="20" value="5"></div>
        <div class="tm-field"><label>Modo</label><select id="tmBulkMode"><option value="deepseek">IA si está configurada</option><option value="local">Solo local / sin API</option></select></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds6-act="bulkPreview">Vista previa</button><button class="tm-btn gold" data-ds6-act="bulkRun">Ejecutar lote</button><button class="tm-btn gold" data-ds6-act="bulkRunAll">Auto 5 en 5</button><button class="tm-btn" data-ds6-act="copyOut">Copiar log</button></div>
      <div class="tm-note">Consejo: ‘Auto 5 en 5’ procesa todas las tandas pendientes y al final solo tienes que pulsar “Actualizar tienda”.</div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Elige tarea y pulsa Vista previa.</div>`);
  }
  function selectTargets(excludeSet=new Set()){
    const ps=products(); const task=$('#tmBulkTask')?.value||'seo_missing'; const cat=$('#tmBulkCat')?.value||''; const limit=Math.max(1,Math.min(20,Number($('#tmBulkLimit')?.value)||5));
    let arr=ps.filter(p=>(!cat || (p.categoria||'General')===cat) && !excludeSet.has(String(p.id)));
    if(task==='seo_missing') arr=arr.filter(p=>!p.seoTitle && !p.seoDescription);
    if(task==='recs_missing') arr=arr.filter(p=>!Array.isArray(p.recomendados)||!p.recomendados.length);
    if(task==='audit_report') arr=arr.filter(p=>!(p.descripcion||'').trim() || (p.descripcion||'').length<80 || !p.imagen || !Number(p.precioActual||0) || Number(p.stock||0)<=0);
    return arr.slice(0,limit);
  }
  function preview(){
    const out=$('#tmToolOut'), targets=selectTargets(); if(!out)return;
    out.textContent=`Productos seleccionados: ${targets.length}\n\n`+targets.map((p,i)=>`${i+1}. ${p.nombre} · ${p.categoria||'General'} · stock ${p.stock||0}`).join('\n')+(targets.length?'':'No hay productos pendientes para esta tarea.');
  }
  async function genSEO(p,useAI){
    if(!useAI) return localSEO(p);
    const prompt=`Genera SEO para este producto.\n\n${prodInfo(p)}\n\nResponde SOLO JSON válido, sin markdown, sin explicación:\n{"seoTitle":"máximo 60 caracteres","seoDescription":"máximo 155 caracteres","seoKeywords":["5 a 8 keywords"],"slug":"url-amigable-sin-acentos","shareText":"texto corto para compartir"}`;
    const text=await deepseek(prompt,550); const m=tmExtractJsonObject(text); if(!m) throw new Error('JSON SEO no encontrado');
    const j=JSON.parse(m); j.slug=slugify(j.slug||p.nombre); if(!Array.isArray(j.seoKeywords)) j.seoKeywords=String(j.seoKeywords||'').split(',').map(x=>x.trim()).filter(Boolean); return j;
  }
  async function genRecs(p,ps,useAI){
    if(!useAI) return localRecs(p,ps);
    const candidates=ps.filter(x=>x.id!==p.id&&Number(x.stock||0)>0).slice(0,50).map(x=>({id:x.id,nombre:x.nombre,categoria:x.categoria,precio:x.precioActual,stock:x.stock,descripcion:String(x.descripcion||'').slice(0,100)}));
    const prompt=`Producto principal:\n${prodInfo(p)}\n\nCandidatos:\n${JSON.stringify(candidates)}\n\nElige hasta 4 complementarios. Responde SOLO JSON:\n{"recomendados":[ids reales],"bundleText":"frase corta","upsellText":"frase corta","whatsappUpsell":"mensaje breve"}`;
    const text=await deepseek(prompt,700); const m=tmExtractJsonObject(text); if(!m) throw new Error('JSON recomendaciones no encontrado');
    const j=JSON.parse(m); const valid=new Set(candidates.map(c=>String(c.id))); j.recomendados=(j.recomendados||[]).map(String).filter(id=>valid.has(id)).slice(0,4).map(id=>isNaN(Number(id))?id:Number(id)); return j;
  }
  function auditLine(p){const issues=[]; if(!(p.nombre||'').trim()||(p.nombre||'').length<8)issues.push('nombre flojo'); if(!(p.descripcion||'').trim()||(p.descripcion||'').length<80)issues.push('descripción corta'); if(!p.imagen)issues.push('sin imagen'); if(!Number(p.precioActual||0))issues.push('sin precio'); if(Number(p.stock||0)<=0)issues.push('sin stock'); if(!p.garantia)issues.push('sin garantía indicada'); return `${p.nombre}: ${issues.length?issues.join(', '):'OK'}`;}
  async function processTargets(targets, ps, task, useAI, out, log, offset=0){
    for(let i=0;i<targets.length;i++){
      const p=targets[i]; const idx=ps.findIndex(x=>String(x.id)===String(p.id)); if(idx<0) continue;
      out.textContent=`⏳ Procesando ${offset+i+1}: ${p.nombre}\n\n`+log.slice(-18).join('\n');
      try{
        if(task==='seo_missing'||task==='seo_all'){
          const seo=await genSEO(ps[idx],useAI); ps[idx]={...ps[idx],seoTitle:seo.seoTitle||'',seoDescription:seo.seoDescription||'',seoKeywords:seo.seoKeywords||[],slug:seo.slug||slugify(ps[idx].nombre),shareText:seo.shareText||''};
          log.push(`✅ SEO: ${p.nombre}`);
        }else if(task==='recs_missing'){
          const r=await genRecs(ps[idx],ps,useAI); ps[idx]={...ps[idx],recomendados:r.recomendados||[],bundleText:r.bundleText||'',upsellText:r.upsellText||'',whatsappUpsell:r.whatsappUpsell||''};
          log.push(`✅ Recs: ${p.nombre}`);
        }
        try{ if(typeof marcarProductoModificado==='function') marcarProductoModificado(ps[idx].id); }catch(e){}
        if(useAI) await sleep(450);
      }catch(e){
        log.push(`🟡 ${p.nombre}: la IA no entregó JSON limpio — usando local`);
        if(task==='seo_missing'||task==='seo_all'){const seo=localSEO(ps[idx]); ps[idx]={...ps[idx],...seo};}
        if(task==='recs_missing'){const r=localRecs(ps[idx],ps); ps[idx]={...ps[idx],...r};}
      }
    }
    return ps;
  }
  async function run(){
    const out=$('#tmToolOut'); if(!out)return; const task=$('#tmBulkTask')?.value||'seo_missing'; const mode=$('#tmBulkMode')?.value||'deepseek'; const useAI=mode==='deepseek';
    const targets=selectTargets(); if(!targets.length){out.textContent='No hay productos para procesar.'; return;}
    let ps=products(); const log=[]; out.textContent='⏳ Iniciando lote...';
    if(task==='audit_report'){
      out.textContent='REPORTE DE AUDITORÍA\n\n'+targets.map(auditLine).join('\n'); notify('Reporte generado','success'); return;
    }
    ps=await processTargets(targets,ps,task,useAI,out,log,0);
    saveProducts(ps); out.textContent=`✅ Lote terminado. Productos procesados: ${targets.length}\n\n${log.join('\n')}\n\nAhora pulsa “Actualizar tienda” para subir productos.json.`; notify('✅ Lote IA terminado','success');
  }
  async function runAll(){
    const out=$('#tmToolOut'); if(!out)return; const task=$('#tmBulkTask')?.value||'seo_missing'; const mode=$('#tmBulkMode')?.value||'deepseek'; const useAI=mode==='deepseek';
    if(task==='seo_all' || task==='audit_report'){
      notify('Auto 5 en 5 solo aplica para pendientes: SEO sin SEO o Recomendaciones sin configurar.','warning');
      return run();
    }
    if(!confirm('¿Procesar automáticamente todas las tandas pendientes? Se guardará localmente y al final debes pulsar “Actualizar tienda”.')) return;
    let total=0, batch=0, log=[];
    const processedIds = new Set();
    while(true){
      const targets=selectTargets(processedIds);
      if(!targets.length) break;
      batch++;
      let ps=products();
      out.textContent=`⏳ Tanda ${batch} — ${targets.length} producto(s). Procesados hasta ahora: ${total}\n\n`+log.slice(-18).join('\n');
      ps=await processTargets(targets,ps,task,useAI,out,log,total);
      targets.forEach(p=>processedIds.add(String(p.id)));
      total += targets.length;
      saveProducts(ps);
      out.textContent=`✅ Tanda ${batch} guardada localmente. Total procesados: ${total}\n\n`+log.slice(-24).join('\n');
      if(useAI) await sleep(1200);
      if(batch>60){ log.push('⚠️ Corte de seguridad: demasiadas tandas.'); break; }
    }
    out.textContent=`✅ Proceso automático terminado. Total procesados: ${total}\n\n${log.join('\n')}\n\nAhora sí: pulsa “Actualizar tienda” UNA SOLA VEZ para subir productos.json.`;
    notify(`✅ Auto 5 en 5 terminado: ${total} productos`, 'success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="bulkai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openBulk();return;}
    const a=e.target.closest('[data-ds6-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds6Act; if(act==='bulkPreview') preview(); if(act==='bulkRun') run(); if(act==='bulkRunAll') runAll(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1300));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v7 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  async function analytics(){ try{ if(typeof tmLeerAnalytics==='function') return await tmLeerAnalytics(); }catch(e){} return {vistas:{},whatsapp:{},suscriptores:Number(localStorage.getItem('tm_subscriber_count')||0)}; }
  function money(n){ return '$'+Number(n||0).toFixed(2); }
  function summarize(ps,vs,an){
    const topStock=ps.slice().sort((a,b)=>Number(b.stock||0)-Number(a.stock||0)).slice(0,8).map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria,precio:p.precioActual,stock:p.stock}));
    const agotados=ps.filter(p=>Number(p.stock||0)<=0).slice(0,12).map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria}));
    const bajos=ps.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3).slice(0,12).map(p=>({id:p.id,nombre:p.nombre,stock:p.stock,categoria:p.categoria}));
    const recientes=vs.slice(0,15).map(v=>({producto:v.producto,cantidad:v.cantidad,total:v.total,fecha:v.fecha||v.id}));
    const vistas=Object.entries(an.vistas||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,10).map(([id,n])=>{const p=ps.find(x=>String(x.id)===String(id));return {id,nombre:p?p.nombre:id,vistas:n};});
    const wa=Object.entries(an.whatsapp||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,10).map(([id,n])=>{const p=ps.find(x=>String(x.id)===String(id));return {id,nombre:p?p.nombre:id,whatsapp:n};});
    const cats={}; ps.forEach(p=>{const c=p.categoria||'General'; cats[c]=cats[c]||{productos:0,stock:0,valor:0}; cats[c].productos++; cats[c].stock+=Number(p.stock||0); cats[c].valor+=Number(p.stock||0)*Number(p.precioActual||0);});
    return {fecha:new Date().toLocaleString('es-CU'),productos:ps.length,ventas:vs.length,totalVendido:vs.reduce((s,v)=>s+Number(v.total||0),0),suscriptores:an.suscriptores||0,categorias:cats,topStock,agotados,bajos,ventasRecientes:recientes,topVistas:vistas,topWhatsApp:wa};
  }
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIAChatCards')) return;
    const div=document.createElement('div'); div.id='tmIAChatCards';
    div.innerHTML=`<div class="tm-tier"><h4>IA — COPILOTO ADMIN</h4><span class="tm-tier-badge purple">Chat</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="chatai"><span class="state">IA</span><div class="ico" style="background:rgba(79,195,247,.18)">🧠</div><h5>Chat IA del admin</h5><p>Pregunta qué publicar, qué reponer, ofertas, campañas y mejoras.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openChat(){
    const suggestions=['¿Qué producto publico hoy?','Dame 3 ideas de oferta con stock disponible','¿Qué productos debo reponer o archivar?','Hazme una campaña para WhatsApp de los productos más fuertes','¿Qué categoría parece más interesante?'];
    panel('🧠 Chat IA del admin','Haz preguntas sobre productos, ventas, stock, analytics y campañas.',`
      <div class="tm-note">El chat usa un resumen de productos, ventas y analytics. No envía imágenes ni claves; solo datos comerciales resumidos.</div>
      <div class="tm-chipwrap" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">${suggestions.map(q=>`<button type="button" class="tm-btn tm-mini" data-ds7-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="tm-field"><label>Pregunta</label><textarea id="tmChatQuestion" style="min-height:95px" placeholder="Ej: qué publico hoy, qué oferta hago, qué producto está flojo..."></textarea></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds7-act="ask">Preguntar a IA</button><button class="tm-btn gold" data-ds7-act="brief">Resumen rápido</button><button class="tm-btn" data-ds7-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Escribe una pregunta o toca una sugerencia.</div>`);
  }
  function localAnswer(q,s){
    const bajos=(s.bajos||[]).map(x=>`• ${x.nombre} (${x.stock})`).join('\n')||'• Sin stock bajo crítico';
    const agot=(s.agotados||[]).slice(0,5).map(x=>`• ${x.nombre}`).join('\n')||'• Sin agotados destacados';
    const top=(s.topStock||[]).slice(0,5).map(x=>`• ${x.nombre} — stock ${x.stock} — ${money(x.precio)}`).join('\n')||'• Sin productos';
    return `Resumen local TiendaMax\n\nProductos: ${s.productos}\nVentas registradas: ${s.ventas}\nTotal vendido: ${money(s.totalVendido)}\nSuscriptores: ${s.suscriptores}\n\nPara publicar hoy, prioriza productos con buen stock:\n${top}\n\nStock bajo:\n${bajos}\n\nAgotados a revisar:\n${agot}\n\nPregunta: ${q}\n\nRecomendación: crea una publicación corta con precio, stock y llamada a WhatsApp. Si tienes IA configurada, el chat dará una estrategia más completa.`;
  }
  async function ask(questionOverride){
    const out=$('#tmToolOut'); if(!out)return;
    const q=(questionOverride||$('#tmChatQuestion')?.value||'Dame un resumen rápido y acciones para hoy').trim();
    if(!q){notify('Escribe una pregunta','warning');return;}
    if($('#tmChatQuestion')) $('#tmChatQuestion').value=q;
    out.textContent='⏳ Analizando tienda y preguntando a IA...';
    const ps=products(), vs=ventas(), an=await analytics(), s=summarize(ps,vs,an);
    const prompt=`Pregunta del admin:\n${q}\n\nDatos resumidos de TiendaMax:\n${JSON.stringify(s,null,2)}\n\nResponde en español, con bullets y acciones concretas. Si recomiendas publicar, incluye texto breve de campaña o idea de push. Si recomiendas reponer, di cuáles. No inventes datos fuera del resumen.`;
    try{ out.textContent=await deepseek(prompt); notify('✅ Respuesta IA lista','success'); }
    catch(e){ out.textContent=localAnswer(q,s)+'\n\n⚠️ '+e.message; notify('Respuesta local: configura la IA para chat avanzado','warning'); }
  }
  async function brief(){ await ask('Dame un resumen rápido de la tienda y 5 acciones prioritarias para hoy.'); }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="chatai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openChat();return;}
    const qbtn=e.target.closest('[data-ds7-q]'); if(qbtn){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation(); ask(qbtn.dataset.ds7Q); return;}
    const a=e.target.closest('[data-ds7-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds7Act; if(act==='ask') ask(); if(act==='brief') brief(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1400));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v8 ─────────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  async function analytics(){ try{ if(typeof tmLeerAnalytics==='function') return await tmLeerAnalytics(); }catch(e){} return {vistas:{},whatsapp:{},suscriptores:Number(localStorage.getItem('tm_subscriber_count')||0)}; }
  function cats(){ return [...new Set(products().map(p=>p.categoria||'General').filter(Boolean))].sort(); }
  function catOptions(){ return '<option value="">Automática / todas</option>'+cats().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
  function productOptions(){return '<option value="">IA elige producto</option>'+products().filter(p=>Number(p.stock||0)>0).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||'Producto')} — ${esc(p.categoria||'General')} — stock ${Number(p.stock||0)}</option>`).join('');}
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function productUrl(p){return p&&p.id?`/p/producto-${p.id}.html`:'/';}
  function pickProduct(cat, chosenId){
    const ps=products().filter(p=>Number(p.stock||0)>0 && (!cat||(p.categoria||'General')===cat));
    if(chosenId){const p=products().find(x=>String(x.id)===String(chosenId)); if(p) return p;}
    if(!ps.length) return products()[0]||{};
    // Score: stock + vistas + whatsapp + tiene SEO/recs
    let an=window.__tmCampaignAnalytics||{vistas:{},whatsapp:{}};
    return ps.map(p=>({p,score:Number(p.stock||0)+Number(an.vistas?.[String(p.id)]||0)*2+Number(an.whatsapp?.[String(p.id)]||0)*4+(p.recomendados?.length?3:0)})).sort((a,b)=>b.score-a.score)[0].p;
  }
  function context(p, an){
    const ps=products(), vs=ventas();
    const recs=(p.recomendados||[]).map(id=>ps.find(x=>String(x.id)===String(id))).filter(Boolean).slice(0,4).map(x=>({id:x.id,nombre:x.nombre,precio:x.precioActual,stock:x.stock,categoria:x.categoria}));
    return {producto:{id:p.id,nombre:p.nombre,descripcion:p.descripcion,categoria:p.categoria,subcategoria:p.subcategoria,precio:p.precioActual,stock:p.stock,garantia:p.garantia,seoTitle:p.seoTitle,upsellText:p.upsellText,url:productUrl(p)},recomendados:recs,stats:{ventasRegistradas:vs.length,totalVendido:vs.reduce((s,v)=>s+Number(v.total||0),0),suscriptores:an.suscriptores||0,vistasProducto:an.vistas?.[String(p.id)]||0,whatsappProducto:an.whatsapp?.[String(p.id)]||0}};
  }
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIACampaignCards')) return;
    const div=document.createElement('div'); div.id='tmIACampaignCards';
    div.innerHTML=`<div class="tm-tier"><h4>IA — CAMPAÑAS</h4><span class="tm-tier-badge gold">Marketing</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="campaignai"><span class="state">IA</span><div class="ico" style="background:rgba(245,158,11,.18)">🚀</div><h5>Campaña IA completa</h5><p>Genera Facebook, WhatsApp, push, story, hashtags y plan para publicar.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openCampaign(){
    panel('🚀 Campaña IA completa','Genera una campaña lista para copiar/publicar en varios canales.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Categoría</label><select id="tmCampCat">${catOptions()}</select></div>
        <div class="tm-field"><label>Producto</label><select id="tmCampProd">${productOptions()}</select></div>
        <div class="tm-field"><label>Objetivo</label><select id="tmCampGoal"><option>Vender hoy</option><option>Oferta elegante</option><option>Producto nuevo</option><option>Liquidar stock</option><option>Reactivar interesados</option><option>Campaña fin de semana</option></select></div>
        <div class="tm-field"><label>Tono</label><select id="tmCampTone"><option>Directo vendedor</option><option>Premium elegante</option><option>Urgencia suave</option><option>Amigable WhatsApp</option></select></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds8-act="campGen">Generar campaña</button><button class="tm-btn gold" data-ds8-act="campApplyPush">Aplicar push</button><button class="tm-btn" data-ds8-act="copyOut">Copiar todo</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Elige opciones y genera una campaña completa.</div>`);
  }
  function localCampaign(p,goal,tone){
    const price=money(p.precioActual), stock=Number(p.stock||0), url=productUrl(p);
    const title=`🔥 ${String(p.nombre||'Oferta TiendaMax').slice(0,32)}`;
    const msg=`Disponible ${price}. ${stock<=3?'Últimas unidades. ':'Stock disponible. '}Escríbenos para reservar.`.slice(0,95);
    return `CAMPAÑA LOCAL — ${goal}\n\nProducto: ${p.nombre}\nPrecio: ${price}\nStock: ${stock}\nURL: ${url}\n\nFACEBOOK:\n🔥 ${p.nombre}\n\n${p.descripcion||'Disponible en TiendaMax.'}\n\n💵 ${price} USD\n📦 Stock: ${stock}\n📲 Escríbenos por WhatsApp para reservar.\n\nWHATSAPP:\nHola 👋 Tenemos disponible ${p.nombre} en ${price} USD. Si te interesa, te lo puedo reservar por aquí.\n\nPUSH:\nTítulo: ${title}\nMensaje: ${msg}\nURL: ${url}\n\nSTORY:\n${p.nombre}\n${price} USD\nEscríbenos para reservar\n\nHASHTAGS:\n#TiendaMax #Cuba #${String(p.categoria||'oferta').replace(/\s+/g,'')}\n\nPLAN:\n1) Publicar Facebook.\n2) Enviar push.\n3) Responder interesados con WhatsApp.\n4) Ofrecer relacionados si preguntan.`;
  }
  async function genCampaign(){
    const out=$('#tmToolOut'); if(!out)return;
    out.textContent='⏳ Leyendo analytics y generando campaña...';
    const an=await analytics(); window.__tmCampaignAnalytics=an;
    const cat=$('#tmCampCat')?.value||'', chosen=$('#tmCampProd')?.value||'', goal=$('#tmCampGoal')?.value||'Vender hoy', tone=$('#tmCampTone')?.value||'Directo vendedor';
    const p=pickProduct(cat, chosen); if(!p||!p.id){out.textContent='No hay producto disponible para campaña.';return;}
    const ctx=context(p,an);
    const prompt=`Genera una campaña completa para TiendaMax.\n\nObjetivo: ${goal}\nTono: ${tone}\nDatos:\n${JSON.stringify(ctx,null,2)}\n\nEntrega con secciones claras:\n1) Producto elegido y motivo.\n2) Post Facebook/grupos listo para copiar.\n3) Mensaje WhatsApp corto para clientes.\n4) Notificación push con Título, Mensaje y URL.\n5) Texto Story/estado.\n6) Hashtags.\n7) Recomendados/upsell si aplica.\n8) Horario sugerido y plan de 3 pasos.\n\nNo inventes garantía/envío. Mantén textos breves y vendibles.`;
    try{
      const ans=await deepseek(prompt);
      out.dataset.pushTitle=(ans.match(/Título:\s*(.+)/i)||[])[1]?.trim()||`🔥 ${String(p.nombre).slice(0,30)}`;
      out.dataset.pushBody=(ans.match(/Mensaje:\s*(.+)/i)||[])[1]?.trim()||`Disponible en TiendaMax. Escríbenos para reservar.`;
      out.dataset.pushUrl=productUrl(p);
      out.textContent=ans; notify('✅ Campaña generada','success');
    }catch(e){
      const ans=localCampaign(p,goal,tone); out.dataset.pushTitle=`🔥 ${String(p.nombre).slice(0,30)}`; out.dataset.pushBody=`Disponible ${money(p.precioActual)}. Escríbenos para reservar.`; out.dataset.pushUrl=productUrl(p); out.textContent=ans+'\n\n⚠️ '+e.message; notify('Campaña local generada','warning');
    }
  }
  function applyPush(){
    const out=$('#tmToolOut'); if(!out)return;
    const title=out.dataset.pushTitle||'', body=out.dataset.pushBody||'', url=out.dataset.pushUrl||'/';
    if(!title||!body){notify('Primero genera la campaña','warning');return;}
    if(typeof switchTab==='function') switchTab('configuracion');
    setTimeout(()=>{const t=$('#manualPushTitle'), b=$('#manualPushBody'), u=$('#manualPushUrl'); if(t)t.value=title.slice(0,50); if(b)b.value=body.slice(0,120); if(u)u.value=url; notify('✅ Push de campaña aplicado en Configuración','success');},250);
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="campaignai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openCampaign();return;}
    const a=e.target.closest('[data-ds8-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds8Act; if(act==='campGen') genCampaign(); if(act==='campApplyPush') applyPush(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1500));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v9 ─────────────────────────────────────────
(function(){
  const KEY='tm_campaigns_v1';
  const LAST='tm_last_campaign_text';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function list(){ try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]} }
  function setList(v){ localStorage.setItem(KEY,JSON.stringify(v.slice(0,100))); }
  function productOptions(){return '<option value="">Sin producto específico</option>'+products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||'Producto')} — ${esc(p.categoria||'General')}</option>`).join('');}
  function byId(id){return products().find(p=>String(p.id)===String(id))||null;}
  function productUrl(p){return p&&p.id?`/p/producto-${p.id}.html`:'/';}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIAPublisherCards')) return;
    const div=document.createElement('div'); div.id='tmIAPublisherCards';
    div.innerHTML=`<div class="tm-tier"><h4>IA — EJECUCIÓN</h4><span class="tm-tier-badge gold">Publicar</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="publisherai"><span class="state">PRO</span><div class="ico" style="background:rgba(37,211,102,.18)">📌</div><h5>Publicador asistido</h5><p>Guarda campaña, copia canales, aplica push y crea seguimiento.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function parseSection(text, name){
    const re=new RegExp(name+'\\s*:?\\s*([\\s\\S]*?)(?:\\n\\s*(?:FACEBOOK|WHATSAPP|PUSH|STORY|HASHTAGS|PLAN|HORARIO|RECOMENDADOS|$))','i');
    const m=text.match(re); return (m&&m[1]?m[1].trim():text.trim());
  }
  function parsePush(text,p){
    const title=(text.match(/T[ií]tulo\s*:\s*(.+)/i)||[])[1]?.trim() || ('🔥 '+(p?.nombre||'TiendaMax').slice(0,30));
    const body=(text.match(/Mensaje\s*:\s*(.+)/i)||[])[1]?.trim() || ((p?.nombre||'Producto disponible')+' en TiendaMax. Escríbenos para reservar.').slice(0,100);
    const url=(text.match(/URL\s*:\s*(\S+)/i)||[])[1]?.trim() || productUrl(p);
    return {title:title.slice(0,55),body:body.slice(0,120),url};
  }
  function openPub(){
    const last=localStorage.getItem(LAST)||'';
    panel('📌 Publicador asistido','Convierte una campaña en acciones: copiar, push, historial y seguimiento.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Título interno</label><input id="tmPubTitle" placeholder="Ej: Campaña WIFI sábado" value="Campaña ${new Date().toLocaleDateString('es-CU')}"></div>
        <div class="tm-field"><label>Producto</label><select id="tmPubProd">${productOptions()}</select></div>
      </div>
      <div class="tm-field"><label>Texto de campaña</label><textarea id="tmPubText" style="min-height:180px" placeholder="Pega aquí la campaña generada...">${esc(last)}</textarea></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds9-act="savePub">Guardar como publicada</button><button class="tm-btn gold" data-ds9-act="applyPush">Aplicar push</button><button class="tm-btn" data-ds9-act="copyFacebook">Copiar Facebook</button><button class="tm-btn" data-ds9-act="copyWhatsApp">Copiar WhatsApp</button><button class="tm-btn" data-ds9-act="history">Historial</button></div>
      <div class="tm-note">Tip: genera una campaña IA, luego abre esta herramienta. Si fue detectada, aparecerá aquí automáticamente.</div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Listo para publicar.</div>`);
  }
  function savePub(){
    const text=$('#tmPubText')?.value.trim()||''; if(!text){notify('Pega o genera una campaña primero','warning');return;}
    const pid=$('#tmPubProd')?.value||''; const p=byId(pid); const channels=[];
    if(/facebook/i.test(text)) channels.push('Facebook'); if(/whatsapp/i.test(text)) channels.push('WhatsApp'); if(/push|título|mensaje/i.test(text)) channels.push('Push'); if(/story|estado/i.test(text)) channels.push('Story');
    const item={id:Date.now(),ts:new Date().toISOString(),title:$('#tmPubTitle')?.value.trim()||'Campaña',productId:pid||null,productName:p?.nombre||'',channels:[...new Set(channels)],text,status:'publicada',followUpAt:new Date(Date.now()+24*3600*1000).toISOString(),result:''};
    const arr=list(); arr.unshift(item); setList(arr);
    if(p){const ps=products(); const idx=ps.findIndex(x=>String(x.id)===String(p.id)); if(idx>=0){ps[idx].ultimaPublicacion=new Date().toISOString(); ps[idx].campanasPublicadas=Number(ps[idx].campanasPublicadas||0)+1; saveProducts(ps); try{if(typeof marcarProductoModificado==='function') marcarProductoModificado(ps[idx].id);}catch(e){}}}
    localStorage.setItem(LAST,text);
    $('#tmToolOut').textContent=`✅ Campaña guardada\nTítulo: ${item.title}\nProducto: ${item.productName||'—'}\nCanales: ${item.channels.join(', ')||'—'}\nSeguimiento: mañana`;
    notify('✅ Campaña guardada en historial','success');
  }
  function applyPush(){
    const text=$('#tmPubText')?.value||localStorage.getItem(LAST)||''; const p=byId($('#tmPubProd')?.value); const pu=parsePush(text,p);
    if(typeof switchTab==='function') switchTab('configuracion');
    setTimeout(()=>{const t=$('#manualPushTitle'), b=$('#manualPushBody'), u=$('#manualPushUrl'); if(t)t.value=pu.title; if(b)b.value=pu.body; if(u)u.value=pu.url; notify('✅ Push aplicado en Configuración','success');},250);
  }
  function copyPart(type){
    const text=$('#tmPubText')?.value||''; let out=text;
    if(type==='Facebook') out=parseSection(text,'FACEBOOK');
    if(type==='WhatsApp') out=parseSection(text,'WHATSAPP');
    navigator.clipboard?.writeText(out); notify('Copiado '+type,'success');
    const box=$('#tmToolOut'); if(box) box.textContent=out;
  }
  function history(){
    const arr=list();
    panel('📌 Historial de campañas','Campañas guardadas y seguimiento.',`<div class="tm-actions"><button class="tm-btn" data-ds9-act="openPub">+ Nueva campaña</button><button class="tm-btn" data-ds9-act="exportCsv">Exportar CSV</button></div><div class="tm-list">${arr.map((c,i)=>`<div class="tm-row"><div class="tm-row-main"><b>${esc(c.title)}</b><small>${new Date(c.ts).toLocaleString('es-CU')} · ${esc(c.productName||'Sin producto')} · ${esc((c.channels||[]).join(', '))}<br>Seguimiento: ${c.followUpAt?new Date(c.followUpAt).toLocaleDateString('es-CU'):'—'} · Estado: ${esc(c.status||'')}</small></div><button class="tm-btn tm-mini" data-ds9-act="copyHist" data-i="${i}">Copiar</button><button class="tm-btn tm-mini" data-ds9-act="doneHist" data-i="${i}">Hecho</button><button class="tm-btn tm-mini" data-ds9-act="delHist" data-i="${i}">Eliminar</button></div>`).join('')||'<div class="tm-note">No hay campañas guardadas.</div>'}</div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Selecciona una campaña.</div>`);
  }
  function exportCsv(){
    const rows=[['fecha','titulo','producto','canales','estado','seguimiento'],...list().map(c=>[c.ts,c.title,c.productName,(c.channels||[]).join('|'),c.status,c.followUpAt])];
    const csv=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='campanas_tiendamax.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function captureLast(){
    const out=$('#tmToolOut'); if(!out) return; const txt=out.textContent||'';
    if(txt.length>100 && /(FACEBOOK|WHATSAPP|PUSH|CAMPAÑA|HASHTAGS)/i.test(txt)) localStorage.setItem(LAST,txt);
  }
  const mo=new MutationObserver(()=>captureLast());
  document.addEventListener('DOMContentLoaded',()=>{try{mo.observe(document.body,{childList:true,subtree:true,characterData:true});}catch(e){} setTimeout(addCards,1600);});
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="publisherai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openPub();return;}
    const a=e.target.closest('[data-ds9-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds9Act;
    if(act==='openPub') openPub(); if(act==='savePub') savePub(); if(act==='applyPush') applyPush(); if(act==='copyFacebook') copyPart('Facebook'); if(act==='copyWhatsApp') copyPart('WhatsApp'); if(act==='history') history(); if(act==='exportCsv') exportCsv();
    if(act==='copyHist'){const c=list()[Number(a.dataset.i)]; if(c){navigator.clipboard?.writeText(c.text); $('#tmToolOut')&&($('#tmToolOut').textContent=c.text); notify('Campaña copiada','success');}}
    if(act==='doneHist'){const arr=list(); const c=arr[Number(a.dataset.i)]; if(c){c.status='seguimiento hecho'; c.result='Revisado '+new Date().toLocaleString('es-CU'); setList(arr); history();}}
    if(act==='delHist'){const arr=list(); arr.splice(Number(a.dataset.i),1); setList(arr); history();}
  },true);
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(addCards,300);});
})();

// ── tm-deepseek-tools-v10 ─────────────────────────────────────────
(function(){
  const KEY='tm_campaigns_v1';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function campaigns(){ try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]} }
  function saveCampaigns(v){ localStorage.setItem(KEY,JSON.stringify(v.slice(0,150))); }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIACampaignDashCards')) return;
    const div=document.createElement('div'); div.id='tmIACampaignDashCards';
    div.innerHTML=`<div class="tm-tier"><h4>MARKETING — MÉTRICAS</h4><span class="tm-tier-badge purple">Dashboard</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="campdash"><span class="state">PRO</span><div class="ico" style="background:rgba(52,152,219,.18)">📈</div><h5>Dashboard campañas</h5><p>Mide campañas publicadas, pendientes, canales y posibles ventas posteriores.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function campaignStats(){
    const cs=campaigns(); const vs=ventas(); const now=Date.now(); const week=7*86400000;
    const thisWeek=cs.filter(c=>now-new Date(c.ts).getTime()<=week);
    const pending=cs.filter(c=>c.followUpAt && new Date(c.followUpAt).getTime()<=now && !/hecho|cerrad|complet/i.test(c.status||''));
    const channels={}; cs.forEach(c=>(c.channels||[]).forEach(ch=>channels[ch]=(channels[ch]||0)+1));
    const prodCount={}; cs.forEach(c=>{ if(c.productName) prodCount[c.productName]=(prodCount[c.productName]||0)+1; });
    const salesAfter=cs.map(c=>{
      const ts=new Date(c.ts).getTime(); const until=ts+48*3600000;
      const related=vs.filter(v=>{
        const vt=Number(v.id||Date.parse(v.fecha)||0); const byTime=vt>=ts&&vt<=until;
        const byProd=c.productId?String(v.productoId)===String(c.productId):(c.productName&&String(v.producto||'').toLowerCase().includes(String(c.productName).toLowerCase().slice(0,12)));
        return byTime && byProd;
      });
      return {id:c.id,title:c.title,productName:c.productName,count:related.length,total:related.reduce((s,v)=>s+Number(v.total||0),0)};
    }).filter(x=>x.count>0);
    return {cs,vs,total:cs.length,thisWeek,pending,channels,prodCount,salesAfter};
  }
  function barRows(obj){
    const arr=Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]).slice(0,8); const max=Math.max(1,...arr.map(x=>x[1]));
    return arr.map(([k,v])=>`<div class="tm-row"><div class="tm-row-main"><b>${esc(k)}</b><small>${v} campaña${v!==1?'s':''}</small><div style="height:7px;background:rgba(255,255,255,.08);border-radius:99px;margin-top:6px"><div style="height:7px;width:${Math.max(5,v/max*100)}%;background:linear-gradient(90deg,#C9A96E,#FF6B35);border-radius:99px"></div></div></div></div>`).join('')||'<div class="tm-note">Sin datos todavía.</div>';
  }
  function openDash(){
    const st=campaignStats();
    panel('📈 Dashboard de campañas','Seguimiento de campañas guardadas y señales de rendimiento.',`
      <div class="tm-an-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px">
        <div class="tm-an-kpi"><small>Total campañas</small><b>${st.total}</b><em>historial local</em></div>
        <div class="tm-an-kpi"><small>Esta semana</small><b>${st.thisWeek.length}</b><em>últimos 7 días</em></div>
        <div class="tm-an-kpi"><small>Pendientes</small><b>${st.pending.length}</b><em>seguimiento vencido</em></div>
        <div class="tm-an-kpi"><small>Ventas post-campaña</small><b>${st.salesAfter.length}</b><em>señales 48h</em></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds10-act="pending">Ver pendientes</button><button class="tm-btn gold" data-ds10-act="report">Reporte</button><button class="tm-btn" data-ds10-act="export">Exportar CSV</button></div>
      <div class="tm-form-grid" style="margin-top:12px">
        <div class="tm-panel active" style="padding:14px"><h4>Canales más usados</h4>${barRows(st.channels)}</div>
        <div class="tm-panel active" style="padding:14px"><h4>Productos más publicados</h4>${barRows(st.prodCount)}</div>
      </div>
      <div class="tm-panel active" style="padding:14px;margin-top:12px"><h4>Últimas campañas</h4><div class="tm-list">${st.cs.slice(0,10).map((c,i)=>`<div class="tm-row"><div class="tm-row-main"><b>${esc(c.title)}</b><small>${new Date(c.ts).toLocaleString('es-CU')} · ${esc(c.productName||'Sin producto')} · ${esc((c.channels||[]).join(', '))} · ${esc(c.status||'')}</small></div><button class="tm-btn tm-mini" data-ds10-act="copy" data-i="${i}">Copiar</button><button class="tm-btn tm-mini" data-ds10-act="republish" data-i="${i}">Republicar</button></div>`).join('')||'<div class="tm-note">Sin campañas guardadas.</div>'}</div></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Dashboard listo.</div>`);
  }
  function showPending(){
    const st=campaignStats(); const out=$('#tmToolOut'); if(!out)return;
    out.textContent=st.pending.length?('PENDIENTES DE SEGUIMIENTO\n\n'+st.pending.map(c=>`• ${c.title} — ${c.productName||'Sin producto'} — ${new Date(c.followUpAt).toLocaleString('es-CU')}`).join('\n')):'No hay seguimientos pendientes.';
  }
  function report(){
    const st=campaignStats(); const out=$('#tmToolOut'); if(!out)return;
    const topCh=Object.entries(st.channels).sort((a,b)=>b[1]-a[1])[0]; const topProd=Object.entries(st.prodCount).sort((a,b)=>b[1]-a[1])[0];
    out.textContent=`REPORTE CAMPAÑAS TIENDAMAX\n\nTotal campañas: ${st.total}\nEsta semana: ${st.thisWeek.length}\nPendientes de seguimiento: ${st.pending.length}\nCanal más usado: ${topCh?topCh[0]+' ('+topCh[1]+')':'—'}\nProducto más publicado: ${topProd?topProd[0]+' ('+topProd[1]+')':'—'}\nVentas detectadas 48h post-campaña: ${st.salesAfter.length}\n\nSeñales de venta:\n${st.salesAfter.map(x=>`• ${x.title}: ${x.count} venta(s), ${money(x.total)}`).join('\n')||'• Sin señales detectadas'}\n\nRecomendación:\n${st.pending.length?'Revisa pendientes y marca seguimiento hecho.':''}\n${topProd?'Evita saturar siempre el mismo producto; alterna categorías con buen stock.':'Guarda campañas para empezar a medir.'}`;
  }
  function exportCsv(){
    const rows=[['fecha','titulo','producto','canales','estado','seguimiento'],...campaigns().map(c=>[c.ts,c.title,c.productName,(c.channels||[]).join('|'),c.status,c.followUpAt])];
    const csv=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='dashboard_campanas_tiendamax.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function republish(i){
    const c=campaigns()[Number(i)]; if(!c)return;
    localStorage.setItem('tm_last_campaign_text',c.text||'');
    notify('Campaña cargada para republicar','success');
    const card=document.querySelector('[data-tool="publisherai"]'); if(card) card.click();
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="campdash"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openDash();return;}
    const a=e.target.closest('[data-ds10-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds10Act; if(act==='pending')showPending(); if(act==='report')report(); if(act==='export')exportCsv(); if(act==='copy'){const c=campaigns()[Number(a.dataset.i)]; if(c){navigator.clipboard?.writeText(c.text||''); $('#tmToolOut')&&($('#tmToolOut').textContent=c.text||''); notify('Copiado','success');}} if(act==='republish')republish(a.dataset.i);
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1700));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v11 ─────────────────────────────────────────
(function(){
  const KEY='tm_week_plan_v1';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  async function analytics(){ try{ if(typeof tmLeerAnalytics==='function') return await tmLeerAnalytics(); }catch(e){} return {vistas:{},whatsapp:{},suscriptores:Number(localStorage.getItem('tm_subscriber_count')||0)}; }
  function plans(){ try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]} }
  function savePlans(v){ localStorage.setItem(KEY,JSON.stringify(v.slice(0,20))); }
  function cats(){ return [...new Set(products().map(p=>p.categoria||'General').filter(Boolean))].sort(); }
  function catOptions(){ return '<option value="">Automático / todas</option>'+cats().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function productUrl(p){return p&&p.id?`/p/producto-${p.id}.html`:'/';}
  function summarize(ps,vs,an,cat){
    const pool=ps.filter(p=>Number(p.stock||0)>0 && (!cat||(p.categoria||'General')===cat));
    const scored=pool.map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria,precio:p.precioActual,stock:p.stock,url:productUrl(p),score:Number(p.stock||0)+Number(an.vistas?.[String(p.id)]||0)*2+Number(an.whatsapp?.[String(p.id)]||0)*4+(p.recomendados?.length?3:0)})).sort((a,b)=>b.score-a.score).slice(0,18);
    const bajos=ps.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3).slice(0,10).map(p=>({id:p.id,nombre:p.nombre,stock:p.stock,categoria:p.categoria}));
    const agotados=ps.filter(p=>Number(p.stock||0)<=0).slice(0,10).map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria}));
    return {fecha:new Date().toLocaleDateString('es-CU'),categoria:cat||'Todas',productosDisponibles:pool.length,topProductos:scored,stockBajo:bajos,agotados,ventasRegistradas:vs.length,totalVendido:vs.reduce((s,v)=>s+Number(v.total||0),0),suscriptores:an.suscriptores||0};
  }
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmIAPlannerCards')) return;
    const div=document.createElement('div'); div.id='tmIAPlannerCards';
    div.innerHTML=`<div class="tm-tier"><h4>MARKETING — PLANIFICACIÓN</h4><span class="tm-tier-badge gold">Semana</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="weekplanner"><span class="state">PRO</span><div class="ico" style="background:rgba(201,169,110,.18)">🗓️</div><h5>Plan semanal IA</h5><p>Genera calendario de publicaciones, push, WhatsApp y seguimiento.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openPlanner(){
    panel('🗓️ Planificador automático semanal','Crea un calendario de acciones de marketing y márcalo como hecho.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Categoría foco</label><select id="tmPlanCat">${catOptions()}</select></div>
        <div class="tm-field"><label>Objetivo</label><select id="tmPlanGoal"><option>Vender más esta semana</option><option>Mover stock alto</option><option>Reactivar interesados</option><option>Fin de semana fuerte</option><option>Reponer/ordenar catálogo</option></select></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds11-act="genPlan">Generar plan</button><button class="tm-btn gold" data-ds11-act="savePlan">Guardar plan</button><button class="tm-btn" data-ds11-act="listPlans">Planes guardados</button><button class="tm-btn" data-ds11-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Genera un plan semanal con acciones por día.</div>`);
  }
  function localPlan(summary,goal){
    const top=summary.topProductos.slice(0,7);
    const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    return `PLAN SEMANAL LOCAL — ${goal}\n\n`+days.map((d,i)=>{const p=top[i%Math.max(1,top.length)]||{}; const action=i===0?'Post Facebook + WhatsApp':i===1?'Push corto':i===2?'Repost en grupos':i===3?'Story/estado':i===4?'Campaña fin de semana':i===5?'WhatsApp a interesados': 'Revisión de stock y resultados'; return `${d}\nProducto: ${p.nombre||'Producto con stock'}\nAcción: ${action}\nTexto: ${p.nombre?`🔥 ${p.nombre} disponible en TiendaMax por ${money(p.precio)}. Escríbenos para reservar.`:'Publicar producto destacado con stock.'}\nURL: ${p.url||'/'}\n`;}).join('\n')+`\nPrioridades:\n• Revisar stock bajo: ${summary.stockBajo.length}\n• Agotados a reponer/archivar: ${summary.agotados.length}\n• Suscriptores para push: ${summary.suscriptores}`;
  }
  async function genPlan(){
    const out=$('#tmToolOut'); if(!out)return;
    out.textContent='⏳ Leyendo datos y generando plan semanal...';
    const cat=$('#tmPlanCat')?.value||'', goal=$('#tmPlanGoal')?.value||'Vender más esta semana';
    const an=await analytics(), s=summarize(products(),ventas(),an,cat);
    const prompt=`Crea un plan semanal de marketing para TiendaMax.\n\nObjetivo: ${goal}\nDatos:\n${JSON.stringify(s,null,2)}\n\nEntrega un calendario de Lunes a Domingo. Cada día debe tener:\n- Producto o categoría foco\n- Canal: Facebook/WhatsApp/Push/Story/Grupos/Revisión\n- Texto breve listo para copiar\n- URL si aplica\n- Objetivo del día\n\nIncluye al final: prioridades de stock, productos a evitar si stock bajo, y seguimiento recomendado. No inventes productos fuera de la lista.`;
    try{ out.textContent=await deepseek(prompt); notify('✅ Plan semanal generado','success'); }
    catch(e){ out.textContent=localPlan(s,goal)+'\n\n⚠️ '+e.message; notify('Plan local generado','warning'); }
  }
  function savePlan(){
    const text=$('#tmToolOut')?.textContent||''; if(text.length<40){notify('Primero genera un plan','warning');return;}
    const item={id:Date.now(),ts:new Date().toISOString(),title:'Plan semanal '+new Date().toLocaleDateString('es-CU'),categoria:$('#tmPlanCat')?.value||'Todas',goal:$('#tmPlanGoal')?.value||'',text,done:{}};
    const arr=plans(); arr.unshift(item); savePlans(arr); notify('✅ Plan guardado','success'); $('#tmToolOut').textContent+='\n\n✅ Guardado en planes.';
  }
  function listPlans(){
    const arr=plans();
    panel('🗓️ Planes semanales guardados','Marca días como hechos o reutiliza planes.',`<div class="tm-actions"><button class="tm-btn" data-ds11-act="openPlanner">+ Nuevo plan</button><button class="tm-btn" data-ds11-act="exportPlans">Exportar CSV</button></div><div class="tm-list">${arr.map((p,i)=>`<div class="tm-row"><div class="tm-row-main"><b>${esc(p.title)}</b><small>${new Date(p.ts).toLocaleString('es-CU')} · ${esc(p.categoria)} · ${esc(p.goal)} · Hechos: ${Object.keys(p.done||{}).length}/7</small></div><button class="tm-btn tm-mini" data-ds11-act="viewPlan" data-i="${i}">Ver</button><button class="tm-btn tm-mini" data-ds11-act="delPlan" data-i="${i}">Eliminar</button></div>`).join('')||'<div class="tm-note">No hay planes guardados.</div>'}</div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Selecciona un plan.</div>`);
  }
  function viewPlan(i){
    const p=plans()[Number(i)]; if(!p)return;
    const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const controls=days.map(d=>`<button class="tm-btn tm-mini" data-ds11-act="toggleDay" data-i="${i}" data-day="${d}">${p.done&&p.done[d]?'✅':'⬜'} ${d}</button>`).join('');
    const out=$('#tmToolOut'); if(out) out.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${controls}</div><pre style="white-space:pre-wrap;margin:0">${esc(p.text)}</pre>`;
  }
  function toggleDay(i,d){const arr=plans(); const p=arr[Number(i)]; if(!p)return; p.done=p.done||{}; p.done[d]?delete p.done[d]:p.done[d]=new Date().toISOString(); savePlans(arr); viewPlan(i);}
  function exportPlans(){
    const rows=[['fecha','titulo','categoria','objetivo','hechos','plan'],...plans().map(p=>[p.ts,p.title,p.categoria,p.goal,Object.keys(p.done||{}).join('|'),p.text])];
    const csv=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='planes_semanales_tiendamax.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="weekplanner"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openPlanner();return;}
    const a=e.target.closest('[data-ds11-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds11Act; if(act==='openPlanner')openPlanner(); if(act==='genPlan')genPlan(); if(act==='savePlan')savePlan(); if(act==='listPlans')listPlans(); if(act==='viewPlan')viewPlan(a.dataset.i); if(act==='toggleDay')toggleDay(a.dataset.i,a.dataset.day); if(act==='delPlan'){const arr=plans();arr.splice(Number(a.dataset.i),1);savePlans(arr);listPlans();} if(act==='exportPlans')exportPlans(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1800));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v12 ─────────────────────────────────────────
(function(){
  const CAMP='tm_campaigns_v1', PLAN='tm_week_plan_v1';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  function campaigns(){ try{return JSON.parse(localStorage.getItem(CAMP)||'[]')}catch(e){return[]} }
  function plans(){ try{return JSON.parse(localStorage.getItem(PLAN)||'[]')}catch(e){return[]} }
  function saveCampaigns(v){ localStorage.setItem(CAMP,JSON.stringify(v.slice(0,150))); }
  function savePlans(v){ localStorage.setItem(PLAN,JSON.stringify(v.slice(0,20))); }
  function todayName(){ return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()]; }
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmAdminTasksCards')) return;
    const div=document.createElement('div'); div.id='tmAdminTasksCards';
    div.innerHTML=`<div class="tm-tier"><h4>ADMIN — ACCIÓN DIARIA</h4><span class="tm-tier-badge gold">Hoy</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="taskcenter"><span class="state">HOY</span><div class="ico" style="background:rgba(231,76,60,.16)">✅</div><h5>Centro de tareas</h5><p>Lista automática de pendientes: campañas, plan semanal, stock, SEO y limpieza.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function collectTasks(){
    const ps=products(), vs=ventas(), cs=campaigns(), pls=plans();
    const now=Date.now(); const tasks=[];
    cs.filter(c=>c.followUpAt && new Date(c.followUpAt).getTime()<=now && !/hecho|cerrad|complet/i.test(c.status||'')).slice(0,8).forEach(c=>tasks.push({type:'campaign',prio:1,title:'Seguimiento de campaña vencido',detail:`${c.title} · ${c.productName||'Sin producto'}`,id:c.id,action:'Marcar seguimiento hecho'}));
    const day=todayName();
    pls.slice(0,3).forEach(p=>{ if(!(p.done&&p.done[day])) tasks.push({type:'plan',prio:2,title:`Ejecutar plan de hoy (${day})`,detail:p.title+' · '+(p.goal||''),id:p.id,day,action:'Marcar día hecho'}); });
    ps.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3).slice(0,10).forEach(p=>tasks.push({type:'stocklow',prio:3,title:'Stock bajo',detail:`${p.nombre} · quedan ${p.stock}`,id:p.id,action:'Ver producto'}));
    ps.filter(p=>Number(p.stock||0)<=0).slice(0,8).forEach(p=>tasks.push({type:'empty',prio:4,title:'Producto agotado',detail:`${p.nombre} · ${p.categoria||'General'}`,id:p.id,action:'Archivar/reponer'}));
    ps.filter(p=>!p.seoTitle&&!p.seoDescription).slice(0,8).forEach(p=>tasks.push({type:'seo',prio:5,title:'Producto sin SEO',detail:p.nombre,id:p.id,action:'Abrir IA masiva'}));
    ps.filter(p=>!Array.isArray(p.recomendados)||!p.recomendados.length).slice(0,8).forEach(p=>tasks.push({type:'recs',prio:6,title:'Sin recomendaciones IA',detail:p.nombre,id:p.id,action:'Abrir recomendador'}));
    const today0=new Date(); today0.setHours(0,0,0,0);
    const ventasHoy=vs.filter(v=>Number(v.id||0)>=today0.getTime());
    if(ventasHoy.length) tasks.push({type:'sales',prio:7,title:'Revisar ventas de hoy',detail:`${ventasHoy.length} venta(s) · ${money(ventasHoy.reduce((s,v)=>s+Number(v.total||0),0))}`,action:'Abrir ventas'});
    const subs=Number(localStorage.getItem('tm_subscriber_count')||0);
    if(subs>0) tasks.push({type:'push',prio:8,title:'Enviar push/campaña',detail:`${subs} suscriptor(es) disponibles`,action:'Abrir campañas'});
    return tasks.sort((a,b)=>a.prio-b.prio).slice(0,35);
  }
  function counts(tasks){return tasks.reduce((m,t)=>{m[t.type]=(m[t.type]||0)+1;return m;},{});}
  function openTasks(){
    const tasks=collectTasks(), c=counts(tasks);
    panel('✅ Centro de tareas del admin','Qué conviene hacer hoy según campañas, stock, SEO, plan semanal y ventas.',`
      <div class="tm-an-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px;margin-bottom:14px">
        <div class="tm-an-kpi"><small>Total tareas</small><b>${tasks.length}</b><em>pendientes</em></div>
        <div class="tm-an-kpi"><small>Campañas</small><b>${c.campaign||0}</b><em>seguimiento</em></div>
        <div class="tm-an-kpi"><small>Stock</small><b>${(c.stocklow||0)+(c.empty||0)}</b><em>bajo/agotado</em></div>
        <div class="tm-an-kpi"><small>SEO/Recs</small><b>${(c.seo||0)+(c.recs||0)}</b><em>por completar</em></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds12-act="brief">Resumen de hoy</button><button class="tm-btn gold" data-ds12-act="doTop">Resolver primera tarea</button><button class="tm-btn" data-ds12-act="export">Exportar tareas</button><button class="tm-btn" data-ds12-act="refresh">Actualizar</button></div>
      <div class="tm-list" style="margin-top:12px">${tasks.map((t,i)=>row(t,i)).join('')||'<div class="tm-note tm-ok">🎉 No hay tareas críticas. Puedes generar una campaña o revisar analytics.</div>'}</div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Centro listo. Hoy es ${todayName()}.</div>`);
  }
  function icon(t){return {campaign:'📌',plan:'🗓️',stocklow:'🟠',empty:'🔴',seo:'🔎',recs:'🧲',sales:'💰',push:'🔔'}[t]||'✅';}
  function row(t,i){return `<div class="tm-row"><div class="tm-row-main"><b>${icon(t.type)} ${esc(t.title)}</b><small>${esc(t.detail||'')}<br>Acción: ${esc(t.action||'')}</small></div><button class="tm-btn tm-mini" data-ds12-act="go" data-i="${i}">Ir</button><button class="tm-btn tm-mini" data-ds12-act="done" data-i="${i}">Hecho</button></div>`;}
  function goTask(t){
    if(!t) return;
    if(t.type==='campaign'){ const card=document.querySelector('[data-tool="campdash"]'); if(card) card.click(); return; }
    if(t.type==='plan'){ const card=document.querySelector('[data-tool="weekplanner"]'); if(card) card.click(); return; }
    if(t.type==='seo'){ const card=document.querySelector('[data-tool="bulkai"]'); if(card) card.click(); return; }
    if(t.type==='recs'){ const card=document.querySelector('[data-tool="recsai"]'); if(card) card.click(); return; }
    if(t.type==='sales'){ if(typeof switchTab==='function') switchTab('ventas'); return; }
    if(t.type==='push'){ const card=document.querySelector('[data-tool="campaignai"]'); if(card) card.click(); return; }
    if(t.id){ if(typeof switchTab==='function') switchTab('manage-products'); setTimeout(()=>{const s=$('#searchProductos'); const p=products().find(x=>String(x.id)===String(t.id)); if(s&&p){s.value=p.nombre||''; if(typeof actualizarListaProductos==='function') actualizarListaProductos();}},250); }
  }
  function doneTask(t){
    if(!t) return;
    if(t.type==='campaign'){
      const arr=campaigns(); const c=arr.find(x=>String(x.id)===String(t.id)); if(c){c.status='seguimiento hecho'; c.result='Marcado desde Centro de tareas '+new Date().toLocaleString('es-CU'); saveCampaigns(arr);}
    }else if(t.type==='plan'){
      const arr=plans(); const p=arr.find(x=>String(x.id)===String(t.id)); if(p){p.done=p.done||{}; p.done[t.day||todayName()]=new Date().toISOString(); savePlans(arr);}
    }else{
      const key='tm_tasks_done_'+new Date().toISOString().slice(0,10); let done=[]; try{done=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){} done.push({ts:Date.now(),type:t.type,id:t.id,title:t.title}); localStorage.setItem(key,JSON.stringify(done));
    }
    notify('✅ Tarea marcada','success'); openTasks();
  }
  function brief(){
    const tasks=collectTasks(); const c=counts(tasks); const out=$('#tmToolOut'); if(!out)return;
    out.textContent=`RESUMEN DE HOY — ${todayName()}\n\nTareas totales: ${tasks.length}\nCampañas pendientes: ${c.campaign||0}\nPlan semanal pendiente: ${c.plan||0}\nStock bajo/agotado: ${(c.stocklow||0)+(c.empty||0)}\nSEO/Recomendaciones pendientes: ${(c.seo||0)+(c.recs||0)}\n\nPrioridad sugerida:\n1) Seguimientos vencidos de campañas.\n2) Ejecutar acción del plan semanal.\n3) Revisar stock bajo/agotados.\n4) Completar SEO/recomendaciones con IA masiva.\n5) Si hay suscriptores, preparar campaña push.`;
  }
  function exportTasks(){
    const tasks=collectTasks(); const rows=[['tipo','titulo','detalle','accion'],...tasks.map(t=>[t.type,t.title,t.detail,t.action])];
    const csv=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='tareas_admin_tiendamax.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="taskcenter"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTasks();return;}
    const a=e.target.closest('[data-ds12-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const tasks=collectTasks(); const act=a.dataset.ds12Act;
    if(act==='refresh')openTasks(); if(act==='brief')brief(); if(act==='export')exportTasks(); if(act==='doTop')goTask(tasks[0]); if(act==='go')goTask(tasks[Number(a.dataset.i)]); if(act==='done')doneTask(tasks[Number(a.dataset.i)]);
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1900));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v13 ─────────────────────────────────────────
(function(){
  const SNAP='tm_full_backups_v1';
  const $=(s,r=document)=>r.querySelector(s);
  const KEYS=['productos','categorias','subcategorias','iconosPersonalizados','heroBanners','gruposFB','revolicoConfig','registroVentas','tm_campaigns_v1','tm_week_plan_v1','tm_tools_data_v1','tm_tools_snapshots_v1','tm_subscriber_count','tasaMN','whatsappNumber','ofertaDiaId','ofertaDiaTexto'];
  const SECRET_KEYS=['githubToken','anthropicApiKey','firebaseConfig','firebaseVapidKey','fcmServerKey','adminPasswordHash','adminPassword'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function readLS(k){ try{return localStorage.getItem(k)}catch(e){return null} }
  function writeLS(k,v){ try{ if(v===null||typeof v==='undefined') localStorage.removeItem(k); else localStorage.setItem(k,String(v)); }catch(e){} }
  function parseMaybe(v){ if(v==null) return null; try{return JSON.parse(v)}catch(e){return v} }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmBackupCards')) return;
    const div=document.createElement('div'); div.id='tmBackupCards';
    div.innerHTML=`<div class="tm-tier"><h4>SEGURIDAD — BACKUP</h4><span class="tm-tier-badge gold">Protección</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="backupai"><span class="state">SAFE</span><div class="ico" style="background:rgba(46,204,113,.18)">🛡️</div><h5>Backup inteligente</h5><p>Respalda, compara y restaura productos, campañas, planes y configuración.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function collect(includeSecrets=false){
    const keys=[...KEYS]; if(includeSecrets) keys.push(...SECRET_KEYS);
    const data={meta:{app:'TiendaMax',version:'backup-v1',createdAt:new Date().toISOString(),includeSecrets,origin:location.origin},localStorage:{}};
    keys.forEach(k=>{ const v=readLS(k); if(v!==null) data.localStorage[k]=parseMaybe(v); });
    try{ if(Array.isArray(window.productos)) data.runtime={productos:window.productos}; }catch(e){}
    return data;
  }
  function sizeOf(obj){ return new Blob([JSON.stringify(obj)]).size; }
  function dl(name,text,type='application/json'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function snapshots(){ try{return JSON.parse(localStorage.getItem(SNAP)||'[]')}catch(e){return[]} }
  function saveSnapshots(v){ localStorage.setItem(SNAP,JSON.stringify(v.slice(0,20))); }
  function openBackup(){
    const b=collect(false); const snaps=snapshots();
    panel('🛡️ Backup inteligente','Crea respaldos antes de usar IA masiva o cambios grandes. Por defecto NO incluye claves secretas.',`
      <div class="tm-an-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px">
        <div class="tm-an-kpi"><small>Tamaño estimado</small><b>${(sizeOf(b)/1024).toFixed(1)} KB</b><em>sin secretos</em></div>
        <div class="tm-an-kpi"><small>Claves incluidas</small><b>${Object.keys(b.localStorage).length}</b><em>localStorage</em></div>
        <div class="tm-an-kpi"><small>Snapshots</small><b>${snaps.length}</b><em>guardados</em></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds13-act="download">Descargar backup</button><button class="tm-btn gold" data-ds13-act="snapshot">Crear snapshot local</button><button class="tm-btn" data-ds13-act="list">Snapshots</button></div>
      <div class="tm-note">No se incluyen tokens/API keys por seguridad. Si necesitas migrar credenciales, usa “Backup con secretos” solo para uso personal.</div>
      <div class="tm-actions"><button class="tm-btn" data-ds13-act="downloadSecrets">Backup con secretos</button></div>
      <div class="tm-field"><label>Restaurar/comparar backup JSON</label><input type="file" id="tmBackupFile" accept="application/json,.json"></div>
      <div class="tm-actions"><button class="tm-btn" data-ds13-act="compare">Comparar</button><button class="tm-btn" data-ds13-act="restore">Restaurar seleccionado</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Listo. Recomendado: descarga un backup antes de ejecutar IA masiva.</div>`);
  }
  function download(includeSecrets=false){ const b=collect(includeSecrets); dl(`tiendamax_backup_${new Date().toISOString().slice(0,10)}${includeSecrets?'_con_secretos':''}.json`,JSON.stringify(b,null,2)); notify('Backup descargado','success'); }
  function createSnapshot(){ const arr=snapshots(); const b=collect(false); arr.unshift({id:Date.now(),ts:new Date().toISOString(),size:sizeOf(b),data:b}); saveSnapshots(arr); notify('✅ Snapshot local creado','success'); const out=$('#tmToolOut'); if(out) out.textContent='Snapshot creado: '+new Date().toLocaleString('es-CU'); }
  function readFile(){
    const f=$('#tmBackupFile')?.files?.[0];
    return new Promise((res,rej)=>{ if(!f) return rej(new Error('Selecciona un archivo JSON')); const r=new FileReader(); r.onload=()=>{try{res(JSON.parse(r.result))}catch(e){rej(new Error('JSON inválido'))}}; r.onerror=()=>rej(new Error('No se pudo leer archivo')); r.readAsText(f); });
  }
  function diffBackup(b){
    const cur=collect(true); const keys=new Set([...Object.keys(cur.localStorage||{}),...Object.keys(b.localStorage||{})]); const rows=[];
    keys.forEach(k=>{ const a=JSON.stringify(cur.localStorage[k]); const c=JSON.stringify(b.localStorage[k]); if(a!==c) rows.push({key:k,current:a?JSON.parse(a).length||a.length:0,backup:c?JSON.parse(c).length||c.length:0,missingCurrent:!(k in cur.localStorage),missingBackup:!(k in b.localStorage)}); });
    return rows;
  }
  async function compare(){ try{ const b=await readFile(); const rows=diffBackup(b); const out=$('#tmToolOut'); if(out) out.textContent=`Comparación\nBackup: ${b.meta?.createdAt||'sin fecha'}\nDiferencias: ${rows.length}\n\n`+rows.slice(0,80).map(r=>`• ${r.key}${r.missingCurrent?' (no existe actual)':''}${r.missingBackup?' (no existe en backup)':''}`).join('\n'); }catch(e){notify(e.message,'error');} }
  async function restore(){
    try{
      const b=await readFile(); if(!b.localStorage) throw new Error('Backup sin localStorage');
      if(!confirm('¿Restaurar este backup? Se creará snapshot local antes.')) return;
      createSnapshot();
      Object.entries(b.localStorage).forEach(([k,v])=>writeLS(k, typeof v==='string'?v:JSON.stringify(v)));
      if(b.runtime&&Array.isArray(b.runtime.productos)){ writeLS('productos',JSON.stringify(b.runtime.productos)); window.productos=b.runtime.productos; }
      notify('✅ Backup restaurado. Recarga el admin.','success'); const out=$('#tmToolOut'); if(out) out.textContent='Restaurado. Recarga la página para aplicar todo.';
    }catch(e){notify(e.message,'error');}
  }
  function listSnapshots(){
    const arr=snapshots();
    panel('🛡️ Snapshots locales','Restauraciones rápidas guardadas en este navegador.',`<div class="tm-actions"><button class="tm-btn" data-ds13-act="open">Volver</button><button class="tm-btn" data-ds13-act="snapshot">Crear snapshot</button></div><div class="tm-list">${arr.map((s,i)=>`<div class="tm-row"><div class="tm-row-main"><b>${new Date(s.ts).toLocaleString('es-CU')}</b><small>${(Number(s.size||0)/1024).toFixed(1)} KB · ${Object.keys(s.data?.localStorage||{}).length} claves</small></div><button class="tm-btn tm-mini" data-ds13-act="downloadSnap" data-i="${i}">Descargar</button><button class="tm-btn tm-mini" data-ds13-act="restoreSnap" data-i="${i}">Restaurar</button><button class="tm-btn tm-mini" data-ds13-act="delSnap" data-i="${i}">Eliminar</button></div>`).join('')||'<div class="tm-note">Sin snapshots.</div>'}</div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Selecciona snapshot.</div>`);
  }
  function restoreSnap(i){ const arr=snapshots(); const s=arr[Number(i)]; if(!s)return; if(!confirm('¿Restaurar snapshot local?'))return; Object.entries(s.data.localStorage||{}).forEach(([k,v])=>writeLS(k,typeof v==='string'?v:JSON.stringify(v))); notify('Snapshot restaurado. Recarga el admin.','success'); }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="backupai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openBackup();return;}
    const a=e.target.closest('[data-ds13-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds13Act; if(act==='open')openBackup(); if(act==='download')download(false); if(act==='downloadSecrets')download(true); if(act==='snapshot')createSnapshot(); if(act==='compare')compare(); if(act==='restore')restore(); if(act==='list')listSnapshots();
    if(act==='downloadSnap'){const s=snapshots()[Number(a.dataset.i)]; if(s) dl(`tiendamax_snapshot_${String(s.ts).slice(0,10)}.json`,JSON.stringify(s.data,null,2));}
    if(act==='restoreSnap')restoreSnap(a.dataset.i); if(act==='delSnap'){const arr=snapshots(); arr.splice(Number(a.dataset.i),1); saveSnapshots(arr); listSnapshots();}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2000));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v14 ─────────────────────────────────────────
(function(){
  const AUTO='tm_autopilot_state_v1', CAMP='tm_campaigns_v1', BACK='tm_full_backups_v1';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  async function analytics(){ try{ if(typeof tmLeerAnalytics==='function') return await tmLeerAnalytics(); }catch(e){} return {vistas:{},whatsapp:{},suscriptores:Number(localStorage.getItem('tm_subscriber_count')||0)}; }
  function campaigns(){ try{return JSON.parse(localStorage.getItem(CAMP)||'[]')}catch(e){return[]} }
  function saveCampaigns(v){ localStorage.setItem(CAMP,JSON.stringify(v.slice(0,150))); }
  function state(){ try{return JSON.parse(localStorage.getItem(AUTO)||'{}')}catch(e){return{}} }
  function setState(s){ localStorage.setItem(AUTO,JSON.stringify({...s,date:new Date().toISOString().slice(0,10)})); }
  function todayName(){ return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()]; }
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function productUrl(p){return p&&p.id?`/p/producto-${p.id}.html`:'/';}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmAutopilotCards')) return;
    const div=document.createElement('div'); div.id='tmAutopilotCards';
    div.innerHTML=`<div class="tm-tier"><h4>ADMIN — PILOTO AUTOMÁTICO</h4><span class="tm-tier-badge purple">Guiado</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="autopilot"><span class="state">SAFE</span><div class="ico" style="background:rgba(155,89,182,.18)">🤖</div><h5>Piloto automático seguro</h5><p>Rutina diaria guiada: backup, tareas, campaña, push y registro.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function stepLine(done,label,desc){return `<div class="tm-row"><div class="tm-row-main"><b>${done?'✅':'⬜'} ${esc(label)}</b><small>${esc(desc||'')}</small></div></div>`;}
  function openAuto(){
    const s=state(); const today=new Date().toISOString().slice(0,10); if(s.date!==today){setState({});}
    const st=state();
    panel('🤖 Piloto automático seguro','Rutina diaria con confirmación en cada paso. Nada peligroso se ejecuta solo.',`
      <div class="tm-note">Flujo recomendado: backup → tareas → campaña → aplicar push → guardar campaña → resumen final.</div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds14-act="runNext">Ejecutar siguiente paso</button><button class="tm-btn" data-ds14-act="reset">Reiniciar rutina</button></div>
      <div class="tm-list" style="margin-top:12px">
        ${stepLine(st.backup,'1. Crear backup/snapshot','Protege datos antes de cambios.')}
        ${stepLine(st.tasks,'2. Analizar tareas de hoy','Stock, campañas, plan semanal y pendientes.')}
        ${stepLine(st.campaign,'3. Generar campaña recomendada','IA si está configurada; fallback local si no.')}
        ${stepLine(st.push,'4. Aplicar push','Rellena campos de Configuración, no envía automáticamente.')}
        ${stepLine(st.saved,'5. Guardar campaña','Registra en historial y marca producto publicado.')}
        ${stepLine(st.final,'6. Resumen final','Checklist listo para ejecutar.')}
      </div>
      <div class="tm-actions"><button class="tm-btn" data-ds14-act="backup">1 Backup</button><button class="tm-btn" data-ds14-act="tasks">2 Tareas</button><button class="tm-btn" data-ds14-act="campaign">3 Campaña</button><button class="tm-btn" data-ds14-act="push">4 Aplicar push</button><button class="tm-btn" data-ds14-act="save">5 Guardar</button><button class="tm-btn gold" data-ds14-act="final">6 Final</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Piloto listo. Pulsa “Ejecutar siguiente paso”.</div>`);
  }
  function collectBackup(){
    const keys=['productos','categorias','subcategorias','heroBanners','gruposFB','revolicoConfig','registroVentas','tm_campaigns_v1','tm_week_plan_v1','tm_tools_data_v1','tm_subscriber_count','tasaMN','whatsappNumber'];
    const data={meta:{createdAt:new Date().toISOString(),type:'autopilot-snapshot'},localStorage:{}};
    keys.forEach(k=>{const v=localStorage.getItem(k); if(v!==null){try{data.localStorage[k]=JSON.parse(v)}catch(e){data.localStorage[k]=v}}});
    return data;
  }
  function doBackup(){
    const arr=(()=>{try{return JSON.parse(localStorage.getItem(BACK)||'[]')}catch(e){return[]}})();
    const b=collectBackup(); arr.unshift({id:Date.now(),ts:new Date().toISOString(),size:new Blob([JSON.stringify(b)]).size,data:b}); localStorage.setItem(BACK,JSON.stringify(arr.slice(0,20)));
    const s=state(); s.backup=true; setState(s); $('#tmToolOut').textContent='✅ Backup/snapshot local creado antes de la rutina.'; notify('Backup creado','success'); openAuto();
  }
  function collectTasks(){
    const ps=products(), vs=ventas(); const tasks=[];
    ps.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3).slice(0,8).forEach(p=>tasks.push('Stock bajo: '+p.nombre+' ('+p.stock+')'));
    ps.filter(p=>Number(p.stock||0)<=0).slice(0,6).forEach(p=>tasks.push('Agotado: '+p.nombre));
    ps.filter(p=>!p.seoTitle&&!p.seoDescription).slice(0,6).forEach(p=>tasks.push('Sin SEO: '+p.nombre));
    ps.filter(p=>!Array.isArray(p.recomendados)||!p.recomendados.length).slice(0,6).forEach(p=>tasks.push('Sin recomendaciones: '+p.nombre));
    const today0=new Date(); today0.setHours(0,0,0,0); const vh=vs.filter(v=>Number(v.id||0)>=today0.getTime()); if(vh.length) tasks.unshift('Ventas de hoy: '+vh.length+' ('+money(vh.reduce((s,v)=>s+Number(v.total||0),0))+')');
    return tasks;
  }
  function doTasks(){
    const t=collectTasks(); const s=state(); s.tasks=true; s.taskSummary=t; setState(s); openAuto(); const out=$('#tmToolOut'); if(out) out.textContent='TAREAS DETECTADAS\n\n'+(t.map(x=>'• '+x).join('\n')||'No hay tareas críticas.'); notify('Tareas analizadas','success');
  }
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  async function doCampaign(){
    openAuto(); const out=$('#tmToolOut'); if(out) out.textContent='⏳ Generando campaña recomendada...';
    const ps=products(), an=await analytics(), st=state();
    const pool=ps.filter(p=>Number(p.stock||0)>0).map(p=>({p,score:Number(p.stock||0)+Number(an.vistas?.[String(p.id)]||0)*2+Number(an.whatsapp?.[String(p.id)]||0)*4})).sort((a,b)=>b.score-a.score);
    const p=(pool[0]||{}).p||ps[0]||{};
    const ctx={producto:{id:p.id,nombre:p.nombre,descripcion:p.descripcion,categoria:p.categoria,precio:p.precioActual,stock:p.stock,url:productUrl(p)},suscriptores:an.suscriptores||0,tareas:st.taskSummary||collectTasks()};
    let text='';
    try{text=await deepseek('Crea una campaña diaria para hoy con estos datos:\n'+JSON.stringify(ctx,null,2)+'\nIncluye FACEBOOK, WHATSAPP, PUSH con Título/Mensaje/URL, STORY y PLAN de 3 pasos.');}
    catch(e){text=`CAMPAÑA DIARIA LOCAL\n\nProducto: ${p.nombre}\n\nFACEBOOK:\n🔥 ${p.nombre}\n\n${p.descripcion||'Disponible en TiendaMax.'}\n\n💵 ${money(p.precioActual)} USD\n📦 Stock: ${p.stock||0}\n📲 Escríbenos por WhatsApp para reservar.\n\nWHATSAPP:\nHola 👋 Tenemos ${p.nombre} disponible en ${money(p.precioActual)} USD. Si te interesa, te lo puedo reservar.\n\nPUSH:\nTítulo: 🔥 ${String(p.nombre||'Oferta').slice(0,30)}\nMensaje: Disponible en TiendaMax por ${money(p.precioActual)}. Reserva por WhatsApp.\nURL: ${productUrl(p)}\n\nSTORY:\n${p.nombre} · ${money(p.precioActual)} USD\n\nPLAN:\n1) Publicar Facebook.\n2) Aplicar push.\n3) Guardar campaña y revisar mañana.\n\n⚠️ ${e.message}`;}
    const s=state(); s.campaign=true; s.campaignText=text; s.productId=p.id; s.productName=p.nombre; setState(s); openAuto(); const out2=$('#tmToolOut'); if(out2) out2.textContent=text; localStorage.setItem('tm_last_campaign_text',text); notify('Campaña lista','success');
  }
  function parsePush(text,p){return {title:(text.match(/T[ií]tulo\s*:\s*(.+)/i)||[])[1]?.trim()||('🔥 '+String(p||'TiendaMax').slice(0,30)),body:(text.match(/Mensaje\s*:\s*(.+)/i)||[])[1]?.trim()||'Disponible en TiendaMax. Reserva por WhatsApp.',url:(text.match(/URL\s*:\s*(\S+)/i)||[])[1]?.trim()||'/'};}
  function doPush(){
    const s=state(); if(!s.campaignText){notify('Primero genera campaña','warning'); return;}
    const pu=parsePush(s.campaignText,s.productName); s.push=true; setState(s);
    if(typeof switchTab==='function') switchTab('configuracion');
    setTimeout(()=>{const t=$('#manualPushTitle'), b=$('#manualPushBody'), u=$('#manualPushUrl'); if(t)t.value=pu.title.slice(0,55); if(b)b.value=pu.body.slice(0,120); if(u)u.value=pu.url; notify('Push aplicado; revísalo antes de enviar','success');},250);
  }
  function doSave(){
    const s=state(); if(!s.campaignText){notify('Primero genera campaña','warning');return;}
    const arr=campaigns(); arr.unshift({id:Date.now(),ts:new Date().toISOString(),title:'Autopiloto '+new Date().toLocaleDateString('es-CU'),productId:s.productId||null,productName:s.productName||'',channels:['Facebook','WhatsApp','Push','Story'],text:s.campaignText,status:'publicada desde autopiloto',followUpAt:new Date(Date.now()+24*3600000).toISOString(),result:''}); saveCampaigns(arr);
    s.saved=true; setState(s); openAuto(); $('#tmToolOut').textContent='✅ Campaña guardada en historial. Revisa mañana el seguimiento.'; notify('Campaña guardada','success');
  }
  function doFinal(){
    const s=state(); s.final=true; setState(s); openAuto(); const out=$('#tmToolOut'); if(out) out.textContent=`CHECKLIST FINAL\n\n${s.backup?'✅':'⬜'} Backup creado\n${s.tasks?'✅':'⬜'} Tareas revisadas\n${s.campaign?'✅':'⬜'} Campaña generada\n${s.push?'✅':'⬜'} Push aplicado en formulario\n${s.saved?'✅':'⬜'} Campaña guardada\n\nSiguiente: si el push está correcto, envíalo desde Configuración. Luego marca seguimiento mañana.`;
  }
  async function next(){const s=state(); if(!s.backup)return doBackup(); if(!s.tasks)return doTasks(); if(!s.campaign)return doCampaign(); if(!s.push)return doPush(); if(!s.saved)return doSave(); return doFinal();}
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="autopilot"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openAuto();return;}
    const a=e.target.closest('[data-ds14-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds14Act; if(act==='runNext')next(); if(act==='backup')doBackup(); if(act==='tasks')doTasks(); if(act==='campaign')doCampaign(); if(act==='push')doPush(); if(act==='save')doSave(); if(act==='final')doFinal(); if(act==='reset'){localStorage.removeItem(AUTO); openAuto();}
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2100));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();


// ── tm-deepseek-tools-v15 / Diagnóstico total ─────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDiagnosticCards')) return;
    const div=document.createElement('div'); div.id='tmDiagnosticCards';
    div.innerHTML=`<div class="tm-tier"><h4>SISTEMA — DIAGNÓSTICO</h4><span class="tm-tier-badge gold">Health</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="diagall"><span class="state">TEST</span><div class="ico" style="background:rgba(79,195,247,.18)">🧪</div><h5>Diagnóstico total</h5><p>Revisa funciones, Firebase, Service Worker, datos, IA y archivos críticos.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openDiag(){
    panel('🧪 Diagnóstico total TiendaMax','Prueba rápida de módulos críticos y genera reporte para depurar.',`
      <div class="tm-actions"><button class="tm-btn primary" data-ds15-act="runDiag">Ejecutar diagnóstico</button><button class="tm-btn" data-ds15-act="copyDiag">Copiar reporte</button><button class="tm-btn" data-ds15-act="exportDiag">Exportar JSON</button><a class="tm-btn" href="tests/health-check.html" target="_blank">Health Check avanzado</a></div>
      <div id="tmDiagSummary" class="tm-an-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:12px 0"></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Pulsa “Ejecutar diagnóstico”.</div>`);
  }
  async function fetchOk(url, timeout=7000){
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
    try{const r=await fetch(url+(url.includes('?')?'&':'?')+'_='+Date.now(),{cache:'no-store',signal:ctrl.signal}); return {ok:r.ok,status:r.status};}
    catch(e){return {ok:false,status:0,error:e.message};} finally{clearTimeout(t);}
  }
  async function firebaseCfg(){
    try{const raw=localStorage.getItem('firebaseConfig'); if(raw){const c=JSON.parse(raw); if(c&&c.databaseURL) return c;}}catch(e){}
    try{const r=await fetchOk('config.json'); if(!r.ok) return null; const j=await (await fetch('config.json?_='+Date.now(),{cache:'no-store'})).json(); if(j.firebaseConfig){localStorage.setItem('firebaseConfig',JSON.stringify(j.firebaseConfig)); return j.firebaseConfig;}}catch(e){}
    return null;
  }
  function add(res,level,name,msg,extra){res.push({level,name,msg,extra:extra||null});}
  async function runDiag(){
    const out=$('#tmToolOut'), sum=$('#tmDiagSummary'); if(out) out.textContent='⏳ Ejecutando diagnóstico...';
    const res=[];
    // DOM
    ['adminPanel','inicio','add-products','manage-products','ventas','analytics','configuracion','herramientas','tmToolPanel'].forEach(id=>add(res,document.getElementById(id)?'pass':'fail','DOM #'+id,document.getElementById(id)?'Existe':'No encontrado'));
    // Funciones globales
    ['switchTab','sincronizarTodoConGitHub','cargarVentas','renderizarVentas','tmLeerAnalytics','tmRegistrarTokenFCMSiPermitido','tmLimpiarTokensInvalidos','mostrarNotificacion'].forEach(fn=>add(res,typeof window[fn]==='function'?'pass':'warn','Función '+fn,typeof window[fn]==='function'?'Disponible':'No disponible ahora'));
    // Storage
    try{localStorage.setItem('_tm_diag','1'); add(res,localStorage.getItem('_tm_diag')==='1'?'pass':'fail','localStorage','Lectura/escritura'); localStorage.removeItem('_tm_diag');}catch(e){add(res,'fail','localStorage',e.message);}
    const ps=products(); add(res,ps.length?'pass':'fail','Productos',ps.length+' productos cargados');
    const ids=ps.map(p=>String(p.id)); const dup=ids.filter((x,i)=>ids.indexOf(x)!==i); add(res,dup.length?'warn':'pass','IDs productos',dup.length?('Duplicados: '+[...new Set(dup)].slice(0,5).join(', ')):'Sin duplicados');
    const noImg=ps.filter(p=>!p.imagen).length; add(res,noImg?'warn':'pass','Imágenes productos',noImg?noImg+' sin imagen principal':'Todas con imagen');
    const noSeo=ps.filter(p=>!p.seoTitle&&!p.seoDescription).length; add(res,noSeo?'warn':'pass','SEO productos',noSeo?noSeo+' sin SEO':'SEO completo');
    const noRecs=ps.filter(p=>!Array.isArray(p.recomendados)||!p.recomendados.length).length; add(res,noRecs?'warn':'pass','Recomendaciones IA',noRecs?noRecs+' sin recomendaciones':'Completas');
    // Archivos críticos
    for(const f of ['admin.html','index.html','css/admin.css','js/script.js','js/analytics.js','js/push-fix.js','js/admin-ai-tools.min.js','js/seo-dynamico.js','sw.js','firebase-messaging-sw.js','config.json','productos.json']){const r=await fetchOk(f); add(res,r.ok?'pass':'fail','Archivo '+f,r.ok?'OK HTTP '+r.status:'Fallo HTTP '+r.status+(r.error?' '+r.error:''));}
    // Firebase
    const cfg=await firebaseCfg(); add(res,cfg&&cfg.databaseURL?'pass':'fail','Firebase config',cfg&&cfg.databaseURL?cfg.databaseURL:'No configurado');
    if(cfg&&cfg.databaseURL){
      const base=cfg.databaseURL.replace(/\/$/,'');
      const vr=await fetchOk(base+'/ventas.json'); add(res,vr.ok?'pass':'fail','Firebase /ventas read',vr.ok?'Lectura OK':'HTTP '+vr.status+' — revisa reglas .read');
      const tr=await fetchOk(base+'/tokens.json'); add(res,tr.ok?'pass':'warn','Firebase /tokens read',tr.ok?'Lectura OK':'HTTP '+tr.status);
      const ar=await fetchOk(base+'/analytics/vistas.json'); add(res,ar.ok?'pass':'warn','Firebase analytics read',ar.ok?'Lectura OK':'HTTP '+ar.status);
    }
    // SW / push
    add(res,'serviceWorker'in navigator?'pass':'fail','Service Worker soporte','serviceWorker' in navigator?'Soportado':'No soportado');
    try{const reg=await navigator.serviceWorker?.getRegistration?.('/'); add(res,reg?'pass':'warn','SW registro /',reg?('Activo: '+!!reg.active):'No registrado aún');}catch(e){add(res,'warn','SW registro',e.message);}
    add(res,'Notification'in window?'pass':'warn','Notificaciones soporte','Notification' in window?Notification.permission:'No soportado');
    // IA / herramientas
    const key=localStorage.getItem('anthropicApiKey'); add(res,key?'pass':'warn','IA/API key',key?'Key guardada ('+key.slice(0,6)+'…)':'No configurada');
    add(res,document.querySelector('script[src*="admin-ai-tools.min.js"]')?'pass':'fail','Admin AI tools','Script minificado cargado en admin.html');
    // Campañas/planes/backups
    ['tm_campaigns_v1','tm_week_plan_v1','tm_full_backups_v1'].forEach(k=>{let n=0;try{n=JSON.parse(localStorage.getItem(k)||'[]').length}catch(e){} add(res,'pass','Datos '+k,n+' registros');});
    window.__tmLastDiag=res;
    render(res);
  }
  function render(res){
    const out=$('#tmToolOut'), sum=$('#tmDiagSummary'); const counts={pass:0,warn:0,fail:0}; res.forEach(r=>counts[r.level]++);
    if(sum) sum.innerHTML=`<div class="tm-an-kpi"><small>OK</small><b style="color:#2ECC71">${counts.pass}</b><em>pasaron</em></div><div class="tm-an-kpi"><small>Alertas</small><b style="color:#f39c12">${counts.warn}</b><em>revisar</em></div><div class="tm-an-kpi"><small>Fallos</small><b style="color:#e74c3c">${counts.fail}</b><em>críticos</em></div>`;
    if(out) out.innerHTML=res.map(r=>`${r.level==='pass'?'✅':r.level==='warn'?'⚠️':'❌'} <b>${esc(r.name)}</b> — ${esc(r.msg)}`).join('<br>')+`<br><br>Resultado: ${counts.fail?'hay fallos que corregir':'sin fallos críticos'}.`;
    notify(counts.fail?'Diagnóstico con fallos':'Diagnóstico completado',counts.fail?'error':'success');
  }
  function copy(){const res=window.__tmLastDiag||[]; navigator.clipboard?.writeText(res.map(r=>`${r.level.toUpperCase()} | ${r.name} | ${r.msg}`).join('\n')); notify('Reporte copiado','success');}
  function exportJson(){const res=window.__tmLastDiag||[]; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify({date:new Date().toISOString(),results:res},null,2)],{type:'application/json'})); a.download='diagnostico_tiendamax.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="diagall"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openDiag();return;}
    const a=e.target.closest('[data-ds15-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(a.dataset.ds15Act==='runDiag')runDiag(); if(a.dataset.ds15Act==='copyDiag')copy(); if(a.dataset.ds15Act==='exportDiag')exportJson();
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2200));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();


// ── OpenRouter config helper ─────────────────────────────────────
(function(){
  function addOpenRouterConfig(){
    const keyInput=document.getElementById('anthropicApiKey'); if(!keyInput || document.getElementById('tmOpenRouterModel')) return;
    keyInput.placeholder='sk-or-... (OpenRouter) / sk-... (IA) / AIza... / gsk_...';
    const wrap=document.createElement('div');
    wrap.className='tm-openrouter-config';
    wrap.innerHTML='<label style="display:block;margin-top:10px">Modelo OpenRouter gratuito/preferido<input id="tmOpenRouterModel" type="text" placeholder="openrouter/free" style="font-family:monospace;font-size:12px"></label><p style="font-size:11px;color:#888;margin-top:4px">Ejemplos: openrouter/free, deepseek/deepseek-r1:free, qwen/qwen3-235b-a22b:free. Depende de disponibilidad de OpenRouter.</p>';
    keyInput.closest('label')?.insertAdjacentElement('afterend',wrap);
    const inp=document.getElementById('tmOpenRouterModel'); if(inp){inp.value=localStorage.getItem('tmOpenRouterModel')||'openrouter/free'; inp.addEventListener('input',()=>localStorage.setItem('tmOpenRouterModel',inp.value.trim()||'openrouter/free'));}
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(addOpenRouterConfig,1200));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="configuracion"],[data-tab="configuracion"]')) setTimeout(addOpenRouterConfig,300);});
})();


// ── tm-tools-organizer-v1 / Organizador visual de Herramientas ─────────────
(function(){
  const CAT_LABELS={basicas:'🧰 Básicas',gestion:'📋 Gestión',datos:'📊 Datos/Ventas',ia:'🤖 IA',marketing:'📣 Marketing',sistema:'🛡️ Sistema'};
  const TOOL_CAT={
    guideagent:'sistema',interesados:'datos',statusshare:'marketing',preflight:'sistema',pushmanager:'marketing',artifacts:'sistema',cleaner:'sistema',dormant:'datos',restock:'datos',statusshare:'marketing',templates:'marketing',calendar:'marketing',actionsstatus:'sistema',bulkadjust:'gestion',quickedit:'gestion',catalogqa:'sistema',namesfix:'basicas',ai:'ia',posts:'marketing',pushai:'ia',waai:'ia',auditai:'ia',insightsai:'ia',seoai:'ia',recsai:'ia',bulkai:'ia',chatai:'ia',
    campaignai:'marketing',publisherai:'marketing',campdash:'marketing',weekplanner:'marketing',taskcenter:'marketing',autopilot:'marketing',
    compress:'basicas',duplicate:'basicas',history:'basicas',csv:'basicas',dups:'basicas',
    schedule:'gestion',coupons:'gestion',locations:'gestion',ab:'gestion',totp:'gestion',roles:'gestion',
    competitors:'datos',margin:'datos',heatmap:'datos',crm:'datos',shipping:'datos',
    backupai:'sistema',diagall:'sistema'
  };
  function $(s,r=document){return r.querySelector(s)}
  function organizeTools(){
    const wrap=document.querySelector('#herramientas .tm-tools-wrap'); const panel=document.getElementById('tmToolPanel');
    if(!wrap||!panel) return;
    let org=document.getElementById('tmToolsOrganizer');
    if(!org){
      org=document.createElement('div'); org.id='tmToolsOrganizer'; org.className='tm-tools-organizer';
      org.innerHTML=`<div class="tm-tools-org-head"><div><b>Panel de herramientas</b><small>Todo organizado por categoría</small></div><div class="tm-tools-filter"><button class="tm-org-chip active" data-filter="all">Todas</button>${Object.entries(CAT_LABELS).map(([k,v])=>`<button class="tm-org-chip" data-filter="${k}">${v}</button>`).join('')}</div></div><div class="tm-tools-groups"></div>`;
      wrap.insertBefore(org,panel);
      org.addEventListener('click',e=>{
        const chip=e.target.closest('.tm-org-chip'); if(!chip) return;
        org.querySelectorAll('.tm-org-chip').forEach(b=>b.classList.toggle('active',b===chip));
        const f=chip.dataset.filter;
        org.querySelectorAll('.tm-tool-group').forEach(g=>{g.style.display=(f==='all'||g.dataset.cat===f)?'block':'none';});
      });
    }
    const groups=org.querySelector('.tm-tools-groups');
    Object.entries(CAT_LABELS).forEach(([cat,label])=>{
      if(!groups.querySelector(`[data-cat="${cat}"]`)){
        const g=document.createElement('section'); g.className='tm-tool-group'; g.dataset.cat=cat;
        g.innerHTML=`<div class="tm-tool-group-title">${label}</div><div class="tm-tools-grid tm-tools-grid-org"></div>`;
        groups.appendChild(g);
      }
    });
    const cards=Array.from(wrap.querySelectorAll('.tm-tool-card[data-tool]')).filter(c=>!c.closest('#tmToolsOrganizer'));
    cards.forEach(card=>{
      const tool=card.dataset.tool; const cat=TOOL_CAT[tool]||'basicas';
      card.dataset.toolCat=cat;
      const grid=groups.querySelector(`[data-cat="${cat}"] .tm-tools-grid-org`);
      if(grid) grid.appendChild(card);
    });
    // Ocultar contenedores originales que quedaron vacíos para que no se vea regado.
    Array.from(wrap.children).forEach(ch=>{
      if(ch.id==='tmToolsOrganizer'||ch.id==='tmToolPanel'||ch.classList.contains('tm-tools-hero')||ch.tagName==='H3') return;
      if(ch.classList.contains('tm-tier')||ch.classList.contains('tm-tools-grid')||(/^tmIA|^tmAdmin|^tmBackup|^tmAutopilot|^tmDiagnostic|^tmTools/.test(ch.id||''))){
        if(!ch.querySelector('.tm-tool-card')) ch.style.display='none';
      }
    });
    // Ocultar grupos vacíos.
    groups.querySelectorAll('.tm-tool-group').forEach(g=>{g.style.display=g.querySelector('.tm-tool-card')?'block':'none';});
    const active=org.querySelector('.tm-org-chip.active')?.dataset.filter||'all';
    if(active!=='all') groups.querySelectorAll('.tm-tool-group').forEach(g=>{g.style.display=(g.dataset.cat===active&&g.querySelector('.tm-tool-card'))?'block':'none';});
  }
  function boot(){ organizeTools(); setTimeout(organizeTools,600); setTimeout(organizeTools,1400); setTimeout(organizeTools,2600); }
  document.addEventListener('DOMContentLoaded',boot);
  document.addEventListener('click',e=>{ if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,250); });
  window.tmOrganizeTools=organizeTools;
})();

// ── tm-deepseek-tools-v16 / Normalizador de nombres ─────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  const fixes=[
    [/\bbateria\b/gi,'batería'],[/\bbaterias\b/gi,'baterías'],[/\belectrico\b/gi,'eléctrico'],[/\belectrica\b/gi,'eléctrica'],[/\binalambrico\b/gi,'inalámbrico'],[/\binalambrica\b/gi,'inalámbrica'],[/\bportatil\b/gi,'portátil'],[/\blampara\b/gi,'lámpara'],[/\bcamara\b/gi,'cámara'],[/\btelefono\b/gi,'teléfono'],[/\baudifonos\b/gi,'audífonos'],[/\bmicrofono\b/gi,'micrófono'],[/\bautomatico\b/gi,'automático'],[/\bautomatica\b/gi,'automática'],[/\bbascula\b/gi,'báscula'],[/\bplastico\b/gi,'plástico'],[/\bclasico\b/gi,'clásico'],[/\bclasica\b/gi,'clásica'],[/\btactil\b/gi,'táctil'],[/\bmovil\b/gi,'móvil'],[/\brefrigeracion\b/gi,'refrigeración'],[/\bliquida\b/gi,'líquida'],[/\bliquido\b/gi,'líquido'],[/\bsolido\b/gi,'sólido'],[/\bvehiculo\b/gi,'vehículo'],[/\bsintetico\b/gi,'sintético'],[/\bsemisintetico\b/gi,'semisintético'],[/\benergia\b/gi,'energía'],[/\bproteccion\b/gi,'protección'],[/\bconexion\b/gi,'conexión'],[/\bextension\b/gi,'extensión'],[/\bconversion\b/gi,'conversión'],[/\badaptador\b/gi,'adaptador'],[/\brouter\b/gi,'router'],[/\bwi[\s-]?fi\b/gi,'wifi'],[/\bbluetooh\b/gi,'bluetooth'],[/\bbluetooth\b/gi,'bluetooth'],[/\blifepo\s*4\b/gi,'LiFePO4'],[/\bmah\b/gi,'mAh'],[/\bgb\b/gi,'GB'],[/\btb\b/gi,'TB'],[/\busb\b/gi,'USB'],[/\bled\b/gi,'LED'],[/\bhdmi\b/gi,'HDMI']
  ];
  function normalizeName(name){
    let s=String(name||'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
    fixes.forEach(([re,val])=>{s=s.replace(re,val);});
    s=s.replace(/\s*\/\s*/g,' / ').replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim();
    return s.toLocaleUpperCase('es-CU');
  }
  function changes(){return products().map(p=>({id:p.id,old:p.nombre||'',neu:normalizeName(p.nombre||'')})).filter(x=>x.old!==x.neu);}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="namesfix"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid'; div.innerHTML='<div class="tm-tool-card enabled" data-tool="namesfix"><span class="state">CLEAN</span><div class="ico" style="background:rgba(201,169,110,.18)">🔠</div><h5>Normalizar nombres</h5><p>Pasa productos a MAYÚSCULAS y corrige faltas comunes.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function openTool(){
    const ch=changes();
    panel('🔠 Normalizar nombres de productos','Pasa todos los nombres a MAYÚSCULAS, corrige acentos comunes y deja el catálogo parejo.',`
      <div class="tm-note">No toca precios, stock, imágenes ni descripciones. Crea un cambio local; después pulsa “Actualizar tienda”.</div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds16-act="preview">Vista previa</button><button class="tm-btn gold" data-ds16-act="apply">Aplicar cambios</button><button class="tm-btn" data-ds16-act="copyOut">Copiar lista</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">${ch.length?`Hay ${ch.length} nombre(s) por normalizar. Pulsa Vista previa.`:'Todos los nombres parecen estar normalizados.'}</div>`);
  }
  function preview(){
    const out=$('#tmToolOut'), ch=changes(); if(!out)return;
    out.textContent=ch.length?`Cambios detectados: ${ch.length}\n\n`+ch.slice(0,120).map((x,i)=>`${i+1}. ${x.old}\n   → ${x.neu}`).join('\n\n'):'No hay cambios pendientes.';
  }
  function apply(){
    const ch=changes(); if(!ch.length){notify('No hay nombres por cambiar','info');return;}
    if(!confirm(`¿Aplicar normalización a ${ch.length} producto(s)?`)) return;
    const map=new Map(ch.map(x=>[String(x.id),x.neu]));
    const ps=products().map(p=>map.has(String(p.id))?{...p,nombre:map.get(String(p.id)),nombreNormalizadoAt:new Date().toISOString()}:p);
    ps.forEach(p=>{if(map.has(String(p.id))){try{if(typeof marcarProductoModificado==='function') marcarProductoModificado(p.id);}catch(e){}}});
    saveProducts(ps);
    try{ if(typeof sincronizarConGitHub==='function') sincronizarConGitHub(); }catch(e){}
    try{ if(typeof renderizarProductos==='function') renderizarProductos(); }catch(e){}
    try{ if(typeof renderizarMasVendidos==='function') renderizarMasVendidos(); }catch(e){}
    try{ if(typeof renderizarCategoriasHome==='function') renderizarCategoriasHome(); }catch(e){}
    try{ if(typeof actualizarListaProductos==='function') actualizarListaProductos(); }catch(e){}
    try{ if(typeof actualizarDashboard==='function') actualizarDashboard(); }catch(e){}
    const out=$('#tmToolOut'); if(out) out.textContent=`✅ Normalizados ${ch.length} producto(s). Sincronizando con GitHub automáticamente…`;
    notify('✅ Nombres normalizados y sincronizando con GitHub…','success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="namesfix"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds16-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(a.dataset.ds16Act==='preview')preview(); if(a.dataset.ds16Act==='apply')apply(); if(a.dataset.ds16Act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2300));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v17 / Control de calidad de catálogo ───────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="catalogqa"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid'; div.innerHTML='<div class="tm-tool-card enabled" data-tool="catalogqa"><span class="state">QA</span><div class="ico" style="background:rgba(79,195,247,.18)">🧾</div><h5>Calidad catálogo</h5><p>Detecta errores de productos: precio, imagen, SEO, stock y duplicados.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function scan(){
    const ps=products(); const issues=[]; const seen={};
    ps.forEach(p=>{ const k=norm(p.nombre); if(k){seen[k]=seen[k]||[]; seen[k].push(p);} });
    Object.values(seen).filter(a=>a.length>1).forEach(arr=>arr.forEach(p=>issues.push({level:'warn',type:'Duplicado',id:p.id,name:p.nombre,msg:'Nombre parecido/repetido en catálogo'})));
    ps.forEach(p=>{
      const name=String(p.nombre||'').trim(); const desc=String(p.descripcion||'').trim(); const price=Number(p.precioActual||0); const stock=Number(p.stock||0);
      if(!name) issues.push({level:'fail',type:'Nombre',id:p.id,name:'(sin nombre)',msg:'Producto sin nombre'});
      else {
        if(name.length<6) issues.push({level:'warn',type:'Nombre',id:p.id,name,msg:'Nombre demasiado corto'});
        if(name.length>85) issues.push({level:'warn',type:'Nombre',id:p.id,name,msg:'Nombre demasiado largo para tarjeta'});
        if(/[a-záéíóúñ]/.test(name)) issues.push({level:'info',type:'Nombre',id:p.id,name,msg:'Nombre no está completamente en mayúsculas'});
      }
      if(!desc) issues.push({level:'warn',type:'Descripción',id:p.id,name,msg:'Sin descripción'});
      else if(desc.length<80) issues.push({level:'warn',type:'Descripción',id:p.id,name,msg:'Descripción corta (<80 caracteres)'});
      if(!price || price<=0) issues.push({level:'fail',type:'Precio',id:p.id,name,msg:'Precio actual vacío o 0'});
      if(stock<0) issues.push({level:'fail',type:'Stock',id:p.id,name,msg:'Stock negativo'});
      if(stock===0) issues.push({level:'info',type:'Stock',id:p.id,name,msg:'Agotado / stock 0'});
      if(stock>0 && stock<=3) issues.push({level:'warn',type:'Stock',id:p.id,name,msg:'Stock bajo (≤3)'});
      if(!p.categoria) issues.push({level:'fail',type:'Categoría',id:p.id,name,msg:'Sin categoría'});
      if(!p.subcategoria) issues.push({level:'info',type:'Subcategoría',id:p.id,name,msg:'Sin subcategoría'});
      if(!p.imagen) issues.push({level:'fail',type:'Imagen',id:p.id,name,msg:'Sin imagen principal'});
      if(!p.seoTitle&&!p.seoDescription) issues.push({level:'warn',type:'SEO',id:p.id,name,msg:'Sin SEO generado'});
      if(!Array.isArray(p.recomendados)||!p.recomendados.length) issues.push({level:'warn',type:'Recomendaciones',id:p.id,name,msg:'Sin recomendaciones IA'});
      if(!p.garantia) issues.push({level:'info',type:'Garantía',id:p.id,name,msg:'Garantía no indicada'});
    });
    return issues;
  }
  function counts(issues){return issues.reduce((m,x)=>{m[x.level]=(m[x.level]||0)+1;m[x.type]=(m[x.type]||0)+1;return m;},{});}
  function openTool(){
    const issues=scan(); const c=counts(issues); window.__tmCatalogQA=issues;
    panel('🧾 Control de calidad del catálogo','Revisa errores antes de publicar o ejecutar cambios masivos.',`
      <div class="tm-an-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px">
        <div class="tm-an-kpi"><small>Productos</small><b>${products().length}</b><em>total</em></div>
        <div class="tm-an-kpi"><small>Críticos</small><b style="color:#e74c3c">${c.fail||0}</b><em>corregir</em></div>
        <div class="tm-an-kpi"><small>Alertas</small><b style="color:#f39c12">${c.warn||0}</b><em>mejorar</em></div>
        <div class="tm-an-kpi"><small>Info</small><b style="color:#4fc3f7">${c.info||0}</b><em>opcional</em></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds17-act="rescan">Revisar de nuevo</button><button class="tm-btn gold" data-ds17-act="images">Probar imágenes</button><button class="tm-btn" data-ds17-act="csv">Exportar CSV</button><button class="tm-btn" data-ds17-act="copy">Copiar reporte</button><button class="tm-btn" data-ds17-act="bulk">Abrir IA masiva</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">${renderReport(issues)}</div>`);
  }
  function renderReport(issues){
    if(!issues.length) return '✅ Catálogo sin problemas detectados.';
    const order={fail:0,warn:1,info:2};
    return issues.slice().sort((a,b)=>(order[a.level]-order[b.level])||String(a.type).localeCompare(b.type)).slice(0,220).map(x=>`${x.level==='fail'?'❌':x.level==='warn'?'⚠️':'ℹ️'} ${x.type}: ${x.name||x.id} — ${x.msg}`).join('\n')+(issues.length>220?`\n... ${issues.length-220} más`: '');
  }
  function exportCsv(){
    const issues=window.__tmCatalogQA||scan();
    const rows=[['nivel','tipo','id','producto','mensaje'],...issues.map(x=>[x.level,x.type,x.id,x.name,x.msg])];
    const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='calidad_catalogo_tiendamax.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function copyReport(){navigator.clipboard?.writeText(renderReport(window.__tmCatalogQA||scan())); notify('Reporte copiado','success');}
  function openBulk(){const card=document.querySelector('[data-tool="bulkai"]'); if(card) card.click(); else notify('IA masiva no encontrada','warning');}
  function testImage(url){return new Promise(res=>{if(!url)return res(false); const img=new Image(); const t=setTimeout(()=>{img.onload=img.onerror=null;res(false);},6000); img.onload=()=>{clearTimeout(t);res(true)}; img.onerror=()=>{clearTimeout(t);res(false)}; img.src=url+(url.includes('?')?'&':'?')+'_qa='+Date.now();});}
  async function testImages(){
    const out=$('#tmToolOut'); if(out) out.textContent='⏳ Probando imágenes principales...';
    const ps=products().filter(p=>p.imagen).slice(0,120); const broken=[];
    for(let i=0;i<ps.length;i++){ if(out) out.textContent=`⏳ Imagen ${i+1}/${ps.length}: ${ps[i].nombre}`; const ok=await testImage(ps[i].imagen); if(!ok) broken.push(ps[i]); }
    if(out) out.textContent=broken.length?('❌ Imágenes rotas/no cargan:\n\n'+broken.map(p=>`• ${p.nombre} — ${p.imagen}`).join('\n')):`✅ ${ps.length} imágenes principales cargan correctamente.`;
    notify(broken.length?'Imágenes con problemas':'Imágenes OK',broken.length?'warning':'success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="catalogqa"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds17-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds17Act; if(act==='rescan')openTool(); if(act==='images')testImages(); if(act==='csv')exportCsv(); if(act==='copy')copyReport(); if(act==='bulk')openBulk();
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2400));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v18 / Editor rápido tipo tabla ─────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function cats(){return [...new Set(products().map(p=>p.categoria||'General').filter(Boolean))].sort();}
  function subs(){return [...new Set(products().map(p=>p.subcategoria||'').filter(Boolean))].sort();}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="quickedit"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid'; div.innerHTML='<div class="tm-tool-card enabled" data-tool="quickedit"><span class="state">FAST</span><div class="ico" style="background:rgba(52,152,219,.18)">📋</div><h5>Editor rápido</h5><p>Edita precio, stock, categoría, comisión y garantía en tabla.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function openTool(){
    panel('📋 Editor rápido de productos','Edita campos clave en tabla sin abrir producto por producto.',`
      <style>
      .tm-qe-wrap{overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:12px;margin-top:10px;max-height:520px}.tm-qe-table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px}.tm-qe-table th{position:sticky;top:0;background:#171717;color:#c9a96e;font-size:10px;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:8px;z-index:1}.tm-qe-table td{border-top:1px solid rgba(255,255,255,.06);padding:6px 8px;vertical-align:middle}.tm-qe-table input,.tm-qe-table select{min-height:34px!important;padding:7px 8px!important;border-radius:8px!important;font-size:12px!important}.tm-qe-name{min-width:260px}.tm-qe-small{width:86px}.tm-qe-med{width:150px}.tm-qe-row.changed{background:rgba(201,169,110,.07)}.tm-qe-thumb{width:34px;height:34px;border-radius:8px;object-fit:cover;background:#222}.tm-qe-top{display:grid;grid-template-columns:1fr 180px 120px;gap:8px;margin:8px 0}@media(max-width:760px){.tm-qe-top{grid-template-columns:1fr}.tm-qe-wrap{max-height:430px}.tm-qe-table{min-width:900px}}
      </style>
      <div class="tm-qe-top"><input id="tmQeSearch" placeholder="Buscar producto..."><select id="tmQeCat"><option value="">Todas las categorías</option>${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</select><input id="tmQeLimit" type="number" value="30" min="5" max="200" title="Límite"></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds18-act="render">Buscar/Refrescar</button><button class="tm-btn gold" data-ds18-act="save">Guardar cambios</button><button class="tm-btn" data-ds18-act="stock0">Ver agotados</button><button class="tm-btn" data-ds18-act="low">Ver bajo stock</button></div>
      <div class="tm-note">Tip: cambia varios campos y pulsa “Guardar cambios”. Al final pulsa “Actualizar tienda”.</div>
      <div id="tmQeTable" class="tm-qe-wrap"></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Listo.</div>`);
    setTimeout(renderTable,50);
  }
  function filtered(mode){
    const q=String($('#tmQeSearch')?.value||'').toLowerCase().trim(); const cat=$('#tmQeCat')?.value||''; const limit=Math.max(5,Math.min(200,Number($('#tmQeLimit')?.value)||30));
    let arr=products().filter(p=>(!cat||(p.categoria||'General')===cat));
    if(q) arr=arr.filter(p=>String(p.nombre||'').toLowerCase().includes(q)||String(p.categoria||'').toLowerCase().includes(q)||String(p.subcategoria||'').toLowerCase().includes(q));
    if(mode==='stock0') arr=arr.filter(p=>Number(p.stock||0)<=0);
    if(mode==='low') arr=arr.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3);
    return arr.slice(0,limit);
  }
  function renderTable(mode){
    const box=$('#tmQeTable'); if(!box)return; const arr=filtered(mode); const catOpts=cats().map(c=>`<option>${esc(c)}</option>`).join(''); const subOpts=subs().map(c=>`<option>${esc(c)}</option>`).join('');
    box.innerHTML=`<table class="tm-qe-table"><thead><tr><th>Foto</th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Categoría</th><th>Subcat.</th><th>Comisión</th><th>Moneda</th><th>Garantía</th></tr></thead><tbody>${arr.map(p=>`<tr class="tm-qe-row" data-id="${esc(p.id)}"><td><img class="tm-qe-thumb" src="${esc(p.imagen||'')}" onerror="this.style.display='none'"></td><td><input class="tm-qe-name" data-k="nombre" value="${esc(p.nombre||'')}"></td><td><input class="tm-qe-small" data-k="precioActual" type="number" step="0.01" value="${Number(p.precioActual||0)}"></td><td><input class="tm-qe-small" data-k="stock" type="number" step="1" value="${Number(p.stock||0)}"></td><td><select class="tm-qe-med" data-k="categoria"><option>${esc(p.categoria||'General')}</option>${catOpts}</select></td><td><select class="tm-qe-med" data-k="subcategoria"><option value="${esc(p.subcategoria||'')}">${esc(p.subcategoria||'')}</option>${subOpts}</select></td><td><input class="tm-qe-small" data-k="comision" type="number" step="0.01" value="${Number(p.comision||0)}"></td><td><select data-k="comisionMoneda"><option ${p.comisionMoneda==='MN'?'':'selected'}>USD</option><option ${p.comisionMoneda==='MN'?'selected':''}>MN</option></select></td><td><input class="tm-qe-med" data-k="garantia" value="${esc(p.garantia||'')}"></td></tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>el.closest('tr')?.classList.add('changed')));
    const out=$('#tmToolOut'); if(out) out.textContent=`Mostrando ${arr.length} producto(s).`;
  }
  function save(){
    const rows=Array.from(document.querySelectorAll('#tmQeTable tr.tm-qe-row.changed')); if(!rows.length){notify('No hay cambios','info');return;}
    const ps=products(); let count=0;
    rows.forEach(r=>{const id=r.dataset.id; const idx=ps.findIndex(p=>String(p.id)===String(id)); if(idx<0)return; const p={...ps[idx]}; r.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k; let v=el.value; if(['precioActual','comision'].includes(k)) v=parseFloat(v)||0; if(k==='stock') v=parseInt(v)||0; p[k]=v;}); p.editadoRapidoAt=new Date().toISOString(); ps[idx]=p; count++; try{if(typeof marcarProductoModificado==='function') marcarProductoModificado(p.id);}catch(e){};});
    saveProducts(ps); try{if(typeof actualizarListaProductos==='function')actualizarListaProductos();}catch(e){} try{if(typeof renderizarProductos==='function')renderizarProductos();}catch(e){}
    rows.forEach(r=>r.classList.remove('changed')); const out=$('#tmToolOut'); if(out) out.textContent=`✅ Guardados ${count} producto(s). Ahora pulsa “Actualizar tienda”.`; notify('✅ Cambios guardados localmente','success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="quickedit"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds18-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation(); const act=a.dataset.ds18Act; if(act==='render')renderTable(); if(act==='save')save(); if(act==='stock0')renderTable('stock0'); if(act==='low')renderTable('low');
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2500));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-deepseek-tools-v19 / Ajustes masivos stock-precio ────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function saveProducts(ps){ try{ if(typeof productos!=='undefined'&&Array.isArray(productos)) productos=ps; }catch(e){} if(Array.isArray(window.productos)) window.productos=ps; try{ if(typeof guardarProductos==='function') guardarProductos(); }catch(e){} localStorage.setItem('productos',JSON.stringify(ps)); }
  function cats(){return [...new Set(products().map(p=>p.categoria||'General').filter(Boolean))].sort();}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="bulkadjust"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid'; div.innerHTML='<div class="tm-tool-card enabled" data-tool="bulkadjust"><span class="state">BULK</span><div class="ico" style="background:rgba(245,158,11,.18)">🧮</div><h5>Ajustes masivos</h5><p>Cambia precios, stock, comisión o garantía por categoría.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function openTool(){
    panel('🧮 Ajustes masivos','Aplica cambios controlados por categoría o búsqueda. Usa vista previa antes de aplicar.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Categoría</label><select id="tmAdjCat"><option value="">Todas</option>${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="tm-field"><label>Buscar en nombre</label><input id="tmAdjSearch" placeholder="Ej: router, cargador, aceite..."></div>
        <div class="tm-field"><label>Acción</label><select id="tmAdjAction"><option value="price_pct">Precio: subir/bajar %</option><option value="price_add">Precio: sumar/restar USD</option><option value="stock_add">Stock: sumar/restar</option><option value="stock_set">Stock: fijar cantidad</option><option value="commission_set">Comisión: fijar</option><option value="warranty_set">Garantía: fijar texto</option></select></div>
        <div class="tm-field"><label>Valor</label><input id="tmAdjValue" placeholder="Ej: 5, -10, 3, 6 meses"></div>
      </div>
      <div class="tm-note">Ejemplos: Precio +5% usa valor 5. Bajar precio 10% usa -10. Stock +3 usa 3. Siempre revisa Vista previa.</div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds19-act="preview">Vista previa</button><button class="tm-btn gold" data-ds19-act="apply">Aplicar cambios</button><button class="tm-btn" data-ds19-act="copyOut">Copiar reporte</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Configura una acción y pulsa Vista previa.</div>`);
  }
  function targets(){
    const cat=$('#tmAdjCat')?.value||''; const q=String($('#tmAdjSearch')?.value||'').toLowerCase().trim();
    return products().filter(p=>(!cat||(p.categoria||'General')===cat)&&(!q||String(p.nombre||'').toLowerCase().includes(q)));
  }
  function calc(p){
    const action=$('#tmAdjAction')?.value||'price_pct'; const raw=$('#tmAdjValue')?.value??''; const n=parseFloat(raw);
    const before={precioActual:Number(p.precioActual||0),stock:Number(p.stock||0),comision:Number(p.comision||0),garantia:p.garantia||''};
    const after={...before};
    if(action==='price_pct'){ if(isNaN(n)) throw new Error('Valor % inválido'); after.precioActual=Math.max(0,Number((before.precioActual*(1+n/100)).toFixed(2))); }
    if(action==='price_add'){ if(isNaN(n)) throw new Error('Valor USD inválido'); after.precioActual=Math.max(0,Number((before.precioActual+n).toFixed(2))); }
    if(action==='stock_add'){ if(isNaN(n)) throw new Error('Valor stock inválido'); after.stock=Math.max(0,Math.round(before.stock+n)); }
    if(action==='stock_set'){ if(isNaN(n)) throw new Error('Valor stock inválido'); after.stock=Math.max(0,Math.round(n)); }
    if(action==='commission_set'){ if(isNaN(n)) throw new Error('Valor comisión inválido'); after.comision=Math.max(0,Number(n.toFixed(2))); }
    if(action==='warranty_set'){ after.garantia=String(raw).trim(); }
    return {before,after,action};
  }
  function preview(){
    const out=$('#tmToolOut'); if(!out)return; let arr=targets(); if(!arr.length){out.textContent='No hay productos que coincidan.';return;}
    try{
      const lines=arr.slice(0,80).map((p,i)=>{const c=calc(p); return `${i+1}. ${p.nombre}\n   Precio: $${c.before.precioActual} → $${c.after.precioActual} | Stock: ${c.before.stock} → ${c.after.stock} | Comisión: ${c.before.comision} → ${c.after.comision}${c.before.garantia!==c.after.garantia?` | Garantía: ${c.before.garantia||'—'} → ${c.after.garantia||'—'}`:''}`;});
      out.textContent=`Productos afectados: ${arr.length}\n\n${lines.join('\n\n')}${arr.length>80?'\n\n... y más':''}`;
    }catch(e){out.textContent='❌ '+e.message;}
  }
  function apply(){
    const arr=targets(); if(!arr.length){notify('No hay productos que coincidan','warning');return;}
    let changes=[]; try{changes=arr.map(p=>({p,c:calc(p)}));}catch(e){notify(e.message,'error');return;}
    if(!confirm(`¿Aplicar ajuste masivo a ${changes.length} producto(s)?`)) return;
    const map=new Map(changes.map(x=>[String(x.p.id),x.c]));
    const ps=products().map(p=>{const c=map.get(String(p.id)); if(!c)return p; const np={...p,precioActual:c.after.precioActual,stock:c.after.stock,comision:c.after.comision,garantia:c.after.garantia,ajusteMasivoAt:new Date().toISOString()}; try{if(typeof marcarProductoModificado==='function') marcarProductoModificado(np.id);}catch(e){} return np;});
    saveProducts(ps); try{if(typeof actualizarListaProductos==='function')actualizarListaProductos();}catch(e){} try{if(typeof renderizarProductos==='function')renderizarProductos();}catch(e){}
    const out=$('#tmToolOut'); if(out) out.textContent=`✅ Ajuste aplicado a ${changes.length} producto(s).\n\nAhora pulsa “Actualizar tienda” para publicar productos.json.`;
    notify('✅ Ajuste masivo aplicado','success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="bulkadjust"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds19-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(a.dataset.ds19Act==='preview')preview(); if(a.dataset.ds19Act==='apply')apply(); if(a.dataset.ds19Act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2600));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-tools-v20 / Estado de automatizaciones GitHub ───────────────────
(function(){
  const WORKFLOWS=[
    ['update-eltoque-rate.yml','💱 Tasa elTOQUE'],
    ['regenerate-artifacts.yml','🧱 Artefactos /p + sitemap'],
    ['send-push-notifications.yml','🔔 Push notifications'],
    ['optimize-images.yml','🖼️ Optimizar imágenes'],
    ['minify-js.yml','📦 Minificar JS'],
    ['build-css.yml','🎨 Build CSS'],
    ['run-tests.yml','🧪 Tests']
  ];
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function gh(){return {user:localStorage.getItem('githubUser')||'',repo:localStorage.getItem('githubRepo')||'',token:localStorage.getItem('githubToken')||''};}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="actionsstatus"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid'; div.innerHTML='<div class="tm-tool-card enabled" data-tool="actionsstatus"><span class="state">LIVE</span><div class="ico" style="background:rgba(79,195,247,.18)">⚙️</div><h5>Automatizaciones</h5><p>Revisa GitHub Actions: tasa, artefactos, push, imágenes y tests.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function openTool(){
    const g=gh();
    panel('⚙️ Estado de automatizaciones','Revisa workflows de GitHub Actions y abre ejecuciones recientes.',`
      <div class="tm-note">Usa tu configuración GitHub del admin. Si el repo es privado, requiere token guardado.</div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds20-act="load">Cargar estado</button><button class="tm-btn gold" data-ds20-act="openActions">Abrir Actions</button><button class="tm-btn" data-ds20-act="copyOut">Copiar reporte</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Repo: ${esc(g.user||'—')}/${esc(g.repo||'—')}\nPulsa “Cargar estado”.</div>`);
  }
  async function fetchRuns(file){
    const g=gh(); if(!g.user||!g.repo) throw new Error('Configura GitHub user/repo en Configuración');
    const headers={'Accept':'application/vnd.github+json'}; if(g.token) headers.Authorization='token '+g.token;
    const url=`https://api.github.com/repos/${encodeURIComponent(g.user)}/${encodeURIComponent(g.repo)}/actions/workflows/${encodeURIComponent(file)}/runs?per_page=3`;
    const r=await fetch(url,{headers});
    if(r.status===404) return {missing:true,file};
    if(!r.ok){let t='';try{t=await r.text()}catch(e){};throw new Error(`${file}: GitHub HTTP ${r.status} ${t.slice(0,120)}`);}
    return await r.json();
  }
  function fmtRun(run){
    if(!run) return 'Sin ejecuciones';
    const icon=run.conclusion==='success'?'✅':run.conclusion==='failure'?'❌':run.status==='in_progress'?'⏳':'⚪';
    const when=run.created_at?new Date(run.created_at).toLocaleString('es-CU'):'—';
    return `${icon} ${run.status}${run.conclusion?'/'+run.conclusion:''} · ${when}`;
  }
  async function load(){
    const out=$('#tmToolOut'); if(!out)return; const g=gh();
    out.textContent='⏳ Consultando GitHub Actions...';
    const lines=[`Repo: ${g.user}/${g.repo}`,''];
    for(const [file,label] of WORKFLOWS){
      try{
        const data=await fetchRuns(file);
        if(data.missing){lines.push(`⚪ ${label} (${file}) — no existe en este repo`); continue;}
        const run=(data.workflow_runs||[])[0];
        lines.push(`${label} — ${fmtRun(run)}`);
        if(run&&run.html_url) lines.push(`   ${run.html_url}`);
      }catch(e){lines.push(`⚠️ ${label} — ${e.message}`);}
    }
    lines.push('','Tip: si la tasa no cambia, el workflow puede terminar sin commit y eso está bien.');
    out.textContent=lines.join('\n');
  }
  function openActions(){
    const g=gh(); if(!g.user||!g.repo){notify('Configura GitHub primero','warning');return;}
    window.open(`https://github.com/${encodeURIComponent(g.user)}/${encodeURIComponent(g.repo)}/actions`,'_blank');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="actionsstatus"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds20-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(a.dataset.ds20Act==='load')load(); if(a.dataset.ds20Act==='openActions')openActions(); if(a.dataset.ds20Act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2700));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-tools-pack-v21 / Herramientas extra 05-12 ─────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  function ls(k,d){try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch(e){return d}}
  function set(k,v){localStorage.setItem(k,JSON.stringify(v));}
  function gh(){return {user:localStorage.getItem('githubUser')||'',repo:localStorage.getItem('githubRepo')||'',token:localStorage.getItem('githubToken')||''};}
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'), panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.getElementById('tmToolsPackExtraCards')) return;
    const div=document.createElement('div'); div.id='tmToolsPackExtraCards'; div.className='tm-tools-grid';
    div.innerHTML=`
      <div class="tm-tool-card enabled" data-tool="preflight"><span class="state">SAFE</span><div class="ico" style="background:rgba(231,76,60,.16)">🚦</div><h5>Validar antes de subir</h5><p>Revisa riesgos antes de Actualizar tienda.</p></div>
      <div class="tm-tool-card enabled" data-tool="pushmanager"><span class="state">PRO</span><div class="ico" style="background:rgba(245,158,11,.18)">🔔</div><h5>Gestor de push</h5><p>Plantillas, historial y push por producto/categoría.</p></div>
      <div class="tm-tool-card enabled" data-tool="artifacts"><span class="state">SEO</span><div class="ico" style="background:rgba(79,195,247,.18)">🧱</div><h5>Artefactos SEO</h5><p>Regenera páginas /p, sitemap y subcategorías.</p></div>
      <div class="tm-tool-card enabled" data-tool="cleaner"><span class="state">CLEAN</span><div class="ico" style="background:rgba(46,204,113,.18)">🧹</div><h5>Limpiador admin</h5><p>Limpia snapshots, logs y cachés viejas.</p></div>
      <div class="tm-tool-card enabled" data-tool="dormant"><span class="state">DATA</span><div class="ico" style="background:rgba(155,89,182,.18)">😴</div><h5>Productos dormidos</h5><p>Stock con poco movimiento o sin interés.</p></div>
      <div class="tm-tool-card enabled" data-tool="restock"><span class="state">DATA</span><div class="ico" style="background:rgba(255,107,53,.18)">📦</div><h5>Reposición inteligente</h5><p>Qué reponer, archivar o promocionar.</p></div>
      <div class="tm-tool-card enabled" data-tool="templates"><span class="state">COPY</span><div class="ico" style="background:rgba(201,169,110,.18)">🧩</div><h5>Plantillas</h5><p>Facebook, WhatsApp, Push y Story con variables.</p></div>
      <div class="tm-tool-card enabled" data-tool="calendar"><span class="state">WEEK</span><div class="ico" style="background:rgba(52,152,219,.18)">📅</div><h5>Calendario visual</h5><p>Planes, campañas y seguimientos por semana.</p></div>`;
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function productUrl(p){return p&&p.id?`/p/producto-${p.id}.html`:'/';}
  function preflightIssues(){
    const ps=products(); const mods=ls('productosModificados',[]); const issues=[];
    if(!localStorage.getItem('githubUser')||!localStorage.getItem('githubRepo')||!localStorage.getItem('githubToken')) issues.push(['fail','GitHub no configurado']);
    if(mods.length>25) issues.push(['warn',`${mods.length} productos modificados: revisión recomendada`]);
    ps.filter(p=>!p.imagen).slice(0,10).forEach(p=>issues.push(['fail',`Sin imagen: ${p.nombre}`]));
    ps.filter(p=>!Number(p.precioActual||0)).slice(0,10).forEach(p=>issues.push(['fail',`Precio 0: ${p.nombre}`]));
    ps.filter(p=>Number(p.stock||0)<0).forEach(p=>issues.push(['fail',`Stock negativo: ${p.nombre}`]));
    ps.filter(p=>!p.seoTitle&&!p.seoDescription).slice(0,8).forEach(p=>issues.push(['warn',`Sin SEO: ${p.nombre}`]));
    ps.filter(p=>!Array.isArray(p.recomendados)||!p.recomendados.length).slice(0,8).forEach(p=>issues.push(['warn',`Sin recomendaciones: ${p.nombre}`]));
    return {mods,issues};
  }
  function openPreflight(){const r=preflightIssues(); panel('🚦 Validar antes de actualizar','Chequeo rápido antes de subir cambios a GitHub.',`<div class="tm-actions"><button class="tm-btn primary" data-pack-act="preflightRun">Revisar</button><button class="tm-btn gold" data-pack-act="preflightSync">Actualizar tienda</button><button class="tm-btn" data-pack-act="copyOut">Copiar</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">${renderPreflight(r)}</div>`);}
  function renderPreflight(r){return `Productos modificados: ${r.mods.length}\n\n`+(r.issues.length?r.issues.map(x=>(x[0]==='fail'?'❌':x[0]==='warn'?'⚠️':'ℹ️')+' '+x[1]).join('\n'):'✅ Sin riesgos críticos detectados.');}
  function doSync(){const r=preflightIssues(); const fails=r.issues.filter(x=>x[0]==='fail'); if(fails.length&&!confirm('Hay fallos críticos. ¿Subir de todas formas?')) return; if(typeof sincronizarTodoConGitHub==='function') sincronizarTodoConGitHub(); else notify('No encuentro la función de actualizar','error');}
  function pushTemplates(){return ls('tm_push_templates_v1',[{name:'Oferta',title:'🔥 Oferta en TiendaMax',body:'Disponible por tiempo limitado. Escríbenos para reservar.',url:'/'},{name:'Nuevo producto',title:'🆕 Nuevo producto',body:'Llegó algo nuevo a TiendaMax. Mira disponibilidad.',url:'/'}]);}
  function savePushTemplates(v){set('tm_push_templates_v1',v)}
  function pushHist(){return ls('tm_push_history_v1',[])}
  function savePushHist(v){set('tm_push_history_v1',v.slice(0,100))}
  function openPushManager(){const ps=products().filter(p=>Number(p.stock||0)>0).slice(0,200); const tpl=pushTemplates(); panel('🔔 Gestor avanzado de push','Plantillas, historial y preparación rápida de notificaciones.',`<div class="tm-form-grid"><div class="tm-field"><label>Producto</label><select id="tmPmProd"><option value="">Manual</option>${ps.map(p=>`<option value="${p.id}">${esc(p.nombre)} · ${money(p.precioActual)}</option>`).join('')}</select></div><div class="tm-field"><label>Plantilla</label><select id="tmPmTpl">${tpl.map((t,i)=>`<option value="${i}">${esc(t.name)}</option>`).join('')}</select></div><div class="tm-field"><label>Título</label><input id="tmPmTitle"></div><div class="tm-field"><label>URL</label><input id="tmPmUrl" value="/"></div></div><div class="tm-field"><label>Mensaje</label><textarea id="tmPmBody" style="min-height:74px"></textarea></div><div class="tm-actions"><button class="tm-btn primary" data-pack-act="pmFill">Rellenar</button><button class="tm-btn gold" data-pack-act="pmApply">Aplicar push</button><button class="tm-btn" data-pack-act="pmHistory">Historial</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Listo.</div>`);}
  function pmFill(){const ps=products(); const p=ps.find(x=>String(x.id)===$('#tmPmProd')?.value); const t=pushTemplates()[Number($('#tmPmTpl')?.value)||0]||{}; $('#tmPmTitle').value=p?`🔥 ${String(p.nombre).slice(0,35)}`:(t.title||''); $('#tmPmBody').value=p?`${p.nombre} disponible por ${money(p.precioActual)}. Stock: ${p.stock}. Reserva por WhatsApp.`:(t.body||''); $('#tmPmUrl').value=p?productUrl(p):(t.url||'/');}
  function pmApply(){const title=$('#tmPmTitle')?.value||'', body=$('#tmPmBody')?.value||'', url=$('#tmPmUrl')?.value||'/'; if(!title||!body){notify('Completa título y mensaje','warning');return;} const h=pushHist(); h.unshift({ts:new Date().toISOString(),title,body,url}); savePushHist(h); if(typeof switchTab==='function') switchTab('configuracion'); setTimeout(()=>{if($('#manualPushTitle'))$('#manualPushTitle').value=title;if($('#manualPushBody'))$('#manualPushBody').value=body;if($('#manualPushUrl'))$('#manualPushUrl').value=url;notify('Push aplicado en Configuración','success');},250);}
  function pmHistory(){const h=pushHist(); const out=$('#tmToolOut'); if(out) out.textContent=h.length?h.map((x,i)=>`${i+1}. ${new Date(x.ts).toLocaleString('es-CU')}\nTítulo: ${x.title}\nMensaje: ${x.body}\nURL: ${x.url}`).join('\n\n'):'Sin historial push.';}
  async function dispatchWorkflow(file){const g=gh(); if(!g.user||!g.repo||!g.token) throw new Error('Configura GitHub y token'); const r=await fetch(`https://api.github.com/repos/${g.user}/${g.repo}/actions/workflows/${file}/dispatches`,{method:'POST',headers:{'Accept':'application/vnd.github+json','Authorization':'token '+g.token,'Content-Type':'application/json'},body:JSON.stringify({ref:'main'})}); if(!r.ok&&r.status!==204){let t=await r.text().catch(()=>r.statusText); throw new Error('GitHub '+r.status+': '+t.slice(0,120));}}
  function openArtifacts(){panel('🧱 Artefactos SEO','Regenera páginas /p, sitemap y subcategorías después de SEO/productos.',`<div class="tm-note">Ejecuta esto después de generar SEO o cambiar productos. Si falla por rama main/master, abre Actions y ejecútalo manual.</div><div class="tm-actions"><button class="tm-btn primary" data-pack-act="artRun">Disparar workflow</button><button class="tm-btn" data-pack-act="artOpen">Abrir Actions</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Workflow esperado: regenerate-artifacts.yml</div>`);}
  async function artRun(){const out=$('#tmToolOut'); try{out.textContent='⏳ Disparando workflow...'; await dispatchWorkflow('regenerate-artifacts.yml'); out.textContent='✅ Workflow solicitado. Revisa GitHub Actions.'; notify('Workflow solicitado','success');}catch(e){out.textContent='⚠️ '+e.message; notify('No se pudo disparar','warning');}}
  function artOpen(){const g=gh(); window.open(g.user&&g.repo?`https://github.com/${g.user}/${g.repo}/actions`:'https://github.com/','_blank');}
  function openCleaner(){panel('🧹 Limpiador del admin','Limpia datos locales viejos sin tocar productos.',`<div class="tm-actions"><button class="tm-btn primary" data-pack-act="cleanPreview">Vista previa</button><button class="tm-btn gold" data-pack-act="cleanRun">Limpiar seguro</button><button class="tm-btn" data-pack-act="copyOut">Copiar</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Pulsa vista previa.</div>`);}
  function cleanPreview(){const keys=['tm_tools_snapshots_v1','tm_full_backups_v1','tm_campaigns_v1','tm_week_plan_v1','productosModificados','tm_push_history_v1']; const out=$('#tmToolOut'); out.textContent=keys.map(k=>{let n=0;try{const v=JSON.parse(localStorage.getItem(k)||'[]');n=Array.isArray(v)?v.length:Object.keys(v).length}catch(e){} return `${k}: ${n}`;}).join('\n');}
  function cleanRun(){['tm_tools_snapshots_v1','tm_full_backups_v1','tm_campaigns_v1','tm_week_plan_v1','tm_push_history_v1'].forEach(k=>{try{let v=JSON.parse(localStorage.getItem(k)||'[]'); if(Array.isArray(v)&&v.length>20)localStorage.setItem(k,JSON.stringify(v.slice(0,20)));}catch(e){}}); localStorage.removeItem('productosModificados'); cleanPreview(); notify('Limpieza segura completada','success');}
  function activityMaps(){const vs=ventas(); const sold={}; vs.forEach(v=>{sold[String(v.productoId||'')]=(sold[String(v.productoId||'')]||0)+Number(v.cantidad||1);}); let an={vistas:{},whatsapp:{}}; try{an=window.__tmAnalyticsPlusData||an}catch(e){} return {sold,views:an.vistas||{},wa:an.whatsapp||{}};}
  function openDormant(){const {sold,views,wa}=activityMaps(); const arr=products().filter(p=>Number(p.stock||0)>0).map(p=>({p,score:Number(sold[String(p.id)]||0)+Number(views[String(p.id)]||0)+Number(wa[String(p.id)]||0)*2})).filter(x=>x.score===0).slice(0,80); panel('😴 Productos dormidos','Productos con stock sin señales de venta/vistas/WhatsApp locales.',`<div class="tm-actions"><button class="tm-btn primary" data-pack-act="copyOut">Copiar</button><button class="tm-btn gold" data-pack-act="dormCampaign">Crear campaña</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">${arr.length?arr.map(x=>`• ${x.p.nombre} · stock ${x.p.stock} · ${money(x.p.precioActual)}`).join('\n'):'No se detectan dormidos con datos actuales.'}</div>`);}
  function openRestock(){const vs=ventas(); const sold={}; vs.forEach(v=>{sold[String(v.productoId||'')]=(sold[String(v.productoId||'')]||0)+Number(v.cantidad||1);}); const ps=products(); const low=ps.filter(p=>Number(p.stock||0)<=3).map(p=>({p,s:sold[String(p.id)]||0})).sort((a,b)=>b.s-a.s).slice(0,80); panel('📦 Reposición inteligente','Qué reponer, archivar o promocionar según stock y ventas locales.',`<div class="tm-actions"><button class="tm-btn" data-pack-act="copyOut">Copiar</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">${low.map(x=>`${x.s?'🔥':'⚠️'} ${x.p.nombre} · stock ${x.p.stock||0} · vendido ${x.s} · ${x.s?'Reponer':'Revisar/archivar'}`).join('\n')||'Sin productos críticos.'}</div>`);}
  function openTemplates(){const t=ls('tm_templates_v1',[{name:'Facebook oferta',body:'🔥 {nombre}\n\n💵 {precio}\n📦 Stock: {stock}\n📲 Escríbenos para reservar.\n{url}'},{name:'WhatsApp corto',body:'Hola 👋 Tenemos {nombre} disponible en {precio}. Stock: {stock}. ¿Te lo reservo?'},{name:'Push',body:'Título: 🔥 {nombre}\nMensaje: Disponible en TiendaMax por {precio}. Reserva por WhatsApp.\nURL: {url}'}]); panel('🧩 Biblioteca de plantillas','Plantillas reutilizables con variables {nombre}, {precio}, {stock}, {url}, {categoria}.',`<div class="tm-actions"><button class="tm-btn primary" data-pack-act="tplAdd">Agregar plantilla</button><button class="tm-btn gold" data-pack-act="tplSave">Guardar edición</button><button class="tm-btn" data-pack-act="copyOut">Copiar salida</button></div><div class="tm-form-grid"><div class="tm-field"><label>Plantilla</label><select id="tmTplSel">${t.map((x,i)=>`<option value="${i}">${esc(x.name)}</option>`).join('')}</select></div><div class="tm-field"><label>Producto</label><select id="tmTplProd">${products().slice(0,200).map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div></div><div class="tm-field"><label>Texto</label><textarea id="tmTplText" style="min-height:120px">${esc(t[0]?.body||'')}</textarea></div><div class="tm-actions"><button class="tm-btn primary" data-pack-act="tplRender">Renderizar</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Listo.</div>`); $('#tmTplSel')?.addEventListener('change',e=>{$('#tmTplText').value=t[Number(e.target.value)]?.body||'';});}
  function tplRender(){const p=products().find(x=>String(x.id)===$('#tmTplProd')?.value)||products()[0]||{}; let txt=$('#tmTplText')?.value||''; txt=txt.replaceAll('{nombre}',p.nombre||'').replaceAll('{precio}',money(p.precioActual)).replaceAll('{stock}',String(p.stock||0)).replaceAll('{url}',productUrl(p)).replaceAll('{categoria}',p.categoria||''); $('#tmToolOut').textContent=txt;}
  function tplAdd(){const t=ls('tm_templates_v1',[]); t.unshift({name:'Nueva plantilla',body:'{nombre}\n{precio}\n{url}'}); set('tm_templates_v1',t); openTemplates();}
  function tplSave(){const t=ls('tm_templates_v1',[]); const i=Number($('#tmTplSel')?.value)||0; if(t[i]){t[i].body=$('#tmTplText')?.value||''; set('tm_templates_v1',t); notify('Plantilla guardada','success');}}
  function openCalendar(){const plans=ls('tm_week_plan_v1',[]), cs=ls('tm_campaigns_v1',[]); const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']; panel('📅 Calendario visual','Planes, campañas y seguimientos de la semana.',`<div class="tm-form-grid">${days.map(d=>`<div class="tm-panel active" style="padding:12px"><h4>${d}</h4><div class="tm-note">${plans.filter(p=>!(p.done&&p.done[d])).slice(0,2).map(p=>'🗓️ '+esc(p.title)).join('<br>')||'Sin plan pendiente'}<br>${cs.filter(c=>c.followUpAt&&new Date(c.followUpAt).toLocaleDateString('es-CU')===new Date().toLocaleDateString('es-CU')).slice(0,2).map(c=>'📌 '+esc(c.title)).join('<br>')}</div></div>`).join('')}</div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Calendario generado con planes/campañas locales.</div>`);}
  document.addEventListener('click',function(e){const tool=e.target.closest('[data-tool]'); if(tool){const m={preflight:openPreflight,pushmanager:openPushManager,artifacts:openArtifacts,cleaner:openCleaner,dormant:openDormant,restock:openRestock,templates:openTemplates,calendar:openCalendar}[tool.dataset.tool]; if(m){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();m();return;}} const a=e.target.closest('[data-pack-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation(); const act=a.dataset.packAct; if(act==='preflightRun')openPreflight(); if(act==='preflightSync')doSync(); if(act==='pmFill')pmFill(); if(act==='pmApply')pmApply(); if(act==='pmHistory')pmHistory(); if(act==='artRun')artRun(); if(act==='artOpen')artOpen(); if(act==='cleanPreview')cleanPreview(); if(act==='cleanRun')cleanRun(); if(act==='tplRender')tplRender(); if(act==='tplAdd')tplAdd(); if(act==='tplSave')tplSave(); if(act==='dormCampaign'){const c=document.querySelector('[data-tool="campaignai"]'); if(c)c.click();} if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}},true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,2800));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// guideagent eliminado — reemplazado por admin-copilot.js (burbuja flotante con 5 agentes especializados)

// ── tm-sales-v23 / Interesados WhatsApp ───────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function ventas(){ try{ if(typeof cargarVentas==='function') return cargarVentas()||[]; }catch(e){} try{return JSON.parse(localStorage.getItem('registroVentas')||'[]')}catch(e){return[]} }
  function money(n){return '$'+Number(n||0).toFixed(2)}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="interesados"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid'; div.innerHTML='<div class="tm-tool-card enabled" data-tool="interesados"><span class="state">VENTA</span><div class="ico" style="background:rgba(37,211,102,.18)">🔥</div><h5>Interesados WhatsApp</h5><p>Detecta clics a WhatsApp, seguimiento y conversión por producto.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  async function getFirebaseConfig(){
    try{const raw=localStorage.getItem('firebaseConfig'); if(raw){const c=JSON.parse(raw); if(c&&c.databaseURL)return c;}}catch(e){}
    try{const r=await fetch('config.json?_='+Date.now(),{cache:'no-store'}); if(r.ok){const j=await r.json(); if(j.firebaseConfig){localStorage.setItem('firebaseConfig',JSON.stringify(j.firebaseConfig)); return j.firebaseConfig;}}}catch(e){}
    return null;
  }
  function flattenInteresados(raw){
    const arr=[]; if(!raw||typeof raw!=='object')return arr;
    Object.values(raw).forEach(node=>{ if(node&&typeof node==='object') Object.values(node).forEach(v=>{ if(v&&v.productoId)arr.push(v); }); });
    return arr.sort((a,b)=>Number(b.ts||0)-Number(a.ts||0));
  }
  async function loadData(){
    let arr=[];
    try{arr=JSON.parse(localStorage.getItem('tm_interesados_whatsapp')||'[]');}catch(e){}
    try{
      const cfg=await getFirebaseConfig();
      if(cfg&&cfg.databaseURL){
        const r=await fetch(cfg.databaseURL.replace(/\/$/,'')+'/interesados.json?_='+Date.now(),{cache:'no-store'});
        if(r.ok){const fb=flattenInteresados(await r.json()); if(fb.length) arr=fb;}
      }
    }catch(e){console.warn('[interesados admin]',e);}
    return arr;
  }
  function summarize(arr){
    const vs=ventas(); const by={}; arr.forEach(x=>{const id=String(x.productoId); by[id]=by[id]||{count:0,producto:x.producto,precio:x.precio,categoria:x.categoria,stock:x.stock,last:x.ts||0}; by[id].count++; by[id].last=Math.max(by[id].last,Number(x.ts||0));});
    const sold={}; vs.forEach(v=>{if(v.productoId)sold[String(v.productoId)]=(sold[String(v.productoId)]||0)+Number(v.cantidad||1);});
    return Object.entries(by).map(([id,d])=>({...d,id,ventas:sold[id]||0,conv:d.count?Math.round((sold[id]||0)/d.count*100):0})).sort((a,b)=>b.count-a.count);
  }
  function openTool(){
    panel('🔥 Interesados por WhatsApp','Seguimiento de intención de compra: clics a WhatsApp, productos calientes y conversión.',`<div class="tm-actions"><button class="tm-btn primary" data-ds23-act="load">Cargar interesados</button><button class="tm-btn gold" data-ds23-act="campaign">Campaña del top</button><button class="tm-btn" data-ds23-act="copyOut">Copiar reporte</button><button class="tm-btn" data-ds23-act="csv">Exportar CSV</button></div><div id="tmToolOut" class="tm-code" style="margin-top:12px">Pulsa Cargar interesados.</div>`);
  }
  async function render(){
    const out=$('#tmToolOut'); if(out)out.textContent='⏳ Cargando interesados...';
    const arr=await loadData(); window.__tmInteresados=arr; const sum=summarize(arr); window.__tmInteresadosSummary=sum;
    const hoy=new Date(); hoy.setHours(0,0,0,0); const today=arr.filter(x=>Number(x.ts||0)>=hoy.getTime()).length;
    if(out) out.textContent=`Interesados total: ${arr.length}\nInteresados hoy: ${today}\nProductos con interés: ${sum.length}\n\nTOP PRODUCTOS\n`+sum.slice(0,20).map((x,i)=>`${i+1}. ${x.producto} · ${x.count} interés(es) · ventas ${x.ventas} · conv ${x.conv}% · ${money(x.precio)} · stock ${x.stock}`).join('\n')+`\n\nSEGUIMIENTO SUGERIDO\n`+sum.filter(x=>x.count>0&&x.ventas===0).slice(0,8).map(x=>`• ${x.producto}: tiene interés pero sin venta registrada. Crear seguimiento/oferta.`).join('\n');
  }
  function campaignTop(){
    const top=(window.__tmInteresadosSummary||[])[0]; if(!top){notify('Primero carga interesados','warning');return;}
    const p=products().find(x=>String(x.id)===String(top.id));
    localStorage.setItem('tm_last_campaign_text',`Campaña sugerida por interesados\n\nProducto: ${top.producto}\nInteresados: ${top.count}\nVentas: ${top.ventas}\n\nFACEBOOK:\n🔥 ${top.producto}\n\nVarios clientes están preguntando por este producto. Disponible en TiendaMax por ${money(top.precio)}.\n📦 Stock: ${top.stock}\n📲 Escríbenos para reservar.\n\nWHATSAPP:\nHola 👋 Tenemos disponible ${top.producto}. Si te interesa, te lo puedo reservar por aquí.\n\nPUSH:\nTítulo: 🔥 ${String(top.producto).slice(0,32)}\nMensaje: Producto con alta demanda. Stock disponible. Reserva por WhatsApp.\nURL: /p/producto-${top.id}.html`);
    const c=document.querySelector('[data-tool="publisherai"],[data-tool="campaignai"]'); if(c)c.click(); else notify('Campaña copiada a última campaña','success');
  }
  function csv(){const arr=window.__tmInteresados||[]; const rows=[['fecha','productoId','producto','precio','stock','categoria','origen'],...arr.map(x=>[x.fecha||x.ts,x.productoId,x.producto,x.precio,x.stock,x.categoria,x.origen])]; const text=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'})); a.download='interesados_whatsapp.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="interesados"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds23-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(a.dataset.ds23Act==='load')render(); if(a.dataset.ds23Act==='campaign')campaignTop(); if(a.dataset.ds23Act==='csv')csv(); if(a.dataset.ds23Act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,3000));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-marketing-v24 / Compartir estado WhatsApp ───────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCard(){
    const wrap=$('#herramientas .tm-tools-wrap'); const panelEl=$('#tmToolPanel'); if(!wrap||!panelEl||document.querySelector('[data-tool="statusshare"]')) return;
    const div=document.createElement('div'); div.className='tm-tools-grid';
    div.innerHTML='<div class="tm-tool-card enabled" data-tool="statusshare"><span class="state">WA</span><div class="ico" style="background:rgba(37,211,102,.18)">🟢</div><h5>Estado WhatsApp</h5><p>Comparte la tienda o un producto en estados/chats de WhatsApp.</p></div>';
    wrap.insertBefore(div,panelEl);
    if(typeof window.tmOrganizeTools==='function') setTimeout(window.tmOrganizeTools,80);
  }
  function productOptions(){return '<option value="">Tienda completa</option>'+products().filter(p=>Number(p.stock||0)>0).slice(0,200).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||'Producto')} · $${Number(p.precioActual||0).toFixed(2)}</option>`).join('');}
  function defaultText(p){
    if(p) return `🔥 ${p.nombre}\n\n💵 $${Number(p.precioActual||0).toFixed(2)} USD\n📦 Stock: ${Number(p.stock||0)}\n\nPídelo directo por WhatsApp en TiendaMax:\nhttps://tiendamax.org/p/producto-${p.id}.html`;
    return `🚀 TiendaMax online\n\nCatálogo con productos disponibles, fotos, precios y pedido directo por WhatsApp.\n\n⚡ Energía · 📶 WiFi · 🚗 Carros · 🏍️ Motos · 🔐 Seguridad\n\n👉 https://tiendamax.org`;
  }
  function openTool(){
    panel('🟢 Compartir en estados de WhatsApp','Prepara texto/enlace para estado de WhatsApp. En móvil usa Compartir y elige WhatsApp/Estado.',`
      <div class="tm-field"><label>Qué compartir</label><select id="tmStatusProd">${productOptions()}</select></div>
      <div class="tm-field"><label>Texto para estado</label><textarea id="tmStatusText" style="min-height:150px">${esc(defaultText(null))}</textarea></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds24-act="native">📲 Compartir estado</button><button class="tm-btn gold" data-ds24-act="wa">Abrir WhatsApp</button><button class="tm-btn" data-ds24-act="copy">Copiar texto</button></div>
      <div class="tm-note">Nota: los navegadores no pueden publicar estados automáticamente. El botón “Compartir estado” abre el menú del teléfono para que elijas WhatsApp/Estado. En PC se copia o abre WhatsApp Web.</div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Listo para compartir.</div>`);
    setTimeout(()=>{
      const sel=$('#tmStatusProd');
      if(sel) sel.addEventListener('change',()=>{
        const p=products().find(x=>String(x.id)===String(sel.value));
        const t=$('#tmStatusText'); if(t) t.value=defaultText(p||null);
      });
    },50);
  }
  async function nativeShare(){
    const text=$('#tmStatusText')?.value||defaultText(null);
    const p=products().find(x=>String(x.id)===String($('#tmStatusProd')?.value||''));
    const url=p?`https://tiendamax.org/p/producto-${p.id}.html`:'https://tiendamax.org';
    try{
      if(navigator.share){ await navigator.share({title:p?(p.nombre||'TiendaMax'):'TiendaMax',text,url}); notify('Compartir abierto','success'); }
      else { await navigator.clipboard?.writeText(text); notify('Tu navegador no tiene compartir nativo. Texto copiado.','info'); }
    }catch(e){ if(!/abort/i.test(e.message||'')) notify('No se pudo compartir: '+e.message,'warning'); }
  }
  function openWhatsApp(){
    const text=encodeURIComponent($('#tmStatusText')?.value||defaultText(null));
    window.open('https://wa.me/?text='+text,'_blank','noopener,noreferrer');
  }
  function copy(){navigator.clipboard?.writeText($('#tmStatusText')?.value||''); notify('Texto copiado','success');}
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="statusshare"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openTool();return;}
    const a=e.target.closest('[data-ds24-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(a.dataset.ds24Act==='native')nativeShare(); if(a.dataset.ds24Act==='wa')openWhatsApp(); if(a.dataset.ds24Act==='copy')copy();
  },true);
  function boot(){addCard();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,3100));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]')) setTimeout(boot,300);});
})();

// ── tm-publicar-v25 / Compartir por producto en Publicar ───────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,type){ if(typeof mostrarNotificacion==='function') mostrarNotificacion(msg,type||'info'); else console.log(msg); }
  function products(){ try{ if(Array.isArray(window.productos)) return window.productos; }catch(e){} try{return JSON.parse(localStorage.getItem('productos')||'[]')}catch(e){return[]} }
  function url(p){return `https://tiendamax.org/p/producto-${p.id}.html`;}
  function txt(p){return `🔥 ${p.nombre}\n\n${p.descripcion?String(p.descripcion).slice(0,160)+'\n\n':''}💵 $${Number(p.precioActual||0).toFixed(2)} USD\n📦 Stock: ${Number(p.stock||0)}\n🏷️ ${p.categoria||'TiendaMax'}\n\nPídelo directo por WhatsApp en TiendaMax:\n${url(p)}`;}
  function cats(){return [...new Set(products().map(p=>p.categoria||'General').filter(Boolean))].sort();}
  function ensure(){
    const host=document.getElementById('tmShareProductsRoot'); if(!host) return;
    if(document.getElementById('tmShareProductsCard')){ render(); return; }
    const card=document.createElement('div'); card.id='tmShareProductsCard'; card.className='card tm-share-products-card';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h2>📲 Compartir por producto</h2><p class="sub">Estado de WhatsApp, Facebook, chat y copia rápida de cada producto.</p></div><button type="button" class="btn gold" id="tmShareRefresh">↻ Actualizar lista</button></div>
      <div class="form-grid" style="margin-top:12px"><input id="tmShareSearch" placeholder="Buscar producto para compartir..."><select id="tmShareCat"><option value="">Todas las categorías</option>${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
      <div class="tm-note">Tip: usa 🖼️ Estado para generar imagen vertical lista para WhatsApp Estado.</div>
      <div id="tmShareProductsList" style="display:flex;flex-direction:column;gap:10px;margin-top:14px"></div>`;
    card.addEventListener('input',e=>{if(e.target.id==='tmShareSearch') render();});
    card.addEventListener('change',e=>{if(e.target.id==='tmShareCat') render();});
    card.addEventListener('click',handle);
    host.appendChild(card);
    $('#tmShareRefresh',card)?.addEventListener('click',render,{once:true});
    render();
  }
  function filtered(){
    const q=String($('#tmShareSearch')?.value||'').toLowerCase().trim(); const cat=$('#tmShareCat')?.value||'';
    return products().filter(p=>Number(p.stock||0)>0).filter(p=>(!cat||(p.categoria||'General')===cat)&&(!q||String(p.nombre||'').toLowerCase().includes(q)||String(p.categoria||'').toLowerCase().includes(q))).slice(0,120);
  }
  function render(){
    const box=$('#tmShareProductsList'); if(!box)return; const arr=filtered();
    box.innerHTML=arr.length?arr.map(p=>`<div class="tm-share-row" data-id="${esc(p.id)}" style="display:grid;grid-template-columns:58px 1fr auto;gap:12px;align-items:center;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:10px"><img src="${esc(p.imagen||'')}" onerror="this.style.display='none'" style="width:58px;height:58px;object-fit:cover;border-radius:10px;background:#222"><div style="min-width:0"><b style="display:block;color:#fff;font-size:14px;line-height:1.2">${esc(p.nombre||'Producto')}</b><small style="color:#aaa">${esc(p.categoria||'General')} · $${Number(p.precioActual||0).toFixed(2)} · stock ${Number(p.stock||0)}</small></div><div class="tm-share-actions" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="tm-btn primary tm-mini" data-act="story">🖼️ Estado</button><button type="button" class="tm-btn tm-mini" data-act="wa">💬 Chat</button><button type="button" class="tm-btn tm-mini" data-act="fb">📘 Facebook</button><button type="button" class="tm-btn tm-mini" data-act="copy">🔗 Copiar</button></div></div>`).join(''):'<div class="tm-note">No hay productos con stock para compartir.</div>';
  }
  function loadImg(src){return new Promise(res=>{const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>res(im); im.onerror=()=>res(null); im.src=src;});}
  function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const words=String(text||'').split(/\s+/); let line='', lines=0;
    for(let n=0;n<words.length;n++){
      const test=line+words[n]+' ';
      if(ctx.measureText(test).width>maxWidth && n>0){ctx.fillText(line.trim(),x,y); line=words[n]+' '; y+=lineHeight; lines++; if(lines>=maxLines)return y;}
      else line=test;
    }
    if(line&&lines<maxLines){ctx.fillText(line.trim(),x,y); y+=lineHeight;}
    return y;
  }
  async function shareStory(p){
    const W=1080,H=1920,c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,W,H); grad.addColorStop(0,'#0d0d0d'); grad.addColorStop(.55,'#2b160c'); grad.addColorStop(1,'#ff6b35'); ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.30)'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(201,169,110,.75)'; ctx.lineWidth=8; roundRect(ctx,44,44,W-88,H-88,42); ctx.stroke();
    const im=await loadImg(p.imagen||'');
    if(im){
      const boxX=120,boxY=170,boxW=840,boxH=650; ctx.save(); roundRect(ctx,boxX,boxY,boxW,boxH,36); ctx.clip();
      const r=Math.max(boxW/im.width,boxH/im.height), iw=im.width*r, ih=im.height*r; ctx.drawImage(im,boxX+(boxW-iw)/2,boxY+(boxH-ih)/2,iw,ih); ctx.restore();
    } else { ctx.fillStyle='rgba(255,255,255,.08)'; roundRect(ctx,120,170,840,650,36); ctx.fill(); ctx.font='160px serif'; ctx.fillStyle='#ff6b35'; ctx.fillText('M',470,550); }
    ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.font='bold 66px system-ui,Arial'; let y=920; y=wrapText(ctx,p.nombre,W/2,y,860,78,3);
    ctx.fillStyle='#ff6b35'; ctx.font='bold 82px system-ui,Arial'; ctx.fillText('$'+Number(p.precioActual||0).toFixed(2)+' USD',W/2,y+28); y+=130;
    ctx.fillStyle='#f0e0c5'; ctx.font='bold 42px system-ui,Arial'; ctx.fillText('📦 Stock: '+Number(p.stock||0)+'   🏷️ '+(p.categoria||'TiendaMax'),W/2,y); y+=95;
    ctx.fillStyle='#fff'; ctx.font='42px system-ui,Arial'; y=wrapText(ctx,'Pídelo directo por WhatsApp en TiendaMax',W/2,y,840,54,2);
    ctx.fillStyle='#c9a96e'; ctx.font='bold 48px system-ui,Arial'; ctx.fillText('tiendamax.org',W/2,H-245);
    ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='32px system-ui,Arial'; ctx.fillText('Toca “Pedir” en la tienda para reservar',W/2,H-185);
    const blob=await new Promise(res=>c.toBlob(res,'image/png',.95));
    const file=new File([blob],'tiendamax-estado-'+p.id+'.png',{type:'image/png'});
    const text='🔥 '+p.nombre+'\n'+url(p);
    if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){
      try{await navigator.share({files:[file],title:p.nombre,text}); notify('Elige WhatsApp → Estado para publicar','success'); return;}catch(e){if(/abort/i.test(e.message||''))return;}
    }
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=file.name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    try{await navigator.clipboard.writeText(text);}catch(e){}
    notify('Imagen de estado descargada. Súbela manualmente a WhatsApp Estado.','info');
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  async function handle(e){
    const btn=e.target.closest('[data-act]'); if(!btn)return; const row=btn.closest('[data-id]'); if(!row)return; const p=products().find(x=>String(x.id)===String(row.dataset.id)); if(!p)return;
    const action=btn.dataset.act; const text=txt(p); const link=url(p);
    if(action==='story'){ await shareStory(p); return; }
    if(action==='wa'){
      window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
      return;
    }
    if(action==='fb'){
      window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(link)+'&quote='+encodeURIComponent(text),'_blank','noopener,noreferrer'); return;
    }
    if(action==='copy'){
      try{await navigator.clipboard.writeText(text); notify('Texto y enlace copiados','success');}catch(err){notify('No se pudo copiar','error');}
    }
  }
  function boot(){ensure(); setTimeout(render,500);}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1200));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="publicar-ahora"],[data-tab="publicar-ahora"],[data-arg="publicacion"],[data-tab="publicacion"]')) setTimeout(boot,350);});
})();

// ── tm-mejora-descripciones-v1 ───────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  function notify(msg,t){if(typeof mostrarNotificacion==='function')mostrarNotificacion(msg,t||'info');}
  function products(){try{if(Array.isArray(window.productos))return window.productos;}catch(e){}try{return JSON.parse(localStorage.getItem('productos')||'[]');}catch(e){return[];}}
  function saveProducts(ps){
    try{if(typeof productos!=='undefined'&&Array.isArray(productos))productos=ps;}catch(e){}
    if(Array.isArray(window.productos))window.productos=ps;
    try{if(typeof guardarProductos==='function')guardarProductos();}catch(e){}
    localStorage.setItem('productos',JSON.stringify(ps));
  }
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function panel(title,sub,body){
    const p=$('#tmToolPanel');if(!p)return;
    p.className='tm-panel active';
    p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`;
    p.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap');if(!wrap||$('#tmMejoraDescCards'))return;
    const div=document.createElement('div');div.id='tmMejoraDescCards';
    div.innerHTML=`
      <div class="tm-tier"><h4>IA — CATÁLOGO</h4><span class="tm-tier-badge purple">Masivo</span></div>
      <div class="tm-tools-grid">
        <div class="tm-tool-card enabled" data-tool="improvedesc">
          <span class="state">IA</span>
          <div class="ico" style="background:rgba(46,204,113,.18)">✍️</div>
          <h5>Mejorar descripciones</h5>
          <p>Genera descripciones atractivas para todos los productos sin descripción o con texto corto.</p>
        </div>
      </div>`;
    const panelEl=$('#tmToolPanel');
    if(panelEl)wrap.insertBefore(div,panelEl);else wrap.appendChild(div);
  }
  function openImproveDesc(){
    const ps=products();
    const needs=ps.filter(p=>!p.descripcion||(p.descripcion||'').trim().length<80);
    const total=needs.length;
    panel('✍️ Mejorar descripciones con IA',total+' productos necesitan descripción',`
      <div class="tm-panel-body" style="padding:16px">
        <p style="color:#aaa;font-size:13px;margin-bottom:12px">La IA generará descripciones atractivas y persuasivas para los <b style="color:#fff">${total}</b> productos que tienen menos de 80 caracteres o ninguna descripción. Se procesa de a 5 por vez.</p>
        ${total===0?'<p style="color:#25d366">✅ Todos los productos ya tienen buena descripción.</p>':`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <button class="tm-btn primary" data-ds-act="runImproveDesc">🚀 Mejorar ${Math.min(total,100)} productos</button>
        </div>`}
        <div id="tmImproveDescOut" class="tm-code" style="min-height:60px;white-space:pre-wrap"></div>
      </div>`);
  }
  async function runImproveDesc(){
    const ps=products();
    const needs=ps.filter(p=>!p.descripcion||(p.descripcion||'').trim().length<80).slice(0,100);
    const out=$('#tmImproveDescOut');
    if(!out)return;
    let log=[],improved=0;
    for(let i=0;i<needs.length;i++){
      const p=needs[i];
      const idx=ps.findIndex(x=>String(x.id)===String(p.id));
      if(idx<0)continue;
      out.textContent=`⏳ ${i+1}/${needs.length}: ${p.nombre}\n\n`+log.slice(-14).join('\n');
      const price=Number(p.precioActual||0);
      const prompt=`Eres experto en ventas de una tienda online en Cuba. Escribe una descripción para vender este producto:\n- Nombre: "${p.nombre}"\n- Categoría: ${p.categoria||'General'}${price?'\n- Precio: $'+price.toFixed(2)+' USD':''}${p.garantia?'\n- Garantía: '+p.garantia:''}\n\nEscribe exactamente 3 oraciones persuasivas que destaquen el beneficio principal y creen deseo de compra. Lenguaje cubano natural. Sin asteriscos ni emojis ni markdown.`;
      try{
        const desc=await tmAIChat(prompt,{max_tokens:180,temperature:0.75});
        if(desc&&desc.trim().length>20){
          ps[idx]={...ps[idx],descripcion:desc.trim()};
          improved++;
          log.push(`✅ ${p.nombre}`);
        }else{
          log.push(`⚠️ ${p.nombre}: vacío`);
        }
        await sleep(500);
      }catch(e){
        log.push(`❌ ${p.nombre}: ${(e.message||'').slice(0,50)}`);
        await sleep(300);
      }
      // Guardar cada 5 para no perder progreso
      if((i+1)%5===0)saveProducts(ps);
    }
    saveProducts(ps);
    out.textContent=`✅ Listo — ${improved} descripciones mejoradas de ${needs.length} procesadas.\n\n`+log.join('\n');
    notify(`✅ ${improved} descripciones mejoradas`,'success');
  }
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-tool="improvedesc"]')){e.preventDefault();e.stopPropagation();openImproveDesc();return;}
    const a=e.target.closest('[data-ds-act="runImproveDesc"]');if(!a)return;
    e.preventDefault();e.stopPropagation();runImproveDesc();
  },true);
  function boot(){addCards();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1100));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="herramientas"],[data-tab="herramientas"]'))setTimeout(boot,300);});
})();

// ── tm-publicar-categoria-v2 ─────────────────────────────────────
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function notify(msg,t){if(typeof mostrarNotificacion==='function')mostrarNotificacion(msg,t||'info');}
  function products(){try{if(Array.isArray(window.productos))return window.productos;}catch(e){}try{return JSON.parse(localStorage.getItem('productos')||'[]');}catch(e){return[];}}
  function storeUrl(){return'https://tiendamax.org';}
  // Logo (solo la bolsa, fondo transparente) para marca de agua en la imagen
  const _bagImg=new Image();try{_bagImg.src='/iconos/bag.png';}catch(e){}
  function cats(){return[...new Set(products().filter(p=>p.activo!==false&&Number(p.stock||0)>0).map(p=>p.categoria||'General').filter(Boolean))].sort();}
  function prodsByCat(cat){return products().filter(p=>p.activo!==false&&Number(p.stock||0)>0&&(p.categoria||'General')===cat);}
  function toTag(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]/g,'');}

  // Emoji decorator based on product name keywords
  function emojiFor(nombre,cat){
    const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const n=norm(nombre), c=norm(cat);
    if(/wifi|router|enrutador|inalámb|inalamb|répetidor|repetidor/.test(n))return'📡';
    if(/audif|auricular|earphone|headphone|tws|earbuds/.test(n))return'🎧';
    if(/parlant|altavoz|bocina|speaker/.test(n))return'🔊';
    if(/batería|bateria|battery|lifepo|acumulador/.test(n))return'🔋';
    if(/panel solar|solar/.test(n))return'☀️';
    if(/inversor|inverter/.test(n))return'⚡';
    if(/cargador|charger/.test(n))return'🔌';
    if(/cable|hdmi|usb-c|usbc/.test(n))return'🔌';
    if(/cámara|camara|camera|webcam/.test(n))return'📷';
    if(/celular|teléfono|telefono|móvil|movil|smartphone/.test(n))return'📱';
    if(/laptop|computadora|pc |notebook/.test(n))return'💻';
    if(/televisor|tv |smart tv|pantalla|monitor/.test(n))return'📺';
    if(/reloj|watch|smartwatch/.test(n))return'⌚';
    if(/impresora|printer/.test(n))return'🖨️';
    if(/memoria|disco|ssd|pendrive|storage/.test(n))return'💾';
    if(/ventilador|fan |aire acondicionado/.test(n))return'🌀';
    if(/pistola.*masaje|masaje|massage/.test(n))return'💆';
    if(/teclado|keyboard/.test(n))return'⌨️';
    if(/mouse|ratón|raton/.test(n))return'🖱️';
    if(/gaming|game|joystick|control|mando/.test(n))return'🎮';
    if(/drone|dron/.test(n))return'🚁';
    if(/lámpara|lampara|led|luz|foco|bombil/.test(n))return'💡';
    if(/ropa|camisa|pantalon|vestido|blusa/.test(c+' '+n))return'👗';
    if(/calzado|zapato|tenis|deportivo/.test(c+' '+n))return'👟';
    if(/belleza|cosmet|perfume|crema/.test(c+' '+n))return'💄';
    if(/juguete|toy/.test(c+' '+n))return'🧸';
    if(/deport|sport/.test(c))return'🏃';
    if(/hogar|casa/.test(c))return'🏠';
    if(/aliment|comida/.test(c))return'🍽️';
    if(/electr/.test(c))return'⚡';
    return'✨';
  }

  function hashtags(cat,prods){
    const tags=new Set(['TiendaMax','Cuba']);
    const ct=toTag(cat);if(ct)tags.add(ct);
    prods.slice(0,18).forEach(p=>{
      if(p.id)tags.add('prod'+p.id);
      String(p.nombre||'').split(/\s+/).map(w=>toTag(w)).filter(t=>t.length>3).slice(0,2).forEach(t=>tags.add(t.charAt(0).toUpperCase()+t.slice(1).toLowerCase()));
    });
    return[...tags].map(t=>'#'+t).join(' ');
  }

  function buildText(cat){
    const prods=prodsByCat(cat);if(!prods.length)return '';
    const sep='━'.repeat(24);
    const header=`🏪 TIENDAMAX — ${String(cat).toUpperCase()}\n${sep}\n\n`;
    const lines=prods.map(p=>`${emojiFor(p.nombre,cat)} ${p.nombre} — $${Number(p.precioActual||0).toFixed(2)} USD`).join('\n');
    const footer=`\n\n📲 Escríbenos para reservar tu pedido\n🔗 ${storeUrl()}\n\n${hashtags(cat,prods)}`;
    return header+lines+footer;
  }

  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

  async function genImg(cat){
    const prods=prodsByCat(cat);if(!prods.length)return null;
    const W=1080,H=1080,cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
    // Background
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0a0805');g.addColorStop(.45,'#1c0e06');g.addColorStop(1,'#2d1a08');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // Marca de agua: la bolsa del logo, suave y centrada
    try{if(_bagImg&&_bagImg.complete&&_bagImg.naturalWidth){const bw=W*0.5,bh=bw;ctx.save();ctx.globalAlpha=0.06;ctx.drawImage(_bagImg,(W-bw)/2,(H-bh)/2,bw,bh);ctx.restore();}}catch(e){}
    // Gold border
    ctx.strokeStyle='rgba(201,169,110,.6)';ctx.lineWidth=7;roundRect(ctx,26,26,W-52,H-52,38);ctx.stroke();
    // Top accent bar
    const gb=ctx.createLinearGradient(60,0,W-60,0);gb.addColorStop(0,'#c9a96e');gb.addColorStop(.5,'#FF6B35');gb.addColorStop(1,'#c9a96e');
    ctx.fillStyle=gb;ctx.fillRect(60,55,W-120,9);
    // Store name
    ctx.textAlign='center';ctx.fillStyle='#FF6B35';ctx.font='bold 62px system-ui,Arial,sans-serif';ctx.fillText('TIENDAMAX',W/2,152);
    // Category
    ctx.fillStyle='#f5e6d0';ctx.font='bold 40px system-ui,Arial,sans-serif';ctx.fillText(String(cat).toUpperCase(),W/2,210);
    // Divider
    ctx.strokeStyle='rgba(255,107,53,.3)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(80,232);ctx.lineTo(W-80,232);ctx.stroke();
    // Products
    const max=Math.min(prods.length,13);const lh=Math.min(60,Math.floor((H-390)/max));
    let y=268+lh;
    ctx.textAlign='left';
    for(let i=0;i<max;i++){
      const p=prods[i];
      const em=emojiFor(p.nombre,cat);
      const name=String(p.nombre||'').length>36?String(p.nombre).slice(0,35)+'…':p.nombre||'';
      const price='$'+Number(p.precioActual||0).toFixed(2);
      const fs=lh-14;
      ctx.fillStyle='#e8dcc8';ctx.font=`${fs}px system-ui,Arial,sans-serif`;ctx.fillText(em+' '+name,80,y);
      ctx.fillStyle='#FF6B35';ctx.font=`bold ${fs}px system-ui,Arial,sans-serif`;ctx.textAlign='right';ctx.fillText(price,W-75,y);
      ctx.textAlign='left';
      // Subtle row separator
      if(i<max-1){ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(80,y+12);ctx.lineTo(W-80,y+12);ctx.stroke();}
      y+=lh;
    }
    if(prods.length>max){ctx.fillStyle='#666';ctx.font='italic 21px system-ui,Arial,sans-serif';ctx.fillText(`+ ${prods.length-max} productos más en la tienda`,80,y+10);}
    // Footer divider
    ctx.strokeStyle='rgba(255,107,53,.3)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(80,H-148);ctx.lineTo(W-80,H-148);ctx.stroke();
    // Footer text
    ctx.textAlign='center';ctx.fillStyle='#f5e6d0';ctx.font='bold 28px system-ui,Arial,sans-serif';ctx.fillText('📲 Escríbenos para reservar tu pedido',W/2,H-108);
    ctx.fillStyle='#c9a96e';ctx.font='22px system-ui,Arial,sans-serif';ctx.fillText(storeUrl(),W/2,H-70);
    // Bottom accent bar
    ctx.fillStyle=gb;ctx.fillRect(60,H-43,W-120,9);
    return new Promise(res=>cv.toBlob(res,'image/png',.95));
  }

  let _pvUrl=null;
  async function updatePreview(){
    const cat=$('#tmCatPubSel')?.value;
    const wrap=$('#tmCatPubPreview'),acts=$('#tmCatPubActions'),cap=$('#tmCatPubCap');
    document.querySelectorAll('#tmCatPubChips .tmcp-chip').forEach(c=>c.classList.toggle('on',c.dataset.cat===cat));
    if(!cat){if(wrap)wrap.style.display='none';if(acts)acts.style.display='none';return;}
    const prods=prodsByCat(cat);
    if(cap){
      const precios=prods.map(p=>Number(p.precioActual||0)).filter(n=>n>0);
      const min=precios.length?Math.min(...precios):0;
      const tags=hashtags(cat,prods).split(' ').slice(0,3).join(' ');
      cap.innerHTML=`<div class="t">🏪 TiendaMax — ${esc(cat)}</div><div class="d">${prods.length} producto${prods.length!==1?'s':''}${min?' · desde $'+min:''} · <span class="tag">${esc(tags)}</span></div>`;
    }
    if(acts)acts.style.display='block';
    if(wrap)wrap.style.display='block';
    // Genera la imagen real como vista previa (lo que verá el comprador)
    try{
      const blob=await genImg(cat);
      if(blob){const url=URL.createObjectURL(blob);const img=$('#tmCatPubImg');if(img)img.src=url;if(_pvUrl)URL.revokeObjectURL(_pvUrl);_pvUrl=url;}
    }catch(e){}
  }

  async function onCopy(){const cat=$('#tmCatPubSel')?.value;if(!cat)return;try{await navigator.clipboard.writeText(buildText(cat));notify('📋 Texto copiado — pégalo donde quieras','success');}catch(e){notify('No se pudo copiar','error');}}
  function onWA(){const cat=$('#tmCatPubSel')?.value;if(!cat)return;window.open('https://wa.me/?text='+encodeURIComponent(buildText(cat)),'_blank','noopener,noreferrer');}
  function onFB(){const cat=$('#tmCatPubSel')?.value;if(!cat)return;onCopy();window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(storeUrl()),'_blank','noopener,noreferrer');notify('Texto copiado — pégalo en el post de Facebook','info');}
  function onRev(){const cat=$('#tmCatPubSel')?.value;if(!cat)return;onCopy();window.open('https://www.revolico.com/','_blank','noopener,noreferrer');notify('Texto copiado — pégalo al crear tu anuncio en Revolico','info');}

  // Instagram no permite compartir directo desde la web: genera la imagen,
  // la comparte (móvil) o descarga, y copia el texto para el pie de foto.
  async function onIG(){
    const cat=$('#tmCatPubSel')?.value;if(!cat)return;
    const btn=$('#tmCatPubIGBtn');if(btn){btn.disabled=true;}
    try{
      try{await navigator.clipboard.writeText(buildText(cat));}catch(e){}
      const blob=await genImg(cat);if(!blob){notify('Sin productos con stock','warning');return;}
      const file=new File([blob],'tiendamax-'+toTag(cat)+'.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){
        try{await navigator.share({files:[file],title:'TiendaMax — '+cat});notify('Texto copiado — pégalo como pie de foto en Instagram','success');return;}
        catch(e){if(/abort/i.test(e.message||''))return;}
      }
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      notify('📸 Imagen descargada y texto copiado — súbelos a Instagram','info');
    }finally{if(btn){btn.disabled=false;}}
  }

  async function onImg(){
    const cat=$('#tmCatPubSel')?.value;if(!cat)return;
    const btn=$('#tmCatPubImgBtn');if(btn){btn.textContent='⏳ Generando…';btn.disabled=true;}
    try{
      const blob=await genImg(cat);if(!blob){notify('Sin productos con stock','warning');return;}
      const file=new File([blob],'tiendamax-'+toTag(cat)+'.png',{type:'image/png'});
      const text=buildText(cat);
      if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){
        try{await navigator.share({files:[file],title:'TiendaMax — '+cat,text});notify('¡Listo para compartir!','success');return;}
        catch(e){if(/abort/i.test(e.message||''))return;}
      }
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      try{await navigator.clipboard.writeText(text);}catch(e){}
      notify('Imagen descargada · Texto copiado','info');
    }finally{if(btn){btn.textContent='🖼️ Imagen';btn.disabled=false;}}
  }

  function injectStyle(){
    if(document.getElementById('tmCatPubStyle'))return;
    const st=document.createElement('style');st.id='tmCatPubStyle';
    st.textContent=`
    #tmCatPublishCard{background:linear-gradient(135deg,rgba(255,107,53,.08),rgba(201,169,110,.06));border:1px solid rgba(255,107,53,.25);border-radius:16px;padding:18px 16px 16px;margin-bottom:18px}
    .tmcp-hd{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    .tmcp-hd .ic{font-size:22px}
    .tmcp-hd h2{margin:0;font-size:15px;color:#FF6B35}
    .tmcp-hd p{margin:2px 0 0;font-size:11px;color:#9b9189}
    .tmcp-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:5px;margin-bottom:14px}
    .tmcp-chips::-webkit-scrollbar{display:none}
    .tmcp-chip{flex:0 0 auto;background:#1c1813;border:1px solid rgba(255,255,255,.08);color:#9b9189;border-radius:999px;padding:8px 13px;font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer}
    .tmcp-chip.on{background:rgba(255,107,53,.16);border-color:rgba(255,107,53,.5);color:#FF6B35}
    .tmcp-chip .n{opacity:.7;font-weight:600;margin-left:5px}
    .tmcp-pvlabel{font-size:10px;color:#9b9189;text-transform:uppercase;letter-spacing:.08em;margin:0 2px 8px;font-weight:700}
    .tmcp-preview{background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;margin-bottom:14px}
    .tmcp-preview img{display:block;width:100%;height:auto}
    .tmcp-cap{padding:10px 12px 12px}
    .tmcp-cap .t{font-size:12.5px;font-weight:800;color:#f2ece3;margin-bottom:3px}
    .tmcp-cap .d{font-size:11px;color:#9b9189;line-height:1.5}
    .tmcp-cap .tag{color:#C9A96E}
    .tmcp-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:9px}
    .tmcp-row{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .tmcp-btn{border:0;border-radius:11px;font-weight:700;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 8px;color:#fff;min-height:44px}
    .tmcp-wa{background:#25D366;color:#063}.tmcp-fb{background:#1877F2}.tmcp-ig{background:linear-gradient(135deg,#feda75,#d62976 45%,#962fbf 75%,#4f5bd5)}.tmcp-rev{background:#00BFA5;color:#053}
    .tmcp-ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f2ece3}
    .tmcp-cta{background:linear-gradient(135deg,#FF6B35,#C9A96E);color:#1a1006}
    .tmcp-empty{padding:18px 10px;text-align:center;color:#9b9189;font-size:12px}`;
    document.head.appendChild(st);
  }

  function build(){
    const tab=document.getElementById('pubPanel-publicar')||document.getElementById('publicar-ahora');if(!tab)return;
    if(document.getElementById('tmCatPublishCard'))return;
    injectStyle();
    const card=document.createElement('div');card.id='tmCatPublishCard';
    const cs=cats();
    const chips=cs.map(c=>`<button type="button" class="tmcp-chip" data-cat="${esc(c)}">${esc(c)}<span class="n">${prodsByCat(c).length}</span></button>`).join('');
    card.innerHTML=`
    <div class="tmcp-hd"><span class="ic">📣</span><div><h2>Compartir categoría</h2><p>Texto + imagen listos para cada red</p></div></div>
    <div class="tmcp-chips" id="tmCatPubChips">${chips||'<span class="tmcp-empty">No hay categorías con stock</span>'}</div>
    <input type="hidden" id="tmCatPubSel" value="">
    <div class="tmcp-pvlabel">Vista previa · así se compartirá</div>
    <div class="tmcp-preview" id="tmCatPubPreview" style="display:none"><img id="tmCatPubImg" alt="Vista previa de la publicación"><div class="tmcp-cap" id="tmCatPubCap"></div></div>
    <div id="tmCatPubActions" style="display:none">
      <div class="tmcp-grid">
        <button type="button" class="tmcp-btn tmcp-wa" id="tmCatPubWABtn">💚 WhatsApp</button>
        <button type="button" class="tmcp-btn tmcp-fb" id="tmCatPubFBBtn">📘 Facebook</button>
        <button type="button" class="tmcp-btn tmcp-ig" id="tmCatPubIGBtn">📸 Instagram</button>
        <button type="button" class="tmcp-btn tmcp-rev" id="tmCatPubRevBtn">🟢 Revolico</button>
      </div>
      <div class="tmcp-row">
        <button type="button" class="tmcp-btn tmcp-ghost" id="tmCatPubCopyBtn">📋 Copiar texto</button>
        <button type="button" class="tmcp-btn tmcp-cta" id="tmCatPubImgBtn">🖼️ Imagen</button>
      </div>
    </div>`;
    const root=document.getElementById('tmPublicarRoot');
    const backend=document.getElementById('backendStatus');
    if(root)root.parentNode.insertBefore(card,root);
    else if(backend)backend.parentNode.insertBefore(card,backend.nextSibling);
    else tab.insertBefore(card,tab.firstChild);
    card.querySelector('#tmCatPubChips').addEventListener('click',e=>{const ch=e.target.closest('.tmcp-chip');if(!ch)return;card.querySelector('#tmCatPubSel').value=ch.dataset.cat;updatePreview();});
    card.querySelector('#tmCatPubCopyBtn').addEventListener('click',onCopy);
    card.querySelector('#tmCatPubWABtn').addEventListener('click',onWA);
    card.querySelector('#tmCatPubFBBtn').addEventListener('click',onFB);
    card.querySelector('#tmCatPubIGBtn').addEventListener('click',onIG);
    card.querySelector('#tmCatPubRevBtn').addEventListener('click',onRev);
    card.querySelector('#tmCatPubImgBtn').addEventListener('click',onImg);
    if(cs.length){card.querySelector('#tmCatPubSel').value=cs[0];}
  }
  function boot(){build();updatePreview();}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1500));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="publicar-ahora"],[data-tab="publicar-ahora"],[data-arg="publicacion"],[data-tab="publicacion"]'))setTimeout(boot,400);});
})();
// ── tm-deepseek-tools-v16 (Agente Inteligente Autónomo de Tareas) ──
(function(){
  const $ = (s, r = document) => r.querySelector(s);
  
  // 1. Solicitar permisos de notificación nativa al entrar al panel
  function solicitarPermisosNotificaciones() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // 2. Lanzar la notificación Push en el dispositivo
  function lanzarNotificacionPush(titulo, mensaje) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(titulo, {
        body: mensaje,
        icon: '/favicon.ico' // Asegúrate de colocar tu ruta correcta de icono
      });
    }
  }

  // 3. El Cerebro del Agente: Analiza el estado y genera planes de acción autónomos
  // MEJORADO v2: incluye ventas, contexto Cuba, acciones ejecutables, historial
  const _tmAgenteHistorial = (() => {
    try { return JSON.parse(localStorage.getItem('tm_agente_historial_v1') || '[]'); } catch(e) { return []; }
  })();
  function _tmAgenteGuardarHistorial(tarea) {
    try {
      _tmAgenteHistorial.unshift({ ts: Date.now(), tarea: tarea.descripcion || '', tipo: tarea.tipo || '' });
      if (_tmAgenteHistorial.length > 50) _tmAgenteHistorial.length = 50;
      localStorage.setItem('tm_agente_historial_v1', JSON.stringify(_tmAgenteHistorial));
    } catch(e) {}
  }

  async function ejecutarAgenteAutonomo() {
    console.log('🤖 Agente TiendaMax v2 activado: Analizando estado con contexto Cuba...');
    
    let fb = { vistas: {}, whatsapp: {}, suscriptores: 0 };
    try { if (typeof tmLeerAnalytics === 'function') fb = await tmLeerAnalytics(); } catch(e){}
    
    // Construir payload enriquecido con ventas + contexto Cuba
    let payload = {};
    try {
      const ps = window.productos || [];
      const ventas = (() => {
        try { return JSON.parse(localStorage.getItem('registroVentas') || '[]'); } catch(e) { return []; }
      })();
      const tasaMN = (() => {
        try { return parseInt(localStorage.getItem('tasaMN') || '0'); } catch(e) { return 0; }
      })();
      
      // Top productos por vistas
      const topVistas = Object.entries(fb.vistas || {})
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 5)
        .map(([id, data]) => {
          const p = ps.find(x => String(x.id) === String(id));
          return { nombre: p ? p.nombre : 'desconocido', vistas: data.count || 0, stock: p ? p.stock : 0, precio: p ? p.precioActual : 0 };
        });
      
      // Top productos por WhatsApp (intención de compra)
      const topWhatsApp = Object.entries(fb.whatsapp || {})
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 5)
        .map(([id, data]) => {
          const p = ps.find(x => String(x.id) === String(id));
          return { nombre: p ? p.nombre : 'desconocido', consultas: data.count || 0, stock: p ? p.stock : 0 };
        });
      
      // Ventas recientes (últimos 7 días)
      const hace7dias = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const ventasRecientes = ventas.filter(v => v.ts > hace7dias);
      const totalVentas7d = ventasRecientes.reduce((s, v) => s + (v.total || 0), 0);
      const productosVendidos = ventasRecientes.reduce((acc, v) => {
        const nombre = v.producto || v.nombre || '';
        acc[nombre] = (acc[nombre] || 0) + (v.cantidad || 1);
        return acc;
      }, {});
      const topVendidos = Object.entries(productosVendidos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([nombre, cant]) => ({ nombre, cantidad: cant }));

      payload = {
        // Contexto Cuba
        contexto: {
          pais: 'Cuba',
          moneda: 'USD + MN (tasa: ' + tasaMN + ')',
          canalVenta: 'WhatsApp (pedidos por chat)',
          horariosPico: '12:00-14:00 y 19:00-22:00 (hora Cuba)',
          diasPago: 'fin de mes (quincena 15 y 30)',
          totalSuscriptores: fb.suscriptores || 0
        },
        // Catálogo
        catalogo: {
          totalProductos: ps.length,
          activos: ps.filter(p => p.stock > 0).length,
          agotados: ps.filter(p => Number(p.stock||0) <= 0).map(p => ({ nombre: p.nombre, categoria: p.categoria })),
          stockBajo: ps.filter(p => Number(p.stock||0) > 0 && Number(p.stock||0) <= 3).map(p => ({ nombre: p.nombre, stock: p.stock, categoria: p.categoria })),
          sinSpecs: ps.filter(p => !Array.isArray(p.specs) || p.specs.length === 0).length,
          sinGarantia: ps.filter(p => !p.garantia).length,
          sinDescripcion: ps.filter(p => !p.descripcion || p.descripcion.length < 30).length
        },
        // Ventas
        ventas: {
          totalUltimos7dias: totalVentas7d,
          cantidadVentas: ventasRecientes.length,
          topVendidos: topVendidos
        },
        // Interés del cliente
        interes: {
          topVistas: topVistas,
          topConsultasWhatsApp: topWhatsApp
        },
        // Historial de tareas ya sugeridas (para no repetir)
        tareasAnteriores: _tmAgenteHistorial.slice(0, 10).map(h => h.tarea)
      };
    } catch(e) { console.warn('Error construyendo payload:', e); return; }

    // Prompt mejorado con contexto Cuba + acciones ejecutables
    const prompt = `Actúa como el Director Comercial de TiendaMax, una tienda online en Cuba que vende por WhatsApp con precios en USD y conversión a MN (moneda nacional).

Analiza el estado de la tienda y genera EXACTAMENTE 3 tareas accionables que el administrador debe ejecutar HOY para aumentar ventas.

CONTEXTO CUBA (importante):
- Los clientes compran por WhatsApp, no hay pasarela de pago online
- Pago contra entrega (efectivo USD o MN)
- Conexiones lentas (3G), imágenes deben ser ligeras
- Horarios pico: 12-14h y 19-22h (hora Cuba)
- Días de pago: quincena (15 y 30 de cada mes)

DATOS ACTUALES:
${JSON.stringify(payload, null, 2)}

PRIORIZA:
1. Productos con muchas vistas pero pocas ventas (oportunidad de conversión)
2. Productos agotados o stock bajo que pierden ventas
3. Productos sin specs/garantía/descripción que reducen conversión

Responde ÚNICAMENTE con JSON (sin markdown):
{
  "alertaPush": {"titulo": "string", "mensaje": "string breve"},
  "tareas": [
    {
      "id": 1,
      "tipo": "Stock|Precio|Descripcion|Specs|Garantia|SEO|Imagen|Venta",
      "titulo": "título corto (máx 50 chars)",
      "descripcion": "qué hacer exactamente",
      "prioridad": "Alta|Media|Baja",
      "accion": "editar_producto|ver_ventas|publicar|ver_analytics|ninguna",
      "productoId": "id del producto afectado o null",
      "impactoEstimado": "qué ganancia o ahorro espera (ej: +$50 USD/semana)"
    }
  ]
}`;

    try {
      // Actualizar panel a "analizando..."
      const panel = document.getElementById('tmConsolaAgenteIA');
      if (panel) {
        const loadingDiv = panel.querySelector('#tmAgenteLoading');
        if (loadingDiv) loadingDiv.innerHTML = '⏳ Analizando con IA...';
      }

      const respuestaIA = await tmAIChat(prompt, { max_tokens: 800, temperature: 0.5 });
      const jsonLimpio = tmExtractJsonObject(respuestaIA);
      
      if (jsonLimpio) {
        const datosAgente = JSON.parse(jsonLimpio);
        
        // Notificación push
        if (datosAgente.alertaPush) {
          lanzarNotificacionPush(datosAgente.alertaPush.titulo, datosAgente.alertaPush.mensaje);
        }
        
        // Renderizar panel con acciones ejecutables
        renderizarConsolaAgente(datosAgente.tareas || []);
      }
    } catch (error) {
      console.error('Error en el agente autónomo v2:', error);
      // Mostrar error en el panel
      const panel = document.getElementById('tmConsolaAgenteIA');
      if (panel) {
        const loadingDiv = panel.querySelector('#tmAgenteLoading');
        if (loadingDiv) loadingDiv.innerHTML = '<span style="color:#e74c3c;font-size:12px;">⚠️ Sin API Key. Configúrala en Configuración → IA.</span>';
      }
    }
  }

  // 4. Panel visual mejorado con acciones ejecutables
  function renderizarConsolaAgente(tareas) {
    let panelAgente = document.getElementById('tmConsolaAgenteIA');
    if (!panelAgente) {
      panelAgente = document.createElement('div');
      panelAgente.id = 'tmConsolaAgenteIA';
      panelAgente.style.cssText = 'background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(255,107,53,0.06));backdrop-filter:blur(12px);border:1px solid rgba(139,92,246,0.25);border-radius:16px;padding:18px;margin:15px 0;color:#fff;box-shadow:0 4px 24px rgba(139,92,246,0.10);';
      
      // Insertar al inicio del tab Herramientas o al inicio del main
      const contenedor = document.querySelector('#herramientas .tm-tools-wrap') || document.querySelector('.tm-main') || document.body;
      contenedor.insertBefore(panelAgente, contenedor.firstChild);
    }

    const coloresTipo = {
      'Stock': '#e74c3c',
      'Precio': '#f39c12',
      'Descripcion': '#3498db',
      'Specs': '#9b59b6',
      'Garantia': '#1abc9c',
      'SEO': '#2ecc71',
      'Imagen': '#e67e22',
      'Venta': '#c9a96e'
    };

    const accionesLabels = {
      'editar_producto': '✏️ Editar producto',
      'ver_ventas': '💰 Ver ventas',
      'publicar': '📢 Publicar',
      'ver_analytics': '📊 Ver analytics',
      'ninguna': '—'
    };

    const listaTareasHTML = tareas.map((t, i) => {
      const color = coloresTipo[t.tipo] || '#888';
      const prioridadColor = t.prioridad === 'Alta' ? '#e74c3c' : (t.prioridad === 'Media' ? '#f39c12' : '#27ae60');
      const accionLabel = accionesLabels[t.accion] || '—';
      const tieneAccion = t.accion && t.accion !== 'ninguna';
      const productoId = t.productoId && t.productoId !== 'null' ? t.productoId : null;
      
      return `
        <div style="background:rgba(0,0,0,0.25);padding:14px;border-left:4px solid ${color};border-radius:10px;margin-bottom:10px;font-size:13px;transition:background .15s;" onmouseover="this.style.background='rgba(0,0,0,0.35)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:10px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="background:${color};color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase;">${t.tipo || 'Tarea'}</span>
                <span style="background:${prioridadColor};color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;">${t.prioridad || 'Media'}</span>
              </div>
              <strong style="color:#fff;font-size:14px;display:block;margin-bottom:4px;">${t.titulo || t.descripcion || ''}</strong>
              <div style="color:#ccc;line-height:1.5;">${t.descripcion || ''}</div>
              ${t.impactoEstimado ? `<div style="color:#2ecc71;font-size:11px;margin-top:6px;font-weight:600;">📈 ${t.impactoEstimado}</div>` : ''}
            </div>
          </div>
          ${tieneAccion ? `
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
              <button onclick="tmAgenteEjecutarAccion('${t.accion}',${productoId ? '\''+productoId+'\'' : 'null'})" style="background:${color};color:#fff;border:0;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;">${accionLabel}</button>
              <button onclick="this.closest('div[style*=border-left]').style.opacity='0.4';_tmAgenteGuardarHistorial(${JSON.stringify(t).replace(/"/g,'&quot;')})" style="background:rgba(255,255,255,0.08);color:#888;border:1px solid rgba(255,255,255,0.15);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;">✓ Hecho</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    panelAgente.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:20px;">🤖</span>
          <div>
            <h4 style="margin:0;color:#c4b5fd;font-size:15px;font-weight:700;">Supervisor IA — Tareas para Hoy</h4>
            <small style="color:#888;font-size:11px;">Análisis con contexto Cuba • ${new Date().toLocaleString('es-CU',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}</small>
          </div>
        </div>
        <button id="btnReanalizarAgente" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);color:#c4b5fd;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;transition:all .15s;" onmouseover="this.style.background='rgba(139,92,246,0.25)'" onmouseout="this.style.background='rgba(139,92,246,0.15)'">🔄 Reanalizar</button>
      </div>
      <div id="tmAgenteLoading" style="display:none;"></div>
      <div>${listaTareasHTML || '<p style="color:#888;text-align:center;padding:20px;">No hay tareas críticas. ¡Todo en orden! ✅</p>'}</div>
    `;

    const btnReanalizar = panelAgente.querySelector('#btnReanalizarAgente');
    if (btnReanalizar) btnReanalizar.addEventListener('click', () => {
      const loadingDiv = panelAgente.querySelector('#tmAgenteLoading');
      if (loadingDiv) {
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = '⏳ Analizando con IA...';
      }
      ejecutarAgenteAutonomo();
    });
  }

  // Función global para ejecutar acciones desde los botones del agente
  window.tmAgenteEjecutarAccion = function(accion, productoId) {
    switch(accion) {
      case 'editar_producto':
        if (productoId && typeof editarProducto === 'function') {
          editarProducto(productoId);
        } else if (typeof switchTab === 'function') {
          switchTab('manage-products');
        }
        break;
      case 'ver_ventas':
        if (typeof switchTab === 'function') switchTab('ventas');
        break;
      case 'publicar':
        if (typeof switchTab === 'function') switchTab('publicacion');
        break;
      case 'ver_analytics':
        if (typeof switchTab === 'function') switchTab('analytics');
        break;
      default:
        console.log('Acción no reconocida:', accion);
    }
  };
  window._tmAgenteGuardarHistorial = _tmAgenteGuardarHistorial;

  // Inicializar al cargar el Panel
  function bootAgente() {
    solicitarPermisosNotificaciones();
    // Esperar a que Firebase cargue los productos/vistas para que lea datos reales
    setTimeout(ejecutarAgenteAutonomo, 3500); 
    // Monitoreo continuo cada 30 min (mejora v2)
    setInterval(() => {
      // Solo reanalizar si el admin está visible y la pestaña activa
      if (!document.hidden && document.getElementById('tmConsolaAgenteIA')) {
        ejecutarAgenteAutonomo();
      }
    }, 30 * 60 * 1000); // 30 minutos
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAgente);
  } else {
    bootAgente();
  }
})();

