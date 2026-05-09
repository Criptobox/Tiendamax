@echo off
TITLE Reparador Total de Python - TiendaMax
color 0E

echo ======================================================
echo    REPARADOR TOTAL DE ENTORNO (TiendaMax)
echo ======================================================
echo.
echo Este script detectara cual es tu Python real y lo arreglara.
echo.

:: 1. Buscar Python de todas las formas posibles
set "PY_CMD="
where python >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD (
    where py >nul 2>&1 && set "PY_CMD=py"
)

if not defined PY_CMD (
    echo [!] No se encontro Python. Por favor, instalalo de la Microsoft Store.
    pause
    exit
)

echo [+] Usando comando: %PY_CMD%
%PY_CMD% --version

:: 2. Instalar forzosamente usando el modulo pip de ese python especifico
echo [+] Instalando Flask y dependencias en el Python correcto...
%PY_CMD% -m pip install flask flask-cors apscheduler requests playwright greenlet==3.0.1 --user --force-reinstall

:: 3. Crear un lanzador personalizado que use ese mismo Python
echo [+] Creando lanzador seguro...
(
echo @echo off
echo echo 🚀 Iniciando Bot con Python detectado...
echo %PY_CMD% backend/app.py
echo pause
) > lanzar_bot_seguro.bat

:: 4. Instalar navegador
echo [+] Instalando navegador interno...
%PY_CMD% -m playwright install chromium

echo.
echo ======================================================
echo    ✅ REPARACION FINALIZADA
echo ======================================================
echo.
echo Se ha creado un nuevo archivo: lanzar_bot_seguro.bat
echo USA ESE ARCHIVO PARA ABRIR EL BOT DE AHORA EN ADELANTE.
echo.
pause
