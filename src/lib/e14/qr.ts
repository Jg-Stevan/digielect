"use client";

// ============================================================
// DIGIELECT · Decodificador de QR en el cliente
// Basado en el patrón del web-scanner (Jg-Stevan): decodifica
// el código QR del acta E-14 directamente en el navegador
// ANTES de subir la imagen, para:
//  · identificar la ubicación DIVIPOL (puesto + mesa)
//  · clasificar el pliego (ejemplar + página) sin intervención
//  · verificar contra la imagen (VLM) en el servidor
// Motores: BarcodeDetector nativo (Chrome/Android) → jsQR
// (universal) con reintentos a varias escalas.
// ============================================================

import jsQR, { type QRCode } from "jsqr";

export interface ResultadoQr {
  /** Texto decodificado o null */
  texto: string | null;
  /** Motor que logró decodificar */
  motor: "BarcodeDetector" | "jsQR" | null;
  /** Escala relativa usada (1 = resolución original) */
  escala: number;
}

/** Carga un dataURL en un HTMLImageElement */
function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = dataUrl;
  });
}

/** Dibuja la imagen en un canvas a escala dada y devuelve el ctx */
function dibujarEscalado(
  img: HTMLImageElement,
  escala: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx };
}

/** Decodifica con BarcodeDetector nativo si existe */
async function decodificarNativo(canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const AD = (window as unknown as { BarcodeDetector?: new (o?: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!AD) return null;
    const detector = new AD({ formats: ["qr_code"] });
    const resultados = await detector.detect(canvas);
    for (const r of resultados) {
      if (r.rawValue && r.rawValue.trim()) return r.rawValue.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/** Decodifica con jsQR sobre el ImageData de un canvas */
function decodificarJsQR(ctx: CanvasRenderingContext2D, w: number, h: number): QRCode | null {
  try {
    const data = ctx.getImageData(0, 0, w, h);
    return jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
  } catch {
    return null;
  }
}

/**
 * Decodifica el QR de un acta E-14 desde su dataURL.
 * Reintenta a varias escalas (los QR de actas son pequeños y
 * densos; jsQR falla a resoluciones intermedias pero acierta
 * a resolución plena o reducida). Resolución máx. 2400px.
 */
export async function decodeQrDeDataUrl(dataUrl: string): Promise<ResultadoQr> {
  let img: HTMLImageElement;
  try {
    img = await cargarImagen(dataUrl);
  } catch {
    return { texto: null, motor: null, escala: 1 };
  }

  const ladoMax = Math.max(img.naturalWidth, img.naturalHeight);
  const base = ladoMax > 2400 ? 2400 / ladoMax : 1;

  // Escalas a probar: plena (capada), media y baja. El QR del
  // E-14 ocupa ~1/6 del ancho superior → a escala baja también
  // cabe completo.
  const escalas = [base, base * 0.66, base * 0.45];

  for (const escala of escalas) {
    if (escala <= 0 || escala > 1.0001) continue;
    const { canvas, ctx } = dibujarEscalado(img, escala);

    // 1. Motor nativo (rápido y robusto en Android/Chrome)
    const nativo = await decodificarNativo(canvas);
    if (nativo) return { texto: nativo, motor: "BarcodeDetector", escala };

    // 2. jsQR universal
    const qr = decodificarJsQR(ctx, canvas.width, canvas.height);
    if (qr?.data && qr.data.trim()) {
      return { texto: qr.data.trim(), motor: "jsQR", escala };
    }
  }

  // Último recurso: recorte superior (donde vive el QR del E-14)
  if (base > 0) {
    const { canvas, ctx } = dibujarEscalado(img, base);
    const alto = Math.round(canvas.height * 0.4);
    if (alto > 0 && alto < canvas.height) {
      const recorte = document.createElement("canvas");
      recorte.width = canvas.width;
      recorte.height = alto;
      const rctx = recorte.getContext("2d", { willReadFrequently: true })!;
      rctx.drawImage(canvas, 0, 0);
      const nativo = await decodificarNativo(recorte);
      if (nativo) return { texto: nativo, motor: "BarcodeDetector", escala: base };
      const qr = decodificarJsQR(rctx, recorte.width, recorte.height);
      if (qr?.data && qr.data.trim()) {
        return { texto: qr.data.trim(), motor: "jsQR", escala: base };
      }
    }
  }

  return { texto: null, motor: null, escala: base };
}

/**
 * Decodifica el QR desde un frame de video en vivo (busca el
 * código antes de la captura para habilitar el flujo automático).
 * Se usa sobre un canvas de baja resolución (≤ 640px).
 */
export function decodeQrDeVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): string | null {
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const escala = Math.min(1, 640 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * escala));
    const ch = Math.max(1, Math.round(h * escala));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch);
    const qr = jsQR(data.data, cw, ch, { inversionAttempts: "attemptBoth" });
    return qr?.data?.trim() || null;
  } catch {
    return null;
  }
}
