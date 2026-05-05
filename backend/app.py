import sys
import os
import logging
import json
from datetime import datetime

# AGREGAR LIBRERIAS LOCALES AL PATH (SI EXISTEN)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(BASE_DIR, 'lib')
if os.path.exists(LIB_DIR):
    sys.path.insert(0, LIB_DIR)

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("\n[!] ERROR: Falta la libreria Flask. Ejecuta 'instalar_librerias.bat'.\n")
    sys.exit(1)

from revolico_agent import SocialAgent

# Configuración de logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

social_agent = SocialAgent("admin", "admin")

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        'status': 'online',
        'mode': 'lightweight',
        'time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

@app.route('/api/importar-cookies-revolico', methods=['POST'])
def importar_cookies_revolico():
    data = request.json
    try:
        with open(os.path.join(BASE_DIR, 'revolico_cookies.json'), 'w') as f:
            json.dump(data, f, indent=2)
        return jsonify({'success': True, 'mensaje': 'Cookies de Revolico guardadas'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/importar-cookies-facebook', methods=['POST'])
def importar_cookies_facebook():
    data = request.json
    try:
        with open(os.path.join(BASE_DIR, 'facebook_cookies.json'), 'w') as f:
            json.dump(data, f, indent=2)
        return jsonify({'success': True, 'mensaje': 'Cookies de Facebook guardadas'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/abrir-navegador', methods=['GET'])
def abrir_navegador():
    res = social_agent.iniciar_navegador()
    return jsonify({'success': res, 'mensaje': 'Navegador abierto. Inicia sesión en Revolico.' if res else 'Error al abrir navegador'})

@app.route('/api/publicar-revolico', methods=['POST'])
def publicar_revolico():
    producto = request.json
    res = social_agent.publicar_producto(producto)
    return jsonify(res)

@app.route('/api/publicar-facebook', methods=['POST'])
def publicar_facebook():
    producto = request.json
    res = social_agent.publicar_facebook(producto)
    return jsonify(res)

if __name__ == '__main__':
    print("\n" + "="*40)
    print("🚀 BOT TIENDAMAX (MODO LIGERO) ACTIVO")
    print("📍 Puerto: 5002")
    print("="*40 + "\n")
    app.run(host='0.0.0.0', port=5002)
