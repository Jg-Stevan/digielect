// ============================================================
// DIGIELECT · OCR local en dispositivo (rol A)
// Lee las señales de texto del contrato CapturaProcesada sobre
// el RECORTE del tercio superior del acta ya procesada (B/N):
//   · textoSuperior  — texto crudo de la banda superior
//   · codigoXCrudo   — la zona "X 7-23-10-19 X" SIN normalizar
//   · encabezadoCrudo — grupos de dígitos DIVIPOL de una misma
//     línea, en orden de aparición (crudo, sin normalizar)
//
// Motor: Tesseract.js (spa+eng) VENDORIZADO (D-23, canon):
//   · los binarios viven en /public/vendor/tesseract/** y el
//     Service Worker los cachea → el OCR funciona SIN RED
//     (contingencia de jornada).
//   · si el vendor no está en el despliegue, cae al CDN público
//     (degradación suave, como antes).
//   · CORRE EN SEGUNDO PLANO: la revisión nunca lo espera
//     (píldora "LEYENDO TEXTO…" en la UI).
//   · FALLA SUAVE: sin red y sin vendor → null y las señales
//     quedan parciales; el flujo continúa.
// ============================================================

import { withBasePath } from "@/lib/env";

const VENDOR = "/vendor/tesseract";
const TESS_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist";
const TESS_CORE_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1";
const TESS_LANG_CDN = "https://tessdata.projectnaptha.com/4.0.0";
const LADO_OCR = 1600;
const TIMEOUT_MS = 30_000;

interface RutasMotor {
  script: string;
  worker: string;
  core: string;
  lang: string;
}

function rutasLocales(): RutasMotor {
  return {
    script: withBasePath(`${VENDOR}/tesseract.min.js`),
    worker: withBasePath(`${VENDOR}/worker.min.js`),
    core: withBasePath(`${VENDOR}/core`),
    lang: withBasePath(`${VENDOR}/lang`),
  };
}

const rutasCdn: RutasMotor = {
  script: `${TESS_CDN}/tesseract.min.js`,
  worker: `${TESS_CDN}/worker.min.js`,
  core: TESS_CORE_CDN,
  lang: TESS_LANG_CDN,
};

interface TesseractLike {
  createWorker: (
    langs: string[],
    oem?: number,
    opts?: Record<string, unknown>
  ) => Promise<{
    recognize: (img: string) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<unknown>;
  }>;
}

let tessProm: Promise<{ Tesseract: TesseractLike; rutas: RutasMotor } | null> | null = null;

/**
 * Carga perezosa del UMD de Tesseract (una sola vez).
 * D-23: LOCAL primero (el vendor vive en el dispositivo y el SW lo
 * cachea — el OCR funciona sin red); CDN sólo como respaldo si el
 * vendor no existe en este despliegue.
 */
async function cargarTesseract(): Promise<{
  Tesseract: TesseractLike;
  rutas: RutasMotor;
} | null> {
  if (tessProm) return tessProm;
  tessProm = (async () => {
    const w = window as unknown as { Tesseract?: TesseractLike };
    try {
      const head = await fetch(rutasLocales().script, { method: "HEAD" });
      if (head.ok) {
        const rutas = rutasLocales();
        const T = await inyectarScript(rutas.script);
        if (T) return { Tesseract: T, rutas };
      }
    } catch {
      /* vendor ausente → CDN */
    }
    const T = await inyectarScript(rutasCdn.script);
    return T ? { Tesseract: T, rutas: rutasCdn } : null;
  })();
  return tessProm;
}

/** Inyecta el UMD y resuelve el global (null si falla) */
function inyectarScript(src: string): Promise<TesseractLike | null> {
  return new Promise((resolve) => {
    try {
      const w = window as unknown as { Tesseract?: TesseractLike };
      if (w.Tesseract) {
        resolve(w.Tesseract);
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(w.Tesseract ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    } catch {
      resolve(null);
    }
  });
}

function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen_invalida"));
    img.src = dataUrl;
  });
}

export interface SenalesOcr {
  textoSuperior: string;
  codigoXCrudo: string | null;
  encabezadoCrudo:
    | { pais?: string; zona?: string; puesto?: string; mesa?: string }
    | undefined;
}

/**
 * Extrae la zona "X ··· X" cruda del texto OCR.
 * SIN normalizar: la normalización es del identificador (rol C).
 */
export function extraerCodigoX(texto: string): string | null {
  if (!texto) return null;
  const m = /X\s*[\d][\d\-.,\s]{3,20}[\d]\s*X/i.exec(texto);
  return m ? m[0].trim() : null;
}

/**
 * Extrae el encabezado DIVIPOL crudo del texto OCR del acta.
 * El formulario E-14 imprime las señas ETIQUETADAS (fuente más
 * estable para el OCR que la línea DIVIPOL desnuda):
 *   "PAIS: 495 - ITALIA" · "ZONA: 10 PUESTO: 02 MESA: 001"
 * y, por encima, la línea "DIVIPOL 88 495 10 02"
 *   (88 = departamento/exterior · 495 = municipio · zona · puesto).
 * Mapeo al contrato (rol C): pais = municipio del consulado (ancla
 * del exterior), zona, puesto y mesa aparte. Crudo, sin normalizar.
 */
export function extraerEncabezadoCrudo(
  texto: string
): { pais?: string; zona?: string; puesto?: string; mesa?: string } | undefined {
  if (!texto) return undefined;

  // 1ª fuente: campos etiquetados del formulario — la primera aparición
  // de la etiqueta seguida de su número (en cualquier línea).
  const etiqueta = (re: RegExp): string | undefined =>
    re.exec(texto)?.[1];
  const pais = etiqueta(/\bPA[IÍ]S\b[^\d\n]{0,8}(\d{1,3})/i);
  const zona = etiqueta(/\bZONA\b[^\d\n]{0,8}(\d{1,3})/i);
  const puesto = etiqueta(/\bPUESTO\b[^\d\n]{0,8}(\d{1,3})/i);
  const mesa = etiqueta(/\bMESA\b[^\d\n]{0,8}(\d{1,3})/i);
  if (pais || zona || puesto) {
    return {
      ...(pais !== undefined ? { pais } : {}),
      ...(zona !== undefined ? { zona } : {}),
      ...(puesto !== undefined ? { puesto } : {}),
      ...(mesa !== undefined ? { mesa } : {}),
    };
  }

  // 2ª fuente: la línea "DIVIPOL" (impresa sin etiquetas por campo).
  for (const linea of texto.split(/\r?\n/)) {
    if (!/divipol/i.test(linea)) continue;
    const grupos = linea.match(/\b\d{1,3}\b/g) ?? [];
    if (grupos.length >= 3) return mapearDivipol(grupos);
  }

  // 3ª fuente (sin etiqueta visible): la línea con más grupos que no
  // parezca el código entre las X.
  let mejor: string[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (/\bX\s*X\b|^\s*X\s|\d[-–]\d/.test(linea)) continue;
    const grupos = linea.match(/\b\d{1,3}\b/g) ?? [];
    if (grupos.length > mejor.length && grupos.length >= 3) mejor = grupos;
  }
  if (mejor.length < 3) return undefined;
  return mapearDivipol(mejor);
}

/** Grupos DIVIPOL en orden → contrato crudo {pais, zona, puesto, mesa?} */
function mapearDivipol(grupos: string[]): {
  pais: string;
  zona: string;
  puesto: string;
  mesa?: string;
} {
  if (grupos.length >= 4) {
    // [departamento/exterior, municipio, zona, puesto, (mesa?)]
    return {
      pais: grupos[1],
      zona: grupos[2],
      puesto: grupos[3],
      ...(grupos[4] !== undefined ? { mesa: grupos[4] } : {}),
    };
  }
  // Línea recortada sin el grupo del departamento: [municipio, zona, puesto]
  return { pais: grupos[0], zona: grupos[1], puesto: grupos[2] };
}

/**
 * OCR del tercio superior de la captura ya procesada.
 * Devuelve null si Tesseract no está disponible o falla.
 */
export async function leerSenalesOcr(
  imagenDataUrl: string
): Promise<SenalesOcr | null> {
  const motor = await cargarTesseract();
  if (!motor) return null;
  const { Tesseract, rutas } = motor;

  try {
    // Recorte del tercio superior. El ANÁLISIS admite upscale hasta
    // ~1600px de ancho (Tesseract necesita ~30px de altura-x; en
    // entregas de 2400px el impreso queda pequeño). Esto NO altera
    // la imagen entregada: solo la entrada del OCR.
    const img = await cargarImagen(imagenDataUrl);
    const escalaAncho = LADO_OCR / Math.max(img.naturalWidth, 1);
    const escala = Math.min(2.5, Math.max(1, escalaAncho));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = Math.max(1, Math.round(h * 0.45));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, canvas.height);
    const recorte = canvas.toDataURL("image/jpeg", 0.95);

    // D-23: worker/core/lang apuntan SIEMPRE al mismo origen que el
    // UMD cargado (local si hay vendor, CDN si es respaldo).
    const worker = await Tesseract.createWorker(["spa", "eng"], 1, {
      workerPath: rutas.worker,
      corePath: rutas.core,
      langPath: rutas.lang,
    });
    try {
      const resultado = (await Promise.race([
        worker.recognize(recorte),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("ocr_timeout")), TIMEOUT_MS)
        ),
      ])) as { data: { text: string } };
      const textoSuperior = (resultado.data.text ?? "").trim();
      return {
        textoSuperior,
        codigoXCrudo: extraerCodigoX(textoSuperior),
        encabezadoCrudo: extraerEncabezadoCrudo(textoSuperior),
      };
    } finally {
      void worker.terminate().catch(() => undefined);
    }
  } catch {
    return null;
  }
}
