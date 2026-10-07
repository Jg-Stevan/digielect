"use client";

// ============================================================
// DIGIELECT · TAREAS 3 y 4 (PLAN_DIGIELECT_DIGITALIZADOR.md) · C-17
// GESTOR DE COLA CON PRIORIDAD POR CALIDAD + WORKER DE FONDO.
//
// · Orden de envío: estado PENDIENTE primero, qualityScore DESC
//   (las actas nítidas y 100% verificadas suben antes).
// · Worker en segundo plano: escucha navigator.onLine, envía a la
//   API con backoff exponencial y NUNCA bloquea la cámara.
// · Deduplicación por huella QR (TAREA 4.1): la misma acta física
//   se descarta en limpio, avisando al operario.
// · La resolución de concurrencia por ranura (TAREA 4.2, score +10)
//   la decide el servidor en /api/actas — aquí se honra su respuesta.
// · Migración automática de la cola antigua (localStorage v2) para
//   no perder actas de dispositivos ya desplegados.
// ============================================================

import { toast } from "@/hooks/use-toast";
import {
  allActasCola,
  deleteActaCola,
  existeHuellaEnCola,
  obtenerConfiguracion,
  guardarConfiguracion,
  putActaCola,
  type ActaQueueItem,
  type EstadoCola,
  type TipoActaCola,
} from "./puestoStorage";
import { calculateQualityScore } from "@/lib/scanner/actaParser";

const COLA_LEGACY_KEY = "digielect-cola-v2";

// ------------------------------------------------------------
// ENCOLAR
// ------------------------------------------------------------

export interface DatosEncolado {
  idTransmision: string;
  qrFingerprint: string | null;
  barcode15?: string | null;
  paisDepartamento: string;
  zona: string;
  puestoCodigo: string;
  puestoNombre: string;
  mesa: number;
  tipoActa: TipoActaCola;
  pagina: number;
  totalPaginas: number;
  sharpness: number; // 0-100
  contrast: number; // 0-100
  hasTransmissionCode: boolean;
  crossValidationMatched: boolean;
  imagenDataUrl: string;
  /** Extras del contrato digielect (aditivos al §3.2 del plan) */
  mesaIdRef?: string | null;
  modoManual?: boolean;
  envioAdvertencia?: boolean;
}

export type ResultadoEncolado =
  | { ok: true; item: ActaQueueItem }
  | { ok: false; duplicado: true; motivo: string };

/**
 * Calcula el qualityScore con la fórmula del plan y persiste el
 * ítem como PENDIENTE. Si la huella QR ya está en la cola, lo
 * descarta en limpio (TAREA 4.1) sin duplicar envíos futuros.
 */
export async function encolarActa(
  datos: DatosEncolado
): Promise<ResultadoEncolado> {
  // Guard de deduplicación local por huella QR
  if (datos.qrFingerprint) {
    const previa = await existeHuellaEnCola(datos.qrFingerprint);
    if (previa) {
      return {
        ok: false,
        duplicado: true,
        motivo: "Esta acta física ya fue registrada previamente.",
      };
    }
  }

  const qualityScore = calculateQualityScore({
    sharpness: datos.sharpness,
    contrast: datos.contrast,
    hasTransmissionCode: datos.hasTransmissionCode,
    hasQrFingerprint: Boolean(datos.qrFingerprint),
    hasBarcode15: Boolean(datos.barcode15),
    crossValidationMatched: datos.crossValidationMatched,
  });

  const item: ActaQueueItem = {
    id: crypto.randomUUID(),
    idTransmision: datos.idTransmision,
    qrFingerprint: datos.qrFingerprint,
    barcode15: datos.barcode15 ?? undefined,
    paisDepartamento: datos.paisDepartamento,
    zona: datos.zona,
    puestoCodigo: datos.puestoCodigo,
    puestoNombre: datos.puestoNombre,
    mesa: datos.mesa,
    tipoActa: datos.tipoActa,
    pagina: datos.pagina,
    totalPaginas: datos.totalPaginas,
    qualityScore,
    sharpnessScore: Math.round(datos.sharpness),
    contrastScore: Math.round(datos.contrast),
    imagenBlob: datos.imagenDataUrl,
    tamanoBytes: Math.round((datos.imagenDataUrl.length * 3) / 4),
    estado: "PENDIENTE",
    intentosSubida: 0,
    createdAt: Date.now(),
    mesaIdRef: datos.mesaIdRef ?? null,
    modoManual: datos.modoManual ?? false,
    envioAdvertencia: datos.envioAdvertencia ?? false,
  } as ActaQueueItem;

  await putActaCola(item);
  return { ok: true, item };
}

// ------------------------------------------------------------
// ORDEN DE LA COLA (TAREA 3.2)
// ------------------------------------------------------------

const RANGO_PENDIENTES: EstadoCola[] = ["PENDIENTE", "ERROR"];

/**
 * Cola visible ordenada: PENDIENTE/ERROR primero por qualityScore
 * DESC; al final las SINCRONIZADA de la sesión (informativas).
 */
export async function obtenerColaOrdenada(): Promise<ActaQueueItem[]> {
  const todos = await allActasCola();
  const pendientes = todos
    .filter((i) => RANGO_PENDIENTES.includes(i.estado))
    .sort((a, b) => b.qualityScore - a.qualityScore || a.createdAt - b.createdAt);
  const subiendo = todos.filter((i) => i.estado === "SUBIENDO");
  const sincronizadas = todos
    .filter((i) => i.estado === "SINCRONIZADA")
    .sort((a, b) => (b.syncedAt ?? 0) - (a.syncedAt ?? 0))
    .slice(0, 50); // memoria acotada en el dispositivo
  const anomalias = todos.filter((i) => i.estado === "ANOMALIA");
  return [...subiendo, ...pendientes, ...anomalias, ...sincronizadas];
}

export interface ContadoresCola {
  pendientes: number;
  sincronizadasTotal: number;
  errores: number;
}

export async function obtenerContadores(): Promise<ContadoresCola> {
  const [todos, cfg] = await Promise.all([allActasCola(), obtenerConfiguracion()]);
  return {
    pendientes: todos.filter((i) => RANGO_PENDIENTES.includes(i.estado)).length,
    sincronizadasTotal: cfg.sincronizadasTotal,
    errores: todos.filter((i) => i.estado === "ERROR").length,
  };
}

// ------------------------------------------------------------
// WORKER DE SINCRONIZACIÓN EN SEGUNDO PLANO (TAREA 3.3)
// ------------------------------------------------------------

interface PuenteEnvio {
  (item: ActaQueueItem): Promise<
    | { ok: true; duplicado?: boolean }
    | { ok: false; retriable: boolean; error: string }
  >;
}

/** Puente por defecto → POST /api/actas (contrato digielect auditado) */
const puentePorDefecto: PuenteEnvio = async (item) => {
  try {
    const res = await fetch("/api/actas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imagenBase64: item.imagenBlob,
        barcode: item.barcode15,
        qrTexto: item.qrFingerprint ?? undefined,
        tipoEjemplar:
          item.tipoActa === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS",
        pagina: item.pagina,
        totalPaginas: item.totalPaginas,
        modoManual: item.modoManual ?? false,
        envioEmergencia: item.envioAdvertencia ?? false,
        scoreCliente: Math.round(item.qualityScore / 10),
        mesaIdRef: item.mesaIdRef ?? undefined,
        // C-17: qualityScore 0-100 para la resolución de concurrencia
        // por ranura en el servidor (TAREA 4.2 del plan)
        qualityScore: item.qualityScore,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      duplicado?: boolean;
      error?: string;
    };
    if (!res.ok) {
      // 4xx = rechazo de negocio (no retriable) · 5xx = red/servidor
      return {
        ok: false,
        retriable: res.status >= 500 || res.status === 429,
        error: data.error ?? `Error ${res.status}`,
      };
    }
    return { ok: true, duplicado: data.duplicado };
  } catch (e) {
    return {
      ok: false,
      retriable: true,
      error: e instanceof Error ? e.message : "fallo de red",
    };
  }
};

let puenteActivo: PuenteEnvio = puentePorDefecto;
/** Inyección para pruebas/e2e (no bloquea la cámara en el hook) */
export function configurarPuenteEnvio(p: PuenteEnvio | null): void {
  puenteActivo = p ?? puentePorDefecto;
}

let workerActivo = false;
let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Backoff exponencial: 1s, 2s, 4s… tope 60s (plan TAREA 3.3) */
function delayBackoff(intentos: number): number {
  return Math.min(60_000, 1000 * Math.pow(2, Math.max(0, intentos)));
}

/**
 * Bucle de envío: toma la cola PENDIENTE ordenada por qualityScore
 * DESC y la vacía mientras haya red. Cada fallo retriable reagenda
 * el intento con backoff y deja el resto intacto.
 */
export async function sincronizarAhora(opts?: { silencioso?: boolean }): Promise<{
  enviadas: number;
  pendientes: number;
}> {
  if (workerActivo) return { enviadas: 0, pendientes: -1 };
  workerActivo = true;
  let enviadas = 0;
  try {
    for (;;) {
      const cola = await obtenerColaOrdenada();
      const siguiente = cola.find((i) => RANGO_PENDIENTES.includes(i.estado));
      if (!siguiente) break;
      if (typeof navigator !== "undefined" && !navigator.onLine) break;

      await putActaCola({ ...siguiente, estado: "SUBIENDO" });
      const resultado = await puenteActivo(siguiente);

      if (resultado.ok) {
        await putActaCola({
          ...siguiente,
          estado: "SINCRONIZADA",
          syncedAt: Date.now(),
          ultimoError: undefined,
        });
        enviadas++;
        const cfg = await obtenerConfiguracion();
        await guardarConfiguracion({
          ...cfg,
          sincronizadasTotal: cfg.sincronizadasTotal + 1,
        });
        if (resultado.duplicado && !opts?.silencioso) {
          toast({
            title: "ACTA DUPLICADA DESCARTADA",
            description:
              "Esta acta física ya fue registrada previamente (huella QR).",
          });
        }
      } else if (!resultado.retriable) {
        // Rechazo de negocio: la cola no debe reintentar eternamente.
        await putActaCola({
          ...siguiente,
          estado: "ANOMALIA",
          ultimoError: resultado.error,
        });
        if (!opts?.silencioso) {
          toast({
            title: "ACTA RECHAZADA POR EL SERVIDOR",
            description: `${resultado.error} — quedó marcada para auditoría.`,
            variant: "destructive",
          });
        }
      } else {
        const intentos = siguiente.intentosSubida + 1;
        await putActaCola({
          ...siguiente,
          estado: "ERROR",
          intentosSubida: intentos,
          ultimoError: resultado.error,
        });
        // Reintento con backoff SIN bloquear la cámara: se agenda y se
        // sale del bucle (el temporizador retoma el trabajo solo).
        programarReintento(delayBackoff(intentos));
        break;
      }
    }
  } finally {
    workerActivo = false;
  }
  if (enviadas > 0 && !opts?.silencioso) {
    toast({
      title: `COLA SINCRONIZADA (${enviadas})`,
      description: `${enviadas} acta(s) enviada(s) al servidor, ordenada(s) por nitidez.`,
    });
  }
  const contadores = await obtenerContadores();
  return { enviadas, pendientes: contadores.pendientes };
}

function programarReintento(ms: number): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    void sincronizarAhora({ silencioso: true });
  }, ms);
}

/** Escucha conectividad + primer barrido (idempotente) */
let listenersInstalados = false;
export function iniciarWorkerSincronizacion(): void {
  if (listenersInstalados || typeof window === "undefined") return;
  listenersInstalados = true;
  window.addEventListener("online", () => {
    // Pequeño margen para que la red esté realmente lista
    programarReintento(1200);
  });
  window.addEventListener("offline", () => {
    if (temporizador) clearTimeout(temporizador);
  });
  // Primer barrido al arrancar (actas que quedaron de una sesión previa)
  void sincronizarAhora({ silencioso: true });
}

// ------------------------------------------------------------
// MIGRACIÓN — cola antigua en localStorage (digielect-cola-v2)
// ------------------------------------------------------------

interface ColaLegacy {
  id: string;
  payload: {
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
  };
  enqueuedAt: number;
  intentos: number;
}

/** Una sola vez por dispositivo: localStorage → IndexedDB */
export async function migrarColaLegacy(): Promise<number> {
  if (typeof window === "undefined") return 0;
  let legacy: ColaLegacy[] = [];
  try {
    legacy = JSON.parse(window.localStorage.getItem(COLA_LEGACY_KEY) ?? "[]");
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return 0;

  let migradas = 0;
  for (const l of legacy) {
    const p = l.payload;
    const score = Math.max(0, Math.min(100, Math.round((p.scoreCalidad ?? 5) * 10)));
    const item: ActaQueueItem = {
      id: l.id,
      idTransmision: p.barcode15?.slice(2, 8) ?? "",
      qrFingerprint: p.qrTexto ?? null,
      barcode15: p.barcode15 ?? undefined,
      paisDepartamento: "",
      zona: "",
      puestoCodigo: "",
      puestoNombre: "",
      mesa: 0,
      tipoActa: p.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS",
      pagina: p.pagina ?? 1,
      totalPaginas: p.totalPaginas ?? 2,
      qualityScore: score,
      sharpnessScore: score,
      contrastScore: score,
      imagenBlob: p.imagenDataUrl,
      tamanoBytes: Math.round((p.imagenDataUrl.length * 3) / 4),
      estado: "PENDIENTE",
      intentosSubida: l.intentos ?? 0,
      createdAt: l.enqueuedAt ?? Date.now(),
      mesaIdRef: p.mesaId ?? null,
      modoManual: p.modoManual ?? false,
      envioAdvertencia: p.envioAdvertencia ?? false,
    } as ActaQueueItem;
    await putActaCola(item);
    migradas++;
  }
  try {
    window.localStorage.removeItem(COLA_LEGACY_KEY);
  } catch {
    /* noop */
  }
  return migradas;
}

/** Elimina de la cola las SINCRONIZADA más viejas (higiene) */
export async function limpiarSincronizadasViejas(maxEdadMs = 24 * 3600_000): Promise<number> {
  const todos = await allActasCola();
  const corte = Date.now() - maxEdadMs;
  let borradas = 0;
  for (const i of todos) {
    if (i.estado === "SINCRONIZADA" && (i.syncedAt ?? 0) < corte) {
      await deleteActaCola(i.id);
      borradas++;
    }
  }
  return borradas;
}
