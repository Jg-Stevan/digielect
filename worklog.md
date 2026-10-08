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

## Backlog conocido (no bloqueante)

- Variante "slim" del `digitalizador-bootstrap.json` (5.9MB → subset por puesto).
- Re-seed con columnas por ciudad (`utcOffsetMin` / `horaCierreColombia`).
- `noImplicitAny` por etapas.
- Toggle del modo manual en contingencia de la PWA.
- Monitoreo del patrón `sr-only` en tablas con scroll.
- Guía de despliegue Windows (pendiente hasta que el despliegue en Windows
  esté validado; no documentar antes de que funcione).
