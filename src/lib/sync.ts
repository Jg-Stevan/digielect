// ============================================================
// DIGIELECT · Sincronización pestaña↔pestaña (FASE 5 · rol B)
// ------------------------------------------------------------
// Canal BroadcastChannel "digielect-sync" para que la ingesta del
// digitalizador (o del BATCH) en una pestaña aparezca EN VIVO en
// el Monitor del Supervisor de otra pestaña del mismo navegador.
//
// Eventos (payloads mínimos, los datos pesados van a IndexedDB):
//   · hoja:ingestada  {mesa, tipo, pagina, estado}
//   · anomalia:nueva  {id, tipo, mesa}
//   · batch:progreso  {loteId, procesadas, total}
//   · sesion:reset    {}
//
// ALCANCE EXPLÍCITO (TAREA-B §4): sincroniza pestañas del MISMO
// navegador. Multi-dispositivo real requiere el modo completo.
// Degradación silenciosa donde no exista BroadcastChannel.
// ============================================================

export const CANAL_SYNC = "digielect-sync";

export type EventoSync =
  | "hoja:ingestada"
  | "anomalia:nueva"
  | "batch:progreso"
  | "sesion:reset";

export interface MensajeSync {
  evento: EventoSync;
  /** Emisor para trazabilidad (no se usa para filtrar) */
  origen: string;
  /** Marca temporal del emisor */
  ts: number;
  payload: Record<string, unknown>;
}

let canal: BroadcastChannel | null = null;
let canalInit = false;

function obtenerCanal(): BroadcastChannel | null {
  if (canalInit) return canal;
  canalInit = true;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      canal = new BroadcastChannel(CANAL_SYNC);
    }
  } catch {
    canal = null;
  }
  return canal;
}

/**
 * Publica un evento a las demás pestañas del mismo navegador.
 * El emisor NO recibe su propio mensaje (semántica del canal),
 * así que no hay doble refresco en la pestaña que origina.
 */
export function publicarSync(
  evento: EventoSync,
  payload: Record<string, unknown> = {},
  origen = "demo-store"
): void {
  const ch = obtenerCanal();
  if (!ch) return; // Safari privado / navegadores viejos: silencio
  try {
    ch.postMessage({
      evento,
      origen,
      ts: Date.now(),
      payload,
    } satisfies MensajeSync);
  } catch {
    /* noop: nunca romper el flujo por el canal */
  }
}

/**
 * Suscribe un handler al canal. Devuelve la función de limpieza.
 * Si no hay BroadcastChannel devuelve un no-op (degradación
 * silenciosa exigida por TAREA-B §4).
 */
export function suscribirSync(
  handler: (msg: MensajeSync) => void
): () => void {
  const ch = obtenerCanal();
  if (!ch) return () => undefined;
  const listener = (ev: MessageEvent) => {
    try {
      const msg = ev.data as MensajeSync;
      if (msg && typeof msg.evento === "string") handler(msg);
    } catch {
      /* mensaje corrupto: ignorar */
    }
  };
  ch.addEventListener("message", listener);
  return () => {
    try {
      ch.removeEventListener("message", listener);
    } catch {
      /* noop */
    }
  };
}
