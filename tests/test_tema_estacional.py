"""
Tema de temporada (Navidad / Halloween): la fecha lo propone y el dueño lo
confirma, lo cambia o lo apaga en ⚙️ Configuración (config.json → tema).

El comportamiento se comprueba en el navegador (tests/tema_check.mjs). Aquí,
lo que se ve sin navegador.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
INDEX = (RAIZ / "index.html").read_text(encoding="utf-8")
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")
CSS = (RAIZ / "css" / "tema-estacional.css").read_text(encoding="utf-8")


def _regla(html):
    m = re.search(r'<script id="tm-tema-regla">.*?</script>', html, re.S)
    return m.group(0) if m else None


class TemaEstacionalTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "tema_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=240)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_la_regla_es_la_misma_en_la_tienda_y_en_el_panel(self):
        # Dos copias distintas y el panel diría "toca Navidad" mientras la tienda no.
        self.assertIsNotNone(_regla(INDEX))
        self.assertEqual(_regla(INDEX), _regla(ADMIN))

    def test_la_regla_va_antes_que_cualquier_estilo(self):
        # Se viste antes de pintar: si el atributo llega después del CSS, parpadea.
        self.assertLess(INDEX.index('id="tm-tema-regla"'), INDEX.index("<link"))

    def test_sin_atributo_el_css_no_hace_nada(self):
        # Cada selector del fichero cuelga de [data-tema…]: fuera de temporada no cuesta nada.
        sin_comentarios = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)
        sin_keyframes = re.sub(r"@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", sin_comentarios)
        for bloque in re.findall(r"([^{}]+)\{[^{}]*\}", sin_keyframes):
            for sel in bloque.split(","):
                sel = sel.strip()
                if not sel or sel.startswith("@"):
                    continue
                self.assertIn("data-tema", sel, f"selector sin data-tema: {sel!r}")

    def test_publicar_la_tienda_lleva_el_tema(self):
        # "Actualizar tienda" reescribe config.json entero: sin esto deshace la elección.
        src = (RAIZ / "js" / "src" / "tm-catalog.src.js").read_text(encoding="utf-8")
        self.assertIn("tmTemaParaSubir", src)
        self.assertIn("window.tmTemaParaSubir", ADMIN)

    def test_el_panel_no_sube_config_sin_haberlo_leido(self):
        # Subir solo {tema} dejaría la tienda sin tasa ni Firebase.
        self.assertIn("no pude leer config.json", ADMIN)


class IconoDeLaAppTest(unittest.TestCase):
    """El icono de la app instalada: manifest.json según el tema (scripts/tema_icono.py)."""

    def setUp(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("tema_icono", RAIZ / "scripts" / "tema_icono.py")
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)

    def test_la_regla_de_python_es_la_de_la_tienda(self):
        # Tercera copia de la regla: se compara con la de index.html día a día durante dos años.
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        from datetime import date, timedelta
        regla = re.search(r'<script id="tm-tema-regla">(.*?)</script>', INDEX, re.S).group(1)
        cfgs = [None, {"modo": "off", "temporada": "navidad-2026", "ts": 0},
                {"modo": "halloween", "ts": "T"}, {"modo": "navidad", "ts": "T"}, {"modo": "auto", "ts": 1}]
        js = "var window = globalThis;" + regla + """
const cfgs = %s, out = [];
for (let d = new Date(2026, 0, 1, 12); d < new Date(2028, 0, 1); d.setDate(d.getDate() + 1)) {
  const ahora = new Date(2026, 9, 20, 12).getTime();
  out.push(cfgs.map(c => tmTemaEfectivo(c && c.ts === 'T' ? Object.assign({}, c, {ts: ahora}) : c, d)).join(','));
}
console.log(JSON.stringify(out));""" % json.dumps(cfgs)
        r = subprocess.run([node, "-e", js], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        de_js = json.loads(r.stdout)
        from datetime import datetime
        ahora = datetime(2026, 10, 20, 12).timestamp() * 1000
        d, i = date(2026, 1, 1), 0
        while d < date(2028, 1, 1):
            de_py = ",".join(self.m.tema_efectivo(dict(c, ts=ahora) if c and c.get("ts") == "T" else c,
                                                 d, datetime(d.year, d.month, d.day, 12).timestamp() * 1000)
                             for c in cfgs)
            self.assertEqual(de_py, de_js[i], f"{d}: Python {de_py} / JS {de_js[i]}")
            d += timedelta(days=1); i += 1

    def test_cada_icono_del_manifest_existe_en_cada_tema(self):
        manifest = json.loads((RAIZ / "manifest.json").read_text(encoding="utf-8"))
        for tema in ("navidad", "halloween", ""):
            for icono in self.m.aplicar(manifest, tema)["icons"]:
                self.assertTrue((RAIZ / icono["src"].lstrip("/")).exists(), icono["src"])
        # Y volver al tema "ninguno" deja el manifest como el de siempre.
        base = self.m.aplicar(self.m.aplicar(manifest, "navidad"), "")
        self.assertEqual([i["src"] for i in base["icons"]], [self.m.icono(i["src"], "") for i in manifest["icons"]])

    def test_el_manifest_publicado_esta_fuera_de_temporada_o_en_la_suya(self):
        # Lo que hay en el repo tiene que ser uno de los tres juegos, nunca una mezcla.
        manifest = json.loads((RAIZ / "manifest.json").read_text(encoding="utf-8"))
        carpetas = {i["src"].rsplit("/", 1)[0] for i in manifest["icons"]}
        self.assertEqual(len(carpetas), 1, carpetas)

    def test_el_workflow_corre_cada_dia_y_cuando_cambia_config(self):
        wf = (RAIZ / ".github" / "workflows" / "tema-icono.yml").read_text(encoding="utf-8")
        self.assertIn("cron:", wf)
        self.assertIn("config.json", wf)
        self.assertIn("scripts/tema_icono.py", wf)
        self.assertIn("pages.yml/dispatches", wf)


if __name__ == "__main__":
    unittest.main()
