import os
import time
import logging
import json

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    pass

logger = logging.getLogger(__name__)

class SocialAgent:
    def __init__(self, email, password):
        self.driver = None

    def iniciar_navegador(self):
        """Inicia el navegador Chrome para que el usuario haga login"""
        try:
            chrome_options = Options()
            # chrome_options.add_argument("--start-maximized")
            # chrome_options.add_argument("--user-data-dir=selenium_user_data") # Guardar sesion
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            self.driver.get("https://www.revolico.com/auth")
            return True
        except Exception as e:
            logger.error(f"Error iniciando Selenium: {e}")
            return False

    def publicar_producto(self, producto):
        """Publicacion automatica una vez que el usuario ya esta logueado"""
        if not self.driver:
            if not self.iniciar_navegador():
                return {'success': False, 'error': 'No se pudo abrir el navegador. Revisa Chrome.'}
        
        try:
            # 1. Ir a la pagina de publicar
            self.driver.get("https://www.revolico.com/item/publish")
            time.sleep(3)
            
            # Verificar si pide login (si no estamos en la pagina de publicar)
            if "auth" in self.driver.current_url:
                return {'success': False, 'error': 'Por favor, inicia sesion en la ventana de Chrome primero.'}

            # 2. Rellenar el formulario (Basado en selectores de Revolico)
            wait = WebDriverWait(self.driver, 10)
            
            # Titulo
            titulo_input = wait.until(EC.presence_of_element_located((By.NAME, "title")))
            titulo_input.clear()
            titulo_input.send_keys(producto.get('nombre'))
            
            # Precio
            precio_input = self.driver.find_element(By.NAME, "price")
            precio_input.clear()
            precio_input.send_keys(str(producto.get('precioActual')))
            
            # Descripcion
            desc_input = self.driver.find_element(By.NAME, "description")
            desc_input.clear()
            desc_input.send_keys(f"{producto.get('descripcion')}\n\nContacto: 5354320170")
            
            # Nota: Aqui se podrian añadir mas campos (categoria, fotos)
            # Por ahora, dejamos que el usuario vea el progreso
            
            logger.info(f"Formulario completado para: {producto.get('nombre')}")
            time.sleep(2)
            
            # 3. Click en Publicar (Opcional: podemos dejar que el usuario lo revise)
            # publicar_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Publicar')]")
            # publicar_btn.click()
            
            return {'success': True, 'mensaje': f'Formulario de {producto.get("nombre")} completado. ¡Dale a publicar!'}

        except Exception as e:
            logger.error(f"Error publicando con Selenium: {e}")
            return {'success': False, 'error': f'Error en el navegador: {str(e)}'}

    def cerrar(self):
        if self.driver:
            self.driver.quit()
            self.driver = None
