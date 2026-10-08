# Worklog — Digielect

> **Protocolo** (obligatorio para humanos e IAs — detalle en
> [`docs/worklog/PLANTILLA-ENTRADA.md`](docs/worklog/PLANTILLA-ENTRADA.md)):
>
> 1. Al INICIAR una sesión: lee la última entrada de `docs/worklog/` y el
>    estado en [`AGENTS.md`](AGENTS.md) + [`docs/arquitectura/ARQUITECTURA.md`](docs/arquitectura/ARQUITECTURA.md).
> 2. Al TERMINAR: crea `docs/worklog/YYYY-MM-DD-<tema>.md` con la plantilla y
>    **añade una línea a la tabla de abajo** (append, nunca overwrite).

## Índice de sesiones

| Fecha | Archivo | Resumen |
|---|---|---|
| oct 2026 (C-1..C-17) | [`docs/worklog/historial-c1-c17.md`](docs/worklog/historial-c1-c17.md) | Desarrollo completo del proyecto: identificador determinista, escáner, Stitch v2, cola offline, guards |
| 2026-10-07/08 | [`docs/worklog/2026-10-08-auditoria-continuidad.md`](docs/worklog/2026-10-08-auditoria-continuidad.md) | Auditoría profunda AN-1..AN-4 + PLAN-CONTINUIDAD (OLAs 1-7) + P-1 + empaquetado PKG-FINAL |
| 2026-10-08 | [`docs/worklog/2026-10-08-organizacion-repo.md`](docs/worklog/2026-10-08-organizacion-repo.md) | Reorganización del repo para trabajo con IAs: AGENTS.md, docs/, recuperación de contexto |
| 2026-10-08 | [`docs/worklog/2026-10-08-migracion-sandbox.md`](docs/worklog/2026-10-08-migracion-sandbox.md) | Clon del repo en sandbox Z.ai: setup BD real, dev server daemonizado, verificación E2E de los 2 módulos (tsc 0 · lint 0) |
| 2026-10-08 | [`docs/worklog/2026-10-08-revision-exito-rn02-slim-bootstrap.md`](docs/worklog/2026-10-08-revision-exito-rn02-slim-bootstrap.md) | Digitalizador: diseño mockup en revisión/éxito (documento re-dibujado con datos), auto-envío RN-02 sin contingencia con código leído, tab ACTAS vacío + dataset por puesto (slim bootstrap) |
| 2026-10-08 | [`docs/worklog/2026-10-08-reconocimiento-duplicados-pantalla-completa.md`](docs/worklog/2026-10-08-reconocimiento-duplicados-pantalla-completa.md) | Digitalizador: overlay "RECONOCIENDO ACTA" (OCR + búsqueda info, 4 fases), duplicado "ya estaba" = éxito "ENVIADO CORRECTAMENTE · YA REGISTRADA ✓" (online + cola), acople de datos al diseño de éxito + visor del acta digitalizada a pantalla completa |
| 2026-10-08 | [`docs/worklog/2026-10-08-acta-escaneada-en-diseno.md`](docs/worklog/2026-10-08-acta-escaneada-en-diseno.md) | Digitalizador: el diseño de éxito muestra LA IMAGEN REAL del acta escaneada dentro del documento + datos DETERMINISTAS del proyecto primero (consulado de la base: ROMA/ZONA 10) con VLM de respaldo (corrige lecturas erróneas "EGIPTO") + votos informativos + etiquetas de candidatos en límite de palabra |
| 2026-10-08 | [`docs/worklog/2026-10-08-verificacion-publicacion.md`](docs/worklog/2026-10-08-verificacion-publicacion.md) | Verificación E2E final de la Tarea 2 (5 requisitos), gate 3 build:static, limpieza del historial local (sin .env/db/.next/logs en el repo) y publicación de main a origin |

## Backlog conocido (no bloqueante)

- ~~Variante "slim" del `digitalizador-bootstrap.json` (5.9MB → subset por puesto)~~ → **hecha 2026-10-08** (lista ligera `?lista=1` + dataset por puesto `?puesto=`; fallback demo aún filtra el JSON completo).
- Re-seed con columnas por ciudad (`utcOffsetMin` / `horaCierreColombia`).
- `noImplicitAny` por etapas.
- Toggle del modo manual en contingencia de la PWA.
- Monitoreo del patrón `sr-only` en tablas con scroll.
- Guía de despliegue Windows (pendiente hasta que el despliegue en Windows
  esté validado; no documentar antes de que funcione).
