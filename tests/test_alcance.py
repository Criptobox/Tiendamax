"""Funciones que el navegador no puede llegar a ejecutar.

`test_codigo_muerto.py` cuenta REFERENCIAS: si alguien nombra a f, f está viva.
Eso no ve los corrillos. En revolico_integration.js había 23 funciones —los
botones de "Compartir como Estado", el selector de grupos de Facebook, el lienzo
de la historia— que se llamaban unas a otras y por eso ninguna aparecía sin
referencias; pero la única puerta de entrada al grupo era renderTabPublicar, que
pintaba en un contenedor que no existe. Nadie podía llegar ahí desde el
navegador, y aun así el bundle se lo bajaba cada cliente.

Esta prueba parte de las RAÍCES —el HTML, con sus onclick y sus data-action, y
el código de nivel superior de cada .js, que se ejecuta seguro— y sigue las
llamadas. Lo que no se alcanza desde ahí, no se ejecuta nunca.

Dos detalles que costaron dos falsos positivos cada uno mientras se escribía:

  · La clave es (archivo, posición), no el nombre. tmColorCategoria está
    definida en dos archivos y tm-patches redefine abrirDetalleProducto dos
    veces en el mismo archivo; indexar por nombre pisa cuerpos en silencio y da
    por muertas funciones que sí se llaman.
  · Al llamar un nombre se marcan TODAS sus definiciones. Cuál gana en tiempo
    de ejecución depende del orden de carga del bundle, y darlo por supuesto es
    justo como se borra la copia que sí se usa.

La cuenta es conservadora a propósito: se buscan identificadores en TODO el
texto, cadenas y comentarios incluidos. Prefiere dejar viva una función muerta
antes que matar una viva.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FUENTES = (sorted(ROOT.glob("js/src/*.src.js"))
           + [p for p in sorted(ROOT.glob("js/*.js")) if p.name != "tm-bundle.js"])
PAGINAS = [p for pat in ("*.html", "p/*.html", "c/*.html") for p in sorted(ROOT.glob(pat))]

IDENTIFICADOR = re.compile(r"[A-Za-z_$][\w$]*")
DEFINICIONES = (
    re.compile(r"^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(", re.M),
    re.compile(r"^[ \t]*(?:window\.)?([A-Za-z_$][\w$]*)[ \t]*=[ \t]*"
               r"(?:async[ \t]+)?function[ \t]*\(", re.M),
)


def fin_de_bloque(t, i):
    """Índice de la llave que cierra el bloque abierto en/desde `i`.

    Escáner de caracteres, no regex: tiene que entender cadenas, plantillas con
    `${}` anidado, comentarios y literales de expresión regular. Una regex ya se
    comió una función vecina intentando esto.
    """
    n = len(t)
    while i < n and t[i] != "{":
        i += 1
    if i >= n:
        return None
    antes_regex = set("(,=:[!&|?{};+-*%~^")

    def es_regex(k):
        m = k - 1
        while m >= 0 and t[m] in " \t\n":
            m -= 1
        return m < 0 or t[m] in antes_regex

    prof, j = 0, i
    while j < n:
        c = t[j]
        if c == "/" and j + 1 < n and t[j + 1] not in "/*" and es_regex(j):
            j += 1
            clase = False
            while j < n:
                if t[j] == "\\":
                    j += 2
                    continue
                if t[j] == "[":
                    clase = True
                elif t[j] == "]":
                    clase = False
                elif t[j] == "/" and not clase:
                    break
                elif t[j] == "\n":
                    break
                j += 1
            j += 1
            continue
        if c == "/" and j + 1 < n and t[j + 1] == "/":
            k = t.find("\n", j)
            j = n if k < 0 else k
            continue
        if c == "/" and j + 1 < n and t[j + 1] == "*":
            k = t.find("*/", j + 2)
            j = n if k < 0 else k + 2
            continue
        if c in "'\"":
            q = c
            j += 1
            while j < n and t[j] != q:
                j += 2 if t[j] == "\\" else 1
            j += 1
            continue
        if c == "`":
            j += 1
            while j < n:
                if t[j] == "\\":
                    j += 2
                    continue
                if t[j] == "`":
                    break
                if t[j] == "$" and j + 1 < n and t[j + 1] == "{":
                    k, d = j + 2, 1
                    while k < n and d:
                        if t[k] == "{":
                            d += 1
                        elif t[k] == "}":
                            d -= 1
                        elif t[k] in "'\"":
                            q = t[k]
                            k += 1
                            while k < n and t[k] != q:
                                k += 2 if t[k] == "\\" else 1
                        elif t[k] == "`":
                            k += 1
                            while k < n and t[k] != "`":
                                k += 2 if t[k] == "\\" else 1
                        k += 1
                    j = k
                    continue
                j += 1
            j += 1
            continue
        if c == "{":
            prof += 1
        elif c == "}":
            prof -= 1
            if prof == 0:
                return j
        j += 1
    return None


class AlcanceTest(unittest.TestCase):
    def test_toda_funcion_se_puede_alcanzar_desde_el_html(self):
        cuerpo, nombre_de, por_nombre, nivel_superior = {}, {}, {}, []

        for p in FUENTES:
            t = p.read_text(encoding="utf-8", errors="replace")
            tramos = []
            for rx in DEFINICIONES:
                for m in rx.finditer(t):
                    f = fin_de_bloque(t, m.end())
                    if f is not None:
                        tramos.append((m.start(), f + 1, m.group(1)))
            tramos.sort()
            sueltas, ultimo = [], -1
            for a, b, n in tramos:          # descarta las anidadas
                if a >= ultimo:
                    sueltas.append((a, b, n))
                    ultimo = b
            pos = 0
            for a, b, n in sueltas:
                nivel_superior.append(t[pos:a])
                pos = b
                k = (p.name, a)
                cuerpo[k] = t[a:b]
                nombre_de[k] = n
                por_nombre.setdefault(n, []).append(k)
            nivel_superior.append(t[pos:])

        raices = set()
        for p in PAGINAS:
            raices |= set(IDENTIFICADOR.findall(p.read_text(encoding="utf-8",
                                                            errors="replace")))
        for trozo in nivel_superior:
            raices |= set(IDENTIFICADOR.findall(trozo))

        self.assertIn("inicializarTienda", raices,
                      "las raíces salieron vacías: el análisis no vale nada")

        vivas, pendientes = set(), [k for k in cuerpo if nombre_de[k] in raices]
        while pendientes:
            k = pendientes.pop()
            if k in vivas:
                continue
            vivas.add(k)
            for otro in set(IDENTIFICADOR.findall(cuerpo[k])):
                for k2 in por_nombre.get(otro, ()):
                    if k2 not in vivas:
                        pendientes.append(k2)

        muertas = sorted((nombre_de[k], k[0]) for k in set(cuerpo) - vivas)
        self.assertEqual(
            muertas, [],
            "nada de esto se puede ejecutar: no hay camino desde ningún HTML "
            "ni desde el código de arranque. O falta el botón que abría esa "
            "puerta, o sobra el código:\n"
            + "\n".join(f"  {n}  ({arch})" for n, arch in muertas),
        )


if __name__ == "__main__":
    unittest.main()
