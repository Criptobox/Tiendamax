/* urgencia-ventas.js — Motor de urgencia para TiendaMax
   1. Badge rojo pulsante "¡Solo N!" en tarjetas con stock ≤ 3
   2. Push de carrito abandonado a los 25 minutos
*/
(function(){
'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _carrito(){
  try{const d=JSON.parse(localStorage.getItem('carrito_v2')||'{}');
    return Date.now()>(d.expires||0)?[]:(d.items||[]);
  }catch(e){return[];}
}
function _productos(){
  try{if(Array.isArray(window.productos))return window.productos;}catch(e){}
  try{return JSON.parse(localStorage.getItem('productos')||'[]');}catch(e){return[];}
}

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

// Sección 2 ("N personas ven esto ahora", contador live vía Firebase RTDB)
// eliminada: apuntaba a #modalProducto y window.cerrarDetalle, ninguno de
// los dos existe (el modal real es #productDetailModal, la función real
// es cerrarDetalleModal) — el contador nunca llegó a pintarse, pero
// igual escribía a Firebase cada 50s por sesión sin limpiar nunca al
// cerrar el modal. El conteo de vistas real y visible ya vive en
// #detailPersonasViendo (tm-product.src.js).

// ─────────────────────────────────────────────────────────────────────────────
// 2. PUSH DE CARRITO ABANDONADO — 25 minutos después de agregar al carrito
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
