/* urgencia-ventas.js — Motor de urgencia para TiendaMax
   1. Badge rojo pulsante "¡Solo N!" en tarjetas con stock ≤ 3
   2. "N personas ven esto ahora" en detalle de producto (Firebase live)
   3. Push de carrito abandonado a los 25 minutos
*/
(function(){
'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _base(){
  try{const c=JSON.parse(localStorage.getItem('firebaseConfig')||'{}');
    return c.databaseURL||(c.projectId?'https://'+c.projectId+'-default-rtdb.firebaseio.com':null);
  }catch(e){return null;}
}
function _carrito(){
  try{const d=JSON.parse(localStorage.getItem('carrito_v2')||'{}');
    return Date.now()>(d.expires||0)?[]:(d.items||[]);
  }catch(e){return[];}
}
function _productos(){
  try{if(Array.isArray(window.productos))return window.productos;}catch(e){}
  try{return JSON.parse(localStorage.getItem('productos')||'[]');}catch(e){return[];}
}
const _sid = Math.random().toString(36).slice(2,12);

// ─────────────────────────────────────────────────────────────────────────────
// 1. BADGE "¡Solo N!" cuando stock ≤ 3
// ─────────────────────────────────────────────────────────────────────────────
function _stockDe(card){
  // Primero intenta por data-product-id y el array global de productos
  const id = card.dataset.productId;
  if(id){
    const ps = _productos();
    const p = ps.find(x=>String(x.id)===id);
    if(p) return Number(p.stock)||0;
  }
  // Fallback: parsear texto ".stock-count"
  const el = card.querySelector('.stock-count');
  if(el){ const m=el.textContent.match(/\d+/); if(m) return parseInt(m[0]); }
  return -1;
}

// Badge overlay centrado eliminado — la señal de stock bajo queda solo
// en la pastilla badge-stock-urgente de la esquina superior izquierda.

// ─────────────────────────────────────────────────────────────────────────────
// 2. "N personas ven esto ahora" — tracking real en Firebase RTDB
// ─────────────────────────────────────────────────────────────────────────────
let _viewingId=null, _pingInterval=null;
const VIEWER_TTL = 4*60*1000; // 4 minutos de ventana activa
const PING_EVERY  = 50*1000;  // ping cada 50s para mantenerse activo

async function _pingViewer(id){
  const base=_base(); if(!base||!id) return;
  try{
    await fetch(`${base}/viewers/${encodeURIComponent(id)}/${_sid}.json`,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Date.now())
    });
  }catch(e){}
}
async function _leaveViewer(id){
  const base=_base(); if(!base||!id) return;
  try{
    await fetch(`${base}/viewers/${encodeURIComponent(id)}/${_sid}.json`,{method:'DELETE'});
  }catch(e){}
}
async function _contarViewers(id){
  const base=_base(); if(!base||!id) return 1;
  try{
    const r=await fetch(`${base}/viewers/${encodeURIComponent(id)}.json?_=${Date.now()}`,{cache:'no-store'});
    if(!r.ok) return 1;
    const data=await r.json();
    if(!data||typeof data!=='object') return 1;
    const cutoff=Date.now()-VIEWER_TTL;
    // Contar activos y limpiar stale en segundo plano
    let activos=0;
    Object.entries(data).forEach(([sid,ts])=>{
      if(typeof ts==='number'&&ts>cutoff){ activos++; }
      else{
        fetch(`${base}/viewers/${encodeURIComponent(id)}/${sid}.json`,{method:'DELETE'}).catch(()=>{});
      }
    });
    return Math.max(activos,1);
  }catch(e){return 1;}
}

function _iniciarViewer(id){
  if(_viewingId===id) return;
  if(_viewingId) _leaveViewer(_viewingId);
  clearInterval(_pingInterval);
  _viewingId=id;
  _pingViewer(id);
  _pingInterval=setInterval(()=>_pingViewer(id), PING_EVERY);
}
function _detenerViewer(){
  if(_viewingId){ _leaveViewer(_viewingId); _viewingId=null; }
  clearInterval(_pingInterval); _pingInterval=null;
}

async function _mostrarContadorViewers(id){
  const count=await _contarViewers(id);
  // Buscar el modal abierto
  const modal=document.getElementById('modalProducto');
  if(!modal||modal.classList.contains('hidden')) return;
  let el=modal.querySelector('.tm-viendo');
  if(!el){
    el=document.createElement('div');
    el.className='tm-viendo';
    // Insertar después del bloque de precio
    const anchor=modal.querySelector('.detail-price-wrap,#detailPriceActual,.detail-price-main');
    if(anchor){const wrap=anchor.closest('.detail-price-wrap,p');if(wrap)wrap.insertAdjacentElement('afterend',el);else anchor.insertAdjacentElement('afterend',el);}
    else{
      const info=modal.querySelector('.detail-info,.detail-body');
      if(info) info.prepend(el);
    }
  }
  if(count>=2){
    el.innerHTML=`<span class="tm-viendo-dot"></span>${count} persona${count!==1?'s':''} ve${count===1?'':'n'} esto ahora`;
    el.style.display='flex';
  } else {
    el.style.display='none';
  }
}

// Hook abrirDetalleProducto y cerrarDetalle (defer-safe: espera a que script.js esté listo)
window.addEventListener('load',()=>{
  const origAbrir=window.abrirDetalleProducto;
  if(typeof origAbrir==='function'){
    window.abrirDetalleProducto=function(id){
      const r=origAbrir.apply(this,arguments);
      const sid=String(id);
      _iniciarViewer(sid);
      setTimeout(()=>_mostrarContadorViewers(sid),700);
      return r;
    };
  }
  const origCerrar=window.cerrarDetalle;
  if(typeof origCerrar==='function'){
    window.cerrarDetalle=function(){
      _detenerViewer();
      return origCerrar.apply(this,arguments);
    };
  }
});

// También detectar cierre por click en botones de cerrar
document.addEventListener('click',e=>{
  if(e.target.closest('[data-action="cerrarDetalle"],[onclick*="cerrarDetalle"],[class*="modal-close"],[class*="close-btn"]')){
    _detenerViewer();
  }
});
window.addEventListener('pagehide',_detenerViewer);

// ─────────────────────────────────────────────────────────────────────────────
// 3. PUSH DE CARRITO ABANDONADO — 25 minutos después de agregar al carrito
// ─────────────────────────────────────────────────────────────────────────────
let _abandonTimer=null, _abandonSent=false;

async function _enviarPushAbandon(){
  if(_abandonSent) return;
  const items=_carrito();
  if(!items.length) return;
  _abandonSent=true;
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(!reg?.showNotification) return;
    const item=items[0];
    const extra=items.length>1?` y ${items.length-1} más`:'';
    reg.showNotification('🛒 Tu pedido te espera',{
      body:`${item.nombre||'Producto'}${extra} ${items.length>1?'siguen':'sigue'} en tu carrito. ¡Complétalo antes de que se agote!`,
      icon: item.imagen||'/iconos/icon-192.png',
      badge:'/iconos/icon-192.png',
      data:{url:'/?carrito=1'},
      tag:'carrito-abandonado',
      vibrate:[200,100,200]
    });
  }catch(e){}
}

function _programarAbandon(){
  clearTimeout(_abandonTimer);
  if(!_carrito().length) return;
  _abandonSent=false;
  _abandonTimer=setTimeout(_enviarPushAbandon, 25*60*1000);
}
function _cancelarAbandon(){
  _abandonSent=true;
  clearTimeout(_abandonTimer);
  _abandonTimer=null;
}

window.addEventListener('load',()=>{
  // Hook agregarAlCarrito
  const origAgregar=window.agregarAlCarrito;
  if(typeof origAgregar==='function'){
    window.agregarAlCarrito=function(){
      const r=origAgregar.apply(this,arguments);
      setTimeout(_programarAbandon,300);
      return r;
    };
  }
  // Cancelar cuando el usuario completa el pedido vía WhatsApp
  ['comprarCarrito','tmComprar','contactarProducto','_mensajeOrdenWA'].forEach(fn=>{
    const orig=window[fn];
    if(typeof orig==='function'){
      window[fn]=function(){ _cancelarAbandon(); return orig.apply(this,arguments); };
    }
  });
  // Si hay carrito activo al cargar la página (usuario que regresa), programar
  setTimeout(()=>{ if(_carrito().length) _programarAbandon(); }, 3000);
});

})();
