// ============================================================
// DIGIELECT — Motor de análisis de actas E-14 (VLM)
// Simula el Worker Cluster OCR/Visión del ERS:
//  · Evalúa calidad (nitidez, iluminación, alineación) → Score 0-10
//  · Lee el código de barras de 15 dígitos (RF-1.2)
//  · Detecta firmas de jurados (RF-2.2 SIN_FIRMAS)
//  · Extrae DIVIPOL, nivelación y resultados de votación
// Server-only: usa z-ai-web-dev-sdk (nunca en cliente).
// ============================================================

import ZAI from "z-ai-web-dev-sdk";
import type { ActaAnalysis, TipoEjemplar } from "@/lib/types";

const PROMPT_ANALISIS = `Eres el motor de análisis óptico (OCR/OMR/Visión) del sistema de digitalización electoral de Colombia para actas de escrutinio E-14 del exterior (Registraduría Nacional del Estado Civil).

Analiza la imagen del acta E-14 y devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto adicional, sin explicaciones) con EXACTAMENTE esta estructura:

{
  "barcode15": "los 15 dígitos del código de barras si es legible, o null",
  "tipoEjemplar": "DELEGADOS, TRANSMISION o CLAVEROS (texto del ejemplar cerca del código QR superior)",
  "divipol": {
    "consulado": "código/nombre del consulado o departamento",
    "municipio": "código/nombre del municipio o país",
    "pais": "nombre del PAÍS en texto (línea PAÍS del encabezado, ej. ITALIA), o null",
    "ciudad": "nombre de la CIUDAD o sede consular en texto (línea LUGAR del encabezado, ej. Roma - Consulado), o null",
    "zona": "zona",
    "puesto": "puesto",
    "mesa": "número de mesa"
  },
  "divipolCodigos": {
    "departamento": "código numérico DIVIPOL del departamento (2 dígitos) o null",
    "municipio": "código numérico DIVIPOL del municipio (3 dígitos) o null",
    "zona": "código numérico de la zona o null",
    "puesto": "código numérico del puesto o null",
    "mesa": "número de mesa o null"
  },
  "tipoEjemplarLeido": "DELEGADOS, TRANSMISION o CLAVEROS (texto impreso del ejemplar junto al código QR), o null",
  "paginaLeida": "número de página actual del encabezado 'Página X de Y', o null",
  "totalPaginasLeidas": "número total de páginas del encabezado 'Página X de Y', o null",
  "nivelacion": {
    "votantesE11": número o null,
    "votosUrna": número o null,
    "votosIncinerados": número o null
  },
  "resultados": [
    { "candidato": "nombre del candidato o fórmula", "votos": número }
  ],
  "votosInformativos": {
    "enBlanco": número o null,
    "nulos": número o null,
    "noMarcadas": número o null,
    "total": número o null
  },
  "firmas": {
    "detectadas": true o false,
    "cantidad": número de firmas manuscritas visibles
  },
  "calidad": {
    "nitidez": 0-10,
    "iluminacion": 0-10,
    "alineacion": 0-10,
    "codigoBarrasLegible": true o false,
    "problemas": ["lista de defectos detectados"]
  },
  "observaciones": "hallazgos relevantes en una frase"
}

Reglas estrictas:
1. Los números del acta están ESCRITOS A MANO. Lee con cuidado los dígitos de cada casilla. Si un valor no es legible con confianza razonable, usa null (nunca inventes números).
2. "calidad" evalúa la FOTOGRAFÍA: nitidez/enfoque, iluminación/contraste, alineación (los 4 puntos fiduciales negros deben verse en las esquinas) y legibilidad del código de barras.
3. "problemas" solo puede contener valores de esta lista cuando apliquen: "desenfoque", "poca luz", "sobreexposicion", "esquinas cortadas", "inclinacion", "codigo no detectado", "falta de firmas", "arrugas", "sombra".
4. "resultados" incluye cada candidato/fórmula del cuerpo de votación con sus votos escritos a mano.
5. Si la imagen no es un acta E-14, devuelve barcode15=null, resultados vacíos y problemas ["no es un acta e-14"].
6. "divipolCodigos": lee los CÓDIGOS NUMÉRICOS DIVIPOL impresos en el encabezado del acta junto a los nombres (formato típico: 88 495 010 02 000 = depto municipio zona puesto comuna; la mesa suele imprimirse aparte). Extrae solo los dígitos de cada código. Si un código no es legible usa null (nunca inventes dígitos).
7. "tipoEjemplarLeido" es el texto impreso del ejemplar junto al QR (DELEGADOS/TRANSMISION/CLAVEROS). "paginaLeida" y "totalPaginasLeidas" vienen del encabezado "Página X de Y". Si no son legibles usa null.`;

interface VlmRespuesta {
  barcode15: string | null;
  tipoEjemplar: string | null;
  divipol: {
    consulado: string | null;
    municipio: string | null;
    /** [OLA4 4.9] algunos modelos ya devuelven los alias directamente */
    pais?: string | null;
    ciudad?: string | null;
    zona: string | null;
    puesto: string | null;
    mesa: string | null;
  };
  divipolCodigos: {
    departamento: string | null;
    municipio: string | null;
    zona: string | null;
    puesto: string | null;
    mesa: string | null;
  } | null;
  tipoEjemplarLeido: string | null;
  paginaLeida: number | null;
  totalPaginasLeidas: number | null;
  nivelacion: {
    votantesE11: number | null;
    votosUrna: number | null;
    votosIncinerados: number | null;
  };
  resultados: { candidato: string; votos: number }[];
  votosInformativos: {
    enBlanco: number | null;
    nulos: number | null;
    noMarcadas: number | null;
    total: number | null;
  };
  firmas: { detectadas: boolean; cantidad: number } | null;
  calidad: {
    nitidez: number;
    iluminacion: number;
    alineacion: number;
    codigoBarrasLegible: boolean;
    problemas: string[];
  } | null;
  observaciones: string;
}

/** Limpia la respuesta del modelo (quita fences de markdown) */
function extraerJson(texto: string): VlmRespuesta | null {
  const limpio = texto
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(limpio) as VlmRespuesta;
  } catch {
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio >= 0 && fin > inicio) {
      try {
        return JSON.parse(limpio.slice(inicio, fin + 1)) as VlmRespuesta;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function clamp010(v: unknown): number {
  const n = Number(v);
  if (isNaN(n)) return 5;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function safeInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.max(0, Math.round(n));
}

/** Extrae los dígitos de un código DIVIPOL leído por el VLM ("DPTO 88" → "88") */
function codigoNumerico(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = String(v).replace(/\D/g, "");
  return d || null;
}

/** Normaliza el texto del ejemplar leído del acta al union TipoEjemplar */
function normalizarTipoEjemplar(v: unknown): TipoEjemplar | null {
  const t = String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (t.includes("DELEGADO")) return "DELEGADOS";
  if (t.includes("TRANSMIS")) return "TRANSMISION";
  // CLAVEROS y cualquier otro texto → fuera del flujo exterior (TipoEjemplar)
  return null;
}

/**
 * [OLA2 2.6] Fallo del MOTOR de visión (red/timeout/servicio caído) —
 * DISTINTO de un rechazo real del acta (imagen ilegible que el motor
 * sí pudo procesar). Al lanzarse, las rutas (/api/actas,
 * /api/actas/analizar) responden 5xx → la PWA reintentará (la cola
 * offline marca 5xx como retriable) en lugar de persistir un
 * RECHAZADO con la imagen completa, como ocurría antes.
 */
export class MotorVisionError extends Error {
  constructor(
    mensaje: string,
    public readonly causa?: unknown
  ) {
    super(mensaje);
    this.name = "MotorVisionError";
  }
}

/**
 * [OLA2 2.6] Singleton del SDK ZAI (creación perezosa, cacheada a
 * nivel de módulo): antes se instanciaba el cliente en CADA análisis,
 * repitiendo la lectura de config/credenciales por captura.
 */
type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;
let zaiSingleton: ZaiClient | null = null;
let zaiCrearPromesa: Promise<ZaiClient> | null = null;

async function obtenerZai(): Promise<ZaiClient> {
  if (zaiSingleton) return zaiSingleton;
  if (!zaiCrearPromesa) {
    zaiCrearPromesa = ZAI.create()
      .then((z) => {
        zaiSingleton = z;
        return z;
      })
      .catch((e) => {
        // permite reintentar la inicialización en el próximo análisis
        zaiCrearPromesa = null;
        throw e;
      });
  }
  return zaiCrearPromesa;
}

/** Presupuesto de tiempo por intento de visión (ms) */
const VISION_TIMEOUT_MS = 45_000;

/** Carrera promesa-vs-timeout usando AbortSignal.timeout (no aborta la
 *  petición subyacente — el SDK no acepta signal — pero acota la
 *  latencia de la ruta). La promesa perdedora queda manejada por la
 *  propia Promise.race (sin unhandledRejection). */
function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  const senal = AbortSignal.timeout(ms);
  return Promise.race([
    promesa,
    new Promise<never>((_, reject) => {
      senal.addEventListener(
        "abort",
        () =>
          reject(
            senal.reason ??
              new MotorVisionError(`Motor de visión sin respuesta en ${ms} ms`)
          ),
        { once: true }
      );
    }),
  ]);
}

/**
 * Extrae el status HTTP de un error del SDK ("API request failed with
 * status 400: …") o de un objeto Error con .status. null si no aplica.
 */
function extraerStatusApi(e: unknown): number | null {
  if (typeof (e as { status?: unknown } | null)?.status === "number") {
    const s = (e as { status: number }).status;
    if (s >= 400 && s < 600) return s;
  }
  if (e instanceof Error) {
    const m = /status (\d{3})/.exec(e.message);
    if (m) {
      const s = parseInt(m[1], 10);
      if (s >= 400 && s < 600) return s;
    }
  }
  return null;
}

/** Resultado de una llamada al motor de visión */
interface ResultadoVision {
  /** el motor respondió (contenido puede ser null si no trajo texto útil) */
  ok: boolean;
  contenido: string | null;
  /** 4xx definitivo: la API rechazó la imagen (formato/parseo) — rechazo REAL, no fallo del motor */
  rechazoImagen: boolean;
}

/**
 * Llama al motor de visión:
 *  · fallo de red/timeout/5xx → 1 reintento; si persiste, lanza
 *    `MotorVisionError` (fallo del MOTOR).
 *  · 4xx definitivo de la API (imagen ilegible/truncada) → sin reintento:
 *    el motor funciona, es la IMAGEN la que no sirve (rechazo real).
 * Devuelve el contenido textual, o null si respondió sin texto útil.
 */
async function llamarVision(
  zai: ZaiClient,
  url: string
): Promise<ResultadoVision> {
  let ultimoError: unknown = null;
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const response = await conTimeout(
        zai.chat.completions.createVision({
          model: "glm-4.6v",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT_ANALISIS },
                { type: "image_url", image_url: { url } },
              ],
            },
          ],
          thinking: { type: "disabled" },
        }),
        VISION_TIMEOUT_MS
      );
      // [OLA2 2.6] guard de contenido: según el SDK/modelo el content
      // puede llegar como string o como array de partes multimodales.
      const crudo: unknown = response.choices[0]?.message?.content ?? null;
      if (typeof crudo === "string") {
        return { ok: true, contenido: crudo, rechazoImagen: false };
      }
      if (Array.isArray(crudo)) {
        const texto = crudo
          .map((p) =>
            p && typeof p === "object" && "text" in p && typeof p.text === "string"
              ? p.text
              : ""
          )
          .join("");
        if (texto) return { ok: true, contenido: texto, rechazoImagen: false };
      }
      return { ok: true, contenido: null, rechazoImagen: false }; // respondió sin texto útil
    } catch (e) {
      const status = extraerStatusApi(e);
      if (status !== null && status >= 400 && status < 500) {
        // La API rechazó la imagen de forma definitiva (p.ej. code 1210
        // "图片输入格式/解析错误"): el motor FUNCIONA — reintentar no sirve.
        console.error(
          `[analizarActa] la API de visión rechazó la imagen (status ${status}), intento ${intento}/2:`,
          e instanceof Error ? e.message : e
        );
        return { ok: false, contenido: null, rechazoImagen: true };
      }
      ultimoError = e;
      console.error(
        `[analizarActa] intento ${intento}/2 de visión falló (motor):`,
        e instanceof Error ? e.message : e
      );
      // reintenta solo si queda presupuesto de intentos
    }
  }
  throw new MotorVisionError(
    "El motor de visión no está disponible (reintentos agotados)",
    ultimoError
  );
}

/**
 * Analiza la imagen de un acta E-14 y produce el veredicto
 * según las reglas de negocio (RN-02, RN-03):
 *  · score >= 9 → aprobado automático
 *  · 6-8 → envío con advertencia (requiere 2 reintentos o supervisor)
 *  · <= 5 → rechazado (bloquea envío)
 *
 * [OLA2 2.6] Un fallo del MOTOR (timeout/red/servicio) lanza
 * `MotorVisionError` → 5xx en las rutas → la PWA reintenta. SOLO un
 * rechazo REAL del motor (respondió y no pudo estructurar la lectura)
 * devuelve un análisis vacío (score 0, RN-02) sin más.
 */
export async function analizarActa(
  imagenBase64: string
): Promise<ActaAnalysis> {
  let zai: ZaiClient;
  try {
    zai = await obtenerZai();
  } catch (e) {
    console.error("[analizarActa] SDK init error:", e);
    throw new MotorVisionError("No se pudo inicializar el motor de visión", e);
  }

  // Normalizar data URL
  const url =
    imagenBase64.startsWith("data:")
      ? imagenBase64
      : `data:image/jpeg;base64,${imagenBase64}`;

  let resultado: ResultadoVision;
  try {
    resultado = await llamarVision(zai, url);
  } catch (e) {
    // Fallo del MOTOR (timeout/red/5xx tras reintentar) ≠ rechazo real:
    // NO se degrada a analisisVacio (antes un 500 del VLM terminaba
    // persistiendo un acta RECHAZADO con la imagen completa). Se
    // propaga para que la ruta responda 5xx y el cliente reintenta.
    console.error("[analizarActa] vision API error:", e);
    throw e instanceof MotorVisionError
      ? e
      : new MotorVisionError("El motor de visión no está disponible", e);
  }

  if (resultado.rechazoImagen) {
    // La API de visión rechazó la IMAGEN (formato/parseo, 4xx definitivo):
    // el motor funciona — es un rechazo REAL del acta (RN-02: score 0,
    // igual que antes con las imágenes ilegibles), sin reintentos inútiles.
    return analisisVacio(
      "El motor de visión no pudo procesar la imagen (ilegible o truncada). Repite la captura."
    );
  }

  const datos =
    resultado.contenido === null ? null : extraerJson(resultado.contenido);

  if (!datos) {
    // El motor RESPONDIÓ pero no produjo una lectura estructurada →
    // análisis fallido de baja calidad (RN-02) — igual que antes.
    return analisisVacio(
      "El motor de visión no pudo estructurar la lectura. Repite la captura."
    );
  }

  // Calcular score compuesto (RN-02)
  const nitidez = clamp010(datos.calidad?.nitidez);
  const iluminacion = clamp010(datos.calidad?.iluminacion);
  const alineacion = clamp010(datos.calidad?.alineacion);
  const codigoLegible = Boolean(datos.calidad?.codigoBarrasLegible);
  const scoreCalidad = Math.round(
    (nitidez * 0.35 +
      iluminacion * 0.3 +
      alineacion * 0.2 +
      (codigoLegible ? 10 : 0) * 0.15) *
      10
  ) / 10;

  const problemas = Array.isArray(datos.calidad?.problemas)
    ? datos.calidad.problemas.filter((p) => typeof p === "string")
    : [];

  const firmasDetectadas = Boolean(datos.firmas?.detectadas);
  if (!firmasDetectadas && !problemas.includes("falta de firmas")) {
    problemas.push("falta de firmas");
  }
  if (!codigoLegible && datos.barcode15 && !problemas.includes("codigo no detectado")) {
    // barcode reportado pero no legible no aplica
  }

  // Decodificar el barcode de 15 dígitos (RF-1.2)
  const barcode = datos.barcode15 && /^\d{15}$/.test(datos.barcode15) ? datos.barcode15 : null;
  const digitos = barcode
    ? {
        tipoEleccion: barcode.slice(0, 2),
        kitMesa: barcode.slice(2, 8),
        tipoEjemplar: barcode.slice(8, 9),
        version: barcode.slice(9, 11),
        pagina: barcode.slice(11, 13),
        totalPaginas: barcode.slice(13, 15),
      }
    : {
        tipoEleccion: null,
        kitMesa: null,
        tipoEjemplar: null,
        version: null,
        pagina: null,
        totalPaginas: null,
      };

  if (barcode === null && !problemas.includes("codigo no detectado")) {
    problemas.push("codigo no detectado");
  }

  const score = Math.round(scoreCalidad);

  return {
    barcode,
    barcodeDigitos: digitos,
    scoreCalidad: score,
    scoreLetra: `${score}/10`,
    aprobado: score >= 9 && firmasDetectadas,
    advertencia: score >= 6 && score <= 8,
    problemas,
    firmasDetectadas,
    cantidadFirmas: safeInt(datos.firmas?.cantidad) ?? 0,
    divipol: {
      consulado: datos.divipol?.consulado ?? null,
      municipio: datos.divipol?.municipio ?? null,
      // [OLA4 4.9] Alias del contrato del digitalizador: en el exterior
      // el "municipio" del E-14 es el PAÍS y el "consulado" es la CIUDAD
      // sede de la misión. Se prefieren las claves explícitas pais/ciudad
      // si el motor las trae; si no, se mapean las equivalentes.
      pais: datos.divipol?.pais ?? datos.divipol?.municipio ?? null,
      ciudad: datos.divipol?.ciudad ?? datos.divipol?.consulado ?? null,
      zona: datos.divipol?.zona ?? null,
      puesto: datos.divipol?.puesto ?? null,
      mesa: datos.divipol?.mesa ?? null,
    },
    divipolCodigos: {
      depto: codigoNumerico(datos.divipolCodigos?.departamento),
      municipio: codigoNumerico(datos.divipolCodigos?.municipio),
      zona: codigoNumerico(datos.divipolCodigos?.zona),
      puesto: codigoNumerico(datos.divipolCodigos?.puesto),
      mesa: codigoNumerico(datos.divipolCodigos?.mesa),
    },
    tipoEjemplarLeido: normalizarTipoEjemplar(datos.tipoEjemplarLeido),
    paginaLeida: safeInt(datos.paginaLeida),
    totalPaginasLeidas: safeInt(datos.totalPaginasLeidas),
    nivelacion: {
      votantesE11: safeInt(datos.nivelacion?.votantesE11),
      votosUrna: safeInt(datos.nivelacion?.votosUrna),
      votosIncinerados: safeInt(datos.nivelacion?.votosIncinerados),
    },
    resultados: Array.isArray(datos.resultados)
      ? datos.resultados
          .filter((r) => r && typeof r.candidato === "string")
          .map((r) => ({ candidato: r.candidato, votos: safeInt(r.votos) ?? 0 }))
      : [],
    votosInformativos: {
      enBlanco: safeInt(datos.votosInformativos?.enBlanco),
      nulos: safeInt(datos.votosInformativos?.nulos),
      noMarcados: safeInt(datos.votosInformativos?.noMarcadas),
      total: safeInt(datos.votosInformativos?.total),
    },
    observaciones:
      typeof datos.observaciones === "string"
        ? datos.observaciones
        : "Análisis completado.",
  };
}

function analisisVacio(observaciones: string): ActaAnalysis {
  return {
    barcode: null,
    barcodeDigitos: {
      tipoEleccion: null,
      kitMesa: null,
      tipoEjemplar: null,
      version: null,
      pagina: null,
      totalPaginas: null,
    },
    scoreCalidad: 0,
    scoreLetra: "0/10",
    aprobado: false,
    advertencia: false,
    problemas: ["desenfoque", "codigo no detectado"],
    firmasDetectadas: false,
    cantidadFirmas: 0,
    divipol: {
      consulado: null,
      municipio: null,
      pais: null,
      ciudad: null,
      zona: null,
      puesto: null,
      mesa: null,
    },
    divipolCodigos: {
      depto: null,
      municipio: null,
      zona: null,
      puesto: null,
      mesa: null,
    },
    tipoEjemplarLeido: null,
    paginaLeida: null,
    totalPaginasLeidas: null,
    nivelacion: {
      votantesE11: null,
      votosUrna: null,
      votosIncinerados: null,
    },
    resultados: [],
    votosInformativos: {
      enBlanco: null,
      nulos: null,
      noMarcados: null,
      total: null,
    },
    observaciones,
  };
}

/**
 * [4.7] La decisión de estado del acta (RN-02/RN-03) vive ahora en
 * lib/reglas-e14.ts (fuente única compartida con la PWA y el modo
 * demo). Se re-exporta para preservar el contrato histórico de
 * este módulo (POST /api/actas la importa de aquí).
 */
export { decidirEstadoActa } from "@/lib/reglas-e14";
