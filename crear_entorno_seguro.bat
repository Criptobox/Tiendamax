@echo off
TITLE Configurador de Entorno Seguro - TiendaMax
color 0B

echo ======================================================
echo    CONFIGURADOR DE ENTORNO SEGURO (VENV)
echo ======================================================
echo.
echo Vamos a crear una "burbuja" aislada para que el bot
echo funcione sin errores de Windows.
echo.

:: 1. Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Python no se encuentra. 
    pause
    exit
)

:: 2. Crear Entorno Virtual
echo [+] Creando la burbuja de entorno (esto tarda un poco)...
python -m venv venv

:: 3. Instalar librerias dentro del entorno
echo [+] Instalando librerias dentro de la burbuja...
venv\Scripts\python.exe -m pip install --upgrade pip
venv\Scripts\python.exe -m pip install flask flask-cors apscheduler requests playwright greenlet==3.0.1

:: 4. Instalar Navegador dentro del entorno
echo [+] Configurando navegador interno...
venv\Scripts\python.exe -m playwright install chromium

:: 5. Crear Lanzador del Entorno
echo [+] Creando lanzador final...
(
echo @echo off
echo echo 🚀 Iniciando Bot desde Entorno Seguro...
echo venv\Scripts\python.exe backend/app.py
echo pause
) > iniciar_tienda_segura.bat

echo.
echo ======================================================
echo    ✅ ENTORNO CONFIGURADO CON EXITO
echo ======================================================
echo.
echo Ahora usa el nuevo archivo: iniciar_tienda_segura.bat
echo.
pause
