"""
Los manifests de las apps instalables y sus accesos directos.

Nada de esto falla de forma visible. Un manifest que apunta a un icono que no
existe se instala igual, con el icono por defecto; un acceso directo cuya URL
cae fuera del `scope` Chrome lo descarta sin decir nada y el menú del icono
sale con un elemento menos; y un acceso a `/admin.html#agregar` cuando esa
vista se ha renombrado abre el panel en Inicio como si nada. En los tres casos
el único síntoma es que la pantalla de inicio del móvil no hace lo que debía.

De ahí que se compruebe contra el disco: que cada archivo referenciado esté,
que mida lo que dice medir, y que cada destino exista de verdad.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# manifest -> página que lo enlaza
MANIFIESTOS = {
    "manifest.json": "index.html",
    "vale-manifest.json": "vale.html",
    "admin-manifest.json": "admin.html",
}


def cargar(nombre):
    return json.loads((ROOT / nombre).read_text(encoding="utf-8"))


def ruta_de(src):
    """'/iconos/x.png' -> Path del repo."""
    return ROOT / src.lstrip("/")


class ManifiestosTest(unittest.TestCase):
    def test_json_valido_y_enlazado(self):
        for nombre, pagina in MANIFIESTOS.items():
            with self.subTest(manifest=nombre):
                self.assertTrue((ROOT / nombre).exists(), f"falta {nombre}")
                cargar(nombre)  # revienta si el JSON está roto
                html = (ROOT / pagina).read_text(encoding="utf-8")
                self.assertIn(
                    f'rel="manifest" href="/{nombre}"', html,
                    f"{pagina} no enlaza /{nombre}: sin eso no es instalable",
                )

    def test_iconos_existen_y_miden_lo_que_dicen(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow no está disponible")
        for nombre in MANIFIESTOS:
            man = cargar(nombre)
            for ico in man.get("icons", []):
                with self.subTest(manifest=nombre, icono=ico["src"]):
                    p = ruta_de(ico["src"])
                    self.assertTrue(p.exists(), f"{nombre}: no existe {ico['src']}")
                    with Image.open(p) as im:
                        w, h = im.size
                    self.assertEqual(
                        f"{w}x{h}", ico["sizes"],
                        f"{ico['src']} mide {w}x{h} pero el manifest dice {ico['sizes']}",
                    )

    def test_instalable_en_android(self):
        """Chrome pide 192 y 512 'any', y un maskable para que no salga recortado."""
        for nombre in MANIFIESTOS:
            man = cargar(nombre)
            with self.subTest(manifest=nombre):
                tam = {
                    i["sizes"]
                    for i in man.get("icons", [])
                    if "maskable" not in i.get("purpose", "any")
                }
                self.assertIn("192x192", tam, f"{nombre}: falta el icono 192x192")
                self.assertIn("512x512", tam, f"{nombre}: falta el icono 512x512")
                for campo in ("name", "start_url", "display"):
                    self.assertTrue(man.get(campo), f"{nombre}: falta {campo}")

    def test_apps_distintas_no_se_pisan(self):
        """Dos manifests con la misma identidad son la MISMA app para Chrome:
        instalar una reemplazaría a la otra. La identidad es `id`, y si no
        está, el `start_url`."""
        ids = {}
        for nombre in MANIFIESTOS:
            man = cargar(nombre)
            ident = man.get("id") or man["start_url"]
            self.assertNotIn(
                ident, ids,
                f"{nombre} y {ids.get(ident)} comparten identidad '{ident}': "
                "para Chrome serían la misma app instalada",
            )
            ids[ident] = nombre

    def test_el_scope_no_pisa_al_de_la_tienda(self):
        """Con los dos en "/", Chrome ve /admin.html dentro de una app ya
        instalada y ofrece "añadir acceso directo" —un marcador, sin menú— en
        vez de instalar. Sin instalar no hay accesos directos."""
        tienda = cargar("manifest.json")["scope"]
        gestion = cargar("admin-manifest.json")["scope"]
        self.assertNotEqual(tienda, gestion, "dos apps del mismo origen no pueden compartir scope")
        self.assertTrue(gestion.startswith(tienda),
                        "el scope de gestión debe ser una rama del de la tienda")
        self.assertNotEqual(gestion, "/", "y no puede ser la raíz entera")

    def test_accesos_directos(self):
        man = cargar("admin-manifest.json")
        atajos = man.get("shortcuts", [])
        self.assertTrue(atajos, "la app de gestión existe justamente por sus accesos directos")

        scope = man.get("scope", "/")
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        vistas = set(re.findall(r'id="view-([a-z0-9_-]+)"', admin))

        for a in atajos:
            with self.subTest(atajo=a.get("name")):
                self.assertTrue(a.get("name"), "un acceso directo sin nombre no se puede tocar")
                url = a["url"]
                # Fuera del scope, Chrome lo descarta en silencio.
                self.assertTrue(
                    url.startswith(scope),
                    f"'{url}' está fuera del scope '{scope}': Chrome lo tira sin avisar",
                )
                camino, _, ancla = url.partition("#")
                p = ROOT / camino.lstrip("/")
                self.assertTrue(p.exists(), f"'{camino}' no existe en el repo")
                if ancla == "vale":
                    # El vale es otra página, fuera del scope de la app. Llega
                    # por un ancla porque un acceso directo fuera de scope lo
                    # descarta Chrome sin avisar.
                    self.assertTrue((ROOT / "vale.html").exists())
                    self.assertIn("window.open('vale.html'", admin)
                elif ancla:
                    self.assertIn(
                        ancla, vistas,
                        f"'{url}' apunta a la vista '{ancla}', que no existe en admin.html "
                        f"(hay: {', '.join(sorted(vistas))})",
                    )
                for ico in a.get("icons", []):
                    q = ruta_de(ico["src"])
                    self.assertTrue(q.exists(), f"falta el icono {ico['src']}")
                    self.assertEqual(
                        "96x96", ico["sizes"],
                        "Android pide 96x96 para los iconos de accesos directos",
                    )

    def test_admin_abre_la_vista_del_ancla(self):
        """Sin esto los accesos directos con # caen todos en Inicio y no sirven."""
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        self.assertIn("function _vistaDeLaUrl()", admin)
        self.assertIn("hashchange", admin, "también al cambiar de # estando ya abierto")

    def test_los_accesos_de_admin_no_salen_en_la_tienda(self):
        """El manifest público lo instalan los clientes: si se le cuelan los
        accesos del panel, cualquiera que mantenga pulsado el icono de
        TiendaMax ve la puerta del admin."""
        tienda = cargar("manifest.json")
        for a in tienda.get("shortcuts", []):
            url = a.get("url", "")
            self.assertNotIn("admin", url.lower(), f"acceso de admin en el manifest público: {url}")
            self.assertNotIn("vale", url.lower(), f"acceso de gestión en el manifest público: {url}")


if __name__ == "__main__":
    unittest.main()
