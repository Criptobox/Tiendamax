(function(){"use strict";if(window._tmBotLoaded||location.pathname.includes("/admin"))return;window._tmBotLoaded=!0;function q(){const t=document.querySelector('meta[name="tm-bot-cerebro"]');return t&&t.content?t.content:"js/tm-bot-cerebro.js"}let d=!1,f=!1,w=!1,k=!1;const B=document.createElement("style");B.textContent=`
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
    /* \u2500\u2500 Cartel de bienvenida \u2500\u2500 */
    .tm-bot-welcome{position:fixed;bottom:84px;right:16px;max-width:230px;background:linear-gradient(135deg,#1a1a1a 0%,#1f1f1f 100%);color:#fff;padding:12px 14px 12px 12px;border-radius:14px 4px 14px 14px;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:99997;font-size:13px;line-height:1.4;border:1px solid rgba(255,255,255,.12);opacity:0;transform:translateY(8px) scale(.92);transition:opacity .3s ease,transform .3s ease;pointer-events:none;display:flex;align-items:flex-start;gap:10px;}
    .tm-bot-welcome.visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
    .tm-bot-welcome-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#E8501E,#ff6b35);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 3px 8px rgba(232,80,30,.4);}
    .tm-bot-welcome-txt{flex:1;min-width:0;}
    .tm-bot-welcome-txt b{color:#ff6b35;font-size:12px;font-weight:700;}
    .tm-bot-welcome-close{position:absolute;top:4px;right:6px;background:none;border:none;color:#666;cursor:pointer;font-size:14px;padding:2px;line-height:1;}
    .tm-bot-welcome-close:hover{color:#fff;}
    /* \u2500\u2500 Panel \u2500\u2500 */
    .tm-bot-panel{position:fixed;bottom:16px;right:16px;left:16px;width:auto;max-width:400px;height:min(78vh,640px);background:#0D0D0D;display:flex;flex-direction:column;z-index:99999;transform:translateY(20px) scale(.96);opacity:0;pointer-events:none;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .25s ease;box-shadow:0 8px 40px rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08);border-radius:20px;overflow:hidden;margin:0 auto;margin-left:auto;}
    @media(min-width:480px){.tm-bot-panel{left:auto;bottom:84px;right:16px;max-width:380px;margin:0;}}
    /* En el tel\xE9fono, pantalla completa: el chat ocupaba dos tercios y la
       conversaci\xF3n se le\xEDa por una rendija. */
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
    /* .tm-bot-body es un flex column con scroll, as\xED que sus hijos se
       encogen por defecto (flex-shrink:1) en cuanto la conversaci\xF3n pasa
       del alto del panel. La tabla comparativa, que no tiene padding
       propio que la sostenga, quedaba aplastada a 2px de alto: la funci\xF3n
       estrella del bot se ve\xEDa como una rayita. */
    .tm-bot-body > *{flex-shrink:0;}
    /* \u2500\u2500 Mensajes \u2500\u2500
       white-space:pre-wrap es obligatorio: las respuestas se arman como
       texto con \\n (listas de vi\xF1etas, tablas de potencias, fichas). Sin
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
    /* \u2500\u2500 Typing \u2500\u2500 */
    .tm-bot-typing-wrap{padding:14px 16px;}
    .tm-bot-typing{display:inline-flex;gap:4px;align-items:center;}
    .tm-bot-typing span{width:8px;height:8px;background:#ff6b35;border-radius:50%;animation:tmBotTyping 1.2s infinite;}
    .tm-bot-typing span:nth-child(2){animation-delay:.2s;}
    .tm-bot-typing span:nth-child(3){animation-delay:.4s;}
    @keyframes tmBotTyping{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-7px);opacity:1;}}
    /* \u2500\u2500 Tarjetas de producto \u2500\u2500 */
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
    /* \u2500\u2500 Comparativa \u2500\u2500 */
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
    /* \u2500\u2500 Bienvenida: botones grandes, regalo, rebajas \u2500\u2500 */
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
    /* \u2500\u2500 Estado del stock: el mismo color en todas partes \u2500\u2500 */
    .tmb-st{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;margin-top:4px;}
    .tmb-st.ok{background:rgba(34,197,94,.14);color:#4ade80;}
    .tmb-st.am{background:rgba(245,158,11,.16);color:#fbbf24;}
    .tmb-st.ag{background:rgba(239,68,68,.15);color:#f87171;}
    /* \u2500\u2500 La Tarjeta TiendaMax, explicada \u2500\u2500 */
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
    .tmb-glos summary::after{content:' \u25BE';color:#a1a1aa;}
    .tmb-glos[open]{white-space:pre-wrap;}
    /* \u2500\u2500 Quick replies \u2500\u2500 */
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
    /* \u2500\u2500 Input \u2500\u2500 */
    .tm-bot-input{display:flex;gap:6px;align-items:center;margin:4px 12px calc(12px + env(safe-area-inset-bottom,0px));padding:5px 5px 5px 4px;background:#1a1a1f;border:1px solid rgba(255,255,255,.1);border-radius:999px;flex-shrink:0;transition:border-color .2s,box-shadow .2s;}
    .tm-bot-input:focus-within{border-color:rgba(249,115,22,.55);box-shadow:0 0 0 3px rgba(249,115,22,.12);}
    .tm-bot-input-wrap{flex:1;position:relative;min-width:0;}
    .tm-bot-input input{width:100%;background:transparent;border:0;color:#fff;padding:10px 12px;border-radius:999px;font-size:15px;outline:none!important;box-shadow:none!important;font-family:inherit;-webkit-appearance:none;appearance:none;}
    /* La regla general de accesibilidad (html body :focus-visible) pinta un
       contorno naranja cuadrado en todo lo enfocado. Aqu\xED el foco ya se ve: se
       ilumina la p\xEDldora entera (:focus-within), as\xED que el campo no lo lleva. */
    html body #tmBotPanel #tmBotInput,html body #tmBotPanel #tmBotInput:focus,html body #tmBotPanel #tmBotInput:focus-visible{outline:none!important;box-shadow:none!important;border:0!important;border-radius:999px!important;}
    .tm-bot-input input::placeholder{color:#71717a;}
    .tm-bot-send{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea580c);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .2s,opacity .2s;box-shadow:0 4px 14px rgba(234,88,12,.35);}
    .tm-bot-send:hover:not(:disabled){transform:scale(1.06);}
    .tm-bot-send:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;}
    .tm-bot-send svg{width:19px;height:19px;margin-left:2px;}
    /* \u2500\u2500 Sugerencias del input \u2500\u2500 */
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
    /* \u2500\u2500 MODO CLARO: el bot sigue el tema del sitio \u2500\u2500 */
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
    /* Quien pidi\xF3 menos animaci\xF3n no deber\xEDa recibir una burbuja que late
       sin parar en una esquina de la pantalla. */
    @media(prefers-reduced-motion:reduce){
      .tm-bot-bubble,.tm-bot-msg,.tm-bot-compare,.tm-bot-header-status::before,.tm-bot-bubble.has-new::after{animation:none!important;}
      .tm-bot-panel{transition:opacity .2s ease!important;}
      .tm-bot-body{scroll-behavior:auto;}
    }
    `,document.head.appendChild(B);const a=document.createElement("button");a.className="tm-bot-bubble",a.id="tmBotBubble",a.setAttribute("aria-label","Abrir chat con Max"),a.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.51 3.6 1.39 5.09L2 22l4.91-1.39C8.4 21.49 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.45-4.56-1.24l-.33-.2-2.92.83.83-2.92-.2-.33C3.45 15.22 3 13.66 3 12c0-4.96 4.04-9 9-9s9 4.04 9 9-4.04 9-9 9zm5-9.5c0 2.49-2.01 4.5-4.5 4.5-.78 0-1.51-.2-2.15-.55L8 15.5l1.05-2.35C8.7 12.51 8.5 11.78 8.5 11c0-2.49 2.01-4.5 4.5-4.5S17 8.51 17 11z"/></svg><span class="tm-bot-badge" aria-hidden="true">1</span>',document.body.appendChild(a);const c=document.createElement("button");c.type="button",c.className="tm-bot-label",c.textContent="Preg\xFAntale a Max",c.addEventListener("click",()=>a.click()),document.body.appendChild(c);const i=document.createElement("div");i.className="tm-bot-welcome",i.id="tmBotWelcome",i.innerHTML='<button class="tm-bot-welcome-close" aria-label="Cerrar">\xD7</button><div class="tm-bot-welcome-avatar">\u{1F916}</div><div class="tm-bot-welcome-txt"><b>Max \xB7 Asistente</b><br>\xBFBuscas algo? Preg\xFAntame lo que sea \u{1F44B}</div>',document.body.appendChild(i);const r=document.createElement("div");r.className="tm-bot-panel",r.id="tmBotPanel",r.setAttribute("role","dialog"),r.setAttribute("aria-label","Chat con Max, asistente de TiendaMax"),r.innerHTML=`
        <div class="tm-bot-header">
            <div class="tm-bot-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.51 3.6 1.39 5.09L2 22l4.91-1.39C8.4 21.49 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-3.5 9.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
            </div>
            <div class="tm-bot-header-info">
                <div class="tm-bot-header-name">Max <span class="verified" title="Asistente de TiendaMax">\u2713</span></div>
                <div class="tm-bot-header-status">En l\xEDnea \xB7 responde al instante</div>
            </div>
            <div class="tm-bot-header-actions">
                <button class="tm-bot-header-btn" id="tmBotReset" title="Reiniciar conversaci\xF3n" aria-label="Reiniciar conversaci\xF3n">
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
                <input type="text" id="tmBotInput" placeholder="Preg\xFAntame lo que sea\u2026" autocomplete="off" aria-label="Escribe tu mensaje">
                <div class="tm-bot-suggestions" id="tmBotSuggestions" role="listbox" aria-label="Sugerencias"></div>
            </div>
            <button class="tm-bot-send" id="tmBotSend" aria-label="Enviar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></svg>
            </button>
        </div>
    `,document.body.appendChild(r);const u=r.querySelector("#tmBotBody"),m=r.querySelector("#tmBotInput"),_=r.querySelector("#tmBotClose"),C=i.querySelector(".tm-bot-welcome-close");function E(t,e){const o=document.createElement("div");return o.className="tm-bot-msg bot",o.id=e||"",o.innerHTML=t,u.appendChild(o),u.scrollTop=u.scrollHeight,o}function g(){if(window._tmBotCerebroListo||f)return;f=!0,w=!1;const t=document.createElement("script");t.src=q(),t.defer=!0,t.onerror=()=>{f=!1,w=!0;const e=document.getElementById("tmBotCargando");e&&e.remove();const o=typeof getNumeroWhatsApp=="function"?getNumeroWhatsApp():"5354320170";E('\u{1F615} No pude cargar el asistente (parece que la conexi\xF3n fall\xF3). Puedes reintentar o escribirnos directo por WhatsApp: <a class="tm-bot-link" href="https://wa.me/'+o+'" target="_blank" rel="noopener noreferrer">wa.me/'+o+"</a>");const l=document.getElementById("tmBotQuickReplies");if(l){l.innerHTML="";const s=document.createElement("button");s.className="tm-bot-quickreply",s.textContent="\u{1F504} Reintentar",s.onclick=()=>{l.innerHTML="",u.innerHTML="",b()},l.appendChild(s)}},document.head.appendChild(t)}["mouseenter","touchstart","focus"].forEach(t=>{a.addEventListener(t,g,{once:!0,passive:!0})}),window._tmBotAlCargarCerebro=function(){f=!1;const t=document.getElementById("tmBotCargando");if(t&&t.remove(),!k)return;try{window._tmBot.open()}catch(o){}const e=window._tmBotPendiente;if(window._tmBotPendiente=null,e)try{window._tmBot.send(e)}catch(o){}};function b(){k=!0,r.classList.add("open"),d=!0,a.classList.remove("has-new");const t=a.querySelector(".tm-bot-badge");if(t&&t.remove(),i.classList.remove("visible"),window._tmBotCerebroListo){try{window._tmBot.open()}catch(o){}return}!document.getElementById("tmBotCargando")&&!w&&E("\u{1F44B} Un segundo, estoy despertando\u2026","tmBotCargando"),g();let e=!1;try{e=matchMedia("(hover: none), (pointer: coarse)").matches}catch(o){}e||setTimeout(()=>{try{m.focus()}catch(o){}},300)}(function(){const t=window.visualViewport;if(!t)return;const e=()=>{if(window.innerWidth>479){r.style.bottom="";return}const o=Math.max(0,Math.round(window.innerHeight-t.height-t.offsetTop));r.style.bottom=o>60?o+"px":""};t.addEventListener("resize",e),t.addEventListener("scroll",e)})();function x(){r.classList.remove("open"),d=!1}a.onclick=()=>{d?x():b()},_.onclick=x,C.onclick=t=>{t.stopPropagation(),i.classList.remove("visible")},i.addEventListener("click",t=>{t.target!==C&&b()});function z(){if(window._tmBotCerebroListo)return;const t=(m.value||"").trim();t&&(window._tmBotPendiente=t,m.value=""),g()}r.querySelector("#tmBotSend").onclick=z,m.addEventListener("focus",g,{once:!0}),m.addEventListener("keydown",t=>{t.key==="Enter"&&!window._tmBotCerebroListo&&(t.preventDefault(),z())}),document.addEventListener("keydown",t=>{t.key==="Escape"&&d&&!window._tmBotCerebroListo&&x()});function L(){sessionStorage.getItem("tm_bot_welcome_shown")||setTimeout(()=>{d||(sessionStorage.setItem("tm_bot_welcome_shown","1"),a.classList.add("has-new"))},4e3)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",L):L(),window._tmBot=window._tmBot||{open:b,close:x,send:t=>{b(),window._tmBotPendiente=t}},window._tmBotCascara={abrir:b,cerrar:x,cargarCerebro:g};const j=".btn-pedir-card,.btn-pedir-whatsapp,.carrito-btn-comprar";let h=0,y=!1;function M(){if(y=!1,d)return;const t=a.getBoundingClientRect(),e=t.top+h,o=t.bottom+h,l=t.left-6,s=t.right+6;let n=0;document.querySelectorAll(j).forEach(D=>{const p=D.getBoundingClientRect();!p.width||p.bottom<e-6||p.top>o+6||p.right<l||p.left>s||(n=Math.max(n,o-p.top+10))}),n=Math.min(Math.round(n),140),n!==h&&(h=n,document.documentElement.style.setProperty("--tmb-esq",n+"px"))}function v(){y||(y=!0,requestAnimationFrame(M))}document.addEventListener("scroll",v,{passive:!0,capture:!0}),window.addEventListener("resize",v,{passive:!0}),setTimeout(v,1500)})();
