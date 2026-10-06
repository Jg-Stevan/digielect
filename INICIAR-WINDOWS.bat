@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Digielect - Iniciador para Windows
cd /d "%~dp0"

REM ============================================================
REM  DIGIELECT - Iniciador de un clic para Windows
REM  Doble clic en este archivo para arrancar la aplicacion.
REM  No necesita credenciales de git ni conocimientos tecnicos.
REM  Archivo en ASCII puro (sin acentos) a proposito: evita
REM  problemas de codepage en consolas de Windows.
REM ============================================================

REM --- Configuracion (puedes cambiar el puerto aqui) ---
set "PUERTO=3000"
set "URL=http://localhost:%PUERTO%"

echo.
echo ==============================================================
echo    DIGIELECT
echo    Digitalizacion, transmision y auditoria de actas E-14
echo    (Consulados de Colombia en el exterior)
echo ==============================================================
echo.
echo Carpeta del proyecto:
echo   %CD%
echo.

REM ------------------------------------------------------------
REM [PASO 1/5] Verificar o instalar Bun
REM ------------------------------------------------------------
echo [PASO 1/5] Verificando Bun (el motor que ejecuta Digielect)...
where bun >nul 2>nul
if not errorlevel 1 goto BUN_LISTO

echo   Bun no esta instalado. Intentando instalarlo automaticamente...
where winget >nul 2>nul
if errorlevel 1 goto BUN_POWERSHELL

echo   Intento 1 de 2: instalando con winget...
winget install --id Oven-sh.Bun -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto BUN_POWERSHELL
goto BUN_REFRESCAR_PATH

:BUN_POWERSHELL
echo   Intento 2 de 2: instalando con PowerShell (script oficial de bun.sh)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
if errorlevel 1 goto BUN_ERROR

:BUN_REFRESCAR_PATH
REM Bun se instala tipicamente en %USERPROFILE%\.bun\bin
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
where bun >nul 2>nul
if errorlevel 1 goto BUN_ERROR

:BUN_LISTO
for /f "delims=" %%v in ('bun --version 2^>nul') do set "BUN_VERSION=%%v"
echo   Estado: Bun %BUN_VERSION% listo.
echo.

REM ------------------------------------------------------------
REM [PASO 2/5] Dependencias del proyecto
REM ------------------------------------------------------------
echo [PASO 2/5] Verificando dependencias del proyecto...
if exist "node_modules" goto DEPS_LISTO
echo   Primera vez: descargando dependencias, tarda unos minutos...
echo   (Descarga tipica: 100-300 MB. Deja esta ventana abierta.)
bun install
if errorlevel 1 goto ERROR_DEPS

:DEPS_LISTO
echo   Estado: dependencias listas.
echo.

REM ------------------------------------------------------------
REM [PASO 3/5] Base de datos local (SQLite)
REM ------------------------------------------------------------
echo [PASO 3/5] Preparando base de datos local...
REM Misma ruta de SQLite que .env.example (relativa a prisma/schema.prisma)
set "DATABASE_URL=file:../db/custom.db"
if exist ".env" goto ENV_OK
if exist ".env.example" copy /y ".env.example" ".env" >nul 2>nul
:ENV_OK
if exist "db" goto DIR_DB_OK
mkdir "db"
:DIR_DB_OK
set "BD_NUEVA=0"
if not exist "db\custom.db" set "BD_NUEVA=1"

bunx prisma generate
if errorlevel 1 goto ERROR_PRISMA
bunx prisma db push --accept-data-loss
if errorlevel 1 goto ERROR_PRISMA
if "%BD_NUEVA%"=="0" goto BD_LISTA
echo   Primera vez: cargando los datos reales de la Registraduria...
bun prisma/seed.ts
if errorlevel 1 goto ERROR_PRISMA

:BD_LISTA
echo   Estado: base de datos local lista.
echo.

REM ------------------------------------------------------------
REM [PASO 4/5] Arrancar el servidor en una ventana aparte
REM ------------------------------------------------------------
echo [PASO 4/5] Arrancando el servidor de Digielect...
echo   Verificando que el puerto %PUERTO% este libre...
powershell -NoProfile -Command "try { if (Get-NetTCPConnection -LocalPort %PUERTO% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 } } catch { exit 0 }"
if errorlevel 1 goto ERROR_PUERTO

start "Digielect Servidor" cmd /k "cd /d "%~dp0" && bunx next dev -p %PUERTO%"
echo   Estado: servidor arrancando en la ventana negra "Digielect Servidor".
echo.

REM ------------------------------------------------------------
REM [PASO 5/5] Esperar al servidor y abrir el navegador
REM ------------------------------------------------------------
echo [PASO 5/5] Esperando a que Digielect responda (tope: 90 segundos)...
powershell -NoProfile -Command "$fin = (Get-Date).AddSeconds(90); $n = 0; while ($true) { try { Invoke-WebRequest -UseBasicParsing http://localhost:%PUERTO% -TimeoutSec 2 | Out-Null; exit 0 } catch { $n = $n + 1; if ((Get-Date) -ge $fin) { exit 1 }; Write-Host ('   esperando al servidor... intento ' + $n); Start-Sleep -Seconds 2 } }"
if errorlevel 1 goto ERROR_SERVIDOR

echo   Estado: servidor respondiendo en %URL%
start "" %URL%
echo.
echo ==============================================================
echo    DIGIELECT ESTA CORRIENDO
echo ==============================================================
echo.
echo   Se abrio tu navegador en %URL%
echo.
echo   IMPORTANTE:
echo   - NO cierres la ventana negra del servidor (Digielect
echo     Servidor): ahi esta Digielect funcionando.
echo   - Para detener Digielect, cierra esa ventana negra
echo     (o presiona Ctrl+C dentro de ella).
echo   - La proxima vez solo haz doble clic en este archivo:
echo     sera mucho mas rapido.
echo.
pause
exit /b 0

REM ------------------------------------------------------------
REM Mensajes de error (siempre con accion sugerida)
REM ------------------------------------------------------------
:BUN_ERROR
echo.
echo ==============================================================
echo    [ERROR] No se pudo instalar Bun automaticamente.
echo ==============================================================
echo.
echo   Que paso: puede faltar internet, permisos, o tu Windows
echo   no tiene winget y el instalador tambien fallo.
echo   ACCION SUGERIDA: descarga e instala "Bun for Windows" desde
echo   https://bun.sh y luego vuelve a hacer doble clic en este
echo   archivo.
echo.
pause
exit /b 1

:ERROR_DEPS
echo.
echo ==============================================================
echo    [ERROR] Fallo la descarga de dependencias.
echo ==============================================================
echo.
echo   Que paso: normalmente es falta de internet o una descarga
echo   interrumpida.
echo   ACCION SUGERIDA: revisa tu conexion a internet, cierra esta
echo   ventana y vuelve a hacer doble clic en el archivo.
echo.
pause
exit /b 1

:ERROR_PRISMA
echo.
echo ==============================================================
echo    [ERROR] Fallo la preparacion de la base de datos.
echo ==============================================================
echo.
echo   Que paso: la base de datos local no se pudo crear o
echo   actualizar.
echo   ACCION SUGERIDA: cierra esta ventana, verifica que haya
echo   internet la primera vez y vuelve a intentarlo. Si el
echo   problema sigue, borra la carpeta "db" de esta carpeta y
echo   vuelve a ejecutar el archivo.
echo.
pause
exit /b 1

:ERROR_PUERTO
echo.
echo ==============================================================
echo    [ERROR] El puerto %PUERTO% ya esta ocupado por otro programa.
echo ==============================================================
echo.
echo   ACCION SUGERIDA:
echo   1. Si ya iniciaste Digielect antes, cierra la ventana negra
echo      del servidor (Digielect Servidor) y vuelve a ejecutar.
echo   2. Si otro programa usa el puerto, puedes cambiarlo: abre
echo      este archivo con el Bloc de notas, cambia la linea
echo      set "PUERTO=3000" por otro numero (ejemplo: 3001),
echo      guarda y vuelve a ejecutar.
echo.
pause
exit /b 1

:ERROR_SERVIDOR
echo.
echo ==============================================================
echo    [ERROR] El servidor no respondio en 90 segundos.
echo ==============================================================
echo.
echo   Mira la ventana negra "Digielect Servidor": ahi aparece el
echo   motivo del fallo.
echo   ACCION SUGERIDA: toma una captura de esa ventana y reportala,
echo   luego cierrala y vuelve a ejecutar este archivo.
echo.
pause
exit /b 1
