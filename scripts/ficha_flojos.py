#!/usr/bin/env python3
"""
Carga la ficha de los 14 productos que quedaron con solo "Categoría" y "Estado"
después de importar el catálogo HTML.

Todo sale de datos que el propio catálogo ya tenía: la `descripcion` de cada
producto y las `specs` que el HTML pisó con su plantilla genérica (rescatadas
del historial de git). Nada estimado — donde el texto no dice un dato, el campo
no existe.

    python3 scripts/ficha_flojos.py            # dry-run
    python3 scripts/ficha_flojos.py --aplicar
"""
import argparse, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

D = {
 1778336859697: {                                   # Toldo Para Sombra
  'ficha': [
    {'k': '📐 Medidas', 'v': '3m x 6m'},
    {'k': '🎨 Color', 'v': 'Beige'},
    {'k': '🧵 Tela', 'v': 'Transpirable'},
    {'k': '☀️ Bloqueo UV', 'v': '90%'},
    {'k': '🔷 Forma', 'v': 'Rectangular'},
  ],
  'caracteristicas': [
    {'d': 'Tela transpirable: deja pasar el aire en vez de acumular calor debajo.'},
    {'d': 'Se instala amarrado a postes o paredes, sin estructura fija.'},
  ],
  'idealPara': ['Patios, piscinas y terrazas que necesitan sombra sin obra.'],
  'incluye': ['1x Toldo de sombra 3m x 6m'],
 },
 1778384078432: {                                   # Cámara V380 PRO (bombillo)
  'ficha': [
    {'k': '🔌 Montaje', 'v': 'Rosca estándar E27', 'nota': 'se enrosca en cualquier sócalo de lámpara'},
    {'k': '⚡ Alimentación', 'v': '110V / 220V'},
    {'k': '📹 Resolución', 'v': 'Full HD 1080p'},
    {'k': '🔄 Movimiento', 'v': 'PTZ: 360° horizontal / 90° vertical'},
    {'k': '🌙 Visión nocturna', 'v': 'LEDs infrarrojos + luz blanca', 'nota': 'la luz blanca permite ver a color de noche'},
    {'k': '🎤 Audio', 'v': 'Bidireccional', 'nota': 'micrófono y altavoz para hablar y escuchar'},
    {'k': '📶 Conexión', 'v': 'Wi-Fi 2.4 GHz'},
    {'k': '📱 Aplicación', 'v': 'V380 PRO'},
  ],
  'caracteristicas': [
    {'d': 'Se instala en el sócalo de una lámpara: no hace falta tirar cable ni fuente aparte.'},
    {'d': 'Giro motorizado de 360°, así que una sola cámara cubre toda la habitación.'},
    {'d': 'Audio de ida y vuelta desde el celular, para hablar con quien esté del otro lado.'},
  ],
  'idealPara': ['Vigilar la casa, un portal o un negocio sin instalación eléctrica adicional.'],
  'incluye': ['1x Cámara Wi-Fi V380 PRO tipo bombillo'],
 },
 1778384769262: {                                   # Ventilador Para Carro
  'ficha': [
    {'k': '🔢 Cabezales', 'v': '3'},
    {'k': '🔌 Alimentación', 'v': 'Toma del encendedor (cigarrera)'},
  ],
  'caracteristicas': [
    {'d': 'Refresca el interior sin encender el aire acondicionado, así que no consume combustible extra.'},
    {'d': 'Tres cabezales orientables para repartir el aire por el habitáculo.'},
  ],
  'idealPara': ['Refrescar el carro en días de calor sin depender del aire acondicionado.'],
  'incluye': ['1x Ventilador de 3 cabezales para carro'],
 },
 1778384976624: {                                   # Cargador Portátil Solar
  'ficha': [
    {'k': '🔌 Tipo', 'v': 'Power bank con panel solar integrado'},
    {'k': '☀️ Recarga', 'v': 'Corriente eléctrica o panel solar'},
    {'k': '📱 Carga inalámbrica', 'v': 'Sí'},
    {'k': '🔦 Linterna LED', 'v': 'Incorporada'},
  ],
  'caracteristicas': [
    {'d': 'Se recarga con corriente o con el sol, así que sirve aunque el apagón se alargue.'},
    {'d': 'Carga inalámbrica además de los puertos, para los teléfonos que la soportan.'},
  ],
  'idealPara': ['Apagones largos y salidas al campo, donde no hay dónde enchufar.'],
  'incluye': ['1x Cargador portátil solar'],
 },
 1778717147247: {                                   # Shorts Deportivos
  'ficha': [
    {'k': '🧵 Material', 'v': 'Nylon deportivo', 'nota': 'de secado rápido'},
    {'k': '👖 Cintura', 'v': 'Elástica con cordón'},
    {'k': '🎒 Bolsillos', 'v': 'Bolsillo lateral con cierre'},
    {'k': '🦺 Seguridad', 'v': 'Franja reflectiva en la pierna'},
    {'k': '🎨 Colores', 'v': 'Verde olivo, gris oscuro, azul marino, gris claro'},
  ],
  'caracteristicas': [
    {'d': 'Franja reflectiva en la pierna: se ve al correr de noche o con poca luz.'},
    {'d': 'Bolsillo con cierre, para que el teléfono o las llaves no se salgan al moverse.'},
  ],
  'idealPara': ['Entrenar, correr o el día a día, con secado rápido después del sudor.'],
  'incluye': ['1x Short deportivo'],
 },
 1778906905279: {                                   # Espejos Stealth fibra de carbón
  'ficha': [
    {'k': '✨ Diseño', 'v': 'Tipo Stealth (alerón)'},
    {'k': '🎨 Acabado', 'v': 'Fibra de carbón premium'},
    {'k': '🔩 Instalación', 'v': 'Incluye tornillería'},
  ],
  'caracteristicas': [
    {'d': 'Viene con la tornillería, así que no hay que conseguirla aparte para montarlos.'},
  ],
  'incluye': ['1x Par de espejos retrovisores Stealth', '1x Juego de tornillería'],
 },
 1778907072353: {                                   # Espejos Poligonales
  'ficha': [
    {'k': '✨ Diseño', 'v': 'Poligonal aerodinámico (alerón Stealth)'},
    {'k': '🕶️ Cristal', 'v': 'Con tinte'},
    {'k': '🔩 Instalación', 'v': 'Incluye tornillería'},
  ],
  'caracteristicas': [
    {'d': 'Cristal con tinte, que corta el reflejo de los faros de atrás por la noche.'},
    {'d': 'Viene con la tornillería, así que no hay que conseguirla aparte para montarlos.'},
  ],
  'incluye': ['1x Par de espejos retrovisores poligonales', '1x Juego de tornillería'],
 },
 1778907260915: {                                   # Calentador Eléctrico
  'ficha': [
    {'k': '🚿 Tipo', 'v': 'Calentador instantáneo de agua', 'nota': 'sin tanque de acumulación'},
    {'k': '📟 Control', 'v': 'Panel digital'},
    {'k': '🎨 Color', 'v': 'Negro con blanco'},
    {'k': '🔧 Conexión', 'v': 'Directo a la tubería de agua'},
  ],
  'caracteristicas': [
    {'d': 'Calienta al momento en vez de guardar agua caliente: no gasta mientras no se usa.'},
    {'d': 'Panel digital para fijar la temperatura en vez de buscarla con la llave.'},
  ],
  'idealPara': ['Baños sin calentador de tanque, donde no hay lugar para uno grande.'],
  'incluye': ['1x Calentador eléctrico instantáneo', '1x Ducha de mano', '1x Manguera flexible'],
 },
 1780083017984: {                                   # PC Gaming Setup Premium
  'ficha': [
    {'k': '🎮 Tarjeta gráfica', 'v': 'NVIDIA GeForce RTX 2070 Super'},
    {'k': '🔧 Placa madre', 'v': 'Gigabyte AORUS Gaming'},
    {'k': '❄️ Refrigeración', 'v': 'Líquida AIO', 'nota': 'para el procesador'},
    {'k': '🖥️ Gabinete', 'v': 'Blanco, doble panel de cristal templado'},
    {'k': '💡 Iluminación', 'v': 'ARGB personalizable', 'nota': 'en ventiladores y bomba líquida'},
  ],
  'caracteristicas': [
    {'d': 'Refrigeración líquida en el procesador: aguanta sesiones largas sin bajar el rendimiento por calor.'},
    {'d': 'Doble panel de cristal templado, con la iluminación ARGB a la vista.'},
  ],
  'idealPara': ['Jugar a alto rendimiento y trabajos de edición o render.'],
  'incluye': ['1x PC Gaming armada y lista para usar'],
 },
 1780887747583: {                                   # Altavoz Bluetooth RGB
  'ficha': [
    {'k': '🔊 Altavoces', 'v': 'Doble altavoz estéreo HD con radiador de graves'},
    {'k': '💡 Iluminación', 'v': 'Aro LED RGB en la base', 'nota': 'con varios modos rítmicos'},
    {'k': '🔌 Conexiones', 'v': 'Bluetooth, auxiliar 3.5mm, MicroSD y USB'},
    {'k': '🧵 Estructura', 'v': 'Recubierta en tela resistente, con correa de transporte'},
    {'k': '🎛️ Controles', 'v': 'Táctiles en la parte superior'},
  ],
  'caracteristicas': [
    {'d': 'Radiador de graves además de los dos altavoces, que es lo que le da el golpe bajo.'},
    {'d': 'Cuatro formas de conectarse: no depende solo del Bluetooth.'},
    {'d': 'Correa de transporte y forro de tela, pensado para llevarlo afuera.'},
  ],
  'idealPara': ['Reuniones, patio y salidas donde el altavoz se mueve de un lado a otro.'],
  'incluye': ['1x Altavoz Bluetooth portátil RGB'],
 },
 1780887971522: {                                   # Beat Boom F10
  'ficha': [
    {'k': '🏷️ Marca', 'v': 'MSY Audio'},
    {'k': '🔤 Modelo', 'v': 'Beat Boom F10'},
    {'k': '🔊 Potencia', 'v': '25W RMS', 'nota': 'sonido estéreo'},
    {'k': '📶 Alcance Bluetooth', 'v': 'Hasta 30 metros'},
    {'k': '💡 Iluminación', 'v': 'Tiras RGB dinámicas en los laterales'},
    {'k': '🔌 Conexiones', 'v': 'USB, lector TF Card y auxiliar 3.5mm'},
    {'k': '🎛️ Controles', 'v': 'Botones de goma en la parte superior'},
  ],
  'caracteristicas': [
    {'d': 'Las tiras RGB recorren los laterales siguiendo el ritmo de la música.'},
    {'d': '30 metros de alcance sin interferencias: el teléfono puede quedarse en otra habitación.'},
    {'d': 'Lector de TF Card y USB, así que suena aunque no haya teléfono cerca.'},
  ],
  'idealPara': ['Fiestas y reuniones donde se busca volumen y luces.'],
  'incluye': ['1x Bocina Bluetooth Beat Boom F10'],
 },
 1781365135486: {                                   # Ventilador de Techo mini
  'ficha': [
    {'k': '📐 Tamaño', 'v': 'Compacto (mini)'},
    {'k': '🎨 Aspas', 'v': 'Blancas'},
    {'k': '🔧 Montaje', 'v': 'De techo'},
  ],
  'caracteristicas': [
    {'d': 'Tamaño reducido: entra donde un ventilador de techo normal no cabe.'},
  ],
  'idealPara': ['Cuartos chicos, pasillos y espacios de techo bajo.'],
  'incluye': ['1x Mini ventilador de techo'],
 },
 1781377297283: {                                   # Creatina Luckycare
  'ficha': [
    {'k': '🏷️ Marca', 'v': 'Luckycare'},
    {'k': '🧪 Tipo', 'v': 'Creatina monohidratada micronizada'},
    {'k': '⚖️ Por porción', 'v': '5000 mg', 'nota': '5 g'},
    {'k': '📦 Contenido', 'v': '500 g'},
    {'k': '🔢 Porciones', 'v': '100', 'nota': '500 g a 5 g por porción'},
  ],
  'caracteristicas': [
    {'d': 'Micronizada: se disuelve sin grumos y no queda arenosa en el vaso.'},
    {'d': '5 g por porción, que es la dosis de mantenimiento habitual.'},
  ],
  'idealPara': ['Entrenamiento de fuerza y recuperación muscular.'],
  'incluye': ['1x Envase de creatina monohidratada 500 g'],
 },
 1782439525089: {                                   # Panel Decorativo
  'ficha': [
    {'k': '🌿 Tipo', 'v': 'Panel de hojas artificiales (pared verde)'},
    {'k': '🔲 Formato', 'v': 'Módulos cuadrados que se conectan entre sí'},
    {'k': '🧹 Mantenimiento', 'v': 'Ninguno', 'nota': 'no se riega ni se poda'},
  ],
  'caracteristicas': [
    {'d': 'Los módulos se enganchan entre sí, así que la pared se arma del tamaño que haga falta.'},
    {'d': 'Al ser artificial no necesita luz, riego ni poda.'},
  ],
  'idealPara': ['Decorar paredes, balcones y negocios sin plantas que mantener.'],
  'incluye': ['1x Panel decorativo de hojas artificiales'],
 },
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    porId = {p['id']: p for p in full}
    faltan = [i for i in D if i not in porId]
    if faltan:
        sys.exit(f'IDs que no están en el catálogo: {faltan}')

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"}\n' + '=' * 68)
    for i, c in D.items():
        p = porId[i]
        print(f"\n{p['nombre'][:54]}")
        print(f"   antes: {len(p.get('ficha') or [])} datos de ficha")
        for f in c.get('ficha', []):
            nota = f'  ({f["nota"]})' if f.get('nota') else ''
            print(f"   +  {f['k'][:26]:28} = {f['v'][:40]}{nota[:26]}")
    print('\n' + '=' * 68)
    print(f'  productos      : {len(D)}')
    print(f'  filas de ficha : {sum(len(c.get("ficha", [])) for c in D.values())}')
    print(f'  características: {sum(len(c.get("caracteristicas", [])) for c in D.values())}')
    print(f'  incluye        : {sum(len(c.get("incluye", [])) for c in D.values())}')

    if not a.aplicar:
        print('\n  Para aplicar:  python3 scripts/ficha_flojos.py --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        n = 0
        for p in datos:
            c = D.get(p['id'])
            if not c:
                continue
            for k, v in c.items():
                if v:
                    p[k] = v
            n += 1
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2); f.write('\n')
        os.replace(tmp, ruta)
        print(f'  {path}: {n} productos')


if __name__ == '__main__':
    main()
