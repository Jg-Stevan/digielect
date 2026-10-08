# 🗳️ Digielect — Digitalización y Monitoreo de Actas E-14 (Exterior)

Plataforma fullstack para la **digitalización, transmisión y auditoría de actas de escrutinio E-14** de los consulados de Colombia en el exterior, construida sobre los datos reales del visor oficial de la Registraduría (`e14segundavueltapresidente.registraduria.gov.co`).

| Módulo | Rol | Funcionalidad |
|---|---|---|
| **Pantalla de acceso** | — | Supervisor con credenciales · digitalizador SIN credenciales (sin fricción) |
| **Sistema de Monitoreo (Supervisor)** | Jefe de digitalización | Monitor global, salud del sistema/pico de cierre, bandeja de anomalías, control SLA, carga masiva BATCH, informes y auditoría |
| **PWA Digitalizador** | Digitalizador consular | Captura → análisis automático → auto-envío si cumple el score (RN-02), reintentos/emergencia RN-03, modo contingencia |

### 🔐 Credenciales de la demo

| Rol | Usuario | Clave |
|---|---|---|
| Supervisor de Digitalización | `supervisor` | `digielect` |
| Digitalizador consular | — **sin credenciales** — | — |

> El digitalizador no pide nada al operador: enfoca el acta, la analiza y **se sube sola si cumple el score**; solo las advertencias piden intervención. Las credenciales del supervisor se configuran en el backend con `SUPERVISOR_USER` / `SUPERVISOR_PASSWORD` (defaults de demo).

## 🚀 Demo en GitHub Pages

Este repositorio despliega automáticamente una **demo estática** en GitHub Pages:

> **https://jg-stevan.github.io/digielect/**

La demo corre en **MODO DEMO** (sin servidor): los datos reales se sirven desde `/public/data/*.json` y las acciones del visitante (ingesta de actas, resolución de anomalías, carga masiva) se persisten en `localStorage` del navegador, junto con un botón **REINICIAR DEMO**. El análisis de visión se simula localmente y se indica claramente en la interfaz.

### Habilitar Pages (solo la primera vez)

1. En GitHub: **Settings → Pages → Build and deployment → Source: `GitHub Actions`**
2. Cada push a `main` ejecuta `.github/workflows/deploy-pages.yml` y publica la demo.

## 🌊 Diseñado para el pico de cierre

La ola de digitalización no es uniforme: cada país cierra urnas a las **16:00 hora local** y el panel *Salud del Sistema* calcula en vivo (con los offsets UTC reales de los 67 países) cuántos puestos y mesas cierran por hora, el throughput estimado y la utilización frente a la capacidad de ingesta.

Arquitectura prevista para soportar los picos:

- **Ingesta asíncrona encolada** — el digitalizador recibe ACK inmediato y las actas se procesan en cola (nada bloquea al operador).
- **Workers de análisis escalables horizontalmente** — el análisis de visión (VLM) es stateless: más réplicas = más throughput en el pico.
- **Escrituras por lotes** — la persistencia agrupa inserts por lote para absorber ráfagas.
- **Capacidad declarada: 480 actas/min** — ≈ 8× el pico estimado del cierre exterior (ver el panel en el Monitor Global).

## 🖥️ Modo completo (backend real)

GitHub Pages solo sirve archivos estáticos; para el sistema completo con base de datos, análisis VLM real (GLM-4.6V) y persistencia, corre el backend Next.js localmente:

```bash
# 1. Dependencias
bun install

# 2. Base de datos (Prisma + SQLite)
cp .env.example .env        # DATABASE_URL → ./db/custom.db
bun run db:push             # crea el esquema
bun run db:seed             # carga los datos reales de la Registraduría

# 3. Servidor de desarrollo
bun run dev                 # http://localhost:3000
```

> El análisis de actas usa `z-ai-web-dev-sdk` (visión GLM-4.6V) desde el servidor; las credenciales se configuran en el entorno del backend.

### Regenerar los datos de la demo

```bash
bun run dev &                       # el backend debe estar corriendo
bun run demo:export                 # exporta /api/bootstrap + /api/informes → public/data/*.json
```

## 🧱 Arquitectura

```
src/
├── app/
│   ├── page.tsx              # Shell SPA: Supervisor + Digitalizador (un solo route)
│   └── api/                  # Backend (solo modo completo; se excluye del build estático)
│       ├── bootstrap/        # GET  — tablero completo del supervisor
│       ├── actas/            # POST — ingesta con RN-02/RN-03 (+ [id]/imagen, /analizar)
│       ├── anomalias/resolver/  # POST — modal de auditoría RF-2.3
│       ├── batch/            # POST — cola de carga masiva RF-2.4
│       └── informes/         # GET  — consolidado + escrutinio + audit trail
├── components/
│   ├── supervisor/           # MonitorGlobal, RevisionAnomalias, CentroNotificaciones,
│   │                         # CargaMasiva, GenerarInformes + 4 modales
│   └── digitalizador/        # PWA: Control, Captura, Revisión, Éxito, Contingencia, Resumen
├── lib/
│   ├── api-client.ts         # API unificada: /api/* en servidor ↔ demo-store en Pages
│   ├── demo-store.ts         # Motor del modo demo (RN-02/03, anomalías, BATCH, localStorage)
│   ├── monitor.ts            # Lógica del monitor (servidor, Prisma → vistas)
│   ├── analisis-acta.ts      # Motor VLM (GLM-4.6V, server-only)
│   ├── env.ts                # IS_STATIC_EXPORT / withBasePath
│   └── types.ts              # Tipos del dominio E-14
├── prisma/
│   ├── schema.prisma         # Consulado, Mesa, Acta, Anomalia, SLA, BATCH, Auditoría
│   ├── seed.ts               # Semilla con datos reales de la Registraduría
│   └── data/                 # Recortes reales del visor E-14 (exterior)
├── scripts/
│   └── export-static-data.ts # Exporta la BD → public/data/*.json (modo demo)
└── public/
    ├── data/                 # Datos de la demo (versionados)
    ├── actas/                # 8 imágenes E-14 (1800px + mini/) para probar el flujo de visión
    └── vendor/               # Tesseract + heic2any vendorizados (OCR y HEIC sin red)
```

### Datos reales de la Registraduría

La base de datos se alimenta con los JSON públicos del visor E-14 (`/assets/temis/divipol_json/`):

- **949 consulados/puestos** del departamento 88 (67 países), **3.670 mesas** y **14.680 actas** con su código de transmisión y hash PDF real.
- **Avance nacional real**: 122.019 / 122.020 actas publicadas (34 departamentos), visible en el módulo de informes.
- Relojes por país calculados con el offset UTC real de cada consulado.

## 🔀 Dos builds, un mismo código

| | Modo completo (`bun run dev`) | Demo estática (GitHub Pages) |
|---|---|---|
| Datos | Prisma + SQLite | `public/data/*.json` + deltas en `localStorage` |
| Análisis de actas | VLM GLM-4.6V real | Simulación local (etiquetada) |
| Mutaciones | API routes + BD | `demo-store.ts` |
| Build | `output: standalone` | `output: export` + `basePath: /digielect` |

La rama se elige con variables de entorno en el build (ver `next.config.ts` y el workflow); no hay código duplicado.

## 📜 Scripts

| Comando | Descripción |
|---|---|
| `bun run dev` | Servidor de desarrollo (puerto 3000) |
| `bun run build` | Build de producción standalone (con backend) |
| `bun run build:static` | Build de exportación estática (con `NEXT_STATIC_EXPORT=1`) |
| `bun run db:push` / `db:seed` | Esquema + datos reales en SQLite |
| `bun run demo:export` | Regenera `public/data/*.json` desde el backend |
| `bun run lint` | ESLint |

## 📁 Estructura del repositorio

- `src/`, `prisma/`, `public/`, `.github/` — Aplicación Next.js 16 (este proyecto).
- `Proyecto en General/`, `CONTEXTO INICIAL/`, `PROYECTO ELECTORAL/`, `PWA (DIGITALIZADOR)/`, `Sistema de Monitoreo (Supervisor)/` — Documentación original del proyecto (ERS, diseños, actas).
- Rama `vite-legacy` — Prototipo original (Vite + React) del que se migró la interfaz, conservado como respaldo histórico.

## 📄 Licencia y uso

Proyecto académico/electoral de monitoreo basado en información pública de la Registraduría Nacional del Estado Civil de Colombia. Los datos del visor E-14 pertenecen a su fuente oficial.
