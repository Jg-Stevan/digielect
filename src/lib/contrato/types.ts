// ============================================================
// CONTRATO DIGIELECT ⇄ DIGITALIZADOR — Tipos canónicos
// ============================================================
// SOURCE OF TRUTH. Este folder se sincroniza hacia
// `digielect-digitalizador` vía `sync:contrato`. No editar en el
// repo del digitalizador.
//
// REGLA DE PRODUCTO (grabada): los VOTOS (campos manuscritos) NO
// se leen ni se procesan. Este contrato solo describe ruteo por
// campos IMPRESOS + imágenes + metadatos de calidad.
// ============================================================

/** Versión del contrato (semver: MAYOR rompe, MENOR agrega). */
export const VERSION_CONTRATO = "1.0.0";

// ------------------------------------------------------------
// Geometría del escáner (fracciones 0–1 en TODO el contrato)
// ------------------------------------------------------------

export interface Punto {
  x: number;
  y: number;
}

/** Quad normalizado 0-1, orden FIJO: TL, TR, BR, BL (fracciones). */
export type Quad = [Punto, Punto, Punto, Punto];

export type FiltroPagina = "original" | "texto" | "bw";

export type Rotacion = 0 | 90 | 180 | 270;

/** Métricas del acta warpada (0–1). */
export interface CalidadWarp {
  nitidez: number;
  contraste: number;
  brillo: number;
}

/** Resultado de `procesarPagina` (API pública invariante de escaner.ts). */
export interface ResultadoProceso {
  dataUrl: string;
  w: number;
  h: number;
  calidad: CalidadWarp;
  fullFrame: boolean;
}

// ------------------------------------------------------------
// Calidad y OCR de ruteo (SOLO campos impresos)
// ------------------------------------------------------------

/** Score de calidad 0–100 con sus métricas normalizadas. */
export interface ScoreCalidad {
  nitidez: number;
  contraste: number;
  brillo: number;
  /** 0–100 (normalización RN-02 existente: calidadAScoreRN02). */
  score: number;
}

/** Un campo OCR de ruteo leído en el dispositivo (hint; el server valida). */
export interface CampoOcr {
  valor: string;
  /** Confianza 0–1. */
  confianza: number;
}

/** Sugerencia de ruteo generada en el dispositivo por OCR de zonas. */
export interface OcrRuteo {
  /** Ej. "88-335-01-02-014" o null si no hay match. */
  mesaIdSugerido: string | null;
  /** Confianza global 0–1. */
  confianzaGlobal: number;
  campos: Record<
    "departamento" | "municipio" | "zona" | "puesto" | "mesa",
    CampoOcr | null
  >;
}

// ------------------------------------------------------------
// Acta digitalizada (resultado íntegro del dispositivo)
// ------------------------------------------------------------

export interface ActaDigitalizadaResultado {
  /** UUID v4. */
  id: string;
  /** Destino final (validado por el server contra el catálogo). */
  mesaId: string;
  /** Ej. "1.0.0". */
  versionContrato: string;
  /** dataURL/blobUrl local (en IndexedDB del dispositivo). */
  imagenOriginalUrl: string;
  imagenProcesadaUrl: string;
  quad: Quad;
  filtro: FiltroPagina;
  rotacion: Rotacion;
  calidad: ScoreCalidad;
  /** Sugerencia del dispositivo (hint; el servidor valida). */
  ocr: OcrRuteo;
  /** true ⇒ el humano puso el quad (Invariante: manual nunca encoge). */
  manual: boolean;
  origen: "captura" | "masiva" | "contingencia";
  timestamp: number;
}

// ------------------------------------------------------------
// Catálogo de mesas (shapes REALES del bootstrap de digielect)
// ------------------------------------------------------------

/** DTO de acta para la UI (sin imagen pesada). */
export interface ActaDTO {
  id: string;
  barcode15: string | null;
  tipoEjemplar: string;
  pagina: number;
  totalPaginas: number;
  estado: string;
  scoreCalidad: number;
  modoManual: boolean;
  envioAdvertencia: boolean;
  mesaId: string | null;
  mesaNumero: number | null;
  consulado: string | null;
  codigoPuesto: string | null;
  problemas: string[];
  createdAt: string;
}

/** DTO de mesa con sus ranuras (ejemplares). */
export interface MesaDTO {
  id: string;
  numero: number;
  actas: ActaDTO[];
}

/** DTO de puesto de votación (consulado). */
export interface ConsuladoDTO {
  id: string;
  codigo: string;
  pais: string;
  ciudad: string;
  zona: string;
  puesto: string;
  numMesas: number;
  mesas: MesaDTO[];
}

// ------------------------------------------------------------
// Puesto asignado (shape REAL de services/puestoStorage.ts)
// ------------------------------------------------------------

export interface PuestoAsignado {
  /** id legible del consulado, ej. "cons-495-10-02". */
  consuladoId: string;
  /** Ej. "495-10-02". */
  codigo: string;
  pais: string;
  ciudad: string;
  zona: string;
  /** Ej. "02 - Roma - Consulado". */
  puesto: string;
  numMesas: number;
  asignadoEn: number;
  /** true → asignado por escaneo de la primera acta (OPCIÓN A). */
  viaEscaneo?: boolean;
}
