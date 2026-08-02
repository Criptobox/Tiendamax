"""Nadie anónimo puede DESTRUIR datos, y ningún secreto vive en un nodo público.

Dos propiedades, y las dos se rompieron de verdad en este repo:

1. Un DELETE de RTDB no lleva payload, así que `newData` es null y el patrón
   `proof` no puede protegerlo. Cualquier regla que empiece por
   `!newData.exists() || …` está concediendo el borrado a todo el mundo. La
   salida no es abrirlo: es que el admin marque en vez de borrar.

2. Un `proof` guardado dentro de un nodo con `.read: true` es el hash del
   admin publicado. Con él se forjan escrituras en admin_push_requests, o sea
   notificaciones push a todos los clientes de la tienda.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

# Nodos cuyo borrado destruye algo que no se puede recuperar.
NO_BORRABLES = {
    "ventas": ("$ventaId", "el historial de ventas"),
    "pedidos": ("$pedidoId", "los pedidos de los clientes"),
    "almacenes": ("$almId", "los almacenes"),
    "admin_tokens": ("$tokenId", "los tokens push del admin"),
    "lista_espera": (None, "los teléfonos de la lista de espera"),
}


def _concede_borrado(expr) -> bool:
    """Una regla concede DELETE si es True o si acepta que newData no exista."""
    if expr is True:
        return True
    if not isinstance(expr, str):
        return False
    return "!newData.exists()" in expr.replace(" ", "")


class SinBorradoAnonimoTest(unittest.TestCase):

    def test_los_nodos_criticos_no_se_pueden_borrar(self):
        fallos = []
        for nodo, (hijo, que) in NO_BORRABLES.items():
            alcance = REGLAS[nodo]
            if hijo and hijo in alcance:
                alcance = alcance[hijo]
                if _concede_borrado(alcance.get(".write")):
                    fallos.append(f"{nodo}/{hijo}: cualquiera puede borrar {que}")
            # y ninguna rama de más abajo puede reabrirlo
            for k, v in alcance.items():
                if isinstance(v, dict) and _concede_borrado(v.get(".write")):
                    fallos.append(f"{nodo}/…/{k}: cualquiera puede borrar {que}")
        self.assertEqual([], fallos, "\n".join(fallos))

    def test_ventas_y_almacenes_se_marcan_en_vez_de_borrarse(self):
        # Si el cliente vuelve a mandar DELETE, la regla lo rechaza y el dato
        # se queda — pero el panel lo sigue mostrando y parece que no funciona.
        for fichero, nodo in ((RAIZ / "admin.html", "ventas"),
                              (RAIZ / "admin.html", "almacenes"),
                              (RAIZ / "js" / "src" / "tm-ui.src.js", "ventas")):
            src = fichero.read_text(encoding="utf-8")
            for m in re.finditer(r"/" + nodo + r"/[^\n]{0,120}", src):
                trozo = m.group(0)
                if "method:'DELETE'" in trozo.replace(" ", "") and "/productos/" not in trozo:
                    self.fail(f"{fichero.name}: sigue borrando {nodo} → {trozo[:90]}")

    def test_el_panel_filtra_lo_anulado(self):
        admin = (RAIZ / "admin.html").read_text(encoding="utf-8")
        self.assertIn("!v.anulada", admin, "las ventas anuladas seguirían saliendo")
        self.assertIn("!v._borrado", admin, "los almacenes borrados seguirían saliendo")


class SinSecretosEnNodosPublicosTest(unittest.TestCase):

    def test_ningun_nodo_legible_guarda_un_proof(self):
        fallos = []

        def recorrer(nodo, ruta, legible):
            if not isinstance(nodo, dict):
                return
            # .read true en un ancestro cascadea hacia abajo y no se revoca
            legible = legible or nodo.get(".read") is True
            for k, v in nodo.items():
                if k.startswith("."):
                    continue
                if legible and k in ("proof", "_proof"):
                    fallos.append(f"{ruta}/{k} sería legible por cualquiera")
                recorrer(v, f"{ruta}/{k}", legible)

        recorrer(REGLAS, "", REGLAS.get(".read") is True)
        self.assertEqual([], fallos, "\n".join(fallos))


class SinEscrituraLibreTest(unittest.TestCase):
    """`.write: true` a secas deja sobrescribir y borrar a cualquiera."""

    # Los que quedan abiertos a propósito y por qué.
    TOLERADOS = {
        "tokens/$tokenId": "alta de suscriptor push desde el navegador",
        "avisos_stock/$productId/$tokenId": "alta y baja del propio aviso",
    }

    def test_no_hay_escrituras_totalmente_libres_sin_justificar(self):
        libres = []

        def recorrer(nodo, ruta):
            if not isinstance(nodo, dict):
                return
            if nodo.get(".write") is True and ruta.lstrip("/") not in self.TOLERADOS:
                libres.append(ruta.lstrip("/"))
            for k, v in nodo.items():
                if not k.startswith("."):
                    recorrer(v, f"{ruta}/{k}")

        recorrer(REGLAS, "")
        self.assertEqual([], sorted(libres),
                         "nodos con .write true sin justificar: " + str(sorted(libres)))

    def test_la_lista_de_espera_no_se_puede_pisar(self):
        # Lleva teléfonos dentro: sobrescribir o borrar no lo puede hacer nadie.
        w = REGLAS["lista_espera"]["$productoId"]["$entradaId"][".write"]
        self.assertEqual("!data.exists()", w)

    def test_el_contador_de_avisos_no_es_un_campo_libre(self):
        # Era .write true: cualquiera fijaba el "N personas esperando" que se
        # enseña en la ficha del producto.
        w = REGLAS["avisos_count"]["$productId"]["count"][".write"]
        self.assertIn("data.val() + 1", w)


if __name__ == "__main__":
    unittest.main()
