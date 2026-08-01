"""La sincronización de la contraseña admin entre dispositivos.

La regla de admin_auth pedía `auth != null`, pero en este proyecto no hay
Firebase Auth (0 llamadas a getAuth/signInAnonymously), así que esa condición
es siempre falsa: nadie podía leer el hash guardado. Como el cliente lo leía
para mandarlo como `proof`, la escritura quedaba rechazada y la contraseña
dejaba de sincronizarse tras el primer cambio.

Eso no es solo un problema de comodidad: `almacenes/$almId` y
`admin_push_requests/$reqId` comparan su proof contra admin_auth/hash, así que
con la sincronización rota el admin no puede rotar la contraseña sin dejar de
poder escribir en esos dos nodos.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLAS = RAIZ / "firebase-rules.json"
TM_ADMIN = RAIZ / "js" / "src" / "tm-admin.src.js"


class ReglaAdminAuthTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.reglas = json.loads(REGLAS.read_text(encoding="utf-8"))
        cls.crudo = REGLAS.read_text(encoding="utf-8")
        cls.admin_auth = cls.reglas["rules"]["admin_auth"]

    def test_no_se_apoya_en_un_auth_que_no_existe(self):
        # Sin Firebase Auth, "auth != null" no restringe: bloquea a todos,
        # incluido el propio sitio. En ninguna regla debe volver a aparecer.
        self.assertNotIn("auth != null", self.crudo)

    def test_el_hash_no_es_legible(self):
        self.assertIs(False, self.admin_auth[".read"])

    def test_el_salt_tampoco_se_expone(self):
        # Con el salt público cualquiera puede derivar hashes candidatos y
        # probarlos contra las reglas que comparan proof (almacenes,
        # admin_push_requests): eso convierte esas reglas en un oráculo de
        # fuerza bruta online contra la contraseña del admin.
        for hijo in ("salt", "iterations", "hash"):
            sub = self.admin_auth.get(hijo)
            if isinstance(sub, dict):
                self.assertNotEqual(True, sub.get(".read"),
                                    f"admin_auth/{hijo} no puede ser público")

    def test_la_escritura_sigue_exigiendo_proof(self):
        self.assertIn("newData.child('proof').val()", self.admin_auth[".write"])

    def test_las_reglas_que_dependen_del_hash_siguen_ahi(self):
        # Si estas dejaran de existir, sincronizar el hash no tendría sentido.
        alm = self.reglas["rules"]["almacenes"]["$almId"][".write"]
        push = self.reglas["rules"]["admin_push_requests"]["$reqId"][".write"]
        self.assertIn("root.child('admin_auth/hash')", alm)
        self.assertIn("root.child('admin_auth/hash')", push)


class SenalDeVersionTest(unittest.TestCase):
    """config/version: la señal que fuerza a los clientes a actualizarse.

    Tenía `.write: "auth != null"`, o sea rechazo garantizado, así que el PUT
    que hace el admin tras publicar nunca entraba y ningún cliente llegaba a
    enterarse de que había catálogo nuevo: se quedaban con el service worker
    viejo hasta que caducara por su cuenta.
    """

    @classmethod
    def setUpClass(cls):
        cls.reglas = json.loads(REGLAS.read_text(encoding="utf-8"))
        cls.config = cls.reglas["rules"]["config"]
        cls.catalog = (RAIZ / "js" / "src" / "tm-catalog.src.js").read_text(encoding="utf-8")

    def test_la_escritura_es_posible_y_va_con_proof(self):
        escritura = self.config[".write"]
        self.assertNotIn("auth != null", escritura)
        self.assertIn("root.child('admin_auth/hash')", escritura)

    def test_version_sigue_siendo_publica(self):
        # index.html y admin.html la leen sin credencial ninguna.
        self.assertIs(True, self.config["version"][".read"])

    def test_el_proof_no_queda_expuesto(self):
        # Las reglas de RTDB cascadean solo para conceder: si el proof colgara
        # de un nodo con .read true, sería legible y cualquiera podría forjar
        # escrituras en almacenes y admin_push_requests con él.
        self.assertIs(False, self.config[".read"])
        self.assertNotIn(".read", self.config["_proof"])

    def test_el_cliente_manda_el_proof(self):
        self.assertIn("_proof: proof", self.catalog)
        self.assertIn("localStorage.getItem(AUTH_HASH_KEY)", self.catalog)

    def test_escribe_el_nodo_config_no_solo_version(self):
        # Un PUT a /config/version.json lleva un número suelto, sin sitio para
        # el proof; hay que escribir el objeto entero.
        self.assertIn("`${base}/config.json`", self.catalog)


class FormularioDeContrasenaTest(unittest.TestCase):
    """El motor traía cambiarPasswordAdmin desde siempre, pero sin formulario.

    O sea que no había manera de cambiar la contraseña desde ningún sitio del
    admin, y la función de sincronizar tampoco se podía disparar nunca.
    """

    @classmethod
    def setUpClass(cls):
        cls.admin = (RAIZ / "admin.html").read_text(encoding="utf-8")

    def test_estan_los_tres_campos(self):
        # cambiarPasswordAdmin limpia estos ids por su cuenta al terminar,
        # así que los nombres no son libres.
        for campo in ("ci", "ni", "coi"):
            self.assertIn(f'id="{campo}"', self.admin)

    def test_estan_los_dos_botones(self):
        self.assertIn('onclick="tmCambiarPassword()"', self.admin)
        self.assertIn('onclick="tmSyncPassword()"', self.admin)

    def test_los_wrappers_llegan_al_onclick(self):
        # Todo ese <script> vive dentro de un IIFE: una función declarada ahí
        # no es global y el onclick del HTML no la encuentra. Hay que
        # exponerla a mano, como se hace con probarFirebase y compañía.
        self.assertIn("window.tmCambiarPassword=tmCambiarPassword", self.admin)
        self.assertIn("window.tmSyncPassword=tmSyncPassword", self.admin)

    def test_avisa_de_que_no_hay_recuperacion(self):
        # La copia de Firebase no se puede leer, así que borrar los datos del
        # navegador sin recordar la contraseña deja fuera del admin.
        self.assertIn("pierdes el acceso al admin", self.admin)


class CodigoRecuperacionTest(unittest.TestCase):
    """La vuelta atrás si se borran los datos del navegador.

    La copia de Firebase no se puede leer a propósito, así que sin esto
    perder el localStorage significaba perder el admin para siempre.
    """

    @classmethod
    def setUpClass(cls):
        cls.admin = (RAIZ / "admin.html").read_text(encoding="utf-8")

    def test_estan_los_tres_botones_y_el_campo(self):
        self.assertIn('id="recCodigo"', self.admin)
        for fn in ("tmVerCodigoRecuperacion", "tmCopiarCodigoRecuperacion",
                   "tmRestaurarCodigoRecuperacion"):
            self.assertIn(f'onclick="{fn}()"', self.admin)
            self.assertIn(f"window.{fn}={fn}", self.admin)

    def test_valida_antes_de_escribir(self):
        # Un código pegado a medias no puede dejar guardado un hash inservible:
        # eso bloquearía el admin incluso con la contraseña correcta.
        i_valida = self.admin.index("El código está incompleto o corrupto")
        i_escribe = self.admin.index("localStorage.setItem(AUTH_HASH_KEY, d.h)")
        self.assertLess(i_valida, i_escribe)
        self.assertIn("d.h.length!==64", self.admin)

    def test_rechaza_codigos_de_otra_version(self):
        # Si cambiara AUTH_ITERATIONS, un código viejo restauraría un hash que
        # ya no corresponde a lo que calcula hashPassword.
        self.assertIn("Number(d.i)!==AUTH_ITERATIONS", self.admin)

    def test_no_se_sube_a_ningun_sitio(self):
        # Todo el sentido de esta vía es que el hash NO se publique: si se
        # subiera, valdría lo mismo que abrir admin_auth a lectura pública.
        bloque = self.admin[self.admin.index("const REC_PREFIJO"):
                            self.admin.index("async function tmCambiarPassword")]
        for prohibido in ("fetch(", "subirArchivoAGitHub", "firebaseio"):
            self.assertNotIn(prohibido, bloque)

    def test_avisa_de_que_el_codigo_es_sensible(self):
        self.assertIn("Trátalo como una contraseña", self.admin)


class ClienteSincronizacionTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.src = TM_ADMIN.read_text(encoding="utf-8")

    def test_sync_recibe_el_proof_por_parametro(self):
        self.assertIn("async function sincronizarPasswordAFirebase(proofHash)",
                      self.src)

    def test_ya_no_intenta_leer_el_hash_para_el_proof(self):
        # Era el fallo: con .read cerrado ese fetch devuelve 401, se quedaba
        # sin proof y el PUT se rechazaba.
        self.assertNotIn("if (d && d.hash) currentHash = d.hash", self.src)
        self.assertIn("const currentHash = proofHash || localHash", self.src)

    def test_cambiar_password_pasa_el_hash_viejo(self):
        # cambiarPasswordAdmin machaca AUTH_HASH_KEY con el hash nuevo antes de
        # sincronizar; si no pasara `ch` (el viejo, ya verificado contra la
        # contraseña actual), el proof correcto se habría perdido.
        self.assertIn("sincronizarPasswordAFirebase(ch)", self.src)
        i_guarda = self.src.index("localStorage.setItem(AUTH_HASH_KEY, nh)")
        i_sync = self.src.index("sincronizarPasswordAFirebase(ch)")
        self.assertLess(i_guarda, i_sync)

    def test_el_rechazo_por_proof_se_explica(self):
        # 401/403 aquí solo puede significar "este dispositivo tiene una
        # contraseña vieja"; soltar "HTTP 401" no le dice nada al admin.
        self.assertIn("res.status === 401 || res.status === 403", self.src)

    def test_no_promete_multidispositivo_que_no_da(self):
        # El mensaje de éxito decía "Puedes acceder desde cualquier
        # dispositivo", y con el hash ilegible eso no es cierto.
        self.assertNotIn("Puedes acceder desde cualquier dispositivo", self.src)


if __name__ == "__main__":
    unittest.main()
