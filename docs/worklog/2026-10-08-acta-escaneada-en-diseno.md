# 2026-10-08 · PWA Digitalizador: el diseño de éxito muestra EL ACTA ESCANEADA + datos deterministas del proyecto

**Agente:** Z.ai Code (sandbox)
**Alcance:** `src/components/digitalizador/PantallaExito.tsx`, `ActaDocumento.tsx`
**Base:** commit `cb13606` (overlay RECONOCIENDO + duplicado=éxito + pantalla completa)

## Pedido del usuario

> "me sigue apareciendo esta diseño sin adaptar al proyecto, deberia aparecer el acta escaneada con la informacion del acta"

Con captura adjunta (`upload/pasted_image_1791466332513.png`): la pantalla de éxito
mostraba el documento re-dibujado (maqueta) con datos — pero **sin la imagen del acta
escaneada** y con datos que NO correspondían al acta real (MUN: "EGIPTO", ZONA: "05"
cuando el pliego impreso dice PAIS: 495 - ITALIA, ZONA: 10, LUGAR: Roma - Consulado).

## Diagnóstico

1. **Faltaba la imagen**: `ActaDocumento` solo REDIBUJA el acta como maqueta; la imagen
   real escaneada (recorte + B/N que viajó al servidor) solo era visible en el visor de
   pantalla completa, no en el diseño.
2. **Prioridad de datos invertida**: `mun`/`zona`/`puesto` tomaban PRIMERO la lectura
   VLM (`analisis.divipol`), que en el acta real 495-010-02 leyó mal el encabezado
   ("EGIPTO"/zona 05). La identificación determinista (código → índice O(1) → consulado
   de la base) tenía los datos correctos y estaba como respaldo, no como fuente.

## Cambios

### 1. `ActaDocumento.tsx` — el acta escaneada DENTRO del diseño

- Nueva prop `imagen?: string | null`: cuando hay captura, el documento blanco muestra
  **la imagen real del pliego digitalizado** (max-h 300px, object-contain, borde) entre
  el bloque del código de barras y el DIVIPOL, con figcaption
  "● ACTA ESCANEADA — IMAGEN DIGITALIZADA · B/N".
- El cuerpo (contienda + votos) reduce su alto mínimo cuando hay imagen (el acta ya se ve).
- Nueva sección `informativos?: DatoResultadoActa[]`: votos EN BLANCO / NULOS / NO
  MARCADOS como píldoras punteadas bajo las casillas de candidatos.
- Sin imagen (caso imposible en éxito, pero defensivo) el documento queda como antes.

### 2. `PantallaExito.tsx` — datos del proyecto primero, VLM de respaldo

- **DETERMINISTA PRIMERO** (comentario del bloque actualizado para que sea verdad):
  - `mun` = `consulado.ciudad` ("ROMA" — como el mockup "MUN: ROMA") → lectura VLM → país.
  - `zona` = `consulado.zona` ("10") → VLM → ubic.consulado.
  - `puesto` = `consulado.puesto` ("02") → VLM → ubic.consulado.
  - `mesa` ya era determinista (ubic.mesa) — sin cambio.
- `imagen={imagenActa}` (`captura.imagenDataUrl ?? edicion.original`) pasada a ActaDocumento.
- `informativos` mapeados de `analisis.votosInformativos` admitiendo las DOS formas del
  contrato (array `{concepto,votos}` de types.ts y objeto `{enBlanco,nulos,noMarcadas}`
  de la respuesta real de `/api/actas/analizar`).
- Nuevo helper `etiquetaCandidato()`: nombres acortados en **límite de palabra** con
  elipsis ("IVÁN CEPEDA…", no "IVÁN CEPED"); números tal cual.

## Verificación E2E (agent-browser, 390×844, sesión PWA sin credenciales)

- Opción A → PROBAR CON ACTA REAL → `495-010-02 P1`: overlay **RECONOCIENDO ACTA**
  (4 fases) → dataset del puesto descargado (ACTAS 0→32) → **ENVIANDO AUTOMÁTICAMENTE** →
  pantalla de éxito con: píldora "✓ ENVIADO CORRECTAMENTE", documento con **la imagen
  real del acta**, DIVIPOL correcto (DEP: CONSULADOS · MUN: **ROMA** · ZONA: **10** ·
  PUESTO: 02 · MESA: 001), resultados que coinciden con el pliego (IVÁN CEPEDA 22 ·
  ABELARDO 33 · EN BLANCO 2), firmas, botón pantalla completa funcional (verificado con
  visor abierto + salida) y "YA REGISTRADA ✓" (duplicado = éxito, nunca rechazo).
- Re-escaneo del mismo pliego: píldora verde "ENVIADO CORRECTAMENTE" (sin rechazo).
- Escaneo de `P2` (huella distinta → envío fresco): píldora 8.9/10 ÓPTIMA · ENVIADO
  CORRECTAMENTE, documento con **PÁG 02 DE 02** e imagen real de la página 2 (firmas).
- ACTAS vacío: "AÚN NO HAY ACTAS — Escanea la primera acta del puesto…" (intacto).
- Nota: durante la edición con HML R caliente hubo un error TRANSITORIO de HMR
  (`etiquetaCandidato is not defined` entre las 2 ediciones) capturado por ErrorBoundary;
  tras recarga limpia `agent-browser errors` queda vacío y el flujo completo se re-verificó.

## Quality gates

- `bunx tsc --noEmit` → 0 errores.
- `bun run lint` → limpio.
- `dev.log` → sin errores de runtime tras los cambios.
