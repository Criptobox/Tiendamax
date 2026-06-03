#!/usr/bin/env python3
"""
Minifica js/script.src.js → js/script.js usando terser (vía npx).

Flujo:
  - Lee la fuente desde js/script.src.js  (legible, en el repo)
  - Escribe el minificado en  js/script.js  (lo que sirve el HTML)

Funciones reservadas (no renombradas por el mangler):
  Cualquier función que se llame desde atributos HTML (onclick, data-action),
  desde otros archivos JS del proyecto, o que se exporte en window.*.

Uso:
  python scripts/minify_js.py
"""

import subprocess
import sys
from pathlib import Path


# ── Archivos ──────────────────────────────────────────────────────────────────
SRC  = Path('js/script.src.js')   # fuente legible
DEST = Path('js/script.js')       # minificado (servido por el HTML)

# ── Funciones que el mangler NO debe renombrar ────────────────────────────────
# Incluye: data-action del HTML, onclick inline, window.* exports,
# y funciones llamadas por otros JS (banners.js, biometric-auth.js, event-delegation.js).
RESERVED = [
    # ── data-action en index.html ──
    'abrirCarrito', 'abrirLoginAdmin', 'abrirMenuMovil', 'abrirPanelBusqueda',
    'abrirPanelCompartir', 'aplicarBusquedaHero', 'cerrarCarrito', 'cerrarDetalleModal',
    'cerrarMenuMovil', 'compartirFacebook', 'compartirNativo', 'compartirTelegram',
    'compartirTwitter', 'compartirWhatsApp', 'comprarCarrito', 'contactarWhatsApp',
    'copiarLinkProducto', 'filtrarPorCategoria', 'guardarResena', 'limpiarCarrito',
    'mostrarFormResena', 'mostrarVistaCategoria', 'mostrarVistaInicio', 'scrollToProductos',
    'setEstrellas', 'toggleDarkMode', 'toggleZoomImagen', 'volverAlInicio',
    # ── data-action en admin.html ──
    'agregarCategoria', 'agregarGrupoFB', 'agregarSubcategoria', 'cerrarAdminPanel',
    'cerrarEditModal', 'cerrarLoginModal', 'desactivarCountdown', 'desactivarOfertaDia',
    'guardarCountdown', 'guardarGruposFB', 'guardarNumeroWhatsApp', 'guardarOfertaDia2',
    'guardarRevolicoConfig', 'mostrarSelectorAsistenteFacebook', 'mostrarSelectorAsistenteRevolico',
    'sincronizarTodoConGitHub', 'switchTab',
    # ── onclick inline index.html ──
    'abrirModalNotificaciones', 'cerrarModalNotificaciones', 'cerrarVistaMeGusta',
    'cerrarVistaPedidos', 'mostrarVistaMeGusta', 'mostrarVistaPedidos',
    'moverBanner', 'setCurrency', 'toggleNotificacionesTM',
    # ── onclick inline admin.html ──
    'actualizarListaProductos', 'agregarBanner', 'cambiarPasswordAdmin',
    'enviarPushManualAdmin', 'exportarBannersJSON', 'guardarConfigFirebaseAdmin',
    'guardarConfiguracionGitHub', 'guardarTagline', 'guardarTasaMNAdmin', 'verificarPassword',
    # ── onclick inline generado en JS (buildHTML) ──
    'toggleMeGusta', 'cambiarCantidad', 'quitarDelCarrito', 'agregarAlCarrito',
    'seleccionarSugerencia', 'renderizarCarrito', 'abrirDetalleProducto',
    # ── llamadas desde banners.js / biometric-auth.js / event-delegation.js ──
    'mostrarNotificacion', 'abrirAdminPanel', 'loginConBiometria',
    # ── exports explícitos en window.* ──
    'guardarCarrito', 'tmFormatPrecio', 'tmRegistrarTokenFCMSiPermitido', 'tmMonedaActual',
]


def fmt(n: int) -> str:
    return f'{n:,} bytes ({n / 1024:.1f} KB)'


def minify(src: Path, dest: Path) -> tuple[int, int]:
    """Minifica src → dest con terser. Devuelve (original, minificado)."""
    original_size = src.stat().st_size

    reserved_json = '[' + ','.join(f'"{n}"' for n in RESERVED) + ']'

    result = subprocess.run(
        [
            'npx', '--yes', 'terser',
            str(src),
            # ── Compresión ────────────────────────────────────────────────
            '--compress',
            'passes=2,'           # dos pasadas → más reducción
            'drop_console=false,' # no eliminar console.* (hay logs de seguridad)
            'pure_getters=true,'
            'unsafe_math=false',  # Cuba: precisión de precios importa
            # ── Mangling de nombres ───────────────────────────────────────
            '--mangle',
            f'reserved={reserved_json}',
            # ── Salida ────────────────────────────────────────────────────
            '--output', str(dest),
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f'\n  ERROR al minificar {src}:')
        print(result.stderr or result.stdout)
        sys.exit(1)

    return original_size, dest.stat().st_size


def main() -> None:
    print('Minificando JS...\n')

    if not SRC.exists():
        print(f'  ERROR: {SRC} no encontrado.')
        print('  Asegúrate de que el archivo fuente sea js/script.src.js')
        sys.exit(1)

    original, minified = minify(SRC, DEST)
    savings     = original - minified
    savings_pct = (savings / original * 100) if original > 0 else 0

    print(f'[OK] {SRC} → {DEST}')
    print(f'   Original:   {fmt(original)}')
    print(f'   Minificado: {fmt(minified)}')
    print(f'   Ahorro:     {savings:,} bytes ({savings_pct:.1f}%)')
    print('=' * 60)


if __name__ == '__main__':
    main()
