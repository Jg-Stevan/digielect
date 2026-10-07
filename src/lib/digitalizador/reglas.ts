// ============================================================
// DIGITALIZADOR E-14 — Reglas de negocio (FUENTE ÚNICA DE VERDAD)
// Módulo 100% puro: sin dependencias de React, DOM ni red.
// Se usa igual en cliente (vista previa) y servidor (decisión final).
// ============================================================

import type { Banda, EstadoActa, TipoEjemplar } from "./types";

/** Longitud del código de barras del E-14 */
export const LONGITUD_BARCODE = 15;

/** Reintentos RN-03 antes de envío de emergencia */
export const MAX_REINTENTOS_PLIEGO = 2;

// ------------------------------------------------------------
// Estructura del barcode15:
//   [1-2]  elección (p.ej. 71)
//   [3-8]  kit
//   [9]    tipo de ejemplar: 1=CLAVEROS 2=DELEGADOS 3=TRANSMISION
//   [10-11] versión
//   [12-13] página (1..total)
//   [14-15] total de páginas (1..4)
// ------------------------------------------------------------
export interface BarcodeInfo {
  eleccion: string;
  kit: string;
  digitoTipo: string;
  version: string;
  pagina: number;
  totalPaginas: number;
}

export type ParseBarcode =
  | { ok: true; info: BarcodeInfo; tipoEjemplar: TipoEjemplar }
  | { ok: false; motivo: string };

/** Normaliza caracteres ambiguos en códigos leídos por OCR/VLM */
export function normalizarDigitos(raw: string): string {
  return raw
    .replace(/[Oo]/g, "0")
    .replace(/[IilL|]/g, "1")
    .replace(/\s/g, "")
    .replace(/[^0-9]/g, "");
}

/** Parsea y valida un código de barras de 15 dígitos del E-14 */
export function parseBarcode15(raw: string | null | undefined): ParseBarcode {
  const digits = normalizarDigitos(raw ?? "");
  if (digits.length !== LONGITUD_BARCODE) {
    return {
      ok: false,
      motivo: `El código debe tener ${LONGITUD_BARCODE} dígitos (lleva ${digits.length}).`,
    };
  }
  const digitoTipo = digits[8];
  if (digitoTipo === "1") {
    return {
      ok: false,
      motivo: "El ejemplar CLAVEROS no se digitaliza por esta vía. Entregue el DELEGADOS o TRANSMISIÓN.",
    };
  }
  if (digitoTipo !== "2" && digitoTipo !== "3") {
    return { ok: false, motivo: `Dígito de tipo inválido («${digitoTipo}»). Debe ser 2=DELEGADOS o 3=TRANSMISIÓN.` };
  }
  const pagina = Number(digits.slice(11, 13));
  const totalPaginas = Number(digits.slice(13, 15));
  if (!(totalPaginas >= 1 && totalPaginas <= 4)) {
    return { ok: false, motivo: `Total de páginas inválido (${totalPaginas}).` };
  }
  if (!(pagina >= 1 && pagina <= totalPaginas)) {
    return { ok: false, motivo: `Página ${pagina} fuera de rango (1-${totalPaginas}).` };
  }
  return {
    ok: true,
    info: {
      eleccion: digits.slice(0, 2),
      kit: digits.slice(2, 8),
      digitoTipo,
      version: digits.slice(9, 11),
      pagina,
      totalPaginas,
    },
    tipoEjemplar: digitoTipo === "2" ? "DELEGADOS" : "TRANSMISION",
  };
}

/** Formatea el barcode15 en grupos legibles: 710003 9930102 02 */
export function formatearBarcode(raw: string | null | undefined): string {
  const d = normalizarDigitos(raw ?? "");
  if (d.length !== LONGITUD_BARCODE) return d;
  return `${d.slice(0, 6)} ${d.slice(6, 13)} ${d.slice(13, 15)}`;
}

// ------------------------------------------------------------
// CALIDAD Y SCORE (RN-02)
// ------------------------------------------------------------

/** Convierte métricas del cliente en score 0-10 */
export function scoreDeMetricas(m: {
  nitidez: number;
  contraste: number;
  brillo: number;
}): number {
  // Nitidez: 0.15 ya es aceptable en cámara móvil (varianza Laplaciano normalizada)
  const sNitidez = clamp01(m.nitidez / 0.3);
  // Contraste: desviación estándar ideal ≥ 0.18
  const sContraste = clamp01(m.contraste / 0.18);
  // Brillo: zona ideal 0.35-0.8, penaliza extremos
  const sBrillo =
    m.brillo < 0.2 || m.brillo > 0.92
      ? clamp01(0.35 - Math.min(Math.abs(m.brillo - 0.55), 0.35))
      : 1;
  const combinado = 0.45 * sNitidez + 0.35 * sContraste + 0.2 * sBrillo;
  return Math.round(clamp01(combinado) * 10);
}

/** Banda de calidad según score (RN-02): ≤5 roja · 6-8 ámbar · ≥9 verde */
export function bandaDeScore(score: number): Banda {
  if (score <= 5) return "RECHAZADA";
  if (score <= 8) return "ADVERTENCIA";
  return "OPTIMA";
}

/** Score firmado RN-02 (calidad + confianza de identificación + clasificación) */
export function calcularScoreRN02(input: {
  scoreCalidad: number;
  confIdentificacion?: number;
  confClasificacion?: number;
}): number {
  const q = clamp01(input.scoreCalidad / 10);
  const i = clamp01(input.confIdentificacion ?? 0.9);
  const c = clamp01(input.confClasificacion ?? 0.9);
  return Math.round(10 * (0.45 * q + 0.4 * i + 0.15 * c));
}

// ------------------------------------------------------------
// DECISIÓN DE ENVÍO (RN-02 / RN-03) — usada por cliente y servidor
// ------------------------------------------------------------

export interface EntradaDecision {
  score: number;
  firmasDetectadas?: boolean | null;
  /** El operador insistió en enviar desde la banda ámbar */
  envioAdvertencia?: boolean;
  modoManual?: boolean;
}

export type ResultadoDecision = {
  estado: EstadoActa;
  motivo: string;
  /** La transmisión queda bloqueada (solo repetir) */
  bloqueaEnvio: boolean;
};

/** Decide el estado final del acta (server authoritative) */
export function decidirEstado(d: EntradaDecision): ResultadoDecision {
  const score = Math.max(0, Math.min(10, Math.round(d.score)));

  if (d.modoManual) {
    // En modo manual el operador transcribe; la foto es solo respaldo.
    return { estado: "VALIDADO", motivo: "DIGITACIÓN MANUAL VERIFICADA", bloqueaEnvio: false };
  }
  if (score <= 5) {
    return {
      estado: "RECHAZADO",
      motivo: `CALIDAD INSUFICIENTE (${score}/10) — RESCANEO REQUERIDO`,
      bloqueaEnvio: true,
    };
  }
  if (score <= 8) {
    if (d.envioAdvertencia) {
      return {
        estado: "ANOMALIA",
        motivo: `ENVIADA CON ADVERTENCIA (${score}/10) — MARCADA PARA AUDITORÍA`,
        bloqueaEnvio: false,
      };
    }
    return {
      estado: "RECHAZADO",
      motivo: `CALIDAD DUDOSA (${score}/10) — REPITA LA FOTO O ENVÍE CON ADVERTENCIA`,
      bloqueaEnvio: true,
    };
  }
  if (d.firmasDetectadas === false) {
    return {
      estado: "ANOMALIA",
      motivo: "CALIDAD ÓPTIMA PERO SIN FIRMAS DE JURADOS DETECTADAS",
      bloqueaEnvio: false,
    };
  }
  return { estado: "VALIDADO", motivo: `VALIDADA Y ENVIADA AUTOMÁTICAMENTE (${score}/10)`, bloqueaEnvio: false };
}

// ------------------------------------------------------------
// HUELLA DEL PLIEGO (deduplicación)
// ------------------------------------------------------------

/** Huella única del documento físico. Prioridad: barcode > QR > null */
export function generarHuella(i: {
  barcode15?: string | null;
  qrTexto?: string | null;
}): string | null {
  const bc = normalizarDigitos(i.barcode15 ?? "");
  if (bc.length === LONGITUD_BARCODE) return `BC:${bc}`;
  const qr = (i.qrTexto ?? "").trim();
  if (qr.length >= 8) return `QR:${qr}`;
  return null;
}

// ------------------------------------------------------------
// PRESENTACIÓN (colores por estado — tema oscuro industrial)
// ------------------------------------------------------------

export const ESTADO_BADGE: Record<string, { label: string; clase: string }> = {
  VALIDADO: {
    label: "ENVIADO ✓",
    clase: "bg-primary/20 text-primary border-primary/40",
  },
  ANOMALIA: {
    label: "⚠ ADVERTENCIA",
    clase: "bg-warning/15 text-warning border-warning/40",
  },
  RECHAZADO: {
    label: "RESCANEO REQUERIDO",
    clase: "bg-destructive/15 text-destructive border-destructive/40",
  },
  PENDIENTE: {
    label: "PENDIENTE",
    clase: "bg-ind-variant text-ind-on-surface-var border-ind-outline-variant",
  },
  EN_COLA: {
    label: "EN COLA OFFLINE",
    clase: "bg-warning/15 text-warning border-warning/50",
  },
};

export const BANDA_ESTILO: Record<Banda, { texto: string; clase: string; frame: string; borde: string }> = {
  OPTIMA: {
    texto: "ÓPTIMA",
    clase: "text-brand-400 bg-brand-500/10 border-brand-500/40",
    frame: "",
    borde: "border-brand-500",
  },
  ADVERTENCIA: {
    texto: "ADVERTENCIA",
    clase: "text-warning bg-warning/10 border-warning/50",
    frame: "frame-warning",
    borde: "border-warning",
  },
  RECHAZADA: {
    texto: "RECHAZADA",
    clase: "text-red-400 bg-red-500/10 border-red-500/40",
    frame: "frame-error",
    borde: "border-red-500",
  },
};

/** Hora de Bogotá para mostrar en la UI */
export function horaBogota(fecha: Date | string | number = new Date()): string {
  const d = typeof fecha === "string" || typeof fecha === "number" ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function fechaBogota(fecha: Date | string | number = new Date()): string {
  const d = typeof fecha === "string" || typeof fecha === "number" ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// ------------------------------------------------------------
// utils
// ------------------------------------------------------------
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
