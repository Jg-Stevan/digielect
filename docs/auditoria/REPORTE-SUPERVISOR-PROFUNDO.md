# AUDITORÍA PROFUNDA DEL MÓDULO SUPERVISOR — DIGIELECT (v2)
### Verificación completa de S-01…S-11 + 30 hallazgos nuevos, sobre el commit `2f001ed` (main)
**Repositorio:** https://github.com/Jg-Stevan/digielect · **Complemento de:** `docs/auditoria/REPORTE-DIGIELECT.md` (canon, commit `7c8b176`)
**Método:** lectura íntegra de los 13 componentes de `src/components/supervisor/` (~6.100 líneas), `page.tsx`, `layout.tsx`, `globals.css`, `next.config.ts`, `lib/monitor.ts`, `lib/api-client.ts`, `lib/sync.ts`, `lib/auth-store.ts`, las 8 rutas de `src/app/api/`, `prisma/schema.prisma` y `prisma/seed.ts` + conteo estadístico propio sobre `prisma/data/exterior-tree.json` (script Node). Dos pasadas independientes (verificación + caza de bugs nuevos), con validación byte-a-byte (`od -c`) de toda línea sospechosa.

**Convención de IDs:** continúa la del canon — `S-xx` supervisor UI, `B-xx` backend/datos. Los IDs S-12…S-41 y B-11…B-25 son NUEVOS (no existen en el canon). Referencias `archivo:línea` verificadas sobre `2f001ed`.

---

## 0. RESPUESTA A LA PREGUNTA DE COBERTURA

**¿El módulo de supervisor quedó revisado completamente?**

| Alcance | Estado |
|---|---|
| 13 componentes UI de `src/components/supervisor/` | ✅ Leídos íntegros ×2 (pasada original + esta verificación) |
| Shell `page.tsx` (estado, modales, sync cross-tab) | ✅ Íntegro, verificado línea a línea |
| Tipografía/layout global (`globals.css`, `layout.tsx`) | ✅ Verificado |
| Capa de datos que alimenta al supervisor (`monitor.ts`, bootstrap, sync) | ✅ Íntegro en esta pasada |
| APIs consumidas por el supervisor (batch, resolver, informes, login, bootstrap) | ✅ Íntegro en esta pasada |
| Schema + seed (contratos de datos) | ✅ Verificados con script estadístico |

El canon ya contenía 11 hallazgos de supervisor (S-01…S-11). Esta auditoría v2 **confirma 10, corrige 1 y añade 30 hallazgos nuevos**, de los cuales los 4 más graves son de backend y **no eran visibles en la auditoría anterior**: relojes del monitor desfasados +5h, ~41-51% de IDs de mesa que no existen en la BD, ingesta que envenena mesas tras el primer rechazo, y el monitor sin polling (datos congelados indefinidamente).

---

## 1. VERIFICACIÓN DE LOS HALLAZGOS DEL CANON (S-01…S-11)

| ID | Veredicto | Evidencia en `2f001ed` |
|---|---|---|
| **S-01** Filtro PUESTO roto ("Todas" vs "Todos") | ✅ **CONFIRMADO** | Estado default `"Todos"` (`MonitorGlobal.tsx:130`) pero `<option value="Todas">` (`:349`) y comparación `!== "Todos"` (`:198`) → select arranca en blanco y elegir "Todas" vacía la tabla. Los otros 3 filtros (PAÍS, ZONA, ESTADO) sí usan "Todos" coherentemente. |
| **S-02** "CERRAR SESIÓN" del Sidebar decorativo | ✅ **CONFIRMADO** | `Sidebar.tsx:147-155`: `alert("Sesión de supervisor activa: ADM-9482…")`. El logout real existe y no se usa: `page.tsx:360-370` (`setAuthUsuario(null)`). |
| **S-03** Modal pierde la justificación al fallar + alert() en vez de toasts | ✅ **CONFIRMADO** | `page.tsx:238-261`: el `finally { setReinspectionOpen(false) }` (l.258-260) cierra el modal **incluso tras `alert(json.error); return;`** — la justificación escrita se pierde. `alert()` ×7: `page.tsx:250,257,279,394,425,430` + `Sidebar.tsx:149`. `<Toaster />` montado y sin uso (`layout.tsx:57`; grep: 0 invocaciones de `toast()`). |
| **S-04** Acceso al digitalizador imposible en móvil | ✅ **CONFIRMADO** | `Header.tsx:71` `hidden md:flex`; `Sidebar.tsx:103` `hidden lg:flex`; y el `NavList` del Sheet móvil (`Header.tsx:52-57`) **no incluye** ni la entrada PWA ni CERRAR SESIÓN. |
| **S-05** Identidad falsa "ADM-9482 · SIG-04" | ✅ **CONFIRMADO (extendido)** | UI: `Header.tsx:93-99`, `Sidebar.tsx:149`, `GenerarInformes.tsx:351-352,829`. Backend: `api/batch/route.ts:41,89,167`, `api/anomalias/resolver/route.ts:79`, **y además `prisma/schema.prisma:161`** (`usuario String @default("ADM-9482")`) y `api/actas/route.ts:189` (`"PWA-DIG-001"`). Contradicción interna: `page.tsx:358` sí muestra el usuario real → dos identidades distintas visibles a la vez. |
| **S-06** `ignoreBuildErrors:true` + `reactStrictMode:false` | ✅ **CONFIRMADO** | `next.config.ts:34-37`. |
| **S-07** Tablas 1100px + tipografía ilegible | ⚠️ **PARCIAL (ajustado)** | `min-w-[1100px]` CONFIRMADO en `MonitorGlobal.tsx:464,517`. El `text-[8px]` solo existe hoy en `SaludSistema.tsx:246`. Pero el problema **se multiplicó**: `text-[9px]` ×24 (`CargaMasiva.tsx:648,673,686,1007…`, `ReinspectionModal.tsx:511,524…`, `SlaHistorialModal.tsx:211…`) y tablas `min-w-[900px]`–`[1080px]` en `CargaMasiva.tsx:556`, `GenerarInformes.tsx:661`, `CentroNotificaciones.tsx:427`. Base tipográfica global: `--text-label-caps: 11px`, `--text-body-md: 12px`, body 12px mono (`globals.css:177-184,235-236`). |
| **S-08** Ojo habilitado sin mesas → fallback `mesa-roma-001` | ✅ **CONFIRMADO** | `MonitorGlobal.tsx:683-690` (botón ojo sin guard de `mesas.length`) + `page.tsx:206` (`const ref = mesaId ?? "mesa-roma-001"`). El fallback además busca anomalía de esa mesa falsa (`page.tsx:209`). |
| **S-09** Modales hand-rolled sin focus trap / Escape ×4 | ✅ **CONFIRMADO (líneas actualizadas)** | Escape handlers: `ReinspectionModal.tsx:140-148`, `ConfigSlaModal.tsx:112-119`, `SlaHistorialModal.tsx:162-169`, `WhatsAppChatModal.tsx:108-114`. Grep: **0** `document.body` (sin scroll lock), **0** `.focus()` (sin trap, sin foco inicial, sin restauración) en los 5 modales. Todos `z-50` sin gestión de apilamiento. |
| **S-10** "SLA ENGINE EN VIVO (30s)" es texto fijo | ✅ **CONFIRMADO (extendido)** | `CentroNotificaciones.tsx:251,419-422` + apariciones adicionales `:677` y `SlaHistorialModal.tsx:301`. Verificado en `page.tsx:126-128`: `refetch()` solo al montar y en eventos cross-tab; **no existe polling de 30s en ningún lado**. |
| **S-11** Teatro de datos sin marca (65%, 850MB/s, 3670/3670) | ✅ **CONFIRMADO (extendido)** | `CargaMasiva.tsx:364-368` (65% congelado), `:469-497` ("Motor Neuronal C-4", 850/1000, 85%, 98.4%), `GenerarInformes.tsx:479-487` (fila inyectada `88 · CONSULADOS 3670/3670`) + **nuevos**: `:351-352` (firma "ADM-9482 · SIG-04 BOGOTÁ") y `:829` ("SELLO CRIPTO: SHA-256 (VERIFICADO)") en el informe imprimible. |

---

## 2. HALLAZGOS NUEVOS — SUPERVISOR UI (S-12…S-41)

### 🔴 ALTA severidad

**S-12 · El botón NOTIFICAR miente: toast de éxito sin ninguna acción** — `MonitorGlobal.tsx:156-162` (`handleNotifyMesa`) + `:795-810`. Al pulsar "NOTIFICAR" en una mesa, se muestra `"Notificación despachada con éxito a …"` **sin llamar a ninguna API ni persistir nada**. En jornada real, el supervisor creería que se notificó al delegado cuando no ocurrió nada. Es la variante más peligrosa del patrón S-11 porque simula una acción operativa crítica. *Fix:* llamar a `POST /api/notificaciones` (nuevo endpoint, persistir en `NotificacionSla`) o deshabilitar el botón con badge "DEMO".

**S-13 · El ojo abre siempre la mesa[0], no la mesa con problema** — `MonitorGlobal.tsx:686`: `onOpenReinspection(row.mesas[0]?.id)`. Aunque se corrija S-08, un consulado con 8 mesas y anomalía en la mesa 5 abre la auditoría de la mesa 1. *Fix:* abrir la primera mesa con `anomalia`/estado ≠ COMPLETO; si no hay, la primera.

**S-14 · `requiereReinspeccion` ignora rescaneo en DELEGADOS** — `MonitorGlobal.tsx:744-748`: solo revisa `transmision.p1/p2 === "rescaneo"`; un rescaneo pendiente en `delegados.p1/p2` muestra el botón "NOTIFICAR" (inofensivo) en vez de "REINSPECCIONAR". *Fix:* incluir `mesa.delegados.p1 === "rescaneo" || mesa.delegados.p2 === "rescaneo"`.

**S-15 · Resolver anomalía abre por MESA, no por ID de anomalía** — `page.tsx:300-302`: `handleResolveAnomalia(anomalia)` descarta `anomalia.id` y llama `handleOpenReinspection(anomalia.mesaIdRef)`; en `page.tsx:209` se busca la **primera** anomalía de esa mesa. Con dos anomalías abiertas en la misma mesa se abre la equivocada, y con `mesaIdRef` derivado incorrecto (B-12) no se encuentra ninguna. *Fix:* pasar y usar `anomalia.id` directamente.

**S-16 · SaludSistema presenta métricas inventadas como reales** — `SaludSistema.tsx:119-120` (`latenciaP99 = 140 + Math.round(min(utilización,1.4)*620)`) y `:182-185` (`colaIngesta = Math.round(mesasAhora*0.42)`): "LATENCIA P99 INGESTA" y "COLA: N ACTAS" son fórmulas decorativas sin marca de estimado. El comentario del código lo admite; la UI no. *Fix:* badge "ESTIMADO" o telemetría real.

**S-17 · Monitor sin polling: el tablero queda congelado indefinidamente** — `page.tsx:126-128` solo refresca al montar; `page.tsx:163-186` solo ante eventos de OTRAS pestañas del mismo navegador. Un monitor abierto solo en su pestaña **nunca** ve la ingesta de la PWA (dispositivo distinto, servidor real). Combinado con B-25 (payload 1,2 MB), el "monitor global" es estático salvo F5. *Fix:* polling con `setInterval` ≥15s (el backend ya tiene caché de 8s) o SSE/WebSocket.

### 🟡 MEDIA severidad

**S-18 · "REINICIAR DEMO" sin confirmación** — `page.tsx:436-448`: `apiResetDemo()` directo al click; borra la sesión demo entera sin diálogo. Un click accidental en la barra de refresco destruye el trabajo. *Fix:* `confirm()` o `AlertDialog` de shadcn.

**S-19 · "ÚLTIMA SYNC" acoplada al render, no a la sincronización** — `page.tsx:346-351`: `new Date().toLocaleTimeString(...)` inline. Cualquier re-render (abrir un modal, escribir en un filtro) "avanza" el reloj sin sync alguna; y un periodo sin re-renders lo congela aunque sí hubiera refetch. *Fix:* guardar `lastSyncAt` en state dentro de `refetch()`.

**S-20 · Indicador "ONLINE" hardcodeado** — `Header.tsx:81-86`: punto verde + "ONLINE" incondicional. Muestra conexión con el servidor caído. *Fix:* derivar del resultado del último `apiBootstrap` (ya existe `error` en `page.tsx:58`).

**S-21 · Botón de usuario muerto** — `Header.tsx:97-102`: `CircleUser` sin `onClick`. *Fix:* menú con usuario real + logout, o eliminarlo.

**S-22 · Modales apilados: un Escape los cierra todos** — Extensión de S-09. Los 4 modales se renderizan como hermanos (`page.tsx:534-556`) con listeners independientes en `window`; sin focus trap, un usuario de teclado puede abrir un segundo modal y **una sola pulsación de Escape cierra ambos a la vez**, perdiendo umbrales SLA sin guardar. *Fix:* primitive `<Modal>` único con pila de modales y `stopImmediatePropagation`.

**S-23 · CargaMasiva: FileReader sin catch → unhandled rejection mudo** — `CargaMasiva.tsx:194-208` + `:810`: `void handleBatchFiles(...)` sin try/catch; si `fr.onerror` (l.202) rechaza, la UI queda muda sin `setErrorBatch`. *Fix:* try/catch con `setErrorBatch`.

**S-24 · Barra segmentada del footer suma >100%** — `CargaMasiva.tsx:282,750-797`: `integrables = queueFiles.length - duplicados` incluye manuales y alertas que además se pintan como segmentos propios → sobredimensiona el segmento verde y "Integrables X de Y" es falso. *Fix:* `integrables = reconocidos + nuevo_registro`.

**S-25 · Pool de Workers del BATCH sobrevive al desmonte** — `CargaMasiva.tsx:166-191` + `lib/batch.ts:743,773`: los callbacks `onProgreso/onFin` hacen setState sobre componente desmontado y nunca se llama `cancelarLote()`. *Fix:* cleanup en `useEffect` de unmount.

**S-26 · Botones CORREO y TELÉFONO: éxito simulado** — `CentroNotificaciones.tsx:592-607`: toasts "Correo oficial… enviado" / "Llamada… iniciada" sin acción alguna, en el módulo de **escalamiento oficial**. *Fix:* badge DEMO o persistir el evento.

**S-27 · Historial SLA: bitácora fabricada y timeline no monótona** — `SlaHistorialModal.tsx:43-119`: eventos reconstruidos con horas `cierreMin+18/+22` presentados como historial real; si `notifDespacho` cae temprano, "REINTENTO 16:10" aparece **encima** de "DESPACHO 16:22". *Fix:* ordenar por hora + badge "RECONSTRUIDO (DEMO)".

**S-28 · Tabla del monitor re-filtra en cada tecla sin useMemo** — `MonitorGlobal.tsx:212-230`: `filteredConsulates` calculado inline sobre 949 filas ×3.670 subfilas en cada keystroke del buscador. *Fix:* `useMemo` + debounce 250ms.

**S-29 · Columnas de reloj estáticas (no hacen tick)** — `MonitorGlobal.tsx:613-631`: `horaActualPais`, `tiempoDesdeCierre` y `ultimaCarga` vienen del bootstrap y **no se actualizan ni con reloj local**: "HACE 3h" congelado aunque la mesa cargue (hasta refetch). *Fix:* derivar el tick en cliente desde `cierraLas`/`utcOffsetMin` (ver B-11 para corregir primero el desfase).

### 🟢 BAJA severidad

| ID | Hallazgo | Evidencia | Fix |
|---|---|---|---|
| **S-30** | Timeout de escaneo simulado sin cleanup (setState tras desmonte) | `CargaMasiva.tsx:227-234` | ref + clearTimeout |
| **S-31** | `key={name}` duplicable en vista previa (dos archivos homónimos) | `CargaMasiva.tsx:384-392` | `key={name-idx}` |
| **S-32** | String roto: literal `"pool× Workers"` en reposo | `CargaMasiva.tsx:831` | `lote?.workers ?? "—"` |
| **S-33** | Confianza OCR inventada `?? 99%` cuando falta el dato | `CargaMasiva.tsx:674-675` | mostrar "—" |
| **S-34** | Picker BATCH ignora PDFs en silencio (0 resultados, 0 mensajes) | `CargaMasiva.tsx:197-198,814` | `setErrorBatch` si `files>0 && entradas=0` |
| **S-35** | Chat: horas iniciales fijas 16:15-16:27 vs `horaActual()` real → respuestas "antes" de la pregunta | `WhatsAppChatModal.tsx:37-59,123` | horas relativas a la apertura |
| **S-36** | "Guardando…" setTimeout 800ms sin cleanup al desmontar | `ConfigSlaModal.tsx:168-171` | ref + clearTimeout |
| **S-37** | "Configuración SLA aplicada a la sesión actual" es falso (no aplica a nada) | `ConfigSlaModal.tsx:325-333` | redactar "(demo)" o aplicar de verdad |
| **S-38** | COT hardcodeado `+5` duplicando `COT_OFFSET_MIN=-300` | `SaludSistema.tsx:27,204-205` | derivar de la constante |
| **S-39** | Filtros no resetean la fila expandida (expandido invisible tras filtrar) | `MonitorGlobal.tsx:128-133,171` | reset en cambio de filtro |
| **S-40** | `handleRemoveQueueFile` falla en silencio (solo console.error) | `page.tsx:291-298` | toast de error |
| **S-41** | Prop muerto `onToggleMobileMenu` en Header | `Header.tsx:17,24-29` | eliminar |

---

## 3. HALLAZGOS NUEVOS — BACKEND/DATOS QUE ALIMENTAN AL SUPERVISOR (B-11…B-25)

### 🔴 ALTA severidad

**B-11 · Relojes del monitor desfasados +5h (semántica del offset rota)** — `lib/monitor.ts:44-49` y `:52-71` calculan `horaLocalAhora`/`tiempoDesdeCierreLabel` como `new Date(Date.now() + offsetMin*60000)` (offset **desde UTC**), pero `prisma/schema.prisma:35` define `utcOffsetMin Int // Offset horario respecto a Bogotá (minutos)` y el seed lo carga así (`offset: 300` para Italia = 300 min **desde Bogotá**). Resultado medido: a las 01:50 UTC, Roma real 03:50 (CEST) y el monitor muestra **08:50**. `tiempoDesdeCierre` sale inflado igual (al cierre italiano marca "HACE 5h"). Error adicional sin DST: los offsets del seed son fijos (Roma 300 = UTC+0 cuando Roma es UTC+1/+2) y países no mapeados caen a `offset: 300` silenciosamente (`seed.ts:365-368`). Contradicción interna demostrable: `SaludSistema.tsx:27,44-48` SÍ compensa (`COT_OFFSET_MIN=-300`) → "Salud del sistema" contradice las filas del monitor. Mismo bug en `api/actas/route.ts:229-234` y `seed.ts:589`. *Fix:* `Intl.DateTimeFormat` con zona IANA por consulado + mapeo de DST; mientras tanto, restar 300 min en monitor.ts.

**B-12 · ~41-51% de IDs de mesa del monitor NO existen en la BD** — `monitor.ts:156` deriva `mesaIdRef = mesa-${slug(ciudad)}-${pad3(n)}`, pero el seed crea el PK real con sufijos: `mesa-${slug(ciudad)}${esDia ? "-diario" : ""}-${pad3(n)}` + sufijo `-z<zona>` ante colisión (`seed.ts:406-410`). **Conteo propio** sobre `exterior-tree.json`: 698 stands "de día", 3.670 mesas, **1.504 IDs derivados (41,0%) no existen en la BD** (la pasada previa midió 51% con otra normalización de ciudad). Consecuencias en cadena: ① anomalías no se iluminan en la mesa correcta (`monitor.ts:157-158`), ② el `id` de mesa que viaja a la UI/auditoría es falso (S-15 y S-08 se agravan), ③ las actas que la PWA ingesta con `mesaIdRef` derivado no encuentran mesa (`api/actas/route.ts:104-113`) → **actas huérfanas invisibles para el monitor y los informes**. *Fix:* exponer el PK real (`m.id`) en `MesaDetail` y eliminar toda re-derivación.

**B-13 · Un rechazo envenena la mesa para siempre (primer acta gana)** — `monitor.ts:139-153` toma el **primer** acta de cada (tipoEjemplar, pagina) y `monitor.ts:160-172` exige `m.actas.length === 4 && every(VALIDADO)`. La PWA persiste los RECHAZADO (`api/actas/route.ts`) → tras un rechazo + reintento válido la mesa tiene 5 actas: `length===4` falla, el chip muestra ✕/rescaneo del acta rechazada y el estado queda INCOMPLETO **aunque las 4 páginas vigentes estén validadas**. *Fix:* "vigente = última acta por página" (`findLast` / orderBy createdAt desc) y `todasValidadas` sobre las 4 páginas vigentes.

**B-14 · Toda la API sin autenticación (extends B-04 del canon)** — Verificado con grep (0 resultados de session/token/cookie en `src/app/api`): cualquiera en la red puede `POST /api/actas` (inyectar actas/imágenes), `/api/anomalias/resolver` (aprobar/rechazar), `/api/batch` (descartar/integrar), `GET /api/informes` (audit trail + votos). El login es un gate de UI (`page.tsx:317`) con credenciales comparadas con `===` (`api/auth/login/route.ts:28-32`, defaults `supervisor/digielect` hardcodeados `:11-12`) y sin rate-limit. Además `DEMO_CREDENCIALES` se muestra en pantalla en todos los modos (`api-client.ts:257-282`, `LoginScreen.tsx:189-192`). *Fix:* middleware con cookie httpOnly firmada + verificación en cada mutación + `crypto.timingSafeEqual`.

**B-15 · Ingesta carga imágenes base64 en RAM en cada rebuild** — `monitor.ts:128-137`: `include` completo de actas sin `select` (las capturas PWA son base64 de 1-3 MB c/u) en cada reconstrucción de la vista (cada ingesta / cada 8s de TTL); `api/informes/route.ts:28-35` carga TODAS las actas con imágenes solo para sumar votos. Con 14.680 actas el servidor entra en OOM/latencia durante la ola de cierre. *Fix:* `select` de columnas ligeras + agregaciones (`groupBy`) para escrutinio.

**B-16 · El cliente no pollea y el payload es monolítico** — `GET /api/bootstrap` devuelve ~1,2 MB (949 consulados, 3.670 mesas embebidas, anomalías, cola, SLA) sin delta ni paginación, y el cliente solo lo pide al montar (ver S-17). Además `getResumen()` (`monitor.ts:343`) re-llama `getConsulateRows()` dentro del `Promise.all` → doble reconstrucción concurrente en frío. *Fix:* endpoints por sección + `?since=` o ETag; reusar la caché en getResumen.

### 🟡 MEDIA severidad

| ID | Hallazgo | Evidencia | Fix |
|---|---|---|---|
| **B-17** | Dedupe QR sin `@unique` ni `$transaction` (race persiste duplicado como RECHAZADO con imagen completa → doble storage + mesa envenenada por B-13) | `api/actas/route.ts:88-99,117`; `schema.prisma:86` | `@unique(qrFingerprint)` + upsert transaccional |
| **B-18** | Caché del monitor sin mutex ni dedupe de promesas: N requests concurrentes reconstruyen N veces; read-build-write race puede cachear datos obsoletos hasta 8s tras una ingesta | `monitor.ts:109-124` | promesa compartida + invalidación con generación/epoch |
| **B-19** | `resolver` sin validación de transición: re-aprueba anomalías cerradas, voltea VALIDADO→RECHAZADO, duplica auditoría (usuario fake S-05); sin `$transaction` | `api/anomalias/resolver/route.ts:44-60` | exigir `estado==="ABIERTA"` + transacción |
| **B-20** | BATCH "integrar" no idempotente: doble clic duplica acta NUEVO_REGISTRO (check-then-act) y el código secuencial `9${100+total}` puede chocar con el unique en carrera → 500 | `api/batch/route.ts:29,115-118,144-147` | upsert + transacción |
| **B-21** | SLA "zona muerta": `slaMinutesRemaining` hardcodeado 40 y nunca decrementa; `NotificacionSla` solo existe por seed; `enMora` se lee pero nunca se calcula → RN-06 sin implementar | `api/actas/route.ts:178`; `monitor.ts:162,176,261`; `seed.ts:631-659` | motor SLA server-side con decremento real |
| **B-22** | Sin límites de payload ni rate-limit: `imagenBase64` sin máximo ni content-type en POST /api/actas y /api/actas/analizar (VLM = coste/DoS) | `api/actas/route.ts:27-34`; `api/actas/analizar/route.ts:20-31` | límite ~8MB + validación + rate-limit por IP |
| **B-23** | Anomalía fabricada con campos absurdos: `mesa: "MESA ${pagina}"` (usa el nº de página como mesa) y códigos DIVIPOL como país/ciudad ("495") | `api/actas/route.ts:172-176` | resolver mesa real o marcar "SIN MESA" |
| **B-24** | barcode15 del seed inválidos: los 3.670 actas tienen `idTransmissionCode` de 7 dígitos → barcode de 16 chars → `slice(0,15)` desplaza campos → `parseBarcode15` devuelve `null` para los 14.680 barcodes del monitor | `seed.ts:507-509`; `e14/parse.ts:62-67` | ampliar kit a 7 o truncar con validación |
| **B-25** | `postJson` no chequea `res.ok`: un 500 en HTML produce error de parseo genérico y oculta el mensaje real del servidor (afecta a todos los alert() de page.tsx) | `api-client.ts:104-111` | `if (!res.ok) throw con body` |

### 🟢 BAJA severidad

| ID | Hallazgo | Evidencia |
|---|---|---|
| **B-26** | Visor de imagen del modal de auditoría roto fuera de dev: redirect a `http://localhost:3000` hardcodeado + `Cache-Control: public` sobre actas sin auth | `api/actas/[id]/imagen/route.ts:42-46` |
| **B-27** | Export estático: 2ª escritura pisa `indice-actas.json` con formato plano incompatible con el lector demo → regenerar la demo de GitHub Pages la rompe (latente, confirmado) | `scripts/export-static-data.ts:104` vs `:228-232`; `indice-actas-remota.ts:64-99` |
| **B-28** | Matching difuso: ancla `CONSULADO` (`verificar-acta.ts:141-144`) puede resolver cualquier acta al primer consulado (Roma) — misma familia del hardcode ROMA del canon | `verificar-acta.ts:141-144` |

---

## 4. PATRONES TRANSVERSALES (lo que explica todos los bugs)

1. **Teatro de datos sin convención** — S-11, S-12, S-16, S-26, S-27, B-21: cada archivo mezcla datos vivos con constantes decorativas sin distinción visual. El caso límite es un informe **imprimible** que afirma "SELLO CRIPTO: SHA-256 (VERIFICADO)" junto a una fila inyectada 3670/3670. *Recomendación:* un único componente `<DemoBadge />` y convención de nombres (`*_demo`, `*Estimado`) revisada en code review.
2. **Ids derivados vs PKs reales** — B-12, S-15, S-08: la identidad de mesa se re-deriva por slug en 3 lugares distintos (seed, monitor, PWA) con reglas ligeramente diferentes. *Recomendación:* el id legible se genera UNA vez (seed/upsert) y viaja siempre; prohibir re-derivarlo.
3. **"Limpiar solo lo que molesta"** — S-30, S-36, S-25, N-timeouts: los timers de toast se limpian pero los de negocio no; el pool de Workers nunca se cancela. *Recomendación:* hook `useTimeout`/`useInterval` y abort controllers centralizados.
4. **Check-then-act sin transacción** — B-17, B-19, B-20: todos los flujos de mutación leen-then-escriben. *Recomendación:* `$transaction` + `@unique` + upsert en los 3 flujos.
5. **Reloj fragmentado** — B-11, S-29, S-38, S-35: 4 implementaciones distintas de "hora" (monitor +offset, SaludSistema −300, chat horaActual, PhoneFrame Europe/Rome). *Recomendación:* utilidad única `horaEnZona(iana: string)` con Intl.

---

## 5. PLAN DE IMPLEMENTACIÓN ACTUALIZADO (suplanta la FASE 4 del canon)

| # | Tarea | Bugs | Criterio de aceptación |
|---|---|---|---|
| **4.0** | **Hotfix de relojes**: `horaEnZona(iana)` única + tabla país→IANA + corregir monitor.ts/actas route/seed | B-11, S-29, S-38 | Roma 16:00 UTC muestra 18:00 (CEST) en monitor y SaludSistema coincide; `tiempoDesdeCierre` correcto al cierre |
| **4.1** | **Identidad de mesa**: exponer PK real en MesaDetail, eliminar re-derivación en monitor/PWA; backfill de `mesaIdRef` de anomalías existentes | B-12, S-15 | 0 IDs derivados ausentes en BD (script de verificación incluido abajo); anomalía ilumina su mesa |
| **4.2** | **Vigente = última acta por página** + `todasValidadas` sobre vigentes | B-13 | Mesa con rechazo+reintento válido pasa a COMPLETO; chip P1/P2 refleja el acta vigente |
| **4.3** | **Verdad en acciones**: NOTIFICAR persiste o muestra DEMO; CORREO/TELÉFONO idem; informe imprimible sin fila inyectada ni sello falso | S-12, S-26, S-11, S-27 | Ningún toast de éxito sin backend real detrás; informe sin datos inyectados |
| **4.4** | **Filtros + tabla**: fix "Todas/Todos", useMemo+debounce, reset de fila expandida, ojo → mesa con problema, requiereReinspeccion incluye delegados | S-01, S-28, S-39, S-13, S-14 | Elegir "Todas" no vacía la tabla; buscar 949 filas sin lag medible; ojo abre mesa con anomalía |
| **4.5** | **Polling y payload**: bootstrap por secciones, polling 15-30s configurable, `lastSyncAt` real, ONLINE real | S-17, S-19, S-20, B-16 | Ingesta desde otra pestaña/dispositivo visible ≤30s sin F5; payload inicial <300KB |
| **4.6** | **Modales**: primitive `<Modal>` (focus trap, scroll lock, restore focus, pila de Escape) y migrar los 5 | S-09, S-22, S-03 | Tab entre modales no escapa; Escape cierra solo el superior; justificación no se pierde en fallo |
| **4.7** | **Transacciones e integridad**: `@unique(qrFingerprint)`, upsert transaccional, resolver con transición validada, batch idempotente | B-17, B-19, B-20 | 2 POST concurrentes mismo QR → 1 acta; doble clic integrar → 1 acta; anomalía cerrada → 409 |
| **4.8** | **Rendimiento servidor**: `select` ligero en monitor/informes, agregación de escrutinio, dedupe de promesa en caché | B-15, B-18 | Rebuild <500ms con 15k actas; 20 GET concurrentes → 1 rebuild |
| **4.9** | **Auth + límites**: middleware cookie firmada, timing-safe, rate-limit, límite de payload | B-14, B-22, B-25, S-02, S-05 | Mutaciones sin sesión → 401; usuario real en auditoría; DEMO_CREDENCIALES solo en modo demo |
| **4.10** | **Higiene UI**: toasts en vez de alerts, confirm de REINICIAR DEMO, cleanup de timers/workers, textos rotos, keys, 9px→≥10px | S-03, S-18, S-25, S-30…S-41, S-07 | 0 `alert()`; 0 setState tras desmonte (React 18 warnings); lint sin avisos |

**Script de verificación de B-12** (ejecutar tras el fix — debe imprimir 0):

```bash
node -e "
const tree=JSON.parse(require('fs').readFileSync('prisma/data/exterior-tree.json','utf8')).departamentos;
// ... (misma lógica de derivación que monitor.ts) ...
// comparar contra SELECT id FROM Mesa; imprimir los derivados ausentes
"
```

---

## 6. RESUMEN EJECUTIVO PARA EL ORQUESTADOR

- **El módulo supervisor YA estaba auditado** (S-01…S-11 en el canon) y esta pasada v2 **confirma 10/11, ajusta S-07 y añade 30 hallazgos** (S-12…S-41, B-11…B-28).
- **Los 4 bugs más graves son de datos, no de UI**: relojes +5h (B-11), ~41-51% de mesas con ID fantasma (B-12), mesas envenenadas tras rechazo (B-13), monitor congelado sin polling (S-17/B-16). Ninguno era visible en la auditoría original y **todos distorsionan el avance real que el supervisor ve el día electoral**.
- El patrón dominante a atacar es la **mezcla de teatro y datos reales sin marca** (7 hallazgos) — fijar la convención `<DemoBadge />` antes de tocar componente alguno.
- Orden sugerido: 4.0 → 4.1 → 4.2 (datos veraces) → 4.3/4.4 (UI creíble) → resto.
