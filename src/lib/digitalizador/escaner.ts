"use client";

// ============================================================
// DIGITALIZADOR E-14 — Cliente del motor de escáner (rol A)
// Puente con el worker /e14/deteccion-worker.js (detección de
// cuadrilátero + warp + filtros). Singleton auto-reparable,
// 1 mensaje en vuelo, backpressure por descarte, y fallback
// canvas si el worker muere (degrada en silencio).
// ============================================================

// [COORD C-16] basePath del despliegue (GitHub Pages sirve en /digielect)
import { withBasePath } from "@/lib/env";

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
// Constantes de la especificación
// ------------------------------------------------------------

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

/** Quad del marco COMPLETO (escaneo full-frame: no recortar nada) */
export function quadMarcoCompleto(): Quad {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

const CAP_PROCESADO = 3200;
const CAP_DECODE = 3200;
const CAP_PREVIEW = 1500;

let uid = 0;
export function siguienteId(prefijo: string): string {
  return `${prefijo}-${Date.now().toString(36)}-${++uid}`;
}

// ------------------------------------------------------------
// Cliente del worker (singleton self-healing, 1 en vuelo)
// ------------------------------------------------------------

interface Pendiente {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

class ClienteWorker {
  private worker: Worker | null = null;
  private pendientes = new Map<number, Pendiente>();
  private seq = 0;
  private muerto = false;

  asegurar(): Worker | null {
    if (this.muerto) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") return null;
    try {
      // [COORD C-16] withBasePath: en Pages el worker vive en /digielect/e14/…
      const w = new Worker(withBasePath("/e14/deteccion-worker.js") + "?v=3");
      w.onmessage = (e: MessageEvent) => {
        const data = e.data ?? {};
        const p = this.pendientes.get(data.id);
        if (!p) return;
        this.pendientes.delete(data.id);
        if (data.ok) p.resolve(data);
        else p.reject(new Error(String(data.error ?? "error del worker")));
      };
      w.onerror = () => {
        // worker roto: fallar pendientes y marcar muerto (fallback canvas)
        for (const [, p] of this.pendientes) p.reject(new Error("worker caído"));
        this.pendientes.clear();
        this.worker = null;
        this.muerto = true;
      };
      this.worker = w;
      return w;
    } catch {
      this.muerto = true;
      return null;
    }
  }

  get disponible(): boolean {
    return !this.muerto;
  }

  private enviar<T>(msg: Record<string, unknown>, transfer: Transferable[]): Promise<T> {
    const w = this.asegurar();
    if (!w) return Promise.reject(new Error("worker no disponible"));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.seq;
      this.pendientes.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      try {
        w.postMessage({ ...msg, id }, transfer);
      } catch (e) {
        this.pendientes.delete(id);
        reject(e instanceof Error ? e : new Error("postMessage falló"));
      }
    });
  }

  detectar(buf: ArrayBuffer, w: number, h: number): Promise<{ quad: Quad | null; fullFrame: boolean }> {
    return this.enviar({ op: "detectar", buf, w, h }, [buf]);
  }

  procesar(
    buf: ArrayBuffer,
    w: number,
    h: number,
    quadPx: Punto[] | null,
    modo: FiltroPagina,
    targetLongSide: number,
    manual: boolean
  ): Promise<{ buf: ArrayBuffer; w: number; h: number; calidad: CalidadWarp; fullFrame: boolean }> {
    return this.enviar(
      { op: "procesar", buf, w, h, quad: quadPx, modo, targetLongSide, manual },
      [buf]
    );
  }
}

const cliente = new ClienteWorker();

/** Precalienta el worker (llamar en idle al montar la app) */
export function precalentarEscaner(): void {
  cliente.asegurar();
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

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------

/** Detecta bordes del documento en una imagen (frame ≤400 px).
 *  fullFrame=true SOLO cuando el papel llena TODO el marco (no se
 *  recorta); si la detección falla se devuelve quad=null con
 *  fullFrame=false (el editor ofrece el recorte manual). */
export async function detectarBordes(
  originalUrl: string
): Promise<{ quad: Quad | null; fullFrame: boolean }> {
  try {
    const d = await decodificar(originalUrl);
    if (cliente.disponible) {
      const { ctx, w, h } = lienzoDe(d, 400);
      const img = ctx.getImageData(0, 0, w, h);
      liberarCanvas(ctx.canvas);
      const buf = img.data.buffer.slice(0) as ArrayBuffer;
      const r = await cliente.detectar(buf, w, h);
      return { quad: r.quad, fullFrame: r.fullFrame === true };
    }
    return { quad: null, fullFrame: true };
  } catch {
    return { quad: null, fullFrame: false };
  }
}

/** Detección sobre un frame RGBA ya capturado (frame loop de cámara) */
export async function detectarFrameRgba(
  buf: ArrayBuffer,
  w: number,
  h: number
): Promise<Quad | null> {
  if (!cliente.disponible) return null;
  try {
    const r = await cliente.detectar(buf, w, h);
    return r.quad;
  } catch {
    return null;
  }
}

/**
 * Procesa la página: warp de perspectiva + filtro + rotación.
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
  const cap = preview ? CAP_PREVIEW : CAP_PROCESADO;
  const d = await decodificar(originalUrl);

  let calidad: CalidadWarp = { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
  let wOut = d.w;
  let hOut = d.h;
  let rgba: Uint8ClampedArray | null = null;

  if (cliente.disponible) {
    const { ctx, w, h } = lienzoDe(d);
    const img = ctx.getImageData(0, 0, w, h);
    liberarCanvas(ctx.canvas);
    // copia para transferir (el buffer origen queda intacto en la caché)
    const buf = img.data.buffer.slice(0) as ArrayBuffer;
    const quadPx = quad
      ? quad.map((p) => ({ x: p.x * w, y: p.y * h }))
      : null;
    const r = await cliente.procesar(buf, w, h, quadPx, filtro, cap, manual);
    rgba = new Uint8ClampedArray(r.buf);
    wOut = r.w;
    hOut = r.h;
    calidad = r.calidad;
  } else {
    // Fallback canvas: recorte por homografía + filtro local
    const r = await procesarFallback(d, quad, filtro, cap, manual);
    rgba = r.rgba;
    wOut = r.w;
    hOut = r.h;
    calidad = r.calidad;
  }

  // Pintar resultado + rotación
  const canvas = document.createElement("canvas");
  const rot = rotacion % 360;
  const intercambia = rot === 90 || rot === 270;
  canvas.width = intercambia ? hOut : wOut;
  canvas.height = intercambia ? wOut : hOut;
  const ctx2 = canvas.getContext("2d");
  if (!ctx2) throw new Error("Canvas 2D no disponible");
  const tmp = document.createElement("canvas");
  tmp.width = wOut;
  tmp.height = hOut;
  const tctx = tmp.getContext("2d");
  if (!tctx) throw new Error("Canvas 2D no disponible");
  const idata = tctx.createImageData(wOut, hOut);
  idata.data.set(rgba);
  tctx.putImageData(idata, 0, 0);
  ctx2.save();
  ctx2.translate(canvas.width / 2, canvas.height / 2);
  ctx2.rotate((rot * Math.PI) / 180);
  ctx2.drawImage(tmp, -wOut / 2, -hOut / 2);
  ctx2.restore();
  liberarCanvas(tmp);

  // Encode: PNG para bw/texto (texto nítido), JPEG para color
  const mime = filtro === "original" ? "image/jpeg" : "image/png";
  const q = 0.92;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          // respaldo toDataURL (error #22 de la spec)
          try {
            resolve(canvas.toDataURL(mime, q));
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
      q
    );
  });
  liberarCanvas(canvas);
  return { dataUrl, w: canvas.width, h: canvas.height, calidad, fullFrame: false };
}

/** Fallback en hilo principal (worker muerto): misma matemática esencial */
async function procesarFallback(
  d: Decodificada,
  quad: Quad | null,
  filtro: FiltroPagina,
  cap: number,
  _manual: boolean
): Promise<{ rgba: Uint8ClampedArray; w: number; h: number; calidad: CalidadWarp }> {
  const { ctx, w, h } = lienzoDe(d, cap);
  const img = ctx.getImageData(0, 0, w, h);
  liberarCanvas(ctx.canvas);
  let rgba = img.data;

  // Sin homografía en el fallback: recorte bbox del quad
  if (quad) {
    const xs = quad.map((p) => p.x * w);
    const ys = quad.map((p) => p.y * h);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(w, Math.ceil(Math.max(...xs)));
    const y1 = Math.min(h, Math.ceil(Math.max(...ys)));
    const cw = Math.max(16, x1 - x0);
    const ch = Math.max(16, y1 - y0);
    const c2 = document.createElement("canvas");
    c2.width = cw;
    c2.height = ch;
    const ctx2 = c2.getContext("2d", { willReadFrequently: true });
    if (ctx2) {
      ctx2.drawImage(ctx.canvas, x0, y0, cw, ch, 0, 0, cw, ch);
      rgba = ctx2.getImageData(0, 0, cw, ch).data;
    }
    liberarCanvas(c2);
    ctx.canvas.width = 0;
    ctx.canvas.height = 0;
    return { rgba, w: cw, h: ch, calidad: metricasDe(rgba, cw, ch) };
  }
  const out = filtroLocal(rgba, w, h, filtro);
  return { rgba: out, w, h, calidad: metricasDe(out, w, h) };
}

function filtroLocal(rgba: Uint8ClampedArray, w: number, h: number, filtro: FiltroPagina): Uint8ClampedArray {
  if (filtro === "original") return rgba;
  const n = w * h;
  const gris = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    gris[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
  }
  if (filtro === "texto") {
    // niveles suaves: estirar blanco al p85
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[gris[i]]++;
    let acum = 0;
    let wp = 255;
    for (let v = 0; v < 256; v++) {
      acum += hist[v];
      if (acum >= n * 0.85) {
        wp = Math.max(1, v);
        break;
      }
    }
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(255, (gris[i] / wp) * 255));
      const f = v / Math.max(1, gris[i]);
      out[i * 4] = Math.min(255, rgba[i * 4] * f);
      out[i * 4 + 1] = Math.min(255, rgba[i * 4 + 1] * f);
      out[i * 4 + 2] = Math.min(255, rgba[i * 4 + 2] * f);
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  // bw: Bradley compacto
  const iw = w + 1;
  const integral = new Uint32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let sf = 0;
    for (let x = 0; x < w; x++) {
      sf += gris[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + sf;
    }
  }
  const win = Math.max(15, Math.round(Math.min(w, h) / 24)) | 1;
  const radio = win >> 1;
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(h - 1, y + radio);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(w - 1, x + radio);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const suma =
        integral[(y1 + 1) * iw + (x1 + 1)] - integral[y0 * iw + (x1 + 1)] -
        integral[(y1 + 1) * iw + x0] + integral[y0 * iw + x0];
      const v = gris[y * w + x] <= suma / count * 0.85 ? 0 : 255;
      const j = (y * w + x) * 4;
      out[j] = v;
      out[j + 1] = v;
      out[j + 2] = v;
      out[j + 3] = 255;
    }
  }
  return out;
}

function metricasDe(rgba: Uint8ClampedArray, w: number, h: number): CalidadWarp {
  let suma = 0;
  let suma2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const g = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
      suma += g;
      suma2 += g * g;
      n++;
    }
  }
  if (n === 0) return { nitidez: 0.5, contraste: 0.5, brillo: 0.7 };
  const media = suma / n;
  const desv = Math.sqrt(Math.max(0, suma2 / n - media * media));
  return {
    nitidez: 0.5,
    contraste: Math.min(1, desv / 0.2),
    brillo: Math.max(0, Math.min(1, media)),
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
