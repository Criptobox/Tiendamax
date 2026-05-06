import os
import time
import logging
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By

logger = logging.getLogger(__name__)

class SocialAgent:
    def __init__(self, email, password):
        self.driver = None

    def conectar_a_chrome_real(self):
        print("\n[ℹ️] Conectando con Chrome Gemelo (Puerto 9222)...")
        chrome_options = Options()
        chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        try:
            self.driver = webdriver.Chrome(options=chrome_options)
            print("[✅] ¡BOT CONECTADO!")
            return True
        except Exception:
            print("[❌] Error: Asegurate de abrir 'abrir_chrome_especial.bat'.")
            return False

    def iniciar_navegador(self):
        return self.conectar_a_chrome_real()

    def publicar_producto(self, producto):
        if not self.driver:
            if not self.conectar_a_chrome_real(): return {'success': False, 'error': 'Chrome no conectado.'}
        
        try:
            print(f"\n[🚀] Publicando: {producto.get('nombre')}")
            self.driver.execute_script("window.open('https://www.revolico.com/item/publish', '_blank');")
            self.driver.switch_to.window(self.driver.window_handles[-1])
            time.sleep(6)
            
            actions = ActionChains(self.driver)
            
            # 1. Titulo
            print("   - Escribiendo Titulo...")
            actions.send_keys(Keys.TAB).send_keys(producto.get('nombre')).perform()
            
            # 2. Precio
            print("   - Escribiendo Precio...")
            actions = ActionChains(self.driver)
            actions.send_keys(Keys.TAB).send_keys(str(producto.get('precioActual'))).perform()
            
            # 3. Descripcion
            print("   - Escribiendo Descripcion...")
            actions = ActionChains(self.driver)
            actions.send_keys(Keys.TAB).send_keys(Keys.TAB).send_keys(f"{producto.get('descripcion')}\n\nContacto: 5354320170").perform()
            
            # 4. SUBIR IMAGEN (NUEVO)
            print("   - Intentando subir imagen...")
            try:
                # Intentamos encontrar el input de tipo file para la imagen
                # Nota: En Revolico suele ser un input invisible que se activa al clickear
                img_path = producto.get('imagen')
                if img_path and os.path.exists(img_path):
                    file_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='file']")
                    file_input.send_keys(os.path.abspath(img_path))
                    print("   [✅] Imagen cargada.")
                else:
                    # Si es una URL externa, Selenium no puede subirla directamente,
                    # el usuario tendria que haberla descargado antes.
                    print("   [⚠️] Imagen no encontrada localmente o es una URL.")
            except Exception as e:
                print(f"   [⚠️] No se pudo subir la imagen automaticamente: {e}")

            print(f"[✅] {producto.get('nombre')} listo.")
            
            # PAUSA DE SEGURIDAD (2 MINUTOS)
            print("\n[⏳] ESPERANDO 120 SEGUNDOS para la siguiente publicacion (Seguridad Antivbot)...")
            for i in range(120, 0, -10):
                print(f"      Faltan {i} segundos...")
                time.sleep(10)
            
            return {'success': True, 'mensaje': f'Producto {producto.get("nombre")} publicado.'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
