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

async function verificarPassword(event) {
    event.preventDefault();

    const rl = tmParse(localStorage.getItem('admin_rl'), '{"count":0,"until":0}');
    if (Date.now() < rl.until) {
        const mins = Math.ceil((rl.until - Date.now()) / 60000);
        mostrarNotificacion(`🔒 Demasiados intentos. Espera ${mins} min.`, 'error');
        return;
    }

    const passwordInput = document.getElementById('adminPassword').value.trim();

    // Feedback visual mientras se calcula el hash (PBKDF2 tarda 2-3 s)
    const btn = document.getElementById('btnLoginSubmit');
    const txtOriginal = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Verificando…'; }
    if (!passwordInput) {
        mostrarNotificacion('❌ Escribe la contraseña', 'error');
        if (btn) { btn.disabled = false; btn.textContent = txtOriginal; }
        return;
    }

    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');

    try {

    // 1. PRIORIDAD: localStorage (refleja cambios inmediatos de contraseña)
    const lsHash = localStorage.getItem(AUTH_HASH_KEY);
    const lsSalt = localStorage.getItem(AUTH_SALT_KEY);
    if (lsHash && lsSalt) {
        const inputHash = await hashPassword(passwordInput, lsSalt);
        if (inputHash === lsHash) {
            localStorage.removeItem('admin_rl');
            usuarioAutenticado = true;
            cerrarLoginModal();
            abrirAdminPanel();
            _checkPasswordSync();
            return;
        }
    }

    // 2. Firebase RTDB (cloud-synced — disponible en cualquier dispositivo sin token GitHub)
    let fbHash = null, fbSalt = null;
    try {
        const fbCfg = await _fbEnsureConfig();
        if (fbCfg) {
            const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
            const _fbCtrl = new AbortController();
            const _fbTid = setTimeout(() => _fbCtrl.abort(), 6000);
            const fbRes = await fetch(rtdbUrl + '/admin_auth.json?_=' + Date.now(), { signal: _fbCtrl.signal });
            clearTimeout(_fbTid);
            if (fbRes.ok) {
                const fbAuth = await fbRes.json();
                if (fbAuth && fbAuth.hash && fbAuth.salt) { fbHash = fbAuth.hash; fbSalt = fbAuth.salt; }
            }
        }
    } catch(e) {}
    if (fbHash && fbSalt) {
        const inputHash = await hashPassword(passwordInput, fbSalt);
        if (inputHash === fbHash) {
            localStorage.removeItem('admin_rl');
            try { localStorage.setItem(AUTH_SALT_KEY, fbSalt); } catch(e) {}
            try { localStorage.setItem(AUTH_HASH_KEY, fbHash); } catch(e) {}
            usuarioAutenticado = true;
            cerrarLoginModal();
            abrirAdminPanel();
            _checkPasswordSync();
            return;
        }
    }

    // 3. FALLBACK: .admin-auth.json en GitHub (solo si localStorage vacío o no coincide)
    let ghHash = null, ghSalt = null;
    if (ghUser && ghRepo) {
        try {
            const _ctrl = new AbortController();
            const _tid = setTimeout(() => _ctrl.abort(), 8000);
            const cfgRes = await fetch(`https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/.admin-auth.json?_=${Date.now()}`, { signal: _ctrl.signal });
            clearTimeout(_tid);
            if (cfgRes.ok) {
                const cfg = await cfgRes.json();
                if (cfg.hash && cfg.salt) { ghHash = cfg.hash; ghSalt = cfg.salt; }
            }
        } catch(e) {}
    }
    if (ghHash && ghSalt) {
        const inputHash = await hashPassword(passwordInput, ghSalt);
        if (inputHash === ghHash) {
            localStorage.removeItem('admin_rl');
            // Sincronizar al localStorage para que próximos logins sean offline
            try { localStorage.setItem(AUTH_SALT_KEY, ghSalt); } catch(e) {}
            try { localStorage.setItem(AUTH_HASH_KEY, ghHash); } catch(e) {}
            usuarioAutenticado = true;
            cerrarLoginModal();
            abrirAdminPanel();
            return;
        }
    }

    // 3. Todo falló
    if (btn) { btn.disabled = false; btn.textContent = txtOriginal; }
    const newCount = (rl.count || 0) + 1;
    const lockout = newCount >= 3 ? Date.now() + LOCKOUT_DURATION_MS : rl.until;
    localStorage.setItem('admin_rl', JSON.stringify({ count: newCount, until: lockout }));
    const msg = newCount >= 3
        ? '🔒 3 intentos fallidos. Bloqueado 5 min.'
        : `❌ Contraseña incorrecta (intento ${newCount}/3)`;
    mostrarNotificacion(msg, 'error');
    document.getElementById('adminPassword').value = '';

    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = txtOriginal; }
        mostrarNotificacion('❌ Error al verificar contraseña. Recarga la página.', 'error');
    }
}

// Cambiar contraseña (llamado desde admin.html)
async function cambiarPasswordAdmin(ci, ni, coi) {
    if (!ci || !ni || !coi) {
        mostrarNotificacion('❌ Completa todos los campos', 'error');
        return;
    }

    // Detectar sal vigente: Firebase → GitHub → localStorage
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    let ch = null, cs = null;
    // Firebase RTDB (fuente más confiable entre dispositivos)
    try {
        const fbCfg = await _fbEnsureConfig();
        if (fbCfg) {
            const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
            const r = await fetch(rtdbUrl + '/admin_auth.json?_=' + Date.now());
            if (r.ok) {
                const fbAuth = await r.json();
                if (fbAuth && fbAuth.hash && fbAuth.salt) { ch = fbAuth.hash; cs = fbAuth.salt; }
            }
        }
    } catch(e) {}
    // GitHub fallback
    if (!ch || !cs) {
        if (ghUser && ghRepo) {
            try {
                const r = await fetch(`https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/.admin-auth.json?_=${Date.now()}`);
                if (r.ok) {
                    const cfg = await r.json();
                    if (cfg.hash && cfg.salt) { ch = cfg.hash; cs = cfg.salt; }
                }
            } catch(e) {}
        }
    }
    if (!ch || !cs) {
        ch = localStorage.getItem(AUTH_HASH_KEY);
        cs = localStorage.getItem(AUTH_SALT_KEY);
    }
    if (!ch || !cs) {
        mostrarNotificacion('❌ No hay contraseña configurada. Accede primero o configura GitHub.', 'error');
        return;
    }

    const ch2 = await hashPassword(ci, cs);
    if (ch2 !== ch) { mostrarNotificacion('❌ Contraseña actual incorrecta', 'error'); return; }
    if (ni.length < 4) { mostrarNotificacion('❌ La nueva contraseña debe tener al menos 4 caracteres', 'error'); return; }
    if (ni !== coi) { mostrarNotificacion('❌ Las contraseñas nuevas no coinciden', 'error'); return; }

    const ns = _generarSal();
    const nh = await hashPassword(ni, ns);
    try { localStorage.setItem(AUTH_SALT_KEY, ns); } catch(e) {}
    try { localStorage.setItem(AUTH_HASH_KEY, nh); } catch(e) {}

    // Subir a GitHub — obtener SHA actual antes del PUT para no fallar en updates
    if (ghUser && ghRepo) {
        const ghToken = localStorage.getItem('githubToken');
        if (!ghToken) {
            mostrarNotificacion('✅ Contraseña cambiada. Para que persista en todos los dispositivos, configura el Token de GitHub en Configuración.', 'warning');
        } else {
            try {
                const authData = { hash: nh, salt: ns, iterations: AUTH_ITERATIONS };
                const jsonStr = JSON.stringify(authData);
                const content = btoa(Array.from(new TextEncoder().encode(jsonStr), b => String.fromCharCode(b)).join(''));
                // Obtener SHA del archivo actual (necesario si ya existe)
                let fileSha = null;
                try {
                    const getRes = await fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/contents/.admin-auth.json`, {
                        headers: { 'Authorization': `token ${ghToken}` }
                    });
                    if (getRes.ok) {
                        const getJson = await getRes.json();
                        fileSha = getJson.sha || null;
                    }
                } catch(e2) {}
                const putBody = { message: 'Actualizar contraseña admin', content };
                if (fileSha) putBody.sha = fileSha;
                const ghRes = await fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/contents/.admin-auth.json`, {
                    method: 'PUT',
                    headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(putBody)
                });
                if (!ghRes.ok) {
                    const err = await ghRes.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${ghRes.status}`);
                }
            } catch(e) {
                mostrarNotificacion(`⚠️ No se pudo subir a GitHub: ${e.message}`, 'error');
            }
        }
    }
    mostrarNotificacion('✅ Contraseña cambiada con éxito', 'success');
    document.getElementById('ci').value = '';
    document.getElementById('ni').value = '';
    document.getElementById('coi').value = '';
    // Sincronizar automáticamente con Firebase y GitHub tras cambiar contraseña
    setTimeout(sincronizarPasswordAFirebase, 300);
    setTimeout(sincronizarPasswordAGitHub, 600);
}

// Sincroniza el hash LOCAL → Firebase RTDB (accesible desde cualquier dispositivo)
async function sincronizarPasswordAFirebase() {
    const localHash = localStorage.getItem(AUTH_HASH_KEY);
    const localSalt = localStorage.getItem(AUTH_SALT_KEY);
    if (!localHash || !localSalt) {
        mostrarNotificacion('❌ No hay contraseña guardada en este dispositivo', 'error');
        return;
    }
    const fbCfg = await _fbEnsureConfig();
    if (!fbCfg) {
        mostrarNotificacion('❌ Firebase no configurado. Guarda tu firebaseConfig primero.', 'error');
        return;
    }
    const rtdbUrl = fbCfg.databaseURL || ('https://' + fbCfg.projectId + '-default-rtdb.firebaseio.com');
    try {
        // Leer hash actual para incluirlo como proof (regla Firebase requiere proof == hash existente)
        let currentHash = null;
        try {
            const r = await fetch(rtdbUrl + '/admin_auth.json?_=' + Date.now());
            if (r.ok) { const d = await r.json(); if (d && d.hash) currentHash = d.hash; }
        } catch(_) {}
        const body = { hash: localHash, salt: localSalt, iterations: AUTH_ITERATIONS };
        if (currentHash) body.proof = currentHash;
        const res = await fetch(rtdbUrl + '/admin_auth.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mostrarNotificacion('✅ Contraseña sincronizada con Firebase. Puedes acceder desde cualquier dispositivo.', 'success');
    } catch(e) {
        mostrarNotificacion(`❌ Error al sincronizar con Firebase: ${e.message}`, 'error');
    }
}

// Sincroniza el hash LOCAL → GitHub (recuperación si se borran datos del navegador)
async function sincronizarPasswordAGitHub() {
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    const ghToken = localStorage.getItem('githubToken');
    if (!ghToken) {
        mostrarNotificacion('❌ Configura el Token de GitHub en Configuración → GitHub / Firebase para proteger tu contraseña', 'error');
        return;
    }
    const localHash = localStorage.getItem(AUTH_HASH_KEY);
    const localSalt = localStorage.getItem(AUTH_SALT_KEY);
    if (!localHash || !localSalt) {
        mostrarNotificacion('❌ No hay contraseña guardada en este dispositivo', 'error');
        return;
    }
    try {
        const authData = { hash: localHash, salt: localSalt, iterations: AUTH_ITERATIONS };
        const jsonStr = JSON.stringify(authData, null, 2);
        const content = btoa(Array.from(new TextEncoder().encode(jsonStr), b => String.fromCharCode(b)).join(''));
        let fileSha = null;
        try {
            const getRes = await fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/contents/.admin-auth.json`, {
                headers: { 'Authorization': `token ${ghToken}` }
            });
            if (getRes.ok) fileSha = (await getRes.json()).sha || null;
        } catch(e2) {}
        const putBody = { message: 'Sincronizar contraseña admin', content };
        if (fileSha) putBody.sha = fileSha;
        const res = await fetch(`https://api.github.com/repos/${ghUser}/${ghRepo}/contents/.admin-auth.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(putBody)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mostrarNotificacion('✅ Contraseña sincronizada con GitHub. Puedes borrar datos del navegador de forma segura.', 'success');
    } catch(e) {
        mostrarNotificacion(`❌ Error al sincronizar con GitHub: ${e.message}`, 'error');
    }
}

// Verifica al abrir el admin si la contraseña local coincide con la de GitHub
async function _checkPasswordSync() {
    const ghUser = localStorage.getItem('githubUser');
    const ghRepo = localStorage.getItem('githubRepo');
    const localHash = localStorage.getItem(AUTH_HASH_KEY);
    if (!localHash || !ghUser || !ghRepo) return;
    try {
        const res = await fetch(`https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/.admin-auth.json?_=${Date.now()}`);
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg.hash && cfg.hash !== localHash) {
            setTimeout(() => {
                mostrarNotificacion('⚠️ Contraseña no sincronizada con GitHub. Si borras datos del navegador perderás el acceso. Ve a Configuración → "Sincronizar contraseña".', 'error');
            }, 1500);
        }
    } catch(e) {}
}

function abrirAdminPanel() {
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

function cerrarAdminPanel() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('visible');
    panel.style.removeProperty('display');
    document.body.classList.remove('admin-mode');
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
            mostrarNotificacion('❌ La IA no respondió — revisa tu API key o completa las specs a mano', 'error');
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
        mostrarNotificacion('⏳ Subiendo imagen principal...', 'info');
        const imagenPrincipal = await subirImagenAGitHub(file);
        const extras = await subirMultiplesImagenes('productImagesExtra');
        const imagenes = _tmDedupImagenes([imagenPrincipal, ...extras]);

        const masVendidoVal = document.getElementById('productMasVendido');
        const producto = {
            id: Date.now(),
            nombre: document.getElementById('productName').value.trim(),
            descripcion: document.getElementById('productDescription').value.trim(),
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
            garantia: document.getElementById('productGarantia').value.trim(),
            devolucion: document.getElementById('productDevolucion') ? document.getElementById('productDevolucion').checked : false,
            specs: (() => {
                const raw = (document.getElementById('productSpecs')?.value || '').trim();
                if (!raw) return [];
                return raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
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
        document.getElementById('productForm').reset();
        const _mon1 = document.getElementById('productComisionMoneda');
        if (_mon1) _mon1.value = 'USD';
        const _tog1 = document.getElementById('tmMonedaToggle1');
        if (_tog1) _tog1.querySelectorAll('.tm-moneda-btn').forEach(b => b.classList.toggle('active', b.dataset.moneda === 'USD'));
        // Limpiar visualmente la sección de fotos: el form.reset() vacía los <input type="file">
        // pero deja los labels mostrando el nombre del archivo previo y la clase has-file puesta.
        if (typeof fileName === 'function') {
            const _pi = document.getElementById('productImage');
            const _pe = document.getElementById('productImagesExtra');
            if (_pi) fileName(_pi, 'productImage-name', 'Elegir foto principal *');
            if (_pe) fileName(_pe, 'productImagesExtra-name', 'Fotos extra (opcional)');
        }
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

function guardarProductos() {
    localStorage.setItem('productos', JSON.stringify(productos));
}

