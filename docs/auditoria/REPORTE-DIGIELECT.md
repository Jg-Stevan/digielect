# REPORTE PROFUNDO DE ANÁLISIS E IMPLEMENTACIÓN — DIGIELECT
### Auditoría de código completa para agentes de implementación
**Repositorio:** https://github.com/Jg-Stevan/digielect · Commit auditado: `7c8b176` (main) · Ramas: `main`, `feature/a-escaner-pwa`, `feature/b-supervisor-demo`, `feature/identificador-actas`, `vite-legacy`
**Fecha:** octubre 2025 · **Método:** lectura exhaustiva de ~14.000 líneas en `src/`, `public/e14/`, `prisma/`, `scripts/`, `src/app/api/` + cross-check contra `worklog.md` y `docs/agentes/` del propio repo.

---

## 0. CÓMO USAR ESTE REPORTE (para los agentes)

1. **Las referencias `archivo:línea` son exactas sobre el commit `7c8b176`.** Verificad la línea antes de editar (el archivo puede haber cambiado).
2. Cada hallazgo tiene ID único (`D-xx` digitalizador, `S-xx` supervisor, `B-xx` backend/datos, `A-xx` arquitectura). Usad esos IDs en vuestros commits y worklog: `fix(D-03): ...`.
3. Respetad `docs/agentes/CONVENIOS.md` (exclusividades por rol, validación fuera del repo, degradación honesta sin bloquear UI).
4. Validación mínima antes de entregar cada fase: `bunx tsc --noEmit` · `bun run lint` · `bun run build:static` · prueba E2E manual de los flujos indicados.
5. **Prioridad de implementación:** FASE 0 (hotfixes operativos reportados por el humano) → FASE 1 (integridad) → FASE 2 (PWA real) → FASE 3 (galería) → FASE 4 (supervisor) → FASE 5 (endurecimiento). Dentro de cada fase los bugs están ordenados por severidad.

---

## 1. VEREDICTO EJECUTIVO

El proyecto está **arquitectónicamente bien concebido** (flujo determinista QR+OCR+barcode con VLM como respaldo, paridad demo/fullstack real, sincronía cross-tab de calidad) pero **falla en el último kilómetro operativo**: fue construido como una **simulación de escritorio de una PWA**, no como una PWA. Los 7 problemas que reportó el operador humano son reales, verificados en código, y comparten una causa raíz común:

> **La PWA del digitalizador nunca se construyó como aplicación real.** Es un componente React (`DigitalizadorApp`) renderizado dentro de un marco de teléfono falso de 390×800px (`PhoneFrame.tsx`), sin ruta propia, sin manifest, sin service worker, sin safe-areas y con preferencia hardcodeada del consulado de Roma. Todo lo que el operador siente como "mini", "incómodo" o "no funciona" se deriva de esa decisión de diseño no completada.

Además, la auditoría profunda destapó **~50 bugs adicionales no reportados**, varios de ellos críticos para una jornada electoral real: un botón "RECORTAR" que en realidad repite la foto y quema reintentos RN-03, chips de mesa que capturan la mesa equivocada, envíos manuales que se pierden sin red, dedupe de QR con race condition sin transacción, API de ingesta sin autenticación, y un script que al regenerarse rompería la demo de GitHub Pages.

**Cifras:** 7/7 problemas reportados confirmados · 6 críticos · 15 altos · ~20 medios · ~10 bajos · 3 riesgos de datos/integridad · 4 riesgos de seguridad.

---

## 2. VERIFICACIÓN DE LOS 7 PROBLEMAS REPORTADOS (causa raíz + especificación de fix)

### 2.1 — La cámara usa el ultra-wide en vez de la trasera principal [D-01 · ALTA · CONFIRMADO]

**Evidencia** — `src/components/digitalizador/PantallaCaptura.tsx:170-185`:
```ts
stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 2560 },
    height: { ideal: 1920 },
  },
  audio: false,
});
```
- `facingMode: {ideal: "environment"}` **no selecciona una cámara concreta**: en teléfonos multi-cámara el navegador elige por su política interna; en varios Androids con restricciones de resolución altas entrega la lente ultra-wide o una secundaria. El propio worklog del repo lo deja pendiente: *"Pendiente A-2/A-3 (propuesto): selección de lente con sondas secuenciales v2 de web-scanner… sondas de lente v2 + torch reintentos… quedaron propuestos y nunca se hicieron"*.
- Agravante `:184`: el fallback tras error es `getUserMedia({video: true})`, que pierde incluso la aspiración de resolución.

**Fix especificado (rol A):**
1. Tras el primer `getUserMedia` exitoso (que otorga permiso), llamar `navigator.mediaDevices.enumerateDevices()` y quedarse con los `videoinput`.
2. **Sondas secuenciales** (patrón web-scanner ya conocido por los agentes): por cada dispositivo trasero, abrir un stream corto (`deviceId: {exact}`), leer `track.getCapabilities()` (ancho máximo, `zoom`, `focusMode`, `torch`), cerrar. Descartar candidatos cuyo `label` matchee `/ultra|ultra Wide|0[.,]5|macro|tele|portrait/i` y puntuar el resto por resolución máxima del sensor. Seleccionar el ganador y reabrir el stream definitivo con `deviceId: {exact}` + `width/height: {ideal: caps.max}`.
3. **Botón de cambio de cámara** (icono `SwitchCamera`) en la top bar que cicla entre las traseras detectadas (lista cacheada en el hook) — el operador siempre puede corregir a mano.
4. Mantener el fallback actual ante `OverconstrainedError`, pero conservando `deviceId` elegido.
5. iOS Safari solo expone la cámara principal por `facingMode` — el flujo debe degradar sin error (ya lo hace; añadir test).

**Criterio de aceptación:** en un Android con lentes ultra-wide/main/tele, la apertura inicial encuadra con la main; el botón de cambio cicla; el `videoWidth×videoHeight` del track es el máximo soportado (mostrarlo temporalmente en un chip debug `DEBUG RES` desactivable).

---

### 2.2 — El torch (flash) no funciona [D-02 · ALTA · CONFIRMADO — falla en silencio]

**Evidencia** — `PantallaCaptura.tsx:267-277`:
```ts
track.applyConstraints({ advanced: [{ torch: nuevo }] })
  .then(() => setTorch(nuevo))
  .catch(() => undefined);   // ← fallo 100% silencioso
```
- El botón **existe y está cableado** (`:598-608`) pero: (a) no consulta `track.getCapabilities().torch`, así que se muestra aunque el dispositivo/track no lo soporte; (b) el `catch` vacío devuelve el botón a su estado sin ningún feedback; (c) `setTorch` **no se resetea en `iniciar()`** (`:155-161` resetea estado/qr/calidad pero no torch) → tras reiniciar la cámara el estado queda desincronizado (`true` en UI, LED apagado); (d) en el iframe de la demo de GitHub Pages el permiso de cámara ni siquiera se puede conceder (no hay `allow="camera"`), de donde el operador concluye "torch no implementado".

**Fix especificado:**
1. Al activar la cámara: `const caps = track.getCapabilities?.() ?? {}` → `setTorchSoportado(Boolean(caps.torch))`. Si no hay soporte, renderizar el botón deshabilitado con `title="FLASH NO SOPORTADO EN ESTE DISPOSITIVO"` (no ocultarlo: el operador no debe adivinar).
2. `toggleTorch`: en `.catch` → `setTorch(false)` + aviso breve (`errorLocal("EL FLASH NO ESTÁ DISPONIBLE")` 2s).
3. En `iniciar()`: `setTorch(false)` y apagar el torch del track viejo antes de `detener()` si estaba encendido.
4. Añadir `allow="camera"`-equivalente en el embed de demo (ver 2.5, punto 4) y documentation: torch requiere HTTPS + dispositivo físico.

**Criterio de aceptación:** en un dispositivo con flash el LED enciende/apaga con feedback visual del botón; en uno sin flash el botón aparece deshabilitado con tooltip; tras salir y reentrar a captura el estado no queda "pegado".

---

### 2.3 — "Aplica filtros pero no aplica el recorte" [D-03 · CRÍTICA · CONFIRMADO — falla silenciosa por diseño incompleto]

**Evidencia (cadena completa):**
1. `DigitalizadorApp.tsx:736-758` (`onCaptura`): la captura entrega el **frame completo** (F-RES-PRIORITY) y abre Revisión al instante; el recorte aterriza en segundo plano (`procesarYAnalizar`, `:710-734`).
2. `DigitalizadorApp.tsx:720-723`:
```ts
} catch {
  // Respaldo honesto: la imagen provisional ya está en pantalla
  // y el flujo de análisis continúa con ella.
}
```
   → si el pipeline falla, **no hay ninguna señal visible**: el banner "AJUSTANDO RECORTE AUTOMÁTICO…" (`PantallaRevision.tsx:167-180`) desaparece y la imagen queda sin recortar. **Cero feedback de fallo.**
3. `public/e14/deteccion-worker.js:538-556` (`procesarCaptura` del worker): cuando `quad === null` (detección fallida) **el pipeline igual aplica el B/N adaptativo al frame completo** (`bnAdaptativo`, `:449-487`) sin recorte. Resultado exacto del síntoma del operador: *foto filtrada en B/N de toda la escena (mesa, manos, fondo) sin recorte del acta*.
4. Causas frecuentes de detección fallida en el worker:
   - `franjasSonBordePapel` (`:230-266`): exige fondo más oscuro fuera del papel; en escaneos/fotos cerradas el formulario llena el frame → todas las líneas son "internas" → devuelve null (comentario `:138`: *"En escaneos… sin recorte: frame completo"*). Es decir, **hay un caso esperado en el que no recorta y no se distingue del caso error**.
   - `validarQuad` (`:368`): exige área ≥ 12% del frame; una E-14 fotografiada de lejos no lo cumple.
   - Las proyecciones por filas/columnas (`:82-130`) asumen el acta aproximadamente axial; un acta en vertical con cámara en horizontal (o rotada ±30°+) no detecta.
5. **No existe editor manual de recorte.** El botón "RECORTAR" de Revisión es un botón falso (ver D-04). El editor de esquinas quedó propuesto (A-3, "editor manual de esquinas 8 handles") y nunca se implementó.

**Fix especificado (rol A + rol C de UI):**
1. **Contrato**: añadir a `CapturaProcesada` (`src/lib/types.ts`) los campos `recorteAplicado: boolean; fullFrame: boolean; quad: QuadNormalizado | null`. El worker ya devuelve el quad; propagarlo. `fullFrame=true` solo cuando la detección concluya "el acta llena el frame" (nuevo chequeo: si el mejor quad candidato cubre >85% del frame, tratarlo como éxito con recorte trivial, no como fallo).
2. **Feedback visible**: en `PantallaRevision`, si `!recorteAplicado && !fullFrame` tras aterrizar el pipeline → banda ámbar nueva: "⚠️ RECORTE AUTOMÁTICO NO APLICADO — AJUSTE LAS ESQUINAS O REPITA LA FOTO" con botón primario **AJUSTAR RECORTE**.
3. **Editor de esquinas (el A-3 pendiente)**: overlay sobre la imagen con 4 esquinas arrastrables (targets ≥44px, magnificador lupa de 80px junto al dedo), quad inicial = `quad` del pipeline o el 90% interior del frame; al confirmar, re-ejecutar `procesarEnWorker(imagenOriginal, w, h, quadManual, cap)` y reemplazar la imagen (mismo camino que F-DEFER-CROP). Conservar la imagen original sin comprimir en memoria mientras dure la revisión (hoy `procesarYAnalizar` descarta el dataUrl original tras comprimir — guardarlo en un ref).
4. **Robustez del detector** (worker): añadir segundo método de respaldo — contorno mayor: binarización Otsu → trazado de contorno externo más grande → aproximación poligonal (Douglas-Peucker, ε≈2% del perímetro) → cuadrilátero convexo con ángulos 70–110°. Si el método de proyecciones falla, intentar el de contornos; devolver el de mayor área validada. Relajar `validarQuad` a área ≥7% cuando haya contraste papel↔fondo verificado.
5. **Calidad de entrega**: `OBJETIVO_BYTES = 220_000` con suelo de calidad 0.6 (`pipeline.ts:33,83-89`) es agresivo para un documento legal con tipografía pequeña; subir suelo a 0.72 y objetivo a 300 KB (el texto manda — su propia "regla sagrada").
6. Corregir D-04 (botón falso) para que "RECORTAR" abra este editor.

**Criterio de aceptación:** foto con acta ocupando ~30% del frame → recortada y warpeada; foto con acta llena → marcada `fullFrame` sin banner de error; foto imposible → aviso visible + editor usable que produce acta recortada; el flujo nunca deja una imagen sin recortar **sin aviso**.

---

### 2.4 — No se puede navegar/ver las actas ya digitalizadas [D-05 · CRÍTICA · CONFIRMADO — los datos YA existen, falta la vista]

**Evidencia:**
- Pestaña ACTAS = `PantallaControl`: es un **checklist de cobertura** de mesas (chips P1/P2 ✓/⚠️/⏳ desde bootstrap, `PantallaControl.tsx:75-99`), no una galería de lo enviado.
- Pestaña RESUMEN = `PantallaResumen`: el historial "ÚLTIMOS ENVÍOS" guarda **solo metadata** (mesa/tipo/página/hora/origen/score/estado — `EnvioHistorial` en `shared.ts:83-91`, **sin imagen**), limitado a 12 items (`.slice(0, 12)`, `DigitalizadorApp.tsx:413-426`), items `<div>` **no clickeables** (`PantallaResumen.tsx:154`), y las `stats` que recibe ni siquiera se renderizan (`:57`).
- **El dato clave:** las imágenes de las actas ingeridas **YA se persisten** en IndexedDB store `"hojas"` con su dataURL completo (`demo-store.ts:1053-1057`, `idb.ts:22-27`), y las ranuras del guard en localStorage — **pero ningún componente las lee para mostrarlas**. La feature que pide el operador es una vista sobre datos que ya están en disco.

**Fix especificado:**
1. Nueva pantalla **"GALERÍA"** (cuarta pestaña en `BottomNav`, icono `Images`, o acción "VER ACTAS" en Resumen): lista anti-cronológica con miniatura (dataURL → `object-fit: cover`, 64×88), código de mesa, tipo/página, hora, badge de estado (VALIDADO/ANOMALÍA/EN_COLA/OFFLINE) y score. Fuente de datos: nuevo store IndexedDB `actas-sesion` (id, dataUrl miniatura comprimida a ~480px, dataUrl completo bajo demanda, estado, meta) escrito en `registrarEnvio` y en `confirmarRanura`; la cola offline (`"hojas"`) se lista en su propia sección "EN COLA (OFFLINE)" con acción de descarte.
2. Tap en un item → **visor a pantalla completa** con pinch-zoom (o botones +/-), metadata completa, y acciones: *RE-ENVIAR* (solo EN_COLA/OFFLINE), *ABRIR CONTINGENCIA CON ESTA FOTO*, *ELIMINAR LOCAL* (con confirmación).
3. Persistir `stats` e `historial` (hoy `useState` en memoria — `DigitalizadorApp.tsx:151-160`, se pierden al recargar) en el mismo store; al abrir la app, hidratar.
4. Capacidad: paginar/virtualizar a 50 items por página; las miniaturas se generan una vez y se cachean.
5. Accesibilidad: lista con `role="list"`, botones con `aria-label` "Ver acta mesa 003 página 1".

**Criterio de aceptación:** enviar 3 actas → aparecen en GALERÍA con miniatura legible; cerrar y reabrir la app → siguen ahí; una acta en cola offline se ve, se previsualiza y se puede descartar; ninguna acción rompe el guard de ranuras.

---

### 2.5 — "Todo se ve mini / los botones son gigantes / debería ser pantalla completa" [D-06 · CRÍTICA · CONFIRMADO — la app es una maqueta emulada]

**Evidencia:**
- `PhoneFrame.tsx:24-34`: el digitalizador entero vive dentro de `w-[390px] max-w-full h-[800px] max-h-[87vh] border-[10px]` con **notch, barra de estado, wifi y home-indicator FALSOS** (`:36-64`). Sobre el marco hay un botón "VOLVER AL PANEL DEL SUPERVISOR" y el rótulo "SIMULACIÓN PWA DIGITALIZADOR · SIN CONTRASEÑA…" (`DigitalizadorApp.tsx:1005-1023`).
- Entrada desde el supervisor = **swap de componente, no ruta** (`src/app/page.tsx:55` estado `AppMode`, render condicional `:307-314`). No existe `requestFullscreen` en todo `src/` ni ruta `/pwa`, ni `manifest.webmanifest`, ni service worker (grep verificado). En un teléfono real se abre la misma `/`: un teléfono dentro del teléfono, con ~120px verticales de chrome falso y botones diseñados para verse "grandes" dentro de la maqueta.
- `layout.tsx:40-44`: viewport sin `viewportFit=cover`; 0 matches de `env(safe-area-inset-*)` en `src/` → en iOS standalone el home-indicator real taparía la BottomNav.
- El reloj del marco es siempre "Europe/Rome" (`PhoneFrame.tsx:42`) y la zona horaria del historial también (`DigitalizadorApp.tsx:416`, `PantallaResumen.tsx:68`) — horas erróneas para consulados fuera de Italia.

**Fix especificado (doble modo):**
1. **Modo dispositivo real (nuevo):** detectar contexto real (`matchMedia("(pointer: coarse)")` + ancho < 768, o query param `?pwa=1`) → renderizar `DigitalizadorApp` **a viewport completo** (`h-[100dvh] w-full`), sin PhoneFrame, sin notch falso, sin botón de supervisor; top bar propia con `padding-top: env(safe-area-inset-top)` y BottomNav con `padding-bottom: env(safe-area-inset-bottom)`. Añadir `viewportFit: "cover"` al meta (`layout.tsx`) y `100dvh` en lugar de `vh` para el teclado móvil.
2. **Botón PANTALLA COMPLETA** en modo simulación de escritorio: `document.documentElement.requestFullscreen()` + oculta el marco (para demo en proyector/portátil).
3. **PWA instalable real**: `public/manifest.webmanifest` (name, `display: "standalone"`, `orientation: "portrait"`, iconos 192/512 maskable, `theme_color` del tema), `<link rel="manifest">` en `layout.tsx`, y service worker mínimo (cache-first del shell + runtime-cache de `/api/bootstrap`) — sinSW complejo: el flujo offline de actas ya existe por IndexedDB.
4. En el embed de la demo (iframe de Pages dentro del panel), añadir `allow="camera; fullscreen"` al iframe y el botón "Abrir en pestaña nueva" ya previsto (`PantallaCaptura.tsx:540-542` menciona el iframe) — sin esto ni cámara ni fullscreen funcionan dentro del preview.
5. Zona horaria: derivar del consulado seleccionado (añadir `tz` al dato de consulado en bootstrap; mapeo país→IANA) con fallback `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**Criterio de aceptación:** en un móvil real a `/` (o `/pwa`), la cámara ocupa todo el viewport, la BottomNav respeta la home-indicator, no hay marco falso ni rótulo de simulación; en escritorio la maqueta sigue funcionando para la demo del supervisor; Lighthouse PWA instalable en el deploy de Pages.

---

### 2.6 — Arranca precargado con "roma consulado" en vez de en blanco [D-07 · CRÍTICA · CONFIRMADO — 3 capas de hardcode]

**Evidencia (las tres capas):**
1. **Orden del seed** — `prisma/seed.ts:352-362`: el sort pone explícitamente `/^ROMA - CONSULADO$/i` primero (`orden=1`), así que Roma es el registro #1 en BD y en `/api/bootstrap` (verificado en `public/data/bootstrap.json[0]`).
2. **Preferencia hardcodeada en el componente** — `DigitalizadorApp.tsx:335-347`:
```ts
const roma = json.consulados?.find(
  (c) => /ROMA - CONSULADO$/i.test(c.puesto) && c.numMesas >= 8
) ?? null;
const id = prev?.id ?? roma?.id ?? json.consulados?.[0]?.id;
```
   → aunque cambiara el orden, Roma seguiría siendo el default.
3. **Texto de carga fijo** — `DigitalizadorApp.tsx:1053`: `"CARGANDO PUESTO · CONSULADO ROMA..."` (miente durante la carga).
4. En modo demo, además, `demoAnalizarActa` (`demo-store.ts:771-784`) devuelve siempre DIVIPOL de Roma, y el fallback de nombres del verificador puede sesgar cualquier acta a Roma (ver B-05).

**Fix especificado (decisión de producto incluida):**
1. `cargarBootstrap` **no debe seleccionar nada**: `setConsulado(null)`. El estado inicial del digitalizador es **PANTALLA DE SELECCIÓN DE PUESTO**: buscador (input que filtra por país/ciudad/puesto sobre los 949), lista con numMesas, y el puesto elegido se persiste en `localStorage("digielect-puesto-v1")` (con botón "CAMBIAR PUESTO" en PantallaControl/Resumen). Justificación operativa: cada digitalizador consular tiene UN puesto físico fijo; el acta misma (QR/OCR/barcode→identificador + contingencia) ya asigna la ubicación exacta por captura — el puesto solo sirve de contexto y para el checklist.
2. Eliminar la regex de Roma y el texto de carga ("CARGANDO DATOS DEL PUESTO…").
3. Si se quiere conservar Roma como default de la **demo** de Pages, hacerlo explícito y solo-demo: `const esDemo = process.env.NEXT_PUBLIC_DEMO === "1"` + query `?demo=roma`, nunca en el flujo normal.
4. Bajar el sesgo Roma de `verificar-acta.ts` (B-05) y de `demoAnalizarActa` (etiquetar "DEMO: DIVIPOL SIMULADO (ROMA)" ya existe en observaciones — mantener).

**Criterio de aceptación:** primera apertura → selector de puesto en blanco (nada precargado); elegir "EL CAIRO · Mesa…" → persiste entre recargas; una captura con QR de otra mesa asigna ESA mesa para ese envío sin cambiar el puesto; no aparece la palabra "ROMA" en ningún texto por defecto.

---

### 2.7 — "Operación muy incómoda" en general [D-08 · síntesis UX]

Causas verificadas (detalle en §4): CTAs bajo el fold en Revisión (`PantallaRevision.tsx:132,436,472-569`), scroll invisible (`no-scrollbar`), sin pinch-zoom en ninguna vista previa (crítico para verificar un documento), chips táctiles de 20-24px, textos 9-11px en MAYÚSUCULAS SOSTENIDAS, imagen rechazada con blur inspeccionable (`:451-453`), preview de contingencia de 144px tenue (`PantallaContingencia.tsx:142-147`), teclado nativo que puede tapar el CONFIRMAR (sin `visualViewport`), doble-tap zoom y pull-to-refresh que pierde la sesión (sin `overscroll-behavior`), input de 14px que dispara zoom en iOS (`PanelIdentificacion.tsx:368`). El fix estructural es 2.5 + el pack de micro-UX de §4.2.

---

## 3. BUGS ADICIONALES DESCUBIERTOS (no reportados por el operador)

### 3.1 CRÍTICOS (rompen el flujo o la integridad en producción)

| ID | Bug | Evidencia | Fix |
|----|-----|-----------|-----|
| **D-04** | **Botón "RECORTAR" es falso: ejecuta `onReintentarFoto`** (repite la foto y **quema un reintento RN-03**; 2 taps = envío de emergencia habilitado sin fallo real) | `PantallaRevision.tsx:490-497` → `DigitalizadorApp.tsx:825-843` | Cablearlo al editor de esquinas (fix 2.3); jamás a reintentos |
| **D-09** | **Chips P1/P2 de la pestaña ACTAS capturan la mesa equivocada o nada**: llaman `onCapturar(tipo)` sin mesa; `PantallaControl` recibe `onSelectMesa` pero **nunca lo llama**; `irACaptura` resuelve mesa desde `mesaSel` global (null → return silencioso; o mesa del último QR) | `PantallaControl.tsx:86-95,63-68` + `DigitalizadorApp.tsx:787-805,1074` | Los chips deben llamar `onSelectMesa(mesa.id)` + `onCapturar(tipo)` con la mesa del propio chip; firmar `onCapturar(mesaId, tipo)` |
| **B-01** | **Ingesta sin transacción + dedupe con race condition**: `findFirst(qrFingerprint)` + `create` sin `@unique` ni `$transaction`; 4 escrituras independientes (acta/resultados/anomalía/audit) → duplicados y estados parciales bajo concurrencia | `api/actas/route.ts:88-137,142-193`; `schema.prisma:86` (solo `@@index`) | `@unique` en `qrFingerprint` + `prisma.$transaction([...])` + manejo P2002 → respuesta `REEMPLAZADO/DUPLICADO` coherente |
| **B-02** | **Backend ignora `reemplazoDe`**: la PWA lo envía para reemplazos legítimos del guard, pero `/api/actas` nunca lo lee → en modo completo todo REEMPLAZAR choca con "QR DUPLICADO" | declarado en `integracion-captura.ts:620-627`; ignorado en `api/actas/route.ts` | Leer `reemplazoDe`, verificar huella, archivar el acta anterior y crear la nueva en la misma transacción |
| **D-10** | **Contingencia por ubicación: `tipoEjemplar="DELEGADOS"` y `pagina=1` hardcodeados** → es imposible cargar manualmente una PÁGINA 2 o un ejemplar TRANSMISIÓN | `PantallaContingencia.tsx:85-86` | Añadir segmented control TIPO (DELEGADOS/TRANSMISIÓN) + PÁGINA (1/2) al formulario |
| **B-03** | **`export-static-data.ts` doble escritura incompatibles**: `exportarIndiceActas()` escribe `{generado,total,actas:[…]}` y `main()` lo **sobrescribe con un array plano** → regenerar la demo rompería `parsearIndiceRemoto` (exige `{actas:[…]}`) | `scripts/export-static-data.ts:89-104` vs `:199-232`; parser en `indice-actas-remota.ts:64-99` | Unificar formato (compacto); regenerar y validar 3.670 filas + `bun run demo:export` E2E |

### 3.2 ALTOS

| ID | Bug | Evidencia | Fix |
|----|-----|-----------|-----|
| **D-11** | Banner "**REINTENTANDO EN SEGUNDO PLANO**" es falso para el análisis: el `catch` no reintentan nada | `DigitalizadorApp.tsx:81,606-607` | Reintentar con backoff (3 intentos) o cambiar el texto a "ANÁLISIS FALLIDO · REINTENTE" |
| **D-12** | **Envío manual (contingencia) no encola en offline si falla la red** → el dato digitado a mano se pierde (hay que re-digitarlo todo) | `DigitalizadorApp.tsx:874-882` vs `encolarFallo` solo en `enviarActa:494` | Encolar `enviarManual` en IndexedDB con `datosManuales` completos |
| **D-13** | `rotarImagen90`: re-encode JPEG acumulativo (degrada cada rotación), pierde EXIF, falla en silencio, solo 90° horario, solo disponible en banda ámbar | `shared.ts:268-292`; `PantallaRevision.tsx:474-498` | Rotar solo el quad/ángulo y re-procesar desde el original; soportar ±90°; disponible siempre que haya imagen |
| **D-14** | Carrera de doble captura: `onCaptura` sin token de generación → dos `procesarYAnalizar` solapados; la captura vieja pisa imagen/senales/analisis de la nueva | `DigitalizadorApp.tsx:736-758` | Token incremental (patrón ya usado en la cámara `iniciarTokenRef`); ignorar resultados de tokens viejos |
| **D-15** | Ranuras del guard persistidas sin UI de gestión: tras recargar, una recaptura cae en "DUPLICADO · CAPTURA DESCARTADA" **sin forma de ver/resolver el bloqueo** (dead-end; solo REINICIAR DEMO limpia) | `integracion-captura.ts:238` (localStorage); `PanelIdentificacion.tsx:334-338` | Pantalla/hoja "RANURAS OCUPADAS" con lista y acción "DESCARTAR RANURA" (guardada por huella) |
| **S-01** | **Filtro PUESTO del Monitor roto**: inicia `"Todos"` pero la option vale `"Todas"` y el filtro compara con `"Todos"` → select arranca en blanco y elegir "Todas" **vacía la tabla** | `MonitorGlobal.tsx:130,198,350` | Unificar literal; test de humo de filtros |
| **S-02** | **"CERRAR SESIÓN" del Sidebar no cierra sesión** (solo `alert`) | `Sidebar.tsx:147-155` | Cablear al logout real (`page.tsx:360-370`) |
| **S-03** | **Modal de auditoría se cierra incluso si la API falla** (finally) → se pierde la justificación escrita; errores con `alert()` existiendo toasts montados sin uso | `page.tsx:249-260`; `layout.tsx:57` | Cerrar solo en éxito; migrar a `use-toast`/sonner |
| **S-04** | **Acceso al digitalizador imposible en móvil**: botón Header `hidden md:flex`, Sidebar `hidden lg:flex`, y el menú móvil no incluye la entrada | `Header.tsx:71`, `Sidebar.tsx:103` | Añadir entrada al Sheet móvil |
| **S-05** | Identidad de sesión falsa "ADM-9482 · SIG-04" hardcodeada en Header, informes, backend y audit events (RNF-03 de trazabilidad roto) | `Header.tsx:93-99`; `GenerarInformes.tsx:352,829`; `api/batch/route.ts:41,89,167`; `anomalias/resolver/route.ts:79` | Usar `authUsuario`; registrar el usuario real |
| **B-04** | **Login no timing-safe + credenciales default en cliente y README + sesión localStorage falsificable + NINGUNA ruta de mutación exige auth** | `auth/login/route.ts:11-12,28-31`; `api-client.ts:257-282`; `auth-store.ts:8-38` | Ver §4.4 (FASE 5) |
| **B-05** | Fallback de nombres con token "CONSULADO" matchea **cualquier** acta al primer consulado (Roma) con confianza 0.7 y origen "VLM" | `verificar-acta.ts:139-148` | Excluir stopwords del encabezado ("CONSULADO", "MESA", números); exigir token distintivo de ciudad |
| **B-06** | Ancla "CONSUL" en `votoDeTexto` marca DELEGADOS por el "CONSULADO" del encabezado → conflicto falso en TRANSMISIÓN con OCR real → anomalía sistemática en BATCH | `identificacion-acta.ts:514-530` | Anclar al banner completo ("CÓNSUL/EMBAJADOR… VOTAN") y a la sección de firmas, no a substring suelto |
| **B-07** | **Barcodes del seed inválidos** para `parseBarcode15` (padStart no recorta 7 dígitos; slice(0,15) desplaza campos: tipoDigito="6", totalPaginas=10) | `seed.ts:507-508` — verificado programáticamente | Generar barcode15 correcto (71+kit+2010+102…) y validar con `parseBarcode15` en el seed |
| **S-06** | `next.config.ts`: `typescript.ignoreBuildErrors: true` (oculta errores reales — hay 1 vivo: `DigitalizadorApp.tsx:696` TS18047) y `reactStrictMode: false` | `next.config.ts:34-37` | `false`/`true` respectivamente; corregir el TS vivo |

### 3.3 MEDIOS (selección — lista completa operativa en §6 por fase)

- **D-16** Stats/historial solo en memoria (se pierden al recargar) — `DigitalizadorApp.tsx:151-160`.
- **D-17** PantallaExito sin imagen del acta enviada y frame vacío si `ctx` null — `PantallaExito.tsx:100-118`.
- **D-18** "SIN DATOS DEL PUESTO" sin botón reintentar — `DigitalizadorApp.tsx:1056-1065`.
- **D-19** Input código X a 14px dispara zoom iOS — `PanelIdentificacion.tsx:368` (usar 16px).
- **D-20** Ayuda obsoleta "OCR REAL: PENDIENTE (ROL A)" — `PanelIdentificacion.tsx:386-391`.
- **D-21** Panel identificador operativo en banda roja donde se dice que el envío está deshabilitado — `PantallaRevision.tsx:297-298 vs 411-420`.
- **D-22** Re-render global a 1 Hz por el reloj (re-renderiza Revisión con imagen grande) — `DigitalizadorApp.tsx:213-216` → reloj aislado en componente memo.
- **D-23** Tesseract/heic2any desde CDN público en jornada (contradice contingencia offline) — `ocr-local.ts:25-26`, `heic.ts:14-15` → vendorizar en `/public/vendor` + cachear en el SW.
- **S-07** Tablas con `min-w-[1100px]` siempre con scroll horizontal; `text-[8px]/[9px]` ilegibles — `MonitorGlobal.tsx:464,517,596,606`; `SaludSistema.tsx:246`.
- **S-08** Botón 👁 habilitado sin mesas → abre auditoría con fallback `mesa-roma-001` hardcodeado — `MonitorGlobal.tsx:683-690`; `page.tsx:205-206`.
- **S-09** Modales hand-rolled sin focus trap ni bloqueo de scroll; handler Escape duplicado ×4 — `ReinspectionModal.tsx:217-223` y otros 3.
- **S-10** "SLA ENGINE EN VIVO (30s)" y corte 16:55 UTC son texto fijo (no hay polling) — `CentroNotificaciones.tsx:251,421-422`.
- **S-11** Datos de teatro sin marca: progreso BATCH congelado al 65%, "servidor OCR 850MB/s" fijo, fila "88 · CONSULADOS 3670/3670" inyectada en informe "oficial" — `CargaMasiva.tsx:364-368,473-495`; `GenerarInformes.tsx:479-487`.
- **B-08** `imagenBase64` sin límite de tamaño ni validación MIME (persistida íntegra en SQLite; VLM sin rate-limit, costo abierto) — `api/actas/route.ts:29,116-128`.
- **B-09** Redirect de imagen hardcodeado a `http://localhost:3000` — `api/actas/[id]/imagen/route.ts:42-46`.
- **B-10** `modoManual:true` fuerza VALIDADO sin verificación server-side — `api/actas/route.ts:83-84`.
- **B-11** `mesaIdRef` no replica sufijo `-diario` del seed para puestos "SEDE DÍA" — `monitor.ts:156` vs `seed.ts:408`.
- **B-12** Pérdida silenciosa en demo: `guardarEstado` traga QuotaExceeded; `void idbPut("hojas")` ignora fallos (acta registrada sin imagen) — `demo-store.ts:150-157,1055`.
- **B-13** Bootstrap ~1.2MB (949 consulados + 3.670 mesas + 14.680 actas) recalculado cada 8s y re-servido completo; sin virtualización en MonitorGlobal — `monitor.ts:127-137`; `MonitorGlobal.tsx:195-203`.
- **B-14** Códigos de anomalía fuera de la unión `CodigoAnomaliaId` (`ID_RECHAZO_RN`, `ID_ERROR_PROCESAMIENTO`, `ID_RN03_EMERGENCIA`) — `batch.ts:437,468,483,527`.
- **B-15** Guard de ranuras inoperante en BATCH (`construirRegistroExistente` stub) — `batch.ts:565-571`.

---

## 4. RECOMENDACIONES DE ARQUITECTURA, CÓDIGO Y VISUAL

### 4.1 Arquitectura
1. **Ruta real para la PWA** (`A-01`): aunque la demo usa una sola página por decisión propia, el flujo operativo merece `src/app/pwa/page.tsx` que monte `DigitalizadorApp` en modo dispositivo (misma APK mental, cero riesgo para la demo). Alternativa mínima: query `?pwa=1` consumida en `page.tsx`.
2. **Estado del digitalizador con zustand** (ya instalado y sin usar): `PantallaRevision` recibe **20 props** (`DigitalizadorApp.tsx:1093-1119`) — un store `useDigitalizadorStore` elimina el drilling y facilita la persistencia de sesión (D-16) y la galería (2.4).
3. **Contrato `CapturaProcesada` extendido** (`A-02`): `recorteAplicado/fullFrame/quad` (ver 2.3) — es la pieza que falta para que el operador confíe en el pipeline.
4. **Extraer el reloj** (`D-22`) y aislar los componentes pesados con `React.memo` + `useMemo` de derivados; el re-render 1Hz de todo el árbol es gratis en escritorio y caro en un teléfono de gama baja con imagen grande en pantalla.
5. **tailwind.config.ts es código muerto** (`A-03`): el proyecto usa Tailwind v4 con `@import "tailwindcss"` y `@theme inline` en `globals.css`; el config v3 (darkMode, colores hsl, plugin animate) no se carga. Eliminarlo o migrarlo a `@config` — hoy engaña a cualquier agente que intente personalizar el tema ahí.
6. **Sistema tipográfico en rem** (`A-04`): todos los tokens están en px fijos (`globals.css:176-202`), base body 12px mono global (`:231-238`) — convertir tokens a `rem` y subir base del digitalizador a 14px respeta el zoom del usuario y la accesibilidad.

### 4.2 Pack micro-UX del digitalizador (aplicar en FASE 2/3)
1. CTA fijo inferior en Revisión (sticky action bar) — hoy los botones quedan bajo el fold en pantallas ≤700px.
2. Indicador de scroll (quitar `no-scrollbar` de contenedores largos o añadir fade + "▲/▼ hay más contenido").
3. Pinch-zoom/tap-para-ampliar en TODAS las vistas de imagen (Revisión, Éxito, Contingencia, futura Galería).
4. `overscroll-behavior: contain` en el contenedor raíz (evita pull-to-refresh que pierde sesión) y `touch-action: manipulation` global (mata el doble-tap zoom).
5. Inputs a 16px mínimo (iOS no hace zoom) + `inputMode` correcto + `visualViewport` para que el teclado no tape CONFIRMAR.
6. Targets ≥44×44px: chips P1/P2 (~24px), chips REVISAR/VER (~20-24px), back arrow (38px).
7. Imagen rechazada SIN blur (el operador debe poder ver qué se le rechaza) — mantener overlay explicativo, no ocultar el documento (`PantallaRevision.tsx:451-453`).
8. Texto: reducir MAYÚSCULAS SOSTENIDAS a etiquetas cortas; mensajes largos en sentence-case.
9. Estados online honestos: "EN LÍNEA"/"ONLINE" fijos → `navigator.onLine` + listeners `online/offline` (`PantallaControl.tsx:116-119`, `Header.tsx:81-86`).
10. Hardcodes fuera: "EN LÍNEA", "ID: #A92-F" (`PantallaControl.tsx:114-119`), wifi/batería falsos del marco, "Europe/Rome".

### 4.3 Visual del supervisor (Fase 4)
- Unificar tokens: hex crudos (`#410004`, `#003912`, `#242E2E`…) y paleta Tailwind cruda (`teal-400`, `orange-500`) fuera del sistema → tokens del `@theme`.
- Radios consistentes (`rounded-sm` estándar vs `md/xl/full` dispersos), padding inferior uniforme (`pb-16` vs `pb-8`), z-index jerárquico (toasts y 4 modales comparten `z-50`).
- Botones top-bar de 24px de alto → 36-44px; eliminar `text-[8px]`.
- Botones muertos: perfil sin onClick (`Header.tsx:97-102`), `onToggleMobileMenu` sin uso (`Header.tsx:17`).

### 4.4 Seguridad y endurecimiento (Fase 5)
1. Auth real: sesión firmada (cookie httpOnly + token) para rutas de mutación; `crypto.timingSafeEqual` en login; sin defaults en cliente; rate-limit básico por IP en `/api/actas/analizar` (costo VLM) y `/api/auth/login`.
2. Límite de payload (p.ej. 6 MB) + validación de data-URL/MIME en `imagenBase64`; sanity-check de dimensiones.
3. `modoManual` no debe auto-VALIDAR en servidor: marcar `PENDIENTE_REVISION` salvo rol autorizado.
4. Corregir redirect localhost (B-09) y limpiar `GET /api` "Hello, world!" (`api/route.ts:3-5`).
5. Documentar privacidad: las imágenes de actas van al VLM externo — decisión soberana a explicitar (o modo local-only con OCR determinista, ya viable).

---

## 5. CONTEXTO PARA LOS AGENTES (por qué el código está así)

Leído del `worklog.md` del repo (122 KB) y `docs/agentes/`:
- Los roles A (escáner), B (supervisor) y C (identificador) trabajaron en paralelo con convenios de exclusividad; los merges los conciliaron los orquestadores C-x.
- **Lo que el operador reporta ya estaba diagnosticado a medias**: "Pendiente A-2 (propuesto): selección de lente con sondas secuenciales v2…, editor manual de esquinas (8 handles)…"; "cámara del PWA en dispositivo real (fix reportado por el humano, sigue abierto)"; "Pendiente que hereda la ronda: OCR real de la zona X (hecho después), cámara del PWA…". **Nada de esto se implementó** — este reporte convierte esos pendientes en especificaciones cerradas (§2.1, §2.3).
- La "simulación PWA" dentro del supervisor fue una decisión de demo para GitHub Pages, no un bug puntual: por eso el fix (2.5) es un doble modo, no un ajuste de CSS.
- El flujo determinista (código X + barcode + encabezado + guard de ranuras, 42/42 checks) es la joya del proyecto: **no tocar `identificacion-acta.ts` salvo B-06 y stopwords de B-05**, con batería de checks re-ejecutada tras cualquier cambio.

---

## 6. PLAN DE IMPLEMENTACIÓN POR FASES (para agentes)

> Regla transversal: cada fase termina con `bunx tsc --noEmit` ✅ · `bun run lint` ✅ · `bun run build:static` ✅ · E2E manual de los criterios de aceptación de la fase · entrada en `worklog.md` con los IDs de bug tocados.

### FASE 0 — Hotfixes operativos (los 7 del humano) · *roles A + C*
| # | Tarea | Bugs | Esfuerzo |
|---|-------|------|----------|
| 0.1 | Sondas de lente + selector de cámara | D-01 | M (medio día) |
| 0.2 | Torch con capabilities + feedback + reset | D-02 | S |
| 0.3 | Contrato recorte + feedback de fallo + editor de esquinas + robustez worker + botón RECORTAR real | D-03, D-04 | L (1-2 días) |
| 0.4 | Selector de puesto en blanco + persistencia + quitar Roma default/texto | D-07 | M |
| 0.5 | Modo dispositivo real (fullscreen, safe-areas, sin PhoneFrame) + botón fullscreen + manifest básico | D-06 | M |
| 0.6 | Chips P1/P2 con mesa correcta | D-09 | S |
| 0.7 | Galería v1 (lista + visor + cola offline visible) + persistencia de stats/historial | D-05, D-16 | M |
| 0.8 | Contingencia: selector tipo/página + encolado offline de manual | D-10, D-12 | S |

### FASE 1 — Integridad de datos · *rol B*
| # | Tarea | Bugs |
|---|-------|------|
| 1.1 | `$transaction` + `@unique(qrFingerprint)` + P2002 handling | B-01 |
| 1.2 | Adoptar `reemplazoDe` en `/api/actas` | B-02 |
| 1.3 | Regenerar datos estáticos con formato único + validación | B-03 |
| 1.4 | Seed con barcode15 válidos | B-07 |
| 1.5 | Límite/validación de `imagenBase64`; redirect imagen; limpiar `GET /api` | B-08, B-09 |
| 1.6 | Stopwords en verificación (CONSULADO) + ancla CONSUL correcta + re-run 42 checks | B-05, B-06 |

### FASE 2 — PWA real y captura de calidad · *rol A*
| # | Tarea | Bugs |
|---|-------|------|
| 2.1 | Ruta `/pwa` + manifest + SW mínimo + viewportFit/safe-areas + doble modo | A-01, D-06 |
| 2.2 | Micro-UX pack (§4.2 completo) | D-19, D-20, D-21 |
| 2.3 | Token anti-carrera de captura; reloj aislado/memo | D-14, D-22 |
| 2.4 | Rotación desde original; recaptura sin quemar reintento cuando no hubo envío | D-13 |
| 2.5 | Vendorizar Tesseract/heic2any + cache SW | D-23 |
| 2.6 | Editor de ranuras (ver/descartar) | D-15 |

### FASE 3 — Galería y sesión completa · *rol C*
| # | Tarea |
|---|-------|
| 3.1 | Store `actas-sesion` + GALERÍA completa (filtros, visor, reenvío, eliminación) |
| 3.2 | PantallaExito con imagen; reintentar bootstrap; estados online reales |
| 3.3 | Resumen real del turno (stats que hoy no se muestran) |

### FASE 4 — Supervisor QA/estética · *rol B*
| # | Tarea | Bugs |
|---|-------|------|
| 4.1 | Filtros correctos + estados completos (INCOMPLETO) | S-01 |
| 4.2 | Logout real, modal que no pierde justificación, toasts | S-02, S-03 |
| 4.3 | Entrada digitalizador en menú móvil | S-04 |
| 4.4 | Identidad de sesión real en UI/backend | S-05 |
| 4.5 | Tipografía ≥10px, tablas (virtualización o paginación), tokens unificados, radios/paddings/z-index | S-07, §4.3 |
| 4.6 | Focus trap modales + teatralidad etiquetada | S-09, S-11 |

### FASE 5 — Endurecimiento · *orquestador*
| # | Tarea | Bugs |
|---|-------|------|
| 5.1 | Auth server-side + timing-safe + rate-limit | B-04 |
| 5.2 | `ignoreBuildErrors:false` + `reactStrictMode:true` + fix TS vivo | S-06 |
| 5.3 | Limpiar tailwind.config muerto; tokens en rem | A-03, A-04 |
| 5.4 | Test del worker de detección (fixtures de fotos reales: lejos/cerca/rotada) | D-03 |
| 5.5 | Documento de privacidad VLM / modo local-only | §4.4 |

---

## 7. APÉNDICE — MAPA RÁPIDO DEL REPO
- **Digitalizador:** `src/components/digitalizador/` (7 pantallas + PhoneFrame + shared) · lógica en `src/lib/` (scanner/, e14/, integracion-captura.ts, identificacion-acta.ts) · worker en `public/e14/deteccion-worker.js`.
- **Supervisor:** `src/components/supervisor/` (12 componentes) · orquestación en `src/app/page.tsx` · datos `src/lib/monitor.ts` + `/api/*`.
- **Demo estático:** `public/data/*.json` (bootstrap 1.2 MB, indice-actas 196 KB) · `src/lib/demo-store.ts` (1.569 l) · export con `scripts/export-static-data.ts`.
- **BD:** `prisma/schema.prisma` (SQLite) · seed con datos reales de la Registraduría (949 consulados / 3.670 mesas / 14.680 actas).
- **Punto único de entrada hoy:** `src/app/page.tsx` (AppMode: supervisor | digitalizador).

*Fin del reporte — generado por auditoría estática profunda; cada afirmación es verificable con las referencias archivo:línea incluidas.*
