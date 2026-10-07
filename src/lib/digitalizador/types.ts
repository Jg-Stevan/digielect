// ============================================================
// DIGITALIZADOR E-14 — Tipos compartidos
// ============================================================

/** Tipo de ejemplar del acta E-14 */
export type TipoEjemplar = "DELEGADOS" | "TRANSMISION";

/** Estado de un acta en el sistema */
export type EstadoActa = "PENDIENTE" | "VALIDADO" | "ANOMALIA" | "RECHAZADO";

/** Banda de calidad según score 0-10 (RN-02) */
export type Banda = "OPTIMA" | "ADVERTENCIA" | "RECHAZADA";

/** Pantallas de la PWA digitalizadora */
export type Vista =
  | "captura"
  | "revision"
  | "contingencia"
  | "exito"
  | "control"
  | "resumen";

/** Métricas de calidad calculadas en el cliente (canvas) */
export interface MetricasCalidad {
  /** Nitidez (varianza del Laplaciano, normalizada 0-1) */
  nitidez: number;
  /** Contraste (desviación estándar de luminancia, 0-1) */
  contraste: number;
  /** Brillo medio (0-1, ideal 0.35-0.8) */
  brillo: number;
}

/** Captura en curso (foto tomada o cargada) */
export interface CapturaActual {
  /** Imagen PROCESADA (recorte + filtro) lista para envío */
  imagenDataUrl: string;
  metricas: MetricasCalidad;
  /** Score de calidad del cliente 0-10 */
  score: number;
  /** Legado (QR retirado): siempre null */
  qrTexto: string | null;
  /** Origen de la imagen */
  origen: "camara" | "galeria" | "acta-real" | "manual";
  createdAt: number;
}

// ------------------------------------------------------------
// EDITOR DE IMAGEN (escáner — quad + filtro + rotación)
// ------------------------------------------------------------

export type Rotacion = 0 | 90 | 180 | 270;

/** Estado de la página abierta en el editor */
export interface EstadoEdicion {
  id: string;
  /** Imagen ORIGINAL del sensor (data URL JPEG) */
  original: string;
  /** Dimensiones de la original (tras decodificar; null mientras) */
  originalW: number | null;
  originalH: number | null;
  /** Recorte normalizado 0-1 [TL,TR,BR,BL] */
  quad: [PuntoEdicion, PuntoEdicion, PuntoEdicion, PuntoEdicion];
  /** true ⇒ el humano puso el quad (manda al píxel) */
  quadManual: boolean;
  /** true ⇒ detección automática en curso (pill "Ajustando recorte…") */
  autoQuadPendiente: boolean;
  filtro: "original" | "texto" | "bw";
  rotacion: Rotacion;
  /** Badge de calidad de la foto ORIGINAL (0-100) */
  calidad: {
    nivel: "excellent" | "good" | "fair" | "poor";
    label: string;
    score: number;
  } | null;
  origen: CapturaActual["origen"];
  createdAt: number;
}

export interface PuntoEdicion {
  x: number;
  y: number;
}

/** Resultado del análisis con VLM (GLM-4.6V) */
export interface AnalisisVLM {
  /** Código de barras de 15 dígitos leído por el modelo */
  barcode?: string | null;
  /** DELEGADOS | TRANSMISION (leído en el encabezado) */
  tipoEjemplar?: string | null;
  /** Página leída en el encabezado */
  paginaLeida?: number | null;
  totalPaginasLeidas?: number | null;
  /** Ubicación DIVIPOL leída en el encabezado */
  divipol?: {
    pais?: string | null;
    ciudad?: string | null;
    zona?: string | null;
    puesto?: string | null;
    mesa?: string | null;
  } | null;
  /** ¿Se detectan firmas de los jurados? */
  firmasDetectadas?: boolean | null;
  /** Score de calidad asignado por el modelo 0-10 */
  scoreCalidad?: number | null;
  /** Nivelación de la mesa */
  nivelacion?: {
    ciudadanosHabiles?: number | null;
    sobresUrna?: number | null;
    testigos?: number | null;
  } | null;
  /** Votos por candidatura / agrupación leídos */
  resultados?: { candidato: string; votos: number | null }[] | null;
  votosInformativos?: { concepto: string; votos: number | null }[] | null;
  /** Problemas visibles en el acta */
  problemas?: string[] | null;
  observaciones?: string | null;
  /** Confianza global del análisis 0-1 */
  confianza?: number | null;
}

/** DTO de acta para la UI (sin imagen pesada) */
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

/** DTO de mesa con sus ranuras (ejemplares) */
export interface MesaDTO {
  id: string;
  numero: number;
  actas: ActaDTO[];
}

/** DTO de puesto de votación (consulado) */
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

/** Resumen del trabajo del puesto */
export interface ResumenTrabajo {
  total: number;
  validados: number;
  anomalias: number;
  rechazados: number;
  /** Ranuras esperadas = mesas × 2 tipos × 2 páginas */
  esperados: number;
}

/** Payload de envío de un acta al servidor */
export interface ActaPayload {
  imagenDataUrl: string;
  barcode15?: string | null;
  qrTexto?: string | null;
  tipoEjemplar: string;
  pagina: number;
  totalPaginas: number;
  scoreCalidad: number;
  modoManual?: boolean;
  envioAdvertencia?: boolean;
  mesaId?: string | null;
  analisis?: AnalisisVLM | null;
  problemas?: string[];
}

/** Respuesta del servidor al enviar un acta */
export interface DecisionEnvio {
  estado: EstadoActa;
  motivo: string;
  duplicado?: boolean;
  anomaliaId?: string | null;
}

/** Ítem de la cola offline (persistida en localStorage) */
export interface ColaItem {
  id: string;
  payload: ActaPayload;
  enqueuedAt: number;
  intentos: number;
}

/** Contexto de captura dirigida (desde Control → Escanear) */
export interface ContextoCaptura {
  mesaId: string;
  tipoEjemplar: TipoEjemplar;
  pagina: number;
}
