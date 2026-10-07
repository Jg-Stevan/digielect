// ============================================================
// DIGIELECT · Métricas de calidad de la foto RECTIFICADA
// [COORD · C-14] Puerto a TypeScript de `metricasCalidad` del
// worker casero (public/e14/deteccion-worker.js) para calcularlas
// en el hilo principal sobre el bitmap del WARP del motor OpenCV
// (el motor real calcula sus métricas en la fase detect, sobre el
// frame — el contrato del score RN-02 las necesita sobre la foto
// rectificada y ANTES de binarizar, misma semántica que el casero).
//
// MISMAS fórmulas y MISMAS normalizaciones que el worker casero
// (que a su vez las heredó de quality.ts de web-scanner) → el
// score RN-02 y las bandas NITIDEZ/CONTRASTE/BRILLO conservan su
// escala histórica:
//   · nitidez   = varianza del Laplaciano 4-vecinos / 140
//   · contraste = desviación estándar del gris / 56
//   · brillo    = semántica de DOCUMENTO (el papel 255 no es un
//                 defecto; penaliza sombra densa y lavado)
// ============================================================

export interface MetricasRgba {
  nitidez: number;
  contraste: number;
  brillo: number;
}

/** Gris Rec. 601 (igual que quality.ts de web-scanner) */
function aGris(rgba: Uint8ClampedArray, n: number): Float32Array {
  const gris = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gris[i] =
      0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return gris;
}

/**
 * Métricas sobre un buffer RGBA completo (se asume ya reducido —
 * el llamador muestrea a ≤360 px antes de llamar).
 */
export function metricasCalidadDeRgba(
  rgba: Uint8ClampedArray,
  W: number,
  H: number
): MetricasRgba {
  const n = W * H;
  if (n === 0 || rgba.length < n * 4) {
    return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
  }
  const gris = aGris(rgba, n);

  // NITIDEZ: varianza del Laplaciano (borde interno, 4-vecinos)
  let suma = 0;
  let suma2 = 0;
  let nLap = 0;
  for (let y = 1; y < H - 1; y++) {
    const fila = y * W;
    for (let x = 1; x < W - 1; x++) {
      const i = fila + x;
      const lap = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - W] - gris[i + W];
      suma += lap;
      suma2 += lap * lap;
      nLap++;
    }
  }
  const varLap = nLap > 0 ? suma2 / nLap - (suma / nLap) * (suma / nLap) : 0;
  const nitidez = Math.max(0, Math.min(1, varLap / 140)); // SHARPNESS_NORM

  // CONTRASTE y BRILLO (semántica de documento del worker casero)
  let s = 0;
  let s2 = 0;
  let sub = 0;
  let oscura = 0;
  for (let i = 0; i < n; i++) {
    const v = gris[i];
    s += v;
    s2 += v * v;
    if (v < 30) sub++;
    if (v < 100) oscura++;
  }
  const media = s / n;
  const desv = Math.sqrt(Math.max(0, s2 / n - media * media));
  const contraste = Math.max(0, Math.min(1, desv / 56));
  const fracSub = sub / n;
  const fracOscura = oscura / n;
  let brillo = 1;
  if (media < 100) brillo -= ((100 - media) / 100) * 1.2; // foto oscura
  if (fracSub > 0.35) brillo -= (fracSub - 0.35) * 2; // sombras dominan
  if (media > 246 && fracOscura < 0.015) brillo -= 0.8; // lavado sin tinta

  return {
    nitidez,
    contraste,
    brillo: Math.max(0, Math.min(1, brillo)),
  };
}

/**
 * Muestrea un bitmap/canvas a ≤360 px y calcula las métricas.
 * (Mismo muestreo que el worker casero: métricas estables y baratas
 * independientes del tamaño real del warp.)
 */
export function metricasDeBitmap(
  fuente: ImageBitmap | HTMLCanvasElement | HTMLImageElement
): MetricasRgba {
  try {
    const LADO = 360;
    const escala = Math.min(1, LADO / Math.max(fuente.width, fuente.height, 1));
    const W = Math.max(24, Math.round(fuente.width * escala));
    const H = Math.max(24, Math.round(fuente.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
    ctx.drawImage(fuente, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    return metricasCalidadDeRgba(data as unknown as Uint8ClampedArray, W, H);
  } catch {
    return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
  }
}

/**
 * [COORD · C-14] Heurística `esEscaneoBordesBlancos` del escáner
 * externo (escaner.ts del fork): los escaneos sobre fondo blanco
 * (actas incrustadas a marco completo) no se recortan — el anillo
 * perimetral es papel puro. Sólo decide fullFrame cuando NO hay
 * quad; en fotos de cámara real los bordes nunca son blanco puro.
 * Portado con la misma doble condición (media de las 4 franjas del
 * anillo > 228 Y ningún píxel del anillo < 195).
 */
export function esEscaneoBordesBlancos(
  fuente: ImageBitmap | HTMLCanvasElement | HTMLImageElement
): boolean {
  try {
    const L = 240;
    const escala = Math.min(1, L / Math.max(fuente.width, fuente.height, 1));
    const W = Math.max(24, Math.round(fuente.width * escala));
    const H = Math.max(24, Math.round(fuente.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(fuente, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const B = 3; // grosor del anillo en px de muestra
    const franjas = [
      { x0: 0, y0: 0, x1: W, y1: B },
      { x0: 0, y0: H - B, x1: W, y1: H },
      { x0: 0, y0: 0, x1: B, y1: H },
      { x0: W - B, y0: 0, x1: W, y1: H },
    ];
    // [C-14 · FIX] Portado FIEL del fork: la condición es sobre
    // MEDIAS POR FRANJA (no por píxel): mediaGlobal (ponderada) >
    // 228 Y la menor de las 4 medias > 195. La versión por píxel
    // era más estricta que el original y una línea impresa del
    // acta que cruce el anillo la anulaba → Canny acababa atrapando
    // quads espurios (tabla interna) en escaneos con margen fino.
    let sumaGlobal = 0;
    let nGlobal = 0;
    let minMedia = 255;
    const grisEn = (i: number): number =>
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    for (const f of franjas) {
      let s = 0;
      let k = 0;
      for (let y = f.y0; y < f.y1; y++) {
        for (let x = f.x0; x < f.x1; x++) {
          s += grisEn((y * W + x) * 4);
          k++;
        }
      }
      if (k === 0) return false;
      const media = s / k;
      minMedia = Math.min(minMedia, media);
      sumaGlobal += media * k;
      nGlobal += k;
    }
    const mediaGlobal = sumaGlobal / nGlobal;
    return mediaGlobal > 228 && minMedia > 195;
  } catch {
    return false;
  }
}
