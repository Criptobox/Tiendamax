"""Cada camino del navegador a la RTDB, contra la regla que le aplica.

Nada de esto se puede probar contra la base real desde CI, pero sí se puede
comprobar que no exista una llamada a una ruta que las reglas deniegan: el
patrón habitual aquí es `.catch(()=>{})` sin mirar `res.ok`, así que un 403 no
deja rastro y la función parece funcionar.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

FUENTES = ([p for p in (RAIZ / "js").glob("*.js") if "tm-bundle" not in p.name]
           + list((RAIZ / "js" / "src").glob("*.src.js"))
           + [RAIZ / "admin.html", RAIZ / "index.html"])

RUTA = re.compile(r"(?:base|rtdbUrl|rtdb|url|db)\s*(?:\+\s*['\"]/|\}/)([\w]+)")

# Trozos de otras URLs (GitHub API, etc.) que el patrón recoge de rebote.
NO_SON_NODOS = {"repos", "contents", "git", "actions", "api", "raw", "http", "https"}


def _texto():
    return "\n".join(f.read_text(encoding="utf-8", errors="ignore")
                     for f in FUENTES if f.is_file())


class RutasConReglaTest(unittest.TestCase):

    def test_toda_ruta_que_usa_el_navegador_tiene_regla(self):
        # Sin regla propia manda la raíz, que es .read/.write false: la llamada
        # se rechaza siempre y, como nadie mira el status, en silencio.
        usadas = set(RUTA.findall(_texto())) - NO_SON_NODOS
        sin_regla = sorted(r for r in usadas if r not in REGLAS)
        self.assertEqual([], sin_regla,
                         "rutas que la raíz deniega por no tener regla propia")


class CaminosQueLaReglaDeniegaTest(unittest.TestCase):
    """Casos concretos que ya mordieron: borrar un nodo padre cuya escritura
    solo está concedida en el hijo."""

    def test_avisos_stock_se_vacia_hijo_a_hijo(self):
        # avisos_stock/$productId no concede escritura; solo $tokenId. Borrar
        # el padre devolvía 403 y la lista quedaba intacta.
        alcance = REGLAS["avisos_stock"]["$productId"]
        self.assertNotIn(".write", alcance)
        self.assertIs(True, alcance["$tokenId"][".write"])
        for f in (RAIZ / "js" / "src" / "tm-ui.src.js", RAIZ / "admin.html"):
            src = f.read_text(encoding="utf-8")
            self.assertNotRegex(
                src,
                r"avisos_stock/'\s*\+\s*\w+\s*\+\s*'\.json'\s*,\s*\{\s*method:\s*'DELETE'",
                f"{f.name}: no se puede borrar el nodo del producto entero")

    def test_el_countdown_no_se_borra_por_una_respuesta_vacia(self):
        # configuracion es .write false, así que activeCountdown nunca llega a
        # Firebase; leer null y borrar el local dejaba a los clientes sin la
        # oferta por tiempo limitado a los 0,8 s de cargar.
        self.assertIs(False, REGLAS["configuracion"][".write"])
        src = (RAIZ / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")
        i = src.index("configuracion/activeCountdown")
        cuerpo = src[i:i + 1400]
        self.assertIn("fbCd.endTime <= Date.now()", cuerpo,
                      "solo se limpia si Firebase dice que caducó, no si viene vacío")


if __name__ == "__main__":
    unittest.main()
