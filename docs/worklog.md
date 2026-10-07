
---

## C-17 — PLAN_DIGIELECT_DIGITALIZADOR.md: flujo operativo determinista + cola priorizada (orquestador rol C)

**Fuente:** MD subido por el usuario (instrucciones "analizalo y remplaza") — 5 TAREAS.

**Nuevos archivos:**
- `src/lib/scanner/actaParser.ts` (T1): `extractTransmissionCode` (regex del plan) + variante tolerante (X en minúscula, confusables 7→T/O/I/L SOLO dentro de la zona X y validando 7 dígitos exactos) + `extraerBarcode15DeTexto` (15 dígitos del OCR → tipo/página) + `leerQrFingerprint` (jsQR, huella 32B) + `validarCrucePagina` (T4.3: anclas NIVELACIÓN=P1 vs totales=P2) + `calculateQualityScore` (T3.1, FÓRMULA EXACTA del plan).
- `src/services/puestoStorage.ts` (T2): IndexedDB `digielect` v1 — tiendas `puestos_maestro` (llave idTransmissionCode), `actas_cola`, `configuracion_operario` (puesto activo persistente). `descargarDatasetPuesto` (API `/api/digitalizador/dataset` o demo bootstrap+índice con basePath) + `buscarPorCodigoTransmision` O(1).
- `src/services/uploadQueue.ts` (T3+T4): cola priorizada (PENDIENTE primero, qualityScore DESC), worker de fondo (`navigator.onLine` + backoff exponencial 1s→60s, no bloquea la cámara), dedup local por huella QR (T4.1: "esta acta física ya fue registrada"), migración automática de la cola legacy localStorage `digielect-cola-v2`, respuesta de servidor honrada (duplicado/rechazo/retriable).
- `src/lib/digitalizador/feedback.ts` (T5.2): beep WebAudio (sin assets) + vibración — éxito/aviso/error.
- `src/components/digitalizador/PantallaInicio.tsx` (T5.1): jornada sin puesto — OPCIÓN A (escanear primera acta → auto-asignación) + OPCIÓN B (selector con búsqueda, 949 puestos demo).
- `src/components/digitalizador/PanelColaFlotante.tsx` (T5.3): panel minimizable — verde "Sincronizadas: N", ámbar "En cola (por nitidez): N", estado de conexión, FORZAR SINCRONIZACIÓN; auto-expande con pendientes.
- `src/app/api/digitalizador/dataset/route.ts`: GET ?puesto=m-z-p → filas del índice (3.670 códigos) filtradas por puesto.

**Modificados:**
- `store.ts`: señales deterministas en segundo plano (`extraerSenalesLocales`, guard anti-rerun) sobre la captura PROCESADA — QR (jsQR) + OCR (Tesseract vendoreado) + código X → identificarActa AUDITADO (EXACTA + rescate HAMMING-1 + cruce encabezado DIVIPOL) → ubicación O(1). OPCIÓN A: la primera acta identificada auto-asigna el puesto (persistido). `enviarActa`: qrTexto REAL (activa B-01 en servidor), guard anti-cruce (T4.3), qualityScore 0-100 al payload, cola offline → IndexedDB; 404/405 (Pages sin backend) van a cola; dedup QR no navega (toast claro). `sincronizarCola` → worker único.
- `PantallaRevision.tsx`: `identificado` incluye señales deterministas (sin VLM el demo sigue el flujo); sello "X 7231019 · DIVIPOL 88·335·05·02 · QR✓"; barcode15 del OCR manda sobre el VLM.
- `PantallaContingencia.tsx`: prellenado determinista (puesto + mesa desde el código X; barcode/tipo/página desde OCR) — la captura llega lista para confirmar.
- `PantallaCaptura.tsx`: franja del puesto asignado + barra de cobertura "14/25 · 56%" (T5.2).
- `PantallaExito.tsx`: estado EN_COLA ámbar ("GUARDADA EN COLA OFFLINE").
- `DigitalizadorApp.tsx`: arranque de servicios (migración + config + worker), PantallaInicio si no hay puesto, PanelColaFlotante global (no en éxito), splash de arranque, QA hooks `window.__digielectSenales/__digielectCola`.
- `api/actas/route.ts` [COORD T4.2]: resolución de concurrencia por ranura — misma (mesa,tipo,página): existente VALIDADO→rechazo sin mutación; nueva ≥ existente+10 → reemplazo legítimo (archivo la previa como B-02); si no → `REEMPLAZO_RECHAZADO_MENOR_CALIDAD`.
- `lib/types.ts`: `ActaUploadPayload.qualityScore?`. `sw.js` → v1.4.0.

**Verificación:** tsc 0 · lint 0 · build:static OK · E2E agent-browser (móvil+escritorio): PantallaInicio → OPCIÓN B selector (Egipto→El Cairo) → captura con franja+cobertura → acta real 335-005-02 P1 → **X 7-23-10-19 X → 7231019** (checklist del plan EXACTO) → sello + CONFIRMAR ASIGNACIÓN sin VLM → contingencia 100% prellenada → envío sin backend → **cola IndexedDB qualityScore 100/100** → dedup QR segunda captura (no re-encola) → panel cola verde/ámbar + forzar sync → HAMMING-1 verificado (7231013→7231019) → dataset 335-05-02 via API (smoke test dev). 0 errores de consola.
