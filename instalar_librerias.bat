@echo off
TITLE Instalador TiendaMax (Modo Hibrido)
color 0A

echo ======================================================
echo    INSTALADOR DE LIBRERIAS (MODO HIBRIDO)
echo ======================================================
echo.
echo Este instalador configura Selenium para automatizacion real.
echo.

:: 1. Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Python no se encuentra. 
    pause
    exit
)

:: 2. Instalar dependencias
echo [+] Instalando Flask, Selenium y Drivers...
python -m pip install flask flask-cors requests selenium webdriver-manager
if %errorlevel% neq 0 (
    pip install flask flask-cors requests selenium webdriver-manager
)

echo.
echo ======================================================
echo    ✅ INSTALACION FINALIZADA
echo ======================================================
echo.
echo Ahora usa: iniciar_windows.bat
echo.
pause
