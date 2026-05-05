import os
import json
import time
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

# ===== RUTAS DE COOKIES =====
COOKIES_FILE = os.path.join(os.path.dirname(__file__), 'revolico_cookies.json')
FACEBOOK_COOKIES = os.path.join(os.path.dirname(__file__), 'facebook_cookies.json')

def cargar_cookies(file_path):
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except: return []
    return []

def convertir_cookies_cookie_editor(cookies_json):
    """Convierte cookies de formato Cookie-Editor a formato requests"""
    cookies_dict = {}
    for c in cookies_json:
        cookies_dict[c['name']] = c['value']
    return cookies_dict

class SocialAgent:
    def __init__(self, email, password):
        self.email = email
        self.password = password
        self.session = requests.Session()
        # Headers ultra-realistas para evitar el Error 405 y bloqueos
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Content-Type': 'application/json',
            'Origin': 'https://www.revolico.com',
            'Referer': 'https://www.revolico.com/item/publish',
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        })

    def publicar_producto(self, producto):
        """Publicacion AUTOMATICA en Revolico corrigiendo el Error 405"""
        try:
            cookies_raw = cargar_cookies(COOKIES_FILE)
            if not cookies_raw:
                return {'success': False, 'error': 'No hay cookies de Revolico. Importalas en el Admin.'}
            
            cookies = convertir_cookies_cookie_editor(cookies_raw)
            
            # Estructura de datos exacta para Revolico (Basado en inspeccion de red)
            # El error 405 suele ser por un endpoint incorrecto o falta de '/' final
            payload = {
                "title": producto.get('nombre'),
                "description": f"{producto.get('descripcion')}\n\nPrecio: ${producto.get('precioActual')} USD\nContacto: 5354320170",
                "price": float(producto.get('precioActual')),
                "currency": "USD",
                "category": 24, # Categoria Venta/Varios
                "is_negotiable": False
            }

            logger.info(f"Enviando publicacion automatica a Revolico: {producto.get('nombre')}")
            
            # Intentamos con el endpoint REST estandar con barra final (importante para evitar 405)
            response = self.session.post(
                "https://www.revolico.com/api/items/", 
                json=payload, 
                cookies=cookies,
                timeout=25
            )

            if response.status_code in [200, 201]:
                return {'success': True, 'mensaje': '¡Publicado automaticamente en Revolico!'}
            
            # Si el 405 persiste, intentamos la ruta de GraphQL como respaldo
            elif response.status_code == 405:
                logger.warning("Error 405 en API REST, intentando via GraphQL...")
                graphql_query = {
                    "operationName": "CreateItem",
                    "variables": {
                        "input": {
                            "title": producto.get('nombre'),
                            "description": payload['description'],
                            "price": payload['price'],
                            "currency": "USD",
                            "category": "24"
                        }
                    },
                    "query": "mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id title } }"
                }
                resp_gql = self.session.post(
                    "https://www.revolico.com/api/graphql/", 
                    json=graphql_query, 
                    cookies=cookies,
                    timeout=25
                )
                if resp_gql.status_code == 200:
                    return {'success': True, 'mensaje': '¡Publicado automaticamente via GraphQL!'}
                
            return {'success': False, 'error': f'Revolico rechazo la peticion (Error {response.status_code})'}

        except Exception as e:
            logger.error(f"Error en Revolico Agent: {e}")
            return {'success': False, 'error': str(e)}

    def publicar_facebook(self, producto):
        """Publicacion en Facebook (Modo Ligero)"""
        # Facebook sigue siendo asistido por seguridad, pero Revolico sera automatico
        return {'success': True, 'mensaje': 'Asistente de Facebook listo.'}
