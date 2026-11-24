/* ============================================================
   TiendaMax — Bot "Max": burbuja, panel y carga diferida
   ------------------------------------------------------------
   Este archivo es la CÁSCARA: pinta la burbuja, el cartel de
   bienvenida y el panel vacío, y no sabe responder nada. Todo el
   razonamiento vive en js/tm-bot-cerebro.js, que se descarga la
   primera vez que el cliente abre el chat (o cuando roza la
   burbuja). Así quien nunca abre el chat —la mayoría— no paga los
   ~90 KB de base de conocimiento en una conexión de 3G cubana.

   Antes esta cáscara hablaba con un Cloudflare Worker
   (mini-services/chat-bot). Ese camino estaba muerto en producción:
   <meta name="tm-bot-api"> quedó vacío, así que cada mensaje caía
   en /api/chat, que GitHub Pages no puede servir, y el bot contestaba
   siempre "tuve un problema de conexión". Ahora responde en el
   navegador, sin backend que configurar ni que se pueda caer.

   NO editar js/tm-bot.js — es el minificado. Edita este .src.js y
   corre scripts/minify_js.py + scripts/build_js_bundle.py.
   ============================================================ */
(function() {
    'use strict';

    if (window._tmBotLoaded) return;
    if (location.pathname.includes('/admin')) return;
    window._tmBotLoaded = true;

    // URL del cerebro. Se declara en index.html como <meta> para que
    // scripts/bump_versions.py le ponga el hash del archivo y el cache
    // se invalide solo cuando el cerebro cambia de verdad.
    function _urlCerebro() {
        const meta = document.querySelector('meta[name="tm-bot-cerebro"]');
        return (meta && meta.content) ? meta.content : 'js/tm-bot-cerebro.js';
    }

    let _panelOpen = false;
    let _cargando = false;
    let _fallo = false;
    // ¿El cliente pidió abrir el chat, o el cerebro se está precargando
    // por detrás? Sin esta distinción, rozar la burbuja con el ratón (o
    // tabular hasta ella) abría el chat solo, en la cara del cliente.
    let _pedidoAbrir = false;

    // ── Estilos inyectados (no tocan bundle.css) ──
    const style = document.createElement('style');
    style.textContent = `
    .tm-bot-wrap{--tmb-coral:#E8501E;--tmb-coral-2:#ff6b35;--tmb-green:#2ECC71;--tmb-wa:#25D366;}
    .tm-bot-bubble{position:fixed;bottom:20px;right:16px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#E8501E 0%,#ff6b35 100%);box-shadow:0 4px 14px rgba(232,80,30,.45);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99998;transition:transform .25s ease,box-shadow .25s ease;border:none;color:#fff;animation:tmBotPulseRing 2.5s ease-in-out infinite;}
    @keyframes tmBotPulseRing{0%{box-shadow:0 4px 14px rgba(232,80,30,.45),0 0 0 0 rgba(232,80,30,.5);}70%{box-shadow:0 4px 14px rgba(232,80,30,.45),0 0 0 16px rgba(232,80,30,0);}100%{box-shadow:0 4px 14px rgba(232,80,30,.45),0 0 0 0 rgba(232,80,30,0);}}
    .tm-bot-bubble:hover{transform:scale(1.08) translateY(-2px);}
    .tm-bot-bubble svg{width:26px;height:26px;color:#fff;}
    .tm-bot-bubble.has-new::after{content:'';position:absolute;top:5px;right:5px;width:10px;height:10px;background:#2ECC71;border-radius:50%;border:2px solid #0D0D0D;animation:tmBotDotPulse 1.5s ease-in-out infinite;}
    @keyframes tmBotDotPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.4);opacity:.6;}}
    .tm-bot-bubble,.tm-bot-label{translate:0 calc(-1 * var(--tmb-esq, 0px));transition:translate .25s ease,transform .25s ease,box-shadow .25s ease;}
    .tm-bot-label{display:none;}
    @media(min-width:900px){.tm-bot-label{display:block;position:fixed;bottom:31px;right:78px;z-index:99998;background:#1a1a1a;color:#fff;border:1px solid rgba(255,255,255,.12);font:600 13px/1 inherit;padding:9px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;white-space:nowrap;}
      .tm-bot-label:hover{border-color:#E8501E;}
      body:has(.tm-bot-panel.open) .tm-bot-label{display:none;}}
    body.light-mode .tm-bot-label{background:#fff;color:#1a1a1a;border-color:rgba(0,0,0,.1);box-shadow:0 4px 14px rgba(0,0,0,.12);}
    .tm-bot-badge{position:absolute;top:-5px;right:-5px;background:#2ECC71;color:#fff;font-size:10px;font-weight:700;padding:3px 6px;border-radius:10px;border:2px solid #0D0D0D;z-index:2;box-shadow:0 2px 6px rgba(0,0,0,.4);}
    /* ── Cartel de bienvenida ── */
    .tm-bot-welcome{position:fixed;bottom:84px;right:16px;max-width:230px;background:linear-gradient(135deg,#1a1a1a 0%,#1f1f1f 100%);color:#fff;padding:12px 14px 12px 12px;border-radius:14px 4px 14px 14px;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:99997;font-size:13px;line-height:1.4;border:1px solid rgba(255,255,255,.12);opacity:0;transform:translateY(8px) scale(.92);transition:opacity .3s ease,transform .3s ease;pointer-events:none;display:flex;align-items:flex-start;gap:10px;}
    .tm-bot-welcome.visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
    .tm-bot-welcome-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#E8501E,#ff6b35);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 3px 8px rgba(232,80,30,.4);}
    .tm-bot-welcome-txt{flex:1;min-width:0;}
    .tm-bot-welcome-txt b{color:#ff6b35;font-size:12px;font-weight:700;}
    .tm-bot-welcome-close{position:absolute;top:4px;right:6px;background:none;border:none;color:#666;cursor:pointer;font-size:14px;padding:2px;line-height:1;}
    .tm-bot-welcome-close:hover{color:#fff;}
    /* ── Panel ── */
    .tm-bot-panel{position:fixed;bottom:16px;right:16px;left:16px;width:auto;max-width:400px;height:min(78vh,640px);background:#0D0D0D;display:flex;flex-direction:column;z-index:99999;transform:translateY(20px) scale(.96);opacity:0;pointer-events:none;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .25s ease;box-shadow:0 8px 40px rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08);border-radius:20px;overflow:hidden;margin:0 auto;margin-left:auto;}
    @media(min-width:480px){.tm-bot-panel{left:auto;bottom:84px;right:16px;max-width:380px;margin:0;}}
    /* En el teléfono, pantalla completa: el chat ocupaba dos tercios y la
       conversación se leía por una rendija. */
    @media(max-width:479px){.tm-bot-panel{left:0;right:0;bottom:0;top:calc(10px + env(safe-area-inset-top,0px));max-width:none;width:100%;height:auto;border-radius:22px 22px 0 0;border:1px solid rgba(255,255,255,.08);border-bottom:0;box-shadow:0 -10px 40px rgba(0,0,0,.55);}
      .tm-bot-header{padding:12px 14px 11px;}}
    /* Cabecera oscura y baja, con el asa de la hoja arriba. */
    .tm-bot-header{background:#141417!important;border-bottom:1px solid rgba(255,255,255,.07);}
    .tm-bot-header::before{display:none;}
    .tm-bot-header::after{content:'';position:absolute;top:5px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:4px;background:rgba(255,255,255,.18);}
    .tm-bot-avatar{background:linear-gradient(135deg,#f97316,#ea580c)!important;border-radius:13px!important;box-shadow:0 4px 12px rgba(234,88,12,.35);}
    .tm-bot-header-name .verified{background:#f97316!important;color:#fff!important;}
    .tm-bot-header-status{color:#a1a1aa;opacity:1!important;}
    .tm-bot-header-status::before{background:#22c55e!important;box-shadow:0 0 6px rgba(34,197,94,.7)!important;}
    .tm-bot-header-btn{background:rgba(255,255,255,.07)!important;border-radius:11px!important;color:#d4d4d8!important;}
    .tm-bot-header-btn:hover{background:rgba(255,255,255,.14)!important;}
    .tm-bot-header-btn{position:relative}.tm-bot-header-btn::after{content:'';position:absolute;inset:-8px}
    body.light-mode .tm-bot-header{background:#fff!important;border-bottom-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-header,body.light-mode .tm-bot-header-name{color:#1a1a1a;}
    body.light-mode .tm-bot-header::after{background:rgba(0,0,0,.15);}
    body.light-mode .tm-bot-header-btn{background:rgba(0,0,0,.05)!important;color:#444!important;}
    .tm-bot-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}
    .tm-bot-header{background:linear-gradient(135deg,#E8501E 0%,#ff6b35 100%);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative;overflow:hidden;}
    .tm-bot-header::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 50%,rgba(255,255,255,.15) 0%,transparent 60%);pointer-events:none;}
    .tm-bot-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;overflow:hidden;}
    .tm-bot-avatar svg{width:23px;height:23px;color:#fff;}
    .tm-bot-header-info{flex:1;min-width:0;position:relative;z-index:1;}
    .tm-bot-header-name{font-weight:700;font-size:15px;line-height:1.2;display:flex;align-items:center;gap:6px;}
    .tm-bot-header-name .verified{display:inline-flex;width:14px;height:14px;background:#fff;border-radius:50%;align-items:center;justify-content:center;font-size:9px;color:#E8501E;}
    .tm-bot-header-status{font-size:11px;opacity:.95;display:flex;align-items:center;gap:5px;margin-top:2px;}
    .tm-bot-header-status::before{content:'';width:7px;height:7px;background:#fff;border-radius:50%;display:inline-block;box-shadow:0 0 6px rgba(255,255,255,.8);animation:tmStatusBlink 2s ease-in-out infinite;}
    @keyframes tmStatusBlink{0%,100%{opacity:1;}50%{opacity:.5;}}
    .tm-bot-header-actions{display:flex;gap:6px;position:relative;z-index:1;}
    .tm-bot-header-btn{background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s;}
    .tm-bot-header-btn:hover{background:rgba(255,255,255,.3);}
    .tm-bot-header-btn svg{width:16px;height:16px;}
    .tm-bot-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#0D0D0D;scroll-behavior:smooth;}
    .tm-bot-body::-webkit-scrollbar{width:6px;}
    .tm-bot-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:3px;}
    .tm-bot-date-sep{text-align:center;font-size:10px;color:#666;margin:6px 0 2px;text-transform:uppercase;letter-spacing:.5px;}
    /* .tm-bot-body es un flex column con scroll, así que sus hijos se
       encogen por defecto (flex-shrink:1) en cuanto la conversación pasa
       del alto del panel. La tabla comparativa, que no tiene padding
       propio que la sostenga, quedaba aplastada a 2px de alto: la función
       estrella del bot se veía como una rayita. */
    .tm-bot-body > *{flex-shrink:0;}
    /* ── Mensajes ──
       white-space:pre-wrap es obligatorio: las respuestas se arman como
       texto con \\n (listas de viñetas, tablas de potencias, fichas). Sin
       esto todos esos saltos colapsan y cada respuesta sale como un
       ladrillo de texto corrido. */
    .tm-bot-msg{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap;animation:tmBotFadeIn .3s ease;position:relative;}
    @keyframes tmBotFadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
    .tm-bot-msg.bot{background:linear-gradient(180deg,#1a1a1a 0%,#1f1f1f 100%);color:#fff;border-radius:16px 16px 16px 4px;align-self:flex-start;border:1px solid rgba(255,255,255,.08);box-shadow:0 1px 2px rgba(0,0,0,.2);}
    .tm-bot-msg.user{background:linear-gradient(135deg,#E8501E,#ff6b35);color:#fff;border-radius:16px 16px 4px 16px;align-self:flex-end;box-shadow:0 2px 8px rgba(232,80,30,.3);}
    .tm-bot-msg.bot strong,.tm-bot-msg.bot b{color:#fff;font-weight:700;}
    .tm-bot-msg.bot em{color:inherit;font-style:normal;font-weight:600;}
    .tm-bot-msg.bot a{color:#fb923c;font-weight:700;text-decoration:underline;text-underline-offset:2px;}
    body.light-mode .tm-bot-msg.bot a{color:#c2410c;}
    .tm-bot-msg.bot code{background:rgba(232,80,30,.15);color:#ff6b35;padding:1px 5px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;}
    .tm-bot-msg.bot .meta{display:block;font-size:10px;color:#666;margin-top:4px;text-align:right;font-weight:400;}
    .tm-bot-msg.user .meta{display:block;font-size:10px;color:rgba(255,255,255,.7);margin-top:3px;text-align:right;}
    .tm-bot-link{color:#ff6b35;text-decoration:underline;text-underline-offset:2px;word-break:break-all;}
    /* ── Typing ── */
    .tm-bot-typing-wrap{padding:14px 16px;}
    .tm-bot-typing{display:inline-flex;gap:4px;align-items:center;}
    .tm-bot-typing span{width:8px;height:8px;background:#ff6b35;border-radius:50%;animation:tmBotTyping 1.2s infinite;}
    .tm-bot-typing span:nth-child(2){animation-delay:.2s;}
    .tm-bot-typing span:nth-child(3){animation-delay:.4s;}
    @keyframes tmBotTyping{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-7px);opacity:1;}}
    /* ── Tarjetas de producto ── */
    .tm-bot-products{display:flex;flex-direction:column;gap:8px;margin-top:8px;align-self:flex-start;max-width:88%;}
    .tm-bot-product{display:flex;align-items:center;gap:10px;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:8px 10px;cursor:pointer;transition:all .2s;}
    .tm-bot-product:hover{background:#252525;border-color:rgba(232,80,30,.5);transform:translateX(2px);}
    .tm-bot-product-img{width:56px;height:56px;border-radius:10px;object-fit:contain;flex-shrink:0;background:#fff;}
    /* Ficha de un producto: la foto primero, grande, con nombre y precio debajo. */
    .tm-bot-product.grande{flex-direction:column;align-items:stretch;gap:0;padding:0;overflow:hidden;border-radius:16px;}
    .tm-bot-product.grande .tm-bot-product-img{width:100%;height:210px;border-radius:0;object-fit:contain;}
    .tm-bot-product.grande .tm-bot-product-info{padding:12px 14px 14px;}
    .tm-bot-product.grande .tm-bot-product-name{font-size:16px;line-height:1.3;}
    .tm-bot-product.grande .tm-bot-product-go{display:none;}
    .tm-bot-product-info{flex:1;min-width:0;}
    .tm-bot-product-name{font-size:13px;font-weight:600;color:#fff;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
    .tm-bot-product-price{font-size:13px;color:#fff;font-weight:800;margin-top:3px;}
    .tm-bot-product-price .mn{color:#999;font-weight:500;margin-left:4px;font-size:10.5px;}
    .tm-bot-product-stock{font-size:10px;color:#999;margin-top:1px;}
    .tm-bot-product-stock.out{color:#ff6b6b;}
    .tm-bot-product-go{width:24px;height:24px;border-radius:50%;background:rgba(232,80,30,.15);color:#ff6b35;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;}
    /* ── Comparativa ── */
    .tm-bot-compare{align-self:flex-start;max-width:95%;margin-top:6px;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;animation:tmBotFadeIn .3s ease;}
    .tm-bot-compare-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(135deg,rgba(232,80,30,.15),rgba(255,107,53,.08));border-bottom:1px solid rgba(255,255,255,.08);font-size:12px;font-weight:700;color:#ff6b35;}
    .tm-bot-compare-grid{display:grid;grid-template-columns:88px 1fr 1fr;gap:0;font-size:11.5px;}
    .tm-bot-compare-grid > div{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);border-right:1px solid rgba(255,255,255,.08);display:flex;align-items:center;word-break:break-word;line-height:1.35;}
    .tm-bot-compare-grid > div:nth-child(3n){border-right:none;}
    .tm-bot-compare-grid > div:nth-last-child(-n+3){border-bottom:none;}
    .tm-bot-compare-grid .ch{background:rgba(255,255,255,.03);font-weight:600;color:#999;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;}
    .tm-bot-compare-grid .ch-img{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;text-align:center;}
    .tm-bot-compare-grid .ch-img img{width:42px;height:42px;border-radius:6px;object-fit:cover;}
    .tm-bot-compare-grid .ch-img .nm{font-size:10.5px;font-weight:700;color:#fff;line-height:1.2;}
    .tm-bot-compare-grid .v{color:#fff;}
    .tm-bot-compare-grid .v.win{color:#2ECC71;font-weight:700;background:rgba(46,204,113,.08);}
    .tm-bot-compare-grid .v.lose{color:#ff8888;background:rgba(255,136,136,.05);}
    .tm-bot-compare-grid .v.neutral{color:#999;}
    .tm-bot-compare-grid .row-label{background:rgba(255,255,255,.04);color:#999;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;}
    .tm-bot-compare-verdict{padding:10px 12px;background:rgba(46,204,113,.06);border-top:1px solid rgba(255,255,255,.08);font-size:11.5px;color:#c8f0d8;line-height:1.45;white-space:pre-wrap;}
    .tm-bot-compare-verdict b{color:#2ECC71;}
    /* ── Bienvenida: botones grandes, regalo, rebajas ── */
    .tmb-bienv{display:flex;flex-direction:column;gap:9px;align-self:stretch;}
    .tmb-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .tmb-int{display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;background:#17171b;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:13px 8px 11px;color:#f4f4f5;font:inherit;cursor:pointer;}
    .tmb-int b{font-size:13.5px;margin-top:6px;}
    .tmb-int small{font-size:11.5px;color:#a1a1aa;line-height:1.3;}
    .tmb-ico{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;border:1px solid;}
    .tmb-ico.n,.tmb-pi.n{background:rgba(249,115,22,.14);border-color:rgba(249,115,22,.35);color:#fb923c;}
    .tmb-ico.t,.tmb-pi.t{background:rgba(45,212,191,.12);border-color:rgba(45,212,191,.32);color:#2dd4bf;}
    .tmb-ico.v,.tmb-pi.v{background:rgba(167,139,250,.14);border-color:rgba(167,139,250,.35);color:#a78bfa;}
    .tmb-ico.s,.tmb-pi.s{background:rgba(56,189,248,.13);border-color:rgba(56,189,248,.33);color:#38bdf8;}
    .tmb-regalo{display:flex;align-items:center;gap:11px;width:100%;text-align:left;border-radius:16px;padding:11px;border:1px solid rgba(231,201,154,.45);background:linear-gradient(120deg,#3a2414,#2a1a10 55%,#1d1712);color:#fde68a;font:inherit;cursor:pointer;}
    .tmb-rg-ico{width:46px;height:46px;border-radius:14px;flex:none;display:flex;align-items:center;justify-content:center;color:#fde68a;background:linear-gradient(135deg,#f97316,#c2410c);}
    .tmb-rg-txt{flex:1;min-width:0;display:flex;flex-direction:column;}
    .tmb-rg-txt b{font-size:14.5px;}.tmb-rg-txt small{font-size:12px;color:#e7d5bb;margin-top:2px;}
    .tmb-rg-ver{flex:none;background:rgba(253,230,138,.14);border-radius:10px;padding:6px 10px;font-size:12.5px;font-weight:700;}
    .tmb-tit{font-size:11.5px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.04em;margin-top:2px;}
    .tmb-reb{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}
    .tmb-mini{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;background:#17171b;border:1px solid rgba(255,255,255,.08);border-radius:13px;overflow:hidden;padding:0 0 8px;color:#f4f4f5;font:inherit;text-align:left;cursor:pointer;}
    .tmb-mini img{width:100%;height:68px;object-fit:contain;background:#fff;margin-bottom:3px;}
    .tmb-mini .nm{font-size:11.5px;line-height:1.3;padding:0 7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:30px;}
    .tmb-mini .pr{font-size:13px;font-weight:800;padding:0 7px;}
    .tmb-mini .pr i{font-style:normal;font-size:10.5px;background:rgba(249,115,22,.18);color:#fdba74;border-radius:5px;padding:1px 4px;margin-left:2px;}
    .tmb-mini .tmb-st{margin-left:7px;}
    /* ── Estado del stock: el mismo color en todas partes ── */
    .tmb-st{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;margin-top:4px;}
    .tmb-st.ok{background:rgba(34,197,94,.14);color:#4ade80;}
    .tmb-st.am{background:rgba(245,158,11,.16);color:#fbbf24;}
    .tmb-st.ag{background:rgba(239,68,68,.15);color:#f87171;}
    /* ── La Tarjeta TiendaMax, explicada ── */
    .tmb-regalo-det{border:1px solid rgba(231,201,154,.4);border-radius:16px;overflow:hidden;background:#1a1612;white-space:normal;margin:2px -4px;}
    .tmb-rg-cab{display:flex;align-items:center;gap:11px;padding:12px;background:linear-gradient(120deg,#3a2414,#22180f);}
    .tmb-rg-cab b{display:block;color:#fde68a!important;font-size:15px;}.tmb-rg-cab small{color:#e7d5bb;font-size:12px;}
    .tmb-paso{display:flex;gap:10px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.06);}
    .tmb-paso b{display:block;font-size:13.5px;}.tmb-paso p{margin:2px 0 0;font-size:12.5px;color:#c4c4cc;line-height:1.4;}
    .tmb-pi{width:32px;height:32px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;border:1px solid;}
    .tmb-tr{display:grid;grid-template-columns:1fr auto;gap:3px 10px;margin-top:5px;}
    .tmb-tr i{font-style:normal;text-align:right;color:#a1a1aa;font-weight:600;}
    .tmb-tr i.d{color:#fde68a;background:rgba(253,230,138,.12);border-radius:6px;padding:0 6px;}
    .tmb-glos{margin:2px 0;white-space:normal;}
    .tmb-glos summary{cursor:pointer;font-weight:700;color:#d4d4d8;list-style:none;}
    .tmb-glos summary::after{content:' ▾';color:#a1a1aa;}
    .tmb-glos[open]{white-space:pre-wrap;}
    /* ── Quick replies ── */
    .tm-bot-quickreplies{display:flex;flex-wrap:nowrap;gap:6px;padding:2px 14px 8px;flex-shrink:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
    .tm-bot-quickreplies::-webkit-scrollbar{display:none;}
    .tm-bot-opina{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:-2px 0 6px 4px;font-size:12.5px;color:#a1a1aa;}
    .tm-bot-opina button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#e4e4e7;border-radius:999px;padding:5px 11px;font:inherit;font-size:12.5px;cursor:pointer;}
    .tm-bot-opina button:hover{border-color:rgba(249,115,22,.6);}
    .tm-bot-opina-mot{display:flex;flex-wrap:wrap;gap:6px;width:100%;}
    .tm-bot-opina-mot button{border-radius:12px;}
    .tm-bot-quickreply{flex:none;background:#17171b;color:#e4e4e7;border:1px solid rgba(255,255,255,.14);padding:8px 13px;border-radius:999px;font-size:13px;cursor:pointer;transition:all .2s;font-weight:600;white-space:nowrap;}
    .tm-bot-quickreply:hover{background:#E8501E;color:#fff;border-color:#E8501E;transform:translateY(-1px);}
    .tm-bot-quickreply.wa{background:rgba(37,211,102,.12);color:#25D366;border-color:rgba(37,211,102,.3);}
    .tm-bot-quickreply.wa:hover{background:#25D366;color:#fff;}
    .tm-bot-quickreply.compare{background:rgba(120,140,255,.12);color:#90a8ff;border-color:rgba(120,140,255,.3);}
    /* ── Input ── */
    .tm-bot-input{display:flex;gap:6px;align-items:center;margin:4px 12px calc(12px + env(safe-area-inset-bottom,0px));padding:5px 5px 5px 4px;background:#1a1a1f;border:1px solid rgba(255,255,255,.1);border-radius:999px;flex-shrink:0;transition:border-color .2s,box-shadow .2s;}
    .tm-bot-input:focus-within{border-color:rgba(249,115,22,.55);box-shadow:0 0 0 3px rgba(249,115,22,.12);}
    .tm-bot-input-wrap{flex:1;position:relative;min-width:0;}
    .tm-bot-input input{width:100%;background:transparent;border:0;color:#fff;padding:10px 12px;border-radius:999px;font-size:15px;outline:none!important;box-shadow:none!important;font-family:inherit;-webkit-appearance:none;appearance:none;}
    /* La regla general de accesibilidad (html body :focus-visible) pinta un
       contorno naranja cuadrado en todo lo enfocado. Aquí el foco ya se ve: se
       ilumina la píldora entera (:focus-within), así que el campo no lo lleva. */
    html body #tmBotPanel #tmBotInput,html body #tmBotPanel #tmBotInput:focus,html body #tmBotPanel #tmBotInput:focus-visible{outline:none!important;box-shadow:none!important;border:0!important;border-radius:999px!important;}
    .tm-bot-input input::placeholder{color:#71717a;}
    .tm-bot-send{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea580c);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .2s,opacity .2s;box-shadow:0 4px 14px rgba(234,88,12,.35);}
    .tm-bot-send:hover:not(:disabled){transform:scale(1.06);}
    .tm-bot-send:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;}
    .tm-bot-send svg{width:19px;height:19px;margin-left:2px;}
    /* ── Sugerencias del input ── */
    .tm-bot-suggestions{position:absolute;bottom:100%;left:0;right:0;margin-bottom:6px;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:6px;display:none;flex-direction:column;gap:2px;max-height:200px;overflow-y:auto;box-shadow:0 -4px 16px rgba(0,0,0,.4);z-index:5;}
    .tm-bot-suggestions.show{display:flex;}
    .tm-bot-suggestion{padding:8px 10px;font-size:12.5px;color:#fff;cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:8px;transition:background .15s;}
    .tm-bot-suggestion:hover,.tm-bot-suggestion.active{background:#252525;}
    .tm-bot-suggestion .ic{width:28px;height:28px;border-radius:6px;flex-shrink:0;background:#252525;display:flex;align-items:center;justify-content:center;}
    .tm-bot-suggestion .ic img{width:100%;height:100%;border-radius:6px;object-fit:cover;}
    .tm-bot-suggestion-info{flex:1;min-width:0;}
    .tm-bot-suggestion-name{font-size:12px;font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tm-bot-suggestion-meta{font-size:10.5px;color:#999;margin-top:1px;}
    .tm-bot-suggestion-action{font-size:10px;color:#ff6b35;font-weight:700;background:rgba(232,80,30,.12);padding:3px 7px;border-radius:6px;flex-shrink:0;}
    /* ── MODO CLARO: el bot sigue el tema del sitio ── */
    body.light-mode .tm-bot-welcome{background:#fff;color:#1a1a1a;border:1px solid rgba(0,0,0,.1);box-shadow:0 6px 20px rgba(0,0,0,.15);}
    body.light-mode .tm-bot-welcome-close{color:#999;}
    body.light-mode .tm-bot-welcome-close:hover{color:#1a1a1a;}
    body.light-mode .tm-bot-badge,body.light-mode .tm-bot-bubble.has-new::after{border-color:#fff;}
    body.light-mode .tm-bot-panel{background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 8px 40px rgba(0,0,0,.2);}
    body.light-mode .tm-bot-body{background:#fff;}
    body.light-mode .tm-bot-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);}
    body.light-mode .tm-bot-date-sep{color:#8a8a94;}
    body.light-mode .tm-bot-msg.bot{background:linear-gradient(180deg,#F5F1EA 0%,#F0EBE4 100%);color:#1a1a1a;border-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-msg.bot strong,body.light-mode .tm-bot-msg.bot b{color:#111;}
    body.light-mode .tm-bot-msg.bot em{color:inherit;}
    body.light-mode .tm-bot-msg.bot code{background:rgba(232,80,30,.12);color:#C2410C;}
    body.light-mode .tm-bot-msg.bot .meta{color:#8a8a94;}
    body.light-mode .tm-bot-link{color:#C2410C;}
    body.light-mode .tm-bot-product{background:#F7F5F2;border-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-product:hover{background:#EDE9E3;border-color:rgba(232,80,30,.4);}
    body.light-mode .tm-bot-product-name{color:#1a1a1a;}
    body.light-mode .tm-bot-product-price{color:#15803D;}
    body.light-mode .tm-bot-product-stock,body.light-mode .tm-bot-product-price .mn{color:#666;}
    body.light-mode .tm-bot-compare{background:#F7F5F2;border-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-compare-head{color:#C2410C;border-bottom-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-compare-grid > div{border-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-compare-grid .ch,body.light-mode .tm-bot-compare-grid .row-label{background:rgba(0,0,0,.03);color:#666;}
    body.light-mode .tm-bot-compare-grid .ch-img .nm,body.light-mode .tm-bot-compare-grid .v{color:#1a1a1a;}
    body.light-mode .tm-bot-compare-grid .v.win{color:#15803D;}
    body.light-mode .tm-bot-compare-grid .v.lose{color:#B91C1C;}
    body.light-mode .tm-bot-compare-verdict{background:rgba(46,204,113,.08);color:#14532D;border-top-color:rgba(0,0,0,.08);}
    body.light-mode .tm-bot-compare-verdict b{color:#15803D;}
    body.light-mode .tm-bot-quickreply{background:rgba(232,80,30,.1);color:#C2410C;}
    body.light-mode .tm-bot-input{background:#F7F5F2;border-color:rgba(0,0,0,.1);}
    body.light-mode .tm-bot-input input{background:transparent;color:#1a1a1a;}
    body.light-mode .tm-bot-suggestions{background:#fff;border-color:rgba(0,0,0,.1);box-shadow:0 -4px 16px rgba(0,0,0,.12);}
    body.light-mode .tm-bot-suggestion{color:#1a1a1a;}
    body.light-mode .tm-bot-suggestion:hover,body.light-mode .tm-bot-suggestion.active{background:#F0EBE4;}
    body.light-mode .tm-bot-suggestion .ic{background:#F0EBE4;}
    body.light-mode .tm-bot-suggestion-meta{color:#666;}
    body.light-mode .tm-bot-suggestion-action{color:#C2410C;}
    @media(max-width:380px){.tm-bot-panel{max-width:100%;height:85vh;}.tm-bot-compare-grid{grid-template-columns:76px 1fr 1fr;font-size:11px;}}
    /* Quien pidió menos animación no debería recibir una burbuja que late
       sin parar en una esquina de la pantalla. */
    @media(prefers-reduced-motion:reduce){
      .tm-bot-bubble,.tm-bot-msg,.tm-bot-compare,.tm-bot-header-status::before,.tm-bot-bubble.has-new::after{animation:none!important;}
      .tm-bot-panel{transition:opacity .2s ease!important;}
      .tm-bot-body{scroll-behavior:auto;}
    }
    `;
    document.head.appendChild(style);

    // ── DOM ──
    // Los ids son contrato con el cerebro: js/tm-bot-cerebro.js los busca
    // por nombre para engancharse. No renombrar sin cambiar allá también.
    const bubble = document.createElement('button');
    bubble.className = 'tm-bot-bubble';
    bubble.id = 'tmBotBubble';
    bubble.setAttribute('aria-label', 'Abrir chat con Max');
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.51 3.6 1.39 5.09L2 22l4.91-1.39C8.4 21.49 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.45-4.56-1.24l-.33-.2-2.92.83.83-2.92-.2-.33C3.45 15.22 3 13.66 3 12c0-4.96 4.04-9 9-9s9 4.04 9 9-4.04 9-9 9zm5-9.5c0 2.49-2.01 4.5-4.5 4.5-.78 0-1.51-.2-2.15-.55L8 15.5l1.05-2.35C8.7 12.51 8.5 11.78 8.5 11c0-2.49 2.01-4.5 4.5-4.5S17 8.51 17 11z"/></svg><span class="tm-bot-badge" aria-hidden="true">1</span>';
    document.body.appendChild(bubble);
    // Solo se ve en PC (CSS). Es un botón aparte, no texto dentro de la
    // burbuja: la burbuja mide 52px y el cerebro la maneja por id.
    const etiqueta = document.createElement('button');
    etiqueta.type = 'button';
    etiqueta.className = 'tm-bot-label';
    etiqueta.textContent = 'Pregúntale a Max';
    etiqueta.addEventListener('click', () => bubble.click());
    document.body.appendChild(etiqueta);

    const welcome = document.createElement('div');
    welcome.className = 'tm-bot-welcome';
    welcome.id = 'tmBotWelcome';
    welcome.innerHTML = '<button class="tm-bot-welcome-close" aria-label="Cerrar">×</button>'
        + '<div class="tm-bot-welcome-avatar">🤖</div>'
        + '<div class="tm-bot-welcome-txt"><b>Max · Asistente</b><br>¿Buscas algo? Pregúntame lo que sea 👋</div>';
    document.body.appendChild(welcome);

    const panel = document.createElement('div');
    panel.className = 'tm-bot-panel';
    panel.id = 'tmBotPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat con Max, asistente de TiendaMax');
    panel.innerHTML = `
        <div class="tm-bot-header">
            <div class="tm-bot-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.51 3.6 1.39 5.09L2 22l4.91-1.39C8.4 21.49 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-3.5 9.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
            </div>
            <div class="tm-bot-header-info">
                <div class="tm-bot-header-name">Max <span class="verified" title="Asistente de TiendaMax">✓</span></div>
                <div class="tm-bot-header-status">En línea · responde al instante</div>
            </div>
            <div class="tm-bot-header-actions">
                <button class="tm-bot-header-btn" id="tmBotReset" title="Reiniciar conversación" aria-label="Reiniciar conversación">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.958 7.958 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z"/></svg>
                </button>
                <button class="tm-bot-header-btn" id="tmBotClose" title="Cerrar" aria-label="Cerrar chat">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
        </div>
        <div class="tm-bot-body" id="tmBotBody" aria-live="polite" aria-atomic="false"></div>
        <div class="tm-bot-quickreplies" id="tmBotQuickReplies"></div>
        <div class="tm-bot-input">
            <div class="tm-bot-input-wrap">
                <input type="text" id="tmBotInput" placeholder="Pregúntame lo que sea…" autocomplete="off" aria-label="Escribe tu mensaje">
                <div class="tm-bot-suggestions" id="tmBotSuggestions" role="listbox" aria-label="Sugerencias"></div>
            </div>
            <button class="tm-bot-send" id="tmBotSend" aria-label="Enviar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></svg>
            </button>
        </div>
    `;
    document.body.appendChild(panel);

    const bodyEl = panel.querySelector('#tmBotBody');
    const inputEl = panel.querySelector('#tmBotInput');
    const closeBtn = panel.querySelector('#tmBotClose');
    const welcomeClose = welcome.querySelector('.tm-bot-welcome-close');

    // ── Carga diferida del cerebro ──
    function _mensajeProvisional(html, id) {
        const msg = document.createElement('div');
        msg.className = 'tm-bot-msg bot';
        msg.id = id || '';
        msg.innerHTML = html;
        bodyEl.appendChild(msg);
        bodyEl.scrollTop = bodyEl.scrollHeight;
        return msg;
    }

    function cargarCerebro() {
        if (window._tmBotCerebroListo || _cargando) return;
        _cargando = true;
        _fallo = false;
        const s = document.createElement('script');
        s.src = _urlCerebro();
        s.defer = true;
        s.onerror = () => {
            _cargando = false;
            _fallo = true;
            const t = document.getElementById('tmBotCargando');
            if (t) t.remove();
            const num = (typeof getNumeroWhatsApp === 'function') ? getNumeroWhatsApp() : '5354320170';
            _mensajeProvisional('😕 No pude cargar el asistente (parece que la conexión falló). '
                + 'Puedes reintentar o escribirnos directo por WhatsApp: '
                + '<a class="tm-bot-link" href="https://wa.me/' + num + '" target="_blank" rel="noopener noreferrer">wa.me/' + num + '</a>');
            const qr = document.getElementById('tmBotQuickReplies');
            if (qr) {
                qr.innerHTML = '';
                const btn = document.createElement('button');
                btn.className = 'tm-bot-quickreply';
                btn.textContent = '🔄 Reintentar';
                btn.onclick = () => {
                    qr.innerHTML = '';
                    bodyEl.innerHTML = '';
                    abrirPanel();
                };
                qr.appendChild(btn);
            }
        };
        document.head.appendChild(s);
    }

    // Precargar en cuanto el cliente muestre intención de usarlo (rozar la
    // burbuja o tabular hasta ella): así el chat abre instantáneo, pero
    // quien nunca se acerca no descarga nada.
    ['mouseenter', 'touchstart', 'focus'].forEach(ev => {
        bubble.addEventListener(ev, cargarCerebro, { once: true, passive: true });
    });

    // Cuando el cerebro termina de cargar toma el control: reengancha
    // todos los handlers (por eso usa .onclick =, que reemplaza) y pinta
    // el saludo o la conversación guardada.
    window._tmBotAlCargarCerebro = function() {
        _cargando = false;
        const t = document.getElementById('tmBotCargando');
        if (t) t.remove();
        // Precarga silenciosa: el cerebro ya está listo, pero nadie pidió
        // abrir nada. Se queda esperando el click de verdad.
        if (!_pedidoAbrir) return;
        try { window._tmBot.open(); } catch (e) {}
        // Lo que el cliente escribió mientras cargaba no se pierde.
        const pend = window._tmBotPendiente;
        window._tmBotPendiente = null;
        if (pend) { try { window._tmBot.send(pend); } catch (e) {} }
    };

    function abrirPanel() {
        _pedidoAbrir = true;
        panel.classList.add('open');
        _panelOpen = true;
        bubble.classList.remove('has-new');
        const badge = bubble.querySelector('.tm-bot-badge');
        if (badge) badge.remove();
        welcome.classList.remove('visible');
        if (window._tmBotCerebroListo) {
            try { window._tmBot.open(); } catch (e) {}
            return;
        }
        if (!document.getElementById('tmBotCargando') && !_fallo) {
            _mensajeProvisional('👋 Un segundo, estoy despertando…', 'tmBotCargando');
        }
        cargarCerebro();
        // En el teléfono no: el teclado saldría solo y taparía medio chat.
        let tactil = false;
        try { tactil = matchMedia('(hover: none), (pointer: coarse)').matches; } catch (e) {}
        if (!tactil) setTimeout(() => { try { inputEl.focus(); } catch (e) {} }, 300);
    }

    // Con el teclado abierto, la hoja termina encima de él: si no, la barra de
    // escribir queda debajo del teclado y no se ve lo que se escribe.
    (function () {
        const vv = window.visualViewport;
        if (!vv) return;
        const ajustar = () => {
            if (window.innerWidth > 479) { panel.style.bottom = ''; return; }
            const tapado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
            panel.style.bottom = tapado > 60 ? tapado + 'px' : '';
        };
        vv.addEventListener('resize', ajustar);
        vv.addEventListener('scroll', ajustar);
    })();

    function cerrarPanel() {
        panel.classList.remove('open');
        _panelOpen = false;
    }

    bubble.onclick = () => { _panelOpen ? cerrarPanel() : abrirPanel(); };
    closeBtn.onclick = cerrarPanel;
    welcomeClose.onclick = (e) => { e.stopPropagation(); welcome.classList.remove('visible'); };
    welcome.addEventListener('click', (e) => {
        if (e.target === welcomeClose) return;
        abrirPanel();
    });
    // Antes de que el cerebro llegue, escribir y dar Enter no debe perderse:
    // se abre igual y el cerebro reengancha el input al cargar.
    function _guardarPendiente() {
        if (window._tmBotCerebroListo) return;
        const txt = (inputEl.value || '').trim();
        if (txt) { window._tmBotPendiente = txt; inputEl.value = ''; }
        cargarCerebro();
    }
    panel.querySelector('#tmBotSend').onclick = _guardarPendiente;
    inputEl.addEventListener('focus', cargarCerebro, { once: true });
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !window._tmBotCerebroListo) { e.preventDefault(); _guardarPendiente(); }
    });
    document.addEventListener('keydown', (e) => {
        // Con el cerebro cargado, él tiene su propio Escape y su propio
        // estado de panel: duplicarlo aquí los desincronizaba.
        if (e.key === 'Escape' && _panelOpen && !window._tmBotCerebroListo) cerrarPanel();
    });

    // ── Aviso de que Max existe ──
    // El globo "¿Buscas algo?" ya no se muestra: aparecía encima de las
    // tarjetas justo cuando el cliente las estaba leyendo, y junto a la
    // burbuja eran dos Max en la misma esquina. El elemento #tmBotWelcome
    // sigue en el DOM porque el cerebro lo busca por id (contrato), pero se
    // queda oculto. En su lugar: el punto verde en la burbuja una vez por
    // sesión, y en PC —donde sobra sitio— la etiqueta fija "Pregúntale a Max".
    function mostrarBienvenida() {
        if (sessionStorage.getItem('tm_bot_welcome_shown')) return;
        setTimeout(() => {
            if (_panelOpen) return;
            sessionStorage.setItem('tm_bot_welcome_shown', '1');
            bubble.classList.add('has-new');
        }, 4000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mostrarBienvenida);
    } else {
        mostrarBienvenida();
    }

    // API mínima mientras el cerebro no está: al cargar, él la reemplaza
    // con la completa (send, reset, responder, comparar…).
    window._tmBot = window._tmBot || {
        open: abrirPanel,
        close: cerrarPanel,
        send: (txt) => { abrirPanel(); window._tmBotPendiente = txt; },
    };
    window._tmBotCascara = { abrir: abrirPanel, cerrar: cerrarPanel, cargarCerebro: cargarCerebro };

    // ── Que la burbuja no tape un botón de compra ──
    // Fija abajo a la derecha, en el móvil caía justo encima del "Pedir" de
    // la columna derecha: el botón que más importa, y al tocarlo se abría
    // Max. Cuando un botón de compra pasa por debajo, la burbuja sube lo justo
    // para dejarlo libre y vuelve a su sitio cuando ya no hay nada. Escucha
    // también el scroll de los carruseles (captura), que no burbujea.
    const _COMPRA = '.btn-pedir-card,.btn-pedir-whatsapp,.carrito-btn-comprar';
    let _esq = 0, _esqPend = false;
    function _esquivar() {
        _esqPend = false;
        if (_panelOpen) return;
        const r = bubble.getBoundingClientRect();
        // Donde estaría sin el desplazamiento actual.
        const top = r.top + _esq, bottom = r.bottom + _esq, left = r.left - 6, right = r.right + 6;
        let sube = 0;
        document.querySelectorAll(_COMPRA).forEach(b => {
            const q = b.getBoundingClientRect();
            if (!q.width || q.bottom < top - 6 || q.top > bottom + 6 || q.right < left || q.left > right) return;
            sube = Math.max(sube, bottom - q.top + 10);
        });
        sube = Math.min(Math.round(sube), 140);
        if (sube !== _esq) {
            _esq = sube;
            document.documentElement.style.setProperty('--tmb-esq', sube + 'px');
        }
    }
    function _pedirEsquiva() {
        if (_esqPend) return;
        _esqPend = true;
        requestAnimationFrame(_esquivar);
    }
    document.addEventListener('scroll', _pedirEsquiva, { passive: true, capture: true });
    window.addEventListener('resize', _pedirEsquiva, { passive: true });
    setTimeout(_pedirEsquiva, 1500);
})();
