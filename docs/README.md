# 📚 Documentación — Digielect

> Índice completo. **Si eres una IA o una persona nueva, empieza en
> [`AGENTS.md`](../AGENTS.md)** (raíz del repo) y sigue su ruta de lectura.

| Carpeta / archivo | Contenido |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | ⭐ Punto de entrada: qué es el proyecto, comandos, protocolo de sesión |
| [`agentes/`](agentes/) | Coordinación del equipo de desarrollo: `CONVENIOS.md` (ley del dominio), panel de roles, tareas históricas |
| [`arquitectura/ARQUITECTURA.md`](arquitectura/ARQUITECTURA.md) | Cómo está montado el sistema (generado del código real) |
| [`contexto/`](contexto/README.md) | Dominio electoral y diseño inicial: `negocio/` (9 docs), `pwa/` (3), `supervisor/` (5) |
| [`auditoria/`](auditoria/) | Auditoría profunda 2026-10: `ANALISIS-PROFUNDO.md` (58 hallazgos), `PLAN-CONTINUIDAD.md` (OLAs 1-7), reportes y worklog de la sesión |
| [`worklog/`](worklog/) | Memoria del proyecto: historial C-1..C-17, sesiones por fecha, `PLANTILLA-ENTRADA.md` |
| [`../worklog.md`](../worklog.md) | Protocolo + índice de sesiones + backlog (raíz) |

## Convenciones de documentación

- Documentación **dentro de la misma tarea** que el código que cambia.
- `arquitectura/ARQUITECTURA.md` se actualiza si cambian rutas API, modelos
  Prisma o módulos.
- Los worklogs **nunca se sobrescriben**; cada sesión crea su archivo.
- Los documentos de `contexto/` son de diseño inicial: ante contradicción,
  manda el código y `ARQUITECTURA.md`.
