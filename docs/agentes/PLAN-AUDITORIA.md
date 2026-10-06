# 🔥 Plan de Trabajo v2 — Basado en la Auditoría Profunda

> **Fuente de verdad**: [`docs/auditoria/REPORTE-DIGIELECT.md`](../auditoria/REPORTE-DIGIELECT.md)
> (canon, auditado el commit `7c8b176`, verificado por el orquestador: spot-checks D-04, B-03, S-01, D-01 = 4/4 confirmados).
> **Regla**: usa los IDs del reporte (`D-xx`, `S-xx`, `B-xx`, `A-xx`) en commits y worklog: `fix(D-03): ...`.
> Cada fase cierra con `bunx tsc --noEmit` ✅ · `bun run lint` ✅ · `NEXT_STATIC_EXPORT=1 bun run build:static` ✅ · E2E de los criterios de aceptación del reporte.

## 🔄 REDISTRIBUCIÓN respetando la exclusividad de módulos (CONVENIOS §3)

El reporte asignaba FASE 1 completa al rol B. Se ajusta por propiedad de módulo:

| Ítem original | Ahora | Razón |
|---|---|---|
| B-03 (doble escritura export) | **C (orquestador)** | `scripts/export-static-data.ts` es módulo C-6 |
| B-05 (stopwords CONSULADO) | **C (orquestador)** | `verificar-acta.ts` es módulo C |
| B-06 (ancla CONSUL) | **C (orquestador)** | `identificacion-acta.ts` es módulo C — tocado SOLO por C, con batería 42 checks re-ejecutada |
| B-01, B-02, B-04, B-07, B-08, B-09 | B | Backend/API/seed es territorio B |
| Resto sin cambios | según reporte | FASE 0/2 → A · FASE 4 → B · FASE 3 galería + FASE 5 → C |

## 📋 COLAS POR ROL

### Rol A — `feature/a-auditoria-fase0` (desde main)
- **0.1** Sondas secuenciales de lente + selector de cámara + botón SwitchCamera (D-01)
- **0.2** Torch: capabilities, feedback, reset en iniciar() (D-02)
- **0.3** Contrato recorte (`recorteAplicado/fullFrame/quad` en `CapturaProcesada`) + banda ámbar de fallo + **editor de esquinas 4 handles** + respaldo de contornos en el worker + botón RECORTAR real (D-03, D-04) — el más gordo (1-2 días)
- **0.6** Chips P1/P2 llaman `onSelectMesa(mesa.id)` + firmar `onCapturar(mesaId, tipo)` (D-09)

### Rol B — `feature/b-auditoria-fase1` (desde main)
- **1.1** `$transaction` + `@unique(qrFingerprint)` + manejo P2002 (B-01)
- **1.2** Adoptar `reemplazoDe` en `/api/actas` (B-02)
- **1.4** Seed con barcode15 válidos validados con `parseBarcode15` (B-07)
- **1.5** Límite/validación de `imagenBase64` + redirect imagen sin localhost + limpiar `GET /api` (B-08, B-09)
- **FASE 4**: S-01 filtros · S-02 logout real · S-03 modal/toasts · S-04 menú móvil · S-05 identidad real · S-07 tipografía · S-09 focus trap · S-11 etiquetar teatralidad

### Rol C (orquestador) — en main directo (fixes chicos) o rama propia
- **OLA 1 (hoy)**: B-03 + B-05 + B-06 (con batería 42 checks) · 0.4 selector de puesto en blanco (D-07) · 0.5 modo dispositivo real + manifest + fullscreen (D-06)
- **OLA 2**: 0.7 GALERÍA v1 + persistencia de sesión (D-05, D-16) · 0.8 contingencia tipo/página + encolado offline de manual (D-10, D-12) · 0.6 si A no llega
- **OLA 3**: FASE 5 (S-06 next.config, A-03 tailwind.config muerto, A-04 rem, B-04 auth, privacidad VLM)

## ⚠️ Mapa de coexistencia en archivos compartidos (evitar pisarse)
- `DigitalizadorApp.tsx`: **A** es dueño de `onCaptura`/`procesarYAnalizar`/hooks de cámara · **C** es dueño de `cargarBootstrap`/puesto/navegación/galería/contingencia. Si necesitas tocar la zona del otro: propón en worklog con `[COORD]`.
- `PantallaRevision.tsx`: **A** (banda de recorte, editor) · **C** (PanelIdentificacion).
- Nadie toca `identificacion-acta.ts` salvo C (B-06) con batería completa.

## 🧭 Protocolo sin cambios
Rama propia desde main → verificación completa → push de rama → el orquestador revisa, fusiona y redespliega Pages. Nada directo a main salvo el orquestador.
