import sys
import os
import logging
import json
import time
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from revolico_agent import SocialAgent

app = Flask(__name__)
CORS(app)
social_agent = SocialAgent("admin", "admin")

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({'status': 'online', 'mode': 'hibrido', 'time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")})

@app.route('/api/abrir-navegador', methods=['GET'])
def abrir_navegador():
    res = social_agent.iniciar_navegador()
    return jsonify({'success': res})

@app.route('/api/publicar-revolico', methods=['POST'])
def publicar_revolico():
    producto = request.json
    res = social_agent.publicar_producto(producto)
    return jsonify(res)

@app.route('/api/publicar-ahora', methods=['POST'])
def publicar_ahora():
    productos = request.json
    resultados = []
    for p in productos:
        res = social_agent.publicar_producto(p)
        resultados.append(res)
        time.sleep(2) # Espera entre productos
    return jsonify({'success': True, 'mensaje': f'Se procesaron {len(resultados)} productos.'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)
