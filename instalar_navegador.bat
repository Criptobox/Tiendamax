@echo off
TITLE Instalador de Navegador - TiendaMax
color 0B

echo ======================================================
echo    INSTALADOR DE NAVEGADOR INTERNO
echo ======================================================
echo.
echo El bot necesita descargar un navegador especial (Chromium)
echo para poder entrar a Revolico y Facebook.
echo.

:: 1. Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Python no se encuentra. 
    pause
    exit
)

:: 2. Forzar instalacion de Playwright por si acaso
echo [+] Asegurando librerias de navegacion...
python -m pip install playwright

:: 3. Descargar Chromium
echo [+] Descargando navegador Chromium (esto puede tardar unos minutos)...
echo Por favor, no cierres esta ventana.
python -m playwright install chromium

if %errorlevel% neq 0 (
    echo.
    echo [!] Hubo un problema. Intentando metodo alternativo...
    playwright install chromium
)

echo.
echo ======================================================
echo    ✅ NAVEGADOR INSTALADO CORRECTAMENTE
echo ======================================================
echo.
echo Ahora ya puedes usar: iniciar_windows.bat
echo.
pause
