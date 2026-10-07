"use client";

// ============================================================
// DIGITALIZADOR E-14 — Store global (Zustand)
// Máquina de estados de la PWA + comunicación con la API.
// Sustituye al monolito original: estado, negocio y UI separados.
// ============================================================

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";
// [COORD C-16] basePath para assets de demo estática (GitHub Pages)
import { withBasePath } from "@/lib/env";
import type {
  ActaPayload,
  AnalisisVLM,
  CapturaActual,
  ColaItem,
  ConsuladoDTO,
  ContextoCaptura,
  DecisionEnvio,
  EstadoEdicion,
  ResumenTrabajo,
  Vista,
} from "./types";
import { bandaDeScore } from "./reglas";
import {
  calidadAScoreRN02,
  detectarBordes,
  evaluarCalidad,
  quadMarcoCompleto,
  quadPorDefecto,
  siguienteId,
} from "./escaner";
import { comprimirImagen } from "./quality";
// [C-17] PLAN_DIGIELECT_DIGITALIZADOR.md — servicios nuevos
import {
  descargarDatasetPuesto,
  obtenerConfiguracion,
  guardarConfiguracion,
  type PuestoAsignado,
} from "@/services/puestoStorage";
import {
  encolarActa,
  iniciarWorkerSincronizacion,
  migrarColaLegacy,
  sincronizarAhora,
  type ContadoresCola,
} from "@/services/uploadQueue";
import {
  calculateQualityScore,
  extraerBarcode15DeTexto,
  extractTransmissionCode,
  extractTransmissionCodeTolerante,
  leerQrFingerprint,
  validarCrucePagina,
} from "@/lib/scanner/actaParser";
import { leerSenalesOcr } from "@/lib/scanner/ocr-local";
import {
  feedbackAnomalia,
  feedbackEscaneoOk,
} from "./feedback";
import { obtenerIndiceActas } from "@/lib/integracion-captura";
// [C-17] Identificación AUDITADA (rol C): HAMMING1 + cruce encabezado
import { identificarActa } from "@/lib/identificacion-acta";

const COLA_KEY = "digielect-cola-v2";

// ------------------------------------------------------------
// [C-17] Señales deterministas extraídas en el dispositivo
// (PLAN TAREA 1: código X + QR + OCR, sin IA en caliente)
// ------------------------------------------------------------
export interface SenalesLocales {
  /** Código de 7 dígitos leído entre las X (null si no se leyó) */
  codigoX: string | null;
  /** Huella QR base64url de 32 bytes leída con jsQR (null si no) */
  qrFingerprint: string | null;
  /** [C-17] barcode15 detectado en el texto OCR (null si no) */
  barcode15: string | null;
  /** [C-17] Tipo/página derivadas del barcode15 del OCR */
  tipoActaOcr: "TRANSMISION" | "DELEGADOS" | null;
  paginaOcr: number | null;
  totalPaginasOcr: number | null;
  /** Texto OCR crudo del tercio superior (para cruce anti-páginas) */
  textoOcr: string | null;
  /** true → código X ∈ índice (identificación EXACTA O(1)) */
  identificada: boolean;
  /** Ubicación identificada (si identificada) */
  ubicacion: {
    mesa: string;
    consulado: string; // "DIVIPOL 88·335·05·02"
    consuladoId?: string;
  } | null;
  extraccionEnCurso: boolean;
  /** true → la extracción ya corrió para esta captura (guard anti-rerun) */
  extraida: boolean;
}

const SENALES_INICIALES: SenalesLocales = {
  codigoX: null,
  qrFingerprint: null,
  barcode15: null,
  tipoActaOcr: null,
  paginaOcr: null,
  totalPaginasOcr: null,
  textoOcr: null,
  identificada: false,
  ubicacion: null,
  extraccionEnCurso: false,
  extraida: false,
};

interface UltimoEnvio {
  actaId: string;
  estado: string;
  motivo: string;
  advertencia: boolean;
  mesa: string | null;
  tipoEjemplar: string;
  pagina: number;
  hora: string;
}

interface DigitalizadorState {
  // Navegación
  vista: Vista;
  modoManual: boolean;
  enLinea: boolean;

  // Captura
  contexto: ContextoCaptura | null;
  /** Página abierta en el editor (F-DEFER-CROP) */
  edicion: EstadoEdicion | null;
  /** Captura FINALIZADA (procesada) lista para envío */
  captura: CapturaActual | null;
  analisis: AnalisisVLM | null;
  analizando: boolean;
  enviando: boolean;
  ultimoEnvio: UltimoEnvio | null;

  // Datos
  consulados: ConsuladoDTO[];
  resumen: ResumenTrabajo | null;
  cola: ColaItem[];
  cargandoDatos: boolean;

  // [C-17] Puesto asignado + servicios del plan
  arranqueListo: boolean;
  puestoActivo: PuestoAsignado | null;
  /** true → captura lanzada desde PantallaInicio para identificar puesto */
  identificacionPuestoActiva: boolean;
  senalesLocales: SenalesLocales;
  contadoresCola: ContadoresCola;

  // Acciones de navegación
  irA: (vista: Vista) => void;
  toggleModoManual: () => void;
  setContexto: (ctx: ContextoCaptura | null) => void;
  irACapturaDesdeControl: (ctx: ContextoCaptura) => void;
  nuevaCaptura: () => void;

  // [C-17] Acciones del plan (puesto + señales + cola)
  extraerSenalesLocales: (imagenProcesada: string) => Promise<void>;
  inicializarServicios: () => Promise<void>;
  iniciarIdentificacionPuesto: () => void;
  cancelarIdentificacionPuesto: () => void;
  asignarPuesto: (puesto: PuestoAsignado, viaEscaneo?: boolean) => Promise<void>;
  liberarPuesto: () => Promise<void>;
  refrescarContadoresCola: () => Promise<void>;

  // Flujo de captura → editor → envío
  abrirEdicion: (original: string, origen: CapturaActual["origen"]) => void;
  /** Detección automática en segundo plano (F-DEFER-CROP) */
  aplicarQuadAuto: () => Promise<void>;
  setQuad: (quad: EstadoEdicion["quad"], manual: boolean) => void;
  setDimensiones: (w: number, h: number) => void;
  setCalidadFoto: (c: EstadoEdicion["calidad"]) => void;
  setFiltro: (filtro: EstadoEdicion["filtro"]) => void;
  setRotacion: (rotacion: EstadoEdicion["rotacion"]) => void;
  /** Deja la captura finalizada (procesada) lista para enviar */
  finalizarCaptura: (c: CapturaActual) => void;
  repetirFoto: () => void;
  analizarCaptura: () => Promise<AnalisisVLM | null>;
  enviarActa: (opts: {
    advertencia?: boolean;
    barcode15?: string | null;
    mesaId?: string | null;
    tipoEjemplar?: string;
    pagina?: number;
    totalPaginas?: number;
    modoManual?: boolean;
    analisis?: AnalisisVLM | null;
  }) => Promise<boolean>;

  // Datos remotos
  cargarDatos: () => Promise<void>;
  sincronizarCola: () => Promise<{ enviadas: number; fallidas: number }>;
}

/** Cola offline en localStorage (solo LECTURA legada; la escritura nueva va a IndexedDB [C-17]) */
function leerCola(): ColaItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(COLA_KEY) ?? "[]") as ColaItem[];
  } catch {
    return [];
  }
}

/** Número de mesa legible desde el id del monitor (ej. "mesa-roma-002" → 2) */
function mesaNumeroDe(consulados: ConsuladoDTO[], mesaId: string | null | undefined): number {
  if (!mesaId) return 0;
  const mesa = consulados.flatMap((c) => c.mesas).find((m) => m.id === mesaId);
  return mesa?.numero ?? 0;
}

/** Error de API con código de estado (distingue rechazos de fallos de red) */
export class ApiError extends Error {
  status?: number;
  constructor(mensaje: string, status?: number) {
    super(mensaje);
    this.status = status;
  }
}

// ============================================================
// [COORD C-16] PUENTE DE CONTRATO → API de digielect
// El ZIP fue desarrollado contra su propia API (imagenDataUrl /
// barcode15 / mesaId / envioAdvertencia). digielect expone el
// mismo flujo en /api/actas con ActaUploadPayload (imagenBase64 /
// barcode / mesaIdRef / envioEmergencia) + reglas auditadas
// B-01/B-02/B-08 (dedup por huella QR, reemplazo legítimo, límite
// de imagen). Solo se traducen nombres de campos: la lógica del
// digitalizador permanece intacta.
// ============================================================
function payloadADigielect(p: ActaPayload) {
  return {
    imagenBase64: p.imagenDataUrl,
    barcode: p.barcode15 ?? undefined,
    qrTexto: p.qrTexto ?? undefined,
    tipoEjemplar: (p.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS") as
      | "TRANSMISION"
      | "DELEGADOS",
    pagina: p.pagina,
    totalPaginas: p.totalPaginas,
    modoManual: p.modoManual ?? false,
    envioEmergencia: p.envioAdvertencia ?? false,
    scoreCliente: p.scoreCalidad,
    mesaIdRef: p.mesaId ?? undefined,
  };
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? `Error ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export const useDigitalizador = create<DigitalizadorState>((set, get) => ({
  vista: "captura",
  modoManual: false,
  enLinea: true,

  contexto: null,
  edicion: null,
  captura: null,
  analisis: null,
  analizando: false,
  enviando: false,
  ultimoEnvio: null,

  consulados: [],
  resumen: null,
  cola: [],
  cargandoDatos: false,

  // [C-17] Puesto asignado + servicios del plan
  arranqueListo: false,
  puestoActivo: null,
  identificacionPuestoActiva: false,
  senalesLocales: SENALES_INICIALES,
  contadoresCola: { pendientes: 0, sincronizadasTotal: 0, errores: 0 },
  // ----------------------------------------------------------
  // Navegación
  // ----------------------------------------------------------
  irA: (vista) => {
    set({ vista });
    // Al entrar a pantallas de gestión, refrescar datos en background
    if (vista === "control" || vista === "resumen") void get().cargarDatos();
  },

  toggleModoManual: () => {
    const nuevo = !get().modoManual;
    set({ modoManual: nuevo });
    toast({
      title: nuevo ? "MODO MANUAL: ON" : "MODO MANUAL: OFF",
      description: nuevo
        ? "La foto será respaldo visual y se habilitará la asignación manual."
        : "Captura automática por cámara y lectura de códigos activada.",
    });
  },

  setContexto: (ctx) => set({ contexto: ctx }),

  // ----------------------------------------------------------
  // [C-17] PLAN_DIGIELECT_DIGITALIZADOR.md — acciones nuevas
  // ----------------------------------------------------------

  /** Arranque: migración cola legacy + config operario + worker */
  inicializarServicios: async () => {
    try {
      const migradas = await migrarColaLegacy();
      if (migradas > 0) {
        toast({
          title: "COLA MIGRADA",
          description: `${migradas} acta(s) de la cola anterior pasaron a la base local nueva.`,
        });
      }
      const cfg = await obtenerConfiguracion();
      set({
        puestoActivo: cfg.puestoActivo,
        arranqueListo: true,
      });
      // Worker de fondo: listener online + primer barrido silencioso
      iniciarWorkerSincronizacion();
      await get().refrescarContadoresCola();
    } catch {
      // Sin IndexedDB (modo privado): la app funciona con la cola
      // legada en memoria — degradación suave.
      set({ arranqueListo: true });
    }
  },

  /** OPCIÓN A del plan: escaneo de primera acta → auto-asignación */
  iniciarIdentificacionPuesto: () => {
    set({
      identificacionPuestoActiva: true,
      contexto: null,
      edicion: null,
      captura: null,
      analisis: null,
      ultimoEnvio: null,
      senalesLocales: SENALES_INICIALES,
      vista: "captura",
    });
  },

  /** El operario abortó la identificación OPCIÓN A → volver a Inicio */
  cancelarIdentificacionPuesto: () => {
    set({
      identificacionPuestoActiva: false,
      edicion: null,
      captura: null,
      analisis: null,
      ultimoEnvio: null,
      senalesLocales: SENALES_INICIALES,
      vista: "captura",
    });
  },

  /** Asignar puesto (Opción A o B) + descarga de dataset a IndexedDB */
  asignarPuesto: async (puesto, viaEscaneo = false) => {
    const asignado: PuestoAsignado = {
      ...puesto,
      asignadoEn: Date.now(),
      viaEscaneo,
    };
    set({ puestoActivo: asignado, identificacionPuestoActiva: false });
    const cfg = await obtenerConfiguracion();
    await guardarConfiguracion({ ...cfg, puestoActivo: asignado });
    // Descarga del dataset del puesto (TAREA 2.2): en segundo plano,
    // no bloquea la operación del operario.
    void descargarDatasetPuesto(asignado)
      .then((ds) => {
        toast({
          title: "PUESTO ASIGNADO",
          description: `${asignado.puesto} · Zona ${asignado.zona} · ${ds.filas.length} filas locales (${
            ds.origen === "api" ? "API" : "catálogo demo"
          }).`,
        });
      })
      .catch(() => {
        toast({
          title: "PUESTO ASIGNADO",
          description: `${asignado.puesto} · sin dataset local (se reintentará al reconectar).`,
          variant: "destructive",
        });
      });
  },

  /** Liberar el puesto (cambio de sede / fin de jornada) */
  liberarPuesto: async () => {
    set({ puestoActivo: null, identificacionPuestoActiva: false });
    const cfg = await obtenerConfiguracion();
    await guardarConfiguracion({ ...cfg, puestoActivo: null });
    toast({ title: "PUESTO LIBERADO", description: "Selecciona o escanea un nuevo puesto." });
  },

  /** Refresca los contadores del panel de cola (TAREA 5.3) */
  refrescarContadoresCola: async () => {
    try {
      const { obtenerContadores } = await import("@/services/uploadQueue");
      const contadores = await obtenerContadores();
      set({ contadoresCola: contadores });
    } catch {
      /* sin IndexedDB: contadores en cero */
    }
  },

  irACapturaDesdeControl: (ctx) => {
    set({ contexto: ctx, edicion: null, captura: null, analisis: null, ultimoEnvio: null, senalesLocales: SENALES_INICIALES, vista: "captura" });
  },

  nuevaCaptura: () => {
    set({ edicion: null, captura: null, analisis: null, ultimoEnvio: null, senalesLocales: SENALES_INICIALES, vista: "captura" });
  },

  // ----------------------------------------------------------
  // Flujo principal (F-DEFER-CROP: el editor abre AL INSTANTE)
  // ----------------------------------------------------------
  abrirEdicion: (original, origen) => {
    const pagina: EstadoEdicion = {
      id: siguienteId("pag"),
      original,
      originalW: null,
      originalH: null,
      quad: quadPorDefecto(),
      quadManual: false,
      autoQuadPendiente: true,
      // El B/N adaptativo es EL filtro del acta (default ON)
      filtro: "bw",
      rotacion: 0,
      calidad: null,
      origen,
      createdAt: Date.now(),
    };
    set({ edicion: pagina, captura: null, analisis: null, ultimoEnvio: null, senalesLocales: SENALES_INICIALES });
    if (get().modoManual) {
      // Foto solo como respaldo → asignación manual directa
      set({ vista: "contingencia" });
      // Prepara la captura de respaldo (comprimida) en segundo plano
      void (async () => {
        try {
          const [q, comprimida] = await Promise.all([
            evaluarCalidad(original),
            comprimirImagen(original, 1600, 0.82),
          ]);
          // solo si seguimos en la misma página
          if (get().edicion?.id !== pagina.id) return;
          set({
            captura: {
              imagenDataUrl: comprimida,
              metricas: {
                nitidez: q.sharpness / 100,
                contraste: q.contrast / 100,
                brillo: q.brightness / 100,
              },
              score: calidadAScoreRN02(q.score),
              qrTexto: null,
              origen,
              createdAt: pagina.createdAt,
            },
          });
        } catch {
          // sin captura de respaldo: la asignación manual sigue posible
        }
      })();
    } else {
      set({ vista: "revision" });
      void get().analizarCaptura();
    }
    void get().aplicarQuadAuto();
  },

  aplicarQuadAuto: async () => {
    const pag = get().edicion;
    if (!pag || pag.quadManual) return;
    const { quad, fullFrame } = await detectarBordes(pag.original);
    const actual = get().edicion;
    if (!actual || actual.id !== pag.id) return; // repetida/limpiada
    if (actual.quadManual) return;              // la decisión manual manda
    if (fullFrame) {
      // Escaneo completo: el acta llena el marco → no recortar nada
      set({
        edicion: { ...actual, quad: quadMarcoCompleto(), quadManual: false, autoQuadPendiente: false },
      });
    } else if (quad) {
      set({ edicion: { ...actual, quad, quadManual: false, autoQuadPendiente: false } });
    } else {
      // Sin detección: queda el marco provisional ajustable en Recortar
      set({ edicion: { ...actual, autoQuadPendiente: false } });
      toast({
        title: "NO SE DETECTARON BORDES",
        description: "Ajuste el recorte manualmente con el botón RECORTAR.",
      });
    }
  },

  setQuad: (quad, manual) => {
    const pag = get().edicion;
    if (!pag) return;
    set({ edicion: { ...pag, quad, quadManual: manual } });
  },

  setDimensiones: (w, h) => {
    const pag = get().edicion;
    if (!pag) return;
    set({ edicion: { ...pag, originalW: w, originalH: h } });
  },

  setCalidadFoto: (calidad) => {
    const pag = get().edicion;
    if (!pag) return;
    set({ edicion: { ...pag, calidad } });
  },

  setFiltro: (filtro) => {
    const pag = get().edicion;
    if (!pag) return;
    set({ edicion: { ...pag, filtro } });
  },

  setRotacion: (rotacion) => {
    const pag = get().edicion;
    if (!pag) return;
    set({ edicion: { ...pag, rotacion } });
  },

  finalizarCaptura: (c) => {
    set({ captura: c });
    // [C-17] La extracción determinista corre por su cuenta (ver
    // extraerSenalesLocales); aquí solo garantizamos que arranque.
    void get().extraerSenalesLocales(c.imagenDataUrl);
  },

  /**
   * [C-17] PLAN TAREA 1+2 — EXTRACCIÓN DETERMINISTA EN SEGUNDO PLANO
   * sobre la captura PROCESADA (recorte + B/N): QR (jsQR, ms) + OCR
   * del tercio superior (Tesseract vendoreado, seg). El flujo de
   * revisión NUNCA espera a esto (plan §5: UI <200ms). Con guard
   * anti-rerun: una sola vez por captura, sea desde la preview de
   * Revisión o desde finalizarCaptura.
   */
  extraerSenalesLocales: async (imagenProcesada) => {
    const actuales = get().senalesLocales;
    if (actuales.extraida || actuales.extraccionEnCurso) return;
    set({
      senalesLocales: { ...SENALES_INICIALES, extraida: true, extraccionEnCurso: true },
    });
    try {
      // 1) QR → huella de deduplicación (32 bytes base64url)
      const qr = await leerQrFingerprint(imagenProcesada);
      // 2) OCR → zona X → código de 7 dígitos → lookup O(1)
      const ocr = await leerSenalesOcr(imagenProcesada);
      const texto = ocr?.textoSuperior ?? null;
      let codigoX =
        extractTransmissionCode(texto ?? "") ??
        extractTransmissionCodeTolerante(ocr?.codigoXCrudo ?? "") ??
        extractTransmissionCodeTolerante(texto ?? "");

      let identificada = false;
      let ubicacion: SenalesLocales["ubicacion"] = null;
      if (codigoX) {
        // Lookup O(1) en el índice (TAREA 2.3 del plan) con el motor
        // AUDITADO identificarActa: exacta + rescate HAMMING-1 (un
        // dígito mal leído por el OCR) + cruce del encabezado DIVIPOL.
        try {
          const indice = await obtenerIndiceActas();
          const resultado = identificarActa({
            codigoCrudo: codigoX,
            encabezado: ocr?.encabezadoCrudo ?? null,
            indice,
          });
          if (resultado.estado === "IDENTIFICADA" && resultado.entrada) {
            identificada = true;
            // código autoritativo (p.ej. rescate Hamming-1 aplicado)
            codigoX = resultado.codigo ?? codigoX;
            const cns = resultado.entrada.consulado;
            const codigoConsulado = `${cns.municipio}-${cns.zona}-${cns.puesto}`;
            const consuladoState = get().consulados.find(
              (cc) => cc.codigo === codigoConsulado
            );
            ubicacion = {
              mesa: resultado.entrada.mesaNumero,
              consulado: `DIVIPOL ${cns.departamento}·${cns.municipio}·${cns.zona}·${cns.puesto}`,
              consuladoId: consuladoState?.id,
            };
          }
        } catch {
          /* índice no disponible: seguimos con código crudo */
        }
      }

      // [C-17] TAREA 1.2: barcode15 determinista desde el texto OCR
      const senalesBarcode = extraerBarcode15DeTexto(texto);
      set({
        senalesLocales: {
          codigoX,
          qrFingerprint: qr,
          barcode15: senalesBarcode?.barcode15 ?? null,
          tipoActaOcr: senalesBarcode?.tipoActa ?? null,
          paginaOcr: senalesBarcode?.pagina ?? null,
          totalPaginasOcr: senalesBarcode?.totalPaginas ?? null,
          textoOcr: texto,
          identificada,
          ubicacion,
          extraccionEnCurso: false,
          extraida: true,
        },
      });

      // Feedback sonoro + háptico inmediato (TAREA 5.2)
      if (codigoX) feedbackEscaneoOk();

      // OPCIÓN A del plan: sin puesto asignado, la primera acta
      // identificada asigna el puesto automáticamente.
      const { puestoActivo, identificacionPuestoActiva } = get();
      if (
        identificacionPuestoActiva &&
        !puestoActivo &&
        identificada &&
        ubicacion?.consuladoId
      ) {
        const consulado = get().consulados.find(
          (cc) => cc.id === ubicacion.consuladoId
        );
        if (consulado) {
          await get().asignarPuesto(
            {
              consuladoId: consulado.id,
              codigo: consulado.codigo,
              pais: consulado.pais,
              ciudad: consulado.ciudad,
              zona: consulado.zona,
              puesto: consulado.puesto,
              numMesas: consulado.numMesas,
              asignadoEn: Date.now(),
              viaEscaneo: true,
            },
            true
          );
        }
      }
    } catch {
      set({
        senalesLocales: { ...SENALES_INICIALES, extraida: true },
      });
    }
  },

  repetirFoto: () => {
    set({ edicion: null, captura: null, analisis: null, senalesLocales: SENALES_INICIALES, vista: "captura" });
  },

  /** Analiza la foto ORIGINAL con el VLM del servidor */
  analizarCaptura: async () => {
    const { edicion } = get();
    if (!edicion) return null;
    set({ analizando: true });
    try {
      const data = await postJSON<{ ok: boolean; analisis: AnalisisVLM }>(
        "/api/actas/analizar",
        // [COORD C-16] contrato digielect: imagenBase64
        { imagenBase64: edicion.original, qrTexto: null }
      );
      set({ analisis: data.analisis, analizando: false });
      return data.analisis;
    } catch {
      // Análisis en SEGUNDO PLANO: falla en silencio (sin toasts que
      // estorben la revisión). El flujo manual/contingencia sigue.
      set({ analizando: false });
      return null;
    }
  },

  /** Envía el acta al servidor. Si falla la red, encola offline (IndexedDB). */
  enviarActa: async (opts) => {
    const { captura, analisis, contexto, senalesLocales } = get();
    if (!captura) return false;

    const payload: ActaPayload = {
      imagenDataUrl: captura.imagenDataUrl,
      barcode15: opts.barcode15 ?? analisis?.barcode ?? null,
      // [C-17] PLAN §1.1: el QR es la huella de deduplicación — ya
      // se lee en el dispositivo con jsQR y viaja al servidor [B-01]
      qrTexto: senalesLocales.qrFingerprint,
      tipoEjemplar: opts.tipoEjemplar ?? contexto?.tipoEjemplar ?? "DELEGADOS",
      pagina: opts.pagina ?? contexto?.pagina ?? 1,
      totalPaginas: opts.totalPaginas ?? analisis?.totalPaginasLeidas ?? 2,
      scoreCalidad: captura.score,
      modoManual: opts.modoManual ?? false,
      envioAdvertencia: opts.advertencia ?? false,
      mesaId: opts.mesaId ?? contexto?.mesaId ?? null,
      analisis: opts.analisis ?? analisis ?? null,
    };

    // [C-17] GUARD ANTI-CRUCES (TAREA 4.3): barcode declara página,
    // OCR lee anclas de la otra → ANOMALÍA, NUNCA se adivina.
    const cruce = validarCrucePagina({
      paginaBarcode: payload.modoManual ? null : payload.pagina,
      textoOcr: senalesLocales.textoOcr,
    });
    if (!cruce.ok) {
      feedbackAnomalia();
      toast({
        title: "ANOMALÍA — CRUCE DE PÁGINA",
        description: cruce.motivo,
        variant: "destructive",
      });
      return false;
    }

    // [C-17] qualityScore 0-100 del plan (TAREA 3.1)
    const qualityScore = calculateQualityScore({
      sharpness: captura.metricas.nitidez * 100,
      contrast: captura.metricas.contraste * 100,
      hasTransmissionCode: senalesLocales.identificada || senalesLocales.codigoX != null,
      hasQrFingerprint: senalesLocales.qrFingerprint != null,
      hasBarcode15: Boolean(payload.barcode15 && /^\d{15}$/.test(payload.barcode15)),
      crossValidationMatched: senalesLocales.identificada,
    });

    set({ enviando: true });
    try {
      const data = await postJSON<
        {
          ok: boolean;
          duplicado?: boolean;
          acta: { id: string; estado: string };
          decision: DecisionEnvio;
        }
      >("/api/actas", {
        ...payloadADigielect(payload),
        // [C-17] calidad 0-100 para la resolución de concurrencia
        // por ranura en el servidor (TAREA 4.2)
        qualityScore,
      });

      const mesaRef =
        get().consulados.flatMap((c) => c.mesas).find((m) => m.id === payload.mesaId) ?? null;
      set({
        enviando: false,
        enLinea: true,
        ultimoEnvio: {
          actaId: data.acta.id,
          estado: data.decision.estado,
          motivo: data.decision.motivo,
          advertencia: payload.envioAdvertencia ?? false,
          mesa: mesaRef ? `MESA ${String(mesaRef.numero).padStart(2, "0")}` : null,
          tipoEjemplar: payload.tipoEjemplar,
          pagina: payload.pagina,
          hora: new Date().toISOString(),
        },
      });
      set({ vista: "exito" });
      void get().cargarDatos();
      void get().refrescarContadoresCola();
      return true;
    } catch (e) {
      // Rechazo de negocio (4xx): NO es fallo de red → no se encola.
      // EXCEPCIÓN [C-17]: 404/405 en modo demo (Pages sin backend) =
      // "sin servidor que reciba" → va a la cola offline del dispositivo.
      const sinBackend =
        e instanceof ApiError &&
        (e.status === 404 || e.status === 405);
      if (
        !sinBackend &&
        e instanceof ApiError &&
        e.status !== undefined &&
        e.status < 500
      ) {
        set({ enviando: false });
        toast({
          title: "ENVÍO NO REGISTRADO",
          description: e.message,
          variant: "destructive",
        });
        return false;
      }
      // Fallo de red → COLA OFFLINE PRIORIZADA (TAREA 3, IndexedDB)
      const puesto = get().puestoActivo;
      const encolado = await encolarActa({
        idTransmision: senalesLocales.codigoX ?? "",
        qrFingerprint: senalesLocales.qrFingerprint,
        barcode15: payload.barcode15,
        paisDepartamento: puesto?.pais ?? "",
        zona: puesto?.zona ?? "",
        puestoCodigo: puesto?.codigo.split("-")[2] ?? "",
        puestoNombre: puesto?.puesto ?? "",
        mesa: mesaNumeroDe(get().consulados, payload.mesaId),
        tipoActa: payload.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS",
        pagina: payload.pagina,
        totalPaginas: payload.totalPaginas,
        sharpness: captura.metricas.nitidez * 100,
        contrast: captura.metricas.contraste * 100,
        hasTransmissionCode: senalesLocales.identificada || senalesLocales.codigoX != null,
        crossValidationMatched: senalesLocales.identificada,
        imagenDataUrl: captura.imagenDataUrl,
        mesaIdRef: payload.mesaId,
        modoManual: payload.modoManual,
        envioAdvertencia: payload.envioAdvertencia,
      });
      set({ enviando: false, enLinea: false });
      void get().refrescarContadoresCola();
      if (!encolado.ok) {
        // TAREA 4.1: dedup por huella QR — descartar en limpio y
        // avisar al operario (sin navegar: la captura es duplicada)
        toast({
          title: "ACTA YA REGISTRADA",
          description: `${encolado.motivo} No se volvió a enviar.`,
        });
        set({ enviando: false });
        return false;
      }
      toast({
        title: "SIN CONEXIÓN — GUARDADA EN COLA OFFLINE",
        description: `Quality ${encolado.item.qualityScore}/100 · se enviará al reconectar (prioridad por nitidez).`,
        variant: "destructive",
      });
      // [C-17] registrar el envío en cola para la pantalla de éxito
      set({
        ultimoEnvio: {
          actaId: encolado.item.id,
          estado: "EN_COLA",
          motivo: `SIN CONEXIÓN — GUARDADA EN COLA OFFLINE (calidad ${encolado.item.qualityScore}/100)`,
          advertencia: payload.envioAdvertencia ?? false,
          mesa:
            mesaNumeroDe(get().consulados, payload.mesaId) > 0
              ? `MESA ${String(mesaNumeroDe(get().consulados, payload.mesaId)).padStart(2, "0")}`
              : null,
          tipoEjemplar: payload.tipoEjemplar,
          pagina: payload.pagina,
          hora: new Date().toISOString(),
        },
      });
      set({ vista: "exito" });
      return false;
    }
  },

  // ----------------------------------------------------------
  // Datos remotos
  // ----------------------------------------------------------
  cargarDatos: async () => {
    if (get().cargandoDatos) return;
    set({ cargandoDatos: true });
    try {
      const res = await fetch(
        // [COORD C-16] bootstrap dedicado del digitalizador (mismo
        // contrato que el ZIP; /api/bootstrap sigue siendo el del
        // tablero del supervisor)
        "/api/digitalizador/bootstrap",
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = (await res.json()) as {
        consulados: ConsuladoDTO[];
        resumen: ResumenTrabajo;
      };
      set({
        consulados: data.consulados,
        resumen: data.resumen,
        enLinea: true,
        cola: leerCola(),
        cargandoDatos: false,
      });
    } catch {
      // [COORD C-16] Demo estática (GitHub Pages, sin backend): cae a
      // los datos de demo servidos como JSON estático para que la
      // asignación manual funcione. El indicador sigue OFFLINE
      // (verdad operativa: no hay servidor que reciba el envío y
      // las actas van a la cola local).
      try {
        const res = await fetch(
          withBasePath("/data/digitalizador-bootstrap.json"),
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("sin demo");
        const data = (await res.json()) as {
          consulados: ConsuladoDTO[];
          resumen: ResumenTrabajo;
        };
        set({
          consulados: data.consulados,
          resumen: data.resumen,
          enLinea: false,
          cola: leerCola(),
          cargandoDatos: false,
        });
      } catch {
        set({ enLinea: false, cargandoDatos: false, cola: leerCola() });
      }
    }
  },

  sincronizarCola: async () => {
    // [C-17] TAREA 3.3: worker único con backoff y orden qualityScore
    const r = await sincronizarAhora();
    await get().refrescarContadoresCola();
    if (r.enviadas > 0) {
      void get().cargarDatos();
    } else if (r.pendientes > 0) {
      toast({
        title: "NO FUE POSIBLE SINCRONIZAR",
        description: "Verifique la conexión; reintento automático programado.",
        variant: "destructive",
      });
    }
    return { enviadas: r.enviadas, fallidas: Math.max(0, r.pendientes) };
  },
}));

/** Banda de la captura actual (helper derivado) */
export function bandaDeCaptura(score: number) {
  return bandaDeScore(score);
}
