@echo off
TITLE Lanzador Chrome Gemelo (INFALIBLE)
color 0B

echo [+] Creando entorno para Chrome Gemelo...
if not exist "%~dp0backend\perfil_bot" mkdir "%~dp0backend\perfil_bot"

echo [+] Iniciando Chrome Gemelo en Puerto 9222...
:: Usamos una carpeta de perfil propia dentro del proyecto para que NUNCA choque con tu Chrome real
start chrome.exe --remote-debugging-port=9222 --user-data-dir="%~dp0backend\perfil_bot" --no-first-run --no-default-browser-check

echo.
echo [✅] ¡Chrome Gemelo abierto!
echo.
echo [!] IMPORTANTE: Inicia sesion en Revolico en ESTA ventana.
echo El bot solo trabajara en esta ventana de Chrome.
echo.
echo [!] PRUEBA: Escribe http://127.0.0.1:9222/json
echo.
pause
exit
