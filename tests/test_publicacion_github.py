"""
Que todo lo que el admin publica a GitHub pase por subirArchivoAGitHub().

Publicar es un read-modify-write contra un repo que los workflows tocan varias
veces al día: se lee el sha del fichero, se manda el PUT, y si entre medias
alguien commiteó, GitHub responde 409 y NO escribe. Eso está bien — es lo que
evita pisar el cambio ajeno — pero solo si alguien reintenta con el sha nuevo.
subirArchivoAGitHub() lo hace; una copia a mano del PUT, no: le enseña
"HTTP 409" al admin y le pierde el trabajo. Así estaban combos.json y
banners.json.

El fallo es invisible en pruebas: solo aparece cuando el admin publica justo
mientras corre un workflow, y entonces parece cosa de la conexión.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "js" / "src" / "tm-catalog.src.js"

# Quien publica es tm-catalog; el resto debe llamarlo, no reimplementarlo.
FUENTES = [ROOT / "admin.html", ROOT / "index.html"] + [
    p for p in (ROOT / "js").glob("*.js") if "tm-bundle" not in p.name
] + [
    p for p in (ROOT / "js" / "src").glob("*.src.js") if p.name != "tm-catalog.src.js"
]

# fetch(<url con /contents/…>, { method: 'PUT' … }) escrito a mano.
PUT_A_MANO = re.compile(
    r"""fetch\(\s*[^;]{0,400}?api\.github\.com[^;]{0,400}?/contents/[^;]{0,400}?"""
    r"""method\s*:\s*['"]PUT['"]""",
    re.I | re.S,
)


class PublicacionGitHubTest(unittest.TestCase):
    def test_nadie_reimplementa_el_publicador(self):
        culpables = []
        for f in FUENTES:
            if not f.is_file():
                continue
            txt = f.read_text(encoding="utf-8", errors="ignore")
            for m in PUT_A_MANO.finditer(txt):
                linea = txt[: m.start()].count("\n") + 1
                culpables.append(f"{f.name}:{linea}")
        self.assertEqual(
            [], culpables,
            "PUT a la Contents API escrito a mano (sin reintento ante 409): "
            + ", ".join(culpables)
            + " — usa subirArchivoAGitHub(user, repo, token, ruta, datos)",
        )

    def test_el_publicador_sigue_reintentando_ante_conflicto(self):
        src = CATALOG.read_text(encoding="utf-8")
        m = re.search(r"async function subirArchivoAGitHub\(.*?\n\}", src, re.S)
        self.assertIsNotNone(m, "no se encontró subirArchivoAGitHub()")
        cuerpo = m.group(0)
        # Se comprueba con booleanos, no con assertIn sobre el cuerpo: si no,
        # el fallo escupe las 6 KB de la función y no se lee.
        self.assertTrue("409" in cuerpo,
                        "el publicador debe reconocer el 409 (conflicto de sha)")
        self.assertTrue(re.search(r"for\s*\([^)]*intento", cuerpo),
                        "el 409 debe reintentarse con sha fresco, no solo reportarse")
        # Reintentar con el MISMO sha da 409 otra vez, para siempre.
        reintento = cuerpo[cuerpo.find("intento"):]
        self.assertTrue("obtenerSHA()" in reintento,
                        "el reintento debe releer el sha; con el viejo vuelve a fallar")


if __name__ == "__main__":
    unittest.main()
