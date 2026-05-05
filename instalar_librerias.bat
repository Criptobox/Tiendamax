@echo off
TITLE Instalador TiendaMax (Modo Ligero)
color 0A

echo ======================================================
echo    INSTALADOR DE LIBRERIAS (MODO LIGERO)
echo ======================================================
echo.
echo Este instalador es ultra-compatible y NO usa Playwright.
echo.

:: 1. Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Python no se encuentra. 
    pause
    exit
)

:: 2. Instalar dependencias minimas
echo [+] Instalando Flask, CORS y Requests...
python -m pip install flask flask-cors requests
if %errorlevel% neq 0 (
    pip install flask flask-cors requests
)

echo.
echo ======================================================
echo    ✅ INSTALACION FINALIZADA
echo ======================================================
echo.
echo Ahora usa: iniciar_windows.bat
echo.
pause
