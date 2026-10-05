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
 * Analiza la imagen de un acta E-14 y produce el veredicto
 * según las reglas de negocio (RN-02, RN-03):
 *  · score >= 9 → aprobado automático
 *  · 6-8 → envío con advertencia (requiere 2 reintentos o supervisor)
 *  · <= 5 → rechazado (bloquea envío)
 */
export async function analizarActa(
  imagenBase64: string
): Promise<ActaAnalysis> {
  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch (e) {
    console.error("[analizarActa] SDK init error:", e);
    throw new Error("No se pudo inicializar el motor de visión");
  }

  // Normalizar data URL
  const url =
    imagenBase64.startsWith("data:")
      ? imagenBase64
      : `data:image/jpeg;base64,${imagenBase64}`;

  let response: Awaited<ReturnType<typeof zai.chat.completions.createVision>>;
  try {
    response = await zai.chat.completions.createVision({
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
    });
  } catch (e) {
    // La API de visión rechazó la imagen (ilegible/truncada) o falló
    // el servicio → degradar a análisis vacío (RN-02: score 0, rechazado)
    // en lugar de un 500, para que el cruce QR↔VLM siga su curso.
    console.error("[analizarActa] vision API error:", e);
    return analisisVacio(
      "El motor de visión no pudo procesar la imagen (ilegible o servicio no disponible). Repite la captura."
    );
  }

  const contenido = response.choices[0]?.message?.content ?? "";
  const datos = extraerJson(contenido);

  if (!datos) {
    // Respuesta no parseable → tratar como análisis fallido de baja calidad
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
 * Determina el estado del acta a partir del análisis (RN-02, RN-03):
 *  - VALIDADO: score >= 9 y firmas detectadas
 *  - ANOMALIA: envío de emergencia con score 6-8, o falta de firmas
 *  - RECHAZADO: score <= 8 sin emergencia, o score <= 5
 */
export function decidirEstadoActa(
  analisis: ActaAnalysis,
  envioEmergencia: boolean
): { estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO"; motivo: string } {
  if (analisis.scoreCalidad >= 9 && analisis.firmasDetectadas) {
    return {
      estado: "VALIDADO",
      motivo: `Score ${analisis.scoreLetra} · Ingesta aprobada automáticamente (RN-02)`,
    };
  }

  if (!analisis.firmasDetectadas) {
    if (envioEmergencia) {
      return {
        estado: "ANOMALIA",
        motivo: "Falta de firmas · Bandeja de anomalías del supervisor (SIN_FIRMAS)",
      };
    }
    return {
      estado: "RECHAZADO",
      motivo: "Falta de firmas · Repite la captura o activa el envío de emergencia",
    };
  }

  if (analisis.scoreCalidad <= 5) {
    return {
      estado: "RECHAZADO",
      motivo: `Score ${analisis.scoreLetra} · Imagen ilegible, transmisión bloqueada`,
    };
  }

  // Score 6-8
  if (envioEmergencia) {
    return {
      estado: "ANOMALIA",
      motivo: `Score ${analisis.scoreLetra} · Envío con advertencia tras reintentos agotados (RN-03)`,
    };
  }

  return {
    estado: "RECHAZADO",
    motivo: `Score ${analisis.scoreLetra} · Calidad insuficiente (<= 8/10), repite la foto (RN-02)`,
  };
}
