---
Task ID: 2026-10-08-organizacion-repo
Agente: Z.ai Code (orquestador de organización)
Tarea: Organizar y limpiar el repo para que las IAs que lo trabajen entiendan el contexto (plan acordado con el dueño).

Work Log:
- Plan aprobado por el dueño: SIN diseños visuales históricos, SIN guía Windows (hasta validar el despliegue), push directo a main.
- Fase 1 — Punto de entrada: creado AGENTS.md (raíz) y CLAUDE.md (puntero); restaurado docs/agentes/ desde b4da5e6 con banners de referencia histórica en TAREA-A/B/C y PLAN-AUDITORIA; README y CONVENIOS actualizados (estado post-auditoría, public/actas/, nuevos módulos de sesión/seguridad).
- Fase 2 — Contexto de negocio: 17 documentos restaurados desde b4da5e6 y reorganizados en docs/contexto/{negocio(9),pwa(3),supervisor(5)} con numeración e índice (docs/contexto/README.md) y regla de precedencia (código > docs de diseño).
- Fase 3 — Worklog: historial C-1..C-17 preservado en docs/worklog/historial-c1-c17.md (desde b4da5e6); el log de la auditoría archivado como docs/worklog/2026-10-08-auditoria-continuidad.md; creada PLANTILLA-ENTRADA.md; worklog.md de raíz reescrito como índice+protocolo delgado.
- Fase 4 — Arquitectura: generado docs/arquitectura/ARQUITECTURA.md desde el código real (mapa src/, 15 rutas API con métodos, 10 modelos Prisma, modos demo/completo, SW y CI) + docs/README.md índice general.
- Fase 5 — Higiene: README.md raíz actualizado con mapa de documentación y sección para agentes; scripts/instalar-windows.ps1 eliminado (decisión del dueño — no hay guía Windows hasta validar el despliegue); workflow deploy-pages.yml con filtros paths para no re-desplegar Pages en cambios solo-de-docs. .gitignore ya estaba completo (sin cambios).

Stage Summary:
- El repo tiene ahora un punto de entrada único para IAs (AGENTS.md) con ruta de lectura ordenada y protocolo de sesión obligatorio.
- Todo el contexto de negocio y la historia del proyecto viven versionados en docs/ (nada relevante queda solo en el historial de git).
- worklog.md de raíz: de 220KB/1045 líneas monolíticas a ~40 líneas de protocolo+índice; la memoria queda en docs/worklog/.
- Sin cambios de código funcional: src/, prisma/, public/ intactos.
- Pendiente para próximas sesiones: ejecutar el backlog (ver worklog.md raíz); primera tarea recomendada por la auditoría: ver TOP 5 BUGS en docs/auditoria/.

Verificación: cambios exclusivamente documentales (.md, .yml, .ps1 borrado) — tsc/lint no afectados; CI de Pages validará gates en el push.
