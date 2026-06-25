/* ============================================================
   TiendaMax — Bot "Max" asistente virtual
   Burbuja flotante + panel de chat + cartel de bienvenida.
   Lazy-load: el SDK y el panel solo se inicializan tras interacción.
   No bloquea la carga inicial (3G-friendly).
   ============================================================ */
(function() {
    'use strict';

    // No inicializar si ya existe o si estamos en admin
    if (window._tmBotLoaded) return;
    if (location.pathname.includes('/admin')) return;
    window._tmBotLoaded = true;

    // API del bot: ruta relativa.
    // - En el sandbox: Next.js proxy /api/chat → localhost:3030 (evita CORS)
    // - En producción (GitHub Pages): Caddy gateway enruta /api/chat?XTransformPort=3030 → bot
    async function callBotAPI(payload) {
        // Intentar primero con XTransformPort (Caddy), luego sin él (proxy Next)
        const urls = ['/api/chat?XTransformPort=3030', '/api/chat'];
        let lastErr;
        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) return await res.json();
                lastErr = new Error('HTTP ' + res.status);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('No se pudo conectar');
    }
    const SESSION_ID = 'tm-bot-' + (localStorage.getItem('tm_bot_session') || (Date.now().toString(36) + Math.random().toString(36).slice(2,6)));
    localStorage.setItem('tm_bot_session', SESSION_ID);

    let _panelOpen = false;
    let _welcomeShown = false;
    let _messages = []; // historial en sesión
    let _sending = false;

    // ── Estilos inyectados (no tocan bundle.css) ──
    const style = document.createElement('style');
    style.textContent = `
    .tm-bot-bubble{position:fixed;bottom:20px;right:16px;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#E8501E 0%,#ff6b35 100%);box-shadow:0 4px 14px rgba(232,80,30,.45);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99998;transition:transform .25s ease,box-shadow .25s ease;border:none;color:#fff;}
    .tm-bot-bubble:hover{transform:scale(1.08) translateY(-2px);box-shadow:0 6px 18px rgba(232,80,30,.6);}
    .tm-bot-bubble img{width:26px;height:26px;border-radius:50%;object-fit:cover;}
    .tm-bot-bubble.has-new::after{content:'';position:absolute;top:3px;right:3px;width:10px;height:10px;background:#2ECC71;border-radius:50%;border:2px solid #0D0D0D;animation:tmBotPulse 1.5s ease-in-out infinite;}
    @keyframes tmBotPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.4);opacity:.6;}}
    .tm-bot-badge{position:absolute;top:-5px;right:-5px;background:#2ECC71;color:white;font-size:9px;font-weight:700;padding:2px 5px;border-radius:10px;border:2px solid #0D0D0D;z-index:2;}
    .tm-bot-welcome{position:fixed;bottom:76px;right:16px;max-width:200px;background:#1a1a1a;color:white;padding:10px 12px 10px 10px;border-radius:14px 4px 14px 14px;box-shadow:0 6px 20px rgba(0,0,0,.5);z-index:99997;font-size:12px;line-height:1.35;border:1px solid rgba(255,255,255,.1);opacity:0;transform:translateY(8px) scale(.92);transition:opacity .3s ease,transform .3s ease;pointer-events:none;display:flex;align-items:center;gap:8px;}
    .tm-bot-welcome.visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
    .tm-bot-welcome-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#E8501E,#ff6b35);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
    .tm-bot-welcome-txt{flex:1;min-width:0;}
    .tm-bot-welcome-txt b{color:#E8501E;font-size:11px;}
    .tm-bot-welcome-close{position:absolute;top:3px;right:5px;background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:2px;line-height:1;}
    .tm-bot-welcome-close:hover{color:white;}
    .tm-bot-panel{position:fixed;bottom:16px;right:16px;left:16px;width:auto;max-width:360px;height:min(70vh,520px);background:#0D0D0D;display:flex;flex-direction:column;z-index:99999;transform:translateY(20px) scale(.96);opacity:0;pointer-events:none;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .25s ease;box-shadow:0 8px 40px rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin:0 auto;margin-left:auto;}
    @media(min-width:480px){.tm-bot-panel{left:auto;bottom:80px;right:16px;max-width:340px;margin:0;}}
    .tm-bot-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}
    .tm-bot-header{background:linear-gradient(135deg,#E8501E 0%,#ff6b35 100%);color:white;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;}
    .tm-bot-avatar{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;overflow:hidden;}
    .tm-bot-avatar img{width:24px;height:24px;border-radius:0;object-fit:contain;}
    .tm-bot-header-info{flex:1;min-width:0;}
    .tm-bot-header-name{font-weight:700;font-size:15px;line-height:1.2;}
    .tm-bot-header-status{font-size:11px;opacity:.9;display:flex;align-items:center;gap:5px;}
    .tm-bot-header-status::before{content:'';width:7px;height:7px;background:#2ECC71;border-radius:50%;display:inline-block;}
    .tm-bot-close{background:rgba(255,255,255,.15);border:none;color:white;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .tm-bot-close:hover{background:rgba(255,255,255,.3);}
    .tm-bot-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#0D0D0D;}
    .tm-bot-body::-webkit-scrollbar{width:6px;}
    .tm-bot-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:3px;}
    .tm-bot-msg{max-width:85%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.45;word-wrap:break-word;white-space:pre-wrap;animation:tmBotFadeIn .3s ease;}
    @keyframes tmBotFadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
    .tm-bot-msg.bot{background:#1f1f1f;color:white;border-radius:16px 16px 16px 4px;align-self:flex-start;}
    .tm-bot-msg.user{background:linear-gradient(135deg,#E8501E,#ff6b35);color:white;border-radius:16px 16px 4px 16px;align-self:flex-end;}
    .tm-bot-typing{display:inline-flex;gap:3px;padding:12px 16px;}
    .tm-bot-typing span{width:7px;height:7px;background:#888;border-radius:50%;animation:tmBotTyping 1.2s infinite;}
    .tm-bot-typing span:nth-child(2){animation-delay:.2s;}
    .tm-bot-typing span:nth-child(3){animation-delay:.4s;}
    @keyframes tmBotTyping{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-6px);opacity:1;}}
    .tm-bot-products{display:flex;flex-direction:column;gap:6px;margin-top:6px;}
    .tm-bot-product{display:flex;align-items:center;gap:8px;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:7px 10px;cursor:pointer;transition:background .2s;}
    .tm-bot-product:hover{background:#252525;border-color:rgba(232,80,30,.4);}
    .tm-bot-product img{width:38px;height:38px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#222;}
    .tm-bot-product-info{flex:1;min-width:0;}
    .tm-bot-product-name{font-size:12px;font-weight:600;color:white;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tm-bot-product-price{font-size:11px;color:#2ECC71;font-weight:700;}
    .tm-bot-product-stock{font-size:10px;color:#888;}
    .tm-bot-quickreplies{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;flex-shrink:0;}
    .tm-bot-quickreply{background:rgba(232,80,30,.12);color:#E8501E;border:1px solid rgba(232,80,30,.3);padding:6px 12px;border-radius:16px;font-size:12px;cursor:pointer;transition:all .2s;font-weight:600;}
    .tm-bot-quickreply:hover{background:#E8501E;color:white;}
    .tm-bot-input{display:flex;gap:8px;padding:10px 14px 14px;background:#0D0D0D;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;}
    .tm-bot-input input{flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,.1);color:white;padding:10px 14px;border-radius:20px;font-size:14px;outline:none;}
    .tm-bot-input input:focus{border-color:#E8501E;}
    /* ── MODO CLARO: el bot se adapta al tema claro del sitio ── */
    body.light-mode .tm-bot-welcome{background:#ffffff;color:#1a1a1a;border:1px solid rgba(0,0,0,.1);box-shadow:0 6px 20px rgba(0,0,0,.15);}
    body.light-mode .tm-bot-welcome-close{color:#999;}
    body.light-mode .tm-bot-welcome-close:hover{color:#1a1a1a;}
    body.light-mode .tm-bot-welcome-txt b{color:#E8501E;}
    body.light-mode .tm-bot-panel{background:#ffffff;border:1px solid rgba(0,0,0,.08);box-shadow:0 8px 40px rgba(0,0,0,.2);}
    body.light-mode .tm-bot-body{background:#ffffff;}
    body.light-mode .tm-bot-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);}
    body.light-mode .tm-bot-msg.bot{background:#f0ede8;color:#1a1a1a;}
    body.light-mode .tm-bot-product{background:#f7f5f2;border:1px solid rgba(0,0,0,.08);}
    body.light-mode .tm-bot-product:hover{background:#ede9e3;border-color:rgba(232,80,30,.4);}
    body.light-mode .tm-bot-product-name{color:#1a1a1a;}
    body.light-mode .tm-bot-product-stock{color:#666;}
    body.light-mode .tm-bot-input{background:#ffffff;border-top:1px solid rgba(0,0,0,.06);}
    body.light-mode .tm-bot-input input{background:#f7f5f2;border:1px solid rgba(0,0,0,.1);color:#1a1a1a;}
    body.light-mode .tm-bot-input input:focus{border-color:#E8501E;}
    body.light-mode .tm-bot-quickreply{background:rgba(232,80,30,.1);color:#E8501E;border:1px solid rgba(232,80,30,.3);}
    body.light-mode .tm-bot-quickreply:hover{background:#E8501E;color:white;}
    body.light-mode .tm-bot-badge{border:2px solid #ffffff;}
    body.light-mode .tm-bot-bubble.has-new::after{border:2px solid #ffffff;}
    .tm-bot-input button{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#E8501E,#ff6b35);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .2s;}
    .tm-bot-input button:hover{transform:scale(1.1);}
    .tm-bot-input button:disabled{opacity:.5;cursor:not-allowed;}
    .tm-bot-input button svg{width:18px;height:18px;}
    .tm-bot-quickreply-wa{background:linear-gradient(135deg,#25D366,#128C7E);color:white;}
    @media(max-width:380px){.tm-bot-panel{max-width:100%;}}
    `;
    document.head.appendChild(style);

    // ── Crear elementos del DOM ──
    // Burbuja flotante
    const bubble = document.createElement('button');
    bubble.className = 'tm-bot-bubble';
    bubble.setAttribute('aria-label', 'Abrir chat con Max');
    // Logo de la marca (mismo icon que usa el header)
    bubble.innerHTML = '<img src="/iconos/icon-192.png" alt="TiendaMax" onerror="this.style.display=\'none\';this.parentNode.innerHTML=\'🛍️\'"><span class="tm-bot-badge">1</span>';
    document.body.appendChild(bubble);

    // Cartel de bienvenida (mini: avatar robot + una línea)
    const welcome = document.createElement('div');
    welcome.className = 'tm-bot-welcome';
    welcome.innerHTML = '<button class="tm-bot-welcome-close" aria-label="Cerrar">×</button><div class="tm-bot-welcome-avatar">🤖</div><div class="tm-bot-welcome-txt"><b>Max</b><br>¿Te ayudo? 👋</div>';
    document.body.appendChild(welcome);

    // Panel de chat
    const panel = document.createElement('div');
    panel.className = 'tm-bot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat con Max');
    panel.innerHTML = `
        <div class="tm-bot-header">
            <div class="tm-bot-avatar"><img src="/iconos/icon-192.png" alt="" onerror="this.style.display=\'none\';this.parentNode.innerHTML=\'🛍️\'"></div>
            <div class="tm-bot-header-info">
                <div class="tm-bot-header-name">Max</div>
                <div class="tm-bot-header-status">En línea</div>
            </div>
            <button class="tm-bot-close" aria-label="Cerrar chat">×</button>
        </div>
        <div class="tm-bot-body" id="tmBotBody"></div>
        <div class="tm-bot-quickreplies" id="tmBotQuickReplies"></div>
        <div class="tm-bot-input">
            <input type="text" id="tmBotInput" placeholder="Escribe tu mensaje..." autocomplete="off" aria-label="Mensaje">
            <button id="tmBotSend" aria-label="Enviar">
                <svg viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
            </button>
        </div>
    `;
    document.body.appendChild(panel);

    const body = panel.querySelector('#tmBotBody');
    const input = panel.querySelector('#tmBotInput');
    const sendBtn = panel.querySelector('#tmBotSend');
    const closeBtn = panel.querySelector('.tm-bot-close');
    const quickRepliesEl = panel.querySelector('#tmBotQuickReplies');
    const welcomeClose = welcome.querySelector('.tm-bot-welcome-close');

    // ── Funciones ──
    function addMessage(text, who) {
        const msg = document.createElement('div');
        msg.className = 'tm-bot-msg ' + who;
        msg.textContent = text;
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
        _messages.push({ text, who });
    }

    function addTyping() {
        const t = document.createElement('div');
        t.className = 'tm-bot-msg bot tm-bot-typing-wrap';
        t.innerHTML = '<div class="tm-bot-typing"><span></span><span></span><span></span></div>';
        t.id = 'tmBotTyping';
        body.appendChild(t);
        body.scrollTop = body.scrollHeight;
    }

    function removeTyping() {
        const t = document.getElementById('tmBotTyping');
        if (t) t.remove();
    }

    function addProducts(products) {
        if (!products || products.length === 0) return;
        const wrap = document.createElement('div');
        wrap.className = 'tm-bot-products';
        wrap.style.alignSelf = 'flex-start';
        wrap.style.maxWidth = '85%';
        products.forEach(p => {
            const item = document.createElement('div');
            item.className = 'tm-bot-product';
            const precioMN = p.precio && window._tmTasaMN ? Math.round(p.precio * window._tmTasaMN()) : null;
            const agotado = p.stock === 0;
            item.innerHTML = `
                <img src="${escapeAttrBot(p.imagen) || '/iconos/favicon-192.png'}" alt="" onerror="this.src='/iconos/favicon-192.png'">
                <div class="tm-bot-product-info">
                    <div class="tm-bot-product-name">${escapeHtmlBot(p.nombre)}</div>
                    <div class="tm-bot-product-price">$${Number(p.precio).toFixed(2)} USD${precioMN ? ' · ' + precioMN.toLocaleString() + ' MN' : ''}</div>
                    <div class="tm-bot-product-stock">${agotado ? '❌ Agotado' : '📦 Stock: ' + p.stock}</div>
                </div>
            `;
            if (!agotado && typeof abrirDetalleProducto === 'function') {
                item.onclick = () => {
                    abrirDetalleProducto(p.id);
                    closePanel();
                };
            }
            wrap.appendChild(item);
        });
        body.appendChild(wrap);
        body.scrollTop = body.scrollHeight;
    }

    function escapeHtmlBot(s) {
        return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
    }
    function escapeAttrBot(s) {
        return String(s||'').replace(/["'<>&]/g, c => ({'"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;','&':'&amp;'})[c]);
    }

    // Quick replies PERMANENTES: siempre visibles, no desaparecen tras enviar.
    // Se combinan con los que devuelva la API (sin duplicar), pero los permanentes SIEMPRE están.
    const PERMANENT_QUICK_REPLIES = ['🔥 Ofertas', '📦 Categorías', '💬 WhatsApp', '❓ Cómo comprar', '🚚 Envíos'];

    function normalizeQR(s) {
        // Quitar emojis + normalizar acentos: "🔥 Ver ofertas" → "ofertas", "📦 Categorías" → "categorias"
        let cleaned = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        cleaned = cleaned.replace(/[^a-z\s]/g, '').trim();
        // Quitar palabras comunes de prefijo
        cleaned = cleaned.replace(/^(ver|como|como|que|que)\s+/g, '').trim();
        return cleaned;
    }

    function renderQuickReplies(replies) {
        quickRepliesEl.innerHTML = '';
        // Combinar permanentes + los de la API (si vienen), sin duplicar por texto similar
        const seen = new Set();
        const final = [];
        // Primero los permanentes (siempre presentes)
        PERMANENT_QUICK_REPLIES.forEach(r => {
            const key = normalizeQR(r);
            if (!seen.has(key)) { seen.add(key); final.push(r); }
        });
        // Luego los de la API que no estén ya
        if (replies && replies.length > 0) {
            replies.forEach(r => {
                let key = normalizeQR(r);
                // Mapear "Ver productos" → mismo que "Categorías" (ambos llevan al catálogo)
                if (key === 'productos') key = 'categorias';
                if (!seen.has(key)) { seen.add(key); final.push(r); }
            });
        }
        final.forEach(r => {
            const btn = document.createElement('button');
            btn.className = 'tm-bot-quickreply';
            if (/whatsapp/i.test(r)) btn.classList.add('tm-bot-quickreply-wa');
            btn.textContent = r;
            btn.onclick = () => handleQuickReply(r);
            quickRepliesEl.appendChild(btn);
        });
    }

    function handleQuickReply(reply) {
        if (/whatsapp/i.test(reply)) {
            const num = localStorage.getItem('whatsappNumero') || '5354320170';
            window.open('https://wa.me/' + num, '_blank');
            return;
        }
        if (/ver productos|categorías|categorias/i.test(reply)) {
            sendMessage('qué categorías tienen');
            return;
        }
        if (/ofertas/i.test(reply)) {
            sendMessage('qué ofertas tienen');
            return;
        }
        if (/c[oó]mo comprar/i.test(reply)) {
            sendMessage('cómo comprar');
            return;
        }
        if (/garant/i.test(reply)) {
            sendMessage('¿hay garantía?');
            return;
        }
        if (/env[ií]o/i.test(reply)) {
            sendMessage('¿hacen envíos?');
            return;
        }
        // Por defecto, enviar el texto como mensaje
        sendMessage(reply);
    }

    async function sendMessage(text) {
        text = (text || '').trim();
        if (!text || _sending) return;
        _sending = true;
        input.value = '';
        sendBtn.disabled = true;
        addMessage(text, 'user');
        // NO limpiar quick replies — mantener los permanentes visibles siempre
        addTyping();
        try {
            const data = await callBotAPI({ message: text, sessionId: SESSION_ID });
            removeTyping();
            if (data.response) addMessage(data.response, 'bot');
            if (data.products) addProducts(data.products);
            // Si la API devuelve quick replies específicos, mostrarlos; si no, mantener los permanentes
            if (data.quickReplies && data.quickReplies.length > 0) {
                renderQuickReplies(data.quickReplies);
            } else {
                renderQuickReplies(PERMANENT_QUICK_REPLIES);
            }
        } catch (e) {
            removeTyping();
            addMessage('Lo siento, tuve un problema de conexión. Intenta de nuevo o escríbenos por WhatsApp.', 'bot');
            renderQuickReplies(PERMANENT_QUICK_REPLIES);
        } finally {
            _sending = false;
            sendBtn.disabled = false;
        }
    }

    function openPanel() {
        panel.classList.add('open');
        _panelOpen = true;
        bubble.classList.remove('has-new');
        bubble.querySelector('.tm-bot-badge')?.remove();
        welcome.classList.remove('visible');
        setTimeout(() => input.focus(), 300);
        // Si no hay mensajes, enviar bienvenida automática
        if (_messages.length === 0) {
            // Mensaje de bienvenida del bot (sin llamada a API, instantáneo)
            addMessage('¡Hola! Soy Max 🤖 Tu asistente de TiendaMax. ¿Qué buscas hoy? Puedo ayudarte con productos, precios, envíos o cómo comprar.', 'bot');
            renderQuickReplies(PERMANENT_QUICK_REPLIES);
        }
    }

    function closePanel() {
        panel.classList.remove('open');
        _panelOpen = false;
    }

    // ── Eventos ──
    bubble.onclick = () => {
        if (_panelOpen) closePanel(); else openPanel();
    };
    closeBtn.onclick = closePanel;
    welcomeClose.onclick = (e) => { e.stopPropagation(); welcome.classList.remove('visible'); };
    sendBtn.onclick = () => sendMessage(input.value);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input.value);
        }
    });

    // ── Cartel de bienvenida automático (a los 4s, si el usuario no abrió el chat) ──
    // OPT: solo mostrar 1 vez por sesión (sessionStorage) para no molestar en cada carga
    function showWelcomeAfterDelay() {
        if (sessionStorage.getItem('tm_bot_welcome_shown')) {
            _welcomeShown = true;
            return;
        }
        setTimeout(() => {
            if (!_panelOpen && !_welcomeShown) {
                _welcomeShown = true;
                sessionStorage.setItem('tm_bot_welcome_shown', '1');
                welcome.classList.add('visible');
                bubble.classList.add('has-new');
                // Auto-ocultar a los 8s si no interactúa
                setTimeout(() => {
                    if (!_panelOpen) welcome.classList.remove('visible');
                }, 8000);
            }
        }, 4000);
    }

    // Iniciar bienvenida cuando el DOM esté listo y el usuario haya visto el hero
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showWelcomeAfterDelay);
    } else {
        showWelcomeAfterDelay();
    }

    // Cerrar panel con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _panelOpen) closePanel();
    });

    // Exponer para debug
    window._tmBot = { open: openPanel, close: closePanel, send: sendMessage };
})();
