#!/usr/bin/env python3
"""
TiendaMax — auditoría de rendimiento de un solo uso.

Abre tiendamax.org con un Chromium real (mismo motor que Android/iOS),
simula un teléfono de gama media en red 4G lenta, y mide lo mismo que
mide Chrome DevTools: peso por tipo de archivo, backdrop-filter activo,
nodos del DOM, scripts que bloquean el render, tareas largas (jank),
LCP y CLS.

Se borra después de usarse — no es parte del pipeline normal.
"""
import json
import sys

from playwright.sync_api import sync_playwright

URL = "https://tiendamax.org/"

# JS que corre DENTRO de la página cargada — misma lógica que el bookmarklet
# de auditoría, pero devuelve datos en vez de pintar un overlay.
AUDIT_JS = """
async () => {
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  const res = performance.getEntriesByType('resource');
  const byType = {};
  let totalKB = 0;
  res.forEach(e => {
    const ext = (e.name.split('?')[0].split('.').pop() || 'otro').toLowerCase();
    const cat = /^js$/.test(ext) ? 'JS' : /^css$/.test(ext) ? 'CSS' :
      /^(png|jpe?g|webp|gif|svg|ico)$/.test(ext) ? 'Imagenes' :
      /^json$/.test(ext) ? 'JSON' :
      /^(woff2?|ttf|otf)$/.test(ext) ? 'Fuentes' : 'Otro';
    const sz = (e.transferSize || e.encodedBodySize || 0) / 1024;
    if (!byType[cat]) byType[cat] = { n: 0, kb: 0, big: [] };
    byType[cat].n++;
    byType[cat].kb += sz;
    totalKB += sz;
    if (sz > 80) byType[cat].big.push(e.name.split('/').pop().split('?')[0] + ' - ' + Math.round(sz) + 'KB');
  });

  let bdCount = 0;
  const bdEls = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bf && bf !== 'none') {
      bdCount++;
      if (bdEls.length < 15) {
        const cls = el.className && el.className.split ? el.className.split(' ')[0] : '';
        bdEls.push(el.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      }
    }
  });

  const domNodes = document.getElementsByTagName('*').length;
  const blocking = Array.from(document.scripts)
    .filter(s => s.src && !s.async && !s.defer && s.type !== 'lazyload')
    .map(s => s.src.split('/').pop().split('?')[0]);

  const vitals = {};
  let clsTotal = 0;
  const longTasks = [];
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => { vitals.LCP = Math.round(e.startTime); });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => { if (!e.hadRecentInput) clsTotal += e.value; });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => longTasks.push(Math.round(e.duration)));
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}

  await wait(1500);
  vitals.CLS = clsTotal;

  const nav = performance.getEntriesByType('navigation')[0] || {};
  return {
    totalKB: Math.round(totalKB),
    requests: res.length,
    byType,
    backdropFilterCount: bdCount,
    backdropFilterEls: bdEls,
    domNodes,
    blockingScripts: blocking,
    longTasks,
    vitals,
    ttfbMs: nav.responseStart ? Math.round(nav.responseStart) : null,
    domContentLoadedMs: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadMs: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
  };
}
"""


def main() -> int:
    console_errors = []
    failed_requests = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        # Galaxy A-series / gama media: viewport chico, DPR 2.5, red 4G lenta y
        # CPU 4x más lenta que una laptop — así se siente en el bolsillo real.
        context = browser.new_context(
            viewport={"width": 384, "height": 800},
            device_scale_factor=2.5,
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (Linux; Android 12; SM-A135M) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
            ),
        )
        page = context.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on(
            "response",
            lambda r: failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None,
        )

        cdp = context.new_cdp_session(page)
        cdp.send("Network.enable")
        cdp.send(
            "Network.emulateNetworkConditions",
            {
                "offline": False,
                "downloadThroughput": 1.6 * 1024 * 1024 / 8,  # ~1.6 Mbps, 4G lento
                "uploadThroughput": 0.75 * 1024 * 1024 / 8,
                "latency": 150,
            },
        )
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})

        try:
            page.goto(URL, wait_until="load", timeout=60000)
        except Exception as e:
            print(f"❌ No se pudo cargar {URL}: {e}", file=sys.stderr)
            return 1

        page.wait_for_timeout(2000)
        report = page.evaluate(AUDIT_JS)
        browser.close()

    report["consoleErrors"] = console_errors[:10]
    report["failedRequests"] = failed_requests[:10]

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
