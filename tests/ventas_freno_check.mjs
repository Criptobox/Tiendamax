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
    const r = await B.responder('/tasa');
    ok(!/margen/i.test(limpio(r.response)), 'la respuesta de la tasa al cliente no desglosa el margen: ' + limpio(r.response).slice(0, 200));
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
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.hostname.includes('localhost'), r => r.abort());
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
