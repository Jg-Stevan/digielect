// ============================================================
// CONTRATO DIGIELECT ⇄ DIGITALIZADOR — API de ingesta
// ============================================================
// SOURCE OF TRUTH. Rutas y esquemas del canal de integración
// por datos (HTTP). La implementación server vive en digielect
// (Fase 6); este archivo solo declara el contrato wire-level.
//
// Reglas:
//  · El digitalizador SIEMPRE llama con ruta absoluta del host
//    (NEXT_PUBLIC_API_BASE_URL) + Authorization: Bearer <token>.
//  · El OCR del dispositivo es un HINT: el servidor valida contra
//    el catálogo y decide el estado final.
// ============================================================

import type { ActaDigitalizadaResultado } from "./types";

/** Ruta del endpoint de ingesta (multipart: datos + original + procesada). */
export const RUTA_INGESTA = "/api/actas/ingesta" as const;

/** Ruta de la bandeja de revisión (solo supervisor). */
export const RUTA_REVISION = "/api/actas/revision" as const;

/** Carga masiva (ZIP | PDF | TIFF | PNG | HEIC | JPEG; supervisor). */
export const RUTA_CARGA_MASIVA = "/api/actas/masiva" as const;

/** Informe SLA de puestos (supervisor). */
export const RUTA_SLA_PUESTOS = "/api/informes/sla-puestos" as const;

// ------------------------------------------------------------
// Ingesta — pedido
// ------------------------------------------------------------

/**
 * Cuerpo `datos` (parte JSON del multipart de RUTA_INGESTA).
 * El acta viaja SIN las imágenes embebidas: `original` y
 * `procesada` van como blobs hermanos en el mismo multipart.
 */
export interface IngestaDatos {
  acta: Omit<ActaDigitalizadaResultado, "imagenOriginalUrl" | "imagenProcesadaUrl">;
  /** SHA-256 hex de la imagen PROCESADA (dedupe server-side). */
  hashImagen: string;
  /** Nombre legible del dispositivo (opcional, trazabilidad). */
  dispositivo?: string;
}

// ------------------------------------------------------------
// Ingesta — respuesta
// ------------------------------------------------------------

/** Estado terminal de un acta tras la validación del servidor. */
export type EstadoIngesta = "aceptada" | "revision" | "conflicto";

export interface RespuestaIngesta {
  estado: EstadoIngesta;
  motivo?: string;
  /** Id asignado por el servidor (null si se rechazó por dedupe). */
  id: string | null;
  /** true ⇒ el hash ya existía (el cliente puede descartar la cola). */
  duplicado?: boolean;
}

/** Error estándar de la API (401 token, 409 duplicado, 400 contrato…). */
export interface ErrorIngesta {
  error: string;
  codigo: "TOKEN_INVALIDO" | "CONTRATO_INCOMPATIBLE" | "MESA_INEXISTENTE" | "DUPLICADO" | "PAYLOAD_INVALIDO";
}
