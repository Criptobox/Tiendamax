// TiendaMax Admin Copiloto — móvil + alertas inteligentes
// Integra una burbuja dentro del admin existente; no crea páginas nuevas.
(function(){
'use strict';
if (window.__tmAdminCopilotLoaded) return;
window.__tmAdminCopilotLoaded = true;

const LS = {
  opened: 'tm_copilot_opened_day',
  snooze: 'tm_copilot_snooze_until',
  notify: 'tm_copilot_last_notify',
  dismissed: 'tm_copilot_dismissed_tasks',
  memory: 'tm_copilot_memory_v1',
  view: 'tm_copilot_view'
};
const DAY = new Date().toISOString().slice(0,10);
let state = { tasks: [], hot: [], agents: [], metrics: {}, view: localStorage.getItem(LS.view) || 'hoy', booted: false, loading: false, iaPreviewPid: null, iaPreviewData: null, iaPreviewCargando: false };
let refreshTimer = null;
const PROMO_BADGE_PRESETS = [
  ['🛡️','Seguro'],['🔒','Pago Seguro'],['🛵','Envío'],['📦','Incluye caja'],
  ['✅','Garantía'],['✅','Garantía 12m'],['💯','Original'],['⚡','Entrega rápida'],
  ['🎁','Oferta'],['🆕','Nuevo'],['♻️','Usado'],['📞','Soporte'],['🏆','Calidad'],['','Ninguno'],
];
let promoData = { imgUrl: '', nombre: '', categoria: '', descripcion: '', title1: '', title2: '', tag: '', tagline: '', precio: '', precioAnterior: '', moneda: 'USD', stock: '', masVendido: false, _drawTimer: null, _productoId: '' };

const $ = (s,r=document)=>r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const now = () => Date.now();

function notify(msg,type){
  if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion(msg,type||'info');
  else console.log('[Copiloto]', msg);
}
function products(){
  try { if (Array.isArray(window.productos)) return window.productos; } catch(e) {}
  try { return JSON.parse(localStorage.getItem('productos') || '[]'); } catch(e) { return []; }
}
async function fbBase(){
  try {
    if (typeof window._fbRtdbUrl === 'function') {
      const u = window._fbRtdbUrl(); if (u) return u.replace(/\/$/,'');
    }
  } catch(e) {}
  try {
    const raw = localStorage.getItem('firebaseConfig');
    if (raw) {
      const c = JSON.parse(raw);
      const u = c.databaseURL || (c.projectId ? 'https://' + c.projectId + '-default-rtdb.firebaseio.com' : '');
      if (u) return u.replace(/\/$/,'');
    }
  } catch(e) {}
  try {
    const r = await fetch('config.json?_=' + Date.now(), {cache:'no-store'});
    if (r.ok) {
      const j = await r.json();
      if (j.firebaseConfig) {
        localStorage.setItem('firebaseConfig', JSON.stringify(j.firebaseConfig));
        const c = j.firebaseConfig;
        return (c.databaseURL || ('https://' + c.projectId + '-default-rtdb.firebaseio.com')).replace(/\/$/,'');
      }
    }
  } catch(e) {}
  return '';
}
async function getJson(path){
  const base = await fbBase(); if (!base) return null;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  try { const r = await fetch(base + path + (path.includes('?') ? '&' : '?') + '_=' + Date.now(), {cache:'no-store', signal: ctrl.signal}); return r.ok ? await r.json() : null; } catch(e) { return null; } finally { clearTimeout(tid); }
}
function ago(ts){
  const d = Date.now() - num(ts), m = Math.floor(d/60000), h = Math.floor(d/3600000);
  if (d < 120000) return 'ahora'; if (m < 60) return m + 'min'; if (h < 24) return h + 'h'; return Math.floor(h/24) + 'd';
}
function iconFor(p){
  const c = String(p && p.categoria || '').toUpperCase();
  if (c.includes('WIFI')) return '📶'; if (c.includes('ENERG')) return '🔋'; if (c.includes('SEGUR')) return '📹';
  if (c.includes('CARRO')) return '🚗'; if (c.includes('MOTO')) return '🏍️'; if (c.includes('CEL')) return '📱';
  if (c.includes('HOGAR')) return '🏠'; return '📦';
}
function dismissedSet(){ try { return new Set(JSON.parse(localStorage.getItem(LS.dismissed)||'[]')); } catch(e) { return new Set(); } }
function saveDismissed(set){ localStorage.setItem(LS.dismissed, JSON.stringify(Array.from(set).slice(-200))); }
// Sin el título: varias tareas incluyen una cantidad dinámica en el título
// ("5 productos sin SEO"), y si el título formara parte del id, un cambio
// en la cantidad generaría un id nuevo — la tarea "descartada" reaparecería
// aunque siga siendo, en esencia, la misma alerta.
function taskId(t){ return [t.kind,t.pid||''].join('|'); }
function addTask(list,t){
  const dis = dismissedSet();
  const id = taskId(t);
  if (dis.has(id)) return;
  list.push({...t, id});
}

function agentForKind(kind){
  if (['stockout','lowstock','avisos'].includes(kind)) return 'stock';
  if (['interesados'].includes(kind)) return 'crm';
  if (['hot','offer'].includes(kind)) return 'marketing';
  if (['seo','ai'].includes(kind)) return 'seo';
  if (['publish'].includes(kind)) return 'system';
  return 'system';
}
function buildAgentsFromTasks(tasks, facts){
  const defs = [
    {id:'stock', icon:'📦', name:'Agente Inventario', goal:'Stock, agotados y reposición'},
    {id:'crm', icon:'👥', name:'Agente CRM', goal:'Interesados y clientes calientes'},
    {id:'marketing', icon:'📣', name:'Agente Marketing', goal:'Campañas, ofertas y productos calientes'},
    {id:'seo', icon:'🔎', name:'Agente SEO/IA', goal:'Textos, SEO y recomendaciones'},
    {id:'system', icon:'⚙️', name:'Agente Sistema', goal:'Publicación, sync y salud del admin'}
  ];
  return defs.map(a=>{
    const mine = tasks.filter(t=>agentForKind(t.kind)===a.id);
    const critical = mine.filter(t=>t.urgency>=3).length;
    let status = 'OK', hint = 'Sin bloqueos importantes';
    if (critical) { status = 'CRÍTICO'; hint = mine[0]?.title || 'Requiere atención'; }
    else if (mine.length) { status = 'ACTIVO'; hint = mine[0]?.title || 'Hay mejoras sugeridas'; }
    if (a.id === 'crm' && facts && facts.interesados && facts.interesados.length) hint = facts.interesados.length + ' interesado(s) detectados';
    return {...a, count: mine.length, critical, status, hint};
  });
}

function memory(){
  try { return JSON.parse(localStorage.getItem(LS.memory) || '{}') || {}; } catch(e) { return {}; }
}
function saveMemory(m){ localStorage.setItem(LS.memory, JSON.stringify(m)); }
function remember(type, data={}){
  const m = memory();
  m.actions = Array.isArray(m.actions) ? m.actions : [];
  m.products = m.products || {};
  m.counts = m.counts || {};
  m.counts[type] = (m.counts[type] || 0) + 1;
  if (data.productName) m.products[data.productName] = (m.products[data.productName] || 0) + 1;
  m.last = {type, ts: Date.now(), ...data};
  m.actions.unshift({type, ts: Date.now(), ...data});
  m.actions = m.actions.slice(0, 80);
  saveMemory(m);
  return m;
}
// APRENDIZAJE — el agente aprende de lo que vende.
// Cuando entra una venta, si ese producto tuvo un empujón reciente (push/oferta),
// lo cuenta como "lo que funcionó" para priorizar repetir lo que vende.
window.tmCopilotOnVenta = function(items){
  try{
    if(!Array.isArray(items) || !items.length) return;
    const m = memory();
    m.wins = Array.isArray(m.wins) ? m.wins : [];
    m.winCount = m.winCount || {};
    const acts = Array.isArray(m.actions) ? m.actions : [];
    const promo = new Set(['smart_push','pushHot','offer','promo_download','campaign_draft','post_ready']);
    const hace7 = Date.now() - 7*864e5;
    items.forEach(it=>{
      const pid = String(it.productoId || it.id || '');
      const nombre = it.producto || it.nombre || '';
      const emp = acts.find(a=> a.ts>hace7 && promo.has(a.type) && (
        (a.pid && String(a.pid)===pid) || (a.productName && nombre && String(a.productName).toLowerCase()===String(nombre).toLowerCase())
      ));
      if(emp){
        m.wins.unshift({ pid, nombre, tipo: emp.type, desc: emp.desc||0, ts: Date.now() });
        const k = nombre || pid;
        m.winCount[k] = (m.winCount[k]||0)+1;
      }
    });
    m.wins = m.wins.slice(0,60);
    saveMemory(m);
    if($('#tmCopilotSheet') && $('#tmCopilotSheet').classList.contains('show') && state.view==='memoria') renderSheet();
  }catch(e){}
};
// Etiqueta legible del tipo de empujón
function _empLabel(t){ return t==='smart_push'||t==='pushHot' ? 'push' : t==='offer' ? 'oferta' : t==='campaign_draft' ? 'campaña' : t==='promo_download' ? 'promo compartida' : t==='post_ready' ? 'publicación' : t; }
function money(v){ return '$' + Number(v||0).toLocaleString('es-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ranking(){
  const ps = products();
  const hot = (state.hot || []).map(x=>({p:x.p, score:x.score, views:x.views, wa:x.wa}));
  const byScore = hot.length ? hot : ps.map(p=>({p, score:num(p.stock)>0 ? num(p.stock) : 0, views:0, wa:0}));
  const top = byScore.filter(x=>num(x.p.stock)>0).sort((a,b)=>b.score-a.score).slice(0,4);
  const attention = ps.map(p=>{
    let reasons=[];
    if(num(p.stock)===0) reasons.push('agotado');
    else if(num(p.stock)<=2) reasons.push('stock bajo');
    if(!p.seoTitle && !p.seoDescription) reasons.push('sin SEO');
    if(!p.descripcion || String(p.descripcion).length<35) reasons.push('desc. débil');
    return {p, reasons, score: reasons.length};
  }).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,4);
  return {top, attention};
}
function suggestedBundles(){
  const ps = products().filter(p=>p.activo!==false && num(p.stock)>0);
  const cats = {};
  ps.forEach(p=>{ const c=(p.categoria||'General').toUpperCase(); (cats[c]=cats[c]||[]).push(p); });
  const out=[];
  function add(a,b,why){ if(a&&b&&String(a.id)!==String(b.id)) out.push({a,b,why,total:num(a.precioActual)+num(b.precioActual)}); }
  Object.keys(cats).forEach(c=>{
    const arr=cats[c].sort((a,b)=>num(b.stock)-num(a.stock));
    if(arr.length>=2) add(arr[0],arr[1], c.includes('WIFI')?'Combo para mejorar señal y cobertura':c.includes('ENERG')?'Combo para apagones/respaldo':'Combo por categoría con buen stock');
  });
  if(out.length<3 && ps.length>=2) add(ps[0], ps[1], 'Combo rápido con productos disponibles');
  return out.slice(0,4);
}
function responseTemplates(){
  const hot = (state.hot||[]).find(x=>num(x.p.stock)>0);
  const p = hot ? hot.p : products().find(x=>num(x.stock)>0) || products()[0] || {nombre:'este producto'};
  const name = p.nombre || 'este producto';
  return [
    `Hola 👋 Sí, tengo ${name} disponible. ¿En qué zona estás para coordinar entrega?`,
    `Te puedo pasar fotos, precio y detalles de ${name}. Si te interesa, te lo reservo mientras coordinamos.`,
    `Ahora mismo ${name} está ${num(p.stock)>0?'disponible':'agotado'}. ${num(p.stock)>0?'¿Quieres que te prepare el pedido?':'Puedo avisarte cuando vuelva a entrar.'}`
  ];
}
function dailyStrategy(){
  const lines=[];
  const hot=(state.hot||[]).find(x=>num(x.p.stock)>0);
  const critical=(state.tasks||[]).filter(t=>t.urgency>=3);
  if(hot) lines.push(`Impulsa hoy: ${hot.p.nombre} (${hot.views} vistas / ${hot.wa} WhatsApp / stock ${num(hot.p.stock)}).`);
  if(critical.length) lines.push(`Resuelve primero: ${critical[0].title}.`);
  const bundles=suggestedBundles();
  if(bundles[0]) lines.push(`Oferta combo sugerida: ${bundles[0].a.nombre} + ${bundles[0].b.nombre}.`);
  const seo=(state.tasks||[]).find(t=>t.kind==='seo');
  if(seo) lines.push('Dedica 15 min a SEO/IA: mejora productos sin título o descripción.');
  if(!lines.length) lines.push('Sin urgencias: publica novedad, revisa favoritos y prepara una campaña suave.');
  return lines;
}
function copyText(text,label){
  navigator.clipboard?.writeText(text).then(()=>toast((label||'Texto')+' copiado')).catch(()=>toast('No se pudo copiar'));
}
function saveCampaignDraft(){
  const hot=(state.hot||[]).find(x=>num(x.p.stock)>0);
  const p=hot&&hot.p; if(!p){ toast('No hay producto caliente con stock'); return; }
  const arr=(()=>{try{return JSON.parse(localStorage.getItem('tm_campaigns_v1')||'[]')}catch(e){return[]}})();
  const text=`🔥 ${p.nombre}\n\nDisponible en TiendaMax. Precio: ${money(p.precioActual)} USD. Stock: ${num(p.stock)}.\n📲 Pide por WhatsApp en tiendamax.org`;
  arr.unshift({id:Date.now(),ts:new Date().toISOString(),title:'Copiloto: '+p.nombre,productId:p.id,productName:p.nombre,channels:['Telegram','WhatsApp','Push'],text,status:'borrador copiloto',followUpAt:new Date(Date.now()+24*3600000).toISOString()});
  localStorage.setItem('tm_campaigns_v1', JSON.stringify(arr.slice(0,80)));
  remember('campaign_draft',{productName:p.nombre});
  toast('Campaña guardada en borradores');
}

function injectStyles(){
  if ($('#tmCopilotStyles')) return;
  const st = document.createElement('style'); st.id = 'tmCopilotStyles';
  st.textContent = `
  html.tm-copilot-enabled #tmAgenda{display:none!important}html.tm-copilot-enabled #tmBtnPendientes{border-color:rgba(139,92,246,.45)!important;background:rgba(139,92,246,.14)!important;color:#d9c8ff!important}
  .tm-copilot-bubble{position:fixed;right:14px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:99998;width:62px;height:62px;border:0;border-radius:22px;background:linear-gradient(135deg,#8b5cf6,#ff6b35);color:#fff;font-size:27px;box-shadow:0 16px 42px rgba(139,92,246,.35),0 10px 32px rgba(255,107,53,.22);display:flex;align-items:center;justify-content:center;transition:transform .18s,opacity .18s}.tm-copilot-bubble:hover{transform:translateY(-2px)}.tm-copilot-bubble .n{position:absolute;right:-5px;top:-6px;min-width:23px;height:23px;padding:0 6px;border-radius:20px;background:#e74c3c;border:3px solid #121217;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center}.tm-copilot-bubble.clean .n{background:#25d366}.tm-copilot-pulse{animation:tmCopPulse 1.2s ease 2}@keyframes tmCopPulse{50%{transform:scale(1.08)}}
  .tm-copilot-sheet{position:fixed;left:50%;bottom:0;z-index:99999;width:min(560px,100%);max-height:88vh;transform:translateX(-50%) translateY(110%);transition:transform .28s cubic-bezier(.2,.9,.2,1);background:#14141b;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:26px 26px 0 0;box-shadow:0 -22px 70px rgba(0,0,0,.6);padding:10px 13px calc(14px + env(safe-area-inset-bottom));overflow:auto}.tm-copilot-sheet.show{transform:translateX(-50%) translateY(0)}.tm-copilot-handle{width:46px;height:5px;background:#3b3b46;border-radius:99px;margin:2px auto 12px}.tm-copilot-head{display:flex;gap:10px;align-items:center;margin-bottom:12px}.tm-copilot-face{width:46px;height:46px;border-radius:17px;background:linear-gradient(135deg,#8b5cf6,#ff6b35);display:flex;align-items:center;justify-content:center;font-size:24px;flex:0 0 auto}.tm-copilot-title{flex:1;min-width:0}.tm-copilot-title b{display:block;font-size:17px}.tm-copilot-title small{display:block;color:#aaa;font-size:12px;margin-top:2px}.tm-copilot-close{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#ddd;border-radius:12px;padding:8px 10px}
  .tm-copilot-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:8px 0 12px}.tm-copilot-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 8px}.tm-copilot-stat small{display:block;color:#888;font-size:10px}.tm-copilot-stat b{display:block;font-size:18px;margin-top:4px}.tm-copilot-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.tm-copilot-btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;border-radius:13px;padding:10px 9px;font-size:12px;font-weight:800;cursor:pointer;transition:transform .12s,filter .12s}.tm-copilot-btn:active{transform:scale(.95);filter:brightness(.88)}.tm-copilot-btn.primary{background:linear-gradient(135deg,#ff6b35,#df4a16);border-color:transparent}.tm-copilot-btn.green{background:rgba(37,211,102,.14);border-color:rgba(37,211,102,.35);color:#80f2aa}.tm-copilot-btn.blue{background:rgba(42,171,238,.13);border-color:rgba(42,171,238,.34);color:#78d3ff}.tm-copilot-btn.gold{background:rgba(216,180,106,.14);border-color:rgba(216,180,106,.34);color:#e7c97f}.tm-copilot-btn.danger{background:rgba(231,76,60,.13);border-color:rgba(231,76,60,.34);color:#ff8f83}.tm-copilot-tabs{display:flex;gap:7px;overflow:auto;margin:2px 0 10px;padding-bottom:3px}.tm-copilot-tab{white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#bbb;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900}.tm-copilot-tab.active{background:rgba(255,107,53,.16);border-color:rgba(255,107,53,.35);color:#ffae8a}.tm-copilot-smart{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:12px;margin:9px 0}.tm-copilot-smart h4{margin:0 0 8px;font-size:13px}.tm-copilot-smart ul{margin:0;padding-left:18px;color:#d8d8df;font-size:12px;line-height:1.55}.tm-copilot-mini{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tm-copilot-mini-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px}.tm-copilot-mini-card b{font-size:12px;display:block}.tm-copilot-mini-card small{font-size:10px;color:#aaa;display:block;margin-top:4px;line-height:1.35}.tm-copilot-code{background:#0f0f15;border:1px solid rgba(255,255,255,.08);border-radius:13px;padding:10px;font-size:12px;line-height:1.45;color:#ddd;margin-top:8px;white-space:pre-wrap}.tm-copilot-rank-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.06);padding:8px 0}.tm-copilot-rank-row:last-child{border-bottom:0}.tm-copilot-rank-row span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.tm-copilot-rank-row em{font-style:normal;color:#ffae8a;font-size:10px;font-weight:900}@media(max-width:380px){.tm-copilot-mini{grid-template-columns:1fr}}
  .tm-copilot-task{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:11px;margin-bottom:9px;border-left:3px solid #ff6b35}.tm-copilot-task.u3{border-left-color:#e74c3c}.tm-copilot-task.u2{border-left-color:#ff6b35}.tm-copilot-task.u1{border-left-color:#2aabee}.tm-copilot-task-top{display:flex;gap:10px}.tm-copilot-ico{width:34px;height:34px;border-radius:13px;background:rgba(255,107,53,.13);display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}.tm-copilot-task-main{flex:1;min-width:0}.tm-copilot-task-main b{display:block;font-size:13px;line-height:1.25}.tm-copilot-task-main small{display:block;color:#aaa;font-size:11px;line-height:1.35;margin-top:4px}.tm-copilot-task-actions{display:flex;gap:7px;margin-top:10px}.tm-copilot-task-actions .tm-copilot-btn{padding:8px 9px;flex:1}.tm-copilot-agents{display:flex;gap:8px;overflow:auto;padding-bottom:4px;margin:8px 0 12px}.tm-copilot-agent{min-width:154px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px}.tm-copilot-agent.crit{border-color:rgba(231,76,60,.35);background:rgba(231,76,60,.08)}.tm-copilot-agent b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-copilot-agent small{display:block;color:#999;font-size:10px;margin-top:4px;line-height:1.25}.tm-copilot-agent .st{display:inline-flex;margin-top:7px;border-radius:99px;padding:3px 7px;font-size:9px;font-weight:900;background:rgba(37,211,102,.13);color:#75f0a1}.tm-copilot-agent.crit .st{background:rgba(231,76,60,.16);color:#ff9187}.tm-copilot-hot{display:flex;gap:9px;overflow:auto;padding-bottom:4px;margin:8px 0 12px}.tm-copilot-hot-card{min-width:172px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px}.tm-copilot-hot-card b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-copilot-hot-card small{display:block;color:#999;font-size:10px;margin-top:4px}.tm-copilot-empty{color:#aaa;text-align:center;padding:18px 8px;font-size:13px}.tm-copilot-chip{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(255,107,53,.14);color:#ffae8a;font-size:10px;font-weight:900;margin-top:6px}.tm-copilot-toast{position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(120%);z-index:100000;width:calc(min(560px,100%) - 28px);background:#1a1a22;border:1px solid rgba(37,211,102,.32);border-radius:17px;padding:12px;color:#effff3;box-shadow:0 16px 50px rgba(0,0,0,.45);transition:.22s ease;font-size:13px}.tm-copilot-toast.show{transform:translateX(-50%) translateY(0)}
  @media (min-width: 760px){.tm-copilot-bubble{bottom:24px;right:24px}.tm-copilot-sheet{right:22px;left:auto;bottom:18px;transform:translateY(110%);border-radius:26px;width:430px;max-height:82vh}.tm-copilot-sheet.show{transform:translateY(0)}.tm-copilot-summary{grid-template-columns:repeat(2,1fr)}}@media (max-width:380px){.tm-copilot-summary{grid-template-columns:repeat(2,1fr)}.tm-copilot-actions{grid-template-columns:1fr}.tm-copilot-task-actions{flex-direction:column}}
  body:not(.admin-mode) .tm-copilot-bubble, body:not(.admin-mode) .tm-copilot-sheet, body:not(.admin-mode) .tm-copilot-toast{display:none!important}.tm-copilot-toast:not(.show){opacity:0!important;pointer-events:none!important}
  /* La burbuja flotante (62px, ancla a bottom:76px+safe-area) tapaba el final
     de listas largas (ej. "Avísame cuando vuelva") — reservar espacio real
     al fondo del contenido para que nunca quede contenido debajo. */
  body.admin-mode .content{ padding-bottom:calc(150px + env(safe-area-inset-bottom)) !important; }
  .tm-promo-field{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;color:#fff;font-size:13px;width:100%;box-sizing:border-box;font-family:inherit;outline:none}.tm-promo-field:focus{border-color:rgba(255,107,53,.55)}.tm-promo-field option{background:#1a1a2e;color:#fff}
  /* ── Cartel Pro (WhatsApp Estado) — preview escalado + tarjeta 760px ── */
  .tcp-preview-wrap{width:290px;height:435px;margin:0 auto;overflow:hidden;border-radius:10px;background:#000;box-shadow:0 8px 30px rgba(0,0,0,.5)}
  .tcp-preview-scale{width:760px;transform:scale(.3816);transform-origin:top left}
  .tcp-card{width:760px;height:1140px;position:relative;overflow:hidden;background:#000;color:#fff;border:2px solid #ff6b1a;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .tcp-bg{position:absolute;inset:0;background:linear-gradient(180deg,#0d0d12 0%,#1c0b04 45%,#260e06 72%,#0d0d12 100%)}
  .tcp-glow{position:absolute;left:50%;top:40%;width:640px;height:640px;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(255,107,26,.30) 0%,rgba(255,107,26,.08) 32%,transparent 62%)}
  .tcp-spark{position:absolute;width:4px;height:4px;border-radius:50%;background:#ff8c42;box-shadow:0 0 10px #ff8c42}
  .tcp-header{position:relative;z-index:3;display:flex;align-items:center;justify-content:center;gap:12px;padding:30px 20px 0}
  .tcp-logo-img{width:58px;height:58px;border-radius:13px;object-fit:cover;box-shadow:0 4px 14px rgba(255,107,26,.4)}
  .tcp-logo-txt{font-size:36px;font-weight:700;color:#fff;letter-spacing:-.5px}.tcp-logo-txt em{font-style:italic;color:#ff6b1a;font-weight:800}
  .tcp-tag{position:relative;z-index:3;margin:26px auto 0;width:fit-content;max-width:80%;background:rgba(255,107,26,.10);border:1.5px solid #ff6b1a;color:#ff8c42;font-size:16px;font-weight:700;letter-spacing:2px;padding:8px 22px;border-radius:24px;display:flex;align-items:center;gap:10px;white-space:nowrap}
  .tcp-tag::before{content:"⚡";font-size:18px}
  .tcp-title{position:relative;z-index:3;margin:22px 0 0 40px;max-width:62%}
  .tcp-t1{font-weight:900;line-height:.9;letter-spacing:-3px;color:#ededed;word-break:break-word}
  .tcp-t2{font-weight:900;line-height:.9;color:#ff6b1a;letter-spacing:-3px;text-shadow:0 0 40px rgba(255,107,26,.5);word-break:break-word}
  .tcp-tagline{position:relative;z-index:3;margin:16px 0 0 40px;max-width:300px;font-size:17px;color:#ccc;line-height:1.32}
  .tcp-hex{position:absolute;right:34px;top:132px;z-index:4;width:126px;height:146px;background:linear-gradient(180deg,#ff6b1a 0%,#8b3a0a 100%);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(255,107,26,.5)}
  .tcp-hex::before{content:"";position:absolute;inset:4px;background:#0d0906;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
  .tcp-hex-b{font-size:22px;margin-bottom:2px;position:relative;z-index:1}
  .tcp-hex-n{font-size:34px;font-weight:900;color:#fff;line-height:1;position:relative;z-index:1}
  .tcp-hex-l{font-size:9px;font-weight:700;color:#ff8c42;letter-spacing:1.5px;margin-top:4px;position:relative;z-index:1;text-align:center;line-height:1.2}
  .tcp-img{position:absolute;right:26px;top:322px;z-index:3;width:390px;height:390px;display:flex;align-items:center;justify-content:center}
  .tcp-img img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 24px 34px rgba(0,0,0,.72)) drop-shadow(0 0 26px rgba(255,107,26,.22));background:transparent}
  .tcp-feats{position:absolute;left:40px;top:470px;z-index:3;display:flex;flex-direction:column;gap:16px;width:210px}
  .tcp-feat{display:flex;align-items:flex-start;gap:12px}
  .tcp-feat-ic{width:42px;height:42px;flex-shrink:0;background:rgba(255,107,26,.10);border:1.5px solid #ff6b1a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px}
  .tcp-feat-t{font-size:12px;font-weight:800;color:#fff;letter-spacing:.5px;line-height:1.12}
  .tcp-feat-d{font-size:10px;color:#999;margin-top:2px;line-height:1.3}
  .tcp-trusts{position:absolute;right:40px;top:735px;z-index:3;display:flex;flex-direction:column;gap:16px;width:200px}
  .tcp-trust{display:flex;align-items:flex-start;gap:10px}
  .tcp-trust-ic{width:36px;height:36px;flex-shrink:0;background:rgba(255,107,26,.10);border:1.5px solid #ff6b1a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
  .tcp-trust-t{font-size:11px;font-weight:800;color:#fff;letter-spacing:.5px;line-height:1.1}
  .tcp-trust-d{font-size:9px;color:#999;margin-top:2px;line-height:1.3}
  .tcp-price{position:absolute;left:40px;right:280px;bottom:212px;z-index:3;background:linear-gradient(135deg,#3a1608,#1a0a05);border:2.5px solid #ff8c42;border-radius:14px;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 34px rgba(255,107,26,.45),inset 0 0 22px rgba(255,140,66,.10)}
  .tcp-price-m{display:flex;align-items:baseline;gap:6px}
  .tcp-price-n{font-size:66px;font-weight:900;line-height:1;color:#ff8c42;letter-spacing:-2px;text-shadow:0 0 24px rgba(255,107,26,.6)}
  .tcp-price-c{font-size:22px;font-weight:800;color:#ff8c42}
  .tcp-price-s{text-align:right;font-size:11px;color:#aaa;line-height:1.3}.tcp-price-s strong{color:#fff;display:block;font-size:14px}.tcp-price-s del{color:#888;font-size:13px}
  .tcp-stock{position:absolute;left:40px;right:280px;bottom:166px;z-index:3;display:flex;gap:12px}
  .tcp-pill{flex:1;background:rgba(255,255,255,.05);border:1px solid #333;border-radius:6px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#fff;font-weight:600;white-space:nowrap}.tcp-pill span{font-size:14px}
  .tcp-cta{position:absolute;left:40px;right:40px;bottom:78px;z-index:3;background:linear-gradient(135deg,#25d366 0%,#12a150 100%);border-radius:999px;padding:15px 26px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 8px 26px rgba(37,211,102,.45)}
  .tcp-cta-l{display:flex;align-items:center;gap:14px}
  .tcp-wa{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:24px}
  .tcp-cta-t{color:#fff;font-weight:800;font-size:14px;line-height:1.1;letter-spacing:.5px}.tcp-cta-t .s{display:block;font-size:11px;letter-spacing:2px;font-weight:700}.tcp-cta-t .b{display:block;font-size:22px;font-weight:900;letter-spacing:0;margin:2px 0}
  .tcp-arrow{color:#fff;font-size:28px;font-weight:900}
  .tcp-footer{position:absolute;bottom:30px;left:0;right:0;z-index:3;text-align:center}
  .tcp-dom{font-size:16px;font-weight:700;color:#ff6b1a}.tcp-hint{font-size:12px;color:#888;margin-top:4px}
  .tm-chat-log{max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:4px 2px}
  .tm-chat-u,.tm-chat-b{border-radius:14px;padding:9px 12px;font-size:13px;line-height:1.5;max-width:92%}
  .tm-chat-u{align-self:flex-end;background:rgba(255,107,53,.16);border:1px solid rgba(255,107,53,.3)}
  .tm-chat-b{align-self:flex-start;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
  .tm-chat-u b,.tm-chat-b b{display:block;font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
  .tm-chat-input{display:flex;gap:8px;margin-top:10px}
  .tm-chat-input input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:11px 12px;color:#fff;font-size:14px;outline:none}
  .tm-chat-input input:focus{border-color:rgba(255,107,53,.55)}
  .tmcp-chip{display:inline-flex;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#d8d8df;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;margin:2px}`;
  document.head.appendChild(st);
}

function ensureUI(){
  document.documentElement.classList.add('tm-copilot-enabled');
  try {
    if ((navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches) && window.innerWidth <= 1180) {
      document.documentElement.classList.add('tm-admin-touch');
    }
  } catch(e) {}
  injectStyles();
  if (!$('#tmCopilotBubble')) {
    const b = document.createElement('button');
    b.id = 'tmCopilotBubble'; b.type = 'button'; b.className = 'tm-copilot-bubble';
    b.innerHTML = '🤖<span class="n">0</span>'; b.title = 'Copiloto TiendaMax';
    b.addEventListener('click', openSheet);
    document.body.appendChild(b);
  }
  if (!$('#tmCopilotSheet')) {
    const s = document.createElement('div'); s.id = 'tmCopilotSheet'; s.className = 'tm-copilot-sheet';
    s.innerHTML = '<div class="tm-copilot-handle"></div><div id="tmCopilotBody"></div>';
    document.body.appendChild(s);
    document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSheet(); });
  }
  if (!$('#tmCopilotToast')) {
    const t = document.createElement('div'); t.id = 'tmCopilotToast'; t.className = 'tm-copilot-toast'; document.body.appendChild(t);
  }
}
function toast(t){
  if (!t || !String(t).trim()) return;
  if (!document.body.classList.contains('admin-mode') || !isAdminVisible()) return;
  const el=$('#tmCopilotToast'); if(!el) return;
  el.textContent='✅ '+String(t).trim();
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2800);
}
function openSheet(){ ensureUI(); renderSheet(); $('#tmCopilotSheet').classList.add('show'); localStorage.setItem(LS.opened, DAY); }
function closeSheet(){ const s=$('#tmCopilotSheet'); if(s) s.classList.remove('show'); }

async function collectFirebaseFacts(ps){
  const facts = { interesados: [], avisos: {}, avisosTotal: 0, vistas: {}, whats: {}, ventas: [], tokens: 0 };
  const [interesados, avisos, vistas, whats, ventas, tokens] = await Promise.all([
    getJson('/interesados.json'), getJson('/avisos_stock.json'), getJson('/analytics/vistas.json'), getJson('/analytics/whatsapp.json'), getJson('/ventas.json'), getJson('/tokens.json')
  ]);
  if (interesados && typeof interesados === 'object') {
    Object.keys(interesados).forEach(pid => {
      const entries = interesados[pid] || {};
      Object.keys(entries).forEach(k => { const e = entries[k] || {}; facts.interesados.push({...e, pid, ts: num(e.ts || k)}); });
    });
    facts.interesados.sort((a,b)=>num(b.ts)-num(a.ts));
  }
  if (avisos && typeof avisos === 'object') {
    facts.avisos = avisos;
    facts.avisosTotal = Object.values(avisos).reduce((s,v)=>s+(v && typeof v === 'object' ? Object.keys(v).length : 0),0);
  }
  function countMap(src){
    const out = {}; if (!src || typeof src !== 'object') return out;
    Object.keys(src).forEach(pid => { const v = src[pid]; out[pid] = num(v && typeof v === 'object' ? v.count : v); });
    return out;
  }
  facts.vistas = countMap(vistas); facts.whats = countMap(whats);
  if (ventas && typeof ventas === 'object') facts.ventas = Object.values(ventas).filter(Boolean);
  if (tokens && typeof tokens === 'object') facts.tokens = Object.values(tokens).filter(x=>x && x.token).length;
  return facts;
}

async function buildTasks(){
  if (state.loading) return state;
  state.loading = true;
  const ps = products();
  const tasks = [];
  let facts = {interesados:[],avisos:{},avisosTotal:0,vistas:{},whats:{},ventas:[],tokens:Number(localStorage.getItem('tm_subscriber_count')||0)};
  try { facts = await collectFirebaseFacts(ps); } catch(e) { console.warn('[copilot facts]', e); }
  const byId = Object.fromEntries(ps.map(p=>[String(p.id),p]));

  const mods = (()=>{try{return JSON.parse(localStorage.getItem('productosModificados')||'[]')}catch(e){return[]}})();
  if (mods.length) addTask(tasks,{kind:'publish',urgency:3,icon:'🔄',title:`${mods.length} cambio${mods.length!==1?'s':''} sin publicar`,detail:'Actualiza la tienda para que los clientes vean los cambios.',action:'Actualizar',tab:'publicar-ahora'});

  const agotados = ps.filter(p=>p.activo!==false && num(p.stock)===0);
  if (agotados.length) addTask(tasks,{kind:'stockout',urgency:3,icon:'🔴',title:`${agotados.length} producto${agotados.length>1?'s':''} agotado${agotados.length>1?'s':''}`,detail:agotados.slice(0,3).map(p=>p.nombre).join(', '),action:'Gestionar',tab:'manage-products'});

  const low = ps.filter(p=>p.activo!==false && num(p.stock)>0 && num(p.stock)<=2);
  if (low.length) addTask(tasks,{kind:'lowstock',urgency:2,icon:'⚠️',title:`${low.length} producto${low.length>1?'s':''} con stock bajo`,detail:low.slice(0,3).map(p=>`${p.nombre} (${p.stock})`).join(', '),action:'Ver stock',tab:'manage-products'});

  const atendidos = (()=>{try{return new Set(JSON.parse(localStorage.getItem('tm_int_atendidos')||'[]'))}catch(e){return new Set()}})();
  const pendInt = facts.interesados.filter(x=>x.ts && !atendidos.has(x.ts));
  if (pendInt.length) addTask(tasks,{kind:'interesados',urgency:3,icon:'💬',title:`${pendInt.length} interesado${pendInt.length>1?'s':''} sin atender`,detail:[...new Set(pendInt.slice(0,8).map(x=>x.producto || byId[String(x.pid)]?.nombre || x.pid))].slice(0,3).join(', '),action:'Ver ahora',tab:'inicio'});

  if (facts.avisosTotal) addTask(tasks,{kind:'avisos',urgency:2,icon:'🔔',title:`${facts.avisosTotal} cliente${facts.avisosTotal!==1?'s':''} esperan reposición`,detail:`${Object.keys(facts.avisos).length} producto${Object.keys(facts.avisos).length!==1?'s':''} con aviso de stock.`,action:'Reponer',tab:'manage-products'});

  const hot = ps.map(p=>{
    const id = String(p.id); const views = num(facts.vistas[id]); const wa = num(facts.whats[id]);
    return {p, score: views + wa*7 + Math.max(0, 4-num(p.stock))*3, views, wa};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
  state.hot = hot;
  state.factsVistas = facts.vistas; state.factsWhats = facts.whats;
  trendSnapshot(facts.vistas, facts.whats);
  const topHot = hot.find(x=>num(x.p.stock)>0);
  if (topHot && (topHot.wa>=3 || topHot.views>=25)) addTask(tasks,{kind:'hot',urgency:3,icon:'🔥',pid:topHot.p.id,title:`Producto caliente: ${topHot.p.nombre}`,detail:`${topHot.views} vistas · ${topHot.wa} WhatsApp · stock ${num(topHot.p.stock)}. Publicarlo puede vender rápido.`,action:'Publicar',tab:'publicar-ahora'});

  const noSalesViews = hot.find(x=>x.views>=25 && x.wa===0 && num(x.p.stock)>2);
  if (noSalesViews) addTask(tasks,{kind:'offer',urgency:2,icon:'🏷️',pid:noSalesViews.p.id,title:`Oferta sugerida: ${noSalesViews.p.nombre}`,detail:`Muchas vistas (${noSalesViews.views}) pero pocos WhatsApp. Prueba oferta flash o mejor texto.`,action:'Oferta',tab:'oferta-dia'});

  const sinSeo = ps.filter(p=>p.activo!==false && !p.seoTitle && !p.seoDescription);
  if (sinSeo.length>5) addTask(tasks,{kind:'seo',urgency:1,icon:'🔎',title:`${sinSeo.length} productos sin SEO`,detail:'Puedes usar IA masiva para mejorar títulos y descripciones.',action:'IA masiva',tab:'herramientas'});

  if (!localStorage.getItem('anthropicApiKey') && ps.length>5) addTask(tasks,{kind:'ai',urgency:1,icon:'🤖',title:'IA no configurada',detail:'Activa Gemini/OpenRouter/Groq para campañas, SEO y textos mejores.',action:'Configurar',tab:'configuracion'});

  tasks.sort((a,b)=>b.urgency-a.urgency);
  state.agents = buildAgentsFromTasks(tasks, facts);
  state.metrics = { productos: ps.length, criticas: tasks.filter(t=>t.urgency>=3).length, interesados: pendInt.length, avisos: facts.avisosTotal, subs: facts.tokens, hot: hot.length };
  state.tasks = tasks.slice(0,18);
  state.loading = false;
  updateBubble();
  maybeBrowserNotify();
  return state;
}

function updateBubble(){
  ensureUI();
  const b = $('#tmCopilotBubble'); if(!b) return;
  const n = state.tasks.length;
  const crit = state.metrics.criticas || 0;
  b.classList.toggle('clean', n===0);
  const badge = b.querySelector('.n');
  badge.textContent = n ? (n>99?'99+':n) : '✓';
  badge.style.background = crit ? '#e74c3c' : (n ? '#ff6b35' : '#25d366');
  if (crit) { b.classList.remove('tm-copilot-pulse'); void b.offsetWidth; b.classList.add('tm-copilot-pulse'); }
}
function tabsHtml(view){
  const tabs=[['hoy','✅ Hoy'],['chat','💬 Chat'],['correcciones','🩺 Correcciones'],['descripciones','📝 Descripciones'],['agentes','🤖 Agentes'],['marketing','📣 Marketing'],['memoria','🧠 Memoria']];
  return `<div class="tm-copilot-tabs">${tabs.map(t=>`<button type="button" class="tm-copilot-tab ${view===t[0]?'active':''}" data-cop="view" data-view="${t[0]}">${t[1]}</button>`).join('')}</div>`;
}

/* ══════════ CHAT: pregúntale al agente con tus datos reales ══════════ */
let CHAT_HIST = [];   // [{rol:'user'|'bot', txt}]
let CHAT_BUSY = false;

// Resumen COMPACTO del estado real de la tienda para darle contexto a la IA.
function chatContexto(){
  const ps = products();
  let vs = []; try{ vs = JSON.parse(localStorage.getItem('registroVentas')||'[]'); }catch(e){}
  const tasaMN = (()=>{ try{ return parseInt(localStorage.getItem('tasaMN')||'0'); }catch(e){ return 0; } })();
  const conStock = ps.filter(p=>num(p.stock)>0);
  const agotados = ps.filter(p=>num(p.stock)<=0);
  const bajos = ps.filter(p=>num(p.stock)>0&&num(p.stock)<=3);
  const cats = {}; ps.forEach(p=>{ const c=p.categoria||'General'; cats[c]=(cats[c]||0)+1; });
  const totalVendido = vs.reduce((s,v)=>s+num(v.total),0);
  const ganancia = vs.reduce((s,v)=>s+num(v.ganancia!=null?v.ganancia:v.comision),0);
  const hace30 = Date.now()-30*864e5;
  const ventas30 = vs.filter(v=>{ const t=v.id||Date.parse(v.fecha||0); return t>hace30; });
  const topStock = conStock.slice().sort((a,b)=>num(b.stock)-num(a.stock)).slice(0,10).map(p=>`${p.nombre} ($${num(p.precioActual)}, stock ${num(p.stock)}, ${p.categoria||'—'})`);
  const topHot = (state.hot||[]).slice(0,6).map(x=>`${x.p.nombre} (${x.views} vistas, ${x.wa} WhatsApp)`);
  return [
    'Tienda: TiendaMax (Cuba). Ventas por WhatsApp, entrega coordinada. Moneda USD + MN (tasa '+tasaMN+').',
    'Catálogo: '+ps.length+' productos, '+conStock.length+' con stock, '+agotados.length+' agotados.',
    'Categorías: '+Object.entries(cats).map(([c,n])=>c+' '+n).join(', ')+'.',
    'Stock bajo (≤3): '+(bajos.map(p=>p.nombre).slice(0,12).join(', ')||'ninguno')+'.',
    'Agotados: '+(agotados.map(p=>p.nombre).slice(0,12).join(', ')||'ninguno')+'.',
    'Ventas: '+vs.length+' registradas, $'+totalVendido.toFixed(2)+' vendido, $'+ganancia.toFixed(2)+' de comisión. Últimos 30 días: '+ventas30.length+' ventas.',
    'Productos con más interés (vistas/WhatsApp): '+(topHot.join(' · ')||'sin datos aún')+'.',
    'Productos disponibles (muestra): '+topStock.join(' · ')+'.'
  ].join('\n');
}

function renderChat(){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  const sugerencias=['¿Qué publico hoy?','¿Qué está caro o barato?','Arma una oferta de energía','¿Qué debo reponer?','Hazme un texto para WhatsApp del más vendido'];
  const hist = CHAT_HIST.length ? CHAT_HIST.map(m=>
    m.rol==='user'
      ? `<div class="tm-chat-u"><b>Tú</b><div>${esc(m.txt)}</div></div>`
      : `<div class="tm-chat-b"><b>🤖 Agente</b><div>${esc(m.txt).replace(/\n/g,'<br>')}</div></div>`
  ).join('') : '<div class="tm-copilot-empty">Pregúntame lo que quieras sobre tu tienda. Respondo con tus datos reales.</div>';
  return `${key?'':'<div class="tm-copilot-smart" style="border-color:rgba(245,158,11,.4)"><h4>⚠️ Falta tu API key</h4><small>Para que el agente conteste, pega una key en ⚙️ Configuración → API Key de IA (Gemini/OpenRouter/Groq/DeepSeek). Es gratis en Gemini y Groq.</small></div>'}
    <div class="tm-chat-log" id="tmChatLog">${hist}${CHAT_BUSY?'<div class="tm-chat-b"><b>🤖 Agente</b><div>⏳ pensando…</div></div>':''}</div>
    <div class="tm-copilot-chips" style="margin:8px 0">${sugerencias.map(s=>`<button type="button" class="tmcp-chip" data-cop="chatSug" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="tm-chat-input"><input id="tmChatInput" placeholder="Escribe tu pregunta…" ${CHAT_BUSY?'disabled':''}><button type="button" class="tm-copilot-btn primary" data-cop="chatSend" ${CHAT_BUSY?'disabled':''}>Enviar</button></div>
    ${CHAT_HIST.length?'<div style="text-align:center;margin-top:8px"><button type="button" class="tm-copilot-btn" data-cop="chatClear" style="font-size:11px">🗑 Limpiar conversación</button></div>':''}`;
}

async function chatEnviar(pregunta){
  pregunta=String(pregunta||'').trim(); if(!pregunta||CHAT_BUSY) return;
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key){ toast('Configura tu API key en ⚙️ Configuración'); return; }
  CHAT_HIST.push({rol:'user',txt:pregunta});
  CHAT_BUSY=true; renderSheet(); _chatScroll();
  const contexto=chatContexto();
  const historial=CHAT_HIST.slice(-6,-1).map(m=>(m.rol==='user'?'Dueño: ':'Agente: ')+m.txt).join('\n');
  const prompt='Eres el copiloto de negocio de una tienda online cubana que vende por WhatsApp. Respondes al DUEÑO, breve y práctico (máx 6 líneas), en español cubano natural, con acciones concretas y sin inventar datos que no estén abajo. Usa los números reales.\n\n=== DATOS REALES DE LA TIENDA ===\n'+contexto+'\n\n'+(historial?('=== CONVERSACIÓN PREVIA ===\n'+historial+'\n\n'):'')+'=== PREGUNTA DEL DUEÑO ===\n'+pregunta;
  let resp=null;
  try{ resp=await iaLlamarModelo(prompt); }catch(e){}
  CHAT_BUSY=false;
  CHAT_HIST.push({rol:'bot',txt: (resp&&resp.trim()) ? resp.trim() : '❌ No pude responder. Revisa tu API key en Configuración o intenta de nuevo.'});
  if(CHAT_HIST.length>40) CHAT_HIST=CHAT_HIST.slice(-40);
  renderSheet(); _chatScroll();
}
function _chatScroll(){ setTimeout(()=>{ const l=$('#tmChatLog'); if(l) l.scrollTop=l.scrollHeight; },50); }

/* ══════════ AGENTE IA · CORRECCIONES (antes vista propia del admin) ══════════
   Detecta problemas del catálogo y los ARREGLA EN UN TOQUE: aplica el cambio,
   guarda y sincroniza con GitHub automáticamente (sin pasar por "Actualizar
   tienda"). Niveles: 🚨 urgente · ⚠️ advertencia · 💡 info.                    */

// Typos frecuentes del catálogo (se comparan por palabra, sin acentos, en MAYÚSCULA)
const IA_TYPOS = {
  'BLUTOOTH':'Bluetooth','BLUETOTH':'Bluetooth','BLUETOOH':'Bluetooth',
  'INVETOR':'Inversor','INVERSOR':'Inversor','INVERTER':'Inverter',
  'SEQURIDAD':'Seguridad','SEGURIDAD':'Seguridad',
  'BATERIA':'Batería','BATERIAS':'Baterías','CAMARA':'Cámara','CAMARAS':'Cámaras',
  'HIBRIDO':'Híbrido','HIBRIDA':'Híbrida','ESTACION':'Estación','PORTATIL':'Portátil',
  'ELECTRICO':'Eléctrico','ELECTRICA':'Eléctrica','AUDIFONOS':'Audífonos',
  'INALAMBRICO':'Inalámbrico','INALAMBRICA':'Inalámbrica','ALERON':'Alerón',
  'ENRUTADOR':'Enrutador','REPETIDOR':'Repetidor'
};
// Siglas/modelos que se conservan tal cual (no title-case)
const IA_SIGLAS = new Set(['WIFI','USB','HDMI','LED','RGB','TV','PC','TIG','MPPT','POE','AC','DC','CCTV','GPS','LCD','USD','MN','KIT','PRO','MAX','MINI','PLUS','ULTRA','LITE','XL','II','III','4K','2K','HD','FHD','UHD','5G','4G','3G','2T','4T','SHPD','RX','AX']);
const IA_SIGLA_FORMA = { 'WIFI':'WiFi' };

function iaNormalizarNombre(raw){
  const nombre = String(raw||'').trim().replace(/\s+/g,' ');
  if(!nombre) return nombre;
  const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'');
  const tokens = nombre.split(' ').map(tok=>{
    const m = tok.match(/^([("¡¿]*)(.*?)([)".,:;!?]*)$/) || [,'',tok,''];
    const pre=m[1]||'', core=m[2]||'', post=m[3]||'';
    if(!core) return tok;
    const KEY = sinAcentos(core).toUpperCase();
    if(IA_TYPOS[KEY]) return pre+IA_TYPOS[KEY]+post;
    if(IA_SIGLAS.has(KEY)) return pre+(IA_SIGLA_FORMA[KEY]||KEY)+post;
    if(/\d/.test(core)) return pre+core.toUpperCase()+post;       // modelos: M100, R14, 5W30, 84V
    if(core.length<=2) return pre+core.toLowerCase()+post;        // de, la, y…
    return pre+core.charAt(0).toUpperCase()+core.slice(1).toLowerCase()+post;
  });
  if(tokens[0] && /^[a-záéíóúñ]/.test(tokens[0])) tokens[0]=tokens[0].charAt(0).toUpperCase()+tokens[0].slice(1);
  return tokens.join(' ');
}

const IA_CATS_KW = [
  [/inversor|bateria|solar|mppt|cargador|estacion de carga|transferencia|controlador/, 'ENERGIA'],
  [/router|wifi|repetidor|switch|enrutador|poe|antena/, 'WIFI'],
  [/camara|alarma|cerradura|seguridad|cctv|zosi|v380/, 'SEGURIDAD'],
  [/mannol|aceite|antifreeze|llanta|espejo retrovisor|forro.*asiento/, 'CARROS'],
  [/moto\b|motorbike|capa para moto/, 'MOTOS'],
  [/audifono|parlante|altavoz|bocina|sound/, 'AUDIO'],
  [/tv\b|lavadora|split|nevera|exhibidor|batidora|ventilador de techo|calentador/, 'HOGAR'],
];
function iaCategoriaSugerida(p){
  const low=String(p.nombre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for(const [re,cat] of IA_CATS_KW){ if(re.test(low)) return cat; }
  return null;
}

function iaDismissed(){ try{ return new Set(JSON.parse(localStorage.getItem('tm_ia_descartes')||'[]')); }catch(e){ return new Set(); } }
function iaDismiss(key){ const s=iaDismissed(); s.add(key); try{ localStorage.setItem('tm_ia_descartes', JSON.stringify([...s].slice(-300))); }catch(e){} }

function iaScan(){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const ps = Array.isArray(window.productos)?window.productos:[];
  const skip = iaDismissed();
  const issues=[];
  const push=(o)=>{ o.key=o.type+':'+o.pid; if(!skip.has(o.key)) issues.push(o); };
  ps.forEach(p=>{
    const pid=String(p.id), nombre=p.nombre||'(sin nombre)';
    // 🚨 sin descripción SEO
    const d=String(p.descripcion||'').trim();
    // Sin "fix" automático a propósito: la plantilla local que tenía esto antes
    // (iaGenerarDescripcion, ya eliminada) escribía el mismo texto genérico en todos
    // los productos — eso fue justo el bug que rellenó ~101 descripciones reales con
    // "...te lo apartamos 24 horas...". El único camino para arreglar esto en el sheet
    // es el botón real "🤖 Descripciones con IA" (iaDescripcionesConIA), que sí genera
    // texto distinto por producto a partir de sus datos reales.
    if(d.length<40) push({level:'urgente',ico:'🚨',type:'desc',pid,nombre,detalle:(d?('solo '+d.length+' caracteres'):'sin descripción')+' — usa "🤖 Descripciones con IA"',fix:null,fixLabel:null});
    // 🚨 nombre mal formateado (typos / ALL CAPS / mixto raro)
    const nNorm=iaNormalizarNombre(nombre);
    if(nNorm && nNorm!==nombre) push({level:'urgente',ico:'🔤',type:'nombre',pid,nombre,detalle:'→ '+nNorm,fix:{campo:'nombre',valor:nNorm},fixLabel:'Corregir nombre'});
    // ⚠️ stock NaN / negativo
    const st=p.stock;
    if(st===undefined||st===null||isNaN(Number(st))||Number(st)<0) push({level:'adv',ico:'⚠️',type:'stock',pid,nombre,detalle:'stock inválido: '+JSON.stringify(st),fix:{campo:'stock',valor:0},fixLabel:'Poner stock 0'});
    // ⚠️ categoría sospechosa
    const sug=iaCategoriaSugerida(p);
    if(sug && p.categoria && sug!==String(p.categoria).toUpperCase()) push({level:'adv',ico:'🏷️',type:'cat',pid,nombre,detalle:(p.categoria||'—')+' → sugerida: '+sug,fix:{campo:'categoria',valor:sug},fixLabel:'Cambiar a '+sug});
    // 💡 precio fuera de rango
    const pr=Number(p.precioActual);
    if(!(pr>0)||pr>10000) push({level:'info',ico:'💲',type:'precio',pid,nombre,detalle:'precio: '+String(p.precioActual),fix:null});
    // 💡 sin imagen
    if(!p.imagen) push({level:'info',ico:'🖼️',type:'img',pid,nombre,detalle:'sin foto principal',fix:null});
  });
  // 💡 Radar de precios: estás muy por debajo de la mediana del mercado → oportunidad de subir
  try{
    const rad = window.__tmRadarCache;
    if(rad && Array.isArray(rad.productos)){
      const normN = s2 => String(s2||'').toLowerCase().trim().replace(/\s+/g,' ');
      rad.productos.forEach(r0=>{
        const med = r0.mercado && r0.mercado.mediana, tuyo = r0.tuPrecio;
        if(!(med && tuyo && tuyo < med*0.85)) return;
        const p = ps.find(x=>normN(x.nombre)===normN(r0.nombre)); if(!p) return;
        const nuevo = Math.round(med*0.85);
        const o = {level:'info',ico:'📡',type:'radar',pid:String(p.id),nombre:p.nombre,
          detalle:'tú $'+Number(tuyo).toFixed(0)+' · mercado $'+Number(med).toFixed(0)+' → subir a $'+nuevo,
          fix:{campo:'precioActual',valor:nuevo},fixLabel:'Subir a $'+nuevo};
        o.key=o.type+':'+o.pid; if(!skip.has(o.key)) issues.push(o);
      });
    } else if(rad===undefined){
      window.__tmRadarCache=null; // evitar re-disparos
      fetch('radar.json?_='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{
        window.__tmRadarCache=j||null;
        if(j && state.view==='correcciones') renderSheet();
      }).catch(()=>{ window.__tmRadarCache=null; });
    }
  }catch(e){}
  return issues;
}

let iaSyncTimer=null;
function iaPersistir(msjToast){
  // Unificar el array del motor con el del admin antes de que guardarProductos
  // serialice (si no, el motor guardaría un array distinto y se perderían los cambios).
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  try{ if(typeof window.guardarProductos==='function') window.guardarProductos(); else localStorage.setItem('productos', JSON.stringify(window.productos)); }catch(e){}
  // sync automático a GitHub (debounced 2 s por si se aplican varias seguidas)
  clearTimeout(iaSyncTimer);
  iaSyncTimer=setTimeout(()=>{
    if(typeof window.sincronizarConGitHub==='function'){ try{ window.sincronizarConGitHub(); }catch(e){} }
    else if(typeof window.sincronizarTodoConGitHub==='function'){ try{ window.sincronizarTodoConGitHub(); }catch(e){} }
  }, 2000);
  if(msjToast) toast(msjToast+' — guardado y sincronizando ✓');
  try{ if(typeof window.renderProductos==='function') window.renderProductos(); }catch(e){}
}

/* ── Llamada a IA real (opcional, usa la key de ⚙️ Config → API Key de IA) ──
   Detecta proveedor por prefijo: AIza=Gemini · sk-or=OpenRouter · gsk_=Groq · sk-=DeepSeek */
// Descarga una imagen (mismo origen) y la vuelve base64 para mandarla a un
// modelo con visión (hoy solo Gemini soporta imagen en esta integración).
async function _iaImagenBase64(url){
  if(!url) return null;
  try{
    const r=await fetch(url);
    if(!r.ok) return null;
    const blob=await r.blob();
    const data=await new Promise((res,rej)=>{
      const rd=new FileReader();
      rd.onload=()=>res(String(rd.result).split(',')[1]||'');
      rd.onerror=rej;
      rd.readAsDataURL(blob);
    });
    return data ? {mime:blob.type||'image/jpeg', data} : null;
  }catch(e){ return null; }
}
// Último error real de iaLlamarModelo (no solo "no respondió") — para poder
// diagnosticar sin adivinar: key inválida, CORS del navegador, modelo caído, etc.
let _iaUltimoError = '';
window.iaUltimoError = () => _iaUltimoError;
async function _iaFetchJSON(url, opts){
  let r;
  try{ r = await fetch(url, opts); }
  catch(e){
    // fetch rechaza sin respuesta cuando el navegador bloquea por CORS o no
    // hay red — se ve exactamente igual desde acá, por eso el mensaje cubre ambos.
    _iaUltimoError = 'Red/CORS: '+(e && e.message || e)+' — el navegador bloqueó la llamada a '+url+' (o no hay conexión). Revisa si el proveedor permite llamadas desde el navegador.';
    console.error('[IA]', _iaUltimoError);
    return null;
  }
  let j = null;
  try{ j = await r.json(); }catch(e){ /* respuesta no-JSON, sigue abajo con r.ok */ }
  if(!r.ok){
    _iaUltimoError = 'HTTP '+r.status+' de '+url+': '+(j ? JSON.stringify(j).slice(0,300) : '(sin cuerpo)');
    console.error('[IA]', _iaUltimoError);
    return null;
  }
  return j;
}
async function iaLlamarModelo(prompt, imagen){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key) return null;
  _iaUltimoError='';
  const t=25000, ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),t);
  try{
    let j;
    if(key.startsWith('AIza')){
      const parts=[{text:prompt}];
      if(imagen && imagen.data) parts.unshift({inline_data:{mime_type:imagen.mime||'image/jpeg', data:imagen.data}});
      j=await _iaFetchJSON('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({contents:[{parts}]})});
      return j ? (j.candidates?.[0]?.content?.parts?.[0]?.text||null) : null;
    }
    const cfg = key.startsWith('sk-or') ? {url:'https://openrouter.ai/api/v1/chat/completions',model:'openrouter/auto'}
      : key.startsWith('gsk_') ? {url:'https://api.groq.com/openai/v1/chat/completions',model:'llama-3.3-70b-versatile'}
      : {url:'https://api.deepseek.com/chat/completions',model:'deepseek-chat'};
    j=await _iaFetchJSON(cfg.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},signal:ctrl.signal,body:JSON.stringify({model:cfg.model,messages:[{role:'user',content:prompt}],max_tokens:400})});
    return j ? (j.choices?.[0]?.message?.content||null) : null;
  }catch(e){ _iaUltimoError='Excepción: '+(e && e.message || e); console.error('[IA]', _iaUltimoError); return null; }
  finally{ clearTimeout(tid); }
}
window.iaLlamarModelo = iaLlamarModelo;
// Prompt compartido: usa SOLO datos reales del producto (+ foto si el modelo
// la soporta), nunca inventa specs/materiales/compatibilidades.
// Estilo "ficha de producto": primera oración = qué es + beneficio principal,
// luego 3-5 oraciones cortas de un solo punto de valor cada una — el sitio
// (_renderDescripcionChecklist) convierte esas oraciones en una lista con ✓
// automáticamente, por eso van en texto plano separadas por "punto y espacio",
// sin viñetas ni markdown propios.
function _iaPromptDescripcion(p, tieneImagen){
  const specsTxt=(Array.isArray(p.specs)?p.specs:[]).filter(Boolean).slice(0,4).join(', ');
  const datos='Producto: "'+(p.nombre||'')+'". Categoría: '+(p.categoria||'General')+'.'+(specsTxt?' Especificaciones reales: '+specsTxt+'.':'')+' Precio: $'+Number(p.precioActual||0).toFixed(2)+' USD.'+(p.garantia?' Garantía: '+p.garantia+'.':'');
  const foto=tieneImagen?' Mira la foto adjunta: fíjate en marca, modelo y detalles visibles reales (texto del empaque, puertos, diseño) y úsalos si aportan algo verídico.':'';
  return 'Escribe una descripción de venta para una tienda online cubana (entrega en Cuba, pedido por WhatsApp), estilo ficha de producto: '
    +'primera oración = qué es y su beneficio principal; luego 3 a 5 oraciones cortas, cada una con UN solo punto de valor real (calidad/marca, una especificación técnica, un uso práctico, garantía si aplica). '
    +'Cada oración va directo al punto, sin viñetas ni símbolos propios, separadas por punto y espacio normal (el sitio las convierte en lista automáticamente). '
    +datos+foto
    +' Usa SOLO datos reales dados arriba o realmente visibles en la foto — nunca inventes specs, materiales ni compatibilidades. Entre 220 y 400 caracteres en total, tono cercano y confiable, sin emojis, sin markdown, texto plano en oraciones.';
}
// Corre un lote de generación de descripciones sobre una lista de productos ya resuelta.
// Devuelve {ok, grupo} para que el caller decida cómo avisar/persistir.
async function _iaGenerarLoteDescripciones(lista){
  const grupo=[]; let ok=0;
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  const soportaImagen=key.startsWith('AIza'); // solo Gemini ve fotos en esta integración
  for(const p of lista){
    let imagen=null;
    if(soportaImagen){
      const url=(Array.isArray(p.imagenes)&&p.imagenes[0])||p.imagen;
      imagen=await _iaImagenBase64(url);
    }
    const txt=await iaLlamarModelo(_iaPromptDescripcion(p, !!imagen), imagen);
    if(txt && txt.trim().length>=120){
      grupo.push({pid:String(p.id),campo:'descripcion',antes:p.descripcion});
      p.descripcion=txt.trim().slice(0,450);
      try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){}
      ok++;
    }
  }
  return {ok,grupo};
}

/* ══════════ ANÁLISIS INDIVIDUAL: un producto a la vez, foto + descripción + specs ══════════
   A diferencia de _iaGenerarLoteDescripciones (solo descripción, en lote, guarda directo),
   esto es para revisar un producto puntual, en un solo llamado a la IA que devuelve JSON
   con descripción Y specs juntas, para previsualizar antes de aplicar. */
function _iaPromptAnalisis(p, tieneImagen){
  const specsTxt=(Array.isArray(p.specs)?p.specs:[]).filter(Boolean).slice(0,4).join(', ');
  const datos='Producto: "'+(p.nombre||'')+'". Categoría: '+(p.categoria||'General')+'.'+(specsTxt?' Specs ya cargadas: '+specsTxt+'.':'')+' Precio: $'+Number(p.precioActual||0).toFixed(2)+' USD.'+(p.garantia?' Garantía: '+p.garantia+'.':'');
  const foto=tieneImagen?' Mira la foto adjunta: fíjate en marca, modelo y detalles visibles reales (texto del empaque, puertos, diseño) y úsalos si aportan algo verídico.':'';
  return 'Analiza este producto de una tienda online cubana (entrega en Cuba, pedido por WhatsApp) y devuelve SOLO un JSON, sin markdown ni texto fuera del JSON, con este formato exacto: {"descripcion":"...","specs":["...","..."]}. '
    +'"descripcion" estilo ficha de producto: primera oración = qué es y su beneficio principal, luego 3 a 5 oraciones cortas de un solo punto de valor real cada una, sin viñetas ni emojis ni markdown, separadas por punto y espacio normal, 220 a 400 caracteres en total. '
    +'"specs": hasta 6 especificaciones técnicas reales y breves (voltaje, potencia, capacidad, dimensiones, conectividad — lo que aplique), strings cortos. '
    +datos+foto
    +' Usa SOLO datos reales dados arriba o realmente visibles en la foto — nunca inventes specs, materiales ni compatibilidades que no puedas verificar.';
}
async function iaAnalizarProducto(p){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key) return null;
  const soportaImagen=key.startsWith('AIza'); // solo Gemini ve fotos en esta integración
  let imagen=null;
  if(soportaImagen){
    const url=(Array.isArray(p.imagenes)&&p.imagenes[0])||p.imagen;
    imagen=await _iaImagenBase64(url);
  }
  const raw=await iaLlamarModelo(_iaPromptAnalisis(p, !!imagen), imagen);
  if(!raw) return null;
  const m=raw.match(/\{[\s\S]*\}/);
  if(!m) return null;
  try{
    const j=JSON.parse(m[0]);
    const descripcion=String(j.descripcion||'').trim().slice(0,450);
    const specs=Array.isArray(j.specs)?j.specs.map(s=>String(s).trim()).filter(Boolean).slice(0,6):[];
    if(!descripcion && !specs.length) return null;
    return {descripcion, specs};
  }catch(e){ return null; }
}
async function iaAnalizarUno(pid){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const p=(window.productos||[]).find(x=>String(x.id)===String(pid));
  if(!p) return;
  state.iaPreviewPid=String(pid); state.iaPreviewData=null; state.iaPreviewCargando=true;
  renderSheet();
  const res=await iaAnalizarProducto(p);
  state.iaPreviewCargando=false;
  if(!res){ toast('❌ La IA no respondió'+(window.iaUltimoError()?': '+window.iaUltimoError():' — revisa tu API key')); state.iaPreviewPid=null; renderSheet(); return; }
  state.iaPreviewData=res;
  renderSheet();
}
function iaAnalizarAplicar(pid){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const p=(window.productos||[]).find(x=>String(x.id)===String(pid));
  const d=state.iaPreviewData;
  if(!p || !d) return;
  const grupo=[];
  if(d.descripcion){ grupo.push({pid:String(p.id),campo:'descripcion',antes:p.descripcion}); p.descripcion=d.descripcion; }
  if(d.specs && d.specs.length){ grupo.push({pid:String(p.id),campo:'specs',antes:p.specs}); p.specs=d.specs; }
  try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){}
  if(grupo.length) iaUndoPush(grupo, 'Análisis IA de '+p.nombre);
  iaPersistir('✅ '+p.nombre+' actualizado con IA');
  state.iaPreviewPid=null; state.iaPreviewData=null;
  renderSheet();
}
function iaAnalizarDescartar(){
  state.iaPreviewPid=null; state.iaPreviewData=null;
  renderSheet();
}
function renderDescripciones(){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key) return `<div class="tm-copilot-empty">Configura tu API key en ⚙️ Configuración → API Key de IA para analizar productos.</div>`;
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const ps=products().slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
  const MAX=40;
  const fila=p=>{
    const pid=String(p.id);
    const esPreview=state.iaPreviewPid===pid;
    let extra='';
    if(esPreview && state.iaPreviewCargando){
      extra=`<div class="tm-copilot-code">🤖 Analizando foto y datos…</div>`;
    } else if(esPreview && state.iaPreviewData){
      const d=state.iaPreviewData;
      extra=`<div class="tm-copilot-code">${esc(d.descripcion||'(sin descripción)')}${d.specs&&d.specs.length?'<br><br><b>Specs:</b> '+esc(d.specs.join(', ')):''}</div>
        <div class="tm-copilot-task-actions" style="margin-top:8px">
          <button type="button" class="tm-copilot-btn primary" data-cop="iaAnalizarAplicar" data-pid="${esc(pid)}">✅ Aplicar</button>
          <button type="button" class="tm-copilot-btn" data-cop="iaAnalizarDescartar">✖️ Descartar</button>
        </div>`;
    }
    return `<div class="tm-copilot-task u1" data-pid="${esc(pid)}">
      <div class="tm-copilot-task-top"><div class="tm-copilot-ico">📦</div><div class="tm-copilot-task-main"><b>${esc(p.nombre)}</b><small>${esc(p.categoria||'General')} · $${Number(p.precioActual||0).toFixed(2)}</small></div></div>
      <div class="tm-copilot-task-actions"><button type="button" class="tm-copilot-btn blue" data-cop="iaAnalizarUno" data-pid="${esc(pid)}" ${esPreview&&state.iaPreviewCargando?'disabled':''}>🤖 Analizar con IA</button></div>
      ${extra}
    </div>`;
  };
  return `<div class="tm-copilot-empty" style="padding:8px 4px;font-size:11px;text-align:left">Analiza un producto a la vez: mira la foto real (si tu key es Gemini) y los datos ya cargados, y te propone descripción + specs para revisar antes de aplicar — no pisa nada solo.</div>
    ${ps.slice(0,MAX).map(fila).join('')}
    ${ps.length>MAX?`<div class="tm-copilot-empty">…y ${ps.length-MAX} productos más.</div>`:''}`;
}

async function iaDescripcionesConIA(){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key){ toast('Configura tu API key en ⚙️ Configuración → API Key de IA para generar descripciones reales'); return; }
  const todos=iaScan().filter(i=>i.level==='urgente'&&i.type==='desc');
  if(!todos.length){ toast('No hay productos sin descripción'); return; }
  const LOTE=15;
  const pendientes=todos.slice(0,LOTE);
  toast('🤖 Generando '+pendientes.length+' descripciones con IA…');
  const lista=pendientes.map(iss=>(window.productos||[]).find(x=>String(x.id)===iss.pid)).filter(Boolean);
  const {ok,grupo}=await _iaGenerarLoteDescripciones(lista);
  const restan=todos.length-pendientes.length;
  if(ok){ iaUndoPush(grupo, ok+' descripciones IA'); iaPersistir('🤖 '+ok+' descripciones generadas con IA'+(restan>0?' — quedan '+restan+', toca de nuevo para seguir':'')); }
  else toast('❌ La IA no respondió'+(window.iaUltimoError()?': '+window.iaUltimoError():' — revisa tu API key'));
  state.view='correcciones'; renderSheet();
}

// Regenerar TODAS las descripciones (incluso las que ya tienen texto), en tandas,
// para mejorar calidad de redacción — no solo llenar las que faltan (eso es iaDescripcionesConIA).
// Cola persistida en localStorage: cada click procesa el próximo lote y guarda el resto,
// así el admin puede revisar entre tandas o cerrar el panel y seguir después.
function _iaRegenQueueGet(){ try{ const a=JSON.parse(localStorage.getItem('tm_ia_regen_queue')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function _iaRegenQueueSet(a){ try{ localStorage.setItem('tm_ia_regen_queue', JSON.stringify(a)); }catch(e){} }
async function iaRegenerarTodasDescripciones(){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key){ toast('Configura tu API key en ⚙️ Configuración → API Key de IA para generar descripciones reales'); return; }
  let cola=_iaRegenQueueGet();
  if(!cola.length){
    const todos=(window.productos||[]).map(p=>String(p.id));
    if(!todos.length){ toast('No hay productos'); return; }
    if(!confirm('Esto va a REESCRIBIR con IA la descripción de los '+todos.length+' productos, en tandas de 15. Cada tanda se guarda y se sincroniza sola; podés revisar entre tanda y tanda o deshacer con "↩️ Deshacer". ¿Continuar?')) return;
    cola=todos; _iaRegenQueueSet(cola);
  }
  const LOTE=15;
  const lote=cola.slice(0,LOTE);
  toast('🤖 Regenerando '+lote.length+' descripciones con IA…');
  const lista=lote.map(pid=>(window.productos||[]).find(x=>String(x.id)===pid)).filter(Boolean);
  const {ok,grupo}=await _iaGenerarLoteDescripciones(lista);
  const restante=cola.slice(lote.length);
  _iaRegenQueueSet(restante);
  if(ok){ iaUndoPush(grupo, ok+' descripciones regeneradas'); iaPersistir('🤖 '+ok+' descripciones regeneradas'+(restante.length>0?' — quedan '+restante.length+', toca de nuevo para seguir':' — ¡listo, las '+lote.length+' de esta tanda terminaron la cola!')); }
  else toast('❌ La IA no respondió'+(window.iaUltimoError()?': '+window.iaUltimoError():' — revisa tu API key'));
  state.view='correcciones'; renderSheet();
}
function iaRegenCancelar(){
  _iaRegenQueueSet([]);
  toast('Regeneración cancelada — lo ya generado no se revierte, usa "↩️ Deshacer" si hace falta');
  state.view='correcciones'; renderSheet();
}
function iaUndoPila(){ try{ const a=JSON.parse(localStorage.getItem('tm_ia_undo')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function iaUndoPush(grupo,label){ try{ const a=iaUndoPila(); a.push({grupo,label,ts:Date.now()}); localStorage.setItem('tm_ia_undo',JSON.stringify(a.slice(-20))); }catch(e){} }
function iaDeshacer(){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const a=iaUndoPila(); const ult=a.pop();
  if(!ult){ toast('Nada que deshacer'); return; }
  let n=0;
  ult.grupo.forEach(g=>{ const p=(window.productos||[]).find(x=>String(x.id)===g.pid); if(p){ p[g.campo]=g.antes; try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){} n++; } });
  try{ localStorage.setItem('tm_ia_undo',JSON.stringify(a)); }catch(e){}
  if(n) iaPersistir('↩️ Deshecho: '+(ult.label||n+' cambios'));
  state.view='correcciones'; renderSheet();
}
function iaAplicar(issue, _sinUndo){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  const p=(window.productos||[]).find(x=>String(x.id)===issue.pid);
  if(!p||!issue.fix) return false;
  const antes=p[issue.fix.campo];
  p[issue.fix.campo]=issue.fix.valor;
  if(!_sinUndo) iaUndoPush([{pid:issue.pid,campo:issue.fix.campo,antes}], issue.fixLabel+': '+String(issue.nombre).slice(0,40));
  try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){}
  return true;
}
function iaAplicarUrgentes(){
  const list=iaScan().filter(i=>i.level==='urgente'&&i.fix);
  const grupo=[]; let n=0;
  list.forEach(i=>{ const p=(window.productos||[]).find(x=>String(x.id)===i.pid); const antes=p?p[i.fix.campo]:undefined; if(iaAplicar(i,true)){ grupo.push({pid:i.pid,campo:i.fix.campo,antes}); n++; } });
  if(grupo.length) iaUndoPush(grupo, n+' urgentes');
  if(n) iaPersistir('✅ '+n+' urgentes aplicadas'); else toast('Sin urgentes con arreglo automático');
  state.view='correcciones'; renderSheet();
}
function iaNormalizarBulk(){
  try{ if(typeof window.syncProductos==='function') window.syncProductos(); }catch(e){}
  let n=0; const grupo=[];
  (window.productos||[]).forEach(p=>{ const v=iaNormalizarNombre(p.nombre||''); if(v&&v!==p.nombre){ grupo.push({pid:String(p.id),campo:'nombre',antes:p.nombre}); p.nombre=v; try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){} n++; } });
  if(grupo.length) iaUndoPush(grupo, n+' nombres');
  if(n) iaPersistir('🔤 '+n+' nombres normalizados'); else toast('Todos los nombres ya están bien');
  renderSheet();
}
async function iaSyncFirebase(){
  try{
    const cfg=JSON.parse(localStorage.getItem('firebaseConfig')||'{}');
    const base=cfg.databaseURL||(cfg.projectId?('https://'+cfg.projectId+'-default-rtdb.firebaseio.com'):null);
    if(!base){ toast('Configura Firebase primero (⚙️)'); return; }
    const issues=iaScan();
    const estado={ ts:Date.now(), fecha:new Date().toISOString(), productos:(window.productos||[]).length,
      urgentes:issues.filter(i=>i.level==='urgente').length, advertencias:issues.filter(i=>i.level==='adv').length,
      info:issues.filter(i=>i.level==='info').length,
      detalle:issues.slice(0,80).map(i=>({t:i.type,pid:i.pid,n:i.nombre.slice(0,60),d:String(i.detalle).slice(0,90)})) };
    const r=await fetch(base+'/correcciones_ia/estado.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(estado)});
    toast(r.ok?'🔥 Estado subido a Firebase (/correcciones_ia/estado)':'❌ Firebase respondió '+r.status);
  }catch(e){ toast('❌ Error al subir a Firebase: '+e.message); }
}
function iaExportCSV(){
  const issues=iaScan();
  const rows=[['nivel','tipo','producto','detalle','arreglo_automatico'],
    ...issues.map(i=>[i.level,i.type,i.nombre,String(i.detalle),i.fix?('sí → '+i.fix.campo):'no'])];
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='correcciones-tiendamax-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),800);
  toast('📥 CSV descargado ('+issues.length+' hallazgos)');
}
function renderCorreccionesIA(){
  const issues=iaScan();
  const g={urgente:issues.filter(i=>i.level==='urgente'),adv:issues.filter(i=>i.level==='adv'),info:issues.filter(i=>i.level==='info')};
  const fila=i=>`<div class="tm-copilot-task u${i.level==='urgente'?4:i.level==='adv'?2:1}" data-key="${esc(i.key)}">
    <div class="tm-copilot-task-top"><div class="tm-copilot-ico">${i.ico}</div><div class="tm-copilot-task-main"><b>${esc(i.nombre)}</b><small>${esc(String(i.detalle))}</small></div></div>
    <div class="tm-copilot-task-actions">${i.fix?`<button type="button" class="tm-copilot-btn primary" data-cop="iaApply" data-key="${esc(i.key)}">✅ ${esc(i.fixLabel||'Aplicar')}</button>`:''}<button type="button" class="tm-copilot-btn" data-cop="iaDismiss" data-key="${esc(i.key)}">Descartar</button></div>
  </div>`;
  const bloque=(t,arr)=>arr.length?`<div class="tm-copilot-smart"><h4>${t} (${arr.length})</h4></div>${arr.slice(0,25).map(fila).join('')}${arr.length>25?`<div class="tm-copilot-empty">…y ${arr.length-25} más (usa el CSV para verlos todos)</div>`:''}`:'';
  return `<div class="tm-copilot-summary" style="grid-template-columns:repeat(3,1fr)">
      <div class="tm-copilot-stat"><small>🚨 Urgentes</small><b>${g.urgente.length}</b></div>
      <div class="tm-copilot-stat"><small>⚠️ Advertencias</small><b>${g.adv.length}</b></div>
      <div class="tm-copilot-stat"><small>💡 Info</small><b>${g.info.length}</b></div>
    </div>
    <div class="tm-copilot-actions">
      <button type="button" class="tm-copilot-btn blue" data-cop="iaRescan">🔍 Re-analizar</button>
      <button type="button" class="tm-copilot-btn primary" data-cop="iaUrgentes">✅ Aplicar urgentes</button>
      <button type="button" class="tm-copilot-btn gold" data-cop="iaBulkNombres">🔤 Normalizar nombres</button>
      <button type="button" class="tm-copilot-btn danger" data-cop="iaFirebase">🔥 Sync Firebase</button>
      <button type="button" class="tm-copilot-btn green" data-cop="iaCSV">📥 Exportar CSV</button>
      ${iaUndoPila().length?`<button type="button" class="tm-copilot-btn" data-cop="iaUndo">↩️ Deshacer (${iaUndoPila().length})</button>`:''}
      <button type="button" class="tm-copilot-btn blue" data-cop="iaDescIA">🤖 Descripciones con IA</button>
      <button type="button" class="tm-copilot-btn gold" data-cop="iaRegenTodas">🔁 Regenerar TODAS con IA${_iaRegenQueueGet().length?` (${_iaRegenQueueGet().length} restantes)`:''}</button>
      ${_iaRegenQueueGet().length?`<button type="button" class="tm-copilot-btn" data-cop="iaRegenCancelar">✖️ Cancelar regeneración</button>`:''}
    </div>
    ${issues.length? bloque('🚨 Urgentes',g.urgente)+bloque('⚠️ Advertencias',g.adv)+bloque('💡 Info',g.info)
      : '<div class="tm-copilot-empty">✅ Catálogo impecable: sin problemas detectados.</div>'}
    <div class="tm-copilot-empty" style="padding:8px 4px;font-size:10px">Al aplicar, el cambio se guarda y se sincroniza con la tienda automáticamente.</div>`;
}
/* ══════════ TENDENCIAS: qué se ve más esta semana (reponé antes de agotarte) ══════════
   Los analytics de la tienda son contadores acumulados (sin fecha). Para saber
   "esta semana vs la anterior" guardamos una foto diaria de los contadores en el
   teléfono y comparamos ventanas de 7 días. Necesita ~1 semana de historial;
   mientras tanto avisa honestamente que está juntando datos. */
function trendSnaps(){ try{ return JSON.parse(localStorage.getItem('tm_trend_snaps')||'[]'); }catch(e){ return []; } }
function trendSnapshot(vistas, whats){
  try{
    const v = vistas||{}, w = whats||{};
    const total = Object.values(v).reduce((s,x)=>s+num(x),0) + Object.values(w).reduce((s,x)=>s+num(x),0);
    if(total<=0) return;                          // sin analytics todavía: no guardar vacío
    const snaps = trendSnaps();
    const hoy = new Date().toISOString().slice(0,10);
    const last = snaps[snaps.length-1];
    if(last && last.d===hoy){ last.v=v; last.w=w; }   // refrescar la foto de hoy
    else snaps.push({d:hoy, v, w});
    localStorage.setItem('tm_trend_snaps', JSON.stringify(snaps.slice(-21)));
  }catch(e){}
}
function _catOf(p){ return (p&&p.categoria) || 'General'; }
function trendReport(){
  const nowV = state.factsVistas||{}, nowW = state.factsWhats||{};
  const nowTotal = Object.values(nowV).reduce((s,x)=>s+num(x),0)+Object.values(nowW).reduce((s,x)=>s+num(x),0);
  if(nowTotal<=0) return {status:'nodata'};
  const snaps = trendSnaps();
  const ahora = Date.now();
  const pick = (dias)=>{ const objetivo=ahora-dias*864e5; let best=null,bd=Infinity;
    snaps.forEach(s=>{ const t=Date.parse(s.d); const diff=Math.abs(t-objetivo); if(t<=ahora && diff<bd){ best=s; bd=diff; } }); return best; };
  const s7 = pick(7);
  if(!s7 || (ahora-Date.parse(s7.d)) < 3*864e5)
    return {status:'building', dias: snaps.length?Math.max(1,Math.round((ahora-Date.parse(snaps[0].d))/864e5)):0};
  const s14 = pick(14);
  const ps = products();
  const inter = (V,W,pid)=> num(V[pid]) + num(W[pid])*5;   // WhatsApp pesa más que una vista
  const catNow={}, catPrev={}, prodNow={};
  ps.forEach(p=>{
    const pid=String(p.id), cat=_catOf(p);
    const week = Math.max(0, inter(nowV,nowW,pid) - inter(s7.v,s7.w,pid));
    prodNow[pid]=week; catNow[cat]=(catNow[cat]||0)+week;
    if(s14) catPrev[cat]=(catPrev[cat]||0)+Math.max(0, inter(s7.v,s7.w,pid) - inter(s14.v,s14.w,pid));
  });
  const cats = Object.keys(catNow).map(cat=>{
    const nowN=catNow[cat]||0, prevN=catPrev[cat]||0;
    const ratio = prevN>0 ? nowN/prevN : (nowN>=8?3:1);
    return {cat, now:nowN, prev:prevN, ratio};
  }).filter(c=>c.now>=6 && c.ratio>=1.8).sort((a,b)=>b.ratio-a.ratio).slice(0,3);
  const cards = cats.map(c=>{
    const enRiesgo = ps.filter(p=>_catOf(p)===c.cat && p.activo!==false && num(p.stock)>0 && num(p.stock)<=4)
      .sort((a,b)=>num(a.stock)-num(b.stock)).slice(0,3);
    const topProd = ps.filter(p=>_catOf(p)===c.cat && num(p.stock)>0)
      .sort((a,b)=>(prodNow[String(b.id)]||0)-(prodNow[String(a.id)]||0))[0];
    return {...c, enRiesgo, topProd};
  });
  return {status:'ok', cards};
}
function renderTendencias(){
  const r = trendReport();
  if(r.status==='nodata') return '';
  if(r.status==='building')
    return `<div class="tm-copilot-smart" style="border-color:rgba(139,92,246,.4)"><h4>📈 Tendencias</h4><small>Estoy juntando datos de qué se ve más cada semana (necesito ~1 semana de historial; llevo ${r.dias} día${r.dias===1?'':'s'}). Vuelve pronto y te digo qué categoría sube para que repongas a tiempo.</small></div>`;
  if(!r.cards.length)
    return `<div class="tm-copilot-smart" style="border-color:rgba(139,92,246,.4)"><h4>📈 Tendencias</h4><small>Nada disparado esta semana: el interés está estable entre categorías.</small></div>`;
  return `<div class="tm-copilot-smart" style="border-color:rgba(139,92,246,.5)"><h4>📈 Tendencias de la semana</h4>
    <small>Lo que se está viendo más — reponé antes de que se agote.</small>
    ${r.cards.map(c=>{
      const x = c.ratio>=3?'3×':c.ratio>=2?'2×':'+'+Math.round((c.ratio-1)*100)+'%';
      const pubBtn = c.topProd ? `<button type="button" class="tm-copilot-btn blue" data-cop="postSet" data-pid="${esc(String(c.topProd.id))}">📣 Publicar el top</button>` : '';
      return `<div class="tm-copilot-mini-card" style="margin-top:9px">
        <b>${esc(c.cat)} se ve ${x} más esta semana</b>
        <small>${c.now} interacciones${c.topProd?' · más buscado: '+esc(c.topProd.nombre):''}</small>
        ${c.enRiesgo.length ? `<div style="margin-top:7px;font-size:12px;color:#f5a623">⚠️ Con poco stock: ${c.enRiesgo.map(p=>esc(p.nombre)+' ('+num(p.stock)+')').join(', ')}</div>` : ''}
        <div class="tm-copilot-task-actions" style="margin-top:8px">${c.enRiesgo.length?'<button type="button" class="tm-copilot-btn primary" data-cop="task" data-tab="manage-products">📦 Revisar stock</button>':''}${pubBtn}</div>
      </div>`;
    }).join('')}
  </div>`;
}
/* ══════════ AUTO-PUBLICAR A GRUPOS DE FACEBOOK (semi-automático) ══════════
   El motor ya existe: previsualizarFacebook(pid) abre un modal con el botón
   "Abrir en todos mis grupos" (abre las pestañas + copia el texto; tú pegas y
   publicas). Acá el agente lo PROPONE con el producto de hoy en un toque. */
function fbGrupos(){ try{ return JSON.parse(localStorage.getItem('gruposFB')||'[]').filter(g=>g&&g.url&&String(g.url).includes('facebook.com')); }catch(e){ return []; } }
function renderFacebookGrupos(){
  const gs = fbGrupos();
  if(!gs.length){
    return `<div class="tm-copilot-smart" style="border-color:rgba(59,89,152,.45)"><h4>📘 Grupos de Facebook</h4>
      <small>Guarda tus grupos una vez y el agente publica ahí con un toque: abre todas las pestañas y copia el texto — tú solo pegas y publicas.</small>
      <div class="tm-copilot-task-actions" style="margin-top:9px"><button type="button" class="tm-copilot-btn primary" data-cop="task" data-tab="publicacion">➕ Configurar grupos</button></div>
    </div>`;
  }
  const cands = postCandidatos();
  const p = cands.length ? cands[0].p : null;
  return `<div class="tm-copilot-smart" style="border-color:rgba(59,89,152,.5)"><h4>📘 Publicar en tus grupos de Facebook</h4>
    <small>Tienes ${gs.length} grupo${gs.length>1?'s':''} guardado${gs.length>1?'s':''}. Publica el producto de hoy en todos con un toque.</small>
    ${p?`<div class="tm-copilot-mini-card" style="margin-top:9px">
      <b>${esc(p.nombre)}</b><small>$${num(p.precioActual).toFixed(2)} · stock ${num(p.stock)}</small>
      <div class="tm-copilot-task-actions" style="margin-top:9px">
        <button type="button" class="tm-copilot-btn primary" data-cop="postGrupos" data-pid="${esc(String(p.id))}">📢 Publicar en mis ${gs.length} grupo${gs.length>1?'s':''}</button>
        <button type="button" class="tm-copilot-btn" data-cop="task" data-tab="publicacion">⚙️ Grupos</button>
      </div></div>`:'<small style="display:block;margin-top:8px">Agrega productos con stock para publicar.</small>'}
  </div>`;
}
/* ══════════ POST LISTO: "publica esto hoy" (texto + hashtags + 1 toque) ══════════
   El agente elige un producto para publicar hoy (interés real + stock + foto,
   evitando lo que ya publicaste hace poco) y arma la publicación lista.
   Compartir reutiliza los generadores reales del admin (pubShareAct): la imagen
   de Estado 1080×1920, Facebook con tus grupos y WhatsApp. */
function postLog(){ try{ return JSON.parse(localStorage.getItem('tm_post_log')||'{}'); }catch(e){ return {}; } }
function postMarcarPublicado(pid){ const l=postLog(); l[String(pid)]=Date.now(); localStorage.setItem('tm_post_log', JSON.stringify(l)); }
function postHashtags(p){
  const limpio = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]/g,'');
  const tags = ['#TiendaMax','#Cuba','#OfertasCuba'];
  const cat = limpio(p.categoria); if(cat) tags.push('#'+cat);
  const n = String(p.nombre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(/wifi|router|inalamb|repetidor|internet/.test(n)) tags.push('#WiFi','#InternetCuba');
  if(/solar|inversor|bateria|energ|panel|apagon/.test(n)) tags.push('#EnergiaSolar','#Apagones');
  if(/camara|segur|cctv|vigilan/.test(n)) tags.push('#Seguridad','#Camaras');
  if(/cel|telefono|phone|movil/.test(n)) tags.push('#Celulares');
  if(/audif|auricular|parlant|bocina|speaker|tws/.test(n)) tags.push('#Audio');
  tags.push('#EnvioCuba');
  return [...new Set(tags)].slice(0,8).join(' ');
}
function postTexto(p){
  const precio = num(p.precioActual), ic = iconFor(p);
  const desc = String(p.descripcion||'').trim();
  return `${ic} ${p.nombre} — ¡Disponible en TiendaMax!\n\n`+
    `💵 $${precio.toFixed(2)} USD`+ (num(p.stock)>0?`   ·   📦 Quedan ${num(p.stock)}`:'') + `\n`+
    (desc? `\n${desc.slice(0,170)}\n`:'')+
    `\n📲 Escríbenos por WhatsApp y te lo reservamos.\n🌐 tiendamax.org\n\n${postHashtags(p)}`;
}
function postCandidatos(){
  const ps = products().filter(p=>num(p.stock)>0 && p.activo!==false);
  if(!ps.length) return [];
  const log = postLog();
  const hotScore = {}; (state.hot||[]).forEach(x=>{ hotScore[String(x.p.id)] = x.score||0; });
  const ahora = Date.now();
  return ps.map(p=>{
    const id = String(p.id);
    const last = log[id]||0;
    const dias = last ? (ahora-last)/864e5 : 999;
    let s = 0;
    s += (hotScore[id]||0)*2;                 // interés real (vistas/WhatsApp)
    s += Math.min(num(p.stock),20)*0.4;       // algo de stock para vender
    if(p.imagen) s += 6;                       // con foto se ve mejor
    if(String(p.descripcion||'').length>40) s += 2;
    if(dias<3) s -= 100;                        // recién publicado: evitar repetir
    else if(dias<7) s -= 25;
    else if(dias>30) s += 8;                    // hace rato que no sale
    return {p, s, dias, hot:(hotScore[id]||0)>0};
  }).sort((a,b)=>b.s-a.s);
}
function renderPostListo(){
  const cands = postCandidatos();
  if(!cands.length) return '';
  let idx = ((state.postIdx||0)%cands.length + cands.length)%cands.length;
  if(state.postForcePid){ const fi=cands.findIndex(c=>String(c.p.id)===String(state.postForcePid)); if(fi>=0) idx=fi; }
  const c = cands[idx], p = c.p;
  const motivo = c.hot ? 'tiene interés esta semana' : c.dias>30 ? 'hace rato no lo publicas' : 'buen stock y foto lista';
  return `<div class="tm-copilot-smart" style="border-color:rgba(37,211,102,.45)">
    <h4>📣 Publica esto hoy</h4>
    <div class="tm-copilot-mini-card" style="margin-top:8px">
      <div style="display:flex;gap:10px;align-items:center">
        ${p.imagen?`<img src="${esc(p.imagen)}" style="width:54px;height:54px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`:''}
        <div style="min-width:0"><b>${esc(p.nombre)}</b><small>$${num(p.precioActual).toFixed(2)} · stock ${num(p.stock)} · ${esc(motivo)}</small></div>
      </div>
      <div class="tm-copilot-code" style="margin-top:9px;white-space:pre-wrap">${esc(postTexto(p))}</div>
      <div class="tm-copilot-task-actions" style="margin-top:9px">
        <button type="button" class="tm-copilot-btn primary" data-cop="postEstado" data-pid="${esc(String(p.id))}">🖼️ Estado + imagen</button>
        <button type="button" class="tm-copilot-btn green" data-cop="postFace" data-pid="${esc(String(p.id))}">📘 Facebook</button>
        <button type="button" class="tm-copilot-btn blue" data-cop="postWhats" data-pid="${esc(String(p.id))}">💬 WhatsApp</button>
      </div>
      <div class="tm-copilot-task-actions" style="margin-top:7px">
        <button type="button" class="tm-copilot-btn" data-cop="postCopy" data-pid="${esc(String(p.id))}">📋 Copiar texto</button>
        <button type="button" class="tm-copilot-btn" data-cop="postOtro">🔄 Otro producto</button>
      </div>
    </div>
  </div>`;
}
function renderToday(topTasks){
  return `${reporteNocturnoHTML()}${renderPostListo()}<div class="tm-copilot-smart"><h4>🧠 Estrategia de hoy</h4><ul>${dailyStrategy().map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="tm-copilot-task-actions"><button type="button" class="tm-copilot-btn gold" data-cop="saveStrategy">Guardar campaña</button><button type="button" class="tm-copilot-btn blue" data-cop="view" data-view="marketing">Ver marketing</button></div></div>
  <div class="tm-copilot-list">${topTasks.length ? topTasks.map(t=>taskHtml(t)).join('') : '<div class="tm-copilot-empty">✅ Sin tareas urgentes. Puedes revisar productos o publicar novedades.</div>'}</div>`;
}
function renderAgents(){
  return `${state.agents && state.agents.length ? `<div class="tm-copilot-agents">${state.agents.map(a=>`<div class="tm-copilot-agent ${a.critical?'crit':''}"><b>${a.icon} ${esc(a.name)}</b><small>${esc(a.goal)}<br>${esc(a.hint)}</small><span class="st">${esc(a.status)} · ${a.count}</span></div>`).join('')}</div>` : ''}
  ${state.hot && state.hot.length ? `<div class="tm-copilot-hot">${state.hot.map(x=>`<div class="tm-copilot-hot-card"><b>${iconFor(x.p)} ${esc(x.p.nombre)}</b><small>${x.views} vistas · ${x.wa} WhatsApp · stock ${num(x.p.stock)}</small><span class="tm-copilot-chip">score ${x.score}</span></div>`).join('')}</div>` : '<div class="tm-copilot-empty">Sin productos calientes medibles todavía.</div>'}`;
}
// Push inteligente: productos con interés (vistas/WhatsApp) o interesados que
// no cierran venta → sugiere mandar un push con % de descuento a los suscriptores.
function pushCandidatos(){
  const hot = state.hot || [];
  const out = [];
  hot.forEach(x=>{
    const p = x.p; if(num(p.stock)<=0) return;
    let motivo=null, desc=0;
    if(x.views>=15 && x.wa===0){ motivo=`${x.views} vistas y 0 pedidos por WhatsApp`; desc=10; }
    else if(x.views>=25 && x.wa<=1){ motivo=`${x.views} vistas pero solo ${x.wa} WhatsApp`; desc=8; }
    else if(x.wa>=3){ motivo=`${x.wa} personas preguntaron por WhatsApp`; desc=5; }
    if(motivo) out.push({p, motivo, desc, views:x.views, wa:x.wa});
  });
  return out.slice(0,5);
}
function renderPushSmart(){
  const cands = pushCandidatos();
  if(!cands.length) return `<div class="tm-copilot-smart"><h4>📣 Push inteligente</h4><small>Sin candidatos claros todavía. Aparecen productos con muchas vistas y pocas ventas cuando haya datos de interés.</small></div>`;
  return `<div class="tm-copilot-smart"><h4>📣 Push inteligente</h4><small>El agente vio interés sin venta. Manda un aviso con descuento a tus suscriptores en un toque.</small>
    ${cands.map(c=>`<div class="tm-copilot-mini-card" style="margin-top:9px">
      <b>${esc(c.p.nombre)}</b>
      <small>${esc(c.motivo)} · stock ${num(c.p.stock)}</small>
      <div class="tm-copilot-task-actions" style="margin-top:9px">
        <button type="button" class="tm-copilot-btn primary" data-cop="smartPush" data-pid="${esc(String(c.p.id))}" data-desc="${c.desc}">📲 Push −${c.desc}%</button>
        <button type="button" class="tm-copilot-btn" data-cop="smartPush" data-pid="${esc(String(c.p.id))}" data-desc="0">📲 Sin descuento</button>
      </div>
    </div>`).join('')}
  </div>`;
}
function renderMarketing(){
  const r=ranking(), bundles=suggestedBundles(), responses=responseTemplates();
  return `${renderTendencias()}${renderFacebookGrupos()}${renderPushSmart()}<div class="tm-copilot-mini">
    <div class="tm-copilot-mini-card"><b>🏆 Top para impulsar</b>${r.top.slice(0,4).map((x,i)=>`<div class="tm-copilot-rank-row"><span>${i+1}. ${esc(x.p.nombre)}</span><em>${x.score}</em></div>`).join('')||'<small>Sin datos suficientes</small>'}</div>
    <div class="tm-copilot-mini-card"><b>⚠️ Atención</b>${r.attention.slice(0,4).map(x=>`<div class="tm-copilot-rank-row"><span>${esc(x.p.nombre)}</span><em>${esc(x.reasons.join(', '))}</em></div>`).join('')||'<small>Catálogo estable</small>'}</div>
  </div>
  <div class="tm-copilot-smart"><h4>🎁 Bundles sugeridos</h4>${bundles.map(b=>`<div class="tm-copilot-mini-card" style="margin-bottom:7px"><b>${esc(b.a.nombre)} + ${esc(b.b.nombre)}</b><small>${esc(b.why)} · Total: ${money(b.total)} USD</small></div>`).join('')||'<small>No hay combinaciones suficientes con stock.</small>'}</div>
  <div class="tm-copilot-smart"><h4>💬 Respuestas humanas listas</h4>${responses.map((txt,i)=>`<div class="tm-copilot-code">${esc(txt)}</div><button type="button" class="tm-copilot-btn" data-cop="copy" data-text="${esc(txt)}">Copiar respuesta ${i+1}</button>`).join('')}</div>`;
}
function renderMemory(){
  const m=memory(), actions=Array.isArray(m.actions)?m.actions:[], productsCount=m.products||{};
  const top=Object.entries(productsCount).sort((a,b)=>b[1]-a[1])[0];
  // "Lo que funcionó": productos que VENDIERON tras un empujón (push/oferta)
  const winCount = m.winCount || {};
  const ganadores = Object.entries(winCount).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const wins = Array.isArray(m.wins)?m.wins:[];
  const aprendido = `<div class="tm-copilot-smart" style="border-color:rgba(37,211,102,.4)"><h4>🏆 Lo que te funcionó</h4>
    ${ganadores.length
      ? '<small>Vendieron después de un empujón. Repite lo que ya vende:</small>'+ganadores.map(([nm,n])=>`<div class="tm-copilot-rank-row"><span>${esc(nm)}</span><em>${n} venta(s) tras empujón</em></div>`).join('')
        + (wins[0]?`<div class="tm-copilot-task-actions" style="margin-top:9px"><button type="button" class="tm-copilot-btn primary" data-cop="smartPush" data-pid="${esc(String(wins[0].pid||''))}" data-desc="${num(wins[0].desc)||8}">📲 Repetir push del top</button></div>`:'')
      : '<small>Aún sin datos. Cuando mandes un push u oferta y ese producto se venda, lo registro aquí para que repitas lo que funciona.</small>'}
  </div>`;
  return `${aprendido}
  <div class="tm-copilot-smart"><h4>🧠 Memoria del agente</h4><ul><li>Ventas tras empujón: ${wins.length}</li><li>Producto más impulsado: ${top?esc(top[0])+' ('+top[1]+' veces)':'aún sin datos'}</li><li>Última acción: ${m.last?esc(_empLabel(m.last.type))+' · '+ago(m.last.ts):'sin acciones registradas'}</li></ul></div>
  <div class="tm-copilot-smart"><h4>Historial reciente</h4>${actions.slice(0,8).map(a=>`<div class="tm-copilot-rank-row"><span>${esc(_empLabel(a.type))} ${a.productName?'· '+esc(a.productName):''}</span><em>${ago(a.ts)}</em></div>`).join('')||'<div class="tm-copilot-empty">El agente aprenderá cuando guardes campañas o marques acciones.</div>'}</div>`;
}
// ── PROMO ─────────────────────────────────────────────────────────
function promoParseChips(text) {
  return text.split(/[|\n]/).map(s => s.trim()).filter(Boolean).slice(0, 9);
}
// ── Helpers del Cartel Pro (mapeo producto → cartel) ──
function _cStrip(s){ return String(s==null?'':s).replace(/^[\s​]*(?:[\p{Extended_Pictographic}☀-➿️‍]+\s*)+/u,'').trim(); }
function _cClip(s,n){ s=String(s==null?'':s).trim(); return s.length<=n ? s : s.slice(0,n).replace(/\s+\S*$/,'')+'…'; }
function _cSplitTitle(name){
  name = _cStrip(name).toUpperCase().replace(/\([^)]*\)/g,'').trim();
  const stop = ['DE','LA','EL','LOS','LAS','Y','CON','PARA','DEL','UN','UNA','A'];
  const w = name.split(/\s+/).filter(x=>x.length>1 && !stop.includes(x));
  return [w[0]||'PRODUCTO', w[1]||''];
}
function _cTitleFont(a,b){ const m=Math.max((a||'').length,(b||'').length); return m>10?50:m>8?62:m>6?72:82; }
function _cFirstSentence(desc){ return _cClip(String(desc==null?'':desc).replace(/​/g,'').split(/\.\s|\n/)[0].trim(),68); }
function _cFeatures(desc, specs){
  const out=[]; const lines=String(desc==null?'':desc).split('\n').map(l=>l.replace(/​/g,'').trim()).filter(Boolean);
  let inF=false;
  for(const l of lines){
    if(/ficha t[eé]cnica/i.test(l)){ inF=true; continue; }
    if(/especificaciones|\bspecs\b/i.test(l)){ if(inF) break; }
    if(!inF) continue;
    const m=l.match(/^([^:]{2,40}):\s*(.+)$/);
    if(m){ const em=(m[2].match(/^[\p{Extended_Pictographic}️‍]+/u)||[''])[0]||'🔹'; out.push({icon:em, title:_cStrip(m[1]).toUpperCase(), desc:_cStrip(m[2])}); }
    if(out.length>=4) break;
  }
  if(!out.length && Array.isArray(specs)){
    specs.slice(0,4).forEach(s=>{ const raw=String(s).replace(/​/g,'').trim(); const em=(raw.match(/[\p{Extended_Pictographic}️‍]+/u)||['🔹'])[0]; const txt=_cStrip(raw); const c=txt.indexOf(':'); out.push(c>0?{icon:em,title:txt.slice(0,c).toUpperCase(),desc:txt.slice(c+1).trim()}:{icon:em,title:_cClip(txt,22).toUpperCase(),desc:''}); });
  }
  // Fallback: si no hay ficha técnica ni specs, saca hasta 4 features de las
  // frases de la descripción (así el cartel nunca queda con la columna vacía).
  if(!out.length){
    const icons=['⚡','✅','🔋','📦','🔌','🛡️'];
    const clean = String(desc==null?'':desc).replace(/​/g,'').replace(/ficha t[eé]cnica[\s\S]*/i,'').trim();
    const frases = clean.split(/[.,;:]\s+/).map(s=>_cStrip(s).trim()).filter(s=>s.length>=10 && s.length<=44);
    frases.slice(0,4).forEach((f,i)=>{ out.push({icon:icons[i%icons.length], title:_cClip(f,30).toUpperCase(), desc:''}); });
  }
  return out;
}
// Mapea un producto del catálogo a los campos del Cartel Pro.
function _cartelDataFromProduct(p){
  const [w1,w2] = _cSplitTitle(p.nombre);
  const disc = parseFloat(p.precioOriginal) > 0 && parseFloat(p.precioOriginal) > parseFloat(p.precioActual);
  return {
    _productoId: String(p.id||''), nombre: p.nombre||'', categoria: p.categoria||'', descripcion: p.descripcion||'', _specs: p.specs,
    title1: w1, title2: w2, tag: (p.categoria||'DESTACADO').toUpperCase(), tagline: _cFirstSentence(p.descripcion),
    precio: String(p.precioActual||''), precioAnterior: disc ? String(p.precioOriginal) : '', moneda: 'USD',
    stock: String(p.stock||''), masVendido: !!p.masVendido,
    imgUrl: (Array.isArray(p.imagenes)&&p.imagenes[0]) || p.imagen || ''
  };
}
// Expuesto para que el modal "🟢 Estado WhatsApp" (revolico_integration.js)
// use el MISMO diseño de cartel que el generador del copiloto.
window.tmCartelHTML = function(p){ try{ injectStyles(); return _cartelHTML(_cartelDataFromProduct(p)); }catch(e){ console.error('[cartel]',e); return ''; } };

// Recorta el fondo blanco de una foto (estudio) → PNG transparente, para que
// el producto quede "flotando" integrado en el cartel oscuro. Si la imagen es
// cross-origin sin CORS (canvas contaminado) devuelve la URL original intacta.
function _tmKnockoutWhiteURL(url){
  return new Promise(function(resolve){
    var img=new Image(); img.crossOrigin='anonymous';
    img.onload=function(){
      try{
        var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
        if(!w||!h){ resolve(url); return; }
        var c=document.createElement('canvas'); c.width=w; c.height=h;
        var cx=c.getContext('2d'); cx.drawImage(img,0,0);
        var im=cx.getImageData(0,0,w,h), a=im.data;
        for(var i=0;i<a.length;i+=4){
          var r=a[i],g=a[i+1],b=a[i+2];
          if(r>240&&g>240&&b>240){ a[i+3]=0; }               // blanco puro → transparente
          else if(r>216&&g>216&&b>216){                        // borde casi-blanco → semitransparente
            var m=Math.min(r,g,b), al=Math.round((240-m)*255/24);
            if(al<a[i+3]) a[i+3]=al;
          }
        }
        cx.putImageData(im,0,0);
        resolve(c.toDataURL('image/png'));
      }catch(e){ resolve(url); }   // canvas tainted → sin recorte
    };
    img.onerror=function(){ resolve(url); };
    img.src=url;
  });
}
// Sustituye la foto del producto del cartel por su versión recortada. Llamar
// tras poner el innerHTML del cartel y ANTES de html2canvas.
window.tmKnockoutCartel = async function(node){
  try{
    var im=node && node.querySelector('.tcp-img img'); if(!im) return;
    var src=im.getAttribute('src')||im.src; if(!src) return;
    var out=await _tmKnockoutWhiteURL(src);
    if(out && out!==src){ await new Promise(function(r){ im.onload=r; im.onerror=r; im.src=out; setTimeout(r,4000); }); }
  }catch(e){}
};
function promoSetProduct(id) {
  const p = products().find(x => String(x.id) === String(id));
  if (!p) return;
  Object.assign(promoData, _cartelDataFromProduct(p));
  const map = { tmPromoTitle1:'title1', tmPromoTitle2:'title2', tmPromoTag:'tag', tmPromoTagline:'tagline', tmPromoPrecio:'precio', tmPromoPrecioAnt:'precioAnterior', tmPromoStock:'stock' };
  Object.entries(map).forEach(([elId, key]) => { const el = document.getElementById(elId); if(el) el.value = promoData[key]||''; });
  promoScheduleDraw();
}
function promoWrapText(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function promoRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
async function promoLoadLogo() {
  if (promoData._logoEl) return promoData._logoEl;
  return new Promise(resolve => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { promoData._logoEl = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = '/iconos/icon-192.png';
  });
}
function promoDrawBagBg(ctx, W, H, accent, textColor) {
  const bagW = W * 0.78, bH = bagW * 1.18;
  const cx = W * 0.72, cy = H * 0.54;
  const bx = cx - bagW / 2, by = cy - bH / 2;
  ctx.save();
  ctx.globalAlpha = 0.07;
  const hcx1 = bx + bagW * 0.3, hcx2 = bx + bagW * 0.7;
  const hcy = by + bagW * 0.06, hrx = bagW * 0.11, hry = bagW * 0.22;
  ctx.lineWidth = bagW * 0.065; ctx.lineCap = 'round'; ctx.strokeStyle = accent;
  [hcx1, hcx2].forEach(hx => {
    ctx.beginPath(); ctx.ellipse(hx, hcy, hrx, hry, 0, Math.PI, 0, false); ctx.stroke();
  });
  promoRoundRect(ctx, bx, by + bagW * 0.14, bagW, bH * 0.86, bagW * 0.072);
  ctx.fillStyle = accent; ctx.fill();
  ctx.globalAlpha = 0.10;
  ctx.font = `900 ${bagW * 0.55}px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.fillText('M', cx, by + bagW * 0.14 + bH * 0.86 * 0.52);
  ctx.restore();
}
function promoDrawChips(ctx, chips, startX, startY, maxW, accent, isDark) {
  if (!chips.length) return startY;
  const fs = 32, padX = 26, padY = 16, chipH = fs + padY * 2, gap = 14;
  ctx.font = `600 ${fs}px Arial, sans-serif`;
  let x = startX, y = startY;
  chips.forEach(chip => {
    const cw = ctx.measureText(chip).width + padX * 2;
    if (x + cw > startX + maxW && x > startX) { x = startX; y += chipH + gap; }
    promoRoundRect(ctx, x, y, cw, chipH, chipH / 2);
    ctx.fillStyle = isDark ? 'rgba(18,8,2,0.88)' : 'rgba(35,12,0,0.85)'; ctx.fill();
    promoRoundRect(ctx, x, y, cw, chipH, chipH / 2);
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.92)' : '#fff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(chip, x + padX, y + chipH / 2);
    x += cw + gap;
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  return y + chipH;
}
function _cartelHTML(d){
  const w1=d.title1||'PRODUCTO', w2=d.title2||'';
  const tf=_cTitleFont(w1,w2);
  const feats=_cFeatures(d.descripcion, d._specs);
  const hasDisc=parseFloat(d.precioAnterior)>0 && parseFloat(d.precioAnterior)>parseFloat(d.precio);
  const pct=hasDisc?Math.round((1-parseFloat(d.precio)/parseFloat(d.precioAnterior))*100):0;
  const st=Number(d.stock||0), moneda=d.moneda||'USD';
  const trust=[['🚚','ENVÍO RÁPIDO','A todo el país'],['🛡️','COMPRA SEGURA','Protegemos tu compra'],['🏅','GARANTÍA','Calidad que te respalda']];
  const featHtml=feats.map(f=>`<div class="tcp-feat"><div class="tcp-feat-ic">${f.icon}</div><div><div class="tcp-feat-t">${esc(_cClip(f.title,22))}</div><div class="tcp-feat-d">${esc(_cClip(f.desc,42))}</div></div></div>`).join('');
  const trustHtml=trust.map(t=>`<div class="tcp-trust"><div class="tcp-trust-ic">${t[0]}</div><div><div class="tcp-trust-t">${t[1]}</div><div class="tcp-trust-d">${t[2]}</div></div></div>`).join('');
  const pills=[`<div class="tcp-pill"><span>📦</span> Stock: ${st}</div>`, (st>0&&st<=3)?`<div class="tcp-pill"><span>🔥</span> ÚLTIMOS</div>`:`<div class="tcp-pill"><span>✅</span> DISPONIBLE</div>`].join('');
  const imgUrl=d.imgUrl||'';
  return `<div class="tcp-bg"></div><div class="tcp-glow"></div>`
    +`<span class="tcp-spark" style="top:20%;right:30%"></span><span class="tcp-spark" style="top:25%;right:15%;width:3px;height:3px"></span><span class="tcp-spark" style="bottom:35%;right:20%;width:5px;height:5px"></span><span class="tcp-spark" style="bottom:30%;left:18%;width:3px;height:3px"></span><span class="tcp-spark" style="top:30%;left:22%"></span>`
    +`<div class="tcp-header"><img class="tcp-logo-img" src="/iconos/icon-512.png" alt="TiendaMax"><div class="tcp-logo-txt">Tienda<em>Max</em></div></div>`
    +`<div class="tcp-tag">${esc(_cClip(d.tag||'DESTACADO',18))}</div>`
    +`<div class="tcp-title"><div class="tcp-t1" style="font-size:${tf}px">${esc(w1)}</div>${w2?`<div class="tcp-t2" style="font-size:${tf}px">${esc(w2)}</div>`:''}</div>`
    +`<div class="tcp-tagline">${esc(d.tagline||'')}</div>`
    +(hasDisc?`<div class="tcp-hex"><div class="tcp-hex-b">⚡</div><div class="tcp-hex-n">-${pct}%</div><div class="tcp-hex-l">OFERTA</div></div>`:'')
    +`<div class="tcp-img">${imgUrl?`<img src="${esc(imgUrl)}" crossorigin="anonymous">`:'<div style="color:#555;font-size:14px">📷</div>'}</div>`
    +(featHtml?`<div class="tcp-feats">${featHtml}</div>`:'')
    +`<div class="tcp-trusts">${trustHtml}</div>`
    +`<div class="tcp-price"><div class="tcp-price-m"><div class="tcp-price-n">$${esc(String(Math.round(parseFloat(d.precio)||0)))}</div><div class="tcp-price-c">${esc(moneda)}</div></div><div class="tcp-price-s">${hasDisc?`<del>$${esc(String(Math.round(parseFloat(d.precioAnterior))))}</del><strong>AHORRA</strong>`:`<strong>CONTRA</strong><span>entrega</span>`}</div></div>`
    +`<div class="tcp-stock">${pills}</div>`
    +`<div class="tcp-cta"><div class="tcp-cta-l"><div class="tcp-wa">💬</div><div class="tcp-cta-t"><span class="s">PÍDELO DIRECTO POR</span><span class="b">WHATSAPP</span><span class="s">EN TIENDAMAX</span></div></div><div class="tcp-arrow">›</div></div>`
    +`<div class="tcp-footer"><div class="tcp-dom">🌐 tiendamax.org</div><div class="tcp-hint">Toca "Pedir" en la tienda para reservar</div></div>`;
}
async function drawPromo() {
  const node = document.getElementById('tmCartelPro');
  if (!node) return;
  node.innerHTML = _cartelHTML(promoData);
}
async function promoDescargarCartel(btn){
  const node = document.getElementById('tmCartelPro');
  if (!node) { toast('Abre el generador de cartel primero'); return; }
  if (typeof window.html2canvas !== 'function') { toast('No cargó html2canvas — recarga la página'); return; }
  const original = btn ? btn.textContent : '';
  if (btn) { btn.textContent = '⏳ Generando…'; btn.style.pointerEvents='none'; }
  try {
    // Espera a que TODAS las imágenes (logo + foto del producto) carguen.
    await Promise.all([...node.querySelectorAll('img')].map(im => im.complete ? null : new Promise(r=>{ im.onload=r; im.onerror=r; setTimeout(r,4000); })));
    if(window.tmKnockoutCartel) await window.tmKnockoutCartel(node);   // recorta el fondo blanco de la foto
    const canvas = await window.html2canvas(node, { backgroundColor:'#000', scale:2, useCORS:true, allowTaint:false, logging:false, width:node.offsetWidth, height:node.offsetHeight });
    const link = document.createElement('a');
    link.download = 'cartel-tiendamax-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    try{ remember('promo_download', { productName: promoData.nombre }); }catch(_e){}
    toast('Cartel descargado — súbelo a tu Estado de WhatsApp');
  } catch(e) {
    console.error('[cartel]', e);
    toast('No pude generar el cartel: ' + (e && e.message || e));
  } finally {
    if (btn) { btn.textContent = original; btn.style.pointerEvents=''; }
  }
}
function promoScheduleDraw() { clearTimeout(promoData._drawTimer); promoData._drawTimer = setTimeout(drawPromo, 100); }
function addPromoListeners() {
  const fields = { tmPromoTitle1:'title1', tmPromoTitle2:'title2', tmPromoTag:'tag', tmPromoTagline:'tagline', tmPromoPrecio:'precio', tmPromoPrecioAnt:'precioAnterior', tmPromoStock:'stock', tmPromoMoneda:'moneda' };
  Object.entries(fields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { promoData[key] = el.value; promoScheduleDraw(); });
  });
  const sel = document.getElementById('tmPromoProductoSel');
  if (sel) sel.addEventListener('change', () => { if (sel.value) promoSetProduct(sel.value); });
  const imgInp = document.getElementById('tmPromoImgInput');
  if (imgInp) imgInp.addEventListener('change', () => {
    const file = imgInp.files && imgInp.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      promoData.imgUrl = ev.target.result; drawPromo();
      const btn = document.querySelector('[data-cop="promoPickImg"]');
      if (btn) { btn.textContent = '✅ Foto cargada — Cambiar imagen'; btn.className = btn.className.replace('blue','green'); }
    };
    reader.readAsDataURL(file);
  });
}
function renderPromoImagen() {
  const d = promoData;
  const prods = products();
  const prodOpts = prods.length
    ? prods.map(p => `<option value="${esc(String(p.id))}"${d._productoId===String(p.id)?' selected':''}>${esc(p.nombre||'#'+p.id)}</option>`).join('')
    : '<option value="">— Sin productos —</option>';
  return `<div>
    <div class="tcp-preview-wrap"><div class="tcp-preview-scale"><div class="tcp-card" id="tmCartelPro"></div></div></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
      <div><div style="font-size:11px;color:#888;margin-bottom:4px">Producto del catálogo</div>
        <select class="tm-promo-field" id="tmPromoProductoSel" style="width:100%">
          <option value="">— Elegir producto —</option>
          ${prodOpts}
        </select></div>
      <input type="file" id="tmPromoImgInput" accept="image/*" style="display:none">
      <button type="button" class="tm-copilot-btn ${d.imgUrl?'green':'blue'}" data-cop="promoPickImg" style="width:100%">${d.imgUrl ? '✅ Foto cargada — Cambiar imagen' : '📷 Cambiar foto del producto'}</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Título línea 1</div>
          <input class="tm-promo-field" id="tmPromoTitle1" type="text" placeholder="ROUTER" value="${esc(d.title1)}"></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Título línea 2 (naranja)</div>
          <input class="tm-promo-field" id="tmPromoTitle2" type="text" placeholder="TP-LINK" value="${esc(d.title2)}"></div>
      </div>
      <div><div style="font-size:11px;color:#888;margin-bottom:4px">Etiqueta (pill superior)</div>
        <input class="tm-promo-field" id="tmPromoTag" type="text" placeholder="WIFI" value="${esc(d.tag)}"></div>
      <div><div style="font-size:11px;color:#888;margin-bottom:4px">Frase (bajo el título)</div>
        <input class="tm-promo-field" id="tmPromoTagline" type="text" placeholder="Descripción corta y atractiva" value="${esc(d.tagline)}"></div>
      <div style="display:grid;grid-template-columns:1fr 80px 1fr 1fr;gap:8px">
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Precio</div>
          <input class="tm-promo-field" id="tmPromoPrecio" type="text" placeholder="80" value="${esc(d.precio)}"></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Moneda</div>
          <select class="tm-promo-field" id="tmPromoMoneda">
            <option${d.moneda==='USD'?' selected':''}>USD</option>
            <option${d.moneda==='CUP'?' selected':''}>CUP</option>
            <option${d.moneda==='MLC'?' selected':''}>MLC</option>
          </select></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Precio antes</div>
          <input class="tm-promo-field" id="tmPromoPrecioAnt" type="text" placeholder="opcional" value="${esc(d.precioAnterior||'')}"></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Stock</div>
          <input class="tm-promo-field" id="tmPromoStock" type="text" placeholder="6" value="${esc(d.stock||'')}"></div>
      </div>
      <p style="font-size:11px;color:#888;margin:2px 0 0">Las features, garantías y el CTA se arman solos con los datos del producto. Elige un producto y listo.</p>
      <button type="button" class="tm-copilot-btn primary" data-cop="promoDownload" style="padding:14px;margin-top:4px">⬇️ Descargar cartel (para WhatsApp Estado)</button>
    </div>
  </div>`;
}

window.pubMountPromo = function() {
  const root = document.getElementById('tmPromoAdminRoot');
  if (!root || root.querySelector('#tmCartelPro')) return;
  root.innerHTML = renderPromoImagen();
  setTimeout(() => { addPromoListeners(); drawPromo(); }, 80);
};
// ── FIN PROMO ──────────────────────────────────────────────────────

function renderCopilotView(view, topTasks){
  if(view==='chat') return renderChat();
  if(view==='correcciones') return renderCorreccionesIA();
  if(view==='descripciones') return renderDescripciones();
  if(view==='agentes') return renderAgents();
  if(view==='marketing') return renderMarketing();
  if(view==='memoria') return renderMemory();
  return renderToday(topTasks);
}
function renderSheet(){
  const body = $('#tmCopilotBody'); if(!body) return;
  // El chat se puede re-renderizar por el refreshTimer (cada 90s) mientras
  // el dueño está escribiendo una pregunta sin enviar; sin esto, innerHTML
  // borra lo que llevaba tecleado.
  const _chatInput = body.querySelector('#tmChatInput');
  const _chatDraft = _chatInput ? _chatInput.value : '';
  const _chatFoco = document.activeElement === _chatInput;
  const _chatSel = _chatFoco ? [_chatInput.selectionStart, _chatInput.selectionEnd] : null;
  const m = state.metrics || {};
  const topTasks = state.tasks || [];
  const view = state.view || 'hoy';
  body.innerHTML = `
    <div class="tm-copilot-head"><div class="tm-copilot-face">🤖</div><div class="tm-copilot-title"><b>Copiloto TiendaMax</b><small>${topTasks.length ? 'Te ordené el admin por prioridad de ventas.' : 'Todo se ve tranquilo por ahora.'}</small></div><button type="button" class="tm-copilot-close" data-cop="close">✕</button></div>
    <div class="tm-copilot-summary">
      <div class="tm-copilot-stat"><small>Pendientes</small><b>${topTasks.length}</b></div>
      <div class="tm-copilot-stat"><small>Críticas</small><b>${m.criticas||0}</b></div>
      <div class="tm-copilot-stat"><small>Interesados</small><b>${m.interesados||0}</b></div>
      <div class="tm-copilot-stat"><small>Esperan stock</small><b>${m.avisos||0}</b></div>
    </div>
    <div class="tm-copilot-actions">
      <button type="button" class="tm-copilot-btn primary" data-cop="launchAgents">🚀 Lanzar agentes</button>
      <button type="button" class="tm-copilot-btn green" data-cop="enableAlerts">🔔 Alertas admin</button>
      <button type="button" class="tm-copilot-btn blue" data-cop="openInicio">🏠 Ir a Inicio</button>
      <button type="button" class="tm-copilot-btn gold" data-cop="snooze">😴 Ocultar 2h</button>
    </div>
    ${tabsHtml(view)}
    ${renderCopilotView(view, topTasks)}`;
  // promo canvas is mounted in admin publicacion tab via window.pubMountPromo
  if(_chatDraft){
    const newInput = body.querySelector('#tmChatInput');
    if(newInput){
      newInput.value = _chatDraft;
      if(_chatFoco){ newInput.focus(); newInput.setSelectionRange(_chatSel[0], _chatSel[1]); }
    }
  }
}
function taskHtml(t){
  return `<div class="tm-copilot-task u${t.urgency}" data-id="${esc(t.id)}">
    <div class="tm-copilot-task-top"><div class="tm-copilot-ico">${t.icon}</div><div class="tm-copilot-task-main"><b>${esc(t.title)}</b><small>${esc(t.detail||'')}</small></div></div>
    <div class="tm-copilot-task-actions"><button type="button" class="tm-copilot-btn primary" data-cop="task" data-tab="${esc(t.tab||'inicio')}">${esc(t.action||'Abrir')}</button>${t.kind==='hot' ? '<button type="button" class="tm-copilot-btn blue" data-cop="pushHot" data-pid="'+esc(t.pid)+'">Push</button>' : ''}<button type="button" class="tm-copilot-btn" data-cop="dismiss" data-id="${esc(t.id)}">Hecho</button></div>
  </div>`;
}
async function refresh(open){
  ensureUI();
  await buildTasks();
  cargarReporteNocturno(); // no bloquea; si hay reporte nuevo, avisa al terminar
  if(open) openSheet(); else if($('#tmCopilotSheet')?.classList.contains('show')) renderSheet();
}

// El agente nocturno (GitHub Action) deja agente-reporte.json cada madrugada.
// Al abrir el admin lo leemos y, si es nuevo desde la última vez que lo viste,
// mostramos un aviso "anoche revisé tu catálogo".
let REPORTE_NOCTURNO = null;
async function cargarReporteNocturno(){
  try{
    const r = await fetch('agente-reporte.json?_='+Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const rep = await r.json();
    if(!rep || !rep.generado) return;
    REPORTE_NOCTURNO = rep;
    const visto = localStorage.getItem('tm_reporte_visto') || '';
    const fresco = (Date.now() - Date.parse(rep.generado)) < 36*60*60*1000; // < 36 h
    if(fresco && rep.generado !== visto){
      // Marcar como visto AQUÍ (no solo en el render) para que el aviso salga UNA
      // vez y no se repita en cada refresco de 90 s aunque no abras la pestaña Hoy.
      localStorage.setItem('tm_reporte_visto', rep.generado);
      if($('#tmCopilotSheet')?.classList.contains('show')) renderSheet();
      const n = (rep.urgentes||0);
      toast('🌙 '+rep.resumen + (n?' Toca 🩺 Correcciones para arreglarlo.':''));
    }
  }catch(e){}
}
function reporteNocturnoHTML(){
  const rep = REPORTE_NOCTURNO; if(!rep || !rep.generado) return '';
  if((Date.now() - Date.parse(rep.generado)) >= 36*60*60*1000) return ''; // viejo, no mostrar
  const cuando = (()=>{ try{ return new Date(rep.generado).toLocaleDateString('es-CU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } })();
  localStorage.setItem('tm_reporte_visto', rep.generado);
  return `<div class="tm-copilot-smart" style="border-color:rgba(139,92,246,.4)">
    <h4>🌙 Revisión de anoche <span style="font-weight:600;color:#999;font-size:11px">· ${esc(cuando)}</span></h4>
    <small>${esc(rep.resumen)}</small>
    <div class="tm-copilot-task-actions" style="margin-top:10px">
      <button type="button" class="tm-copilot-btn primary" data-cop="view" data-view="correcciones">🩺 Ver y arreglar</button>
    </div>
  </div>`;
}
function switchTo(tab){
  if (typeof window.switchTab === 'function') window.switchTab(tab);
  closeSheet();
  setTimeout(()=>{ try { document.querySelector('.tm-main')?.scrollTo({top:0,behavior:'smooth'}); } catch(e){} },80);
}
async function queuePushForProduct(pid, opts){
  opts = opts || {};
  const ps = products(); const p = ps.find(x=>String(x.id)===String(pid));
  if(!p){ toast('No encontré el producto.'); return; }

  // Deduplicación: evitar enviar push del mismo producto más de 1 vez cada 8 h
  const COOLDOWN_MS = 8 * 60 * 60 * 1000;
  const pushLog = JSON.parse(localStorage.getItem('tm_push_sent') || '{}');
  const lastSent = pushLog[String(pid)] || 0;
  if (Date.now() - lastSent < COOLDOWN_MS) {
    const horasRestantes = Math.ceil((COOLDOWN_MS - (Date.now() - lastSent)) / 3600000);
    toast(`⚠️ Este producto ya fue notificado hace menos de 8 h. Espera ${horasRestantes} h más para evitar spam.`);
    return;
  }

  const base = await fbBase(); if(!base){ toast('Firebase no configurado.'); return; }

  // Marcar como enviado ANTES del fetch para que un doble click no encole dos veces.
  pushLog[String(pid)] = Date.now();
  localStorage.setItem('tm_push_sent', JSON.stringify(pushLog));

  const reqId = 'req_copilot_' + Date.now();
  const title = opts.title || '🔥 Producto destacado en TiendaMax';
  const body = opts.body || String(p.nombre||'Oferta disponible').slice(0,120);
  const payload = { proof: (localStorage.getItem('tm_auth_hash_v3')||''), title: title.slice(0,100), body: body.slice(0,300), url: '/p/producto-' + p.id + '.html', icon: p.imagen || '/iconos/icon-192.png', image: p.imagen || '', ts: Date.now(), source: 'admin_copilot' };
  try {
    const r = await fetch(base + '/admin_push_requests/' + reqId + '.json', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const ghUser=localStorage.getItem('githubUser'), ghRepo=localStorage.getItem('githubRepo')||'Tiendamax', ghToken=localStorage.getItem('githubToken');
    if(ghUser && ghToken){ fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/actions/workflows/flush-push-queue.yml/dispatches`,{method:'POST',headers:{'Authorization':'token '+ghToken,'Content-Type':'application/json'},body:JSON.stringify({ref:'main'})}).catch(()=>{}); }
    try{ remember('pushHot', {productName:p.nombre, pid:p.id}); }catch(_e){}
    toast('Push agregado a la cola: ' + p.nombre);
  } catch(e) {
    // Si falló, revertir la marca para permitir reintentar
    delete pushLog[String(pid)];
    localStorage.setItem('tm_push_sent', JSON.stringify(pushLog));
    toast('No se pudo crear el push: '+e.message);
  }
}
function maybeBrowserNotify(){
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const crit = state.tasks.filter(t=>t.urgency>=3);
  if (!crit.length) return;
  const last = Number(localStorage.getItem(LS.notify)||0);
  if (Date.now() - last < 60*60*1000) return;
  localStorage.setItem(LS.notify, String(Date.now()));
  try { new Notification('🤖 Copiloto TiendaMax', {body: crit[0].title + (crit.length>1 ? ` (+${crit.length-1} más)` : ''), icon:'/iconos/icon-192.png', tag:'tm-copilot'}); } catch(e) {}
}
async function _sha256hex(s){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(s)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(e){return '';}}
// Registra ESTE teléfono como admin (recibe avisos del servidor). Protegido con PIN.
async function tmActivarAlertaAdmin(){
  try{
    const cfgRaw=localStorage.getItem('firebaseConfig'); if(!cfgRaw){ toast('Configura Firebase primero.'); return; }
    const cfg=JSON.parse(cfgRaw); const url=cfg.databaseURL||('https://'+cfg.projectId+'-default-rtdb.firebaseio.com');
    if('Notification' in window && Notification.permission!=='granted'){ const p=await Notification.requestPermission(); if(p!=='granted'){ toast('Activa las notificaciones para recibir avisos.'); return; } }
    let token=localStorage.getItem('fcmToken');
    if((!token||/^anon_/.test(token)) && typeof window.inicializarFirebaseFCMClient==='function'){ try{ await window.inicializarFirebaseFCMClient(cfg); token=localStorage.getItem('fcmToken'); }catch(e){} }
    if(!token||/^anon_/.test(token)){ toast('No se pudo obtener el token de este teléfono.'); return; }
    const pin=prompt('🔐 PIN de admin (créalo la 1ª vez; luego úsalo para activar tus teléfonos):','');
    if(!pin){ return; }
    const proof=await _sha256hex(pin); if(!proof){ toast('Necesita HTTPS para activarse.'); return; }
    // Crear el PIN si no existe (set-once); si ya existe, falla en silencio y seguimos
    try{ await fetch(url+'/admin_meta/pinHash.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)}); }catch(e){}
    // Registrar este teléfono (la regla de Firebase valida el PIN)
    const r=await fetch(url+'/admin_tokens/'+encodeURIComponent(token)+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,ts:Date.now(),proof:proof,label:(navigator.userAgent||'').slice(0,70)})});
    if(r.ok){ localStorage.setItem('tm_es_admin','1'); toast('✅ Este teléfono recibirá los avisos de administrador.'); }
    else { toast('❌ PIN incorrecto: no se activó este teléfono.'); }
  }catch(e){ toast('No se pudo activar: '+e.message); }
}
window.tmActivarAlertaAdmin=tmActivarAlertaAdmin;
function enableAlerts(){
  tmActivarAlertaAdmin();
}
function bindEvents(){
  // Enter en el chat = enviar
  document.addEventListener('keydown', e=>{
    if(e.key==='Enter' && e.target && e.target.id==='tmChatInput'){ e.preventDefault(); chatEnviar(e.target.value); }
  });
  document.addEventListener('click', e=>{
    const pend = e.target.closest && e.target.closest('#tmBtnPendientes');
    if (pend) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSheet(); return; }
    const el = e.target.closest('[data-cop]'); if(!el) return;
    const act = el.dataset.cop;
    if(act==='close') closeSheet();
    if(act==='refresh') refresh(true);
    if(act==='launchAgents') refresh(true).then(()=>toast('Agentes ejecutados: inventario, CRM, marketing, SEO y sistema')); 
    if(act==='view'){ state.view=el.dataset.view||'hoy'; localStorage.setItem(LS.view,state.view); renderSheet(); }
    if(act==='copy') copyText(el.dataset.text||'', 'Respuesta');
    if(act==='saveStrategy') saveCampaignDraft();
    if(act==='enableAlerts') enableAlerts();
    if(act==='openInicio') switchTo('inicio');
    if(act==='snooze'){ localStorage.setItem(LS.snooze, String(Date.now()+2*60*60*1000)); closeSheet(); toast('Copiloto oculto por 2 horas'); }
    if(act==='task'){
      // 'publicar-ahora' no es una pestaña: dispara la publicación real a la tienda.
      if(el.dataset.tab==='publicar-ahora'){
        closeSheet();
        if(typeof window.sincronizarTodoConGitHub==='function'){ try{ window.sincronizarTodoConGitHub(); }catch(e){ toast('No pude iniciar la publicación.'); } }
        else { toast('No pude iniciar la publicación.'); }
      } else {
        switchTo(el.dataset.tab || 'inicio');
      }
    }
    if(act==='dismiss') { const set=dismissedSet(); set.add(el.dataset.id); saveDismissed(set); state.tasks = state.tasks.filter(t=>t.id!==el.dataset.id); updateBubble(); renderSheet(); }
    if(act==='pushHot') queuePushForProduct(el.dataset.pid);
    if(act==='smartPush'){
      const p=products().find(x=>String(x.id)===String(el.dataset.pid)); if(!p){ toast('No encontré el producto.'); return; }
      const desc=num(el.dataset.desc);
      const precio=num(p.precioActual);
      let title, body;
      if(desc>0){
        const nuevo=Math.max(1, Math.round(precio*(1-desc/100)));
        title='🔥 '+String(p.nombre).slice(0,60)+' con '+desc+'% OFF';
        body='Solo por hoy: '+String(p.nombre).slice(0,60)+' a $'+nuevo+' (antes $'+Math.round(precio)+'). ¡Escríbenos por WhatsApp!';
      } else {
        title='✨ '+String(p.nombre).slice(0,70);
        body=String(p.nombre).slice(0,60)+' disponible en TiendaMax. Escríbenos por WhatsApp y te lo reservamos.';
      }
      if(!confirm('¿Mandar push de "'+p.nombre+'"'+(desc>0?(' con '+desc+'% de descuento'):'')+' a tus suscriptores?')) return;
      queuePushForProduct(el.dataset.pid, {title, body});
      remember && remember('smart_push', {productName:p.nombre, pid:p.id, desc});
    }
    if(act==='postSet'){ state.postForcePid=el.dataset.pid; state.view='hoy'; localStorage.setItem(LS.view,'hoy'); renderSheet(); toast('📣 Te preparé la publicación en ✅ Hoy'); }
    if(act==='postGrupos'){
      const pid=el.dataset.pid;
      const p=products().find(x=>String(x.id)===String(pid));
      postMarcarPublicado(pid);
      try{ remember('post_ready',{productName:p&&p.nombre, pid}); }catch(_e){}
      if(typeof window.previsualizarFacebook==='function'){ closeSheet(); window.previsualizarFacebook(pid, null); }
      else if(typeof window.pubShareAct==='function'){ window.pubShareAct(pid,'fb'); }
      else if(p){ window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent('https://tiendamax.org/p/producto-'+pid+'.html')+'&quote='+encodeURIComponent(postTexto(p)),'_blank','noopener'); }
    }
    if(act==='postOtro'){ state.postForcePid=null; state.postIdx=(state.postIdx||0)+1; renderSheet(); }
    if(act==='postCopy'){ const p=products().find(x=>String(x.id)===String(el.dataset.pid)); if(p) copyText(postTexto(p),'Publicación'); }
    if(act==='postEstado'||act==='postWhats'||act==='postFace'){
      const pid=el.dataset.pid;
      const p=products().find(x=>String(x.id)===String(pid));
      const canal={postEstado:'story',postWhats:'wa',postFace:'fb'}[act];
      postMarcarPublicado(pid);
      try{ remember('post_ready',{productName:p&&p.nombre, pid}); }catch(_e){}
      if(typeof window.pubShareAct==='function'){ window.pubShareAct(pid, canal); }
      else if(p){
        if(act==='postFace'){ window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent('https://tiendamax.org/p/producto-'+pid+'.html')+'&quote='+encodeURIComponent(postTexto(p)),'_blank','noopener'); }
        else { window.open('https://wa.me/?text='+encodeURIComponent(postTexto(p)),'_blank','noopener'); }
      }
      // avanza al siguiente candidato para la próxima vez que abras el panel
      state.postIdx=(state.postIdx||0)+1;
      if(state.view==='hoy'){ setTimeout(renderSheet, 400); }
    }
    if(act==='iaRescan'){ state.view='correcciones'; renderSheet(); toast('🔍 Catálogo re-analizado'); }
    if(act==='iaUrgentes') iaAplicarUrgentes();
    if(act==='iaBulkNombres') iaNormalizarBulk();
    if(act==='iaFirebase') iaSyncFirebase();
    if(act==='iaCSV') iaExportCSV();
    if(act==='iaApply'){ const iss=iaScan().find(x=>x.key===el.dataset.key); if(iss&&iaAplicar(iss)){ iaPersistir('✅ '+iss.fixLabel); } state.view='correcciones'; renderSheet(); }
    if(act==='iaDismiss'){ iaDismiss(el.dataset.key); state.view='correcciones'; renderSheet(); }
    if(act==='iaUndo') iaDeshacer();
    if(act==='chatSend'){ const inp=$('#tmChatInput'); if(inp){ chatEnviar(inp.value); } }
    if(act==='chatSug'){ chatEnviar(el.dataset.q); }
    if(act==='chatClear'){ CHAT_HIST=[]; renderSheet(); }
    if(act==='iaDescIA') iaDescripcionesConIA();
    if(act==='iaAnalizarUno') iaAnalizarUno(el.dataset.pid);
    if(act==='iaAnalizarAplicar') iaAnalizarAplicar(el.dataset.pid);
    if(act==='iaAnalizarDescartar') iaAnalizarDescartar();
    if(act==='iaRegenTodas') iaRegenerarTodasDescripciones();
    if(act==='iaRegenCancelar') iaRegenCancelar();
    if(act==='promoPickImg') { const inp = document.getElementById('tmPromoImgInput'); if(inp) inp.click(); }
    if(act==='promoDownload') { promoDescargarCartel(el); }
  });
}
function isAdminVisible(){ const p=$('#adminPanel'); return !!(p && !p.classList.contains('hidden')); }
function shouldAutoOpen(){
  if (localStorage.getItem(LS.opened) === DAY) return false;
  if (Number(localStorage.getItem(LS.snooze)||0) > Date.now()) return false;
  return state.tasks.some(t=>t.urgency>=3);
}
async function boot(){
  if(state.booted) return; state.booted = true;
  ensureUI(); bindEvents();
  const wait = async()=>{
    if(!isAdminVisible()){ const tt=$('#tmCopilotToast'); if(tt) tt.classList.remove('show'); setTimeout(wait,700); return; }
    document.body.classList.add('admin-mode');
    await refresh(false);
    if(shouldAutoOpen()) setTimeout(openSheet,650);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(()=>{ if(isAdminVisible()) refresh(false); }, 90000);
  };
  wait();
}

// Hook suave: si abrirAdminPanel existe, refresca justo después.
function hookOpenAdmin(){
  if (typeof window.abrirAdminPanel !== 'function' || window.__tmCopilotOpenHook) return;
  window.__tmCopilotOpenHook = true;
  const prev = window.abrirAdminPanel;
  window.abrirAdminPanel = function(){ const r = prev.apply(this, arguments); setTimeout(()=>refresh(false).then(()=>{ if(shouldAutoOpen()) openSheet(); }),900); return r; };
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
setTimeout(hookOpenAdmin, 1200);
window.tmCopilotRefresh = refresh;
window.tmCopilotOpen = openSheet;
})();
