"use client";

// ============================================================
// DIGITALIZADOR E-14 — Cliente del motor de escáner
// Puerto fiel del motor de visión de web-scanner v6.2 según la
// GUÍA MAESTRA (INSTRUCCIONES_REPLICA_MOTOR_VISION_OPENCV.md):
//   · DetectionWorker REAL con OpenCV.js 4.5.5 (public/scanner/
//     detection-worker.js): Canny 6 pasadas + RANSAC (refineQuad)
//     + shrink 3.5 px + warpPerspective INTER_CUBIC.
//   · Cero Sobel casero: detección/warp SIEMPRE vía
//     detector-client.ts (singleton self-healing, 1 mensaje en
//     vuelo, ImageBitmap transferible).
//   · Filtros por image-modes.ts (Bradley-Roth t=0.15, ventana
//     w/12, despeckle 3 px) — MISMA matemática que el worker
//     para el fallback canvas.
//   · PROCESSED_MAX_LONG_SIDE = 4032 px (NUNCA 3200).
// ============================================================

import {
  getScannerWorker,
  warmUpScannerWorker,
  type EnhanceMode,
} from "./detector-client";
import { enhanceToRgba } from "./image-modes";

export type Punto = { x: number; y: number };
/** Quad normalizado 0-1, orden FIJO: TL, TR, BR, BL */
export type Quad = [Punto, Punto, Punto, Punto];
export type FiltroPagina = "original" | "texto" | "bw";

export interface CalidadWarp {
  nitidez: number;
  contraste: number;
  brillo: number;
}

export interface ResultadoProceso {
  dataUrl: string;
  w: number;
  h: number;
  calidad: CalidadWarp;
  fullFrame: boolean;
}

export interface NivelCalidad {
  nivel: "excellent" | "good" | "fair" | "poor";
  label: string;
  sharpness: number;
  brightness: number;
  contrast: number;
  score: number; // 0-100
}

// ------------------------------------------------------------
// Constantes de la especificación (INTOCABLES)
// ------------------------------------------------------------

/** Tope del lado mayor de la foto procesada (12.2 MP). NUNCA 3200. */
const PROCESSED_MAX_LONG_SIDE = 4032;
const CAP_DECODE = 4032;
const CAP_PREVIEW = 1500;
/** Fuente reducida para el warp de PREVIEW (respuesta ágil del editor). */
const CAP_WARP_PREVIEW = 2000;

/** Marco provisional cuando aún no hay detección */
export function quadPorDefecto(): Quad {
  return [
    { x: 0.08, y: 0.1 },
    { x: 0.92, y: 0.06 },
    { x: 0.95, y: 0.92 },
    { x: 0.05, y: 0.95 },
  ];
}

/** Clave única del estado (quad+filtro+rotación): cache-miss ⇒ reproceso */
export function clavePagina(p: {
  id: string;
  quad: Quad;
  filtro: FiltroPagina;
  rotacion: number;
}): string {
  return `${p.id}|${p.quad.map((q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`).join(";")}|${p.filtro}|${p.rotacion}`;
}

/** Quad del marco COMPLETO (sin recorte) */
export function quadMarcoCompleto(): Quad {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

let uid = 0;
export function siguienteId(prefijo: string): string {
  return `${prefijo}-${Date.now().toString(36)}-${++uid}`;
}

/** Precalienta el pipeline OpenCV (llamar al montar la app) */
export function precalentarEscaner(): void {
  warmUpScannerWorker();
}

// ------------------------------------------------------------
// Decodificación con caché de una entrada (decode ÚNICO)
// ------------------------------------------------------------

interface Decodificada {
  url: string;
  bitmap: ImageBitmap | HTMLImageElement;
  w: number;
  h: number;
}
let cacheDecode: Decodificada | null = null;

async function decodificar(url: string): Promise<Decodificada> {
  if (cacheDecode && cacheDecode.url === url) return cacheDecode;
  let bitmap: ImageBitmap | HTMLImageElement;
  let w: number;
  let h: number;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    // capar al tamaño de trabajo (nunca inventar nitidez, solo reducir)
    const escala = Math.min(1, CAP_DECODE / Math.max(bmp.width, bmp.height));
    if (escala < 1) {
      w = Math.max(16, Math.round(bmp.width * escala));
      h = Math.max(16, Math.round(bmp.height * escala));
      const reducido = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h });
      bmp.close();
      bitmap = reducido;
    } else {
      w = bmp.width;
      h = bmp.height;
      bitmap = bmp;
    }
  } catch {
    // fallback <img> (data URLs grandes, navegadores sin createImageBitmap)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      im.src = url;
    });
    const escala = Math.min(1, CAP_DECODE / Math.max(img.naturalWidth, img.naturalHeight));
    w = Math.max(16, Math.round(img.naturalWidth * escala));
    h = Math.max(16, Math.round(img.naturalHeight * escala));
    bitmap = img;
  }
  // soltar el bitmap anterior de la caché (R-14: no esperar al GC)
  if (cacheDecode && cacheDecode.bitmap instanceof ImageBitmap) {
    try {
      cacheDecode.bitmap.close();
    } catch {
      /* ya cerrado */
    }
  }
  cacheDecode = { url, bitmap, w, h };
  return cacheDecode;
}

function lienzoDe(d: Decodificada, maxLong?: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } {
  const escala = maxLong ? Math.min(1, maxLong / Math.max(d.w, d.h)) : 1;
  const w = Math.max(16, Math.round(d.w * escala));
  const h = Math.max(16, Math.round(d.h * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(d.bitmap as CanvasImageSource, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

function liberarCanvas(c: HTMLCanvasElement): void {
  // R-14: soltar el backing store YA, no esperar al GC
  c.width = 0;
  c.height = 0;
}

/** Quad 0-1 válido (clamp ±5% del worker) o null */
function quadDeCorners(f: Float32Array | null): Quad | null {
  if (!f || f.length !== 8) return null;
  for (let i = 0; i < 8; i++) {
    if (!Number.isFinite(f[i]) || f[i] < -0.05 || f[i] > 1.05) return null;
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    { x: clamp(f[0]), y: clamp(f[1]) },
    { x: clamp(f[2]), y: clamp(f[3]) },
    { x: clamp(f[4]), y: clamp(f[5]) },
    { x: clamp(f[6]), y: clamp(f[7]) },
  ];
}

/** true cuando el papel llena TODO el marco (esquinas a ≤3.5% del borde) */
function esQuadMarcoCompleto(q: Quad): boolean {
  const TOL = 0.035;
  const cerca = (v: number, borde: number) => Math.abs(v - borde) <= TOL;
  return (
    cerca(q[0].x, 0) && cerca(q[0].y, 0) &&
    cerca(q[1].x, 1) && cerca(q[1].y, 0) &&
    cerca(q[2].x, 1) && cerca(q[2].y, 1) &&
    cerca(q[3].x, 0) && cerca(q[3].y, 1)
  );
}

/**
 * true cuando la FOTO ya es un escaneo sobre fondo blanco (actas reales
 * incrustadas): los 4 bordes del frame son papel claro uniforme. En una
 * foto de cámara real (mesa/sombra/viñeteado) los bordes nunca son blanco
 * puro → la detección OpenCV manda. Solo decide fullFrame, no la detección.
 */
function esEscaneoBordesBlancos(d: Decodificada): boolean {
  try {
    const L = 240;
    const escala = Math.min(1, L / Math.max(d.w, d.h));
    const W = Math.max(24, Math.round(d.w * escala));
    const H = Math.max(24, Math.round(d.h * escala));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(d.bitmap as CanvasImageSource, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    liberarCanvas(c);
    const B = 3; // grosor del anillo en px de muestra
    let suma = 0;
    let n = 0;
    let minMedia = 255;
    // 4 franjas (arriba/abajo/izq/der) → media de cada una
    for (const franja of [
      { x0: 0, y0: 0, x1: W, y1: B },
      { x0: 0, y0: H - B, x1: W, y1: H },
      { x0: 0, y0: 0, x1: B, y1: H },
      { x0: W - B, y0: 0, x1: W, y1: H },
    ]) {
      let s = 0;
      let k = 0;
      for (let y = franja.y0; y < franja.y1; y++) {
        for (let x = franja.x0; x < franja.x1; x++) {
          const i = (y * W + x) * 4;
          s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          k++;
        }
      }
      if (k === 0) return false;
      const media = s / k;
      minMedia = Math.min(minMedia, media);
      suma += media * k;
      n += k;
    }
    const mediaGlobal = suma / n;
    return mediaGlobal > 228 && minMedia > 195;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// API pública — DETECCIÓN
// ------------------------------------------------------------

/** Detecta bordes del documento en una imagen (OpenCV 4.5.5: Canny
 *  6 pasadas + validación de quads convexos, frame ≤400 px).
 *  fullFrame=true SOLO cuando el papel llena TODO el marco (no se
 *  recorta); si la detección falla se devuelve quad=null con
 *  fullFrame=false (el editor ofrece el recorte manual). */
export async function detectarBordes(
  originalUrl: string
): Promise<{ quad: Quad | null; fullFrame: boolean }> {
  try {
    const cliente = getScannerWorker();
    if (!cliente) return { quad: null, fullFrame: false };
    const listo = await cliente.waitReady();
    if (!listo) return { quad: null, fullFrame: false };
    const d = await decodificar(originalUrl);
    // Escaneo sobre fondo blanco (actas reales): el papel YA llena el
    // marco → no recortar nada (evita que atrape marcos internos).
    if (esEscaneoBordesBlancos(d)) {
      return { quad: quadMarcoCompleto(), fullFrame: true };
    }
    const out = await cliente.detect(
      d.bitmap as ImageBitmap | HTMLImageElement,
      d.w,
      d.h
    );
    const quad = quadDeCorners(out?.corners ?? null);
    if (!quad) return { quad: null, fullFrame: false };
    if (esQuadMarcoCompleto(quad)) {
      return { quad: quadMarcoCompleto(), fullFrame: true };
    }
    return { quad, fullFrame: false };
  } catch {
    return { quad: null, fullFrame: false };
  }
}

// ------------------------------------------------------------
// API pública — PROCESADO (warp + filtro)
// ------------------------------------------------------------

function modoEnhance(filtro: FiltroPagina): EnhanceMode {
  if (filtro === "original") return "raw";
  if (filtro === "texto") return "text";
  return "bw";
}

/** Métricas de la foto RECTIFICADA (Laplaciano sobre el warp) */
function metricasDeBitmap(bmp: ImageBitmap | HTMLCanvasElement): CalidadWarp {
  try {
    const L = 360;
    const escala = Math.min(1, L / Math.max(bmp.width, bmp.height));
    const W = Math.max(24, Math.round(bmp.width * escala));
    const H = Math.max(24, Math.round(bmp.height * escala));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    liberarCanvas(c);
    return metricasDe(data, W, H);
  } catch {
    return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
  }
}

function metricasDe(rgba: Uint8ClampedArray, w: number, h: number): CalidadWarp {
  const n = w * h;
  const gris = new Float32Array(n);
  let sm = 0;
  for (let i = 0; i < n; i++) {
    gris[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    sm += gris[i];
  }
  if (n === 0) return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
  const mean = sm / n;
  let sl = 0;
  let sl2 = 0;
  let nL = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - w] - gris[i + w];
      sl += lap;
      sl2 += lap * lap;
      nL++;
    }
  }
  const varLap = nL > 0 ? sl2 / nL - (sl / nL) * (sl / nL) : 0;
  let sg2 = 0;
  for (let i = 0; i < n; i++) {
    const dd = gris[i] - mean;
    sg2 += dd * dd;
  }
  const sigma = Math.sqrt(Math.max(0, sg2 / n));
  return {
    nitidez: Math.min(1, Math.sqrt(Math.max(0, varLap)) / 17.3),
    contraste: Math.min(1, sigma / 51),
    brillo: Math.max(0, Math.min(1, mean / 255)),
  };
}

/** blob → ImageBitmap → rotación → encode final (data URL) */
async function blobAResultado(
  blob: Blob,
  filtro: FiltroPagina,
  rotacion: number
): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const wOut = bmp.width;
  const hOut = bmp.height;
  const rot = rotacion % 360;
  const intercambia = rot === 90 || rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = intercambia ? hOut : wOut;
  canvas.height = intercambia ? wOut : hOut;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Canvas 2D no disponible");
  }
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bmp, -wOut / 2, -hOut / 2);
  ctx.restore();
  bmp.close();

  // PNG para texto/bw (tinta nítida, R-10), JPEG para color
  const mime = filtro === "original" ? "image/jpeg" : "image/png";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          try {
            resolve(canvas.toDataURL(mime, 0.92));
          } catch {
            reject(new Error("No se pudo codificar la imagen"));
          }
          return;
        }
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("No se pudo leer el blob"));
        fr.readAsDataURL(b);
      },
      mime,
      0.92
    );
  });
  const w = canvas.width;
  const h = canvas.height;
  liberarCanvas(canvas);
  return { dataUrl, w, h };
}

/**
 * Procesa la página: warp de perspectiva OpenCV (INTER_CUBIC + RANSAC +
 * shrink 3.5 px cuando NO es manual) + filtro (B/N Bradley-Roth) + rotación.
 * `manual` = quad puesto por el humano (sin encoger 3.5 px).
 */
export async function procesarPagina(opts: {
  originalUrl: string;
  quad: Quad | null;
  filtro: FiltroPagina;
  rotacion: 0 | 90 | 180 | 270;
  manual: boolean;
  preview?: boolean;
}): Promise<ResultadoProceso> {
  const { originalUrl, quad, filtro, rotacion, manual, preview } = opts;
  const cliente = getScannerWorker();
  const listo = cliente ? await cliente.waitReady() : false;

  if (cliente && listo) {
    const d = await decodificar(originalUrl);
    // Preview: fuente reducida (warp ágil); final: resolución COMPLETA 4032
    const capFuente = preview ? CAP_WARP_PREVIEW : PROCESSED_MAX_LONG_SIDE;
    let fuente: ImageBitmap | HTMLCanvasElement | HTMLImageElement = d.bitmap as ImageBitmap | HTMLImageElement;
    let canvasFuente: HTMLCanvasElement | null = null;
    if (capFuente < Math.max(d.w, d.h)) {
      const { canvas } = lienzoDe(d, capFuente);
      canvasFuente = canvas;
      fuente = canvas;
    }
    try {
      // quad null = sin detección → rectificar el marco completo
      const quadWarp = quad ?? quadMarcoCompleto();
      const warpOut = await cliente.warp(fuente, quadWarp, manual);
      if (warpOut) {
        const calidad = metricasDeBitmap(warpOut.bitmap);
        const modo = modoEnhance(filtro);
        const enh = await cliente.enhance(
          warpOut.bitmap,
          modo,
          preview ? { maxLongSide: CAP_PREVIEW } : undefined
        );
        if (enh) {
          const r = await blobAResultado(enh.blob, filtro, rotacion);
          return { ...r, calidad, fullFrame: false };
        }
        // enhance falló → filtro local (image-modes) sobre el warp
        let c: HTMLCanvasElement | null = null;
        try {
          c = document.createElement("canvas");
          c.width = warpOut.bitmap.width;
          c.height = warpOut.bitmap.height;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(warpOut.bitmap, 0, 0);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const out = enhanceToRgba(img.data, c.width, c.height, modo === "raw" ? "raw" : modo === "text" ? "text" : "bw");
            const c2 = document.createElement("canvas");
            c2.width = c.width;
            c2.height = c.height;
            const ctx2 = c2.getContext("2d");
            if (ctx2) {
              const idata = ctx2.createImageData(c.width, c.height);
              idata.data.set(out);
              ctx2.putImageData(idata, 0, 0);
              const blob = await new Promise<Blob | null>((res) => c2.toBlob(res, filtro === "original" ? "image/jpeg" : "image/png", 0.92));
              if (blob) {
                const r = await blobAResultado(blob, filtro, rotacion);
                return { ...r, calidad, fullFrame: false };
              }
            }
          }
        } catch {
          /* cae al fallback completo */
        } finally {
          try {
            warpOut.bitmap.close();
          } catch {
            /* ya cerrado */
          }
          liberarCanvas(c);
        }
      }
    } finally {
      if (canvasFuente) liberarCanvas(canvasFuente);
    }
  }

  // Fallback canvas (worker muerto): bbox del quad + image-modes local
  return procesarFallback(opts);
}

/** Fallback en hilo principal (worker no disponible): misma matemática de
 *  filtros (image-modes), recorte por bbox del quad (degradación controlada). */
async function procesarFallback(opts: {
  originalUrl: string;
  quad: Quad | null;
  filtro: FiltroPagina;
  rotacion: 0 | 90 | 180 | 270;
  manual: boolean;
  preview?: boolean;
}): Promise<ResultadoProceso> {
  const { originalUrl, quad, filtro, rotacion } = opts;
  const cap = opts.preview ? CAP_PREVIEW : PROCESSED_MAX_LONG_SIDE;
  const d = await decodificar(originalUrl);
  const { ctx, w, h } = lienzoDe(d, cap);
  const img = ctx.getImageData(0, 0, w, h);

  let rgba: Uint8ClampedArray;
  let cw = w;
  let ch = h;

  if (quad) {
    const xs = quad.map((p) => p.x * w);
    const ys = quad.map((p) => p.y * h);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(w, Math.ceil(Math.max(...xs)));
    const y1 = Math.min(h, Math.ceil(Math.max(...ys)));
    cw = Math.max(16, x1 - x0);
    ch = Math.max(16, y1 - y0);
    const c2 = document.createElement("canvas");
    c2.width = cw;
    c2.height = ch;
    const ctx2 = c2.getContext("2d", { willReadFrequently: true });
    if (ctx2) {
      ctx2.drawImage(ctx.canvas, x0, y0, cw, ch, 0, 0, cw, ch);
      rgba = ctx2.getImageData(0, 0, cw, ch).data;
    } else {
      rgba = img.data;
      cw = w;
      ch = h;
    }
    liberarCanvas(c2);
  } else {
    rgba = img.data;
  }
  liberarCanvas(ctx.canvas);

  // filtro con la MISMA matemática del worker (image-modes)
  const modo = filtro === "original" ? "raw" : filtro === "texto" ? "text" : "bw";
  const out = enhanceToRgba(rgba, cw, ch, modo);

  const c3 = document.createElement("canvas");
  const rot = rotacion % 360;
  const intercambia = rot === 90 || rot === 270;
  c3.width = intercambia ? ch : cw;
  c3.height = intercambia ? cw : ch;
  const ctx3 = c3.getContext("2d");
  if (!ctx3) throw new Error("Canvas 2D no disponible");
  const tmp = document.createElement("canvas");
  tmp.width = cw;
  tmp.height = ch;
  const tctx = tmp.getContext("2d");
  if (!tctx) throw new Error("Canvas 2D no disponible");
  const idata = tctx.createImageData(cw, ch);
  idata.data.set(out);
  tctx.putImageData(idata, 0, 0);
  ctx3.save();
  ctx3.translate(c3.width / 2, c3.height / 2);
  ctx3.rotate((rot * Math.PI) / 180);
  ctx3.drawImage(tmp, -cw / 2, -ch / 2);
  ctx3.restore();
  liberarCanvas(tmp);

  const mime = filtro === "original" ? "image/jpeg" : "image/png";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    c3.toBlob(
      (blob) => {
        if (!blob) {
          try {
            resolve(c3.toDataURL(mime, 0.92));
          } catch {
            reject(new Error("No se pudo codificar la imagen"));
          }
          return;
        }
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("No se pudo leer el blob"));
        fr.readAsDataURL(blob);
      },
      mime,
      0.92
    );
  });
  const wFinal = c3.width;
  const hFinal = c3.height;
  liberarCanvas(c3);
  return {
    dataUrl,
    w: wFinal,
    h: hFinal,
    calidad: metricasDe(out, cw, ch),
    fullFrame: false,
  };
}

// ------------------------------------------------------------
// CALIDAD — badge de página (spec §11) sobre la ORIGINAL
// ------------------------------------------------------------

export async function evaluarCalidad(originalUrl: string): Promise<NivelCalidad> {
  try {
    const d = await decodificar(originalUrl);
    // Cap por lado LARGO (no ancho): los documentos E-14 son 1:3 y un
    // ancho de 120 px los estruja hasta falsear la nitidez.
    const L = 360;
    const escala = Math.min(1, L / Math.max(d.w, d.h));
    const W = Math.max(24, Math.round(d.w * escala));
    const H = Math.max(24, Math.round(d.h * escala));
    const c2 = document.createElement("canvas");
    c2.width = W;
    c2.height = H;
    const ctx2 = c2.getContext("2d", { willReadFrequently: true });
    if (!ctx2) throw new Error("canvas");
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(d.bitmap as CanvasImageSource, 0, 0, W, H);
    const data = ctx2.getImageData(0, 0, W, H).data;
    liberarCanvas(c2);

    // luma + laplaciano 4-vecinos
    const gris = new Float32Array(W * H);
    let sm = 0;
    for (let i = 0; i < W * H; i++) {
      gris[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      sm += gris[i];
    }
    const mean = sm / (W * H);
    let sl = 0;
    let sl2 = 0;
    let nL = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const lap = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - W] - gris[i + W];
        sl += lap;
        sl2 += lap * lap;
        nL++;
      }
    }
    const varLap = nL > 0 ? sl2 / nL - (sl / nL) * (sl / nL) : 0;
    const sigmaLap = Math.sqrt(Math.max(0, varLap));
    let sg2 = 0;
    for (let i = 0; i < W * H; i++) {
      const dd = gris[i] - mean;
      sg2 += dd * dd;
    }
    const sigmaGray = Math.sqrt(sg2 / (W * H));

    const sharpness = Math.min(100, Math.round(sigmaLap * 2.2));
    // σ_gray en escala 0-255 (documento: papel claro + tinta oscura ⇒ σ alto)
    const contrast = Math.min(100, Math.round(sigmaGray * 1.4));
    const brightness = Math.min(100, Math.round((mean / 255) * 100));
    const score = Math.round(sharpness * 0.45 + brightness * 0.25 + contrast * 0.3);
    const nivel: NivelCalidad["nivel"] =
      score >= 80 ? "excellent" : score >= 62 ? "good" : score >= 45 ? "fair" : "poor";
    const label =
      nivel === "excellent" ? "Excelente" : nivel === "good" ? "Buena" : nivel === "fair" ? "Aceptable" : "Baja";
    return { nivel, label, sharpness, brightness, contrast, score };
  } catch {
    return { nivel: "good", label: "Buena", sharpness: 70, brightness: 70, contrast: 70, score: 70 };
  }
}

/**
 * Mapa del badge de calidad (0-100) al score RN-02 (0-10):
 *   excellent ≥80 → 9-10 · good 62-79 → 6-8 · fair/poor <62 → ≤5
 * Coincide con las bandas: verde ≥9 · ámbar 6-8 · roja ≤5.
 */
export function calidadAScoreRN02(q: number): number {
  if (q >= 80) return Math.min(10, 9 + Math.round((q - 80) / 20));
  if (q >= 62) return Math.min(8, 6 + Math.round((q - 62) / 9));
  return Math.max(0, Math.round(q / 9));
}

/** Miniatura pequeña (data URL) para listas/carruseles */
export async function miniatura(originalUrl: string, lado = 160): Promise<string> {
  try {
    const d = await decodificar(originalUrl);
    const escala = Math.min(1, lado / Math.max(d.w, d.h));
    const w = Math.max(8, Math.round(d.w * escala));
    const h = Math.max(8, Math.round(d.h * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return originalUrl;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(d.bitmap as CanvasImageSource, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.8);
    liberarCanvas(canvas);
    return url;
  } catch {
    return originalUrl;
  }
}

/** Carga y comprime un File/Blob/data-URL/blob-URL a data URL (galería / actas reales) */
export async function archivoADataUrl(
  fuente: Blob | string,
  cap = 4032
): Promise<string> {
  const blob = typeof fuente === "string" ? await (await fetch(fuente)).blob() : fuente;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Formato de imagen no soportado o archivo corrupto"));
        im.src = url;
      });
      bitmap = (await createImageBitmap(img)) as unknown as ImageBitmap;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const escala = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(16, Math.round(bitmap.width * escala));
  const h = Math.max(16, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob2) => {
        if (!blob2) return reject(new Error("No se pudo codificar la imagen"));
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
        fr.readAsDataURL(blob2);
      },
      "image/jpeg",
      0.92
    );
  });
  liberarCanvas(canvas);
  return dataUrl;
}
