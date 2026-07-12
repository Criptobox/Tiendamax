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
let state = { tasks: [], hot: [], agents: [], metrics: {}, view: localStorage.getItem(LS.view) || 'hoy', booted: false, loading: false };
let refreshTimer = null;
const PROMO_BADGE_PRESETS = [
  ['🛡️','Seguro'],['🔒','Pago Seguro'],['🛵','Envío'],['📦','Incluye caja'],
  ['✅','Garantía'],['✅','Garantía 12m'],['💯','Original'],['⚡','Entrega rápida'],
  ['🎁','Oferta'],['🆕','Nuevo'],['♻️','Usado'],['📞','Soporte'],['🏆','Calidad'],['','Ninguno'],
];
let promoData = { imgEl: null, nombre: '', subfila: '', eslogan: '', precio: '', precioAnterior: '', moneda: 'USD', detalle: '', stock: '', url: 'tiendamax.org', tema: 'oscuro', badges: [{emoji:'🛡️',label:'Seguro'},{emoji:'🛵',label:'Envío'},{emoji:'✅',label:'Garantía'}], _logoEl: null, _drawTimer: null, _productoId: '' };

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
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
  try { const r = await fetch(base + path + (path.includes('?') ? '&' : '?') + '_=' + Date.now(), {cache:'no-store'}); return r.ok ? await r.json() : null; } catch(e) { return null; }
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
function taskId(t){ return [t.kind,t.pid||'',t.title].join('|'); }
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
function pickProductName(pid){
  const p = products().find(x=>String(x.id)===String(pid));
  return p ? p.nombre : '';
}
function money(v){ return '$' + Number(v||0).toFixed(2); }
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
  .tm-copilot-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:8px 0 12px}.tm-copilot-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 8px}.tm-copilot-stat small{display:block;color:#888;font-size:10px}.tm-copilot-stat b{display:block;font-size:18px;margin-top:4px}.tm-copilot-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.tm-copilot-btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;border-radius:13px;padding:10px 9px;font-size:12px;font-weight:800}.tm-copilot-btn.primary{background:linear-gradient(135deg,#ff6b35,#df4a16);border-color:transparent}.tm-copilot-btn.green{background:rgba(37,211,102,.14);border-color:rgba(37,211,102,.35);color:#80f2aa}.tm-copilot-btn.blue{background:rgba(42,171,238,.13);border-color:rgba(42,171,238,.34);color:#78d3ff}.tm-copilot-btn.gold{background:rgba(216,180,106,.14);border-color:rgba(216,180,106,.34);color:#e7c97f}.tm-copilot-btn.danger{background:rgba(231,76,60,.13);border-color:rgba(231,76,60,.34);color:#ff8f83}.tm-copilot-tabs{display:flex;gap:7px;overflow:auto;margin:2px 0 10px;padding-bottom:3px}.tm-copilot-tab{white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#bbb;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900}.tm-copilot-tab.active{background:rgba(255,107,53,.16);border-color:rgba(255,107,53,.35);color:#ffae8a}.tm-copilot-smart{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:12px;margin:9px 0}.tm-copilot-smart h4{margin:0 0 8px;font-size:13px}.tm-copilot-smart ul{margin:0;padding-left:18px;color:#d8d8df;font-size:12px;line-height:1.55}.tm-copilot-mini{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tm-copilot-mini-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px}.tm-copilot-mini-card b{font-size:12px;display:block}.tm-copilot-mini-card small{font-size:10px;color:#aaa;display:block;margin-top:4px;line-height:1.35}.tm-copilot-code{background:#0f0f15;border:1px solid rgba(255,255,255,.08);border-radius:13px;padding:10px;font-size:12px;line-height:1.45;color:#ddd;margin-top:8px;white-space:pre-wrap}.tm-copilot-rank-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.06);padding:8px 0}.tm-copilot-rank-row:last-child{border-bottom:0}.tm-copilot-rank-row span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.tm-copilot-rank-row em{font-style:normal;color:#ffae8a;font-size:10px;font-weight:900}@media(max-width:380px){.tm-copilot-mini{grid-template-columns:1fr}}
  .tm-copilot-task{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:11px;margin-bottom:9px;border-left:3px solid #ff6b35}.tm-copilot-task.u3{border-left-color:#e74c3c}.tm-copilot-task.u2{border-left-color:#ff6b35}.tm-copilot-task.u1{border-left-color:#2aabee}.tm-copilot-task-top{display:flex;gap:10px}.tm-copilot-ico{width:34px;height:34px;border-radius:13px;background:rgba(255,107,53,.13);display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}.tm-copilot-task-main{flex:1;min-width:0}.tm-copilot-task-main b{display:block;font-size:13px;line-height:1.25}.tm-copilot-task-main small{display:block;color:#aaa;font-size:11px;line-height:1.35;margin-top:4px}.tm-copilot-task-actions{display:flex;gap:7px;margin-top:10px}.tm-copilot-task-actions .tm-copilot-btn{padding:8px 9px;flex:1}.tm-copilot-agents{display:flex;gap:8px;overflow:auto;padding-bottom:4px;margin:8px 0 12px}.tm-copilot-agent{min-width:154px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px}.tm-copilot-agent.crit{border-color:rgba(231,76,60,.35);background:rgba(231,76,60,.08)}.tm-copilot-agent b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-copilot-agent small{display:block;color:#999;font-size:10px;margin-top:4px;line-height:1.25}.tm-copilot-agent .st{display:inline-flex;margin-top:7px;border-radius:99px;padding:3px 7px;font-size:9px;font-weight:900;background:rgba(37,211,102,.13);color:#75f0a1}.tm-copilot-agent.crit .st{background:rgba(231,76,60,.16);color:#ff9187}.tm-copilot-hot{display:flex;gap:9px;overflow:auto;padding-bottom:4px;margin:8px 0 12px}.tm-copilot-hot-card{min-width:172px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px}.tm-copilot-hot-card b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-copilot-hot-card small{display:block;color:#999;font-size:10px;margin-top:4px}.tm-copilot-empty{color:#aaa;text-align:center;padding:18px 8px;font-size:13px}.tm-copilot-chip{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(255,107,53,.14);color:#ffae8a;font-size:10px;font-weight:900;margin-top:6px}.tm-copilot-toast{position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(120%);z-index:100000;width:calc(min(560px,100%) - 28px);background:#1a1a22;border:1px solid rgba(37,211,102,.32);border-radius:17px;padding:12px;color:#effff3;box-shadow:0 16px 50px rgba(0,0,0,.45);transition:.22s ease;font-size:13px}.tm-copilot-toast.show{transform:translateX(-50%) translateY(0)}
  @media (min-width: 760px){.tm-copilot-bubble{bottom:24px;right:24px}.tm-copilot-sheet{right:22px;left:auto;bottom:18px;transform:translateY(110%);border-radius:26px;width:430px;max-height:82vh}.tm-copilot-sheet.show{transform:translateY(0)}.tm-copilot-summary{grid-template-columns:repeat(2,1fr)}}@media (max-width:380px){.tm-copilot-summary{grid-template-columns:repeat(2,1fr)}.tm-copilot-actions{grid-template-columns:1fr}.tm-copilot-task-actions{flex-direction:column}}
  body:not(.admin-mode) .tm-copilot-bubble, body:not(.admin-mode) .tm-copilot-sheet, body:not(.admin-mode) .tm-copilot-toast{display:none!important}.tm-copilot-toast:not(.show){opacity:0!important;pointer-events:none!important}
  .tm-promo-field{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;color:#fff;font-size:13px;width:100%;box-sizing:border-box;font-family:inherit;outline:none}.tm-promo-field:focus{border-color:rgba(255,107,53,.55)}.tm-promo-field option{background:#1a1a2e;color:#fff}
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
  const tabs=[['hoy','✅ Hoy'],['chat','💬 Chat'],['correcciones','🩺 Correcciones'],['agentes','🤖 Agentes'],['marketing','📣 Marketing'],['memoria','🧠 Memoria']];
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

function iaGenerarDescripcion(p){
  const n=(p.nombre||'Producto').trim(), c=(p.categoria||'').toLowerCase();
  const low=(n+' '+c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  let uso='Ideal para el uso diario en casa o el negocio';
  if(/inversor|bateria|solar|mppt|estacion|carga|apag|transferencia/.test(low)) uso='Ideal para mantener tu casa o negocio con corriente durante los apagones';
  else if(/router|wifi|repetidor|switch|enrutador|red/.test(low)) uso='Ideal para tener internet estable y con buena cobertura en toda la casa';
  else if(/audifono|parlante|altavoz|bocina|sound|audio/.test(low)) uso='Ideal para disfrutar tu música con buen sonido donde quieras';
  else if(/camara|seguridad|alarma|cerradura|zosi|v380/.test(low)) uso='Ideal para vigilar y proteger tu casa o negocio desde el celular';
  else if(/mannol|aceite|antifreeze|llanta|espejo|moto|carro|auto/.test(low)) uso='Ideal para el mantenimiento y cuidado de tu vehículo';
  else if(/tv|lavadora|split|nevera|exhibidor|batidora|ventilador|calentador/.test(low)) uso='Ideal para equipar tu hogar o negocio con un equipo confiable';
  const specs=(Array.isArray(p.specs)?p.specs:[]).filter(s=>s&&String(s).trim()).slice(0,3).join(' · ');
  const gar=p.garantia?('Incluye garantía de '+p.garantia+'.'):'Lo pruebas al recibirlo: pagas cuando compruebes que funciona.';
  let d=`${n} nuevo y disponible en TiendaMax con entrega en Cuba. ${uso}.${specs?' '+specs+'.':''} ${gar} Atención personalizada por WhatsApp: escríbenos y te lo apartamos 24 horas mientras coordinas la entrega.`;
  if(d.length<200) d+=' Precios claros en USD con opción de pago en moneda nacional según la tasa del día.';
  return d;
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
  const ps = Array.isArray(window.productos)?window.productos:[];
  const skip = iaDismissed();
  const issues=[];
  const push=(o)=>{ o.key=o.type+':'+o.pid; if(!skip.has(o.key)) issues.push(o); };
  ps.forEach(p=>{
    const pid=String(p.id), nombre=p.nombre||'(sin nombre)';
    // 🚨 sin descripción SEO
    const d=String(p.descripcion||'').trim();
    if(d.length<40) push({level:'urgente',ico:'🚨',type:'desc',pid,nombre,detalle:d?('solo '+d.length+' caracteres'):'sin descripción',fix:{campo:'descripcion',valor:iaGenerarDescripcion(p)},fixLabel:'Generar descripción'});
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
async function iaLlamarModelo(prompt){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key) return null;
  const t=25000, ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),t);
  try{
    let r,j;
    if(key.startsWith('AIza')){
      r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
      j=await r.json(); return j.candidates?.[0]?.content?.parts?.[0]?.text||null;
    }
    const cfg = key.startsWith('sk-or') ? {url:'https://openrouter.ai/api/v1/chat/completions',model:'openrouter/auto'}
      : key.startsWith('gsk_') ? {url:'https://api.groq.com/openai/v1/chat/completions',model:'llama-3.3-70b-versatile'}
      : {url:'https://api.deepseek.com/chat/completions',model:'deepseek-chat'};
    r=await fetch(cfg.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},signal:ctrl.signal,body:JSON.stringify({model:cfg.model,messages:[{role:'user',content:prompt}],max_tokens:400})});
    j=await r.json(); return j.choices?.[0]?.message?.content||null;
  }catch(e){ return null; }
  finally{ clearTimeout(tid); }
}
async function iaDescripcionesConIA(){
  const key=(localStorage.getItem('anthropicApiKey')||'').trim();
  if(!key){ toast('Configura tu API key en ⚙️ Configuración → API Key de IA'); return; }
  const pendientes=iaScan().filter(i=>i.level==='urgente'&&i.type==='desc').slice(0,10);
  if(!pendientes.length){ toast('No hay productos sin descripción'); return; }
  toast('🤖 Generando '+pendientes.length+' descripciones con IA…');
  const grupo=[]; let ok=0;
  for(const iss of pendientes){
    const p=(window.productos||[]).find(x=>String(x.id)===iss.pid); if(!p) continue;
    const prompt='Escribe una descripción de venta para una tienda online cubana (entrega en Cuba, pedido por WhatsApp). Producto: "'+(p.nombre||'')+'". Categoría: '+(p.categoria||'General')+'. Precio: $'+Number(p.precioActual||0).toFixed(2)+' USD.'+(p.garantia?' Garantía: '+p.garantia+'.':'')+' Entre 200 y 350 caracteres, tono cercano y confiable, sin emojis, sin markdown, un solo párrafo.';
    const txt=await iaLlamarModelo(prompt);
    if(txt && txt.trim().length>=120){
      grupo.push({pid:iss.pid,campo:'descripcion',antes:p.descripcion});
      p.descripcion=txt.trim().slice(0,450);
      try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){}
      ok++;
    }
  }
  if(ok){ iaUndoPush(grupo, ok+' descripciones IA'); iaPersistir('🤖 '+ok+' descripciones generadas con IA'); }
  else toast('❌ La IA no respondió — revisa la key o usa el generador local (Aplicar urgentes)');
  state.view='correcciones'; renderSheet();
}
function iaUndoPila(){ try{ const a=JSON.parse(localStorage.getItem('tm_ia_undo')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function iaUndoPush(grupo,label){ try{ const a=iaUndoPila(); a.push({grupo,label,ts:Date.now()}); localStorage.setItem('tm_ia_undo',JSON.stringify(a.slice(-20))); }catch(e){} }
function iaDeshacer(){
  const a=iaUndoPila(); const ult=a.pop();
  if(!ult){ toast('Nada que deshacer'); return; }
  let n=0;
  ult.grupo.forEach(g=>{ const p=(window.productos||[]).find(x=>String(x.id)===g.pid); if(p){ p[g.campo]=g.antes; try{ if(typeof window.marcarProductoModificado==='function') window.marcarProductoModificado(p.id); }catch(e){} n++; } });
  try{ localStorage.setItem('tm_ia_undo',JSON.stringify(a)); }catch(e){}
  if(n) iaPersistir('↩️ Deshecho: '+(ult.label||n+' cambios'));
  state.view='correcciones'; renderSheet();
}
function iaAplicar(issue, _sinUndo){
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
      ${(localStorage.getItem('anthropicApiKey')||'').trim()?`<button type="button" class="tm-copilot-btn blue" data-cop="iaDescIA">🤖 Descripciones con IA</button>`:''}
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
function promoSetProduct(id) {
  const p = products().find(x => String(x.id) === String(id));
  if (!p) return;
  promoData._productoId = String(id);
  promoData.nombre = (p.nombre || '').toUpperCase();
  promoData.subfila = p.garantia ? 'Garantía ' + p.garantia : (p.categoria || '');
  promoData.eslogan = '';
  promoData.precio = String(p.precioActual || '');
  promoData.precioAnterior = (parseFloat(p.precioOriginal) > 0 && parseFloat(p.precioOriginal) > parseFloat(p.precioActual)) ? String(p.precioOriginal) : '';
  promoData.moneda = 'USD';
  promoData.stock = String(p.stock || '');
  promoData.url = 'tiendamax.org/p/producto-' + p.id + '.html';
  promoData.detalle = (p.descripcion || '');
  const map = {
    tmPromoNombre:'nombre', tmPromoSubfila:'subfila', tmPromoEslogan:'eslogan',
    tmPromoPrecio:'precio', tmPromoPrecioAnt:'precioAnterior',
    tmPromoDetalle:'detalle', tmPromoUrl:'url', tmPromoStock:'stock'
  };
  Object.entries(map).forEach(([elId, key]) => { const el = document.getElementById(elId); if(el) el.value = promoData[key]||''; });
  if (p.imagen) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { promoData.imgEl = img; promoScheduleDraw(); };
    img.onerror = () => promoScheduleDraw();
    img.src = p.imagen;
  } else { promoScheduleDraw(); }
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
async function drawPromo() {
  const canvas = document.getElementById('tmPromoCanvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const d = promoData, tema = d.tema || 'oscuro';
  const isDark = tema !== 'claro';
  const textColor = isDark ? '#ffffff' : '#1a1008';
  const accent = '#f45e1f';

  // ── Background ──
  if (tema === 'oscuro') {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0d0d12'); gr.addColorStop(0.4, '#1c0b04'); gr.addColorStop(0.7, '#260e06'); gr.addColorStop(1, '#0d0d12');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W*0.55, H*0.55, 0, W*0.55, H*0.55, W*0.8);
    glow.addColorStop(0, 'rgba(244,94,31,.18)'); glow.addColorStop(1, 'rgba(244,94,31,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  } else if (tema === 'naranja') {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#8c2200'); gr.addColorStop(0.5, '#c94400'); gr.addColorStop(1, '#8c2200');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const grain = ctx.createRadialGradient(W*0.3, H*0.3, 0, W*0.3, H*0.3, W);
    grain.addColorStop(0, 'rgba(255,180,80,.12)'); grain.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H);
  } else {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#f7f3ee'); gr.addColorStop(1, '#ede5d8');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const grain2 = ctx.createRadialGradient(W*0.5, H*0.4, 0, W*0.5, H*0.4, W*0.8);
    grain2.addColorStop(0, 'rgba(244,94,31,.07)'); grain2.addColorStop(1, 'transparent');
    ctx.fillStyle = grain2; ctx.fillRect(0, 0, W, H);
  }

  // ── Bag watermark (faint background) ──
  promoDrawBagBg(ctx, W, H, accent, isDark ? '#ffffff' : '#1a1008');

  // ── Logo top-center ──
  const logo = await promoLoadLogo();
  const logoSz = 100, logoY = 62;
  const logoX = (W - logoSz) / 2;
  if (logo) {
    ctx.save();
    promoRoundRect(ctx, logoX, logoY, logoSz, logoSz, 22);
    ctx.clip(); ctx.drawImage(logo, logoX, logoY, logoSz, logoSz);
    ctx.restore();
  } else {
    promoRoundRect(ctx, logoX, logoY, logoSz, logoSz, 22);
    ctx.fillStyle = accent; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M', W/2, logoY + logoSz/2); ctx.textBaseline = 'alphabetic';
  }

  // ── Top separator ──
  ctx.strokeStyle = accent; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(80, logoY + logoSz + 28); ctx.lineTo(W - 80, logoY + logoSz + 28); ctx.stroke();

  // ── Title block ──
  const titleX = 80, titleMaxW = W - 160;
  let titleY = logoY + logoSz + 72;

  const nombre = (d.nombre || 'PRODUCTO DESTACADO').toUpperCase();
  const fsN = nombre.length > 32 ? 56 : nombre.length > 20 ? 64 : 72;
  ctx.font = `800 ${fsN}px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = accent;
  promoWrapText(ctx, nombre, titleMaxW).slice(0, 2).forEach(line => { ctx.fillText(line, titleX, titleY); titleY += fsN * 1.18; });

  if (d.subfila) {
    titleY += 4;
    ctx.font = '500 44px Arial, sans-serif';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
    ctx.fillText(d.subfila, titleX, titleY); titleY += 58;
  }

  const eslogan = (d.eslogan || '').toUpperCase();
  if (eslogan) {
    titleY += 6;
    const fsE = eslogan.length > 40 ? 62 : eslogan.length > 26 ? 72 : 82;
    ctx.font = `900 ${fsE}px 'Arial Black', Arial, sans-serif`;
    ctx.fillStyle = textColor;
    promoWrapText(ctx, eslogan, titleMaxW).slice(0, 3).forEach(line => { ctx.fillText(line, titleX, titleY); titleY += fsE * 1.14; });
  }

  titleY = Math.min(titleY, 620);

  // ── Product photo (narrower to reveal bag watermark on sides) ──
  const phPad = 100, phX = phPad, phW = W - phPad * 2;
  const phY = titleY + 28;
  const phH = Math.max(260, Math.min(Math.round(phW * 0.68), 560, 1130 - phY));

  if (d.imgEl) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
    promoRoundRect(ctx, phX, phY, phW, phH, 40); ctx.clip();
    const sc = Math.max(phW / d.imgEl.naturalWidth, phH / d.imgEl.naturalHeight);
    const iw = d.imgEl.naturalWidth * sc, ih = d.imgEl.naturalHeight * sc;
    ctx.drawImage(d.imgEl, phX + (phW - iw) / 2, phY + (phH - ih) / 2, iw, ih);
    ctx.restore();
  } else {
    ctx.save();
    promoRoundRect(ctx, phX, phY, phW, phH, 40);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; ctx.fill();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
    ctx.font = '80px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('📷', W / 2, phY + phH / 2 - 30);
    ctx.font = '500 40px Arial, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Elige un producto o sube la foto', W / 2, phY + phH / 2 + 50);
    ctx.restore();
  }

  let curY = phY + phH + 40;

  // ── Spec chips ──
  const chips = promoParseChips(d.detalle || '');
  if (chips.length) curY = promoDrawChips(ctx, chips, phX, curY, phW, accent, isDark) + 36;

  // ── Price ──
  if (d.precio) {
    const moneda = d.moneda || 'USD';
    const precioStr = moneda + ' $' + d.precio;
    const pFs = precioStr.length > 10 ? 80 : precioStr.length > 7 ? 92 : 108;
    ctx.font = `900 ${pFs}px 'Arial Black', Arial, sans-serif`;
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const pBaseY = curY + pFs;
    ctx.fillText(precioStr, W / 2, pBaseY);
    if (d.precioAnterior) {
      const antStr = moneda + ' $' + d.precioAnterior;
      const antFs = 54;
      ctx.font = `500 ${antFs}px Arial, sans-serif`;
      ctx.fillStyle = 'rgba(200,200,200,0.65)';
      const antW2 = ctx.measureText(antStr).width;
      const antBaseY = pBaseY + antFs + 18;
      ctx.fillText(antStr, W / 2, antBaseY);
      ctx.strokeStyle = 'rgba(200,200,200,0.65)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - antW2 / 2, antBaseY - antFs * 0.36);
      ctx.lineTo(W / 2 + antW2 / 2, antBaseY - antFs * 0.36);
      ctx.stroke();
      curY = antBaseY + 36;
    } else {
      curY = pBaseY + 36;
    }
  }

  // ── URL (ensure it stays above the badge strip) ──
  curY = Math.min(curY, H - 360);
  const url = d.url || 'tiendamax.org';
  ctx.fillStyle = accent;
  ctx.font = `700 ${url.length > 28 ? 44 : url.length > 20 ? 52 : 58}px Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(url, W / 2, curY + 62);
  curY += 84;

  // ── Bottom separator ──
  const sepY = Math.max(curY + 16, H - 248);
  ctx.strokeStyle = accent; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(80, sepY); ctx.lineTo(W - 80, sepY); ctx.stroke();

  // ── Badge footer (3 configurable slots) ──
  const badgeY = sepY + 48;
  const colW = (W - 160) / 3;
  const colMids = [80 + colW / 2, W / 2, W - 80 - colW / 2];
  const badges = (d.badges && d.badges.length === 3) ? d.badges
    : [{emoji:'🛡️',label:'Seguro'},{emoji:'🛵',label:'Envío'},{emoji:'✅',label:'Garantía'}];
  ctx.textAlign = 'center';
  badges.forEach((badge, i) => {
    if (!badge || (!badge.emoji && !badge.label)) return;
    if (badge.emoji) {
      ctx.font = '74px sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(badge.emoji, colMids[i], badgeY + 42);
    }
    if (badge.label) {
      ctx.font = `600 ${badge.label.length > 12 ? 32 : 38}px Arial, sans-serif`;
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.75)';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(badge.label, colMids[i], badgeY + 106);
    }
  });

  ctx.strokeStyle = accent; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(80, H - 44); ctx.lineTo(W - 80, H - 44); ctx.stroke();
}
function promoScheduleDraw() { clearTimeout(promoData._drawTimer); promoData._drawTimer = setTimeout(drawPromo, 100); }
function addPromoListeners() {
  const fields = {
    tmPromoNombre:'nombre', tmPromoSubfila:'subfila', tmPromoEslogan:'eslogan',
    tmPromoPrecio:'precio', tmPromoPrecioAnt:'precioAnterior', tmPromoMoneda:'moneda',
    tmPromoDetalle:'detalle', tmPromoUrl:'url', tmPromoStock:'stock'
  };
  Object.entries(fields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { promoData[key] = el.value; promoScheduleDraw(); });
  });
  // Badge selectors
  [0, 1, 2].forEach(i => {
    const selEl = document.getElementById('tmPromoBadgeSel' + i);
    const lblEl = document.getElementById('tmPromoBadgeLbl' + i);
    if (selEl) selEl.addEventListener('change', () => {
      const [emoji, ...rest] = selEl.value.split('|');
      promoData.badges[i] = { emoji, label: rest.join('|') };
      if (lblEl) lblEl.value = rest.join('|');
      promoScheduleDraw();
    });
    if (lblEl) lblEl.addEventListener('input', () => {
      promoData.badges[i] = { emoji: promoData.badges[i]?.emoji || '', label: lblEl.value };
      promoScheduleDraw();
    });
  });
  const sel = document.getElementById('tmPromoProductoSel');
  if (sel) sel.addEventListener('change', () => { if (sel.value) promoSetProduct(sel.value); });
  const imgInp = document.getElementById('tmPromoImgInput');
  if (imgInp) imgInp.addEventListener('change', () => {
    const file = imgInp.files && imgInp.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        promoData.imgEl = img; drawPromo();
        const btn = document.querySelector('[data-cop="promoPickImg"]');
        if (btn) btn.textContent = '✅ Foto cargada — Cambiar imagen';
        if (btn) btn.className = btn.className.replace('blue','green');
      };
      img.src = ev.target.result;
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
    <div style="display:flex;justify-content:center;margin-bottom:12px;background:#111;border-radius:16px;overflow:hidden;min-height:200px">
      <canvas id="tmPromoCanvas" style="width:200px;height:355px;display:block;flex-shrink:0" width="1080" height="1920"></canvas>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div><div style="font-size:11px;color:#888;margin-bottom:4px">Producto del catálogo</div>
        <select class="tm-promo-field" id="tmPromoProductoSel" style="width:100%">
          <option value="">— Elegir producto —</option>
          ${prodOpts}
        </select></div>
      <input type="file" id="tmPromoImgInput" accept="image/*" style="display:none">
      <button type="button" class="tm-copilot-btn ${d.imgEl?'green':'blue'}" data-cop="promoPickImg" style="width:100%">${d.imgEl ? '✅ Foto cargada — Cambiar imagen' : '📷 Cambiar foto del producto'}</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Nombre <span style="color:#f45e1f">●</span></div>
          <input class="tm-promo-field" id="tmPromoNombre" type="text" placeholder="INVERSOR SOLAR 2KW" value="${esc(d.nombre)}"></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Subfila (garantía / categoría)</div>
          <input class="tm-promo-field" id="tmPromoSubfila" type="text" placeholder="Garantía 12 meses" value="${esc(d.subfila||'')}"></div>
      </div>
      <div><div style="font-size:11px;color:#888;margin-bottom:4px">Eslogan (línea blanca, opcional)</div>
        <input class="tm-promo-field" id="tmPromoEslogan" type="text" placeholder="POTENCIA PURA Y CONFIABILIDAD SIN IGUAL" value="${esc(d.eslogan)}"></div>
      <div style="display:grid;grid-template-columns:1fr 80px 1fr;gap:8px">
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Precio actual</div>
          <input class="tm-promo-field" id="tmPromoPrecio" type="text" placeholder="300" value="${esc(d.precio)}"></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Moneda</div>
          <select class="tm-promo-field" id="tmPromoMoneda">
            <option${d.moneda==='USD'?' selected':''}>USD</option>
            <option${d.moneda==='CUP'?' selected':''}>CUP</option>
            <option${d.moneda==='MLC'?' selected':''}>MLC</option>
          </select></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Precio anterior</div>
          <input class="tm-promo-field" id="tmPromoPrecioAnt" type="text" placeholder="350" value="${esc(d.precioAnterior||'')}"></div>
      </div>
      <div><div style="font-size:11px;color:#888;margin-bottom:4px">Especificaciones (separa con | o salto de línea)</div>
        <textarea class="tm-promo-field" id="tmPromoDetalle" rows="3" placeholder="ONDA SENOIDAL PURA&#10;CARGA 2000W&#10;24V/48V" style="resize:vertical;line-height:1.4">${esc(d.detalle)}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">Stock disponible</div>
          <input class="tm-promo-field" id="tmPromoStock" type="text" placeholder="5" value="${esc(d.stock||'')}"></div>
        <div><div style="font-size:11px;color:#888;margin-bottom:4px">URL del producto</div>
          <input class="tm-promo-field" id="tmPromoUrl" type="text" placeholder="tiendamax.org/p/producto-1.html" value="${esc(d.url||'tiendamax.org')}"></div>
      </div>
      <div>
        <div style="font-size:11px;color:#888;margin-bottom:6px">Badges del pie — ícono + texto</div>
        ${[0,1,2].map(i => {
          const b = (d.badges && d.badges[i]) || {emoji:'',label:''};
          const matchVal = PROMO_BADGE_PRESETS.find(([e,l]) => e===b.emoji && l===b.label);
          const selVal = matchVal ? matchVal[0]+'|'+matchVal[1] : (b.emoji+'|'+b.label);
          return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
            <select class="tm-promo-field" id="tmPromoBadgeSel${i}">
              ${PROMO_BADGE_PRESETS.map(([e,l]) => `<option value="${esc(e+'|'+l)}"${(e+'|'+l)===selVal?' selected':''}>${e} ${l}</option>`).join('')}
            </select>
            <input class="tm-promo-field" id="tmPromoBadgeLbl${i}" type="text" placeholder="Etiqueta" value="${esc(b.label||'')}">
          </div>`;
        }).join('')}
      </div>
      <div><div style="font-size:11px;color:#888;margin-bottom:6px">Tema</div>
        <div style="display:flex;gap:6px">
          ${[['oscuro','#141422','#fff'],['naranja','#c94400','#fff'],['claro','#ede5d8','#333']].map(([t,bg,fg])=>`<button type="button" class="tm-copilot-btn" data-cop="promoTema" data-tema="${t}" style="background:${bg};color:${fg};flex:1;border:2px solid ${d.tema===t?'rgba(255,255,255,.7)':'rgba(255,255,255,.1)'}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
        </div>
      </div>
      <button type="button" class="tm-copilot-btn primary" data-cop="promoDownload" style="padding:14px;margin-top:4px">⬇️ Descargar imagen (1080×1920)</button>
    </div>
  </div>`;
}
// Monta el generador de Promo dentro del panel admin de Publicación (sub-tab Promo)
window.pubMountPromo = function() {
  const root = document.getElementById('tmPromoAdminRoot');
  if (!root || root.querySelector('#tmPromoCanvas')) return;
  root.innerHTML = renderPromoImagen();
  setTimeout(() => { addPromoListeners(); drawPromo(); }, 80);
};
// ── FIN PROMO ──────────────────────────────────────────────────────

function renderCopilotView(view, topTasks){
  if(view==='chat') return renderChat();
  if(view==='correcciones') return renderCorreccionesIA();
  if(view==='agentes') return renderAgents();
  if(view==='marketing') return renderMarketing();
  if(view==='memoria') return renderMemory();
  return renderToday(topTasks);
}
function renderSheet(){
  const body = $('#tmCopilotBody'); if(!body) return;
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
    if(act==='promoPickImg') { const inp = document.getElementById('tmPromoImgInput'); if(inp) inp.click(); }
    if(act==='promoTema') { promoData.tema = el.dataset.tema; state.view = 'promo'; renderSheet(); }
    if(act==='promoDownload') {
      const canvas = document.getElementById('tmPromoCanvas'); if(!canvas) return;
      const link = document.createElement('a');
      link.download = 'promo-tiendamax-' + Date.now() + '.jpg';
      link.href = canvas.toDataURL('image/jpeg', 0.94);
      link.click();
      remember('promo_download', { productName: promoData.nombre });
      toast('Imagen descargada — lista para WhatsApp Estado');
    }
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
