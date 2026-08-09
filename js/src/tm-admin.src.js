/* ============================================================
   TiendaMax — módulo: tm-admin
   Autenticación admin, gestión productos
   Extraído de script.src.js (L2009–L2784, 776 líneas)
   Este archivo es código fuente. Se minifica via build_css/minify_js.
   ============================================================ */

// ===== AUTENTICACIÓN =====

function abrirLoginAdmin() {
    window.location.href = 'admin.html';
}

function cerrarLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    document.getElementById('adminPassword').value = '';
}

/* Entrar al panel: SOLO con la cuenta de Firebase.

   Antes había tres vías —hash en localStorage, /admin_auth y un archivo en
   GitHub— y ninguna sobrevivía a borrar los datos del navegador: el dueño se
   quedó fuera de su propia tienda sin poder recuperar nada, porque el hash de
   Firebase no se puede leer desde el navegador. Y desde que /ventas y
   /privado piden la cuenta, entrar por aquellas vías dejaba el panel a medias
   sin decir nada: se veía entero pero sin ventas, sin reservas y sin vales.

   Ahora hay una sola puerta y abre todo lo que hay detrás. Si se pierde la
   contraseña, Firebase manda un correo de recuperación — que es exactamente
   lo que no existía antes.

   El bloqueo por intentos se queda: Firebase también lo hace por su cuenta,
   pero este avisa antes y en español. */
async function verificarPassword(event) {
    event.preventDefault();

    const rl = tmParse(localStorage.getItem('admin_rl'), '{"count":0,"until":0}');
    if (Date.now() < rl.until) {
        const mins = Math.ceil((rl.until - Date.now()) / 60000);
        mostrarNotificacion(`🔒 Demasiados intentos. Espera ${mins} min.`, 'error');
        return;
    }
    if (rl.until && Date.now() >= rl.until) { rl.count = 0; rl.until = 0; }

    const email = ((document.getElementById('adminEmail') || {}).value || '').trim();
    const pass = (document.getElementById('adminPassword') || {}).value || '';
    const btn = document.getElementById('btnLoginSubmit');
    const txtOriginal = btn ? btn.textContent : '';

    if (!email || !pass) {
        mostrarNotificacion('❌ Escribe tu correo y tu contraseña', 'error');
        return;
    }
    if (typeof TMAuth === 'undefined') {
        mostrarNotificacion('❌ No cargó Firebase Auth. Revisa la conexión y recarga.', 'error');
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Entrando…'; }
    const r = await TMAuth.entrar(email, pass);
    if (btn) { btn.disabled = false; btn.textContent = txtOriginal; }

    if (r.ok) {
        localStorage.removeItem('admin_rl');
        try { localStorage.setItem('tm_admin_email', email); } catch(e) {}
        // Marca de "este dispositivo es del dueño": la usa el contador de
        // visitas para no contarme a mí navegando mi propia tienda. Antes se
        // deducía de que existiera el hash de la contraseña local.
        try { localStorage.setItem('tm_es_admin', '1'); } catch(e) {}
        usuarioAutenticado = true;
        cerrarLoginModal();
        abrirAdminPanel();
        // Reclamar la base si todavía no lo está, para que lo privado abra.
        try { if (typeof tmCuentaReclamar === 'function') tmCuentaReclamar(true); } catch(e) {}
        return;
    }

    const newCount = (rl.count || 0) + 1;
    const lockout = newCount >= 5 ? Date.now() + LOCKOUT_DURATION_MS : rl.until;
    localStorage.setItem('admin_rl', JSON.stringify({ count: newCount, until: lockout }));
    mostrarNotificacion('❌ ' + r.msg, 'error');
    const inp = document.getElementById('adminPassword');
    if (inp) inp.value = '';
}

/* Aquí vivían cambiarPasswordAdmin, sincronizarPasswordAFirebase y
   _checkPasswordSync: todo el manejo de la contraseña guardada en este
   navegador. Ya no las llama nadie desde que el login es la cuenta de
   Firebase, y dejarlas no era gratis. _checkPasswordSync avisaba «contraseña
   no sincronizada con GitHub: si borras datos del navegador perderás el
   acceso», que hoy es falso y asusta; y las otras dos escribían en
   /admin_auth un hash que ya no abre ninguna puerta. Son 150 líneas menos que
   viajan a cada móvil por 3G.

   La contraseña se cambia donde vive: Configuración → Tu cuenta → Olvidé la
   contraseña, que manda un correo de Firebase. */

function abrirAdminPanel() {
    /* Si se entró con la contraseña local, no hay sesión de Firebase y las
       ventas, reservas y vales guardados ahí devuelven 401 en silencio. El
       aviso se pinta al abrir el panel, no solo al cambiar de sesión. */
    setTimeout(() => { try { if (typeof tmAvisoSinCuenta === 'function') tmAvisoSinCuenta(); } catch(e) {} }, 400);
    if (!usuarioAutenticado) { abrirLoginAdmin(); return; }
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('visible');
    panel.style.removeProperty('display');
    document.body.classList.add('admin-mode');

    if (!document.querySelector('script[src*="revolico_integration"]')) {
        const _rs = document.createElement('script');
        _rs.src = 'js/revolico_integration.js?v=11';
        document.head.appendChild(_rs);
    }

    actualizarListaProductos();
    actualizarSelectCategorias();
    actualizarListaCategorias();
    verificarEstadoBackend();
    actualizarCountdownProductSelect();
    cargarNumeroWhatsApp();
    cargarEnvioTexto();
    poblarSelectOfertaDia();
    // FIX: Cargar analytics cuando se abre el panel admin
    setTimeout(() => {
        if (typeof renderizarAnalyticsFirebase === 'function') {
            renderizarAnalyticsFirebase();
        }
    }, 500);
    // Briefing de tareas pendientes al entrar
    setTimeout(_tmMostrarAgenda, 800);

    const inputTasa = document.getElementById('adminTasaMN');
    if (inputTasa) {
        const saved = localStorage.getItem('tasaMN');
        if (saved) inputTasa.value = saved;
    }
}

// Briefing de tareas pendientes — aparece en la tarjeta #tmAgenda al entrar al panel
async function _tmMostrarAgenda() {
    const card  = document.getElementById('tmAgenda');
    const lista = document.getElementById('tmAgendaItems');
    if (!card || !lista) return;

    const tareas = [];

    // ── 1. Productos agotados ────────────────────────────────────────────────
    const agotados = productos.filter(p => (p.activo !== false) && safeNum(p.stock) === 0);
    if (agotados.length) {
        tareas.push({
            icon: '🔴', urgencia: 3,
            titulo: `${agotados.length} producto${agotados.length > 1 ? 's' : ''} agotado${agotados.length > 1 ? 's' : ''}`,
            detalle: agotados.slice(0, 3).map(p => p.nombre).join(', ') + (agotados.length > 3 ? '…' : ''),
            accion: 'Gestionar', tab: 'manage-products', cls: ''
        });
    }

    // ── 2. Stock bajo (≤ 2 unidades) ────────────────────────────────────────
    const bajStock = productos.filter(p => (p.activo !== false) && safeNum(p.stock) > 0 && safeNum(p.stock) <= 2);
    if (bajStock.length) {
        tareas.push({
            icon: '⚠️', urgencia: 2,
            titulo: `${bajStock.length} producto${bajStock.length > 1 ? 's' : ''} con stock bajo (≤2)`,
            detalle: bajStock.slice(0, 3).map(p => `${p.nombre} (${p.stock})`).join(', ') + (bajStock.length > 3 ? '…' : ''),
            accion: 'Ver stock', tab: 'manage-products', cls: ''
        });
    }

    // ── 3. Productos sin imagen ──────────────────────────────────────────────
    const sinImg = productos.filter(p => p.activo !== false && !p.imagen);
    if (sinImg.length) {
        tareas.push({
            icon: '🖼️', urgencia: 1,
            titulo: `${sinImg.length} producto${sinImg.length > 1 ? 's' : ''} sin imagen`,
            detalle: sinImg.slice(0, 3).map(p => p.nombre).join(', ') + (sinImg.length > 3 ? '…' : ''),
            accion: 'Agregar fotos', tab: 'manage-products', cls: 'b'
        });
    }

    // ── 4. Interesados sin atender ───────────────────────────────────────────
    try {
        const atendidos  = tmParseArray(localStorage.getItem('tm_interesados_atendidos'));
        const atendSet   = new Set(atendidos);
        const rtdbUrl    = _fbRtdbUrl();
        if (rtdbUrl) {
            const rInt = await fetch(`${rtdbUrl}/interesados.json?limitToLast=30`).catch(() => null);
            if (rInt && rInt.ok) {
                const dataInt = await rInt.json();
                if (dataInt && typeof dataInt === 'object') {
                    const items = Object.values(dataInt).flatMap(v => typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : [v]);
                    const noAtendidos = items.filter(x => x && x.ts && !atendSet.has(x.ts));
                    if (noAtendidos.length) {
                        tareas.push({
                            icon: '💬', urgencia: 3,
                            titulo: `${noAtendidos.length} interesado${noAtendidos.length > 1 ? 's' : ''} sin contactar`,
                            detalle: [...new Set(noAtendidos.map(x => x.producto))].slice(0, 3).join(', '),
                            accion: 'Ver', tab: 'inicio', cls: 'g'
                        });
                    }
                }
            }
        }
    } catch(e) {}

    // ── 5. Avisos de stock pendientes (clientes esperando reposición) ────────
    try {
        const rtdbUrl = _fbRtdbUrl();
        if (rtdbUrl) {
            const rAv = await fetch(`${rtdbUrl}/avisos_stock.json`).catch(() => null);
            if (rAv && rAv.ok) {
                const dataAv = await rAv.json();
                if (dataAv && typeof dataAv === 'object') {
                    const prods = Object.keys(dataAv);
                    const total = Object.values(dataAv).reduce((s, v) => s + (v && typeof v === 'object' ? Object.keys(v).length : 0), 0);
                    if (prods.length) {
                        tareas.push({
                            icon: '🔔', urgencia: 2,
                            titulo: `${total} cliente${total > 1 ? 's' : ''} esperan reposición (${prods.length} producto${prods.length > 1 ? 's' : ''})`,
                            detalle: 'Repone stock para notificarles automáticamente',
                            accion: 'Gestionar', tab: 'manage-products', cls: ''
                        });
                    }
                }
            }
        }
    } catch(e) {}

    // ── 6. SEO — productos sin descripción ──────────────────────────────────
    const sinDesc = productos.filter(p => p.activo !== false && (!p.descripcion || p.descripcion.trim().length < 20));
    if (sinDesc.length) {
        tareas.push({
            icon: '📝', urgencia: 2,
            titulo: `${sinDesc.length} producto${sinDesc.length > 1 ? 's' : ''} sin descripción (SEO)`,
            detalle: sinDesc.slice(0, 3).map(p => p.nombre).join(', ') + (sinDesc.length > 3 ? '…' : ''),
            accion: 'Completar', tab: 'manage-products', cls: 'b'
        });
    }

    // ── 7. SEO — productos sin categoría ────────────────────────────────────
    const sinCat = productos.filter(p => p.activo !== false && !p.categoria);
    if (sinCat.length) {
        tareas.push({
            icon: '🏷️', urgencia: 1,
            titulo: `${sinCat.length} producto${sinCat.length > 1 ? 's' : ''} sin categoría`,
            detalle: sinCat.slice(0, 3).map(p => p.nombre).join(', ') + (sinCat.length > 3 ? '…' : ''),
            accion: 'Categorizar', tab: 'manage-products', cls: 'b'
        });
    }

    // ── 8. SEO — nombres demasiado cortos o sin palabras clave útiles ────────
    const nombreCorto = productos.filter(p => p.activo !== false && p.nombre && p.nombre.trim().length < 8);
    if (nombreCorto.length) {
        tareas.push({
            icon: '✍️', urgencia: 1,
            titulo: `${nombreCorto.length} producto${nombreCorto.length > 1 ? 's' : ''} con nombre muy corto`,
            detalle: nombreCorto.slice(0, 3).map(p => p.nombre).join(', ') + (nombreCorto.length > 3 ? '…' : ''),
            accion: 'Mejorar', tab: 'manage-products', cls: 'b'
        });
    }

    // ── 9. Campañas con seguimiento vencido (del Centro de tareas IA) ──────
    try {
        const camps = tmParseArray(localStorage.getItem('tm_campaigns_v1'));
        const vencidas = camps.filter(c => c.followUpAt && new Date(c.followUpAt).getTime() <= Date.now() && !/hecho|cerrad|complet/i.test(c.status || ''));
        if (vencidas.length) {
            tareas.push({
                icon: '📌', urgencia: 3,
                titulo: `${vencidas.length} campaña${vencidas.length > 1 ? 's' : ''} con seguimiento vencido`,
                detalle: vencidas.slice(0, 2).map(c => c.title || c.productName || '').filter(Boolean).join(', ') + (vencidas.length > 2 ? '…' : ''),
                accion: 'Ver campañas', tab: 'herramientas', cls: ''
            });
        }
    } catch(e) {}

    // ── 11. Plan semanal de hoy pendiente (del Centro de tareas IA) ─────────
    try {
        const plans = tmParseArray(localStorage.getItem('tm_week_plan_v1'));
        const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const hoy = dias[new Date().getDay()];
        const pendPlans = plans.filter(p => !(p.done && p.done[hoy]));
        if (pendPlans.length) {
            tareas.push({
                icon: '🗓️', urgencia: 2,
                titulo: `Plan de ${hoy} pendiente`,
                detalle: pendPlans.slice(0, 2).map(p => p.title || '').filter(Boolean).join(' · '),
                accion: 'Ver plan', tab: 'herramientas', cls: ''
            });
        }
    } catch(e) {}

    // ── 12. Productos sin SEO title/description (del Centro de tareas IA) ───
    const sinSEO = productos.filter(p => p.activo !== false && !p.seoTitle && !p.seoDescription);
    if (sinSEO.length) {
        tareas.push({
            icon: '🔎', urgencia: 2,
            titulo: `${sinSEO.length} producto${sinSEO.length > 1 ? 's' : ''} sin SEO configurado`,
            detalle: sinSEO.slice(0, 3).map(p => p.nombre).join(', ') + (sinSEO.length > 3 ? '…' : ''),
            accion: 'IA masiva', tab: 'herramientas', cls: 'b'
        });
    }

    // ── 13. Suscriptores push sin campaña reciente ────────────────────────────
    const subs = Number(localStorage.getItem('tm_subscriber_count') || 0);
    if (subs > 5) {
        const camps2 = (() => { try { return tmParseArray(localStorage.getItem('tm_campaigns_v1')); } catch(e) { return []; } })();
        const ultimaCamp = camps2.reduce((m, c) => Math.max(m, new Date(c.ts || 0).getTime()), 0);
        const diasSinCamp = Math.floor((Date.now() - ultimaCamp) / 86400000);
        if (diasSinCamp >= 3) {
            tareas.push({
                icon: '🔔', urgencia: 1,
                titulo: `${subs} suscriptores esperan noticias`,
                detalle: diasSinCamp > 365 ? 'Sin campaña enviada aún' : `Última campaña hace ${diasSinCamp} día${diasSinCamp !== 1 ? 's' : ''}`,
                accion: 'Crear campaña', tab: 'herramientas', cls: ''
            });
        }
    }

    // ── 14. Productos con cambios sin publicar ───────────────────────────────
    try {
        const mods = tmParseArray(localStorage.getItem('productosModificados'));
        if (mods.length) {
            tareas.push({
                icon: '🔄', urgencia: 3,
                titulo: `${mods.length} producto${mods.length > 1 ? 's' : ''} con cambios sin publicar`,
                detalle: 'Ejecuta "Actualizar tienda" para que los cambios sean visibles',
                accion: 'Publicar', tab: 'publicar-ahora', cls: ''
            });
        }
    } catch(e) {}

    // ── 15. Productos con precio 0 ───────────────────────────────────────────
    const sinPrecio = productos.filter(p => p.activo !== false && !Number(p.precioActual || 0));
    if (sinPrecio.length) {
        tareas.push({
            icon: '💲', urgencia: 2,
            titulo: `${sinPrecio.length} producto${sinPrecio.length > 1 ? 's' : ''} sin precio`,
            detalle: sinPrecio.slice(0, 3).map(p => p.nombre).join(', ') + (sinPrecio.length > 3 ? '…' : ''),
            accion: 'Completar', tab: 'manage-products', cls: 'b'
        });
    }

    // ── 16. Sin recomendaciones IA (solo si IA configurada) ──────────────────
    const iaKey = localStorage.getItem('anthropicApiKey');
    if (iaKey) {
        const sinRecs = productos.filter(p => p.activo !== false && (!Array.isArray(p.recomendados) || !p.recomendados.length));
        if (sinRecs.length > 3) {
            tareas.push({
                icon: '🧲', urgencia: 1,
                titulo: `${sinRecs.length} producto${sinRecs.length > 1 ? 's' : ''} sin recomendaciones IA`,
                detalle: 'Mejora el upsell y cross-sell con el recomendador IA masivo',
                accion: 'IA masiva', tab: 'herramientas', cls: 'b'
            });
        }
    }

    // ── 17. Sin plan semanal creado ──────────────────────────────────────────
    try {
        const plansTodos = tmParseArray(localStorage.getItem('tm_week_plan_v1'));
        if (!plansTodos.length && productos.length > 3) {
            tareas.push({
                icon: '🗓️', urgencia: 1,
                titulo: 'Sin plan semanal de publicaciones',
                detalle: 'El agente IA puede organizar tus publicaciones de lunes a domingo',
                accion: 'Crear plan', tab: 'herramientas', cls: ''
            });
        }
    } catch(e) {}

    // ── 18. IA no configurada (si hay suficientes productos) ─────────────────
    if (!localStorage.getItem('anthropicApiKey') && productos.length > 5) {
        tareas.push({
            icon: '🤖', urgencia: 1,
            titulo: 'IA no configurada',
            detalle: 'Configura OpenRouter/Gemini/Groq para SEO automático, campañas y recomendaciones',
            accion: 'Configurar', tab: 'configuracion', cls: 'ia'
        });
    }

    // ── Sin tareas → ocultar ─────────────────────────────────────────────────
    if (!tareas.length) {
        card.style.display = 'none';
        return;
    }

    // Ordenar por urgencia descendente
    tareas.sort((a, b) => b.urgencia - a.urgencia);

    const urgColor = u => u >= 3 ? '#e74c3c' : u === 2 ? '#FF6B35' : '#2AABEE';
    const totalCriticas = tareas.filter(t => t.urgencia >= 3).length;

    // Actualizar botón "Pendientes" del grid de acciones rápidas
    const btnPend = document.getElementById('tmBtnPendientes');
    if (btnPend) {
        btnPend.className = 'tm-qc pend' + (totalCriticas ? ' crit' : '');
        btnPend.innerHTML = `📋 Pendientes<span class="pend-n" style="background:${totalCriticas ? '#e74c3c' : '#FF6B35'}">${tareas.length}</span>`;
    }

    const hd = card.querySelector('.tmag-title');
    if (hd) hd.innerHTML = `📋 Tareas pendientes <span style="background:${totalCriticas ? '#e74c3c' : '#FF6B35'};color:#fff;border-radius:20px;padding:1px 8px;font-size:11px;margin-left:6px">${tareas.length}</span>`;

    lista.innerHTML = tareas.map(t => `
        <div class="tmag-item" style="border-left:3px solid ${urgColor(t.urgencia)}">
            <span class="tmag-icon">${t.icon}</span>
            <span class="tmag-txt"><b>${escapeHtml(t.titulo)}</b>${t.detalle ? `<span class="tmag-det">${escapeHtml(t.detalle)}</span>` : ''}</span>
            <button class="tmag-btn ${t.cls}" onclick="switchTab('${t.tab}');document.getElementById('tmAgenda').style.display='none'">${t.accion}</button>
        </div>`).join('');

    card.style.display = 'block';
}


function pubSwitchPanel(name) {
    document.querySelectorAll('.pub-panel').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.pub-nav-btn').forEach(function(b) { b.classList.remove('active'); });
    const panel = document.getElementById('pubPanel-' + name);
    const btn = document.querySelector('.pub-nav-btn[data-arg="' + name + '"]');
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    localStorage.setItem('tm_pub_subtab', name);
    if (name === 'publicar') {
        setTimeout(cargarGruposFB, 100);
        setTimeout(function() { if (typeof window.renderTabPublicar === 'function') window.renderTabPublicar(); }, 250);
    }
    if (name === 'oferta') {
        setTimeout(poblarSelectOfertaDia, 100);
        setTimeout(renderizarListaAgotados, 100);
    }
    if (name === 'promo') setTimeout(() => { if (typeof window.pubMountPromo === 'function') window.pubMountPromo(); }, 150);
}
window.pubSwitchPanel = pubSwitchPanel;

function switchTab(tabName) {
    // Redirects to unified Publicación tab
    if (tabName === 'publicar-ahora') { switchTab('publicacion'); setTimeout(() => pubSwitchPanel('publicar'), 50); return; }
    if (tabName === 'oferta-dia') { switchTab('publicacion'); setTimeout(() => pubSwitchPanel('oferta'), 50); return; }
    if (tabName === 'apariencia') { switchTab('publicacion'); setTimeout(() => pubSwitchPanel('banners'), 50); return; }

    // Remove active from all tabs (class only — never use inline style on admin-tabs)
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.removeProperty('display'); // Fix: clear any rogue inline display
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
    });

    // Tab-specific hooks consolidados
    if (tabName === 'publicacion') {
        const saved = localStorage.getItem('tm_pub_subtab') || 'publicar';
        setTimeout(() => pubSwitchPanel(saved), 50);
    }
    if (tabName === 'manage-products') setTimeout(actualizarListaProductos, 100);
    if (tabName === 'ventas') setTimeout(renderizarVentas, 100);
    if (tabName === 'analytics') setTimeout(() => { if (typeof renderizarAnalyticsFirebase === 'function') renderizarAnalyticsFirebase(); }, 150);
    if (tabName === 'manage-subcategories') {
        setTimeout(() => {
            if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
            if (typeof actualizarListaSubcategorias === 'function') actualizarListaSubcategorias();
        }, 50);
    }
    if (tabName === 'configuracion') {
        setTimeout(cargarNumeroWhatsApp, 100);
        setTimeout(cargarEnvioTexto, 100);
        setTimeout(cargarConfiguracionGitHub, 100);
    }
}

// ===== PRODUCTOS =====

// Sugiere specs con IA (usa la misma key/proveedor configurado en ⚙️ Configuración
// → API Key de IA, vía window.iaLlamarModelo expuesto por admin-copilot.js).
// Solo rellena el input — el admin revisa y edita antes de publicar, nunca se auto-aplica.
// ids: permite reusar la misma lógica en "Crear producto" (por defecto) y en
// "Editar producto" (pasando los IDs del form pedit-*).
async function sugerirSpecsConIA(ids) {
    ids = ids || {};
    const nombreId = ids.nombre || 'productName';
    const categoriaId = ids.categoria || 'productCategory';
    const descripcionId = ids.descripcion || 'productDescription';
    const specsId = ids.specs || 'productSpecs';
    const btnId = ids.btn || 'btnSugerirSpecs';

    const btn = document.getElementById(btnId);
    const nombre = (document.getElementById(nombreId).value || '').trim();
    if (!nombre) { mostrarNotificacion('Escribe el nombre del producto primero', 'error'); return; }
    if (typeof window.iaLlamarModelo !== 'function') {
        mostrarNotificacion('❌ Copiloto IA no cargó — recarga la página', 'error');
        return;
    }
    const key = (localStorage.getItem('anthropicApiKey') || '').trim();
    if (!key) { mostrarNotificacion('Configura tu API key en ⚙️ Configuración → API Key de IA', 'error'); return; }

    const categoria = (document.getElementById(categoriaId).value || '').trim();
    const descripcion = (document.getElementById(descripcionId).value || '').trim();

    if (btn) { btn.disabled = true; btn.textContent = '🤖 Generando…'; }
    try {
        const prompt = 'Producto para una tienda online cubana: "' + nombre + '"' +
            (categoria ? '. Categoría: ' + categoria : '') +
            (descripcion ? '. Descripción: ' + descripcion : '') +
            '. Dame hasta 6 especificaciones técnicas breves y realistas de este producto ' +
            '(ej: voltaje, potencia, capacidad, dimensiones, material, conectividad — lo que aplique según el tipo de producto). ' +
            'Responde SOLO con un array JSON de strings cortos, sin explicación, sin markdown. ' +
            'Ejemplo de formato: ["1800Mbps","Dual Band","4 antenas"]';
        const raw = await window.iaLlamarModelo(prompt);
        if (!raw) {
            const detalle = typeof window.iaUltimoError === 'function' ? window.iaUltimoError() : '';
            mostrarNotificacion('❌ La IA no respondió' + (detalle ? ': ' + detalle : ' — revisa tu API key o completa las specs a mano'), 'error');
            return;
        }
        let specs = [];
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) specs = parsed.map(s => String(s).trim()).filter(Boolean);
            } catch (e) { /* sigue al fallback de abajo */ }
        }
        if (specs.length === 0) {
            specs = raw.split(/[\n,]/)
                .map(s => s.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').replace(/^"+|"+$/g, '').trim())
                .filter(Boolean);
        }
        specs = specs.slice(0, 6);
        if (specs.length === 0) {
            mostrarNotificacion('❌ No se pudo interpretar la respuesta de la IA — completa las specs a mano', 'error');
            return;
        }
        const specsInput = document.getElementById(specsId);
        if (specsInput) specsInput.value = specs.join(', ');
        mostrarNotificacion('✅ Specs sugeridas — revísalas y editá si algo no aplica', 'success');
    } catch (e) {
        mostrarNotificacion('❌ Error generando specs: ' + (e.message || e), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 Sugerir con IA'; }
    }
}

// Analiza la foto principal recién elegida (todavía sin subir a GitHub) +
// nombre/categoría/precio ya escritos, y llena Descripción y Specs juntos
// en un solo llamado — mismo estilo "ficha de producto" que el copiloto.
async function analizarFotoYCompletar() {
    if (typeof window.iaLlamarModelo !== 'function') {
        mostrarNotificacion('❌ Copiloto IA no cargó — recarga la página', 'error');
        return;
    }
    const key = (localStorage.getItem('anthropicApiKey') || '').trim();
    if (!key) { mostrarNotificacion('Configura tu API key en ⚙️ Configuración → API Key de IA', 'error'); return; }
    const nombre = (document.getElementById('productName').value || '').trim();
    if (!nombre) { mostrarNotificacion('Escribe el nombre del producto primero', 'error'); return; }
    const categoria = (document.getElementById('productCategory').value || '').trim();
    const precio = (document.getElementById('productPriceActual').value || '').trim();
    const garantia = (document.getElementById('productGarantia').value || '').trim();
    const fileInput = document.getElementById('productImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    const btn = document.getElementById('btnAnalizarFoto');
    if (btn) { btn.disabled = true; btn.textContent = '🤖 Analizando…'; }
    try {
        let imagen = null;
        if (file) {
            imagen = await new Promise((res, rej) => {
                const rd = new FileReader();
                rd.onload = () => res({ mime: file.type || 'image/jpeg', data: String(rd.result).split(',')[1] || '' });
                rd.onerror = rej;
                rd.readAsDataURL(file);
            });
        }
        const datos = 'Producto: "' + nombre + '".' + (categoria ? ' Categoría: ' + categoria + '.' : '') + (precio ? ' Precio: $' + Number(precio).toFixed(2) + ' USD.' : '') + (garantia ? ' Garantía: ' + garantia + '.' : '');
        const foto = imagen ? ' Mira la foto adjunta: fíjate en marca, modelo y detalles visibles reales (texto del empaque, puertos, diseño) y úsalos si aportan algo verídico.' : '';
        const prompt = 'Analiza este producto de una tienda online cubana (entrega en Cuba, pedido por WhatsApp) y devuelve SOLO un JSON, sin markdown ni texto fuera del JSON, con este formato exacto: {"descripcion":"...","specs":["...","..."]}. '
            + '"descripcion" estilo ficha de producto: primera oración = qué es y su beneficio principal, luego 3 a 5 oraciones cortas de un solo punto de valor real cada una, sin viñetas ni emojis ni markdown, separadas por punto y espacio normal, 220 a 400 caracteres en total. '
            + '"specs": hasta 6 especificaciones técnicas reales y breves (voltaje, potencia, capacidad, dimensiones, conectividad — lo que aplique), strings cortos. '
            + datos + foto
            + ' Usa SOLO datos reales dados arriba o realmente visibles en la foto — nunca inventes specs, materiales ni compatibilidades que no puedas verificar.';
        const raw = await window.iaLlamarModelo(prompt, imagen);
        if (!raw) {
            const detalle = typeof window.iaUltimoError === 'function' ? window.iaUltimoError() : '';
            mostrarNotificacion('❌ La IA no respondió' + (detalle ? ': ' + detalle : ' — revisa tu API key'), 'error');
            return;
        }
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) { mostrarNotificacion('❌ No se pudo interpretar la respuesta de la IA', 'error'); return; }
        let j;
        try { j = JSON.parse(m[0]); } catch (e) { mostrarNotificacion('❌ No se pudo interpretar la respuesta de la IA', 'error'); return; }
        const descripcion = String(j.descripcion || '').trim();
        const specs = Array.isArray(j.specs) ? j.specs.map(s => String(s).trim()).filter(Boolean).slice(0, 6) : [];
        if (descripcion) document.getElementById('productDescription').value = descripcion;
        if (specs.length) document.getElementById('productSpecs').value = specs.join(', ');
        if (!descripcion && !specs.length) { mostrarNotificacion('❌ La IA no devolvió datos usables — completa a mano', 'error'); return; }
        mostrarNotificacion('✅ Descripción y specs completadas — revísalas antes de guardar', 'success');
    } catch (e) {
        mostrarNotificacion('❌ Error analizando: ' + (e.message || e), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 Analizar foto y completar'; }
    }
}
window.analizarFotoYCompletar = analizarFotoYCompletar;

async function agregarProductoForm(event) {
    event.preventDefault();
    const fileInput = document.getElementById('productImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!file) { mostrarNotificacion('Por favor selecciona una imagen principal', 'error'); return; }

    // Aviso de nombre duplicado (antes de subir la imagen, para no malgastarla).
    // Evita que dos equipos distintos queden con el mismo nombre y se confundan.
    const _nombreNuevo = (document.getElementById('productName').value || '').trim();
    const _norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const _dup = (Array.isArray(productos) ? productos : []).find(p => _norm(p.nombre) === _norm(_nombreNuevo));
    if (_dup) {
        const ok = confirm(
            '⚠️ Ya existe un producto llamado:\n\n"' + _dup.nombre + '"  ($' + (_dup.precioActual || 0) + ' USD)\n\n' +
            'Si es un equipo DISTINTO, ponle un nombre más específico (marca/modelo) ' +
            'para no confundirlos en la tienda.\n\n¿Agregarlo de todos modos?'
        );
        if (!ok) { mostrarNotificacion('Cancelado — ponle un nombre distinto para diferenciarlo', 'info'); return; }
    }

    const submitBtn = event.target ? event.target.querySelector('button[type="submit"]') : null;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Guardando…'; }

    try {
        // Validar todo lo que no depende de la imagen ANTES de subirla a GitHub,
        // para no dejar imágenes huérfanas si el resto del form es inválido.
        const _preview = {
            nombre: (document.getElementById('productName').value || '').trim(),
            descripcion: (document.getElementById('productDescription').value || '').trim(),
            imagen: 'placeholder',
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            stock: parseInt(document.getElementById('productStock').value, 10),
            categoria: document.getElementById('productCategory').value
        };
        const erroresPrevios = validarProducto(_preview).filter(e => e !== 'La imagen es requerida');
        if (erroresPrevios.length > 0) {
            mostrarNotificacion('❌ ' + erroresPrevios[0], 'error');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💾 Guardar y publicar producto'; }
            return;
        }

        mostrarNotificacion('⏳ Subiendo imagen principal...', 'info');
        const imagenPrincipal = await subirImagenAGitHub(file);
        const extras = await subirMultiplesImagenes('productImagesExtra');
        const imagenes = _tmDedupImagenes([imagenPrincipal, ...extras]);

        // Los caracteres de ancho cero (U+200B y compañía) entran al pegar texto
        // desde WhatsApp o desde una web y son invisibles: rompen las búsquedas,
        // el orden alfabético y los slugs sin que se note. Se quitan aquí, al
        // crear el producto, para no tener que limpiar el catálogo cada vez.
        const _sinInvisibles = t => String(t == null ? '' : t).replace(/[\u200b\u200c\u200d\u2060\ufeff\u180e]/g, '').trim();

        const masVendidoVal = document.getElementById('productMasVendido');
        const producto = {
            id: Date.now(),
            nombre: _sinInvisibles(document.getElementById('productName').value),
            descripcion: _sinInvisibles(document.getElementById('productDescription').value),
            imagen: imagenPrincipal,
            imagenes: imagenes,
            precioActual: parseFloat(document.getElementById('productPriceActual').value) || 0,
            precioOriginal: parseFloat(document.getElementById('productPrecioOriginal')?.value) || 0,
            descuento: 0,
            stock: parseInt(document.getElementById('productStock').value) || 0,
            comision: parseFloat(document.getElementById('productComision')?.value) || 0,
            comisionMoneda: document.getElementById('productComisionMoneda')?.value || 'USD',
            categoria: document.getElementById('productCategory').value,
            subcategoria: (document.getElementById('productSubcategory') && document.getElementById('productSubcategory').value) ? document.getElementById('productSubcategory').value : '',
            masVendido: masVendidoVal ? masVendidoVal.value === 'true' : false,
            usado: document.getElementById('productUsado').checked,
            garantia: _sinInvisibles(document.getElementById('productGarantia').value),
            devolucion: document.getElementById('productDevolucion') ? document.getElementById('productDevolucion').checked : false,
            specs: (() => {
                const raw = (document.getElementById('productSpecs')?.value || '').trim();
                if (!raw) return [];
                return raw.split(',').map(s => _sinInvisibles(s)).filter(Boolean).slice(0, 6);
            })(),
            fechaAgregado: new Date().toISOString()
        };

        const errores = validarProducto(producto);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos.push(producto);
        guardarProductos();
        marcarProductoModificado(producto.id);
        sincronizarConGitHub();
        limpiarFormularioProducto();
        mostrarNotificacion('✅ ¡Producto agregado exitosamente!');
        if (window.TiendaMaxPush) {
            window.TiendaMaxPush.nuevoProducto(producto.nombre, producto.precioActual, producto.id, producto.imagen);
        }
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        verificarOfertasYMostrarBanner();
    } catch (e) {
        console.error('Error subiendo imágenes:', e);
        mostrarNotificacion('❌ Error subiendo imágenes: ' + (e.message || e), 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💾 Guardar producto'; }
    }
}

// Deja el formulario de "Agregar producto" como recién abierto. Se usa al
// guardar bien y también desde el botón "Limpiar": si el guardado falla a
// medias (por ejemplo por la cuota del navegador), antes no había forma de
// vaciarlo salvo recargar la página.
function limpiarFormularioProducto(avisar) {
    const form = document.getElementById('productForm');
    if (form) form.reset();
    const _mon = document.getElementById('productComisionMoneda');
    if (_mon) _mon.value = 'USD';
    const _tog = document.getElementById('tmMonedaToggle1');
    if (_tog) _tog.querySelectorAll('.tm-moneda-btn').forEach(b => b.classList.toggle('active', b.dataset.moneda === 'USD'));
    // form.reset() vacía los <input type="file"> pero deja el label con el
    // nombre del archivo anterior y la clase has-file puesta.
    if (typeof fileName === 'function') {
        const _pi = document.getElementById('productImage');
        const _pe = document.getElementById('productImagesExtra');
        if (_pi) fileName(_pi, 'productImage-name', 'Elegir foto principal *');
        if (_pe) fileName(_pe, 'productImagesExtra-name', 'Fotos extra (opcional)');
    }
    // La subcategoría se repuebla según la categoría; el reset del form deja
    // el <select> con las opciones de la categoría anterior.
    if (typeof agregarFillSubcats === 'function') {
        try { agregarFillSubcats(); } catch (e) {}
    }
    const btn = document.querySelector('#productForm button[type="submit"]');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar y publicar producto'; }
    // showToast vive dentro del IIFE de admin.html y no está en window; el
    // aviso se da con mostrarNotificacion, que sí es global (lo comprueba
    // tests/test_admin_handlers.py).
    if (typeof borrarBorradorProducto === 'function') borrarBorradorProducto();
    if (typeof tmActualizarPendientes === 'function') tmActualizarPendientes();
    if (avisar && typeof mostrarNotificacion === 'function') {
        mostrarNotificacion('🧹 Formulario vacío, listo para el siguiente producto');
    }
}

// Claves de localStorage que son CACHÉ o historial: se pueden tirar sin
// perder nada real. El catálogo de verdad vive en productos.json (GitHub) y
// los datos dinámicos en Firebase; localStorage aquí solo acelera el arranque.
const _TM_CACHE_DESECHABLE = [
    // El primero es el que más pesa con diferencia: son copias enteras del
    // catálogo para el rollback de Herramientas.
    'tm_product_snapshots_v1',
    'tm_post_log', 'tmPubHist', 'tm_trend_snaps', 'tm_ia_undo',
    'tm_ia_regen_queue', 'tm_ia_descartes', 'tm_reporte_visto',
    'tm_push_sent', 'resenas_cache', 'tm_analytics_cache'
];

function _tmEspacioUsado() {
    let n = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            n += k.length + (localStorage.getItem(k) || '').length;
        }
    } catch (e) {}
    return n;
}

// Devuelve las claves más pesadas, para poder decirle al admin QUÉ ocupa
// espacio en vez de dejarlo con un error de cuota sin contexto.
function tmDiagnosticoAlmacenamiento() {
    const filas = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            filas.push({ clave: k, kb: Math.round((localStorage.getItem(k) || '').length / 1024 * 10) / 10 });
        }
    } catch (e) {}
    filas.sort((a, b) => b.kb - a.kb);
    return { totalKB: Math.round(_tmEspacioUsado() / 1024), top: filas.slice(0, 12) };
}

// Guarda el catálogo en localStorage tolerando que la cuota esté llena.
// IMPORTANTE: esto es solo la caché local. Si falla, el producto igual se
// publica en GitHub, que es la fuente real — por eso NO se relanza el error:
// antes cortaba el guardado a medias y el producto quedaba en memoria, sin
// publicar y con el formulario lleno, mientras el mensaje culpaba a las fotos.
function guardarProductos() {
    const datos = JSON.stringify(productos);
    setTimeout(() => {
        if (typeof tmActualizarPendientes === 'function') tmActualizarPendientes();
        if (typeof tmAvisarEspacio === 'function') tmAvisarEspacio();
    }, 0);
    try {
        localStorage.setItem('productos', datos);
        return true;
    } catch (e) {
        // Segundo intento: liberar cachés e historiales y reintentar.
        let liberado = 0;
        _TM_CACHE_DESECHABLE.forEach(k => {
            try {
                const v = localStorage.getItem(k);
                if (v) { liberado += v.length; localStorage.removeItem(k); }
            } catch (e2) {}
        });
        try {
            localStorage.setItem('productos', datos);
            if (liberado > 0 && typeof mostrarNotificacion === 'function') {
                mostrarNotificacion('🧹 Se liberó espacio borrando historiales viejos (' +
                    Math.round(liberado / 1024) + ' KB). Nada importante se perdió.', 'info');
            }
            return true;
        } catch (e3) {
            const diag = tmDiagnosticoAlmacenamiento();
            const masGrande = diag.top[0] ? (diag.top[0].clave + ' ' + diag.top[0].kb + ' KB') : '';
            console.warn('[guardarProductos] cuota llena', diag);
            if (typeof mostrarNotificacion === 'function') {
                mostrarNotificacion('⚠️ El navegador no tiene espacio para la copia local (' +
                    diag.totalKB + ' KB usados' + (masGrande ? ', lo mayor: ' + masGrande : '') +
                    '). El producto SÍ se publica en GitHub; solo se pierde la copia rápida de este navegador.', 'error');
            }
            return false;
        }
    }
}


// ── Panel "Espacio del navegador" (Configuración) ────────────────────
// El error "Setting the value of 'productos' exceeded the quota" no decía
// QUÉ estaba ocupando el espacio ni cómo arreglarlo. Esto lo muestra y da
// un botón para vaciar lo desechable.
function tmMostrarEspacio() {
    const cont = document.getElementById('tm-espacio-info');
    if (!cont) return;
    const d = tmDiagnosticoAlmacenamiento();
    // El límite típico es ~5 MB por sitio; sirve de referencia, no es exacto.
    const pct = Math.min(100, Math.round(d.totalKB / 5120 * 100));
    const color = pct >= 85 ? '#e74c3c' : (pct >= 60 ? '#f5a623' : '#1DA854');
    const filas = d.top.map(f => {
        const desechable = _TM_CACHE_DESECHABLE.indexOf(f.clave) !== -1;
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.15)">' +
            '<span>' + escapeHtml(f.clave) + (desechable ? ' <span style="opacity:.6">· historial</span>' : '') + '</span>' +
            '<b style="white-space:nowrap">' + f.kb + ' KB</b></div>';
    }).join('');
    cont.innerHTML =
        '<div style="margin-bottom:10px"><b style="color:' + color + '">' + d.totalKB + ' KB</b> usados de ~5120 KB (' + pct + '%)</div>' +
        '<div style="height:8px;border-radius:99px;background:rgba(128,128,128,.2);overflow:hidden;margin-bottom:12px">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + '"></div></div>' + filas;
}

function tmLiberarEspacio() {
    let liberado = 0;
    _TM_CACHE_DESECHABLE.forEach(k => {
        try {
            const v = localStorage.getItem(k);
            if (v) { liberado += v.length + k.length; localStorage.removeItem(k); }
        } catch (e) {}
    });
    tmMostrarEspacio();
    const kb = Math.round(liberado / 1024);
    if (typeof mostrarNotificacion === 'function') {
        mostrarNotificacion(kb > 0
            ? '🧹 Liberados ' + kb + ' KB de historiales. El catálogo y la configuración siguen intactos.'
            : 'ℹ️ No había historiales que borrar. Si sigue lleno, lo que ocupa es el catálogo: revisa la lista de arriba.',
            kb > 0 ? 'success' : 'info');
    }
}

// ═══════════════════════════════════════════════════════════════
//  BORRADOR DEL FORMULARIO "AGREGAR PRODUCTO"
//  Si el guardado falla, se cierra la pestaña o se va la corriente, todo lo
//  escrito se perdía. Se guarda mientras escribes y al volver se ofrece
//  recuperarlo. Las fotos NO se guardan (el navegador no deja conservar un
//  <input type=file>, y meterlas en base64 es justo lo que llenaba la cuota).
// ═══════════════════════════════════════════════════════════════
const TM_BORRADOR_KEY = 'tm_borrador_producto_v1';
const _TM_BORRADOR_CAMPOS = [
    'productName', 'productDescription', 'productPriceActual', 'productPrecioOriginal',
    'productStock', 'productComision', 'productComisionMoneda', 'productCategory',
    'productSubcategory', 'productGarantia', 'productSpecs', 'productMasVendido'
];
let _tmBorradorTimer = null;

function _tmLeerCampos() {
    const d = {};
    _TM_BORRADOR_CAMPOS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        d[id] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    const usado = document.getElementById('productUsado');
    if (usado) d.productUsado = usado.checked;
    const dev = document.getElementById('productDevolucion');
    if (dev) d.productDevolucion = dev.checked;
    return d;
}

function _tmHayAlgoEscrito(d) {
    return !!((d.productName || '').trim() || (d.productDescription || '').trim() ||
              (d.productSpecs || '').trim() || (d.productGarantia || '').trim());
}

function guardarBorradorProducto() {
    const d = _tmLeerCampos();
    if (!_tmHayAlgoEscrito(d)) { borrarBorradorProducto(); return; }
    d._ts = Date.now();
    try { localStorage.setItem(TM_BORRADOR_KEY, JSON.stringify(d)); }
    catch (e) { /* sin espacio: el borrador es lo primero que se sacrifica */ }
}

function borrarBorradorProducto() {
    try { localStorage.removeItem(TM_BORRADOR_KEY); } catch (e) {}
    const aviso = document.getElementById('tmBorradorAviso');
    if (aviso) aviso.remove();
}

function restaurarBorradorProducto() {
    const d = tmParse(localStorage.getItem(TM_BORRADOR_KEY), null);
    if (!d) return;
    Object.keys(d).forEach(id => {
        if (id === '_ts') return;
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!d[id]; else el.value = d[id];
    });
    if (typeof agregarFillSubcats === 'function') {
        try { agregarFillSubcats(); const sub = document.getElementById('productSubcategory');
              if (sub && d.productSubcategory) sub.value = d.productSubcategory; } catch (e) {}
    }
    borrarBorradorProducto();
    if (typeof mostrarNotificacion === 'function') {
        mostrarNotificacion('📄 Borrador recuperado. Vuelve a elegir las fotos: el navegador no las puede guardar.');
    }
}

// Aviso discreto arriba del formulario cuando hay algo guardado de antes.
function _tmMostrarAvisoBorrador() {
    const form = document.getElementById('productForm');
    if (!form || document.getElementById('tmBorradorAviso')) return;
    const d = tmParse(localStorage.getItem(TM_BORRADOR_KEY), null);
    if (!d || !_tmHayAlgoEscrito(d)) return;
    const cuando = d._ts ? new Date(d._ts).toLocaleString() : '';
    const nombre = (d.productName || '').trim().slice(0, 40) || 'un producto sin nombre';
    const box = document.createElement('div');
    box.id = 'tmBorradorAviso';
    box.style.cssText = 'margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,106,31,.35);background:rgba(255,106,31,.08);border-radius:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px';
    box.innerHTML = '<span style="flex:1;min-width:180px">📄 Tienes un borrador sin guardar: <b>' +
        escapeHtml(nombre) + '</b>' + (cuando ? ' <span style="opacity:.7">(' + escapeHtml(cuando) + ')</span>' : '') + '</span>';
    const bSi = document.createElement('button');
    bSi.type = 'button'; bSi.className = 'btn btn-primary'; bSi.style.cssText = 'padding:7px 14px;font-size:12.5px';
    bSi.textContent = 'Recuperar';
    bSi.onclick = restaurarBorradorProducto;
    const bNo = document.createElement('button');
    bNo.type = 'button'; bNo.className = 'btn btn-ghost'; bNo.style.cssText = 'padding:7px 14px;font-size:12.5px';
    bNo.textContent = 'Descartar';
    bNo.onclick = borrarBorradorProducto;
    box.append(bSi, bNo);
    form.parentNode.insertBefore(box, form);
}

function initBorradorProducto() {
    const form = document.getElementById('productForm');
    if (!form || form._tmBorrador) return;
    form._tmBorrador = true;
    form.addEventListener('input', () => {
        clearTimeout(_tmBorradorTimer);
        _tmBorradorTimer = setTimeout(guardarBorradorProducto, 700);
    });
    form.addEventListener('change', () => {
        clearTimeout(_tmBorradorTimer);
        _tmBorradorTimer = setTimeout(guardarBorradorProducto, 300);
    });
    _tmMostrarAvisoBorrador();
}

// ── Probar el token de GitHub sin esperar a que falle una subida ──────
async function tmProbarToken() {
    const est = document.getElementById('tmTokenStatus');
    const pon = (txt, color) => { if (est) { est.textContent = txt; est.style.color = color || ''; } };
    const user  = (document.getElementById('githubUser')  || {}).value || localStorage.getItem('githubUser');
    const repo  = (document.getElementById('githubRepo')  || {}).value || localStorage.getItem('githubRepo');
    const token = (document.getElementById('githubToken') || {}).value || localStorage.getItem('githubToken');
    if (!user || !repo || !token) { pon('⚠️ Completa usuario, repositorio y token.', '#f5a623'); return; }
    pon('⏳ Probando…');
    try {
        const res = await fetch('https://api.github.com/repos/' + user + '/' + repo, {
            headers: { 'Authorization': 'token ' + token }
        });
        if (res.ok) {
            const j = await res.json();
            const puedeEscribir = j.permissions && j.permissions.push;
            if (puedeEscribir) pon('✅ Token válido y con permiso de escritura en ' + user + '/' + repo + '.', '#1DA854');
            else pon('⚠️ El token entra al repo pero NO puede escribir. Necesita permiso de escritura en "Contents".', '#f5a623');
        } else if (res.status === 401) {
            pon('❌ Token inválido o vencido. Genera uno nuevo en GitHub.', '#e74c3c');
        } else if (res.status === 404) {
            pon('❌ No se encontró ' + user + '/' + repo + '. Revisa el usuario y el nombre del repo (o el token no ve ese repo).', '#e74c3c');
        } else {
            pon('❌ GitHub respondió HTTP ' + res.status + '.', '#e74c3c');
        }
    } catch (e) {
        pon('❌ Sin conexión con GitHub. Revisa internet.', '#e74c3c');
    }
}

// ── Indicador de cambios sin publicar ────────────────────────────────
// productosModificados ya existía por dentro, pero nada avisaba de que
// había ediciones sin subir; es fácil cambiar precios y olvidarse.
function tmActualizarPendientes() {
    const n = (typeof obtenerProductosModificados === 'function')
        ? (obtenerProductosModificados() || []).length : 0;
    let chip = document.getElementById('tmPendientesChip');
    if (n === 0) { if (chip) chip.remove(); return; }
    if (!chip) {
        chip = document.createElement('button');
        chip.id = 'tmPendientesChip';
        chip.type = 'button';
        chip.style.cssText = 'position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:9998;' +
            'padding:10px 15px;border-radius:999px;border:1px solid rgba(255,106,31,.5);background:rgba(255,106,31,.95);' +
            'color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;box-shadow:0 10px 26px -12px rgba(0,0,0,.7)';
        chip.onclick = () => { if (typeof sincronizarTodoConGitHub === 'function') sincronizarTodoConGitHub(); };
        document.body.appendChild(chip);
    }
    chip.textContent = '⬆️ ' + n + ' cambio' + (n !== 1 ? 's' : '') + ' sin publicar';
    chip.title = 'Pulsa para actualizar la tienda';
}

// ── Aviso de espacio antes de que reviente ───────────────────────────
function tmAvisarEspacio() {
    const d = tmDiagnosticoAlmacenamiento();
    const pct = Math.round(d.totalKB / 5120 * 100);
    if (pct < 80) return;
    if (sessionStorage.getItem('tm_aviso_espacio')) return;   // una vez por sesión
    try { sessionStorage.setItem('tm_aviso_espacio', '1'); } catch (e) {}
    if (typeof mostrarNotificacion === 'function') {
        mostrarNotificacion('⚠️ El navegador va al ' + pct + '% de su espacio (' + d.totalKB +
            ' KB). Ve a Configuración → Espacio del navegador y pulsa "Liberar espacio" antes de que empiece a fallar el guardado.', 'error');
    }
}
