// ============================================================
// DIGITALIZADOR E-14 — Reglas de negocio de la PWA
// Módulo 100% puro: sin dependencias de React, DOM ni red.
// [4.7] La validación estructural del barcode15 y la decisión de
// estado del acta viven ahora en lib/reglas-e14.ts (fuente única
// compartida con el servidor); este módulo conserva las reglas
// propias del digitalizador (score, bandas, huella) y añade la
// fachada UX que rechaza CLAVEROS.
// ============================================================

import type { Banda, TipoEjemplar } from "./types";
import {
  LONGITUD_BARCODE,
  formatearBarcode,
  normalizarDigitos,
  parseBarcode15Estructura,
  type InfoBarcode15,
} from "@/lib/reglas-e14";

export { LONGITUD_BARCODE, formatearBarcode, normalizarDigitos };
export type { InfoBarcode15 };

/** Reintentos RN-03 antes de envío de emergencia */
export const MAX_REINTENTOS_PLIEGO = 2;

export type ParseBarcode =
  | { ok: true; info: InfoBarcode15; tipoEjemplar: TipoEjemplar }
  | { ok: false; motivo: string };

/**
 * [4.7] Fachada UX del parser canónico: valida la estructura vía
 * lib/reglas-e14.ts y además rechaza el ejemplar CLAVEROS (E-14
 * interior), que no se digitaliza por esta vía. El resto de los
 * motivos son los textos canónicos compartidos con el servidor.
 */
export function parseBarcode15(raw: string | null | undefined): ParseBarcode {
  const r = parseBarcode15Estructura(raw);
  if (!r.ok) return r;
  if (r.tipoEjemplar === "CLAVEROS") {
    return {
      ok: false,
      motivo: "El ejemplar CLAVEROS no se digitaliza por esta vía. Entregue el DELEGADOS o TRANSMISIÓN.",
    };
  }
  return { ok: true, info: r.info, tipoEjemplar: r.tipoEjemplar };
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
