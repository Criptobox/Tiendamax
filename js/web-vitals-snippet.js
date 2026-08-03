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

    /* Envía la muestra. sendBeacon sobrevive al cierre de la pestaña, que es
       justo cuando se dispara esto; fetch con keepalive es el plan B. Va por
       POST para que Firebase genere la clave: así dos visitas simultáneas no
       se pisan (nada de leer-modificar-escribir). */
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
            ts: Date.now()
        };
        var conn = _conexion();
        if (conn) payload.conn = conn;
        var cuerpo = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([cuerpo], { type: 'application/json' });
                if (navigator.sendBeacon(url, blob)) return;
            }
        } catch(e) {}
        try {
            fetch(url, {
                method: 'POST', keepalive: true,
                headers: { 'Content-Type': 'application/json' }, body: cuerpo
            }).catch(function() {});
        } catch(e) {}
    }

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
