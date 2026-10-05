// ============================================================
// DIGIELECT — Cliente de API unificado
// En modo fullstack (dev / servidor) llama a las rutas /api/*.
// En modo demo estático (GitHub Pages) resuelve todo en el
// navegador con demo-store + /public/data/*.json.
// ============================================================

import type {
  ActaAnalysis,
  ActaRegistro,
  ActaUploadPayload,
  AnomaliaItem,
  AsignacionActa,
  ConsulateRow,
  QueueFileItem,
  ResumenGlobal,
  SlaRow,
  VerificacionActa,
} from "@/lib/types";
import { IS_STATIC_EXPORT } from "@/lib/env";
import {
  bootstrapEstatico,
  demoAnalizarActaCompleta,
  demoBatch,
  demoInformes,
  demoIngestarActa,
  demoResolverAnomalia,
  resetDemoState,
  vistaBootstrap,
  type InformesEstaticos,
} from "@/lib/demo-store";

// ------------------------------------------------------------
// Contratos del wire (idénticos a las respuestas de /api/*)
// ------------------------------------------------------------

export interface BootstrapWire {
  ok: boolean;
  consulados?: ConsulateRow[];
  anomalias?: AnomaliaItem[];
  queueFiles?: QueueFileItem[];
  slaRows?: SlaRow[];
  resumen?: ResumenGlobal;
  serverTime?: string;
  error?: string;
}

export interface AnalizarWire {
  ok: boolean;
  analisis?: ActaAnalysis;
  /** Cruce QR ↔ VLM ↔ bootstrap (nuevo flujo E-14) */
  verificacion?: VerificacionActa;
  /** Ubicación correcta derivada del cruce */
  asignacion?: AsignacionActa;
  error?: string;
}

export interface IngestaWire {
  ok: boolean;
  acta?: ActaRegistro;
  analisis?: ActaAnalysis;
  /** Cruce QR ↔ VLM ↔ bootstrap (nuevo flujo E-14, paridad con /api/actas/analizar) */
  verificacion?: VerificacionActa | null;
  asignacion?: AsignacionActa | null;
  decision?: {
    estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO";
    motivo: string;
  };
  anomaliaId?: string | null;
  error?: string;
}

export interface ResolverWire {
  ok: boolean;
  action?: string;
  error?: string;
}

export interface BatchWire {
  ok: boolean;
  accion?: string;
  mensaje?: string;
  error?: string;
}

export type InformesWire = InformesEstaticos & {
  generadoEn: string;
};

export interface LoginWire {
  ok: boolean;
  usuario?: string;
  rol?: string;
  error?: string;
}

// ------------------------------------------------------------
// Implementación fullstack (rutas /api/*)
// ------------------------------------------------------------

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------

/** GET /api/bootstrap — tablero completo del supervisor */
export async function apiBootstrap(): Promise<BootstrapWire> {
  if (IS_STATIC_EXPORT) {
    try {
      const vista = await vistaBootstrap();
      return { ok: true, ...vista, serverTime: new Date().toISOString() };
    } catch {
      return { ok: false, error: "No se pudieron cargar los datos demo" };
    }
  }
  const res = await fetch("/api/bootstrap", { cache: "no-store" });
  return (await res.json()) as BootstrapWire;
}

/** POST /api/actas/analizar — análisis de visión (RF-1.1) + verificación QR↔VLM */
export async function apiAnalizarActa(
  imagenBase64: string,
  qrTexto?: string | null
): Promise<AnalizarWire> {
  if (IS_STATIC_EXPORT) {
    try {
      return demoAnalizarActaCompleta(imagenBase64, qrTexto ?? null);
    } catch {
      return { ok: false, error: "Error analizando la imagen del acta" };
    }
  }
  return postJson<AnalizarWire>("/api/actas/analizar", {
    imagenBase64,
    ...(qrTexto ? { qrTexto } : {}),
  });
}

/** POST /api/actas — ingesta con reglas RN-02 / RN-03 */
export async function apiIngestarActa(
  payload: ActaUploadPayload
): Promise<IngestaWire> {
  if (IS_STATIC_EXPORT) {
    return demoIngestarActa(payload);
  }
  return postJson<IngestaWire>("/api/actas", payload);
}

/** POST /api/anomalias/resolver — modal de auditoría (RF-2.3) */
export async function apiResolverAnomalia(
  anomaliaId: string | undefined,
  action: "APROBADA" | "RESCANEO_CONFIRMADO",
  justificacion: string
): Promise<ResolverWire> {
  if (IS_STATIC_EXPORT) {
    return demoResolverAnomalia(anomaliaId ?? "", action, justificacion);
  }
  return postJson<ResolverWire>("/api/anomalias/resolver", {
    anomaliaId,
    action,
    justificacion,
  });
}

/** POST /api/batch — cola de carga masiva (RF-2.4) */
export async function apiBatch(
  fileId: string,
  action: "integrar" | "remove"
): Promise<BatchWire> {
  if (IS_STATIC_EXPORT) {
    return demoBatch(fileId, action);
  }
  return postJson<BatchWire>("/api/batch", { fileId, action });
}

/** GET /api/informes — informe consolidado */
export async function apiInformes(): Promise<InformesWire> {
  if (IS_STATIC_EXPORT) {
    return demoInformes();
  }
  const res = await fetch("/api/informes", { cache: "no-store" });
  return (await res.json()) as InformesWire;
}

/** Reinicia el estado del modo demo (solo tiene efecto en export estática) */
export function apiResetDemo(): void {
  resetDemoState();
}

/** true cuando el análisis de visión es simulado (export estática) */
export const ANALISIS_SIMULADO = IS_STATIC_EXPORT;

// ------------------------------------------------------------
// Credenciales demo (misma pareja en demo estática y en el
// backend por defecto: supervisor / digielect — ver README)
// ------------------------------------------------------------
const DEMO_USER = "supervisor";
const DEMO_PASSWORD = "digielect";

/**
 * POST /api/auth/login — acceso del Supervisor de Digitalización.
 * En demo estática valida localmente con las credenciales demo
 * (GitHub Pages no tiene backend). El digitalizador no usa login.
 */
export async function apiLogin(
  usuario: string,
  password: string
): Promise<LoginWire> {
  if (IS_STATIC_EXPORT) {
    if (
      usuario.trim().toLowerCase() === DEMO_USER &&
      password === DEMO_PASSWORD
    ) {
      return { ok: true, usuario: DEMO_USER, rol: "SUPERVISOR" };
    }
    return { ok: false, error: "Credenciales inválidas" };
  }
  return postJson<LoginWire>("/api/auth/login", { usuario, password });
}

/** Credenciales demo visibles para la presentación (usuario/clave) */
export const DEMO_CREDENCIALES = { usuario: DEMO_USER, clave: DEMO_PASSWORD } as const;
