'use strict';
// script-admin.js — Código exclusivo del panel de administración.
// Cargado SOLO por admin.html, DESPUÉS de script.js.
// Tiene acceso a todos los globals de script.js (productos, categorias, etc.).


// ════ EXTRAÍDO DE script.src.js líneas 1221–1247 ════
// ═══════════════════════════════════════════════════════
//  SUBIDA DE IMÁGENES A GITHUB (archivos .jpg reales)
// ═══════════════════════════════════════════════════════
async function subirImagenAGitHub(fileOrBase64) {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');

    const base64full = await comprimirImagen(fileOrBase64);

    if (!user || !repo || !token) return base64full; // fallback sin config

    try {
        const base64data = base64full.includes(',') ? base64full.split(',')[1] : base64full;
        if (!base64data) return base64full; // fallback si el data URL está malformado
        const filename   = 'img_' + Date.now() + '.jpg';
        const path       = 'imagenes/' + filename;
        const apiUrl     = 'https://api.github.com/repos/' + user + '/' + repo + '/contents/' + path;
        const headers    = { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' };
        const res = await fetch(apiUrl, {
            method: 'PUT', headers,
            body: JSON.stringify({ message: 'Imagen: ' + filename, content: base64data })
        });
        if (res.ok) return 'https://raw.githubusercontent.com/' + user + '/' + repo + '/main/' + path;
    } catch(e) { /* fallback */ }
    return base64full;
}

// ════ EXTRAÍDO DE script.src.js líneas 1960–2775 ════
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

    const rl = JSON.parse(localStorage.getItem('admin_rl') || '{"count":0,"until":0}');
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
        const atendidos  = JSON.parse(localStorage.getItem('tm_interesados_atendidos') || '[]');
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
        const camps = JSON.parse(localStorage.getItem('tm_campaigns_v1') || '[]');
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
        const plans = JSON.parse(localStorage.getItem('tm_week_plan_v1') || '[]');
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
        const camps2 = (() => { try { return JSON.parse(localStorage.getItem('tm_campaigns_v1') || '[]'); } catch(e) { return []; } })();
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
        const mods = JSON.parse(localStorage.getItem('productosModificados') || '[]');
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
        const plansTodos = JSON.parse(localStorage.getItem('tm_week_plan_v1') || '[]');
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

function switchTab(tabName) {
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
    if (tabName === 'publicar-ahora') setTimeout(cargarGruposFB, 100);
    if (tabName === 'manage-products') setTimeout(actualizarListaProductos, 100);
    if (tabName === 'ventas') setTimeout(renderizarVentas, 100);
    if (tabName === 'analytics') setTimeout(() => { if (typeof renderizarAnalyticsFirebase === 'function') renderizarAnalyticsFirebase(); }, 150);
    if (tabName === 'manage-subcategories') {
        setTimeout(() => {
            if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
            if (typeof actualizarListaSubcategorias === 'function') actualizarListaSubcategorias();
        }, 50);
    }
    if (tabName === 'oferta-dia') {
        setTimeout(() => {
            poblarSelectOfertaDia();
            renderizarListaAgotados();
        }, 100);
    }
    if (tabName === 'configuracion') {
        setTimeout(cargarNumeroWhatsApp, 100);
        setTimeout(cargarConfiguracionGitHub, 100);
    }
}

// ===== PRODUCTOS =====

async function agregarProductoForm(event) {
    event.preventDefault();
    const fileInput = document.getElementById('productImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!file) { mostrarNotificacion('Por favor selecciona una imagen principal', 'error'); return; }

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

// ===== COMPRESIÓN DE IMÁGENES =====
// Comprime una imagen (File o base64) a máximo ~40KB manteniendo buena calidad visual
function comprimirImagen(source, maxKB = 25, maxWidth = 480, maxHeight = 480) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width  = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            let quality = 0.82;
            // Intentar WebP primero (mejor compresión)
            let result = canvas.toDataURL('image/webp', quality);
            // Si el navegador no soporta WebP, devuelve PNG — detectarlo
            const supportsWebP = result.startsWith('data:image/webp');
            const fmt = supportsWebP ? 'image/webp' : 'image/jpeg';
            if (!supportsWebP) result = canvas.toDataURL(fmt, quality);
            // Reducir calidad hasta entrar en maxKB
            while (result.length > maxKB * 1024 * 1.37 && quality > 0.2) {
                quality -= 0.06;
                result = canvas.toDataURL(fmt, quality);
            }
            resolve(result);
        };

        img.onerror = () => resolve(source);

        if (typeof source === 'string') {
            img.src = source;
        } else {
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(source);
        }
    });
}

function descargarProductosJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(productos, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "productos.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo productos.json generado. Súbelo a tu GitHub.');
}

async function sincronizarConBackend() {
    // Backend eliminado en esta versión del repo.
    // Dejamos esta función como no-op para evitar errores y mantener compatibilidad.
    return false;
}

// ════ EXTRAÍDO DE script.src.js líneas 2912–2922 ════
async function subirMultiplesImagenes(inputId) {
    const input = document.getElementById(inputId);
    const files = input && input.files ? Array.from(input.files).filter(Boolean) : [];
    if (!files.length) return [];
    const urls = [];
    for (let i = 0; i < files.length; i++) {
        mostrarNotificacion('⏳ Subiendo foto ' + (i + 1) + ' de ' + files.length + '...', 'info');
        urls.push(await subirImagenAGitHub(files[i]));
    }
    return urls.filter(Boolean);
}

// ════ EXTRAÍDO DE script.src.js líneas 3401–3503 ════
// ===== FUNCIÓN DE COPIAR PARA FACEBOOK Y REVOLICO =====

function copiarParaRevolico(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `
${producto.nombre}

${producto.descripcion}

💰 Precio: $${producto.precioActual} USD
${producto.stock > 0 ? `📦 Stock: ${producto.stock} unidades disponibles` : '❌ Agotado'}

📞 Contacto: +53 54320170
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); }, 500);
    }).catch(() => { 
        window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer');
    });
}

function copiarParaFacebook(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const texto = `
🛍️ ${producto.nombre}

${producto.descripcion}

💰 Precio: $${producto.precioActual} USD
${producto.descuento > 0 ? `🔥 ¡OFERTA! (-${producto.descuento}%)` : ''}
${producto.stock > 0 ? `📦 Disponible: ${producto.stock} unidades` : '❌ Agotado'}

📞 Interesado? Contáctame por WhatsApp: +53 54320170

#TiendaMax #VentasCuba #GruposFacebook #Oferta
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Texto copiado para GRUPOS! Ahora pega en tus grupos de Facebook.');
        setTimeout(() => { window.open('https://www.facebook.com/groups/feed/', '_blank', 'noopener,noreferrer'); }, 500);
    }).catch(() => { 
        window.open('https://www.facebook.com/groups/feed/', '_blank', 'noopener,noreferrer');
    });
}

// ===== PUBLICACIÓN EN REVOLICO =====

function prepararPublicacionManual(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    const texto = `${producto.nombre}\n\n${producto.descripcion}\n\nPrecio: ${producto.precioActual} USD\nContacto: +53 54320170`;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✅ ¡Datos copiados! Ahora pega en Revolico.');
        setTimeout(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); }, 1000);
    }).catch(() => { window.open('https://www.revolico.com/item/publish', '_blank', 'noopener,noreferrer'); });
}

async function publicarEnRevolico(id) {
    if (typeof copiarYAbrirRevolico === 'function') {
        copiarYAbrirRevolico(id);
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Revolico no está disponible', 'error');
}

async function publicarEnFacebook(id) {
    if (typeof copiarYAbrirFacebook === 'function') {
        copiarYAbrirFacebook(id);
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Facebook no está disponible', 'error');
}

async function publicarAhora() {
    if (typeof mostrarSelectorAsistenteRevolico === 'function') {
        mostrarSelectorAsistenteRevolico();
        return;
    }
    mostrarNotificacion('⚠️ El asistente de Revolico no está disponible', 'error');
}

// ===== CATEGORÍAS (GESTIÓN) =====

function actualizarSelectCategorias() {
    ['productCategory', 'editProductCategory'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const val = select.value;
        select.innerHTML = '';
        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            select.appendChild(opt);
        });
        select.value = val || 'General';
    });
}

// ════ EXTRAÍDO DE script.src.js líneas 3530–4210 ════

function actualizarListaCategorias() {
    const list = document.getElementById('categoryList');
    if (!list) return;

    list.innerHTML = '';

    categorias.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <span>${obtenerIconoCategoria(cat)} ${cat}</span>
            ${cat !== 'General' ? `<button onclick="eliminarCategoria(${index})">🗑️</button>` : ''}
        `;
        list.appendChild(item);
    });
}

function descargarCategoriasJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(categorias, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "categorias.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    mostrarNotificacion('✅ Archivo categorias.json generado. Súbelo a tu GitHub.');
}

function agregarCategoria() {
    const input = document.getElementById('newCategoryName');
    const iconInput = document.getElementById('newCategoryIcon');
    const name = input.value.trim();
    const icon = iconInput.value.trim();
    
    if (!name) return;
    if (categorias.includes(name)) { mostrarNotificacion('La categoría ya existe', 'error'); return; }
    
    categorias.push(name);
    
    // Si el usuario puso un icono, guardarlo como personalizado
    if (icon) {
        iconosPersonalizados[name] = icon;
        localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
    }
    
    guardarCategorias();
    input.value = '';
    iconInput.value = '';
    
    actualizarSelectCategorias();
    actualizarBotonesCategorias();
    actualizarListaCategorias();
    renderizarCategoriasHome();
    if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    mostrarNotificacion('✅ Categoría agregada');
}

function guardarCategorias() {
    localStorage.setItem('categorias', JSON.stringify(categorias));
    localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
    // Persistir en Firebase RTDB para que sobreviva recargas y otros dispositivos
    const base = _fbRtdbUrl();
    if (base) {
        fetch(base + '/configuracion/categorias.json', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({nombres: categorias, iconos: iconosPersonalizados, ts: Date.now()})
        }).catch(() => {
            mostrarNotificacion('⚠️ Categoría guardada localmente. Sin conexión Firebase — haz clic en Actualizar Tienda para hacerla permanente.', 'info');
        });
    }
}

function eliminarCategoria(index) {
    const nombre = categorias[index];
    if (nombre === 'General') return;
    if (confirm(`¿Eliminar la categoría "${nombre}"?`)) {
        // Eliminar icono personalizado si existe
        if (iconosPersonalizados[nombre]) {
            delete iconosPersonalizados[nombre];
            localStorage.setItem('iconosPersonalizados', JSON.stringify(iconosPersonalizados));
        }
        
        categorias.splice(index, 1);
        guardarCategorias();
        actualizarSelectCategorias();
        actualizarBotonesCategorias();
        actualizarListaCategorias();
        renderizarCategoriasHome();
        renderizarProductos();
        if (typeof actualizarSelectCategoriasPadre === 'function') actualizarSelectCategoriasPadre();
    }
}

// ===== GESTIÓN DE PRODUCTOS (EDITAR/ELIMINAR) =====

function eliminarProducto(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    productos = productos.filter(p => p.id !== id);
    guardarProductos();
    // Una eliminación requiere sincronizar todos los productos
    localStorage.setItem('productosModificados', JSON.stringify(productos.map(p => p.id)));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
    sincronizarConBackend();
    renderizarCategoriasHome();
    renderizarMasVendidos();
    renderizarProductos();
    actualizarListaProductos();
    verificarOfertasYMostrarBanner();
    mostrarNotificacion('🗑️ Producto eliminado', 'info');
}

// ── Estado de la galería en el modal de edición ──────────
let _editImagenesEliminar = new Set();
let _editProductActual = null;

function _renderEditGallery(p) {
    const preview = document.getElementById('currentImagePreview');
    if (!preview) return;
    const imgs = obtenerImagenesProducto(p).filter(u => !_editImagenesEliminar.has(u));
    preview.innerHTML = '';
    if (!imgs.length) {
        const s = document.createElement('span');
        s.style.cssText = 'font-size:12px;color:#888;';
        s.textContent = 'Sin imágenes';
        preview.appendChild(s);
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'admin-gallery-preview';
    imgs.forEach(url => {
        const item = document.createElement('div');
        item.className = 'admin-gallery-item';
        const img = document.createElement('img');
        img.src = url;
        img.onerror = () => { img.style.display = 'none'; };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-gallery-delete';
        btn.title = 'Quitar esta foto';
        btn.textContent = '✕';
        btn.addEventListener('click', () => {
            _editImagenesEliminar.add(url);
            _renderEditGallery(p);
        });
        item.appendChild(img);
        item.appendChild(btn);
        wrap.appendChild(item);
    });
    preview.appendChild(wrap);
}

function _renderEditRecomendados(p) {
    const container = document.getElementById('editRecomendadosList');
    if (!container) return;
    const currentIds = new Set((p.recomendados || []).map(String));
    const others = productos.filter(x => String(x.id) !== String(p.id));
    if (others.length === 0) { container.innerHTML = '<span style="font-size:12px;color:#666">No hay otros productos</span>'; return; }
    container.innerHTML = others.map(x => {
        const checked = currentIds.has(String(x.id));
        return '<label style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,.06);border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap">' +
            '<input type="checkbox" class="tm-rec-check" value="' + safeNum(x.id) + '"' + (checked ? ' checked' : '') + '> ' +
            escapeHtml((x.nombre || '').slice(0, 35)) +
        '</label>';
    }).join('');
}

function abrirEditModal(id) {
    const p = productos.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('editProductName').value = p.nombre;
    document.getElementById('editProductDescription').value = p.descripcion;
    document.getElementById('editProductPriceActual').value = p.precioActual;
    const _epOrig = document.getElementById('editProductPrecioOriginal');
    if (_epOrig) _epOrig.value = p.precioOriginal > 0 ? p.precioOriginal : '';
    document.getElementById('editProductStock').value = p.stock;
    document.getElementById('editProductCategory').value = p.categoria;

    // Cargar subcategorías del producto al editar
    if (typeof actualizarSelectSubcategorias === 'function') {
        actualizarSelectSubcategorias();
        setTimeout(() => {
            const editSubcat = document.getElementById('editProductSubcategory');
            if (editSubcat && p.subcategoria) editSubcat.value = p.subcategoria;
        }, 50);
    }
    
    // Nuevos campos en edición
    if (document.getElementById('editProductUsado')) document.getElementById('editProductUsado').checked = p.usado || false;
    if (document.getElementById('editProductGarantia')) document.getElementById('editProductGarantia').value = p.garantia || '';
    if (document.getElementById('editProductDevolucion')) document.getElementById('editProductDevolucion').checked = p.devolucion || false;
    if (document.getElementById('editProductComision')) document.getElementById('editProductComision').value = p.comision || '';
    const _editComMon = p.comisionMoneda || 'USD';
    const _editHidMon = document.getElementById('editProductComisionMoneda');
    if (_editHidMon) _editHidMon.value = _editComMon;
    const _editToggle = document.getElementById('tmMonedaToggleEdit');
    if (_editToggle) _editToggle.querySelectorAll('.tm-moneda-btn').forEach(b => b.classList.toggle('active', b.dataset.moneda === _editComMon));

    const masVendidoSel = document.getElementById('editProductMasVendido');
    if (masVendidoSel) masVendidoSel.value = p.masVendido ? 'true' : 'false';

    // Limpiar estado de fotos de la edición anterior
    _editImagenesEliminar = new Set();
    _editProductActual = p;
    const _fi1 = document.getElementById('editProductImage');
    if (_fi1) _fi1.value = '';
    const _fi2 = document.getElementById('editProductImagesExtra');
    if (_fi2) _fi2.value = '';
    _renderEditGallery(p);
    _renderEditRecomendados(p);

    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.style.removeProperty('display');
}

function cerrarEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
}

async function guardarProductoEditado(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editProductId').value);
    const index = productos.findIndex(p => p.id === id);
    if (index === -1) return;

    const masVendidoSel = document.getElementById('editProductMasVendido');
    const fileInput = document.getElementById('editProductImage');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    try {
        let nuevaImagen = null;
        if (file) {
            mostrarNotificacion('⏳ Subiendo imagen principal...', 'info');
            nuevaImagen = await subirImagenAGitHub(file);
        }
        const extrasNuevas = await subirMultiplesImagenes('editProductImagesExtra');
        const imagenPrincipal = nuevaImagen || productos[index].imagen;
        // Excluir fotos marcadas para eliminar en el modal
        const anteriores = obtenerImagenesProducto(productos[index]).filter(u => !_editImagenesEliminar.has(u));
        const imagenes = _tmDedupImagenes([
            imagenPrincipal,
            ...anteriores.filter(url => url !== productos[index].imagen && url !== imagenPrincipal),
            ...extrasNuevas
        ]);

        const productoActualizado = {
            ...productos[index],
            nombre: document.getElementById('editProductName').value.trim(),
            descripcion: document.getElementById('editProductDescription').value.trim(),
            precioActual: parseFloat(document.getElementById('editProductPriceActual').value) || 0,
            precioOriginal: parseFloat(document.getElementById('editProductPrecioOriginal')?.value) || 0,
            descuento: 0,
            stock: parseInt(document.getElementById('editProductStock').value) || 0,
            categoria: document.getElementById('editProductCategory').value,
            subcategoria: (document.getElementById('editProductSubcategory') && document.getElementById('editProductSubcategory').value) ? document.getElementById('editProductSubcategory').value : (productos[index].subcategoria || ''),
            masVendido: masVendidoSel ? masVendidoSel.value === 'true' : productos[index].masVendido,
            imagen: imagenPrincipal,
            imagenes: imagenes,
            usado: document.getElementById('editProductUsado') ? document.getElementById('editProductUsado').checked : productos[index].usado,
            garantia: document.getElementById('editProductGarantia') ? document.getElementById('editProductGarantia').value.trim() : productos[index].garantia,
            devolucion: document.getElementById('editProductDevolucion') ? document.getElementById('editProductDevolucion').checked : productos[index].devolucion,
            comision: document.getElementById('editProductComision') ? parseFloat(document.getElementById('editProductComision').value) || 0 : productos[index].comision || 0,
            comisionMoneda: document.getElementById('editProductComisionMoneda')?.value || productos[index].comisionMoneda || 'USD',
            recomendados: Array.from(document.querySelectorAll('#editRecomendadosList .tm-rec-check:checked')).map(cb => parseInt(cb.value))
        };

        const errores = validarProducto(productoActualizado);
        if (errores.length > 0) {
            mostrarNotificacion('❌ ' + errores[0], 'error');
            return;
        }

        productos[index] = productoActualizado;
        guardarProductos();
        marcarProductoModificado(productoActualizado.id);
        sincronizarConGitHub();
        cerrarEditModal();
        renderizarCategoriasHome();
        renderizarMasVendidos();
        renderizarProductos();
        actualizarListaProductos();
        mostrarNotificacion('✅ Producto actualizado');
    } catch (e) {
        console.error('Error actualizando producto:', e);
        mostrarNotificacion('❌ Error actualizando imágenes: ' + (e.message || e), 'error');
    }
}

// ===== ESTADO DEL BACKEND =====

async function verificarEstadoBackend() {
    const statusEl = document.getElementById('backendStatus');
    if (!statusEl) return;
    statusEl.innerHTML = '🟠 <strong>Modo manual activo</strong> · Publicación asistida desde el navegador · Sin dependencia de backend roto';
    statusEl.style.color = '#F39C12';
}

async function cargarEstadoPublicacion() {
    const logContainer = document.getElementById('historialPublicaciones');
    if (!logContainer) return;
    logContainer.innerHTML = '<p style="font-size:13px;color:#666;">Modo manual activo. No existe historial automático porque este repo no incluye backend de publicación.</p>';
}

// ===== SINCRONIZACIÓN CON GITHUB =====

function cargarConfiguracionGitHub() {
    document.getElementById('githubUser').value = localStorage.getItem('githubUser') || '';
    document.getElementById('githubRepo').value = localStorage.getItem('githubRepo') || 'Tiendamax';
    document.getElementById('githubToken').value = localStorage.getItem('githubToken') || '';
    
    const fbConfig = localStorage.getItem('firebaseConfig');
    if (fbConfig) {
        try {
            document.getElementById('firebaseConfigJson').value = JSON.stringify(JSON.parse(fbConfig), null, 2);
        } catch(e) {
            document.getElementById('firebaseConfigJson').value = fbConfig;
        }
    } else {
        document.getElementById('firebaseConfigJson').value = '';
    }
    document.getElementById('firebaseVapidKey').value = localStorage.getItem('firebaseVapidKey') || '';
    document.getElementById('firebaseServerKey').value = localStorage.getItem('fcmServerKey') || '';
}

function guardarConfiguracionGitHub(event) {
    event.preventDefault();
    localStorage.setItem('githubUser', document.getElementById('githubUser').value.trim());
    localStorage.setItem('githubRepo', document.getElementById('githubRepo').value.trim());
    localStorage.setItem('githubToken', document.getElementById('githubToken').value.trim());
    mostrarNotificacion('✅ Configuración de GitHub guardada localmente');
}



// ===== SISTEMA DE DELTA SYNC =====
// Registra qué productos fueron modificados desde la última sincronización
function marcarProductoModificado(id) {
    const modificados = JSON.parse(localStorage.getItem('productosModificados') || '[]');
    if (!modificados.includes(id)) modificados.push(id);
    localStorage.setItem('productosModificados', JSON.stringify(modificados));
    localStorage.setItem('ultimaModificacion', Date.now().toString());
}

function limpiarProductosModificados() {
    localStorage.removeItem('productosModificados');
    localStorage.setItem('ultimaSincronizacion', Date.now().toString());
}

function obtenerProductosModificados() {
    return JSON.parse(localStorage.getItem('productosModificados') || '[]');
}

async function sincronizarTodoConGitHub() {
    const user  = localStorage.getItem('githubUser');
    const repo  = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {
        mostrarNotificacion('❌ Configura primero tu usuario, repo y token en la pestaña Configuración', 'error');
        switchTab('configuracion');
        return;
    }

    const btn = document.querySelector('[data-action="sincronizarTodoConGitHub"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    // --- Barra de progreso ---
    let barraContenedor = document.getElementById('syncProgressContenedor');
    if (!barraContenedor) {
        barraContenedor = document.createElement('div');
        barraContenedor.id = 'syncProgressContenedor';
        barraContenedor.style.cssText = 'margin-top:14px;';
        barraContenedor.innerHTML = `
            <div style="background:#2a2a2a;border-radius:8px;overflow:hidden;height:14px;margin-bottom:6px;">
                <div id="syncProgressBarra" style="height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#ff9a6c);transition:width 0.4s ease;border-radius:8px;"></div>
            </div>
            <p id="syncProgressTexto" style="font-size:12px;color:#aaa;text-align:center;margin:0;"></p>
        `;
        if (btn) btn.parentNode.insertBefore(barraContenedor, btn.nextSibling);
    }
    barraContenedor.style.display = 'block';
    const barra   = document.getElementById('syncProgressBarra');
    const textoEl = document.getElementById('syncProgressTexto');

    // Barra flotante global: visible aunque el botón esté en otra pestaña o fuera de pantalla.
    let barraFloat = document.getElementById('tmSyncFloat');
    if (!barraFloat) {
        barraFloat = document.createElement('div');
        barraFloat.id = 'tmSyncFloat';
        barraFloat.innerHTML = `
          <div class="tm-sync-float-card">
            <div class="tm-sync-float-top"><b>🔄 Actualizando tienda</b><span id="tmSyncFloatPct">0%</span></div>
            <div class="tm-sync-float-track"><div id="tmSyncFloatBar"></div></div>
            <div id="tmSyncFloatText">Preparando...</div>
          </div>`;
        const st = document.createElement('style');
        st.id = 'tmSyncFloatStyle';
        st.textContent = `#tmSyncFloat{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateX(-50%);z-index:99999;width:min(92vw,460px);pointer-events:none}.tm-sync-float-card{background:rgba(15,15,15,.96);border:1px solid rgba(201,169,110,.35);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04) inset;border-radius:16px;padding:13px 14px;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.tm-sync-float-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:9px}.tm-sync-float-top b{color:#fff}.tm-sync-float-top span{color:#C9A96E;font-weight:900}.tm-sync-float-track{height:11px;background:#272727;border-radius:999px;overflow:hidden}.tm-sync-float-track>div{height:100%;width:0%;background:linear-gradient(90deg,#FF6B35,#C9A96E);border-radius:999px;transition:width .35s ease}#tmSyncFloatText{font-size:11px;color:#bbb;margin-top:7px;text-align:center}`;
        document.head.appendChild(st);
        document.body.appendChild(barraFloat);
    }
    barraFloat.style.display = 'block';
    const barraFloatBar = document.getElementById('tmSyncFloatBar');
    const barraFloatPct = document.getElementById('tmSyncFloatPct');
    const barraFloatText = document.getElementById('tmSyncFloatText');

    if (barra)   barra.style.width = '0%';
    if (textoEl) textoEl.textContent = 'Preparando...';
    if (barraFloatBar) barraFloatBar.style.width = '0%';
    if (barraFloatPct) barraFloatPct.textContent = '0%';
    if (barraFloatText) barraFloatText.textContent = 'Preparando...';

    function actualizarBarra(paso, total, mensaje) {
        const pct = Math.round((paso / total) * 100);
        if (barra)   barra.style.width = pct + '%';
        if (textoEl) textoEl.textContent = mensaje;
        if (barraFloatBar) barraFloatBar.style.width = pct + '%';
        if (barraFloatPct) barraFloatPct.textContent = pct + '%';
        if (barraFloatText) barraFloatText.textContent = mensaje;
    }
    // -------------------------

    const idsModificados = obtenerProductosModificados();
    const hayDelta = idsModificados.length > 0 && idsModificados.length < productos.length;

    if (hayDelta) {
        mostrarNotificacion(`🔄 Subiendo ${idsModificados.length} producto(s) modificado(s)...`, 'info');
    } else {
        mostrarNotificacion('🚀 Sincronizando tienda completa con GitHub...', 'info');
    }

    // Construir config.json con tasa + oferta del día para que todos los clientes la vean
    const _configSync = {
        tasaMN:              parseFloat(localStorage.getItem('tasaMN') || '0') || undefined,
        ofertaDiaId:         localStorage.getItem('ofertaDiaId') || undefined,
        ofertaDiaTexto:      localStorage.getItem('ofertaDiaTexto') || undefined,
        ofertaDiaActualizado: localStorage.getItem('ofertaDiaId') ? new Date().toISOString() : undefined,
        firebaseConfig:      localStorage.getItem('firebaseConfig') ? JSON.parse(localStorage.getItem('firebaseConfig')) : undefined,
        fcmServerKey:        localStorage.getItem('fcmServerKey') || undefined,
        actualizado:         new Date().toISOString(),
    };
    // Limpiar claves undefined
    Object.keys(_configSync).forEach(k => _configSync[k] === undefined && delete _configSync[k]);

    const archivos = [
        { path: 'productos.json',              data: productos },
        { path: 'categorias.json',             data: { nombres: categorias, iconos: iconosPersonalizados } },
        { path: 'subcategorias.json',          data: JSON.parse(localStorage.getItem('subcategorias') || '{}') },
        { path: 'grupos_facebook_config.json', data: { grupos: JSON.parse(localStorage.getItem('gruposFB') || '[]'), exportado: new Date().toISOString() } },
        { path: 'revolico_config.json',        data: JSON.parse(localStorage.getItem('revolicoConfig') || '{}') },
        { path: 'banners.json',                data: JSON.parse(localStorage.getItem('heroBanners') || '[]') },
        // comisiones.json eliminado — consolidado en productos.json
        // ventas_historial.json migrado a Firebase — ya no se sube a GitHub
        { path: 'config.json',                 data: _configSync },
    ];

    // Si hay productos modificados: subir productos + config + grupos + categorias (siempre)
    // Si no hay delta: subir todo
    const archivosFiltrados = hayDelta
        ? archivos.filter(a => ['productos.json', 'config.json', 'grupos_facebook_config.json', 'categorias.json'].includes(a.path))
        : archivos;

    let ok = 0, errors = [];
    const total = archivosFiltrados.length;
    // Subir secuencialmente para evitar conflictos de SHA en GitHub
    for (let i = 0; i < archivosFiltrados.length; i++) {
        const { path, data } = archivosFiltrados[i];
        actualizarBarra(i, total, `Subiendo ${path}… (${i + 1}/${total})`);
        if (btn) btn.textContent = `⏳ ${i + 1}/${total} archivos...`;
        try {
            await subirArchivoAGitHub(user, repo, token, path, data);
            ok++;
        } catch (e) {
            errors.push(`${path}: ${e.message}`);
        }
    }
    if (errors.length === 0) {
        actualizarBarra(total, total, '✅ ¡Todo subido correctamente!');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }
        setTimeout(() => {
            if (barraContenedor) barraContenedor.style.display = 'none';
            const f = document.getElementById('tmSyncFloat');
            if (f) f.style.display = 'none';
        }, 4000);
        limpiarProductosModificados();
        _tmPublicarVersionFirebase();
        const info = hayDelta ? `${idsModificados.length} producto(s) actualizado(s)` : `${ok} archivos`;
        mostrarNotificacion(`✅ Tienda actualizada (${info}). Visible en ~30 segundos.`);
    } else {
        const primerError = errors[0];
        const causa = primerError.includes(': ') ? primerError.split(': ').slice(1).join(': ').trim() : primerError;
        // Mostrar error en la barra flotante en rojo y mantenerla visible
        actualizarBarra(total, total, '❌ ' + causa);
        const floatText = document.getElementById('tmSyncFloatText');
        const floatBar  = document.getElementById('tmSyncFloatBar');
        if (floatText) { floatText.style.color = '#FF6B35'; floatText.textContent = '❌ ' + causa; }
        if (floatBar)  floatBar.style.background = '#FF6B35';
        if (btn) { btn.disabled = false; btn.textContent = '🔄 ACTUALIZAR TIENDA AHORA'; }
        // Ocultar barra local tras 8s pero no la flotante (hasta que el usuario la vea)
        setTimeout(() => { if (barraContenedor) barraContenedor.style.display = 'none'; }, 8000);
        setTimeout(() => {
            const f = document.getElementById('tmSyncFloat');
            if (f) f.style.display = 'none';
        }, 12000);
        mostrarNotificacion(`❌ Error al subir: ${causa}`, 'error');
        console.error('Errores de sincronización:', errors);
    }
}

async function sincronizarConGitHub() {
    const user = localStorage.getItem('githubUser');
    const repo = localStorage.getItem('githubRepo');
    const token = localStorage.getItem('githubToken');
    if (!user || !repo || !token) {

        return;
    }
    try {
        await subirArchivoAGitHub(user, repo, token, 'productos.json', productos);
        _tmPublicarVersionFirebase();
    } catch (e) {
        console.warn('⚠️ Error al sincronizar automáticamente:', e.message);
    }
}

// ── Señal de versión en Firebase para forzar actualización en todos los clientes ──
async function _tmPublicarVersionFirebase() {
    const base = _tmRtdbUrl();
    if (!base) return;
    try {
        await fetch(`${base}/config/version.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
        });
    } catch(e) {}
}

async function subirArchivoAGitHub(user, repo, token, path, data) {
    const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' };
    const jsonStr  = JSON.stringify(data, null, 2);
    const content  = btoa(Array.from(new TextEncoder().encode(jsonStr), b => String.fromCharCode(b)).join(''));

    // Calcular tamaño aproximado en bytes (base64 → bytes originales)
    const sizeBytes = jsonStr.length;
    const apiBase   = `https://api.github.com/repos/${user}/${repo}`;

    // Detectar la rama principal (main o master) automáticamente
    async function obtenerRamaPrincipal() {
        try {
            const res = await fetch(`${apiBase}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.default_branch || 'main';
            }
        } catch (e) {}
        return 'main';
    }

    // Función interna para obtener el SHA del archivo (Contents API)
    // Cache-buster para evitar que GitHub devuelva SHA desactualizado
    async function obtenerSHA() {
        try {
            const res = await fetch(`${apiBase}/contents/${path}?_=${Date.now()}`, { headers });
            if (res.ok) {
                const d = await res.json();
                return d.sha || null;
            }
            if (res.status === 404) return null;
            return null;
        } catch (e) { return null; }
    }

    // Para archivos < 900KB usar la Contents API normal (más simple)
    if (sizeBytes < 900 * 1024) {
        let sha = await obtenerSHA();
        const body = { message: `Actualización de ${path}`, content };
        if (sha) body.sha = sha;

        let response = await fetch(`${apiBase}/contents/${path}`, {
            method: 'PUT', headers, body: JSON.stringify(body)
        });

        // Reintentar con SHA fresco si hay conflicto (hasta 3 intentos)
        for (let intento = 0; intento < 3 && !response.ok && (response.status === 409 || response.status === 422); intento++) {
            await new Promise(r => setTimeout(r, 800)); // esperar antes de reintentar
            sha = await obtenerSHA();
            const bodyRetry = { message: `Actualización de ${path}`, content };
            if (sha) bodyRetry.sha = sha;
            response = await fetch(`${apiBase}/contents/${path}`, {
                method: 'PUT', headers, body: JSON.stringify(bodyRetry)
            });
        }

        if (!response.ok) {
            // Dar mensajes de error claros según el código HTTP
            if (response.status === 401) {
                throw new Error('Token inválido o expirado. Ve a Config y actualiza tu Token de Acceso.');
            }
            if (response.status === 403) {
                throw new Error('Token sin permisos. Asegúrate de que tenga el permiso "repo" completo.');
            }
            // Para 404 en el PUT: verificar si es el repo o el archivo
            if (response.status === 404) {
                // Comprobar si el repo existe realmente
                const checkRepo = await fetch(`${apiBase}`, { headers });
                if (!checkRepo.ok) {
                    throw new Error(`Repositorio "${user}/${repo}" no encontrado. Verifica usuario y nombre del repo en Config.`);
                }
                // El repo existe pero el archivo no se pudo crear: problema de permisos del token
                throw new Error('Token sin permisos de escritura. Asegúrate de que tenga el permiso "repo" completo (no solo "public_repo").');
            }
            let errMsg = `Error ${response.status} al subir ${path}`;
            try { const err = await response.json(); errMsg = err.message || errMsg; } catch(e) {}
            throw new Error(errMsg);
        }
        return;
    }

    // Para archivos >= 900KB usar el Git Data API (soporta archivos grandes)
    const rama = await obtenerRamaPrincipal();

    // Paso 1: Crear blob con el contenido
    const blobRes = await fetch(`${apiBase}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content, encoding: 'base64' })
    });
    if (!blobRes.ok) {
        const e = await blobRes.json();
        throw new Error(`Error creando blob: ${e.message}`);
    }
    const { sha: blobSha } = await blobRes.json();

    // Paso 2: Obtener el SHA del commit más reciente (HEAD)
    const refRes = await fetch(`${apiBase}/git/ref/heads/${rama}`, { headers });
    if (!refRes.ok) throw new Error(`No se pudo obtener la rama "${rama}"`);
    const { object: { sha: commitSha } } = await refRes.json();

    // Paso 3: Obtener el tree SHA del commit
    const commitRes = await fetch(`${apiBase}/git/commits/${commitSha}`, { headers });
    if (!commitRes.ok) throw new Error('No se pudo obtener el commit');
    const { tree: { sha: treeSha } } = await commitRes.json();

    // Paso 4: Crear nuevo tree con el archivo actualizado
    const newTreeRes = await fetch(`${apiBase}/git/trees`, {
        method: 'POST', headers,
        body: JSON.stringify({
            base_tree: treeSha,
            tree: [{ path, mode: '100644', type: 'blob', sha: blobSha }]
        })
    });
    if (!newTreeRes.ok) throw new Error('Error creando tree');
    const { sha: newTreeSha } = await newTreeRes.json();

    // Paso 5: Crear nuevo commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
        method: 'POST', headers,
        body: JSON.stringify({
            message: `Actualización de ${path}`,
            tree: newTreeSha,
            parents: [commitSha]
        })
    });
    if (!newCommitRes.ok) throw new Error('Error creando commit');
    const { sha: newCommitSha } = await newCommitRes.json();

    // Paso 6: Actualizar referencia HEAD (force:true evita el error "not a fast-forward")
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${rama}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sha: newCommitSha, force: true })
    });
    if (!updateRefRes.ok) {
        const e = await updateRefRes.json();
        throw new Error(`Error actualizando ref: ${e.message}`);
    }
}
