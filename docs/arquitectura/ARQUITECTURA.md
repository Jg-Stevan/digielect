# 🏗️ ARQUITECTURA — Digielect

> **Generado del código real el 2026-10-08** (commit `58effe1`). Si el código
> cambia, actualizar este documento en la misma tarea. Complemento de
> [`CONVENIOS.md`](../agentes/CONVENIOS.md) (glosario y contratos) — aquí está
> el "cómo está montado", allá el "qué significan las cosas".

---

## 1. Visión general

Una única app Next.js 16 (App Router) con **dos aplicaciones dentro**:

```
                        ┌────────────────────────────────┐
                        │   src/app/page.tsx (shell)     │
                        │   decide qué aplicación pintar │
                        └──────┬────────────────┬────────┘
                               │                │
              ┌────────────────▼───┐   ┌────────▼───────────────────┐
              │  SUPERVISOR        │   │  PWA DIGITALIZADOR          │
              │  (jefe de          │   │  (digitalizador consular,   │
              │   digitalización)  │   │  sin credenciales)          │
              │  src/components/   │   │  src/components/            │
              │  supervisor/       │   │  digitalizador/             │
              └────────┬───────────┘   └────────┬────────────────────┘
                       │                        │
                       │  ingesta validada      │ captura → análisis → envío
                       ▼                        ▼
              ┌──────────────────────────────────────────────┐
              │  API routes · src/app/api/**                 │
              │  Prisma (SQLite) + reglas E-14 server-side   │
              └──────────────────────────────────────────────┘
```

**Dos modos de operación** (un solo código, dos builds):

| Modo | Dónde corre | Datos | Persistencia |
|---|---|---|---|
| **Completo** | `bun run dev` (backend Next) | Prisma/SQLite + VLM real server-side | BD en `db/` |
| **Demo** | GitHub Pages (estático, `NEXT_STATIC_EXPORT=1 bun run build:static`) | `public/data/*.json` versionados | `localStorage` / IndexedDB del navegador |

La elección se hace con `IS_STATIC_EXPORT` (`src/lib/env.ts`) a través de
`src/lib/api-client.ts`. **No ramificar por `if` dispersos**: ramificar por
entorno de build. En modo demo las rutas `/api/*` no existen; el cliente usa
`src/lib/demo-store.ts`.

En Pages la app vive bajo el basePath `/digielect` (`NEXT_PUBLIC_BASE_PATH`);
toda referencia a assets estáticos debe pasar por `withBasePath` — cero rutas
absolutas hardcodeadas.

---

## 2. Mapa de `src/`

```
src/
├── app/
│   ├── page.tsx              Shell: login supervisor ⇄ app supervisor ⇄ PWA
│   ├── layout.tsx            Layout raíz, fuentes, RegistrarSW
│   ├── globals.css           Tailwind 4 + @theme (tokens brand/ink/ind) + scope .pwa-e14
│   └── api/**                Ver §3
├── components/
│   ├── supervisor/           15 componentes del dashboard (ver §4.1)
│   ├── digitalizador/        10 componentes de la PWA (ver §4.2)
│   ├── ErrorBoundary.tsx     Borde de error global (post-auditoría)
│   └── ui/                   shadcn/ui (New York)
└── lib/
    ├── types.ts              Tipos de dominio (ActaEstado, TipoAnomalia…)
    ├── env.ts                IS_STATIC_EXPORT y flags de entorno
    ├── api-client.ts         Fetch con basePath + elección demo/API
    ├── db.ts                 Cliente Prisma (server-only)
    ├── identificacion-acta.ts  Módulo puro de identificación determinista O(1)
    ├── verificar-acta.ts / analisis-acta.ts   Reglas de análisis de actas
    ├── reglas-e14.ts         Reglas de negocio E-14 (post-auditoría)
    ├── validacion.ts         Validación de payloads (post-auditoría)
    ├── sesion.ts             Sesión del supervisor (post-auditoría)
    ├── rate-limit.ts         Rate limiting de endpoints (post-auditoría)
    ├── sla.ts                SLA: cálculo y vencimientos (post-auditoría)
    ├── batch.ts              Carga masiva BATCH
    ├── cola-contingencia.ts  Cola offline de contingencia
    ├── sync.ts               Sincronización (BroadcastChannel / pestañas)
    ├── idb.ts                IndexedDB (cola de la PWA)
    ├── demo-store.ts         Persistencia del modo demo (localStorage)
    ├── auth-store.ts         Estado de autenticación del supervisor
    ├── monitor.ts / hora-zona.ts   Monitoreo global y zonas horarias (67 países)
    ├── indice-actas-remota.ts  Índice remoto de actas del visor
    ├── integracion-captura.ts  Puente captura → pipeline
    ├── e14/                  parse.ts (barcode15) · qr.ts (qrFingerprint) · quality.ts
    ├── scanner/              actaParser.ts · ocr-local.ts (Tesseract offline) · heic.ts
    └── digitalizador/        store.ts (zustand) · escaner.ts · use-camara.ts ·
                              quality.ts · reglas.ts · feedback.ts · actas-reales.ts · types.ts
```

---

## 3. API routes (`src/app/api`)

| Método | Ruta | Función |
|---|---|---|
| GET | `/api` | Health check / estado |
| GET | `/api/bootstrap` | Datos iniciales del supervisor (puestos, mesas, avance) |
| POST | `/api/actas` | **Ingesta de acta** (contrato `ActaUploadPayload`). Aplica reglas B-01 (dedup por `qrFingerprint`), B-02 (reemplazo), B-08 (límite de imagen) |
| POST | `/api/actas/analizar` | Análisis de visión VLM server-side |
| GET | `/api/actas/[id]/imagen` | Imagen almacenada del acta |
| POST | `/api/anomalias/resolver` | Resolver anomalía de la bandeja |
| POST | `/api/auth/login` | Login del supervisor (`SUPERVISOR_USER`/`SUPERVISOR_PASSWORD`) |
| GET | `/api/auth/sesion` | Sesión activa (post-auditoría) |
| POST | `/api/auth/logout` | Cerrar sesión (post-auditoría) |
| POST | `/api/batch` | Ingesta masiva BATCH |
| GET | `/api/digitalizador/bootstrap` | Datos iniciales de la PWA (contrato `ConsuladoDTO` + `ResumenTrabajo`) |
| GET | `/api/digitalizador/dataset` | Dataset completo para la PWA |
| GET | `/api/descargar-proyecto` | Descarga del proyecto empaquetado (post-auditoría) |
| GET | `/api/informes` | Informes de avance |
| POST | `/api/notificaciones` | Notificaciones / SLA |

---

## 4. Componentes

### 4.1 Supervisor (`src/components/supervisor/`)
`LoginScreen` · `Sidebar`/`Header` · `MonitorGlobal` (mapa/estado de puestos) ·
`SaludSistema` (pico de cierre 16:00 local por país, offsets UTC reales) ·
`RevisionAnomalias` (bandeja; incluye P-1 `UBICACION_DISCREPANTE`) ·
`ReinspectionModal` · `CargaMasiva` (BATCH) · `GenerarInformes` ·
`CentroNotificaciones` · `WhatsAppChatModal` (DEMO — marcado con `DemoBadge`) ·
`ConfigSlaModal`/`SlaHistorialModal` · `DescargarProyecto` · `DemoBadge`.

### 4.2 PWA Digitalizador (`src/components/digitalizador/`)
Flujo: `PantallaInicio` (puesto asignado, Opción A/B) → `PantallaControl`
(k-de-n de la mesa) → `PantallaCaptura` (visor inmersivo, auto-enfoque, recorte
+ B/N + score) → `PantallaRevision` (bandas RN-02) → `PantallaExito` /
reintentos (RN-03) → `PantallaResumen`. Offline: `PantallaContingencia`
(asignación manual por puesto/mesa) + `PanelColaFlotante` (cola IndexedDB con
sincronización y backoff). Orquestación: `DigitalizadorApp`; UI kit:
`shared.tsx` (tokens Stitch v2, scope `.pwa-e14`).

---

## 5. Base de datos (Prisma + SQLite)

`prisma/schema.prisma` — 10 modelos:

| Modelo | Qué representa |
|---|---|
| `Consulado` | Puesto consular (949 en 67 países) |
| `Mesa` | Mesa electoral (`(consulado, numberStand)`) |
| `Acta` | Acta E-14 digitalizada (`idTransmision`, `qrFingerprint`, estado) |
| `ResultadoVoto` | Resultados por corporación de un acta |
| `Anomalia` | Anomalía de la bandeja del supervisor |
| `NotificacionSla` | Notificaciones y vencimientos SLA |
| `ColaArchivo` | Cola de archivos en proceso |
| `AuditEvent` | Trazabilidad de auditoría |
| `AvanceDepartamento` / `AvanceCorporacion` | Avance nacional real del visor |

Datos semilla reales en `prisma/data/` (`exterior-actas.json` — 3.670 actas,
`exterior-tree.json`, `avance-*.json`). Regenerar: `bun run db:push && bun run db:seed`.

---

## 6. PWA, offline y service worker

- `public/sw.js` (v1.4.0): precache del shell + worker E-14 + 8 actas
  (~6.5MB); **el vendor pesado (Tesseract ~32MB, heic2any) se cachea
  on-demand** en `CACHE_RUNTIME`, nunca en el precache.
- `public/e14/deteccion-worker.js`: worker de detección/recorte del acta.
- Cola offline: IndexedDB (`src/lib/idb.ts`) con prioridad por `qualityScore`,
  backoff y guards anti-cruce (`src/lib/digitalizador/store.ts`).
- Identificación **determinista O(1) sin VLM** (C-17): índice por código de
  transmisión (`src/lib/identificacion-acta.ts`) contra las 3.670 actas reales.

---

## 7. CI/CD

`.github/workflows/deploy-pages.yml`: en cada push a `main` ejecuta
**quality gates** (`bunx tsc --noEmit` + `bun run lint`) →
`build:static` en modo demo → despliega a **GitHub Pages**
(https://jg-stevan.github.io/digielect/). Los filtros `paths` excluyen
cambios solo-de-documentación. `main` debe compilar **siempre**.
