@echo off
TITLE Instalador Portatil - TiendaMax
color 0D

echo ======================================================
echo    INSTALADOR PORTATIL (TiendaMax)
echo ======================================================
echo.
echo Vamos a descargar las librerias directamente aqui.
echo Esto saltara cualquier error de Windows.
echo.

:: 1. Crear carpeta de librerias
if not exist "backend\lib" mkdir "backend\lib"

:: 2. Instalar librerias dentro de la carpeta del proyecto
echo [+] Descargando librerias en la carpeta local...
python -m pip install flask flask-cors apscheduler requests playwright greenlet==3.0.1 -t "backend/lib"

:: 3. Instalar Navegador
echo [+] Configurando navegador...
python -m playwright install chromium

echo.
echo ======================================================
echo    ✅ INSTALACION LOCAL COMPLETADA
echo ======================================================
echo.
echo Ahora intenta abrir: iniciar_windows.bat
echo.
pause
