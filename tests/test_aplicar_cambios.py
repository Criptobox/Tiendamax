"""scripts/aplicar_cambios.py — lo que el panel sube en vez del catálogo entero.

"Actualizar tienda" subía ~540 KB (productos.json en base64) para cambiar un
precio. Ahora el panel sube solo los productos tocados en cambios/*.json y
este script los aplica en GitHub Actions. Si aplica mal, el cambio que el
gestor da por publicado no llega a la tienda, o se lleva algo por delante:
nada de eso daría error en ningún sitio.
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

import aplicar_cambios as ac  # noqa: E402


def P(i, **kw):
    return dict({"id": i, "nombre": f"Producto {i}", "precioActual": 10, "stock": 1}, **kw)


def cambio(productos=(), eliminados=(), posiciones=None):
    return {"v": 1, "creado": "2026-09-23T00:00:00Z", "productos": list(productos),
            "eliminados": list(eliminados), "posiciones": posiciones or {}}


class AplicarTest(unittest.TestCase):
    def test_reemplaza_el_producto_entero(self):
        """Quitar una oferta borra precioOriginal: si se fusionaran campos, la
        oferta vieja seguiría en la tienda."""
        base = [P(1, precioOriginal=20, precioActual=15)]
        out = ac.aplicar(base, [("a.json", cambio([P(1, precioActual=20)]))])
        self.assertEqual(out, [P(1, precioActual=20)])

    def test_conserva_la_descripcion_si_no_viene(self):
        """El panel trabaja con el catálogo lite, sin descripciones."""
        base = [P(1, descripcion="Texto largo del producto")]
        out = ac.aplicar(base, [("a.json", cambio([P(1, precioActual=12)]))])
        self.assertEqual(out[0]["descripcion"], "Texto largo del producto")
        self.assertEqual(out[0]["precioActual"], 12)

    def test_si_la_descripcion_viene_manda_la_nueva(self):
        base = [P(1, descripcion="vieja")]
        out = ac.aplicar(base, [("a.json", cambio([P(1, descripcion="")]))])
        self.assertEqual(out[0]["descripcion"], "")

    def test_nuevo_va_detras_del_que_tenia_delante(self):
        base = [P(1), P(2), P(3)]
        out = ac.aplicar(base, [("a.json", cambio([P(9)], posiciones={"9": "2"}))])
        self.assertEqual([p["id"] for p in out], [1, 2, 9, 3])

    def test_nuevo_arriba_y_nuevo_al_final(self):
        base = [P(1), P(2)]
        out = ac.aplicar(base, [("a.json", cambio([P(8), P(9)], posiciones={"8": None}))])
        self.assertEqual([p["id"] for p in out], [8, 1, 2, 9])

    def test_elimina(self):
        out = ac.aplicar([P(1), P(2)], [("a.json", cambio(eliminados=["1"]))])
        self.assertEqual([p["id"] for p in out], [2])

    def test_se_aplican_en_orden(self):
        base = [P(1)]
        out = ac.aplicar(base, [("1-a.json", cambio([P(1, precioActual=11)])),
                                ("2-b.json", cambio([P(1, precioActual=22)]))])
        self.assertEqual(out[0]["precioActual"], 22)

    def test_no_toca_lo_que_no_viene(self):
        base = [P(1, stock=5), P(2, stock=7)]
        out = ac.aplicar(base, [("a.json", cambio([P(1, stock=0)]))])
        self.assertEqual(out[1], P(2, stock=7))

    def test_fichero_mal_formado_para_todo(self):
        for malo in ({"productos": []}, cambio([{"id": 1}]), cambio([{"nombre": "x"}]),
                     {"v": 1, "productos": {}}):
            with self.assertRaises(ac.CambioInvalido):
                ac.aplicar([P(1)], [("malo.json", malo)])

    def test_mismo_formato_que_el_panel(self):
        """JSON.stringify(x, null, 2): sin escapar tildes ni emojis y sin
        salto de línea final. Si no, cada aplicación reescribe el fichero
        entero en el diff."""
        texto = ac.volcar([P(1, nombre="🔋 Batería")])
        self.assertIn("🔋 Batería", texto)
        self.assertFalse(texto.endswith("\n"))
        self.assertIn('\n  {\n    "id": 1,', texto)


class EnDiscoTest(unittest.TestCase):
    def test_aplica_escribe_y_borra_los_ficheros(self):
        with tempfile.TemporaryDirectory() as d:
            raiz = Path(d)
            (raiz / "productos.json").write_text(ac.volcar([P(1), P(2)]), encoding="utf-8")
            (raiz / "cambios").mkdir()
            (raiz / "cambios" / "1-a.json").write_text(json.dumps(cambio([P(2, stock=9)])), encoding="utf-8")
            self.assertEqual(ac.main([], raiz=raiz), 0)
            out = json.loads((raiz / "productos.json").read_text(encoding="utf-8"))
            self.assertEqual(out[1]["stock"], 9)
            self.assertEqual(list((raiz / "cambios").glob("*.json")), [])

    def test_si_uno_esta_mal_no_se_aplica_ni_se_borra_nada(self):
        with tempfile.TemporaryDirectory() as d:
            raiz = Path(d)
            original = ac.volcar([P(1)])
            (raiz / "productos.json").write_text(original, encoding="utf-8")
            (raiz / "cambios").mkdir()
            (raiz / "cambios" / "1-a.json").write_text(json.dumps(cambio([P(1, stock=3)])), encoding="utf-8")
            (raiz / "cambios" / "2-b.json").write_text('{"v": 1, "productos": [{"id": 5}]}', encoding="utf-8")
            self.assertEqual(ac.main([], raiz=raiz), 1)
            self.assertEqual((raiz / "productos.json").read_text(encoding="utf-8"), original)
            self.assertEqual(len(list((raiz / "cambios").glob("*.json"))), 2)

    def test_sin_cambios_no_reescribe(self):
        with tempfile.TemporaryDirectory() as d:
            raiz = Path(d)
            (raiz / "productos.json").write_text('[{"id": 1, "nombre": "x"}]', encoding="utf-8")
            self.assertEqual(ac.main([], raiz=raiz), 0)
            self.assertEqual((raiz / "productos.json").read_text(encoding="utf-8"), '[{"id": 1, "nombre": "x"}]')


class DesdeGitTest(unittest.TestCase):
    """Modo --ref: lo que usan Telegram y las notificaciones, que arrancan con
    el push del panel antes de que nadie haya aplicado nada."""

    def test_lee_del_commit_y_no_borra(self):
        with tempfile.TemporaryDirectory() as d:
            raiz = Path(d)
            git = lambda *a: subprocess.run(["git", *a], cwd=raiz, check=True, capture_output=True)
            git("init", "-q")
            git("config", "user.email", "t@t"); git("config", "user.name", "t")
            (raiz / "productos.json").write_text(ac.volcar([P(1)]), encoding="utf-8")
            (raiz / "cambios").mkdir()
            (raiz / "cambios" / "1-a.json").write_text(json.dumps(cambio([P(1, stock=4)])), encoding="utf-8")
            git("add", "."); git("commit", "-q", "-m", "x")
            viejo = ac.RAIZ
            ac.RAIZ = raiz
            try:
                self.assertEqual(ac.main(["--ref", "HEAD", "--salida", str(raiz / "out.json")], raiz=raiz), 0)
            finally:
                ac.RAIZ = viejo
            self.assertEqual(json.loads((raiz / "out.json").read_text(encoding="utf-8"))[0]["stock"], 4)
            self.assertTrue((raiz / "cambios" / "1-a.json").exists())


if __name__ == "__main__":
    unittest.main()
