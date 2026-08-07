#!/usr/bin/env python3
"""
TiendaMax — Genera faq.json y faq.html a partir de:
  1) Un set fijo de preguntas base (las mismas 5 que ya vivían solo como
     JSON-LD invisible en index.html, sin página propia).
  2) Preguntas reales aprendidas por el agente de ventas (/agente/faq en
     Firebase RTDB), cuando se repiten lo suficiente como para ser señal
     real y no ruido de una sola conversación.

Por qué hacía falta el fix en firebase-rules.json: /agente no tenía ninguna
regla propia, así que heredaba ".read": false / ".write": false de la raíz
— tm-agent.src.js._saveToFirebase() llevaba guardando (o intentando
guardar) preguntas ahí desde que existe, pero cada PUT/PATCH fallaba en
silencio (catch vacío) por falta de permiso. Con la regla ya puesta, este
script puede leer /agente/faq.json y esta página deja de estar vacía de
verdad con el tiempo.

Ejecutar cada 6 horas desde GitHub Actions. No requiere
FIREBASE_SERVICE_ACCOUNT: /agente/faq es de lectura pública.

Salida: faq.json con forma:
  {
    "actualizado": "2026-07-19T12:00:00Z",
    "preguntas": [
      {"pregunta": "...", "respuesta": "...", "fuente": "fija"|"real", "count": 12},
      ...
    ]
  }
Y faq.html, página estática con las mismas preguntas + FAQPage JSON-LD.
"""
from __future__ import annotations
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from html import escape
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
JSON_OUT = ROOT / "faq.json"
HTML_OUT = ROOT / "faq.html"
TIMEOUT = 25
SITE = "https://tiendamax.org"

# Las respuestas fijas del FAQ. Es la ÚNICA fuente: build_faq.py regenera
# faq.json y faq.html en cada run, así que editar el JSON a mano se pierde en
# la siguiente ejecución sin que nadie se entere.
#
# Tienen que decir lo MISMO que Max. Cuando el bot pasó a explicar que la
# garantía no es universal, aquí seguía diciendo "todos los productos tienen
# garantía": la web y el chat contestándose distinto en la pregunta que más
# desconfianza genera.
BASE_FAQ = [
    {
        "pregunta": "¿Cómo compro en TiendaMax?",
        "respuesta": "Navega el catálogo o pídele a Max que te ayude. Dime qué buscas (ej. 'busca una cámara para exterior'), añádelo a tu lista de deseos o carrito desde el chat, y cuando estés listo escribe 'pedir todo mi carrito' para enviarte el pedido completo por WhatsApp.",
    },
    {
        "pregunta": "¿Qué métodos de pago aceptan?",
        "respuesta": "Aceptamos únicamente tres métodos de pago: efectivo en dólares (USD), efectivo en pesos cubanos (MN) y Zelle para pagos desde el extranjero. No aceptamos transferencias bancarias nacionales (BPA, BANMET, Bandec) ni pagos por EnZona o Transfermóvil.",
    },
    {
        "pregunta": "¿Cómo calculan el precio en MN?",
        "respuesta": "El precio en MN que ves en el catálogo ya está calculado con la tasa de cambio del día (elTOQUE) más un pequeño margen operativo. Ese es el monto exacto que pagarás contra entrega. No hay sorpresas ni cálculo adicional. El precio que ves es el precio que pagas.",
    },
    {
        "pregunta": "¿Puedo pagar con Zelle si estoy en Cuba?",
        "respuesta": "Sí, si tienes un familiar en Estados Unidos, puede pagar tu pedido por Zelle. Coordinamos el monto y los datos de la cuenta por WhatsApp. Una vez confirmado el pago, te enviamos el producto y tú no pagas nada al recibirlo.",
    },
    {
        "pregunta": "¿Aceptan EnZona o Transfermóvil?",
        "respuesta": "No, no trabajamos con EnZona ni Transfermóvil. Para mantener nuestros procesos ágiles y seguros, aceptamos únicamente efectivo USD, efectivo MN y Zelle desde el extranjero.",
    },
    {
        "pregunta": "¿Hacen envíos a domicilio?",
        "respuesta": "Sí, pero nuestra mensajería directa con pago contra entrega opera únicamente en el corredor desde Matanzas hasta Pinar del Río, incluyendo La Habana, Artemisa y Mayabeque. Si vives fuera de esta zona, escríbenos por WhatsApp para coordinar el envío a través de encomiendas externas.",
    },
    {
        "pregunta": "¿Hacen envíos a Santiago de Cuba, Holguín o Camagüey?",
        "respuesta": "Nuestra ruta de mensajería directa llega hasta Matanzas. Para las provincias del centro y oriente del país, coordinamos el envío por WhatsApp a través de agencias de encomiendas (como VíaCar o transporte por ómnibus) o con el transportista de tu confianza.",
    },
    {
        "pregunta": "¿Los productos tienen garantía?",
        "respuesta": "La garantía NO es universal. Aplica únicamente a los productos que lo indican específicamente en su ficha técnica. Además, cubre exclusivamente defectos técnicos o desperfectos de fábrica. No cubre daños por mal uso, golpes, quemaduras por variaciones de voltaje ni instalaciones incorrectas.",
    },
    {
        "pregunta": "¿Qué hago si mi producto tiene un defecto de fábrica?",
        "respuesta": "Si tu producto cuenta con garantía y presenta un defecto técnico de fábrica, escríbenos por WhatsApp dentro de las primeras 24 horas. Te pediremos que describas el problema y, si es posible, que nos envíes una foto o video. Evaluamos tu caso y coordinamos la solución más rápida.",
    },
    {
        "pregunta": "¿Puedo devolver un producto?",
        "respuesta": "Aceptamos devoluciones dentro de las 24 horas tras la entrega si el producto llega dañado, con defecto de fábrica, o no corresponde a lo pedido. No procede devolución por mal uso, golpes, quemaduras por voltaje o instalación incorrecta. Escríbenos por WhatsApp con fotos del estado.",
    },
    {
        "pregunta": "¿Venden módems para Nauta Hogar (ETECSA)?",
        "respuesta": "Actualmente no contamos con módem-routers que tengan el puerto RJ11 (la entrada de línea telefónica) necesario para la instalación inicial de Nauta Hogar con ETECSA. Estos equipos ADSL son provistos directamente por ETECSA, como el TP-Link TD-W8901N que ellos entregan. Sin embargo, sí tenemos routers y repetidores Wi-Fi para mejorar y ampliar la señal una vez que ETECSA te haya instalado su equipo.",
    },
    {
        "pregunta": "¿Cómo mejoro la señal de mi Nauta Hogar?",
        "respuesta": "Si ya tienes el módem-router de ETECSA instalado, puedes conectar uno de nuestros routers por cable a uno de los puertos LAN del equipo de ETECSA para crear una red Wi-Fi más rápida y estable con mejor cobertura. También tenemos repetidores Wi-Fi que amplifican la señal para que llegue a los cuartos donde el equipo de ETECSA no alcanza.",
    },
    {
        "pregunta": "¿Qué equipos son compatibles con Nauta Hogar?",
        "respuesta": "ETECSA utiliza módem-routers ADSL como el TP-Link TD-W8901N o equipos similares con puerto RJ11 para la conexión inicial. También existen equipos de terceros compatibles como el TP-Link Archer VR300 AC1200, pero actualmente no los tenemos en stock. Lo que sí tenemos son routers adicionales (sin puerto RJ11) que puedes conectar a los puertos LAN de tu equipo ETECSA para ampliar tu red Wi-Fi.",
    },
    {
        "pregunta": "¿Cómo conecto un router a mi equipo de ETECSA?",
        "respuesta": "Toma un cable de red (RJ45), conecta un extremo a un puerto LAN del módem-router de ETECSA y el otro extremo al puerto WAN de tu router nuevo. Luego configura el router nuevo con nombre de red y contraseña. Ya tienes Wi-Fi mejorado en toda la casa.",
    },
    {
        "pregunta": "¿Cuál es la tasa de cambio USD a MN?",
        "respuesta": "La tasa se actualiza diariamente desde elTOQUE (la referencia de tasa de cambio en Cuba) más un pequeño margen operativo. El precio en MN que ves en el catálogo ya incluye todo. Visita tiendamax.org para ver la tasa actual.",
    },
    {
        "pregunta": "¿Qué es elTOQUE?",
        "respuesta": "elTOQUE es la plataforma de referencia en Cuba para la tasa de cambio informal entre USD y MN (pesos cubanos). TiendaMax usa la tasa de elTOQUE como base para calcular los precios en MN, sumando un pequeño margen operativo.",
    },
    {
        "pregunta": "¿Tienen tienda física?",
        "respuesta": "No, TiendaMax es una tienda 100% online. No tenemos local físico abierto al público. Todo se gestiona por WhatsApp y te enviamos a la puerta de tu casa con mensajería.",
    },
    {
        "pregunta": "¿Cuál es el horario de atención?",
        "respuesta": "Atendemos de Lunes a Sábado, de 9:00am a 8:00pm (hora de Cuba). Los pedidos online se pueden hacer 24/7, pero las respuestas por WhatsApp son en horario de atención.",
    },
]

# Solo estos intents son preguntas de información general — SEARCH/DETAIL/
# COMPARE/CALCULATE son sobre un producto puntual (no generalizan a FAQ) y
# GREETING/FAREWELL/UNKNOWN son ruido conversacional, no preguntas.
INTENTS_FAQ = {"HOURS", "LOCATION", "PAYMENT", "RETURNS", "SHIPPING", "WARRANTY", "HELP", "WHATSAPP"}

MIN_COUNT = 3
MIN_QUERY_LEN = 8
MAX_LEARNED = 15


def _atomic_write(path: Path, content: str) -> None:
    tmp = path.parent / f".{path.name}.tmp"
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _database_url() -> str | None:
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        fb = cfg.get("firebaseConfig") or {}
        return fb.get("databaseURL") or (
            f"https://{fb['projectId']}-default-rtdb.firebaseio.com"
            if fb.get("projectId") else None
        )
    except Exception as exc:
        print(f"❌ No se pudo leer databaseURL de config.json: {exc}", file=sys.stderr)
        return None


def _fetch_json(url: str) -> dict | None:
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": "TiendaMax-build-faq/1.0"})
        if not r.ok:
            print(f"  HTTP {r.status_code} en {url}", file=sys.stderr)
            return None
        return r.json()
    except Exception as exc:
        print(f"  Error fetching {url}: {exc}", file=sys.stderr)
        return None


def _clean_text(s: str, max_len: int) -> str:
    s = re.sub(r"\s+", " ", (s or "")).strip()
    if len(s) > max_len:
        s = s[:max_len].rstrip() + "…"
    return s


def _normaliza(s: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", (s or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", sin_acentos.lower())


def _preguntar(s: str) -> str:
    s = s.strip()
    if not s:
        return s
    s = s[0].upper() + s[1:]
    if not s.endswith(("?", "¿")):
        s = s.rstrip(".!") + "?"
    if not s.startswith("¿"):
        s = "¿" + s
    return s


def build_preguntas(raw_faq: dict | None) -> list[dict]:
    preguntas = [dict(p, fuente="fija", count=0) for p in BASE_FAQ]
    vistos = {_normaliza(p["pregunta"]) for p in preguntas}

    aprendidas = []
    if isinstance(raw_faq, dict):
        for entry in raw_faq.values():
            if not isinstance(entry, dict):
                continue
            intent = str(entry.get("intent") or "").upper()
            if intent not in INTENTS_FAQ:
                continue
            count = entry.get("count")
            try:
                count = int(count)
            except (TypeError, ValueError):
                continue
            if count < MIN_COUNT:
                continue
            query = str(entry.get("query") or "").strip()
            respuesta = str(entry.get("lastResponse") or "").strip()
            if len(query) < MIN_QUERY_LEN or not respuesta:
                continue
            pregunta = _preguntar(_clean_text(query, 140))
            clave = _normaliza(pregunta)
            if clave in vistos:
                continue
            vistos.add(clave)
            aprendidas.append({
                "pregunta": pregunta,
                "respuesta": _clean_text(respuesta, 220),
                "fuente": "real",
                "count": count,
            })

    aprendidas.sort(key=lambda p: p["count"], reverse=True)
    preguntas.extend(aprendidas[:MAX_LEARNED])
    return preguntas


FAQ_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Preguntas frecuentes — TiendaMax</title>
<meta name="description" content="Cómo comprar, métodos de pago, envíos y garantía en TiendaMax. Respuestas a las preguntas reales que más nos hacen por WhatsApp.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{page_url}">

<meta property="og:type" content="website">
<meta property="og:title" content="Preguntas frecuentes — TiendaMax">
<meta property="og:description" content="Cómo comprar, métodos de pago, envíos y garantía en TiendaMax.">
<meta property="og:url" content="{page_url}">
<meta property="og:site_name" content="TiendaMax">
<meta property="og:locale" content="es_CU">

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{items_jsonld}]
}}
</script>

<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0C0806;color:#fff;min-height:100vh}}
  a{{color:inherit;text-decoration:none}}
  .tm-hdr{{display:flex;align-items:center;padding:14px 20px;background:#0D0806;border-bottom:1px solid rgba(201,169,110,.15)}}
  .tm-logo{{font-size:20px;font-weight:800;letter-spacing:-.5px}}
  .tm-logo .t{{color:#C9A96E}}.tm-logo .m{{color:#FF6B35}}
  .tm-back{{margin-left:auto;font-size:13px;color:#C9A96E;border:1px solid rgba(201,169,110,.3);padding:6px 14px;border-radius:20px;white-space:nowrap}}
  .tm-wrap{{max-width:760px;margin:0 auto;padding:28px 16px 60px}}
  h1{{font-size:clamp(22px,4vw,30px);font-weight:800;margin-bottom:8px}}
  .tm-sub{{color:#a09080;font-size:14px;margin-bottom:24px}}
  .tm-cta{{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:12px;font-size:14px;font-weight:700;background:linear-gradient(135deg,#FF6B35,#E8501E);color:#fff;margin-bottom:28px}}
  .tm-faq-list{{display:flex;flex-direction:column;gap:10px}}
  .tm-faq-item{{background:#181310;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:16px 18px}}
  .tm-faq-q{{font-size:15px;font-weight:700;margin-bottom:6px;color:#C9A96E}}
  .tm-faq-a{{font-size:13.5px;line-height:1.55;color:#d8d0c8}}
  .tm-ftr{{text-align:center;padding:24px 16px;color:#555;font-size:12px;border-top:1px solid rgba(255,255,255,.06);margin-top:12px}}
  .tm-ftr a{{color:#C9A96E}}
</style>
</head>
<body>

<header class="tm-hdr">
  <a href="{site}" class="tm-logo"><span class="t">TIENDA</span><span class="m">MAX</span></a>
  <a href="{site}" class="tm-back">← Ver catálogo</a>
</header>

<div class="tm-wrap">
  <h1>❓ Preguntas frecuentes</h1>
  <p class="tm-sub">Respuestas rápidas a lo que más nos preguntan por WhatsApp. ¿No está tu duda? Escríbenos directo.</p>
  <a href="{wa_url}" class="tm-cta">💬 Preguntar por WhatsApp</a>
  <div class="tm-faq-list">
    {items_html}
  </div>
</div>

<footer class="tm-ftr">
  <a href="{site}">tiendamax.org</a> &middot; Todos los derechos reservados
</footer>

</body>
</html>
"""


def _whatsapp_url() -> str:
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        numero = cfg.get("whatsapp") or cfg.get("telefono") or cfg.get("numeroWhatsApp") or "5354320170"
    except Exception:
        numero = "5354320170"
    import urllib.parse
    texto = urllib.parse.quote("Hola, tengo una pregunta sobre TiendaMax.")
    return f"https://wa.me/{numero}?text={texto}"


def render_html(preguntas: list[dict]) -> str:
    items_html = "\n    ".join(
        f'<div class="tm-faq-item"><div class="tm-faq-q">{escape(p["pregunta"])}</div>'
        f'<div class="tm-faq-a">{escape(p["respuesta"])}</div></div>'
        for p in preguntas
    )
    items_jsonld = ",\n".join(
        json.dumps({
            "@type": "Question",
            "name": p["pregunta"],
            "acceptedAnswer": {"@type": "Answer", "text": p["respuesta"]},
        }, ensure_ascii=False)
        for p in preguntas
    )
    return FAQ_PAGE_TEMPLATE.format(
        page_url=f"{SITE}/faq.html",
        site=SITE,
        wa_url=_whatsapp_url(),
        items_html=items_html,
        items_jsonld=items_jsonld,
    )


def main() -> int:
    base = _database_url()
    raw_faq = None
    if base:
        print(f"↪ Descargando preguntas aprendidas desde {base}/agente/faq.json ...")
        raw_faq = _fetch_json(f"{base}/agente/faq.json")
    else:
        print("⚠️ Sin databaseURL — solo se usarán las preguntas fijas.", file=sys.stderr)

    preguntas = build_preguntas(raw_faq)

    out = {
        "actualizado": datetime.now(timezone.utc).isoformat(),
        "preguntas": preguntas,
    }
    json_content = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    html_content = render_html(preguntas)

    changed = False
    old_json = JSON_OUT.read_text(encoding="utf-8") if JSON_OUT.exists() else ""
    if json_content != old_json:
        _atomic_write(JSON_OUT, json_content)
        changed = True
    old_html = HTML_OUT.read_text(encoding="utf-8") if HTML_OUT.exists() else ""
    if html_content != old_html:
        _atomic_write(HTML_OUT, html_content)
        changed = True

    if not changed:
        print("ℹ️ Sin cambios en faq.json/faq.html.")
        return 0

    aprendidas = sum(1 for p in preguntas if p["fuente"] == "real")
    print(f"✅ faq.json/faq.html escritos: {len(preguntas)} preguntas ({aprendidas} aprendidas del agente).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
