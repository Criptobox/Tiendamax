const TM_PLANTILLAS_KEY="tm_plantillas_v1",TM_PLANTILLA_VARS=[{v:"nombre",d:"Nombre del producto"},{v:"descripcion",d:"Descripci\xF3n completa"},{v:"inicio_desc",d:"Primeras 2 l\xEDneas de la descripci\xF3n"},{v:"precioActual",d:"Precio de venta"},{v:"precioOriginal",d:"Precio antes del descuento"},{v:"ahorro",d:"Cu\xE1nto se ahorra"},{v:"descuento",d:"Porcentaje de descuento"},{v:"garantia",d:"Garant\xEDa del producto"},{v:"stock",d:"Unidades disponibles"},{v:"categoria",d:"Categor\xEDa"},{v:"wa_link",d:"Enlace de WhatsApp con el pedido escrito"},{v:"url_producto",d:"Enlace a la ficha en la tienda"},{v:"hashtags",d:"Hashtags de la categor\xEDa"},{v:"linea_precio",d:'Precio (con el "antes" solo si hay descuento)'},{v:"linea_ahorro",d:"Cu\xE1nto ahorra \u2014 vac\xEDo si no hay descuento"},{v:"linea_garantia",d:"Garant\xEDa \u2014 vac\xEDo si el producto no la tiene"},{v:"linea_stock",d:"Unidades \u2014 vac\xEDo si est\xE1 agotado"}];function _tmNum(t){const n=Number(t);return isFinite(n)?n:0}function _tmWaNumero(){try{if(typeof pubWaNum=="function")return pubWaNum()}catch(t){}return String(localStorage.getItem("whatsappNumero")||localStorage.getItem("adminWhatsappNum")||"5354320170").replace(/\D/g,"")}function _tmUrlProducto(t,n){try{if(typeof pubUrl=="function")return pubUrl(t,n||"copy")}catch(e){}return"https://tiendamax.org/p/producto-"+t.id+".html"}function tmVarsProducto(t,n){if(!t)return{};const e=_tmNum(t.precioActual),r=_tmNum(t.precioOriginal)||e,a=Math.max(0,r-e),i=String(t.descripcion||"").trim(),o=_tmUrlProducto(t,n),c=String(t.categoria||"").trim();return{nombre:t.nombre||"",descripcion:i,inicio_desc:i.split(`
`).slice(0,2).join(`
`),precioActual:String(e),precioOriginal:String(r),ahorro:String(a),descuento:String(_tmNum(t.descuento)),garantia:t.garantia||"Consultar",stock:String(_tmNum(t.stock)),categoria:c,wa_link:function(){try{if(typeof pubWaLink=="function")return pubWaLink(t,n||"copy")}catch(s){}return"https://wa.me/"+_tmWaNumero()+"?text="+encodeURIComponent("Hola, quiero: "+(t.nombre||"")+`
`+o)}(),url_producto:o,linea_precio:a>0?"\u{1F4B0} Antes $"+r+" \u2192 AHORA $"+e+" USD":"\u{1F4B0} Precio: $"+e+" USD",linea_ahorro:a>0?"\u{1F389} Ahorras $"+a+" USD"+(_tmNum(t.descuento)>0?" ("+_tmNum(t.descuento)+"%)":""):"",linea_garantia:t.garantia&&String(t.garantia).trim()?"\u{1F6E1}\uFE0F Garant\xEDa: "+String(t.garantia).trim():"",linea_stock:_tmNum(t.stock)>0?"\u{1F4E6} Quedan "+_tmNum(t.stock)+" unidades":"",hashtags:("#TiendaMax #Cuba "+(c?"#"+c.replace(/\s+/g,""):"")).trim()}}function tmAplicarPlantilla(t,n,e){const r=tmVarsProducto(n,e);return String(t||"").replace(/\{(\w+)\}/g,(i,o)=>Object.prototype.hasOwnProperty.call(r,o)?r[o]:i).replace(/[ \t]+$/gm,"").replace(/\n{3,}/g,`

`).trim()}function tmPlantillasPorDefecto(){return[{id:"def_fb",nombre:"\u{1F4D8} Facebook \u2014 completa",red:"fb",texto:`\u{1F6CD}\uFE0F {nombre}

{inicio_desc}

{linea_precio}
{linea_garantia}
{linea_stock}

\u{1F4F2} P\xEDdelo aqu\xED:
{wa_link}

\u{1F517} Fotos y detalles:
{url_producto}

{hashtags}`},{id:"def_oferta",nombre:"\u{1F525} Facebook \u2014 con descuento",red:"fb",texto:`\u{1F525} OFERTA \u2014 {nombre}

{inicio_desc}

{linea_precio}
{linea_ahorro}
{linea_garantia}
{linea_stock}

\u{1F4F2} {wa_link}

{hashtags}`},{id:"def_rev",nombre:"\u{1F7E0} Revolico \u2014 anuncio",red:"revolico",texto:`{nombre}

{inicio_desc}

{linea_precio}
{linea_garantia}
{linea_stock}

Pedir por WhatsApp: {wa_link}`},{id:"def_wa",nombre:"\u{1F7E2} Estado de WhatsApp \u2014 corta",red:"wa",texto:`{nombre} \u2014 \${precioActual} USD
{linea_garantia}
P\xEDdelo: {wa_link}`}]}function tmPlantillas(){let t=null;try{t=JSON.parse(localStorage.getItem(TM_PLANTILLAS_KEY)||"null")}catch(n){}return!Array.isArray(t)||!t.length?tmPlantillasPorDefecto():t}function _tmGuardarPlantillas(t){try{return localStorage.setItem(TM_PLANTILLAS_KEY,JSON.stringify(t)),!0}catch(n){return!1}}function tmGuardarPlantilla(t){if(!t||!t.nombre||!t.texto)return!1;const n=tmPlantillas().slice(),e=n.findIndex(r=>r.id===t.id);return e>=0?n[e]=Object.assign({},n[e],t):n.push(Object.assign({id:"pl_"+Date.now(),usos:0},t)),_tmGuardarPlantillas(n)}function tmBorrarPlantilla(t){return _tmGuardarPlantillas(tmPlantillas().filter(n=>n.id!==t))}function tmContarUsoPlantilla(t){const n=tmPlantillas().slice(),e=n.find(r=>r.id===t);e&&(e.usos=(_tmNum(e.usos)||0)+1,_tmGuardarPlantillas(n))}const TM_PUBLOG_KEY="tm_publog_v1",TM_PUBLOG_MAX=600;function tmRegistrarPublicacion(t,n,e){if(!(!t||!n))try{const r=tmPublicaciones().slice();r.push({pid:String(t),red:String(n),destino:String(e||""),ts:Date.now()}),localStorage.setItem(TM_PUBLOG_KEY,JSON.stringify(r.slice(-TM_PUBLOG_MAX)))}catch(r){}}function tmPublicaciones(){try{const t=JSON.parse(localStorage.getItem(TM_PUBLOG_KEY)||"[]");return Array.isArray(t)?t:[]}catch(t){return[]}}function tmUltimaPublicacion(t,n){const e=String(t);let r=0;return tmPublicaciones().forEach(a=>{a.pid===e&&(n&&a.red!==n||a.ts>r&&(r=a.ts))}),r||null}function tmDiasSinPublicar(t,n){const e=tmUltimaPublicacion(t,n);return e?Math.floor((Date.now()-e)/864e5):null}function tmPublicacionesPorDia(t){const n={};return tmPublicaciones().forEach(e=>{if(t&&e.ts<t)return;const r=new Date(e.ts),a=r.getFullYear()+"-"+String(r.getMonth()+1).padStart(2,"0")+"-"+String(r.getDate()).padStart(2,"0");n[a]=(n[a]||0)+1}),n}function tmProductosSinPublicar(t,n){const e=_tmNum(n)||21;return(t||[]).filter(r=>{if(!r||r.activo===!1)return!1;const a=tmDiasSinPublicar(r.id);return a===null||a>=e})}function tmPublicacionesRecientes(t){return tmPublicaciones().slice().sort((n,e)=>e.ts-n.ts).slice(0,_tmNum(t)||20)}
