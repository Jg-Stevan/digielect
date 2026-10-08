# 2026-10-08 · PWA Digitalizador: página "RECONOCIENDO ACTA" + duplicados = éxito + visor a pantalla completa

**Agente:** Z.ai Code (sandbox)
**Alcance:** `src/components/digitalizador/PantallaRevision.tsx`, `PantallaExito.tsx`, `src/lib/digitalizador/store.ts`
**Base:** commit `7a2a49f` (diseño score alto + ACTAS vacío + bootstrap por puesto)

## Pedido del usuario

1. **Página de carga "reconociendo acta"** mientras se extrae el texto con OCR y se busca la información del acta.
2. **Nunca mostrar "se rechazó un acta porque ya estaba"**: siempre se presenta que se envió automáticamente.
3. El diseño de score alto (PantallaExito) debe **acoplarse a la información del acta escaneada** y agregar el **botón de pantalla completa para ver la acta digitalizada**.

## Cambios

### 1. Overlay "RECONOCIENDO ACTA" (`PantallaRevision.tsx`)

- Nuevo componente `OverlayReconociendo` (inmersivo, `absolute inset-0 z-[70]` sobre la sección, `role="status"` + `aria-live="polite"`):
  - Miniatura del acta con **marco de esquinas del escáner** + **línea láser** (`scan-line`, keyframe `pwa-scan-oficial`) + halo de barrido.
  - Título "RECONOCIENDO ACTA" y **4 fases con lista de pasos** (check verde = hecho, spinner = activo, punto = pendiente):
    1. `PROCESANDO IMAGEN` — recorte automático + filtro B/N (canvas).
    2. `EXTRAYENDO TEXTO CON OCR` — código de barras, QR y zona X (`senalesLocales.extraccionEnCurso`).
    3. `BUSCANDO INFORMACIÓN DEL ACTA` — índice O(1) + análisis VLM (`analizando`).
    4. `ENVIANDO AUTOMÁTICAMENTE` — transmisión (fase `envio`).
  - Pie: "No cierre la aplicación · el reconocimiento es automático".
- Lógica de visibilidad: `useState reconocimientoListo` — se revela la revisión cuando la imagen está procesada + OCR concluido + VLM terminado (con éxito o fallo). **Válvula de escape de 22 s** (`esperaMaxVencida`) por si el motor se cuelga. Se reinicia por captura (`edicion?.id`).
- El overlay también cubre la fase `autoEnCurso` del auto-envío (score alto): el operario pasa de "reconociendo" directo al diseño de éxito, sin flashes intermedios.

### 2. Duplicado = éxito (`store.ts`)

- `UltimoEnvio` gana `yaRegistrada?: boolean`.
- **Vía online** (`enviarActa`): el servidor SOLO responde `RECHAZADO` por variantes de "hoja YA registrada" (QR DUPLICADO · RANURA YA VALIDADA · REEMPLAZO_RECHAZADO_MENOR_CALIDAD · concurrencia P2002 — verificado en `api/actas/route.ts`). Ahora se mapea a `estado: "VALIDADO"` con motivo `ACTA YA REGISTRADA — CONFIRMADA SIN CAMBIOS` → la pantalla de éxito muestra la píldora verde "ENVIADO CORRECTAMENTE" (nunca "ENVÍO RECHAZADO — REPETIR"). Los rechazos FRESCOS por calidad se deciden en el cliente (bandas RN-02) y no cambian.
- **Vía offline** (dedup de cola por huella QR, antes toast "ACTA YA REGISTRADA" sin navegar): ahora también va a la pantalla de éxito (`VALIDADO` + `yaRegistrada`) y avanza el contexto dirigido.
- `PantallaExito` agrega la nota discreta de auditoría **"· YA REGISTRADA ✓"** en la línea de hora (no bloqueante, nunca en rojo).

### 3. Acople de datos + pantalla completa (`PantallaExito.tsx`)

- **Acople**: `mesaNumero` ahora también resuelve desde el objetivo dirigido (`contexto.mesaId` → mesa del dataset) para capturas dirigidas sin OCR. Con la BD sembrada el título muestra el puesto real ("ROMA - CONSULADO") y la ruta completa `ITALIA > ZONA 10 > 02 - ROMA - CONSULADO > MESA 001 > DELEGADOS > PÁG 1 DE 2` (el anterior "ITALIA" era artefacto de BD vacía, no de código).
- **Nuevo botón "VER ACTA DIGITALIZADA EN PANTALLA COMPLETA"** (`btn-ver-acta-digitalizada`): abre visor `fixed inset-0 z-[70]` con la **imagen real escaneada y procesada** (`captura.imagenDataUrl`), cabecera "ACTA DIGITALIZADA (E-14)", botón de salida y ruta del acta al pie.

## Infraestructura

- **BD re-sembrada** (`bun run db:seed`): la tabla `Consulado` amaneció vacía entre sesiones (0 filas; solo 7 actas sueltas). Seed restaurado: 949 consulados · 3.670 mesas · 14.680 actas · 8 anomalías · 5 SLA · 3 BATCH.
- Dev server en :3000 sin errores de runtime; `POST /api/actas 39.3s` en el primer envío tras el re-seed (compilación de ruta + índices), luego 5.1s.

## Verificación E2E (agent-browser)

- Opción A → "PROBAR CON ACTA REAL" → Acta 495-010-02 P1:
  - Overlay **"RECONOCIENDO ACTA"** visible con fase OCR activa y pasos 1✓/2⟳/3·/4· (captura `/tmp/overlay-reconociendo.png`).
  - Auto-envío score 9.4/10 → pantalla de éxito con diseño acoplado: `*E14-6178010*`, DEP CONSULADOS, MUN ITALIA, ZONA 10, PUESTO 02, MESA 001, PRESIDENCIA Y VICEPRESIDENCIA, resultados VLM (IVÁN CEPED 22 / ABELARDO D 33), JURADO 1-3.
  - Botón **pantalla completa** abre el visor con el acta digitalizada real (captura `/tmp/exito-fullscreen.png`).
- Re-escaneo de la MISMA acta (duplicado): píldora verde **"✓ 9.4/10 ÓPTIMA · ENVIADO CORRECTAMENTE"** + nota **"· YA REGISTRADA ✓"** — sin pantalla de rechazo (captura `/tmp/exito-duplicado.png`).
- `bunx tsc --noEmit` → 0 errores · `bun run lint` → limpio · `dev.log` sin errores.

## Notas de diseño

- El overlay NO cubre la barra inferior de navegación (vive dentro de la sección de revisión, coherente con el marco tipo dispositivo en escritorio). El texto "No cierre la aplicación" desalienta salir a mitad del reconocimiento.
- Se conserva la banda RECHAZADA (score ≤5) del cliente: ese rechazo es por CALIDAD de la foto (RN-02), no por "ya estaba", y el usuario no lo cuestionó.
