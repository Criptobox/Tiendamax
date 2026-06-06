// ═══════════════════════════════════════════════════════
// TiendaMax Admin AI Tools — DeepSeek modules v1-v14
// Extraído de admin.html para reducir peso y facilitar mantenimiento.
// Cada módulo está encapsulado en su propio IIFE.
// ═══════════════════════════════════════════════════════

function tmDeepSeekFriendlyError(status, text='') {
  let msg = '';
  try { msg = JSON.parse(text).error?.message || text; } catch(e) { msg = text || ''; }
  if (status === 402 || /insufficient\s*balance|balance|credit|billing|quota/i.test(msg)) {
    return 'DeepSeek: saldo/créditos insuficientes. Recarga tu cuenta de DeepSeek o cambia a modo local; no es un error de TiendaMax.';
  }
  if (status === 401 || status === 403 || /invalid.*key|unauthorized|forbidden|api[_ ]?key/i.test(msg)) {
    return 'DeepSeek: API Key inválida o sin permiso. Revisa la clave guardada en Configuración.';
  }
  if (status === 429 || /rate limit|too many/i.test(msg)) {
    return 'DeepSeek: límite de uso temporal alcanzado. Espera un poco e intenta de nuevo.';
  }
  return 'DeepSeek HTTP ' + status + (msg ? ': ' + String(msg).slice(0, 140) : '');
}


function tmAIProviderInfo() {
  const key = localStorage.getItem('anthropicApiKey') || '';
  const provider = localStorage.getItem('anthropicApiProvider') || (key.startsWith('sk-or-') ? 'openrouter' : key.startsWith('sk-') ? 'deepseek' : '');
  return { key, provider };
}
function tmOpenRouterModel() {
  return localStorage.getItem('tmOpenRouterModel') || 'deepseek/deepseek-chat-v3-0324:free';
}
async function tmAIChat(prompt, opts = {}) {
  const { key, provider } = tmAIProviderInfo();
  const max_tokens = opts.max_tokens || 900;
  if (!key) throw new Error('No hay API Key configurada en Configuración → IA.');
  if (provider === 'openrouter' || key.startsWith('sk-or-')) {
    const model = tmOpenRouterModel();
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    if (!resp.ok) { let t=''; try{t=await resp.text()}catch(e){}; throw new Error(tmDeepSeekFriendlyError(resp.status,t).replace('DeepSeek','OpenRouter')); }
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  }
  if (provider === 'deepseek' || key.startsWith('sk-')) {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
    if(!resp.ok){let t='';try{t=await resp.text()}catch(e){};throw new Error(tmDeepSeekFriendlyError(resp.status,t));}
    const data=await resp.json();
    return (data.choices?.[0]?.message?.content||'').trim();
  }
  throw new Error('Proveedor IA no soportado todavía para esta herramienta. Usa OpenRouter (sk-or-) o DeepSeek (sk-).');
}
window.tmAIChat = tmAIChat;
window.tmOpenRouterModel = tmOpenRouterModel;

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
  async function callDeepSeek(prompt){
    return tmAIChat(prompt, { max_tokens: 850 });
  }
  async function genAI(){
    const out=$('#tmToolOut'); if(!out) return;
    const p=prodBySelect('tmAiProd');
    const tono=$('#tmAiTone')?.value||'Premium vendedor';
    out.textContent='⏳ Generando con DeepSeek...';
    const prompt=`Crea textos para este producto de TiendaMax.\n\n${prodInfo(p)}\n\nTono/Formato: ${tono}.\n\nEntrega:\n1) Título mejorado corto.\n2) Descripción lista para la ficha del producto, 2-4 oraciones.\n3) Texto corto para WhatsApp.\n4) 5 beneficios en bullets.\n5) Hashtags útiles.\n\nNo inventes especificaciones no dadas.`;
    try{ out.textContent=await callDeepSeek(prompt); notify('✅ Texto generado con DeepSeek','success'); }
    catch(e){ out.textContent=fallback(p,'ai')+'\n\n⚠️ Nota: '+e.message+'. Usé plantilla local.'; notify('Plantilla local: configura DeepSeek en Configuración','warning'); }
  }
  async function genPost(){
    const out=$('#tmToolOut'); if(!out) return;
    const p=prodBySelect('tmPostProd');
    const formato=$('#tmPostType')?.value||'Facebook grupo';
    out.textContent='⏳ Generando post con DeepSeek...';
    const prompt=`Genera una publicación lista para copiar.\n\nProducto:\n${prodInfo(p)}\n\nFormato: ${formato}.\n\nReglas:\n- Español natural para Cuba.\n- Usa emojis con moderación.\n- Incluye precio y stock si están disponibles.\n- Cierra con llamada a WhatsApp/reserva.\n- No prometas envíos ni garantía si no está indicado.\n- Si es Facebook grupo, hazlo corto y directo.`;
    try{ out.textContent=await callDeepSeek(prompt); notify('✅ Post generado con DeepSeek','success'); }
    catch(e){ out.textContent=fallback(p,'post')+'\n\n⚠️ Nota: '+e.message+'. Usé plantilla local.'; notify('Plantilla local: configura DeepSeek en Configuración','warning'); }
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekExtraCards')) return;
    const div=document.createElement('div');
    div.id='tmDeepSeekExtraCards';
    div.innerHTML=`
      <div class="tm-tier"><h4>DEEPSEEK — SIGUIENTES PASOS</h4><span class="tm-tier-badge purple">IA conectada</span></div>
      <div class="tm-tools-grid">
        <div class="tm-tool-card enabled" data-tool="pushai"><span class="state">IA</span><div class="ico" style="background:rgba(245,158,11,.18)">🔔</div><h5>Push con IA</h5><p>Genera título, mensaje y URL de notificación desde un producto.</p></div>
        <div class="tm-tool-card enabled" data-tool="waai"><span class="state">IA</span><div class="ico" style="background:rgba(37,211,102,.18)">💬</div><h5>Respuesta WhatsApp</h5><p>Responde preguntas de clientes con tono vendedor y natural.</p></div>
      </div>`;
    const panel=$('#tmToolPanel');
    if(panel) wrap.insertBefore(div,panel); else wrap.appendChild(div);
  }
  function openPushAI(){
    panel('🔔 Generador IA de notificaciones push','DeepSeek crea un título y mensaje corto listo para enviar.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Producto</label><select id="tmPushAiProd">${productOptions()}</select></div>
        <div class="tm-field"><label>Tipo</label><select id="tmPushAiTone"><option>Producto nuevo</option><option>Oferta elegante</option><option>Urgencia suave</option><option>Últimas unidades</option><option>Vuelve a estar disponible</option></select></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds-act="pushGen">Generar push</button><button class="tm-btn gold" data-ds-act="pushApply">Aplicar en Configuración</button><button class="tm-btn" data-ds-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Genera una notificación para rellenar Título, Mensaje y URL.</div>`);
  }
  function openWaAI(){
    panel('💬 Respuestas WhatsApp con IA','Escribe la pregunta del cliente y DeepSeek genera una respuesta lista para copiar.',`
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
    out.textContent='⏳ Generando push con DeepSeek...';
    const prompt=`Crea una notificación push para TiendaMax.\n\nProducto:\n${prodInfo(p)}\nURL sugerida: ${productUrl(p)}\nTipo: ${tipo}\n\nResponde SOLO con JSON válido:\n{"titulo":"máximo 38 caracteres","mensaje":"máximo 95 caracteres","url":"${productUrl(p)}"}\n\nNo uses comillas fuera del JSON.`;
    try{
      const text=await deepseek(prompt,350);
      const m=text.match(/\{[\s\S]*\}/); if(!m) throw new Error('La IA no devolvió JSON');
      const j=JSON.parse(m[0]);
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
    out.textContent='⏳ Generando respuesta con DeepSeek...';
    const prompt=`Genera una respuesta de WhatsApp para un cliente.\n\nProducto:\n${prodInfo(p)}\n\nPregunta del cliente:\n${q}\n\nTono: ${tono}.\n\nReglas: respuesta breve, natural, con cierre para reservar/comprar. No inventes garantía/envío. Si falta un dato, pide confirmarlo.`;
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekAuditCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekAuditCards';
    div.innerHTML=`
      <div class="tm-tier"><h4>DEEPSEEK — OPTIMIZACIÓN</h4><span class="tm-tier-badge gold">Auditoría</span></div>
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
    panel('📊 Resumen inteligente de ventas y analytics','DeepSeek analiza datos locales/Firebase y propone acciones concretas.',`
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
    out.textContent='⏳ Auditando con DeepSeek...';
    const prompt=`Audita este producto antes de publicarlo.\n\n${prodInfo(p)}\n\nEntrega en secciones:\n1) Estado general: Bueno/Regular/Crítico.\n2) Problemas o riesgos detectados.\n3) Datos que faltan.\n4) Descripción mejorada sugerida.\n5) Categoría/subcategoría sugerida si ves inconsistencia.\n6) Acción recomendada hoy: publicar, corregir, reponer o archivar.\n\nSé directo y práctico.`;
    try{ out.textContent=await deepseek(prompt,1000); notify('✅ Auditoría generada','success'); }
    catch(e){ out.textContent=localAudit(p)+'\n\n⚠️ '+e.message; notify('Auditoría local: configura DeepSeek para análisis avanzado','warning'); }
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
    out.textContent='⏳ Leyendo datos y consultando DeepSeek...';
    const fb=await collectAnalytics(); const payload=buildSummaryPayload(fb);
    const prompt=pushOnly?
      `Con estos datos de TiendaMax, propone UNA campaña push para hoy.\n\n${JSON.stringify(payload,null,2)}\n\nEntrega SOLO:\nTítulo:\nMensaje:\nProducto recomendado:\nMotivo:`:
      `Analiza estos datos de TiendaMax y genera un resumen ejecutivo.\n\n${JSON.stringify(payload,null,2)}\n\nEntrega:\n1) Resumen de situación.\n2) 5 acciones recomendadas para hoy.\n3) Productos que conviene publicar.\n4) Productos a reponer/archivar.\n5) Ideas de oferta o push.\n6) Riesgos detectados.\nSé concreto.`;
    try{ out.textContent=await deepseek(prompt,1200); notify('✅ Resumen IA generado','success'); }
    catch(e){
      out.textContent=`Resumen local\n\nProductos: ${payload.totalProductos}\nVentas registradas: ${payload.ventasCount}\nTotal vendido: $${payload.totalVentas.toFixed(2)}\nSuscriptores: ${payload.suscriptores}\n\nStock bajo:\n${payload.stockBajo.map(x=>'• '+x).join('\n')||'• Sin alertas'}\n\nAgotados:\n${payload.agotados.map(x=>'• '+x).join('\n')||'• Sin agotados'}\n\nRecomendación: publica productos con buen stock, repón agotados y usa push para productos con visitas/WhatsApp.\n\n⚠️ ${e.message}`;
      notify('Resumen local: configura DeepSeek para recomendaciones avanzadas','warning');
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
  function saveProducts(ps){ localStorage.setItem('productos',JSON.stringify(ps)); if(Array.isArray(window.productos)) window.productos=ps; if(typeof guardarProductos==='function') guardarProductos(); }
  function productOptions(){return products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||p.name||'Producto')} — ${esc(p.categoria||'General')}</option>`).join('') || '<option value="">Sin productos</option>';}
  function bySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function slugify(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70); }
  function prodInfo(p){return `Nombre: ${p.nombre||p.name||''}\nDescripción: ${p.descripcion||''}\nCategoría: ${p.categoria||'General'}\nSubcategoría: ${p.subcategoria||''}\nPrecio: $${Number(p.precioActual||p.price||0).toFixed(2)} USD\nStock: ${Number(p.stock||0)}\nGarantía: ${p.garantia||'no indicada'}`;}
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekSeoCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekSeoCards';
    div.innerHTML=`<div class="tm-tier"><h4>DEEPSEEK — SEO Y COMPARTIR</h4><span class="tm-tier-badge">Visibilidad</span></div>
    <div class="tm-tools-grid">
      <div class="tm-tool-card enabled" data-tool="seoai"><span class="state">IA</span><div class="ico" style="background:rgba(46,204,113,.18)">🔎</div><h5>SEO automático</h5><p>Genera meta title, description, keywords, slug y texto para compartir.</p></div>
    </div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openSEO(){
    panel('🔎 SEO automático con DeepSeek','Genera y guarda metadatos para mejorar cómo se comparte cada producto.',`
      <div class="tm-field"><label>Producto</label><select id="tmSeoProd">${productOptions()}</select></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds4-act="seoGen">Generar SEO</button><button class="tm-btn gold" data-ds4-act="seoApply">Guardar en producto</button><button class="tm-btn" data-ds4-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Genera SEO para ver el resultado. Se guardará dentro del producto como campos seoTitle, seoDescription, seoKeywords, slug y shareText.</div>`);
  }
  function localSEO(p){
    const name=p.nombre||'Producto TiendaMax'; const cat=p.categoria||'General'; const price=Number(p.precioActual||0);
    return {seoTitle:`${name} en TiendaMax`,seoDescription:`Compra ${name} en TiendaMax. ${cat}${price?' desde $'+price.toFixed(2)+' USD':''}. Consulta disponibilidad y reserva por WhatsApp.`,seoKeywords:[name,cat,'TiendaMax','Cuba','comprar online'].filter(Boolean),slug:slugify(name),shareText:`🔥 ${name}\n${price?'💵 $'+price.toFixed(2)+' USD\n':''}Disponible en TiendaMax. Escríbenos para reservar.`};
  }
  async function genSEO(){
    const out=$('#tmToolOut'); if(!out) return; const p=bySelect('tmSeoProd'); out.textContent='⏳ Generando SEO con DeepSeek...';
    const prompt=`Genera SEO para este producto.\n\n${prodInfo(p)}\n\nResponde SOLO JSON válido con esta forma exacta:\n{"seoTitle":"máximo 60 caracteres","seoDescription":"máximo 155 caracteres","seoKeywords":["5 a 8 keywords"],"slug":"url-amigable-sin-acentos","shareText":"texto corto para compartir por WhatsApp/Facebook"}\n\nNo inventes especificaciones.`;
    try{
      const text=await deepseek(prompt); const m=text.match(/\{[\s\S]*\}/); if(!m) throw new Error('La IA no devolvió JSON');
      const j=JSON.parse(m[0]); j.slug=slugify(j.slug||p.nombre); if(!Array.isArray(j.seoKeywords)) j.seoKeywords=String(j.seoKeywords||'').split(',').map(x=>x.trim()).filter(Boolean);
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
  function saveProducts(ps){ localStorage.setItem('productos',JSON.stringify(ps)); if(Array.isArray(window.productos)) window.productos=ps; if(typeof guardarProductos==='function') guardarProductos(); }
  function productOptions(){return products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||p.name||'Producto')} — ${esc(p.categoria||'General')} — $${Number(p.precioActual||0).toFixed(2)}</option>`).join('') || '<option value="">Sin productos</option>';}
  function bySelect(id){ const val=$('#'+id)?.value; return products().find(p=>String(p.id)===String(val)) || products()[0] || {}; }
  function info(p){return `ID: ${p.id}\nNombre: ${p.nombre||''}\nDescripción: ${p.descripcion||''}\nCategoría: ${p.categoria||'General'}\nSubcategoría: ${p.subcategoria||''}\nPrecio: $${Number(p.precioActual||0).toFixed(2)} USD\nStock: ${Number(p.stock||0)}`;}
  async function deepseek(prompt){
    return tmAIChat(prompt, { max_tokens: (typeof max_tokens !== 'undefined' ? max_tokens : 900) });
  }
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekRecCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekRecCards';
    div.innerHTML=`<div class="tm-tier"><h4>DEEPSEEK — VENTAS CRUZADAS</h4><span class="tm-tier-badge purple">Upsell</span></div>
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
    const out=$('#tmToolOut'); if(!out)return; const target=bySelect('tmRecProd'); out.textContent='⏳ Generando recomendaciones con DeepSeek...';
    const candidates=products().filter(p=>p.id!==target.id&&Number(p.stock||0)>0).slice(0,60).map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria,precio:p.precioActual,stock:p.stock,descripcion:String(p.descripcion||'').slice(0,140)}));
    const prompt=`Producto principal:\n${info(target)}\n\nCandidatos disponibles en JSON:\n${JSON.stringify(candidates,null,2)}\n\nElige hasta 4 productos complementarios reales. Responde SOLO JSON válido:\n{"recomendados":[ids reales],"bundleText":"frase corta para sección relacionados","upsellText":"frase corta visible en detalle","whatsappUpsell":"mensaje breve para ofrecer productos relacionados por WhatsApp"}\n\nReglas: usa solo IDs de candidatos, prioriza utilidad complementaria y stock disponible. No recomiendes el mismo producto.`;
    try{
      const text=await deepseek(prompt); const m=text.match(/\{[\s\S]*\}/); if(!m) throw new Error('La IA no devolvió JSON');
      const j=JSON.parse(m[0]);
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
  function saveProducts(ps){ localStorage.setItem('productos',JSON.stringify(ps)); if(Array.isArray(window.productos)) window.productos=ps; if(typeof guardarProductos==='function') guardarProductos(); }
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekBulkCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekBulkCards';
    div.innerHTML=`<div class="tm-tier"><h4>DEEPSEEK — AUTOMATIZACIÓN MASIVA</h4><span class="tm-tier-badge gold">Batch</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="bulkai"><span class="state">IA</span><div class="ico" style="background:rgba(155,89,182,.18)">⚙️</div><h5>IA masiva</h5><p>Aplica SEO, auditoría o recomendaciones a varios productos en lote controlado.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openBulk(){
    panel('⚙️ IA masiva por lotes','Procesa pocos productos por tanda para controlar costo y revisar resultados.',`
      <div class="tm-form-grid">
        <div class="tm-field"><label>Tarea</label><select id="tmBulkTask"><option value="seo_missing">SEO a productos sin SEO</option><option value="seo_all">Regenerar SEO</option><option value="recs_missing">Recomendaciones sin configurar</option><option value="audit_report">Reporte de auditoría</option></select></div>
        <div class="tm-field"><label>Categoría</label><select id="tmBulkCat">${catOptions()}</select></div>
        <div class="tm-field"><label>Límite por tanda</label><input id="tmBulkLimit" type="number" min="1" max="20" value="5"></div>
        <div class="tm-field"><label>Modo</label><select id="tmBulkMode"><option value="deepseek">DeepSeek si está configurado</option><option value="local">Solo local / sin API</option></select></div>
      </div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds6-act="bulkPreview">Vista previa</button><button class="tm-btn gold" data-ds6-act="bulkRun">Ejecutar lote</button><button class="tm-btn" data-ds6-act="copyOut">Copiar log</button></div>
      <div class="tm-note">Consejo: empieza con límite 5. Después revisa y pulsa “Actualizar tienda”.</div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Elige tarea y pulsa Vista previa.</div>`);
  }
  function selectTargets(){
    const ps=products(); const task=$('#tmBulkTask')?.value||'seo_missing'; const cat=$('#tmBulkCat')?.value||''; const limit=Math.max(1,Math.min(20,Number($('#tmBulkLimit')?.value)||5));
    let arr=ps.filter(p=>!cat || (p.categoria||'General')===cat);
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
    const prompt=`Genera SEO para este producto.\n\n${prodInfo(p)}\n\nResponde SOLO JSON válido:\n{"seoTitle":"máximo 60 caracteres","seoDescription":"máximo 155 caracteres","seoKeywords":["5 a 8 keywords"],"slug":"url-amigable-sin-acentos","shareText":"texto corto para compartir"}`;
    const text=await deepseek(prompt,550); const m=text.match(/\{[\s\S]*\}/); if(!m) throw new Error('JSON SEO no encontrado');
    const j=JSON.parse(m[0]); j.slug=slugify(j.slug||p.nombre); if(!Array.isArray(j.seoKeywords)) j.seoKeywords=String(j.seoKeywords||'').split(',').map(x=>x.trim()).filter(Boolean); return j;
  }
  async function genRecs(p,ps,useAI){
    if(!useAI) return localRecs(p,ps);
    const candidates=ps.filter(x=>x.id!==p.id&&Number(x.stock||0)>0).slice(0,50).map(x=>({id:x.id,nombre:x.nombre,categoria:x.categoria,precio:x.precioActual,stock:x.stock,descripcion:String(x.descripcion||'').slice(0,100)}));
    const prompt=`Producto principal:\n${prodInfo(p)}\n\nCandidatos:\n${JSON.stringify(candidates)}\n\nElige hasta 4 complementarios. Responde SOLO JSON:\n{"recomendados":[ids reales],"bundleText":"frase corta","upsellText":"frase corta","whatsappUpsell":"mensaje breve"}`;
    const text=await deepseek(prompt,700); const m=text.match(/\{[\s\S]*\}/); if(!m) throw new Error('JSON recomendaciones no encontrado');
    const j=JSON.parse(m[0]); const valid=new Set(candidates.map(c=>String(c.id))); j.recomendados=(j.recomendados||[]).map(String).filter(id=>valid.has(id)).slice(0,4).map(id=>isNaN(Number(id))?id:Number(id)); return j;
  }
  function auditLine(p){const issues=[]; if(!(p.nombre||'').trim()||(p.nombre||'').length<8)issues.push('nombre flojo'); if(!(p.descripcion||'').trim()||(p.descripcion||'').length<80)issues.push('descripción corta'); if(!p.imagen)issues.push('sin imagen'); if(!Number(p.precioActual||0))issues.push('sin precio'); if(Number(p.stock||0)<=0)issues.push('sin stock'); if(!p.garantia)issues.push('sin garantía indicada'); return `${p.nombre}: ${issues.length?issues.join(', '):'OK'}`;}
  async function run(){
    const out=$('#tmToolOut'); if(!out)return; const task=$('#tmBulkTask')?.value||'seo_missing'; const mode=$('#tmBulkMode')?.value||'deepseek'; const useAI=mode==='deepseek';
    const targets=selectTargets(); if(!targets.length){out.textContent='No hay productos para procesar.'; return;}
    let ps=products(); const log=[]; out.textContent='⏳ Iniciando lote...';
    if(task==='audit_report'){
      out.textContent='REPORTE DE AUDITORÍA\n\n'+targets.map(auditLine).join('\n'); notify('Reporte generado','success'); return;
    }
    for(let i=0;i<targets.length;i++){
      const p=targets[i]; const idx=ps.findIndex(x=>String(x.id)===String(p.id)); if(idx<0) continue;
      out.textContent=`⏳ Procesando ${i+1}/${targets.length}: ${p.nombre}\n\n`+log.join('\n');
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
        log.push(`⚠️ ${p.nombre}: ${e.message} — usando local`);
        if(task==='seo_missing'||task==='seo_all'){const seo=localSEO(ps[idx]); ps[idx]={...ps[idx],...seo};}
        if(task==='recs_missing'){const r=localRecs(ps[idx],ps); ps[idx]={...ps[idx],...r};}
      }
    }
    saveProducts(ps); out.textContent=`✅ Lote terminado. Productos procesados: ${targets.length}\n\n${log.join('\n')}\n\nAhora pulsa “Actualizar tienda” para subir productos.json.`; notify('✅ Lote IA terminado','success');
  }
  document.addEventListener('click',function(e){
    const tool=e.target.closest('[data-tool="bulkai"]'); if(tool){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();openBulk();return;}
    const a=e.target.closest('[data-ds6-act]'); if(!a)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    const act=a.dataset.ds6Act; if(act==='bulkPreview') preview(); if(act==='bulkRun') run(); if(act==='copyOut'){navigator.clipboard?.writeText($('#tmToolOut')?.textContent||'');notify('Copiado','success');}
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekChatCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekChatCards';
    div.innerHTML=`<div class="tm-tier"><h4>DEEPSEEK — COPILOTO ADMIN</h4><span class="tm-tier-badge purple">Chat</span></div>
    <div class="tm-tools-grid"><div class="tm-tool-card enabled" data-tool="chatai"><span class="state">IA</span><div class="ico" style="background:rgba(79,195,247,.18)">🧠</div><h5>Chat IA del admin</h5><p>Pregunta qué publicar, qué reponer, ofertas, campañas y mejoras.</p></div></div>`;
    const panelEl=$('#tmToolPanel'); if(panelEl) wrap.insertBefore(div,panelEl); else wrap.appendChild(div);
  }
  function openChat(){
    const suggestions=['¿Qué producto publico hoy?','Dame 3 ideas de oferta con stock disponible','¿Qué productos debo reponer o archivar?','Hazme una campaña para WhatsApp de los productos más fuertes','¿Qué categoría parece más interesante?'];
    panel('🧠 Chat IA del admin','Haz preguntas sobre productos, ventas, stock, analytics y campañas.',`
      <div class="tm-note">El chat usa un resumen de productos, ventas y analytics. No envía imágenes ni claves; solo datos comerciales resumidos.</div>
      <div class="tm-chipwrap" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">${suggestions.map(q=>`<button type="button" class="tm-btn tm-mini" data-ds7-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="tm-field"><label>Pregunta</label><textarea id="tmChatQuestion" style="min-height:95px" placeholder="Ej: qué publico hoy, qué oferta hago, qué producto está flojo..."></textarea></div>
      <div class="tm-actions"><button class="tm-btn primary" data-ds7-act="ask">Preguntar a DeepSeek</button><button class="tm-btn gold" data-ds7-act="brief">Resumen rápido</button><button class="tm-btn" data-ds7-act="copyOut">Copiar</button></div>
      <div id="tmToolOut" class="tm-code" style="margin-top:12px">Escribe una pregunta o toca una sugerencia.</div>`);
  }
  function localAnswer(q,s){
    const bajos=(s.bajos||[]).map(x=>`• ${x.nombre} (${x.stock})`).join('\n')||'• Sin stock bajo crítico';
    const agot=(s.agotados||[]).slice(0,5).map(x=>`• ${x.nombre}`).join('\n')||'• Sin agotados destacados';
    const top=(s.topStock||[]).slice(0,5).map(x=>`• ${x.nombre} — stock ${x.stock} — ${money(x.precio)}`).join('\n')||'• Sin productos';
    return `Resumen local TiendaMax\n\nProductos: ${s.productos}\nVentas registradas: ${s.ventas}\nTotal vendido: ${money(s.totalVendido)}\nSuscriptores: ${s.suscriptores}\n\nPara publicar hoy, prioriza productos con buen stock:\n${top}\n\nStock bajo:\n${bajos}\n\nAgotados a revisar:\n${agot}\n\nPregunta: ${q}\n\nRecomendación: crea una publicación corta con precio, stock y llamada a WhatsApp. Si tienes DeepSeek configurado, el chat dará una estrategia más completa.`;
  }
  async function ask(questionOverride){
    const out=$('#tmToolOut'); if(!out)return;
    const q=(questionOverride||$('#tmChatQuestion')?.value||'Dame un resumen rápido y acciones para hoy').trim();
    if(!q){notify('Escribe una pregunta','warning');return;}
    if($('#tmChatQuestion')) $('#tmChatQuestion').value=q;
    out.textContent='⏳ Analizando tienda y preguntando a DeepSeek...';
    const ps=products(), vs=ventas(), an=await analytics(), s=summarize(ps,vs,an);
    const prompt=`Pregunta del admin:\n${q}\n\nDatos resumidos de TiendaMax:\n${JSON.stringify(s,null,2)}\n\nResponde en español, con bullets y acciones concretas. Si recomiendas publicar, incluye texto breve de campaña o idea de push. Si recomiendas reponer, di cuáles. No inventes datos fuera del resumen.`;
    try{ out.textContent=await deepseek(prompt); notify('✅ Respuesta IA lista','success'); }
    catch(e){ out.textContent=localAnswer(q,s)+'\n\n⚠️ '+e.message; notify('Respuesta local: configura DeepSeek para chat avanzado','warning'); }
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekCampaignCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekCampaignCards';
    div.innerHTML=`<div class="tm-tier"><h4>DEEPSEEK — CAMPAÑAS</h4><span class="tm-tier-badge gold">Marketing</span></div>
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
  function saveProducts(ps){ localStorage.setItem('productos',JSON.stringify(ps)); if(Array.isArray(window.productos)) window.productos=ps; if(typeof guardarProductos==='function') guardarProductos(); }
  function list(){ try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]} }
  function setList(v){ localStorage.setItem(KEY,JSON.stringify(v.slice(0,100))); }
  function productOptions(){return '<option value="">Sin producto específico</option>'+products().map(p=>`<option value="${esc(p.id)}">${esc(p.nombre||'Producto')} — ${esc(p.categoria||'General')}</option>`).join('');}
  function byId(id){return products().find(p=>String(p.id)===String(id))||null;}
  function productUrl(p){return p&&p.id?`/p/producto-${p.id}.html`:'/';}
  function panel(title,sub,body){const p=$('#tmToolPanel'); if(!p)return; p.className='tm-panel active'; p.innerHTML=`<div class="tm-panel-head"><div><h4>${title}</h4><p>${sub}</p></div><button class="tm-panel-close" data-act="closePanel">✕ Cerrar</button></div>${body}`; p.scrollIntoView({behavior:'smooth',block:'start'});}
  function addCards(){
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekPublisherCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekPublisherCards';
    div.innerHTML=`<div class="tm-tier"><h4>DEEPSEEK — EJECUCIÓN</h4><span class="tm-tier-badge gold">Publicar</span></div>
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekCampaignDashCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekCampaignDashCards';
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
    const wrap=$('#herramientas .tm-tools-wrap'); if(!wrap || $('#tmDeepSeekPlannerCards')) return;
    const div=document.createElement('div'); div.id='tmDeepSeekPlannerCards';
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
        ${stepLine(st.campaign,'3. Generar campaña recomendada','DeepSeek si está configurado; fallback local si no.')}
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
    // DeepSeek / herramientas
    const key=localStorage.getItem('anthropicApiKey'); add(res,key?'pass':'warn','DeepSeek/API key',key?'Key guardada ('+key.slice(0,6)+'…)':'No configurada');
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
    keyInput.placeholder='sk-or-... (OpenRouter) / sk-... (DeepSeek) / AIza... / gsk_...';
    const wrap=document.createElement('div');
    wrap.className='tm-openrouter-config';
    wrap.innerHTML='<label style="display:block;margin-top:10px">Modelo OpenRouter gratuito/preferido<input id="tmOpenRouterModel" type="text" placeholder="deepseek/deepseek-chat-v3-0324:free" style="font-family:monospace;font-size:12px"></label><p style="font-size:11px;color:#888;margin-top:4px">Ejemplos: deepseek/deepseek-chat-v3-0324:free, deepseek/deepseek-r1-0528:free, qwen/qwen3-235b-a22b:free. Depende de disponibilidad de OpenRouter.</p>';
    keyInput.closest('label')?.insertAdjacentElement('afterend',wrap);
    const inp=document.getElementById('tmOpenRouterModel'); if(inp){inp.value=localStorage.getItem('tmOpenRouterModel')||'deepseek/deepseek-chat-v3-0324:free'; inp.addEventListener('input',()=>localStorage.setItem('tmOpenRouterModel',inp.value.trim()||'deepseek/deepseek-chat-v3-0324:free'));}
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(addOpenRouterConfig,1200));
  document.addEventListener('click',e=>{if(e.target.closest('[data-arg="configuracion"],[data-tab="configuracion"]')) setTimeout(addOpenRouterConfig,300);});
})();

