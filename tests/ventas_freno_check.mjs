/* Lo que frenaba una venta en el móvil (auditoría de compra, nov-2026).
 *
 * Nada de esto da error: la página se pinta y Max contesta. El daño es que el
 * cliente se va creyendo algo falso:
 *
 *  · buscar «inversor» sacaba una soldadora y un disyuntor, y los inversores
 *    (agotados) al final sin su «Avísame»: «aquí no venden inversores»;
 *  · la cabecera decía «Todos los Productos · 43 disponibles» encima;
 *  · el pedido de WhatsApp ponía «TOTAL: 80,750 MN» aunque mirara en USD (la
 *    coma se lee como decimal) y daba «gracias por tu compra» antes de comprar;
 *  · los importes en MN salían «$19,000 MN» — el $ se lee como dólares;
 *  · Max ofrecía la moto de $1700 a quien pedía un inversor de 3000W (solo
 *    coincidía la cifra), no daba el precio en MN del producto que le
 *    nombraban y enseñaba «margen operativo +20 MN» al cliente.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let comprobaciones = 0;
const fallos = [];
const ok = (c, m) => { comprobaciones++; if (!c) fallos.push(m); };
const PRODS = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const TASA = 950;

// ── 1) Max, en una caja de arena (como bot_producto_check) ─────────────────
{
    const noop = () => {};
    const el = () => ({ style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
        appendChild:noop, remove:noop, addEventListener:noop, setAttribute:noop, getAttribute:()=>null,
        insertAdjacentHTML:noop, focus:noop, scrollIntoView:noop, dataset:{}, children:[],
        innerHTML:'', textContent:'', getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
        querySelector:()=>el(), querySelectorAll:()=>[] });
    const sb = {
        window:{ location:{origin:'https://tiendamax.org'}, addEventListener:noop, setTimeout, clearTimeout,
                 open:()=>null, matchMedia:()=>({matches:false,addEventListener:noop}) },
        location:{origin:'https://tiendamax.org'},
        document:{ createElement:el, querySelector:()=>el(), querySelectorAll:()=>[], addEventListener:noop, body:el(), head:el() },
        localStorage:{ getItem:()=>null, setItem:noop, removeItem:noop },
        navigator:{ userAgent:'node' }, productos:PRODS, getTasaMN:() => TASA,
        console:{log:noop,warn:noop,error:noop}, setTimeout, clearTimeout,
        fetch:()=>Promise.reject(new Error('sin red en el test')),
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8'), sb);
    const B = sb.window._tmBot;
    B.sincronizar();
    await new Promise(r => setTimeout(r, 30));
    const limpio = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    const invSinStock = !PRODS.some(p => /inversor/i.test(p.nombre) && p.stock > 0);
    if (invSinStock) {
        const r = await B.responder('tienen inversor de 3000w?');
        const nombres = (r.products || []).map(p => p.nombre).join(' | ');
        ok(!/moto/i.test(nombres), 'a «inversor de 3000w» Max ofreció algo que solo comparte la cifra: ' + nombres);
        ok(/agotad/i.test(limpio(r.response)), 'Max tenía que decir que los inversores están agotados: ' + limpio(r.response).slice(0, 160));
    }
    const mannol = PRODS.find(p => /mannol 5w30/i.test(p.nombre));
    if (mannol) {
        const r = await B.responder('cuanto es en moneda nacional el aceite mannol 5w30');
        const t = limpio(r.response);
        const mn = String(Math.round(mannol.precioActual * TASA)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        ok(/mannol/i.test(t) && t.includes(mn + ' MN'), `Max tenía que dar el precio del Mannol en MN (${mn} MN): «${t.slice(0, 200)}»`);
    }
    // Cobertura (dueño, 18-nov-2026): mensajería solo en La Habana, se paga al recibir.
    for (const q of ['hacen envios a pinar del rio', 'hacen envios a matanzas', 'a donde hacen envios']) {
        const t = limpio((await B.responder(q)).response);
        ok(/solo en La Habana/i.test(t), `«${q}»: tiene que decir que la mensajería es solo en La Habana: «${t.slice(0, 160)}»`);
        ok(!/(Pinar del R[ií]o|Matanzas)[^.]{0,30}(mensajer[ií]a directa|cobertura de mensajer)|corredor/i.test(t) && !/hasta Matanzas/i.test(t),
           `«${q}»: todavía promete mensajería fuera de La Habana: «${t.slice(0, 200)}»`);
    }
    {
        const t = limpio((await B.responder('hacen envios a playa')).response);
        ok(/al recibir/i.test(t), 'en La Habana tiene que decir que se paga al recibir: ' + t.slice(0, 200));
    }
    // Zonas configuradas en ⚙️ Configuración → 🚚 Mensajería (llegan por tmEnviosCfg).
    {
        const sb2 = Object.assign({}, sb, { window: Object.assign({}, sb.window), tmEnviosCfg: () => ({
            zonas: [{ nombre: 'La Habana', precio: '500 MN', tiempo: '24–48 h' }, { nombre: 'Matanzas', precio: '1.500 MN', tiempo: '' }],
            resto: 'Lo demás, por encomienda.' }) });
        sb2.globalThis = sb2;
        vm.createContext(sb2);
        vm.runInContext(readFileSync(join(RAIZ, 'js/src/tm-bot-cerebro.src.js'), 'utf8'), sb2);
        const B2 = sb2.window._tmBot; B2.sincronizar(); await new Promise(r => setTimeout(r, 30));
        const mat = limpio((await B2.responder('hacen envios a matanzas')).response);
        ok(/Tenemos mensajer/i.test(mat) && mat.includes('1.500 MN'), 'con Matanzas configurada, Max tiene que decir que hay mensajería y su precio: ' + mat.slice(0, 200));
        const pin = limpio((await B2.responder('hacen envios a pinar del rio')).response);
        ok(/solo en La Habana y Matanzas/i.test(pin) && pin.includes('Lo demás, por encomienda.'), 'fuera de las zonas, Max nombra las zonas configuradas y el texto del resto: ' + pin.slice(0, 220));
        const pla = limpio((await B2.responder('hacen envios a playa')).response);
        ok(pla.includes('500 MN') && pla.includes('24–48 h') && /al recibir/i.test(pla), 'un municipio de La Habana toma el precio y el tiempo de la zona La Habana: ' + pla.slice(0, 220));
    }
    const r = await B.responder('/tasa');
    ok(!/margen operativo|recargo/i.test(limpio(r.response)), 'la respuesta de la tasa al cliente no habla de «margen operativo» ni de recargo (desde nov-2026 sí dice de qué se compone, en neutro): ' + limpio(r.response).slice(0, 200));
}

// ── 2) La tienda, en un navegador ─────────────────────────────────────────
const requerir = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = requerir('/opt/node22/lib/node_modules/playwright/index.js')); }
catch (e) { try { ({ chromium } = requerir('playwright')); } catch (e2) { chromium = null; } }
if (chromium) {
    const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
                   '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
    const servidor = createServer(async (q, r) => {
        let ruta = decodeURIComponent(q.url.split('?')[0]); if (ruta === '/') ruta = '/index.html';
        ruta = normalize(join(RAIZ, ruta));
        try { const b = await readFile(ruta); r.writeHead(200, {'Content-Type': MIME[extname(ruta)] || 'application/octet-stream'}); r.end(b); }
        catch (e) { r.writeHead(404); r.end(); }
    }).listen(0);
    const PUERTO = servidor.address().port;
    const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const CONFIG = JSON.parse(readFileSync(join(RAIZ, 'config.json'), 'utf8'));
    const ENVIOS = { zonas: [{ nombre: 'La Habana', precio: '500 MN', tiempo: '24–48 h' }], resto: 'Lo demás, por WhatsApp.', ts: 1 };
    // ── Panel: «Guardar mensajería» reescribe config.json cambiando solo `envios`.
    {
        const ctxP = await nav.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
        const PUTS = [];
        await ctxP.route(u => u.hostname === 'api.github.com', r => {
            const q = r.request();
            if (q.method() === 'PUT') { PUTS.push(JSON.parse(q.postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"y"}}' }); }
            if (/contents\/config\.json/.test(q.url())) return r.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ sha: 'x', encoding: 'base64', content: Buffer.from(JSON.stringify(CONFIG)).toString('base64') }) });
            return r.fulfill({ status: 404, body: '{}' });
        });
        await ctxP.route(u => !u.hostname.includes('localhost') && u.hostname !== 'api.github.com', r => r.abort());
        await ctxP.addInitScript(() => { if (sessionStorage.getItem('_i')) return; sessionStorage.setItem('_i', '1');
            localStorage.setItem('githubUser', 'u'); localStorage.setItem('githubRepo', 'r'); localStorage.setItem('githubToken', 't'); });
        const pp = await ctxP.newPage();
        await pp.goto(`http://localhost:${PUERTO}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await pp.waitForTimeout(3500);
        const vista = await pp.evaluate(async () => {
            document.getElementById('adminPanel')?.classList.remove('hidden');
            document.querySelectorAll('#loginModal,.tm2-login').forEach(e => e.style.display = 'none');
            envAgregar();
            const filas = document.querySelectorAll('#enviosZonas .env-fila');
            const f = filas[filas.length - 1];
            f.querySelector('[data-k=nombre]').value = 'Matanzas'; f.querySelector('[data-k=precio]').value = '1.500 MN';
            document.querySelector('#enviosZonas .env-fila [data-k=precio]').value = '500 MN';
            envGuardar();
            return getEnvioTexto();
        });
        ok(vista === 'Mensajería en La Habana y 1 zona más', 'la vista previa del panel no refleja las zonas guardadas: ' + vista);
        await pp.waitForTimeout(5500);
        let subido = null;
        try { subido = JSON.parse(Buffer.from(PUTS[PUTS.length - 1].content, 'base64').toString('utf8')); } catch (e) {}
        ok(subido && subido.envios && subido.envios.zonas.map(z => z.nombre).join('|') === 'La Habana|Matanzas'
           && subido.envios.zonas[0].precio === '500 MN', 'guardar no subió las zonas a config.json: ' + JSON.stringify(subido && subido.envios));
        if (subido) for (const k of ['firebaseConfig', 'margenMN', 'tasaMN'].filter(k => k in CONFIG))
            ok(JSON.stringify(subido[k]) === JSON.stringify(CONFIG[k]), 'guardar la mensajería cambió «' + k + '» de config.json');
        await ctxP.close();
    }
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
    await ctx.route(u => u.hostname.includes('localhost') && u.pathname === '/config.json', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({}, CONFIG, { envios: ENVIOS })) }));
    const errores = [];
    const p = await ctx.newPage();
    p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
    await p.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForFunction(() => typeof productos !== 'undefined' && productos.length > 20, null, { timeout: 30000 });
    await p.waitForTimeout(800);

    const hayInversor = PRODS.some(x => /inversor/i.test(x.nombre));
    if (hayInversor) {
        const sug = await p.evaluate(async () => {
            const i = document.getElementById('heroSearchInput'); i.value = 'inversor';
            buscarDesdeHero('inversor'); await new Promise(r => setTimeout(r, 900));
            return [...document.querySelectorAll('#heroSearchSuggestions .hsb-sug-name')].map(x => x.textContent);
        });
        ok(sug.length && /inversor/i.test(sug[0]), 'la primera sugerencia de «inversor» no es un inversor: ' + sug.join(' | '));
        const grid = await p.evaluate(async () => {
            aplicarBusquedaHero(); await new Promise(r => setTimeout(r, 900));
            return { titulo: document.getElementById('tituloCategoriaActual').textContent,
                     stats: (document.getElementById('categoriaStats') || {}).textContent || '',
                     primero: (document.querySelector('#productosGrid .producto-card') || {}).innerText || '' };
        });
        ok(/inversor/i.test(grid.primero), 'el primer resultado de «inversor» no es un inversor: ' + grid.primero.slice(0, 80));
        ok(/Resultados para «inversor»/.test(grid.titulo), 'la cabecera no dice qué se buscó: ' + grid.titulo);
        const total = PRODS.filter(x => x.stock > 0).length;
        ok(!new RegExp('^' + total + ' disponibles').test(grid.stats), 'la cuenta de resultados es la del catálogo entero: ' + grid.stats);
    }

    const msg = await p.evaluate(tasa => {
        localStorage.setItem('tasaMN', String(tasa));
        const it = [{ nombre: 'Batería', precio: 85, cantidad: 1 }];
        setCurrency('USD');
        const usd = _mensajeOrdenWA(it, {});
        setCurrency('MN');
        const mn = _mensajeOrdenWA(it, {});
        const fmt = tmMN(80750);
        setCurrency('USD');
        // _mensajeOrdenWA devuelve el texto ya codificado para el enlace wa.me.
        const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
        return { usd: dec(usd), mn: dec(mn), fmt, tasa: getTasaMN() };
    }, TASA);
    const t = msg.tasa;
    const mnTxt = String(Math.round(85 * t)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    ok(msg.fmt === '80.750', 'tmMN tiene que dar «80.750», no ' + msg.fmt);
    ok(/\*Total: \$85 USD\*/.test(msg.usd), 'viendo en USD, el total en negrita va en USD: ' + msg.usd);
    ok(t > 0 ? msg.usd.includes(mnTxt + ' MN') : true, 'en USD tiene que dar el equivalente en MN como referencia');
    ok(t > 0 ? msg.mn.includes('*Total: ' + mnTxt + ' MN*') : true, 'viendo en MN, el total en negrita va en MN: ' + msg.mn);
    ok(!/\d,\d{3} MN/.test(msg.usd + msg.mn), 'un importe en MN con coma de miles: ' + msg.usd);
    ok(!/\$[\d.,]+ MN/.test(msg.usd + msg.mn), 'un importe en MN con $ delante: ' + msg.mn);
    ok(!/Gracias por tu compra/.test(msg.usd), 'el pedido (aún no es compra) no da «gracias por tu compra»');
    ok(/municipio/i.test(msg.usd), 'el pedido tiene que decir qué datos mandar (nombre, municipio, moneda)');

    // La ficha de TODOS los clientes dice lo que puso el dueño (no el localStorage del gestor).
    const envio = await p.evaluate(() => ({ txt: getEnvioTexto(), ls: localStorage.getItem('tm_envios_cfg') }));
    ok(envio.txt === 'Mensajería en La Habana · 500 MN', 'la ficha no lee la mensajería de config.json: ' + envio.txt + ' / ' + envio.ls);

    const propios = errores.filter(e => !/firebase|Failed to fetch|NetworkError/i.test(e));
    ok(propios.length === 0, 'errores de JavaScript: ' + propios.join(' | '));
    await nav.close();
    servidor.close();
} else console.log('playwright no disponible — se salta la parte del navegador');

if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${comprobaciones} comprobaciones fallaron:\n - ` + fallos.join('\n - '));
    process.exit(1);
}
console.log(`✅ ${comprobaciones} comprobaciones de lo que frenaba una venta en regla.`);
