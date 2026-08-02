"""Nadie anónimo puede DESTRUIR datos, y ningún secreto vive en un nodo público.

Dos propiedades, y las dos se rompieron de verdad en este repo:

1. Un DELETE de RTDB no lleva payload, así que `newData` es null y el patrón
   `proof` no puede protegerlo. Cualquier regla que empiece por
   `!newData.exists() || …` está concediendo el borrado a todo el mundo. La
   salida no es abrirlo: es que el admin marque en vez de borrar.

2. Un `proof` guardado dentro de un nodo con `.read: true` es el hash del
   admin publicado. Con él se forjan escrituras en admin_push_requests, o sea
   notificaciones push a todos los clientes de la tienda.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

# Nodos cuyo borrado destruye algo que no se puede recuperar.
NO_BORRABLES = {
    "ventas": ("$ventaId", "el historial de ventas"),
    "pedidos": ("$pedidoId", "los pedidos de los clientes"),
    "almacenes": ("$almId", "los almacenes"),
    "admin_tokens": ("$tokenId", "los tokens push del admin"),
    "lista_espera": (None, "los teléfonos de la lista de espera"),
}


def _concede_borrado(expr) -> bool:
    """Una regla concede DELETE si es True o si acepta que newData no exista."""
    if expr is True:
        return True
    if not isinstance(expr, str):
        return False
    return "!newData.exists()" in expr.replace(" ", "")


def _concede_sobrescritura(expr) -> bool:
    """Poder pisar un registro existente destruye igual que borrarlo.

    `newData.exists()` a secas suena defensivo y no lo es: deja escribir
    encima de lo que ya hay. Solo `!data.exists()` (o equivalente) crea sin
    poder pisar.
    """
    if expr is True:
        return True
    if not isinstance(expr, str):
        return False
    return "!data.exists()" not in expr.replace(" ", "")


class SinBorradoAnonimoTest(unittest.TestCase):

    def test_el_historial_de_ventas_es_inmutable(self):
        # Marcarlo todo como anulado vacia el panel igual que borrarlo, y sin
        # autenticacion ese flag lo puede poner cualquiera. Y `newData.exists()`
        # a secas dejaba pisar una venta entera leyendo antes su fecha, que es
        # publica. Solo alta.
        v = REGLAS["ventas"]["$ventaId"]
        self.assertEqual("!data.exists()", v[".write"])
        self.assertNotIn("anulada", v, "un flag anulada abierto vacia el panel")

    def test_ningun_flag_de_borrado_logico_es_publico(self):
        # Un borrado logico escribible por cualquiera hace el mismo dano que
        # un DELETE: el panel filtra por el y todo desaparece.
        crudo = json.dumps(REGLAS)
        for flag in ("anulada", "_borrado", "borrado", "oculto"):
            self.assertNotIn(f'"{flag}"', crudo,
                             f"el flag {flag} no puede vivir en las reglas")

    def test_no_se_puede_pisar_lo_ya_escrito(self):
        fallos = []
        for nodo, hijo in (("ventas", "$ventaId"), ("pedidos", "$pedidoId"),
                           ("lista_espera", None), ("wishlist_avisos", None)):
            alcance = REGLAS[nodo]
            if hijo:
                alcance = alcance[hijo]
                if _concede_sobrescritura(alcance.get(".write")):
                    fallos.append(f"{nodo}/{hijo}: se puede pisar")
            for k, v in alcance.items():
                if isinstance(v, dict):
                    for k2, v2 in v.items():
                        if isinstance(v2, dict) and _concede_sobrescritura(v2.get(".write")):
                            fallos.append(f"{nodo}/{k}/{k2}: se puede pisar")
        self.assertEqual([], fallos, "\n".join(fallos))

    def test_los_nodos_criticos_no_se_pueden_borrar(self):
        fallos = []
        for nodo, (hijo, que) in NO_BORRABLES.items():
            alcance = REGLAS[nodo]
            if hijo and hijo in alcance:
                alcance = alcance[hijo]
                if _concede_borrado(alcance.get(".write")):
                    fallos.append(f"{nodo}/{hijo}: cualquiera puede borrar {que}")
            # y ninguna rama de más abajo puede reabrirlo
            for k, v in alcance.items():
                if isinstance(v, dict) and _concede_borrado(v.get(".write")):
                    fallos.append(f"{nodo}/…/{k}: cualquiera puede borrar {que}")
        self.assertEqual([], fallos, "\n".join(fallos))

    def test_el_cliente_no_intenta_escribir_lo_que_la_regla_rechaza(self):
        # Si lo intentara, el 403 seria silencioso (.catch vacio) y el admin
        # creeria que la venta se anulo.
        for fichero in (RAIZ / "admin.html", RAIZ / "js" / "src" / "tm-ui.src.js"):
            src = fichero.read_text(encoding="utf-8")
            for m in re.finditer(r"/(?:ventas|almacenes)/[^\n]{0,140}", src):
                trozo = m.group(0).replace(" ", "")
                if "method:'DELETE'" in trozo and "/productos/" not in trozo:
                    self.fail(f"{fichero.name}: borra en Firebase → {m.group(0)[:90]}")
                if "'anulada'" in trozo or '"anulada"' in trozo:
                    self.fail(f"{fichero.name}: marca anulada en Firebase → {m.group(0)[:90]}")

    def test_las_anulaciones_viven_en_el_dispositivo(self):
        ui = (RAIZ / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8")
        admin = (RAIZ / "admin.html").read_text(encoding="utf-8")
        self.assertIn("tm_ventas_anuladas", ui)
        self.assertIn("ventasAnuladas()", admin, "el merge debe respetarlas")
        self.assertIn("tm_almacenes_borrados", admin)


class SinSecretosEnNodosPublicosTest(unittest.TestCase):

    def test_ningun_nodo_legible_guarda_un_proof(self):
        fallos = []

        def recorrer(nodo, ruta, legible):
            if not isinstance(nodo, dict):
                return
            # .read true en un ancestro cascadea hacia abajo y no se revoca
            legible = legible or nodo.get(".read") is True
            for k, v in nodo.items():
                if k.startswith("."):
                    continue
                if legible and k in ("proof", "_proof"):
                    fallos.append(f"{ruta}/{k} sería legible por cualquiera")
                recorrer(v, f"{ruta}/{k}", legible)

        recorrer(REGLAS, "", REGLAS.get(".read") is True)
        self.assertEqual([], fallos, "\n".join(fallos))


class SinEscrituraLibreTest(unittest.TestCase):
    """`.write: true` a secas deja sobrescribir y borrar a cualquiera."""

    # Los que quedan abiertos a propósito y por qué.
    # avisos_stock sigue abierto: el admin necesita vaciar la lista tras avisar
    # y sin autenticacion no hay forma de distinguirlo. Documentado, no resuelto.
    TOLERADOS = {
        "avisos_stock/$productId/$tokenId": "alta y baja del propio aviso",
    }

    def test_no_hay_escrituras_totalmente_libres_sin_justificar(self):
        libres = []

        def recorrer(nodo, ruta):
            if not isinstance(nodo, dict):
                return
            if nodo.get(".write") is True and ruta.lstrip("/") not in self.TOLERADOS:
                libres.append(ruta.lstrip("/"))
            for k, v in nodo.items():
                if not k.startswith("."):
                    recorrer(v, f"{ruta}/{k}")

        recorrer(REGLAS, "")
        self.assertEqual([], sorted(libres),
                         "nodos con .write true sin justificar: " + str(sorted(libres)))

    def test_la_lista_de_espera_no_se_puede_pisar(self):
        # Lleva teléfonos dentro: sobrescribir o borrar no lo puede hacer nadie.
        w = REGLAS["lista_espera"]["$productoId"]["$entradaId"][".write"]
        self.assertEqual("!data.exists()", w)

    def test_un_token_push_no_se_puede_secuestrar(self):
        # Era .write true: cualquiera borraba la lista de suscriptores entera,
        # o cambiaba el token de otro por el suyo.
        w = REGLAS["tokens"]["$tokenId"][".write"]
        self.assertIn("newData.exists()", w)
        self.assertIn("data.child('token').val()", w)

    def test_las_pruebas_de_admin_exigen_ts_fresco(self):
        # Sin esto, una escritura parcial hereda del merge la prueba ya
        # guardada y satisface la regla sin conocerla.
        for nodo, hijo in (("admin_tokens", "$tokenId"),
                           ("admin_push_requests", "$reqId")):
            w = REGLAS[nodo][hijo][".write"]
            self.assertIn("newData.child('ts').val() > now -", w,
                          f"{nodo}: el merge arrastra la prueba vieja")
            self.assertIn(".exists()", w)

    def test_la_cola_de_push_no_se_abre_sola(self):
        # null === null: mientras admin_auth estuviera vacio, la regla dejaba
        # entrar (y borrar) a cualquiera.
        w = REGLAS["admin_push_requests"]["$reqId"][".write"]
        self.assertIn("root.child('admin_auth/hash').exists()", w)

    def test_el_contador_de_avisos_no_es_un_campo_libre(self):
        # Era .write true: cualquiera fijaba el "N personas esperando" que se
        # enseña en la ficha del producto.
        w = REGLAS["avisos_count"]["$productId"]["count"][".write"]
        self.assertIn("data.val() + 1", w)


if __name__ == "__main__":
    unittest.main()
