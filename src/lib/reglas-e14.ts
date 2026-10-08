// ============================================================
// DIGIELECT · Reglas E-14 compartidas (FUENTE ÚNICA DE VERDAD)
// Módulo 100% puro: sin dependencias de React, DOM ni red.
// Se usa igual en cliente (PWA digitalizador) y servidor (API).
//
// Origen (4.7 del PLAN-CONTINUIDAD): antes existían DOS
// parseBarcode15 (e14/parse.ts y digitalizador/reglas.ts) y TRES
// decidirEstado (cliente PWA, server y demo-store) con reglas
// divergentes. Toda la lógica vive aquí; los módulos históricos
// son ahora fachadas finas que preservan sus firmas públicas.
// ============================================================

import type { ActaAnalysis, TipoEjemplar } from "@/lib/types";

// ------------------------------------------------------------
// Barcode15 — estructura del código de barras del E-14:
//   [1-2]   elección (p.ej. 71 = Presidencia)
//   [3-8]   kit
//   [9]     tipo de ejemplar: 1=CLAVEROS 2=DELEGADOS 3=TRANSMISION
//   [10-11] versión
//   [12-13] página (1..total)
//   [14-15] total de páginas (1..4)
// ------------------------------------------------------------

/** Longitud del código de barras del E-14 */
export const LONGITUD_BARCODE = 15;

export interface InfoBarcode15 {
  /** Dígitos crudos normalizados, ej. "710003993010202" */
  crudo: string;
  /** Dígitos 1-2 · tipo de elección ("71" = Presidencia) */
  eleccion: string;
  /** Dígitos 3-8 · kit secuencial del formulario */
  kit: string;
  /** Dígito 9 crudo (1/2/3) */
  digitoTipo: string;
  /** Dígitos 10-11 · versión de diagramación */
  version: string;
  /** Dígitos 12-13 · página actual (1-based) */
  pagina: number;
  /** Dígitos 14-15 · total de páginas */
  totalPaginas: number;
}

/**
 * Tipo de ejemplar ampliado del dígito 9. El E-14 exterior tipa sus
 * ejemplares como TipoEjemplar ("DELEGADOS" | "TRANSMISION"); el
 * dígito 1 (CLAVEROS) solo existe en el E-14 interior, por lo que el
 * campo se tipa con esta unión ampliada y quien consuma el barcode
 * debe normalizar antes de asignar TipoEjemplar (ver
 * identificacion-acta.ts).
 */
export type TipoEjemplarBarcode15 = TipoEjemplar | "CLAVEROS";

const TIPO_POR_DIGITO: Record<string, TipoEjemplarBarcode15> = {
  "1": "CLAVEROS",
  "2": "DELEGADOS",
  "3": "TRANSMISION",
};

export type ResultadoBarcode15 =
  | { ok: true; info: InfoBarcode15; tipoEjemplar: TipoEjemplarBarcode15 }
  | { ok: false; motivo: string };

/** Normaliza caracteres ambiguos en códigos leídos por OCR/VLM (O→0, I/l/L/|→1) */
export function normalizarDigitos(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[Oo]/g, "0")
    .replace(/[IilL|]/g, "1")
    .replace(/\s/g, "")
    .replace(/[^0-9]/g, "");
}

/**
 * Parser estructural CANÓNICO del barcode15. Valida la estructura
 * completa (longitud, dígito de ejemplar 1-3, página ≤ total, total
 * 1-4) y acepta los TRES tipos de ejemplar — incluso CLAVEROS
 * (E-14 interior), porque la decisión de qué hacer con él pertenece
 * al llamador (identificacion-acta lo reporta como "tipo no usable
 * en exterior"; el digitalizador lo rechaza en su fachada UX). El
 * motivo de rechazo es texto ES apto para la UI del operador.
 */
export function parseBarcode15Estructura(
  raw: string | null | undefined
): ResultadoBarcode15 {
  const digits = normalizarDigitos(raw);
  if (digits.length !== LONGITUD_BARCODE) {
    return {
      ok: false,
      motivo: `El código debe tener ${LONGITUD_BARCODE} dígitos (lleva ${digits.length}).`,
    };
  }
  const digitoTipo = digits[8];
  const tipoEjemplar = TIPO_POR_DIGITO[digitoTipo];
  if (!tipoEjemplar) {
    return {
      ok: false,
      motivo: `Dígito de tipo inválido («${digitoTipo}»). Debe ser 2=DELEGADOS o 3=TRANSMISIÓN.`,
    };
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
      crudo: digits,
      eleccion: digits.slice(0, 2),
      kit: digits.slice(2, 8),
      digitoTipo,
      version: digits.slice(9, 11),
      pagina,
      totalPaginas,
    },
    tipoEjemplar,
  };
}

/** Formatea el barcode15 en grupos legibles: 710003 9930102 02 */
export function formatearBarcode(raw: string | null | undefined): string {
  const d = normalizarDigitos(raw);
  if (d.length !== LONGITUD_BARCODE) return d;
  return `${d.slice(0, 6)} ${d.slice(6, 13)} ${d.slice(13, 15)}`;
}

// ------------------------------------------------------------
// DECISIÓN DE ESTADO DEL ACTA (RN-02 / RN-03) — decisión final
// ------------------------------------------------------------

/** Resultado de la decisión de estado del acta */
export interface DecisionActa {
  estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO";
  motivo: string;
}

/**
 * Determina el estado del acta a partir del análisis (RN-02, RN-03):
 *  - VALIDADO: score >= 9 y firmas detectadas
 *  - ANOMALIA: envío de emergencia con score 6-8, o falta de firmas
 *  - RECHAZADO: score <= 8 sin emergencia, o score <= 5
 *
 * [OLA4-QA] Paginación: las firmas de jurados del E-14 viven en la
 * HOJA FINAL (constancias, P2). Una P1 perfecta NO puede ser
 * rechazada por "falta de firmas" — ese requisito sólo aplica a la
 * hoja que las lleva. Sin información de paginación se conserva el
 * comportamiento previo (conservador: firmas exigibles).
 */
export function decidirEstadoActa(
  analisis: ActaAnalysis,
  envioEmergencia: boolean,
  paginacion?: { pagina: number | null; totalPaginas: number | null }
): DecisionActa {
  // Es la hoja que lleva las firmas (última del ejemplar)? Sin datos
  // de paginación se asume que SÍ (comportamiento previo).
  const esHojaDeFirmas =
    !paginacion ||
    paginacion.pagina == null ||
    paginacion.totalPaginas == null ||
    paginacion.pagina >= paginacion.totalPaginas;

  if (
    analisis.scoreCalidad >= 9 &&
    (analisis.firmasDetectadas || !esHojaDeFirmas)
  ) {
    return {
      estado: "VALIDADO",
      motivo:
        analisis.firmasDetectadas || esHojaDeFirmas
          ? `Score ${analisis.scoreLetra} · Ingesta aprobada automáticamente (RN-02)`
          : `Score ${analisis.scoreLetra} · Ingesta aprobada automáticamente (RN-02) · hoja ${paginacion?.pagina}/${paginacion?.totalPaginas} sin firmas exigibles`,
    };
  }

  if (!analisis.firmasDetectadas && esHojaDeFirmas) {
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
