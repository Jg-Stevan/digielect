// ============================================================
// DIGIELECT · Pipeline de captura del escáner (rol A)
// Puerto del flujo F-RES-PRIORITY + F-DEFER-CROP de web-scanner
// v6.2 al digitalizador E-14:
//
//   dataUrl (frame/galería a resolución plena)
//     → cap del benchmark (4032/3200 — el cap NUNCA sube la imagen)
//     → detección del cuadrilátero en copia reducida (~360px,
//       barata, en worker)
//     → warp de perspectiva + métricas + B/N ADAPTATIVO (worker)
//     → JPEG de entrega (≤ 2400px, objetivo < 200 KB, degrada
//       calidad antes que resolución: el texto manda)
//     → CapturaProcesada (contrato rol A → rol C, types.ts)
//
// El llamador (DigitalizadorApp) hace F-DEFER-CROP: muestra la
// imagen provisional AL INSTANTE en Revisión y este pipeline
// aterriza en segundo plano. La detección que falla NO bloquea:
// se entrega el frame completo procesado (B/N igual aplica).
// ============================================================

import { parseBarcode15 } from "@/lib/e14/parse";
import type { CapturaProcesada } from "@/lib/types";
import { capProcesado, registrarTiempoProcesado } from "./benchmark";
import {
  detectarQuadEnWorker,
  procesarEnWorker,
  type QuadNormalizado,
} from "./worker-client";

/** Lado largo de la imagen de ENTREGA (D-03: el texto manda) */
const LADO_ENTREGA = 2400;
/** Umbral de bytes del JPEG de entrega antes de bajar calidad.
 * D-03: 300 KB con suelo 0.72 — el objetivo anterior (220 KB, suelo
 * 0.62) sacrificaba tipografía pequeña de un documento legal. */
const OBJETIVO_BYTES = 300_000;
const CALIDAD_MINIMA = 0.72;
/** Lado del frame de análisis para la detección (barato: <5 ms) */
const LADO_ANALISIS = 360;
/** D-03: quad que cubre ≥85% del frame = "acta llena" (recorte trivial) */
const FULLFRAME_AREA = 0.85;

function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen_invalida"));
    img.src = dataUrl;
  });
}

function canvasDe(img: HTMLImageElement, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_no_disponible");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Encoge un buffer RGBA ya dibujado a un canvas destino */
function escalarImageData(
  data: Uint8ClampedArray<ArrayBuffer>,
  w: number,
  h: number,
  w2: number,
  h2: number
): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("canvas_no_disponible");
  sctx.putImageData(new ImageData(data, w, h), 0, 0);
  const dst = document.createElement("canvas");
  dst.width = w2;
  dst.height = h2;
  const dctx = dst.getContext("2d");
  if (!dctx) throw new Error("canvas_no_disponible");
  dctx.drawImage(src, 0, 0, w2, h2);
  return dst;
}

function canvasAJpeg(
  canvas: HTMLCanvasElement,
  objetivoBytes: number
): string {
  let calidad = 0.9;
  let out = canvas.toDataURL("image/jpeg", calidad);
  while (out.length * 0.75 > objetivoBytes && calidad > CALIDAD_MINIMA) {
    calidad -= 0.1;
    out = canvas.toDataURL("image/jpeg", calidad);
  }
  return out;
}

/** Área normalizada de un quad [TL,TR,BR,BL] (D-03) */
function areaQuad(q: QuadNormalizado): number {
  return (
    Math.abs(
      q[0].x * q[1].y - q[1].x * q[0].y +
      q[1].x * q[2].y - q[2].x * q[1].y +
      q[2].x * q[3].y - q[3].x * q[2].y +
      q[3].x * q[0].y - q[0].x * q[3].y
    ) / 2
  );
}

/** Lectura de barcode15 (1D) cuando el navegador expone BarcodeDetector */
async function leerBarcode15(canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const BD = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!BD) return null;
    const detector = new BD({
      formats: ["code_128", "code_39", "itf", "codabar", "ean_13"],
    });
    const resultados = await detector.detect(canvas);
    for (const r of resultados) {
      // El contrato pide validar con parseBarcode15 (15 dígitos)
      if (parseBarcode15(r.rawValue)) return r.rawValue.replace(/\D/g, "");
    }
  } catch {
    /* sin BarcodeDetector o sin lectura: señal nula, no bloquea */
  }
  return null;
}

export interface OpcionesProcesar {
  /** Huella QR ya decodificada en la captura (se copia al contrato) */
  qrTexto?: string | null;
  /** Tope del lado largo (default: benchmark del dispositivo) */
  capLado?: number;
  /** D-03: quad del EDITOR MANUAL — salta la detección automática */
  quadFijo?: QuadNormalizado | null;
}

/**
 * Procesa una captura cruda y produce el contrato CapturaProcesada.
 * Las señales de OCR (textoSuperior/codigoXCrudo/encabezadoCrudo)
 * se completan DESPUÉS con leerSenalesOcr (no bloquean la revisión).
 */
export async function procesarCaptura(
  dataUrl: string,
  opts: OpcionesProcesar = {}
): Promise<CapturaProcesada> {
  const inicio = Date.now();
  const cap = opts.capLado ?? capProcesado();
  const img = await cargarImagen(dataUrl);
  const ladoFuente = Math.max(img.naturalWidth, img.naturalHeight);

  // 1. Buffer fuente al cap del dispositivo (NUNCA upscale)
  const escalaFuente = Math.min(1, cap / Math.max(ladoFuente, 1));
  const w0 = Math.max(1, Math.round(img.naturalWidth * escalaFuente));
  const h0 = Math.max(1, Math.round(img.naturalHeight * escalaFuente));
  const { ctx } = canvasDe(img, w0, h0);
  const fuente = ctx.getImageData(0, 0, w0, h0);

  // 2. Detección del acta en copia reducida (barata, en worker).
  //    El quad del EDITOR MANUAL (D-03) manda sobre la detección.
  let quad: QuadNormalizado | null = null;
  if (opts.quadFijo && opts.quadFijo.length === 4) {
    quad = opts.quadFijo;
  } else {
    try {
      const escalaA = Math.min(1, LADO_ANALISIS / Math.max(w0, h0));
      const wa = Math.max(1, Math.round(w0 * escalaA));
      const ha = Math.max(1, Math.round(h0 * escalaA));
      const { ctx: ctxA } = canvasDe(img, wa, ha);
      const mini = ctxA.getImageData(0, 0, wa, ha);
      quad = await detectarQuadEnWorker(mini.data, wa, ha);
    } catch {
      quad = null;
    }
  }

  // 3. Warp + métricas + B/N adaptativo (pesado, en worker)
  //    [COORD C-14] manualQuad: el quad del EDITOR MANUAL manda al
  //    píxel — el motor real lo sabe (F5-MANUAL: sin refine RANSAC
  //    ni shrink 3.5 px); la detección automática SÍ se refina.
  const manualQuad = Boolean(opts.quadFijo && opts.quadFijo.length === 4);
  let data: Uint8ClampedArray<ArrayBuffer> = fuente.data;
  let w1 = w0;
  let h1 = h0;
  let calidad = { nitidez: 0, contraste: 0, brillo: 0 };
  let procesado = false;
  let fullFrameWorker = false;
  try {
    const r = await procesarEnWorker(fuente.data, w0, h0, quad, cap, {
      manualQuad,
    });
    if (r) {
      data = r.data;
      w1 = r.w;
      h1 = r.h;
      calidad = r.calidad;
      procesado = true;
      fullFrameWorker = r.fullFrame;
    }
  } catch {
    /* respaldo más abajo */
  }

  // 4. Canvas de salida (o respaldo honesto si el worker falló)
  let salida: HTMLCanvasElement;
  if (procesado) {
    const lado = Math.max(w1, h1);
    if (lado > LADO_ENTREGA) {
      const s = LADO_ENTREGA / lado;
      salida = escalarImageData(
        data,
        w1,
        h1,
        Math.max(1, Math.round(w1 * s)),
        Math.max(1, Math.round(h1 * s))
      );
    } else {
      const c = document.createElement("canvas");
      c.width = w1;
      c.height = h1;
      const c2 = c.getContext("2d");
      if (!c2) throw new Error("canvas_no_disponible");
      c2.putImageData(new ImageData(data, w1, h1), 0, 0);
      salida = c;
    }
  } else {
    // Respaldo sin worker: frame al cap, SIN B/N ni warp (la imagen
    // original nunca se degrada por debajo de lo ya hecho).
    const lado = Math.max(w0, h0);
    if (lado > LADO_ENTREGA) {
      const s = LADO_ENTREGA / lado;
      salida = escalarImageData(
        fuente.data,
        w0,
        h0,
        Math.max(1, Math.round(w0 * s)),
        Math.max(1, Math.round(h0 * s))
      );
    } else {
      salida = escalarImageData(fuente.data, w0, h0, w0, h0);
    }
  }

  registrarTiempoProcesado(Date.now() - inicio);

  // 5. Señales complementarias (no bloquean)
  const barcode15 = await leerBarcode15(salida);

  // 6. D-03 · contrato de recorte: feedback honesto al operador
  //    · recorteAplicado: warp con quad validado (incluye trivial ≥85%)
  //    · fullFrame: "el acta llena el frame" (quad gigante o bordes papel)
  //    · quad: lo aplicado — base del editor de esquinas
  const area = quad ? areaQuad(quad) : 0;
  const recorteAplicado = procesado && quad !== null;
  const fullFrame = recorteAplicado
    ? area >= FULLFRAME_AREA
    : procesado && fullFrameWorker;

  return {
    imagenDataUrl: canvasAJpeg(salida, OBJETIVO_BYTES),
    calidad,
    barcode15,
    textoSuperior: "",
    codigoXCrudo: null,
    qrTexto: opts.qrTexto ?? null,
    recorteAplicado,
    fullFrame,
    quad: recorteAplicado && quad ? quad : null,
  };
}
