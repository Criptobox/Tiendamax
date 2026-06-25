/* TiendaMax — Web Vitals snippet (ligero, inline, ~1.5KB)
   Mide LCP, FID, CLS y reporta a consola + localStorage para debug en 3G. */
(function() {
    if (typeof PerformanceObserver === 'undefined') return;
    var vitals = { lcp: 0, fid: 0, cls: 0, ttfb: 0, inp: 0 };
    var sent = false;

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

    window.addEventListener('pagehide', function() {
        if (sent) return;
        sent = true;
        if (vitals.lcp) _report('LCP', vitals.lcp);
        if (vitals.cls) _report('CLS', vitals.cls);
        if (vitals.inp) _report('INP', vitals.inp);
        _save();
    });
})();
