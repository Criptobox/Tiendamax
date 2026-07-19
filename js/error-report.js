/* TiendaMax — reporte de errores JS en producción.
   Sin esto, si algo se rompe para un cliente real, nadie se entera salvo
   que se queje. Captura excepciones/promesas rechazadas y las manda a
   Firebase (/errores_js) para verlas en el admin → Analytics.
   Con límite por sesión para no generar tráfico/costo si algo entra en bucle. */
(function () {
    'use strict';
    var MAX_POR_SESION = 5;
    var enviados = 0;

    function rtdbBase() {
        try {
            var c = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
            return c.databaseURL || (c.projectId ? 'https://' + c.projectId + '-default-rtdb.firebaseio.com' : null);
        } catch (e) { return null; }
    }

    function reportar(mensaje, stack) {
        if (enviados >= MAX_POR_SESION) return;
        var base = rtdbBase();
        if (!base) return;
        enviados++;
        var id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var payload = {
            mensaje: String(mensaje || 'Error desconocido').slice(0, 300),
            pagina: location.pathname.slice(0, 200),
            ts: Date.now(),
            ua: (navigator.userAgent || '').slice(0, 200)
        };
        if (stack) payload.stack = String(stack).slice(0, 500);
        var ctrl = new AbortController();
        var tid = setTimeout(function () { ctrl.abort(); }, 6000);
        fetch(base + '/errores_js/' + id + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal
        }).catch(function () {}).finally(function () { clearTimeout(tid); });
    }

    window.addEventListener('error', function (e) {
        reportar(e.message, e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', function (e) {
        var r = e.reason;
        reportar(r && r.message ? r.message : String(r), r && r.stack);
    });
})();
