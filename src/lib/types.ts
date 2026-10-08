// ============================================================
// DIGIELECT — Tipos compartidos del dominio electoral E-14
// Migrados del repo original (Vite) y extendidos para el
// backend Next.js + Prisma.
// ============================================================

export type NavSection =
  | "monitor-global"
  | "carga-masiva"
  | "centro-notificaciones"
  | "revision-anomalias"
  | "generar-informes"
  | "tokens-dispositivo";

export type AppMode = "supervisor" | "digitalizador";

export type StatusType =
  | "COMPLETO"
  | "CRÍTICO"
  | "PENDIENTE"
  | "NO INICIADO"
  | "INCOMPLETO";

/** Estados de un acta según la Matriz de Trazabilidad del ERS */
export type ActaEstado =
  | "PENDIENTE"
  | "VALIDADO"
  | "RECHAZADO"
  | "ANOMALIA"
  | "OFFLINE"
  | "EN_COLA";

/** Tipo de ejemplar E-14 (dígito 9 del código de barras 15D) */
export type TipoEjemplar = "DELEGADOS" | "TRANSMISION";

export type PageStatus = boolean | "pending" | "rescaneo";

export interface MesaDetail {
  id: string;
  mesaNumber: string;
  delegados: { p1: PageStatus; p2: PageStatus };
  transmision: { p1: PageStatus; p2: PageStatus };
  estado: StatusType;
  ultimaCarga: string;
  anomalia?: string;
  horaCierreLocal?: string;
}

export interface ConsulateRow {
  id: string;
  code: string;
  pais: string;
  ciudad: string;
  zona: string;
  puesto: string;
  numMesas: number;
  horaCierreColombia: string;
  horaActualPais: string;
  tiempoDesdeCierre: string;
  delegadosProgress: string;
  delegadosPercent: number;
  transmisionProgress: string;
  transmisionPercent: number;
  estadoGlobal: StatusType;
  mesas: MesaDetail[];
  /** Región geográfica (europa/america/asia/africa/oceania) */
  region?: string;
  /** Offset UTC vs Bogotá en minutos (modo demo: relojes vivos en cliente) */
  utcOffsetMin?: number;
  /** Hora local de cierre "HH:MM" (modo demo: relojes vivos en cliente) */
  horaCierreLocalRaw?: string;
}

export type OcrStatus =
  | "RECONOCIDO"
  | "MANUAL_REQUERIDA"
  | "DUPLICADO"
  | "RESUELVE_ALERTA"
  | "NUEVO_REGISTRO";

export interface QueueFileItem {
  id: string;
  filename: string;
  size: string;
  ext: string;
  barcode: string;
  location: string;
  ocrStatus: OcrStatus;
  ocrConfidence?: number;
  details?: string;
}

export type SlaFase = "fase1" | "fase2" | "fase3";
export type SlaRegion = "europa" | "america" | "asia" | "africa" | "oceania";
export type NotifChannel = "WA" | "SMS" | "EMAIL";

export interface SlaRow {
  id: string;
  consulateName: string;
  pais: string;
  region: SlaRegion;
  zona: string;
  puesto: string;
  mesasInactivas: string[];
  horaCierreLocal: string;
  tiempoTranscurridoMin: number;
  tiempoTranscurridoLabel: string;
  fase: SlaFase;
  faseLabel: string;
  subFaseDesc: string;
  notifChannel: NotifChannel;
  notifChannelExtra?: NotifChannel;
  notifDespacho: string;
  notifEstado: string;
  notifEstadoColor: string;
  notifHasWarning?: boolean;
}

export type TipoAnomalia =
  | "SIN_FIRMAS"
  | "ILEGIBLE_RESCANEO"
  | "CODIGO_NO_DETECTADO"
  /** [post-4.4] El cruce QR↔VLM computó una mesa distinta a la
   *  declarada por el cliente y el servidor archivó en la computada:
   *  el supervisor audita quién declaró mal. Se crea cuando el acta
   *  queda VALIDADO (en ANOMALIA la bandeja ya recibe la causa
   *  primaria y el detalle del acta lleva la discrepancia). */
  | "UBICACION_DISCREPANTE";

export interface AnomaliaItem {
  id: string;
  horaAlertaLocal: string;
  horaAlertaCol: string;
  pais: string;
  ciudad: string;
  mesa: string;
  formulario: string;
  tipoAnomalia: TipoAnomalia;
  tipoLabel: string;
  slaMinutesRemaining: number;
  slaDisplay: string;
  mesaIdRef: string;
  /** ID del acta vinculada (para el visor de auditoría) */
  actaId?: string | null;
  /** [OLA3 3.6] Creación real (ISO): la UI computa el SLA restante
   *  en render desde createdAt + SLA_MINUTOS (antes el número
   *  persistido estaba congelado). Opcional: el fixture estático
   *  de la demo no lo trae y se usa el valor plano del servidor. */
  createdAt?: string;
}

/** Resumen global para tarjetas del monitor e informes */
export interface ResumenGlobal {
  totalPuestos: number;
  completo: number;
  critico: number;
  pendiente: number;
  noIniciado: number;
  actasIngestadas: number;
  anomaliasAbiertas: number;
}

/** Objetivo del Modal de Auditoría / Reinspección (RF-2.3) */
export interface ReinspectionTarget {
  mesaId: string;
  mesaLabel: string;
  anomaliaId?: string;
  actaImagenUrl?: string;
  formulario?: string;
  tipoLabel?: string;
  /** [OLA3 3.3] Tipo real: deriva los overlays de evidencia del visor
   *  (antes "FIRMA JURADO 2 — NO DETECTADA" aparecía fijo sobre
   *  CUALQUIER acta). */
  tipoAnomalia?: TipoAnomalia;
  /** [OLA3 3.3] Hora real de la alerta para la timeline del modal */
  horaAlerta?: string;
}

export interface AuditEvent {
  time: string;
  title: string;
  desc: string;
  type: "error" | "warning" | "info" | "success";
}

// ------------------------------------------------------------
// PWA DIGITALIZADOR
// ------------------------------------------------------------

/** Códigos numéricos DIVIPOL del encabezado leídos por el VLM */
export interface DivipolCodigos {
  depto: string | null;
  municipio: string | null;
  zona: string | null;
  puesto: string | null;
  mesa: string | null;
}

/** Resultado del análisis IA (VLM) de una captura de acta */
export interface ActaAnalysis {
  barcode: string | null;
  barcodeDigitos: {
    tipoEleccion: string | null;
    kitMesa: string | null;
    tipoEjemplar: string | null;
    version: string | null;
    pagina: string | null;
    totalPaginas: string | null;
  };
  scoreCalidad: number;
  scoreLetra: string;
  aprobado: boolean;
  advertencia: boolean;
  problemas: string[];
  firmasDetectadas: boolean;
  cantidadFirmas: number;
  divipol: {
    consulado: string | null;
    municipio: string | null;
    /**
     * [OLA4 4.9] Alias del contrato del digitalizador (PWA): en el
     * exterior el "municipio" del encabezado es el PAÍS y el "consulado"
     * es la CIUDAD sede. La PWA (AnalisisVLM.divipol) espera pais/ciudad
     * y degradaba la ruta de la tarjeta de revisión a "NO DETECTADOS"
     * aunque el VLM SÍ leyó la ubicación. El servidor envía AMBAS
     * formas (mismo valor mapeado) para que clientes viejos y nuevos
     * lean lo mismo.
     */
    pais?: string | null;
    ciudad?: string | null;
    zona: string | null;
    puesto: string | null;
    mesa: string | null;
  };
  /** Códigos numéricos DIVIPOL impresos en el encabezado (VLM) */
  divipolCodigos: DivipolCodigos;
  /** Ejemplar leído del texto impreso cerca del QR (VLM) */
  tipoEjemplarLeido: TipoEjemplar | null;
  /** Página actual leída del encabezado (VLM) */
  paginaLeida: number | null;
  /** Total de páginas leído del encabezado (VLM) */
  totalPaginasLeidas: number | null;
  nivelacion: {
    votantesE11: number | null;
    votosUrna: number | null;
    votosIncinerados: number | null;
  };
  resultados: {
    candidato: string;
    votos: number;
  }[];
  votosInformativos: {
    enBlanco: number | null;
    nulos: number | null;
    noMarcados: number | null;
    total: number | null;
  };
  observaciones: string;
}

/** Payload de carga de un acta desde la PWA */
export interface ActaUploadPayload {
  imagenBase64: string;
  barcode?: string;
  tipoEjemplar: TipoEjemplar;
  pagina: number;
  totalPaginas: number;
  modoManual?: boolean;
  datosManuales?: {
    nivelacion?: Partial<ActaAnalysis["nivelacion"]>;
    resultados?: ActaAnalysis["resultados"];
    divipol?: Partial<ActaAnalysis["divipol"]>;
  };
  envioEmergencia?: boolean;
  scoreCliente?: number;
  /** ID legible de la mesa del monitor, ej. "mesa-roma-002" */
  mesaIdRef?: string;
  /** Texto crudo decodificado del QR del acta (trazabilidad/auditoría) */
  qrTexto?: string;
  /**
   * [B-02] Clave de la ranura física que el guard del digitalizador ya
   * validó como REEMPLAZO legítimo (misma huella QR, hoja previa no
   * VALIDADO): "mesaId|TIPO|pN" o "divipol:...|TIPO|pN". El backend la lee
   * para archivar la captura anterior y crear la nueva en la MISMA
   * transacción (antes la ignoraba y el reemplazo chocaba con "QR DUPLICADO").
   */
  reemplazoDe?: string;
  /**
   * [C-17] PLAN_DIGIELECT_DIGITALIZADOR.md TAREA 3/4 — calidad 0-100
   * calculada en el dispositivo (calculateQualityScore: señales
   * deterministas 80% + nitidez/contraste 20%). El servidor la usa
   * para la resolución de concurrencia por ranura: si dos operarios
   * suben la misma (mesa, tipo, página), gana la de mayor calidad
   * (≥ +10 pts reemplaza; si no, REEMPLAZO_RECHAZADO_MENOR_CALIDAD).
   */
  qualityScore?: number;
}

/**
 * Contrato de salida de la captura del digitalizador (rol A → rol C).
 * Definido en docs/agentes/TAREA-A-DIGITALIZADOR.md §4 y CONVENIOS.md §2.
 *
 * REGLA DE ORO: la captura entrega SEÑALES CRUDAS. La normalización,
 * la identificación y la decisión de almacenamiento son exclusivas del
 * identificador determinista (`identificarActa` + `clasificarEjemplar`
 * + `decidirAlmacenamiento`, rama feature/identificador-actas).
 * Esto mantiene la lógica testeable y evita que dos módulos
 * "normalicen" distinto lo mismo.
 */
/** Punto normalizado 0-1 dentro del frame (dominio, D-03) */
export interface PuntoNorm {
  x: number;
  y: number;
}

/** Cuadrilátero normalizado en orden [TL, TR, BR, BL] (D-03) */
export type QuadNormalizado = [PuntoNorm, PuntoNorm, PuntoNorm, PuntoNorm];

export interface CapturaProcesada {
  /** Imagen recortada + perspectiva corregida + B/N adaptativo (JPEG) */
  imagenDataUrl: string;
  /** Métricas de calidad del badge (0-1 cada una) */
  calidad: { nitidez: number; contraste: number; brillo: number };
  /** Dígitos del barcode15 si el OCR/lector los leyó (validar con parseBarcode15) */
  barcode15?: string | null;
  /** Texto OCR del tercio superior + bandas (para anclas y código X) */
  textoSuperior: string;
  /** Lectura de la zona "X 7-23-10-19 X" (cruda, SIN normalizar) */
  codigoXCrudo?: string | null;
  /** Encabezado DIVIPOL crudo leído (sin normalizar) */
  encabezadoCrudo?: {
    pais?: string;
    zona?: string;
    puesto?: string;
    mesa?: string;
  };
  /** Huella del QR si jsQR lo decodificó (base64url de 44 chars) */
  qrTexto?: string | null;
  // ---- D-03 · contrato de recorte (feedback honesto al operador) ----
  /** El acta fue recortada y warpeada con un cuadrilátero validado */
  recorteAplicado: boolean;
  /** La detección concluyó "el acta llena el frame" (escaneo/foto cerrada) */
  fullFrame: boolean;
  /** Cuadrilátero aplicado (null si no hubo recorte) — base del editor */
  quad: QuadNormalizado | null;
}

export interface ActaRegistro {
  id: string;
  barcode15: string | null;
  tipoEjemplar: TipoEjemplar;
  pagina: number;
  totalPaginas: number;
  estado: ActaEstado;
  scoreCalidad: number | null;
  imagenUrl: string | null;
  filename: string | null;
  createdAt: string;
  analisis?: ActaAnalysis | null;
  verificacion?: VerificacionActa | null;
  asignacion?: AsignacionActa | null;
}

// ------------------------------------------------------------
// VERIFICACIÓN QR ↔ IMAGEN (E-14)
// ------------------------------------------------------------

/** Parseo del QR decodificado en cliente (wire resumido) */
export interface QrParseoWire {
  texto: string | null;
  barcode15: string | null;
  consuladoId: string | null;
  mesa: number | null;
  confianza: number;
  notas: string[];
}

/** Resultado del cruce QR ↔ VLM ↔ bootstrap */
export interface VerificacionActa {
  /** QR decodificado y parseado (null = no se pudo decodificar) */
  qr: QrParseoWire | null;
  /** El QR produjo una ubicación DIVIPOL válida */
  qrDivipolOk: boolean;
  /** El VLM leyó códigos/nombres del encabezado */
  vlmDivipolLeido: boolean;
  /** QR y VLM coinciden en ubicación (null = no comparable) */
  coincidenUbicacion: boolean | null;
  /** QR/barcode y VLM coinciden en ejemplar+página (null = no comparable) */
  coincidenEjemplar: boolean | null;
  /** Mesa final asignada tras el cruce (id legible, ej. mesa-roma-002) */
  mesaAsignada: string | null;
  notas: string[];
}

/** Asignación final del acta a su ubicación correcta */
export interface AsignacionActa {
  consuladoId: string | null;
  mesaId: string | null;
  mesaLabel: string | null;
  tipoEjemplar: TipoEjemplar | null;
  pagina: number | null;
  totalPaginas: number | null;
  origen: "QR" | "VLM" | "QR+VLM" | "MANUAL" | null;
  /** Confianza 0-1 de la asignación */
  confianza: number;
}
