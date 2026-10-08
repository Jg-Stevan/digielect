# ============================================================
# DIGIELECT - Instalador y arranque para Windows (PowerShell)
# ------------------------------------------------------------
# Alternativa robusta al archivo INICIAR-WINDOWS.bat (raiz).
#
# Uso (elige una opcion):
#   1) Clic derecho sobre este archivo > "Ejecutar con PowerShell"
#   2) Desde una consola de PowerShell:
#        powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1
#        powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1 -Puerto 3001
#
# [OLA6 6.9] Notas Windows-safe sobre los scripts de package.json:
#   - "bun run dev" usa un pipe Unix ("| tee dev.log") que NO es
#     portable a cmd.exe. En Windows la via recomendada es ESTE
#     instalador (o un .bat que lo invoque): abre el servidor en su
#     propia ventana de consola. Si quieres registro en archivo,
#     lanza manualmente:  bunx next dev -p 3000 *> dev.log
#     (PowerShell)  o  bunx next dev -p 3000 > dev.log 2>&1  (cmd).
#   - "bun run start" = "node .next/standalone/server.js": el server
#     standalone de Next se ejecuta con node y el propio server.js
#     setea process.env.NODE_ENV = "production" (viene en la
#     plantilla que genera next build), asi que NO hace falta
#     definir NODE_ENV a mano en Windows.
#
# Nota de codificacion: este archivo se escribe SIN acentos
# (ASCII puro) a proposito, para que Windows PowerShell 5.1 lo
# lea bien con cualquier codepage del sistema.
# ============================================================

param(
    [int]$Puerto = 3000
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# Rutas base
# ------------------------------------------------------------
$Raiz   = Split-Path -Parent $PSScriptRoot   # carpeta raiz del proyecto (padre de scripts/)
$Url    = "http://localhost:$Puerto"
$BunBin = Join-Path $env:USERPROFILE ".bun\bin"

Set-Location $Raiz

# ------------------------------------------------------------
# Utilidades de salida (colores por paso)
# ------------------------------------------------------------
function Write-Titulo {
    param([string]$Mensaje)
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor DarkCyan
    Write-Host "  $Mensaje" -ForegroundColor Cyan
    Write-Host "==============================================================" -ForegroundColor DarkCyan
}

function Write-Paso {
    param([string]$Mensaje)
    Write-Host ""
    Write-Host "[PASO] $Mensaje" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Mensaje)
    Write-Host "   OK - $Mensaje" -ForegroundColor Green
}

function Write-Aviso {
    param([string]$Mensaje)
    Write-Host "   > $Mensaje" -ForegroundColor Yellow
}

function Write-Fallo {
    param([string]$Mensaje)
    Write-Host "   [ERROR] $Mensaje" -ForegroundColor Red
}

function Wait-Usuario {
    Write-Host ""
    Read-Host "Presiona ENTER para cerrar esta ventana" | Out-Null
}

# Lanza error claro si el ultimo comando externo fallo.
function Assert-Codigo {
    param([string]$Descripcion)
    if ($LASTEXITCODE -ne 0) {
        throw "$Descripcion fallo (codigo de salida $LASTEXITCODE)."
    }
}

# ------------------------------------------------------------
# Deteccion / instalacion de Bun
# ------------------------------------------------------------
function Ensure-Bun {
    if (Get-Command bun -ErrorAction SilentlyContinue) { return }

    Write-Aviso "Bun no esta instalado. Intentando instalarlo automaticamente..."

    # Intento 1: winget (Windows 10/11 actualizado)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Aviso "Intento 1 de 2: instalando con winget..."
        try {
            winget install --id Oven-sh.Bun -e --accept-source-agreements --accept-package-agreements
            if ($LASTEXITCODE -eq 0) { Write-Ok "winget instalo Bun" }
            else { Write-Aviso "winget fallo (codigo $LASTEXITCODE)" }
        } catch {
            Write-Aviso "winget fallo: $($_.Exception.Message)"
        }
    } else {
        Write-Aviso "winget no esta disponible en este equipo"
    }

    # Intento 2: script oficial de bun.sh
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Aviso "Intento 2 de 2: instalando con PowerShell (script oficial de bun.sh)..."
        try {
            powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
            if ($LASTEXITCODE -ne 0) { Write-Aviso "el instalador de bun.sh fallo (codigo $LASTEXITCODE)" }
        } catch {
            Write-Aviso "el instalador de bun.sh fallo: $($_.Exception.Message)"
        }
    }

    # Refrescar PATH con la ruta tipica de instalacion de Bun
    if (Test-Path $BunBin) {
        $env:Path = "$BunBin;" + $env:Path
    }

    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        throw "No se pudo instalar Bun automaticamente. Instala 'Bun for Windows' desde https://bun.sh y vuelve a ejecutar este script."
    }
}

# ============================================================
# FLUJO PRINCIPAL
# ============================================================
Write-Titulo "DIGIELECT - Digitalizacion de Actas E-14 (Exterior)"
Write-Host "  Carpeta del proyecto: $Raiz"
Write-Host "  Puerto: $Puerto"

try {
    # --------------------------------------------------------
    # PASO 1: Bun
    # --------------------------------------------------------
    Write-Paso "1/5 - Verificando Bun (el motor que ejecuta Digielect)"
    Ensure-Bun
    $versionBun = (& bun --version)
    Write-Ok "Bun $versionBun listo"

    # --------------------------------------------------------
    # PASO 2: Dependencias
    # --------------------------------------------------------
    Write-Paso "2/5 - Verificando dependencias del proyecto"
    if (Test-Path (Join-Path $Raiz "node_modules")) {
        Write-Ok "Dependencias ya instaladas"
    } else {
        Write-Aviso "Primera vez: descargando dependencias, tarda unos minutos..."
        Write-Aviso "(Descarga tipica: 100-300 MB. Deja esta ventana abierta.)"
        bun install
        Assert-Codigo "bun install"
        Write-Ok "Dependencias instaladas"
    }

    # --------------------------------------------------------
    # PASO 3: Base de datos local (SQLite + Prisma)
    # --------------------------------------------------------
    Write-Paso "3/5 - Preparando base de datos local (SQLite)"
    # Misma ruta que .env.example (relativa a prisma/schema.prisma)
    $env:DATABASE_URL = "file:../db/custom.db"

    $envExample = Join-Path $Raiz ".env.example"
    $envFile    = Join-Path $Raiz ".env"
    if ((-not (Test-Path $envFile)) -and (Test-Path $envExample)) {
        Copy-Item $envExample $envFile
        Write-Aviso "Creado archivo .env a partir de .env.example"
    }

    $dirDb = Join-Path $Raiz "db"
    if (-not (Test-Path $dirDb)) {
        New-Item -ItemType Directory -Path $dirDb | Out-Null
    }
    $dbFile  = Join-Path $dirDb "custom.db"
    $bdNueva = -not (Test-Path $dbFile)

    bunx prisma generate
    Assert-Codigo "prisma generate"

    # [OLA6 6.2] push SIN --accept-data-loss cuando la BD ya existe:
    # si el schema cambia de forma destructiva, Prisma frena (o pide
    # confirmacion) en vez de borrar datos en silencio. Si sabes que
    # quieres perder los datos, ejecuta a mano:  bun run db:push:force
    # (equivale al antiguo comportamiento destructivo por defecto).
    if ($bdNueva) {
        # BD recien creada: no hay datos que perder; el flag solo evita
        # el prompt interactivo de Prisma en el primer arranque.
        bunx prisma db push --accept-data-loss
    } else {
        bunx prisma db push
    }
    Assert-Codigo "prisma db push"

    if ($bdNueva) {
        Write-Aviso "Primera vez: cargando los datos reales de la Registraduria..."
        bun prisma/seed.ts
        Assert-Codigo "carga de datos (seed)"
    }
    Write-Ok "Base de datos local lista"

    # --------------------------------------------------------
    # PASO 4: Servidor en proceso/ventana separada
    # --------------------------------------------------------
    Write-Paso "4/5 - Arrancando el servidor en una ventana aparte"

    $ocupado = $false
    try {
        if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
            $ocupado = $true
        }
    } catch {
        $ocupado = $false   # si la consulta falla, asumimos que el puerto esta libre
    }
    if ($ocupado) {
        throw "El puerto $Puerto ya esta ocupado. Si ya iniciaste Digielect antes, cierra la ventana negra del servidor y vuelve a ejecutar; o usa otro puerto con: .\instalar-windows.ps1 -Puerto 3001"
    }

    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k", "bunx next dev -p $Puerto" `
        -WorkingDirectory $Raiz `
        -WindowStyle Normal
    Write-Ok "Servidor arrancando (ventana negra aparte)"

    # --------------------------------------------------------
    # PASO 5: Esperar al servidor y abrir el navegador
    # --------------------------------------------------------
    Write-Paso "5/5 - Esperando a que Digielect responda (tope: 90 segundos)"

    $tope  = (Get-Date).AddSeconds(90)
    $listo = $false
    while (-not $listo) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
            $listo = $true
        } catch {
            if ((Get-Date) -ge $tope) { break }
            Write-Host "   esperando al servidor en $Url ..." -ForegroundColor DarkGray
            Start-Sleep -Seconds 2
        }
    }
    if (-not $listo) {
        throw "El servidor no respondio en 90 segundos. Revisa la ventana negra del servidor: ahi aparece el motivo del fallo."
    }
    Write-Ok "Servidor respondiendo en $Url"

    Start-Process $Url   # abre el navegador por defecto

    Write-Titulo "DIGIELECT ESTA CORRIENDO"
    Write-Host "  Se abrio tu navegador en $Url"
    Write-Host ""
    Write-Host "  IMPORTANTE:"
    Write-Host "  - NO cierres la ventana negra del servidor: ahi esta Digielect funcionando."
    Write-Host "  - Para detener Digielect, cierra esa ventana negra (o presiona Ctrl+C dentro de ella)."
    Write-Host "  - La proxima vez solo vuelve a ejecutar este script: sera mucho mas rapido."
    Wait-Usuario
    exit 0

} catch {
    Write-Host ""
    Write-Fallo $_.Exception.Message
    Write-Host ""
    Write-Host "  ACCION SUGERIDA:" -ForegroundColor Yellow
    Write-Host "  - Revisa tu conexion a internet (hace falta la primera vez)."
    Write-Host "  - Cierra esta ventana y vuelve a ejecutar el script."
    Write-Host "  - Si el problema sigue, envia una captura del mensaje de error de arriba."
    Wait-Usuario
    exit 1
}
