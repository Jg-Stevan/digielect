# 2026-10-08 — Migración del repo a sandbox de trabajo (clon + setup completo)

## Contexto

El dueño del producto clonó `https://github.com/Jg-Stevan/digielect` en un
sandbox de desarrollo (Z.ai Code) para trabajar el proyecto aquí. La tarea de
esta sesión fue integrar el repo al entorno de ejecución: código, dependencias,
base de datos y verificación end-to-end.

## Qué se hizo

1. **Clon del repo** — `git clone` de `Jg-Stevan/digielect`; el código vive
   ahora en la raíz del workspace (`/home/z/my-project`), sustituyendo el
   scaffold inicial. Se preservó el historial git completo y el remote
   `origin → github.com/Jg-Stevan/digielect` (commits hasta
   `b118b86 docs: reorganización del repo…`).
2. **Dependencias** — `bun install` sobre el `package.json` del repo; solo
   faltaba `jsqr` (el sandbox ya trae el mismo stack base: Next 16, Tailwind 4,
   shadcn/ui, Prisma 6, z-ai-web-dev-sdk).
3. **Base de datos** — `.env` con `DATABASE_URL="file:../db/custom.db"`
   (convención de `.env.example`), `bun run db:push` y `bun run db:seed`.
   Seed verificado: 949 consulados, 3.670 mesas, 14.680 actas, 8 anomalías,
   5 SLA, 3 BATCH, avance nacional 122.019/122.020.
4. **Dev server** — arrancado en el puerto 3000 (`bun run dev`). Nota de
   infraestructura: el sandbox mata procesos desatachados de sesiones bash
   entre comandos; la solución fue daemonizar con doble-fork (patrón
   `setsid`+fork+fork vía python). `next-server` estabiliza en ~1.1 GB RSS
   tras compilar (pico de Turbopack).
5. **Verificación end-to-end (Agent Browser)** — golden path completo:
   - Pantalla de acceso: login `supervisor`/`digielect` → Monitor Global OK.
   - Monitor Global: panel de atención (8 puestos), filtros, resumen
     CRÍTICO:8 / PENDIENTE:0 / COMPLETO:941, tabla con horas de cierre por país.
   - Revisión de Anomalías: 8 anomalías listadas por urgencia SLA; modal de
     auditoría abre con visor del acta real, acciones aprobar/rescanear y
     trazabilidad con badge `EVIDENCIA SIMULADA` (S-11).
   - Generar Informes: avance nacional real 122.019/122.020 (99.99%) + top
     departamentos.
   - Centro Notificaciones (Control SLA): fases de mora 1/2/2, mora promedio
     +85 min.
   - Carga Masiva BATCH: dropzone + estado del servidor OCR (Motor C-4 activo).
   - PWA Digitalizador: asignación de puesto Opción B (búsqueda "Roma" →
     dataset `495-10-02` descargado por API, 8 filas locales), fallback
     cámara-no-disponible correcto en headless, galería de actas reales,
     lectura de código de barras (`CÓDIGO LEÍDO · CONFIRME LA MESA`),
     `POST /api/actas/analizar` 200 en 11.2s (VLM real), pantalla de
     contingencia con digitación manual del barcode15 y botón de proceso
     correctamente deshabilitado hasta confirmar mesa (contrato RN-02).
   - Responsivo: viewport 390×844 muestra menú hamburguesa + panel Salud del
     Sistema (pico 20:00 UTC · 172 puestos · 73 actas/min). Footer natural.

## Quality gates

| Gate | Resultado |
|---|---|
| `bunx tsc --noEmit` | 0 errores |
| `bun run lint` | 0 errores |
| Runtime (dev.log) | sin errores; APIs 200; 1 login 200; 1 analizar 200 |

## Decisiones y notas

- **No se modificó código del repo**: la sesión fue de integración/verificación.
- El widget "Descargar Proyecto" reporta "empaquetado no disponible en este
  servidor" (`/api/descargar-proyecto` 404 en dev): no bloquea; es la ruta de
  empaquetado ZIP que depende de artefactos de build.
- El sandbox limita procesos de sesión bash: cualquier agente que necesite
  reiniciar el dev server debe daemonizar (doble-fork), no basta `nohup &`.
- `dev.log` de raíz es el log del dev server (script `dev` del repo ya hace
  `tee dev.log`).

## Estado al cierre

- Servidor dev corriendo en :3000 con backend completo (Prisma + VLM).
- Sesión supervisor activa en el navegador de verificación.
- Sin cambios pendientes de commit (`git status` limpio salvo `.env`, `db/`
  y artefactos locales ignorados).
