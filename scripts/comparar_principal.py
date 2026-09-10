#!/usr/bin/env python3
"""Trae el catálogo de la tienda principal (AXONTECH) para poder compararlo.

Los productos de TiendaMax no son del gestor: se los da otra tienda, y esa
tienda cambia precios, repone y saca productos nuevos sin avisar. Hasta ahora
la única forma de enterarse era abrir las dos webs y mirar 132 fichas a mano,
así que en la práctica nadie se enteraba: se vendía a precios viejos y se
dejaban 59 productos sin subir.

## Qué hace y qué NO

Descarga `data.json` de la principal y se queda **solo con `productos`**. Ese
fichero trae también `gestores` y `vales` —con nombre, teléfono, carné y
dirección de los clientes de la tienda, y las claves de los gestores— y nada
de eso tiene por qué pasar por aquí ni acabar en este repositorio. Se descarta
antes de tocar nada más. Lo que se escribe son dos ficheros: el catálogo con
los campos justos para comparar (23 KB, 4 KB comprimidos) y, aparte, las
descripciones de los que aún no están en TiendaMax.

## Por qué un script y no el panel

El panel podría bajarse el `data.json` entero al abrir la pantalla, pero es
1 MB y quien lo abre está en Cuba con datos móviles. Aquí eso sale gratis
—corre en GitHub Actions— y al teléfono solo le llegan los 20 KB del
resultado. La comparación en sí la hace el panel con el fichero de su
catálogo, que ya tiene en memoria: así, en cuanto el gestor arregla un
precio, la fila desaparece sin esperar a la próxima corrida del cron.

## La comisión: el campo que no se puede comparar a la ligera

La principal guarda la comisión como un texto (`"$10 USD"`, `"1500 MN"`) y
además en un campo `comisionMoneda` aparte, y **los dos se contradicen en 5
productos** (`"$3 USD"` con `comisionMoneda: "MN"`, y `"$1000 USD"` sobre un
producto de $20). Comparar sin mirar la moneda convierte 1500 MN (unos $2,18)
y $1,80 en una diferencia enorme que no existe: es el mismo dinero.

Por eso cada comisión sale de aquí con un `fiable`. Cuando las dos fuentes no
concuerdan, o el número no tiene sentido para el precio del producto, se
marca `fiable: false` y el panel dice "no puedo compararla" en vez de inventar
una diferencia. Una diferencia falsa aquí es peor que ninguna: manda al gestor
a cambiar una comisión que estaba bien.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Dos ficheros a propósito. `principal-catalogo.json` son los campos que se
# comparan y lo abre la pantalla siempre: 23 KB, 4 KB comprimidos. Las
# descripciones son otros 38 KB y solo hacen falta al tocar "rellenar el
# formulario" de UN producto que falta, así que viven aparte y solo se bajan
# si se llega a usar el botón. Juntas costarían 26 KB comprimidos cada vez
# que alguien abre la pantalla, para enseñar un texto que casi nunca se lee.
SALIDA = ROOT / "principal-catalogo.json"
FICHAS = ROOT / "principal-fichas.json"
MIOS = ROOT / "productos.json"

# El repositorio que publica axontech92.github.io/AXONTECH. Se lee por
# raw.githubusercontent y no por la web publicada porque el CSP de admin.html
# ya permite ese dominio, así que el panel puede refrescar en directo con el
# botón "Actualizar ahora" sin tocar la cabecera de seguridad.
PRINCIPAL_URL = "https://raw.githubusercontent.com/axontech92/axontech/main/data.json"
PRINCIPAL_WEB = "https://axontech92.github.io/AXONTECH/"

# Ninguna comisión en USD pasa de 35 en ninguna de las dos tiendas, y ninguna
# en MN baja de 1000. El hueco entre las dos es enorme, así que un número por
# encima de esto en un campo que dice USD es un error de tecleo, no un dato.
TOPE_USD = 100

# Cada cuánto se puede volver a avisar al teléfono del dueño de lo mismo.
AVISO_COOLDOWN_S = 6 * 3600


def _num(v):
    """Un número de un campo que puede venir como '$1 200,50 USD'."""
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"[\d.,]+", str(v or ""))
    if not m:
        return None
    crudo = m.group(0)
    # '1.200,50' es europeo; '1,200.50' es inglés; '1200.5' es lo normal aquí.
    if "," in crudo and "." in crudo:
        crudo = (crudo.replace(".", "").replace(",", ".")
                 if crudo.rindex(",") > crudo.rindex(".") else crudo.replace(",", ""))
    else:
        crudo = crudo.replace(",", ".")
    try:
        return float(crudo)
    except ValueError:
        return None


def _moneda_del_texto(v):
    """MN / USD si el propio texto lo dice; None si no lo dice."""
    s = str(v or "")
    if re.search(r"\bMN\b|\bCUP\b", s, re.I):
        return "MN"     # «280 cup» y «1500 MN» son la misma moneda escrita distinto
    if "$" in s or re.search(r"\bUSD\b", s, re.I):
        return "USD"
    return None


def comision_de(producto: dict) -> dict:
    """{valor, moneda, fiable, porque} de la comisión de un producto.

    `fiable` es lo importante. Se pone en False cuando las dos fuentes de la
    principal se contradicen o cuando el número no puede ser cierto, y el
    panel entonces enseña la fila como "revísala" en lugar de como una
    diferencia. Ver la explicación larga arriba.
    """
    crudo = producto.get("comision")
    valor = _num(crudo)
    if valor is None:
        return {"valor": None, "moneda": None, "fiable": True, "porque": ""}

    del_texto = _moneda_del_texto(crudo)
    del_campo = producto.get("comisionMoneda") or None
    if del_campo not in ("USD", "MN"):
        del_campo = None

    if del_texto and del_campo and del_texto != del_campo:
        return {"valor": valor, "moneda": del_campo, "fiable": False,
                "porque": f"la principal la escribe «{crudo}» pero su campo de moneda dice {del_campo}"}

    moneda = del_campo or del_texto
    if moneda is None:
        # Sin moneda declarada por ningún lado: se deduce por tamaño, que en
        # estos dos catálogos separa sin ambigüedad (USD ≤ 35, MN ≥ 1000).
        moneda = "MN" if valor >= TOPE_USD else "USD"

    if moneda == "USD" and valor >= TOPE_USD:
        return {"valor": valor, "moneda": "USD", "fiable": False,
                "porque": f"«{crudo}» en USD sobre un producto de ${_num(producto.get('precioActual')) or 0:g}"}

    precio = _num(producto.get("precioActual")) or 0
    if moneda == "USD" and precio and valor > precio:
        return {"valor": valor, "moneda": "USD", "fiable": False,
                "porque": f"la comisión (${valor:g}) es mayor que el precio (${precio:g})"}

    return {"valor": valor, "moneda": moneda, "fiable": True, "porque": ""}


def precio_de(producto: dict) -> dict:
    """{valor, moneda, otro} del precio, leído como lo lee su propia página.

    La principal guarda el precio DOS veces —`precio`, un texto («$115»,
    «280 cup»), y `precioActual`, un número— y en 12 de sus 108 productos los
    dos no coinciden. Su catálogo pinta `precio` (buildCatalogHTML en su
    app.js), así que ese es el que ve todo el mundo, incluido el gestor cuando
    abre la página a comprobar; `precioActual` se quedó con el valor del
    import. Leyendo el número, la pantalla decía que un cargador costaba $145
    cuando la página de al lado decía $125.

    Y el texto trae moneda: «280 cup» no son 280 dólares. Compararlo contra un
    precio en USD es el mismo error que sumar 1500 MN con $1,80 — el mismo que
    ya se cuidó en la comisión y que aquí se había dejado pasar.
    """
    texto = producto.get("precio")
    del_texto = _num(texto)
    numero = _num(producto.get("precioActual"))
    moneda = _moneda_del_texto(texto) or "USD"

    if del_texto is None:
        return {"valor": numero or 0.0, "moneda": "USD", "otro": None}
    # `precioActual` solo se enseña como "el otro dato" cuando discrepa y las
    # dos cifras hablan de la misma moneda; en CUP no significa lo mismo.
    otro = (numero if numero is not None and moneda == "USD"
            and abs(numero - del_texto) > 0.005 else None)
    return {"valor": del_texto, "moneda": moneda, "otro": otro}


def normalizar(producto: dict, categorias: dict[str, str] | None = None) -> dict | None:
    """Un producto de la principal, con lo justo para compararlo."""
    pid = producto.get("id")
    nombre = str(producto.get("nombre") or producto.get("name") or "").strip()
    if not pid or not nombre:
        return None
    com = comision_de(producto)
    # La principal no guarda el nombre de la categoría en el producto, solo un
    # `catId` que apunta a su propia lista. Sin traducirlo, el botón "Rellenar"
    # dejaba el formulario con la categoría vacía —y es un campo obligatorio—
    # así que había que elegirla a mano en los 31 productos que faltan.
    cat = str(producto.get("categoria") or "").strip()
    if not cat and producto.get("catId") is not None:
        cat = (categorias or {}).get(str(producto.get("catId")), "")
    pre = precio_de(producto)
    fila = {
        "id": str(pid),
        "nombre": nombre,
        "precio": pre["valor"],
        "precioMoneda": pre["moneda"],
        "stock": int(_num(producto.get("stock")) or 0),
        "categoria": cat,
        "comision": com["valor"],
        "comisionMoneda": com["moneda"],
    }
    if pre["otro"] is not None:
        fila["precioOtro"] = pre["otro"]
    if not com["fiable"]:
        fila["comisionDudosa"] = com["porque"]
    for campo, clave in (("descripcion", "descripcion"), ("description", "descripcion"),
                         ("garantia", "garantia")):
        v = str(producto.get(campo) or "").strip()
        if v and not fila.get(clave):
            fila[clave] = v
    fila["subcategoria"] = str(producto.get("subcategoria") or "").strip() or None
    if fila["subcategoria"] is None:
        del fila["subcategoria"]
    foto = str(producto.get("imagen") or producto.get("photo") or "").strip()
    if foto and not foto.startswith("data:"):
        # Se guarda la URL absoluta: la relativa ('photos/img_X.webp') no
        # significa nada servida desde tiendamax.org.
        fila["foto"] = foto if foto.startswith("http") else PRINCIPAL_WEB + foto.lstrip("/")
    return fila


def descargar(url: str = PRINCIPAL_URL, timeout: int = 45) -> list[dict]:
    """El catálogo de la principal, y NADA más de lo que trae ese fichero."""
    req = urllib.request.Request(url, headers={"User-Agent": "tiendamax-comparador"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        datos = json.loads(r.read().decode("utf-8"))
    if isinstance(datos, list):
        crudos, categorias = datos, {}
    else:
        # Solo estas dos claves. `gestores` y `vales` —que traen las claves de
        # los gestores y el nombre, teléfono, carné y dirección de los
        # clientes de la principal— no se leen, no se copian y no salen de
        # esta función.
        crudos = datos.get("productos") or []
        categorias = {str(c.get("id")): str(c.get("name") or "").strip()
                      for c in (datos.get("categorias") or []) if c.get("id")}
    filas = [f for f in (normalizar(p, categorias) for p in crudos) if f]
    # Un id repetido se queda con la fila que declare stock: es la que vende.
    por_id: dict[str, dict] = {}
    for f in filas:
        previa = por_id.get(f["id"])
        if previa is None or (f["stock"] > 0 and previa["stock"] <= 0):
            por_id[f["id"]] = f
    return sorted(por_id.values(), key=lambda f: f["nombre"].lower())


def leer_anterior(path: Path = SALIDA) -> dict[str, dict]:
    """Lo que se guardó la vez pasada, para saber qué cambió."""
    try:
        datos = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {str(f.get("id")): f for f in (datos.get("productos") or []) if f.get("id")}


def reposiciones(antes: dict[str, dict], ahora: list[dict]) -> list[dict]:
    """Los que la principal tenía en cero y ahora tiene.

    Un producto que aparece por primera vez NO cuenta como reposición aunque
    traiga stock: es un producto nuevo, y eso ya lo dice la lista de faltantes.
    Contarlo aquí haría que la primera corrida avisara de 108 «reposiciones».
    """
    vueltos = []
    for f in ahora:
        previa = antes.get(f["id"])
        if previa is None:
            continue
        if int(previa.get("stock") or 0) <= 0 < f["stock"]:
            vueltos.append(f)
    return vueltos


def _norm_nombre(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def mios_agotados(catalogo_mio: list[dict], productos: list[dict]) -> list[dict]:
    """De unos productos de la principal, los que yo tengo agotados o no tengo.

    Es el filtro que hace que el aviso valga: que la principal reponga algo que
    yo ya estoy vendiendo no es noticia. Que reponga algo que mi web da por
    agotado es una venta que puedo hacer hoy.
    """
    por_id = {str(p.get("id")): p for p in catalogo_mio}
    por_nombre = {_norm_nombre(p.get("nombre")): p for p in catalogo_mio}
    fuera = []
    for f in productos:
        mio = por_id.get(f["id"]) or por_nombre.get(_norm_nombre(f["nombre"]))
        if mio is None or int(_num(mio.get("stock")) or 0) <= 0:
            fuera.append(f)
    return fuera


def partir(productos: list[dict], catalogo_mio: list[dict]) -> tuple[list[dict], dict]:
    """El catálogo ligero y, aparte, las fichas largas de los que me faltan.

    La descripción solo sirve para rellenar el formulario de un producto que
    no tengo. Guardarla junto a lo demás multiplicaría por seis lo que baja el
    móvil cada vez que se abre la pantalla, para un texto que se lee una vez
    por producto y nunca más.
    """
    tengo_id = {str(p.get("id")) for p in catalogo_mio}
    tengo_nom = {_norm_nombre(p.get("nombre")) for p in catalogo_mio}
    ligero, fichas = [], {}
    for p in productos:
        falta = p["id"] not in tengo_id and _norm_nombre(p["nombre"]) not in tengo_nom
        larga = {k: p[k] for k in ("descripcion", "garantia") if p.get(k)}
        if falta and larga:
            fichas[p["id"]] = larga
        ligero.append({k: v for k, v in p.items() if k not in ("descripcion", "garantia")})
    return ligero, fichas


def escribir(path: Path, contenido: dict, clave: str) -> bool:
    """Escribe solo si cambió algo de verdad.

    `actualizado` cambia en cada corrida, así que comparar el fichero entero
    daría un commit cada dos horas para decir que el reloj avanzó. Se compara
    únicamente el contenido que importa.
    """
    try:
        previo = json.loads(path.read_text(encoding="utf-8")).get(clave)
    except (OSError, ValueError):
        previo = None
    if previo == contenido.get(clave):
        print(f"✅ {path.name}: sin cambios.")
        return False
    path.write_text(json.dumps(contenido, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    n = len(contenido.get(clave) or [])
    print(f"✏️ {path.name}: {n} entradas ({path.stat().st_size / 1024:.1f} KB)")
    return True


def avisar(vueltos: list[dict]) -> bool:
    """Aviso al teléfono del dueño, si toca y si hay algo que decir.

    El texto se congela en la bandeja del móvil hasta que lo deslizan, así que
    el número tiene que ser verdad AHORA: se cuenta contra el catálogo propio
    en este mismo momento, no contra lo que hubiera cuando se detectó.
    """
    if not vueltos:
        return False
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        from send_notifications import init_firebase, enviar_push_admin, es_hora_diurna
    except ImportError as e:
        print(f"ℹ️ Sin push (no se pudo importar send_notifications): {e}")
        return False
    if not es_hora_diurna():
        print("ℹ️ Fuera de horario diurno: no se avisa.")
        return False
    messaging_api, database = init_firebase()
    if not (messaging_api and database):
        print("ℹ️ Sin Firebase: no se avisa.")
        return False

    ref = database.reference("admin_meta/comparacion_principal")
    try:
        previo = ref.get() or {}
    except Exception as e:
        print(f"⚠️ No se pudo leer admin_meta/comparacion_principal: {e}", file=sys.stderr)
        previo = {}
    ahora = time.time()
    ultimo = float(previo.get("ultimoAviso") or 0) if isinstance(previo, dict) else 0.0
    if ultimo and (ahora - ultimo) < AVISO_COOLDOWN_S:
        print("ℹ️ Avisado hace poco; se deja para la próxima.")
        return False

    n = len(vueltos)
    titulo = ("🔄 La principal repuso 1 producto que tienes agotado" if n == 1
              else f"🔄 La principal repuso {n} productos que tienes agotados")
    nombres = ", ".join(f["nombre"] for f in vueltos[:3])
    cuerpo = (f"{nombres}{'…' if n > 3 else ''}. "
              "Actualiza el stock y vuelven a venderse: Comparar → Repuestos.")
    if enviar_push_admin(messaging_api, database, titulo, cuerpo,
                         link="/admin.html#comparar", tag="comparar-repuestos"):
        try:
            ref.update({"ultimoAviso": ahora, "repuestos": n})
        except Exception as e:
            print(f"⚠️ No se pudo guardar el aviso: {e}", file=sys.stderr)
        return True
    return False


def main() -> int:
    try:
        productos = descargar()
    except Exception as e:
        # Que la principal esté caída no puede tumbar el cron ni, sobre todo,
        # borrar el fichero anterior: un catálogo de hace tres horas sirve,
        # uno vacío deja la pantalla diciendo que no falta nada.
        print(f"⚠️ No se pudo leer el catálogo de la principal: {e}", file=sys.stderr)
        return 0
    if not productos:
        print("⚠️ La principal devolvió 0 productos; no se toca el fichero.", file=sys.stderr)
        return 0

    antes = leer_anterior()
    vueltos = reposiciones(antes, productos)
    try:
        catalogo_mio = json.loads(MIOS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        catalogo_mio = []
    relevantes = mios_agotados(catalogo_mio, vueltos) if catalogo_mio else vueltos

    ligero, fichas = partir(productos, catalogo_mio)
    escribir(SALIDA, {
        "actualizado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "origen": PRINCIPAL_WEB,
        "total": len(ligero),
        "productos": ligero,
    }, "productos")
    escribir(FICHAS, {
        "actualizado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fichas": fichas,
    }, "fichas")

    if vueltos:
        print(f"🔄 Reposiciones en la principal: {len(vueltos)}"
              f" · de esas, agotadas en mi web: {len(relevantes)}")
    if relevantes:
        avisar(relevantes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
