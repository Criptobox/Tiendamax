// ═══════════════════════════════════════════════════════
// 📊 TIENDAMAX ANALYTICS — analytics.js v7
// v7: carnet de identidad (deviceId) — cuenta y borra por dispositivo
//     real. Botón "Borrar todos" para reiniciar lista de suscriptores.
// v6: borrar suscriptor individual + limpiar duplicados
// v5: panel rediseñado + fix contador suscriptores
// ═══════════════════════════════════════════════════════

// ── Sanitización HTML para el panel (anti-XSS) ──────────
function _escH(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// ── Utilidad: obtener/cargar la URL base de Firebase RTDB ──────
let _tmFbConfigPromise = null;
async function _tmEnsureFirebaseConfig() {
    try {
        const raw = localStorage.getItem('firebaseConfig');
        if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && (cfg.databaseURL || cfg.projectId)) return cfg;
        }
    } catch(e) {}
    if (_tmFbConfigPromise) return _tmFbConfigPromise;
    _tmFbConfigPromise = (async () => {
        try {
            const res = await fetch('config.json?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            const cfg = data && data.firebaseConfig;
            if (cfg && (cfg.databaseURL || cfg.projectId)) {
                localStorage.setItem('firebaseConfig', JSON.stringify(cfg));
                if (cfg.vapidKey) localStorage.setItem('firebaseVapidKey', cfg.vapidKey);
                return cfg;
            }
        } catch(e) {
            console.warn('[analytics] No se pudo cargar config.json:', e.message);
        } finally {
            setTimeout(() => { _tmFbConfigPromise = null; }, 1000);
        }
        return null;
    })();
    return _tmFbConfigPromise;
}
function _tmRtdbUrl() {
    try {
        const cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
        if (cfg.databaseURL) return cfg.databaseURL;
        if (cfg.projectId)   return `https://${cfg.projectId}-default-rtdb.firebaseio.com`;
    } catch(e) {}
    return null;
}
// Precargar para que Analytics/limpiador estén listos al abrir el admin.
_tmEnsureFirebaseConfig().catch(() => null);

// ── Rate limiting para prevenir abuso ──────────────────
// El cooldown vivía SOLO en memoria: recargar la página (F5, o simplemente
// entrar y salir del detalle varias veces) reiniciaba _tmAnalyticsSessions
// y cada recarga contaba como una vista nueva — un mismo visitante podía
// inflar el contador a mano entrando 100 veces seguidas al mismo producto.
// Ahora el timestamp también se guarda en sessionStorage, así sobrevive
// recargas dentro de la misma pestaña/sesión (se limpia solo al cerrarla).
const _tmAnalyticsSessions = {};
const _tmAnalyticsCooldown = 30 * 60 * 1000; // 30 min: una "vista" real por sesión, no por click
const _tmAnalyticsMaxPerSession = 200;
let _tmAnalyticsCount = 0;

function _tmCanTrack(tipo, id) {
    const key = `${tipo}_${id}`;
    const now = Date.now();
    if (_tmAnalyticsCount >= _tmAnalyticsMaxPerSession) return false;
    let last = _tmAnalyticsSessions[key];
    if (last === undefined) {
        try { last = parseInt(sessionStorage.getItem('tm_an_' + key) || '0', 10) || 0; } catch(e) { last = 0; }
    }
    if (last && (now - last) < _tmAnalyticsCooldown) return false;
    _tmAnalyticsSessions[key] = now;
    try { sessionStorage.setItem('tm_an_' + key, String(now)); } catch(e) {}
    _tmAnalyticsCount++;
    return true;
}

// ── ¿Es el propio admin navegando el sitio? ─────────────
// githubToken solo se guarda al configurar el panel admin (pegar el PAT en
// Configuración) — ningún cliente lo tiene nunca. index.html y admin.html
// comparten dominio/localStorage, así que si el admin entra a la tienda
// pública desde el mismo navegador donde ya configuró el panel (típico:
// su teléfono), esta marca ya está puesta. Se usa para no inflar vistas ni
// clicks de WhatsApp con sus propias entradas de prueba.
function _tmEsAdmin() {
    try { return !!localStorage.getItem('githubToken'); } catch(e) { return false; }
}

// ── Registrar un evento (fire-and-forget) ───────────────
// Read-modify-write sin transacción real: bajo tráfico concurrente en el
// mismo producto, la regla de Firebase (".validate": newData == data + 1)
// rechaza el segundo PUT si otro cliente incrementó primero. Reintentamos
// unas pocas veces con el valor fresco en vez de perder el incremento en
// silencio (antes no se chequeaba r.ok del PUT).
async function tmTrackEventoV2(tipo, id) {
    if (_tmEsAdmin()) return;
    await _tmEnsureFirebaseConfig();
    const base = _tmRtdbUrl();
    if (!base || !id) return;
    if (!_tmCanTrack(tipo, id)) return;
    const url = `${base}/analytics/${tipo}/${String(id)}/count.json`;
    for (let intento = 0; intento < 3; intento++) {
        try {
            const r = await fetch(url);
            const v = r.ok ? (await r.json()) : null;
            const actual = (typeof v === 'number') ? v : 0;
            const put = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actual + 1)
            });
            if (put.ok) return;
            // Rechazado por la regla (otro cliente incrementó primero): reintentar
            // con el valor fresco en vez de perder este incremento en silencio.
        } catch(e) {
            console.warn(`⚠️ Analytics (${tipo}/${id}):`, e);
            return;
        }
    }
}

// ── API pública ─────────────────────────────────────────
function tmTrackVista(productoId)    { tmTrackEventoV2('vistas', productoId); }
function tmTrackWhatsApp(productoId) { tmTrackEventoV2('whatsapp', productoId); }

// ── Contador de suscriptores (caché local) ──────────────
function tmRefrescarConteoSuscriptores() {
    // No incrementar/decrementar “a ciegas”: el contador real es la cantidad
    // de dispositivos únicos guardados en Firebase. Así borrar datos del navegador
    // y volver a activar no infla el número local.
    setTimeout(() => {
        tmLeerAnalytics()
            .then(d => localStorage.setItem('tm_subscriber_count', String(d.suscriptores || 0)))
            .catch(() => null);
    }, 800);
}
function tmRegistrarSuscriptor() { tmRefrescarConteoSuscriptores(); }
function tmDesregistrarSuscriptor() { tmRefrescarConteoSuscriptores(); }

// ── Fetch con timeout ───────────────────────────────────
function _tmFetch(url, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    // Anti-caché: lee siempre la lista fresca de Firebase (antes el navegador/SW
    // servía una copia vieja y los suscriptores dados de baja seguían apareciendo).
    const sep = url.includes('?') ? '&' : '?';
    return fetch(url + sep + '_=' + Date.now(), { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t));
}

// ── Parsear userAgent simple ────────────────────────────
function _tmParseDevice(ua = '') {
    if (/iPhone|iPad|iPod/i.test(ua)) return { tipo: 'iOS', icon: '🍎' };
    if (/Android/i.test(ua))          return { tipo: 'Android', icon: '🤖' };
    if (/Windows/i.test(ua))          return { tipo: 'Windows', icon: '🖥️' };
    if (/Mac/i.test(ua))              return { tipo: 'Mac', icon: '💻' };
    if (/Linux/i.test(ua))            return { tipo: 'Linux', icon: '🐧' };
    return { tipo: 'Otro', icon: '📱' };
}


// Cuenta suscriptores únicos. Prioridad: deviceId (carnet) > fingerprint > token.
// Las entradas legacy sin deviceId ni fingerprint cuentan por token string.
function tmContarSuscriptoresUnicos(tokensData = {}) {
    const vals = Object.values(tokensData).filter(t => t && t.token);
    const uasConFp = new Set(vals.filter(t => t.fingerprint && t.userAgent).map(t => t.userAgent));
    const claves = new Set();
    vals.forEach(t => {
        if (t.deviceId) {
            claves.add('did:' + t.deviceId);
        } else if (t.fingerprint) {
            claves.add('fp:' + t.fingerprint);
        } else if (t.userAgent && uasConFp.has(t.userAgent)) {
            // legacy: mismo dispositivo ya re-registrado con fingerprint, no contar doble
            return;
        } else {
            claves.add('tk:' + t.token);
        }
    });
    return claves.size;
}
window.tmContarSuscriptoresUnicos = tmContarSuscriptoresUnicos;

// ── Leer todos los datos de analytics ───────────────────
async function tmLeerAnalytics() {
    await _tmEnsureFirebaseConfig();
    const base = _tmRtdbUrl();
    if (!base) return { vistas: {}, whatsapp: {}, suscriptores: 0, tokensData: {} };

    const results = await Promise.allSettled([
        _tmFetch(`${base}/analytics/vistas.json`),
        _tmFetch(`${base}/analytics/whatsapp.json`),
        _tmFetch(`${base}/tokens.json`)   // full para ver timestamps y userAgents
    ]);

    let vistas = {}, whatsapp = {}, tokensData = {};

    if (results[0].status === 'fulfilled' && results[0].value.ok) {
        try { vistas = await results[0].value.json() || {}; } catch(e) {}
    }
    if (results[1].status === 'fulfilled' && results[1].value.ok) {
        try { whatsapp = await results[1].value.json() || {}; } catch(e) {}
    }
    if (results[2].status === 'fulfilled' && results[2].value.ok) {
        try { tokensData = await results[2].value.json() || {}; } catch(e) {}
    }

    // Convertir contadores (acepta {count: N} o N directamente)
    const vistasCont = {}, whatsappCont = {};
    Object.entries(vistas).forEach(([id, v]) => {
        vistasCont[id] = (typeof v === 'object' ? v.count : v) || 0;
    });
    Object.entries(whatsapp).forEach(([id, v]) => {
        whatsappCont[id] = (typeof v === 'object' ? v.count : v) || 0;
    });

    // Suscriptores: Firebase como fuente de verdad, contando dispositivos únicos
    const suscriptores = tmContarSuscriptoresUnicos(tokensData);
    // Sincronizar caché local con el valor real
    try { localStorage.setItem('tm_subscriber_count', String(suscriptores)); } catch(e) {}

    return { vistas: vistasCont, whatsapp: whatsappCont, suscriptores, tokensData };
}


// ── Limpiar tokens muertos de Firebase ──────────────────
// Usa dry_run=true: FCM valida los tokens sin enviar nada.
// Borra los que devuelven NotRegistered o InvalidRegistration.
// NOTA: antes había una rama que validaba tokens contra la Legacy FCM HTTP
// API (fcm.googleapis.com/fcm/send con "Authorization: key=..."). Google
// retiró ese endpoint por completo en junio de 2024 — esa rama solo fallaba
// con un error de HTTP siempre que hubiera una Server Key configurada, en
// vez de usar la limpieza por antigüedad (que sí funciona). Se quitó del
// todo y se dejó solo el criterio por antigüedad como único mecanismo.
async function tmLimpiarTokensInvalidos() {
    await _tmEnsureFirebaseConfig();
    const btnId  = 'tm-btn-limpiar';
    const infoId = 'tm-limpiar-info';
    const btn    = document.getElementById(btnId);
    const info   = document.getElementById(infoId);
    const notify = (msg, t = 'info') => {
        if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion(msg, t);
        if (info) {
            const col = t === 'success' ? '#25d366' : t === 'error' ? '#e74c3c' : '#f39c12';
            info.innerHTML = `<span style="color:${col}">${msg}</span>`;
        }
    };

    const base = _tmRtdbUrl();
    if (!base) { notify('⚠️ Firebase no configurado.', 'warning'); return; }
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Limpiando…'; }
    try {
        const res = await _tmFetch(`${base}/tokens.json`);
        if (!res.ok) throw new Error('No se pudo leer la base de datos');
        const tokensData = await res.json();
        if (!tokensData) { notify('✅ No hay tokens que limpiar.', 'success'); return; }
        const DIAS_45 = 45 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - DIAS_45;
        const viejos = Object.keys(tokensData).filter(k => {
            const t = tokensData[k];
            return t && t.timestamp && t.timestamp < cutoff;
        });
        if (viejos.length === 0) {
            notify('✅ No hay tokens viejos (>45 días). Todo limpio.', 'success');
        } else {
            await Promise.allSettled(viejos.map(k => fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })));
            notify(`✅ ${viejos.length} token${viejos.length>1?'s':''} eliminado${viejos.length>1?'s':''} (>45 días).`, 'success');
        }
    } catch(e) {
        notify('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🧹 Limpiar tokens inválidos'; }
    }
}
window.tmLimpiarTokensInvalidos = tmLimpiarTokensInvalidos;

// ── Borrar todas las entradas de un dispositivo específico ─
// fbKey: clave Firebase del registro principal (más seguro)
// fingerprint y token: para encontrar duplicados del mismo dispositivo
async function tmBorrarSuscriptor(fbKey, fingerprint, token) {
    const base = _tmRtdbUrl();
    if (!base) return;
    const res = await fetch(`${base}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const tokensData = await res.json() || {};
    const toDelete = Object.entries(tokensData).filter(([k, t]) => {
        if (!t || !t.token) return false;
        if (fbKey && k === fbKey) return true;
        if (fingerprint && t.fingerprint === fingerprint) return true;
        if (token && t.token === token) return true;
        return false;
    }).map(([k]) => k);
    await Promise.allSettled(toDelete.map(k =>
        fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })
    ));
    if (typeof window.mostrarNotificacion === 'function')
        window.mostrarNotificacion('✅ Suscriptor eliminado.', 'success');
    if (typeof window.tmAdminRefreshSubscribers === 'function') window.tmAdminRefreshSubscribers();
}
window.tmBorrarSuscriptor = tmBorrarSuscriptor;

// ── Borrar TODOS los suscriptores (reinicio completo) ──────
async function tmBorrarTodosSuscriptores() {
    if (!window.confirm('¿Borrar TODOS los suscriptores? Esta acción no se puede deshacer.\n\nLos clientes que vuelvan a activar notificaciones se registrarán de nuevo automáticamente.')) return;
    const base = _tmRtdbUrl();
    if (!base) { if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('⚠️ Firebase no configurado.', 'warning'); return; }
    const btn = document.getElementById('tm-btn-borrar-todos');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Borrando…'; }
    try {
        const res = await fetch(`${base}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo leer la base de datos');
        const tokensData = await res.json() || {};
        const keys = Object.keys(tokensData);
        if (keys.length === 0) {
            if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('✅ Ya no hay suscriptores.', 'success');
            return;
        }
        await Promise.allSettled(keys.map(k =>
            fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })
        ));
        if (typeof window.mostrarNotificacion === 'function')
            window.mostrarNotificacion(`✅ ${keys.length} suscriptor${keys.length > 1 ? 'es' : ''} eliminado${keys.length > 1 ? 's' : ''}. Lista reiniciada.`, 'success');
        if (typeof window.tmAdminRefreshSubscribers === 'function') window.tmAdminRefreshSubscribers();
    } catch(e) {
        if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🗑 Borrar todos'; }
    }
}
window.tmBorrarTodosSuscriptores = tmBorrarTodosSuscriptores;

// ── Fusionar entradas duplicadas (mismo dispositivo, varias claves) ─
async function tmLimpiarDuplicados() {
    await _tmEnsureFirebaseConfig();
    const base = _tmRtdbUrl();
    if (!base) { if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('⚠️ Firebase no configurado.', 'warning'); return; }
    const btnDedup = document.getElementById('tm-btn-dedup');
    if (btnDedup) { btnDedup.disabled = true; btnDedup.textContent = '⏳ Limpiando…'; }
    try {
        const res = await fetch(`${base}/tokens.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo leer la base de datos');
        const tokensData = await res.json() || {};
        const entries = Object.entries(tokensData).filter(([, t]) => t && t.token);
        // Por cada dispositivo, quedarse con la entrada más reciente
        const bestByDevice = {};
        entries.forEach(([k, t]) => {
            const dk = t.deviceId ? 'did:' + t.deviceId : t.fingerprint ? 'fp:' + t.fingerprint : 'tk:' + t.token;
            if (!bestByDevice[dk] || (t.timestamp || 0) > (bestByDevice[dk].ts || 0)) {
                bestByDevice[dk] = { key: k, ts: t.timestamp || 0 };
            }
        });
        const keepKeys = new Set(Object.values(bestByDevice).map(d => d.key));
        const deleteKeys = entries.filter(([k]) => !keepKeys.has(k)).map(([k]) => k);
        if (deleteKeys.length === 0) {
            if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('✅ Sin duplicados. Todo limpio.', 'success');
        } else {
            await Promise.allSettled(deleteKeys.map(k =>
                fetch(`${base}/tokens/${k}.json`, { method: 'DELETE' })
            ));
            if (typeof window.mostrarNotificacion === 'function')
                window.mostrarNotificacion(`✅ ${deleteKeys.length} entradas duplicadas eliminadas. Ahora cada suscriptor tiene exactamente 1 entrada.`, 'success');
        }
        if (typeof window.tmAdminRefreshSubscribers === 'function') window.tmAdminRefreshSubscribers();
    } catch(e) {
        if (typeof window.mostrarNotificacion === 'function') window.mostrarNotificacion('❌ Error: ' + e.message, 'error');
    } finally {
        if (btnDedup) { btnDedup.disabled = false; btnDedup.textContent = '🔁 Limpiar duplicados'; }
    }
}
window.tmLimpiarDuplicados = tmLimpiarDuplicados;
