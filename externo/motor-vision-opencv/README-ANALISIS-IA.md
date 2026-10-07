# CONTEXTO DEL PROYECTO — Digitalizador E-14 (digielect)

> Este archivo fue generado como guía de contexto para análisis por una IA externa.
> **Última actualización:** ronda de refinamiento con el motor de visión OpenCV 4.5.5 real ya replicado.

## 1. ¿Qué es este proyecto?

Módulo **Digitalizador de Actas E-14** (escáner de documentos electorales) construido en **Next.js 16 + TypeScript**, que replica la experiencia de un web scanner móvil profesional para digitalizar actas electorales colombianas (formato E-14).

El flujo completo es: **Captura con cámara → Detección de bordes (OpenCV) → Recorte automático → Filtro B/N adaptativo → Análisis con GLM (IA, en segundo plano) → Revisión → Envío**, con pestañas de **Escanear / Actas / Resumen**.

- Repositorio de referencia del proyecto original: `https://github.com/Jg-Stevan/digielect`
- Repositorio del motor de visión original: `https://github.com/Jg-Stevan/web-scanner` (v6.2 de producción)
- Este código es la réplica/mejora de la parte del **digitalizador** únicamente.

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| Estilos | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| Estado | Zustand (cliente) |
| Base de datos | Prisma ORM + SQLite (`db/custom.db`, schema en `prisma/schema.prisma`) |
| IA | `z-ai-web-dev-sdk` (GLM) — SOLO en backend, para análisis de actas |
| Motor de visión | **OpenCV.js 4.5.5 real (WASM) en Web Worker** + fallback canvas |

## 3. Estructura clave del código

```
src/
├── app/
│   ├── page.tsx                      # Única ruta visible (renderiza DigitalizadorApp)
│   └── api/
│       ├── actas/route.ts            # CRUD de actas
│       ├── actas/analizar/route.ts   # Análisis con GLM (backend)
│       ├── actas/[id]/imagen/route.ts
│       └── bootstrap/route.ts
├── components/digitalizador/
│   ├── DigitalizadorApp.tsx          # Shell principal con pestañas
│   ├── PantallaCaptura.tsx           # Cámara, captura, detección de bordes
│   ├── PantallaRevision.tsx          # Editor de imagen + revisión (VisorZoom, bandas de score)
│   ├── PantallaControl.tsx           # Pestaña Actas
│   ├── PantallaResumen.tsx           # Pestaña Resumen
│   └── PantallaExito.tsx / PantallaContingencia.tsx / shared.tsx
└── lib/digitalizador/
    ├── detector-client.ts            # Cliente singleton del worker OpenCV (backpressure, transferables)
    ├── image-modes.ts                # Filtros: B/N Bradley-Roth, texto claro, sombras (idéntico a web-scanner)
    ├── escaner.ts                    # Pipeline: detectarBordes → warp(INTER_CUBIC) → enhance
    ├── quality.ts                    # Métricas de calidad (score 0-10, varianza Laplaciano)
    ├── use-camara.ts                 # Frame loop 10 Hz, k-de-N, captura WYSIWYG (misma lente del preview)
    ├── store.ts                      # Estado global Zustand (incluye intentosRechazo)
    └── reglas.ts / actas-reales.ts / types.ts
public/
├── vendor/
│   ├── opencv-4.5.5-core.js          # Binario WASM/JS de OpenCV 4.5.5 (8.6 MB, self-hosted)
│   └── opencv-4.5.5.js               # Puente de carga (resuelve ruta relativa, importScripts)
├── scanner/
│   └── detection-worker.js           # Worker REAL: Canny 6 pasadas + RANSAC refineQuad + shrink 3.5px + warpPerspective INTER_CUBIC (61 KB, verbatim de web-scanner)
└── actas/                            # Actas E-14 REALES de prueba (+ versiones mini/)
upload/                               # Diseños y especificaciones de referencia
├── stitch_designs/stitch_este_quedo_pleno/   # Pantallas de diseño (screen.png + code.html)
├── INSTRUCCIONES_REPLICA_MOTOR_VISION_OPENCV.md   # Guía maestra del motor (IMPLEMENTADA)
├── INSTRUCCIONES-AGENTE-web-scanner.md
├── ESPECIFICACION-REPLICA-ESCANNER.md
└── "Guía de construcción desde cero — Escáner de documentos web.md"
```

> **Nota:** el antiguo worker casero `public/e14/deteccion-worker.js` (Sobel 1D) fue **eliminado** — el pipeline usa ahora el worker real de OpenCV (criterio #3 del checklist de la guía maestra).

## 4. Cómo ejecutarlo

```bash
bun install          # o npm install
bun run db:push      # sincronizar schema Prisma con SQLite
bun run dev          # servidor de desarrollo en puerto 3000
```

QA del motor desde la consola del navegador: `window.__scannerPrecision()` → `{ ready: boolean, dead: boolean }`.

## 5. Estado actual (ronda completada)

**Motor de visión (guía maestra `INSTRUCCIONES_REPLICA_MOTOR_VISION_OPENCV.md` — IMPLEMENTADA):**
- ✅ Binarios verbatim en `public/vendor/` + worker real en `public/scanner/detection-worker.js`.
- ✅ Constantes sagradas intactas: `PROCESS_LONG_SIDE=400`, `SHRINK_QUAD_PX=3.5`, `PROCESSED_MAX_LONG_SIDE=4032` (nunca 3200), `QUAD_MIN_AREA_RATIO_DETECT=0.1`.
- ✅ Canny 6 pasadas en cascada, RANSAC sub-píxel (`refineQuad`, cota 5% diagonal), `warpPerspective(INTER_CUBIC, BORDER_REPLICATE)`.
- ✅ Cliente con cola de exclusión (1 mensaje en vuelo), transferables zero-copy, self-healing (timeout 25 s).
- ✅ B/N Bradley-Roth (t=0.15, ventana w/12, despeckle 3 px) vía worker con fallback canvas idéntico.
- ✅ Auto-captura K-de-N (4 de 6 muestras en 1200 ms, cooldown 1500 ms), captura WYSIWYG con la misma lente angular del preview.

**Correcciones de diseño (todas resueltas y verificadas en navegador):**
1. ✅ Quitada la opción de **descargar la imagen** del editor.
2. ✅ **Score bajo**: 1er intento → solo "OBLIGATORIO REPETIR FOTO"; desde el 2º intento se habilita "ENVIAR A REVISIÓN HUMANA" (contador `intentosRechazo` en store).
3. ✅ **Score intermedio**: botones "ENVIAR BAJO OBSERVACIÓN" y "REPETIR" alineados horizontalmente, "REPETIR" a la derecha.
4. ✅ **Navegación de imagen**: `VisorZoom` con pinch (1×–6×), doble tap (1×↔2.5×), arrastre para paneo con clamp y rueda del mouse — en el visor y en pantalla completa.
5. ✅ **Guía maestra .md implementada** (motor OpenCV real, ver arriba).
6. ✅ Sin selector de filtros (siempre B/N adaptativo).
7. ✅ Información del acta como **notificación flotante ~5 s** → luego queda la pill pequeña del diseño (tap la reabre 5 s).
8. ✅ **Análisis GLM en segundo plano** (sin UI visible).

## 6. Reglas del proyecto (restricciones del usuario)

- **NO restaurar**: bosquejo guía (sketch overlay), función QR, ni imágenes demo/recreadas.
- Usar **actas reales** (incluidas en `public/actas/`), aunque el escáner debe detectar **cualquier documento**.
- Solo modificar la pestaña **Escanear** + editor de imagen. **NO tocar** las pestañas Actas y Resumen (ya están bien organizadas).
- **REGLA SAGRADA** de la guía maestra: se puede modificar diseño/flujo, pero NUNCA la capacidad de ver con nitidez la imagen y reconocer el texto/números de las actas E-14. No inventar algoritmos caseros (Sobel 1D manual, Otsu en bucles for) — el worker real ya está replicado.
- El SDK `z-ai-web-dev-sdk` (GLM) debe usarse **solo en backend** (API routes), nunca en el cliente.

## 7. Notas técnicas relevantes

- El score de calidad va de 0–10: <5 rechazada, 5–8 advertencia (observación o repetir), >8 enviada correctamente.
- `worklog.md` en la raíz contiene el registro histórico de desarrollo de cada agente (útil para entender decisiones tomadas).
- La DB SQLite (`db/custom.db`) ya contiene datos de actas de prueba.
- Las imágenes de las actas usan el patrón de nombre `E14_XXX_X_88_..._XXX-N.jpg`.
- Heurística `esEscaneoBordesBlancos()`: los escaneos sobre fondo blanco (actas incrustadas a marco completo) no se recortan; en fotos de cámara reales OpenCV manda.
