#!/usr/bin/env python3
"""
TiendaMax — Radar de demanda ("busco/compro").

Lee los clasificados cubanos de web abierta (Revolico, Porlalivre) buscando
anuncios de gente que COMPRA/BUSCA (no que vende), los cruza con TU catálogo
en existencia, y te manda un Telegram con el link de cada anuncio para que
TÚ le escribas y le ofrezcas el tuyo.

Por qué NO Facebook: los grupos de Facebook están tras login — un `fetch`
simple (como el que usa este radar) no ve las publicaciones, solo la pantalla
de "inicia sesión". La única forma de leerlos sería automatizar un navegador
logueado con la cuenta del negocio, que Facebook detecta y BANEA. Revolico y
Porlalivre son web abierta: mismo mecanismo del radar de precios, cero riesgo.

Anti-spam: guarda en demanda_radar.json los links ya avisados (con fecha) y
NUNCA re-notifica el mismo anuncio. Se poda lo más viejo de 30 días.

Diseño defensivo (igual que precio_radar): si una fuente o un producto falla,
se ignora y se sigue — nunca rompe la corrida. Los parsers son v1 best-effort;
se afinan tras la 1ª corrida real. Ejecutar en GitHub Actions (allí hay
internet); este entorno bloquea salir a esos sitios.
"""
from __future__ import annotations
import datetime
import os
import re
import sys
import time

# Reusar los helpers ya probados del radar de precios (DRY). Importar el módulo
# es seguro: su lógica corre solo bajo `if __name__ == "__main__"`.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from precio_radar import (  # noqa: E402
    _norm, _get, _edad_dias, keywords, coincide, query_de, load_json,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "demanda_radar.json")

MAX_QUERIES = 30       # tope de búsquedas distintas por corrida (respetuoso)
PAUSA = 1.5            # segundos entre peticiones
MAX_DIAS = 10         # solo anuncios recientes (si se conoce la fecha)
SEEN_DIAS = 30        # cuánto recordar un link ya avisado antes de olvidarlo
MAX_AVISOS = 15       # tope de coincidencias por mensaje de Telegram

# Categorías a vigilar. Vacío = todas. Se puede sobreescribir con la variable
# de entorno DEMANDA_CATEGORIAS (coma-separada), sin tocar código. El admin
# pidió empezar solo con WiFi y Energía — menos peticiones por corrida (clave
# para el plan gratis de Cloudflare, tope 50 subpeticiones) y foco donde más
# se mueve. Se comparan normalizadas (mayúsculas, sin acentos).
def _categorias_vigiladas() -> set[str]:
    raw = os.environ.get("DEMANDA_CATEGORIAS", "WIFI,ENERGIA")
    return {_norm(c).upper() for c in raw.split(",") if c.strip()}

# Palabras que delatan a un COMPRADOR (no un vendedor). Se buscan en el título
# ya normalizado (minúsculas, sin acentos).
_BUYER_RE = re.compile(
    r"\b(compro|busco|se\s+busca|se\s+compra|necesito|nesecito|"
    r"pago\s+por|quiero\s+comprar|ando\s+buscando|alguien\s+(vende|tiene)|"
    r"wanted|donde\s+(compro|consigo)|preciso)\b"
)


def es_busqueda(titulo: str) -> bool:
    """True si el título parece de alguien que compra/busca, no que vende."""
    return bool(_BUYER_RE.search(_norm(titulo)))


# ── Scrapers: devuelven TODO lo parseado (título+url+días), SIN filtrar por
# comprador. El filtro "es comprador" vive en buscar_demanda (un solo lugar).
# Así el conteo crudo de items sirve para saber si los selectores parsean bien
# el HTML real (0 crudos = selector roto; >0 crudos = el selector anda, aunque
# no haya compradores).
def _scrape_revolico_busq(query: str) -> list[dict]:
    from bs4 import BeautifulSoup
    r = _get("https://www.revolico.com/search", {"q": query})
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out, vistos = [], set()
    for a in soup.select("a[href*='/item/'], li a"):
        titulo = a.get_text(" ", strip=True)
        if not titulo or len(titulo) < 6:
            continue
        href = a.get("href", "")
        url = href if href.startswith("http") else ("https://www.revolico.com" + href)
        if url in vistos:
            continue
        vistos.add(url)
        cont = a.find_parent()
        dias = _edad_dias(cont.get_text(" ", strip=True)) if cont else None
        out.append({"fuente": "revolico", "titulo": titulo[:110], "url": url, "dias": dias})
        if len(out) >= 40:
            break
    return out


def _scrape_porlalivre_busq(query: str) -> list[dict]:
    from bs4 import BeautifulSoup
    r = _get("https://porlalivre.com/anuncios", {"buscar": query})
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out, vistos = [], set()
    for card in soup.select("article, .anuncio, .card, li"):
        a = card.find("a", href=True)
        if not a:
            continue
        titulo = a.get_text(" ", strip=True) or card.get_text(" ", strip=True)
        if not titulo or len(titulo) < 6:
            continue
        url = a["href"] if a["href"].startswith("http") else ("https://porlalivre.com" + a["href"])
        if url in vistos:
            continue
        vistos.add(url)
        out.append({"fuente": "porlalivre", "titulo": titulo[:110], "url": url,
                    "dias": _edad_dias(card.get_text(" ", strip=True))})
        if len(out) >= 40:
            break
    return out


SCRAPERS = [_scrape_revolico_busq, _scrape_porlalivre_busq]


def _productos_en_stock(productos: list[dict]) -> list[dict]:
    cats = _categorias_vigiladas()
    out = []
    for p in productos:
        if p.get("activo") is False or float(p.get("stock") or 0) <= 0:
            continue
        if cats and _norm(p.get("categoria") or "").upper() not in cats:
            continue
        out.append(p)
    return out


def construir_consultas(productos: list[dict]) -> list[tuple[str, dict, list[str]]]:
    """Lista (query, producto, keywords) sin queries duplicadas, con tope.
    Al haber muchos productos que comparten palabras, se deduplica la query
    para no golpear los sitios de más."""
    vistas: set[str] = set()
    consultas: list[tuple[str, dict, list[str]]] = []
    for p in _productos_en_stock(productos):
        q = query_de(p.get("nombre"))
        if not q or q in vistas:
            continue
        vistas.add(q)
        consultas.append((q, p, keywords(p.get("nombre"))))
        if len(consultas) >= MAX_QUERIES:
            break
    return consultas


def buscar_demanda(consultas) -> list[dict]:
    """Devuelve coincidencias {producto, stock, fuente, titulo, url, dias}.

    Lleva contadores por fuente (crudos parseados · compradores · coincidencias)
    y los imprime al final. Sirven de diagnóstico: si una fuente da 0 crudos en
    toda la corrida, su selector de HTML está roto (o el sitio no responde), no
    es que "no haya compradores". Distinguir eso a ojo era imposible antes."""
    matches: list[dict] = []
    # {fuente: [crudos, compradores, coincidencias]}
    stats: dict[str, list[int]] = {}
    for q, prod, kw in consultas:
        for scraper in SCRAPERS:
            try:
                for it in scraper(q):
                    st = stats.setdefault(it["fuente"], [0, 0, 0])
                    st[0] += 1  # crudo parseado
                    # Doble filtro (los scrapers ya filtran, pero garantizarlo
                    # acá deja el criterio de "es comprador" en un solo lugar):
                    if not es_busqueda(it["titulo"]):
                        continue
                    st[1] += 1  # comprador
                    if not coincide(kw, it["titulo"]):
                        continue
                    d = it.get("dias")
                    if d is not None and d > MAX_DIAS:
                        continue
                    st[2] += 1  # coincidencia con tu catálogo
                    matches.append({
                        "producto": prod.get("nombre"),
                        "productoId": prod.get("id"),
                        "stock": int(float(prod.get("stock") or 0)),
                        "fuente": it["fuente"],
                        "titulo": it["titulo"],
                        "url": it["url"],
                    })
            except Exception as e:
                print(f"  ⚠ {scraper.__name__} falló para «{q}»: {e}")
            time.sleep(PAUSA)
    for fuente in sorted(stats):
        crudos, compradores, coincidencias = stats[fuente]
        print(f"  · {fuente}: {crudos} crudos · {compradores} compradores · "
              f"{coincidencias} coincidencias")
        if crudos == 0:
            print(f"    ⚠ {fuente}: 0 crudos en toda la corrida — "
                  f"selector roto o sitio caído, NO 'sin compradores'.")
    return matches


def podar_vistos(vistos: dict, hoy: datetime.date) -> dict:
    """Olvida links avisados hace más de SEEN_DIAS (para que el archivo no
    crezca sin fin y para poder re-avisar si el anuncio reaparece meses
    después)."""
    limite = hoy - datetime.timedelta(days=SEEN_DIAS)
    out = {}
    for url, fecha in (vistos or {}).items():
        try:
            d = datetime.date.fromisoformat(str(fecha))
        except Exception:
            d = hoy  # fecha ilegible → trátala como reciente, no la borres
        if d >= limite:
            out[url] = str(fecha)
    return out


def filtrar_nuevos(matches: list[dict], vistos: dict) -> list[dict]:
    """Solo coincidencias cuyo link NO se haya avisado antes. Deduplica por
    URL dentro de la misma corrida también."""
    nuevos, en_corrida = [], set()
    for m in matches:
        u = m["url"]
        if u in vistos or u in en_corrida:
            continue
        en_corrida.add(u)
        nuevos.append(m)
    return nuevos


def armar_mensaje(nuevos: list[dict]) -> str:
    emoji = {"revolico": "🟢", "porlalivre": "🔵"}
    top = nuevos[:MAX_AVISOS]
    lineas = [f"🎯 Clientes buscando lo que vendes ({len(nuevos)})", ""]
    for m in top:
        stock = f" · tienes {m['stock']}" if m.get("stock") else ""
        lineas.append(f"{emoji.get(m['fuente'], '•')} {m['producto']}{stock}")
        lineas.append(f"   «{m['titulo']}»")
        lineas.append(f"   {m['url']}")
        lineas.append("")
    if len(nuevos) > MAX_AVISOS:
        lineas.append(f"…y {len(nuevos) - MAX_AVISOS} más.")
        lineas.append("")
    lineas.append("Escríbeles tú y ofréceles el tuyo 👍")
    return "\n".join(lineas)


def enviar_telegram(text: str) -> None:
    import requests
    token = os.environ["BOT_TOKEN"]
    chat = os.environ["ADMIN_CHAT_ID"]
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat, "text": text, "disable_web_page_preview": True},
        timeout=15,
    )
    r.raise_for_status()


def _guardar_estado(vistos: dict) -> None:
    import json
    estado = {
        "actualizado": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "vistos": vistos,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)


def main() -> int:
    productos = load_json(os.path.join(ROOT, "productos.json"), []) or []
    consultas = construir_consultas(productos)
    print(f"Radar de demanda: {len(consultas)} consultas (productos en stock).")

    hoy = datetime.date.today()
    estado = load_json(OUT, {}) or {}
    vistos = podar_vistos(estado.get("vistos", {}), hoy)

    if not consultas:
        print("Sin productos en stock que vigilar. Nada que buscar.")
        return 0

    matches = buscar_demanda(consultas)
    nuevos = filtrar_nuevos(matches, vistos)
    print(f"Coincidencias: {len(matches)} · nuevas (sin avisar antes): {len(nuevos)}")

    if not nuevos:
        # Corre cada 15 min: si no hay nada nuevo, NO se reescribe el estado —
        # así el workflow no genera un commit de puro timestamp en cada corrida.
        # El estado (y la poda) solo se persisten cuando de verdad hay un aviso
        # nuevo. Que una entrada vieja tarde unos días extra en borrarse es
        # inofensivo.
        print("Nada nuevo que avisar (no se toca el estado).")
        return 0

    try:
        enviar_telegram(armar_mensaje(nuevos))
        print(f"✅ Aviso enviado con {len(nuevos)} búsqueda(s).")
    except KeyError:
        print("ℹ️ BOT_TOKEN/ADMIN_CHAT_ID no configurados; no se envió Telegram.")
    except Exception as e:
        print(f"❌ Error Telegram: {e}", file=sys.stderr)
    # Marca como vistos aunque el envío falle a medias, para no reintentar el
    # mismo lote una y otra vez (mejor perder un aviso que spamear).
    for m in nuevos:
        vistos[m["url"]] = hoy.isoformat()

    _guardar_estado(vistos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
