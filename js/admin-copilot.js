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
  dismissed: 'tm_copilot_dismissed_tasks'
};
const DAY = new Date().toISOString().slice(0,10);
let state = { tasks: [], hot: [], agents: [], metrics: {}, booted: false, loading: false };
let refreshTimer = null;

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

function injectStyles(){
  if ($('#tmCopilotStyles')) return;
  const st = document.createElement('style'); st.id = 'tmCopilotStyles';
  st.textContent = `
  .tm-copilot-bubble{position:fixed;right:14px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:99998;width:62px;height:62px;border:0;border-radius:22px;background:linear-gradient(135deg,#8b5cf6,#ff6b35);color:#fff;font-size:27px;box-shadow:0 16px 42px rgba(139,92,246,.35),0 10px 32px rgba(255,107,53,.22);display:flex;align-items:center;justify-content:center;transition:transform .18s,opacity .18s}.tm-copilot-bubble:hover{transform:translateY(-2px)}.tm-copilot-bubble .n{position:absolute;right:-5px;top:-6px;min-width:23px;height:23px;padding:0 6px;border-radius:20px;background:#e74c3c;border:3px solid #121217;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center}.tm-copilot-bubble.clean .n{background:#25d366}.tm-copilot-pulse{animation:tmCopPulse 1.2s ease 2}@keyframes tmCopPulse{50%{transform:scale(1.08)}}
  .tm-copilot-sheet{position:fixed;left:50%;bottom:0;z-index:99999;width:min(560px,100%);max-height:88vh;transform:translateX(-50%) translateY(110%);transition:transform .28s cubic-bezier(.2,.9,.2,1);background:#14141b;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:26px 26px 0 0;box-shadow:0 -22px 70px rgba(0,0,0,.6);padding:10px 13px calc(14px + env(safe-area-inset-bottom));overflow:auto}.tm-copilot-sheet.show{transform:translateX(-50%) translateY(0)}.tm-copilot-handle{width:46px;height:5px;background:#3b3b46;border-radius:99px;margin:2px auto 12px}.tm-copilot-head{display:flex;gap:10px;align-items:center;margin-bottom:12px}.tm-copilot-face{width:46px;height:46px;border-radius:17px;background:linear-gradient(135deg,#8b5cf6,#ff6b35);display:flex;align-items:center;justify-content:center;font-size:24px;flex:0 0 auto}.tm-copilot-title{flex:1;min-width:0}.tm-copilot-title b{display:block;font-size:17px}.tm-copilot-title small{display:block;color:#aaa;font-size:12px;margin-top:2px}.tm-copilot-close{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#ddd;border-radius:12px;padding:8px 10px}
  .tm-copilot-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:8px 0 12px}.tm-copilot-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 8px}.tm-copilot-stat small{display:block;color:#888;font-size:10px}.tm-copilot-stat b{display:block;font-size:18px;margin-top:4px}.tm-copilot-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.tm-copilot-btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;border-radius:13px;padding:10px 9px;font-size:12px;font-weight:800}.tm-copilot-btn.primary{background:linear-gradient(135deg,#ff6b35,#df4a16);border-color:transparent}.tm-copilot-btn.green{background:rgba(37,211,102,.14);border-color:rgba(37,211,102,.35);color:#80f2aa}.tm-copilot-btn.blue{background:rgba(42,171,238,.13);border-color:rgba(42,171,238,.34);color:#78d3ff}.tm-copilot-btn.gold{background:rgba(216,180,106,.14);border-color:rgba(216,180,106,.34);color:#e7c97f}.tm-copilot-btn.danger{background:rgba(231,76,60,.13);border-color:rgba(231,76,60,.34);color:#ff8f83}
  .tm-copilot-task{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:11px;margin-bottom:9px;border-left:3px solid #ff6b35}.tm-copilot-task.u3{border-left-color:#e74c3c}.tm-copilot-task.u2{border-left-color:#ff6b35}.tm-copilot-task.u1{border-left-color:#2aabee}.tm-copilot-task-top{display:flex;gap:10px}.tm-copilot-ico{width:34px;height:34px;border-radius:13px;background:rgba(255,107,53,.13);display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}.tm-copilot-task-main{flex:1;min-width:0}.tm-copilot-task-main b{display:block;font-size:13px;line-height:1.25}.tm-copilot-task-main small{display:block;color:#aaa;font-size:11px;line-height:1.35;margin-top:4px}.tm-copilot-task-actions{display:flex;gap:7px;margin-top:10px}.tm-copilot-task-actions .tm-copilot-btn{padding:8px 9px;flex:1}.tm-copilot-agents{display:flex;gap:8px;overflow:auto;padding-bottom:4px;margin:8px 0 12px}.tm-copilot-agent{min-width:154px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px}.tm-copilot-agent.crit{border-color:rgba(231,76,60,.35);background:rgba(231,76,60,.08)}.tm-copilot-agent b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-copilot-agent small{display:block;color:#999;font-size:10px;margin-top:4px;line-height:1.25}.tm-copilot-agent .st{display:inline-flex;margin-top:7px;border-radius:99px;padding:3px 7px;font-size:9px;font-weight:900;background:rgba(37,211,102,.13);color:#75f0a1}.tm-copilot-agent.crit .st{background:rgba(231,76,60,.16);color:#ff9187}.tm-copilot-hot{display:flex;gap:9px;overflow:auto;padding-bottom:4px;margin:8px 0 12px}.tm-copilot-hot-card{min-width:172px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px}.tm-copilot-hot-card b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-copilot-hot-card small{display:block;color:#999;font-size:10px;margin-top:4px}.tm-copilot-empty{color:#aaa;text-align:center;padding:18px 8px;font-size:13px}.tm-copilot-chip{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(255,107,53,.14);color:#ffae8a;font-size:10px;font-weight:900;margin-top:6px}.tm-copilot-toast{position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(120%);z-index:100000;width:calc(min(560px,100%) - 28px);background:#1a1a22;border:1px solid rgba(37,211,102,.32);border-radius:17px;padding:12px;color:#effff3;box-shadow:0 16px 50px rgba(0,0,0,.45);transition:.22s ease;font-size:13px}.tm-copilot-toast.show{transform:translateX(-50%) translateY(0)}
  @media (min-width: 760px){.tm-copilot-bubble{bottom:24px;right:24px}.tm-copilot-sheet{right:22px;left:auto;bottom:18px;transform:translateY(110%);border-radius:26px;width:430px;max-height:82vh}.tm-copilot-sheet.show{transform:translateY(0)}.tm-copilot-summary{grid-template-columns:repeat(2,1fr)}}@media (max-width:380px){.tm-copilot-summary{grid-template-columns:repeat(2,1fr)}.tm-copilot-actions{grid-template-columns:1fr}.tm-copilot-task-actions{flex-direction:column}}
  body:not(.admin-mode) .tm-copilot-bubble, body:not(.admin-mode) .tm-copilot-sheet{display:none!important}`;
  document.head.appendChild(st);
}

function ensureUI(){
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
function toast(t){ const el=$('#tmCopilotToast'); if(!el) return; el.textContent='✅ '+t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2800); }
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
function renderSheet(){
  const body = $('#tmCopilotBody'); if(!body) return;
  const m = state.metrics || {};
  const topTasks = state.tasks || [];
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
    ${state.agents && state.agents.length ? `<div class="tm-copilot-agents">${state.agents.map(a=>`<div class="tm-copilot-agent ${a.critical?'crit':''}"><b>${a.icon} ${esc(a.name)}</b><small>${esc(a.hint)}</small><span class="st">${esc(a.status)} · ${a.count}</span></div>`).join('')}</div>` : ''}
    ${state.hot && state.hot.length ? `<div class="tm-copilot-hot">${state.hot.map(x=>`<div class="tm-copilot-hot-card"><b>${iconFor(x.p)} ${esc(x.p.nombre)}</b><small>${x.views} vistas · ${x.wa} WhatsApp · stock ${num(x.p.stock)}</small><span class="tm-copilot-chip">score ${x.score}</span></div>`).join('')}</div>` : ''}
    <div class="tm-copilot-list">
      ${topTasks.length ? topTasks.map(t=>taskHtml(t)).join('') : '<div class="tm-copilot-empty">✅ Sin tareas urgentes. Puedes revisar productos o publicar novedades.</div>'}
    </div>`;
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
    const el = e.target.closest('[data-cop]'); if(!el) return;
    const act = el.dataset.cop;
    if(act==='close') closeSheet();
    if(act==='refresh') refresh(true);
    if(act==='launchAgents') refresh(true).then(()=>toast('Agentes ejecutados: inventario, CRM, marketing, SEO y sistema')); 
    if(act==='enableAlerts') enableAlerts();
    if(act==='openInicio') switchTo('inicio');
    if(act==='snooze'){ localStorage.setItem(LS.snooze, String(Date.now()+2*60*60*1000)); closeSheet(); toast('Copiloto oculto por 2 horas'); }
    if(act==='task') switchTo(el.dataset.tab || 'inicio');
    if(act==='dismiss') { const set=dismissedSet(); set.add(el.dataset.id); saveDismissed(set); state.tasks = state.tasks.filter(t=>t.id!==el.dataset.id); updateBubble(); renderSheet(); }
    if(act==='pushHot') queuePushForProduct(el.dataset.pid);
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
    if(!isAdminVisible()){ setTimeout(wait,700); return; }
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
