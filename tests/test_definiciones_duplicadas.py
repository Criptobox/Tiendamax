"""
Funciones del bundle definidas en más de un módulo.

Los `js/src/*.src.js` se concatenan en un único ámbito global, así que dos
módulos que declaran el mismo nombre no dan error: uno pisa al otro y el
perdedor queda inalcanzable. El código sigue ahí, se lee como si funcionara, y
quien lo arregle estará editando una copia muerta.

No es hipotético. Al añadir los precios en moneda nacional hubo que impedir que
el conmutador USD/MN reescribiera un precio fijo en pesos. La guarda se puso en
`actualizarPreciosMostrados` de tm-patches.src.js —que es la ÚLTIMA en el orden
de concatenación, o sea la que uno supone que gana— y no pasó nada: la que
corre de verdad es la de tm-iife.src.js, que la REASIGNA en tiempo de carga.
Una declaración se iza al principio; una asignación se ejecuta después. El
orden de los ficheros no lo dice.

Esta prueba no exige arreglar las que ya están —son de producción y cada una
necesita comprobarse en el navegador—, pero sí que no aparezcan nuevas.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "js" / "src"
BUILD = RAIZ / "scripts" / "build_js_bundle.py"

# Las que ya estaban el día que se puso esta prueba. Cada una es una copia
# muerta esperando a que alguien la edite por error. La lista solo debe
# ENCOGER: si arreglás una, bórrala de aquí.
# Siete de estas ENVUELVEN a la original y la siguen llamando por una
# referencia guardada antes de reasignar: eso es el patrón decorador, no código
# muerto, y está bien. Las que dejan una copia inalcanzable son las que
# REEMPLAZAN sin llamarla:
#
#   filtrarPorCategoria   la de tm-catalog está muerta
#   stat                  la de tm-data está muerta
#
# (actualizarPreciosMostrados era la tercera y ya está unificada.)
CONOCIDAS = {
    "renderizarProductos", "agregarAlCarrito", "mostrarVistaCategoria",
    "renderizarMasVendidos", "guardarProductos", "abrirDetalleProducto",
    "actualizarBotonesCategorias",
}


def _modulos_del_bundle():
    txt = BUILD.read_text(encoding="utf-8")
    bloque = txt[txt.index("ORDEN = ["):]
    bloque = bloque[: bloque.index("]")]
    return [m[:-3] for m in re.findall(r'"([\w-]+\.js)"', bloque)]


def _definiciones():
    """nombre -> {módulos que lo definen}"""
    porNombre = {}
    for mod in _modulos_del_bundle():
        f = SRC / f"{mod}.src.js"
        if not f.is_file():
            continue
        texto = f.read_text(encoding="utf-8")
        # Solo las de NIVEL SUPERIOR: una función anidada es local y no
        # colisiona con nada. Sin anclar a la columna 0 salían "init", "stat" y
        # "step" —helpers internos de tres módulos distintos— como si se
        # pisaran, y el ruido tapa los casos de verdad.
        nombres = set(re.findall(r"^function\s+([A-Za-z_$][\w$]*)\s*\(", texto, re.M))
        nombres |= set(re.findall(r"^\s*([A-Za-z_$][\w$]*)\s*=\s*function\s*\(", texto, re.M))
        for n in nombres:
            porNombre.setdefault(n, set()).add(mod)
    return porNombre


class DefinicionesDuplicadasTest(unittest.TestCase):
    def test_no_aparecen_nuevas_definiciones_duplicadas(self):
        dup = {n: m for n, m in _definiciones().items() if len(m) > 1}
        nuevas = sorted(set(dup) - CONOCIDAS)
        self.assertEqual(
            [], nuevas,
            "estas funciones quedaron definidas en más de un módulo del bundle:\n  "
            + "\n  ".join(f"{n}  ({', '.join(sorted(dup[n]))})" for n in nuevas)
            + "\n\nUna pisa a la otra y la perdedora queda inalcanzable, pero se "
            "sigue leyendo como si funcionara. Renombrá una, o dejá una sola y "
            "que la otra la llame.",
        )

    def test_la_lista_conocida_no_tiene_sobrantes(self):
        # Si alguien arregla una duplicación y no la quita de CONOCIDAS, la
        # lista deja de reflejar la deuda real y empieza a tapar casos nuevos.
        dup = {n for n, m in _definiciones().items() if len(m) > 1}
        sobran = sorted(CONOCIDAS - dup)
        self.assertEqual(
            [], sobran,
            f"ya no están duplicadas: quitalas de CONOCIDAS en {Path(__file__).name}",
        )
