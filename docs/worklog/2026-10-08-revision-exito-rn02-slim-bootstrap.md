# 2026-10-08 — Digitalizador: revisión/éxito con diseño Stitch + envío directo RN-02 + arranque vacío (SLIM-BOOTSTRAP)

## Contexto

Petición del dueño del producto tras ver la PWA funcionando:

1. **Score alto → diseño del mockup + envío automático**: cuando el acta
   escaneada tiene score óptimo y el código se leyó correctamente, el
   resultado debe mostrarse con el diseño de "REVISIÓN DE ACTA"
   (documento re-dibujado con los datos en sus espacios) y el envío debe
   ser AUTOMÁTICO — la contingencia de asignación manual NO debe abrirse
   cuando la información del acta se leyó bien.
2. **Tab ACTAS vacío al inicio**: el apartado de actas debe arrancar
   vacío (mensaje invitando a escanear) y, al escanear la primera acta,
   adaptarse con la información del puesto descargando SOLO el dataset
   de ese puesto (backlog "slim bootstrap").

## Qué se hizo

### A. Envío directo RN-02 (sin contingencia con código leído)

- `PantallaRevision.tsx` — el bloque auto de la banda verde ahora envía
  SIEMPRE que `identificado` (barcode15 del OCR o identificación O(1) por
  código X), con o sin ranura dirigida:
  - Nuevo helper `resolverMesaLocal()`: resuelve la mesa EN EL
    DISPOSITIVO desde `senalesLocales.ubicacion` (código X → índice →
    consulado + mesa) contra `consulados`; null → el servidor computa la
    asignación final (cruce QR↔VLM↔tabla, OLA4-A).
  - El guard de cruce de puesto (OLA4 4.5) sigue mandando en captura
    dirigida (acta de otro puesto → contingencia).
  - La contingencia queda SOLO para: código NO identificado, cruce de
    puesto, bandas ámbar/roja y modo manual del operario.
  - El CTA de recuperación (`ctaConfirmar`) ahora ENVÍA directo
    ("ENVIAR AL SERVIDOR") en vez de abrir contingencia.
  - `estadoPill` refleja el auto-envío también en escaneo libre.

### B. Pantalla de resultado = diseño del mockup

- **Nueva `ActaDocumento.tsx`**: re-dibujo del acta E-14 como documento
  (papel blanco) con los datos leídos en cada espacio del diseño:
  encabezado REGISTRADURÍA NACIONAL + chip ACTA E-14, código de barras
  (render determinista de los dígitos), `*E14-<código>*` + `PÁG X DE Y`,
  `DEP: CONSULADOS / MUN: <país>`, `ZONA / PUESTO / MESA`, título de la
  contienda (mapa del código de elección del barcode15; solo 71 tiene
  canon documentado → "PRESIDENCIA Y VICEPRESIDENCIA"; resto cae a
  "ACTA DE ESCRUTINIO"), casillas de votos por candidato (VLM) y franja
  de jurados (trazo de firma sólo si el VLM detectó firmas — S-11:
  lo no leído se muestra "—", nunca se inventa).
- **`PantallaExito.tsx` re-escrita** con el diseño: header brand
  "REVISIÓN DE ACTA / E-14" (← + chip de nube), píldora de estado
  `✓ 9.8/10 ÓPTIMA • ENVIADO CORRECTAMENTE` (variantes ámbar EN_COLA/
  ANOMALÍA y roja RECHAZADO con "REINTENTAR ESCANEO"), título + ruta del
  acta, banner SIGUIENTE OBJETIVO (captura dirigida intacta), documento
  dentro del marco de esquinas por banda, píldora inferior del
  formulario, hora de envío y CTA grande "SEGUIR ESCANEANDO".
- **Score decimal solo-presentación** (`9.8/10`): sale de
  `edicion.calidad.score/10`; la decisión de banda/auto-envío sigue
  siendo el entero 0-10 (CONVENIOS §4). Documentado aquí para que quede
  la decisión trazada.

### C. Arranque vacío + dataset por puesto (SLIM-BOOTSTRAP)

- **Backend `/api/digitalizador/bootstrap`** — params nuevos (contrato
  sin params intacto para la export demo):
  - `?lista=1` → `{puestos: [949 puestos SIN mesas ni actas]}` (~40 KB
    por el cable, gzip).
  - `?puesto=<codigo>` → `{consulados: [1 puesto con mesas + actas],
    resumen acotado al puesto}`. Refactor interno: `actaADto()`,
    `actasVigentesPorMesa(mesaIds?)`, `resumenDe(codigo?)`.
- **`store.ts`**:
  - Nuevo estado `listaPuestos` (forma ligera `PuestoLigero`) +
    `cargarListaPuestos()` idempotente.
  - `cargarDatos()` POR DEMANDA: con puesto → `?puesto=` (consulados = 1
    puesto); sin puesto → `?lista=1` y `consulados` queda VACÍO (la PWA
    arranca vacía). Fallback demo (Pages) filtra el JSON estático.
  - `asignarPuesto()` dispara `cargarDatos()` (llena mesas/ids para el
    envío) además del dataset IndexedDB existente.
  - `liberarPuesto()` limpia `consulados/resumen` y recarga la lista.
  - Puente Opción A: la identificación resuelve el consulado contra
    `listaPuestos` (ya no depende del dataset completo).
- **`PantallaControl.tsx` (tab ACTAS)**: estado vacío "AÚN NO HAY ACTAS"
  con CTA "IR A ESCANEAR" cuando no hay puesto; se ELIMINÓ el selector
  de 949 puestos (el puesto se deriva del escaneo) y se reemplaza por
  chips + botón "CAMBIAR PUESTO" (libera → Inicio). KPIs, búsqueda de
  mesa, acordeón y detalle intactos.
- **`PantallaInicio.tsx`**: el selector Opción B usa `listaPuestos` y la
  descarga de la lista es lazy (al abrir el diálogo), con estado de
  carga y mensaje offline.

## Verificación (E2E con Agent Browser, seed real)

- Arranque vacío: tab ACTAS muestra el empty-state y `ACTAS (0)`; no se
  descarga ningún dataset de mesas al abrir la PWA.
- Flujo completo nuevo: Inicio → OPCIÓN A → PROBAR CON ACTA REAL →
  análisis VLM (11 s) → **auto-envío sin pasar por contingencia** →
  pantalla de resultado con el documento y los datos (Roma · mesa 001 ·
  DELEGADOS · P2 · ITALIA/ZONA 10/PUESTO 02/MESA 001).
- Tab ACTAS tras el primer escaneo: `ACTAS (32)` con el puesto Roma
  completo (KPIs 07 completas / 01 en proceso, acordeón de mesas,
  ranuras por estado) — descargado SOLO ese puesto.
- RESUMEN acotado: progreso del puesto 31/32 (97%).
- Rechazos del servidor vistos y renderizados con el nuevo diseño:
  RANURA YA VALIDADA (no sobrescribe), REEMPLAZO RECHAZADO · MENOR
  CALIDAD (concurrencia por ranura, empate 100/100 conserva existente)
  y Score insuficiente (≤8/10). El servidor es la autoridad final y la
  pantalla lo comunica con REINTENTAR ESCANEO.
- Gates: `bunx tsc --noEmit` 0 · `bun run lint` 0 · dev.log sin errores.

## Notas / pendientes

- El gate de export estática (`NEXT_STATIC_EXPORT=1 bun run build:static`)
  NO se corrió en este sandbox (regla del entorno: no ejecutar `next
  build`); los cambios de demo fallback están cubiertos por tsc/lint y
  el contrato sin params del bootstrap quedó intacto para el export.
- Los ítems del worklog raíz marcados hoy: "variante slim del
  digitalizador-bootstrap" → **hecha** (parcial: lista + por-puesto; el
  fallback demo sigue usando el JSON completo filtrado).
- Demo DB: para poder demostrar el éxito del auto-envío se liberó la
  ranura mesa 1 · DELEGADOS · P2 del puesto 495-10-02 (el seed la trae
  VALIDADO con datos reales ya publicados). Queda libre a propósito para
  que el usuario repita el flujo con el acta de ejemplo P2.
