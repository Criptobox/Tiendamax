const TM_PLANTILLAS_KEY="tm_plantillas_v1",TM_PLANTILLA_VARS=[{v:"nombre",d:"Nombre del producto"},{v:"descripcion",d:"Descripci\xF3n completa"},{v:"inicio_desc",d:"Primeras 2 l\xEDneas de la descripci\xF3n"},{v:"precioActual",d:"Precio de venta"},{v:"precioOriginal",d:"Precio antes del descuento"},{v:"ahorro",d:"Cu\xE1nto se ahorra"},{v:"descuento",d:"Porcentaje de descuento"},{v:"garantia",d:"Garant\xEDa del producto"},{v:"stock",d:"Unidades disponibles"},{v:"categoria",d:"Categor\xEDa"},{v:"wa_link",d:"Enlace de WhatsApp con el pedido escrito"},{v:"url_producto",d:"Enlace a la ficha en la tienda"},{v:"hashtags",d:"Hashtags de la categor\xEDa"}];function _tmNum(t){const n=Number(t);return isFinite(n)?n:0}function _tmWaNumero(){try{if(typeof pubWaNum=="function")return pubWaNum()}catch(t){}return String(localStorage.getItem("whatsappNumero")||localStorage.getItem("adminWhatsappNum")||"5354320170").replace(/\D/g,"")}function _tmUrlProducto(t,n){try{if(typeof pubUrl=="function")return pubUrl(t,n||"copy")}catch(r){}return"https://tiendamax.org/p/producto-"+t.id+".html"}function tmVarsProducto(t,n){if(!t)return{};const r=_tmNum(t.precioActual),e=_tmNum(t.precioOriginal)||r,o=Math.max(0,e-r),a=String(t.descripcion||"").trim(),c=_tmUrlProducto(t,n),i=String(t.categoria||"").trim();return{nombre:t.nombre||"",descripcion:a,inicio_desc:a.split(`
`).slice(0,2).join(`
`),precioActual:String(r),precioOriginal:String(e),ahorro:String(o),descuento:String(_tmNum(t.descuento)),garantia:t.garantia||"Consultar",stock:String(_tmNum(t.stock)),categoria:i,wa_link:function(){try{if(typeof pubWaLink=="function")return pubWaLink(t,n||"copy")}catch(s){}return"https://wa.me/"+_tmWaNumero()+"?text="+encodeURIComponent("Hola, quiero: "+(t.nombre||"")+`
`+c)}(),url_producto:c,hashtags:("#TiendaMax #Cuba "+(i?"#"+i.replace(/\s+/g,""):"")).trim()}}function tmAplicarPlantilla(t,n,r){const e=tmVarsProducto(n,r);return String(t||"").replace(/\{(\w+)\}/g,(o,a)=>Object.prototype.hasOwnProperty.call(e,a)?e[a]:o)}function tmPlantillasPorDefecto(){return[{id:"def_fb",nombre:"\u{1F4D8} Facebook \u2014 completa",red:"fb",texto:`\u{1F6CD}\uFE0F {nombre}

{inicio_desc}

\u{1F4B0} \${precioActual} USD
\u{1F6E1}\uFE0F Garant\xEDa: {garantia}
\u{1F4E6} Quedan {stock} unidades

\u{1F4F2} P\xEDdelo aqu\xED:
{wa_link}

\u{1F517} Fotos y detalles:
{url_producto}

{hashtags}`},{id:"def_oferta",nombre:"\u{1F525} Facebook \u2014 con descuento",red:"fb",texto:`\u{1F525} OFERTA \u2014 {nombre}

{inicio_desc}

\u{1F4B0} Antes \${precioOriginal} \u2192 AHORA \${precioActual} USD
\u{1F389} Ahorras \${ahorro} USD ({descuento}%)
\u{1F6E1}\uFE0F Garant\xEDa: {garantia}
\u26A1 \xA1Solo quedan {stock}!

\u{1F4F2} {wa_link}

{hashtags}`},{id:"def_rev",nombre:"\u{1F7E0} Revolico \u2014 anuncio",red:"revolico",texto:`{nombre}

{inicio_desc}

Precio: \${precioActual} USD
Garant\xEDa: {garantia}
Disponibles: {stock}

Pedir por WhatsApp: {wa_link}`},{id:"def_wa",nombre:"\u{1F7E2} Estado de WhatsApp \u2014 corta",red:"wa",texto:`{nombre} \u2014 \${precioActual} USD
Garant\xEDa {garantia}
P\xEDdelo: {wa_link}`}]}function tmPlantillas(){let t=null;try{t=JSON.parse(localStorage.getItem(TM_PLANTILLAS_KEY)||"null")}catch(n){}return!Array.isArray(t)||!t.length?tmPlantillasPorDefecto():t}function _tmGuardarPlantillas(t){try{return localStorage.setItem(TM_PLANTILLAS_KEY,JSON.stringify(t)),!0}catch(n){return!1}}function tmGuardarPlantilla(t){if(!t||!t.nombre||!t.texto)return!1;const n=tmPlantillas().slice(),r=n.findIndex(e=>e.id===t.id);return r>=0?n[r]=Object.assign({},n[r],t):n.push(Object.assign({id:"pl_"+Date.now(),usos:0},t)),_tmGuardarPlantillas(n)}function tmBorrarPlantilla(t){return _tmGuardarPlantillas(tmPlantillas().filter(n=>n.id!==t))}function tmContarUsoPlantilla(t){const n=tmPlantillas().slice(),r=n.find(e=>e.id===t);r&&(r.usos=(_tmNum(r.usos)||0)+1,_tmGuardarPlantillas(n))}const TM_PUBLOG_KEY="tm_publog_v1",TM_PUBLOG_MAX=600;function tmRegistrarPublicacion(t,n,r){if(!(!t||!n))try{const e=tmPublicaciones().slice();e.push({pid:String(t),red:String(n),destino:String(r||""),ts:Date.now()}),localStorage.setItem(TM_PUBLOG_KEY,JSON.stringify(e.slice(-TM_PUBLOG_MAX)))}catch(e){}}function tmPublicaciones(){try{const t=JSON.parse(localStorage.getItem(TM_PUBLOG_KEY)||"[]");return Array.isArray(t)?t:[]}catch(t){return[]}}function tmUltimaPublicacion(t,n){const r=String(t);let e=0;return tmPublicaciones().forEach(o=>{o.pid===r&&(n&&o.red!==n||o.ts>e&&(e=o.ts))}),e||null}function tmDiasSinPublicar(t,n){const r=tmUltimaPublicacion(t,n);return r?Math.floor((Date.now()-r)/864e5):null}function tmPublicacionesPorDia(t){const n={};return tmPublicaciones().forEach(r=>{if(t&&r.ts<t)return;const e=new Date(r.ts),o=e.getFullYear()+"-"+String(e.getMonth()+1).padStart(2,"0")+"-"+String(e.getDate()).padStart(2,"0");n[o]=(n[o]||0)+1}),n}function tmProductosSinPublicar(t,n){const r=_tmNum(n)||21;return(t||[]).filter(e=>{if(!e||e.activo===!1)return!1;const o=tmDiasSinPublicar(e.id);return o===null||o>=r})}function tmPublicacionesRecientes(t){return tmPublicaciones().slice().sort((n,r)=>r.ts-n.ts).slice(0,_tmNum(t)||20)}
