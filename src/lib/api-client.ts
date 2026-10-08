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
  exportarSesionDemo,
  importarSesionDemo,
  resetDemoCompleto,
  vistaBootstrap,
  type InformesEstaticos,
} from "@/lib/demo-store";
import { publicarSync } from "@/lib/sync";

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
  /** [OLA5 5.1] Vida de la sesión en segundos (cookie httpOnly) */
  expiraEnSeg?: number;
  error?: string;
}

export interface SesionWire {
  ok: boolean;
  usuario?: string;
  rol?: string;
  /** ISO de expiración de la cookie de sesión */
  expiraAt?: string;
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
    // El modo demo publica hoja:ingestada desde demoIngestarActa
    // (demo-store), con el detalle del acta en el payload del evento.
    return demoIngestarActa(payload);
  }
  const json = await postJson<IngestaWire>("/api/actas", payload);
  // FASE 5 (rol B): notificar a las demás pestañas del mismo navegador
  // (en modo completo el servidor es compartido por todas ellas).
  if (json.ok && json.decision && json.decision.estado !== "RECHAZADO") {
    publicarSync(
      "hoja:ingestada",
      {
        actaId: json.acta?.id ?? "",
        mesa: payload.mesaIdRef ?? "",
        tipo: payload.tipoEjemplar,
        pagina: payload.pagina ?? 1,
        estado: json.decision.estado,
      },
      "api-client"
    );
    if (json.decision.estado === "ANOMALIA") {
      publicarSync(
        "anomalia:nueva",
        { id: json.anomaliaId ?? "", mesa: payload.mesaIdRef ?? "" },
        "api-client"
      );
    }
  }
  return json;
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

/**
 * REINICIAR DEMO (solo export estática): estado semilla en
 * localStorage + IndexedDB (hojas, cola, métricas) y aviso a las
 * demás pestañas (FASE 4 · rol B).
 */
export async function apiResetDemo(): Promise<void> {
  await resetDemoCompleto();
}

/**
 * Exporta la sesión demo completa (localStorage + IndexedDB) a un
 * string JSON portable (respaldo de la presentación, FASE 4).
 */
export async function apiExportarSesion(): Promise<string> {
  return exportarSesionDemo();
}

/**
 * Importa una sesión demo exportada (sobrescribe la actual).
 * Solo tiene efecto en el modo demo estático.
 */
export async function apiImportarSesion(
  json: string
): Promise<{ ok: boolean; error?: string }> {
  if (!IS_STATIC_EXPORT) {
    return { ok: false, error: "La importación de sesión es del modo demo" };
  }
  return importarSesionDemo(json);
}

/** true cuando el análisis de visión es simulado (export estática) */
export const ANALISIS_SIMULADO = IS_STATIC_EXPORT;

// ------------------------------------------------------------
// Notificaciones SLA del supervisor (S-12)
// ------------------------------------------------------------

export interface NotificarMesaWire {
  ok: boolean;
  notificacionId?: string;
  fase?: number;
  canal?: string;
  despachadoCol?: string;
  /** true cuando NO hay backend y el registro es solo local de demo */
  demo?: boolean;
  error?: string;
}

/**
 * POST /api/notificaciones — registra en NotificacionSla el
 * despacho manual del supervisor (botón NOTIFICAR del monitor).
 * En modo demo NO hay persistencia real: devuelve demo:true para que
 * la UI marque el toast con <DemoBadge /> (convención del plan v3).
 */
export async function apiNotificarMesa(args: {
  consuladoId: string;
  mesaId: string;
  mesaLabel: string;
}): Promise<NotificarMesaWire> {
  if (IS_STATIC_EXPORT) {
    return { ok: true, demo: true };
  }
  try {
    const res = await fetch("/api/notificaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return (await res.json()) as NotificarMesaWire;
  } catch {
    return { ok: false, error: "Error de red registrando la notificación" };
  }
}


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

/**
 * GET /api/auth/sesion — [OLA5 5.1] ¿la cookie httpOnly del
 * supervisor sigue válida? La UI la consulta al arrancar y al
 * recibir un 401 para sincronizarse con la verdad del servidor
 * (localStorage puede decir "sesión" mientras la cookie ya
 * expiró). En demo estática la sesión local es la única verdad.
 */
export async function apiSesion(): Promise<SesionWire> {
  if (IS_STATIC_EXPORT) {
    return { ok: true, usuario: DEMO_USER, rol: "SUPERVISOR" };
  }
  try {
    const res = await fetch("/api/auth/sesion", { cache: "no-store" });
    return (await res.json()) as SesionWire;
  } catch {
    return { ok: false, error: "Error de red consultando la sesión" };
  }
}

/**
 * POST /api/auth/logout — [OLA5 5.1] Expira la cookie httpOnly de
 * sesión en el servidor (las rutas mutantes exigen cookie válida).
 * Fire-and-forget tolerante a fallos: el cliente limpia su estado
 * local pase lo que pase.
 */
export async function apiLogout(): Promise<void> {
  if (IS_STATIC_EXPORT) return;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* sin red: la cookie expira sola en el servidor */
  }
}
