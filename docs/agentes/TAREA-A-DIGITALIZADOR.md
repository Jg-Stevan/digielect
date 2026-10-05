# 📱 TAREA A — Digitalizador: portar el escáner (web-scanner) al PWA E-14

> **Asignada a**: la IA que construyó
> [`Jg-Stevan/web-scanner`](https://github.com/Jg-Stevan/web-scanner)
> (v6.2, escáner iOS-style con detección de bordes, B/N adaptativo y
> procesado en dispositivo).
> **Rol**: A · **Coordina con**: C (contrato de identificación) · B (ingesta)
> **Prioridad**: FASE 2 del roadmap — pero el contrato de salida (§4) se
> acuerda YA con el rol C porque la FASE 1 lo consume.

---

## 1. Objetivo

Replicar **solo lo necesario** de la experiencia de web-scanner dentro del
módulo **Digitalizador** de Digielect (`src/components/digitalizador/`), de
modo que el operador consular capture el acta física con la calidad y la
fluidez del escáner (recorte automático, perspectiva, B/N adaptativo,
medidor de calidad), y el resultado alimente directamente al identificador
determinista (`src/lib/identificacion-acta.ts`).

**Filosofía**: el dispositivo del operador hace el trabajo pesado (igual que
en web-scanner). El servidor nunca procesa imágenes en la FASE 1-2.

## 2. QUÉ portar de web-scanner (y qué NO)

### ✅ Portar (lo esencial)

| Capacidad de web-scanner | Notas de adaptación |
|---|---|
| Cámara `getUserMedia` con selección de lente trasera + linterna (torch) con reintentos | Ya existe una base en `useCamaraE14` (ver worklog Task 10): **reusarla, no reemplazarla a ciegas**. Integrar la mejora de selección de lente/torch |
| Detección de bordes en tiempo real en Web Worker (Sobel/DFS) + marco con 8 handles | El Worker propio de web-scanner (`detection-worker.js`) es la referencia; adaptarlo a la estética del digitalizador |
| **Captura fluida (F-DEFER-CROP)**: editor abre al instante, recorte aterriza en segundo plano | Crítico para gama baja: el acta E-14 se fotografía en mesas de votación, no hay tiempo |
| **Filtro B/N adaptativo por defecto** en cada captura | Es EL filtro para actas: maximiza OCR de texto impreso y barcode |
| Warp de perspectiva a resolución completa del sensor (4032 px) | Conservar el texto legible: el OCR del código entre X depende de esto |
| Benchmark del dispositivo (ajusta resolución 4032/3200/2560) | Los digitalizadores tendrán teléfonos variados |
| Importación robusta (EXIF, HEIC vía libheif bajo demanda) | Para cargar fotos desde galería en el modo BATCH |
| Badge de calidad (nitidez Laplaciano + contraste + brillo) | Ya existe `e14/quality.ts`: unificar criterios, no duplicar motores |

### ❌ NO portar

- **Biblioteca de documentos** (no aplica: el flujo es captura → verificar → subir).
- **Exportar PDF** (jsPDF) — fuera de alcance.
- **OCR propio de web-scanner** — el digitalizador tiene su pipeline de
  identificación (rol C); el OCR que se use debe ser el acordado (§4).
- Perfiles de documento / página de demo del editor.

## 3. Pantallas del digitalizador a tocar

Inventario actual (verificar contra `src/components/digitalizador/`):
`Control · Captura · Revisión · Éxito · Contingencia · Resumen`.

- **Captura**: sustituir/augmentar el visor por el flujo web-scanner
  (detección de bordes en vivo + autocaptura k-de-n + deferred crop).
- **Revisión**: aquí aterrizan las señales para el identificador (§4) y se
  muestra al operador la asignación resultante
  (`PAÍS > ZONA > PUESTO > MESA · TIPO · PÁG X de 2` + huella QR).
- **Contingencia**: cola offline (IndexedDB) de hojas procesadas — integrar
  con el rol B (Fase 5).

## 4. Contrato de salida de la captura (acordar con rol C)

Cada hoja procesada produce un objeto con ESTA forma (extender en
`src/lib/types.ts` como `CapturaProcesada`):

```ts
interface CapturaProcesada {
  /** Imagen recortada + perspectiva corregida + B/N adaptativo */
  imagenDataUrl: string;        // JPEG/WebP comprimido (objetivo < 200 KB)
  /** Métricas de calidad del badge (0-1 cada una) */
  calidad: { nitidez: number; contraste: number; brillo: number };
  /** Dígitos del barcode15 si el OCR los leyó (validar con parseBarcode15) */
  barcode15?: string | null;
  /** Texto OCR del tercio superior + bandas (para anclas y código X) */
  textoSuperior: string;
  /** Lectura de la zona "X 7-23-10-19 X" (cruda, SIN normalizar) */
  codigoXCrudo?: string | null;
  /** Encabezado DIVIPOL crudo leído (sin normalizar) */
  encabezadoCrudo?: { pais?: string; zona?: string; puesto?: string; mesa?: string };
  /** Huella del QR si jsQR lo decodificó (base64url de 44 chars) */
  qrTexto?: string | null;
}
```

> **Regla**: la captura entrega señas CRUDAS. La normalización, la
> identificación y la decisión de almacenamiento son del identificador
> (`identificarActa` + `clasificarEjemplar` + `decidirAlmacenamiento`).
> Esto mantiene la lógica testeable y evita que dos módulos "normalicen"
> distinto lo mismo.

El score final (0-10, RN-02) se calcula combinando `calidad` + confianza de
`identificarActa` + confianza de `clasificarEjemplar`. Fórmula propuesta
(firmarla entre A y C en el worklog antes de implementar):

```
score = round(10 * (0.45*min(calidad) + 0.40*confIdentificacion + 0.15*confClasificacion))
```

## 5. Requisitos de UX (herencia web-scanner)

- Todo en español, tono iOS limpio (shadcn/ui + Tailwind del repo).
- Touch targets ≥ 44px · `viewport-fit=cover` · sin cuelgues en gama baja.
- La PWA ya es instalable; conservar el Service Worker existente del repo.
- Nunca bloquear la UI con procesado: Web Workers para bordes/OCR.

## 6. Criterios de aceptación (Definition of Done)

1. Con las 8 imágenes de `public/actas-ejemplo/` (y con el acta real de El
   Cairo fotografiada con un celular), el flujo captura → procesado →
   identificación produce la asignación correcta de mesa/tipo/página en
   ≥ 90% de los casos.
2. Un acta con barcode borroso se clasifica por anclas de texto sin error
   (página 2 con firmas → p2; página 1 con candidatos → p1).
3. Un acta con código X ilegible cae en ANOMALÍA (nunca se inventa destino).
4. `tsc --noEmit` + `lint` + `NEXT_STATIC_EXPORT=1 bun run build:static` limpios.
5. Worklog actualizado (append) con Task ID `A-<n>` y evidencia E2E.
6. Sin regresiones del fix de cámara del Task 10 (visor negro).
