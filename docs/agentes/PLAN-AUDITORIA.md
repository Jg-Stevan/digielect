# 🔥 Plan de Trabajo v3 — Auditorías canon + supervisor, consolidado

> **Fuentes de verdad (leer AMBAS antes de trabajar):**
> 1. [`docs/auditoria/REPORTE-DIGIELECT.md`](../auditoria/REPORTE-DIGIELECT.md) — canon v1 (commit `7c8b176`), verificado por el orquestador: spot-checks 4/4.
> 2. [`docs/auditoria/REPORTE-SUPERVISOR-PROFUNDO.md`](../auditoria/REPORTE-SUPERVISOR-PROFUNDO.md) — auditoría supervisor v2 (commit `2f001ed`): confirma 10/11 del canon, añade **S-12…S-41 y B-11…B-28**, con plan propio §5 (4.0→4.10). Adoptada por el orquestador en C-11 tras verificar **7/7 spot-checks contra el código real** (S-01, S-08, S-12, S-17, B-11, B-12, B-13).
>
> **Regla**: usa los IDs de los reportes en commits y worklog: `fix(B-11): ...`.
> Cada ola cierra con `bunx tsc --noEmit` ✅ · `bun run lint` ✅ · `NEXT_STATIC_EXPORT=1 bun run build:static` ✅ · E2E de los criterios de aceptación · entrada en `worklog.md`.
> Nada directo a `main` salvo el orquestador.

---

## ✅ ESTADO DE EJECUCIÓN (tras merge C-11)

| Trabajo | Bugs/IDs | Quién | Estado |
|---|---|---|---|
| Índice compacto único + stopwords + ancla CÓNSUL/EMBAJADOR (batería 59/59) | B-03, B-05, B-06, B-27, B-28 | C (R-1) | ✅ en main |
| Modo dispositivo real + manifest PWA + selector puesto en blanco | D-06, D-07 | C (R-2) | ✅ en main |
| FASE 0 del digitalizador: lente v2, torch honesto, contrato recorte + editor esquinas + respaldo de contornos, chips P1/P2 | D-01…D-04, D-09 | A (A-3) | ✅ merge C-11 (tsc/lint/build OK · E2E editor re-identifica 10/10) |
| Integridad API/seed | B-01, B-02, B-07, B-08, B-09 | B | ⬜ OLA-B1 |
| Datos veraces del monitor | B-11, B-12, B-13, B-23 | B | ⬜ OLA-B2 |
| UI creíble del supervisor | S-12, S-26, S-11, S-27, S-01, S-28, S-39, S-13, S-14 | B | ⬜ OLA-B3 |
| Polling + payload + modales | S-17, S-19, S-20, B-16, S-09, S-22, S-03 | B | ⬜ OLA-B4 |
| Transacciones + rendimiento servidor | B-17, B-19, B-20, B-15, B-18, B-21 | B | ⬜ OLA-B5 |
| Higiene UI + DemoBadge | S-02, S-05(UI), S-07, S-18, S-21, S-23…S-25, S-30…S-41, B-25 | B | ⬜ OLA-B6 |
| FASE 2 PWA real (SW, vendorizar, micro-UX, ranuras) | A-01, D-13…D-15, D-19…D-23 | A | ⬜ rama `feature/a-auditoria-fase2` |
| Galería + sesión + contingencia (FASE 3 + 0.8) | D-05, D-10, D-12, D-16, 3.1…3.3 | C | ⬜ OLA-C2 |
| Endurecimiento (auth, next.config, tokens, VLM) | B-04/B-14, B-22, S-06, A-03, A-04, §5 4.9 | C | ⬜ OLA-C3 (FASE 5) |

---

## 📋 COLAS POR ROL — OLA 2 (auditoría supervisor v2 incorporada)

### Rol B — `feature/b-auditoria-fase1` (una rama desde main, OLAS EN ORDEN, push incremental)

> El reporte supervisor v2 §5 SUSTITUYE la FASE 4 del canon. Orden obligatorio:
> primero datos (B1→B2), luego UI (B3→B4), luego integridad/rendimiento (B5) e higiene (B6).
> Si la sesión es corta: **push mínimo tras OLA-B2** (datos veraces) y anótalo en worklog.
> Convención transversal (reporte v2 §4): toda métrica/acción de teatro usa `<DemoBadge />`
> o sufijo `(DEMO)`/`ESTIMADO` — crea el componente en la primera ola que lo necesites.

| Ola | Contenido | Bugs | Criterio de aceptación |
|---|---|---|---|
| **B1 · Integridad** | `$transaction` + `@unique(qrFingerprint)` + manejo P2002 · adoptar `reemplazoDe` en `/api/actas` · seed con barcode15 válidos (validar con `parseBarcode15`) · límite/validación `imagenBase64` (~8MB) + redirect imagen sin `localhost` + limpiar `GET /api` | B-01, B-02, B-07, B-08/B-26, B-09 | 2 POST concurrentes mismo QR → 1 acta; REEMPLAZO reemplaza y no duplica; seed parsea 14.680 barcodes sin null |
| **B2 · Datos veraces** | util única `horaEnZona(iana)` + tabla país→IANA con DST; corregir monitor/actas/seed · exponer PK real de mesa en `MesaDetail` y ELIMINAR toda re-derivación por slug (incluye backfill de `mesaIdRef` de anomalías; si tocas zona ajena → `[COORD]`) · vigente = ÚLTIMA acta por página (`findLast`) y `todasValidadas` sobre las 4 vigentes · anomalía fabricada: mesa real o "SIN MESA" | B-11, S-29, S-38, B-12, S-15, S-08, B-13, B-23 | Roma 16:00 UTC muestra 18:00 CEST y SaludSistema coincide con monitor · script verificador B-12 → 0 IDs fantasma · mesa con rechazo+reintento válido pasa a COMPLETO |
| **B3 · UI creíble** | NOTIFICAR persiste en `NotificacionSla` (nuevo endpoint) o badge DEMO · CORREO/TELÉFONO ídem · informe imprimible SIN fila inyectada 3670/3670 ni "SELLO CRIPTO (VERIFICADO)" · historial SLA ordenado por hora + badge "RECONSTRUIDO (DEMO)" · fix Todas/Todos · `useMemo`+debounce 250ms · filtros resetean fila expandida · ojo abre la mesa CON problema (≠ COMPLETO) · `requiereReinspeccion` incluye delegados | S-12, S-26, S-11, S-27, S-01, S-28, S-39, S-13, S-14 | 0 toasts de éxito sin backend real detrás; elegir "Todas" no vacía la tabla; búsqueda sin lag medible; ojo → mesa con anomalía |
| **B4 · Polling + modales** | polling 15-30s configurable (el backend ya cachea 8s) · bootstrap por secciones o `?since=`/ETag (payload inicial <300KB) · `lastSyncAt` en state dentro de `refetch()` · ONLINE derivado del último bootstrap · primitive `<Modal>` única (focus trap, scroll lock, restore focus, pila de Escape) y migrar los 5 modales hand-rolled | S-17, B-16, S-19, S-20, S-09, S-22, S-03 | ingesta desde otra pestaña/dispositivo visible ≤30s sin F5; Escape cierra SOLO el modal superior; la justificación no se pierde al fallar |
| **B5 · Transacciones + rendimiento** | upsert transaccional en ingesta (complementa B1) · resolver exige `estado==="ABIERTA"` + transición validada + `$transaction` · BATCH "integrar" idempotente (upsert, código secuencial a prueba de carrera) · `select` ligero en monitor/informes (sin imágenes base64) + agregación `groupBy` para escrutinio · caché del monitor con promesa compartida/dedupe · si alcanza: motor SLA server-side real (RN-06); si no: `slaMinutesRemaining` ya no hardcodeado 40 sin marca | B-17, B-19, B-20, B-15, B-18, B-21 | doble clic integrar → 1 acta; anomalía cerrada → 409; rebuild <500ms con 15k actas; 20 GET concurrentes → 1 rebuild |
| **B6 · Higiene** | 0 `alert()` → toasts (shadcn `<Toaster />` ya montado) · REINICIAR DEMO con confirmación · FileReader/timeout "Guardando…" con catch/cleanup · pool de Workers `cancelarLote()` en unmount · barra segmentada `integrables = reconocidos + nuevo_registro` · confianza OCR faltante → "—" (no 99%) · picker avisa si 0 resultados · chat horas relativas a apertura · "Configuración SLA aplicada" redactado (demo) · `key={name-idx}` · `pool×` roto · COT derivado de constante · botón usuario: menú real con logout · identidad real en UI (backend sigue en OLA-C3) · tipografía ≥10px y tablas ≥900px revisadas · teatralidad restante con `<DemoBadge />` | S-03, S-18, S-02, S-05(UI), S-07, S-21, S-23, S-24, S-25, S-30…S-41, B-25 | grep: 0 `alert(`; 0 setState tras desmonte; lint sin avisos; DEMO_CREDENCIALES solo en modo demo |

**Coexistencia de archivos (recordatorio del mapa del plan v2):** `DigitalizadorApp.tsx` — A dueño de cámara/onCaptura/procesarYAnalizar; C dueño de bootstrap/puesto/navegación/galería/contingencia. `identificacion-acta.ts` — SOLO C con batería completa. `QuadNormalizado` vive en `src/lib/types.ts` (nota [COORD] de A-3).

### Rol A — `feature/a-auditoria-fase2` (desde main actual, ya con A-3 fusionado)

| # | Tarea | Bugs |
|---|---|---|
| 2.1 | SW mínimo con cache de assets + vendorizar (manifest ya existe del D-06 de C; NO duplicar) | A-01, D-06 restante |
| 2.2 | Micro-UX pack completo (§4.2 del canon) | D-19, D-20, D-21 |
| 2.3 | Token anti-carrera de captura; reloj aislado/memo | D-14, D-22 |
| 2.4 | Rotación desde el ORIGINAL; recaptura sin quemar reintento cuando no hubo envío | D-13 |
| 2.5 | Vendorizar Tesseract/heic2any + cache SW | D-23 |
| 2.6 | Editor de ranuras (ver/descartar hojas del lote) | D-15 |

### Rol C (orquestador) — en main directo (fixes chicos) o rama propia

| Ola | Contenido | IDs |
|---|---|---|
| **OLA-C2** | GALERÍA completa (store `actas-sesion`, filtros, visor, reenvío, eliminación + persistencia de stats/historial) · PantallaExito con imagen · reintentar bootstrap + estados online reales · resumen real del turno · contingencia: selector tipo/página + encolado offline de manual | D-05, D-16, D-10, D-12, FASE 3 (3.1–3.3) |
| **OLA-C3 (FASE 5)** | auth server-side: middleware cookie httpOnly firmada + `crypto.timingSafeEqual` + rate-limit + usuario real en auditoría · límite payload/content-type + rate-limit en `/api/actas/analizar` (VLM) · `ignoreBuildErrors:false` + `reactStrictMode:true` + fix TS vivo · tailwind.config muerto fuera + tokens en rem · test del worker de detección con fixtures (lejos/cerca/rotada) · documento de privacidad VLM / modo local-only | B-04/B-14, B-22, S-05(backend), S-06, A-03, A-04, 5.4, 5.5 |

---

## 🧭 Protocolo (sin cambios)
Rama propia desde main → verificación completa (tsc/lint/build:static + E2E) → push de rama → el orquestador revisa, fusiona y redespliega Pages. Usa los IDs de los reportes en commits y worklog. Nada directo a main salvo el orquestador.
