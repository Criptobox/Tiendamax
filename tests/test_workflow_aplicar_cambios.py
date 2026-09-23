"""El paso de regenerate-artifacts.yml que aplica lo que sube el panel.

Se ejecuta el `run:` tal cual, contra un repo git de prueba con su "origin",
porque lo que puede fallar aquí es justo lo que no se ve leyendo el YAML: que
el push choque con otro commit que entró mientras tanto (el bot de reseñas
commitea varias veces por hora) y el cambio del gestor se pierda o se aplique
dos veces.
"""
import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
WF = RAIZ / ".github" / "workflows" / "regenerate-artifacts.yml"


def paso():
    """El `run: |` del paso, sin depender de PyYAML (no está en el CI)."""
    texto = WF.read_text(encoding="utf-8")
    i = texto.index("- name: Aplicar los cambios del panel")
    i = texto.index("        run: |\n", i) + len("        run: |\n")
    lineas = []
    for l in texto[i:].splitlines():
        if l.strip() and not l.startswith("          "):
            break
        lineas.append(l[10:])
    return "\n".join(lineas).replace("${{ github.repository }}", "quien/repo")


def P(i, **kw):
    return dict({"id": i, "nombre": f"Producto {i}", "precioActual": 10, "stock": 1}, **kw)


@unittest.skipUnless(shutil.which("git"), "sin git")
class PasoAplicarTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.origin = self.tmp / "origin.git"
        self.trabajo = self.tmp / "trabajo"
        self.git(self.tmp, "init", "-q", "--bare", "-b", "main", str(self.origin))
        self.git(self.tmp, "clone", "-q", str(self.origin), str(self.trabajo))
        w = self.trabajo
        self.git(w, "config", "user.email", "t@t"); self.git(w, "config", "user.name", "t")
        (w / "scripts").mkdir()
        for f in ("aplicar_cambios.py", "build-productos-lite.py"):
            shutil.copy(RAIZ / "scripts" / f, w / "scripts" / f)
        (w / "productos.json").write_text(json.dumps([P(1), P(2)], indent=2, ensure_ascii=False), encoding="utf-8")
        self.git(w, "add", "."); self.git(w, "commit", "-q", "-m", "base"); self.git(w, "push", "-q", "origin", "main")
        # curl de mentira: apunta que se pidió el despliegue de Pages.
        self.bin = self.tmp / "bin"; self.bin.mkdir()
        (self.bin / "curl").write_text(f"#!/bin/sh\necho pages >> {self.tmp}/pages.log\n")
        (self.bin / "curl").chmod(0o755)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def git(self, cwd, *a):
        return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout

    def subir_cambio(self, nombre, d):
        """Lo que hace el panel: un commit con un fichero en cambios/."""
        w = self.trabajo
        (w / "cambios").mkdir(exist_ok=True)
        (w / "cambios" / nombre).write_text(json.dumps(d), encoding="utf-8")
        self.git(w, "add", "."); self.git(w, "commit", "-q", "-m", nombre); self.git(w, "push", "-q", "origin", "main")

    def correr(self, antes_del_push=None):
        runner = self.tmp / "runner"
        shutil.rmtree(runner, ignore_errors=True)
        self.git(self.tmp, "clone", "-q", str(self.origin), str(runner))
        if antes_del_push:
            antes_del_push()
        env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}", GH_TOKEN="x",
                   GIT_AUTHOR_NAME="bot", GIT_COMMITTER_NAME="bot",
                   GIT_AUTHOR_EMAIL="b@b", GIT_COMMITTER_EMAIL="b@b")
        return subprocess.run(["bash", "-e", "-c", paso()], cwd=runner, env=env,
                              capture_output=True, text=True)

    def main_ahora(self, ruta):
        return self.git(self.tmp, "--git-dir", str(self.origin), "show", f"main:{ruta}")

    def cambios_en_main(self):
        return self.git(self.tmp, "--git-dir", str(self.origin), "ls-tree", "--name-only", "main", "cambios/")

    def test_aplica_borra_publica_y_pide_pages(self):
        self.subir_cambio("1-a.json", {"v": 1, "productos": [P(2, stock=0)], "eliminados": [], "posiciones": {}})
        r = self.correr()
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertEqual(json.loads(self.main_ahora("productos.json"))[1]["stock"], 0)
        lite = json.loads(self.main_ahora("productos-lite.json"))
        self.assertEqual(lite[1]["stock"], 0)
        self.assertEqual(self.cambios_en_main(), "")
        self.assertTrue((self.tmp / "pages.log").exists(), "hay que pedir el despliegue de Pages")

    def test_si_entra_otro_commit_se_rehace_sin_perder_nada(self):
        self.subir_cambio("1-a.json", {"v": 1, "productos": [P(1, precioActual=99)], "eliminados": [], "posiciones": {}})

        def entra_otro():
            # Mientras el runner trabaja, el gestor publica otra cosa y un bot
            # toca otro fichero.
            self.subir_cambio("2-b.json", {"v": 1, "productos": [P(2, precioActual=55)], "eliminados": [], "posiciones": {}})
            (self.trabajo / "resenas.json").write_text("{}", encoding="utf-8")
            self.git(self.trabajo, "add", "."); self.git(self.trabajo, "commit", "-q", "-m", "bot")
            self.git(self.trabajo, "push", "-q", "origin", "main")

        r = self.correr(antes_del_push=entra_otro)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        cat = json.loads(self.main_ahora("productos.json"))
        self.assertEqual([p["precioActual"] for p in cat], [99, 55])
        self.assertEqual(self.cambios_en_main(), "")
        self.assertEqual(self.main_ahora("resenas.json"), "{}", "el commit del bot tiene que seguir ahí")

    def test_si_otro_bot_toca_productos_json_a_la_vez_no_se_pierde_ninguno(self):
        """revertir_ofertas.py o la sincronización con la tienda principal
        reescriben productos.json por su cuenta. Si tocan el MISMO producto,
        fusionar (rebase) deja un conflicto en productos.json; rehacer desde
        main lo evita. Gana la versión del gestor, entera — igual que cuando
        el panel subía el catálogo completo.

        Y otro producto que el bot tocó a la vez tiene que quedarse como lo
        dejó el bot."""
        self.subir_cambio("1-a.json", {"v": 1, "productos": [P(1, precioActual=99)], "eliminados": [], "posiciones": {}})

        def otro_bot():
            cat = json.loads((self.trabajo / "productos.json").read_text(encoding="utf-8"))
            cat[0]["stock"] = 7      # el mismo que cambió el gestor
            cat[1]["stock"] = 42     # otro
            (self.trabajo / "productos.json").write_text(json.dumps(cat, indent=2, ensure_ascii=False), encoding="utf-8")
            self.git(self.trabajo, "add", "."); self.git(self.trabajo, "commit", "-q", "-m", "revertir oferta")
            self.git(self.trabajo, "push", "-q", "origin", "main")

        r = self.correr(antes_del_push=otro_bot)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        cat = json.loads(self.main_ahora("productos.json"))
        self.assertEqual(cat[0], P(1, precioActual=99))
        self.assertEqual(cat[1]["stock"], 42)
        self.assertEqual(self.cambios_en_main(), "")

    def test_sin_cambios_no_commitea(self):
        antes = self.git(self.tmp, "--git-dir", str(self.origin), "rev-parse", "main")
        (self.trabajo / "productos-lite.json").write_text(
            json.dumps([P(1), P(2)], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        subprocess.run(["python3", "scripts/build-productos-lite.py"], cwd=self.trabajo, check=True, capture_output=True)
        self.git(self.trabajo, "add", "."); self.git(self.trabajo, "commit", "-q", "-m", "lite")
        self.git(self.trabajo, "push", "-q", "origin", "main")
        antes = self.git(self.tmp, "--git-dir", str(self.origin), "rev-parse", "main")
        r = self.correr()
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertEqual(self.git(self.tmp, "--git-dir", str(self.origin), "rev-parse", "main"), antes)

    def test_fichero_roto_falla_en_rojo_y_no_se_pierde(self):
        self.subir_cambio("1-a.json", {"v": 1, "productos": [{"id": 5}]})
        r = self.correr()
        self.assertNotEqual(r.returncode, 0, "un cambio que no se puede aplicar tiene que verse en rojo")
        self.assertIn("1-a.json", self.cambios_en_main())


if __name__ == "__main__":
    unittest.main()
