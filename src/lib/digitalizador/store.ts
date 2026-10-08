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
  AnuncioSiguiente,
  CapturaActual,
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
  huellaEnviadaPrevia,
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
  type ResultadoEncolado,
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
import type { PayloadIngesta } from "@/lib/integracion-captura";
// [C-17] Identificación AUDITADA (rol C): HAMMING1 + cruce encabezado
import { identificarActa } from "@/lib/identificacion-acta";

// [OLA7 · M-1 AN-3] Eliminada la cola legada localStorage (COLA_KEY
// "digielect-cola-v2" + leerCola): la escritura vive en IndexedDB desde
// C-17 y el único lector que quedaba (PantallaResumen) mostraba SIEMPRE 0.
// La migración de esa clave la sigue haciendo migrarColaLegacy() en
// services/uploadQueue.ts — no se pierde nada del dispositivo.

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
  cargandoDatos: boolean;

  // [C-17] Puesto asignado + servicios del plan
  arranqueListo: boolean;
  puestoActivo: PuestoAsignado | null;
  /** true → captura lanzada desde PantallaInicio para identificar puesto */
  identificacionPuestoActiva: boolean;
  senalesLocales: SenalesLocales;
  contadoresCola: ContadoresCola;
  /** [OLA4 4.6] Anuncio del siguiente objetivo dirigido tras un envío
   * exitoso (null = sin avance reciente / escaneo libre). Lo pinta la
   * pantalla de ÉXITO mientras el contexto ya quedó avanzado. */
  siguienteObjetivo: AnuncioSiguiente | null;

  // Acciones de navegación
  irA: (vista: Vista) => void;
  toggleModoManual: () => void;
  setContexto: (ctx: ContextoCaptura | null) => void;
  irACapturaDesdeControl: (ctx: ContextoCaptura) => void;
  nuevaCaptura: () => void;
  /** [OLA4 4.6] Avanza el contexto de captura dirigida tras un envío
   * exitoso (P1→P2→siguiente tipoEjemplar→mesa completa). El visor
   * sugiere entonces el siguiente objetivo ("SIGUIENTE · MESA X ·
   * TRANSMISIÓN · P2"). `enviado` = ranura efectivamente llenada por
   * el envío (si difiere de la mesa del objetivo, NO se avanza). */
  avanzarContexto: (enviado?: {
    mesaId?: string | null;
    tipoEjemplar: string;
    pagina: number;
  }) => void;

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

// -----------------------------------------------------------
// [OLA7 · M-1 AN-3] leerCola()/ColaItem eliminados: la cola legada
// localStorage (digielect-cola-v2) ya solo la migra migrarColaLegacy()
// en services/uploadQueue.ts. La verdad operativa del dispositivo son
// contadoresCola + obtenerColaOrdenada() sobre IndexedDB.
// -----------------------------------------------------------

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
function payloadADigielect(p: ActaPayload): PayloadIngesta {
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
    // [OLA4 4.1] RN-03 rescaneo: id del acta previa que este envío
    // reemplaza (la decide el guard local — ver resolverReemplazoDe).
    reemplazoDe: p.reemplazoDe ?? undefined,
  };
}

/**
 * [OLA4 4.1] Guard local de REEMPLAZO (RN-03): ¿debe esta captura
 * REEMPLAZAR una hoja previa no-VALIDADA de la misma huella QR?
 * Devuelve el mejor identificador disponible de esa hoja previa
 * para el campo `reemplazoDe` del contrato (PayloadIngesta, flujo
 * B-02 del backend):
 *   1. Ranura objetivo con acta previa NO VALIDADA según el
 *      bootstrap (verdad del servidor) → id del acta EN EL SERVIDOR.
 *   2. Envío previo de la MISMA huella desde este dispositivo (ítem
 *      SINCRONIZADA de la cola local) → código de transmisión.
 * null → envío nuevo. El servidor SIEMPRE re-verifica (route.ts:
 * sólo honra reemplazoDe si `previa` por huella QR existe y NO es
 * VALIDADO), así que un valor conservador jamás sobrescribe una
 * hoja validada: la responde como QR DUPLICADO igual que hoy.
 */
async function resolverReemplazoDe(args: {
  qrFingerprint: string | null;
  mesaId?: string | null;
  tipoEjemplar: string;
  pagina: number;
  consulados: ConsuladoDTO[];
}): Promise<string | null> {
  const { qrFingerprint, mesaId, tipoEjemplar, pagina, consulados } = args;
  // Sin huella QR el servidor no puede localizar la hoja previa
  // (B-01 dedup por qrFingerprint): reemplazoDe sería inútil.
  if (!qrFingerprint) return null;
  // 1) Ranura objetivo: bootstrap = estado REAL del servidor.
  if (mesaId) {
    const mesa =
      consulados.flatMap((c) => c.mesas).find((m) => m.id === mesaId) ?? null;
    const previaRanura =
      mesa?.actas.find(
        (a) => a.tipoEjemplar === tipoEjemplar && a.pagina === pagina
      ) ?? null;
    if (previaRanura && previaRanura.estado !== "VALIDADO") {
      // Id del acta en el servidor: el identificador EXACTO que pide
      // el contrato (B-02 archiva esa captura en la misma transacción).
      return previaRanura.id;
    }
  }
  // 2) Evidencia local: esta huella ya fue enviada al servidor desde
  //    este dispositivo (p.ej. ANOMALIA registrada; el supervisor pidió
  //    rescaneo y el operario vuelve a escanear la misma hoja física).
  try {
    const previa = await huellaEnviadaPrevia(qrFingerprint);
    if (previa) return previa.idTransmision || qrFingerprint;
  } catch {
    /* sin IndexedDB (modo privado): sin evidencia local */
  }
  return null;
}

// ------------------------------------------------------------
// [OLA4 4.6] Avance de ranura de la captura dirigida
// ------------------------------------------------------------

/** Siguiente ranura de la mesa: P1→P2→siguiente tipo
 * (DELEGADOS→TRANSMISIÓN)→null (mesa completa). */
function siguienteRanura(ranura: ContextoCaptura): ContextoCaptura | null {
  if (ranura.pagina === 1) {
    return { mesaId: ranura.mesaId, tipoEjemplar: ranura.tipoEjemplar, pagina: 2 };
  }
  if (ranura.tipoEjemplar === "DELEGADOS") {
    return { mesaId: ranura.mesaId, tipoEjemplar: "TRANSMISION", pagina: 1 };
  }
  return null; // TRANSMISIÓN P2 → mesa completa
}

/** Etiqueta legible de una ranura: "MESA 05 · TRANSMISION · P2". */
function etiquetaRanura(
  consulados: ConsuladoDTO[],
  ranura: { mesaId: string; tipoEjemplar: string; pagina: number }
): string {
  const numero = mesaNumeroDe(consulados, ranura.mesaId);
  const prefijo = numero > 0 ? `MESA ${String(numero).padStart(2, "0")} · ` : "";
  return `${prefijo}${ranura.tipoEjemplar} · P${ranura.pagina}`;
}

/** Etiqueta de cierre: "MESA 05 COMPLETA". */
function etiquetaMesaCompleta(consulados: ConsuladoDTO[], mesaId: string): string {
  const numero = mesaNumeroDe(consulados, mesaId);
  return numero > 0 ? `MESA ${String(numero).padStart(2, "0")} COMPLETA` : "MESA COMPLETA";
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
  cargandoDatos: false,

  // [C-17] Puesto asignado + servicios del plan
  arranqueListo: false,
  puestoActivo: null,
  identificacionPuestoActiva: false,
  senalesLocales: SENALES_INICIALES,
  contadoresCola: { pendientes: 0, sincronizadasTotal: 0, errores: 0 },
  siguienteObjetivo: null,
  // ----------------------------------------------------------
  // Navegación
  // ----------------------------------------------------------
  irA: (vista) => {
    set({ vista });
    // Al entrar a pantallas de gestión, refrescar datos en background
    if (vista === "control" || vista === "resumen") {
      void get().cargarDatos();
      // [OLA7 · M-1 AN-3] Contadores REALES de la cola IndexedDB: el
      // Resumen necesita pendientes/errores/sincronizadas frescos al
      // entrar (antes solo los refrescaba el worker de fondo).
      void get().refrescarContadoresCola();
    }
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
      siguienteObjetivo: null,
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
      siguienteObjetivo: null,
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
    set({ contexto: ctx, edicion: null, captura: null, analisis: null, ultimoEnvio: null, senalesLocales: SENALES_INICIALES, siguienteObjetivo: null, vista: "captura" });
  },

  nuevaCaptura: () => {
    set({ edicion: null, captura: null, analisis: null, ultimoEnvio: null, senalesLocales: SENALES_INICIALES, vista: "captura" });
  },

  /**
   * [OLA4 4.6] Avance de ranura tras un envío EXITOSO con captura
   * dirigida: P1→P2→siguiente tipoEjemplar (DELEGADOS→TRANSMISIÓN)→
   * limpiar (mesa completa). El visor de captura sugiere entonces el
   * nuevo objetivo con la marca `avanzadoEn` (banner "SIGUIENTE ·
   * MESA X · TIPO · P2") y la pantalla de éxito lo anuncia desde
   * `siguienteObjetivo`.
   * `enviado` = ranura que el envío llenó EFECTIVAMENTE (barcode
   * físico manda sobre el objetivo): si cayó en otra mesa, el
   * objetivo dirigido sigue vigente y NO se adivina ningún avance.
   */
  avanzarContexto: (enviado) => {
    const ctx = get().contexto;
    if (!ctx) return;
    // Sin mesa en el envío, o mesa distinta a la del objetivo dirigido:
    // el objetivo sigue vigente — no se adivina ningún avance.
    if (!enviado || enviado.mesaId !== ctx.mesaId) return;
    const consulados = get().consulados;
    const tipoEfectivo: ContextoCaptura["tipoEjemplar"] =
      enviado.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS";
    const paginaEfectiva = Math.max(1, Math.round(enviado.pagina ?? ctx.pagina));
    const ranuraEnviada: ContextoCaptura = {
      mesaId: ctx.mesaId,
      tipoEjemplar: tipoEfectivo,
      pagina: paginaEfectiva,
    };
    const ahora = Date.now();
    const sig = siguienteRanura(ranuraEnviada);
    if (sig) {
      set({
        contexto: { ...sig, avanzadoEn: ahora },
        siguienteObjetivo: {
          etiqueta: etiquetaRanura(consulados, sig),
          mesaCompleta: false,
          avanzadoEn: ahora,
        },
      });
    } else {
      set({
        contexto: null,
        siguienteObjetivo: {
          etiqueta: etiquetaMesaCompleta(consulados, ctx.mesaId),
          mesaCompleta: true,
          avanzadoEn: ahora,
        },
      });
    }
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

    // [OLA4 4.1] Guard local de reemplazo (RN-03): si esta captura
    // re-escanea una hoja cuya ranura previa NO está VALIDADA (p.ej.
    // el supervisor pidió rescaneo de una ANOMALIA), el envío viaja
    // con `reemplazoDe` = id del acta previa para que el servidor la
    // archive y cree la nueva en la misma transacción (B-02) en vez
    // de responder "QR DUPLICADO".
    payload.reemplazoDe = await resolverReemplazoDe({
      qrFingerprint: senalesLocales.qrFingerprint,
      mesaId: payload.mesaId,
      tipoEjemplar: payload.tipoEjemplar,
      pagina: payload.pagina,
      consulados: get().consulados,
    });

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
          // [OLA4 4.4/4.5] El cruce del servidor (QR↔VLM↔tabla) archivó
          // el acta en una mesa DISTINTA a la declarada por este envío.
          ubicacionDiscrepante?: boolean;
          mesaDeclaradaRef?: string | null;
          // [OLA4 4.6] Asignación FINAL computada por el servidor
          // (cruce QR↔VLM↔tabla): la ranura donde el acta quedó
          // EFECTIVAMENTE archivada — manda sobre la declarada para
          // decidir si el objetivo dirigido avanza.
          asignacion?: {
            mesaId: string | null;
            tipoEjemplar: string | null;
            pagina: number | null;
          } | null;
        }
      >("/api/actas", {
        ...payloadADigielect(payload),
        // [C-17] calidad 0-100 para la resolución de concurrencia
        // por ranura en el servidor (TAREA 4.2)
        qualityScore,
      });

      // [OLA4 4.4/4.5 · post-4.4] La mesa computada por el servidor mandó
      // sobre la declarada (autoridad de mesa computada, backend OLA4-A):
      // el operario se entera de que el acta quedó en OTRA mesa. Si el
      // acta fue VALIDADA, el servidor además abrió el caso
      // UBICACION_DISCREPANTE en la bandeja del supervisor (además del
      // AuditEvent).
      if (data.ubicacionDiscrepante) {
        toast({
          title: "ACTA ARCHIVADA EN OTRA MESA — VERIFIQUE",
          description: `La mesa declarada (${data.mesaDeclaradaRef ?? payload.mesaId ?? "—"}) difiere de la computada por el cruce QR↔VLM. ${
            data.acta?.estado === "VALIDADO"
              ? "El supervisor recibió el caso en su bandeja de anomalías (UBICACIÓN DISCREPANTE)."
              : "Verifique el puesto antes de continuar."
          }`,
          variant: "destructive",
        });
      }

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
      // [OLA4 4.6] Avance de ranura tras éxito: el contexto dirigido
      // pasa al siguiente objetivo (P1→P2→siguiente tipo→limpiar) y el
      // anuncio viaja en `siguienteObjetivo` para la pantalla de éxito.
      // La ranura EFECTIVA es la COMPUTADA por el servidor cuando el
      // cruce QR↔VLM↔tabla resolvió una (autoridad de mesa computada,
      // backend OLA4-A 4.4): si el acta quedó en OTRA mesa, el objetivo
      // dirigido NO avanza (esa ranura sigue esperando SU hoja).
      // Un RECHAZADO FRESCO (esta captura es mala: falta de firmas,
      // score bajo) tampoco avanza: el operario debe repetir LA MISMA
      // hoja — y ese re-envío viaja con `reemplazoDe` (4.1) para que el
      // servidor archive la anterior (B-02). En cambio, los rechazos
      // que reflejan una hoja YA registrada (QR DUPLICADO · RANURA YA
      // VALIDADA · MENOR CALIDAD con acta existente VALIDADO) SÍ son
      // camino de éxito del cliente: la ranura quedó ocupada.
      const ranuraOcupada =
        data.decision.estado !== "RECHAZADO" ||
        data.duplicado === true ||
        data.acta?.estado === "VALIDADO";
      if (ranuraOcupada) {
        get().avanzarContexto({
          mesaId: data.asignacion?.mesaId ?? payload.mesaId,
          tipoEjemplar: data.asignacion?.tipoEjemplar ?? payload.tipoEjemplar,
          pagina: data.asignacion?.pagina ?? payload.pagina,
        });
      }
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
      let encolado: ResultadoEncolado;
      try {
        encolado = await encolarActa({
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
        // [OLA4 4.1] el reemplazo declarado viaja también por la cola:
        // puentePorDefecto lo incluye en el POST al sincronizar.
        reemplazoDe: payload.reemplazoDe ?? null,
        });
      } catch (err) {
        // [OLA1 1.5] IndexedDB lleno (QuotaExceededError) u otro fallo
        // de persistencia: NUNCA dejar enviando=true (botones
        // "ENVIANDO…" perpetuos) ni perder la captura en silencio.
        set({ enviando: false });
        toast({
          title: "DISPOSITIVO SIN ESPACIO",
          description:
            "No se pudo guardar el acta en la cola offline (almacenamiento lleno). Libere espacio y vuelva a enviar.",
          variant: "destructive",
        });
        console.error("[digielect] encolarActa falló:", err);
        return false;
      }
      set({ enviando: false, enLinea: false, siguienteObjetivo: null });
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
          cargandoDatos: false,
        });
      } catch {
        set({ enLinea: false, cargandoDatos: false });
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
