"""
El contador de visitas de la tienda.

Estuvo devolviendo el mismo número mientras entraba gente, y el motivo no se
ve leyendo el contador: está repartido entre dos archivos.

index.html registra el service worker. Cuando el SW se instala y toma el
control dispara `controllerchange`, y ahí la página **se recarga sola**, uno o
dos segundos después de abrir. El contador, en tm-patches, ponía la marca de
"visita ya contada" nada más entrar y esperaba 4 s para escribir en Firebase:
la recarga llegaba antes, mataba el temporizador, y la segunda carga veía la
marca puesta y se iba sin contar. Como cada despliegue cambia el CACHE_NAME de
sw.js, ese `controllerchange` le pasa a casi todo el mundo — o sea que casi
nadie se contaba nunca.

Nada de esto da error: el panel enseña un número que parece un número.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHES = (ROOT / "js" / "src" / "tm-patches.src.js").read_text(encoding="utf-8")
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")


def contador():
    i = PATCHES.index("function tmContarVisita()")
    return PATCHES[i:PATCHES.index("async function _tmSumarUno")]


class VisitasTest(unittest.TestCase):
    def test_la_pagina_se_recarga_sola_al_instalar_el_sw(self):
        """La premisa del resto del archivo. Si esto dejara de ser cierto, el
        orden de abajo daría igual — pero mientras lo sea, es obligatorio."""
        self.assertIn("controllerchange", INDEX)
        self.assertRegex(INDEX, r"controllerchange[\s\S]{0,400}location\.reload\(\)")

    def test_la_marca_se_pone_despues_de_contar_no_antes(self):
        c = contador()
        i_set = c.index("sessionStorage.setItem('tm_visita_contada'")
        i_fetch = c.index("_tmSumarUno(")
        self.assertLess(
            i_fetch, i_set,
            "marcar la visita antes de escribirla la pierde entera si la página "
            "se recarga en medio, que es justo lo que hace el service worker",
        )

    def test_solo_se_marca_si_el_conteo_funciono(self):
        c = contador()
        self.assertRegex(
            c, r"if \(okTotal\)[\s\S]{0,120}setItem\('tm_visita_contada'",
            "si Firebase rechaza la escritura no se puede dar la visita por contada",
        )

    def test_se_vuelve_a_mirar_la_marca_dentro_del_temporizador(self):
        """Entre programar el temporizador y que venza, otra pestaña puede
        haber contado ya."""
        c = contador()
        cuerpo = c[c.index("setTimeout("):]
        self.assertIn("sessionStorage.getItem('tm_visita_contada')", cuerpo)

    def test_hay_plan_b_si_la_regla_rechaza_el_incremento(self):
        """La regla de Firebase pide `newData.val() == data.val() + 1`. Si el
        centinela de incremento no la satisface, el contador se queda clavado
        para siempre y nadie se entera. Leer y escribir el número puede perder
        alguna visita simultánea, pero eso es infinitamente mejor."""
        f = PATCHES[PATCHES.index("async function _tmSumarUno"):]
        f = f[:f.index("\n}") + 2]
        self.assertIn("'.sv'", f, "primero el incremento, que es atómico")
        self.assertIn("401", f)
        self.assertIn("403", f)
        self.assertRegex(f, r"JSON\.stringify\(n \+ 1\)", "y el número como plan B")

    def test_el_dueno_sigue_sin_contarse(self):
        c = contador()
        self.assertIn("adminPanel", c)
        for marca in ("githubToken", "tm_es_admin"):
            self.assertIn(marca, c)

    def test_no_espera_tanto_como_para_perder_la_carrera(self):
        """Los 4 s originales caían casi siempre después de la recarga del SW.
        El arreglo de arriba lo hace irrelevante, pero acercarlo ayuda a que la
        visita se cuente en la primera carga y no en la segunda."""
        m = re.search(r"\},\s*(\d+)\);", contador())
        self.assertIsNotNone(m, "no encuentro la espera del temporizador")
        self.assertLessEqual(int(m.group(1)), 3000)


if __name__ == "__main__":
    unittest.main()
