# 🗺️ PLAN DE CONTINUIDAD — Digielect (ejecución por olas)

> **PROPÓSITO**: Este documento permite continuar el trabajo de mejora de digielect de forma ordenada aunque se agote la ventana de contexto de la sesión. Cada ola es autocontenida: se puede ejecutar, verificar y commitear de forma independiente.
>
> **CÓMO USARLO**:
> 1. Leer este archivo + `ANALISIS-PROFUNDO.md` (mismo directorio) + la última entrada del worklog de sesión.
> 2. Buscar la primera tarea sin checkbox `[x]` en la ola más baja pendiente.
> 3. Ejecutar → verificar (criterio incluido en cada tarea) → marcar `[x]` → commit → anotar en el worklog.
> 4. Si una tarea depende de otra, respeta el orden dentro de la ola.
>
> **ENTORNO DE PRUEBAS** (recrear si se perdió):
> ```bash
> cd /home/z/digielect-analysis
> bun install
> cp .env.example .env && mkdir -p db
> bun run db:push && bun run db:seed
> bunx next dev -p 3100   # NO usar bun run dev (pinnea 3000 y choca con el proyecto principal)
> # navegador: http://localhost:3100 — E2E con agent-browser
> # login: supervisor / digielect
> ```
>
> **CONVENCIONES DEL REPO** (respetar):
> - Route handlers SIEMPRE `.ts` (nunca `.tsx` — el truco pageExtensions del export estático lo exige).
> - Rutas de assets estáticos en cliente: SIEMPRE vía `withBasePath()` (basePath `/digielect` de Pages).
> - Los contratos server↔PWA se traducen en `payloadADigielect` (store.ts) — NO duplicar lógica.
> - Verificación mínima por cambio: `bunx tsc --noEmit` + `bun run lint` + E2E con agent-browser.
> - Commits descriptivos estilo historia del repo (qué + por qué + verificación).

---

## OLA 1 — Desbloquear el flujo principal del digitalizador 🔴
> **Objetivo**: que un acta P1 real pueda escanearse y subirse de punta a punta. Hoy es imposible (V-1 + AN-3 C-1/C-2).
> **Rama sugerida**: `fix/ola1-flujo-principal`

- [x] **1.1 Corregir anclas de cruce de página** (`src/lib/scanner/actaParser.ts:210-252`)
  - `ANCLAS_PAGINA_1` = `NIVELACIÓN DE LA MESA`, `CIUDADANOS HÁBILES` (correctas, mantener).
  - `ANCLAS_PAGINA_2` = reemplazar TODAS por las reales: `CONSTANCIAS DE LOS JURADOS`, `HUBO RECUENTO`, `SOLICITADO POR`, `FIRMA JURADO`. **Quitar `VOTOS EN BLANCO`** (es ancla P1 — evidencia VLM + docs TAREA-C-IDENTIFICADOR.md:59 + OCR real). Evaluar quitar también `TOTAL DE VOTOS`/`RESULTADOS DE LA VOTACIÓN` (aparecen en variantes de P1 con "SUMA TOTAL").
  - **Añadir tolerancia a ruido OCR**: normalizar el texto antes de matchear (lowercase, sin acentos, sin espacios múltiple, quizá colapsar todos los espacios) y tolerar 1-2 caracteres de distancia (el OCR lee "NIVEL ACION DE LA MESA"). Alternativa simple: `texto.replace(/[\sÁÉÍÓÚáéíóú]/g,'')` en ambos lados y regex sin separadores.
  - **VERIFICACIÓN**: E2E — login → digitalizador → Opción A → "PROBAR CON ACTA REAL" → acta 495-010-02 P1 → asignar mesa → CONFIRMAR → debe llegar a pantalla de ÉXITO (hoy se atasca en contingencia con toast "CRUCE DE PÁGINA"). Repetir con P2 (debe pasar igual). Repetir con un acta 335-005-02 P1.
- [x] **1.2 Aplicar la clase scope `pwa-e14`** (`src/components/digitalizador/DigitalizadorApp.tsx:134` — el div raíz)
  - Añadir `pwa-e14` a la className del wrapper del digitalizador (y/o al contenedor PhoneFrame).
  - Definir en `globals.css` (dentro del scope) las clases faltantes `.frame-warning` y `.frame-error` (referenciadas por `BANDA_ESTILO.frame` en `reglas.ts:247-255` y nunca definidas).
  - **VERIFICACIÓN**: visualmente el visor de captura debe mostrar los 4 marcos de escáner (esquinas brand), tipografía mono en chips, y en DevTools el `pt-safe` debe aplicar padding-top en viewport con notch (emular iPhone). `grep -c "pwa-e14" src/components/**` ≥ 1.
- [x] **1.3 Auto-envío sin VLM (respaldo determinista)** (`PantallaRevision.tsx:326-368`)
  - El efecto de auto-envío exige `!analisis` → cambiar a: disparar si `parseado.ok || senalesLocales.identificada` aunque `analisis` sea null (VLM caído/offline).
  - Si no hay señal determinista NI análisis: ir a contingencia CON la imagen preservada (no `nuevaCaptura()`).
  - Eliminar el texto falso "El acta se envió automáticamente al servidor" (línea ~931) cuando no hubo envío — mostrar estado real ("EN COLA — se enviará al reconectar" / "SIN ENVIAR").
  - **VERIFICACIÓN**: bloquear red (agent-browser `set offline on` o abortar /api/actas/analizar) → capturar acta real → debe encolar offline y mostrar estado honesto, nunca perder la captura.
- [x] **1.4 Recuperación de items SUBIENDO + 404/405 en la cola** (`src/services/uploadQueue.ts`)
  - Al arrancar (`iniciarWorkerSincronizacion`) y en `visibilitychange`: re-encolar todos los `SUBIENDO` → `PENDIENTE` (línea ~254 / RANGO_PENDIENTES:129).
  - En `puentePorDefecto` (~línea 207): replicar la excepción `sinBackend` del envío directo (404/405 → mantener PENDIENTE, no ANOMALIA) — en GitHub Pages la cola entera se pierde hoy.
  - **VERIFICACIÓN**: con la app corriendo, encolar un acta, matar el servidor de red mid-upload (throttle offline), recargar → el item debe reaparecer como PENDIENTE en el panel de cola y reintentar al volver la red.
- [x] **1.5 `encolarActa` a prueba de quota** (`store.ts:786-810`)
  - Envolver `encolarActa` en try/catch dentro del catch de red; `set({enviando:false})` en `finally`; toast claro si IndexedDB está llena.
  - Llamar `limpiarSincronizadasViejas()` (existe, 0 callers) al arrancar el worker y tras cada sync exitoso.
  - **VERIFICACIÓN**: stub de `putActaCola` que lanza QuotaExceededError → el botón debe volver de "ENVIANDO…" y mostrar toast de dispositivo lleno.

**Cierre de OLA 1**: `bunx tsc --noEmit` = 0 · `bun run lint` OK · E2E completo captura→envío con acta real P1 y P2 · commit `fix(ola1): …` · marcar checkboxes · anotar en worklog.

---

## OLA 2 — Rendimiento y escala (payloads) 🟠
> **Objetivo**: bajar el arranque de 6MB a <200KB y eliminar los `include` que arrastran imágenes.
> **Rama sugerida**: `perf/ola2-proyecciones`

- [x] **2.1 `monitor.ts getConsulateRows`** (~150-159): añadir `select` a las actas incluidas: solo `{ id, tipoEjemplar, pagina, estado, createdAt }` (el tipo `ActaMesa` ya define esos 5 campos — la query nunca se ajustó). Si se usan más campos en las vistas, extender el select, nunca `include` completo.
- [x] **2.2 `api/informes/route.ts`** (~28-35): select liviano + `take` para actasRecientes (el `slice(0,12)` pasa a la query) + escrutinio con `groupBy`/aggregate SQL sobre `ResultadoVoto` (join actas VALIDADO) en lugar de sumar en JS.
- [x] **2.3 `api/digitalizador/bootstrap/route.ts`** (~35-48): `select` explícito en las actas (SIN `imagenBase64`; `analisisJson` solo si `problemas[]` lo necesita — considerar extraer problemas a la hora de ingesta a una columna liviana). Objetivo medible: **payload < 300 KB** con las 14.680 actas del seed.
- [x] **2.4 Índices SQLite faltantes** (`prisma/schema.prisma`): `@@index([barcode15])` en Acta, `@@index([createdAt])` en Acta, `@@index([actaId])` en ResultadoVoto, `@@index([mesaIdRef])` en Anomalia, `@@index([consuladoId, estado])` en NotificacionSla. → `bun run db:push`.
- [x] **2.5 `getSlaRows/getAnomalias/getQueueFiles` con límite** (`monitor.ts`) y sin `include` completo de consulado (select de 3-4 campos).
- [x] **2.6 VLM robusto** (`analisis-acta.ts:179-210`): singleton de ZAI (memoizar), `AbortSignal.timeout(45_000)`, 1 retry, guard `typeof content === "string"`, y NO persistir imagen en rechazos por fallo del motor (hoy un 500 del VLM persiste un RECHAZADO con la imagen completa).

**VERIFICACIÓN OLA 2**: `curl -s -o /dev/null -w "%{size_download}" http://localhost:3100/api/digitalizador/bootstrap` < 300000 · `/api/bootstrap` < 400 KB · informes con datos: p95 razonable (<500ms local) · tsc 0.

> **[OLA2 — ejecutada 2026-10-08, ver worklog §OLA2]** Metas cumplidas en :3000 (digitalizador 263.805 B · bootstrap 63.556 B · p95 < 500 ms · tsc 0). **Hallazgo clave**: el 6 MB del arranque NO era `imagenBase64` en el JSON (el DTO nunca la incluyó) sino los 14.681 DTO de acta (~385 B c/u) + estructura; el `include` con imagenBase64 sí era el problema de BD (crece ~0,5 MB por upload en cada lectura). Solución: selects + dedup por ranura (≤4 actas/mesa) + `Content-Encoding: gzip` en los 2 bootstrap (`respuestaJsonGzip` en monitor.ts; curl normal sin `--compressed` ve bytes gzip). El escrutinio agregó `estado: VALIDADO` (los 2 ResultadoVoto existentes están en actas VALIDADO → números idénticos). 2.6 además distingue 4xx de la API (imagen ilegible → analisisVacio 200, sin retry) del fallo de motor (timeout/red/5xx → retry ×1 → `MotorVisionError` → 5xx → la PWA reintenta sin persistir RECHAZADO).

---

## OLA 3 — Honestidad de la UI del supervisor 🟠
> **Objetivo**: eliminar el "teatro" sin marcar y los dead-ends del flujo de auditoría. La convención DemoBadge ya existe — extenderla.
> **Rama sugerida**: `fix/ola3-supervisor-honesto`

- [x] **3.1 Sidebar "CERRAR SESIÓN" funcional** (`Sidebar.tsx:147-155`): conectar a `setAuthUsuario(null)` (mismo handler que el botón del header). 5 minutos.
- [x] **3.2 Resolución de anomalías robusta** (`page.tsx:255-278` + `ReinspectionModal.tsx`):
  - Cerrar el modal SOLO en éxito; en error mantenerlo abierto con mensaje inline y la justificación PRESERVADA.
  - El estado de éxito del modal (línea ~562, hoy código muerto) debe mostrarse brevemente antes de cerrar (o toast de éxito).
  - Deshabilitar APROBAR/RECHAZAR cuando no hay `anomaliaId` real (dead-end 400 — `page.tsx:212-246` + `resolver/route.ts:22-27`) o soportar resolución por mesa.
- [x] **3.3 Evidencia real en el modal de auditoría** (`ReinspectionModal.tsx:52-74,463-529`): derivar overlays del `tipoAnomalia` real (SIN_FIRMAS → overlay firmas; CODIGO_NO_DETECTADO → overlay código), timeline desde `AuditEvent` reales; si no hay datos reales en demo → DemoBadge "EVIDENCIA SIMULADA".
- [x] **3.4 Carga masiva honesta** (`CargaMasiva.tsx`):
  - Zona de arrastre: o procesa archivos de verdad (al menos imágenes → flujo BATCH) o marca claramente "PREVIEW LOCAL — los archivos no se procesan en la demo" y deshabilita para ZIP/PDF.
  - "Servidor OCR" (452-497), "LATENCIA P99"/"COLA" (SaludSistema 121-122) → DemoBadge "ESTIMADO".
  - Barra apilada (755-797): segmentos disjuntos que sumen exactamente 100% (hoy 133%).
- [x] **3.5 Chat WhatsApp** (`WhatsAppChatModal.tsx:41,169`): eliminar claim "cifrado de extremo a extremo"/"canal oficial"; DemoBadge; quitar respuestas `Math.random()` o marcarlas.
- [x] **3.6 SLA con vida real**: guardar deadline (o computar desde `createdAt` + fase) y renderizar countdown con interval 30s (`RevisionAnomalias.tsx:101,230-235` + fuente única de umbrales — hoy 3 escalas incoherentes entre pantallas: 0-40/40-60/>2h vs 20/45). *(Fuente única creada como `src/lib/sla.ts`, no `sla-umbrales.ts`.)*
- [x] **3.7 "SLA ENGINE EN VIVO (30s)"** (`CentroNotificaciones.tsx:263,697-702`): implementar el polling de 30s prometido o retirar el claim.
- [x] **3.8 Frescura del monitor** (`page.tsx`/`MonitorGlobal.tsx`): refetch ligero o recompute de labels cada 30-60s; `lastSyncAt` guardado en el refetch (hoy se recalcula en cada render — B-1 AN-2).
- [x] **3.9 Unificar feedback**: reemplazar los 8 `alert()` por el Toaster shadcn ya instalado (`page.tsx:267,274,296,302,413,444,449` + `Sidebar.tsx:149`).
- [x] **3.10 Imprimible** (`globals.css`): `@media print` con tema claro forzado, ocultar sidebar/header/nav; afecta `GenerarInformes` ("EXPORTAR PDF / IMPRIMIR").
- [x] **3.11 Focus trap + foco inicial** en los 4 modales (migrar a Dialog de Radix ya presente en `src/components/ui/dialog.tsx` — `ReinspectionModal`, `ConfigSlaModal`, `SlaHistorialModal`, `WhatsAppChatModal`). *(Implementado con hook `use-focus-trap.ts` — fallback documentado del plan: foco inicial + trap Tab/Shift+Tab + Esc + restauración, sin migrar el marcado industrial propio.)*
- [x] **3.12 Header honesto** (`Header.tsx:83-101`): pill ONLINE/OFFLINE ligado al estado real del bootstrap; mostrar `authUsuario` real (no ADM-9482 fijo).

**VERIFICACIÓN OLA 3**: E2E supervisor — resolver anomalía con error de red simulado → justificación persiste · logout desde sidebar → vuelve al login · imprimir informe → preview legible en blanco · Tab dentro de cada modal no escapa al fondo.

---

## OLA 4 — Ciclo de rescaneo e integridad de datos 🟠
> **Objetivo**: cerrar el loop RN-03 (rescaneo) y que la mesa declarada sea la computada.
> **Rama sugerida**: `fix/ola4-rescaneo-integridad`

- [x] **4.1 Enviar `reemplazoDe` desde el cliente**: cuando el guard local decida reemplazar (dedup QR con hoja previa no-VALIDADO), mapearlo en `payloadADigielect` y en `uploadQueue.puentePorDefecto` (hoy nadie lo envía → flujo server B-02 muerto). *(Ejecutado+verificado: `resolverReemplazoDe` en store.ts — ranura vigente del bootstrap DTO + evidencia local (huellaEnviadaPrevia SINCRONIZADA) → payload.reemplazoDe → uploadQueue passthrough. E2E 7/10: re-scan de hoja RECHAZADA pasa el dedup.)*
- [x] **4.2 Liberar `qrFingerprint` en RESCANEO_CONFIRMADO** (`api/anomalias/resolver/route.ts:63-74`) o adoptar la huella al nuevo acta — hoy la recaptura choca siempre con "QR DUPLICADO". *(Ejecutado OLA4-A: qrFingerprint=null en el acta archivada — la fila queda RECHAZADO para auditoría y el valor de la huella liberada se preserva en el AuditEvent CONFIRMAR_RESCANEO; verificado con curl: recaptura con la misma huella ya NO choca.)*
- [x] **4.3 Dedup local por estado** (`puestoStorage.ts:282-293`): `existeHuellaEnCola` debe filtrar por PENDIENTE/ERROR/SUBIENDO (una hoja SINCRONIZADA/ANOMALIA no debe bloquear re-encolado). *(Ejecutado+verificado: ESTADOS_QUE_BLOQUEAN=[PENDIENTE,ERROR,SUBIENDO] — SINCRONIZADA/ANOMALIA liberan el re-escaneo RN-03.)*
- [x] **4.4 Autoridad de mesa computada** (`api/actas/route.ts:199-212`): si `asignacion.mesaId` (cruce QR↔VLM↔tabla) existe y difiere de `mesaIdRef` → forzar la asignada o crear anomalía UBICACION_DISCREPANTE. Hoy la mesa del acta es la que declara el cliente (agujero de integridad electoral). *(Ejecutado OLA4-A: opción "forzar la computada" — la computada MANDA, el acta.detalle y un AuditEvent UBICACION_DISCREPANTE registran la discrepancia y la respuesta lleva `ubicacionDiscrepante`/`mesaDeclaradaRef`. NO se crea fila de anomalía con tipo nuevo: TIPO_META de RevisionAnomalias no lo tiene y crashearía la bandeja — pendiente que el agente cliente adopte el tipo si quiere fila en bandeja.)*
- [x] **4.5 Guard de ubicación en captura dirigida** (`PantallaRevision.tsx:337-347`): si `senalesLocales.ubicacion` existe y no corresponde al consulado del `contexto` → contingencia con aviso, nunca auto-envío (hoy un acta de Roma puede archivarse en Madrid). *(Ejecutado+verificado E2E 7/10: contexto Accra mesa-001 + acta real de Roma → NO auto-envío → contingencia con toast "EL ACTA PERTENECE A OTRO PUESTO — VERIFIQUE".)*
- [x] **4.6 Avance de ranura tras éxito** (`store.ts:420-422`): `contexto` debe avanzar (P1→P2→siguiente tipo) o limpiarse tras `ultimoEnvio` exitoso; sugerir el siguiente objetivo en el visor. *(Ejecutado+verificado E2E 7/10: `avanzarContexto` con ranura EFECTIVA computada (asignación del server manda) + `siguienteObjetivo` en PantallaExito ("SIGUIENTE OBJETIVO · MESA 01 · DELEGADOS · P2 · La captura dirigida avanzó automáticamente") + banner "SIGUIENTE" con animación pwa-ranura-enter en el visor; rechazo fresco NO avanza (operario repite la misma hoja).)*
- [x] **4.7 Unificar reglas divergentes**: un solo `parseBarcode15` (hoy 2: `e14/parse.ts` y `digitalizador/reglas.ts`) y un solo `decidirEstado` (hoy 3: cliente PWA, server, demo-store — score 9 sin firmas = ANOMALIA para uno, RECHAZADO para otro). Extraer a `lib/reglas-e14.ts` compartido. *(Ejecutado+verificado: `lib/reglas-e14.ts` es la fuente única — `parseBarcode15Estructura` canónico (acepta CLAVEROS estructuralmente; el server decide qué hacer con él) + `decidirEstadoActa` con paginación. Fachadas: `e14/parse.ts` preserva `Barcode15|null` (verificar-acta/identificacion/integracion-captura intactos) y `digitalizador/reglas.ts` añade el rechazo UX de CLAVEROS (PantallaRevision/Contingencia/actaParser intactos). `decidirEstado` del cliente (0 consumidores, semántica divergente) y `decidirEstadoActaDemo` (copia literal) ELIMINADOS. GANANCIA extra: el server ahora tolera OCR O→0/I→1 en el barcode (normalizarDigitos compartido). Batería de paridad 24/24 (bun, desechable) + tsc 0 + lint 0 + E2E: POST /api/actas 200 con decisión "hoja 1/2 sin firmas exigibles" desde la función canónica, chips de desglose del barcode en Contingencia (ELECCIÓN/KIT/TIPO/VERSIÓN/PÁGINA) y chip KIT en Revisión.)*
- [x] **4.8 Backend debe aceptar el barcode determinista del cliente** (`api/actas/route.ts:121`): hoy solo usa `body.barcode` en `modoManual` → si el VLM falla, el barcode OCR local se pierde. Usar el del cliente como fallback cuando `analisis.barcode` sea null. *(Ejecutado OLA4-A: `barcode15 = analisis.barcode ?? barcodeCliente` — el VLM nunca se sobreescribe; verificado con curl: imagen 1x1 (VLM sin lectura) + barcode del cliente → acta persistida con barcode15 del cliente; y con acta real el barcode del VLM gana.)*
- [x] **4.9 Alinear `divipol` del contrato** (`lib/types.ts:199-205` vs `digitalizador/types.ts:94-100`): server devuelve `{consulado, municipio}`, cliente espera `{pais, ciudad}` → la tarjeta de revisión degrada a "NO DETECTADOS" aunque el VLM leyó la ubicación. *(Ejecutado+verificado: ActaAnalysis.divipol con AMBAS formas (pais/ciudad alias de municipio/consulado), VLM prompt pide pais/ciudad explícitos, analisis-acta mapea con fallback cruzado, cliente tolera ambas. curl /api/actas/analizar acta Roma: divipol={pais:ITALIA, ciudad:"Roma - Consulado",...} ✓.)*
- [x] **4.10 Transacciones en multi-writes**: `$transaction` en `anomalias/resolver`, `batch/route` (consulado/mesa/acta/cola/audit) y `notificaciones` (hoy un fallo intermedio deja estado inconsistente). BATCH además: región/país reales (no "america" fijo — A-10 AN-1) y `invalidarCacheConsulados` tras mutar. *(Ejecutado OLA4-A: las 3 rutas envueltas + región real derivada de consulados del mismo país con respaldo IANA (ITALIA→europa, desconocido→asia como el seed) + zona DIVIPOL parseada del location "Z. 20" + offset/hora cierre reales; `invalidarCacheConsulados` también en resolver. `lib/batch.ts` es cliente puro (solo HTTP) — no requería transacción.)*

**VERIFICACIÓN OLA 4**: E2E completo — rechazar acta por calidad → anomalía en supervisor → RESCANEO_CONFIRMADO → recapturar la misma acta física (mismo QR) en el digitalizador → debe reemplazarse (no "QR DUPLICADO") y quedar VALIDADO.

---

## OLA 5 — Seguridad de borde 🔴 (antes de cualquier despliegue real)
> **Rama sugerida**: `sec/ola5-borde`

- [x] **5.1 Sesión real**: usar next-auth (ya instalado) o JWT firmado en cookie httpOnly; `auth/login` devuelve sesión, no `{ok:true}`. *(Ejecutado+verificado: JWT HS256 propio (node:crypto, sin deps) en cookie httpOnly `digielect-sesion` 8 h · `lib/sesion.ts` con timingSafeEqual · rutas nuevas `/api/auth/logout` (expira cookie) y `GET /api/auth/sesion` (estado+expiraAt) · la UI verifica la sesión al arrancar y ante 401 vuelve honesta al login (localStorage inyectado a mano ya NO abre el panel — E2E verificado).)*
- [x] **5.2 Middleware de auth** en TODAS las rutas mutantes del supervisor (`resolver`, `batch`, `notificaciones`) y en `POST /api/actas` restringir `modoManual`+`datosManuales` (hoy cualquiera inyecta actas VALIDADAS con votos inventados que envenenan el escrutinio — C-3 AN-1). *(Ejecutado+verificado: `requiereSupervisor()` en las 3 rutas → 401 sin cookie (curl) · modoManual/datosManuales sin sesión → 403 · audit trail con usuario REAL de la sesión (antes ADM-9482/BATCH-SIG-04 fijos — verificado en BD) · flujo automático PWA sigue público por diseño.)*
- [x] **5.3 Zod en TODOS los bodies** (zod instalado, 0 usos): `actas`, `analizar`, `resolver`, `batch`, `notificaciones`, `login`. Extender `validarImagenBase64` a `/analizar` (hoy sin límite). *(Ejecutado+verificado: `lib/validacion.ts` con los 6 schemas + `parsearBody` (400 con campo+motivo del primer error) · `validarImagenBase64` extraída y compartida: /analizar ya no acepta tamaños sin cota · curl con body malformado → "Payload inválido — anomaliaId: expected string, received number".)*
- [x] **5.4 Validar formato de `qrFingerprint`** con `esHuellaQrValida` (existe, no se usa — M-3 AN-1). *(Ejecutado+verificado — y se corrigió el helper: la regex histórica `^[A-Za-z0-9_-]{44}$` RECHAZABA el formato real del E-14 (base64 con padding `=`, ver seed) — por eso nunca se pudo conectar. Regex corregida `^[A-Za-z0-9+/_-]{43,44}={0,2}$` + uso efectivo en api/actas: huella malformada → 400 antes de tocar VLM/BD.)*
- [x] **5.5 Quitar credenciales visibles del login** (`LoginScreen`): mover a un popover "credenciales de demo" o eliminar en modo completo. *(Ejecutado+verificado: desplegable discreto "CREDENCIALES DE DEMOSTRACIÓN" (KeyRound, colapsado por defecto, aria-expanded/controls) + sello "SESIÓN FIRMADA (JWT · COOKIE HTTPONLY · 8 H)" · E2E: ocultas por defecto, un clic revela, otro oculta.)*
- [x] **5.6 Rate limiting simple** por IP en `/api/actas` y `/api/actas/analizar` (in-memory, 10 req/min por IP es suficiente para la demo). *(Ejecutado+verificado: `lib/rate-limit.ts` ventana deslizante con limpieza por inactividad + Retry-After · 10/min en actas y analizar, 5/min en login (fuerza bruta) · curl: 5×401+429 en el 6º login, 10×400+429 en el 11º analizar · IP vía x-forwarded-for (gateway) — verificado el aislamiento por IP.)*

---

## OLA 6 — Infraestructura y calidad 🟡
> **Rama sugerida**: `chore/ola6-infra`

- [x] **6.1 Quality gates en CI**: job en `deploy-pages.yml` (y en PRs) con `bunx tsc --noEmit` + `bun run lint` + `NEXT_STATIC_EXPORT=1 bun run build:static` ANTES del deploy. Retirar `typescript.ignoreBuildErrors` cuando tsc esté limpio; reactivar reglas ESLint por etapas (1ª: `no-undef`, `no-unreachable`). *(Ejecutado+verificado: paso "Quality gates (tsc + lint)" ANTES del build estático en el job build (deploy needs: build ⇒ gate efectivo); trigger `pull_request` a main añadido; `typescript.ignoreBuildErrors` retirado de next.config.ts (tsc en 0); `no-undef` y `no-unreachable` reactivados en eslint.config.mjs con `bun run lint` en 0 problemas. Nota: el run de CI solo es verificable en GitHub.)*
- [x] **6.2 `db:push` sin `--accept-data-loss`** por defecto; añadir `db:push:force` explícito; el `.bat` de Windows solo usa force si la BD es nueva o cambió el schema. *(Ejecutado+verificado: package.json `db:push` limpio + `db:push:force` explícito; instalar-windows.ps1 con push condicional por BD nueva/existente — no existe ningún .bat en el repo, el .ps1 es la vía Windows.)*
- [x] **6.3 Pin de toolchain**: `bun-version: 1.3.14` en setup-bun + `"packageManager": "bun@1.3.14"` en package.json. *(Ejecutado+verificado: ambos presentes; bun --version local = 1.3.14.)*
- [x] **6.4 PWA iOS**: `apple-touch-icon` (180×180) en public/ + `appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Digielect" }` en `layout.tsx` metadata. *(Ejecutado+verificado: icons.apple → /e14/icono-pwa-192.png (iOS escala a 180) + appleWebApp{capable, black-translucent, Digielect} — verificado en el HTML servido: apple-touch-icon + apple-mobile-web-app-title "Digielect" + apple-mobile-web-app-capable + status-bar-style presentes.)*
- [x] **6.5 `demo:export` completo y atómico**: que genere también `public/data/digitalizador-bootstrap.json` (hoy fixture huérfano de 554KB); validar el backend ANTES de escribir; escritura tmp+rename. *(Ejecutado+verificado: genera los 4 archivos (índice offline primero, luego valida los 3 endpoints ANTES de escribir); escribirAtomico tmp+rename en todos; run real exit 0 con los 4 JSON parseando; ruta de fallo DEV_URL muerto → exit 1 sin tocar los JSON de servidor (md5 idéntico) y 0 .tmp residuales. Nota de tamaño: el digitalizador-bootstrap real trae las 14.692 actas → 5.9MB en disco (~260KB gzip en tránsito).)*
- [x] **6.6 sw.js**: `Promise.all` (no `allSettled`) en el precache del shell (3 assets); trim/LRU de CACHE_RUNTIME; `network-first` para `/data/*.json` (hoy datos congelados hasta bump de versión). *(Ejecutado+verificado: v1.5.0 — shell atómico con Promise.all; LRU runtime MAX 80 con evicción de la más vieja; network-first para /data/*.json con fallback a cache y 503; node --check + bun build OK + 11/11 casos del predicado + réplica LRU. El runtime en navegador real no es verificable en el sandbox.)*
- [x] **6.7 Limpieza**: borrar `tailwind.config.ts` (muerto — Tailwind 4 CSS-first), activar `noImplicitAny` por etapas, decidir el destino del stack OpenCV muerto (cablear `calentarMotorVision`/pipeline o eliminar 8.2MB de public/), unificar `public/actas` vs `public/actas-ejemplo` (−3-10MB), favicon. *(Ejecutado+verificado: stack OpenCV muerto ELIMINADO (5 .ts sin importadores + detection-worker + 2 vendors opencv −8.6MB — auditoría A-5; el motor vivo es el worker casero /e14); tailwind.config.ts borrado (0 referencias, 0 @config); actas-ejemplo unificado en actas (−3.1MB, 65 filas Acta.imagenUrl migradas en SQLite, demo:export regenerado); favicon src/app/icon.svg (variante 16px del icono PWA; hallazgo Next 16: metadata.icons suprimía el icono por convención — corregido); public/ 58M→47M (−11MB netos). Además HEIC cableado (A-5): PantallaCaptura usa archivoACapturaDataUrl → fotos HEIC de iPhone desde galería ya funcionan. DEFERIDO: noImplicitAny (esfuerzo multi-ronda, anotado).)*
- [x] **6.8 Zonas horarias por ciudad** (`hora-zona.ts` + seed): mapa ciudad→IANA para países multi-zona (EE.UU. 71 puestos afectados — V-5; análogos Canadá/Brasil/Rusia/Indonesia/Australia). La granularidad existe en `prisma/data/exterior-tree.json`. *(Ejecutado+verificado: ZONA_POR_CIUDAD + zonaIanaDePuesto(pais,ciudad) con matching por contención de tokens (la más a la derecha gana) y caché; cobertura REAL sobre el árbol: EE.UU. 123/123, Canadá 36/36, Brasil 42/42, Australia 17/17 al nivel ciudad (México: solo Cancún necesita override — añadido); 7 consumidores pasan el campo puesto/ciudad (monitor, demo-store, batch, notificaciones, actas, SaludSistema, seed). Smoke real UTC 02:01: Miami 22:01 vs Houston/Chicago 21:02 vs Los Angeles 19:02 vs Honolulu 15:22 — CSV del monitor lo confirma por fila.)*
- [x] **6.9 Scripts Windows-safe**: `dev` sin `| tee` (o documentar .bat como única vía), `start` con `node` (no bun) para el standalone. *(Ejecutado+verificado: `start: node .next/standalone/server.js` — el standalone de Next 16 setea NODE_ENV=production él mismo (verificado en next/dist/build/utils.js); `dev` conserva `| tee` (la observabilidad del sandbox depende de dev.log) y la vía Windows queda documentada en instalar-windows.ps1 con redirección nativa `*> dev.log` — la alternativa que el propio ítem admite.)*

---

## OLA 7 — UX/visual de detalle 🟢 (posterior, cuando 1-4 estén estables)

- [x] Touch targets ≥44px en digitalizador (minimizar cola ~20px ✓hecho, chips P1/P2 ~28px, iconos nav 28px — B-1 AN-3). *(Ejecutado+verificado: minimize de la cola con hit área 44px vía ::after -inset-3 · chips P1/P2 de Control con ::after -inset-2.5 → hit 48px vertical con visual de 28px intacto (verificado getComputedStyle: content "" + inset -10px) · botón X del buscador de mesa también · nav industrial ya era h-16=64px.)*
- [x] Desbloqueo de AudioContext en el primer pointerdown (beeps iOS — M-4 AN-3). *(Ejecutado+verificado: `desbloquearAudio()` en feedback.ts — listener pointerdown {once, passive} registrado al montar la PWA; iOS exige crear/resumir el contexto DENTRO del gesto — el primer beep llegaba segundos después del tap y sonaba en silencio para siempre.)*
- [x] Virtualización/paginación en tablas grandes (949 filas Monitor, RevisionAnomalias, CentroNotificaciones — M-13 AN-2). *(Ejecutado+verificado: Monitor paginado 50/pág — DOM de 2.916 botones/1007 filas → 222 botones/107 filas (−92%) con pager « ‹ 1/19 › » + "MOSTRANDO 1–50 DE 950" + reset de página al filtrar + scroll-top al cambiar página; CentroNotificaciones con scroll propio max-h-70vh; RevisionAnomalias ya tenía max-h-96. E2E: pág 2→3 con primera fila correcta.)*
- [x] Cabecera de tabla sticky REAL (hoy CSS muerto dentro de overflow-x-auto — M-7 AN-2) + filtros en cascada país→puesto + botón "Limpiar filtros" en estado vacío (M-8). *(Ejecutado+verificado: contenedor con scroll propio → sticky top-0 FUNCIONA (verificado midiendo rects tras scroll 600px: header top === container top) en Monitor y Centro; cascada país→zona/puesto con limpieza de dependientes al cambiar país (ESPAÑA → 66 puestos, zona 8 opciones); LIMPIAR FILTROS en la barra (disabled sin filtros) y CTA en el estado vacío.)*
- [x] Fallbacks `?? defaultMeta` en los 3 Records con crash potencial (M-3 AN-2) + ErrorBoundary global. *(Ejecutado: FASE_FALLBACK/CANAL_FALLBACK defensivos en CentroNotificaciones (dato runtime fuera del union ya no crashea la tabla) + ErrorBoundary global en page.tsx — crash de render en cualquier vista → pantalla de recuperación en español (RECARGAR PANEL / REINTENTAR SIN RECARGAR) en vez de la pantalla blanca de Next; consola registra el componentStack.)*
- [x] Semántica de color: reservar verde SOLO para éxito/validado; CTA de acción en otro color (hallazgo VLM). *(Ejecutado+verificado: familia accent nueva en globals.css (@theme + .pwa-e14: --color-accent #0a84ff, accent-strong #007aff, --shadow-glow-pill-accent) · CTAs de ACCIÓN en azul: ENVIAR/CONFIRMAR de Revisión, CONFIRMAR Y PROCESAR de Contingencia, REINTENTAR CÁMARA y CARGAR GALERÍA de error de cámara (verificado getComputedStyle rgb(10,132,255)) · verde conservado para éxito: HECHO, ÓPTIMA 9/10, sello X, pills OBJETIVO/SIGUIENTE, meter score>80, BadgeEstado VALIDADO. Nota: --color-accent pisa el mapeo shadcn var(--accent) — auditado, el supervisor no consume bg-accent.)*
- [x] Monitor: anomalías como indicador top-level (no enterradas en sidebar); jerarquía KPIs vs metadatos (VLM). *(Ejecutado+verificado: 6ª tarjeta KPI "ANOMALÍAS ABIERTAS" CLICABLE (filtra puestos con mesa en anomalía — E2E: 950→1 puesto con marca ⚠ visible en fila colapsada) + marca ⚠ junto al país en cualquier fila con anomalía.)*
- [x] Pantalla error cámara: ocultar toggles IA/AUTO irrelevante; CTA clara (VLM). *(Ejecutado+verificado: con camaraEnError el top bar muestra SOLO ✕ (pill IA/AUTO y menú ⋮ ocultos — verificado E2E + VLM) · jerarquía CTA: PRIMARIO azul REINTENTAR CÁMARA → SECUNDARIOS bordeados CARGAR DESDE GALERÍA / PROBAR CON ACTA REAL, todos h-11=44px · tinte del icono por estado (denegada=ámbar) + hint de permisos sólo para denegada · título CÁMARA NO DISPONIBLE uppercase.)*
- [x] Resumen digitalizador: unificar contadores en `contadoresCola` (contador legacy siempre 0 — M-1 AN-3); `puestoActivo` real. *(Ejecutado+verificado: PUESTO ACTUAL = puestoActivo real ("02 - Roma - Consulado · Z10 · ID 495-10-02 · 8 MESAS", E2E) con fallback honesto etiquetado · KPIs reales 2×3: PENDIENTES/ERRORES/ENVIADAS (ESTE DISPOSITIVO)=contadoresCola + VALIDADAS (SERVIDOR)/RESCANEOS/RECHAZADAS · NUEVA sección COLA DEL DISPOSITIVO desde IndexedDB (obtenerColaOrdenada, top-6 con estados y ultimoError, refresco tras sync) · botón SINCRONIZAR con contador real · campo legacy cola/leerCola/COLA_KEY ELIMINADOS del store · Control también abre en el puesto ASIGNADO (antes consulados[0]=Accra).)*
- [x] Revocar blob URLs de galería (M-3 AN-3); LRU de previews más pequeño en gama baja (B-4 AN-3). *(Ejecutado: desdeArchivo ahora revoca el object URL en finally tras extraer el data URL · grep global de createObjectURL: los otros 2 usos (escaner.ts:625, page.tsx:501) ya revocaban en finally · LRU de previews resulta moot: el único blob URL efímero era el de galería (revocado ya); el resto del flujo usa data URLs persistidas, no blobs en memoria.)*
- [x] Cámara: cerrar stream en el early-return del nonce (A-2 AN-3) y cancelar el gUM perdedor del timeout (A-3). *(Ejecutado: early-return del nonce tras abrirCamaraPrincipal ahora detiene principal.stream (LED no queda encendido) · gumConLimite con flag expirado + vigilante: un gUM que resuelve TARDE (permiso concedido tras timeout) se cierra al instante, timer limpio cuando gUM gana — protege desbloqueo/sondas/cascada · simulación bun inline 11/11 aserciones.)*
- [x] Lock multi-pestaña con `navigator.locks` para el worker de sync (A-6 AN-3). *(Ejecutado: sincronizarAhora envuelto en navigator.locks.request("digielect-sync-cola", {ifAvailable:true}) — 2ª pestaña vuelve inmediato {enviadas:0, pendientes:-1} sin duplicar envíos; sin Web Locks cae al guard workerActivo · TS 5.9 tipa LockManager nativo, cero deps.)*
- [x] Tesseract worker singleton (M-11 AN-3) — hoy se crea/destruye por captura. *(Ejecutado: singleton lazy 1× por pestaña con timeout de creación 30s (+perdedor tardío terminado) · colaReconocimiento promise-chain → recognize estrictamente UNO a la vez · recognize colgado → timeout 30s + reset del singleton (worker fresco para la siguiente) · higiene idle 120s · vendor-first/recorte/SenalesOcr/fail-soft intactos.)*

---

## 🧪 Suite E2E mínima (regresión, usar en cada ola)

```
1. Login supervisor (supervisor/digielect) → monitor renderiza 949 puestos.
2. Digitalizador → Opción A → acta real 495-010-02 P1 → asignar → CONFIRMAR → ÉXITO.
3. Misma acta P2 → ÉXITO.
4. Offline (throttle) → captura → cola offline → online → sincroniza.
5. Supervisor → bandeja anomalías → resolver con justificación → persiste.
6. Resumen digitalizador → puesto ACTIVO correcto + contadores de cola reales.
7. bunx tsc --noEmit = 0 · bun run lint OK · build:static OK.
```

## 📌 Reglas para el agente que continúa

1. Leer SIEMPRE: este plan → `ANALISIS-PROFUNDO.md` → worklog de sesión (últimas entradas) → worklog del repo si hace falta historia.
2. Una ola = una rama = un conjunto de commits verificables. No mezclar olas.
3. Cada tarea verificada → marcar `[x]` AQUÍ mismo + entrada en el worklog con qué se hizo/evidencia.
4. Si algo del plan contradice el comportamiento real del código, PRIMA el código y actualizar este plan.
5. Los hallazgos con ID AN-x C-y/A-y/M-y/B-y referencian el worklog de auditoría de la sesión del 2026-10-08 (`/home/z/my-project/worklog.md`).
6. NUNCA `bun run build` en el sandbox de la sesión principal (solo build:static si se necesita); el dev de digielect SIEMPRE en `-p 3100`.

---

## POST-PLAN — Mejoras autónomas (tras OLA 1-7 completas · 2026-10-08)

> El plan original está 100% ejecutado. Esta sección registra las mejoras
> propuestas y ejecutadas de forma autónoma por las rondas de revisión.

- [x] **P-1 UBICACION_DISCREPANTE en la bandeja del supervisor** (cabo suelto de 4.4): el tipo ya existía como AuditEvent + detalle del acta, pero TIPO_META no lo tenía y "crashearía la bandeja". *(Ejecutado+verificado: `TipoAnomalia` extendida · TIPO_META violeta/MapPinOff + filtro "Ubicación" · TIPO_LABEL en monitor.ts · creación de la fila en POST /api/actas cuando `ubicacionDiscrepante && VALIDADO` (en ANOMALIA la bandeja ya recibe la causa primaria; en RECHAZADO no hay caso) · modal: timeline explícito + botón "AUDITAR Y CERRAR CASO" (sin CONFIRMAR RESCANEO — el acta ES válida, el caso es de auditoría) · toast PWA informa que el supervisor recibió el caso. E2E API real con VLM: acta de El Cairo declarada como Roma → archivada en la computada (mesa-el-cairo-001) + anomalía creada + bandeja "UBICACIÓN (1)" + badge violeta + modal + resolución APROBADA con justificación persistida. Limpieza completa del estado de demo tras el test.)*
