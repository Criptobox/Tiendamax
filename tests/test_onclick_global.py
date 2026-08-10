"""Botones de admin.html cuyo `onclick` llama a algo que no llega al global.

Un atributo `onclick="hacerAlgo()"` NO se resuelve contra el código de la
página: se resuelve contra el objeto global. Y el bloque grande de admin.html va
envuelto en un IIFE —lo dice él mismo: "El script va en IIFE para no chocar con
el motor (que también declara $). Exponemos al window solo lo que usan los
onclick/oninput de la interfaz"—, así que ahí dentro una `function` NO es
global. Lo que la hace global es la lista de exportaciones del final,
`window.go=go; …`, y esa lista es el contrato.

Olvidarla no da ningún error visible: el botón simplemente no hace nada al
tocarlo. Pasó con la campana de suscriptores del topbar — función escrita,
onclick cableado, y al pulsar no ocurría nada; en la consola quedaba un
`irASuscriptores is not defined` que nadie mira.

Solo se mira admin.html. index.html y vale.html no envuelven su script, así que
ahí una función de nivel superior sí es global de verdad y la regla no aplica;
comprobarlas con este mismo patrón daba decenas de falsos positivos.

Se aceptan además los nombres de `js/src/*.src.js` y `js/*.js`, que son scripts
clásicos sin envolver: ahí sí son globales, y muchos onclick del panel apuntan
a esas.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGINA = ROOT / "admin.html"
FUENTES = (sorted(ROOT.glob("js/src/*.src.js"))
           + [p for p in sorted(ROOT.glob("js/*.js")) if p.name != "tm-bundle.js"])

ATRIBUTOS = ("onclick", "onchange", "oninput", "onsubmit")
# Palabras que van seguidas de `(` sin ser una llamada a función propia.
PALABRAS = {"if", "for", "while", "return", "typeof", "function", "catch",
            "switch", "this", "new", "delete", "void", "in", "of", "do", "else"}


def solo_codigo(attr):
    """Deja del atributo solo lo que se ejecuta AL PULSAR.

    Fuera dos cosas que engañan al ojo y a la regex:

      · Los `${…}` de las plantillas. Se evalúan cuando se construye el HTML,
        dentro del IIFE, así que ahí `esc(...)` sí existe — no tiene que ser
        global.
      · Las cadenas. En español hay etiquetas como "Agregar fotos nuevas
        (opcional)" que parecen una llamada a `nuevas(`.
    """
    attr = re.sub(r"\$\{[^}]*\}", "", attr)
    return re.sub(r"'[^']*'", "''", attr)


def bloques_sin_envolver(texto):
    """Los <script> en línea de la página que NO van dentro de un IIFE.

    admin.html tiene cinco, y solo el grande está envuelto. En los otros una
    `function` de nivel superior sí es global, y de ahí salen unos cuantos
    onclick (tm2LoginTab, guardarOfertaDia…).
    """
    fuera, pos = [], 0
    # Se recorre en línea, como el analizador del navegador: cada bloque acaba
    # en su </script> y la búsqueda sigue DESPUÉS. Buscando a saltos, un
    # `<script` citado dentro del IIFE abría un bloque falso y todo lo que venía
    # detrás pasaba por global.
    while True:
        m = re.compile(r"<script[^>]*>").search(texto, pos)
        if not m:
            break
        fin = texto.find("</script>", m.end())
        pos = (fin + 9) if fin > 0 else len(texto)
        if re.search(r"\bsrc=", m.group(0)):
            continue
        cuerpo = texto[m.end():fin if fin > 0 else len(texto)]
        # primera línea con contenido que no sea comentario
        cabeza = ""
        for l in cuerpo.split("\n"):
            l = l.strip()
            if l and not l.startswith(("//", "/*", "*")):
                cabeza = l
                break
        if not cabeza.startswith("(function"):
            fuera.append(cuerpo)
    return fuera


def globales():
    """Nombres que de verdad llegan a `window`."""
    nombres = set()
    for cuerpo in bloques_sin_envolver(PAGINA.read_text(encoding="utf-8")):
        nombres |= set(re.findall(
            r"^[ \t]*(?:async )?function ([A-Za-z_$][\w$]*)\s*\(", cuerpo, re.M))
    for p in [PAGINA] + FUENTES:
        t = p.read_text(encoding="utf-8", errors="replace")
        # exportación explícita: window.x = ...
        nombres |= set(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=", t))
    for p in FUENTES:
        t = p.read_text(encoding="utf-8", errors="replace")
        # en un script clásico, una función de nivel superior sí es global
        nombres |= set(re.findall(
            r"^[ \t]*(?:async )?function ([A-Za-z_$][\w$]*)\s*\(", t, re.M))
        nombres |= set(re.findall(
            r"^(?:const|let|var) ([A-Za-z_$][\w$]*)\s*=", t, re.M))
    return nombres


class OnclickGlobalTest(unittest.TestCase):
    def test_todo_onclick_llama_a_algo_que_existe(self):
        conocidos = globales()
        self.assertIn("go", conocidos, "la lista de globales salió vacía o rota")

        fallos = []
        for p in [PAGINA]:
            texto = p.read_text(encoding="utf-8", errors="replace")
            for attr in ATRIBUTOS:
                for m in re.finditer(attr + r'="([^"]*)"', texto):
                    linea = texto[:m.start()].count("\n") + 1
                    # Los comentarios del propio código citan atributos de
                    # ejemplo (onclick="fn('...')") que no son de nadie.
                    inicio = texto.rfind("\n", 0, m.start()) + 1
                    if texto[inicio:m.start()].lstrip()[:2] in ("//", "/*", "* "):
                        continue
                    for c in re.finditer(r"(\.?)([A-Za-z_$][\w$]*)\s*\(",
                                         solo_codigo(m.group(1))):
                        punto, nombre = c.group(1), c.group(2)
                        # `algo.metodo(` es una propiedad, no un global
                        if punto or nombre in PALABRAS or nombre in conocidos:
                            continue
                        fallos.append(f"  {p.name}:{linea}  {nombre}()  →  "
                                      f"{m.group(1)[:70]}")

        self.assertEqual(
            fallos, [],
            "estos controles no hacen nada al tocarlos: el atributo se resuelve "
            "contra el objeto global y ahí no está la función. En admin.html se "
            "arregla añadiéndola a la lista `window.x=x;` del final:\n"
            + "\n".join(fallos),
        )


if __name__ == "__main__":
    unittest.main()
