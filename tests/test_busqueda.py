"""
El buscador de la tienda: un solo predicado, y que encuentre lo que el nombre
ya no dice.

Había TRES copias del filtro —tm-product, tm-ui y tm-iife— y ninguna miraba los
mismos campos: una incluía subcategoría, otra no, y ninguna miraba la ficha.
Eso no se ve como un fallo: salen resultados, sólo que menos, y nadie sabe lo
que no salió.

Dos cosas lo volvieron urgente:

  - La tienda pública carga `productos-lite.json`, que va SIN `descripcion`.
    Los tres filtros la miraban igual, así que ese campo no aportaba nada en el
    sitio real aunque en `productos.json` estuviera lleno. Cualquier
    razonamiento del tipo "esa palabra sigue en la descripción" era falso.
  - Al acortar los nombres (para que dos tarjetas no se lean iguales en el
    móvil) salieron de ahí palabras que el cliente sí escribe: "Router",
    "Antena CPE", "Cámara de Seguridad", "Juego". Con el filtro viejo, quitar
    "Router" del nombre dejaba la búsqueda «router» en CERO resultados.

Por eso este test cruza consultas reales contra el catálogo lite —el que se
sirve— usando el mismo texto buscable que arma tm-data.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
LITE = RAIZ / "productos-lite.json"
TM_DATA = RAIZ / "js" / "src" / "tm-data.src.js"
FILTROS = {
    "tm-product": RAIZ / "js" / "src" / "tm-product.src.js",
    "tm-ui": RAIZ / "js" / "src" / "tm-ui.src.js",
    "tm-iife": RAIZ / "js" / "src" / "tm-iife.src.js",
}


def _texto_buscable(p):
    """Espejo de _tmTextoBuscable() en js/src/tm-data.src.js."""
    trozos = [p.get("nombre"), p.get("descripcion"), p.get("categoria"), p.get("subcategoria")]
    for f in p.get("ficha") or []:
        if isinstance(f, dict):
            trozos += [f.get("k"), f.get("v"), f.get("nota")]
    if isinstance(p.get("specs"), list):
        trozos.append(" ".join(str(s) for s in p["specs"]))
    return " ".join(str(t) for t in trozos if t).lower()


def _coincide(p, q):
    """Espejo de tmCoincideBusqueda(), sin el aproximado (que es un extra)."""
    texto = _texto_buscable(p)
    if q in texto:
        return True
    palabras = q.split()
    return len(palabras) > 1 and all(w in texto for w in palabras)


def _buscar(catalogo, q):
    q = q.lower()
    return [p for p in catalogo if _coincide(p, q)]


class BuscadorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lite = json.loads(LITE.read_text(encoding="utf-8"))

    def test_el_lite_no_trae_descripcion(self):
        # Si algún día el lite empezara a traerla, la premisa de este test
        # cambia y conviene enterarse aquí y no en la tienda.
        con = [p["id"] for p in self.lite if (p.get("descripcion") or "").strip()]
        self.assertEqual(con, [], "productos-lite.json volvió a traer descripcion")

    def test_los_tres_filtros_llaman_al_mismo_helper(self):
        # La duplicación es la causa raíz: tres listas de campos que divergen.
        for nombre, ruta in FILTROS.items():
            src = ruta.read_text(encoding="utf-8")
            self.assertIn("tmCoincideBusqueda(", src,
                          f"{nombre} dejó de usar el helper compartido")
        # Y que nadie haya vuelto a escribir el predicado a mano.
        for nombre, ruta in FILTROS.items():
            src = ruta.read_text(encoding="utf-8")
            suelto = re.search(r"\.nombre\s*(\|\|\s*'')?\s*\)?\.toLowerCase\(\)\.includes\(q\)", src)
            self.assertIsNone(suelto,
                              f"{nombre} volvió a filtrar por su cuenta en vez de usar el helper")

    def test_el_helper_existe_y_mira_la_ficha(self):
        src = TM_DATA.read_text(encoding="utf-8")
        self.assertIn("function tmCoincideBusqueda", src)
        self.assertIn("function _tmTextoBuscable", src)
        self.assertIn("p.subcategoria", src)
        self.assertIn("p.ficha", src)
        self.assertIn("p.specs", src)

    def test_encuentra_lo_que_el_nombre_ya_no_dice(self):
        # Cada una de estas palabras salió de algún nombre al acortarlo. Tienen
        # que seguir encontrándose por subcategoría, ficha o specs.
        MINIMOS = {
            "router": 10,          # se quitó de 14 nombres
            "antena cpe": 4,
            "cámara de seguridad": 3,
            "juego de llantas": 4,
            "pistola": 2,
            "ubiquiti": 6,         # la marca vive en la ficha, no en el nombre
            "zosi": 3,
            "controlador": 6,
            "mppt": 8,
            "creatina": 3,
            "nanostation": 4,
        }
        flojas = {}
        for q, minimo in MINIMOS.items():
            n = len(_buscar(self.lite, q))
            if n < minimo:
                flojas[q] = f"{n} < {minimo}"
        self.assertEqual(flojas, {}, f"consultas que devuelven menos de lo debido: {flojas}")

    def test_busca_palabra_a_palabra_no_la_frase_entera(self):
        # "antena cpe" no está literalmente dentro de "ANTENAS Y CPE", pero las
        # dos palabras sí: buscar la frase entera devolvía cero.
        self.assertGreater(len(_buscar(self.lite, "antena cpe")), 0)
        self.assertGreater(len(_buscar(self.lite, "cpe antena")), 0,
                           "el orden de las palabras no debería importar")

    def test_no_devuelve_el_catalogo_entero(self):
        # El AND por palabras podría degenerar en "todo coincide" si alguien lo
        # cambiara a OR. Una consulta absurda tiene que dar cero.
        for q in ("xyzzy", "producto inexistente qwerty"):
            self.assertEqual(len(_buscar(self.lite, q)), 0, f"«{q}» devolvió resultados")


if __name__ == "__main__":
    unittest.main()
