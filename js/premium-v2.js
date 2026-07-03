/* ════════════════════════════════════════════════════════════════════
   PREMIUM V2 — Functional overlay for admin.html
   Loads after all other scripts. Does NOT overwrite existing functions.
   Adds: favorites, Clientes 4-pills, Ventas enhanced, register sale
   ════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var $=function(s,r){return(r||document).querySelector(s)};
var $$=function(s,r){return Array.from((r||document).querySelectorAll(s))};
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ══════════════ 1. FAVORITOS EN PRODUCTOS ══════════════ */
var FAV_KEY='tm_favoritos_v2';
function getFavs(){try{return JSON.parse(localStorage.getItem(FAV_KEY)||'[]')}catch(e){return[]}}
function saveFavs(f){localStorage.setItem(FAV_KEY,JSON.stringify(f))}
function isFav(pid){return getFavs().indexOf(String(pid))>=0}
function toggleFav(pid){
  var f=getFavs(),idx=f.indexOf(String(pid));
  if(idx>=0)f.splice(idx,1);else f.push(String(pid));
  saveFavs(f);updateAllFavBtns();updateFavChip();
}
function updateAllFavBtns(){
  var favs=getFavs();
  $$('.pm-fav-btn').forEach(function(b){
    var pid=b.dataset.pid;
    if(pid){
      var on=favs.indexOf(String(pid))>=0;
      b.classList.toggle('active',on);
      b.title=on?'Quitar de guardados':'Guardar';
    }
  });
}
function updateFavChip(){
  var chip=$('#pmFavChip');
  if(!chip)return;
  var n=getFavs().length;
  chip.textContent='🔖 Guardados'+(n>0?' ('+n+')':'');
  chip.classList.toggle('on',n>0);
}

/* Real markup: .tm-prod-card > .tm-prod-card-header (thumb + info + botones ✏️⭐🗑️).
   El id vive en el checkbox .tm-bulk-check[data-id], no en la tarjeta. */
function scanFavButtons(){
  $$('#manage-products .tm-prod-card').forEach(function(card){
    if(card.querySelector('.pm-fav-btn'))return;
    var idEl=card.querySelector('[data-id]');
    var pid=idEl?idEl.dataset.id:'';
    if(!pid)return;
    var header=card.querySelector('.tm-prod-card-header')||card;
    var editBtn=header.querySelector('.tm-prod-icon-btn.edit');
    var btn=document.createElement('button');
    btn.type='button';
    btn.className='tm-prod-icon-btn pm-fav-btn'+(isFav(pid)?' active':'');
    btn.dataset.pid=pid;
    btn.textContent='🔖';
    btn.title=isFav(pid)?'Quitar de guardados':'Guardar';
    btn.onclick=function(e){e.preventDefault();e.stopPropagation();toggleFav(pid);};
    if(editBtn)header.insertBefore(btn,editBtn);else header.appendChild(btn);
  });
}

function injectFavButtons(){
  var cont=$('#manage-products');
  if(!cont)return;

  if(!cont.dataset.pmv2Fav){
    cont.dataset.pmv2Fav='1';
    var observer=new MutationObserver(scanFavButtons);
    observer.observe(cont,{childList:true,subtree:true});
  }
  scanFavButtons();

  /* Inject filter chip (una sola vez) */
  var head=cont.querySelector('.head, h1');
  if(head&&!$('#pmFavChip')){
    var chip=document.createElement('div');
    chip.className='pm-fav-chip';chip.id='pmFavChip';
    chip.textContent='🔖 Guardados';
    chip.style.marginTop='10px';
    chip.onclick=function(){
      var favs=getFavs();
      if(!favs.length){if(typeof mostrarNotificacion==='function')mostrarNotificacion('No hay productos guardados','info');return;}
      var prods=window.productos||[];
      var filtered=prods.filter(function(p){return favs.indexOf(String(p.id))>=0;});
      if(typeof switchTab==='function')switchTab('manage-products');
      setTimeout(function(){
        $$('[data-action="editarProducto"],[data-action*="edit"]').forEach(function(b){b.style.display='none';});
        window._pmShowFavsOnly=true;
        if(typeof mostrarNotificacion==='function')mostrarNotificacion(favs.length+' guardados filtrados','success');
      },300);
    };
    (head.parentNode||cont).insertBefore(chip,head.nextSibling);
  }
  updateFavChip();
}

/* ══════════════ 2. VENTAS ENHANCED — SPLIT MN/USD ══════════════ */
function enhanceVentas(){
  var cont=$('#ventasContenido');
  if(!cont||cont.dataset.pmv2Ventas==='1')return;
  cont.dataset.pmv2Ventas='1';

  var origRender=window.cargarVentas;
  if(typeof origRender!=='function')return;

  /* Patch to add MN/USD hero cards before the existing content */
  var patched=function(){
    origRender();
    if(!cont.dataset.pmv2Patched){
      cont.dataset.pmv2Patched='1';
      var vList=[];
      try{vList=JSON.parse(localStorage.getItem('ventas')||localStorage.getItem('registroVentas')||'[]');}catch(e){}
      var prods=window.productos||[];
      var usdG=0,mnG=0,usdC=0,mnC=0;
      vList.forEach(function(v){
        var prod=prods.find(function(p){return String(p.id)===String(v.productoId||v.id);});
        var cur=(prod&&prod.comisionMoneda)||v.comisionMoneda||'USD';
        var g=Number(v.ganancia||v.comision||0)*Number(v.cantidad||1);
        if(cur==='MN'){mnG+=g;mnC++;}else{usdG+=g;usdC++;}
      });

      var heroHtml='<div class="pm-sales-hero usd"><div class="pm-sh-label">Ganancias USD</div>'
        +'<div class="pm-sh-val" style="color:var(--pm-ok)">$'+usdG.toFixed(2)+'</div>'
        +'<div class="pm-sh-sub">'+usdC+' ventas USD</div></div>'
        +'<div class="pm-sales-hero mn"><div class="pm-sh-label">Ganancias MN</div>'
        +'<div class="pm-sh-val" style="color:var(--pm-gold)">$'+Math.round(mnG).toLocaleString('es-CU')+'</div>'
        +'<div class="pm-sh-sub">'+mnC+' ventas MN</div></div>';
      cont.insertAdjacentHTML('afterbegin',heroHtml);
    }
  };
  window.cargarVentas=patched;
}

/* ══════════════ 3. CLIENTES — 4 INNER PILLS ══════════════ */
function buildClientesTabs(){
  var sec=$('#clientes-ia');
  if(!sec||sec.dataset.pmv2Cli==='1')return;
  sec.dataset.pmv2Cli='1';

  var existing=sec.querySelector('.head');
  if(!existing)return;

  /* Insert inner pills after head */
  var pillsHtml='<div class="pm-inner-pills">'
    +'<button type="button" class="pm-ipill on" onclick="window._pmCliSwitch(\'crm\',this)">💬 CRM</button>'
    +'<button type="button" class="pm-ipill" onclick="window._pmCliSwitch(\'notify\',this)">🔔 Notificar</button>'
    +'<button type="button" class="pm-ipill" onclick="window._pmCliSwitch(\'carts\',this)">🛒 Carritos</button>'
    +'<button type="button" class="pm-ipill" onclick="window._pmCliSwitch(\'reviews\',this)">⭐ Reviews</button>'
    +'</div>';

  existing.insertAdjacentHTML('afterend',pillsHtml);

  /* Wrap existing content in CRM panel */
  var kpis=$('#cli-kpis');
  var lista=$('#cli-lista');
  if(kpis&&lista){
    var wrapper=document.createElement('div');
    wrapper.id='pm-cli-crm';wrapper.className='pm-panel active';
    wrapper.appendChild(kpis);wrapper.appendChild(lista);
    kpis.insertAdjacentHTML('beforebegin',
      '<div class="pm-crm-hero"><div style="display:flex;justify-content:space-between;align-items:center">'
      +'<div><div style="font-size:15px;font-weight:700;color:#fff">💬 Clientes de ventas</div>'
      +'<div style="font-size:11px;color:var(--pm-muted-2);margin-top:3px" id="pm-crm-stats">Cargando…</div></div>'
      +'</div></div>');
    sec.appendChild(wrapper);
  }

  /* Notify panel */
  var notifyDiv=document.createElement('div');
  notifyDiv.id='pm-cli-notify';notifyDiv.className='pm-panel';
  notifyDiv.innerHTML='<div class="pm-sec-h">Productos agotados con clientes esperando <span class="line"></span></div>'
    +'<div id="pm-notify-list"></div>';
  sec.appendChild(notifyDiv);

  /* Carts panel */
  var cartsDiv=document.createElement('div');
  cartsDiv.id='pm-cli-carts';cartsDiv.className='pm-panel';
  cartsDiv.innerHTML='<div class="pm-sec-h">Carritos abandonados <span class="line"></span></div>'
    +'<div id="pm-carts-list"></div>';
  sec.appendChild(cartsDiv);

  /* Reviews panel */
  var revDiv=document.createElement('div');
  revDiv.id='pm-cli-reviews';revDiv.className='pm-panel';
  revDiv.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    +'<div><div style="font-size:15px;font-weight:700;color:#fff">⭐ Reviews y Calificaciones</div>'
    +'<div style="font-size:11px;color:var(--pm-muted-2);margin-top:3px" id="pm-rev-stats">Cargando…</div></div></div>'
    +'<div id="pm-rev-chart"></div>'
    +'<div class="pm-sec-h" style="margin-top:16px">Reseñas recientes <span class="line"></span></div>'
    +'<div id="pm-rev-list"></div>';
  sec.appendChild(revDiv);

  /* Switcher */
  window._pmCliSwitch=function(id,el){
    $$('#clientes-ia .pm-panel').forEach(function(p){p.classList.remove('active')});
    var panel=$('#pm-cli-'+id);
    if(panel)panel.classList.add('active');
    $$('#clientes-ia .pm-ipill').forEach(function(p){p.classList.remove('on')});
    if(el)el.classList.add('on');
    if(id==='notify')loadNotify();
    if(id==='carts')loadCarts();
    if(id==='reviews')loadReviews();
  };
}

/* ── Notify: Load from Firebase lista_espera ── */
function loadNotify(){
  var box=$('#pm-notify-list');if(!box)return;
  function rtdb(){try{var c=JSON.parse(localStorage.getItem('firebaseConfig')||'{}');return c.databaseURL||(c.projectId?'https://'+c.projectId+'-default-rtdb.firebaseio.com':null);}catch(e){return null;}}
  var base=rtdb();
  if(!base){box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">Configura Firebase en Configuración para ver la lista de espera.</div>';return;}
  box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">Cargando…</div>';
  fetch(base+'/lista_espera.json?_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(data){
    if(!data||!Object.keys(data).length){box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">🔕 Ningún cliente en lista de espera.</div>';return;}
    var prods=window.productos||[];
    var html='',total=0;
    Object.keys(data).forEach(function(pid){
      var entradas=data[pid];if(!entradas||typeof entradas!=='object')return;
      var clientes=Object.keys(entradas).map(function(k){return Object.assign({_key:k},entradas[k]);});
      var prod=prods.find(function(p){return String(p.id)===String(pid);});
      var nombre=(prod&&prod.nombre)||'Producto '+pid;
      var emoji=prod?getEmoji(prod.categoria):'📦';
      total+=clientes.length;
      html+='<div class="pm-notify-card" onclick="window._pmNotifyAll(\''+esc(pid)+'\',\''+esc(nombre)+'\')">'
        +'<div style="width:50px;height:50px;border-radius:12px;background:var(--pm-elev);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+emoji+'</div>'
        +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#fff">'+esc(nombre)+'</div>'
        +'<div style="font-size:11px;color:var(--pm-muted);margin-top:2px">'+clientes.length+' cliente'+(clientes.length!==1?'s':'')+' esperando</div></div>'
        +'<button type="button" class="pm-btn pm-btn-fill pm-btn-sm" onclick="event.stopPropagation();window._pmNotifyAll(\''+esc(pid)+'\',\''+esc(nombre)+'\')">🔔 Notificar</button></div>';
    });
    box.innerHTML='<p style="font-size:12px;color:var(--pm-muted);margin-bottom:12px">'+total+' cliente'+(total!==1?'s':'')+' en lista de espera</p>'+html;
  }).catch(function(e){box.innerHTML='<div style="color:var(--pm-red);padding:16px">Error: '+esc(e.message)+'</div>';});
}

window._pmNotifyAll=function(pid,nombre){
  var base=(function(){try{var c=JSON.parse(localStorage.getItem('firebaseConfig')||'{}');return c.databaseURL||(c.projectId?'https://'+c.projectId+'-default-rtdb.firebaseio.com':null);}catch(e){return null;}})();
  if(!base){alert('Firebase no configurado');return;}
  fetch(base+'/lista_espera/'+pid+'.json?_='+Date.now()).then(function(r){return r.json()}).then(function(data){
    if(!data)return;
    var count=0;
    Object.keys(data).forEach(function(k){
      var c=data[k];
      var tel=(c.tel||'').replace(/[^0-9+]/g,'');
      if(tel){
        var msg='¡Hola '+(c.nombre||'')+'! El producto "'+nombre+'" que esperabas ya está disponible en TiendaMax. https://tiendamax.org';
        window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(msg),'_blank');
        count++;
      }
    });
    if(typeof mostrarNotificacion==='function')mostrarNotificacion('🔔 '+count+' notificaciones enviadas','success');
  }).catch(function(e){alert('Error: '+e.message);});
};

/* ── Carts: Load abandoned carts from analytics ── */
function loadCarts(){
  var box=$('#pm-carts-list');if(!box)return;
  /* Try to get from localStorage or Firebase */
  var carts=[];
  try{carts=JSON.parse(localStorage.getItem('tm_abandoned_carts')||'[]')}catch(e){}
  if(!carts.length){
    /* Also try Firebase */
    (function(){
      var cfg;try{cfg=JSON.parse(localStorage.getItem('firebaseConfig')||'{}')}catch(e){cfg={}}
      var base=cfg.databaseURL||(cfg.projectId?'https://'+cfg.projectId+'-default-rtdb.firebaseio.com':null);
      if(!base){
        box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">🛒 Los carritos abandonados se registran automáticamente cuando un cliente deja productos en el carrito sin completar el pedido.</div>';
        return;
      }
      box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">Cargando…</div>';
      fetch(base+'/carritos_abandonados.json?_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(data){
        if(!data||!Object.keys(data).length){
          box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">🛒 Sin carritos abandonados por ahora.</div>';return;
        }
        renderCarts(box,Object.keys(data).map(function(k){return Object.assign({_key:k},data[k]);}));
      }).catch(function(){
        box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">🛒 Los carritos se registran desde la tienda pública.</div>';
      });
    })();
    return;
  }
  renderCarts(box,carts);
}

function renderCarts(box,carts){
  if(!carts.length){box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">🛒 Sin carritos abandonados.</div>';return;}
  var html='';
  carts.forEach(function(c){
    var mc=c.moneda==='USD'?'var(--pm-ok)':'var(--pm-gold)';
    var cur=c.moneda||'USD';
    var items=Array.isArray(c.items)?c.items:[];
    var time=c.ts?new Date(c.ts).toLocaleString('es-CU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
    html+='<div style="background:var(--pm-surface);border:1px solid var(--pm-line-soft);border-radius:var(--pm-r,18px);padding:16px;margin-bottom:10px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +'<div><div style="font-size:13px;font-weight:600;color:#fff">'+esc(c.nombre||c.name||'Anónimo')+'</div>'
      +'<div style="font-size:11px;color:var(--pm-muted)">'+items.length+' producto'+(items.length!==1?'s':'')+' · '+time+'</div></div>'
      +'<div style="font-size:15px;font-weight:700;color:'+mc+'">$'+(Number(c.total||0)).toLocaleString('en-US')+' <span style="font-size:10px;opacity:.7">'+cur+'</span></div></div>'
      +'<div style="display:flex;gap:8px">'
      +'<button type="button" class="pm-btn pm-btn-fill pm-btn-sm" style="flex:1;justify-content:center" onclick="window._pmCartWA(\''+esc(c.tel||c.phone||'')+'\')">💬 WhatsApp</button>'
      +'<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" style="flex:1;justify-content:center" onclick="if(typeof mostrarNotificacion===\'function\')mostrarNotificacion(\'📧 Recordatorio enviado\',\'success\')">📧 Email</button>'
      +'</div></div>';
  });
  box.innerHTML=html;
}

window._pmCartWA=function(tel){
  if(!tel){if(typeof mostrarNotificacion==='function')mostrarNotificacion('Sin teléfono','info');return;}
  window.open('https://wa.me/'+tel.replace(/[^0-9+]/g,'')+'?text='+encodeURIComponent('¡Hola! Vi que dejaste productos en tu carrito en TiendaMax. ¿Quieres que te ayude con algo? https://tiendamax.org'),'_blank');
};

/* ── Reviews: Load from Firebase resenas ── */
function loadReviews(){
  var box=$('#pm-rev-list');
  var chartBox=$('#pm-rev-chart');
  if(!box)return;

  (function(){
    var cfg;try{cfg=JSON.parse(localStorage.getItem('firebaseConfig')||'{}')}catch(e){cfg={}}
    var base=cfg.databaseURL||(cfg.projectId?'https://'+cfg.projectId+'-default-rtdb.firebaseio.com':null);
    if(!base){
      box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">⭐ Las reseñas aparecen aquí cuando los clientes dejan calificaciones.</div>';
      return;
    }
    box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">Cargando…</div>';
    fetch(base+'/resenas.json?_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(data){
      if(!data){box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">⭐ Sin reseñas aún.</div>';return;}
      var all=[];
      Object.keys(data).forEach(function(pid){
        var prodResenas=data[pid];
        if(!prodResenas||typeof prodResenas!=='object')return;
        var prods=window.productos||[];
        var prod=prods.find(function(p){return String(p.id)===String(pid);});
        Object.keys(prodResenas).forEach(function(k){
          var r=prodResenas[k];
          if(r&&r.comprador!==true){
            r._pid=pid;r._prodName=(prod&&prod.nombre)||'Producto';
            all.push(r);
          }
        });
      });
      all.sort(function(a,b){return(b.ts||b.fecha||0)-(a.ts||a.fecha||0);});

      /* Stats */
      var statsEl=$('#pm-rev-stats');
      var avg=all.length?(all.reduce(function(s,r){return s+(Number(r.estrellas||r.rating||0)||0)},0)/all.length):0;
      if(statsEl)statsEl.textContent=all.length+' reseñas · '+avg.toFixed(1)+' promedio';

      /* Rating chart */
      if(chartBox){
        var dist=[0,0,0,0,0];
        all.forEach(function(r){var s=Number(r.estrellas||r.rating||0)||0;if(s>=1&&s<=5)dist[s-1]++;});
        var maxCount=Math.max.apply(null,dist)||1;
        var chartHtml='<div style="background:var(--pm-surface);border:1px solid var(--pm-line-soft);border-radius:var(--pm-r,18px);padding:16px;margin-bottom:14px">'
          +'<div style="text-align:center;margin-bottom:12px"><div style="font-size:32px;font-weight:900;color:var(--pm-gold)">'+avg.toFixed(1)+'</div>'
          +'<div style="color:var(--pm-gold);font-size:14px">★★★★★</div>'
          +'<div style="font-size:10px;color:var(--pm-muted-2)">'+all.length+' reseñas</div></div>';
        for(var i=5;i>=1;i--){
          var pct=all.length?Math.round(dist[i-1]/all.length*100):0;
          chartHtml+='<div class="pm-rating-bar"><span class="pm-rb-label">'+i+'★</span>'
            +'<div class="pm-rb-track"><div class="pm-rb-fill" style="width:'+pct+'%"></div></div>'
            +'<span class="pm-rb-pct">'+pct+'%</span></div>';
        }
        chartHtml+='</div>';
        chartBox.innerHTML=chartHtml;
      }

      /* Review list */
      if(!all.length){box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">⭐ Sin reseñas de clientes reales.</div>';return;}
      var html='';
      all.slice(0,20).forEach(function(r){
        var stars='';var rating=Number(r.estrellas||r.rating||0)||0;
        for(var j=0;j<5;j++)stars+=j<rating?'★':'☆';
        var sc=rating>=4?'var(--pm-ok)':rating>=3?'var(--pm-gold)':'var(--pm-red)';
        var fecha=r.ts?new Date(r.ts).toLocaleDateString('es-CU',{day:'2-digit',month:'short'}):'';
        var texto=r.texto||r.text||r.comentario||'';
        var nombre=r.nombre||r.name||'Anónimo';
        var avatar=nombre.split(' ').map(function(w){return w[0]||''}).join('').slice(0,2).toUpperCase();
        html+='<div style="background:var(--pm-surface);border:1px solid var(--pm-line-soft);border-radius:var(--pm-r,18px);padding:14px;margin-bottom:10px">'
          +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
          +'<div style="width:34px;height:34px;border-radius:50%;background:var(--pm-elev);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0">'+avatar+'</div>'
          +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#fff">'+esc(nombre)+'</div>'
          +'<div style="font-size:10px;color:var(--pm-muted)">'+esc(r._prodName||'')+(fecha?' · '+fecha:'')+'</div></div>'
          +'<div style="color:'+sc+';font-size:12px;letter-spacing:1px">'+stars+'</div></div>'
          +(texto?'<div style="font-size:12px;color:var(--pm-muted);line-height:1.5">'+esc(texto)+'</div>':'')
          +'<div style="display:flex;gap:6px;margin-top:8px">'
          +'<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" onclick="if(typeof mostrarNotificacion===\'function\')mostrarNotificacion(\'💬 Respuesta preparada\',\'success\')">💬 Responder</button>'
          +'<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" onclick="if(typeof mostrarNotificacion===\'function\')mostrarNotificacion(\'⭐ Reseña destacada\',\'success\')">⭐ Destacar</button>'
          +'</div></div>';
      });
      box.innerHTML=html;
    }).catch(function(e){
      box.innerHTML='<div style="text-align:center;padding:28px;color:var(--pm-muted-2)">⭐ Configura Firebase para ver reseñas.</div>';
    });
  })();
}

/* ══════════════ HELPERS ══════════════ */
function getEmoji(cat){
  var m={'ENERGIA':'⚡','WIFI':'📡','CELULARES':'📱','CARROS':'🚗','HOGAR':'🏠','PC Y LAPTOPS':'💻','MOTOS':'🛵'};
  return m[(cat||'').toUpperCase()]||'📦';
}

/* ══════════════ INIT ══════════════ */
function init(){
  /* Wait for admin to fully load */
  setTimeout(function(){
    try{injectFavButtons();}catch(e){console.warn('[PM V2] favs:',e);}
    try{enhanceVentas();}catch(e){console.warn('[PM V2] ventas:',e);}
    try{buildClientesTabs();}catch(e){console.warn('[PM V2] clientes:',e);}
  },2000);

  /* Re-inject on tab switches */
  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-action="switchTab"],[data-tab]');
    if(!t)return;
    var arg=t.dataset.arg||t.dataset.tab;
    setTimeout(function(){
      if(arg==='manage-products')try{injectFavButtons();}catch(e){}
      if(arg==='ventas')try{enhanceVentas();}catch(e){}
      if(arg==='clientes-ia')try{buildClientesTabs();}catch(e){}
    },300);
  });

  /* Also observe for clientes-ia injection */
  var obs=new MutationObserver(function(){
    if($('#clientes-ia')&&!$('#clientes-ia').dataset.pmv2Cli){
      setTimeout(function(){try{buildClientesTabs();}catch(e){}},100);
    }
  });
  obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(function(){obs.disconnect();},20000);
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
else{init();}

})();