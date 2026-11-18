"""Los agujeros que encontró la auditoría de seguridad (nov-2026).

El PAT de GitHub vive en el localStorage de tiendamax.org, el mismo origen de
la tienda y de las fichas /p/. Por eso cualquier marcado ajeno que llegue a
una página de ese origen —una venta inventada pintada en el panel, una reseña
con «</script>» dentro del JSON-LD— puede llevárselo. Nada de esto da error:
la página se pinta igual.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))

REGLAS = json.load(open(os.path.join(RAIZ, "firebase-rules.json"), encoding="utf-8"))["rules"]
DUENO = "auth.uid===root.child('admin_uid').val()"


def _sin_espacios(s):
    return str(s).replace(" ", "")


class ReglasTest(unittest.TestCase):
    def test_solo_el_dueno_crea_ventas(self):
        w = _sin_espacios(REGLAS["ventas"]["$ventaId"][".write"])
        self.assertIn("!data.exists()", w)
        self.assertIn(DUENO, w)

    def test_almacenes_solo_los_escribe_el_dueno(self):
        a = REGLAS["almacenes"]["$almId"]
        for ruta, nodo in (("$almId", a), ("nombre", a["nombre"]), ("direccion", a["direccion"]),
                           ("ubicacion", a["ubicacion"]), ("productos", a["productos"]["$prodId"])):
            with self.subTest(ruta=ruta):
                self.assertIn(DUENO, _sin_espacios(nodo[".write"]),
                              "la dirección del almacén va en el vale al cliente: abierta, la cambiaba cualquiera")
        self.assertIn("beginsWith('https://')", a["ubicacion"][".validate"], "ubicacion: solo https (nada de javascript:)")
        self.assertIs(True, REGLAS["almacenes"][".read"], "el vale la lee sin cuenta")

    def test_compra_verificada_solo_con_cuenta_o_token(self):
        r = REGLAS["resenas"]["$productoId"]["$resenaId"]
        v = _sin_espacios(r["verificada"][".validate"])
        self.assertIn(DUENO, v)
        self.assertIn("resena_tokens", v)
        self.assertIs(False, REGLAS["resena_tokens"][".read"], "los tokens no se listan")
        self.assertIn(DUENO, _sin_espacios(REGLAS["resena_tokens"]["$tk"][".write"]))

    def test_una_pregunta_nueva_del_faq_nace_con_count_1(self):
        w = _sin_espacios(REGLAS["agente"]["faq"]["$faqKey"][".write"])
        self.assertIn("!data.exists()&&newData.child('count').val()===1", w,
                      "con count libre al crearla, una pregunta inventada salía la primera en faq.html")


class JsonLdTest(unittest.TestCase):
    def test_js_seguro_no_deja_cerrar_el_script(self):
        import regenerate_artifacts as r
        import build_faq as f
        for mod in (r, f):
            with self.subTest(mod=mod.__name__):
                s = mod._js_seguro({"texto": "</script><script>alert(1)</script>&"}, ensure_ascii=False)
                self.assertNotIn("<", s)
                self.assertNotIn(">", s)
                self.assertEqual(json.loads(s)["texto"], "</script><script>alert(1)</script>&")

    def test_ningun_json_en_script_sale_sin_escapar(self):
        """Todo json.dumps de los generadores que acaba en una página pasa por _js_seguro."""
        for nombre in ("regenerate_artifacts.py", "build_faq.py"):
            src = open(os.path.join(RAIZ, "scripts", nombre), encoding="utf-8").read()
            sueltos = [l.strip() for l in src.splitlines()
                       if "json.dumps(" in l and "def _js_seguro" not in l
                       and not re.search(r"\bnew = json\.dumps|json_content = json\.dumps|return \(json\.dumps\(obj", l)]
            with self.subTest(archivo=nombre):
                self.assertEqual([], sueltos)


class RevertirOfertasTest(unittest.TestCase):
    def test_revierte_tambien_lo_que_lee_la_tienda(self):
        wf = open(os.path.join(RAIZ, ".github", "workflows", "revertir-ofertas.yml"), encoding="utf-8").read()
        self.assertIn("build-productos-lite.py", wf, "la tienda lee productos-lite.json: sin rehacerlo la rebaja seguía")
        self.assertIn("productos-lite.json", wf)
        self.assertIn("regenerate-artifacts.yml/dispatches", wf, "las /p/ seguían mostrando la rebaja")
        self.assertIn("reset --hard origin/main", wf)
        self.assertNotIn("rebase -X ours", wf, "en un rebase «ours» es origin: tiraba el revertido")


class ResenasVerificadasTest(unittest.TestCase):
    def test_la_casilla_del_cliente_no_basta(self):
        import sync_resenas as s
        nueva = s.RESENA_CORTE_MS + 1000
        self.assertFalse(s.verificada({"comprador": True, "ts": nueva}), "la casilla la marca cualquiera")
        self.assertTrue(s.verificada({"verificada": True, "ts": nueva}))
        self.assertTrue(s.verificada({"comprador": True, "ts": s.RESENA_CORTE_MS - 1000}), "las de antes conservan su marca")

    def test_mismo_corte_en_la_tienda(self):
        import sync_resenas as s
        src = open(os.path.join(RAIZ, "js", "src", "tm-config.src.js"), encoding="utf-8").read()
        self.assertIn(f"TM_RESENA_CORTE_MS = {s.RESENA_CORTE_MS}", src)
        self.assertIn("tmResenaVerificada(r) ?", src)


class EnNavegadorTest(unittest.TestCase):
    def test_en_navegador(self):
        if not shutil.which("node"):
            self.skipTest("sin node")
        r = subprocess.run(["node", os.path.join(RAIZ, "tests", "seguridad_check.mjs")],
                           capture_output=True, text=True, timeout=400)
        self.assertEqual(0, r.returncode, r.stdout[-3000:] + r.stderr[-3000:])


if __name__ == "__main__":
    unittest.main()
