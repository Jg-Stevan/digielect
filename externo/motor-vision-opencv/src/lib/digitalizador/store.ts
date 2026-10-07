"use client";

// ============================================================
// DIGITALIZADOR E-14 — Store global (Zustand)
// Máquina de estados de la PWA + comunicación con la API.
// Sustituye al monolito original: estado, negocio y UI separados.
// ============================================================

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";
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

const COLA_KEY = "digielect-cola-v2";

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
  /** Repeticiones hechas tras un score RECHAZADO (≤5): 0 = primer intento.
   *  Al 2º intento se habilita "enviar a revisión humana" (RN-02). */
  intentosRechazo: number;

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

  // Acciones de navegación
  irA: (vista: Vista) => void;
  toggleModoManual: () => void;
  setContexto: (ctx: ContextoCaptura | null) => void;
  irACapturaDesdeControl: (ctx: ContextoCaptura) => void;
  nuevaCaptura: () => void;
  /** Repetir obligado por score rechazado (cuenta el intento) */
  repetirPorRechazo: () => void;

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

/** Cola offline en localStorage */
function leerCola(): ColaItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(COLA_KEY) ?? "[]") as ColaItem[];
  } catch {
    return [];
  }
}
function guardarCola(cola: ColaItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLA_KEY, JSON.stringify(cola));
  } catch {
    // almacenamiento lleno — se ignora
  }
}

/** Error de API con código de estado (distingue rechazos de fallos de red) */
export class ApiError extends Error {
  status?: number;
  constructor(mensaje: string, status?: number) {
    super(mensaje);
    this.status = status;
  }
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
  intentosRechazo: 0,

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

  irACapturaDesdeControl: (ctx) => {
    set({ contexto: ctx, edicion: null, captura: null, analisis: null, ultimoEnvio: null, intentosRechazo: 0, vista: "captura" });
  },

  nuevaCaptura: () => {
    set({ edicion: null, captura: null, analisis: null, ultimoEnvio: null, intentosRechazo: 0, vista: "captura" });
  },

  repetirPorRechazo: () => {
    set({
      intentosRechazo: get().intentosRechazo + 1,
      edicion: null,
      captura: null,
      analisis: null,
      vista: "captura",
    });
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
    set({ edicion: pagina, captura: null, analisis: null, ultimoEnvio: null });
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
  },

  repetirFoto: () => {
    set({ edicion: null, captura: null, analisis: null, vista: "captura" });
  },

  /** Analiza la foto ORIGINAL con el VLM del servidor */
  analizarCaptura: async () => {
    const { edicion } = get();
    if (!edicion) return null;
    set({ analizando: true });
    try {
      const data = await postJSON<{ ok: boolean; analisis: AnalisisVLM }>(
        "/api/actas/analizar",
        { imagenDataUrl: edicion.original, qrTexto: null }
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

  /** Envía el acta al servidor. Si falla la red, encola offline. */
  enviarActa: async (opts) => {
    const { captura, analisis, contexto } = get();
    if (!captura) return false;

    const payload: ActaPayload = {
      imagenDataUrl: captura.imagenDataUrl,
      barcode15: opts.barcode15 ?? analisis?.barcode ?? null,
      qrTexto: null,
      tipoEjemplar: opts.tipoEjemplar ?? contexto?.tipoEjemplar ?? "DELEGADOS",
      pagina: opts.pagina ?? contexto?.pagina ?? 1,
      totalPaginas: opts.totalPaginas ?? analisis?.totalPaginasLeidas ?? 2,
      scoreCalidad: captura.score,
      modoManual: opts.modoManual ?? false,
      envioAdvertencia: opts.advertencia ?? false,
      mesaId: opts.mesaId ?? contexto?.mesaId ?? null,
      analisis: opts.analisis ?? analisis ?? null,
    };

    set({ enviando: true });
    try {
      const data = await postJSON<{
        ok: boolean;
        duplicado?: boolean;
        acta: { id: string; estado: string };
        decision: DecisionEnvio;
      }>("/api/actas", payload);

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
      set({ vista: "exito", intentosRechazo: 0 });
      void get().cargarDatos();
      return true;
    } catch (e) {
      // Rechazo de negocio (4xx): NO es fallo de red → no se encola
      if (e instanceof ApiError && e.status !== undefined && e.status < 500) {
        set({ enviando: false });
        toast({
          title: "ENVÍO NO REGISTRADO",
          description: e.message,
          variant: "destructive",
        });
        return false;
      }
      // Fallo de red → cola offline
      const item: ColaItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload,
        enqueuedAt: Date.now(),
        intentos: 0,
      };
      const cola = [...leerCola(), item];
      guardarCola(cola);
      set({ enviando: false, enLinea: false, cola });
      toast({
        title: "SIN CONEXIÓN — GUARDADA EN COLA OFFLINE",
        description:
          e instanceof Error
            ? `${e.message}. El acta se enviará al sincronizar la cola.`
            : "El acta se enviará al sincronizar la cola.",
        variant: "destructive",
      });
      set({ vista: "exito", intentosRechazo: 0 });
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
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
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
      set({ enLinea: false, cargandoDatos: false, cola: leerCola() });
    }
  },

  sincronizarCola: async () => {
    const cola = leerCola();
    let enviadas = 0;
    const restantes: ColaItem[] = [];
    for (const item of cola) {
      try {
        await postJSON("/api/actas", item.payload);
        enviadas++;
      } catch {
        restantes.push({ ...item, intentos: item.intentos + 1 });
      }
    }
    guardarCola(restantes);
    set({ cola: restantes, enLinea: restantes.length === 0 });
    if (enviadas > 0) {
      toast({
        title: `COLA SINCRONIZADA (${enviadas})`,
        description: `${enviadas} acta(s) enviada(s) al servidor.`,
      });
      void get().cargarDatos();
    } else if (restantes.length > 0) {
      toast({
        title: "NO FUE POSIBLE SINCRONIZAR",
        description: "Verifique la conexión e intente de nuevo.",
        variant: "destructive",
      });
    }
    return { enviadas, fallidas: restantes.length };
  },
}));

/** Banda de la captura actual (helper derivado) */
export function bandaDeCaptura(score: number) {
  return bandaDeScore(score);
}
