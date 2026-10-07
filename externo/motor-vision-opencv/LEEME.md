# Motor de visión por computadora — réplica externa (OpenCV 4.5.5 real)

> Origen: trabajo externo del usuario (Jg-Stevan) con IA, sobre un fork del
> proyecto. Subido al repo el 07-oct para preservarlo (zip
> `digielect-digitalizador.zip`). Integración al digitalizador de main:
> ver `src/lib/scanner/opencv-client.ts` + `public/scanner/detection-worker.js`
> + `public/vendor/opencv-4.5.5*` (rama feature/c-integra-motor-opencv).

## Qué es
Réplica fiel del motor de visión de **web-scanner v6.2**
(https://github.com/Jg-Stevan/web-scanner) según la guía maestra
`upload/INSTRUCCIONES_REPLICA_MOTOR_VISION_OPENCV.md` (IMPLEMENTADA):

- `public/vendor/opencv-4.5.5-core.js` — binario WASM real (8.6 MB, self-hosted;
  integrado en main como `public/vendor/opencv-4.5.5-core.js`)
- `public/vendor/opencv-4.5.5.js` — puente de carga (rutas relativas → GitHub Pages)
- `public/scanner/detection-worker.js` — worker real 61 KB: Canny 6 pasadas en
  cascada → contornos → quads convexos → RANSAC sub-píxel (`refineQuad`, cota 5%
  diagonal) → shrink 3.5 px → `warpPerspective(INTER_CUBIC, BORDER_REPLICATE)`
- `src/lib/digitalizador/detector-client.ts` — cliente singleton self-healing
  (timeout 25 s), cola de exclusión 1 mensaje en vuelo, ImageBitmap transferables
  zero-copy, backpressure por descarte, QA `window.__scannerPrecision()`
- `src/lib/digitalizador/image-modes.ts` — B/N Bradley-Roth (t=0.15, ventana w/12,
  despeckle 3 px) + texto claro + sombras, idéntico worker/fallback
- `src/lib/digitalizador/escaner.ts` — pipeline detectar→warp→enhance, cap 4032
  (nunca 3200), métricas Laplaciano de la foto rectificada
- `src/lib/digitalizador/use-camara.ts` — frame loop 10 Hz, k-de-N (4 de 6 en
  1200 ms, cooldown 1500 ms), captura WYSIWYG
- `PantallaRevision.tsx` — VisorZoom (pinch 1×–6×, doble tap, paneo), bandas
  RN-02 (score bajo 1er intento = solo repetir), notificación flotante 5 s

## Constantes sagradas (INTOCABLES)
`PROCESS_LONG_SIDE=400` · `SHRINK_QUAD_PX=3.5` · `PROCESSED_MAX_LONG_SIDE=4032`
· `QUAD_MIN_AREA_RATIO_DETECT=0.1`

## Regla sagrada
Se puede modificar diseño/flujo, pero NUNCA la capacidad de ver con nitidez la
imagen y reconocer el texto/números de las actas E-14. Cero algoritmos caseros
de detección (Sobel 1D, Otsu en bucles) — el worker real ya está replicado.

## Exclusiones al subir (viven en otra parte o se regeneran)
- `opencv-4.5.5-core.js` → integrado en `public/vendor/` de main
- `db/custom.db`, `.env`, `bun.lock` → artefactos locales del fork
- `public/actas/` (5.9 MB) → se mantienen aquí como actas REALES de prueba
