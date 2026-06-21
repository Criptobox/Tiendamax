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
  html.tm-admin-touch body.admin-mode{overflow-x:hidden!important}html.tm-admin-touch .admin-panel.visible{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;overflow:hidden!important}html.tm-admin-touch .tm-app{display:block!important;width:100vw!important;height:100dvh!important;min-height:100dvh!important;overflow:hidden!important}html.tm-admin-touch .tm-top{position:fixed!important;top:0!important;left:0!important;right:0!important;width:100vw!important;height:62px!important;padding:0 10px!important;gap:8px!important;z-index:999!important;background:rgba(18,18,18,.985)!important}html.tm-admin-touch .tm-top .brand{width:auto!important;min-width:0!important;flex:0 0 auto!important}html.tm-admin-touch .tm-top .brand b{font-size:16px!important}html.tm-admin-touch .tm-top .search,html.tm-admin-touch .tm-top-search-wrap{display:none!important}html.tm-admin-touch .topicons{margin-left:auto!important;gap:6px!important}html.tm-admin-touch .sync-pill{display:none!important}html.tm-admin-touch .tm-side{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100vw!important;height:82px!important;z-index:1000!important;border-right:0!important;border-top:1px solid rgba(255,255,255,.10)!important;display:flex!important;flex-direction:row!important;gap:7px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:9px 10px calc(9px + env(safe-area-inset-bottom,0px))!important;background:rgba(18,18,18,.985)!important;backdrop-filter:blur(14px)!important}html.tm-admin-touch .tm-side::-webkit-scrollbar{display:none!important}html.tm-admin-touch .tm-side .navlabel{display:none!important}html.tm-admin-touch .tm-side .tab-btn{min-width:76px!important;height:58px!important;margin:0!important;flex-direction:column!important;justify-content:center!important;gap:4px!important;padding:6px 8px!important;border-radius:14px!important;font-size:18px!important}html.tm-admin-touch .tm-side .tab-btn .txt{display:block!important;font-size:10px!important;line-height:1!important;max-width:70px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}html.tm-admin-touch .tm-side .tab-btn.active{box-shadow:inset 0 -3px 0 var(--gold)!important;background:rgba(201,169,110,.18)!important}html.tm-admin-touch .tm-main,html.tm-admin-touch .admin-content{display:block!important;width:100vw!important;max-width:100vw!important;height:calc(100dvh - 144px)!important;overflow:auto!important;-webkit-overflow-scrolling:touch!important;padding:80px 12px 104px!important;margin:0!important}html.tm-admin-touch .head h1,html.tm-admin-touch .admin-tab>h3{font-size:30px!important}html.tm-admin-touch .stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}html.tm-admin-touch .grid2,html.tm-admin-touch .form-grid,html.tm-admin-touch .add-grid{grid-template-columns:1fr!important}html.tm-admin-touch .tm-copilot-sheet{left:0!important;right:0!important;bottom:0!important;width:100vw!important;max-width:100vw!important;max-height:78dvh!important;transform:translateY(110%)!important;border-radius:24px 24px 0 0!important;padding-bottom:calc(12px + env(safe-area-inset-bottom))!important}html.tm-admin-touch .tm-copilot-sheet.show{transform:translateY(0)!important}html.tm-admin-touch .tm-copilot-bubble{right:14px!important;bottom:calc(92px + env(safe-area-inset-bottom))!important}html.tm-admin-touch .tm-copilot-toast{width:calc(100vw - 28px)!important;max-width:520px!important;bottom:calc(92px + env(safe-area-inset-bottom))!important}html.tm-admin-touch .tm-copilot-actions{grid-template-columns:1fr 1fr!important}html.tm-admin-touch .tm-copilot-summary{grid-template-columns:repeat(2,1fr)!important}
  body:not(.admin-mode) .tm-copilot-bubble, body:not(.admin-mode) .tm-copilot-sheet, body:not(.admin-mode) .tm-copilot-toast{display:none!important}.tm-copilot-toast:not(.show){opacity:0!important;pointer-events:none!important}
  .tm-promo-field{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;color:#fff;font-size:13px;width:100%;box-sizing:border-box;font-family:inherit;outline:none}.tm-promo-field:focus{border-color:rgba(255,107,53,.55)}.tm-promo-field option{background:#1a1a2e;color:#fff}`;
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
  const tabs=[['hoy','✅ Hoy'],['agentes','🤖 Agentes'],['marketing','📣 Marketing'],['promo','🎨 Promo'],['memoria','🧠 Memoria']];
  return `<div class="tm-copilot-tabs">${tabs.map(t=>`<button type="button" class="tm-copilot-tab ${view===t[0]?'active':''}" data-cop="view" data-view="${t[0]}">${t[1]}</button>`).join('')}</div>`;
}
function renderToday(topTasks){
  return `<div class="tm-copilot-smart"><h4>🧠 Estrategia de hoy</h4><ul>${dailyStrategy().map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="tm-copilot-task-actions"><button type="button" class="tm-copilot-btn gold" data-cop="saveStrategy">Guardar campaña</button><button type="button" class="tm-copilot-btn blue" data-cop="view" data-view="marketing">Ver marketing</button></div></div>
  <div class="tm-copilot-list">${topTasks.length ? topTasks.map(t=>taskHtml(t)).join('') : '<div class="tm-copilot-empty">✅ Sin tareas urgentes. Puedes revisar productos o publicar novedades.</div>'}</div>`;
}
function renderAgents(){
  return `${state.agents && state.agents.length ? `<div class="tm-copilot-agents">${state.agents.map(a=>`<div class="tm-copilot-agent ${a.critical?'crit':''}"><b>${a.icon} ${esc(a.name)}</b><small>${esc(a.goal)}<br>${esc(a.hint)}</small><span class="st">${esc(a.status)} · ${a.count}</span></div>`).join('')}</div>` : ''}
  ${state.hot && state.hot.length ? `<div class="tm-copilot-hot">${state.hot.map(x=>`<div class="tm-copilot-hot-card"><b>${iconFor(x.p)} ${esc(x.p.nombre)}</b><small>${x.views} vistas · ${x.wa} WhatsApp · stock ${num(x.p.stock)}</small><span class="tm-copilot-chip">score ${x.score}</span></div>`).join('')}</div>` : '<div class="tm-copilot-empty">Sin productos calientes medibles todavía.</div>'}`;
}
function renderMarketing(){
  const r=ranking(), bundles=suggestedBundles(), responses=responseTemplates();
  return `<div class="tm-copilot-mini">
    <div class="tm-copilot-mini-card"><b>🏆 Top para impulsar</b>${r.top.slice(0,4).map((x,i)=>`<div class="tm-copilot-rank-row"><span>${i+1}. ${esc(x.p.nombre)}</span><em>${x.score}</em></div>`).join('')||'<small>Sin datos suficientes</small>'}</div>
    <div class="tm-copilot-mini-card"><b>⚠️ Atención</b>${r.attention.slice(0,4).map(x=>`<div class="tm-copilot-rank-row"><span>${esc(x.p.nombre)}</span><em>${esc(x.reasons.join(', '))}</em></div>`).join('')||'<small>Catálogo estable</small>'}</div>
  </div>
  <div class="tm-copilot-smart"><h4>🎁 Bundles sugeridos</h4>${bundles.map(b=>`<div class="tm-copilot-mini-card" style="margin-bottom:7px"><b>${esc(b.a.nombre)} + ${esc(b.b.nombre)}</b><small>${esc(b.why)} · Total: ${money(b.total)} USD</small></div>`).join('')||'<small>No hay combinaciones suficientes con stock.</small>'}</div>
  <div class="tm-copilot-smart"><h4>💬 Respuestas humanas listas</h4>${responses.map((txt,i)=>`<div class="tm-copilot-code">${esc(txt)}</div><button type="button" class="tm-copilot-btn" data-cop="copy" data-text="${esc(txt)}">Copiar respuesta ${i+1}</button>`).join('')}</div>`;
}
function renderMemory(){
  const m=memory(), actions=Array.isArray(m.actions)?m.actions:[], productsCount=m.products||{};
  const top=Object.entries(productsCount).sort((a,b)=>b[1]-a[1])[0];
  return `<div class="tm-copilot-smart"><h4>🧠 Memoria del agente</h4><ul><li>Estrategias/campañas guardadas: ${num(m.counts&&m.counts.campaign_draft)}</li><li>Producto más impulsado: ${top?esc(top[0])+' ('+top[1]+' veces)':'aún sin datos'}</li><li>Última acción: ${m.last?esc(m.last.type)+' · '+ago(m.last.ts):'sin acciones registradas'}</li></ul></div>
  <div class="tm-copilot-smart"><h4>Historial reciente</h4>${actions.slice(0,8).map(a=>`<div class="tm-copilot-rank-row"><span>${esc(a.type)} ${a.productName?'· '+esc(a.productName):''}</span><em>${ago(a.ts)}</em></div>`).join('')||'<div class="tm-copilot-empty">El agente aprenderá cuando guardes campañas o marques acciones.</div>'}</div>`;
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

  // ── Product photo (full-width, cover-fill) ──
  const phPad = 60, phX = phPad, phW = W - phPad * 2;
  const phY = titleY + 28;
  const phH = Math.max(300, Math.min(Math.round(phW * 0.78), 700, 1230 - phY));

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

  // ── URL ──
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
function renderPromo() {
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
// ── FIN PROMO ──────────────────────────────────────────────────────

function renderCopilotView(view, topTasks){
  if(view==='agentes') return renderAgents();
  if(view==='marketing') return renderMarketing();
  if(view==='promo') return renderPromo();
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
  if (view === 'promo') setTimeout(() => { addPromoListeners(); drawPromo(); }, 120);
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
  if(open) openSheet(); else if($('#tmCopilotSheet')?.classList.contains('show')) renderSheet();
}
function switchTo(tab){
  if (typeof window.switchTab === 'function') window.switchTab(tab);
  closeSheet();
  setTimeout(()=>{ try { document.querySelector('.tm-main')?.scrollTo({top:0,behavior:'smooth'}); } catch(e){} },80);
}
async function queuePushForProduct(pid){
  const ps = products(); const p = ps.find(x=>String(x.id)===String(pid));
  if(!p){ toast('No encontré el producto.'); return; }
  const base = await fbBase(); if(!base){ toast('Firebase no configurado.'); return; }
  const reqId = 'req_copilot_' + Date.now();
  const payload = { title: '🔥 Producto destacado en TiendaMax', body: String(p.nombre||'Oferta disponible').slice(0,120), url: '/p/producto-' + p.id + '.html', icon: p.imagen || '/iconos/icon-192.png', image: p.imagen || '', ts: Date.now(), source: 'admin_copilot' };
  try {
    const r = await fetch(base + '/admin_push_requests/' + reqId + '.json', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const ghUser=localStorage.getItem('githubUser'), ghRepo=localStorage.getItem('githubRepo')||'Tiendamax', ghToken=localStorage.getItem('githubToken');
    if(ghUser && ghToken){ fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/actions/workflows/flush-push-queue.yml/dispatches`,{method:'POST',headers:{'Authorization':'token '+ghToken,'Content-Type':'application/json'},body:JSON.stringify({ref:'main'})}).catch(()=>{}); }
    toast('Push agregado a la cola: ' + p.nombre);
  } catch(e) { toast('No se pudo crear el push: '+e.message); }
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
function enableAlerts(){
  if (typeof window.tmActivarAlertaAdmin === 'function') window.tmActivarAlertaAdmin();
  else if ('Notification' in window) Notification.requestPermission().then(p=>toast(p==='granted'?'Notificaciones activadas':'Permiso no concedido'));
  toast('Alertas del admin revisadas.');
}
function bindEvents(){
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
    if(act==='task') switchTo(el.dataset.tab || 'inicio');
    if(act==='dismiss') { const set=dismissedSet(); set.add(el.dataset.id); saveDismissed(set); state.tasks = state.tasks.filter(t=>t.id!==el.dataset.id); updateBubble(); renderSheet(); }
    if(act==='pushHot') queuePushForProduct(el.dataset.pid);
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
