@echo off
TITLE Instalador Navegador Local - TiendaMax
color 0B

echo ======================================================
echo    INSTALADOR DE NAVEGADOR EN RUTA LOCAL
echo ======================================================
echo.
echo Vamos a descargar el navegador dentro de tu carpeta.
echo Esto evitara errores de permisos en Windows.
echo.

:: 1. Crear carpeta para el navegador
if not exist "backend\browser" mkdir "backend\browser"

:: 2. Definir ruta de instalacion
set PLAYWRIGHT_BROWSERS_PATH=backend\browser

:: 3. Descargar Chromium en esa ruta
echo [+] Descargando Chromium en backend\browser...
echo Esto puede tardar unos minutos segun tu internet.
python -m playwright install chromium

if %errorlevel% neq 0 (
    echo [!] Fallo la descarga. Intentando de nuevo...
    playwright install chromium
)

echo.
echo ======================================================
echo    ✅ NAVEGADOR DESCARGADO LOCALMENTE
echo ======================================================
echo.
echo Ahora intenta abrir: iniciar_windows.bat
echo.
pause
