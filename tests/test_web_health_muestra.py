"""El agente de salud solo comprueba páginas /p/ que existen (web_health_agent.muestra_paginas).

Con WIFI apagada en el panel no hay /p/ de sus productos; probarlas daba 404 «fallido»
en cada ejecución (nov-2026) y el aviso real quedaba tapado por el ruido."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import categorias_apagadas  # noqa: E402
import web_health_agent  # noqa: E402


def prod(i, cat, sub=None, **kw):
    return dict({"id": i, "categoria": cat, "subcategoria": sub or ""}, **kw)


class MuestraTest(unittest.TestCase):
    def test_no_prueba_categorias_apagadas(self):
        ap = categorias_apagadas.Apagadas({"categorias": {"WIFI": {"off": True, "ts": 1}}, "subcategorias": {}})
        ps = [prod(9, "WIFI"), prod(8, "ENERGIA"), prod(7, "WIFI"), prod(6, "HOGAR")]
        ids = [p["id"] for p in web_health_agent.muestra_paginas(ps, sorted(ps, key=lambda p: -p["id"]), ap)]
        self.assertEqual(sorted(ids), [6, 8])

    def test_no_prueba_subcategorias_apagadas_ni_digitales_ocultos(self):
        ap = categorias_apagadas.Apagadas({"categorias": {}, "subcategorias": {"ENERGIA": {"BATERIAS": {"off": True, "ts": 1}}}})
        ps = [prod(5, "ENERGIA", "BATERIAS"), prod(4, "ENERGIA", "SOLAR"),
              prod(3, "TARJETAS", digital=True, activo=False, importes=[])]
        ids = [p["id"] for p in web_health_agent.muestra_paginas(ps, ps, ap)]
        self.assertEqual(ids, [4])

    def test_sin_nada_apagado_conserva_el_comportamiento(self):
        ap = categorias_apagadas.Apagadas()
        ps = [prod(i, "ENERGIA") for i in range(1, 30)]
        orden = sorted(ps, key=lambda p: -p["id"])
        m = web_health_agent.muestra_paginas(ps, orden, ap)
        self.assertEqual([p["id"] for p in m[:10]], list(range(29, 19, -1)))
        self.assertEqual(len(m), 15)

    def test_el_agente_usa_el_ayudante(self):
        src = (ROOT / "scripts" / "web_health_agent.py").read_text(encoding="utf-8")
        self.assertIn("sample = muestra_paginas(products, products_sorted)", src)


if __name__ == "__main__":
    unittest.main()
