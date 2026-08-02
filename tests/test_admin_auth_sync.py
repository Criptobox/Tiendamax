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

    def test_no_usa_el_patron_proof(self):
        # Guardar el proof dentro de /config no protegia nada: en una escritura
        # parcial a un hijo, newData en el padre es el MERGE de lo existente con
        # lo que llega, asi que el proof ya guardado satisfacia la regla por si
        # solo y cualquiera podia reescribir o borrar version sin conocerlo.
        crudo = json.dumps(self.config)
        self.assertNotIn("_proof", crudo)
        self.assertNotIn("auth != null", crudo)

    def test_version_sigue_siendo_publica(self):
        # index.html y admin.html la leen sin credencial ninguna.
        self.assertIs(True, self.config["version"][".read"])

    def test_la_version_solo_puede_subir(self):
        # Sin esto cualquiera la baja y deja el cache-bust inservible.
        escritura = self.config["version"][".write"]
        self.assertIn("newData.val() > data.val()", escritura)

    def test_no_se_puede_borrar_la_version(self):
        # Un DELETE no lleva payload, asi que hay que exigir que newData exista;
        # borrarla mataria la senal de actualizacion para siempre.
        self.assertIn("newData.exists()", self.config["version"][".write"])
        self.assertIs(False, self.config[".write"])

    def test_no_se_pueden_colar_hijos_nuevos(self):
        # Sin comodin "$otro": la consola de Firebase lo rechazaba, y ademas
        # sobraba. El padre tiene .write false y solo "version" concede
        # escritura, asi que /config/loquesea ya esta denegado por si solo.
        self.assertIs(False, self.config[".write"])
        self.assertEqual({".read", ".write", "version"}, set(self.config))

    def test_la_ventana_de_reloj_es_simetrica(self):
        # Era now-300000 .. now+60000: un movil 61 s adelantado (normal) hacia
        # fallar el .validate y la publicacion se perdia en silencio.
        v = self.config["version"][".validate"]
        self.assertIn("now - 300000", v)
        self.assertIn("now + 300000", v)

    def test_el_cliente_avisa_si_no_pudo_publicar(self):
        # fetch no lanza en 4xx: sin mirar res.ok, el admin veia "actualizado"
        # y ningun cliente se enteraba nunca.
        i = self.catalog.index("async function _tmPublicarVersionFirebase")
        cuerpo = self.catalog[i:i + 1400]
        self.assertIn("res.ok", cuerpo)
        self.assertIn("config/version.json", cuerpo)


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

    def test_esta_el_boton_de_cambiar(self):
        self.assertIn('onclick="tmCambiarPassword()"', self.admin)

    def test_no_hay_boton_de_sincronizar_suelto(self):
        # Solo podia mandar proof = hash local, y eso deja proof == hash en la
        # base: a partir de ahi cualquiera escribe /admin_auth/hash sin conocer
        # nada, porque el merge de la escritura parcial satisface la regla.
        self.assertNotIn("tmSyncPassword", self.admin)

    def test_los_wrappers_llegan_al_onclick(self):
        # Todo ese <script> vive dentro de un IIFE: una función declarada ahí
        # no es global y el onclick del HTML no la encuentra. Hay que
        # exponerla a mano, como se hace con probarFirebase y compañía.
        self.assertIn("window.tmCambiarPassword=tmCambiarPassword", self.admin)

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

    def test_valida_la_forma_de_verdad(self):
        # Comprobar solo la longitud dejaba pasar 64 caracteres cualesquiera,
        # y una sal sin tope por arriba (megabytes) podía reventar la cuota
        # justo entre las dos escrituras.
        self.assertIn("/^[0-9a-f]{64}$/i.test(d.h)", self.admin)
        self.assertIn("/^[0-9a-f]{20,128}$/i.test(d.s)", self.admin)

    def test_el_control_de_version_no_se_salta(self):
        # Era `if(d.i && ...)`: un código sin ese campo se lo saltaba en
        # silencio, que es justo el caso que el mensaje llama fatal.
        self.assertIn("Number(d.i)!==AUTH_ITERATIONS", self.admin)
        self.assertNotIn("if(d.i && Number(d.i)", self.admin)

    def test_las_dos_escrituras_van_juntas_o_ninguna(self):
        # Si entrara el hash y fallara la sal, quedaría hash nuevo con sal
        # vieja y NINGUNA contraseña volvería a validar: ni la nueva ni la
        # anterior. Hace falta deshacer lo escrito antes de rendirse.
        i = self.admin.index("function _tmAplicarCodigoRec")
        cuerpo = self.admin[i:self.admin.index("function tmRestaurarCodigoRecuperacion")]
        self.assertIn("const hPrev", cuerpo)
        self.assertIn("const sPrev", cuerpo)
        self.assertIn("_restaurar()", cuerpo)
        # y se relee para confirmar que entraron las dos
        self.assertIn("localStorage.getItem(AUTH_HASH_KEY)!==d.h", cuerpo)

    def test_el_cambio_de_password_tambien_revierte(self):
        src = TM_ADMIN.read_text(encoding="utf-8")
        i = src.index("async function cambiarPasswordAdmin")
        cuerpo = src[i:i + 4000]
        self.assertIn("_hPrev", cuerpo)
        self.assertIn("_sPrev", cuerpo)
        # El "éxito" no puede anunciarse si la escritura no entró entera.
        self.assertIn("Sigue valiendo la anterior", cuerpo)

    def test_rechaza_codigos_de_otra_version(self):
        # Si cambiara AUTH_ITERATIONS, un código viejo restauraría un hash que
        # ya no corresponde a lo que calcula hashPassword.
        self.assertIn("Number(d.i)!==AUTH_ITERATIONS", self.admin)

    def test_no_se_sube_a_ningun_sitio(self):
        # Todo el sentido de esta vía es que el hash NO se publique: si se
        # subiera, valdría lo mismo que abrir admin_auth a lectura pública.
        ini = self.admin.index("const REC_PREFIJO")
        fin = self.admin.index("function tmRestaurarDesdeLogin")
        # La rebanada iba al revés (inicio > fin) y salía vacía: el assertNotIn
        # pasaba siempre, incluso con un fetch exfiltrando el hash dentro.
        self.assertGreater(fin, ini, "la rebanada no puede quedar vacía")
        bloque = self.admin[ini:fin]
        self.assertIn("REC_PREFIJO + btoa", bloque, "no se está mirando el bloque correcto")
        for prohibido in ("fetch(", "subirArchivoAGitHub", "firebaseio"):
            self.assertNotIn(prohibido, bloque)

    def test_avisa_de_que_el_codigo_es_sensible(self):
        self.assertIn("Trátalo como una contraseña", self.admin)

    def test_se_puede_restaurar_desde_el_login(self):
        # Lo que está dentro del panel queda detrás del propio login: si se
        # borran los datos del navegador no se puede entrar, así que una
        # recuperación que viva solo en Configuración es inalcanzable justo
        # cuando hace falta.
        i_login = self.admin.index('id="tm2LoginPass"')
        i_panel = self.admin.index('id="recCodigo"')
        i_caja = self.admin.index('id="recCodigoLogin"')
        self.assertLess(i_login, i_caja, "la caja debe estar en el formulario de login")
        self.assertLess(i_caja, i_panel, "y antes que la de Configuración")
        self.assertIn('onclick="tmRestaurarDesdeLogin()"', self.admin)
        self.assertIn("window.tmRestaurarDesdeLogin=tmRestaurarDesdeLogin", self.admin)

    def test_las_dos_entradas_validan_igual(self):
        # Una sola función de validación para las dos: si se duplicara, una
        # podría acabar aceptando lo que la otra rechaza.
        self.assertEqual(1, self.admin.count("function _tmAplicarCodigoRec("))
        for llamante in ("tmRestaurarCodigoRecuperacion", "tmRestaurarDesdeLogin"):
            i = self.admin.index(f"function {llamante}(")
            self.assertIn("_tmAplicarCodigoRec(", self.admin[i:i + 600])

    def test_el_codigo_lleva_su_fecha(self):
        # Un código restaura la contraseña que había CUANDO se generó, no la
        # actual. Sin la fecha, restaurar uno viejo parece que "no funciona"
        # cuando lo que ha hecho es devolverte la contraseña de antes.
        self.assertIn("t:Date.now()", self.admin)
        self.assertIn("new Date(d.t).toLocaleDateString()", self.admin)

    def test_avisa_antes_de_pisar_otra_contrasena(self):
        # Pegar un código viejo en un dispositivo que funciona lo dejaría sin
        # poder entrar con la contraseña de hoy.
        i_confirm = self.admin.index("¿Seguir?")
        i_escribe = self.admin.index("localStorage.setItem(AUTH_HASH_KEY, d.h)")
        self.assertLess(i_confirm, i_escribe, "hay que preguntar ANTES de escribir")
        self.assertIn("actual && actual !== d.h", self.admin)

    def test_al_cambiar_la_contrasena_avisa_de_regenerar(self):
        # Es justo el momento en que el código guardado queda obsoleto.
        self.assertIn('id="recAviso"', self.admin)
        i = self.admin.index("async function tmCambiarPassword(")
        cuerpo = self.admin[i:i + 1200]
        self.assertIn("localStorage.getItem(AUTH_HASH_KEY) !== antes", cuerpo)
        self.assertIn("recAviso", cuerpo)

    def test_no_promete_un_correo_que_no_existe(self):
        # El enlace "¿Olvidaste?" decía que se enviaría un enlace al correo
        # registrado. No hay servidor, ni cuentas, ni correo: engañaba justo
        # en el momento en que el admin está bloqueado.
        self.assertNotIn("enlace de recuperación a tu correo", self.admin)


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
        # Y tampoco puede caer en el hash local: eso guardaba proof == hash.
        self.assertNotIn("proofHash || localHash", self.src)
        self.assertIn("!proofHash || proofHash === localHash", self.src)

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
