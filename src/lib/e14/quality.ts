"use client";

// ============================================================
// DIGIELECT · Control de calidad de captura en cliente
// Puerto de la lógica del web-scanner (Jg-Stevan) adaptada al
// flujo E-14: score compuesto 0-10 con las constantes validadas
// empíricamente del motor original:
//   · nitidez — varianza del Laplaciano sobre miniatura gris
//   · exposición — histograma (subexpuesto / sobreexpuesto /
//     especular) sobre miniatura del frame completo
//   · (la estabilidad k-de-n la lleva el bucle de captura)
// Se ejecuta ANTES de subir la imagen: una foto evidentemente
// mala nunca viaja al servidor (perfil hardware restringido).
// ============================================================

// ─── Constantes del motor original (web-scanner quality.ts) ──

/** Var(Laplacian) saturación medida a 256-clase de gris. */
const SHARPNESS_NORM = 140;
/** Varianza cruda por debajo de esto = desenfoque. */
const BLUR_THRESHOLD = 45;
/** Píxel < 30 = subexpuesto. */
const UNDER_EXPOSED_PX = 30;
/** Píxel > 225 = sobreexpuesto. */
const OVER_EXPOSED_PX = 225;
/** Píxel > 248 = reflejo especular, info irrecuperable. */
const SPECULAR_PX = 248;
/** >3% de píxeles especulares → advertencia. */
const SPECULAR_RATIO_WARN = 0.03;

/** Lado de la miniatura de análisis. */
const THUMB = 256;

export interface CalidadCaptura {
  /** Score compuesto 0-10 */
  score: number;
  /** Varianza del Laplaciano (cruda) */
  nitidezVar: number;
  /** 0-1 */
  nitidez: number;
  /** 0-1 */
  exposicion: number;
  /** Fracción de píxeles especulares */
  especular: number;
  /** Defectos detectados (etiquetas ERS) */
  problemas: string[];
}

/**
 * Miniatura en escala de grises a THUMB×THUMB (mantener aspecto
 * aproximado; el análisis es estadístico y no geométrico).
 */
function miniaturaGris(
  fuente: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Uint8ClampedArray | null {
  const esVideo = fuente instanceof HTMLVideoElement;
  const w = esVideo ? fuente.videoWidth : (fuente as HTMLImageElement).naturalWidth || (fuente as HTMLCanvasElement).width;
  const h = esVideo ? fuente.videoHeight : (fuente as HTMLImageElement).naturalHeight || (fuente as HTMLCanvasElement).height;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  const escala = Math.min(1, THUMB / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
  try {
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }
}

/**
 * Evalúa la calidad de un frame/imagen. Puro análisis de canvas:
 * Laplaciano 3×3 (nitidez) + histograma (exposición).
 * Devuelve score 0-10 y etiquetas de problemas.
 */
export function evaluarCalidad(
  fuente: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): CalidadCaptura {
  const data = miniaturaGris(fuente);
  if (!data) {
    return { score: 0, nitidezVar: 0, nitidez: 0, exposicion: 0, especular: 1, problemas: ["no es un acta e-14"] };
  }

  const ancho = Math.max(1, Math.min(THUMB, Math.sqrt(data.length / 4)));
  // Convertimos a gris en un buffer cuadrado aprox (filas del canvas)
  const canvasW = ancho;
  const canvasH = Math.max(1, Math.floor(data.length / 4 / canvasW));
  const gris = new Float32Array(canvasW * canvasH);
  for (let i = 0; i < canvasW * canvasH; i++) {
    gris[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // ---- Laplaciano (varianza) ----
  let suma = 0;
  let suma2 = 0;
  let n = 0;
  for (let y = 1; y < canvasH - 1; y++) {
    for (let x = 1; x < canvasW - 1; x++) {
      const i = y * canvasW + x;
      const lap =
        4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - canvasW] - gris[i + canvasW];
      suma += lap;
      suma2 += lap * lap;
      n++;
    }
  }
  const nitidezVar = n > 0 ? suma2 / n - (suma / n) * (suma / n) : 0;

  // ---- Histograma de exposición (frame completo) ----
  let sub = 0;
  let sobre = 0;
  let especular = 0;
  const total = gris.length;
  for (let i = 0; i < total; i++) {
    const v = gris[i];
    if (v < UNDER_EXPOSED_PX) sub++;
    else if (v > SPECULAR_PX) especular++;
    else if (v > OVER_EXPOSED_PX) sobre++;
  }
  const fracSub = sub / total;
  const fracSobre = sobre / total;
  const fracEspecular = especular / total;

  // ---- Scores 0-1 (misma forma del motor original) ----
  const nitidez = Math.max(0, Math.min(1, nitidezVar / SHARPNESS_NORM));
  const exposicion = Math.max(
    0,
    Math.min(1, 1 - (fracSub * 1.4 + fracSobre * 1.2 + fracEspecular * 2))
  );
  // Sin estabilidad (frame único) → pesos 0.5/0.5
  const compuesto = 0.5 * nitidez + 0.5 * exposicion;
  const score = Math.max(0, Math.min(10, Math.round(compuesto * 10)));

  // ---- Etiquetas ERS ----
  const problemas: string[] = [];
  if (nitidezVar < BLUR_THRESHOLD) problemas.push("desenfoque");
  if (fracSub > 0.25) problemas.push("poca luz");
  if (fracSobre > 0.25) problemas.push("sobreexposicion");
  if (fracEspecular > SPECULAR_RATIO_WARN) problemas.push("sombra");

  return {
    score,
    nitidezVar,
    nitidez,
    exposicion,
    especular: fracEspecular,
    problemas,
  };
}

/**
 * Umbral de auto-captura del web-scanner: el disparo automático
 * requiere K buenas de N recientes (k-de-n) dentro de la ventana.
 */
export const SHUTTER = {
  score: 7,
  k: 4,
  n: 6,
  ventanaMs: 1600,
  cooldownMs: 1200,
  timeoutManualMs: 8000,
} as const;
