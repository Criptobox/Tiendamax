#!/usr/bin/env python3
"""
TiendaMax — Radar de precios.
Compara los precios de TUS productos marcados (radar:true en productos.json) con el
mercado cubano (Revolico, Porlalivre, lelespc), 1×/día. Guarda resultado e historial
en radar.json y te manda un push de resumen al admin.

Diseño defensivo: si una fuente o un producto falla, se ignora y se sigue — NUNCA
rompe la corrida. Los parsers son v1 (best-effort): se afinan tras la 1ª corrida real
viendo qué devuelve cada sitio. Ejecutar en GitHub Actions (allí sí hay internet).
"""
from __future__ import annotations
import json, os, re, sys, time, statistics, datetime, unicodedata


def _norm(s):
    """minúsculas y sin acentos, para comparar títulos de anuncios cubanos."""
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "radar.json")
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


PRECIO_RE = re.compile(r"(\d[\d.,]{1,9})\s*(usd|cup|mn|mlc|\$)?", re.I)


def parse_precio_usd(texto, rate):
    """Devuelve precio en USD (aprox) o None. Convierte CUP/MN con la tasa base."""
    if not texto:
        return None
    s = texto.replace("\xa0", " ").strip().lower()
    cur = "usd"
    if "cup" in s or " mn" in s or s.endswith("mn"):
        cur = "cup"
    elif "mlc" in s:
        cur = "mlc"
    elif "usd" in s or "$" in s:
        cur = "usd"
    m = re.search(r"\d[\d.,]{0,12}", s)
    if not m:
        return None
    raw = re.sub(r"[^\d.,]", "", m.group(0))
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
    if cur == "cup":
        if not rate:
            return None
        val = val / rate
    # mlc ~ usd; usd as-is
    if val < 1 or val > 100000:
        return None
    return round(val, 2)


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
            pm = re.search(r"\$?\s*\d[\d.,]{1,9}\s*(USD|CUP|MN|MLC)?", cont.get_text(" ", strip=True), re.I)
            if pm:
                precio_txt = pm.group(0)
        usd = parse_precio_usd(precio_txt, rate)
        if usd:
            href = a.get("href", "")
            url = href if href.startswith("http") else ("https://www.revolico.com" + href)
            dias = _edad_dias(cont.get_text(" ", strip=True)) if cont else None
            out.append({"fuente": "revolico", "titulo": titulo[:90], "precio": usd, "url": url, "dias": dias})
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
        pm = re.search(r"\$?\s*\d[\d.,]{1,9}\s*(USD|CUP|MN|MLC)?", txt, re.I)
        if not pm:
            continue
        usd = parse_precio_usd(pm.group(0), rate)
        if not usd:
            continue
        a = card.find("a", href=True)
        url = a["href"] if a and a["href"].startswith("http") else ("https://porlalivre.com" + (a["href"] if a else ""))
        out.append({"fuente": "porlalivre", "titulo": txt[:90], "precio": usd, "url": url, "dias": _edad_dias(txt)})
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
        usd = parse_precio_usd(pr.get_text(" ", strip=True), rate)
        if not usd:
            continue
        a = li.find("a", href=True)
        out.append({"fuente": "lelespc", "titulo": nom.get_text(" ", strip=True)[:90],
                    "precio": usd, "url": a["href"] if a else "https://lelespc.store/"})
        if len(out) >= 25:
            break
    return out


SCRAPERS = {"revolico": scrape_revolico, "porlalivre": scrape_porlalivre, "lelespc": scrape_lelespc}


def buscar(prod, rate):
    kw = keywords(prod.get("nombre"))
    q = query_de(prod.get("nombre"))
    muestras = []
    for f in FUENTES:
        try:
            res = SCRAPERS[f](q, rate)
            for it in res:
                if not coincide(kw, it["titulo"]):
                    continue
                # Solo anuncios de la última semana (si se conoce la fecha).
                d = it.get("dias")
                if d is not None and d > MAX_DIAS:
                    continue
                muestras.append(it)
            time.sleep(PAUSA)
        except Exception as e:
            print(f"  ⚠ {f} falló para «{q}»: {e}")
    return muestras


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


def analizar(prod, muestras, prev_hist, fecha):
    tu = float(prod.get("precioActual") or 0)
    precios_raw = sorted(it["precio"] for it in muestras if it.get("precio"))
    precios = _filtrar_outliers(precios_raw, tu)
    # conserva solo las muestras cuyos precios sobrevivieron el filtro
    _ok = set(precios)
    muestras = [m for m in muestras if m.get("precio") in _ok] or muestras
    res = {"id": prod.get("id"), "nombre": prod.get("nombre"), "tuPrecio": tu}
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
    res["historial"] = hist[-HIST_DIAS:]
    res["muestras"] = sorted(muestras, key=lambda x: x["precio"])[:6]
    return res


def main():
    productos = load_json(os.path.join(ROOT, "productos.json"), []) or []
    # Solo se vigilan realmente los productos con stock > 0 (igual que el admin UI:
    # un producto agotado no vale la pena vigilarlo, ya no está a la venta).
    vigilados = [p for p in productos if p.get("radar") and float(p.get("stock") or 0) > 0][:MAX_PROD]
    omitidos = sum(1 for p in productos if p.get("radar") and float(p.get("stock") or 0) <= 0)
    rate = tasa_base()
    fecha = datetime.datetime.now(datetime.timezone.utc).astimezone().strftime("%Y-%m-%d")
    print(f"Radar: {len(vigilados)} productos vigilados · tasa base {rate}"
          + (f" · {omitidos} omitido(s) por agotado" if omitidos else ""))

    prev = load_json(OUT, {}) or {}
    prev_hist = {str(p.get("id")): p.get("historial", []) for p in prev.get("productos", [])}

    resultados = []
    for p in vigilados:
        try:
            muestras = buscar(p, rate)
        except Exception as e:
            print(f"  ⚠ producto {p.get('nombre')}: {e}")
            muestras = []
        resultados.append(analizar(p, muestras, prev_hist.get(str(p.get("id"))), fecha))
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
        "resumen": resumen,
        "productos": resultados,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
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
    sys.exit(main())
