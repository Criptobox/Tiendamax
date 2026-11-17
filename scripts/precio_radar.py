#!/usr/bin/env python3
"""
TiendaMax — Radar de precios.
Compara los precios de los productos que elegiste en el panel (📡 Radar → «Qué
vigilar», guardados en radar-vigilar.json) con el mercado cubano (Revolico, Porlalivre, lelespc), 1×/día. Guarda resultado e historial
en radar.json y te manda un push de resumen al admin.

Diseño defensivo: si una fuente o un producto falla, se ignora y se sigue — NUNCA
rompe la corrida. Los parsers son v1 (best-effort): se afinan tras la 1ª corrida real
viendo qué devuelve cada sitio. Ejecutar en GitHub Actions (allí sí hay internet).
"""
from __future__ import annotations
import json, os, re, sys, time, statistics, datetime, unicodedata, hashlib, html


def _norm(s):
    """minúsculas y sin acentos, para comparar títulos de anuncios cubanos."""
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "radar.json")
# La lista la escribe el panel. Antes se marcaba con radar:true dentro de
# productos.json, pero el panel no tenía ningún botón para ponerlo: los cinco
# que había se quedaron agotados y el radar enseñaba una pantalla vacía.
VIGILAR = os.path.join(ROOT, "radar-vigilar.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
FUENTES = ["revolico", "porlalivre", "lelespc"]
MAX_PROD = 40          # tope de productos vigilados por corrida (respetuoso)
PAUSA = 1.5            # segundos entre peticiones (no agresivo)
HIST_DIAS = 14
MAX_DIAS = 7  # solo anuncios de la última semana


def _edad_dias(texto):
    """Antigüedad del anuncio en días desde texto tipo 'Hace 3 días', 'Hoy', 'Ayer'.
    Devuelve None si no se puede determinar (en ese caso NO se descarta el anuncio)."""
    t = (texto or "").lower()
    if "hoy" in t or re.search(r"hace\s+\d+\s*(min|hora)", t):
        return 0
    if "ayer" in t:
        return 1
    m = re.search(r"hace\s+(\d+)\s*d[ií]a", t)
    if m:
        return int(m.group(1))
    m = re.search(r"hace\s+(\d+)\s*semana", t)
    if m:
        return int(m.group(1)) * 7
    m = re.search(r"hace\s+(\d+)\s*mes", t)
    if m:
        return int(m.group(1)) * 30
    return None

STOP = {"de","la","el","los","las","con","para","y","o","a","en","un","una","por",
        "del","al","pro","plus","new","nuevo","nueva","original","2","3","4"}


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def tasa_base():
    cfg = load_json(os.path.join(ROOT, "config.json"), {}) or {}
    try:
        return float(cfg.get("tasaMN") or 0) or None
    except Exception:
        return None


def keywords(nombre):
    t = re.sub(r"[^\wáéíóúñ ]", " ", (nombre or "").lower())
    toks = [w for w in t.split() if len(w) > 2 and w not in STOP]
    return toks[:5]


def query_de(nombre):
    return " ".join(keywords(nombre)) or (nombre or "").strip()


def coincide(prod_kw, titulo):
    """Coincidencia estricta: comparte >=2 palabras clave Y al menos una distintiva
    (>=5 letras, p. ej. marca/modelo), para no enganchar por palabras genéricas."""
    t = _norm(titulo)
    matched = [k for k in prod_kw if _norm(k) in t]
    if len(prod_kw) <= 1:
        return len(matched) >= 1
    distintiva = any(len(_norm(k)) >= 5 for k in matched)
    return len(matched) >= 2 and distintiva


# ── Cifras y modelos ─────────────────────────────────────────────────────────
# Dos palabras en común bastaban para dar un anuncio por bueno, y en este
# catálogo «cargador» + «baterías» lo comparten el de 20A y el de 30A: el radar
# enseñaba el precio del de 20A como competencia del de 30A. La cifra con su
# unidad (30a, 4000w, 12v, 60ah) y el modelo (m5, ac3) son lo único que separa
# un producto de su hermano, igual que en el buscador de Max.
_UNIDADES = [
    (r"amperios?\s*hora|ah", "ah"),       # antes que «amperios», o 60 amperios hora sería 60A
    (r"amperios?|amperes?|amps?", "a"),
    (r"vatios|watts?", "w"),
    (r"voltios?|volts?", "v"),
    (r"pulgadas?|\"|''", "in"),
    (r"puertos?", "p"),
]


_MAYOR_MANDA = {"gb", "tb"}


def _cifras_texto(texto):
    """{unidad: {valores}} de un texto: '30A' / '30 amperios' → {'a': {'30'}}."""
    t = _norm(texto)
    for pat, u in _UNIDADES:
        t = re.sub(r"(\d+(?:[.,]\d+)?)\s*(?:" + pat + r")\b", lambda m: m.group(1).replace(",", ".") + u + " ", t)
    out = {}
    for num, u in re.findall(r"\b(\d+(?:\.\d+)?)(a|w|v|ah|in|p|kw|kva|mah|gb|tb|mbps)\b", t):
        out.setdefault(u, set()).add(num)
    return out


def _modelos_texto(texto):
    """Designadores letra+cifra cortos (m5, ac3, ax3, x5): {prefijo: {modelo}}."""
    t = _norm(texto)
    out = {}
    for m in re.findall(r"\b([a-z]{1,3})(\d{1,3})\b", t):
        if m[0] in ("a", "w", "v", "ah", "in", "p", "kw", "mah", "gb", "tb"):
            continue                        # eso es una cifra con unidad, no un modelo
        out.setdefault(m[0], set()).add(m[0] + m[1])
    return out


def mismo_modelo(nombre, titulo):
    """False si el anuncio dice OTRA cifra en una unidad que el producto declara
    (20A en el de 30A, 3500W en el de 4000W) u otro modelo con el mismo prefijo
    (m2 en el m5). Si el anuncio no dice la cifra, no se descarta por eso."""
    pc, tc = _cifras_texto(nombre), _cifras_texto(titulo)
    for u, vals in pc.items():
        if u not in tc:
            continue
        if u in _MAYOR_MANDA:
            # «128GB / 8GB RAM» y «64GB + 8GB RAM» comparten el 8: lo que
            # distingue el teléfono es la cifra grande, la memoria.
            if max(map(float, vals)) != max(map(float, tc[u])):
                return False
        elif not (tc[u] & vals):
            return False
    pm, tm = _modelos_texto(nombre), _modelos_texto(titulo)
    for pre, vals in pm.items():
        if pre in tm and not (tm[pre] & vals):
            return False
    return True


# Un precio con su moneda. Los miles se escriben también con espacio
# («280 000 CUP»): sin esto se leía «280» y, sin moneda, valía 280 dólares.
_NUM = r"(?:\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,2})?|\d[\d.,]{1,9})"
PRECIO_TXT_RE = re.compile(r"\$?\s*" + _NUM + r"\s*(?:USD|CUP|MN|MLC)?", re.I)
PRECIO_RE = re.compile(r"(\d[\d.,]{1,9})\s*(usd|cup|mn|mlc|\$)?", re.I)


def parse_precio(texto, rate):
    """{'usd', 'moneda', 'orig'} o None. `orig` es la cifra tal como la escribió
    el anunciante y `moneda` ('USD' | 'CUP' | 'MLC') la suya: un anuncio en CUP
    se convierte a USD con la tasa de la tienda SOLO para poder compararlo, y el
    panel lo dice (antes se convertía sin avisar y un anuncio de 280 000 CUP
    parecía un precio en dólares como los demás)."""
    if not texto:
        return None
    s = texto.replace("\xa0", " ").strip().lower()
    cur = "USD"
    if "cup" in s or " mn" in s or s.endswith("mn"):
        cur = "CUP"
    elif "mlc" in s:
        cur = "MLC"
    m = re.search(_NUM, s) or re.search(r"\d[\d.,]{0,12}", s)
    if not m:
        return None
    raw = re.sub(r"[^\d.,]", "", m.group(0))   # los espacios de miles se van aquí
    try:
        # ".dd"/",dd" final (1-2 dígitos) = decimales; el resto, miles
        dm = re.search(r"^(.*\d)[.,](\d{1,2})$", raw)
        if dm and re.sub(r"[^\d]", "", dm.group(1)):
            val = float(re.sub(r"[^\d]", "", dm.group(1)) + "." + dm.group(2))
        else:
            val = float(re.sub(r"[^\d]", "", raw) or 0)
    except Exception:
        return None
    if val <= 0:
        return None
    usd = val
    if cur == "CUP":
        if not rate:
            return None
        usd = val / rate
    # mlc ~ usd; usd as-is
    if usd < 1 or usd > 100000:
        return None
    return {"usd": round(usd, 2), "moneda": cur, "orig": round(val, 2)}


def parse_precio_usd(texto, rate):
    """Devuelve precio en USD (aprox) o None. Convierte CUP/MN con la tasa base."""
    p = parse_precio(texto, rate)
    return p["usd"] if p else None


def _get(url, params=None):
    import requests
    return requests.get(url, params=params, headers={"User-Agent": UA,
        "Accept-Language": "es"}, timeout=15)


# ── Parsers v1 (AJUSTAR tras la 1ª corrida real con HTML de muestra) ──────────
def scrape_revolico(query, rate):
    from bs4 import BeautifulSoup
    r = _get("https://www.revolico.com/search", {"q": query})
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for a in soup.select("a[href*='/item/'], li a"):
        titulo = a.get_text(" ", strip=True)
        if not titulo or len(titulo) < 6:
            continue
        cont = a.find_parent()
        precio_txt = ""
        if cont:
            pm = PRECIO_TXT_RE.search(cont.get_text(" ", strip=True))
            if pm:
                precio_txt = pm.group(0)
        pp = parse_precio(precio_txt, rate)
        usd = pp["usd"] if pp else None
        if usd:
            href = a.get("href", "")
            url = href if href.startswith("http") else ("https://www.revolico.com" + href)
            dias = _edad_dias(cont.get_text(" ", strip=True)) if cont else None
            out.append({"fuente": "revolico", "titulo": titulo[:90], "precio": usd, "url": url, "dias": dias,
                        "moneda": pp["moneda"], "orig": pp["orig"]})
        if len(out) >= 25:
            break
    return out


def scrape_porlalivre(query, rate):
    from bs4 import BeautifulSoup
    r = _get("https://porlalivre.com/anuncios", {"buscar": query})
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for card in soup.select("article, .anuncio, .card, li"):
        txt = card.get_text(" ", strip=True)
        if not txt or len(txt) < 8:
            continue
        pm = PRECIO_TXT_RE.search(txt)
        if not pm:
            continue
        pp = parse_precio(pm.group(0), rate)
        if not pp:
            continue
        usd = pp["usd"]
        a = card.find("a", href=True)
        url = a["href"] if a and a["href"].startswith("http") else ("https://porlalivre.com" + (a["href"] if a else ""))
        out.append({"fuente": "porlalivre", "titulo": txt[:90], "precio": usd, "url": url, "dias": _edad_dias(txt),
                    "moneda": pp["moneda"], "orig": pp["orig"]})
        if len(out) >= 25:
            break
    return out


def scrape_lelespc(query, rate):
    from bs4 import BeautifulSoup
    r = _get("https://lelespc.store/", {"s": query, "post_type": "product"})
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for li in soup.select("li.product, .product"):
        nom = li.select_one(".woocommerce-loop-product__title, h2, h3")
        pr = li.select_one(".price, .amount")
        if not nom or not pr:
            continue
        pp = parse_precio(pr.get_text(" ", strip=True), rate)
        if not pp:
            continue
        usd = pp["usd"]
        a = li.find("a", href=True)
        out.append({"fuente": "lelespc", "titulo": nom.get_text(" ", strip=True)[:90],
                    "precio": usd, "url": a["href"] if a else "https://lelespc.store/",
                    "moneda": pp["moneda"], "orig": pp["orig"]})
        if len(out) >= 25:
            break
    return out


SCRAPERS = {"revolico": scrape_revolico, "porlalivre": scrape_porlalivre, "lelespc": scrape_lelespc}


def buscar(prod, rate, terminos=None, excluir=None):
    """Anuncios del mismo producto. `terminos` (lo que el gestor escribió en el
    panel) sustituye a la búsqueda por el nombre; `excluir` son los enlaces que
    marcó «no es este». Devuelve (muestras, descartados por otro modelo)."""
    base = (terminos or "").strip() or prod.get("nombre")
    kw = keywords(base)
    q = (terminos or "").strip() or query_de(prod.get("nombre"))
    # Las cifras del nombre y las de los términos mandan las dos.
    ref = (prod.get("nombre") or "") + " " + (terminos or "")
    fuera = set(excluir or [])
    muestras, descartados = [], 0
    for f in FUENTES:
        try:
            res = SCRAPERS[f](q, rate)
            for it in res:
                if it.get("url") in fuera:
                    continue
                if not coincide(kw, it["titulo"]):
                    continue
                if not mismo_modelo(ref, it["titulo"]):
                    descartados += 1
                    continue
                # Solo anuncios de la última semana (si se conoce la fecha).
                d = it.get("dias")
                if d is not None and d > MAX_DIAS:
                    continue
                muestras.append(it)
            time.sleep(PAUSA)
        except Exception as e:
            print(f"  ⚠ {f} falló para «{q}»: {e}")
    return muestras, descartados


def _mediana_recortada(vals):
    """Mediana quitando el 20% más alto y más bajo (si hay >=5 datos),
    para que un anuncio disparatado no la dispare."""
    vals = sorted(vals)
    n = len(vals)
    if n >= 5:
        k = max(1, int(n * 0.2))
        recortado = vals[k:n - k]
        if recortado:
            vals = recortado
    return statistics.median(vals)


def _filtrar_outliers(precios, tu):
    """Descarta precios disparatados respecto a tu precio (otro producto colado).
    Mantiene solo lo que esté entre 30% y 300% de tu precio; si eso deja muy
    pocos, devuelve los originales (mejor algo que nada)."""
    if not tu or tu <= 0:
        return precios
    lo, hi = tu * 0.3, tu * 3.0
    dentro = [p for p in precios if lo <= p <= hi]
    return dentro if len(dentro) >= 3 else (dentro or precios)


def analizar(prod, muestras, prev_hist, fecha, tasa=None):
    tu = float(prod.get("precioActual") or 0)
    # Un producto con precio fijo en MN (la ficha dice «280 MN») no vale 280
    # dólares: se compara en USD a la tasa de hoy y se dice cuál era el suyo.
    tu_orig = None
    if str(prod.get("moneda") or "").upper() in ("MN", "CUP") and tu > 0:
        if not tasa:
            return {"id": prod.get("id"), "nombre": prod.get("nombre"), "tuPrecio": None,
                    "tuMoneda": "MN", "tuPrecioOrig": tu, "mercado": {"min": 0, "mediana": 0, "n": 0},
                    "estado": "sin_datos", "deltaAyerMediana": None, "historial": list(prev_hist or []),
                    "muestras": [], "convertidos": 0}
        tu_orig, tu = tu, round(tu / tasa, 2)
    precios_raw = sorted(it["precio"] for it in muestras if it.get("precio"))
    precios = _filtrar_outliers(precios_raw, tu)
    # conserva solo las muestras cuyos precios sobrevivieron el filtro
    _ok = set(precios)
    muestras = [m for m in muestras if m.get("precio") in _ok] or muestras
    res = {"id": prod.get("id"), "nombre": prod.get("nombre"), "tuPrecio": tu}
    # Cuántos de los anuncios que cuentan estaban en CUP y se convirtieron.
    res["convertidos"] = sum(1 for m in muestras if m.get("moneda") == "CUP")
    hist = list(prev_hist or [])
    if precios:
        mn = min(precios); med = round(_mediana_recortada(precios), 2)
        res["mercado"] = {"min": mn, "mediana": med, "n": len(precios)}
        ayer = hist[-1]["mediana"] if hist else None
        res["deltaAyerMediana"] = round(med - ayer, 2) if ayer else None
        if tu > med * 1.10:
            res["estado"] = "encima"
            res["sugerencia"] = {"texto": f"Estás por encima del mercado. Podrías bajar hacia ~${med:.0f}", "precio": med}
        elif tu and tu < mn:
            res["estado"] = "barato"
            res["sugerencia"] = {"texto": f"Estás por debajo de todos (mín ${mn:.0f}); hay margen para subir"}
        else:
            res["estado"] = "competitivo"
            res["sugerencia"] = {"texto": "Precio competitivo respecto al mercado"}
        hist.append({"fecha": fecha, "mediana": med})
    else:
        res["mercado"] = {"min": 0, "mediana": 0, "n": 0}
        res["estado"] = "sin_datos"
        res["deltaAyerMediana"] = None
    if tu_orig is not None:
        res["tuMoneda"], res["tuPrecioOrig"] = "MN", tu_orig
    res["historial"] = hist[-HIST_DIAS:]
    # Todas las que cuentan (con tope): el panel las enseña para verificar y
    # recalcula al momento si el gestor marca una como «no es este».
    res["muestras"] = sorted(muestras, key=lambda x: x["precio"])[:20]
    return res


def config_vigilar(ruta=None):
    """radar-vigilar.json tal cual, o {} si no existe."""
    d = load_json(ruta or VIGILAR, None)
    return d if isinstance(d, dict) else {}


def ids_vigilar(productos, ruta=None):
    """Ids elegidos en el panel. Sin el archivo (aún nadie eligió), los que
    llevan radar:true en productos.json, como antes."""
    d = config_vigilar(ruta)
    if isinstance(d.get("ids"), list):
        return {str(i) for i in d["ids"]}
    return {str(p.get("id")) for p in productos if p.get("radar")}


# ── Aviso por Telegram ───────────────────────────────────────────────────────
# Solo cuando cambia algo que mueve una decisión: alguien se pone por debajo de
# tu precio, o ya no queda nadie por debajo. Nunca un resumen diario: un aviso
# que llega todos los días enseña a no leerlo, y este es el que importa.
UMBRAL_BARATO = 0.03     # «por debajo» = al menos un 3 % menos; el resto es ruido de redondeo
MAX_AVISOS = 8           # productos por mensaje (el resto, en el panel)
PANEL_RADAR = "https://tiendamax.org/admin.html#radar"


def firma_busqueda(terminos, excluir):
    """Qué le pidió el gestor a este producto: sus palabras de búsqueda y los
    anuncios que quitó. Si cambia entre dos corridas, lo que se mueve es la
    configuración y no el mercado, y no se avisa de eso."""
    base = json.dumps([str(terminos or "").strip().lower(), sorted(excluir or [])], ensure_ascii=False)
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:10]


def _mas_barato(r):
    """(hay_alguien_por_debajo, mínimo) de un resultado del radar."""
    m = (r.get("mercado") or {})
    mn, tu = m.get("min"), r.get("tuPrecio")
    if not (m.get("n") and mn and tu):
        return False, mn
    return mn < tu * (1 - UMBRAL_BARATO), mn


def cambios_radar(prev, resultados):
    """{'bajaron': [...], 'ya_no': [...]} comparando con la corrida anterior.

    No avisa de un producto que (a) no estaba antes (acaba de entrar al radar:
    no hay con qué comparar), (b) cambió de búsqueda o de anuncios quitados, o
    (c) cambió de precio: en esos tres casos lo que se movió es lo que hizo el
    gestor, no el mercado. Una corrida anterior sin `firma` (formato viejo)
    tampoco sirve para comparar."""
    antes = {str(p.get("id")): p for p in ((prev or {}).get("productos") or [])}
    out = {"bajaron": [], "ya_no": []}
    for r in resultados:
        a = antes.get(str(r.get("id")))
        if not a or not a.get("firma") or a.get("firma") != r.get("firma"):
            continue
        if abs((a.get("tuPrecio") or 0) - (r.get("tuPrecio") or 0)) > 0.005:
            continue
        era, _ = _mas_barato(a)
        es, _ = _mas_barato(r)
        if es and not era:
            out["bajaron"].append(r)
        elif era and not es:
            out["ya_no"].append(r)
    return out


def _h(t):
    return html.escape(str(t if t is not None else ""), quote=False)


def _tu_txt(r):
    if r.get("tuMoneda") == "MN":
        return f"{r.get('tuPrecioOrig'):,.0f} MN".replace(",", " ")
    return f"${r.get('tuPrecio'):,.2f}".replace(".00", "")


def _usd(v):
    return f"${v:,.2f}".replace(".00", "")


def mensaje_aviso(cambios):
    """Texto HTML de Telegram, o '' si no hay nada que decir."""
    bajaron, ya_no = cambios.get("bajaron") or [], cambios.get("ya_no") or []
    if not (bajaron or ya_no):
        return ""
    partes = []
    if bajaron:
        partes.append(f"📡 <b>Alguien se puso por debajo de tu precio</b> ({len(bajaron)})")
        for r in bajaron[:MAX_AVISOS]:
            tu = r.get("tuPrecio")
            m = r.get("mercado") or {}
            n_bajo = sum(1 for x in (r.get("muestras") or []) if (x.get("precio") or 0) < tu * (1 - UMBRAL_BARATO))
            linea = f"\n\n<b>{_h(r.get('nombre'))}</b>\n├ Tú: {_h(_tu_txt(r))}\n└ Más barato: <b>{_usd(m.get('min'))}</b>"
            if n_bajo > 1:
                linea += f" · {n_bajo} anuncios por debajo"
            barato = next((x for x in (r.get("muestras") or []) if x.get("precio") == m.get("min")), None)
            if barato and str(barato.get("url") or "").startswith("http"):
                linea += f'\n<a href="{_h(barato["url"])}">Ver el anuncio</a> · {_h(str(barato.get("titulo") or "")[:60])}'
            partes.append(linea)
        if len(bajaron) > MAX_AVISOS:
            partes.append(f"\n\n<i>…y {len(bajaron) - MAX_AVISOS} más en el Radar.</i>")
        partes.append("\n\n<i>Mira el anuncio antes de bajar: puede ser otro modelo. En el Radar, «✕ No es este» lo saca, y ahí ves qué le pasa a tu comisión.</i>")
    if ya_no:
        if partes:
            partes.append("\n\n")
        partes.append(f"✅ <b>Ya nadie está por debajo de tu precio</b> ({len(ya_no)})")
        for r in ya_no[:MAX_AVISOS]:
            partes.append(f"\n· {_h(r.get('nombre'))} — tú {_h(_tu_txt(r))}")
        if len(ya_no) > MAX_AVISOS:
            partes.append(f"\n<i>…y {len(ya_no) - MAX_AVISOS} más.</i>")
    return "".join(partes)


def enviar_telegram(texto):
    """Lo manda al chat del dueño, con un botón que abre el Radar. Devuelve True
    si Telegram lo aceptó."""
    import urllib.request
    token, chat = os.environ.get("BOT_TOKEN", ""), os.environ.get("ADMIN_CHAT_ID", "")
    if not (token and chat and (texto or "").strip()):
        print("ℹ️ Sin BOT_TOKEN/ADMIN_CHAT_ID o sin texto: no se manda nada a Telegram.")
        return False
    cuerpo = json.dumps({
        "chat_id": chat, "text": texto[:4096], "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": {"inline_keyboard": [[{"text": "📡 Abrir el Radar", "url": PANEL_RADAR}]]},
    }).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage",
                                 data=cuerpo, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            ok = 200 <= r.status < 300
    except Exception as e:
        print(f"❌ Telegram: {e}", file=sys.stderr)
        return False
    print("✅ Aviso del radar enviado a Telegram." if ok else "❌ Telegram no lo aceptó.")
    return ok


def main():
    productos = load_json(os.path.join(ROOT, "productos.json"), []) or []
    # Solo se vigilan realmente los productos con stock > 0 (igual que el admin UI:
    # un producto agotado no vale la pena vigilarlo, ya no está a la venta).
    cfg = config_vigilar()
    elegidos = ids_vigilar(productos)
    vigilados = [p for p in productos if str(p.get("id")) in elegidos and float(p.get("stock") or 0) > 0][:MAX_PROD]
    omitidos = sum(1 for p in productos if str(p.get("id")) in elegidos and float(p.get("stock") or 0) <= 0)
    rate = tasa_base()
    fecha = datetime.datetime.now(datetime.timezone.utc).astimezone().strftime("%Y-%m-%d")
    print(f"Radar: {len(vigilados)} productos vigilados · tasa base {rate}"
          + (f" · {omitidos} omitido(s) por agotado" if omitidos else ""))

    prev = load_json(OUT, {}) or {}
    prev_hist = {str(p.get("id")): p.get("historial", []) for p in prev.get("productos", [])}

    resultados = []
    for p in vigilados:
        pid = str(p.get("id"))
        term = str((cfg.get("terminos") or {}).get(pid) or "").strip()
        excl = (cfg.get("excluir") or {}).get(pid) or []
        try:
            muestras, desc = buscar(p, rate, term, excl)
        except Exception as e:
            print(f"  ⚠ producto {p.get('nombre')}: {e}")
            muestras, desc = [], 0
        r = analizar(p, muestras, prev_hist.get(pid), fecha, rate)
        r["busqueda"] = term or query_de(p.get("nombre"))
        r["firma"] = firma_busqueda(term, excl)
        r["descartados"] = desc
        resultados.append(r)
        print(f"  · {str(p.get('nombre'))[:34]:34} → {resultados[-1]['mercado']}")

    resumen = {
        "vigilados": len(resultados),
        "encimaMercado": sum(1 for r in resultados if r["estado"] == "encima"),
        "bajadasComp": sum(1 for r in resultados if (r.get("deltaAyerMediana") or 0) < 0),
        "sinDatos": sum(1 for r in resultados if r["estado"] == "sin_datos"),
    }
    data = {
        "actualizado": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "fecha": fecha,
        "fuentes": FUENTES,
        "tasa": rate,          # 1 USD = tasa MN, la de los anuncios convertidos
        "resumen": resumen,
        "productos": resultados,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    # El aviso de Telegram se deja escrito; lo manda el workflow cuando el
    # commit ya está en main, para que llegue una sola vez.
    destino = os.environ.get("AVISO_TELEGRAM", "")
    if destino:
        texto = mensaje_aviso(cambios_radar(prev, resultados))
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
        print("📝 Aviso de Telegram preparado." if texto else "📝 Nada que avisar por Telegram.")
    print(f"✅ radar.json escrito. Resumen: {resumen}")

    # Push de resumen al admin (opcional; no rompe si falta Firebase)
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from send_notifications import init_firebase, enviar_push_admin
        messaging_api, database = init_firebase()
        if messaging_api and database:
            body = (f"{resumen['vigilados']} vigilados · {resumen['encimaMercado']} por encima del mercado"
                    + (f" · {resumen['bajadasComp']} bajadas de competencia" if resumen['bajadasComp'] else ""))
            enviar_push_admin(messaging_api, database, "📡 Radar de precios listo", body,
                              link="/admin.html#radar", tag="radar-precios")
    except Exception as e:
        print(f"ℹ️ Push admin no enviado: {e}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--enviar-telegram":
        try:
            with open(sys.argv[2], encoding="utf-8") as f:
                _texto = f.read()
        except OSError:
            _texto = ""
        enviar_telegram(_texto)
        sys.exit(0)
    sys.exit(main())
