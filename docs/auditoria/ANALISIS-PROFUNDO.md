# 🔍 Análisis Profundo de Digielect — Auditoría Integral (2026-10-08)

> **Repo**: `Jg-Stevan/digielect` @ commit `b4da5e6` (main)
> **Método**: 4 auditorías paralelas por subagentes (backend, supervisor, digitalizador, infra) + verificación empírica E2E con navegador automatizado sobre el proyecto corriendo (puerto 3100, BD real con seed completo: 949 consulados, 3.670 mesas, 14.680 actas) + análisis visual con VLM sobre capturas y actas reales.
> **Total de hallazgos**: **159** (15 CRÍTICOS · 34 ALTOS · 60 MEDIOS · 50 BAJOS)

---

## ⚡ Resumen ejecutivo

El proyecto está **arquitectónicamente sólido** (dualidad standalone/estática verificada con builds reales, dedup QR con transacción, relojes IANA con DST, workers con protocolo correcto) pero tiene **2 problemas que rompen el flujo principal del producto** y varios que comprometen la confianza del usuario:

1. **El digitalizador NO puede enviar actas P1 reales** — el guard anti-cruce tiene las anclas de página invertidas respecto a la documentación y a las actas reales (verificado empíricamente + VLM). Todo acta P1 con código legible es rechazada con "CRUCE DE PÁGINA" falso.
2. **Todo el sistema de diseño Stitch v2 está muerto** — la clase scope `.pwa-e14` nunca se aplica: sin safe-areas iOS, sin bloqueo de pull-to-refresh (una recarga pierde la sesión en plena captura), sin marcos de escáner, sin tipografía del diseño.
3. **Payloads de arranque gigantes** — `/api/digitalizador/bootstrap` pesa **6.03 MB** (medido) porque arrastra `imagenBase64` de actas; `/api/bootstrap` pesa 1.19 MB. Crecen sin cota con cada captura.
4. **Teatro sin marcar en el supervisor** — botón CERRAR SESIÓN del sidebar que no cierra sesión (verificado: `digielect-auth-v1` queda en localStorage), modal de auditoría con evidencia fabricada, carga masiva que no carga nada, chat que dice estar "cifrado de extremo a extremo".
5. **Seguridad de borde ausente** — login sin sesión real, 0 usos de Zod, endpoints mutantes sin auth: cualquiera puede inyectar actas VALIDADAS con votos inventados que envenenan el escrutinio.

---

## 🧪 Verificaciones empíricas (E2E con agent-browser, proyecto corriendo en :3100)

| # | Hallazgo verificado | Evidencia |
|---|---|---|
| V-1 | **Anclas de cruce de página INVERTIDAS** → actas P1 reales rechazadas | OCR del acta real Roma P1 contiene "VOTOS EN BLANCO" (ancla P1 real según docs y VLM) pero `actaParser.ts` la trata como ancla P2 → toast "CRUCE DE PÁGINA: el código declara PÁGINA 1 pero el texto corresponde a la PÁGINA 2" y `enviarActa` retorna false. El POST /api/actas nunca se hace. Reproducido 2 veces. |
| V-2 | **Botón "CERRAR SESIÓN" del sidebar no cierra sesión** | Click → alert informativo; `localStorage.digielect-auth-v1` sigue = `supervisor`; la vista no vuelve al login. |
| V-3 | **Resumen del digitalizador muestra puesto equivocado** | Sesión con Roma asignada → "PUESTO ACTUAL: 02 - Accra Consulado · ID: 115-05-02" (`consulados[0]`). Además "PROGRESO DEL PUESTO: 100% · 14672 de 14680" muestra el total GLOBAL como si fuera del puesto. |
| V-4 | **Payloads enormes** | `GET /api/digitalizador/bootstrap` = **6.030.067 bytes**; `GET /api/bootstrap` = **1.188.719 bytes**; `/api/informes` = 7 KB (pero carga todo en memoria servidor antes de `slice(0,12)`). |
| V-5 | **71 puestos de EE.UU. con zona horaria única** | Query a BD real: 123 puestos EE.UU., todos mapeados a `America/New_York`; Chicago/Houston/LA/SF/Minnesota/Kansas/Missouri/Hawaii/… con reloj errado 1-6 h. |
| V-6 | **CSS scope muerto** | 40 reglas bajo `.pwa-e14` en globals.css; **0** componentes aplican la clase; 10 componentes usan las clases huérfanas (`label-caps`, `data-mono`, `scanner-frame`, `pt-safe`…). |
| V-7 | **Flujo base funciona** | Login OK, monitor renderiza 949 puestos, digitalizador carga, OCR determinista lee "710009 8220101 02" del acta real, identificación O(1) asigna Roma/001 correcto, VLM `/api/actas/analizar` responde 200. |

**Análisis VLM de las actas reales (evidencia para el fix de anclas):**
- Exclusivos **P1**: `NIVELACIÓN DE LA MESA` · `CANDIDATO/AGRUPACIÓN/VOTACIÓN` · `VOTOS EN BLANCO` · `VOTOS NULOS` · `VOTOS NO MARCADOS` · `SUMA TOTAL (…)`
- Exclusivos **P2**: `CONSTANCIAS DE LOS JURADOS DE VOTACIÓN` · `¿HUBO RECUENTO DE VOTOS?` · `SOLICITADO POR:` · `EN REPRESENTACIÓN DE:` · `FIRMA JURADO 1-4`
- El OCR lee "NIVEL ACION DE LA MESA" (ruido) → las anclas requieren **normalización tolerante** (sin acentos/espacios, distancia de edición ≤2).

---

## 🏗️ Estado del proyecto (contexto para continuar)

- **Stack**: Next.js 16.1.3 (App Router, Turbopack), TS5, Tailwind 4 CSS-first, shadcn/ui, Prisma+SQLite, zustand, PWA con SW v1.4.0, demo estática en GitHub Pages (`https://jg-stevan.github.io/digielect/`).
- **Doble build verificado funcionando**: `bun run build` (standalone 207MB) y `NEXT_STATIC_EXPORT=1 bun run build:static` (out/ 56MB, sin api/, basePath `/digielect` correcto al 100%).
- **Historial interno**: worklog del repo (842 líneas, roles A/B/C, olas C-1..C-17). El módulo digitalizador fue reemplazado en C-16 por el ZIP del usuario (diseño Stitch v2) y en C-17 se añadió identificación determinista sin VLM.
- **Para correrlo**: `bun install` → `cp .env.example .env` → `bun run db:push` → `bun run db:seed` → `bunx next dev -p 3100` (el script `dev` pinnea 3000).
- **Credenciales demo**: supervisor/digielect.

---

## 📋 Hallazgos consolidados por severidad

> El detalle completo con archivo:línea y fix concreto de cada hallazgo está en:
> - **Backend (58)**: secciones `AN-1` del worklog de auditoría
> - **Supervisor (46)**: sección `AN-2`
> - **Digitalizador (34)**: sección `AN-3`
> - **Infra (20)**: sección `AN-4`
> - **Empíricos nuevos (1 crítico)**: V-1 de este documento (anclas invertidas — NO estaba en los reportes de subagentes)

### CRÍTICOS (15)

| ID | Módulo | Resumen | Archivo |
|---|---|---|---|
| **V-1** | Digitalizador | **Anclas P1/P2 invertidas en el guard anti-cruce** → rechaza TODAS las actas P1 reales con "CRUCE DE PÁGINA" falso | `src/lib/scanner/actaParser.ts:210-252` |
| AN-3 C-1 | Digitalizador | Clase scope `.pwa-e14` jamás aplicada → diseño completo muerto, sin safe-areas ni anti pull-to-refresh | `DigitalizadorApp.tsx:134`, `globals.css:338+` |
| AN-3 C-2 | Digitalizador | Auto-envío exige `analisis` VLM → offline/demo pierde el acta (borra sin enviar y dice "se envió automáticamente") | `PantallaRevision.tsx:329,916,931` |
| AN-3 C-3 | Cola offline | Items `SUBIENDO` huérfanos jamás se reintentan ni se cuentan (muerte de pestaña mid-upload) | `uploadQueue.ts:254,129,250` |
| AN-3 C-4 | Escáner | Fallback dibuja desde canvas liberado → imagen NEGRA en bucle "REPETIR FOTO" si el worker muere | `escaner.ts:395-415` |
| AN-3 C-5 | Store | `encolarActa` sin try/catch en el catch de red → quota llena deja `enviando=true` perpetuo | `store.ts:788` |
| AN-1 C-1 | Backend | `getConsulateRows` arrastra `imagenBase64`+`analisisJson` de TODAS las actas en cada refresco del tablero | `monitor.ts:150-159` |
| AN-1 C-2 | Backend | Informes: findMany sin select/límite carga todas las actas VALIDADO/ANOMALIA con imagen completa a memoria | `api/informes/route.ts:28-35` |
| AN-1 C-3 | Seguridad | Login sin sesión real; todos los endpoints mutantes sin auth; `modoManual` permite inyectar VALIDADAs con votos inventados | `api/auth/login`, `api/actas`, `resolver`, `batch` |
| AN-1 C-4 | Backend | Bootstrap digitalizador trae `imagenBase64` de hasta 8 actas/mesa → payload 6MB creciente (medido V-4) | `api/digitalizador/bootstrap/route.ts:35-48` |
| AN-2 C-1 | Supervisor | "CERRAR SESIÓN" del sidebar no cierra sesión (alert informativo) — verificado V-2 | `Sidebar.tsx:147-155` |
| AN-2 C-2 | Supervisor | Modal de auditoría con evidencia fabricada (timeline hardcode, overlays fijos) sin marcar DEMO | `ReinspectionModal.tsx:52-74,463-529` |
| AN-2 C-3 | Supervisor | Carga masiva: zona de arrastre es teatro (65% hardcode, ZIP/PDF jamás procesados) | `CargaMasiva.tsx:223-235` |
| AN-2 C-4 | Supervisor | Chat WhatsApp afirma "cifrado de extremo a extremo" con respuestas `Math.random()` sin DemoBadge | `WhatsAppChatModal.tsx:41,169` |
| AN-2 C-5 | Supervisor | Al fallar resolución de anomalía se cierra el modal y SE PIERDE la justificación escrita | `page.tsx:255-278` |

### ALTOS (34) — resumen

**Backend (12)**: `reemplazoDe` código muerto (recaptura legítima imposible) · dedup local sin filtrar por estado (bloquea rescaneo) · SLA congelado (40 min constantes para siempre) · mesa final = la declarada por el cliente, no la computada por cruce QR↔VLM · reglas de decisión divergentes cliente/servidor (score 9 sin firmas: ANOMALIA vs RECHAZADO) · `/analizar` sin límite de imagen · resolver conserva `qrFingerprint` tras RESCANEO_CONFIRMADO (ciclo rescaneo nunca cierra) · VLM sin timeout/retry/singleton · divergencia demo↔backend en duplicados · BATCH fabrica consulados sin transacción ni región correcta · BATCH aprueba actas sin justificación · zonas horarias por país (71 puestos EE.UU. errados — V-5).

**Supervisor (11)**: SLA congelado (misma causa, lado UI) · "SLA ENGINE EN VIVO (30s)" sin polling · latencia P99/cola fabricadas sin marcar · "Servidor OCR" hardcode · barra apilada que suma 133% · resolución sin anomalía = dead-end 400 · visor P1/P2 muestra la misma imagen en modo backend · impresión ilegible (sin `@media print`) · sin focus trap en 4 modales · botones rápidos saltan el filtro con bug de expansión · sin frescura temporal (relojes congelados entre refetch).

**Digitalizador (8)**: cola trata 404/405 como rechazo → en demo todo se marca ANOMALIA · fuga de stream principal · timeout de getUserMedia no cancela el prompt (LED encendido) · `limpiarSincronizadasViejas` sin callers (quota se agota en jornada) · stack OpenCV+HEIC completo muerto (8.2MB publicados sin cablear) · sin lock multi-pestaña en la cola · `contexto` de ranura no avanza tras éxito (misfiling) · captura dirigida ignora ubicación identificada (acta de Roma archivable en Madrid).

**Infra (3)**: cero quality gates en el deploy (ignoreBuildErrors + lint desactivado + sin tsc) · `--accept-data-loss` en cada arranque · Bun sin pin en CI.

### MEDIOS (60) y BAJOS (50)

Ver worklog de auditoría (secciones AN-1/AN-2/AN-3/AN-4). Destacan: índices SQLite faltantes, 46 colisiones reales de barcode15 en el seed, N+1/escrutinio sin groupBy, `slaMinutesRemaining` nunca actualizado, demo-store sin validación de esquema ni cap de audit, SW cache-first para `/data/*` (datos congelados), PWA sin apple-touch-icon, tsconfig `noImplicitAny:false`, tailwind.config.ts muerto, contraste de placeholders, touch targets <44px, foco no restaurado, etc.

### Hallazgos visuales (VLM sobre capturas reales)

- Login: credenciales en texto plano visibles (seguridad + UX), jerarquía tipográfica confusa, iconografía mixta (relleno vs línea), elemento flotante de debug.
- Monitor: sobrecarga informativa (data smog), anomalías semi-ocultas en el sidebar (deberían ser top-level), falta indicador "hace X seg" de sync, texto técnico mezclado con métricas operativas.
- Digitalizador: en pantalla de error de cámara se muestran toggles técnicos irrelevantes (IA/AUTO), texto "REINTENTAR CÁMARA" con touch target pequeño, ambigüedad de "acta real de ejemplo".
- Contingencia: verde usado indistintamente para éxito/CTA (peligroso en contexto electoral), badge "ACTAS (14680)" largo en móvil.
- Print: informe con tema dark sin estilos de impresión → PDF ilegible.

---

## ✅ Lo que está BIEN (no romper al corregir)

- Dedup QR server con `$transaction` + P2002 (B-01/B-02) — ejemplar.
- Dualidad standalone/estática con basePath 100% consistente (auditado sin fugas).
- Relojes IANA con DST (hora-zona.ts, salvo el mapeo único-por-país).
- Transacción única en POST /api/actas (acta+resultados+anomalía+audit+archivado).
- Cleanups de timers impecables en supervisor; debounce S-28 y throttle del sync.
- `useSyncExternalStore` sin hydration mismatch; imágenes pesadas a IndexedDB.
- Parsers puros (e14/parse, identificacion-acta) tolerantes y bien diseñados.
- PWA core correcta (manifest, SW registration, POST/api excluidos).
- Scripts de Windows (.bat/.ps1/LEEME) coherentes línea a línea.

---

## 📚 Índice de documentos

- **PLAN-CONTINUIDAD.md** (junto a este) — plan de ejecución priorizado en olas, con criterios de verificación por tarea. **Empezar por ahí.**
- Worklog de auditoría de sesión (`/home/z/my-project/worklog.md`) — detalle completo archivo:línea de los 159 hallazgos (secciones AN-1 a AN-4).
- Worklog histórico del repo (`worklog.md`, 842 líneas) — historia C-1..C-17 con roles A/B/C.
