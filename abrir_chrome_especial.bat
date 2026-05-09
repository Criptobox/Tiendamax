@echo off
TITLE TiendaMax - Abrir Chrome para el Bot
color 0B

echo.
echo ╔══════════════════════════════════════════╗
echo ║   CHROME PARA BOT TIENDAMAX              ║
echo ║   Usa TU perfil real (anti-Cloudflare)   ║
echo ╚══════════════════════════════════════════╝
echo.

REM ── Cerrar Chrome si está abierto ─────────────────
echo [1/3] Cerrando Chrome si está abierto...
taskkill /f /im chrome.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo       Listo.

REM ── Abrir Chrome con TU perfil real ───────────────
echo [2/3] Abriendo Chrome con tu perfil real...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data" ^
  --profile-directory="Default" ^
  --no-first-run ^
  --no-default-browser-check
timeout /t 3 /nobreak >nul
echo       Chrome abierto.

echo [3/3] Todo listo.
echo.
echo ══════════════════════════════════════════════
echo.
echo  ✅ Chrome abierto con TU perfil real
echo     (Cloudflare te reconoce como humano)
echo.
echo  📋 PASOS A SEGUIR:
echo.
echo  1. Verifica que estés logueado en:
echo       → https://www.revolico.com
echo       → https://www.facebook.com
echo.
echo  2. Si no estás logueado, inicia sesión
echo     manualmente ahora en este Chrome.
echo.
echo  3. Cuando estés listo, ejecuta:
echo       iniciar_bot.bat
echo.
echo ══════════════════════════════════════════════
echo.
pause
