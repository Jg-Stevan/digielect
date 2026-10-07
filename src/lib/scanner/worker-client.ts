// ============================================================
// DIGIELECT · Cliente del worker de escáner (rol A · [COORD C-14])
// Puerto del patrón de web-scanner: el motor vive en un worker y
// este cliente gestiona su ciclo de vida.
//
// [COORD · C-14 — integración del motor de visión REAL]
// Desde C-14 hay DOS motores detrás de este contrato:
//
//   1. PRIMARIO — OpenCV.js 4.5.5 real (web-scanner v6.2 verbatim):
//      worker `public/scanner/detection-worker.js` (Canny 6 pasadas
//      + RANSAC refineQuad + shrink 3.5 px + warpPerspective
//      INTER_CUBIC + B/N Bradley-Roth), cliente en ./opencv-client.
//      Se calienta al montar PantallaCaptura; nada bloquea mientras
//      arranca (8.6 MB de WASM).
//
//   2. RESPALDO — worker casero `public/e14/deteccion-worker.js`
//      (rol A): si el motor OpenCV aún no está listo o murió, la
//      llamada cae al casero con el MISMO contrato (degradación
//      honesta — convenio docs/agentes/CONVENIOS.md §3: nunca
//      bloquear la UI).
//
// Contrato público INVARIABLE (pipeline.ts y PantallaCaptura.tsx
// no cambian su forma de llamar):
//   · detectarQuadEnWorker(rgba, w, h) → QuadNormalizado | null
//   · procesarEnWorker(rgba, w, h, quad, target, opts?) → Resultado
//   · CalidadImagen { nitidez, contraste, brillo } 0–1 (fórmulas
//     idénticas → el score RN-02 conserva su escala histórica)
// ============================================================

import { withBasePath } from "@/lib/env";
import type { PuntoNorm, QuadNormalizado } from "@/lib/types";
import {
  getScannerWorker,
  calentarMotorOpenCv,
  type ScannerWorkerClient,
} from "./opencv-client";
import {
  metricasDeBitmap,
  esEscaneoBordesBlancos,
} from "./metricas";

export type { PuntoNorm, QuadNormalizado } from "@/lib/types";

/** Métricas 0-1 que produce el motor sobre el gris pre-binarización */
export interface CalidadImagen {
  nitidez: number;
  contraste: number;
  brillo: number;
}

export interface ResultadoProcesado {
  data: Uint8ClampedArray<ArrayBuffer>;
  w: number;
  h: number;
  calidad: CalidadImagen;
  /** D-03: el acta llena el frame (sin quad, bordes de papel) */
  fullFrame: boolean;
}

// ─── Motor OpenCV (primario) ────────────────────────────────

async function clienteConArranque(
  msEspera: number
): Promise<ScannerWorkerClient | null> {
  try {
    const cliente = await getScannerWorker();
    const lista = await Promise.race([
      cliente.waitReady(),
      new Promise<boolean>((r) => window.setTimeout(() => r(false), msEspera)),
    ]);
    return lista && cliente.isReady ? cliente : null;
  } catch {
    return null;
  }
}

function quadDeCorners(
  corners: Float32Array | null
): QuadNormalizado | null {
  if (!corners || corners.length !== 8) return null;
  for (let i = 0; i < 8; i++) {
    if (!Number.isFinite(corners[i])) return null;
  }
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const p = (i: number): PuntoNorm => ({
    x: clamp01(corners[i * 2]),
    y: clamp01(corners[i * 2 + 1]),
  });
  return [p(0), p(1), p(2), p(3)]; // TL,TR,BR,BL — mismo convenio
}

function canvasDeRgba(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Los llamadores pasan buffers ArrayBuffer reales (ImageData.data);
    // el tipo público queda laxo (ArrayBufferLike) por compatibilidad.
    ctx.putImageData(
      new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, w, h),
      0,
      0
    );
    return canvas;
  } catch {
    return null;
  }
}

async function blobAImageData(
  blob: Blob
): Promise<{ data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bmp.close();
      return null;
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      data: img.data as unknown as Uint8ClampedArray<ArrayBuffer>,
      w: canvas.width,
      h: canvas.height,
    };
  } catch {
    return null;
  }
}

/** Quad del marco completo (sin recorte — D-03 trivial, área 1.0) */
function quadMarcoCompleto(): QuadNormalizado {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

/** Detección con el motor OpenCV (null → el llamador cae al casero) */
async function detectarEnOpenCv(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): Promise<QuadNormalizado | null> {
  // [COORD C-14] Heurística del fork (portada fiel): los ESCANEOS
  // sobre fondo blanco (actas incrustadas a marco completo) no
  // tienen recorte que buscar — devolver marco completo ANTES de
  // OpenCV evita que el detector atrape el marco interno del
  // encabezado. El pipeline de main la interpreta con la semántica
  // D-03: área ≥ 85% → fullFrame · recorte trivial.
  const canvasPre = canvasDeRgba(rgba, w, h);
  if (canvasPre && esEscaneoBordesBlancos(canvasPre)) {
    return quadMarcoCompleto();
  }

  const cliente = await clienteConArranque(4000);
  if (!cliente) return null;
  const canvas = canvasPre ?? canvasDeRgba(rgba, w, h);
  if (!canvas) return null;
  try {
    const out = await Promise.race([
      cliente.detect(canvas, w, h),
      new Promise<null>((r) => window.setTimeout(() => r(null), 30000)),
    ]);
    return out ? quadDeCorners(out.corners) : null;
  } catch {
    return null;
  }
}

/**
 * Pipeline OpenCV: warp RANSAC/INTER_CUBIC + métricas + B/N
 * Bradley-Roth. Cualquier fallo → null (el llamador cae al casero).
 */
async function procesarEnOpenCv(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  quad: QuadNormalizado | null,
  targetLongSide: number,
  manualQuad: boolean
): Promise<ResultadoProcesado | null> {
  const cliente = await clienteConArranque(4000);
  if (!cliente) return null;
  const canvas = canvasDeRgba(rgba, w, h);
  if (!canvas) return null;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(canvas);
  } catch {
    return null;
  }

  try {
    // 1. Warp de perspectiva (sólo con quad; el worker no hace
    //    upscale y cap del lado mayor en 4032 — regla sagrada).
    //    [COORD C-14] El quad TRIVIAL (área ≥ 0.9: acta incrustada a
    //    marco completo — heurística bordes blancos) se pasa como
    //    "manual": no hay bordes que refinar (RANSAC sobre 12 Mpx
    //    sería puro costo) y el shrink 3.5 px RECORTARÍA contenido
    //    del acta pegada al borde. Para quads DETECTADOS en fotos
    //    reales el refine RANSAC + shrink van intactos (motor).
    const areaQuadNorm = (q: QuadNormalizado): number =>
      Math.abs(
        q[0].x * q[1].y - q[1].x * q[0].y +
        q[1].x * q[2].y - q[2].x * q[1].y +
        q[2].x * q[3].y - q[3].x * q[2].y +
        q[3].x * q[0].y - q[0].x * q[3].y
      ) / 2;
    const area = quad && quad.length === 4 ? areaQuadNorm(quad) : 0;
    // Marco completo (≥ 97.5%): warp(franjas completas) = identidad
    // — remapear 12 Mpx con INTER_CUBIC no aporta nada (cero
    // corrección de perspectiva) y es el costo mayor del pipeline
    // en WASM por software. B/N + métricas van directo sobre la
    // fuente. En quads DETECTADOS el motor va intacto.
    const esMarcoCompleto = area >= 0.975;
    let warpeado: ImageBitmap | null = null;
    if (quad && quad.length === 4 && !esMarcoCompleto) {
      const out = await Promise.race([
        cliente.warp(bitmap, quad as unknown as Array<{ x: number; y: number }>, manualQuad || area >= 0.9),
        new Promise<null>((r) => window.setTimeout(() => r(null), 30000)),
      ]);
      if (!out) return null;
      warpeado = out.bitmap;
    }

    // 2. Métricas sobre la foto RECTIFICADA antes de binarizar
    //    (fórmulas del casero → escala RN-02 histórica). Si el
    //    bitmap ya fue transferido al warp, métricas sobre el
    //    warpeado; si no, sobre el marco completo.
    const fuenteMetricas = warpeado ?? bitmap;
    const calidad = metricasDeBitmap(fuenteMetricas);

    // 3. Heurística bordes blancos SOLO en la ruta sin quad
    //    (con quad decide pipeline por área ≥ 85%).
    const fullFrame = !quad && esEscaneoBordesBlancos(bitmap);

    // 4. B/N adaptativo Bradley-Roth vía worker (PNG lossless)
    const enh = await Promise.race([
      cliente.enhance(fuenteMetricas, "bw", { maxLongSide: targetLongSide }),
      new Promise<null>((r) => window.setTimeout(() => r(null), 30000)),
    ]);
    if (!enh) return null;
    const img = await blobAImageData(enh.blob);
    if (!img) return null;

    return {
      data: img.data,
      w: img.w,
      h: img.h,
      calidad,
      fullFrame,
    };
  } catch {
    return null;
  } finally {
    // Los bitmaps transferidos al worker quedan detached: close()
    // es inocuo con ellos; el no-transferido sí hay que liberarlo.
    try {
      if (bitmap && !quad) bitmap.close();
    } catch {
      /* ya cerrado/detached */
    }
  }
}

/** Calentamiento del motor real (montaje de PantallaCaptura) */
export function calentarMotorVision(): void {
  calentarMotorOpenCv();
}

// ─── Motor casero (respaldo) ────────────────────────────────

interface Pendiente {
  resolve: (v: unknown) => void;
  timer: number;
}

let workerProm: Promise<Worker | null> | null = null;
let seq = 0;
const pendientes = new Map<number, Pendiente>();

/** Versión del worker casero (invalida caché HTTP cuando cambia) */
const VERSION_CASERO = "4";

function crearWorkerCasero(): Promise<Worker | null> {
  if (workerProm) return workerProm;
  workerProm = new Promise<Worker | null>((resolve) => {
    try {
      if (typeof Worker === "undefined") {
        resolve(null);
        return;
      }
      const w = new Worker(
        `${withBasePath("/e14/deteccion-worker.js")}?v=${VERSION_CASERO}`
      );
      w.onmessage = (e: MessageEvent) => {
        const msg = e.data as { id?: number } | null;
        const id = msg?.id;
        if (typeof id !== "number") return;
        const p = pendientes.get(id);
        if (!p) return;
        pendientes.delete(id);
        window.clearTimeout(p.timer);
        p.resolve(msg);
      };
      w.onerror = () => {
        // Fallo fatal del script: liberar todos los pendientes con null
        for (const [, p] of pendientes) {
          window.clearTimeout(p.timer);
          p.resolve(null);
        }
        pendientes.clear();
        w.terminate();
        workerProm = null;
      };
      resolve(w);
    } catch {
      resolve(null);
    }
  });
  return workerProm;
}

function matarWorkerCasero() {
  if (workerProm) {
    void workerProm.then((w) => {
      try {
        w?.terminate();
      } catch {
        /* nada */
      }
    });
    workerProm = null;
  }
}

async function llamarWorkerCasero<T>(
  msg: Record<string, unknown>,
  transfer: Transferable[],
  timeoutMs: number
): Promise<T | null> {
  const w = await crearWorkerCasero();
  if (!w) return null;
  const id = ++seq;
  return new Promise<T | null>((resolve) => {
    const timer = window.setTimeout(() => {
      pendientes.delete(id);
      matarWorkerCasero(); // el worker quedó colgado: re-crear en la próxima
      resolve(null);
    }, timeoutMs);
    pendientes.set(id, {
      resolve: resolve as (v: unknown) => void,
      timer,
    });
    try {
      w.postMessage({ ...msg, id }, transfer);
    } catch {
      window.clearTimeout(timer);
      pendientes.delete(id);
      resolve(null);
    }
  });
}

// ─── Contrato público (OpenCV primero, casero de respaldo) ──

/**
 * Detecta el cuadrilátero del acta en un frame REDUCIDO (~320px).
 * Motor real OpenCV (Canny+RANSAC); si aún arranca o falló, el
 * casero. `rgba` NO se transfiere al motor real (se copia a canvas);
 * en el casero se transfiere una copia (queda inutilizado el clon).
 */
export async function detectarQuadEnWorker(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  timeoutMs = 2500
): Promise<QuadNormalizado | null> {
  // 1) Motor real (con ventana corta de arranque para no bloquear
  //    el overlay vivo: si aún no está, el casero responde ya).
  const opencv = await detectarEnOpenCv(rgba, w, h);
  if (opencv) return opencv;

  // 2) Respaldo casero (contrato histórico de rol A)
  const buf = rgba.buffer.slice(0) as ArrayBuffer;
  const r = await llamarWorkerCasero<{ ok: boolean; quad: QuadNormalizado | null }>(
    { op: "detectar", buf, w, h },
    [buf],
    timeoutMs
  );
  return r && r.ok ? r.quad : null;
}

/**
 * Pipeline pesado: warp de perspectiva + métricas + B/N adaptativo.
 * Motor real primero; casero de respaldo con el mismo resultado.
 * `rgba` permanece utilizable (cada motor recibe su propia copia).
 */
export async function procesarEnWorker(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  quad: QuadNormalizado | null,
  targetLongSide: number,
  opts?: { manualQuad?: boolean }
): Promise<ResultadoProcesado | null> {
  // 1) Motor real (ventana de arranque algo mayor: al primer uso
  //    tras abrir la PWA el WASM puede tardar unos segundos).
  const opencv = await procesarEnOpenCv(
    rgba,
    w,
    h,
    quad,
    targetLongSide,
    opts?.manualQuad === true
  );
  if (opencv) return opencv;

  // 2) Respaldo casero (contrato histórico de rol A)
  const buf = rgba.buffer.slice(0) as ArrayBuffer;
  const r = await llamarWorkerCasero<{
    ok: boolean;
    buf: ArrayBuffer;
    w: number;
    h: number;
    calidad: CalidadImagen;
    fullFrame: boolean;
  }>(
    { op: "procesar", buf, w, h, quad, targetLongSide },
    [buf],
    20000
  );
  if (!r || !r.ok || !r.buf) return null;
  return {
    data: new Uint8ClampedArray(r.buf),
    w: r.w,
    h: r.h,
    calidad: r.calidad,
    fullFrame: r.fullFrame === true,
  };
}
