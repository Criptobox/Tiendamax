/**
 * admin2.html — el panel nuevo, probado como se usa.
 *
 * Levanta el archivo en un navegador de verdad con el catálogo real y
 * comprueba que se puede TRABAJAR: subir stock y que quede guardado, buscar,
 * filtrar, editar precio y garantía, cambiar de piel y que aguante una
 * recarga. Un panel puede verse perfecto y no guardar nada.
 *
 * js/auth.js se sustituye por un doble: sin él, arrancar() se queda en la
 * pantalla de entrar y no se prueba nada. Es justo el fallo que tuve la
 * primera vez —forcé el panel a mano y estuve mirando el diseño con cero
 * productos cargados sin enterarme.
 *
 *   node tests/admin2_check.mjs
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const {chromium}=pkg;
import {readFile} from 'fs/promises'; import {extname,join,normalize} from 'path'; import {createServer} from 'http';
const ROOT='/home/user/Tiendamax';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
const srv=createServer(async(q,r)=>{const f=normalize(join(ROOT,decodeURIComponent(q.url.split('?')[0])));
 try{const b=await readFile(f); r.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'}); r.end(b);}catch(e){r.writeHead(404);r.end();}}).listen(9103);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const PROD=JSON.parse(await readFile(ROOT+'/productos.json','utf8'));
const ctx=await b.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
for(const h of ['googleapis.com','gstatic.com','firebaseio.com','identitytoolkit','google-analytics.com'])
  await ctx.route(u=>u.hostname.includes(h)||u.href.includes(h),r=>r.abort());
await ctx.route(u=>u.pathname.endsWith('/js/auth.js'), r=>r.fulfill({status:200,contentType:'text/javascript',
  body:"window.TMAuth={init:async()=>({ok:true}),usuario:()=>({email:'d@t.org'}),entrar:async()=>({ok:true}),salir:async()=>{}};"}));
await ctx.addInitScript(p=>{try{localStorage.setItem('productos',JSON.stringify(p));}catch(e){}},PROD);
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,170)));
await p.goto('http://localhost:9103/admin2.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1600);
const R=[]; let fallos=0;
const ok=(n,c)=>{ if(!c) fallos++; R.push((c?'✅':'❌')+' '+n); };

ok('el panel abre solo con sesión', await p.evaluate(()=>!document.getElementById('a2-panel').hidden));

// ── stock ±
await p.click('[data-v="inventario"]'); await p.waitForTimeout(700);
const antes = await p.evaluate(()=>{const f=document.querySelector('.pcard');
  return {id:f.dataset.id, txt:f.querySelector('.chip-st').textContent};});
await p.click(`.pcard[data-id="${antes.id}"] [data-st="1"]`); await p.waitForTimeout(400);
const desp = await p.evaluate(id=>{const f=document.querySelector(`.pcard[data-id="${id}"]`);
  return {txt:f.querySelector('.chip-st').textContent,
    ls:(JSON.parse(localStorage.getItem('productos')).find(x=>String(x.id)===id)||{}).stock};}, antes.id);
ok('el + sube el stock en pantalla', antes.txt!==desp.txt);
ok('y se guarda en localStorage', String(desp.ls)===desp.txt.replace(' u.','').trim());

// ── buscar
await p.fill('#inv-q','mannol'); await p.waitForTimeout(500);
const nb = await p.evaluate(()=>document.querySelectorAll('.pcard').length);
ok('la búsqueda filtra ('+nb+' resultados)', nb>0 && nb<40);
await p.fill('#inv-q',''); await p.waitForTimeout(400);

// ── filtro de estado
await p.selectOption('#inv-est','sing'); await p.waitForTimeout(500);
const ns = await p.evaluate(()=>document.querySelectorAll('.pcard').length);
ok('el filtro «sin garantía» funciona ('+ns+')', ns>0);
await p.selectOption('#inv-est',''); await p.waitForTimeout(400);

// ── editor
await p.click('.pcard [data-edit]'); await p.waitForTimeout(450);
ok('el editor abre', await p.evaluate(()=>!!document.querySelector('.velo .modal')));
await p.fill('.velo #e-gar','3 meses');
await p.fill('.velo #e-precio','999');
await p.click('.velo [data-guardar]'); await p.waitForTimeout(500);
const guardado = await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('productos'));
  return d.some(x=>x.garantia==='3 meses' && Number(x.precioActual)===999);});
ok('el editor guarda precio y garantía', guardado);
ok('el editor se cierra al guardar', await p.evaluate(()=>!document.querySelector('.velo')));

// ── categorías: se ven las subcategorías y se pueden editar
await p.click('.a2-lat [data-v="categorias"]'); await p.waitForTimeout(700);
const cat=await p.evaluate(()=>({
  tarjetas:document.querySelectorAll('.cat-card').length,
  subs:document.querySelectorAll('.subchip').length,
  botones:document.querySelectorAll('[data-catren],[data-catdel],[data-subnueva]').length}));
ok('salen las categorías en tarjetas ('+cat.tarjetas+')', cat.tarjetas>=10);
ok('con sus subcategorías ('+cat.subs+')', cat.subs>=20);
ok('y con botones de editar', cat.botones>=30);

// crear una subcategoría
const c0=await p.evaluate(()=>document.querySelector('[data-subnueva]').dataset.subnueva);
const subAntes=await p.evaluate(c=>((JSON.parse(localStorage.getItem('subcategorias')||'{}'))[c]||[]).length, c0);
await p.click('[data-subnueva]'); await p.waitForTimeout(400);
await p.fill('.velo #pt-val','PRUEBA SUB');
await p.click('.velo [data-ok]'); await p.waitForTimeout(500);
ok('crear subcategoría la guarda', await p.evaluate(c=>
  ((JSON.parse(localStorage.getItem('subcategorias')||'{}'))[c]||[]).includes('PRUEBA SUB'), c0));

// renombrar una categoría tiene que arrastrar a sus productos
const cNom=await p.evaluate(()=>document.querySelector('[data-catren]').dataset.catren);
const nEnCat=await p.evaluate(c=>JSON.parse(localStorage.getItem('productos')).filter(x=>x.categoria===c).length, cNom);
await p.click(`[data-catren="${cNom}"]`); await p.waitForTimeout(400);
await p.fill('.velo #pt-val','CAT RENOMBRADA');
await p.click('.velo [data-ok]'); await p.waitForTimeout(600);
const tras=await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('productos'));
  return {nuevos:d.filter(x=>x.categoria==='CAT RENOMBRADA').length,
    enLista:(JSON.parse(localStorage.getItem('categorias')||'[]')).includes('CAT RENOMBRADA'),
    subMovida:'CAT RENOMBRADA' in JSON.parse(localStorage.getItem('subcategorias')||'{}')};});
ok('renombrar arrastra a los '+nEnCat+' productos', tras.nuevos===nEnCat && nEnCat>0);
ok('y mueve la categoría y sus subcategorías', tras.enLista && tras.subMovida);

// crear una categoría
const catN=await p.evaluate(()=>JSON.parse(localStorage.getItem('categorias')||'[]').length);
await p.click('#cat-nueva'); await p.waitForTimeout(400);
await p.fill('.velo #pt-val','CATEGORIA NUEVA');
await p.click('.velo [data-ok]'); await p.waitForTimeout(500);
ok('crear categoría la guarda', await p.evaluate(n=>
  JSON.parse(localStorage.getItem('categorias')||'[]').length===n+1, catN));

// borrar pregunta antes
p.once('dialog', d => d.dismiss());
const antesDel=await p.evaluate(()=>JSON.parse(localStorage.getItem('categorias')||'[]').length);
await p.click('[data-catdel]'); await p.waitForTimeout(450);
ok('borrar categoría pregunta, y si dices que no, no borra', await p.evaluate(()=>
  JSON.parse(localStorage.getItem('categorias')||'[]').length)===antesDel);

// ── pieles
await p.click('.a2-lat [data-v="config"]'); await p.waitForTimeout(500);
await p.click('[data-piel="azul"]'); await p.waitForTimeout(400);
const piel = await p.evaluate(()=>({attr:document.documentElement.getAttribute('data-piel'),
  ls:localStorage.getItem('tm_piel'),
  acc:getComputedStyle(document.documentElement).getPropertyValue('--br').trim()}));
ok('la piel cambia y se guarda', piel.attr==='azul'&&piel.ls==='azul'&&piel.acc==='59,130,246');
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
ok('la piel sobrevive a recargar', await p.evaluate(()=>document.documentElement.getAttribute('data-piel')==='azul'));

// ── íconos reales de la tienda
await p.click('[data-v="inventario"]'); await p.waitForTimeout(700);
const ic = await p.evaluate(()=>document.querySelectorAll('.pcard .pc-nm svg.a2-ip').length);
ok('usa los íconos de línea de TM_ICONOS ('+ic+' tarjetas)', ic>10);

// ── las acciones nuevas de la tarjeta
const idc = await p.evaluate(()=>document.querySelector('.pcard').dataset.id);
await p.click(`.pcard[data-id="${idc}"] [data-cero]`); await p.waitForTimeout(450);
ok('el botón →0 marca agotado y lo guarda', await p.evaluate(id=>
  Number((JSON.parse(localStorage.getItem('productos')).find(x=>String(x.id)===id)||{}).stock)===0, idc));
const cbAntes = await p.evaluate(()=>{const c=document.querySelector('.pc-cb'); c.click();
  return c.closest('.pcard').classList.contains('sel');});
ok('la casilla marca la tarjeta', cbAntes);
p.once('dialog', d => d.dismiss());
const nAntes = await p.evaluate(()=>JSON.parse(localStorage.getItem('productos')).length);
await p.click('.pcard [data-del]'); await p.waitForTimeout(450);
ok('eliminar pregunta antes, y si dices que no, no borra', await p.evaluate(()=>
  JSON.parse(localStorage.getItem('productos')).length) === nAntes);

// ── navegación: TODAS las vistas, y que ninguna salga en blanco
const VISTAS=['inicio','inventario','agregar','categorias','combos','almacenes',
  'ventas','reposicion','radar','reservas','publicar','clientes','analytics',
  'copiloto','herramientas','config'];
const malas=[], vacias=[];
for(const v of VISTAS){
  await p.click(`.a2-lat [data-v="${v}"]`); await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{const on=document.querySelector('.vista.on');
    return {id:on?on.id:'-', largo:on?on.textContent.replace(/\s+/g,'').length:0};});
  if(r.id!=='v-'+v) malas.push(v);
  else if(r.largo<80) vacias.push(v+'('+r.largo+')');
}
ok('las '+VISTAS.length+' vistas navegan'+(malas.length?' — fallan: '+malas:''), !malas.length);
ok('ninguna vista sale en blanco'+(vacias.length?' — vacías: '+vacias:''), !vacias.length);

// ── agregar un producto de verdad
await p.click('.a2-lat [data-v="agregar"]'); await p.waitForTimeout(400);
const antesN=await p.evaluate(()=>JSON.parse(localStorage.getItem('productos')).length);
await p.fill('#ag-nombre','Producto de prueba');
await p.fill('#ag-precio','42'); await p.fill('#ag-stock','7');
await p.click('#ag-guardar'); await p.waitForTimeout(600);
const despN=await p.evaluate(()=>JSON.parse(localStorage.getItem('productos')).length);
ok('agregar crea el producto y lo guarda', despN===antesN+1);
ok('y salta al inventario', await p.evaluate(()=>document.querySelector('.vista.on').id==='v-inventario'));

// ── la hoja de secciones del teléfono
await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
await p.click('#a2-mas'); await p.waitForTimeout(400);
const hoja=await p.evaluate(()=>{const h=document.getElementById('a2-hoja');
  return {abierta:!h.hidden, botones:h.querySelectorAll('[data-v]').length};});
ok('la hoja del teléfono abre con todas las secciones ('+hoja.botones+')', hoja.abierta && hoja.botones>=12);
await p.click('#a2-hoja [data-v="radar"]'); await p.waitForTimeout(600);
ok('y navega, y se cierra al elegir', await p.evaluate(()=>
  document.querySelector('.vista.on').id==='v-radar' && document.getElementById('a2-hoja').hidden));
console.log(R.join('\n'));
console.log('errores JS:', errs.length?errs:'ninguno');
await b.close(); srv.close();
if(fallos || errs.length){
  console.error(`\n❌ admin2: ${fallos} comprobación(es) fallida(s), ${errs.length} error(es) JS`);
  process.exit(1);
}
console.log('\n✅ admin2: todas las comprobaciones pasan');
