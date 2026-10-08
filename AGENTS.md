# AGENTS.md — Punto de entrada para IAs y humanos

> **Si eres una IA (Claude, Codex, Cursor, Copilot…) o una persona nueva:
> EMPIEZA AQUÍ.** Este archivo es el mapa de navegación del repo y define el
> protocolo obligatorio de trabajo. Última actualización: 2026-10-08.

---

## ⚠️ REGLA DE PRODUCTO (NO NEGOCIABLE — GRABADA PARA TODOS LOS AGENTES)

> **LOS VOTOS (CAMPOS MANUSCRITOS) NO SE LEEN Y NO INTERESAN POR EL MOMENTO.**
> No se OCRIZAN, no se procesan, no se extraen. Ningún módulo debe intentar reconocer
> manuscritos. La meta de la aplicación es exactamente esta:
>
> 1. **Escanear en alta calidad** el acta E-14.
> 2. **Extraer con precisión los datos IMPRESOS de ruteo** (número de mesa, departamento,
>    municipio, zona, puesto) mediante OCR por zonas.
> 3. **Ubicar y guardar el acta en el lugar correcto** (match contra el catálogo de mesas).
>
> Lo manuscrito lo revisa un humano en el panel del supervisor si el score de calidad es
> bajo/intermedio. Si un agente propone leer manuscritos, LA PROPUESTA ESTÁ FUERA DE ALCANCE.

---

## 1. Qué es Digielect

Plataforma fullstack para la **digitalización, transmisión y auditoría de
actas E-14** de los consulados de Colombia en el exterior, construida sobre
los **datos reales** del visor de la Registraduría
(`e14segundavueltapresidente.registraduria.gov.co`): 3.670 actas, 949 puestos
consulares, 67 países.

Contiene **dos aplicaciones** (ver
[`docs/arquitectura/ARQUITECTURA.md`](docs/arquitectura/ARQUITECTURA.md)):

1. **Sistema de Monitoreo (Supervisor)** — dashboard del jefe de
   digitalización: monitor global, salud del sistema (pico de cierre),
   bandeja de anomalías, SLA, carga masiva BATCH, informes.
2. **PWA Digitalizador** — app del digitalizador consular (sin
   credenciales): captura → recorte + B/N + score → identificación
   determinista O(1) contra la base real → auto-envío (RN-02 ≥ 9) o
   reintentos/emergencia (RN-03), con cola offline IndexedDB y modo
   contingencia.

Restricciones de producto **no negociables**: procesamiento local del acta en
el dispositivo (sin enviar a terceros), funcionamiento sin Wi-Fi
(contingencia), deduplicación por `qrFingerprint`.

## 2. Stack y comandos

| Pieza | Tecnología |
|---|---|
| Framework | **Next.js 16** (App Router) + **TypeScript 5** |
| UI | Tailwind CSS 4 + shadcn/ui (New York) + Lucide |
| Datos | Prisma ORM + SQLite (`db/`), datos reales en `prisma/data/` |
| Runtime | **Bun** (pineado 1.3.14) |

```bash
bun install
bun run dev          # modo completo: backend + BD (http://localhost:3000)
bun run db:push      # crear/actualizar BD local
bun run db:seed      # sembrar datos reales del visor
bunx tsc --noEmit    # quality gate 1
bun run lint         # quality gate 2
NEXT_STATIC_EXPORT=1 bun run build:static   # quality gate 3: demo Pages
bun run demo:export  # regenerar public/data/*.json desde la BD
```

**Modo demo** (GitHub Pages, basePath `/digielect`): build estático sin
backend; datos de `public/data/*.json`; mutaciones en `localStorage`;
`IS_STATIC_EXPORT` (`src/lib/env.ts`) decide el modo — un solo código, dos
builds. Demo: <https://jg-stevan.github.io/digielect/>

Credenciales demo: `supervisor` / `digielect` (configurable con
`SUPERVISOR_USER`/`SUPERVISOR_PASSWORD`; ver `.env.example`).

## 3. Ruta de lectura recomendada (en orden)

1. **Este archivo** (AGENTS.md).
2. [`docs/agentes/CONVENIOS.md`](docs/agentes/CONVENIOS.md) — **LA LEY del
   dominio**: glosario canónico (idTransmision, hoja, tipoEjemplar,
   barcode15, qrFingerprint…), contratos del identificador, fronteras de
   arquitectura, convenciones de código. Si tu código lo contradice, tu
   código está mal.
3. [`docs/arquitectura/ARQUITECTURA.md`](docs/arquitectura/ARQUITECTURA.md) —
   cómo está montado todo (módulos, 15 rutas API, 10 modelos Prisma, modos).
4. [`docs/contexto/`](docs/contexto/README.md) — dominio electoral:
   anatomía del acta E-14, código de barras, proceso de digitalización,
   ERS, módulos PWA y Supervisor.
5. [`docs/auditoria/`](docs/auditoria/) — último análisis profundo
   (`ANALISIS-PROFUNDO.md`: 58 hallazgos; `PLAN-CONTINUIDAD.md`: OLAs 1-7).
6. [`docs/worklog/`](docs/worklog/) — memoria: historial C-1..C-17 y sesiones
   posteriores. El [`worklog.md`](worklog.md) de raíz es el protocolo+índice.
7. (Histórico) [`docs/agentes/README.md`](docs/agentes/README.md) y
   `TAREA-A/B/C.md` — cómo se coordinó el desarrollo original.

## 4. Protocolo de trabajo por sesión (OBLIGATORIO)

1. **Leer antes de tocar**: AGENTS.md + CONVENIOS.md + la entrada más reciente
   de `docs/worklog/` + backlog del [`worklog.md`](worklog.md) raíz.
2. **Cambios mínimos**: no refactorices módulos ajenos a tu tarea. Cambios
   que afecten a otros módulos o al convenio → marcarlos `[COORD]`.
3. **Verificación antes de declarar hecho** (los 3 gates, como en CI):
   `bunx tsc --noEmit` = 0 · `bun run lint` = 0 · y si tocaste UI/PWA,
   `NEXT_STATIC_EXPORT=1 bun run build:static` (la demo de Pages debe seguir
   compilando). `main` compila SIEMPRE: cada push a `main` despliega la demo
   pública.
4. **Registrar**: crea `docs/worklog/YYYY-MM-DD-<tema>.md` con la
   [`PLANTILLA-ENTRADA.md`](docs/worklog/PLANTILLA-ENTRADA.md) y añade la
   fila al índice del [`worklog.md`](worklog.md) raíz (append, nunca
   overwrite).
5. **Commits**: formato del repo — `feat(digitalizador): …`,
   `fix(supervisor): …`, `docs(agentes): …` — con cuerpo descriptivo cuando
   aporte. Un commit = proyecto compilando.

## 5. Convenciones y reglas que más se violan (leer dos veces)

- **Estados del acta**: usar SIEMPRE la unión `ActaEstado`
  (`PENDIENTE|VALIDADO|RECHAZADO|ANOMALIA|OFFLINE|EN_COLA`). No inventar
  estados paralelos.
- **Score**: entero 0–10; ≥ 9 auto-envío (RN-02). Reglas RN-* en
  [`docs/contexto/negocio/09-flujo-validacion-aprobacion-operativa.md`](docs/contexto/negocio/09-flujo-validacion-aprobacion-operativa.md).
- **Identidad**: el acta se identifica por el **código de transmisión** (7
  dígitos entre las X); la hoja es `(idTransmision, tipoEjemplar, pagina)`.
  El QR **no se descifra**: solo es huella (`qrFingerprint`) para dedup.
- **Fronteras de capas** (tabla completa en CONVENIOS §3): `lib/*` puro sin
  DOM/Prisma; componentes cliente sin Prisma ni SDK de servidor; API routes
  sin lógica de UI; modo demo sin llamadas `/api/*`.
- **Demo honesto**: todo componente con datos simulados lleva `DemoBadge`
  (reglas S-11/S-26).
- **Seguridad**: nunca commitear `.env`, `db/*.db`, tokens ni credenciales.
  Si un secreto llega al repo: incidente → reportarlo en el worklog y
  rotar la credencial.
- **BasePath**: en Pages todo asset pasa por `withBasePath` — cero rutas
  absolutas a `/vendor`, `/data`, `/actas`, `/e14` en el código.
- **Sin rastro de tests en el repo**: las verificaciones ad-hoc se corren
  fuera del repo o se limpian (el repo no guarda suites de test).

## 6. Estado actual (2026-10-08)

- **Completado**: desarrollo C-1..C-17 (identificador determinista, escáner,
  diseño Stitch v2, cola offline priorizada, guards de integridad),
  auditoría profunda AN-1..AN-4, PLAN-CONTINUIDAD OLAs 1-7, P-1
  (UBICACION_DISCREPANTE end-to-end).
- **Backlog activo**: ver [`worklog.md`](worklog.md) raíz (variante slim del
  bootstrap, re-seed con offsets por ciudad, `noImplicitAny` por etapas,
  toggle manual en contingencia, guía Windows cuando el despliegue esté
  validado).
- **Ciclo de vida del repo**: `main` = siempre compilable y desplegable;
  la documentación de `docs/` se actualiza en la MISMA tarea que cambia el
  código (especialmente `ARQUITECTURA.md` si cambian rutas/modelos/módulos).

---

* Mantenido por el orquestador. Propuestas de cambio: entrada de worklog con
  prefijo `[COORD]`. El dueño del producto (Jg-Stevan) aprueba lo que llega
  a `main`.*
