"""El normalizador de nombres, que llegó a estropear 24 productos.

Hay DOS copias: `normalizar_nombre` en scripts/nightly_agent.py (el reporte
nocturno) y `iaNormalizarNombre` en js/admin-copilot.js (el panel, con un botón
"🔤 Normalizar nombres" que lo aplica al catálogo ENTERO de una vez). Las dos
tenían la misma regla y el mismo defecto: escribían bien una palabra corriente
y arrasaban con todo lo que no lo era.

Lo que dejaron en el catálogo, aceptado a golpe de botón:

    UniFi → Unifi          MikroTik → Mikrotik      TP-Link → Tp-link
    BLUETTI → Bluetti      LiFePO4 → LIFEPO4        NanoStation → Nanostation
    ⚡Inversor → ⚡inversor  500g → 500G              CPE → Cpe

Nada de eso falla ni avisa: el nombre se ve bien formado, y el error solo se
nota si conoces la marca. Por eso se prueba aquí lo que NO debe cambiar, que es
la parte que se rompió.
"""
import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

from nightly_agent import MARCAS, SIGLAS, normalizar_nombre  # noqa: E402

COPILOT = RAIZ / "js" / "admin-copilot.js"

# Nombres que ya están bien: el normalizador tiene que devolverlos INTACTOS.
INTOCABLES = [
    "🌐 Punto de Acceso UniFi AC Mesh Ubiquiti",
    "🌐 Router Inalámbrico de Escritorio MikroTik hAP ac3",
    "🛜 Router TP-Link Archer AX1450 (Wi-fi 6)",
    "​⚡ Generador Solar Portátil BLUETTI AC180",
    "⚡ Protector de Voltaje y Sobrecorriente TOMZN TOVPD1-60",
    "🔋Cargador de Batería de Litio BIEN 48V 5A",
    "🏋️ Proteína Whey Protein 1UP Nutrition Coconut Ice Cream 962g",
    "🏋️ Creatina Monohidrato Dorado Nutrition 300g",
    "⚡ Controlador de Carga Solar MPPT 120A Y&H",
    "🌐 Antena CPE Inalámbrica Ubiquiti NanoStation Loco M2 Internacional",
    "Batería Must Tipo LiFePO4",
    "Mannol Antifreeze AG13+ ( - 40 °c) Advanced 4014. 5L",
]

# Lo que sí tiene que seguir arreglando: para eso existe.
ARREGLOS = [
    ("⚡ ESTACION PORTATIL de 1000w", "⚡ Estación Portátil de 1000w"),
    ("bateria de litio", "Batería de Litio"),
    ("⚡inversor de Corriente", "⚡Inversor de Corriente"),
    ("🌐 antena cpe mikrotik", "🌐 Antena CPE MikroTik"),
]


class NoEstropeaLoQueEstaBienTest(unittest.TestCase):

    def test_deja_intactos_los_nombres_correctos(self):
        for n in INTOCABLES:
            with self.subTest(nombre=n):
                self.assertEqual(n, normalizar_nombre(n))

    def test_sigue_arreglando_lo_que_esta_mal(self):
        for entra, sale in ARREGLOS:
            with self.subTest(nombre=entra):
                self.assertEqual(sale, normalizar_nombre(entra))

    def test_no_toca_las_unidades(self):
        # Los gramos van en minúscula; "500G" no existe. Igual con mAh y Ah.
        for n in ("Proteína 500g", "Batería 100Ah", "Power Bank 20000mAh",
                  "Aceite 5L", "Cable 1.5m"):
            with self.subTest(unidad=n):
                self.assertEqual(n, normalizar_nombre(n))

    def test_no_apaga_la_letra_que_va_tras_un_emoji(self):
        # "⚡Inversor" se leía como una pieza cuya primera letra era el emoji.
        for e in ("⚡", "♻️", "✅️", "🔋", "🏋️"):
            with self.subTest(emoji=e):
                self.assertEqual(e + "Inversor", normalizar_nombre(e + "Inversor"))

    def test_es_idempotente(self):
        # Aplicarlo dos veces tiene que dar lo mismo. Si no, cada pasada del
        # agente propone otra cosa y el catálogo nunca se queda quieto.
        for n in INTOCABLES + [b for _, b in ARREGLOS]:
            with self.subTest(nombre=n):
                self.assertEqual(normalizar_nombre(n), normalizar_nombre(normalizar_nombre(n)))


class LasDosCopiasDicenLoMismoTest(unittest.TestCase):
    """El panel y el agente nocturno normalizan por separado. Si se separan, el
    reporte propone una cosa y el botón del panel aplica otra."""

    def test_la_tabla_de_marcas_es_la_misma(self):
        js = COPILOT.read_text(encoding="utf-8")
        bloque = re.search(r"const IA_MARCAS = \{(.*?)\};", js, re.S)
        self.assertIsNotNone(bloque, "el panel perdió su tabla de marcas")
        en_js = dict(re.findall(r"'([^']+)':'([^']+)'", bloque.group(1)))
        self.assertEqual(MARCAS, en_js,
                         "las dos tablas de marcas se separaron: el reporte "
                         "propondría una grafía y el panel aplicaría otra")

    def test_la_lista_de_siglas_es_la_misma(self):
        js = COPILOT.read_text(encoding="utf-8")
        bloque = re.search(r"const IA_SIGLAS = new Set\(\[(.*?)\]\);", js, re.S)
        self.assertIsNotNone(bloque, "el panel perdió su lista de siglas")
        self.assertEqual(SIGLAS, set(re.findall(r"'([^']+)'", bloque.group(1))))

    def test_el_panel_normaliza_igual_que_el_agente(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        js = COPILOT.read_text(encoding="utf-8")
        trozos = []
        for nombre in ("IA_TYPOS", "IA_SIGLAS", "IA_SIGLA_FORMA", "IA_MARCAS"):
            m = re.search(rf"const {nombre} = .*?;\n", js, re.S)
            self.assertIsNotNone(m, f"falta {nombre}")
            trozos.append(m.group(0))
        fn = re.search(r"function iaNormalizarNombre\(raw\)\{.*?\n\}\n", js, re.S)
        self.assertIsNotNone(fn, "no se encontró iaNormalizarNombre")
        casos = INTOCABLES + [a for a, _ in ARREGLOS]
        prog = ("".join(trozos) + fn.group(0) +
                "const casos=" + json.dumps(casos, ensure_ascii=False) + ";\n"
                "console.log(JSON.stringify(casos.map(iaNormalizarNombre)));")
        r = subprocess.run([node, "-e", prog], capture_output=True, text=True, timeout=30)
        self.assertEqual(0, r.returncode, r.stderr)
        del_panel = json.loads(r.stdout)
        for entrada, salida_js in zip(casos, del_panel):
            with self.subTest(nombre=entrada):
                self.assertEqual(normalizar_nombre(entrada), salida_js)


class ElCatalogoQuedoLimpioTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.productos = json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
        cls.nombres = [p.get("nombre") or "" for p in cls.productos]

    def test_ningun_nombre_lleva_basura_html(self):
        # Uno tenía '@/span>' incrustado, y se había propagado a su ficha, a la
        # categoría GYM y a las tarjetas de otros tres productos.
        malos = [n for n in self.nombres if re.search(r"</?\w+>|&\w+;|@/", n)]
        self.assertEqual([], malos)

    def test_ninguna_palabra_se_escribe_de_dos_formas(self):
        # La huella de haber aceptado sugerencias a medias: los productos viejos
        # con la grafía rota y los nuevos con la buena.
        formas = {}
        for n in self.nombres:
            for tok in re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ][\w'&+-]*", n):
                if len(tok) > 2:
                    formas.setdefault(tok.lower(), set()).add(tok)
        dobles = {k: sorted(v) for k, v in formas.items()
                  if len(v) > 1 and k != "wifi"}   # WIFI/WiFi es cosmético
        self.assertEqual({}, dobles)

    def test_las_marcas_estan_como_las_escribe_el_fabricante(self):
        malos = []
        for n in self.nombres:
            for tok in re.findall(r"[A-Za-z][\w'-]*", n):
                bueno = MARCAS.get(tok.upper())
                if bueno and tok != bueno:
                    malos.append(f"{tok} (debería ser {bueno}) en {n!r}")
        self.assertEqual([], malos)

    def test_ningun_nombre_empieza_en_minuscula_tras_el_emoji(self):
        malos = [n for n in self.nombres
                 if re.search(r"[^\w\s,.\-()/&+°\"']\s?[a-záéíóúñ]", n)
                 and not re.search(r"[^\w\s,.\-()/&+°\"']\s?(de|con|para|y|a)\b", n)]
        self.assertEqual([], malos)


if __name__ == "__main__":
    unittest.main()
