@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 24 o superior y vuelve a intentarlo.
  pause
  exit /b 1
)
echo Iniciando servidor Tarpuy en http://localhost:3001
echo Deja esta ventana abierta. Pulsa Ctrl+C para detener el servidor.
call npm.cmd run dev
if errorlevel 1 (
  echo.
  echo El servidor se cerro con un error. Revisa los mensajes anteriores.
  pause
)
endlocal
