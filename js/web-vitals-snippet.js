/* TiendaMax — Web Vitals snippet (ligero, inline, ~1.5KB)
   Mide LCP, FID, CLS y reporta a consola + localStorage para debug en 3G.
   Además manda una muestra a Firebase /web_vitals para que el agente de salud
   vea números reales de usuarios en Cuba, no solo lo que dice Lighthouse desde
   un datacenter. Antes esto se quedaba en el localStorage del visitante, o sea:
   no servía para nada salvo abrir la consola en el propio teléfono. */
(function() {
    if (typeof PerformanceObserver === 'undefined') return;
    var vitals = { lcp: 0, fid: 0, cls: 0, ttfb: 0, inp: 0 };
    var sent = false;

    // ── Muestreo ────────────────────────────────────────────────
    // Solo 1 de cada ~8 visitas reporta. Con todo el tráfico escribiendo, el
    // nodo crecería sin control y no aportaría nada: para un p75 sobran unas
    // decenas de muestras al día. La decisión se guarda en sessionStorage para
    // que una misma sesión no reporte a veces sí y a veces no según la página.
    var MUESTREO = 0.125;

    function _esAdmin() {
        // Mismo criterio que analytics.js: el PAT solo existe si configuraste
        // el panel. Las visitas de prueba del admin ensucian las métricas.
        try { return !!localStorage.getItem('githubToken'); } catch(e) { return false; }
    }

    function _enMuestra() {
        if (_esAdmin()) return false;
        try {
            var v = sessionStorage.getItem('tm_wv_sample');
            if (v === null) {
                v = (Math.random() < MUESTREO) ? '1' : '0';
                sessionStorage.setItem('tm_wv_sample', v);
            }
            return v === '1';
        } catch(e) { return false; }
    }

    var enMuestra = _enMuestra();

    // ── Config de Firebase ──────────────────────────────────────
    // Se lee de localStorage, que es donde analytics.js/tm-config ya la dejan.
    // Si todavía no está y esta visita sí toca reportar, se pide config.json
    // sin bloquear nada; si falla, simplemente no se reporta.
    function _rtdbUrl() {
        try {
            var cfg = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
            if (cfg.databaseURL) return cfg.databaseURL;
            if (cfg.projectId) return 'https://' + cfg.projectId + '-default-rtdb.firebaseio.com';
        } catch(e) {}
        return null;
    }

    if (enMuestra && !_rtdbUrl()) {
        try {
            fetch('config.json', { cache: 'force-cache' })
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(d) {
                    var cfg = d && d.firebaseConfig;
                    if (cfg && (cfg.databaseURL || cfg.projectId)) {
                        localStorage.setItem('firebaseConfig', JSON.stringify(cfg));
                    }
                })
                .catch(function() {});
        } catch(e) {}
    }

    function _conexion() {
        try {
            var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return (c && c.effectiveType) ? String(c.effectiveType).slice(0, 10) : '';
        } catch(e) { return ''; }
    }

    /* Envía la muestra por POST para que Firebase genere la clave: así dos
       visitas simultáneas no se pisan (nada de leer-modificar-escribir).
       fetch con keepalive sobrevive al cierre de la pestaña igual que
       sendBeacon, y además dice si el servidor la aceptó. */
    function _enviar() {
        if (!enMuestra) return;
        var base = _rtdbUrl();
        if (!base || !vitals.lcp) return;   // sin LCP la muestra no dice nada
        var dia = new Date().toISOString().slice(0, 10);
        var url = base + '/web_vitals/' + dia + '.json';
        var payload = {
            lcp: Math.round(vitals.lcp),
            cls: Math.round(vitals.cls * 1000) / 1000,
            inp: Math.round(vitals.inp),
            ttfb: Math.round(vitals.ttfb),
            // La hora la pone el SERVIDOR. Antes iba Date.now(), o sea el reloj
            // del visitante, y la regla exige que caiga en una ventana de 5
            // minutos: cualquier teléfono con la hora desfasada —aquí son
            // muchos— quedaba fuera y su muestra se perdía sin que nadie se
            // enterase. {".sv":"timestamp"} lo resuelve Firebase al escribir,
            // así que también cumple la regla vieja: no hace falta republicar.
            ts: { '.sv': 'timestamp' }
        };
        var conn = _conexion();
        if (conn) payload.conn = conn;
        var cuerpo = JSON.stringify(payload);
        // fetch va PRIMERO aunque sendBeacon exista: keepalive da la misma
        // garantía al cerrar la pestaña y además dice si el servidor aceptó.
        // Con sendBeacon el rechazo era invisible —devuelve true por haberlo
        // encolado, no por haberlo entregado—, así que un 401 por reglas sin
        // publicar dejaba la métrica muerta durante meses sin una sola pista.
        try {
            fetch(url, {
                method: 'POST', keepalive: true,
                headers: { 'Content-Type': 'application/json' }, body: cuerpo
            }).then(function(r) {
                _recordarEnvio(r.ok ? null : ('HTTP ' + r.status));
            }).catch(function(e) {
                _recordarEnvio('red: ' + ((e && e.message) || 'error'));
            });
            return;
        } catch(e) {}
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([cuerpo], { type: 'application/json' });
                navigator.sendBeacon(url, blob);
            }
        } catch(e) {}
    }

    /* Deja el resultado del último envío a mano. Queda en el dispositivo del
       visitante, no en el del admin —sus visitas no reportan a propósito—, así
       que para diagnosticar está tmWebVitalsProbar() de abajo. */
    function _recordarEnvio(error) {
        try {
            window.tmWebVitalsEstado = { ts: Date.now(), ok: !error, error: error || null };
            localStorage.setItem('tm_wv_envio', JSON.stringify(window.tmWebVitalsEstado));
        } catch(e) {}
    }

    /* Prueba de escritura a mano, desde la consola del navegador:
           await tmWebVitalsProbar()
       El agente de salud avisa cuando hay 0 muestras, pero solo puede
       sospechar la causa: desde el servidor no se distingue "poco tráfico" de
       "las reglas rechazan todas las escrituras". Esto la responde en un
       segundo, y funciona también con el panel configurado (el muestreo y la
       exclusión del admin no aplican aquí: es una prueba, no una muestra). */
    window.tmWebVitalsProbar = function() {
        var base = _rtdbUrl();
        if (!base) return Promise.resolve({ ok: false, error: 'sin config de Firebase' });
        var dia = new Date().toISOString().slice(0, 10);
        return fetch(base + '/web_vitals/' + dia + '.json', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lcp: 1, cls: 0, inp: 0, ttfb: 1, ts: { '.sv': 'timestamp' }, conn: 'test' })
        }).then(function(r) {
            return r.text().then(function(t) {
                return {
                    ok: r.ok, status: r.status, respuesta: t.slice(0, 200),
                    diagnostico: r.ok
                        ? 'Las reglas de /web_vitals están publicadas y aceptan escrituras. Si el agente sigue diciendo 0 muestras, es que hay poco tráfico (solo reporta 1 de cada 8 visitas).'
                        : 'Firebase rechaza la escritura. Copia el bloque "web_vitals" de firebase-rules.json en Reglas de la consola de Firebase y publícalas.'
                };
            });
        }).catch(function(e) {
            return { ok: false, error: String((e && e.message) || e),
                     diagnostico: 'No se pudo ni conectar. Mira la consola por si es CORS o la red.' };
        });
    };

    function _save() {
        try {
            var prev = JSON.parse(localStorage.getItem('tm_web_vitals') || '{}');
            prev.last = vitals;
            prev.ts = Date.now();
            localStorage.setItem('tm_web_vitals', JSON.stringify(prev));
        } catch(e) {}
    }

    function _report(label, value) {
        var rating = value < 2500 ? '🟢' : value < 4000 ? '🟡' : '🔴';
        if (label === 'CLS') rating = value < 0.1 ? '🟢' : value < 0.25 ? '🟡' : '🔴';
        if (label === 'FID' || label === 'INP') rating = value < 100 ? '🟢' : value < 300 ? '🟡' : '🔴';
        if (label === 'TTFB') rating = value < 800 ? '🟢' : value < 1800 ? '🟡' : '🔴';
        console.log(rating + ' Web Vitals — ' + label + ': ' + Math.round(value) + (label === 'CLS' ? '' : 'ms'));
    }

    try {
        var lcpObs = new PerformanceObserver(function(list) {
            var entries = list.getEntries();
            if (entries.length) {
                vitals.lcp = entries[entries.length - 1].startTime;
            }
        });
        lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch(e) {}

    try {
        var fidObs = new PerformanceObserver(function(list) {
            var entries = list.getEntries();
            if (entries.length) {
                vitals.fid = entries[0].processingStart - entries[0].startTime;
                _report('FID', vitals.fid);
            }
        });
        fidObs.observe({ type: 'first-input', buffered: true });
    } catch(e) {}

    try {
        var inpObs = new PerformanceObserver(function(list) {
            var entries = list.getEntries();
            if (entries.length) {
                var max = 0;
                entries.forEach(function(e) {
                    var d = e.processingStart ? (e.processingEnd - e.startTime) : 0;
                    if (d > max) max = d;
                });
                vitals.inp = max;
            }
        });
        inpObs.observe({ type: 'event', buffered: true });
    } catch(e) {}

    try {
        var clsObs = new PerformanceObserver(function(list) {
            var entries = list.getEntries();
            entries.forEach(function(e) {
                if (!e.hadRecentInput) vitals.cls += e.value;
            });
        });
        clsObs.observe({ type: 'layout-shift', buffered: true });
    } catch(e) {}

    try {
        var nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
            vitals.ttfb = nav.responseStart - nav.requestStart;
            _report('TTFB', vitals.ttfb);
        }
    } catch(e) {}

    function _cerrar() {
        if (sent) return;
        sent = true;
        if (vitals.lcp) _report('LCP', vitals.lcp);
        if (vitals.cls) _report('CLS', vitals.cls);
        if (vitals.inp) _report('INP', vitals.inp);
        _save();
        _enviar();
    }

    // En móvil el navegador puede matar la pestaña sin disparar 'pagehide'
    // (cambiar de app, bloquear la pantalla); 'visibilitychange' a hidden sí
    // llega. Se escuchan los dos y el flag `sent` evita el envío doble.
    window.addEventListener('pagehide', _cerrar);
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') _cerrar();
    });
})();
