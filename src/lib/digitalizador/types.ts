// ============================================================
// DIGITALIZADOR E-14 — Tipos compartidos
// [FASE-1] Los tipos del catálogo (ActaDTO/MesaDTO/ConsuladoDTO)
// viven ahora en @/lib/contrato/types (source of truth).
// ============================================================

import type { ActaDTO, MesaDTO, ConsuladoDTO } from "@/lib/contrato/types";

export type { ActaDTO, MesaDTO, ConsuladoDTO };

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
  /** Ubicación DIVIPOL leída en el encabezado.
   * [OLA4 4.9] Tolerante a las DOS formas del contrato: el servidor
   * envía {consulado, municipio, pais, ciudad, …} (pais=municipio y
   * ciudad=consulado en el exterior) y clientes/demo viejos pueden
   * traer sólo {pais, ciudad, …}. La UI debe considerar ambas. */
  divipol?: {
    pais?: string | null;
    ciudad?: string | null;
    consulado?: string | null;
    municipio?: string | null;
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

// ------------------------------------------------------------
// Catálogo (mesas/puestos) — [FASE-1] canonicalizado en el contrato
// (re-exportado en la cabecera del archivo)
// ------------------------------------------------------------

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
  /** [OLA4 4.1] Id del acta previa (misma huella QR, ranura no
   * VALIDADO) que este re-envío debe REEMPLAZAR en el servidor
   * (flujo B-02 / RN-03 rescaneo). Null = envío nuevo. */
  reemplazoDe?: string | null;
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
  /** [OLA4 4.6] Instantane (Date.now()) en que el contexto AVANZÓ
   * automáticamente tras un envío exitoso (P1→P2→siguiente tipo). La
   * UI lo usa para destacar el NUEVO objetivo ("SIGUIENTE · …") con
   * una animación de entrada. Ausente = contexto fijado a mano. */
  avanzadoEn?: number;
}

/** [OLA4 4.6] Anuncio del siguiente objetivo tras un envío exitoso
 * con captura dirigida (vive en el store mientras la pantalla de
 * éxito lo muestra; la de captura usa contexto.avanzadoEn). */
export interface AnuncioSiguiente {
  /** Etiqueta legible, ej. "MESA 05 · TRANSMISIÓN · P2" */
  etiqueta: string;
  /** true → la mesa dirigida quedó COMPLETA (contexto limpiado) */
  mesaCompleta: boolean;
  avanzadoEn: number;
}
