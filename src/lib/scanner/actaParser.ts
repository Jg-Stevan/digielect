// ============================================================
// DIGIELECT · TAREA 1 (PLAN_DIGIELECT_DIGITALIZADOR.md) · C-17
// Módulo de EXTRACCIÓN DETERMINISTA — sin IA en caliente.
//
// Principio (§1.1 del plan): el código impreso entre las equis
// (ej. "X 7-23-10-19 X") ES la llave primaria idTransmissionCode
// ("7231019" al remover guiones) y es 100% único en la base de
// la Registraduría → lookup O(1) sin VLM ni latencia de red.
//
// Este módulo es 100% PURO salvo leerQrFingerprint (jsQR sobre
// canvas, cliente). No adivina: si una señal no se lee, devuelve
// null y el flujo continúa con las señales restantes.
// ============================================================

import { parseBarcode15 } from "@/lib/digitalizador/reglas";
import type { TipoEjemplar } from "@/lib/digitalizador/types";

// ------------------------------------------------------------
// 1) EXTRACTOR DEL idTransmissionCode (código entre las X)
// ------------------------------------------------------------

/**
 * Extrae el código de transmisión de 7 dígitos del texto OCR.
 * Tolerante a espacios, puntos y guiones entre los grupos:
 *   "X 7-23-10-19 X"  → "7231019"
 *   "X 7.23.10.19 X"  → "7231019"
 *   "X 7 23 10 19 X"  → "7231019"
 *   "x7-23-10-19x"    → "7231019"
 * Devuelve null si no hay coincidencia (NUNCA adivina).
 */
export function extractTransmissionCode(ocrText: string): string | null {
  if (!ocrText) return null;
  const regex = /X\s*(\d)[\s\.\-]*(\d{2})[\s\.\-]*(\d{2})[\s\.\-]*(\d{2})\s*X/i;
  const match = ocrText.match(regex);
  if (!match) return null;
  return `${match[1]}${match[2]}${match[3]}${match[4]}`;
}

/**
 * Variante TOLERANTE para OCR ruidoso: acepta la X con confusables
 * (×, ✕) y cae a la zona cruda entre equis. Solo se usa si
 * extractTransmissionCode falló. Devuelve 7 dígitos o null.
 */
export function extractTransmissionCodeTolerante(ocrText: string): string | null {
  if (!ocrText) return null;
  // Mayúsculas primero: el OCR devuelve "x" y "X" indistintamente.
  const limpio = ocrText.toUpperCase().replace(/[×✕]/g, "X");
  const directa = extractTransmissionCode(limpio);
  if (directa) return directa;
  // Zona cruda entre dos X (o una):
  const primera = limpio.indexOf("X");
  if (primera < 0) return null;
  const ultima = limpio.lastIndexOf("X");
  const zona =
    ultima > primera
      ? limpio.slice(primera + 1, ultima)
      : limpio.slice(0, primera).length >= limpio.slice(primera + 1).length
        ? limpio.slice(0, primera)
        : limpio.slice(primera + 1);
  // [C-17] Dentro de la zona delimitada por X el contenido esperado son
  // SIEMPRE 7 dígitos: una letra ahí es una mala lectura del OCR.
  // Correcciones seguras (observadas en actas reales): 7→T · 0→O · 1→I/L.
  // La corrección SOLO se acepta si el resultado tiene exactamente 7
  // dígitos — si no, null (el plan ordena NUNCA adivinar).
  const conCorrecciones = zona
    .replace(/[T]/g, "7")
    .replace(/[Oo]/g, "0")
    .replace(/[IilL|]/g, "1");
  const digitos = conCorrecciones.replace(/\D/g, "");
  // El código exterior tiene exactamente 7 dígitos (1+2+2+2).
  return digitos.length === 7 ? digitos : null;
}

/**
 * [C-17] Extrae un barcode15 del TEXTO OCR (el E-14 imprime los 15
 * dígitos bajo el código de barras). TAREA 1.2 del plan: tipo y página
 * deterministas sin VLM. Acepta el primer run de 15 dígitos parseable.
 */
export function extraerBarcode15DeTexto(
  texto: string | null | undefined
): SenalesBarcode15 | null {
  if (!texto) return null;
  const runs = texto.match(/\d{15}/g) ?? [];
  for (const run of runs) {
    const senales = extraerSenalesBarcode15(run);
    if (senales) return senales;
  }
  return null;
}

/**
 * Zona "X ··· X" cruda (sin normalizar) para auditoría/UI.
 * Mismo criterio que ocr-local.ts, duplicado aquí a propósito:
 * este módulo NO arrastra el motor Tesseract al bundle.
 */
export function extraerCodigoXCrudo(texto: string): string | null {
  if (!texto) return null;
  const m = /X\s*[\d][\d\-.,\s]{3,20}[\d]\s*X/i.exec(texto);
  return m ? m[0].trim() : null;
}

// ------------------------------------------------------------
// 2) EXTRACTOR DEL barcode15 → tipo de ejemplar + página
//    (delega en la regla AUDITADA parseBarcode15: fuente única
//    de verdad en reglas.ts — dígito 9: 1=CLAVEROS 2=DELEGADOS
//    3=TRANSMISION · dígitos 12-13: página · 14-15: total)
// ------------------------------------------------------------

export interface SenalesBarcode15 {
  barcode15: string;
  tipoActa: TipoEjemplar;
  pagina: number;
  totalPaginas: number;
}

/**
 * Parsea un barcode15 crudo (OCR/VLM/digitado) a las señales del
 * plan (TAREA 1.2). Si el dígito de tipo es 1 (CLAVEROS) u otro
 * inválido, devuelve null con la razón — el llamador decide.
 */
export function extraerSenalesBarcode15(
  raw: string | null | undefined
): SenalesBarcode15 | null {
  const parsed = parseBarcode15(raw);
  if (!parsed.ok) return null;
  return {
    barcode15: `${parsed.info.eleccion}${parsed.info.kit}${parsed.info.digitoTipo}${parsed.info.version}${String(parsed.info.pagina).padStart(2, "0")}${String(parsed.info.totalPaginas).padStart(2, "0")}`,
    tipoActa: parsed.tipoEjemplar,
    pagina: parsed.info.pagina,
    totalPaginas: parsed.info.totalPaginas,
  };
}

// ------------------------------------------------------------
// 3) EXTRACTOR DEL QR → qrFingerprint (jsQR, cliente)
// ------------------------------------------------------------

/**
 * El QR del E-14 contiene un digest criptográfico de 32 bytes en
 * base64url (44 caracteres). NO es descifrable en el dispositivo:
 * se usa estrictamente como HUELLA de deduplicación (idempotencia)
 * y sello de verificación en la interfaz (§1.1 del plan).
 */
const QR_HUELLA_RE = /^[A-Za-z0-9_-]{44}$/;

export function esHuellaQrValida(texto: string | null | undefined): boolean {
  return QR_HUELLA_RE.test((texto ?? "").trim());
}

/**
 * Lee el QR de una imagen (data URL) con jsQR y devuelve el texto
 * decodificado. FALLA SUAVE: null si no hay QR legible — el plan
 * (TAREA 1.3) ordena NO detener el proceso si el código entre las
 * X fue detectado. Corre en el cliente (canvas 2D).
 */
export async function leerQrFingerprint(
  imagenDataUrl: string
): Promise<string | null> {
  if (typeof window === "undefined" || !imagenDataUrl) return null;
  try {
    const mod = (await import("jsqr")) as {
      default: (
        d: Uint8ClampedArray,
        w: number,
        h: number
      ) => { data: string } | null;
    };
    const jsQR = mod.default;
    const img = await cargarImagen(imagenDataUrl);
    // Escala de grises a resolución razonable para jsQR (rápido y
    // suficiente: el QR del E-14 es grande respecto al papel).
    const lado = Math.min(1024, Math.max(img.naturalWidth, img.naturalHeight));
    const escala = lado / Math.max(img.naturalWidth, img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const resultado = jsQR(data.data, w, h);
    if (!resultado?.data) return null;
    const texto = resultado.data.trim();
    return texto.length >= 8 ? texto : null;
  } catch {
    return null;
  }
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen_invalida"));
    img.src = src;
  });
}

// ------------------------------------------------------------
// 4) GUARD ANTI-CRUCES (TAREA 4.3) — barcode15 ↔ texto de página
// ------------------------------------------------------------

export type VeredictoCruce =
  | { ok: true }
  | { ok: false; motivo: string; severidad: "ANOMALIA" };

/** Anclas impresas de la PÁGINA 1 (nivelación es exclusiva de P1). */
const ANCLAS_PAGINA_1 = [
  /NIVELACI[ÓO]N\s+DE\s+LA\s+MESA/i,
  /CIUDADANOS\s+H[ÁA]BILES/i,
];
/** Anclas impresas de la PÁGINA 2 (totales de la votación). */
const ANCLAS_PAGINA_2 = [
  /TOTAL\s+DE\s+VOTOS/i,
  /RESULTADOS?\s+DE\s+LA\s+VOTACI[ÓO]N/i,
  /VOTOS\s+EN\s+BLANCO/i,
];

/**
 * Valida la consistencia entre la página que declara el barcode15
 * y las anclas de texto detectadas por OCR (TAREA 4.3: "el sistema
 * NUNCA debe adivinar"). Si hay contradicción → ANOMALÍA y nuevo
 * encuadre del operario.
 */
export function validarCrucePagina(args: {
  paginaBarcode: number | null;
  textoOcr: string | null | undefined;
}): VeredictoCruce {
  const { paginaBarcode, textoOcr } = args;
  if (!paginaBarcode || !textoOcr) return { ok: true }; // sin segunda señal: nada que cruzar

  const anclaP1 = ANCLAS_PAGINA_1.some((re) => re.test(textoOcr));
  const anclaP2 = ANCLAS_PAGINA_2.some((re) => re.test(textoOcr));

  if (paginaBarcode === 1 && anclaP2 && !anclaP1) {
    return {
      ok: false,
      severidad: "ANOMALIA",
      motivo:
        "CRUCE DE PÁGINA: el código declara PÁGINA 1 pero el texto corresponde a la PÁGINA 2. Reencuadre y reescanee.",
    };
  }
  if (paginaBarcode === 2 && anclaP1 && !anclaP2) {
    return {
      ok: false,
      severidad: "ANOMALIA",
      motivo:
        "CRUCE DE PÁGINA: el código declara PÁGINA 2 pero el texto muestra NIVELACIÓN DE LA MESA (PÁGINA 1). Reencuadre y reescanee.",
    };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// 5) CÁLCULO DEL qualityScore (TAREA 3.1) — FÓRMULA EXACTA DEL PLAN
// ------------------------------------------------------------

export interface ParamsQualityScore {
  /** 0-100, varianza laplaciana (nitidez física de la foto) */
  sharpness: number;
  /** 0-100, histograma (contraste) */
  contrast: number;
  hasTransmissionCode: boolean; // +40 pts
  hasQrFingerprint: boolean;    // +20 pts
  hasBarcode15: boolean;        // +20 pts
  crossValidationMatched: boolean; // +20 pts
}

/**
 * qualityScore 0-100 del plan (TAREA 3.1), implementación EXACTA:
 *   · señales deterministas: 40 (X) + 20 (QR) + 20 (barcode) + 20 (cruce)
 *   · moduladas por nitidez física (70%) y contraste (30%) con peso 30%
 */
export function calculateQualityScore(params: ParamsQualityScore): number {
  let score = 0;
  if (params.hasTransmissionCode) score += 40;
  if (params.hasQrFingerprint) score += 20;
  if (params.hasBarcode15) score += 20;
  if (params.crossValidationMatched) score += 20;

  const visualWeight = (params.sharpness * 0.7 + params.contrast * 0.3) / 100;
  return Math.min(100, Math.round(score * 0.7 + visualWeight * 100 * 0.3));
}
